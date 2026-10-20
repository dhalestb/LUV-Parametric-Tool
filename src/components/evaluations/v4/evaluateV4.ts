/**
 * v4 descriptor evaluation. Twelve evaluators share one geometric context built
 * from the original OBJ surfaces. Each returns components with intent, formula,
 * units, normalization, weight, raw value, 0–100 term, and the evidence layers
 * that illustrate it. A missing architectural characteristic scores 0 and is
 * still ranked. NaN is reserved for a genuine processing failure.
 */
import { DESCRIPTOR_ALGORITHM_VERSION } from "../descriptorVersion";
import type { DescriptorSource } from "../objDescriptorAnalysis";
import {
  buildCirculationNetwork,
  gatheringCenter,
  pathTo,
  polylineLength,
  shortestPaths,
  type CirculationNetwork,
} from "./circulation";
import {
  arrowLayer,
  boxPatch,
  nonEmptyLayers,
  PALETTE,
  patchLayer,
  pointLayer,
  polylineLayer,
  segmentLayer,
  squarePatch,
  type ComponentEvidence,
  type DescriptorEvidence,
  type EvidenceLayer,
  type Segment,
} from "./evidence";
import {
  coefficientOfVariation,
  foldEdges,
  innerAreaShare,
  meanFoldAngle,
  minorityOrientationTriangles,
  mirrorAsymmetry,
  nonAxisTriangles,
  orientationEntropy,
  sectionalBands,
  surfaceCentroid,
  triangleArray,
  upperLowerDisplacement,
} from "./formMeasures";
import { buildAnalysisMesh, distance, TriangleGrid, type AnalysisMesh, type Vec3 } from "./geometry";
import {
  clearanceCredit,
  clearancePercentile,
  sampleFloors,
  type FloorField,
  type FloorSample,
} from "./surfaces";
import { crossLevelVisibility, EYE_HEIGHT_FEET, lightExposure, sameLevelVisibility, type LightResult, type VisibilityResult } from "./visibility";
import { analyzeVoids, type VoidResult } from "./voids";

export type V4Options = {
  eyeHeightFeet?: number;
};

export type V4Context = {
  mesh: AnalysisMesh;
  grid: TriangleGrid;
  field: FloorField;
  network: CirculationNetwork;
  sameLevel: VisibilityResult;
  crossLevel: VisibilityResult;
  voids: VoidResult;
  light: LightResult;
  eyeHeight: number;
};

export type V4DescriptorResult = {
  id: string;
  name: string;
  /** Full-precision 0–100 or NaN when unavailable. */
  absoluteScore: number;
  available: boolean;
  unavailableReason?: string;
  evidence: DescriptorEvidence;
};

export type V4Evaluation = {
  version: string;
  sourceId: string;
  sourceHash: string;
  descriptors: V4DescriptorResult[];
  summary: {
    triangles: number;
    surfaceArea: number;
    floorSamples: number;
    levels: number;
    networkNodes: number;
    regions: number;
    entries: number;
    potentialInterfaces: number;
    bounds: { size: Vec3; min: Vec3; max: Vec3 };
  };
};

/** Clearance reference used for volumes: a 20 ft clear bay. */
const VOLUME_CLEAR_CAP_FEET = 20;
const OPEN_VOLUME_REFERENCE_FT3 = 8000;
const MONUMENTAL_VOLUME_REFERENCE_FT3 = 10000;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const pct = (value: number) => clamp01(value) * 100;
/** Linear 0–100 between lo and hi. */
const ramp = (value: number, lo: number, hi: number) => pct((value - lo) / (hi - lo));

export function buildV4Context(source: DescriptorSource, sourceId: string, options: V4Options = {}): V4Context {
  const eyeHeight = options.eyeHeightFeet ?? EYE_HEIGHT_FEET;
  const mesh = buildAnalysisMesh(source, sourceId);
  const grid = new TriangleGrid(mesh, 2);
  const field = sampleFloors(mesh, grid);
  const network = buildCirculationNetwork(field, grid);
  const sameLevel = sameLevelVisibility(network, field, grid, eyeHeight);
  const crossLevel = crossLevelVisibility(network, field, grid, eyeHeight);
  const voids = analyzeVoids(field, grid, mesh.bounds.planDiagonal);
  const light = lightExposure(network, field, grid);
  return { mesh, grid, field, network, sameLevel, crossLevel, voids, light, eyeHeight };
}

type Draft = Omit<ComponentEvidence, "status"> & { status?: ComponentEvidence["status"] };

function component(draft: Draft): ComponentEvidence {
  const unavailable = draft.raw === null || draft.precise === null || !Number.isFinite(draft.precise);
  return {
    ...draft,
    precise: unavailable ? null : Math.max(0, Math.min(100, draft.precise as number)),
    status: unavailable ? "unavailable" : "measured",
  };
}

function finish(
  id: string,
  name: string,
  ctx: V4Context,
  validity: DescriptorEvidence["validity"],
  components: ComponentEvidence[],
  layers: EvidenceLayer[],
  measurements: Record<string, number | string | null>,
  notes: string[],
  unavailableReason?: string,
): V4DescriptorResult {
  const measured = components.filter((item) => item.status === "measured");
  const weight = measured.reduce((sum, item) => sum + item.weight, 0);
  // A missing architectural characteristic scores 0 and is ranked. NaN is reserved
  // for a genuine processing failure (empty mesh), passed as unavailableReason
  // with no components.
  const processingFailed = Boolean(unavailableReason) && !components.length;
  const score = processingFailed ? Number.NaN : weight ? measured.reduce((sum, item) => sum + (item.precise as number) * item.weight, 0) / weight : 0;
  const available = Number.isFinite(score);
  const reason = processingFailed ? unavailableReason : undefined;
  for (const item of components) if (item.status === "unavailable" && item.reason) notes.push(`${item.name}: ${item.reason}`);
  if (measured.length && measured.length < components.length) notes.push(`Weights renormalized over ${measured.length} of ${components.length} components.`);
  return {
    id,
    name,
    absoluteScore: score,
    available,
    unavailableReason: reason,
    evidence: {
      descriptorId: id,
      version: DESCRIPTOR_ALGORITHM_VERSION,
      sourceId: ctx.mesh.sourceId,
      sourceHash: ctx.mesh.sourceHash,
      coordinateSystem: "spec-feet-z-up",
      units: "ft",
      validity: available ? validity : "insufficient-evidence",
      components,
      layers: nonEmptyLayers(layers),
      measurements,
      notes,
    },
  };
}

const samplePatches = (samples: FloorSample[], feet: number) => samples.map((sample) => squarePatch(sample.position, feet));

function clearanceVolume(field: FloorField) {
  let volume = 0;
  for (const sample of field.samples) {
    if (sample.floorClass === "sheltered") volume += sample.area * Math.min(VOLUME_CLEAR_CAP_FEET, sample.clearance ?? VOLUME_CLEAR_CAP_FEET);
    else if (sample.floorClass === "openVoid") volume += sample.area * VOLUME_CLEAR_CAP_FEET;
  }
  return volume;
}

/* ------------------------------------------------------------------ Open Volume */
function openVolume(ctx: V4Context): V4DescriptorResult {
  const { field } = ctx;
  const feet = field.sampleFeet;
  const sheltered = field.samples.filter((sample) => sample.floorClass === "sheltered");
  const qualifying = sheltered.filter((sample) => clearanceCredit(sample.clearance) > 0);
  const openVoid = field.samples.filter((sample) => sample.floorClass === "openVoid");
  const obstructed = field.samples.filter((sample) => sample.floorClass === "obstructed");
  const exposed = field.samples.filter((sample) => sample.floorClass === "exposed");
  const uncertain = field.samples.filter((sample) => sample.floorClass === "uncertain");
  const interior = field.interiorArea;
  const credit = sheltered.reduce((sum, sample) => sum + sample.area * clearanceCredit(sample.clearance), 0);
  const volume = clearanceVolume(field);
  const components = [
    component({
      name: "Sheltered Clearance Share",
      intent: "How much of the interior floor stands under usable covered height.",
      formula: "Σ(sheltered sample area × credit) / interior floor area; credit 0 at ≤ 5 ft, 1 at ≥ 10 ft",
      units: "share",
      normalization: "share × 100",
      weight: 0.45,
      raw: interior ? credit / interior : 0,
      precise: interior ? pct(credit / interior) : 0,
      reason: interior ? undefined : "No interior floor surface found.",
      layerIds: ["ov-qualifying", "ov-volume"],
    }),
    component({
      name: "Open Void Share",
      intent: "Interior floor that opens to the sky inside the form (courts, atria).",
      formula: "open-void sample area / interior floor area; open void = no surface above and lateral enclosure ≥ 0.5",
      units: "share",
      normalization: "share × 100",
      weight: 0.25,
      raw: interior ? field.areaByClass.openVoid / interior : 0,
      precise: interior ? pct(field.areaByClass.openVoid / interior) : 0,
      reason: interior ? undefined : "No interior floor surface found.",
      layerIds: ["ov-void"],
    }),
    component({
      name: "Clearance Volume",
      intent: "Size of the usable clear volume, independent of share.",
      formula: "Σ sample area × min(clearance, 20 ft) over sheltered and open-void samples",
      units: "ft³",
      normalization: "0 ft³ → 0, 8000 ft³ (a 20 × 20 × 20 ft bay) → 100",
      weight: 0.3,
      raw: interior ? volume : 0,
      precise: interior ? ramp(volume, 0, OPEN_VOLUME_REFERENCE_FT3) : 0,
      reason: interior ? undefined : "No interior floor surface found.",
      layerIds: ["ov-volume"],
    }),
  ];
  const prisms = qualifying
    .filter((_, index) => index % Math.max(1, Math.ceil(qualifying.length / 240)) === 0)
    .map((sample) => boxPatch(
      [sample.position[0] - feet * 0.45, sample.position[1] - feet * 0.45, sample.position[2] + 0.05],
      [sample.position[0] + feet * 0.45, sample.position[1] + feet * 0.45, sample.position[2] + Math.min(VOLUME_CLEAR_CAP_FEET, sample.clearance ?? VOLUME_CLEAR_CAP_FEET)],
    ));
  const layers: EvidenceLayer[] = [
    patchLayer({ id: "ov-qualifying", label: "Qualifying sheltered clearance > 5 ft (measured)", color: PALETTE.gold, status: "measured", components: ["Sheltered Clearance Share"] }, samplePatches(qualifying, feet)),
    { ...patchLayer({ id: "ov-volume", label: "Translucent clearance volume above qualifying floor (sampled)", color: PALETTE.gold, status: "measured", components: ["Clearance Volume"], opacity: 0.12 }, prisms, 240), kind: "volume", total: qualifying.length },
    patchLayer({ id: "ov-void", label: "Open void to sky, laterally enclosed (measured)", color: PALETTE.lightBlue, status: "measured", components: ["Open Void Share"] }, samplePatches(openVoid, feet)),
    patchLayer({ id: "ov-sheltered-low", label: "Sheltered interior at or below 5 ft credit (measured, no credit)", color: PALETTE.paleAqua, status: "measured", components: [] }, samplePatches(sheltered.filter((sample) => clearanceCredit(sample.clearance) === 0), feet)),
    patchLayer({ id: "ov-uncertain", label: "Uncertain exposure 0.25–0.5 enclosure (reported, not credited)", color: PALETTE.paleAqua, status: "potential", components: [] }, samplePatches(uncertain, feet)),
    patchLayer({ id: "ov-obstructed", label: "Obstructed ≤ 5 ft (excluded)", color: PALETTE.gray, status: "excluded", components: [] }, samplePatches(obstructed, feet)),
    patchLayer({ id: "ov-exposed", label: "Exterior roof / uncovered exposure (excluded from interior volume)", color: PALETTE.gray, status: "excluded", components: [], opacity: 0.25 }, samplePatches(exposed, feet)),
  ];
  return finish("openVolume", "Open Volume", ctx, "verified-geometric", components, layers, {
    interiorFloorAreaFt2: interior,
    shelteredAreaFt2: field.areaByClass.sheltered,
    openVoidAreaFt2: field.areaByClass.openVoid,
    obstructedAreaFt2: field.areaByClass.obstructed,
    exposedAreaFt2: field.areaByClass.exposed,
    uncertainAreaFt2: field.areaByClass.uncertain,
    clearanceVolumeFt3: volume,
  }, interior
    ? (uncertain.length ? [`${field.areaByClass.uncertain.toFixed(0)} ft² of floor has ambiguous lateral enclosure and is reported, not credited.`] : [])
    : ["No interior floor surface found. Open Volume is absent (scored 0) and the form is still ranked."]);
}

