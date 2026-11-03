/**
 * Sequential Ascent: one verified route from the main entry to the highest
 * occupied floor reachable on the walk+step network. Potential links, stacked
 * plates, and nearby levels without a supported chain do not count.
 */
import { pathTo, shortestPaths, WALK_RISE_FEET, type CirculationNetwork, type Entry } from "./circulation";
import type { Vec3 } from "./geometry";
import type { FloorField, Level } from "./surfaces";

/** Rise below this is same-floor noise, not verified ascent. */
export const ASCENT_MIN_GAIN_FEET = 0.5;
const ARROW_SPACING_FEET = 8;

export type AscentStageKind = "Entry" | "Landing" | "Arrival";

export type AscentStage = {
  kind: AscentStageKind;
  index: number;
  position: Vec3;
  levelId: number;
};

export type AscentResult = {
  entry: Entry | null;
  pathNodeIds: number[];
  path: Vec3[];
  descentSegments: Array<{ a: Vec3; b: Vec3 }>;
  riseArrows: Array<{ a: Vec3; b: Vec3 }>;
  riseLabel: { a: Vec3; b: Vec3; text: string } | null;
  stages: AscentStage[];
  metrics: Array<{ a: Vec3; b: Vec3; text: string }>;
  gainFeet: number;
  higherLevelsReached: number;
  destinationLevelId: number;
  hasDescent: boolean;
  notes: string[];
};

function emptyAscent(notes: string[], entry: Entry | null = null): AscentResult {
  return {
    entry,
    pathNodeIds: [],
    path: [],
    descentSegments: [],
    riseArrows: [],
    riseLabel: null,
    stages: entry ? [{ kind: "Entry", index: 1, position: entry.centroid, levelId: entry.levelId }] : [],
    metrics: [],
    gainFeet: 0,
    higherLevelsReached: 0,
    destinationLevelId: -1,
    hasDescent: false,
    notes,
  };
}

/** Largest opening on the lowest occupied elevation; ties keep the lowest entry id. */
export function pickMainEntry(entries: Entry[]): Entry | null {
  if (!entries.length) return null;
  const lowestZ = Math.min(...entries.map((entry) => entry.centroid[2]));
  const atGrade = entries.filter((entry) => entry.centroid[2] <= lowestZ + ASCENT_MIN_GAIN_FEET);
  return [...atGrade].sort((left, right) => {
    if (right.nodeIds.length !== left.nodeIds.length) return right.nodeIds.length - left.nodeIds.length;
    return left.id - right.id;
  })[0];
}

function levelOf(field: FloorField, levelId: number): Level | undefined {
  return field.levels.find((level) => level.id === levelId);
}

function pickDestination(network: CirculationNetwork, reachable: number[], highestId: number, dist: Float64Array) {
  const candidates = reachable.filter((id) => network.nodes[id].levelId === highestId);
  let destId = candidates[0];
  for (const id of candidates) {
    const node = network.nodes[id];
    const best = network.nodes[destId];
    const rise = node.position[2] - best.position[2];
    if (rise > 1e-6) {
      destId = id;
      continue;
    }
    if (rise < -1e-6) continue;
    if (dist[id] < dist[destId] - 1e-6) {
      destId = id;
      continue;
    }
    if (Math.abs(dist[id] - dist[destId]) <= 1e-6 && id < destId) destId = id;
  }
  return destId;
}

function isDescent(a: Vec3, b: Vec3) {
  return b[2] < a[2] - WALK_RISE_FEET;
}

function collectArrows(path: Vec3[]) {
  const arrows: Array<{ a: Vec3; b: Vec3 }> = [];
  let travelled = 0;
  let sinceArrow = 0;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    travelled += length;
    if (isDescent(a, b) || length < 1e-6) {
      sinceArrow = 0;
      continue;
    }
    sinceArrow += length;
    if (sinceArrow >= ARROW_SPACING_FEET || index === path.length - 1) {
      arrows.push({ a, b });
      sinceArrow = 0;
    }
  }
  if (!arrows.length) {
    for (let index = 1; index < path.length; index += 1) {
      if (!isDescent(path[index - 1], path[index])) {
        arrows.push({ a: path[index - 1], b: path[index] });
        break;
      }
    }
  }
  return arrows;
}

function firstRise(path: Vec3[]): { a: Vec3; b: Vec3; text: string } | null {
  let climbed = 0;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const rise = b[2] - a[2];
    if (rise <= WALK_RISE_FEET) continue;
    climbed += rise;
    if (climbed >= ASCENT_MIN_GAIN_FEET) return { a, b, text: "Rise" };
  }
  return null;
}

