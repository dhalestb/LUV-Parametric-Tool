const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
require('../proof/rule-amphitheater.cjs');
const {populate}=require('../src/components/sourcePopulation.ts');
const rows=[];
function worker(request,out){
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
 cp.execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out],{stdio:'pipe'});
 return JSON.parse(fs.readFileSync(path.join(out,'result.json')));
}
for(const seed of [19,21,37]){
 const field={width:40,depth:40,height:60};
 const source=populate([],12,field,13,seed,{envelopeRoles:true,threeLifts:true});
 for(const lift of ['lower','middle','top'])assert.equal(source.filter(p=>p.lift===lift).length,4);
 const upright=source.filter(p=>p.architecturalRole==='interior');
 assert.equal(upright.length,2);
 assert(upright.every(p=>p.lift==='middle'&&p.rx===90&&p.ry===0&&p.voidKind==='through'));
 assert(source.filter(p=>p.lift!=='middle').every(p=>Math.abs(p.rx)<=12&&p.architecturalRole!=='interior'));
 assert.deepEqual(populate(source,13,field,13,seed,{envelopeRoles:true,threeLifts:true}).slice(0,12),source);
 const request={generator:'source-preserving',envelopeVersion:'vertical-walls',field,preferredFeet:13,population:12,sourceId:'three-lifts-'+seed,sourceName:'Three lifts · seed '+seed,source};
 const out=path.resolve('proof/interactive-check/three-lifts',String(seed));
 const r=worker(request,out);
 assert.deepEqual(r.request.source,source);
 assert(r.validation.passed&&r.validation.selfIntersectionPairs===0);
 assert.equal(r.articulationReport.components,1);
 assert(r.contributions.every(c=>c.exposedArea>=1));
 const bounds=lift=>r.letters.filter((l,i)=>source[i].lift===lift).flatMap(l=>l.mesh.positions.filter((_,k)=>k%3===2));
 const lower=bounds('lower'),middle=bounds('middle'),top=bounds('top');
 assert(Math.min(...top)>Math.max(...lower));
 assert(Math.max(...middle)<Math.max(...top));
 assert(Math.max(...top)<40);
 for(const v of r.boundaryReport.voids){
  assert.equal(v.tilt,90);assert(Math.abs(v.axis[2])<1e-8);assert(v.removedVolume>1);
  const sourceIndex=r.letters.findIndex(l=>l.id===v.source);
  const p=source[sourceIndex];
  // Independent cardinal-direction check on the plane normal after the X tilt and global Z turn.
  const yaw=p.rz*Math.PI/180;
  assert(Math.abs(Math.abs(v.axis[0])-Math.abs(Math.sin(yaw)))<1e-8);
  assert(Math.abs(Math.abs(v.axis[1])-Math.abs(Math.cos(yaw)))<1e-8);
 }
 rows.push({seed,passed:true,lifts:['lower','middle','top'].map(lift=>({lift,count:4,minZ:Math.min(...bounds(lift)),maxZ:Math.max(...bounds(lift))})),volume:r.volume,triangles:r.architecture.indices.length/3,validation:r.validation,voids:r.boundaryReport.voids.map(v=>({source:v.source,axis:v.axis,removedVolume:v.removedVolume})),contributions:r.contributions});
}
const original=JSON.parse(fs.readFileSync('proof/interactive-check/three-lifts/19/result.json'));
const edited=structuredClone(original.request);
const index=edited.source.findIndex(p=>p.architecturalRole==='interior');
edited.source[index].x+=.5;
const result=worker(edited,path.resolve('proof/interactive-check/three-lifts/edited'));
assert.deepEqual(result.request.source,edited.source);
original.letters.forEach((letter,i)=>{if(i!==index)assert.deepEqual(result.letters[i],letter);});
assert.notDeepEqual(result.architecture,original.architecture);
fs.writeFileSync('reports/three-lifts/validation.json',JSON.stringify({passed:true,rows,editing:{sourcePosesPreserved:true,editedLetter:index+1,changedArchitecture:true}},null,2));
console.log('PASS three lifts, only two middle interior uprights, source editing, exact quantity, height bounds and strict exported geometry.');
