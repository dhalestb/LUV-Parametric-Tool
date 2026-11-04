import type { AnalysisView } from "./analysisViewer";

export type DisplayRay = {
  origin: [number, number, number];
  end: [number, number, number];
  direction: [number, number, number];
  passed: boolean;
  color: string;
};

export type RayOutcome = "both" | "pass" | "block";

export const PERMEABILITY_DIRECTIONS = [
  { id: "+X", label: "+X", direction: [1, 0, 0] as [number, number, number] },
  { id: "-X", label: "−X", direction: [-1, 0, 0] as [number, number, number] },
  { id: "+Y", label: "+Y", direction: [0, 1, 0] as [number, number, number] },
  { id: "-Y", label: "−Y", direction: [0, -1, 0] as [number, number, number] },
  { id: "+Z", label: "+Z", direction: [0, 0, 1] as [number, number, number] },
  { id: "-Z", label: "−Z", direction: [0, 0, -1] as [number, number, number] },
];

/** How many passing and how many blocked rays to draw for each selected direction. */
export const RAY_SAMPLE_STEPS = [1, 2, 4];

function sameDirection(left: [number, number, number], right: [number, number, number]) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function byOrigin(left: DisplayRay, right: DisplayRay) {
  return left.origin[0] - right.origin[0]
    || left.origin[1] - right.origin[1]
    || left.origin[2] - right.origin[2];
}

/** Evenly spaced picks across a sorted list. The same count always selects the same rays. */
export function stridePick<T>(items: T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count === 1 || items.length === 1) return [items[Math.floor((items.length - 1) / 2)]];
  if (items.length <= count) return items.slice();
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const cursor = Math.round((index * (items.length - 1)) / (count - 1));
    picked.push(items[cursor]);
  }
  return picked;
}

/**
 * Representative permeability rays from the evaluator's recorded tests.
 * Sampling does not add, remove, or reweight any test in the score.
 */
export function samplePermeabilityRays(rays: DisplayRay[], options: {
  outcome: RayOutcome;
  directionId: string;
  perOutcome: number;
}) {
  const directions = options.directionId === "all"
    ? PERMEABILITY_DIRECTIONS
    : PERMEABILITY_DIRECTIONS.filter((item) => item.id === options.directionId);
  const shown: DisplayRay[] = [];
  for (const direction of directions) {
    const group = rays.filter((ray) => sameDirection(ray.direction, direction.direction)).sort(byOrigin);
    const passed = group.filter((ray) => ray.passed);
    const blocked = group.filter((ray) => !ray.passed);
    if (options.outcome !== "block") shown.push(...stridePick(passed, options.perOutcome));
    if (options.outcome !== "pass") shown.push(...stridePick(blocked, options.perOutcome));
  }
  return {
    shown,
    measured: rays.length,
    measuredPassed: rays.filter((ray) => ray.passed).length,
  };
}

export function slabAxis(view: AnalysisView | "technical"): 0 | 1 | 2 {
  if (view === "section-x") return 0;
  if (view === "section-y") return 1;
  return 2;
}

/**
 * A thin band of the measured cells.
 * This is a display slice. It does not merge cells into rooms or change which cells qualify.
 */
export function displaySlab<T extends { cell: [number, number, number] }>(cells: T[], axis: 0 | 1 | 2, t: number, thickness = 2): T[] {
  if (!cells.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const item of cells) {
    min = Math.min(min, item.cell[axis]);
    max = Math.max(max, item.cell[axis]);
  }
  const span = Math.max(0, max - min - thickness + 1);
  const start = min + Math.round(Math.min(1, Math.max(0, t)) * span);
  const end = start + thickness - 1;
  return cells.filter((item) => item.cell[axis] >= start && item.cell[axis] <= end);
}

/** Map a section offset, in feet, onto the 0–1 slab position for that axis. */
export function slabTFromOffset(sizeFeet: number, offsetFeet: number) {
  if (!Number.isFinite(sizeFeet) || sizeFeet <= 0) return 0.5;
  return Math.min(1, Math.max(0, 0.5 + offsetFeet / sizeFeet));
}

export type PassPlacement = "between" | "around" | "uncertain";

/**
 * A passing column is between surfaces when occupied columns bracket it on a perpendicular axis
 * and the nearer bracket is within three cells. A farther bracket is uncertain: the clear column
 * may be a wide hall or unused envelope air. A column that is not bracketed runs through envelope
 * air around the mass. This does not change the score and is not a circulation test.
 */
const NEAR_BRACKET_CELLS = 3;

type AuditedRay = {
  origin: [number, number, number];
  direction: [number, number, number];
  passed: boolean;
};

function columnKey(origin: [number, number, number]) {
  return `${origin[0]},${origin[1]},${origin[2]}`;
}

