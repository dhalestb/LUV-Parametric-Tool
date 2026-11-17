"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildCompleteFileGeometry, IDENTITY_PLACEMENT, tileRootMatrix } from "../lattice/objFidelity";
import type { ImportedObj, UpAxis, UpAxisMode } from "../lattice/types";
import {
  ANALYSIS_MARKER_SCALE,
  orthographicHalf,
  presetCamera,
  viewUsesClip,
  type AnalysisView,
  type ClipPlane,
} from "./analysisViewer";
import { GRAPHIC, isGoldArrow, isGoldPath, isVolumeOverlay } from "./graphicStyle";
import { specFeetToFile, type Vec3 } from "./geometryView";
import { architecturalEdges, type Triangle } from "./meshSection";
import { freeCellShell } from "./openVolumeDisplay";
import type { Segment } from "./meshSection";
import type { EvidenceLayer } from "./v4/evidence";

/** Analysis tubes are 2–3× the massing edge weight. */
const LAYER_TUBE_FEET = GRAPHIC.line.analysisFeet;

function fileTriangles(geometry: THREE.BufferGeometry): Triangle[] {
  const position = geometry.getAttribute("position");
  if (!position) return [];
  const index = geometry.getIndex();
  const read = (at: number): Vec3 => [position.getX(at), position.getY(at), position.getZ(at)];
  const triangles: Triangle[] = [];
  if (index) {
    for (let step = 0; step + 2 < index.count; step += 3) {
      triangles.push({ a: read(index.getX(step)), b: read(index.getX(step + 1)), c: read(index.getX(step + 2)) });
    }
    return triangles;
  }
  for (let step = 0; step + 2 < position.count; step += 3) {
    triangles.push({ a: read(step), b: read(step + 1), c: read(step + 2) });
  }
  return triangles;
}

function edgeGeometry(segments: Segment[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const segment of segments) {
    positions.push(segment.a[0], segment.a[1], segment.a[2], segment.b[0], segment.b[1], segment.b[2]);
  }
  const next = new THREE.BufferGeometry();
  next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return next;
}

function textSprite(text: string, color: string, feet: number): { sprite: THREE.Sprite; dispose: () => void } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const scale = 4;
  const font = `${22 * scale}px "Segoe UI", Arial, sans-serif`;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + 16 * scale;
  const height = 32 * scale;
  canvas.width = width;
  canvas.height = height;
  context.font = font;
  context.fillStyle = "rgba(0,0,0,0.72)";
  context.fillRect(0, 0, width, height);
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, 8 * scale, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((width / height) * feet, feet, 1);
  sprite.renderOrder = 8;
  return {
    sprite,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}

