import type { ConnectionReport, Direction, Mirror, PlacedTile, PortCandidate, PortPair, PortRejection, Rotation, TileModel } from "./types";
import { portPairClearanceValidated } from "./portMatching";
import { transitionMeshes, pathLength, transitionPath, circulationProfile, formatCirculation, planRun, maxPlanSlope, ACCESSIBLE_RAMP_SLOPE, LEVEL_SLOPE, MAX_SWITCHBACK_OFFSET, type CirculationMode } from "./transitionGeometry";
import { transitionSurfaceClear } from "./connectionClearance";
import { findOrganicLinks, sealOrganicGraph, type JoinedStory, type OrganicDiagnostics, type OrganicLink, type OrganicRejection } from "./organicConnections";
import { confirmedWalkableInterface, fitLoftContact, measureSurfaceGap, SURFACE_CONTACT_TOLERANCE } from "./surfaceAttachment";
import { LATTICE_FEET, oppositeDirection, placementWorldZ, unpackCell } from "./types";

export type ConnectorKind = "bridge" | "plate" | "ramp" | "stair" | "landing" | "vertical-link";

export type GeneratedConnector = {
  id: string;
  kind: ConnectorKind;
  fromTile: string;
  toTile: string;
  direction: Direction | "none";
  /** Thin walkable slab vertices (feet, Z-up). */
  positions: Float32Array;
  indices: number[];
  reason: string;
  cost: number;
  portPair?:PortPair;
  /** Rise, horizontal run, and rise/run of this generated circulation path. */
  circulation?: { rise: number; run: number; slope: number };
};

export type SynthesisResult = {
  connectors: GeneratedConnector[];
  directInterlocks: number;
  bridges: number;
  ramps: number;
  stairs: number;
  landings: number;
  verticalLinks: number;
  /** Controlled local overlaps that are not full-mass collisions. */
  interlocks: number;
  /** Short branch transitions, including branch-to-plane landings. */
  organicConnectors: number;
  connectorCost: number;
  organicDiagnostics?: OrganicDiagnostics;
  /** Assignment-mode accepted architectural relationships (also includes near-touch pairs). */
  portPairs?: PortPair[];
  fallbackConnections?: number;
  portCandidates?: PortCandidate[];
  connectionDiagnostics?: {candidateCount:number;acceptedCount:number;rejectedCount:number;rejectionCounts:Partial<Record<PortRejection,number>>;componentsBefore:number;componentsAfter:number};
};

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function rotateMirrorOffset(x: number, y: number, z: number, rotation: Rotation, mirror: Mirror): [number, number, number] {
  let px = mirror === "x" ? -x : x;
  let py = mirror === "y" ? -y : y;
  const pz = z;
  if (rotation === 90) {
    const nextX = -py;
    py = px;
    px = nextX;
  } else if (rotation === 180) {
    px = -px;
    py = -py;
  } else if (rotation === 270) {
    const nextX = py;
    py = -px;
    px = nextX;
  }
  return [px, py, pz];
}

/** World point for a registered tile: lattice root + offset from registration anchor. */
function tileWorldPoint(tile: PlacedTile, model: TileModel, localFromAnchor: [number, number, number]): [number, number, number] {
  const variant = model.variants[tile.variant] ?? model.variants[0];
  const [lx, ly, lz] = rotateMirrorOffset(localFromAnchor[0], localFromAnchor[1], localFromAnchor[2], variant.rotation, variant.mirror);
  return [tile.ix * LATTICE_FEET + lx, tile.iy * LATTICE_FEET + ly, placementWorldZ(tile) + lz];
}

function tileFacePoint(tile: PlacedTile, model: TileModel, direction: Direction | "none"): [number, number, number] {
  const [ax, ay, az] = model.anchor;
  const [minX, minY, minZ] = model.bboxMin;
  const [maxX, maxY, maxZ] = model.bboxMax;
  void minZ;
  const midZ = az + Math.max(1.0, (maxZ - minZ) * 0.2);
  let local: [number, number, number] = [model.center[0] - ax, model.center[1] - ay, midZ - az];
  if (direction === "+X") local = [maxX - ax, model.center[1] - ay, midZ - az];
  if (direction === "-X") local = [minX - ax, model.center[1] - ay, midZ - az];
  if (direction === "+Y") local = [model.center[0] - ax, maxY - ay, midZ - az];
  if (direction === "-Y") local = [model.center[0] - ax, minY - ay, midZ - az];
  if (direction === "+Z") local = [model.center[0] - ax, model.center[1] - ay, maxZ - az];
  if (direction === "-Z") local = [model.center[0] - ax, model.center[1] - ay, Math.max(0.5, midZ - az)];
  return tileWorldPoint(tile, model, local);
}

