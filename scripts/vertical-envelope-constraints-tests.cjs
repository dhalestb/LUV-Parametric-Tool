const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');require('../proof/rule-amphitheater.cjs');
const {populate}=require('../src/components/sourcePopulation.ts'),base=JSON.parse(fs.readFileSync('reports/vertical-envelope/result-75.json')).request;
const populated=populate([],12,base.field,13,37,{envelopeRoles:true});assert(populated.filter(p=>p.architecturalRole==='interior').every(p=>p.rx===90&&p.ry===0&&p.rotationOrder==='ZYX'&&[0,75,90,105].includes(p.rz)));assert.deepEqual(populate(populated,13,base.field,13,37,{envelopeRoles:true}).slice(0,12),populated);
const rows=[];
for(const [name,change,shouldPass] of [['interior-L',r=>r.source[2].letter='L',true],['interior-V',r=>r.source[2].letter='V',true],['raised-support',r=>r.source[0].supportZ=5,true],['invalid-interior-yaw',r=>r.source[2].rz=45,false],['invalid-interior-tilt',r=>r.source[2].rx=15,false]]){
 const request=structuredClone(base);change(request);const out=path.resolve('proof/interactive-check/vertical-constraints',name);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));const result=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out],{encoding:'utf8'});
 if(shouldPass)assert.equal(result.status,0,result.stderr);else{assert.notEqual(result.status,0);assert.match(result.stderr,/interior sources must be horizontal/);}
 rows.push({name,passed:true,accepted:result.status===0});
}
fs.writeFileSync('reports/vertical-envelope/constraint-tests.json',JSON.stringify({passed:true,populationPosesPreserved:true,rows},null,2));console.log('PASS interior L/V channels, raised wall support, invalid pose rejection and exact population extension.');
