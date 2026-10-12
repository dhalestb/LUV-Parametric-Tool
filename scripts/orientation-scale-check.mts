import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileToSpec, unpackCell } from "../src/components/lattice/types.ts";
import { openVolumeRegions } from "../src/components/evaluations/openVolume.ts";
import { selectDescriptorExtremes } from "../src/components/evaluations/comparisonSelection.ts";
import { assignComparativeRanks } from "../src/components/evaluations/descriptorRank.ts";
import { defaultSectionPlane, meshBounds, sectionTriangles } from "../src/components/evaluations/meshSection.ts";

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
const outDir = join(project, "reports", "orientation-scale");
const files = [
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
const { parseObj } = await import("../src/components/lattice/parseObj.ts");
const { analyzeMesh } = await import("../src/components/lattice/analyze.ts");
const { evaluateTileModel } = await import("../src/components/evaluations/objDescriptorAnalysis.ts");

function save(name, payload) {
  writeFileSync(join(outDir, name), JSON.stringify(payload, null, 2));
  writeSync(1, `saved ${name}\n`);
}

function axisStats(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const bins = [Array(8).fill(0), Array(8).fill(0), Array(8).fill(0)];
  let count = 0;
  for (let index = 0; index < positions.length; index += 3) {
    count += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const span = max[axis] - min[axis] || 1;
      const bin = Math.min(7, Math.floor(((positions[index + axis] - min[axis]) / span) * 8));
      bins[axis][bin] += 1;
    }
  }
  return {
    vertices: count,
    min,
    max,
    size: min.map((value, axis) => max[axis] - value),
    lowSliceShare: bins.map((row) => row[0] / count),
    highSliceShare: bins.map((row) => row[7] / count),
  };
}

function normalAreas(mesh) {
  const positions = mesh.positions;
  const area = [0, 0, 0];
  let total = 0;
  const point = (vertex) => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const a = point(face.vertices[0]);
      const b = point(face.vertices[index]);
      const c = point(face.vertices[index + 1]);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const length = Math.hypot(cross[0], cross[1], cross[2]);
      if (length < 1e-12) continue;
      total += length;
      const dominant = cross.map(Math.abs).reduce((best, value, axis, all) => value > all[best] ? axis : best, 0);
      area[dominant] += length;
    }
  }
  return {
    horizontalIfZUp: total ? area[2] / total : 0,
    horizontalIfYUp: total ? area[1] / total : 0,
    horizontalIfXUp: total ? area[0] / total : 0,
  };
}

function trianglesOf(mesh, up) {
  const triangles = [];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const at = (vertex) => fileToSpec(
        mesh.positions[vertex * 3],
        mesh.positions[vertex * 3 + 1],
        mesh.positions[vertex * 3 + 2],
        up,
      );
      triangles.push({ a: at(face.vertices[0]), b: at(face.vertices[index]), c: at(face.vertices[index + 1]) });
    }
  }
  return triangles;
}

function scoreMesh(mesh, up, unitScale) {
  const before = createHash("sha256").update(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength)).digest("hex");
  const model = analyzeMesh(mesh, null, unitScale, up);
  const evaluation = evaluateTileModel(model, {
    positions: mesh.positions,
    faces: mesh.faces,
    up,
    unitScale,
  });
  const after = createHash("sha256").update(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength)).digest("hex");
  const descriptor = evaluation.descriptors.find((item) => item.id === "openVolume");
  const occupied = model.variants[0].occupied.map((packed) => unpackCell(packed));
  const regions = openVolumeRegions(occupied);
  return {
    up,
    unitScale,
    positionsUnchanged: before === after,
    cellFeet: model.cellFeet,
    occupiedCells: occupied.length,
    freeCells: regions.free.length,
    interstitialCells: regions.interstitial.length,
    specBoundsFeet: [evaluation.raw?.bboxX, evaluation.raw?.bboxY, evaluation.raw?.bboxZ],
    absoluteScore: descriptor?.absoluteScore ?? null,
    components: descriptor?.components?.map((component) => ({
      name: component.name,
      value: component.value,
      raw: component.raw,
      weight: component.weight,
    })) ?? [],
  };
}

const geometry = [];
const current = [];
const architectural = [];
for (const filename of files) {
  const full = join(sourceDir, filename);
  const bytes = readFileSync(full);
  const mesh = parseObj(bytes.toString("utf8"), filename);
  const stats = axisStats(mesh.positions);
  const normals = normalAreas(mesh);
  const fileSha = createHash("sha256").update(bytes).digest("hex");
  geometry.push({
    filename,
    sha256: fileSha,
    parserUpAxis: mesh.upAxis,
    comments: bytes.toString("utf8").split(/\r?\n/).filter((line) => line.startsWith("#")).slice(0, 3),
    fileUnits: stats,
    normals,
    spansNear20: stats.size.every((value) => value > 15 && value < 25),
    trueMillimeterSpanFeet: stats.size.map((value) => value * 0.003280839895),
    representationalSpanFeet: stats.size.map((value) => value * 1),
  });
  writeSync(1, `geometry ${filename} spans ${stats.size.map((value) => value.toFixed(3)).join(" x ")} zShare ${normals.horizontalIfZUp.toFixed(3)} yShare ${normals.horizontalIfYUp.toFixed(3)}\n`);
  current.push({ filename, sha256: fileSha, ...scoreMesh(mesh, "y", 1) });
  writeSync(1, `y-up ${filename} ${current.at(-1).absoluteScore}\n`);
  architectural.push({ filename, sha256: fileSha, ...scoreMesh(mesh, "z", 1) });
  writeSync(1, `z-up ${filename} ${architectural.at(-1).absoluteScore}\n`);
  save("partial.json", { geometry, current, architectural });
}

