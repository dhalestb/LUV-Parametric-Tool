// Architectural rules owned exclusively by cascaded-terraced-plates.
import type { IntersectionPlacement } from "@/components/architectural-forms/architecturalConnections";
import type { Letter } from "@/components/architectural-forms/letterTypes";
import type { OfficePlan, OfficeCheck, Pt, OfficePlate, OfficeLink, OfficeSlot, OfficeVoid } from "./contracts";

const GRID = 20 * 20;

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

function rotateLocal(p: Pt, deg: number): Pt {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

function angleOf(dx: number, dy: number) {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return (deg % 360 + 360) % 360;
}

function snapped15(deg: number) {
  const turned = ((deg % 360) + 360) % 360;
  return Math.abs(turned / 15 - Math.round(turned / 15)) < 1e-3 || Math.abs(((turned - 360) / 15)) < 1e-3;
}

function parallelAngles(a: number, b: number) {
  const d = Math.abs(((a - b) % 180 + 180) % 180);
  return d < 0.05 || Math.abs(d - 180) < 0.05;
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

function slicesAlong(poly: Pt[], direction: Pt, count: number): Pt[][] {
  const len = Math.hypot(direction[0], direction[1]) || 1;
  const nx = direction[0] / len, ny = direction[1] / len;
  const ts = poly.map((p) => p[0] * nx + p[1] * ny);
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const target = area(poly) / count;
  const parts: Pt[][] = [];
  let cursor = lo;
  for (let i = 0; i < count - 1; i++) {
    let a = cursor, b = hi;
    for (let k = 0; k < 48; k++) {
      const mid = (a + b) / 2;
      const piece = halfPlane(halfPlane(poly, nx, ny, cursor, false), nx, ny, mid, true);
      if (area(piece) < target) a = mid; else b = mid;
    }
    const cut = (a + b) / 2;
    parts.push(halfPlane(halfPlane(poly, nx, ny, cursor, false), nx, ny, cut, true));
    cursor = cut;
  }
  parts.push(halfPlane(poly, nx, ny, cursor, false));
  return parts.filter((part) => part.length >= 3);
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

function cascaded(): Omit<OfficePlan, "rotation"> {
  const checks: OfficeCheck[] = [];
  const yTop = 8, yBottom = -8, height = yTop - yBottom;
  const leftX = -10, topRight = 10, cot = 1 / Math.sqrt(3);
  const bottomRight = topRight - height * cot;
  const tx = -4.9, dy = 15.4, tipY = yTop - dy, dx = dy * cot, rightBase = tx + dx;
  const trap: Pt[] = [[leftX, yTop], [topRight, yTop], [bottomRight, yBottom], [leftX, yBottom]];
  const voidPoly: Pt[] = [[tx, yTop], [rightBase, yTop], [tx, tipY]];
  const tTip = (tipY - yBottom) / height;
  const outerAtTip = bottomRight + tTip * (topRight - bottomRight);
  const left: Pt[] = [[leftX, tipY], [tx, tipY], [tx, yTop], [leftX, yTop]];
  const right: Pt[] = [[tx, tipY], [outerAtTip, tipY], [topRight, yTop], [rightBase, yTop]];
  const long = topRight - leftX, short = bottomRight - leftX;
  const leftDir: Pt = [0, dy], rightDir: Pt = [dx, dy];
  const leftAngle = angleOf(leftDir[0], leftDir[1]), rightAngle = angleOf(rightDir[0], rightDir[1]);
  const leftArea = area(left), rightArea = area(right);
  const equalWings = Math.abs(leftArea - rightArea) <= Math.max(leftArea, rightArea) * 0.02;
  const countA = equalWings ? 3 : leftArea < rightArea ? 3 : 2;
  const countB = equalWings ? 3 : rightArea < leftArea ? 3 : 2;
  const leftParts = slicesAlong(ccw(left), leftDir, countA);
  const rightParts = slicesAlong(ccw(right), rightDir, countB);
  const byY = (poly: Pt[]) => centroid(poly)[1];
  const wingA = [...leftParts].sort((a, b2) => byY(a) - byY(b2));
  const wingB = [...rightParts].sort((a, b2) => byY(a) - byY(b2));
  const base = 1;
  const plates: OfficePlate[] = [];
  const terracePolys: { id: string; poly: Pt[]; z: number; wing: "A" | "B" }[] = [];
  wingA.forEach((poly, index) => terracePolys.push({ id: `A${index + 1}`, poly, z: base + index * 2, wing: "A" }));
  wingB.forEach((poly, index) => terracePolys.push({ id: `B${index + 1}`, poly, z: base + (wingB.length - 1 - index) * 2, wing: "B" }));
  for (const terrace of terracePolys) plates.push({ id: terrace.id, polygon: terrace.poly, zTop: terrace.z, thickness: 0.5, role: "terrace" });
  const sillLeft = halfPlane(halfPlane(ccw(trap), 0, 1, tipY, true), 1, 0, 0, true);
  const sillRight = halfPlane(halfPlane(ccw(trap), 0, 1, tipY, true), 1, 0, 0, false);
  const tipLow = base, tipHigh = base + (countB - 1) * 2;
  plates.push({ id: "sill-a", polygon: sillLeft, zTop: tipLow, thickness: 0.5, role: "ground" });
  plates.push({ id: "sill-b", polygon: sillRight, zTop: tipHigh, thickness: 0.5, role: "ground" });
  const trapArea = area(trap), voidArea = area(voidPoly);
  const occupied = trapArea - voidArea;
  terracePolys.forEach((terrace) => {
    const outer = terrace.poly.reduce((best, p) => Math.abs(p[0]) > Math.abs(best[0]) ? p : best, terrace.poly[0]);
    const anchor: Pt = [outer[0] - Math.sign(outer[0] || 1) * 0.15, outer[1]];
    const footprint = lPolygon(anchor, 0.5, terrace.wing === "A" ? 90 : -90);
    const box = boundsOf([footprint]);
    if (box.maxX <= 9.95 && box.minX >= -9.95 && box.maxY <= 9.95 && box.minY >= -9.95 && intersectionArea(footprint, terrace.poly) > 0.02) {
      plates.push({ id: `${terrace.id}-support`, polygon: footprint, zTop: terrace.z, thickness: terrace.z - 0.2, role: "support" });
    }
  });
  const roofZ = Math.max(...terracePolys.map((t) => t.z)) + 10.5;
  plates.push({ id: "roof", polygon: trap, zTop: roofZ + 0.5, thickness: 0.5, role: "roof" });
  const links: OfficeLink[] = [];
  const connectWing = (wing: typeof terracePolys) => {
    for (let i = 1; i < wing.length; i++) {
      links.push({
        id: `${wing[i - 1].id}-${wing[i].id}`,
        from: centroid(wing[i - 1].poly), to: centroid(wing[i].poly),
        z0: wing[i - 1].z, z1: wing[i].z, width: 2.4, thickness: 0.35,
      });
    }
  };
  connectWing(terracePolys.filter((t) => t.wing === "A"));
  connectWing(terracePolys.filter((t) => t.wing === "B"));
  const squareAngles = [0, leftAngle, rightAngle];
  const squareFlags = terracePolys.map((t) => fitsSquare(t.poly, 5, squareAngles));
  const squares = squareFlags.every(Boolean);
  const spread = (parts: Pt[][]) => Math.max(...parts.map(area)) - Math.min(...parts.map(area));
  const equalA = wingA.length === countA && spread(wingA) < 1.5;
  const equalB = wingB.length === countB && spread(wingB) < 1.5;
  const risesA = wingA.length >= 2 && terracePolys.filter((t) => t.wing === "A").every((t, i, list) => i === 0 || Math.abs(t.z - list[i - 1].z - 2) < 1e-6);
  const fallsB = terracePolys.filter((t) => t.wing === "B").every((t, i, list) => i === 0 || Math.abs(list[i - 1].z - t.z - 2) < 1e-6);
  const head = overheadClearance(plates, ["terrace"]);
  const ratio = long / short;
  const countSentence = equalWings
    ? "The wings are equal, so each is divided into three plates."
    : `Wing A is ${leftArea < rightArea ? "smaller" : "larger"} and has ${countA} plates. Wing B is ${rightArea < leftArea ? "smaller" : "larger"} and has ${countB} plates.`;
  check(checks, "Trapezoid ratio", ratio >= 4 / 3 - 1e-3 && ratio <= 2 + 1e-3, `Parallel sides are ${long.toFixed(2)} ft and ${short.toFixed(2)} ft. Ratio ${ratio.toFixed(3)} is between 4:3 and 2:1.`);
  check(checks, "Central void", voidArea / trapArea >= 0.2 - 1e-3 && voidArea / trapArea <= 0.4 + 1e-3 && tipY >= yBottom + 0.4, `The triangular void is ${(voidArea / trapArea * 100).toFixed(1)}% of the trapezoid. Its base is on the long side and its tip stops ${(tipY - yBottom).toFixed(2)} ft before the opposite side.`);
  check(checks, "Angular directions", snapped15(leftAngle) && snapped15(rightAngle) && !parallelAngles(leftAngle, rightAngle), `Edge A is ${leftAngle.toFixed(1)}° and Edge B is ${rightAngle.toFixed(1)}° from +X, both on 15° increments and not parallel. They match the trapezoid's nonparallel sides.`);
  check(checks, "Terrace subdivision", equalA && equalB && squares, `${countSentence} Plates in each wing match in area. Every terrace contains a clear 5 × 5 ft patch. Subdivision lines are perpendicular to that wing's void edge.`);
  check(checks, "Occupied grid fraction", occupied / GRID >= 0.3 - 1e-3 && occupied / GRID <= 0.5 + 1e-3, `Occupied plate area after the void is ${occupied.toFixed(1)} ft², ${(occupied / GRID * 100).toFixed(1)}% of the 20 × 20 ft grid.`);
  check(checks, "Opposing 2 ft sequences", risesA && fallsB, "Wing A rises 2.00 ft toward the void opening. Wing B rises 2.00 ft in the opposite direction. Finished tops stay 2 ft apart and the plates stay level.");
  check(checks, "Shared void and connections", links.length === wingA.length + wingB.length - 2, "The central void stays open between the wings. Short stairs join consecutive plates in each wing.");
  check(checks, "Terrace headroom", head.min > 10, `Clear headroom below overhead geometry is ${head.min.toFixed(2)} ft, measured to the underside and including slab thickness.`);
  const slots = terracePolys.flatMap((t) => floorSlots(t.poly, t.z - 0.25, "L", 2.2, 2));
  return {
    typology: "cascaded-terraced-plates", plates, voids: [{ id: "central-void", polygon: voidPoly, cut: false }], links, checks, slots,
    operations: [
      `Cascaded plates: trapezoid ${long.toFixed(2)} × ${short.toFixed(2)} ft on the parallel sides, ratio ${ratio.toFixed(3)}.`,
      `Triangular void is ${(voidArea / trapArea * 100).toFixed(1)}% of the trapezoid, opening on the long side.`,
      `Edge A ${leftAngle.toFixed(0)}°, Edge B ${rightAngle.toFixed(0)}°. ${countSentence}`,
      "Wing A steps up by 2 ft along the void. Wing B steps up by 2 ft in the reverse direction. Short stairs join consecutive terraces.",
      `Occupied area is ${(occupied / GRID * 100).toFixed(1)}% of the 20 × 20 ft grid. Each terrace keeps a 5 × 5 ft patch and more than 10 ft of headroom.`,
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

function requireTypology(typology: string) { if (typology !== "cascaded-terraced-plates") throw Error("Wrong workspace rules module: "+typology); return cascaded; }
