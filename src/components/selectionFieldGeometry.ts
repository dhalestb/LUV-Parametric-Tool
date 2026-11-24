import * as THREE from "three";
import type { CompositionPlacement } from "./compositionEngine";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import {
  SELECTION_PLAN_FEET,
  type SelectionFieldVolume,
  type SelectionHeightFeet,
  selectionFieldDimensions,
} from "./selectionHeightRouting";

export type AxisAlignedBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type PlacementFieldRelation = "inside" | "intersecting" | "outside";

export type ClassifiedPlacement = {
  placement: CompositionPlacement;
  relation: PlacementFieldRelation;
  bounds: AxisAlignedBounds;
};

function placementScale(placement: CompositionPlacement): THREE.Vector3 {
  return new THREE.Vector3(
    placement.scale * (placement.scaleX ?? 1),
    placement.scale * (placement.scaleY ?? 1),
    placement.scale * (placement.scaleZ ?? 1),
  );
}

export function placementWorldMatrix(placement: CompositionPlacement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(placement.x, placement.y, placement.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(placement.rx),
      THREE.MathUtils.degToRad(placement.ry),
      THREE.MathUtils.degToRad(placement.rz),
      "XYZ",
    )),
    placementScale(placement),
  );
}

/** World-space AABB of the letter solid at its actual TRS (not a center proxy). */
export function letterWorldBounds(placement: CompositionPlacement, thicknessPercent: number): AxisAlignedBounds {
  const geometry = getLetterVolumeGeometry(placement.cell.letter, thicknessPercent);
  const position = geometry.getAttribute("position");
  const matrix = placementWorldMatrix(placement);
  const point = new THREE.Vector3();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(matrix);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function selectionFieldBounds(volume: SelectionFieldVolume): AxisAlignedBounds {
  return {
    minX: volume.centerX - volume.width / 2,
    maxX: volume.centerX + volume.width / 2,
    minY: volume.centerY - volume.height / 2,
    maxY: volume.centerY + volume.height / 2,
    minZ: volume.centerZ - volume.depth / 2,
    maxZ: volume.centerZ + volume.depth / 2,
  };
}

function boundsOverlap(a: AxisAlignedBounds, b: AxisAlignedBounds, epsilon = 1e-9): boolean {
  return a.minX <= b.maxX + epsilon && a.maxX >= b.minX - epsilon
    && a.minY <= b.maxY + epsilon && a.maxY >= b.minY - epsilon
    && a.minZ <= b.maxZ + epsilon && a.maxZ >= b.minZ - epsilon;
}

function boundsContained(inner: AxisAlignedBounds, outer: AxisAlignedBounds, epsilon = 1e-9): boolean {
  return inner.minX >= outer.minX - epsilon && inner.maxX <= outer.maxX + epsilon
    && inner.minY >= outer.minY - epsilon && inner.maxY <= outer.maxY + epsilon
    && inner.minZ >= outer.minZ - epsilon && inner.maxZ <= outer.maxZ + epsilon;
}

export function classifyBoundsAgainstField(
  letterBounds: AxisAlignedBounds,
  field: AxisAlignedBounds,
): PlacementFieldRelation {
  if (!boundsOverlap(letterBounds, field)) return "outside";
  if (boundsContained(letterBounds, field)) return "inside";
  return "intersecting";
}

/**
 * Include letters whose solids intersect the selection field.
 * Centers alone are not used. Original placement TRS is preserved.
 */
export function classifyPlacementsAgainstSelection(
  placements: CompositionPlacement[],
  volume: SelectionFieldVolume,
  thicknessPercent: number,
): ClassifiedPlacement[] {
  const field = selectionFieldBounds(volume);
  return placements.map((placement) => {
    const bounds = letterWorldBounds(placement, thicknessPercent);
    return {
      placement,
      bounds,
      relation: classifyBoundsAgainstField(bounds, field),
    };
  });
}

export function intersectingSelectionPlacements(
  placements: CompositionPlacement[],
  volume: SelectionFieldVolume,
  thicknessPercent: number,
): CompositionPlacement[] {
  return classifyPlacementsAgainstSelection(placements, volume, thicknessPercent)
    .filter((item) => item.relation !== "outside")
    .map((item) => structuredClone(item.placement));
}

/**
 * Localize intersecting placements so the selection center becomes the origin,
 * preserving relative positions, orientations, and scales.
 */
export function localizeIntersectingPlacements(
  placements: CompositionPlacement[],
  volume: SelectionFieldVolume,
  thicknessPercent: number,
): CompositionPlacement[] {
  return intersectingSelectionPlacements(placements, volume, thicknessPercent).map((placement) => ({
    ...placement,
    x: placement.x - volume.centerX,
    y: placement.y - volume.centerY,
    z: placement.z - volume.centerZ,
  }));
}

/** Closed triangle mesh for a placement in world coordinates. Used by Manifold trim. */
export function triangleMeshFromPlacement(placement: CompositionPlacement, thicknessPercent: number) {
  const geometry = getLetterVolumeGeometry(placement.cell.letter, thicknessPercent);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const matrix = placementWorldMatrix(placement);
  const vertices: number[] = [];
  const triangles: number[] = [];
  const seen = new Map<string, number>();
  const point = new THREE.Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
    const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
    let vertex = seen.get(key);
    if (vertex === undefined) {
      vertex = vertices.length / 3;
      vertices.push(point.x, point.y, point.z);
      seen.set(key, vertex);
    }
    triangles.push(vertex);
  }
  return { vertices, triangles };
}

export function defaultHeightSelectionVolume(
  height: SelectionHeightFeet,
  center: { centerX?: number; centerY?: number; centerZ?: number } = {},
): SelectionFieldVolume {
  return {
    ...selectionFieldDimensions(height),
    centerX: center.centerX ?? 0,
    centerY: center.centerY ?? 0,
    centerZ: center.centerZ ?? 0,
  };
}

export { SELECTION_PLAN_FEET };
