import { DEFAULT_EVALUATION_BUDGET } from "./capacity";
import { normalizeGenerationMode } from "./generationScope";
import { normalizeProtoFormSourceMode } from "./protoFormSource";
import { normalizeOrientationMode } from "./orientation";
import { SITE_DEVELOPMENT_VERSION, emptyProject, type ClusterZone, type DistributionMode, type GenerationAlternative, type SiteDevelopmentProject } from "./types";

export const SITE_DEVELOPMENT_SESSION_KEY = "vul-site-development-v1";
/** Last known non-empty session — written before each overwrite so a bad hydrate cannot erase recoverable geometry. */
export const SITE_DEVELOPMENT_SESSION_BACKUP_KEY = "vul-site-development-v1-backup";

function normalizeDistributionMode(mode: string | null | undefined): DistributionMode {
  if (mode === "waterfront" || mode === "roadway-buffer" || mode === "custom-anchors" || mode === "hybrid" || mode === "balanced") return mode;
  return "balanced";
}

function hydrateZone(zone: ClusterZone): ClusterZone {
  return {
    ...zone,
    enabled: zone.enabled !== false,
    visible: zone.visible !== false,
    quantityMode: zone.quantityMode ?? "manual",
    targetCount: Number.isFinite(zone.targetCount) ? zone.targetCount : 4,
    targetCoveragePercent: Number.isFinite(zone.targetCoveragePercent) ? zone.targetCoveragePercent : 25,
    targetGrossFloorArea: Number.isFinite(zone.targetGrossFloorArea) ? zone.targetGrossFloorArea : 0,
    minCount: Number.isFinite(zone.minCount) ? zone.minCount : 1,
    maxCount: Number.isFinite(zone.maxCount) ? zone.maxCount : 120,
    // Legacy: retained for saved-project compatibility only. Generation ignores density.
    density: Number.isFinite(zone.density) ? zone.density : 0.45,
    dispersionPercent: Number.isFinite(zone.dispersionPercent) ? zone.dispersionPercent : 55,
    preferredClusterCount: Number.isFinite(zone.preferredClusterCount) ? zone.preferredClusterCount : 3,
    concentrationPercent: Number.isFinite(zone.concentrationPercent) ? zone.concentrationPercent : 55,
    typologyDiversityPercent: Number.isFinite(zone.typologyDiversityPercent) ? zone.typologyDiversityPercent : 45,
    representAllTypologies: zone.representAllTypologies === true,
    distributionMode: normalizeDistributionMode(zone.distributionMode),
    minSpacingFeet: Number.isFinite(zone.minSpacingFeet) ? zone.minSpacingFeet : 20,
    minEdgeClearanceFeet: Number.isFinite(zone.minEdgeClearanceFeet)
      ? Math.max(0, zone.minEdgeClearanceFeet)
      : Math.max(0, (Number.isFinite(zone.minSpacingFeet) ? zone.minSpacingFeet : 20) - 20),
    clusterSeparationFeet: Number.isFinite(zone.clusterSeparationFeet) ? Math.max(0, zone.clusterSeparationFeet) : 40,
    crossZoneSeparationFeet: Number.isFinite(zone.crossZoneSeparationFeet) ? Math.max(0, zone.crossZoneSeparationFeet) : 0,
    connectionToleranceFeet: Number.isFinite(zone.connectionToleranceFeet) ? Math.max(0, zone.connectionToleranceFeet) : 0,
    preferredYawDeg: Number.isFinite(zone.preferredYawDeg) ? zone.preferredYawDeg : 0,
    orientationMode: normalizeOrientationMode(zone.orientationMode),
    lockPreferredYaw: zone.lockPreferredYaw === true,
    orientationFine45: zone.orientationFine45 === true,
    elevationOffsetFeet: Number.isFinite(zone.elevationOffsetFeet) ? zone.elevationOffsetFeet : 0,
  };
}

function reconcileHardPassed(item: GenerationAlternative): boolean {
  const collisionTotal = (item.zoneStats ?? []).reduce((sum, stats) => sum + (stats.destructiveCollisions ?? 0), 0);
  const boundaryTotal = (item.zoneStats ?? []).reduce((sum, stats) => sum + (stats.boundaryViolations ?? 0), 0);
  const assemblyHard = (item.assemblyReport?.feasibilityFailures ?? []).filter((failure) => (
    failure.category === "collision"
    || failure.category === "site-boundary"
    || failure.category === "height"
  ));
  if (collisionTotal > 0 || boundaryTotal > 0 || assemblyHard.length > 0) return false;
  if (!(item.clusters ?? []).length) return false;
  const hardFindings = (item.findings ?? []).filter((finding) => (
    finding.kind === "hard" && finding.category !== "source-fidelity"
  ));
  if (hardFindings.some((finding) => !finding.passed)) return false;
  return hardFindings.length ? hardFindings.every((finding) => finding.passed) : item.hardPassed !== false;
}

