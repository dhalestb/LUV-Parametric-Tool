/**
 * Sequential massing layers: horizontal plates clustered by elevation.
 * A sequence is a regular, consistent order of those plates — not an occupiable route.
 */
import { coefficientOfVariation, surfaceCentroid } from "./formMeasures";
import type { AnalysisMesh, AnalysisTriangle, Vec3 } from "./geometry";

export const LAYER_GAP_FEET = 2.25;
export const MIN_LAYER_AREA = 12;
const PLATE_NZ = 0.5;
const FRAGMENT_CELL_FEET = 2.5;

export type MassingLayer = {
  index: number;
  elevation: number;
  area: number;
  centroid: Vec3;
  min: Vec3;
  max: Vec3;
  fragments: number;
  /** Area of the largest connected plate / layer area. 1 = one readable plate. */
  largestShare: number;
  triangles: AnalysisTriangle[];
};

export type SequenceTerms = {
  layerCount: number;
  regularity: number;
  consistency: number;
  progression: number;
  gaps: number[];
  pairArea: number[];
  pairOverlap: number[];
  pairDefinition: number[];
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function boundsOf(triangles: AnalysisTriangle[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      min[0] = Math.min(min[0], point[0]);
      min[1] = Math.min(min[1], point[1]);
      min[2] = Math.min(min[2], point[2]);
      max[0] = Math.max(max[0], point[0]);
      max[1] = Math.max(max[1], point[1]);
      max[2] = Math.max(max[2], point[2]);
    }
  }
  return { min, max };
}

function planIoU(a: MassingLayer, b: MassingLayer) {
  const ix = Math.max(0, Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]));
  const iy = Math.max(0, Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]));
  const inter = ix * iy;
  const areaA = Math.max(1e-6, (a.max[0] - a.min[0]) * (a.max[1] - a.min[1]));
  const areaB = Math.max(1e-6, (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]));
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function fragmentStats(triangles: AnalysisTriangle[]) {
  const cell = FRAGMENT_CELL_FEET;
  const keyOf = (ix: number, iy: number) => `${ix},${iy}`;
  const areaByCell = new Map<string, number>();
  const coords: Array<{ ix: number; iy: number; key: string }> = [];
  for (const triangle of triangles) {
    const xs = [triangle.a[0], triangle.b[0], triangle.c[0]];
    const ys = [triangle.a[1], triangle.b[1], triangle.c[1]];
    const minX = Math.floor(Math.min(...xs) / cell);
    const maxX = Math.ceil(Math.max(...xs) / cell);
    const minY = Math.floor(Math.min(...ys) / cell);
    const maxY = Math.ceil(Math.max(...ys) / cell);
    const cells = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    const share = triangle.area / cells;
    for (let ix = minX; ix <= maxX; ix += 1) {
      for (let iy = minY; iy <= maxY; iy += 1) {
        const key = keyOf(ix, iy);
        if (!areaByCell.has(key)) coords.push({ ix, iy, key });
        areaByCell.set(key, (areaByCell.get(key) ?? 0) + share);
      }
    }
  }
  if (!coords.length) return { count: 0, largestShare: 0 };
  const occupied = new Set(areaByCell.keys());
  const seen = new Set<string>();
  let count = 0;
  let largest = 0;
  let total = 0;
  for (const start of coords) {
    if (seen.has(start.key)) continue;
    count += 1;
    let area = 0;
    const stack = [start];
    seen.add(start.key);
    while (stack.length) {
      const current = stack.pop()!;
      area += areaByCell.get(current.key) ?? 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = keyOf(current.ix + dx, current.iy + dy);
        if (!occupied.has(key) || seen.has(key)) continue;
        seen.add(key);
        stack.push({ ix: current.ix + dx, iy: current.iy + dy, key });
      }
    }
    largest = Math.max(largest, area);
    total += area;
  }
  return { count, largestShare: total ? largest / total : 0 };
}

const BIN_FEET = 1;
const MIN_PEAK_SEP_FEET = 5;
const ASSIGN_FEET = 2.4;

