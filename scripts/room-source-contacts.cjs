// Separate experimental validation. Does not modify or authorize native Room rules.
const T=require('three'),assert=require('assert/strict');
const VERSION='room-within-volume/source-contact-validation-v1';
const POLICY=Object.freeze({positiveVolumeFeet3:1e-6,nominalVolumeFeet3:1e-6,maxBevelVolumeFeet3:.03,maxBevelFractionOfSmallerSource:.001,minNominalGapFeet:.0001});
function body(w,m){const raw=new w.Mesh({numProp:3,vertProperties:Float32Array.from(m.positions),triVerts:Uint32Array.from(m.indices)});raw.merge();return new w.Manifold(raw);}
function createValidator(w,getLetterShape){
 function mask(node){const s=getLetterShape(node.p.letter),center=new T.Box2().setFromPoints(s.getPoints(16)).getCenter(new T.Vector2());return new w.CrossSection([s.getPoints(16).map(p=>[p.x-center.x,p.y-center.y])],'NonZero').extrude(.12).translate([0,0,-.06]).transform(node.matrix);}
 return function classify(letters,nodes){assert.equal(letters.length,nodes.length);const solids=letters.map(l=>body(w,l.mesh)),masks=new Map(),contacts=[];let tested=0;
  const core=i=>{if(!masks.has(i))masks.set(i,mask(nodes[i]));return masks.get(i);};
  try{for(let i=0;i<solids.length;i++)assert(solids[i].status()==='NoError'&&Number.isFinite(solids[i].volume())&&solids[i].volume()>0,'Unresolved or invalid source solid: '+letters[i].id);
   for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++){tested++;const hit=solids[i].intersect(solids[j]);try{const volume=hit.volume();assert(Number.isFinite(volume),'Unresolved source intersection');if(volume<=POLICY.positiveVolumeFeet3)continue;const first=hit.intersect(core(i)),q=first.intersect(core(j)),nominal=q.volume();q.delete();first.delete();const ratio=volume/Math.min(solids[i].volume(),solids[j].volume()),gap=nominal<=POLICY.nominalVolumeFeet3?core(i).minGap(core(j),1):0;
    const category=nominal>POLICY.nominalVolumeFeet3?'unauthorized-nominal-penetration':gap>=POLICY.minNominalGapFeet?'bevel-only-contact':'unresolved-contact';const accepted=category==='bevel-only-contact'&&volume<=POLICY.maxBevelVolumeFeet3&&ratio<=POLICY.maxBevelFractionOfSmallerSource;
    contacts.push({a:letters[i].id,b:letters[j].id,volumeFeet3:volume,nominalVolumeFeet3:nominal,smallerSourceFraction:ratio,nominalGapFeet:gap,bounds:hit.boundingBox(),category,accepted,reason:accepted?'Within explicit bevel-only mesh tolerance; not an authorized architectural interface. Final opening and connection checks remain mandatory.':category==='unauthorized-nominal-penetration'?'No authenticated source-interface permission exists for this nominal-body overlap.':'Bevel tolerance exceeded or nominal relationship ambiguous; reject, do not silently whitelist.'});
   }finally{hit.delete();}}
   return {version:VERSION,policy:POLICY,pairsTested:tested,contacts,unauthorizedNominal:contacts.filter(x=>x.category==='unauthorized-nominal-penetration').length,bevelContacts:contacts.filter(x=>x.category==='bevel-only-contact').length,verifiedIntentionalInterfaces:[],unresolved:contacts.filter(x=>!x.accepted&&x.category!=='unauthorized-nominal-penetration').length,passed:contacts.every(x=>x.accepted),note:'No source-interface allowlist is inferred from a Boolean architecture, registry label or historical fixture. Any future intentional-interface category requires separately reviewed pair/edge evidence.'};
  }finally{solids.forEach(s=>s.delete());masks.forEach(s=>s.delete());}
 };
}
module.exports={VERSION,POLICY,body,createValidator};
