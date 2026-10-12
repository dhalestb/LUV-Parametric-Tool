"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildCompleteFileGeometry, IDENTITY_PLACEMENT, tileRootMatrix } from "../lattice/objFidelity";
import type { ImportedObj, UpAxis, UpAxisMode } from "../lattice/types";
import {
  ANALYSIS_GOLD,
  ANALYSIS_MARKER_SCALE,
  ANALYSIS_OPACITY_STANDARD,
  orthographicHalf,
  presetCamera,
  viewUsesClip,
  type AnalysisView,
  type ClipPlane,
} from "./analysisViewer";
import { specFeetToFile, type Vec3 } from "./geometryView";
import type { Segment } from "./meshSection";

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
  cellFeet,
  opacity,
  clip,
  cutSegments,
}: {
  mesh: ImportedObj;
  unitScale: number;
  upAxisMode: UpAxisMode;
  up: UpAxis;
  showMesh: boolean;
  markers: Vec3[];
  cellFeet: number;
  opacity: number;
  clip: ClipPlane | null;
  cutSegments: Segment[];
}) {
  const group = useRef<THREE.Group>(null);
  const marks = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildCompleteFileGeometry(mesh), [mesh]);
  const clipPlane = useMemo(() => new THREE.Plane(), []);
  const meshMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#e8e4dc",
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.FrontSide,
  }), []);
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: ANALYSIS_GOLD,
    transparent: true,
    opacity: ANALYSIS_OPACITY_STANDARD,
    depthWrite: false,
  }), []);
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

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => cutGeometry.dispose(), [cutGeometry]);
  useEffect(() => () => {
    meshMaterial.dispose();
    markerMaterial.dispose();
  }, [markerMaterial, meshMaterial]);

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
    meshMaterial.side = clip ? THREE.DoubleSide : THREE.FrontSide;
    if (!clip) {
      meshMaterial.clippingPlanes = [];
      markerMaterial.clippingPlanes = [];
    } else {
      clipPlane.normal.set(clip.normal[0], clip.normal[1], clip.normal[2]);
      clipPlane.constant = clip.constant;
      meshMaterial.clippingPlanes = [clipPlane];
      markerMaterial.clippingPlanes = [clipPlane];
    }
    meshMaterial.needsUpdate = true;
    markerMaterial.needsUpdate = true;
    markerMaterial.opacity = opacity;
  }, [clip, clipPlane, markerMaterial, meshMaterial, opacity]);

  useEffect(() => {
    const marksMesh = marks.current;
    if (!marksMesh) return;
    const dummy = new THREE.Object3D();
    markers.forEach((center, index) => {
      const file = specFeetToFile(center, up, unitScale);
      dummy.position.set(file[0], file[1], file[2]);
      dummy.updateMatrix();
      marksMesh.setMatrixAt(index, dummy.matrix);
    });
    marksMesh.count = markers.length;
    marksMesh.instanceMatrix.needsUpdate = true;
  }, [markers, unitScale, up]);

  const markerSize = (cellFeet / (unitScale || 1)) * ANALYSIS_MARKER_SCALE;

  return (
    <group ref={group}>
      {showMesh && <mesh geometry={geometry} material={meshMaterial} />}
      {markers.length > 0 && (
        <instancedMesh key={markers.length} ref={marks} args={[undefined, undefined, Math.max(markers.length, 1)]} material={markerMaterial}>
          <boxGeometry args={[markerSize, markerSize, markerSize]} />
        </instancedMesh>
      )}
      {cutSegments.length > 0 && (
        <lineSegments geometry={cutGeometry} renderOrder={2}>
          <lineBasicMaterial color="#F7F6F5" />
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
  cellFeet,
  opacity,
  clip,
  cutSegments,
  discardedNormal,
  label,
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
  markers: Vec3[];
  cellFeet: number;
  opacity: number;
  clip: ClipPlane | null;
  cutSegments: Segment[];
  discardedNormal: Vec3 | null;
  label: string;
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
        cellFeet={cellFeet}
        opacity={opacity}
        clip={clip}
        cutSegments={cutSegments}
      />
      <OrbitControls makeDefault target={preset.target} enableDamping={false} />
      <Redraw token={`${showMesh}:${opacity}:${markers.length}:${markers[0]?.join(",") ?? ""}:${markers.at(-1)?.join(",") ?? ""}:${cutSegments.length}:${clip?.constant ?? "none"}:${clip?.normal.join(",") ?? ""}`} />
    </Canvas>
  );
}
