import { LATTICE_FEET } from "../lattice/types";
import {
  ARCHITECTURAL_FOOTPRINT_METHOD,
  architecturalFootprintUnionArea,
  meanArchitecturalFootprintArea,
  syntheticBoxFootprintMask,
  type ArchitecturalFootprintMask,
} from "./architecturalFootprint";
// ArchitecturalFootprintMask is used for per-form occupancy in geometry-aware clearance.
import {
  ABSOLUTE_FORM_SAFETY_CEILING,
  candidateStep,
  COVERAGE_TOLERANCE_PERCENT,
  coverageGfaCompatibility,
  estimateGrossFloorArea,
  estimateLevels,
  footprintUnionArea,
  meanPlanFootprintArea,
  MAX_PLACEMENT_CANDIDATES,
  registrationBayUnionArea,
  resolvedClusterSeparationFeet,
  resolvedCrossZoneSeparationFeet,
  resolvedEdgeClearanceFeet,
  resolvedTargetCount,
  targetFootprintArea,
  usableZoneArea,
} from "./capacity";
import { resolveParticipatingZones } from "./generationScope";
import {
  bayFootprint,
  footprintPermitted,
  orientedPlanEnvelope,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  rectanglePolygon,
  type Point,
  type Polygon,
} from "./geometry";
import {
  allocateTypologyQuotas,
  expandQuotaSequence,
  nextTypologyFromQuotas,
  normalizeWeights,
  slotForTypology,
  unmetRepresentAll,
} from "./hybridization";
import {
  assignSeedIndex,
  candidatesInside,
  concentrationRadiusFeet,
  countArchitecturalClusters,
  dispersionAwareSeeds2D,
  dispersionSpreadFeet,
  farthestPointSeeds2D,
  filterCandidatesNearSeed,
  measureDispersion,
  scoreSiteCandidate,
} from "./siteDistribution";
import { resolveYawCandidates, yawDeviatesFromPreferred } from "./orientation";
import {
  areaBasedFormCapacity,
  clearPlacementGeometryCaches,
  evaluatePlacementBoundary,
  evaluatePlacementClearance,
  refineEstimatedClearance,
  setPlacementGeometryProfile,
  type PlacementPose,
} from "./placementGeometry";
import {
  optimizationBudgets,
  type ObjectiveMode,
  type OptimizationStage,
  type PlacementProfile,
} from "./placementProfile";
import { aggregateObjectiveScores, objectiveModeLabel } from "./architecturalObjectives";
import type {
  ClusterZone,
  DistributionMode,
  GenerationAlternative,
  GenerationMode,
  OrientationMode,
  PlacementAnchor,
  PlacementKind,
  ProtoFormSourceMode,
  SiteCluster,
  SiteConstraints,
  SiteTypologyId,
  ViewCorridor,
  ZoneGenerationStats,
} from "./types";
import { evaluateAlternative } from "./evaluation";
import type { SiteSurfaceSampler } from "./siteSurface";
import { verticalHybridOffsetFeet } from "./siteSurface";

export type ClusterSource = {
  meshId: string;
  slotId: string | null;
  filename?: string;
  /** Collision / clearance envelope extents (ft) from registered OBJ AABB — never smaller than the 20 ft bay. */
  planWidthFeet?: number;
  planDepthFeet?: number;
  /** Mesh plan-occupancy area (ft²) for coverage / automatic quantity. */
  architecturalFootprintAreaFeet?: number;
  /** Registered local occupancy mask — required for precise coverage union when available. */
  footprintMask?: ArchitecturalFootprintMask;
};

