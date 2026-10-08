import { connectionDiagnostic, connectionDiagnosticsEnabled, startConnectionTiming } from "./connectionDiagnostics";
import { portRouteClear } from "./portMatching";
import { edgeWindow, profileLength, profileMidpoint, resolveWalkableAttachment, type WalkableAnchor } from "./surfaceAttachment";
import { circulationProfile, type CirculationMode } from "./transitionGeometry";
import {
  LATTICE_FEET,
  packCell,
  placementWorldZ,
  unpackCell,
  type PlacedTile,
  type TileModel,
  type TileVariant,
  type Vec3,
} from "./types";

export type OrganicKind = "direct" | "interlock" | "organic" | "bridge" | "ramp" | "stair";
export type OrganicRelation = "branch-branch" | "branch-plane" | "plane-branch" | "plane-plane";
export type OrganicRejection =
  | "no usable features"
  | "too far"
  | "facing mismatch"
  | "elevation mismatch"
  | "route collision"
  | "destructive overlap"
  | "no landing surface"
  | "connection already satisfied"
  | "structurally/geometrically impractical"
  | "missed surface"
  | "invalid circulation"
  | "unresolved overlap";

export type OrganicLink = {
  kind: OrganicKind;
  relation: OrganicRelation;
  tileA: string;
  tileB: string;
  from: Vec3;
  to: Vec3;
  via?: Vec3;
  widthA: number;
  widthB: number;
  rise: number;
  /** Horizontal length of the circulation path. A switchback run is longer than the straight gap. */
  run: number;
  /** Rise divided by run. Accessible ramps stay at or below 1:12. */
  slope: number;
  /** Lateral offset used when a straight gap is too steep for a ramp. */
  bend?: number;
  distance: number;
  detail: string;
  /** Walkable source edge the loft section must follow. */
  fromProfile?: [Vec3, Vec3];
  toProfile?: [Vec3, Vec3];
  fromDirection?: Vec3;
  toDirection?: Vec3;
  sourceKind?: "edge";
  targetKind?: "edge";
};

export type JoinedStory = { tileA: string; tileB: string; elevation: number };

export type OrganicDiagnostics = {
  considered: number;
  directJoints: number;
  interlocks: number;
  organicConnectors: number;
  bridges: number;
  ramps: number;
  stairs: number;
  components: number;
  isolated: string[];
  degrees: Record<string, number>;
  interiorShortfall: number;
  relations: Record<OrganicRelation, number>;
  rejections: Array<{ pair: string; reason: OrganicRejection; detail: string }>;
  links: OrganicLink[];
};

type FeatureKind = "branch" | "plane" | "edge" | "terminal";
type Feature = {
  kind: FeatureKind;
  a: Vec3;
  b: Vec3;
  outward: Vec3;
  width: number;
  elevation: number;
};

type Box = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

const featureCache = new WeakMap<TileVariant, Feature[]>();
const occupiedCache = new WeakMap<TileVariant, Set<number>>();
const aabbCache = new WeakMap<TileVariant, Box>();

const PLAN: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function occupiedSet(variant: TileVariant) {
  let set = occupiedCache.get(variant);
  if (!set) {
    set = new Set(variant.occupied);
    occupiedCache.set(variant, set);
  }
  return set;
}

function localBox(variant: TileVariant, cellFeet: number): Box {
  const cached = aabbCache.get(variant);
  if (cached) return cached;
  const box: Box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  const cells = variant.occupied.length ? variant.occupied : variant.floor;
  for (const packed of cells) {
    const [x, y, z] = unpackCell(packed);
    box.minX = Math.min(box.minX, x * cellFeet);
    box.minY = Math.min(box.minY, y * cellFeet);
    box.minZ = Math.min(box.minZ, z * cellFeet);
    box.maxX = Math.max(box.maxX, (x + 1) * cellFeet);
    box.maxY = Math.max(box.maxY, (y + 1) * cellFeet);
    box.maxZ = Math.max(box.maxZ, (z + 1) * cellFeet);
  }
  if (!Number.isFinite(box.minX)) {
    box.minX = 0;
    box.minY = 0;
    box.minZ = 0;
    box.maxX = 0;
    box.maxY = 0;
    box.maxZ = 0;
  }
  aabbCache.set(variant, box);
  return box;
}

