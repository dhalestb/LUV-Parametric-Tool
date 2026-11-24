const assert=require('node:assert/strict');
const fs=require('node:fs');
const {requestConfig,cacheKey}=require('./field-config.cjs');
const keys=new Set(),configs=[];
for(const width of [20,40,60])for(const depth of [20,40,60])for(const height of [20,40,60]){
 const config=requestConfig({width,depth,height});
 configs.push(config);keys.add(cacheKey(config,{id:'same-source'}));
 for(const category of ['gathering','office','lobby']){
  const other=requestConfig({...config,category});
  assert.deepEqual([other.width,other.depth,other.height],[width,depth,height]);
 }
 assert.notEqual(cacheKey(config,{id:'source-a'}),cacheKey(config,{id:'source-b'}));
 assert.notEqual(cacheKey(config,{}),cacheKey({...config,majorLevelSpacing:15},{}));
}
assert.equal(keys.size,27);
for(const k of ['width','depth','height'])assert.throws(()=>requestConfig({[k]:25}));
for(const majorLevelSpacing of [11,16])assert.throws(()=>requestConfig({majorLevelSpacing}));
fs.writeFileSync(__dirname+'/field-review/configuration-validation.json',JSON.stringify({passed:true,uniqueDimensionKeys:keys.size,configs},null,2));
console.log('PASS 27 combinations, category persistence, source/dimension/spacing cache identity and invalid-input rejection');
