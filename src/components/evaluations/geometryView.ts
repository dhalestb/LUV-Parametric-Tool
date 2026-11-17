/**
 * Additive view of a form for sectioning and later derived geometry.
 * Coordinates stay in feet, Z-up. This adapter does not apply a placement twice:
 * spec feet are the architectural frame; file coordinates are recovered only for
 * a viewer that still holds the original OBJ buffer.
 */

export type Vec3 = [number, number, number];
export type UpAxisName = "y" | "z";

export type GeometryViewSource = {
  sourceId: string;
  derivedId?: string;
  revision: string;
  provenance?: string;
  /** Column-major local-to-world, spec feet. Identity when the form is unplaced. */
  localToWorld: number[];
  importAxis: UpAxisName;
  rotationDeg: 0 | 90 | 180 | 270;
  mirror: "none" | "x" | "y";
  category: string;
  evidenceIds?: string[];
};

export const IDENTITY_LOCAL_TO_WORLD = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Inverse of fileToSpec, then undo unit scale. One conversion back to the OBJ buffer. */
export function specFeetToFile(spec: Vec3, up: UpAxisName, unitScale: number): Vec3 {
  const scale = unitScale || 1;
  const x = spec[0] / scale;
  const y = spec[1] / scale;
  const z = spec[2] / scale;
  if (up === "y") return [x, z, -y];
  return [x, y, z];
}

/** Display convention used by the existing preview: Y on screen is architectural Z. */
export function specFeetToDisplay(spec: Vec3): Vec3 {
  return [spec[0], spec[2], spec[1]];
}
