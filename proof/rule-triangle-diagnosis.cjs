const fs=require('fs'),THREE=require('three');
const d=JSON.parse(fs.readFileSync('proof/rule-review/legacy-preflight.json'));
function edgeHits(a,b){
 const out=[];
 for(let i=0;i<3;i++){
  const p=new THREE.Vector3(...a[i]),q=new THREE.Vector3(...a[(i+1)%3]),length=p.distanceTo(q),direction=q.clone().sub(p).normalize();
  const hit=new THREE.Ray(p,direction).intersectTriangle(...b.map(p=>new THREE.Vector3(...p)),false,new THREE.Vector3());
  if(!hit)continue;
  const distance=p.distanceTo(hit);
  if(distance>length+1e-8)continue;
  const bary=new THREE.Triangle(...b.map(p=>new THREE.Vector3(...p))).getBarycoord(hit,new THREE.Vector3());
  out.push({edge:i,distance,length,bary:bary.toArray(),strict:distance>1e-8&&distance<length-1e-8&&Math.min(...bary.toArray())>1e-12});
 }
 return out;
}
console.log(d.examples.map(e=>({pair:[e.i,e.j],hits:[...edgeHits(e.a,e.b),...edgeHits(e.b,e.a)]})));

