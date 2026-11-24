/**
 * Geometry-aware boundary and collision helpers for Site Development placement.
 * Broad phase: oriented rectangular envelopes.
 * Narrow phase: architectural plan-occupancy masks (registered mesh raster) +
 * selective extruded-envelope (OBB) 3D screening.
 *
 * Limitation: full triangle–triangle mesh Booleans are not used. When plan masks
 * are clear but extruded envelopes still intersect, clearance is reported as
 * estimated (not mesh-verified).
 */
import {
  type ArchitecturalFootprintMask,
  ARCHITECTURAL_FOOTPRINT_CELL_FEET,
} from "./architecturalFootprint";
import {
  footprintPermitted,
  orientedPlanEnvelope,
  pointInPolygon,
  polygonPlanClearance,
  polygonsAreaIntersect,
  violatesEdgeClearance,
  type Point,
  type Polygon,
} from "./geometry";
import { LATTICE_FEET } from "../lattice/types";
import type { PlacementProfile } from "./placementProfile";

export type PlacementPose = {
  x: number;
  z: number;
  yawDeg: number;
  widthFeet: number;
  depthFeet: number;
  elevation?: number;
  heightFeet?: number;
  mask?: ArchitecturalFootprintMask | null;
  /** Optional stable id for mask transform caches (meshId). */
  maskCacheKey?: string | null;
};

export type BoundaryEvalResult = {
  ok: boolean;
  phase: "envelope" | "architectural-mask" | "envelope-fallback";
  reason: string;
  envelopeOk: boolean;
  /** true when cell corners (not only centers) were tested */
  cornerTested?: boolean;
};

export type ClearanceConfidence = "verified" | "estimated" | "destructive";

export type ClearanceEvalResult = {
  ok: boolean;
  phase: "envelope" | "architectural-mask" | "vertical-separation" | "obb-3d" | "envelope-fallback" | "mask-corner-refine";
  measured: number | null;
  destructive: boolean;
  confidence: ClearanceConfidence;
  reason: string;
};

type LocalRingCache = {
  cellFeet: number;
  /** Local XZ corners + centers of boundary ring cells (unrotated). */
  localSamples: Point[];
  /** Local cell centers of all occupancy cells. */
  localCenters: Point[];
  ringCellCount: number;
};

