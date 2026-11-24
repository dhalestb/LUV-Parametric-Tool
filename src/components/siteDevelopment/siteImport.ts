import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { classifyLayerName, classifyMaterialName, LAYER_COLORS } from "./classify";
import type { Point, Polygon } from "./geometry";
import { convexHull, polygonArea, polygonBounds, rectanglePolygon } from "./geometry";
import { LATTICE_FEET, UNIT_TO_FEET } from "../lattice/types";
import type { SiteCoordinates, SiteLayerInfo, SiteLayerKind, SiteModelInfo } from "./types";
import { SITE_COORDINATE_POLICY } from "./types";

export type LoadedSite = {
  info: SiteModelInfo;
  root: THREE.Group;
};

function boxOf(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };
  return {
    min: [box.min.x, box.min.y, box.min.z] as [number, number, number],
    max: [box.max.x, box.max.y, box.max.z] as [number, number, number],
  };
}

function countMeshes(object: THREE.Object3D) {
  let meshCount = 0;
  let triangleCount = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshCount += 1;
    const index = mesh.geometry.getIndex();
    const positions = mesh.geometry.getAttribute("position");
    triangleCount += index ? index.count / 3 : positions ? positions.count / 3 : 0;
  });
  return { meshCount, triangleCount };
}

function planPolyline(object: THREE.Object3D): Point[] {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return [];
  return [
    [box.min.x, box.min.z],
    [box.max.x, box.min.z],
    [box.max.x, box.max.z],
    [box.min.x, box.max.z],
  ];
}

/** Dense plan samples from mesh triangles → convex hull (gold Site surface footprint). */
function planFootprintHull(object: THREE.Object3D, sampleLimit = 4000): Polygon | null {
  const points: Point[] = [];
  const world = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) return;
    const stride = Math.max(1, Math.floor(positions.count / Math.max(1, Math.floor(sampleLimit / 4))));
    for (let i = 0; i < positions.count; i += stride) {
      world.fromBufferAttribute(positions, i);
      mesh.localToWorld(world);
      points.push([world.x, world.z]);
    }
  });
  if (points.length < 3) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return null;
    return rectanglePolygon([box.min.x, box.min.z], [box.max.x, box.max.z]);
  }
  const hull = convexHull(points);
  return hull.length >= 3 ? hull : null;
}

function applyDisplayMaterials(root: THREE.Group, layers: SiteLayerInfo[]) {
  const byName = new Map(layers.map((layer) => [layer.name, layer]));
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    let node: THREE.Object3D | null = mesh;
    let layer: SiteLayerInfo | undefined;
    while (node) {
      if (node.name && byName.has(node.name)) {
        layer = byName.get(node.name);
        break;
      }
      node = node.parent;
    }
    const materialName = Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name;
    const gold = classifyMaterialName(materialName ?? "") === "suggested-development";
    const color = gold ? LAYER_COLORS["suggested-development"] : layer?.color ?? "#cfcfcf";
    mesh.material = new THREE.MeshStandardMaterial({
      color,
      roughness: gold ? 0.45 : 0.78,
      metalness: gold ? 0.35 : 0.04,
      transparent: gold,
      opacity: gold ? 0.85 : 1,
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
  });
}

function promoteLayerChildren(root: THREE.Group) {
  let guard = 0;
  while (guard++ < 4 && root.children.length === 1) {
    const only = root.children[0];
    if (!only.children.length) break;
    const name = (only.name || "").toLowerCase();
    const container = !name || name === "scene" || name === "world" || name === "root" || classifyLayerName(only.name) === "context";
    if (!container) break;
    const children = [...only.children];
    root.remove(only);
    children.forEach((child) => root.add(child));
  }
}

