// Read-only Phase 1 experiment. No evaluated source files are changed.
require('../../scripts/ts-test-register.cjs');
const fs = require('fs');
const assert = require('node:assert/strict');
const {buildV4Context, evaluateV4} = require('../../src/components/evaluations/v4/evaluateV4.ts');
function fixture(kind) {
  const positions=[], faces=[];
  function quad(a,b,c,d) { const ids=[a,b,c,d].map(p=>{positions.push(...p);return positions.length/3-1;});faces.push({vertices:ids}); }
  const plate=z=>quad([0,0,z],[30,0,z],[30,30,z],[0,30,z]);
  const wall=(x,y0,y1)=>quad([x,y0,0],[x,y1,0],[x,y1,12],[x,y0,12]);
  plate(0);plate(12);wall(0,0,30);wall(30,0,30);
  quad([0,0,0],[30,0,0],[30,0,12],[0,0,12]);quad([0,30,0],[30,30,0],[30,30,12],[0,30,12]);
  if(kind==='sealed partition')wall(15,0,30);
  if(kind==='doorway partition'){wall(15,0,13);wall(15,17,30);quad([15,13,8],[15,17,8],[15,17,12],[15,13,12]);}
  return {positions:Float32Array.from(positions),faces,up:'z',unitScale:1};
}
const colors=['#D6AD4F','#43A9CF','#92C78B','#CD91B4','#AFA0DC'];
const findings=[];let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="490" viewBox="0 0 1200 490"><rect width="1200" height="490" fill="#101820"/><text x="20" y="25" fill="white" font-size="18">Existing segmentation: controlled 30 × 30 ft rooms, plan view</text>';
['open room','doorway partition','sealed partition'].forEach((kind,panel)=>{
  const source=fixture(kind), ctx=buildV4Context(source,kind), network=ctx.network;
  const valid=new Set(network.regions.map(r=>r.id)), links=new Set();let walkCross=0,stepCross=0,ignored=0;
  for(const e of network.edges){const a=network.nodes[e.a],b=network.nodes[e.b];if(a.regionId!==b.regionId&&valid.has(a.regionId)&&valid.has(b.regionId)){links.add([a.regionId,b.regionId].sort((a,b)=>a-b).join(':')); if(e.kind==='walk')walkCross++;else stepCross++;} if(a.regionId<0||b.regionId<0)ignored++;}
  const result=evaluateV4(source,kind).descriptors.find(d=>d.id==='centralized');
  findings.push({fixture:kind,floorSamples:ctx.field.samples.length,regions:network.regions.length,sampleEdges:network.edges.length,regionEdges:links.size,walkEdgesAcrossRegions:walkCross,stepEdgesAcrossRegions:stepCross,edgesTouchingDiscardedRegions:ignored,score:Number.isFinite(result.absoluteScore)?result.absoluteScore:null,reason:result.unavailableReason});
  const x0=30+panel*400,y0=75,scale=10;
  svg+=`<text x="${x0}" y="55" fill="white" font-size="16">${kind}</text>`;
  const cells=new Map(network.nodes.filter(n=>n.regionId>=0).map(n=>{const s=ctx.field.samples[n.sampleId];return [`${s.ix}:${s.iy}`,n.regionId];}));
  for(const n of network.nodes){if(n.regionId<0)continue;const s=ctx.field.samples[n.sampleId];svg+=`<rect x="${x0+s.ix*scale}" y="${y0+s.iy*scale}" width="10" height="10" fill="${colors[n.regionId%colors.length]}"/>`;for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){if(cells.get(`${s.ix+dx}:${s.iy+dy}`)===n.regionId)continue;const ax=x0+(s.ix+(dx===1?1:0))*scale,ay=y0+(s.iy+(dy===1?1:0))*scale;svg+=`<path d="M${ax} ${ay} l${dx===0?10:0} ${dy===0?10:0}" stroke="#fff" stroke-width="1.4"/>`;}}
  if(kind!=='open room'){const wall=(a,b)=>`<line x1="${x0+150}" y1="${y0+a*10}" x2="${x0+150}" y2="${y0+b*10}" stroke="#111" stroke-width="4"/>`;svg+=kind==='sealed partition'?wall(0,30):wall(0,13)+wall(17,30);}
  svg+=`<text x="${x0}" y="410" fill="white" font-size="14">${network.regions.length} region(s), ${links.size} region edges</text><text x="${x0}" y="435" fill="#bbb" font-size="12">${network.edges.length} sample movement edges</text>`;
});
svg+='<text x="20" y="470" fill="#ccc" font-size="12">Colors = existing walk-component region IDs. White = sampled region boundaries. Black = source partition. No reconstruction.</text></svg>';
assert.deepEqual(findings.map(f=>f.regions),[1,1,2]);
assert.ok(findings.every(f=>f.walkEdgesAcrossRegions===0&&f.regionEdges===0));
assert.ok(findings[1].sampleEdges>findings[2].sampleEdges,'The opening must create real sample connectivity even though the collapsed region graph loses it.');
fs.writeFileSync(__dirname+'/controlled-regions.svg',svg);fs.writeFileSync(__dirname+'/controlled-results.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings,null,2));
