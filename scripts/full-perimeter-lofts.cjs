const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
function profile(node) {
  const shape=getLetterShape(node.p.letter), center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2());
  const transform=p=>new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(new T.Matrix4().fromArray(node.matrix)).toArray();
  const line=i=>[shape.curves[i].getPoint(0),shape.curves[i].getPoint(1)].map(transform);
  const score=i=>line(i).reduce((sum,p)=>sum+p[0]*node.p.x+p[1]*node.p.y,0);
  const ids=node.p.letter==='U'?[1,2]:node.p.letter==='L'?[5,0]:[([4,6]).sort((a,b)=>score(b)-score(a))[0]];
  const path=new T.CurvePath();ids.forEach(i=>path.add(shape.curves[i]));
  const pts=Array.from({length:33},(_,i)=>transform(path.getPoint(i/32)));
  const delta=pts.at(-1).map((v,k)=>v-pts[0][k]);if(delta[0]*(-node.p.y)+delta[1]*node.p.x<0)pts.reverse();
  return pts;
}
function wallMesh(a,b) {
 const v=[],f=[],N=a.length,rows=9;
 const offset=p=>{const len=Math.hypot(p[0],p[1]);return [p[0]*(1-.45/len),p[1]*(1-.45/len),p[2]]};
 for(let side=0;side<2;side++)for(let j=0;j<rows;j++)for(let i=0;i<N;i++){
   const t=j/(rows-1),k=t*t*(3-2*t),p=side?offset(a[i]):a[i],q=side?offset(b[i]):b[i];v.push(p[0]+k*(q[0]-p[0]),p[1]+k*(q[1]-p[1]),p[2]+t*(q[2]-p[2]));
 }
 const quad=(a,b,c,d)=>f.push(a,b,c,a,c,d),m=N*rows;
 for(let j=0;j<rows-1;j++)for(let i=0;i<N-1;i++){const x=j*N+i;quad(x,x+1,x+1+N,x+N);quad(x+m,x+m+N,x+m+N+1,x+m+1)}
 for(let i=0;i<N-1;i++){const h=(rows-1)*N+i;quad(i,i+m,i+m+1,i+1);quad(h,h+1,h+1+m,h+m)}
 for(let j=0;j<rows-1;j++){const a=j*N,b=a+N-1;quad(a,a+N,a+N+m,a+m);quad(b,b+m,b+m+N,b+N)}
 return {positions:v,indices:f}
}
module.exports=function build(w,nodes,metrics,onPanel){
 const groups=Object.groupBy(nodes.filter(n=>n.p.architecturalRole==='perimeter'),n=>n.p.levelIndex),tiers=Object.values(groups),profiles=new Map(tiers.flat().map(n=>[n.id,profile(n)]));
 const panels=[],solids=[],terminations=[];
 function add(lo,hi){const upperProfile=profiles.get(hi.id),lowerProfile=lo?profiles.get(lo.id):upperProfile.map(p=>[p[0],p[1],0]), mesh=wallMesh(lowerProfile,upperProfile);
 const solid=new w.Manifold(new w.Mesh({numProp:3,vertProperties:Float32Array.from(mesh.positions),triVerts:Uint32Array.from(mesh.indices)}));
 if(solid.status()!=='NoError'||solid.volume()<=0)throw Error('Invalid full profile solid '+hi.id);
 const id='full-'+(lo?.id||'base')+'-'+hi.id;solids.push(solid); onPanel(id,solid,[...new Set([lo?.id||hi.id,hi.id])]);panels.push({id,kind:lo?'loft':'base',lowerSource:lo?.id||hi.id,upperSource:hi.id,lowerLevel:lo?.p.levelIndex??-1,upperLevel:hi.p.levelIndex,lowerProfile,upperProfile,mesh});}
 tiers[0].forEach(n=>add(null,n));
 for(let level=1;level<tiers.length;level++){const prev=tiers[level-1],remaining=new Set(prev);
 for(const n of tiers[level]){const cost=p=>Math.hypot(n.p.x-p.p.x,n.p.y-p.p.y);const a=[...remaining].sort((a,b)=>cost(a)-cost(b))[0];if(!a)throw Error('Cannot match full profiles');remaining.delete(a);add(a,n)}
 remaining.forEach(n=>terminations.push({level:level-1,source:n.id,reason:'Level count decreases'}))}
 
 const outlines=panels.filter(p=>p.kind==='base').map(p=>p.lowerProfile);
 const rays=720,step=2*Math.PI/rays,used=Array.from({length:rays},(_,i)=>{
 const x=Math.cos(i*step),y=Math.sin(i*step);
 return outlines.some(line=>line.slice(1).some((b,j)=>{const a=line[j],dx=b[0]-a[0],dy=b[1]-a[1],det=x*dy-y*dx;
 if(Math.abs(det)<1e-9)return false;const t=(a[0]*y-a[1]*x)/det;return t>=0&&t<=1&&(a[0]*dy-a[1]*dx)/det>0;}));});
 let gap=0,longest=0;for(const hit of [...used,...used]){gap=hit?0:gap+1;longest=Math.max(longest,gap);}
 metrics.baseCoverage=used.filter(Boolean).length/rays;metrics.maxGapFeet=Math.min(rays,longest)*step*Math.max(...outlines.flat().map(p=>Math.hypot(p[0],p[1])));
metrics.fullProfiles={panels,terminations};
 return w.Manifold.union(solids);
};