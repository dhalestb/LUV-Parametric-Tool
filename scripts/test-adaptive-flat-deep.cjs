// Run from the Polygon worktree. Arguments: directory of approved Miami inputs, local review output.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,p);
const dir='../src/components/polygonExperiment/';
const {generateContinuousSite,generateSingleFlatDeep}=require(dir+'continuousDesign'),reg=require(dir+'polygonRegistry').default,territories=require(dir+'territories');
const {formFlatDeep}=require(dir+'flatDeepFormation');
const [inputs,out]=process.argv.slice(2),id='flat-deep-plan-plate';
function write(name,value){fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));}
function near(a,b,t=.05){assert.ok(Math.abs(a-b)<t,a+' versus '+b);}
function meshFile(name,meshes){
 const nv=meshes.reduce((n,m)=>n+m.positions.length/3,0),ni=meshes.reduce((n,m)=>n+m.indices.length,0);
 const buf=Buffer.alloc(8+12*nv+4*ni);buf.writeUInt32LE(nv);buf.writeUInt32LE(ni,4);
 const vertices=new Float32Array(buf.buffer,buf.byteOffset+8,nv*3),indices=new Uint32Array(buf.buffer,buf.byteOffset+8+nv*12,ni);
 let v=0,i=0;
 for(const m of meshes){vertices.set(m.positions,v*3);for(const j of m.indices)indices[i++]=j+v;v+=m.positions.length/3;}
 fs.writeFileSync(path.join(out,name+'.bin'),buf);
}
// Independently project the emitted component triangles, including undersides. This audit
// never reads assigned areas, finished-union geometry, or the generator's projection helper.
function componentProjection(api,parts){
 const shapes=parts.map(({mesh:{positions:p,indices:ix}})=>{
   const rings=[];
   for(let i=0;i<ix.length;i+=3){
     const pts=[ix[i],ix[i+1],ix[i+2]].map(k=>[p[k*3],p[k*3+2]]);
     const [a,b,c]=pts,twice=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
     if(Math.abs(twice)>1e-10)rings.push(twice<0?pts.reverse():pts);
   }
   return new api.CrossSection(rings,'NonZero');
 });
 try{return api.CrossSection.union(shapes);}finally{shapes.forEach(s=>s.delete());}
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const api=await require('manifold-3d/manifold.js').default();api.setup();territories.geometryKernel=async()=>api;
 global.fetch=async url=>new Response(fs.readFileSync(path.join(__dirname,'../public',new URL(url,'http://localhost').pathname)));
 const rows=[];
 for(const share of [100,25])for(const method of ['native','adaptive']){
  const state=JSON.parse(fs.readFileSync(path.join(inputs,'Miami '+share+' percent study.json'))).settings;
  const site=state.site;
  state.generation??={method:'typology-area',zones:{}};
  for(const z of site.zones){const k=JSON.stringify([site.fingerprint,z.id]);state.generation.zones[k]={...state.generation.zones[k],flatDeepMode:method,flatDeepCoverage:100};}
  if(method==='adaptive')write('Miami adaptive '+share+' percent.json',{settings:state});
  const batch=await generateContinuousSite(state,reg,()=>null,console.log);
  for(const [i,{architecture:a,orientation:o}] of batch.records.entries()){
   const z=site.zones[i],plan=batch.territoryByZone[z.id].results.area,t=plan.territories.find(t=>t.typology===id);
   const member=a.provenance.members.find(m=>m.typology===id),f=member.nativeField,fields=f.poses;
   const combined=componentProjection(api,a.components),workspace=componentProjection(api,a.components.filter(c=>c.id.startsWith('flat-deep-')));
   const territory=new api.CrossSection(t.contours,'NonZero'),permitted=new api.CrossSection(plan.permitted,'NonZero');
   const rects=fields.map(p=>new api.CrossSection([p.corners])),union=api.CrossSection.union(rects);
   const mathArea=fields.reduce((sum,p)=>sum+(p.fieldFeet.width-4)*(p.fieldFeet.depth-4),0);
   const escaped=workspace.subtract(territory),fieldEscape=union.subtract(territory),siteEscape=combined.subtract(permitted);
   const summed=fields.reduce((n,p)=>n+p.fieldFeet.width*p.fieldFeet.depth,0);
   near(union.area(),summed,.005);near(fieldEscape.area(),0,.005);near(escaped.area(),0,.005);near(siteEscape.area(),0,.06);
   near(workspace.area(),mathArea);near(workspace.area(),member.footprintAreaFeet2);
   near(combined.area(),a.measurements.buildingFootprintFeet2);near(a.measurements.openSiteAreaFeet2,plan.grossArea-combined.area());
   assert.ok(a.provenance.heightRegions.every(r=>r.builtFeet<=r.capFeet+.001));
   assert.equal(f.letterOutsideFeet2,0);assert.equal(a.validation.protectedArea,0);
   const fieldInfo=fields.map((p,k)=>{
     const dim=p.fieldFeet,count=o.components.filter(c=>c.id.startsWith('flat-deep-'+(k+1)+'-L-')).length;
     const nodeCount=(Math.max(1,Math.floor((dim.width-4)/12))+1)*(Math.max(1,Math.floor((dim.depth-4)/12))+1);
     assert.equal(count,36+nodeCount);
     const reports=f.fieldReports?.[k]??f.rulesets;
     for(const report of Object.values(reports)){assert.equal(report.rules.length,10);assert.ok(report.rules.every(r=>r.status==='pass'));}
     return {...p,letters:count,architecturalHeight:dim.height-.05};
   });
   if(method==='adaptive'){
     assert.ok(fieldInfo.some(p=>p.letters!==46));const single=await generateSingleFlatDeep(state,reg,z,null,share===100?undefined:t.id);
     near(single.architecture.measurements.buildingFootprintFeet2,workspace.area());assert.deepEqual(single.architecture.provenance.members[0].nativeField.poses,fields);
   }
   const key=method+'-'+share+'-'+(i+1);
   meshFile(key,[a.architecture]);meshFile(key+'-letters',o.components.filter(c=>c.id.startsWith('flat-deep-')).map(c=>c.mesh));
   if(method==='adaptive')write(key+'-rules.json',f.fieldReports);
   const row={key,zone:z.name,method,share,territory:t.area,zoneArea:plan.grossArea,workspace:workspace.area(),utilization:100*workspace.area()/t.area,territoryOpen:t.area-workspace.area(),combined:combined.area(),reportedCombined:a.measurements.buildingFootprintFeet2,open:plan.grossArea-combined.area(),guides:member.sourceCount,fields:fieldInfo,heightBands:a.provenance.heightRegions,letterEscape:f.letterOutsideFeet2,fieldEscape:fieldEscape.area(),protected:a.validation.protectedArea,workspaceEscape:escaped.area(),combinedEscape:siteEscape.area(),zonePolygon:z.polygon,territories:t.contours,datum:o.parameters.datum};
   rows.push(row);write('measurements.json',rows);
   console.log(key,fields.length,row.guides,row.workspace.toFixed(1),row.utilization.toFixed(2),row.combined.toFixed(1));
   [combined,workspace,territory,permitted,...rects,union,escaped,fieldEscape,siteEscape].forEach(s=>s.delete());
  }
 }
 const rect=api.CrossSection.square([80,100],true),low=api.CrossSection.square([30,100],true);
 const params={coverage:30,setback:4,separation:3,minimum:20};
 const trial=formFlatDeep(api,rect,[0,0],0,[0,0],[{id:'low',role:'low',cap:15,section:low}],36,params);
 const inset=rect.offset(-4),outside=inset.subtract(low);
 for(const p of trial.nativeField.poses){const s=new api.CrossSection([p.corners]),bad=s.subtract(outside);near(bad.area(),0,.001);bad.delete();s.delete();}
 assert.ok(trial.footprintArea<=2400.01&&trial.footprintArea>0);
 assert.throws(()=>formFlatDeep(api,rect,[0,0],0,[0,0],[],19,params),/headroom/);
 [trial.solid,rect,low,inset,outside].forEach(s=>s.delete());
 console.log('PASS both paths, both zones, dual rules, measured component projections, coverage budget, setbacks and low-height exclusion.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
