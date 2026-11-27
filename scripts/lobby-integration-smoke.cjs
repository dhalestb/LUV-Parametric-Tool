/* Read-only package/record checks. --replay runs workers in disposable OS temp folders. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
require('./ts-test-register.cjs');
const root=path.resolve(__dirname,'..');process.chdir(root);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const {LOBBY_ENGINES,LOBBY_GENERATORS,recordedLobbyEngine}=require('../src/components/lobbyEngineVersions.ts');
const manifests=require('../src/server/lobbyEngineManifest.json');
const {LOBBY_FINALS}=require('../src/components/lobby-final/registry.ts');
const fresh={
 'vertical-void-lobby':'a0462c5d-8882-42d1-881c-dad25e557eea',
 'compressed-sequential-lobby':'414c91ae-a8ea-4ab1-a7d0-75f3664a6bf8',
 'continuous-hall-lobby':'12eb8d26-78e1-45b9-a0de-75a8c221f696',
 'topographic-ground-field-lobby':'1dd269b8-7eda-468c-b9cd-73c609cb0be1',
 'linear-gallery-lobby':'aa686595-c222-4a55-b705-f2ab41697f7d'
};
const summary={engineFiles:0,approvedAssets:0,savedStudies:0,boards:[],replays:[]};
for(const [version,list] of Object.entries(manifests))for(const item of list){assert.equal(hash(fs.readFileSync(path.join('vendor',LOBBY_ENGINES[version].package,item.file))),item.sha256,version+'/'+item.file);summary.engineFiles++;}
for(const entry of LOBBY_FINALS)for(const [name,item] of Object.entries(entry.files)){assert.equal(hash(fs.readFileSync(path.join('data/lobby-final-studies/v1',entry.folder,name))),item.sha256,entry.folder+'/'+name);summary.approvedAssets++;}
for(const file of fs.readdirSync('data/lobby-generated/v1').filter(f=>f.endsWith('.json'))){const record=JSON.parse(fs.readFileSync(path.join('data/lobby-generated/v1',file)));assert.equal(record.id+'.json',file);recordedLobbyEngine(record);assert(record.validation.passed);summary.savedStudies++;}
for(const folder of ['lobby-versioned-integration-2026-11-23','lobby-comparison-review-2026-11-24','lobby-new-design-review-2026-11-24'])for(const type of Object.keys(LOBBY_GENERATORS)){
 const file=path.join('public/reports',folder,'boards',type+'-4096px.png'),b=fs.readFileSync(file);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),4096);assert.equal(b.readUInt32BE(20),5156);let dpi=0;
 for(let at=8;at+12<=b.length;){const n=b.readUInt32BE(at);if(b.toString('ascii',at+4,at+8)==='pHYs'){assert.equal(b[at+16],1);assert.equal(b.readUInt32BE(at+8),11811);assert.equal(b.readUInt32BE(at+12),11811);dpi=300;}at+=n+12;}assert.equal(dpi,300);summary.boards.push({file:file.replaceAll('\\','/'),width:4096,height:5156,dpi,sha256:hash(b)});
}
function replay(type,expected,label){
 const engine=LOBBY_GENERATORS[type].engine,folder=fs.mkdtempSync(path.join(os.tmpdir(),'luv-publish-replay-'));
 try{
  assert.equal(recordedLobbyEngine({...expected,request:{...expected.request,engineRevision:engine},provenance:undefined}),engine);
  fs.writeFileSync(path.join(folder,'request.json'),JSON.stringify({...expected.request,proof:'lobby',generator:'source-preserving'}));
  execFileSync(process.execPath,[path.join(root,'vendor',LOBBY_ENGINES[engine].package,'scripts/amphitheater-interactive-worker.cjs'),path.join(folder,'request.json'),folder],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:4e6,stdio:['ignore','pipe','pipe']});
  const actual=JSON.parse(fs.readFileSync(path.join(folder,'result.json')));
  for(const key of ['architecture','letters','components'])assert.deepEqual(actual[key],expected[key],label+' '+key);
  assert.deepEqual(actual.request.source,expected.request.source);assert(actual.validation.passed);assert.equal(actual.validation.selfIntersectionPairs,0);
  const row={type,label,engine,architectureExact:true,sourceExact:true,lettersExact:true,componentsExact:true,strictValidationPassed:true,meshSHA256:hash(JSON.stringify(actual.architecture))};summary.replays.push(row);console.log('PASS '+label+' '+type+' '+engine);
 }finally{if(path.dirname(folder)!==path.resolve(os.tmpdir())||!path.basename(folder).startsWith('luv-publish-replay-'))throw Error('Unsafe cleanup target');fs.rmSync(folder,{recursive:true,force:true});}
}
if(process.argv.includes('--replay')){
 for(const entry of LOBBY_FINALS)replay(entry.typologyId,JSON.parse(fs.readFileSync(path.join('data/lobby-final-studies/v1',entry.folder,'architecture.json'))),'approved-'+entry.number);
 for(const [type,id] of Object.entries(fresh))replay(type,JSON.parse(fs.readFileSync('data/lobby-generated/v1/'+id+'.json')),'new-eight-letter');
}
console.log(JSON.stringify(summary,null,2));
