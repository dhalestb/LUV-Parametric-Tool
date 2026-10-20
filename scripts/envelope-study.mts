import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeMesh } from "../src/components/lattice/analyze.ts";
import { unpackCell } from "../src/components/lattice/types.ts";
import { parseObj } from "../src/components/lattice/parseObj.ts";
import { envelopeStudy, type EnvelopeKind } from "../src/components/evaluations/openVolumeEnvelope.ts";
import { measureOpenVolume, type Voxel } from "../src/components/evaluations/openVolume.ts";

const source = process.argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length)
  ?? "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";

function fill(x0, x1, y0, y1, z0, z1): Voxel[] {
  const cells: Voxel[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) cells.push([x, y, z]);
    }
  }
  return cells;
}

function shell(size: number): Voxel[] {
  const cells: Voxel[] = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let z = 0; z < size; z += 1) {
        const edge = x === 0 || y === 0 || z === 0 || x === size - 1 || y === size - 1 || z === size - 1;
        if (edge) cells.push([x, y, z]);
      }
    }
  }
  return cells;
}

function reportLine(label: string, cells: Voxel[]) {
  const official = measureOpenVolume(cells);
  const variants: Array<[EnvelopeKind, number]> = [["box", 1], ["shrink-wrap", 1], ["shrink-wrap", 2], ["component", 1], ["component", 2], ["proximity", 2], ["proximity", 3]];
  process.stdout.write(`\n${label} occupied ${cells.length} official-open ${official.architecturalOpenSpace}\n`);
  for (const [kind, radius] of variants) {
    const study = envelopeStudy(cells, kind, radius);
    const occupiedKeys = new Set(cells.map((cell) => cell.join(",")));
    const occupiedInside = study.envelopeCells.reduce((sum, cell) => sum + (occupiedKeys.has(cell.join(",")) ? 1 : 0), 0);
    if (occupiedInside !== cells.length) process.stdout.write("  OCCUPIED LOST\n");
    process.stdout.write(`  ${kind} r${study.radius} envelope ${study.envelope} free ${study.candidateFree} exterior ${study.exteriorFree} enclosed ${study.enclosedFree} between ${study.interstitial} regions ${study.regions} largest ${study.largestRegion} ratio ${study.candidateRatio}\n`);
  }
}

const controls: Array<[string, Voxel[]]> = [
  ["solid-cube", fill(0, 7, 0, 7, 0, 7)],
  ["hollow-cube", shell(10)],
  ["open-pavilion", [...fill(0, 7, 0, 7, 6, 6), ...fill(0, 0, 0, 0, 0, 6), ...fill(7, 7, 0, 0, 0, 6), ...fill(0, 0, 7, 7, 0, 6), ...fill(7, 7, 7, 7, 0, 6)]],
  ["atrium", shell(10).filter(([x, y, z]) => !(z === 9 && x > 2 && x < 7 && y > 2 && y < 7))],
  ["continuous-hall", [...fill(0, 0, 0, 12, 0, 4), ...fill(4, 4, 0, 12, 0, 4)]],
  ["disconnected-masses", [...fill(0, 3, 0, 3, 0, 3), ...fill(16, 19, 0, 3, 0, 3)]],
  ["close-surfaces", [...fill(0, 8, 0, 0, 0, 4), ...fill(0, 8, 2, 2, 0, 4)]],
  ["wide-surfaces", [...fill(0, 8, 0, 0, 0, 4), ...fill(0, 8, 12, 12, 0, 4)]],
];

for (const [label, cells] of controls) reportLine(label, cells);

const files = readdirSync(source).filter((name) => name.endsWith(".obj")).sort();
for (const filename of files) {
  const bytes = readFileSync(join(source, filename));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const mesh = parseObj(bytes.toString("utf8"), filename);
  const before = mesh.positions.length;
  const model = analyzeMesh(mesh, null, 1, "y");
  const occupied = (model.variants[0]?.occupied ?? []).map((packed) => unpackCell(packed));
  if (mesh.positions.length !== before) process.stdout.write(`${filename} GEOMETRY CHANGED\n`);
  reportLine(`${filename} ${hash}`, occupied);
}