function walkableWorldPoints(tile: PlacedTile, model: TileModel): Array<[number, number, number]> {
  const variant = model.variants[tile.variant] ?? model.variants[0];
  const packed = variant.floor.length ? variant.floor : variant.passage.length ? variant.passage : variant.occupied;
  if (!packed.length) return [];
  const cell = model.cellFeet;
  const step = packed.length > 160 ? Math.ceil(packed.length / 160) : 1;
  const out: Array<[number, number, number]> = [];
  const z0 = placementWorldZ(tile);
  for (let index = 0; index < packed.length; index += step) {
    const [x, y, z] = unpackCell(packed[index]);
    out.push([
      tile.ix * LATTICE_FEET + (x + 0.5) * cell,
      tile.iy * LATTICE_FEET + (y + 0.5) * cell,
      z0 + (z + 0.5) * cell,
    ]);
  }
  return out;
}

export type BranchPair = {
  from: [number, number, number];
  to: [number, number, number];
  distance: number;
  plan: number;
  rise: number;
};

export function closestBranchPair(a: PlacedTile, modelA: TileModel, b: PlacedTile, modelB: TileModel): BranchPair | null {
  const pa = walkableWorldPoints(a, modelA);
  const pb = walkableWorldPoints(b, modelB);
  if (!pa.length || !pb.length) return null;
  let best: (BranchPair & { score: number }) | null = null;
  for (const from of pa) {
    for (const to of pb) {
      const plan = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const rise = to[2] - from[2];
      const distance = Math.hypot(plan, rise);
      const profile = circulationProfile(plan, rise);
      const usability: Record<CirculationMode, number> = { level: 8, ramp: 7, switchback: 5, stair: 3, reject: -20 };
      const score = usability[profile.mode] * 6 - profile.slope * 8 - plan * 0.08;
      if (!best || score > best.score) best = { from, to, distance, plan, rise, score };
    }
  }
  return best;
}

/** Higher is better. Rewards orientations where branch tips nearly meet. */
export function branchProximityBonus(models: TileModel[], tiles: PlacedTile[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  const resolve = (id: string) => byId.get(id) ?? byId.get(sourceIdOf(id));
  let bonus = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const a = tiles[i];
      const b = tiles[j];
      if (Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy) > 1) continue;
      const modelA = resolve(a.id);
      const modelB = resolve(b.id);
      if (!modelA || !modelB) continue;
      const pair = closestBranchPair(a, modelA, b, modelB);
      if (!pair) continue;
      bonus += Math.max(0, 16 - pair.distance) * 1.8;
      if (pair.distance < 6) bonus += 8;
      if (pair.distance < 3) bonus += 10;
    }
  }
  return bonus;
}

function landingPad(center: [number, number, number], size: number) {
  return orientedSlab(
    [center[0] - size / 2, center[1], center[2]],
    [center[0] + size / 2, center[1], center[2]],
    size,
    0.38,
  );
}

/** Thin walkable slab that follows from→to. Not an AABB (those became gold blocks). */
function orientedSlab(
  from: [number, number, number],
  to: [number, number, number],
  width: number,
  thickness: number,
): { positions: Float32Array; indices: number[] } | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.35) return null;
  const ux = dx / len;
  const uy = dy / len;
  let px = -uy;
  let py = ux;
  let plen = Math.hypot(px, py);
  if (plen < 1e-6) {
    px = 1;
    py = 0;
    plen = 1;
  }
  px /= plen;
  py /= plen;
  const hw = width / 2;
  const ht = thickness / 2;
  const corners: Array<[number, number, number]> = [];
  for (const end of [from, to] as const) {
    for (const side of [-1, 1] as const) {
      for (const up of [-1, 1] as const) {
        corners.push([
          end[0] + px * hw * side,
          end[1] + py * hw * side,
          end[2] + ht * up,
        ]);
      }
    }
  }
  // 0 from-s-dn, 1 from-s-up, 2 from+s-dn, 3 from+s-up, 4 to-s-dn, 5 to-s-up, 6 to+s-dn, 7 to+s-up
  const positions = new Float32Array(corners.flat());
  const indices = [
    0, 2, 3, 0, 3, 1,
    4, 5, 7, 4, 7, 6,
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3,
    1, 3, 7, 1, 7, 5,
    0, 4, 6, 0, 6, 2,
  ];
  return { positions, indices };
}

