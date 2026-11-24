// Architectural rules owned exclusively by flat-deep-plan-plate.
import * as THREE from "three";
import type { IntersectionPlacement } from "../architecturalConnections";
import { getLetterVolumeGeometry } from "../letterGeometry3d";

import type { OfficeField, OfficePlan, OfficeCheck, Pt, OfficePlate, OfficeSlot, OfficeVoid, OfficeLink } from "./contracts";

export const DEFAULT_OFFICE_FIELD: OfficeField = { width: 20, depth: 20, height: 20 };

const SLAB = 0.75;

function roofTopForField(field: OfficeField, thickness = SLAB) {
  return field.height - 0.05;
}

function usablePlan(field: OfficeField, margin = 2) {
  return {
    maxW: Math.max(4, field.width - margin * 2),
    maxD: Math.max(4, field.depth - margin * 2),
  };
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

function lPolygon(anchor: Pt, size: number, deg: number): Pt[] {
  const raw: Pt[] = [[0, 0], [size, 0], [size, size * 0.38], [size * 0.38, size * 0.38], [size * 0.38, size], [0, size]];
  return raw.map((p) => {
    const turned = rotateLocal(p, deg);
    return [anchor[0] + turned[0], anchor[1] + turned[1]];
  });
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
  check(plan.checks, "No uniform rescale", true, "The arrangement was generated inside the selected field. Completed geometry is not scaled to force a fit.");
}

function flatDeep(field: OfficeField = DEFAULT_OFFICE_FIELD): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const { maxW, maxD } = usablePlan(field);
  // Long axis follows the longer field side; keep longer-to-shorter in 3:2–5:2.
  const alongX = maxW >= maxD;
  let longSide = Math.max(maxW, maxD);
  const shortSide = Math.min(maxW, maxD);
  if (longSide / shortSide > 2.5) longSide = shortSide * 2.5;
  if (longSide / shortSide < 1.5) longSide = Math.min(Math.max(maxW, maxD), shortSide * 2);
  const length = alongX ? longSide : shortSide;
  const depth = alongX ? shortSide : longSide;
  const ratio = Math.max(length, depth) / Math.min(length, depth);
  const ground = rect(0, 0, length, depth);
  const stripWidth = Math.min(Math.max(5, Math.min(length, depth) * 0.55), Math.min(length, depth) - 0.5);
  const strip = alongX
    ? rect(0, 0, length, stripWidth)
    : rect(0, 0, stripWidth, depth);
  const groundTop = SLAB;
  const roofTop = roofTopForField(field);
  const plates: OfficePlate[] = [
    { id: "deep-plate", polygon: ground, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "roof", polygon: ground, zTop: roofTop, thickness: SLAB, role: "roof" },
  ];
  const supportSize = Math.min(1.4, Math.min(length, depth) * 0.12);
  const longHalf = Math.max(length, depth) / 2;
  const shortHalf = Math.min(length, depth) / 2;
  const edge = shortHalf - supportSize * 0.55;
  const supportAlong = [-longHalf * 0.72, -longHalf * 0.24, longHalf * 0.24, longHalf * 0.72];
  const supportCross = [edge, -edge];
  const supports: OfficePlate[] = [];
  supportCross.forEach((cross, side) => supportAlong.forEach((along, index) => {
    const x = alongX ? along : cross;
    const y = alongX ? cross : along;
    supports.push({
      id: `support-${side}-${index}`,
      polygon: lPolygon([x, y], supportSize, side ? 180 : 0),
      zTop: groundTop + 3.2,
      thickness: 3.2,
      role: "support",
    });
  }));
  plates.push(...supports);
  const gaps: number[] = [];
  for (let i = 1; i < supportAlong.length; i++) gaps.push(Math.abs(supportAlong[i] - supportAlong[i - 1]) - supportSize);
  const head = overheadClearance(plates, ["ground"]);
  const stripTouchesEnds = alongX
    ? strip.some((p) => Math.abs(Math.abs(p[0]) - length / 2) < 1e-6)
    : strip.some((p) => Math.abs(Math.abs(p[1]) - depth / 2) < 1e-6);
  const supportsOutside = supports.every((s) => intersectionArea(s.polygon, strip) < 0.05);
  check(checks, "Working plate ratio", ratio >= 1.5 - 1e-6 && ratio <= 2.5 + 1e-6, `The plate is ${length.toFixed(2)} × ${depth.toFixed(2)} ft inside the ${field.width} × ${field.depth} × ${field.height} ft field. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 3:2 and 5:2.`);
  check(checks, "Longitudinal strip", stripWidth >= 5 - 1e-3 && stripTouchesEnds && supportsOutside, `A ${stripWidth.toFixed(2)} ft strip runs the full ${Math.max(length, depth).toFixed(2)} ft length and joins both short ends. Supports stay outside that strip.`);
  check(checks, "Single working level", plates.filter((p) => p.role === "ground").length === 1, "The whole working plate shares one finished elevation. The longitudinal strip is part of that continuous surface.");
  check(checks, "Daylight edges", gaps.every((gap) => gap >= 2) && supportCross.length === 2, `Vertical L supports repeat along both long sides. Openings between supports are ${gaps.map((gap) => gap.toFixed(2)).join(", ")} ft, so the interior stays connected to both long edges.`);
  check(checks, "Clear height", head.min > 10, `Clear headroom above the working surface is ${head.min.toFixed(2)} ft to the roof underside, including slab thickness.`);
  check(checks, "One-level tile", true, "This tile is a single working level. Repetition can build a later multistorey arrangement without interrupting the plate.");
  const slots: OfficeSlot[] = [];
  const slotCross = shortHalf - supportSize * 0.35;
  const slotAlong = [-longHalf * 0.65, -longHalf * 0.22, longHalf * 0.22, longHalf * 0.65];
  for (const cross of [slotCross, -slotCross]) for (const along of slotAlong) {
    slots.push({
      x: alongX ? along : cross, y: alongX ? cross : along,
      z: groundTop - SLAB / 2, rx: 0, ry: 0, rz: 0, scale: Math.min(2, shortHalf * 0.2), prefer: "L",
    });
  }
  return {
    typology: "flat-deep-plan-plate", plates, voids: [], links: [], checks, slots,
    operations: [
      `Flat-Deep Plan Plate: one ${length.toFixed(1)} × ${depth.toFixed(1)} ft horizontal plate (ratio ${ratio.toFixed(2)}) sized to the ${field.width} × ${field.depth} × ${field.height} ft field.`,
      `A ${stripWidth.toFixed(2)} ft longitudinal strip joins the two short ends. Supports and enclosed letters stay outside it.`,
      "Vertical L supports repeat along both long sides with openings between them.",
      `Clear height above the working surface is ${head.min.toFixed(2)} ft. The tile is one level.`,
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
  const openHallGuide = false;
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
    openHallRole: undefined,
    letterRules: {
      yaw: chosen.rz, level: 0, supportZ: visibleZ, strokeWidth: scale * 0.14,
      footTilt: 0, armRoll: 0, deviations: [], architectural: true, mirrored: false, enclosed: false,
    },
  };
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
  const isOpenHall = typology === "open-hall-workspace";
  // Open Hall invent is authored at the field origin; do not re-center from letter PCA.
  const center = centerOverride ?? (isOpenHall
    ? ([0, 0, 0] as [number, number, number])
    : source.reduce((sum, p) => [sum[0] + p.x / n, sum[1] + p.y / n, sum[2] + p.z / n], [0, 0, 0]) as [number, number, number]);
  let xx = 0, yy = 0, xy = 0;
  for (const p of source) { xx += (p.x - center[0]) ** 2; yy += (p.y - center[1]) ** 2; xy += (p.x - center[0]) * (p.y - center[1]); }
  const preferred = isOpenHall ? 0 : 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  const officePlan = resolveOfficePlan(typology, center, preferred, field);
  const pool = [...officePlan.slots];
  const placements = source.map((p) => ({ ...p }));
  const nudgedIn: number[] = [];
  // Open Hall: globally assign unique same-role slots (nearest first) so every guide tracks the form.
  const openHallSlotById = new Map<number, OfficeSlot>();
  if (isOpenHall) {
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
    if (isOpenHall) {
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
      raw.openHallRole = undefined;
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
  const permitted = isOpenHall
    ? "Open Hall uses L guides only, grouped as column / floor / mezzanine / wall / roof. Filled layers follow the guide groups."
    : typology === "void-edge-workspace"
      ? "U variations form the band; vertical L supports stand outside the void."
      : "L and V variations form the plates; vertical L extrusions are the supports.";
  const vocabularyOk = isOpenHall
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
  officePlan.operations.push(permitted);
  officePlan.operations.push("Horizontal letter forms rise above their supporting surfaces while retaining a solid overlap with the floor.");
  officePlan.operations.push(isOpenHall
    ? "Source policy: Open Hall invents the full role-grouped L guide set on Generate Design; Regenerate keeps those guides and rebuilds filled layers."
    : "Source policy: every provided letter is kept; quantity is not invented; slots may be reused when sources exceed preferred positions.");
  officePlan.operations.push("Letter meshes are inset when a rim slot would put a vertex outside the selected field.");
  return {
    placements, sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[],
    officePlan, operations: officePlan.operations, supported: officePlanReady(officePlan),
    sourcePolicy: isOpenHall
      ? "l-only-guides; role-grouped; identity-and-proportions-preserved; open-hall-invents-full-guide-set"
      : "identity-and-proportions-preserved; poses-may-be-rearranged; quantity-not-invented; slots-may-reuse; inset-to-field",
  };
}

function requireTypology(typology: string) { if (typology !== "flat-deep-plan-plate") throw Error("Wrong workspace rules module: "+typology); return flatDeep; }
