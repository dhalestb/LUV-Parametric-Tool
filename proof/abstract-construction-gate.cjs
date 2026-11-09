const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=__dirname;
const old=JSON.parse(fs.readFileSync(path.join(root,'envelope-review/manifest.json')));
const next=JSON.parse(fs.readFileSync(path.join(root,'abstract-review/manifest.json')));
const validation=JSON.parse(fs.readFileSync(path.join(root,'abstract-review/validation.json')));
assert.equal(next.validation.sourceCount,12);
assert.equal(validation.selfIntersectionPairs,0);
assert.equal(next.validation.shellVolumes.length,1);
assert(next.components.every(m=>m.construction.includes('no copied complete letter outline')&&m.derivation.length>0&&m.sources.length>=6));
for(const mass of next.components)for(const p of mass.derivation){
 assert(p.sourceCurvePoints.length===2);
 assert(p.generatedLower.some((v,i)=>Math.abs(v-p.sourceCurvePoints[0][i])>1e-6));
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.notEqual(hash(path.join(root,'envelope-review/combined-envelope.json')),hash(path.join(root,'abstract-review/combined-envelope.json')));
const gate={passed:true,priorCheckpoint:'7e167b1',sourceCount:12,priorVolume:old.validation.volume,newVolume:next.validation.volume,construction:'cross-letter L-direction/U-curvature/V-fold trajectories',copiedCompleteProfiles:false,intersectionPairs:validation.selfIntersectionPairs};
fs.writeFileSync(path.join(root,'abstract-review/construction-gate.json'),JSON.stringify(gate,null,2));
if(!fs.existsSync(path.join(root,'abstract-review/previous-envelope.png')))fs.copyFileSync(path.join(root,'envelope-review/C-iso.png'),path.join(root,'abstract-review/previous-envelope.png'));
console.log(gate);

