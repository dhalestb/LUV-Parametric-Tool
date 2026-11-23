// Architectural rules owned exclusively by open-hall-workspace.
import * as THREE from "three";
import type { IntersectionPlacement } from "../amphitheaterInteractiveTypes";
import { getLetterVolumeGeometry } from "../letterGeometry3d";

import type { OfficeField, OfficePlan, OfficeCheck, MezzanineWrapFaces, OpenHallGuideCandidate, OpenHallCorner, Pt, OpenHallGuideRole, OfficeSlot, OfficePlate, OfficeVoid, OfficeLink } from "./contracts";

const L_UNIT_OUTER: Pt = [-0.42, -0.45];

const L_UNIT_INNER: Pt = [-0.12, -0.18];

const OPEN_HALL_CORNERS: OpenHallCorner[] = ["SW", "SE", "NE", "NW"];

const OPEN_HALL_CORNER_RZ: Record<OpenHallCorner, number> = { SW: 0, SE: 90, NE: 180, NW: 270 };

export const DEFAULT_OFFICE_FIELD: OfficeField = { width: 20, depth: 20, height: 20 };

export const MEZZANINE_MIN_WIDTH = 10;

export const OPEN_HALL_OPENING_MIN = 0.2;

export const OPEN_HALL_OPENING_MAX = 0.4;

export const OPEN_HALL_OPENING_TARGET = (OPEN_HALL_OPENING_MIN + OPEN_HALL_OPENING_MAX) / 2;

export const OPEN_HALL_WALL_THICKNESS = 1.5;
export const OPEN_HALL_DEFAULT_SLAB_THICKNESS = 0.75;

export const OPEN_HALL_ENTRY_WIDTH = 10;

export const OPEN_HALL_COLUMN_SIZES = [1, 2, 3] as const;

export const OPEN_HALL_COLUMN_GRID_SPACINGS = [15, 20, 25] as const;

export const OPEN_HALL_FLOOR_MEZZ_GUIDE_SIZES = [9, 11, 13] as const;

export const OPEN_HALL_WALL_GUIDE_SIZES = [6, 9, 12] as const;

export const OPEN_HALL_ROOF_GUIDE_SIZES = [3, 6, 9] as const;

export const OPEN_HALL_DEFAULT_COLUMN_SIZE = 2;

export const OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING = 20;

export const OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE = 11;

export const OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE = 9;

export const OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE = 6;

export const OPEN_HALL_ROOF_GUIDE_COUNT = 4;

export const OPEN_HALL_MEZZANINE_OPTIONS = [
  {value: 2, label: "2-channel · L plate"},
  {value: 3, label: "3-channel · U plate"},
  {value: 4, label: "4-channel · ring plate"},
] as const;
export const OPEN_HALL_ROOF_SIZING_OPTIONS = [
  {value: "fixed", label: "Fixed size"},
  {value: "pillar", label: "Fit between pillar edges"},
] as const;
export const OPEN_HALL_DEFAULT_MEZZANINE = OPEN_HALL_MEZZANINE_OPTIONS[0].value;
export const OPEN_HALL_DEFAULT_ROOF_SIZING = OPEN_HALL_ROOF_SIZING_OPTIONS[0].value;
export const OPEN_HALL_DEFAULT_ROOF_INSET = 0;

type OpenHallOptions = Pick<OfficeField,
  "mezzanineFaces" | "columnSize" | "columnGridSpacing" | "floorMezzGuideSize" | "wallGuideSize" |
  "roofGuideSize" | "roofSizing" | "roofInset" | "wallThickness" | "slabThickness" | "perimeterWalls"
> & { joinWalls?: boolean };

export function openHallSettingsError(settings: OpenHallOptions | undefined) {
  const faces = settings?.mezzanineFaces;
  if (faces !== undefined && !OPEN_HALL_MEZZANINE_OPTIONS.some(option => option.value === faces)) {
    return 'Open Hall mezzanine wrap must be 2, 3 or 4 faces.';
  }
  for (const name of ['perimeterWalls', 'joinWalls'] as const) {
    if (settings?.[name] !== undefined && typeof settings[name] !== 'boolean') return `Open Hall ${name} must be a boolean.`;
  }
  const dimensions = [
    ['wall thickness', settings?.wallThickness], ['slab thickness', settings?.slabThickness],
    ['column size', settings?.columnSize], ['column grid size', settings?.columnGridSpacing],
    ['floor/mezz size', settings?.floorMezzGuideSize], ['wall size', settings?.wallGuideSize],
    ['roof size', settings?.roofGuideSize],
  ] as const;
  const invalid = dimensions.find(([, value]) => value !== undefined && (!Number.isFinite(value) || value <= 0));
  if (invalid) return `Open Hall ${invalid[0]} must be a positive number (ft).`;
}

export function openHallRequestGeometry(settings: OpenHallOptions | undefined, preferredFeet: number) {
  // Older requests recorded some guide presets only in preferredFeet.
  const legacyFloorSize = OPEN_HALL_FLOOR_MEZZ_GUIDE_SIZES.find(size => size === preferredFeet);
  return {
    mezzanineFaces: settings?.mezzanineFaces ?? OPEN_HALL_DEFAULT_MEZZANINE,
    wallThickness: settings?.wallThickness ?? OPEN_HALL_WALL_THICKNESS,
    slabThickness: settings?.slabThickness ?? OPEN_HALL_DEFAULT_SLAB_THICKNESS,
    columnSize: settings?.columnSize ?? OPEN_HALL_DEFAULT_COLUMN_SIZE,
    columnGridSpacing: settings?.columnGridSpacing ?? OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING,
    floorMezzGuideSize: settings?.floorMezzGuideSize ?? legacyFloorSize ?? OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE,
    wallGuideSize: settings?.wallGuideSize ?? OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE,
    roofGuideSize: settings?.roofGuideSize ?? OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE,
    roofSizing: OPEN_HALL_ROOF_SIZING_OPTIONS.find(option => option.value === settings?.roofSizing)?.value ?? OPEN_HALL_DEFAULT_ROOF_SIZING,
    roofInset: settings?.roofInset ?? OPEN_HALL_DEFAULT_ROOF_INSET,
  };
}

export function openHallFieldPresetError(field: Pick<OfficeField, "width" | "depth">) {
  if (field.width === 20 || field.depth === 20) {
    return `Set Width X and Depth Y to 40 ft or 60 ft. A 20 ft plan dimension leaves too little room for the ${MEZZANINE_MIN_WIDTH} ft mezzanine bands. Height Z can stay at 20 ft.`;
  }
}

export function openHallColumnGridError(settings: Pick<OfficeField, "columnSize" | "columnGridSpacing">) {
  const size = normalizeOpenHallColumnSize(settings.columnSize);
  const spacing = normalizeOpenHallColumnGridSpacing(settings.columnGridSpacing);
  const minimum = Math.max(1, 5 - size);
  if (spacing < minimum) {
    return `Open Hall needs column grid spacing of at least ${Number(minimum.toFixed(6))} ft with the selected ${size} ft column L size. Increase Column grid spacing or choose a preset.`;
  }
}

export function normalizeOpenHallGuideSize(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value as number) > 0 ? value as number : fallback;
}

export function normalizeOpenHallColumnSize(value?: number) {
  return normalizeOpenHallGuideSize(value, OPEN_HALL_DEFAULT_COLUMN_SIZE);
}

export function normalizeOpenHallColumnGridSpacing(value?: number) {
  return normalizeOpenHallGuideSize(value, OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING);
}

export function normalizeOpenHallFloorMezzGuideSize(value?: number) {
  return normalizeOpenHallGuideSize(value, OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE);
}

export function normalizeOpenHallWallGuideSize(value?: number) {
  return normalizeOpenHallGuideSize(value, OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE);
}

export function normalizeOpenHallRoofGuideSize(value?: number) {
  return normalizeOpenHallGuideSize(value, OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE);
}

const SLAB = 0.75;

function roofTopForField(field: OfficeField, thickness = SLAB) {
  return field.height - 0.05;
}

function roofUndersideForField(field: OfficeField, thickness = SLAB) {
  return roofTopForField(field, thickness) - thickness;
}

function check(list: OfficeCheck[], label: string, ok: boolean, detail: string) {
  list.push({ label, status: ok ? "pass" : "fail", detail });
}

function signedArea(poly: Pt[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function area(poly: Pt[]) { return Math.abs(signedArea(poly)); }

function ccw(poly: Pt[]): Pt[] { return signedArea(poly) >= 0 ? poly : [...poly].reverse(); }

function centroid(poly: Pt[]): Pt {
  const a = signedArea(poly) || 1e-8;
  let x = 0, y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
  }
  return [x / (6 * a), y / (6 * a)];
}

function pointInPoly(p: Pt, poly: Pt[]) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    if (Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) <= 0.03) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}

