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

async function main(){
fs.mkdirSync(out,{recursive:true});
const api=await require('manifold-3d/manifold.js').default();api.setup();T.geometryKernel=async()=>api;
global.fetch=async url=>new Response(fs.readFileSync(path.join(path.join(__dirname,'../public'),new URL(url,'http://localhost').pathname)));

let failures=0;
for(const id of ['open-hall-workspace','void-edge-workspace'])for(const mode of ['native','adaptive','boundary']){
 try{
 const st=JSON.parse(fs.readFileSync(path.join(inputs,'Miami 100 percent study.json'))).settings;st.generation={method:'typology-area',zones:{}};
 for(const z of st.site.zones){st.generation.zones[JSON.stringify([st.site.fingerprint,z.id])]={officeModes:{[id]:mode}};st.assignments[z.id].shares={...st.assignments[z.id].shares,'flat-deep-plan-plate':0,[id]:100};st.assignments[z.id].variants[id]=id==='open-hall-workspace'?'native-v1.6.0':'native-v2.21.0';}st.territoryByZone={};
 const batch=await generateContinuousSite(st,registry,()=>null,console.log);
 write(id+'-'+mode+' study.json',{settings:st});
 for(const [i,r] of batch.records.entries()){
 const a=r.architecture,z=st.site.zones[i],m=a.provenance.members.find(x=>x.office),key=id+'-'+mode+'-'+(i+1),t=batch.territoryByZone[z.id].results.area.territories[0];
 const fp=measureParts(api,a.components);close(fp.area(),m.footprintAreaFeet2);fp.delete();assert.ok(m.office.letterOutside<=.001&&a.validation.outsideArea<=.001&&a.validation.protectedArea<=.001);assert.ok(a.provenance.heightRegions.every(h=>h.builtFeet<=h.capFeet+.001));
 binary(key,[a.architecture]);binary(key+'-letters',r.orientation.components.map(l=>l.mesh));
 write(key+'.json',{key,zone:z.name,method:mode,id,zoneArea:z.areaFeet2,zonePolygon:z.polygon,territories:t.contours,datum:r.orientation.parameters.datum,territory:t.area,workspace:m.footprintAreaFeet2,combined:m.footprintAreaFeet2,guides:r.orientation.components.length,heights:[m.heightFeet],groups:m.office.studies.length,utilization:100*m.footprintAreaFeet2/t.area,open:z.areaFeet2-m.footprintAreaFeet2,checks:m.office.checks,study:m.office.studies,counts:r.orientation.counts,office:m.office.version});console.log('PASS',key,m.footprintAreaFeet2,r.orientation.counts);
 }
 }catch(e){console.error('FAIL',id,mode,e);failures++;}
}
if(failures)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
