// Exact portable-project replay. Never mutates browser storage or imported files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const baseline=process.argv.includes('--baseline');
const baselineDirectory=path.join(root,'reports/connection-search-2026-10-20T21-17-58-167Z/source-before');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(baseline&&fs.existsSync(path.join(baselineDirectory,path.basename(f)))?path.join(baselineDirectory,path.basename(f)):f, 'utf8'), {
  fileName: f.replace(/\.ts$/, '.cts'), compilerOptions: { module: ts.ModuleKind.Node16, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const load = n => require(path.join(root, 'src/components/lattice', n + '.ts'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fixture = process.argv[2];
const mode = process.argv[3] || 'fixed';
if (!fixture) throw new Error('Usage: node scripts/connection-search-check.cjs <portable-project.json> [fixed|search]');
const envelope = JSON.parse(fs.readFileSync(fixture, 'utf8'));
if (hash(envelope.payload) !== envelope.checksum) throw new Error('Project checksum mismatch');
const state = load('projectStorage').decodeProjectState(envelope.payload);
const out = path.join(root, 'reports', 'connection-search-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(out);
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, (_, v) => ArrayBuffer.isView(v) ? Array.from(v) : v, 2), { flag: 'wx' });
const sourceFiles = ['assignmentSearch.ts','assignmentGuidance.ts','portMatching.ts','portConnectionValidation.ts','alternativeRouting.ts','extensionReconstruction.ts','sourceResponsiveExtension.ts','transitionGeometry.ts','connectionFeatures.ts','featureAdaptation.ts','featureConnections.ts','walkingApproach.ts','connectionClearance.ts'];
fs.mkdirSync(path.join(out, 'source-before'));
for (const name of sourceFiles) fs.copyFileSync(path.join(root,'src/components/lattice',name),path.join(out,'source-before',name),fs.constants.COPYFILE_EXCL);
const before = state.meshes.map(m => ({id:m.id,filename:m.filename,hash:hash(JSON.stringify([Array.from(m.positions),m.faces,Array.from(m.normals)])),sourceSHA256:m.sourceSHA256}));
const guards=['checkpoints/lattice-session.json',...fs.readdirSync(path.join(root,'original-obj-references')).filter(n=>n.endsWith('.obj')).map(n=>'original-obj-references/'+n)].map(name=>({name,sha256:hash(fs.readFileSync(path.join(root,name)))}));
function preserve(){
  const after=state.meshes.map(m=>hash(JSON.stringify([Array.from(m.positions),m.faces,Array.from(m.normals)])));
  if(before.some((m,i)=>m.hash!==after[i]))throw new Error('Source mutation');
  for(const g of guards)if(hash(fs.readFileSync(path.join(root,g.name)))!==g.sha256)throw new Error('File mutation: '+g.name);
  write('preservation.json',{uploaded:before,files:guards});
}
async function main() {
  await load('extensionReconstruction').initializeExtensionReconstruction();
  for(const name of ['assignmentSearch','search','portMatching','connectionSynthesis','interiorApproaches','branchAdaptationStudy'])load(name);
  const start = performance.now();
  const slots = ['G1','O3'];
  const sources = slots.map(slot => state.meshes.find(m => m.id === state.assignments[slot]));
  if (sources.some(m=>!m)) throw new Error('Exact mapped sources missing');
  const models = sources.map((m,i)=>({...load('analyze').analyzeMesh(m,slots[i],1,'y'),sourceResponsiveExtensions:state.sourceResponsiveExtensions}));
  const preprocessingMs=performance.now()-start;
  const original=state.assignmentResult;
  write('fixture.json',{fixture,checksum:envelope.checksum,baseline,sourceIdentities:sources.map((m,i)=>({slot:slots[i],id:m.id,filename:m.filename,sha256:m.sourceSHA256})),field:state.field,original:original?{tiles:original.tiles,summary:original.summary,milliseconds:original.milliseconds,searchEvidence:original.searchEvidence}:null,preprocessingMs});
  console.log('PREPROCESS',preprocessingMs,'OUTPUT',out);
  if(mode==='packing-inventory'){
    const slots=process.argv.find(a=>a.startsWith('--slots='))?.slice(8).split(',');
    if(slots?.length!==2)throw new Error('Two uploaded source slots required');
    const mm=slots.map(slot=>{const source=state.meshes.find(m=>m.id===state.assignments[slot]);if(!source)throw new Error('Missing uploaded source');return {...load('analyze').analyzeMesh(source,slot,1,'y'),sourceResponsiveExtensions:true};});
    const results=[];
    for(const sourceVariant of [0,3,6,9])for(const targetVariant of [0,6]){
      const tiles=[{id:mm[0].id,ix:1,iy:1,iz:0,zLift:0,variant:sourceVariant},{id:mm[1].id,ix:2,iy:1,iz:0,zLift:0,variant:targetVariant}],start=performance.now();
      const packing=load('extensionReconstruction').originalPlacementMaterial(mm,tiles);
      results.push({sources:mm.map(m=>({id:m.id,filename:m.filename})),tiles,packing,ms:performance.now()-start});console.log('PACKING',sourceVariant,targetVariant,JSON.stringify(packing));
    }
    write('packing-results.json',results);preserve();return;
  }
  if(mode==='route-replay'){
    const relative=process.argv.find(a=>a.startsWith('--route-report='))?.slice(15);if(!relative)throw new Error('Missing exact route report');
    const report=fs.realpathSync(path.resolve(root,relative));if(!report.toLowerCase().startsWith(fs.realpathSync(root).toLowerCase()+path.sep))throw new Error('Route report outside worktree');
    const reportHash=hash(fs.readFileSync(report)),record=JSON.parse(fs.readFileSync(report))[0],attemptIndex=process.argv.find(a=>a.startsWith('--attempt='))?.slice(10);
    const originalAttempt=attemptIndex===undefined?record.result.featureDiagnostics.attempts.find(a=>a.geometry&&a.operation.startsWith('original')&&a.reason==='source-responsive material interface'):record.result.featureDiagnostics.attempts[Number(attemptIndex)];
    const attempt=structuredClone(originalAttempt);
    if(!attempt?.geometry||!attempt.operation.startsWith('original'))throw new Error('Replay requires an original-geometry route with retained measurements');
    const mm=record.source.map(r=>{const source=state.meshes.find(m=>m.id===r.id.split('::')[0]);if(!source||source.filename!==r.filename)throw new Error('Route source does not match uploaded project');return {...load('analyze').analyzeMesh(source,null,1,'y'),id:r.id,sourceResponsiveExtensions:true};});
    const targetFeature=process.argv.find(a=>a.startsWith('--target-feature='))?.slice(17);
    const tiles=record.tiles,features=mm.map((m,i)=>load('connectionFeatures').placedConnectionFeatures(m,tiles[i])),a=features[0].find(f=>f.id===attempt.featureA),b=features[1].find(f=>f.id===(targetFeature??attempt.featureB));if(!a||!b)throw new Error('Recorded feature unavailable in current classifier');
    if(targetFeature){attempt.selectionOverride={originalFeature:originalAttempt.featureB,selectedFeature:b.id,interpretation:'new deterministic candidate from current actual uploaded geometry; not a historical result'};attempt.featureB=b.id;attempt.geometry.to=[...b.point];attempt.geometry.rise=b.point[2]-a.point[2];}
    const bendOverride=process.argv.find(a=>a.startsWith('--bend='));if(bendOverride){const bend=Number(bendOverride.slice(7));if(!Number.isFinite(bend)||Math.abs(bend)>6)throw new Error('Invalid bounded bend');attempt.geometry.bend=bend;}
    const g=structuredClone(attempt.geometry),originalModels=mm.slice(),adaptations=[],started=performance.now();
    if(Math.hypot(...g.from.map((v,i)=>v-a.point[i]))>1e-8||Math.hypot(...g.to.map((v,i)=>v-b.point[i]))>1e-8)throw new Error('Recorded endpoints no longer correspond to source features');
    if(process.argv.includes('--reconstruct')){
      const setbacks=(process.argv.find(a=>a.startsWith('--setback='))?.slice(10)??'0').split(',').map(Number);
      if(setbacks.length>2||setbacks.some(s=>!Number.isFinite(s)||s< -1||s>2))throw new Error('Invalid bounded reconstruction setback');
      const datum=process.argv.find(a=>a.startsWith('--datum='))?.slice(8)??'interior',depth=Number(process.argv.find(a=>a.startsWith('--depth='))?.slice(8)??3);
      if(!['interior','boundary'].includes(datum)||!Number.isFinite(depth)||depth<2||depth>4)throw new Error('Invalid measured datum or depth');
      for(const [i,f]of [a,b].entries()){
        const setback=setbacks[i]??setbacks[0];
        const approach=load('walkingApproach').validateSourceApproach(mm[i],tiles[i],f.point,f.outward,g.width);
        if(approach.valid&&setback===0){adaptations.push({valid:true,unchanged:true});continue;}
        const feature=load('connectionFeatures').connectionFeatures(mm[i]).features.find(x=>x.id===(f.sourceFeatureId??f.id));
        const result=load('featureAdaptation').adaptFeatureLanding(mm[i],{feature:{...feature,point:load('surfaceAttachment').localPoint(f.point,tiles[i],mm[i])},width:g.width,depth:feature.width<g.width?4:depth,setback,elevation:0,datum});
        adaptations.push(result);
        if(!result.valid){write('route-replay.json',{report,reportHash,attempt,adaptations,accepted:false,components:2,validation:{reason:'adaptation rejected',details:result},ms:performance.now()-started});preserve();console.log('REPLAY adaptation rejected',result.reason);return;}
        mm[i]=result.model;g[i===0?'from':'to']=load('surfaceAttachment').worldFromLocal(result.point,tiles[i],mm[i]);
      }
      const continuity=[a,b].map((f,i)=>adaptations[i].unchanged?{valid:true}:load('featureConnections').reconstructionContinuity(originalModels[i],mm[i],tiles[i],i===0?g.from:g.to,f.outward,g.width,mm,tiles,[],f.approachDirections));
      if(continuity.some(c=>!c.valid)){write('route-replay.json',{report,reportHash,attempt,adaptations,continuity,accepted:false,components:2,validation:{reason:'reconstruction-to-original walking continuity'},ms:performance.now()-started});preserve();console.log('REPLAY continuity rejected',JSON.stringify(continuity.map(c=>({valid:c.valid,reason:c.reason}))));return;}
      g.rise=g.to[2]-g.from[2];
    }
    const plan=Math.hypot(g.to[0]-g.from[0],g.to[1]-g.from[1]);
    const pair={tileA:tiles[0].id,tileB:tiles[1].id,portA:a.id,portB:b.id,from:g.from,to:g.to,plan,rise:g.rise,distance:Math.hypot(plan,g.rise),usableWidth:g.width,startWidth:g.width,endWidth:g.width,startDirection:a.outward,endDirection:b.outward,connectionClass:Math.abs(g.rise)>.1?'VERTICAL':'ADAPTIVE',confidence:1,facing:1,widthCompatibility:1,score:0,featureConnection:{source:a.kind,target:b.kind,sourceFeature:a.id,targetFeature:b.id}};
    pair.path=load('transitionGeometry').transitionPath(pair,g.bend);
    const classification=load('portConnectionValidation').acceptCirculationClass(pair),validation=classification?load('portConnectionValidation').validateCirculationConnection(pair,mm,tiles,[],{maxRun:72}):{reason:'route slope/run'};
    const packing=validation.reason==='accepted'?load('extensionReconstruction').originalPlacementMaterial(mm,tiles):undefined;
    const accepted=validation.reason==='accepted'&&packing.status==='VERIFIED';
    let synthesis;if(accepted){synthesis=load('connectionSynthesis').synthesizeConnectors(mm,tiles,[],{portPairs:[pair],networkOnly:true});if(!synthesis.connectors.length)throw new Error('Replay failed fresh emitted synthesis');write('feature-geometry.json',{models:mm,originalModels,tiles,synthesis});fs.writeFileSync(path.join(out,'generated-connection.obj'),load('connectionSynthesis').connectorsToObj(synthesis.connectors),{flag:'wx'});fs.writeFileSync(path.join(out,'derived-working-forms.obj'),load('branchAdaptation').workingBranchesToObj(mm,tiles),{flag:'wx'});}
    write('route-replay.json',{report,reportHash,attempt,adaptations,pair,validation,packing,accepted,components:accepted?1:2,ms:performance.now()-started});
    if(hash(fs.readFileSync(report))!==reportHash)throw new Error('Prior evidence changed');preserve();console.log('REPLAY',JSON.stringify({accepted,validation,packing,ms:performance.now()-started}));return;
  }
  if(mode==='feature-inventory'){
    const rows=[],started=performance.now(),seen=new Set();
    for(const [slot,id] of Object.entries(state.assignments)){
      if(!id||seen.has(id))continue;seen.add(id);
      if(performance.now()-started>180000){rows.push({slot,id,status:'UNVERIFIED',reason:'inventory wall-time budget'});continue;}
      const source=state.meshes.find(m=>m.id===id);if(!source)continue;
      const model=models.find(m=>m.id===id)??{...load('analyze').analyzeMesh(source,slot,1,'y'),sourceResponsiveExtensions:true},tile={id:model.id,ix:0,iy:0,iz:0,variant:0};
      const classified=load('connectionFeatures').connectionFeatures(model),windows=load('connectionFeatures').placedConnectionFeatures(model,tile);
      const qualified=windows.map(f=>({feature:f,result:load('walkingApproach').validateSourceApproach(model,tile,f.point,f.outward,Math.min(2.1,f.width))})).filter(r=>r.result.valid);
      const topology=load('surfaceOrientation').surfaceOrientation(model.connectionSurface).components.map(c=>({boundary:c.boundaryEdges,inconsistent:c.inconsistentEdges,uncertainty:c.uncertainty}));
      const row={slot,id,filename:source.filename,sha256:source.sourceSHA256,counts:Object.fromEntries(['branch','corner','edge','other'].map(k=>[k,classified.features.filter(f=>f.kind===k).length])),excluded:classified.excluded,windows:windows.length,qualified:qualified.map(q=>q.feature),topology};rows.push(row);
      console.log('INVENTORY',JSON.stringify({...row,qualified:qualified.length}));
    }write('feature-inventory.json',rows);preserve();return;
  }
  if(mode==='feature-connection'||mode==='feature-fallback'){
    let pool=models;
    const requestedSlots=process.argv.find(a=>a.startsWith('--slots='))?.slice(8).split(',');
    if(mode==='feature-fallback'){
      const selected=['Gathering Void Field.obj','Lobby Vertical Void.obj','Lobby Continuous Hall.obj'];
      pool=selected.map((name,i)=>{const file=path.join(root,'original-obj-references',name),sha=hash(fs.readFileSync(file)),uploaded=state.meshes.find(m=>m.sourceSHA256===sha);if(!uploaded)throw new Error('Verified reference not present in uploaded project: '+name);return {...load('analyze').analyzeMesh(uploaded,'FEATURE-'+i,1,'y'),sourceResponsiveExtensions:true};});
    }
    if(requestedSlots)pool=requestedSlots.map(slot=>{const source=state.meshes.find(m=>m.id===state.assignments[slot]);if(!source)throw new Error('Mapped source unavailable: '+slot);return {...load('analyze').analyzeMesh(source,slot,1,'y'),sourceResponsiveExtensions:true};});
    const results=[];
    const requestedPair=process.argv.find(a=>a.startsWith('--pair='))?.slice(7).split(',').map(Number);
    for(const selected of requestedPair?[requestedPair]:requestedSlots?[[0,1]]:mode==='feature-fallback'?[[0,1],[0,2],[2,1]]:[[0,1]]){
      const mm=selected.map((i,k)=>({...pool[i],id:pool[i].id+'::feature-'+k}));
      const placements=mode==='feature-fallback'?[{id:mm[0].id,ix:1,iy:1,iz:0,zLift:0,variant:0},{id:mm[1].id,ix:2,iy:1,iz:0,zLift:0,variant:0}]:original.tiles.map((t,i)=>({...t,id:mm[i].id}));
      const rotation=process.argv.find(a=>a.startsWith('--rotation='));if(rotation)placements[1].variant=Number(rotation.slice(11));
      const sourceRotation=process.argv.find(a=>a.startsWith('--source-rotation='));if(sourceRotation)placements[0].variant=Number(sourceRotation.slice(18));
      for(let i=0;i<placements.length;i++)if(!Number.isInteger(placements[i].variant)||!mm[i].variants[placements[i].variant])throw new Error('Invalid fixture orientation variant');
      const offset=process.argv.find(a=>a.startsWith('--offset='))?.slice(9).split(',').map(Number);
      if(offset){if(offset.length!==2||offset.some(v=>!Number.isInteger(v))||Math.abs(offset[0])+Math.abs(offset[1])!==1)throw new Error('Fixture requires one side-adjacent registration bay');placements[1].ix=placements[0].ix+offset[0];placements[1].iy=placements[0].iy+offset[1];}
      const categories=process.argv.find(a=>a.startsWith('--features='))?.slice(11).split(',');
      if(categories&&(!categories.length||categories.some(c=>!['branch','corner','edge','other'].includes(c))))throw new Error('Invalid feature policy');
      const policy=categories?Object.fromEntries(['branch','corner','edge','other'].map(c=>[c,categories.includes(c)])):undefined;
      let materialCaptured=false;
      const result=load('featureConnections').generateFeatureConnections(mm,placements,{policy,pairs:12,adaptations:12,milliseconds:45000,onEvaluation:e=>{
        if(materialCaptured||!e.pair.extension)return;materialCaptured=true;
        const bodies=load('extensionReconstruction').extensionConstructionCandidates(e.pair);
        const audits=bodies.map((mesh,index)=>({index,kind:mesh.kind,triangles:mesh.indices.length/3,selfIntersection:load('connectionClearance').auditDerivedSelfIntersections(mesh)}));
        write('first-material-evaluation.json',{status:'DIAGNOSTIC SNAPSHOT; NOT A CONNECTOR ACCEPTANCE',pair:e.pair,models:e.models,originalModels:mm,tiles:e.tiles,validation:e.validation,bodies,audits});
      }});
      results.push({source:mm.map(m=>({id:m.id,filename:m.filename})),tiles:placements,result});
      console.log('FEATURE CONNECTION',JSON.stringify({sources:mm.map(m=>m.filename),inventory:result.featureDiagnostics.inventory,generated:result.featureDiagnostics.generated,tested:result.featureDiagnostics.evaluated,adaptations:result.featureDiagnostics.adaptations,accepted:result.pairs.length,components:result.componentsAfter,stop:result.featureDiagnostics.stopReason,reasons:result.featureDiagnostics.attempts.reduce((r,a)=>(r[a.reason]=(r[a.reason]??0)+1,r),{}),ms:result.featureDiagnostics.ms}));
      if(result.pairs.length){const synthesis=load('connectionSynthesis').synthesizeConnectors(result.workingModels,placements,[],{portPairs:result.pairs,networkOnly:true});if(!synthesis.connectors.length)throw new Error('Feature route failed emitted synthesis');write('feature-geometry.json',{models:result.workingModels,originalModels:mm,tiles:placements,synthesis});fs.writeFileSync(path.join(out,'generated-connection.obj'),load('connectionSynthesis').connectorsToObj(synthesis.connectors),{flag:'wx'});fs.writeFileSync(path.join(out,'derived-working-forms.obj'),load('branchAdaptation').workingBranchesToObj(result.workingModels,placements),{flag:'wx'});break;}
    }
    write('feature-results.json',results);preserve();return;
  }
  if(mode==='features'){
    for(const model of models){const features=load('connectionFeatures').connectionFeatures(model),regions=load('architecturalSurfaces').architecturalSurfaces(model),physical=load('surfaceOrientation').surfaceOrientation(model.connectionSurface);
      write(model.slotId+'-features.json',{features,regions,topology:physical.components});
      console.log('FEATURES',model.slotId,JSON.stringify({counts:Object.fromEntries(['branch','corner','edge','other'].map(k=>[k,features.features.filter(f=>f.kind===k).length])),excluded:features.excluded,triangles:model.connectionSurface.triangles.length/3,components:physical.components.map(c=>({boundary:c.boundaryEdges,inconsistent:c.inconsistentEdges,uncertainty:c.uncertainty})),regions:regions.filter(r=>r.area>=4).map(r=>({region:r.region,area:r.area,role:r.role,min:r.min,max:r.max}))}));
    }preserve();return;
  }
  if(mode==='approaches') {
    for(const model of models) {
      const tile={id:model.id,ix:0,iy:0,iz:0,variant:0};
      const discovery=load('interiorApproaches').discoverInteriorApproaches(model,tile,[model],[tile],[],{windows:256});
      write(model.slotId+'-approaches.json',discovery);
      console.log('APPROACHES',model.slotId,'qualified',discovery.qualified.length,'tested',discovery.tested,'available',discovery.available,'ms',discovery.ms);
    }
    preserve();return;
  }
  if(mode==='adaptation') {
    const instances=models.map((m,i)=>({...m,id:original.tiles[i].id}));
    const study=await load('branchAdaptationStudy').studyBranchAdaptations(instances,original.tiles,state.field,load('architecturalArrangement').DEFAULT_ARCHITECTURAL_PREFERENCES,{proposals:24,arrangements:2,attachments:16,routes:32,milliseconds:40000},console.log,()=>{},true);
    write('adaptation.json',study);console.log('ADAPTATION',study.stopReason,study.adaptationAttempts);preserve();return;
  }
  if(mode==='suite') {
    const selected=['G1','O3','L1','G2','O1','L3','G3','O2'];
    const pool=selected.map(slot=>{const mesh=state.meshes.find(m=>m.id===state.assignments[slot]);if(!mesh)throw new Error('Missing '+slot);return {...load('analyze').analyzeMesh(mesh,slot,1,'y'),sourceResponsiveExtensions:true};});
    for(const count of [2,4,8]){
      const start=performance.now(),observations=[];
      const result=await load('assignmentSearch').searchAssignmentCopies(pool.slice(0,count),count,{cancelled:()=>false,onProgress:console.log,onEvaluation:(tiles,s)=>observations.push({tiles,components:s.organicDiagnostics?.components,connectors:s.connectors.length})},'copies-'+count,{cellsX:8,cellsY:8,cellsZ:1},pool.slice(0,count),new Set(pool.map(m=>m.id)),{guided:true,perStage:4,candidates:32,milliseconds:60000,stopOnConnected:true});
      if(result.tiles.some(t=>t.iz!==0||(t.zLift??0)!==0))throw new Error('Single-level registration violated');
      write(`suite-${count}.json`,{durationMs:performance.now()-start,observations,result});
      console.log('SUITE',count,'ms',performance.now()-start,'accepted',result.synthesis.connectors.length,'components',result.components,'tested',result.candidatesTested);
    }
    preserve();return;
  }
  if(mode==='positive') {
    const previous=JSON.parse(fs.readFileSync(path.join(root,'reports/stage2d2-source-responsive-2026-10-11T23-27-46-802Z/results.json')));
    const example=previous.cases.find(c=>c.label==='two authoritative LVV copies');
    const file=path.join(root,'original-obj-references/Lobby Vertical Void.obj');
    const uploaded=state.meshes.find(m=>m.sourceSHA256===hash(fs.readFileSync(file)));
    if(!uploaded)throw new Error('Positive control does not match current uploaded OBJ');
    const base=load('analyze').analyzeMesh(uploaded,'L1',1,'y');
    const mm=[example.source,example.target].map(s=>({...base,id:s.id,sourceResponsiveExtensions:true})),tt=[example.source.placement,example.target.placement];
    const saved=JSON.parse(fs.readFileSync(path.join(root,'reports/stage2d2-source-cap-2026-10-12T04-24-27-360Z/results.json')));
    const results=[];
    for(const sample of saved.results.slice(0,4)){
      const pair=structuredClone(sample.pair);delete pair.extension;
      const validation=load('portConnectionValidation').validateCirculationConnection(pair,mm,tt,[],{maxRun:72});
      results.push({pair,validation});
      if(validation.reason==='accepted'){
        const synthesis=load('connectionSynthesis').synthesizeConnectors(mm,tt,[],{portPairs:[pair],networkOnly:true});
        if(!synthesis.connectors.length||synthesis.organicDiagnostics.components!==1)throw new Error('Accepted control failed emitted graph');
        write('positive-geometry.json',{models:mm,tiles:tt,synthesis});
        const invalid=structuredClone(pair);invalid.from[2]+=1;
        if(load('portConnectionValidation').validateCirculationConnection(invalid,mm,tt,[]).reason==='accepted')throw new Error('Invalid endpoint accepted');
        break;
      }
    }
    write('positive-results.json',results);console.log('POSITIVE',results.map(r=>r.validation.reason));preserve();return;
  }
  for (let repeat=0;repeat<2;repeat++) {
    const started=performance.now();
    const captured=await load('connectionDiagnostics').captureConnectionDiagnosticsAsync(async()=>{
      if(mode==='search')return load('assignmentSearch').searchAssignmentCopies(models,2,{cancelled:()=>false,onProgress:m=>console.log(m)},'copies-2',state.field,models,new Set(models.map(m=>m.id)),load('assignmentSearch').DEFAULT_ASSIGNMENT_SEARCH_OPTIONS);
      const instances=models.map((m,i)=>({...m,id:original.tiles[i].id})),tiles=original.tiles;
      const evaluation=load('search').evaluateAssembly(instances,tiles);
      const ports=load('portMatching').matchAssemblyPorts(instances,tiles,evaluation.connections,{},true,true);
      const synthesis=load('connectionSynthesis').synthesizeConnectors(instances,tiles,evaluation.connections,{portPairs:ports.pairs,...ports});
      return {tiles,ports,synthesis};
    },400);
    const value=captured.value;
    const milliseconds=performance.now()-started;
    write(`run-${repeat}.json`,{milliseconds,trace:captured.trace,result:value});
    console.log('RUN',repeat,milliseconds,'CONNECTORS',value.synthesis.connectors.length);
  }
  preserve();
}
main().catch(error=>{write('INCOMPLETE.json',{error:error.stack});console.error(error);process.exitCode=1;});
