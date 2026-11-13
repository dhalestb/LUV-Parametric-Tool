const fs=require('fs'),assert=require('assert/strict'),T=require('three'),Module=require('module');
require('../proof/rule-amphitheater.cjs');
const {derive}=require('./source-envelope.cjs'),{getLetterShape}=require('../src/components/letterGeometry3d.ts');
const rm=new Module(require.resolve('../proof/render.cjs'));rm.paths=module.paths;rm._compile(fs.readFileSync(require.resolve('../proof/render.cjs'),'utf8').replace('W=520,H=360','W=1560,H=1080'),require.resolve('../proof/render.cjs'));const render=rm.exports;
(async()=>{
  const root='proof/interactive-check/b-to-a-joint',request=require('../proof/fixtures/inserted-plate-direct-joints-12.json');
 fs.mkdirSync(root+'/after',{recursive:true});fs.writeFileSync(root+'/after/request.json',JSON.stringify(request));
 const run=require('child_process').spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',root+'/after/request.json',root+'/after'],{encoding:'utf8',timeout:180000});
 assert.equal(run.status,0,run.stderr);
 const r=JSON.parse(fs.readFileSync(root+'/after/result.json'));
 const studio=fs.readFileSync('src/components/AmphitheaterStudio.tsx','utf8');
 assert(studio.includes('<option value="inserted-plate">Inserted Horizontal Plate</option>'),'Typology name must have no population suffix');
 assert.deepEqual(r.request.source,request.source);assert(r.validation.passed);assert.equal(r.validation.selfIntersectionPairs,0);
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const make=m=>new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)}));
 const parts=new Map(r.components.map(c=>[c.id,make(c.mesh)])),nodes=derive(r.request).nodes;
 const seams=r.plateReport.seams.filter(s=>s.kind==='direct B-to-A perimeter joint');assert.equal(seams.length,3);
 assert(!r.components.some(c=>c.id.startsWith('flank-V-')),'Redundant third wall remains');
 const checks=[],plans=[];
 for(const seam of seams){
  const node=nodes.find(n=>n.id===seam.source),matrix=new T.Matrix4().fromArray(node.matrix),shape=getLetterShape('V'),center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2());
  const axis=new T.Vector3(0,0,1).transformDirection(matrix),path=[0,1].map(t=>{const p=shape.curves[seam.outerContour].getPoint(t);return new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(matrix)}),normal=path[1].clone().sub(path[0]).cross(axis).normalize();
  const sweep=w.Manifold.hull(path.flatMap(p=>[-.36,.36].flatMap(t=>[-100,100].map(d=>p.clone().addScaledVector(normal,t).addScaledVector(axis,d).toArray()))));
  const panel=parts.get('boundary-'+node.id);assert(panel.subtract(sweep).volume()<.001,'V wall direction changed');
  for(const receiver of [seam.receiver,seam.otherReceiver]){const j=panel.intersect(parts.get('boundary-'+receiver)),b=j.boundingBox(),areas=Array.from({length:19},(_,i)=>j.slice(b.min[2]+(b.max[2]-b.min[2])*(i+1)/20).area());assert(j.volume()>.1&&areas.every(a=>a>1e-6),'Open seam');checks.push({source:node.id,receiver,volume:j.volume(),minSectionArea:Math.min(...areas)});}
  const z=node.p.z+r.request.field.height/2,level=nodes.filter(n=>n.p.levelIndex===node.p.levelIndex).map(n=>n.id);
  const section=w.Manifold.union(r.components.filter(c=>c.id.startsWith('boundary-')&&level.includes(c.id.slice(9))).map(c=>parts.get(c.id))).slice(z);
  plans.push({z,source:node.id,polygons:section.toPolygons(),pieces:section.decompose().length});
 }
 const solid=make(r.architecture);assert.equal(solid.decompose().length,1);
 const box=w.Manifold.cube([40,40,40]).translate([-20,-20,0]);assert(solid.subtract(box).volume()<.0001);
 for(const f of r.plateReport.floors){const m=r.components.find(c=>c.id===f.id).mesh;assert(m.positions.filter((_,i)=>i%3===2).every(z=>Math.min(Math.abs(z-f.topZ),Math.abs(z-f.bottomZ))<.0001),'Nonlevel plate');}
 const frame={min:[-20,-20,0],max:[20,20,40]};
 for(const [name,result] of [['after',r]])for(const view of ['iso','plan'])fs.writeFileSync(root+'/'+name+'-architecture-'+view+'.png',(await render([{...result.architecture,color:[247,246,245]}],view,frame)).png);
 const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="620"><rect width="1500" height="620" fill="#101923"/>'];
 plans.forEach((p,i)=>{const x=i*500+20,proj=q=>[x+230+q[0]*10,310-q[1]*10];svg.push(`<text x="${x}" y="38" fill="#F7F6F5" font-family="Arial" font-size="27">${p.source} · plan Z = ${p.z.toFixed(2)} ft</text>`);for(const c of r.components.filter(c=>c.id.startsWith('boundary-'))){const s=parts.get(c.id).slice(p.z),color=c.id==='boundary-'+p.source?'#71BEDA':'#F7F6F5';svg.push(`<path fill="${color}" fill-rule="evenodd" d="${s.toPolygons().map(loop=>'M'+loop.map(q=>proj(q).join(',')).join(' L')+' Z').join(' ')}"/>`);}svg.push(`<text x="${x}" y="570" fill="#71BEDA" font-family="Arial" font-size="22">Cyan: retained V-derived wall</text>`);});svg.push('</svg>');await require('sharp')(Buffer.from(svg.join(''))).png().toFile(root+'/architecture-plan-sections.png');
 fs.writeFileSync(root+'/verification.json',JSON.stringify({passed:true,sourcePreserved:true,redundantStrips:0,validation:r.validation,joints:checks,levelSections:plans.map(p=>({source:p.source,z:p.z,polygons:p.polygons.length,pieces:p.pieces})),plates:r.plateReport.floors.length},null,2));console.log(JSON.stringify({joints:checks,sections:plans.map(p=>({source:p.source,loops:p.polygons.length,pieces:p.pieces}))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
