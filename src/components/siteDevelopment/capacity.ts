import { LATTICE_FEET } from "../lattice/types";
import { meanArchitecturalFootprintArea } from "./architecturalFootprint";
import { bayFootprint, orientedPlanEnvelope, pointInPolygon, polygonArea, polygonBounds, polygonOpen, type Point, type Polygon } from "./geometry";
import type { ClusterZone } from "./types";

/** Computational candidate/eval ceilings — not architectural design requirements. */
export const MAX_PLACEMENT_CANDIDATES = 2500;
export const DEFAULT_EVALUATION_BUDGET = 8000;
export const ABSOLUTE_FORM_SAFETY_CEILING = 400;

/** Absolute coverage tolerance (percentage points) for automatic stop-when-met. */
export const COVERAGE_TOLERANCE_PERCENT = 2;

/**
 * Usable development area in ft².
 * With no exclusions: equals the polygon area (not AABB fill-factor × area).
 * With exclusions: samples the polygon and subtracts excluded cells (union of exclusions; no double-count).
 */
export function usableZoneArea(polygon: Polygon, exclusions: Polygon[], sampleFeet = 4) {
  const polyArea = Math.max(0, polygonArea(polygon));
  if (polyArea <= 0) return 0;
  if (!exclusions.length) return polyArea;

  const bounds = polygonBounds(polygon);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width <= 0 || depth <= 0) return polyArea;

  let inPolygon = 0;
  let buildable = 0;
  for (let x = bounds.minX + sampleFeet / 2; x <= bounds.maxX; x += sampleFeet) {
    for (let z = bounds.minZ + sampleFeet / 2; z <= bounds.maxZ; z += sampleFeet) {
      const point: Point = [x, z];
      if (!pointInPolygon(point, polygon)) continue;
      inPolygon += 1;
      if (exclusions.some((region) => pointInPolygon(point, region))) continue;
      buildable += 1;
    }
  }
  if (!inPolygon) return 0;
  // Scale exact polygon area by the fraction of in-polygon samples that remain buildable.
  return polyArea * (buildable / inPolygon);
}

export function targetFootprintArea(usableArea: number, targetCoveragePercent: number) {
  const coverage = Math.max(0, Math.min(100, targetCoveragePercent)) / 100;
  return usableArea * coverage;
}

export function estimateLevels(zone: ClusterZone) {
  const floor = Math.max(8, zone.floorToFloorFeet || 16);
  return Math.max(1, Math.min(zone.occupiedLevels || 1, Math.floor(zone.maxHeightFeet / floor)));
}

export type PlanFootprintPlacement = {
  x: number;
  z: number;
  yawDeg: number;
  /** Plan width (ft) of the occupied footprint envelope. */
  widthFeet: number;
  /** Plan depth (ft) of the occupied footprint envelope. */
  depthFeet: number;
  /** @deprecated Prefer widthFeet/depthFeet. Treated as a square when width/depth omitted. */
  bayFeet?: number;
};

/**
 * Union of collision / planning rectangular plan envelopes (ft²).
 * Diagnostic and collision-related sizing — NOT the architectural coverage metric.
 * Internal OBJ voids are not subtracted.
 */
export function footprintUnionArea(placements: PlanFootprintPlacement[], cell = 4) {
  if (!placements.length) return 0;
  const occupied = new Set<string>();
  for (const item of placements) {
    const width = Math.max(1, item.widthFeet ?? item.bayFeet ?? LATTICE_FEET);
    const depth = Math.max(1, item.depthFeet ?? item.bayFeet ?? LATTICE_FEET);
    const ring = polygonOpen(orientedPlanEnvelope(item.x, item.z, width, depth, item.yawDeg));
    const bounds = polygonBounds(ring);
    for (let x = bounds.minX; x < bounds.maxX; x += cell) {
      for (let z = bounds.minZ; z < bounds.maxZ; z += cell) {
        const sample: Point = [x + cell / 2, z + cell / 2];
        if (pointInPolygon(sample, ring)) occupied.add(`${Math.round(x / cell)}:${Math.round(z / cell)}`);
      }
    }
  }
  return occupied.size * cell * cell;
}

