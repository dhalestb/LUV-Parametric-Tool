const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
require('../proof/rule-amphitheater.cjs');
const {applyVoidFieldSpacing,populateVoidField}=require('../src/components/voidFieldPopulation.ts');
const base={request:JSON.parse(fs.readFileSync('proof/fixtures/void-field-spacing-base.json'))};
const rows=[];
for(const spacing of [12,15]){
 const original=structuredClone(base.request.source),source=applyVoidFieldSpacing(original,base.request.field,spacing);
 assert.deepEqual(original,base.request.source);
 for(let i=0;i<source.length;i++)for(const k of Object.keys(source[i]).filter(k=>k!=='z'))assert.deepEqual(source[i][k],original[i][k]);
 const request={...base.request,source,sourceSnapshot:{floorSpacing:spacing}};
 const out=path.resolve('proof/interactive-check/void-field-spacing',String(spacing));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/request.json',JSON.stringify(request));
 const start=performance.now(),r=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',out+'/request.json',out],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const result=JSON.parse(fs.readFileSync(out+'/result.json')),floors=result.voidFieldReport.floors;
 assert.equal(floors.length,3);for(let i=1;i<3;i++)assert(Math.abs(floors[i].topZ-floors[i-1].topZ-spacing)<1e-8);
 assert(result.validation.passed&&result.validation.selfIntersectionPairs===0);
 assert.deepEqual(result.request.source,source);
 rows.push({spacing,floors,volume:result.volume,triangles:result.architecture.indices.length/3,elapsedMs:Math.round(performance.now()-start),validation:result.validation});
 const generated=populateVoidField(base.request.field,13,19,spacing);
 const centers=['lower','middle','top'].map(lift=>{const g=generated.filter(p=>p.lift===lift&&p.architecturalRole!=='interior');return g.reduce((s,p)=>s+p.z,0)/g.length;});
 assert(Math.abs(centers[1]-centers[0]-spacing)<1e-8&&Math.abs(centers[2]-centers[1]-spacing)<1e-8);
}
assert.throws(()=>populateVoidField({width:40,depth:40,height:20},13,19,12),/do not fit/);
assert.throws(()=>applyVoidFieldSpacing(base.request.source,{width:40,depth:40,height:20},15),/outside the field/);
fs.writeFileSync('reports/void-field/level-spacing-validation.json',JSON.stringify({passed:true,sourceTransformsPreservedExceptExplicitZChange:true,rejectedUndersizedField:true,rows},null,2));
console.log(JSON.stringify({passed:true,rows:rows.map(r=>({...r,floors:r.floors.map(f=>f.topZ)}))},null,2));
