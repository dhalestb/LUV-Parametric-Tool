/**
 * Continuous field void: the largest 4-connected run of qualifying clear floor.
 * Neighbours must share a plan edge and stay on the same occupied plate.
 * Disconnected pockets at the same elevation are not merged.
 */
import { CHEST_HEIGHT_FEET } from "./circulation";
import type { TriangleGrid } from "./geometry";
import { LEVEL_TOLERANCE_FEET, SAMPLE_FEET, type FloorSample } from "./surfaces";

const ORTHO: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const VOLUME_CLEAR_CAP_FEET = 20;

export type ContinuousField = {
  sampleIds: number[];
  samples: FloorSample[];
  floorAreaFt2: number;
  clearVolumeFt3: number;
};

export type ContinuousFieldResult = {
  field: ContinuousField | null;
  pockets: ContinuousField[];
  qualifyingFloorFt2: number;
  qualifyingVolumeFt3: number;
  fieldShare: number | null;
  notes: string[];
};

function sampleVolume(sample: FloorSample) {
  return sample.area * Math.min(VOLUME_CLEAR_CAP_FEET, sample.clearance ?? VOLUME_CLEAR_CAP_FEET);
}

function packField(samples: FloorSample[]): ContinuousField {
  return {
    sampleIds: samples.map((sample) => sample.id),
    samples,
    floorAreaFt2: samples.reduce((sum, sample) => sum + sample.area, 0),
    clearVolumeFt3: samples.reduce((sum, sample) => sum + sampleVolume(sample), 0),
  };
}

function wallBetween(grid: TriangleGrid | undefined, a: FloorSample, b: FloorSample) {
  if (!grid) return false;
  const dx = b.position[0] - a.position[0];
  const dy = b.position[1] - a.position[1];
  const span = Math.hypot(dx, dy);
  if (span < 1e-6) return false;
  return Boolean(grid.raycast(
    [a.position[0], a.position[1], a.position[2] + CHEST_HEIGHT_FEET],
    [dx / span, dy / span, 0],
    span,
    { skipTriangle: a.triangleId },
  ));
}

function neighbours(samples: FloorSample[], grid: TriangleGrid | undefined, zTolerance = LEVEL_TOLERANCE_FEET) {
  const atCell = new Map<string, FloorSample[]>();
  for (const sample of samples) {
    const key = `${sample.ix}:${sample.iy}`;
    const list = atCell.get(key) ?? [];
    list.push(sample);
    atCell.set(key, list);
  }
  const links = new Map<number, number[]>();
  const add = (from: number, to: number) => {
    const list = links.get(from) ?? [];
    list.push(to);
    links.set(from, list);
  };
  for (const sample of samples) {
    for (const [dx, dy] of ORTHO) {
      for (const other of atCell.get(`${sample.ix + dx}:${sample.iy + dy}`) ?? []) {
        if (Math.abs(other.position[2] - sample.position[2]) > zTolerance) continue;
        if (wallBetween(grid, sample, other)) continue;
        add(sample.id, other.id);
      }
    }
  }
  return links;
}

/** Largest 4-connected qualifying field. Gaps, walls, and stacked plates stay separate. */
export function largestContinuousField(samples: FloorSample[], grid?: TriangleGrid, zTolerance = LEVEL_TOLERANCE_FEET): ContinuousFieldResult {
  const qualifyingFloorFt2 = samples.reduce((sum, sample) => sum + sample.area, 0);
  const qualifyingVolumeFt3 = samples.reduce((sum, sample) => sum + sampleVolume(sample), 0);
  if (!samples.length) {
    return {
      field: null,
      pockets: [],
      qualifyingFloorFt2: 0,
      qualifyingVolumeFt3: 0,
      fieldShare: null,
      notes: ["No qualifying clear floor was available, so a continuous field could not be established."],
    };
  }
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  const links = neighbours(samples, grid, zTolerance);
  const seen = new Set<number>();
  const pockets: ContinuousField[] = [];
  for (const start of samples) {
    if (seen.has(start.id)) continue;
    const members: FloorSample[] = [];
    const stack = [start.id];
    seen.add(start.id);
    while (stack.length) {
      const id = stack.pop() as number;
      const sample = byId.get(id);
      if (!sample) continue;
      members.push(sample);
      for (const next of links.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    pockets.push(packField(members));
  }
  pockets.sort((left, right) => {
    if (right.floorAreaFt2 !== left.floorAreaFt2) return right.floorAreaFt2 - left.floorAreaFt2;
    return (left.sampleIds[0] ?? 0) - (right.sampleIds[0] ?? 0);
  });
  const field = pockets[0] ?? null;
  const fieldShare = field && qualifyingFloorFt2 ? field.floorAreaFt2 / qualifyingFloorFt2 : null;
  const notes: string[] = [];
  if (!field) notes.push("Continuity could not be established from the recorded floor samples.");
  else if (pockets.length === 1) notes.push("Qualifying clear floor forms one continuous field.");
  else notes.push(`The counted field is the largest connected run, ${Math.round((fieldShare ?? 0) * 100)}% of qualifying clear floor. Disconnected qualifying floor is not counted.`);
  return { field, pockets, qualifyingFloorFt2, qualifyingVolumeFt3, fieldShare, notes };
}

export function fieldMetrics(result: ContinuousFieldResult) {
  const field = result.field;
  return {
    continuousFieldFloorFt2: field ? Number(field.floorAreaFt2.toFixed(2)) : 0,
    continuousFieldVolumeFt3: field ? Number(field.clearVolumeFt3.toFixed(2)) : 0,
    qualifyingClearFloorFt2: Number(result.qualifyingFloorFt2.toFixed(2)),
    continuousFieldShare: result.fieldShare === null ? null : Number(result.fieldShare.toFixed(4)),
    continuousFieldPockets: result.pockets.length,
    sampleFeet: SAMPLE_FEET,
  };
}
