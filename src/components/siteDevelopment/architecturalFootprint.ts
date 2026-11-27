/**
 * Architectural building footprint from registered OBJ mesh geometry.
 *
 * Convention (plan occupancy):
 * - Transform mesh vertices into Lattice Z-up feet (file → spec × unitScale).
 * - Register to the same plan center used by Site/Lattice tile registration
 *   (AABB plan center at origin; base at min Z).
 * - Rasterize every triangle onto the plan (spec XY = site XZ).
 * - Occupied cells = architectural plan occupancy counted toward coverage.
 *
 * This excludes empty AABB / courtyard / open-to-sky cells that never receive
 * geometry, while including cantilevers and elevated plates that project onto
 * the plan. Covered voids vs open-to-sky voids are NOT distinguished from OBJ
 * topology alone — results are labeled as plan-occupancy estimates.
 *
 * Collision / clearance continue to use oriented rectangular plan envelopes.
 */

import { combinedBoundsSpec } from "../lattice/objFidelity";
import {
  fileToSpec,
  LATTICE_FEET,
  resolvedUp,
  type ImportedObj,
  type UpAxis,
  type UpAxisMode,
} from "../lattice/types";

export const ARCHITECTURAL_FOOTPRINT_CELL_FEET = 2;
export const ARCHITECTURAL_FOOTPRINT_METHOD =
  "registered mesh plan-occupancy raster (triangle projection; AABB voids excluded; cantilevers included; open-to-sky vs covered openings not distinguished)";

export type FootprintCell = { ix: number; iz: number };

export type ArchitecturalFootprintMask = {
  meshId: string;
  filename: string | null;
  cellFeet: number;
  /** Local plan cells relative to registration center (site X/Z axes before yaw). */
  cells: FootprintCell[];
  occupancyAreaFeet: number;
  envelopeWidthFeet: number;
  envelopeDepthFeet: number;
  envelopeAreaFeet: number;
  /** Lowest-band triangle projection — diagnostic only. */
  groundContactAreaFeet: number;
  triangleCount: number;
  method: string;
  uncertainty: string;
};

export type ArchitecturalFootprintPlacement = {
  x: number;
  z: number;
  yawDeg: number;
  mask: ArchitecturalFootprintMask;
};

const analysisCache = new Map<string, ArchitecturalFootprintMask>();

function cacheKey(meshId: string, unitScale: number, up: UpAxis, cellFeet: number) {
  return `${meshId}|${unitScale}|${up}|${cellFeet}`;
}

function rasterTriangle(
  occupied: Set<string>,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  cell: number,
) {
  const minX = Math.min(ax, bx, cx);
  const maxX = Math.max(ax, bx, cx);
  const minZ = Math.min(az, bz, cz);
  const maxZ = Math.max(az, bz, cz);
  const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
  if (Math.abs(area) < 1e-12) return;
  const x0 = Math.floor(minX / cell);
  const x1 = Math.floor(maxX / cell);
  const z0 = Math.floor(minZ / cell);
  const z1 = Math.floor(maxZ / cell);
  for (let ix = x0; ix <= x1; ix += 1) {
    for (let iz = z0; iz <= z1; iz += 1) {
      const px = (ix + 0.5) * cell;
      const pz = (iz + 0.5) * cell;
      const w0 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
      const w1 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
      const w2 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        occupied.add(`${ix}:${iz}`);
      }
    }
  }
}

/**
 * Analyze one OBJ into a registered local occupancy mask.
 * Does not mutate the mesh. Safe to call repeatedly (cached).
 */
