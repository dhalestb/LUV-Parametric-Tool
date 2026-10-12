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
  legend: string;
  source: string;
  transform: EvidenceTransform;
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
export function spatialCategoriesForDescriptor(input: {
  descriptorId: string;
  descriptorName: string;
  occupied?: Array<[number, number, number]>;
  free?: Array<[number, number, number]>;
  interstitial?: Array<[number, number, number]>;
}): SpatialEvidenceCategory[] {
  if (input.descriptorId !== "openVolume") {
    return [{
      id: "aggregate",
      metric: input.descriptorName,
      label: "Spatial evidence unavailable",
      kind: "none",
      available: false,
      cells: [],
      legend: `Spatial evidence unavailable. ${input.descriptorName} is stored as aggregate measurements, so no points, cells, lines, or regions are drawn.`,
      source: "Descriptor components only. Open Volume cells are not reused.",
      transform: SPEC_TRANSFORM,
    }];
  }
  const occupied = input.occupied ?? [];
  const free = input.free ?? [];
  const interstitial = input.interstitial ?? [];
  return [
    {
      id: "interstitial",
      metric: "Interstitial Space",
      label: "Interstitial cells",
      kind: "voxel",
      available: interstitial.length > 0,
      cells: interstitial,
      legend: "Gold marks interstitial raster cells inside the occupied bounds. These are the cells counted by Interstitial Space. They are not confirmed accessible space.",
      source: "openVolumeRegions interstitial list from the occupied raster already measured for this form.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "architectural-open",
      metric: "Architectural Open Space",
      label: "Free cells",
      kind: "voxel",
      available: free.length > 0,
      cells: free,
      legend: "Gold marks every unoccupied cell inside the occupied bounds. These are the cells counted by Architectural Open Space. This set is larger than the interstitial term. They are not confirmed accessible space.",
      source: "openVolumeRegions free list from the same occupied raster.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "occupied",
      metric: "Occupied raster",
      label: "Occupied cells",
      kind: "voxel",
      available: occupied.length > 0,
      cells: occupied,
      legend: "Gold marks the occupied raster cells the evaluator treated as solid. These are not interstitial space and are not confirmed accessible space.",
      source: "Occupied cell list passed to the Open Volume evaluator.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "permeability",
      metric: "Permeability",
      label: "Permeability",
      kind: "none",
      available: false,
      cells: [],
      legend: "Spatial evidence unavailable. Permeability is the mean of six axis pass rates. The evaluator did not return located cells for this term.",
      source: "Aggregate component only.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "low-mass",
      metric: "Low Mass",
      label: "Low Mass",
      kind: "none",
      available: false,
      cells: [],
      legend: "Spatial evidence unavailable. Low Mass is mean 26-neighbor solidity. The evaluator did not return located cells for this term.",
      source: "Aggregate component only.",
      transform: SPEC_TRANSFORM,
    },
    {
      id: "enclosed-void",
      metric: "Enclosed Void",
      label: "Enclosed void",
      kind: "none",
      available: false,
      cells: [],
      legend: "Spatial evidence unavailable. Enclosed Void is an aggregate ratio. The evaluator does not export the enclosed cell list, so no overlay is drawn.",
      source: "Aggregate component only.",
      transform: SPEC_TRANSFORM,
    },
  ];
}