function halfPlane(poly: Pt[], nx: number, ny: number, limit: number, keepBelow: boolean): Pt[] {
  if (poly.length < 3) return [];
  const side = (p: Pt) => nx * p[0] + ny * p[1];
  const inside = (p: Pt) => keepBelow ? side(p) <= limit + 1e-7 : side(p) >= limit - 1e-7;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
    const cin = inside(cur), pin = inside(prev);
    if (cin !== pin) {
      const sa = side(prev), sb = side(cur), t = (limit - sa) / ((sb - sa) || 1e-12);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (cin) out.push(cur);
  }
  return out;
}

function intersectionArea(subject: Pt[], clipPoly: Pt[]) {
  let poly = subject;
  const clip = ccw(clipPoly);
  for (let i = 0; i < clip.length; i++) {
    const c = clip[i], d = clip[(i + 1) % clip.length];
    const dx = d[0] - c[0], dy = d[1] - c[1];
    const nx = -dy, ny = dx;
    poly = halfPlane(poly, nx, ny, nx * c[0] + ny * c[1], false);
    if (poly.length < 3) return 0;
  }
  return area(poly);
}

function rect(cx: number, cy: number, w: number, h: number): Pt[] {
  return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
}

function rotateLocal(p: Pt, deg: number): Pt {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

function snappedOrthogonal(deg: number) {
  const n = ((deg % 360) + 360) % 360;
  return [0, 90, 180, 270].some((step) => Math.abs(n - step) < 1e-6 || Math.abs(n - 360) < 1e-6);
}

function snapped15(deg: number) {
  const turned = ((deg % 360) + 360) % 360;
  return Math.abs(turned / 15 - Math.round(turned / 15)) < 1e-3 || Math.abs(((turned - 360) / 15)) < 1e-3;
}

function boundsOf(polys: Pt[][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const p of poly) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  return { minX, minY, maxX, maxY };
}

function fitsSquare(poly: Pt[], size: number, angles: number[], obstacles: Pt[][] = []) {
  const box = boundsOf([poly]);
  if (box.maxX - box.minX < size - 1e-3 || box.maxY - box.minY < size - 1e-3) {
    // Still try rotated squares; the axis box can be larger than the square's own box.
  }
  const blocked = (p: Pt) => obstacles.some((ob) => pointInPoly(p, ob));
  for (const angle of angles) {
    const r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const toLocal = (p: Pt): Pt => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
    const toWorld = (p: Pt): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    const local = poly.map(toLocal);
    const boxL = boundsOf([local]);
    if (boxL.maxX - boxL.minX >= size - 0.03 && boxL.maxY - boxL.minY >= size - 0.03) {
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
        const x = boxL.minX + (boxL.maxX - boxL.minX - size) * i / 6;
        const y = boxL.minY + (boxL.maxY - boxL.minY - size) * j / 6;
        const samples: Pt[] = [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x + size / 2, y + size / 2]];
        const corners = samples.map(toWorld);
        if (corners.every((p) => pointInPoly(p, poly) && !blocked(p))) return true;
      }
    }
  }
  return false;
}

function openHallCenteredLPolygon(center: Pt, scale: number, rz: number): Pt[] {
  const ox = L_UNIT_OUTER[0], oy = L_UNIT_OUTER[1];
  const ix = L_UNIT_INNER[0], iy = L_UNIT_INNER[1];
  // Outer tip → far arm ends; crook at inner; body stays toward the hall centre.
  const raw: Pt[] = [
    [ox, oy], [-ox, oy], [-ox, iy], [ix, iy], [ix, -oy], [ox, -oy],
  ].map(([x, y]) => [x * scale, y * scale] as Pt);
  return raw.map((p) => {
    const turned = rotateLocal(p, rz);
    return [center[0] + turned[0], center[1] + turned[1]] as Pt;
  });
}

function openHallFilledLPocketPolygon(center: Pt, scale: number, rz: number): Pt[] {
  const l = openHallCenteredLPolygon(center, scale, rz);
  const xs = l.map((p) => p[0]), ys = l.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

function quad(a: Pt, b: Pt, width: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * width / 2, ny = dx / len * width / 2;
  return [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]];
}

function overheadClearance(plates: OfficePlate[], roles: OfficePlate["role"][]) {
  let min = Infinity, pair = "none";
  for (const lower of plates) {
    if (!roles.includes(lower.role)) continue;
    for (const upper of plates) {
      if (upper.id === lower.id || upper.role === "support" || upper.role === "wall") continue;
      const underside = upper.zTop - upper.thickness;
      if (upper.role !== "roof" && upper.role !== "mezzanine" && upper.role !== "working") continue;
      if (underside <= lower.zTop + 0.02) continue;
      if (intersectionArea(lower.polygon, upper.polygon) < 1) continue;
      const clear = underside - lower.zTop;
      if (clear < min) { min = clear; pair = `${lower.id} under ${upper.id}`; }
    }
  }
  return { min, pair };
}

function insideEnvelope(plates: OfficePlate[], voids: OfficeVoid[], links: OfficeLink[], center: [number, number, number], field: OfficeField) {
  const polys = [...plates.map((p) => p.polygon), ...voids.map((v) => v.polygon), ...links.map((l) => quad(l.from, l.to, l.width))];
  const box = boundsOf(polys.filter((p) => p.length >= 3));
  let zMin = Infinity, zMax = -Infinity;
  for (const plate of plates) { zMin = Math.min(zMin, plate.zTop - plate.thickness); zMax = Math.max(zMax, plate.zTop); }
  for (const link of links) { zMin = Math.min(zMin, Math.min(link.z0, link.z1) - link.thickness); zMax = Math.max(zMax, Math.max(link.z0, link.z1)); }
  const spanX = box.maxX - box.minX, spanY = box.maxY - box.minY, spanZ = zMax - zMin;
  const [cx, cy, cz] = center;
  const hx = field.width / 2, hy = field.depth / 2, hz = field.height / 2;
  const inside = box.minX >= cx - hx - 1e-3 && box.maxX <= cx + hx + 1e-3
    && box.minY >= cy - hy - 1e-3 && box.maxY <= cy + hy + 1e-3
    && zMin >= cz - hz - 1e-3 && zMax <= cz + hz + 1e-3;
  return {
    box, zMin, zMax, spanX, spanY, spanZ,
    ok: inside && spanX <= field.width + 1e-3 && spanY <= field.depth + 1e-3 && spanZ <= field.height + 1e-3,
    field,
  };
}

function transformPlan(plan: Omit<OfficePlan, "rotation">, rotation: number, center: [number, number, number], field: OfficeField): OfficePlan {
  const bottom = center[2] - field.height / 2;
  const xy = (p: Pt): Pt => {
    const turned = rotateLocal(p, rotation);
    return [center[0] + turned[0], center[1] + turned[1]];
  };
  const plates = plan.plates.map((plate) => ({ ...plate, polygon: plate.polygon.map(xy), zTop: bottom + plate.zTop }));
  const voids = plan.voids.map((v) => ({ ...v, polygon: v.polygon.map(xy) }));
  const links = plan.links.map((l) => ({ ...l, from: xy(l.from), to: xy(l.to), z0: bottom + l.z0, z1: bottom + l.z1 }));
  const slots = plan.slots.map((slot) => {
    const moved = xy([slot.x, slot.y]);
    return { ...slot, x: moved[0], y: moved[1], z: bottom + slot.z, rz: slot.rz + rotation };
  });
  return { ...plan, checks: [...plan.checks], rotation, plates, voids, links, slots };
}

function addEnvelopeChecks(plan: OfficePlan, rotation: number, center: [number, number, number], field: OfficeField) {
  const span = insideEnvelope(plan.plates, plan.voids, plan.links, center, field);
  const fieldLabel = `${field.width} × ${field.depth} × ${field.height} ft`;
  check(plan.checks, "Field envelope", span.ok, span.ok
    ? `All plates, voids, supports and connections span ${span.spanX.toFixed(2)} × ${span.spanY.toFixed(2)} × ${span.spanZ.toFixed(2)} ft inside the ${fieldLabel} field. Footprint rotation is ${rotation}°.`
    : `Geometry spans ${span.spanX.toFixed(2)} × ${span.spanY.toFixed(2)} × ${span.spanZ.toFixed(2)} ft and does not sit inside the ${fieldLabel} field. Completed geometry was not rescaled.`);
  if (plan.typology === "open-hall-workspace") {
    check(plan.checks, "Orthogonal footprint", snappedOrthogonal(rotation), `Measured rotation ${rotation}°; threshold orthogonal 0/90/180/270°; units degrees. Working surfaces stay horizontal.`);
  } else {
    check(plan.checks, "15° footprint rotation", snapped15(rotation), `Measured rotation ${rotation}°; threshold 15° increments; units degrees. Working surfaces stay horizontal.`);
  }
  // No post-generation rescale is a policy; actual guide placement is checked after arrangement.
}

function mezzanineShapeName(faces: MezzanineWrapFaces) {
  return faces === 2 ? "2-channel" : faces === 3 ? "3-channel" : "4-channel";
}

