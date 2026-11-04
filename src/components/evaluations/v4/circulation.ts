/**
 * v4 circulation evidence: a movement network on supported floor surfaces.
 *
 * Nodes are floor samples with standing clearance. Edges join plan neighbours
 * whose rise is walkable and whose chest-height segment is not blocked by the
 * mesh. Regions are level-walk components. Inter-level links are verified only
 * when a chain of walk/step edges actually joins two levels; plan-adjacent
 * levels without such a chain are reported as potential, never as circulation.
 */
import { distance, type TriangleGrid, type Vec3 } from "./geometry";
import { CLEARANCE_MIN_FEET, cellKey, MIN_LEVEL_AREA, type FloorField, type FloorSample, type Level } from "./surfaces";

/** Rise between neighbouring samples that is level walking (ramps up to about 1:3). */
export const WALK_RISE_FEET = 0.35;
/** Rise between neighbouring samples that is a stair riser. Larger rises are not walkable. */
export const STEP_RISE_FEET = 0.8;
/** Height of the blocking test between neighbouring nodes. */
export const CHEST_HEIGHT_FEET = 3;
/** Plan distance within which two levels are close enough to be a potential link. */
export const POTENTIAL_LINK_PLAN_FEET = 4;
/** Largest storey rise considered for a potential link. */
export const POTENTIAL_LINK_RISE_FEET = 16;
/** Horizontal distance a boundary node must see outward to count as an entry. */
export const ENTRY_PROBE_FEET = 3;

export type NetworkNode = {
  id: number;
  sampleId: number;
  position: Vec3;
  levelId: number;
  /** Component in the level-walk graph. */
  regionId: number;
  /** Component in the full graph (walk + step edges). */
  systemId: number;
  degree: number;
};

export type NetworkEdge = {
  a: number;
  b: number;
  kind: "walk" | "step";
  length: number;
};

export type Region = {
  id: number;
  levelId: number;
  nodeIds: number[];
  area: number;
  centroid: Vec3;
  /** Area-weighted mean clearance of the nodes (null entries count as 20 ft). */
  meanClearance: number;
  /** Dominant floor class by area. */
  floorClass: FloorSample["floorClass"];
};

export type LevelLink = {
  lowerLevelId: number;
  upperLevelId: number;
  status: "verified" | "potential" | "disconnected";
  /** Node ids along the verified step chain, when verified. */
  chainNodeIds: number[];
  /** Representative plan point for a potential link. */
  anchor: Vec3 | null;
};

export type Entry = {
  id: number;
  nodeIds: number[];
  centroid: Vec3;
  /** Outward unit direction in plan. */
  outward: Vec3;
  levelId: number;
};

export type CirculationNetwork = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  adjacency: Map<number, Array<{ to: number; length: number; kind: "walk" | "step" }>>;
  regions: Region[];
  systemCount: number;
  largestSystemId: number;
  levelLinks: LevelLink[];
  /** Lowest-level openings. Existing arrival geometry, not a future stair. */
  entries: Entry[];
  /**
   * Perimeter openings on any level, including upper branches. These are
   * potential inter-form connections, never verified vertical circulation.
   */
  potentialInterfaces: Entry[];
  nodeBySample: Map<number, NetworkNode>;
};

const NEIGHBOURS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function nodeEligible(sample: FloorSample, _lowestLevelId: number) {
  if (sample.levelId < 0) return false;
  if (sample.roofLid) return false;
  if (sample.clearance !== null && sample.clearance <= CLEARANCE_MIN_FEET) return false;
  return true;
}

