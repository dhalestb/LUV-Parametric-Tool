/**
 * Lattice ↔ Site Development bridge (Stage 1–2).
 *
 * Reads versioned Site Development projects by stable reference without cloning
 * polygons into a disconnected geometry store. Lattice assignments and rule
 * profiles are stored separately and point back at site diagram + zone ids.
 */

import {
  SITE_DEVELOPMENT_SESSION_KEY,
  parseProject,
  serializeProject,
  tryParseProject,
} from "../siteDevelopment/projectStore";
import {
  SITE_DEVELOPMENT_VERSION,
  type ClusterZone,
  type DistributionMode,
  type OrientationMode,
  type QuantityMode,
  type SiteCoordinates,
  type SiteDevelopmentProject,
  type SiteTypologyId,
  type TypologyWeight,
} from "../siteDevelopment/types";
import { polygonArea, polygonBounds, polygonCentroid, type Polygon } from "../siteDevelopment/geometry";

export const LATTICE_SITE_BRIDGE_VERSION = 1;
export const LATTICE_SITE_ASSIGNMENT_KEY = "vul-lattice-site-assignments-v1";

export type LatticeSourceMode = "rectangular-lattice" | "site-diagram" | "site-polygons";

export type SiteDiagramRef = {
  /** Stable diagram identity (project name + version stamp). */
  diagramId: string;
  name: string;
  version: number;
  savedAt: string;
  sourceKey: typeof SITE_DEVELOPMENT_SESSION_KEY | "fixture" | "file";
  coordinates: SiteCoordinates;
  zoneCount: number;
  exclusionCount: number;
};

export type SitePolygonRef = {
  diagramId: string;
  zoneId: string;
  name: string;
  kind: ClusterZone["kind"];
  color: string;
  polygon: Polygon;
  areaFeet2: number;
  centroid: [number, number];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  enabled: boolean;
  visible: boolean;
};

/** Per-OBJ assignment inside one polygon (Stage 2). */
export type PolygonObjAssignment = {
  id: string;
  meshId: string | null;
  filename: string | null;
  typologyId: SiteTypologyId | null;
  instanceCount: number;
  allowMirror: boolean;
  preferredYawDeg: number;
  elevationOffsetFeet: number;
};

/** Independent architectural rule profile for one polygon (Stage 2). */
export type PolygonRuleProfile = {
  quantityMode: QuantityMode;
  targetCount: number;
  targetCoveragePercent: number;
  minEdgeClearanceFeet: number;
  clusterSeparationFeet: number;
  distributionMode: DistributionMode;
  orientationMode: OrientationMode;
  preferredYawDeg: number;
  lockPreferredYaw: boolean;
  orientationFine45: boolean;
  elevationOffsetFeet: number;
  maxHeightFeet: number;
  typologies: TypologyWeight[];
  /** Soft descriptor priority labels (do not change evaluation formulas). */
  descriptorPriorities: string[];
  /** Geometric generation toggles — wired to existing generators in later stages. */
  geometry: {
    branchExtension: boolean;
    branchRetraction: boolean;
    floorCornerProjections: boolean;
    floorEdgeExtensions: boolean;
    sharedFloors: boolean;
    geometricInterlock: boolean;
    organicSurfaceMorphing: boolean;
    sharedEnclosure: boolean;
  };
  connection: {
    branchFirstOrganic: boolean;
    bridges: boolean;
    ramps: boolean;
    stairsLandings: boolean;
    localWallOpenings: boolean;
    sharedFloors: boolean;
    geometricBlending: boolean;
    sharedEnvelope: boolean;
  };
  boundaryBehavior: "full-geometry-inside" | "roots-inside" | "controlled-projection";
};

export type InterPolygonRelation = {
  id: string;
  sourceZoneId: string;
  destinationZoneId: string;
  strategy: "organic-bridge" | "shared-floor" | "stepped" | "visual-only" | "branch-first";
  quantity: number;
  maxReachFeet: number;
  maxElevationDeltaFeet: number;
  morphingStrength: number;
  preserveSourceIdentity: boolean;
  requireCirculationValidation: boolean;
};

