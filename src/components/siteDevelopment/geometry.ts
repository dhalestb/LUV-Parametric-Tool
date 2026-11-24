import { LATTICE_FEET } from "../lattice/types";

export type Point = [number, number];
export type Polygon = Point[];

export const MIN_ZONE_AREA_FEET = LATTICE_FEET * LATTICE_FEET;

export function nearlyEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

export function polygonClosed(points: Polygon): Polygon {
  if (points.length < 2) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (nearlyEqual(first[0], last[0]) && nearlyEqual(first[1], last[1])) return points.slice();
  return [...points, [first[0], first[1]]];
}

export function polygonOpen(points: Polygon): Polygon {
  const closed = polygonClosed(points);
  if (closed.length < 2) return closed;
  return closed.slice(0, -1);
}

export function polygonArea(points: Polygon) {
  const ring = polygonClosed(points);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) * 0.5;
}

export function polygonCentroid(points: Polygon): Point {
  const ring = polygonOpen(points);
  if (!ring.length) return [0, 0];
  const sum = ring.reduce<Point>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

export function polygonBounds(points: Polygon) {
  const ring = polygonOpen(points);
  if (!ring.length) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ };
}

export function pointInPolygon(point: Point, polygon: Polygon) {
  const ring = polygonOpen(polygon);
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1];
    const xj = ring[j][0], zj = ring[j][1];
    const intersect = (zi > point[1]) !== (zj > point[1]) && point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point) {
  return Math.min(a[0], c[0]) - 1e-9 <= b[0] && b[0] <= Math.max(a[0], c[0]) + 1e-9
    && Math.min(a[1], c[1]) - 1e-9 <= b[1] && b[1] <= Math.max(a[1], c[1]) + 1e-9;
}

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point, shareVertexOk = true) {
  if (shareVertexOk) {
    const shared = [a1, a2].some((a) => [b1, b2].some((b) => nearlyEqual(a[0], b[0]) && nearlyEqual(a[1], b[1])));
    if (shared) return false;
  }
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

export function polygonSelfIntersects(points: Polygon) {
  const ring = polygonClosed(points);
  const count = ring.length - 1;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === count - 1)) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

export function polygonsOverlap(a: Polygon, b: Polygon) {
  const aa = polygonOpen(a);
  const bb = polygonOpen(b);
  if (aa.some((point) => pointInPolygon(point, b)) || bb.some((point) => pointInPolygon(point, a))) return true;
  const ac = polygonClosed(a);
  const bc = polygonClosed(b);
  for (let i = 0; i < ac.length - 1; i++) {
    for (let j = 0; j < bc.length - 1; j++) {
      if (segmentsIntersect(ac[i], ac[i + 1], bc[j], bc[j + 1], false)) return true;
    }
  }
  return false;
}

/** True only for destructive plan area intersection; shared edges/vertices count as contact, not overlap. */
function segmentsProperCross(a1: Point, a2: Point, b1: Point, b2: Point) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) return false;
  return o1 !== o2 && o3 !== o4;
}

function pointOnPolygonBoundary(point: Point, polygon: Polygon, eps = 1e-7) {
  const ring = polygonClosed(polygon);
  for (let i = 0; i < ring.length - 1; i += 1) {
    if (pointSegmentDistance(point, ring[i], ring[i + 1]) <= eps) return true;
  }
  return false;
}

function pointStrictlyInPolygon(point: Point, polygon: Polygon) {
  if (pointOnPolygonBoundary(point, polygon)) return false;
  return pointInPolygon(point, polygon);
}

function edgeMidpoints(polygon: Polygon): Point[] {
  const ring = polygonClosed(polygon);
  const mids: Point[] = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    mids.push([(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2]);
  }
  return mids;
}

export function polygonsAreaIntersect(a: Polygon, b: Polygon) {
  const aa = polygonOpen(a);
  const bb = polygonOpen(b);
  if (aa.length < 3 || bb.length < 3) return false;
  if (pointStrictlyInPolygon(polygonCentroid(aa), bb) || pointStrictlyInPolygon(polygonCentroid(bb), aa)) return true;
  if (aa.some((point) => pointStrictlyInPolygon(point, b)) || bb.some((point) => pointStrictlyInPolygon(point, a))) return true;
  // Edge midpoints catch same-height AABB overlaps where edges stay colinear/parallel.
  if (edgeMidpoints(aa).some((point) => pointStrictlyInPolygon(point, b)) || edgeMidpoints(bb).some((point) => pointStrictlyInPolygon(point, a))) return true;
  const ac = polygonClosed(aa);
  const bc = polygonClosed(bb);
  for (let i = 0; i < ac.length - 1; i += 1) {
    for (let j = 0; j < bc.length - 1; j += 1) {
      if (segmentsProperCross(ac[i], ac[i + 1], bc[j], bc[j + 1])) return true;
    }
  }
  return false;
}

