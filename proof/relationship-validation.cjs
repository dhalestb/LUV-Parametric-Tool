const fs=require('node:fs');
const assert=require('node:assert/strict');
const rows=JSON.parse(fs.readFileSync(__dirname+'/relationship-review/measurements.json'));
const checks=[];
for(const [index,row] of rows.entries()){
 assert.equal(row.letterCount,[7,11,16][index]);
 assert(row.levelCount<row.letterCount);
 assert(row.groups.some(g=>g.length>1));
 assert.equal(row.geometry.status,'NoError');
 assert.equal(row.geometry.components,1);
 assert.equal(row.geometry.outside,0);
 assert.equal(row.geometry.sourceOutside,0);
 assert(Math.abs(row.geometry.focusArchitectureOverlap)<1e-8);
 assert(Math.abs(row.geometry.focusSourceOverlap)<1e-8);
 assert(row.components.every(c=>c.sources.length&&c.sources.every(id=>row.items.some(t=>t.id===id))));
 assert(row.components.some(c=>c.sources.length>1));
 assert(row.items.every(t=>t.allowedYaw.some(v=>Math.abs(v-t.relativeYaw)<1e-8)&&!t.overrideActive));
 assert(row.pockets.every(p=>Math.abs(p.finalObstruction)<1e-8&&p.removedFromArchitecture>0));
 assert(row.levels.every((z,i)=>i===0||z>row.levels[i-1]));
 checks.push({height:row.height,instances:row.letterCount,sharedLevels:row.levelCount,componentProvenance:true,sourceContainment:true,focusClear:true,positiveMaterialShells:row.geometry.components,signedShellVolumes:row.geometry.shells.map(s=>s.volume),actualHeight:row.geometry.bounds.max[2]-row.geometry.bounds.min[2]});
}
fs.writeFileSync(__dirname+'/relationship-review/validation.json',JSON.stringify(checks,null,2));
console.log(checks);
