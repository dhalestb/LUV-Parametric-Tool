import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMesh } from "../src/components/lattice/analyze.ts";
import { unpackCell } from "../src/components/lattice/types.ts";
import { parseObj } from "../src/components/lattice/parseObj.ts";
import { envelopeStudy } from "../src/components/evaluations/openVolumeEnvelope.ts";
import { landingReport } from "../src/components/evaluations/openVolumeLandings.ts";
import { measureSurfaceClearance, rasterGapAt } from "../src/components/evaluations/openVolumeClearance.ts";
import type { Voxel } from "../src/components/evaluations/openVolume.ts";

const source = "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";
const files = ["Gathering Linear.obj", "Lobby Continuous Hall.obj"];

function line(surface: { startHigh: number; startLow: number; area: number; field: string; medianClear: number | null; horizontalFeet: number; verticalStartFeet: number; rasterGapFeet: number | null; insideShrink: number; outsideShrink: number; reason: string }, role: string) {
  const clear = surface.medianClear === null ? "open" : surface.medianClear.toFixed(2);
  return `  ${role}: top ${surface.startHigh.toFixed(3)} low ${surface.startLow.toFixed(3)} area ${surface.area.toFixed(1)} ${surface.field} clear ${clear} horizontal ${surface.horizontalFeet.toFixed(2)} gold-start ${surface.verticalStartFeet.toFixed(2)} raster-gap ${surface.rasterGapFeet === null ? "n/a" : surface.rasterGapFeet.toFixed(3)} shrink-in ${surface.insideShrink} shrink-out ${surface.outsideShrink}${surface.reason ? ` | ${surface.reason}` : ""}`;
}

for (const filename of files) {
  const bytes = readFileSync(join(source, filename));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const mesh = parseObj(bytes.toString("utf8"), filename);
  process.stdout.write(`\n${filename} ${hash}\n`);
  const rasters = new Map<number, { anchor: [number, number, number]; occupied: Voxel[]; elapsed: number }>();
  for (const cellFeet of [2, 1, 0.5]) {
    const started = performance.now();
    const model = analyzeMesh(mesh, null, 1, "y", cellFeet);
    const occupied = (model.variants[0]?.occupied ?? []).map((packed) => unpackCell(packed));
    rasters.set(cellFeet, { anchor: model.anchor, occupied, elapsed: performance.now() - started });
    process.stdout.write(`  raster ${cellFeet} ft occupied ${occupied.length} ${(performance.now() - started).toFixed(0)} ms\n`);
  }
  const coarse = rasters.get(2)!;
  const shrinkStarted = performance.now();
  const shrink = envelopeStudy(coarse.occupied, "shrink-wrap", 2, 16);
  const floor = (analyzeMesh(mesh, null, 1, "y", 2).variants[0]?.floor ?? []).map((packed) => unpackCell(packed));
  const landing = landingReport({
    mesh,
    unitScale: 1,
    up: "y",
    anchor: coarse.anchor,
    cellFeet: 2,
    occupied: coarse.occupied,
    floor,
    shrinkFree: shrink.freeCells,
  });
  process.stdout.write(`  shrink-wrap 4 ft free ${shrink.candidateFree} ratio ${shrink.candidateRatio} ${(performance.now() - shrinkStarted).toFixed(0)} ms\n`);
  if (landing.nearest) {
    const item = landing.nearest;
    process.stdout.write(`  nearest shrink gold top ${item.patchTop.toFixed(3)} gold ${item.goldBottom.toFixed(3)}..${item.goldTop.toFixed(3)} vertical ${item.verticalFeet.toFixed(3)} horizontal ${item.horizontalFeet.toFixed(3)} ${item.relation}\n`);
  }
  const clearance = measureSurfaceClearance({
    mesh,
    unitScale: 1,
    up: "y",
    anchor: coarse.anchor,
    cellFeet: 2,
    occupied: coarse.occupied,
    shrinkFree: shrink.freeCells,
    minArea: 8,
  });
  process.stdout.write(`  mesh clearance surfaces ${clearance.surfaces.length} samples ${clearance.sampleCount} outside-shrink ${clearance.outsideShrink} inside-shrink ${clearance.insideShrink} ${clearance.elapsedMs.toFixed(0)} ms\n`);
  for (const item of clearance.representatives) process.stdout.write(`${line(item.surface, item.role)}\n`);
  const byHeight = [...clearance.surfaces].sort((left, right) => right.startHigh - left.startHigh);
  for (const surface of byHeight.slice(0, 8)) process.stdout.write(`${line(surface, "surface")}\n`);
  const lobbyTop = clearance.surfaces.find((surface) => Math.abs(surface.startHigh - 19.49) < 0.4) ?? clearance.surfaces[0];
  if (lobbyTop) {
    process.stdout.write(`  focus top ${lobbyTop.startHigh.toFixed(3)} source ${lobbyTop.sourceLow.toFixed(3)}..${lobbyTop.sourceTop.toFixed(3)} probe ${lobbyTop.probe.z.toFixed(3)} hit ${lobbyTop.probe.hitZ === null ? "none" : lobbyTop.probe.hitZ.toFixed(3)}\n`);
    for (const cellFeet of [2, 1, 0.5]) {
      const raster = rasters.get(cellFeet)!;
      const gap = rasterGapAt(raster.anchor, cellFeet, raster.occupied, lobbyTop.probe.x, lobbyTop.probe.y, lobbyTop.probe.z);
      process.stdout.write(`  resolution ${cellFeet} ft raster-gap ${gap === null ? "none" : gap.toFixed(3)} ft raster-time ${raster.elapsed.toFixed(0)} ms\n`);
    }
  }
}
