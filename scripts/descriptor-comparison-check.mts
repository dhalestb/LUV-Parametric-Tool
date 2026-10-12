import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, writeSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectDescriptorExtremes } from "../src/components/evaluations/comparisonSelection.ts";
import { buildDescriptorEvidence, cellCenter, geometryContentRevision, resolveEvidence } from "../src/components/evaluations/descriptorEvidence.ts";
import { specFeetToFile } from "../src/components/evaluations/geometryView.ts";
import {
  cellMeetsPlane,
  comparisonScale,
  meshBounds,
  planeFromOrientation,
  rotatePlane,
  sectionTriangles,
  translatePlane,
} from "../src/components/evaluations/meshSection.ts";
import { comparisonBoardSvg, paintComparisonBoard } from "../src/components/evaluations/comparisonBoard.ts";
import { DESCRIPTOR_ALGORITHM_VERSION } from "../src/components/evaluations/descriptorV2.ts";
import { openVolumeRegions } from "../src/components/evaluations/openVolume.ts";
import { fileToSpec, unpackCell } from "../src/components/lattice/types.ts";

const root = dirname(fileURLToPath(import.meta.url));
const project = dirname(root);
const failures = [];
writeSync(1, "descriptor checks starting\n");

function check(name, fn) {
  try {
    fn();
    writeSync(1, `PASS ${name}\n`);
  } catch (error) {
    failures.push(name);
    writeSync(1, `FAIL ${name}: ${error instanceof Error ? error.message : error}\n`);
  }
}

const form = (formId, score, extra = {}) => ({
  formId,
  slotId: formId,
  meshId: `mesh-${formId}`,
  filename: `${formId}.obj`,
  geometryRevision: "geom:1",
  absoluteScore: score,
  circulationFeasible: null,
  eligible: score !== null,
  ...extra,
});

check("lowest and highest use the absolute score", () => {
  const result = selectDescriptorExtremes("monumental", [form("G2", 40), form("O1", 10), form("L1", 70)]);
  assert.equal(result.least?.formId, "O1");
  assert.equal(result.most?.formId, "L1");
  assert.equal(result.least?.absoluteScore, 10);
  assert.equal(result.most?.absoluteScore, 70);
});

check("missing scores and ineligible forms stay out", () => {
  const result = selectDescriptorExtremes("openVolume", [
    form("A", null, { eligible: false, ineligibleReason: "Not evaluated." }),
    form("B", 12),
  ]);
  assert.equal(result.least?.formId, "B");
  assert.equal(result.most?.formId, "B");
  assert.match(result.note, /left out/);
});

check("ties keep one score and list every tied form", () => {
  const result = selectDescriptorExtremes("sculptural", [form("B", 20), form("A", 20), form("C", 5)]);
  assert.equal(result.least?.formId, "C");
  assert.deepEqual(result.mostTies.map((item) => item.formId), ["A", "B"]);
  assert.equal(result.most?.absoluteScore, 20);
});

check("descriptor viability ignores circulation failure", () => {
  const result = selectDescriptorExtremes("monumental", [
    form("Low", 15, { circulationFeasible: true }),
    form("High", 90, { circulationFeasible: false }),
  ]);
  assert.equal(result.most?.formId, "High");
  assert.equal(result.most?.circulationFeasible, false);
  assert.match(result.note, /not circulation/);
});

check("form identity and geometry revision stay on the evidence", () => {
  const record = buildDescriptorEvidence({
    descriptorId: "monumental",
    descriptorName: "Monumental",
    formId: "G1",
    meshId: "mesh-g1",
    filename: "a.obj",
    score: 10,
    absoluteScore: 10.2,
    evaluationRecordId: "mesh-g1:monumental",
    geometryRevision: "geom:9",
    components: [{ name: "Height", value: 10, raw: 30, rawUnit: "ft" }],
    anchor: [0, 0, 0],
    cellFeet: 2,
  });
  assert.equal(record.formId, "G1");
  assert.equal(record.meshId, "mesh-g1");
  assert.equal(record.geometryRevision, "geom:9");
  assert.equal(record.overlayAvailable, false);
  assert.equal(record.evidenceClass, "documented-qualitative");
  assert.match(record.explanation, /Overlay unavailable/);
});

