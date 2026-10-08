import { beginGeometryValidation, geometryRevision } from "./geometryRevision";
import { connectionDiagnostic, startConnectionTiming } from "./connectionDiagnostics";
import type { ConnectionReport, PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { placementWorldZ } from "./types";
import { transitionSections } from "./transitionGeometry";

/** Endpoints farther than this from a usable surface are open-space terminations. */
export const SURFACE_CONTACT_TOLERANCE = 0.2;
/** Voxel candidates can sit inside a form. The snap stays in the shared-face neighborhood, not across the whole mesh. */
export const ATTACHMENT_SEARCH_RADIUS = 8;
/** Two walkable surfaces this close are a real interface, not a voxel coincidence. */
export const INTERFACE_TOLERANCE = 0.25;
const WALKABLE_NORMAL_Z = 0.7;
const CELL = 4;

export type SurfaceKind = "floor" | "edge" | "wall" | "underside" | "open";

export type SurfaceGap = {
  distance: number;
  kind: SurfaceKind;
  normalZ: number;
};

export type WalkableAnchor = {
  point: Vec3;
  run: [Vec3, Vec3];
  width: number;
  outward: Vec3;
  kind: "edge";
  snap: number;
};

type Triangle = { a: Vec3; b: Vec3; c: Vec3; nz: number; min: Vec3; max: Vec3; walkable: boolean };
type Run = { a: Vec3; b: Vec3; mid: Vec3; length: number; outward: Vec3; min: Vec3; max: Vec3 };
type SurfaceIndex = { triangles: Triangle[]; runs: Run[]; triGrid: Map<string, number[]>; runGrid: Map<string, number[]>; min: Vec3; max: Vec3 };

const indexCache = new WeakMap<object, SurfaceIndex>();
const gapCache = new WeakMap<object, Map<string, SurfaceGap>>();
const interfaceCache = new Map<string, { meets: boolean; elevation: number }>();

const sub = (a: Vec3, b: Vec3) => a.map((value, index) => value - b[index]) as Vec3;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, factor: number) => a.map((value) => value * factor) as Vec3;
const add = (a: Vec3, b: Vec3) => a.map((value, index) => value + b[index]) as Vec3;
const hypot3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

function variantOf(model: TileModel, tile: PlacedTile) {
  return model.variants[tile.variant] ?? model.variants[0];
}

/** Inverse of the rendered tile root: lattice, then rotation, then mirror, back to the anchored source. */
export function localPoint(point: Vec3, tile: PlacedTile, model: TileModel): Vec3 {
  const variant = variantOf(model, tile);
  const angle = -variant.rotation * Math.PI / 180;
  const x = point[0] - tile.ix * 20;
  const y = point[1] - tile.iy * 20;
  const rx = x * Math.cos(angle) - y * Math.sin(angle);
  const ry = x * Math.sin(angle) + y * Math.cos(angle);
  return [variant.mirror === "x" ? -rx : rx, variant.mirror === "y" ? -ry : ry, point[2] - placementWorldZ(tile)];
}

export function worldFromLocal(point: Vec3, tile: PlacedTile, model: TileModel): Vec3 {
  const variant = variantOf(model, tile);
  const x = variant.mirror === "x" ? -point[0] : point[0];
  const y = variant.mirror === "y" ? -point[1] : point[1];
  const angle = variant.rotation * Math.PI / 180;
  const rx = x * Math.cos(angle) - y * Math.sin(angle);
  const ry = x * Math.sin(angle) + y * Math.cos(angle);
  return [tile.ix * 20 + rx, tile.iy * 20 + ry, placementWorldZ(tile) + point[2]];
}

function worldDirection(direction: Vec3, tile: PlacedTile, model: TileModel): Vec3 {
  const origin = worldFromLocal([0, 0, 0], tile, model);
  const tip = worldFromLocal(direction, tile, model);
  const delta = sub(tip, origin);
  const length = Math.hypot(delta[0], delta[1]) || 1;
  return [delta[0] / length, delta[1] / length, 0];
}