function resolveSourceMask(source: ClusterSource | undefined): ArchitecturalFootprintMask {
  if (source?.footprintMask) return source.footprintMask;
  const width = Math.max(LATTICE_FEET, source?.planWidthFeet ?? LATTICE_FEET);
  const depth = Math.max(LATTICE_FEET, source?.planDepthFeet ?? LATTICE_FEET);
  return syntheticBoxFootprintMask({
    meshId: source?.meshId ?? "envelope-fallback",
    widthFeet: width,
    depthFeet: depth,
    filename: source?.filename,
  });
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function permittedRegions(mode: GenerationMode, zones: ClusterZone[], suggested: Polygon | null): Polygon[] {
  if (mode === "entire-site") {
    return suggested
      ? [suggested]
      : zones.filter((zone) => zone.kind === "zone").map((zone) => zone.polygon);
  }
  return zones.filter((zone) => zone.kind === "zone").map((zone) => zone.polygon);
}

export function generateSiteClusters(options: {
  zones: ClusterZone[];
  exclusions: ClusterZone[];
  sources: ClusterSource[];
  water: Point[];
  roads: Point[];
  corridors: ViewCorridor[];
  anchors: PlacementAnchor[];
  suggested: Polygon | null;
  constraints: SiteConstraints;
  mode: GenerationMode;
  selectedZoneId?: string | null;
  protoFormSource?: ProtoFormSourceMode;
  sourceLabels?: string[];
  distributionMode?: DistributionMode;
  evaluationBudget?: number;
  seed: number;
  label: string;
  alternativeId: string;
  /** Forms from other zones to preserve and test for cross-zone clearance (enabled-zones / multi-zone only). */
  existingClusters?: SiteCluster[];
  /** Site-surface foundation sampler (Site/gold layer only). */
  surfaceSampler?: SiteSurfaceSampler | null;
  /** Optional performance instrumentation. */
  placementProfile?: PlacementProfile | null;
  /**
   * Progressive optimization stage.
   * initial = valid pack without expensive repack; refinement = default budgeted improve;
   * extended = opt-in deeper search.
   */
  optimizationStage?: OptimizationStage;
  /** Multi-objective search bias (hard constraints always apply). */
  objectiveMode?: ObjectiveMode;
  /** Cooperative cancellation — when true, keep best valid pack found so far. */
  cancelled?: () => boolean;
}): GenerationAlternative {
  const random = mulberry32(options.seed);
  const exclusions = options.exclusions.map((zone) => zone.polygon);
  const notes: string[] = [];
  const optimizationStage: OptimizationStage = options.optimizationStage ?? "refinement";
  const objectiveMode: ObjectiveMode = options.objectiveMode ?? "balanced";
  const stageBudget = optimizationBudgets(optimizationStage);
  const profile = options.placementProfile ?? null;
  setPlacementGeometryProfile(profile);
  clearPlacementGeometryCaches();
  // Selected Zone Only must not mix prior entire-site / other-zone geometry into the active result.
  const preserveOthers = options.mode !== "selected-zone-only" && options.mode !== "entire-site" && options.mode !== "hybrid-site";
  const clusters: SiteCluster[] = preserveOthers ? [...(options.existingClusters ?? [])] : [];
  if (options.mode === "selected-zone-only" && (options.existingClusters?.length ?? 0) > 0) {
    notes.push("Selected Zone Only replaces the active result for the selected polygon; other-zone geometry was not carried into this alternative.");
  }
  if (options.surfaceSampler?.uncertain) {
    notes.push(options.surfaceSampler.sample(0, 0).reason);
  }
  notes.push(`Optimization stage: ${optimizationStage}. Objective bias: ${objectiveMode}.`);
  type OccupiedForm = {
    x: number;
    z: number;
    yawDeg: number;
    bayFeet: number;
    zoneId: string;
    architecturalClusterId: number | null;
    outline: Polygon;
    widthFeet: number;
    depthFeet: number;
    elevation: number;
    heightFeet: number;
    mask: ArchitecturalFootprintMask | null;
  };
  const occupied: OccupiedForm[] = clusters.map((cluster) => {
    const source = options.sources.find((item) => item.meshId === cluster.meshId);
    const widthFeet = Math.max(LATTICE_FEET, source?.planWidthFeet ?? cluster.bayFeet);
    const depthFeet = Math.max(LATTICE_FEET, source?.planDepthFeet ?? cluster.bayFeet);
    return {
      x: cluster.x,
      z: cluster.z,
      yawDeg: cluster.yawDeg,
      bayFeet: cluster.bayFeet,
      zoneId: cluster.zoneId,
      architecturalClusterId: cluster.architecturalClusterId,
      outline: orientedPlanEnvelope(cluster.x, cluster.z, widthFeet, depthFeet, cluster.yawDeg),
      widthFeet,
      depthFeet,
      elevation: cluster.elevation,
      heightFeet: LATTICE_FEET,
      mask: resolveSourceMask(source),
    };
  });
  const zoneById = new Map(options.zones.map((zone) => [zone.id, zone]));
  const zoneStats: ZoneGenerationStats[] = [];
  const evalBudget = Math.max(
    500,
    options.evaluationBudget ?? stageBudget.evaluationBudget,
  );
  const participation = resolveParticipatingZones({
    zones: options.zones,
    mode: options.mode,
    selectedZoneId: options.selectedZoneId ?? null,
  });
  notes.push(...participation.notes);
  notes.push("Result classification: site placement / spatially grouped proto forms. Lattice searchAssemblies are not run. Local connector synthesis is applied afterward by latticeAssemblyAdapter when TileModels are available. This is not a completed building.");

  const placeInZone = (zone: ClusterZone, region: Polygon, indexHint = 0) => {
    const zoneStarted = performance.now();
    profile?.count("zones");
    const usable = usableZoneArea(region, exclusions);
    const selectedSlots = new Set(zone.typologies.map((item) => slotForTypology(item.id)).filter(Boolean) as string[]);
    const zoneSources = options.sources.filter((source) => !selectedSlots.size || (source.slotId && selectedSlots.has(source.slotId)));
    const sourcePool = zoneSources.length ? zoneSources : options.sources;
    const meanFootprint = meanArchitecturalFootprintArea(sourcePool);
    const meanEnvelope = meanPlanFootprintArea(sourcePool);
    const targetFootprint = targetFootprintArea(usable, zone.targetCoveragePercent);
    const hasMeshMasks = sourcePool.some((source) => !!source.footprintMask);
    const footprintMethodLabel = hasMeshMasks
      ? ARCHITECTURAL_FOOTPRINT_METHOD
      : "envelope fallback (no mesh mask) — rectangular registered W×D used as occupancy estimate";
    const initialTarget = Math.min(
      resolvedTargetCount(zone, exclusions, options.sources, (id) => slotForTypology(id as SiteTypologyId)),
      ABSOLUTE_FORM_SAFETY_CEILING,
    );
    // Automatic: may grow toward coverage; Manual: hard cap at requested count.
    let target = initialTarget;
    const maxAutoForms = zone.quantityMode === "automatic"
      ? Math.min(ABSOLUTE_FORM_SAFETY_CEILING, Number.isFinite(zone.maxCount) && zone.maxCount > 0 ? zone.maxCount : ABSOLUTE_FORM_SAFETY_CEILING)
      : initialTarget;
    const compatibility = coverageGfaCompatibility(zone, exclusions, zoneSources.length ? zoneSources : options.sources);
    compatibility.notes.forEach((note) => notes.push(`Zone ${zone.name}: ${note}`));
    const planSpan = sourcePool.reduce((max, source) => (
      Math.max(max, source.planWidthFeet ?? LATTICE_FEET, source.planDepthFeet ?? LATTICE_FEET)
    ), LATTICE_FEET);
    // Automatic coverage packing benefits from a denser grid on refinement/extended only.
    // Initial stage keeps a coarser grid for responsiveness; Manual stays regression-stable.
    const stepBase = candidateStep(zone, region, planSpan);
    const autoDense = zone.quantityMode === "automatic" && optimizationStage !== "initial";
    const step = autoDense ? Math.max(8, stepBase * 0.72) : stepBase;
    const availableSlots = new Set(
      options.sources.map((source) => source.slotId).filter((slot): slot is string => !!slot && (!selectedSlots.size || selectedSlots.has(slot))),
    );
    const emptyStats = (stop: string, requested = initialTarget): ZoneGenerationStats => ({
      zoneId: zone.id,
      zoneName: zone.name,
      requested,
      accepted: 0,
      rejected: 0,
      candidates: 0,
      targetCoverage: zone.targetCoveragePercent,
      achievedCoverage: 0,
      targetFootprintArea: targetFootprint,
      achievedFootprintArea: 0,
      collisionEnvelopeArea: 0,
      registrationBayFootprintArea: 0,
      coverageShortfallArea: targetFootprint,
      meanSourceFootprintArea: meanFootprint,
      meanCollisionEnvelopeArea: meanEnvelope,
      footprintMethod: footprintMethodLabel,
      quantityMode: zone.quantityMode,
      targetGrossFloorArea: zone.targetGrossFloorArea ?? 0,
      estimatedGrossFloorArea: 0,
      usableArea: usable,
      preferredClusters: Math.max(1, Math.round(zone.preferredClusterCount || 1)),
      architecturalClusters: 0,
      meanNearestNeighbor: 0,
      dispersionSpread: 0,
      measuredMinEdgeClearance: null,
      destructiveCollisions: 0,
      boundaryViolations: 0,
      verifiedClearances: 0,
      estimatedClearances: 0,
      typologyCounts: {},
      typologyQuotas: {},
      typologyRequestedPercent: Object.fromEntries(normalizeWeights(zone.typologies).map((item) => [item.id, item.weight])),
      typologyAchievedPercent: {},
      rejectBreakdown: {},
      repackAttempts: 0,
      repackImprovements: 0,
      stopReason: stop,
      budgetExhausted: false,
    });
    if (selectedSlots.size && ![...selectedSlots].some((slot) => availableSlots.has(slot))) {
      const stop = `No proto-form OBJs for selected typology slots ${[...selectedSlots].join(", ")}.`;
      notes.push(`Zone ${zone.name}: ${stop}`);
      zoneStats.push(emptyStats(stop));
      return;
    }
    // Candidate centers must clear half the authentic collision envelope — not only the 20 ft bay.
    const inset = Math.max(LATTICE_FEET / 2 + 0.5, planSpan / 2 + 0.5);
    const pool = candidatesInside(region, exclusions, step, inset).slice(0, MAX_PLACEMENT_CANDIDATES);
    const preferredClusters = Math.max(1, Math.round(zone.preferredClusterCount || 1));
    const seedStart = Math.floor(random() * Math.max(1, pool.length));
    const dispersionPercent = zone.dispersionPercent ?? 55;
    const seeds = dispersionAwareSeeds2D(pool, preferredClusters, seedStart, dispersionPercent);
    // Blend anchors into seed set when custom-anchors / hybrid.
    if ((zone.distributionMode === "custom-anchors" || zone.distributionMode === "hybrid") && options.anchors.length) {
      for (const anchor of options.anchors) {
        if (anchor.zoneId && anchor.zoneId !== zone.id) continue;
        if (footprintPermitted([anchor.point], [region], exclusions).ok) seeds.unshift(anchor.point);
      }
    }
    const uniqueSeeds = dispersionAwareSeeds2D(
      [...seeds, ...pool].slice(0, Math.max(seeds.length, preferredClusters * 3)),
      preferredClusters,
      0,
      dispersionPercent,
    );
    const radius = concentrationRadiusFeet(zone.concentrationPercent ?? 55, region);
    const distributionMode = options.distributionMode ?? zone.distributionMode ?? "balanced";

    let evals = 0;
    let budgetExhausted = false;
    let rejected = 0;
    const rejectReasons = { spacing: 0, height: 0, footprint: 0, score: 0, source: 0, clusterSep: 0, crossZone: 0 };
    let stopReason: string | null = null;
    const typologyCounts: Partial<Record<SiteTypologyId, number>> = {};
    let typologyQuotas = allocateTypologyQuotas(zone.typologies, target, { representAll: zone.representAllTypologies });
    let typologySequence = expandQuotaSequence(typologyQuotas, normalizeWeights(zone.typologies));
    let typologySequenceIndex = 0;
    const edgeClearance = resolvedEdgeClearanceFeet(zone);
    const clusterSeparation = resolvedClusterSeparationFeet(zone);
    const crossZoneSeparation = resolvedCrossZoneSeparationFeet(zone);
    const perSeedQuota = Math.max(1, Math.ceil(target / Math.max(1, uniqueSeeds.length)));
    const seedCounts = uniqueSeeds.map(() => 0);

    const mustRepresent = zone.representAllTypologies ? unmetRepresentAll(zone.typologies, typologyCounts) : [];
    if (mustRepresent.length > target) {
      notes.push(`Zone ${zone.name}: represent-all requires ${mustRepresent.length} typologies but only ${target} forms are requested.`);
    }

    const measureZoneFootprint = () => {
      const zoneClusters = clusters.filter((cluster) => cluster.zoneId === zone.id);
      return architecturalFootprintUnionArea(zoneClusters.map((cluster) => {
        const source = options.sources.find((item) => item.meshId === cluster.meshId);
        return {
          x: cluster.x,
          z: cluster.z,
          yawDeg: cluster.yawDeg,
          mask: resolveSourceMask(source),
        };
      }));
    };
    const coverageMet = () => {
      if (usable <= 0) return true;
      const achieved = 100 * measureZoneFootprint() / usable;
      return achieved >= zone.targetCoveragePercent - COVERAGE_TOLERANCE_PERCENT;
    };

    const occupiedForScore = () => occupied.map((item) => ({ x: item.x, z: item.z }));
    const orientationMode: OrientationMode = zone.orientationMode ?? "fixed";
    let orientationAdjustedCount = 0;
    let yawEvalBudget = Math.max(24, target * stageBudget.yawAlternateBudgetFactor);

    const poseFromOccupied = (item: OccupiedForm): PlacementPose => ({
      x: item.x,
      z: item.z,
      yawDeg: item.yawDeg,
      widthFeet: item.widthFeet,
      depthFeet: item.depthFeet,
      elevation: item.elevation,
      heightFeet: item.heightFeet,
      mask: item.mask,
      maskCacheKey: item.mask?.meshId ?? null,
    });

    let verifiedClearances = 0;
    let estimatedClearances = 0;
    const clearanceOkForPose = (pose: PlacementPose, seedIndex: number) => {
      let verifiedDelta = 0;
      let estimatedDelta = 0;
      for (const item of occupied) {
        if (item.zoneId !== zone.id) {
          const other = zoneById.get(item.zoneId);
          const required = Math.max(crossZoneSeparation, other ? resolvedCrossZoneSeparationFeet(other) : 0);
          const evalClear = evaluatePlacementClearance(pose, poseFromOccupied(item), required);
          if (!evalClear.ok) {
            rejectReasons.crossZone += 1;
            return false;
          }
          if (evalClear.confidence === "estimated") estimatedDelta += 1;
          else if (evalClear.confidence === "verified") verifiedDelta += 1;
          continue;
        }
        const sameGroup = item.architecturalClusterId === seedIndex;
        const required = sameGroup ? edgeClearance : Math.max(edgeClearance, clusterSeparation);
        const evalClear = evaluatePlacementClearance(pose, poseFromOccupied(item), required);
        if (!evalClear.ok) {
          if (sameGroup) rejectReasons.spacing += 1;
          else rejectReasons.clusterSep += 1;
          return false;
        }
        if (evalClear.confidence === "estimated") estimatedDelta += 1;
        else if (evalClear.confidence === "verified") verifiedDelta += 1;
      }
      verifiedClearances += verifiedDelta;
      estimatedClearances += estimatedDelta;
      return true;
    };

    const tryPlaceAt = (origin: Point, seedIndex: number, forcedTypology: SiteTypologyId | null = null, enforceQuota = true) => {
      if (options.cancelled?.()) {
        budgetExhausted = true;
        return false;
      }
      profile?.count("tryPlace");
      if (clusters.filter((cluster) => cluster.zoneId === zone.id).length >= target) return false;
      if (enforceQuota && seedCounts[seedIndex] >= perSeedQuota && seedCounts.some((count) => count < perSeedQuota)) {
        return false;
      }
      if (zone.maxHeightFeet < LATTICE_FEET) {
        rejected += 1;
        rejectReasons.height += 1;
        return false;
      }
      const placeableWeights = zone.typologies.filter((item) => {
        const slot = slotForTypology(item.id);
        return !!slot && options.sources.some((source) => source.slotId === slot);
      });
      if (!placeableWeights.length) {
        rejected += 1;
        rejectReasons.source += 1;
        stopReason = !zone.typologies.length
          ? "Select at least one typology before generating."
          : "No Lattice protoforms are loaded for the selected typologies.";
        return false;
      }
      const placeableIds = new Set(placeableWeights.map((item) => item.id));
      // Ordered typology attempts: sequence slot → forced → remaining quotas → other placeable types.
      const typologyAttempts: SiteTypologyId[] = [];
      const pushUnique = (id: SiteTypologyId | null | undefined) => {
        if (!id || !placeableIds.has(id) || typologyAttempts.includes(id)) return;
        typologyAttempts.push(id);
      };
      while (typologySequenceIndex < typologySequence.length) {
        const scheduled = typologySequence[typologySequenceIndex];
        if ((typologyCounts[scheduled] ?? 0) < (typologyQuotas[scheduled] ?? 0) && placeableIds.has(scheduled)) {
          pushUnique(scheduled);
          break;
        }
        typologySequenceIndex += 1;
      }
      pushUnique(forcedTypology);
      {
        const probeCounts = { ...typologyCounts };
        for (let guard = 0; guard < placeableIds.size + 2; guard += 1) {
          const next = nextTypologyFromQuotas(typologyQuotas, probeCounts);
          if (!next) break;
          if (placeableIds.has(next)) {
            pushUnique(next);
            probeCounts[next] = (probeCounts[next] ?? 0) + 1;
          } else {
            probeCounts[next] = typologyQuotas[next] ?? 0;
          }
        }
      }
      if (zone.hybridization === "adjacent") {
        const center = polygonCentroid(region);
        const yaw = Math.atan2(origin[1] - center[1], origin[0] - center[0]);
        const slice = (Math.floor(((yaw + Math.PI) / (2 * Math.PI)) * Math.max(1, placeableWeights.length)) + indexHint) % Math.max(1, placeableWeights.length);
        pushUnique(placeableWeights[slice]?.id);
      }
      for (const item of placeableWeights) pushUnique(item.id);

      let placedOk = false;
      for (const typology of typologyAttempts) {
        const slotId = slotForTypology(typology);
        const matchingSources = slotId
          ? options.sources.filter((item) => item.slotId === slotId)
          : [];
        const source = matchingSources.length
          ? matchingSources[Math.floor(random() * matchingSources.length)]
          : null;
        if (!source || !slotId) continue;
        const planW = Math.max(LATTICE_FEET, source.planWidthFeet ?? LATTICE_FEET);
        const planD = Math.max(LATTICE_FEET, source.planDepthFeet ?? LATTICE_FEET);
        const mask = resolveSourceMask(source);
        const surface = options.surfaceSampler?.sample(origin[0], origin[1]);
        const foundationY = surface?.ok ? surface.y : (options.surfaceSampler?.datumY ?? 0);
        let stack = 0;
        if (zone.hybridization === "vertical") {
          const order: SiteTypologyId[] = ["stepped-amphitheater", "void-field-gathering", "linear-edge-gallery", "inserted-horizontal-plate", "contained-room-within-volume"];
          stack = verticalHybridOffsetFeet(Math.max(0, order.indexOf(typology)), zone.floorToFloorFeet);
        }
        const elevation = foundationY + (zone.elevationOffsetFeet ?? 0) + stack;
        const buildingTop = stack + LATTICE_FEET;
        if (buildingTop > zone.maxHeightFeet + 1e-6) {
          rejectReasons.height += 1;
          continue;
        }

        const yawCandidates = resolveYawCandidates({
          mode: orientationMode,
          preferredYawDeg: zone.preferredYawDeg,
          lockPreferredYaw: zone.lockPreferredYaw === true,
          typology,
          enableFine45: zone.orientationFine45 === true && orientationMode !== "fixed",
          maxYawTests: orientationMode === "fixed" ? 1 : 8,
        });

        let chosenYaw: number | null = null;
        let chosenOutline: Polygon | null = null;
        let boundaryRejects = 0;
        let clearanceRejects = 0;
        for (let yawIndex = 0; yawIndex < yawCandidates.length; yawIndex += 1) {
          const yawDeg = yawCandidates[yawIndex];
          const isPrimaryYaw = yawIndex === 0;
          // Always evaluate the first (preferred) yaw. Extra alternates are budget-limited so
          // Automatic/Hybrid cannot starve quantity after burning alternative-yaw tests.
          if (!isPrimaryYaw && yawEvalBudget <= 0) break;
          if (!isPrimaryYaw) yawEvalBudget -= 1;
          const pose: PlacementPose = {
            x: origin[0],
            z: origin[1],
            yawDeg,
            widthFeet: planW,
            depthFeet: planD,
            elevation,
            heightFeet: LATTICE_FEET,
            mask,
            maskCacheKey: source.meshId,
          };
          profile?.count("rotationSearch");
          const boundary = evaluatePlacementBoundary(pose, [region], exclusions);
          if (!boundary.ok) {
            boundaryRejects += 1;
            continue;
          }
          if (!clearanceOkForPose(pose, seedIndex)) {
            clearanceRejects += 1;
            continue;
          }
          chosenYaw = yawDeg;
          chosenOutline = orientedPlanEnvelope(origin[0], origin[1], planW, planD, yawDeg);
          break;
        }
        if (chosenYaw == null || !chosenOutline) {
          if (boundaryRejects && !clearanceRejects) rejectReasons.footprint += 1;
          // clearance rejects already tallied inside clearanceOkForPose
          continue;
        }

        const scored = scoreSiteCandidate({
          zone,
          region,
          origin,
          exclusions,
          water: options.water,
          roads: options.roads,
          corridors: options.corridors,
          anchors: options.anchors,
          mode: distributionMode,
          dispersionPercent: zone.dispersionPercent ?? 50,
          seeds: uniqueSeeds,
          seedIndex,
          occupied: occupiedForScore(),
          preferredYawDeg: chosenYaw,
          spatialWeight: objectiveMode === "max-coverage" || objectiveMode === "max-quantity" ? 0.15 : 1,
        });
        let objectiveBoost = 0;
        if (objectiveMode === "max-clusters" || objectiveMode === "balanced") {
          const underfilled = (seedCounts[seedIndex] ?? 0) < perSeedQuota;
          objectiveBoost += underfilled ? 8 : 0;
          if ((seedCounts[seedIndex] ?? 0) === 0) objectiveBoost += 14;
        }
        if (objectiveMode === "max-coverage" || objectiveMode === "max-quantity") {
          objectiveBoost += (source.architecturalFootprintAreaFeet ?? meanFootprint) / 500;
        }
        if (scored.score + objectiveBoost < -1e5) {
          rejectReasons.score += 1;
          continue;
        }

        const yawAdjusted = yawDeviatesFromPreferred(chosenYaw, zone.preferredYawDeg);
        if (yawAdjusted) orientationAdjustedCount += 1;
        clusters.push(makeCluster(zone, source, typology, origin, elevation, options.alternativeId, seedIndex, chosenYaw, yawAdjusted));
        occupied.push({
          x: origin[0],
          z: origin[1],
          yawDeg: chosenYaw,
          bayFeet: LATTICE_FEET,
          zoneId: zone.id,
          architecturalClusterId: seedIndex,
          outline: chosenOutline,
          widthFeet: planW,
          depthFeet: planD,
          elevation,
          heightFeet: LATTICE_FEET,
          mask,
        });
        seedCounts[seedIndex] = (seedCounts[seedIndex] ?? 0) + 1;
        typologyCounts[typology] = (typologyCounts[typology] ?? 0) + 1;
        if (typologySequence[typologySequenceIndex] === typology) typologySequenceIndex += 1;
        placedOk = true;
        break;
      }
      if (!placedOk) {
        rejected += 1;
        return false;
      }
      return true;
    };

    // Pass 1: one core per architectural-cluster seed (dispersion across the zone).
    for (let seedIndex = 0; seedIndex < uniqueSeeds.length && clusters.filter((c) => c.zoneId === zone.id).length < target; seedIndex += 1) {
      evals += 1;
      if (evals > evalBudget) { budgetExhausted = true; break; }
      tryPlaceAt(uniqueSeeds[seedIndex], seedIndex, mustRepresent[seedIndex] ?? null, false);
    }

    // Pass 2: grow each seed preferring the concentration radius (soft organization preference).
    // If the near-set is too sparse to fill the seed quota, fall back to the full pool so
    // Concentration cannot hard-starve Manual Quantity (Pass 3 also dampens spatial weight).
    for (let seedIndex = 0; seedIndex < uniqueSeeds.length && !budgetExhausted; seedIndex += 1) {
      const preferredNear = filterCandidatesNearSeed(pool, uniqueSeeds[seedIndex], radius);
      const near = preferredNear.length >= Math.max(3, perSeedQuota) ? preferredNear : pool;
      const ranked = near.map((origin) => {
        evals += 1;
        return scoreSiteCandidate({
          zone,
          region,
          origin,
          exclusions,
          water: options.water,
          roads: options.roads,
          corridors: options.corridors,
          anchors: options.anchors,
          mode: distributionMode,
          dispersionPercent: zone.dispersionPercent ?? 50,
          seeds: uniqueSeeds,
          seedIndex,
          occupied: occupiedForScore(),
          preferredYawDeg: zone.preferredYawDeg,
          spatialWeight: 1,
        });
      }).filter((item) => item.score > -1e5).sort((a, b) => b.score - a.score);

      for (const candidate of ranked) {
        if (clusters.filter((cluster) => cluster.zoneId === zone.id).length >= target) break;
        if (zone.quantityMode === "automatic" && coverageMet()) break;
        if (seedCounts[seedIndex] >= perSeedQuota) break;
        if (evals > evalBudget) { budgetExhausted = true; break; }
        const stillNeeded = unmetRepresentAll(zone.typologies, typologyCounts);
        const forced = zone.representAllTypologies && stillNeeded.length ? stillNeeded[0] : null;
        tryPlaceAt(candidate.origin, seedIndex, forced, true);
      }
      if (budgetExhausted) break;
      if (zone.quantityMode === "automatic" && coverageMet()) break;
    }

    // Pass 3: fill remaining quota by under-filled seeds first, then any seed.
    // Spatial prefs are dampened so Dispersion/Concentration guide layout without blocking quantity.
    const fillRemaining = (enforceSeedQuota: boolean, spatialWeight = 0.25) => {
      if (budgetExhausted) return;
      const ranked = pool.map((origin) => {
        evals += 1;
        const seedIndex = assignSeedIndex(origin, uniqueSeeds);
        return {
          ...scoreSiteCandidate({
            zone,
            region,
            origin,
            exclusions,
            water: options.water,
            roads: options.roads,
            corridors: options.corridors,
            anchors: options.anchors,
            mode: distributionMode,
            dispersionPercent: zone.dispersionPercent ?? 50,
            seeds: uniqueSeeds,
            seedIndex,
            occupied: occupiedForScore(),
            preferredYawDeg: zone.preferredYawDeg,
            spatialWeight,
          }),
          seedIndex,
          underfilled: (seedCounts[seedIndex] ?? 0) < perSeedQuota ? 1 : 0,
        };
      }).filter((item) => item.score > -1e5).sort((a, b) => b.underfilled - a.underfilled || b.score - a.score);
      for (const candidate of ranked) {
        if (clusters.filter((cluster) => cluster.zoneId === zone.id).length >= target) break;
        if (zone.quantityMode === "automatic" && coverageMet()) break;
        if (evals > evalBudget) { budgetExhausted = true; break; }
        tryPlaceAt(candidate.origin, candidate.seedIndex, null, enforceSeedQuota);
      }
    };
    fillRemaining(false);

    // Geometry-only recovery: if soft spatial prefs left feasible slots unused, fill without
    // Dispersion/Concentration ranking pressure. Does not change user slider settings.
    const placedAfterSpatial = clusters.filter((cluster) => cluster.zoneId === zone.id).length;
    if (
      !budgetExhausted
      && placedAfterSpatial < target
      && !(zone.quantityMode === "automatic" && coverageMet())
    ) {
      fillRemaining(false, 0);
    }

    // Automatic: extend count while coverage remains below target (manual never exceeds requested).
    if (zone.quantityMode === "automatic" && !budgetExhausted && !coverageMet()) {
      while (
        clusters.filter((cluster) => cluster.zoneId === zone.id).length < maxAutoForms
        && !coverageMet()
        && !budgetExhausted
      ) {
        const before = clusters.filter((cluster) => cluster.zoneId === zone.id).length;
        target = Math.min(maxAutoForms, Math.max(target + 1, before + 1));
        typologyQuotas = allocateTypologyQuotas(zone.typologies, target, { representAll: zone.representAllTypologies });
        typologySequence = expandQuotaSequence(typologyQuotas, normalizeWeights(zone.typologies));
        typologySequenceIndex = Math.min(typologySequenceIndex, typologySequence.length);
        fillRemaining(false, 0);
        const after = clusters.filter((cluster) => cluster.zoneId === zone.id).length;
        if (after <= before) break;
      }
    }

    /**
     * Bounded local repack: when quantity/coverage remain unmet, temporarily remove
     * 1–2 forms, refill with alternate sequences / local offsets / empty-seed priority,
     * and keep improvements only. Does not weaken clearances or allow destructive intersections.
     */
    let repackAttempts = 0;
    let repackImprovements = 0;
    const needsRepack = () => {
      const count = clusters.filter((cluster) => cluster.zoneId === zone.id).length;
      if (zone.quantityMode === "manual") return count < initialTarget;
      return count < target && !coverageMet();
    };
    if (!budgetExhausted && needsRepack() && stageBudget.maxRepack > 0) {
      const maxRepack = Math.min(stageBudget.maxRepack, Math.max(2, Math.floor(initialTarget * 0.5)));
      profile?.count("repacking");
      const repackStarted = performance.now();
      // Denser search only during refinement/extended repack — keeps initial stage fast.
      const denseStep = Math.max(8, step * 0.65);
      const densePool = stageBudget.useDenseRepackPool && denseStep + 1e-6 < step
        ? candidatesInside(region, exclusions, denseStep, inset).slice(0, Math.min(900, MAX_PLACEMENT_CANDIDATES))
        : pool;
      const searchPool = densePool.length >= pool.length ? densePool : pool;
      const snapshotClearance = () => ({ verified: verifiedClearances, estimated: estimatedClearances });
      const neighborPressure = (cluster: SiteCluster) => occupied
        .filter((item) => item.zoneId === zone.id)
        .reduce((sum, item) => {
          const dist = Math.hypot(item.x - cluster.x, item.z - cluster.z);
          return sum + (dist > 1e-6 && dist < LATTICE_FEET * 3 ? 1 : 0);
        }, 0);
      const dropCluster = (removeId: string) => {
        const removed = clusters.find((cluster) => cluster.id === removeId);
        if (!removed) return null;
        for (let i = clusters.length - 1; i >= 0; i -= 1) {
          if (clusters[i].id !== removeId) continue;
          const cluster = clusters[i];
          clusters.splice(i, 1);
          if (cluster.typology) typologyCounts[cluster.typology] = Math.max(0, (typologyCounts[cluster.typology] ?? 1) - 1);
          if (cluster.architecturalClusterId != null) {
            seedCounts[cluster.architecturalClusterId] = Math.max(0, (seedCounts[cluster.architecturalClusterId] ?? 1) - 1);
          }
          if (cluster.yawAdjustedFromPreferred) orientationAdjustedCount = Math.max(0, orientationAdjustedCount - 1);
        }
        for (let i = occupied.length - 1; i >= 0; i -= 1) {
          if (occupied[i].zoneId === zone.id && Math.abs(occupied[i].x - removed.x) < 1e-6 && Math.abs(occupied[i].z - removed.z) < 1e-6) {
            occupied.splice(i, 1);
          }
        }
        return removed;
      };
      const localMicroOrigins = (around: Point): Point[] => {
        const half = denseStep * 0.5;
        const offsets: Point[] = [
          [0, 0], [half, 0], [-half, 0], [0, half], [0, -half],
          [half, half], [half, -half], [-half, half], [-half, -half],
          [denseStep, 0], [-denseStep, 0], [0, denseStep], [0, -denseStep],
          [denseStep * 1.5, 0], [-denseStep * 1.5, 0], [0, denseStep * 1.5], [0, -denseStep * 1.5],
        ];
        return offsets
          .map(([dx, dz]) => [around[0] + dx, around[1] + dz] as Point)
          .filter((origin) => footprintPermitted([origin], [region], exclusions).ok);
      };
      const fillFromSearchPool = () => {
        if (budgetExhausted) return;
        // Cheap prune: prefer underfilled seeds / empty-seed neighborhoods before full scoring.
        const shortlist = searchPool
          .map((origin) => {
            const seedIndex = assignSeedIndex(origin, uniqueSeeds);
            const underfilled = (seedCounts[seedIndex] ?? 0) < perSeedQuota ? 1 : 0;
            const empty = (seedCounts[seedIndex] ?? 0) === 0 ? 1 : 0;
            return { origin, seedIndex, underfilled, empty };
          })
          .sort((a, b) => b.empty - a.empty || b.underfilled - a.underfilled)
          .slice(0, Math.min(220, searchPool.length));
        const ranked = shortlist.map((item) => {
          evals += 1;
          return {
            ...item,
            score: scoreSiteCandidate({
              zone,
              region,
              origin: item.origin,
              exclusions,
              water: options.water,
              roads: options.roads,
              corridors: options.corridors,
              anchors: options.anchors,
              mode: distributionMode,
              dispersionPercent: zone.dispersionPercent ?? 50,
              seeds: uniqueSeeds,
              seedIndex: item.seedIndex,
              occupied: occupiedForScore(),
              preferredYawDeg: zone.preferredYawDeg,
              spatialWeight: 0,
            }).score,
          };
        }).filter((item) => item.score > -1e5).sort((a, b) => b.empty - a.empty || b.underfilled - a.underfilled || b.score - a.score);
        for (const candidate of ranked) {
          if (clusters.filter((cluster) => cluster.zoneId === zone.id).length >= target) break;
          if (zone.quantityMode === "automatic" && coverageMet()) break;
          if (evals > evalBudget) { budgetExhausted = true; break; }
          tryPlaceAt(candidate.origin, candidate.seedIndex, null, false);
        }
      };
      for (let attempt = 0; attempt < maxRepack && needsRepack() && !budgetExhausted; attempt += 1) {
        if (options.cancelled?.()) { budgetExhausted = true; break; }
        const zoneForms = clusters.filter((cluster) => cluster.zoneId === zone.id);
        if (zoneForms.length < 2) break;
        const emptySeedIndexes = seedCounts
          .map((count, index) => ({ count, index }))
          .filter((item) => item.count <= 0)
          .map((item) => item.index);
        const byCrowding = [...zoneForms].sort((a, b) => neighborPressure(b) - neighborPressure(a));
        const byOverfullSeed = [...zoneForms].sort((a, b) => {
          const ca = seedCounts[a.architecturalClusterId ?? 0] ?? 0;
          const cb = seedCounts[b.architecturalClusterId ?? 0] ?? 0;
          return cb - ca;
        });
        const mode = attempt % 4;
        let removeTargets: SiteCluster[] = [];
        if (mode === 0) {
          removeTargets = [zoneForms[zoneForms.length - 1 - (Math.floor(attempt / 4) % Math.min(4, zoneForms.length))]];
        } else if (mode === 1) {
          removeTargets = [byCrowding[Math.floor(attempt / 4) % Math.min(4, byCrowding.length)]];
        } else if (mode === 2 && emptySeedIndexes.length) {
          removeTargets = [byOverfullSeed[0]].filter(Boolean);
        } else {
          removeTargets = [byCrowding[0], byCrowding[1]].filter(Boolean).slice(0, zoneForms.length >= 3 ? 2 : 1);
        }
        removeTargets = [...new Map(removeTargets.filter(Boolean).map((item) => [item.id, item])).values()];
        if (!removeTargets.length) break;

        const snapshotClusters = clusters.map((cluster) => ({ ...cluster }));
        const snapshotOccupied = occupied.map((item) => ({ ...item, mask: item.mask }));
        const snapshotSeedCounts = [...seedCounts];
        const snapshotTypologyCounts = { ...typologyCounts };
        const snapshotAdjusted = orientationAdjustedCount;
        const snapshotClear = snapshotClearance();
        const beforeCount = zoneForms.length;
        const beforeFootprint = measureZoneFootprint();
        const removedForms = removeTargets.map((item) => dropCluster(item.id)).filter((item): item is SiteCluster => !!item);
        if (!removedForms.length) break;

        // Sequence variant A: dense geometry-only refill before reseating.
        if (attempt % 2 === 0) fillFromSearchPool();

        for (const removed of removedForms) {
          const forced = removed.typology;
          const stillNeeded = unmetRepresentAll(zone.typologies, typologyCounts);
          const forcedTypology = (forced && (typologyCounts[forced] ?? 0) < (typologyQuotas[forced] ?? 0))
            ? forced
            : (stillNeeded[0] ?? forced);
          const preferEmptySeed = emptySeedIndexes[0];
          const micro = localMicroOrigins([removed.x, removed.z]);
          const rankedOrigins = [
            ...micro.map((origin) => ({
              origin,
              seedIndex: preferEmptySeed ?? assignSeedIndex(origin, uniqueSeeds),
              dist: Math.hypot(origin[0] - removed.x, origin[1] - removed.z),
              priority: 2,
            })),
            ...searchPool.map((origin) => {
              const seedIndex = assignSeedIndex(origin, uniqueSeeds);
              const emptyBoost = emptySeedIndexes.includes(seedIndex) ? 1 : 0;
              return {
                origin,
                seedIndex: preferEmptySeed != null && emptyBoost ? preferEmptySeed : seedIndex,
                dist: Math.hypot(origin[0] - removed.x, origin[1] - removed.z),
                priority: emptyBoost,
              };
            }),
          ].sort((a, b) => b.priority - a.priority || a.dist - b.dist)
            .slice(0, 120);
          // Sequence variant B: reverse distance order on odd attempts.
          const sequence = attempt % 2 === 1 ? [...rankedOrigins].reverse() : rankedOrigins;
          for (const candidate of sequence) {
            if (clusters.filter((cluster) => cluster.zoneId === zone.id).length >= target) break;
            if (zone.quantityMode === "automatic" && coverageMet()) break;
            if (evals > evalBudget) { budgetExhausted = true; break; }
            tryPlaceAt(candidate.origin, candidate.seedIndex, forcedTypology, false);
          }
        }
        // Explicit empty-seed push, then final dense geometry fill.
        for (const seedIndex of emptySeedIndexes) {
          if (clusters.filter((cluster) => cluster.zoneId === zone.id).length >= target) break;
          if (zone.quantityMode === "automatic" && coverageMet()) break;
          const near = filterCandidatesNearSeed(searchPool, uniqueSeeds[seedIndex], Math.max(radius, denseStep * 4));
          for (const origin of (near.length ? near : searchPool).slice(0, 64)) {
            if (evals > evalBudget) { budgetExhausted = true; break; }
            tryPlaceAt(origin, seedIndex, null, false);
            if ((seedCounts[seedIndex] ?? 0) > 0) break;
          }
        }
        fillFromSearchPool();

        const afterCount = clusters.filter((cluster) => cluster.zoneId === zone.id).length;
        const afterFootprint = measureZoneFootprint();
        repackAttempts += 1;
        const improved = afterCount > beforeCount || (afterCount >= beforeCount && afterFootprint > beforeFootprint + 1);
        if (!improved) {
          clusters.splice(0, clusters.length, ...snapshotClusters);
          occupied.splice(0, occupied.length, ...snapshotOccupied);
          snapshotSeedCounts.forEach((value, index) => { seedCounts[index] = value; });
          (Object.keys(typologyCounts) as SiteTypologyId[]).forEach((key) => { delete typologyCounts[key]; });
          Object.assign(typologyCounts, snapshotTypologyCounts);
          orientationAdjustedCount = snapshotAdjusted;
          verifiedClearances = snapshotClear.verified;
          estimatedClearances = snapshotClear.estimated;
        } else {
          repackImprovements += 1;
        }
        if (evals > evalBudget) budgetExhausted = true;
      }
      if (repackAttempts > 0) {
        notes.push(
          `Zone ${zone.name}: bounded repack attempted ${repackAttempts} time(s), kept ${repackImprovements} improvement(s).`,
        );
      }
      profile?.mark("repacking", performance.now() - repackStarted);
    } else if (needsRepack() && stageBudget.maxRepack <= 0) {
      notes.push(`Zone ${zone.name}: initial stage skipped expensive repack (run refinement/extended to improve packing).`);
    }

    // Hard cull: drop forms whose architectural occupancy (or envelope fallback) exits the zone.
    for (let index = clusters.length - 1; index >= 0; index -= 1) {
      const cluster = clusters[index];
      if (cluster.zoneId !== zone.id) continue;
      const source = options.sources.find((item) => item.meshId === cluster.meshId);
      const boundary = evaluatePlacementBoundary({
        x: cluster.x,
        z: cluster.z,
        yawDeg: cluster.yawDeg,
        widthFeet: Math.max(LATTICE_FEET, source?.planWidthFeet ?? cluster.bayFeet),
        depthFeet: Math.max(LATTICE_FEET, source?.planDepthFeet ?? cluster.bayFeet),
        mask: resolveSourceMask(source),
      }, [region], exclusions);
      if (boundary.ok) continue;
      clusters.splice(index, 1);
      const occIndex = occupied.findIndex((item) => item.x === cluster.x && item.z === cluster.z && item.zoneId === zone.id);
      if (occIndex >= 0) occupied.splice(occIndex, 1);
      if (cluster.typology) typologyCounts[cluster.typology] = Math.max(0, (typologyCounts[cluster.typology] ?? 1) - 1);
      rejectReasons.footprint += 1;
      rejected += 1;
    }

    const zoneClusters = clusters.filter((cluster) => cluster.zoneId === zone.id);
    const placed = zoneClusters.length;
    const archPlacements = zoneClusters.map((cluster) => {
      const source = options.sources.find((item) => item.meshId === cluster.meshId);
      return {
        x: cluster.x,
        z: cluster.z,
        yawDeg: cluster.yawDeg,
        mask: resolveSourceMask(source),
      };
    });
    const envelopePlacements = zoneClusters.map((cluster) => {
      const source = options.sources.find((item) => item.meshId === cluster.meshId);
      return {
        x: cluster.x,
        z: cluster.z,
        yawDeg: cluster.yawDeg,
        widthFeet: Math.max(LATTICE_FEET, source?.planWidthFeet ?? cluster.bayFeet),
        depthFeet: Math.max(LATTICE_FEET, source?.planDepthFeet ?? cluster.bayFeet),
        bayFeet: cluster.bayFeet,
      };
    });
    const coverageStarted = performance.now();
    const achievedFootprintArea = architecturalFootprintUnionArea(archPlacements);
    const collisionEnvelopeArea = footprintUnionArea(envelopePlacements);
    profile?.mark("coverageUnion", performance.now() - coverageStarted);
    const registrationBayFootprintArea = registrationBayUnionArea(zoneClusters);
    const achievedCoverage = usable > 0 ? 100 * achievedFootprintArea / usable : 0;
    const coverageShortfallArea = Math.max(0, targetFootprint - achievedFootprintArea);
    const coverageWithinTolerance = coverageMet();
    const levels = estimateLevels(zone);
    // GFA proxy uses architectural plan occupancy × levels — not the collision envelope.
    const estimatedGfa = achievedFootprintArea * Math.max(1, levels);
    void estimateGrossFloorArea;
    const dispersion = measureDispersion(zoneClusters.map((cluster) => ({ x: cluster.x, z: cluster.z })));
    const architecturalClusters = countArchitecturalClusters(
      zoneClusters.map((cluster) => ({ x: cluster.x, z: cluster.z, architecturalClusterId: cluster.architecturalClusterId })),
      Math.max(clusterSeparation + LATTICE_FEET, LATTICE_FEET * 2.2),
    );
    const diagStarted = performance.now();
    let measuredMinEdge: number | null = null;
    let destructiveCollisions = 0;
    let finalVerified = 0;
    let finalEstimated = 0;
    for (let i = 0; i < zoneClusters.length; i += 1) {
      for (let j = i + 1; j < zoneClusters.length; j += 1) {
        const sourceA = options.sources.find((item) => item.meshId === zoneClusters[i].meshId);
        const sourceB = options.sources.find((item) => item.meshId === zoneClusters[j].meshId);
        const poseA: PlacementPose = {
          x: zoneClusters[i].x,
          z: zoneClusters[i].z,
          yawDeg: zoneClusters[i].yawDeg,
          widthFeet: Math.max(LATTICE_FEET, sourceA?.planWidthFeet ?? zoneClusters[i].bayFeet),
          depthFeet: Math.max(LATTICE_FEET, sourceA?.planDepthFeet ?? zoneClusters[i].bayFeet),
          elevation: zoneClusters[i].elevation,
          heightFeet: LATTICE_FEET,
          mask: resolveSourceMask(sourceA),
          maskCacheKey: sourceA?.meshId ?? null,
        };
        const poseB: PlacementPose = {
          x: zoneClusters[j].x,
          z: zoneClusters[j].z,
          yawDeg: zoneClusters[j].yawDeg,
          widthFeet: Math.max(LATTICE_FEET, sourceB?.planWidthFeet ?? zoneClusters[j].bayFeet),
          depthFeet: Math.max(LATTICE_FEET, sourceB?.planDepthFeet ?? zoneClusters[j].bayFeet),
          elevation: zoneClusters[j].elevation,
          heightFeet: LATTICE_FEET,
          mask: resolveSourceMask(sourceB),
          maskCacheKey: sourceB?.meshId ?? null,
        };
        let evalClear = evaluatePlacementClearance(poseA, poseB, 0);
        if (evalClear.ok && evalClear.confidence === "estimated") {
          const refined = refineEstimatedClearance(poseA, poseB);
          if (refined.confidence === "verified" || refined.confidence === "destructive") {
            evalClear = refined;
          } else {
            notes.push(
              `Zone ${zone.name}: clearance between forms ${i + 1} and ${j + 1} remains estimated — precise triangle mesh intersection was not established.`,
            );
          }
        }
        if (evalClear.destructive) destructiveCollisions += 1;
        else if (evalClear.ok && evalClear.confidence === "verified") finalVerified += 1;
        else if (evalClear.ok && evalClear.confidence === "estimated") finalEstimated += 1;
        if (evalClear.ok && evalClear.measured != null && (measuredMinEdge == null || evalClear.measured < measuredMinEdge)) {
          measuredMinEdge = evalClear.measured;
        }
      }
    }
    // Prefer final pairwise diagnostic counts for reporting; keep placement-time counters as fallback.
    if (finalVerified + finalEstimated > 0) {
      verifiedClearances = finalVerified;
      estimatedClearances = finalEstimated;
    }
    profile?.mark("diagnostics", performance.now() - diagStarted);
    let boundaryViolations = 0;
    for (const cluster of zoneClusters) {
      const source = options.sources.find((item) => item.meshId === cluster.meshId);
      const boundary = evaluatePlacementBoundary({
        x: cluster.x,
        z: cluster.z,
        yawDeg: cluster.yawDeg,
        widthFeet: Math.max(LATTICE_FEET, source?.planWidthFeet ?? cluster.bayFeet),
        depthFeet: Math.max(LATTICE_FEET, source?.planDepthFeet ?? cluster.bayFeet),
        mask: resolveSourceMask(source),
      }, [region], exclusions);
      if (!boundary.ok) boundaryViolations += 1;
    }
    const requestedPercent = Object.fromEntries(normalizeWeights(zone.typologies).map((item) => [item.id, item.weight]));
    const achievedPercent = Object.fromEntries(
      Object.entries(typologyCounts).map(([id, count]) => [id, placed ? 100 * (count ?? 0) / placed : 0]),
    );
    const unfilledQuotas = (Object.keys(typologyQuotas) as SiteTypologyId[])
      .filter((id) => (typologyQuotas[id] ?? 0) > (typologyCounts[id] ?? 0))
      .map((id) => `${id} ${typologyCounts[id] ?? 0}/${typologyQuotas[id]}`);
    const rejectText = `Rejected ${rejected}: edge ${rejectReasons.spacing}, cluster-sep ${rejectReasons.clusterSep}, cross-zone ${rejectReasons.crossZone}, footprint ${rejectReasons.footprint}, height ${rejectReasons.height}, score ${rejectReasons.score}, source ${rejectReasons.source}. Pool ${pool.length}.`;
    const coverageText = `Architectural coverage ${achievedCoverage.toFixed(1)}% / ${zone.targetCoveragePercent}% target · footprint ${achievedFootprintArea.toFixed(0)} / ${targetFootprint.toFixed(0)} ft² (envelope diagnostic ${collisionEnvelopeArea.toFixed(0)} ft²).`;
    const manualMaxCoverage = initialTarget > 0 && meanFootprint > 0
      ? 100 * (initialTarget * meanFootprint) / Math.max(usable, 1)
      : 0;
    if (!stopReason) {
      const parts: string[] = [];
      if (budgetExhausted) parts.push(`Evaluation budget exhausted (${evalBudget} tests).`);
      if (placed < initialTarget) parts.push(`Accepted ${placed} of ${initialTarget} requested forms. ${rejectText}`);
      else if (zone.quantityMode === "automatic" && placed !== initialTarget) {
        parts.push(
          coverageWithinTolerance
            ? `Automatic quantity stopped at ${placed} once coverage entered ±${COVERAGE_TOLERANCE_PERCENT}% of target (initial estimate ${initialTarget}).`
            : `Automatic quantity adjusted to ${placed} (initial estimate ${initialTarget}).`,
        );
      }
      if (architecturalClusters < preferredClusters && placed > 0) {
        parts.push(`Preferred ${preferredClusters} architectural clusters; achieved ${architecturalClusters}. Seeds ${uniqueSeeds.length}; seed fills ${seedCounts.join("/")}.`);
      }
      if (placed >= 2) {
        const targetSpread = dispersionSpreadFeet(dispersionPercent, region);
        const spreadRatio = dispersion.spread / Math.max(1, targetSpread);
        if (dispersionPercent >= 65 && spreadRatio < 0.55) {
          parts.push(`Requested high dispersion (~${targetSpread.toFixed(0)} ft target spread); achieved spread ${dispersion.spread.toFixed(0)} ft.`);
        } else if (dispersionPercent <= 35 && spreadRatio > 1.85) {
          parts.push(`Requested low dispersion (~${targetSpread.toFixed(0)} ft preferred spread); achieved spread ${dispersion.spread.toFixed(0)} ft.`);
        }
        const conc = zone.concentrationPercent ?? 55;
        if (uniqueSeeds.length && conc >= 70) {
          let meanSeedDist = 0;
          let counted = 0;
          for (const cluster of zoneClusters) {
            const sid = cluster.architecturalClusterId ?? 0;
            const seed = uniqueSeeds[Math.max(0, Math.min(uniqueSeeds.length - 1, sid))];
            if (!seed) continue;
            meanSeedDist += Math.hypot(cluster.x - seed[0], cluster.z - seed[1]);
            counted += 1;
          }
          meanSeedDist = counted ? meanSeedDist / counted : 0;
          if (meanSeedDist > radius * 1.35) {
            parts.push(`Requested high concentration (radius ~${radius.toFixed(0)} ft); mean distance to cluster seed ${meanSeedDist.toFixed(0)} ft.`);
          }
        }
      }
      if (zone.quantityMode === "manual" && coverageShortfallArea > 1) {
        const capacityNote = manualMaxCoverage + 1e-6 < zone.targetCoveragePercent
          ? ` Average-based capacity estimate: ${initialTarget} × mean source footprint (~${meanFootprint.toFixed(0)} ft²) implies ~${manualMaxCoverage.toFixed(1)}% if non-overlapping — not a verified geometric maximum; measured occupancy may differ. Below the ${zone.targetCoveragePercent}% target.`
          : "";
        parts.push(`Manual count preserved — coverage shortfall ${coverageShortfallArea.toFixed(0)} ft² (${coverageText}).${capacityNote} Increase form count, relax cluster separation, or reduce coverage target to close the gap.`);
      } else if (zone.quantityMode === "automatic" && !coverageWithinTolerance && coverageShortfallArea > 1) {
        const bound = areaBasedFormCapacity(usable, meanFootprint, zone.targetCoveragePercent);
        parts.push(
          `Coverage target unmet (${coverageText}). Geometric constraints prevented further feasible placements. `
          + `Area-based bound (non-overlapping ideal): ~${bound.formsForTargetCoverage} forms for target area `
          + `${bound.targetAreaFeet2.toFixed(0)} ft²; ~${bound.formsIfFullUsablePacked} if packing the full usable area. `
          + `Irregular polygon packing may be lower than the area bound.`,
        );
      } else if (achievedCoverage > zone.targetCoveragePercent + COVERAGE_TOLERANCE_PERCENT) {
        parts.push(`Coverage overshoot ${coverageText}.`);
      }
      if (unfilledQuotas.length) parts.push(`Unfilled typology quotas: ${unfilledQuotas.join(", ")}.`);
      if (zone.representAllTypologies && unmetRepresentAll(zone.typologies, typologyCounts).length) {
        parts.push(`Could not represent all selected typologies: missing ${unmetRepresentAll(zone.typologies, typologyCounts).join(", ")}.`);
      }
      if (orientationAdjustedCount > 0) {
        parts.push(`Orientation ${orientationMode}: ${orientationAdjustedCount} form(s) used yaw different from preferred ${zone.preferredYawDeg}°.`);
      }
      if (yawEvalBudget <= 0 && orientationMode !== "fixed") {
        parts.push("Orientation search budget exhausted; some candidate yaws were not evaluated.");
      }
      stopReason = parts.length ? parts.join(" ") : null;
    }
    if (stopReason) notes.push(`Zone ${zone.name}: ${stopReason}`);

    zoneStats.push({
      zoneId: zone.id,
      zoneName: zone.name,
      requested: initialTarget,
      accepted: placed,
      rejected,
      candidates: pool.length,
      targetCoverage: zone.targetCoveragePercent,
      achievedCoverage,
      targetFootprintArea: targetFootprint,
      achievedFootprintArea,
      collisionEnvelopeArea,
      registrationBayFootprintArea,
      coverageShortfallArea,
      meanSourceFootprintArea: meanFootprint,
      meanCollisionEnvelopeArea: meanEnvelope,
      footprintMethod: footprintMethodLabel,
      quantityMode: zone.quantityMode,
      targetGrossFloorArea: zone.targetGrossFloorArea ?? 0,
      estimatedGrossFloorArea: estimatedGfa,
      usableArea: usable,
      preferredClusters,
      architecturalClusters,
      meanNearestNeighbor: dispersion.meanNearest,
      dispersionSpread: dispersion.spread,
      measuredMinEdgeClearance: measuredMinEdge,
      destructiveCollisions,
      boundaryViolations,
      verifiedClearances,
      estimatedClearances,
      typologyCounts: Object.fromEntries(Object.entries(typologyCounts).map(([key, value]) => [key, value ?? 0])),
      typologyQuotas: Object.fromEntries(Object.entries(typologyQuotas).map(([key, value]) => [key, value ?? 0])),
      typologyRequestedPercent: requestedPercent,
      typologyAchievedPercent: achievedPercent,
      rejectBreakdown: { ...rejectReasons },
      orientationAdjustedCount,
      orientationMode,
      repackAttempts,
      repackImprovements,
      optimizationStage,
      objectiveMode,
      generationTimeMs: Math.round(performance.now() - zoneStarted),
      evaluationCount: evals,
      budgetUtilization: evalBudget > 0 ? evals / evalBudget : 0,
      stopReason,
      budgetExhausted,
    });
  };

  const templateZone = participation.zones[0] ?? options.zones[0];
  // Prefer a snapped/enabled Cluster Zone polygon when it is large enough; fall back to suggested gold footprint,
  // then to that footprint's axis-aligned bounds so a degenerate hull cannot zero out generation.
  const entireSitePolygon = (() => {
    if (options.mode !== "entire-site" && options.mode !== "hybrid-site") return null;
    const fromZone = templateZone && polygonArea(templateZone.polygon) >= LATTICE_FEET * LATTICE_FEET
      ? templateZone.polygon
      : null;
    const fromSuggested = options.suggested && polygonArea(options.suggested) >= LATTICE_FEET * LATTICE_FEET
      ? options.suggested
      : null;
    // Entire-site / hybrid use the suggested gold Site footprint when available; zone polygons apply in selected/enabled modes.
    const primary = fromSuggested ?? fromZone;
    if (!primary) return null;
    const bounds = polygonBounds(primary);
    const spanOk = (bounds.maxX - bounds.minX) >= LATTICE_FEET && (bounds.maxZ - bounds.minZ) >= LATTICE_FEET;
    if (!spanOk && fromSuggested) {
      const b = polygonBounds(fromSuggested);
      return rectanglePolygon([b.minX, b.minZ], [b.maxX, b.maxZ]);
    }
    return primary;
  })();

  // Smaller zones first so overlapping larger zones fill remaining area instead of starving small ones.
  const activeZones = entireSitePolygon
    ? [{ ...syntheticZone(entireSitePolygon, templateZone) }]
    : [...participation.zones].sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon));

  if (!activeZones.length && options.mode !== "entire-site") {
    notes.push("No authorized development zones participated. Adjust selection, enable zones, or change generation scope.");
  }
  if ((options.mode === "entire-site" || options.mode === "hybrid-site") && !entireSitePolygon) {
    notes.push("Entire Buildable Site needs a gold Site footprint or an enabled Cluster Zone large enough for a 20 ft bay.");
  }

  activeZones.forEach((zone, index) => placeInZone(zone, zone.polygon, index));

  if (options.mode === "hybrid-site" && options.suggested) {
    notes.push("Hybrid site mode reserved remaining suggested-development area for landscape, circulation, or later authorized clusters.");
  }

  const scope = entireSitePolygon
    ? {
      mode: options.mode,
      selectedZoneId: options.selectedZoneId ?? null,
      participatingZoneIds: ["entire-site"],
      participatingZoneNames: ["Entire suggested site"],
    }
    : participation.summary;

  const placementKind: PlacementKind = clusters.some((item) => item.architecturalClusterId != null && (item.architecturalClusterId as number) >= 0)
    ? "spatially-grouped"
    : "site-placement";

  const alternative: GenerationAlternative = {
    id: options.alternativeId,
    seed: options.seed,
    label: options.label,
    clusters,
    findings: [],
    hardPassed: true,
    sourceFidelityPassed: true,
    sourceFidelity: null,
    preferenceScore: 0,
    placementKind,
    zoneStats,
    scope,
    protoFormSource: options.protoFormSource ?? "active-lattice",
    sourceLabels: options.sourceLabels ?? options.sources.map((item) => item.filename ?? item.meshId),
    distributionMode: options.distributionMode ?? activeZones[0]?.distributionMode ?? "balanced",
    optimizationStage,
    objectiveMode,
  };
  const evaluated = evaluateAlternative(alternative, {
    zones: activeZones,
    exclusions: options.exclusions,
    water: options.water,
    roads: options.roads,
    corridors: options.corridors,
    constraints: options.constraints,
    notes,
    surfaceSampler: options.surfaceSampler ?? null,
  });
  const scores = aggregateObjectiveScores(evaluated);
  const withObjective: GenerationAlternative = {
    ...evaluated,
    objectiveLabel: objectiveModeLabel(objectiveMode, scores),
    label: options.label.includes("Alternative") ? options.label : objectiveModeLabel(objectiveMode, scores),
  };
  setPlacementGeometryProfile(null);
  return withObjective;
}

