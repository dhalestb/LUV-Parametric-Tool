// Bounded visual evidence from saved accepted REAL-OBJ routes, not a new search.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const input=path.resolve(root,process.argv[2]??'reports/stage2d2-source-responsive-2026-10-12T04-07-20-622Z/results.json');
assert(input.startsWith(root+path.sep));
const data=JSON.parse(fs.readFileSync(input));
const fixture=data.cases?.find(c=>c.label==='two authoritative LVV copies')??(data.models?.length===2&&data.synthesis?.portPairs?.length?{
  source:{placement:data.tiles[0]},target:{placement:data.tiles[1]},
  accepted:data.synthesis.portPairs.map(pair=>({pair,meshes:data.synthesis.connectors.filter(c=>c.portPair?.portA===pair.portA&&c.portPair?.portB===pair.portB)})),
}:null);assert(fixture?.accepted.length);assert(fixture.accepted.every(r=>r.meshes.length));
const orientationFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json');
const orientations=JSON.parse(fs.readFileSync(orientationFile));
const guards=[input,orientationFile,path.join(root,'checkpoints/lattice-session.json'),...orientations.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,digest(f)]);
for(const source of orientations.sources)assert.equal(digest(path.join(root,source.relativePath)),source.sha256);
const ref=orientations.sources.find(s=>s.id==='AUTH-LVV');assert(ref);
const model=load('analyze').analyzeMesh(load('parseObj').parseObj(fs.readFileSync(path.join(root,ref.relativePath),'utf8'),path.basename(ref.relativePath)),null,1,'y');
const placements=[fixture.source.placement,fixture.target.placement];
const triangles=mesh=>{const result=[];for(let i=0;i<mesh.indices.length;i+=3)result.push(mesh.indices.slice(i,i+3).map(v=>Array.from(mesh.positions.slice(v*3,v*3+3))));return result;};
const sourceModels=data.originalModels??(data.models?.length===2?data.models:[model,model]);
const placedTriangles=(m,tile)=>triangles({positions:m.connectionSurface.positions,indices:m.connectionSurface.triangles}).map(t=>t.map(p=>load('surfaceAttachment').worldFromLocal(p,tile,m)));
const originals=placements.flatMap((tile,i)=>placedTriangles(sourceModels[i],tile));
const working=placements.flatMap((tile,i)=>data.models?.[i]?.featureAdaptation?placedTriangles(data.models[i],tile):[]);
const out=path.join(root,'reports',`stage2d2-real-evidence-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const started=performance.now(),manifest=[];
const subtract=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
function section(t,mid,side){
  const ds=t.map(p=>dot(subtract(p,mid),side));
  if(ds.every(d=>Math.abs(d)<1e-10))return {coplanar:true,points:[...t,t[0]]};
  const hits=[];
  for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(ds[i])<1e-10)hits.push(t[i]);if(ds[i]*ds[j]<0){const u=ds[i]/(ds[i]-ds[j]);hits.push(t[i].map((v,k)=>v+u*(t[j][k]-v)));}}
  const unique=hits.filter((p,i)=>!hits.slice(0,i).some(q=>Math.hypot(...subtract(p,q))<1e-10));
  return unique.length>=2?{coplanar:false,points:unique.slice(0,2)}:null;
}
async function draw(route,index,kind){
  const pair=route.pair,derived=route.meshes.flatMap(triangles),direction=subtract(pair.to,pair.from),run=Math.hypot(direction[0],direction[1]),forward=[direction[0]/run,direction[1]/run,0],side=[-forward[1],forward[0],0],mid=pair.from.map((v,k)=>(v+pair.to[k])/2);
  const isSection=kind==='section',plan=kind==='plan';
  const project=p=>isSection?[dot(subtract(p,mid),forward),-p[2]]:plan?[p[0],-p[1]]:[.8660254*(p[0]-p[1]),.5*(p[0]+p[1])-p[2]];
  const records=[];let coplanar=0;
  for(const [mesh,color]of [[kind==='derived'?[]:originals,'source'],[kind==='derived'?[]:working,'working'],[derived,'derived']])for(const t of mesh){
    let geometry={points:t,coplanar:false};if(isSection){geometry=section(t,mid,side);if(!geometry)continue;if(geometry.coplanar)coplanar++;}
    const points=geometry.points.map(project),normal=cross(subtract(t[1],t[0]),subtract(t[2],t[0])),length=Math.hypot(...normal);
    const shade=.48+.45*Math.abs(dot(normal,[.25,-.4,.88]))/(length||1),base=color==='source'?[190,197,203]:color==='working'?[113,190,218]:[214,173,79];
    records.push({points,color:`rgb(${base.map(v=>Math.round(v*shade)).join(',')})`,depth:t.reduce((s,p)=>s+(plan?p[2]:p[0]+p[1]+p[2]),0),coplanar:geometry.coplanar,derived:color==='derived'});
  }
  const minimum=[Infinity,Infinity],maximum=[-Infinity,-Infinity];
  for(const r of records)for(const p of r.points)for(let k=0;k<2;k++){minimum[k]=Math.min(minimum[k],p[k]);maximum[k]=Math.max(maximum[k],p[k]);}
  let center=minimum.map((v,k)=>(v+maximum[k])/2),scale=Math.min(1080/(maximum[0]-minimum[0]),630/(maximum[1]-minimum[1]));
  if(kind==='departure'||kind==='arrival'){center=project(kind==='departure'?pair.from:pair.to);scale=70;}
  const xy=p=>[600+(p[0]-center[0])*scale,425+(p[1]-center[1])*scale].map(v=>v.toFixed(3)).join(',');
  records.sort((a,b)=>a.depth-b.depth);
  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><rect width="1200" height="850" fill="black"/><defs><clipPath id="view"><rect x="35" y="110" width="1130" height="655"/></clipPath></defs>';
  svg+=`<text x="35" y="42" fill="#F7F6F5" font-family="Arial" font-size="25">Real-OBJ connection ${index+1} / ${kind}</text><text x="35" y="75" fill="#71BEDA" font-family="Arial" font-size="15">Circulation gate accepted · Original OBJ preserved · Structural capacity UNVERIFIED</text><g clip-path="url(#view)">`;
  for(const r of records){const points=r.points.map(xy).join(' ');svg+=isSection?`<polyline points="${points}" fill="none" stroke="${r.coplanar?'#71BEDA':r.derived?'#D6AD4F':'#F7F6F5'}" stroke-width="${r.coplanar?.6:1.4}"/>`:`<polygon points="${points}" fill="${r.color}" stroke="${r.color}" stroke-width=".25"/>`;}
  svg+='</g><text x="35" y="800" fill="#B9BEC6" font-family="Arial" font-size="14">Grey: originals · Cyan: adapted working copies · Gold: connector · Feet / Z-up · 20-foot registration</text>';
  svg+=`<text x="35" y="827" fill="#B9BEC6" font-family="Arial" font-size="13">${isSection?`Exact plane sections; ${coplanar} coplanar triangles separately shown in cyan`:'All triangles retained; orthographic painter projection. Close-ups clip the view, not geometry.'}</text></svg>`;
  const name=`route-${String(index+1).padStart(2,'0')}-${kind}`;fs.writeFileSync(path.join(out,name+'.svg'),svg,{flag:'wx'});
  await sharp(Buffer.from(svg),{limitInputPixels:20000000}).resize(2400,1700).png().toFile(path.join(out,name+'.png'));
  manifest.push({route:index+1,kind,svg:name+'.svg',png:name+'.png',sourceTriangles:kind==='derived'?0:originals.length,derivedTriangles:derived.length,coplanarSectionTriangles:coplanar});
}
async function main(){
  assert(fixture.accepted.length<=128,'evidence route budget');
  for(const [index,route]of fixture.accepted.entries()){
    console.log('EVIDENCE',index+1,'of',fixture.accepted.length);
    for(const kind of ['axonometric','plan','section','departure','arrival','derived']){
      if(performance.now()-started>120000)throw new Error('120-second evidence limit; remaining views UNVERIFIED');
      await draw(route,index,kind);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(manifest,null,2));
    }
    const connectors=route.meshes.map((m,i)=>({...m,id:`route-${index+1}-${i}`,fromTile:route.pair.tileA,toTile:route.pair.tileB,direction:'none',reason:'accepted real-OBJ evidence',cost:0,portPair:route.pair}));
    fs.writeFileSync(path.join(out,`route-${index+1}-derived.obj`),load('connectionSynthesis').connectorsToObj(connectors),{flag:'wx'});
  }
  for(const [file,hash]of guards)assert.equal(digest(file),hash,file);
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({input,durationMs:performance.now()-started,accepted:fixture.accepted.length,views:manifest,preservation:guards,limitations:['Diagnostic orthographic painter rendering; numerical acceptance evidence is in input','Conceptual circulation; not ADA certification','Structural capacity and wider interior circulation UNVERIFIED']},null,2),{flag:'wx'});
  console.log('OUTPUT',out,'VIEWS',manifest.length);
}
main().catch(error=>{fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,views:manifest,preservation:guards.map(([file,hash])=>{try{return {file,unchanged:digest(file)===hash};}catch(e){return {file,status:'UNVERIFIED',error:String(e)};}})},null,2),{flag:'wx'});console.error(error);process.exitCode=1;});
