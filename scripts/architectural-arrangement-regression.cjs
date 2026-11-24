const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const orientations=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json'),record=JSON.parse(fs.readFileSync(orientations));
const baselineFile=path.join(root,'reports/stage2d2-source-responsive-2026-10-12T04-07-20-622Z/results.json');
const guards=[orientations,baselineFile,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const out=path.join(root,'reports',`stage2d2-architectural-arrangement-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const implementation=['architecturalSurfaces','architecturalArrangement','architecturalNetwork','alternativeRouting','connectionSynthesis','extensionReconstruction'].map(n=>{const file=path.join(root,'src/components/lattice',n+'.ts');return {file,sha256:hash(file)};});
const tests=[],studies=[],started=performance.now();
const scenes=[];
const serial=(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v;
async function test(name,f){try{const details=await f();tests.push({name,status:'PASS',details});console.log('PASS',name);}catch(e){tests.push({name,status:'FAIL',error:e.stack});console.log('FAIL',name,e.message);}}
async function main(){
  await load('extensionReconstruction').initializeExtensionReconstruction();
  const models=record.sources.map(s=>{const file=path.join(root,s.relativePath);assert.equal(hash(file),s.sha256);const obj=load('parseObj').parseObj(fs.readFileSync(file,'utf8'),path.basename(file));obj.id=s.id;return {...load('analyze').analyzeMesh(obj,null,1,'y'),sourceResponsiveExtensions:true};});
  const surfaceHashes=models.map(m=>crypto.createHash('sha256').update(m.connectionSurface.positions).update(JSON.stringify(m.connectionSurface.triangles)).digest('hex'));
  const fixture=JSON.parse(fs.readFileSync(baselineFile)).cases.find(c=>c.label==='two authoritative LVV copies');assert(fixture.accepted.length);
  const lvv=models.find(m=>m.id==='AUTH-LVV');assert(lvv);
  const copies=[fixture.source,fixture.target].map(s=>({...lvv,id:s.id})),seeds=[fixture.source.placement,fixture.target.placement];
  await test('accepted LVV baseline remains geometrically accepted',()=>assert.equal(load('portConnectionValidation').validateCirculationConnection(structuredClone(fixture.accepted[0].pair),copies,seeds,[]).reason,'accepted'));
  await test('bounded proposals include rotations, mirrors, and lattice translations',()=>{
    const proposals=load('architecturalArrangement').architecturalProposals(copies,seeds,{cellsX:4,cellsY:4,cellsZ:1},96);
    assert(proposals.some(p=>p.some((t,i)=>copies[i].variants[t.variant].rotation!==copies[i].variants[seeds[i].variant].rotation)));
    assert(proposals.some(p=>p.some((t,i)=>copies[i].variants[t.variant].mirror!=='none')));
    assert(proposals.some(p=>p.some((t,i)=>t.ix!==seeds[i].ix||t.iy!==seeds[i].iy)));
    assert(proposals.every(p=>p.every(t=>t.iz===0)));return {generated:proposals.length};
  });
  await test('authoritative surface hypotheses are computed from actual geometry',()=>models.map(m=>({id:m.id,regions:load('architecturalSurfaces').architecturalSurfaces(m).map(r=>({region:r.region,role:r.role,area:r.area,centroid:r.centroid,elongation:r.elongation,maxSlope:r.maxSlope}))})));
  await test('tiny fragments are not branches; LVV lower projection remains identified',()=>{
    const features=models.flatMap(load('architecturalSurfaces').architecturalSurfaces);
    assert(features.filter(r=>r.role==='projecting branch').every(r=>r.area>=4));
    assert(load('architecturalSurfaces').architecturalSurfaces(lvv).some(r=>r.role==='projecting branch'&&r.relativeElevation<.2));
    assert(load('architecturalSurfaces').architecturalSurfaces(lvv).some(r=>r.role==='floor plate')); 
  });
  await test('actual LVV floor plates have distinct adjustable hierarchy hypotheses',()=>{
    const floors=load('architecturalSurfaces').architecturalSurfaces(lvv).filter(r=>r.role==='floor plate');assert(floors.length>=2);
    const hierarchy=floors.map(r=>({region:r.region,elevation:r.centroid[2],area:r.area,value:load('architecturalSurfaces').architecturalHierarchy(r)}));
    assert(Math.max(...hierarchy.map(r=>r.value))-Math.min(...hierarchy.map(r=>r.value))>.1);
    assert(floors.every(r=>r.walkingSuitability==='UNVERIFIED'));return hierarchy;
  });
  for(const [label,mm,tiles,budget]of [
    ['LVV orientation and branch comparison',copies,seeds,{proposals:96,arrangements:8,attachments:128,routes:256,milliseconds:120000}],
    ['four authoritative forms',models,models.map((m,i)=>({id:m.id,ix:i%2,iy:Math.floor(i/2),iz:0,variant:0})),{proposals:96,arrangements:4,attachments:64,routes:96,milliseconds:120000}]
  ]){
    console.log('STUDY',label);
    const result=await load('architecturalArrangement').studyArchitecturalArrangements(mm,tiles,{cellsX:4,cellsY:4,cellsZ:1},undefined,budget,m=>console.log(m));
    scenes.push({label,coordinates:'anchored architectural feet Z-up; axis/unit interpretation already applied',models:mm.map(m=>({id:m.id,filename:m.filename,variants:m.variants.map(v=>({rotation:v.rotation,mirror:v.mirror})),surface:{positions:m.connectionSurface.positions,indices:m.connectionSurface.triangles}}))});
    studies.push({label,result});fs.writeFileSync(path.join(out,`study-${studies.length}.json`),JSON.stringify(studies.at(-1),serial,2),{flag:'wx'});
    console.log('RESULT',label,result.evaluated,result.routes,result.arrangements.map(a=>({id:a.id,packing:a.packing.status,connections:a.selected.length,roles:a.selected.map(s=>[s.sourceRole,s.targetRole]),components:a.formComponents,score:a.score})));
    await test(label+' uses only fresh validated emitted meshes',()=>{
      for(const a of result.arrangements){assert(a.selected.length<=a.synthesis.portPairs.length);assert(a.status!=='PASS');
        for(const connector of a.synthesis.connectors)assert.equal(connector.portPair.extension.reconstruction.status,'PASS');
        assert.equal(a.interfaceNetwork.internalCirculation,'UNVERIFIED');
      }return {evaluated:result.evaluated,incomplete:result.incomplete,stopReason:result.stopReason};
    });
    for(const a of result.arrangements)if(a.synthesis.connectors.length)fs.writeFileSync(path.join(out,`study-${studies.length}-${a.id}-derived.obj`),load('connectionSynthesis').connectorsToObj(a.synthesis.connectors),{flag:'wx'});
  }
  const session=JSON.parse(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')));assert.equal(session.unit,'feet');
  const independent=['Gathering, Plate.obj','Lobby, Ground Field.obj'].map((filename,i)=>{
    const raw=session.meshes.find(m=>m.filename===filename);assert(raw,filename);
    const obj={...raw,id:`HELDOUT-${i}`,positions:Float32Array.from(raw.positions),normals:Float32Array.from(raw.normals),faces:raw.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
    return {...load('analyze').analyzeMesh(obj,null,1,raw.upAxis),sourceResponsiveExtensions:true};
  });
  const heldout=await load('architecturalArrangement').studyArchitecturalArrangements(independent,independent.map((m,i)=>({id:m.id,ix:i,iy:0,iz:0,variant:0})),{cellsX:4,cellsY:4,cellsZ:1},undefined,{proposals:48,arrangements:3,attachments:32,routes:48,milliseconds:60000},m=>console.log('HELDOUT',m));
  studies.push({label:'independent historical uploads',result:heldout});fs.writeFileSync(path.join(out,'study-3.json'),JSON.stringify(studies.at(-1),serial,2),{flag:'wx'});
  scenes.push({label:'independent historical uploads',coordinates:'anchored architectural feet Z-up; historical source up-axis already applied',models:independent.map(m=>({id:m.id,filename:m.filename,variants:m.variants.map(v=>({rotation:v.rotation,mirror:v.mirror})),surface:{positions:m.connectionSurface.positions,indices:m.connectionSurface.triangles}}))});
  await test('independent uploads remain explicit bounded evidence',()=>({evaluated:heldout.evaluated,routes:heldout.routes,accepted:heldout.arrangements.reduce((s,a)=>s+a.selected.length,0),incomplete:heldout.incomplete}));
  await test('source coordinates and topology remain unchanged',()=>assert.deepEqual(models.map(m=>crypto.createHash('sha256').update(m.connectionSurface.positions).update(JSON.stringify(m.connectionSurface.triangles)).digest('hex')),surfaceHashes));
  await test('original files and regression evidence remain unchanged',()=>{for(const [file,sha]of guards)assert.equal(hash(file),sha,file);});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({durationMs:performance.now()-started,tests,studies,preservation:guards,implementation},serial,2),{flag:'wx'});
  fs.writeFileSync(path.join(out,'original-scenes.json'),JSON.stringify({scenes,sourceGeometry:'complete unchanged imported source triangles; no second axis/unit conversion'},serial),{flag:'wx'});
  console.log('OUTPUT',out);if(tests.some(t=>t.status==='FAIL'))process.exitCode=1;
}
main().catch(error=>{fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,tests,studies,preservation:guards.map(([file,sha])=>{try{return {file,unchanged:hash(file)===sha};}catch(e){return {file,status:'UNVERIFIED',error:String(e)};}})},serial,2),{flag:'wx'});console.error(error);process.exitCode=1;});
