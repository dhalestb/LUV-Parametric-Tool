const T=require('three');
require('../proof/rule-amphitheater.cjs');
const {getLetterShape,getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const eps=1e-7,dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
function relationships(request,letters){
 const old=request.sourceSnapshot?.stations;
 if(!Array.isArray(old)||old.length!==letters.length)throw Error('Current sources need their approved exterior-edge identities.');
 const assignments=old.flatMap((a,i)=>[a,...(a.secondSide===undefined?[]:[{...a,side:a.secondSide,curveIndex:a.secondCurve}])].map(edge=>({edge,i})));
 const stations=assignments.map(({edge:assigned,i})=>{
  const item=letters[i];
  const pose=request.source[i];
  if(item.id!==assigned.id||pose.letter!==assigned.type)throw Error('Source identity changed; supply current edge assignments.');
  if(Math.abs(pose.rx)>eps||Math.abs(pose.ry)>eps)throw Error(item.id+': tilted source cannot define a horizontal gallery layer. Edited pose retained.');
  const allowed={L:[0,5],U:[0,3],V:[4,6]}[pose.letter];
  if(!allowed.includes(assigned.curveIndex))throw Error(item.id+': invalid exterior curve');
  const shape=getLetterShape(pose.letter),c=shape.curves[assigned.curveIndex],d=c.getPoint(1).sub(c.getPoint(0)),sign=Math.sign(T.ShapeUtils.area(shape.getPoints(32))),angle=pose.rz*Math.PI/180;
  const wanted=new T.Vector2(sign*d.y/(pose.scale*pose.scaleX),-sign*d.x/(pose.scale*pose.scaleY)).normalize().rotateAround(new T.Vector2(),angle);
  const mesh=item.mesh,geometry=getLetterVolumeGeometry(pose.letter,12),attr=geometry.getAttribute('position'),idx=geometry.index;
  let best=-Infinity,normal;
  for(let k=0;k<(idx?.count??attr.count);k+=3){
   const [a,b,c]=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(attr,idx?idx.getX(k+j):k+j));
   const n=b.sub(a).cross(c.sub(a)).normalize();
   if(Math.abs(n.z)>eps)continue;
   const v=new T.Vector2(n.x/(pose.scale*pose.scaleX),n.y/(pose.scale*pose.scaleY)).normalize().rotateAround(new T.Vector2(),angle),score=v.dot(wanted);
   if(score>best){best=score;normal=v;}
  }
  const n=[normal.x,normal.y].map(v=>Math.abs(v)<1e-6?0:v),norm=Math.hypot(...n);n[0]/=norm;n[1]/=norm;
  const tangent=[-n[1],n[0]],pts=Array.from({length:mesh.positions.length/3},(_,j)=>mesh.positions.slice(3*j,3*j+3)),face=Math.max(...pts.map(p=>dot(p,n))),flat=pts.filter(p=>Math.abs(dot(p,n)-face)<eps),ends=flat.map(p=>dot(p,tangent)),lo=Math.min(...ends),hi=Math.max(...ends);
  if(hi-lo<eps)throw Error(item.id+': exterior face has no valid length');
  const edge=[lo,hi].map(t=>[t*tangent[0]+face*n[0],t*tangent[1]+face*n[1]]),bottom=Math.min(...pts.map(p=>p[2])),top=Math.max(...pts.map(p=>p[2])),mid=request.field.height/2,zone=bottom>=mid-eps?'upper':'lower';
  if(zone==='lower'&&top>mid+eps)throw Error(item.id+': edited source crosses mid-height; pose retained');
  if(request.linearGallery.arrangementMode==='defined-levels'){
   const stagger=request.sourceSnapshot.roofAndReturns&&mid<25?mid/8:4;
   if(![-stagger,0,stagger].includes(pose.galleryElevationOffset))throw Error(item.id+': edited elevation conflicts with nominal level and selected offset; pose retained');
  }
  return {...assigned,sourceIndex:i,sourceId:item.id,id:assigned.secondSide===undefined?item.id:item.id+'-edge-'+assigned.curveIndex,level:pose.levelIndex,zone,edge,tangent,normal:n,bottom,top,lower:[],upper:[],joints:[],manualElevationDelta:pose.galleryNominalZ===undefined?0:bottom-pose.galleryNominalZ-pose.galleryElevationOffset,actualBoundary:face,pose:{...pose}};
 });
 const levels=[...new Set(stations.map(s=>s.level))].sort((a,b)=>a-b);
 if(request.linearGallery.arrangementMode!=='defined-levels'){
  for(let i=1;i<levels.length;i++){const low=stations.filter(s=>s.level===levels[i-1]),high=stations.filter(s=>s.level===levels[i]);if(low[0].zone!==high[0].zone)continue;const gap=Math.min(...high.map(s=>s.bottom))-Math.max(...low.map(s=>s.top));if(![5,10,15].some(v=>Math.abs(gap-v)<=eps))throw Error('Edited source gap '+gap+' ft is not 5, 10 or 15 ft. Poses retained.');}
 }
 for(const p of stations){
  let uncovered=[[dot(p.edge[0],p.tangent),dot(p.edge[1],p.tangent)]];
  p.spans=[];
  for(const q of stations.filter(s=>s.level>p.level&&s.bottom>p.top&&s.side===p.side&&dot(p.normal,s.normal)>1-eps).sort((a,b)=>a.bottom-b.bottom)){
   const next=[];
   for(const [a,b] of uncovered){
    const lo=Math.max(a,dot(q.edge[0],p.tangent)),hi=Math.min(b,dot(q.edge[1],p.tangent));
    if(hi<=lo+eps){next.push([a,b]);continue;}
    p.upper.push(q.id);q.lower.push(p.id);p.spans.push([lo,hi]);
    if(lo>a+eps)next.push([a,lo]);if(hi<b-eps)next.push([hi,b]);
   }
   uncovered=next;
  }
 }
 if(Math.abs(Math.min(...stations.filter(s=>s.zone==='upper').map(s=>s.bottom))-request.field.height/2)>eps)throw Error('Edited upper sources must begin at exact mid-height.');
 const layers=levels.map(level=>{
  const members=stations.filter(s=>s.level===level);
  const reference=request.sourceSnapshot.layers?.find(l=>l.level===level);
  const sides=[0,1,2,3].map(side=>{const st=members.find(s=>s.side===side);if(st)return {normal:st.normal,face:dot(st.edge[0],st.normal)};const a=reference.vertices[side],b=reference.vertices[(side+1)%4],d=Math.hypot(b[0]-a[0],b[1]-a[1]),normal=[(b[1]-a[1])/d,(a[0]-b[0])/d];return {normal,face:dot(a,normal)};});
  const vertices=sides.map((b,i)=>{const a=sides[(i+3)%4],det=a.normal[0]*b.normal[1]-a.normal[1]*b.normal[0];if(Math.abs(det)<eps)throw Error('Edited polygon has parallel neighboring sides');return [(a.face*b.normal[1]-a.normal[1]*b.face)/det,(a.normal[0]*b.face-a.face*b.normal[0])/det];});
  const area=Math.abs(vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%4];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
  return {level,zone:members[0].zone,polygonId:members[0].polygonId,occupiedEdges:members.map(s=>({id:s.id,edge:s.edge,normal:s.normal})),vertices,achieved:area,reference};
 });
 // Empty intervals are recalculated in each current side's coordinate frame.
 const empty=[];
 for(const layer of layers)for(const side of [0,1,2,3]){
  const onSide=stations.filter(s=>s.level===layer.level&&s.side===side);
  const reference=layer;
  if(!reference?.vertices)continue;
  const a=reference.vertices[side],b=reference.vertices[(side+1)%reference.vertices.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),t=[(b[0]-a[0])/length,(b[1]-a[1])/length];
  let cursor=0;
  const spans=onSide.map(s=>s.edge.map(p=>dot([p[0]-a[0],p[1]-a[1]],t))).map(s=>[Math.max(0,Math.min(...s)),Math.min(length,Math.max(...s))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  for(const [lo,hi] of spans){if(lo>cursor+eps)empty.push({polygonId:layer.polygonId,side,from:cursor,to:lo});cursor=Math.max(cursor,hi);}
  if(cursor<length-eps)empty.push({polygonId:layer.polygonId,side,from:cursor,to:length});
 }
 return {stations,layers,empty};
}
module.exports={relationships};

