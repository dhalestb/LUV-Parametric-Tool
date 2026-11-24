// Bounded original-OBJ regression; --baseline loads only checkpoint source via git show.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline'),checkpoint='5d3c808fb195190b87223766e4d44571d0844b21';
require.extensions['.ts']=(module,file)=>{
  const rel=path.relative(root,file).replaceAll('\\','/');
  const source=baseline?cp.execFileSync('git',['show',checkpoint+':'+rel],{cwd:root,encoding:'utf8',maxBuffer:8e6}):fs.readFileSync(file,'utf8');
  module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
};
const load=n=>require('../src/components/lattice/'+n+'.ts');
const {analyzeMesh}=load('analyze'),{evaluateAssembly}=load('search'),{matchAssemblyPorts}=load('portMatching'),{synthesizeConnectors}=load('connectionSynthesis');
const {measureSurfaceGap,worldFromLocal,fitLoftContact}=load('surfaceAttachment');
const {captureConnectionDiagnostics}=load('connectionDiagnostics');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')),session=JSON.parse(bytes);
const geometry=m=>hash(JSON.stringify([Array.from(m.positions),Array.from(m.normals),m.faces]));
const sources=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{
  const packed=session.meshes.find(m=>m.id===session.assignments[code]);
  const mesh={...packed,positions:Float32Array.from(packed.positions),normals:Float32Array.from(packed.normals??[]),faces:packed.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
  const before=geometry(mesh),start=performance.now(),model=analyzeMesh(mesh,code,1,mesh.upAxis);
  return {code,mesh,before,model,analysisMs:performance.now()-start,tile:{id:mesh.id,ix,iy,iz:0,variant}};
});
const models=sources.map(s=>s.model),tiles=sources.map(s=>s.tile),l=sources[3];
const evaluate=()=>{const evaluation=evaluateAssembly(models,tiles),ports=matchAssemblyPorts(models,tiles,evaluation.connections);return {evaluation,ports,synthesis:synthesizeConnectors(models,tiles,evaluation.connections,{...ports,portPairs:ports.pairs})};};
const trials=[];let first,signature;
const normalize=v=>JSON.parse(JSON.stringify(v,(k,v)=>v instanceof Float32Array?Array.from(v):v));
for(let i=0;i<4;i++){
  const start=performance.now(),value=evaluate(),elapsedMs=performance.now()-start;
  const next=JSON.stringify(normalize(value.synthesis));
  if(i)assert.equal(next,signature,'cold/warm synthesis parity');else {signature=next;first=value;}
  trials.push({cache:i?'warm':'cold',elapsedMs});
}
const probes=[.3247623145580292,2.1987321376800537,6.387557506561279,8.357694625854492,18.513168334960938,20.331989288330078].map(z=>({point:[48,12,z],gap:measureSurfaceGap(l.model,l.tile,[48,12,z],.5)}));
const report={checkpoint,mode:baseline?'checkpoint':'corrected',node:process.version,sessionSHA256:hash(bytes),sources:sources.map(s=>({code:s.code,filename:s.mesh.filename,placement:s.tile,geometrySHA256:s.before,analysisMs:s.analysisMs,ports:s.model.variants.map(v=>v.ports)})),trials,probes,
  connectors:normalize(first.synthesis.connectors),components:first.synthesis.organicDiagnostics.components,isolated:first.synthesis.organicDiagnostics.isolated,
  reports:first.evaluation.connections,confirmedReports:first.ports.confirmedReports,checks:[],fullSearch:'NOT RUN',stage2B:'NOT STARTED'};
