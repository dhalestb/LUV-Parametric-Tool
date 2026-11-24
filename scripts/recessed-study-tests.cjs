const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
require('../proof/rule-amphitheater.cjs');
const {populate} = require('../src/components/sourcePopulation.ts');
const {derive} = require('./source-envelope.cjs');
const base = JSON.parse(fs.readFileSync('reports/vertical-envelope/result-75.json')).request;
let failures = 0;
for(const [seed,count] of [[37,12],[1486017266,8],[19,8]]){
  const saved=JSON.parse(fs.readFileSync('reports/upright-letters/legacy-horizontal-requests.json'));
  const source = saved.find(r=>r.sourceName.includes(String(seed))).source;
  assert(source.some(p=>p.voidKind==='alcove') && source.some(p=>p.voidKind==='through'));
  assert(source.filter(p=>p.architecturalRole==='perimeter').every(p=>Math.abs(p.rx)>=12 && Math.abs(p.rx)<=20));
  const request = {...base,source,sourceId:'design-'+seed,sourceName:'Terrace study '+seed,population:count};
  const dir = path.resolve('proof/interactive-check/recessed-studies',String(seed));
  fs.mkdirSync(dir,{recursive:true});
  const file = path.join(dir,'request.json');
  fs.writeFileSync(file,JSON.stringify(request));
  const run = spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',file,dir],{encoding:'utf8'});
  if(run.status!==0){console.error(seed,run.stderr);failures++;continue;}
  const result = JSON.parse(fs.readFileSync(path.join(dir,'result.json')));
  assert.deepEqual(result.request.source,source);
  assert.deepEqual(result.letters,derive({...request,envelopeVersion:'profiles'}).letters);
  assert(result.contributions.every(c=>c.exposedArea>=1));
  assert(result.validation.passed && result.validation.selfIntersectionPairs===0);
  for(const opening of result.boundaryReport.voids.filter(v=>v.alcove)){
    assert(opening.approach.testedVolumeFt3>0 && opening.approach.obstructionFt3<=1e-8);
  }
  const ops = result.articulationReport.operations;
  if(!ops.some(op=>op.alcove)){console.error(seed,'no bounded alcove');failures++;continue;}
  console.log(seed,count,result.volume,result.architecture.indices.length/3,ops.map(op=>op.kind));
}
process.exitCode = failures ? 1 : 0;
