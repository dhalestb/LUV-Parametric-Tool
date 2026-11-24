// Deterministic Phase 1.5 benchmark; no placement search. Examples:
// node scripts/l1-performance.cjs --ref=6a839db --label=phase1 --profile
// node scripts/l1-performance.cjs --label=optimized
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const ref = arg('ref'), label = arg('label') ?? 'optimized', profile = process.argv.includes('--profile');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
require.extensions['.ts'] = (module, filename) => {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  let source = ref && relative.startsWith('src/components/lattice/')
    ? cp.execFileSync('git', ['show', `${ref}:${relative}`], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 })
    : fs.readFileSync(filename, 'utf8');
  if (profile && relative.startsWith('src/components/lattice/')) {
    const stages = { assessPortPair: 'port candidate assessment', detectFeatures: 'organic feature extraction',
      measureSurfaceGap: 'triangle distance queries', portAttachmentMeets: 'port attachment resolution',
      synthesizeConnectors: 'connection synthesis' };
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true), edits = [];
    for (const node of ast.statements) if (ts.isFunctionDeclaration(node) && stages[node.name?.text]) {
      edits.push({ at: node.body.getStart(ast) + 1, text: `\nconst stopProfile=profileTiming(${JSON.stringify(stages[node.name.text])});try{\n` });
      edits.push({ at: node.body.end - 1, text: '\n}finally{stopProfile();}\n' });
    }
    function visit(node) {
      if (ts.isForOfStatement(node) && relative.endsWith('/connectionClearance.ts')) {
        const expr = node.expression.getText(ast);
        const stage = expr === 'transitionSections(pair)' ? 'headroom validation' : ['tris', 'connectorTriangles()'].includes(expr) ? 'triangle collision testing' : null;
        if (stage) {
          edits.push({ at: node.getStart(ast), text: `{const stopLoop=profileTiming(${JSON.stringify(stage)});try{` });
          edits.push({ at: node.end, text: '}finally{stopLoop();}}' });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const e of edits.sort((a,b) => b.at-a.at)) source = source.slice(0,e.at)+e.text+source.slice(e.at);
    if (edits.length) source = 'import { startConnectionTiming as profileTiming } from "./connectionDiagnostics";\n'+source;
  }
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};
const { analyzeMesh } = require('../src/components/lattice/analyze.ts');
const { evaluateAssembly } = require('../src/components/lattice/search.ts');
const { matchAssemblyPorts } = require('../src/components/lattice/portMatching.ts');
const { synthesizeConnectors } = require('../src/components/lattice/connectionSynthesis.ts');
const { captureConnectionDiagnostics } = require('../src/components/lattice/connectionDiagnostics.ts');
const sessionFile = path.join(root, 'checkpoints/lattice-session.json'), sessionBytes = fs.readFileSync(sessionFile);
const session = JSON.parse(sessionBytes), sessionHash = hash(sessionBytes);
const geometryHash = m => hash(JSON.stringify([Array.from(m.positions), Array.from(m.normals), m.faces]));
const specs = [['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]];
const sources = specs.map(([code,ix,iy,variant]) => {
  const p = session.meshes.find(m => m.id === session.assignments[code]);
  const mesh = { ...p, positions: Float32Array.from(p.positions), normals: Float32Array.from(p.normals ?? []), faces: p.faces.map(f => Array.isArray(f) ? { vertices: f, normals: null } : f) };
  const before = geometryHash(mesh), model = analyzeMesh(mesh, code, 1, mesh.upAxis);
  return { code, mesh, before, model, tile: { id: mesh.id, ix, iy, iz: 0, variant } };
});
const models = sources.map(s => s.model), tiles = sources.map(s => s.tile);
const evaluate = () => {
  const evaluation = evaluateAssembly(models, tiles);
  const ports = matchAssemblyPorts(models, tiles, evaluation.connections);
  const synthesis = synthesizeConnectors(models, tiles, evaluation.connections, { ...ports, portPairs: ports.pairs });
  return { evaluation, ports, synthesis };
};
function classification(value) {
  return JSON.parse(JSON.stringify({ reports: value.evaluation.connections, candidates: value.ports.candidates, confirmed: value.ports.confirmedReports,
    componentsBefore: value.ports.componentsBefore, componentsAfter: value.ports.componentsAfter,
    components: value.synthesis.organicDiagnostics.components, isolated: value.synthesis.organicDiagnostics.isolated,
    organic: value.synthesis.organicDiagnostics,
    connectors: value.synthesis.connectors.map(c => ({ ...c, positions: Array.from(c.positions) })) }));
}
const trials = [], checks = [];
let first;
for (let i=0;i<4;i++) {
  const start = performance.now();
  const result = profile ? captureConnectionDiagnostics(evaluate, 0) : { value: evaluate() };
  const elapsedMs = performance.now()-start;
  const current = classification(result.value);
  if (!first) first = current; else assert.deepEqual(current, first, 'cold/warm classification or emitted geometry changed');
  trials.push({ cache: i ? 'warm' : 'cold', elapsedMs, timings: result.trace?.timings, counters: result.trace?.counts });
}
const out = path.join(root, 'reports/stage2-phase1.5'); fs.mkdirSync(out, { recursive: true });
const referenceFile = path.join(out, 'phase1-classifications.json');
if (ref) {
  if (fs.existsSync(referenceFile)) assert.deepEqual(first, JSON.parse(fs.readFileSync(referenceFile)), 'checkpoint classification mismatch');
  else fs.writeFileSync(referenceFile, JSON.stringify(first)+'\n');
} else {
  assert.deepEqual(first, JSON.parse(fs.readFileSync(referenceFile)), 'Phase 1 classification/emitted geometry parity failed');
  checks.push('Every port outcome, direct report, graph field, organic rejection, connector vertex/index and score matches Phase 1');
}
const gl = first.candidates.filter(c => c.pair.tileA === session.assignments.G1 && c.pair.tileB === session.assignments.L1);
assert.equal(gl.filter(c => c.reason === 'NETWORK REDUNDANT').length, 0);
assert.equal(gl.filter(c => ['COLLISION','SLOPE','SURFACE ATTACHMENT'].includes(c.reason)).length, 54);
assert.equal(first.components, 2); assert.deepEqual(first.isolated, [session.assignments.L1]);
if (!ref && process.argv.includes('--invalidation')) {
  const { geometryRevision } = require('../src/components/lattice/geometryRevision.ts');
  const { measureSurfaceGap, confirmedWalkableInterface } = require('../src/components/lattice/surfaceAttachment.ts');
  const { transitionSurfaceClear } = require('../src/components/lattice/connectionClearance.ts');
  const { transitionPath } = require('../src/components/lattice/transitionGeometry.ts');
  const cloneModel = model => ({ ...model, variants: model.variants.map(v => ({ ...v })), connectionSurface: {
    positions: model.connectionSurface.positions.slice(), triangles: [...model.connectionSurface.triangles] } });
  const o = sources[0], testModel = cloneModel(o.model), surface = testModel.connectionSurface;
  const pair = structuredClone(first.connectors.find(c => c.portPair.portA !== 'organic').portPair);
  const contact = pair.from;
  const gap = measureSurfaceGap(testModel, o.tile, contact, 2);
  assert(gap.distance <= .2);
  const old = geometryRevision(surface);
  for (let i=2;i<surface.positions.length;i+=3) surface.positions[i] += 100;
  assert.notEqual(geometryRevision(surface), old, 'in-place vertex edit reused a geometry revision');
  assert(measureSurfaceGap(testModel, o.tile, contact, 2).distance > .2, 'stale contact after vertex edit');
  surface.positions.set(o.model.connectionSurface.positions);
  assert.deepEqual(measureSurfaceGap(testModel, o.tile, contact, 2), gap);
  surface.triangles.length = 0;
  assert(measureSurfaceGap(testModel, o.tile, contact, 2).distance > .2, 'stale contact after topology edit');
  surface.triangles.push(...o.model.connectionSurface.triangles);
  assert.deepEqual(measureSurfaceGap(testModel, o.tile, contact, 2), gap);
  for (const tile of [{ ...o.tile, ix: 1 }, { ...o.tile, zLift: 3 }, { ...o.tile, variant: 3 }, { ...o.tile, variant: 2 }]) {
    assert.deepEqual(measureSurfaceGap(testModel,tile,contact,2),measureSurfaceGap(cloneModel(testModel),tile,contact,2));
  }
  testModel.variants[o.tile.variant].rotation = 90;
  assert.deepEqual(measureSurfaceGap(testModel,o.tile,contact,2),measureSurfaceGap(cloneModel(testModel),o.tile,contact,2));
  for (const [radius,tolerance] of [[1,.2],[2,.45],[6,.01]]) {
    assert.deepEqual(measureSurfaceGap(testModel,o.tile,contact,radius,tolerance),measureSurfaceGap(cloneModel(testModel),o.tile,contact,radius,tolerance));
  }
  // Same model IDs with changed surface contents must not retain a confirmed interface.
  const twin = cloneModel(o.model), twinTile = {...o.tile,id:'same-OBJ-interface-test'};
  assert(confirmedWalkableInterface(o.model,o.tile,twin,twinTile).meets);
  for(let i=2;i<twin.connectionSurface.positions.length;i+=3)twin.connectionSurface.positions[i]+=100;
  assert(!confirmedWalkableInterface(o.model,o.tile,twin,twinTile).meets);
  assert(transitionSurfaceClear(pair,tiles,models));
  const blocker = { positions: Float32Array.from(first.connectors[0].positions), indices: [...first.connectors[0].indices] };
  assert.equal(transitionSurfaceClear(pair,tiles,models,[blocker]),false);
  for(let i=2;i<blocker.positions.length;i+=3)blocker.positions[i]+=100;
  assert.equal(transitionSurfaceClear(pair,tiles,models,[blocker]),true,'stale connector tree after vertex edit');
  blocker.positions.set(first.connectors[0].positions);
  assert.equal(transitionSurfaceClear(pair,tiles,models,[blocker]),false);
  blocker.indices.length=0;
  assert.equal(transitionSurfaceClear(pair,tiles,models,[blocker]),true,'stale connector tree after topology edit');
  const { portPairClearanceValidated } = require('../src/components/lattice/portMatching.ts');
  const clonedModels = models.map(cloneModel);
  const clonedPorts = matchAssemblyPorts(clonedModels,tiles,first.reports);
  assert(portPairClearanceValidated(clonedPorts.pairs[0],clonedModels,tiles));
  clonedModels[0].connectionSurface.positions[0]+=1;
  assert(!portPairClearanceValidated(clonedPorts.pairs[0],clonedModels,tiles),'geometry edit retained prepared-route certificate');
  for (const mutate of [
    p=>{p.path[1][0]+=1e-10;}, p=>{p.startWidth+=.125;}, p=>{p.endWidth+=.125;},
    p=>{p.startDirection[1]+=.01;},p=>{p.endDirection[1]+=.01;},p=>{p.rise+=.01;},
    p=>{p.startProfile[0][0]+=.01;},p=>{p.endProfile[0][0]+=.01;},
    p=>{p.connectionClass='ADAPTIVE';},p=>{p.from[0]+=.01;},p=>{p.to[0]+=.01;},
  ]) {
    const modified = structuredClone(pair); mutate(modified);
    const captured = captureConnectionDiagnostics(()=>transitionSurfaceClear(modified,tiles,models),0);
    assert(captured.trace.counts['cache: source clearance miss'] > 0, 'changed connection reused an old clearance result');
  }
  // The original L1 failure must still exercise headroom validation. Only a derived clone is altered.
  const phase1 = JSON.parse(fs.readFileSync(path.join(root,'reports/stage2-phase1/updated.json')));
  const event = phase1.trials[0].trace.eventGroups.find(e=>e.stage==='clearance'&&e.reason==='headroom'&&e.samples[0].pair?.portA==='organic'&&e.samples[0].pair.tileB===session.assignments.L1&&e.samples[0].blocker?.id===session.assignments.L1);
  assert(event, 'missing original headroom fixture');
  const headroomPair = structuredClone(event.samples[0].pair); headroomPair.path = transitionPath(headroomPair,0);
  const lobby = sources.find(s=>s.code==='L1'), lobbyModel=cloneModel(lobby.model);
  const blocked = captureConnectionDiagnostics(()=>transitionSurfaceClear(headroomPair,[lobby.tile],[lobbyModel]),0);
  assert.equal(blocked.value,false); assert(blocked.trace.counts['clearance: headroom']>0);
  for(let i=2;i<lobbyModel.connectionSurface.positions.length;i+=3)lobbyModel.connectionSurface.positions[i]+=100;
  assert.equal(transitionSurfaceClear(headroomPair,[lobby.tile],[lobbyModel]),true,'old source/headroom result survived changed geometry');
  checks.push('Cache invalidation: in-place vertices/topology, placement, lift, rotation, mirror, query tolerances, path (1e-10 edit), widths, directions, profiles, class and endpoints');
  checks.push('Original L1 headroom rejection active; altered derived source invalidates clearance and direct-interface caches');
  checks.push('Connector tree invalidates on in-place vertices/topology; prepared-route certificate invalidates on source geometry edits');
}
for (const s of sources) assert.equal(geometryHash(s.mesh), s.before);
assert.equal(hash(fs.readFileSync(sessionFile)), sessionHash);
const report = { ref: ref ?? 'working tree', profile, node: process.version, field: [4,4,1],
  sources: sources.map(s => ({ code:s.code, filename:s.mesh.filename, placement:s.tile, geometrySHA256:s.before })),
  sessionSHA256:sessionHash, trials, checks, classificationsSHA256:hash(JSON.stringify(first)),
  eligiblePreviouslySuppressed:54, components:2, isolated:['L1'], fidelity:'PASS', search:'NOT RUN' };
fs.writeFileSync(path.join(out, `${label}${profile ? '-profile' : ''}.json`), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ label, profile, milliseconds:trials.map(t=>t.elapsedMs), checks, fidelity:report.fidelity }));
