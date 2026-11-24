import { LATTICE_FEET, type UnitName } from "../lattice/types";
import type { Point, Polygon } from "./geometry";

export const SITE_DEVELOPMENT_VERSION = 1;
export const SITE_COORDINATE_POLICY =
  "Site display is Three.js Y-up. Rhino Map-Z-to-glTF-Y is already in the file; do not swap axes again. Plan polygons store (x,z) in site feet. Lattice proto forms stay 20×20×20 ft and are not stretched to the property.";

export const PROTO_FORM_BAY_FEET = LATTICE_FEET;

export type SiteUnitName = UnitName;
export type SiteLayerKind =
  | "terrain"
  | "buildings"
  | "roads"
  | "property"
  | "waterfront"
  | "landscape"
  | "infrastructure"
  | "suggested-development"
  | "context";

/** Generation scope: which development regions may receive placements. */
export type GenerationMode = "selected-zone-only" | "enabled-zones" | "entire-site" | "hybrid-site";
export type HybridizationMethod = "integrated" | "adjacent" | "vertical";
export type QuantityMode = "manual" | "automatic";
export type DistributionMode = "balanced" | "waterfront" | "roadway-buffer" | "custom-anchors" | "hybrid";
/**
 * Per-zone form orientation policy.
 * - fixed: every form uses preferredYawDeg (legacy behavior).
 * - automatic: search discrete yaws per form for feasibility.
 * - hybrid: try preferredYawDeg first, then alternatives.
 */
export type OrientationMode = "fixed" | "automatic" | "hybrid";
/** Explicit proto-form geometry library. Never switch silently. */
export type ProtoFormSourceMode = "active-lattice" | "imported-obj" | "saved-lattice-result" | "sample-library";
/** Output classification — do not conflate these. */
export type PlacementKind = "site-placement" | "spatially-grouped" | "lattice-connected-assembly";
export type GenerationScopeSummary = {
  mode: GenerationMode;
  selectedZoneId: string | null;
  participatingZoneIds: string[];
  participatingZoneNames: string[];
};
export type PinnedProtoForm = {
  meshId: string;
  filename: string;
  slotId: string | null;
  revision: string;
};

/** How a typology resolved to a Lattice (or library) mesh. */
export type TypologyBindingStatus =
  | "confirmed"
  | "from-assignment"
  | "suggested"
  | "conflict"
  | "missing";

/**
 * Persistent typology → mesh binding for Site Development.
 * Does not rewrite Lattice catalog assignments; Site keeps its own confirmed picks.
 */
export type TypologySourceBinding = {
  typologyId: SiteTypologyId;
  canonicalSlotId: string;
  meshId: string | null;
  filename: string | null;
  status: TypologyBindingStatus;
  conflictNote: string | null;
  /** When true, Lattice assignment changes do not overwrite this mesh pick. */
  userConfirmed: boolean;
};

export type ProtoFormSourceReport = {
  mode: ProtoFormSourceMode;
  availableCount: number;
  missing: string[];
  labels: string[];
  note: string;
  bindings?: TypologySourceBinding[];
  unresolvedTypologies?: SiteTypologyId[];
  conflictCount?: number;
};

export type SourceFidelityReport = {
  passed: boolean;
  placedCount: number;
  resolvedCount: number;
  missingSourceCount: number;
  fallbackCount: number;
  substitutionCount: number;
  rows: Array<{
    typology: SiteTypologyId | null;
    slotId: string | null;
    filename: string | null;
    meshId: string;
    available: boolean;
    rendered: "authentic-obj" | "missing-source";
  }>;
  note: string;
};
export type PointerKind = "pointerdown" | "pointermove" | "dblclick";
export type SiteTool =
  | "orbit"
  | "draw-polygon"
  | "draw-rectangle"
  | "edit-vertex"
  | "move-zone"
  | "duplicate"
  | "delete"
  | "exclusion"
  | "anchor"
  | "view-corridor"
  | "arrival";

export type SiteTypologyId =
  | "stepped-amphitheater"
  | "void-field-gathering"
  | "inserted-horizontal-plate"
  | "contained-room-within-volume"
  | "linear-edge-gallery";

export const SITE_TYPOLOGIES: Array<{ id: SiteTypologyId; slotId: string; name: string }> = [
  { id: "stepped-amphitheater", slotId: "G1", name: "Stepped Amphitheater" },
  { id: "void-field-gathering", slotId: "G2", name: "Void Field" },
  { id: "inserted-horizontal-plate", slotId: "G3", name: "Inserted Horizontal Plate" },
  { id: "contained-room-within-volume", slotId: "G4", name: "Contained Room Within Volume" },
  { id: "linear-edge-gallery", slotId: "G5", name: "Linear Edge Gallery" },
];