/** @deprecated Alias — envelope union only. Prefer architecturalFootprintUnionArea for coverage. */
export const collisionEnvelopeUnionArea = footprintUnionArea;

/** Registration-bay-only union (nominal 20×20) — diagnostics, not coverage truth. */
export function registrationBayUnionArea(
  placements: Array<{ x: number; z: number; yawDeg: number; bayFeet?: number }>,
  cell = 4,
) {
  return footprintUnionArea(placements.map((item) => ({
    x: item.x,
    z: item.z,
    yawDeg: item.yawDeg,
    widthFeet: item.bayFeet ?? LATTICE_FEET,
    depthFeet: item.bayFeet ?? LATTICE_FEET,
  })), cell);
}

/** Planning proxy: levels × footprint union. Not verified commercial GFA. */
export function estimateGrossFloorArea(
  placements: PlanFootprintPlacement[],
  levels: number,
) {
  return footprintUnionArea(placements) * Math.max(1, levels);
}

/** Resolved edge clearance; 0 ft is valid and must not be raised to a hidden positive minimum. */
export function resolvedEdgeClearanceFeet(zone: Pick<ClusterZone, "minEdgeClearanceFeet" | "minSpacingFeet">) {
  if (Number.isFinite(zone.minEdgeClearanceFeet)) return Math.max(0, zone.minEdgeClearanceFeet);
  if (Number.isFinite(zone.minSpacingFeet)) return Math.max(0, zone.minSpacingFeet - LATTICE_FEET);
  return 0;
}

export function resolvedClusterSeparationFeet(zone: Pick<ClusterZone, "clusterSeparationFeet">) {
  return Number.isFinite(zone.clusterSeparationFeet) ? Math.max(0, zone.clusterSeparationFeet) : 0;
}

export function resolvedCrossZoneSeparationFeet(zone: Pick<ClusterZone, "crossZoneSeparationFeet">) {
  return Number.isFinite(zone.crossZoneSeparationFeet) ? Math.max(0, zone.crossZoneSeparationFeet) : 0;
}

/** Packing proxy: form width plus requested edge clearance. */
export function packingStrideFeet(
  zone: Pick<ClusterZone, "minEdgeClearanceFeet" | "minSpacingFeet">,
  formFeet = LATTICE_FEET,
) {
  return Math.max(formFeet, formFeet + resolvedEdgeClearanceFeet(zone));
}

/** @deprecated Use resolvedEdgeClearanceFeet / packingStrideFeet. */
export function effectiveMinSpacingFeet(zone: Pick<ClusterZone, "minSpacingFeet" | "minEdgeClearanceFeet">, bayFeet = LATTICE_FEET) {
  return packingStrideFeet(zone, bayFeet);
}

/** Mean collision-envelope area (W×D). Prefer meanArchitecturalFootprintArea for coverage quantity. */
export function meanPlanFootprintArea(
  sources: Array<{ planWidthFeet?: number; planDepthFeet?: number; slotId?: string | null }>,
  slotFilter?: Set<string>,
) {
  const relevant = sources.filter((source) => {
    if (!slotFilter?.size) return true;
    return !!source.slotId && slotFilter.has(source.slotId);
  });
  if (!relevant.length) return LATTICE_FEET * LATTICE_FEET;
  const total = relevant.reduce((sum, source) => {
    const w = Math.max(LATTICE_FEET, source.planWidthFeet ?? LATTICE_FEET);
    const d = Math.max(LATTICE_FEET, source.planDepthFeet ?? LATTICE_FEET);
    return sum + w * d;
  }, 0);
  return total / relevant.length;
}

export { meanArchitecturalFootprintArea };

