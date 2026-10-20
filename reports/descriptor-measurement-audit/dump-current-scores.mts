/**
 * Read-only dump of the current evaluator. Does not change scores, formulas, or geometry.
 * Run: npx --yes tsx reports/descriptor-measurement-audit/dump-current-scores.mts
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeMesh } from "../../src/components/lattice/analyze";
import { parseObj } from "../../src/components/lattice/parseObj";
import { DESCRIPTOR_ALGORITHM_VERSION, measureSpatialDescriptors } from "../../src/components/evaluations/descriptorV2";
import { evaluateTileModel } from "../../src/components/evaluations/objDescriptorAnalysis";

const source = process.argv[2] ?? "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";
const outDir = join(process.cwd(), "reports", "descriptor-measurement-audit");
await mkdir(outDir, { recursive: true });

const names = (await readdir(source)).filter((name) => name.toLowerCase().endsWith(".obj")).sort((a, b) => a.localeCompare(b));
const forms = [];
for (const filename of names) {
  const text = await readFile(join(source, filename), "utf8");
  const mesh = parseObj(text, filename);
  const model = analyzeMesh(mesh, null, 1, "y");
  const evaluated = evaluateTileModel(model, {
    positions: mesh.positions,
    faces: mesh.faces,
    up: "y",
    unitScale: 1,
  });
  forms.push({
    filename,
    vertices: mesh.positions.length / 3,
    faces: mesh.faces.length,
    cellFeet: model.cellFeet,
    occupiedCells: evaluated.raw?.occupiedCells ?? null,
    occupiedVolume: evaluated.raw?.occupiedVolume ?? null,
    bboxFeet: evaluated.raw ? [evaluated.raw.bboxX, evaluated.raw.bboxY, evaluated.raw.bboxZ] : null,
    descriptors: evaluated.descriptors.map((descriptor) => {
      const reconstructed = descriptor.components.reduce((sum, component) => sum + (component.precise ?? component.value) * component.weight, 0)
        / (descriptor.components.reduce((sum, component) => sum + component.weight, 0) || 1);
      return {
        id: descriptor.id,
        name: descriptor.name,
        absoluteScore: descriptor.absoluteScore,
        roundedScore: descriptor.score,
        reconstructedFromPrecise: reconstructed,
        components: descriptor.components.map((component) => ({
          name: component.name,
          raw: component.raw,
          rawUnit: component.rawUnit,
          value: component.value,
          precise: component.precise,
          weight: component.weight,
          contribution: component.contribution,
        })),
      };
    }),
  });
  console.log(`${filename} cells=${evaluated.raw?.occupiedCells} cellFeet=${model.cellFeet}`);
}

const ranks: Record<string, Array<{ filename: string; absoluteScore: number; rank: number }>> = {};
for (const form of forms) {
  for (const descriptor of form.descriptors) {
    const row = ranks[descriptor.id] ?? [];
    row.push({ filename: form.filename, absoluteScore: descriptor.absoluteScore, rank: 0 });
    ranks[descriptor.id] = row;
  }
}
for (const rows of Object.values(ranks)) {
  rows.sort((left, right) => left.absoluteScore - right.absoluteScore || left.filename.localeCompare(right.filename));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
}

const empty = measureSpatialDescriptors({ cells: [], cellFeet: 2, bboxFeet: [20, 30, 12], occupiedVolumeFeet: 0, triangles: undefined });
const emptyWithBox = {
  centralized: empty.centralized,
  monumental: empty.monumental,
  sculptural: empty.sculptural,
  surreal: empty.surreal,
  luminous: empty.luminous,
  convergent: empty.convergent,
  verticallyIntegrated: empty.verticallyIntegrated,
};

const payload = {
  algorithm: DESCRIPTOR_ALGORITHM_VERSION,
  source,
  formCount: forms.length,
  generatedBy: "current evaluateTileModel, unit scale 1, up axis y. Not an alternate formula.",
  forms,
  ranks,
  emptyOccupiedDiagnostic: emptyWithBox,
};
await writeFile(join(outDir, "current-evaluator-dump.json"), JSON.stringify(payload, null, 2));
console.log(`wrote ${forms.length} forms`);
