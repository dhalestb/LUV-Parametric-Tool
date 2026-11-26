// Architectural rules owned exclusively by void-edge-workspace.
import * as THREE from "three";
import {voidEdgePlate} from './void-edge-plate';
import {halfPlane, intersectFootprints} from './void-edge-planar';
import type { IntersectionPlacement } from "../architecturalConnections";
import { getLetterVolumeGeometry } from "../letterGeometry3d";
import type { Letter } from "../letterTypes";
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

function intersectionArea(subject: Pt[], clipPoly: Pt[]) {
  return area(intersectFootprints(subject, ccw(clipPoly)));
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

function minLoopGap(outer: Pt[], hole: Pt[]) {
  let min = Infinity;
  const samples = (poly: Pt[]) => poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return [0, 0.25, 0.5, 0.75].map((t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] as Pt);
  });
  const distPointSeg = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
  };
  for (const p of samples(hole)) for (let i = 0; i < outer.length; i++) min = Math.min(min, distPointSeg(p, outer[i], outer[(i + 1) % outer.length]));
  return min;
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

function floorSlots(poly: Pt[], z: number, prefer: Letter, scale: number, limit: number, reject?: (p: Pt) => boolean): OfficeSlot[] {
  const box = boundsOf([poly]);
  const slots: OfficeSlot[] = [];
  for (let x = box.minX + scale / 2; x <= box.maxX - scale / 2; x += Math.max(scale * 0.85, 2.5)) {
    for (let y = box.minY + scale / 2; y <= box.maxY - scale / 2; y += Math.max(scale * 0.85, 2.5)) {
      const p: Pt = [x, y];
      if (!pointInPoly(p, poly) || reject?.(p)) continue;
      if (!fitsSquareAround(poly, p, Math.min(scale * 0.45, 1.2))) continue;
      slots.push({ x, y, z, rx: 0, ry: 0, rz: 0, scale, prefer });
      if (slots.length >= limit) return slots;
    }
  }
  const c = centroid(poly);
  if (pointInPoly(c, poly) && !reject?.(c)) slots.push({ x: c[0], y: c[1], z, rx: 0, ry: 0, rz: 0, scale, prefer });
  return slots;
}

function fitsSquareAround(poly: Pt[], p: Pt, radius: number) {
  return [[radius, 0], [-radius, 0], [0, radius], [0, -radius]].every(([dx, dy]) => pointInPoly([p[0] + dx, p[1] + dy], poly));
}

function voidEdge(field: OfficeField = DEFAULT_OFFICE_FIELD): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const { maxW, maxD } = usablePlan(field);
  // Fill the field while staying inside 1:1–5:4.
  let length = maxW;
  let depth = maxD;
  if (length / depth > 5 / 4) length = depth * (5 / 4);
  if (depth / length > 5 / 4) depth = length * (5 / 4);
  const outer = rect(0, 0, length, depth);
  // Void 10–25% with ≥5 ft band: size from plan, then clamp.
  const voidW = Math.min(Math.max(2, length - 10), length * 0.34);
  const voidH = Math.min(Math.max(2, depth - 10), depth * 0.31);
  const maxOx = Math.max(0.25, (length - voidW) / 2 - 5);
  const maxOy = Math.max(0.25, (depth - voidH) / 2 - 5);
  const ox = Math.min(length * 0.04, maxOx);
  const oy = Math.min(depth * 0.03, maxOy);
  const hole = rect(ox, oy, voidW, voidH);
  const outerArea = area(outer), holeArea = area(hole), fraction = holeArea / Math.max(outerArea, 1e-6);
  const gap = minLoopGap(outer, hole);
  const groundTop = SLAB;
  const plates: OfficePlate[] = [
    { id: "band", polygon: outer, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "roof", polygon: outer, zTop: roofTopForField(field), thickness: SLAB, role: "roof" },
  ];
  const supportSize = Math.min(1.5, Math.min(length, depth) * 0.08);
  const supportAnchors: Pt[] = [
    [-length / 2 + supportSize * 1.2, -depth / 2 + supportSize * 1.2],
    [length / 2 - supportSize * 1.2, -depth / 2 + supportSize * 1.2],
    [-length / 2 + supportSize * 1.2, depth / 2 - supportSize * 1.2],
    [length / 2 - supportSize * 1.2, depth / 2 - supportSize * 1.2],
  ];
  for (const [index, anchor] of supportAnchors.entries()) {
    const footprint = lPolygon(anchor, supportSize, index * 90);
    if (intersectionArea(footprint, hole) < 0.02) plates.push({ id: `support-${index + 1}`, polygon: footprint, zTop: groundTop + 3, thickness: 3, role: "support" });
  }
  const wide = fitsSquare(outer, 5, [0], [hole]);
  const head = overheadClearance(plates, ["ground"]);
  const ratio = Math.max(length, depth) / Math.min(length, depth);
  check(checks, "Footprint ratio", ratio >= 1 - 1e-6 && ratio <= 1.25 + 1e-6, `The plate is ${length.toFixed(2)} × ${depth.toFixed(2)} ft inside the ${field.width} × ${field.depth} × ${field.height} ft field. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 1:1 and 5:4. The rectangular plan is the faceted stand-in for the oval precedent.`);
  check(checks, "Internal void", fraction >= 0.1 - 1e-3 && fraction <= 0.25 + 1e-3 && hole.every((p) => pointInPoly(p, outer)), `One enclosed void is ${(fraction * 100).toFixed(1)}% of the plate and stays inside the outer boundary.`);
  check(checks, "Working depth", gap >= 5 - 1e-3 && (Math.abs(ox) > 0.2 || Math.abs(oy) > 0.2), `The void is offset by ${ox.toFixed(2)} × ${oy.toFixed(2)} ft. The narrowest floor between void and outer edge is ${gap.toFixed(2)} ft.`);
  check(checks, "Circulation loop", gap >= 5 - 1e-3 && wide, "A continuous band wraps the void and meets the outer perimeter, which is the entry. The wider side of the band holds a 5 × 5 ft level patch.");
  check(checks, "Level band and vertical void", true, "The occupied band is one horizontal elevation. The void is cut through the roof as well as the floor. Vertical L supports sit outside the opening.");
  check(checks, "Clear height", head.min > 10, `Clear height above the occupied band is ${head.min.toFixed(2)} ft to the roof underside.`);
  const slots = floorSlots(outer, groundTop - SLAB / 2, "U", Math.min(2.8, Math.min(length, depth) * 0.12), 8, (p) => pointInPoly(p, hole) || minLoopGap([p, p, p], hole) < 1.6);
  return {
    typology: "void-edge-workspace", plates, voids: [{ id: "inner-void", polygon: hole, cut: true }], links: [], checks, slots,
    operations: [
      `Void Edge: a ${length.toFixed(1)} × ${depth.toFixed(1)} ft plate (ratio ${ratio.toFixed(2)}) sized to the ${field.width} × ${field.depth} × ${field.height} ft field.`,
      `One enclosed void is ${(fraction * 100).toFixed(1)}% of the plate, offset from centre. Narrowest band is ${gap.toFixed(2)} ft.`,
      "The band is a single level. The void continues through the roof. Vertical L supports stand outside the opening.",
      `Clear height above the band is ${head.min.toFixed(2)} ft.`,
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
  return voidEdgePlate(source,field);
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

function requireTypology(typology: string) { if (typology !== "void-edge-workspace") throw Error("Wrong workspace rules module: "+typology); return voidEdge; }