function makeCluster(
  zone: ClusterZone,
  source: ClusterSource,
  typology: SiteTypologyId | null,
  origin: Point,
  elevation: number,
  alternativeId: string,
  architecturalClusterId: number | null,
  yawDeg = zone.preferredYawDeg,
  yawAdjustedFromPreferred = false,
): SiteCluster {
  return {
    id: `${zone.id}-${origin[0].toFixed(1)}-${origin[1].toFixed(1)}-${yawDeg}`,
    zoneId: zone.id,
    meshId: source.meshId,
    // Prefer the typology slot so display/color stay tied to the checkbox selection.
    slotId: (typology ? slotForTypology(typology) : null) ?? source.slotId,
    typology,
    x: origin[0],
    z: origin[1],
    elevation,
    yawDeg,
    bayFeet: LATTICE_FEET,
    alternativeId,
    architecturalClusterId,
    yawAdjustedFromPreferred,
  };
}

function defaultZoneFields(index: number): Pick<ClusterZone,
  | "quantityMode" | "targetCount" | "targetCoveragePercent" | "targetGrossFloorArea"
  | "minCount" | "maxCount" | "density" | "dispersionPercent" | "preferredClusterCount"
  | "concentrationPercent" | "typologyDiversityPercent" | "representAllTypologies" | "distributionMode"
  | "maxHeightFeet" | "occupiedLevels" | "floorToFloorFeet" | "gatheringFloorToFloorFeet"
  | "doubleHeightFeet" | "minSpacingFeet" | "minEdgeClearanceFeet" | "clusterSeparationFeet"
  | "crossZoneSeparationFeet" | "connectionToleranceFeet" | "preferredYawDeg" | "orientationMode"
  | "lockPreferredYaw" | "orientationFine45" | "elevationOffsetFeet"
  | "waterfrontPriority" | "acousticPriority" | "solarPriority" | "protectedVoids" | "program" | "enabled" | "visible"
