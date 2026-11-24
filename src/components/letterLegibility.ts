import type { CompositionPlacement } from "./compositionEngine";
import {
  classifyPlacementsAgainstSelection,
  letterWorldBounds,
  type PlacementFieldRelation,
} from "./selectionFieldGeometry";
import { letterFootprintFeet } from "./architecturalLetterSizing";
import type { SelectionFieldVolume } from "./selectionHeightRouting";
import type { Letter } from "./letterTypes";

export type LegibilityFinding = {
  id: string;
  severity: "info" | "watch" | "compromised";
  letter?: Letter;
  sourceIndex?: number;
  message: string;
};

export type LegibilityReport = {
  findings: LegibilityFinding[];
  compromisedCount: number;
  watchCount: number;
  /** Soft score 0–1; not a hard pass/fail threshold. */
  recognizabilityProxy: number;
};

function axisScales(placement: CompositionPlacement) {
  return {
    x: placement.scaleX ?? 1,
    y: placement.scaleY ?? 1,
    z: placement.scaleZ ?? 1,
  };
}

function deformationRatio(placement: CompositionPlacement): number {
  const { x, y, z } = axisScales(placement);
  const values = [x, y, z];
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max < 1e-9) return 0;
  return 1 - min / max;
}

/** Expected silhouette cues: L has an open corner; U a cavity; V a taper — checked via AABB aspect proxies. */
function featureAspectWatch(placement: CompositionPlacement, bounds: ReturnType<typeof letterWorldBounds>): LegibilityFinding | null {
  const sx = Math.max(1e-6, bounds.maxX - bounds.minX);
  const sy = Math.max(1e-6, bounds.maxY - bounds.minY);
  const sz = Math.max(1e-6, bounds.maxZ - bounds.minZ);
  const planRatio = Math.max(sx, sy) / Math.min(sx, sy);
  const verticalRatio = sz / Math.min(sx, sy);
  if (planRatio > 4.5) {
    return {
      id: `aspect-plan-${placement.sourceIndex}`,
      severity: "watch",
      letter: placement.cell.letter,
      sourceIndex: placement.sourceIndex,
      message: `${placement.cell.letter} plan aspect ${planRatio.toFixed(2)} is extreme; silhouette cues may be hard to read in plan.`,
    };
  }
  if (verticalRatio > 6) {
    return {
      id: `aspect-vertical-${placement.sourceIndex}`,
      severity: "watch",
      letter: placement.cell.letter,
      sourceIndex: placement.sourceIndex,
      message: `${placement.cell.letter} is very tall relative to its plan (${verticalRatio.toFixed(2)}×); check orientation against intended views.`,
    };
  }
  return null;
}

function overlapSeverity(
  a: CompositionPlacement,
  b: CompositionPlacement,
  thicknessPercent: number,
): LegibilityFinding | null {
  const ba = letterWorldBounds(a, thicknessPercent);
  const bb = letterWorldBounds(b, thicknessPercent);
  const overlapX = Math.max(0, Math.min(ba.maxX, bb.maxX) - Math.max(ba.minX, bb.minX));
  const overlapY = Math.max(0, Math.min(ba.maxY, bb.maxY) - Math.max(ba.minY, bb.minY));
  const overlapZ = Math.max(0, Math.min(ba.maxZ, bb.maxZ) - Math.max(ba.minZ, bb.minZ));
  if (overlapX <= 1e-6 || overlapY <= 1e-6 || overlapZ <= 1e-6) return null;
  const vol = overlapX * overlapY * overlapZ;
  const va = Math.max(1e-6, (ba.maxX - ba.minX) * (ba.maxY - ba.minY) * (ba.maxZ - ba.minZ));
  const vb = Math.max(1e-6, (bb.maxX - bb.minX) * (bb.maxY - bb.minY) * (bb.maxZ - bb.minZ));
  const fraction = vol / Math.min(va, vb);
  // Productive intersections are expected. Only flag near-total engulfment as compromised.
  if (fraction >= 0.85) {
    return {
      id: `overlap-${a.sourceIndex}-${b.sourceIndex}`,
      severity: "compromised",
      letter: a.cell.letter,
      sourceIndex: a.sourceIndex,
      message: `${a.cell.letter} and ${b.cell.letter} nearly coincide (${(fraction * 100).toFixed(0)}% of the smaller AABB). Recognizable letter features are likely lost.`,
    };
  }
  if (fraction >= 0.45) {
    return {
      id: `overlap-watch-${a.sourceIndex}-${b.sourceIndex}`,
      severity: "watch",
      letter: a.cell.letter,
      sourceIndex: a.sourceIndex,
      message: `${a.cell.letter}/${b.cell.letter} overlap occupies ${(fraction * 100).toFixed(0)}% of the smaller AABB. Intersection may still be architectural; verify silhouettes.`,
    };
  }
  return {
    id: `overlap-info-${a.sourceIndex}-${b.sourceIndex}`,
    severity: "info",
    letter: a.cell.letter,
    sourceIndex: a.sourceIndex,
    message: `${a.cell.letter}/${b.cell.letter} intersect modestly (${(fraction * 100).toFixed(0)}% of smaller AABB).`,
  };
}