function pushGrid(grid: Map<string, number[]>, key: string, index: number) {
  const bucket = grid.get(key);
  if (bucket) bucket.push(index);
  else grid.set(key, [index]);
}

function fillGrid(grid: Map<string, number[]>, min: Vec3, max: Vec3, index: number) {
  const x0 = Math.floor(min[0] / CELL);
  const y0 = Math.floor(min[1] / CELL);
  const z0 = Math.floor(min[2] / CELL);
  const x1 = Math.floor(max[0] / CELL);
  const y1 = Math.floor(max[1] / CELL);
  const z1 = Math.floor(max[2] / CELL);
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) pushGrid(grid, `${x},${y},${z}`, index);
    }
  }
}

function closestOnSegment(point: Vec3, a: Vec3, b: Vec3) {
  const ab = sub(b, a);
  const length2 = dot(ab, ab);
  const t = length2 <= 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(point, a), ab) / length2));
  const closest = add(a, scale(ab, t));
  return { point: closest, distance: hypot3(sub(point, closest)), t };
}

function closestOnTriangle(point: Vec3, triangle: Triangle): Vec3 {
  const ab = sub(triangle.b, triangle.a);
  const ac = sub(triangle.c, triangle.a);
  const ap = sub(point, triangle.a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return triangle.a;
  const bp = sub(point, triangle.b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return triangle.b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(triangle.a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(point, triangle.c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return triangle.c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(triangle.a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return add(triangle.b, scale(sub(triangle.c, triangle.b), w));
  }
  const denom = 1 / (va + vb + vc);
  return add(triangle.a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

function boundsOf(points: Vec3[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max };
}

function buildIndex(surface: { positions: Float32Array; triangles: number[] }): SurfaceIndex {
  const revision = geometryRevision(surface);
  const cached = indexCache.get(revision);
  if (cached) return cached;
  const triangles: Triangle[] = [];
  const triGrid = new Map<string, number[]>();
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < surface.triangles.length; index += 3) {
    const at = (vertex: number) => Array.from(surface.positions.slice(vertex * 3, vertex * 3 + 3)) as Vec3;
    const a = at(surface.triangles[index]);
    const b = at(surface.triangles[index + 1]);
    const c = at(surface.triangles[index + 2]);
    const ab = sub(b, a);
    const ac = sub(c, a);
    const normal: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = hypot3(normal);
    const nz = length > 1e-8 ? normal[2] / length : 0;
    const box = boundsOf([a, b, c]);
    const triangle = { a, b, c, nz, min: box.min, max: box.max, walkable: nz >= WALKABLE_NORMAL_Z };
    triangles.push(triangle);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
    fillGrid(triGrid, box.min, box.max, triangles.length - 1);
  }

  const edges = new Map<string, { a: Vec3; b: Vec3; count: number; outward: Vec3 }>();
  const keyOf = (point: Vec3) => point.map((value) => value.toFixed(4)).join(",");
  for (const triangle of triangles) {
    if (!triangle.walkable) continue;
    const centroid: Vec3 = [
      (triangle.a[0] + triangle.b[0] + triangle.c[0]) / 3,
      (triangle.a[1] + triangle.b[1] + triangle.c[1]) / 3,
      (triangle.a[2] + triangle.b[2] + triangle.c[2]) / 3,
    ];
    const corners = [triangle.a, triangle.b, triangle.c];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge];
      const b = corners[(edge + 1) % 3];
      const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const length = Math.hypot(delta[0], delta[1]);
      if (length < 1e-4 || Math.abs(delta[2]) > 0.08) continue;
      const id = [keyOf(a), keyOf(b)].sort().join("|");
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const left: Vec3 = [-delta[1] / length, delta[0] / length, 0];
      const towardCentroid = (centroid[0] - mid[0]) * left[0] + (centroid[1] - mid[1]) * left[1];
      const outward: Vec3 = towardCentroid > 0 ? [-left[0], -left[1], 0] : left;
      const existing = edges.get(id);
      if (existing) existing.count += 1;
      else edges.set(id, { a, b, count: 1, outward });
    }
  }

  const groups = new Map<string, Array<{ a: Vec3; b: Vec3; outward: Vec3 }>>();
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue;
    const dx = edge.b[0] - edge.a[0];
    const dy = edge.b[1] - edge.a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) continue;
    const ux = dx / length;
    const uy = dy / length;
    const id = [ux, uy, -uy * edge.a[0] + ux * edge.a[1], edge.a[2]].map((value) => value.toFixed(3)).join(",");
    const group = groups.get(id) ?? [];
    group.push(edge);
    groups.set(id, group);
  }

  const runs: Run[] = [];
  const runGrid = new Map<string, number[]>();
  for (const group of groups.values()) {
    const direction = sub(group[0].b, group[0].a);
    const project = (point: Vec3) => point[0] * direction[0] + point[1] * direction[1];
    group.sort((left, right) => project(left.a) - project(right.a));
    let current: { a: Vec3; b: Vec3; outward: Vec3 } | undefined;
    const flush = () => {
      if (!current) return;
      const length = Math.hypot(current.b[0] - current.a[0], current.b[1] - current.a[1]);
      const rise = Math.abs(current.b[2] - current.a[2]);
      if (length >= 2 && rise / length <= 0.2) {
        const outwardLength = Math.hypot(current.outward[0], current.outward[1]) || 1;
        const run: Run = {
          a: current.a,
          b: current.b,
          mid: [(current.a[0] + current.b[0]) / 2, (current.a[1] + current.b[1]) / 2, (current.a[2] + current.b[2]) / 2],
          length,
          outward: [current.outward[0] / outwardLength, current.outward[1] / outwardLength, 0],
          min: [Math.min(current.a[0], current.b[0]), Math.min(current.a[1], current.b[1]), Math.min(current.a[2], current.b[2])],
          max: [Math.max(current.a[0], current.b[0]), Math.max(current.a[1], current.b[1]), Math.max(current.a[2], current.b[2])],
        };
        runs.push(run);
        fillGrid(runGrid, run.min, run.max, runs.length - 1);
      }
      current = undefined;
    };
    for (const edge of group) {
      if (current && Math.hypot(edge.a[0] - current.b[0], edge.a[1] - current.b[1], edge.a[2] - current.b[2]) < 0.02) {
        current.b = edge.b;
        current.outward = add(current.outward, edge.outward);
      } else {
        flush();
        current = { a: edge.a, b: edge.b, outward: edge.outward };
      }
    }
    flush();
  }

  const index = { triangles, runs, triGrid, runGrid, min, max };
  indexCache.set(revision, index);
  return index;
}

function surfaceIndex(model: TileModel) {
  return model.connectionSurface ? buildIndex(model.connectionSurface) : null;
}

/** Opt-in Stage 2A discovery, independent of the 32-port and 18-feature caps.
 * Windows are proposals only; callers must validate the emitted section and circulation.
 */
export function enumerateWalkableAttachments(model: TileModel, tile: PlacedTile, limit = 64) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new Error("Attachment budget must be 1..256");
  const finish = beginGeometryValidation();
  try {
    const index = surfaceIndex(model);
    const groups = (index?.runs ?? []).map((run, runIndex) => {
      const windows: Array<WalkableAnchor & { id: string }> = [];
      for (const width of [3, 2.1]) {
        if (width > run.length) continue;
        for (const fraction of [.5, .2, .8]) {
          const t = Math.max(width / (2 * run.length), Math.min(1 - width / (2 * run.length), fraction));
          const point = worldFromLocal(add(run.a, scale(sub(run.b, run.a), t)), tile, model);
          const profile = edgeWindow([worldFromLocal(run.a, tile, model), worldFromLocal(run.b, tile, model)], point, width);
          if (!profile) continue;
          windows.push({ id: `surface-${runIndex}-${width}-${fraction}`, point: profileMidpoint(profile), run: profile,
            width, outward: worldDirection(run.outward, tile, model), kind: "edge", snap: 0 });
        }
      }
      return windows;
    });
    // Round-robin retains different source regions before alternate widths/windows on one region.
    const all: Array<WalkableAnchor & { id: string }> = [];
    const seen = new Set<string>();
    for (let window = 0; window < 6; window++) for (const group of groups) {
      const anchor = group[window];
      if (!anchor) continue;
      const key = JSON.stringify([anchor.run, anchor.outward]);
      if (!seen.has(key)) { seen.add(key); all.push(anchor); }
    }
    return { anchors: all.slice(0, limit), runs: index?.runs.length ?? 0, available: all.length, omitted: Math.max(0, all.length - limit) };
  } finally { finish(); }
}

