import * as THREE from 'three';
import type {ProofMesh,VoidFieldReport} from './amphitheaterInteractiveTypes';

type Wall=NonNullable<VoidFieldReport['walls']>[number];
function triangles(m:ProofMesh){
  const pts=Array.from({length:m.positions.length/3},(_,i)=>new THREE.Vector3().fromArray(m.positions,3*i));
  const tris=[];
  for(let i=0;i<m.indices.length;i+=3){
    const t=new THREE.Triangle(...m.indices.slice(i,i+3).map(k=>pts[k]) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]);
    tris.push({t,box:new THREE.Box3().setFromPoints([t.a,t.b,t.c]),n:t.getNormal(new THREE.Vector3())});
  }
  return tris;
}
// Trace the physical intersection of nonparallel faces. Coplanar overlaps and
// point contacts do not define a drawable seam.
export function findFacadeJoint(walls:Wall[]){
  const entries=walls.filter(w=>w.finalMesh?.indices.length).map(w=>({w,tris:triangles(w.finalMesh!)}));
  const ray=new THREE.Ray(),hit=new THREE.Vector3();
  let best:{walls:Wall[];point:THREE.Vector3;axis:THREE.Vector2;edge:[THREE.Vector3,THREE.Vector3];normal:THREE.Vector3;score:number}|undefined;
  for(let i=0;i<entries.length;i++)for(const b of entries.slice(i+1)){
    const a=entries[i];
    for(const u of a.tris)for(const v of b.tris){
      if(!u.box.intersectsBox(v.box)||Math.abs(u.n.dot(v.n))>.95||Math.max(Math.abs(u.n.z),Math.abs(v.n.z))>.75)continue;
      const hits:THREE.Vector3[]=[];
      for(const [s,t] of [[u.t,v.t],[v.t,u.t]]){
        for(const [start,end] of [[s.a,s.b],[s.b,s.c],[s.c,s.a]]){
          ray.origin.copy(start);ray.direction.subVectors(end,start).normalize();
          if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)&&start.distanceTo(hit)<=start.distanceTo(end)+1e-6&&!hits.some(p=>p.distanceToSquared(hit)<1e-10))hits.push(hit.clone());
        }
      }
      if(hits.length<2)continue;
      const [p,q]=hits;const score=Math.abs(p.z-q.z)*(1-Math.abs(u.n.dot(v.n))*.5);
      if(score<.05)continue;

      if(!best||score>best.score){
        const axis=new THREE.Vector2(u.n.x+v.n.x,u.n.y+v.n.y).normalize().multiplyScalar(Math.SQRT2);
        best={walls:[a.w,b.w],point:p.clone().lerp(q,.5),axis,edge:[p,q],normal:u.n,score};
      }
    }
  }
  return best;
}