const out=path.join(root,'reports/surface-orientation');fs.mkdirSync(out,{recursive:true});
if(!baseline){
  const old=JSON.parse(fs.readFileSync(path.join(out,'baseline.json')));
  assert.deepEqual(report.connectors,old.connectors,'existing ramp/stair emitted geometry and reports');
  assert.equal(report.components,2);assert.deepEqual(report.isolated,[l.mesh.id]);
  assert.equal(first.ports.confirmedReports.length,0,'invalid voxel-only graph edges');
  report.checks.push('Existing ramp/stair connectors exactly match checkpoint; two components, L1 isolated; no voxel-only graph edges');
  probes.forEach((p,i)=>assert(i%2?['floor','edge'].includes(p.gap.kind):p.gap.kind==='underside'));
  const {surfaceOrientation,sourceMaterialAtPoint}=load('surfaceOrientation');
  report.classification=sources.map(s=>{
    const m=surfaceOrientation(s.model.connectionSurface),t=performance.now();assert.equal(surfaceOrientation(s.model.connectionSurface),m);
    return {code:s.code,buildMs:m.buildMs,warmLookupMs:performance.now()-t,regions:m.regionCount,components:m.components.map(c=>({...c,triangles:c.triangles.length})),rawUp:m.triangles.filter(t=>t.rawNormal[2]>=.7).length,physicalUp:m.triangles.filter(t=>t.normalZ>=.7).length,
      withheldUp:m.triangles.filter(t=>t.rawNormal[2]>=.7&&!Number.isFinite(t.normalZ)).length,withheldArea:m.triangles.filter(t=>t.rawNormal[2]>=.7&&!Number.isFinite(t.normalZ)).reduce((s,t)=>s+t.area,0)};
  });
  assert(report.classification.slice(0,3).every(s=>s.components.every(c=>c.sign===1)));
  assert.equal(report.classification[3].components[0].sign,-1);
  report.material=[6.5,8.2576946,8.4576946,20.231989,20.431989].map(z=>({z,...sourceMaterialAtPoint(l.model.connectionSurface,[-8,-8,z])}));
  report.checks.push('L1 physical tops eligible, undersides excluded; other three source orientation signs unchanged');
  // Replay the old ports verbatim: changed eligibility must not hide the original 54-candidate regression.
  const replayModels=models.map((m,i)=>({...m,variants:m.variants.map((v,j)=>({...v,ports:old.sources[i].ports[j]}))}));
  const replay=matchAssemblyPorts(replayModels,tiles,old.reports);
  const gl=replay.candidates.filter(c=>c.pair.tileA===sources[2].mesh.id&&c.pair.tileB===l.mesh.id);
  report.oldPortReplay={eligible:gl.filter(c=>['COLLISION','SLOPE','SURFACE ATTACHMENT','ACCEPTED'].includes(c.reason)).length,reasons:gl.reduce((a,c)=>(a[c.reason]=(a[c.reason]??0)+1,a),{})};
  assert.equal(report.oldPortReplay.eligible,54);assert.equal(gl.filter(c=>c.reason==='NETWORK REDUNDANT').length,0);
  report.checks.push('All 54 formerly suppressed candidates replayed with geometric evaluation, no provisional-network suppression');
  const {validateWalkingApproach}=load('walkingApproach');
  const entrances=[{name:'A',point:[35.84433937072754,12,8.357694625854492],outward:[-1,0,0]},
    {name:'B',point:[40,10.283156394958496,8.357694625854492],outward:[0,-1,0]},
    {name:'C',point:[35.84433937072754,12,20.331989288330078],outward:[-1,0,0]}];
  report.approaches=[];
  for(const e of entrances)for(const width of [2.1,3])for(const depth of [2,4,6]){
    const result=validateWalkingApproach(l.model,l.tile,e.point,e.outward,width,depth,models,tiles,first.synthesis.connectors);
    report.approaches.push({...e,width,depth,...result});
  }
  assert(report.approaches.filter(a=>a.width===2.1).every(a=>a.valid));
  assert(report.approaches.filter(a=>a.width===3&&a.depth===6&&a.name!=='B').every(a=>!a.valid&&a.reason==='local approach slope'));
  const a=report.approaches.find(p=>p.name==='A'&&p.width===2.1&&p.depth===6),b=report.approaches.find(p=>p.name==='B'&&p.width===2.1&&p.depth===4);
  assert.equal(a.details.region,b.details.region);
  assert(Math.min(a.point[0]+a.depth,b.point[0]+1.05)-Math.max(a.point[0],b.point[0]-1.05)>2);
  assert(Math.min(a.point[1]+1.05,b.point[1]+b.depth)-Math.max(a.point[1]-1.05,b.point[1])>2);
  report.internalContinuity={middleWestToSouth:'Verified overlap of continuous 2.1 ft wide A/6 ft and B/4 ft corridors on region '+a.details.region,
    upperToMiddle:'Unverified; separate support regions; no validated internal stair or ramp',wholeForm:'Not established',accessibility:'No code-compliance claim'};
  const warmStart=performance.now(),warm=validateWalkingApproach(l.model,l.tile,entrances[0].point,entrances[0].outward,2.1,4,models,tiles,first.synthesis.connectors);
  assert(warm.valid);report.approachWarmMs=performance.now()-warmStart;
  const lower={...entrances[0],point:[35.84433937072754,12,2.1987321376800537]};
  report.lowerApproach=validateWalkingApproach(l.model,l.tile,lower.point,lower.outward,2.1,2,models,tiles);
  assert(!report.lowerApproach.valid);
  // A thin obstruction between the old half-foot probes must still be caught continuously.
  const obstacle={positions:Float32Array.from([37.095,11,9,37.095,13,9,37.095,12,14]),indices:[0,1,2]};
  assert(!validateWalkingApproach(l.model,l.tile,entrances[0].point,entrances[0].outward,2.1,4,models,tiles,[obstacle]).valid);
  for(let i=2;i<obstacle.positions.length;i+=3)obstacle.positions[i]+=100;
  assert(validateWalkingApproach(l.model,l.tile,entrances[0].point,entrances[0].outward,2.1,4,models,tiles,[obstacle]).valid,'changed obstruction must invalidate approach cache');
  const {evaluateAlternativeRoutes,DEFAULT_ROUTING_BUDGET}=load('alternativeRouting');
  const targetAnchors=entrances.map(e=>({...e,id:e.name,width:2.1,kind:'edge',snap:0,run:[[-e.outward[1],e.outward[0],0].map((v,k)=>e.point[k]+v*1.05),[-e.outward[1],e.outward[0],0].map((v,k)=>e.point[k]-v*1.05)]}));
  const budget={...DEFAULT_ROUTING_BUDGET,attachments:128,pairs:12,routes:96};
  report.routes=[];
  for(const s of [sources[1],sources[2]]){
    const result=evaluateAlternativeRoutes(models,tiles,s.mesh.id,l.mesh.id,first.synthesis.connectors,budget,{targetAnchors});
    const warm=evaluateAlternativeRoutes(models,tiles,s.mesh.id,l.mesh.id,first.synthesis.connectors,budget,{targetAnchors});
    const outcomes=r=>normalize(r.outcomes.map(({route,pair,reason})=>({route,pair,reason})));
    assert.equal(hash(JSON.stringify(outcomes(warm))),hash(JSON.stringify(outcomes(result))),'cold/warm route classification parity');
    assert.deepEqual(normalize(warm.accepted),normalize(result.accepted));
    report.routes.push({...result,warmTiming:warm.timing,attachmentChecks:result.outcomes.filter(o=>o.route==='direct').map(o=>({target:o.pair.portB,from:o.pair.from,to:o.pair.to,valid:fitLoftContact(structuredClone(o.pair),models,tiles,false)}))});
    console.log(JSON.stringify({source:s.code,counts:result.counts,cold:result.timing,warm:warm.timing}));
  }
  report.checks.push('Continuous support coverage and swept clearance; narrow intermediate obstruction rejected; lower-floor headroom remains rejected; bounded route cold/warm parity');
  // Cache invalidation: same object identity, changed geometry, topology and transform.
  const clone={positions:l.model.connectionSurface.positions.slice(),triangles:[...l.model.connectionSurface.triangles]};
  let meta=surfaceOrientation(clone);clone.positions[0]+=.125;assert.notEqual(surfaceOrientation(clone),meta);
  clone.positions.set(l.model.connectionSurface.positions);meta=surfaceOrientation(clone);clone.triangles.length=0;assert.notEqual(surfaceOrientation(clone),meta);assert.equal(surfaceOrientation(clone).triangles.length,0);
  clone.triangles.push(...l.model.connectionSurface.triangles);
  for(let i=0;i<clone.triangles.length;i+=3)[clone.triangles[i+1],clone.triangles[i+2]]=[clone.triangles[i+2],clone.triangles[i+1]];
  const reversed=surfaceOrientation(clone);assert.equal(reversed.components[0].sign,1);
  const normals=m=>hash(JSON.stringify(m.triangles.map(t=>Number.isFinite(t.normalZ)?Math.round(t.normalZ*1e6):null)));
  assert.equal(normals(reversed),normals(surfaceOrientation(l.model.connectionSurface)),'physical normals invariant under cloned winding reversal');
  const fresh={...l.model,connectionSurface:{positions:l.model.connectionSurface.positions.slice(),triangles:[...l.model.connectionSurface.triangles]}};
  for(const changed of [{...l.tile,ix:3},{...l.tile,zLift:3},{...l.tile,variant:0},{...l.tile,variant:1}])assert.deepEqual(measureSurfaceGap(l.model,changed,entrances[0].point,.5),measureSurfaceGap(fresh,changed,entrances[0].point,.5),'changed transform must match an uncached index');
  const moved={...l.model,connectionSurface:{positions:l.model.connectionSurface.positions.slice(),triangles:[...l.model.connectionSurface.triangles]}};
  for(let i=2;i<moved.connectionSurface.positions.length;i+=3)moved.connectionSurface.positions[i]+=100;
  assert(!validateWalkingApproach(moved,l.tile,entrances[0].point,entrances[0].outward,2.1,4,[...models.slice(0,3),moved],tiles).valid);
  const {transitionSurfaceClear,landingHeadroomCheck}=load('connectionClearance');
  const pair=structuredClone(first.synthesis.connectors.find(c=>c.portPair.portA!=='organic').portPair);
  assert(transitionSurfaceClear(pair,tiles,models));
  const changed=structuredClone(pair);changed.path[1][0]+=1e-10;
  assert(captureConnectionDiagnostics(()=>transitionSurfaceClear(changed,tiles,models),0).trace.counts['cache: source clearance miss']>0);
  assert.equal(landingHeadroomCheck([[35.844339,11.737,6.396]],tiles,models).clear,false);
  const open={positions:Float32Array.from([0,0,0,4,0,0,0,4,0]),triangles:[0,1,2]};
  assert(!Number.isFinite(surfaceOrientation(open).triangles[0].normalZ));
  report.checks.push('Revision caches invalidate on vertices, topology, winding, placement, lift, rotation and emitted path edits; open unsupported sheet remains uncertain; legacy headroom gate active');
  const {tileRootMatrix}=load('objFidelity'),THREE=require('three');
  report.transforms=sources.map(s=>{
    const v=s.model.variants[s.tile.variant],matrix=tileRootMatrix(s.mesh,{...s.tile,rotation:v.rotation,mirror:v.mirror},1,'auto');
    let maxError=0;
    for(let i=0;i<s.mesh.positions.length;i+=3){
      const display=new THREE.Vector3(...s.mesh.positions.slice(i,i+3)).applyMatrix4(matrix),expected=[display.x,display.z,display.y];
      const actual=worldFromLocal(Array.from(s.model.connectionSurface.positions.slice(i,i+3)),s.tile,s.model);
      maxError=Math.max(maxError,Math.hypot(...actual.map((v,k)=>v-expected[k])));
    }
    assert(maxError<1e-5);return {code:s.code,vertices:s.mesh.positions.length/3,maxErrorFeet:maxError};
  });
  report.checks.push('Every original vertex agrees with the rendered root transform within 1e-5 ft');
}
for(const s of sources)assert.equal(geometry(s.mesh),s.before);
assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),hash(bytes));
report.checks.push('Original positions/normals/faces SHA-256 and session bytes unchanged');
fs.writeFileSync(path.join(out,baseline?'baseline.json':'corrected.json'),JSON.stringify(normalize(report),null,2)+'\n');
console.log(JSON.stringify({mode:report.mode,trials,checks:report.checks,components:report.components}));