type WorldMaskCache = {
  points: Point[];
  keys: Set<string>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const ringCacheByMask = new WeakMap<ArchitecturalFootprintMask, LocalRingCache>();
const worldMaskCache = new Map<string, WorldMaskCache>();
const WORLD_CACHE_LIMIT = 256;

let activeProfile: PlacementProfile | null = null;

export function setPlacementGeometryProfile(profile: PlacementProfile | null) {
  activeProfile = profile;
}

export function clearPlacementGeometryCaches() {
  worldMaskCache.clear();
}

function rotateLocal(lx: number, lz: number, originX: number, originZ: number, yawDeg: number): Point {
  const rad = yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [originX + lx * cos - lz * sin, originZ + lx * sin + lz * cos];
}

function transformMaskCellCenter(
  ix: number,
  iz: number,
  cellFeet: number,
  originX: number,
  originZ: number,
  yawDeg: number,
): Point {
  return rotateLocal((ix + 0.5) * cellFeet, (iz + 0.5) * cellFeet, originX, originZ, yawDeg);
}

/** Four corners of a local occupancy cell, transformed to world XZ. */
export function architecturalMaskCellCorners(
  ix: number,
  iz: number,
  cellFeet: number,
  originX: number,
  originZ: number,
  yawDeg: number,
): Point[] {
  const x0 = ix * cellFeet;
  const z0 = iz * cellFeet;
  const x1 = (ix + 1) * cellFeet;
  const z1 = (iz + 1) * cellFeet;
  return [
    rotateLocal(x0, z0, originX, originZ, yawDeg),
    rotateLocal(x1, z0, originX, originZ, yawDeg),
    rotateLocal(x1, z1, originX, originZ, yawDeg),
    rotateLocal(x0, z1, originX, originZ, yawDeg),
  ];
}

function occupancyBoundaryCells(mask: ArchitecturalFootprintMask) {
  const keySet = new Set(mask.cells.map((item) => `${item.ix}:${item.iz}`));
  return mask.cells.filter((item) => (
    !keySet.has(`${item.ix + 1}:${item.iz}`)
    || !keySet.has(`${item.ix - 1}:${item.iz}`)
    || !keySet.has(`${item.ix}:${item.iz + 1}`)
    || !keySet.has(`${item.ix}:${item.iz - 1}`)
  ));
}

function localRingCache(mask: ArchitecturalFootprintMask): LocalRingCache {
  const hit = ringCacheByMask.get(mask);
  if (hit) return hit;
  const cell = mask.cellFeet || ARCHITECTURAL_FOOTPRINT_CELL_FEET;
  const ring = occupancyBoundaryCells(mask);
  const localSamples: Point[] = [];
  for (const local of ring) {
    const x0 = local.ix * cell;
    const z0 = local.iz * cell;
    const x1 = (local.ix + 1) * cell;
    const z1 = (local.iz + 1) * cell;
    localSamples.push([x0, z0], [x1, z0], [x1, z1], [x0, z1], [(local.ix + 0.5) * cell, (local.iz + 0.5) * cell]);
  }
  const localCenters = mask.cells.map((local) => [(local.ix + 0.5) * cell, (local.iz + 0.5) * cell] as Point);
  const built: LocalRingCache = {
    cellFeet: cell,
    localSamples,
    localCenters,
    ringCellCount: ring.length,
  };
  ringCacheByMask.set(mask, built);
  return built;
}

function yawKey(yawDeg: number) {
  // Discrete yaw set is small; quantize to avoid float key churn.
  return Math.round(yawDeg * 1000) / 1000;
}

function worldMaskCacheKey(pose: PlacementPose, rasterFeet: number) {
  const id = pose.maskCacheKey || pose.mask?.meshId || "mask";
  return `${id}|${yawKey(pose.yawDeg)}|${pose.x.toFixed(3)}|${pose.z.toFixed(3)}|${rasterFeet}`;
}

function buildWorldMask(pose: PlacementPose, rasterFeet: number): WorldMaskCache {
  const t0 = performance.now();
  const mask = pose.mask!;
  const local = localRingCache(mask);
  const rad = pose.yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const points: Point[] = local.localCenters.map(([lx, lz]) => [
    pose.x + lx * cos - lz * sin,
    pose.z + lx * sin + lz * cos,
  ]);
  const keys = new Set<string>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minZ = Math.min(minZ, point[1]);
    maxZ = Math.max(maxZ, point[1]);
    keys.add(`${Math.floor(point[0] / rasterFeet)}:${Math.floor(point[1] / rasterFeet)}`);
  }
  const built = { points, keys, minX, maxX, minZ, maxZ };
  if (worldMaskCache.size >= WORLD_CACHE_LIMIT) {
    const first = worldMaskCache.keys().next().value;
    if (first != null) worldMaskCache.delete(first);
  }
  worldMaskCache.set(worldMaskCacheKey(pose, rasterFeet), built);
  activeProfile?.mark("occupancyTransform", performance.now() - t0);
  activeProfile?.count("occupancyTransform");
  return built;
}

function worldMaskForPose(pose: PlacementPose, rasterFeet: number): WorldMaskCache | null {
  if (!pose.mask?.cells.length) return null;
  const key = worldMaskCacheKey(pose, rasterFeet);
  const hit = worldMaskCache.get(key);
  if (hit) {
    activeProfile?.count("worldMaskCacheHit");
    return hit;
  }
  activeProfile?.count("worldMaskCacheMiss");
  return buildWorldMask(pose, rasterFeet);
}

