const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{test}=require('node:test');
require('./ts-test-register.cjs');
const {verifiedGatheringContext,prepareGatheringRequest,assertGatheringRevision,stampGatheringResult}=require('../src/server/gatheringEngineAdapter.ts');
const {gatheringContinuation,GATHERING_ENGINE_REVISION:revision}=require('../src/components/gatheringEngineProvenance.ts');
const manifest=require('../src/server/gatheringEngineManifest.json'),root=path.resolve(__dirname,'..'),id='11111111-1111-4111-8111-111111111111';
const poses=[{letter:'L',x:0},{letter:'U',x:2}],historical={id,request:{envelopeVersion:'inserted-plate',source:poses}},recorded={id,request:{...historical.request,gatheringEngineRevision:revision,gatheringEngineBundleSHA256:manifest.bundleSHA256}};
test('the matched November 22 package resolves all 63 dependencies and its private worker',async()=>{
 const result=await verifiedGatheringContext(root);assert.equal(manifest.files.length,63);assert.equal(result.packageRoot,path.join(root,'vendor/gathering-preserved'));assert.equal(result.worker,path.join(result.packageRoot,'scripts/amphitheater-interactive-worker.cjs'));assert.notEqual(result.worker,path.join(root,'scripts/amphitheater-interactive-worker.cjs'));
});
test('a dependency mismatch rejects generation without editing the package',async()=>{
 const target=manifest.files[0].path;await assert.rejects(()=>verifiedGatheringContext(root,async file=>file.endsWith(target.replaceAll('/',path.sep))?Buffer.from('different dependency'):fs.readFile(file)),/dependency differs/);
});
test('new generation adds provenance without changing source poses or an absent snapshot',async()=>{
 const request={envelopeVersion:'inserted-plate',source:structuredClone(poses)},before=JSON.stringify(request),prepared=await prepareGatheringRequest(request);assert.equal(JSON.stringify(request),before);assert.equal(prepared.source,request.source);assert(!Object.hasOwn(prepared,'sourceSnapshot'));assert.equal(prepared.gatheringEngineRevision,revision);assert.equal(prepared.gatheringEngineBundleSHA256,manifest.bundleSHA256);
});
test('recorded regeneration retains its revision and rejects unknown revisions or helper hashes',async()=>{
 const request={...recorded.request,...gatheringContinuation(recorded)};const p=await prepareGatheringRequest(request,async()=>recorded);assert.equal(p.gatheringOperation,'regenerate');assert.equal(p.gatheringEngineRevision,revision);assert.throws(()=>assertGatheringRevision({gatheringEngineRevision:'unknown'}),/Unknown saved/);assert.throws(()=>assertGatheringRevision({gatheringEngineBundleSHA256:'other'}),/dependencies differ/);
 await assert.rejects(()=>prepareGatheringRequest(request,async()=>({request:{...recorded.request,gatheringEngineRevision:'unknown'}})),/Unknown saved/);
 await assert.rejects(()=>prepareGatheringRequest(request,async()=>({...recorded,provenance:{gatheringEngine:{revision:'unknown'}}})),/Unknown saved/);
});
test('historical unversioned studies require an explicit separate verified copy',async()=>{
 const fields=gatheringContinuation(historical);assert.equal(fields.gatheringOperation,'verified-copy');const before=JSON.stringify(historical),p=await prepareGatheringRequest({...historical.request,...fields},async()=>historical);assert.equal(p.gatheringParentStudyId,id);assert.equal(p.gatheringOperation,'verified-copy');assert.equal(JSON.stringify(historical),before);
 await assert.rejects(()=>prepareGatheringRequest({...historical.request,...fields,gatheringOperation:'regenerate'},async()=>historical),/historical study has no recorded/);
});
test('parent identity, operation and typology cannot silently change',async()=>{
 await assert.rejects(()=>prepareGatheringRequest({...recorded.request,...gatheringContinuation(recorded),envelopeVersion:'void-field'},async()=>recorded),/retain the saved Gathering typology/);
 await assert.rejects(()=>prepareGatheringRequest({envelopeVersion:'inserted-plate',gatheringOperation:'regenerate'}),/requires its parent/);
 await assert.rejects(()=>prepareGatheringRequest({...recorded.request,gatheringParentStudyId:id,gatheringOperation:'new'},async()=>recorded),/Choose regeneration/);
});
test('saved results retain engine identity outside geometry and board inputs',()=>{
 const result={request:recorded.request,architecture:{positions:[0,0,0],indices:[]},letters:poses};const stamped=stampGatheringResult(result);assert.equal(stamped.architecture,result.architecture);assert.equal(stamped.letters,result.letters);assert.equal(stamped.provenance.gatheringEngine.revision,revision);assert.equal(stamped.provenance.gatheringEngine.dependencies,63);assert.throws(()=>stampGatheringResult({...result,request:historical.request}),/did not retain/);
});
