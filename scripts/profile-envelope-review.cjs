const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),{randomUUID}=require('crypto'),assert=require('assert/strict');
const cases=[
 ['nine','reports/standalone-profile/nine/before.json'],
 ['twelve','reports/standalone-profile/twelve/before.json']
];
for(const [name,file] of cases){
 const before=JSON.parse(fs.readFileSync(file)),id=randomUUID(),out=path.resolve('.amphitheater-runs',id);
 fs.mkdirSync(out,{recursive:true});const request={...before.request,envelopeVersion:'profiles',sourceName:before.request.sourceName+' · analytic profiles'};
 fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
 const start=performance.now();execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out]);
 const after=JSON.parse(fs.readFileSync(path.join(out,'result.json')));assert.deepEqual(before.letters,after.letters);assert.deepEqual(before.request.source,after.request.source);
 assert.deepEqual(before.request.field,after.request.field);assert.equal(after.validation.selfIntersectionPairs,0);
 const folder='reports/standalone-profile/'+name;fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(folder+'/before.json',JSON.stringify(before));fs.writeFileSync(folder+'/after.json',JSON.stringify(after));
 fs.copyFileSync(path.join(out,'validation.json'),folder+'/validation.json');
 fs.writeFileSync(folder+'/metrics.json',JSON.stringify({id,milliseconds:performance.now()-start,beforeTriangles:before.architecture.indices.length/3,afterTriangles:after.architecture.indices.length/3,beforeVolume:before.volume,afterVolume:after.volume,beforeOperations:before.articulationReport?.operations.length,afterOperations:after.articulationReport.operations.length,validation:after.validation},null,2));
 console.log(name,id,after.volume,after.architecture.indices.length/3,after.articulationReport.operations.length);
}