export type TypologyWeight = { id: SiteTypologyId; weight: number };

export type SiteCoordinates = {
  unit: SiteUnitName;
  unitAssumption: "confirmed" | "unresolved";
  feetPerModel: number;
  origin: [number, number, number];
  northDeg: number;
  elevationDatum: number;
  rhinoZToGltfY: boolean;
  policy: string;
};

export type SiteLayerInfo = {
  id: string;
  name: string;
  kind: SiteLayerKind;
  visible: boolean;
  meshCount: number;
  triangleCount: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  color: string;
  suggestedDevelopment: boolean;
  legalBoundary: false;
};

export type SiteModelInfo = {
  filename: string;
  format: "glb" | "obj";
  nodeCount: number;
  meshCount: number;
  bboxModel: { min: [number, number, number]; max: [number, number, number] };
  bboxFeet: { min: [number, number, number]; max: [number, number, number] };
  layers: SiteLayerInfo[];
  suggestedZone: Polygon | null;
  /** Plan footprint of the waterfront layer — used as an automatic generation keep-out. */
  waterExclusion?: Polygon | null;
  waterPolyline: Point[];
  roadPolyline: Point[];
  notes: string[];
};

export type ViewCorridor = {
  id: string;
  name: string;
  points: Point[];
  widthFeet: number;
  priority: number;
};

export type ArrivalPoint = {
  id: string;
  name: string;
  point: Point;
  kind: "road" | "waterfront" | "public" | "private";
};

export type PlacementAnchor = {
  id: string;
  name: string;
  point: Point;
  zoneId: string | null;
};

export type ClusterZone = {
  id: string;
  name: string;
  kind: "zone" | "exclusion";
  color: string;
  polygon: Polygon;
  /** Authorized to participate when generation scope is All Enabled Zones. Independent of selection. */
  enabled: boolean;
  /** Drawn in the viewport when true. Independent of selection and generation. */
  visible: boolean;
  typologies: TypologyWeight[];
  hybridization: HybridizationMethod;
  quantityMode: QuantityMode;
  targetCount: number;
  targetCoveragePercent: number;
  /** Planning proxy for cumulative gross building floor area (ft²), independent of footprint coverage. */
  targetGrossFloorArea: number;
  minCount: number;
  /** Soft preferred upper bound for forms. Not a hidden architectural hard cap. */
  maxCount: number;
  /**
   * Legacy field retained for saved-project hydration only.
   * Not used by generation — intensity is Quantity / Coverage; spatial prefs are Dispersion / Concentration.
   */
  density: number;
  /**
   * 0–100. Soft preference for geographic separation of architectural groups across the zone.
   * Does not change quantity, coverage target, or hard clearances.
   */
  dispersionPercent: number;
  /** Preferred number of architectural groupings (each may contain multiple proto forms). */
  preferredClusterCount: number;
  /**
   * 0–100. Soft preference for how tightly forms organize within each architectural group.
   * Independent of dispersion. Does not change quantity, coverage, or cluster count.
   */
  concentrationPercent: number;
  /** 0–100. Discourages unnecessary identical-source repetition when high. */
  typologyDiversityPercent: number;
  /** When true, attempt to include each selected typology at least once. */
  representAllTypologies: boolean;
  distributionMode: DistributionMode;
  maxHeightFeet: number;
  occupiedLevels: number;
  floorToFloorFeet: number;
  gatheringFloorToFloorFeet: number;
  doubleHeightFeet: number;
  /**
   * Legacy center-to-center spacing (ft). Retained for project hydration.
   * Prefer minEdgeClearanceFeet for new edits.
   */
  minSpacingFeet: number;
  /** Minimum plan edge clearance between independent forms in the same zone. 0 ft allows touch. */
  minEdgeClearanceFeet: number;
  /** Minimum separation between distinct architectural groups in the same zone. 0 ft allowed. */
  clusterSeparationFeet: number;
  /** Minimum separation versus forms belonging to other zones. 0 ft allowed. */
  crossZoneSeparationFeet: number;
  /** Extra tolerance reserved for validated Lattice connectors / intentional interlocks. */
  connectionToleranceFeet: number;
  preferredYawDeg: number;
  /**
   * How individual form yaw is chosen during generation.
   * Defaults to "fixed" for saved-project compatibility.
   */
  orientationMode: OrientationMode;
  /** When true, orientation search is disabled and preferredYawDeg is forced. */
  lockPreferredYaw: boolean;
  /** Include 45° yaw steps after 0/90/180/270 when automatic/hybrid search needs them. */
  orientationFine45: boolean;
  /**
   * Extra vertical offset (ft) above the resolved Site-surface foundation datum.
   * 0 ft = sit on the Site surface (no intentional lift). Independent of building height limits.
   */
  elevationOffsetFeet: number;
  waterfrontPriority: number;
  acousticPriority: number;
  solarPriority: number;
  protectedVoids: boolean;
  program: Array<"focused-work" | "collaborative-work" | "public-gathering" | "waterfront-leisure">;
};

