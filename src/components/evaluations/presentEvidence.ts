/**
 * Presentation transform for v4 evidence. Filters, restyles, and thins layers
 * for the shared graphic language. The evaluator's recorded layers are not mutated.
 */
import { GRAPHIC, colorForRole, fillOpacityForRole, lineStyleForRole, pointShapeForRole, type GraphicRole, type PointShape } from "./graphicStyle";
import { sampleEvenly, type EvidenceLayer, type Segment } from "./v4/evidence";
import { triangleArrayBoundary } from "./v4/formMeasures";
import { planExitPoint, type Vec3 } from "./v4/geometry";
import { EYE_HEIGHT_FEET, LIGHT_PROBE_HEIGHT_FEET } from "./v4/visibility";

export type PresentationOptions = {
  /** When a component is focused, that component's layers are shown even if they are hidden in the default pair drawing. */
  componentFocus?: string;
  /** Seat hovering analysis on each local plate. Off keeps probe / eye height. */
  seatOnPlate?: boolean;
  /** Draw blocked light rays for Overhead and Lateral Light Exposure. */
  showBlocked?: boolean;
  /** Merge adjacent analysis faces and keep only each cluster's outer outline. Display only. */
  mergeFaces?: boolean;
};

const LAYER_ROLE: Record<string, GraphicRole> = {
  "ov-qualifying": "surface",
  "ov-volume": "volume",
  "ov-void": "surface",
  "ov-sheltered-low": "excluded",
  "ov-uncertain": "potential",
  "ov-obstructed": "excluded",
  "ov-exposed": "excluded",
  "cv-routes": "connection",
  "cv-arrows": "connection",
  "cv-entries": "entry",
  "cv-destination": "destination",
  "cv-unsupported": "excluded",
  "cv-potential": "potential",
  "sc-folds": "surface",
  "sc-orientation": "surface",
  "sc-bands": "dimension",
  "sc-mirror": "reference",
  "vc-clear": "connection",
  "vc-origins": "sample",
  "vc-targets": "sample",
  "vc-blocked": "excluded",
  "su-cantilever": "surface",
  "su-nonaxis": "surface",
  "su-displacement": "connection",
  "su-scale": "sample",
  "mo-height": "dimension",
  "mo-plan": "dimension",
  "mo-volume": "volume",
  "mo-clear-height": "sample",
  "mo-level": "surface",
  "hi-primary": "surface",
  "hi-secondary": "surface",
  "hi-tertiary": "surface",
  "hi-other": "reference",
  "hi-branches": "potential",
  "sq-layers": "surface",
  "sq-order": "connection",
  "sq-events": "sample",
  "sq-intervals": "dimension",
  "sq-guides": "reference",
  "sq-path": "connection",
  "sq-arrows": "connection",
  "sq-stages": "sample",
  "sq-descent": "excluded",
  "sq-metrics": "dimension",
  "sq-direction": "connection",
  "sq-horizontal": "sample",
  "sq-vertical": "sample",
  "sq-potential": "potential",
  "ca-network": "surface",
  "ca-spine": "connection",
  "ca-interfaces": "entry",
  "ca-junctions": "sample",
  "ca-deadends": "excluded",
  "ca-disconnected": "excluded",
  "ca-potential": "potential",
  "ce-inner": "surface",
  "ce-inner-clear": "volume",
  "ce-center": "connection",
  "ce-guides": "reference",
  "vi-void": "volume",
  "vi-sight": "connection",
  "vi-chain": "connection",
  "vi-levels": "surface",
  "vi-potential": "potential",
  "lu-overhead": "connection",
  "lu-lateral": "connection",
  "lu-lit": "surface",
  "lu-dark": "excluded",
  "lu-blocked": "excluded",
};

const PRESENTATION_KEEP: Record<string, readonly string[]> = {
  openVolume: ["ov-qualifying"],
  convergent: ["cv-routes", "cv-arrows", "cv-entries", "cv-destination"],
  sculptural: ["sc-folds", "sc-orientation", "sc-bands"],
  visuallyConnected: ["vc-clear", "vc-origins"],
  surreal: ["su-cantilever", "su-nonaxis", "su-displacement"],
  monumental: ["mo-volume", "mo-level", "mo-height"],
  hierarchical: ["hi-primary", "hi-secondary", "hi-tertiary"],
  sequential: ["sq-path", "sq-arrows", "sq-stages", "sq-descent", "sq-metrics"],
  circulationActivated: ["ca-network", "ca-spine", "ca-disconnected"],
  centralized: ["ce-inner", "ce-inner-clear", "ce-center", "ce-guides"],
  verticallyIntegrated: ["vi-void", "vi-levels", "vi-sight", "vi-chain"],
  luminous: ["lu-lit", "lu-overhead", "lu-lateral"],
};

