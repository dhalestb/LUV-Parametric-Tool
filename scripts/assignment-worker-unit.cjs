// Analytic lifecycle tests, not proof of browser geometry/connector success.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>{let source=fs.readFileSync(f,'utf8');if(f.endsWith('assignmentWorkerClient.ts'))source=source.replace('import.meta.url','"file:///analytic-worker-harness"');m._compile(ts.transpileModule(source,{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);};
class WorkerMock{constructor(){global.lastWorker=this;this.terminated=0;}postMessage(request){this.request=structuredClone(request);}terminate(){this.terminated++;}}
global.Worker=WorkerMock;
const {startAssignmentJob}=require(path.join(root,'src/components/lattice/assignmentWorkerClient.ts'));
const source={id:'arbitrary-upload',anchor:[0,0,0],variants:[{rotation:0,mirror:'none'}],connectionSurface:{positions:Float32Array.of(0,0,0,1,0,0,0,1,0),triangles:[0,1,2]}};
const start=()=>startAssignmentJob([source],2,'copies-2',{cellsX:4,cellsY:4,cellsZ:1},[{...source,id:source.id+'::3'}],()=>{}, {guided:true,perStage:2,candidates:6,milliseconds:1000});
async function main(){
  let job=start(),worker=global.lastWorker;
  assert.deepEqual(worker.request.seedIds,[source.id]);assert.notEqual(worker.request.models[0].connectionSurface.positions.buffer,source.connectionSurface.positions.buffer);
  const pending=assert.rejects(job.result,/cancelled/),before=performance.now();job.cancel();await pending;assert.equal(worker.terminated,1);assert(performance.now()-before<100);
  console.log('PASS immediate cancellation terminates worker; source buffers are not detached; instance seeds resolve to original sources');
  job=start();worker=global.lastWorker;const stale=assert.rejects(job.result,/stale assembly rejected/);source.connectionSurface.positions[0]=.5;worker.onmessage({data:{kind:'result',result:{status:'REVIEW'}}});await stale;source.connectionSurface.positions[0]=0;
  console.log('PASS in-place geometry changes reject stale worker validation');
  job=start();worker=global.lastWorker;const moved=assert.rejects(job.result,/stale assembly rejected/);source.variants[0].rotation=90;worker.onmessage({data:{kind:'result',result:{status:'REVIEW'}}});await moved;source.variants[0].rotation=0;
  console.log('PASS orientation changes reject stale worker validation');
  job=start();worker=global.lastWorker;worker.onmessage({data:{kind:'result',result:{status:'REVIEW'}}});assert.equal((await job.result).status,'REVIEW');assert.equal(worker.terminated,0);
  const previous=worker;job=start();worker=global.lastWorker;assert.equal(worker,previous);const cancellation=assert.rejects(job.result,/cancelled/);job.cancel();await cancellation;assert.equal(worker.terminated,1);
  console.log('PASS successful job retains one idle worker; next job reuses it; cancellation still terminates it');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
