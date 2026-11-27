// Optional arguments: Site Development JSON, output directory, pinned Proto-Form worker result.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,p);
const root=path.join(__dirname,'..'),dir='../src/components/polygonExperiment/';
const model=require(dir+'model'),territories=require(dir+'territories'),registry=require(dir+'polygonRegistry').default;
const {generateContinuousSite,generateSingleFlatDeep}=require(dir+'continuousDesign');
const {formFlatDeep,buildNativeFlatDeep,flatDeepId:id}=require(dir+'flatDeepFormation');
const [siteFile,out,referenceFile]=process.argv.slice(2);
const save=(file,data)=>{if(out)fs.writeFileSync(path.join(out,file),JSON.stringify(data,null,2));};
const close=(v,w,t=1e-4)=>assert.ok(Math.abs(v-w)<=t,`${v} differs from ${w}`);
function nativeMesh(s){const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};}
function comparePart(mesh,source,pose,epsilon){
  const rad=pose.angleDegrees*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  assert.equal(mesh.positions.length,source.positions.length);assert.equal(mesh.indices.length,source.indices.length);
  let max=0;
  for(let i=0;i<mesh.positions.length;i+=3){
    const x=mesh.positions[i]-pose.center[0],y=mesh.positions[i+2]-pose.center[1];
    const p=[x*c+y*s,-x*s+y*c,mesh.positions[i+1]-pose.datumFeet];
    for(let k=0;k<3;k++)max=Math.max(max,Math.abs(source.positions[i+k]-p[k]));
  }
  for(let i=0;i<mesh.indices.length;i+=3)assert.deepEqual(mesh.indices.slice(i,i+3),[source.indices[i],source.indices[i+2],source.indices[i+1]]);
  assert.ok(max<epsilon,'Placed mesh vertex error in feet: '+max);return max;
}
// Compare physical material after undoing the world transform. Manifold can
// choose different diagonals on a coplanar face after a rigid rotation.
function compareSolid(api,mesh,reference,pose){
  const a=pose.angleDegrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const positions=[],indices=[];
  for(let i=0;i<mesh.positions.length;i+=3){
    const x=mesh.positions[i]-pose.center[0],y=mesh.positions[i+2]-pose.center[1];
    positions.push(x*c+y*s,-x*s+y*c,mesh.positions[i+1]-pose.datumFeet);
  }
  for(let i=0;i<mesh.indices.length;i+=3)indices.push(mesh.indices[i],mesh.indices[i+2],mesh.indices[i+1]);
  function solid(p,ix){
    const data=new api.Mesh({numProp:3,vertProperties:Float32Array.from(p),triVerts:Uint32Array.from(ix)});
    data.merge();return new api.Manifold(data);
  }
  const ref=solid(reference.positions,reference.indices),actual=solid(positions,indices);
  const missing=ref.subtract(actual),extra=actual.subtract(ref);
  try{
    for(const piece of [ref,actual,missing,extra])assert.equal(piece.status(),'NoError');
    assert.ok(Math.abs(missing.volume())+Math.abs(extra.volume())<.025,'Site transform changed the native solid');
  } finally {[missing,extra,ref,actual].forEach(p=>p.delete());}
}
async function main(){
  const api=await require('manifold-3d/manifold.js').default();api.setup();territories.geometryKernel=async()=>api;
  global.fetch=async url=>new Response(fs.readFileSync(path.join(root,'public',new URL(url,'http://localhost').pathname)));
  const owned=[],own=s=>(owned.push(s),s),native=buildNativeFlatDeep(api,own);
  const ref=referenceFile?JSON.parse(fs.readFileSync(referenceFile)):null;
  const parity={fields:1,letters:native.placements.length,rulesets:[native.reports.letterArrangement.overall,native.reports.architecturalGeneration.overall],volumeFeet3:native.solid.volume()};
  assert.equal(parity.letters,46);assert.deepEqual(parity.rulesets,['pass','pass']);
  if(ref){
    assert.deepEqual(nativeMesh(native.form),ref.architecture);assert.deepEqual(nativeMesh(native.walls),ref.perimeterWalls);
    assert.deepEqual(native.placements,ref.request.source);assert.deepEqual(native.reports.letterArrangement,ref.letterArrangementReport);
    assert.deepEqual(native.reports.architecturalGeneration,ref.architecturalGenerationReport);
    assert.deepEqual(native.solid.boundingBox(),ref.bounds);close(parity.volumeFeet3,ref.volume,1e-8);
    Object.assign(parity,{sourceCommit:'d4d1242cacba09bf290af01367090f96e27cdb67',referenceMeshes:'Identical ordered vertices and triangle indices, form and walls',guidePoses:'Identical',reports:'Identical including final solid measurements',bounds:ref.bounds});
  }
  save('Native geometry comparison.json',parity);save('Letter arrangement report.json',native.reports.letterArrangement);save('Architectural generation report.json',native.reports.architecturalGeneration);
  const project=siteFile?JSON.parse(fs.readFileSync(siteFile)):structuredClone(require('../public/experiment-inputs/two-zone.json'));
  if(!siteFile){project.zones.forEach((z,i)=>Object.assign(z,{enabled:true,maxHeightFeet:48,polygon:[[300*i,0],[300*i+160,0],[300*i+140,190],[300*i,210]]}));project.exclusions=[];project.corridors=[];project.name='Flat-Deep regression';}
  const site=await model.importSite(JSON.stringify(project),'file'),state=model.withImportedSite(model.initialState(),site);
  const rows=[];
  for(const share of [100,25]){
    for(const [i,z] of site.zones.entries()){
      const a=model.newAssignment();a.shares[id]=share;a.shares['linear-edge-gallery']=100-share;
      state.assignments[z.id]=a;state.territoryByZone[z.id]={controls:{...territories.defaults(),clustering:65,areaCutAngle:i===0?0:90},results:{}};
    }
    const batch=await generateContinuousSite(state,registry,()=>null,()=>{});
    state.territoryByZone=batch.territoryByZone;
    for(const [i,record] of batch.records.entries()){
      const z=site.zones[i],plan=batch.territoryByZone[z.id].results.area,t=plan.territories.find(t=>t.typology===id);
      const single=await generateSingleFlatDeep(state,registry,z,null,share<100?t.id:undefined);
      assert.equal(single.orientation.zoneId,z.id);
      for(const [mode,r] of [['single',single],['combined',record]]){
        const arch=r.architecture,m=arch.provenance.members.find(m=>m.typology===id);
        assert.equal(arch.provenance.members.filter(m=>m.typology===id).length,1);
        const poses=m.nativeField.poses,count=poses.length;
        assert.ok(count>1,'Miami and portable fixture allocations must fit multiple native fields');
        assert.equal(count,m.nativeField.fieldCount);
        close(t.achievedPercent,share,.01);close(m.footprintAreaFeet2,896*count,.001*count);assert.equal(m.sourceCount,46*count);
        const boundaries=poses.map(p=>own(new api.CrossSection([p.corners])));
        const fieldUnion=own(api.CrossSection.union(boundaries)),assigned=own(new api.CrossSection(t.contours,'NonZero'));
        close(fieldUnion.area(),1200*count,.0001*count);
        close(own(fieldUnion.subtract(assigned)).area(),0,.0001);
        for(const p of poses)assert.deepEqual(p.fieldFeet,{width:20,depth:60,height:20});
        close(m.achievedPercent,count*89600/plan.allocatableArea,.0001);
        close(m.outsideFeet2,0,1e-6);close(arch.validation.outsideArea,0,arch.validation.areaToleranceFeet2);close(arch.validation.protectedArea,0);close(m.nativeField.letterOutsideFeet2,0);
        assert.ok(arch.provenance.heightRegions.every(b=>b.builtFeet<=b.capFeet+.001));
        const expected=896*count+(mode==='combined'?plan.territories.filter(x=>x.typology!==id).reduce((v,x)=>v+x.area,0):0);
        close(arch.measurements.buildingFootprintFeet2,expected,.02);
        close(arch.measurements.openSiteAreaFeet2,plan.grossArea-expected,.02);
        assert.deepEqual(poses,single.architecture.provenance.members[0].nativeField.poses);
        let maxGuideError=0;
        if(ref){
          for(const [k,pose] of poses.entries()){
            const prefix='flat-deep-'+(k+1)+'-';
            const guides=r.orientation.components.filter(l=>l.id.startsWith(prefix+'L-'));
            assert.equal(guides.length,ref.letters.length);
            for(const [j,l] of guides.entries())maxGuideError=Math.max(maxGuideError,comparePart(l.mesh,ref.letters[j].mesh,pose,1e-8));
            for(const [suffix,expectedMesh] of [['flat-deep-form',ref.architecture],['flat-deep-walls',ref.perimeterWalls]]){
              const mesh=arch.components.find(p=>p.id===prefix+suffix).mesh;
              assert.equal(mesh.indices.length,expectedMesh.indices.length);
              compareSolid(api,mesh,expectedMesh,pose);
            }
          }
        }
        rows.push({zone:z.name,mode,requestedPercent:share,assignedPercent:t.achievedPercent,assignedFeet2:t.area,
          builtWorkspacePercent:m.achievedPercent,workspaceFootprintFeet2:m.footprintAreaFeet2,workspaceHeightFeet:m.heightFeet,
          siteFootprintFeet2:arch.measurements.buildingFootprintFeet2,coveragePercent:arch.measurements.buildingCoveragePercent,openFeet2:arch.measurements.openSiteAreaFeet2,
          siteAreaFeet2:plan.grossArea,buildableFeet2:plan.allocatableArea,fieldCount:count,fieldCoveragePercent:100*1200*count/t.area,territoryBuiltPercent:m.nativeField.territoryCoveragePercent,poses,letterCount:m.sourceCount,
          letterVertexErrorFeet:ref?maxGuideError:null,protectedFeet2:arch.validation.protectedArea,outsideFeet2:arch.validation.outsideArea,
          letterOutsideFeet2:m.nativeField.letterOutsideFeet2,heightRegions:arch.provenance.heightRegions,members:arch.provenance.members.map(({name,allocatedPercent,achievedPercent,footprintAreaFeet2})=>({name,allocatedPercent,achievedPercent,footprintAreaFeet2}))});
      }
    }
    save('Miami '+share+' percent study.json',{settings:state});
  }
  const before=JSON.stringify(state);
  const capped=structuredClone(state);capped.site.zones[1].inputParameters.maxHeightFeet=12;
  await assert.rejects(()=>generateContinuousSite(capped,registry,()=>null,()=>{}),/height cap|native field|height limit/i);assert.equal(JSON.stringify(state),before);
  const corridor=own(api.CrossSection.square([70,22],true));
  const rotated=formFlatDeep(api,corridor,[0,0],0,[0,0],[],20);assert.equal(rotated.nativeField.poses[0].angleDegrees,90);rotated.solid.delete();
  const exact=own(api.CrossSection.square([40,120],true));
  const four=formFlatDeep(api,exact,[0,0],0,[0,0],[],20);
  assert.equal(four.nativeField.fieldCount,4);close(four.footprintArea,3584);four.solid.delete();
  const protectedStrip=own(api.CrossSection.square([3,22],true)),split=own(corridor.subtract(protectedStrip));
  assert.throws(()=>formFlatDeep(api,split,[0,0],0,[0,0],[],20),/field/);
  assert.throws(()=>formFlatDeep(api,corridor,[0,0],0,[0,0],[{section:corridor,cap:12}],48),/required height/);
  save('Miami measurements.json',{rows,regressions:['native parity','both paths and both zones','mixed and full shares','quarter-turn fit','protected strip blocks placement','height-cap refusal','failed batch leaves previous input intact']});
  owned.reverse().forEach(x=>x.delete());console.table(rows.map(({zone,mode,requestedPercent,assignedFeet2,workspaceFootprintFeet2,coveragePercent,openFeet2})=>({zone,mode,requestedPercent,assignedFeet2,workspaceFootprintFeet2,coveragePercent,openFeet2})));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
