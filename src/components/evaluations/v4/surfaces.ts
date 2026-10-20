/**
 * v4 floor surfaces, clearance classes, and architectural levels.
 *
 * A regular plan grid of vertical lines is intersected with the original mesh.
 * Every upward-facing intersection is a standing point on an actual floor
 * surface. The next intersection above it gives the clearance; horizontal rays
 * at the clearance band give lateral enclosure. Nothing here is voxelized.
 */
import { horizontalDirections, type AnalysisMesh, type TriangleGrid, type Vec3 } from "./geometry";

/** Plan spacing of floor columns. Each sample represents SAMPLE_FEET² of floor. */
export const SAMPLE_FEET = 1;
/** Triangles facing within about 47° of vertical count as floor surfaces. Same as v3.5 clearance. */
export const UPWARD_NORMAL = 0.68;
/** Clearance at or below this height is not usable standing space. */
export const CLEARANCE_MIN_FEET = 5;
/** Clearance credit reaches 1 here. */
export const CLEARANCE_REFERENCE_FEET = 10;
/** Standing points with less than this above them are slab interiors or sliver gaps, not floors. */
export const SLAB_GAP_FEET = 1;
/** Floor samples within this distance of the form top are roof surfaces. */
export const ROOF_BAND_FEET = 1.5;
/** Height above a floor sample where lateral enclosure is tested. */
export const ENCLOSURE_PROBE_FEET = 5;
export const ENCLOSURE_RAYS = 8;
/** Lateral enclosure at or above this is an interior void open to the sky. */
export const VOID_ENCLOSURE_MIN = 0.5;
/** Lateral enclosure below this is exterior exposure. Between the two is uncertain. */
export const EXTERIOR_ENCLOSURE_MAX = 0.25;
/** Levels merge floor samples within this vertical tolerance. */
export const LEVEL_TOLERANCE_FEET = 1.5;
/** Smallest floor area that counts as an interior architectural level. */
export const MIN_LEVEL_AREA = 16;
/**
 * Smallest projecting surface that can be a future connection interface.
 * Kept below the interior-level threshold so a narrow branch is not discarded
 * for failing to be a floor.
 */
export const MIN_INTERFACE_AREA = 4;

export type FloorClass = "obstructed" | "sheltered" | "openVoid" | "exposed" | "uncertain";

export type FloorSample = {
  id: number;
  /** Plan grid indices. */
  ix: number;
  iy: number;
  position: Vec3;
  triangleId: number;
  /** Feet to the first surface above, or null when nothing is above. */
  clearance: number | null;
  overheadTriangleId: number | null;
  /** Fraction of horizontal probe rays that hit geometry. Null when not probed. */
  enclosure: number | null;
  floorClass: FloorClass;
  /** Set after levels are built. -1 when the sample is not on a counted level. */
  levelId: number;
  /** Something exists below this sample (deeper than the slab gap). */
  supported: boolean;
  /**
   * True when this uncovered sample is only the topside of a ceiling (a roof cap),
   * not an occupiable deck or perimeter branch.
   */
  roofLid: boolean;
  area: number;
};

/** A projecting floor strip that can meet another form later. Not a verified stair. */
export type PerimeterBranch = {
  id: number;
  levelId: number;
  elevation: number;
  area: number;
  centroid: Vec3;
  sampleIds: number[];
  tips: Vec3[];
  upper: boolean;
  /**
   * True when this interface is not part of a counted interior level.
   * It is a connection opportunity only, not an additional floor.
   */
  independent: boolean;
};

export type Level = {
  id: number;
  /** Area-weighted mean elevation in feet. */
  elevation: number;
  minZ: number;
  maxZ: number;
  area: number;
  areaByClass: Record<FloorClass, number>;
  sampleIds: number[];
  /** Area-weighted plan centroid. */
  centroid: Vec3;
};

export type ColumnRecord = {
  ix: number;
  iy: number;
  x: number;
  y: number;
  /** Every intersection with the mesh along the column, ascending z. */
  hits: Array<{ z: number; triangleId: number; normalZ: number }>;
};