export function rectanglePolygon(a: Point, b: Point): Polygon {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minZ = Math.min(a[1], b[1]);
  const maxZ = Math.max(a[1], b[1]);
  return [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]];
}

/** Monotone-chain convex hull in plan (x,z). Returns CCW ring without duplicate close. */
export function convexHull(points: Point[]): Polygon {
  const unique: Point[] = [];
  const seen = new Set<string>();
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push([point[0], point[1]]);
  }
  if (unique.length <= 1) return unique;
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function translatePolygon(points: Polygon, dx: number, dz: number): Polygon {
  return points.map(([x, z]) => [x + dx, z + dz]);
}

export function bayFootprint(originX: number, originZ: number, size = LATTICE_FEET, yawDeg = 0): Point[] {
  const half = size / 2;
  const corners: Point[] = [
    [-half, -half], [half, -half], [half, half], [-half, half],
    [0, -half], [half, 0], [0, half], [-half, 0],
  ];
  const rad = yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return corners.map(([x, z]) => [originX + x * cos - z * sin, originZ + x * sin + z * cos]);
}

/** Closed rectangle corners only (no edge midpoints) for clearance measurement. */
export function bayOutline(originX: number, originZ: number, size = LATTICE_FEET, yawDeg = 0): Polygon {
  const half = size / 2;
  const corners: Point[] = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const rad = yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return corners.map(([x, z]) => [originX + x * cos - z * sin, originZ + x * sin + z * cos]);
}

function pointSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / len2));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz));
}

/**
 * Signed plan clearance between two polygons.
 * >0 separated, 0 contact/touch, <0 overlapping (destructive footprint conflict).
 */
export function polygonPlanClearance(a: Polygon, b: Polygon): number {
  const aa = polygonOpen(a);
  const bb = polygonOpen(b);
  if (aa.length < 2 || bb.length < 2) return Number.POSITIVE_INFINITY;
  if (polygonsAreaIntersect(aa, bb)) {
    // Destructive footprint area conflict only — edge/vertex contact is measured as 0.
    return -1;
  }
  let min = Infinity;
  const ac = polygonClosed(aa);
  const bc = polygonClosed(bb);
  for (const point of aa) {
    for (let i = 0; i < bc.length - 1; i += 1) min = Math.min(min, pointSegmentDistance(point, bc[i], bc[i + 1]));
  }
  for (const point of bb) {
    for (let i = 0; i < ac.length - 1; i += 1) min = Math.min(min, pointSegmentDistance(point, ac[i], ac[i + 1]));
  }
  return Number.isFinite(min) ? min : 0;
}

export type ClearanceRelation = "separated" | "contact" | "overlap";

export function classifyPlanClearance(measured: number, requiredClearanceFeet: number): {
  relation: ClearanceRelation;
  measured: number;
  ok: boolean;
} {
  const required = Math.max(0, requiredClearanceFeet);
  if (measured < -1e-6) return { relation: "overlap", measured, ok: false };
  if (measured <= 1e-6) return { relation: "contact", measured: 0, ok: required <= 1e-6 };
  return { relation: "separated", measured, ok: measured + 1e-6 >= required };
}

/** True when independent forms violate required edge clearance (0 ft allows touch, not overlap). */
export function violatesEdgeClearance(
  footprintA: Polygon,
  footprintB: Polygon,
  requiredClearanceFeet: number,
): boolean {
  return !classifyPlanClearance(polygonPlanClearance(footprintA, footprintB), requiredClearanceFeet).ok;
}

export function footprintPermitted(footprint: Point[], permitted: Polygon[], exclusions: Polygon[]) {
  if (!permitted.length) return { ok: false, reason: "No permitted development region." };
  if (footprint.some((point) => !permitted.some((region) => pointInPolygon(point, region)))) {
    return { ok: false, reason: "Transformed footprint is not fully inside a permitted cluster zone." };
  }
  if (exclusions.some((region) => footprint.some((point) => pointInPolygon(point, region)))) {
    return { ok: false, reason: "Transformed footprint intersects an exclusion area." };
  }
  return { ok: true, reason: "Footprint is inside the permitted region." };
}

/**
 * Conservative plan envelope: axis-aligned extents in feet, rotated about origin, then translated.
 * Used when exact OBJ triangle footprints are unavailable; never smaller than the 20 ft bay.
 */
export function orientedPlanEnvelope(
  originX: number,
  originZ: number,
  widthFeet: number,
  depthFeet: number,
  yawDeg = 0,
): Polygon {
  const halfW = Math.max(LATTICE_FEET, widthFeet) / 2;
  const halfD = Math.max(LATTICE_FEET, depthFeet) / 2;
  const corners: Point[] = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]];
  const rad = yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return corners.map(([x, z]) => [originX + x * cos - z * sin, originZ + x * sin + z * cos]);
}

