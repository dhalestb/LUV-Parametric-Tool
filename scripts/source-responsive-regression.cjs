// Bounded real-upload verification. No authoritative or historical file is written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
// Node16 + .cts keeps local modules CommonJS while preserving native ESM import().
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const out=path.join(root,'reports',`stage2d2-source-responsive-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const tests=[],cases=[],started=performance.now();
const protectedFiles=new Map();
function preserve(file){protectedFiles.set(file,hash(fs.readFileSync(file)));}
function test(name,f){const start=performance.now();try{const details=f();const status=details?.status==='UNVERIFIED'?'UNVERIFIED':'PASS';tests.push({name,status,ms:performance.now()-start,details});console.log(status,name);}catch(e){tests.push({name,status:'FAIL',ms:performance.now()-start,error:e.stack});console.log('FAIL',name,e.message);}}
async function main(){
await load('extensionReconstruction').initializeExtensionReconstruction();
console.log('INITIALIZED manifold-3d');
if(process.argv.includes('--init-only'))return;
fs.mkdirSync(out,{recursive:false});
const orientations=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json');
const checkpoint=path.join(root,'checkpoints/lattice-session.json');
preserve(orientations);preserve(checkpoint);
const record=JSON.parse(fs.readFileSync(orientations));
const refs=record.sources.map(source=>{
  const file=path.join(root,source.relativePath);preserve(file);assert.equal(hash(fs.readFileSync(file)),source.sha256);
  const mesh=load('parseObj').parseObj(fs.readFileSync(file,'utf8'),path.basename(file));mesh.id=source.id;
  const model=load('analyze').analyzeMesh(mesh,null,1,'y');model.sourceResponsiveExtensions=true;
  console.log('ANALYZED',mesh.filename,model.faceCount);
  return {source,mesh,model};
});
const serialMesh=m=>({...m,positions:Array.from(m.positions)});
function examine(models,tiles,label,budget={attachments:32,pairs:4,routes:32,maxSpan:50,maxRun:72}){
  for(let a=0;a<models.length;a++)for(let b=a+1;b<models.length;b++){
    console.log('RELATIONSHIP',label,models[a].filename,models[b].filename);
    const result=load('alternativeRouting').evaluateAlternativeRoutes(models,tiles,models[a].id,models[b].id,[],budget);
    cases.push({label,source:result.source,target:result.target,counts:result.counts,attachments:result.attachments,pairs:result.pairs,
      timing:result.timing,outcomes:result.outcomes,approachRejections:result.approachRejections,accepted:result.accepted.map(a=>({...a,meshes:a.meshes.map(serialMesh)}))});
    fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({completed:cases.length,cases},null,2),{flag:'w'});
    console.log('RESULT',result.counts);
  }
}
const models=refs.map(r=>r.model);
const replayModels=new Map(),replayTiles=new Map();
const before=models.map(m=>hash(Buffer.from(m.connectionSurface.positions.buffer)));
// New, explicit trial fixtures: AUTH identifiers; never overwrite historical assignments.
const layouts=[{name:'compact four-form trial',cells:[[0,0],[1,0],[1,1],[0,1]],variants:[0,0,0,0]},
  {name:'rotated four-form trial',cells:[[0,0],[1,0],[1,1],[0,1]],variants:[0,6,3,9]}];
for(const layout of layouts){
  const tiles=models.map((m,i)=>({id:m.id,ix:layout.cells[i][0],iy:layout.cells[i][1],iz:0,variant:layout.variants[i]}));
  replayModels.set(layout.name,models);replayTiles.set(layout.name,tiles);
  examine(models,tiles,layout.name);
}
test('authoritative imported coordinates remain unchanged',()=>assert.deepEqual(models.map(m=>hash(Buffer.from(m.connectionSurface.positions.buffer))),before));
test('one source unit to one foot; 20-foot registration',()=>{
  assert.equal(load('types').LATTICE_FEET,20);
  for(const r of refs){const raw=load('objFidelity').combinedBoundsSpec(r.mesh,1,'y');assert.deepEqual(r.model.anchor,raw.anchor);}
});
// Independent original uploads from the historical catalog, not replacements for AUTH fixtures.
const session=JSON.parse(fs.readFileSync(checkpoint));
const held=session.meshes.filter(m=>!record.sources.some(s=>s.relativePath.endsWith(m.filename))&&/Gathering|Lobby/i.test(m.filename)).slice(-2);
const heldModels=held.map((p,i)=>{
  const mesh={...p,id:`HELD-${i}`,positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
  const model=load('analyze').analyzeMesh(mesh,null,1,p.upAxis);model.sourceResponsiveExtensions=true;return model;
});
if(heldModels.length===2){const tiles=heldModels.map((m,i)=>({id:m.id,ix:i,iy:0,iz:0,variant:0}));replayModels.set('independent historical uploads',heldModels);replayTiles.set('independent historical uploads',tiles);examine(heldModels,tiles,'independent historical uploads');}
// Real source copies are an additional reproducible capability test, not an
// approved final four-form arrangement or a substitute synthetic OBJ.
const copyModels=[0,1].map(i=>({...models[2],id:`LVV-COPY-${i}`}));
const copyTiles=copyModels.map((m,i)=>({id:m.id,ix:i*2,iy:0,iz:0,variant:0}));
replayModels.set('two authoritative LVV copies',copyModels);replayTiles.set('two authoritative LVV copies',copyTiles);
examine(copyModels,copyTiles,'two authoritative LVV copies',{attachments:128,pairs:16,routes:128,maxSpan:50,maxRun:72});
for(const filename of ['Gathering, Plate.obj','open hall workspace.obj','Lobby, Ground Field.obj']){
  const p=session.meshes.find(m=>m.filename===filename);assert(p,filename);
  const mesh={...p,id:'INDEPENDENT',positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};
  const base=load('analyze').analyzeMesh(mesh,null,1,p.upAxis);
  const mm=[0,1].map(i=>({...base,id:`INDEPENDENT-${i}`,sourceResponsiveExtensions:true}));
  const tiles=mm.map((m,i)=>({id:m.id,ix:i*2,iy:0,iz:0,variant:0})),label=`independent copies: ${filename}`;
  replayModels.set(label,mm);replayTiles.set(label,tiles);
  examine(mm,tiles,label,{attachments:128,pairs:16,routes:128,maxSpan:50,maxRun:72});
}
test('accepted real routes replay exact emitted geometry',()=>{
  for(const c of cases)for(const a of c.accepted){
    const mm=replayModels.get(c.label),tiles=replayTiles.get(c.label);
    const pair=structuredClone(a.pair);assert.equal(load('portConnectionValidation').validateCirculationConnection(pair,mm,tiles,[]).reason,'accepted');
    assert.deepEqual(load('transitionGeometry').transitionMeshes(pair).map(serialMesh),a.meshes);
    assert(pair.extension);assert.equal(pair.extension.structuralCapacity,'UNVERIFIED');
  }
  const accepted=cases.reduce((n,c)=>n+c.accepted.length,0);return {status:accepted?'PASS':'UNVERIFIED',accepted};
});
test('real-mesh capability evidence is explicit',()=>({status:cases.some(c=>c.accepted.length)?'DEMONSTRATED':'UNVERIFIED',reason:cases.some(c=>c.accepted.length)?undefined:'no accepted real connector',accepted:cases.reduce((n,c)=>n+c.accepted.length,0)}));
test('source and historical fidelity',()=>{for(const [file,sha]of protectedFiles)assert.equal(hash(fs.readFileSync(file)),sha,file);});
const summary={durationMs:performance.now()-started,tests,cases,sourceHashes:[...protectedFiles],
  limitations:['Bounded trials do not establish global infeasibility','Material interval and ruled underside are local geometric evidence, not engineering capacity','Curved or nonlinear underside regions reject instead of fabricating thickness']};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2),{flag:'wx'});
console.log('OUTPUT',out,'SECONDS',summary.durationMs/1000);
if(tests.some(t=>t.status==='FAIL'))process.exitCode=1;
}
main().catch(error=>{console.error(error);const preservation=[...protectedFiles].map(([file,sha])=>({file,unchanged:hash(fs.readFileSync(file))===sha}));fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,cases,tests,preservation},null,2),{flag:'wx'});process.exitCode=1;});
