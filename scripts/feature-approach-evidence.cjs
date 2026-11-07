// Exact failed-approach evidence. No solver run, source edits, or mesh omission.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const input=fs.realpathSync(path.resolve(root,process.argv[2]));if(!input.toLowerCase().startsWith(fs.realpathSync(root).toLowerCase()+path.sep))throw Error('Evidence outside worktree');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),before=hash(input),r=JSON.parse(fs.readFileSync(input));
async function main(){
 await load('extensionReconstruction').initializeExtensionReconstruction();
 const record=JSON.parse(fs.readFileSync(r.report))[0],tile=record.tiles[0],model=r.adaptations[0].model;
 if(!model||r.continuity?.[0]?.valid!==false)throw Error('Expected retained failed working approach');
 const point=load('surfaceAttachment').worldFromLocal(r.adaptations[0].point,tile,model),localFeature=r.adaptations[0].provenance.plan.feature;
 const tip=load('surfaceAttachment').worldFromLocal(localFeature.point.map((v,k)=>v+localFeature.outward[k]),tile,model),base=load('surfaceAttachment').worldFromLocal(localFeature.point,tile,model),outward=tip.map((v,k)=>v-base[k]);
 const fixture=JSON.parse(fs.readFileSync(path.join(path.dirname(input),'fixture.json'))).fixture,envelope=JSON.parse(fs.readFileSync(fixture));
 if(crypto.createHash('sha256').update(envelope.payload).digest('hex')!==envelope.checksum)throw Error('Project checksum mismatch');
 const state=load('projectStorage').decodeProjectState(envelope.payload);
 const originalModels=record.source.map(identity=>{const source=state.meshes.find(m=>m.id===identity.id.split('::')[0]);if(!source||source.filename!==identity.filename)throw Error('Source identity mismatch');return {...load('analyze').analyzeMesh(source,null,1,'y'),id:identity.id};});
 const scene=originalModels.map((m,i)=>r.adaptations[i]?.model??m),started=performance.now();
 const continuity=load('featureConnections').reconstructionContinuity(originalModels[0],model,tile,point,outward,2.1,scene,record.tiles,[],localFeature.approachDirections?.map(d=>{const p=load('surfaceAttachment').worldFromLocal(localFeature.point.map((v,k)=>v+d[k]),tile,model);return p.map((v,k)=>v-base[k]);}));
 const continuityMs=performance.now()-started;
 const region=r.continuity[0].evidence[0].details.region,meta=load('surfaceOrientation').surfaceOrientation(model.connectionSurface);
 const project=p=>{const w=load('surfaceAttachment').worldFromLocal(p,tile,model),dx=w[0]-point[0],dy=w[1]-point[1];return [-dx*outward[0]-dy*outward[1],-dx*outward[1]+dy*outward[0],w[2]];};
 const triangles=meta.triangles.filter(t=>t.region===region&&t.normalZ>=.65).map(t=>t.points.map(project));if(!triangles.length)throw Error('No selected-region evidence');
 const all=triangles.flat(),min=[Math.min(-1,...all.map(p=>p[0]))-1,Math.min(-4,...all.map(p=>p[1]))-1],max=[Math.max(7,...all.map(p=>p[0]))+1,Math.max(4,...all.map(p=>p[1]))+1],scale=Math.min(1050/(max[0]-min[0]),850/(max[1]-min[1]));
 const xy=p=>[80+(p[0]-min[0])*scale,120+(max[1]-p[1])*scale],pts=p=>p.map(x=>xy(x).join(',')).join(' ');
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1100" viewBox="0 0 1240 1100"><rect width="1240" height="1100" fill="#000"/><g font-family="Arial" fill="#F7F6F5"><text x="35" y="35" font-size="22">Failed approach: exact reconstructed upper region</text><text x="35" y="65" font-size="16">'+model.filename.replaceAll('&','&amp;')+' — plan; one unit = one foot</text></g>';
 for(const t of triangles){const z=t.reduce((s,p)=>s+p[2]/3,0),light=Math.max(70,Math.min(220,150+(z-point[2])*70));svg+='<polygon points="'+pts(t)+'" fill="rgb('+light+','+light+','+light+')" stroke="#B9BEC6" stroke-width="0.2"/>';}
 const rect=(x0,y0,x1,y1,color)=>'<polygon points="'+pts([[x0,y0],[x1,y0],[x1,y1],[x0,y1]])+'" fill="none" stroke="'+color+'" stroke-width="2"/>';
 svg+=rect(0,-1.05,2,1.05,'#71BEDA')+rect(0,-1.05,6,1.05,'#D6AD4F');
 for(const sign of [-1,1])svg+=rect(1.2-1.05,Math.min(0,sign*3),1.2+1.05,Math.max(0,sign*3),'#E27575');
 const p=xy([0,0]);svg+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="5" fill="#71BEDA"/><g font-family="Arial" font-size="16" fill="#F7F6F5"><text x="35" y="1025">Cyan: required 2.1 × 2 ft entrance. Gold: 6 ft straight approach. Red: candidate turning legs.</text><text x="35" y="1053">All '+triangles.length+' triangles of selected working upper region '+region+' retained. Not a validated connection.</text><text x="35" y="1080">Vertical variation shown by shading. Other floors omitted explicitly to inspect this approach footprint.</text></g></svg>';
 const out=path.join(root,'reports','feature-approach-evidence-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'approach-plan.svg'),svg,{flag:'wx'});await sharp(Buffer.from(svg)).png().toFile(path.join(out,'approach-plan.png'));
 if(hash(input)!==before)throw Error('Input evidence changed');
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({input,sha256:before,triangles:triangles.length,region,point,outward,continuity,continuityMs,status:'APPROACH DIAGNOSTIC; NO CONNECTOR ACCEPTED'},null,2),{flag:'wx'});console.log(out,JSON.stringify({valid:continuity.valid,reason:continuity.reason,joint:continuity.joint,continuityMs}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
