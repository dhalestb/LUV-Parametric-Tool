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
function row(api,key,zone,share,method,r,z,territory,area,origin,datum){
 const m=r.architecture.provenance.members.find(x=>x.typology==='flat-deep-plan-plate'),a=r.architecture;
 const wp=a.components.filter(p=>p.id.startsWith(method==='boundary'?'boundary-':'flat-deep-'));
 const foot=measureParts(api,wp),combined=measureParts(api,a.components),allowed=new api.CrossSection(territory,'NonZero'),escape=foot.subtract(allowed);
 close(foot.area(),m.footprintAreaFeet2);close(combined.area(),a.measurements.buildingFootprintFeet2);close(escape.area(),0,.025);
 const checks=m.boundary?.checks??Object.values(m.nativeField.rulesets).flatMap(s=>s.rules.map(x=>({id:x.id,passed:x.status==='pass',measurement:x.title})));
 assert.equal(new Set(checks.map(c=>c.id)).size,20);assert.ok(checks.every(c=>c.passed));
 const guidePrefix=method==='boundary'?'boundary-L-':'flat-deep-';
 const letters=r.orientation.components.filter(l=>l.id.startsWith(guidePrefix));
 binary(key,[a.architecture]);binary(key+'-letters',letters.map(l=>l.mesh));
 const groups=m.boundary?.components??[],heights=groups.length?groups.map(g=>g.height):m.nativeField.poses.map(p=>p.fieldFeet.height-.05);
 const layers=a.planLayers.filter(l=>l.typology==='flat-deep-plan-plate'&&(/mezzanine/.test(l.name)));
 const result={key,method,zone,share,zoneArea:area,zonePolygon:z,territories:territory,datum,territory:allowed.area(),workspace:foot.area(),combined:combined.area(),utilization:100*foot.area()/allowed.area(),open:area-combined.area(),guides:letters.length,groups:groups.length||m.nativeField.fieldCount,heights,checks,mezzanines:layers,components:groups,guideRoles:method==='boundary'?Object.fromEntries(['ground','mezzanine','pier','wall'].map(role=>[role,m.boundary.arrangement.guides.filter(g=>g.role===role).length])):null,heightBands:a.provenance.heightRegions,fieldEscape:escape.area(),combinedDifference:combined.area()-a.measurements.buildingFootprintFeet2};
 if(method==='boundary')write(key+'-rule-a.json',{origin,datum,...m.boundary.arrangement});
 for(const s of [foot,combined,allowed,escape])s.delete();
 return result;
}
async function main(){
 fs.mkdirSync(out,{recursive:true});const api=await require('manifold-3d/manifold.js').default();api.setup();T.geometryKernel=async()=>api;
 global.fetch=async url=>new Response(fs.readFileSync(path.join(__dirname,'../public',new URL(url,'http://localhost').pathname)));
 const rows=[];
 for(const share of [100,25]){
  const st=JSON.parse(fs.readFileSync(path.join(inputs,'Miami '+share+' percent study.json'))).settings;
  st.generation??={method:'typology-area',zones:{}};
  for(const z of st.site.zones)st.generation.zones[JSON.stringify([st.site.fingerprint,z.id])]={flatDeepMode:'boundary',flatDeepCoverage:100};
  write('Miami boundary '+share+' percent.json',{settings:st});
  const batch=await generateContinuousSite(st,registry,()=>null,console.log);
  for(const [i,r] of batch.records.entries()){
   const z=st.site.zones[i],plan=batch.territoryByZone[z.id].results.area,t=plan.territories.find(t=>t.typology==='flat-deep-plan-plate');
   const solo=await generateSingleFlatDeep(st,registry,z,null,share===100?undefined:t.id);
   const m=r.architecture.provenance.members.find(m=>m.boundary);assert.deepEqual(solo.architecture.provenance.members[0].boundary.arrangement,m.boundary.arrangement);
   close(solo.architecture.measurements.buildingFootprintFeet2,m.footprintAreaFeet2);
   assert.equal(m.boundary.letterOutside,0);assert.equal(r.architecture.validation.protectedArea,0);assert.ok(r.architecture.provenance.heightRegions.every(h=>h.builtFeet<=h.capFeet+.001));
   rows.push(row(api,'boundary-'+share+'-'+(i+1),z.name,share,'boundary',r,z.polygon,t.contours,plan.grossArea,r.orientation.frame.center,r.orientation.parameters.datum));
  }
 }
 const tests=[
  {id:'wedge',name:'Skewed waterfront wedge',outer:[[0,0],[140,12],[116,86],[22,67]],holes:[]},
  {id:'court',name:'Reentrant site with protected court',outer:[[0,0],[128,0],[150,49],[95,70],[85,120],[0,106]],holes:[[[27,33],[25,55],[50,56],[54,37]]]},
 ];
 const options={coverage:100,setback:2,separation:0,minimum:20};
 for(const t of tests){
  const region=new api.CrossSection([t.outer,...t.holes],'NonZero'),origin=[0,0];
  for(const method of ['native','adaptive','boundary']){
   const f=method==='boundary'?B.formBoundary(api,region,origin,0,[],32,options):formFlatDeep(api,region,origin,0,[54,54],[],32,method==='adaptive'?options:undefined);
   const member={typology:'flat-deep-plan-plate',footprintAreaFeet2:f.footprintArea,boundary:f.boundary,nativeField:f.nativeField};
   const r={architecture:{architecture:siteMesh(f.solid,origin,0),components:f.parts,planLayers:f.layers,measurements:{buildingFootprintFeet2:f.footprintArea},provenance:{members:[member],heightRegions:[]}},orientation:{components:f.letters}};
   rows.push(row(api,method+'-'+t.id,t.name,null,method,r,t.outer,[t.outer,...t.holes],region.area(),origin,0));
   if(method==='boundary'){
    const permitted=region.offset(-2),sol=f.solid.project(),ex=sol.subtract(permitted);close(ex.area(),0,.001);
    const partial=B.formBoundary(api,region,origin,0,[],32,{...options,coverage:35});assert.ok(partial.footprintArea<=region.area()*.35+.05);partial.solid.delete();
    [permitted,sol,ex].forEach(x=>x.delete());
    if(t.id==='wedge'){
     const a=structuredClone(f.boundary.arrangement),group=a.groups[0],id=group.piers[0];
     const g=a.guides.find(g=>g.id===id);g.position[0]+=.5;
     const moved=B.buildBoundaryFromLetters(api,a,origin,0),before=f.parts.find(p=>p.id.endsWith('pier-1')),after=moved.parts.find(p=>p.id.endsWith('pier-1'));
     const minX=m=>Math.min(...m.mesh.positions.filter((_,i)=>i%3===0));close(minX(after)-minX(before),.5,.0001);
     assert.deepEqual(moved.parts[0].mesh,f.parts[0].mesh);moved.solid.delete();
     const floorChanges=structuredClone(f.boundary.arrangement);
     // Move all slab-corner letters about the wedge center while keeping the entire pier array fixed.
     for(const ring of floorChanges.groups[0].ground)for(const id of ring){
       const g=floorChanges.guides.find(g=>g.id===id),[x,y]=A.letterTip(g);g.position[0]+=.015*(x-65);g.position[1]+=.015*(y-39);
     }
     const expanded=B.buildBoundaryFromLetters(api,floorChanges,origin,0);
     close(expanded.settings[0].groundArea/f.boundary.components[0].groundArea,1.015**2,.00001);assert.deepEqual(before.mesh,expanded.parts.find(p=>p.id.endsWith('pier-1')).mesh);
     assert.notDeepEqual(expanded.parts.find(p=>p.id.endsWith('-roof')).mesh,f.parts.find(p=>p.id.endsWith('-roof')).mesh);
     expanded.solid.delete();a.guides=a.guides.filter(g=>g.id!==id);assert.throws(()=>B.buildBoundaryFromLetters(api,a,origin,0),/Missing pier/);
     const low=api.CrossSection.square([34,170],true),blocked=B.formBoundary(api,region,origin,0,[{id:'low',role:'low',cap:15,section:low}],32,options);
     const pr=blocked.solid.project(),bad=pr.intersect(low);close(bad.area(),0,.0001);[bad,pr,blocked.solid,low].forEach(x=>x.delete());
    }
   }
   f.solid.delete();
  }
  region.delete();
 }
 write('boundary-measurements.json',rows);console.table(rows.map(r=>({case:r.key,L:r.guides,workspace:r.workspace.toFixed(2),combined:r.combined.toFixed(2),utilization:r.utilization.toFixed(2)})));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
