const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=__dirname,out=path.join(root,'abstract-studies');
fs.mkdirSync(out,{recursive:true});
const input=JSON.parse(fs.readFileSync(path.join(root,'input.json')));
const cases=[
 {id:'field-20-20-20',field:[20,20,20],population:'auto'},
 {id:'field-40-40-20',field:[40,40,20],population:'auto'},
 {id:'baseline-60-40-40',field:[60,40,40],population:12},
 {id:'field-60-60-60',field:[60,60,60],population:'auto'},
 {id:'width-only-40-40-40',field:[40,40,40],population:12},
 {id:'depth-only-60-60-40',field:[60,60,40],population:12},
 {id:'height-only-60-40-20',field:[60,40,20],population:12,preferredFeet:11},
 {id:'size-9',field:[60,40,40],population:12,preferredFeet:9},
 {id:'size-13',field:[60,40,40],population:12,preferredFeet:13},
 {id:'population-15',field:[60,40,40],population:15,preferredFeet:11},
 {id:'population-18',field:[60,40,40],population:18,preferredFeet:11},
 {id:'population-auto',field:[60,40,40],population:'auto',preferredFeet:11}
];
const filter=process.argv[2];
const results=filter?JSON.parse(fs.readFileSync(path.join(out,'results.json'))).filter(r=>r.id!==filter):[];
for(const c of cases.filter(c=>!filter||c.id===filter)){
 const folder=path.join(out,c.id);fs.mkdirSync(folder,{recursive:true});
 const request={...input,field:{width:c.field[0],depth:c.field[1],height:c.field[2]},population:c.population};
 if(c.preferredFeet!==undefined)request.preferredFeet=c.preferredFeet;
 const file=path.join(folder,'input.json');fs.writeFileSync(file,JSON.stringify(request,null,2));
 const run=spawnSync(process.execPath,[path.join(root,'abstract-amphitheater.cjs'),file,folder],{encoding:'utf8'});
 fs.writeFileSync(path.join(folder,'generation.log'),run.stdout+run.stderr);
 if(run.status!==0){results.push({...c,status:'infeasible',error:(run.stdout+run.stderr).slice(-2000)});console.log(c.id,'INFEASIBLE');}
 else{
  const check=spawnSync(process.execPath,[path.join(root,'abstract-validation.cjs'),folder],{encoding:'utf8'});
  fs.writeFileSync(path.join(folder,'validation.log'),check.stdout+check.stderr);
  const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
  results.push({...c,status:check.status===0?'geometry checked':'geometry validation failed',study:m.study,validation:m.validation,components:m.components.length,multiSourceComponents:m.components.filter(t=>t.sources.length>1).length,tools:m.tools.map(t=>({id:t.id,depth:t.depth,width:t.width,height:t.height,bounds:t.bounds,removed:t.removed,finalObstruction:t.finalObstruction})),instances:m.instances.map(t=>({id:t.id,letter:t.letter,sourceIndex:t.sourceIndex,footprintFeet:t.footprintFeet,bounds:t.bounds,center:t.center,yaw:t.yaw,tilt:t.tilt}))});
  console.log(c.id,results.at(-1).status,m.validation.sourceCount,m.validation.shellVolumes.length);
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const summary=results.map(r=>'<tr><td><a href="'+r.id+'/index.html">'+r.id+'</a></td><td>'+r.field.join(' × ')+'</td><td>'+esc(r.status)+'</td><td>'+(r.study?.actualPopulation??'—')+'</td><td>'+(r.study?.requestedSize??'—')+'</td><td>'+(r.validation?.volume.toFixed(2)??'—')+'</td><td>'+(r.study?.runtimeMs.toFixed(0)??'—')+'</td></tr>').join('');
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset=utf-8><title>Abstract envelope studies</title><style>body{background:#101820;color:#eee;font:16px system-ui;margin:3%}a{color:#a8d4f0}td,th{padding:9px;border-bottom:1px solid #456}section{display:flex}figure{flex:1;margin:4px}img{width:100%}</style><h1>Abstract geometric envelope studies</h1><p><a href="../abstract-review/index.html">12-letter construction gate and detailed baseline</a> · <a href="results.json">Complete measurements and failures</a></p><h2>Previous and revised construction</h2><section><figure><img src="../abstract-review/previous-envelope.png"><figcaption>7e167b1 · source-profile envelope</figcaption></figure><figure><img src="../abstract-review/C-iso.png"><figcaption>Revised · cross-letter generated trajectories</figcaption></figure></section><table><tr><th>Study</th><th>Field ft</th><th>Result</th><th>Letters</th><th>Preferred ft</th><th>Volume ft³</th><th>Generation ms</th></tr>'+summary+'</table>'+results.filter(r=>r.validation).map(r=>'<h2>'+r.id+'</h2><a href="'+r.id+'/index.html"><img style="max-width:600px" src="'+r.id+'/C-iso.png"></a>').join(''));

