import { faceTriangles } from "../lattice/parseObj";
import type { ObjFace, UpAxis, Vec3 } from "../lattice/types";
import { fileToSpec } from "../lattice/types";
import type { Voxel } from "./openVolume";
import { MIN_PATCH_AREA, UPWARD_NORMAL } from "./openVolumeLandings";

/** Feet above a triangle before a hit counts. Gold starts this far above the upper surface. */
export const CLEARANCE_EPSILON = 0.05;
/** A closer hit is the upper skin of the same element, not the next overhead surface. */
export const SAME_ELEMENT_FEET = 0.75;
const JOIN_FEET = 1.5;
/**
 * Exterior-open columns have no overhead surface. This band only marks the start
 * of the column. It is not a measured enclosure.
 */
export const OPEN_BAND_FEET = 1.5;
/** Clearance at or below this height is not accessible, so the sample adds nothing. */
export const CLEARANCE_MIN_FEET = 5;
/** Bounded clearance reaches full credit at this height. Exterior-open samples are fully open. */
export const CLEARANCE_REFERENCE_FEET = 10;
/** Same minimum used by the clearance drawing, so the rating covers the surfaces that are shown. */
export const CLEARANCE_MIN_AREA = 8;
const GRID_FEET = 2;

export type ClearanceField = "bounded" | "exterior-open" | "mixed";

export type AnchoredSurface = {
  area: number;
  sourceLow: number;
  sourceTop: number;
  startLow: number;
  startHigh: number;
  triangleCount: number;
  samples: number;
  boundedSamples: number;
  openSamples: number;
  minClear: number | null;
  medianClear: number | null;
  maxClear: number | null;
  /** Mean per-sample credit. 0 at or below 5 ft, rising to 1 at 10 ft. Exterior-open samples are 1. */
  meanCredit: number;
  field: ClearanceField;
  verticalStartFeet: number;
  horizontalFeet: number;
  rasterGapFeet: number | null;
  insideShrink: number;
  outsideShrink: number;
  noFreeVoxel: number;
  reason: string;
  probe: { x: number; y: number; z: number; hitZ: number | null };
};

export type SurfaceRole = "broad platform" | "smaller landing" | "below another surface" | "exterior-open" | "outside shrink-wrap";

export type SurfaceClearance = {
  surfaces: AnchoredSurface[];
  prisms: Float32Array;
  outlines: Array<{ a: Vec3; b: Vec3 }>;
  dimensions: Array<{ a: Vec3; b: Vec3 }>;
  representatives: Array<{ role: SurfaceRole; surface: AnchoredSurface }>;
  elapsedMs: number;
  sampleCount: number;
  insideShrink: number;
  outsideShrink: number;
};

type RawTri = {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
  zMin: number;
  zMax: number;
  xyArea: number;
  upward: boolean;
};

type UpTri = RawTri & { verts: [string, string, string] };

function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function gridKey(x: number, y: number) {
  return `${Math.floor(x / GRID_FEET)},${Math.floor(y / GRID_FEET)}`;
}

function baryZ(tri: RawTri, x: number, y: number) {
  const v0x = tri.bx - tri.ax;
  const v0y = tri.by - tri.ay;
  const v1x = tri.cx - tri.ax;
  const v1y = tri.cy - tri.ay;
  const v2x = x - tri.ax;
  const v2y = y - tri.ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return null;
  const u = (dot11 * dot02 - dot01 * dot12) / denom;
  const v = (dot00 * dot12 - dot01 * dot02) / denom;
  if (u < -1e-4 || v < -1e-4 || u + v > 1 + 1e-4) return null;
  return (1 - u - v) * tri.az + u * tri.bz + v * tri.cz;
}

