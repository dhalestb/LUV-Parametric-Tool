// Architectural rules owned exclusively by flat-deep-plan-plate.
import * as THREE from "three";
import { flatPlateDimensions, flatPlateFootprint, flatPlatePlan as flatDeep } from './flat-deep-plan-plate.plan';
type IntersectionPlacement = {letter:"L"; x:number; y:number; z:number; rx:number; ry:number; rz:number; scale:number; scaleX:number; scaleY:number; scaleZ:number; rotationOrder?:THREE.EulerOrder};
import { getLetterVolumeGeometry } from "../../letterGeometry3d";

import type { OfficeField, OfficePlan, OfficeCheck, Pt, OfficePlate, OfficeSlot, OfficeVoid, OfficeLink } from "./contracts";

export const DEFAULT_OFFICE_FIELD: OfficeField = { width: 20, depth: 20, height: 20 };

function check(list: OfficeCheck[], label: string, ok: boolean, detail: string) {
  list.push({ label, status: ok ? "pass" : "fail", detail });
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

function quad(a: Pt, b: Pt, width: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * width / 2, ny = dx / len * width / 2;
  return [[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]];
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

function flatPlatePlacement(slot: OfficeSlot): IntersectionPlacement {
  return {letter:'L',x:slot.x,y:slot.y,z:slot.z,rx:slot.rx,ry:slot.ry,rz:slot.rz,scale:slot.scale,scaleX:1,scaleY:1,scaleZ:1};
}

function flatPlateGuideFieldError(placement: IntersectionPlacement, field: OfficeField, setting: string) {
  const bounds = letterFieldOverflow(placement, field);
  const axes = [];
  if (bounds.dx > 1e-6) axes.push('Width X');
  if (bounds.dy > 1e-6) axes.push('Depth Y');
  if (bounds.dzLo > 1e-6 || bounds.dzHi > 1e-6) axes.push('Height Z');
  if (!axes.length) return;
  const dimensions = axes.join(', ');
  return `Flat Deep Plan Plate guide at ${placement.scale} ft extends outside the field along ${dimensions}. Reduce ${setting} or increase ${dimensions}.`;
}

export function flatPlateFloorGuideError(field: OfficeField) {
  const {slabThickness, floorMezzGuideSize} = flatPlateDimensions(field.flatPlate);
  const {slots} = flatPlateFootprint(field, slabThickness, floorMezzGuideSize);
  for (const slot of slots) {
    const placement = flatPlatePlacement({...slot, z: slot.z - field.height / 2});
    const error = flatPlateGuideFieldError(placement, field, 'Floor and mezzanine L size');
    if (error) return error;
  }
}

export function arrangeOfficeLetters(
  _source: IntersectionPlacement[], typology: string, _thicknessPercent = 12,
  centerOverride?: [number,number,number], field: OfficeField = DEFAULT_OFFICE_FIELD,
) {
  requireTypology(typology);
  const officePlan=planOfficeWorkspace(typology,0,centerOverride??[0,0,0],field);
  const placements=officePlan.slots.map(flatPlatePlacement);
  const cornerGuideCount=officePlan.plates
    .filter(plate=>plate.role==='ground'||plate.role==='mezzanine')
    .reduce((count,plate)=>count+plate.polygon.length,0);
  for(const [index,placement] of placements.entries()){
    const setting=index<cornerGuideCount?'Floor and mezzanine L size'
      : Math.abs(placement.rx)>1||Math.abs(placement.ry)>1?'Wall L size':'Column L size';
    const error=flatPlateGuideFieldError(placement,field,setting);
    if(error)throw Error(error);
  }
  check(officePlan.checks, "Flat plate guides inside field", true,
    `All ${placements.length} arranged L guide meshes fit inside the ${field.width} × ${field.depth} × ${field.height} ft field at their selected sizes.`);
  return {placements,sequence:placements.map((_,i)=>i),preservedPairs:[] as number[][],overlapFractions:[] as number[],riseFractions:[] as number[],officePlan,operations:officePlan.operations,supported:true,sourcePolicy:'Flat Deep Plan Plate invents L corner guides and column-grid guides; no Open Hall metadata is used.'};
}
function requireTypology(typology: string) { if (typology !== "flat-deep-plan-plate") throw Error("Wrong workspace rules module: "+typology); return flatDeep; }