export type SiteCluster = {
  id: string;
  zoneId: string;
  meshId: string;
  slotId: string | null;
  typology: SiteTypologyId | null;
  x: number;
  z: number;
  elevation: number;
  yawDeg: number;
  bayFeet: number;
  alternativeId: string;
  /** Spatial architectural group index within the zone (not a Lattice connector assembly). */
  architecturalClusterId: number | null;
  /** True when generated yaw differs from the zone preferredYawDeg at placement time. */
  yawAdjustedFromPreferred?: boolean;
};

export type ConstraintKind = "hard" | "preference";

export type EvaluationFinding = {
  id: string;
  category: string;
  kind: ConstraintKind;
  passed: boolean;
  score: number;
  reason: string;
};

export type ZoneGenerationStats = {
  zoneId: string;
  zoneName: string;
  requested: number;
  accepted: number;
  rejected: number;
  candidates: number;
  targetCoverage: number;
  achievedCoverage: number;
  /** Usable zone area × targetCoverage / 100 (ft²). */
  targetFootprintArea: number;
  /**
   * Union of architectural plan-occupancy footprints for accepted forms (ft²).
   * This is the coverage metric — not the collision envelope.
   */
  achievedFootprintArea: number;
  /** Union of oriented rectangular collision envelopes (ft²) — diagnostic comparison. */
  collisionEnvelopeArea: number;
  /** Nominal 20×20 registration-bay union (ft²) — diagnostic only. */
  registrationBayFootprintArea: number;
  /** targetFootprintArea − achievedFootprintArea (positive = shortfall). */
  coverageShortfallArea: number;
  /** Mean architectural footprint area used for automatic quantity (ft²). */
  meanSourceFootprintArea: number;
  /** Mean collision-envelope area W×D (ft²) — diagnostic. */
  meanCollisionEnvelopeArea: number;
  footprintMethod: string;
  quantityMode: QuantityMode;
  targetGrossFloorArea: number;
  estimatedGrossFloorArea: number;
  usableArea: number;
  preferredClusters: number;
  architecturalClusters: number;
  meanNearestNeighbor: number;
  dispersionSpread: number;
  measuredMinEdgeClearance: number | null;
  destructiveCollisions: number;
  boundaryViolations: number;
  /** Accepted pairwise clearances verified at envelope/mask without OBB residual conflict. */
  verifiedClearances?: number;
  /** Accepted clearances where extruded OBBs still intersect but occupancy does not (estimated). */
  estimatedClearances?: number;
  typologyCounts: Record<string, number>;
  typologyQuotas: Record<string, number>;
  typologyRequestedPercent: Record<string, number>;
  typologyAchievedPercent: Record<string, number>;
  rejectBreakdown: Record<string, number>;
  /** Forms whose generated yaw differs from the zone preferredYawDeg. */
  orientationAdjustedCount?: number;
  orientationMode?: OrientationMode;
  /** Bounded remove/refill/reseat attempts when quantity/coverage remain unmet. */
  repackAttempts?: number;
  repackImprovements?: number;
  /** Placement stage used for this zone: initial | refinement | extended. */
  optimizationStage?: "initial" | "refinement" | "extended";
  /** Multi-objective bias used while searching. */
  objectiveMode?: "balanced" | "max-coverage" | "max-quantity" | "max-clusters";
  /** Wall-clock ms spent placing this zone (generator-local). */
  generationTimeMs?: number;
  /** Placement evaluation counter (candidate tests). */
  evaluationCount?: number;
  /** evaluationCount / evaluationBudget. */
  budgetUtilization?: number;
  stopReason: string | null;
  budgetExhausted: boolean;
};

export type ArchitecturalFeasibilityFailure = {
  groupId: number;
  category: string;
  reason: string;
};

export type SiteAssemblyConnector = {
  id: string;
  groupId: number;
  kind: string;
  fromClusterId: string;
  toClusterId: string;
  /** Site Three.js Y-up positions (x, y, z) flattened. */
  positions: number[];
  indices: number[];
  accepted: boolean;
  reason: string;
  cost: number;
  circulation: { rise: number; run: number; slope: number } | null;
};

