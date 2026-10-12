import type { Vec3 } from "./geometryView";
import { normalize, type SectionPlane } from "./meshSection";

/** Camera and clipping presets for the shared imported-mesh viewer. */
export type AnalysisView = "isometric" | "section-x" | "section-y" | "plan" | "elevation";

export const ANALYSIS_GOLD = "#D6AD4F";
/** Board fill standard. The opacity control starts here and does not change the score. */
export const ANALYSIS_OPACITY_STANDARD = 0.16;
/**
 * Drawn box edge divided by the computational cell edge.
 * The evaluator still counts the full cell.
 */
export const ANALYSIS_MARKER_SCALE = 0.35;
export const ANALYSIS_MARKER_NOTE = "Markers are drawn at 35% of the computational cell edge so the architectural shell stays readable. This is a visualization convention. Cell centers and the counted cell size are unchanged. Cells are not merged into rooms.";

export type ClipPlane = {
  normal: Vec3;
  constant: number;
};

export function viewUsesClip(view: AnalysisView) {
  return view === "section-x" || view === "section-y" || view === "plan";
}

/** One camera distance for every panel, taken from the larger form. */
export function matchedFrame(sizes: Vec3[]) {
  const span = Math.max(1, ...sizes.map((size) => Math.max(size[0], size[1], size[2])));
  const height = Math.max(1, ...sizes.map((size) => size[2]));
  return { span, fit: Math.max(60, span * 0.85), aimY: height / 2 };
}

function cameraUp(viewDirection: Vec3): Vec3 {
  const upright: Vec3 = [0, 1, 0];
  const alignment = Math.abs(viewDirection[0] * upright[0] + viewDirection[1] * upright[1] + viewDirection[2] * upright[2]);
  return alignment > 0.95 ? [0, 0, -1] : upright;
}

export function presetCamera(
  view: AnalysisView,
  fit: number,
  aimY: number,
  discardedSpecNormal?: Vec3,
): {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  projection: "perspective" | "orthographic";
} {
  const target: Vec3 = [0, aimY, 0];
  if (view === "isometric") {
    return {
      position: [fit * 0.72, aimY + fit * 0.55, fit * 0.72],
      target,
      up: [0, 1, 0],
      projection: "perspective",
    };
  }
  if (view === "elevation") {
    return { position: [0, aimY, fit], target, up: [0, 1, 0], projection: "orthographic" };
  }
  const source = normalize(discardedSpecNormal ?? (view === "plan" ? [0, 0, 1] : view === "section-x" ? [1, 0, 0] : [0, 1, 0]));
  const direction = registeredDisplayNormal(source);
  return {
    position: [
      target[0] + direction[0] * fit,
      target[1] + direction[1] * fit,
      target[2] + direction[2] * fit,
    ],
    target,
    up: cameraUp(direction),
    projection: "orthographic",
  };
}

/** Spec feet, after the Lattice registration anchor, in Three.js Y-up. */
export function registeredDisplayPoint(spec: Vec3, anchor: Vec3): Vec3 {
  const x = spec[0] - anchor[0];
  const y = spec[1] - anchor[1];
  const z = spec[2] - anchor[2];
  return [x, z, y];
}

export function registeredDisplayNormal(specNormal: Vec3): Vec3 {
  const normal = normalize(specNormal);
  return [normal[0], normal[2], normal[1]];
}

/**
 * World clipping plane for a section or plan.
 * Three.js removes points whose signed distance is negative.
 * The normal points into the kept half, which is the side away from the preset camera,
 * so the cut face stays in view. Plan keeps the geometry below the cutting height.
 */
export function worldClippingPlane(plane: SectionPlane, anchor: Vec3, view: AnalysisView): ClipPlane {
  if (!viewUsesClip(view)) return { normal: [0, 1, 0], constant: 1e9 };
  const source = normalize(plane.normal);
  const kept: Vec3 = [-source[0], -source[1], -source[2]];
  const origin = registeredDisplayPoint(plane.origin, anchor);
  const normal = registeredDisplayNormal(kept);
  const constant = -(normal[0] * origin[0] + normal[1] * origin[1] + normal[2] * origin[2]);
  return { normal, constant };
}

/** True when a spec-feet point remains after the same clip applied to the mesh. */
export function pointKeptByClip(specPoint: Vec3, plane: SectionPlane, anchor: Vec3, view: AnalysisView) {
  if (!viewUsesClip(view)) return true;
  const world = registeredDisplayPoint(specPoint, anchor);
  const clip = worldClippingPlane(plane, anchor, view);
  const distance = clip.normal[0] * world[0] + clip.normal[1] * world[1] + clip.normal[2] * world[2] + clip.constant;
  return distance >= -1e-5;
}

/**
 * Half-height of the orthographic frame, in feet.
 * The longer side of the larger form fits on both screen axes, with margin,
 * so a long plan or elevation does not meet the frame. Both panels must pass
 * the same span and aspect to keep one physical scale.
 */
export function orthographicHalf(span: number, aspect = 1) {
  const paddedHalf = Math.max(span, 1) * 0.78;
  const safeAspect = Math.max(aspect, 0.35);
  return Math.max(paddedHalf, paddedHalf / safeAspect);
}

export function markerEdgeFeet(cellFeet: number) {
  return cellFeet * ANALYSIS_MARKER_SCALE;
}
