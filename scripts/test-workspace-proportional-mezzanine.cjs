// Arguments: Miami study directory (Phase 2), output directory for local review.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,p);
const d='../src/components/polygonExperiment/',A=require(d+'flatDeepBoundaryLetters'),B=require(d+'flatDeepBoundaryArchitecture');
const {formFlatDeep}=require(d+'flatDeepFormation'),{generateContinuousSite,generateSingleFlatDeep}=require(d+'continuousDesign'),registry=require(d+'polygonRegistry').default,T=require(d+'territories'),{siteMesh}=require(d+'continuousFormation');
const [inputs,out]=process.argv.slice(2),write=(name,v)=>fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2));
const close=(v,w,t=.06)=>assert.ok(Math.abs(v-w)<=t,v+' versus '+w);
function binary(name,meshes){
 const nv=meshes.reduce((n,m)=>n+m.positions.length/3,0),ni=meshes.reduce((n,m)=>n+m.indices.length,0);
 const buf=Buffer.alloc(8+12*nv+4*ni);buf.writeUInt32LE(nv);buf.writeUInt32LE(ni,4);
 const pos=new Float32Array(buf.buffer,buf.byteOffset+8,nv*3),ix=new Uint32Array(buf.buffer,buf.byteOffset+8+nv*12,ni);let v=0,i=0;
 for(const m of meshes){pos.set(m.positions,v*3);for(const k of m.indices)ix[i++]=k+v;v+=m.positions.length/3;}fs.writeFileSync(path.join(out,name+'.bin'),buf);
}
function measureParts(api,parts){
 const tris=[];
 for(const {mesh} of parts)for(let j=0;j<mesh.indices.length;j+=3){
  const p=mesh.indices.slice(j,j+3).map(i=>[mesh.positions[3*i],mesh.positions[3*i+2]]),[a,b,c]=p;
  const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  if(Math.abs(cross)>1e-8)tris.push(cross>0?p:p.reverse());
 }
 return new api.CrossSection(tris,'NonZero');
}

// Sample the actual ground and mezzanine contours in their common local frame.
function testTransverseSpan(ground,mezz,heading,proportional){
 const angle=heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const rotate=loops=>loops.map(r=>r.map(([x,z])=>[c*x+s*z,-s*x+c*z]));
 const floor=rotate(ground),upper=rotate(mezz),xs=floor.flat().map(p=>p[0]),min=Math.min(...xs),max=Math.max(...xs);
 function intervals(loops,x){
  const hits=[];
  for(const ring of loops)ring.forEach(([a,b],i)=>{const [u,v]=ring[(i+1)%ring.length];if((a>x)!==(u>x))hits.push(b+(v-b)*(x-a)/(u-a));});
  hits.sort((a,b)=>a-b);return hits.filter((_,i)=>i%2===0).map((v,i)=>[v,hits[2*i+1]]);
 }
 let error=0,samples=0;
 for(let i=0;i<1000;i++){
  const x=min+(max-min)*(i+.5)/1000,uppers=intervals(upper,x);
  for(const [lo,hi] of intervals(floor,x)){
   const depth=uppers.reduce((sum,[a,b])=>sum+Math.max(0,Math.min(b,hi)-Math.max(a,lo)),0);
   const wanted=(hi-lo)/2;error=Math.max(error,Math.abs(depth-(proportional?wanted:Math.min(16,wanted))));samples++;
  }
 }
 assert.ok(error<.03,'Transverse depth error '+error+' ft');return {samples,maxDepthErrorFeet:error};
}
async function main(){
fs.mkdirSync(out,{recursive:true});
const api=await require('manifold-3d/manifold.js').default();api.setup();T.geometryKernel=async()=>api;
global.fetch=async url=>new Response(fs.readFileSync(path.join(path.join(__dirname,'../public'),new URL(url,'http://localhost').pathname)));
for(const share of [100,25])for(const mode of ['boundary','proportional']){
 const st=JSON.parse(fs.readFileSync(path.join(inputs,'Miami '+share+' percent study.json'))).settings;st.generation={method:'typology-area',zones:{}};
 for(const z of st.site.zones)st.generation.zones[JSON.stringify([st.site.fingerprint,z.id])]={flatDeepMode:mode};
 const batch=await generateContinuousSite(st,registry,()=>null,console.log);
 for(const [i,r] of batch.records.entries()){
  const a=r.architecture,z=st.site.zones[i],member=a.provenance.members.find(x=>x.boundary),meta=member.boundary,comp=meta.components[0];
  const key=mode+'-'+share+'-'+(i+1),territory=batch.territoryByZone[z.id].results.area.territories.find(t=>t.typology==='flat-deep-plan-plate');
  const parts=a.components.filter(p=>p.id.startsWith('boundary-')),occupied=measureParts(api,parts),all=measureParts(api,a.components);
  const datum=r.orientation.parameters.datum;const interior=z=>measureParts(api,parts.filter(p=>{const ys=p.mesh.positions.filter((_,i)=>i%3===1);return Math.min(...ys)<datum+z&&Math.max(...ys)>datum+z;}));
  const net=(name,h)=>{const gross=measureParts(api,parts.filter(p=>p.id.endsWith(name))),obs=interior(h),free=gross.subtract(obs);const area=free.area();[gross,obs,free].forEach(o=>o.delete());return area;};
  const piers=meta.arrangement.guides.filter(g=>g.role==='pier').map(g=>g.position.slice(0,2));
  const nearest=piers.map((p,i)=>Math.min(...piers.filter((_,j)=>j!==i).map(t=>Math.hypot(t[0]-p[0],t[1]-p[1])))).sort((a,b)=>a-b);
  assert.equal(meta.checks.length,20);assert.ok(meta.checks.every(c=>c.passed));if(mode==='proportional')close(comp.mezzanineArea/comp.groundArea,.5,.0005);
  close(all.area(),a.measurements.buildingFootprintFeet2);assert.equal(meta.letterOutside,0);
  const letters=r.orientation.components.filter(l=>l.id.startsWith('boundary-L'));
  binary(key,[a.architecture]);binary(key+'-letters',letters.map(l=>l.mesh));binary(key+'-piers',parts.filter(p=>p.id.includes('-pier-')).map(p=>p.mesh));
  const floorLayer=a.planLayers.find(l=>l.name==='boundary-1-ground'),mezzLayer=a.planLayers.find(l=>l.name==='boundary-1-mezzanine');
  const transverse=testTransverseSpan(floorLayer.contours,mezzLayer.contours,comp.heading,mode==='proportional');
  const h=comp.height+.05;write(key+'.json',{key,zone:z.name,method:mode,share,zoneArea:z.areaFeet2,zonePolygon:z.polygon,territories:territory.contours,datum,territory:territory.area,workspace:occupied.area(),combined:all.area(),guides:letters.length,heights:[comp.height],groups:1,utilization:100*occupied.area()/territory.area,open:z.areaFeet2-all.area(),transverse,checks:meta.checks,ground:comp.groundArea,mezz:comp.mezzanineArea,netGround:net('-ground',1),netMezz:net('-mezzanine',h/2+.25),lowerClear:h/2-1.5,upperClear:comp.height-.75-h/2,pierCount:piers.length,pierXY:piers,nearestRange:[nearest[0],nearest[Math.floor(nearest.length/2)],nearest.at(-1)],version:meta.version,mezzLayers:a.planLayers.filter(l=>l.name.endsWith('-mezzanine'))});
  occupied.delete();all.delete();console.log(key,comp,meta.checks.length);
 }
}
}
main().catch(e=>{console.error(e);process.exitCode=1});