export function buildCirculationNetwork(field: FloorField, grid: TriangleGrid): CirculationNetwork {
  const lowestLevelId = field.levels.length ? field.levels.reduce((low, level) => (level.elevation < low.elevation ? level : low)).id : -1;
  const nodes: NetworkNode[] = [];
  const nodeBySample = new Map<number, NetworkNode>();
  for (const sample of field.samples) {
    if (!nodeEligible(sample, lowestLevelId)) continue;
    const node: NetworkNode = { id: nodes.length, sampleId: sample.id, position: sample.position, levelId: sample.levelId, regionId: -1, systemId: -1, degree: 0 };
    nodes.push(node);
    nodeBySample.set(sample.id, node);
  }
  const nodesAtCell = new Map<string, NetworkNode[]>();
  for (const node of nodes) {
    const sample = field.samples[node.sampleId];
    const key = cellKey(sample.ix, sample.iy);
    const list = nodesAtCell.get(key) ?? [];
    list.push(node);
    nodesAtCell.set(key, list);
  }

  const edges: NetworkEdge[] = [];
  const adjacency = new Map<number, Array<{ to: number; length: number; kind: "walk" | "step" }>>();
  const link = (a: NetworkNode, b: NetworkNode, kind: "walk" | "step") => {
    const len = distance(a.position, b.position);
    edges.push({ a: a.id, b: b.id, kind, length: len });
    (adjacency.get(a.id) ?? adjacency.set(a.id, []).get(a.id)!).push({ to: b.id, length: len, kind });
    (adjacency.get(b.id) ?? adjacency.set(b.id, []).get(b.id)!).push({ to: a.id, length: len, kind });
    a.degree += 1;
    b.degree += 1;
  };
  for (const node of nodes) {
    const sample = field.samples[node.sampleId];
    for (const [dx, dy] of NEIGHBOURS) {
      // Visit each unordered pair once.
      if (dx < 0 || (dx === 0 && dy < 0)) continue;
      const candidates = nodesAtCell.get(cellKey(sample.ix + dx, sample.iy + dy));
      if (!candidates) continue;
      for (const other of candidates) {
        const rise = Math.abs(other.position[2] - node.position[2]);
        if (rise > STEP_RISE_FEET) continue;
        const kind: "walk" | "step" = rise <= WALK_RISE_FEET ? "walk" : "step";
        const a: Vec3 = [node.position[0], node.position[1], node.position[2] + CHEST_HEIGHT_FEET];
        const b: Vec3 = [other.position[0], other.position[1], other.position[2] + CHEST_HEIGHT_FEET];
        if (!grid.segmentClear(a, b)) continue;
        link(node, other, kind);
      }
    }
  }

  // Regions: level-walk components.
  const regionOf = components(nodes, adjacency, (kind) => kind === "walk");
  const systemOf = components(nodes, adjacency, () => true);
  let systemCount = 0;
  const systemSizes = new Map<number, number>();
  nodes.forEach((node, index) => {
    node.regionId = regionOf[index];
    node.systemId = systemOf[index];
    systemCount = Math.max(systemCount, node.systemId + 1);
    systemSizes.set(node.systemId, (systemSizes.get(node.systemId) ?? 0) + 1);
  });
  let largestSystemId = -1;
  let largestSize = 0;
  for (const [id, size] of systemSizes) {
    if (size > largestSize || (size === largestSize && id < largestSystemId)) {
      largestSize = size;
      largestSystemId = id;
    }
  }

  const regionMap = new Map<number, NetworkNode[]>();
  for (const node of nodes) {
    const list = regionMap.get(node.regionId) ?? [];
    list.push(node);
    regionMap.set(node.regionId, list);
  }
  const regions: Region[] = [];
  const regionRemap = new Map<number, number>();
  for (const [rawId, members] of [...regionMap.entries()].sort((left, right) => left[0] - right[0])) {
    const area = members.reduce((sum, node) => sum + field.samples[node.sampleId].area, 0);
    if (area < MIN_LEVEL_AREA) continue;
    const byLevel = new Map<number, number>();
    const byClass = new Map<FloorSample["floorClass"], number>();
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let clearanceSum = 0;
    for (const node of members) {
      const sample = field.samples[node.sampleId];
      byLevel.set(node.levelId, (byLevel.get(node.levelId) ?? 0) + sample.area);
      byClass.set(sample.floorClass, (byClass.get(sample.floorClass) ?? 0) + sample.area);
      cx += node.position[0] * sample.area;
      cy += node.position[1] * sample.area;
      cz += node.position[2] * sample.area;
      clearanceSum += (sample.clearance ?? 20) * sample.area;
    }
    const levelId = [...byLevel.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0][0];
    const floorClass = [...byClass.entries()].sort((left, right) => right[1] - left[1])[0][0];
    regionRemap.set(rawId, regions.length);
    regions.push({
      id: regions.length,
      levelId,
      nodeIds: members.map((node) => node.id),
      area,
      centroid: [cx / area, cy / area, cz / area],
      meanClearance: clearanceSum / area,
      floorClass,
    });
  }
  for (const node of nodes) node.regionId = regionRemap.get(node.regionId) ?? -1;

  const levelLinks = buildLevelLinks(field.levels, nodes, adjacency, field);
  const entries = findOpenings(field, nodes, nodesAtCell, grid, lowestLevelId);
  const potentialInterfaces: Entry[] = [];
  for (const level of field.levels) {
    if (level.id === lowestLevelId) continue;
    for (const opening of findOpenings(field, nodes, nodesAtCell, grid, level.id)) {
      potentialInterfaces.push({ ...opening, id: potentialInterfaces.length });
    }
  }
  for (const branch of field.branches) {
    if (!branch.independent) continue;
    potentialInterfaces.push({
      id: potentialInterfaces.length,
      nodeIds: [],
      centroid: branch.centroid,
      outward: [0, 0, 0],
      levelId: -1,
    });
  }
  return { nodes, edges, adjacency, regions, systemCount, largestSystemId, levelLinks, entries, potentialInterfaces, nodeBySample };
}