function stairFlight(
  from: [number, number, number],
  to: [number, number, number],
  steps: number,
): GeneratedConnector[] {
  const out: GeneratedConnector[] = [];
  for (let index = 0; index < steps; index += 1) {
    const t0 = index / steps;
    const t1 = (index + 1) / steps;
    const a: [number, number, number] = [
      from[0] + (to[0] - from[0]) * t0,
      from[1] + (to[1] - from[1]) * t0,
      from[2] + (to[2] - from[2]) * t0,
    ];
    const b: [number, number, number] = [
      from[0] + (to[0] - from[0]) * t1,
      from[1] + (to[1] - from[1]) * t1,
      from[2] + (to[2] - from[2]) * t1,
    ];
    const mesh = orientedSlab(a, b, 3.2, 0.45);
    if (!mesh) continue;
    out.push({
      id: `stair-step-${index}`,
      kind: index === 0 || index === steps - 1 ? "landing" : "stair",
      fromTile: "",
      toTile: "",
      direction: "none",
      positions: mesh.positions,
      indices: mesh.indices,
      reason: "Stair riser / tread for vertical registration difference",
      cost: 1.2,
    });
  }
  return out;
}

/**
 * Priority hierarchy:
 * 1 direct interlock (voxel touch) → no mesh
 * 2 landings at both branch tips
 * 3 short plate / bridge between tips
 * 4 ramp
 * 5 stair flight
 */
