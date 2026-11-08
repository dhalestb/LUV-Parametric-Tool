const fs=require('node:fs');
const assert=require('node:assert/strict');
const read=folder=>JSON.parse(fs.readFileSync(__dirname+'/'+folder+'/measurements.json'));
const off=read('spatial-review'),on=read('override-review'),restored=read('restored-review');
const results=off.map((a,i)=>{
 const b=on[i],c=restored[i];
 assert.equal(a.geometryHash,c.geometryHash,'OFF again must restore actual serialized meshes');
 assert.deepEqual(a.items,c.items,'OFF again must restore every placement and diagnostic');
 assert.equal(a.items.length,[7,11,16][i]);
 assert.equal(a.status,'NoError');assert.equal(a.components,1);assert.equal(a.outside,0);
 assert(a.shaftOverlap.every(v=>Math.abs(v)<1e-8));
 assert(a.items.every(t=>!t.overrideActive&&t.allowedYaw.some(v=>Math.abs(v-t.relativeYaw)<1e-8)));
 assert(a.items.every(t=>t.ruleBFrame.worldYaw===t.yaw&&t.ruleBFrame.boundaryTilt===t.localXRotation));
 assert(a.stairs.every(t=>t.connected&&t.finalComponents===1&&t.finalContacts.every(v=>v>0)));
 assert(a.bays.every(t=>Math.abs(t.afterUnionObstructedVolume)<1e-8));
 if(i===0){
  assert(b.items.every(t=>t.overrideActive&&Math.abs(t.relativeYaw-45)<1e-8));
  assert.notEqual(a.geometryHash,b.geometryHash);
  assert.deepEqual(a.items.map(t=>t.sourceIndex),b.items.map(t=>t.sourceIndex));
 }else assert.equal(a.geometryHash,b.geometryHash,'Override outside scope must have no effect');
 return {height:a.field[2],instances:a.items.length,restoredMeshExact:true,defaultYaw:[...new Set(a.items.map(t=>Math.round(t.relativeYaw)))],overrideApplied:i===0,defaultVolume:a.volume,overrideVolume:b.volume,sourceCorrespondence:true};
});
fs.writeFileSync(__dirname+'/orientation-validation.json',JSON.stringify(results,null,2));
console.log(results);
