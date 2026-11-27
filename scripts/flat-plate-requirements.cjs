// Explicit user requirements, independent of candidate-derived expected meshes.
const assert=require('node:assert/strict');
require('./ts-test-register.cjs');
const {flatPlatePlan}=require('../src/components/workspace-rules/flat-deep-plan-plate.plan.ts');
const rules=require('../src/components/officeWorkspaceRules.ts');
const {derive}=require('./source-envelope.cjs');
const reports=require('../src/components/workspaceDualRulesets.ts');
const bounds=p=>{const x=p.polygon.map(q=>q[0]),y=p.polygon.map(q=>q[1]);return [Math.max(...x)-Math.min(...x),Math.max(...y)-Math.min(...y)];};
for(const [width,depth] of [[20,60],[60,20],[40,40]])for(const spacing of [10,12,15,13.5]){
 const field={width,depth,height:20,flatPlate:{columnSpacing:spacing,columnSize:2,wallThickness:1.5,slabThickness:.75,floorMezzGuideSize:6,wallGuideSize:1}};
 const plan=flatPlatePlan(field),floor=plan.plates.find(p=>p.role==='ground'),mezz=plan.plates.find(p=>p.role==='mezzanine');
 assert.deepEqual(bounds(floor),[width-4,depth-4],'ratio disabled; two-foot margins');
 assert.deepEqual(bounds(mezz),width>=depth?[width-4,(depth-4)/2]:[(width-4)/2,depth-4],'full length, half width');
 assert.equal(mezz.zTop,10);assert.equal(floor.thickness,.75);assert.equal(plan.voids.length,0);
 const bands=plan.plates.filter(p=>p.id.startsWith('long-'));assert.equal(bands.length,4);bands.forEach(p=>assert(Math.abs(p.thickness-2)<1e-6));
 assert.equal(plan.plates.filter(p=>p.id.startsWith('short-end-')).length,4);
 assert.equal(plan.slots.filter(p=>Math.abs(p.rx)>1||Math.abs(p.ry)>1).length,28,'six corners per end and four per long strip');
 const arranged=rules.arrangeOfficeLetters([],'flat-deep-plan-plate',12,[0,0,0],field);
 derive({field,source:arranged.placements,envelopeVersion:'workspace-ten-rule'});
 assert(arranged.placements.every(p=>p.letter==='L'));
 const {letterArrangement,architecturalGeneration}=reports.workspaceDualReports(arranged.officePlan);
 assert.equal(architecturalGeneration.rulesetVersion,'2.2.0');
 assert.equal(letterArrangement.rules.length,10);
 assert.equal(architecturalGeneration.rules.length,10);
 assert(letterArrangement.rules.every(rule=>rule.status==='pass'));
 assert(architecturalGeneration.rules.filter(rule=>rule.id!=='AG-10').every(rule=>rule.status==='pass'));
 assert.equal(architecturalGeneration.rules.find(rule=>rule.id==='AG-10').status,'unverified','Final integrity is measured once a solid mesh exists');
}
const custom=flatPlatePlan({width:40,depth:60,height:40,flatPlate:{wallThickness:2,slabThickness:.5,columnSize:3,columnSpacing:13.5}});
assert.equal(custom.plates.find(p=>p.role==='ground').thickness,.5);
assert.equal(Math.min(...bounds(custom.plates.find(p=>p.id.startsWith('long-')))),2);
console.log('PASS Flat Deep Plan explicit requirements: 12 dimension/spacing cases, ten rules per stage, guide containment, bands/end outlines, no skylights and custom thickness.');

async function checkFailedAndIncompleteJoins(){
 const wasm=await require('manifold-3d/manifold.js').default();
 wasm.setup();
 const {buildOfficeWorkspace}=require('../src/components/workspace-rules/flat-deep-plan-plate.geometry.ts');
 const plan=flatPlatePlan({width:20,depth:60,height:20});
 const originalUnion=wasm.Manifold.union;
 const owned=[],own=solid=>(owned.push(solid),solid);
 try{
  assert(buildOfficeWorkspace(wasm,plan,own).combined.volume()>0);
  wasm.Manifold.union=()=>wasm.Manifold.cube([0,0,0]);
  assert.throws(()=>buildOfficeWorkspace(wasm,plan,own),/AG-10.*could not join all slabs/);
  wasm.Manifold.union=items=>items[0].translate([0,0,0]);
  assert.throws(()=>buildOfficeWorkspace(wasm,plan,own),/AG-10.*missing material in the slabs assembly/);
 }finally{
  wasm.Manifold.union=originalUnion;
  for(const solid of owned.reverse())solid.delete();
 }
 console.log('PASS Flat Deep Plan rejects a failed join and a valid but incomplete union.');
}
checkFailedAndIncompleteJoins().catch(error=>{console.error(error);process.exitCode=1;});