export type FloorField = {
  sampleFeet: number;
  gridOrigin: [number, number];
  gridDims: [number, number];
  columns: ColumnRecord[];
  samples: FloorSample[];
  levels: Level[];
  /** Index of a sample by plan grid cell + level. */
  byCell: Map<string, FloorSample[]>;
  areaByClass: Record<FloorClass, number>;
  /** Area counted as floor for shares (everything except exposed roof caps). */
  interiorArea: number;
  /** Occupiable uncovered decks that are not roof caps. */
  deckArea: number;
  /** Topside-of-ceiling samples excluded from levels. */
  roofLidArea: number;
  /** Projecting perimeter floor strips, including upper-level connection opportunities. */
  branches: PerimeterBranch[];
  /**
   * Sheltered floor below the interior-level threshold that does not project.
   * Reported for review. Not a level and not a connection interface.
   */
  belowLevelInteriorArea: number;
};

export const emptyClassAreas = (): Record<FloorClass, number> => ({ obstructed: 0, sheltered: 0, openVoid: 0, exposed: 0, uncertain: 0 });

/** 0 at or below the 5 ft gate, rising linearly to 1 at 10 ft. Null (nothing above) is 1. */
export function clearanceCredit(clearance: number | null) {
  if (clearance === null) return 1;
  if (clearance <= CLEARANCE_MIN_FEET) return 0;
  return Math.min(1, (clearance - CLEARANCE_MIN_FEET) / (CLEARANCE_REFERENCE_FEET - CLEARANCE_MIN_FEET));
}

export const cellKey = (ix: number, iy: number) => `${ix}:${iy}`;

export function sampleFloors(mesh: AnalysisMesh, grid: TriangleGrid, sampleFeet = SAMPLE_FEET): FloorField {
  const { min, max } = mesh.bounds;
  const gridOrigin: [number, number] = [min[0], min[1]];
  const dims: [number, number] = [
    Math.max(1, Math.ceil((max[0] - min[0]) / sampleFeet)),
    Math.max(1, Math.ceil((max[1] - min[1]) / sampleFeet)),
  ];
  const columns: ColumnRecord[] = [];
  const samples: FloorSample[] = [];
  const byCell = new Map<string, FloorSample[]>();
  const probeDirections = horizontalDirections(ENCLOSURE_RAYS);
  const probeDistance = mesh.bounds.planDiagonal + 2;
  const topZ = max[2];
  const area = sampleFeet * sampleFeet;

  for (let ix = 0; ix < dims[0]; ix += 1) {
    for (let iy = 0; iy < dims[1]; iy += 1) {
      const x = gridOrigin[0] + (ix + 0.5) * sampleFeet;
      const y = gridOrigin[1] + (iy + 0.5) * sampleFeet;
      const intersections = grid.verticalIntersections(x, y);
      if (!intersections.length) continue;
      const hits = intersections.map((hit) => ({ z: hit.z, triangleId: hit.triangleId, normalZ: hit.normalZ }));
      columns.push({ ix, iy, x, y, hits });
      for (let index = 0; index < hits.length; index += 1) {
        const hit = hits[index];
        // Winding-independent: OBJ face orientation is not reliable, so a near-horizontal
        // surface counts as a floor candidate either way. Slab undersides are removed by
        // the SLAB_GAP test below (the top face sits within the slab thickness above).
        if (Math.abs(hit.normalZ) < UPWARD_NORMAL) continue;
        const above = hits[index + 1] ?? null;
        const clearance = above ? above.z - hit.z : null;
        if (clearance !== null && clearance < SLAB_GAP_FEET) continue;
        const supported = hits.some((other, otherIndex) => otherIndex < index && other.z < hit.z - SLAB_GAP_FEET);
        const sample: FloorSample = {
          id: samples.length,
          ix,
          iy,
          position: [x, y, hit.z],
          triangleId: hit.triangleId,
          clearance,
          overheadTriangleId: above?.triangleId ?? null,
          enclosure: null,
          floorClass: "obstructed",
          levelId: -1,
          supported,
          roofLid: false,
          area,
        };
        if (clearance !== null && clearance <= CLEARANCE_MIN_FEET) {
          sample.floorClass = "obstructed";
        } else if (clearance !== null) {
          sample.floorClass = "sheltered";
        } else if (hit.z >= topZ - ROOF_BAND_FEET) {
          sample.floorClass = "exposed";
          sample.enclosure = 0;
        } else {
          const probeZ = hit.z + ENCLOSURE_PROBE_FEET;
          let blocked = 0;
          for (const direction of probeDirections) {
            if (grid.raycast([x, y, probeZ], direction, probeDistance, { skipTriangle: hit.triangleId })) blocked += 1;
          }
          const enclosure = blocked / probeDirections.length;
          sample.enclosure = enclosure;
          sample.floorClass = enclosure >= VOID_ENCLOSURE_MIN ? "openVoid" : enclosure < EXTERIOR_ENCLOSURE_MAX ? "exposed" : "uncertain";
        }
        samples.push(sample);
        const key = cellKey(ix, iy);
        const list = byCell.get(key) ?? [];
        list.push(sample);
        byCell.set(key, list);
      }
    }
  }

  markRoofLids(samples, byCell, max[2]);
  const levels = buildLevels(samples, byCell, max[2]);
  const branches = [
    ...detectPerimeterBranches(samples, levels),
    ...detectIndependentInterfaces(samples),
  ].map((branch, index) => ({ ...branch, id: index }));
  const belowLevelInteriorArea = shelteredBelowLevel(samples);
  const areaByClass = emptyClassAreas();
  let roofLidArea = 0;
  let deckArea = 0;
  for (const sample of samples) {
    areaByClass[sample.floorClass] += sample.area;
    if (sample.roofLid) roofLidArea += sample.area;
    else if (sample.floorClass === "exposed" && sample.levelId >= 0) deckArea += sample.area;
  }
  const interiorArea = areaByClass.obstructed + areaByClass.sheltered + areaByClass.openVoid + areaByClass.uncertain;
  return { sampleFeet, gridOrigin, gridDims: dims, columns, samples, levels, byCell, areaByClass, interiorArea, deckArea, roofLidArea, branches, belowLevelInteriorArea };
}