/* ------------------------------------------------------------------- Convergent */
function convergent(ctx: V4Context): V4DescriptorResult {
  const { network, field } = ctx;
  const entries = network.entries;
  const center = gatheringCenter(network, field);
  const notes: string[] = [];
  if (!center) notes.push("No supported floor network was found. Convergence is scored as absent (0), not skipped.");
  else if (entries.length < 2) notes.push(`Only ${entries.length} lowest-level entry. Limited approaches are scored; the form is still ranked.`);
  if (network.potentialInterfaces.length) notes.push(`${network.potentialInterfaces.length} upper-level perimeter opening(s) recorded as potential inter-form connections, not as verified approaches.`);
  if (!center) {
    const layers: EvidenceLayer[] = [
      pointLayer({ id: "cv-entries", label: "Entries on the lowest level (measured)", color: PALETTE.paleAqua, status: "measured", components: ["Destination Agreement"] }, entries.map((entry) => entry.centroid)),
      pointLayer({ id: "cv-potential", label: "Potential upper-level connection interfaces (not verified approaches)", color: PALETTE.gray, status: "potential", components: [] }, network.potentialInterfaces.map((entry) => entry.centroid)),
    ];
    const zeros = [
      component({ name: "Destination Agreement", intent: "Share of entries whose floor route actually reaches the destination.", formula: "verified routes / max(entries, 1)", units: "share", normalization: "share × 100", weight: 0.4, raw: 0, precise: 0, layerIds: ["cv-entries"] }),
      component({ name: "Approach Direction Diversity", intent: "Approaches arriving from different sides.", formula: "distinct 60° sectors / 6", units: "sectors", normalization: "sectors / 6 × 100", weight: 0.25, raw: 0, precise: 0, layerIds: ["cv-routes"] }),
      component({ name: "Convergence Concentration", intent: "How much of the occupiable floor the destination gathers within 8 ft.", formula: "clearance-weighted floor within 8 ft / all network floor", units: "share", normalization: "0 → 0, 0.35 → 100", weight: 0.15, raw: 0, precise: 0, layerIds: ["cv-destination"] }),
      component({ name: "Approach Continuity", intent: "Directness of the verified approaches.", formula: "mean(straight distance / route length)", units: "ratio", normalization: "ratio × 100", weight: 0.2, raw: 0, precise: 0, layerIds: ["cv-routes"] }),
    ];
    return finish("convergent", "Convergent", ctx, "verified-geometric", zeros, layers, { entries: entries.length, potentialInterfaces: network.potentialInterfaces.length }, notes);
  }
  const destination = network.nodes[center.nodeId];
  const routes: Vec3[][] = [];
  const unsupported: Segment[] = [];
  let straightness = 0;
  const sectors = new Set<number>();
  for (const entry of entries) {
    const { dist, prev } = shortestPaths(network, entry.nodeIds);
    if (!Number.isFinite(dist[destination.id])) {
      unsupported.push({ a: entry.centroid, b: destination.position });
      notes.push(`Entry ${entry.id + 1}: no supported route reaches the destination (candidate rejected).`);
      continue;
    }
    const path = pathTo(prev, destination.id).map((id) => network.nodes[id].position);
    const length = polylineLength(network, pathTo(prev, destination.id));
    const straight = distance(path[0], destination.position);
    straightness += length > 0 ? Math.min(1, straight / length) : 1;
    routes.push(path);
    const angle = Math.atan2(destination.position[1] - entry.centroid[1], destination.position[0] - entry.centroid[0]);
    sectors.add(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 6) % 6);
  }
  const verified = routes.length;
  const components = [
    component({
      name: "Destination Agreement",
      intent: "Share of entries whose floor-surface route actually reaches the destination.",
      formula: "verified routes / entries; 0 when there is no entry",
      units: "share",
      normalization: "share × 100",
      weight: 0.4,
      raw: entries.length ? verified / entries.length : 0,
      precise: entries.length ? pct(verified / entries.length) : 0,
      layerIds: ["cv-routes", "cv-destination", "cv-entries", "cv-unsupported"],
    }),
    component({
      name: "Approach Direction Diversity",
      intent: "Approaches arriving from different sides.",
      formula: "distinct 60° sectors of entry→destination bearings among verified routes / 6",
      units: "sectors",
      normalization: "sectors / 6 × 100",
      weight: 0.25,
      raw: sectors.size,
      precise: pct(sectors.size / 6),
      layerIds: ["cv-routes"],
    }),
    component({
      name: "Convergence Concentration",
      intent: "How much of the occupiable floor the destination gathers within 8 ft.",
      formula: "clearance-weighted floor within 8 ft of the destination / all network floor",
      units: "share",
      normalization: "0 → 0, 0.35 → 100",
      weight: 0.15,
      raw: center.share,
      precise: ramp(center.share, 0, 0.35),
      layerIds: ["cv-destination"],
    }),
    component({
      name: "Approach Continuity",
      intent: "Directness of the verified approaches.",
      formula: "mean(straight distance / route length) over verified routes; 0 when none",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.2,
      raw: verified ? straightness / verified : 0,
      precise: verified ? pct(straightness / verified) : 0,
      layerIds: ["cv-routes"],
    }),
  ];
  const arrows = routes.filter((route) => route.length >= 2).map((route) => ({ a: route[Math.max(0, route.length - 4)], b: route[route.length - 1] }));
  const layers: EvidenceLayer[] = [
    polylineLayer({ id: "cv-routes", label: `Verified approach routes on floor surfaces (${verified} of ${entries.length})`, color: PALETTE.cyan, status: "verified", components: ["Destination Agreement", "Approach Direction Diversity", "Approach Continuity"] }, routes),
    arrowLayer({ id: "cv-arrows", label: "Approach direction into destination", color: PALETTE.cyan, status: "verified", components: ["Approach Direction Diversity"] }, arrows),
    pointLayer({ id: "cv-destination", label: "Destination: densest clearance-weighted floor (measured)", color: PALETTE.gold, status: "measured", components: ["Convergence Concentration"] }, [destination.position]),
    pointLayer({ id: "cv-entries", label: "Entries on the lowest level (measured)", color: PALETTE.paleAqua, status: "measured", components: ["Destination Agreement"] }, entries.map((entry) => entry.centroid), entries.map((entry) => `E${entry.id + 1}`)),
    segmentLayer({ id: "cv-unsupported", label: "Entry without a supported route (candidate, rejected)", color: PALETTE.gray, status: "excluded", components: ["Destination Agreement"], lineStyle: "dashed" }, unsupported),
    pointLayer({ id: "cv-potential", label: "Potential upper-level connection interfaces (not verified approaches)", color: PALETTE.gray, status: "potential", components: [] }, network.potentialInterfaces.map((entry) => entry.centroid)),
  ];
  return finish("convergent", "Convergent", ctx, "verified-geometric", components, layers, {
    entries: entries.length,
    verifiedRoutes: verified,
    directionSectors: sectors.size,
    destinationShare: center.share,
  }, notes);
}

/* ------------------------------------------------------------------- Sculptural */
function sculptural(ctx: V4Context): V4DescriptorResult {
  const { mesh, field } = ctx;
  const edges = foldEdges(mesh);
  const fold = meanFoldAngle(edges);
  const entropy = orientationEntropy(mesh);
  const bands = sectionalBands(mesh, 2);
  const cv = coefficientOfVariation(bands.map((band) => band.area));
  const tops = field.columns.map((column) => ({ x: column.x, y: column.y, topZ: column.hits[column.hits.length - 1].z }));
  const mirror = mirrorAsymmetry(tops, mesh.bounds.center, field.sampleFeet);
  const components = [
    component({
      name: "Adjacent Fold Angle",
      intent: "How sharply neighbouring surfaces fold.",
      formula: "area-weighted mean dihedral angle over shared mesh edges",
      units: "degrees",
      normalization: "angle / 90° × 100",
      weight: 0.3,
      raw: fold,
      precise: fold === null ? null : pct(fold / 90),
      reason: fold === null ? "No shared mesh edges (surfaces are not connected)." : undefined,
      layerIds: ["sc-folds"],
    }),
    component({
      name: "Orientation Variety",
      intent: "Spread of surface orientation, area-weighted.",
      formula: "Shannon entropy of area over 26 normal bins / log(26)",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.25,
      raw: entropy,
      precise: entropy === null ? null : pct(entropy),
      reason: entropy === null ? "No surface area." : undefined,
      layerIds: ["sc-orientation"],
    }),
    component({
      name: "Sectional Variation",
      intent: "Change of the form with height.",
      formula: "coefficient of variation of surface area per 2 ft horizontal band",
      units: "cv",
      normalization: "cv / 0.75 × 100",
      weight: 0.25,
      raw: cv,
      precise: cv === null ? null : pct(cv / 0.75),
      reason: cv === null ? "Fewer than two height bands." : undefined,
      layerIds: ["sc-bands"],
    }),
    component({
      name: "Mirror Asymmetry",
      intent: "Departure from bilateral symmetry in plan and height.",
      formula: "unmatched 1 ft plan columns (top height within 2 ft) under the best x or y mirror / columns",
      units: "share",
      normalization: "share × 100",
      weight: 0.2,
      raw: mirror?.asymmetry ?? null,
      precise: mirror ? pct(mirror.asymmetry) : null,
      reason: mirror ? undefined : "No plan columns.",
      layerIds: ["sc-mirror"],
    }),
  ];
  const strongFolds = edges.filter((edge) => edge.angleDeg >= 30).sort((left, right) => right.weight - left.weight);
  const minority = minorityOrientationTriangles(mesh);
  const maxBand = Math.max(...bands.map((band) => band.area), 1e-6);
  const bandBars: Segment[] = bands.map((band) => ({
    a: [mesh.bounds.min[0], mesh.bounds.min[1] - 1.5, (band.z0 + band.z1) / 2],
    b: [mesh.bounds.min[0] + (band.area / maxBand) * mesh.bounds.size[0], mesh.bounds.min[1] - 1.5, (band.z0 + band.z1) / 2],
  }));
  const minorityLimit = 6000;
  const minorityStep = Math.max(1, Math.ceil(minority.triangles.length / minorityLimit));
  const minoritySampled = minority.triangles.filter((_, index) => index % minorityStep === 0);
  const layers: EvidenceLayer[] = [
    segmentLayer({ id: "sc-folds", label: `Fold edges ≥ 30° (measured${strongFolds.length > 2500 ? ", sampled" : ""})`, color: PALETTE.gold, status: "measured", components: ["Adjacent Fold Angle"] }, strongFolds.map((edge) => ({ a: edge.a, b: edge.b }))),
    {
      id: "sc-orientation",
      label: "Minority-orientation surfaces (outside the dominant half of area)",
      color: PALETTE.lightBlue,
      kind: "patch",
      status: "measured",
      components: ["Orientation Variety"],
      lineStyle: "solid",
      triangles: triangleArray(minoritySampled, 0.02),
      shown: minoritySampled.length,
      total: minority.triangles.length,
      opacity: 0.45,
    },
    { ...segmentLayer({ id: "sc-bands", label: "Surface area per 2 ft band (bar length ∝ area)", color: PALETTE.midBlue, status: "measured", components: ["Sectional Variation"] }, bandBars), dimensions: bands.map((band, index) => ({ a: bandBars[index].a, b: bandBars[index].b, text: `${band.area.toFixed(0)} ft²` })) },
    pointLayer({ id: "sc-mirror", label: `Columns unmatched under ${mirror?.axis ?? "x"} mirror (reference symmetry)`, color: PALETTE.gray, status: "reference", components: ["Mirror Asymmetry"] }, (mirror?.unmatched ?? []).map((item): Vec3 => [item.x, item.y, item.z])),
  ];
  return finish("sculptural", "Sculptural", ctx, "verified-geometric", components, layers, {
    sharedEdges: edges.length,
    foldEdgesOver30: strongFolds.length,
    meanFoldDeg: fold,
    bands: bands.length,
    mirrorAxis: mirror?.axis ?? null,
  }, []);
}

