require('./ts-test-register.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {buildVoidEdgeGuides,voidEdgeFittingRotations,voidEdgePlate}=require('../src/components/workspace-rules/void-edge-plate.ts');
const {voidEdgeAutoRotation,voidEdgeBaseRotations,voidEdgeMainGuideSizes,voidEdgeRules}=require('../src/components/workspace-rules/void-edge-workspace.rules.ts');
const {intersectFootprints}=require('../src/components/workspace-rules/void-edge-planar.ts');
const {workspaceDualReports}=require('../src/components/workspaceDualRulesets.ts');
const {derive:deriveSource}=require('./source-envelope.cjs');
const T=require('three'),{getLetterShape}=require('../src/components/letterGeometry3d.ts');
const u=getLetterShape('U'),bend=new T.CurvePath();
bend.add(u.curves[1]);
bend.add(u.curves[2]);
const center=new T.Box2().setFromPoints(u.getPoints(16)).getCenter(new T.Vector2());
const bendEnds=[bend.getPointAt(1/3).sub(center),bend.getPointAt(2/3).sub(center)];
const bendApex=bend.getPointAt(0.5).sub(center);
const derive=request=>deriveSource({...request,generator:'workspace-ten-rule',workspaceTypology:'void-edge-workspace'},{lettersOnly:true});
const stablePlan=plan=>({...plan,checks:plan.checks.filter(check=>check.label!=='Saved guide recovery')});
const arcLength=arc=>arc.slice(1).reduce((length,p,i)=>length+Math.hypot(p[0]-arc[i][0],p[1]-arc[i][1]),0);
const edgeLength=profile=>arcLength(profile.slice(0,profile.length/2));
function assertHalfPerimeter(plan){
 for(const plate of plan.plates.filter(p=>p.role==='ground'||p.role==='mezzanine')){
  const spans=plan.plates.filter(p=>p.role==='wall'&&p.loft?.receiverIds?.includes(plate.id)).map(p=>
   edgeLength(p.loft.receiverIds[0]===plate.id?p.polygon:p.loft.upperPolygon));
  if(!spans.length)continue;
  assert.equal(spans.length,4);
  const perimeter=arcLength([...plate.polygon,plate.polygon[0]]);
  assert(Math.abs(spans.reduce((total,span)=>total+span,0)/perimeter-.5)<=1e-5,plate.id+' should have 50% wall coverage');
 }
}
const heights=voidEdgeRules.field.sizes;
const endGuides=source=>source.filter(p=>!p.voidEdgeRole&&(p.voidEdgePlateDatum===0||p.voidEdgePlateDatum==='roof'));
for(const from of heights){
 const field={width:40,depth:40,height:from};
 const initial=voidEdgePlate(buildVoidEdgeGuides(field,30,20,15),field);
 assert.deepEqual(voidEdgeMainGuideSizes(initial.placements),{topSize:30,sideSize:20});
 for(const to of heights.filter(height=>height!==from)){
  const changed=voidEdgePlate(initial.placements,{...field,height:to});
  const before=endGuides(initial.placements),after=endGuides(changed.placements);
  assert.deepEqual(after,before.map(p=>({...p,z:p.z+(to-from)/2*(p.voidEdgePlateDatum===0?-1:1)})));
  assert.equal(changed.officePlan.plates.filter(p=>['ground','mezzanine','roof'].includes(p.role)).length,to/10+1);
  for(const report of Object.values(workspaceDualReports(changed.officePlan))){
   assert.equal(report.rules.length,10);
   assert(!report.rules.some(rule=>rule.status==='fail'));
  }
 }
}
{
 const field={width:40,depth:40,height:40};
 const saved=voidEdgePlate(buildVoidEdgeGuides(field,26,19),field).placements;
 const edited=saved.map(p=>!p.voidEdgeRole&&p.voidEdgePlateDatum===0?{...p,z:p.z+.1}:p);
 const resized=voidEdgePlate(edited,{...field,height:20,voidEdgeSourceHeight:40});
 assert.equal(endGuides(resized.placements)[0].z,endGuides(edited)[0].z+10);
 assert.deepEqual(voidEdgeMainGuideSizes(resized.placements),{topSize:26,sideSize:19});
 const legacy=voidEdgePlate(buildVoidEdgeGuides(field,25),field);
 assert.deepEqual(voidEdgeMainGuideSizes(legacy.placements),{topSize:25,sideSize:voidEdgeRules.guides.mainSide.defaultSize});
 const rectangular={width:40,depth:60,height:20};
 const fitting=voidEdgeFittingRotations(rectangular,30,20);
 assert.equal(fitting.length,4);
 for(const [seed,angle] of voidEdgeBaseRotations.entries()){
  const selected=voidEdgeAutoRotation(fitting,seed);
  assert(fitting.includes(selected));
  if(fitting.includes(angle))assert.equal(selected,angle,'Auto keeps a seed angle that already fits');
 }
 assert.deepEqual(voidEdgeFittingRotations({...rectangular,width:20,depth:20},30,20),[]);
 assert.deepEqual(voidEdgeFittingRotations({...rectangular,height:40},25,20),voidEdgeBaseRotations);
}
for(const height of [20,40,60])for(const baseRotation of [15,45,90]){
 const field={width:40,depth:40,height};
 const r=voidEdgePlate(buildVoidEdgeGuides(field,30,20,baseRotation),field);
 const guides=r.placements.filter(p=>!p.voidEdgeRole);
 const coreGuides=r.placements.filter(p=>p.voidEdgeRole==='core');
 const step=height===20?90:height===40?45:30;
 const mainDatums=Array.from({length:height/10},(_,i)=>i*10);
 assert.deepEqual(guides.map(p=>p.voidEdgePlateDatum),[...mainDatums,'roof'].flatMap(datum=>Array(4).fill(datum)));
 assert.deepEqual(guides.filter((p,i)=>i%4===0).map(p=>p.voidEdgeRotation),[...mainDatums.map(datum=>baseRotation+step*datum/10),baseRotation]);
 const coreDatums=mainDatums.slice(1);
 const extrusionDatums=coreDatums.filter((_,i)=>i%2===0);
 assert.deepEqual(coreGuides.map(p=>p.voidEdgePlateDatum),coreDatums.flatMap(datum=>Array(4).fill(datum)));
 for(const guide of coreGuides)assert.equal(guide.z+height/2,guide.voidEdgePlateDatum+.375);
 const cores=r.officePlan.plates.filter(p=>p.role==='support');
 const walls=r.officePlan.plates.filter(p=>p.role==='wall');
 const columns=r.officePlan.plates.filter(p=>p.role==='column');
 const columnGuides=r.placements.filter(p=>p.voidEdgeRole==='column');
 const wallDatums=mainDatums.filter((_,i)=>i%2===0);
 const sides=['bottom','top','left','right'];
 assert.deepEqual(walls.map(p=>p.id),wallDatums.flatMap(datum=>sides.map(side=>`outer-edge-${datum}-${side}`)));
 assert.deepEqual(columns.map(p=>p.id),wallDatums.flatMap(datum=>[1,2,3,4].map(index=>`core-end-column-${datum}-${index}`)));
 assert.deepEqual(columnGuides.map(p=>p.voidEdgePlateDatum),wallDatums.flatMap(datum=>[datum+10,datum,datum+10,datum,datum+10,datum,datum+10,datum]));
 assert(columnGuides.every(p=>p.letter==='L'&&p.scale===1));
 for(const [i,column] of columns.entries()){
  const guide=columnGuides[2*i],lowerGuide=columnGuides[2*i+1],datum=wallDatums[Math.floor(i/4)];
  assert(Math.abs(lowerGuide.rz-guide.rz-45)<1e-8);
  assert.deepEqual([lowerGuide.x,lowerGuide.y],[guide.x,guide.y]);
  const upper=coreGuides.filter(p=>p.voidEdgePlateDatum===datum+10);
  const u=upper[Math.floor(i%4/2)];
  const tip=new T.Vector2(i%2===0?-.42:.42,.45).sub(center).multiplyScalar(u.scale)
   .rotateAround(new T.Vector2(),T.MathUtils.degToRad(u.rz)).add(new T.Vector2(u.x,u.y));
  const radial=new T.Vector2(Math.cos(T.MathUtils.degToRad(guide.rz)),Math.sin(T.MathUtils.degToRad(guide.rz)));
  const profile=column.loft.upperPolygon;
  const inner=profile[0].map((p,j)=>(p+profile[3][j])/2);
  const shift=new T.Vector2(...inner).sub(tip);
  assert(Math.abs(shift.cross(radial))<1e-7&&shift.dot(radial)>=-1e-7,'Each column tracks the outer U tip on the same radial line');
  assert.equal(column.thickness,10);
  assert.equal(column.zTop,guide.z);
  assert.equal(column.zTop-column.thickness,lowerGuide.z);
  const angle=Math.PI/4;
  for(const [corner,point] of profile.entries()){
   const expected=new T.Vector2(...point).rotateAround(new T.Vector2(guide.x,guide.y),angle);
   assert(expected.distanceTo(new T.Vector2(...column.polygon[corner]))<1e-8);
  }
 }
 const verticalGuides=r.placements.filter(p=>p.voidEdgeRole==='wall');
 assert.deepEqual(verticalGuides.map(p=>p.voidEdgeWallId),walls.map(w=>w.id));
 assert(verticalGuides.every(p=>p.ry===-90&&p.rotationOrder==='ZYX'&&p.scale===2));
 assertHalfPerimeter(r.officePlan);
 assert(edgeLength(walls[0].polygon)>edgeLength(walls[2].polygon),'The end U should still span more than the side U');
 for(const [i,wall] of walls.entries()){
  const datum=wallDatums[Math.floor(i/4)],lowerGuide=i%4;
  assert.equal(wall.thickness,10);
  assert.equal(wall.loft.wallThickness,1.5);
  assert.equal(wall.zTop-wall.thickness+height/2,datum);
  const guide=verticalGuides[i];
  const rotation=new T.Quaternion().setFromEuler(new T.Euler(0,-Math.PI/2,T.MathUtils.degToRad(guide.rz),guide.rotationOrder));
  const anchor=new T.Vector3(bendApex.x*guide.scale*guide.scaleX,bendApex.y*guide.scale*guide.scaleY,0)
   .applyQuaternion(rotation).add(new T.Vector3(guide.x,guide.y,guide.z));
  const station=(wall.polygon.length/2-1)/2;
  const a=wall.polygon[station],b=wall.loft.upperPolygon[station];
  const {axis,offsets}=wall.loft.verticalBow;
  const depth=offsets[(offsets.length-1)/2];
  const face=new T.Vector3((a[0]+b[0])/2+axis[0]*depth,(a[1]+b[1])/2+axis[1]*depth,
   wall.zTop-(wall.thickness-wall.loft.lowerSeat)/2);
  assert(anchor.distanceTo(face)<1e-8,'The outside U bend must touch the exterior wall face at mid-height');
  const upperGuide=[2,3,1,0][lowerGuide];
  const endpoints=[[datum,lowerGuide,wall.polygon],[datum+10,upperGuide,wall.loft.upperPolygon]];
  for(const [level,guide,profile] of endpoints){
   const plate=r.officePlan.plates.find(p=>p.id===(level===0?'u-derived-floor':`u-derived-level-${level}`));
   const p=guides.filter(p=>p.voidEdgePlateDatum===level)[guide];
   const angle=p.rz*Math.PI/180;
   const midpoint=plate.polygon[plate.polygon.length/2];
   const cx=(plate.polygon[0][0]+midpoint[0])/2,cy=(plate.polygon[0][1]+midpoint[1])/2;
   const arc=profile.slice(0,profile.length/2);
   for(const [i,end] of [arc[0],arc.at(-1)].entries()){
    const x=bendEnds[i].x*p.scale*p.scaleX,y=bendEnds[i].y*p.scale*p.scaleY;
    const dx=p.x+x*Math.cos(angle)-y*Math.sin(angle)-cx,dy=p.y+x*Math.sin(angle)+y*Math.cos(angle)-cy;
    const turn=dx*(end[1]-cy)-dy*(end[0]-cx);
    assert(i===0?turn<0:turn>0,'Both wall ends should reach beyond the original middle-third U bend');
    assert(dx*(end[0]-cx)+dy*(end[1]-cy)>0);
    assert(plate.polygon.some(([a,b],j)=>{
     const [nextX,nextY]=plate.polygon[(j+1)%plate.polygon.length];
     const ex=nextX-a,ey=nextY-b,x=end[0]-a,y=end[1]-b;
     return Math.abs(ex*y-ey*x)<1e-7&&ex*x+ey*y>=-1e-7&&ex*x+ey*y<=ex*ex+ey*ey+1e-7;
    }),'The bend projects to the actual receiving perimeter');
   }
   for(let s=1;s<arc.length;s++){
    const a=arc[s-1],b=arc[s],inner=profile[profile.length-s];
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const thickness=(dx*(inner[1]-a[1])-dy*(inner[0]-a[0]))/Math.hypot(dx,dy);
    assert(Math.abs(thickness-1.5)<1e-6);
   }
  }
 }
 assert.deepEqual(cores.map(p=>p.id),extrusionDatums.map(datum=>`elliptical-core-${datum}`));
 assert.deepEqual(r.officePlan.voids.map(hole=>hole.plateIds),coreDatums.map((datum,i)=>[
  `u-derived-level-${datum}`,...(i%2===0?[`elliptical-core-${datum}`]:[]),
 ]));
 for(const [i,core] of cores.entries()){
  assert.equal(core.zTop-core.thickness+height/2,extrusionDatums[i]);
  assert(Math.abs(core.zTop+height/2-Math.min(extrusionDatums[i]+10,height-.05))<1e-8);
 }
 assert.deepEqual(r.officePlan.plates[0].polygon,r.officePlan.plates.find(p=>p.role==='roof').polygon);
 assert.deepEqual(stablePlan(voidEdgePlate(r.placements,field).officePlan),stablePlan(r.officePlan));
 assert.deepEqual(voidEdgePlate(r.placements,field).placements,r.placements);
 const legacySource=r.placements.filter(p=>p.voidEdgeRole==='core'
  ?extrusionDatums.includes(p.voidEdgePlateDatum)
  :!p.voidEdgeRole&&!extrusionDatums.includes(p.voidEdgePlateDatum));
 const regenerated=voidEdgePlate(legacySource,field);
 assert.deepEqual(regenerated.placements,r.placements,'Regeneration must restore missing main and core U groups');
 assert.deepEqual(stablePlan(regenerated.officePlan),stablePlan(r.officePlan));
 const reports=workspaceDualReports(r.officePlan);
 assert.equal(reports.letterArrangement.rules.length,10);
 assert(reports.letterArrangement.rules.every(rule=>rule.status==='pass'));
 assert.deepEqual(reports.architecturalGeneration.rules.map(rule=>rule.status),[...Array(9).fill('pass'),'unverified']);
 const reference=voidEdgePlate(buildVoidEdgeGuides(field,30,20),field);
 const angle=baseRotation*Math.PI/180;
 const actualCore=cores[0].polygon;
 const referenceCore=reference.officePlan.plates.find(p=>p.role==='support').polygon;
 for(let i=0;i<actualCore.length;i++){
  const [x,y]=referenceCore[i];
  assert(Math.hypot(actualCore[i][0]-(x*Math.cos(angle)-y*Math.sin(angle)),actualCore[i][1]-(x*Math.sin(angle)+y*Math.cos(angle)))<1e-7);
 }
 assert(coreGuides.every(p=>p.voidEdgeRotation===baseRotation));
 derive({field,source:r.placements,envelopeVersion:'workspace-ten-rule'});
}
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
function meshVolume({indices,positions}){
 let volume=0;
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  volume+=positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])
   +positions[a+1]*(positions[b+2]*positions[c]-positions[b]*positions[c+2])
   +positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c]);
 }
 return Math.abs(volume)/6;
}
for(const topSize of [12,15,20])for(const sideSize of [10,12,15]){
 const field={width:40,depth:40,height:60,voidEdgeCore:{topSize,sideSize}};
 const r=voidEdgePlate(buildVoidEdgeGuides(field,30,25),field);
 assert.equal(r.officePlan.voids.length,5);
 const core=r.officePlan.plates.find(p=>p.role==='support');
 for(let i=0;i<core.polygon.length;i++)assert(Math.abs(Math.hypot(core.polygon[i][0]-r.officePlan.voids[0].polygon[i][0],core.polygon[i][1]-r.officePlan.voids[0].polygon[i][1])-1.5)<1e-8);
 const coreGuides=r.placements.filter(p=>p.voidEdgeRole==='core');
 for(const datum of [10,20,30,40,50]){
  assert.deepEqual(coreGuides.filter(p=>p.voidEdgePlateDatum===datum).map(p=>p.scale),[topSize,topSize,sideSize,sideSize]);
 }
 const legacyCore=coreGuides.slice(0,4).map(({voidEdgePlateDatum,...p})=>({...p,z:-field.height/2+.375}));
 const legacySource=[...r.placements.filter(p=>!p.voidEdgeRole),...legacyCore];
 const legacyRegeneration=voidEdgePlate(legacySource,{width:field.width,depth:field.depth,height:field.height});
 assert.deepEqual(legacyRegeneration.placements,r.placements,'A saved floor core must migrate with its original sizes');
 derive({field,source:r.placements,envelopeVersion:'workspace-ten-rule'});
}
assert.throws(()=>voidEdgePlate(buildVoidEdgeGuides({width:40,depth:40,height:20},20,15),{width:40,depth:40,height:20,voidEdgeCore:{topSize:30,sideSize:25}}),/core must fit/);
for(const height of [20,40,60]){
 const field={width:40,depth:40,height};
 const result=voidEdgePlate(buildVoidEdgeGuides(field,30,20),field);
 const levels=result.officePlan.plates.filter(p=>p.role==='ground'||p.role==='mezzanine');
 assert.equal(levels.length,height/10);
 assert.deepEqual(levels.map(p=>p.zTop+height/2-.75),Array.from({length:height/10},(_,i)=>i*10));
 assert.equal(result.placements.length,(height/10+1)*4+(height/10-1)*4+height/20*12);
 const rotations=height===20?[90]:height===40?[45,90,135]:[30,60,90,120,150];
 for(const [i,rotation] of rotations.entries()){
  const datum=(i+1)*10;
  const group=result.placements.filter(p=>!p.voidEdgeRole&&p.voidEdgePlateDatum===datum);
  assert.equal(group.length,4);
  assert(group.every(p=>p.voidEdgeRotation===rotation));
  const radians=rotation*Math.PI/180;
  const expected=levels[0].polygon.map(([x,y])=>[x*Math.cos(radians)-y*Math.sin(radians),x*Math.sin(radians)+y*Math.cos(radians)]);
  const actual=levels[i+1].polygon;
  for(let j=0;j<expected.length;j++)assert(Math.hypot(expected[j][0]-actual[j][0],expected[j][1]-actual[j][1])<1e-7);
 }
 const baseCore=voidEdgePlate(buildVoidEdgeGuides({...field,height:20},30,20),{...field,height:20}).officePlan.plates.find(p=>p.role==='support');
 for(const core of result.officePlan.plates.filter(p=>p.role==='support'))assert.deepEqual(core.polygon,baseCore.polygon);
 derive({field,source:result.placements,envelopeVersion:'workspace-ten-rule'});
 assert.deepEqual(stablePlan(voidEdgePlate(result.placements,field).officePlan),stablePlan(result.officePlan),'Regeneration must retain the layers');
}
{
 const field={width:40,depth:40,height:60,voidEdgeCore:{topSize:10,sideSize:8}};
 const original=voidEdgePlate(buildVoidEdgeGuides(field,30,20),field);
 const columns=plan=>plan.plates.filter(p=>p.role==='column');
 for(const size of [1,2,3,2.5]){
  const resized=voidEdgePlate(original.placements,{...field,voidEdgeColumnSize:size});
  assert(resized.placements.filter(p=>p.voidEdgeRole==='column').every(p=>p.scale===size));
  assert.deepEqual(resized.officePlan.plates.filter(p=>p.role!=='column'),original.officePlan.plates.filter(p=>p.role!=='column'));
  assert.deepEqual(resized.officePlan.voids,original.officePlan.voids);
  assert.deepEqual(columns(resized.officePlan).map(p=>p.columnReceivers),columns(original.officePlan).map(p=>p.columnReceivers));
  assert(columns(resized.officePlan).every(p=>Math.abs(area(p.polygon)-.84*.90*size*size)<1e-7));
  for(const column of columns(resized.officePlan)){
   for(const [index,id] of column.columnReceivers.entries()){
    const profile=index===0?column.polygon:column.loft.upperPolygon;
    const openings=resized.officePlan.voids.filter(hole=>hole.plateIds.includes(id));
    assert(openings.every(hole=>area(intersectFootprints(profile,hole.polygon))<1e-7));
   }
  }
  assert.deepEqual(columns(voidEdgePlate(resized.placements,field).officePlan),columns(resized.officePlan));
 }
 assert.throws(()=>voidEdgePlate(original.placements,{...field,voidEdgeColumnSize:0}),/column L size of at least/);
 assert.throws(()=>voidEdgePlate(original.placements,{...field,voidEdgeColumnSize:30}),/Reduce the column L size/);
 const wall=original.officePlan.plates.find(p=>p.role==='wall');
 for(const size of [4,8,6.5]){
  const tuned=voidEdgePlate(original.placements,{...field,voidEdgeWallGuide:{size,direction:'outward'}});
  assertHalfPerimeter(tuned.officePlan);
  assert.deepEqual(tuned.placements.filter(p=>p.voidEdgeRole!=='wall'),original.placements.filter(p=>p.voidEdgeRole!=='wall'));
  assert(tuned.placements.filter(p=>p.voidEdgeRole==='wall').every(p=>p.scale===size));
  const changed=tuned.officePlan.plates.find(p=>p.id===wall.id);
  assert.deepEqual(changed.polygon,wall.polygon);
  assert.deepEqual(changed.loft.upperPolygon,wall.loft.upperPolygon);
  assert(changed.loft.verticalBow.axis.every((value,i)=>Math.abs(value+wall.loft.verticalBow.axis[i])<1e-8));
  assert.equal(changed.loft.verticalBow.offsets[0],0);
  assert.equal(changed.loft.verticalBow.offsets.at(-1),0);
  assert(Math.abs(Math.max(...changed.loft.verticalBow.offsets)-0.4*size)<1e-6);
 }
 const thicker=voidEdgePlate(original.placements,{...field,voidEdgeOuterWallThickness:2.25});
 assert.deepEqual(thicker.placements,original.placements);
 assert.deepEqual(thicker.officePlan.plates.filter(p=>p.role!=='wall'),original.officePlan.plates.filter(p=>p.role!=='wall'));
 assert.deepEqual(thicker.officePlan.voids,original.officePlan.voids);
 assert(thicker.officePlan.plates.filter(p=>p.role==='wall').every(p=>p.loft.wallThickness===2.25));
 const edited=original.placements.map(p=>p.voidEdgeRole==='core'&&p.voidEdgePlateDatum===20?{...p,x:p.x+2}:p);
 const regenerated=voidEdgePlate(edited,field);
 assert.deepEqual(regenerated.placements.filter(p=>p.voidEdgeRole!=='column'),edited.filter(p=>p.voidEdgeRole!=='column'));
 assert.deepEqual(regenerated.officePlan.plates.filter(p=>p.role!=='column'),original.officePlan.plates.filter(p=>p.role!=='column'));
 assert.deepEqual(regenerated.officePlan.voids.filter((hole,i)=>i!==1),original.officePlan.voids.filter((hole,i)=>i!==1));
 assert.notDeepEqual(regenerated.officePlan.voids[1].polygon,original.officePlan.voids[1].polygon);
 for(const [i,[x,y]] of original.officePlan.voids[1].polygon.entries()){
  const [shiftedX,shiftedY]=regenerated.officePlan.voids[1].polygon[i];
  assert(Math.hypot(shiftedX-x-2,shiftedY-y)<1e-8);
 }
 const shifted=voidEdgePlate(original.placements.map(p=>p.voidEdgeRole==='core'&&p.voidEdgePlateDatum===30?{...p,x:p.x+.75}:p),field);
 const otherColumns=plan=>plan.plates.filter(p=>p.role==='column'&&!p.id.startsWith('core-end-column-20-'));
 assert.deepEqual(otherColumns(shifted.officePlan),otherColumns(original.officePlan));
 assert.notDeepEqual(shifted.officePlan.plates.filter(p=>p.id.startsWith('core-end-column-20-')),
  original.officePlan.plates.filter(p=>p.id.startsWith('core-end-column-20-')));
}
{
 const field={width:60,depth:60,height:60};
 const initial=voidEdgePlate(buildVoidEdgeGuides(field,30,15),field);
 const wallId='outer-edge-0-left';
 const wall=initial.officePlan.plates.find(p=>p.id===wallId);
 const editGuide=change=>voidEdgePlate(initial.placements.map((guide,index)=>index===2?{...guide,...change(guide)}:guide),field);
 const moved=editGuide(guide=>({y:guide.y+2}));
 const resized=editGuide(guide=>({scale:guide.scale*.8,scaleZ:guide.scaleZ/.8}));
 for(const result of [moved,resized]){
  assertHalfPerimeter(result.officePlan);
  assert.deepEqual(result.officePlan.plates.filter(p=>!p.id.startsWith('outer-edge-0-')),initial.officePlan.plates.filter(p=>!p.id.startsWith('outer-edge-0-')));
  for(const part of result.officePlan.plates.filter(p=>p.id.startsWith('outer-edge-0-'))){
   assert.deepEqual(part.loft.upperPolygon,initial.officePlan.plates.find(p=>p.id===part.id).loft.upperPolygon);
  }
 }
 assert.notDeepEqual(moved.officePlan.plates.find(p=>p.id===wallId).polygon,wall.polygon);
 assert(edgeLength(resized.officePlan.plates.find(p=>p.id===wallId).polygon)<edgeLength(wall.polygon));
}
for(const [size,sideSize] of [[20,undefined],[25,undefined],[30,undefined],...[20,25,30].flatMap(s=>[15,20,25].map(t=>[s,t]))]){
 const field={width:40,depth:40,height:20,voidEdgeCore:{topSize:10,sideSize:8}},source=buildVoidEdgeGuides(field,size,sideSize);
 assert.equal(source.length,sideSize===undefined?2:4);
 if(sideSize!==undefined){
  assert.deepEqual(source.slice(0,2),buildVoidEdgeGuides(field,size));
  assert.deepEqual(source.slice(2).map(p=>p.rz),[270,90]);
  const original=voidEdgePlate(source.slice(0,2),field).officePlan.plates[0].polygon;
  const widened=voidEdgePlate(source,field).officePlan.plates[0].polygon;
  const span=p=>Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0]));
  assert(span(widened)>=span(original));
 }
 derive({field,source,envelopeVersion:'workspace-ten-rule'});
 const old=source.map(p=>({...p,scaleZ:.75/(p.scale*.14)}));
 assert.throws(()=>derive({field,source:old,envelopeVersion:'workspace-ten-rule'}),/outside/);
 const arranged=voidEdgePlate(old,field),reports=workspaceDualReports(arranged.officePlan);
 assert.equal(arranged.placements.length,source.length*3+16);
 assert.equal(arranged.officePlan.plates.filter(p=>p.role==='ground'||p.role==='mezzanine'||p.role==='roof').length,3);
 assert.equal(arranged.officePlan.plates[1].zTop-arranged.officePlan.plates[0].zTop,10);
 for(let i=0;i<arranged.officePlan.plates[0].polygon.length;i++){
  const [x,y]=arranged.officePlan.plates[0].polygon[i],actual=arranged.officePlan.plates[1].polygon[i];
  assert(Math.hypot(actual[0]+y,actual[1]-x)<1e-7,'Middle plate must rotate exactly 90 degrees');
 }
 const roof=arranged.officePlan.plates.find(p=>p.role==='roof');
 assert.deepEqual(roof.polygon,arranged.officePlan.plates[0].polygon);
 assert.equal(roof.thickness,.75);
 assert.equal(roof.zTop,field.height/2-.05);
 const roofGuides=arranged.placements.filter(p=>p.voidEdgePlateDatum==='roof');
 for(let i=0;i<source.length;i++){
  const floorGuide=arranged.placements[i],roofGuide=roofGuides[i];
  assert.equal(roofGuide.x,floorGuide.x);assert.equal(roofGuide.y,floorGuide.y);
  assert.equal(roofGuide.rz,floorGuide.rz);assert.equal(roofGuide.scale,floorGuide.scale);
 }
 if(source.length===4){
  const edited=arranged.placements.map(p=>p.voidEdgePlateDatum==='roof'?{...p,x:p.x+.01}:p);
  const updated=voidEdgePlate(edited,field);
  assert.deepEqual(updated.officePlan.plates[0].polygon,arranged.officePlan.plates[0].polygon);
  assert.deepEqual(updated.officePlan.plates[1].polygon,arranged.officePlan.plates[1].polygon);
  assert.notDeepEqual(updated.officePlan.plates[2].polygon,roof.polygon);
 }
 const polygon=arranged.officePlan.plates[0].polygon;
 const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 const rx=(Math.max(...xs)-Math.min(...xs))/2,ry=(Math.max(...ys)-Math.min(...ys))/2;
 for(const [x,y] of polygon)assert(Math.abs(((x-cx)/rx)**2+((y-cy)/ry)**2-1)<1e-10,'Every boundary vertex must lie on one ellipse');
 let twiceArea=0;
 for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length];twiceArea+=p[0]*q[1]-q[0]*p[1];}
 assert(Math.abs(twiceArea/2-Math.PI*rx*ry)/(Math.PI*rx*ry)<.0002,'Plate area must approximate the analytic ellipse');
 derive({field,source:arranged.placements,envelopeVersion:'workspace-ten-rule'});
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'void-edge-regression-'));
 const request={generator:'workspace-ten-rule',envelopeVersion:'workspace-ten-rule',workspaceTypology:'void-edge-workspace',voidEdgeJoinShell:true,field,source:arranged.placements,workspacePlan:arranged.officePlan,letterArrangementReport:reports.letterArrangement,architecturalGenerationReport:reports.architecturalGeneration};
 const file=path.join(out,'request.json');fs.writeFileSync(file,JSON.stringify(request));
 const result=spawnSync(process.execPath,[path.join(__dirname,'amphitheater-interactive-worker.cjs'),file,out],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stderr||result.error?.message);
 const final=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
 for(const report of [final.letterArrangementReport,final.architecturalGenerationReport]){
  assert.equal(report.rules.length,10);
  assert.equal(report.overall,'pass');
  assert(report.rules.every(rule=>rule.status==='pass'&&rule.evidence.length>0));
 }
 assert.match(final.architecturalGenerationReport.rules.find(rule=>rule.id==='AG-08').evidence.join(' '),/All 4 exported walls reach both receiving plates/);
 assert.match(final.architecturalGenerationReport.rules.find(rule=>rule.id==='AG-08').evidence.join(' '),/2 plate connections: 50\.00%/);
 assert.match(final.architecturalGenerationReport.rules.find(rule=>rule.id==='AG-09').evidence.join(' '),/no volume overlap across 1 wall stories/);
 assert.match(final.architecturalGenerationReport.rules.find(rule=>rule.id==='AG-07').evidence.join(' '),/All 4 drop columns seat entirely on solid areas of both slabs/);
 assert.match(final.architecturalGenerationReport.rules.find(rule=>rule.id==='AG-07').evidence.join(' '),/4 columns: 45\.00°/);
 assert.match(final.architecturalGenerationReport.rules.find(rule=>rule.id==='AG-10').evidence.join(' '),/all 12 elements in the joined form/);
 const cores=arranged.officePlan.plates.filter(p=>p.role==='support');
 const slabs=arranged.officePlan.plates.filter(p=>p.role==='ground'||p.role==='mezzanine'||p.role==='roof');
 const walls=arranged.officePlan.plates.filter(p=>p.role==='wall');
 const columns=arranged.officePlan.plates.filter(p=>p.role==='column');
 assert.equal(walls.length,4);
 const innerArea=area(arranged.officePlan.voids[0].polygon);
 let expectedVolume=slabs.reduce((sum,p)=>sum+(area(p.polygon)-(p.role==='mezzanine'?innerArea:0))*p.thickness,0);
 let baseVolume=expectedVolume;
 for(const core of cores){
  const overlap=slabs.reduce((sum,plate)=>{
   const top=Math.min(plate.zTop,core.zTop);
   const bottom=Math.max(plate.zTop-plate.thickness,core.zTop-core.thickness);
   return sum+Math.max(0,top-bottom);
  },0);
  expectedVolume+=(area(core.polygon)-innerArea)*(core.thickness-overlap);
  const coreMesh=final.workspaceLayers.find(layer=>layer.id===core.id).mesh;
  const heights=coreMesh.positions.filter((_,i)=>i%3===2);
  assert(Math.abs(Math.min(...heights)-(core.zTop-core.thickness+field.height/2))<1e-5);
  assert(Math.abs(Math.max(...heights)-(core.zTop+field.height/2))<1e-5);
 }
 for(const wall of walls){
  const wallMesh=final.workspaceLayers.find(layer=>layer.id===wall.id).mesh;
  expectedVolume+=meshVolume(wallMesh)-area(wall.polygon)*wall.loft.lowerSeat;
  const heights=wallMesh.positions.filter((_,i)=>i%3===2);
  assert(Math.abs(Math.max(...heights)-Math.min(...heights)-10)<1e-5);
 }
 for(const column of columns){
  const [lower,upper]=column.columnReceivers.map(id=>slabs.find(plate=>plate.id===id));
  const mesh=final.workspaceLayers.find(layer=>layer.id===column.id).mesh;
  const volume=meshVolume(mesh);
  const slabOverlap=area(column.polygon)*lower.thickness/2+area(column.loft.upperPolygon)*upper.thickness/2;
  expectedVolume+=volume-slabOverlap;
  baseVolume+=volume-slabOverlap;
  assert(volume>area(column.polygon)*column.thickness*.85&&volume<area(column.polygon)*column.thickness);
 }
 assert(Math.abs(final.volume-expectedVolume)<expectedVolume*1e-5,'Slabs, hollow core and outer walls must have the expected combined volume');
 assert.equal(final.perimeterWalls,undefined,'Void-Edge architecture already includes its outer walls');
 assert.equal(final.workspaceLayers.length,arranged.officePlan.plates.length);
 assert.deepEqual(final.workspaceLayers.map(p=>p.role),arranged.officePlan.plates.map(p=>p.role));
 for(const layer of final.workspaceLayers)assert(layer.mesh.indices.length>0);
 if(size===30&&sideSize===20){
  const {studyOBJ}=require('../src/components/amphitheaterPresentationExport.ts');
  fs.writeFileSync(file,JSON.stringify({...request,voidEdgeJoinShell:false}));
  const splitRun=spawnSync(process.execPath,[path.join(__dirname,'amphitheater-interactive-worker.cjs'),file,out],{encoding:'utf8',timeout:60000});
  assert.equal(splitRun.status,0,splitRun.stderr||splitRun.error?.message);
  const split=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
  const shell=split.workspaceLayers.filter(layer=>layer.role==='support'||layer.role==='wall');
  assert.equal(split.architecturalGenerationReport.overall,'pass');
  assert.deepEqual(split.workspaceLayers,final.workspaceLayers);
  assert.equal(split.volume,final.volume);
  assert(Math.abs(meshVolume(split.architecture)-baseVolume)<baseVolume*1e-5,'The split base contains just slabs and columns');
  const objects=obj=>obj.split('\n').filter(line=>line.startsWith('o '));
  assert.deepEqual(objects(studyOBJ(final,'form')),['o architecture']);
  assert.deepEqual(objects(studyOBJ(split,'form')),['o architecture',...shell.map(layer=>'o '+layer.id)]);
 }
 console.log(`${size} ft / side ${sideSize??'legacy'}: complete worker generation and saved-guide recovery passed`);
}

async function checkIncompleteAssembly(){
 const wasm=await require('manifold-3d/manifold.js').default();
 wasm.setup();
 const {checkVoidEdgeAssembly}=require('../src/components/workspace-rules/void-edge-workspace.geometry.ts');
 const plan={plates:[{id:'floor',role:'ground'},{id:'wall',role:'wall'}]};
 const floor=wasm.Manifold.cube([4,4,1]);
 const wall=wasm.Manifold.cube([4,1,3]).translate([0,0,1]);
 const joined=wasm.Manifold.union([floor,wall]);
 const layers=new Map([['floor',floor],['wall',wall]]);
 try{
  assert.deepEqual(checkVoidEdgeAssembly(plan,layers,joined,null).failures,[]);
  assert.deepEqual(checkVoidEdgeAssembly(plan,layers,floor,null).failures,['wall is incomplete in the complete assembly.']);
  assert.deepEqual(checkVoidEdgeAssembly(plan,layers,joined,floor).failures,[]);
 }finally{joined.delete();wall.delete();floor.delete();}
 console.log('A valid assembly mesh missing a wall fails the join rule.');
}
checkIncompleteAssembly().catch(error=>{console.error(error);process.exitCode=1;});
