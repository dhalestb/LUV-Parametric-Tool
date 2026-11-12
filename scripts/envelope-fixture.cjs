// Regenerate portable request fixtures through the actual validated worker.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
function fixtureStudy(name){
 if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid fixture name');
 const request=path.resolve('proof/fixtures',name+'.json'),out=path.resolve('proof/interactive-check/portable-fixtures',name);
 fs.mkdirSync(out,{recursive:true});
 fs.copyFileSync(request,path.join(out,'request.json'));
 const run=cp.spawnSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',request,out],{encoding:'utf8',timeout:180000});
 if(run.status!==0)throw Error(name+': '+(run.stderr||run.error||'Worker failed'));
 const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
 if(!result.validation?.passed||result.validation.selfIntersectionPairs!==0)throw Error(name+': Geometry validation failed');
 return result;
}
module.exports={fixtureStudy};