/* ------------------------------------------------------------ Visually Connected */
function visuallyConnected(ctx: V4Context): V4DescriptorResult {
  const { sameLevel, mesh } = ctx;
  const tested = sameLevel.tested;
  const clearRays = sameLevel.rays.filter((ray) => ray.clear);
  const blocked = sameLevel.rays.filter((ray) => !ray.clear);
  const components = [
    component({
      name: "Same-Level Coverage",
      intent: "Share of eye-height sightlines between standing positions on one level that are clear.",
      formula: `clear rays / tested rays; origins every 3 ft on supported floors, eye ${ctx.eyeHeight} ft, up to 24 targets each`,
      units: "share",
      normalization: "share × 100",
      weight: 0.4,
      raw: tested ? sameLevel.clear / tested : 0,
      precise: tested ? pct(sameLevel.clear / tested) : 0,
      reason: tested ? undefined : "Fewer than two viewing positions share a level.",
      layerIds: ["vc-clear", "vc-origins", "vc-blocked"],
    }),
    component({
      name: "Mean Clear Sightline",
      intent: "How far clear views reach across the form.",
      formula: "mean clear ray length / plan diagonal",
      units: "ft",
      normalization: "length / plan diagonal × 100",
      weight: 0.3,
      raw: sameLevel.meanClearLength ?? 0,
      precise: sameLevel.meanClearLength === null ? 0 : pct(sameLevel.meanClearLength / Math.max(1, mesh.bounds.planDiagonal)),
      reason: sameLevel.meanClearLength === null ? (tested ? "No clear sightline was found." : "No sightlines tested.") : undefined,
      layerIds: ["vc-clear"],
    }),
    component({
      name: "Region-Pair Connection",
      intent: "Distinct floor regions on one level that see each other.",
      formula: "region pairs with ≥ 1 clear ray / region pairs tested",
      units: "share",
      normalization: "share × 100",
      weight: 0.3,
      raw: sameLevel.regionPairsTested ? sameLevel.regionPairsConnected / sameLevel.regionPairsTested : 0,
      precise: sameLevel.regionPairsTested ? pct(sameLevel.regionPairsConnected / sameLevel.regionPairsTested) : 0,
      reason: sameLevel.regionPairsTested ? undefined : "Each level holds a single floor region; there is no second region to connect.",
      layerIds: ["vc-clear", "vc-targets"],
    }),
  ];
  if (sameLevel.meanClearLength === null && tested) {
    components[1] = component({ ...components[1], raw: 0, precise: 0, reason: undefined });
  }
  const targets = new Map<string, Vec3>();
  for (const ray of clearRays) targets.set(ray.b.join(","), ray.b);
  const layers: EvidenceLayer[] = [
    segmentLayer({ id: "vc-clear", label: `Accepted same-level sightlines (${sameLevel.clear} of ${tested} tested)`, color: PALETTE.cyan, status: "measured", components: ["Same-Level Coverage", "Mean Clear Sightline", "Region-Pair Connection"] }, clearRays.map((ray) => ({ a: ray.a, b: ray.b })), 1500),
    pointLayer({ id: "vc-origins", label: `Viewing positions, eye ${ctx.eyeHeight} ft (measured)`, color: PALETTE.gold, status: "measured", components: ["Same-Level Coverage"] }, sameLevel.origins.map((node): Vec3 => [node.position[0], node.position[1], node.position[2] + ctx.eyeHeight])),
    pointLayer({ id: "vc-targets", label: "Visible targets (reached by a clear ray)", color: PALETTE.lightBlue, status: "measured", components: ["Region-Pair Connection"] }, [...targets.values()]),
    segmentLayer({ id: "vc-blocked", label: `Obstructed sightlines (${blocked.length}, sampled)`, color: PALETTE.gray, status: "excluded", components: ["Same-Level Coverage"], lineStyle: "dashed" }, blocked.map((ray) => ({ a: ray.a, b: ray.blockedAt ?? ray.b })), 400),
  ];
  return finish("visuallyConnected", "Visually Connected", ctx, "verified-geometric", components, layers, {
    raysTested: tested,
    raysClear: sameLevel.clear,
    viewingPositions: sameLevel.origins.length,
    regionPairsTested: sameLevel.regionPairsTested,
    regionPairsConnected: sameLevel.regionPairsConnected,
    eyeHeightFt: ctx.eyeHeight,
  }, tested ? [] : ["Fewer than two eye-height viewing positions share a detected level. Visual connection is absent (scored 0) and the form is still ranked."]);
}

/* ---------------------------------------------------------------------- Surreal */
function surreal(ctx: V4Context): V4DescriptorResult {
  const { mesh, field, network } = ctx;
  const nonAxis = nonAxisTriangles(mesh, 15);
  const displacement = upperLowerDisplacement(mesh);
  const planRef = Math.max(1, 0.25 * Math.max(mesh.bounds.size[0], mesh.bounds.size[1]));
  const lowest = field.levels.length ? field.levels.reduce((low, level) => (level.elevation < low.elevation ? level : low)).id : -1;
  const upperSamples = field.samples.filter((sample) => sample.levelId >= 0 && sample.levelId !== lowest && !sample.roofLid);
  const unsupported = upperSamples.filter((sample) => !sample.supported);
  const upperArea = upperSamples.reduce((sum, sample) => sum + sample.area, 0);
  const regions = network.regions;
  const clearances = regions.map((region) => region.meanClearance);
  const contrast = regions.length >= 2 ? 1 - Math.min(...clearances) / Math.max(...clearances) : null;
  const components = [
    component({
      name: "Non-Axis Surface Area",
      intent: "Surfaces that lean away from every world axis.",
      formula: "area of triangles whose normal is > 15° from all axes / total area",
      units: "share",
      normalization: "0 → 0, 0.5 → 100",
      weight: 0.3,
      raw: mesh.area ? nonAxis.area / mesh.area : null,
      precise: mesh.area ? ramp(nonAxis.area / mesh.area, 0, 0.5) : null,
      reason: mesh.area ? undefined : "No surface area.",
      layerIds: ["su-nonaxis"],
    }),
    component({
      name: "Upper/Lower Displacement",
      intent: "The upper half of the form shifted off the lower half.",
      formula: "plan distance between area-weighted centroids of the upper and lower halves",
      units: "ft",
      normalization: "0 → 0, 0.25 × plan extent → 100",
      weight: 0.25,
      raw: displacement?.offset ?? null,
      precise: displacement ? ramp(displacement.offset, 0, planRef) : null,
      reason: displacement ? undefined : "The form has no upper or lower half.",
      layerIds: ["su-displacement"],
    }),
    component({
      name: "Unsupported Floor Share",
      intent: "Upper floor that has nothing beneath it (cantilever or floating).",
      formula: "upper-level floor samples with no surface more than 1 ft below / upper-level floor area",
      units: "share",
      normalization: "share × 100",
      weight: 0.25,
      raw: upperArea ? unsupported.length * field.sampleFeet ** 2 / upperArea : null,
      precise: upperArea ? pct((unsupported.length * field.sampleFeet ** 2) / upperArea) : null,
      reason: upperArea ? undefined : "No upper level floor exists.",
      layerIds: ["su-cantilever"],
    }),
    component({
      name: "Region Scale Contrast",
      intent: "Sharp change in clear height between occupiable regions.",
      formula: "1 − min(region mean clearance) / max(region mean clearance)",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.2,
      raw: contrast,
      precise: contrast === null ? null : pct(contrast),
      reason: contrast === null ? "Fewer than two occupiable regions." : undefined,
      layerIds: ["su-scale"],
    }),
  ];
  const nonAxisStep = Math.max(1, Math.ceil(nonAxis.triangles.length / 6000));
  const nonAxisSampled = nonAxis.triangles.filter((_, index) => index % nonAxisStep === 0);
  const layers: EvidenceLayer[] = [
    patchLayer({ id: "su-cantilever", label: "Unsupported upper floor (measured)", color: PALETTE.gold, status: "measured", components: ["Unsupported Floor Share"] }, samplePatches(unsupported, field.sampleFeet)),
    {
      id: "su-nonaxis",
      label: "Non-axis surfaces > 15° from every axis (measured)",
      color: PALETTE.lightBlue,
      kind: "patch",
      status: "measured",
      components: ["Non-Axis Surface Area"],
      lineStyle: "solid",
      triangles: triangleArray(nonAxisSampled, 0.02),
      shown: nonAxisSampled.length,
      total: nonAxis.triangles.length,
      opacity: 0.45,
    },
    arrowLayer({ id: "su-displacement", label: displacement ? `Upper/lower centroid displacement ${displacement.offset.toFixed(1)} ft` : "Upper/lower centroid displacement", color: PALETTE.cyan, status: "measured", components: ["Upper/Lower Displacement"] }, displacement ? [{ a: displacement.lower, b: displacement.upper }] : []),
    pointLayer({ id: "su-scale", label: "Region mean clearance (scale contrast)", color: PALETTE.midBlue, status: "measured", components: ["Region Scale Contrast"] }, regions.map((region) => region.centroid), regions.map((region) => `${region.meanClearance.toFixed(1)} ft`)),
  ];
  return finish("surreal", "Surreal", ctx, "architectural-proxy", components, layers, {
    nonAxisAreaFt2: nonAxis.area,
    displacementFt: displacement?.offset ?? null,
    unsupportedAreaFt2: unsupported.length * field.sampleFeet ** 2,
    upperFloorAreaFt2: upperArea,
    regions: regions.length,
  }, []);
}

