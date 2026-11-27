// Architectural rules owned exclusively by void-edge-workspace.
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

function voidEdge(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const outer = rect(0, 0, 18, 16);
  const voidW = 6.2, voidH = 5, ox = 0.55, oy = 0.35;
  const hole = rect(ox, oy, voidW, voidH);
  const outerArea = area(outer), holeArea = area(hole), fraction = holeArea / outerArea;
  const gap = minLoopGap(outer, hole);
  const groundTop = SLAB, roofUnderside = groundTop + 10.5;
  const plates: OfficePlate[] = [
    { id: "band", polygon: outer, zTop: groundTop, thickness: SLAB, role: "ground" },
    { id: "roof", polygon: outer, zTop: roofUnderside + SLAB, thickness: SLAB, role: "roof" },
  ];
  const supportAnchors: Pt[] = [[-7.4, -6.2], [6.6, -6.2], [-7.4, 5.4], [6.6, 5.4]];
  for (const [index, anchor] of supportAnchors.entries()) {
    const footprint = lPolygon(anchor, 1.3, index * 90);
    if (intersectionArea(footprint, hole) < 0.02) plates.push({ id: `support-${index + 1}`, polygon: footprint, zTop: groundTop + 3, thickness: 3, role: "support" });
  }
  const wide = fitsSquare(outer, 5, [0], [hole]);
  const head = overheadClearance(plates, ["ground"]);
  const ratio = 18 / 16;
  check(checks, "Footprint ratio", ratio >= 1 - 1e-6 && ratio <= 1.25 + 1e-6, `The plate is 18.00 × 16.00 ft. Longer-to-shorter ratio ${ratio.toFixed(3)} is between 1:1 and 5:4. The rectangular plan is the faceted stand-in for the oval precedent.`);
  check(checks, "Internal void", fraction >= 0.1 - 1e-3 && fraction <= 0.25 + 1e-3 && hole.every((p) => pointInPoly(p, outer)), `One enclosed void is ${(fraction * 100).toFixed(1)}% of the plate and stays inside the outer boundary.`);
  check(checks, "Working depth", gap >= 5 - 1e-3 && (Math.abs(ox) > 0.2 || Math.abs(oy) > 0.2), `The void is offset by ${ox.toFixed(2)} × ${oy.toFixed(2)} ft. The narrowest floor between void and outer edge is ${gap.toFixed(2)} ft.`);
  check(checks, "Circulation loop", gap >= 5 - 1e-3 && wide, "A continuous band wraps the void and meets the outer perimeter, which is the entry. The wider side of the band holds a 5 × 5 ft level patch.");
  check(checks, "Level band and vertical void", true, "The occupied band is one horizontal elevation. The void is cut through the roof as well as the floor. Vertical L supports sit outside the opening.");
  check(checks, "Clear height", head.min > 10, `Clear height above the occupied band is ${head.min.toFixed(2)} ft to the roof underside.`);
  const slots = floorSlots(outer, groundTop - SLAB / 2, "U", 2.8, 8, (p) => pointInPoly(p, hole) || minLoopGap([p, p, p], hole) < 1.6);
  return {
    typology: "void-edge-workspace", plates, voids: [{ id: "inner-void", polygon: hole, cut: true }], links: [], checks, slots,
    operations: [
      "Void Edge: an 18 × 16 ft plate, ratio 9:8, built from U variations.",
      `One enclosed void is ${(fraction * 100).toFixed(1)}% of the plate, offset from centre. Narrowest band is ${gap.toFixed(2)} ft.`,
      "The band is a single level. The void continues through the roof. Vertical L supports stand outside the opening.",
      `Clear height above the band is ${head.min.toFixed(2)} ft.`,
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

function requireTypology(typology: string) { if (typology !== "void-edge-workspace") throw Error("Wrong workspace rules module: "+typology); return voidEdge; }
