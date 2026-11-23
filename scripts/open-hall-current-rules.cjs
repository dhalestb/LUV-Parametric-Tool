require('./ts-test-register.cjs');
const assert=require('node:assert/strict');
const rules=require('../src/components/protoWorkspaceRules.ts');
const {workspaceDualReports}=require('../src/components/workspaceDualRulesets.ts');
const {openHallColumnGridError}=require('../src/components/workspace-rules/open-hall-workspace.ts');
assert.match(openHallColumnGridError({columnSize:2,columnGridSpacing:1}),/at least 3 ft/);
assert.equal(openHallColumnGridError({columnSize:2,columnGridSpacing:3}),undefined);
assert.equal(openHallColumnGridError({columnSize:3,columnGridSpacing:2}),undefined);
assert.throws(
 ()=>rules.buildOpenHallGuideLetters({width:60,depth:60,height:20,columnGridSpacing:1}),
 /at least 3 ft/
);
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2);
for(const faces of [2,3,4]){
 const field={width:40,depth:40,height:20,mezzanineFaces:faces};
 const p=rules.planOfficeWorkspace('open-hall-workspace',0,[0,0,0],field);
 const base=area(p.plates.find(p=>p.role==='ground').polygon);
 const opening=1-p.plates.filter(p=>p.role==='mezzanine').reduce((sum,p)=>sum+area(p.polygon),0)/base;
 assert(opening>=.2&&opening<=.4);
 assert.equal(p.checks.find(c=>c.label==='Mezzanine opening').status,'pass');
 assert.match(p.checks.find(c=>c.label==='Mezzanine opening').detail,/20\.0–40%/);
 const reports=workspaceDualReports(p);
 assert.equal(reports.architecturalGeneration.rulesetVersion,'1.6.0');
 assert.match(reports.letterArrangement.sourcePolicy,/rebuilds the plan and reseats/);
}
const compact=rules.planOfficeWorkspace('open-hall-workspace',0,[0,0,0],{width:20,depth:20,height:20,mezzanineFaces:4});
assert.equal(compact.checks.find(c=>c.label==='Mezzanine opening').status,'fail','No lowered opening exception for compact rings');
const field={width:40,depth:40,height:20};
const guides=rules.buildOpenHallGuideLetters(field,[0,0,0]);
const original=rules.arrangeOfficeLetters(guides,'open-hall-workspace',12,[0,0,0],field);
const edited=rules.arrangeOfficeLetters(guides.map((p,i)=>i===0?{...p,x:p.x+1}:p),'open-hall-workspace',12,[0,0,0],field);
assert.deepEqual(original.officePlan,edited.officePlan,'Rules accurately describe settings-based plan regeneration');
console.log('PASS measured 20–40% openings, compact rejection, v1.6.0 reports and settings-based regeneration');