/**
 * An uncovered sample is a roof cap (not a floor) when it is the overhead of a
 * lower occupiable sample in the same column. Upper clusters that still have a
 * substantial extra footprint, or that sit well below the mesh top, are decks
 * and keep those samples occupiable.
 */
function isColumnLid(sample: FloorSample, column: FloorSample[]): boolean {
  if (sample.clearance !== null) return false;
  if (sample.floorClass !== "exposed" && sample.floorClass !== "uncertain") return false;
  return column.some((lower) => {
    if (lower.id === sample.id) return false;
    if (lower.position[2] >= sample.position[2] - SLAB_GAP_FEET) return false;
    if (lower.floorClass !== "sheltered" && lower.floorClass !== "openVoid" && lower.floorClass !== "uncertain") return false;
    if (lower.clearance === null) return false;
    return Math.abs(lower.position[2] + lower.clearance - sample.position[2]) <= SLAB_GAP_FEET + 0.05;
  });
}

function markRoofLids(samples: FloorSample[], byCell: Map<string, FloorSample[]>, topZ: number) {
  const sorted = [...samples.filter((sample) => sample.floorClass !== "obstructed")].sort((left, right) => left.position[2] - right.position[2] || left.id - right.id);
  const clusters: FloorSample[][] = [];
  for (const sample of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && sample.position[2] - current[current.length - 1].position[2] <= LEVEL_TOLERANCE_FEET) current.push(sample);
    else clusters.push([sample]);
  }
  clusters.forEach((cluster, clusterIndex) => {
    if (clusterIndex === 0) return;
    const meanZ = cluster.reduce((sum, sample) => sum + sample.position[2], 0) / cluster.length;
    const nearTop = meanZ >= topZ - ROOF_BAND_FEET * 2;
    let extraArea = 0;
    let lidArea = 0;
    let interiorArea = 0;
    const flags = cluster.map((sample) => {
      const column = byCell.get(cellKey(sample.ix, sample.iy)) ?? [];
      const lid = isColumnLid(sample, column);
      if (sample.floorClass === "sheltered" || sample.floorClass === "openVoid") interiorArea += sample.area;
      else if (lid) lidArea += sample.area;
      else extraArea += sample.area;
      return lid;
    });
    // A full covering plate at the mesh top with no leftover occupiable footprint is a roof, not a storey.
    const coverCap = nearTop && extraArea < MIN_LEVEL_AREA && interiorArea < MIN_LEVEL_AREA && lidArea >= MIN_LEVEL_AREA;
    cluster.forEach((sample, index) => {
      sample.roofLid = coverCap && flags[index];
    });
  });
}

