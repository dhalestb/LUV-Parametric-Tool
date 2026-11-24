import { bayFootprint, distanceToPolyline, footprintPermitted, pointInPolygon, polygonBounds, polygonCentroid, type Point, type Polygon } from "./geometry";
import { LATTICE_FEET } from "../lattice/types";
import type { ClusterZone, DistributionMode, PlacementAnchor, ViewCorridor } from "./types";

/**
 * Site-plane farthest-point seeds, adapted from Lattice `farthestPointSeeds`
 * (lattice/distribution.ts) for continuous (x,z) candidates instead of cell indices.
 */
export function farthestPointSeeds2D(candidates: Point[], count: number, startIndex = 0): Point[] {
  if (!candidates.length || count <= 0) return [];
  const seeds: Point[] = [];
  const taken = new Set<number>();
  const first = Math.max(0, Math.min(candidates.length - 1, startIndex));
  seeds.push(candidates[first]);
  taken.add(first);
  while (seeds.length < Math.min(count, candidates.length)) {
    let bestIndex = -1;
    let bestDist = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      if (taken.has(i)) continue;
      let nearest = Infinity;
      for (const seed of seeds) {
        const dist = Math.hypot(candidates[i][0] - seed[0], candidates[i][1] - seed[1]);
        if (dist < nearest) nearest = dist;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    seeds.push(candidates[bestIndex]);
    taken.add(bestIndex);
  }
  return seeds;
}

/**
 * Architectural-group anchors guided by Dispersion.
 * High dispersion → farthest-point seeds across nearly the full candidate pool.
 * Low dispersion → farthest-point within a localized neighborhood (groups stay geographically close).
 * Soft preference only — never changes quantity or coverage targets.
 */
export function dispersionAwareSeeds2D(
  candidates: Point[],
  count: number,
  startIndex: number,
  dispersionPercent: number,
): Point[] {
  if (!candidates.length || count <= 0) return [];
  const t = Math.max(0, Math.min(100, dispersionPercent)) / 100;
  const start = candidates[Math.max(0, Math.min(candidates.length - 1, startIndex))];
  let maxDist = 0;
  for (const point of candidates) {
    maxDist = Math.max(maxDist, Math.hypot(point[0] - start[0], point[1] - start[1]));
  }
  // Continuous localization: 0% ≈ 20% of site from start; 100% ≈ full site.
  const radius = Math.max(LATTICE_FEET * 2, maxDist * (0.2 + t * 0.8));
  if (t >= 0.98 || radius >= maxDist * 0.98) return farthestPointSeeds2D(candidates, count, startIndex);
  const local = candidates.filter((point) => Math.hypot(point[0] - start[0], point[1] - start[1]) <= radius);
  const pool = local.length >= Math.min(count, 3) ? local : candidates;
  const localStart = Math.max(0, pool.findIndex((point) => point[0] === start[0] && point[1] === start[1]));
  return farthestPointSeeds2D(pool, count, localStart >= 0 ? localStart : 0);
}

export function dispersionSpreadFeet(dispersionPercent: number, region: Polygon) {
  const bounds = polygonBounds(region);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, LATTICE_FEET);
  const t = Math.max(0, Math.min(100, dispersionPercent)) / 100;
  // Low dispersion → compact around seeds; high → prefer distant locations.
  return Math.max(LATTICE_FEET, span * (0.08 + t * 0.42));
}

export function concentrationRadiusFeet(concentrationPercent: number, region: Polygon) {
  const bounds = polygonBounds(region);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, LATTICE_FEET);
  const t = Math.max(0, Math.min(100, concentrationPercent)) / 100;
  // High concentration → tight radius around architectural-cluster seeds.
  return Math.max(LATTICE_FEET * 1.2, span * (0.55 - t * 0.4));
}

export function waterfrontFactor(point: Point, water: Point[], boundsSpan: number) {
  if (water.length < 1) return 0.5;
  const distance = distanceToPolyline(point, water);
  return Math.max(0, Math.min(1, distance / Math.max(40, boundsSpan * 0.35)));
}

