// Source-derived role/section evidence only; no arrangement or route search.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const file=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json'),record=JSON.parse(fs.readFileSync(file));
const guards=[file,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const out=path.join(root,'reports',`stage2d2-architectural-surfaces-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const started=performance.now(),forms=[];
try{
  for(const s of record.sources){const input=path.join(root,s.relativePath);assert.equal(hash(input),s.sha256);
    const obj=load('parseObj').parseObj(fs.readFileSync(input,'utf8'),path.basename(input));obj.id=s.id;
    const model=load('analyze').analyzeMesh(obj,null,1,'y');
    const features=load('architecturalSurfaces').architecturalSurfaces(model),tile={id:model.id,ix:0,iy:0,iz:0,variant:0};
    const attachment=load('surfaceAttachment').enumerateWalkableAttachments(model,tile,256),regions=new Map();
    for(const a of attachment.anchors){const r=load('architecturalSurfaces').architecturalInterface(model,tile,a.point);if(r)regions.set(r.region,(regions.get(r.region)??0)+1);}
    const metadata=load('surfaceOrientation').surfaceOrientation(model.connectionSurface),branchFootprints=[];
    for(const r of features.filter(r=>r.role==='projecting branch'))for(const section of r.sectionWidths){
      const id=r.triangles.slice().sort((a,b)=>{
        const along=i=>{const p=metadata.triangles[i].points.map((_,k)=>metadata.triangles[i].points.reduce((v,q)=>v+q[k],0)/3);return (p[0]-r.centroid[0])*r.majorDirection[0]+(p[1]-r.centroid[1])*r.majorDirection[1];};
        return Math.abs(along(a)-section.station)-Math.abs(along(b)-section.station);
      })[0];
      const triangle=metadata.triangles[id],point=[0,1,2].map(k=>triangle.points.reduce((v,p)=>v+p[k],0)/3);
      for(const sign of [-1,1]){const result=load('walkingApproach').validateWalkingApproach(model,tile,point,r.majorDirection.map(v=>v*sign),2.1,2,[model],[tile],[]);
        branchFootprints.push({region:r.region,triangle:id,point,width:2.1,depth:2,sign,valid:result.valid,reason:result.reason,details:result.details,interpretation:'intrinsic original-floor rectangle probe, not a verified entrance'});
      }
    }
    forms.push({filename:s.relativePath,sha256:s.sha256,coordinates:'architectural feet Z-up; reviewed Y-up transform applied once',features:features.map(r=>({...r,representedBoundaryWindows:regions.get(r.region)??0})),branchFootprints,attachmentDiscovery:{available:attachment.available,omitted:attachment.omitted}});
    console.log('SURFACE EVIDENCE',s.id,features.filter(r=>r.role==='projecting branch').map(r=>({region:r.region,elevation:r.centroid[2],sections:r.sectionWidths,representedWindows:regions.get(r.region)??0})));
    if(performance.now()-started>60000)throw new Error('60-second source-profile budget');
  }
  for(const [file,sha]of guards)assert.equal(hash(file),sha,file);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({forms,durationMs:performance.now()-started,preservation:guards,limitations:['Roles are geometric hypotheses','Section spans do not establish full approach width, slope, headroom, support, or structural capacity','Zero straight boundary windows does not prove global connection impossibility']},null,2),{flag:'wx'});
  console.log('OUTPUT',out);
}catch(error){fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,forms},null,2),{flag:'wx'});throw error;}
