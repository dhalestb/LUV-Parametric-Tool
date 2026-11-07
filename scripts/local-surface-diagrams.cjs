const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const local=require('../src/components/lattice/localSurfaceIntegration.ts'),transition=require('../src/components/lattice/transitionGeometry.ts');
const out=path.resolve(__dirname,'../reports/stage2d1-surface-integration'),data=JSON.parse(fs.readFileSync(path.join(out,'results.json'))),scene=JSON.parse(fs.readFileSync(path.join(out,'original-scene.json')));
const triangles=s=>{const a=[];for(let i=0;i<s.indices.length;i+=3)a.push(s.indices.slice(i,i+3).map(v=>Array.from(s.positions.slice(v*3,v*3+3))));return a;};
const sources=scene.map(s=>({...s,triangles:triangles(s)})),manifest=[];
async function draw(c,kind){
 const pair=local.organicRoute(c.pair,0),a=pair.from,b=pair.to,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),f=[dx/len,dy/len],side=[-f[1],f[0]],mid=a.map((v,k)=>(v+b[k])/2);
 const bounds=[[Math.min(a[0],b[0])-5,Math.max(a[0],b[0])+5],[Math.min(a[1],b[1])-5,Math.max(a[1],b[1])+5],[Math.min(a[2],b[2])-3,Math.max(a[2],b[2])+7]];
 const crop=t=>[0,1,2].every(k=>Math.min(...t.map(p=>p[k]))<=bounds[k][1]&&Math.max(...t.map(p=>p[k]))>=bounds[k][0]);
 const section=kind.includes('section'),transverse=kind==='transverse-section',plan=['plan','local-reconstruction','added-removed','verified-route'].includes(kind);
 const project=p=>section?[((p[0]-mid[0])*(transverse?side[0]:f[0])+(p[1]-mid[1])*(transverse?side[1]:f[1])),-p[2]]:plan?[p[0],-p[1]]:[.866*(p[0]-p[1]),.5*(p[0]+p[1])-p[2]];
 const records=[];
 const line=(points,color,opacity=.6,width=.7)=>records.push({points:points.map(project),color,opacity,width});
 function add(t,color,opacity=.4,width=.5){if(!crop(t))return;if(!section){line([...t,t[0]],color,opacity,width);return;}const n=transverse?f:side,ds=t.map(p=>(p[0]-mid[0])*n[0]+(p[1]-mid[1])*n[1]),hits=[];for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(ds[i])<1e-8)hits.push(t[i]);if(ds[i]*ds[j]<0){const u=ds[i]/(ds[i]-ds[j]);hits.push(t[i].map((v,k)=>v+u*(t[j][k]-v)));}}if(hits.length>=2)line(hits.slice(0,2),color,.9,1.1);}
 for(const source of sources)for(const t of source.triangles)add(t,'#F7F6F5',plan?.15:.22,.4);
 if(kind!=='before-axonometric'){for(const g of transition.transitionMeshes(pair))for(const t of triangles(g))add(t,'#71BEDA',.75,.8);
  for(const g of c.proposals??c.geometry)for(const t of triangles(g.surface))add(t,g.category==='support'?'#1293C2':'#D6AD4F',.95,1.2);
  if(['local-reconstruction','added-removed','landing-support'].includes(kind))for(const o of c.outcomes.slice(0,2))for(const t of o.details.patch.triangles)add(t.points,'#71BEDA',.6,.7);
  for(const o of c.outcomes.slice(0,2)){const hit=o.details.completion?.collision;if(!hit)continue;const source=sources.find(s=>s.code===(hit.sourceId===pair.tileA?c.source:c.target));if(source?.triangles[hit.sourceFace])add(source.triangles[hit.sourceFace],'#D6AD4F',1,2.2);}
 }
 if(kind==='verified-route'||kind==='plan')line(pair.path,'#71BEDA',1,2);
 const all=records.flatMap(r=>r.points),min=[0,1].map(k=>Math.min(...all.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...all.map(p=>p[k]))),scale=Math.min(1100/(max[0]-min[0]),630/(max[1]-min[1]));
 const xy=p=>[600+(p[0]-(min[0]+max[0])/2)*scale,420+(p[1]-(min[1]+max[1])/2)*scale];
 const subtitle=kind==='before-axonometric'?'Original geometry at unchanged registered placements':kind==='verified-route'?'NO VERIFIED ROUTE — original candidate trace shown for diagnosis':kind==='landing-support'?'Rejected landing proposals; no original-OBJ support verified':kind==='added-removed'?'Attempted additions shown; no source material removed':section?'Exact plane / triangle intersections; rejected geometry shown':'REJECTED PROPOSALS — not an accepted assembly';
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><rect width="1200" height="850" fill="#000000"/><text x="40" y="43" fill="#F7F6F5" font-family="Arial" font-size="24">${c.source}–${c.target} / ${kind.replaceAll('-',' ')}</text><text x="40" y="76" fill="#D6AD4F" font-family="Arial" font-size="16">${subtitle}</text><g fill="none" stroke-linejoin="round">`;
 for(const r of records)svg+=`<polyline points="${r.points.map(p=>xy(p).map(v=>v.toFixed(2)).join(',')).join(' ')}" stroke="${r.color}" stroke-opacity="${r.opacity}" stroke-width="${r.width}"/>`;
 svg+='</g><text x="40" y="800" fill="#B9BEC6" font-family="Arial" font-size="14">Off-white: original mesh · Blue: identified floor / rejected connector · Gold: attempted addition / collision witness</text><text x="40" y="826" fill="#B9BEC6" font-family="Arial" font-size="13">Local crop · Feet / Z-up · 20 ft registration unchanged · Source triangles, not a live-browser capture</text></svg>';
 const base=c.source+'-'+c.target+'-'+kind;fs.writeFileSync(path.join(out,base+'.svg'),svg);await sharp(Buffer.from(svg)).resize(2400,1700).png().toFile(path.join(out,base+'.png'));manifest.push({file:base,kind,status:c.status,sourceGeometry:'exact original triangles, local crop',svg:true,png:[2400,1700]});
}
(async()=>{for(const c of data.original.cases)for(const kind of ['before-axonometric','after-axonometric','plan','longitudinal-section','transverse-section','local-reconstruction','added-removed','landing-support','verified-route'])await draw(c,kind);fs.writeFileSync(path.join(out,'diagram-manifest.json'),JSON.stringify(manifest,null,2));console.log('Generated',manifest.length,'SVG/PNG pairs');})().catch(e=>{console.error(e);process.exitCode=1;});