export function scoreSiteCandidate(options: {
  zone: ClusterZone;
  region: Polygon;
  origin: Point;
  exclusions: Polygon[];
  water: Point[];
  roads: Point[];
  corridors: ViewCorridor[];
  anchors: PlacementAnchor[];
  mode: DistributionMode;
  dispersionPercent: number;
  seeds: Point[];
  seedIndex: number;
  occupied: Array<{ x: number; z: number }>;
  preferredYawDeg: number;
  /** 0–1. Scales Dispersion/Concentration soft terms. Lower during quantity fill so prefs do not starve count. */
  spatialWeight?: number;
}) {
  const footprint = bayFootprint(options.origin[0], options.origin[1], LATTICE_FEET, options.preferredYawDeg);
  const permitted = footprintPermitted(footprint, [options.region], options.exclusions);
  if (!permitted.ok) return { origin: options.origin, permitted, inland: 0.5, score: -1e6, seedIndex: options.seedIndex };

  const bounds = polygonBounds(options.region);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 80);
  const inland = waterfrontFactor(options.origin, options.water, span);
  const road = options.roads.length ? Math.max(0, 1 - distanceToPolyline(options.origin, options.roads) / 180) : 0;
  const anchorBoost = options.anchors
    .filter((anchor) => !anchor.zoneId || anchor.zoneId === options.zone.id)
    .reduce((best, anchor) => Math.min(best, Math.hypot(options.origin[0] - anchor.point[0], options.origin[1] - anchor.point[1])), 1e9);
  const viewHit = options.corridors.some((corridor) =>
    corridor.points.length > 1 && footprint.some((point) => distanceToPolyline(point, corridor.points) < corridor.widthFeet * 0.5));

  let score = 0;
  const mode = options.mode;
  const waterW = options.zone.waterfrontPriority / 100;
  const acousticW = options.zone.acousticPriority / 100;
  const spatialW = Math.max(0, Math.min(1, options.spatialWeight ?? 1));

  // Balanced baseline — avoid pure greedy corner capture.
  if (mode === "balanced" || mode === "hybrid") {
    score += 25;
    const center = polygonCentroid(options.region);
    const distCenter = Math.hypot(options.origin[0] - center[0], options.origin[1] - center[1]);
    score += Math.max(0, 30 - distCenter / Math.max(20, span * 0.25));
  }
  if (mode === "waterfront" || mode === "hybrid") {
    score += (1 - inland) * waterW * 70;
    score += inland * (1 - waterW) * 12;
  } else {
    score += (1 - inland) * waterW * 35;
    score += inland * (1 - waterW) * 18;
  }
  if (mode === "roadway-buffer" || mode === "hybrid") {
    score += road * acousticW * 70;
  } else {
    score += road * acousticW * 30;
  }
  if (mode === "custom-anchors" || mode === "hybrid" || options.anchors.length) {
    score += Math.max(0, 100 - anchorBoost) * (mode === "custom-anchors" ? 0.9 : 0.35);
  }
  if (viewHit) score -= 40;

  // Dispersion (soft): geographic separation between forms / groups. Never hard-rejects.
  const dispersion = Math.max(0, Math.min(100, options.dispersionPercent)) / 100;
  if (options.occupied.length && spatialW > 0) {
    let nearestOcc = Infinity;
    for (const item of options.occupied) {
      nearestOcc = Math.min(nearestOcc, Math.hypot(item.x - options.origin[0], item.z - options.origin[1]));
    }
    const targetSpread = dispersionSpreadFeet(options.dispersionPercent, options.region);
    score += spatialW * dispersion * Math.min(60, (nearestOcc / targetSpread) * 40);
    if (dispersion < 0.35 && nearestOcc > targetSpread * 1.8) score -= spatialW * 25;
  }

  // Concentration (soft): compactness within the assigned architectural group. Independent of dispersion.
  // Radius shrinks as concentration rises; scoring prefers sites inside that radius. Never hard-rejects.
  if (options.seeds.length && spatialW > 0) {
    const seed = options.seeds[Math.max(0, Math.min(options.seeds.length - 1, options.seedIndex))];
    const distSeed = Math.hypot(options.origin[0] - seed[0], options.origin[1] - seed[1]);
    const concentration = Math.max(0, Math.min(100, options.zone.concentrationPercent ?? 55)) / 100;
    const radius = concentrationRadiusFeet(options.zone.concentrationPercent ?? 55, options.region);
    const proximity = Math.max(0, 45 - (distSeed / Math.max(1, radius)) * 45);
    score += spatialW * (0.35 + concentration * 0.65) * proximity;
  }

  // Mild anti-edge bias so inland-road corners do not monopolize greedy picks under balanced mode.
  if (mode === "balanced") {
    const edgePad = LATTICE_FEET * 1.5;
    const nearEdge =
      options.origin[0] < bounds.minX + edgePad
      || options.origin[0] > bounds.maxX - edgePad
      || options.origin[1] < bounds.minZ + edgePad
      || options.origin[1] > bounds.maxZ - edgePad;
    if (nearEdge) score -= 12;
  }

  return { origin: options.origin, permitted, inland, score, seedIndex: options.seedIndex };
}