function worldBox(tile: PlacedTile, model: TileModel): Box {
  const variant = model.variants[tile.variant] ?? model.variants[0];
  const local = localBox(variant, model.cellFeet);
  const z = placementWorldZ(tile);
  return {
    minX: tile.ix * LATTICE_FEET + local.minX,
    minY: tile.iy * LATTICE_FEET + local.minY,
    minZ: z + local.minZ,
    maxX: tile.ix * LATTICE_FEET + local.maxX,
    maxY: tile.iy * LATTICE_FEET + local.maxY,
    maxZ: z + local.maxZ,
  };
}

function gapToBox(point: Vec3, box: Box) {
  const dx = point[0] < box.minX ? box.minX - point[0] : point[0] > box.maxX ? point[0] - box.maxX : 0;
  const dy = point[1] < box.minY ? box.minY - point[1] : point[1] > box.maxY ? point[1] - box.maxY : 0;
  const dz = point[2] < box.minZ ? box.minZ - point[2] : point[2] > box.maxZ ? point[2] - box.maxZ : 0;
  return Math.hypot(dx, dy, dz);
}

function topCells(variant: TileVariant) {
  const best = new Map<string, { z: number; packed: number }>();
  for (const packed of variant.occupied) {
    const [x, y, z] = unpackCell(packed);
    const key = `${x},${y}`;
    const current = best.get(key);
    if (!current || z > current.z) best.set(key, { z, packed });
  }
  return [...best.values()].map((entry) => entry.packed);
}

function detectFeatures(variant: TileVariant, cellFeet: number, source: { id: string; filename: string }): Feature[] {
  const cached = featureCache.get(variant);
  if (cached) return cached;
  const occupied = variant.occupied;
  const index = new Set<string>();
  let centroidX = 0;
  let centroidY = 0;
  for (const packed of occupied) {
    const [x, y, z] = unpackCell(packed);
    index.add(`${x},${y},${z}`);
    centroidX += x;
    centroidY += y;
  }
  const count = Math.max(1, occupied.length);
  centroidX /= count;
  centroidY /= count;

  const tips: Array<{ feature: Feature; reach: number }> = [];
  for (const packed of occupied) {
    const [x, y, z] = unpackCell(packed);
    const neighbors = PLAN.filter(([dx, dy]) => index.has(`${x + dx},${y + dy},${z}`));
    if (neighbors.length > 1) continue;
    const awayX = neighbors.length === 1 ? -neighbors[0][0] : x + 0.5 - centroidX;
    const awayY = neighbors.length === 1 ? -neighbors[0][1] : y + 0.5 - centroidY;
    const length = Math.hypot(awayX, awayY) || 1;
    const point: Vec3 = [(x + 0.5) * cellFeet, (y + 0.5) * cellFeet, (z + 0.45) * cellFeet];
    tips.push({
      reach: Math.hypot(x + 0.5 - centroidX, y + 0.5 - centroidY),
      feature: {
        kind: "branch",
        a: point,
        b: point,
        outward: [awayX / length, awayY / length, 0],
        width: Math.max(2.5, cellFeet * 1.6),
        elevation: point[2],
      },
    });
  }
  tips.sort((a, b) => b.reach - a.reach);

  const surface = new Set<number>([...variant.floor, ...topCells(variant)]);
  const surfaceKeys = new Set<string>();
  const surfaceCells: Array<[number, number, number]> = [];
  for (const packed of surface) {
    const cell = unpackCell(packed);
    const key = `${cell[0]},${cell[1]},${cell[2]}`;
    if (surfaceKeys.has(key)) continue;
    surfaceKeys.add(key);
    surfaceCells.push(cell);
  }

  const edges: Feature[] = [];
  for (const [dx, dy] of PLAN) {
    const groups = new Map<number, Array<[number, number, number]>>();
    for (const [x, y, z] of surfaceCells) {
      if (index.has(`${x + dx},${y + dy},${z}`)) continue;
      const fixed = dx !== 0 ? x : y;
      const key = Math.round(z) * 10000 + fixed;
      const group = groups.get(key) ?? [];
      group.push([x, y, z]);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      group.sort((p, q) => (dx !== 0 ? p[1] - q[1] : p[0] - q[0]));
      let run: Array<[number, number, number]> = [];
      const flush = () => {
        if (run.length >= 2) {
          const start = run[0];
          const end = run[run.length - 1];
          const a: Vec3 = [(start[0] + 0.5 + dx * 0.35) * cellFeet, (start[1] + 0.5 + dy * 0.35) * cellFeet, (start[2] + 0.45) * cellFeet];
          const b: Vec3 = [(end[0] + 0.5 + dx * 0.35) * cellFeet, (end[1] + 0.5 + dy * 0.35) * cellFeet, (end[2] + 0.45) * cellFeet];
          const width = Math.max(cellFeet, run.length * cellFeet);
          edges.push({
            kind: width >= 6 && surfaceCells.length >= 8 ? "plane" : "edge",
            a,
            b,
            outward: [dx, dy, 0],
            width,
            elevation: (a[2] + b[2]) / 2,
          });
        }
        run = [];
      };
      for (const cell of group) {
        if (!run.length) {
          run.push(cell);
          continue;
        }
        const previous = run[run.length - 1];
        const gap = dx !== 0 ? Math.abs(cell[1] - previous[1]) : Math.abs(cell[0] - previous[0]);
        if (gap > 2) flush();
        run.push(cell);
      }
      flush();
    }
  }
  edges.sort((a, b) => b.width - a.width);

  const features = [...tips.slice(0, 10).map((tip) => tip.feature), ...edges.slice(0, 8)];
  for (const port of variant.ports ?? []) {
    const ox = port.outwardDirection[0];
    const oy = port.outwardDirection[1];
    const length = Math.hypot(ox, oy);
    const outward: Vec3 = length > 0.2 ? [ox / length, oy / length, 0] : [0, 0, 0];
    const side: Vec3 = length > 0.2 ? [-outward[1], outward[0], 0] : [1, 0, 0];
    const half = Math.max(port.usableWidth, cellFeet) / 2;
    const center = port.localPosition;
    const z = port.elevation;
    const a: Vec3 = [center[0] + side[0] * half, center[1] + side[1] * half, z];
    const b: Vec3 = [center[0] - side[0] * half, center[1] - side[1] * half, z];
    const kind: FeatureKind = port.type === "BRANCH_END" || port.type === "PASSAGE_END" || port.type === "CIRCULATION_END" ? "branch" : "plane";
    const midpoint: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z];
    const duplicate = features.some((feature) => {
      const mid: Vec3 = [(feature.a[0] + feature.b[0]) / 2, (feature.a[1] + feature.b[1]) / 2, (feature.a[2] + feature.b[2]) / 2];
      return Math.hypot(mid[0] - midpoint[0], mid[1] - midpoint[1], mid[2] - midpoint[2]) < 3;
    });
    if (!duplicate) {
      features.push({ kind, a, b, outward, width: Math.max(2.5, port.usableWidth), elevation: z });
    }
  }
  if (connectionDiagnosticsEnabled()) connectionDiagnostic("features", "feature limits", { source: { id: source.id, filename: source.filename }, tips: tips.length, retainedTips: Math.min(10, tips.length), edges: edges.length, retainedEdges: Math.min(8, edges.length), total: features.length, omitted: features.slice(18), rotation: variant.rotation, mirror: variant.mirror });
  const capped = features.slice(0, 18);
  featureCache.set(variant, capped);
  return capped;
}

