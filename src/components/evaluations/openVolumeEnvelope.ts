import type { Voxel } from "./openVolume";

/**
 * Experimental envelopes for Architectural Open Space.
 * These walks do not feed measureOpenVolume. Recorded scores stay on the occupied-bounds box.
 */

export type EnvelopeKind = "box" | "shrink-wrap" | "component" | "proximity";

export type EnvelopeStudy = {
  kind: EnvelopeKind;
  /** Chebyshev closing radius in cells. Ignored by the box. */
  radius: number;
  occupied: number;
  envelope: number;
  candidateFree: number;
  exteriorFree: number;
  enclosedFree: number;
  /** Experimental between-surface count inside this envelope. Not the recorded interstitial score. */
  interstitial: number;
  regions: number;
  largestRegion: number;
  /** Candidate free cells divided by the envelope, 0–100. Not the recorded score. */
  candidateRatio: number;
  envelopeCells: Voxel[];
  freeCells: Voxel[];
};

const SIX: Voxel[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const N26: Voxel[] = [];
for (let z = -1; z <= 1; z += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x || y || z) N26.push([x, y, z]);
    }
  }
}

function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function parseKey(key: string): Voxel {
  const [x, y, z] = key.split(",").map(Number);
  return [x, y, z];
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

function boxCells(occupied: Voxel[]): Voxel[] {
  if (!occupied.length) return [];
  const bounds = boundsOf(occupied);
  const cells: Voxel[] = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) cells.push([x, y, z]);
    }
  }
  return cells;
}

