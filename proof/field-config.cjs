const choices=[20,40,60];
function requestConfig(value={}){
  const dimensions=['width','depth','height'].map(key=>{
    const n=value[key]??20;
    if(!choices.includes(n))throw Error(key+' must be 20, 40 or 60 feet');
    return n;
  });
  const majorLevelSpacing=value.majorLevelSpacing??12;
  if(!Number.isFinite(majorLevelSpacing)||majorLevelSpacing<12||majorLevelSpacing>15)throw Error('Major level spacing must be 12–15 feet');
  const category=value.category??'gathering',typology=value.typology??'stepped-amphitheater';
  return {width:dimensions[0],depth:dimensions[1],height:dimensions[2],majorLevelSpacing,category,typology,sourceRegistration:[20,20,20]};
}
function cacheKey(config,source){return require('node:crypto').createHash('sha256').update(JSON.stringify({config:requestConfig(config),source})).digest('hex');}
module.exports={requestConfig,cacheKey,choices};