export function synthesizeConnectors(
  models: TileModel[],
  placed: PlacedTile[],
  connections: ConnectionReport[],
  options?: { portPairs: PortPair[]; candidates?: PortCandidate[]; componentsBefore?:number; componentsAfter?:number; rejectionCounts?:Partial<Record<PortRejection,number>> },
): SynthesisResult {
  if (options) {
    const result=synthesizePortConnectors(models,placed,connections,options.portPairs);
    result.portCandidates=options.candidates;
    if(options.candidates)result.connectionDiagnostics={candidateCount:options.candidates.length,acceptedCount:result.portPairs!.length,rejectedCount:options.candidates.length-result.portPairs!.length,rejectionCounts:options.rejectionCounts??{},componentsBefore:options.componentsBefore??placed.length,componentsAfter:options.componentsAfter??placed.length};
    return result;
  }
  const byTile = new Map(placed.map((tile) => [tile.id, tile]));
  const byModel = new Map(models.map((model) => [model.id, model]));
  const resolveModel = (tileId: string) => byModel.get(tileId) ?? byModel.get(sourceIdOf(tileId));
  const connectors: GeneratedConnector[] = [];
  let directInterlocks = 0;
  let bridges = 0;
  let ramps = 0;
  let stairs = 0;
  let landings = 0;
  let verticalLinks = 0;
  let connectorCost = 0;
  const handled = new Set<string>();

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  function addMesh(
    id: string,
    kind: ConnectorKind,
    fromTile: string,
    toTile: string,
    direction: Direction | "none",
    mesh: { positions: Float32Array; indices: number[] },
    reason: string,
    cost: number,
  ) {
    connectors.push({ id, kind, fromTile, toTile, direction, positions: mesh.positions, indices: mesh.indices, reason, cost });
    if (kind === "bridge" || kind === "plate") bridges += 1;
    else if (kind === "ramp") ramps += 1;
    else if (kind === "stair") stairs += 1;
    else if (kind === "landing") landings += 1;
    else verticalLinks += 1;
    connectorCost += cost;
  }

  function joinBranches(
    a: PlacedTile,
    b: PlacedTile,
    modelA: TileModel,
    modelB: TileModel,
    direction: Direction | "none",
    force: boolean,
  ) {
    const key = pairKey(a.id, b.id);
    if (handled.has(key)) return;
    const pair = closestBranchPair(a, modelA, b, modelB);
    const fallbackFrom = tileFacePoint(a, modelA, direction);
    const fallbackTo = tileFacePoint(b, modelB, direction === "none" ? "none" : oppositeDirection(direction));
    const from = pair?.from ?? fallbackFrom;
    const to = pair?.to ?? fallbackTo;
    const plan = pair?.plan ?? Math.hypot(to[0] - from[0], to[1] - from[1]);
    const absRise = Math.abs(pair?.rise ?? (to[2] - from[2]));
    const distance = pair?.distance ?? Math.hypot(plan, absRise);
    if (distance < 1.15) {
      handled.add(key);
      directInterlocks += 1;
      return;
    }
    if (plan > 16 || absRise > LATTICE_FEET * 1.15) return;
    if (!force && distance > 14) return;
    handled.add(key);
    const idBase = `${a.id}__${b.id}`;

    const padA = landingPad(from, 3.6);
    const padB = landingPad(to, 3.6);
    if (padA) addMesh(`${idBase}-landing-a`, "landing", a.id, b.id, direction, padA, "Landing at branch tip", 0.8);
    if (padB) addMesh(`${idBase}-landing-b`, "landing", a.id, b.id, direction, padB, "Landing at branch tip", 0.8);

    if (absRise < 1.4) {
      const mesh = orientedSlab(from, to, plan < 7 ? 3.8 : 3.2, 0.36);
      if (mesh) addMesh(`${idBase}-bridge`, plan < 7 ? "plate" : "bridge", a.id, b.id, direction, mesh, "Plate / bridge between facing branches", plan < 7 ? 1 : 2);
      return;
    }
    if (plan >= absRise * 0.55 && absRise <= 12) {
      const mesh = orientedSlab(from, to, 3.2, 0.34);
      if (mesh) addMesh(`${idBase}-ramp`, "ramp", a.id, b.id, direction, mesh, "Ramp between offset branch levels", 2.5);
      return;
    }
    const steps = Math.max(3, Math.min(9, Math.round(absRise / 1.8)));
    for (const step of stairFlight(from, to, steps)) {
      addMesh(`${idBase}-${step.kind}-${step.id}`, step.kind, a.id, b.id, direction, { positions: step.positions, indices: step.indices }, "Stair between branch joints", step.cost);
    }
  }

  for (const connection of connections) {
    const a = byTile.get(connection.tileA);
    const b = byTile.get(connection.tileB);
    const modelA = a ? resolveModel(a.id) : undefined;
    const modelB = b ? resolveModel(b.id) : undefined;
    if (!a || !b || !modelA || !modelB) continue;
    const manhattan = Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy);
    if (manhattan > 1) continue;
    if (connection.interlock === "PASS" && connection.collision !== "FAIL" && connection.floor === "PASS") {
      handled.add(pairKey(a.id, b.id));
      directInterlocks += 1;
      continue;
    }
    joinBranches(a, b, modelA, modelB, connection.direction, true);
  }

  // Neighbor tiles with no voxel report still get branch joints if tips are close.
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      if (Math.abs(a.ix - b.ix) + Math.abs(a.iy - b.iy) > 1) continue;
      const modelA = resolveModel(a.id);
      const modelB = resolveModel(b.id);
      if (!modelA || !modelB) continue;
      joinBranches(a, b, modelA, modelB, "none", false);
    }
  }

  return {
    connectors,
    directInterlocks,
    bridges,
    ramps,
    stairs,
    landings,
    verticalLinks,
    interlocks: 0,
    organicConnectors: 0,
    connectorCost,
  };
}

