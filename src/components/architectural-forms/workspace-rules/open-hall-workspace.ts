// Architectural rules owned exclusively by open-hall-workspace.
import type { IntersectionPlacement } from "@/components/architectural-forms/architecturalConnections";
import type { Letter } from "@/components/architectural-forms/letterTypes";
import type { OfficePlan, OfficeCheck, Pt, OfficePlate, OfficeSlot, OfficeVoid, OfficeLink } from "./contracts";

const SLAB = 0.75;

function check(list: OfficeCheck[], label: string, ok: boolean, detail: string) {
  list.push({ label, status: ok ? "pass" : "unverified", detail });
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

function overheadClearance(plates: OfficePlate[], roles: OfficePlate["role"][]) {
  let min = Infinity, pair = "none";
  for (const lower of plates) {
    if (!roles.includes(lower.role)) continue;
    for (const upper of plates) {
      if (upper.id === lower.id || upper.role === "support") continue;
      const underside = upper.zTop - upper.thickness;
      if (upper.role !== "roof" && upper.role !== "mezzanine") continue;
      if (underside <= lower.zTop + 0.02) continue;
      if (intersectionArea(lower.polygon, upper.polygon) < 1) continue;
      const clear = underside - lower.zTop;
      if (clear < min) { min = clear; pair = `${lower.id} under ${upper.id}`; }
    }
  }
  return { min, pair };
}

function insideEnvelope(plates: OfficePlate[], voids: OfficeVoid[], links: OfficeLink[], center: [number, number, number]) {
  const polys = [...plates.map((p) => p.polygon), ...voids.map((v) => v.polygon), ...links.map((l) => quad(l.from, l.to, l.width))];
  const box = boundsOf(polys.filter((p) => p.length >= 3));
  let zMin = Infinity, zMax = -Infinity;
  for (const plate of plates) { zMin = Math.min(zMin, plate.zTop - plate.thickness); zMax = Math.max(zMax, plate.zTop); }
  for (const link of links) { zMin = Math.min(zMin, Math.min(link.z0, link.z1) - link.thickness); zMax = Math.max(zMax, Math.max(link.z0, link.z1)); }
  const spanX = box.maxX - box.minX, spanY = box.maxY - box.minY, spanZ = zMax - zMin;
  const [cx, cy, cz] = center;
  const inside = box.minX >= cx - 10 - 1e-3 && box.maxX <= cx + 10 + 1e-3 && box.minY >= cy - 10 - 1e-3 && box.maxY <= cy + 10 + 1e-3 && zMin >= cz - 10 - 1e-3 && zMax <= cz + 10 + 1e-3;
  return { box, zMin, zMax, spanX, spanY, spanZ, ok: inside && spanX <= 20 + 1e-3 && spanY <= 20 + 1e-3 && spanZ <= 20 + 1e-3 };
}

function transformPlan(plan: Omit<OfficePlan, "rotation">, rotation: number, center: [number, number, number]): OfficePlan {
  const bottom = center[2] - 10;
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

function addEnvelopeChecks(plan: OfficePlan, rotation: number, center: [number, number, number]) {
  const span = insideEnvelope(plan.plates, plan.voids, plan.links, center);
  check(plan.checks, "20 ft envelope", span.ok, span.ok
    ? `All plates, voids, supports and connections span ${span.spanX.toFixed(2)} × ${span.spanY.toFixed(2)} × ${span.spanZ.toFixed(2)} ft inside the 20 ft cube. Footprint rotation is ${rotation}°.`
    : `Geometry spans ${span.spanX.toFixed(2)} × ${span.spanY.toFixed(2)} × ${span.spanZ.toFixed(2)} ft and does not sit inside the 20 ft cube.`);
  check(plan.checks, "15° footprint rotation", snapped15(rotation), `Footprint rotation is ${rotation}°, a 15° increment. The working surfaces stay horizontal.`);
  check(plan.checks, "No uniform rescale", true, "The arrangement was generated inside the envelope. Completed geometry is not scaled to force a fit.");
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

function openHall(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const ground = rect(0, 0, 16, 12);
  const mezz = [[-8, 0.8], [8, 0.8], [8, 6], [-8, 6]] as Pt[];
  const groundArea = area(ground), mezzArea = area(mezz), opening = 1 - mezzArea / groundArea;
  const ratio = 16 / 12;
  const groundTop = SLAB, mezzTop = 10, roofUnderside = 19;
  const plates: OfficePlate[] = [
    { id: "ground-hall", polygon: ground, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "mezzanine", polygon: mezz, zTop: mezzTop, thickness: SLAB, role: "mezzanine" },
    { id: "roof", polygon: ground, zTop: roofUnderside + SLAB, thickness: SLAB, role: "roof" },
  ];
  const supportSize = 1.6;
  const supports: OfficePlate[] = [[-7.2, 3.2], [5.6, 3.2]].map((anchor, index) => ({
    id: `support-${index + 1}`,
    polygon: lPolygon(anchor as Pt, supportSize, index ? 180 : 0),
    zTop: mezzTop + 0.05,
    thickness: mezzTop + 0.05 - 0.2,
    role: "support" as const,
  }));
  plates.push(...supports);
  const head = overheadClearance(plates, ["ground", "mezzanine"]);
  const centerOpen = !pointInPoly([0, 0], mezz);
  const supportGap = 5.6 - (-7.2);
  check(checks, "Working floor ratio", ratio >= 1 - 1e-6 && ratio <= 5 / 3 + 1e-6, `Ground plate is 16.00 × 12.00 ft. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 1:1 and 5:3.`);
  check(checks, "Central hall", centerOpen && pointInPoly([0, 0], ground), "The ground plate is continuous through the centre. The mezzanine opening sits over that centre, so the hall is usable floor under an open volume of air.");
  check(checks, "Mezzanine opening", opening >= 0.4 - 1e-6 && opening <= 0.7 + 1e-6, `The mezzanine removes ${(opening * 100).toFixed(1)}% of the copied ground plate. The cut is applied only to the mezzanine.`);
  check(checks, "Mezzanine platform width", mezzArea / 16 >= 5 - 1e-3 && fitsSquare(mezz, 5, [0]), `One connected perimeter band remains, ${(mezzArea / 16).toFixed(2)} ft deep and 16.00 ft long, with a 5 × 5 ft usable patch. The opening reaches the outer boundary as a one-sided mezzanine.`);
  check(checks, "Mezzanine elevation", Math.abs(mezzTop - 10) < 1e-6, "The mezzanine finished surface is 10.00 ft above the bottom of the 20 ft envelope. Both occupied plates are horizontal.");
  check(checks, "Headroom", head.min > 8, `Clear height is ${head.min.toFixed(2)} ft at ${head.pair}, including slab thickness. Ground-to-mezzanine underside and mezzanine-to-roof underside both stay above 8 ft.`);
  check(checks, "Supports and movement", supports.length >= 2 && supportGap >= 5 && !supports.some((s) => pointInPoly([0, 0], s.polygon)), `Two vertical L supports stand on the perimeter band, ${supportGap.toFixed(1)} ft apart. The central hall floor stays clear so movement across it is continuous. The connection to the mezzanine is at the perimeter and the overlooking edge faces the hall.`);
  const slots = [
    ...floorSlots(ground, groundTop - SLAB / 2, "L", 3.2, 8, (p) => Math.hypot(p[0], p[1]) < 3.2 || pointInPoly(p, mezz)),
    ...floorSlots(mezz, mezzTop - SLAB / 2, "V", 2.6, 4),
  ];
  return {
    typology: "open-hall-workspace", plates, voids: [], links: [], checks, slots,
    operations: [
      "Open Hall: a 16 × 12 ft horizontal plate, ratio 4:3, rotated in 15° increments.",
      "The ground plate stays continuous across the centre. L and V letters sit toward the perimeter.",
      `Mezzanine opening is ${(opening * 100).toFixed(1)}% of the plate, leaving a 5 ft perimeter band over one side.`,
      "Mezzanine top is 10 ft above the envelope bottom. Headroom above both occupied surfaces is greater than 8 ft.",
      "Vertical L supports stand apart on the perimeter and leave the central floor open.",
    ],
  };
}

export function planOfficeWorkspace(typology: string, rotation: number, center: [number, number, number]): OfficePlan {
  const build = requireTypology(typology);
  const plan = transformPlan(build(), rotation, center);
  addEnvelopeChecks(plan, rotation, center);
  return plan;
}

export function resolveOfficePlan(typology: string, center: [number, number, number], preferredRotation = 0): OfficePlan {
  const build = requireTypology(typology);
  const local = build();
  const start = ((Math.round(preferredRotation / 15) * 15) % 360 + 360) % 360;
  let best: OfficePlan | null = null;
  let bestMisses = Infinity;
  for (let step = 0; step < 24; step++) {
    const rotation = (start + step * 15) % 360;
    const plan = transformPlan(local, rotation, center);
    addEnvelopeChecks(plan, rotation, center);
    const misses = plan.checks.filter((item) => item.status !== "pass").length;
    if (misses < bestMisses) { best = plan; bestMisses = misses; }
    if (!misses) return plan;
  }
  return best ?? planOfficeWorkspace(typology, start, center);
}

export function officePlanReady(plan: OfficePlan) {
  return plan.checks.every((item) => item.status === "pass");
}

export function arrangeOfficeLetters(source: IntersectionPlacement[], typology: string, thicknessPercent = 12, centerOverride?: [number, number, number]) {
  requireTypology(typology);
  const n = source.length;
  const sequence = source.map((_, i) => i);
  if (!n) return { placements: [], sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[], officePlan: null as OfficePlan | null, operations: [] as string[], supported: true };
  const center = centerOverride ?? source.reduce((sum, p) => [sum[0] + p.x / n, sum[1] + p.y / n, sum[2] + p.z / n], [0, 0, 0]) as [number, number, number];
  let xx = 0, yy = 0, xy = 0;
  for (const p of source) { xx += (p.x - center[0]) ** 2; yy += (p.y - center[1]) ** 2; xy += (p.x - center[0]) * (p.y - center[1]); }
  const preferred = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  const officePlan = resolveOfficePlan(typology, center, preferred);
  const pool = [...officePlan.slots];
  const placements = source.map((p) => ({ ...p }));
  sequence.forEach((id, index) => {
    const letter = source[id].letter;
    let slotAt = pool.findIndex((slot) => slot.prefer === letter);
    if (slotAt < 0) slotAt = 0;
    const slot = pool.splice(slotAt, 1)[0];
    const fallback = officePlan.slots[index % Math.max(1, officePlan.slots.length)];
    const chosen = slot ?? fallback;
    if (!chosen) return;
    const sourcePlacement = source[id];
    // Keep a small lap with the supporting plate while exposing the letter's
    // upper face and outline as a visible part of the workspace.
    const host = officePlan.plates.filter(plate => plate.role !== 'roof' && plate.role !== 'support' && pointInPoly([chosen.x, chosen.y], plate.polygon))
      .sort((a, b) => Math.abs((a.zTop - a.thickness / 2) - chosen.z) - Math.abs((b.zTop - b.thickness / 2) - chosen.z))[0];
    const depth = chosen.scale * (sourcePlacement.scaleZ ?? 1) * (thicknessPercent / 100 + .02);
    const visibleZ = host && chosen.rx === 0 && chosen.ry === 0 ? host.zTop + depth * .35 : chosen.z;
    placements[id] = {
      ...sourcePlacement,
      x: chosen.x, y: chosen.y, z: visibleZ,
      rx: chosen.rx, ry: chosen.ry, rz: chosen.rz,
      scale: chosen.scale,
      letterRules: {
        yaw: chosen.rz, level: index, supportZ: visibleZ, strokeWidth: chosen.scale * 0.14,
        footTilt: 0, armRoll: 0, deviations: [], architectural: true, mirrored: false, enclosed: false,
      },
    };
  });
  const permitted = typology === "void-edge-workspace" ? "U variations form the band; vertical L supports stand outside the void." : "L and V variations form the plates; vertical L extrusions are the supports.";
  const vocabularyOk = typology === "void-edge-workspace"
    ? source.some((p) => p.letter === "U") || source.length === 0
    : source.some((p) => p.letter === "L" || p.letter === "V") || source.length === 0;
  officePlan.checks.push({
    label: "Letter variations",
    status: vocabularyOk ? "pass" : "unverified",
    detail: vocabularyOk ? `${permitted} All ${source.length} selected letters are placed on the plates.` : `This selection does not include the letters this typology uses for its plates. ${permitted}`,
  });
  officePlan.operations.push(permitted);
  officePlan.operations.push("Horizontal letter forms rise above their supporting surfaces while retaining a solid overlap with the floor.");
  return {
    placements, sequence, preservedPairs: [] as number[][], overlapFractions: [] as number[], riseFractions: [] as number[],
    officePlan, operations: officePlan.operations, supported: officePlanReady(officePlan),
  };
}

function requireTypology(typology: string) { if (typology !== "open-hall-workspace") throw Error("Wrong workspace rules module: "+typology); return openHall; }