const PRESENTATION_LABEL: Record<string, string> = {
  "ov-qualifying": "Sheltered clearance.",
  "cv-routes": "Verified approaches",
  "cv-arrows": "Approach direction",
  "cv-entries": "Connected entries",
  "cv-destination": "Destination",
  "sc-folds": "Measured folds",
  "sc-orientation": "Surface orientation variety",
  "sc-bands": "Sectional variation",
  "vc-clear": "Accepted sightlines",
  "vc-origins": "Viewing positions",
  "su-cantilever": "Unsupported floor",
  "su-nonaxis": "Measured non-axis surfaces",
  "su-displacement": "Upper / lower displacement",
  "mo-volume": "Qualifying clear volume",
  "mo-level": "Largest floor plane",
  "mo-height": "Height",
  "hi-primary": "Primary floor plane",
  "hi-secondary": "Secondary floor plane",
  "hi-tertiary": "Tertiary floor plane",
  "sq-layers": "Massing layers",
  "sq-order": "Sequence order",
  "sq-events": "Layers in order",
  "sq-intervals": "Layer intervals",
  "sq-path": "Verified ascent route",
  "sq-arrows": "Route progression",
  "sq-stages": "Entry, landings, arrival",
  "sq-descent": "Necessary descent",
  "sq-metrics": "Vertical gain",
  "sq-direction": "Route direction",
  "ca-network": "Largest connected system",
  "ca-spine": "Movement spine",
  "ca-disconnected": "Disconnected floor",
  "ce-inner": "Central surfaces",
  "ce-inner-clear": "Central clear volume",
  "ce-center": "Mass-centre offset",
  "ce-guides": "Reference ellipse",
  "vi-void": "Vertical voids",
  "vi-levels": "Joined floor areas",
  "vi-sight": "Cross-level sightlines",
  "vi-chain": "Verified vertical movement",
  "lu-lit": "Eligible interior floor",
  "lu-overhead": "Open upward light rays",
  "lu-lateral": "Open lateral light rays",
  "lu-blocked": "Blocked light rays",
};

const DISPLAY_LIMIT: Record<string, number> = {
  "sc-folds": 4000,
  "vc-clear": 180,
  "vc-origins": 120,
  "lu-overhead": 40,
  "lu-lateral": 40,
  "lu-blocked": 80,
  "vi-sight": 70,
  "cv-routes": 64,
  "ca-network": 900,
  "ca-spine": 80,
  "mo-volume": 160,
};

const EMPTY_NOTE: Record<string, string> = {
  openVolume: "No qualifying sheltered clearance.",
  convergent: "No verified approach to a destination.",
  sculptural: "No measured fold or surface variation.",
  visuallyConnected: "No accepted same-level sightline.",
  surreal: "No qualifying measured surface or displacement.",
  monumental: "No qualifying clear volume or height measure.",
  hierarchical: "No recognised floor planes.",
  sequential: "No verified upward route from the main entry.",
  circulationActivated: "No connected movement system.",
  centralized: "No measured central surface or centroid.",
  verticallyIntegrated: "No qualifying vertical void or verified level link.",
  luminous: "No eligible interior light path.",
};

function roleFor(layer: EvidenceLayer): GraphicRole {
  if (LAYER_ROLE[layer.id]) return LAYER_ROLE[layer.id];
  if (layer.status === "verified") return layer.kind === "point" ? "sample" : "connection";
  if (layer.status === "reference") return "reference";
  if (layer.status === "potential") return "potential";
  if (layer.status === "excluded") return "excluded";
  if (layer.kind === "point") return "sample";
  if (layer.kind === "arrow" || layer.kind === "polyline") return "connection";
  if (layer.kind === "volume") return "volume";
  return "surface";
}

function quantize(point: Vec3, step = 0.4) {
  return `${(Math.round(point[0] / step) * step).toFixed(1)},${(Math.round(point[1] / step) * step).toFixed(1)},${(Math.round(point[2] / step) * step).toFixed(1)}`;
}