function tubeGeometry(points: THREE.Vector3[][], radius: number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const yAxis = new THREE.Vector3(0, 1, 0);
  const unit = new THREE.CylinderGeometry(radius, radius, 1, 3, 1, true);
  const unitPositions = unit.getAttribute("position") as THREE.BufferAttribute;
  const index = unit.getIndex();
  const vertex = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let segments = 0;
  for (const line of points) {
    for (let step = 1; step < line.length; step += 1) {
      const start = line[step - 1];
      const end = line[step];
      const delta = end.clone().sub(start);
      const length = delta.length();
      if (length < 1e-4) continue;
      quaternion.setFromUnitVectors(yAxis, delta.clone().multiplyScalar(1 / length));
      scale.set(1, length, 1);
      matrix.compose(start.clone().add(delta.multiplyScalar(0.5)), quaternion, scale);
      const count = index ? index.count : unitPositions.count;
      for (let i = 0; i < count; i += 1) {
        const at = index ? index.getX(i) : i;
        vertex.fromBufferAttribute(unitPositions, at).applyMatrix4(matrix);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
      segments += 1;
      if (segments > 6000) break;
    }
  }
  unit.dispose();
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
};

export type CameraBus = {
  pose: CameraPose | null;
  source: string | null;
  applying: boolean;
  listeners: Set<(source: string) => void>;
};

export function createCameraBus(): CameraBus {
  return { pose: null, source: null, applying: false, listeners: new Set() };
}

function cellShellGeometry(cells: Array<[number, number, number]> | null, anchor: Vec3 | null, cellFeet: number, up: UpAxis, unitScale: number) {
  if (!cells?.length || !anchor) return null;
  const spec = freeCellShell(cells, anchor, cellFeet);
  const positions = new Float32Array(spec.length);
  for (let index = 0; index < spec.length; index += 3) {
    const file = specFeetToFile([spec[index], spec[index + 1], spec[index + 2]], up, unitScale);
    positions[index] = file[0];
    positions[index + 1] = file[1];
    positions[index + 2] = file[2];
  }
  const next = new THREE.BufferGeometry();
  next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  next.computeVertexNormals();
  return next;
}

type OrbitBinding = {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

function CameraRig({
  view,
  fit,
  aimY,
  span,
  resetKey,
  sync,
  panelId,
  bus,
  discardedNormal,
}: {
  view: AnalysisView;
  fit: number;
  aimY: number;
  span: number;
  resetKey: number;
  sync: boolean;
  panelId: string;
  bus: CameraBus;
  discardedNormal: Vec3 | null;
}) {
  const { camera, size, controls, invalidate } = useThree();
  const normalRef = useRef(discardedNormal);
  normalRef.current = discardedNormal;
  const normalKey = discardedNormal ? discardedNormal.map((value) => value.toFixed(4)).join(",") : "";
  useEffect(() => {
    const preset = presetCamera(view, fit, aimY, normalRef.current ?? undefined);
    const target = new THREE.Vector3(...preset.target);
    camera.up.set(...preset.up);
    camera.position.set(...preset.position);
    camera.lookAt(target);
    camera.near = view === "isometric" ? Math.max(0.1, fit * 0.001) : -fit * 4;
    camera.far = Math.max(4000, fit * 20);
    camera.zoom = 1;
    if (camera instanceof THREE.OrthographicCamera) {
      const aspect = size.width / Math.max(1, size.height);
      const halfH = orthographicHalf(span, aspect);
      camera.left = -halfH * aspect;
      camera.right = halfH * aspect;
      camera.top = halfH;
      camera.bottom = -halfH;
    }
    camera.updateProjectionMatrix();
    const orbit = controls as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.copy(target);
    orbit?.update?.();
    invalidate();
  }, [aimY, camera, controls, fit, invalidate, normalKey, resetKey, size.height, size.width, span, view]);

  useEffect(() => {
    const orbit = controls as OrbitBinding | null;
    if (!orbit?.addEventListener) return;
    let frame = 0;
    const publish = () => {
      if (!sync || bus.applying) return;
      bus.pose = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [orbit.target.x, orbit.target.y, orbit.target.z],
        zoom: camera.zoom,
      };
      bus.source = panelId;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        bus.listeners.forEach((listener) => listener(panelId));
      });
    };
    const apply = (source: string) => {
      if (!sync || source === panelId || !bus.pose) return;
      bus.applying = true;
      camera.position.set(bus.pose.position[0], bus.pose.position[1], bus.pose.position[2]);
      orbit.target.set(bus.pose.target[0], bus.pose.target[1], bus.pose.target[2]);
      camera.zoom = bus.pose.zoom;
      camera.updateProjectionMatrix();
      orbit.update();
      bus.applying = false;
      invalidate();
    };
    orbit.addEventListener("change", publish);
    bus.listeners.add(apply);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      orbit.removeEventListener("change", publish);
      bus.listeners.delete(apply);
    };
  }, [bus, camera, controls, invalidate, panelId, sync]);

  useEffect(() => {
    if (!sync || panelId !== "least") return;
    const orbit = controls as OrbitBinding | null;
    if (!orbit?.target) return;
    bus.pose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [orbit.target.x, orbit.target.y, orbit.target.z],
      zoom: camera.zoom,
    };
    bus.source = panelId;
    bus.listeners.forEach((listener) => listener(panelId));
  }, [bus, camera, controls, panelId, sync]);

  return null;
}

