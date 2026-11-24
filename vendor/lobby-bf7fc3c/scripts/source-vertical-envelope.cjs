// Experimental Stepped Amphitheater: global-Z walls, source-surface roofs,
// horizontal plates and independent plan-oriented, through-field voids.
const T=require('three');


const EPS=1e-8;
function upperTriangles(mesh){
 const out=[];
 for(let i=0;i<mesh.indices.length;i+=3){
  const tri=[0,1,2].map(k=>new T.Vector3().fromArray(mesh.positions,mesh.indices[i+k]*3));
  const normal=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
  if(normal.z>EPS)out.push(tri.map(p=>p.toArray()));
 }
 return out;
}
function heightAt(triangles,x,y,tolerance=EPS){
 const heights=[];
 for(const [a,b,c] of triangles){
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
  if(u>=-tolerance&&v>=-tolerance&&u+v<=1+tolerance)heights.push(u*a[2]+v*b[2]+(1-u-v)*c[2]);
 }
 const unique=[...new Set(heights.map(z=>Math.round(z*1e7)/1e7))];
 return {height:Math.max(...heights),surfaces:unique.length};
}
function roleFor(node,nodes){
 if(node.p.architecturalRole)return node.p.architecturalRole;
 // A source center is perimeter only if it lies on a supporting line of the
 // population's XY convex hull. Coincident/collinear cases are reported below.
 const point=new T.Vector2(node.p.x,node.p.y);
 for(const other of nodes){const d=new T.Vector2(other.p.x,other.p.y).sub(point);if(d.length()<EPS)continue;
  const signs=nodes.map(n=>d.x*(n.p.y-point.y)-d.y*(n.p.x-point.x));
  if(signs.every(s=>s>=-EPS)||signs.every(s=>s<=EPS))return 'perimeter';
 }
 return 'interior';
}
function verticalEnvelope(w,nodes,edges,letters,field,preferred){
 const M=w.Manifold,CS=w.CrossSection,clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 const pendingOpenings=[],bands=[],tools=[],walls=[],voids=[],ambiguities=[];
 function floatSafe(solid){
  // Remove coplanar Boolean run seams before conversion to Float32.
  const mesh=solid.asOriginal().simplify(1e-5).getMesh(),p=[],ix=[],map=new Map(),remap=[];
  for(let i=0;i<mesh.vertProperties.length;i+=3){const q=Array.from(mesh.vertProperties.slice(i,i+3),Math.fround),key=q.join(',');if(!map.has(key)){map.set(key,p.length/3);p.push(...q);}remap.push(map.get(key));}
  for(let i=0;i<mesh.triVerts.length;i+=3){const t=Array.from(mesh.triVerts.slice(i,i+3),j=>remap[j]);if(new Set(t).size<3)continue;const [a,b,c]=t.map(j=>new T.Vector3().fromArray(p,j*3));if(b.sub(a).cross(c.sub(a)).lengthSq()===0)continue;ix.push(...t);}
  const mesh32=new w.Mesh({numProp:3,vertProperties:new Float32Array(p),triVerts:new Uint32Array(ix)});mesh32.merge();const result=new M(mesh32);if(result.status()!=='NoError')throw Error('Float32-safe wall export failed: '+result.status());return result;
 }
 const focus=nodes.reduce((a,n)=>[a[0]+n.p.x/nodes.length,a[1]+n.p.y/nodes.length],[0,0]);
 const neighbors=i=>edges.filter(e=>e.i===i||e.j===i).map(e=>nodes[e.i===i?e.j:e.i].id);
 for(const [index,node] of nodes.entries()){
  const role=roleFor(node,nodes),triangles=upperTriangles(letters[index].mesh),support=node.p.supportZ??0;
  if(!['perimeter','interior','terrace'].includes(role))throw Error('Invalid architectural role: '+node.id);
  if(!Number.isFinite(support)||support<0||support>=field.height)throw Error('Invalid support Z for '+node.id);
  const footprint=CS.union(triangles.map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero')));
  const low=Math.min(...letters[index].mesh.positions.filter((_,i)=>i%3===2));
  if(support>=low-.1)throw Error(node.id+': supporting elevation must be below the source underside.');
  const plateBottom=Math.max(support,low-.75),plate=footprint.offset(.8,'Round',2,32).extrude(.75).translate([0,0,plateBottom]);
  const parts=[plate];
  // A pair of source-shaped setbacks connects a perimeter terrace to the lower bank.
  // Retain the original thin plate for studies saved before opening roles were introduced.
  if(role!=='interior' && nodes.some(n=>n.p.voidKind)){
   const rise=Math.min(preferred*.12,(plateBottom-support)/3);
   for(let tier=1;tier<=2 && rise>.05;tier++){
    const top=plateBottom-(tier-1)*rise+.04;
    const base=footprint.offset(.8+tier*preferred*.075,'Round',2,32);
    const baseZ=node.p.lift&&node.p.lift!=='lower'?Math.max(support,top-preferred*.45):support;
    parts.push(base.extrude(top-baseZ).translate([0,0,baseZ]));
   }
  }
  if(role==='perimeter'){
   const strips=[],selected=[];
   for(const polygon of footprint.toPolygons()){
    const area=polygon.reduce((s,p,i)=>{const q=polygon[(i+1)%polygon.length];return s+p[0]*q[1]-q[0]*p[1];},0);if(area<=0)continue;
    for(let i=0;i<polygon.length;i++){
     const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.01)continue;
     const normal=[dy/length,-dx/length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
     const exterior=polygon.every(p=>(p[0]-mid[0])*normal[0]+(p[1]-mid[1])*normal[1]<1e-5);
     if(!exterior||(mid[0]-focus[0])*normal[0]+(mid[1]-focus[1])*normal[1]<-EPS)continue;
     strips.push(CS.hull([CS.circle(.9,32).translate(a),CS.circle(.9,32).translate(b)]));selected.push({a,b,normal});
    }
   }
   if(!strips.length)throw Error(node.id+': no unambiguous exterior-facing supporting boundary; assign a different role or adjust the source.');
   const plan=CS.union(strips).intersect(footprint);
   // Union of vertical triangular prisms gives the highest actual upward-facing
   // source surface at each XY. It includes source bevel/side triangles and does
   // not replace the changing source elevation by a single horizontal cap.
   const prisms=triangles.map(t=>M.hull([...t,...t.map(p=>[p[0],p[1],support])]));
   const curtain=M.union(prisms).intersect(plan.extrude(field.height-support).translate([0,0,support])).intersect(clip);
   parts.push(curtain);
   const probes=selected.map(s=>{const p=[(s.a[0]+s.b[0])/2-s.normal[0]*.15,(s.a[1]+s.b[1])/2-s.normal[1]*.15];return {xy:p,...heightAt(triangles,...p)};}).filter(p=>Number.isFinite(p.height));
   const multiple=probes.filter(p=>p.surfaces>1).length;
   if(multiple)ambiguities.push({source:node.id,kind:'multiple upper surfaces',resolution:'highest upward-facing source surface by global-Z union',probes:multiple});
   walls.push({source:node.id,supportZ:support,supportRule:node.p.supportZ===undefined?'explicit default: field floor Z=0':'user-selected horizontal support',segments:selected,probes,upperTriangles:triangles,mesh:(()=>{const m=curtain.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};})()});
  }else if(role==='interior'){
   const yaw=((node.p.rz%360)+360)%360;
   const upright=Math.abs(node.p.rx-90)<EPS&&Math.abs(node.p.ry)<EPS&&node.p.rotationOrder==='ZYX';
   if(!upright&&(Math.abs(node.p.rx)>EPS||Math.abs(node.p.ry)>EPS||![75,90,105].some(v=>Math.abs(v-yaw)<EPS)))throw Error(node.id+': interior sources must be horizontal, with plan yaw 75, 90 or 105 degrees. Existing poses were not changed.');
   pendingOpenings.push({node,plateBottom});
  }
  if(!node.p.architecturalRole)ambiguities.push({source:node.id,kind:'automatic role',resolution:role+' from source-center XY convex hull; editable architecturalRole overrides'});
  bands.push({id:'contour-'+node.id,owner:node.id,sources:[node.id,...neighbors(index)],solid:M.union(parts).intersect(clip)});
 }
 // Retain graph connections as horizontal stepped runs, with vertical risers.
 // A common bearing elevation is explicit here; these are geometric links,
 // not verified circulation or access routes.
 for(const edge of edges){
  const a=edge.q.toArray(),b=edge.s.toArray(),count=Math.max(1,Math.ceil(Math.abs(a[2]-b[2])/1.5)),parts=[];
  for(let k=0;k<count;k++){
   const t=(k+.5)/count,p=a.map((v,i)=>v+(b[i]-v)*t),length=Math.hypot(b[0]-a[0],b[1]-a[1])/count+3;
   const top=Math.max(.75,p[2]),yaw=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
   parts.push(M.cube([length,3,top]).translate([-length/2,-1.5,0]).rotate([0,0,yaw]).translate([p[0],p[1],0]));
  }
  bands.push({id:'transition-'+(bands.length+1),sources:[nodes[edge.i].id,nodes[edge.j].id],solid:M.union(parts).intersect(clip)});
 }
 let bearing=M.union(bands.map(b=>b.solid));
 for(const {node,plateBottom} of pendingOpenings){
  const opening=require('./experimental-opening-profile.cjs').localOpening(w,node,field,plateBottom,bearing);
  if(opening.host){
   const host=opening.host.intersect(clip),band=bands.find(b=>b.owner===node.id);
   band.solid=band.solid.add(host);
   bearing=bearing.add(host);
  }
  tools.push(opening.tool);
  voids.push(opening.report);
 }
 const primary=bearing.simplify(1e-5);let solid=primary;
 const operations=[];
 for(const tool of tools){const next=solid.subtract(tool.cuttingSolid),removed=solid.volume()-next.volume();if(removed<1e-6)throw Error(tool.id+': source void does not intersect the envelope. Adjust the interior source position or elevation.');tool.removed=removed;
  const attribution=voids.find(v=>v.source===tool.source);
  if(attribution.sourceContour){
   const pack=s=>{const mesh=s.getMesh();return {positions:Array.from(mesh.vertProperties),indices:Array.from(mesh.triVerts)};};
   attribution.cutterMesh=pack(tool.solid.intersect(clip));
   attribution.removedMesh=pack(solid.intersect(tool.cuttingSolid));
   attribution.removedVolume=removed;
  }
  if(!tool.alcove){
   const contact=solid.intersect(tool.solid).getMesh().vertProperties;
   let min=Infinity,max=-Infinity;
   const axis=voids.find(v=>v.source===tool.source).axis;
   for(let i=0;i<contact.length;i+=3){const d=contact[i]*axis[0]+contact[i+1]*axis[1];min=Math.min(min,d);max=Math.max(max,d);}
   tool.depth=max-min;
  }
  operations.push({id:tool.id,sources:[tool.source],feature:'inner source contour',kind:tool.alcove?'recessed alcove':'directional through void',profile:'closed inner contour',width:tool.width,height:tool.height,depth:tool.depth,bayDepth:tool.depth,alcove:tool.alcove,removed});solid=next;}
 for(const band of bands)for(const tool of tools)band.solid=band.solid.subtract(tool.cuttingSolid);
 solid=floatSafe(solid);
 for(const band of bands)band.solid=floatSafe(band.solid);
 for(const tool of tools)if(solid.intersect(tool.solid).volume()>1e-8||solid.rayCast(tool.start,tool.end).length!==0)throw Error('Directional void obstructed: '+tool.id);
 for(const tool of tools.filter(t=>t.checks)){
  const approachObstruction=Math.abs(solid.intersect(tool.approach).volume());
  if(!Number.isFinite(approachObstruction)||approachObstruction>1e-8){
   throw Error(tool.id+': geometry obstructs the full source-shaped approach to the alcove ('+approachObstruction+' cubic feet). Adjust the source or intersecting bay.');
  }
  const opening=voids.find(v=>v.source===tool.source);
  opening.approach={testedVolumeFt3:tool.approach.volume(),obstructionFt3:approachObstruction};
  for(const name of ['backing','soffit']){
   if(tool[name].subtract(solid).volume()>1e-8)throw Error(tool.id+': '+name+' is incomplete across the recessed bay.');
  }
  for(const [part,p] of Object.entries(tool.checks)){
   const witness=M.cube([.02,.02,.02],true).translate(p);
   if(witness.subtract(solid).volume()>1e-9)throw Error(tool.id+': missing '+part+' at final alcove probe.');
  }
 }
 if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('Vertical envelope is disconnected or contains unintended cavities; adjust source/support/void relationships. Shell volumes: '+JSON.stringify(solid.decompose().map(s=>s.volume())));
 return {bands,primary,solid,tools,projections:[],report:{before:primary.volume(),after:solid.volume(),removed:primary.volume()-solid.volume(),added:0,components:1,overhangs:0,addedProjections:0,operations},boundaryReport:{walls,voids,ambiguities,focus}};
}
module.exports={verticalEnvelope,upperTriangles,heightAt,roleFor};
