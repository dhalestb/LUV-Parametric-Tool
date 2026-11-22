require('../../scripts/ts-test-register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {parseObj} = require('../../src/components/lattice/parseObj.ts');
const {buildV4Context, evaluateV4} = require('../../src/components/evaluations/v4/evaluateV4.ts');
const {reconstructArchitecturalRegions} = require('../../src/components/evaluations/v4/architecturalRegions.ts');
const dir = process.argv[2];
if (!dir) throw new Error('Provide the directory containing the three original OBJ files.');
const references = JSON.parse(fs.readFileSync(path.join(__dirname, '../centralized-phase2/model-evidence.json'), 'utf8'));
const summaries = [];
for (const reference of references) {
  const raw = fs.readFileSync(path.join(dir, reference.filename));
  const model = parseObj(raw.toString('utf8'), reference.filename);
  const source = {positions:model.positions, faces:model.faces, up:'z', unitScale:1};
  const original = Buffer.from(model.positions.buffer).toString('base64');
  const ctx = buildV4Context(source, reference.result.sourceId);
  assert.equal(ctx.mesh.sourceHash, reference.result.sourceHash);
  const before = evaluateV4(source, reference.result.sourceId);
  const result = reconstructArchitecturalRegions(ctx, {enabled:true});
  assert.deepEqual(result, reconstructArchitecturalRegions(ctx, {enabled:true}));
  assert.deepEqual(before, evaluateV4(source, reference.result.sourceId));
  assert.equal(Buffer.from(model.positions.buffer).toString('base64'), original);
  const verified = result.movementConnections.filter(c => c.status === 'verified');
  const originalEdges = new Set(ctx.network.edges.map(e => [e.a,e.b].sort((a,b)=>a-b).join(':')));
  for (const c of verified) {
    const pairs = c.type === 'vertical-chain' ? c.chainNodeIds.slice(1).map((id,i)=>[c.chainNodeIds[i],id]) : c.sampleNodePairs;
    assert.ok(pairs.every(p=>originalEdges.has([...p].sort((a,b)=>a-b).join(':'))));
  }
  const neighbors = result.regions.map(()=>new Set());
  for (const c of verified) {neighbors[c.from].add(c.to);neighbors[c.to].add(c.from);}
  const seen = new Set(); let components=0;
  for (const r of result.regions) if (!seen.has(r.id)) {
    components++; const queue=[r.id]; seen.add(r.id);
    for(let i=0;i<queue.length;i++) for(const next of neighbors[queue[i]]) if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  const counts = list => list.reduce((out,c)=>{const key=c.type+':'+c.status;out[key]=(out[key]||0)+1;return out;},{});
  const item={filename:reference.filename,sha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceHash:ctx.mesh.sourceHash,
    originalRegions:result.originalRegions,experimentalRegions:result.regions.length,smallFragments:result.regions.filter(r=>r.transitional).length,
    verifiedMovementRecords:verified.length,verifiedMovementPairs:new Set(verified.map(c=>c.from+':'+c.to)).size,
    verifiedMovementComponents:components,isolatedRegions:neighbors.filter(n=>!n.size).length,
    movementRecords:counts(result.movementConnections),productionCentralized:before.descriptors.find(d=>d.id==='centralized').absoluteScore,
    detectedLevels:ctx.field.levels.map(l=>({id:l.id,minZ:l.minZ,maxZ:l.maxZ,elevation:l.elevation})),
    sourceAndProductionResultsUnchanged:true};
  summaries.push(item); console.log(JSON.stringify(item));
}
fs.writeFileSync(path.join(__dirname,'model-verification.json'),JSON.stringify(summaries,null,2));
