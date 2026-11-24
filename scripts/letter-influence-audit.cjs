const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto'),assert=require('assert/strict');
const {buildSource,derive}=require('./source-envelope.cjs');
(async()=>{
 const before=JSON.parse(fs.readFileSync('.amphitheater-runs/e1f5d69b-aa17-4fd1-9d7f-e63f6c3114b3/result.json'));
 const after=JSON.parse(fs.readFileSync('.amphitheater-runs/91661973-7d1a-44e6-8647-dcaddd8b6069/result.json'));
 assert.deepEqual(before.letters,after.letters);assert.deepEqual(before.request.field,after.request.field);
 const w=await require('manifold-3d/manifold.js').default();w.setup();const M=w.Manifold;
 const read=m=>new M(new w.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)}));
 const rows=[];
 for(const [name,full] of [['before',before],['after',after]]){
 const reference=read(full.architecture);
 for(let i=0;i<full.request.source.length;i++){
 const out=path.resolve('.amphitheater-runs',randomUUID());fs.mkdirSync(out);
 const request={...full.request,source:full.request.source.filter((_,j)=>i!==j)};
 const result=await buildSource(request,out),other=read(result.architecture);
 const delta=reference.subtract(other).volume()+other.subtract(reference).volume();
 rows.push({stage:name,letter:full.letters[i].id,sourceCenterZ:full.request.source[i].z+30,changedVolume:delta,percent:100*delta/full.volume,components:full.components.filter(c=>c.sources.includes(full.letters[i].id)).map(c=>c.id),exposedArea:full.contributions?.find(c=>c.letter===full.letters[i].id).exposedArea});
 fs.mkdirSync('reports/letter-influence',{recursive:true});fs.writeFileSync('reports/letter-influence/audit.json',JSON.stringify({before:before.id,after:after.id,rows},null,2));console.log(name,i+1,delta.toFixed(2));
 }
 }
 fs.mkdirSync('reports/letter-influence',{recursive:true});
 fs.writeFileSync('reports/letter-influence/audit.json',JSON.stringify({before:before.id,after:after.id,rows},null,2));
 for(const [name,r] of [['before',before],['after',after]]){
 const dir='reports/letter-influence/'+name;fs.mkdirSync(dir,{recursive:true});
 for(const file of ['request.json','result.json','manifest.json','validation.json','intersection-diagnostics.json'])fs.copyFileSync('.amphitheater-runs/'+r.id+'/'+file,dir+'/'+file);
 }
})().catch(e=>{console.error(e);process.exitCode=1});

