import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createArchitecturalGrid,
  EXAMPLE_OVERALL_FEET,
  gridAccommodatesSelection,
  overallFromGrid,
  setGridCellCount,
  setGridCellPitch,
  setGridOverall,
  validateArchitecturalGrid,
} from "./architecturalGrid.ts";
import { selectionFieldDimensions } from "./selectionHeightRouting.ts";
import {
  applyLetterSizeControlsToRules,
  controlsFromPreset,
  letterFootprintFeet,
  letterSpansMultipleCells,
  sampleLetterScale,
  scaleFromFootprintFeet,
  validateLetterSizeControls,
} from "./architecturalLetterSizing.ts";
import { DEFAULT_RULES } from "./optimizerTypes.ts";
import { evaluateLetterLegibility } from "./letterLegibility.ts";
import type { CompositionPlacement } from "./compositionEngine.ts";

describe("architecturalGrid", () => {
  it("defaults to an example field that hosts all three selection heights", () => {
    const grid = createArchitecturalGrid();
    const overall = overallFromGrid(grid);
    assert.equal(overall.width, EXAMPLE_OVERALL_FEET.width);
    assert.equal(overall.height, EXAMPLE_OVERALL_FEET.height);
    assert.equal(overall.depth, EXAMPLE_OVERALL_FEET.depth);
    for (const height of [20, 40, 60] as const) {
      assert.equal(gridAccommodatesSelection(grid, selectionFieldDimensions(height)).ok, true);
    }
  });

  it("adjusts cell counts independently without changing unrelated pitches", () => {
    const base = createArchitecturalGrid();
    const next = setGridCellCount(base, "z", 8);
    assert.equal(next.zCells, 8);
    assert.equal(next.xCells, base.xCells);
    assert.equal(next.cellX, base.cellX);
    assert.equal(next.cellY, base.cellY);
    assert.equal(next.cellZ, base.cellZ);
  });

  it("adjusts cell pitches independently and recalculates overall", () => {
    const base = createArchitecturalGrid();
    const next = setGridCellPitch(base, "x", 12);
    assert.equal(next.cellX, 12);
    assert.equal(next.cellY, base.cellY);
    assert.equal(next.xCells, base.xCells);
    assert.equal(overallFromGrid(next).width, 12 * base.xCells);
  });

  it("updates pitch from overall while preserving cell count", () => {
    const base = createArchitecturalGrid({ xCells: 5, cellX: 10 });
    const next = setGridOverall(base, "x", 100);
    assert.equal(next.xCells, 5);
    assert.equal(next.cellX, 20);
    assert.equal(overallFromGrid(next).width, 100);
  });

  it("reports invalid configurations instead of silently clamping", () => {
    const invalid = createArchitecturalGrid({ xCells: 99, cellX: 0.01 });
    const result = validateArchitecturalGrid(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
  });
});

describe("architecturalLetterSizing", () => {
  it("converts footprint feet and scale using UNIT_LETTER_SPAN", () => {
    assert.ok(Math.abs(letterFootprintFeet(scaleFromFootprintFeet(9)) - 9) < 1e-9);
  });

  it("applies height-specific presets without forcing proportional stretch", () => {
    const p20 = controlsFromPreset(20);
    const p60 = controlsFromPreset(60);
    assert.equal(p20.minimumFeet, 6);
    assert.equal(p20.maximumFeet, 12);
    assert.equal(p60.minimumFeet, 10);
    assert.equal(p60.maximumFeet, 16);
    assert.ok(p60.preferredFeet < 60, "60 ft selection must not require a 60 ft letter");
    const kept = controlsFromPreset(20, { variationPercent: 10, preserveProportions: false });
    assert.equal(kept.minimumFeet, 6);
    assert.equal(kept.maximumFeet, 12);
    assert.equal(kept.variationPercent, 10);
    assert.equal(kept.preserveProportions, false);
  });

  it("keeps cell pitch independent from letter size helpers", () => {
    assert.equal(letterSpansMultipleCells(12, 10), true);
    assert.equal(letterSpansMultipleCells(8, 10), false);
  });

  it("samples varied letter scales within min/max", () => {
    const rules = applyLetterSizeControlsToRules(DEFAULT_RULES, {
      minimumFeet: 8,
      preferredFeet: 11,
      maximumFeet: 14,
      variationPercent: 100,
      preserveProportions: true,
    });
    const values = Array.from({ length: 40 }, (_, i) => sampleLetterScale(rules, () => (i % 10) / 10));
    assert.ok(values.every((value) => value >= rules.minimumLetterSize - 1e-9 && value <= rules.maximumLetterSize + 1e-9));
    assert.ok(new Set(values.map((value) => value.toFixed(4))).size > 1);
  });

  it("validates letter-size control conflicts", () => {
    const bad = validateLetterSizeControls({
      minimumFeet: 14,
      preferredFeet: 10,
      maximumFeet: 12,
      variationPercent: 20,
      preserveProportions: true,
    });
    assert.equal(bad.valid, false);
  });
});

describe("selection compatibility with expanded grids", () => {
  it("keeps fixed 20×20×H selection sizes while overall grows", () => {
    const small = createArchitecturalGrid({ xCells: 4, yCells: 4, zCells: 4, cellX: 5, cellY: 5, cellZ: 5 });
    const large = setGridOverall(setGridOverall(setGridOverall(small, "x", 80), "y", 80), "z", 100);
    const selection = selectionFieldDimensions(40);
    assert.deepEqual(selection, { width: 20, height: 20, depth: 40 });
    assert.equal(gridAccommodatesSelection(small, selection).ok, false);
    assert.equal(gridAccommodatesSelection(large, selection).ok, true);
    assert.equal(selection.depth, 40);
  });
});

describe("letterLegibility", () => {
  it("flags near-total engulfment while allowing modest productive overlaps", () => {
    const make = (id: number, scale: number, x: number): CompositionPlacement => ({
      cell: { id: `c${id}`, letter: id % 2 ? "L" : "U", rotation: 0 },
      sourceIndex: id,
      layerIndex: 0,
      x,
      y: 0,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      scale,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
    const modest = evaluateLetterLegibility({
      placements: [make(0, 8, 0), make(1, 8, 6)],
      thicknessPercent: 12,
      preserveProportions: true,
    });
    assert.ok(modest.compromisedCount === 0);
    const engulfed = evaluateLetterLegibility({
      placements: [make(0, 10, 0), make(1, 10, 0.1)],
      thicknessPercent: 12,
      preserveProportions: true,
    });
    assert.ok(engulfed.compromisedCount >= 1);
  });
});
