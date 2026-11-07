import type { OrthogonalGrid, SelectionVolume } from "./optimizerTypes";
import { gridDimensions } from "./constraintValidation";

/** Architectural plan bay shared with the 20 ft module and lattice. */
export const SELECTION_PLAN_FEET = 20;

/** Supported vertical envelopes for height-routed selection fields. */
export const SELECTION_HEIGHTS_FEET = [20, 40, 60] as const;
export type SelectionHeightFeet = (typeof SELECTION_HEIGHTS_FEET)[number];

export type SelectionFieldDimensions = {
  /** Architectural width (X). */
  width: number;
  /** Architectural depth (Y). */
  height: number;
  /** Architectural height (Z). */
  depth: number;
};

export type SelectionFieldVolume = SelectionFieldDimensions & {
  centerX: number;
  centerY: number;
  centerZ: number;
};

export type SourceFieldExtents = SelectionFieldDimensions;

export type TypologyHeightAssignment =
  | { status: "assigned"; height: SelectionHeightFeet; source: string }
  | { status: "unresolved"; reason: string };

/**
 * Existing codebase signals for typology height. The live generator currently
 * hard-codes a 20 × 20 × 20 ft enclosure for every typology; Module Modifier
 * stretches afterward. No typology-to-height table exists yet — do not invent one.
 */
export const EXISTING_TYPOLOGY_HEIGHT_SIGNALS = {
  sharedEnclosureFeet: 20 as SelectionHeightFeet,
  verticalIncrementFeet: 20,
  modulePlanFeet: SELECTION_PLAN_FEET,
  sources: [
    "amphitheaterPrototype.TILE_SIZE_FEET = 20",
    "amphitheaterPrototype.VERTICAL_INCREMENT_FEET = 20",
    "letterIntersectionSpaces enclosure Manifold.cube([20,20,20])",
    "moduleEnvelope BASE_MODULE → 20 ft vertical module; taller heights are post-stretch",
  ],
} as const;

export function isSelectionHeightFeet(value: unknown): value is SelectionHeightFeet {
  return value === 20 || value === 40 || value === 60;
}

/** Plan = 20 × 20; Z = requested architectural height. */
export function selectionFieldDimensions(height: SelectionHeightFeet): SelectionFieldDimensions {
  return {
    width: SELECTION_PLAN_FEET,
    height: SELECTION_PLAN_FEET,
    depth: height,
  };
}

export function selectionHeightPresets(): Array<{
  height: SelectionHeightFeet;
  label: string;
  dimensions: SelectionFieldDimensions;
}> {
  return SELECTION_HEIGHTS_FEET.map((height) => ({
    height,
    label: `20 × 20 × ${height} ft`,
    dimensions: selectionFieldDimensions(height),
  }));
}

/**
 * Look up a typology height assignment. Returns unresolved for every typology
 * until Phase 2 / design review supplies an authoritative map.
 */
export function typologyHeightAssignment(typology: string): TypologyHeightAssignment {
  void typology;
  return {
    status: "unresolved",
    reason:
      "No typology-to-height table exists in the codebase. All typologies currently generate inside a shared 20 × 20 × 20 ft enclosure; taller envelopes are post-generation stretches via Module Modifier.",
  };
}

export function unresolvedTypologyHeightAssignments(
  typologies: readonly string[],
): Array<{ typology: string; assignment: TypologyHeightAssignment }> {
  return typologies.map((typology) => ({ typology, assignment: typologyHeightAssignment(typology) }));
}

export function selectionVolumeFitsSource(
  field: SelectionFieldDimensions,
  source: SourceFieldExtents,
  epsilon = 1e-6,
): boolean {
  return field.width <= source.width + epsilon
    && field.height <= source.height + epsilon
    && field.depth <= source.depth + epsilon;
}

export function selectionVolumeInsideSource(
  volume: SelectionFieldVolume,
  source: SourceFieldExtents,
  epsilon = 1e-6,
): { valid: boolean; violations: string[] } {
  const half = {
    x: volume.width / 2,
    y: volume.height / 2,
    z: volume.depth / 2,
  };
  const sourceHalf = {
    x: source.width / 2,
    y: source.height / 2,
    z: source.depth / 2,
  };
  const violations: string[] = [];
  if (Math.abs(volume.centerX) + half.x > sourceHalf.x + epsilon) {
    violations.push(`Selection extends beyond the source field in X (width).`);
  }
  if (Math.abs(volume.centerY) + half.y > sourceHalf.y + epsilon) {
    violations.push(`Selection extends beyond the source field in Y (depth).`);
  }
  if (Math.abs(volume.centerZ) + half.z > sourceHalf.z + epsilon) {
    violations.push(`Selection extends beyond the source field in Z (height).`);
  }
  if (!selectionVolumeFitsSource(volume, source, epsilon)) {
    violations.push(
      `Selection ${volume.width} × ${volume.height} × ${volume.depth} ft does not fit inside the source ${source.width} × ${source.height} × ${source.depth} ft.`,
    );
  }
  return { valid: violations.length === 0, violations };
}

/** Geometry vs required envelope: crop Z span must not exceed the routed height. */
export function selectionGeometryCompatibleWithHeight(
  geometryDepthSpan: number,
  requiredHeight: SelectionHeightFeet,
  epsilon = 1e-6,
): { compatible: boolean; detail: string } {
  if (!(geometryDepthSpan >= 0) || !Number.isFinite(geometryDepthSpan)) {
    return { compatible: false, detail: "Geometry depth span is not finite." };
  }
  if (geometryDepthSpan > requiredHeight + epsilon) {
    return {
      compatible: false,
      detail: `Selected letter geometry spans ${geometryDepthSpan.toFixed(3)} ft in Z, which exceeds the ${requiredHeight} ft selection height.`,
    };
  }
  return {
    compatible: true,
    detail: `Selected letter geometry spans ${geometryDepthSpan.toFixed(3)} ft within the ${requiredHeight} ft selection height.`,
  };
}