function buildIndex(triangles: RawTri[]) {
  const index = new Map<string, RawTri[]>();
  for (const tri of triangles) {
    if (tri.xyArea < 1e-6) continue;
    const x0 = Math.floor(Math.min(tri.ax, tri.bx, tri.cx) / GRID_FEET);
    const x1 = Math.floor(Math.max(tri.ax, tri.bx, tri.cx) / GRID_FEET);
    const y0 = Math.floor(Math.min(tri.ay, tri.by, tri.cy) / GRID_FEET);
    const y1 = Math.floor(Math.max(tri.ay, tri.by, tri.cy) / GRID_FEET);
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iy = y0; iy <= y1; iy += 1) {
        const key = `${ix},${iy}`;
        const list = index.get(key);
        if (list) list.push(tri);
        else index.set(key, [tri]);
      }
    }
  }
  return index;
}

function firstHit(index: Map<string, RawTri[]>, x: number, y: number, minZ: number) {
  const list = index.get(gridKey(x, y));
  if (!list) return null;
  let best = Infinity;
  for (const tri of list) {
    const z = baryZ(tri, x, y);
    if (z === null || z <= minZ) continue;
    if (z < best) best = z;
  }
  return Number.isFinite(best) ? best : null;
}

function collectTriangles(mesh: { positions: ArrayLike<number>; faces: Array<Pick<ObjFace, "vertices">> }, unitScale: number, up: UpAxis) {
  const positions = mesh.positions;
  const specAt = (index: number): [number, number, number] => {
    const file = fileToSpec(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2], up);
    return [file[0] * unitScale, file[1] * unitScale, file[2] * unitScale];
  };
  const all: RawTri[] = [];
  const upward: UpTri[] = [];
  for (const face of mesh.faces) {
    for (const [ia, ib, ic] of faceTriangles(face)) {
      const a = specAt(ia);
      const b = specAt(ib);
      const c = specAt(ic);
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const abz = b[2] - a[2];
      const acx = c[0] - a[0];
      const acy = c[1] - a[1];
      const acz = c[2] - a[2];
      const nz = abx * acy - aby * acx;
      const length = Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, nz);
      const xyArea = Math.abs(nz) * 0.5;
      if (!length || xyArea < 1e-6) continue;
      const tri: RawTri = {
        ax: a[0], ay: a[1], az: a[2],
        bx: b[0], by: b[1], bz: b[2],
        cx: c[0], cy: c[1], cz: c[2],
        zMin: Math.min(a[2], b[2], c[2]),
        zMax: Math.max(a[2], b[2], c[2]),
        xyArea,
        upward: nz / length >= UPWARD_NORMAL,
      };
      all.push(tri);
      if (tri.upward) {
        const key = (x: number, y: number, z: number) => `${Math.round(x * 50)},${Math.round(y * 50)},${Math.round(z * 50)}`;
        upward.push({ ...tri, verts: [key(a[0], a[1], a[2]), key(b[0], b[1], b[2]), key(c[0], c[1], c[2])] });
      }
    }
  }
  return { all, upward };
}

function clusterSurfaces(upward: UpTri[], minArea: number) {
  const parent = upward.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    let compress = index;
    while (parent[compress] !== cursor) {
      const next = parent[compress];
      parent[compress] = cursor;
      compress = next;
    }
    return cursor;
  };
  const unite = (left: number, right: number) => {
    const a = upward[left];
    const b = upward[right];
    if (a.zMax + JOIN_FEET < b.zMin || b.zMax + JOIN_FEET < a.zMin) return;
    const ra = find(left);
    const rb = find(right);
    if (ra !== rb) parent[rb] = ra;
  };
  const byVertex = new Map<string, number[]>();
  upward.forEach((tri, index) => {
    for (const vertex of tri.verts) {
      const list = byVertex.get(vertex);
      if (list) list.push(index);
      else byVertex.set(vertex, [index]);
    }
  });
  for (const list of byVertex.values()) {
    for (let index = 1; index < list.length; index += 1) unite(list[0], list[index]);
  }
  const groups = new Map<number, UpTri[]>();
  upward.forEach((tri, index) => {
    const root = find(index);
    const list = groups.get(root);
    if (list) list.push(tri);
    else groups.set(root, [tri]);
  });
  return [...groups.values()].filter((group) => group.reduce((sum, tri) => sum + tri.xyArea, 0) >= minArea);
}

