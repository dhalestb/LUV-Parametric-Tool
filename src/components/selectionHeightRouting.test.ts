import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_GRID, DEFAULT_SELECTION } from "./optimizerTypes.ts";
import {
  applyDashedGroupSelection,
  capacityShortfallMessages,
  clearHeightRouting,
  describeDeferredGeneratorInterface,
  EXISTING_TYPOLOGY_HEIGHT_SIGNALS,
  heightRoutedSelectionVolume,
  isHeightRoutingActive,
  normalizeStoredSelection,
  planSourceFieldCapacity,
  projectSelectionOntoField,
  SELECTION_HEIGHTS_FEET,
  SELECTION_PLAN_FEET,
  selectionFieldDimensions,
  selectionGeometryCompatibleWithHeight,
  selectionHeightPresets,
  selectionVolumeFitsSource,
  selectionVolumeInsideSource,
  typologyHeightAssignment,
  unresolvedTypologyHeightAssignments,
} from "./selectionHeightRouting.ts";

/** Registry ids mirrored from amphitheaterPrototype.TYPOLOGY_RULES (avoid importing Three.js in this suite). */
const TYPOLOGY_IDS = [
  "stepped-amphitheater", "void-field-gathering", "inserted-horizontal-plate", "contained-room-within-volume", "linear-edge-gallery",
  "open-hall-workspace", "cascaded-terraced-plates", "flat-deep-plan-plate", "void-edge-workspace", "folded-undulating-work-surface",
  "vertical-void-lobby", "compressed-sequential-lobby", "continuous-hall-lobby", "topographic-ground-field-lobby", "linear-gallery-lobby",
] as const;