export type SourceCapacityPlan = {
  required: SelectionFieldDimensions;
  current: SourceFieldExtents;
  sufficient: boolean;
  /** Grid with cell pitches expanded so overall extents cover the required volume without stretching letter scales. */
  expandedGrid: OrthogonalGrid;
  expanded: SourceFieldExtents;
  notes: string[];
};

/**
 * Expand overall Composition extents to host a height-routed selection.
 * Letter instance scales are unchanged; only cell pitches grow so the field is large enough.
 */
export function planSourceFieldCapacity(
  grid: OrthogonalGrid,
  height: SelectionHeightFeet,
): SourceCapacityPlan {
  const required = selectionFieldDimensions(height);
  const current = gridDimensions(grid);
  const notes: string[] = [];
  const cellX = Math.max(grid.cellX, required.width / Math.max(1, grid.xCells));
  const cellY = Math.max(grid.cellY, required.height / Math.max(1, grid.yCells));
  const cellZ = Math.max(grid.cellZ, required.depth / Math.max(1, grid.zCells));
  if (cellX > grid.cellX + 1e-9) notes.push(`Increased Cell X pitch from ${grid.cellX.toFixed(3)} to ${cellX.toFixed(3)} ft so overall width reaches ${required.width} ft.`);
  if (cellY > grid.cellY + 1e-9) notes.push(`Increased Cell Y pitch from ${grid.cellY.toFixed(3)} to ${cellY.toFixed(3)} ft so overall depth reaches ${required.height} ft.`);
  if (cellZ > grid.cellZ + 1e-9) notes.push(`Increased Cell Z pitch from ${grid.cellZ.toFixed(3)} to ${cellZ.toFixed(3)} ft so overall height reaches ${required.depth} ft.`);
  if (!notes.length) notes.push(`Source field already hosts a ${required.width} × ${required.height} × ${required.depth} ft selection.`);
  const expandedGrid: OrthogonalGrid = {
    ...grid,
    cellX,
    cellY,
    cellZ,
    locked: true,
  };
  const expanded = gridDimensions(expandedGrid);
  return {
    required,
    current: { width: current.width, height: current.height, depth: current.depth },
    sufficient: selectionVolumeFitsSource(required, { width: current.width, height: current.height, depth: current.depth }),
    expandedGrid,
    expanded: { width: expanded.width, height: expanded.height, depth: expanded.depth },
    notes,
  };
}

/** Build a SelectionVolume locked to a height preset. Search steps default to half the plan bay / vertical module. */
export function heightRoutedSelectionVolume(
  height: SelectionHeightFeet,
  previous?: Partial<SelectionVolume>,
): SelectionVolume {
  const dimensions = selectionFieldDimensions(height);
  return {
    enabled: true,
    width: dimensions.width,
    height: dimensions.height,
    depth: dimensions.depth,
    stepX: previous?.stepX && previous.stepX > 0 ? Math.min(previous.stepX, dimensions.width) : SELECTION_PLAN_FEET / 2,
    stepY: previous?.stepY && previous.stepY > 0 ? Math.min(previous.stepY, dimensions.height) : SELECTION_PLAN_FEET / 2,
    stepZ: previous?.stepZ && previous.stepZ > 0 ? Math.min(previous.stepZ, dimensions.depth) : Math.min(20, height),
    heightRouting: height,
  };
}

export function clearHeightRouting(selection: SelectionVolume): SelectionVolume {
  const { heightRouting: _removed, ...rest } = selection;
  void _removed;
  return { ...rest, heightRouting: null };
}

export function isHeightRoutingActive(selection: Pick<SelectionVolume, "heightRouting" | "enabled">): boolean {
  return Boolean(selection.enabled && isSelectionHeightFeet(selection.heightRouting));
}

/** Phase 2 generator contract — not wired into UnifiedPrototype during Phase 1. */
export type HeightSelectionGeneratorInterface = {
  enclosurePlanFeet: typeof SELECTION_PLAN_FEET;
  enclosureHeightFeet: SelectionHeightFeet;
  selection: SelectionFieldVolume;
  /** Letters whose solids intersect the field, with original TRS preserved. */
  intersectingPlacements: unknown[];
  /**
   * Physically trimmed letter solids (Manifold ∩ selection cube). Boundary
   * crossings are split and capped by the boolean; this is not a visual clip.
   */
  trimmedLetterMeshes: unknown[];
  notes: string[];
};

export function describeDeferredGeneratorInterface(height: SelectionHeightFeet): HeightSelectionGeneratorInterface {
  const dimensions = selectionFieldDimensions(height);
  return {
    enclosurePlanFeet: SELECTION_PLAN_FEET,
    enclosureHeightFeet: height,
    selection: { ...dimensions, centerX: 0, centerY: 0, centerZ: 0 },
    intersectingPlacements: [],
    trimmedLetterMeshes: [],
    notes: [
      "Phase 1 prepares selection fields and trimmed letter geometry only.",
      "Phase 2 must pass enclosureHeightFeet into buildConnectionWorkflow instead of the hard-coded 20 × 20 × 20 cube.",
      "Phase 2 must generate from trimmed/intersecting letter geometry rather than Module Modifier stretch.",
      "Protected files until integration: UnifiedPrototype.tsx, letterIntersectionSpaces.ts, moduleEnvelope.ts, lattice/*.",
    ],
  };
}
