/**
 * Local Lattice assembly adapter (Site Development ↔ Lattice).
 *
 * For each architectural group on the site:
 * 1. Map member forms into a local lattice neighborhood (preserving relative layout).
 * 2. Run evaluateAssembly → matchAssemblyPorts → synthesizeConnectors.
 * 3. Optionally refine with searchAssignmentCopies when direct synthesis cannot connect.
 * 4. Validate geometric continuity, collisions, height, and site boundaries.
 * 5. Only then classify as lattice-connected-assembly.
 *
 * Does NOT call searchAssemblies (global rectangular board search).
 */

import {
  assignmentFieldForCopies,
  searchAssignmentCopies,
  type AssignmentResult,
} from "../lattice/assignmentSearch";
import { synthesizeConnectors, type GeneratedConnector, type SynthesisResult } from "../lattice/connectionSynthesis";
import { matchAssemblyPorts } from "../lattice/portMatching";
import { evaluateAssembly } from "../lattice/search";
import { transitionPath } from "../lattice/transitionGeometry";

const ACCESSIBLE_RAMP_SLOPE = 1 / 12;

function connectorCirculation(connector: GeneratedConnector) {
  const pair = connector.portPair;
  if (!pair) return null;
  const path = pair.path ?? transitionPath(pair);
  let run = 0;
  let slope = 0;
  for (let i = 1; i < path.length; i++) {
    const horizontal = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const rise = Math.abs(path[i][2] - path[i - 1][2]);
    run += horizontal;
    if (rise > 0) slope = Math.max(slope, horizontal > 0 ? rise / horizontal : Infinity);
  }
  if (!Number.isFinite(slope)) return { rise: Math.abs(pair.rise), run: 0, slope: 0 };
  return { rise: Math.abs(pair.rise), run, slope };
}
import {
  clampLatticeCells,
  LATTICE_FEET,
  placementWorldZ,
  type LatticeField,
  type PlacedTile,
  type TileModel,
} from "../lattice/types";
import { bayFootprint, footprintPermitted, type Polygon } from "./geometry";
import type {
  ArchitecturalFeasibilityFailure,
  ClusterZone,
  LatticeAssemblyReport,
  PlacementKind,
  SiteAssemblyConnector,
  SiteCluster,
} from "./types";

export type AssemblyIntegrationStatus = {
  mode: PlacementKind;
  connectedAssemblies: number;
  spatiallyGroupedClusters: number;
  note: string;
};

export type MappedLatticeMember = {
  clusterId: string;
  meshId: string;
  sourceId: string;
  tile: PlacedTile;
  siteX: number;
  siteZ: number;
  elevation: number;
  yawDeg: number;
};

export type LocalNeighborhood = {
  groupId: number;
  field: LatticeField;
  originSite: { x: number; z: number };
  members: MappedLatticeMember[];
};

export type AssembleOptions = {
  clusters: SiteCluster[];
  models: TileModel[];
  zones: ClusterZone[];
  exclusions: Polygon[];
  heightLimitFeet: number;
  /** Cap how many groups may run searchAssignmentCopies. */
  maxSearchGroups?: number;
  /** Soft wall-clock budget for assignment searches (ms). */
  timeBudgetMs?: number;
  cancelled?: () => boolean;
};

const PLAN_NUDGES: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 0], [-2, 0], [0, 2], [0, -2],
];

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function resolveModel(models: TileModel[], meshId: string): TileModel | undefined {
  return models.find((model) => model.id === meshId && !model.id.includes("::"))
    ?? models.find((model) => model.id === meshId)
    ?? models.find((model) => sourceIdOf(model.id) === meshId);
}

