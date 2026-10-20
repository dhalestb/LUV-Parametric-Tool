import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, writeSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geometryExceedsSessionStore } from "../src/components/browserSession.ts";
import { comparisonBoardSvg, labelGlyphs, paintComparisonBoard, placeSection } from "../src/components/evaluations/comparisonBoard.ts";
import { selectDescriptorExtremes } from "../src/components/evaluations/comparisonSelection.ts";
import { geometryContentRevision } from "../src/components/evaluations/descriptorEvidence.ts";
import { assignComparativeRanks } from "../src/components/evaluations/descriptorRank.ts";
import { DESCRIPTOR_ALGORITHM_VERSION } from "../src/components/evaluations/descriptorV2.ts";
import { openVolumeRegions } from "../src/components/evaluations/openVolume.ts";
import {
  architecturalEdges,
  cellCutPolygon,
  cellMeetsPlane,
  comparisonScale,
  defaultSectionPlane,
  meshBounds,
  sectionTriangles,
  simplifySegments,
  visibleElevation,
} from "../src/components/evaluations/meshSection.ts";
import { assignImportedMeshes } from "../src/components/lattice/importAssignment.ts";
import { cellCenter } from "../src/components/evaluations/descriptorEvidence.ts";
import { suggestSlot } from "../src/components/lattice/slots.ts";
import { fileToSpec, unpackCell } from "../src/components/lattice/types.ts";

/**
 * The 15 original architectural OBJ files stay outside this repository.
 * Pass --source=<directory> or set LUV_ARCHITECTURAL_OBJS.
 */
function externalObjDir() {
  const flag = process.argv.find((arg) => arg.startsWith("--source="));
  const configured = (flag ? flag.slice("--source=".length) : "") || process.env.LUV_ARCHITECTURAL_OBJS || "";
  if (!configured) {
    throw new Error("The 15 original architectural OBJ files are not in this repository. Pass --source=<directory> or set LUV_ARCHITECTURAL_OBJS.");
  }
  return configured;
}

const sourceDir = externalObjDir();
const sourceProvenance = "External directory of the 15 original architectural OBJ files, supplied with --source or LUV_ARCHITECTURAL_OBJS. The files are not stored in this repository.";
const project = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(project, "reports", "authoritative-objs");
const expected = [
  "Gathering Linear.obj",
  "Gathering Void Field.obj",
  "Gathering, Plate.obj",
  "Gathering, Room within Volume.obj",
  "Gathering, Stepped.obj",
  "Lobby Continuous Hall.obj",
  "Lobby Vertical Void.obj",
  "Lobby, Ground Field.obj",
  "Lobby, Linear.obj",
  "Lobby, Sequential.obj",
  "workspace cascaded.obj",
  "workspace flat deep-plate.obj",
  "workspace open hall.obj",
  "workspace undulating.obj",
  "workspace void.obj",
];

mkdirSync(outDir, { recursive: true });
writeSync(1, "authoritative OBJ validation starting\n");

function save(name, payload) {
  writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2));
  writeSync(1, `saved ${name}\n`);
}

