// Fresh-process cold and same-process warm bounded real-OBJ comparisons.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),guided=process.argv.includes('--guided');
const recordFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json'),record=JSON.parse(fs.readFileSync(recordFile));
const guards=[recordFile,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const out=path.join(root,'reports',`assignment-guidance-${guided?'guided':'original-order'}-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const serial=(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,runs=[];
async function main(){
  await load('extensionReconstruction').initializeExtensionReconstruction();
  const models=record.sources.map(s=>{const file=path.join(root,s.relativePath);assert.equal(hash(file),s.sha256);const obj=load('parseObj').parseObj(fs.readFileSync(file,'utf8'),path.basename(file));obj.id=s.id;return {...load('analyze').analyzeMesh(obj,null,1,'y'),sourceResponsiveExtensions:true};});
  const source=JSON.stringify(models.map(m=>m.connectionSurface),serial),options={guided,perStage:2,candidates:6,milliseconds:90000},field={cellsX:4,cellsY:4,cellsZ:1};
  for(const temperature of ['cold-search','warm-search']){
    const observations=[],started=performance.now();
    const result=await load('assignmentSearch').searchAssignmentCopies(models,4,{cancelled:()=>false,onProgress:m=>console.log(temperature,m),onEvaluation:(tiles,s)=>observations.push({tiles,classification:s.connectionDiagnostics,accepted:s.portPairs?.map(p=>({tileA:p.tileA,tileB:p.tileB,from:p.from,to:p.to})),geometry:crypto.createHash('sha256').update(JSON.stringify(s.connectors.map(c=>({positions:c.positions,indices:c.indices})),serial)).digest('hex')})},'copies-4',field,models,new Set(models.map(m=>m.id)),options);
    const durationMs=performance.now()-started;
    assert(result.searchEvidence.evaluated<=6);assert(result.tiles.every(t=>t.iz===0&&(t.zLift??0)===0));assert(result.models.every(m=>result.tiles.some(t=>t.id===m.id)));
    assert(result.status!=='PASS');assert.equal(JSON.stringify(models.map(m=>m.connectionSurface),serial),source);
    runs.push({temperature,durationMs,status:result.status,tiles:result.tiles,score:result.score,connectors:result.synthesis.connectors.length,search:result.searchEvidence,observations});
    console.log('RESULT',temperature,durationMs,result.candidatesTested,result.synthesis.connectors.length);
  }
  assert.deepEqual(runs[0].observations,runs[1].observations);
  for(const [file,sha]of guards)assert.equal(hash(file),sha,file);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({guided,options,field,runs,preservation:guards,tests:['cold/warm candidate and emitted-geometry parity','Z=1 roots/lifts preserved','no unplaced forms rendered','budget omissions explicit; no complete-search PASS','source files, source runtime arrays and checkpoint unchanged']},serial,2),{flag:'wx'});console.log('OUTPUT',out);
}
main().catch(error=>{fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,runs},serial,2),{flag:'wx'});console.error(error);process.exitCode=1;});