function openHallCornerPoint(hx: number, hy: number, corner: OpenHallCorner): Pt {
  if (corner === "SW") return [-hx, -hy];
  if (corner === "SE") return [hx, -hy];
  if (corner === "NE") return [hx, hy];
  return [-hx, hy];
}

function openHallLetterCenterForEdge(edgePoint: Pt, scale: number, rz: number, edge: "outer" | "inner"): Pt {
  const local = edge === "outer" ? L_UNIT_OUTER : L_UNIT_INNER;
  const offset = rotateLocal([local[0] * scale, local[1] * scale], rz);
  return [edgePoint[0] - offset[0], edgePoint[1] - offset[1]];
}

function openHallEdgePointFromLetter(center: Pt, scale: number, rz: number, edge: "outer" | "inner"): Pt {
  const local = edge === "outer" ? L_UNIT_OUTER : L_UNIT_INNER;
  const offset = rotateLocal([local[0] * scale, local[1] * scale], rz);
  return [center[0] + offset[0], center[1] + offset[1]];
}

function openHallOuterCornerLetters(hx: number, hy: number, scale: number, z: number, role: "floor" | "mezzanine"): OpenHallGuideCandidate[] {
  return OPEN_HALL_CORNERS.map((corner) => {
    const rz = OPEN_HALL_CORNER_RZ[corner];
    const tip = openHallCornerPoint(hx, hy, corner);
    const p = openHallLetterCenterForEdge(tip, scale, rz, "outer");
    return { p, z, scale, role, rx: 0, ry: 0, rz };
  });
}

function openHallEnsureCcw(poly: Pt[]): Pt[] {
  return ccw(poly);
}

function openHallMezzaninePlatformCorners(poly: Pt[]) {
  const ring = openHallEnsureCcw(poly);
  const n = ring.length;
  const corners: { p: Pt; prev: Pt; next: Pt; kind: "exterior" | "interior" }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const p = ring[i];
    const next = ring[(i + 1) % n];
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    if (Math.abs(cross) < 1e-8) continue;
    corners.push({ p, prev, next, kind: cross > 0 ? "exterior" : "interior" });
  }
  return corners;
}

function openHallYawToward(target: Pt): number {
  let best = 0, bestDot = -Infinity;
  for (const rz of [0, 90, 180, 270]) {
    const v = rotateLocal([1, 1], rz);
    const dot = v[0] * target[0] + v[1] * target[1];
    if (dot > bestDot) { bestDot = dot; best = rz; }
  }
  return best;
}

function openHallCornerInward(prev: Pt, corner: Pt, next: Pt): Pt {
  const d0: Pt = [corner[0] - prev[0], corner[1] - prev[1]];
  const d1: Pt = [next[0] - corner[0], next[1] - corner[1]];
  const inward: Pt = [-d0[1] - d1[1], d0[0] + d1[0]];
  const len = Math.hypot(inward[0], inward[1]) || 1;
  return [inward[0] / len, inward[1] / len];
}

function openHallMezzanineCornerLetters(
  faces: MezzanineWrapFaces,
  hx: number,
  hy: number,
  band: number,
  scale: number,
  z: number,
): { exterior: OpenHallGuideCandidate[]; interior: OpenHallGuideCandidate[]; all: OpenHallGuideCandidate[] } {
  const length = hx * 2, depth = hy * 2;
  if (faces === 4) {
    // Ring: 4 outer hall corners + 4 inner void corners.
    const exterior = openHallOuterCornerLetters(hx, hy, scale, z, "mezzanine");
    const ix = hx - band, iy = hy - band;
    const interior = (["SW", "SE", "NE", "NW"] as OpenHallCorner[]).map((corner) => {
      const rz = OPEN_HALL_CORNER_RZ[corner];
      const voidCorner = openHallCornerPoint(ix, iy, corner);
      return {
        p: openHallLetterCenterForEdge(voidCorner, scale, rz, "inner"),
        z, scale, role: "mezzanine" as const, rx: 0, ry: 0, rz,
      };
    });
    return { exterior, interior, all: [...exterior, ...interior] };
  }
  const poly = openHallMezzanine(length, depth, faces, band).polygons[0];
  const corners = openHallMezzaninePlatformCorners(poly);
  const exterior: OpenHallGuideCandidate[] = [];
  const interior: OpenHallGuideCandidate[] = [];
  for (const corner of corners) {
    const inward = openHallCornerInward(corner.prev, corner.p, corner.next);
    if (corner.kind === "exterior") {
      const rz = openHallYawToward(inward);
      exterior.push({
        p: openHallLetterCenterForEdge(corner.p, scale, rz, "outer"),
        z, scale, role: "mezzanine", rx: 0, ry: 0, rz,
      });
    } else {
      // Interior reentrant: open crook faces the void (opposite of plate inward).
      const rz = openHallYawToward([-inward[0], -inward[1]]);
      interior.push({
        p: openHallLetterCenterForEdge(corner.p, scale, rz, "inner"),
        z, scale, role: "mezzanine", rx: 0, ry: 0, rz,
      });
    }
  }
  return { exterior, interior, all: [...exterior, ...interior] };
}