/** Smoothed area-by-elevation peaks. A continuous smear does not become a sequence. */
function clusterByZ(triangles: AnalysisTriangle[], _gap: number): AnalysisTriangle[][] {
  if (!triangles.length) return [];
  const minZ = triangles.reduce((min, triangle) => Math.min(min, triangle.centroid[2]), Infinity);
  const maxZ = triangles.reduce((max, triangle) => Math.max(max, triangle.centroid[2]), -Infinity);
  const count = Math.max(1, Math.ceil((maxZ - minZ) / BIN_FEET) + 1);
  const bins = Array.from({ length: count }, () => ({ area: 0, triangles: [] as AnalysisTriangle[] }));
  for (const triangle of triangles) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((triangle.centroid[2] - minZ) / BIN_FEET)));
    bins[index].area += triangle.area;
    bins[index].triangles.push(triangle);
  }
  const raw = bins.map((bin) => bin.area);
  const smooth = raw.map((area, index) => {
    const left = raw[index - 1] ?? area;
    const right = raw[index + 1] ?? area;
    return 0.25 * left + 0.5 * area + 0.25 * right;
  });
  const peakHeight = Math.max(...smooth, 0);
  if (peakHeight < MIN_LAYER_AREA) return [];
  const candidates: number[] = [];
  for (let index = 0; index < smooth.length; index += 1) {
    const left = index > 0 ? smooth[index - 1] : -Infinity;
    const right = index < smooth.length - 1 ? smooth[index + 1] : -Infinity;
    if (smooth[index] < peakHeight * 0.28) continue;
    if (smooth[index] + 1e-6 < left || smooth[index] + 1e-6 < right) continue;
    let valley = smooth[index];
    for (let walk = index - 1; walk >= 0; walk -= 1) {
      valley = Math.min(valley, smooth[walk]);
      if (smooth[walk] > smooth[index]) break;
    }
    for (let walk = index + 1; walk < smooth.length; walk += 1) {
      valley = Math.min(valley, smooth[walk]);
      if (smooth[walk] > smooth[index]) break;
    }
    const prominence = smooth[index] - valley;
    if (prominence < Math.max(MIN_LAYER_AREA, peakHeight * 0.18)) continue;
    candidates.push(index);
  }
  const peaks: number[] = [];
  for (const index of candidates) {
    const prev = peaks[peaks.length - 1];
    if (prev === undefined) {
      peaks.push(index);
      continue;
    }
    const valley = smooth.slice(prev, index + 1).reduce((min, value) => Math.min(min, value), Infinity);
    const shorter = Math.min(smooth[prev], smooth[index]);
    const tooClose = (index - prev) * BIN_FEET < MIN_PEAK_SEP_FEET;
    const weakValley = shorter > 0 && valley / shorter > 0.48;
    if (tooClose || weakValley) {
      if (smooth[index] > smooth[prev]) peaks[peaks.length - 1] = index;
    } else peaks.push(index);
  }
  if (!peaks.length) {
    const tallest = smooth.indexOf(peakHeight);
    if (tallest >= 0) peaks.push(tallest);
  }
  const groups = peaks.map(() => [] as AnalysisTriangle[]);
  const elevations = peaks.map((index) => minZ + (index + 0.5) * BIN_FEET);
  for (const triangle of triangles) {
    let best = -1;
    let bestDist = ASSIGN_FEET;
    for (let index = 0; index < elevations.length; index += 1) {
      const dist = Math.abs(triangle.centroid[2] - elevations[index]);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    if (best >= 0) groups[best].push(triangle);
  }
  return groups.filter((group) => group.length);
}

function toLayers(groups: AnalysisTriangle[][]): MassingLayer[] {
  const raw = groups
    .map((triangles) => {
      const area = triangles.reduce((sum, triangle) => sum + triangle.area, 0);
      const centroid = surfaceCentroid(triangles);
      if (!centroid || area < 1e-6) return null;
      const { min, max } = boundsOf(triangles);
      const fragments = fragmentStats(triangles);
      return { elevation: centroid[2], area, centroid, min, max, fragments: fragments.count, largestShare: fragments.largestShare, triangles };
    })
    .filter((layer): layer is Omit<MassingLayer, "index"> => Boolean(layer));
  const maxArea = raw.reduce((max, layer) => Math.max(max, layer.area), 0);
  const cutoff = Math.max(MIN_LAYER_AREA, 0.035 * maxArea);
  const kept = (raw.filter((layer) => layer.area >= cutoff).length ? raw.filter((layer) => layer.area >= cutoff) : raw.slice(0, 1))
    .sort((left, right) => left.elevation - right.elevation);
  return kept.map((layer, index) => ({ ...layer, index }));
}

