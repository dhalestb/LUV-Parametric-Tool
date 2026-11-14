// Rigidly unfold copies of native letter edges onto a floor plane. Source poses
// are never changed. Each path retains its native length, corner angles and curves.
const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function nativePaths(nodes,role){
 return nodes.map(n=>{
  const shape=getLetterShape(n.p.letter),center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2()),matrix=new T.Matrix4().fromArray(n.matrix);
  const axis=new T.Vector3(n.p.letter==='U'?0:1,n.p.letter==='U'?1:0,0).transformDirection(matrix);
  const length=Math.hypot(axis.x,axis.y);if(length<.001)throw Error('Native contour has no stable horizontal heading at '+n.id);
  const u=[axis.x/length,axis.y/length],v=[-u[1],u[0]];
  const curves=n.p.letter==='U'?(role==='inner'?[6,7]:[1,2]):n.p.letter==='L'?(role==='inner'?[2,3]:[5,0]):role==='inner'?[1,2]:[4,5,6];
  const source=[],plan=[],local=[];
  for(const i of curves){const c=shape.curves[i],steps=c.type==='LineCurve'?1:40;for(let k=0;k<=steps;k++){
   const q=c.getPoint(k/steps),x=(q.x-center.x)*n.p.scale*n.p.scaleX,y=(q.y-center.y)*n.p.scale*n.p.scaleY;
   const a=n.p.letter==='U'?y:x,b=n.p.letter==='U'?-x:y;
   const p=[n.p.x+u[0]*a+v[0]*b,n.p.y+u[1]*a+v[1]*b];
   if(plan.length&&distance(p,plan.at(-1))<1e-8)continue;
   plan.push(p);local.push([q.x,q.y]);source.push(new T.Vector3(q.x-center.x,q.y-center.y,0).applyMatrix4(matrix).toArray());
  }}
  const nativeLength=source.slice(1).reduce((s,p,i)=>s+Math.hypot(...p.map((v,k)=>v-source[i][k])),0),planLength=plan.slice(1).reduce((s,p,i)=>s+distance(p,plan[i]),0);
  if(Math.abs(nativeLength-planLength)>1e-6)throw Error('Unfold changed native contour length at '+n.id);
  return {source:n.id,letter:n.p.letter,origin:[n.p.x,n.p.y],role,curves,sourcePoints:source,plan,local,nativeLength,planLength,heading:Math.atan2(u[1],u[0])*180/Math.PI,operation:'Rigid unfolding of a contour copy; original source pose unchanged'};
 });
}
function intersects(a,b,c,d){const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);return cross(a,b,c)*cross(a,b,d)<-1e-10&&cross(c,d,a)*cross(c,d,b)<-1e-10;}
function contourCandidates(w,nodes,role){
 const paths=nativePaths(nodes,role),center=paths.reduce((s,p)=>[s[0]+p.origin[0]/paths.length,s[1]+p.origin[1]/paths.length],[0,0]);
 paths.sort((a,b)=>Math.atan2(a.origin[1]-center[1],a.origin[0]-center[0])-Math.atan2(b.origin[1]-center[1],b.origin[0]-center[0]));
 const candidates=[];
 for(let mask=0;mask<2**paths.length;mask++){
  const traces=paths.map((p,i)=>({...p,reversed:Boolean(mask&(1<<i)),plan:mask&(1<<i)?[...p.plan].reverse():p.plan,local:mask&(1<<i)?[...p.local].reverse():p.local,sourcePoints:mask&(1<<i)?[...p.sourcePoints].reverse():p.sourcePoints})),points=traces.flatMap(p=>p.plan);
  let valid=true;for(let i=0;i<points.length&&valid;i++)for(let j=i+2;j<points.length;j++){if(i===0&&j===points.length-1)continue;if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length])){valid=false;break;}}
  if(!valid)continue;
  const plan=new w.CrossSection([points],'EvenOdd').simplify(1e-6);
  if(plan.isEmpty()||plan.decompose().length!==1||plan.toPolygons().length!==1)continue;
  const links=traces.map((p,i)=>({sources:[p.source,traces[(i+1)%traces.length].source],from:p.plan.at(-1),to:traces[(i+1)%traces.length].plan[0],rule:'Straight boundary connection between actual contour endpoints'}));
  candidates.push({plan,traces,links,cost:links.reduce((s,l)=>s+distance(l.from,l.to),0)});
 }
 if(!candidates.length)throw Error('Native letter contours cannot form a simple '+role+' boundary without crossing.');
 return candidates.sort((a,b)=>a.cost-b.cost);
}
module.exports={nativePaths,contourCandidates};