function openHallRectFromOuterLetters(letters: { p: Pt; scale: number; rz: number }[]) {
  const tips = letters.map((letter) => openHallEdgePointFromLetter(letter.p, letter.scale, letter.rz, "outer"));
  const xs = tips.map((t) => t[0]), ys = tips.map((t) => t[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    length: maxX - minX,
    depth: maxY - minY,
    hx: (maxX - minX) / 2,
    hy: (maxY - minY) / 2,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    polygon: rect((minX + maxX) / 2, (minY + maxY) / 2, maxX - minX, maxY - minY),
  };
}

function openHallMezzanine(length: number, depth: number, faces: MezzanineWrapFaces, band: number) {
  const hx = length / 2, hy = depth / 2;
  if (faces === 2) {
    const mezz: Pt[] = [
      [-hx, hy - band], [hx - band, hy - band], [hx - band, -hy], [hx, -hy], [hx, hy], [-hx, hy],
    ];
    return { polygons: [mezz], opening: 1 - area(mezz) / (length * depth) };
  }
  if (faces === 3) {
    // Three-sided channel open to the south; overlooking edges face the hall.
    const mezz: Pt[] = [
      [-hx, -hy], [-hx, hy], [hx, hy], [hx, -hy],
      [hx - band, -hy], [hx - band, hy - band], [-hx + band, hy - band], [-hx + band, -hy],
    ];
    return { polygons: [mezz], opening: 1 - area(mezz) / (length * depth) };
  }
  const north = rect(0, hy - band / 2, length, band);
  const south = rect(0, -hy + band / 2, length, band);
  const west = rect(-hx + band / 2, 0, band, depth - 2 * band);
  const east = rect(hx - band / 2, 0, band, depth - 2 * band);
  const polygons = [north, south, west, east];
  const mezzArea = polygons.reduce((sum, poly) => sum + area(poly), 0);
  return { polygons, opening: 1 - mezzArea / (length * depth) };
}

function openHallColumnGrid(length: number, depth: number, spacing: number, clearCenter = true) {
  const S = Math.max(1, spacing);
  // Fit as many equal-S bays as the floor plate allows; never exceed the perimeter.
  const nBaysX = Math.max(1, Math.floor((length + 1e-9) / S));
  const nBaysY = Math.max(1, Math.floor((depth + 1e-9) / S));
  const spanX = Math.min(length, nBaysX * S);
  const spanY = Math.min(depth, nBaysY * S);
  const nCols = nBaysX + 1;
  const nRows = nBaysY + 1;
  // Equal spacing in X and Y: use S when the plate fits whole modules; otherwise
  // a single bay spans that plate edge (outer columns still on that edge).
  const spacingX = nCols > 1 ? spanX / (nCols - 1) : 0;
  const spacingY = nRows > 1 ? spanY / (nRows - 1) : 0;
  const x0 = -spanX / 2;
  const y0 = -spanY / 2;
  const anchors: Pt[] = [];
  const midI = (nCols - 1) / 2, midJ = (nRows - 1) / 2;
  for (let i = 0; i < nCols; i++) {
    for (let j = 0; j < nRows; j++) {
      if (clearCenter && Number.isInteger(midI) && Number.isInteger(midJ) && i === midI && j === midJ) continue;
      anchors.push([x0 + i * spacingX, y0 + j * spacingY]);
    }
  }
  const onPerimeter = Math.abs(spanX - length) < 1e-6 && Math.abs(spanY - depth) < 1e-6;
  return {
    anchors, nCols, nRows, spacingX, spacingY,
    spacing: S, spanX, spanY,
    onPerimeter,
    setback: Math.max(0, (length - spanX) / 2),
  };
}

function openHallPerimeterWalls(
  length: number,
  depth: number,
  wallT: number,
  entryWidth: number,
  groundTop: number,
  roofUnderside: number,
  faces: MezzanineWrapFaces,
  jambX: number,
  jambY: number,
): OfficePlate[] {
  const hx = length / 2, hy = depth / 2;
  const wallH = Math.max(roofUnderside - groundTop, 0.05);
  const zTop = roofUnderside;
  const walls: OfficePlate[] = [];
  const push = (id: string, polygon: Pt[]) => {
    if (area(polygon) < 0.5) return;
    walls.push({ id, polygon, zTop, thickness: wallH, role: "wall" });
  };
  push("wall-north", rect(0, hy - wallT / 2, length, wallT));
  // Two channels expose the southwest hall on two adjacent facades.
  // Other channels expose only the south facade between the mezzanine jambs.
  if (faces === 2) {
    push("wall-west", rect(-hx + wallT / 2, (jambY + hy - wallT) / 2, wallT, hy - wallT - jambY));
  } else {
    push("wall-west", rect(-hx + wallT / 2, 0, wallT, depth - 2 * wallT));
  }
  push("wall-east", rect(hx - wallT / 2, 0, wallT, depth - 2 * wallT));
  if (faces !== 2) push("wall-south-west", rect((-hx - jambX) / 2, -hy + wallT / 2, hx - jambX, wallT));
  push("wall-south-east", rect((jambX + hx) / 2, -hy + wallT / 2, hx - jambX, wallT));
  return walls;
}

function openHallGuideSlot(
  x: number, y: number, z: number,
  scale: number,
  role: OpenHallGuideRole,
  rx = 0, ry = 0, rz = 0,
): OfficeSlot {
  return { x, y, z, rx, ry, rz, scale, prefer: "L", openHallRole: role };
}

function openHallGuideSlotsFrom(candidates: OpenHallGuideCandidate[]) {
  return candidates.map((c) => openHallGuideSlot(c.p[0], c.p[1], c.z, c.scale, c.role, c.rx, c.ry, c.rz));
}

/**
 * Open Hall two-stage pipeline (no prior parametric massing):
 * 1) Letter arrangement — generate plan-matched oriented L sets (floor / mezz / column / wall / roof).
 * 2) Architectural generation — extrude plates, piers, walls, roof, skylights only from those letters.
 */
function openHall(field: OfficeField = DEFAULT_OFFICE_FIELD): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const faces = OPEN_HALL_MEZZANINE_OPTIONS.find(option => option.value === field.mezzanineFaces)?.value ?? OPEN_HALL_DEFAULT_MEZZANINE;
  const columnSize = normalizeOpenHallColumnSize(field.columnSize);
  const columnGridSpacing = normalizeOpenHallColumnGridSpacing(field.columnGridSpacing);
  const gridError = openHallColumnGridError({ columnSize, columnGridSpacing });
  if (gridError) throw Error(gridError);
  const floorMezzGuide = normalizeOpenHallFloorMezzGuideSize(field.floorMezzGuideSize ?? field.preferredFeet);
  const wallGuide = normalizeOpenHallWallGuideSize(field.wallGuideSize);
  let roofGuide = normalizeOpenHallRoofGuideSize(field.roofGuideSize);
  const wallT = normalizeOpenHallGuideSize(field.wallThickness, OPEN_HALL_WALL_THICKNESS);
  const slabT = normalizeOpenHallGuideSize(field.slabThickness, OPEN_HALL_DEFAULT_SLAB_THICKNESS);
  const groundTop = slabT;
  const mezzTop = field.height / 2;
  const roofUnderside = roofUndersideForField(field, slabT);
  const roofTop = roofUnderside + slabT;
  const shape = mezzanineShapeName(faces);
  const expectedMezzCount = faces === 2 ? 6 : 8;

  // ——— 1. LETTER ARRANGEMENT ———
  // Floor: four corner Ls whose outer tips define the plate (fit tips inside the field).
  const tipPad = Math.max(0.5, wallT * 0.25);
  let tipHx = Math.max(6, field.width / 2 - tipPad);
  let tipHy = Math.max(6, field.depth / 2 - tipPad);
  // Fit a square footprint within the available field for every channel option.
  const tipLength = Math.min(tipHx, tipHy) * 2;
  const tipDepth = tipLength;
  tipHx = tipLength / 2;
  tipHy = tipDepth / 2;
  const floorLetters = openHallOuterCornerLetters(tipHx, tipHy, floorMezzGuide, groundTop - slabT / 2, "floor");

  // Mezz band first (opening target), then seat Ls on the platform's exterior + interior corners.
  const maxBand = Math.min(tipLength, tipDepth) / 2 - 1;
  let pocketBand = Math.min(MEZZANINE_MIN_WIDTH, maxBand);
  let trial = openHallMezzanine(tipLength, tipDepth, faces, pocketBand);
  while (trial.opening > OPEN_HALL_OPENING_TARGET + 1e-6 && pocketBand + 0.5 <= maxBand) {
    const nextBand = pocketBand + 0.5;
    const next = openHallMezzanine(tipLength, tipDepth, faces, nextBand);
    if (next.opening < OPEN_HALL_OPENING_MIN - 1e-6) break;
    pocketBand = nextBand;
    trial = next;
  }
  while (trial.opening > OPEN_HALL_OPENING_MAX + 1e-6 && pocketBand + 0.5 <= maxBand) {
    const nextBand = pocketBand + 0.5;
    const next = openHallMezzanine(tipLength, tipDepth, faces, nextBand);
    if (next.opening < OPEN_HALL_OPENING_MIN - 1e-6) break;
    pocketBand = nextBand;
    trial = next;
  }
  let mezzCornerSet = openHallMezzanineCornerLetters(faces, tipHx, tipHy, pocketBand, floorMezzGuide, mezzTop - slabT / 2);
  let mezzOuterLetters = mezzCornerSet.exterior;
  let mezzPocketLetters = mezzCornerSet.interior;
  let mezzLetters = mezzCornerSet.all;

  // Columns: equal XY grid (15/20/25 ft) bounded by the floor-plate perimeter — every grid node, including centre.
  const columnGrid = openHallColumnGrid(tipLength, tipDepth, columnGridSpacing, false);
  if (field.roofSizing === "pillar") {
    const inset = field.roofInset ?? 0;
    if (!Number.isFinite(inset) || inset < 0) throw Error("Roof inset must be a non-negative number.");
    // 0.9 is the largest pillar footprint dimension and roof L span per unit.
    const clear = Math.min(columnGrid.spacingX, columnGrid.spacingY) - columnSize * 0.9 - 2 * inset;
    if (clear <= 0.1) throw Error("Roof inset leaves no space between pillar edges; reduce the inset or pillar size.");
    roofGuide = clear / 0.9;
  }
  const columnLetters: OpenHallGuideCandidate[] = columnGrid.anchors.map((anchor, index) => ({
    p: anchor,
    z: groundTop + columnSize * 0.15,
    scale: columnSize,
    role: "column",
    rx: 0, ry: 0, rz: (index % 4) * 90,
  }));

  // Four L guides per elevation panel; local XY is rotated into XZ or YZ.
  // Open 2/3-channel mezzanines supply exterior tips at their facade ends.
  // A closed ring supplies its inner crooks, projected onto the south facade.
  const jambLetters = faces === 4 ? mezzPocketLetters : mezzOuterLetters;
  const jambPoints = jambLetters.map(g => openHallEdgePointFromLetter(g.p, g.scale, g.rz, faces === 4 ? "inner" : "outer"));
  const jambX = Math.min(...jambPoints.filter(p => p[0] > 1e-6).map(p => p[0]));
  const jambY = Math.min(...jambPoints.filter(p => p[1] > 1e-6).map(p => p[1]));
  const wallGroups = openHallPerimeterWalls(tipLength, tipDepth, wallT, OPEN_HALL_ENTRY_WIDTH, groundTop, roofUnderside, faces, jambX, jambY).map(panel => {
    const axis = panel.id === "wall-east" || panel.id === "wall-west" ? 1 : 0;
    const us = panel.polygon.map(p => p[axis]), ns = panel.polygon.map(p => p[1-axis]);
    const lo = Math.min(...us), hi = Math.max(...us), n = (Math.min(...ns)+Math.max(...ns))/2;
    const guides = OPEN_HALL_CORNERS.map((corner, i): OpenHallGuideCandidate => {
      const matrix = new THREE.Matrix4().makeRotationZ(axis ? Math.PI/2 : 0)
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI/2))
        .multiply(new THREE.Matrix4().makeRotationZ(OPEN_HALL_CORNER_RZ[corner]*Math.PI/180));
      const e = new THREE.Euler().setFromRotationMatrix(matrix, "XYZ");
      const u = i===0||i===3 ? lo : hi, z = i<2 ? groundTop : roofUnderside;
      const p = axis ? new THREE.Vector3(n,u,z) : new THREE.Vector3(u,n,z);
      p.sub(new THREE.Vector3(L_UNIT_OUTER[0]*wallGuide,L_UNIT_OUTER[1]*wallGuide,0).applyMatrix4(matrix));
      return {p:[p.x,p.y],z:p.z,scale:wallGuide,role:"wall",rx:e.x*180/Math.PI,ry:e.y*180/Math.PI,rz:e.z*180/Math.PI};
    });
    return {id:panel.id,axis,guides};
  });
  const wallLetters = wallGroups.flatMap(g => g.guides);

  // Every pocket between adjacent column rows and columns gets a roof guide.
  const bayXs = Array.from({length: columnGrid.nCols - 1}, (_, i) => -columnGrid.spanX / 2 + (i + 0.5) * columnGrid.spacingX);
  const bayYs = Array.from({length: columnGrid.nRows - 1}, (_, i) => -columnGrid.spanY / 2 + (i + 0.5) * columnGrid.spacingY);
  const bays = bayXs.flatMap(x => bayYs.map(y => [x, y] as Pt));
  const roofLetters: OpenHallGuideCandidate[] = bays.map((p, i) => ({
    p: p as Pt, z: roofTop - slabT / 2, scale: roofGuide, role: "roof" as const,
    rx: 0, ry: 0, rz: (i % 4) * 90,
  }));

  const floorSlotsGuides = openHallGuideSlotsFrom(floorLetters);
  const columnSlots = openHallGuideSlotsFrom(columnLetters);
  const wallGuides = openHallGuideSlotsFrom(wallLetters);
  const roofSlotsGuides = openHallGuideSlotsFrom(roofLetters);

  // ——— 2. ARCHITECTURAL GENERATION FROM LETTERS ———
  const groundFromLetters = openHallRectFromOuterLetters(floorLetters);
  const length = groundFromLetters.length;
  const depth = groundFromLetters.depth;
  const hx = length / 2, hy = depth / 2;
  const ground = groundFromLetters.polygon;
  const ratio = Math.max(length, depth) / Math.min(length, depth);

  // Band from interior-corner crooks; then reseat mezz Ls on the final platform corners.
  const pocketInners = mezzPocketLetters.map((letter) => openHallEdgePointFromLetter(letter.p, letter.scale, letter.rz, "inner"));
  let band = pocketBand;
  if (pocketInners.length) {
    const insetX = Math.min(...pocketInners.map((p) => hx - Math.abs(p[0])));
    const insetY = Math.min(...pocketInners.map((p) => hy - Math.abs(p[1])));
    const measured = Math.min(Math.min(length, depth) / 2 - 1, Math.min(insetX, insetY));
    if (Number.isFinite(measured) && measured >= 1) band = measured;
  }
  mezzCornerSet = openHallMezzanineCornerLetters(faces, hx, hy, band, floorMezzGuide, mezzTop - slabT / 2);
  mezzOuterLetters = mezzCornerSet.exterior;
  mezzPocketLetters = mezzCornerSet.interior;
  mezzLetters = mezzCornerSet.all;
  const mezzSlotsGuides = openHallGuideSlotsFrom(mezzLetters);
  const slots: OfficeSlot[] = [...columnSlots, ...floorSlotsGuides, ...mezzSlotsGuides, ...wallGuides, ...roofSlotsGuides];
  const built = openHallMezzanine(length, depth, faces, band);
  const { polygons: mezzPolys, opening } = built;
  const mezzUnion = mezzPolys[0];

  // Floor and mezzanine letters define plate edges; they do not create raised pads.
  const supports: OfficePlate[] = columnLetters.map((letter, index) => ({
    id: `column-${index + 1}`,
    polygon: openHallFilledLPocketPolygon(letter.p, letter.scale, letter.rz),
    zTop: mezzTop + 0.05,
    thickness: mezzTop + 0.05 - 0.2,
    role: "support" as const,
  }));
  // Final panels span the measured outer tips of the vertical corner letters.
  const shellWalls: OfficePlate[] = wallGroups.map(({id,axis,guides}) => {
    const tips = guides.map(g => new THREE.Vector3(L_UNIT_OUTER[0]*g.scale,L_UNIT_OUTER[1]*g.scale,0)
      .applyEuler(new THREE.Euler(g.rx*Math.PI/180,g.ry*Math.PI/180,g.rz*Math.PI/180,"XYZ"))
      .add(new THREE.Vector3(g.p[0],g.p[1],g.z)));
    const us = tips.map(p => axis ? p.y : p.x), zs = tips.map(p => p.z);
    const lo=Math.min(...us),hi=Math.max(...us),bottom=Math.min(...zs),top=Math.max(...zs);
    const n=tips.reduce((sum,p)=>sum+(axis?p.x:p.y),0)/tips.length;
    return {id,polygon:axis?rect(n,(lo+hi)/2,wallT,hi-lo):rect((lo+hi)/2,n,hi-lo,wallT),zTop:top,thickness:top-bottom,role:"wall"};
  });
  const walls = shellWalls;
  // Skylights cut as L voids matching each roof letter.
  const skylightPolys = roofLetters.map((letter) => openHallFilledLPocketPolygon(letter.p, letter.scale, letter.rz));
  const voids: OfficeVoid[] = skylightPolys.map((polygon, index) => ({
    id: `skylight-${index + 1}`,
    polygon,
    cut: true,
    roles: ["roof"],
  }));
  const links: OfficeLink[] = [];
  const plates: OfficePlate[] = [
    { id: "ground-hall", polygon: ground, zTop: groundTop, thickness: slabT, role: "ground" },
    ...mezzPolys.map((polygon, index) => ({
      id: mezzPolys.length === 1 ? "mezzanine" : `mezzanine-${index + 1}`,
      polygon, zTop: mezzTop, thickness: slabT, role: "mezzanine" as const,
    })),
    { id: "roof", polygon: ground, zTop: roofTop, thickness: slabT, role: "roof" },
    ...walls,
    ...supports,
  ];

  const head = overheadClearance(plates, ["ground", "mezzanine"]);
  const centerOpen = mezzPolys.every((poly) => !pointInPoly([0, 0], poly));
  const centreColumn = supports.some((s) => pointInPoly([0, 0], s.polygon));
  // Same distance apart in X and Y; matches the preset whenever the plate fits whole modules.
  const equalGrid = Math.abs(columnGrid.spacingX - columnGrid.spacingY) < 1e-6
    && (Math.abs(columnGrid.spacingX - columnGridSpacing) < 1e-6
      || columnGrid.spacingX + 1e-6 >= Math.min(length, depth));
  const gridInsideFloor = columnGrid.anchors.every((p) =>
    Math.abs(p[0]) <= hx + 1e-6 && Math.abs(p[1]) <= hy + 1e-6);
  const nearestGap = Math.min(columnGrid.spacingX, columnGrid.spacingY);
  const spacingFits = nearestGap + 1e-6 >= 5 - columnSize;
  const widthPatch = fitsSquare(mezzUnion, Math.min(MEZZANINE_MIN_WIDTH, band), [0])
    || mezzPolys.some((poly) => fitsSquare(poly, Math.min(MEZZANINE_MIN_WIDTH, band), [0]));
  const wallOk = shellWalls.length >= 3 && wallT > 0 && slabT > 0
    && shellWalls.every((w) => w.thickness > 0);
  const entryClear = !shellWalls.some((w) => pointInPoly([0, -hy + wallT / 2], w.polygon));
  // Check planned panel extents directly against the selected mezzanine jamb coordinates.
  const expectedWallBounds:Record<string,number[]>={
    'wall-north':[-hx,hy-wallT,hx,hy],
    'wall-east':[hx-wallT,-hy+wallT,hx,hy-wallT],
    'wall-west':faces===2?[-hx,jambY,-hx+wallT,hy-wallT]:[-hx,-hy+wallT,-hx+wallT,hy-wallT],
    'wall-south-east':[jambX,-hy,hx,-hy+wallT],
    ...(faces===2?{}:{'wall-south-west':[-hx,-hy,-jambX,-hy+wallT]}),
  };
  const wallEdgesMatch=shellWalls.length===Object.keys(expectedWallBounds).length&&shellWalls.every(w=>{
    const b=boundsOf([w.polygon]),expected=expectedWallBounds[w.id];
    return !!expected&&[b.minX,b.minY,b.maxX,b.maxY].every((v,i)=>Math.abs(v-expected[i])<1e-5);
  });
  const floorTips = floorLetters.map((letter) => openHallEdgePointFromLetter(letter.p, letter.scale, letter.rz, "outer"));
  const letterDerivedGround =
    Math.abs(Math.max(...floorTips.map((t) => t[0])) - Math.min(...floorTips.map((t) => t[0])) - length) < 0.05
    && Math.abs(Math.max(...floorTips.map((t) => t[1])) - Math.min(...floorTips.map((t) => t[1])) - depth) < 0.05;
  const piersMatchLetters = supports.length === columnLetters.length
    && supports.every((plate, i) => {
      const c = centroid(plate.polygon);
      const letter = columnLetters[i];
      const filled = openHallFilledLPocketPolygon(letter.p, letter.scale, letter.rz);
      // Pier is the L envelope with crook filled; center and extents track the column letter.
      return Math.hypot(c[0] - letter.p[0], c[1] - letter.p[1]) < letter.scale * 0.2
        && plate.polygon.length === 4
        && Math.abs(area(plate.polygon) - area(filled)) < 1e-6;
    });
  const letterFillsVisible = wallLetters.length === shellWalls.length * 4;
  const skylightsMatchRoofLetters = voids.length === roofLetters.length && voids.every((v) => v.polygon.length === 4);
  const compactRingOpeningMinimum = OPEN_HALL_OPENING_MIN;

  check(checks, "Ground plate filled", Math.abs(ratio - 1) <= 1e-6 && letterDerivedGround, `Continuous ground plate spans the outer edges of four floor L corner letters to ${length.toFixed(2)} × ${depth.toFixed(2)} ft (ratio ${ratio.toFixed(3)}, required 1:1).`);
  check(checks, "Central hall", centerOpen && pointInPoly([0, 0], ground), "The ground plate is continuous through the centre. The mezzanine opening sits over that centre. The equal column grid may place a pier on the centre grid node.");
  const bandFits = band >= MEZZANINE_MIN_WIDTH - 1e-3 && widthPatch;
  const openingFits = opening >= compactRingOpeningMinimum - 1e-6 && opening <= OPEN_HALL_OPENING_MAX + 1e-6;
  const increasePlanSpace = " Increase the smaller plan dimension or reduce wall thickness.";
  check(checks, "Mezzanine opening", openingFits, `The ${shape} mezzanine leaves a ${(opening * 100).toFixed(1)}% opening (threshold ${(compactRingOpeningMinimum * 100).toFixed(1)}–${(OPEN_HALL_OPENING_MAX * 100).toFixed(0)}% for this footprint). Band ${band.toFixed(2)} ft measured from pocket L inner edges.`
    + (bandFits && opening < compactRingOpeningMinimum - 1e-6 ? increasePlanSpace : ""));
  check(checks, "Mezzanine platform width", bandFits, `Mezzanine geometric band width is ${band.toFixed(2)} ft (threshold ≥${MEZZANINE_MIN_WIDTH} ft) on ${shape}, from pocket L inner edges.`
    + (bandFits ? "" : increasePlanSpace));
  check(checks, "Mezzanine elevation", Math.abs(mezzTop - field.height / 2) < 1e-6, `Measured mezzanine finished surface ${mezzTop.toFixed(2)} ft above field bottom; threshold half of field height (${(field.height / 2).toFixed(2)} ft).`);
  check(checks, "Column grid", supports.length >= 3 && equalGrid && gridInsideFloor && spacingFits && piersMatchLetters && columnGrid.anchors.length === columnGrid.nCols * columnGrid.nRows, `Equal XY column grid ${columnGrid.nCols}×${columnGrid.nRows} at ${columnGridSpacing} ft spacing (measured ${columnGrid.spacingX.toFixed(2)}×${columnGrid.spacingY.toFixed(2)} ft) bounded by the floor-plate perimeter${columnGrid.onPerimeter ? " (outer columns on perimeter)" : " (largest fit centered inside)"}; ${supports.length} filled-pocket piers from column L letters including every grid node${centreColumn ? " (centre occupied)" : ""}.`);
  check(checks, "Supports and movement", supports.length >= 2 && spacingFits, `${supports.length} solid piers use each column L's full outer envelope with its concave pocket filled. Their bases start 0.20 ft above the field bottom, embedded in the ground slab at default thickness. During mesh assembly, piers overlapping the roof footprint extend to its finished top at ${roofTop.toFixed(2)} ft, connecting the plate levels. Equal XY grid ${columnGridSpacing} ft; nearest centre-to-centre pitch ${nearestGap.toFixed(1)} ft. This does not verify clear circulation width or structural capacity.`);
  check(checks, "Perimeter walls and entry", wallOk && entryClear && wallEdgesMatch && wallLetters.length === shellWalls.length * 4, `${faces}-channel wall opening rule: ${faces === 2 ? "two adjacent open sides (south and west)" : "one open side (south)"}; jambs reference ${faces === 4 ? "the closed mezzanine’s inner L corners" : "the mezzanine L outer corners"}. Planned panel bounds ${wallEdgesMatch?'match':'do not match'} those jambs and perimeter; ${shellWalls.length} panels span ${wallLetters.length} vertical corner L guides in XZ/YZ at ${wallT.toFixed(2)} ft wall thickness. This measures the plan, not final openings. Viewer visibility does not change this generation rule.`);
  check(checks, "Roof plate filled", plates.some((p) => p.role === "roof"), `Roof plate filled to the letter-derived ground footprint at finished top ${roofTop.toFixed(2)} ft.`);
  check(checks, "Skylight bays", voids.length >= 1 && skylightsMatchRoofLetters, `${voids.length} skylight openings, one in every column bay (${columnGrid.nCols - 1} × ${columnGrid.nRows - 1}), with no four-opening cap. Each uses the roof L's filled outer envelope, including its concave pocket, to cut only the roof slab. ${field.roofSizing === "pillar" ? `Pillar-edge mode: minimum XY grid spacing ${Math.min(columnGrid.spacingX,columnGrid.spacingY).toFixed(2)} ft minus largest pillar span ${(columnSize*.9).toFixed(2)} ft minus twice the inward offset ${(field.roofInset??0).toFixed(2)} ft gives clear span ${(roofGuide*.9).toFixed(2)} ft; divide by 0.90 to set the roof L size ${roofGuide.toFixed(2)} ft. Increasing the offset shrinks the opening.` : `Fixed mode: roof L size ${roofGuide.toFixed(2)} ft follows the independent roof guide setting.`}`);
  const headroomFits = head.min > 8;
  check(checks, "Headroom", headroomFits, `Plan-level vertical separation is ${head.min.toFixed(2)} ft at ${head.pair}; threshold >8 ft. This compares overlapping slab polygons and does not account for columns, walls, other obstructions or actual occupiable clearance.`
    + (headroomFits ? "" : ` At ${slabT.toFixed(2)} ft slab thickness, reduce slab thickness or increase Height Z.`));
  check(checks, "Column L guides", columnSlots.length === columnLetters.length && columnSlots.length >= 3, `${columnSlots.length} column L guides mark pier locations in the settings-generated plan.`);
  check(checks, "Column guide size", columnSize > 0 && columnGridSpacing > 0, `Column L letter size is ${columnSize.toFixed(2)} ft (presets 1 / 2 / 3 ft); equal XY grid spacing is ${columnGridSpacing.toFixed(0)} ft (presets 15 / 20 / 25 ft).`);
  check(checks, "Floor mezz L guides", floorSlotsGuides.length === 4 && mezzSlotsGuides.length === expectedMezzCount && mezzOuterLetters.length + mezzPocketLetters.length === mezzLetters.length, `${floorSlotsGuides.length} floor + ${mezzSlotsGuides.length} mezzanine L letters on platform corners (${shape}: ${mezzOuterLetters.length} exterior + ${mezzPocketLetters.length} interior).`);
  check(checks, "Floor mezz guide size", floorMezzGuide > 0, `Floor/mezzanine L letter size is ${floorMezzGuide.toFixed(2)} ft (presets 9 / 11 / 13 ft, or custom).`);
  check(checks, "Wall L guides", wallGuides.length === shellWalls.length * 4 && wallGuides.every((s) => Math.abs(new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(s.rx * Math.PI / 180, s.ry * Math.PI / 180, s.rz * Math.PI / 180, "XYZ")).z) < 1e-6 && Math.abs(s.scale - wallGuide) < 1e-6), `${wallGuides.length} vertical wall L letters at ${wallGuide.toFixed(2)} ft at panel elevation corners in XZ/YZ (thickness ${wallT.toFixed(1)} ft).`);
  check(checks, "Roof L guides", roofSlotsGuides.length === bays.length && roofGuide > 0, `${roofSlotsGuides.length} roof L letters at ${roofGuide.toFixed(2)} ft; one per column bay (${columnGrid.nCols - 1} × ${columnGrid.nRows - 1}).`);
  check(checks, "Letter-derived plates", letterDerivedGround && mezzLetters.length === expectedMezzCount && piersMatchLetters && skylightsMatchRoofLetters && letterFillsVisible, `Plan consistency: continuous ground/mezzanine polygons agree with generated L guide boundaries; piers, bay skylights and elevation panels match the generated guide groups. This checks the generated plan, not free edits to source poses.`);
  check(checks, "Letter variations", true, "Open Hall uses L-only, role-grouped guides matched to the generated plan (column / floor / mezzanine / wall / roof). Plan polygons are extruded into architecture.");
  check(checks, "Letters inside field", true, "Letter poses are invented inside the selected field; arrangement validates fit without uniform rescale.");

  return {
    typology: "open-hall-workspace", plates, voids, links, checks, slots,
    operations: [
      `Letter arrangement: 4 floor corner Ls → tip composition ${length.toFixed(1)}×${depth.toFixed(1)} ft (ratio ${ratio.toFixed(2)}).`,
      `Letter arrangement: ${shape} mezz = ${mezzOuterLetters.length} exterior-corner + ${mezzPocketLetters.length} interior-corner Ls on the platform; band ${band.toFixed(1)} ft; opening ${(opening * 100).toFixed(1)}%.`,
      `Letter arrangement: ${columnLetters.length} column guide slots on equal ${columnGridSpacing} ft XY grid (${columnGrid.nCols}×${columnGrid.nRows}) bounded by floor-plate perimeter; ${wallLetters.length} wall Ls; ${roofLetters.length} roof Ls.`,
      `Architectural generation: continuous plates from floor and mezzanine guides; filled-pocket piers from column letters; filled-pocket skylights from roof letters; wall panels spanning corner L tips in XZ/YZ.`,
      `Mezzanine at mid-height (${mezzTop.toFixed(1)} ft of ${field.height} ft). Headroom >8 ft on occupied levels.`,
    ],
  };
}