function samplePoints(tri: UpTri) {
  const points: Array<[number, number, number]> = [[
    (tri.ax + tri.bx + tri.cx) / 3,
    (tri.ay + tri.by + tri.cy) / 3,
    (tri.az + tri.bz + tri.cz) / 3,
  ]];
  const verts: Array<[number, number, number]> = [[tri.ax, tri.ay, tri.az], [tri.bx, tri.by, tri.bz], [tri.cx, tri.cy, tri.cz]];
  verts.sort((left, right) => right[2] - left[2]);
  const top = verts[0];
  points.push([
    points[0][0] * 0.15 + top[0] * 0.85,
    points[0][1] * 0.15 + top[1] * 0.85,
    points[0][2] * 0.15 + top[2] * 0.85,
  ]);
  const count = Math.max(1, Math.min(6, Math.ceil(tri.xyArea / 4)));
  const steps = Math.max(2, Math.ceil(Math.sqrt(count * 2)));
  for (let iu = 1; iu < steps; iu += 1) {
    for (let iv = 1; iv < steps - iu; iv += 1) {
      const u = iu / steps;
      const v = iv / steps;
      const w = 1 - u - v;
      points.push([
        tri.ax * w + tri.bx * u + tri.cx * v,
        tri.ay * w + tri.by * u + tri.cy * v,
        tri.az * w + tri.bz * u + tri.cz * v,
      ]);
    }
  }
  return points;
}

function pushTri(out: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
}

function addCap(out: number[], tri: UpTri, skinLift: number, height: number) {
  const lift = skinLift + CLEARANCE_EPSILON;
  pushTri(out, tri.ax, tri.ay, tri.az + lift, tri.cx, tri.cy, tri.cz + lift, tri.bx, tri.by, tri.bz + lift);
  const az = tri.az + lift + height;
  const bz = tri.bz + lift + height;
  const cz = tri.cz + lift + height;
  pushTri(out, tri.ax, tri.ay, az, tri.cx, tri.cy, cz, tri.bx, tri.by, bz);
}

function addColumn(out: number[], x: number, y: number, z: number, height: number, halfWidth: number) {
  const half = Math.max(0.08, halfWidth);
  const x0 = x - half;
  const x1 = x + half;
  const y0 = y - half;
  const y1 = y + half;
  const top = z + CLEARANCE_EPSILON + height;
  addWall(out, x0, y0, z, x1, y0, z, height);
  addWall(out, x1, y0, z, x1, y1, z, height);
  addWall(out, x1, y1, z, x0, y1, z, height);
  addWall(out, x0, y1, z, x0, y0, z, height);
  pushTri(out, x0, y0, top, x0, y1, top, x1, y1, top);
  pushTri(out, x0, y0, top, x1, y1, top, x1, y0, top);
}

function addWall(out: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, height: number) {
  const az1 = az + CLEARANCE_EPSILON;
  const bz1 = bz + CLEARANCE_EPSILON;
  pushTri(out, ax, ay, az1, bx, by, bz1, bx, by, bz1 + height);
  pushTri(out, ax, ay, az1, bx, by, bz1 + height, ax, ay, az1 + height);
}

type SampleHit = { x: number; y: number; z: number; upper: number; hitZ: number | null; clearFeet: number | null; lifted: boolean };

function tracePoint(index: Map<string, RawTri[]>, x: number, y: number, z: number): SampleHit {
  const first = firstHit(index, x, y, z + CLEARANCE_EPSILON);
  let upper = z;
  let hit = first;
  if (hit !== null && hit - z <= SAME_ELEMENT_FEET) {
    upper = hit;
    hit = firstHit(index, x, y, upper + CLEARANCE_EPSILON);
  }
  let lifted = false;
  if (hit !== null && hit - upper < 3) {
    const above = firstHit(index, x, y, hit + CLEARANCE_EPSILON);
    if (above === null || above - hit > 3) {
      hit = above;
      lifted = true;
    }
  }
  return { x, y, z, upper, hitZ: hit, clearFeet: hit === null ? null : hit - upper, lifted };
}

