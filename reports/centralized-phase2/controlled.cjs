require('../../scripts/ts-test-register.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {buildV4Context}=require('../../src/components/evaluations/v4/evaluateV4.ts');
const {reconstructArchitecturalRegions}=require('../../src/components/evaluations/v4/architecturalRegions.ts');
const {regionDiagnosticSvg}=require('../../src/components/evaluations/v4/architecturalRegionDiagnostics.ts');
function room(partition){const positions=[],faces=[];const quad=(...p)=>{faces.push({vertices:p.map(v=>{positions.push(...v);return positions.length/3-1;})});};const wall=(x,a,b)=>quad([x,a,0],[x,b,0],[x,b,12],[x,a,12]);
for(const z of [0,12])quad([0,0,z],[30,0,z],[30,30,z],[0,30,z]);wall(0,0,30);wall(30,0,30);for(const y of [0,30])quad([0,y,0],[30,y,0],[30,y,12],[0,y,12]);if(partition==='doorway'){wall(15,0,13);wall(15,17,30);}if(partition==='sealed')wall(15,0,30);return {positions:Float32Array.from(positions),faces,up:'z',unitScale:1};}
const results=[];
for(const name of ['open','doorway','sealed']){const ctx=buildV4Context(room(name),name),r=reconstructArchitecturalRegions(ctx,{enabled:true});
const count=r.movementConnections.filter(c=>c.status==='verified').length;assert.equal(r.regions.length,name==='open'?1:2);assert.equal(count,name==='doorway'?1:0);
for(const old of [true,false])fs.writeFileSync(path.join(__dirname,`controlled-${name}-${old?'before':'after'}.svg`),regionDiagnosticSvg(ctx,r,{old,levelId:0}));
results.push({fixture:name,originalRegions:r.originalRegions,originalRegionEdges:r.originalRegionEdges,newRegions:r.regions.length,movementConnections:count,organizationalRelationships:r.organizationalRelationships.map(c=>({type:c.type,status:c.status,navigable:c.navigable}))});}
fs.writeFileSync(path.join(__dirname,'controlled-summary.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
