// Read-only source inspection; writes new diagnostic evidence, never mesh inputs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const project=fs.realpathSync(process.argv[2]),report=fs.realpathSync(path.resolve(root,process.argv[3]));
if(!report.toLowerCase().startsWith(fs.realpathSync(root).toLowerCase()+path.sep))throw Error('Report outside worktree');
const inputs=[project,report,path.join(root,'checkpoints/lattice-session.json'),...fs.readdirSync(path.join(root,'original-obj-references')).filter(f=>f.endsWith('.obj')).map(f=>path.join(root,'original-obj-references',f))];
const hashes=inputs.map(file=>({file,sha256:sha(fs.readFileSync(file))}));
const envelope=JSON.parse(fs.readFileSync(project));if(sha(envelope.payload)!==envelope.checksum)throw Error('Invalid portable project');
const state=load('projectStorage').decodeProjectState(envelope.payload),record=JSON.parse(fs.readFileSync(report))[0];
function projectedHeight(point,triangle){
 const [a,b,c]=triangle.points,ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;
 if(Math.abs(det)<1e-12)return;
 const u=((point[0]-a[0])*vy-(point[1]-a[1])*vx)/det,v=(ux*(point[1]-a[1])-uy*(point[0]-a[0]))/det;
 if(u< -1e-7||v< -1e-7||u+v>1+1e-7)return;
 return a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
}
async function main(){
 await load('extensionReconstruction').initializeExtensionReconstruction();
 const results=[];
 for(const [i,identity]of record.source.entries()){
  const source=state.meshes.find(m=>m.id===identity.id.split('::')[0]);if(!source||source.filename!==identity.filename)throw Error('Uploaded source identity mismatch');
  const model={...load('analyze').analyzeMesh(source,null,1,'y'),id:identity.id},metadata=load('surfaceOrientation').surfaceOrientation(model.connectionSurface);
  const rows=load('connectionFeatures').connectionFeatures(model).features.map(feature=>{
   const hits=[];metadata.triangles.forEach((t,id)=>{if(t.region!==feature.region||t.normalZ<.65)return;const z=projectedHeight(feature.point,t);if(z!==undefined)hits.push({triangle:id,z,error:z-feature.point[2]});});
   hits.sort((a,b)=>Math.abs(a.error)-Math.abs(b.error));
   return {id:feature.id,kind:feature.kind,region:feature.region,point:feature.point,run:feature.run,outward:feature.outward,width:feature.width,nearest: hits[0]??null};
  });
  const invalid=rows.filter(f=>!f.nearest||Math.abs(f.nearest.error)>1e-5);
  results.push({filename:source.filename,sourceSHA256:source.sourceSHA256,placement:record.tiles[i],features:rows.length,offSurface:invalid.length,invalid});
  console.log(source.filename,JSON.stringify({features:rows.length,offSurface:invalid.length,examples:invalid.slice(0,8)}));
 }
 for(const h of hashes)if(sha(fs.readFileSync(h.file))!==h.sha256)throw Error('Input preservation failed: '+h.file);
 const out=path.join(root,'reports','feature-datum-audit-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'datum-audit.json'),JSON.stringify({status:'DIAGNOSTIC_ONLY',coordinateConvention:'one source unit = one foot; Y-up converted once by existing importer',results,preservation:hashes},null,2),{flag:'wx'});
 console.log('OUTPUT',out);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