function cellsNear(point: Vec3, radius: number) {
  const keys: string[] = [];
  const reach = Math.ceil(radius / CELL);
  const cx = Math.floor(point[0] / CELL);
  const cy = Math.floor(point[1] / CELL);
  const cz = Math.floor(point[2] / CELL);
  for (let x = cx - reach; x <= cx + reach; x += 1) {
    for (let y = cy - reach; y <= cy + reach; y += 1) {
      for (let z = cz - reach; z <= cz + reach; z += 1) keys.push(`${x},${y},${z}`);
    }
  }
  return keys;
}

function classify(distance: number, normalZ: number, nearEdge: boolean): SurfaceKind {
  if (distance > 1) return "open";
  if (normalZ <= -0.65) return "underside";
  if (normalZ >= 0.65) return nearEdge ? "edge" : "floor";
  return "wall";
}

export function measureSurfaceGap(model: TileModel, tile: PlacedTile, worldPoint: Vec3, radius = 6, walkableWithin = SURFACE_CONTACT_TOLERANCE): SurfaceGap {
  const index = surfaceIndex(model);
  if (!index) return { distance: Infinity, kind: "open", normalZ: 0 };
  const local = localPoint(worldPoint, tile, model);
  const revision = geometryRevision(model.connectionSurface!);
  let gaps = gapCache.get(revision);
  if (!gaps) { gaps = new Map(); gapCache.set(revision, gaps); }
  const key = JSON.stringify([local, radius, walkableWithin]);
  const cached = gaps.get(key);
  if (cached) { connectionDiagnostic("cache", "surface gap hit"); return {...cached}; }
  connectionDiagnostic("cache", "surface gap miss");
  const remember = (gap: SurfaceGap) => {
    if (gaps.size >= 8192) gaps.delete(gaps.keys().next().value!);
    gaps.set(key, gap);
    return {...gap};
  };
  let best = Infinity;
  let bestNz = 0;
  let bestPoint: Vec3 | null = null;
  let walkable = Infinity;
  let walkableNz = 0;
  let walkablePoint: Vec3 | null = null;
  const seen = new Set<number>();
  for (const key of cellsNear(local, radius)) {
    for (const triangleIndex of index.triGrid.get(key) ?? []) {
      if (seen.has(triangleIndex)) continue;
      seen.add(triangleIndex);
      const triangle = index.triangles[triangleIndex];
      if (local[0] < triangle.min[0] - radius || local[0] > triangle.max[0] + radius) continue;
      if (local[1] < triangle.min[1] - radius || local[1] > triangle.max[1] + radius) continue;
      if (local[2] < triangle.min[2] - radius || local[2] > triangle.max[2] + radius) continue;
      // A triangle cannot beat either incumbent if its bounding box is farther away.
      const lowerBound = Math.hypot(...local.map((value, axis) => Math.max(triangle.min[axis] - value, 0, value - triangle.max[axis])));
      if (lowerBound > best && (!triangle.walkable || lowerBound > walkable)) continue;
      const closest = closestOnTriangle(local, triangle);
      const distance = hypot3(sub(local, closest));
      if (distance < best) {
        best = distance;
        bestNz = triangle.nz;
        bestPoint = closest;
      }
      if (triangle.walkable && distance < walkable) {
        walkable = distance;
        walkableNz = triangle.nz;
        walkablePoint = closest;
      }
    }
  }
  const useWalkable = walkable <= walkableWithin;
  const distance = useWalkable ? walkable : best;
  const normalZ = useWalkable ? walkableNz : bestNz;
  const point = useWalkable ? walkablePoint : bestPoint;
  let nearEdge = false;
  if (point && distance <= 1) {
    for (const key of cellsNear(point, 0.4)) {
      for (const runIndex of index.runGrid.get(key) ?? []) {
        const run = index.runs[runIndex];
        if (closestOnSegment(point, run.a, run.b).distance <= 0.2) nearEdge = true;
      }
    }
  }
  if (!Number.isFinite(distance)) return remember({ distance: Infinity, kind: "open", normalZ: 0 });
  return remember({ distance, kind: classify(distance, normalZ, nearEdge), normalZ });
}