/** Signed feet from the upper surface to the bottom of the first free voxel. Negative means that voxel starts below the surface. */
export function rasterGapAt(anchor: Vec3, cellFeet: number, occupied: Voxel[], x: number, y: number, upper: number) {
  const occupiedKeys = new Set(occupied.map((cell) => keyOf(cell[0], cell[1], cell[2])));
  const ix = Math.floor((x - anchor[0]) / cellFeet);
  const iy = Math.floor((y - anchor[1]) / cellFeet);
  let iz = Math.floor((upper - anchor[2]) / cellFeet);
  for (let step = 0; step < 8; step += 1) {
    if (!occupiedKeys.has(keyOf(ix, iy, iz))) return anchor[2] + iz * cellFeet - upper;
    iz += 1;
  }
  return null;
}

function firstFreeCell(occupied: Set<string>, anchor: Vec3, cellFeet: number, x: number, y: number, upper: number): Voxel | null {
  const ix = Math.floor((x - anchor[0]) / cellFeet);
  const iy = Math.floor((y - anchor[1]) / cellFeet);
  let iz = Math.floor((upper - anchor[2]) / cellFeet);
  for (let step = 0; step < 8; step += 1) {
    if (!occupied.has(keyOf(ix, iy, iz))) return [ix, iy, iz];
    iz += 1;
  }
  return null;
}

function pickRepresentatives(surfaces: AnchoredSurface[]) {
  const used = new Set<AnchoredSurface>();
  const take = (role: SurfaceRole, list: AnchoredSurface[]) => {
    const found = list.find((surface) => !used.has(surface));
    if (!found) return null;
    used.add(found);
    return { role, surface: found };
  };
  const byArea = [...surfaces].sort((left, right) => right.area - left.area || right.startHigh - left.startHigh);
  const broad = take("broad platform", byArea);
  const broadArea = broad?.surface.area ?? 0;
  const smallerPool = [...surfaces]
    .filter((surface) => surface.area <= Math.max(48, broadArea * 0.45))
    .sort((left, right) => left.area - right.area);
  const smaller = take("smaller landing", smallerPool.length ? smallerPool : [...surfaces].sort((left, right) => left.area - right.area));
  const below = take("below another surface", [...surfaces]
    .filter((surface) => surface.field !== "exterior-open" && surface.medianClear !== null && surface.medianClear >= 0.75)
    .sort((left, right) => (right.boundedSamples - left.boundedSamples) || ((left.medianClear ?? 0) - (right.medianClear ?? 0))));
  const open = take("exterior-open", [...surfaces]
    .filter((surface) => surface.field === "exterior-open")
    .sort((left, right) => right.area - left.area || right.startHigh - left.startHigh));
  const excluded = take("outside shrink-wrap", [...surfaces]
    .filter((surface) => surface.outsideShrink > 0)
    .sort((left, right) => right.outsideShrink - left.outsideShrink || right.area - left.area));
  return [broad, smaller, below, open, excluded].filter((item): item is { role: SurfaceRole; surface: AnchoredSurface } => item !== null);
}

/** 0 when a person cannot enter. Rises from just above 5 ft to fully open at 10 ft. No overhead surface is fully open. */
export function clearanceAccessCredit(clearFeet: number | null) {
  if (clearFeet === null) return 1;
  if (!(clearFeet > CLEARANCE_MIN_FEET)) return 0;
  const span = CLEARANCE_REFERENCE_FEET - CLEARANCE_MIN_FEET;
  return Math.min(1, (clearFeet - CLEARANCE_MIN_FEET) / span);
}

/**
 * Vertical clearance from the original upward triangles.
 * Prisms fill the measured clearance. The registry rank is the rating; this measurement only orders it.
 */
export function rateSurfaceClearance(clearance: SurfaceClearance) {
  let area = 0;
  let weighted = 0;
  for (const surface of clearance.surfaces) {
    const samples = surface.boundedSamples + surface.openSamples;
    if (samples < 1 || surface.area <= 0) continue;
    area += surface.area;
    weighted += surface.area * surface.meanCredit;
  }
  const raw = area > 0 ? weighted / area : 0;
  return { raw, value: raw * 100, area };
}

