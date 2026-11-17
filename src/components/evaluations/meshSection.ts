import type { Vec3 } from "./geometryView";

export type Triangle = { a: Vec3; b: Vec3; c: Vec3 };
export type Segment = { a: Vec3; b: Vec3 };

export type SectionOrientation = "plan" | "section-x" | "section-y" | "custom";

export type SectionPlane = {
  origin: Vec3;
  normal: Vec3;
  orientation: SectionOrientation;
};

export type MeshBounds = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
};

export type SectionCut = {
  segments: Segment[];
  closedLoops: Vec3[][];
  pocheReliable: boolean;
  limitation: string | null;
};

const EPSILON = 1e-7;

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function planeFromOrientation(orientation: Exclude<SectionOrientation, "custom">, origin: Vec3): SectionPlane {
  const normal: Vec3 = orientation === "plan" ? [0, 0, 1] : orientation === "section-x" ? [1, 0, 0] : [0, 1, 0];
  return { origin: [...origin], normal, orientation };
}

/** Mid-span cut facing the Y axis. A geometric default, not a descriptor-specific reveal. */
export function defaultSectionPlane(bounds: MeshBounds): SectionPlane {
  return planeFromOrientation("section-y", bounds.center);
}

export function meshBounds(triangles: Triangle[]): MeshBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (p: Vec3) => {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  };
  for (const triangle of triangles) {
    visit(triangle.a);
    visit(triangle.b);
    visit(triangle.c);
  }
  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0] };
  }
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { min, max, center, size };
}

function signed(point: Vec3, origin: Vec3, normal: Vec3) {
  return dot(normal, [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]]);
}

