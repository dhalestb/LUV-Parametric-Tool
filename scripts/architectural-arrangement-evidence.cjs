// Full original-mesh comparison views from a completed bounded study.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp'),assert=require('node:assert/strict');
const root=fs.realpathSync(path.resolve(__dirname,'..'));assert(process.argv[2],'Supply the completed study directory');
const input=fs.realpathSync(path.resolve(root,process.argv[2]));assert(input.toLowerCase().startsWith(root.toLowerCase()+path.sep));
const resultsFile=path.join(input,'results.json'),sceneFile=path.join(input,'original-scenes.json');assert(fs.existsSync(resultsFile)&&fs.existsSync(sceneFile));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const guards=[resultsFile,sceneFile].map(f=>[f,hash(f)]),data=JSON.parse(fs.readFileSync(resultsFile)),library=JSON.parse(fs.readFileSync(sceneFile));
const out=path.join(root,'reports',`stage2d2-architectural-views-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
const started=performance.now(),manifest=[];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,k)=>v-b[k]);
const triangles=m=>{const result=[];for(let i=0;i<m.indices.length;i+=3)result.push(m.indices.slice(i,i+3).map(v=>m.positions.slice(v*3,v*3+3)));return result;};
function world(p,tile,model){const v=model.variants[tile.variant],angle=v.rotation*Math.PI/180,x=v.mirror==='x'?-p[0]:p[0],y=v.mirror==='y'?-p[1]:p[1];return [x*Math.cos(angle)-y*Math.sin(angle)+tile.ix*20,x*Math.sin(angle)+y*Math.cos(angle)+tile.iy*20,p[2]+tile.iz*20+(tile.zLift??0)];}
function section(t,mid,normal){const ds=t.map(p=>sub(p,mid).reduce((s,v,k)=>s+v*normal[k],0));if(ds.every(v=>Math.abs(v)<1e-10))return {points:[...t,t[0]],coplanar:true};const hits=[];
  for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(ds[i])<1e-10)hits.push(t[i]);if(ds[i]*ds[j]<0){const u=ds[i]/(ds[i]-ds[j]);hits.push(t[i].map((v,k)=>v+u*(t[j][k]-v)));}}
  const unique=hits.filter((p,i)=>!hits.slice(0,i).some(q=>Math.hypot(...sub(p,q))<1e-10));return unique.length>=2?{points:unique.slice(0,2),coplanar:false}:null;
}
async function draw(study,scene,candidate,number,kind){
  const selected=candidate.selected[0]?.pair,mid=selected?selected.from.map((v,k)=>(v+selected.to[k])/2):[0,0,0],dx=selected?selected.to[0]-selected.from[0]:1,dy=selected?selected.to[1]-selected.from[1]:0,len=Math.hypot(dx,dy)||1,u=[dx/len,dy/len,0],n=[-u[1],u[0],0];
  const plan=kind==='plan',cut=kind==='section',project=p=>cut?[sub(p,mid).reduce((s,v,k)=>s+v*u[k],0),-p[2]]:plan?[p[0],-p[1]]:[.8660254*(p[0]-p[1]),.5*(p[0]+p[1])-p[2]];
  const records=[],labels=[];let sourceCount=0,derivedCount=0,coplanar=0;
  function add(t,base,derived){let polygon={points:t,coplanar:false};if(cut){polygon=section(t,mid,n);if(!polygon)return;if(polygon.coplanar)coplanar++;}
    const normal=cross(sub(t[1],t[0]),sub(t[2],t[0])),length=Math.hypot(...normal),shade=.48+.45*Math.abs(normal[0]*.25-normal[1]*.4+normal[2]*.88)/(length||1);
    records.push({points:polygon.points.map(project),color:`rgb(${base.map(v=>Math.round(v*shade)).join(',')})`,derived,coplanar:polygon.coplanar,depth:t.reduce((s,p)=>s+(plan?p[2]:p[0]+p[1]+p[2]),0)});
  }
  if(kind!=='derived')for(const [index,model]of scene.models.entries()){
    const tile=candidate.tiles.find(t=>t.id===model.id);assert(tile);const features=study.result.features[index]??[],branchFaces=new Set(features.filter(r=>r.role==='projecting branch').flatMap(r=>r.triangles));
    const original=triangles(model.surface);sourceCount+=original.length;for(const [face,t]of original.entries())add(t.map(p=>world(p,tile,model)),branchFaces.has(face)?[113,190,218]:[190,197,203],false);
    for(const feature of features.filter(r=>r.role==='projecting branch'))labels.push({point:project(world(feature.centroid,tile,model)),text:`${model.id}: branch hypothesis`,color:'#71BEDA'});
  }
  for(const connector of candidate.synthesis.connectors){const mesh=triangles(connector);derivedCount+=mesh.length;for(const t of mesh)add(t,[214,173,79],true);}
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(const r of records)for(const p of r.points)for(let k=0;k<2;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  if(!records.length)return;
  let center=min.map((v,k)=>(v+max[k])/2),scale=Math.min(1120/(max[0]-min[0]),690/(max[1]-min[1]));
  if(selected&&(kind==='departure'||kind==='arrival')){center=project(kind==='departure'?selected.from:selected.to);scale=65;}
  const xy=p=>[625+(p[0]-center[0])*scale,485+(p[1]-center[1])*scale].map(v=>v.toFixed(3)).join(',');
  records.sort((a,b)=>a.depth-b.depth);
  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1250" height="1000" viewBox="0 0 1250 1000"><rect width="1250" height="1000" fill="black"/><defs><clipPath id="view"><rect x="30" y="140" width="1190" height="700"/></clipPath></defs>';
  svg+=`<text x="30" y="40" fill="#F7F6F5" font-family="Arial" font-size="24">${escape(study.label)} / ${escape(candidate.id)} / ${kind}</text><text x="30" y="72" fill="#D6AD4F" font-family="Arial" font-size="15">REVIEW · Packing ${candidate.packing.status} · ${candidate.formComponents} form components · Design ${candidate.score.toFixed(2)}</text>`;
  svg+=`<text x="30" y="101" fill="#B9BEC6" font-family="Arial" font-size="13">${escape(candidate.tiles.map(t=>{const m=scene.models.find(m=>m.id===t.id),v=m.variants[t.variant];return `${t.id}: (${t.ix},${t.iy},${t.iz}), ${v.rotation}°, mirror ${v.mirror}`;}).join(' · '))}</text><g clip-path="url(#view)">`;
  for(const r of records){const points=r.points.map(xy).join(' ');svg+=cut?`<polyline points="${points}" fill="none" stroke="${r.coplanar?'#71BEDA':r.derived?'#D6AD4F':'#F7F6F5'}" stroke-width="${r.coplanar?.6:1.3}"/>`:`<polygon points="${points}" fill="${r.color}" stroke="${r.color}" stroke-width=".25"/>`;}
  if(!cut)for(const label of labels){const [x,y]=xy(label.point).split(',');svg+=`<text x="${x}" y="${y}" fill="${label.color}" stroke="#000000" stroke-width=".4" paint-order="stroke" font-family="Arial" font-size="11">${escape(label.text)}</text>`;}
  svg+='</g><text x="30" y="895" fill="#B9BEC6" font-family="Arial" font-size="14">Grey: original mesh · Cyan: source branch hypothesis · Gold: actual validated derived geometry</text><text x="30" y="925" fill="#B9BEC6" font-family="Arial" font-size="13">All original floors and branches retained. No second axis/unit transform. 20-foot registration.</text>';
  svg+=`<text x="30" y="956" fill="#B9BEC6" font-family="Arial" font-size="13">Whole original-form circulation and structural capacity UNVERIFIED. ${cut?`${coplanar} coplanar section triangles separately classified.`:'Diagnostic painter projection; possible visibility artifacts.'}</text></svg>`;
  const name=`study-${number}-${candidate.id}-${kind}`;fs.writeFileSync(path.join(out,name+'.svg'),svg,{flag:'wx'});await sharp(Buffer.from(svg),{limitInputPixels:20000000}).resize(2500,2000).png().toFile(path.join(out,name+'.png'));
  manifest.push({name,study:study.label,candidate:candidate.id,kind,sourceTriangles:sourceCount,derivedTriangles:derivedCount,coplanar});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(manifest,null,2));
}
async function main(){
  for(const [number,study]of data.studies.entries()){
    const scene=library.scenes.find(s=>s.label===study.label);assert(scene&&scene.coordinates.startsWith('anchored architectural feet'));
    for(const candidate of study.result.arrangements){console.log('VIEW',number+1,candidate.id);
      const kinds=candidate.synthesis.connectors.length?['axonometric','plan','section','departure','arrival','derived']:['axonometric'];
      for(const kind of kinds){if(performance.now()-started>120000)throw new Error('120-second rendering limit; remaining views UNVERIFIED');await draw(study,scene,candidate,number+1,kind);}
    }
  }
  for(const [file,sha]of guards)assert.equal(hash(file),sha,file);
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({input,views:manifest,durationMs:performance.now()-started,preservation:guards},null,2),{flag:'wx'});console.log('OUTPUT',out,'VIEWS',manifest.length);
}
main().catch(error=>{fs.writeFileSync(path.join(out,'INCOMPLETE.json'),JSON.stringify({error:error.stack,views:manifest,preservation:guards.map(([file,sha])=>{try{return {file,unchanged:hash(file)===sha};}catch(e){return {file,status:'UNVERIFIED',error:String(e)};}})},null,2),{flag:'wx'});console.error(error);process.exitCode=1;});
