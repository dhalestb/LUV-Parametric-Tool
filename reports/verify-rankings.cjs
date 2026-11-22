require('../scripts/ts-test-register.cjs');
const fs=require('node:fs');const assert=require('node:assert/strict');
const {assignComparativeRanks}=require('../src/components/evaluations/descriptorRank.ts');
const {VISIBLE_DESCRIPTORS}=require('../src/components/evaluations/visibleDescriptors.ts');
const baseline=JSON.parse(fs.readFileSync('reports/completion-model-baseline.json','utf8'));
assert.deepEqual(baseline.map(x=>x.filename),['Linear.obj','Stepped.obj','Void_Field.obj']);
const forms=baseline.map(x=>({formId:x.filename,descriptors:x.descriptors.map(d=>({id:d.id,absoluteScore:d.score===null?NaN:d.score,components:[]}))}));
assignComparativeRanks(forms);
const result=VISIBLE_DESCRIPTORS.map(({id,name})=>{
 const rows=baseline.map((model,i)=>{const source=model.descriptors.find(d=>d.id===id);const rank=forms[i].descriptors.find(d=>d.id===id);assert.ok(source&&rank);return {model:model.filename,sourceHash:model.sourceHash,score:source.score,available:source.available,reason:source.reason??null,rank:rank.comparativeRank??null,cohort:rank.cohortSize??null};});
 const cohort=rows.filter(r=>r.score!==null).length;assert.ok(rows.every(r=>r.cohort===null||r.cohort===cohort));
 return {id,name,cohort,rows};
});
// A legitimate score of zero remains in a complete cohort.
const zero=[0,25,50].map((score,i)=>({formId:String(i),descriptors:[{id:'zero',absoluteScore:score,components:[]}]}));assignComparativeRanks(zero);assert.equal(zero[0].descriptors[0].comparativeRank,1);assert.equal(zero[0].descriptors[0].cohortSize,3);
fs.writeFileSync('reports/verified-rankings.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
