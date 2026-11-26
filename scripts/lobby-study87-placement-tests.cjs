const assert=require('node:assert/strict'),{test}=require('node:test');
require('./ts-test-register.cjs');
const {populateVersionedLobby}=require('../src/components/lobbyPopulation.ts');
const {applyLobbyZLevels}=require('../vendor/lobby-bfce854/src/components/lobbyProof.ts');
const {LOBBY_GENERATORS}=require('../src/components/lobbyEngineVersions.ts');
const {measureLobbySourceSpacing}=require('../src/components/lobbySpacingRules.ts');
const {CONTINUOUS_STUDY87_PLACEMENT_REVISION:revision,applyContinuousStudy87Level,recordedLobbyPlacementRevision,resolveLobbyPlacementRevision,assertContinuousStudy87Placement,measureContinuousStudy87Placement}=require('../src/components/lobbyPlacementRules.ts');
const type='continuous-hall-lobby',field={width:40,depth:20,height:40};
const snapshot=placementRuleRevision=>({request:{sourceSnapshot:placementRuleRevision?{placementRuleRevision}:{}}});

test('Study 87 uses exactly the developer one-level poses and keeps fitting/rotations/spacing',()=>{
 const legacy=populateVersionedLobby(type,9,15,field,['U','L'],undefined,'legacy');
 const oldCopy=JSON.stringify(legacy.source),current=populateVersionedLobby(type,9,15,field,['U','L']);
 assert.deepEqual(current.source,applyLobbyZLevels(legacy.source,field,1,10));
 assert.equal(current.engineRevision,'bf7fc3c');assert.equal(current.placementRuleRevision,revision);
 assert.equal(current.source.map(s=>s.letter).join(''),'ULULULULULULULU');
 assert.deepEqual(current.source.map(s=>[s.rx,s.ry,s.rz]),[[0,0,0],...Array.from({length:13},(_,i)=>[i*15,90,0]),[0,0,90]]);
 assert(current.source.every(s=>s.z===0&&s.scale===8.1));
 assert(legacy.source[0].z<0&&legacy.source.at(-1).z>0);
 assert.equal(JSON.stringify(legacy.source),oldCopy);
 const spacing=measureLobbySourceSpacing(type,current.source,current.engineRevision);assert(spacing.passed);
 assert(spacing.pairs.every(p=>Math.abs(p.signedGapFt+.405)<1e-5));
 assert(spacing.pairs.slice(1,-1).every(p=>Math.abs(p.centerSpacingFt-.729)<1e-5));
});
test('other Continuous dimensions, sizes, counts and letter choices also use Z=0',()=>{
 for(const [preferred,count,box,letters]of [[13,8,{width:20,depth:20,height:20},['L','U','V']],[6,10,{width:60,depth:40,height:20},['L','U']]]){
  const legacy=populateVersionedLobby(type,preferred,count,box,letters,undefined,'legacy'),current=populateVersionedLobby(type,preferred,count,box,letters);
  assert.deepEqual(current.source,legacy.source.map(p=>({...p,z:0})));assertContinuousStudy87Placement(current.source);
 }
});
test('the other four Lobby populations and their metadata are unchanged',()=>{
 for(const id of Object.keys(LOBBY_GENERATORS).filter(id=>id!==type)){
  const letters=id==='linear-gallery-lobby'?['L','U']:['L','U','V'];
  const args=[id,9,6,{width:60,depth:60,height:60},letters,id==='topographic-ground-field-lobby'?{count:1,spacing:10}:undefined];
  assert.deepEqual(populateVersionedLobby(...args),populateVersionedLobby(...args,'legacy'));
 }
});
test('new automatic Continuous requests receive the placement revision',()=>{
 assert.equal(resolveLobbyPlacementRevision(type,{}),revision);
 assert.equal(resolveLobbyPlacementRevision(type,{sourceSnapshot:{placementRuleRevision:revision}}),revision);
 assert.equal(resolveLobbyPlacementRevision('linear-gallery-lobby',{}),undefined);
});
test('legacy regeneration keeps its unversioned poses/policy and rejects silent migration',()=>{
 const parent=snapshot();assert.equal(resolveLobbyPlacementRevision(type,{},parent),undefined);
 assert.throws(()=>resolveLobbyPlacementRevision(type,{sourceSnapshot:{placementRuleRevision:revision}},parent),/retain the saved placement/);
});
test('corrected regeneration retains the recorded placement revision',()=>{
 const parent={...snapshot(revision),provenance:{placementRuleRevision:revision}};
 assert.equal(recordedLobbyPlacementRevision(parent),revision);
 assert.equal(resolveLobbyPlacementRevision(type,{},parent),revision);
 assert.equal(resolveLobbyPlacementRevision(type,{sourceSnapshot:{placementRuleRevision:revision}},parent),revision);
});
test('approved historical configuration copies keep their supplied source policy',()=>{
 assert.equal(resolveLobbyPlacementRevision(type,{sourceSnapshot:{operation:'approved-configuration-derivative'}}),undefined);
});
test('unknown revisions and use on another Lobby typology are rejected',()=>{
 assert.throws(()=>recordedLobbyPlacementRevision(snapshot('unknown')),/Unknown saved Lobby placement/);
 assert.throws(()=>recordedLobbyPlacementRevision({...snapshot(revision),provenance:{placementRuleRevision:'unknown'}}),/Unknown saved Lobby placement/);
 assert.throws(()=>resolveLobbyPlacementRevision('linear-gallery-lobby',{sourceSnapshot:{placementRuleRevision:revision}}),/only for Continuous Hall/);
});
test('Z verification rejects an uncorrected new request and does not mutate edited poses',()=>{
 const source=populateVersionedLobby(type,9,15,field,['U','L'],undefined,'legacy').source;
 const copy=JSON.stringify(source);assert.throws(()=>assertContinuousStudy87Placement(source),/every source letter at Z = 0/);
 assert.deepEqual(measureContinuousStudy87Placement(source).failedLetters,[1,15]);
 assert.equal(JSON.stringify(source),copy);const corrected=applyContinuousStudy87Level(source);assertContinuousStudy87Placement(corrected);assert.equal(JSON.stringify(source),copy);
});
