import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompositionPlacement } from "./compositionEngine.ts";
import {
  classifyBoundsAgainstField,
  classifyPlacementsAgainstSelection,
  intersectingSelectionPlacements,
  letterWorldBounds,
  localizeIntersectingPlacements,
  selectionFieldBounds,
} from "./selectionFieldGeometry.ts";
import {
  extractSelectionFieldGeometry,
  trimLetterToSelectionField,
} from "./selectionFieldTrim.ts";
import { heightRoutedSelectionVolume } from "./selectionHeightRouting.ts";
import { DEFAULT_DESCRIPTORS } from "./compositionEngine.ts";
import { DEFAULT_GRID, DEFAULT_OPTIMIZER_CONTROLS, DEFAULT_RULES, DEFAULT_SELECTION } from "./optimizerTypes.ts";
import { selectBestSubvolume } from "./selectionSearch.ts";

function placement(partial: Partial<CompositionPlacement> & { letter?: "L" | "U" | "V" } = {}): CompositionPlacement {
  const letter = partial.letter ?? "L";
  return {
    cell: { id: partial.cell?.id ?? `cell-${letter}`, letter, rotation: 0 },
    sourceIndex: partial.sourceIndex ?? 0,
    layerIndex: partial.layerIndex ?? 0,
    col: partial.col ?? 0,
    row: partial.row ?? 0,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    z: partial.z ?? 0,
    rx: partial.rx ?? 0,
    ry: partial.ry ?? 0,
    rz: partial.rz ?? 0,
    scale: partial.scale ?? 4,
    scaleX: partial.scaleX ?? 1,
    scaleY: partial.scaleY ?? 1,
    scaleZ: partial.scaleZ ?? 1,
  };
}

