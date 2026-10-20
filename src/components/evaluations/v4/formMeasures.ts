/**
 * v4 surface-form measures taken directly on the triangle mesh, area-weighted
 * so dense tessellation does not inflate any term.
 */
import { dot, type AnalysisMesh, type AnalysisTriangle, type Vec3 } from "./geometry";

/** Vertex weld tolerance for edge adjacency. */
const WELD_FEET = 0.01;

export type FoldEdge = {
  a: Vec3;
  b: Vec3;
  /** Dihedral angle between the two faces in degrees (0 flat). */
  angleDeg: number;
  /** Combined area of both faces, used as the weight. */
  weight: number;
  triangleIds: [number, number];
};

function weldKey(point: Vec3) {
  return `${Math.round(point[0] / WELD_FEET)},${Math.round(point[1] / WELD_FEET)},${Math.round(point[2] / WELD_FEET)}`;
}

/** Every mesh edge shared by exactly two triangles, with its dihedral angle. */
export function foldEdges(mesh: AnalysisMesh): FoldEdge[] {
  const byEdge = new Map<string, Array<{ triangle: AnalysisTriangle; a: Vec3; b: Vec3 }>>();
  for (const triangle of mesh.triangles) {
    const corners = [triangle.a, triangle.b, triangle.c];
    for (let index = 0; index < 3; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % 3];
      const ka = weldKey(a);
      const kb = weldKey(b);
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      (byEdge.get(key) ?? byEdge.set(key, []).get(key)!).push({ triangle, a, b });
    }
  }
  const edges: FoldEdge[] = [];
  for (const faces of byEdge.values()) {
    if (faces.length !== 2) continue;
    const [first, second] = faces;
    const cos = Math.max(-1, Math.min(1, Math.abs(dot(first.triangle.normal, second.triangle.normal))));
    const angleDeg = (Math.acos(cos) * 180) / Math.PI;
    edges.push({
      a: first.a,
      b: first.b,
      angleDeg,
      weight: first.triangle.area + second.triangle.area,
      triangleIds: [first.triangle.id, second.triangle.id],
    });
  }
  return edges;
}

/** Area-weighted mean dihedral angle in degrees. Null when no shared edges exist. */
export function meanFoldAngle(edges: FoldEdge[]): number | null {
  let weight = 0;
  let sum = 0;
  for (const edge of edges) {
    weight += edge.weight;
    sum += edge.angleDeg * edge.weight;
  }
  return weight ? sum / weight : null;
}

/** 26-direction bins (face, edge, corner directions of a cube). */
const BIN_DIRECTIONS: Vec3[] = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (!x && !y && !z) continue;
  const len = Math.hypot(x, y, z);
  BIN_DIRECTIONS.push([x / len, y / len, z / len]);
}

/** Area-weighted Shannon entropy of normal orientation over 26 bins, divided by log(26). */
export function orientationEntropy(mesh: AnalysisMesh): number | null {
  if (!mesh.area) return null;
  const bins = new Float64Array(BIN_DIRECTIONS.length);
  for (const triangle of mesh.triangles) {
    let best = 0;
    let bestDot = -Infinity;
    for (let index = 0; index < BIN_DIRECTIONS.length; index += 1) {
      const d = dot(triangle.normal, BIN_DIRECTIONS[index]);
      if (d > bestDot) {
        bestDot = d;
        best = index;
      }
    }
    bins[best] += triangle.area;
  }
  let entropy = 0;
  for (const value of bins) {
    const p = value / mesh.area;
    if (p > 0) entropy -= p * Math.log(p);
  }
  return entropy / Math.log(BIN_DIRECTIONS.length);
}

export type OrientationGroup = { triangles: AnalysisTriangle[]; area: number };

/** Triangles whose normal is more than `degrees` away from every world axis. */
export function nonAxisTriangles(mesh: AnalysisMesh, degrees = 15): OrientationGroup {
  const threshold = Math.cos((degrees * Math.PI) / 180);
  const triangles = mesh.triangles.filter((triangle) => Math.max(Math.abs(triangle.normal[0]), Math.abs(triangle.normal[1]), Math.abs(triangle.normal[2])) < threshold);
  return { triangles, area: triangles.reduce((sum, triangle) => sum + triangle.area, 0) };
}

/** Triangles that belong to the minority orientation bins (the varied surfaces). */
export function minorityOrientationTriangles(mesh: AnalysisMesh): OrientationGroup {
  const assignments = new Map<number, number>();
  const bins = new Float64Array(BIN_DIRECTIONS.length);
  for (const triangle of mesh.triangles) {
    let best = 0;
    let bestDot = -Infinity;
    for (let index = 0; index < BIN_DIRECTIONS.length; index += 1) {
      const d = dot(triangle.normal, BIN_DIRECTIONS[index]);
      if (d > bestDot) {
        bestDot = d;
        best = index;
      }
    }
    assignments.set(triangle.id, best);
    bins[best] += triangle.area;
  }
  const dominant = new Set<number>();
  const ordered = [...bins.keys()].sort((left, right) => bins[right] - bins[left]);
  let covered = 0;
  for (const index of ordered) {
    dominant.add(index);
    covered += bins[index];
    if (covered >= mesh.area * 0.5) break;
  }
  const triangles = mesh.triangles.filter((triangle) => !dominant.has(assignments.get(triangle.id) as number));
  return { triangles, area: triangles.reduce((sum, triangle) => sum + triangle.area, 0) };
}

/**
 * Surface area per horizontal band (feet). The coefficient of variation across
 * bands describes how much the section changes with height.
 */