function gapAccepts(gap: SurfaceGap, allowWall: boolean, tolerance = SURFACE_CONTACT_TOLERANCE) {
  if (gap.distance > tolerance) return false;
  if (gap.kind === "floor" || gap.kind === "edge") return true;
  return allowWall && gap.kind === "wall";
}

function resolveModel(models: TileModel[], id: string) {
  return models.find((model) => model.id === id) ?? models.find((model) => model.id === id.split("::")[0]);
}

function sectionMeets(pair: PortPair, end: "start" | "end", models: TileModel[], tiles: PlacedTile[], allowWall: boolean) {
  const sections = transitionSections(pair);
  const section = end === "start" ? sections[0] : sections[sections.length - 1];
  const tileId = end === "start" ? pair.tileA : pair.tileB;
  const tile = tiles.find((item) => item.id === tileId);
  const model = tile ? resolveModel(models, tileId) : undefined;
  if (!tile || !model?.connectionSurface || !section) return true;
  const half = section.width / 2;
  const center = section.center;
  const sides: Vec3[] = [
    [center[0] + section.side[0] * half, center[1] + section.side[1] * half, center[2] + section.side[2] * half],
    [center[0] - section.side[0] * half, center[1] - section.side[1] * half, center[2] - section.side[2] * half],
  ];
  if (!gapAccepts(measureSurfaceGap(model, tile, center, 1), allowWall)) return false;
  return sides.every((point) => gapAccepts(measureSurfaceGap(model, tile, point, 1, 0.45), allowWall, 0.45));
}