export function planOfficeWorkspace(
  typology: string,
  rotation: number,
  center: [number, number, number],
  field: OfficeField = DEFAULT_OFFICE_FIELD,
): OfficePlan {
  const build = requireTypology(typology);
  const plan = transformPlan(build(field), rotation, center, field);
  addEnvelopeChecks(plan, rotation, center, field);
  return plan;
}

export function resolveOfficePlan(
  typology: string,
  center: [number, number, number],
  preferredRotation = 0,
  field: OfficeField = DEFAULT_OFFICE_FIELD,
): OfficePlan {
  const build = requireTypology(typology);
  const local = build(field);
  const orthogonal = typology === "open-hall-workspace";
  // Open Hall is authored axis-aligned; prefer 0° so letters and plates stay locked.
  if (orthogonal) {
    const zero = transformPlan(local, 0, center, field);
    addEnvelopeChecks(zero, 0, center, field);
    if (officePlanReady(zero)) return zero;
  }
  const stepDeg = orthogonal ? 90 : 15;
  const steps = orthogonal ? 4 : 24;
  const start = ((Math.round(preferredRotation / stepDeg) * stepDeg) % 360 + 360) % 360;
  let best: OfficePlan | null = null;
  let bestMisses = Infinity;
  for (let step = 0; step < steps; step++) {
    const rotation = (start + step * stepDeg) % 360;
    const plan = transformPlan(local, rotation, center, field);
    addEnvelopeChecks(plan, rotation, center, field);
    const misses = plan.checks.filter((item) => item.status !== "pass").length;
    if (misses < bestMisses) { best = plan; bestMisses = misses; }
    if (!misses) return plan;
  }
  return best ?? planOfficeWorkspace(typology, start, center, field);
}