export function assignSeedIndex(point: Point, seeds: Point[]) {
  if (!seeds.length) return 0;
  let best = 0;
  let dist = Infinity;
  seeds.forEach((seed, index) => {
    const d = Math.hypot(point[0] - seed[0], point[1] - seed[1]);
    if (d < dist) {
      dist = d;
      best = index;
    }
  });
  return best;
}

export function filterCandidatesNearSeed(candidates: Point[], seed: Point, radius: number) {
  return candidates.filter((point) => Math.hypot(point[0] - seed[0], point[1] - seed[1]) <= radius);
}

export function measureDispersion(points: Array<{ x: number; z: number }>) {
  if (points.length < 2) return { meanNearest: 0, spread: 0, hullApprox: 0 };
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    let nearest = Infinity;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      nearest = Math.min(nearest, Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z));
    }
    sum += nearest;
  }
  const meanNearest = sum / points.length;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cz = points.reduce((s, p) => s + p.z, 0) / points.length;
  const spread = Math.sqrt(points.reduce((s, p) => s + (p.x - cx) ** 2 + (p.z - cz) ** 2, 0) / points.length);
  return { meanNearest, spread, hullApprox: spread * 2 };
}

export function countArchitecturalClusters(points: Array<{ x: number; z: number; architecturalClusterId?: number | null }>, linkFeet: number) {
  const ids = new Set(points.map((item) => item.architecturalClusterId).filter((id): id is number => id != null));
  if (ids.size) return ids.size;
  // Fallback proximity components when cluster IDs are absent.
  const used = new Set<number>();
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (used.has(i)) continue;
    count += 1;
    const queue = [i];
    used.add(i);
    while (queue.length) {
      const current = queue.pop()!;
      for (let j = 0; j < points.length; j += 1) {
        if (used.has(j)) continue;
        if (Math.hypot(points[current].x - points[j].x, points[current].z - points[j].z) <= linkFeet) {
          used.add(j);
          queue.push(j);
        }
      }
    }
  }
  return count;
}

export function candidatesInside(region: Polygon, exclusions: Polygon[], step: number, insetFeet = LATTICE_FEET / 2 + 0.5) {
  const bounds = polygonBounds(region);
  const points: Point[] = [];
  const inset = Math.max(LATTICE_FEET / 2 + 0.5, insetFeet);
  for (let x = bounds.minX + inset; x <= bounds.maxX - inset + 1e-6; x += step) {
    for (let z = bounds.minZ + inset; z <= bounds.maxZ - inset + 1e-6; z += step) {
      const point: Point = [x, z];
      if (!pointInPolygon(point, region)) continue;
      if (exclusions.some((item) => pointInPolygon(point, item))) continue;
      points.push(point);
    }
  }
  if (!points.length) {
    const center = polygonCentroid(region);
    if (pointInPolygon(center, region) && !exclusions.some((item) => pointInPolygon(center, item))) points.push(center);
  }
  return points;
}
