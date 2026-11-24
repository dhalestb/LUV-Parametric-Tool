/**
 * Stage 3 — site-constrained lattice arrangement + geometric validation.
 *
 * Packs assigned OBJ instances into 20 ft registration bays inside selected
 * Site Development polygons according to per-polygon quantity rules.
 * Reports boundary breaches and plan-footprint collisions without morphing.
 *
 * Does not morph forms into a continuous habitable envelope (Stage 4+).
 */

import {
  bayOutline,
  footprintPermitted,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonPlanClearance,
  type Polygon,
} from "../siteDevelopment/geometry";
import type { SiteDevelopmentProject } from "../siteDevelopment/types";
import {
  defaultPolygonRuleProfile,
  loadSiteSessionProject,
  readAssignmentState,
  type LatticeSiteAssignmentState,
  type PolygonObjAssignment,
  type PolygonRuleProfile,
} from "./latticeSiteBridge";
import type { ImportedObj, LatticeField, Mirror, Placement, PlacedTile, Rotation, TileModel } from "./types";
import { LATTICE_FEET, variantIndex } from "./types";

export type SiteOverlayPolygon = {
  id: string;
  name: string;
  kind: "zone" | "exclusion" | "selected";
  color: string;
  /** Closed ring in Lattice display feet (Y-up scene uses x,z plan → x,z). */
  ringLattice: Array<[number, number]>;
  selected: boolean;
};

export type SiteZonePlacementReport = {
  zoneId: string;
  zoneName: string;
  areaFeet2: number;
  quantityMode: PolygonRuleProfile["quantityMode"];
  requestedCount: number;
  assignedObjRows: number;
  queueInstances: number;
  eligibleBayCount: number;
  placedCount: number;
  unplacedCount: number;
  unplacedReason: string | null;
  boundaryBehavior: PolygonRuleProfile["boundaryBehavior"];
  usedBoundaryBehavior: PolygonRuleProfile["boundaryBehavior"];
  orientationYawDeg: number;
  uniqueSourceMeshIds: string[];
  boundaryBreaches: number;
  collisionPairs: number;
  registrationCells: Array<[number, number]>;
};

export type SiteCollisionPair = {
  aId: string;
  bId: string;
  zoneIdA: string;
  zoneIdB: string;
  clearanceFeet: number;
  relation: "overlap" | "contact" | "separated";
};

export type SiteConstrainedArrangement = {
  field: LatticeField;
  originSite: { x: number; z: number };
  stepX: number;
  stepY: number;
  tiles: PlacedTile[];
  models: TileModel[];
  meshes: ImportedObj[];
  placements: Record<string, Placement>;
  summary: string;
  notes: string[];
  placedCount: number;
  eligibleBayCount: number;
  coverageTargetPercent: number;
  achievedCoveragePercent: number;
  unitsBlocked: boolean;
  unitsNote: string | null;
  zoneReports: SiteZonePlacementReport[];
  collisions: SiteCollisionPair[];
  boundaryBreachIds: string[];
  overlays: SiteOverlayPolygon[];
  morphingApplied: boolean;
  connectionsValidated: boolean;
  clusterStatus: "visual-group-only" | "empty";
};

type CellCandidate = {
  ix: number;
  iy: number;
  siteX: number;
  siteZ: number;
  zoneId: string;
};

type PlacedRecord = {
  id: string;
  zoneId: string;
  siteX: number;
  siteZ: number;
  yawDeg: number;
  width: number;
  depth: number;
  footprintSite: Polygon;
};

function yawToRotation(yawDeg: number): Rotation {
  const normalized = ((Math.round(yawDeg / 90) % 4) + 4) % 4;
  return (normalized * 90) as Rotation;
}

function meshPlanFeet(model: TileModel): { width: number; depth: number; area: number } {
  const width = Math.max(LATTICE_FEET, Math.abs(model.bboxMax[0] - model.bboxMin[0]));
  const depth = Math.max(LATTICE_FEET, Math.abs(model.bboxMax[1] - model.bboxMin[1]));
  const area = Math.max(model.horizontalArea || 0, width * depth, LATTICE_FEET * LATTICE_FEET);
  return { width, depth, area };
}