export function sectionalBands(mesh: AnalysisMesh, bandFeet = 2): Array<{ z0: number; z1: number; area: number }> {
  const { min, max } = mesh.bounds;
  const count = Math.max(1, Math.ceil((max[2] - min[2]) / bandFeet));
  const bands = Array.from({ length: count }, (_, index) => ({ z0: min[2] + index * bandFeet, z1: min[2] + (index + 1) * bandFeet, area: 0 }));
  for (const triangle of mesh.triangles) {
    const zs = [triangle.a[2], triangle.b[2], triangle.c[2]];
    const lo = Math.min(...zs);
    const hi = Math.max(...zs);
    const first = Math.min(count - 1, Math.max(0, Math.floor((lo - min[2]) / bandFeet)));
    const last = Math.min(count - 1, Math.max(0, Math.floor((hi - min[2] - 1e-9) / bandFeet)));
    const span = Math.max(1e-6, hi - lo);
    for (let index = first; index <= last; index += 1) {
      const band = bands[index];
      const overlap = Math.max(0, Math.min(hi, band.z1) - Math.max(lo, band.z0));
      band.area += hi - lo < 1e-6 ? (index === first ? triangle.area : 0) : triangle.area * (overlap / span);
    }
  }
  return bands;
}

export function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Area-weighted centroid of the surface. */
export function surfaceCentroid(triangles: AnalysisTriangle[]): Vec3 | null {
  let area = 0;
  const sum: Vec3 = [0, 0, 0];
  for (const triangle of triangles) {
    area += triangle.area;
    sum[0] += triangle.centroid[0] * triangle.area;
    sum[1] += triangle.centroid[1] * triangle.area;
    sum[2] += triangle.centroid[2] * triangle.area;
  }
  return area ? [sum[0] / area, sum[1] / area, sum[2] / area] : null;
}

/**
 * Mirror asymmetry: 1 − best mirror match of a plan occupancy signature across
 * the x or y centre line. The signature is a 1 ft plan grid of column top
 * heights bucketed to 2 ft, so it is area-based and ignores tessellation.
 */
export function mirrorAsymmetry(columnTops: Array<{ x: number; y: number; topZ: number }>, center: Vec3, cellFeet = 1): { asymmetry: number; axis: "x" | "y"; unmatched: Array<{ x: number; y: number; z: number }> } | null {
  if (!columnTops.length) return null;
  const key = (x: number, y: number, z: number) => `${Math.round(x / cellFeet)},${Math.round(y / cellFeet)},${Math.round(z / 2)}`;
  const set = new Set(columnTops.map((column) => key(column.x - center[0], column.y - center[1], column.topZ)));
  const evaluate = (axis: "x" | "y") => {
    const unmatched: Array<{ x: number; y: number; z: number }> = [];
    for (const column of columnTops) {
      const mx = axis === "x" ? -(column.x - center[0]) : column.x - center[0];
      const my = axis === "y" ? -(column.y - center[1]) : column.y - center[1];
      if (!set.has(key(mx, my, column.topZ))) unmatched.push({ x: column.x, y: column.y, z: column.topZ });
    }
    return { asymmetry: unmatched.length / columnTops.length, unmatched };
  };
  const x = evaluate("x");
  const y = evaluate("y");
  return x.asymmetry <= y.asymmetry ? { ...x, axis: "x" } : { ...y, axis: "y" };
}

/** Plan centroid offset of the upper half of the surface area from the lower half. */
export function upperLowerDisplacement(mesh: AnalysisMesh): { offset: number; upper: Vec3; lower: Vec3 } | null {
  const midZ = (mesh.bounds.min[2] + mesh.bounds.max[2]) / 2;
  const upper = surfaceCentroid(mesh.triangles.filter((triangle) => triangle.centroid[2] >= midZ));
  const lower = surfaceCentroid(mesh.triangles.filter((triangle) => triangle.centroid[2] < midZ));
  if (!upper || !lower) return null;
  return { offset: Math.hypot(upper[0] - lower[0], upper[1] - lower[1]), upper, lower };
}

/** Share of surface area inside the inner half-radius ellipse of the plan bounds. */
export function innerAreaShare(triangles: AnalysisTriangle[], center: Vec3, size: Vec3, fraction = 0.5): { share: number; inner: AnalysisTriangle[]; outer: AnalysisTriangle[] } {
  const rx = Math.max(0.01, (size[0] / 2) * fraction);
  const ry = Math.max(0.01, (size[1] / 2) * fraction);
  const inner: AnalysisTriangle[] = [];
  const outer: AnalysisTriangle[] = [];
  let innerArea = 0;
  let total = 0;
  for (const triangle of triangles) {
    const dx = (triangle.centroid[0] - center[0]) / rx;
    const dy = (triangle.centroid[1] - center[1]) / ry;
    total += triangle.area;
    if (dx * dx + dy * dy <= 1) {
      inner.push(triangle);
      innerArea += triangle.area;
    } else outer.push(triangle);
  }
  return { share: total ? innerArea / total : 0, inner, outer };
}

/** Flatten triangles into a 9-floats-per-triangle array. */
export function triangleArray(triangles: AnalysisTriangle[], lift = 0): Float32Array {
  const out = new Float32Array(triangles.length * 9);
  triangles.forEach((triangle, index) => {
    out.set([
      triangle.a[0], triangle.a[1], triangle.a[2] + lift,
      triangle.b[0], triangle.b[1], triangle.b[2] + lift,
      triangle.c[0], triangle.c[1], triangle.c[2] + lift,
    ], index * 9);
  });
  return out;
}