export type LatticeSiteAssignmentState = {
  version: number;
  sourceMode: LatticeSourceMode;
  diagramId: string | null;
  selectedZoneIds: string[];
  /** zoneId → OBJ assignments */
  objByZone: Record<string, PolygonObjAssignment[]>;
  /** zoneId → rule profile */
  rulesByZone: Record<string, PolygonRuleProfile>;
  relations: InterPolygonRelation[];
  updatedAt: string;
};

export function defaultPolygonRuleProfile(zone?: ClusterZone): PolygonRuleProfile {
  return {
    quantityMode: zone?.quantityMode ?? "manual",
    targetCount: zone?.targetCount ?? 4,
    targetCoveragePercent: zone?.targetCoveragePercent ?? 25,
    minEdgeClearanceFeet: zone?.minEdgeClearanceFeet ?? 0,
    clusterSeparationFeet: zone?.clusterSeparationFeet ?? 40,
    distributionMode: zone?.distributionMode ?? "balanced",
    orientationMode: zone?.orientationMode ?? "fixed",
    preferredYawDeg: zone?.preferredYawDeg ?? 0,
    lockPreferredYaw: zone?.lockPreferredYaw ?? false,
    orientationFine45: zone?.orientationFine45 ?? false,
    elevationOffsetFeet: zone?.elevationOffsetFeet ?? 0,
    maxHeightFeet: zone?.maxHeightFeet ?? 80,
    typologies: zone?.typologies?.length ? zone.typologies.map((t) => ({ ...t })) : [],
    descriptorPriorities: [],
    geometry: {
      branchExtension: true,
      branchRetraction: true,
      floorCornerProjections: true,
      floorEdgeExtensions: true,
      sharedFloors: false,
      geometricInterlock: false,
      organicSurfaceMorphing: true,
      sharedEnclosure: false,
    },
    connection: {
      branchFirstOrganic: true,
      bridges: true,
      ramps: true,
      stairsLandings: true,
      localWallOpenings: false,
      sharedFloors: false,
      geometricBlending: false,
      sharedEnvelope: false,
    },
    boundaryBehavior: "full-geometry-inside",
  };
}

export function diagramIdOf(project: SiteDevelopmentProject): string {
  const stamp = project.savedAt || "unsaved";
  return `site-diagram:${encodeURIComponent(project.name)}:v${project.version}:${stamp}`;
}

export function toDiagramRef(
  project: SiteDevelopmentProject,
  sourceKey: SiteDiagramRef["sourceKey"] = SITE_DEVELOPMENT_SESSION_KEY,
): SiteDiagramRef {
  return {
    diagramId: diagramIdOf(project),
    name: project.name,
    version: project.version,
    savedAt: project.savedAt,
    sourceKey,
    coordinates: project.coordinates,
    zoneCount: project.zones.length,
    exclusionCount: project.exclusions.length,
  };
}

export function toPolygonRefs(project: SiteDevelopmentProject): SitePolygonRef[] {
  const diagramId = diagramIdOf(project);
  return [...project.zones, ...project.exclusions].map((zone) => {
    const bounds = polygonBounds(zone.polygon);
    const centroid = polygonCentroid(zone.polygon);
    return {
      diagramId,
      zoneId: zone.id,
      name: zone.name,
      kind: zone.kind,
      color: zone.color,
      polygon: zone.polygon.map((p) => [p[0], p[1]] as [number, number]),
      areaFeet2: polygonArea(zone.polygon),
      centroid: [centroid[0], centroid[1]],
      bounds,
      enabled: zone.enabled !== false,
      visible: zone.visible !== false,
    };
  });
}

/** Load the active Site Development session from localStorage (browser only). */
export function loadSiteSessionProject(): { project: SiteDevelopmentProject; ref: SiteDiagramRef } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SITE_DEVELOPMENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = tryParseProject(raw);
    if (!parsed.ok) return null;
    return { project: parsed.project, ref: toDiagramRef(parsed.project) };
  } catch {
    return null;
  }
}

export function emptyAssignmentState(): LatticeSiteAssignmentState {
  return {
    version: LATTICE_SITE_BRIDGE_VERSION,
    sourceMode: "rectangular-lattice",
    diagramId: null,
    selectedZoneIds: [],
    objByZone: {},
    rulesByZone: {},
    relations: [],
    updatedAt: "",
  };
}

