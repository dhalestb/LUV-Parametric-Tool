import { faceTriangles } from "../lattice/parseObj";
import type { ImportedObj, UpAxis, Vec3 } from "../lattice/types";
import { fileToSpec } from "../lattice/types";
import type { Voxel } from "./openVolume";

/** Same upward test the occupied raster uses for a near-horizontal face. Not a walkable-floor test. */
export const UPWARD_NORMAL = 0.68;
/** Connected upward patches smaller than this stay out of the clearance diagnostic. */
export const MIN_PATCH_AREA = 12;

export type LandingPatch = {
  cells: Voxel[];
  surfaceTop: number;
  surfaceLow: number;
  area: number;
  layer: number;
  cellBottom: number;
  cellTop: number;
  /** Feet from the highest upward sample to the top of its occupied voxel. */
  riseToNextLayer: number;
};

export type GoldRelation = {
  patchTop: number;
  goldBottom: number;
  goldTop: number;
  /** Positive when the gold cell begins above the surface. Negative when it begins below. */
  verticalFeet: number;
  horizontalFeet: number;
  relation: "above" | "beside" | "below";
};

export type LandingReport = {
  patches: LandingPatch[];
  clearanceCells: Voxel[];
  cappedCells: Voxel[];
  openCells: Voxel[];
  cappedColumns: number;
  openColumns: number;
  aboveShrink: number;
  besideShrink: number;
  belowShrink: number;
  otherShrink: number;
  nearest: GoldRelation | null;
};

function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function boundsOf(cells: Voxel[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of cells) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Highest and lowest upward sample in each occupied cell, spec feet. */
export function upwardSampleRange(mesh: ImportedObj, unitScale: number, up: UpAxis, anchor: Vec3, cellFeet: number) {
  const range = new Map<string, { low: number; top: number }>();
  const positions = mesh.positions;
  const spec = (index: number): [number, number, number] => {
    const file = fileToSpec(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2], up);
    return [file[0] * unitScale, file[1] * unitScale, file[2] * unitScale];
  };
  for (const face of mesh.faces) {
    for (const [ia, ib, ic] of faceTriangles(face)) {
      const a = spec(ia);
      const b = spec(ib);
      const c = spec(ic);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = ab[1] * ac[2] - ab[2] * ac[1];
      const ny = ab[2] * ac[0] - ab[0] * ac[2];
      const nz = ab[0] * ac[1] - ab[1] * ac[0];
      const length = Math.hypot(nx, ny, nz);
      const area = length * 0.5;
      if (!area || nz / length < UPWARD_NORMAL) continue;
      const samples = Math.max(1, Math.min(24, Math.ceil(area / (cellFeet * cellFeet * 0.5))));
      const steps = Math.ceil(Math.sqrt(samples * 2));
      for (let iu = 0; iu <= steps; iu += 1) {
        for (let iv = 0; iv <= steps - iu; iv += 1) {
          const u = iu / steps;
          const v = iv / steps;
          const w = 1 - u - v;
          const x = a[0] * w + b[0] * u + c[0] * v;
          const y = a[1] * w + b[1] * u + c[1] * v;
          const z = a[2] * w + b[2] * u + c[2] * v;
          const cell: Voxel = [
            Math.floor((x - anchor[0]) / cellFeet),
            Math.floor((y - anchor[1]) / cellFeet),
            Math.floor((z - anchor[2]) / cellFeet),
          ];
          const key = keyOf(cell[0], cell[1], cell[2]);
          const current = range.get(key);
          if (!current) range.set(key, { low: z, top: z });
          else {
            current.low = Math.min(current.low, z);
            current.top = Math.max(current.top, z);
          }
        }
      }
    }
  }
  return range;
}

function patchesFrom(floor: Voxel[], range: Map<string, { low: number; top: number }>, anchor: Vec3, cellFeet: number) {
  const eligible = floor.filter((cell) => range.has(keyOf(cell[0], cell[1], cell[2])));
  const remaining = new Set(eligible.map((cell) => keyOf(cell[0], cell[1], cell[2])));
  const groups: Voxel[][] = [];
  for (const start of eligible) {
    const startKey = keyOf(start[0], start[1], start[2]);
    if (!remaining.has(startKey)) continue;
    remaining.delete(startKey);
    const group = [start];
    for (let index = 0; index < group.length; index += 1) {
      const [x, y, z] = group[index];
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
        const key = keyOf(nx, ny, z);
        if (!remaining.has(key)) continue;
        remaining.delete(key);
        group.push([nx, ny, z]);
      }
    }
    groups.push(group);
  }
  const minCells = Math.max(1, Math.ceil(MIN_PATCH_AREA / (cellFeet * cellFeet)));
  const patches: LandingPatch[] = [];
  for (const cells of groups) {
    if (cells.length < minCells) continue;
    let surfaceTop = -Infinity;
    let surfaceLow = Infinity;
    for (const cell of cells) {
      const sample = range.get(keyOf(cell[0], cell[1], cell[2]));
      if (!sample) continue;
      surfaceTop = Math.max(surfaceTop, sample.top);
      surfaceLow = Math.min(surfaceLow, sample.low);
    }
    const layer = cells[0][2];
    const cellBottom = anchor[2] + layer * cellFeet;
    const cellTop = cellBottom + cellFeet;
    patches.push({
      cells,
      surfaceTop,
      surfaceLow,
      area: cells.length * cellFeet * cellFeet,
      layer,
      cellBottom,
      cellTop,
      riseToNextLayer: cellTop - surfaceTop,
    });
  }
  patches.sort((left, right) => right.area - left.area || left.surfaceTop - right.surfaceTop);
  return patches;
}

