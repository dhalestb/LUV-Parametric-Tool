/**
 * v4 shared evidence model. The evaluator records what it measured in these
 * layers and the viewer draws exactly these layers. Display transforms never
 * feed back into scores.
 */
import type { Vec3 } from "./geometry";

/** The ten approved colours. Nothing else may be drawn. */
export const PALETTE = {
  paper: "#F7F6F5",
  gray: "#B9BEC6",
  paleAqua: "#9BD5E4",
  lightBlue: "#71BEDA",
  midBlue: "#43A9CF",
  cyan: "#1293C2",
  deepBlue: "#0E6F92",
  deeperBlue: "#095775",
  ink: "#073C52",
  gold: "#D6AD4F",
} as const;

export type PaletteColor = (typeof PALETTE)[keyof typeof PALETTE];
export const PALETTE_VALUES: readonly string[] = Object.values(PALETTE);

export type LayerStatus = "measured" | "potential" | "verified" | "excluded" | "reference";
export type LayerKind = "patch" | "polyline" | "segment" | "point" | "arrow" | "volume";

export type Segment = { a: Vec3; b: Vec3 };

export type EvidenceLayer = {
  id: string;
  /** Legend text. Already states measured / potential / verified where it matters. */
  label: string;
  color: PaletteColor;
  kind: LayerKind;
  status: LayerStatus;
  /** Component names this layer supports. Empty when it is context only. */
  components: string[];
  lineStyle: "solid" | "dashed";
  /** Translucent patches: 9 floats per triangle in spec feet. */
  triangles?: Float32Array;
  /** Thin lines in spec feet. */
  segments?: Segment[];
  /** Polylines (each an ordered point list) in spec feet. */
  polylines?: Vec3[][];
  /** Arrow heads at b, shafts from a. */
  arrows?: Segment[];
  points?: Vec3[];
  /** Point labels (numbers for sequence events). Parallel to points when present. */
  pointLabels?: string[];
  /** Items drawn vs items measured. Equal unless visual sampling was applied. */
  shown: number;
  total: number;
  /** Optional dimension text attached to a segment midpoint. */
  dimensions?: Array<{ a: Vec3; b: Vec3; text: string }>;
  /** Opacity hint for patches. */
  opacity?: number;
};

export type ComponentEvidence = {
  name: string;
  intent: string;
  formula: string;
  units: string;
  normalization: string;
  weight: number;
  /** Raw measurement in `units`; null when unavailable. */
  raw: number | null;
  /** 0–100; null when unavailable. */
  precise: number | null;
  status: "measured" | "unavailable";
  reason?: string;
  /** Layer ids that illustrate this component. */
  layerIds: string[];
};

export type DescriptorEvidence = {
  descriptorId: string;
  version: string;
  sourceId: string;
  sourceHash: string;
  coordinateSystem: "spec-feet-z-up";
  units: "ft";
  /** Verified geometric measurement, architectural proxy, potential relationship, or insufficient evidence. */
  validity: "verified-geometric" | "architectural-proxy" | "potential-relationship" | "insufficient-evidence";
  components: ComponentEvidence[];
  layers: EvidenceLayer[];
  /** Counts and raw measures useful for reports. */
  measurements: Record<string, number | string | null>;
  /** Why a component or the descriptor is unavailable, or why candidates were rejected. */
  notes: string[];
};

export const CREDIT_DASH: EvidenceLayer["lineStyle"] = "dashed";

/** Reduce a list to at most `limit` evenly spaced items. Returns shown/total. */
export function sampleEvenly<T>(items: T[], limit: number): { items: T[]; shown: number; total: number } {
  if (items.length <= limit) return { items, shown: items.length, total: items.length };
  const picked: T[] = [];
  const stride = items.length / limit;
  for (let index = 0; index < limit; index += 1) picked.push(items[Math.floor(index * stride)]);
  return { items: picked, shown: picked.length, total: items.length };
}

/** A horizontal square patch (two triangles) centred on a point, slightly lifted. */
export function squarePatch(center: Vec3, sizeFeet: number, lift = 0.03): number[] {
  const h = sizeFeet / 2 * 0.98;
  const z = center[2] + lift;
  const x0 = center[0] - h;
  const x1 = center[0] + h;
  const y0 = center[1] - h;
  const y1 = center[1] + h;
  return [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
}

/** Twelve triangles of an axis-aligned box in spec feet. */
export function boxPatch(min: Vec3, max: Vec3): number[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => [...a, ...b, ...c, ...a, ...c, ...d];
  return [
    ...quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]),
    ...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
    ...quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
    ...quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]),
    ...quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]),
    ...quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
  ];
}

export function patchLayer(
  base: Pick<EvidenceLayer, "id" | "label" | "color" | "status" | "components"> & Partial<Pick<EvidenceLayer, "opacity">>,
  patches: number[][],
  limit = 6000,
): EvidenceLayer {
  const sampled = sampleEvenly(patches, limit);
  const triangles = new Float32Array(sampled.items.reduce((sum, patch) => sum + patch.length, 0));
  let offset = 0;
  for (const patch of sampled.items) {
    triangles.set(patch, offset);
    offset += patch.length;
  }
  return { ...base, kind: "patch", lineStyle: "solid", triangles, shown: sampled.shown, total: sampled.total };
}

export function segmentLayer(
  base: Pick<EvidenceLayer, "id" | "label" | "color" | "status" | "components"> & Partial<Pick<EvidenceLayer, "lineStyle" | "kind">>,
  segments: Segment[],
  limit = 2500,
): EvidenceLayer {
  const sampled = sampleEvenly(segments, limit);
  return { kind: "segment", lineStyle: "solid", ...base, segments: sampled.items, shown: sampled.shown, total: sampled.total };
}

export function arrowLayer(
  base: Pick<EvidenceLayer, "id" | "label" | "color" | "status" | "components"> & Partial<Pick<EvidenceLayer, "lineStyle">>,
  arrows: Segment[],
  limit = 400,
): EvidenceLayer {
  const sampled = sampleEvenly(arrows, limit);
  return { kind: "arrow", lineStyle: "solid", ...base, arrows: sampled.items, shown: sampled.shown, total: sampled.total };
}

export function polylineLayer(
  base: Pick<EvidenceLayer, "id" | "label" | "color" | "status" | "components"> & Partial<Pick<EvidenceLayer, "lineStyle">>,
  polylines: Vec3[][],
  limit = 200,
): EvidenceLayer {
  const sampled = sampleEvenly(polylines, limit);
  return { kind: "polyline", lineStyle: "solid", ...base, polylines: sampled.items, shown: sampled.shown, total: sampled.total };
}

export function pointLayer(
  base: Pick<EvidenceLayer, "id" | "label" | "color" | "status" | "components">,
  points: Vec3[],
  labels?: string[],
  limit = 400,
): EvidenceLayer {
  const indexed = points.map((point, index) => ({ point, label: labels?.[index] }));
  const sampled = sampleEvenly(indexed, limit);
  return {
    ...base,
    kind: "point",
    lineStyle: "solid",
    points: sampled.items.map((item) => item.point),
    pointLabels: labels ? sampled.items.map((item) => item.label ?? "") : undefined,
    shown: sampled.shown,
    total: sampled.total,
  };
}

/** Drop layers that would draw nothing so legends never list unused items. */
export function nonEmptyLayers(layers: EvidenceLayer[]) {
  return layers.filter((layer) => layer.total > 0 || (layer.dimensions?.length ?? 0) > 0);
}