describe("selectionFieldGeometry", () => {
  it("classifies letter solids by AABB intersection, not centers alone", () => {
    const field = selectionFieldBounds({
      centerX: 0,
      centerY: 0,
      centerZ: 0,
      width: 20,
      height: 20,
      depth: 20,
    });
    const inside = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
    const crossing = { minX: 8, maxX: 12, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
    const outside = { minX: 12, maxX: 14, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
    assert.equal(classifyBoundsAgainstField(inside, field), "inside");
    assert.equal(classifyBoundsAgainstField(crossing, field), "intersecting");
    assert.equal(classifyBoundsAgainstField(outside, field), "outside");
  });

  it("preserves original TRS for intersecting letters in all three heights", async () => {
    const letters = [
      placement({ letter: "L", x: 0, y: 0, z: 0, scale: 5, sourceIndex: 0 }),
      placement({ letter: "U", x: 0, y: 0, z: 25, scale: 5, sourceIndex: 1, rx: 15 }),
      placement({ letter: "V", x: 30, y: 0, z: 0, scale: 5, sourceIndex: 2 }),
    ];
    for (const height of [20, 40, 60] as const) {
      const volume = {
        ...heightRoutedSelectionVolume(height),
        centerX: 0,
        centerY: 0,
        centerZ: height === 20 ? 0 : 10,
        width: 20,
        height: 20,
        depth: height,
      };
      const extracted = intersectingSelectionPlacements(letters, volume, 12);
      assert.ok(extracted.some((item) => item.cell.letter === "L"));
      assert.ok(!extracted.some((item) => item.cell.letter === "V"), `height ${height} should exclude far letter`);
      const original = letters.find((item) => item.cell.letter === "L")!;
      const kept = extracted.find((item) => item.cell.letter === "L")!;
      assert.equal(kept.rx, original.rx);
      assert.equal(kept.ry, original.ry);
      assert.equal(kept.rz, original.rz);
      assert.equal(kept.scale, original.scale);
      assert.equal(kept.x, original.x);
      assert.equal(kept.y, original.y);
      assert.equal(kept.z, original.z);

      const localized = localizeIntersectingPlacements(letters, volume, 12);
      const localL = localized.find((item) => item.cell.letter === "L")!;
      assert.equal(localL.scale, original.scale);
      assert.equal(localL.x, original.x - volume.centerX);
      assert.equal(localL.z, original.z - volume.centerZ);
    }
  });

  it("physically trims a boundary-crossing letter with Manifold and keeps fully inside letters intact", async () => {
    const inside = placement({ letter: "L", x: 0, y: 0, z: 0, scale: 3 });
    const crossing = placement({ letter: "U", x: 10, y: 0, z: 0, scale: 6 });
    const volume = { centerX: 0, centerY: 0, centerZ: 0, width: 20, height: 20, depth: 20 };
    const insideTrim = await trimLetterToSelectionField(inside, volume, 12);
    const crossingTrim = await trimLetterToSelectionField(crossing, volume, 12);
    assert.equal(insideTrim.empty, false);
    assert.equal(insideTrim.clipped, false);
    assert.ok(insideTrim.positions.length > 0);
    assert.equal(crossingTrim.empty, false);
    assert.equal(crossingTrim.clipped, true);
    assert.ok(crossingTrim.positions.length > 0);
    const zs = crossingTrim.positions.filter((_, index) => index % 3 === 0);
    assert.ok(Math.max(...zs) <= 10 + 1e-3);
  });

  it("extracts a height field with compatibility metadata", async () => {
    const letters = [
      placement({ letter: "L", x: 0, y: 0, z: -5, scale: 4 }),
      placement({ letter: "V", x: 2, y: -1, z: 5, scale: 4, ry: 30 }),
    ];
    const result = await extractSelectionFieldGeometry({
      placements: letters,
      height: 40,
      centerX: 0,
      centerY: 0,
      centerZ: 0,
      thicknessPercent: 12,
    });
    assert.equal(result.height, 40);
    assert.equal(result.selection.depth, 40);
    assert.equal(result.intersectingPlacements.length, 2);
    assert.equal(result.trimmedLetters.length, 2);
    assert.equal(result.heightCompatibility.compatible, true);
    assert.ok(result.geometryDepthSpan > 0);
    assert.ok(result.classified.every((item) => item.relation !== "outside"));
  });

  it("keeps legacy center-based optimizer selection when height routing is off", () => {
    const fullPlacements = [
      placement({ letter: "L", x: 0, y: 0, z: 0, scale: 1, sourceIndex: 0 }),
      placement({ letter: "U", x: 3, y: 0, z: 0, scale: 1, sourceIndex: 1 }),
    ];
    const best = selectBestSubvolume({
      fullPlacements,
      overallGrid: { ...DEFAULT_GRID, xCells: 8, yCells: 8, zCells: 4, cellX: 2, cellY: 2, cellZ: 2, locked: true },
      selection: { ...DEFAULT_SELECTION, enabled: true, width: 4, height: 4, depth: 4, stepX: 2, stepY: 2, stepZ: 2, heightRouting: null },
      rules: DEFAULT_RULES,
      descriptors: DEFAULT_DESCRIPTORS,
      controls: DEFAULT_OPTIMIZER_CONTROLS,
      focus: "combined",
      seed: 7,
      generation: 0,
      selectedLetters: ["L", "U", "V"],
      maxPositions: 40,
    });
    assert.ok(best);
    assert.ok(best!.placements.length >= 1);
    assert.equal(best!.selection?.heightRouting ?? null, null);
  });

  it("uses body intersection for height-routed optimizer windows", () => {
    const fullPlacements = [
      // Center outside a 20×20×20 window at origin, but solid overlaps +X face.
      placement({ letter: "L", x: 11, y: 0, z: 0, scale: 6, sourceIndex: 0 }),
    ];
    const bounds = letterWorldBounds(fullPlacements[0], 12);
    assert.ok(bounds.minX < 10 && bounds.maxX > 10);
    const classified = classifyPlacementsAgainstSelection(
      fullPlacements,
      { centerX: 0, centerY: 0, centerZ: 0, width: 20, height: 20, depth: 20 },
      12,
    );
    assert.equal(classified[0].relation, "intersecting");

    const best = selectBestSubvolume({
      fullPlacements,
      overallGrid: { ...DEFAULT_GRID, xCells: 4, yCells: 4, zCells: 4, cellX: 15, cellY: 15, cellZ: 15, locked: true },
      selection: heightRoutedSelectionVolume(20),
      rules: DEFAULT_RULES,
      descriptors: DEFAULT_DESCRIPTORS,
      controls: DEFAULT_OPTIMIZER_CONTROLS,
      focus: "combined",
      seed: 11,
      generation: 0,
      selectedLetters: ["L", "U", "V"],
      maxPositions: 80,
    });
    assert.ok(best);
    assert.equal(best!.selection?.heightRouting, 20);
    assert.ok(best!.placements.some((item) => item.cell.letter === "L"));
  });
});