export type LatticeAssemblyReport = {
  architecturalGroups: number;
  groupsAttempted: number;
  groupsConnected: number;
  unconnectedForms: number;
  connectorsAccepted: number;
  connectorsRejected: number;
  feasibilityFailures: ArchitecturalFeasibilityFailure[];
  budgetLimited: boolean;
  note: string;
};

export type GenerationAlternative = {
  id: string;
  seed: number;
  label: string;
  clusters: SiteCluster[];
  findings: EvaluationFinding[];
  hardPassed: boolean;
  /** Placement hard constraints and source fidelity are separate. */
  sourceFidelityPassed: boolean;
  sourceFidelity: SourceFidelityReport | null;
  preferenceScore: number;
  placementKind: PlacementKind;
  zoneStats: ZoneGenerationStats[];
  scope: GenerationScopeSummary;
  protoFormSource: ProtoFormSourceMode;
  sourceLabels: string[];
  distributionMode: DistributionMode;
  assemblyReport?: LatticeAssemblyReport | null;
  assemblyConnectors?: SiteAssemblyConnector[];
  /** True when zone settings changed after this result was produced. */
  stale?: boolean;
  staleReason?: string | null;
  /** Optimization stage that produced this alternative. */
  optimizationStage?: "initial" | "refinement" | "extended";
  /** Multi-objective bias (coverage / quantity / organization). */
  objectiveMode?: "balanced" | "max-coverage" | "max-quantity" | "max-clusters";
  /** Measured-outcome label (not an arbitrary rank). */
  objectiveLabel?: string | null;
};

export type SiteConstraints = {
  waterfrontGradient: number;
  viewPreservation: number;
  roadNoiseBuffer: number;
  heightLimitFeet: number;
  officeFloorToFloor: number;
  collaborativeFloorToFloor: number;
  gatheringFloorToFloor: number;
  doubleHeightFeet: number;
  daytimeOccupants: number;
  eveningGathering: number;
  badgeHolders: number;
};

export type SiteDevelopmentProject = {
  version: number;
  name: string;
  savedAt: string;
  coordinates: SiteCoordinates;
  import: {
    filename: string | null;
    format: "glb" | "obj" | null;
    sampleId: string | null;
  };
  generationMode: GenerationMode;
  protoFormSource: ProtoFormSourceMode;
  pinnedProtoForms: PinnedProtoForm[];
  /** Explicit typology → mesh bindings. Confirmed rows survive Lattice assignment edits. */
  typologyBindings: TypologySourceBinding[];
  /** Computational evaluation budget (independent of architectural quantity targets). */
  evaluationBudget: number;
  layers: Array<{ id: string; visible: boolean; kind: SiteLayerKind }>;
  zones: ClusterZone[];
  exclusions: ClusterZone[];
  anchors: PlacementAnchor[];
  corridors: ViewCorridor[];
  arrivals: ArrivalPoint[];
  constraints: SiteConstraints;
  seed: number;
  alternatives: GenerationAlternative[];
  activeAlternativeId: string | null;
};

export const DEFAULT_SITE_CONSTRAINTS: SiteConstraints = {
  waterfrontGradient: 70,
  viewPreservation: 70,
  roadNoiseBuffer: 55,
  heightLimitFeet: 80,
  officeFloorToFloor: 15.5,
  collaborativeFloorToFloor: 17,
  gatheringFloorToFloor: 20,
  doubleHeightFeet: 32,
  daytimeOccupants: 450,
  eveningGathering: 800,
  badgeHolders: 1500,
};

export function defaultCoordinates(): SiteCoordinates {
  return {
    unit: "meters",
    unitAssumption: "unresolved",
    feetPerModel: 3.280839895,
    origin: [0, 0, 0],
    northDeg: 0,
    elevationDatum: 0,
    rhinoZToGltfY: true,
    policy: SITE_COORDINATE_POLICY,
  };
}

export function emptyProject(name = "Untitled site"): SiteDevelopmentProject {
  return {
    version: SITE_DEVELOPMENT_VERSION,
    name,
    savedAt: "",
    coordinates: defaultCoordinates(),
    import: { filename: null, format: null, sampleId: null },
    generationMode: "enabled-zones",
    protoFormSource: "active-lattice",
    pinnedProtoForms: [],
    typologyBindings: [],
    evaluationBudget: 8000,
    layers: [],
    zones: [],
    exclusions: [],
    anchors: [],
    corridors: [],
    arrivals: [],
    constraints: { ...DEFAULT_SITE_CONSTRAINTS },
    seed: 2041,
    alternatives: [],
    activeAlternativeId: null,
  };
}
