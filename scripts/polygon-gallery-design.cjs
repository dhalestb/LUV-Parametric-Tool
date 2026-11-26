const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {specialize, authenticate, hash} = require('./authentic-polygon-domain.cjs');
const {geometry} = require('./independent-field-gallery.cjs');
const vendor = path.resolve(__dirname, '../vendor/architectural-board');
const checkpoint = 'a6493b62cb784e7ccacc327dbe8dc90a604f1e48';
const version = 'linear-edge-gallery/polygon-print-contour-v1';
const template = require('../src/components/polygonExperiment/registry-data.json').items
  .find(t => t.evidence?.some(e => e.variant === 'print-contour')).evidence.find(e => e.variant === 'print-contour').request;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const area = ring => ring.reduce((sum,p,i) => {
  const q=ring[(i+1)%ring.length]; return sum+p[0]*q[1]-p[1]*q[0];
},0)/2;
const sizeOf = mesh => mesh.indices.length/3;

function clearance(point, ring) {
  let inside=false, nearest=Infinity;
  const [x,y]=point;
  for(let i=0;i<ring.length;i++){
    const a=ring[i], b=ring[(i+1)%ring.length], dx=b[0]-a[0], dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
    nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
    if((a[1]>y)!==(b[1]>y) && x<a[0]+dx*(y-a[1])/dy) inside=!inside;
  }
  return inside?nearest:-nearest;
}

// Choose the pivot from the interior so a rigidly rotated upper gallery can reach its terraces.
function terraceCenter(ring) {
  const xs=ring.map(p=>p[0]), ys=ring.map(p=>p[1]);
  let x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  let best, radius=-Infinity;
  for(let pass=0;pass<4;pass++){
    const dx=(x1-x0)/20,dy=(y1-y0)/20;
    for(let i=0;i<=20;i++)for(let j=0;j<=20;j++){
      const p=[x0+i*dx,y0+j*dy],r=clearance(p,ring);
      if(r>radius){best=p;radius=r;}
    }
    x0=best[0]-dx;x1=best[0]+dx;y0=best[1]-dy;y1=best[1]+dy;
  }
  return {center:best,radius};
}

