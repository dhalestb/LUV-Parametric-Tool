/**
 * v4 vertical voids: plan columns whose free vertical interval passes more than
 * one detected level. Interior voids are distinguished from exterior columns by
 * lateral enclosure measured with horizontal mesh rays at mid-height.
 */
import { horizontalDirections, type TriangleGrid, type Vec3 } from "./geometry";
import { cellKey, EXTERIOR_ENCLOSURE_MAX, VOID_ENCLOSURE_MIN, type FloorField, type Level } from "./surfaces";

/** Clearance above a level's floor that the free interval must include to "pass" the level. */
export const VOID_PASS_HEIGHT_FEET = 1;
/** Smallest plan area for a void component to count. */
export const MIN_VOID_AREA = 16;
/** Reference void area at which continuity credit saturates (an 8 ft × 8 ft shaft). */
export const VOID_REFERENCE_AREA = 64;

export type VoidColumn = {
  ix: number;
  iy: number;
  x: number;
  y: number;
  /** Bottom of the free interval (a floor or the lowest surface). */
  bottomZ: number;
  /** Top of the free interval; null when open to the sky. */
  topZ: number | null;
  levelIds: number[];
};

export type VoidComponent = {
  id: number;
  columns: VoidColumn[];
  area: number;
  levelIds: number[];
  centroid: Vec3;
  bottomZ: number;
  topZ: number | null;
  enclosure: number;
  status: "interior" | "uncertain" | "exterior";
  openToSky: boolean;
};

export type VoidResult = {
  components: VoidComponent[];
  interior: VoidComponent[];
  /** Best interior continuity credit 0–1 (area credit × level span fraction). Null with fewer than two levels. */
  continuity: number | null;
  dominant: VoidComponent | null;
};

export function analyzeVoids(field: FloorField, grid: TriangleGrid, planDiagonal: number): VoidResult {
  const levels = [...field.levels].sort((left, right) => left.elevation - right.elevation);
  if (levels.length < 2) return { components: [], interior: [], continuity: null, dominant: null };
  const columns: VoidColumn[] = [];
  for (const column of field.columns) {
    // Candidate free intervals: between consecutive hits and above the last hit.
    for (let index = 0; index < column.hits.length; index += 1) {
      const bottom = column.hits[index].z;
      const top = column.hits[index + 1]?.z ?? null;
      const passed = levels.filter((level) => {
        const probe = level.elevation + VOID_PASS_HEIGHT_FEET;
        return probe > bottom - 0.5 && (top === null || probe < top);
      });
      if (passed.length < 2) continue;
      columns.push({ ix: column.ix, iy: column.iy, x: column.x, y: column.y, bottomZ: bottom, topZ: top, levelIds: passed.map((level) => level.id) });
    }
  }
  const components = clusterColumns(columns, field, levels, grid, planDiagonal);
  const interior = components.filter((component) => component.status === "interior");
  let dominant: VoidComponent | null = null;
  let continuity = 0;
  for (const component of interior) {
    const credit = Math.min(1, component.area / VOID_REFERENCE_AREA) * ((component.levelIds.length - 1) / (levels.length - 1));
    if (credit > continuity || (credit === continuity && dominant && component.area > dominant.area)) {
      continuity = credit;
      dominant = component;
    }
  }
  return { components, interior, continuity, dominant };
}

function clusterColumns(columns: VoidColumn[], field: FloorField, levels: Level[], grid: TriangleGrid, planDiagonal: number): VoidComponent[] {
  const byCell = new Map<string, VoidColumn[]>();
  for (const column of columns) (byCell.get(cellKey(column.ix, column.iy)) ?? byCell.set(cellKey(column.ix, column.iy), []).get(cellKey(column.ix, column.iy))!).push(column);
  const assigned = new Set<VoidColumn>();
  const components: VoidComponent[] = [];
  const directions = horizontalDirections(8);
  const sameSpan = (a: VoidColumn, b: VoidColumn) => a.levelIds.length === b.levelIds.length && a.levelIds.every((id, index) => id === b.levelIds[index]);
  for (const start of columns) {
    if (assigned.has(start)) continue;
    const members: VoidColumn[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length) {
      const current = stack.pop() as VoidColumn;
      members.push(current);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const other of byCell.get(cellKey(current.ix + dx, current.iy + dy)) ?? []) {
          if (assigned.has(other) || !sameSpan(current, other)) continue;
          assigned.add(other);
          stack.push(other);
        }
      }
    }
    const area = members.length * field.sampleFeet * field.sampleFeet;
    if (area < MIN_VOID_AREA) continue;
    const cx = members.reduce((sum, column) => sum + column.x, 0) / members.length;
    const cy = members.reduce((sum, column) => sum + column.y, 0) / members.length;
    const bottomZ = Math.min(...members.map((column) => column.bottomZ));
    const openToSky = members.some((column) => column.topZ === null);
    const topZ = openToSky ? null : Math.max(...members.map((column) => column.topZ as number));
    const spanLevels = start.levelIds.map((id) => levels.find((level) => level.id === id) as Level);
    const midZ = (spanLevels[0].elevation + spanLevels[spanLevels.length - 1].elevation) / 2 + VOID_PASS_HEIGHT_FEET;
    let blocked = 0;
    for (const direction of directions) {
      if (grid.raycast([cx, cy, midZ], direction, planDiagonal + 2)) blocked += 1;
    }
    const enclosure = blocked / directions.length;
    components.push({
      id: components.length,
      columns: members,
      area,
      levelIds: [...start.levelIds],
      centroid: [cx, cy, midZ],
      bottomZ,
      topZ,
      enclosure,
      status: enclosure >= VOID_ENCLOSURE_MIN ? "interior" : enclosure < EXTERIOR_ENCLOSURE_MAX ? "exterior" : "uncertain",
      openToSky,
    });
  }
  return components;
}
