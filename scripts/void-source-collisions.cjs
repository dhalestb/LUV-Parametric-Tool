// Isolated Void Field acceptance gate. No source manipulation or native rule changes.
const assert=require('node:assert/strict');
const VERSION='void-field/source-solid-collision-gate-v1';
const POLICY=Object.freeze({positiveVolumeFeet3:1e-6,unresolvedContactDistanceFeet:1e-5,authorizedSourceInterfaces:[]});
function body(w,m){assert(m&&m.positions.length%3===0&&m.indices.length%3===0&&m.positions.every(Number.isFinite),'Malformed source mesh');assert(m.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<m.positions.length/3),'Invalid source mesh index');const raw=new w.Mesh({numProp:3,vertProperties:Float32Array.from(m.positions),triVerts:Uint32Array.from(m.indices)});raw.merge();const s=new w.Manifold(raw);assert(s.status()==='NoError'&&s.volume()>0,'Invalid source solid');return s;}
function validateSourceSolids(w,letters,poses=[]){
 assert(new Set(letters.map(l=>l.id)).size===letters.length,'Duplicate source identity');assert(letters.length>0);
 const solids=[],records=[];let pairsTested=0,broadPhaseSeparated=0;
 try{for(const l of letters)solids.push(body(w,l.mesh));const boxes=solids.map(s=>s.boundingBox());
 for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++){
  pairsTested++;const a=boxes[i],b=boxes[j],eps=POLICY.unresolvedContactDistanceFeet;
  if([0,1,2].some(k=>a.max[k]<b.min[k]-eps||b.max[k]<a.min[k]-eps)){broadPhaseSeparated++;continue;}
  const hit=solids[i].intersect(solids[j]);try{const volume=hit.volume();assert(Number.isFinite(volume)&&volume>=-POLICY.positiveVolumeFeet3,'Unresolved intersection volume');
   const gap=volume>POLICY.positiveVolumeFeet3?0:solids[i].minGap(solids[j],eps*2);assert(Number.isFinite(gap),'Unresolved source contact distance');
   if(volume>POLICY.positiveVolumeFeet3||gap<=eps){records.push({a:letters[i].id,b:letters[j].id,levels:[poses[i]?.levelIndex??poses[i]?.lift??null,poses[j]?.levelIndex??poses[j]?.lift??null],volumeFeet3:volume,gapFeet:gap,bounds:volume>POLICY.positiveVolumeFeet3?hit.boundingBox():null,category:volume>POLICY.positiveVolumeFeet3?'unauthorized-positive-volume-penetration':'unresolved-near-or-surface-contact',authorized:false,accepted:false});}
  }finally{hit.delete();}
 }
 return{version:VERSION,policy:POLICY,pairsTested,broadPhaseSeparated,contacts:records,unauthorizedPenetrations:records.filter(x=>x.volumeFeet3>POLICY.positiveVolumeFeet3).length,unresolvedContacts:records.filter(x=>x.volumeFeet3<=POLICY.positiveVolumeFeet3).length,acceptedInterfaces:[],passed:records.length===0,limitations:['No authenticated Void Field source-body contact exception exists. No role, adjacency, bevel or Boolean-success exemption is inferred. Near/zero-volume contacts require explicit interface proof; this version rejects them.']};
 }finally{solids.forEach(s=>s.delete());}
}
module.exports={VERSION,POLICY,body,validateSourceSolids};