// Remove survey jitter and corners shorter than a native receiving run.
// Verify every candidate contour against the full-resolution permitted footprint.
function courseRing(w, permitted, insetFeet) {
  const inset=permitted.offset(-insetFeet,'Miter').simplify(.5);
  const rings=inset.toPolygons();
  inset.delete();
  assert(rings.length===1, 'Gallery course requires a connected inset without interior holes');
  let r=rings[0];
  if(area(r)<0)r.reverse();
  while(r.length>3){
    const short=r.findIndex((p,i)=>distance(p,r[(i+1)%r.length])<16);
    if(short<0)break;
    const options=[short,(short+1)%r.length].map(i=>r.filter((_,j)=>i!==j));
    const candidates=options.map(ring=>{
      const section=new w.CrossSection([ring]);
      const excess=section.subtract(permitted);
      const valid=excess.area()<=1e-6 && section.toPolygons().length===1;
      excess.delete();section.delete();
      return {ring,valid,change:Math.abs(area(r)-area(ring))};
    }).filter(item=>item.valid).sort((a,b)=>a.change-b.change);
    assert(candidates.length,'A short protected corner has no contained native receiving run');
    r=candidates[0].ring;
  }
  return r;
}
function localToSite(mesh, center, angle, datum) {
  const c=Math.cos(angle),s=Math.sin(angle),positions=[],indices=[];
  for(let i=0;i<mesh.positions.length;i+=3){
    const [x,y,z]=mesh.positions.slice(i,i+3);
    positions.push(center[0]+c*x-s*y,datum+z,center[1]+s*x+c*y);
  }
  for(let i=0;i<mesh.indices.length;i+=3)indices.push(mesh.indices[i],mesh.indices[i+2],mesh.indices[i+1]);
  return {positions,indices};
}
async function buildWing(w,section,height,input,dir,insetFeet) {
  const ring=courseRing(w,section,insetFeet);
  const {center,radius}=terraceCenter(ring);
  assert(radius>=10,'Insufficient clearance for the native rotated upper gallery');
  const angle=input.heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const local=p=>[(p[0]-center[0])*c+(p[1]-center[1])*s,-(p[0]-center[0])*s+(p[1]-center[1])*c];
  const lower=ring.map(local);
  // Compact upper field selects the native mixed 4, 5 and 6 ft running-bond recipe.
  const half=10;
  const upper=[[-half,-half],[half,-half],[half,half],[-half,half]];
  const cornerMargins=lower.map((p,i)=>{
    const a=lower.at(i-1), b=lower[(i+1)%lower.length];
    const theta=(Math.atan2(a[1]-p[1],a[0]-p[0])-Math.atan2(b[1]-p[1],b[0]-p[0])+2*Math.PI)%(2*Math.PI);
    return Math.max(2,5.5/Math.tan(theta/2));
  });
  const engine=specialize({lower,upper,nativeUpper:true,cornerClearanceFeet:2,cornerMargins});
  const request=structuredClone(template);
  const range=Math.max(...lower.flat().map(Math.abs))+16;
  request.field={width:2*range,depth:2*range,height};
  request.source=[];request.linearGallery.seed=input.seed;request.linearGallery.nominalSpacing=input.spacing;
  request.sourceSnapshot={rotationSeed:input.rotationSeed};
  await engine.arrangeMixed(request);
  const nativeA=require(path.join(vendor,'scripts/source-envelope.cjs')).derive(request).letters;
  const sourceHash=hash(nativeA),requestHash=hash(request);
  const built=await engine.buildGallery(request,dir);
  assert.equal(hash(built.letters),sourceHash,'Rule B source geometry changed');
  assert.equal(hash(request),requestHash,'Rule B changed the Rule A poses');
  assert(built.architecturalValidation.passed && built.galleryReport.solidComponents===1);
  const geom=geometry(w), localDomain=new w.CrossSection(section.toPolygons().map(r=>r.map(local)),'NonZero');
  const project=mesh=>geom.project(mesh);
  const footprint=project(built.architecture),excess=footprint.subtract(localDomain);
  const outside=excess.area();excess.delete();assert(outside<=1e-6,'Finished gallery exceeds its height region by '+outside+' ft²');
  let lowest=Infinity,highest=-Infinity;
  function checkVertical(mesh){
    for(let i=2;i<mesh.positions.length;i+=3){lowest=Math.min(lowest,mesh.positions[i]);highest=Math.max(highest,mesh.positions[i]);}
  }
  checkVertical(built.architecture);
  const builtHeight=highest;
  for(const letter of nativeA){
    const p=project(letter.mesh),off=p.subtract(localDomain);
    const a=off.area();off.delete();p.delete();assert(a<=1e-6,'Letter outside its tier: '+letter.id);
    checkVertical(letter.mesh);
  }
  assert(lowest>=-1e-6 && highest<=height+1e-6,'Gallery exceeds its local height envelope');
  const datum=input.datum, mapMesh=mesh=>localToSite(mesh,center,angle,datum);
  const worldFootprint=footprint.toPolygons().map(r=>r.map(([x,y])=>[center[0]+c*x-s*y,center[1]+s*x+c*y]));
  const footprintArea=footprint.area();footprint.delete();localDomain.delete();
  return {ring,center,rotation:request.sourceSnapshot.terraceRotation,requestHash,sourceHash,
    footprintArea,worldFootprint,outside,builtHeight,height:highest,architecture:mapMesh(built.architecture),
    letters:nativeA.map((l,i)=>({id:l.id,letter:request.source[i].letter,nominalSizeFeet:request.sourceSnapshot.stations[i].size,mesh:mapMesh(l.mesh)})),
    parts:built.components.map((p,i)=>({id:p.id,sources:p.sources,kind:built.galleryReport.surfaces[i].kind,mesh:mapMesh(p.mesh)}))};
}
function combine(meshes) {
  const positions=[],indices=[];
  for(const mesh of meshes){
    const offset=positions.length/3;
    for(const v of mesh.positions)positions.push(v);
    for(const i of mesh.indices)indices.push(offset+i);
  }
  return {positions,indices};
}