function rank(rows) {
  const forms = rows.map((row) => ({
    formId: row.filename,
    descriptors: [{
      id: "openVolume",
      absoluteScore: row.absoluteScore,
      components: row.components ?? [],
    }],
  }));
  assignComparativeRanks(forms);
  const selection = selectDescriptorExtremes("openVolume", rows.map((row) => ({
    formId: row.filename,
    slotId: row.filename,
    meshId: row.filename,
    filename: row.filename,
    geometryRevision: row.sha256,
    absoluteScore: row.absoluteScore,
    circulationFeasible: null,
    eligible: Number.isFinite(row.absoluteScore),
  })));
  return {
    least: selection.least?.filename,
    most: selection.most?.filename,
    leastScore: selection.least?.absoluteScore,
    mostScore: selection.most?.absoluteScore,
    ranking: forms.map((form) => ({
      filename: form.formId,
      rank: form.descriptors[0].comparativeRank,
      score: rows.find((row) => row.filename === form.formId).absoluteScore,
    })).sort((left, right) => left.rank - right.rank),
  };
}

const currentRank = rank(current);
const architecturalRank = rank(architectural);
const paired = files.map((filename) => {
  const left = current.find((row) => row.filename === filename);
  const right = architectural.find((row) => row.filename === filename);
  return {
    filename,
    yUpFeet: left.absoluteScore,
    zUpArchitecturalFeet: right.absoluteScore,
    delta: right.absoluteScore - left.absoluteScore,
    yOccupied: left.occupiedCells,
    zOccupied: right.occupiedCells,
    yFree: left.freeCells,
    zFree: right.freeCells,
    yInterstitial: left.interstitialCells,
    zInterstitial: right.interstitialCells,
    yCellFeet: left.cellFeet,
    zCellFeet: right.cellFeet,
    yBounds: left.specBoundsFeet,
    zBounds: right.specBoundsFeet,
  };
});

function sectionSummary(filename, up) {
  const mesh = parseObj(readFileSync(join(sourceDir, filename), "utf8"), filename);
  const before = createHash("sha256").update(readFileSync(join(sourceDir, filename))).digest("hex");
  const triangles = trianglesOf(mesh, up);
  const bounds = meshBounds(triangles);
  const cut = sectionTriangles(triangles, defaultSectionPlane(bounds));
  const after = createHash("sha256").update(readFileSync(join(sourceDir, filename))).digest("hex");
  return {
    filename,
    up,
    hashUnchanged: before === after,
    bounds: bounds.size,
    segments: cut.segments.length,
    pocheReliable: cut.pocheReliable,
    closedLoops: cut.closedLoops.length,
    limitation: cut.limitation,
  };
}

const sectionNames = [...new Set([
  currentRank.least,
  currentRank.most,
  architecturalRank.least,
  architecturalRank.most,
])];
const sections = [];
for (const filename of sectionNames) {
  sections.push(sectionSummary(filename, "y"));
  sections.push(sectionSummary(filename, "z"));
  writeSync(1, `section ${filename}\n`);
}

save("orientation-scale.json", {
  outcome: "complete",
  sourceProvenance,
  interpretation: {
    modeledExtent: "OBJ coordinate spans are about 20 file units on each axis.",
    physicalMillimeters: "Interpreting those numbers as true millimeters gives spans of about 0.066 feet. That is smaller than one 2-foot evaluation cell.",
    architecturalScale: "The stated design convention is 20 mm modeled = 20 feet built. With the millimeter numbers preserved, that convention is 1 file unit = 1 architectural foot.",
    currentEvaluator: "Auto up-axis reads these files as Y-up because the header is only '# Rhino'. The Lattice unit default is feet, scale 1.",
    comparison: "z-up with scale 1 applies Rhino Z-up and the 20 mm = 20 ft convention. It does not change the stored OBJ files or the application defaults.",
  },
  geometry,
  yUpRanking: currentRank,
  zUpRanking: architecturalRank,
  paired,
  sections,
  sourceHashesUnchanged: geometry.every((row, index) => current[index].positionsUnchanged && architectural[index].positionsUnchanged),
});
writeSync(1, `DONE y ${currentRank.least} ${currentRank.leastScore} / ${currentRank.most} ${currentRank.mostScore}\n`);
writeSync(1, `DONE z ${architecturalRank.least} ${architecturalRank.leastScore} / ${architecturalRank.most} ${architecturalRank.mostScore}\n`);
