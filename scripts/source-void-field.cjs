// Void Field Gathering: XY source concavities develop along global Z.
// Analytical profiles/lofts and exact Boolean subtraction. No sampled mass columns.
const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const {upperTriangles,heightAt,roleFor}=require('./source-vertical-envelope.cjs');
function pack(s){const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};}
function floatSafe(w,solid){
 const mesh=solid.asOriginal().simplify(1e-5).getMesh(),p=[],ix=[],map=new Map(),remap=[];
 for(let i=0;i<mesh.vertProperties.length;i+=3){const q=Array.from(mesh.vertProperties.slice(i,i+3),Math.fround),key=q.join(',');if(!map.has(key)){map.set(key,p.length/3);p.push(...q);}remap.push(map.get(key));}
 for(let i=0;i<mesh.triVerts.length;i+=3){const t=Array.from(mesh.triVerts.slice(i,i+3),j=>remap[j]);if(new Set(t).size<3)continue;const [a,b,c]=t.map(j=>new T.Vector3().fromArray(p,j*3));if(b.sub(a).cross(c.sub(a)).lengthSq()===0)continue;ix.push(...t);}
 const mesh32=new w.Mesh({numProp:3,vertProperties:new Float32Array(p),triVerts:new Uint32Array(ix)});mesh32.merge();const result=new w.Manifold(mesh32);if(result.status()!=='NoError')throw Error('Void field Float32 export failed: '+result.status());return result;
}
function innerProfile(w,node){
 const shape=getLetterShape(node.p.letter),range={L:[2,4],U:[5,9],V:[1,3]}[node.p.letter];
 const samples=shape.getPoints(16),center=new T.Box2().setFromPoints(samples).getCenter(new T.Vector2()),matrix=new T.Matrix4().fromArray(node.matrix);
 const points=featurePoints({curves:shape.curves.slice(...range)},node.p.scale*Math.max(node.p.scaleX,node.p.scaleY));
 const original=points.map(p=>new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(matrix).toArray());
 const closed=[...original];
 // L's missing quadrant is bounded by its two real inner edges and their outer
 // tip extents. U and V close only across their actual channel/notch mouths.
 if(node.p.letter==='L')closed.push(new T.Vector3(points[0].x-center.x,points.at(-1).y-center.y,0).applyMatrix4(matrix).toArray());
 const cs=new w.CrossSection([closed.map(p=>p.slice(0,2))],'NonZero');
 if(cs.isEmpty()||cs.area()<.2)throw Error(node.id+': unresolved or degenerate projected inner contour. Source pose retained.');
 const anchor=cs.bounds();const origin=[(anchor.min[0]+anchor.max[0])/2,(anchor.min[1]+anchor.max[1])/2];
 return {cs,origin,sourceContour:original,closedContour:closed,closure:{rule:node.p.letter==='L'?'inner-edge missing quadrant, closed at actual arm-tip extents':'chord between actual inner mouth endpoints',addedEdges:node.p.letter==='L'?[original.at(-1),closed.at(-1),original[0]]:[original.at(-1),original[0]]}};
}
function voidFieldEnvelope(w,nodes,edges,letters,field,preferred,config={}){
 const M=w.Manifold,CS=w.CrossSection;
 if(nodes.length!==9)throw Error('Void Field review stage requires exactly nine source letters. Twelve-letter expansion is pending review.');
 if(config.profileMode!==undefined&&!['straight','neighbor-taper'].includes(config.profileMode))throw Error('Unknown Void Field profile mode.');
 if(config.connectivity!==undefined&&!['adjacent','none'].includes(config.connectivity))throw Error('Unknown Void Field connection mode.');
 if(config.atriumBoundary!==undefined&&!['open','enclosed'].includes(config.atriumBoundary))throw Error('Unknown atrium boundary mode.');
 if(config.facadeMode!==undefined&&!['vertical','face-normal'].includes(config.facadeMode))throw Error('Unknown facade sweep mode.');
 const strength=config.taper??.35;
 if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Void taper must be between 0 and 1.');
 const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 const roles=nodes.map(n=>roleFor(n,nodes)),interiors=nodes.filter((n,i)=>roles[i]==='interior');
 if(interiors.length<2)throw Error('Select at least two interior void sources with Edit Letters.');
 const occupied=nodes.filter((n,i)=>roles[i]!=='interior');
 if(!occupied.length)throw Error('Void Field requires surrounding occupied/enclosure sources.');
 const footprint=mesh=>CS.union(upperTriangles(mesh).map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero')));
 const footprints=letters.map(l=>footprint(l.mesh));
 const support=config.bottomZ??0;
 const highest=Math.max(...letters.flatMap(l=>l.mesh.positions.filter((_,i)=>i%3===2)));
 const top=config.topZ??Math.min(field.height,highest+preferred*.15);
 if(!Number.isFinite(support)||!Number.isFinite(top)||support<0||top>field.height||top-support<2)throw Error('Void extent must fit the field and span at least two feet.');
 const entries=interiors.map(n=>({node:n,...innerProfile(w,n)})).sort((a,b)=>b.cs.area()-a.cs.area());
 if(config.primarySource){const index=entries.findIndex(e=>e.node.id===config.primarySource);if(index<0)throw Error('Primary void source is not classified interior.');entries.unshift(...entries.splice(index,1));}
 const facadeSolids=[];
 const bands=[],tools=[],voids=[],walls=[],floorRecords=[],connections=[],thickness=.85,floorThickness=.75;
 const neighbors=id=>{const i=nodes.findIndex(n=>n.id===id);return edges.filter(e=>e.i===i||e.j===i).map(e=>nodes[e.i===i?e.j:e.i].id);};
 const add=(id,owner,solid,sources)=>{if(!solid.isEmpty())bands.push({id,owner,sources:[...new Set([owner,...sources].filter(Boolean))],solid:solid.intersect(clip)});};
 // Floor levels are measured from surrounding source undersides, grouped by lift.
 const levels=[...new Set(['lower','middle','top'].map(lift=>{
  const group=occupied.filter(n=>n.p.lift===lift);if(!group.length)return undefined;
  return Math.max(support+.75,group.reduce((sum,n)=>sum+n.p.z+field.height/2,0)/group.length-1);
 }).filter(z=>z!==undefined&&z<top-.8))].sort((a,b)=>a-b);
 if(!levels.length)throw Error('No occupied horizontal levels fit the void extent.');
 // Narrow adjacency strips join actual source footprints, not a bounding block.
 const strips=edges.map(e=>CS.hull([CS.circle(1.4,32).translate([nodes[e.i].p.x,nodes[e.i].p.y]),CS.circle(1.4,32).translate([nodes[e.j].p.x,nodes[e.j].p.y])]));
 const floorPlan=CS.union([...footprints.map(p=>p.offset(.9,'Round',2,48)),...strips]);
 for(const [i,z] of levels.entries()){
  const slab=floorPlan.extrude(floorThickness).translate([0,0,z-floorThickness]);
  add('occupied-level-'+(i+1),null,slab,nodes.map(n=>n.id));
  floorRecords.push({id:'occupied-level-'+(i+1),bottomZ:z-floorThickness,topZ:z,thickness:floorThickness,sourceIds:occupied.map(n=>n.id)});
 }
 // Local source platforms preserve each outer outline at its own measured level.
 for(const [i,node] of nodes.entries()){
  if(roles[i]==='interior')continue;
  const triangles=upperTriangles(letters[i].mesh),low=Math.min(...letters[i].mesh.positions.filter((_,k)=>k%3===2));
  const wallSupport=node.p.supportZ??support;
  if(!Number.isFinite(wallSupport)||wallSupport<0||wallSupport>=low)throw Error(node.id+': wall support must be below the source underside.');
  const plateZ=Math.max(wallSupport+.75,low);
  const parts=[footprints[i].offset(.9,'Round',2,48).extrude(.75).translate([0,0,plateZ-.75])];
  if(roles[i]==='perimeter'){
   const focus=interiors.reduce((p,n)=>[p[0]+n.p.x/interiors.length,p[1]+n.p.y/interiors.length],[0,0]),selected=[],wallStrips=[];
   for(const polygon of footprints[i].toPolygons()){
    const area=polygon.reduce((sum,a,k)=>{const b=polygon[(k+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0);if(area<=0)continue;
    for(let k=0;k<polygon.length;k++){const a=polygon[k],b=polygon[(k+1)%polygon.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.01)continue;const normal=[(b[1]-a[1])/length,(a[0]-b[0])/length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
     if(!polygon.every(p=>(p[0]-mid[0])*normal[0]+(p[1]-mid[1])*normal[1]<1e-5)||(mid[0]-focus[0])*normal[0]+(mid[1]-focus[1])*normal[1]<0)continue;
     selected.push({a,b,normal});wallStrips.push(CS.hull([CS.circle(.85,32).translate(a),CS.circle(.85,32).translate(b)]));
    }
   }
   if(!wallStrips.length)throw Error(node.id+': no exterior supporting boundary. Change role or pose.');
   const plan=CS.union(wallStrips).intersect(footprints[i]);
   const native=config.facadeMode==='face-normal'?require('./source-face-normal-facade.cjs').faceNormalWall(w,node,triangles,field,wallSupport,clip,focus):null;
   // Horizontal source normals use the identical global-Z Boolean construction to avoid roundoff.
   const wall=(native&&Math.hypot(native.report.normal[0],native.report.normal[1])>1e-12?native.wall:null)??M.union(triangles.map(t=>M.hull([...t,...t.map(p=>[p[0],p[1],wallSupport])]))).intersect(plan.extrude(top-wallSupport).translate([0,0,wallSupport]));
   facadeSolids.push({source:node.id,solid:wall});
   parts.push(wall);walls.push({...native?.report,mode:native?'face-normal':'vertical',source:node.id,supportZ:wallSupport,segments:selected,upperTriangles:triangles,probes:selected.map(s=>{const xy=[(s.a[0]+s.b[0])/2-s.normal[0]*.1,(s.a[1]+s.b[1])/2-s.normal[1]*.1];return {xy,...heightAt(triangles,...xy)};}),mesh:pack(wall)});
  }
  add('source-envelope-'+node.id,node.id,M.union(parts),neighbors(node.id));
 }
 for(const [i,entry] of entries.entries()){
  const {cs,origin,node}=entry,near=entries.filter(e=>e!==entry).sort((a,b)=>Math.hypot(a.origin[0]-origin[0],a.origin[1]-origin[1])-Math.hypot(b.origin[0]-origin[0],b.origin[1]-origin[1]))[0];
  // A dimensionless measured area relationship sets one bounded homothetic taper.
  const relationship=Math.max(-.20,Math.min(.20,(Math.sqrt(near.cs.area()/cs.area())-1)*.25));
  const delta=config.profileMode==='straight'?0:strength*relationship;
  const sourceZ=node.p.z+field.height/2;
  const at=z=>1+delta*(z-sourceZ)/(top-support);
  const lo=support-.05,hi=top+.05,s0=at(lo),s1=at(hi);
  const local=cs.translate([-origin[0],-origin[1]]);
  const loft=(profile,a=lo,b=hi)=>profile.scale(at(a)).extrude(b-a,0,0,[at(b)/at(a),at(b)/at(a)]).translate([origin[0],origin[1],a]);
  const cutter=loft(local);entry.development={at,local,loft,cutter};entry.fieldHeight=field.height;
  const ring=loft(local.offset(thickness,'Round',2,64));
  const solids=[ring];
  // Source-shaped rims tie into horizontal floor domains. Cutter remains protected.
  for(const z of levels)solids.push(cs.offset(thickness+1.2,'Round',2,64).extrude(.75).translate([0,0,z-.75]));
  add('void-rim-'+node.id,node.id,M.union(solids),[near.node.id,...neighbors(node.id)]);
  const tool={id:'void-'+node.id,source:node.id,solid:cutter,cuttingSolid:loft(local.offset(.001,'Round',2,64)),alcove:false,width:Math.sqrt(cs.area()),height:hi-lo,depth:hi-lo};
  tools.push(tool);
  voids.push({source:node.id,sourcePose:node.p,sourceMatrix:node.matrix,sourceContour:entry.sourceContour,closedContour:entry.closedContour,closure:entry.closure,axis:[0,0,1],yaw:node.p.rz,tilt:node.p.rx,profile:node.p.letter+' plan concavity developed along Z',hierarchy:i===0?'primary':'secondary',area:cs.area(),origin,sourceZ,extent:[lo,hi],scaleBottom:s0,scaleTop:s1,taperDelta:delta,taperRelationship:{neighbor:near.node.id,areaRatio:near.cs.area()/cs.area(),rule:'bounded quarter of square-root area ratio difference, multiplied by taper strength'},nominalMinimumRimThickness:thickness*Math.min(s0,s1)-.001,floors:floorRecords.filter(f=>f.topZ>=lo&&f.bottomZ<=hi).map(f=>f.id),cutterMesh:pack(cutter.intersect(clip)),alcove:false});
 }
 // Adjacent voids connect only in inter-floor intervals. Floor plates stay intact.
 if(config.connectivity!=='none'){
  const connected=new Set([0]),remaining=new Set(entries.slice(1).map((_,i)=>i+1));
  while(remaining.size){let best;for(const i of connected)for(const j of remaining){const a=entries[i].origin,b=entries[j].origin,d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(!best||d<best.d)best={i,j,d};}
   remaining.delete(best.j);connected.add(best.j);
   const a=entries[best.i],b=entries[best.j],plan=CS.hull([CS.circle(.9,48).translate(a.origin),CS.circle(.9,48).translate(b.origin)]);
   for(let k=0;k<levels.length-1;k++){const bottom=levels[k]+.15,ceiling=levels[k+1]-.95;if(ceiling-bottom<1)continue;
    const solid=plan.extrude(ceiling-bottom).translate([0,0,bottom]),id='connection-'+a.node.id+'-'+b.node.id+'-'+k;
    tools.push({id,source:a.node.id,solid,cuttingSolid:plan.offset(.001,'Round',2,48).extrude(ceiling-bottom+.002).translate([0,0,bottom-.001]),alcove:false});
    connections.push({id,sources:[a.node.id,b.node.id],bottomZ:bottom,topZ:ceiling,width:1.8,rule:'nearest unconnected source-profile centers; between floor slabs',circulationVerified:false});
   }
  }
 }
 const atrium=config.atriumBoundary==='open'?require('./source-atrium-openings.cjs').buildAtriumBays(w,entries[0],occupied,floorRecords,top):null;
 if(atrium)tools.push(...atrium.tools);
 const primary=M.union(bands.map(b=>b.solid));
 let solid=primary;const operations=[];
 for(const tool of [...tools]){
  const next=solid.subtract(tool.cuttingSolid);tool.removed=solid.volume()-next.volume();
  if(tool.removed<1e-6&&tool.id.startsWith('atrium-')){atrium.records.find(c=>c.id===tool.id).status='already open after preceding source cuts';tools.splice(tools.indexOf(tool),1);continue;}
  if(tool.removed<1e-6&&tool.id.startsWith('connection-')){connections.find(c=>c.id===tool.id).status='already open after source void subtraction';tools.splice(tools.indexOf(tool),1);continue;}
  if(tool.removed<1e-6)throw Error(tool.id+': void does not remove architectural material. Adjust source adjacency.');
  const record=voids.find(v=>v.source===tool.source&&tool.id==='void-'+v.source);
  if(record){record.removedMesh=pack(solid.intersect(tool.cuttingSolid));record.removedVolume=tool.removed;}
  operations.push({id:tool.id,sources:[tool.source],feature:'actual source concavity',kind:tool.id.startsWith('atrium-')?'floor-facing atrium bay':tool.id.startsWith('connection')?'inter-void connection':'vertical canyon void',profile:'source plan contour',width:tool.width??1.8,height:tool.height??0,depth:tool.depth??0,bayDepth:0,alcove:false,removed:tool.removed});solid=next;
 }
 solid=floatSafe(w,solid);
 for(const band of bands){for(const tool of tools)band.solid=band.solid.subtract(tool.cuttingSolid);band.solid=floatSafe(w,band.solid);if(band.solid.isEmpty())throw Error(band.id+': source contribution completely removed.');}
 for(const tool of tools)if(Math.abs(solid.intersect(tool.solid).volume())>1e-8)throw Error(tool.id+': protected void obstructed after export.');
 if(solid.decompose().length!==1)throw Error('Void field envelope is disconnected: '+JSON.stringify(solid.decompose().map(s=>s.volume())));
 for(const facade of facadeSolids){let remaining=facade.solid;for(const tool of tools)remaining=remaining.subtract(tool.cuttingSolid);const record=walls.find(w=>w.source===facade.source);record.finalMesh=pack(remaining);record.finalVolume=remaining.volume();record.floorContacts=floorRecords.map(f=>({floor:f.id,volume:remaining.intersect(bands.find(b=>b.id===f.id).solid).volume()}));}
 const visibility=atrium?require('./source-atrium-openings.cjs').validateAtriumViews(w,solid,entries[0],floorRecords,atrium,field):undefined;
 return {bands,primary,solid,tools,projections:[],report:{before:primary.volume(),after:solid.volume(),removed:primary.volume()-solid.volume(),added:0,components:1,overhangs:0,addedProjections:0,operations},boundaryReport:{facadeMode:config.facadeMode??'vertical',atriumBoundary:config.atriumBoundary??'enclosed',atriumOpenings:atrium?.records,visibility,typology:'Void Field Gathering',walls,voids,connections,floors:floorRecords,roles:nodes.map((n,i)=>({source:n.id,role:roles[i]})),ambiguities:[],minimumWallThickness:thickness,profileTolerance:.01,extent:[support,top],limitations:['Geometric connections only; circulation dimensions and occupancy are not verified.','Homothetic source-related taper only. Profile shifts, splits and merges are deferred.','Nine-letter review stage. Final local thickness and usable circulation are not certified.']}};
}
module.exports={voidFieldEnvelope,innerProfile};
