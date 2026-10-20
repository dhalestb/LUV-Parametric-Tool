/**
 * v4 visibility and light evidence: straight mesh ray tests between real
 * standing positions. No voxel adjacency, no transparency assumption.
 */
import { distance, horizontalDirections, sub, type TriangleGrid, type Vec3 } from "./geometry";
import type { CirculationNetwork, NetworkNode } from "./circulation";
import type { FloorField } from "./surfaces";

/** Default eye height above the floor surface. Configurable per evaluation. */
export const EYE_HEIGHT_FEET = 5.5;
/** Plan stride between viewing positions in feet. */
export const VIEW_STRIDE_FEET = 3;
/** Targets tested per viewing position. */
export const TARGETS_PER_ORIGIN = 24;
/** Height above the floor where light probes start. */
export const LIGHT_PROBE_HEIGHT_FEET = 4;

export type SightRay = {
  a: Vec3;
  b: Vec3;
  /** Blocked rays record the first obstruction. */
  blockedAt: Vec3 | null;
  clear: boolean;
  fromLevelId: number;
  toLevelId: number;
  fromRegionId: number;
  toRegionId: number;
};

export type VisibilityResult = {
  eyeHeight: number;
  origins: NetworkNode[];
  rays: SightRay[];
  tested: number;
  clear: number;
  /** Mean clear sightline length in feet. Null when no clear rays. */
  meanClearLength: number | null;
  /** Same-level region pairs tested and connected by at least one clear ray. */
  regionPairsTested: number;
  regionPairsConnected: number;
};

function viewOrigins(network: CirculationNetwork, field: FloorField, eyeHeight: number): NetworkNode[] {
  const stride = Math.max(1, Math.round(VIEW_STRIDE_FEET / field.sampleFeet));
  return network.nodes.filter((node) => {
    const sample = field.samples[node.sampleId];
    if (sample.ix % stride || sample.iy % stride) return false;
    if (sample.floorClass === "exposed") return false;
    return sample.clearance === null || sample.clearance > eyeHeight;
  });
}

function pickTargets<T>(items: T[], count: number, offset: number): T[] {
  if (items.length <= count) return items;
  const stride = items.length / count;
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) picked.push(items[Math.floor((index * stride + offset) % items.length)]);
  return picked;
}

/** Same-level sightlines between viewing positions grouped by detected level. */
export function sameLevelVisibility(network: CirculationNetwork, field: FloorField, grid: TriangleGrid, eyeHeight = EYE_HEIGHT_FEET): VisibilityResult {
  const origins = viewOrigins(network, field, eyeHeight);
  const rays: SightRay[] = [];
  const byLevel = new Map<number, NetworkNode[]>();
  for (const origin of origins) (byLevel.get(origin.levelId) ?? byLevel.set(origin.levelId, []).get(origin.levelId)!).push(origin);
  const pairKeys = new Set<string>();
  const connectedKeys = new Set<string>();
  let clearLength = 0;
  for (const [, group] of [...byLevel.entries()].sort((left, right) => left[0] - right[0])) {
    for (let index = 0; index < group.length; index += 1) {
      const origin = group[index];
      const others = group.filter((node) => node.id !== origin.id);
      for (const target of pickTargets(others, TARGETS_PER_ORIGIN, index)) {
        if (target.id < origin.id && others.length <= TARGETS_PER_ORIGIN) continue; // each pair once when fully enumerated
        const a: Vec3 = [origin.position[0], origin.position[1], origin.position[2] + eyeHeight];
        const b: Vec3 = [target.position[0], target.position[1], target.position[2] + eyeHeight];
        const hit = grid.raycast(a, sub(b, a), distance(a, b) - 1e-6);
        const ray: SightRay = {
          a,
          b,
          blockedAt: hit ? hit.point : null,
          clear: !hit,
          fromLevelId: origin.levelId,
          toLevelId: target.levelId,
          fromRegionId: origin.regionId,
          toRegionId: target.regionId,
        };
        rays.push(ray);
        if (origin.regionId >= 0 && target.regionId >= 0 && origin.regionId !== target.regionId) {
          const key = origin.regionId < target.regionId ? `${origin.regionId}-${target.regionId}` : `${target.regionId}-${origin.regionId}`;
          pairKeys.add(key);
          if (!hit) connectedKeys.add(key);
        }
        if (!hit) clearLength += distance(a, b);
      }
    }
  }
  const clear = rays.filter((ray) => ray.clear).length;
  return {
    eyeHeight,
    origins,
    rays,
    tested: rays.length,
    clear,
    meanClearLength: clear ? clearLength / clear : null,
    regionPairsTested: pairKeys.size,
    regionPairsConnected: connectedKeys.size,
  };
}