export function inspectObject3D(root: THREE.Object3D, filename: string, format: "glb" | "obj"): SiteModelInfo {
  const layers: SiteLayerInfo[] = [];
  const notes: string[] = [
    "GLB visualization geometry is not a verified survey or legal property boundary.",
    SITE_COORDINATE_POLICY,
  ];
  root.updateMatrixWorld(true);
  const named = root.children.length ? root.children : [root];
  for (const child of named) {
    const kind = classifyLayerName(child.name || filename);
    const counts = countMeshes(child);
    const suggested = kind === "suggested-development";
    layers.push({
      id: child.uuid,
      name: child.name || filename,
      kind,
      visible: true,
      meshCount: counts.meshCount,
      triangleCount: counts.triangleCount,
      bbox: boxOf(child),
      color: LAYER_COLORS[kind],
      suggestedDevelopment: suggested,
      legalBoundary: false,
    });
    if (suggested) notes.push(`Layer "${child.name}" is treated as a suggested development overlay, not a legal lot line.`);
  }
  if (!layers.some((layer) => layer.kind === "suggested-development")) {
    notes.push("No gold/site overlay was identified. Draw a Cluster Zone manually over the intended parcel.");
  }
  const bboxModel = boxOf(root);
  const suggestedLayer = layers.find((layer) => layer.suggestedDevelopment);
  const water = layers.find((layer) => layer.kind === "waterfront");
  const roads = layers.find((layer) => layer.kind === "roads");
  const suggestedObject = suggestedLayer
    ? (root.getObjectByName(suggestedLayer.name) ?? root.getObjectByProperty("uuid", suggestedLayer.id) ?? null)
    : null;
  const waterObject = water
    ? (root.getObjectByName(water.name) ?? root.getObjectByProperty("uuid", water.id) ?? null)
    : null;
  const aabbZone: Polygon | null = suggestedLayer
    ? rectanglePolygon(
      [suggestedLayer.bbox.min[0], suggestedLayer.bbox.min[2]],
      [suggestedLayer.bbox.max[0], suggestedLayer.bbox.max[2]],
    )
    : null;
  const goldFootprint = suggestedObject ? planFootprintHull(suggestedObject) : null;
  // Prefer the Site-layer AABB when the hull collapses or shrinks unrealistically; otherwise use the hull.
  const suggestedZone: Polygon | null = (() => {
    if (!aabbZone) return goldFootprint;
    if (!goldFootprint) return aabbZone;
    const aabbArea = Math.max(1, polygonArea(aabbZone));
    const hullArea = polygonArea(goldFootprint);
    if (hullArea < LATTICE_FEET * LATTICE_FEET || hullArea < aabbArea * 0.35) return aabbZone;
    return goldFootprint;
  })();
  const waterExclusion: Polygon | null = waterObject ? planFootprintHull(waterObject) : null;
  if (goldFootprint) {
    notes.push("Suggested development boundary uses the gold Site layer plan footprint (convex hull), not a loose scene AABB.");
  }
  if (waterExclusion) {
    notes.push("Waterfront layer plan footprint is recorded for diagnostics. It is not auto-applied as a hard exclusion because its hull can overlap the gold Site pad.");
  }
  return {
    filename,
    format,
    nodeCount: named.length,
    meshCount: countMeshes(root).meshCount,
    bboxModel,
    bboxFeet: bboxModel,
    layers,
    suggestedZone,
    waterExclusion,
    waterPolyline: water ? planPolyline(waterObject ?? root) : [],
    roadPolyline: roads ? planPolyline(root.getObjectByName(roads.name) ?? root) : [],
    notes,
  };
}

export function applySiteCoordinates(info: SiteModelInfo, coordinates: SiteCoordinates): SiteModelInfo {
  const scale = coordinates.feetPerModel;
  const scaleBox = (box: { min: [number, number, number]; max: [number, number, number] }) => ({
    min: [box.min[0] * scale, box.min[1] * scale, box.min[2] * scale] as [number, number, number],
    max: [box.max[0] * scale, box.max[1] * scale, box.max[2] * scale] as [number, number, number],
  });
  const scalePoly = (poly: Polygon | null) => poly?.map(([x, z]) => [x * scale, z * scale] as Point) ?? null;
  return {
    ...info,
    bboxFeet: scaleBox(info.bboxModel),
    layers: info.layers.map((layer) => ({ ...layer, bbox: scaleBox(layer.bbox) })),
    suggestedZone: scalePoly(info.suggestedZone),
    waterExclusion: scalePoly(info.waterExclusion ?? null),
    waterPolyline: info.waterPolyline.map(([x, z]) => [x * scale, z * scale] as Point),
    roadPolyline: info.roadPolyline.map(([x, z]) => [x * scale, z * scale] as Point),
  };
}

export function coordinatesForUnit(unit: SiteCoordinates["unit"], rhinoZToGltfY = true): SiteCoordinates {
  return {
    unit,
    unitAssumption: "unresolved",
    feetPerModel: UNIT_TO_FEET[unit],
    origin: [0, 0, 0],
    northDeg: 0,
    elevationDatum: 0,
    rhinoZToGltfY,
    policy: SITE_COORDINATE_POLICY,
  };
}

export async function loadSiteFromArrayBuffer(buffer: ArrayBuffer, filename: string): Promise<LoadedSite> {
  const lower = filename.toLowerCase();
  const root = new THREE.Group();
  root.name = filename;
  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      new GLTFLoader().parse(buffer, "", (result: GLTF) => resolve(result), reject);
    });
    root.add(gltf.scene);
    promoteLayerChildren(root);
  } else if (lower.endsWith(".obj")) {
    const text = new TextDecoder().decode(buffer);
    root.add(new OBJLoader().parse(text));
  } else {
    throw new Error("Supported site formats are GLB/glTF and OBJ. DXF and GeoJSON are reserved for later phases.");
  }
  const info = inspectObject3D(root, filename, lower.endsWith(".obj") ? "obj" : "glb");
  applyDisplayMaterials(root, info.layers);
  return { info, root };
}

export function scaleRootToFeet(root: THREE.Group, feetPerModel: number) {
  root.scale.setScalar(feetPerModel);
  root.updateMatrixWorld(true);
}

export function suggestedOverlayNote(zone: Polygon | null) {
  if (!zone) return "No suggested overlay polygon is available.";
  const bounds = polygonBounds(zone);
  const area = polygonArea(zone);
  return `Suggested overlay follows the gold Site surface plan footprint (${area.toFixed(0)} ft², span ${(bounds.maxX - bounds.minX).toFixed(1)} × ${(bounds.maxZ - bounds.minZ).toFixed(1)} ft). It is not a legally verified property boundary. Use “Snap zone to gold Site” to replace a water-extending curve with this footprint.`;
}