/* ------------------------------------------------------------------- Monumental */
function monumental(ctx: V4Context): V4DescriptorResult {
  const { mesh, field } = ctx;
  const height = mesh.bounds.size[2];
  const maxPlan = Math.max(mesh.bounds.size[0], mesh.bounds.size[1], 0.01);
  const volume = clearanceVolume(field);
  const largest = field.levels.length ? field.levels.reduce((best, level) => (level.area > best.area ? level : best)) : null;
  const tallest = clearancePercentile(field.samples, 0.95);
  const components = [
    component({
      name: "Height",
      intent: "Overall height of the form.",
      formula: "bounding height in feet",
      units: "ft",
      normalization: "8 ft → 0, 40 ft → 100",
      weight: 0.35,
      raw: height,
      precise: ramp(height, 8, 40),
      layerIds: ["mo-height"],
    }),
    component({
      name: "Identifiable Clear Volume",
      intent: "A large clear volume, not a bounding box.",
      formula: "Σ sample area × min(clearance, 20 ft) over sheltered and open-void floor",
      units: "ft³",
      normalization: "0 → 0, 10 000 ft³ → 100",
      weight: 0.25,
      raw: field.interiorArea ? volume : null,
      precise: field.interiorArea ? ramp(volume, 0, MONUMENTAL_VOLUME_REFERENCE_FT3) : null,
      reason: field.interiorArea ? undefined : "No interior floor surface.",
      layerIds: ["mo-volume"],
    }),
    component({
      name: "Largest Uninterrupted Level",
      intent: "A single large floor plane.",
      formula: "area of the largest detected level",
      units: "ft²",
      normalization: "0 → 0, 1600 ft² → 100",
      weight: 0.15,
      raw: largest?.area ?? null,
      precise: largest ? ramp(largest.area, 0, 1600) : null,
      reason: largest ? undefined : "No level of at least 16 ft² detected.",
      layerIds: ["mo-level"],
    }),
    component({
      name: "Tallest Clear Height",
      intent: "The tallest covered clear height.",
      formula: "95th percentile clearance of sheltered floor samples",
      units: "ft",
      normalization: "8 ft → 0, 30 ft → 100",
      weight: 0.15,
      raw: tallest,
      precise: tallest === null ? null : ramp(tallest, 8, 30),
      reason: tallest === null ? "No sheltered floor; there is no covered clear height to measure." : undefined,
      layerIds: ["mo-clear-height"],
    }),
    component({
      name: "Vertical Dominance",
      intent: "Height relative to plan extent.",
      formula: "height / largest plan dimension",
      units: "ratio",
      normalization: "0.4 → 0, 2.5 → 100",
      weight: 0.1,
      raw: height / maxPlan,
      precise: ramp(height / maxPlan, 0.4, 2.5),
      layerIds: ["mo-height", "mo-plan"],
    }),
  ];
  const { min, max } = mesh.bounds;
  const heightLine: Segment = { a: [min[0] - 1, min[1] - 1, min[2]], b: [min[0] - 1, min[1] - 1, max[2]] };
  const planX: Segment = { a: [min[0], min[1] - 2, min[2]], b: [max[0], min[1] - 2, min[2]] };
  const planY: Segment = { a: [min[0] - 2, min[1], min[2]], b: [min[0] - 2, max[1], min[2]] };
  const tallSamples = field.samples
    .filter((sample) => sample.floorClass === "sheltered" && sample.clearance !== null && tallest !== null && sample.clearance >= tallest - 0.5)
    .slice(0, 200);
  const sheltered = field.samples.filter((sample) => sample.floorClass === "sheltered" || sample.floorClass === "openVoid");
  const volumeStep = Math.max(1, Math.ceil(sheltered.length / 200));
  const volumeBoxes = sheltered.filter((_, index) => index % volumeStep === 0).map((sample) => boxPatch(
    [sample.position[0] - 0.45, sample.position[1] - 0.45, sample.position[2] + 0.05],
    [sample.position[0] + 0.45, sample.position[1] + 0.45, sample.position[2] + Math.min(VOLUME_CLEAR_CAP_FEET, sample.clearance ?? VOLUME_CLEAR_CAP_FEET)],
  ));
  const layers: EvidenceLayer[] = [
    { ...segmentLayer({ id: "mo-height", label: `Height ${height.toFixed(1)} ft (measured)`, color: PALETTE.gold, status: "measured", components: ["Height", "Vertical Dominance"] }, [heightLine]), dimensions: [{ ...heightLine, text: `${height.toFixed(1)} ft` }] },
    { ...segmentLayer({ id: "mo-plan", label: `Plan ${mesh.bounds.size[0].toFixed(1)} × ${mesh.bounds.size[1].toFixed(1)} ft (measured)`, color: PALETTE.cyan, status: "measured", components: ["Vertical Dominance"] }, [planX, planY]), dimensions: [{ ...planX, text: `${mesh.bounds.size[0].toFixed(1)} ft` }, { ...planY, text: `${mesh.bounds.size[1].toFixed(1)} ft` }] },
    { ...patchLayer({ id: "mo-volume", label: `Clear volume ${volume.toFixed(0)} ft³ (sampled columns)`, color: PALETTE.lightBlue, status: "measured", components: ["Identifiable Clear Volume"], opacity: 0.12 }, volumeBoxes, 200), kind: "volume", total: sheltered.length },
    pointLayer({ id: "mo-clear-height", label: tallest === null ? "Tallest clear height" : `Tallest clear height ${tallest.toFixed(1)} ft`, color: PALETTE.lightBlue, status: "measured", components: ["Tallest Clear Height"] }, tallSamples.map((sample): Vec3 => [sample.position[0], sample.position[1], sample.position[2] + (sample.clearance ?? 0)]), undefined, 60),
    patchLayer({ id: "mo-level", label: largest ? `Largest level ${largest.area.toFixed(0)} ft² at ${largest.elevation.toFixed(1)} ft (reference)` : "Largest level", color: PALETTE.gray, status: "reference", components: ["Largest Uninterrupted Level"], opacity: 0.3 }, largest ? samplePatches(largest.sampleIds.map((id) => field.samples[id]), field.sampleFeet) : []),
  ];
  return finish("monumental", "Monumental", ctx, "verified-geometric", components, layers, {
    heightFt: height,
    planXFt: mesh.bounds.size[0],
    planYFt: mesh.bounds.size[1],
    clearVolumeFt3: volume,
    largestLevelFt2: largest?.area ?? null,
    tallestClearFt: tallest,
  }, []);
}

/* ----------------------------------------------------------------- Hierarchical */
function hierarchical(ctx: V4Context): V4DescriptorResult {
  const { field } = ctx;
  const ordered = [...field.levels].sort((left, right) => right.area - left.area || left.elevation - right.elevation);
  const n = ordered.length;
  const total = ordered.reduce((sum, level) => sum + level.area, 0);
  const regionPlanes = [...ctx.network.regions].sort((left, right) => right.area - left.area || left.id - right.id);
  const usingRegions = n < 2;
  const planes = usingRegions
    ? regionPlanes.map((region) => ({ area: region.area, elevation: ordered.find((level) => level.id === region.levelId)?.elevation ?? region.centroid[2], sampleIds: region.nodeIds.map((id) => ctx.network.nodes[id].sampleId), centroid: region.centroid }))
    : ordered.map((level) => ({ area: level.area, elevation: level.elevation, sampleIds: level.sampleIds, centroid: level.centroid }));
  const planeCount = planes.length;
  const planeTotal = planes.reduce((sum, plane) => sum + plane.area, 0) || 1;
  const notes: string[] = [];
  if (usingRegions) notes.push(planeCount < 2
    ? "One architectural level and one occupiable region. Hierarchy of planes is absent (scored 0) and the form is still ranked."
    : "One architectural level. Hierarchy is measured among occupiable regions on that level.");
  const [primary, secondary, tertiary] = planes;
  const dominance = primary ? primary.area / planeTotal : 0;
  const othersElevation = planeCount >= 2 ? planes.slice(1).reduce((sum, plane) => sum + plane.elevation * plane.area, 0) / (planeTotal - primary.area) : primary?.elevation ?? 0;
  const separation = planeCount >= 2 ? Math.abs(primary.elevation - othersElevation) : 0;
  const nPlanes = Math.max(1, planeCount);
  const components = [
    component({
      name: "Primary Dominance",
      intent: "How much the largest level dominates all floor area.",
      formula: "(A₁ / ΣA − 1/n) / (1 − 1/n)",
      units: "share",
      normalization: "equal shares → 0, all area on one level → 100",
      weight: 0.35,
      raw: dominance,
      precise: nPlanes >= 2 ? pct((dominance - 1 / nPlanes) / (1 - 1 / nPlanes)) : 0,
      layerIds: ["hi-primary"],
    }),
    component({
      name: "Primary/Secondary Gap",
      intent: "Clear step between the first and second level.",
      formula: "1 − A₂ / A₁",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.3,
      raw: primary && secondary ? 1 - secondary.area / primary.area : 0,
      precise: primary && secondary ? pct(1 - secondary.area / primary.area) : 0,
      layerIds: ["hi-primary", "hi-secondary"],
    }),
    component({
      name: "Secondary/Tertiary Gap",
      intent: "A third tier distinct from the second.",
      formula: "1 − A₃ / A₂",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.2,
      raw: tertiary && secondary ? 1 - tertiary.area / secondary.area : 0,
      precise: tertiary && secondary ? pct(1 - tertiary.area / secondary.area) : 0,
      layerIds: ["hi-secondary", "hi-tertiary"],
    }),
    component({
      name: "Elevation Separation",
      intent: "The primary plane set apart in height from the others.",
      formula: "|z₁ − area-weighted mean z of other levels|",
      units: "ft",
      normalization: "0 → 0, 10 ft → 100",
      weight: 0.15,
      raw: separation,
      precise: ramp(separation, 0, 10),
      layerIds: ["hi-primary", "hi-secondary"],
    }),
  ];
  const patchesOf = (ids: number[]) => samplePatches(ids.map((id) => field.samples[id]), field.sampleFeet);
  const layers: EvidenceLayer[] = [
    primary ? { ...patchLayer({ id: "hi-primary", label: `Primary ${usingRegions ? "region" : "level"} ${primary.area.toFixed(0)} ft² at ${primary.elevation.toFixed(1)} ft`, color: PALETTE.gold, status: "measured", components: ["Primary Dominance", "Primary/Secondary Gap", "Elevation Separation"] }, patchesOf(primary.sampleIds)), dimensions: [{ a: primary.centroid, b: primary.centroid, text: `${primary.area.toFixed(0)} ft²` }] } : patchLayer({ id: "hi-primary", label: "Primary plane", color: PALETTE.gold, status: "measured", components: [] }, []),
    secondary ? { ...patchLayer({ id: "hi-secondary", label: `Secondary ${usingRegions ? "region" : "level"} ${secondary.area.toFixed(0)} ft² at ${secondary.elevation.toFixed(1)} ft`, color: PALETTE.lightBlue, status: "measured", components: ["Primary/Secondary Gap", "Secondary/Tertiary Gap"] }, patchesOf(secondary.sampleIds)), dimensions: [{ a: secondary.centroid, b: secondary.centroid, text: `${secondary.area.toFixed(0)} ft²` }] } : patchLayer({ id: "hi-secondary", label: "Secondary plane", color: PALETTE.lightBlue, status: "measured", components: [] }, []),
    tertiary
      ? { ...patchLayer({ id: "hi-tertiary", label: `Tertiary ${usingRegions ? "region" : "level"} ${tertiary.area.toFixed(0)} ft² at ${tertiary.elevation.toFixed(1)} ft`, color: PALETTE.midBlue, status: "measured", components: ["Secondary/Tertiary Gap"] }, patchesOf(tertiary.sampleIds)), dimensions: [{ a: tertiary.centroid, b: tertiary.centroid, text: `${tertiary.area.toFixed(0)} ft²` }] }
      : patchLayer({ id: "hi-tertiary", label: "Tertiary plane", color: PALETTE.midBlue, status: "measured", components: [] }, []),
    patchLayer({ id: "hi-other", label: `Further planes (${Math.max(0, planeCount - 3)}, reference)`, color: PALETTE.gray, status: "reference", components: [] }, patchesOf(planes.slice(3).flatMap((plane) => plane.sampleIds))),
    patchLayer({ id: "hi-branches", label: `Perimeter branches (${field.branches.length}, potential inter-form connections)`, color: PALETTE.gray, status: "potential", components: [] }, samplePatches(field.branches.flatMap((branch) => branch.sampleIds.map((id) => field.samples[id])), field.sampleFeet)),
  ];
  return finish("hierarchical", "Hierarchical", ctx, "verified-geometric", components, layers, {
    levels: ordered.length,
    planes: planeCount,
    primaryAreaFt2: primary?.area ?? 0,
    secondaryAreaFt2: secondary?.area ?? null,
    tertiaryAreaFt2: tertiary?.area ?? null,
    separationFt: separation,
    branches: field.branches.length,
  }, notes);
}

