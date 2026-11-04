import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMesh } from "../src/components/lattice/analyze.ts";
import { unpackCell } from "../src/components/lattice/types.ts";
import { parseObj } from "../src/components/lattice/parseObj.ts";
import { envelopeStudy } from "../src/components/evaluations/openVolumeEnvelope.ts";
import { landingReport } from "../src/components/evaluations/openVolumeLandings.ts";
import { measureOpenVolume, type Voxel } from "../src/components/evaluations/openVolume.ts";

const source = "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";
const files = ["Gathering Linear.obj", "Lobby Continuous Hall.obj"];

function layerGaps(occupied: Voxel[]) {
  const byXY = new Map<string, number[]>();
  for (const [x, y, z] of occupied) {
    const key = `${x},${y}`;
    const list = byXY.get(key) ?? [];
    list.push(z);
    byXY.set(key, list);
  }
  const gaps = new Map<number, number>();
  for (const levels of byXY.values()) {
    const sorted = [...new Set(levels)].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = sorted[index] - sorted[index - 1] - 1;
      if (gap <= 0) continue;
      gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
    }
  }
  return [...gaps.entries()].sort((a, b) => a[0] - b[0]);
}

for (const filename of files) {
  const bytes = readFileSync(join(source, filename));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const mesh = parseObj(bytes.toString("utf8"), filename);
  process.stdout.write(`\n${filename} ${hash}\n`);
  for (const cellFeet of [2, 1, 0.5]) {
    const started = performance.now();
    const model = analyzeMesh(mesh, null, 1, "y", cellFeet);
    const occupied = (model.variants[0]?.occupied ?? []).map((packed) => unpackCell(packed));
    const floor = (model.variants[0]?.floor ?? []).map((packed) => unpackCell(packed));
    const radius = Math.max(1, Math.round(4 / cellFeet));
    const box = envelopeStudy(occupied, "box", 1);
    const shrink = envelopeStudy(occupied, "shrink-wrap", radius, 16);
    const report = landingReport({
      mesh,
      unitScale: 1,
      up: "y",
      anchor: model.anchor,
      cellFeet,
      occupied,
      floor,
      shrinkFree: shrink.freeCells,
    });
    const elapsed = performance.now() - started;
    const official = cellFeet === 2 ? measureOpenVolume(occupied).architecturalOpenSpace : "not scored";
    process.stdout.write(`cell ${cellFeet} ft  occupied ${occupied.length} floor ${floor.length} official ${official}  ${elapsed.toFixed(0)} ms\n`);
    process.stdout.write(`  box envelope ${box.envelope} free ${box.candidateFree} ratio ${box.candidateRatio}\n`);
    process.stdout.write(`  shrink physical-4ft radius-cells ${shrink.radius} envelope ${shrink.envelope} free ${shrink.candidateFree} regions ${shrink.regions} largest ${shrink.largestRegion} ratio ${shrink.candidateRatio}\n`);
    process.stdout.write(`  upward patches ${report.patches.length} capped-cells ${report.cappedCells.length} open-cells ${report.openCells.length} capped-columns ${report.cappedColumns} open-columns ${report.openColumns}\n`);
    process.stdout.write(`  shrink vs patches above ${report.aboveShrink} beside ${report.besideShrink} below ${report.belowShrink} other ${report.otherShrink}\n`);
    if (report.nearest) {
      const item = report.nearest;
      process.stdout.write(`  largest-patch top ${item.patchTop.toFixed(3)} gold ${item.goldBottom.toFixed(3)}..${item.goldTop.toFixed(3)} vertical ${item.verticalFeet.toFixed(3)} horizontal ${item.horizontalFeet.toFixed(3)} ${item.relation}\n`);
    }
    for (const patch of cellFeet === 2 ? report.patches : report.patches.slice(0, 4)) {
      process.stdout.write(`  patch layer ${patch.layer} area ${patch.area.toFixed(1)} cells ${patch.cells.length} surface ${patch.surfaceLow.toFixed(3)}..${patch.surfaceTop.toFixed(3)} voxel ${patch.cellBottom.toFixed(3)}..${patch.cellTop.toFixed(3)} rise-to-next ${patch.riseToNextLayer.toFixed(3)}\n`);
    }
    process.stdout.write(`  vertical gaps cells: ${layerGaps(occupied).map(([gap, count]) => `${gap}(${count})`).join(" ")}\n`);
  }
}