function cellPermitted(
  siteX: number,
  siteZ: number,
  polygon: Polygon,
  exclusions: Polygon[],
  behavior: PolygonRuleProfile["boundaryBehavior"],
  widthFeet: number,
  depthFeet: number,
  yawDeg: number,
): boolean {
  if (behavior === "roots-inside") {
    return pointInPolygon([siteX, siteZ], polygon)
      && !exclusions.some((region) => pointInPolygon([siteX, siteZ], region));
  }
  const size = behavior === "controlled-projection"
    ? LATTICE_FEET
    : Math.max(LATTICE_FEET, Math.max(widthFeet, depthFeet));
  const footprint = bayOutline(siteX, siteZ, size, yawDeg);
  return footprintPermitted(footprint, [polygon], exclusions).ok;
}

function buildInstanceQueue(
  assignments: PolygonObjAssignment[],
  rules: PolygonRuleProfile,
  modelsById: Map<string, TileModel>,
): Array<{ meshId: string; model: TileModel; yawDeg: number; allowMirror: boolean; elevationOffsetFeet: number }> {
  const queue: Array<{ meshId: string; model: TileModel; yawDeg: number; allowMirror: boolean; elevationOffsetFeet: number }> = [];
  for (const row of assignments) {
    if (!row.meshId) continue;
    const model = modelsById.get(row.meshId);
    if (!model) continue;
    const count = Math.max(1, Math.floor(row.instanceCount || 1));
    for (let i = 0; i < count; i += 1) {
      queue.push({
        meshId: row.meshId,
        model,
        yawDeg: row.preferredYawDeg || rules.preferredYawDeg || 0,
        allowMirror: row.allowMirror,
        elevationOffsetFeet: row.elevationOffsetFeet + rules.elevationOffsetFeet,
      });
    }
  }
  if (queue.length) return queue;

  const mapped = [...modelsById.values()].filter((model) => model.slotId);
  const target = Math.max(1, rules.targetCount || 4);
  for (let i = 0; i < target && mapped.length; i += 1) {
    const model = mapped[i % mapped.length];
    queue.push({
      meshId: model.id,
      model,
      yawDeg: rules.preferredYawDeg || 0,
      allowMirror: true,
      elevationOffsetFeet: rules.elevationOffsetFeet,
    });
  }
  return queue;
}

/**
 * Respect per-polygon quantity rules.
 * manual → targetCount (and assigned instance rows as a soft floor only when target is lower than explicit rows)
 * automatic → coverage % of zone area / mean footprint, capped by eligible bays
 */
function targetCountForZone(
  rules: PolygonRuleProfile,
  queueLength: number,
  eligibleBayCount: number,
  zoneArea: number,
  meanFootprint: number,
): { desired: number; requested: number; reason: string } {
  if (rules.quantityMode === "manual") {
    const requested = Math.max(0, Math.floor(rules.targetCount || 0));
    // Manual mode: targetCount is authoritative. Assigned OBJ rows only supply which meshes to repeat.
    const desired = Math.min(eligibleBayCount, requested > 0 ? requested : queueLength);
    return {
      desired,
      requested: requested > 0 ? requested : queueLength,
      reason: `manual targetCount=${requested > 0 ? requested : queueLength} (OBJ rows supply mesh types, not extra quantity)`,
    };
  }
  const coverageFraction = Math.max(0.05, Math.min(1, rules.targetCoveragePercent / 100));
  const byArea = Math.max(1, Math.floor((zoneArea * coverageFraction) / Math.max(meanFootprint, LATTICE_FEET * LATTICE_FEET)));
  const desired = Math.min(eligibleBayCount, Math.max(queueLength, byArea));
  return {
    desired,
    requested: desired,
    reason: `automatic coverage ${rules.targetCoveragePercent}% → ${desired} form(s)`,
  };
}

function selectSpreadCells(candidates: CellCandidate[], count: number): CellCandidate[] {
  if (count <= 0 || !candidates.length) return [];
  if (count >= candidates.length) return candidates.slice();
  const sorted = [...candidates].sort((a, b) => a.iy - b.iy || a.ix - b.ix);
  const picked: CellCandidate[] = [];
  const used = new Set<string>();
  const push = (cell: CellCandidate) => {
    if (picked.length >= count) return;
    const key = `${cell.ix},${cell.iy}`;
    if (used.has(key)) return;
    used.add(key);
    picked.push(cell);
  };
  if (count === 1) {
    push(sorted[Math.floor(sorted.length / 2)]);
    return picked;
  }
  push(sorted[0]);
  push(sorted[sorted.length - 1]);
  const step = sorted.length / count;
  for (let i = 0; i < count && picked.length < count; i += 1) {
    const index = Math.min(sorted.length - 1, Math.floor(i * step + step / 2));
    push(sorted[index]);
  }
  while (picked.length < count) {
    let best: CellCandidate | null = null;
    let bestDist = -1;
    for (const cell of sorted) {
      const key = `${cell.ix},${cell.iy}`;
      if (used.has(key)) continue;
      let minD = Infinity;
      for (const existing of picked) {
        const d = (cell.ix - existing.ix) ** 2 + (cell.iy - existing.iy) ** 2;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        best = cell;
      }
    }
    if (!best) break;
    push(best);
  }
  return picked.slice(0, count);
}