/** Quantize site-relative offsets into a local lattice neighborhood. */
export function mapSiteGroupToLatticeNeighborhood(
  groupId: number,
  members: SiteCluster[],
): LocalNeighborhood | null {
  if (members.length < 2) return null;
  const minX = Math.min(...members.map((item) => item.x));
  const minZ = Math.min(...members.map((item) => item.z));
  const raw = members.map((cluster, index) => {
    const ix = Math.round((cluster.x - minX) / LATTICE_FEET);
    const iy = Math.round((cluster.z - minZ) / LATTICE_FEET);
    const elev = Math.max(0, cluster.elevation);
    let iz = Math.floor(elev / LATTICE_FEET);
    let zLift = elev - iz * LATTICE_FEET;
    if (zLift > LATTICE_FEET - 0.05) {
      iz += 1;
      zLift = 0;
    }
    return {
      clusterId: cluster.id,
      meshId: cluster.meshId,
      sourceId: cluster.meshId,
      siteX: cluster.x,
      siteZ: cluster.z,
      elevation: cluster.elevation,
      yawDeg: cluster.yawDeg,
      ix,
      iy,
      iz,
      zLift,
      order: index,
    };
  });

  const occupied = new Set<string>();
  for (const item of raw) {
    let key = `${item.ix},${item.iy},${item.iz}`;
    if (!occupied.has(key)) {
      occupied.add(key);
      continue;
    }
    let placed = false;
    for (const [dx, dy] of PLAN_NUDGES) {
      const nx = item.ix + dx;
      const ny = item.iy + dy;
      key = `${nx},${ny},${item.iz}`;
      if (occupied.has(key)) continue;
      item.ix = nx;
      item.iy = ny;
      occupied.add(key);
      placed = true;
      break;
    }
    if (!placed) {
      item.iz += 1;
      item.zLift = 0;
      key = `${item.ix},${item.iy},${item.iz}`;
      occupied.add(key);
    }
  }

  const minIx = Math.min(...raw.map((item) => item.ix));
  const minIy = Math.min(...raw.map((item) => item.iy));
  const minIz = Math.min(...raw.map((item) => item.iz));
  for (const item of raw) {
    item.ix -= minIx;
    item.iy -= minIy;
    item.iz -= minIz;
  }

  const spanX = Math.max(...raw.map((item) => item.ix)) + 1;
  const spanY = Math.max(...raw.map((item) => item.iy)) + 1;
  const spanZ = Math.max(...raw.map((item) => item.iz)) + 1;
  const base = assignmentFieldForCopies(Math.min(8, Math.max(2, members.length)) as 2 | 3 | 4 | 8);
  const field: LatticeField = {
    cellsX: clampLatticeCells(Math.max(base.cellsX, spanX + 1)),
    cellsY: clampLatticeCells(Math.max(base.cellsY, spanY + 1)),
    cellsZ: clampLatticeCells(Math.max(base.cellsZ, spanZ + 1)),
  };

  return {
    groupId,
    field,
    originSite: { x: minX, z: minZ },
    members: raw.map((item) => ({
      clusterId: item.clusterId,
      meshId: item.meshId,
      sourceId: item.sourceId,
      siteX: item.siteX,
      siteZ: item.siteZ,
      elevation: item.elevation,
      yawDeg: item.yawDeg,
      tile: {
        id: `${item.meshId}::${item.clusterId}`,
        variant: 0,
        ix: item.ix,
        iy: item.iy,
        iz: item.iz,
        zLift: item.zLift,
      },
    })),
  };
}

/** Map a lattice placement back into site feet (X / elevation / Z). */
export function latticeTileToSiteFeet(
  tile: Pick<PlacedTile, "ix" | "iy" | "iz" | "zLift">,
  originSite: { x: number; z: number },
): { x: number; z: number; elevation: number } {
  return {
    x: originSite.x + tile.ix * LATTICE_FEET,
    z: originSite.z + tile.iy * LATTICE_FEET,
    elevation: placementWorldZ(tile),
  };
}

/** Translate Z-up lattice connector verts into site Three.js Y-up space. */
export function mapConnectorToSite(
  connector: GeneratedConnector,
  originSite: { x: number; z: number },
  fromClusterId: string,
  toClusterId: string,
  groupId: number,
): SiteAssemblyConnector {
  const positions: number[] = [];
  for (let i = 0; i < connector.positions.length; i += 3) {
    const lx = connector.positions[i];
    const ly = connector.positions[i + 1];
    const lz = connector.positions[i + 2];
    positions.push(originSite.x + lx, lz, originSite.z + ly);
  }
  return {
    id: `${groupId}:${connector.id}`,
    groupId,
    kind: connector.kind,
    fromClusterId,
    toClusterId,
    positions,
    indices: [...connector.indices],
    accepted: true,
    reason: connector.reason,
    cost: connector.cost,
    circulation: connectorCirculation(connector),
  };
}