export type PolygonIssue = {
  code: "open" | "degenerate" | "self-intersection" | "area" | "overlap" | "exclusion";
  message: string;
  severity: "error" | "warning";
};

export function validatePolygon(points: Polygon, options: {
  minArea?: number;
  others?: Polygon[];
  exclusions?: Polygon[];
  kind?: "zone" | "exclusion";
} = {}): PolygonIssue[] {
  const issues: PolygonIssue[] = [];
  const ring = polygonOpen(points);
  if (ring.length < 3) issues.push({ code: "degenerate", message: "A polygon needs at least three vertices.", severity: "error" });
  if (polygonSelfIntersects(points)) issues.push({ code: "self-intersection", message: "Polygon edges intersect themselves.", severity: "error" });
  const area = polygonArea(points);
  const minArea = options.minArea ?? MIN_ZONE_AREA_FEET;
  if (ring.length >= 3 && area < minArea) {
    issues.push({ code: "area", message: `Usable area ${area.toFixed(0)} ft² is below ${minArea} ft² (one 20×20 ft proto-form bay).`, severity: "error" });
  }
  for (const other of options.others ?? []) {
    if (polygonsOverlap(points, other)) {
      issues.push({
        code: "overlap",
        message: options.kind === "exclusion" ? "Exclusion overlaps another exclusion." : "Zone overlaps another development zone. Earlier zones keep the first high-scoring placements; later overlapping zones receive remaining spaced candidates.",
        severity: "warning",
      });
    }
  }
  return issues;
}

export function distancePointToSegment(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.max(1e-9, dx * dx + dz * dz);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length));
  const x = a[0] + t * dx;
  const z = a[1] + t * dz;
  return Math.hypot(point[0] - x, point[1] - z);
}

export function distanceToPolyline(point: Point, line: Point[]) {
  if (line.length === 1) return Math.hypot(point[0] - line[0][0], point[1] - line[0][1]);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distancePointToSegment(point, line[i], line[i + 1]));
  return best;
}

export function corridorObstructs(footprint: Point[], corridor: Point[], widthFeet: number) {
  if (corridor.length < 2) return false;
  return footprint.some((point) => distanceToPolyline(point, corridor) <= widthFeet * 0.5);
}

export const CLOSE_VERTEX_FEET = 18;

export function pointsNear(a: Point, b: Point, tolerance = CLOSE_VERTEX_FEET) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
}

export function polygonsNearlyEqual(a: Polygon, b: Polygon, tolerance = 1.5) {
  const aa = polygonOpen(a);
  const bb = polygonOpen(b);
  if (aa.length !== bb.length) return false;
  return aa.every((point, index) => pointsNear(point, bb[index], tolerance));
}

/** Intersect a world-space ray with the site-local Y = 0 plane. Returns plan (x, z) feet. */
export function rayIntersectXzPlane(
  origin: [number, number, number],
  direction: [number, number, number],
): Point | null {
  if (Math.abs(direction[1]) < 1e-12) return null;
  const t = -origin[1] / direction[1];
  if (t < 0) return null;
  return [origin[0] + direction[0] * t, origin[2] + direction[2] * t];
}

export function ndcToRay(
  ndcX: number,
  ndcY: number,
  viewProjectionInverse: number[],
): { origin: [number, number, number]; direction: [number, number, number] } | null {
  if (viewProjectionInverse.length < 16) return null;
  const m = viewProjectionInverse;
  const transform = (x: number, y: number, z: number): [number, number, number] => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (Math.abs(w) < 1e-12) return [0, 0, 0];
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  };
  const near = transform(ndcX, ndcY, -1);
  const far = transform(ndcX, ndcY, 1);
  const direction: [number, number, number] = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length < 1e-12) return null;
  return {
    origin: near,
    direction: [direction[0] / length, direction[1] / length, direction[2] / length],
  };
}

export function screenToSiteFeet(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewProjectionInverse: number[],
): Point | null {
  if (rect.width < 1 || rect.height < 1) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const ray = ndcToRay(ndcX, ndcY, viewProjectionInverse);
  if (!ray) return null;
  return rayIntersectXzPlane(ray.origin, ray.direction);
}

export function drawingToolsActive(tool: string) {
  return tool === "draw-polygon" || tool === "draw-rectangle" || tool === "exclusion"
    || tool === "edit-vertex" || tool === "move-zone" || tool === "anchor"
    || tool === "view-corridor" || tool === "arrival";
}

export function polygonToolsNeedTopView(tool: string) {
  return tool === "draw-polygon" || tool === "draw-rectangle" || tool === "exclusion";
}

export function shouldClosePolygon(draft: Point[], next: Point) {
  return draft.length >= 3 && pointsNear(next, draft[0]);
}

export function shouldIgnoreDuplicateClick(previous: Point | null, next: Point, elapsedMs: number, windowMs = 280) {
  return !!previous && elapsedMs < windowMs && pointsNear(next, previous, 8);
}