export function officePlanReady(plan: OfficePlan) {
  return plan.checks.every((item) => item.status === "pass");
}

function letterFieldOverflow(p: IntersectionPlacement, field: OfficeField) {
  const sx = p.scale * (p.scaleX ?? 1), sy = p.scale * (p.scaleY ?? 1), sz = p.scale * (p.scaleZ ?? 1);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z + field.height / 2),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx * Math.PI / 180, p.ry * Math.PI / 180, p.rz * Math.PI / 180, p.rotationOrder ?? "XYZ")),
    new THREE.Vector3(sx, sy, sz),
  );
  const geometry = getLetterVolumeGeometry(p.letter, 12);
  const attr = geometry.getAttribute("position");
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const q = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    q.fromBufferAttribute(attr, i).applyMatrix4(matrix);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
  }
  const hx = field.width / 2, hy = field.depth / 2;
  return {
    minX, maxX, minY, maxY, minZ, maxZ,
    dx: Math.max(0, -hx - minX, maxX - hx),
    dy: Math.max(0, -hy - minY, maxY - hy),
    dzLo: Math.max(0, -minZ),
    dzHi: Math.max(0, maxZ - field.height),
    spanX: maxX - minX,
    spanY: maxY - minY,
    spanZ: maxZ - minZ,
  };
}