/* ------------------------------------------------------------------- Sequential */
function sequential(ctx: V4Context): V4DescriptorResult {
  const { network, field } = ctx;
  const entries = [...network.entries].sort((left, right) => right.nodeIds.length - left.nodeIds.length || left.id - right.id);
  const largestRegion = [...network.regions].sort((left, right) => right.area - left.area || left.id - right.id)[0];
  const start = entries[0] ?? (largestRegion
    ? { id: -1, nodeIds: largestRegion.nodeIds, centroid: largestRegion.centroid, outward: [1, 0, 0] as Vec3, levelId: largestRegion.levelId }
    : null);
  const potentialLinks = network.levelLinks.filter((link) => link.status === "potential");
  const potentialSegments: Segment[] = potentialLinks.map((link) => {
    const lower = field.levels.find((level) => level.id === link.lowerLevelId)!;
    const upper = field.levels.find((level) => level.id === link.upperLevelId)!;
    const anchor = link.anchor ?? lower.centroid;
    return { a: [anchor[0], anchor[1], lower.elevation], b: [anchor[0], anchor[1], upper.elevation] };
  });
  if (!start) {
    return finish("sequential", "Sequential", ctx, "verified-geometric", [
      component({ name: "Sequence Length", intent: "Distinct floor regions on the longest verified route.", formula: "n / (n + 3)", units: "regions", normalization: "saturating", weight: 0.25, raw: 0, precise: 0, layerIds: ["sq-path"] }),
      component({ name: "Transition Quality", intent: "Each region change should alter elevation, direction, scale, or enclosure.", formula: "mean change types / 3", units: "ratio", normalization: "ratio × 100", weight: 0.35, raw: 0, precise: 0, layerIds: ["sq-horizontal"] }),
      component({ name: "Elevation Progression", intent: "The sequence climbs through the levels that exist.", formula: "(levels visited − 1) / (levels − 1)", units: "levels", normalization: "ratio × 100", weight: 0.15, raw: 0, precise: 0, layerIds: ["sq-vertical"] }),
      component({ name: "Verified Share", intent: "Vertical moves that are geometrically supported.", formula: "verified / (verified + potential)", units: "share", normalization: "share × 100", weight: 0.25, raw: 0, precise: 0, layerIds: ["sq-potential"] }),
    ], [
      segmentLayer({ id: "sq-potential", label: "Potential vertical connection (unverified)", color: PALETTE.gray, status: "potential", components: ["Verified Share"], lineStyle: "dashed" }, potentialSegments),
    ], { entries: 0 }, ["No occupiable route could start. Sequence is absent (scored 0) and the form is still ranked."]);
  }
  const { dist, prev } = shortestPaths(network, start.nodeIds);
  let farthest = -1;
  let farthestDist = -1;
  for (let id = 0; id < network.nodes.length; id += 1) {
    if (Number.isFinite(dist[id]) && dist[id] > farthestDist) {
      farthestDist = dist[id];
      farthest = id;
    }
  }
  const pathIds = farthest >= 0 ? pathTo(prev, farthest) : [];
  const path = pathIds.map((id) => network.nodes[id].position);
  // Ordered regions along the path.
  const events: Array<{ regionId: number; index: number }> = [];
  for (let index = 0; index < pathIds.length; index += 1) {
    const regionId = network.nodes[pathIds[index]].regionId;
    if (regionId < 0) continue;
    if (!events.length || events[events.length - 1].regionId !== regionId) events.push({ regionId, index });
  }
  const heading = (from: number, to: number): Vec3 | null => {
    const a = path[Math.max(0, Math.min(path.length - 1, from))];
    const b = path[Math.max(0, Math.min(path.length - 1, to))];
    if (!a || !b) return null;
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], 0];
    const len = Math.hypot(d[0], d[1]);
    return len > 1e-6 ? [d[0] / len, d[1] / len, 0] : null;
  };
  const transitions: Array<{ at: Vec3; vertical: boolean; changes: number; kinds: string[] }> = [];
  for (let index = 1; index < events.length; index += 1) {
    const before = network.regions[events[index - 1].regionId];
    const after = network.regions[events[index].regionId];
    const kinds: string[] = [];
    if (before.levelId !== after.levelId) kinds.push("elevation");
    const h0 = heading(events[index].index - 5, events[index].index - 1);
    const h1 = heading(events[index].index, events[index].index + 4);
    if (h0 && h1 && h0[0] * h1[0] + h0[1] * h1[1] < Math.cos(Math.PI / 4)) kinds.push("direction");
    const clearRatio = Math.max(before.meanClearance, after.meanClearance) / Math.max(0.1, Math.min(before.meanClearance, after.meanClearance));
    const areaRatio = Math.max(before.area, after.area) / Math.max(1, Math.min(before.area, after.area));
    if (clearRatio >= 1.5 || areaRatio >= 2) kinds.push("scale");
    if (before.floorClass !== after.floorClass) kinds.push("enclosure");
    transitions.push({ at: path[events[index].index], vertical: before.levelId !== after.levelId, changes: Math.min(3, kinds.length), kinds });
  }
  const n = events.length;
  const quality = transitions.length ? transitions.reduce((sum, item) => sum + item.changes / 3, 0) / transitions.length : 0;
  const visitedLevels = new Set(events.map((event) => network.regions[event.regionId].levelId));
  const levelCount = field.levels.length;
  const verticalVerified = transitions.filter((item) => item.vertical).length;
  const relevantPotential = potentialLinks.filter((link) => visitedLevels.has(link.lowerLevelId) || visitedLevels.has(link.upperLevelId)).length;
  const components = [
    component({
      name: "Sequence Length",
      intent: "Number of distinct floor regions entered along the longest verified route from the main entry.",
      formula: "n / (n + 3), n = regions in order",
      units: "regions",
      normalization: "saturating: 1 → 25, 3 → 50, 9 → 75",
      weight: 0.25,
      raw: n,
      precise: pct(n / (n + 3)),
      layerIds: ["sq-path", "sq-events"],
    }),
    component({
      name: "Transition Quality",
      intent: "Each region change should alter elevation, direction, scale, or enclosure.",
      formula: "mean over transitions of min(3, change types) / 3; 0 when there is no transition",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.35,
      raw: quality,
      precise: pct(quality),
      layerIds: ["sq-horizontal", "sq-vertical"],
    }),
    component({
      name: "Elevation Progression",
      intent: "The sequence climbs through the levels that exist.",
      formula: "(levels visited − 1) / (levels − 1), verified route only",
      units: "levels",
      normalization: "ratio × 100",
      weight: 0.15,
      raw: levelCount >= 2 ? Math.max(0, visitedLevels.size - 1) : 0,
      precise: levelCount >= 2 ? pct((visitedLevels.size - 1) / (levelCount - 1)) : 0,
      layerIds: ["sq-path", "sq-vertical"],
    }),
    component({
      name: "Verified Share",
      intent: "Vertical moves in the sequence are geometrically supported rather than assumed.",
      formula: "verified vertical transitions / (verified + potential links touching visited levels)",
      units: "share",
      normalization: "share × 100; unavailable when the sequence has no vertical move to verify",
      weight: 0.25,
      raw: verticalVerified + relevantPotential ? verticalVerified / (verticalVerified + relevantPotential) : 0,
      precise: verticalVerified + relevantPotential ? pct(verticalVerified / (verticalVerified + relevantPotential)) : 0,
      layerIds: ["sq-vertical", "sq-potential"],
    }),
  ];
  const layers: EvidenceLayer[] = [
    polylineLayer({ id: "sq-path", label: `Verified sequence route ${farthestDist > 0 ? farthestDist.toFixed(0) + " ft" : ""}`.trim(), color: PALETTE.cyan, status: "verified", components: ["Sequence Length"] }, path.length >= 2 ? [path] : []),
    arrowLayer({ id: "sq-direction", label: "Route direction", color: PALETTE.cyan, status: "verified", components: ["Sequence Length"] }, path.length >= 2 ? [{ a: path[Math.max(0, path.length - 4)], b: path[path.length - 1] }] : []),
    pointLayer({ id: "sq-events", label: `Sequence events: regions entered in order (${n})`, color: PALETTE.gold, status: "measured", components: ["Sequence Length"] }, events.map((event) => path[event.index]), events.map((_, index) => String(index + 1))),
    pointLayer({ id: "sq-horizontal", label: "Horizontal transition (measured)", color: PALETTE.paleAqua, status: "measured", components: ["Transition Quality"] }, transitions.filter((item) => !item.vertical).map((item) => item.at), transitions.filter((item) => !item.vertical).map((item) => item.kinds.join("/") || "none")),
    pointLayer({ id: "sq-vertical", label: "Vertical transition (verified)", color: PALETTE.lightBlue, status: "verified", components: ["Transition Quality", "Elevation Progression", "Verified Share"] }, transitions.filter((item) => item.vertical).map((item) => item.at), transitions.filter((item) => item.vertical).map((item) => item.kinds.join("/"))),
    segmentLayer({ id: "sq-potential", label: `Potential vertical connection, unverified (${potentialLinks.length})`, color: PALETTE.gray, status: "potential", components: ["Verified Share"], lineStyle: "dashed" }, potentialSegments),
  ];
  return finish("sequential", "Sequential", ctx, "verified-geometric", components, layers, {
    regionsInSequence: n,
    transitions: transitions.length,
    verticalTransitions: verticalVerified,
    potentialLinks: potentialLinks.length,
    routeLengthFt: farthestDist > 0 ? farthestDist : 0,
    levelsVisited: visitedLevels.size,
  }, []);
}