function collectCandidates(
  zone: { id: string; polygon: Polygon },
  zones: Array<{ id: string; polygon: Polygon }>,
  exclusions: Polygon[],
  behavior: PolygonRuleProfile["boundaryBehavior"],
  plan: { width: number; depth: number },
  yawDeg: number,
  originSite: { x: number; z: number },
  rawCellsX: number,
  rawCellsY: number,
  stepX: number,
  stepY: number,
  field: LatticeField,
): CellCandidate[] {
  const area = polygonArea(zone.polygon);
  const candidates: CellCandidate[] = [];
  for (let rawIy = 0; rawIy < rawCellsY; rawIy += stepY) {
    for (let rawIx = 0; rawIx < rawCellsX; rawIx += stepX) {
      const siteX = originSite.x + rawIx * LATTICE_FEET + LATTICE_FEET / 2;
      const siteZ = originSite.z + rawIy * LATTICE_FEET + LATTICE_FEET / 2;
      if (!cellPermitted(siteX, siteZ, zone.polygon, exclusions, behavior, plan.width, plan.depth, yawDeg)) continue;
      const ownedByOther = zones.some((other) => (
        other.id !== zone.id
        && pointInPolygon([siteX, siteZ], other.polygon)
        && polygonArea(other.polygon) < area
      ));
      if (ownedByOther) continue;
      const ix = Math.floor(rawIx / stepX);
      const iy = Math.floor(rawIy / stepY);
      if (ix >= field.cellsX || iy >= field.cellsY) continue;
      candidates.push({ ix, iy, siteX, siteZ, zoneId: zone.id });
    }
  }
  return candidates;
}

function siteToLattice(
  siteX: number,
  siteZ: number,
  originSite: { x: number; z: number },
  stepX: number,
  stepY: number,
): [number, number] {
  return [(siteX - originSite.x) / stepX, (siteZ - originSite.z) / stepY];
}