/** Shrink each loft end until its real section sits on a suitable surface. */
export function fitLoftContact(pair: PortPair, models: TileModel[], tiles: PlacedTile[], allowWall: boolean) {
  const finishGeometry = beginGeometryValidation();
  try {
  const finishTiming = startConnectionTiming("surface attachment selection");
  try {
  const ends: Array<{ key: "startWidth" | "endWidth"; which: "start" | "end" }> = [
    { key: "startWidth", which: "start" },
    { key: "endWidth", which: "end" },
  ];
  for (const end of ends) {
    const tile = tiles.find((item) => item.id === (end.which === "start" ? pair.tileA : pair.tileB));
    const model = tile ? resolveModel(models, tile.id) : undefined;
    if (!tile || !model?.connectionSurface) continue;
    const requested = pair[end.key] ?? pair.usableWidth;
    const steps: number[] = [];
    let width = requested;
    while (width > 2) {
      steps.push(width);
      const next = Math.max(2, width - 0.5);
      if (next === width) break;
      width = next;
    }
    steps.push(Math.max(2, Math.min(requested, 2)));
    let accepted = 0;
    for (const candidate of steps) {
      pair[end.key] = candidate;
      if (sectionMeets(pair, end.which, models, tiles, allowWall)) {
        accepted = candidate;
        break;
      }
    }
    if (accepted < 2) { connectionDiagnostic("attachment", "insufficient attached width", { pair, end: end.which, requested, minimum: 2 }); return false; }
    pair[end.key] = accepted;
  }
  pair.usableWidth = Math.min(pair.startWidth ?? pair.usableWidth, pair.endWidth ?? pair.usableWidth);
  return pair.usableWidth >= 2;

  } finally { finishTiming(); }

  } finally { finishGeometry(); }
}

