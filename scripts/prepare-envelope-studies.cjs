// Local-only seeding; never uploads to Blob or overwrites an existing study.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixtureStudy}=require('./envelope-fixture.cjs');
if(process.env.VERCEL||process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID)throw Error('Run in a local checkout without Vercel/Blob variables; this command seeds local storage only.');
const target=path.resolve(process.argv[2]||'.amphitheater-runs');
for(const study of require('../proof/fixtures/envelope-studies.json')){
 const request=require('../proof/fixtures/'+study.name+'.json'),folder=path.join(target,study.id),file=path.join(folder,'result.json');
 if(fs.existsSync(file)){assert.deepEqual(JSON.parse(fs.readFileSync(file)).request,request,'Existing study differs; nothing overwritten: '+file);console.log('Preserved existing '+study.name);continue;}
 // A pre-existing partial folder is also preserved, rather than silently reused.
 if(fs.existsSync(folder))throw Error('Study folder already exists: '+folder);
 const result=fixtureStudy(study.name);assert.deepEqual(result.request.source,request.source);result.id=study.id;
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,JSON.stringify(result),{flag:'wx'});
 console.log(study.name+' · '+result.architecture.indices.length/3+' triangles · '+result.volume.toFixed(3)+' ft³ · /amphitheater?study='+study.id);
}