export function measureSurfaceClearance(input: {
  mesh: { positions: ArrayLike<number>; faces: Array<Pick<ObjFace, "vertices">> };
  unitScale: number;
  up: UpAxis;
  anchor?: Vec3 | null;
  cellFeet?: number;
  occupied?: Voxel[];
  shrinkFree?: Voxel[];
  minArea?: number;
}): SurfaceClearance {
  const started = performance.now();
  const { all, upward } = collectTriangles(input.mesh, input.unitScale, input.up);
  const index = buildIndex(all);
  const groups = clusterSurfaces(upward, input.minArea ?? MIN_PATCH_AREA);
  const occupied = new Set((input.occupied ?? []).map((cell) => keyOf(cell[0], cell[1], cell[2])));
  const shrink = new Set((input.shrinkFree ?? []).map((cell) => keyOf(cell[0], cell[1], cell[2])));
  const anchor = input.anchor ?? null;
  const cellFeet = input.cellFeet ?? 0;
  const canRaster = Boolean(anchor && cellFeet > 0 && occupied.size);
  const formTop = all.reduce((top, tri) => Math.max(top, tri.zMax), -Infinity);
  const columnHalf = cellFeet > 0 ? cellFeet * 0.22 : 0.3;
  /** Upward faces at the top of the form are the ceiling, not a floor with clearance above them. */
  const onCeiling = (originZ: number) => formTop - originZ <= Math.max(cellFeet, 1);
  /** Gold uses part of the free height in the lattice cell and never rises above the form. */
  const visibleHeight = (originZ: number, requested: number) => {
    let height = Math.max(0, requested);
    if (anchor && cellFeet > 0) {
      const layer = Math.floor((originZ - anchor[2]) / cellFeet);
      const cellTop = anchor[2] + (layer + 1) * cellFeet;
      height = Math.min(height, Math.max(0, cellTop - originZ) * 0.5);
    }
    return Math.min(height, Math.max(0, formTop - CLEARANCE_EPSILON - originZ));
  };
  const prism: number[] = [];
  const outlines: Array<{ a: Vec3; b: Vec3 }> = [];
  const surfaces: AnchoredSurface[] = [];
  let sampleCount = 0;
  let insideShrink = 0;
  let outsideShrink = 0;

  for (const group of groups) {
    const clears: number[] = [];
    const gaps: number[] = [];
    const starts: number[] = [];
    let boundedSamples = 0;
    let openSamples = 0;
    let creditSum = 0;
    let surfaceInside = 0;
    let surfaceOutside = 0;
    let noFreeVoxel = 0;
    let probe: SampleHit | null = null;
    let sourceLow = Infinity;
    let sourceTop = -Infinity;
    const edges = new Map<string, { n: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; height: number; low: number; high: number }>();
    const tallColumns = new Map<string, { x: number; y: number; upper: number; clear: number }>();
    const noteEdge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, height: number) => {
      const quantize = (value: number) => Math.round(value * 100);
      const start = `${quantize(ax)},${quantize(ay)}`;
      const end = `${quantize(bx)},${quantize(by)}`;
      const key = start < end ? `${start}|${end}` : `${end}|${start}`;
      const found = edges.get(key);
      if (found) {
        found.n += 1;
        found.low = Math.min(found.low, height);
        found.high = Math.max(found.high, height);
      } else edges.set(key, { n: 1, ax, ay, az, bx, by, bz, height, low: height, high: height });
    };
    for (const tri of group) {
      sourceLow = Math.min(sourceLow, tri.zMin);
      sourceTop = Math.max(sourceTop, tri.zMax);
      const hits = samplePoints(tri).map((point) => tracePoint(index, point[0], point[1], point[2]));
      sampleCount += hits.length;
      for (const hit of hits) {
        starts.push(hit.upper);
        if (!probe || hit.upper > probe.upper) probe = hit;
        const credit = clearanceAccessCredit(hit.clearFeet);
        creditSum += credit;
        if (hit.clearFeet === null) openSamples += 1;
        else {
          boundedSamples += 1;
          clears.push(hit.clearFeet);
        }
        const shown = visibleHeight(hit.upper, hit.clearFeet ?? OPEN_BAND_FEET);
        if (!onCeiling(hit.upper) && credit > 0 && shown >= 0.04 && (hit.lifted || (hit.clearFeet !== null && hit.clearFeet >= 3))) {
          const ix = anchor && cellFeet > 0 ? Math.floor((hit.x - anchor[0]) / cellFeet) : Math.round(hit.x);
          const iy = anchor && cellFeet > 0 ? Math.floor((hit.y - anchor[1]) / cellFeet) : Math.round(hit.y);
          const columnKey = `${ix}:${iy}`;
          const prior = tallColumns.get(columnKey);
          if (!prior || shown > prior.clear) {
            tallColumns.set(columnKey, {
              x: anchor && cellFeet > 0 ? anchor[0] + (ix + 0.5) * cellFeet : hit.x,
              y: anchor && cellFeet > 0 ? anchor[1] + (iy + 0.5) * cellFeet : hit.y,
              upper: hit.upper,
              clear: shown,
            });
          }
        }
        if (!canRaster || !anchor) continue;
        const free = firstFreeCell(occupied, anchor, cellFeet, hit.x, hit.y, hit.upper);
        if (!free) {
          noFreeVoxel += 1;
          continue;
        }
        gaps.push(anchor[2] + free[2] * cellFeet - hit.upper);
        if (shrink.has(keyOf(free[0], free[1], free[2]))) {
          surfaceInside += 1;
          insideShrink += 1;
        } else {
          surfaceOutside += 1;
          outsideShrink += 1;
        }
      }
      const centroid = tracePoint(index, (tri.ax + tri.bx + tri.cx) / 3, (tri.ay + tri.by + tri.cy) / 3, (tri.az + tri.bz + tri.cz) / 3);
      const skinLift = Math.max(0, centroid.upper - centroid.z);
      const centroidCredit = clearanceAccessCredit(centroid.clearFeet);
      const height = onCeiling(tri.az + skinLift) || centroidCredit <= 0 ? 0 : visibleHeight(tri.az + skinLift, centroid.clearFeet === null ? OPEN_BAND_FEET : Math.max(0.08, centroid.clearFeet - CLEARANCE_EPSILON));
      if (height >= 0.04) {
        addCap(prism, tri, skinLift, height);
        noteEdge(tri.ax, tri.ay, tri.az + skinLift, tri.bx, tri.by, tri.bz + skinLift, height);
        noteEdge(tri.bx, tri.by, tri.bz + skinLift, tri.cx, tri.cy, tri.cz + skinLift, height);
        noteEdge(tri.cx, tri.cy, tri.cz + skinLift, tri.ax, tri.ay, tri.az + skinLift, height);
      }
      const az = tri.az + skinLift;
      const bz = tri.bz + skinLift;
      const cz = tri.cz + skinLift;
      if (centroidCredit > 0 && !onCeiling(az) && !onCeiling(bz) && !onCeiling(cz)) {
        outlines.push({ a: [tri.ax, tri.ay, az], b: [tri.bx, tri.by, bz] });
        outlines.push({ a: [tri.bx, tri.by, bz], b: [tri.cx, tri.cy, cz] });
        outlines.push({ a: [tri.cx, tri.cy, cz], b: [tri.ax, tri.ay, az] });
      }
    }
    for (const edge of edges.values()) {
      if (edge.n === 1) addWall(prism, edge.ax, edge.ay, edge.az, edge.bx, edge.by, edge.bz, edge.high);
      else if (edge.high - edge.low > 1.5) addWall(prism, edge.ax, edge.ay, edge.az + edge.low, edge.bx, edge.by, edge.bz + edge.low, edge.high - edge.low);
    }
    for (const column of tallColumns.values()) addColumn(prism, column.x, column.y, column.upper, column.clear, columnHalf);
    const samples = boundedSamples + openSamples;
    if (!samples || !probe) continue;
    const boundedShare = boundedSamples / samples;
    const field: ClearanceField = boundedShare >= 0.75 ? "bounded" : boundedShare <= 0.25 ? "exterior-open" : "mixed";
    const minClear = clears.length ? Math.min(...clears) : null;
    const maxClear = clears.length ? Math.max(...clears) : null;
    let reason = "";
    if (samples < 4) reason = "Fewer than four samples landed inside this surface.";
    else if (field === "mixed") reason = "Part of this surface meets another element and part is exterior-open, so one distance does not describe it.";
    else if (minClear !== null && maxClear !== null && minClear > 0 && maxClear / minClear > 4) reason = "Bounded clearance changes by more than four to one across this surface.";
    surfaces.push({
      area: group.reduce((sum, tri) => sum + tri.xyArea, 0),
      sourceLow,
      sourceTop,
      startLow: Math.min(...starts),
      startHigh: Math.max(...starts),
      triangleCount: group.length,
      samples,
      boundedSamples,
      openSamples,
      minClear,
      medianClear: median(clears),
      maxClear,
      meanCredit: creditSum / samples,
      field,
      verticalStartFeet: CLEARANCE_EPSILON,
      horizontalFeet: 0,
      rasterGapFeet: canRaster ? median(gaps) : null,
      insideShrink: surfaceInside,
      outsideShrink: surfaceOutside,
      noFreeVoxel,
      reason,
      probe: { x: probe.x, y: probe.y, z: probe.upper, hitZ: probe.hitZ },
    });
  }

  surfaces.sort((left, right) => right.area - left.area || right.startHigh - left.startHigh);
  const representatives = pickRepresentatives(surfaces);
  const dimensions = representatives.map(({ surface }) => {
    const height = visibleHeight(surface.probe.z, surface.probe.hitZ === null ? OPEN_BAND_FEET : Math.max(0.08, surface.probe.hitZ - surface.probe.z));
    return {
      a: [surface.probe.x, surface.probe.y, surface.probe.z] as Vec3,
      b: [surface.probe.x, surface.probe.y, surface.probe.z + height] as Vec3,
    };
  });

  return {
    surfaces,
    prisms: Float32Array.from(prism),
    outlines,
    dimensions,
    representatives,
    elapsedMs: performance.now() - started,
    sampleCount,
    insideShrink,
    outsideShrink,
  };
}

