const fs=require('fs'),path=require('path'),assert=require('assert/strict');
require('../proof/rule-amphitheater.cjs');
const {studyOBJ,pngWithDpi}=require('../src/components/amphitheaterPresentationExport.ts');
const result=require('./envelope-fixture.cjs').fixtureStudy('presentation-export-base');
const output=path.resolve('proof/interactive-check/presentation-export');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const rows=[];
 for(const kind of ['letters','form']){
  const original=kind==='letters'?result.letters.map(l=>l.mesh):[result.architecture];
  const text=studyOBJ(result,kind),vertices=[],faces=[],names=[];
  for(const line of text.split('\n')){
   if(line.startsWith('v '))vertices.push(line.slice(2).split(' ').map(Number));
   if(line.startsWith('f '))faces.push(line.slice(2).split(' ').map(n=>Number(n.split('/')[0])));
   if(line.startsWith('o '))names.push(line.slice(2));
  }
  assert.equal(vertices.length,original.reduce((sum,m)=>sum+m.positions.length/3,0));
  assert.equal(faces.length,original.reduce((sum,m)=>sum+m.indices.length/3,0));
  assert(faces.flat().every(n=>Number.isSafeInteger(n)&&n>=1&&n<=vertices.length));
  assert.deepEqual(names,kind==='letters'?result.letters.map(l=>l.id):['architecture']);
  const expected=original.flatMap(m=>m.positions);
  vertices.flat().forEach((value,i)=>assert(Math.abs(value-expected[i])<1e-5));
  fs.writeFileSync(path.join(output,kind+'.obj'),text);
  rows.push({kind,vertices:vertices.length,faces:faces.length,objects:names});
 }
 const sharp=require('sharp');
 const png=await sharp({create:{width:4,height:4,channels:4,background:'#71BEDA'}}).png().toBuffer();
 const updated=Buffer.from(await (await pngWithDpi(new Blob([png]))).arrayBuffer());
 const metadata=await sharp(updated).metadata();
 assert.equal(metadata.density,300);
 const decoded=await sharp(updated).raw().toBuffer();
 assert.deepEqual([...decoded.slice(0,4)],[113,190,218,255]);
 assert.throws(()=>studyOBJ({...result,architecture:{positions:[0,0,0],indices:[0,1,2]}},'form'),/invalid/);
 fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify({passed:true,rows,dpi:metadata.density},null,2));
 console.log('PASS source/form OBJ groups, global indices, coordinates, geometry rejection and lossless 300 ppi PNG metadata.');
})().catch(e=>{console.error(e);process.exitCode=1});
