const fs=require('node:fs'),path=require('node:path'),THREE=require('three');
const render=require('./render.cjs');
const root=__dirname;
const results=JSON.parse(fs.readFileSync(path.join(root,'abstract-studies/results.json')));
const frame={min:[-30,-30,0],max:[30,30,60]};
function readObj(file,color){
 const positions=[],indices=[];
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  if(line.startsWith('v '))positions.push(...line.slice(2).split(/\s+/).map(Number));
  if(line.startsWith('f '))indices.push(...line.slice(2).split(/\s+/).map(v=>+v-1));
 }
 return {positions,indices,color};
}
function vectors(points){
 return points.map((p,i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  const t=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  const n=new THREE.Vector3(-t.y,t.x,0).normalize();
  return {point:p,tangent:t.toArray(),planNormal:n.toArray()};
 });
}
function diagram(manifest){
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650"><rect width="1200" height="650" fill="#101820"/><g fill="#eee" font-family="Arial"><text x="25" y="35" font-size="23">Measured source features and new cross-letter trajectories</text><text x="25" y="62" font-size="15">Red: source edges / curves / arms · Gold: generated lower rails · Cyan: generated folded upper rails</text>';
 const project=p=>[600+(p[0]+p[1])*.7071*12,540-(-p[0]*.4082+p[1]*.4082+p[2]*.8165)*12];
 const line=(points,color,width)=>'<polyline fill="none" stroke="'+color+'" stroke-width="'+width+'" points="'+points.map(project).map(p=>p.join(',')).join(' ')+'"/>';
 for(const f of manifest.features)svg+=line(f.points,'#f17e83',1.1);
 for(const c of manifest.components){svg+=line(c.bottom,'#f0c16a',2.5)+line(c.top,'#7dd9de',2.5);for(let i=0;i<c.bottom.length;i+=8)svg+=line([c.bottom[i],c.top[i]],'#758494',.7);}
 return svg+'</g></svg>';
}
(async()=>{
 const directories=results.filter(r=>r.validation).map(r=>path.join(root,'abstract-studies',r.id));
 directories.push(path.join(root,'abstract-review'));
 for(const folder of directories){
  const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
  const combined=JSON.parse(fs.readFileSync(path.join(folder,'combined-envelope.json')));
  const source=readObj(path.join(folder,'original-letters.obj'),[52,155,213]);
  const parts=m.components.map((c,i)=>readObj(path.join(folder,c.file),[[167,198,188],[219,191,143],[172,167,201]][i]));
  for(const [mode,list] of Object.entries({A:[source],B:[combined,source],C:[combined],D:parts}))for(const view of ['iso','plan','elevation','section'])fs.writeFileSync(path.join(folder,mode+'-'+view+'.png'),(await render(list,view,frame,view==='section')).png);
  fs.writeFileSync(path.join(folder,'feature-trajectories.svg'),diagram(m));
  fs.writeFileSync(path.join(folder,'feature-evaluation.json'),JSON.stringify({sourceSeed:0,randomization:'none',sourceCurves:m.features.filter(f=>f.type.includes('U')).map(f=>({id:f.id,evaluation:vectors(f.points)})),generatedTrajectories:m.components.map(c=>({id:c.id,sources:c.sources,construction:c.construction,records:c.derivation}))},null,2));
  let html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
  if(!html.includes('feature-trajectories.svg'))html=html.replace('<h2>Source feature derivation</h2>','<h2>Generated trajectory derivation</h2><img style="max-width:1000px" src="feature-trajectories.svg"><h2>Source feature derivation</h2>');
    const row=results.find(r=>path.basename(folder)===r.id);
  if(row&&row.status!=='geometry checked'&&!html.includes('Preview only')){
   html=html.replace('</h1>','</h1><p style="color:#ffb0a6"><strong>Validation failed. Preview only.</strong> <a href="validation.log">Failure details</a> · <a href="intersection-diagnostics.json">Intersection diagnostics</a></p>');
  }
  fs.writeFileSync(path.join(folder,'index.html'),html);
 }
 const previous=JSON.parse(fs.readFileSync(path.join(root,'envelope-review/combined-envelope.json')));
 fs.writeFileSync(path.join(root,'abstract-review/previous-envelope.png'),(await render([previous],'iso',frame)).png);
 console.log('Reframed all comparison images at common 60-foot scale and saved actual feature-trajectory diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1;});

