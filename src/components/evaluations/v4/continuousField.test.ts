import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { largestContinuousField } from "./continuousField.ts";
import type { FloorSample } from "./surfaces.ts";

function sample(id: number, ix: number, iy: number, z = 0, area = 1): FloorSample {
  return {
    id,
    ix,
    iy,
    position: [ix + 0.5, iy + 0.5, z],
    triangleId: id,
    clearance: 12,
    overheadTriangleId: null,
    enclosure: 1,
    floorClass: "sheltered",
    levelId: 0,
    supported: true,
    roofLid: false,
    area,
  };
}

describe("continuous field", () => {
  it("keeps one run of edge-adjacent qualifying floor", () => {
    const samples = [sample(0, 0, 0), sample(1, 1, 0), sample(2, 2, 0)];
    const result = largestContinuousField(samples);
    assert.equal(result.pockets.length, 1);
    assert.equal(result.field?.floorAreaFt2, 3);
    assert.equal(result.fieldShare, 1);
  });

  it("does not join pockets that only share an elevation", () => {
    const samples = [sample(0, 0, 0), sample(1, 1, 0), sample(2, 8, 0), sample(3, 9, 0)];
    const result = largestContinuousField(samples);
    assert.equal(result.pockets.length, 2);
    assert.equal(result.field?.floorAreaFt2, 2);
    assert.equal(result.fieldShare, 0.5);
  });

  it("does not stack nearby levels into one field", () => {
    const samples = [sample(0, 0, 0, 0), sample(1, 0, 0, 12), sample(2, 1, 0, 0)];
    const result = largestContinuousField(samples);
    assert.ok((result.pockets.length ?? 0) >= 2);
    assert.ok((result.field?.samples.every((item) => item.position[2] === result.field?.samples[0].position[2])) ?? false);
  });
});
