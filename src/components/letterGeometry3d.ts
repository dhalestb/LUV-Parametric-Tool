import * as THREE from "three";
import type { Letter } from "./letterTypes";

/** Unit letterforms in a ~1×1 box, origin at center, for extrusion. */
function shapeL(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.42, -0.45);
  s.lineTo(0.42, -0.45);
  s.lineTo(0.42, -0.18);
  s.lineTo(-0.12, -0.18);
  s.lineTo(-0.12, 0.45);
  s.lineTo(-0.42, 0.45);
  s.lineTo(-0.42, -0.45);
  return s;
}

function shapeU(innerHalf = 0.14, even = false): THREE.Shape {
  const s = new THREE.Shape();
  const neck = innerHalf * (0.08 / 0.14);
  s.moveTo(-0.42, 0.45);
  s.lineTo(-0.42, -0.08);
  s.bezierCurveTo(-0.42, -0.37, -0.24, -0.48, 0, -0.48);
  s.bezierCurveTo(0.24, -0.48, 0.42, -0.37, 0.42, -0.08);
  s.lineTo(0.42, 0.45);
  s.lineTo(innerHalf, 0.45);
  if (even) {
    s.lineTo(innerHalf, -0.28);
    s.lineTo(-innerHalf, -0.28);
  } else {
    s.lineTo(innerHalf, -0.07);
    s.bezierCurveTo(innerHalf, -0.22, neck, -0.28, 0, -0.28);
    s.bezierCurveTo(-neck, -0.28, -innerHalf, -0.22, -innerHalf, -0.07);
  }
  s.lineTo(-innerHalf, 0.45);
  s.lineTo(-0.42, 0.45);
  s.closePath();
  return s;
}

function shapeV(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.46, 0.45);
  s.lineTo(-0.15, 0.45);
  s.lineTo(0, -0.16);
  s.lineTo(0.15, 0.45);
  s.lineTo(0.46, 0.45);
  s.lineTo(0.15, -0.45);
  s.lineTo(-0.15, -0.45);
  s.lineTo(-0.46, 0.45);
  return s;
}

const SHAPE_BUILDERS: Record<Letter, () => THREE.Shape> = {
  V: shapeV,
  U: shapeU,
  L: shapeL,
};

export function getLetterShape(letter: Letter, innerHalf?: number, even = false): THREE.Shape {
  if (letter === "U" && innerHalf !== undefined) return shapeU(innerHalf, even);
  return SHAPE_BUILDERS[letter]();
}

const geometryCache = new Map<string, THREE.ExtrudeGeometry>();

/** Clear height of each upright linear U opening. The outside of the U stays put. */
export const LINEAR_U_OPENING_FT = 10;
/** Width of each upright linear U along the gallery, and how far that width bows in plan. */
export const LINEAR_U_WIDTH_FT = 1;
export const LINEAR_U_BOW_FT = 4;

/** Local plan bow for an upright linear U, in the same units as the unscaled letter. */
export function linearUBend(scale: number, scaleY: number): number {
  return LINEAR_U_BOW_FT / Math.max(scale * scaleY, 1e-6);
}

/** Inner half-width for an even 10 ft opening at this upright U's world scale on the opening axis. */
export function linearUInnerHalf(worldScale: number): number {
  const bevel = 0.01;
  const half = (LINEAR_U_OPENING_FT / Math.max(worldScale, 1e-6) + bevel * 2) / 2;
  return Math.min(0.38, Math.max(0.05, half));
}

function bendLetter(geometry: THREE.ExtrudeGeometry, sagitta: number) {
  const bent = geometry.clone();
  const position = bent.getAttribute("position");
  let reach = 0;
  for (let index = 0; index < position.count; index += 1) reach = Math.max(reach, Math.abs(position.getZ(index)));
  if (reach < 1e-6) return bent;
  for (let index = 0; index < position.count; index += 1) {
    const along = position.getZ(index) / reach;
    position.setY(index, position.getY(index) + sagitta * (1 - along * along));
  }
  position.needsUpdate = true;
  bent.computeVertexNormals();
  bent.computeBoundingBox();
  return bent;
}

/** Shared solid used by the letter-volume preview and OBJ export. */
export function getLetterVolumeGeometry(letter: Letter, thicknessPercent: number, innerHalf?: number, even = false, bend = 0): THREE.ExtrudeGeometry {
  const curve = Math.round(bend * 1e4) / 1e4;
  const key = `volume-${letter}-${thicknessPercent}-${innerHalf ?? ""}-${even ? "even" : ""}-${curve}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;
  const geometry = curve
    ? bendLetter(getLetterVolumeGeometry(letter, thicknessPercent, innerHalf, even, 0), curve)
    : new THREE.ExtrudeGeometry(getLetterShape(letter, innerHalf, even), {
      depth: thicknessPercent / 100,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
      bevelSegments: 1,
      curveSegments: 16,
    });
  if (!curve) geometry.center();
  geometryCache.set(key, geometry);
  return geometry;
}

export function getLetterGeometry(letter: Letter, depth = 0.28): THREE.ExtrudeGeometry {
  const key = `display-${letter}-${depth}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const shape = SHAPE_BUILDERS[letter]();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  geometryCache.set(key, geo);
  return geo;
}

/**
 * Letter silhouette as a vertical stamp (thick along Y) for CSG cutters.
 * Face lies in XZ; thickness along Y is `depth`.
 */
export function getLetterStampGeometry(
  letter: Letter,
  depth = 2,
): THREE.BufferGeometry {
  const key = `stamp-${letter}-${depth}`;
  const cached = geometryCache.get(key);
  if (cached) return cached.clone();

  const shape = SHAPE_BUILDERS[letter]();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 28,
  });
  // XY face, extrude +Z → rotate so thickness becomes Y (through a horizontal slab)
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geometryCache.set(key, geo);
  return geo.clone();
}

export const LETTER_COLORS: Record<Letter, string> = {
  V: "#e8e8e8",
  U: "#3dd6db",
  L: "#e8e8e8",
};
