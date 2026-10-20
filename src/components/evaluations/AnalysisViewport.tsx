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
import { specFeetToFile, type Vec3 } from "./geometryView";
import { freeCellShell } from "./openVolumeDisplay";
import type { Segment } from "./meshSection";
import type { EvidenceLayer } from "./v4/evidence";

/** Radius of evidence polylines and arrows in feet. Thin on purpose. */
const LAYER_TUBE_FEET = 0.16;
const LAYER_POINT_FEET = 0.42;

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
  const unit = new THREE.CylinderGeometry(radius, radius, 1, 5, 1, true);
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
    const publish = () => {
      if (!sync || bus.applying) return;
      bus.pose = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [orbit.target.x, orbit.target.y, orbit.target.z],
        zoom: camera.zoom,
      };
      bus.source = panelId;
      bus.listeners.forEach((listener) => listener(panelId));
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
}) {
  const group = useRef<THREE.Group>(null);
  const markerAnchor = useRef<THREE.Group>(null);
  const layerAnchor = useRef<THREE.Group>(null);
  const geometry = useMemo(() => buildCompleteFileGeometry(mesh), [mesh]);
  const clipPlane = useMemo(() => new THREE.Plane(), []);
  const meshMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#F7F6F5",
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.FrontSide,
  }), []);
  const fieldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#D6AD4F",
    roughness: 0.58,
    metalness: 0.04,
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
  const shellMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#71BEDA",
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);
  const contextMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0E6F92",
    roughness: 0.7,
    metalness: 0,
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
    const field = Boolean(fieldCells?.length);
    const showVolume = Boolean(volumeTriangles?.length) || layers.length > 0;
    const revealInterior = showVolume;
    const ghost = revealInterior || (field && !clip);
    const revealMarkers = !clip && markers.length > 0 && !field && !showVolume;
    meshMaterial.transparent = ghost || revealMarkers;
    meshMaterial.opacity = revealInterior ? (clip ? 0.62 : 0.78) : ghost ? 0.9 : 1;
    meshMaterial.depthWrite = !revealInterior && !ghost && !revealMarkers;
    meshMaterial.side = clip || revealInterior ? THREE.DoubleSide : THREE.FrontSide;
    const gold = fieldOpacity ?? (clip ? 0.55 : 0.42);
    const sectionFloor = fieldOpacity != null && fieldOpacity < 0.25 ? fieldOpacity : 0.5;
    fieldMaterial.opacity = clip ? Math.max(gold, sectionFloor) : gold;
    fieldMaterial.depthWrite = false;
    volumeMaterial.opacity = fieldOpacity ?? 0.38;
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
  }, [clip, clipPlane, contextMaterial, fieldCells, fieldMaterial, fieldOpacity, layers.length, markers.length, meshMaterial, shellMaterial, volumeMaterial, volumeTriangles]);

  // v4 evidence layers: patches, lines, polylines, arrows, points, and dimension text, all in spec feet.
  useEffect(() => {
    const anchor = layerAnchor.current;
    if (!anchor) return;
    for (const child of [...anchor.children]) anchor.remove(child);
    const disposers: Array<() => void> = [];
    const toFile = (point: Vec3) => new THREE.Vector3(...specFeetToFile(point, up, unitScale));
    const clippingPlanes = clip ? [clipPlane] : [];
    const feet = 1 / (unitScale || 1);
    const sphere = new THREE.SphereGeometry(LAYER_POINT_FEET * feet, 12, 10);
    const cone = new THREE.ConeGeometry(LAYER_TUBE_FEET * 3.2 * feet, LAYER_TUBE_FEET * 9 * feet, 10);
    disposers.push(() => sphere.dispose(), () => cone.dispose());
    const yAxis = new THREE.Vector3(0, 1, 0);
    layers.forEach((layer, order) => {
      const renderOrder = 4 + order;
      if ((layer.kind === "patch" || layer.kind === "volume") && layer.triangles?.length) {
        const positions = new Float32Array(layer.triangles.length);
        for (let index = 0; index < layer.triangles.length; index += 3) {
          const file = specFeetToFile([layer.triangles[index], layer.triangles[index + 1], layer.triangles[index + 2]], up, unitScale);
          positions[index] = file[0];
          positions[index + 1] = file[1];
          positions[index + 2] = file[2];
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const material = new THREE.MeshBasicMaterial({
          color: layer.color,
          transparent: true,
          opacity: layer.opacity ?? (layer.kind === "volume" ? 0.14 : 0.55),
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          clippingPlanes,
        });
        const patch = new THREE.Mesh(geometry, material);
        patch.frustumCulled = false;
        patch.renderOrder = renderOrder;
        anchor.add(patch);
        disposers.push(() => geometry.dispose(), () => material.dispose());
      }
      const lineMaterial = () => layer.lineStyle === "dashed"
        ? new THREE.LineDashedMaterial({ color: layer.color, dashSize: 0.5 * feet, gapSize: 0.3 * feet, depthTest: false, transparent: true, opacity: 0.9, clippingPlanes })
        : new THREE.LineBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: 0.95, clippingPlanes });
      const segmentPairs: Array<[Vec3, Vec3]> = [];
      for (const segment of layer.segments ?? []) segmentPairs.push([segment.a, segment.b]);
      if (showMeasurementText) {
        for (const dimension of layer.dimensions ?? []) if (dimension.a !== dimension.b) segmentPairs.push([dimension.a, dimension.b]);
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
        if (layer.lineStyle === "dashed") lines.computeLineDistances();
        lines.frustumCulled = false;
        lines.renderOrder = renderOrder;
        anchor.add(lines);
        disposers.push(() => geometry.dispose(), () => material.dispose());
      }
      const tubes: THREE.Vector3[][] = [];
      for (const polyline of layer.polylines ?? []) tubes.push(polyline.map(toFile));
      for (const arrow of layer.arrows ?? []) tubes.push([toFile(arrow.a), toFile(arrow.b)]);
      if (tubes.length) {
        const geometry = tubeGeometry(tubes, LAYER_TUBE_FEET * feet);
        if (geometry) {
          const material = new THREE.MeshBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: layer.status === "potential" ? 0.6 : 0.95, clippingPlanes });
          const tube = new THREE.Mesh(geometry, material);
          tube.frustumCulled = false;
          tube.renderOrder = renderOrder + 1;
          anchor.add(tube);
          disposers.push(() => geometry.dispose(), () => material.dispose());
        }
      }
      if (layer.arrows?.length) {
        const material = new THREE.MeshBasicMaterial({ color: layer.color, depthTest: false, clippingPlanes });
        disposers.push(() => material.dispose());
        for (const arrow of layer.arrows) {
          const start = toFile(arrow.a);
          const end = toFile(arrow.b);
          const delta = end.clone().sub(start);
          const length = delta.length();
          if (length < 1e-4) continue;
          const direction = delta.multiplyScalar(1 / length);
          const head = new THREE.Mesh(cone, material);
          head.quaternion.setFromUnitVectors(yAxis, direction);
          head.position.copy(end).sub(direction.clone().multiplyScalar(LAYER_TUBE_FEET * 4.5 * feet));
          head.frustumCulled = false;
          head.renderOrder = renderOrder + 2;
          anchor.add(head);
        }
      }
      if (layer.points?.length) {
        const material = new THREE.MeshBasicMaterial({ color: layer.color, depthTest: false, transparent: true, opacity: 0.95, clippingPlanes });
        disposers.push(() => material.dispose());
        layer.points.forEach((point, index) => {
          const dot = new THREE.Mesh(sphere, material);
          dot.position.copy(toFile(point));
          dot.frustumCulled = false;
          dot.renderOrder = renderOrder + 2;
          anchor.add(dot);
          const label = showMeasurementText ? layer.pointLabels?.[index] : undefined;
          if (label && index < 80) {
            const made = textSprite(label, layer.color, 1.6 * feet);
            if (made) {
              made.sprite.position.copy(dot.position).add(new THREE.Vector3(0, 1.1 * feet, 0));
              anchor.add(made.sprite);
              disposers.push(made.dispose);
            }
          }
        });
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
  }, [clip, clipPlane, invalidate, layers, showMeasurementText, unitScale, up]);

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
      {showMesh && <mesh geometry={geometry} material={meshMaterial} renderOrder={3} />}
      {volumeGeometry && <mesh geometry={volumeGeometry} material={volumeMaterial} renderOrder={4} />}
      <group ref={markerAnchor} renderOrder={2} />
      <group ref={rayAnchor} renderOrder={3} />
      <group ref={layerAnchor} renderOrder={4} />
      {cutSegments.length > 0 && (
        <lineSegments geometry={cutGeometry} renderOrder={3}>
          <lineBasicMaterial color="#F7F6F5" />
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
}) {
  const preset = presetCamera(view, fit, aimY, discardedNormal ?? undefined);
  return (
    <Canvas
      key={`${view}:${clip ? "clip" : "full"}`}
      frameloop="demand"
      orthographic={preset.projection === "orthographic"}
      camera={{
        position: preset.position,
        fov: 40,
        near: 0.1,
        far: 8000,
        zoom: 1,
      }}
      gl={{ localClippingEnabled: true, preserveDrawingBuffer: true }}
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
      <ambientLight intensity={0.75} />
      <directionalLight position={[40, 80, 30]} intensity={1.15} />
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
      />
      <OrbitControls makeDefault target={preset.target} enableDamping={false} />
      <Redraw token={`${showMesh}:${opacity}:${markers.length}:${fieldCells?.length ?? 0}:${shellCells?.length ?? 0}:${contextCells?.length ?? 0}:${guideSegments.length}:${dimensionSegments.length}:${volumeTriangles?.length ?? 0}:${layers.map((layer) => layer.id).join("|")}:${guideColor}:${fieldOpacity ?? ""}:${cutSegments.length}:${clip?.constant ?? "none"}:${clip?.normal.join(",") ?? ""}`} />
    </Canvas>
  );
}
