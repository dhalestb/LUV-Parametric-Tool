/**
 * Shared comparison graphic language. Every diagram reads colour, weight, and
 * marker shape from this file. Display only — it does not change scores.
 */
import { PALETTE } from "./v4/evidence";

export type GraphicRole =
  | "surface"
  | "volume"
  | "connection"
  | "reference"
  | "potential"
  | "excluded"
  | "entry"
  | "sample"
  | "destination"
  | "dimension";

export type PointShape = "circle" | "square" | "diamond";

export const GRAPHIC = {
  colors: {
    massingFill: PALETTE.paper,
    massingEdge: PALETTE.gray,
    surface: PALETTE.cyan,
    connection: PALETTE.gold,
    reference: PALETTE.gray,
    potential: PALETTE.gray,
    excluded: PALETTE.gray,
    marker: PALETTE.cyan,
    entry: PALETTE.lightBlue,
    label: PALETTE.paper,
  },
  massing: {
    opacity: 0.26,
    edgeOpacity: 0.9,
    silhouetteOpacity: 0.95,
    creaseOpacity: 0.72,
  },
  fill: {
    surface: 0.32,
    volume: 0.16,
    primary: 0.4,
    secondary: 0.26,
  },
  line: {
    massingFeet: 0.12,
    analysisFeet: 0.32,
    analysisScale: 2.5,
  },
  marker: {
    sample: 0.4,
    entry: 0.55,
    destination: 1.2,
  },
} as const;

export function colorForRole(role: GraphicRole): string {
  if (role === "connection" || role === "dimension") return GRAPHIC.colors.connection;
  if (role === "surface" || role === "volume" || role === "entry" || role === "sample" || role === "destination") return GRAPHIC.colors.surface;
  return GRAPHIC.colors.reference;
}

export function pointShapeForRole(role: GraphicRole): PointShape {
  if (role === "entry") return "square";
  if (role === "destination") return "diamond";
  return "circle";
}

export function lineStyleForRole(role: GraphicRole): "solid" | "dashed" | "dotted" {
  if (role === "reference") return "dashed";
  if (role === "potential" || role === "excluded") return "dotted";
  return "solid";
}

export function fillOpacityForRole(role: GraphicRole, emphasis?: "primary" | "secondary"): number {
  if (role === "volume") return GRAPHIC.fill.volume;
  if (emphasis === "primary") return GRAPHIC.fill.primary;
  if (emphasis === "secondary") return GRAPHIC.fill.secondary;
  return GRAPHIC.fill.surface;
}

/** Starting opacity scale for gold arrows and for volume fills. Display only. */
export const ARROW_OPACITY_STANDARD = 1;
export const VOLUME_OPACITY_STANDARD = 1;
/** Starting width scale for gold paths and arrows. Display only. */
export const ARROW_WIDTH_STANDARD = 1;

export function isVolumeOverlay(layer: { kind?: string }): boolean {
  return layer.kind === "volume";
}

function isGoldColor(color?: string): boolean {
  return color === GRAPHIC.colors.connection || color === PALETTE.gold;
}

/** Gold arrows, routes, and measurement bars. Volumes use `isVolumeOverlay`. */
export function isGoldArrow(layer: { kind?: string; color?: string; arrows?: unknown[] }): boolean {
  if (isVolumeOverlay(layer)) return false;
  if (layer.kind === "arrow" || (layer.arrows && layer.arrows.length > 0)) return true;
  return isGoldColor(layer.color);
}

/** Gold path and arrow strokes only. Patches and volumes keep their own weight. */
export function isGoldPath(layer: { kind?: string; color?: string }): boolean {
  if (layer.kind === "volume" || layer.kind === "patch") return false;
  return isGoldColor(layer.color);
}
