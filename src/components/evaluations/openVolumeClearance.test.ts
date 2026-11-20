import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImportedObj, Vec3 } from "../lattice/types";
import { CLEARANCE_MIN_FEET, CLEARANCE_REFERENCE_FEET, clearanceAccessCredit, measureSurfaceClearance, rateSurfaceClearance, type AnchoredSurface, type SurfaceClearance } from "./openVolumeClearance";

function specToFile(point: Vec3): [number, number, number] {
  return [point[0], point[2], -point[1]];
}

function plate(z: number, x0: number, x1: number, y0: number, y1: number) {
  const a: Vec3 = [x0, y0, z];
  const b: Vec3 = [x1, y0, z];
  const c: Vec3 = [x1, y1, z];
  const d: Vec3 = [x0, y1, z];
  return [a, b, c, a, c, d];
}

function meshFrom(specPoints: Vec3[]): ImportedObj {
  const positions: number[] = [];
  const faces = [];
  for (let index = 0; index < specPoints.length; index += 3) {
    const base = positions.length / 3;
    for (const point of specPoints.slice(index, index + 3)) positions.push(...specToFile(point));
    faces.push({ vertices: [base, base + 1, base + 2], normals: null });
  }
  return {
    id: "clearance-test",
    filename: "clearance-test.obj",
    positions: Float32Array.from(positions),
    normals: new Float32Array(positions.length),
    faces,
    groups: [],
    suggestedSlotId: null,
    upAxis: "y",
  };
}

