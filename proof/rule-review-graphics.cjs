const fs=require('fs'),path=require('path'),THREE=require('three'),sharp=require('sharp');
const render=require('./render.cjs');
const root=__dirname,folder=path.join(root,'rule-review');
const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
const infl=fs.existsSync(path.join(root,'rule-influence/results.json'))?JSON.parse(fs.readFileSync(path.join(root,'rule-influence/results.json'))):{rows:[]};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const colors=i=>{const c=new THREE.Color().setHSL((i*.61803398875)%1,.6,.62);return '#'+[c.r,c.g,c.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');};
function projection(view){
 const basis=view==='iso'?[[.70710678,.70710678,0],[-.40824829,.40824829,.81649658],[.57735027,-.57735027,.57735027]]:view==='plan'?[[1,0,0],[0,1,0],[0,0,1]]:[[1,0,0],[0,0,1],[0,-1,0]];
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),corners=Array.from({length:8},(_,i)=>[(i&1)?30:-30,(i&2)?30:-30,(i&4)?60:0]);
 const us=corners.map(p=>dot(p,basis[0])),vs=corners.map(p=>dot(p,basis[1])),uc=(Math.max(...us)+Math.min(...us))/2,vc=(Math.max(...vs)+Math.min(...vs))/2,s=Math.min(470/(Math.max(...us)-Math.min(...us)),320/(Math.max(...vs)-Math.min(...vs)));
 return p=>[2*(260+(dot(p,basis[0])-uc)*s),2*(180-(dot(p,basis[1])-vc)*s)];
}
(async()=>{
 for(const view of ['iso','plan','elevation','section']){
  const project=projection(view);
  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="720"><g font-family="Arial" fill="white"><text x="15" y="25" font-size="17">Independent instances · '+m.instances.length+' placed sources</text>';
  for(const [i,item] of m.instances.entries()){
   const x=i%2?840:10,y=55+Math.floor(i/2)*39,p=project(item.center),color=colors(i);
   svg+='<line x1="'+(i%2?x:x+180)+'" y1="'+(y-5)+'" x2="'+p[0]+'" y2="'+p[1]+'" stroke="'+color+'" stroke-width=".7"/><circle cx="'+p[0]+'" cy="'+p[1]+'" r="2.5" fill="'+color+'"/><rect x="'+x+'" y="'+(y-18)+'" width="190" height="35" fill="#101820" fill-opacity=".88"/><text x="'+(x+4)+'" y="'+y+'" font-size="12" fill="'+color+'">'+item.id+' · source '+item.sourceIndex+'</text><text x="'+(x+4)+'" y="'+(y+14)+'" font-size="10">yaw '+item.relativeYaw+' / tilt '+item.tilt+'</text>';
  }
  svg+='<text x="15" y="700" font-size="12">Labels include sources outside the cut plane or hidden by depth. Source objects are independently rendered.</text></g></svg>';
  await sharp(path.join(folder,'A-'+view+'.png')).resize(1040,720).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(folder,'A-'+view+'-identified.png'));
 }
 const p=(q,view)=>view==='plan'?[335+q[0]*8,360-q[1]*8]:[1000+q[1]*9,610-q[2]*10];
 const poly=(pts,view,style)=>'<polyline points="'+pts.map(q=>p(q,view).join(',')).join(' ')+'" '+style+'/>';
 let diagram='<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="740"><rect width="1320" height="740" fill="#101820"/><g fill="#eee" font-family="Arial"><text x="20" y="34" font-size="23">Architectural organization before envelope surfaces</text><text x="20" y="61" font-size="14">Plan and longitudinal organization from the actual generated focus and terrace profiles. Minor steps are separate from major occupied levels.</text><text x="35" y="105" font-size="20">Plan · focus and ascending terrace relationships</text><text x="710" y="105" font-size="20">Longitudinal organization · Y / Z</text>';
 const stage=m.components.find(c=>c.id==='presentation-focus-surface'),focus=[...stage.front,...stage.back.slice().reverse(),stage.front[0]];
 diagram+=poly(focus,'plan','fill="#54878b" fill-opacity=".5" stroke="#8ad6d7" stroke-width="2"');
 for(const [i,t] of m.organization.terraces.entries()){
  const points=[...t.front,...t.back.slice().reverse(),t.front[0]];
  diagram+=poly(points,'plan','fill="#d8b97a" fill-opacity=".28" stroke="#d9bc84" stroke-width="1"');
  const mid=t.front[12],q=p(mid,'plan');
  diagram+='<text x="'+(q[0]+8)+'" y="'+(q[1]-3)+'" font-size="11">'+i+' · '+t.elevation.toFixed(2)+' ft</text>';
  const a=t.front[12],b=t.back[12];
  diagram+=poly([a,b],'section','fill="none" stroke="#e3c58b" stroke-width="3"');
  if(i){const previous=m.organization.terraces[i-1];diagram+=poly([previous.back[12],a],'section','fill="none" stroke="#bca9d9" stroke-width="2"');}
 }
 diagram+=poly([stage.front[12],stage.back[12]],'section','fill="none" stroke="#8ad6d7" stroke-width="4"');
 for(const c of m.components.filter(c=>c.id.startsWith('enclosure-right')))for(const profile of c.profiles)diagram+=poly(profile.upper,'section','fill="none" stroke="#8ab8d9" stroke-width="1.4"');
 diagram+='<text x="215" y="550" font-size="15">Presentation / gathering focus</text><text x="215" y="575" font-size="13">'+m.organization.focus.width.toFixed(2)+' × '+m.organization.focus.depth.toFixed(2)+' ft</text><text x="730" y="665" font-size="13">Gold · L/U-derived terraces. Purple · interlevel boundary relationships.</text><text x="730" y="688" font-size="13">Blue · source-related upper enclosure. Stair/ramp usability remains unverified.</text></g></svg>';
 fs.writeFileSync(path.join(folder,'organization.svg'),diagram);
 const iso=projection('iso');
 let derivation='<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="860"><rect width="1040" height="860" fill="#101820"/><g font-family="Arial" fill="white"><text x="25" y="35" font-size="23">Actual source features → shared surface boundaries</text>';
 const line=(points,color,width)=>'<polyline points="'+points.map(p=>iso(p).join(',')).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="'+width+'"/>';
 for(const f of m.features)derivation+=line(f.points,colors(m.instances.findIndex(i=>i.id===f.source)),1.6);
 for(const t of m.organization.terraces)derivation+=line(t.front,'#d9bd83',2.3);
 for(const c of m.components.filter(c=>c.profiles))for(const p of c.profiles)derivation+=line(p.upper,'#a4d0e4',1);
 derivation+='<text x="25" y="745" font-size="16">Colored: transformed L perpendicular edges, U inner curves, V apex and arms.</text><text x="25" y="775" font-size="16">Gold: L/U-derived horizontal terrace rails. Blue: L/U/V-derived enclosure rails.</text><text x="25" y="805" font-size="14">Sources share constructed surfaces; complete letter silhouettes are excluded from architecture.</text><text x="25" y="832" font-size="14">Exact operand and per-instance perturbation evidence: source-contribution.json.</text></g></svg>';
 fs.writeFileSync(path.join(folder,'derivation.svg'),derivation);
 const combined=JSON.parse(fs.readFileSync(path.join(folder,'combined-envelope.json')));
 const swapped={...combined,positions:combined.positions.flatMap((_,i,a)=>i%3?[]:[a[i+1],a[i],a[i+2]])};
 fs.writeFileSync(path.join(folder,'C-longitudinal-section.png'),(await render([swapped],'elevation',{min:[-30,-30,0],max:[30,30,60]},true)).png);
 const contribution=m.instances.map(item=>({...item,actualWorldDimensions:item.bounds.max.map((v,i)=>v-item.bounds.min[i]),constructionComponents:m.components.filter(c=>c.sources.includes(item.id)).map(c=>c.id),influence:infl.rows.find(r=>r.id===item.id)??{status:'pending'},independentlyDisplayed:true}));
 fs.writeFileSync(path.join(folder,'source-contribution.json'),JSON.stringify(contribution,null,2));
 const table=contribution.map(t=>'<tr><td>'+t.id+'</td><td>'+t.sourceIndex+' '+t.source.letter+'</td><td>'+t.constructionComponents.length+'</td><td>'+t.influence.status+'</td><td>'+((t.influence.finalBoundaryDelta??0).toFixed(6))+'</td></tr>').join('');
 fs.writeFileSync(path.join(folder,'contribution.html'),'<!doctype html><meta charset=utf-8><style>body{font:16px system-ui;background:#101820;color:#eee;margin:3%}td{padding:8px;border-bottom:1px solid #456}a{color:#bce}</style><h1>Construction operands and retained surface influence</h1><p>Each counterfactual moves one actual source pivot +0.05 ft in Z. The full final mesh is compared in both directions by vertex-to-triangle distance.</p><table><tr><th>Instance</th><th>Original source</th><th>Construction components</th><th>Measured retained influence</th><th>Maximum boundary change ft</th></tr>'+table+'</table><a href="source-contribution.json">Complete instance and influence records</a>');
 let index=fs.readFileSync(path.join(folder,'index.html'),'utf8');
 for(const view of ['iso','plan','elevation','section'])index=index.replace('src="A-'+view+'.png"','src="A-'+view+'-identified.png"');
 if(!index.includes('Architectural organization</h2>'))index=index.replace('<h1>60 × 40 × 40 ft · Rule-governed amphitheater proof</h1>','<h1>60 × 40 × 40 ft · Rule-governed amphitheater proof</h1><p><a href="contribution.html">Measured source influence</a> · <a href="source-contribution.json">Source correspondence</a></p><h2>Geometric derivation</h2><img src="derivation.svg"><h2>Architectural organization</h2><img src="organization.svg"><h2>Actual longitudinal section at X=0</h2><img style="max-width:850px" src="C-longitudinal-section.png">');
 if(!index.includes('Previous abstract comparison'))index=index.replace('</h1>','</h1><h2>Previous abstract comparison</h2><section><figure><img src="previous-abstract.png"><figcaption>d87c068 · 12-letter abstract envelope</figcaption></figure><figure><img src="C-iso.png"><figcaption>Corrected organization · 28 source instances</figcaption></figure></section>');
  if(!index.includes('Download proof exports'))index=index.replace('</h1>','</h1><p><a href="../rule-proof-exports.zip">Download proof exports</a> · <a href="source-instances.obj">Individually named source objects</a> · <a href="README.md">Full report and limitations</a></p><p>Architectural review proof. Usable circulation and occupied alcoves are unverified. The unchanged legacy intersection gate remains flagged; independent adjudication and the additional 20 ft fragment are disclosed in the report.</p>');
 fs.writeFileSync(path.join(folder,'index.html'),index);
 const before=path.join(root,'abstract-review/C-iso.png');fs.copyFileSync(before,path.join(folder,'previous-abstract.png'));
 console.log('Saved labeled source views, organization diagram, actual longitudinal section and source-contribution records');
})().catch(e=>{console.error(e);process.exitCode=1;});



