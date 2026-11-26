require('./ts-test-register.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const rules=require('../src/components/officeWorkspaceRules.ts');
const {validateOpenHallGuidePlacement:validate}=require('../src/components/workspace-rules/open-hall-workspace.ts');
const {workspaceDualReports}=require('../src/components/workspaceDualRulesets.ts');
for(const faces of [2,3,4]){
 const field={width:40,depth:40,height:20,mezzanineFaces:faces};
 const source=rules.buildOpenHallGuideLetters(field,[0,0,0]);
 const arranged=rules.arrangeOfficeLetters(source,'open-hall-workspace',12,[0,0,0],field);
 const plan=arranged.officePlan,poses=arranged.placements;
 assert.equal(validate(plan,poses,field).status,'pass');
 assert.equal(validate(plan,[...poses].reverse(),field).status,'pass','Matching must not depend on array order');
 assert.equal(workspaceDualReports(plan).letterArrangement.rules.find(r=>r.id==='LA-10').status,'pass');
 for(const role of ['floor','mezzanine','column','wall','roof']){
  const id=poses.findIndex(p=>p.openHallRole===role);assert(id>=0);
  for(const delta of [{x:poses[id].x+.01},{z:poses[id].z+.01},{rz:poses[id].rz+1},{scale:poses[id].scale+.01},{scaleX:1.1},{openHallRole:'wrong-role'}]){
   const changed=poses.map((p,i)=>i===id?{...p,...delta}:p);
   assert.equal(validate(plan,changed,field).status,'fail',role+JSON.stringify(delta));
  }
 }
 assert.equal(validate(plan,poses.slice(1),field).status,'fail');
 assert.equal(validate(plan,[...poses,poses[0]],field).status,'fail');
 assert.equal(validate(plan,poses.map((p,i)=>i===1?poses[0]:p),field).status,'fail');
 if(faces!==2)continue;
 for(const tamper of [false,true]){
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'open-hall-guide-check-'));
  const reports=workspaceDualReports(plan);
  const request={generator:'workspace-ten-rule',envelopeVersion:'workspace-ten-rule',workspaceTypology:'open-hall-workspace',field,source:poses.map((p,i)=>tamper&&i===0?{...p,x:p.x+.01}:p),workspacePlan:plan,letterArrangementReport:reports.letterArrangement,architecturalGenerationReport:reports.architecturalGeneration};
  const file=path.join(out,'request.json');fs.writeFileSync(file,JSON.stringify(request));
  const proc=spawnSync(process.execPath,[path.join(__dirname,'amphitheater-interactive-worker.cjs'),file,out],{encoding:'utf8',timeout:60000});
  if(tamper){assert.notEqual(proc.status,0);assert.match(proc.stderr,/Letter arrangement ruleset failed/);}
  else {assert.equal(proc.status,0,proc.stderr);const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));assert.equal(result.letterArrangementReport.rules.find(r=>r.id==='LA-10').status,'pass');}
 }
}
console.log('PASS all guide roles: position, Z seating, orientation, size, role, missing/duplicate guides; worker independently rejects a bad pose');