function walkToOccupied(
  origin: [number, number, number],
  axis: number,
  step: number,
  blocked: Set<string>,
  present: Set<string>,
) {
  const cursor: [number, number, number] = [origin[0], origin[1], origin[2]];
  let distance = 0;
  for (;;) {
    cursor[axis] += step;
    distance += 1;
    const key = columnKey(cursor);
    if (!present.has(key)) return { hit: false, distance };
    if (blocked.has(key)) return { hit: true, distance };
  }
}

export function classifyPassingRay(ray: AuditedRay, rays: AuditedRay[]): PassPlacement {
  const same = rays.filter((item) => item.direction[0] === ray.direction[0] && item.direction[1] === ray.direction[1] && item.direction[2] === ray.direction[2]);
  const present = new Set(same.map((item) => columnKey(item.origin)));
  const blocked = new Set(same.filter((item) => !item.passed).map((item) => columnKey(item.origin)));
  const axes = [0, 1, 2].filter((axis) => ray.direction[axis] === 0);
  let near = false;
  let far = false;
  for (const axis of axes) {
    const negative = walkToOccupied(ray.origin, axis, -1, blocked, present);
    const positive = walkToOccupied(ray.origin, axis, 1, blocked, present);
    if (!negative.hit || !positive.hit) continue;
    if (Math.min(negative.distance, positive.distance) <= NEAR_BRACKET_CELLS) near = true;
    else far = true;
  }
  if (near) return "between";
  if (far) return "uncertain";
  return "around";
}

export function permeabilityRayKey(ray: { origin: [number, number, number]; direction: [number, number, number] }) {
  return `${ray.direction.join(",")}:${ray.origin.join(",")}`;
}

/** One actual test: the middle between-surface pass, otherwise the middle pass, otherwise the middle test. */
export function highlightedPermeabilityRay<T extends AuditedRay>(rays: T[]): T | undefined {
  const passing = rays.filter((ray) => ray.passed);
  const between = passing.filter((ray) => classifyPassingRay(ray, rays) === "between");
  const pool = between.length ? between : passing.length ? passing : rays;
  const sorted = pool.slice().sort((left, right) => left.origin[0] - right.origin[0] || left.origin[1] - right.origin[1] || left.origin[2] - right.origin[2]);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export type DirectionAudit = {
  id: string;
  total: number;
  passed: number;
  rate: number;
  between: number;
  around: number;
  uncertain: number;
};

/** Directional rates and pass placement. The equal-weight mean is the permeability input. */
export function auditPermeability(rays: AuditedRay[]) {
  const directions: DirectionAudit[] = PERMEABILITY_DIRECTIONS.map((direction) => {
    const group = rays.filter((ray) => sameDirection(ray.direction, direction.direction));
    const passing = group.filter((ray) => ray.passed);
    const placed = passing.map((ray) => classifyPassingRay(ray, rays));
    return {
      id: direction.id,
      total: group.length,
      passed: passing.length,
      rate: group.length ? passing.length / group.length : 0,
      between: placed.filter((item) => item === "between").length,
      around: placed.filter((item) => item === "around").length,
      uncertain: placed.filter((item) => item === "uncertain").length,
    };
  });
  const passed = directions.reduce((sum, item) => sum + item.passed, 0);
  const total = directions.reduce((sum, item) => sum + item.total, 0);
  const equalWeight = directions.reduce((sum, item) => sum + item.rate, 0) / directions.length;
  return {
    directions,
    passed,
    total,
    pooled: total ? passed / total : 0,
    equalWeight,
    between: directions.reduce((sum, item) => sum + item.between, 0),
    around: directions.reduce((sum, item) => sum + item.around, 0),
    uncertain: directions.reduce((sum, item) => sum + item.uncertain, 0),
  };
}

/**
 * Exposed faces of the exact union of measured cells, in spec feet.
 * A face shared by two measured cells is omitted. No cell is added, removed, or moved.
 * The result is a presentation of that set, not a detected room.
 */
export function freeCellShell(
  cells: Array<[number, number, number]>,
  anchor: [number, number, number],
  cellFeet: number,
): number[] {
  const present = new Set(cells.map((cell) => `${cell[0]},${cell[1]},${cell[2]}`));
  const positions: number[] = [];
  const faces: Array<{ step: [number, number, number]; corners: Array<[number, number, number]> }> = [
    { step: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { step: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { step: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { step: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { step: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { step: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  for (const cell of cells) {
    for (const face of faces) {
      const neighbor = `${cell[0] + face.step[0]},${cell[1] + face.step[1]},${cell[2] + face.step[2]}`;
      if (present.has(neighbor)) continue;
      const corners = face.corners.map(([ox, oy, oz]) => [
        anchor[0] + (cell[0] + ox) * cellFeet,
        anchor[1] + (cell[1] + oy) * cellFeet,
        anchor[2] + (cell[2] + oz) * cellFeet,
      ]);
      for (const index of [0, 1, 2, 0, 2, 3]) positions.push(corners[index][0], corners[index][1], corners[index][2]);
    }
  }
  return positions;
}
