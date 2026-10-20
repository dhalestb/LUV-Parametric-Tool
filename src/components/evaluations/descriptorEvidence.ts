import type { Vec3 } from "./geometryView";

export type EvidenceClass = "verified-geometric" | "documented-qualitative" | "unverified-interpretation" | "unavailable";

export type EvidenceTransform = {
  /** Coordinates stored on the evidence record, before the viewer transform. */
  space: "spec-feet";
  /** How a viewer may place these coordinates on the imported OBJ. Applied once. */
  viewer: "specFeetToFile-then-tileRootMatrix";
};

/**
 * Located evidence the viewer can draw.
 * Only fields supplied by an evaluator are filled. Empty arrays are not implied geometry.
 */
export type EvidenceFeature = {
  kind: "voxel" | "point" | "line" | "region" | "direction" | "relation";
  /** Source metric name. Drawing this feature must not recompute that metric. */
  metric?: string;
  cells: Array<[number, number, number]>;
  /** Spec feet. Cell centers, point positions, or representative samples. */
  centers: Vec3[];
  cellFeet: number;
  label: string;
  coordinates?: "spec-feet";
  transform?: EvidenceTransform;
  /** Line, direction, or relationship endpoints in spec feet. */
  segments?: Array<{ a: Vec3; b: Vec3 }>;
  /** Region loops in spec feet. These are not merged into rooms. */
  loops?: Vec3[][];
};

export type EvidenceRecord = {
  id: string;
  descriptorId: string;
  descriptorName: string;
  formId: string;
  meshId: string;
  filename: string;
  score: number;
  absoluteScore: number;
  evaluationRecordId: string;
  geometryRevision: string;
  evidenceClass: EvidenceClass;
  features: EvidenceFeature[];
  sectionPlaneNote: string;
  explanation: string;
  overlayAvailable: boolean;
};

export type EvidenceComponent = {
  name: string;
  value: number;
  raw?: number;
  rawUnit?: string;
};

const LOCATED: Record<string, { label: string; text: string }> = {
  openVolume: {
    label: "Open-volume cells",
    text: "Gold marks unoccupied cells inside the occupied bounds. Those are the cells counted by Architectural Open Space. Cells that also pass the interstitial test are the ones counted by Interstitial Space. Permeability and low mass stay numeric; they are not drawn as regions.",
  },
};

export function geometryContentRevision(positions: ArrayLike<number>, meshId: string) {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value | 0;
    hash = Math.imul(hash, 16777619);
  };
  mix(positions.length);
  mix(meshId.length);
  for (let index = 0; index < meshId.length; index += 1) mix(meshId.charCodeAt(index));
  const step = Math.max(1, Math.floor(positions.length / 64));
  for (let index = 0; index < positions.length; index += step) mix(Math.round((positions[index] ?? 0) * 1000));
  mix(Math.round((positions[positions.length - 3] ?? 0) * 1000));
  mix(Math.round((positions[positions.length - 1] ?? 0) * 1000));
  return `geom:${hash >>> 0}`;
}

export function cellCenter(anchor: Vec3, cell: [number, number, number], cellFeet: number): Vec3 {
  return [
    anchor[0] + (cell[0] + 0.5) * cellFeet,
    anchor[1] + (cell[1] + 0.5) * cellFeet,
    anchor[2] + (cell[2] + 0.5) * cellFeet,
  ];
}

function componentText(components: EvidenceComponent[]) {
  if (!components.length) return "This evaluation did not store component measurements.";
  return components
    .map((component) => {
      const raw = component.raw === undefined ? "" : ` raw ${component.raw} ${component.rawUnit ?? ""}`.trimEnd();
      return `${component.name} ${component.value}${raw}`;
    })
    .join(". ");
}

/**
 * Evidence for one form and one descriptor.
 * Located geometry is attached only for measurements that already name cells.
 * Other descriptors keep their real scores and an explicit unavailable overlay.
 */