function interpolate(a: Vec3, b: Vec3, da: number, db: number): Vec3 {
  const denom = da - db;
  const t = Math.abs(denom) < EPSILON ? 0.5 : da / denom;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function edgeHit(a: Vec3, b: Vec3, origin: Vec3, normal: Vec3): Vec3 | null {
  const da = signed(a, origin, normal);
  const db = signed(b, origin, normal);
  if (Math.abs(da) <= EPSILON && Math.abs(db) <= EPSILON) return null;
  if (Math.abs(da) <= EPSILON) return [...a];
  if (Math.abs(db) <= EPSILON) return [...b];
  if (da * db > 0) return null;
  return interpolate(a, b, da, db);
}

/** Triangle-plane cuts. Open and nonmanifold meshes stay as segments; poche is filled only when every cut closes. */
export function sectionTriangles(triangles: Triangle[], plane: SectionPlane): SectionCut {
  const normal = normalize(plane.normal);
  const segments: Segment[] = [];
  for (const triangle of triangles) {
    if (!triangle?.a || !triangle?.b || !triangle?.c) continue;
    const hits: Vec3[] = [];
    const push = (point: Vec3 | null) => {
      if (!point) return;
      if (hits.some((hit) => Math.hypot(hit[0] - point[0], hit[1] - point[1], hit[2] - point[2]) <= 1e-5)) return;
      hits.push(point);
    };
    push(edgeHit(triangle.a, triangle.b, plane.origin, normal));
    push(edgeHit(triangle.b, triangle.c, plane.origin, normal));
    push(edgeHit(triangle.c, triangle.a, plane.origin, normal));
    if (hits.length >= 2) segments.push({ a: hits[0], b: hits[1] });
  }
  const chained = chainLoops(segments);
  const loops = chained.loops;
  const pocheReliable = segments.length > 0 && !chained.openRemainder && loops.length > 0;
  return {
    segments,
    closedLoops: pocheReliable ? loops : [],
    pocheReliable,
    limitation: pocheReliable ? null : "Cut edges are shown. The mesh does not form a reliable closed section, so no poche is filled.",
  };
}

function pointKey(point: Vec3) {
  return `${point[0].toFixed(4)},${point[1].toFixed(4)},${point[2].toFixed(4)}`;
}

function chainLoops(segments: Segment[]): { loops: Vec3[][]; openRemainder: boolean } {
  const unused = segments.map((segment) => ({ a: segment.a, b: segment.b, used: false }));
  const loops: Vec3[][] = [];
  let openRemainder = false;
  for (let start = 0; start < unused.length; start += 1) {
    if (unused[start].used) continue;
    unused[start].used = true;
    const loop: Vec3[] = [unused[start].a];
    let tail = unused[start].b;
    let closed = pointKey(tail) === pointKey(loop[0]);
    if (!closed) loop.push(tail);
    let guard = 0;
    while (!closed && guard < unused.length + 2) {
      guard += 1;
      const next = unused.find((segment) => !segment.used && (pointKey(segment.a) === pointKey(tail) || pointKey(segment.b) === pointKey(tail)));
      if (!next) break;
      next.used = true;
      const other = pointKey(next.a) === pointKey(tail) ? next.b : next.a;
      if (pointKey(other) === pointKey(loop[0])) {
        closed = true;
        break;
      }
      loop.push(other);
      tail = other;
    }
    if (closed && loop.length >= 3) loops.push(loop);
    else openRemainder = true;
  }
  return { loops, openRemainder };
}

export function translatePlane(plane: SectionPlane, deltaFeet: number): SectionPlane {
  const normal = normalize(plane.normal);
  return {
    ...plane,
    origin: [
      plane.origin[0] + normal[0] * deltaFeet,
      plane.origin[1] + normal[1] * deltaFeet,
      plane.origin[2] + normal[2] * deltaFeet,
    ],
  };
}

/** Rotate the cut normal around architectural Z. Principal axes keep their orientation name. */
export function rotatePlane(plane: SectionPlane, degrees: number): SectionPlane {
  const radians = (degrees * Math.PI) / 180;
  const normal = normalize(plane.normal);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotated: Vec3 = [normal[0] * cos - normal[1] * sin, normal[0] * sin + normal[1] * cos, normal[2]];
  const next = normalize(rotated);
  let orientation: SectionOrientation = "custom";
  if (Math.abs(next[2]) > 0.999) orientation = "plan";
  else if (Math.abs(next[0]) > 0.999) orientation = "section-x";
  else if (Math.abs(next[1]) > 0.999) orientation = "section-y";
  return { ...plane, normal: next, orientation };
}

export function projectPoint(point: Vec3, orientation: SectionOrientation): [number, number] {
  if (orientation === "section-x") return [point[1], point[2]];
  if (orientation === "plan") return [point[0], point[1]];
  return [point[0], point[2]];
}

export type ScaleMode = "physical" | "fit";

export function comparisonScale(sizeA: Vec3, sizeB: Vec3, mode: ScaleMode, viewport: { width: number; height: number }) {
  const span = (size: Vec3) => Math.max(size[0], size[1], size[2], 0.01);
  const room = Math.max(1, Math.min(viewport.width, viewport.height));
  if (mode === "fit") {
    return {
      mode,
      feetPerPixelA: span(sizeA) / room,
      feetPerPixelB: span(sizeB) / room,
      shared: false,
      label: "Fit to view. Each form fills its panel, so equal drawings can hide a size difference.",
    };
  }
  const feetPerPixel = Math.max(span(sizeA), span(sizeB)) / room;
  return {
    mode,
    feetPerPixelA: feetPerPixel,
    feetPerPixelB: feetPerPixel,
    shared: true,
    label: "Matched physical scale. One foot has the same length in both panels.",
  };
}

export function cellMeetsPlane(center: Vec3, cellFeet: number, plane: SectionPlane) {
  const normal = normalize(plane.normal);
  const distance = Math.abs(signed(center, plane.origin, normal));
  return distance <= cellFeet * 0.5 + 1e-6;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function faceNormal(triangle: Triangle): Vec3 | null {
  const ab: Vec3 = [triangle.b[0] - triangle.a[0], triangle.b[1] - triangle.a[1], triangle.b[2] - triangle.a[2]];
  const ac: Vec3 = [triangle.c[0] - triangle.a[0], triangle.c[1] - triangle.a[1], triangle.c[2] - triangle.a[2]];
  const raw = cross(ab, ac);
  const length = Math.hypot(raw[0], raw[1], raw[2]);
  if (length < 1e-8) return null;
  return [raw[0] / length, raw[1] / length, raw[2] / length];
}

const SHARP_DOT = Math.cos((75 * Math.PI) / 180);
const SECONDARY_DOT = Math.cos((45 * Math.PI) / 180);

/**
 * Sharp folds and open edges for the silhouette, and milder folds for a lighter overlay.
 * Coplanar triangulation stays in the source mesh and is omitted from the drawing.
 */
export function architecturalEdges(triangles: Triangle[]): { silhouette: Segment[]; secondary: Segment[] } {
  type Recorded = { a: Vec3; b: Vec3; normals: Vec3[]; count: number };
  const edges = new Map<string, Recorded>();
  for (const triangle of triangles) {
    const normal = faceNormal(triangle);
    const pairs: Array<[Vec3, Vec3]> = [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]];
    for (const [a, b] of pairs) {
      const ak = pointKey(a);
      const bk = pointKey(b);
      const key = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
      const recorded = edges.get(key);
      if (recorded) {
        recorded.count += 1;
        if (normal && recorded.normals.length < 2) recorded.normals.push(normal);
      } else {
        edges.set(key, { a, b, normals: normal ? [normal] : [], count: 1 });
      }
    }
  }
  const silhouette: Segment[] = [];
  const secondary: Segment[] = [];
  for (const edge of edges.values()) {
    if (edge.count !== 2 || edge.normals.length < 2) {
      silhouette.push({ a: edge.a, b: edge.b });
      continue;
    }
    const alignment = Math.abs(dot(edge.normals[0], edge.normals[1]));
    if (alignment < SHARP_DOT) silhouette.push({ a: edge.a, b: edge.b });
    else if (alignment < SECONDARY_DOT) secondary.push({ a: edge.a, b: edge.b });
  }
  return { silhouette, secondary };
}

function clipDepth(segment: Segment, depth: (point: Vec3) => number, minDepth: number, maxDepth: number): Segment | null {
  let a = segment.a;
  let b = segment.b;
  let da = depth(a);
  let db = depth(b);
  if (da > db) {
    [a, b] = [b, a];
    [da, db] = [db, da];
  }
  if (db < minDepth || da > maxDepth) return null;
  const cut = (start: Vec3, end: Vec3, startDepth: number, endDepth: number, limit: number): Vec3 => {
    const t = (limit - startDepth) / (endDepth - startDepth);
    return [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ];
  };
  if (da < minDepth) a = cut(a, b, da, db, minDepth);
  if (db > maxDepth) b = cut(a, b, da < minDepth ? minDepth : da, db, maxDepth);
  if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 1e-3) return null;
  return { a, b };
}