/**
 * Soft legibility diagnostics for L/U/V architectural generators.
 * Does not hard-reject compositions; callers decide how to present findings.
 */
export function evaluateLetterLegibility(args: {
  placements: CompositionPlacement[];
  thicknessPercent: number;
  selection?: SelectionFieldVolume | null;
  preserveProportions?: boolean;
}): LegibilityReport {
  const findings: LegibilityFinding[] = [];
  const { placements, thicknessPercent } = args;

  if (!placements.length) {
    return {
      findings: [{
        id: "empty",
        severity: "compromised",
        message: "No letter geometry is present. The selection or composition does not contain meaningful L/U/V source solids.",
      }],
      compromisedCount: 1,
      watchCount: 0,
      recognizabilityProxy: 0,
    };
  }

  const relations = new Map<number, PlacementFieldRelation>();
  if (args.selection) {
    for (const item of classifyPlacementsAgainstSelection(placements, args.selection, thicknessPercent)) {
      relations.set(item.placement.sourceIndex, item.relation);
      if (item.relation === "intersecting") {
        findings.push({
          id: `trim-${item.placement.sourceIndex}`,
          severity: "watch",
          letter: item.placement.cell.letter,
          sourceIndex: item.placement.sourceIndex,
          message: `${item.placement.cell.letter} crosses the selection boundary and will be physically trimmed; verify remaining silhouette after Manifold cap.`,
        });
      }
    }
  }

  for (const placement of placements) {
    const bounds = letterWorldBounds(placement, thicknessPercent);
    const deform = deformationRatio(placement);
    if (!args.preserveProportions && deform > 0.35) {
      findings.push({
        id: `deform-${placement.sourceIndex}`,
        severity: deform > 0.6 ? "compromised" : "watch",
        letter: placement.cell.letter,
        sourceIndex: placement.sourceIndex,
        message: `${placement.cell.letter} axis scales differ by ${(deform * 100).toFixed(0)}%. Letter proportions are deformed.`,
      });
    }
    const aspect = featureAspectWatch(placement, bounds);
    if (aspect) findings.push(aspect);

    const footprint = letterFootprintFeet(placement.scale);
    if (footprint < 2) {
      findings.push({
        id: `tiny-${placement.sourceIndex}`,
        severity: "watch",
        letter: placement.cell.letter,
        sourceIndex: placement.sourceIndex,
        message: `${placement.cell.letter} plan footprint is only ${footprint.toFixed(2)} ft; architectural legibility may be weak at building scale.`,
      });
    }
  }

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const finding = overlapSeverity(placements[i], placements[j], thicknessPercent);
      if (finding) findings.push(finding);
    }
  }

  const sizes = placements.map((placement) => letterFootprintFeet(placement.scale));
  if (sizes.length >= 2) {
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    if (max > min * 3 + 1e-6) {
      findings.push({
        id: "size-disparity",
        severity: "watch",
        message: `Letter footprints range from ${min.toFixed(1)} to ${max.toFixed(1)} ft. Large size disparity can dominate smaller glyphs; confirm intentional hierarchy.`,
      });
    }
  }

  const compromisedCount = findings.filter((item) => item.severity === "compromised").length;
  const watchCount = findings.filter((item) => item.severity === "watch").length;
  const recognizabilityProxy = Math.max(0, Math.min(1, 1 - compromisedCount * 0.25 - watchCount * 0.05));
  return { findings, compromisedCount, watchCount, recognizabilityProxy };
}

export function summarizeLegibility(report: LegibilityReport): string {
  if (!report.findings.length) return "No legibility concerns flagged.";
  const top = report.findings
    .filter((item) => item.severity !== "info")
    .slice(0, 4)
    .map((item) => item.message);
  if (!top.length) return `${report.findings.length} informational intersection notes; no watch/compromised flags.`;
  return top.join(" ");
}