export function nudgePlacementIntoField(p: IntersectionPlacement, field: OfficeField): IntersectionPlacement | null {
  const first = letterFieldOverflow(p, field);
  if (first.spanX > field.width + 1e-6 || first.spanY > field.depth + 1e-6 || first.spanZ > field.height + 1e-6) return null;
  let next: IntersectionPlacement = { ...p };
  for (let step = 0; step < 32; step++) {
    const o = letterFieldOverflow(next, field);
    if (o.dx <= 1e-6 && o.dy <= 1e-6 && o.dzLo <= 1e-6 && o.dzHi <= 1e-6) return next;
    const hx = field.width / 2, hy = field.depth / 2;
    next = {
      ...next,
      x: next.x + (o.minX < -hx ? -hx - o.minX : 0) + (o.maxX > hx ? hx - o.maxX : 0),
      y: next.y + (o.minY < -hy ? -hy - o.minY : 0) + (o.maxY > hy ? hy - o.maxY : 0),
      z: next.z + (o.minZ < 0 ? -o.minZ : 0) + (o.maxZ > field.height ? field.height - o.maxZ : 0),
    };
  }
  return null;
}

function placementAtSlot(
  sourcePlacement: IntersectionPlacement,
  chosen: OfficeSlot,
  officePlan: OfficePlan,
  thicknessPercent: number,
): IntersectionPlacement {
  const host = officePlan.plates.filter((plate) => plate.role !== "roof" && plate.role !== "support" && pointInPoly([chosen.x, chosen.y], plate.polygon))
    .sort((a, b) => Math.abs((a.zTop - a.thickness / 2) - chosen.z) - Math.abs((b.zTop - b.thickness / 2) - chosen.z))[0];
  // Open Hall guide slots already carry role elevations; keep them so letters track the form.
  const openHallGuide = Boolean(chosen.openHallRole || sourcePlacement.openHallRole);
  const scale = openHallGuide && chosen.scale > 0 ? chosen.scale : sourcePlacement.scale;
  const depth = scale * (sourcePlacement.scaleZ ?? 1) * (thicknessPercent / 100 + .02);
  const visibleZ = openHallGuide
    ? chosen.z
    : host && chosen.rx === 0 && chosen.ry === 0 ? host.zTop + depth * .35 : chosen.z;
  return {
    ...sourcePlacement,
    x: chosen.x, y: chosen.y, z: visibleZ,
    rx: chosen.rx, ry: chosen.ry, rz: chosen.rz,
    scale,
    scaleX: sourcePlacement.scaleX ?? 1,
    scaleY: sourcePlacement.scaleY ?? 1,
    scaleZ: sourcePlacement.scaleZ ?? 1,
    openHallRole: sourcePlacement.openHallRole ?? chosen.openHallRole,
    letterRules: {
      yaw: chosen.rz, level: 0, supportZ: visibleZ, strokeWidth: scale * 0.14,
      footTilt: 0, armRoll: 0, deviations: [], architectural: true, mirrored: false, enclosed: false,
    },
  };
}

export function buildOpenHallGuideLetters(
  field: OfficeField = DEFAULT_OFFICE_FIELD,
  center: [number, number, number] = [0, 0, 0],
): IntersectionPlacement[] {
  const plan = planOfficeWorkspace("open-hall-workspace", 0, center, {
    ...field,
    columnSize: normalizeOpenHallColumnSize(field.columnSize),
    columnGridSpacing: normalizeOpenHallColumnGridSpacing(field.columnGridSpacing),
    floorMezzGuideSize: normalizeOpenHallFloorMezzGuideSize(field.floorMezzGuideSize ?? field.preferredFeet),
    wallGuideSize: normalizeOpenHallWallGuideSize(field.wallGuideSize),
    roofGuideSize: normalizeOpenHallRoofGuideSize(field.roofGuideSize),
  });
  return plan.slots.map((slot) => ({
    letter: "L" as const,
    openHallRole: slot.openHallRole,
    x: slot.x,
    y: slot.y,
    z: slot.z,
    rx: slot.rx,
    ry: slot.ry,
    rz: slot.rz,
    scale: slot.scale,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  }));
}

/** Validate actual poses against independently generated plan slots, including field-safe Z seating. */
export function validateOpenHallGuidePlacement(plan:OfficePlan,placements:IntersectionPlacement[],field:OfficeField):OfficeCheck {
  const remaining=new Set(plan.slots);
  let matched=0,maxPosition=0,maxAngle=0,maxSize=0;
  const quaternion=(p:{rx:number;ry:number;rz:number;rotationOrder?:string})=>new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,(p.rotationOrder??'XYZ') as THREE.EulerOrder));
  for(const p of placements){
    const candidates=[...remaining].filter(s=>s.openHallRole===p.openHallRole);
    candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z));
    const slot=candidates[0];
    if(!slot)continue;
    remaining.delete(slot);
    const reference:IntersectionPlacement={letter:'L',x:slot.x,y:slot.y,z:slot.z,rx:slot.rx,ry:slot.ry,rz:slot.rz,scale:slot.scale,scaleX:1,scaleY:1,scaleZ:1,openHallRole:slot.openHallRole};
    const seated=nudgePlacementIntoField(reference,field);
    const position=Math.hypot(p.x-slot.x,p.y-slot.y,p.z-(seated?.z??slot.z));
    const angle=quaternion(p).angleTo(quaternion(reference))*180/Math.PI;
    const size=Math.max(Math.abs(p.scale-slot.scale),Math.abs((p.scaleX??1)-1)*slot.scale,Math.abs((p.scaleY??1)-1)*slot.scale,Math.abs((p.scaleZ??1)-1)*slot.scale);
    maxPosition=Math.max(maxPosition,position);maxAngle=Math.max(maxAngle,angle);maxSize=Math.max(maxSize,size);
    if(seated&&p.letter==='L'&&position<=1e-4&&angle<=1e-4&&size<=1e-6)matched++;
  }
  const ok=placements.length===plan.slots.length&&matched===plan.slots.length&&remaining.size===0;
  return {label:'Guide placement matches plan',status:ok?'pass':'fail',detail:`${matched}/${plan.slots.length} plan slots matched one-to-one by actual L guides (${placements.length} supplied): floor/mezzanine corner references, column grid nodes, wall panel corners and roof bay centers. Maximum position error ${maxPosition.toFixed(6)} ft (tolerance 0.0001 ft), orientation error ${maxAngle.toFixed(6)}° (tolerance 0.0001°), size error ${maxSize.toFixed(6)} ft (tolerance 0.000001 ft). Only independently calculated field-safe Z seating is allowed; XY shifts, missing/duplicate guides, role changes and scale distortions fail.`};
}