export function buildDescriptorEvidence(input: {
  descriptorId: string;
  descriptorName: string;
  formId: string;
  meshId: string;
  filename: string;
  score: number;
  absoluteScore: number;
  evaluationRecordId: string;
  geometryRevision: string;
  components: EvidenceComponent[];
  anchor: Vec3 | null;
  cellFeet: number | null;
  locatedCells?: Array<[number, number, number]>;
}): EvidenceRecord {
  const located = LOCATED[input.descriptorId];
  const cells = input.locatedCells ?? [];
  const canDraw = Boolean(located && input.anchor && input.cellFeet && cells.length);
  const features: EvidenceFeature[] = canDraw
    ? [{
      kind: "voxel",
      metric: input.descriptorName,
      cells,
      centers: cells.map((cell) => cellCenter(input.anchor as Vec3, cell, input.cellFeet as number)),
      cellFeet: input.cellFeet as number,
      label: located.label,
      coordinates: "spec-feet",
      transform: { space: "spec-feet", viewer: "specFeetToFile-then-tileRootMatrix" },
    }]
    : [];
  const measured = componentText(input.components);
  const explanation = located
    ? (canDraw ? `${located.text} ${measured}` : `${located.text} No located cells were returned for this form, so the overlay is unavailable. ${measured}`)
    : `Overlay unavailable. ${input.descriptorName} is stored as measurements without a located region, so nothing is highlighted. ${measured}`;
  return {
    id: `${input.descriptorId}:${input.formId}:${input.geometryRevision}`,
    descriptorId: input.descriptorId,
    descriptorName: input.descriptorName,
    formId: input.formId,
    meshId: input.meshId,
    filename: input.filename,
    score: input.score,
    absoluteScore: input.absoluteScore,
    evaluationRecordId: input.evaluationRecordId,
    geometryRevision: input.geometryRevision,
    evidenceClass: canDraw ? "verified-geometric" : "documented-qualitative",
    features,
    sectionPlaneNote: "The default cut is the geometric mid-span facing Y. It is not claimed to be the most revealing cut for this descriptor.",
    explanation,
    overlayAvailable: canDraw,
  };
}

/** Drop evidence when the form or the geometry it was measured on is no longer current. */
export function resolveEvidence(record: EvidenceRecord, formId: string, geometryRevision: string): EvidenceRecord {
  if (record.formId === formId && record.geometryRevision === geometryRevision) return record;
  return {
    ...record,
    id: `${record.descriptorId}:${formId}:${geometryRevision}:stale`,
    formId,
    geometryRevision,
    evidenceClass: "unavailable",
    features: [],
    overlayAvailable: false,
    explanation: "Overlay unavailable. This evidence belonged to a different form or an older geometry revision, so it was not applied.",
  };
}

export type SpatialEvidenceCategory = {
  id: string;
  metric: string;
  label: string;
  kind: EvidenceFeature["kind"] | "none";
  available: boolean;
  /** Evaluator cell indices. Empty when this metric has no located geometry. */
  cells: Array<[number, number, number]>;
  /** Per-cell drawing color. Empty means the viewer uses its category default. */
  swatches: Array<{ cell: [number, number, number]; color: string }>;
  /** Axis-pass samples in cell indices. Empty when this metric is not permeability. */
  rays: Array<{
    origin: [number, number, number];
    end: [number, number, number];
    direction: [number, number, number];
    passed: boolean;
    color: string;
  }>;
  legend: string;
  source: string;
  transform: EvidenceTransform;
  /** True when the drawing is diagnostic and is not a weighted score term. */
  diagnostic: boolean;
};

const SPEC_TRANSFORM: EvidenceTransform = {
  space: "spec-feet",
  viewer: "specFeetToFile-then-tileRootMatrix",
};

/**
 * Categories the comparison can draw for one descriptor.
 * Open Volume categories are the occupied, free, and interstitial rasters already
 * produced for the score. Other descriptors stay aggregate: their cells are ignored.
 */
const EMPTY_MARKS = {
  swatches: [] as SpatialEvidenceCategory["swatches"],
  rays: [] as SpatialEvidenceCategory["rays"],
  diagnostic: false,
};