/** Assignment-only synthesis. Existing GLOBAL FIELD callers keep the legacy path above. */
function synthesizePortConnectors(models: TileModel[], tiles: PlacedTile[], reports: ConnectionReport[], portPairs: PortPair[]): SynthesisResult {
  const result: SynthesisResult = {connectors:[],directInterlocks:0,bridges:0,ramps:0,stairs:0,landings:0,verticalLinks:0,interlocks:0,organicConnectors:0,connectorCost:0,portPairs,fallbackConnections:0};
  result.portPairs=[];
  const add = (original: PortPair, fallback=false) => {
    const surfaces = pairHasSurfaces(original, models, tiles);
    const pair = neckForLoft({...original, connectionClass: original.connectionClass ?? (Math.abs(original.rise) > 0.5 ? "VERTICAL" : original.plan <= 4 ? "DIRECT" : "ADAPTIVE")});
    const routedBend = pathBend(original.path, original.from, original.to);
    pair.path = pair.connectionClass === "VERTICAL" && Math.abs(routedBend) > 6 ? switchbackRampPath(pair.from, pair.to, routedBend) : transitionPath(pair, routedBend);
    if (surfaces && !portCentersMeet(pair, models, tiles)) return false;
    if (!portPairClearanceValidated(original, models, tiles) && !transitionSurfaceClear(pair, tiles, models, result.connectors)) return false;
    const meshes=transitionMeshes(pair),run=planRun(pair.path??[]),slope=Math.abs(pair.rise)/Math.max(run,0.25);
    const circulation={rise:pair.rise,run,slope};
    const area=pathLength(pair.path??[])*((pair.startWidth??pair.usableWidth)+(pair.endWidth??pair.usableWidth))/2;
    const cost=area*.025+area*.25*.015+Math.abs(pair.rise)*.4;
    const contact = surfaces ? contactNote(pair, models, tiles) : "";
    const reason=fallback?"Conservative edge-profile fallback":`${pair.connectionClass}: smooth edge loft, ${formatCirculation(pair.rise,run,slope)}${contact}`;
    for(const [index,mesh] of meshes.entries())result.connectors.push({id:`${pair.tileA}__${pair.tileB}-loft-${index}`,fromTile:pair.tileA,toTile:pair.tileB,direction:"none",...mesh,portPair:pair,cost:cost/meshes.length,reason,circulation});
    result.connectorCost+=cost;
    if(pair.connectionClass==="DIRECT")result.directInterlocks++;
    if(meshes[0]?.kind==="ramp")result.ramps++;
    else if(meshes[0]?.kind==="stair")result.stairs++;
    else result.bridges++;
    if(!fallback)result.portPairs!.push(pair);
    return true;
  };
  for(const pair of portPairs)add(pair);
  const joined: JoinedStory[] = (result.portPairs ?? []).map((pair) => ({ tileA: pair.tileA, tileB: pair.tileB, elevation: (pair.from[2] + pair.to[2]) / 2 }));
  const joinedKeys = new Set(joined.map((story) => (story.tileA < story.tileB ? `${story.tileA}|${story.tileB}` : `${story.tileB}|${story.tileA}`)));
  const unresolved: Array<{ pair: string; detail: string }> = [];
  for (const report of reports) {
    if (report.interlock !== "PASS" || report.collision === "FAIL" || (report.floor !== "PASS" && report.circulation !== "PASS")) continue;
    const key = report.tileA < report.tileB ? `${report.tileA}|${report.tileB}` : `${report.tileB}|${report.tileA}`;
    if (joinedKeys.has(key)) continue;
    const tileA = tiles.find((tile) => tile.id === report.tileA);
    const tileB = tiles.find((tile) => tile.id === report.tileB);
    const modelA = tileA ? resolveSynthesisModel(models, tileA.id) : undefined;
    const modelB = tileB ? resolveSynthesisModel(models, tileB.id) : undefined;
    const confirmed = tileA && tileB && modelA && modelB ? confirmedWalkableInterface(modelA, tileA, modelB, tileB) : { meets: false, elevation: Number.NaN };
    if (!confirmed.meets) {
      unresolved.push({ pair: `${report.tileA} ↔ ${report.tileB}`, detail: "Voxel floor or circulation overlap does not meet at a walkable OBJ interface." });
      continue;
    }
    joinedKeys.add(key);
    joined.push({ tileA: report.tileA, tileB: report.tileB, elevation: confirmed.elevation });
    result.directInterlocks += 1;
  }
  const organic = findOrganicLinks(models, tiles, joined);
  const accepted: OrganicLink[] = [];
  const keptStories = new Map<string, number[]>();
  for (const link of organic.links) {
    const key = link.tileA < link.tileB ? `${link.tileA}|${link.tileB}` : `${link.tileB}|${link.tileA}`;
    const elevation = (link.from[2] + link.to[2]) / 2;
    const stories = keptStories.get(key) ?? [];
    if (stories.length >= 2 || stories.some((value) => Math.abs(value - elevation) < 4)) continue;
    const meshed = appendOrganicLink(result, link, models, tiles);
    if (meshed.ok) {
      accepted.push(link);
      stories.push(elevation);
      keptStories.set(key, stories);
    } else organic.rejections.push({ pair: `${link.tileA} ↔ ${link.tileB}`, reason: meshed.reason, detail: meshed.detail });
  }
  for (const item of unresolved) organic.rejections.push({ pair: item.pair, reason: "unresolved overlap", detail: item.detail });
  sealOrganicGraph(organic, tiles, joined, accepted);
  result.organicDiagnostics = organic;
  return result;
}

function resolveSynthesisModel(models: TileModel[], id: string) {
  return models.find((model) => model.id === id) ?? models.find((model) => model.id === id.split("::")[0]);
}