/** World-space centers of architectural occupancy cells. */
export function architecturalMaskWorldPoints(
  mask: ArchitecturalFootprintMask,
  originX: number,
  originZ: number,
  yawDeg: number,
): Point[] {
  return worldMaskForPose({ x: originX, z: originZ, yawDeg, widthFeet: 1, depthFeet: 1, mask }, mask.cellFeet || ARCHITECTURAL_FOOTPRINT_CELL_FEET)?.points
    ?? [];
}

export function architecturalMaskWorldKeys(
  mask: ArchitecturalFootprintMask,
  originX: number,
  originZ: number,
  yawDeg: number,
  rasterFeet = ARCHITECTURAL_FOOTPRINT_CELL_FEET,
): Set<string> {
  return worldMaskForPose({ x: originX, z: originZ, yawDeg, widthFeet: 1, depthFeet: 1, mask }, rasterFeet)?.keys
    ?? new Set();
}

function pointsPermitted(points: Point[], permitted: Polygon[], exclusions: Polygon[]) {
  return footprintPermitted(points, permitted, exclusions);
}

/**
 * Narrow-phase containment: every occupancy **boundary-cell corner** must lie
 * inside a permitted region and outside exclusions. Corner tests (not only
 * centers) prevent ~½-cell geometry from leaking past the boundary.
 * Interior cells are skipped for performance; their boundary ring is tested.
 */
export function architecturalFootprintContained(
  mask: ArchitecturalFootprintMask,
  originX: number,
  originZ: number,
  yawDeg: number,
  permitted: Polygon[],
  exclusions: Polygon[],
): BoundaryEvalResult {
  if (!mask.cells.length) {
    return {
      ok: false,
      phase: "architectural-mask",
      reason: "Architectural footprint mask is empty.",
      envelopeOk: false,
      cornerTested: true,
    };
  }
  const t0 = performance.now();
  const local = localRingCache(mask);
  const rad = yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: Point[] = local.localSamples.map(([lx, lz]) => [
    originX + lx * cos - lz * sin,
    originZ + lx * sin + lz * cos,
  ]);
  const permittedCheck = pointsPermitted(corners, permitted, exclusions);
  activeProfile?.mark("polygonContainment", performance.now() - t0);
  activeProfile?.count("polygonContainment");
  return {
    ok: permittedCheck.ok,
    phase: "architectural-mask",
    reason: permittedCheck.ok
      ? "Architectural occupancy boundary cell corners are inside the permitted region."
      : permittedCheck.reason,
    envelopeOk: false,
    cornerTested: true,
  };
}

/**
 * Two-stage boundary evaluation.
 * Envelope failure alone does not reject when an architectural mask is available
 * and all occupancy cell corners remain inside the polygon.
 */
export function evaluatePlacementBoundary(
  pose: PlacementPose,
  permitted: Polygon[],
  exclusions: Polygon[],
): BoundaryEvalResult {
  const t0 = performance.now();
  const envelope = orientedPlanEnvelope(pose.x, pose.z, pose.widthFeet, pose.depthFeet, pose.yawDeg);
  const envelopeCheck = footprintPermitted(envelope, permitted, exclusions);
  let result: BoundaryEvalResult;
  if (envelopeCheck.ok) {
    if (pose.mask && pose.mask.cells.length) {
      const narrow = architecturalFootprintContained(pose.mask, pose.x, pose.z, pose.yawDeg, permitted, exclusions);
      result = narrow.ok
        ? {
          ok: true,
          phase: "envelope",
          reason: envelopeCheck.reason,
          envelopeOk: true,
          cornerTested: true,
        }
        : { ...narrow, envelopeOk: true };
    } else {
      result = {
        ok: true,
        phase: "envelope",
        reason: envelopeCheck.reason,
        envelopeOk: true,
        cornerTested: false,
      };
    }
  } else if (pose.mask && pose.mask.cells.length) {
    result = { ...architecturalFootprintContained(pose.mask, pose.x, pose.z, pose.yawDeg, permitted, exclusions), envelopeOk: false };
  } else {
    result = {
      ok: false,
      phase: "envelope-fallback",
      reason: envelopeCheck.reason,
      envelopeOk: false,
    };
  }
  activeProfile?.mark("boundaryEval", performance.now() - t0);
  activeProfile?.count("boundaryEval");
  return result;
}