export function spatialCategoriesForDescriptor(input: {
  descriptorId: string;
  descriptorName: string;
  occupied?: Array<[number, number, number]>;
  free?: Array<[number, number, number]>;
  interstitial?: Array<[number, number, number]>;
  permeabilityRays?: Array<{ origin: [number, number, number]; end: [number, number, number]; direction: [number, number, number]; passed: boolean }>;
  solidity?: Array<{ cell: [number, number, number]; solidity: number }>;
  voidComponents?: Array<{ cells: Array<[number, number, number]>; exterior: boolean }>;
  enclosed?: Array<[number, number, number]>;
  figure?: {
    legend: string;
    swatches: Array<{ cell: [number, number, number]; color: string }>;
    rays: SpatialEvidenceCategory["rays"];
  };
}): SpatialEvidenceCategory[] {
  if (input.descriptorId !== "openVolume") {
    const figure = input.figure;
    return [{
      id: "aggregate",
      metric: input.descriptorName,
      label: input.descriptorName,
      kind: figure?.rays.length ? "direction" : figure?.swatches.length ? "voxel" : "none",
      available: true,
      cells: figure?.swatches.map((mark) => mark.cell) ?? [],
      swatches: figure?.swatches ?? [],
      rays: figure?.rays ?? [],
      diagnostic: false,
      legend: figure?.legend
        ?? `The rating is this form’s rank in the source registry. ${input.descriptorName} did not return located marks for this form, so the view shows the form.`,
      source: "The same occupied cells and walkable links the descriptor scores. The drawing does not change the rank.",
      transform: SPEC_TRANSFORM,
    }];
  }
  const occupied = input.occupied ?? [];
  const free = input.free ?? [];
  const interstitial = input.interstitial ?? [];
  const rays = input.permeabilityRays ?? [];
  const solidity = input.solidity ?? [];
  const meanSolidity = solidity.length
    ? solidity.reduce((sum, sample) => sum + sample.solidity, 0) / solidity.length
    : 1;
  const voids = input.voidComponents ?? [];
  const enclosed = input.enclosed ?? [];
  const largestExterior = voids.find((component) => component.exterior) ?? null;
  const voidSwatches = voids.flatMap((component) => {
    const color = component === largestExterior ? "#8E7CC3" : component.exterior ? "#4C6B8A" : "#A67C52";
    return component.cells.map((cell) => ({ cell, color }));
  });
  const overallAvailable = free.length > 0 || interstitial.length > 0 || rays.length > 0 || solidity.length > 0;
  return [
    {
      id: "overall",
      metric: "Overall Open Volume",
      label: "Overall Open Volume",
      kind: "none" as const,
      available: overallAvailable,
      cells: [],
      swatches: [],
      rays: [],
      diagnostic: false,
      legend: "Overall Open Volume keeps the shaded mesh and shows the measured clearance. The rating is the form’s rank in the source registry. The focused drawing is that measurement, not a combined lattice.",
      source: "Weighted contributions from the saved components. The focused layer uses that term's existing cells or rays.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "interstitial",
      metric: "Interstitial Space",
      label: "Interstitial Space",
      kind: "voxel" as const,
      available: interstitial.length > 0,
      cells: interstitial,
      swatches: interstitial.map((cell) => ({ cell, color: "#D6AD4F" })),
      rays: [],
      diagnostic: false,
      legend: "Gold marks interstitial raster cells inside the occupied bounds. The score uses this count divided by the occupied-bounds volume, not the raw count. A denser-looking field can still be a lower ratio. These cells are not confirmed accessible space.",
      source: "openVolumeRegions interstitial list from the occupied raster already measured for this form.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "architectural-open",
      metric: "Architectural Open Space",
      label: "Architectural Open Space",
      kind: "voxel" as const,
      available: free.length > 0,
      cells: free,
      swatches: free.map((cell) => ({ cell, color: "#D6AD4F" })),
      rays: [],
      diagnostic: false,
      legend: "Gold fills the measured clearance above each upper surface when that clearance is above 5 ft. That measurement orders the source registry. The rating is the form’s rank, from 1 for the least open volume to the last form for the most. Clearance at or below 5 ft adds nothing, then credit rises to fully open at 10 ft. A short band is exterior-open and counts as fully open. Cyan outlines the supporting surface where the clearance counts. This is not a circulation path.",
      source: "openVolumeRegions free list from the same occupied raster.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "occupied",
      metric: "Occupied raster",
      label: "Occupied cells",
      kind: "voxel" as const,
      available: occupied.length > 0,
      cells: occupied,
      swatches: occupied.map((cell) => ({ cell, color: "#C8C4BC" })),
      rays: [],
      diagnostic: false,
      legend: "Pale cells mark the occupied raster the evaluator treated as solid. This is the mass the openness ratios are measured against. It is not interstitial space.",
      source: "Occupied cell list passed to the Open Volume evaluator.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "permeability",
      metric: "Permeability",
      label: "Permeability",
      kind: rays.length ? "direction" as const : "none" as const,
      available: rays.length > 0,
      cells: [],
      swatches: [],
      rays: rays.map((ray) => ({
        origin: ray.origin,
        end: ray.end,
        direction: ray.direction,
        passed: ray.passed,
        color: ray.passed ? "#71BEDA" : "#B9BEC6",
      })),
      diagnostic: false,
      legend: rays.length
        ? "Solid blue lines are measured rays that crossed the envelope without entering an occupied cell. Dashed gray lines stopped at the first occupied cell, marked in gold. The drawing uses the evaluator's column tests. A clear column is not pedestrian access."
        : "Spatial evidence unavailable. Permeability is the mean of six axis pass rates. The evaluator did not return the ray list for this term.",
      source: rays.length ? "directionPassRate samples from the same envelope used by the permeability term." : "Aggregate component only.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "low-mass",
      metric: "Low Mass",
      label: "Low Mass",
      kind: solidity.length ? "voxel" as const : "none" as const,
      available: solidity.length > 0,
      cells: solidity.map((sample) => sample.cell),
      swatches: solidity.map((sample) => ({
        cell: sample.cell,
        color: sample.solidity < meanSolidity ? "#D6AD4F" : "#6E7C87",
      })),
      rays: [],
      diagnostic: false,
      legend: solidity.length
        ? "Gold marks occupied raster cells below the mean 26-neighbor solidity. Slate marks the rest of the display slab. These are evaluator cells, not the imported surface and not physical material density. Low Mass is 1 minus the mean solidity."
        : "Spatial evidence unavailable. Low Mass is mean 26-neighbor solidity. The evaluator did not return located cells for this term.",
      source: solidity.length ? "Per-cell 26-neighbor solidity from the occupied raster. The mean is the Low Mass input." : "Aggregate component only.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "enclosed-void",
      metric: "Enclosed Void",
      label: "Enclosed void",
      kind: enclosed.length ? "voxel" as const : "none" as const,
      available: enclosed.length > 0,
      cells: enclosed,
      swatches: enclosed.map((cell) => ({ cell, color: "#A67C52" })),
      rays: [],
      diagnostic: true,
      legend: enclosed.length
        ? "Brown marks free cells the exterior flood did not reach. Enclosed Void is reported and is not part of the weighted score. It is not confirmed inaccessible to a person."
        : "Spatial evidence unavailable. Enclosed Void is an aggregate ratio. The evaluator does not export the enclosed cell list, so no overlay is drawn.",
      source: enclosed.length ? "Free cells inside the occupied bounds that are absent from the exterior flood." : "Aggregate component only.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "connected-void",
      metric: "Connected void diagnostic",
      label: "Connected void",
      kind: voidSwatches.length ? "voxel" as const : "none" as const,
      available: voidSwatches.length > 0,
      cells: voidSwatches.map((mark) => mark.cell),
      swatches: voidSwatches,
      rays: [],
      diagnostic: true,
      legend: voidSwatches.length
        ? "Purple is the largest exterior-connected free component. Blue is other exterior-connected free space. Brown is enclosed. This diagnostic is not added to the Open Volume score and is not verified pedestrian access."
        : "Spatial evidence unavailable. Connected-void components were not supplied.",
      source: "6-connected components of the free cells already counted for Architectural Open Space.",
      transform: SPEC_TRANSFORM,
    },
  ];
}