/* -------------------------------------------------------- Circulation Activated */
function circulationActivated(ctx: V4Context): V4DescriptorResult {
  const { network, field } = ctx;
  const nodes = network.nodes;
  if (!nodes.length) {
    return finish("circulationActivated", "Circulation Activated", ctx, "verified-geometric", [
      component({ name: "Network Continuity", intent: "The movement network holds together as one system.", formula: "largest-system nodes / nodes", units: "share", normalization: "share × 100", weight: 0.25, raw: 0, precise: 0, layerIds: ["ca-spine"] }),
      component({ name: "Region Reach", intent: "Occupiable regions the network actually serves.", formula: "regions in largest system / regions", units: "share", normalization: "share × 100", weight: 0.25, raw: 0, precise: 0, layerIds: ["ca-interfaces"] }),
      component({ name: "Interfaces", intent: "Entries, region-to-region joins, and verified level links.", formula: "i / (i + 4)", units: "count", normalization: "saturating", weight: 0.2, raw: 0, precise: 0, layerIds: ["ca-interfaces"] }),
      component({ name: "Junctions", intent: "Places where routes branch.", formula: "j / (j + 3)", units: "count", normalization: "saturating", weight: 0.15, raw: 0, precise: 0, layerIds: ["ca-junctions"] }),
      component({ name: "Level Distribution", intent: "Circulation reaches every level, not just one.", formula: "levels on spine / levels", units: "levels", normalization: "ratio × 100", weight: 0.15, raw: 0, precise: 0, layerIds: ["ca-spine"] }),
    ], [], { nodes: 0 }, ["No supported movement surface was found. Circulation is absent (scored 0) and the form is still ranked."]);
  }
  const largest = network.largestSystemId;
  const inLargest = nodes.filter((node) => node.systemId === largest);
  const regions = network.regions;
  const reached = regions.filter((region) => nodes[region.nodeIds[0]].systemId === largest);
  // Interface points: entries, region anchors, verified level links.
  const anchors: Array<{ nodeId: number; kind: string }> = [];
  const nearestNode = (point: Vec3, candidates: number[]) => candidates.reduce((best, id) => (distance(nodes[id].position, point) < distance(nodes[best].position, point) ? id : best), candidates[0]);
  for (const entry of network.entries) anchors.push({ nodeId: nearestNode(entry.centroid, entry.nodeIds), kind: "entry" });
  for (const region of [...regions].sort((left, right) => right.area - left.area).slice(0, 12)) anchors.push({ nodeId: nearestNode(region.centroid, region.nodeIds), kind: "region" });
  const verifiedLinks = network.levelLinks.filter((link) => link.status === "verified");
  for (const link of verifiedLinks) anchors.push({ nodeId: link.chainNodeIds[Math.floor(link.chainNodeIds.length / 2)], kind: "level-link" });
  // Spine: union of shortest paths between anchors in the same system.
  const spineEdges = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number) => {
    (spineEdges.get(a) ?? spineEdges.set(a, new Set()).get(a)!).add(b);
    (spineEdges.get(b) ?? spineEdges.set(b, new Set()).get(b)!).add(a);
  };
  const polylines: Vec3[][] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const { dist, prev } = shortestPaths(network, [anchors[index].nodeId]);
    for (let other = index + 1; other < anchors.length; other += 1) {
      if (!Number.isFinite(dist[anchors[other].nodeId])) continue;
      const path = pathTo(prev, anchors[other].nodeId);
      for (let step = 1; step < path.length; step += 1) addEdge(path[step - 1], path[step]);
      polylines.push(path.map((id) => nodes[id].position));
    }
  }
  const spineNodes = [...spineEdges.keys()].sort((left, right) => left - right);
  const anchorIds = new Set(anchors.map((anchor) => anchor.nodeId));
  const nearAnchor = (id: number) => [...anchorIds].some((anchorId) => distance(nodes[anchorId].position, nodes[id].position) <= 3);
  const junctionCandidates = spineNodes.filter((id) => (spineEdges.get(id)?.size ?? 0) >= 3);
  const junctions = clusterPoints(junctionCandidates.map((id) => nodes[id].position), 3);
  const deadEnds = spineNodes.filter((id) => (spineEdges.get(id)?.size ?? 0) === 1 && !nearAnchor(id)).map((id) => nodes[id].position);
  // Region interfaces: adjacent region pairs joined by an edge.
  const regionPairs = new Set<string>();
  for (const edge of network.edges) {
    const ra = nodes[edge.a].regionId;
    const rb = nodes[edge.b].regionId;
    if (ra < 0 || rb < 0 || ra === rb) continue;
    regionPairs.add(ra < rb ? `${ra}-${rb}` : `${rb}-${ra}`);
  }
  const interfaces = network.entries.length + regionPairs.size + verifiedLinks.length;
  const levelsWithSpine = new Set(spineNodes.map((id) => nodes[id].levelId));
  const components = [
    component({
      name: "Network Continuity",
      intent: "The movement network holds together as one system.",
      formula: "nodes in the largest connected system / all network nodes",
      units: "share",
      normalization: "share × 100",
      weight: 0.25,
      raw: inLargest.length / nodes.length,
      precise: pct(inLargest.length / nodes.length),
      layerIds: ["ca-network", "ca-spine", "ca-disconnected"],
    }),
    component({
      name: "Region Reach",
      intent: "Occupiable regions the network actually serves.",
      formula: "regions in the largest system / regions",
      units: "share",
      normalization: "share × 100",
      weight: 0.25,
      raw: regions.length ? reached.length / regions.length : 0,
      precise: regions.length ? pct(reached.length / regions.length) : 0,
      reason: regions.length ? undefined : "No occupiable region of 16 ft² or more.",
      layerIds: ["ca-interfaces"],
    }),
    component({
      name: "Interfaces",
      intent: "Entries, region-to-region joins, and verified level links where circulation activates space.",
      formula: "i = entries + adjacent region pairs + verified level links; i / (i + 4)",
      units: "count",
      normalization: "saturating: 4 → 50, 12 → 75",
      weight: 0.2,
      raw: interfaces,
      precise: pct(interfaces / (interfaces + 4)),
      layerIds: ["ca-interfaces"],
    }),
    component({
      name: "Junctions",
      intent: "Places where routes branch.",
      formula: "spine nodes with ≥ 3 spine neighbours, clustered within 3 ft; j / (j + 3)",
      units: "count",
      normalization: "saturating: 3 → 50",
      weight: 0.15,
      raw: junctions.length,
      precise: pct(junctions.length / (junctions.length + 3)),
      layerIds: ["ca-junctions"],
    }),
    component({
      name: "Level Distribution",
      intent: "Circulation reaches every level, not just one.",
      formula: "levels touched by the spine / levels",
      units: "levels",
      normalization: "ratio × 100",
      weight: 0.15,
      raw: field.levels.length >= 2 ? levelsWithSpine.size : 0,
      precise: field.levels.length >= 2 ? pct(levelsWithSpine.size / field.levels.length) : 0,
      reason: field.levels.length >= 2 ? undefined : "Single level; multi-level circulation distribution is absent.",
      layerIds: ["ca-spine"],
    }),
  ];
  const disconnected = nodes.filter((node) => node.systemId !== largest);
  const layers: EvidenceLayer[] = [
    patchLayer({ id: "ca-network", label: `Connected movement surface, largest system (${inLargest.length} of ${nodes.length} nodes, sampled)`, color: PALETTE.paleAqua, status: "measured", components: ["Network Continuity", "Region Reach"], opacity: 0.22 }, inLargest.map((node) => squarePatch(node.position, field.sampleFeet)), 2000),
    polylineLayer({ id: "ca-spine", label: `Verified movement spine (${spineNodes.length} nodes)`, color: PALETTE.cyan, status: "verified", components: ["Network Continuity", "Level Distribution"] }, polylines, 160),
    pointLayer({ id: "ca-interfaces", label: `Interfaces: entries, region joins, level links (${interfaces})`, color: PALETTE.gold, status: "measured", components: ["Interfaces", "Region Reach"] }, anchors.map((anchor) => nodes[anchor.nodeId].position), anchors.map((anchor) => anchor.kind)),
    pointLayer({ id: "ca-junctions", label: `Junctions (${junctions.length})`, color: PALETTE.lightBlue, status: "measured", components: ["Junctions"] }, junctions),
    pointLayer({ id: "ca-deadends", label: `Dead ends (${deadEnds.length})`, color: PALETTE.gray, status: "measured", components: [] }, deadEnds),
    patchLayer({ id: "ca-disconnected", label: `Disconnected floor (${disconnected.length} nodes, excluded)`, color: PALETTE.gray, status: "excluded", components: ["Network Continuity"], opacity: 0.3 }, disconnected.map((node) => squarePatch(node.position, field.sampleFeet)), 2000),
    pointLayer({ id: "ca-potential", label: `Potential upper-level connection interfaces (${network.potentialInterfaces.length}, not verified circulation)`, color: PALETTE.gray, status: "potential", components: [] }, network.potentialInterfaces.map((entry) => entry.centroid)),
  ];
  return finish("circulationActivated", "Circulation Activated", ctx, "verified-geometric", components, layers, {
    nodes: nodes.length,
    systems: network.systemCount,
    regions: regions.length,
    regionsReached: reached.length,
    interfaces,
    junctions: junctions.length,
    deadEnds: deadEnds.length,
  }, []);
}

function clusterPoints(points: Vec3[], radius: number): Vec3[] {
  const clusters: Vec3[] = [];
  for (const point of points) {
    if (clusters.some((existing) => distance(existing, point) <= radius)) continue;
    clusters.push(point);
  }
  return clusters;
}