function portCentersMeet(pair: PortPair, models: TileModel[], tiles: PlacedTile[]) {
  for (const [id, point] of [[pair.tileA, pair.from], [pair.tileB, pair.to]] as const) {
    const tile = tiles.find((item) => item.id === id);
    const model = tile ? resolveSynthesisModel(models, id) : undefined;
    if (!tile || !model?.connectionSurface) continue;
    const gap = measureSurfaceGap(model, tile, point, 2);
    // Explicit ports are already access interfaces. Winding can make a walkable face look like an underside.
    if (!Number.isFinite(gap.distance) || gap.distance > SURFACE_CONTACT_TOLERANCE) return false;
  }
  return true;
}

function pairHasSurfaces(pair: PortPair, models: TileModel[], tiles: PlacedTile[]) {
  return [pair.tileA, pair.tileB].every((id) => {
    const tile = tiles.find((item) => item.id === id);
    const model = tile ? resolveSynthesisModel(models, id) : undefined;
    return Boolean(model?.connectionSurface);
  });
}

function contactNote(pair: PortPair, models: TileModel[], tiles: PlacedTile[]) {
  const describe = (id: string, point: [number, number, number]) => {
    const tile = tiles.find((item) => item.id === id);
    const model = tile ? resolveSynthesisModel(models, id) : undefined;
    if (!tile || !model) return "open";
    const gap = measureSurfaceGap(model, tile, point, 4);
    const distance = Number.isFinite(gap.distance) ? gap.distance.toFixed(2) : "none";
    return `${gap.kind} ${distance} ft`;
  };
  return `, source ${describe(pair.tileA, pair.from)}, target ${describe(pair.tileB, pair.to)}`;
}

/** A plate or ramp must earn that class from the path slope. A steep short span is not level. */
function acceptCirculationClass(pair: PortPair) {
  const path = pair.path ?? [];
  const run = planRun(path);
  const rise = pair.rise;
  const slope = Math.abs(rise) / Math.max(run, 0.25);
  const local = maxPlanSlope(path);
  const stair = pair.connectionClass === "VERTICAL" && run + 1e-3 < Math.abs(rise) * 12;
  if (stair) return !(run > 16 && slope < 0.15);
  if (local > ACCESSIBLE_RAMP_SLOPE + 0.03 || slope > ACCESSIBLE_RAMP_SLOPE + 1e-3) {
    const absRise = Math.abs(rise);
    const stairRun = Math.max(2, absRise * 0.4);
    if (absRise <= 12 && run >= stairRun) {
      pair.connectionClass = "VERTICAL";
      return true;
    }
    return false;
  }
  if (pair.connectionClass !== "VERTICAL" && slope > LEVEL_SLOPE + 1e-6) pair.connectionClass = "VERTICAL";
  return true;
}

/** A coincident shared face has no span for a bezier. Pull the loft ends a short shoulder apart without moving the source mesh. */
function neckForLoft(pair: PortPair): PortPair {
  const plan = Math.hypot(pair.to[0] - pair.from[0], pair.to[1] - pair.from[1]);
  if (plan >= 0.75) return pair;
  const dx = pair.to[0] - pair.from[0];
  const dy = pair.to[1] - pair.from[1];
  const ux = plan > 0.05 ? dx / plan : pair.startDirection?.[0] ?? 1;
  const uy = plan > 0.05 ? dy / plan : pair.startDirection?.[1] ?? 0;
  const length = Math.hypot(ux, uy) || 1;
  const sx = ux / length;
  const sy = uy / length;
  const shoulder = 0.9;
  const from: [number, number, number] = [pair.from[0] - sx * shoulder, pair.from[1] - sy * shoulder, pair.from[2]];
  const to: [number, number, number] = [pair.to[0] + sx * shoulder, pair.to[1] + sy * shoulder, pair.to[2]];
  const nextPlan = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const rise = to[2] - from[2];
  return {
    ...pair,
    from,
    to,
    plan: nextPlan,
    rise,
    distance: Math.hypot(nextPlan, rise),
    startDirection: pair.startDirection ?? [sx, sy, 0],
    endDirection: pair.endDirection ?? [-sx, -sy, 0],
  };
}

function pathBend(path: Array<[number, number, number]> | undefined, from: [number, number, number], to: [number, number, number]) {
  if (!path || path.length < 3) return 0;
  const mid = path[Math.floor(path.length / 2)];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy) || 1;
  const sx = dx / plan;
  const sy = dy / plan;
  return (mid[0] - (from[0] + to[0]) / 2) * -sy + (mid[1] - (from[1] + to[1]) / 2) * sx;
}