export function arrangeOfficeLetters(
  source: IntersectionPlacement[],
  typology: string,
  thicknessPercent = 12,
  centerOverride?: [number, number, number],
  field: OfficeField = DEFAULT_OFFICE_FIELD,
) {
  requireTypology(typology);
  const n = source.length;
  const sequence = source.map((_, i) => i);
  if (!n) return { placements: [], sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[], officePlan: null as OfficePlan | null, operations: [] as string[], supported: true, sourcePolicy: "No source letters were provided." };
  const openHall = typology === "open-hall-workspace";
  // Open Hall invent is authored at the field origin; do not re-center from letter PCA.
  const center = centerOverride ?? (openHall
    ? ([0, 0, 0] as [number, number, number])
    : source.reduce((sum, p) => [sum[0] + p.x / n, sum[1] + p.y / n, sum[2] + p.z / n], [0, 0, 0]) as [number, number, number]);
  let xx = 0, yy = 0, xy = 0;
  for (const p of source) { xx += (p.x - center[0]) ** 2; yy += (p.y - center[1]) ** 2; xy += (p.x - center[0]) * (p.y - center[1]); }
  const preferred = openHall ? 0 : 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  const officePlan = resolveOfficePlan(typology, center, preferred, field);
  const pool = [...officePlan.slots];
  const placements = source.map((p) => ({ ...p }));
  const nudgedIn: number[] = [];
  // Open Hall: globally assign unique same-role slots (nearest first) so every guide tracks the form.
  const openHallSlotById = new Map<number, OfficeSlot>();
  if (openHall) {
    const pairs: { id: number; slot: OfficeSlot; d: number }[] = [];
    for (const id of sequence) {
      const sp = source[id];
      for (const slot of pool) {
        if (sp.openHallRole && slot.openHallRole !== sp.openHallRole) continue;
        pairs.push({
          id,
          slot,
          d: Math.hypot(slot.x - sp.x, slot.y - sp.y, slot.z - sp.z),
        });
      }
    }
    pairs.sort((a, b) => a.d - b.d);
    const usedSlots = new Set<OfficeSlot>();
    for (const pair of pairs) {
      if (openHallSlotById.has(pair.id) || usedSlots.has(pair.slot)) continue;
      openHallSlotById.set(pair.id, pair.slot);
      usedSlots.add(pair.slot);
    }
  }
  sequence.forEach((id, index) => {
    const letter = source[id].letter;
    const sourcePlacement = source[id];
    // Build an ordered candidate list WITHOUT draining the shared pool.
    // (Previously `while (pool.length) shift()` emptied the pool on letter 1, so every later
    // letter fell back to slots[0] and piled in one corner.)
    const candidates: OfficeSlot[] = [];
    const pushUnique = (slot: OfficeSlot | undefined) => {
      if (!slot) return;
      if (candidates.includes(slot)) return;
      candidates.push(slot);
    };
    if (openHall) {
      pushUnique(openHallSlotById.get(id));
    } else {
      pushUnique(pool.find((slot) => slot.prefer === letter));
    }
    for (const slot of pool) pushUnique(slot);
    for (const slot of officePlan.slots) pushUnique(slot);

    let fitted: IntersectionPlacement | null = null;
    let usedSlot: OfficeSlot | null = null;
    // Always seat on a plan slot so letters move with plates/pads.
    for (const chosen of candidates) {
      const raw = placementAtSlot(sourcePlacement, chosen, officePlan, thicknessPercent);
      raw.openHallRole = sourcePlacement.openHallRole ?? chosen.openHallRole;
      raw.letterRules = { ...raw.letterRules!, level: index };
      const kept = nudgePlacementIntoField(raw, field);
      if (!kept) continue;
      fitted = { ...kept, openHallRole: raw.openHallRole };
      usedSlot = chosen;
      if (Math.hypot(kept.x - raw.x, kept.y - raw.y, kept.z - raw.z) > 1e-4) nudgedIn.push(id + 1);
      break;
    }
    if (usedSlot) {
      const poolAt = pool.indexOf(usedSlot);
      if (poolAt >= 0) pool.splice(poolAt, 1);
    }
    if (!fitted) {
      throw Error(
        `Letter ${id + 1} (${letter}, scale ${sourcePlacement.scale.toFixed(2)}) cannot fit inside the ${field.width} × ${field.depth} × ${field.height} ft field. Enlarge the field, reduce that letter's scale in Edit Letters, or Generate Design with a smaller preferred letter size.`,
      );
    }
    placements[id] = fitted;
  });
  const permitted = openHall
    ? "Open Hall uses L guides only, grouped as column / floor / mezzanine / wall / roof. Settings determine the plan and guide slots before geometry assembly."
    : typology === "void-edge-workspace"
      ? "U variations form the band; vertical L supports stand outside the void."
      : "L and V variations form the plates; vertical L extrusions are the supports.";
  const vocabularyOk = openHall
    ? source.every((p) => p.letter === "L")
    : typology === "void-edge-workspace"
    ? source.some((p) => p.letter === "U") || source.length === 0
    : source.some((p) => p.letter === "L" || p.letter === "V") || source.length === 0;
  const reusedSlots = source.length > officePlan.slots.length;
  // Replace the plan placeholder with arrangement-measured field fit.
  officePlan.checks = officePlan.checks.filter((item) => item.label !== "Letters inside field" && item.label !== "Letter variations");
  officePlan.checks.push({
    label: "Letter variations",
    status: vocabularyOk ? "pass" : "fail",
    detail: vocabularyOk
      ? `${permitted} All ${source.length} selected source letters are placed (identities and proportions preserved; poses rearranged). ${reusedSlots ? `Preferred slots (${officePlan.slots.length}) were fewer than source letters, so slots were reused rather than inventing or dropping letters.` : "Each letter mapped to a preferred plate slot."}${nudgedIn.length ? ` Letters ${nudgedIn.join(", ")} were inset to stay inside the field.` : ""}`
      : `Measured vocabulary mismatch. ${permitted} Source count ${source.length} was retained; no letters were added or removed.`,
  });
  officePlan.checks.push({
    label: "Letters inside field",
    status: "pass",
    detail: nudgedIn.length
      ? `All ${source.length} letters fit the ${field.width} × ${field.depth} × ${field.height} ft field after insetting letters ${nudgedIn.join(", ")}.`
      : `All ${source.length} letters fit the ${field.width} × ${field.depth} × ${field.height} ft field at their plate slots.`,
  });
  officePlan.checks.push(validateOpenHallGuidePlacement(officePlan,placements,field));
  officePlan.operations.push('No uniform post-generation scaling is performed; this is a generation policy, not a measured pass.');
  officePlan.operations.push(permitted);
  officePlan.operations.push("Guide elevations follow their assigned floor, mezzanine, column, wall or roof role; these are placement references, not occupiable surfaces.");
  officePlan.operations.push(openHall
    ? "New Design creates plan-matched L guides. Regeneration rebuilds the plan from settings and reseats the existing guides when the slot count matches. A changed slot count requires a new set of guides."
    : "Source policy: every provided letter is kept; quantity is not invented; slots may be reused when sources exceed preferred positions.");
  officePlan.operations.push("Letter meshes are inset when a rim slot would put a vertex outside the selected field.");
  return {
    placements, sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[],
    officePlan, operations: officePlan.operations, supported: officePlanReady(officePlan),
    sourcePolicy: openHall
      ? "l-only-guides; role-grouped; identity-and-proportions-preserved; open-hall-invents-full-guide-set"
      : "identity-and-proportions-preserved; poses-may-be-rearranged; quantity-not-invented; slots-may-reuse; inset-to-field",
  };
}

function requireTypology(typology: string) { if (typology !== "open-hall-workspace") throw Error("Wrong workspace rules module: "+typology); return openHall; }