/**
 * Cluster occupiable floor samples by elevation. Gaps larger than
 * LEVEL_TOLERANCE_FEET separate levels; clusters under MIN_LEVEL_AREA are not
 * levels. Roof caps are excluded. Uncovered decks, mezzanines, and perimeter
 * branches are levels even when no stair connects them.
 */
export function buildLevels(samples: FloorSample[], byCell: Map<string, FloorSample[]> = new Map(), topZ = Infinity): Level[] {
  const sorted = [...samples.filter((sample) => sample.floorClass !== "obstructed")].sort((left, right) => left.position[2] - right.position[2] || left.id - right.id);
  const clusters: FloorSample[][] = [];
  for (const sample of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && sample.position[2] - current[current.length - 1].position[2] <= LEVEL_TOLERANCE_FEET) current.push(sample);
    else clusters.push([sample]);
  }
  const levels: Level[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const counted = cluster.filter((sample) => {
      if (clusterIndex === 0) return true;
      return !sample.roofLid;
    });
    const area = counted.reduce((sum, sample) => sum + sample.area, 0);
    if (area < MIN_LEVEL_AREA) return;
    const level: Level = {
      id: levels.length,
      elevation: counted.reduce((sum, sample) => sum + sample.position[2] * sample.area, 0) / area,
      minZ: Math.min(...counted.map((sample) => sample.position[2])),
      maxZ: Math.max(...counted.map((sample) => sample.position[2])),
      area,
      areaByClass: emptyClassAreas(),
      sampleIds: counted.map((sample) => sample.id),
      centroid: [0, 0, 0],
    };
    for (const sample of counted) {
      sample.levelId = level.id;
      level.areaByClass[sample.floorClass] += sample.area;
      level.centroid[0] += sample.position[0] * sample.area;
      level.centroid[1] += sample.position[1] * sample.area;
    }
    level.centroid = [level.centroid[0] / area, level.centroid[1] / area, level.elevation];
    levels.push(level);
  });
  return levels;
}

function detectPerimeterBranches(samples: FloorSample[], levels: Level[]): PerimeterBranch[] {
  const lowest = levels.length ? levels.reduce((low, level) => (level.elevation < low.elevation ? level : low)).id : -1;
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  const branches: PerimeterBranch[] = [];
  for (const level of levels) {
    const cells = new Set<string>();
    const at = new Map<string, FloorSample>();
    for (const id of level.sampleIds) {
      const sample = byId.get(id);
      if (!sample || sample.roofLid) continue;
      const key = cellKey(sample.ix, sample.iy);
      cells.add(key);
      at.set(key, sample);
    }
    let core = new Set(cells);
    for (let step = 0; step < 2; step += 1) {
      const next = new Set<string>();
      for (const key of core) {
        const [ix, iy] = key.split(":").map(Number);
        const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        if (ortho.every(([dx, dy]) => core.has(cellKey(ix + dx, iy + dy)))) next.add(key);
      }
      core = next;
    }
    const fringeList = [...cells].filter((key) => !core.has(key)).sort((left, right) => left.localeCompare(right));
    const fringe = new Set(fringeList);
    const assigned = new Set<string>();
    for (const start of fringeList) {
      if (assigned.has(start)) continue;
      const keys: string[] = [];
      const stack = [start];
      assigned.add(start);
      while (stack.length) {
        const current = stack.pop() as string;
        keys.push(current);
        const [ix, iy] = current.split(":").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const next = cellKey(ix + dx, iy + dy);
          if (assigned.has(next) || !fringe.has(next)) continue;
          assigned.add(next);
          stack.push(next);
        }
      }
      const members = keys.map((key) => at.get(key)).filter((sample): sample is FloorSample => !!sample);
      const area = members.reduce((sum, sample) => sum + sample.area, 0);
      if (area < MIN_INTERFACE_AREA || members.length < 2) continue;
      const tips = members.filter((sample) => {
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => cells.has(cellKey(sample.ix + dx, sample.iy + dy))).length;
        return n <= 1;
      });
      const centroid: Vec3 = [
        members.reduce((sum, sample) => sum + sample.position[0], 0) / members.length,
        members.reduce((sum, sample) => sum + sample.position[1], 0) / members.length,
        level.elevation,
      ];
      branches.push({
        id: branches.length,
        levelId: level.id,
        elevation: level.elevation,
        area,
        centroid,
        sampleIds: members.map((sample) => sample.id),
        tips: (tips.length ? tips : members.slice(0, 4)).map((sample) => sample.position),
        upper: level.id !== lowest,
        independent: false,
      });
    }
  }
  return branches;
}