function family(kind: FeatureKind): "branch" | "plane" {
  return kind === "branch" ? "branch" : "plane";
}

function relationOf(a: FeatureKind, b: FeatureKind): OrganicRelation {
  const left = family(a);
  const right = family(b);
  if (left === "branch" && right === "branch") return "branch-branch";
  if (left === "branch") return "branch-plane";
  if (right === "branch") return "plane-branch";
  return "plane-plane";
}

function toWorld(tile: PlacedTile, point: Vec3): Vec3 {
  return [tile.ix * LATTICE_FEET + point[0], tile.iy * LATTICE_FEET + point[1], placementWorldZ(tile) + point[2]];
}

function samples(a: Vec3, b: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (let step = 0; step <= 4; step += 1) {
    const t = step / 4;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

type Attachment = {
  from: Vec3;
  to: Vec3;
  distance: number;
  plan: number;
  rise: number;
  run: number;
  slope: number;
  mode: CirculationMode;
  bend: number;
  score: number;
};

/** Prefer a walkable rise/run over the nearest points. Endpoints keep the elevations of the surfaces they sit on. */
function selectCirculationAttachment(a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3) {
  let best: Attachment | null = null;
  let rejected: { distance: number; detail: string } | null = null;
  const usability: Record<CirculationMode, number> = { level: 8, ramp: 7, switchback: 5, stair: 3, reject: 0 };
  for (const from of samples(a0, a1)) {
    for (const to of samples(b0, b1)) {
      const plan = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const rise = to[2] - from[2];
      const distance = Math.hypot(plan, rise);
      const profile = circulationProfile(plan, rise);
      if (profile.mode === "reject") {
        const detail = `Rise ${rise.toFixed(1)} ft over run ${plan.toFixed(1)} ft, slope ${profile.slope.toFixed(3)}, is not a usable circulation path.`;
        if (!rejected || distance < rejected.distance) rejected = { distance, detail };
        continue;
      }
      const scoredSlope = profile.mode === "level" ? Math.min(profile.slope, 1 / 12) : profile.slope;
      const score = usability[profile.mode] * 6 - scoredSlope * 10 - plan * 0.12 - Math.abs(rise) * 0.2;
      if (!best || score > best.score) {
        best = { from, to, distance, plan, rise, run: profile.run, slope: profile.slope, mode: profile.mode, bend: profile.bend, score };
      }
    }
  }
  return { best, rejected };
}

function switchbackVia(from: Vec3, to: Vec3, bend: number): Vec3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy) || 1;
  return [(from[0] + to[0]) / 2 + (-dy / plan) * bend, (from[1] + to[1]) / 2 + (dx / plan) * bend, (from[2] + to[2]) / 2];
}

