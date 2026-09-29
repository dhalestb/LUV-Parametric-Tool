import type { CompositionPlacement } from "./compositionEngine";
import type { ConstraintStatus, GenerationRules, OrthogonalGrid } from "./optimizerTypes";

function depthHalf(placement: CompositionPlacement, rules: GenerationRules) {
  return placement.scale * (placement.scaleZ ?? 1) * (((rules.letterThicknessPercent ?? 12) / 100 + 0.04) / 2);
}

function extents(placement: CompositionPlacement, rules: GenerationRules) {
  return {
    x: placement.scale * (placement.scaleX ?? 1) * 0.5,
    y: placement.scale * (placement.scaleY ?? 1) * 0.5,
    z: depthHalf(placement, rules),
  };
}

export function gridDimensions(grid: OrthogonalGrid) {
  return {
    width: grid.xCells * grid.cellX,
    height: grid.yCells * grid.cellY,
    depth: grid.zCells * grid.cellZ,
    volume: grid.xCells * grid.cellX * grid.yCells * grid.cellY * grid.zCells * grid.cellZ,
  };
}

export function repairToHardConstraints(
  source: CompositionPlacement[],
  grid: OrthogonalGrid,
  rules: GenerationRules,
) {
  const dimensions = gridDimensions(grid);
  const repaired = structuredClone(source);
  repaired.forEach((placement) => {
    placement.scale = Math.max(rules.minimumLetterSize, Math.min(rules.maximumLetterSize, placement.scale));
    for (const key of ["scaleX", "scaleY", "scaleZ"] as const) {
      const axis = placement[key] ?? 1;
      placement[key] = Math.max(rules.minimumLetterSize / placement.scale, Math.min(rules.maximumLetterSize / placement.scale, axis));
    }
    const extent = extents(placement, rules);
    const halfX = Math.max(0, dimensions.width / 2 - extent.x);
    const halfY = Math.max(0, dimensions.height / 2 - extent.y);
    const halfZ = Math.max(0, dimensions.depth / 2 - extent.z);
    placement.x = Math.max(-halfX, Math.min(halfX, placement.x));
    placement.y = Math.max(-halfY, Math.min(halfY, placement.y));
    placement.z = Math.max(-halfZ, Math.min(halfZ, placement.z));
    // Preserve an unobstructed route along the Y axis.
    const required = rules.minimumClearance / 2 + extent.x;
    if (Math.abs(placement.x) < required) {
      const side = placement.x < 0 ? -1 : 1;
      placement.x = Math.max(-halfX, Math.min(halfX, side * required));
    }
  });
  return repaired;
}

export function countIntersections(placements: CompositionPlacement[]) {
  let count = 0;
  for (let first = 0; first < placements.length; first++) {
    const a = placements[first];
    const aRadius = a.scale * Math.max(a.scaleX ?? 1, a.scaleY ?? 1, a.scaleZ ?? 1) * 0.38;
    for (let second = first + 1; second < placements.length; second++) {
      const b = placements[second];
      const bRadius = b.scale * Math.max(b.scaleX ?? 1, b.scaleY ?? 1, b.scaleZ ?? 1) * 0.38;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < aRadius + bRadius) count++;
    }
  }
  return count;
}

export function validateConstraints(
  placements: CompositionPlacement[],
  grid: OrthogonalGrid,
  rules: GenerationRules,
  sourceCount?: number,
): ConstraintStatus {
  const dimensions = gridDimensions(grid);
  const half = { x: dimensions.width / 2, y: dimensions.height / 2, z: dimensions.depth / 2 };
  const finite = placements.every((placement) => [placement.x, placement.y, placement.z, placement.rx, placement.ry, placement.rz, placement.scale].every(Number.isFinite));
  const withinBounds = finite && placements.every((placement) => {
    const extent = extents(placement, rules);
    return Math.abs(placement.x) + extent.x <= half.x + 1e-6
      && Math.abs(placement.y) + extent.y <= half.y + 1e-6
      && Math.abs(placement.z) + extent.z <= half.z + 1e-6;
  });
  const clearanceSatisfied = placements.every((placement) => Math.abs(placement.x) - extents(placement, rules).x >= rules.minimumClearance / 2 - 1e-6);
  const sizeSatisfied = placements.every((placement) => {
    const dimensions = [placement.scale * (placement.scaleX ?? 1), placement.scale * (placement.scaleY ?? 1), placement.scale * (placement.scaleZ ?? 1)];
    return Math.min(...dimensions) >= rules.minimumLetterSize - 1e-6 && Math.max(...dimensions) <= rules.maximumLetterSize + 1e-6;
  });
  const intersectionCount = countIntersections(placements);
  const geometryValid = finite && intersectionCount <= rules.maximumIntersections;
  const violations: string[] = [];
  if (!grid.locked) violations.push("Grid dimensions must be locked before optimization");
  if (!withinBounds) violations.push("Geometry exceeds the locked grid boundary");
  if (!clearanceSatisfied) violations.push("Minimum circulation clearance is not satisfied");
  if (!sizeSatisfied) violations.push("Letter size limits are not satisfied");
  if (!geometryValid) violations.push(`Intersection limit exceeded (${intersectionCount}/${rules.maximumIntersections})`);
  if (sourceCount && !rules.allowRemove && sourceCount > grid.xCells * grid.yCells * grid.zCells) violations.push("Grid capacity is smaller than the required letter count");
  return {
    feasible: violations.length === 0,
    withinBounds,
    clearanceSatisfied,
    geometryValid,
    sizeSatisfied,
    intersectionCount,
    violations,
  };
}
