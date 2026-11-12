const fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert/strict'),T=require('three');
require('../proof/rule-amphitheater.cjs');
const {applyVoidFieldSpacing}=require('../src/components/voidFieldPopulation.ts');
const base=JSON.parse(fs.readFileSync('proof/fixtures/void-field-atrium.json'));
function worker(request,name){const out=path.resolve('proof/interactive-check/face-normal',name);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/request.json',JSON.stringify(request));const start=performance.now(),r=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',out+'/request.json',out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return {...JSON.parse(fs.readFileSync(out+'/result.json')),elapsedMs:Math.round(performance.now()-start)};}
function triangleHits(mesh,a,b){const origin=new T.Vector3(...a),end=new T.Vector3(...b),length=origin.distanceTo(end),ray=new T.Ray(origin,end.clone().sub(origin).normalize()),hit=new T.Vector3(),p=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let count=0;for(let i=0;i<mesh.indices.length;i+=3){for(let k=0;k<3;k++)p[k].fromArray(mesh.positions,mesh.indices[i+k]*3);if(ray.intersectTriangle(...p,false,hit)){const d=origin.distanceTo(hit);if(d>1e-8&&d<length-1e-8)count++;}}return count;}
(async()=>{
 const w=await require('manifold-3d/manifold.js').default();w.setup();const M=w.Manifold,CS=w.CrossSection;
 const solid=mesh=>new M(new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)})),rows=[];
 for(const spacing of [12,15]){
  const request={...structuredClone(base),source:applyVoidFieldSpacing(base.source,base.field,spacing),voidField:{...base.voidField,atriumBoundary:'open',facadeMode:'vertical'}};
  const before=worker(request,'vertical-'+spacing);request.voidField.facadeMode='face-normal';const after=worker(request,'native-'+spacing),result=solid(after.architecture);
  assert.deepEqual(after.request.source,before.request.source);assert.deepEqual(after.letters,before.letters);assert.deepEqual(after.voidFieldReport.floors,before.voidFieldReport.floors);
  assert.equal(after.validation.selfIntersectionPairs,0);assert(after.validation.passed);assert.equal(result.decompose().length,1);
  assert(Math.abs(result.subtract(M.cube([40,40,60]).translate([-20,-20,0])).volume())<1e-8);
  const facadeRows=[];
  for(const wall of after.boundaryReport.walls){
   const index=after.letters.findIndex(l=>l.id===wall.source),p=request.source[index],normal=new T.Vector3(0,0,1).applyEuler(new T.Euler(...[p.rx,p.ry,p.rz].map(T.MathUtils.degToRad),p.rotationOrder??'XYZ'));if(normal.z<0)normal.negate();assert(normal.distanceTo(new T.Vector3(...wall.normal))<1e-9);
   const sourceTriangles=[];const lm=after.letters[index].mesh;for(let k=0;k<lm.indices.length;k+=3)sourceTriangles.push(new T.Triangle(...[0,1,2].map(j=>new T.Vector3().fromArray(lm.positions,lm.indices[k+j]*3))));
   for(const probe of wall.trace){
    const roof=new T.Vector3(...probe.roof),direction=new T.Vector3(...probe.support).sub(roof).normalize();assert(direction.clone().cross(normal).length()<1e-8);assert(Math.abs(probe.support[2]-wall.supportZ)<1e-9);
    assert(Math.min(...sourceTriangles.map(t=>t.closestPointToPoint(roof,new T.Vector3()).distanceTo(roof)))<1e-5,'Roof cap must lie on actual source geometry');
   }
   const check=wall.translationCheck,dz=check.upperZ-check.lowerZ,expectedShift=[dz*normal.x/normal.z,dz*normal.y/normal.z];
   assert(Math.hypot(...expectedShift.map((v,i)=>v-check.expectedShift[i]))<1e-9);
   const field=CS.square([40,40]).translate([-20,-20]),expected=new CS(check.untrimmedLowerPolygons,'NonZero').translate(expectedShift).intersect(field),actual=solid(wall.mesh).slice(check.upperZ);
   const difference=expected.subtract(actual).area()+actual.subtract(expected).area(),perimeter=expected.toPolygons().reduce((total,poly)=>total+poly.reduce((sum,p,i)=>sum+Math.hypot(p[0]-poly[(i+1)%poly.length][0],p[1]-poly[(i+1)%poly.length][1]),0),0),float32AreaBound=Math.max(1e-5,perimeter*4e-6);
   assert(difference<float32AreaBound,'Actual façade section must translate along the independently derived face normal: '+wall.source+' '+difference);
   const prior=before.boundaryReport.walls.find(w=>w.source===wall.source);for(const c of prior.floorContacts.filter(c=>c.volume>1e-6))assert(wall.floorContacts.find(a=>a.floor===c.floor).volume>1e-6,'Lost existing floor contact '+wall.source+' '+c.floor);
   assert(wall.finalVolume>0);
   facadeRows.push({source:wall.source,normal:wall.normal,maximumPlanShift:wall.maximumPlanShift,fieldTrimVolume:wall.fieldTrimVolume,floorContactCount:wall.floorContacts.filter(c=>c.volume>1e-6).length,sectionDifferenceFt2:difference,float32AreaBound,roofProbes:wall.trace.length});
  }
  for(const floor of after.voidFieldReport.floors){const a=solid(before.components.find(c=>c.id===floor.id).mesh),b=solid(after.components.find(c=>c.id===floor.id).mesh);assert(Math.abs(a.subtract(b).volume())+Math.abs(b.subtract(a).volume())<1e-8,'Occupied floor geometry changed');}
  for(const v of after.voidFieldReport.voids)assert(Math.abs(result.intersect(solid(v.cutterMesh)).volume())<1e-8);
  const visibility=after.voidFieldReport.visibility;assert(visibility.passed);assert(visibility.crossLevel.every(p=>p.views.length>=2));
  let rays=0;for(const ray of [...visibility.floorViews.flatMap(f=>f.views),...visibility.crossLevel.flatMap(p=>p.views),...visibility.sky])for(const offset of visibility.bundleOffsets){assert.equal(triangleHits(after.architecture,ray.start.map((v,k)=>v+offset[k]),ray.end.map((v,k)=>v+offset[k])),0);rays++;}
  assert(after.contributions.every(c=>c.exposedArea>=1));
  rows.push({spacing,volumeBefore:before.volume,volumeAfter:after.volume,trianglesBefore:before.architecture.indices.length/3,trianglesAfter:after.architecture.indices.length/3,elapsedBefore:before.elapsedMs,elapsedAfter:after.elapsedMs,sourcePosesIdentical:true,sourceMeshesIdentical:true,floorsIdentical:true,facades:facadeRows,floorViews:visibility.floorViews.map(f=>f.portalCount),crossLevel:visibility.crossLevel.map(p=>p.views.length),skyPaths:visibility.sky.length,independentRays:rays,validation:after.validation});
 }
 const horizontal=structuredClone(base);horizontal.source=horizontal.source.map(p=>p.architecturalRole==='perimeter'?{...p,rx:0,ry:0}:p);// Flattening the control reduces source roof height; hold an explicit 40-ft atrium cap in both modes so the existing 4-ft visibility probes fit.
 horizontal.voidField={...horizontal.voidField,topZ:40,atriumBoundary:'open',facadeMode:'vertical'};
 const a=worker(horizontal,'horizontal-vertical');horizontal.voidField.facadeMode='face-normal';const b=worker(horizontal,'horizontal-native'),sa=solid(a.architecture),sb=solid(b.architecture),difference=Math.abs(sa.subtract(sb).volume())+Math.abs(sb.subtract(sa).volume());assert(difference<1e-8,'Horizontal sources must reproduce vertical façades.');
 const matrix=new T.Matrix4().makeRotationX(Math.PI/2);assert.throws(()=>require('./source-face-normal-facade.cjs').faceNormalWall(w,{id:'parallel-source',matrix:matrix.toArray()},[],base.field,0,null,[0,0]),/parallel to the horizontal support/);
 const report={passed:true,rows,horizontalControl:{symmetricDifferenceFt3:difference},parallelSupportRejected:true,thresholdsUnchanged:true};fs.mkdirSync('reports/face-normal',{recursive:true});fs.writeFileSync('reports/face-normal/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