function hydrateAlternative(item: GenerationAlternative): GenerationAlternative {
  const zoneStats = (item.zoneStats ?? []).map((stats) => ({
    ...stats,
    targetGrossFloorArea: stats.targetGrossFloorArea ?? 0,
    estimatedGrossFloorArea: stats.estimatedGrossFloorArea ?? 0,
    targetFootprintArea: stats.targetFootprintArea ?? (stats.usableArea ?? 0) * ((stats.targetCoverage ?? 0) / 100),
    achievedFootprintArea: stats.achievedFootprintArea ?? 0,
    collisionEnvelopeArea: stats.collisionEnvelopeArea ?? stats.achievedFootprintArea ?? 0,
    registrationBayFootprintArea: stats.registrationBayFootprintArea ?? 0,
    coverageShortfallArea: stats.coverageShortfallArea
      ?? Math.max(0, ((stats.usableArea ?? 0) * ((stats.targetCoverage ?? 0) / 100)) - (stats.achievedFootprintArea ?? 0)),
    meanSourceFootprintArea: stats.meanSourceFootprintArea ?? 400,
    meanCollisionEnvelopeArea: stats.meanCollisionEnvelopeArea ?? stats.meanSourceFootprintArea ?? 400,
    footprintMethod: stats.footprintMethod ?? "legacy / unknown",
    quantityMode: stats.quantityMode ?? "manual",
    preferredClusters: stats.preferredClusters ?? stats.architecturalClusters ?? 0,
    architecturalClusters: stats.architecturalClusters ?? 0,
    meanNearestNeighbor: stats.meanNearestNeighbor ?? 0,
    dispersionSpread: stats.dispersionSpread ?? 0,
    measuredMinEdgeClearance: stats.measuredMinEdgeClearance ?? null,
    destructiveCollisions: stats.destructiveCollisions ?? 0,
    boundaryViolations: stats.boundaryViolations ?? 0,
    verifiedClearances: stats.verifiedClearances ?? 0,
    estimatedClearances: stats.estimatedClearances ?? 0,
    typologyCounts: stats.typologyCounts ?? {},
    typologyQuotas: stats.typologyQuotas ?? {},
    typologyRequestedPercent: stats.typologyRequestedPercent ?? {},
    typologyAchievedPercent: stats.typologyAchievedPercent ?? {},
    rejectBreakdown: stats.rejectBreakdown ?? {},
    orientationAdjustedCount: stats.orientationAdjustedCount ?? 0,
    orientationMode: stats.orientationMode ?? "fixed",
    repackAttempts: stats.repackAttempts ?? 0,
    repackImprovements: stats.repackImprovements ?? 0,
    optimizationStage: stats.optimizationStage ?? "refinement",
    objectiveMode: stats.objectiveMode ?? "balanced",
    generationTimeMs: stats.generationTimeMs ?? 0,
    evaluationCount: stats.evaluationCount ?? 0,
    budgetUtilization: stats.budgetUtilization ?? 0,
    stopReason: stats.stopReason ?? null,
  }));
  const assemblyReport = item.assemblyReport ?? null;
  const missingMeshIds = new Set(
    (item.sourceFidelity?.rows ?? [])
      .filter((row) => !row.available)
      .map((row) => row.meshId),
  );
  // Stale results that referenced unresolved sample/supplement IDs must not silently pass.
  const inferredMissing = (item.clusters ?? []).some((cluster) => (
    typeof cluster.meshId === "string"
    && (cluster.meshId.startsWith("mesh-1-") || cluster.meshId.startsWith("mesh-2-") || cluster.meshId.startsWith("mesh-3-"))
    && item.protoFormSource === "active-lattice"
    && item.sourceFidelityPassed !== true
  ));
  const sourceFidelityPassed = item.sourceFidelity
    ? item.sourceFidelity.passed && missingMeshIds.size === 0
    : item.sourceFidelityPassed === true
      ? true
      : inferredMissing
        ? false
        : item.sourceFidelityPassed !== false && !inferredMissing;
  const needsRepair = item.sourceFidelity ? !item.sourceFidelity.passed : inferredMissing || item.sourceFidelityPassed === false;
  const clusters = (item.clusters ?? []).map((cluster) => ({
    ...cluster,
    yawDeg: Number.isFinite(cluster.yawDeg) ? cluster.yawDeg : 0,
    yawAdjustedFromPreferred: cluster.yawAdjustedFromPreferred === true,
  }));
  const base: GenerationAlternative = {
    ...item,
    placementKind: item.placementKind === "spatially-grouped" || item.placementKind === "lattice-connected-assembly"
      ? item.placementKind
      : "site-placement",
    zoneStats,
    scope: item.scope ?? {
      mode: "enabled-zones",
      selectedZoneId: null,
      participatingZoneIds: [...new Set((item.clusters ?? []).map((cluster) => cluster.zoneId))],
      participatingZoneNames: [],
    },
    protoFormSource: normalizeProtoFormSourceMode(item.protoFormSource),
    sourceLabels: item.sourceLabels ?? [],
    distributionMode: normalizeDistributionMode(item.distributionMode),
    assemblyReport,
    assemblyConnectors: item.assemblyConnectors ?? [],
    stale: item.stale === true || needsRepair,
    staleReason: needsRepair
      ? (item.staleReason ?? "Source fidelity failed — regenerate after repairing typology bindings. Unresolved mesh IDs are not remapped silently.")
      : item.staleReason ?? null,
    sourceFidelityPassed,
    sourceFidelity: item.sourceFidelity ?? null,
    clusters: clusters.map((cluster) => ({
      ...cluster,
      architecturalClusterId: cluster.architecturalClusterId ?? null,
    })),
  };
  return {
    ...base,
    hardPassed: reconcileHardPassed(base),
  };
}

