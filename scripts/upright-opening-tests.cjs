const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const cp = require('child_process');
const THREE = require('three');
require('../proof/rule-amphitheater.cjs');
const {derive} = require('./source-envelope.cjs');
const {populate} = require('../src/components/sourcePopulation.ts');
const {getLetterShape} = require('../src/components/letterGeometry3d.ts');
const {featurePoints} = require('./source-profile-envelope.cjs');

function run(request, out) {
  fs.mkdirSync(out,{recursive:true});
  const input=path.join(out,'request.json');
  fs.writeFileSync(input,JSON.stringify(request));
  const began=performance.now();
  cp.execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',input,out],{stdio:'pipe'});
  const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
  return {result,milliseconds:performance.now()-began};
}
const rows=[];
for (const seed of [19,21,24]) {
  const out=path.resolve('proof/interactive-check/upright',String(seed));
  const field={width:40,depth:40,height:60},count=seed===24?12:8;
  const source=populate([],count,field,13,seed,{envelopeRoles:true});
  const request={generator:'source-preserving',envelopeVersion:'vertical-walls',field,preferredFeet:13,population:count,sourceId:'upright-'+seed,sourceName:'Upright letter study '+seed,source};
  const {result,milliseconds}=run(request,out);
  assert.deepEqual(result.letters,derive(request).letters);
  assert(result.validation.passed && result.validation.selfIntersectionPairs===0);
  assert.equal(result.articulationReport.components,1);
  assert(result.contributions.every(c=>c.exposedArea>=1));
  for(const opening of result.boundaryReport.voids) {
    const index=result.letters.findIndex(letter=>letter.id===opening.source);
    const p=request.source[index];
    assert.equal(p.rx,90);
    assert.equal(p.ry,0);
    const matrix=new THREE.Matrix4().fromArray(opening.sourceMatrix);
    const localNormal=new THREE.Vector3(0,0,1).transformDirection(matrix);
    const axis=new THREE.Vector3(...opening.axis);
    assert(Math.abs(localNormal.dot(axis))>1-1e-10);
    assert(Math.abs(axis.z)<1e-10);
    const glyph=getLetterShape(p.letter),center=new THREE.Box2().setFromPoints(glyph.getPoints(16)).getCenter(new THREE.Vector2());
    const spans={L:[2,4],U:[5,9],V:[1,3]};
    const points=featurePoints({curves:glyph.curves.slice(...spans[p.letter])},p.scale*Math.max(p.scaleX,p.scaleY));
    if(p.letter==='L')points.push(new THREE.Vector2(points[0].x,points.at(-1).y));
    assert.equal(points.length,opening.sourceContour.length);
    points.forEach((point,i)=>{
      const expected=new THREE.Vector3(point.x-center.x,point.y-center.y,0).applyMatrix4(matrix);
      assert(expected.distanceTo(new THREE.Vector3(...opening.sourceContour[i]))<1e-8);
    });
    assert(opening.removedVolume>1e-6);
    assert(opening.removedMesh.indices.length>0);
    if(opening.alcove)assert(opening.approach.obstructionFt3<=1e-8);
  }
  rows.push({seed,count:result.sourceCount,milliseconds,triangles:result.architecture.indices.length/3,
    volume:result.volume,validation:result.validation,openings:result.boundaryReport.voids.map(v=>({source:v.source,yaw:v.yaw,tilt:v.tilt,axis:v.axis,removed:v.removedVolume,alcove:v.alcove}))});
}
const baseDir=path.resolve('proof/interactive-check/upright/19');
const original=JSON.parse(fs.readFileSync(path.join(baseDir,'result.json')));
const edited=structuredClone(original.request);
const interior=edited.source.find(p=>p.architecturalRole==='interior'&&p.voidKind==='alcove');
interior.alcoveDepth=4;
const {result:depth}=run(edited,path.resolve('proof/interactive-check/upright/depth'));
assert.deepEqual(depth.letters,original.letters);
assert.notDeepEqual(depth.architecture,original.architecture);
assert.equal(depth.articulationReport.operations.find(o=>o.alcove).depth,4);
fs.mkdirSync('reports/upright-letters',{recursive:true});
fs.writeFileSync('reports/upright-letters/validation.json',JSON.stringify({passed:true,rows,depthEdit:{identicalSources:true,changedArchitecture:true,depth:4}},null,2));
console.log('PASS three upright studies, exact contour correspondence, horizontal axes, visible contributions, strict exported solids and preserved-source depth regeneration.');
