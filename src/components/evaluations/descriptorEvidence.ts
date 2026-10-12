import type { Vec3 } from "./geometryView";

export type EvidenceClass = "verified-geometric" | "documented-qualitative" | "unverified-interpretation" | "unavailable";

export type EvidenceFeature = {
  kind: "voxel";
  cells: Array<[number, number, number]>;
  /** Spec feet, cell center. */
  centers: Vec3[];
  cellFeet: number;
  label: string;
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
      cells,
      centers: cells.map((cell) => cellCenter(input.anchor as Vec3, cell, input.cellFeet as number)),
      cellFeet: input.cellFeet as number,
      label: located.label,
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