function facing(outward: Vec3, toward: Vec3) {
  const outwardLength = Math.hypot(outward[0], outward[1]);
  const towardLength = Math.hypot(toward[0], toward[1]);
  if (outwardLength < 0.2 || towardLength < 0.2) return 0;
  return (outward[0] * toward[0] + outward[1] * toward[1]) / (outwardLength * towardLength);
}

function resolveModel(models: TileModel[], id: string) {
  return models.find((model) => model.id === id) ?? models.find((model) => model.id === id.split("::")[0]);
}

function massOverlap(tileA: PlacedTile, modelA: TileModel, tileB: PlacedTile, modelB: TileModel) {
  const variantA = modelA.variants[tileA.variant] ?? modelA.variants[0];
  const variantB = modelB.variants[tileB.variant] ?? modelB.variants[0];
  const occupiedB = occupiedSet(variantB);
  const cellB = modelB.cellFeet;
  const samplesA = variantA.occupied;
  const step = Math.max(1, Math.ceil(samplesA.length / 400));
  let hits = 0;
  let tested = 0;
  const zA = placementWorldZ(tileA);
  const zB = placementWorldZ(tileB);
  for (let index = 0; index < samplesA.length; index += step) {
    const [x, y, z] = unpackCell(samplesA[index]);
    const wx = tileA.ix * LATTICE_FEET + (x + 0.5) * modelA.cellFeet;
    const wy = tileA.iy * LATTICE_FEET + (y + 0.5) * modelA.cellFeet;
    const wz = zA + (z + 0.5) * modelA.cellFeet;
    tested += 1;
    if (occupiedB.has(packCell(Math.floor((wx - tileB.ix * LATTICE_FEET) / cellB), Math.floor((wy - tileB.iy * LATTICE_FEET) / cellB), Math.floor((wz - zB) / cellB)))) hits += 1;
  }
  const boxA = worldBox(tileA, modelA);
  const boxB = worldBox(tileB, modelB);
  return {
    fraction: tested ? hits / tested : 0,
    overlapX: Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX),
    overlapY: Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY),
  };
}

function routeWithBend(from: Vec3, to: Vec3, width: number, tiles: PlacedTile[], models: TileModel[], ends: [string, string]): Vec3 | null | false {
  if (portRouteClear(from, to, width, tiles, models, ends)) return null;
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const mz = (from[2] + to[2]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy) || 1;
  const px = -dy / plan;
  const py = dx / plan;
  for (const bend of [3, -3, 6, -6, 9, -9]) {
    const via: Vec3 = [mx + px * bend, my + py * bend, mz];
    if (portRouteClear(from, via, width, tiles, models, ends) && portRouteClear(via, to, width, tiles, models, ends)) return via;
  }
  return false;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function anchorFeature(tile: PlacedTile, model: TileModel, feature: Feature, toward: Vec3): WalkableAnchor | null {
  const width = Math.min(8, Math.max(2, feature.width));
  const ends = [feature.a, feature.b].map((point) => toWorld(tile, point));
  const mid: Vec3 = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2, (ends[0][2] + ends[1][2]) / 2];
  return resolveWalkableAttachment(model, tile, mid, toward, width)
    ?? resolveWalkableAttachment(model, tile, ends[0], toward, width)
    ?? resolveWalkableAttachment(model, tile, ends[1], toward, width);
}

