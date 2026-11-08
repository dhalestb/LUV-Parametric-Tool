import { gridDimensions } from "./constraintValidation";
import type { OrthogonalGrid } from "./optimizerTypes";
import type { SelectionFieldDimensions } from "./selectionHeightRouting";

/** Example overall composition field large enough to host and reposition 20/40/60 ft selections. */
export const EXAMPLE_OVERALL_FEET = { width: 60, height: 60, depth: 80 } as const;

export const ARCHITECTURAL_GRID_LIMITS = {
  cellsMin: 1,
  cellsMax: 32,
  cellPitchMin: 0.5,
  cellPitchMax: 80,
  overallMin: 2,
  overallMax: 400,
  /** Soft warning when the product of cell counts is large. */
  softCellProductWarning: 512,
  softVolumeWarningFt3: EXAMPLE_OVERALL_FEET.width * EXAMPLE_OVERALL_FEET.height * EXAMPLE_OVERALL_FEET.depth * 2,
} as const;

export type GridAxis = "x" | "y" | "z";

export type GridValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const axisCells = (axis: GridAxis): keyof OrthogonalGrid => (axis === "x" ? "xCells" : axis === "y" ? "yCells" : "zCells");
const axisPitch = (axis: GridAxis): keyof OrthogonalGrid => (axis === "x" ? "cellX" : axis === "y" ? "cellY" : "cellZ");

/** Default Fixed 3D Grid: 6×6×4 cells → 10×10×20 ft pitches → 60×60×80 ft overall. */
export function createArchitecturalGrid(overrides: Partial<OrthogonalGrid> = {}): OrthogonalGrid {
  const xCells = overrides.xCells ?? 6;
  const yCells = overrides.yCells ?? 6;
  const zCells = overrides.zCells ?? 4;
  return {
    xCells,
    yCells,
    zCells,
    cellX: overrides.cellX ?? EXAMPLE_OVERALL_FEET.width / xCells,
    cellY: overrides.cellY ?? EXAMPLE_OVERALL_FEET.height / yCells,
    cellZ: overrides.cellZ ?? EXAMPLE_OVERALL_FEET.depth / zCells,
    locked: overrides.locked ?? false,
  };
}

export function overallFromGrid(grid: OrthogonalGrid) {
  const dimensions = gridDimensions(grid);
  return { width: dimensions.width, height: dimensions.height, depth: dimensions.depth, volume: dimensions.volume };
}

export function setGridCellCount(grid: OrthogonalGrid, axis: GridAxis, count: number): OrthogonalGrid {
  const key = axisCells(axis);
  const next = Math.round(count);
  return { ...grid, [key]: next };
}

/** Change pitch on one axis; overall on that axis updates; cell count is preserved. */
export function setGridCellPitch(grid: OrthogonalGrid, axis: GridAxis, pitch: number): OrthogonalGrid {
  return { ...grid, [axisPitch(axis)]: pitch };
}

/** Change overall on one axis; pitch recalculates; cell count is preserved. */
export function setGridOverall(grid: OrthogonalGrid, axis: GridAxis, overall: number): OrthogonalGrid {
  const cells = Math.max(1, Number(grid[axisCells(axis)]));
  return { ...grid, [axisPitch(axis)]: overall / cells };
}

export function validateArchitecturalGrid(grid: OrthogonalGrid): GridValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { cellsMin, cellsMax, cellPitchMin, cellPitchMax, overallMin, overallMax, softCellProductWarning, softVolumeWarningFt3 } = ARCHITECTURAL_GRID_LIMITS;
  for (const [label, cells] of [["X", grid.xCells], ["Y", grid.yCells], ["Z", grid.zCells]] as const) {
    if (!Number.isFinite(cells) || cells < cellsMin || cells > cellsMax) {
      errors.push(`${label} cells must be between ${cellsMin} and ${cellsMax} (requested ${cells}).`);
    }
  }
  for (const [label, pitch] of [["Cell X", grid.cellX], ["Cell Y", grid.cellY], ["Cell Z", grid.cellZ]] as const) {
    if (!Number.isFinite(pitch) || pitch < cellPitchMin || pitch > cellPitchMax) {
      errors.push(`${label} must be between ${cellPitchMin} and ${cellPitchMax} ft (requested ${pitch}).`);
    }
  }
  const overall = overallFromGrid(grid);
  for (const [label, value] of [["Overall X", overall.width], ["Overall Y", overall.height], ["Overall Z", overall.depth]] as const) {
    if (!Number.isFinite(value) || value < overallMin || value > overallMax) {
      errors.push(`${label} must be between ${overallMin} and ${overallMax} ft (requested ${value}).`);
    }
  }
  const product = grid.xCells * grid.yCells * grid.zCells;
  if (product > softCellProductWarning) {
    warnings.push(`Grid has ${product} cells. Optimization and geometry evaluation may take longer.`);
  }
  if (overall.volume > softVolumeWarningFt3) {
    warnings.push(`Overall volume is ${overall.volume.toFixed(0)} ft³. Large fields increase search cost if cell counts are also high.`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function gridAccommodatesSelection(
  grid: OrthogonalGrid,
  selection: SelectionFieldDimensions,
  epsilon = 1e-6,
): { ok: boolean; detail: string } {
  const overall = overallFromGrid(grid);
  const ok = selection.width <= overall.width + epsilon
    && selection.height <= overall.height + epsilon
    && selection.depth <= overall.depth + epsilon;
  return {
    ok,
    detail: ok
      ? `Selection ${selection.width}×${selection.height}×${selection.depth} ft fits inside ${overall.width.toFixed(1)}×${overall.height.toFixed(1)}×${overall.depth.toFixed(1)} ft.`
      : `Selection ${selection.width}×${selection.height}×${selection.depth} ft does not fit inside overall ${overall.width.toFixed(1)}×${overall.height.toFixed(1)}×${overall.depth.toFixed(1)} ft.`,
  };
}

/**
 * Normalize legacy/session grids without silently inventing values.
 * Invalid numbers fall back to the architectural example; valid custom values are kept.
 */
export function normalizeArchitecturalGrid(grid: Partial<OrthogonalGrid> | null | undefined): OrthogonalGrid {
  const base = createArchitecturalGrid();
  if (!grid) return base;
  const next = createArchitecturalGrid({
    xCells: Number.isFinite(grid.xCells) ? Number(grid.xCells) : base.xCells,
    yCells: Number.isFinite(grid.yCells) ? Number(grid.yCells) : base.yCells,
    zCells: Number.isFinite(grid.zCells) ? Number(grid.zCells) : base.zCells,
    cellX: Number.isFinite(grid.cellX) ? Number(grid.cellX) : base.cellX,
    cellY: Number.isFinite(grid.cellY) ? Number(grid.cellY) : base.cellY,
    cellZ: Number.isFinite(grid.cellZ) ? Number(grid.cellZ) : base.cellZ,
    locked: typeof grid.locked === "boolean" ? grid.locked : base.locked,
  });
  return next;
}
