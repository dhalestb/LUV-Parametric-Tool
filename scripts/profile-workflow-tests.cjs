const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:4194';
 const ids=process.argv.slice(3);
 if(ids.length!==3)throw Error('Supply one-click, edited/regenerated and separate-New-Design study IDs.');
 const results=await Promise.all(ids.map(async id=>{const response=await fetch(base+'/api/amphitheater?id='+id);assert.equal(response.status,200);return response.json();}));
 const [original,edited,separate]=results;
 const expected=structuredClone(original.request.source);expected[0].x=.25;
 assert.deepEqual(edited.request.source,expected);
 assert.notDeepEqual(edited.architecture,original.architecture);
 assert.notDeepEqual(separate.request.source,original.request.source);
 assert.equal(new Set(results.map(r=>r.id)).size,3);
 const summaries=await fetch(base+'/api/amphitheater').then(r=>r.json());
 for(const r of results){
  assert(summaries.studies.some(s=>s.id===r.id));
  assert.deepEqual(r.request.field,{width:40,depth:40,height:60});assert.equal(r.request.preferredFeet,13);
  assert.equal(r.request.envelopeVersion,'profiles');assert.equal(r.sourceCount,12);
  assert(r.architecture.indices.length>0);assert.equal(r.validation.selfIntersectionPairs,0);
  assert.equal(r.articulationReport.components,1);assert(r.contributions.every(c=>c.exposedArea>=1));
  assert(r.request.source.every(p=>p.rx===0&&p.ry===0&&[-15,0,15].includes(p.rz)));
 }
 const report={passed:true,base,exactEditedSourcePreserved:true,architectureChanged:true,previousStudiesRetained:true,rows:results.map(r=>({id:r.id,sourceName:r.request.sourceName,triangles:r.architecture.indices.length/3,volume:r.volume,validation:r.validation,operations:r.articulationReport.operations.length}))};
 fs.writeFileSync('reports/standalone-profile/workflow-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
