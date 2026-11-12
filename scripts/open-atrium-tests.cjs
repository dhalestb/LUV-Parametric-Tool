const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict'),T=require('three');
require('../proof/rule-amphitheater.cjs');
const {applyVoidFieldSpacing,populateVoidField}=require('../src/components/voidFieldPopulation.ts');
const base={request:JSON.parse(fs.readFileSync('proof/fixtures/void-field-atrium.json'))};
const rows=[];
function worker(request,name){
 const out=path.resolve('proof/interactive-check/open-atrium',name);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/request.json',JSON.stringify(request));
 const start=performance.now(),r=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',out+'/request.json',out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 return {...JSON.parse(fs.readFileSync(out+'/result.json')),elapsedMs:Math.round(performance.now()-start)};
}
function triangleHits(mesh,a,b){
 const origin=new T.Vector3(...a),end=new T.Vector3(...b),length=origin.distanceTo(end),ray=new T.Ray(origin,end.clone().sub(origin).normalize()),p=new T.Vector3(),v=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let hits=0;
 for(let i=0;i<mesh.indices.length;i+=3){for(let k=0;k<3;k++)v[k].fromArray(mesh.positions,mesh.indices[i+k]*3);if(ray.intersectTriangle(...v,false,p)){const d=origin.distanceTo(p);if(d>1e-8&&d<length-1e-8)hits++;}}
 return hits;
}
(async()=>{
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const solid=mesh=>new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)}));
 for(const spacing of [12,15]){
  const request=structuredClone(base.request);request.source=applyVoidFieldSpacing(request.source,request.field,spacing);
  request.voidField={...request.voidField,atriumBoundary:'enclosed'};
  const before=worker(request,'before-'+spacing);
  request.voidField.atriumBoundary='open';const after=worker(request,'after-'+spacing),visibility=after.voidFieldReport.visibility,material=solid(after.architecture);
  assert.deepEqual(after.request.source,request.source);assert.deepEqual(after.letters,before.letters);assert.deepEqual(after.voidFieldReport.floors,before.voidFieldReport.floors);
  assert(after.validation.passed&&after.validation.selfIntersectionPairs===0);assert.equal(material.decompose().length,1);
  assert(visibility.passed);assert(visibility.floorViews.every(f=>f.portalCount>=2));assert(visibility.crossLevel.every(p=>p.views.length>=2));assert(visibility.sky.length>=1);
  let independentRays=0,beforeBlocked=0;
  const paths=[...visibility.floorViews.flatMap(f=>f.views),...visibility.crossLevel.flatMap(p=>p.views),...visibility.sky];
  for(const ray of paths)for(const offset of visibility.bundleOffsets){
   const a=ray.start.map((v,k)=>v+offset[k]),b=ray.end.map((v,k)=>v+offset[k]);assert.equal(triangleHits(after.architecture,a,b),0,'Exported triangle visibility obstruction');independentRays++;
   if(triangleHits(before.architecture,a,b)>0)beforeBlocked++;
  }
  assert(beforeBlocked>0,'Before comparison must reproduce wall obstruction.');
  for(const f of visibility.floorViews)for(const view of f.views)assert(w.Manifold.cube([.12,.12,.12],true).translate(view.foot).subtract(material).volume()<1e-9);
  for(const v of after.voidFieldReport.voids)assert(Math.abs(material.intersect(solid(v.cutterMesh)).volume())<1e-8);
  for(let i=1;i<3;i++)assert(Math.abs(after.voidFieldReport.floors[i].topZ-after.voidFieldReport.floors[i-1].topZ-spacing)<1e-8);
  assert(after.contributions.every(c=>c.exposedArea>=1));
  rows.push({spacing,sourcePosesPreserved:true,sourceMeshesIdentical:true,floorElevationsUnchanged:true,volumeBefore:before.volume,volumeAfter:after.volume,trianglesBefore:before.architecture.indices.length/3,trianglesAfter:after.architecture.indices.length/3,elapsedBefore:before.elapsedMs,elapsedAfter:after.elapsedMs,independentTriangleRays:independentRays,previouslyBlockedRays:beforeBlocked,floorViewCounts:visibility.floorViews.map(f=>f.portalCount),crossLevelCounts:visibility.crossLevel.map(p=>p.views.length),skyPaths:visibility.sky.length,validation:after.validation});
 }
 // A second composition proves the bays follow the actual source, including a U primary.
 const field={width:40,depth:40,height:60},request={...base.request,field,source:populateVoidField(field,13,19,12),voidField:{...base.request.voidField,atriumBoundary:'open'}};
 const second=worker(request,'seed-19-12');assert.deepEqual(second.request.source,request.source);
 request.voidField.primarySource=second.voidFieldReport.voids.find(v=>request.source.find((p,i)=>p.letter+'-'+(i+1)===v.source)?.letter==='U').source;
 assert.throws(()=>worker(request,'U-primary-12'),/Open atrium sightlines failed/,'A narrow U-primary case with no clear cross-level paths must remain rejected.');
 const results={passed:true,rows,additionalCases:[{seed:19,primary:second.voidFieldReport.visibility.source,passed:true},{seed:19,primary:request.voidField.primarySource,accepted:false,expectedRejection:true,reason:'Narrow U-primary arrangement has floor-facing views but no verified cross-level views; validation preserved.'}],unchangedValidationThresholds:true};
 fs.mkdirSync('reports/open-atrium',{recursive:true});fs.writeFileSync('reports/open-atrium/validation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