export function meanPlanSpanFeet(
  sources: Array<{ planWidthFeet?: number; planDepthFeet?: number; slotId?: string | null }>,
  slotFilter?: Set<string>,
) {
  const relevant = sources.filter((source) => {
    if (!slotFilter?.size) return true;
    return !!source.slotId && slotFilter.has(source.slotId);
  });
  if (!relevant.length) return LATTICE_FEET;
  const total = relevant.reduce((sum, source) => {
    const w = Math.max(LATTICE_FEET, source.planWidthFeet ?? LATTICE_FEET);
    const d = Math.max(LATTICE_FEET, source.planDepthFeet ?? LATTICE_FEET);
    return sum + Math.max(w, d);
  }, 0);
  return total / relevant.length;
}

type QuantitySource = {
  planWidthFeet?: number;
  planDepthFeet?: number;
  architecturalFootprintAreaFeet?: number;
  slotId?: string | null;
};

/**
 * Automatic quantity from usable area, coverage target, and architectural footprints.
 * Prefers mesh plan-occupancy areas when present; falls back to envelope W×D, then 20×20 bay.
 * Packing / collision span still uses authentic envelope extents.
 */
export function estimateAutomaticCount(
  zone: ClusterZone,
  exclusions: Polygon[],
  sources: QuantitySource[] = [],
) {
  const usable = usableZoneArea(zone.polygon, exclusions);
  const footprintArea = meanArchitecturalFootprintArea(sources);
  const formSpan = meanPlanSpanFeet(sources);
  const spacing = packingStrideFeet(zone, formSpan);
  const coverage = Math.max(5, Math.min(90, zone.targetCoveragePercent)) / 100;
  const targetArea = usable * coverage;
  const fromCoverage = Math.max(1, Math.ceil(targetArea / Math.max(footprintArea, 1)));
  const fromSpacing = Math.floor(usable / Math.max(spacing * spacing, 1));
  const levels = estimateLevels(zone);
  const fromGfa = zone.targetGrossFloorArea > 0
    ? Math.floor(zone.targetGrossFloorArea / (footprintArea * levels))
    : Number.POSITIVE_INFINITY;
  if (zone.maxHeightFeet < LATTICE_FEET || usable < footprintArea * 0.25) return Math.max(0, zone.minCount);
  let estimated = Math.min(fromCoverage, fromSpacing, fromGfa);
  if (!Number.isFinite(estimated)) estimated = Math.min(fromCoverage, fromSpacing);
  const preferredMax = Number.isFinite(zone.maxCount) && zone.maxCount > 0 ? zone.maxCount : ABSOLUTE_FORM_SAFETY_CEILING;
  return Math.max(zone.minCount, Math.min(preferredMax, ABSOLUTE_FORM_SAFETY_CEILING, estimated));
}

/** Zone-aware automatic count using selected typology slots. */
export function estimateAutomaticCountForZone(
  zone: ClusterZone,
  exclusions: Polygon[],
  sources: QuantitySource[],
  slotForTypology: (id: string) => string | null,
) {
  const selectedSlots = new Set(
    zone.typologies.map((item) => slotForTypology(item.id)).filter((slot): slot is string => !!slot),
  );
  const filtered = selectedSlots.size
    ? sources.filter((source) => source.slotId && selectedSlots.has(source.slotId))
    : sources;
  const usable = usableZoneArea(zone.polygon, exclusions);
  const pool = filtered.length ? filtered : sources;
  const footprintArea = meanArchitecturalFootprintArea(pool);
  const formSpan = meanPlanSpanFeet(pool);
  const spacing = packingStrideFeet(zone, formSpan);
  const coverage = Math.max(5, Math.min(90, zone.targetCoveragePercent)) / 100;
  const targetArea = usable * coverage;
  const fromCoverage = Math.max(1, Math.ceil(targetArea / Math.max(footprintArea, 1)));
  const fromSpacing = Math.floor(usable / Math.max(spacing * spacing, 1));
  const levels = estimateLevels(zone);
  const fromGfa = zone.targetGrossFloorArea > 0
    ? Math.floor(zone.targetGrossFloorArea / (footprintArea * levels))
    : Number.POSITIVE_INFINITY;
  if (zone.maxHeightFeet < LATTICE_FEET || usable < footprintArea * 0.25) return Math.max(0, zone.minCount);
  let estimated = Math.min(fromCoverage, fromSpacing, fromGfa);
  if (!Number.isFinite(estimated)) estimated = Math.min(fromCoverage, fromSpacing);
  const preferredMax = Number.isFinite(zone.maxCount) && zone.maxCount > 0 ? zone.maxCount : ABSOLUTE_FORM_SAFETY_CEILING;
  return Math.max(zone.minCount, Math.min(preferredMax, ABSOLUTE_FORM_SAFETY_CEILING, estimated));
}