/**
 * Architectural edges beyond the cut, within maxDepth feet.
 * Edges in the cutting plane are left to the section profile.
 */
export function visibleElevation(segments: Segment[], plane: SectionPlane, maxDepth = 8): Segment[] {
  const normal = normalize(plane.normal);
  const depth = (point: Vec3) => signed(point, plane.origin, normal);
  const visible: Segment[] = [];
  for (const segment of segments) {
    const clipped = clipDepth(segment, depth, -maxDepth, -1e-3);
    if (clipped) visible.push(clipped);
  }
  return visible;
}

function chainPolylines(segments: Segment[]): Vec3[][] {
  const unused = segments.map((segment) => ({ a: segment.a, b: segment.b, used: false }));
  const chains: Vec3[][] = [];
  for (let start = 0; start < unused.length; start += 1) {
    if (unused[start].used) continue;
    unused[start].used = true;
    const chain = [unused[start].a, unused[start].b];
    let grew = true;
    while (grew) {
      grew = false;
      const head = chain[0];
      const tail = chain[chain.length - 1];
      for (const segment of unused) {
        if (segment.used) continue;
        if (pointKey(segment.a) === pointKey(tail)) {
          chain.push(segment.b);
          segment.used = true;
          grew = true;
          break;
        }
        if (pointKey(segment.b) === pointKey(tail)) {
          chain.push(segment.a);
          segment.used = true;
          grew = true;
          break;
        }
        if (pointKey(segment.b) === pointKey(head)) {
          chain.unshift(segment.a);
          segment.used = true;
          grew = true;
          break;
        }
        if (pointKey(segment.a) === pointKey(head)) {
          chain.unshift(segment.b);
          segment.used = true;
          grew = true;
          break;
        }
      }
    }
    chains.push(chain);
  }
  return chains;
}

