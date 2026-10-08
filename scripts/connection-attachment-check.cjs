// Deterministic check of the known G1 · O1 · L1 · O2 placements. Does not search.
// node scripts/connection-attachment-check.cjs
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);

const { analyzeMesh } = require("../src/components/lattice/analyze.ts");
const { evaluateAssembly } = require("../src/components/lattice/search.ts");
const { matchAssemblyPorts } = require("../src/components/lattice/portMatching.ts");
const { synthesizeConnectors } = require("../src/components/lattice/connectionSynthesis.ts");
const { circulationProfile } = require("../src/components/lattice/transitionGeometry.ts");
const { localPoint, worldFromLocal, measureSurfaceGap, SURFACE_CONTACT_TOLERANCE } = require("../src/components/lattice/surfaceAttachment.ts");
const { resolvedUp } = require("../src/components/lattice/types.ts");

const root = path.resolve(__dirname, "..");
const log = (line) => fs.writeSync(1, `${line}\n`);

const steep = circulationProfile(1.39, -0.52);
assert.notEqual(steep.mode, "level", "0.52 ft over 1.39 ft must not be level");
assert.ok(steep.slope > 1 / 12, "short step is steeper than a ramp");
assert.equal(circulationProfile(16.33, -0.52).mode, "level");
assert.equal(circulationProfile(7.96, -0.52).mode, "ramp");
assert.equal(circulationProfile(12, 1).mode, "ramp");
assert.notEqual(circulationProfile(6, 2).mode, "level");

const session = JSON.parse(fs.readFileSync(path.join(root, "checkpoints/lattice-session.json"), "utf8"));
const wanted = [
  { code: "O2", file: /undulating workspace/i, ix: 0, iy: 0, variant: 0 },
  { code: "O1", file: /void workspace/i, ix: 1, iy: 0, variant: 2 },
  { code: "G1", file: /Gathering, Linear/i, ix: 1, iy: 1, variant: 0 },
  { code: "L1", file: /Lobby, Vertical Void/i, ix: 2, iy: 1, variant: 3 },
];
const before = [
  { pair: "O1 → O2", gap: "0.10 / 0.00", slope: "0.065 level-or-bridge", contact: "PASS distance" },
  { pair: "G1 → O1", gap: "0.14 / 0.94", slope: "0", contact: "FAIL target" },
  { pair: "G1 → O1", gap: "0.00 / 2.10", slope: "0.377 called level", contact: "FAIL target" },
  { pair: "G1 → O2", gap: "0.00 / 0.10", slope: "0.032", contact: "PASS distance, both walls" },
  { pair: "O1 → L1", gap: "0.17 / 1.36", slope: "0", contact: "FAIL target" },
];

function checksum(mesh) {
  let sample = 0;
  for (let index = 0; index < mesh.positions.length; index += 97) sample += mesh.positions[index];
  return { vertices: mesh.positions.length / 3, faces: mesh.faces.length, sample };
}

const placed = [];
for (const spec of wanted) {
  const packed = session.meshes.find((mesh) => spec.file.test(mesh.filename));
  assert.ok(packed, `missing ${spec.code}`);
  const mesh = {
    ...packed,
    positions: Float32Array.from(packed.positions),
    normals: Float32Array.from(packed.normals ?? []),
    faces: packed.faces.map((face) => Array.isArray(face) ? { vertices: face, normals: null } : face),
  };
  const beforeGeometry = checksum(mesh);
  const slotId = Object.entries(session.assignments ?? {}).find(([, id]) => id === mesh.id)?.[0] ?? spec.code;
  const up = resolvedUp(mesh.upAxis, session.upAxisMode ?? "auto");
  log(`analyze ${spec.code} ${mesh.filename} verts ${beforeGeometry.vertices}`);
  const model = analyzeMesh(mesh, slotId, session.unit === "feet" || !session.unit ? 1 : 1, up);
  const afterGeometry = checksum(mesh);
  assert.deepEqual(afterGeometry, beforeGeometry, `${spec.code} analysis mutated the OBJ`);
  assert.equal(model.cellFeet, 2, `${spec.code} cell`);
  const tile = { id: model.id, variant: spec.variant, ix: spec.ix, iy: spec.iy, iz: 0 };
  const probe = [tile.ix * 20 + 3.25, tile.iy * 20 - 1.5, 4.5];
  const round = worldFromLocal(localPoint(probe, tile, model), tile, model);
  const error = Math.hypot(round[0] - probe[0], round[1] - probe[1], round[2] - probe[2]);
  assert.ok(error < 1e-6, `${spec.code} transform roundtrip ${error}`);
  placed.push({ spec, mesh, model, tile, beforeGeometry });
}

