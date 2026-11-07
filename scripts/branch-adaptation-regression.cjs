// Bounded real-OBJ branch adaptation; originals and existing evidence are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const recordFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json'),record=JSON.parse(fs.readFileSync(recordFile));
const guards=[recordFile,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const out=path.join(root,'reports',`stage2d2-branch-adaptation-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const started=performance.now(),attempts=[],tests=[];
const serial=(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v;
async function main(){
await load('extensionReconstruction').initializeExtensionReconstruction();
try{
  for(const source of record.sources){
    const file=path.join(root,source.relativePath);assert.equal(hash(file),source.sha256);
    const obj=load('parseObj').parseObj(fs.readFileSync(file,'utf8'),path.basename(file));obj.id=source.id;
    const model=load('analyze').analyzeMesh(obj,null,1,'y'),before=Buffer.from(model.connectionSurface.positions.buffer).toString('hex'),faces=JSON.stringify(model.connectionSurface.triangles);
    const branches=load('architecturalSurfaces').architecturalSurfaces(model).filter(r=>r.role==='projecting branch').sort((a,b)=>a.relativeElevation-b.relativeElevation||b.area-a.area).slice(0,1);
    for(const branch of branches)for(const plan of load('branchAdaptation').branchAdjustmentPlans(branch).slice(0,4)){
      if(performance.now()-started>90000)throw new Error('90-second complete-mesh branch budget');
      console.log('ATTEMPT',source.id,plan);
      const adaptation=load('branchAdaptation').adaptBranch(model,plan);
      const row={source:source.id,plan,valid:adaptation.valid,reason:adaptation.valid?'working geometry reconstructed; circulation not yet accepted':adaptation.reason,witness:adaptation.witness};
      if(adaptation.valid){
        row.provenance=adaptation.provenance;
        const adjusted=adaptation.model,tile={id:model.id,ix:0,iy:0,iz:0,variant:0},meta=load('surfaceOrientation').surfaceOrientation(adjusted.connectionSurface);
        row.footprints=[];
        for(const section of branch.sectionWidths){
          const along=i=>{const p=meta.triangles[i].points.reduce((p,q)=>p.map((v,k)=>v+q[k]/3),[0,0,0]);return (p[0]-branch.centroid[0])*branch.majorDirection[0]+(p[1]-branch.centroid[1])*branch.majorDirection[1];};
          const id=branch.triangles.slice().sort((a,b)=>Math.abs(along(a)-section.station)-Math.abs(along(b)-section.station))[0];
          const point=meta.triangles[id].points.reduce((p,q)=>p.map((v,k)=>v+q[k]/3),[0,0,0]);
          for(const sign of [-1,1]){const result=load('walkingApproach').validateWalkingApproach(adjusted,tile,point,branch.majorDirection.map(v=>v*sign),2.1,2,[adjusted],[tile],[]);row.footprints.push({triangle:id,point,sign,valid:result.valid,reason:result.reason,details:result.details});}
        }
        fs.writeFileSync(path.join(out,`working-${attempts.length}.json`),JSON.stringify({model:adjusted,provenance:adaptation.provenance},serial),{flag:'wx'});
        assert.deepEqual(adjusted.connectionSurface.triangles,model.connectionSurface.triangles);
        const changed=new Set(adaptation.provenance.changedVertices);
        for(let i=0;i<model.connectionSurface.positions.length;i++)if(!changed.has(Math.floor(i/3)))assert.equal(adjusted.connectionSurface.positions[i],model.connectionSurface.positions[i]);
      }
      attempts.push(row);console.log('RESULT',row.valid,row.reason,row.footprints?.filter(p=>p.valid).length??0);
    }
    assert.equal(Buffer.from(model.connectionSurface.positions.buffer).toString('hex'),before);assert.equal(JSON.stringify(model.connectionSurface.triangles),faces);
    tests.push({name:source.id+' original runtime geometry preserved',status:'PASS',branches:branches.length});
  }
  for(const [file,sha]of guards)assert.equal(hash(file),sha,file);
  tests.push({name:'original files and historical checkpoint preserved',status:'PASS'});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({attempts,tests,durationMs:performance.now()-started,preservation:guards,limitations:['No connection acceptance inferred from adaptation or isolated walking footprint','No structural capacity claim','Bounded branch hypotheses; no global search']},serial,2),{flag:'wx'});console.log('OUTPUT',out);
}catch(error){fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,attempts,tests,preservation:guards.map(([file,sha])=>{try{return {file,unchanged:hash(file)===sha};}catch(e){return {file,status:'UNVERIFIED',error:String(e)};}})},serial,2),{flag:'wx'});console.error(error);process.exitCode=1;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
