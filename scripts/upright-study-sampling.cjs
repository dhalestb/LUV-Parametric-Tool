const fs=require('fs'),path=require('path'),cp=require('child_process');
require('../proof/rule-amphitheater.cjs');
const {populate}=require('../src/components/sourcePopulation.ts');
const rows=[];
for(const seed of [19,20,21,22,23,24,25,26]){
 const count=seed%2?8:12,field={width:40,depth:40,height:60};
 const source=populate([],count,field,13,seed,{envelopeRoles:true});
 const request={generator:'source-preserving',envelopeVersion:'vertical-walls',field,preferredFeet:13,population:count,sourceId:'upright-'+seed,sourceName:'Upright letter study '+seed,source};
 const out=path.resolve('proof/interactive-check/upright',String(seed));fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
 const time=performance.now();
 const run=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out],{encoding:'utf8'});
 rows.push({seed,count,passed:run.status===0,milliseconds:performance.now()-time,error:run.status?(run.stderr.match(/Error: [^\n]+/)??[run.stderr])[0]:undefined});
 console.log(seed,count,rows.at(-1).passed,rows.at(-1).error??'');
}
fs.mkdirSync('reports/upright-letters',{recursive:true});fs.writeFileSync('reports/upright-letters/seed-sampling.json',JSON.stringify(rows,null,2));
