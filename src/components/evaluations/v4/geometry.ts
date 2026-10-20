/**
 * v4 shared geometry: the original OBJ triangles in spec feet (x, y plan; z up)
 * plus a uniform grid for mesh ray tests. The source arrays are read, never
 * written. Every v4 descriptor measures this mesh, not a voxel approximation.
 */
import type { UpAxis } from "../../lattice/types";
import { fileToSpec } from "../../lattice/types";
import type { DescriptorSource } from "../objDescriptorAnalysis";

export type Vec3 = [number, number, number];

export type AnalysisTriangle = {
  /** Index in the triangulated source order. Stable for the same OBJ. */
  id: number;
  a: Vec3;
  b: Vec3;
  c: Vec3;
  /** Unit normal from the stored winding. */
  normal: Vec3;
  /** Square feet. */
  area: number;
  centroid: Vec3;
};

export type Bounds = {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
  planDiagonal: number;
};

export type AnalysisMesh = {
  sourceId: string;
  /** Content hash of the converted positions. Changes when geometry changes. */
  sourceHash: string;
  coordinateSystem: "spec-feet-z-up";
  units: "ft";
  up: UpAxis;
  unitScale: number;
  triangles: AnalysisTriangle[];
  /** Sum of triangle areas in square feet. */
  area: number;
  bounds: Bounds;
  /** Triangles dropped because they were degenerate (zero area). */
  degenerateCount: number;
};

export type RayHit = {
  distance: number;
  triangleId: number;
  point: Vec3;
  normal: Vec3;
};

const RAY_EPSILON = 1e-6;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len > 0 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
};
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function hashPositions(values: ArrayLike<number>, salt: string) {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  };
  for (let index = 0; index < salt.length; index += 1) mix(salt.charCodeAt(index));
  mix(values.length);
  for (let index = 0; index < values.length; index += 1) mix(Math.round(values[index] * 1000));
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Convert the source OBJ to spec feet without touching the source arrays. */
export function buildAnalysisMesh(source: DescriptorSource, sourceId: string): AnalysisMesh {
  const positions = source.positions;
  const vertexCount = Math.floor(positions.length / 3);
  const spec = new Float64Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index += 1) {
    const [x, y, z] = fileToSpec(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0, source.up);
    spec[index * 3] = x * source.unitScale;
    spec[index * 3 + 1] = y * source.unitScale;
    spec[index * 3 + 2] = z * source.unitScale;
  }
  const at = (vertex: number): Vec3 => [spec[vertex * 3], spec[vertex * 3 + 1], spec[vertex * 3 + 2]];
  const triangles: AnalysisTriangle[] = [];
  let degenerateCount = 0;
  let area = 0;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const face of source.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const a = at(face.vertices[0]);
      const b = at(face.vertices[index]);
      const c = at(face.vertices[index + 1]);
      const n = cross(sub(b, a), sub(c, a));
      const len = length(n);
      if (!(len > 1e-9)) {
        degenerateCount += 1;
        continue;
      }
      const triangle: AnalysisTriangle = {
        id: triangles.length,
        a,
        b,
        c,
        normal: [n[0] / len, n[1] / len, n[2] / len],
        area: len / 2,
        centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      };
      area += triangle.area;
      for (const p of [a, b, c]) {
        for (let axis = 0; axis < 3; axis += 1) {
          if (p[axis] < min[axis]) min[axis] = p[axis];
          if (p[axis] > max[axis]) max[axis] = p[axis];
        }
      }
      triangles.push(triangle);
    }
  }
  if (!triangles.length) {
    min.fill(0);
    max.fill(0);
  }
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return {
    sourceId,
    sourceHash: hashPositions(spec, `${sourceId}:${source.up}:${source.unitScale}`),
    coordinateSystem: "spec-feet-z-up",
    units: "ft",
    up: source.up,
    unitScale: source.unitScale,
    triangles,
    area,
    bounds: {
      min,
      max,
      size,
      center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      planDiagonal: Math.hypot(size[0], size[1]),
    },
    degenerateCount,
  };
}

