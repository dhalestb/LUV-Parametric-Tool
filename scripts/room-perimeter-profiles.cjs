// Experimental parameter profiles. Native Room A/B and glyph definitions remain untouched.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const VERSION='room-within-volume/study194-alternating-profiles-v1';
const PROFILES=Object.freeze([
 Object.freeze({id:'native-polygon-population-v1',name:'Native uniform-size polygon population',changesSource:false}),
 Object.freeze({id:VERSION,name:'Study 194 alternating perimeter profiles · 13/9/13/9 ft',sizesFeet:Object.freeze([13,9,13,9]),changesSource:true})
]);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function applyPerimeterProfile(request,id){
 if(id===undefined||id==='native-polygon-population-v1')return request;
 assert.equal(id,VERSION,'Unsupported Room perimeter profile');
 const file=path.resolve(__dirname,'../vendor/room-reference-20261123/proof/fixtures/room-suspended-llv.json'),reference=JSON.parse(fs.readFileSync(file,'utf8'));
 const scales=Array.from({length:4},(_,level)=>{const values=[...new Set(reference.source.filter(p=>p.architecturalRole==='perimeter'&&p.levelIndex===level).map(p=>p.scale))];assert.equal(values.length,1,'Ambiguous authenticated size schedule');assert(Math.abs(values[0]*.92-PROFILES[1].sizesFeet[level])<1e-10);return values[0];});
 const r=structuredClone(request),counts=[0,0,0,0];
 r.source=r.source.map(p=>{if(p.architecturalRole!=='perimeter')return p;assert(Number.isInteger(p.levelIndex)&&p.levelIndex>=0&&p.levelIndex<4,'Alternating profile requires four perimeter levels');assert([p.scaleX,p.scaleY,p.scaleZ].every(v=>v===1),'This profile preserves native uniform letter proportions');counts[p.levelIndex]++;return {...p,scale:scales[p.levelIndex]};});
 assert(counts.every(n=>n>=4),'Four populated perimeter courses are required');
 r.sourceSnapshot={...r.sourceSnapshot,perimeterProfile:{id:VERSION,referenceStudy:194,referenceId:'72883ed3-ea47-4475-8172-3dc491735798',referenceFixture:'room-suspended-llv.json',sizesFeet:[13,9,13,9],scales,counts,placementPreserved:true,rotationPreserved:true,elevationPreserved:true,interiorPreserved:true,operation:'Apply the exact authentic fixture scale at each perimeter level; native glyph topology and proportions, polygon stations, yaw, face tilt, elevation and interior sources are unchanged.'}};
 r.sourceId=hash({profile:VERSION,parentSourceId:request.sourceId,source:r.source,field:r.field});r.sourceName='Room Within Volume · polygon population · Study 194 alternating profiles';return r;
}
module.exports={VERSION,PROFILES,applyPerimeterProfile};
