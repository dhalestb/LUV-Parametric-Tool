// Run with the path to an exported two-zone Miami study. Geometry is generated in memory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,p);
const dir='../src/components/polygonExperiment/';
const T=require(dir+'territories'),model=require(dir+'model'),registry=require(dir+'polygonRegistry').default;
const {generateContinuousSite}=require(dir+'continuousDesign');
function separation(a,b){
 function distance(p,q,r){const x=r[0]-q[0],y=r[1]-q[1],t=Math.min(1,Math.max(0,((p[0]-q[0])*x+(p[1]-q[1])*y)/(x*x+y*y||1)));
 return Math.hypot(p[0]-q[0]-t*x,p[1]-q[1]-t*y);}
 const vertexToEdges=(p,q)=>Math.min(...p.flatMap(v=>q.map((w,i)=>distance(v,w,q[(i+1)%q.length]))));
 return Math.min(vertexToEdges(a,b),vertexToEdges(b,a));
}
function verifyContactOnlySeam(api){
 const {siteMesh}=require(dir+'continuousFormation');
 const {galleryWallJoints}=require(dir+'galleryWallJoints');
 const owned=[],walls=[],joints=[];
 const own=solid=>{owned.push(solid);return solid;};
 const box=(size,at)=>own(own(api.Manifold.cube(size)).translate(at));
 const wall=(id,size,at)=>walls.push({id,sources:[id],mesh:siteMesh(box(size,at),[0,0],0)});
 try{
  wall('linear-edge-gallery/lower-0/side-1/base-wall-1',[20,.53,12],[0,2,0]);
  wall('inserted-plate/street/level-1/edge receivers',[8,1,6],[0,-1,0]);
  wall('vertical-walls/street/level-1/seating terrace 1',[7,1,6],[13,-1,0]);
  galleryWallJoints(api,[[[0,0],[20,0],[20,14],[0,14]]],walls,[0,0],0,s=>joints.push(own(s.asOriginal())));
  const actual=own(own(api.Manifold.union(joints)).subtract(box([20,.53,12],[0,2,0])));
  const expected=own(api.Manifold.union([box([8,2,6],[0,0,0]),box([7,2,6],[13,0,0])]));
  assert.ok(own(actual.subtract(expected)).volume()<.001,'Leave the doorway and exposed upper gallery clear');
  assert.ok(own(expected.subtract(actual)).volume()<.001,'Close the full contact on each side of the doorway');
 }finally{owned.reverse().forEach(s=>s.delete());}
}
function verifyGallery(api,orientation,architecture){
 const parts=architecture.components.filter(p=>p.id.startsWith('linear-edge-gallery/'));
 const letters=new Map(orientation.components.map(p=>[p.id,p]));
 const xyz=mesh=>Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(3*i,3*i+3));
 const elevations=mesh=>xyz(mesh).map(p=>p[1]);
 const raw=new api.Mesh({numProp:3,vertProperties:new Float32Array(architecture.architecture.positions),triVerts:new Uint32Array(architecture.architecture.indices)});
 raw.merge();const solid=new api.Manifold(raw);
 const checks={lower:{firstReturns:0,clear:0,probed:0},upper:{firstReturns:0,clear:0,probed:0}};
 const roofs=parts.filter(p=>p.id.endsWith('/enclosed roof'));assert.ok(roofs.length>=2);
 try{
  assert.equal(solid.status(),'NoError');
  for(const roof of roofs){
   const group=roof.id.slice(0,-'/enclosed roof'.length);
   const upper=group.includes('/upper-'),counts=checks[upper?'upper':'lower'];
   const floor=parts.find(p=>p.id===group+'/contour floor');assert.ok(floor);
   const base=(upper?Math.max:Math.min)(...elevations(floor.mesh));
   const caps=elevations(roof.mesh);assert.ok(Math.abs(Math.max(...caps)-Math.min(...caps)-.53125)<.005);
   if(upper){
    const lower=parts.find(p=>p.id===roof.id.replace('/upper-','/lower-'));assert.ok(lower);assert.ok(Math.abs(Math.max(...elevations(lower.mesh))-base)<.005);
   }
   for(const ret of parts.filter(p=>p.id.startsWith(group+'/')&&/\/daylight-return-0-\d+$/.test(p.id))){
    const ys=elevations(ret.mesh),lo=Math.min(...ys),hi=Math.max(...ys);
    const sources=ret.sources.map(id=>letters.get(id));assert.ok(sources.every(Boolean));
    const crest=Math.max(...sources.flatMap(l=>elevations(l.mesh)));
    assert.ok(Math.abs(lo-base)<.012&&Math.abs(hi-crest)<.012,'First return must run from its own floor to the higher letter top');
    counts.firstReturns++;
    // On an uncut rectangular web, the short side is the native wall thickness.
    // Its far/near face distance is the source setback plus wall thickness.
    const verts=xyz(ret.mesh),corners=[...new Set(verts.map(v=>JSON.stringify([v[0],v[2]])))].map(JSON.parse);
    if(corners.length!==4)continue;
    const [a,...rest]=corners;
    const axes=rest.map(b=>[b[0]-a[0],b[1]-a[1]]).sort((u,v)=>Math.hypot(...u)-Math.hypot(...v));
    const [short,long]=axes.map(v=>Math.hypot(...v));
    if(Math.abs(short-.53125)>.015)continue; // a terrace doorway trimmed the web
    const recess=long-.53125;
    assert.ok([.5,1,1.5,2].some(d=>Math.abs(d-recess)<.015),'Unexpected recess '+recess);
    let nx=axes[1][0]/long,nz=axes[1][1]/long;
    const ext=mesh=>Math.max(...xyz(mesh).map(p=>nx*p[0]+nz*p[2]));
    const front=()=>Math.max(...sources.map(l=>ext(l.mesh)));
    if(Math.abs(ext(ret.mesh)-front())>.015){nx=-nx;nz=-nz;}
    assert.ok(Math.abs(ext(ret.mesh)-front())<.015,'Return must bear on its source exterior face');
    assert.ok(Math.abs(Math.abs(ext(sources[0].mesh)-ext(sources[1].mesh))-recess)<.015,'Return depth must match source faces');
    if(recess<=.54||counts.probed>=10)continue;
    const center=corners.reduce((v,p)=>[v[0]+p[0]/4,v[1]+p[1]/4],[0,0]);
    const test=api.Manifold.cube([.06,.06,.06],true),at=test.translate([center[0],hi+.08,center[1]]),hit=solid.intersect(at);
    counts.probed++;if(hit.volume()<1e-8)counts.clear++;
    hit.delete();at.delete();test.delete();
   }
  }
  for(const c of Object.values(checks)){assert.ok(c.firstReturns>0&&c.probed>0);assert.equal(c.clear,c.probed,'Finished assembly blocks a sampled return opening');}
  return checks;
 }finally{solid.delete();}
}
async function main(){
 const study=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).settings;
 const api=await require('manifold-3d/manifold.js').default();api.setup();T.geometryKernel=async()=>api;
 verifyContactOnlySeam(api);
 global.fetch=async url=>new Response(fs.readFileSync(path.join(__dirname,'../public',new URL(url,'http://localhost').pathname)));
 const facades=process.argv[3]==='facades';
 const ids=facades?['linear-edge-gallery','room-within-volume','vertical-walls','open-hall-workspace']:[process.argv[3]==='gallery'?'linear-edge-gallery':'vertical-walls','flat-deep-plan-plate','open-hall-workspace','void-edge-workspace'];
 for(const clustering of [0,65]){
  const state=structuredClone(study);
  state.generation={method:'typology-area',zones:{}};
  for(const [i,zone] of state.site.zones.entries()){
   zone.enabled=true;
   const assignment=model.newAssignment();
   assignment.shares['linear-edge-gallery']=0;
   for(const id of ids)assignment.shares[id]=25;
   state.assignments[zone.id]=assignment;
   state.territoryByZone[zone.id]={controls:{...T.defaults(),clustering},results:{}};
   state.generation.zones[JSON.stringify([state.site.fingerprint,zone.id])]={
    flatDeepMode:'proportional',officeModes:facades?{}:{'open-hall-workspace':'boundary','void-edge-workspace':'boundary'},
    letterTargets:facades&&(i===0)?{}:Object.fromEntries(ids.map(id=>[id,100])),distributeWorkspaceForms:i===1
   };
  }
  const batch=await generateContinuousSite(state,registry,()=>null,()=>{});
  assert.equal(batch.records.length,2);
  for(const {architecture:a,orientation:o} of batch.records){
   assert.deepEqual(a.provenance.members.map(m=>m.allocatedPercent),[25,25,25,25]);
   const hall=a.provenance.members.find(m=>m.typology==='open-hall-workspace');
   const layers=a.planLayers.filter(p=>p.typology===hall.typology);
   const ground=layers.filter(p=>p.name.endsWith('-hall-ground')),ring=layers.filter(p=>p.name.endsWith('-hall-ring'));
   assert.equal(ground.length,1);assert.equal(ground[0].contours.length,1);
   assert.equal(ring.length,1);assert.equal(ring[0].contours.length,2);
   const section=new api.CrossSection(ground[0].contours),opening=new api.CrossSection([ring[0].contours[1]],'EvenOdd');
   const spill=opening.subtract(section);
   try{
    const share=opening.area()/section.area();
    assert.ok(share>=.2&&share<=.4);assert.ok(spill.area()<.001);
    assert.ok(separation(ground[0].contours[0],ring[0].contours[1])>=10-.0001,'Ten foot gallery encircles the full opening');
    assert.ok(Math.abs(section.area()-hall.footprintAreaFeet2)<.01);
    const cuts=layers.find(p=>p.name.endsWith('-hall-roof')).contours.length-1;
    const bays=Number(hall.office.checks.find(c=>c.id==='Entry and bay layout').measurement.match(/(\d+) skylight bays/)[1]);
    assert.equal(cuts,bays);assert.ok(cuts>0);
    assert.ok(hall.office.checks.some(c=>c.measurement.startsWith(cuts+' unobstructed skylights')));
    const dimensions=hall.office.checks.find(c=>c.measurement.includes('ft clear entry'))?.measurement.match(/([\d.]+) ft clear entry on a ([\d.]+) ft wall/);
    assert.ok(dimensions && Number(dimensions[1])+.01>=Number(dimensions[2])/3,'Street entrance spans at least one third of its wall');
    assert.ok(hall.office.checks.some(c=>c.measurement.includes('one connected union')));
    assert.ok(hall.office.letterOutside<.001&&hall.outsideFeet2<.001);
    assert.ok(a.validation.outsideArea<=a.validation.areaToleranceFeet2&&a.validation.protectedArea<=a.validation.areaToleranceFeet2);
    assert.ok(Math.abs(hall.footprintAreaFeet2-hall.territoryAreaFeet2)<.01,'Open Hall occupies its assigned area');
    if(facades){
     assert.equal(hall.office.mode,'boundary');
     const roofs=a.components.filter(p=>p.id.startsWith('linear-edge-gallery/')&&p.id.endsWith('/enclosed roof'));
     const uppers=roofs.filter(p=>p.id.includes('/upper-'));
     assert.ok(uppers.length>0);assert.equal(roofs.length,uppers.length*2);
     for(const roof of uppers){
      const storey=roof.id.slice(0,-'/enclosed roof'.length);
      for(let side=0;side<4;side++)assert.ok(a.components.some(p=>p.id.startsWith(storey+'/side-'+side+'/daylight-return-0-')),'Unarticulated rooftop facade '+storey+' '+side);
     }
     const room=a.components.filter(p=>p.id.startsWith('room-within-volume/'));
     assert.ok(!room.some(p=>p.id.endsWith('outer hall enclosure')));
     const lofts=room.filter(p=>p.id.includes('/full-loft-')),bases=room.filter(p=>p.id.includes('/full-base-'));
     const planks=room.filter(p=>p.id.includes('/top-plank-'));
     assert.ok(planks.length>=2,'Generate the open crown from the top perimeter course');
     const toSolid=mesh=>{
      const raw=new api.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)});
      raw.merge();return new api.Manifold(raw);
     };
     for(const plank of planks){
      const pair=lofts.find(p=>p.sources[1]===plank.sources[0]);assert.ok(pair,'Plank must have a matching upper-letter loft');
      const arm=toSolid(plank.mesh),wall=toSolid(pair.mesh),overlap=arm.intersect(wall);
      try{assert.ok(overlap.volume()>.001,'Plank must physically bear on its source loft');}
      finally{overlap.delete();wall.delete();arm.delete();}
     }
     const sources=new Set(o.components.map(l=>l.id));
     assert.ok(bases.length>0&&lofts.length>=bases.length);
     for(const panel of lofts){assert.equal(panel.sources.length,2);assert.ok(panel.sources.every(k=>sources.has(k)));}
     for(const panel of bases){
      const ys=panel.mesh.positions.filter((_,i)=>i%3===1);
      assert.ok(Math.abs((Math.max(...ys)-Math.min(...ys))-5)<1.6,'Lower loft must meet the five-foot tilted letter course');
     }
    }
    if(facades||process.argv[3]==='gallery')console.log(a.zoneId,verifyGallery(api,o,a));
    console.log(a.zoneId,clustering+'% clustering',hall.footprintAreaFeet2.toFixed(2)+' ft²', (share*100).toFixed(2)+'% opening');
   }finally{spill.delete();opening.delete();section.delete();}
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

