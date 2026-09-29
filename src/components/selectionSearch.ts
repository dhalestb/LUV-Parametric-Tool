import type { CompositionPlacement, DescriptorSettings } from "./compositionEngine";
import { evaluateSpatialDesign } from "./descriptorEvaluation";
import { gridDimensions } from "./constraintValidation";
import type { CandidateFocus, GenerationRules, OptimizerControls, OrthogonalGrid, SelectionVolume, SpatialAlternative } from "./optimizerTypes";

function axisCenters(overall: number, selection: number, step: number) {
  const extent = Math.max(0, (overall - selection) / 2);
  if (extent === 0) return [0];
  const values: number[] = [];
  for (let value = -extent; value <= extent + 1e-6; value += Math.max(0.05, step)) values.push(Math.min(extent, value));
  if (values[values.length - 1] < extent - 1e-6) values.push(extent);
  return values;
}

function distributedSample<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * (items.length - 1) / Math.max(count - 1, 1))]);
}

function sourceAwareCenters(
  placements: CompositionPlacement[],
  overall: { width: number; height: number; depth: number },
  selection: Pick<SelectionVolume, "width" | "height" | "depth">,
  count: number,
) {
  const extents = {
    x: Math.max(0, (overall.width - selection.width) / 2),
    y: Math.max(0, (overall.height - selection.height) / 2),
    z: Math.max(0, (overall.depth - selection.depth) / 2),
  };
  const candidates = distributedSample(placements, count).map((placement) => ({
    x: Math.max(-extents.x, Math.min(extents.x, placement.x)),
    y: Math.max(-extents.y, Math.min(extents.y, placement.y)),
    z: Math.max(-extents.z, Math.min(extents.z, placement.z)),
  }));
  return [...new Map(candidates.map((center) => [`${center.x.toFixed(5)}:${center.y.toFixed(5)}:${center.z.toFixed(5)}`, center])).values()];
}

function placementExtent(placement: CompositionPlacement, rules: GenerationRules) {
  return {
    x: placement.scale * (placement.scaleX ?? 1) * 0.5,
    y: placement.scale * (placement.scaleY ?? 1) * 0.5,
    z: placement.scale * (placement.scaleZ ?? 1) * (((rules.letterThicknessPercent ?? 12) / 100 + 0.04) / 2),
  };
}

export function selectionEvaluationGrid(selection: Pick<SelectionVolume, "width" | "height" | "depth">, overall: OrthogonalGrid): OrthogonalGrid {
  const xCells = Math.max(2, Math.round(selection.width / overall.cellX));
  const yCells = Math.max(2, Math.round(selection.height / overall.cellY));
  const zCells = Math.max(2, Math.round(selection.depth / overall.cellZ));
  return {
    xCells,
    yCells,
    zCells,
    cellX: selection.width / xCells,
    cellY: selection.height / yCells,
    cellZ: selection.depth / zCells,
    locked: true,
  };
}

function rank(alternative: SpatialAlternative) {
  if (alternative.evaluation.constraints.feasible) return alternative.evaluation.fit ?? 0;
  return -1000 - alternative.evaluation.constraints.violations.length * 10 + Math.min(alternative.placements.length, 9);
}

export function selectBestSubvolume(args: {
  fullPlacements: CompositionPlacement[];
  overallGrid: OrthogonalGrid;
  selection: SelectionVolume;
  rules: GenerationRules;
  descriptors: DescriptorSettings;
  controls: OptimizerControls;
  focus: CandidateFocus;
  seed: number;
  generation: number;
  maxPositions?: number;
}) {
  const overall = gridDimensions(args.overallGrid);
  const selection = {
    ...args.selection,
    width: Math.min(args.selection.width, overall.width),
    height: Math.min(args.selection.height, overall.height),
    depth: Math.min(args.selection.depth, overall.depth),
  };
  const xs = axisCenters(overall.width, selection.width, selection.stepX);
  const ys = axisCenters(overall.height, selection.height, selection.stepY);
  const zs = axisCenters(overall.depth, selection.depth, selection.stepZ);
  const allCenters = xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => ({ x, y, z }))));
  const maxPositions = Math.max(1, args.maxPositions ?? allCenters.length);
  const exhaustive = allCenters.length <= maxPositions;
  const sourceBudget = exhaustive ? 0 : Math.min(args.fullPlacements.length, Math.max(4, Math.floor(maxPositions / 4)));
  const alignedBudget = Math.max(1, maxPositions - sourceBudget);
  const alignedCenters = exhaustive ? allCenters : distributedSample(allCenters, alignedBudget);
  // Small selections can have only a few hundredths of a unit of tolerance around a
  // letter. Uniform sampling may miss every such position, so always evaluate a
  // representative set of windows centered on the actual generated geometry.
  const adaptiveCenters = sourceAwareCenters(args.fullPlacements, overall, selection, sourceBudget);
  const centers = [...new Map([...adaptiveCenters, ...alignedCenters].map((center) => [`${center.x.toFixed(5)}:${center.y.toFixed(5)}:${center.z.toFixed(5)}`, center])).values()];
  const localGrid = selectionEvaluationGrid(selection, args.overallGrid);
  const candidates: SpatialAlternative[] = [];
  centers.forEach((center, centerIndex) => {
    const contained = args.fullPlacements.filter((placement) => {
      const extent = placementExtent(placement, args.rules);
      return Math.abs(placement.x - center.x) + extent.x <= selection.width / 2 + 1e-6
        && Math.abs(placement.y - center.y) + extent.y <= selection.height / 2 + 1e-6
        && Math.abs(placement.z - center.z) + extent.z <= selection.depth / 2 + 1e-6;
    });
    if (!contained.length) return;
    const localPlacements = contained.map((placement) => ({ ...structuredClone(placement), x: placement.x - center.x, y: placement.y - center.y, z: placement.z - center.z }));
    const evaluation = evaluateSpatialDesign({
      placements: localPlacements,
      grid: localGrid,
      rules: args.rules,
      descriptors: args.descriptors,
      controls: args.controls,
      focus: args.focus,
    });
    candidates.push({
      id: `selection-${args.seed}-${args.generation}-${centerIndex}`,
      seed: args.seed,
      focus: args.focus,
      placements: localPlacements,
      fullPlacements: args.fullPlacements,
      evaluation,
      generation: args.generation,
      selection: {
        centerX: center.x,
        centerY: center.y,
        centerZ: center.z,
        width: selection.width,
        height: selection.height,
        depth: selection.depth,
        evaluatedPositions: centers.length,
        totalPositions: allCenters.length,
        exhaustive,
      },
    });
  });
  return candidates.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