function components(
  nodes: NetworkNode[],
  adjacency: CirculationNetwork["adjacency"],
  accept: (kind: "walk" | "step") => boolean,
) {
  const result = new Int32Array(nodes.length).fill(-1);
  let next = 0;
  for (const node of nodes) {
    if (result[node.id] >= 0) continue;
    const stack = [node.id];
    result[node.id] = next;
    while (stack.length) {
      const current = stack.pop() as number;
      for (const edge of adjacency.get(current) ?? []) {
        if (!accept(edge.kind) || result[edge.to] >= 0) continue;
        result[edge.to] = next;
        stack.push(edge.to);
      }
    }
    next += 1;
  }
  return result;
}

/** For each consecutive level pair: verified chain, potential plan adjacency, or disconnected. */
function buildLevelLinks(levels: Level[], nodes: NetworkNode[], adjacency: CirculationNetwork["adjacency"], field: FloorField): LevelLink[] {
  const ordered = [...levels].sort((left, right) => left.elevation - right.elevation);
  const links: LevelLink[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const lower = ordered[index];
    const upper = ordered[index + 1];
    const chain = stepChain(lower.id, upper.id, nodes, adjacency);
    if (chain) {
      links.push({ lowerLevelId: lower.id, upperLevelId: upper.id, status: "verified", chainNodeIds: chain, anchor: null });
      continue;
    }
    const rise = upper.elevation - lower.elevation;
    const anchor = rise <= POTENTIAL_LINK_RISE_FEET ? planOverlapAnchor(lower, upper, field) : null;
    links.push({ lowerLevelId: lower.id, upperLevelId: upper.id, status: anchor ? "potential" : "disconnected", chainNodeIds: [], anchor });
  }
  return links;
}

/** Shortest walk/step path from any node on one level to any node on another. */
function stepChain(fromLevel: number, toLevel: number, nodes: NetworkNode[], adjacency: CirculationNetwork["adjacency"]): number[] | null {
  const starts = nodes.filter((node) => node.levelId === fromLevel);
  if (!starts.length) return null;
  const previous = new Int32Array(nodes.length).fill(-2);
  const queue: number[] = [];
  for (const node of starts) {
    previous[node.id] = -1;
    queue.push(node.id);
  }
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (nodes[current].levelId === toLevel) {
      const chain: number[] = [];
      let cursor = current;
      while (cursor >= 0) {
        chain.push(cursor);
        cursor = previous[cursor];
      }
      return chain.reverse();
    }
    for (const edge of adjacency.get(current) ?? []) {
      if (previous[edge.to] !== -2) continue;
      previous[edge.to] = current;
      queue.push(edge.to);
    }
  }
  return null;
}