async function generatePolygonGallery(input, policy, {outputRoot}={}) {
  assert.equal(input.recipe,'print-contour');
  assert.equal(policy.status,'site-rules-ready');
  assert(!input.siteHandoff,'The shared-field gallery handoff requires its own explicit placement');
  for(const seed of [input.seed,input.rotationSeed])assert(Number.isSafeInteger(seed)&&seed>=0&&seed<=4294967295,'Invalid gallery seed');
  assert([12,13,14,15].includes(input.spacing),'Use a native course spacing of 12–15 ft');
  assert(Number.isFinite(input.heading)&&Number.isFinite(input.datum),'Finite site heading and base elevation required');
  const {site,zoneId}=input, rules=policy.siteRules;
  const setback=input.adaptive.setbackFeet??0, diameter=input.development.planningDiameterFeet??0;
  assert(Number.isFinite(setback)&&setback>=0&&Number.isFinite(diameter)&&diameter>=0,'Invalid site clearance');
  const bindings=authenticate(),w=await require('manifold-3d/manifold.js').default();w.setup();
  const domain=new w.CrossSection(rules.domain,'NonZero'),permitted=domain.offset(-setback,'Miter');
  const screen=permitted.offset(-diameter/2,'Round');
  assert(!screen.isEmpty(),'Allocated territory has insufficient planning clearance');
  screen.delete();
  const runId=randomUUID(),out=path.join(outputRoot??path.resolve('public/experiment-designs'),runId);
  fs.mkdirSync(out,{recursive:true});
  const wings=[], receipts=[],letters=[],parts=[],footprints=[],openFragments=[];
  try{
    for(const tier of rules.regions){
      if(tier.areaFeet2<=1e-6)continue;
      const full=new w.CrossSection(tier.contours,'NonZero'),region=full.intersect(permitted);
      full.delete();
      const pieces=region.decompose();region.delete();
      assert(pieces.length,'Setback removes the entire '+tier.role+' gallery region');
      const before=wings.length;
      for(const piece of pieces){
        const prefix='gallery-'+(wings.length+1)+'-';
        try {
          // A disconnected remnant smaller than the locked upper gallery remains open ground.
          const core=piece.offset(-4,'Miter'),hasCore=!core.isEmpty();core.delete();
          if(!hasCore){
            openFragments.push({tierId:tier.id,areaFeet2:piece.area(),reason:'Too narrow for the native gallery'});
            continue;
          }
          let wing,insetFeet=3;
          try {wing=await buildWing(w,piece,tier.heightFeet,input,path.join(out,prefix+'native'),insetFeet);}
          catch(error){
            // At a reflex corner the native floor can bridge between letter ends. Re-seat
            // the courses farther inside and validate the regenerated solids again.
            if(!/exceeds its height region|Letter outside its tier/.test(error.message))throw error;
            insetFeet=6;
            wing=await buildWing(w,piece,tier.heightFeet,input,path.join(out,prefix+'inset-native'),insetFeet);
          }
          for(const l of wing.letters)letters.push({...l,id:prefix+l.id});
          for(const p of wing.parts)parts.push({...p,id:prefix+p.id,sources:p.sources.map(id=>prefix+id)});
          wings.push(wing.architecture);footprints.push(...wing.worldFootprint);
          receipts.push({tierId:tier.id,role:tier.role,limitFeet:tier.heightFeet,heightFeet:wing.height,builtFeet:wing.builtHeight,
            buildingFootprintFeet2:wing.footprintArea,outsideAreaFeet2:wing.outside,sourceCount:wing.letters.length,
            componentCount:wing.parts.length,course:wing.ring,pivot:wing.center,upperRotationDegrees:wing.rotation,
            courseInsetFeet:insetFeet,nativeRuleAHash:wing.sourceHash,nativeRequestHash:wing.requestHash,solidComponents:1});
        } catch(error) {throw Error(tier.role+' gallery: '+error.message);}
        finally{piece.delete();}
      }
      assert(wings.length>before,'No native gallery fits the '+tier.role+' region');
    }
    assert(wings.length,'No buildable height regions');
    const architectureMesh=combine(wings), projected=new w.CrossSection(footprints,'NonZero');
    const excess=projected.subtract(permitted),outsideArea=excess.area(),footprintArea=projected.area();
    const footprint=projected.toPolygons();excess.delete();projected.delete();
    assert(outsideArea<=1e-6,'Combined gallery footprint leaves the allocated territory');
    const geometryHash=hash(letters.map(l=>l.mesh)),architectureHash=hash(architectureMesh);
    const id=hash({runId,geometryHash}),bid=hash({id,architectureHash}),datum=input.datum;
    const bounds=permitted.bounds(),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2);
    const counts={L:0,U:0,V:0};for(const l of letters)counts[l.letter]++;
    const name='Linear Edge Gallery · Print-Contour',limitations=['One native shell per buildable height-region component. Oblique corners use separate source runs.'];
    const provenance={runId,adapterVersion:version,checkpoint,bindings,sourceFingerprint:site.fingerprint,sourceRevision:site.revision,
      heightPolicy:"explicit site height regions",heightRegions:receipts.map((r,i)=>({id:r.tierId+"-"+i,role:r.role,capFeet:r.limitFeet,builtFeet:r.builtFeet})),
      openFragments,basis:policy.basis,sourceGeometryHash:policy.sourceGeometryHash,territoryAreaFeet2:rules.actualDomainAreaFeet2,regions:receipts};
    const orientation={version:1,id,kind:'orientation-only',typologyId:'linear-edge-gallery',typologyName:name,site,zoneId,
      geometryHash,counts,parameters:{recipe:input.recipe,seed:input.seed,rotationSeed:input.rotationSeed,spacing:input.spacing,heading:input.heading,datum,
      field:{width:bounds.max[0]-bounds.min[0],depth:bounds.max[1]-bounds.min[1],height:Math.max(...receipts.map(r=>r.limitFeet))}},
      frame:{center,angle:input.heading*Math.PI/180,corners:rules.domain[0]},components:letters,
      layers:[],organizingEdges:receipts.map((r,i)=>({id:'course-'+i,points:[...r.course,r.course[0]].map(p=>[p[0],datum,p[1]])})),
      validation:{outsideArea:0,maxElevationError:0,triangles:letters.reduce((n,l)=>n+sizeOf(l.mesh),0),
      attempts:1,grossArea:rules.grossAreaFeet2,permittedArea:permitted.area(),protectedArea:rules.grossAreaFeet2-rules.permittedAreaFeet2},
      provenance:{...provenance,entry:'linear-gallery-automatic.cjs#arrangeMixed',B:{executed:false}},limitations};
    const measurements={buildingFootprintFeet2:footprintArea,buildingCoveragePercent:100*footprintArea/rules.actualDomainAreaFeet2,
      territoryAreaFeet2:rules.actualDomainAreaFeet2,openSiteAreaFeet2:rules.actualDomainAreaFeet2-footprintArea};
    const validation={outsideArea,protectedArea:0,footprintArea,heightAboveDatum:Math.max(...receipts.map(r=>r.heightFeet)),
      occupiedSiteEnvelope:{passed:true},connectedSolids:wings.length,exactSavedAConsumed:true,triangles:sizeOf(architectureMesh)};
    const architecture={version:1,id:bid,kind:'architecture-rule-b',typologyId:'linear-edge-gallery',typologyName:name,variant:'print-contour',
      parentOrientationId:id,parentGeometryHash:geometryHash,geometryHash:architectureHash,site,zoneId,datum,frame:orientation.frame,
      architecture:architectureMesh,components:parts,validation,measurements,
      provenance:{...provenance,entry:'source-linear-gallery.cjs#buildGallery → linear-gallery-print.cjs',footprint},limitations};
    const url='/experiment-architecture/'+bid+'.json';
    const lib=outputRoot?path.join(out,'architecture-library'):path.resolve('public/experiment-architecture');
    fs.mkdirSync(lib,{recursive:true});
    const write=(dest,data)=>fs.writeFileSync(dest,JSON.stringify(data),{flag:'wx'});
    write(path.join(lib,bid+'.json'),architecture);write(path.join(lib,id+'.manifest.json'),{id:bid,parentOrientationId:id,url});
    write(path.join(out,'rule-a.json'),orientation);
    const response={status:'complete',runId,orientation,architecture:{id:bid,url,geometryHash:architectureHash,
      components:parts.length,measurements,validation},recoveryUrl:'/experiment-designs/'+runId+'/response.json'};
    write(path.join(out,'response.json'),response);
    return response;
  } finally {permitted.delete();domain.delete();}
}
module.exports={generatePolygonGallery};