/** Chebyshev distance from the seeds, limited to `radius` steps of 26-connectivity. */
function dilation(seeds: Voxel[], radius: number) {
  const dist = new Map<string, number>();
  let frontier = seeds;
  for (const [x, y, z] of seeds) dist.set(keyOf(x, y, z), 0);
  for (let step = 0; step < radius; step += 1) {
    const next: Voxel[] = [];
    for (const [x, y, z] of frontier) {
      for (const [dx, dy, dz] of N26) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        const key = keyOf(nx, ny, nz);
        if (dist.has(key)) continue;
        dist.set(key, step + 1);
        next.push([nx, ny, nz]);
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Morphological closing with a Chebyshev ball.
 * Dilation followed by erosion. Gaps up to 2 × radius cells can close.
 * Cells farther than that stay outside. Occupied cells remain inside.
 */
export function morphologicalClose(occupied: Voxel[], radius: number): Voxel[] {
  if (!occupied.length || radius <= 0) return occupied.map((cell) => [cell[0], cell[1], cell[2]]);
  const dilated = dilation(occupied, radius);
  const closed: Voxel[] = [];
  for (const key of dilated.keys()) {
    const [x, y, z] = parseKey(key);
    let covered = true;
    for (let dz = -radius; dz <= radius && covered; dz += 1) {
      for (let dy = -radius; dy <= radius && covered; dy += 1) {
        for (let dx = -radius; dx <= radius && covered; dx += 1) {
          if (!dilated.has(keyOf(x + dx, y + dy, z + dz))) covered = false;
        }
      }
    }
    if (covered) closed.push([x, y, z]);
  }
  return closed;
}

function occupiedComponents(occupied: Voxel[]): Voxel[][] {
  const remaining = new Set(occupied.map(([x, y, z]) => keyOf(x, y, z)));
  const components: Voxel[][] = [];
  for (const start of occupied) {
    const startKey = keyOf(start[0], start[1], start[2]);
    if (!remaining.has(startKey)) continue;
    remaining.delete(startKey);
    const component: Voxel[] = [start];
    for (let index = 0; index < component.length; index += 1) {
      const [x, y, z] = component[index];
      for (const [dx, dy, dz] of N26) {
        const next: Voxel = [x + dx, y + dy, z + dz];
        const key = keyOf(next[0], next[1], next[2]);
        if (!remaining.has(key)) continue;
        remaining.delete(key);
        component.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

/** Close each 26-connected occupied component on its own, then union the results. */
export function componentClose(occupied: Voxel[], radius: number): Voxel[] {
  const union = new Map<string, Voxel>();
  for (const component of occupiedComponents(occupied)) {
    for (const cell of morphologicalClose(component, radius)) union.set(keyOf(cell[0], cell[1], cell[2]), cell);
  }
  return [...union.values()];
}

/**
 * Occupied-bounds cells within `radius` of the mass, plus enclosed voids farther inside.
 * This keeps a local field around the form and does not bridge distant masses.
 * The band still includes nearby exterior air. It is not a room.
 */
export function proximityEnvelope(occupied: Voxel[], radius: number): Voxel[] {
  const box = boxCells(occupied);
  const occupiedKeys = new Set(occupied.map(([x, y, z]) => keyOf(x, y, z)));
  const near = dilation(occupied, radius);
  const bounds = boundsOf(box);
  const pad = {
    minX: bounds.minX - 1,
    minY: bounds.minY - 1,
    minZ: bounds.minZ - 1,
    maxX: bounds.maxX + 1,
    maxY: bounds.maxY + 1,
    maxZ: bounds.maxZ + 1,
  };
  const seen = new Set<string>();
  const queue: Voxel[] = [];
  const push = (x: number, y: number, z: number) => {
    if (x < pad.minX || y < pad.minY || z < pad.minZ || x > pad.maxX || y > pad.maxY || z > pad.maxZ) return;
    const key = keyOf(x, y, z);
    if (occupiedKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    queue.push([x, y, z]);
  };
  for (let x = pad.minX; x <= pad.maxX; x += 1) {
    for (let y = pad.minY; y <= pad.maxY; y += 1) {
      push(x, y, pad.minZ);
      push(x, y, pad.maxZ);
    }
  }
  for (let x = pad.minX; x <= pad.maxX; x += 1) {
    for (let z = pad.minZ; z <= pad.maxZ; z += 1) {
      push(x, pad.minY, z);
      push(x, pad.maxY, z);
    }
  }
  for (let y = pad.minY; y <= pad.maxY; y += 1) {
    for (let z = pad.minZ; z <= pad.maxZ; z += 1) {
      push(pad.minX, y, z);
      push(pad.maxX, y, z);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y, z] = queue[index];
    for (const [dx, dy, dz] of SIX) push(x + dx, y + dy, z + dz);
  }
  const union = new Map<string, Voxel>();
  for (const [key, distance] of near) {
    if (distance > radius) continue;
    const cell = parseKey(key);
    if (cell[0] < bounds.minX || cell[1] < bounds.minY || cell[2] < bounds.minZ || cell[0] > bounds.maxX || cell[1] > bounds.maxY || cell[2] > bounds.maxZ) continue;
    union.set(key, cell);
  }
  for (const cell of box) {
    const key = keyOf(cell[0], cell[1], cell[2]);
    if (!occupiedKeys.has(key) && !seen.has(key)) union.set(key, cell);
  }
  return [...union.values()];
}

function hitsOccupied(
  occupied: Set<string>,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  bounds: ReturnType<typeof boundsOf>,
) {
  let cx = x + dx;
  let cy = y + dy;
  let cz = z + dz;
  while (cx >= bounds.minX && cy >= bounds.minY && cz >= bounds.minZ && cx <= bounds.maxX && cy <= bounds.maxY && cz <= bounds.maxZ) {
    if (occupied.has(keyOf(cx, cy, cz))) return true;
    cx += dx;
    cy += dy;
    cz += dz;
  }
  return false;
}

function betweenSurfaces(occupied: Set<string>, cell: Voxel, bounds: ReturnType<typeof boundsOf>) {
  const hits: Voxel[] = [];
  for (const [dx, dy, dz] of N26) {
    if (hitsOccupied(occupied, cell[0], cell[1], cell[2], dx, dy, dz, bounds)) hits.push([dx, dy, dz]);
  }
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const dot = hits[i][0] * hits[j][0] + hits[i][1] * hits[j][1] + hits[i][2] * hits[j][2];
      if (dot <= 0) return true;
    }
  }
  return false;
}

function studyFromEnvelope(kind: EnvelopeKind, radius: number, occupied: Voxel[], envelopeCells: Voxel[]): EnvelopeStudy {
  const occupiedKeys = new Set(occupied.map(([x, y, z]) => keyOf(x, y, z)));
  const envelopeKeys = new Set(envelopeCells.map(([x, y, z]) => keyOf(x, y, z)));
  const freeCells = envelopeCells.filter(([x, y, z]) => !occupiedKeys.has(keyOf(x, y, z)));
  const bounds = boundsOf(envelopeCells.length ? envelopeCells : occupied);
  const pad = {
    minX: bounds.minX - 1,
    minY: bounds.minY - 1,
    minZ: bounds.minZ - 1,
    maxX: bounds.maxX + 1,
    maxY: bounds.maxY + 1,
    maxZ: bounds.maxZ + 1,
  };
  const seen = new Set<string>();
  const queue: Voxel[] = [];
  const push = (x: number, y: number, z: number) => {
    if (x < pad.minX || y < pad.minY || z < pad.minZ || x > pad.maxX || y > pad.maxY || z > pad.maxZ) return;
    const key = keyOf(x, y, z);
    if (occupiedKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    queue.push([x, y, z]);
  };
  for (let x = pad.minX; x <= pad.maxX; x += 1) {
    for (let y = pad.minY; y <= pad.maxY; y += 1) {
      push(x, y, pad.minZ);
      push(x, y, pad.maxZ);
    }
  }
  for (let x = pad.minX; x <= pad.maxX; x += 1) {
    for (let z = pad.minZ; z <= pad.maxZ; z += 1) {
      push(x, pad.minY, z);
      push(x, pad.maxY, z);
    }
  }
  for (let y = pad.minY; y <= pad.maxY; y += 1) {
    for (let z = pad.minZ; z <= pad.maxZ; z += 1) {
      push(pad.minX, y, z);
      push(pad.maxX, y, z);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y, z] = queue[index];
    for (const [dx, dy, dz] of SIX) push(x + dx, y + dy, z + dz);
  }
  let exteriorFree = 0;
  let enclosedFree = 0;
  let interstitial = 0;
  for (const cell of freeCells) {
    const insideFlood = seen.has(keyOf(cell[0], cell[1], cell[2]));
    if (insideFlood) {
      exteriorFree += 1;
      if (betweenSurfaces(occupiedKeys, cell, bounds)) interstitial += 1;
    } else enclosedFree += 1;
  }
  const remaining = new Set(freeCells.map(([x, y, z]) => keyOf(x, y, z)));
  let regions = 0;
  let largestRegion = 0;
  for (const start of freeCells) {
    const startKey = keyOf(start[0], start[1], start[2]);
    if (!remaining.has(startKey)) continue;
    remaining.delete(startKey);
    const component = [start];
    for (let index = 0; index < component.length; index += 1) {
      const [x, y, z] = component[index];
      for (const [dx, dy, dz] of SIX) {
        const key = keyOf(x + dx, y + dy, z + dz);
        if (!remaining.has(key) || !envelopeKeys.has(key) || occupiedKeys.has(key)) continue;
        remaining.delete(key);
        component.push([x + dx, y + dy, z + dz]);
      }
    }
    regions += 1;
    largestRegion = Math.max(largestRegion, component.length);
  }
  return {
    kind,
    radius: kind === "box" ? 0 : radius,
    occupied: occupied.length,
    envelope: envelopeCells.length,
    candidateFree: freeCells.length,
    exteriorFree,
    enclosedFree,
    interstitial,
    regions,
    largestRegion,
    candidateRatio: envelopeCells.length ? Math.round((freeCells.length / envelopeCells.length) * 1000) / 10 : 0,
    envelopeCells,
    freeCells,
  };
}

export function envelopeStudy(occupied: Voxel[], kind: EnvelopeKind, radius = 1, clampMax = 3): EnvelopeStudy {
  const safeRadius = Math.max(1, Math.min(clampMax, Math.round(radius)));
  const envelope = kind === "shrink-wrap"
    ? morphologicalClose(occupied, safeRadius)
    : kind === "component"
      ? componentClose(occupied, safeRadius)
      : kind === "proximity"
        ? proximityEnvelope(occupied, safeRadius)
        : boxCells(occupied);
  return studyFromEnvelope(kind, safeRadius, occupied, envelope);
}
