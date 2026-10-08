// Stage 2A: fixed original placements only; no assignment search or application UI mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {analyzeMesh}=require('../src/components/lattice/analyze.ts');
const {evaluateAssembly}=require('../src/components/lattice/search.ts');
const {matchAssemblyPorts}=require('../src/components/lattice/portMatching.ts');
const {synthesizeConnectors}=require('../src/components/lattice/connectionSynthesis.ts');
const {evaluateAlternativeRoutes,DEFAULT_ROUTING_BUDGET,validateAlternative,routeAlternatives}=require('../src/components/lattice/alternativeRouting.ts');
const root=path.resolve(__dirname,'..'),file=path.join(root,'checkpoints/lattice-session.json');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const bytes=fs.readFileSync(file),session=JSON.parse(bytes),sessionHash=sha(bytes);
const geometry=m=>sha(JSON.stringify([Array.from(m.positions),Array.from(m.normals),m.faces]));
const sources=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{
  const p=session.meshes.find(m=>m.id===session.assignments[code]);
  const mesh={...p,positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals??[]),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
  const before=geometry(mesh),model=analyzeMesh(mesh,code,1,mesh.upAxis);
  return {code,mesh,before,model,tile:{id:mesh.id,ix,iy,iz:0,variant}};
});
const models=sources.map(s=>s.model),tiles=sources.map(s=>s.tile);
const baseStart=performance.now(),evaluation=evaluateAssembly(models,tiles),ports=matchAssemblyPorts(models,tiles,evaluation.connections);
const base=synthesizeConnectors(models,tiles,evaluation.connections,{...ports,portPairs:ports.pairs});
const baseMs=performance.now()-baseStart;
assert.equal(base.organicDiagnostics.components,2);assert.deepEqual(base.organicDiagnostics.isolated,[session.assignments.L1]);
const budget={...DEFAULT_ROUTING_BUDGET};
const pairArg=process.argv.find(s=>s.startsWith('--pairs='));if(pairArg)budget.pairs=Number(pairArg.split('=')[1]);
const regionArg=process.argv.find(s=>s.startsWith('--attachments='));if(regionArg)budget.attachments=Number(regionArg.split('=')[1]);
budget.routes=budget.pairs*8;
const trials=[],results=[];
const normalized=r=>JSON.stringify({outcomes:r.outcomes.map(({route,pair,reason})=>({route,pair,reason})),accepted:r.accepted.map(c=>({route:c.route,pair:c.pair,meshes:c.meshes.map(m=>({...m,positions:Array.from(m.positions)}))}))});
for(let trial=0;trial<2;trial++){
  const rows=[];
  for(const code of ['O1','G1','O2']){
    const result=evaluateAlternativeRoutes(models,tiles,session.assignments[code],session.assignments.L1,base.connectors,budget);
    if(trial)assert.equal(normalized(result),normalized(results.find(r=>r.source.id===result.source.id)),'cold/warm route parity');
    else results.push(result);
    rows.push({code,timing:result.timing,cache:result.cache,counts:result.counts,attachments:result.attachments,pairs:result.pairs,routes:result.outcomes.length});
    console.log(JSON.stringify({trial,code,...rows.at(-1)}));
  }
  trials.push(rows);
}
// Each relationship was evaluated against the same baseline. Do not merge mutually untested alternatives.
const successes=results.flatMap(r=>r.accepted),selected=successes[0];
if(selected)assert.equal(validateAlternative(structuredClone(selected.pair),models,tiles,base.connectors,budget,selected.route).reason,'accepted');
assert.throws(()=>evaluateAlternativeRoutes(models,tiles,tiles[0].id,tiles[3].id,[],{...budget,routes:Infinity}));
const checks=['Baseline two components and L1 isolated','Identical cold/warm outcomes and emitted geometry','Hard budget guard rejects unbounded routing'];
for(const result of results){
  assert(result.outcomes.length<=budget.routes);
  assert(result.pairs.selected<=budget.pairs);
  assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),result.outcomes.length);
  for(const candidate of result.outcomes) {
    assert.deepEqual(candidate.pair.path[0],candidate.pair.from);
    assert.deepEqual(candidate.pair.path.at(-1),candidate.pair.to);
  }
}
const example=results[0].outcomes[0].pair;
assert.equal(routeAlternatives(example).length,8);
const tooNarrow={...structuredClone(example),usableWidth:1,startWidth:1,endWidth:1};
assert.notEqual(validateAlternative(tooNarrow,models,tiles,base.connectors,budget).reason,'accepted');
// Cold/warm caching must not manufacture a clear landing in the original lobby.
const {landingHeadroomCheck}=require('../src/components/lattice/connectionClearance.ts');
const blockedPoint=[35.84433937072754,11.737,6.396];
assert.equal(landingHeadroomCheck([blockedPoint],tiles,models).clear,false);
const displaced=models.map(m=>({...m,connectionSurface:{positions:m.connectionSurface.positions.slice(),triangles:[...m.connectionSurface.triangles]}}));
for(const m of displaced)for(let i=2;i<m.connectionSurface.positions.length;i+=3)m.connectionSurface.positions[i]+=100;
assert.equal(landingHeadroomCheck([blockedPoint],tiles,displaced).clear,true);
checks.push('Route/pair budgets, all eight route families and exact endpoint continuity','Too-narrow route rejected','Actual lobby headroom blocked; moved cloned geometry invalidates cached spatial index');
const {planRun}=require('../src/components/lattice/transitionGeometry.ts');
const deceptiveAverage=results.flatMap(r=>r.outcomes).find(o=>o.reason==='individual ramp segment slope'&&Math.abs(o.pair.rise)/planRun(o.pair.path)<=1/12);
assert(deceptiveAverage,'Fixture must exercise average-slope false positive');
assert.equal(validateAlternative(structuredClone(deceptiveAverage.pair),models,tiles,base.connectors,budget,deceptiveAverage.route).reason,'individual ramp segment slope');
const shortLanding=results.flatMap(r=>r.outcomes).find(o=>o.reason==='switchback landing length');
assert(shortLanding);assert.equal(validateAlternative(structuredClone(shortLanding.pair),models,tiles,base.connectors,budget,shortLanding.route).reason,'switchback landing length');
const disconnected=structuredClone(example);disconnected.path[0]=[...disconnected.path[0]];disconnected.path[0][2]+=1;
assert.equal(validateAlternative(disconnected,models,tiles,base.connectors,budget).reason,'route endpoint discontinuity');
checks.push('Average ramp slope cannot hide steep individual walking-edge segments','Short switchback landing rejected independently','Disconnected route endpoint rejected');
for(const s of sources)assert.equal(geometry(s.mesh),s.before);
assert.equal(sha(fs.readFileSync(file)),sessionHash);checks.push('Original positions/normals/faces and raw session unchanged');
// A single verified added edge would connect object nodes, but cannot prove circulation inside each OBJ.
// Keep every outcome and its actual endpoints, but only representative rejected paths to bound artifact size.
const compactResults=results.map(r=>{
  const samples=new Set();
  return {...r,outcomes:r.outcomes.map(o=>{
    const key=o.route+'|'+o.reason,keep=!samples.has(key);samples.add(key);
    return {...o,pair:keep?o.pair:{...o.pair,path:undefined},details:keep?o.details:undefined};
  })};
});
const report={checkpoint:'a0cef60c0baaec6847b37404745a003c5110fd52',node:process.version,field:[4,4,1],sessionSHA256:sessionHash,
  sources:sources.map(s=>({code:s.code,filename:s.mesh.filename,placement:s.tile,geometrySHA256:s.before})),budget,baselineMs:baseMs,trials,
  before:{objectComponents:2,isolated:['L1']},after:{objectComponents:selected?1:2,isolated:selected?[]:['L1'],fullyValidatedCirculation:false,internalContinuity:'unverified'},
  selected,results:compactResults,checks,fullSearch:'NOT RUN',stage2B:'NOT STARTED'};
const out=path.join(root,'reports/stage2a');fs.mkdirSync(out,{recursive:true});
const label=process.argv.find(s=>s.startsWith('--label='))?.split('=')[1]??'routing';
fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,(k,v)=>v instanceof Float32Array?Array.from(v):v)+'\n');
console.log(JSON.stringify({accepted:successes.length,after:report.after,checks}));
