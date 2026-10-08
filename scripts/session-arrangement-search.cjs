// Full 4-form search on the session OBJs. Lattice 4 x 4 x 1.
// node scripts/session-arrangement-search.cjs
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);

const { analyzeMesh } = require("../src/components/lattice/analyze.ts");
const { searchAssignmentCopies } = require("../src/components/lattice/assignmentSearch.ts");
const { measureSurfaceGap, SURFACE_CONTACT_TOLERANCE } = require("../src/components/lattice/surfaceAttachment.ts");
const { resolvedUp } = require("../src/components/lattice/types.ts");

const root = path.resolve(__dirname, "..");
const log = (line) => fs.writeSync(1, `${line}\n`);

const wanted = [
  { code: "O2", file: /undulating workspace/i },
  { code: "O1", file: /void workspace/i },
  { code: "G1", file: /Gathering, Linear/i },
  { code: "L1", file: /Lobby, Vertical Void/i },
];

function checksum(mesh) {
  let sample = 0;
  for (let index = 0; index < mesh.positions.length; index += 97) sample += mesh.positions[index];
  return { vertices: mesh.positions.length / 3, faces: mesh.faces.length, sample };
}

const session = JSON.parse(fs.readFileSync(path.join(root, "checkpoints/lattice-session.json"), "utf8"));
const models = [];
const sources = [];
for (const spec of wanted) {
  const packed = session.meshes.find((mesh) => spec.file.test(mesh.filename));
  if (!packed) throw new Error(`missing ${spec.code}`);
  const mesh = {
    ...packed,
    positions: Float32Array.from(packed.positions),
    normals: Float32Array.from(packed.normals ?? []),
    faces: packed.faces.map((face) => Array.isArray(face) ? { vertices: face, normals: null } : face),
  };
  const before = checksum(mesh);
  const slotId = Object.entries(session.assignments ?? {}).find(([, id]) => id === mesh.id)?.[0] ?? spec.code;
  const up = resolvedUp(mesh.upAxis, session.upAxisMode ?? "auto");
  log(`analyze ${spec.code} ${mesh.filename}`);
  const model = analyzeMesh(mesh, slotId, 1, up);
  if (JSON.stringify(checksum(mesh)) !== JSON.stringify(before)) throw new Error(`${spec.code} analysis mutated the OBJ`);
  models.push(model);
  sources.push({ spec, mesh, before, model });
}

const started = Date.now();
log("search 4 forms on 4 x 4 x 1");
searchAssignmentCopies(models, 4, {
  cancelled: () => false,
  onProgress(message, percent) {
    log(`  ${percent}% ${message} +${((Date.now() - started) / 1000).toFixed(0)}s`);
  },
}, "copies-4", { cellsX: 4, cellsY: 4, cellsZ: 1 }).then((result) => {
  for (const source of sources) {
    if (JSON.stringify(checksum(source.mesh)) !== JSON.stringify(source.before)) throw new Error(`${source.spec.code} search mutated the OBJ`);
  }
  const nameOf = (id) => sources.find((item) => item.model.id === id)?.spec.code ?? id;
  log(`STATUS ${result.status} score ${result.score.toFixed(1)} components ${result.components} tested ${result.candidatesTested} ms ${Math.round(result.milliseconds)}`);
  log(result.summary);
  for (const tile of result.tiles) {
    const model = result.models.find((item) => item.id === tile.id);
    log(`  place ${nameOf(tile.id)} (${model?.filename ?? tile.id}) cell (${tile.ix},${tile.iy},${tile.iz}) variant ${tile.variant}`);
  }
  const seen = new Set();
  for (const connector of result.synthesis.connectors) {
    const pair = connector.portPair;
    if (!pair) {
      log(`  UNPAIRED ${connector.kind}`);
      continue;
    }
    const key = `${pair.tileA}|${pair.tileB}|${pair.from.map((value) => value.toFixed(1)).join(",")}|${connector.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const source = result.models.find((item) => item.id === pair.tileA);
    const target = result.models.find((item) => item.id === pair.tileB);
    const sourceTile = result.tiles.find((item) => item.id === pair.tileA);
    const targetTile = result.tiles.find((item) => item.id === pair.tileB);
    const sourceGap = measureSurfaceGap(source, sourceTile, pair.from, 8);
    const targetGap = measureSurfaceGap(target, targetTile, pair.to, 8);
    const organic = pair.portA === "organic";
    const suitable = (gap) => gap.distance <= SURFACE_CONTACT_TOLERANCE && (gap.kind === "floor" || gap.kind === "edge" || (!organic && gap.kind === "wall"));
    log([
      `  ${nameOf(pair.tileA)} → ${nameOf(pair.tileB)}`,
      connector.kind,
      `rise ${connector.circulation?.rise?.toFixed(2)} run ${connector.circulation?.run?.toFixed(2)} slope ${(connector.circulation?.slope ?? 0).toFixed(3)}`,
      `source ${sourceGap.kind} ${sourceGap.distance.toFixed(2)}`,
      `target ${targetGap.kind} ${targetGap.distance.toFixed(2)}`,
      suitable(sourceGap) && suitable(targetGap) ? "VALID" : "INVALID",
    ].join(" | "));
  }
  log("rejections");
  for (const rejection of result.synthesis.organicDiagnostics?.rejections ?? []) {
    log(`  ${rejection.pair}: ${rejection.reason} — ${rejection.detail}`);
  }
  log("SEARCH DONE");
}).catch((error) => {
  log(`SEARCH FAILED ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