/** Sightlines between viewing positions on different levels. */
export function crossLevelVisibility(network: CirculationNetwork, field: FloorField, grid: TriangleGrid, eyeHeight = EYE_HEIGHT_FEET): VisibilityResult {
  const origins = viewOrigins(network, field, eyeHeight);
  const rays: SightRay[] = [];
  let clearLength = 0;
  const pairKeys = new Set<string>();
  const connectedKeys = new Set<string>();
  for (let index = 0; index < origins.length; index += 1) {
    const origin = origins[index];
    const others = origins.filter((node) => node.levelId !== origin.levelId);
    for (const target of pickTargets(others, Math.ceil(TARGETS_PER_ORIGIN / 2), index)) {
      if (target.id < origin.id && others.length <= Math.ceil(TARGETS_PER_ORIGIN / 2)) continue;
      const a: Vec3 = [origin.position[0], origin.position[1], origin.position[2] + eyeHeight];
      // Look at the other level's floor-plus-waist so a balcony edge counts as a view.
      const b: Vec3 = [target.position[0], target.position[1], target.position[2] + Math.min(eyeHeight, 3)];
      const hit = grid.raycast(a, sub(b, a), distance(a, b) - 1e-6);
      rays.push({
        a,
        b,
        blockedAt: hit ? hit.point : null,
        clear: !hit,
        fromLevelId: origin.levelId,
        toLevelId: target.levelId,
        fromRegionId: origin.regionId,
        toRegionId: target.regionId,
      });
      const key = origin.levelId < target.levelId ? `${origin.levelId}-${target.levelId}` : `${target.levelId}-${origin.levelId}`;
      pairKeys.add(key);
      if (!hit) {
        connectedKeys.add(key);
        clearLength += distance(a, b);
      }
    }
  }
  const clear = rays.filter((ray) => ray.clear).length;
  return {
    eyeHeight,
    origins,
    rays,
    tested: rays.length,
    clear,
    meanClearLength: clear ? clearLength / clear : null,
    regionPairsTested: pairKeys.size,
    regionPairsConnected: connectedKeys.size,
  };
}

export type LightProbe = {
  origin: Vec3;
  sampleId: number;
  levelId: number;
  /** Fraction of upper-hemisphere rays that escape the form. */
  overhead: number;
  /** Fraction of horizontal rays that escape the form. */
  lateral: number;
  /** Feet to the first lateral obstruction, averaged over blocked lateral rays. Null when all escape. */
  lateralDepth: number | null;
  escapedRays: Array<{ a: Vec3; b: Vec3; kind: "overhead" | "lateral" }>;
  blockedRays: Array<{ a: Vec3; b: Vec3; kind: "overhead" | "lateral" }>;
};

export type LightResult = {
  probes: LightProbe[];
  /** Interior samples excluded as exterior roof exposure. */
  excludedExposed: number;
  overheadMean: number | null;
  lateralMean: number | null;
  litShare: number | null;
  /** Mean lateral penetration depth of blocked lateral rays in feet. */
  lateralDepthMean: number | null;
};

/** Potential natural-light penetration from above and from the sides. */
export function lightExposure(network: CirculationNetwork, field: FloorField, grid: TriangleGrid): LightResult {
  const stride = Math.max(1, Math.round(VIEW_STRIDE_FEET / field.sampleFeet));
  const probes: LightProbe[] = [];
  let excludedExposed = 0;
  const reach = field.sampleFeet * Math.max(field.gridDims[0], field.gridDims[1]) + 4;
  const verticalReach = reach + 40;
  const overheadDirections: Vec3[] = [[0, 0, 1], ...horizontalDirections(8).map((direction): Vec3 => [direction[0] * Math.SQRT1_2, direction[1] * Math.SQRT1_2, Math.SQRT1_2])];
  const lateralDirections = horizontalDirections(8);
  for (const node of network.nodes) {
    const sample = field.samples[node.sampleId];
    if (sample.ix % stride || sample.iy % stride) continue;
    if (sample.floorClass === "exposed" || sample.floorClass === "uncertain") {
      excludedExposed += 1;
      continue;
    }
    if (sample.floorClass === "obstructed") continue;
    const height = Math.min(LIGHT_PROBE_HEIGHT_FEET, (sample.clearance ?? 20) * 0.8);
    const origin: Vec3 = [sample.position[0], sample.position[1], sample.position[2] + height];
    const escapedRays: LightProbe["escapedRays"] = [];
    const blockedRays: LightProbe["blockedRays"] = [];
    let overheadEscaped = 0;
    for (const direction of overheadDirections) {
      const hit = grid.raycast(origin, direction, verticalReach, { skipTriangle: sample.triangleId });
      const end: Vec3 = hit ? hit.point : [origin[0] + direction[0] * 6, origin[1] + direction[1] * 6, origin[2] + direction[2] * 6];
      if (hit) blockedRays.push({ a: origin, b: end, kind: "overhead" });
      else {
        overheadEscaped += 1;
        escapedRays.push({ a: origin, b: end, kind: "overhead" });
      }
    }
    let lateralEscaped = 0;
    let depthSum = 0;
    let depthCount = 0;
    for (const direction of lateralDirections) {
      const hit = grid.raycast(origin, direction, reach, { skipTriangle: sample.triangleId });
      if (hit) {
        blockedRays.push({ a: origin, b: hit.point, kind: "lateral" });
        depthSum += hit.distance;
        depthCount += 1;
      } else {
        lateralEscaped += 1;
        escapedRays.push({ a: origin, b: [origin[0] + direction[0] * 6, origin[1] + direction[1] * 6, origin[2]], kind: "lateral" });
      }
    }
    probes.push({
      origin,
      sampleId: sample.id,
      levelId: node.levelId,
      overhead: overheadEscaped / overheadDirections.length,
      lateral: lateralEscaped / lateralDirections.length,
      lateralDepth: depthCount ? depthSum / depthCount : null,
      escapedRays,
      blockedRays,
    });
  }
  if (!probes.length) return { probes, excludedExposed, overheadMean: null, lateralMean: null, litShare: null, lateralDepthMean: null };
  const depths = probes.filter((probe) => probe.lateralDepth !== null).map((probe) => probe.lateralDepth as number);
  return {
    probes,
    excludedExposed,
    overheadMean: probes.reduce((sum, probe) => sum + probe.overhead, 0) / probes.length,
    lateralMean: probes.reduce((sum, probe) => sum + probe.lateral, 0) / probes.length,
    litShare: probes.filter((probe) => probe.overhead > 0 || probe.lateral > 0).length / probes.length,
    lateralDepthMean: depths.length ? depths.reduce((sum, value) => sum + value, 0) / depths.length : null,
  };
}