const ORTHO: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGHBOURS_8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Occupiable surfaces that missed the interior-level threshold. A projecting
 * deck of at least MIN_INTERFACE_AREA is a connection interface. A sheltered
 * pocket that does not project is neither a level nor an interface.
 */
function detectIndependentInterfaces(samples: FloorSample[]): PerimeterBranch[] {
  const loose = samples.filter((sample) => sample.levelId < 0 && !sample.roofLid && sample.floorClass !== "obstructed");
  const byKey = new Map<string, FloorSample[]>();
  for (const sample of loose) {
    const key = cellKey(sample.ix, sample.iy);
    const list = byKey.get(key) ?? [];
    list.push(sample);
    byKey.set(key, list);
  }
  const assigned = new Set<number>();
  const branches: PerimeterBranch[] = [];
  const ordered = [...loose].sort((left, right) => left.id - right.id);
  for (const start of ordered) {
    if (assigned.has(start.id)) continue;
    const members: FloorSample[] = [];
    const stack = [start];
    assigned.add(start.id);
    while (stack.length) {
      const current = stack.pop() as FloorSample;
      members.push(current);
      for (const [dx, dy] of NEIGHBOURS_8) {
        for (const other of byKey.get(cellKey(current.ix + dx, current.iy + dy)) ?? []) {
          if (assigned.has(other.id)) continue;
          if (Math.abs(other.position[2] - current.position[2]) > LEVEL_TOLERANCE_FEET) continue;
          assigned.add(other.id);
          stack.push(other);
        }
      }
    }
    const area = members.reduce((sum, sample) => sum + sample.area, 0);
    if (area < MIN_INTERFACE_AREA) continue;
    const projecting = members.reduce((sum, sample) => sum + (sample.floorClass === "exposed" || sample.floorClass === "uncertain" ? sample.area : 0), 0);
    const cells = new Set(members.map((sample) => cellKey(sample.ix, sample.iy)));
    const tips = members.filter((sample) => ORTHO.filter(([dx, dy]) => cells.has(cellKey(sample.ix + dx, sample.iy + dy))).length <= 1);
    if (projecting < MIN_INTERFACE_AREA) continue;
    const elevation = members.reduce((sum, sample) => sum + sample.position[2] * sample.area, 0) / area;
    branches.push({
      id: branches.length,
      levelId: -1,
      elevation,
      area,
      centroid: [
        members.reduce((sum, sample) => sum + sample.position[0], 0) / members.length,
        members.reduce((sum, sample) => sum + sample.position[1], 0) / members.length,
        elevation,
      ],
      sampleIds: members.map((sample) => sample.id),
      tips: (tips.length ? tips : members.slice(0, 4)).map((sample) => sample.position),
      upper: true,
      independent: true,
    });
  }
  return branches;
}

function shelteredBelowLevel(samples: FloorSample[]) {
  return samples.reduce((sum, sample) => {
    if (sample.levelId >= 0 || sample.roofLid) return sum;
    if (sample.floorClass !== "sheltered" && sample.floorClass !== "openVoid") return sum;
    return sum + sample.area;
  }, 0);
}

/** Percentile of clearance among sheltered samples. Null when none. */
export function clearancePercentile(samples: FloorSample[], fraction: number): number | null {
  const values = samples
    .filter((sample) => sample.floorClass === "sheltered" && sample.clearance !== null)
    .map((sample) => sample.clearance as number)
    .sort((left, right) => left - right);
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.floor(fraction * (values.length - 1)))];
}