check("a geometry edit invalidates evidence", () => {
  const before = geometryContentRevision(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), "mesh");
  const after = geometryContentRevision(new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]), "mesh");
  assert.notEqual(before, after);
  const record = buildDescriptorEvidence({
    descriptorId: "openVolume",
    descriptorName: "Open Volume",
    formId: "O1",
    meshId: "mesh",
    filename: "o.obj",
    score: 1,
    absoluteScore: 1,
    evaluationRecordId: "mesh:openVolume",
    geometryRevision: before,
    components: [],
    anchor: [0, 0, 0],
    cellFeet: 2,
    locatedCells: [[0, 0, 0]],
  });
  const stale = resolveEvidence(record, "O1", after);
  assert.equal(stale.overlayAvailable, false);
  assert.equal(stale.features.length, 0);
  const wrongForm = resolveEvidence(record, "G2", before);
  assert.equal(wrongForm.overlayAvailable, false);
});

check("open volume gold is the measured free cells, not a guessed region", () => {
  const cells = [[0, 0, 0], [2, 0, 0]];
  const regions = openVolumeRegions(cells);
  assert.ok(regions.free.some((cell) => cell[0] === 1 && cell[1] === 0 && cell[2] === 0));
  const record = buildDescriptorEvidence({
    descriptorId: "openVolume",
    descriptorName: "Open Volume",
    formId: "O1",
    meshId: "mesh",
    filename: "o.obj",
    score: 1,
    absoluteScore: 1,
    evaluationRecordId: "mesh:openVolume",
    geometryRevision: "geom:1",
    components: [],
    anchor: [0, 0, 0],
    cellFeet: 2,
    locatedCells: regions.free,
  });
  assert.equal(record.evidenceClass, "verified-geometric");
  assert.equal(record.features[0].cells.length, regions.free.length);
  const other = buildDescriptorEvidence({
    descriptorId: "sculptural",
    descriptorName: "Sculptural",
    formId: "O1",
    meshId: "mesh",
    filename: "o.obj",
    score: 1,
    absoluteScore: 1,
    evaluationRecordId: "mesh:sculptural",
    geometryRevision: "geom:1",
    components: [{ name: "Articulation", value: 4 }],
    anchor: [0, 0, 0],
    cellFeet: 2,
    locatedCells: regions.free,
  });
  assert.equal(other.overlayAvailable, false);
  assert.equal(other.features.length, 0);
});

check("section hits a real triangle and leaves the coordinates unchanged", () => {
  const triangle = { a: [0, 0, 0], b: [2, 0, 0], c: [0, 0, 2] };
  const copy = JSON.stringify(triangle);
  const cut = sectionTriangles([triangle], planeFromOrientation("plan", [0, 0, 1]));
  assert.equal(JSON.stringify(triangle), copy);
  assert.equal(cut.segments.length, 1);
  assert.equal(cut.pocheReliable, false);
  const heights = cut.segments[0].a[2] + cut.segments[0].b[2];
  assert.ok(Math.abs(heights - 2) < 1e-6);
});

check("an open mesh is cut without a filled poche", () => {
  const cut = sectionTriangles(
    [{ a: [0, 0, 0], b: [4, 0, 0], c: [0, 2, 0] }],
    planeFromOrientation("section-y", [0, 0, 0]),
  );
  assert.equal(cut.pocheReliable, false);
  assert.match(cut.limitation ?? "", /no poche/);
});

check("a nonmanifold join does not invent a closed volume", () => {
  const triangles = [
    { a: [0, 0, 0], b: [2, 0, 0], c: [1, 0, 2] },
    { a: [0, 0, 0], b: [2, 0, 0], c: [1, 1, 2] },
    { a: [0, 0, 0], b: [2, 0, 0], c: [1, -1, 2] },
  ];
  const cut = sectionTriangles(triangles, planeFromOrientation("plan", [0, 0, 1]));
  assert.equal(cut.segments.length, 3);
  assert.equal(cut.pocheReliable, false);
});

check("a closed box section can be poche", () => {
  const face = (a, b, c, d) => [{ a, b, c }, { a, b: c, c: d }];
  const p000 = [0, 0, 0];
  const p100 = [2, 0, 0];
  const p010 = [0, 2, 0];
  const p110 = [2, 2, 0];
  const p001 = [0, 0, 2];
  const p101 = [2, 0, 2];
  const p011 = [0, 2, 2];
  const p111 = [2, 2, 2];
  const triangles = [
    ...face(p000, p100, p110, p010),
    ...face(p001, p011, p111, p101),
    ...face(p000, p010, p011, p001),
    ...face(p100, p101, p111, p110),
    ...face(p000, p001, p101, p100),
    ...face(p010, p110, p111, p011),
  ];
  const cut = sectionTriangles(triangles, planeFromOrientation("plan", [0, 0, 1]));
  assert.ok(cut.segments.length >= 4);
  assert.equal(cut.pocheReliable, true);
});