export function analyzeArchitecturalFootprint(
  mesh: ImportedObj,
  unitScale: number,
  upAxisMode: UpAxisMode,
  cellFeet = ARCHITECTURAL_FOOTPRINT_CELL_FEET,
): ArchitecturalFootprintMask {
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  const key = cacheKey(mesh.id, unitScale, up, cellFeet);
  const cached = analysisCache.get(key);
  if (cached) return cached;

  const bounds = combinedBoundsSpec(mesh, unitScale, up);
  const anchorX = bounds.anchor[0];
  const anchorY = bounds.anchor[1];
  const minZ = bounds.min[2];
  const height = Math.max(1e-6, bounds.size[2]);
  const groundBand = Math.max(cellFeet, height * 0.08);

  const verts: Array<[number, number, number]> = [];
  const pos = mesh.positions;
  for (let i = 0; i < pos.length; i += 3) {
    const [x, y, z] = fileToSpec(pos[i], pos[i + 1], pos[i + 2], up);
    verts.push([
      x * unitScale - anchorX,
      y * unitScale - anchorY,
      z * unitScale,
    ]);
  }

  const full = new Set<string>();
  const ground = new Set<string>();
  let triangles = 0;
  for (const face of mesh.faces) {
    const indices = face.vertices;
    for (let t = 0; t + 2 < indices.length; t += 1) {
      const a = verts[indices[t]];
      const b = verts[indices[t + 1]];
      const c = verts[indices[t + 2]];
      if (!a || !b || !c) continue;
      triangles += 1;
      // Spec plan XY → site plan XZ.
      rasterTriangle(full, a[0], a[1], b[0], b[1], c[0], c[1], cellFeet);
      const zMin = Math.min(a[2], b[2], c[2]);
      if (zMin <= minZ + groundBand) {
        rasterTriangle(ground, a[0], a[1], b[0], b[1], c[0], c[1], cellFeet);
      }
    }
  }

  const cells: FootprintCell[] = [];
  for (const token of full) {
    const [ix, iz] = token.split(":").map(Number);
    cells.push({ ix, iz });
  }
  cells.sort((a, b) => (a.iz - b.iz) || (a.ix - b.ix));

  const envelopeWidthFeet = Math.max(LATTICE_FEET, bounds.size[0]);
  const envelopeDepthFeet = Math.max(LATTICE_FEET, bounds.size[1]);
  const occupancyAreaFeet = cells.length * cellFeet * cellFeet;
  const result: ArchitecturalFootprintMask = {
    meshId: mesh.id,
    filename: mesh.filename ?? null,
    cellFeet,
    cells,
    occupancyAreaFeet,
    envelopeWidthFeet,
    envelopeDepthFeet,
    envelopeAreaFeet: envelopeWidthFeet * envelopeDepthFeet,
    groundContactAreaFeet: ground.size * cellFeet * cellFeet,
    triangleCount: triangles,
    method: ARCHITECTURAL_FOOTPRINT_METHOD,
    uncertainty:
      "Plan occupancy includes any mesh that projects onto the plan (floors, roofs, cantilevers, plates). "
      + "Open-to-sky courtyards without geometry are excluded. Covered voids and unmodeled slabs cannot be certified from OBJ faces alone.",
  };
  analysisCache.set(key, result);
  return result;
}

export function clearArchitecturalFootprintCache() {
  analysisCache.clear();
}

/** Build a synthetic box mask for tests (axis-aligned, centered). */
export function syntheticBoxFootprintMask(options: {
  meshId: string;
  widthFeet: number;
  depthFeet: number;
  cellFeet?: number;
  filename?: string;
}): ArchitecturalFootprintMask {
  const cell = options.cellFeet ?? ARCHITECTURAL_FOOTPRINT_CELL_FEET;
  const halfW = options.widthFeet / 2;
  const halfD = options.depthFeet / 2;
  const cells: FootprintCell[] = [];
  for (let x = -halfW + cell / 2; x < halfW; x += cell) {
    for (let z = -halfD + cell / 2; z < halfD; z += cell) {
      cells.push({ ix: Math.floor(x / cell), iz: Math.floor(z / cell) });
    }
  }
  const unique = new Map(cells.map((cellItem) => [`${cellItem.ix}:${cellItem.iz}`, cellItem]));
  const list = [...unique.values()];
  return {
    meshId: options.meshId,
    filename: options.filename ?? null,
    cellFeet: cell,
    cells: list,
    occupancyAreaFeet: list.length * cell * cell,
    envelopeWidthFeet: Math.max(LATTICE_FEET, options.widthFeet),
    envelopeDepthFeet: Math.max(LATTICE_FEET, options.depthFeet),
    envelopeAreaFeet: Math.max(LATTICE_FEET, options.widthFeet) * Math.max(LATTICE_FEET, options.depthFeet),
    groundContactAreaFeet: list.length * cell * cell,
    triangleCount: 12,
    method: "synthetic solid box footprint (test)",
    uncertainty: "Synthetic solid — no voids.",
  };
}