/** Horizontal massing plates grouped into elevation layers. Falls back to all-triangle bands when plates are scarce. */
export function extractMassingLayers(mesh: AnalysisMesh): MassingLayer[] {
  const plates = mesh.triangles.filter((triangle) => Math.abs(triangle.normal[2]) >= PLATE_NZ);
  let layers = toLayers(clusterByZ(plates, LAYER_GAP_FEET));
  if (layers.length < 2 && mesh.triangles.length) {
    const bands = toLayers(clusterByZ(mesh.triangles, LAYER_GAP_FEET));
    if (bands.length > layers.length) layers = bands;
  }
  return layers;
}

function plateDefinition(layer: MassingLayer) {
  const fragmentPenalty = 1 / (1 + Math.max(0, layer.fragments - 1) * 0.85);
  return clamp01(layer.largestShare) * fragmentPenalty;
}

function orderedProgression(layers: MassingLayer[], planDiagonal: number) {
  if (layers.length < 2) return 0;
  const steps = layers.slice(1).map((layer, index): [number, number] => [
    layer.centroid[0] - layers[index].centroid[0],
    layer.centroid[1] - layers[index].centroid[1],
  ]);
  const lengths = steps.map((step) => Math.hypot(step[0], step[1]));
  const meanLen = mean(lengths);
  const stacked = meanLen < 0.12 * Math.max(planDiagonal, 1) ? 1 : 0;
  const lengthCv = coefficientOfVariation(lengths);
  const evenSteps = meanLen > 0.12 * Math.max(planDiagonal, 1) && (lengthCv === null || lengthCv < 0.35) ? 0.75 : 0;
  let align = 1;
  if (steps.length >= 2 && meanLen > 1e-6) {
    const units = steps.map((step, index) => {
      const length = Math.max(lengths[index], 1e-9);
      return [step[0] / length, step[1] / length] as const;
    });
    let sum = 0;
    for (let index = 0; index < units.length - 1; index += 1) {
      sum += Math.max(0, units[index][0] * units[index + 1][0] + units[index][1] * units[index + 1][1]);
    }
    align = sum / (units.length - 1);
  }
  let areaMono = 1;
  if (layers.length >= 3) {
    const logs = layers.slice(1).map((layer, index) => Math.log(Math.max(layer.area, 1e-6) / Math.max(layers[index].area, 1e-6)));
    const stable = logs.every((value) => Math.abs(value) < 0.25);
    const sameSign = logs.every((value) => value >= -0.15) || logs.every((value) => value <= 0.15);
    areaMono = stable ? 1 : sameSign ? 0.85 : 0.3;
  }
  return clamp01(0.65 * Math.max(stacked, align, evenSteps) + 0.35 * areaMono);
}

/** Four Sequential terms in 0–1. One plate is not a sequence; irregular plates lower consistency. */
export function scoreMassingSequence(layers: MassingLayer[], planDiagonal: number): SequenceTerms {
  const n = layers.length;
  const layerCount = n / (n + 3);
  if (n < 2) {
    return { layerCount, regularity: 0, consistency: 0, progression: 0, gaps: [], pairArea: [], pairOverlap: [], pairDefinition: [] };
  }
  const gaps = layers.slice(1).map((layer, index) => Math.max(0, layer.elevation - layers[index].elevation));
  const cv = coefficientOfVariation(gaps);
  const cvScore = cv === null ? 1 : clamp01(1 - cv / 0.55);
  const regularity = n === 2 ? 0.55 * cvScore : cvScore;
  const pairArea: number[] = [];
  const pairOverlap: number[] = [];
  const pairDefinition: number[] = [];
  for (let index = 0; index < n - 1; index += 1) {
    const a = layers[index];
    const b = layers[index + 1];
    const areaSim = 1 - Math.abs(a.area - b.area) / Math.max(a.area, b.area, 1e-6);
    const overlap = planIoU(a, b);
    const definition = Math.min(plateDefinition(a), plateDefinition(b));
    pairArea.push(areaSim);
    pairOverlap.push(overlap);
    pairDefinition.push(definition);
  }
  const consistency = mean(pairArea.map((area, index) => 0.25 * area + 0.25 * pairOverlap[index] + 0.5 * pairDefinition[index]));
  return {
    layerCount,
    regularity,
    consistency,
    progression: orderedProgression(layers, planDiagonal),
    gaps,
    pairArea,
    pairOverlap,
    pairDefinition,
  };
}
