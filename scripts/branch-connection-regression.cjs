const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const recordFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json'),record=JSON.parse(fs.readFileSync(recordFile));
const baseline=path.join(root,'reports/stage2d2-source-responsive-2026-10-12T04-07-20-622Z/results.json');
const guards=[recordFile,baseline,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const out=path.join(root,'reports',`stage2d2-branch-connections-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const serial=(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,tests=[],studies=[],started=performance.now();
async function main(){
  await load('extensionReconstruction').initializeExtensionReconstruction();
  const inputs=record.sources.map(s=>{const file=path.join(root,s.relativePath);assert.equal(hash(file),s.sha256);const obj=load('parseObj').parseObj(fs.readFileSync(file,'utf8'),path.basename(file));obj.id=s.id;return {...load('analyze').analyzeMesh(obj,null,1,'y'),sourceResponsiveExtensions:true};});
  const immutable=inputs.map(m=>JSON.stringify(m.connectionSurface,serial));
  const fixture=JSON.parse(fs.readFileSync(baseline)).cases.find(c=>c.label==='two authoritative LVV copies'),lvv=inputs.find(m=>m.id==='AUTH-LVV');
  const copies=[fixture.source,fixture.target].map(s=>({...lvv,id:s.id}));
  assert.equal(load('portConnectionValidation').validateCirculationConnection(structuredClone(fixture.accepted[0].pair),copies,[fixture.source.placement,fixture.target.placement],[]).reason,'accepted');tests.push({name:'accepted LVV middle-floor regression preserved',status:'PASS'});
  const session=JSON.parse(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')));assert.equal(session.unit,'feet');
  const independent=session.meshes.map((raw,i)=>{const obj={...raw,id:`INDEPENDENT-${i}`,positions:Float32Array.from(raw.positions),normals:Float32Array.from(raw.normals),faces:raw.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
    return {...load('analyze').analyzeMesh(obj,null,1,raw.upAxis),sourceResponsiveExtensions:true};
  }).filter(m=>{
    const physical=load('surfaceOrientation').surfaceOrientation(m.connectionSurface);
    return physical.components.every(c=>!c.boundaryEdges&&!c.inconsistentEdges&&!c.uncertainty)&&load('architecturalSurfaces').architecturalSurfaces(m).some(r=>r.role==='projecting branch');
  }).sort((a,b)=>{
    const width=m=>Math.max(0,...load('architecturalSurfaces').architecturalSurfaces(m).filter(r=>r.role==='projecting branch').flatMap(r=>r.sectionWidths.map(s=>s.maximumContiguousSpan)));
    return width(b)-width(a);
  }).slice(0,1);
  for(const input of [...inputs.filter(m=>load('architecturalSurfaces').architecturalSurfaces(m).some(r=>r.role==='projecting branch')).slice(0,2),...independent]){
    const mm=[{...input,id:input.id+'::A'},{...input,id:input.id+'::B'}],seeds=mm.map((m,i)=>({id:m.id,ix:i,iy:0,iz:0,variant:0}));
    console.log('BRANCH STUDY',input.filename);
    const study=await load('branchAdaptationStudy').studyBranchAdaptations(mm,seeds,{cellsX:2,cellsY:2,cellsZ:1},load('architecturalArrangement').DEFAULT_ARCHITECTURAL_PREFERENCES,{proposals:32,arrangements:2,attachments:32,routes:64,milliseconds:60000},console.log,()=>{});
    studies.push({filename:input.filename,study});
    fs.writeFileSync(path.join(out,`study-${studies.length}.json`),JSON.stringify(studies.at(-1),serial,2),{flag:'wx'});
    for(const candidate of study.arrangements){
      const models=candidate.workingModels??mm;
      for(const selected of candidate.selected){assert.equal(selected.sourceRole,'projecting branch');assert.equal(selected.targetRole,'projecting branch');assert.equal(load('portConnectionValidation').validateCirculationConnection(structuredClone(selected.pair),models,candidate.tiles,[],{fixedFootprint:true,maxRun:72}).reason,'accepted');}
    }
    console.log('COUNTS',study.evaluated,study.routes,study.arrangements.reduce((n,a)=>n+a.selected.length,0),study.adaptationAttempts?.length,study.incomplete);
  }
  assert.deepEqual(inputs.map(m=>JSON.stringify(m.connectionSurface,serial)),immutable);
  for(const [file,sha]of guards)assert.equal(hash(file),sha,file);
  tests.push({name:'all source meshes, historical checkpoint and completed baseline evidence preserved',status:'PASS'});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({durationMs:performance.now()-started,tests,studies:studies.map(({filename,study:s})=>({filename,evaluated:s.evaluated,routes:s.routes,accepted:s.arrangements.reduce((n,a)=>n+a.selected.length,0),incomplete:s.incomplete,stopReason:s.stopReason,attempts:s.adaptationAttempts,rejections:s.arrangements.map(a=>({id:a.id,rejections:a.rejections,screening:a.screening,packing:a.packing}))})),preservation:guards},serial,2),{flag:'wx'});console.log('OUTPUT',out);
}
main().catch(error=>{fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,tests,studies:studies.map(s=>({filename:s.filename,routes:s.study.routes})),preservation:guards.map(([file,sha])=>{try{return {file,unchanged:hash(file)===sha};}catch(e){return {file,status:'UNVERIFIED',error:String(e)};}})},serial,2),{flag:'wx'});console.error(error);process.exitCode=1;});