function planOverlapAnchor(lower: Level, upper: Level, field: FloorField): Vec3 | null {
  const upperCells = new Set(upper.sampleIds.map((id) => cellKey(field.samples[id].ix, field.samples[id].iy)));
  const reach = Math.ceil(POTENTIAL_LINK_PLAN_FEET / field.sampleFeet);
  let best: Vec3 | null = null;
  for (const id of lower.sampleIds) {
    const sample = field.samples[id];
    for (let dx = -reach; dx <= reach && !best; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        if (upperCells.has(cellKey(sample.ix + dx, sample.iy + dy))) {
          best = [sample.position[0], sample.position[1], (lower.elevation + upper.elevation) / 2];
          break;
        }
      }
    }
    if (best) break;
  }
  return best;
}

/** Boundary nodes on one level whose outward side is open for ENTRY_PROBE_FEET. */
function findOpenings(field: FloorField, nodes: NetworkNode[], nodesAtCell: Map<string, NetworkNode[]>, grid: TriangleGrid, levelId: number): Entry[] {
  const boundary = new Map<number, Vec3>();
  for (const node of nodes) {
    if (node.levelId !== levelId) continue;
    const sample = field.samples[node.sampleId];
    let open: Vec3 = [0, 0, 0];
    let openCount = 0;
    for (const [dx, dy] of NEIGHBOURS.slice(0, 4)) {
      const key = cellKey(sample.ix + dx, sample.iy + dy);
      const walkableNeighbour = (nodesAtCell.get(key) ?? []).some((other) => Math.abs(other.position[2] - node.position[2]) <= STEP_RISE_FEET);
      if (walkableNeighbour) continue;
      const direction: Vec3 = [dx, dy, 0];
      const origin: Vec3 = [node.position[0], node.position[1], node.position[2] + CHEST_HEIGHT_FEET];
      if (grid.raycast(origin, direction, ENTRY_PROBE_FEET)) continue;
      // The first open direction in the fixed order is the node's primary side.
      if (!openCount) open = [dx, dy, 0];
      openCount += 1;
    }
    if (openCount) boundary.set(node.id, open);
  }
  // Cluster boundary nodes that are plan neighbours on the same open side.
  const entries: Entry[] = [];
  const assigned = new Set<number>();
  const ids = [...boundary.keys()].sort((left, right) => left - right);
  for (const start of ids) {
    if (assigned.has(start)) continue;
    const members: number[] = [];
    const stack = [start];
    const side = boundary.get(start) as Vec3;
    assigned.add(start);
    while (stack.length) {
      const current = stack.pop() as number;
      members.push(current);
      const sample = field.samples[nodes[current].sampleId];
      for (const [dx, dy] of NEIGHBOURS) {
        for (const other of nodesAtCell.get(cellKey(sample.ix + dx, sample.iy + dy)) ?? []) {
          if (assigned.has(other.id) || !boundary.has(other.id)) continue;
          const otherSide = boundary.get(other.id) as Vec3;
          if (otherSide[0] !== side[0] || otherSide[1] !== side[1]) continue;
          if (Math.abs(other.position[2] - nodes[current].position[2]) > STEP_RISE_FEET) continue;
          assigned.add(other.id);
          stack.push(other.id);
        }
      }
    }
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let ox = 0;
    let oy = 0;
    for (const id of members) {
      const node = nodes[id];
      cx += node.position[0];
      cy += node.position[1];
      cz += node.position[2];
      const open = boundary.get(id) as Vec3;
      ox += open[0];
      oy += open[1];
    }
    const count = members.length;
    const outwardLength = Math.hypot(ox, oy) || 1;
    entries.push({
      id: entries.length,
      nodeIds: members,
      centroid: [cx / count, cy / count, cz / count],
      outward: [ox / outwardLength, oy / outwardLength, 0],
      levelId,
    });
  }
  return entries;
}

