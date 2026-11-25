const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
require('./ts-test-register.cjs');
const {populateVersionedLobby}=require('../src/components/lobbyPopulation.ts');
const {LOBBY_ENGINES,recordedLobbyEngine}=require('../src/components/lobbyEngineVersions.ts');
const {recordedLobbySpacingRevision}=require('../src/components/lobbySpacingRules.ts');
const root=path.resolve(__dirname,'..');process.chdir(root);
const rows=require('../reports/lobby-spacing-rules-2026-11-25/tests.json').newDesigns;
for(const row of rows){
 const record=JSON.parse(fs.readFileSync('data/lobby-generated/v1/'+row.id+'.json')),source=populateVersionedLobby(row.type,row.preferred,row.count,row.field,row.type==='linear-gallery-lobby'?['L','U']:['L','U','V']).source;
 assert(record.sourceSpacingValidation.passed);assert.equal(recordedLobbySpacingRevision(record),'lobby-spacing-2026-11-25');
 const engine=recordedLobbyEngine(record);assert.equal(engine,row.engine);
 const edges=record.letters.map(l=>{let min=Infinity,max=-Infinity;for(let i=0;i<l.mesh.positions.length;i+=3){min=Math.min(min,l.mesh.positions[i]);max=Math.max(max,l.mesh.positions[i]);}return{min,max};});
 for(let i=1;i<edges.length;i++)assert(Math.abs(edges[i].min-edges[i-1].max-(row.type==='continuous-hall-lobby'?-.405:i%2===1?-.747:1.013))<1e-5);
 assert.deepEqual(source,record.request.source,'New placement must retain the confirmed spacing configurations');
 if(process.argv.includes('--replay')){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'luv-spacing-checkpoint-'));
  try{fs.writeFileSync(path.join(temp,'request.json'),JSON.stringify(record.request));execFileSync(process.execPath,[path.join(root,'vendor',LOBBY_ENGINES[engine].package,'scripts/amphitheater-interactive-worker.cjs'),path.join(temp,'request.json'),temp],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:4e6,stdio:['ignore','pipe','pipe']});const replay=JSON.parse(fs.readFileSync(path.join(temp,'result.json')));for(const key of ['architecture','letters','components'])assert.deepEqual(replay[key],record[key]);assert(replay.validation.passed);}
  finally{assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));assert(path.basename(temp).startsWith('luv-spacing-checkpoint-'));fs.rmSync(temp,{recursive:true,force:true});}
 }
 console.log('PASS fixed-spacing checkpoint '+row.type+' '+row.preferred+' ft / width '+row.field.width);
}
assert.equal(recordedLobbySpacingRevision(JSON.parse(fs.readFileSync('data/lobby-generated/v1/12eb8d26-78e1-45b9-a0de-75a8c221f696.json'))),undefined);
console.log('PASS four updated configurations, pinned engine and spacing revisions, actual-mesh distances and unchanged legacy provenance'+(process.argv.includes('--replay')?', including exact native architecture replays.':'.'));