const models = placed.map((item) => item.model);
const tiles = placed.map((item) => item.tile);
log("synthesize known placement");
const evaluated = evaluateAssembly(models, tiles);
const ports = matchAssemblyPorts(models, tiles, evaluated.connections);
const synthesis = synthesizeConnectors(models, tiles, evaluated.connections, { portPairs: ports.pairs, ...ports });
for (const item of placed) assert.deepEqual(checksum(item.mesh), item.beforeGeometry, `${item.spec.code} synthesis mutated the OBJ`);

log("BEFORE (diagnosis)");
for (const row of before) log(`  ${row.pair}  gap ${row.gap}  slope ${row.slope}  ${row.contact}`);
log("AFTER");
const nameOf = (id) => placed.find((item) => item.model.id === id || item.tile.id === id)?.spec.code ?? id;
let failures = 0;
const seen = new Set();
for (const connector of synthesis.connectors) {
  const pair = connector.portPair;
  if (!pair) {
    failures += 1;
    log(`  UNPAIRED ${connector.kind} ${connector.id}`);
    continue;
  }
  const key = `${pair.tileA}|${pair.tileB}|${pair.from.map((value) => value.toFixed(1)).join(",")}|${connector.kind}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const source = placed.find((item) => item.tile.id === pair.tileA);
  const target = placed.find((item) => item.tile.id === pair.tileB);
  const sourceGap = measureSurfaceGap(source.model, source.tile, pair.from, 8);
  const targetGap = measureSurfaceGap(target.model, target.tile, pair.to, 8);
  const organic = pair.portA === "organic";
  const suitable = (gap) => gap.distance <= SURFACE_CONTACT_TOLERANCE && (gap.kind === "floor" || gap.kind === "edge" || (!organic && gap.kind === "wall"));
  const slope = connector.circulation?.slope ?? 0;
  const badClass = ((connector.kind === "plate" || connector.kind === "bridge") && slope > 1 / 12 + 1e-3) || (connector.kind === "ramp" && slope > 1 / 12 + 0.03);
  const attached = suitable(sourceGap) && suitable(targetGap);
  if (!attached || badClass || Math.min(pair.startWidth ?? pair.usableWidth, pair.endWidth ?? pair.usableWidth) < 2) failures += 1;
  log([
    `  ${nameOf(pair.tileA)} → ${nameOf(pair.tileB)}`,
    connector.kind,
    pair.portA === "organic" ? "organic" : `${pair.portA}→${pair.portB}`,
    `rise ${connector.circulation?.rise?.toFixed(2)} run ${connector.circulation?.run?.toFixed(2)} slope ${slope.toFixed(3)}`,
    `width ${Math.min(pair.startWidth ?? pair.usableWidth, pair.endWidth ?? pair.usableWidth).toFixed(2)}`,
    `source ${sourceGap.kind} ${sourceGap.distance.toFixed(2)} ft`,
    `target ${targetGap.kind} ${targetGap.distance.toFixed(2)} ft`,
    attached && !badClass ? "VALID" : "INVALID",
  ].join(" | "));
}
const diagnostics = synthesis.organicDiagnostics;
log(`connectors ${synthesis.connectors.length} direct ${synthesis.directInterlocks} interlocks ${synthesis.interlocks} organic ${synthesis.organicConnectors} bridges ${synthesis.bridges} ramps ${synthesis.ramps} stairs ${synthesis.stairs}`);
log(`components ${diagnostics?.components} isolated ${(diagnostics?.isolated ?? []).map(nameOf).join(", ") || "none"}`);
log("rejections");
for (const rejection of diagnostics?.rejections ?? []) log(`  ${nameOf(rejection.pair.split(" ↔ ")[0])} ↔ ${nameOf(rejection.pair.split(" ↔ ")[1] ?? "")}: ${rejection.reason} — ${rejection.detail}`);
assert.equal(failures, 0, "a reported connection missed a walkable surface or broke its slope class");
log(diagnostics?.components === 1 ? "NETWORK connected" : "NETWORK incomplete — invalid links were rejected");
log("PASS attachment check");