/** Dijkstra over the network from one node. Returns distances and predecessor map. */
export function shortestPaths(network: CirculationNetwork, startIds: number[]) {
  const dist = new Float64Array(network.nodes.length).fill(Infinity);
  const prev = new Int32Array(network.nodes.length).fill(-1);
  const visited = new Uint8Array(network.nodes.length);
  const heap: Array<[number, number]> = [];
  const push = (value: [number, number]) => {
    heap.push(value);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent][0] <= heap[index][0]) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop() as [number, number];
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === index) break;
        [heap[smallest], heap[index]] = [heap[index], heap[smallest]];
        index = smallest;
      }
    }
    return top;
  };
  for (const id of startIds) {
    dist[id] = 0;
    push([0, id]);
  }
  while (heap.length) {
    const [d, id] = pop();
    if (visited[id]) continue;
    visited[id] = 1;
    for (const edge of network.adjacency.get(id) ?? []) {
      const next = d + edge.length;
      if (next < dist[edge.to]) {
        dist[edge.to] = next;
        prev[edge.to] = id;
        push([next, edge.to]);
      }
    }
  }
  return { dist, prev };
}

export function pathTo(prev: Int32Array, target: number): number[] {
  const path: number[] = [];
  let cursor = target;
  while (cursor >= 0) {
    path.push(cursor);
    cursor = prev[cursor];
  }
  return path.reverse();
}

export function polylineLength(network: CirculationNetwork, path: number[]) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += distance(network.nodes[path[index - 1]].position, network.nodes[path[index]].position);
  return total;
}

/** Node whose 8 ft neighbourhood holds the most clearance-weighted floor. Deterministic. */
export function gatheringCenter(network: CirculationNetwork, field: FloorField, radiusFeet = 8): { nodeId: number; weight: number; share: number } | null {
  if (!network.nodes.length) return null;
  const reach = Math.ceil(radiusFeet / field.sampleFeet);
  const byCell = new Map<string, NetworkNode[]>();
  for (const node of network.nodes) {
    const sample = field.samples[node.sampleId];
    const key = cellKey(sample.ix, sample.iy);
    (byCell.get(key) ?? byCell.set(key, []).get(key)!).push(node);
  }
  let total = 0;
  for (const node of network.nodes) total += field.samples[node.sampleId].area * (1 + Math.min(20, field.samples[node.sampleId].clearance ?? 20) / 20);
  let best: { nodeId: number; weight: number; share: number } | null = null;
  // Evaluate on a 2 ft stride to bound the cost; ties resolve to the lower node id.
  // If every sample sits on an odd column (possible depending on the mesh origin),
  // fall back to every node so a destination is still measured.
  const evenNodes = network.nodes.filter((node) => {
    const sample = field.samples[node.sampleId];
    return sample.ix % 2 === 0 && sample.iy % 2 === 0;
  });
  const candidates = evenNodes.length ? evenNodes : network.nodes;
  for (const node of candidates) {
    const sample = field.samples[node.sampleId];
    let weight = 0;
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        if (dx * dx + dy * dy > reach * reach) continue;
        for (const other of byCell.get(cellKey(sample.ix + dx, sample.iy + dy)) ?? []) {
          if (other.systemId !== node.systemId) continue;
          if (Math.abs(other.position[2] - node.position[2]) > 6) continue;
          const otherSample = field.samples[other.sampleId];
          weight += otherSample.area * (1 + Math.min(20, otherSample.clearance ?? 20) / 20);
        }
      }
    }
    if (!best || weight > best.weight) best = { nodeId: node.id, weight, share: total ? weight / total : 0 };
  }
  return best;
}
