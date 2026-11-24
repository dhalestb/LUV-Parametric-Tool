const fs=require('fs'),path=require('path'),cp=require('child_process');
require('../proof/rule-amphitheater.cjs');
const {populate}=require('../src/components/sourcePopulation.ts');
const rows=[];
for(const seed of [19,21,24,37,41,51]){
 const field={width:40,depth:40,height:60},count=12;
 const out=path.resolve('proof/interactive-check/three-lifts',String(seed));fs.mkdirSync(out,{recursive:true});
 try{
  const source=populate([],count,field,13,seed,{envelopeRoles:true,threeLifts:true});
  const request={generator:'source-preserving',envelopeVersion:'vertical-walls',field,preferredFeet:13,population:count,sourceId:'three-lifts-'+seed,sourceName:'Three lifts · seed '+seed,source};
  const input=path.join(out,'request.json');fs.writeFileSync(input,JSON.stringify(request));
  const began=performance.now();const run=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',input,out],{encoding:'utf8'});
  const error=run.status?(run.stderr.match(/Error: [^\n]+/)??[run.stderr])[0]:undefined;
  rows.push({seed,passed:run.status===0,error,milliseconds:performance.now()-began});
 }catch(e){rows.push({seed,passed:false,error:e.message});}
 console.log(rows.at(-1));
}
fs.mkdirSync('reports/three-lifts',{recursive:true});fs.writeFileSync('reports/three-lifts/sampling.json',JSON.stringify(rows,null,2));