function pointToSegmentDistance(point: Vec3, a: Vec3, b: Vec3) {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(ab[0], ab[1], ab[2]);
  if (length < EPSILON) return Math.hypot(point[0] - a[0], point[1] - a[1], point[2] - a[2]);
  const t = Math.max(0, Math.min(1, dot([point[0] - a[0], point[1] - a[1], point[2] - a[2]], ab) / (length * length)));
  const projected: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return Math.hypot(point[0] - projected[0], point[1] - projected[1], point[2] - projected[2]);
}

function simplifyChain(points: Vec3[], tolerance: number): Vec3[] {
  if (points.length < 3) return points;
  let farthest = 0;
  let index = 0;
  for (let cursor = 1; cursor < points.length - 1; cursor += 1) {
    const distance = pointToSegmentDistance(points[cursor], points[0], points[points.length - 1]);
    if (distance > farthest) {
      farthest = distance;
      index = cursor;
    }
  }
  if (farthest <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplifyChain(points.slice(0, index + 1), tolerance);
  const right = simplifyChain(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** How far a dropped cut point sits from the line that replaced it. Endpoints are required to remain. */
export function simplificationDeviation(segments: Segment[], tolerance = 0.02) {
  let maxDeviationFeet = 0;
  let droppedPoints = 0;
  let endpointsKept = true;
  const chains = chainPolylines(segments);
  for (const chain of chains) {
    const simplified = simplifyChain(chain, tolerance);
    const same = (left: Vec3, right: Vec3) => Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) <= 1e-4;
    if (!simplified.length || !same(simplified[0], chain[0]) || !same(simplified[simplified.length - 1], chain[chain.length - 1])) {
      endpointsKept = false;
    }
    for (const point of chain) {
      let nearest = simplified.length < 2 ? 0 : Infinity;
      for (let index = 1; index < simplified.length; index += 1) {
        nearest = Math.min(nearest, pointToSegmentDistance(point, simplified[index - 1], simplified[index]));
      }
      if (nearest > 1e-3) droppedPoints += 1;
      maxDeviationFeet = Math.max(maxDeviationFeet, nearest);
    }
  }
  return { chains: chains.length, maxDeviationFeet, droppedPoints, endpointsKept, toleranceFeet: tolerance };
}

/** Join collinear drawing fragments. This does not change the source mesh. */
export function simplifySegments(segments: Segment[], tolerance = 0.02): Segment[] {
  const simplified: Segment[] = [];
  for (const chain of chainPolylines(segments)) {
    const points = simplifyChain(chain, tolerance);
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-4) simplified.push({ a, b });
    }
  }
  return simplified;
}

const CUBE_EDGES: Array<[number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Intersection of one evaluated cell with the cutting plane, in feet. */
export function cellCutPolygon(center: Vec3, cellFeet: number, plane: SectionPlane): Vec3[] {
  const half = cellFeet / 2;
  const corners: Vec3[] = [];
  for (const z of [-half, half]) {
    for (const y of [-half, half]) {
      for (const x of [-half, half]) corners.push([center[0] + x, center[1] + y, center[2] + z]);
    }
  }
  const normal = normalize(plane.normal);
  const hits: Vec3[] = [];
  for (const [start, end] of CUBE_EDGES) {
    const hit = edgeHit(corners[start], corners[end], plane.origin, normal);
    if (!hit) continue;
    if (hits.some((point) => Math.hypot(point[0] - hit[0], point[1] - hit[1], point[2] - hit[2]) <= 1e-4)) continue;
    hits.push(hit);
  }
  if (hits.length < 3) return [];
  const tangent = Math.abs(normal[1]) < 0.9 ? normalize(cross(normal, [0, 1, 0])) : normalize(cross(normal, [1, 0, 0]));
  const bitangent = cross(normal, tangent);
  const origin = hits[0];
  return hits
    .map((point) => {
      const delta: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
      return { point, angle: Math.atan2(dot(delta, bitangent), dot(delta, tangent)) };
    })
    .sort((left, right) => left.angle - right.angle)
    .map((item) => item.point);
}