function fail(error) {
  save("run-status.json", { outcome: "failed", error: error instanceof Error ? error.stack : String(error) });
  writeSync(1, `FAIL ${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
}

const assignmentRefs = expected.map((filename, index) => ({
  id: `upload-${index}`,
  filename,
  suggestedSlotId: suggestSlot(filename),
}));
const assignment = assignImportedMeshes({}, assignmentRefs);
const assignedIds = Object.values(assignment.assignments).filter(Boolean);
if (new Set(assignedIds).size !== expected.length || assignedIds.length !== expected.length) {
  fail(new Error(`Upload assignment covered ${assignedIds.length} of ${expected.length}`));
}
if (!geometryExceedsSessionStore([{ positions: { length: 200_001 } }]) || geometryExceedsSessionStore([{ positions: { length: 10 } }])) {
  fail(new Error("Session-store size guard failed"));
}
save("upload-assignment.json", {
  outcome: "complete",
  note: "Keyword matches claim a slot. Other files fill an empty slot of the same program when the filename says Gathering, Lobby, or workspace. Catalog slot titles are not renamed, and the mesh filename remains the evaluation identity.",
  keywordAssigned: assignment.keywordAssigned,
  filledEmptySlots: assignment.filledEmptySlots,
  assignments: assignment.assignments,
  sessionStore: "Meshes whose packed position buffers exceed 200000 floats are kept in the browser tab and omitted from localStorage.",
});

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function classify(boundary, nonManifold, degenerate, triangles) {
  if (!triangles) return "invalid";
  const labels = [];
  if (boundary === 0 && nonManifold === 0 && degenerate === 0) labels.push("watertight");
  if (boundary > 0) labels.push("open-boundary");
  if (nonManifold > 0) labels.push("non-manifold");
  if (degenerate > 0) labels.push("degenerate");
  return labels.join("+");
}

function inspect(mesh) {
  const positions = mesh.positions;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  const edges = new Map();
  let triangles = 0;
  let degenerate = 0;
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const ids = [face.vertices[0], face.vertices[index], face.vertices[index + 1]];
      triangles += 1;
      const point = (vertex) => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
      const [a, b, c] = ids.map(point);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      if (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2] < 1e-16) degenerate += 1;
      for (let edge = 0; edge < 3; edge += 1) {
        const key = edgeKey(ids[edge], ids[(edge + 1) % 3]);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary += 1;
    else if (count !== 2) nonManifold += 1;
  }
  return {
    vertices: positions.length / 3,
    faces: mesh.faces.length,
    triangles,
    fileBounds: { min, max, size: min.map((value, axis) => max[axis] - value) },
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    degenerateTriangles: degenerate,
    classification: classify(boundary, nonManifold, degenerate, triangles),
    watertight: boundary === 0 && nonManifold === 0 && degenerate === 0 && triangles > 0,
    upAxis: mesh.upAxis,
  };
}

function commentsOf(text) {
  return text.split(/\r?\n/).filter((line) => line.startsWith("#")).slice(0, 4);
}

const present = new Set(readdirSync(sourceDir));
const inventory = [];
for (const filename of expected) {
  if (!present.has(filename)) fail(new Error(`Missing ${filename}`));
  const full = join(sourceDir, filename);
  const bytes = readFileSync(full);
  const text = bytes.toString("utf8");
  const { parseObj } = await import("../src/components/lattice/parseObj.ts");
  const mesh = parseObj(text, filename);
  const before = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  const record = {
    filename,
    bytes: statSync(full).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    comments: commentsOf(text),
    suggestedSlotId: mesh.suggestedSlotId,
    ...inspect(mesh),
    unit: "Validated: Y-up, 1 file unit = 1 architectural foot. The OBJ comment does not name a unit.",
    orientation: mesh.upAxis === "z"
      ? "Parser read a z-up comment."
      : "Parser default is Y-up. The file comment is '# Rhino' and does not say z-up or y-up.",
  };
  const after = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  if (!before.equals(after)) fail(new Error(`${filename} positions changed during inspection`));
  inventory.push(record);
  writeSync(1, `inventory ${filename} ${record.classification} verts ${record.vertices} tris ${record.triangles}\n`);
  save("mesh-inventory.json", { outcome: "partial", files: inventory });
}
const extra = [...present].filter((name) => name.toLowerCase().endsWith(".obj") && !expected.includes(name));
save("mesh-inventory.json", {
  outcome: inventory.length === 15 ? "complete" : "incomplete",
  sourceProvenance,
  readable: inventory.length,
  extraObjFiles: extra,
  files: inventory,
});

const { analyzeMesh } = await import("../src/components/lattice/analyze.ts");
const { evaluateTileModel } = await import("../src/components/evaluations/objDescriptorAnalysis.ts");
const { parseObj } = await import("../src/components/lattice/parseObj.ts");

function scoreFile(filename) {
  const full = join(sourceDir, filename);
  const bytes = readFileSync(full);
  const mesh = parseObj(bytes.toString("utf8"), filename);
  const positionCopy = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  const model = analyzeMesh(mesh, null, 1, mesh.upAxis);
  const evaluation = evaluateTileModel(model, {
    positions: mesh.positions,
    faces: mesh.faces,
    up: mesh.upAxis,
    unitScale: 1,
  });
  const descriptor = evaluation.descriptors.find((item) => item.id === "openVolume");
  const occupied = model.variants[0].occupied.map((packed) => unpackCell(packed));
  const regions = openVolumeRegions(occupied);
  const unchanged = positionCopy.equals(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  return {
    filename,
    meshId: mesh.id,
    revision: geometryContentRevision(mesh.positions, filename),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    unchanged,
    cellFeet: model.cellFeet,
    anchor: model.anchor,
    occupiedCells: occupied.length,
    freeCells: regions.free.length,
    interstitialCells: regions.interstitial.length,
    specBoundsFeet: {
      x: evaluation.raw?.bboxX,
      y: evaluation.raw?.bboxY,
      z: evaluation.raw?.bboxZ,
    },
    vertexCount: evaluation.raw?.vertexCount,
    faceCount: evaluation.raw?.faceCount,
    absoluteScore: descriptor?.absoluteScore ?? null,
    roundedScore: descriptor?.score ?? null,
    components: descriptor?.components?.map((component) => ({
      name: component.name,
      value: component.value,
      raw: component.raw,
      weight: component.weight,
    })) ?? [],
    eligible: Number.isFinite(descriptor?.absoluteScore),
    circulationFeasible: null,
  };
}

const scored = [];
for (const filename of expected) {
  try {
    const row = scoreFile(filename);
    if (!row.unchanged) fail(new Error(`${filename} positions changed during evaluation`));
    scored.push(row);
    writeSync(1, `scored ${filename} ${row.absoluteScore}\n`);
  } catch (error) {
    scored.push({
      filename,
      absoluteScore: null,
      eligible: false,
      circulationFeasible: null,
      error: error instanceof Error ? error.message : String(error),
    });
    writeSync(1, `score failed ${filename}\n`);
  }
  save("open-volume-ranking.json", { outcome: "partial", descriptor: "openVolume", forms: scored });
}

const repeated = [];
for (const filename of expected) {
  const first = scored.find((row) => row.filename === filename);
  if (!first?.eligible) continue;
  const second = scoreFile(filename);
  repeated.push({ filename, first: first.absoluteScore, second: second.absoluteScore, match: first.absoluteScore === second.absoluteScore });
  writeSync(1, `repeat ${filename} ${second.absoluteScore === first.absoluteScore ? "match" : "DIFFER"}\n`);
}

const forms = scored.map((row) => ({
  formId: row.filename,
  slotId: row.filename,
  meshId: row.meshId ?? row.filename,
  filename: row.filename,
  geometryRevision: row.revision ?? "unavailable",
  absoluteScore: row.absoluteScore,
  circulationFeasible: null,
  eligible: row.eligible,
  ineligibleReason: row.error,
  descriptors: [{
    id: "openVolume",
    absoluteScore: row.absoluteScore ?? 0,
    components: row.components ?? [],
  }],
}));
const eligibleForms = forms.filter((form) => form.eligible);
assignComparativeRanks(eligibleForms);
const selection = selectDescriptorExtremes("openVolume", forms.map((form) => ({
  formId: form.formId,
  slotId: form.slotId,
  meshId: form.meshId,
  filename: form.filename,
  geometryRevision: form.geometryRevision,
  absoluteScore: form.eligible ? form.absoluteScore : null,
  circulationFeasible: null,
  eligible: form.eligible,
  ineligibleReason: form.ineligibleReason,
})));
const ranked = eligibleForms
  .map((form) => {
    const source = scored.find((row) => row.filename === form.filename);
    const descriptor = form.descriptors[0];
    return {
      comparativeRank: descriptor.comparativeRank,
      filename: form.filename,
      absoluteScore: source.absoluteScore,
      roundedScore: source.roundedScore,
      tieBreakUsed: descriptor.tieBreakUsed,
      cellFeet: source.cellFeet,
      occupiedCells: source.occupiedCells,
      freeCells: source.freeCells,
      interstitialCells: source.interstitialCells,
      specBoundsFeet: source.specBoundsFeet,
      components: source.components,
      revision: source.revision,
      sha256: source.sha256,
      meshId: source.meshId,
    };
  })
  .sort((left, right) => left.comparativeRank - right.comparativeRank);
save("open-volume-ranking.json", {
  outcome: "complete",
  population: "authoritative local architectural OBJs",
  sourceProvenance,
  algorithm: DESCRIPTOR_ALGORITHM_VERSION,
  unitScale: 1,
  unitNote: "Validated architectural interpretation: Y-up, with 1 file unit representing 1 architectural foot. The OBJ comment does not name a unit.",
  upAxis: "Validated Y-up. Recorded per file in mesh-inventory.json.",
  circulation: "Not evaluated. circulationFeasible is null. Descriptor rank is not a circulation result.",
  sampleScoresDiscarded: "65.65 and 71.75 are public/part2-samples results and are not used here.",
  reproducibility: repeated,
  least: selection.least,
  most: selection.most,
  leastTies: selection.leastTies.map((form) => form.filename),
  mostTies: selection.mostTies.map((form) => form.filename),
  note: selection.note,
  unavailable: scored.filter((row) => !row.eligible),
  ranking: ranked,
});

function trianglesOf(mesh) {
  const triangles = [];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const at = (vertex) => fileToSpec(
        mesh.positions[vertex * 3],
        mesh.positions[vertex * 3 + 1],
        mesh.positions[vertex * 3 + 2],
        mesh.upAxis,
      );
      triangles.push({ a: at(face.vertices[0]), b: at(face.vertices[index]), c: at(face.vertices[index + 1]) });
    }
  }
  return triangles;
}

function planeError(cut, plane) {
  let worst = 0;
  const sample = cut.segments.slice(0, 24);
  for (const segment of sample) {
    for (const point of [segment.a, segment.b]) {
      const delta = [
        point[0] - plane.origin[0],
        point[1] - plane.origin[1],
        point[2] - plane.origin[2],
      ];
      const length = Math.hypot(...plane.normal) || 1;
      const distance = Math.abs((delta[0] * plane.normal[0] + delta[1] * plane.normal[1] + delta[2] * plane.normal[2]) / length);
      worst = Math.max(worst, distance);
    }
  }
  return { sampledSegments: sample.length, maxAbsoluteDistance: worst };
}

function sectionFile(filename) {
  const full = join(sourceDir, filename);
  const beforeHash = createHash("sha256").update(readFileSync(full)).digest("hex");
  const mesh = parseObj(readFileSync(full, "utf8"), filename);
  const positionCopy = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  const model = analyzeMesh(mesh, null, 1, mesh.upAxis);
  const occupied = model.variants[0].occupied.map((packed) => unpackCell(packed));
  const regions = openVolumeRegions(occupied);
  const located = regions.interstitial.length ? regions.interstitial : regions.free;
  const triangles = trianglesOf(mesh);
  const bounds = meshBounds(triangles);
  const plane = defaultSectionPlane(bounds);
  const cut = sectionTriangles(triangles, plane);
  const gold = located
    .map((cell) => cellCenter(model.anchor, cell, model.cellFeet))
    .filter((center) => cellMeetsPlane(center, model.cellFeet, plane));
  const polygons = gold.map((center) => cellCutPolygon(center, model.cellFeet, plane)).filter((polygon) => polygon.length >= 3);
  const edges = architecturalEdges(triangles);
  const silhouette = simplifySegments(visibleElevation(edges.silhouette, plane, 8));
  const secondary = simplifySegments(visibleElevation(edges.secondary, plane, 4));
  const profile = simplifySegments(cut.segments);
  const unchanged = positionCopy.equals(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  const afterHash = createHash("sha256").update(readFileSync(full)).digest("hex");
  return {
    filename,
    sha256: afterHash,
    hashUnchanged: beforeHash === afterHash,
    positionsUnchanged: unchanged,
    triangles: triangles.length,
    bounds,
    plane,
    cut,
    gold,
    polygons,
    silhouette,
    secondary,
    profile,
    goldSource: regions.interstitial.length ? "interstitial cells" : "free cells inside occupied bounds",
    freeCells: regions.free.length,
    interstitialCells: regions.interstitial.length,
    cellFeet: model.cellFeet,
    planeCheck: planeError(cut, plane),
    score: scored.find((row) => row.filename === filename)?.absoluteScore ?? null,
  };
}

if (!selection.least || !selection.most) fail(new Error("No eligible Open Volume extremes"));
writeSync(1, `sectioning ${selection.least.filename} and ${selection.most.filename}\n`);
const least = sectionFile(selection.least.filename);
const most = sectionFile(selection.most.filename);
const panel = { width: 3400, height: 1200 };
const scale = comparisonScale(least.bounds.size, most.bounds.size, "physical", panel);
save("section-fidelity.json", {
  outcome: "complete",
  plane: "section-y through each form's geometric center. This is the existing default. It is not selected to reveal Open Volume.",
  physicalScale: scale,
  least: summary(least),
  most: summary(most),
  goldMeaning: "Gold marks Open Volume cells already counted by the evaluator that also meet this plane. Empty drawing area is not claimed to be accessible open volume.",
});

function summary(entry) {
  return {
    filename: entry.filename,
    score: entry.score,
    sha256: entry.sha256,
    hashUnchanged: entry.hashUnchanged,
    positionsUnchanged: entry.positionsUnchanged,
    triangles: entry.triangles,
    segments: entry.cut.segments.length,
    pocheReliable: entry.cut.pocheReliable,
    closedLoops: entry.cut.closedLoops.length,
    limitation: entry.cut.limitation,
    boundsFeet: entry.bounds.size,
    planeOrigin: entry.plane.origin,
    planeNormal: entry.plane.normal,
    planeCheck: entry.planeCheck,
    freeCells: entry.freeCells,
    interstitialCells: entry.interstitialCells,
    goldSource: entry.goldSource,
    goldOnCut: entry.gold.length,
    cellFeet: entry.cellFeet,
  };
}

function boardFrom(width, height, entries) {
  const view = { width: Math.round(width * 0.45), height: Math.round(height * 0.58) };
  const shared = comparisonScale(entries.least.bounds.size, entries.most.bounds.size, "physical", view);
  const header = Math.round(height * 0.18);
  const leastPanel = { x: Math.round(width * 0.04), y: header, width: view.width, height: view.height };
  const mostPanel = { x: Math.round(width * 0.52), y: header, width: view.width, height: view.height };
  const leastPlaced = placeSection(entries.least.profile, entries.least.silhouette, entries.least.polygons, "section-y", entries.least.bounds, leastPanel, shared.feetPerPixelA, entries.least.secondary);
  const mostPlaced = placeSection(entries.most.profile, entries.most.silhouette, entries.most.polygons, "section-y", entries.most.bounds, mostPanel, shared.feetPerPixelB, entries.most.secondary);
  return {
    width,
    height,
    descriptorName: "Open Volume",
    title: "Authoritative architectural OBJ comparison",
    leastLabel: entries.least.filename,
    mostLabel: entries.most.filename,
    leastScore: Number(entries.least.score).toFixed(1),
    mostScore: Number(entries.most.score).toFixed(1),
    leastLines: leastPlaced.lines,
    mostLines: mostPlaced.lines,
    leastRegions: leastPlaced.regions,
    mostRegions: mostPlaced.regions,
    explanation: `Open Volume absolute scores from evaluateTileModel on the original meshes. Least ${entries.least.filename} ${Number(entries.least.score).toFixed(1)}. Most ${entries.most.filename} ${Number(entries.most.score).toFixed(1)}. Circulation was not evaluated.`,
    legend: "Gold marks verified Open Volume cells on this cut.",
    orientation: "section-y geometric center",
    scaleLabel: shared.label,
    vectorComplete: true,
    limitation: entries.least.cut.limitation || entries.most.cut.limitation,
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function rasterBoard(board) {
  const rgba = Buffer.alloc(board.width * board.height * 4);
  const set = (x, y, color) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= board.width || py >= board.height) return;
    const index = (py * board.width + px) * 4;
    rgba[index] = color[0];
    rgba[index + 1] = color[1];
    rgba[index + 2] = color[2];
    rgba[index + 3] = 255;
  };
  const line = (x1, y1, x2, y2, color) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      set(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, color);
    }
  };
  const hex = (value) => {
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
  };
  const ctx = {
    fillStyle: "#000000",
    strokeStyle: "#F7F6F5",
    lineWidth: 1,
    font: "16px sans-serif",
    fillRect(x, y, w, h) {
      const color = hex(this.fillStyle);
      if (x <= 0 && y <= 0 && w >= board.width && h >= board.height) {
        const pixel = (255 << 24) | (color[2] << 16) | (color[1] << 8) | color[0];
        new Uint32Array(rgba.buffer, rgba.byteOffset, board.width * board.height).fill(pixel >>> 0);
      }
    },
    strokeRect(x, y, w, h) {
      const color = hex(this.strokeStyle);
      line(x, y, x + w, y, color);
      line(x, y + h, x + w, y + h, color);
      line(x, y, x, y + h, color);
      line(x + w, y, x + w, y + h, color);
    },
    beginPath() { this._path = []; },
    moveTo(x, y) { this._path = [[x, y]]; },
    lineTo(x, y) { this._path.push([x, y]); },
    closePath() {
      if (this._path?.length) this._path.push(this._path[0]);
    },
    stroke() {
      const color = hex(this.strokeStyle);
      const width = Math.max(1, this.lineWidth || 1);
      const steps = Math.max(1, Math.round(width));
      for (let index = 1; index < (this._path?.length ?? 0); index += 1) {
        const a = this._path[index - 1];
        const b = this._path[index];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ox = (-(b[1] - a[1]) / length) * (width / steps);
        const oy = ((b[0] - a[0]) / length) * (width / steps);
        for (let offset = 0; offset < steps; offset += 1) {
          const shift = offset - (steps - 1) / 2;
          line(a[0] + ox * shift, a[1] + oy * shift, b[0] + ox * shift, b[1] + oy * shift, color);
        }
      }
    },
    fill() {
      const points = this._path ?? [];
      if (points.length < 3) return;
      const color = hex(this.fillStyle);
      const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
      const maxY = Math.min(board.height - 1, Math.ceil(Math.max(...points.map((point) => point[1]))));
      for (let y = minY; y <= maxY; y += 1) {
        const crossings = [];
        for (let index = 0; index < points.length; index += 1) {
          const a = points[index];
          const b = points[(index + 1) % points.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
            const t = (y - a[1]) / (b[1] - a[1]);
            crossings.push(a[0] + t * (b[0] - a[0]));
          }
        }
        crossings.sort((left, right) => left - right);
        for (let index = 0; index + 1 < crossings.length; index += 2) {
          const start = Math.max(0, Math.ceil(crossings[index]));
          const end = Math.min(board.width - 1, Math.floor(crossings[index + 1]));
          for (let x = start; x <= end; x += 1) set(x, y, color);
        }
      }
    },
    fillText(text, x, y) {
      const size = Number.parseFloat(this.font) || 16;
      const color = hex(this.fillStyle);
      for (const glyph of labelGlyphs(text, size)) {
        const left = Math.round(x + glyph.x);
        const top = Math.round(y + glyph.y);
        const right = Math.round(left + glyph.w);
        const bottom = Math.round(top + glyph.h);
        for (let py = top; py < bottom; py += 1) for (let px = left; px < right; px += 1) set(px, py, color);
      }
    },
  };
  paintComparisonBoard(ctx, board);
  return encodePng(board.width, board.height, rgba);
}

writeSync(1, "writing preview\n");
const previewBoard = boardFrom(960, 280, { least, most });
const preview = rasterBoard(previewBoard);
writeFileSync(join(outDir, "open-volume-preview.png"), preview);
writeSync(1, "writing 7407x2160 board\n");
const fullBoard = boardFrom(7407, 2160, { least, most });
const png = rasterBoard(fullBoard);
const svg = comparisonBoardSvg(fullBoard);
writeFileSync(join(outDir, "open-volume-board.png"), png);
writeFileSync(join(outDir, "open-volume-board.svg"), svg);
const pngSize = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
const previewSize = { width: preview.readUInt32BE(16), height: preview.readUInt32BE(20) };
const hashes = expected.map((filename) => createHash("sha256").update(readFileSync(join(sourceDir, filename))).digest("hex"));
const hashMatch = hashes.every((hash, index) => hash === inventory[index].sha256);
save("export.json", {
  outcome: pngSize.width === 7407 && pngSize.height === 2160 && hashMatch ? "complete" : "failed",
  preview: previewSize,
  png: pngSize,
  svg: "open-volume-board.svg",
  svgHasLeast: svg.includes(least.filename) && svg.includes(Number(least.score).toFixed(1)),
  svgHasMost: svg.includes(most.filename) && svg.includes(Number(most.score).toFixed(1)),
  svgGold: svg.includes("#D6AD4F"),
  svgVectorNote: svg.includes("vector geometry"),
  sourceHashesUnchanged: hashMatch,
  pngText: "This Node raster draws section lines, gold marks, and the frame. Label text is in the SVG. The browser export uses canvas text.",
});
save("run-status.json", {
  outcome: pngSize.width === 7407 && pngSize.height === 2160 && hashMatch && repeated.every((row) => row.match) ? "complete" : "failed",
  least: least.filename,
  most: most.filename,
  leastScore: least.score,
  mostScore: most.score,
});
writeSync(1, `PASS authoritative ${least.filename} ${Number(least.score).toFixed(1)} / ${most.filename} ${Number(most.score).toFixed(1)} png ${pngSize.width}x${pngSize.height}\n`);