check("matched physical scale is shared and fit scale is not", () => {
  const physical = comparisonScale([10, 2, 2], [2, 2, 2], "physical", { width: 100, height: 100 });
  assert.equal(physical.feetPerPixelA, physical.feetPerPixelB);
  assert.equal(physical.shared, true);
  const fit = comparisonScale([10, 2, 2], [2, 2, 2], "fit", { width: 100, height: 100 });
  assert.notEqual(fit.feetPerPixelA, fit.feetPerPixelB);
});

check("section translation and rotation move the cut", () => {
  const triangle = { a: [0, 0, 0], b: [0, 4, 0], c: [0, 0, 4] };
  const base = planeFromOrientation("section-y", [0, 1, 0]);
  const moved = translatePlane(base, 1);
  const first = sectionTriangles([triangle], base);
  const second = sectionTriangles([triangle], moved);
  assert.notEqual(first.segments[0].a[1], second.segments[0].a[1]);
  const turned = rotatePlane(base, 90);
  assert.equal(turned.orientation, "section-x");
  const synced = translatePlane(planeFromOrientation("section-y", meshBounds([triangle]).center), 3);
  const other = translatePlane(planeFromOrientation("section-y", [10, 10, 10]), 3);
  assert.equal(synced.origin[1] - meshBounds([triangle]).center[1], other.origin[1] - 10);
});

check("Y-up file coordinates convert once", () => {
  const file = specFeetToFile([3, -4, 5], "y", 2);
  assert.deepEqual(file, [1.5, 2.5, 2]);
  assert.deepEqual(specFeetToFile([3, 4, 5], "z", 1), [3, 4, 5]);
});

check("descriptor formula version is unchanged", () => {
  assert.equal(DESCRIPTOR_ALGORITHM_VERSION, "v3.3");
  const source = readFileSync(join(project, "src/components/evaluations/objDescriptorAnalysis.ts"), "utf8");
  assert.match(source, /weight: 0\.35/);
  assert.match(source, /weight: 0\.3/);
  assert.match(source, /weight: 0\.25/);
  assert.match(source, /weight: 0\.1/);
  const open = readFileSync(join(project, "src/components/evaluations/openVolume.ts"), "utf8");
  assert.match(open, /0\.35 \* measurement\.architecturalOpenSpace/);
});

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
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
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
  const ctx = {
    fillStyle: "#000000",
    strokeStyle: "#ffffff",
    lineWidth: 1,
    font: "12px sans-serif",
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
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    fillText() {},
    globalAlpha: 1,
  };
  paintComparisonBoard(Object.assign(ctx, {
    beginPath() { this._path = []; },
    moveTo(x, y) { this._path = [[x, y]]; },
    lineTo(x, y) { this._path.push([x, y]); },
    stroke() {
      const color = hex(this.strokeStyle);
      for (let index = 1; index < (this._path?.length ?? 0); index += 1) {
        line(this._path[index - 1][0], this._path[index - 1][1], this._path[index][0], this._path[index][1], color);
      }
    },
  }), board);
  return encodePng(board.width, board.height, rgba);
}

function hex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
}

check("png encoder records a requested pixel size", () => {
  const board = {
    width: 320,
    height: 120,
    descriptorName: "Open Volume",
    title: "dimension check",
    leastLabel: "A",
    mostLabel: "B",
    leastScore: "1.0",
    mostScore: "2.0",
    leastLines: [{ x1: 200, y1: 400, x2: 800, y2: 900, gold: false }],
    mostLines: [{ x1: 4000, y1: 500, x2: 4600, y2: 700, gold: true }],
    explanation: "Dimension check only.",
    legend: "Gold overlay unavailable for this descriptor.",
    orientation: "section-y",
    scaleLabel: "Matched physical scale.",
    vectorComplete: true,
    limitation: null,
  };
  const png = rasterBoard(board);
  const size = pngSize(png);
  assert.equal(size.width, 320);
  assert.equal(size.height, 120);
  const svg = comparisonBoardSvg(board);
  assert.match(svg, /width="320"/);
  assert.match(svg, /height="120"/);
  assert.match(svg, /#D6AD4F/);
  assert.match(svg, /Open Volume/);
  assert.match(svg, /Source OBJ geometry was not modified/);
  assert.doesNotMatch(svg, /<image/);
});

const outDir = join(project, "reports/descriptor-comparison");

function writeStage(name, payload) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2));
  writeSync(1, `saved ${name}\n`);
}

