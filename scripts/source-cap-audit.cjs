// Replay four recorded real-OBJ alternatives; do not expand the arrangement search.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function metrics(p,t){
  const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
  const a=sub(t[1],t[0]),b=sub(t[2],t[0]),v=sub(p,t[0]);
  const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const aa=dot(a,a),ab=dot(a,b),bb=dot(b,b),d=aa*bb-ab*ab;
  const u=(bb*dot(a,v)-ab*dot(b,v))/d,w=(aa*dot(b,v)-ab*dot(a,v))/d;
  return {planeDistance:dot(v,n)/Math.hypot(...n),barycentric:[1-u-w,u,w]};
}
async function main(){
  const recordFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json');
  const record=JSON.parse(fs.readFileSync(recordFile));
  const guards=new Map([recordFile,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]));
  for(const s of record.sources)assert.equal(hash(path.join(root,s.relativePath)),s.sha256);
  const input=path.join(root,'reports/stage2d2-source-responsive-2026-10-11T23-27-46-802Z/results.json');
  const previous=JSON.parse(fs.readFileSync(input));
  const fixture=previous.cases.find(c=>c.label==='two authoritative LVV copies');assert(fixture);
  const s=record.sources.find(s=>s.id==='AUTH-LVV');assert(s);
  const mesh=load('parseObj').parseObj(fs.readFileSync(path.join(root,s.relativePath),'utf8'),path.basename(s.relativePath));
  const base=load('analyze').analyzeMesh(mesh,null,1,'y');
  let models=[fixture.source,fixture.target].map(s=>({...base,id:s.id,sourceResponsiveExtensions:true}));
  let tiles=[fixture.source.placement,fixture.target.placement];
  await load('extensionReconstruction').initializeExtensionReconstruction();
  const out=path.join(root,'reports',`stage2d2-source-cap-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
  const started=performance.now(),results=[];
  let selected=process.argv.includes('--all')?fixture.outcomes:Object.keys(fixture.counts).map(reason=>fixture.outcomes.find(o=>o.reason===reason));
  if(process.argv.includes('--independent')){
    // Additional original upload fixture, not a replacement for the AUTH cases.
    const session=JSON.parse(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')));
    assert.equal(session.unit,'feet');
    const original=session.meshes.find(m=>m.filename==='flat deep-plate workspace.obj');assert(original);
    const upload={...original,id:'INDEPENDENT-DEEP-PLATE',positions:Float32Array.from(original.positions),normals:Float32Array.from(original.normals),faces:original.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
    const model=load('analyze').analyzeMesh(upload,null,1,original.upAxis);
    models=[0,1].map(i=>({...model,id:'INDEPENDENT-DEEP-PLATE-'+i,sourceResponsiveExtensions:true}));
    tiles=models.map((m,i)=>({id:m.id,ix:i*2,iy:0,iz:0,variant:0}));
    console.log('BOUNDED INDEPENDENT',original.filename,tiles);
    const alternatives=load('alternativeRouting').evaluateAlternativeRoutes(models,tiles,models[0].id,models[1].id,[],{attachments:128,pairs:4,routes:32,maxSpan:50,maxRun:72});
    fs.writeFileSync(path.join(out,'independent-discovery.json'),JSON.stringify(alternatives,null,2),{flag:'wx'});
    selected=alternatives.outcomes;
  }else if(process.argv.includes('--alternate')){
    // One different bounded relationship: turn the arrival form 180 degrees,
    // retaining the same 20-foot registrations and original source coordinates.
    tiles[1]={...tiles[1],variant:6};
    console.log('BOUNDED ALTERNATE',tiles);
    const alternatives=load('alternativeRouting').evaluateAlternativeRoutes(models,tiles,models[0].id,models[1].id,[],{attachments:128,pairs:4,routes:32,maxSpan:50,maxRun:72});
    fs.writeFileSync(path.join(out,'alternate-discovery.json'),JSON.stringify(alternatives,null,2),{flag:'wx'});
    selected=alternatives.outcomes;
  }
  for(const sample of selected){
    assert(sample);const reason=sample.reason;
    if(performance.now()-started>90000){console.log('STOP 90-second candidate-replay limit');break;}
    const pair=structuredClone(sample.pair);delete pair.extension;
    console.log('REPLAY',results.length+1,reason);
    const capture=load('connectionDiagnostics').captureConnectionDiagnostics(()=>load('portConnectionValidation').validateCirculationConnection(pair,models,tiles,[],{fixedFootprint:true,maxRun:72}),1000);
    const validation=capture.value;
    const witness=pair.extension?.reconstruction?.witness;
    if(witness?.originalTriangle)witness.metrics=witness.generatedTriangle.map(p=>metrics(p,witness.originalTriangle));
    const actual=load('transitionGeometry').transitionMeshes(pair);
    const independent=pair.extension?.reconstruction?.status==='PASS'?actual.map(mesh=>load('connectionClearance').auditGeneratedSurface(mesh,models,tiles,(point,id)=>pair.extension.contacts.some(c=>c.sourceId===id&&load('extensionReconstruction').pointOnContact(point,c.triangle)),pair)):null;
    let websiteSynthesis=null;
    if(validation.reason==='accepted'){
      const synthesis=load('connectionSynthesis').synthesizeConnectors(models,tiles,[],{portPairs:[structuredClone(pair)]});
      const serial=m=>({positions:Array.from(m.positions),indices:m.indices,kind:m.kind});
      const emitted=synthesis.connectors.filter(m=>m.portPair?.portA===pair.portA&&m.portPair?.portB===pair.portB);
      const identical=JSON.stringify(emitted.map(serial))===JSON.stringify(actual.map(serial));
      websiteSynthesis={acceptedPairs:synthesis.portPairs.length,emitted:emitted.length,exactValidatedMesh:identical,confirmedComponents:synthesis.organicDiagnostics?.components};
      assert(identical&&synthesis.portPairs.length>0,'website synthesis must emit the actual validated route');
    }
    results.push({priorReason:reason,pair,validation,trace:capture.trace.events.filter(e=>e.stage==='clearance'),independent,websiteSynthesis,meshes:actual.map(m=>({...m,positions:Array.from(m.positions)}))});
    fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(results,null,2));
  }
  const preservation=[...guards].map(([file,sha])=>({file,sha,unchanged:hash(file)===sha}));assert(preservation.every(p=>p.unchanged));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({durationMs:performance.now()-started,input,results,preservation},null,2),{flag:'wx'});
  console.log('OUTPUT',out);
  const counts={},reconstruction={};for(const r of results){counts[r.validation.reason]=(counts[r.validation.reason]??0)+1;const s=r.pair.extension?.reconstruction;const key=s?.status+': '+(s?.reason??'verified');reconstruction[key]=(reconstruction[key]??0)+1;}
  console.log(JSON.stringify({evaluated:results.length,available:selected.length,counts,reconstruction},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
