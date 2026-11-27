const fs=require('node:fs');
const assert=require('node:assert/strict');
const rows=JSON.parse(fs.readFileSync(__dirname+'/field-review/measurements.json'));
for(const row of rows){
 assert.equal(row.geometry.status,'NoError');
 assert.equal(row.geometry.components,1);
 assert.equal(row.geometry.outside,0);
 assert.equal(row.geometry.sourceOutside,0);
 assert(Math.abs(row.geometry.focusArchitectureOverlap)<1e-8);
 assert(Math.abs(row.geometry.focusSourceOverlap)<1e-8);
 assert(row.pockets.every(p=>Math.abs(p.finalObstruction)<1e-8));
 assert(row.items.every(t=>!t.overrideActive&&t.allowedYaw.some(a=>Math.abs(a-t.relativeYaw)<1e-8)));
 assert(row.components.every(c=>c.sources.every(s=>row.items.some(i=>i.id===s))));
 assert.equal(row.majorLevelSpacing,12);
 assert(row.majorLevels.slice(1).every((z,i)=>Math.abs(z-row.majorLevels[i]-12)<1e-8));
}
assert.equal(rows[0].letterCount,7);
assert(rows[1].letterCount>rows[0].letterCount);
assert.notEqual(rows[0].geometry.geometryHash,rows[1].geometry.geometryHash);
assert(rows[1].items.some(t=>Math.abs(t.center[0])>10||Math.abs(t.center[1])>10));
fs.writeFileSync(__dirname+'/field-review/geometry-validation.json',JSON.stringify({passed:true,fields:rows.map(r=>({field:r.field,population:r.letterCount,levels:r.levels,hash:r.geometry.geometryHash,shellVolumes:r.geometry.shells.map(s=>s.volume)}))},null,2));
console.log('PASS actual solid, provenance, independent plan development, opening and dimensional checks');