function metricLines(path: Vec3[], gainFeet: number, higherLevelsReached: number) {
  const first = path[0];
  const last = path[path.length - 1];
  let minX = Infinity;
  let minY = Infinity;
  for (const point of path) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
  }
  const side: Vec3 = [minX - 4, minY - 2, first[2]];
  const top: Vec3 = [side[0], side[1], last[2]];
  const aside: Vec3 = [side[0] + 8, side[1], last[2]];
  return [
    { a: side, b: top, text: `${gainFeet.toFixed(1)} ft` },
    { a: top, b: aside, text: `${higherLevelsReached} higher levels` },
  ];
}

export function measureAscent(network: CirculationNetwork, field: FloorField): AscentResult {
  const entry = pickMainEntry(network.entries);
  if (!entry) return emptyAscent(["No main entry on the lowest occupied level. Ascent is 0."]);

  const { dist, prev } = shortestPaths(network, entry.nodeIds);
  const reachable: number[] = [];
  for (let id = 0; id < dist.length; id += 1) if (Number.isFinite(dist[id])) reachable.push(id);
  if (!reachable.length) {
    return emptyAscent(["The main entry has no supported movement from its nodes. Ascent is 0."], entry);
  }

  const reachableLevels = new Map<number, Level>();
  for (const id of reachable) {
    const level = levelOf(field, network.nodes[id].levelId);
    if (level) reachableLevels.set(level.id, level);
  }
  if (!reachableLevels.size) {
    return emptyAscent(["No detected floor is reachable from the main entry. Ascent is 0."], entry);
  }

  const highest = [...reachableLevels.values()].sort((left, right) => {
    if (right.elevation !== left.elevation) return right.elevation - left.elevation;
    return left.id - right.id;
  })[0];
  const destId = pickDestination(network, reachable, highest.id, dist);
  const pathNodeIds = pathTo(prev, destId);
  const path = pathNodeIds.map((id) => network.nodes[id].position);
  const dest = network.nodes[destId];
  const rawGain = dest.position[2] - entry.centroid[2];
  const gainFeet = rawGain >= ASCENT_MIN_GAIN_FEET ? rawGain : 0;
  if (gainFeet <= 0) {
    return emptyAscent([
      dest.levelId === entry.levelId
        ? "No verified upward connection from the main entry. Stacked or nearby floors without a supported route do not count. Ascent is 0."
        : "The highest reachable floor is not above the entry. Ascent is 0.",
    ], entry);
  }

  const entryElevation = levelOf(field, entry.levelId)?.elevation ?? entry.centroid[2];
  const visitedHigher = new Set<number>();
  for (const id of pathNodeIds) {
    const level = levelOf(field, network.nodes[id].levelId);
    if (!level || level.id === entry.levelId) continue;
    if (level.elevation > entryElevation + ASCENT_MIN_GAIN_FEET) visitedHigher.add(level.id);
  }

  const descentSegments: Array<{ a: Vec3; b: Vec3 }> = [];
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    if (isDescent(a, b)) descentSegments.push({ a, b });
  }

  const stages: AscentStage[] = [{ kind: "Entry", index: 1, position: path[0] ?? entry.centroid, levelId: entry.levelId }];
  let markedLevel = entry.levelId;
  for (let index = 0; index < pathNodeIds.length; index += 1) {
    const nodeId = pathNodeIds[index];
    if (nodeId === destId) break;
    const node = network.nodes[nodeId];
    if (node.levelId === markedLevel || !visitedHigher.has(node.levelId)) continue;
    stages.push({ kind: "Landing", index: stages.length + 1, position: node.position, levelId: node.levelId });
    markedLevel = node.levelId;
  }
  stages.push({ kind: "Arrival", index: stages.length + 1, position: dest.position, levelId: dest.levelId });

  const notes: string[] = [];
  if (descentSegments.length) {
    notes.push("The shortest verified route includes a descent; that drop is identified and is not counted as continuous ascent.");
  }

  return {
    entry,
    pathNodeIds,
    path,
    descentSegments,
    riseArrows: collectArrows(path),
    riseLabel: firstRise(path),
    stages,
    metrics: metricLines(path, gainFeet, visitedHigher.size),
    gainFeet,
    higherLevelsReached: visitedHigher.size,
    destinationLevelId: dest.levelId,
    hasDescent: descentSegments.length > 0,
    notes,
  };
}
