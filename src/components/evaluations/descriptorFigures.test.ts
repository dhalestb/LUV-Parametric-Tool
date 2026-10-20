import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descriptorFigures } from "./descriptorV2";

const cells: Array<[number, number, number]> = [];
for (let x = 0; x < 6; x += 1) {
  for (let y = 0; y < 8; y += 1) cells.push([x, y, 0]);
}
for (let y = 0; y < 8; y += 1) cells.push([2, y, 1]);
cells.push([2, 7, 2], [2, 7, 3]);

describe("descriptor figures", () => {
  const ids = [
    "convergent",
    "centralized",
    "verticallyIntegrated",
    "sculptural",
    "visuallyConnected",
    "surreal",
    "hierarchical",
    "sequential",
    "circulationActivated",
    "monumental",
    "luminous",
  ];
  for (const id of ids) {
    it(`draws ${id} from the measured cells`, () => {
      const figure = descriptorFigures(id, { cells, cellFeet: 2, bboxFeet: [12, 16, 8], occupiedVolumeFeet: cells.length * 8 });
      assert.ok(figure.legend.length > 20);
      assert.ok(figure.swatches.length + figure.rays.length > 0, `${id} drew nothing`);
    });
  }
});