/* ------------------------------------------------------------------ Centralized */
function centralized(ctx: V4Context): V4DescriptorResult {
  const { mesh, field, network } = ctx;
  const center = mesh.bounds.center;
  const planRef = Math.max(1, 0.25 * Math.max(mesh.bounds.size[0], mesh.bounds.size[1]));
  const mass = surfaceCentroid(mesh.triangles);
  const massOffset = mass ? Math.hypot(mass[0] - center[0], mass[1] - center[1]) : null;
  const radial = innerAreaShare(mesh.triangles, center, mesh.bounds.size, 0.5);
  const clearSamples = field.samples.filter((sample) => sample.floorClass === "sheltered" || sample.floorClass === "openVoid");
  const rx = Math.max(0.01, mesh.bounds.size[0] / 4);
  const ry = Math.max(0.01, mesh.bounds.size[1] / 4);
  const insideInner = (point: Vec3) => ((point[0] - center[0]) / rx) ** 2 + ((point[1] - center[1]) / ry) ** 2 <= 1;
  let innerVolume = 0;
  let totalVolume = 0;
  const innerClear: FloorSample[] = [];
  for (const sample of clearSamples) {
    const volume = sample.area * Math.min(VOLUME_CLEAR_CAP_FEET, sample.clearance ?? VOLUME_CLEAR_CAP_FEET);
    totalVolume += volume;
    if (insideInner(sample.position)) {
      innerVolume += volume;
      innerClear.push(sample);
    }
  }
  const nodeCentroid = network.nodes.length
    ? network.nodes.reduce((sum, node) => [sum[0] + node.position[0] / network.nodes.length, sum[1] + node.position[1] / network.nodes.length, 0] as Vec3, [0, 0, 0] as Vec3)
    : null;
  const nodeOffset = nodeCentroid ? Math.hypot(nodeCentroid[0] - center[0], nodeCentroid[1] - center[1]) : null;
  const components = [
    component({
      name: "Mass Centre Concentration",
      intent: "The surface mass sits at the centre of the form.",
      formula: "1 − plan distance(area-weighted surface centroid, bounding centre) / (0.25 × plan extent)",
      units: "ft",
      normalization: "offset 0 → 100, 0.25 × plan extent → 0",
      weight: 0.35,
      raw: massOffset,
      precise: massOffset === null ? null : pct(1 - massOffset / planRef),
      reason: massOffset === null ? "No surface area." : undefined,
      layerIds: ["ce-center"],
    }),
    component({
      name: "Radial Concentration",
      intent: "Surface gathered toward the middle rather than the edges.",
      formula: "(area share inside the half-radius ellipse − 0.25) / 0.75",
      units: "share",
      normalization: "uniform spread (0.25) → 0, all inside → 100",
      weight: 0.3,
      raw: radial.share,
      precise: pct((radial.share - 0.25) / 0.75),
      layerIds: ["ce-inner", "ce-guides"],
    }),
    component({
      name: "Inner Clearance Dominance",
      intent: "The usable clear volume is central.",
      formula: "(clear volume inside the half-radius ellipse / clear volume − 0.25) / 0.75",
      units: "share",
      normalization: "uniform → 0, all central → 100",
      weight: 0.2,
      raw: totalVolume ? innerVolume / totalVolume : null,
      precise: totalVolume ? pct((innerVolume / totalVolume - 0.25) / 0.75) : null,
      reason: totalVolume ? undefined : "No sheltered or open-void clearance.",
      layerIds: ["ce-inner-clear"],
    }),
    component({
      name: "Occupiable Centrality",
      intent: "Standing space itself is centred.",
      formula: "1 − plan distance(network node centroid, bounding centre) / (0.25 × plan extent)",
      units: "ft",
      normalization: "offset 0 → 100, 0.25 × plan extent → 0",
      weight: 0.15,
      raw: nodeOffset,
      precise: nodeOffset === null ? null : pct(1 - nodeOffset / planRef),
      reason: nodeOffset === null ? "No supported standing surface." : undefined,
      layerIds: ["ce-center"],
    }),
  ];
  const innerStep = Math.max(1, Math.ceil(radial.inner.length / 6000));
  const innerSampled = radial.inner.filter((_, index) => index % innerStep === 0);
  const guides: Segment[] = Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    return { a: [center[0], center[1], mesh.bounds.min[2] + 0.05], b: [center[0] + Math.cos(angle) * rx, center[1] + Math.sin(angle) * ry, mesh.bounds.min[2] + 0.05] };
  });
  const layers: EvidenceLayer[] = [
    {
      id: "ce-inner",
      label: `Surfaces inside the half-radius ellipse (${(radial.share * 100).toFixed(0)}% of area)`,
      color: PALETTE.gold,
      kind: "patch",
      status: "measured",
      components: ["Radial Concentration"],
      lineStyle: "solid",
      triangles: triangleArray(innerSampled, 0.02),
      shown: innerSampled.length,
      total: radial.inner.length,
      opacity: 0.4,
    },
    patchLayer({ id: "ce-inner-clear", label: "Central clear floor inside the ellipse (measured)", color: PALETTE.paleAqua, status: "measured", components: ["Inner Clearance Dominance"] }, samplePatches(innerClear, field.sampleFeet)),
    { ...segmentLayer({ id: "ce-center", label: mass ? `Measured mass centre, offset ${(massOffset ?? 0).toFixed(1)} ft from bounding centre` : "Measured mass centre", color: PALETTE.cyan, status: "measured", components: ["Mass Centre Concentration", "Occupiable Centrality"] }, mass ? [{ a: [center[0], center[1], mesh.bounds.min[2] + 0.05], b: [mass[0], mass[1], mesh.bounds.min[2] + 0.05] }] : []), points: mass ? [[mass[0], mass[1], mesh.bounds.min[2] + 0.05]] : [] },
    segmentLayer({ id: "ce-guides", label: "Half-radius ellipse guides from the bounding centre (reference)", color: PALETTE.gray, status: "reference", components: ["Radial Concentration"] }, guides),
  ];
  return finish("centralized", "Centralized", ctx, "architectural-proxy", components, layers, {
    massOffsetFt: massOffset,
    innerAreaShare: radial.share,
    innerClearShare: totalVolume ? innerVolume / totalVolume : null,
    nodeOffsetFt: nodeOffset,
  }, []);
}

