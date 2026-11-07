import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_GRID } from "./optimizerTypes.ts";
import {
  clearHeightRouting,
  describeDeferredGeneratorInterface,
  EXISTING_TYPOLOGY_HEIGHT_SIGNALS,
  heightRoutedSelectionVolume,
  isHeightRoutingActive,
  planSourceFieldCapacity,
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

  it("documents the deferred Phase 2 generator interface", () => {
    const contract = describeDeferredGeneratorInterface(60);
    assert.equal(contract.enclosurePlanFeet, 20);
    assert.equal(contract.enclosureHeightFeet, 60);
    assert.ok(contract.notes.some((note) => note.includes("buildConnectionWorkflow")));
  });
});