function AnalyticalMesh({
  mesh,
  unitScale,
  upAxisMode,
  up,
  showMesh,
  markers,
  evidenceRays,
  fieldCells,
  fieldAnchor,
  fieldOpacity,
  shellCells,
  contextCells,
  cellFeet,
  opacity,
  clip,
  cutSegments,
  guideSegments,
  guideColor,
  dimensionSegments,
  volumeTriangles,
  layers,
  showMeasurementText = false,
  showFills = true,
  showEdges = true,
  arrowOpacity = 1,
  volumeOpacity = 1,
  arrowWidth = 1,
}: {
  mesh: ImportedObj;
  unitScale: number;
  upAxisMode: UpAxisMode;
  up: UpAxis;
  showMesh: boolean;
  markers: Array<{ center: Vec3; color: string; scale?: number }>;
  evidenceRays: Array<{ a: Vec3; b: Vec3; color: string; blocked: boolean; selected?: boolean; prominent?: boolean }>;
  fieldCells: Array<[number, number, number]> | null;
  fieldAnchor: Vec3 | null;
  fieldOpacity: number | null;
  shellCells: Array<[number, number, number]> | null;
  contextCells: Array<[number, number, number]> | null;
  cellFeet: number;
  opacity: number;
  clip: ClipPlane | null;
  cutSegments: Segment[];
  guideSegments: Segment[];
  guideColor: string;
  dimensionSegments: Segment[];
  volumeTriangles: Float32Array | null;
  layers: EvidenceLayer[];
  showMeasurementText: boolean;
  showFills: boolean;
  showEdges: boolean;
  arrowOpacity: number;
  volumeOpacity: number;
  arrowWidth: number;
}) {
  const group = useRef<THREE.Group>(null);
  const markerAnchor = useRef<THREE.Group>(null);
  const layerAnchor = useRef<THREE.Group>(null);
  const geometry = useMemo(() => buildCompleteFileGeometry(mesh), [mesh]);
  const clipPlane = useMemo(() => new THREE.Plane(), []);
  const meshMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: GRAPHIC.colors.massingFill,
    transparent: true,
    opacity: GRAPHIC.massing.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  const massingEdges = useMemo(() => architecturalEdges(fileTriangles(geometry)), [geometry]);
  const silhouetteGeometry = useMemo(() => edgeGeometry(massingEdges.silhouette), [massingEdges]);
  const creaseGeometry = useMemo(() => edgeGeometry(massingEdges.secondary), [massingEdges]);
  const fieldMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#D6AD4F",
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), []);
  const volumeMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#D6AD4F",
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), []);
  const shellMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#71BEDA",
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);
  const contextMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#0E6F92",
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);
  const rayAnchor = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const cutGeometry = useMemo(() => {
    const positions: number[] = [];
    for (const segment of cutSegments) {
      const a = specFeetToFile(segment.a, up, unitScale);
      const b = specFeetToFile(segment.b, up, unitScale);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return next;
  }, [cutSegments, unitScale, up]);
  const guideGeometry = useMemo(() => {
    const positions: number[] = [];
    for (const segment of guideSegments) {
      const a = specFeetToFile(segment.a, up, unitScale);
      const b = specFeetToFile(segment.b, up, unitScale);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return next;
  }, [guideSegments, unitScale, up]);
  const dimensionGeometry = useMemo(() => {
    const positions: number[] = [];
    for (const segment of dimensionSegments) {
      const a = specFeetToFile(segment.a, up, unitScale);
      const b = specFeetToFile(segment.b, up, unitScale);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return next;
  }, [dimensionSegments, unitScale, up]);
  const volumeGeometry = useMemo(() => {
    if (!volumeTriangles?.length) return null;
    const positions = new Float32Array(volumeTriangles.length);
    for (let index = 0; index < volumeTriangles.length; index += 3) {
      const file = specFeetToFile([volumeTriangles[index], volumeTriangles[index + 1], volumeTriangles[index + 2]], up, unitScale);
      positions[index] = file[0];
      positions[index + 1] = file[1];
      positions[index + 2] = file[2];
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.computeVertexNormals();
    return next;
  }, [unitScale, up, volumeTriangles]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => silhouetteGeometry.dispose(), [silhouetteGeometry]);
  useEffect(() => () => creaseGeometry.dispose(), [creaseGeometry]);
  useEffect(() => () => cutGeometry.dispose(), [cutGeometry]);
  useEffect(() => () => guideGeometry.dispose(), [guideGeometry]);
  useEffect(() => () => dimensionGeometry.dispose(), [dimensionGeometry]);
  useEffect(() => () => volumeGeometry?.dispose(), [volumeGeometry]);
  useEffect(() => () => {
    meshMaterial.dispose();
    fieldMaterial.dispose();
    volumeMaterial.dispose();
    shellMaterial.dispose();
    contextMaterial.dispose();
  }, [contextMaterial, fieldMaterial, meshMaterial, shellMaterial, volumeMaterial]);

  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id), unitScale, upAxisMode, {
      register: true,
      applyUnitAndUp: true,
    });
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
  }, [mesh, unitScale, upAxisMode]);

  useEffect(() => {
    meshMaterial.transparent = true;
    meshMaterial.opacity = GRAPHIC.massing.opacity;
    meshMaterial.depthWrite = false;
    meshMaterial.side = THREE.DoubleSide;
    const gold = fieldOpacity ?? (clip ? 0.55 : 0.42);
    const sectionFloor = fieldOpacity != null && fieldOpacity < 0.25 ? fieldOpacity : 0.5;
    fieldMaterial.opacity = (clip ? Math.max(gold, sectionFloor) : gold) * volumeOpacity;
    fieldMaterial.depthWrite = false;
    volumeMaterial.opacity = (fieldOpacity ?? 0.38) * volumeOpacity;
    volumeMaterial.transparent = true;
    volumeMaterial.alphaHash = false;
    volumeMaterial.depthWrite = false;
    volumeMaterial.depthTest = true;
    const planes = clip ? [clipPlane] : [];
    fieldMaterial.clippingPlanes = planes;
    volumeMaterial.clippingPlanes = planes;
    shellMaterial.clippingPlanes = planes;
    contextMaterial.clippingPlanes = planes;
    if (!clip) {
      meshMaterial.clippingPlanes = [];
    } else {
      clipPlane.normal.set(clip.normal[0], clip.normal[1], clip.normal[2]);
      clipPlane.constant = clip.constant;
      meshMaterial.clippingPlanes = [clipPlane];
    }
    meshMaterial.needsUpdate = true;
    fieldMaterial.needsUpdate = true;
    volumeMaterial.needsUpdate = true;
  }, [clip, clipPlane, contextMaterial, fieldCells, fieldMaterial, fieldOpacity, layers.length, markers.length, meshMaterial, shellMaterial, volumeMaterial, volumeOpacity, volumeTriangles]);

  // v4 evidence layers: patches, lines, polylines, arrows, points, and dimension text, all in spec feet.
  useEffect(() => {
    const anchor = layerAnchor.current;
    if (!anchor) return;
    for (const child of [...anchor.children]) anchor.remove(child);
    const disposers: Array<() => void> = [];
    const toFile = (point: Vec3) => new THREE.Vector3(...specFeetToFile(point, up, unitScale));
    const clippingPlanes = clip ? [clipPlane] : [];
    const feet = 1 / (unitScale || 1);
    const sphere = new THREE.SphereGeometry(GRAPHIC.marker.sample * feet, 8, 6);
    const cube = new THREE.BoxGeometry(GRAPHIC.marker.entry * feet * 1.6, GRAPHIC.marker.entry * feet * 1.6, GRAPHIC.marker.entry * feet * 1.6);
    const diamond = new THREE.OctahedronGeometry(GRAPHIC.marker.destination * feet, 0);
    const cone = new THREE.ConeGeometry(LAYER_TUBE_FEET * 3.2 * feet, LAYER_TUBE_FEET * 9 * feet, 6);
    const instanceMatrix = new THREE.Matrix4();
    const instanceScale = new THREE.Vector3();
    const instanceQuat = new THREE.Quaternion();
    disposers.push(() => sphere.dispose(), () => cube.dispose(), () => diamond.dispose(), () => cone.dispose());
    const markerGeometry = (shape: EvidenceLayer["pointShape"]) => (shape === "square" ? cube : shape === "diamond" ? diamond : sphere);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const pathWidth = (layer: EvidenceLayer) => (isGoldPath(layer) ? arrowWidth : 1);
    const scaleOpacity = (layer: EvidenceLayer, base: number) => (
      isVolumeOverlay(layer) ? base * volumeOpacity : isGoldArrow(layer) ? base * arrowOpacity : base
    );
    layers.forEach((layer, order) => {
      const renderOrder = 4 + order;
      const hasPatch = (layer.kind === "patch" || layer.kind === "volume") && !!layer.triangles?.length;
      const needFill = hasPatch && showFills;
      const needMeshEdges = hasPatch && showEdges && !layer.hideInternalEdges;
      const clearVolume = layer.id === "ce-inner-clear";
      const lightBlueFill = clearVolume || layer.id === "mo-level";
      if (needFill || needMeshEdges) {
        const positions = new Float32Array(layer.triangles!.length);
        for (let index = 0; index < layer.triangles!.length; index += 3) {
          const file = specFeetToFile([layer.triangles![index], layer.triangles![index + 1], layer.triangles![index + 2]], up, unitScale);
          positions[index] = file[0];
          positions[index + 1] = file[1];
          positions[index + 2] = file[2];
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        if (needFill) {
          const material = new THREE.MeshBasicMaterial({
            color: lightBlueFill ? "#71BEDA" : layer.color,
            transparent: true,
            opacity: scaleOpacity(layer, clearVolume ? 0.85 : layer.opacity ?? (layer.kind === "volume" ? 0.14 : 0.55)),
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: !clearVolume,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            clippingPlanes,
          });
          const patch = new THREE.Mesh(geometry, material);
          patch.frustumCulled = false;
          patch.renderOrder = renderOrder;
          anchor.add(patch);
          disposers.push(() => material.dispose());
        }
        if (needMeshEdges) {
          const outline = new THREE.EdgesGeometry(geometry, 1);
          const outlineMaterial = new THREE.LineBasicMaterial({
            color: lightBlueFill ? "#71BEDA" : layer.color,
            transparent: true,
            opacity: scaleOpacity(layer, layer.emphasis === "primary" ? 0.95 : 0.72),
            depthTest: false,
            clippingPlanes,
          });
          const boundary = new THREE.LineSegments(outline, outlineMaterial);
          boundary.frustumCulled = false;
          boundary.renderOrder = renderOrder + 1;
          anchor.add(boundary);
          disposers.push(() => outline.dispose(), () => outlineMaterial.dispose());
        }
        disposers.push(() => geometry.dispose());
      }
      const lineMaterial = () => layer.lineStyle === "solid"
        ? new THREE.LineBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: scaleOpacity(layer, 0.95), linewidth: 2, clippingPlanes })
        : new THREE.LineDashedMaterial({
          color: layer.color,
          dashSize: (layer.lineStyle === "dotted" ? 0.16 : 0.55) * feet,
          gapSize: (layer.lineStyle === "dotted" ? 0.22 : 0.32) * feet,
          depthTest: false,
          transparent: true,
          opacity: scaleOpacity(layer, layer.lineStyle === "dotted" ? 0.55 : 0.72),
          clippingPlanes,
        });
      const segmentPairs: Array<[Vec3, Vec3]> = [];
      if (showEdges) {
        for (const segment of layer.segments ?? []) segmentPairs.push([segment.a, segment.b]);
        if (showMeasurementText) {
          for (const dimension of layer.dimensions ?? []) if (dimension.a !== dimension.b) segmentPairs.push([dimension.a, dimension.b]);
        }
      }
      if (segmentPairs.length) {
        const positions: number[] = [];
        for (const [a, b] of segmentPairs) {
          const fa = toFile(a);
          const fb = toFile(b);
          positions.push(fa.x, fa.y, fa.z, fb.x, fb.y, fb.z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const material = lineMaterial();
        const lines = new THREE.LineSegments(geometry, material);
        if (layer.lineStyle !== "solid") lines.computeLineDistances();
        lines.frustumCulled = false;
        lines.renderOrder = renderOrder;
        anchor.add(lines);
        disposers.push(() => geometry.dispose(), () => material.dispose());
      }
      const tubes: THREE.Vector3[][] = [];
      if (showEdges) {
        for (const polyline of layer.polylines ?? []) tubes.push(polyline.map(toFile));
        for (const arrow of layer.arrows ?? []) tubes.push([toFile(arrow.a), toFile(arrow.b)]);
      }
      if (tubes.length) {
        const geometry = tubeGeometry(tubes, LAYER_TUBE_FEET * feet * pathWidth(layer));
        if (geometry) {
          const material = new THREE.MeshBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: scaleOpacity(layer, layer.status === "potential" ? 0.6 : 0.95), clippingPlanes });
          const tube = new THREE.Mesh(geometry, material);
          tube.frustumCulled = false;
          tube.renderOrder = renderOrder + 1;
          anchor.add(tube);
          disposers.push(() => geometry.dispose(), () => material.dispose());
        }
      }
      if (showEdges && layer.arrows?.length) {
        const material = new THREE.MeshBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: scaleOpacity(layer, 0.95), clippingPlanes });
        disposers.push(() => material.dispose());
        const width = pathWidth(layer);
        const poses: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> = [];
        for (const arrow of layer.arrows) {
          const start = toFile(arrow.a);
          const end = toFile(arrow.b);
          const delta = end.clone().sub(start);
          const length = delta.length();
          if (length < 1e-4) continue;
          const direction = delta.multiplyScalar(1 / length);
          poses.push({
            position: end.clone().sub(direction.clone().multiplyScalar(LAYER_TUBE_FEET * 4.5 * feet * width)),
            quaternion: new THREE.Quaternion().setFromUnitVectors(yAxis, direction),
          });
        }
        if (poses.length) {
          const heads = new THREE.InstancedMesh(cone, material, poses.length);
          instanceScale.setScalar(width);
          poses.forEach((pose, index) => {
            instanceMatrix.compose(pose.position, pose.quaternion, instanceScale);
            heads.setMatrixAt(index, instanceMatrix);
          });
          heads.instanceMatrix.needsUpdate = true;
          heads.frustumCulled = false;
          heads.renderOrder = renderOrder + 2;
          anchor.add(heads);
        }
      }
      if (layer.points?.length) {
        const material = new THREE.MeshBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: 0.95, clippingPlanes });
        disposers.push(() => material.dispose());
        const dots = new THREE.InstancedMesh(markerGeometry(layer.pointShape), material, layer.points.length);
        const markerScale = layer.pointScale ?? 1;
        instanceScale.set(markerScale, markerScale, markerScale);
        layer.points.forEach((point, index) => {
          instanceMatrix.compose(toFile(point), instanceQuat.identity(), instanceScale);
          dots.setMatrixAt(index, instanceMatrix);
          const label = showMeasurementText ? layer.pointLabels?.[index] : undefined;
          if (label && index < 80) {
            const made = textSprite(label, layer.color, 1.6 * feet);
            if (made) {
              made.sprite.position.copy(toFile(point)).add(new THREE.Vector3(0, 1.1 * feet, 0));
              anchor.add(made.sprite);
              disposers.push(made.dispose);
            }
          }
        });
        dots.instanceMatrix.needsUpdate = true;
        dots.frustumCulled = false;
        dots.renderOrder = renderOrder + 2;
        anchor.add(dots);
      }
      for (const dimension of showMeasurementText ? (layer.dimensions ?? []).slice(0, 40) : []) {
        const made = textSprite(dimension.text, layer.color, 1.6 * feet);
        if (!made) continue;
        const mid = toFile([(dimension.a[0] + dimension.b[0]) / 2, (dimension.a[1] + dimension.b[1]) / 2, (dimension.a[2] + dimension.b[2]) / 2]);
        made.sprite.position.copy(mid).add(new THREE.Vector3(0, 1.2 * feet, 0));
        anchor.add(made.sprite);
        disposers.push(made.dispose);
      }
    });
    invalidate();
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, [arrowOpacity, arrowWidth, clip, clipPlane, invalidate, layers, showEdges, showFills, showMeasurementText, unitScale, up, volumeOpacity]);

  const markerSize = (cellFeet / (unitScale || 1)) * ANALYSIS_MARKER_SCALE;
  const markerGeometry = useMemo(() => new THREE.BoxGeometry(markerSize, markerSize, markerSize), [markerSize]);
  useEffect(() => () => markerGeometry.dispose(), [markerGeometry]);
  const fieldGeometry = useMemo(() => cellShellGeometry(fieldCells, fieldAnchor, cellFeet, up, unitScale), [cellFeet, fieldAnchor, fieldCells, unitScale, up]);
  const envelopeGeometry = useMemo(() => cellShellGeometry(shellCells, fieldAnchor, cellFeet, up, unitScale), [cellFeet, fieldAnchor, shellCells, unitScale, up]);
  const contextGeometry = useMemo(() => cellShellGeometry(contextCells, fieldAnchor, cellFeet, up, unitScale), [cellFeet, fieldAnchor, contextCells, unitScale, up]);
  useEffect(() => () => fieldGeometry?.dispose(), [fieldGeometry]);
  useEffect(() => () => envelopeGeometry?.dispose(), [envelopeGeometry]);
  useEffect(() => () => contextGeometry?.dispose(), [contextGeometry]);

  useEffect(() => {
    const anchor = markerAnchor.current;
    if (!anchor) return;
    for (const child of [...anchor.children]) anchor.remove(child);
    const materials: THREE.Material[] = [];
    const byColor = new Map<string, THREE.MeshBasicMaterial>();
    for (const marker of markers) {
      let material = byColor.get(marker.color);
      if (!material) {
        material = new THREE.MeshBasicMaterial({
          color: marker.color,
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: false,
          clippingPlanes: clip ? [clipPlane] : [],
        });
        byColor.set(marker.color, material);
        materials.push(material);
      }
      const file = specFeetToFile(marker.center, up, unitScale);
      const box = new THREE.Mesh(markerGeometry, material);
      box.position.set(file[0], file[1], file[2]);
      box.scale.setScalar(marker.scale ?? 1);
      box.frustumCulled = false;
      box.renderOrder = 2;
      anchor.add(box);
    }
    invalidate();
    return () => {
      for (const material of materials) material.dispose();
    };
  }, [clip, clipPlane, invalidate, markerGeometry, markers, opacity, unitScale, up]);

  useEffect(() => {
    const anchor = rayAnchor.current;
    if (!anchor) return;
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    for (const child of [...anchor.children]) anchor.remove(child);
    const cone = new THREE.ConeGeometry(0.14, 0.42, 8);
    const blockMark = new THREE.SphereGeometry(0.48, 12, 10);
    const selectMark = new THREE.RingGeometry(0.18, 0.32, 16);
    geometries.push(cone, blockMark, selectMark);
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const ray of evidenceRays) {
      const start = new THREE.Vector3(...specFeetToFile(ray.a, up, unitScale));
      const end = new THREE.Vector3(...specFeetToFile(ray.b, up, unitScale));
      const delta = end.clone().sub(start);
      const length = delta.length();
      if (length < 1e-3) {
        if (!ray.blocked) continue;
        const clippingPlanes = clip && !ray.selected ? [clipPlane] : [];
        const dotMaterial = new THREE.MeshBasicMaterial({ color: "#D6AD4F", depthTest: false, clippingPlanes });
        materials.push(dotMaterial);
        const dot = new THREE.Mesh(blockMark, dotMaterial);
        dot.position.copy(end);
        dot.frustumCulled = false;
        dot.renderOrder = 6;
        anchor.add(dot);
        continue;
      }
      const direction = delta.multiplyScalar(1 / length);
      const clippingPlanes = clip && !ray.selected ? [clipPlane] : [];
      const lineColor = ray.color || (ray.blocked ? "#B9BEC6" : "#71BEDA");
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      geometries.push(geometry);
      const material = ray.blocked
        ? new THREE.LineDashedMaterial({ color: lineColor, dashSize: 0.4, gapSize: 0.24, depthTest: false, transparent: true, opacity: 0.95, clippingPlanes })
        : new THREE.LineBasicMaterial({ color: lineColor, depthTest: false, transparent: true, opacity: 0.95, clippingPlanes });
      materials.push(material);
      const line = new THREE.Line(geometry, material);
      if (ray.blocked) line.computeLineDistances();
      line.frustumCulled = false;
      line.renderOrder = ray.selected ? 5 : 3;
      anchor.add(line);
      if (ray.prominent) {
        const tubeGeometry = new THREE.CylinderGeometry(1.15, 1.15, length, 6);
        geometries.push(tubeGeometry);
        const tubeMaterial = new THREE.MeshBasicMaterial({ color: lineColor, depthTest: false, transparent: true, opacity: 0.92, clippingPlanes });
        materials.push(tubeMaterial);
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        tube.quaternion.setFromUnitVectors(yAxis, direction);
        tube.position.copy(start).add(direction.clone().multiplyScalar(length / 2));
        tube.frustumCulled = false;
        tube.renderOrder = 5;
        anchor.add(tube);
      }
      if (ray.blocked) {
        const dotMaterial = new THREE.MeshBasicMaterial({ color: "#D6AD4F", depthTest: false, clippingPlanes });
        materials.push(dotMaterial);
        const dot = new THREE.Mesh(blockMark, dotMaterial);
        dot.position.copy(end);
        dot.frustumCulled = false;
        dot.renderOrder = 6;
        anchor.add(dot);
      } else if (ray.selected) {
        const headMaterial = new THREE.MeshBasicMaterial({ color: "#71BEDA", depthTest: false, clippingPlanes });
        materials.push(headMaterial);
        const head = new THREE.Mesh(cone, headMaterial);
        head.quaternion.setFromUnitVectors(yAxis, direction);
        head.position.copy(start).add(direction.clone().multiplyScalar(length - 0.21));
        head.frustumCulled = false;
        head.renderOrder = 6;
        anchor.add(head);
      }
      if (ray.selected) {
        const ringMaterial = new THREE.MeshBasicMaterial({ color: "#D6AD4F", depthTest: false, side: THREE.DoubleSide, clippingPlanes });
        materials.push(ringMaterial);
        const ring = new THREE.Mesh(selectMark, ringMaterial);
        ring.position.copy(start);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        ring.frustumCulled = false;
        ring.renderOrder = 6;
        anchor.add(ring);
      }
    }
    invalidate();
    return () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    };
  }, [clip, clipPlane, evidenceRays, invalidate, unitScale, up]);

  return (
    <group ref={group}>
      {contextGeometry && <mesh geometry={contextGeometry} material={contextMaterial} renderOrder={1} />}
      {envelopeGeometry && <mesh geometry={envelopeGeometry} material={shellMaterial} renderOrder={1} />}
      {fieldGeometry && <mesh geometry={fieldGeometry} material={fieldMaterial} renderOrder={2} />}
      {showMesh && <mesh geometry={geometry} material={meshMaterial} renderOrder={2} />}
      {showMesh && silhouetteGeometry.attributes.position.count > 0 && (
        <lineSegments geometry={silhouetteGeometry} renderOrder={3}>
          <lineBasicMaterial color={GRAPHIC.colors.massingEdge} transparent opacity={GRAPHIC.massing.silhouetteOpacity} depthTest={false} clippingPlanes={clip ? [clipPlane] : []} />
        </lineSegments>
      )}
      {showMesh && creaseGeometry.attributes.position.count > 0 && (
        <lineSegments geometry={creaseGeometry} renderOrder={3}>
          <lineBasicMaterial color={GRAPHIC.colors.massingEdge} transparent opacity={GRAPHIC.massing.creaseOpacity} depthTest={false} clippingPlanes={clip ? [clipPlane] : []} />
        </lineSegments>
      )}
      {volumeGeometry && <mesh geometry={volumeGeometry} material={volumeMaterial} renderOrder={4} />}
      <group ref={markerAnchor} renderOrder={2} />
      <group ref={rayAnchor} renderOrder={3} />
      <group ref={layerAnchor} renderOrder={4} />
      {cutSegments.length > 0 && (
        <lineSegments geometry={cutGeometry} renderOrder={3}>
          <lineBasicMaterial color={GRAPHIC.colors.massingFill} />
        </lineSegments>
      )}
      {guideSegments.length > 0 && (
        <lineSegments geometry={guideGeometry} renderOrder={4}>
          <lineBasicMaterial color={guideColor} clippingPlanes={clip ? [clipPlane] : []} />
        </lineSegments>
      )}
      {dimensionSegments.length > 0 && (
        <lineSegments geometry={dimensionGeometry} renderOrder={5}>
          <lineBasicMaterial color="#B9BEC6" clippingPlanes={clip ? [clipPlane] : []} />
        </lineSegments>
      )}
    </group>
  );
}

