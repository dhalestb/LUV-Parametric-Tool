const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const base='http://127.0.0.1:4181/api/amphitheater';
(async()=>{
 const initial=await(await fetch(base)).json();
 const baseline=await(await fetch(base+'?id='+initial.studies.find(s=>s.request.sourceId==='fixture'&&s.request.population==='auto'&&s.request.preferredFeet===13&&s.request.field.width===40&&s.request.field.depth===40&&s.request.field.height===60).id)).json();
 assert.deepEqual(baseline.request.field,{width:40,depth:40,height:60});assert.equal(baseline.request.preferredFeet,13);assert(baseline.architecture.indices.length>0);assert.equal(baseline.letters.length,baseline.sourceCount);assert.equal(baseline.validation.selfIntersectionPairs,0);
 const request={generator:'typology-baseline',field:{width:40,depth:40,height:60},preferredFeet:13,population:'auto',sourceId:'fixture',sourceName:'Recorded L/U/V proof fixture',source:initial.fixture};
 const rows=[];
 for(const [name,changes] of [['unknown generator rejected',{generator:'unsupported'}],['invalid width rejected',{field:{width:30,depth:40,height:60}}]]){const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...request,...changes})});const d=await r.json();assert.equal(r.status,400);rows.push({name,status:r.status,error:d.error});}
 const hash=m=>crypto.createHash('sha256').update(JSON.stringify(m)).digest('hex');
 rows.push({name:'browser-generated initial study',id:baseline.id,request:baseline.request,sourceCount:baseline.sourceCount,components:baseline.components.length,volume:baseline.volume,bounds:baseline.bounds,validation:baseline.validation,architecturalValidation:baseline.architecturalValidation,meshHash:hash(baseline.architecture)});
 for(const [name,changes] of [['explicit population 13',{population:13}],['U proportion change',{sourceId:'shape-change',sourceName:'U depth +3%',source:initial.fixture.map(s=>s.letter==='U'?{...s,scaleY:s.scaleY*1.03}:s)}]]){
  const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...request,...changes})});const d=await r.json();if(r.status!==201)throw Error(name+': '+d.error);assert.equal(d.validation.selfIntersectionPairs,0);assert.deepEqual(d.request.field,request.field);assert.equal(d.request.preferredFeet,13);assert.notEqual(hash(d.architecture),hash(baseline.architecture));if(changes.population)assert.equal(d.sourceCount,changes.population);
  rows.push({name,id:d.id,request:d.request,sourceCount:d.sourceCount,components:d.components.length,volume:d.volume,bounds:d.bounds,validation:d.validation,architecturalValidation:d.architecturalValidation,meshHash:hash(d.architecture)});console.log(name,d.sourceCount,d.volume,d.validation);
 }
 fs.writeFileSync('reports/amphitheater-interactive/api-results.json',JSON.stringify({passed:true,rows},null,2));console.log('PASS: interactive API and actual mesh alternatives');
})().catch(e=>{console.error(e);process.exitCode=1});



