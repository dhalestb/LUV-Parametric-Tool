// Bounded original-OBJ diagnostic. Never invokes the placement search.
// node scripts/l1-connectivity-diagnostics.cjs [--record-baseline]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const baseline = process.argv.includes('--record-baseline');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Read the checkpoint in memory; never checkout/reset or change the working tree.
// Only timing probes are inserted into baseline code. Its decisions remain unchanged.
function sourceFor(filename) {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  if (!baseline || !relative.startsWith('src/components/lattice/') || relative.endsWith('/connectionDiagnostics.ts')) return fs.readFileSync(filename, 'utf8');
  let source = execFileSync('git', ['show', `cd40b20:${relative}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const stages = { extractConnectionPorts: 'candidate generation', extractSourceEdgePorts: 'candidate generation',
    findOrganicLinks: 'candidate generation', sealOrganicGraph: 'network graph', matchAssemblyPorts: 'candidate generation',
    resolveWalkableAttachment: 'surface attachment selection', fitLoftContact: 'surface attachment selection',
    confirmedWalkableInterface: 'surface attachment selection', transitionMeshes: 'connector geometry', transitionSurfaceClear: 'collision and clearance' };
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true), edits = [];
  for (const statement of ast.statements) if (ts.isFunctionDeclaration(statement) && stages[statement.name?.text]) {
    edits.push({ at: statement.body.getStart(ast) + 1, text: `\nconst finishTiming=startConnectionTiming(${JSON.stringify(stages[statement.name.text])}); try {\n` });
    edits.push({ at: statement.body.end - 1, text: '\n} finally {finishTiming();}\n' });
  }
  for (const edit of edits.sort((a, b) => b.at - a.at)) source = source.slice(0, edit.at) + edit.text + source.slice(edit.at);
  return edits.length ? 'import {startConnectionTiming} from "./connectionDiagnostics";\n' + source : source;
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(sourceFor(filename), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { analyzeMesh } = require('../src/components/lattice/analyze.ts');
const { evaluateAssembly } = require('../src/components/lattice/search.ts');
const { matchAssemblyPorts } = require('../src/components/lattice/portMatching.ts');
const { synthesizeConnectors } = require('../src/components/lattice/connectionSynthesis.ts');
const { confirmedWalkableInterface, measureSurfaceGap } = require('../src/components/lattice/surfaceAttachment.ts');
const { captureConnectionDiagnostics, startConnectionTiming } = require('../src/components/lattice/connectionDiagnostics.ts');
const sessionPath = path.join(root, 'checkpoints/lattice-session.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sessionHash = hash(fs.readFileSync(sessionPath));
const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
assert.equal(session.unit, 'feet');
const geometryHash = mesh => hash(JSON.stringify({ positions: Array.from(mesh.positions), normals: Array.from(mesh.normals), faces: mesh.faces }));
const specs = [
  { code: 'O2', ix: 0, iy: 0, variant: 0 },
  { code: 'O1', ix: 1, iy: 0, variant: 2 },
  { code: 'G1', ix: 1, iy: 1, variant: 0 },
  { code: 'L1', ix: 2, iy: 1, variant: 3 },
];
const prepared = captureConnectionDiagnostics(() => specs.map(spec => {
  const packed = session.meshes.find(mesh => mesh.id === session.assignments[spec.code]);
  assert(packed, `Missing original ${spec.code}`);
  const mesh = { ...packed, positions: Float32Array.from(packed.positions), normals: Float32Array.from(packed.normals ?? []),
    faces: packed.faces.map(face => Array.isArray(face) ? { vertices: face, normals: null } : face) };
  const before = geometryHash(mesh);
  const model = analyzeMesh(mesh, spec.code, 1, mesh.upAxis);
  assert.equal(geometryHash(mesh), before);
  return { spec, mesh, model, before, tile: { id: mesh.id, variant: spec.variant, ix: spec.ix, iy: spec.iy, iz: 0 } };
}));
const placed = prepared.value, models = placed.map(p => p.model), tiles = placed.map(p => p.tile);
const nameOf = id => placed.find(p => p.tile.id === id)?.spec.code ?? id;
const identity = p => ({ code: p.spec.code, id: p.mesh.id, filename: p.mesh.filename, placement: p.tile,
  rotation: p.model.variants[p.tile.variant].rotation, mirror: p.model.variants[p.tile.variant].mirror,
  vertices: p.mesh.positions.length / 3, faces: p.mesh.faces.length, geometrySHA256: p.before });
const summarize = ({ evaluation, ports, synthesis }) => ({
  reports: evaluation.connections,
  components: synthesis.organicDiagnostics.components,
  isolated: synthesis.organicDiagnostics.isolated.map(nameOf),
  portComponentsBefore: ports.componentsBefore, portComponentsAfter: ports.componentsAfter,
  portRejections: ports.rejectionCounts,
  portCandidates: ports.candidates.map(c => ({ source: nameOf(c.pair.tileA), target: nameOf(c.pair.tileB),
    portA: c.pair.portA, portB: c.pair.portB, accepted: c.accepted, reason: c.reason ?? null,
    from: c.pair.from, to: c.pair.to, rise: c.pair.rise, plan: c.pair.plan, width: c.pair.usableWidth })),
  links: [...new Set(synthesis.connectors.map(c => c.portPair))].map(pair => {
    const a = placed.find(p => p.tile.id === pair.tileA), b = placed.find(p => p.tile.id === pair.tileB);
    return { source: a.spec.code, target: b.spec.code, portA: pair.portA, portB: pair.portB,
      from: pair.from, to: pair.to, width: pair.usableWidth,
      sourceGap: measureSurfaceGap(a.model, a.tile, pair.from), targetGap: measureSurfaceGap(b.model, b.tile, pair.to),
      kinds: [...new Set(synthesis.connectors.filter(c => c.portPair === pair).map(c => c.kind))] };
  }),
  organic: synthesis.organicDiagnostics,
});
const trials = [];
for (let trial = 0; trial < 3; trial++) {
  const captured = captureConnectionDiagnostics(() => {
    const finish = startConnectionTiming('search candidate evaluation');
    try {
      const evaluation = evaluateAssembly(models, tiles);
      const ports = matchAssemblyPorts(models, tiles, evaluation.connections);
      const synthesis = synthesizeConnectors(models, tiles, evaluation.connections, { portPairs: ports.pairs, ...ports });
      return { evaluation, ports, synthesis };
    } finally { finish(); }
  });
  trials.push({ cache: trial ? 'warm' : 'cold', timings: captured.trace.timings, result: summarize(captured.value), trace: trial ? undefined : captured.trace });
}
assert.deepEqual(trials[1].result, trials[0].result, 'warm cache changed the result');
assert.deepEqual(trials[2].result, trials[0].result, 'repeat changed the result');

// Counterfactual voxel report on real O2/O1 geometry: no fabricated source mesh.
const [a, b] = placed;
const probeModels = [a.model, b.model], probeTiles = [a.tile, b.tile];
const confirmed = confirmedWalkableInterface(a.model, a.tile, b.model, b.tile);
assert.equal(confirmed.meets, false, 'fixture must have no direct interface');
const provisional = { ...evaluateAssembly(probeModels, probeTiles).connections[0], tileA: a.tile.id, tileB: b.tile.id,
  collision: 'PASS', interlock: 'PASS', floor: 'PASS', circulation: 'PASS' };
const ordinary = matchAssemblyPorts(probeModels, probeTiles, []);
const injected = matchAssemblyPorts(probeModels, probeTiles, [provisional]);
const probe = { confirmed, ordinaryPairs: ordinary.pairs.length, provisionalPairs: injected.pairs.length,
  provisionalRejections: injected.rejectionCounts };

for (const p of placed) assert.equal(geometryHash(p.mesh), p.before, `${p.spec.code} original geometry changed`);
assert.equal(hash(fs.readFileSync(sessionPath)), sessionHash, 'session bytes changed');
if (!baseline) {
  assert(ordinary.pairs.length > 0, 'original O2/O1 should provide a valid route');
  assert.equal(injected.pairs.length, ordinary.pairs.length, 'provisional voxel edge suppressed a real candidate');
  assert.equal(trials[0].result.components, 2);
  assert.deepEqual(trials[0].result.isolated, ['L1']);
  const savedBaseline = JSON.parse(fs.readFileSync(path.join(root, 'reports/stage2-phase1/baseline.json'), 'utf8'));
  assert.equal(sessionHash, savedBaseline.sessionSHA256);
  assert.deepEqual(trials[0].result.links, savedBaseline.trials[0].result.links, 'Stage 1 accepted attachments changed');
  const skipped = savedBaseline.trials[0].result.portCandidates.filter(c => c.source === 'G1' && c.target === 'L1' && c.reason === 'NETWORK REDUNDANT');
  assert.equal(skipped.length, 54, 'checkpoint suppression fixture changed');
  for (const candidate of skipped) {
    const now = trials[0].result.portCandidates.find(c => c.source === candidate.source && c.target === candidate.target && c.portA === candidate.portA && c.portB === candidate.portB);
    assert(now && now.reason !== 'NETWORK REDUNDANT', 'required G1/L1 candidate was still prematurely skipped');
  }
  const { confirmedCirculationReports } = require('../src/components/lattice/surfaceAttachment.ts');
  const g = placed.find(p => p.spec.code === 'G1'), l = placed.find(p => p.spec.code === 'L1');
  assert.equal(confirmedWalkableInterface(g.model, g.tile, l.model, l.tile).meets, false);
  assert(!confirmedCirculationReports(models, tiles, trials[0].result.reports).some(r => r.tileA === g.tile.id && r.tileB === l.tile.id), 'invalid G1/L1 voxel edge survived');
  const { portPairClearanceValidated } = require('../src/components/lattice/portMatching.ts');
  const originalPair = ordinary.pairs[0];
  assert(portPairClearanceValidated(originalPair, probeModels, probeTiles));
  const savedPoint = originalPair.to;
  originalPair.to = [savedPoint[0], savedPoint[1], savedPoint[2] + 40];
  assert(!portPairClearanceValidated(originalPair, probeModels, probeTiles), 'mutated geometry retained its validation certificate');
  const invalid = synthesizeConnectors(probeModels, probeTiles, [], { portPairs: [originalPair] });
  assert.equal(invalid.portPairs.length, 0, 'open-space termination was accepted');
  originalPair.to = savedPoint;
  // Fast search filtering and detailed diagnostics must accept the same network.
  const fast = matchAssemblyPorts(models, tiles, trials[0].result.reports, {}, false);
  const detailed = matchAssemblyPorts(models, tiles, trials[0].result.reports, {}, true);
  assert.deepEqual(fast.pairs, detailed.pairs);
} else {
  assert.equal(ordinary.pairs.length, 1);
  assert.equal(injected.pairs.length, 0, 'baseline no longer reproduces premature suppression');
}
for (const p of placed) assert.equal(geometryHash(p.mesh), p.before, `${p.spec.code} geometry changed during regressions`);
assert.equal(hash(fs.readFileSync(sessionPath)), sessionHash);
const report = { mode: baseline ? 'baseline' : 'updated', field: { cellsX: 4, cellsY: 4, cellsZ: 1 },
  baselineCommit: 'cd40b20', node: process.version, typescript: ts.version, sessionSHA256: sessionHash,
  sources: placed.map(identity), analysisTrace: prepared.trace, trials, provisionalProbe: probe,
  fidelity: 'PASS: full positions, normals, face records and session file SHA-256 unchanged',
  regressions: baseline ? ['Checkpoint reproduces valid-route suppression by injected voxel PASS'] : [
    'Invalid G1/L1 voxel interface remains rejected',
    'All 54 prematurely suppressed G1/L1 candidates are reconsidered',
    'Original O2/O1 valid route survives injected provisional voxel PASS',
    'Stage 1 ramp and stair endpoints, widths, surface gaps and kinds unchanged',
    'Mutated endpoint invalidates clearance certificate and is rejected',
    'Cold and warm geometry/network results are identical',
    'Fast and detailed port matching accept the same routes',
    'Full original geometry and session SHA-256 unchanged',
  ],
  search: 'NOT RUN: only the committed known placement and a two-form provisional-report regression' };
const out = path.join(root, 'reports/stage2-phase1');
fs.mkdirSync(out, { recursive: true });
// Keep full counts and representative records per reason/pair/blocker; avoid megabytes of repeated paths.
function compactTrace(trace) {
  if (!trace) return trace;
  const groups = new Map();
  for (const event of trace.events) {
    const d = event.detail, pair = d.pair ?? d.link;
    const key = JSON.stringify([event.stage, event.reason, pair?.tileA ?? d.tileA?.id ?? d.tile?.id ?? d.sourceFormId ?? d.source?.id, pair?.tileB ?? d.tileB?.id, d.blocker?.id, pair?.portA === "organic", d.rotation, d.mirror]);
    const group = groups.get(key) ?? { stage: event.stage, reason: event.reason, occurrences: 0, samples: [] };
    group.occurrences++;
    if (group.samples.length < 3) group.samples.push(d);
    groups.set(key, group);
  }
  return { counts: trace.counts, droppedEvents: trace.droppedEvents, timings: trace.timings, eventGroups: [...groups.values()] };
}
const saved = { ...report, analysisTrace: compactTrace(report.analysisTrace), trials: trials.map((t, i) => ({ ...t, result: i ? { identicalToTrial: 0 } : t.result, trace: compactTrace(t.trace) })) };
fs.writeFileSync(path.join(out, `${report.mode}.json`), JSON.stringify(saved, (key, value) => key === 'sourceCells' ? undefined : key === 'path' && Array.isArray(value) ? { points: value.length, first: value[0], last: value.at(-1) } : value, 2) + '\n');
console.log(JSON.stringify({ mode: report.mode, sources: report.sources, trials: trials.map(t => ({ cache: t.cache, timings: t.timings,
  components: t.result.components, isolated: t.result.isolated, links: t.result.links })), probe, fidelity: report.fidelity }, null, 2));