/** Möller–Trumbore, double sided. Returns the ray parameter or null. */
export function intersectTriangle(origin: Vec3, direction: Vec3, triangle: AnalysisTriangle): number | null {
  const edge1 = sub(triangle.b, triangle.a);
  const edge2 = sub(triangle.c, triangle.a);
  const p = cross(direction, edge2);
  const det = dot(edge1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const t = sub(origin, triangle.a);
  const u = dot(t, p) * inv;
  if (u < -RAY_EPSILON || u > 1 + RAY_EPSILON) return null;
  const q = cross(t, edge1);
  const v = dot(direction, q) * inv;
  if (v < -RAY_EPSILON || u + v > 1 + RAY_EPSILON) return null;
  const distanceAlong = dot(edge2, q) * inv;
  return distanceAlong > RAY_EPSILON ? distanceAlong : null;
}

export type RaycastOptions = {
  /** Ignore this triangle (the surface the ray starts on). */
  skipTriangle?: number;
  /** Ignore hits closer than this distance in feet. */
  minDistance?: number;
};

/**
 * Uniform grid over the mesh bounds. Rays walk the grid cells (3D DDA) and test
 * only the triangles registered in each cell.
 */
export class TriangleGrid {
  readonly cellFeet: number;
  readonly origin: Vec3;
  readonly dims: [number, number, number];
  private readonly cells: Array<number[] | undefined>;
  private readonly mesh: AnalysisMesh;
  private stamp = new Int32Array(0);
  private stampValue = 1;

  constructor(mesh: AnalysisMesh, cellFeet = 2) {
    this.mesh = mesh;
    this.cellFeet = cellFeet;
    const pad = cellFeet;
    this.origin = [mesh.bounds.min[0] - pad, mesh.bounds.min[1] - pad, mesh.bounds.min[2] - pad];
    this.dims = [
      Math.max(1, Math.ceil((mesh.bounds.size[0] + pad * 2) / cellFeet)),
      Math.max(1, Math.ceil((mesh.bounds.size[1] + pad * 2) / cellFeet)),
      Math.max(1, Math.ceil((mesh.bounds.size[2] + pad * 2) / cellFeet)),
    ];
    this.cells = new Array(this.dims[0] * this.dims[1] * this.dims[2]);
    this.stamp = new Int32Array(mesh.triangles.length);
    for (const triangle of mesh.triangles) {
      const lo = this.cellOf([
        Math.min(triangle.a[0], triangle.b[0], triangle.c[0]),
        Math.min(triangle.a[1], triangle.b[1], triangle.c[1]),
        Math.min(triangle.a[2], triangle.b[2], triangle.c[2]),
      ]);
      const hi = this.cellOf([
        Math.max(triangle.a[0], triangle.b[0], triangle.c[0]),
        Math.max(triangle.a[1], triangle.b[1], triangle.c[1]),
        Math.max(triangle.a[2], triangle.b[2], triangle.c[2]),
      ]);
      for (let x = lo[0]; x <= hi[0]; x += 1) {
        for (let y = lo[1]; y <= hi[1]; y += 1) {
          for (let z = lo[2]; z <= hi[2]; z += 1) {
            const index = this.index(x, y, z);
            const list = this.cells[index] ?? (this.cells[index] = []);
            list.push(triangle.id);
          }
        }
      }
    }
  }

  private cellOf(point: Vec3): [number, number, number] {
    return [
      Math.min(this.dims[0] - 1, Math.max(0, Math.floor((point[0] - this.origin[0]) / this.cellFeet))),
      Math.min(this.dims[1] - 1, Math.max(0, Math.floor((point[1] - this.origin[1]) / this.cellFeet))),
      Math.min(this.dims[2] - 1, Math.max(0, Math.floor((point[2] - this.origin[2]) / this.cellFeet))),
    ];
  }

  private index(x: number, y: number, z: number) {
    return (z * this.dims[1] + y) * this.dims[0] + x;
  }

  private inside(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.dims[0] && y < this.dims[1] && z < this.dims[2];
  }

  /** Nearest hit along a direction within maxDistance feet, or null. */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, options: RaycastOptions = {}): RayHit | null {
    const dir = normalize(direction);
    if (!length(dir)) return null;
    const minDistance = options.minDistance ?? 0;
    this.stampValue += 1;
    if (this.stampValue > 2_000_000_000) {
      this.stamp.fill(0);
      this.stampValue = 1;
    }
    const stampValue = this.stampValue;

    // Clip the ray to the grid box so rays that start outside still traverse it.
    let tEnter = 0;
    let tExit = maxDistance;
    for (let axis = 0; axis < 3; axis += 1) {
      const lo = this.origin[axis];
      const hi = this.origin[axis] + this.dims[axis] * this.cellFeet;
      if (Math.abs(dir[axis]) < 1e-12) {
        if (origin[axis] < lo || origin[axis] > hi) return null;
        continue;
      }
      let t0 = (lo - origin[axis]) / dir[axis];
      let t1 = (hi - origin[axis]) / dir[axis];
      if (t0 > t1) [t0, t1] = [t1, t0];
      tEnter = Math.max(tEnter, t0);
      tExit = Math.min(tExit, t1);
      if (tEnter > tExit) return null;
    }
    const start: Vec3 = add(origin, scale(dir, tEnter + 1e-9));
    let [cx, cy, cz] = this.cellOf(start);
    const step = [Math.sign(dir[0]), Math.sign(dir[1]), Math.sign(dir[2])];
    const tDelta = [0, 1, 2].map((axis) => (dir[axis] ? Math.abs(this.cellFeet / dir[axis]) : Infinity));
    const tMax = [0, 1, 2].map((axis) => {
      if (!dir[axis]) return Infinity;
      const cell = axis === 0 ? cx : axis === 1 ? cy : cz;
      const boundary = this.origin[axis] + (cell + (step[axis] > 0 ? 1 : 0)) * this.cellFeet;
      return (boundary - origin[axis]) / dir[axis];
    });

    let best: RayHit | null = null;
    while (this.inside(cx, cy, cz)) {
      const list = this.cells[this.index(cx, cy, cz)];
      if (list) {
        for (const id of list) {
          if (this.stamp[id] === stampValue) continue;
          this.stamp[id] = stampValue;
          if (id === options.skipTriangle) continue;
          const triangle = this.mesh.triangles[id];
          const t = intersectTriangle(origin, dir, triangle);
          if (t === null || t < minDistance || t > maxDistance) continue;
          if (!best || t < best.distance) {
            best = { distance: t, triangleId: id, point: add(origin, scale(dir, t)), normal: triangle.normal };
          }
        }
      }
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      // A hit before the exit of the current cell is final.
      if (best && best.distance <= tMax[axis]) break;
      if (tMax[axis] > tExit) break;
      if (axis === 0) cx += step[0];
      else if (axis === 1) cy += step[1];
      else cz += step[2];
      tMax[axis] += tDelta[axis];
    }
    return best;
  }

  /** True when the segment from a to b is unobstructed. */
  segmentClear(a: Vec3, b: Vec3, options: RaycastOptions = {}): boolean {
    const dist = distance(a, b);
    if (dist <= 1e-9) return true;
    return this.raycast(a, sub(b, a), dist - 1e-6, options) === null;
  }

  /** Every intersection along a vertical line at (x, y), sorted ascending by z. */
  verticalIntersections(x: number, y: number): Array<{ z: number; triangleId: number; upward: boolean; normalZ: number }> {
    const results: Array<{ z: number; triangleId: number; upward: boolean; normalZ: number }> = [];
    const [cx, cy] = this.cellOf([x, y, this.origin[2]]);
    if (x < this.origin[0] || y < this.origin[1] || x > this.origin[0] + this.dims[0] * this.cellFeet || y > this.origin[1] + this.dims[1] * this.cellFeet) {
      return results;
    }
    const seen = new Set<number>();
    const origin: Vec3 = [x, y, this.origin[2] - 1];
    const direction: Vec3 = [0, 0, 1];
    for (let cz = 0; cz < this.dims[2]; cz += 1) {
      const list = this.cells[this.index(cx, cy, cz)];
      if (!list) continue;
      for (const id of list) {
        if (seen.has(id)) continue;
        seen.add(id);
        const triangle = this.mesh.triangles[id];
        const t = intersectTriangle(origin, direction, triangle);
        if (t === null) continue;
        results.push({ z: origin[2] + t, triangleId: id, upward: triangle.normal[2] >= 0, normalZ: triangle.normal[2] });
      }
    }
    results.sort((left, right) => left.z - right.z);
    return results;
  }
}

/** Unit horizontal directions, evenly spaced, starting at +x. */
export function horizontalDirections(count: number): Vec3[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle), 0];
  });
}
