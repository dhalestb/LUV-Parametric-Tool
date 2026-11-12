const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
require('../proof/rule-amphitheater.cjs');
const {populateVoidField}=require('../src/components/voidFieldPopulation.ts');
const {derive}=require('./source-envelope.cjs');
const rows=[];
function worker(request,name){
 const out=path.resolve('proof/interactive-check/void-field',name);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/request.json',JSON.stringify(request));
 const start=performance.now();const check=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',out+'/request.json',out],{encoding:'utf8'});
 if(check.status!==0)throw Error(name+': '+check.stderr);
 const result=JSON.parse(fs.readFileSync(out+'/result.json'));
 result.elapsedMs=Math.round(performance.now()-start);return result;
}
function make(height,seed,mode='neighbor-taper'){
 const field={width:40,depth:40,height};return {typologyName:'Void Field Gathering',generator:'source-preserving',envelopeVersion:'void-field',voidField:{profileMode:mode,taper:.35},field,preferredFeet:13,population:9,sourceId:'void-field-'+height+'-'+seed,sourceName:'Nine-letter Void Field · seed '+seed,source:populateVoidField(field,13,seed)};
}
(async()=>{
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const fromMesh=mesh=>new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)}));
 for(const [height,seed,mode] of [[20,19,'neighbor-taper'],[40,19,'neighbor-taper'],[60,19,'neighbor-taper'],[60,19,'straight'],[60,37,'neighbor-taper']]){
  const request=make(height,seed,mode),r=worker(request,height+'-'+seed+'-'+mode),report=r.voidFieldReport,solid=fromMesh(r.architecture);
  assert.equal(request.source.length,9);assert.deepEqual(r.request.source,request.source);
  const inside=request.source.filter(p=>p.architecturalRole==='interior');
  assert.equal(inside.length,3);assert.deepEqual(inside.map(p=>p.rz).sort((a,b)=>a-b),[75,90,105]);assert(inside.every(p=>p.rx===0&&p.ry===0));
  assert.equal(r.validation.passed,true);assert.equal(r.validation.selfIntersectionPairs,0);assert.equal(solid.decompose().length,1);
  assert.equal(report.voids.length,3);assert.equal(report.voids.filter(v=>v.hierarchy==='primary').length,1);
  assert(r.contributions.every(c=>c.exposedArea>=1));
  for(const v of report.voids){
   const cutter=fromMesh(v.cutterMesh);assert.equal(cutter.status(),'NoError');
   assert(Math.abs(solid.intersect(cutter).volume())<1e-8);
   assert(v.removedVolume>0&&v.closure.addedEdges.length>=2);
   assert.equal(v.floors.length,3);assert.deepEqual(v.axis,[0,0,1]);
   const lo=.1,hi=report.extent[1]-.1;
   const lowArea=cutter.slice(lo).area(),highArea=cutter.slice(hi).area();
   assert(lowArea>.2&&highArea>.2,'Loft ends must preserve two-dimensional profiles');
   if(mode==='straight')assert(Math.abs(highArea-lowArea)<.001);
   else assert(Math.abs(highArea-lowArea)>.01,'Neighbor-derived taper must change actual cutter sections');
   // Independent XY section must remain empty in the final exported material at each floor.
   for(const floor of report.floors){
    const z=(floor.bottomZ+floor.topZ)/2;
    assert(solid.slice(z).intersect(cutter.slice(z)).area()<1e-7);
   }
  }
  for(const floor of report.floors){
   let area=0;const m=r.architecture;
   for(let k=0;k<m.indices.length;k+=3){const p=[0,1,2].map(j=>m.positions.slice(m.indices[k+j]*3,m.indices[k+j]*3+3));if(p.every(q=>Math.abs(q[2]-floor.topZ)<1e-5))area+=Math.abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]))/2;}
   assert(area>1,'Each floor requires actual planar top faces');
  }
  assert(r.bounds.min[0]>=-20&&r.bounds.max[0]<=20&&r.bounds.min[1]>=-20&&r.bounds.max[1]<=20&&r.bounds.min[2]>=0&&r.bounds.max[2]<=height);
  rows.push({height,seed,mode,elapsedMs:r.elapsedMs,volume:r.volume,removed:r.articulationReport.removed,triangles:r.architecture.indices.length/3,actualHeight:r.bounds.max[2],validation:r.validation,voids:report.voids.map(v=>({source:v.source,hierarchy:v.hierarchy,area:v.area,removed:v.removedVolume,taper:v.taperDelta})),contributions:r.contributions});
 }
 const base=JSON.parse(fs.readFileSync('proof/interactive-check/void-field/60-19-neighbor-taper/result.json'));
 const edited=structuredClone(base.request);const index=edited.source.findIndex(p=>p.architecturalRole==='interior');edited.source[index].x+=.4;edited.source[index].rz+=5;
 const regenerated=worker(edited,'edited');
 assert.deepEqual(regenerated.request.source,edited.source);
 base.letters.forEach((l,i)=>{if(i!==index)assert.deepEqual(l,regenerated.letters[i]);});
 assert.notDeepEqual(base.architecture,regenerated.architecture);
 const invalid=structuredClone(base.request);invalid.source.push({...invalid.source[0]});
 await assert.rejects(()=>require('./source-envelope.cjs').buildSource(invalid,'proof/interactive-check/void-field'),/exactly nine/);
 const rejected=make(60,21);assert.throws(()=>worker(rejected,'rejected-cavity-21'),/disconnected/);
 const report={passed:true,rejectedCases:[{seed:21,reason:'Unintended enclosed cavity; rejected without publishing a study.'}],rows,editing:{changedLetter:index+1,manualYaw:edited.source[index].rz,posesPreserved:true,architectureChanged:true},twelveLetterGate:true};
 fs.mkdirSync('reports/void-field',{recursive:true});fs.writeFileSync('reports/void-field/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