/** A window of `width` centered on `point` and clamped to the source edge. */
export function edgeWindow(run: [Vec3, Vec3], point: Vec3, width: number): [Vec3, Vec3] | null {
  const ab = sub(run[1], run[0]);
  const length = hypot3(ab);
  if (length < 2 || width < 2) return null;
  const use = Math.min(width, length);
  const t = dot(sub(point, run[0]), ab) / (length * length);
  const half = use / 2 / length;
  const centerT = Math.max(half, Math.min(1 - half, t));
  const center = add(run[0], scale(ab, centerT));
  const offset = scale(ab, half);
  return [sub(center, offset), add(center, offset)];
}

export function profileMidpoint(profile: [Vec3, Vec3]): Vec3 {
  return [(profile[0][0] + profile[1][0]) / 2, (profile[0][1] + profile[1][1]) / 2, (profile[0][2] + profile[1][2]) / 2];
}

export function profileLength(profile: [Vec3, Vec3]) {
  return Math.hypot(profile[1][0] - profile[0][0], profile[1][1] - profile[0][1], profile[1][2] - profile[0][2]);
}

/** Snap a voxel candidate to a walkable boundary that faces the other form. Walls and undersides are not landings. */
export function resolveWalkableAttachment(
  model: TileModel,
  tile: PlacedTile,
  candidate: Vec3,
  toward: Vec3,
  maxWidth = 6,
): WalkableAnchor | null {
  const finishTiming = startConnectionTiming("surface attachment selection");
  try {
  const index = surfaceIndex(model);
  if (!index || !index.runs.length) { connectionDiagnostic("attachment", "no candidate attachment", { tile, source: model.filename, candidate }); return null; }
  const local = localPoint(candidate, tile, model);
  const target = localPoint(toward, tile, model);
  const towardDelta = sub(target, local);
  const towardLength = Math.hypot(towardDelta[0], towardDelta[1]);
  const seen = new Set<number>();
  let best: { run: Run; distance: number; facing: number } | null = null;
  for (const key of cellsNear(local, ATTACHMENT_SEARCH_RADIUS)) {
    for (const runIndex of index.runGrid.get(key) ?? []) {
      if (seen.has(runIndex)) continue;
      seen.add(runIndex);
      const run = index.runs[runIndex];
      const closest = closestOnSegment(local, run.a, run.b);
      if (closest.distance > ATTACHMENT_SEARCH_RADIUS) { connectionDiagnostic("attachment", "proximity", { tile, candidate, distance: closest.distance }); continue; }
      const facing = towardLength < 0.2 ? 1 : (run.outward[0] * towardDelta[0] + run.outward[1] * towardDelta[1]) / towardLength;
      if (facing <= 0) { connectionDiagnostic("attachment", "facing", { tile, candidate, facing }); continue; }
      if (!best || closest.distance < best.distance - 0.05 || (Math.abs(closest.distance - best.distance) <= 0.05 && facing > best.facing)) {
        best = { run, distance: closest.distance, facing };
      }
    }
  }
  if (!best) { connectionDiagnostic("attachment", "no candidate attachment", { tile, source: model.filename, candidate, toward }); return null; }
  const a = worldFromLocal(best.run.a, tile, model);
  const b = worldFromLocal(best.run.b, tile, model);
  const point = worldFromLocal(closestOnSegment(local, best.run.a, best.run.b).point, tile, model);
  return {
    point,
    run: [a, b],
    width: Math.min(maxWidth, best.run.length),
    outward: worldDirection(best.run.outward, tile, model),
    kind: "edge",
    snap: best.distance,
  };

  } finally { finishTiming(); }
}

