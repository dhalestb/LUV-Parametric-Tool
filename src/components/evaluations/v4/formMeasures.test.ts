import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { triangleArray, triangleArrayBoundary, trianglePatchBoundary } from "./formMeasures.ts";
import type { AnalysisTriangle, Vec3 } from "./geometry.ts";

function triangle(id: number, a: Vec3, b: Vec3, c: Vec3): AnalysisTriangle {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  return { id, a, b, c, normal, centroid, area: 2 };
}

describe("trianglePatchBoundary", () => {
  it("drops the shared edge of a two-triangle cluster", () => {
    const first = triangle(1, [0, 0, 0], [2, 0, 0], [2, 2, 0]);
    const second = triangle(2, [0, 0, 0], [2, 2, 0], [0, 2, 0]);
    const outline = trianglePatchBoundary([first, second]);
    assert.equal(outline.length, 4);
    const fromArray = triangleArrayBoundary(triangleArray([first, second]));
    assert.equal(fromArray.length, 4);
  });

  it("keeps a gap between separate clusters", () => {
    const first = triangle(1, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const second = triangle(2, [4, 0, 0], [5, 0, 0], [4, 1, 0]);
    assert.equal(trianglePatchBoundary([first, second]).length, 6);
  });
});