describe("surface-anchored clearance", () => {
  it("starts on the upper face and stops at the next surface", () => {
    const mesh = meshFrom([
      ...plate(2, 0, 6, 0, 6),
      ...plate(2.4, 0, 6, 0, 6),
      ...plate(10, 0, 6, 0, 6),
      ...plate(4, 20, 24, 0, 4),
    ]);
    const result = measureSurfaceClearance({ mesh, unitScale: 1, up: "y" });
    const lower = result.surfaces.find((surface) => surface.sourceTop < 3 && surface.area > 30);
    const ceiling = result.surfaces.find((surface) => surface.sourceTop > 9);
    const open = result.surfaces.find((surface) => surface.sourceLow > 3 && surface.sourceTop < 5);
    assert.ok(lower);
    assert.ok(ceiling);
    assert.ok(open);
    assert.ok(Math.abs(lower.startHigh - 2.4) < 0.05, `upper skin ${lower.startHigh}`);
    assert.ok(lower.medianClear !== null && Math.abs(lower.medianClear - 7.6) < 0.08, `clear ${lower.medianClear}`);
    assert.equal(lower.horizontalFeet, 0);
    assert.equal(lower.verticalStartFeet, 0.05);
    assert.equal(lower.field, "bounded");
    assert.equal(open.field, "exterior-open");
    assert.equal(open.probe.hitZ, null);
    let minZ = Infinity;
    let sawSpan = false;
    for (let index = 2; index < result.prisms.length; index += 3) {
      const z = result.prisms[index];
      minZ = Math.min(minZ, z);
      if (z > 2.45 && z < 9.9) sawSpan = true;
    }
    assert.ok(minZ > 2, `prism dipped to ${minZ}`);
    assert.ok(sawSpan, "no gold was drawn in the open span above the lower plate");
  });

  it("keeps a column when the shrink-wrap does not contain it", () => {
    const mesh = meshFrom([...plate(5, 0, 8, 0, 8)]);
    const occupied: Array<[number, number, number]> = [];
    for (let x = 0; x <= 4; x += 1) {
      for (let y = 0; y <= 4; y += 1) occupied.push([x, y, 2]);
    }
    const result = measureSurfaceClearance({
      mesh,
      unitScale: 1,
      up: "y",
      anchor: [0, 0, 0],
      cellFeet: 2,
      occupied,
      shrinkFree: [],
    });
    assert.equal(result.surfaces.length, 1);
    assert.equal(result.surfaces[0].field, "exterior-open");
    assert.ok(result.outsideShrink > 0);
    assert.equal(result.insideShrink, 0);
    let maxZ = -Infinity;
    for (let index = 2; index < result.prisms.length; index += 3) maxZ = Math.max(maxZ, result.prisms[index]);
    assert.ok(result.prisms.length === 0 || maxZ <= 5.05, `gold rose to ${maxZ}`);
    assert.ok((result.surfaces[0].rasterGapFeet ?? 0) > 0);
  });

  it("gives no credit and no gold when the gap is 5 ft or less", () => {
    const mesh = meshFrom([
      ...plate(0, 0, 6, 0, 6),
      ...plate(4, 0, 6, 0, 6),
      ...plate(0, 10, 16, 0, 6),
      ...plate(7.5, 10, 16, 0, 6),
    ]);
    const result = measureSurfaceClearance({ mesh, unitScale: 1, up: "y" });
    const low = result.surfaces.find((surface) => surface.sourceTop < 1 && surface.probe.x < 8);
    const standing = result.surfaces.find((surface) => surface.sourceTop < 1 && surface.probe.x > 8);
    assert.ok(low);
    assert.ok(standing);
    assert.ok(low.medianClear !== null && low.medianClear <= CLEARANCE_MIN_FEET, `low clear ${low.medianClear}`);
    assert.equal(low.meanCredit, 0);
    assert.ok(standing.medianClear !== null && Math.abs(standing.medianClear - 7.5) < 0.08, `standing clear ${standing.medianClear}`);
    assert.ok(Math.abs(standing.meanCredit - clearanceAccessCredit(7.5)) < 1e-9);
    let lowGold = false;
    let standingGold = false;
    for (let index = 0; index < result.prisms.length; index += 3) {
      const x = result.prisms[index];
      const z = result.prisms[index + 2];
      if (x < 8 && z > 0.2 && z < 3.8) lowGold = true;
      if (x > 8 && z > 5 && z < 7.6) standingGold = true;
    }
    assert.equal(lowGold, false);
    assert.equal(standingGold, true);
  });

  it("counts exterior-open as fully open and scales bounded clearance from 5 ft to 10 ft", () => {
    const surface = (patch: Partial<AnchoredSurface>): AnchoredSurface => ({
      area: 10,
      sourceLow: 0,
      sourceTop: 1,
      startLow: 1,
      startHigh: 1,
      triangleCount: 2,
      samples: 4,
      boundedSamples: 4,
      openSamples: 0,
      minClear: 5,
      medianClear: 5,
      maxClear: 5,
      meanCredit: 0,
      field: "bounded",
      verticalStartFeet: 0.05,
      horizontalFeet: 0,
      rasterGapFeet: null,
      insideShrink: 0,
      outsideShrink: 0,
      noFreeVoxel: 0,
      reason: "",
      probe: { x: 0, y: 0, z: 1, hitZ: 6 },
      ...patch,
    });
    const empty: SurfaceClearance = {
      surfaces: [],
      prisms: new Float32Array(),
      outlines: [],
      dimensions: [],
      representatives: [],
      elapsedMs: 0,
      sampleCount: 0,
      insideShrink: 0,
      outsideShrink: 0,
    };
    const atLimit = rateSurfaceClearance({ ...empty, surfaces: [surface({ meanCredit: clearanceAccessCredit(5) })], sampleCount: 4 });
    assert.equal(atLimit.value, 0);
    const below = rateSurfaceClearance({ ...empty, surfaces: [surface({ medianClear: 4, meanCredit: clearanceAccessCredit(4) })], sampleCount: 4 });
    assert.equal(below.value, 0);
    const mid = rateSurfaceClearance({ ...empty, surfaces: [surface({ medianClear: 7.5, meanCredit: clearanceAccessCredit(7.5) })], sampleCount: 4 });
    assert.ok(Math.abs(mid.value - 50) < 1e-9);
    const full = rateSurfaceClearance({ ...empty, surfaces: [surface({ medianClear: CLEARANCE_REFERENCE_FEET, meanCredit: clearanceAccessCredit(CLEARANCE_REFERENCE_FEET) })], sampleCount: 4 });
    assert.ok(Math.abs(full.value - 100) < 1e-9);
    const open = rateSurfaceClearance({
      ...empty,
      surfaces: [surface({ boundedSamples: 0, openSamples: 4, medianClear: null, minClear: null, maxClear: null, meanCredit: clearanceAccessCredit(null), field: "exterior-open" })],
      sampleCount: 4,
    });
    assert.ok(Math.abs(open.value - 100) < 1e-9);
  });
});
