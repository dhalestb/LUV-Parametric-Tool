// Bake the checkpoint's verified Rule A/B engine outputs for offline browser placement.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {project,siteAxes}=require('./build-allocated-studies.cjs');
// Pass --compressed to bake the sequential shells with their own pinned engine.
const compressed=process.argv.includes('--compressed');
const revision=compressed?'bfce854':'bf7fc3c';
const engine=path.resolve(__dirname,'../vendor/lobby-'+revision);
require(engine+'/proof/rule-amphitheater.cjs');
const {populateLobby}=require(engine+'/src/components/lobbyProof.ts');
const {buildSource}=require(engine+'/scripts/source-envelope.cjs');
const type=compressed?'compressed-sequential-lobby':'vertical-void-lobby',checkpoint='a6493b62cb784e7ccacc327dbe8dc90a604f1e48';
const output=path.resolve(__dirname,'../public/allocated-studies',type);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bake(w,height,count){
  const field=compressed?{width:count<=5?20:count<=10?40:60,depth:20,height}:{width:40,depth:40,height};
  const preferredFeet=13;
  // Study 66 retains the approved, saved letter poses. Other counts use native Rule A.
  const source=compressed&&count===15
    ? require('../src/components/polygonExperiment/compressed-lobby-reference.json').request.source
    : populateLobby(type,preferredFeet,count,field).source;
  const request={field,source,preferredFeet,population:count,proof:'lobby',organization:'proximity',
    generator:'source-preserving',typologyName:compressed?'Compressed Sequential Lobby':'Vertical Void Lobby',articulationElevation:'feature',articulation:.75};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'luv-vertical-void-'));
  try{
    const result=await buildSource(request,dir);
    fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(request));
    fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result));
    execFileSync(process.execPath,[engine+'/proof/rule-validation.cjs',dir],{stdio:'pipe',windowsHide:true});
    if(compressed&&count===15){
      // Saved checkpoint study 66, before conversion to Y-up site coordinates.
      assert.equal(hash(JSON.stringify(source)),'714694a560cff04b6675655715ec36bcdd1d8e8fcef0176332721ad8bbfa56c1');
      assert.equal(hash(JSON.stringify(result.architecture.positions)),'d19ddf6254fc4b060af8b5cc251b427bd3ac3b7f53694337a51e48cdfe35370c');
      assert.equal(hash(JSON.stringify(result.architecture.indices)),'a22b6e3d33bbd814ef57999dc7be82a6b4810425b536a3dc647b1da2d64dd632');
    }
    if(!compressed&&height===40&&count===10){
      // The checkpoint's study 26 ("Vertical Final"), before changing coordinate axes.
      assert.equal(hash(JSON.stringify(source)),'a0848aaedb8a52ee6c85ff101e684f71be7907b3434223b4eecab17d334352ea');
      assert.equal(hash(JSON.stringify(result.architecture.positions)),'ca0102b1f113484a99cf34078afc5e256ee9259060bb2dbaa750dccbed9c667e');
      assert.equal(hash(JSON.stringify(result.architecture.indices)),'e020987fbf9ae361911c21fcf58aa4442648fbf461c30c3bd8659af8c8389aa3');
    }
    const validation=JSON.parse(fs.readFileSync(path.join(dir,'validation.json')));
    assert(validation.passed&&validation.selfIntersectionPairs===0);
    const architecture=siteAxes(result.architecture);
    const letters=result.letters.map((l,i)=>({id:l.id,letter:source[i].letter,nominalSizeFeet:source[i].scale*.92,mesh:siteAxes(l.mesh)}));
    const b=project(w,architecture),plans=letters.map(l=>project(w,l.mesh)),a=w.CrossSection.union(plans);
    const joined=a.add(b),hull=joined.hull();
    const data={type,datum:0,envelope:hull.toPolygons()[0],metrics:{sourceArea:a.area(),footprintArea:b.area()},
      architecture,letters,components:[{id:'formed-lobby',sources:letters.map(l=>l.id),mesh:architecture}],
      provenance:{checkpoint,engine:revision,variant:compressed?'sequential-shell':'vertical-stack',request,selfIntersectionPairs:0}};
    for(const shape of [hull,joined,a,b,...plans])shape.delete();
    const bytes=Buffer.from(JSON.stringify(data));
    fs.writeFileSync(path.join(output,height+'-'+count+'.json.gz'),gzipSync(bytes,{level:9}));
    return hash(bytes);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
async function main(){
  const w=await require('manifold-3d/manifold.js').default();w.setup();
  fs.mkdirSync(output,{recursive:true});
  const manifest={};
  const heights=compressed?[20]:[20,40,60],maxCount=compressed?15:10;
  for(const height of heights)for(let count=2;count<=maxCount;count++){
    const key=height+'-'+count;
    try{manifest[key]=await bake(w,height,count);console.log('Validated',key);}
    catch(e){console.error('Rejected',key,String(e.message).slice(0,180));}
  }
  assert.equal(Object.keys(manifest).length,heights.length*(maxCount-1),'All registered lobby sizes must validate');
  fs.writeFileSync(path.resolve(__dirname,'../src/components/polygonExperiment',compressed?'compressed-lobby-sequences.json':'vertical-lobby-stacks.json'),JSON.stringify(manifest,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
