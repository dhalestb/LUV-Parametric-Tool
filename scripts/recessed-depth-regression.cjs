const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const outRoot=path.resolve('proof/interactive-check/recessed-studies');
const reportPath='reports/vertical-envelope/recessed-validation.json';
const results=[37,1486017266,19].map(seed=>{
 const r=JSON.parse(fs.readFileSync(path.join(outRoot,String(seed),'result.json')));
 return {seed,sourceCount:r.sourceCount,volume:r.volume,triangles:r.architecture.indices.length/3,components:r.articulationReport.components,selfIntersections:r.validation.selfIntersectionPairs,trianglePairs:r.validation.nonAdjacentTriangleChecks,openingKinds:r.articulationReport.operations.map(o=>[o.sources[0],o.kind,o.depth]),minimumExposedArea:Math.min(...r.contributions.map(c=>c.exposedArea))};
});
const previous=JSON.parse(fs.readFileSync(path.join(outRoot,'37','result.json')));
const request=structuredClone(previous.request);
request.source.find(p=>p.voidKind==='alcove').alcoveDepth=4;
const out=path.join(outRoot,'depth-edit');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
cp.execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out],{stdio:'pipe'});
const edited=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
assert.deepEqual(previous.letters,edited.letters);
assert.notDeepEqual(previous.architecture,edited.architecture);
assert.equal(edited.articulationReport.operations.find(o=>o.alcove).depth,4);
assert.equal(edited.validation.selfIntersectionPairs,0);
fs.writeFileSync(reportPath,JSON.stringify({generatedStudies:results,depthEdit:{previous:previous.articulationReport.operations.find(o=>o.alcove).depth,edited:4,identicalSourceMeshes:true,previousVolume:previous.volume,editedVolume:edited.volume,selfIntersections:0}},null,2));
console.log(fs.readFileSync(reportPath,'utf8'));