export function resolvedTargetCount(
  zone: ClusterZone,
  exclusions: Polygon[],
  sources: QuantitySource[] = [],
  slotForTypologyFn?: (id: string) => string | null,
) {
  if (zone.quantityMode === "automatic") {
    if (slotForTypologyFn) return Math.max(0, estimateAutomaticCountForZone(zone, exclusions, sources, slotForTypologyFn));
    return Math.max(0, estimateAutomaticCount(zone, exclusions, sources));
  }
  const requested = Math.max(0, Math.round(zone.targetCount));
  return Math.min(requested, ABSOLUTE_FORM_SAFETY_CEILING);
}

export function coverageGfaCompatibility(
  zone: ClusterZone,
  exclusions: Polygon[],
  sources: QuantitySource[] = [],
) {
  const usable = usableZoneArea(zone.polygon, exclusions);
  const footprintArea = meanArchitecturalFootprintArea(sources);
  const levels = estimateLevels(zone);
  const coverageTargetArea = targetFootprintArea(usable, zone.targetCoveragePercent);
  const formsForCoverage = Math.max(1, Math.ceil(coverageTargetArea / Math.max(footprintArea, 1)));
  const gfaFromCoverage = formsForCoverage * footprintArea * levels;
  const notes: string[] = [];
  if (zone.targetGrossFloorArea > 0 && gfaFromCoverage + footprintArea < zone.targetGrossFloorArea) {
    notes.push(`Target GFA ${zone.targetGrossFloorArea.toFixed(0)} ft² exceeds what ${zone.targetCoveragePercent}% footprint coverage can support at ~${levels} level(s) (~${gfaFromCoverage.toFixed(0)} ft² proxy).`);
  }
  if (zone.targetGrossFloorArea > 0 && formsForCoverage > 0 && zone.targetGrossFloorArea < footprintArea * levels) {
    notes.push(`Target GFA is below one multilevel architectural-footprint proxy (${(footprintArea * levels).toFixed(0)} ft²).`);
  }
  return { compatible: notes.length === 0, notes, formsForCoverage, gfaFromCoverage, levels, usable, coverageTargetArea, meanFootprintArea: footprintArea };
}

/**
 * Candidate sampling stride for placement search.
 * Independent of Quantity, Coverage, Dispersion, Concentration, and legacy Density.
 * Adapts slightly to typical plan span so ~40 ft authentic forms on irregular polygons
 * are not undersampled by a single coarse grid — without reintroducing a Density slider.
 */
export function candidateStep(
  _zone: ClusterZone,
  polygon: Polygon,
  planSpanFeet = LATTICE_FEET,
) {
  const area = Math.max(1, polygonArea(polygon));
  const fromBudget = Math.sqrt(area / Math.max(400, MAX_PLACEMENT_CANDIDATES));
  const legacyDefault = LATTICE_FEET * (1.15 - 0.45 * 0.7); // ~16.7 ft
  const formAware = Math.max(LATTICE_FEET, planSpanFeet) * 0.35;
  const geometricStep = Math.max(8, Math.min(legacyDefault, formAware));
  return Math.max(geometricStep, fromBudget, 8);
}

/** Keep bayFootprint import used for any legacy callers that re-export through this module. */
void bayFootprint;
