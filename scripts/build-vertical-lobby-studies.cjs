// Bake the checkpoint's verified Rule A/B engine outputs for offline browser placement.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {project,siteAxes}=require('./build-allocated-studies.cjs');
const catalog={
  vertical:{type:'vertical-void-lobby',name:'Vertical Void Lobby',variant:'vertical-stack',engine:'bf7fc3c',
    manifest:'vertical-lobby-stacks.json',heights:[20,40,60],maxCount:10,field:height=>({width:40,depth:40,height})},
  compressed:{type:'compressed-sequential-lobby',name:'Compressed Sequential Lobby',variant:'sequential-shell',engine:'bfce854',
    manifest:'compressed-lobby-sequences.json',heights:[20],maxCount:15,
    field:(height,count)=>({width:count<=5?20:count<=10?40:60,depth:20,height}),
    reference:require('../src/components/polygonExperiment/compressed-lobby-reference.json')},
  linear:{type:'linear-gallery-lobby',name:'Linear Gallery Lobby',variant:'linear-gallery',engine:'bfce854',
    manifest:'linear-lobby-galleries.json',heights:[20],maxCount:15,field:height=>({width:40,depth:20,height}),
    reference:require('../src/components/polygonExperiment/linear-lobby-reference.json')},
  topographic:{type:'topographic-ground-field-lobby',name:'Topographic / Ground-Field Lobby',variant:'spiral-ground-field',engine:'bfce854',
    manifest:'topographic-lobby-fields.json',heights:[20,40,60],maxCount:15,field:height=>({width:height,depth:height,height}),
    reference:require('../src/components/polygonExperiment/topographic-lobby-reference.json')},
};
const family=process.argv[2]?.replace(/^--/,'')??'vertical';
const config=catalog[family];
if(!config)throw Error('Unknown lobby family: '+family);
const {type,engine:revision}=config;
const engine=path.resolve(__dirname,'../vendor/lobby-'+revision);
require(engine+'/proof/rule-amphitheater.cjs');
const {populateLobby}=require(engine+'/src/components/lobbyProof.ts');
const {buildSource}=require(engine+'/scripts/source-envelope.cjs');
const checkpoint='a6493b62cb784e7ccacc327dbe8dc90a604f1e48';
const output=path.resolve(__dirname,'../public/allocated-studies',type);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const spacing=family==='linear'?require('../vendor/lobby-spacing-checkpoint/lobbySpacingRules.ts'):null;
async function bake(w,height,count,key,referenceOnly=false){
  const field=config.field(height,count);
  const preferredFeet=13;
  const reference=config.reference;
  const replay=reference&&(spacing?referenceOnly:height===reference.request.field.height&&count===reference.sourceCount);
  let source=replay?reference.request.source:populateLobby(type,preferredFeet,count,field,'proximity',spacing?['L','U']:undefined).source;
  if(spacing&&!replay)source=spacing.applyFixedLobbySpacing(type,source,revision,field);
  assert.equal(source.length,count,'Requested population differs from native Rule A');
  const request={field,source,preferredFeet,population:count,proof:'lobby',organization:'proximity',
    generator:'source-preserving',typologyName:config.name,articulationElevation:'feature',articulation:.75};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'luv-vertical-void-'));
  try{
    const result=await buildSource(request,dir);
    fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify(request));
    fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result));
    execFileSync(process.execPath,[engine+'/proof/rule-validation.cjs',dir],{stdio:'pipe',windowsHide:true});
    if(spacing){
      if(!replay)spacing.assertLobbySpacing(spacing.measureLobbyMeshSpacing(type,source,result.letters));
      // Match the historical study 77 and the later eight-letter fixed-spacing checkpoint.
      if(replay||count===8){
        const expected=replay?[
          '5cefef1a5db5207eaa60cab0b3cf207ab753538de75ef116f697e76eb5b08b9f',
          '2352bb02ed87d662be74461e462e7a17e84649450d9f056e3d12f5598894a0fe',
          '73571e155514e680804e2d6680138a1fc8167b80cfee6489f552e61b03e0be45'
        ]:[
          '4568b038f808b8d8966709892822a8557c98a7cda9225cbbe2e39adb0493f609',
          '48b2acb31ccc355165cd1c4e772d768e95a4af8bbaa3f8a3b8f6cec4266bdc9d',
          '842fa9d80d6fb52ec4d5612e4e6dc908db31d3a7e6d8564983646f5b45fa8886'
        ];
        assert.deepEqual([source,result.architecture.positions,result.architecture.indices].map(v=>hash(JSON.stringify(v))),expected);
      }
    }
    if(family==='compressed'&&replay){
      // Saved checkpoint study 66, before conversion to Y-up site coordinates.
      assert.equal(hash(JSON.stringify(source)),'714694a560cff04b6675655715ec36bcdd1d8e8fcef0176332721ad8bbfa56c1');
      assert.equal(hash(JSON.stringify(result.architecture.positions)),'d19ddf6254fc4b060af8b5cc251b427bd3ac3b7f53694337a51e48cdfe35370c');
      assert.equal(hash(JSON.stringify(result.architecture.indices)),'a22b6e3d33bbd814ef57999dc7be82a6b4810425b536a3dc647b1da2d64dd632');
    }
    if(family==='topographic'&&replay){
      // Saved checkpoint study 65, before conversion to Y-up site coordinates.
      assert.equal(hash(JSON.stringify(source)),'3835def5da7583cd5822539efd713511347ffca369ceae0fb01f1d4a64f67afe');
      assert.equal(hash(JSON.stringify(result.architecture.positions)),'ade987dc04e53a622950eb0daf1d1f2879b29195c802fd6d99e8b047b65ab57b');
      assert.equal(hash(JSON.stringify(result.architecture.indices)),'af399da1c4fb8f958a9a97e93f76af4915910eabb3c72141641b0e90783e2daf');
    }
    if(family==='vertical'&&height===40&&count===10){
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
    // The ground-field reference sits above the bottom of its modeling cube.
    // Place its lowest architectural surface at the site's elevation datum.
    let datum=0;
    if(family==='topographic'){
      datum=Infinity;
      for(let i=1;i<architecture.positions.length;i+=3)datum=Math.min(datum,architecture.positions[i]);
    }
    const data={type,datum,envelope:hull.toPolygons()[0],metrics:{sourceArea:a.area(),footprintArea:b.area()},
      architecture,letters,components:[{id:'formed-lobby',sources:letters.map(l=>l.id),mesh:architecture}],
      provenance:{checkpoint,engine:revision,variant:config.variant,request,selfIntersectionPairs:0,
        ...(spacing?(replay?{referenceStudy:77}:{spacingRuleRevision:spacing.LOBBY_SPACING_REVISION}):{})}};
    for(const shape of [hull,joined,a,b,...plans])shape.delete();
    const bytes=Buffer.from(JSON.stringify(data));
    fs.writeFileSync(path.join(output,key+'.json.gz'),gzipSync(bytes,{level:9}));
    return hash(bytes);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
async function main(){
  const w=await require('manifold-3d/manifold.js').default();w.setup();
  fs.mkdirSync(output,{recursive:true});
  const manifest={};
  const {heights,maxCount}=config;
  for(const height of heights)for(let count=2;count<=maxCount;count++){
    const key=height+'-'+count;
    try{manifest[key]=await bake(w,height,count,key);console.log('Validated',key);}
    catch(e){console.error('Rejected',key,String(e.message).slice(0,180));}
  }
  assert.equal(Object.keys(manifest).length,heights.length*(maxCount-1),'All registered lobby sizes must validate');
  if(spacing)manifest['reference-77']=await bake(w,config.reference.request.field.height,config.reference.sourceCount,'reference-77',true);
  fs.writeFileSync(path.resolve(__dirname,'../src/components/polygonExperiment',config.manifest),JSON.stringify(manifest,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