function Redraw({ token }: { token: string }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, token]);
  return null;
}

export default function AnalysisViewport({
  mesh,
  unitScale,
  upAxisMode,
  up,
  view,
  fit,
  aimY,
  span,
  resetKey,
  sync,
  panelId,
  bus,
  showMesh,
  markers,
  evidenceRays,
  fieldCells,
  fieldAnchor,
  fieldOpacity,
  shellCells,
  contextCells,
  cellFeet,
  opacity,
  clip,
  cutSegments,
  guideSegments = [],
  guideColor = "#1293C2",
  dimensionSegments = [],
  volumeTriangles = null,
  layers = [],
  discardedNormal,
  label,
  showMeasurementText = false,
  showFills = true,
  showEdges = true,
  arrowOpacity = 1,
  volumeOpacity = 1,
  arrowWidth = 1,
}: {
  mesh: ImportedObj;
  unitScale: number;
  upAxisMode: UpAxisMode;
  up: UpAxis;
  view: AnalysisView;
  fit: number;
  aimY: number;
  span: number;
  resetKey: number;
  sync: boolean;
  panelId: string;
  bus: CameraBus;
  showMesh: boolean;
  markers: Array<{ center: Vec3; color: string; scale?: number }>;
  evidenceRays: Array<{ a: Vec3; b: Vec3; color: string; blocked: boolean; selected?: boolean; prominent?: boolean }>;
  fieldCells: Array<[number, number, number]> | null;
  fieldAnchor: Vec3 | null;
  fieldOpacity: number | null;
  shellCells: Array<[number, number, number]> | null;
  contextCells: Array<[number, number, number]> | null;
  cellFeet: number;
  opacity: number;
  clip: ClipPlane | null;
  cutSegments: Segment[];
  guideSegments?: Segment[];
  guideColor?: string;
  dimensionSegments?: Segment[];
  volumeTriangles?: Float32Array | null;
  /** v4 evidence layers in spec feet. */
  layers?: EvidenceLayer[];
  discardedNormal: Vec3 | null;
  label: string;
  /** Entry ids, sequence numbers, and dimension text. Off for the default 3D views. */
  showMeasurementText?: boolean;
  showFills?: boolean;
  showEdges?: boolean;
  arrowOpacity?: number;
  volumeOpacity?: number;
  arrowWidth?: number;
}) {
  const preset = presetCamera(view, fit, aimY, discardedNormal ?? undefined);
  return (
    <Canvas
      key={`${view}:${clip ? "clip" : "full"}`}
      frameloop="demand"
      dpr={[1, 1.25]}
      performance={{ min: 0.5, debounce: 200 }}
      flat
      orthographic={preset.projection === "orthographic"}
      camera={{
        position: preset.position,
        fov: 40,
        near: 0.1,
        far: 8000,
        zoom: 1,
      }}
      gl={{
        alpha: false,
        antialias: true,
        powerPreference: "high-performance",
        localClippingEnabled: true,
        preserveDrawingBuffer: true,
      }}
      aria-label={label}
      style={{ width: "100%", height: "100%", minHeight: 360, background: "#000" }}
    >
      <CameraRig
        view={view}
        fit={fit}
        aimY={aimY}
        span={span}
        resetKey={resetKey}
        sync={sync}
        panelId={panelId}
        bus={bus}
        discardedNormal={viewUsesClip(view) ? discardedNormal : null}
      />
      <ambientLight intensity={1} />
      <AnalyticalMesh
        mesh={mesh}
        unitScale={unitScale}
        upAxisMode={upAxisMode}
        up={up}
        showMesh={showMesh}
        markers={markers}
        evidenceRays={evidenceRays}
        fieldCells={fieldCells}
        fieldAnchor={fieldAnchor}
        fieldOpacity={fieldOpacity}
        shellCells={shellCells}
        contextCells={contextCells}
        cellFeet={cellFeet}
        opacity={opacity}
        clip={clip}
        cutSegments={cutSegments}
        guideSegments={guideSegments}
        guideColor={guideColor}
        dimensionSegments={dimensionSegments}
        volumeTriangles={volumeTriangles}
        layers={layers}
        showMeasurementText={showMeasurementText}
        showFills={showFills}
        showEdges={showEdges}
        arrowOpacity={arrowOpacity}
        volumeOpacity={volumeOpacity}
        arrowWidth={arrowWidth}
      />
      <OrbitControls makeDefault target={preset.target} enableDamping={false} />
      <Redraw token={`${showMesh}:${opacity}:${markers.length}:${fieldCells?.length ?? 0}:${shellCells?.length ?? 0}:${contextCells?.length ?? 0}:${guideSegments.length}:${dimensionSegments.length}:${volumeTriangles?.length ?? 0}:${layers.map((layer) => layer.id).join("|")}:${guideColor}:${fieldOpacity ?? ""}:${cutSegments.length}:${clip?.constant ?? "none"}:${clip?.normal.join(",") ?? ""}:${showMeasurementText}:${showFills}:${showEdges}:${arrowOpacity}:${volumeOpacity}:${arrowWidth}`} />
    </Canvas>
  );
}