/**
 * Free cells above qualifying upward patches, inside the occupied bounds.
 * A column stops at an occupied cell or at the top of that box.
 * This is an experimental diagnostic. It is not occupiable space and not a score.
 */
export function clearanceCells(occupied: Voxel[], patches: LandingPatch[]): { cells: Voxel[]; cappedCells: Voxel[]; openCells: Voxel[]; cappedColumns: number; openColumns: number } {
  const occupiedKeys = new Set(occupied.map((cell) => keyOf(cell[0], cell[1], cell[2])));
  const bounds = boundsOf(occupied);
  const capped = new Map<string, Voxel>();
  const open = new Map<string, Voxel>();
  let cappedColumns = 0;
  let openColumns = 0;
  for (const patch of patches) {
    for (const [x, y, z] of patch.cells) {
      const column: Voxel[] = [];
      let hit = false;
      for (let nz = z + 1; nz <= bounds.maxZ; nz += 1) {
        if (occupiedKeys.has(keyOf(x, y, nz))) {
          hit = true;
          break;
        }
        column.push([x, y, nz]);
      }
      const target = hit ? capped : open;
      for (const cell of column) target.set(keyOf(cell[0], cell[1], cell[2]), cell);
      if (hit) cappedColumns += 1;
      else openColumns += 1;
    }
  }
  return {
    cells: [...capped.values(), ...open.values()],
    cappedCells: [...capped.values()],
    openCells: [...open.values()],
    cappedColumns,
    openColumns,
  };
}

function classifyShrink(patches: LandingPatch[], shrinkFree: Voxel[]) {
  const above = new Set<string>();
  const beside = new Set<string>();
  const below = new Set<string>();
  for (const patch of patches) {
    for (const [x, y, z] of patch.cells) {
      above.add(keyOf(x, y, z + 1));
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          if (!dx && !dy) continue;
          beside.add(keyOf(x + dx, y + dy, z));
          beside.add(keyOf(x + dx, y + dy, z + 1));
          below.add(keyOf(x + dx, y + dy, z - 1));
          below.add(keyOf(x, y, z - 1));
        }
      }
    }
  }
  let aboveShrink = 0;
  let besideShrink = 0;
  let belowShrink = 0;
  let otherShrink = 0;
  for (const cell of shrinkFree) {
    const key = keyOf(cell[0], cell[1], cell[2]);
    if (above.has(key)) aboveShrink += 1;
    else if (beside.has(key)) besideShrink += 1;
    else if (below.has(key)) belowShrink += 1;
    else otherShrink += 1;
  }
  return { aboveShrink, besideShrink, belowShrink, otherShrink };
}

function nearestGold(anchor: Vec3, cellFeet: number, patch: LandingPatch | undefined, shrinkFree: Voxel[]): GoldRelation | null {
  if (!patch || !shrinkFree.length) return null;
  let best: GoldRelation | null = null;
  let bestDistance = Infinity;
  for (const cell of shrinkFree) {
    let horizontal = Infinity;
    for (const [x, y] of patch.cells) {
      horizontal = Math.min(horizontal, Math.hypot((cell[0] - x) * cellFeet, (cell[1] - y) * cellFeet));
    }
    const goldBottom = anchor[2] + cell[2] * cellFeet;
    const goldTop = goldBottom + cellFeet;
    const verticalGap = patch.surfaceTop < goldBottom ? goldBottom - patch.surfaceTop : patch.surfaceTop > goldTop ? patch.surfaceTop - goldTop : 0;
    const relation: GoldRelation["relation"] = cell[2] > patch.layer ? "above" : cell[2] < patch.layer ? "below" : "beside";
    const verticalFeet = relation === "above" ? goldBottom - patch.surfaceTop : relation === "below" ? goldTop - patch.surfaceTop : goldBottom - patch.surfaceTop;
    const distance = Math.hypot(horizontal, verticalGap);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { patchTop: patch.surfaceTop, goldBottom, goldTop, verticalFeet, horizontalFeet: horizontal, relation };
    }
  }
  return best;
}

export function landingReport(input: {
  mesh: ImportedObj;
  unitScale: number;
  up: UpAxis;
  anchor: Vec3;
  cellFeet: number;
  occupied: Voxel[];
  floor: Voxel[];
  shrinkFree: Voxel[];
}): LandingReport {
  const range = upwardSampleRange(input.mesh, input.unitScale, input.up, input.anchor, input.cellFeet);
  const patches = patchesFrom(input.floor, range, input.anchor, input.cellFeet);
  const clearance = clearanceCells(input.occupied, patches);
  return {
    patches,
    clearanceCells: clearance.cells,
    cappedCells: clearance.cappedCells,
    openCells: clearance.openCells,
    cappedColumns: clearance.cappedColumns,
    openColumns: clearance.openColumns,
    ...classifyShrink(patches, input.shrinkFree),
    nearest: nearestGold(input.anchor, input.cellFeet, patches[0], input.shrinkFree),
  };
}

/** Spec-feet segments along the measured top of each qualifying upward patch. */
export function landingGuideSegments(patches: LandingPatch[], anchor: Vec3, cellFeet: number): Array<{ a: Vec3; b: Vec3 }> {
  const segments: Array<{ a: Vec3; b: Vec3 }> = [];
  for (const patch of patches) {
    for (const [x, y] of patch.cells) {
      const z = patch.surfaceTop;
      const x0 = anchor[0] + x * cellFeet;
      const y0 = anchor[1] + y * cellFeet;
      segments.push({ a: [x0, y0, z], b: [x0 + cellFeet, y0, z] });
    }
  }
  return segments;
}