function uniqueSegments(segments: Segment[]): Segment[] {
  const seen = new Set<string>();
  const out: Segment[] = [];
  for (const segment of segments) {
    const key = `${quantize(segment.a)}|${quantize(segment.b)}`;
    const reverse = `${quantize(segment.b)}|${quantize(segment.a)}`;
    if (seen.has(key) || seen.has(reverse)) continue;
    seen.add(key);
    out.push(segment);
  }
  return out;
}

function uniquePolylines(polylines: Vec3[][]): Vec3[][] {
  const seen = new Set<string>();
  const out: Vec3[][] = [];
  for (const line of polylines) {
    if (line.length < 2) continue;
    const key = line.map((point) => quantize(point)).join(">");
    const reverse = [...line].reverse().map((point) => quantize(point)).join(">");
    if (seen.has(key) || seen.has(reverse)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function limit<T>(items: T[] | undefined, max: number | undefined): T[] | undefined {
  if (!items) return items;
  if (!max || items.length <= max) return items;
  return sampleEvenly(items, max).items;
}

function emphasisFor(id: string): EvidenceLayer["emphasis"] {
  if (id === "hi-primary") return "primary";
  if (id === "hi-secondary" || id === "hi-tertiary") return "secondary";
  return undefined;
}

function asArrows(layer: EvidenceLayer, role: GraphicRole): Pick<EvidenceLayer, "kind" | "arrows" | "segments"> {
  const shouldArrow = role === "connection" || role === "dimension";
  if (!shouldArrow) return {};
  if (layer.arrows?.length) return { kind: "arrow", arrows: layer.arrows };
  if (layer.kind === "segment" && layer.segments?.length && (layer.id === "vc-clear" || layer.id === "vi-sight" || layer.id === "mo-height" || layer.id === "ce-center")) {
    return { kind: "arrow", arrows: layer.segments, segments: undefined };
  }
  if (layer.kind === "polyline" && layer.id === "vi-chain" && layer.polylines?.length) {
    const arrows = layer.polylines.filter((line) => line.length >= 2).map((line) => ({ a: line[0], b: line[line.length - 1] }));
    return { arrows };
  }
  return {};
}

function presentationPoints(layer: EvidenceLayer, role: GraphicRole): { points?: Vec3[]; pointLabels?: string[]; pointShape?: PointShape } {
  if (layer.id === "su-displacement" && layer.arrows?.[0]) {
    const arrow = layer.arrows[0];
    return { points: [arrow.a, arrow.b], pointLabels: ["Lower", "Upper"], pointShape: "circle" };
  }
  if (layer.id === "ce-center" && layer.points?.length) {
    return { points: layer.points, pointLabels: layer.pointLabels ?? ["Mass centre"], pointShape: "diamond" };
  }
  if ((layer.id === "hi-primary" || layer.id === "hi-secondary" || layer.id === "hi-tertiary") && layer.dimensions?.length) {
    const number = layer.id === "hi-primary" ? "1" : layer.id === "hi-secondary" ? "2" : "3";
    return {
      points: layer.dimensions.map((item) => item.a),
      pointLabels: layer.dimensions.map((item) => `${number} · ${item.text}`),
      pointShape: "circle",
    };
  }
  if (layer.points?.length) return { points: layer.points, pointLabels: layer.pointLabels, pointShape: pointShapeForRole(role) };
  return {};
}

function clusterFaceOutline(layer: EvidenceLayer): { segments?: Segment[]; hideInternalEdges?: boolean } {
  if (!layer.triangles?.length) return {};
  const outline = triangleArrayBoundary(layer.triangles);
  const triangleCount = layer.triangles.length / 9;
  if (!outline.length || outline.length > triangleCount * 2) return { hideInternalEdges: true };
  return { segments: uniqueSegments(outline), hideInternalEdges: true };
}

function styleLayer(layer: EvidenceLayer, options: PresentationOptions = {}): EvidenceLayer {
  const role = roleFor(layer);
  const emphasis = emphasisFor(layer.id);
  const color = colorForRole(role);
  const limitCount = DISPLAY_LIMIT[layer.id];
  const mergeFaces = Boolean(options.mergeFaces);
  const cluster = mergeFaces ? clusterFaceOutline(layer) : {};
  const dropRecordedOutline = !mergeFaces && Boolean(layer.hideInternalEdges && layer.triangles?.length);
  const segments = cluster.segments
    ?? (dropRecordedOutline ? undefined
      : layer.id === "sc-folds" && layer.segments ? uniqueSegments(layer.segments)
        : layer.id === "cv-routes" && layer.segments ? uniqueSegments(layer.segments)
          : limit(layer.segments, limitCount));
  const polylines = layer.id === "cv-routes" && layer.polylines
    ? limit(uniquePolylines(layer.polylines), limitCount)
    : limit(layer.polylines, limitCount);
  const arrows = limit(layer.arrows, limitCount);
  const points = limit(layer.points, limitCount);
  const thinned: EvidenceLayer = {
    ...layer,
    segments,
    polylines,
    arrows,
    points,
    shown: layer.kind === "patch" || layer.kind === "volume"
      ? layer.shown
      : (segments ?? layer.segments)?.length
        ?? (polylines ?? layer.polylines)?.length
        ?? (arrows ?? layer.arrows)?.length
        ?? (points ?? layer.points)?.length
        ?? layer.shown,
  };
  const arrowPatch = asArrows({ ...thinned, arrows: arrows ?? layer.arrows }, role);
  const pointPatch = presentationPoints({ ...thinned, arrows: arrowPatch.arrows ?? thinned.arrows }, role);
  const patchOpacity = layer.kind === "patch" || layer.kind === "volume" ? fillOpacityForRole(role, emphasis) : layer.opacity;
  const override = presentationOverride(layer.id);
  return {
    ...thinned,
    ...arrowPatch,
    ...pointPatch,
    color: (layer.id === "ce-inner-clear" || layer.id === "mo-level" ? "#71BEDA" : override.color ?? color) as EvidenceLayer["color"],
    label: PRESENTATION_LABEL[layer.id] ?? layer.label,
    lineStyle: lineStyleForRole(role),
    opacity: patchOpacity,
    emphasis,
    hideInternalEdges: mergeFaces ? cluster.hideInternalEdges : false,
    pointShape: override.pointShape ?? pointPatch.pointShape ?? (layer.kind === "point" ? pointShapeForRole(role) : layer.pointShape),
    pointScale: override.pointScale ?? layer.pointScale,
  };
}

function presentationOverride(id: string): Pick<EvidenceLayer, "color" | "pointShape" | "pointScale"> {
  if (id === "cv-entries") {
    return {
      color: GRAPHIC.colors.entry,
      pointShape: "circle",
      pointScale: GRAPHIC.marker.entry / GRAPHIC.marker.sample,
    };
  }
  if (id === "cv-destination") {
    return {
      pointShape: "circle",
      pointScale: GRAPHIC.marker.destination / GRAPHIC.marker.sample,
    };
  }
  if (id === "sq-stages") {
    return {
      color: GRAPHIC.colors.surface,
      pointShape: "circle",
      pointScale: GRAPHIC.marker.entry / GRAPHIC.marker.sample,
    };
  }
  return {};
}

function keepLayer(layer: EvidenceLayer, descriptorId: string, options: PresentationOptions = {}) {
  if (layer.id === "lu-blocked" && !options.showBlocked) return false;
  if (options.componentFocus && options.componentFocus !== "all") return layer.components.includes(options.componentFocus);
  const keep = PRESENTATION_KEEP[descriptorId];
  if (!keep) return true;
  if (layer.id === "lu-blocked" && options.showBlocked) return true;
  return keep.includes(layer.id);
}

function planBoundsOf(layers: EvidenceLayer[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const layer of layers) {
    for (const arrow of layer.arrows ?? []) {
      consider(arrow.a[0], arrow.a[1]);
      consider(arrow.b[0], arrow.b[1]);
    }
    for (const point of layer.points ?? []) consider(point[0], point[1]);
    const triangles = layer.triangles;
    if (!triangles) continue;
    for (let index = 0; index + 2 < triangles.length; index += 3) consider(triangles[index], triangles[index + 1]);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Pull escaped laterals out to the floor edge so they read as side light. */
function inboundLateralArrows(arrows: Segment[], bounds: { minX: number; minY: number; maxX: number; maxY: number }): Segment[] {
  return arrows.map((arrow) => {
    const dx = arrow.a[0] - arrow.b[0];
    const dy = arrow.a[1] - arrow.b[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return arrow;
    return { a: planExitPoint(arrow.b, [dx / length, dy / length, 0], bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, 6), b: arrow.b };
  });
}

const PLATE_LIFT_FEET = 0.25;
const PLATE_HOVER_MIN_FEET = 1;
const PLATE_HOVER_MAX_FEET = 6.5;

function shouldSeat(hover: number) {
  return hover >= PLATE_HOVER_MIN_FEET && hover <= PLATE_HOVER_MAX_FEET;
}

function localPlateLevels(layers: EvidenceLayer[]): number[] {
  const zs = new Set<number>();
  for (const layer of layers) {
    if (layer.id !== "lu-lit" && layer.id !== "lu-dark") continue;
    const triangles = layer.triangles;
    if (!triangles) continue;
    for (let index = 2; index < triangles.length; index += 3) zs.add(Math.round(triangles[index] * 100) / 100);
  }
  return [...zs];
}

function plateUnder(probeZ: number, plates: number[], offsetFeet: number): number | null {
  let best: number | null = null;
  let bestDelta = Infinity;
  for (const plate of plates) {
    const hover = probeZ - plate;
    if (!shouldSeat(hover)) continue;
    const delta = Math.abs(hover - offsetFeet);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = plate;
    }
  }
  if (best !== null) return best;
  if (plates.some((plate) => probeZ - plate < PLATE_HOVER_MIN_FEET && probeZ - plate >= -0.5)) return null;
  return probeZ - offsetFeet;
}

function dropAmount(probeZ: number, plates: number[], offsetFeet: number): number | null {
  const plateZ = plateUnder(probeZ, plates, offsetFeet);
  if (plateZ === null) return null;
  const drop = probeZ - plateZ - PLATE_LIFT_FEET;
  return Math.abs(drop) < 1e-6 ? null : drop;
}

/** Lower hovering arrows onto the local floor under each probe. Display only. */
function dropOntoLocalPlates(arrows: Segment[], plates: number[], offsetFeet: number): Segment[] {
  return arrows.map((arrow) => {
    const drop = dropAmount(Math.min(arrow.a[2], arrow.b[2]), plates, offsetFeet);
    if (drop === null) return arrow;
    return {
      a: [arrow.a[0], arrow.a[1], arrow.a[2] - drop],
      b: [arrow.b[0], arrow.b[1], arrow.b[2] - drop],
    };
  });
}

function dropPointsOntoLocalPlates(points: Vec3[], plates: number[], offsetFeet: number): Vec3[] {
  return points.map((point) => {
    const drop = dropAmount(point[2], plates, offsetFeet);
    if (drop === null) return point;
    return [point[0], point[1], point[2] - drop];
  });
}

function inferredPlateLevels(layers: EvidenceLayer[], offsetFeet: number): number[] {
  const zs = new Set<number>();
  const consider = (z: number) => zs.add(Math.round((z - offsetFeet) * 100) / 100);
  for (const layer of layers) {
    for (const point of layer.points ?? []) consider(point[2]);
    for (const arrow of layer.arrows ?? []) consider(Math.min(arrow.a[2], arrow.b[2]));
    for (const segment of layer.segments ?? []) consider(Math.min(segment.a[2], segment.b[2]));
  }
  return [...zs];
}

function isLuminousArrowLayer(id: string) {
  return id === "lu-lateral" || id === "lu-overhead" || id === "lu-blocked";
}

/** Lower every luminous arrow onto its local plate. Off keeps the 4 ft probe offset. */
function presentLuminousLayers(layers: EvidenceLayer[], source: EvidenceLayer[], seatOnPlate: boolean): EvidenceLayer[] {
  const bounds = planBoundsOf(layers) ?? planBoundsOf(source);
  const plates = seatOnPlate ? localPlateLevels(source.length ? source : layers) : [];
  return layers.map((layer) => {
    let arrows = layer.arrows;
    let segments = layer.segments;
    if (layer.id === "lu-lateral" && arrows?.length && bounds) arrows = inboundLateralArrows(arrows, bounds);
    if (seatOnPlate && isLuminousArrowLayer(layer.id)) {
      if (arrows?.length) arrows = dropOntoLocalPlates(arrows, plates, LIGHT_PROBE_HEIGHT_FEET);
      if (segments?.length) segments = dropOntoLocalPlates(segments, plates, LIGHT_PROBE_HEIGHT_FEET);
    }
    if (arrows === layer.arrows && segments === layer.segments) return layer;
    return { ...layer, arrows, segments };
  });
}

function isVisuallyConnectedOverlay(id: string) {
  return id === "vc-clear" || id === "vc-origins" || id === "vc-targets" || id === "vc-blocked";
}

/** Lower every sightline and viewing position onto its local plate. Off keeps the 5.5 ft eye offset. */
function presentVisuallyConnectedLayers(layers: EvidenceLayer[], source: EvidenceLayer[], seatOnPlate: boolean): EvidenceLayer[] {
  if (!seatOnPlate) return layers;
  const recorded = localPlateLevels(source.length ? source : layers);
  const plates = recorded.length ? recorded : inferredPlateLevels(source.length ? source : layers, EYE_HEIGHT_FEET);
  return layers.map((layer) => {
    if (!isVisuallyConnectedOverlay(layer.id)) return layer;
    let arrows = layer.arrows;
    let segments = layer.segments;
    let points = layer.points;
    if (arrows?.length) arrows = dropOntoLocalPlates(arrows, plates, EYE_HEIGHT_FEET);
    if (segments?.length) segments = dropOntoLocalPlates(segments, plates, EYE_HEIGHT_FEET);
    if (points?.length) points = dropPointsOntoLocalPlates(points, plates, EYE_HEIGHT_FEET);
    if (arrows === layer.arrows && segments === layer.segments && points === layer.points) return layer;
    return { ...layer, arrows, segments, points };
  });
}

function layerMaxZ(layer: EvidenceLayer | undefined) {
  let top = -Infinity;
  if (!layer) return top;
  const consider = (z: number) => {
    top = Math.max(top, z);
  };
  for (const arrow of layer.arrows ?? []) {
    consider(arrow.a[2]);
    consider(arrow.b[2]);
  }
  for (const segment of layer.segments ?? []) {
    consider(segment.a[2]);
    consider(segment.b[2]);
  }
  for (const dimension of layer.dimensions ?? []) {
    consider(dimension.a[2]);
    consider(dimension.b[2]);
  }
  return top;
}

/** Flatten volume columns that the 20 ft credit drew above the massing. Display only. */
function clipVolumeToMassingHeight(layer: EvidenceLayer, topZ: number): EvidenceLayer {
  const source = layer.triangles;
  if (!source?.length) return layer;
  let changed = false;
  const triangles = new Float32Array(source);
  for (let index = 2; index < triangles.length; index += 3) {
    if (triangles[index] > topZ) {
      triangles[index] = topZ;
      changed = true;
    }
  }
  return changed ? { ...layer, triangles } : layer;
}

function presentMonumentalLayers(layers: EvidenceLayer[], source: EvidenceLayer[]): EvidenceLayer[] {
  const topZ = layerMaxZ(source.find((layer) => layer.id === "mo-height"));
  if (!Number.isFinite(topZ)) return layers;
  return layers.map((layer) => (layer.id === "mo-volume" ? clipVolumeToMassingHeight(layer, topZ) : layer));
}

/** Restyle and filter layers for the pair diagrams. Does not mutate the source evidence. */
export function presentLayers(layers: EvidenceLayer[], descriptorId: string, options: PresentationOptions = {}): EvidenceLayer[] {
  const presented = layers.filter((layer) => keepLayer(layer, descriptorId, options)).map((layer) => styleLayer(layer, options));
  if (descriptorId === "luminous") return presentLuminousLayers(presented, layers, Boolean(options.seatOnPlate));
  if (descriptorId === "visuallyConnected") return presentVisuallyConnectedLayers(presented, layers, Boolean(options.seatOnPlate));
  if (descriptorId === "monumental") return presentMonumentalLayers(presented, layers);
  return presented;
}

export function presentationEmptyNote(descriptorId: string, layers: EvidenceLayer[]) {
  if (layers.some((layer) => layer.total > 0 || (layer.dimensions?.length ?? 0) > 0)) return null;
  return EMPTY_NOTE[descriptorId] ?? "No qualifying measurement.";
}

export function graphicRoleForLayer(layer: EvidenceLayer): GraphicRole {
  return roleFor(layer);
}

export const PRESENTATION_LINE_SCALE = GRAPHIC.line.analysisScale;