export function readAssignmentState(): LatticeSiteAssignmentState {
  if (typeof window === "undefined") return emptyAssignmentState();
  try {
    const raw = window.localStorage.getItem(LATTICE_SITE_ASSIGNMENT_KEY);
    if (!raw) return emptyAssignmentState();
    const data = JSON.parse(raw) as LatticeSiteAssignmentState;
    if (!data || data.version !== LATTICE_SITE_BRIDGE_VERSION) return emptyAssignmentState();
    return {
      ...emptyAssignmentState(),
      ...data,
      selectedZoneIds: Array.isArray(data.selectedZoneIds) ? data.selectedZoneIds : [],
      objByZone: data.objByZone ?? {},
      rulesByZone: data.rulesByZone ?? {},
      relations: data.relations ?? [],
    };
  } catch {
    return emptyAssignmentState();
  }
}

export function writeAssignmentState(state: LatticeSiteAssignmentState) {
  if (typeof window === "undefined") return;
  const next = { ...state, version: LATTICE_SITE_BRIDGE_VERSION, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(LATTICE_SITE_ASSIGNMENT_KEY, JSON.stringify(next));
}

export function ensureZoneRules(
  state: LatticeSiteAssignmentState,
  zone: ClusterZone | SitePolygonRef,
): PolygonRuleProfile {
  const zoneId = "zoneId" in zone ? zone.zoneId : zone.id;
  const existing = state.rulesByZone[zoneId];
  if (existing) return existing;
  if ("typologies" in zone) return defaultPolygonRuleProfile(zone);
  return defaultPolygonRuleProfile();
}

export function copyRuleProfile(from: PolygonRuleProfile): PolygonRuleProfile {
  return JSON.parse(JSON.stringify(from)) as PolygonRuleProfile;
}

export function createObjAssignment(partial?: Partial<PolygonObjAssignment>): PolygonObjAssignment {
  return {
    id: `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    meshId: partial?.meshId ?? null,
    filename: partial?.filename ?? null,
    typologyId: partial?.typologyId ?? null,
    instanceCount: partial?.instanceCount ?? 1,
    allowMirror: partial?.allowMirror ?? true,
    preferredYawDeg: partial?.preferredYawDeg ?? 0,
    elevationOffsetFeet: partial?.elevationOffsetFeet ?? 0,
  };
}

export function createRelation(sourceZoneId: string, destinationZoneId: string): InterPolygonRelation {
  return {
    id: `rel-${sourceZoneId}-${destinationZoneId}-${Date.now().toString(36)}`,
    sourceZoneId,
    destinationZoneId,
    strategy: "organic-bridge",
    quantity: 1,
    maxReachFeet: 60,
    maxElevationDeltaFeet: 12,
    morphingStrength: 0.35,
    preserveSourceIdentity: true,
    requireCirculationValidation: true,
  };
}

/** Validate coordinate policy compatibility between Site and Lattice. */
export function auditCoordinateCompatibility(project: SiteDevelopmentProject) {
  const issues: string[] = [];
  if (project.version !== SITE_DEVELOPMENT_VERSION) {
    issues.push(`Site project version ${project.version} ≠ expected ${SITE_DEVELOPMENT_VERSION}`);
  }
  if (project.coordinates.unitAssumption === "unresolved") {
    issues.push("Site unit assumption is unresolved — confirm feet/meters before generation.");
  }
  if (!project.coordinates.rhinoZToGltfY) {
    issues.push("Site policy expects Rhino Z→glTF Y already applied; flag is false.");
  }
  for (const zone of project.zones) {
    if (zone.polygon.length < 3) issues.push(`Zone ${zone.id} has fewer than 3 vertices.`);
  }
  return {
    ok: issues.length === 0,
    issues,
    policy: project.coordinates.policy,
    latticeCellFeet: 20,
    sitePlanAxes: "polygons store (x,z) site feet; Three.js display is Y-up",
    latticeWorld: "tile world = (ix*20, iy*20, placementWorldZ); mesh local via rotation/mirror variants",
  };
}

export function parseProjectFromText(raw: string) {
  return tryParseProject(raw);
}

export function serializeSiteProject(project: SiteDevelopmentProject) {
  return serializeProject(project);
}

export { parseProject, SITE_DEVELOPMENT_SESSION_KEY };