> {
  return {
    enabled: true,
    visible: true,
    quantityMode: "automatic",
    targetCount: 4,
    targetCoveragePercent: 25,
    targetGrossFloorArea: 0,
    minCount: 1,
    maxCount: 120,
    density: 0.45,
    dispersionPercent: 55,
    preferredClusterCount: 3,
    concentrationPercent: 55,
    typologyDiversityPercent: 45,
    representAllTypologies: false,
    distributionMode: "balanced",
    maxHeightFeet: 48,
    occupiedLevels: 3,
    floorToFloorFeet: 16,
    gatheringFloorToFloorFeet: 20,
    doubleHeightFeet: 32,
    minSpacingFeet: 20,
    minEdgeClearanceFeet: 0,
    clusterSeparationFeet: 40,
    crossZoneSeparationFeet: 0,
    connectionToleranceFeet: 0,
    preferredYawDeg: 0,
    orientationMode: "fixed",
    lockPreferredYaw: false,
    orientationFine45: false,
    elevationOffsetFeet: 0,
    waterfrontPriority: index === 0 ? 80 : 40,
    acousticPriority: index === 0 ? 30 : 70,
    solarPriority: 40,
    protectedVoids: true,
    program: index === 0 ? ["public-gathering", "waterfront-leisure"] : ["focused-work", "collaborative-work"],
  };
}

