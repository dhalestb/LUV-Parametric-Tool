// Inserted Horizontal Plate: native planar profiles and source-roof boundary walls.
const T=require('three'),{upperTriangles}=require('./source-vertical-envelope.cjs');
const {innerProfile}=require('./source-void-field.cjs');
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
function safe(w,s){const m=s.asOriginal().simplify(1e-5).getMesh();const mesh=new w.Mesh({numProp:3,vertProperties:new Float32Array(m.vertProperties),triVerts:new Uint32Array(m.triVerts)});mesh.merge();const r=new w.Manifold(mesh);if(r.status()!=='NoError')throw Error('Plate Float32 export rejected: '+r.status());return r;}
function insertedPlateEnvelope(w,nodes,edges,letters,field){
 if(nodes.length!==9||!['L','U','V'].every(letter=>nodes.filter(n=>n.p.letter===letter).length===3))throw Error('Inserted Plate pilot requires nine letters: three L plates, three U edges and three V boundaries.');
 const M=w.Manifold,CS=w.CrossSection,clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]),bands=[],floors=[],walls=[],pockets=[],tools=[];
 const footprint=mesh=>CS.union(upperTriangles(mesh).map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero')));
 const footprints=letters.map(l=>footprint(l.mesh)),index=n=>nodes.indexOf(n),height=n=>n.p.z+field.height/2;
 const plates=nodes.filter(n=>n.p.letter==='L').sort((a,b)=>height(a)-height(b));
 for(const n of nodes){if(n.p.architecturalRole&&n.p.architecturalRole!==(n.p.letter==='L'?'terrace':'perimeter'))throw Error(n.id+': this pilot assigns L plates and U/V perimeter boundaries; edit the role explicitly.');const normal=new T.Vector3(0,0,1).applyMatrix3(new T.Matrix3().getNormalMatrix(new T.Matrix4().fromArray(n.matrix))).normalize();if(n.p.letter!=='V'&&Math.abs(normal.z)<1-1e-8)throw Error(n.id+': L plates and U edges require horizontal source faces; edit explicitly, poses were not changed.');if(n.p.letter==='V'&&Math.abs(normal.z)>1e-8)throw Error(n.id+': V boundary requires an upright source face.');}
 for(let i=0;i<plates.length;i++){const z=height(plates[i]);if(z<.75||i&&z-height(plates[i-1])<12-1e-8||i&&z-height(plates[i-1])>15+1e-8)throw Error('Plate levels require 12–15-ft spacing and room for a .75-ft plate.');}
 const nearestPlate=n=>plates.reduce((a,b)=>Math.abs(height(a)-height(n))<Math.abs(height(b)-height(n))?a:b);
 const raw=[];
 for(const n of nodes.filter(n=>n.p.letter!=='L')){
 const i=index(n),p=footprints[i],floor=nearestPlate(n),z=height(floor);let solid;
 if(n.p.letter==='U'){
  solid=p.offset(.15,'Round',2,48).extrude(2.9).translate([0,0,z-.1]);
  const inner=innerProfile(w,n),cutter=inner.cs.extrude(2.85).translate([0,0,z+.05]);
  pockets.push({source:n.id,floor:floor.id,bottomZ:z+.05,topZ:z+2.9,sourceContour:inner.sourceContour,closure:inner.closure,cutterMesh:pack(cutter.intersect(clip)),rule:'U inside contour remains an open-edged recess above its horizontal plate'});
  tools.push({id:'edge-pocket-'+n.id,source:n.id,solid:cutter,cuttingSolid:inner.cs.offset(.001,'Round',2,48).extrude(2.852).translate([0,0,z+.049])});
 }else{
  const ownIndex=Math.max(0,plates.indexOf(floor)),support=n.p.supportZ??(ownIndex?height(plates[ownIndex-1])-.75:0);
  if(!Number.isFinite(support)||support<0||support>=Math.min(...letters[i].mesh.positions.filter((_,k)=>k%3===2)))throw Error(n.id+': wall support must be below its source underside.');
  const triangles=upperTriangles(letters[i].mesh);solid=M.union(triangles.map(t=>M.hull([...t,...t.map(q=>[q[0],q[1],support])])));
  walls.push({source:n.id,supportZ:support,upperTriangles:triangles,rule:'vertical boundary down from actual V upper surfaces to the previous plate support'});
 }
 raw.push({node:n,solid:solid.intersect(clip),floor});
 }
 for(const n of plates){const z=height(n),base=footprints[index(n)].offset(.5,'Round',2,48),anchor=base.toPolygons()[0][0],parts=[base],sources=[n.id],links=[];
 for(const boundary of raw){const b=boundary.solid.boundingBox();if(b.min[2]>=z||b.max[2]<=z-.75)continue;
 const target=footprints[index(boundary.node)].toPolygons()[0][0];parts.push(CS.hull([CS.circle(1.2,32).translate(anchor),CS.circle(1.2,32).translate(target)]));if(boundary.node.p.letter==='U')parts.push(footprints[index(boundary.node)].offset(.15,'Round',2,48));sources.push(boundary.node.id);links.push({source:boundary.node.id,from:anchor,to:target,width:2.4});}
 const solid=CS.union(parts).extrude(.75).translate([0,0,z-.75]).intersect(clip),id='plate-'+n.id;
 bands.push({id,owner:n.id,sources,solid});floors.push({id,source:n.id,topZ:z,bottomZ:z-.75,thickness:.75,sourceContour:n.line.map(p=>p.toArray()),links});
 }
 for(const item of raw){const contacts=bands.filter(b=>b.solid.intersect(item.solid).volume()>1e-6).map(b=>b.owner);if(!contacts.length)throw Error(item.node.id+': boundary has no geometric plate contact.');bands.push({id:'boundary-'+item.node.id,owner:item.node.id,sources:[item.node.id,...contacts],solid:item.solid});}
 const primary=M.union(bands.map(b=>b.solid));let solid=primary;const operations=[];
 for(const tool of [...tools]){const next=solid.subtract(tool.cuttingSolid),removed=solid.volume()-next.volume();if(removed>1e-6){tool.removed=removed;solid=next;operations.push({id:tool.id,sources:[tool.source],feature:'actual U inner contour',kind:'open edge recess',profile:'source U channel',width:0,height:2.85,depth:0,bayDepth:0,alcove:false});}else tools.splice(tools.indexOf(tool),1);}
 for(const band of bands){for(const tool of tools)band.solid=band.solid.subtract(tool.cuttingSolid);band.solid=safe(w,band.solid);if(band.solid.volume()<=0)throw Error(band.id+': fully removed.');}
 solid=safe(w,solid);if(solid.decompose().length!==1)throw Error('Inserted Plate envelope is disconnected: '+JSON.stringify(solid.decompose().map(s=>s.volume())));
 for(const pocket of pockets){const m=pocket.cutterMesh,cutter=new M(new w.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)}));if(Math.abs(solid.intersect(cutter).volume())>1e-8)throw Error(pocket.source+': U edge recess obstructed.');}
 for(const wall of walls)wall.contacts=floors.map(f=>({floor:f.id,volume:bands.find(b=>b.owner===wall.source).solid.intersect(bands.find(b=>b.id===f.id).solid).volume()}));
 return {bands,primary,solid,tools,projections:[],report:{before:primary.volume(),after:solid.volume(),removed:primary.volume()-solid.volume(),added:0,components:1,overhangs:0,addedProjections:0,operations},boundaryReport:{typology:'Inserted Horizontal Plate',floors,walls,pockets,limitations:['Nine-letter pilot. Connections are geometric plate links, not verified circulation or structural supports.','L defines planar plates; U defines open edge recesses; upright V defines vertical boundaries.','No automatic source repositioning, tilt changes, volumetric sampling or height stretching.']}};
}
module.exports={insertedPlateEnvelope};
