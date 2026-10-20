/**
 * Projects v4 evidence layers into board pixels and derives the legend from the
 * layers that are actually drawn. The projection is a display transform only.
 */
import type { BoardLegendItem, BoardOverlay } from "./comparisonBoard";
import type { Vec3 } from "./geometryView";
import type { SectionPlane } from "./meshSection";
import type { EvidenceLayer } from "./v4/evidence";

export type Mapper = (point: Vec3) => [number, number];

/** Half-thickness of the band around a section plane in which evidence is drawn. */
export const SECTION_EVIDENCE_BAND_FEET = 6;

function signedDistance(plane: SectionPlane, point: Vec3) {
  return plane.normal[0] * (point[0] - plane.origin[0]) + plane.normal[1] * (point[1] - plane.origin[1]) + plane.normal[2] * (point[2] - plane.origin[2]);
}

function nearPlane(plane: SectionPlane | null, points: Vec3[], band: number) {
  if (!plane) return true;
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const d = signedDistance(plane, point);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  // Keep items that cross the plane or sit within the band on either side.
  return min <= band && max >= -band;
}

export function legendKind(layer: EvidenceLayer): BoardLegendItem["kind"] {
  if (layer.kind === "patch" || layer.kind === "volume") return "patch";
  if (layer.kind === "point") return "point";
  return "line";
}

/** Legend items from the drawn layers only, in draw order, without duplicates. */
export function legendFromLayers(layers: EvidenceLayer[]): BoardLegendItem[] {
  const seen = new Set<string>();
  const items: BoardLegendItem[] = [];
  for (const layer of layers) {
    if (!(layer.total > 0 || (layer.dimensions?.length ?? 0) > 0)) continue;
    const key = `${layer.color}:${layer.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sampled = layer.shown < layer.total ? ` (${layer.shown} of ${layer.total} drawn)` : "";
    items.push({ color: layer.color, label: `${layer.label}${sampled}`, dashed: layer.lineStyle === "dashed", kind: legendKind(layer) });
  }
  return items;
}

/**
 * Project layers for a board panel. In section orientations only evidence
 * within SECTION_EVIDENCE_BAND_FEET of the cut plane is drawn; in plan all of
 * it is drawn. Patches are capped per layer; the legend reports the sampling.
 */
export function projectLayers(
  layers: EvidenceLayer[],
  map: Mapper,
  plane: SectionPlane | null,
  options: { patchLimit?: number; band?: number } = {},
): BoardOverlay[] {
  const band = options.band ?? SECTION_EVIDENCE_BAND_FEET;
  const patchLimit = options.patchLimit ?? 2500;
  const overlays: BoardOverlay[] = [];
  for (const layer of layers) {
    const overlay: BoardOverlay = {
      id: layer.id,
      color: layer.color,
      alpha: layer.opacity ?? (layer.kind === "volume" ? 0.1 : layer.kind === "patch" ? 0.3 : 0.5),
      dashed: layer.lineStyle === "dashed",
      polygons: [],
      lines: [],
      points: [],
      labels: [],
    };
    if (layer.triangles) {
      const count = Math.floor(layer.triangles.length / 9);
      const stride = Math.max(1, Math.ceil(count / patchLimit));
      for (let index = 0; index < count; index += stride) {
        const base = index * 9;
        const a: Vec3 = [layer.triangles[base], layer.triangles[base + 1], layer.triangles[base + 2]];
        const b: Vec3 = [layer.triangles[base + 3], layer.triangles[base + 4], layer.triangles[base + 5]];
        const c: Vec3 = [layer.triangles[base + 6], layer.triangles[base + 7], layer.triangles[base + 8]];
        if (!nearPlane(plane, [a, b, c], band)) continue;
        overlay.polygons.push([map(a), map(b), map(c)]);
      }
    }
    const pushLine = (a: Vec3, b: Vec3) => {
      if (!nearPlane(plane, [a, b], band)) return;
      const [x1, y1] = map(a);
      const [x2, y2] = map(b);
      overlay.lines.push({ x1, y1, x2, y2 });
    };
    for (const segment of layer.segments ?? []) pushLine(segment.a, segment.b);
    for (const polyline of layer.polylines ?? []) {
      for (let index = 1; index < polyline.length; index += 1) pushLine(polyline[index - 1], polyline[index]);
    }
    for (const arrow of layer.arrows ?? []) {
      pushLine(arrow.a, arrow.b);
      if (!nearPlane(plane, [arrow.a, arrow.b], band)) continue;
      const [x1, y1] = map(arrow.a);
      const [x2, y2] = map(arrow.b);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length < 1e-3) continue;
      const ux = dx / length;
      const uy = dy / length;
      const size = Math.max(6, Math.min(18, length * 0.25));
      overlay.polygons.push([
        [x2, y2],
        [x2 - ux * size - uy * size * 0.5, y2 - uy * size + ux * size * 0.5],
        [x2 - ux * size + uy * size * 0.5, y2 - uy * size - ux * size * 0.5],
      ]);
    }
    (layer.points ?? []).forEach((point, index) => {
      if (!nearPlane(plane, [point], band)) return;
      const mapped = map(point);
      overlay.points.push(mapped);
      const label = layer.pointLabels?.[index];
      if (label && overlay.labels.length < 60) overlay.labels.push({ x: mapped[0], y: mapped[1], text: label });
    });
    for (const dimension of layer.dimensions ?? []) {
      if (!nearPlane(plane, [dimension.a, dimension.b], band)) continue;
      if (dimension.a !== dimension.b) pushLine(dimension.a, dimension.b);
      const mid = map([(dimension.a[0] + dimension.b[0]) / 2, (dimension.a[1] + dimension.b[1]) / 2, (dimension.a[2] + dimension.b[2]) / 2]);
      overlay.labels.push({ x: mid[0], y: mid[1], text: dimension.text });
    }
    if (overlay.polygons.length || overlay.lines.length || overlay.points.length || overlay.labels.length) overlays.push(overlay);
  }
  return overlays;
}