function worldBox(model: TileModel, tile: PlacedTile) {
  const index = surfaceIndex(model);
  if (!index || !Number.isFinite(index.min[0])) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const x of [index.min[0], index.max[0]]) {
    for (const y of [index.min[1], index.max[1]]) {
      for (const z of [index.min[2], index.max[2]]) {
        const world = worldFromLocal([x, y, z], tile, model);
        minX = Math.min(minX, world[0]);
        minY = Math.min(minY, world[1]);
        minZ = Math.min(minZ, world[2]);
        maxX = Math.max(maxX, world[0]);
        maxY = Math.max(maxY, world[1]);
        maxZ = Math.max(maxZ, world[2]);
      }
    }
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function gapToBox(point: Vec3, box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }) {
  const dx = point[0] < box.minX ? box.minX - point[0] : point[0] > box.maxX ? point[0] - box.maxX : 0;
  const dy = point[1] < box.minY ? box.minY - point[1] : point[1] > box.maxY ? point[1] - box.maxY : 0;
  const dz = point[2] < box.minZ ? box.minZ - point[2] : point[2] > box.maxZ ? point[2] - box.maxZ : 0;
  return Math.hypot(dx, dy, dz);
}

function interfaceKey(model: TileModel, tile: PlacedTile) {
  const variant = variantOf(model, tile);
  return `${model.connectionSurface ? geometryRevision(model.connectionSurface).id : "missing"}:${model.id}:${variant.rotation}:${variant.mirror}:${tile.ix}:${tile.iy}:${tile.iz}:${tile.zLift ?? 0}`;
}

/** Shared graph gate: a proxy report is a proposal until Stage 1 confirms its OBJ interface. */
export function confirmedCirculationReports(models: TileModel[], tiles: PlacedTile[], reports: ConnectionReport[]) {
  const finishTiming = startConnectionTiming("network graph");
  try {
    return reports.filter(report => {
      if (report.collision === "FAIL" || report.interlock !== "PASS" || (report.floor !== "PASS" && report.circulation !== "PASS")) return false;
      const a = tiles.find(tile => tile.id === report.tileA), b = tiles.find(tile => tile.id === report.tileB);
      const ma = resolveModel(models, report.tileA), mb = resolveModel(models, report.tileB);
      const confirmed = a && b && ma && mb && confirmedWalkableInterface(ma, a, mb, b).meets;
      connectionDiagnostic("network", confirmed ? "confirmed interface" : "provisional interface rejected", { report, tileA: a, tileB: b });
      return Boolean(confirmed);
    });
  } finally { finishTiming(); }
}

/** True only when walkable triangles or their boundaries actually meet. Voxel overlap alone does not. */
export function confirmedWalkableInterface(modelA: TileModel, tileA: PlacedTile, modelB: TileModel, tileB: PlacedTile) {
  const finishGeometry = beginGeometryValidation();
  try {
  const finishTiming = startConnectionTiming("surface attachment selection");
  try {
  const key = `${interfaceKey(modelA, tileA)}|${interfaceKey(modelB, tileB)}`;
  const cached = interfaceCache.get(key);
  if (cached) return cached;
  const elevation = nearestMeeting(modelA, tileA, modelB, tileB) ?? nearestMeeting(modelB, tileB, modelA, tileA);
  const result = { meets: elevation !== null, elevation: elevation ?? Number.NaN };
  interfaceCache.set(key, result);
  if (interfaceCache.size > 4000) interfaceCache.delete(interfaceCache.keys().next().value!);
  return result;

  } finally { finishTiming(); }

  } finally { finishGeometry(); }
}

function nearestMeeting(modelA: TileModel, tileA: PlacedTile, modelB: TileModel, tileB: PlacedTile) {
  const index = surfaceIndex(modelA);
  const box = worldBox(modelB, tileB);
  if (!index || !box) return null;
  const ranked: Array<{ gap: number; point: Vec3 }> = [];
  for (const run of index.runs) {
    const point = worldFromLocal(run.mid, tileA, modelA);
    const gap = gapToBox(point, box);
    if (gap > 4) continue;
    ranked.push({ gap, point });
  }
  ranked.sort((left, right) => left.gap - right.gap);
  for (const sample of ranked.slice(0, 48)) {
    const gap = measureSurfaceGap(modelB, tileB, sample.point, 0.8);
    if (gap.distance <= INTERFACE_TOLERANCE && (gap.kind === "floor" || gap.kind === "edge")) return sample.point[2];
  }
  return null;
}
