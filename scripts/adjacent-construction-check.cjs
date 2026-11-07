// Bounded original-OBJ replay plus analytic path checks; never a global search.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const recordFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json');
const record=JSON.parse(fs.readFileSync(recordFile)),baselineFile=path.join(root,'reports/stage2d2-source-responsive-2026-10-12T04-07-20-622Z/results.json');
const guards=[recordFile,baselineFile,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const serial=(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,results=[],tests=[],started=performance.now();let out;
async function main(){
  const adjacent=load('adjacentConnections').sideAdjacentRegistration,a={id:'a',ix:0,iy:0,iz:0,variant:0};
  assert(adjacent(a,{...a,id:'b',ix:1}));assert(!adjacent(a,{...a,ix:1,iy:1}));assert(!adjacent(a,{...a,ix:1,iz:1}));
  tests.push('Face-neighbor eligibility excludes diagonal/stacked bays; no material certificate inferred');
  const pair={tileA:'a',tileB:'b',from:[0,0,0],to:[20,8,1],startDirection:[1,0,0],endDirection:[0,-1,0],startWidth:2.1,endWidth:2.1,usableWidth:2.1,rise:1,plan:Math.hypot(20,8)};
  const original=JSON.stringify(pair),route=load('alternativeRouting').landingTransitionPath(pair,4);assert(route);
  assert.deepEqual(route[0],pair.from);assert.deepEqual(route.at(-1),pair.to);assert.equal(JSON.stringify(pair),original);
  assert(route.slice(0,7).every(p=>p[2]===0));assert(route.slice(-6).every(p=>p[2]===1));
  tests.push('Nonopposing headings construct separate flat endpoint landings without source mutation');
  const climbing=route.slice(1).filter((p,i)=>Math.abs(p[2]-route[i][2])>1e-9).reduce((s,p)=>s+Math.hypot(p[0]-route[route.indexOf(p)-1][0],p[1]-route[route.indexOf(p)-1][1]),0);
  assert(load('transitionGeometry').planRun(route)>climbing+5.9);
  tests.push('Flat endpoint landing distance is separate from actual climbing run');
  if(process.argv.includes('--analytic-only')){console.log(JSON.stringify({tests},null,2));return;}
  await load('extensionReconstruction').initializeExtensionReconstruction();
  out=path.join(root,'reports','adjacent-construction-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out);
  const models=record.sources.map(s=>{const f=path.join(root,s.relativePath);assert.equal(hash(f),s.sha256);const obj=load('parseObj').parseObj(fs.readFileSync(f,'utf8'),path.basename(f));obj.id=s.id;return {...load('analyze').analyzeMesh(obj,null,1,'y'),sourceResponsiveExtensions:true};});
  const unchanged=models.map(m=>JSON.stringify(m.connectionSurface,serial));
  const fixture=JSON.parse(fs.readFileSync(baselineFile)).cases.find(c=>c.label==='two authoritative LVV copies'),lvv=models.find(m=>m.id==='AUTH-LVV');
  const copies=[fixture.source,fixture.target].map(s=>({...lvv,id:s.id}));
  assert.equal(load('portConnectionValidation').validateCirculationConnection(structuredClone(fixture.accepted[0].pair),copies,[fixture.source.placement,fixture.target.placement],[]).reason,'accepted');
  tests.push('Previously accepted real LVV middle-floor connector remains accepted');
  const cases=[['authoritative LCH–LVV adjacent',models.filter(m=>['AUTH-LCH','AUTH-LVV'].includes(m.id))],['authoritative GL–GVF adjacent',models.filter(m=>['AUTH-GL','AUTH-GVF'].includes(m.id))]];
  for(const [label,mm]of cases){
    console.log('CASE',label);const tiles=mm.map((m,i)=>({id:m.id,ix:i,iy:0,iz:0,variant:0})),tick=performance.now();
    const result=load('portMatching').matchAssemblyPorts(mm,tiles,[],{},true,true);
    const synthesis=load('connectionSynthesis').synthesizeConnectors(mm,tiles,[],{portPairs:result.pairs,...result});
    results.push({label,tiles,ms:performance.now()-tick,accepted:synthesis.portPairs.length,connectors:synthesis.connectors.length,components:synthesis.organicDiagnostics?.components,construction:result.constructionDiagnostics,rejectionCounts:result.rejectionCounts});
    for(const pair of synthesis.portPairs)assert.equal(load('portConnectionValidation').validateCirculationConnection(structuredClone(pair),mm,tiles,[]).reason,'accepted');
    console.log(JSON.stringify(results.at(-1)));fs.writeFileSync(path.join(out,'case-'+results.length+'.json'),JSON.stringify(results.at(-1),serial,2),{flag:'wx'});
    if(process.argv.includes('--adjustments')){
      const study=await load('branchAdaptationStudy').studyBranchAdaptations(mm,tiles,{cellsX:2,cellsY:2,cellsZ:1},load('architecturalArrangement').DEFAULT_ARCHITECTURAL_PREFERENCES,
        {proposals:8,arrangements:2,attachments:16,routes:16,milliseconds:15000},console.log,()=>{},true);
      const summary={label,durationMs:study.durationMs,evaluated:study.evaluated,routes:study.routes,incomplete:study.incomplete,stopReason:study.stopReason,
        accepted:study.arrangements.reduce((n,a)=>n+a.selected.length,0),attempts:study.adaptationAttempts,rejections:study.arrangements.map(a=>({id:a.id,packing:a.packing,rejections:a.rejections,screening:a.screening}))};
      results.at(-1).adjustment=summary;fs.writeFileSync(path.join(out,'adjustment-'+results.length+'.json'),JSON.stringify(summary,serial,2),{flag:'wx'});
      console.log('ADJUSTMENT COUNTS',summary.evaluated,summary.routes,summary.accepted,summary.incomplete);
    }
  }
  assert.deepEqual(models.map(m=>JSON.stringify(m.connectionSurface,serial)),unchanged);
  for(const [f,sha]of guards)assert.equal(hash(f),sha,f);
  tests.push('All four source OBJs, checkpoint, orientation record and previous evidence unchanged');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({durationMs:performance.now()-started,tests,results,preservation:guards},serial,2),{flag:'wx'});console.log('OUTPUT',out);
}
main().catch(error=>{if(out)fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,tests,results},serial,2),{flag:'wx'});console.error(error);process.exitCode=1;});