function syntheticZone(polygon: Polygon, template?: ClusterZone): ClusterZone {
  const defaults = defaultZoneFields(0);
  return {
    id: "entire-site",
    name: "Entire suggested site",
    kind: "zone",
    color: "#d6ad4f",
    polygon,
    typologies: template?.typologies ?? [{ id: "stepped-amphitheater", weight: 100 }],
    hybridization: template?.hybridization ?? "integrated",
    ...defaults,
    quantityMode: template?.quantityMode ?? defaults.quantityMode,
    targetCount: template?.targetCount ?? defaults.targetCount,
    targetCoveragePercent: template?.targetCoveragePercent ?? defaults.targetCoveragePercent,
    targetGrossFloorArea: template?.targetGrossFloorArea ?? defaults.targetGrossFloorArea,
    minCount: template?.minCount ?? defaults.minCount,
    maxCount: template?.maxCount ?? defaults.maxCount,
    density: template?.density ?? defaults.density,
    dispersionPercent: template?.dispersionPercent ?? defaults.dispersionPercent,
    preferredClusterCount: template?.preferredClusterCount ?? defaults.preferredClusterCount,
    concentrationPercent: template?.concentrationPercent ?? defaults.concentrationPercent,
    typologyDiversityPercent: template?.typologyDiversityPercent ?? defaults.typologyDiversityPercent,
    representAllTypologies: template?.representAllTypologies ?? defaults.representAllTypologies,
    distributionMode: template?.distributionMode ?? defaults.distributionMode,
    maxHeightFeet: template?.maxHeightFeet ?? defaults.maxHeightFeet,
    minSpacingFeet: template?.minSpacingFeet ?? defaults.minSpacingFeet,
    minEdgeClearanceFeet: template?.minEdgeClearanceFeet ?? defaults.minEdgeClearanceFeet,
    clusterSeparationFeet: template?.clusterSeparationFeet ?? defaults.clusterSeparationFeet,
    crossZoneSeparationFeet: template?.crossZoneSeparationFeet ?? defaults.crossZoneSeparationFeet,
    connectionToleranceFeet: template?.connectionToleranceFeet ?? defaults.connectionToleranceFeet,
    preferredYawDeg: template?.preferredYawDeg ?? defaults.preferredYawDeg,
    orientationMode: template?.orientationMode ?? defaults.orientationMode,
    lockPreferredYaw: template?.lockPreferredYaw ?? defaults.lockPreferredYaw,
    orientationFine45: template?.orientationFine45 ?? defaults.orientationFine45,
    elevationOffsetFeet: template?.elevationOffsetFeet ?? defaults.elevationOffsetFeet,
    waterfrontPriority: template?.waterfrontPriority ?? defaults.waterfrontPriority,
    acousticPriority: template?.acousticPriority ?? defaults.acousticPriority,
  };
}

export function createDefaultZone(polygon: Polygon, index: number): ClusterZone {
  return {
    id: `zone-${index + 1}-${Math.round(polygonCentroid(polygon)[0])}`,
    name: `Cluster Zone ${index + 1}`,
    kind: "zone",
    color: ["#d6ad4f", "#1293c2", "#8ff2f4", "#c48b5a", "#71beda"][index % 5],
    polygon,
    typologies: [{ id: "stepped-amphitheater", weight: 100 }],
    hybridization: "integrated",
    ...defaultZoneFields(index),
  };
}

export function createExclusion(polygon: Polygon, index: number): ClusterZone {
  return {
    ...createDefaultZone(polygon, index),
    id: `exclusion-${index + 1}`,
    name: `Exclusion ${index + 1}`,
    kind: "exclusion",
    color: "#874b3e",
    targetCount: 0,
    quantityMode: "manual",
    preferredClusterCount: 0,
  };
}
