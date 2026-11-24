// Compute the gold presentation overlay from the saved architectural solid.
const fs=require('node:fs');
async function clearance(study){
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const surfaces=study.galleryReport?.surfaces??[],parts=new Map(study.components.map(c=>[c.id,c.mesh]));
 const solid=mesh=>{const m=new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)});m.merge();return new w.Manifold(m);};
 const form=solid(study.architecture),levels=new Map(),mid=study.request.field.height/2;
 for(const s of surfaces){
  if(s.kind!=='connection'&&!(s.kind==='roof-plank'&&s.zone==='lower'))continue;
  const z=s.top,mesh=parts.get(s.id);if(!mesh)continue;
  const plan=solid(mesh).slice(z-.001);
  levels.set(z,levels.has(z)?levels.get(z).add(plan):plan);
 }
 const floor=surfaces.find(s=>s.kind==='contour-floor'&&s.zone==='upper');
 const upper=floor&&parts.has(floor.id)?solid(parts.get(floor.id)).project():null;
 const output=[];
 for(const [z,surface] of levels){
  const obstruction=form.trimByPlane([0,0,1],z+.001).trimByPlane([0,0,-1],-(z+7)).project();
  let clear=surface.subtract(obstruction);
  if(upper&&Math.abs(z-mid)<.01)clear=clear.subtract(upper);
  // A three-foot-diameter clearance disk must fit entirely on the surface.
  const centers=clear.offset(-1.5,'Round');
  if(centers.isEmpty())continue;
  const area=centers.offset(1.5,'Round').intersect(clear);
  const m=area.extrude(.008).translate([0,0,z+.003]).getMesh();
  output.push({positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)});
 }
 return output;
}
if(require.main===module)clearance(JSON.parse(fs.readFileSync(0,'utf8'))).then(a=>process.stdout.write(JSON.stringify(a))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={clearance};