/* --------------------------------------------------------- Vertically Integrated */
function verticallyIntegrated(ctx: V4Context): V4DescriptorResult {
  const { field, network, voids, crossLevel } = ctx;
  const levels = field.levels;
  if (levels.length < 2) {
    return finish("verticallyIntegrated", "Vertically Integrated", ctx, "verified-geometric", [
      component({ name: "Vertical Void Continuity", intent: "An interior void that runs through more than one level.", formula: "max void continuity", units: "ratio", normalization: "ratio × 100", weight: 0.3, raw: 0, precise: 0, layerIds: ["vi-void"] }),
      component({ name: "Vertical Visual Connectivity", intent: "Eye-height positions on one level see positions on another.", formula: "clear / tested cross-level rays", units: "share", normalization: "share × 100", weight: 0.25, raw: 0, precise: 0, layerIds: ["vi-sight"] }),
      component({ name: "Vertical Circulation", intent: "Consecutive levels joined by verified movement.", formula: "verified 1, potential 0.5, disconnected 0", units: "ratio", normalization: "ratio × 100", weight: 0.3, raw: 0, precise: 0, layerIds: ["vi-chain"] }),
      component({ name: "Integrated-Level Distribution", intent: "Floor area in a verified multi-level system.", formula: "connected level area / all level area", units: "share", normalization: "share × 100", weight: 0.15, raw: 0, precise: 0, layerIds: ["vi-levels"] }),
    ], [
      pointLayer({ id: "vi-potential", label: "Potential upper-level connection interfaces (not stairs)", color: PALETTE.gray, status: "potential", components: [] }, network.potentialInterfaces.map((entry) => entry.centroid)),
    ], { levels: levels.length, potentialInterfaces: network.potentialInterfaces.length }, ["One architectural level. Vertical integration is absent (scored 0). The form is still ranked. Upper perimeter openings, if any, are potential future connections, not verified circulation."]);
  }
  const links = network.levelLinks;
  const linkCredit = links.length ? links.reduce((sum, link) => sum + (link.status === "verified" ? 1 : link.status === "potential" ? 0.5 : 0), 0) / links.length : 0;
  // Levels joined by verified chains: the largest connected set of levels.
  const levelAdjacency = new Map<number, Set<number>>();
  for (const link of links) {
    if (link.status !== "verified") continue;
    (levelAdjacency.get(link.lowerLevelId) ?? levelAdjacency.set(link.lowerLevelId, new Set()).get(link.lowerLevelId)!).add(link.upperLevelId);
    (levelAdjacency.get(link.upperLevelId) ?? levelAdjacency.set(link.upperLevelId, new Set()).get(link.upperLevelId)!).add(link.lowerLevelId);
  }
  const seen = new Set<number>();
  let connectedLevels: number[] = [];
  for (const level of levels) {
    if (seen.has(level.id)) continue;
    const group: number[] = [];
    const stack = [level.id];
    seen.add(level.id);
    while (stack.length) {
      const current = stack.pop() as number;
      group.push(current);
      for (const next of levelAdjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (group.length > connectedLevels.length) connectedLevels = group;
  }
  const totalArea = levels.reduce((sum, level) => sum + level.area, 0);
  const connectedArea = connectedLevels.length >= 2 ? connectedLevels.reduce((sum, id) => sum + (levels.find((level) => level.id === id)?.area ?? 0), 0) : 0;
  const components = [
    component({
      name: "Vertical Void Continuity",
      intent: "An interior void that runs through more than one level.",
      formula: "max over interior voids of min(1, area / 64 ft²) × (levels spanned − 1) / (levels − 1)",
      units: "ratio",
      normalization: "ratio × 100; 0 when no interior void exists",
      weight: 0.3,
      raw: voids.continuity ?? 0,
      precise: pct(voids.continuity ?? 0),
      layerIds: ["vi-void"],
    }),
    component({
      name: "Vertical Visual Connectivity",
      intent: "Eye-height positions on one level see positions on another.",
      formula: "clear cross-level rays / tested cross-level rays",
      units: "share",
      normalization: "share × 100",
      weight: 0.25,
      raw: crossLevel.tested ? crossLevel.clear / crossLevel.tested : null,
      precise: crossLevel.tested ? pct(crossLevel.clear / crossLevel.tested) : null,
      reason: crossLevel.tested ? undefined : "No pair of viewing positions on different levels.",
      layerIds: ["vi-sight"],
    }),
    component({
      name: "Vertical Circulation",
      intent: "Consecutive levels are joined by geometrically verified movement.",
      formula: "mean over consecutive level pairs: verified chain 1, potential plan adjacency 0.5, disconnected 0",
      units: "ratio",
      normalization: "ratio × 100",
      weight: 0.3,
      raw: linkCredit,
      precise: pct(linkCredit),
      layerIds: ["vi-chain", "vi-potential"],
    }),
    component({
      name: "Integrated-Level Distribution",
      intent: "Floor area that belongs to a verified multi-level system.",
      formula: "area of levels in the largest verified-connected level set / all level area; 0 when no two levels are connected",
      units: "share",
      normalization: "share × 100",
      weight: 0.15,
      raw: totalArea ? connectedArea / totalArea : null,
      precise: totalArea ? pct(connectedArea / totalArea) : null,
      reason: totalArea ? undefined : "No level area.",
      layerIds: ["vi-levels"],
    }),
  ];
  const voidBoxes = voids.interior.map((component) => {
    const xs = component.columns.map((column) => column.x);
    const ys = component.columns.map((column) => column.y);
    const half = field.sampleFeet / 2;
    const top = component.topZ ?? field.levels.reduce((high, level) => Math.max(high, level.elevation), component.bottomZ) + 8;
    return boxPatch([Math.min(...xs) - half, Math.min(...ys) - half, component.bottomZ + 0.05], [Math.max(...xs) + half, Math.max(...ys) + half, top]);
  });
  const chains = links.filter((link) => link.status === "verified").map((link) => link.chainNodeIds.map((id) => network.nodes[id].position));
  const potential: Segment[] = links.filter((link) => link.status === "potential").map((link) => {
    const lower = levels.find((level) => level.id === link.lowerLevelId)!;
    const upper = levels.find((level) => level.id === link.upperLevelId)!;
    const anchor = link.anchor ?? lower.centroid;
    return { a: [anchor[0], anchor[1], lower.elevation], b: [anchor[0], anchor[1], upper.elevation] };
  });
  const clearRays = crossLevel.rays.filter((ray) => ray.clear);
  const connectedSamples = connectedLevels.length >= 2 ? connectedLevels.flatMap((id) => (levels.find((level) => level.id === id)?.sampleIds ?? []).map((sampleId) => field.samples[sampleId])) : [];
  const layers: EvidenceLayer[] = [
    { ...patchLayer({ id: "vi-void", label: `Interior vertical void extents (${voids.interior.length}, measured)`, color: PALETTE.paleAqua, status: "measured", components: ["Vertical Void Continuity"], opacity: 0.18 }, voidBoxes, 40), kind: "volume" },
    segmentLayer({ id: "vi-sight", label: `Clear cross-level sightlines (${crossLevel.clear} of ${crossLevel.tested})`, color: PALETTE.lightBlue, status: "measured", components: ["Vertical Visual Connectivity"] }, clearRays.map((ray) => ({ a: ray.a, b: ray.b })), 800),
    polylineLayer({ id: "vi-chain", label: `Verified inter-level circulation chain (${chains.length})`, color: PALETTE.cyan, status: "verified", components: ["Vertical Circulation"] }, chains),
    patchLayer({ id: "vi-levels", label: `Levels joined by verified circulation (${connectedLevels.length >= 2 ? connectedLevels.length : 0} of ${levels.length})`, color: PALETTE.gold, status: "verified", components: ["Integrated-Level Distribution"], opacity: 0.3 }, samplePatches(connectedSamples, field.sampleFeet)),
    segmentLayer({ id: "vi-potential", label: `Potential level link, unverified (${potential.length})`, color: PALETTE.gray, status: "potential", components: ["Vertical Circulation"], lineStyle: "dashed" }, potential),
  ];
  return finish("verticallyIntegrated", "Vertically Integrated", ctx, "verified-geometric", components, layers, {
    levels: levels.length,
    interiorVoids: voids.interior.length,
    voidContinuity: voids.continuity,
    crossLevelRaysTested: crossLevel.tested,
    crossLevelRaysClear: crossLevel.clear,
    verifiedLinks: links.filter((link) => link.status === "verified").length,
    potentialLinks: links.filter((link) => link.status === "potential").length,
    disconnectedLinks: links.filter((link) => link.status === "disconnected").length,
  }, []);
}

/* --------------------------------------------------------------------- Luminous */
function luminous(ctx: V4Context): V4DescriptorResult {
  const { light, field } = ctx;
  const probes = light.probes;
  if (!probes.length) {
    return finish("luminous", "Luminous", ctx, "potential-relationship", [
      component({ name: "Overhead Light Exposure", intent: "Potential daylight from above through open roofs, skylights, or voids.", formula: "mean over interior probes of escaped upper-hemisphere rays / 9", units: "share", normalization: "share × 100", weight: 0.35, raw: 0, precise: 0, layerIds: ["lu-overhead"] }),
      component({ name: "Lateral Light Exposure", intent: "Potential daylight through side openings.", formula: "mean over interior probes of escaped horizontal rays / 8", units: "share", normalization: "share × 100", weight: 0.35, raw: 0, precise: 0, layerIds: ["lu-lateral"] }),
      component({ name: "Lit Region Share", intent: "How much of the interior has any potential light path.", formula: "interior probes with ≥ 1 escaped ray / interior probes", units: "share", normalization: "share × 100", weight: 0.3, raw: 0, precise: 0, layerIds: ["lu-lit"] }),
    ], [
      patchLayer({ id: "lu-dark", label: "No interior standing position; exterior exposure is not interior light", color: PALETTE.gray, status: "excluded", components: ["Lit Region Share"] }, samplePatches(field.samples.filter((sample) => sample.floorClass === "exposed"), field.sampleFeet * 3)),
    ], { probes: 0, excludedExposed: light.excludedExposed }, ["No interior standing position exists to receive light. Exterior roof exposure is not counted as interior light. Luminous is absent (scored 0) and the form is still ranked."]);
  }
  const components = [
    component({
      name: "Overhead Light Exposure",
      intent: "Potential daylight from above through open roofs, skylights, or voids.",
      formula: "mean over interior probes of escaped upper-hemisphere rays / 9 (zenith + 8 at 45°)",
      units: "share",
      normalization: "share × 100",
      weight: 0.35,
      raw: light.overheadMean,
      precise: light.overheadMean === null ? null : pct(light.overheadMean),
      layerIds: ["lu-overhead"],
    }),
    component({
      name: "Lateral Light Exposure",
      intent: "Potential daylight through side openings.",
      formula: "mean over interior probes of escaped horizontal rays / 8",
      units: "share",
      normalization: "share × 100",
      weight: 0.35,
      raw: light.lateralMean,
      precise: light.lateralMean === null ? null : pct(light.lateralMean),
      layerIds: ["lu-lateral"],
    }),
    component({
      name: "Lit Region Share",
      intent: "How much of the interior has any potential light path.",
      formula: "interior probes with ≥ 1 escaped ray / interior probes",
      units: "share",
      normalization: "share × 100",
      weight: 0.3,
      raw: light.litShare,
      precise: light.litShare === null ? null : pct(light.litShare),
      layerIds: ["lu-lit"],
    }),
  ];
  const overhead: Segment[] = [];
  const lateral: Segment[] = [];
  const blocked: Segment[] = [];
  const lit: FloorSample[] = [];
  const dark: FloorSample[] = [];
  for (const probe of probes) {
    for (const ray of probe.escapedRays) (ray.kind === "overhead" ? overhead : lateral).push({ a: ray.b, b: ray.a });
    for (const ray of probe.blockedRays) blocked.push({ a: ray.a, b: ray.b });
    const sample = field.samples[probe.sampleId];
    if (sample) (probe.overhead > 0 || probe.lateral > 0 ? lit : dark).push(sample);
  }
  const layers: EvidenceLayer[] = [
    arrowLayer({ id: "lu-overhead", label: `Overhead light paths reaching the probe (${overhead.length}, sampled)`, color: PALETTE.gold, status: "measured", components: ["Overhead Light Exposure"] }, overhead, 300),
    arrowLayer({ id: "lu-lateral", label: `Lateral light paths reaching the probe (${lateral.length}, sampled)`, color: PALETTE.cyan, status: "measured", components: ["Lateral Light Exposure"] }, lateral, 300),
    patchLayer({ id: "lu-lit", label: `Interior floor with a potential light path (${lit.length} probes)`, color: PALETTE.paleAqua, status: "measured", components: ["Lit Region Share"] }, samplePatches(lit, field.sampleFeet * 3)),
    patchLayer({ id: "lu-dark", label: `Interior floor with no light path (${dark.length} probes)`, color: PALETTE.gray, status: "measured", components: ["Lit Region Share"] }, samplePatches(dark, field.sampleFeet * 3)),
    segmentLayer({ id: "lu-blocked", label: `Blocked light rays (${blocked.length}, sampled)`, color: PALETTE.gray, status: "excluded", components: ["Overhead Light Exposure", "Lateral Light Exposure"], lineStyle: "dashed" }, blocked, 300),
  ];
  return finish("luminous", "Luminous", ctx, "potential-relationship", components, layers, {
    probes: probes.length,
    excludedExposedProbes: light.excludedExposed,
    overheadMean: light.overheadMean,
    lateralMean: light.lateralMean,
    litShare: light.litShare,
    lateralDepthMeanFt: light.lateralDepthMean,
  }, [`Potential natural-light penetration from geometry only. No glazing is inferred and no illuminance is claimed. Mean lateral depth to first obstruction ${light.lateralDepthMean === null ? "n/a" : light.lateralDepthMean.toFixed(1) + " ft"}.`]);
}

export const V4_EVALUATORS: Array<(ctx: V4Context) => V4DescriptorResult> = [
  openVolume,
  convergent,
  sculptural,
  visuallyConnected,
  surreal,
  monumental,
  hierarchical,
  sequential,
  circulationActivated,
  centralized,
  verticallyIntegrated,
  luminous,
];

const DESCRIPTOR_NAMES: Array<[string, string]> = [
  ["openVolume", "Open Volume"],
  ["convergent", "Convergent"],
  ["sculptural", "Sculptural"],
  ["visuallyConnected", "Visually Connected"],
  ["surreal", "Surreal"],
  ["monumental", "Monumental"],
  ["hierarchical", "Hierarchical"],
  ["sequential", "Sequential"],
  ["circulationActivated", "Circulation Activated"],
  ["centralized", "Centralized"],
  ["verticallyIntegrated", "Vertically Integrated"],
  ["luminous", "Luminous"],
];

export function evaluateV4(source: DescriptorSource, sourceId: string, options: V4Options = {}): V4Evaluation {
  const ctx = buildV4Context(source, sourceId, options);
  const descriptors = ctx.mesh.triangles.length
    ? V4_EVALUATORS.map((evaluate) => evaluate(ctx))
    : DESCRIPTOR_NAMES.map(([id, name]) => finish(
      id,
      name,
      ctx,
      "insufficient-evidence",
      [],
      [],
      { triangles: 0 },
      [],
      "The mesh contains no triangles. This is a geometry-processing failure, not a measured zero.",
    ));
  return {
    version: DESCRIPTOR_ALGORITHM_VERSION,
    sourceId,
    sourceHash: ctx.mesh.sourceHash,
    descriptors,
    summary: {
      triangles: ctx.mesh.triangles.length,
      surfaceArea: ctx.mesh.area,
      floorSamples: ctx.field.samples.length,
      levels: ctx.field.levels.length,
      networkNodes: ctx.network.nodes.length,
      regions: ctx.network.regions.length,
      entries: ctx.network.entries.length,
      potentialInterfaces: ctx.network.potentialInterfaces.length,
      bounds: { size: ctx.mesh.bounds.size, min: ctx.mesh.bounds.min, max: ctx.mesh.bounds.max },
    },
  };
}