describe("selectionHeightRouting", () => {
  it("defines the three architectural selection sizes", () => {
    assert.deepEqual([...SELECTION_HEIGHTS_FEET], [20, 40, 60]);
    for (const height of SELECTION_HEIGHTS_FEET) {
      assert.deepEqual(selectionFieldDimensions(height), {
        width: SELECTION_PLAN_FEET,
        height: SELECTION_PLAN_FEET,
        depth: height,
      });
    }
    assert.equal(selectionHeightPresets().length, 3);
  });

  it("reports every typology height assignment as unresolved", () => {
    const unresolved = unresolvedTypologyHeightAssignments([...TYPOLOGY_IDS]);
    assert.equal(unresolved.length, TYPOLOGY_IDS.length);
    for (const entry of unresolved) {
      assert.equal(entry.assignment.status, "unresolved");
      assert.equal(typologyHeightAssignment(entry.typology).status, "unresolved");
    }
    assert.equal(EXISTING_TYPOLOGY_HEIGHT_SIGNALS.sharedEnclosureFeet, 20);
    assert.equal(EXISTING_TYPOLOGY_HEIGHT_SIGNALS.verticalIncrementFeet, 20);
  });

  it("validates selection volumes against the source field", () => {
    const source = { width: 40, height: 40, depth: 60 };
    assert.equal(selectionVolumeFitsSource(selectionFieldDimensions(60), source), true);
    assert.equal(selectionVolumeFitsSource(selectionFieldDimensions(60), { width: 20, height: 20, depth: 40 }), false);
    const inside = selectionVolumeInsideSource({
      ...selectionFieldDimensions(40),
      centerX: 0,
      centerY: 0,
      centerZ: 0,
    }, source);
    assert.equal(inside.valid, true);
    const outside = selectionVolumeInsideSource({
      ...selectionFieldDimensions(40),
      centerX: 30,
      centerY: 0,
      centerZ: 0,
    }, { width: 40, height: 40, depth: 60 });
    assert.equal(outside.valid, false);
    assert.ok(outside.violations.some((text) => text.includes("X")));
  });

  it("checks geometry compatibility with required height", () => {
    assert.equal(selectionGeometryCompatibleWithHeight(19.5, 20).compatible, true);
    assert.equal(selectionGeometryCompatibleWithHeight(40.1, 40).compatible, false);
    assert.equal(selectionGeometryCompatibleWithHeight(55, 60).compatible, true);
  });

  it("expands source capacity for 60 ft without stretching letter scales", () => {
    const small = { ...DEFAULT_GRID, cellX: 1.2, cellY: 1.2, cellZ: 1.2 };
    const plan = planSourceFieldCapacity(small, 60);
    assert.equal(plan.sufficient, false);
    assert.ok(plan.expanded.width >= 20 - 1e-9);
    assert.ok(plan.expanded.height >= 20 - 1e-9);
    assert.ok(plan.expanded.depth >= 60 - 1e-9);
    assert.equal(plan.expandedGrid.xCells, small.xCells);
    assert.equal(plan.expandedGrid.yCells, small.yCells);
    assert.equal(plan.expandedGrid.zCells, small.zCells);
    assert.ok(plan.expandedGrid.cellZ > small.cellZ);
  });

  it("locks SelectionVolume presets and clears height routing", () => {
    const routed = heightRoutedSelectionVolume(40);
    assert.equal(routed.enabled, true);
    assert.equal(routed.width, 20);
    assert.equal(routed.height, 20);
    assert.equal(routed.depth, 40);
    assert.equal(routed.heightRouting, 40);
    assert.equal(isHeightRoutingActive(routed), true);
    const cleared = clearHeightRouting(routed);
    assert.equal(cleared.heightRouting, null);
    assert.equal(isHeightRoutingActive(cleared), false);
  });

  it("selects each architectural envelope and keeps it when the grid is smaller or locked", () => {
    for (const height of [20, 40, 60] as const) {
      const routed = heightRoutedSelectionVolume(height, { ...DEFAULT_SELECTION, stepX: 4, stepY: 5, stepZ: 6 });
      assert.equal(routed.enabled, true);
      assert.equal(routed.width, 20);
      assert.equal(routed.height, 20);
      assert.equal(routed.depth, height);
      assert.equal(routed.heightRouting, height);
      assert.equal(routed.stepX, 4);
      const smallField = { width: 10, height: 10, depth: 12 };
      const projected = projectSelectionOntoField(routed, smallField);
      assert.equal(projected.width, 20);
      assert.equal(projected.height, 20);
      assert.equal(projected.depth, height);
      assert.equal(projected.heightRouting, height);
    }
  });

  it("does not let dashed-group sizing override an active height route", () => {
    const routed = heightRoutedSelectionVolume(40, { stepX: 8, stepY: 8, stepZ: 10 });
    const dashed = { width: 22.04, height: 22.04, depth: 21.87, stepX: 11, stepY: 11, stepZ: 10 };
    const kept = applyDashedGroupSelection(routed, dashed);
    assert.equal(kept.width, 20);
    assert.equal(kept.height, 20);
    assert.equal(kept.depth, 40);
    assert.equal(kept.heightRouting, 40);
    const open = applyDashedGroupSelection({ ...DEFAULT_SELECTION, enabled: true }, dashed);
    assert.equal(open.width, 22.04);
    assert.equal(open.depth, 21.87);
    assert.equal(open.heightRouting, null);
  });

  it("reports an undersized source field without shrinking the requested envelope", () => {
    const small = { ...DEFAULT_GRID, cellX: 1.2, cellY: 1.2, cellZ: 1.2, locked: true };
    const plan = planSourceFieldCapacity(small, 60);
    assert.equal(plan.sufficient, false);
    assert.equal(plan.expandedGrid.locked, true);
    const messages = capacityShortfallMessages(plan);
    assert.ok(messages.some((line) => line.includes("Overall Z")));
    assert.ok(messages.some((line) => line.includes("Cell Z")));
    const selection = projectSelectionOntoField(heightRoutedSelectionVolume(60), plan.current);
    assert.equal(selection.depth, 60);
    assert.equal(selectionVolumeFitsSource(selection, plan.current), false);
  });

  it("restores a saved height route at its architectural size", () => {
    const restored = normalizeStoredSelection({
      enabled: true,
      width: 22.04,
      height: 22.04,
      depth: 21.87,
      stepX: 3,
      stepY: 4,
      stepZ: 5,
      heightRouting: 60,
    });
    assert.equal(restored.width, 20);
    assert.equal(restored.height, 20);
    assert.equal(restored.depth, 60);
    assert.equal(restored.stepX, 3);
    assert.equal(restored.heightRouting, 60);
    const legacy = normalizeStoredSelection({ ...DEFAULT_SELECTION, width: 4, heightRouting: null });
    assert.equal(legacy.width, 4);
    assert.equal(legacy.heightRouting, null);
  });

  it("documents the deferred Phase 2 generator interface", () => {
    const contract = describeDeferredGeneratorInterface(60);
    assert.equal(contract.enclosurePlanFeet, 20);
    assert.equal(contract.enclosureHeightFeet, 60);
    assert.ok(contract.notes.some((note) => note.includes("buildConnectionWorkflow")));
  });
});
