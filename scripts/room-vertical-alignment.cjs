// Experimental placement adapter only. Authenticated Room A/B operations are not edited.
const assert=require('assert/strict'),A=require('./room-polygon-domain.cjs');
const VERSION='room-within-volume/vertical-axis-alignment-v1';
function align(request,parent){
 assert.equal(request.envelopeVersion,'room-within-volume');assert.equal(request.source.length,parent.letters.length);
 const poses=new Map(request.source.map((p,i)=>{const id=p.letter+'-'+(i+1);assert.equal(parent.letters[i].id,id);return[id,p];}));
 const tiers=[0,1,2,3].map(level=>[...poses].filter(([,p])=>p.architecturalRole==='perimeter'&&p.levelIndex===level));
 assert(tiers.every(t=>t.length>0),'Four perimeter courses required');
 assert(tiers.every(t=>t.length===tiers[0].length),'Unequal course populations require an explicit reviewed correspondence; no automatic one-to-one mapping.');
 assert.equal(tiers.flat().length,[...poses.values()].filter(p=>p.architecturalRole==='perimeter').length);
 const panels=parent.roomReport.perimeter.fullProfiles.panels,links=panels.filter(p=>p.kind==='loft'),bases=panels.filter(p=>p.kind==='base');
 assert.equal(bases.length,tiers[0].length);assert.equal(links.length,3*tiers[0].length);
 const assigned=new Set(),chains=tiers[0].map(([id,p])=>{
  const base=bases.filter(b=>b.upperSource===id);assert.equal(base.length,1);
  const ids=[id];for(let level=1;level<4;level++){const edge=links.filter(l=>l.lowerSource===ids.at(-1)&&l.upperLevel===level&&l.lowerLevel===level-1);assert.equal(edge.length,1,'Ambiguous or missing historical loft correspondence');const next=edge[0].upperSource,q=poses.get(next);assert(q&&q.architecturalRole==='perimeter'&&q.levelIndex===level);assert.equal(q.letter,p.letter,'Different source identities need a reviewed correspondence');assert(!assigned.has(next),'Shared upper source');assigned.add(next);ids.push(next);}
  return{baseSource:id,letter:p.letter,sourceIds:ids,referenceNativeXY:[p.x,p.y],before:ids.map(id=>({id,x:poses.get(id).x,y:poses.get(id).y,z:poses.get(id).z,rx:poses.get(id).rx,ry:poses.get(id).ry,rz:poses.get(id).rz,sizeFeet:poses.get(id).scale*.92})),historicalLofts:links.filter(l=>ids.includes(l.lowerSource)&&ids.includes(l.upperSource)).map(l=>l.id)};
 });
 assert.equal(assigned.size,tiers.slice(1).flat().length);
 const targets=new Map(chains.flatMap(c=>c.sourceIds.slice(1).map(id=>[id,c.referenceNativeXY]))),r=structuredClone(request);
 r.source=r.source.map((p,i)=>{const xy=targets.get(p.letter+'-'+(i+1));return xy?{...p,x:xy[0],y:xy[1]}:p;});
 for(let i=0;i<r.source.length;i++){const before=request.source[i],after=r.source[i],keys=new Set([...Object.keys(before),...Object.keys(after)]);for(const k of keys)if(!['x','y'].includes(k))assert.deepEqual(after[k],before[k],k);if(before.architecturalRole!=='perimeter'||before.levelIndex===0)assert.deepEqual(after,before);}
 for(let level=0;level<4;level++)assert(r.source.filter(p=>p.architecturalRole==='perimeter'&&p.levelIndex===level).every(p=>Math.abs(p.scale*.92-[13,9,13,9][level])<1e-10),'Expected preserved 13/9/13/9 profile');
 r.sourceSnapshot={...r.sourceSnapshot,verticalAlignment:{version:VERSION,parentRequestHash:A.hash(request),parentNativeSourceHash:A.hash(parent.letters),mappingBasis:'Exact saved Rule B loft-source ledger; checked equal populations, unique identity-preserving adjacent-level links. Native XY plan maps rigidly to site XZ; native Z maps to site Y.',perTier:tiers.map(t=>t.length),chains,placement:'Only upper-course native x/y are copied from their validated first-course counterpart. Elevations, sizes, all Euler rotations and order, scale axes, interior sources, computational support and site frame are unchanged.',rotationPolicy:'Preserve every existing supported per-letter rotation; no whole-level random rotation introduced.'}};
 r.sourceId=A.hash({version:VERSION,parent:request.sourceId,source:r.source,field:r.field});r.sourceName='Room Within Volume · first-course vertical axes · 13/9/13/9';return r;
}
module.exports={VERSION,align};