/** Hollow ring: outer box minus inner open courtyard (synthetic). */
export function syntheticCourtyardFootprintMask(options: {
  meshId: string;
  outerFeet: number;
  voidFeet: number;
  cellFeet?: number;
}): ArchitecturalFootprintMask {
  const cell = options.cellFeet ?? ARCHITECTURAL_FOOTPRINT_CELL_FEET;
  const outer = syntheticBoxFootprintMask({
    meshId: options.meshId,
    widthFeet: options.outerFeet,
    depthFeet: options.outerFeet,
    cellFeet: cell,
  });
  const halfVoid = options.voidFeet / 2;
  const cells = outer.cells.filter((item) => {
    const x = (item.ix + 0.5) * cell;
    const z = (item.iz + 0.5) * cell;
    return Math.abs(x) > halfVoid || Math.abs(z) > halfVoid;
  });
  return {
    ...outer,
    cells,
    occupancyAreaFeet: cells.length * cell * cell,
    groundContactAreaFeet: cells.length * cell * cell,
    method: "synthetic courtyard footprint (test)",
    uncertainty: "Synthetic open courtyard — void has no geometry.",
  };
}

function transformLocalCell(
  cell: FootprintCell,
  cellFeet: number,
  originX: number,
  originZ: number,
  yawDeg: number,
): { wx: number; wz: number } {
  const lx = (cell.ix + 0.5) * cellFeet;
  const lz = (cell.iz + 0.5) * cellFeet;
  const rad = yawDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    wx: originX + lx * cos - lz * sin,
    wz: originZ + lx * sin + lz * cos,
  };
}

/**
 * Union area of architectural footprints (ft²) without double-counting overlaps.
 * World raster uses each mask's cell size (masks should share a common cell size).
 */
export function architecturalFootprintUnionArea(
  placements: ArchitecturalFootprintPlacement[],
  cellFeet = ARCHITECTURAL_FOOTPRINT_CELL_FEET,
) {
  if (!placements.length) return 0;
  const occupied = new Set<string>();
  for (const placement of placements) {
    const cell = placement.mask.cellFeet || cellFeet;
    for (const local of placement.mask.cells) {
      const { wx, wz } = transformLocalCell(local, cell, placement.x, placement.z, placement.yawDeg);
      const ix = Math.floor(wx / cellFeet);
      const iz = Math.floor(wz / cellFeet);
      occupied.add(`${ix}:${iz}`);
    }
  }
  return occupied.size * cellFeet * cellFeet;
}

/** World-space cell centers for visualization (same raster as union area). */
export function architecturalFootprintWorldCells(
  placements: ArchitecturalFootprintPlacement[],
  cellFeet = ARCHITECTURAL_FOOTPRINT_CELL_FEET,
): Array<{ x: number; z: number; cellFeet: number }> {
  const occupied = new Map<string, { x: number; z: number; cellFeet: number }>();
  for (const placement of placements) {
    const cell = placement.mask.cellFeet || cellFeet;
    for (const local of placement.mask.cells) {
      const { wx, wz } = transformLocalCell(local, cell, placement.x, placement.z, placement.yawDeg);
      const ix = Math.floor(wx / cellFeet);
      const iz = Math.floor(wz / cellFeet);
      const key = `${ix}:${iz}`;
      if (!occupied.has(key)) {
        occupied.set(key, {
          x: (ix + 0.5) * cellFeet,
          z: (iz + 0.5) * cellFeet,
          cellFeet,
        });
      }
    }
  }
  return [...occupied.values()];
}

export function meanArchitecturalFootprintArea(
  sources: Array<{ architecturalFootprintAreaFeet?: number; planWidthFeet?: number; planDepthFeet?: number; slotId?: string | null }>,
  slotFilter?: Set<string>,
) {
  const relevant = sources.filter((source) => {
    if (!slotFilter?.size) return true;
    return !!source.slotId && slotFilter.has(source.slotId);
  });
  if (!relevant.length) return LATTICE_FEET * LATTICE_FEET;
  const total = relevant.reduce((sum, source) => {
    if (Number.isFinite(source.architecturalFootprintAreaFeet) && (source.architecturalFootprintAreaFeet ?? 0) > 0) {
      return sum + (source.architecturalFootprintAreaFeet as number);
    }
    const w = Math.max(LATTICE_FEET, source.planWidthFeet ?? LATTICE_FEET);
    const d = Math.max(LATTICE_FEET, source.planDepthFeet ?? LATTICE_FEET);
    return sum + w * d;
  }, 0);
  return total / relevant.length;
}