export function serializeProject(project: SiteDevelopmentProject): string {
  return JSON.stringify({ ...project, version: SITE_DEVELOPMENT_VERSION, savedAt: new Date().toISOString() }, null, 2);
}

export function parseProject(raw: string): SiteDevelopmentProject {
  const data = JSON.parse(raw) as SiteDevelopmentProject;
  if (!data || typeof data !== "object") throw new Error("Site Development project JSON is not an object.");
  if (data.version !== SITE_DEVELOPMENT_VERSION) throw new Error(`Unsupported project version ${String((data as { version?: unknown }).version)}.`);
  const base = emptyProject(data.name || "Untitled site");
  return {
    ...base,
    ...data,
    generationMode: normalizeGenerationMode(data.generationMode),
    protoFormSource: normalizeProtoFormSourceMode(data.protoFormSource),
    pinnedProtoForms: data.pinnedProtoForms ?? [],
    typologyBindings: Array.isArray(data.typologyBindings) ? data.typologyBindings : [],
    evaluationBudget: Number.isFinite(data.evaluationBudget) ? data.evaluationBudget : DEFAULT_EVALUATION_BUDGET,
    coordinates: { ...base.coordinates, ...data.coordinates },
    import: { ...base.import, ...data.import },
    constraints: { ...base.constraints, ...data.constraints },
    zones: (data.zones ?? []).map(hydrateZone),
    exclusions: (data.exclusions ?? []).map(hydrateZone),
    anchors: data.anchors ?? [],
    corridors: data.corridors ?? [],
    arrivals: data.arrivals ?? [],
    alternatives: (data.alternatives ?? []).map(hydrateAlternative),
  };
}

export function tryParseProject(raw: string): { ok: true; project: SiteDevelopmentProject } | { ok: false; error: string } {
  try {
    return { ok: true, project: parseProject(raw) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * True when a persist would replace a stored project that still has development zones
 * with an empty-zone project. Used to block the hydrate-race empty overwrite.
 */
export function shouldBlockEmptyZoneOverwrite(
  existingZoneCount: number,
  nextZoneCount: number,
  allowClearZones = false,
): boolean {
  return existingZoneCount > 0 && nextZoneCount === 0 && !allowClearZones;
}

let observedSession: string | null | undefined;
export function readProjectSession(): SiteDevelopmentProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SITE_DEVELOPMENT_SESSION_KEY);
    observedSession = raw;
    if (raw) {
      const parsed = tryParseProject(raw);
      if (parsed.ok) return parsed.project;
    }
    const backup = window.localStorage.getItem(SITE_DEVELOPMENT_SESSION_BACKUP_KEY);
    if (backup) {
      const parsed = tryParseProject(backup);
      if (parsed.ok) return parsed.project;
    }
    return null;
  } catch {
    return null;
  }
}

export type WriteProjectSessionOptions = {
  /** When true, allow persisting zero zones over a stored non-empty session (explicit user clear). */
  allowClearZones?: boolean;
};

export function writeProjectSession(project: SiteDevelopmentProject, options: WriteProjectSessionOptions = {}) {
  if (typeof window === "undefined") return false;
  try {
    const existingRaw = window.localStorage.getItem(SITE_DEVELOPMENT_SESSION_KEY);
    if (observedSession !== undefined && existingRaw !== observedSession) { console.warn("Site save conflict: newer session retained; export live project before recovery."); return false; }
    let existingZoneCount = 0;
    if (existingRaw) {
      const existing = tryParseProject(existingRaw);
      if (existing.ok) {
        existingZoneCount = existing.project.zones.length;
        if (existingZoneCount > 0) {
          try {
            window.localStorage.setItem(SITE_DEVELOPMENT_SESSION_BACKUP_KEY, existingRaw);
          } catch {
            /* quota — primary write may still succeed */
          }
        }
        if (shouldBlockEmptyZoneOverwrite(existingZoneCount, project.zones.length, options.allowClearZones === true)) {
          return false;
        }
      }
    }
    const serialized = serializeProject(project);
    window.localStorage.setItem(SITE_DEVELOPMENT_SESSION_KEY, serialized);
    observedSession = serialized;
    window.dispatchEvent(new Event("luv-site-project-saved"));
    return true;
  } catch {
    return false;
  }
}