function ringToLattice(
  polygon: Polygon,
  originSite: { x: number; z: number },
  stepX: number,
  stepY: number,
): Array<[number, number]> {
  const ring = polygon.map(([x, z]) => siteToLattice(x, z, originSite, stepX, stepY));
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

function emptyResult(summary: string, extras: Partial<SiteConstrainedArrangement> = {}): SiteConstrainedArrangement {
  return {
    field: { cellsX: 1, cellsY: 1, cellsZ: 1 },
    originSite: { x: 0, z: 0 },
    stepX: 1,
    stepY: 1,
    tiles: [],
    models: [],
    meshes: [],
    placements: {},
    summary,
    notes: [summary],
    placedCount: 0,
    eligibleBayCount: 0,
    coverageTargetPercent: 0,
    achievedCoveragePercent: 0,
    unitsBlocked: false,
    unitsNote: null,
    zoneReports: [],
    collisions: [],
    boundaryBreachIds: [],
    overlays: [],
    morphingApplied: false,
    connectionsValidated: false,
    clusterStatus: "empty",
    ...extras,
  };
}

/** Generate a site-footprint lattice arrangement from saved Stage 1–2 assignments. */
export function generateSiteConstrainedArrangement(options: {
  models: TileModel[];
  meshes: ImportedObj[];
  project?: SiteDevelopmentProject | null;
  assignment?: LatticeSiteAssignmentState | null;
  /** Required when site unitAssumption is unresolved — do not silently assume units. */
  unitsConfirmed?: boolean;
}): SiteConstrainedArrangement {
  const notes: string[] = [];
  const session = options.project ? { project: options.project } : loadSiteSessionProject();
  const assignment = options.assignment ?? readAssignmentState();
  if (!session?.project) {
    return emptyResult("No Site Development diagram loaded. Import/load a site diagram first.");
  }
  if (assignment.sourceMode === "rectangular-lattice") {
    return emptyResult("Lattice source is rectangular. Switch to a Site Development diagram or selected polygons.");
  }

  const project = session.project;
  const unitsUnresolved = project.coordinates.unitAssumption === "unresolved";
  if (unitsUnresolved && !options.unitsConfirmed) {
    return emptyResult(
      `Site unit assumption is unresolved (declared unit=${project.coordinates.unit}, feetPerModel=${project.coordinates.feetPerModel}). Confirm units explicitly before validated site-constrained generation.`,
      {
        unitsBlocked: true,
        unitsNote: `Confirm whether the imported site is ${project.coordinates.unit} before generation. Polygons are already stored in site feet using feetPerModel=${project.coordinates.feetPerModel}; an incorrect unit scales every boundary and area.`,
      },
    );
  }
  if (unitsUnresolved && options.unitsConfirmed) {
    notes.push(`Units confirmed by user for this run · declared ${project.coordinates.unit} · feetPerModel=${project.coordinates.feetPerModel} (assumption was unresolved).`);
  } else {
    notes.push(`Units confirmed in project · ${project.coordinates.unit} · feetPerModel=${project.coordinates.feetPerModel}.`);
  }

  const selectedIds = assignment.selectedZoneIds.length
    ? assignment.selectedZoneIds
    : project.zones.filter((zone) => zone.enabled !== false).map((zone) => zone.id);
  const zones = project.zones.filter((zone) => selectedIds.includes(zone.id) && zone.kind === "zone");
  if (!zones.length) {
    return emptyResult("Select one or more site polygons before running site-constrained arrangement.");
  }

  const exclusions = project.exclusions.map((zone) => zone.polygon);
  const bounds = zones.reduce(
    (acc, zone) => {
      const b = polygonBounds(zone.polygon);
      return {
        minX: Math.min(acc.minX, b.minX),
        minZ: Math.min(acc.minZ, b.minZ),
        maxX: Math.max(acc.maxX, b.maxX),
        maxZ: Math.max(acc.maxZ, b.maxZ),
      };
    },
    { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
  );

  const originSite = { x: bounds.minX, z: bounds.minZ };
  const rawCellsX = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / LATTICE_FEET));
  const rawCellsY = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / LATTICE_FEET));
  const stepX = Math.max(1, Math.ceil(rawCellsX / 20));
  const stepY = Math.max(1, Math.ceil(rawCellsY / 20));
  const field: LatticeField = {
    cellsX: Math.min(20, Math.ceil(rawCellsX / stepX)),
    cellsY: Math.min(20, Math.ceil(rawCellsY / stepY)),
    cellsZ: 1,
  };
  if (stepX > 1 || stepY > 1) {
    notes.push(`Site span ${rawCellsX}×${rawCellsY} bays; display board uses every ${stepX}×${stepY} bay (1 lattice cell = ${stepX * 20}×${stepY * 20} site ft).`);
  }

  const modelsById = new Map(options.models.map((model) => [model.id, model]));
  const meshById = new Map(options.meshes.map((mesh) => [mesh.id, mesh]));

  const placements: Record<string, Placement> = {};
  const tiles: PlacedTile[] = [];
  const instanceModels: TileModel[] = [];
  const instanceMeshes: ImportedObj[] = [];
  const placedRecords: PlacedRecord[] = [];
  const zoneReports: SiteZonePlacementReport[] = [];
  let eligibleBayCount = 0;
  let totalZoneArea = 0;
  let coverageTargetPercent = 0;

  for (const zone of zones) {
    const rules = assignment.rulesByZone[zone.id] ?? defaultPolygonRuleProfile(zone);
    const objRows = (assignment.objByZone[zone.id] ?? []).filter((row) => row.meshId);
    const queue = buildInstanceQueue(objRows, rules, modelsById);
    const area = polygonArea(zone.polygon);
    totalZoneArea += area;
    coverageTargetPercent = Math.max(coverageTargetPercent, rules.targetCoveragePercent);

    if (!queue.length) {
      notes.push(`${zone.name}: no OBJ assignment or mapped Lattice mesh available.`);
      zoneReports.push({
        zoneId: zone.id,
        zoneName: zone.name,
        areaFeet2: area,
        quantityMode: rules.quantityMode,
        requestedCount: rules.quantityMode === "manual" ? rules.targetCount : 0,
        assignedObjRows: objRows.length,
        queueInstances: 0,
        eligibleBayCount: 0,
        placedCount: 0,
        unplacedCount: rules.quantityMode === "manual" ? rules.targetCount : 0,
        unplacedReason: "No OBJ assignment or mapped Lattice mesh available.",
        boundaryBehavior: rules.boundaryBehavior,
        usedBoundaryBehavior: rules.boundaryBehavior,
        orientationYawDeg: rules.preferredYawDeg,
        uniqueSourceMeshIds: [],
        boundaryBreaches: 0,
        collisionPairs: 0,
        registrationCells: [],
      });
      continue;
    }

    const meanFootprint = queue.reduce((sum, item) => sum + meshPlanFeet(item.model).area, 0) / queue.length;
    const sample = queue[0];
    const samplePlan = meshPlanFeet(sample.model);
    let usedBehavior = rules.boundaryBehavior;
    let candidates = collectCandidates(
      zone, zones, exclusions, usedBehavior, samplePlan, sample.yawDeg,
      originSite, rawCellsX, rawCellsY, stepX, stepY, field,
    );
    if (candidates.length < Math.min(4, queue.length) && usedBehavior === "full-geometry-inside") {
      usedBehavior = "roots-inside";
      candidates = collectCandidates(
        zone, zones, exclusions, usedBehavior, samplePlan, sample.yawDeg,
        originSite, rawCellsX, rawCellsY, stepX, stepY, field,
      );
      notes.push(`${zone.name}: full-geometry-inside left too few bays for requested quantity; eligibility uses roots-inside (mesh may project).`);
    }
    eligibleBayCount += candidates.length;

    const target = targetCountForZone(rules, queue.length, candidates.length, area, meanFootprint);
    const selectedCells = selectSpreadCells(candidates, target.desired);
    const uniqueSources = [...new Set(queue.map((item) => item.meshId))];
    let boundaryBreaches = 0;
    const registrationCells: Array<[number, number]> = [];

    for (let i = 0; i < selectedCells.length; i += 1) {
      const cell = selectedCells[i];
      const source = queue[i % queue.length];
      const sourceMesh = meshById.get(source.meshId);
      if (!sourceMesh) continue;
      const plan = meshPlanFeet(source.model);
      const rotation = yawToRotation(source.yawDeg);
      const mirror: Mirror = source.allowMirror && i % 5 === 4 ? "x" : "none";
      const variant = variantIndex(rotation, mirror);
      const instanceId = `${source.meshId}::site-${zone.id}-${i + 1}`;
      const footprintSite = bayOutline(cell.siteX, cell.siteZ, Math.max(plan.width, plan.depth), source.yawDeg);
      const permitted = footprintPermitted(footprintSite, [zone.polygon], exclusions);
      if (!permitted.ok) boundaryBreaches += 1;

      instanceModels.push({ ...source.model, id: instanceId, slotId: source.model.slotId });
      instanceMeshes.push({
        ...sourceMesh,
        id: instanceId,
        filename: `${sourceMesh.filename} · ${zone.name} ${i + 1}`,
        suggestedSlotId: source.model.slotId ?? sourceMesh.suggestedSlotId,
      });
      tiles.push({ id: instanceId, variant, ix: cell.ix, iy: cell.iy, iz: 0, zLift: source.elevationOffsetFeet });
      placements[instanceId] = {
        meshId: instanceId,
        slotId: source.model.slotId,
        rotation,
        mirror,
        ix: cell.ix,
        iy: cell.iy,
        iz: 0,
        zLift: source.elevationOffsetFeet,
        locked: false,
      };
      placedRecords.push({
        id: instanceId,
        zoneId: zone.id,
        siteX: cell.siteX,
        siteZ: cell.siteZ,
        yawDeg: source.yawDeg,
        width: plan.width,
        depth: plan.depth,
        footprintSite,
      });
      registrationCells.push([cell.ix, cell.iy]);
    }

    const placedCount = registrationCells.length;
    const unplaced = Math.max(0, target.requested - placedCount);
    zoneReports.push({
      zoneId: zone.id,
      zoneName: zone.name,
      areaFeet2: area,
      quantityMode: rules.quantityMode,
      requestedCount: target.requested,
      assignedObjRows: objRows.length,
      queueInstances: queue.length,
      eligibleBayCount: candidates.length,
      placedCount,
      unplacedCount: unplaced,
      unplacedReason: unplaced
        ? (candidates.length < target.desired
          ? `Only ${candidates.length} eligible 20′ bay(s) inside polygon under ${usedBehavior}.`
          : "Placement stopped at requested quantity.")
        : null,
      boundaryBehavior: rules.boundaryBehavior,
      usedBoundaryBehavior: usedBehavior,
      orientationYawDeg: rules.preferredYawDeg || sample.yawDeg,
      uniqueSourceMeshIds: uniqueSources,
      boundaryBreaches,
      collisionPairs: 0,
      registrationCells,
    });
    notes.push(`${zone.name}: requested ${target.requested}, placed ${placedCount}/${candidates.length} eligible · ${target.reason} · boundary=${usedBehavior}.`);
  }

  const collisions: SiteCollisionPair[] = [];
  for (let i = 0; i < placedRecords.length; i += 1) {
    for (let j = i + 1; j < placedRecords.length; j += 1) {
      const a = placedRecords[i];
      const b = placedRecords[j];
      const clearance = polygonPlanClearance(a.footprintSite, b.footprintSite);
      if (clearance >= -1e-6) continue;
      collisions.push({
        aId: a.id,
        bId: b.id,
        zoneIdA: a.zoneId,
        zoneIdB: b.zoneId,
        clearanceFeet: clearance,
        relation: "overlap",
      });
    }
  }
  const collisionsByZone = new Map<string, number>();
  for (const pair of collisions) {
    collisionsByZone.set(pair.zoneIdA, (collisionsByZone.get(pair.zoneIdA) ?? 0) + 1);
    if (pair.zoneIdA !== pair.zoneIdB) {
      collisionsByZone.set(pair.zoneIdB, (collisionsByZone.get(pair.zoneIdB) ?? 0) + 1);
    }
  }
  for (const report of zoneReports) {
    report.collisionPairs = collisionsByZone.get(report.zoneId) ?? 0;
  }

  const boundaryBreachIds = placedRecords
    .filter((record) => {
      const zone = zones.find((item) => item.id === record.zoneId);
      if (!zone) return true;
      return !footprintPermitted(record.footprintSite, [zone.polygon], exclusions).ok;
    })
    .map((record) => record.id);

  const overlays: SiteOverlayPolygon[] = [
    ...zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      kind: (selectedIds.includes(zone.id) ? "selected" : "zone") as "selected" | "zone",
      color: zone.color || "#41dbc7",
      ringLattice: ringToLattice(zone.polygon, originSite, stepX, stepY),
      selected: selectedIds.includes(zone.id),
    })),
    ...project.exclusions.map((zone) => ({
      id: zone.id,
      name: zone.name,
      kind: "exclusion" as const,
      color: "#e47079",
      ringLattice: ringToLattice(zone.polygon, originSite, stepX, stepY),
      selected: false,
    })),
  ];

  const placedCount = tiles.length;
  const achievedCoveragePercent = totalZoneArea > 0
    ? (placedCount * LATTICE_FEET * LATTICE_FEET * 100) / totalZoneArea
    : 0;

  if (!placedCount) {
    return emptyResult(
      "No site-constrained placements. Assign OBJs to polygons and ensure bays fit inside the selected footprint.",
      { notes, eligibleBayCount, zoneReports, overlays, originSite, stepX, stepY, field },
    );
  }

  notes.push(`Plan-footprint overlaps: ${collisions.length} pair(s). Boundary breaches (authentic mesh AABB outline): ${boundaryBreachIds.length}.`);
  notes.push("Cluster status: visual grouping only — no validated connections, morphing, or shared envelope.");

  const qtySummary = zoneReports
    .map((report) => `${report.zoneName} ${report.placedCount}/${report.requestedCount}`)
    .join(" · ");

  return {
    field,
    originSite,
    stepX,
    stepY,
    tiles,
    models: instanceModels,
    meshes: instanceMeshes,
    placements,
    placedCount,
    eligibleBayCount,
    coverageTargetPercent,
    achievedCoveragePercent,
    unitsBlocked: false,
    unitsNote: null,
    zoneReports,
    collisions,
    boundaryBreachIds,
    overlays,
    morphingApplied: false,
    connectionsValidated: false,
    clusterStatus: "visual-group-only",
    notes,
    summary: `Site-constrained arrangement: ${placedCount} form(s) · ${qtySummary} · overlaps ${collisions.length} · boundary breaches ${boundaryBreachIds.length} · ~${achievedCoveragePercent.toFixed(1)}% bay-area vs footprint. Morphing/shared envelope not applied. Connections not validated.`,
  };
}