function heightBandsOverlap(
  elevA: number,
  heightA: number,
  elevB: number,
  heightB: number,
) {
  const a0 = elevA;
  const a1 = elevA + Math.max(LATTICE_FEET, heightA);
  const b0 = elevB;
  const b1 = elevB + Math.max(LATTICE_FEET, heightB);
  return a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
}

/** Extruded plan-envelope OBB intersection (plan polygon ∩ + elevation band ∩). */
export function extrudedEnvelopesIntersect3D(a: PlacementPose, b: PlacementPose): boolean {
  const elevA = a.elevation ?? 0;
  const elevB = b.elevation ?? 0;
  const heightA = a.heightFeet ?? LATTICE_FEET;
  const heightB = b.heightFeet ?? LATTICE_FEET;
  if (!heightBandsOverlap(elevA, heightA, elevB, heightB)) return false;
  const envelopeA = orientedPlanEnvelope(a.x, a.z, a.widthFeet, a.depthFeet, a.yawDeg);
  const envelopeB = orientedPlanEnvelope(b.x, b.z, b.widthFeet, b.depthFeet, b.yawDeg);
  return polygonsAreaIntersect(envelopeA, envelopeB) || polygonPlanClearance(envelopeA, envelopeB) < -1e-6;
}

function aabbGap(a: WorldMaskCache, b: WorldMaskCache) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dz = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
  return Math.hypot(dx, dz);
}

/**
 * Plan clearance between two architectural masks (cell-center metric).
 * <0 overlap, 0 contact-ish, >0 separation.
 *
 * Fast path: when requiredClearanceFeet is 0 and occupancy keys do not collide,
 * skip O(n·m) distance (non-overlap of raster keys is sufficient for accept/reject).
 */