async function demonstrate() {
  writeSync(1, "stage A ranking\n");
  const { parseObj } = await import("../src/components/lattice/parseObj.ts");
  const { analyzeMesh } = await import("../src/components/lattice/analyze.ts");
  const { evaluateTileModel } = await import("../src/components/evaluations/objDescriptorAnalysis.ts");
  const sampleDir = join(project, "public/part2-samples");
  const files = readdirSync(sampleDir).filter((name) => name.toLowerCase().endsWith(".obj")).sort();
  assert.ok(files.length >= 2, "at least two sample OBJs");
  const before = new Map(files.map((name) => [name, createHash("sha256").update(readFileSync(join(sampleDir, name))).digest("hex")]));
  const evaluated = [];
  for (const name of files) {
    const mesh = parseObj(readFileSync(join(sampleDir, name), "utf8"), name);
    const original = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("hex");
    const model = analyzeMesh(mesh, name.slice(0, 2), 1, mesh.upAxis);
    const evaluation = evaluateTileModel(model, { positions: mesh.positions, faces: mesh.faces, up: mesh.upAxis, unitScale: 1 });
    const descriptor = evaluation.descriptors.find((item) => item.id === "openVolume");
    const occupied = model.variants[0].occupied.map((packed) => unpackCell(packed));
    const regions = openVolumeRegions(occupied);
    const positions = mesh.positions;
    const triangles = [];
    for (const face of mesh.faces) {
      for (let index = 1; index < face.vertices.length - 1; index += 1) {
        const at = (vertex) => fileToSpec(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2], mesh.upAxis);
        triangles.push({ a: at(face.vertices[0]), b: at(face.vertices[index]), c: at(face.vertices[index + 1]) });
      }
    }
    const bounds = meshBounds(triangles);
    const plane = planeFromOrientation("section-y", bounds.center);
    const cut = sectionTriangles(triangles, plane);
    const gold = regions.free
      .map((cell) => cellCenter(model.anchor, cell, model.cellFeet))
      .filter((center) => cellMeetsPlane(center, model.cellFeet, plane));
    const afterPositions = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength).toString("hex");
    assert.equal(afterPositions, original);
    evaluated.push({
      name,
      formId: name.slice(0, 2),
      meshId: mesh.id,
      revision: geometryContentRevision(mesh.positions, name),
      sha256: before.get(name),
      score: descriptor.absoluteScore,
      cut,
      regions,
      bounds,
      descriptor,
      gold,
      triangles: triangles.length,
    });
  }
  evaluated.sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));
  const rankedForms = evaluated.map((entry) => ({
    formId: entry.formId,
    slotId: entry.formId,
    meshId: entry.meshId,
    filename: entry.name,
    geometryRevision: entry.revision,
    absoluteScore: entry.score,
    circulationFeasible: null,
    eligible: Number.isFinite(entry.score),
  }));
  const selection = selectDescriptorExtremes("openVolume", rankedForms);
  writeStage("stage-a-ranking.json", {
    stage: "A",
    outcome: "complete",
    population: "public/part2-samples",
    sourceIdentity: "BLOCKED for uploaded architectural OBJs. These files are the repository sample tiles, each marked 'sample tile for Part 2'. Scores are the real evaluateTileModel results for that population.",
    descriptor: "openVolume",
    least: selection.least,
    most: selection.most,
    leastTies: selection.leastTies.map((form) => form.formId),
    mostTies: selection.mostTies.map((form) => form.formId),
    note: selection.note,
    forms: evaluated.map((entry) => ({
      file: entry.name,
      formId: entry.formId,
      meshId: entry.meshId,
      revision: entry.revision,
      sha256: entry.sha256,
      absoluteScore: entry.score,
      triangles: entry.triangles,
    })),
  });
  writeSync(1, "stage B sections\n");
  const least = evaluated.find((entry) => entry.formId === selection.least?.formId && entry.meshId === selection.least?.meshId) ?? evaluated[0];
  const most = evaluated.find((entry) => entry.formId === selection.most?.formId && entry.meshId === selection.most?.meshId) ?? evaluated[evaluated.length - 1];
  const scale = comparisonScale(least.bounds.size, most.bounds.size, "physical", { width: 640, height: 360 });
  writeStage("stage-b-sections.json", {
    stage: "B",
    outcome: "complete",
    sourceIdentity: "synthetic part2 sample tiles, not uploaded OBJs",
    least: {
      file: least.name,
      score: least.score,
      revision: least.revision,
      triangles: least.triangles,
      segments: least.cut.segments.length,
      pocheReliable: least.cut.pocheReliable,
      limitation: least.cut.limitation,
      bounds: least.bounds.size,
      freeCells: least.regions.free.length,
      goldOnCut: least.gold.length,
    },
    most: {
      file: most.name,
      score: most.score,
      revision: most.revision,
      triangles: most.triangles,
      segments: most.cut.segments.length,
      pocheReliable: most.cut.pocheReliable,
      limitation: most.cut.limitation,
      bounds: most.bounds.size,
      freeCells: most.regions.free.length,
      goldOnCut: most.gold.length,
    },
    physicalScale: scale,
    plane: "section-y through each form center. Geometric default, not a descriptor-optimal cut.",
    positionsUnchanged: true,
  });
  const linesFor = (entry, x) => {
    const cuts = entry.cut.segments.slice(0, 800).map((segment) => ({
      x1: x + 400 + segment.a[0],
      y1: 700 - segment.a[2],
      x2: x + 400 + segment.b[0],
      y2: 700 - segment.b[2],
      gold: false,
    }));
    const marks = entry.gold.slice(0, 400).flatMap((center) => {
      const px = x + 400 + center[0];
      const py = 700 - center[2];
      return [
        { x1: px - 4, y1: py, x2: px + 4, y2: py, gold: true },
        { x1: px, y1: py - 4, x2: px, y2: py + 4, gold: true },
      ];
    });
    return [...cuts, ...marks];
  };
  const board = {
    width: 7407,
    height: 2160,
    descriptorName: "Open Volume",
    title: `${least.name} / ${most.name}`,
    leastLabel: least.name,
    mostLabel: most.name,
    leastScore: least.score.toFixed(1),
    mostScore: most.score.toFixed(1),
    leastLines: linesFor(least, 200),
    mostLines: linesFor(most, 3800),
    explanation: `Actual Open Volume scores from evaluateTileModel. Least ${least.name} ${least.score.toFixed(1)}. Most ${most.name} ${most.score.toFixed(1)}. Free cells ${least.regions.free.length} and ${most.regions.free.length}.`,
    legend: least.gold.length || most.gold.length ? "Gold marks verified Open Volume cells that meet this section plane." : "Gold overlay unavailable for this cut.",
    orientation: "section-y geometric mid-span",
    scaleLabel: "Sample OBJ section, spec feet. Synthetic tiles, not uploaded OBJs.",
    vectorComplete: true,
    limitation: least.cut.limitation,
  };
  writeSync(1, "stage C preview\n");
  const preview = rasterBoard({ ...board, width: 960, height: 280 });
  writeFileSync(join(outDir, "open-volume-preview.png"), preview);
  const previewSize = pngSize(preview);
  assert.equal(previewSize.width, 960);
  assert.equal(previewSize.height, 280);
  writeSync(1, "stage C full board\n");
  const png = rasterBoard(board);
  const svg = comparisonBoardSvg(board);
  writeFileSync(join(outDir, "open-volume-board.png"), png);
  writeFileSync(join(outDir, "open-volume-board.svg"), svg);
  const size = pngSize(png);
  writeStage("stage-c-export.json", {
    stage: "C",
    outcome: size.width === 7407 && size.height === 2160 ? "complete" : "wrong-size",
    preview: previewSize,
    png: size,
    svg: "open-volume-board.svg",
    svgVector: true,
    note: "SVG is section linework, labels, and gold marks. It does not embed a 3D render.",
  });
  assert.equal(size.width, 7407);
  assert.equal(size.height, 2160);
  for (const name of files) {
    const hash = createHash("sha256").update(readFileSync(join(sampleDir, name))).digest("hex");
    assert.equal(hash, before.get(name));
  }
  writeSync(1, `PASS sample-population ${least.name} ${least.score.toFixed(1)} / ${most.name} ${most.score.toFixed(1)} png ${size.width}x${size.height}\n`);
  writeStage("run-status.json", { outcome: failures.length ? "unit-failures" : "complete", failures });
}

demonstrate().then(() => {
  if (failures.length) {
    writeSync(1, `FAILURES ${failures.join(", ")}\n`);
    process.exit(1);
  }
  writeSync(1, "descriptor comparison checks finished\n");
}).catch((error) => {
  writeStage("run-status.json", { outcome: "failed", error: error instanceof Error ? error.stack : String(error) });
  writeSync(1, `FAIL demonstration: ${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