function samplePolyline(points: Array<[number, number, number]>, spacing: number) {
  const out: Array<[number, number, number]> = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      out.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, start[2] + (end[2] - start[2]) * t]);
    }
  }
  return out;
}

function buildSwitchback(from: [number, number, number], to: [number, number, number], bend: number) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy) || 1;
  const ux = dx / plan;
  const uy = dy / plan;
  const rise = to[2] - from[2];
  const landing = Math.min(4, Math.max(2, (Math.abs(rise) / ACCESSIBLE_RAMP_SLOPE) * 0.12));
  const midX = (from[0] + to[0]) / 2 - uy * bend;
  const midY = (from[1] + to[1]) / 2 + ux * bend;
  const landingZ = from[2] + rise * 0.5;
  const landA: [number, number, number] = [midX - ux * landing / 2, midY - uy * landing / 2, landingZ];
  const landB: [number, number, number] = [midX + ux * landing / 2, midY + uy * landing / 2, landingZ];
  return samplePolyline([from, landA, landB, to], 0.75);
}

/** Lengthen a steep gap into a 1:12 ramp with a level landing. Endpoints stay on their own surface elevations. */
function switchbackRampPath(from: [number, number, number], to: [number, number, number], bend: number) {
  const sign = Math.sign(bend) || 1;
  const required = Math.abs(to[2] - from[2]) / ACCESSIBLE_RAMP_SLOPE;
  let offset = Math.max(0.5, Math.abs(bend));
  let path = buildSwitchback(from, to, sign * offset);
  while (planRun(path) + 1e-3 < required && offset < MAX_SWITCHBACK_OFFSET) {
    offset = Math.min(MAX_SWITCHBACK_OFFSET, offset + 0.5);
    path = buildSwitchback(from, to, sign * offset);
  }
  return path;
}

function rejectLink(reason: OrganicRejection, detail: string) {
  return { ok: false as const, reason, detail };
}