function emptyDiagnostics(tiles: PlacedTile[]): OrganicDiagnostics {
  const degrees: Record<string, number> = {};
  for (const tile of tiles) degrees[tile.id] = 0;
  return {
    considered: 0,
    directJoints: 0,
    interlocks: 0,
    organicConnectors: 0,
    bridges: 0,
    ramps: 0,
    stairs: 0,
    components: tiles.length,
    isolated: tiles.map((tile) => tile.id),
    degrees,
    interiorShortfall: 0,
    relations: { "branch-branch": 0, "branch-plane": 0, "plane-branch": 0, "plane-plane": 0 },
    rejections: [],
    links: [],
  };
}

/** Pair exposed architectural features of neighboring forms. A form may branch to each neighbor, including at a second elevation. */
export function findOrganicLinks(models: TileModel[], tiles: PlacedTile[], alreadyJoined: JoinedStory[]): OrganicDiagnostics {
  const finishTiming = startConnectionTiming("candidate generation");
  try {
  const diagnostics = emptyDiagnostics(tiles);
  const parent = new Map(tiles.map((tile) => [tile.id, tile.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const linked = new Set<string>();
  const stories = new Map<string, number[]>();
  const rememberStory = (a: string, b: string, elevation: number) => {
    const key = pairKey(a, b);
    const current = stories.get(key) ?? [];
    current.push(elevation);
    stories.set(key, current);
  };
  const sameStory = (a: string, b: string, elevation: number) => {
    const current = stories.get(pairKey(a, b)) ?? [];
    if (!current.length) return false;
    if (current.some((value) => Number.isNaN(value))) return true;
    return current.some((value) => Math.abs(value - elevation) < 4);
  };
  const addEdge = (a: string, b: string) => {
    const key = pairKey(a, b);
    if (linked.has(key)) return;
    linked.add(key);
    diagnostics.degrees[a] = (diagnostics.degrees[a] ?? 0) + 1;
    diagnostics.degrees[b] = (diagnostics.degrees[b] ?? 0) + 1;
    join(a, b);
  };

  for (const joined of alreadyJoined) {
    if (!parent.has(joined.tileA) || !parent.has(joined.tileB)) continue;
    addEdge(joined.tileA, joined.tileB);
    rememberStory(joined.tileA, joined.tileB, joined.elevation);
  }

  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const tileA = tiles[i];
      const tileB = tiles[j];
      if (Math.max(Math.abs(tileA.ix - tileB.ix), Math.abs(tileA.iy - tileB.iy)) > 1) { connectionDiagnostic("organic", "pair proximity", { tileA, tileB }); continue; }
      const label = `${tileA.id} ↔ ${tileB.id}`;
      const modelA = resolveModel(models, tileA.id);
      const modelB = resolveModel(models, tileB.id);
      if (!modelA || !modelB) {
        diagnostics.considered += 1;
        diagnostics.rejections.push({ pair: label, reason: "no usable features", detail: "Missing placed model." });
        continue;
      }
      const overlap = massOverlap(tileA, modelA, tileB, modelB);
      if (overlap.fraction > 0.22 && overlap.overlapX > 8 && overlap.overlapY > 8) {
        diagnostics.considered += 1;
        diagnostics.rejections.push({
          pair: label,
          reason: "destructive overlap",
          detail: `${Math.round(overlap.fraction * 100)}% of sampled mass occupies the other form.`,
        });
        continue;
      }

      const variantA = modelA.variants[tileA.variant] ?? modelA.variants[0];
      const variantB = modelB.variants[tileB.variant] ?? modelB.variants[0];
      const featuresA = detectFeatures(variantA, modelA.cellFeet, modelA);
      const featuresB = detectFeatures(variantB, modelB.cellFeet, modelB);
      const boxA = worldBox(tileA, modelA);
      const boxB = worldBox(tileB, modelB);
      const near = (tile: PlacedTile, feature: Feature, box: Box) => {
        const a = toWorld(tile, feature.a);
        const b = toWorld(tile, feature.b);
        const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        return gapToBox(a, box) <= 14 || gapToBox(b, box) <= 14 || gapToBox(mid, box) <= 14;
      };
      const nearA = featuresA.filter((feature) => near(tileA, feature, boxB));
      const nearB = featuresB.filter((feature) => near(tileB, feature, boxA));
      connectionDiagnostic("organic", "feature proximity", { tileA, tileB, source: modelA.filename, target: modelB.filename, featuresA: featuresA.length, featuresB: featuresB.length, nearA: nearA.length, nearB: nearB.length });
      if (!nearA.length || !nearB.length) {
        connectionDiagnostic("organic", "no candidate attachment", { tileA, tileB, featuresA: featuresA.length, featuresB: featuresB.length, nearA: nearA.length, nearB: nearB.length });
        diagnostics.considered += 1;
        diagnostics.rejections.push({
          pair: label,
          reason: "no usable features",
          detail: !featuresA.length || !featuresB.length ? "No architectural features were detected." : "No exposed feature sits near the shared face.",
        });
        continue;
      }

      const drafts: Array<{ score: number; link: OrganicLink }> = [];
      const nearestFail: { current: { reason: OrganicRejection; detail: string; distance: number } | null } = { current: null };
      const noteFail = (reason: OrganicRejection, detail: string, distance: number) => {
        connectionDiagnostic("organic attachment", reason, { tileA, tileB, source: modelA.filename, target: modelB.filename, detail, distance });
        if (!nearestFail.current || distance < nearestFail.current.distance) nearestFail.current = { reason, detail, distance };
      };
      const towardA: Vec3 = [tileB.ix * LATTICE_FEET + 10, tileB.iy * LATTICE_FEET + 10, placementWorldZ(tileB) + 4];
      const towardB: Vec3 = [tileA.ix * LATTICE_FEET + 10, tileA.iy * LATTICE_FEET + 10, placementWorldZ(tileA) + 4];
      const anchorsA = nearA.map((feature) => anchorFeature(tileA, modelA, feature, towardA));
      const anchorsB = nearB.map((feature) => anchorFeature(tileB, modelB, feature, towardB));

      for (let indexA = 0; indexA < nearA.length; indexA += 1) {
        for (let indexB = 0; indexB < nearB.length; indexB += 1) {
          const featureA = nearA[indexA];
          const featureB = nearB[indexB];
          diagnostics.considered += 1;
          const probeA = toWorld(tileA, featureA.a);
          const probeB = toWorld(tileB, featureB.a);
          const anchorA = anchorsA[indexA];
          const anchorB = anchorsB[indexB];
          if (!anchorA || !anchorB) {
            noteFail("no landing surface", "No walkable OBJ edge in this candidate region faces the other form.", Math.hypot(probeB[0] - probeA[0], probeB[1] - probeA[1], probeB[2] - probeA[2]));
            continue;
          }
          const selected = selectCirculationAttachment(anchorA.run[0], anchorA.run[1], anchorB.run[0], anchorB.run[1]);
          const attachment = selected.best;
          if (!attachment) {
            if (selected.rejected) noteFail("invalid circulation", selected.rejected.detail, selected.rejected.distance);
            continue;
          }
          const preferred = Math.min(6, anchorA.width, anchorB.width);
          const fromProfile = edgeWindow(anchorA.run, attachment.from, Math.max(2, preferred));
          const toProfile = edgeWindow(anchorB.run, attachment.to, Math.max(2, preferred));
          if (!fromProfile || !toProfile) {
            noteFail("no landing surface", "The facing edges are narrower than a 2 ft circulation section.", attachment.distance);
            continue;
          }
          const from = profileMidpoint(fromProfile);
          const to = profileMidpoint(toProfile);
          const plan = Math.hypot(to[0] - from[0], to[1] - from[1]);
          const rise = to[2] - from[2];
          const profile = circulationProfile(plan, rise);
          const distance = Math.hypot(plan, rise);
          if (profile.mode === "reject") {
            noteFail("invalid circulation", `Rise ${rise.toFixed(1)} ft over run ${plan.toFixed(1)} ft, slope ${profile.slope.toFixed(3)}, is not a usable circulation path.`, distance);
            continue;
          }
          const toward: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
          const faceA = facing(anchorA.outward, toward);
          const faceB = facing(anchorB.outward, [-toward[0], -toward[1], -toward[2]]);
          const relation = relationOf(featureA.kind, featureB.kind);
          const story = (from[2] + to[2]) / 2;
          let fail: OrganicRejection | null = null;
          let failDetail = "";
          if (plan > 20 || distance > 22) {
            fail = "too far";
            failDetail = `Attachment span ${distance.toFixed(1)} ft.`;
          } else if (sameStory(tileA.id, tileB.id, story)) {
            fail = "connection already satisfied";
            failDetail = "This elevation already has a connection. Another story can still branch.";
          } else if (faceA < -0.5 && faceB < -0.5 && distance >= 2.2) {
            fail = "facing mismatch";
            failDetail = `Both walkable edges point away (${faceA.toFixed(2)}, ${faceB.toFixed(2)}).`;
          }
          if (fail) {
            noteFail(fail, failDetail, distance);
            continue;
          }

          let kind: OrganicKind;
          if (profile.mode === "level") kind = distance < 2.2 && faceA > 0.45 && faceB > 0.45 ? "interlock" : relation === "plane-plane" && distance >= 2.2 ? "bridge" : "organic";
          else if (profile.mode === "stair") kind = "stair";
          else kind = "ramp";

          const contact = kind === "interlock" ? 6 : kind === "organic" ? 5 : kind === "ramp" ? 4 : 3;
          const score = attachment.score + Math.max(0, faceA) * 2 + Math.max(0, faceB) * 2 + contact - anchorA.snap - anchorB.snap;
          drafts.push({
            score,
            link: {
              kind,
              relation,
              tileA: tileA.id,
              tileB: tileB.id,
              from,
              to,
              widthA: profileLength(fromProfile),
              widthB: profileLength(toProfile),
              rise,
              run: profile.run,
              slope: profile.slope,
              bend: profile.bend,
              distance,
              fromProfile,
              toProfile,
              fromDirection: anchorA.outward,
              toDirection: anchorB.outward,
              sourceKind: "edge",
              targetKind: "edge",
              detail: `${featureA.kind} → ${featureB.kind} on walkable edges, ${profile.mode}, rise ${rise.toFixed(1)} ft, run ${plan.toFixed(1)} ft, slope ${profile.slope.toFixed(3)}, snap ${anchorA.snap.toFixed(2)}/${anchorB.snap.toFixed(2)} ft`,
            },
          });
        }
      }

      drafts.sort((a, b) => b.score - a.score);
      if (connectionDiagnosticsEnabled()) connectionDiagnostic("organic", "draft limit", { tileA, tileB, total: drafts.length, retained: Math.min(12, drafts.length), omitted: drafts.slice(12) });
      const chosen: OrganicLink[] = [];
      let routeFailed = false;
      const acceptDraft = (link: OrganicLink) => {
        if (chosen.length >= 8) { connectionDiagnostic("organic", "chosen link limit", { tileA, tileB, link }); return false; }
        if (chosen.some((existing) => Math.abs((existing.from[2] + existing.to[2]) / 2 - (link.from[2] + link.to[2]) / 2) < 4 && Math.hypot(existing.from[0] - link.from[0], existing.from[1] - link.from[1]) < 3)) { connectionDiagnostic("organic", "similar attachment pruned", { tileA, tileB, link }); return false; }
        chosen.push(link);
        return true;
      };
      for (const draft of drafts.slice(0, 12)) {
        if (chosen.length >= 8) break;
        if (draft.link.fromProfile && draft.link.toProfile) {
          connectionDiagnostic("organic", "profiled route deferred to synthesis", { link: draft.link });
          acceptDraft(draft.link);
          continue;
        }
        if (draft.link.distance < 2.2 && (draft.link.bend ?? 0) < 0.5 && (draft.link.kind === "organic" || draft.link.kind === "interlock" || draft.link.kind === "bridge")) {
          acceptDraft(draft.link);
          continue;
        }
        const width = Math.min(6, Math.max(2.5, Math.min(draft.link.widthA, draft.link.widthB)));
        if ((draft.link.bend ?? 0) > 0.5) {
          let via = switchbackVia(draft.link.from, draft.link.to, draft.link.bend ?? 0);
          let clear = portRouteClear(draft.link.from, via, width, tiles, models, [tileA.id, tileB.id]) && portRouteClear(via, draft.link.to, width, tiles, models, [tileA.id, tileB.id]);
          if (!clear) {
            via = switchbackVia(draft.link.from, draft.link.to, -(draft.link.bend ?? 0));
            clear = portRouteClear(draft.link.from, via, width, tiles, models, [tileA.id, tileB.id]) && portRouteClear(via, draft.link.to, width, tiles, models, [tileA.id, tileB.id]);
            if (clear) draft.link.bend = -(draft.link.bend ?? 0);
          }
          if (clear) {
            acceptDraft({ ...draft.link, via });
            continue;
          }
          const straight = Math.hypot(draft.link.to[0] - draft.link.from[0], draft.link.to[1] - draft.link.from[1]);
          const stairProfile = circulationProfile(straight, draft.link.rise);
          if (
            stairProfile.mode === "stair" &&
            portRouteClear(draft.link.from, draft.link.to, width, tiles, models, [tileA.id, tileB.id])
          ) {
            acceptDraft({
              ...draft.link,
              kind: "stair",
              bend: 0,
              via: undefined,
              run: straight,
              slope: stairProfile.slope,
            });
            continue;
          }
          routeFailed = true;
          continue;
        }
        const via = routeWithBend(draft.link.from, draft.link.to, width, tiles, models, [tileA.id, tileB.id]);
        if (via === false) {
          routeFailed = true;
          continue;
        }
        acceptDraft(via ? { ...draft.link, via } : draft.link);
      }

      if (!chosen.length) {
        const reason: OrganicRejection = routeFailed ? "route collision" : nearestFail.current?.reason ?? "structurally/geometrically impractical";
        const detail = routeFailed ? "Straight, switchback, and stair routes pass through unrelated mass or exceed the circulation slope." : nearestFail.current?.detail ?? "No reasonable architectural path.";
        diagnostics.rejections.push({ pair: label, reason, detail });
        continue;
      }
      for (const link of chosen) {
        diagnostics.links.push(link);
        diagnostics.relations[link.relation] += 1;
        if (link.kind === "direct") diagnostics.directJoints += 1;
        else if (link.kind === "interlock") diagnostics.interlocks += 1;
        else if (link.kind === "organic") diagnostics.organicConnectors += 1;
        else if (link.kind === "bridge") diagnostics.bridges += 1;
        else if (link.kind === "ramp") diagnostics.ramps += 1;
        else diagnostics.stairs += 1;
        addEdge(tileA.id, tileB.id);
        rememberStory(tileA.id, tileB.id, (link.from[2] + link.to[2]) / 2);
      }
    }
  }

  diagnostics.components = new Set(tiles.map((tile) => find(tile.id))).size || tiles.length;
  diagnostics.isolated = tiles.filter((tile) => (diagnostics.degrees[tile.id] ?? 0) === 0).map((tile) => tile.id);
  for (const tile of tiles) {
    const neighbors = tiles.filter((other) => other.id !== tile.id && Math.abs(other.ix - tile.ix) + Math.abs(other.iy - tile.iy) === 1).length;
    if (neighbors >= 2 && (diagnostics.degrees[tile.id] ?? 0) < 2) diagnostics.interiorShortfall += 1;
  }
  return diagnostics;

  } finally { finishTiming(); }
}

/** Rebuild the circulation graph from confirmed interfaces and lofts that actually meshed. */
export function sealOrganicGraph(diagnostics: OrganicDiagnostics, tiles: PlacedTile[], joined: JoinedStory[], links: OrganicLink[]) {
  const finishTiming = startConnectionTiming("network graph");
  try {
  const parent = new Map(tiles.map((tile) => [tile.id, tile.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const degrees: Record<string, number> = {};
  for (const tile of tiles) degrees[tile.id] = 0;
  const seen = new Set<string>();
  const touch = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const key = pairKey(a, b);
    if (!seen.has(key)) {
      seen.add(key);
      degrees[a] = (degrees[a] ?? 0) + 1;
      degrees[b] = (degrees[b] ?? 0) + 1;
    }
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const story of joined) touch(story.tileA, story.tileB);
  for (const link of links) touch(link.tileA, link.tileB);
  diagnostics.links = links;
  diagnostics.degrees = degrees;
  diagnostics.directJoints = links.filter((link) => link.kind === "direct").length;
  diagnostics.interlocks = links.filter((link) => link.kind === "interlock").length;
  diagnostics.organicConnectors = links.filter((link) => link.kind === "organic").length;
  diagnostics.bridges = links.filter((link) => link.kind === "bridge").length;
  diagnostics.ramps = links.filter((link) => link.kind === "ramp").length;
  diagnostics.stairs = links.filter((link) => link.kind === "stair").length;
  diagnostics.relations = { "branch-branch": 0, "branch-plane": 0, "plane-branch": 0, "plane-plane": 0 };
  for (const link of links) diagnostics.relations[link.relation] += 1;
  diagnostics.components = new Set(tiles.map((tile) => find(tile.id))).size || tiles.length;
  diagnostics.isolated = tiles.filter((tile) => (degrees[tile.id] ?? 0) === 0).map((tile) => tile.id);
  diagnostics.interiorShortfall = 0;
  for (const tile of tiles) {
    const neighbors = tiles.filter((other) => other.id !== tile.id && Math.abs(other.ix - tile.ix) + Math.abs(other.iy - tile.iy) === 1).length;
    if (neighbors >= 2 && (degrees[tile.id] ?? 0) < 2) diagnostics.interiorShortfall += 1;
  }

  } finally { finishTiming(); }
}
