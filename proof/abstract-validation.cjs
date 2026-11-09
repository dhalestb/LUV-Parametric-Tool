const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const THREE=require('three');
const {MeshBVH}=require('three-mesh-bvh');
const root=path.resolve(process.argv[2]||path.join(__dirname,'abstract-review'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const mesh=JSON.parse(fs.readFileSync(path.join(root,'combined-envelope.json')));
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));
geometry.setIndex(mesh.indices);
const bvh=new MeshBVH(geometry);
let tested=0,intersections=0;
const examples=[];let coplanar=0,nonCoplanar=0;
const coplanarAreas=[];
function overlapArea(aa,bb,normal){
 const axis=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)].indexOf(Math.max(Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)));
 const project=p=>p.toArray().filter((_,i)=>i!==axis);
 let polygon=aa.map(project),clip=bb.map(project);
 const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 if(cross(clip[0],clip[1],clip[2])<0)clip.reverse();
 for(let i=0;i<3&&polygon.length;i++){
  const a=clip[i],b=clip[(i+1)%3],next=[];
  for(let j=0;j<polygon.length;j++){
   const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=cross(a,b,p),dq=cross(a,b,q);
   if(dp>=0)next.push(p);
   if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push(p.map((v,k)=>v+t*(q[k]-v)));}
  }
  polygon=next;
 }
 return Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
}
bvh.bvhcast(bvh,new THREE.Matrix4(),{intersectsTriangles:(a,b,i,j)=>{
 if(i>=j)return false;
 const aa=[a.a,a.b,a.c],bb=[b.a,b.b,b.c];
 if(aa.some(p=>bb.some(q=>p.distanceToSquared(q)<1e-16)))return false;
 tested++;
 if(a.intersectsTriangle(b)){intersections++;const na=new THREE.Vector3().crossVectors(a.b.clone().sub(a.a),a.c.clone().sub(a.a)).normalize(),nb=new THREE.Vector3().crossVectors(b.b.clone().sub(b.a),b.c.clone().sub(b.a)).normalize();const parallel=na.clone().cross(nb).length()<1e-8; if(parallel){coplanar++;coplanarAreas.push(overlapArea(aa,bb,na));}else nonCoplanar++;if(examples.length<10)examples.push({i,j,parallel,a:aa.map(p=>p.toArray()),b:bb.map(p=>p.toArray())});}
 return false;
}});
fs.writeFileSync(path.join(root,'intersection-diagnostics.json'),JSON.stringify({tested,intersections,coplanar,nonCoplanar,coplanarAreas,examples},null,2));
(async()=>{
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const {Manifold:M,Mesh}=w;
 const results=[];
 for(const file of ['combined-envelope.obj',...manifest.components.map(c=>c.file),...manifest.tools.map(t=>t.file)]){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  const p=[],ix=[];
  for(const line of text.split(/\r?\n/)){
   if(line.startsWith('v '))p.push(...line.slice(2).trim().split(/\s+/).map(Number));
   if(line.startsWith('f '))ix.push(...line.slice(2).trim().split(/\s+/).map(v=>Number(v)-1));
  }
  const solid=new M(new Mesh({numProp:3,vertProperties:new Float32Array(p),triVerts:new Uint32Array(ix)}));
  results.push({file,status:solid.status(),volume:solid.volume(),vertices:p.length/3,triangles:ix.length/3});
  assert.equal(solid.status(),'NoError');assert(solid.volume()>0);
 }
 fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({passed:false,exports:results,nonCoplanar,coplanar,coplanarAreas,shellVolumes:manifest.validation.shellVolumes,sourceFocusOverlap:manifest.validation.sourceFocusOverlap},null,2));
 assert.equal(manifest.validation.status,'NoError');
 assert.equal(manifest.validation.shellVolumes.filter(v=>v>1e-8).length,1,'Disconnected architectural material remains');
 assert.equal(manifest.validation.outside,0);
 assert.equal(manifest.validation.sourceOutside,0);
 assert(manifest.components.every(c=>c.finalVolume>0&&c.sources.length>=2));
 assert(manifest.tools.every(t=>t.removed>0&&Math.abs(t.finalObstruction)<1e-8));
 assert(manifest.instances.every(t=>!t.overrideActive&&[0,15,30,45,90].some(a=>Math.abs(a-t.relativeYaw)<1e-8)));
 assert.equal(nonCoplanar,0,"Noncoplanar intersections remain");
 assert(coplanarAreas.every(a=>a===0),"Positive-area coplanar overlap remains");
 const result={passed:true,exports:results,coplanarAreas,nonAdjacentTriangleChecks:tested,selfIntersectionPairs:intersections,coplanar,nonCoplanar,examples,shellVolumes:manifest.validation.shellVolumes,sourceFocusOverlap:manifest.validation.sourceFocusOverlap};
 fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(result,null,2));
 console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1;});