function appendOrganicLink(result: SynthesisResult, link: OrganicLink, models: TileModel[], tiles: PlacedTile[]) {
  const widthA = Math.min(link.widthA, link.relation === "plane-plane" ? 8 : 6);
  const widthB = Math.min(link.widthB, link.relation === "plane-plane" ? 8 : 6);
  if (widthA < 2 || widthB < 2) return rejectLink("no landing surface", "Usable attachment width is under 2 ft.");
  const dx = link.to[0] - link.from[0];
  const dy = link.to[1] - link.from[1];
  const plan = Math.hypot(dx, dy) || 1;
  const sx = dx / plan;
  const sy = dy / plan;
  const profile = circulationProfile(plan, link.rise);
  if (profile.mode === "reject") return rejectLink("invalid circulation", `Rise ${link.rise.toFixed(1)} ft over run ${plan.toFixed(1)} ft, slope ${profile.slope.toFixed(3)}, is not a usable path.`);
  let bend = 0;
  if (link.via) {
    const mx = (link.from[0] + link.to[0]) / 2;
    const my = (link.from[1] + link.to[1]) / 2;
    bend = (link.via[0] - mx) * -sy + (link.via[1] - my) * sx;
  }
  const connectionClass = profile.mode === "ramp" || profile.mode === "switchback" || profile.mode === "stair" ? "VERTICAL" as const : plan <= 4 ? "DIRECT" as const : "ADAPTIVE" as const;
  const pair: PortPair = {
    tileA: link.tileA,
    tileB: link.tileB,
    portA: "organic",
    portB: "organic",
    from: link.from,
    to: link.to,
    plan,
    rise: link.rise,
    distance: link.distance,
    facing: 1,
    widthCompatibility: Math.min(widthA, widthB) / Math.max(widthA, widthB),
    usableWidth: Math.min(widthA, widthB),
    confidence: 0.8,
    score: 0,
    connectionClass,
    startWidth: widthA,
    endWidth: widthB,
    startDirection: link.fromDirection ?? [sx, sy, 0],
    endDirection: link.toDirection ?? [-sx, -sy, 0],
    startProfile: link.fromProfile,
    endProfile: link.toProfile,
    angle: 0,
    lateralOffset: 0,
  };
  const lateral = link.bend ?? bend;
  if (profile.mode === "switchback" && Math.abs(lateral) > 0.5) {
    pair.path = switchbackRampPath(pair.from, pair.to, lateral);
    const gained = planRun(pair.path);
    const stairRun = Math.max(2, Math.abs(link.rise) * 0.4);
    if (gained + 1e-3 < Math.abs(pair.rise) / ACCESSIBLE_RAMP_SLOPE && Math.abs(link.rise) > 0.5 && Math.abs(link.rise) <= 12 && plan >= stairRun && plan <= 18) {
      pair.connectionClass = "VERTICAL";
      pair.path = transitionPath(pair, 0);
    }
  } else if (profile.mode === "switchback") {
    const stairRun = Math.max(2, Math.abs(link.rise) * 0.4);
    if (!(Math.abs(link.rise) <= 12 && plan >= stairRun)) return rejectLink("invalid circulation", "A switchback does not fit, and the straight run is too short for stairs.");
    pair.connectionClass = "VERTICAL";
    pair.path = transitionPath(pair, 0);
  } else pair.path = transitionPath(pair, profile.mode === "level" ? 0 : bend);
  if (!acceptCirculationClass(pair)) return rejectLink("invalid circulation", `The path is steeper than a ramp and has no validated stair run. ${formatCirculation(link.rise, plan, profile.slope)}.`);
  if (!fitLoftContact(pair, models, tiles, false)) return rejectLink("missed surface", `Loft ends do not meet walkable surfaces${contactNote(pair, models, tiles)}.`);
  if (!transitionSurfaceClear(pair, tiles, models, result.connectors)) return rejectLink("route collision", "The loft intersects an OBJ or another connection.");
  const run = planRun(pair.path ?? []);
  const slope = Math.abs(pair.rise) / Math.max(run, 0.25);
  const localSlope = maxPlanSlope(pair.path ?? []);
  const meshes = transitionMeshes(pair);
  const meshKind = meshes[0]?.kind;
  if (meshKind === "ramp" && (slope > ACCESSIBLE_RAMP_SLOPE + 1e-3 || localSlope > ACCESSIBLE_RAMP_SLOPE + 0.03)) {
    return rejectLink("invalid circulation", `Ramp slope ${Math.max(slope, localSlope).toFixed(3)} exceeds 1:12.`);
  }
  if ((meshKind === "plate" || meshKind === "bridge") && localSlope > ACCESSIBLE_RAMP_SLOPE + 0.03) {
    return rejectLink("invalid circulation", `Connection classified as ${meshKind} has a segment slope of ${localSlope.toFixed(3)}.`);
  }
  const traveled = pathLength(pair.path ?? []);
  const cost = traveled * ((widthA + widthB) / 2) * 0.02 + Math.abs(pair.rise) * 0.35;
  const circulation = { rise: pair.rise, run, slope };
  const reason = `smooth ${meshKind ?? link.kind} ${link.relation}: ${formatCirculation(pair.rise, run, slope)}${contactNote(pair, models, tiles)}`;
  for (const [index, mesh] of meshes.entries()) {
    result.connectors.push({
      id: `${link.tileA}__${link.tileB}-loft-${Math.round(link.from[2] * 10)}-${index}`,
      fromTile: link.tileA,
      toTile: link.tileB,
      direction: "none",
      ...mesh,
      portPair: pair,
      cost: cost / meshes.length,
      reason,
      circulation,
    });
  }
  result.connectorCost += cost;
  if (meshKind === "stair") link.kind = "stair";
  else if (meshKind === "ramp") link.kind = "ramp";
  if (link.kind === "interlock") result.interlocks += 1;
  else if (link.kind === "organic") result.organicConnectors += 1;
  else if (meshKind === "stair" || link.kind === "stair") result.stairs += 1;
  else if (meshKind === "ramp" || link.kind === "ramp") result.ramps += 1;
  else result.bridges += 1;
  return { ok: true as const };
}

export function connectorsToObj(connectors: GeneratedConnector[]) {
  const lines = ["# Generated connection synthesis geometry", "o generated_connectors"];
  let offset = 1;
  for (const connector of connectors) {
    lines.push(`g ${connector.kind}_${connector.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`);
    for (let index = 0; index < connector.positions.length; index += 3) {
      lines.push(`v ${connector.positions[index].toFixed(5)} ${connector.positions[index + 1].toFixed(5)} ${connector.positions[index + 2].toFixed(5)}`);
    }
    for (let index = 0; index < connector.indices.length; index += 3) {
      lines.push(`f ${connector.indices[index] + offset} ${connector.indices[index + 1] + offset} ${connector.indices[index + 2] + offset}`);
    }
    offset += connector.positions.length / 3;
  }
  return `${lines.join("\n")}\n`;
}