export function clearanceNote(clearance: SurfaceClearance) {
  const rated = rateSurfaceClearance(clearance);
  if (!clearance.surfaces.length) return "No qualifying upward surface was found, so the surface-clearance rating is 0.";
  const lines = clearance.representatives.map(({ role, surface }) => {
    const range = surface.minClear !== null && surface.maxClear !== null ? ` Range ${surface.minClear.toFixed(2)}–${surface.maxClear.toFixed(2)} ft.` : "";
    const distance = surface.field === "exterior-open"
      ? "exterior-open, so it counts as fully open. The gold band is a 1.50 ft marker, not the measured height"
      : surface.medianClear === null
        ? "clearance was not stable"
        : `median clearance ${surface.medianClear.toFixed(2)} ft${surface.field === "mixed" ? ", mixed with exterior-open samples" : ""}.${range}`;
    const reason = surface.reason ? ` ${surface.reason}` : "";
    return `${role} at ${surface.startHigh.toFixed(2)} ft: ${distance}. Horizontal registration 0.00 ft. Gold begins ${surface.verticalStartFeet.toFixed(2)} ft above the upper triangles.${reason}`;
  });
  return `Gold marks part of the free space in the lattice cell above these surfaces when clearance is above ${CLEARANCE_MIN_FEET} ft, and it stops at the top of the form. Clearance at or below ${CLEARANCE_MIN_FEET} ft adds nothing. Credit then rises to fully open at ${CLEARANCE_REFERENCE_FEET.toFixed(0)} ft. Exterior-open samples count as fully open. This drawing covers ${rated.area.toFixed(1)} ft². ${lines.join(" ")}`;
}