export function architecturalMasksPlanClearance(
  a: PlacementPose,
  b: PlacementPose,
  options?: { requiredClearanceFeet?: number; preciseDistance?: boolean },
): number {
  if (!a.mask?.cells.length || !b.mask?.cells.length) return Number.NaN;
  const cell = Math.min(
    a.mask.cellFeet || ARCHITECTURAL_FOOTPRINT_CELL_FEET,
    b.mask.cellFeet || ARCHITECTURAL_FOOTPRINT_CELL_FEET,
  );
  const t0 = performance.now();
  const worldA = worldMaskForPose(a, cell);
  const worldB = worldMaskForPose(b, cell);
  if (!worldA || !worldB) return Number.NaN;

  // AABB prune before key scans.
  const pad = cell * Math.SQRT2;
  if (
    worldA.maxX + pad < worldB.minX
    || worldB.maxX + pad < worldA.minX
    || worldA.maxZ + pad < worldB.minZ
    || worldB.maxZ + pad < worldA.minZ
  ) {
    const gap = aabbGap(worldA, worldB);
    activeProfile?.mark("maskKeyBuild", performance.now() - t0);
    activeProfile?.count("maskAabbReject");
    return gap;
  }

  activeProfile?.count("maskKeyBuild");
  for (const key of worldA.keys) {
    if (worldB.keys.has(key)) {
      activeProfile?.mark("maskKeyBuild", performance.now() - t0);
      activeProfile?.count("maskKeyOverlap");
      return -1;
    }
  }

  const required = options?.requiredClearanceFeet ?? 0;
  const needPrecise = options?.preciseDistance === true || required > 1e-6;
  if (!needPrecise) {
    // Zero-clearance accept: non-overlapping occupancy keys ⇒ non-destructive.
    // Report a conservative measured value from AABB gap (not mesh Boolean proof).
    activeProfile?.mark("maskKeyBuild", performance.now() - t0);
    activeProfile?.count("maskFastZeroClear");
    return Math.max(0, aabbGap(worldA, worldB));
  }

  const t1 = performance.now();
  let min = Infinity;
  const pointsA = worldA.points;
  const pointsB = worldB.points;
  // Spatial bucket on B for approximate neighbor search.
  const bucket = cell * 2;
  const grid = new Map<string, Point[]>();
  for (const pb of pointsB) {
    const gx = Math.floor(pb[0] / bucket);
    const gz = Math.floor(pb[1] / bucket);
    const k = `${gx}:${gz}`;
    const list = grid.get(k);
    if (list) list.push(pb);
    else grid.set(k, [pb]);
  }
  const searchR = Math.ceil((required + cell * 2) / bucket) + 1;
  for (const pa of pointsA) {
    const gx = Math.floor(pa[0] / bucket);
    const gz = Math.floor(pa[1] / bucket);
    for (let dx = -searchR; dx <= searchR; dx += 1) {
      for (let dz = -searchR; dz <= searchR; dz += 1) {
        const list = grid.get(`${gx + dx}:${gz + dz}`);
        if (!list) continue;
        for (const pb of list) {
          min = Math.min(min, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
        }
      }
    }
  }
  activeProfile?.mark("maskDistance", performance.now() - t1);
  activeProfile?.count("maskDistance");
  if (!Number.isFinite(min)) return Math.max(0, aabbGap(worldA, worldB));
  return min - cell * Math.SQRT2 * 0.5;
}

/**
 * Targeted higher-precision check for estimated clearance pairs.
 * Uses occupancy cell *corners* (not only centers) for overlap; still not a
 * triangle mesh Boolean — remains estimated if corners clear but OBBs intersect.
 */
export function refineEstimatedClearance(
  a: PlacementPose,
  b: PlacementPose,
): ClearanceEvalResult {
  if (!a.mask?.cells.length || !b.mask?.cells.length) {
    return {
      ok: false,
      phase: "envelope-fallback",
      measured: null,
      destructive: false,
      confidence: "estimated",
      reason: "Cannot refine estimated clearance without architectural masks.",
    };
  }
  const cell = Math.min(
    a.mask.cellFeet || ARCHITECTURAL_FOOTPRINT_CELL_FEET,
    b.mask.cellFeet || ARCHITECTURAL_FOOTPRINT_CELL_FEET,
  );
  const localA = localRingCache(a.mask);
  const localB = localRingCache(b.mask);
  const radA = a.yawDeg * Math.PI / 180;
  const radB = b.yawDeg * Math.PI / 180;
  const cosA = Math.cos(radA);
  const sinA = Math.sin(radA);
  const cosB = Math.cos(radB);
  const sinB = Math.sin(radB);
  const cornersA = localA.localSamples.map(([lx, lz]) => [
    a.x + lx * cosA - lz * sinA,
    a.z + lx * sinA + lz * cosA,
  ] as Point);
  const cornersB = localB.localSamples.map(([lx, lz]) => [
    b.x + lx * cosB - lz * sinB,
    b.z + lx * sinB + lz * cosB,
  ] as Point);
  const raster = cell * 0.5;
  const keysB = new Set(cornersB.map((p) => `${Math.floor(p[0] / raster)}:${Math.floor(p[1] / raster)}`));
  for (const p of cornersA) {
    if (keysB.has(`${Math.floor(p[0] / raster)}:${Math.floor(p[1] / raster)}`)) {
      return {
        ok: false,
        phase: "mask-corner-refine",
        measured: -1,
        destructive: true,
        confidence: "destructive",
        reason: "Higher-precision occupancy-corner raster reports destructive overlap.",
      };
    }
  }
  const obbHit = extrudedEnvelopesIntersect3D(a, b);
  if (obbHit) {
    return {
      ok: true,
      phase: "mask-corner-refine",
      measured: 0,
      destructive: false,
      confidence: "estimated",
      reason: "Occupancy corners clear but extruded envelopes still intersect — estimated non-destructive (no triangle mesh Boolean).",
    };
  }
  return {
    ok: true,
    phase: "mask-corner-refine",
    measured: 0,
    destructive: false,
    confidence: "verified",
    reason: "Occupancy-corner refine and extruded envelopes agree on non-intersection.",
  };
}

/**
 * Two-stage clearance / destructive collision evaluation with selective 3D OBB screening.
 * 0 ft required clearance allows touch; overlapping architectural occupancy in an
 * overlapping elevation band is treated as destructive.
 */
export function evaluatePlacementClearance(
  candidate: PlacementPose,
  occupied: PlacementPose,
  requiredClearanceFeet: number,
): ClearanceEvalResult {
  const t0 = performance.now();
  const elevA = candidate.elevation ?? 0;
  const elevB = occupied.elevation ?? 0;
  const heightA = candidate.heightFeet ?? LATTICE_FEET;
  const heightB = occupied.heightFeet ?? LATTICE_FEET;
  const verticalOverlap = heightBandsOverlap(elevA, heightA, elevB, heightB);

  // Cheap center-distance prune before envelope work.
  const reach = (Math.hypot(candidate.widthFeet, candidate.depthFeet)
    + Math.hypot(occupied.widthFeet, occupied.depthFeet)) * 0.5
    + Math.max(0, requiredClearanceFeet)
    + LATTICE_FEET;
  const centerDist = Math.hypot(candidate.x - occupied.x, candidate.z - occupied.z);
  if (centerDist > reach) {
    const result: ClearanceEvalResult = {
      ok: true,
      phase: "envelope",
      measured: centerDist - reach + Math.max(0, requiredClearanceFeet),
      destructive: false,
      confidence: "verified",
      reason: "Forms separated beyond combined envelope reach (spatial prune).",
    };
    activeProfile?.mark("clearanceEval", performance.now() - t0);
    activeProfile?.count("clearanceSpatialPrune");
    return result;
  }

  const envelopeA = orientedPlanEnvelope(candidate.x, candidate.z, candidate.widthFeet, candidate.depthFeet, candidate.yawDeg);
  const envelopeB = orientedPlanEnvelope(occupied.x, occupied.z, occupied.widthFeet, occupied.depthFeet, occupied.yawDeg);
  const envelopeClearance = polygonPlanClearance(envelopeA, envelopeB);
  const envelopeViolates = violatesEdgeClearance(envelopeA, envelopeB, requiredClearanceFeet);

  if (!envelopeViolates) {
    const result: ClearanceEvalResult = {
      ok: true,
      phase: "envelope",
      measured: envelopeClearance,
      destructive: false,
      confidence: "verified",
      reason: "Oriented envelopes satisfy required clearance (verified at envelope level).",
    };
    activeProfile?.mark("clearanceEval", performance.now() - t0);
    activeProfile?.count("clearanceEval");
    return result;
  }

  if (!verticalOverlap) {
    const result: ClearanceEvalResult = {
      ok: true,
      phase: "vertical-separation",
      measured: envelopeClearance,
      destructive: false,
      confidence: "verified",
      reason: "Elevation bands do not overlap; 3D envelopes verified non-intersecting.",
    };
    activeProfile?.mark("clearanceEval", performance.now() - t0);
    activeProfile?.count("clearanceEval");
    return result;
  }

  const obbHit = extrudedEnvelopesIntersect3D(candidate, occupied);

  if (candidate.mask?.cells.length && occupied.mask?.cells.length) {
    activeProfile?.count("narrowCollision");
    const maskClearance = architecturalMasksPlanClearance(candidate, occupied, {
      requiredClearanceFeet,
      preciseDistance: requiredClearanceFeet > 1e-6,
    });
    if (!Number.isFinite(maskClearance)) {
      const result: ClearanceEvalResult = {
        ok: false,
        phase: "envelope-fallback",
        measured: envelopeClearance,
        destructive: envelopeClearance < -1e-6,
        confidence: "destructive",
        reason: "Mask clearance unavailable; conservatively rejecting envelope conflict.",
      };
      activeProfile?.mark("clearanceEval", performance.now() - t0);
      activeProfile?.mark("narrowCollision", performance.now() - t0);
      return result;
    }
    if (maskClearance < -1e-6) {
      const result: ClearanceEvalResult = {
        ok: false,
        phase: "architectural-mask",
        measured: maskClearance,
        destructive: true,
        confidence: "destructive",
        reason: "Architectural plan occupancy overlaps in a shared elevation band (destructive).",
      };
      activeProfile?.mark("clearanceEval", performance.now() - t0);
      activeProfile?.mark("narrowCollision", performance.now() - t0);
      return result;
    }
    const required = Math.max(0, requiredClearanceFeet);
    if (maskClearance + 1e-6 >= required) {
      const result: ClearanceEvalResult = {
        ok: true,
        phase: obbHit ? "obb-3d" : "architectural-mask",
        measured: maskClearance,
        destructive: false,
        confidence: obbHit ? "estimated" : "verified",
        reason: obbHit
          ? "Extruded envelopes intersect but architectural occupancy does not — estimated non-destructive (no triangle mesh Boolean)."
          : required <= 1e-6
            ? "Architectural occupancy clear; extruded envelopes do not intersect."
            : "Architectural occupancy satisfies required edge clearance.",
      };
      activeProfile?.mark("clearanceEval", performance.now() - t0);
      activeProfile?.mark("narrowCollision", performance.now() - t0);
      return result;
    }
    const result: ClearanceEvalResult = {
      ok: false,
      phase: "architectural-mask",
      measured: maskClearance,
      destructive: false,
      confidence: "estimated",
      reason: `Architectural occupancy clearance ${maskClearance.toFixed(1)} ft < required ${required.toFixed(1)} ft.`,
    };
    activeProfile?.mark("clearanceEval", performance.now() - t0);
    activeProfile?.mark("narrowCollision", performance.now() - t0);
    return result;
  }

  const result: ClearanceEvalResult = {
    ok: false,
    phase: "envelope-fallback",
    measured: envelopeClearance,
    destructive: envelopeClearance < -1e-6,
    confidence: "destructive",
    reason: "No architectural mask available; conservatively rejecting envelope conflict.",
  };
  activeProfile?.mark("clearanceEval", performance.now() - t0);
  activeProfile?.count("clearanceEval");
  return result;
}

/** Area-based upper bound: how many mean footprints fit in usable × coverage (non-overlapping ideal). */
export function areaBasedFormCapacity(
  usableFeet2: number,
  meanFootprintFeet2: number,
  targetCoveragePercent: number,
) {
  const targetArea = usableFeet2 * Math.max(0, Math.min(100, targetCoveragePercent)) / 100;
  const mean = Math.max(1, meanFootprintFeet2);
  return {
    targetAreaFeet2: targetArea,
    formsForTargetCoverage: Math.ceil(targetArea / mean),
    formsIfFullUsablePacked: Math.floor(usableFeet2 / mean),
    note: "Area bound assumes non-overlapping footprints; irregular polygon packing may be lower.",
  };
}

/** Re-export for callers that need polygon membership without pulling geometry directly. */
export function pointInsideDevelopment(point: Point, permitted: Polygon[], exclusions: Polygon[]) {
  if (!permitted.some((region) => pointInPolygon(point, region))) return false;
  if (exclusions.some((region) => pointInPolygon(point, region))) return false;
  return true;
}
