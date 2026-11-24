/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS harness installs a TypeScript require hook for checkpoint replay. */
// Deterministic original OBJ fixture: no assignment search or form relocation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),checkpoint='6d0b6f8496cb5b08b0a151def3215fcc05dea5ff';
const baseline=process.argv.includes('--checkpoint'),benchmark=process.argv.includes('--benchmark');
require.extensions['.ts']=(m,f)=>{const source=baseline?cp.execFileSync('git',['show',checkpoint+':'+path.relative(root,f).replaceAll('\\','/')],{cwd:root,encoding:'utf8',maxBuffer:8e6}):fs.readFileSync(f,'utf8');m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);};
const load=n=>require('../src/components/lattice/'+n+'.ts'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const {analyzeMesh}=load('analyze'),{surfaceOrientation}=load('surfaceOrientation'),{worldFromLocal}=load('surfaceAttachment');
const {evaluateAssembly}=load('search'),{matchAssemblyPorts}=load('portMatching'),{synthesizeConnectors}=load('connectionSynthesis');
const bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')),session=JSON.parse(bytes),out=path.join(root,'reports/interior-approaches');fs.mkdirSync(out,{recursive:true});
const geometry=m=>hash(JSON.stringify([Array.from(m.positions),Array.from(m.normals),m.faces]));
const sources=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{
  const p=session.meshes.find(m=>m.id===session.assignments[code]),mesh={...p,positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
  const before=geometry(mesh),start=performance.now(),model=analyzeMesh(mesh,code,1,mesh.upAxis);return {code,mesh,before,model,analysisMs:performance.now()-start,tile:{id:mesh.id,ix,iy,iz:0,variant}};
});
const models=sources.map(s=>s.model),tiles=sources.map(s=>s.tile),fixture=JSON.parse(fs.readFileSync(path.join(root,'reports/local-material/surface-regression.json')));
const normal=v=>JSON.parse(JSON.stringify(v,(k,v)=>['ms','cacheHit','timing','clearanceEvidence'].includes(k)?undefined:v instanceof Float32Array?Array.from(v):v));
const report={checkpoint,node:process.version,mode:baseline?'checkpoint':'updated',sources:sources.map(s=>({code:s.code,filename:s.mesh.filename,geometrySHA256:s.before,placement:s.tile,analysisMs:s.analysisMs,classificationMs:surfaceOrientation(s.model.connectionSurface).buildMs})),trials:[],checks:[],fullSearch:'NOT RUN',stage2B:'NOT STARTED'};
let synthesis;
for(let i=0;i<4;i++){const tick=performance.now(),evaluation=evaluateAssembly(models,tiles),ports=matchAssemblyPorts(models,tiles,evaluation.connections);synthesis=synthesizeConnectors(models,tiles,evaluation.connections,{...ports,portPairs:ports.pairs});report.trials.push({cache:i?'warm':'cold',ms:performance.now()-tick});assert.deepEqual(normal(synthesis.connectors),fixture.connectors);assert.equal(synthesis.organicDiagnostics.components,2);assert.deepEqual(synthesis.organicDiagnostics.isolated,[session.assignments.L1]);assert.equal(ports.confirmedReports.length,0);}
report.checks.push('Original two links / six emitted mesh pieces identical; two components and L1 isolated; invalid voxel links rejected');
if(!baseline&&!benchmark){
  const {evaluateQualifiedInteriorRoutes,validateAlternative}=load('alternativeRouting'),{discoverInteriorApproaches}=load('interiorApproaches'),{validateWalkingApproach}=load('walkingApproach');
  const targets=['B','A','C'].flatMap(name=>[3,2.1].map(width=>{const e=fixture.approaches.find(e=>e.name===name),side=[-e.outward[1],e.outward[0],0];return {id:name+'-'+width,point:e.point,outward:e.outward,width,kind:'edge',snap:0,run:[e.point.map((v,k)=>v-side[k]*width/2),e.point.map((v,k)=>v+side[k]*width/2)]};}));
  const budget={attachments:128,pairs:96,routes:768,maxSpan:50,maxRun:72};report.relationships=[];
  for(const s of [sources[1],sources[2],sources[0]]){
    const result=evaluateQualifiedInteriorRoutes(models,tiles,s.model.id,session.assignments.L1,targets,fixture.connectors,budget,512);
    const warm=evaluateQualifiedInteriorRoutes(models,tiles,s.model.id,session.assignments.L1,targets,fixture.connectors,budget,512);
    assert.equal(hash(JSON.stringify(normal(result))),hash(JSON.stringify(normal(warm))),'cold/warm discovery and routing differ');
    assert.equal(warm.discovery.cacheHit,true);assert.equal(result.discovery.omitted,0,'fixture proposal cap unexpectedly omits windows');
    for(const accepted of result.accepted)assert.equal(validateAlternative(structuredClone(accepted.pair),models,tiles,fixture.connectors,budget,accepted.route).reason,'accepted');
    report.relationships.push({...result,warmTiming:warm.timing});
    console.log(JSON.stringify({code:s.code,proposed:result.discovery.tested,qualified:result.discovery.qualified.length,pairs:result.qualifiedPairs.length,routes:result.outcomes.length,accepted:result.accepted.length,cold:result.timing,warm:warm.timing}));
  }
  // Compare the indexed validator against the checkpoint's unrestricted spatial
  // implementation on every proposed original-mesh footprint (not sample boxes).
  const f=path.join(root,'src/components/lattice/walkingApproach.ts'),reference=new Module(f);reference.filename=f;reference.paths=Module._nodeModulePaths(path.dirname(f));
  reference._compile(ts.transpileModule(cp.execFileSync('git',['show',checkpoint+':src/components/lattice/walkingApproach.ts'],{cwd:root,encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
  let comparisons=0;
  for(const relationship of report.relationships){const s=sources.find(s=>s.model.id===relationship.source.id);
    for(const o of relationship.discovery.outcomes)for(const walk of o.walking){
      const old=reference.exports.validateWalkingApproach(s.model,s.tile,o.anchor.point,o.anchor.outward,o.anchor.width,walk.depth,models,tiles,fixture.connectors);
      assert.equal(walk.result.valid,old.valid,'spatial index or prefix shortcut changes support/clearance');
      if(walk.depth===2||walk.result.valid)assert.equal(walk.result.reason,old.reason);
      if(old.valid){assert.equal(walk.result.details.minHeadroom,old.details.minHeadroom);assert.equal(walk.result.details.region,old.details.region);}
      comparisons++;
    }
  }
  report.checks.push('Indexed/pruned support and clearance match the original full-scan validator on '+comparisons+' footprint tests');
  console.log('Full-scan parity passed for '+comparisons+' footprints');
  const oldInterfaces=JSON.parse(fs.readFileSync(path.join(root,'reports/post-correction-review/route-audit.json'))).rows;report.originalInterfaces=[];
  const originalRoutes=JSON.parse(fs.readFileSync(path.join(root,'reports/surface-orientation/corrected.json'))).routes;
  for(const relationship of originalRoutes)for(const outcome of relationship.outcomes.filter(o=>o.route==='direct')){const p=outcome.pair,s=sources.find(s=>s.model.id===p.tileA),old=oldInterfaces.find(o=>o.source===s.code&&o.sourcePort===p.portA&&o.target===p.portB);
    const walking=validateWalkingApproach(s.model,s.tile,p.from,p.startDirection,p.startWidth,2,models,tiles,fixture.connectors),landing=validateWalkingApproach(s.model,s.tile,p.from,p.startDirection,p.startWidth,Math.max(3,p.startWidth),models,tiles,fixture.connectors,true);
    assert.equal(walking.valid,old.rampApproach.valid);assert.equal(landing.valid,old.stairLanding.valid);report.originalInterfaces.push({source:s.code,pair:p,walking,landing});
  }
  assert.equal(report.originalInterfaces.length,24);assert.equal(report.originalInterfaces.filter(x=>x.walking.valid).length,3);
  const l=sources[3],b=targets[0],opts={windows:1,anchors:[b]};
  const eligible=r=>normal(r.outcomes.map(o=>({stage:o.stage,reason:o.reason,walking:o.walking.map(w=>({depth:w.depth,valid:w.result.valid,reason:w.result.reason}))})));
  const original=discoverInteriorApproaches(l.model,l.tile,models,tiles,fixture.connectors,opts);assert(original.qualified[0].walking.every(w=>w.result.valid));assert(original.qualified[0].landing.valid);
  const obstacle={positions:Float32Array.from([39,11.8,9,41,11.8,9,40,11.8,14]),indices:[0,1,2]},obstacles=[...fixture.connectors,obstacle];
  const blocked=discoverInteriorApproaches(l.model,l.tile,models,tiles,obstacles,opts);assert.equal(blocked.qualified.length,0);
  for(let i=2;i<obstacle.positions.length;i+=3)obstacle.positions[i]+=100;
  assert.equal(discoverInteriorApproaches(l.model,l.tile,models,tiles,obstacles,opts).qualified.length,1,'obstacle edit left stale rejection');
  obstacle.positions[2]-=100;obstacle.positions[5]-=100;obstacle.positions[8]-=100;obstacle.indices=[];
  assert.equal(discoverInteriorApproaches(l.model,l.tile,models,tiles,obstacles,opts).qualified.length,1,'empty obstacle topology left stale block');
  const clone={...l.model,variants:l.model.variants.map(v=>({...v})),connectionSurface:{positions:l.model.connectionSurface.positions.slice(),triangles:[...l.model.connectionSurface.triangles]}};
  const clones=[...models.slice(0,3),clone];assert.equal(discoverInteriorApproaches(clone,l.tile,clones,tiles,fixture.connectors,opts).qualified.length,1);
  clone.connectionSurface.triangles.length=0;assert.equal(discoverInteriorApproaches(clone,l.tile,clones,tiles,fixture.connectors,opts).qualified.length,0);
  clone.connectionSurface.triangles=[...l.model.connectionSurface.triangles];for(let i=2;i<clone.connectionSurface.positions.length;i+=3)clone.connectionSurface.positions[i]+=100;
  assert.equal(discoverInteriorApproaches(clone,l.tile,clones,tiles,fixture.connectors,opts).qualified.length,0);
  for(const tile of [{...l.tile,ix:3},{...l.tile,zLift:3},{...l.tile,variant:0},{...l.tile,variant:1}]){
    const movedTiles=[...tiles.slice(0,3),tile],actual=discoverInteriorApproaches(l.model,tile,models,movedTiles,fixture.connectors,opts);
    const fresh={...l.model,connectionSurface:{positions:l.model.connectionSurface.positions.slice(),triangles:[...l.model.connectionSurface.triangles]}};
    assert.deepEqual(eligible(actual),eligible(discoverInteriorApproaches(fresh,tile,[...models.slice(0,3),fresh],movedTiles,fixture.connectors,opts)));
  }
  report.checks.push('Original 24 interfaces unchanged; B 3 ft × 2/4/6 ft and 3 ft landing preserved; narrow obstruction rejected; discovery invalidates on obstruction/source geometry/topology and placement/lift/orientation');
  const legacyWindows=JSON.parse(fs.readFileSync(path.join(root,'reports/local-material/windows-updated.json')));
  const windowKey=w=>JSON.stringify([w.point,w.run,w.width,w.outward],(k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);
  report.additional=report.relationships.map(r=>{
    const s=sources.find(s=>s.model.id===r.source.id),legacy=new Set(legacyWindows.find(x=>x.code===s.code).anchors.map(windowKey));
    return {code:s.code,qualified:r.discovery.qualified.map(q=>({anchor:q.anchor,depths:q.walking.filter(w=>w.result.valid).map(w=>({depth:w.depth,...w.result.details})),landing:q.landing,previouslyEnumerated:legacy.has(windowKey(q.anchor)),matchesOriginalPassingInterface:report.originalInterfaces.some(o=>o.source===s.code&&o.walking.valid&&Math.hypot(...o.pair.from.map((v,k)=>v-q.anchor.point[k]))<1e-6&&Math.abs(o.pair.startWidth-q.anchor.width)<1e-6)}))};
  });
  report.qualifyingBPairs=report.relationships.flatMap(r=>r.qualifiedPairs.filter(p=>p.pair.portB.startsWith('B-')).map(p=>({sourceFilename:r.source.filename,...p})));
  assert.equal(report.relationships.reduce((n,r)=>n+r.qualifiedPairs.length,0),34);
  assert.equal(report.qualifyingBPairs.length,2);
  assert(report.qualifyingBPairs.every(p=>p.pair.tileA===session.assignments.G1&&p.source.walking[0].result.details.region===58));
  assert(report.relationships.every(r=>r.accepted.length===0&&r.omittedPairs===0&&r.untestedSelectedPairs===0));
  // Diagnostic-only independent clearance on the exact rejected B route geometry.
  // This does not promote a preflight failure or assume a repaired mesh will clear.
  const {transitionSurfaceClear}=load('connectionClearance'),{captureConnectionDiagnostics}=load('connectionDiagnostics');
  report.bIndependentClearance=report.relationships.flatMap(r=>r.outcomes.filter(o=>o.pair.portB.startsWith('B-')).map(o=>{
    const check=captureConnectionDiagnostics(()=>transitionSurfaceClear(o.pair,tiles,models,fixture.connectors),16);
    return {source:o.pair.portA,target:o.pair.portB,route:o.route,firstFailure:o.reason,clear:check.value,events:check.trace.events.filter(e=>e.stage==='clearance')};
  }));
  const {tileRootMatrix}=load('objFidelity'),THREE=require('three');report.transforms=sources.map(s=>{const v=s.model.variants[s.tile.variant],matrix=tileRootMatrix(s.mesh,{...s.tile,rotation:v.rotation,mirror:v.mirror},1,'auto');let maxError=0;for(let i=0;i<s.mesh.positions.length;i+=3){const p=new THREE.Vector3(...s.mesh.positions.slice(i,i+3)).applyMatrix4(matrix),actual=worldFromLocal(Array.from(s.model.connectionSurface.positions.slice(i,i+3)),s.tile,s.model);maxError=Math.max(maxError,Math.hypot(actual[0]-p.x,actual[1]-p.z,actual[2]-p.y));}assert(maxError<1e-5);return {code:s.code,vertices:s.mesh.positions.length/3,maxError};});
  report.checks.push('All original vertices preserve renderer-root parity within 1e-5 ft; new acceptance requires complete existing route validation');
}
for(const s of sources)assert.equal(geometry(s.mesh),s.before);report.sessionSHA256=hash(bytes);assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),report.sessionSHA256);
report.checks.push('Original OBJ positions/normals/faces and full session hashes unchanged');
fs.writeFileSync(path.join(out,baseline?'benchmark-checkpoint.json':benchmark?'benchmark-updated.json':'updated.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:report.checks,trials:report.trials}));
