// Source-contour atrium bays and geometry-backed visibility witnesses.
// This validates sampled lines of sight, not daylight illuminance or circulation.
const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
const OFFSETS=[[0,0,0],[.025,0,0],[-.025,0,0],[0,.025,0],[0,-.025,0],[0,0,.025],[0,0,-.025]];
function trimPath(points,margin){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])),total=lengths.reduce((s,v)=>s+v,0);
 const start=Math.min(margin,total*.20),end=total-start,out=[];let distance=0;
 for(let i=0;i<lengths.length;i++){const length=lengths[i];if(length<1e-8)continue;const a=Math.max(0,(start-distance)/length),b=Math.min(1,(end-distance)/length);
  if(a<b){const point=t=>points[i].map((v,k)=>v+t*(points[i+1][k]-v));if(!out.length)out.push(point(a));out.push(point(b));}distance+=length;
 }
 return {points:out,length:end-start};
}
function buildAtriumBays(w,entry,occupied,floors,top){
 const CS=w.CrossSection,shape=getLetterShape(entry.node.p.letter),range={L:[2,4],U:[5,9],V:[1,3]}[entry.node.p.letter];
 const center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2()),matrix=new T.Matrix4().fromArray(entry.node.matrix);
 const transform=p=>{const q=new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(matrix);return [q.x-entry.origin[0],q.y-entry.origin[1]];};
 const paths=shape.curves.slice(...range).map((curve,i)=>({kind:'inner contour',curveIndex:range[0]+i,points:featurePoints({curves:[curve]},entry.node.p.scale*Math.max(entry.node.p.scaleX,entry.node.p.scaleY)).map(transform)}));
 const closure=entry.closure.addedEdges.map(p=>[p[0]-entry.origin[0],p[1]-entry.origin[1]]);
 for(let i=1;i<closure.length;i++)paths.push({kind:'resolved source-mouth closure',curveIndex:null,points:[closure[i-1],closure[i]]});
 const records=[],tools=[],galleryCandidates=[];
 for(const [index,path] of paths.entries()){
  const trimmed=trimPath(path.points,1.05),points=trimmed.points;if(points.length<2||trimmed.length<.65)continue;
  const quads=[],halfWidth=1.35;
  for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-6)continue;const normal=[(b[1]-a[1])/length,(a[0]-b[0])/length];quads.push(new CS([[a.map((v,j)=>v+normal[j]*halfWidth),b.map((v,j)=>v+normal[j]*halfWidth),b.map((v,j)=>v-normal[j]*halfWidth),a.map((v,j)=>v-normal[j]*halfWidth)]],'NonZero'));if(k<points.length-1)quads.push(CS.circle(halfWidth,32).translate(b));}
  const plan=CS.union(quads),k=Math.max(1,Math.floor(points.length/2)),a=points[k-1],b=points[k],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],normal=[(b[1]-a[1])/length,(a[0]-b[0])/length];
  const test=mid.map((v,j)=>entry.origin[j]+v+normal[j]*.08);
  if(entry.cs.intersect(CS.circle(.015,12).translate(test)).area()>1e-6){normal[0]*=-1;normal[1]*=-1;}
  const neighbor=occupied.slice().sort((a,b)=>Math.hypot(a.p.x-entry.origin[0]-mid[0],a.p.y-entry.origin[1]-mid[1])-Math.hypot(b.p.x-entry.origin[0]-mid[0],b.p.y-entry.origin[1]-mid[1]))[0];
  for(const [level,floor] of floors.entries()){
   const bottom=floor.topZ+.25,ceiling=Math.min(level+1<floors.length?floors[level+1].bottomZ-.15:top-.20,top-.20);
   if(ceiling-bottom<1)throw Error('Atrium bay has insufficient height above '+floor.id+'.');
   const {at}=entry.development;
   const loft=(profile,lo,hi)=>profile.scale(at(lo)).extrude(hi-lo,0,0,[at(hi)/at(lo),at(hi)/at(lo)]).translate([entry.origin[0],entry.origin[1],lo]);
   const solid=loft(plan,bottom,ceiling),id='atrium-'+entry.node.id+'-'+level+'-'+index;
   const record={id,source:entry.node.id,neighbor:neighbor.id,floor:floor.id,sourceBoundary:path.kind,curveIndex:path.curveIndex,sourcePath:path.points.map(p=>[p[0]+entry.origin[0],p[1]+entry.origin[1],entry.node.p.z+entry.fieldHeight/2]),width:trimmed.length,bottomZ:bottom,topZ:ceiling,edgeRise:.25,cutterMesh:pack(solid),status:'cut'};
   tools.push({id,source:entry.node.id,solid,cuttingSolid:loft(plan.offset(.001,'Round',2,32),bottom-.001,ceiling+.001),width:trimmed.length,height:ceiling-bottom,depth:halfWidth*2,alcove:false});
   records.push(record);
   for(const setback of [1.05,1.25,1.5,1.75]){
    const xy=mid.map((v,j)=>entry.origin[j]+v*at(floor.topZ+4)+normal[j]*setback),inside=mid.map((v,j)=>entry.origin[j]+v*at(floor.topZ+4)-normal[j]*.55);
    galleryCandidates.push({floor:floor.id,level,portal:id,source:entry.node.id,neighbor:neighbor.id,eye:[...xy,floor.topZ+4],foot:[...xy,(floor.bottomZ+floor.topZ)/2],inside:[...inside,floor.topZ+4],setback});
   }
  }
 }
 return {tools,records,galleryCandidates};
}
function bundleClear(solid,a,b){return OFFSETS.every(offset=>solid.rayCast(a.map((v,k)=>v+offset[k]),b.map((v,k)=>v+offset[k])).length===0);}
function validateAtriumViews(w,solid,entry,floors,bays,field,{required=true}={}){
 const M=w.Manifold,core=entry.development.cutter;
 const usable=bays.galleryCandidates.filter(c=>{
  const foot=M.cube([.12,.12,.12],true).translate(c.foot),eye=M.cube([.05,.05,.05],true).translate(c.eye);
  return foot.subtract(solid).volume()<1e-9&&Math.abs(eye.intersect(solid).volume())<1e-9&&bundleClear(solid,c.eye,c.inside)&&core.rayCast(c.eye,c.inside).length>0;
 });
 const floorViews=floors.map(f=>{const points=usable.filter(c=>c.floor===f.id),portals=[...new Set(points.map(c=>c.portal))];return {floor:f.id,floorZ:f.topZ,portalCount:portals.length,views:portals.map(id=>points.find(c=>c.portal===id)).map(c=>({portal:c.portal,start:c.eye,end:c.inside,foot:c.foot,source:c.source,neighbor:c.neighbor}))};});
 const crossLevel=[];
 for(let level=0;level<floors.length-1;level++)for(let upperLevel=level+1;upperLevel<floors.length;upperLevel++){
  const lower=usable.filter(c=>c.level===level),upper=usable.filter(c=>c.level===upperLevel),views=[];
  for(const a of lower)for(const b of upper){
   if(views.length>=3)break;
   if(a.portal.split('-').at(-1)===b.portal.split('-').at(-1)||Math.hypot(a.eye[0]-b.eye[0],a.eye[1]-b.eye[1])<3)continue;
   if(views.some(v=>v.lowerPortal===a.portal&&v.upperPortal===b.portal))continue;
   const hits=core.rayCast(a.eye,b.eye);if(hits.length<2||Math.hypot(...hits.at(-1).position.map((v,k)=>v-hits[0].position[k]))<2)continue;
   if(bundleClear(solid,a.eye,b.eye))views.push({lowerPortal:a.portal,upperPortal:b.portal,start:a.eye,end:b.eye,lowerFoot:a.foot,upperFoot:b.foot,throughVoid:entry.node.id,clear:true});
  }
  crossLevel.push({lowerFloor:floors[level].id,upperFloor:floors[upperLevel].id,views});
 }
 const sky=[];
 for(const dx of [0,-.15,.15]){
  const start=[entry.origin[0]+dx,entry.origin[1],floors[0].topZ+4],end=[start[0],start[1],field.height+.5];
  if(core.rayCast([start[0],start[1],-1],end).length>=2&&bundleClear(solid,start,end))sky.push({start,end,clear:true});
 }
 const passed=floorViews.every(f=>f.portalCount>=2)&&crossLevel.every(p=>p.views.length>=2)&&sky.length>=1;
 const report={passed,source:entry.node.id,probeHeight:4,bundleOffsets:OFFSETS,floorViews,crossLevel,sky,daylightPerformanceVerified:false,guardingAndCirculationVerified:false,method:'Actual exported-solid ray bundles. Endpoints are above complete 0.12-ft material witnesses in floor slabs; cross-level segments traverse at least 2 ft of the primary source void.',limitations:['Sampled geometric visibility only; no illuminance, structural, guard, occupancy, or access certification.','Quarter-foot conceptual floor-edge upstands are not a guard design.']};
 if(required&&!passed)throw Error('Open atrium sightlines failed: '+JSON.stringify({floors:floorViews.map(f=>f.portalCount),crossLevel:crossLevel.map(c=>c.views.length),sky:sky.length}));
 return report;
}
module.exports={buildAtriumBays,validateAtriumViews,bundleClear};
