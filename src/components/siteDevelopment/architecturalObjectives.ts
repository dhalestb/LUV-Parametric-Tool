/**
 * Multi-objective evaluation of Site Development alternatives.
 * Hard geometric validity remains mandatory; soft objectives are reported, not collapsed.
 */
import type { GenerationAlternative, ZoneGenerationStats } from "./types";
import type { ObjectiveMode } from "./placementProfile";

export type ObjectiveScores = {
  hardValid: boolean;
  acceptedForms: number;
  requestedForms: number;
  achievedCoverage: number;
  targetCoverage: number;
  architecturalClusters: number;
  preferredClusters: number;
  typologyQuotaFill: number;
  dispersionSpread: number;
  orientationAdjusted: number;
  verifiedClearances: number;
  estimatedClearances: number;
};

export function aggregateObjectiveScores(alternative: GenerationAlternative): ObjectiveScores {
  const stats = alternative.zoneStats ?? [];
  const acceptedForms = stats.reduce((sum, item) => sum + (item.accepted ?? 0), 0);
  const requestedForms = stats.reduce((sum, item) => sum + (item.requested ?? 0), 0);
  const usable = stats.reduce((sum, item) => sum + (item.usableArea ?? 0), 0);
  const achievedCoverage = usable > 0
    ? stats.reduce((sum, item) => sum + (item.achievedCoverage ?? 0) * (item.usableArea ?? 0), 0) / usable
    : (stats[0]?.achievedCoverage ?? 0);
  const targetCoverage = usable > 0
    ? stats.reduce((sum, item) => sum + (item.targetCoverage ?? 0) * (item.usableArea ?? 0), 0) / usable
    : (stats[0]?.targetCoverage ?? 0);
  const preferredClusters = stats.reduce((sum, item) => sum + (item.preferredClusters ?? 0), 0);
  const architecturalClusters = stats.reduce((sum, item) => sum + (item.architecturalClusters ?? 0), 0);
  let quotaNeed = 0;
  let quotaHave = 0;
  for (const item of stats) {
    for (const [id, need] of Object.entries(item.typologyQuotas ?? {})) {
      quotaNeed += need;
      quotaHave += Math.min(need, item.typologyCounts?.[id] ?? 0);
    }
  }
  return {
    hardValid: alternative.hardPassed !== false
      && stats.every((item) => (item.destructiveCollisions ?? 0) === 0 && (item.boundaryViolations ?? 0) === 0),
    acceptedForms,
    requestedForms,
    achievedCoverage,
    targetCoverage: stats[0]?.targetCoverage ?? 0,
    architecturalClusters,
    preferredClusters,
    typologyQuotaFill: quotaNeed > 0 ? quotaHave / quotaNeed : 1,
    dispersionSpread: stats.reduce((sum, item) => sum + (item.dispersionSpread ?? 0), 0) / Math.max(1, stats.length),
    orientationAdjusted: stats.reduce((sum, item) => sum + (item.orientationAdjustedCount ?? 0), 0),
    verifiedClearances: stats.reduce((sum, item) => sum + (item.verifiedClearances ?? 0), 0),
    estimatedClearances: stats.reduce((sum, item) => sum + (item.estimatedClearances ?? 0), 0),
  };
}

export function objectiveModeLabel(mode: ObjectiveMode, scores: ObjectiveScores): string {
  if (mode === "max-coverage") {
    return `Maximum Coverage Alternative (${scores.achievedCoverage.toFixed(1)}% · ${scores.acceptedForms} forms · ${scores.architecturalClusters}/${scores.preferredClusters} clusters)`;
  }
  if (mode === "max-quantity") {
    return `Maximum Form Quantity Alternative (${scores.acceptedForms} forms · ${scores.achievedCoverage.toFixed(1)}% · ${scores.architecturalClusters}/${scores.preferredClusters} clusters)`;
  }
  if (mode === "max-clusters") {
    return `Balanced Architectural Organization Alternative (${scores.architecturalClusters}/${scores.preferredClusters} clusters · ${scores.acceptedForms} forms · ${scores.achievedCoverage.toFixed(1)}%)`;
  }
  return `Balanced Architectural Organization Alternative (${scores.architecturalClusters}/${scores.preferredClusters} clusters · ${scores.acceptedForms} forms · ${scores.achievedCoverage.toFixed(1)}%)`;
}

