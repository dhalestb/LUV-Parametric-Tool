require('./ts-test-register.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const rules=require('../src/components/officeWorkspaceRules.ts'),{workspaceDualReports}=require('../src/components/workspaceDualRulesets.ts');
for(const [faces,joinWalls,detached] of [[2,false,false],[2,true,false],[3,false,false],[4,false,false],[2,false,true]]){
 const field={width:40,depth:40,height:20,mezzanineFaces:faces};
 const guides=rules.buildOpenHallGuideLetters(field,[0,0,0]);
 const arranged=rules.arrangeOfficeLetters(guides,'open-hall-workspace',12,[0,0,0],field);
 const plan=structuredClone(arranged.officePlan);
 if(detached)plan.plates.push({id:'floating-test-panel',role:'wall',polygon:[[4,4],[4.5,4],[4.5,4.5],[4,4.5]],zTop:5,thickness:.25});
 const reports=workspaceDualReports(plan);
 const pending=reports.architecturalGeneration.rules.find(r=>r.id==='AG-10');
 assert.equal(pending.title,'Connected assembly and component coverage');
 assert.equal(pending.status,'unverified','Connectivity must not be assumed before mesh assembly');
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'open-hall-connectivity-'));
 const request={generator:'workspace-ten-rule',envelopeVersion:'workspace-ten-rule',workspaceTypology:'open-hall-workspace',field,source:arranged.placements,workspacePlan:plan,letterArrangementReport:reports.letterArrangement,architecturalGenerationReport:reports.architecturalGeneration,openHall:{joinWalls}};
 const file=path.join(out,'request.json');fs.writeFileSync(file,JSON.stringify(request));
 const proc=spawnSync(process.execPath,[path.join(__dirname,'amphitheater-interactive-worker.cjs'),file,out],{encoding:'utf8',timeout:60000});
 if(detached){assert.notEqual(proc.status,0);assert.match(proc.stderr,/Final workspace geometry failed/);console.log('PASS disconnected panel is rejected');continue;}
 assert.equal(proc.status,0,proc.stderr);
 const result=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
 const final=result.architecturalGenerationReport.rules.find(r=>r.id==='AG-10');
 assert.equal(final.status,'pass');assert.equal(final.measured,'1');assert.equal(final.hard,true);
 assert(result.warnings.includes('Daylight and structural performance have not been evaluated.'));
 console.log(`PASS ${faces}-channel connected assembly; joined viewer walls=${joinWalls}`);
}
