// Fixed original four-OBJ fixture only. No placement search. --checkpoint captures
// the accepted 26657ff source in a separate process; normal mode compares to it.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),checkpoint='26657ffd752bfce309799155e00a8e9d4c01184d';
const baseline=process.argv.includes('--checkpoint'),benchmark=process.argv.includes('--benchmark');
require.extensions['.ts']=(m,f)=>{
  const rel=path.relative(root,f).replaceAll('\\','/');
  const source=baseline?cp.execFileSync('git',['show',checkpoint+':'+rel],{cwd:root,encoding:'utf8',maxBuffer:8e6}):fs.readFileSync(f,'utf8');
  m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
};
const load=n=>require('../src/components/lattice/'+n+'.ts');
const {analyzeMesh}=load('analyze'),{surfaceOrientation}=load('surfaceOrientation');
const {enumerateWalkableAttachments,worldFromLocal,fitLoftContact}=load('surfaceAttachment');
const {evaluateAssembly}=load('search'),{matchAssemblyPorts}=load('portMatching'),{synthesizeConnectors}=load('connectionSynthesis');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')),session=JSON.parse(bytes);
const geometry=m=>hash(JSON.stringify([Array.from(m.positions),Array.from(m.normals),m.faces]));
const sources=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{
  const p=session.meshes.find(m=>m.id===session.assignments[code]);
  const mesh={...p,positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals??[]),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
  const before=geometry(mesh),start=performance.now(),model=analyzeMesh(mesh,code,1,mesh.upAxis),analysisMs=performance.now()-start;
  return {code,mesh,before,model,analysisMs,tile:{id:mesh.id,ix,iy,iz:0,variant}};
});
const models=sources.map(s=>s.model),tiles=sources.map(s=>s.tile),out=path.join(root,'reports/local-material');fs.mkdirSync(out,{recursive:true});
if(process.argv.includes('--windows')){
  // Audit the full finite window list, including G1's 74 windows beyond the
  // production return cap. Only this private test module bypasses that slice;
  // application code, route budgets and the production module stay unchanged.
  const f=path.join(root,'src/components/lattice/surfaceAttachment.ts'),m=new Module(f);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));
  const original=baseline?cp.execFileSync('git',['show',checkpoint+':src/components/lattice/surfaceAttachment.ts'],{cwd:root,encoding:'utf8'}):fs.readFileSync(f,'utf8');
  assert(original.includes('anchors: all.slice(0, limit)'));
  m._compile(ts.transpileModule(original.replace('anchors: all.slice(0, limit)','anchors: all'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
  const rows=sources.map(s=>({code:s.code,...m.exports.enumerateWalkableAttachments(s.model,s.tile,256)}));
  if(!baseline){
    const previous=JSON.parse(fs.readFileSync(path.join(out,'windows-checkpoint.json')));
    const keys=r=>r.anchors.map(w=>JSON.stringify([w.point,w.run,w.width,w.outward])).sort();
    for(const row of rows){assert.equal(row.anchors.length,row.available);assert.deepEqual(keys(row),keys(previous.find(r=>r.code===row.code)),'complete window set changed');}
  }
  fs.writeFileSync(path.join(out,baseline?'windows-checkpoint.json':'windows-updated.json'),JSON.stringify(rows,null,2)+'\n');
  console.log(JSON.stringify({allWindows:rows.map(r=>({code:r.code,runs:r.runs,available:r.available,audited:r.anchors.length})),allGeometricWindowsUnchanged:!baseline}));
  process.exit(0);
}
const normalized=v=>JSON.parse(JSON.stringify(v,(k,v)=>v instanceof Float32Array?Array.from(v):v));
const counts=m=>({physicalUp:m.triangles.filter(t=>t.normalZ>=.7).length,ambiguousUp:m.triangles.filter(t=>t.rawNormal[2]>=.7&&!Number.isFinite(t.normalZ)).length});
const report={checkpoint,mode:baseline?'checkpoint':'updated',sessionSHA256:hash(bytes),node:process.version,sources:sources.map(s=>{
  const m=surfaceOrientation(s.model.connectionSurface),start=performance.now();
  for(let i=0;i<100;i++)assert.equal(surfaceOrientation(s.model.connectionSurface),m);
  return {code:s.code,filename:s.mesh.filename,geometrySHA256:s.before,placement:s.tile,analysisMs:s.analysisMs,classificationMs:m.buildMs,localMaterial:m.localMaterial,cachedClassificationMs:(performance.now()-start)/100,...counts(m),normals:m.triangles.map(t=>t.normalZ)};
}),checks:[],trials:[],fullSearch:'NOT RUN',stage2B:'NOT STARTED'};
let first,signature;
for(let i=0;i<4;i++){
  const start=performance.now(),evaluation=evaluateAssembly(models,tiles),ports=matchAssemblyPorts(models,tiles,evaluation.connections);
  const synthesis=synthesizeConnectors(models,tiles,evaluation.connections,{...ports,portPairs:ports.pairs});
  report.trials.push({cache:i?'warm':'cold',elapsedMs:performance.now()-start});
  const current=JSON.stringify(normalized({evaluation,ports,synthesis}));
  if(i)assert.equal(current,signature);else {signature=current;first={evaluation,ports,synthesis};}
}
report.components=first.synthesis.organicDiagnostics.components;report.isolated=first.synthesis.organicDiagnostics.isolated;
report.connectors=normalized(first.synthesis.connectors);
for(const s of sources)report.sources.find(r=>r.code===s.code).windows=enumerateWalkableAttachments(s.model,s.tile,256);
if(baseline&&!benchmark)fs.writeFileSync(path.join(out,'baseline-classifications.json'),JSON.stringify(normalized({reports:first.evaluation.connections,candidates:first.ports.candidates,confirmed:first.ports.confirmedReports,componentsBefore:first.ports.componentsBefore,componentsAfter:first.ports.componentsAfter,components:first.synthesis.organicDiagnostics.components,isolated:first.synthesis.organicDiagnostics.isolated,organic:first.synthesis.organicDiagnostics,connectors:first.synthesis.connectors}))+'\n');
assert.equal(report.components,2);assert.deepEqual(report.isolated,[session.assignments.L1]);assert.equal(first.ports.confirmedReports.length,0);
const oldReport=JSON.parse(fs.readFileSync(path.join(root,'reports/surface-orientation/corrected.json')));
assert.deepEqual(report.connectors,oldReport.connectors,'existing emitted geometry must remain identical');
report.checks.push('cold/warm evaluation parity; unchanged emitted ramp/stair meshes; two components; L1 isolated; invalid voxel graph edges rejected');
if(!baseline&&!benchmark){
  console.log('Checking local material intervals against the independent exact oracle');
  const previous=JSON.parse(fs.readFileSync(path.join(out,'checkpoint.json')));
  const review=JSON.parse(fs.readFileSync(path.join(root,'reports/post-correction-review/ambiguous-triangles.json')));
  const {materialSideIndex}=load('materialSideEvidence');
  const {validateWalkingApproach}=load('walkingApproach'),{transitionSurfaceClear}=load('connectionClearance');
  // Independent exact solid angle oracle is test-only, bounded to this fixture.
  const winding=(p,triangles)=>{let sum=0;for(const t of triangles){const [a,b,c]=t.points;const ax=a[0]-p[0],ay=a[1]-p[1],az=a[2]-p[2],bx=b[0]-p[0],by=b[1]-p[1],bz=b[2]-p[2],cx=c[0]-p[0],cy=c[1]-p[1],cz=c[2]-p[2],la=Math.hypot(ax,ay,az),lb=Math.hypot(bx,by,bz),lc=Math.hypot(cx,cy,cz);sum+=2*Math.atan2(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx),la*lb*lc+(ax*bx+ay*by+az*bz)*lc+(bx*cx+by*cy+bz*cz)*la+(cx*ax+cy*ay+cz*az)*lb);}return sum/(4*Math.PI);};
  report.audit=[];report.newWindows=[];
  for(const s of sources){
    const m=surfaceOrientation(s.model.connectionSurface),before=previous.sources.find(r=>r.code===s.code),reviewed=review.sources.find(r=>r.code===s.code);
    const changed=[];let oracleQueries=0,maxOracleError=0;
    m.triangles.forEach((t,i)=>{
      const old=before.normals[i];
      // JSON records both signed zeros as 0; their physical normal is identical.
      if(old!==null)assert(t.normalZ===old,'previously accepted physical normal changed');
      if(Number.isFinite(t.normalZ)&&old===null){
        assert(t.normalZ>=.65&&t.localMaterial.accepted,'wall, underside or unsupported restoration');
        const original=reviewed?.rows.find(r=>r.triangle===i);
        changed.push({triangle:i,old:'ambiguous',normalZ:t.normalZ,area:t.area,region:t.region,worldCentroid:worldFromLocal(t.points[0].map((_,k)=>(t.points[0][k]+t.points[1][k]+t.points[2][k])/3),s.tile,s.model),priorLocalTopEvidence:original?.physicalTop??null,localSlope:Math.hypot(t.rawNormal[0],t.rawNormal[1])/Math.abs(t.rawNormal[2]),priorHeadroomFeet:original?.headroom??null,justification:t.localMaterial});
      }
      if(!t.localMaterial)return;
      const component=m.components[t.component],triangles=component.triangles.map(j=>m.triangles[j]);let sampleIndex=0;
      witnesses: for(const weights of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
        const p=t.points[0].map((_,k)=>weights.reduce((sum,w,j)=>sum+w*t.points[j][k],0));
        for(const offset of [.005,.02])for(const side of [-1,1]){
          const stored=t.localMaterial.samples[sampleIndex++];if(!stored)break witnesses;
          if(stored.exhausted)continue;
          const q=p.map((v,k)=>v+side*component.sign*t.rawNormal[k]*offset),exact=winding(q,triangles);
          const difference=Math.abs(stored.value-exact);assert(difference<=stored.error+1e-10,'material interval fails exact oracle');
          maxOracleError=Math.max(maxOracleError,difference);oracleQueries++;
          if(t.localMaterial.accepted)assert(Math.abs(exact-(side<0?component.sign:0))<.1);
        }
      }
    });
    const remaining=reviewed?.rows.filter(r=>!Number.isFinite(m.triangles[r.triangle].normalZ)).map(r=>({triangle:r.triangle,priorLocalTopEvidence:r.physicalTop,evidence:m.triangles[r.triangle].localMaterial}))??[];
    report.audit.push({code:s.code,before:{physicalUp:before.physicalUp,ambiguousUp:before.ambiguousUp},after:counts(m),changed,remaining,oracleQueries,maxOracleError});
    console.log(JSON.stringify({source:s.code,changed:changed.length,oracleQueries,maxOracleError}));
    const windowKey=w=>JSON.stringify([w.point,w.run,w.width,w.outward]),oldWindows=new Set(before.windows.anchors.map(windowKey));
    for(const w of report.sources.find(r=>r.code===s.code).windows.anchors)if(!oldWindows.has(windowKey(w))){
      const approach=validateWalkingApproach(s.model,s.tile,w.point,w.outward,w.width,2,models,tiles,oldReport.connectors);
      report.newWindows.push({code:s.code,anchor:w,approach});
    }
  }
  const o1=surfaceOrientation(sources[1].model.connectionSurface),o2=surfaceOrientation(sources[0].model.connectionSurface),g1=surfaceOrientation(sources[2].model.connectionSurface);
  assert.equal(o1.triangles[1071].normalZ,1);assert.equal(o1.triangles[1071].region,o1.triangles[1072].region);
  assert(o2.triangles[9710].localMaterial.accepted);assert(g1.triangles[10823].localMaterial.accepted);
  assert(!o2.triangles[9815].localMaterial.accepted);assert(!o1.triangles[3881].localMaterial.accepted);
  const original=sources[1].model.connectionSurface,clone={positions:original.positions.slice(),triangles:[...original.triangles]};
  const cached=surfaceOrientation(clone);assert(cached.triangles[1071].localMaterial.accepted);
  clone.positions[0]+=.125;assert.notEqual(surfaceOrientation(clone),cached,'local evidence reused after an in-place vertex edit');
  clone.positions.set(original.positions);
  [clone.triangles[1071*3+1],clone.triangles[1071*3+2]]=[clone.triangles[1071*3+2],clone.triangles[1071*3+1]];
  assert(!(surfaceOrientation(clone).triangles[1071].normalZ>=.65),'reversed individual face retained old local-top evidence');
  clone.triangles=[...original.triangles];
  for(let i=0;i<clone.triangles.length;i+=3)[clone.triangles[i+1],clone.triangles[i+2]]=[clone.triangles[i+2],clone.triangles[i+1]];
  assert.deepEqual(normalized(surfaceOrientation(clone).triangles.map(t=>t.normalZ)),normalized(o1.triangles.map(t=>t.normalZ)),'local physical classification depends on global file winding');
  report.checks.push('new local-material evidence invalidates on in-place vertices/topology; individual reversed face is not restored; cloned whole-shell winding reversal preserves physical classification');
  const index=materialSideIndex(o1.triangles,o1.components[0].triangles),p=o1.triangles[1071].points[0];
  assert(index.query(p,0).exhausted);assert(index.prepare([p])([p[0]+1,p[1],p[2]]).exhausted);
  // A nearby actual original-OBJ underside gives material ABOVE, not a floor.
  const lm=surfaceOrientation(sources[3].model.connectionSurface),li=materialSideIndex(lm.triangles,lm.components[0].triangles);
  for(const z of [.4247623,6.4875575,18.6131683]){const value=li.query([-8,-8,z]);assert(!value.exhausted);assert(Math.abs(value.value+1)+value.error<.1);}
  report.checks.push('all changed and retained disputed sample intervals enclose independent exact winding; O1 1071 joins accepted 1072; O2/G1 representatives; query budgets fail closed; L1 underside material remains occupied');
  const oldInterfaces=JSON.parse(fs.readFileSync(path.join(root,'reports/post-correction-review/route-audit.json'))).rows;
  report.interfaces=[];report.collisions=[];
  for(const r of oldReport.routes)for(const outcome of r.outcomes.filter(o=>o.route==='direct')){
    const p=outcome.pair,s=sources.find(s=>s.model.id===p.tileA),old=oldInterfaces.find(x=>x.source===s.code&&x.sourcePort===p.portA&&x.target===p.portB);
    const ramp=validateWalkingApproach(s.model,s.tile,p.from,p.startDirection,p.startWidth,2,models,tiles,oldReport.connectors,false);
    const landing=validateWalkingApproach(s.model,s.tile,p.from,p.startDirection,p.startWidth,Math.max(3,p.startWidth),models,tiles,oldReport.connectors,true);
    assert.equal(ramp.valid,old.rampApproach.valid);assert.equal(landing.valid,old.stairLanding.valid);
    report.interfaces.push({source:s.code,port:p.portA,target:p.portB,ramp,landing,surfaceAttachment:fitLoftContact(structuredClone(p),models,tiles,false)});
    if(old.rampApproach.valid)for(const o of r.outcomes.filter(o=>o.pair.portA===p.portA&&o.pair.portB===p.portB)){
      const clear=transitionSurfaceClear(o.pair,tiles,models);assert.equal(clear,false);
      report.collisions.push({source:s.code,port:p.portA,target:p.portB,route:o.route,clear});
    }
  }
  assert.equal(report.interfaces.length,24);assert.equal(report.interfaces.filter(r=>r.ramp.valid).length,3);assert.equal(report.collisions.length,24);
  report.entranceB=[];const l=sources[3],e=oldReport.approaches.find(e=>e.name==='B');
  for(const width of [2.1,3])for(const depth of [2,4,6]){const result=validateWalkingApproach(l.model,l.tile,e.point,e.outward,width,depth,models,tiles,oldReport.connectors);assert(result.valid);report.entranceB.push({width,depth,...result});}
  report.checks.push('24 prior source interfaces unchanged: 3 ramp approaches pass, 21 fail, all stair landings fail; all 24 routes from passing sources retain collision failures; B 2.1/3 ft widths by 2/4/6 ft depths pass');
  console.log('24 original interfaces, 24 collision checks and B approaches passed');
  // Run the Phase 1.5 invalidation cases unchanged. Compare fixed geometric
  // candidates, not renumbered edge IDs or array positions after floor recovery.
  const file=path.join(root,'scripts/l1-performance.cjs'),testModule=new Module(file);testModule.filename=file;testModule.paths=Module._nodeModulePaths(path.dirname(file));
  testModule.verifyParity=(current,accepted)=>{
    for(const k of ['reports','confirmed','componentsBefore','componentsAfter','components','isolated','connectors'])assert.equal(hash(JSON.stringify(current[k])),hash(JSON.stringify(accepted[k])),k+' parity');
    const {considered:oldConsidered,...oldOrganic}=accepted.organic,{considered:newConsidered,...newOrganic}=current.organic;
    assert.deepEqual(newOrganic,oldOrganic,'organic validation/links/graph parity');
    const key=c=>JSON.stringify([c.pair.tileA,c.pair.tileB,c.pair.from,c.pair.to,c.pair.startWidth,c.pair.endWidth,c.pair.startDirection,c.pair.endDirection,c.pair.startProfile,c.pair.endProfile]);
    const old=new Map(accepted.candidates.map(c=>[key(c),c])),now=new Map(current.candidates.map(c=>[key(c),c]));
    const clean=c=>{const copy=structuredClone(c);delete copy.pair.portA;delete copy.pair.portB;return copy;};
    let common=0;const added=[],removed=[];
    for(const [k,c]of now)if(old.has(k)){assert.deepEqual(clean(c),clean(old.get(k)),'shared candidate classification changed');common++;}else{assert(!c.accepted);added.push(c);}
    for(const [k,c]of old)if(!now.has(k)){assert(!c.accepted);removed.push(c);}
    assert.equal(common,4001);assert.equal(added.length,148);assert.equal(removed.length,148);
    report.candidateParity={common,added,removed,organicConsidered:{before:oldConsidered,after:newConsidered}};
  };
  let source=fs.readFileSync(file,'utf8');
  source=source.replace("'reports/stage2-phase1.5'","'reports/local-material'");
  source=source.replace(/const referenceFile[\s\S]*?if \(!ref && process.argv.includes\('--invalidation'\)\)/,
    "const accepted=JSON.parse(fs.readFileSync(path.join(out,'baseline-classifications.json'))); module.verifyParity(first,accepted); checks.push('Shared geometric candidates, emitted connectors and graph match 26657ff; changed rejected candidate set audited separately'); if (!ref && process.argv.includes('--invalidation'))");
  process.argv.push('--invalidation','--label=updated-cache');testModule._compile(source,file);
  report.checks.push('Phase 1.5 shared-candidate classification/geometry parity and original cache-invalidation cases; all 148 added and 148 removed candidates rejected; organic considered count changes 632 to 611, all other organic results identical');
}
for(const s of sources)assert.equal(geometry(s.mesh),s.before);assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),report.sessionSHA256);
report.checks.push('original OBJ positions/normals/faces and complete session SHA-256 unchanged');
const file=benchmark?(baseline?'benchmark-checkpoint.json':'benchmark-updated.json'):(baseline?'checkpoint.json':'updated.json');
fs.writeFileSync(path.join(out,file),JSON.stringify(normalized(report),null,2)+'\n');
console.log(JSON.stringify({file,classification:report.sources.map(({code,physicalUp,ambiguousUp,analysisMs,classificationMs,localMaterial,cachedClassificationMs,windows})=>({code,physicalUp,ambiguousUp,analysisMs,classificationMs,localMaterial,cachedClassificationMs,windows:{runs:windows.runs,available:windows.available}})),trials:report.trials,checks:report.checks,newWindows:report.newWindows?.length}));