/**
 * Rank alternatives for a named objective. Hard-invalid alternatives sort last.
 * Does not invent a single scalar that hides tradeoffs — callers retain the set.
 */
export function rankForObjective(alternatives: GenerationAlternative[], mode: ObjectiveMode): GenerationAlternative[] {
  const scored = alternatives.map((item) => ({ item, scores: aggregateObjectiveScores(item) }));
  scored.sort((a, b) => {
    if (a.scores.hardValid !== b.scores.hardValid) return a.scores.hardValid ? -1 : 1;
    if (mode === "max-coverage") {
      return b.scores.achievedCoverage - a.scores.achievedCoverage
        || b.scores.acceptedForms - a.scores.acceptedForms
        || b.scores.architecturalClusters - a.scores.architecturalClusters;
    }
    if (mode === "max-quantity") {
      return b.scores.acceptedForms - a.scores.acceptedForms
        || b.scores.achievedCoverage - a.scores.achievedCoverage
        || b.scores.architecturalClusters - a.scores.architecturalClusters;
    }
    // balanced / max-clusters: prefer meeting preferred cluster count, then quantity, then coverage
    const aClusterGap = Math.abs(a.scores.preferredClusters - a.scores.architecturalClusters);
    const bClusterGap = Math.abs(b.scores.preferredClusters - b.scores.architecturalClusters);
    return aClusterGap - bClusterGap
      || b.scores.typologyQuotaFill - a.scores.typologyQuotaFill
      || b.scores.acceptedForms - a.scores.acceptedForms
      || b.scores.achievedCoverage - a.scores.achievedCoverage;
  });
  return scored.map((row) => row.item);
}

export function summarizeTradeoffs(alternatives: GenerationAlternative[]): string[] {
  const notes: string[] = [];
  const rows = alternatives.map((item) => ({
    id: item.id,
    label: item.label,
    scores: aggregateObjectiveScores(item),
  }));
  if (rows.length < 2) return notes;
  const byCoverage = [...rows].sort((a, b) => b.scores.achievedCoverage - a.scores.achievedCoverage)[0];
  const byQuantity = [...rows].sort((a, b) => b.scores.acceptedForms - a.scores.acceptedForms)[0];
  const byClusters = [...rows].sort((a, b) => {
    const ag = Math.abs(a.scores.preferredClusters - a.scores.architecturalClusters);
    const bg = Math.abs(b.scores.preferredClusters - b.scores.architecturalClusters);
    return ag - bg || b.scores.architecturalClusters - a.scores.architecturalClusters;
  })[0];
  if (byCoverage.id !== byClusters.id) {
    notes.push(
      `Tradeoff: ${byCoverage.id} maximizes coverage (${byCoverage.scores.achievedCoverage.toFixed(1)}%, `
      + `${byCoverage.scores.architecturalClusters}/${byCoverage.scores.preferredClusters} clusters) while `
      + `${byClusters.id} better matches preferred clusters `
      + `(${byClusters.scores.architecturalClusters}/${byClusters.scores.preferredClusters}, `
      + `${byClusters.scores.achievedCoverage.toFixed(1)}% coverage).`,
    );
  }
  if (byQuantity.id !== byCoverage.id) {
    notes.push(
      `Tradeoff: ${byQuantity.id} places ${byQuantity.scores.acceptedForms} forms vs `
      + `${byCoverage.id} at ${byCoverage.scores.achievedCoverage.toFixed(1)}% coverage.`,
    );
  }
  return notes;
}

export function zoneStatSnapshot(stats: ZoneGenerationStats | undefined) {
  if (!stats) return null;
  return {
    accepted: stats.accepted,
    requested: stats.requested,
    coverage: stats.achievedCoverage,
    clusters: `${stats.architecturalClusters}/${stats.preferredClusters}`,
    verified: stats.verifiedClearances ?? 0,
    estimated: stats.estimatedClearances ?? 0,
    repack: `${stats.repackImprovements ?? 0}/${stats.repackAttempts ?? 0}`,
  };
}