function graphComponentsFromSynthesis(synthesis: SynthesisResult, tileIds: string[]): number {
  const parent = new Map(tileIds.map((id) => [id, id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  for (const connector of synthesis.connectors) {
    if (!parent.has(connector.fromTile) || !parent.has(connector.toTile)) continue;
    parent.set(find(connector.fromTile), find(connector.toTile));
  }
  for (const pair of synthesis.portPairs ?? []) {
    if (!parent.has(pair.tileA) || !parent.has(pair.tileB)) continue;
    parent.set(find(pair.tileA), find(pair.tileB));
  }
  return new Set(tileIds.map((id) => find(id))).size;
}

function acceptedLinkCount(synthesis: SynthesisResult): number {
  return (
    synthesis.directInterlocks
    + synthesis.bridges
    + synthesis.ramps
    + synthesis.stairs
    + synthesis.landings
    + synthesis.verticalLinks
    + (synthesis.portPairs?.length ?? 0)
  );
}

export function assessArchitecturalFeasibility(options: {
  groupId: number;
  tiles: PlacedTile[];
  synthesis: SynthesisResult;
  evalParts: { collision: number; floor: number; circulation: number; void: number };
  collisionFails: number;
  remapped: Array<{ cluster: SiteCluster; x: number; z: number; elevation: number }>;
  zones: ClusterZone[];
  exclusions: Polygon[];
  heightLimitFeet: number;
}): { ok: boolean; failures: ArchitecturalFeasibilityFailure[] } {
  const failures: ArchitecturalFeasibilityFailure[] = [];
  const push = (category: string, reason: string) => {
    failures.push({ groupId: options.groupId, category, reason });
  };

  if (options.collisionFails > 0 || options.evalParts.collision > options.tiles.length) {
    push("collision", `Destructive collisions detected (${options.collisionFails} FAIL edges, collision score ${options.evalParts.collision}).`);
  }

  const components = graphComponentsFromSynthesis(options.synthesis, options.tiles.map((tile) => tile.id));
  const links = acceptedLinkCount(options.synthesis);
  if (options.tiles.length > 1 && components > 1 && links === 0) {
    push("continuity", `Group remains ${components} disconnected component(s) with no accepted Lattice connectors.`);
  } else if (options.tiles.length > 1 && links === 0) {
    push("continuity", "No geometrically validated interlocks or connectors were accepted.");
  }

  if (options.tiles.length > 1 && options.evalParts.floor + options.evalParts.circulation === 0 && (options.synthesis.portPairs?.length ?? 0) === 0) {
    push("floor-circulation", "No occupied floor-space continuity or circulation interface was validated.");
  }

  for (const connector of options.synthesis.connectors) {
    const circulation = connectorCirculation(connector);
    if (connector.kind === "ramp" && circulation && circulation.slope > ACCESSIBLE_RAMP_SLOPE + 1e-6) {
      push("accessibility", `Ramp ${connector.id} slope ${circulation.slope.toFixed(3)} exceeds accessible limit ${ACCESSIBLE_RAMP_SLOPE}.`);
    }
    if (circulation && circulation.rise > 0 && circulation.run < 0.5) {
      push("headroom-clearance", `Vertical transition ${connector.id} lacks horizontal run for circulation clearance.`);
    }
  }

  for (const item of options.remapped) {
    const zone = options.zones.find((entry) => entry.id === item.cluster.zoneId);
    const maxH = zone?.maxHeightFeet ?? options.heightLimitFeet;
    if (item.elevation + LATTICE_FEET > maxH + 1e-6) {
      push("height", `${item.cluster.id} remapped elevation ${item.elevation.toFixed(1)} ft exceeds height limit ${maxH} ft.`);
    }
    const footprint = bayFootprint(item.x, item.z, item.cluster.bayFeet, item.cluster.yawDeg);
    const permitted = footprintPermitted(footprint, zone ? [zone.polygon] : [], options.exclusions);
    if (!permitted.ok) {
      push("site-boundary", `${item.cluster.id} remapped footprint fails site boundary: ${permitted.reason}`);
    }
  }

  const hardCategories = new Set(["collision", "continuity", "height", "site-boundary"]);
  const ok = !failures.some((item) => hardCategories.has(item.category));
  return { ok, failures };
}

function evaluateLocalPlacement(instances: TileModel[], tiles: PlacedTile[]) {
  const evaled = evaluateAssembly(instances, tiles);
  const portMatches = matchAssemblyPorts(instances, tiles, evaled.connections, {}, true);
  const synthesis = synthesizeConnectors(instances, tiles, evaled.connections, {
    portPairs: portMatches.pairs,
    candidates: portMatches.candidates,
    componentsBefore: portMatches.componentsBefore,
    componentsAfter: portMatches.componentsAfter,
    rejectionCounts: portMatches.rejectionCounts,
  });
  const collisionFails = evaled.connections.filter((connection) => connection.collision === "FAIL").length;
  return { evaled, portCandidates: portMatches.candidates, synthesis, collisionFails };
}

function tileIdToClusterId(tileId: string, members: MappedLatticeMember[]): string | null {
  const direct = members.find((item) => item.tile.id === tileId);
  if (direct) return direct.clusterId;
  const byIndex = members.find((item) => tileId.endsWith(`::${item.clusterId}`) || tileId.includes(item.clusterId));
  return byIndex?.clusterId ?? null;
}

function connectorsForGroup(
  groupId: number,
  synthesis: SynthesisResult,
  members: MappedLatticeMember[],
  originSite: { x: number; z: number },
  tileClusterMap: Map<string, string>,
): SiteAssemblyConnector[] {
  const out: SiteAssemblyConnector[] = [];
  for (const connector of synthesis.connectors) {
    const fromClusterId = tileClusterMap.get(connector.fromTile) ?? tileIdToClusterId(connector.fromTile, members);
    const toClusterId = tileClusterMap.get(connector.toTile) ?? tileIdToClusterId(connector.toTile, members);
    if (!fromClusterId || !toClusterId) continue;
    out.push(mapConnectorToSite(connector, originSite, fromClusterId, toClusterId, groupId));
  }
  return out;
}

function copyCountForGroup(size: number): 2 | 3 | 4 | 8 {
  if (size <= 2) return 2;
  if (size === 3) return 3;
  if (size <= 4) return 4;
  return 8;
}

async function refineWithAssignmentSearch(options: {
  groupMembers: SiteCluster[];
  models: TileModel[];
  field: LatticeField;
  cancelled: () => boolean;
}): Promise<AssignmentResult | null> {
  const forms: TileModel[] = [];
  for (const cluster of options.groupMembers) {
    const model = resolveModel(options.models, cluster.meshId);
    if (!model) return null;
    forms.push({ ...model, id: model.id, slotId: cluster.slotId ?? model.slotId });
  }
  if (forms.length < 2) return null;
  const copyCount = copyCountForGroup(Math.min(8, forms.length));
  const seeds = forms.slice(0, copyCount);
  try {
    return await searchAssignmentCopies(
      seeds,
      copyCount,
      {
        cancelled: options.cancelled,
        onProgress: () => undefined,
      },
      copyCount === 2 ? "copies-2" : copyCount === 3 ? "copies-3" : copyCount === 4 ? "copies-4" : "copies-8",
      options.field,
      seeds,
      new Set(seeds.map((model) => model.id)),
    );
  } catch {
    return null;
  }
}

/**
 * Assemble each architectural group locally. Preserves site distribution of group centroids.
 * Only promotes placementKind to lattice-connected-assembly when geometry validation passes.
 */
export async function assembleLocalArchitecturalGroups(options: AssembleOptions): Promise<{
  clusters: SiteCluster[];
  placementKind: PlacementKind;
  report: LatticeAssemblyReport;
  connectors: SiteAssemblyConnector[];
}> {
  const started = performance.now();
  const timeBudgetMs = options.timeBudgetMs ?? 12_000;
  const maxSearchGroups = options.maxSearchGroups ?? 3;
  const cancelled = options.cancelled ?? (() => false);
  const clusters = options.clusters.map((cluster) => ({ ...cluster }));
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const connectors: SiteAssemblyConnector[] = [];
  const feasibilityFailures: ArchitecturalFeasibilityFailure[] = [];
  let groupsConnected = 0;
  let connectorsAccepted = 0;
  let connectorsRejected = 0;
  let searchGroupsUsed = 0;
  let budgetLimited = false;

  // Group by zone + architectural cluster so multi-zone sites do not merge unrelated seed indices.
  const groups = new Map<number, SiteCluster[]>();
  const keyToGroupId = new Map<string, number>();
  let nextGroupId = 0;
  for (const cluster of clusters) {
    if (cluster.architecturalClusterId == null) continue;
    const key = `${cluster.zoneId}:${cluster.architecturalClusterId}`;
    if (!keyToGroupId.has(key)) keyToGroupId.set(key, nextGroupId++);
    const groupId = keyToGroupId.get(key)!;
    const list = groups.get(groupId) ?? [];
    list.push(cluster);
    groups.set(groupId, list);
  }

  const architecturalGroups = groups.size;
  let groupsAttempted = 0;
  let unconnectedForms = clusters.filter((cluster) => {
    if (cluster.architecturalClusterId == null) return true;
    const key = `${cluster.zoneId}:${cluster.architecturalClusterId}`;
    const groupId = keyToGroupId.get(key);
    return groupId == null || (groups.get(groupId)?.length ?? 0) < 2;
  }).length;

  // Avoid combinatorial port matching across large site placements (previously millions of rejects).
  const MAX_ASSEMBLY_FORMS = 36;
  const MAX_GROUP_SIZE_FOR_SEARCH = 4;
  if (clusters.length > MAX_ASSEMBLY_FORMS) {
    const report: LatticeAssemblyReport = {
      architecturalGroups,
      groupsAttempted: 0,
      groupsConnected: 0,
      unconnectedForms: clusters.length,
      connectorsAccepted: 0,
      connectorsRejected: 0,
      feasibilityFailures: [{
        groupId: -1,
        category: "budget",
        reason: `Skipped Lattice connector synthesis for ${clusters.length} forms (limit ${MAX_ASSEMBLY_FORMS}). Results remain site placements / spatially grouped.`,
      }],
      budgetLimited: true,
      note: `Connector synthesis skipped for performance with ${clusters.length} site forms. Use fewer forms or regenerate selected architectural groups later.`,
    };
    return {
      clusters,
      placementKind: architecturalGroups ? "spatially-grouped" : "site-placement",
      report,
      connectors: [],
    };
  }

  if (!options.models.length) {
    const report: LatticeAssemblyReport = {
      architecturalGroups,
      groupsAttempted: 0,
      groupsConnected: 0,
      unconnectedForms: clusters.length,
      connectorsAccepted: 0,
      connectorsRejected: 0,
      feasibilityFailures: [{
        groupId: -1,
        category: "models",
        reason: "No analyzed TileModel geometry available for Lattice connector synthesis.",
      }],
      budgetLimited: false,
      note: "Lattice assembly skipped — proto-form TileModels are required for geometric validation.",
    };
    return {
      clusters,
      placementKind: architecturalGroups ? "spatially-grouped" : "site-placement",
      report,
      connectors: [],
    };
  }

  for (const [groupId, members] of groups) {
    if (members.length < 2) continue;
    if (members.length > 8) {
      feasibilityFailures.push({
        groupId,
        category: "budget",
        reason: `Group ${groupId} has ${members.length} forms; connector search bounded to groups of 8 or fewer.`,
      });
      unconnectedForms += members.length;
      budgetLimited = true;
      continue;
    }
    if (cancelled() || performance.now() - started > timeBudgetMs) {
      budgetLimited = true;
      unconnectedForms += members.length;
      continue;
    }
    groupsAttempted += 1;
    const neighborhood = mapSiteGroupToLatticeNeighborhood(groupId, members);
    if (!neighborhood) {
      unconnectedForms += members.length;
      continue;
    }

    const instances: TileModel[] = [];
    const tiles: PlacedTile[] = [];
    let missingModel = false;
    for (const member of neighborhood.members) {
      const model = resolveModel(options.models, member.meshId);
      if (!model || !model.variants.length) {
        missingModel = true;
        break;
      }
      const instance: TileModel = {
        ...model,
        id: member.tile.id,
        slotId: clusterById.get(member.clusterId)?.slotId ?? model.slotId,
      };
      instances.push(instance);
      tiles.push({ ...member.tile });
    }
    if (missingModel) {
      feasibilityFailures.push({
        groupId,
        category: "models",
        reason: `Group ${groupId} missing analyzed TileModel for one or more member meshes.`,
      });
      unconnectedForms += members.length;
      continue;
    }

    let usedSearch = false;
    let evalPack = evaluateLocalPlacement(instances, tiles);
    let activeInstances = instances;
    let activeTiles = tiles;
    let originSite = neighborhood.originSite;
    let memberMap = neighborhood.members;
    let tileClusterMap = new Map(memberMap.map((item) => [item.tile.id, item.clusterId]));

    const directFeasible = assessArchitecturalFeasibility({
      groupId,
      tiles: activeTiles,
      synthesis: evalPack.synthesis,
      evalParts: evalPack.evaled.parts,
      collisionFails: evalPack.collisionFails,
      remapped: members.map((cluster) => ({
        cluster,
        x: cluster.x,
        z: cluster.z,
        elevation: cluster.elevation,
      })),
      zones: options.zones,
      exclusions: options.exclusions,
      heightLimitFeet: options.heightLimitFeet,
    });

    const directLinked =
      directFeasible.ok
      && acceptedLinkCount(evalPack.synthesis) > 0
      && graphComponentsFromSynthesis(evalPack.synthesis, activeTiles.map((tile) => tile.id)) < activeTiles.length;

    if (
      !directLinked
      && members.length <= MAX_GROUP_SIZE_FOR_SEARCH
      && searchGroupsUsed < maxSearchGroups
      && performance.now() - started < timeBudgetMs
    ) {
      searchGroupsUsed += 1;
      usedSearch = true;
      const refined = await refineWithAssignmentSearch({
        groupMembers: members.slice(0, copyCountForGroup(members.length)),
        models: options.models,
        field: neighborhood.field,
        cancelled,
      });
      if (refined && refined.status !== "FAIL" && refined.tiles.length >= 2) {
        const cx = members.reduce((sum, item) => sum + item.x, 0) / members.length;
        const cz = members.reduce((sum, item) => sum + item.z, 0) / members.length;
        const latticeCx = refined.tiles.reduce((sum, tile) => sum + tile.ix * LATTICE_FEET, 0) / refined.tiles.length;
        const latticeCz = refined.tiles.reduce((sum, tile) => sum + tile.iy * LATTICE_FEET, 0) / refined.tiles.length;
        originSite = { x: cx - latticeCx, z: cz - latticeCz };
        activeInstances = refined.models;
        activeTiles = refined.tiles;
        evalPack = {
          evaled: {
            connections: refined.connections,
            parts: refined.parts,
            components: refined.components,
            score: refined.score,
          },
          portCandidates: refined.synthesis.portCandidates ?? [],
          synthesis: refined.synthesis,
          collisionFails: refined.connections.filter((connection) => connection.collision === "FAIL").length,
        };
        tileClusterMap = new Map();
        memberMap = refined.tiles.map((tile, index) => {
          const cluster = members[index] ?? members[members.length - 1];
          const site = latticeTileToSiteFeet(tile, originSite);
          tileClusterMap.set(tile.id, cluster.id);
          return {
            clusterId: cluster.id,
            meshId: cluster.meshId,
            sourceId: sourceIdOf(tile.id),
            tile,
            siteX: site.x,
            siteZ: site.z,
            elevation: site.elevation,
            yawDeg: cluster.yawDeg,
          };
        });
      }
    }

    const remapped = memberMap.map((member) => {
      const site = latticeTileToSiteFeet(member.tile, originSite);
      const cluster = clusterById.get(member.clusterId)!;
      return { cluster, x: site.x, z: site.z, elevation: site.elevation };
    });

    const feasibility = assessArchitecturalFeasibility({
      groupId,
      tiles: activeTiles,
      synthesis: evalPack.synthesis,
      evalParts: evalPack.evaled.parts,
      collisionFails: evalPack.collisionFails,
      remapped,
      zones: options.zones,
      exclusions: options.exclusions,
      heightLimitFeet: options.heightLimitFeet,
    });
    feasibilityFailures.push(...feasibility.failures);

    connectorsRejected += evalPack.synthesis.connectionDiagnostics?.rejectedCount
      ?? Math.max(0, (evalPack.portCandidates?.length ?? 0) - (evalPack.synthesis.portPairs?.length ?? 0));

    const linked =
      feasibility.ok
      && acceptedLinkCount(evalPack.synthesis) > 0
      && (
        graphComponentsFromSynthesis(evalPack.synthesis, activeTiles.map((tile) => tile.id)) === 1
        || acceptedLinkCount(evalPack.synthesis) >= activeTiles.length - 1
      );

    if (!linked) {
      unconnectedForms += members.length;
      if (!feasibility.failures.length) {
        feasibilityFailures.push({
          groupId,
          category: "continuity",
          reason: `Group ${groupId} did not produce a geometrically validated connected assembly${usedSearch ? " after assignment search" : ""}.`,
        });
      }
      continue;
    }

    // Commit remapped site coordinates only when search rearranged; direct path keeps original sites.
    if (usedSearch) {
      for (const item of remapped) {
        const target = clusterById.get(item.cluster.id);
        if (!target) continue;
        target.x = item.x;
        target.z = item.z;
        target.elevation = item.elevation;
      }
    }

    const groupConnectors = connectorsForGroup(groupId, evalPack.synthesis, memberMap, originSite, tileClusterMap);
    connectors.push(...groupConnectors);
    connectorsAccepted += groupConnectors.length + evalPack.synthesis.directInterlocks;
    groupsConnected += 1;
  }

  const placementKind: PlacementKind = groupsConnected > 0
    ? "lattice-connected-assembly"
    : architecturalGroups > 0
      ? "spatially-grouped"
      : "site-placement";

  const report: LatticeAssemblyReport = {
    architecturalGroups,
    groupsAttempted,
    groupsConnected,
    unconnectedForms,
    connectorsAccepted,
    connectorsRejected,
    feasibilityFailures,
    budgetLimited,
    note: groupsConnected > 0
      ? `Local Lattice assembly connected ${groupsConnected}/${groupsAttempted} architectural group(s) with geometrically validated connectors. searchAssemblies was not used.`
      : groupsAttempted > 0
        ? `Attempted local Lattice assembly on ${groupsAttempted} group(s); none passed geometric feasibility. Results remain site placements / spatially grouped.`
        : "No multi-form architectural groups were available for local Lattice assembly.",
  };

  return { clusters, placementKind, report, connectors };
}

export function classifySiteResult(
  clusters: SiteCluster[],
  report?: LatticeAssemblyReport | null,
): AssemblyIntegrationStatus {
  const groupIds = new Set(
    clusters.map((item) => item.architecturalClusterId).filter((id): id is number => id != null),
  );
  const connected = report?.groupsConnected ?? 0;
  if (connected > 0) {
    return {
      mode: "lattice-connected-assembly",
      connectedAssemblies: connected,
      spatiallyGroupedClusters: groupIds.size,
      note: report?.note
        ?? `Formed ${connected} Lattice-connected architectural assembly group(s) after geometric connector validation.`,
    };
  }
  return {
    mode: groupIds.size ? "spatially-grouped" : "site-placement",
    connectedAssemblies: 0,
    spatiallyGroupedClusters: groupIds.size,
    note: groupIds.size
      ? `Formed ${groupIds.size} spatial architectural group(s). Lattice connector synthesis did not produce a validated connected assembly for these groups.`
      : "Independent site placements only. No architectural group received validated Lattice connectors.",
  };
}

/** Integration is ready: local neighborhood + assignment copies + connector synthesis. */
export function latticeAssemblyIntegrationReady() {
  return true;
}
