/**
 * Optional instrumentation for Site Development placement performance.
 * Counters are process-local and only active when a profile object is supplied.
 */

export type PlacementProfileBucket =
  | "candidateGeneration"
  | "polygonContainment"
  | "occupancyTransform"
  | "narrowCollision"
  | "rotationSearch"
  | "clusterAssignment"
  | "coverageUnion"
  | "repacking"
  | "diagnostics"
  | "scoreCandidate"
  | "tryPlace"
  | "boundaryEval"
  | "clearanceEval"
  | "maskKeyBuild"
  | "maskDistance";

export type PlacementProfile = {
  timingsMs: Partial<Record<PlacementProfileBucket, number>>;
  counts: Partial<Record<string, number>>;
  mark: (bucket: PlacementProfileBucket, ms: number) => void;
  count: (key: string, delta?: number) => void;
  time: <T>(bucket: PlacementProfileBucket, fn: () => T) => T;
  toJSON: () => { timingsMs: Record<string, number>; counts: Record<string, number> };
};

export function createPlacementProfile(): PlacementProfile {
  const timingsMs: Partial<Record<PlacementProfileBucket, number>> = {};
  const counts: Record<string, number> = {};
  const mark = (bucket: PlacementProfileBucket, ms: number) => {
    timingsMs[bucket] = (timingsMs[bucket] ?? 0) + ms;
  };
  const count = (key: string, delta = 1) => {
    counts[key] = (counts[key] ?? 0) + delta;
  };
  const time = <T,>(bucket: PlacementProfileBucket, fn: () => T): T => {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      mark(bucket, performance.now() - t0);
      count(bucket, 1);
    }
  };
  return {
    timingsMs,
    counts,
    mark,
    count,
    time,
    toJSON: () => ({
      timingsMs: Object.fromEntries(
        Object.entries(timingsMs).map(([k, v]) => [k, Number((v ?? 0).toFixed(3))]),
      ),
      counts: { ...counts },
    }),
  };
}

export function resetPlacementProfile(profile: PlacementProfile) {
  for (const key of Object.keys(profile.timingsMs)) delete profile.timingsMs[key as PlacementProfileBucket];
  for (const key of Object.keys(profile.counts)) delete profile.counts[key];
}

/** Generation stage: initial = fast valid pack; refinement = budgeted improve; extended = opt-in. */
export type OptimizationStage = "initial" | "refinement" | "extended";

/** Multi-objective bias for architectural alternatives (hard constraints always apply). */
export type ObjectiveMode = "balanced" | "max-coverage" | "max-quantity" | "max-clusters";

export function optimizationBudgets(stage: OptimizationStage) {
  if (stage === "initial") {
    return {
      evaluationBudget: 4000,
      maxRepack: 0,
      useDenseRepackPool: false,
      yawAlternateBudgetFactor: 4,
    };
  }
  if (stage === "extended") {
    return {
      evaluationBudget: 28000,
      maxRepack: 20,
      useDenseRepackPool: true,
      yawAlternateBudgetFactor: 12,
    };
  }
  return {
    evaluationBudget: 10000,
    maxRepack: 8,
    useDenseRepackPool: true,
    yawAlternateBudgetFactor: 8,
  };
}
