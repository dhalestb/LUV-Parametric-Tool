"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { CATEGORY_COLORS, slotById, typologyColor } from "./slots";
import type { CameraMode, ColorMode, ConnectionReport, ContinuityOverlay, DiagnosticMode, ImportedObj, LatticeField, Placement, TileModel, UpAxisMode } from "./types";
import { fileToSpec, LATTICE_FEET, resolvedUp } from "./types";

export type LatticeViewportHandle = { capture: () => string };

type Props = {
  meshes: ImportedObj[];
  models: TileModel[];
  placements: Record<string, Placement>;
  unitScale: number;
  upAxisMode: UpAxisMode;
  field: LatticeField;
  colorMode: ColorMode;
  showLattice: boolean;
  showConnections: boolean;
  cameraMode: CameraMode;
  diagnostic: DiagnosticMode;
  continuityOverlay?: ContinuityOverlay;
  presentation: boolean;
  selectedId: string | null;
  connections: ConnectionReport[];
  onSelect: (id: string) => void;
};

const swap = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function placementMatrix(anchor: [number, number, number], placement: Placement) {
  const translateBack = new THREE.Matrix4().makeTranslation(-anchor[0], -anchor[1], -anchor[2]);
  const mirror = new THREE.Matrix4().makeScale(placement.mirror === "x" ? -1 : 1, placement.mirror === "y" ? -1 : 1, 1);
  const rotation = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(placement.rotation));
  const translate = new THREE.Matrix4().makeTranslation(placement.ix * LATTICE_FEET, placement.iy * LATTICE_FEET, placement.iz * LATTICE_FEET);
  const spec = translate.multiply(rotation).multiply(mirror).multiply(translateBack);
  return swap.clone().multiply(spec).multiply(swap);
}

function geometryKey(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function displayGeometry(mesh: ImportedObj, unitScale: number, upAxisMode: UpAxisMode) {
  const count = mesh.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const up = resolvedUp(mesh.upAxis, upAxisMode);
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = fileToSpec(mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2], up);
    positions[index * 3] = x * unitScale;
    positions[index * 3 + 1] = z * unitScale;
    positions[index * 3 + 2] = y * unitScale;
  }
  const indices: number[] = [];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) indices.push(face.vertices[0], face.vertices[index], face.vertices[index + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Scene({ meshes, models, placements, unitScale, upAxisMode, field, colorMode, showLattice, showConnections, cameraMode, diagnostic, continuityOverlay = "all", presentation, selectedId, connections, onSelect }: Props) {
  const { camera, gl, scene, invalidate } = useThree();
  const geometries = useMemo(() => {
    const map = new Map<string, THREE.BufferGeometry>();
    for (const mesh of meshes) {
      const key = geometryKey(mesh.id);
      if (!map.has(key)) map.set(key, displayGeometry(mesh, unitScale, upAxisMode));
    }
    return map;
  }, [meshes, unitScale, upAxisMode]);
  useEffect(() => {
    return () => {
      geometries.forEach((geometry) => geometry.dispose());
    };
  }, [geometries]);
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);

  const spread = diagnostic === "originals" && !presentation;
  const visibleMeshes = diagnostic === "copies" && !presentation && meshes.length === 0 ? [] : meshes;
  const points = visibleMeshes.map((mesh, index) => {
    const placement = placements[mesh.id];
    const model = modelById.get(mesh.id);
    if (spread) return new THREE.Vector3(index * 40, 0, 0);
    if (!placement || !model) return new THREE.Vector3();
    return new THREE.Vector3(placement.ix * LATTICE_FEET, placement.iz * LATTICE_FEET, placement.iy * LATTICE_FEET);
  });
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(points.length ? 1 / points.length : 1);
  const aimX = presentation ? (field.cellsX * LATTICE_FEET) / 2 : center.x;
  const aimY = presentation ? (field.cellsZ * LATTICE_FEET) / 2 : center.y;
  const aimZ = presentation ? (field.cellsY * LATTICE_FEET) / 2 : center.z;

  useEffect(() => {
    let frame = 0;
    frame = window.requestAnimationFrame(() => {
      const span = Math.max(field.cellsX, field.cellsY, field.cellsZ, 1) * LATTICE_FEET;
      const fit = Math.max(presentation ? 90 : 60, span * (presentation ? 1.2 : 0.85));
      camera.near = Math.max(0.1, fit * 0.001);
      camera.far = Math.max(4000, fit * 10);
      if (cameraMode === "plan") camera.position.set(aimX, aimY + fit * 1.8, aimZ + 0.2);
      else if (cameraMode === "section") camera.position.set(aimX + fit, aimY + span * 0.15, aimZ);
      else camera.position.set(aimX + fit * 0.72, aimY + fit * 0.55, aimZ + fit * 0.72);
      camera.lookAt(aimX, aimY, aimZ);
      camera.updateProjectionMatrix();
      invalidate();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [camera, cameraMode, aimX, aimY, aimZ, field.cellsX, field.cellsY, field.cellsZ, presentation, invalidate]);

  useEffect(() => {
    gl.localClippingEnabled = cameraMode === "section";
    scene.background = new THREE.Color("#000000");
  }, [cameraMode, gl, scene]);

  const clip = useMemo(
    () => (cameraMode === "section" ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), aimZ)] : []),
    [cameraMode, aimZ],
  );
  const latticeGeometry = useMemo(() => {
    const positions: number[] = [];
    const { cellsX, cellsY, cellsZ } = field;
    for (let iz = 0; iz <= cellsZ; iz += 1) {
      for (let ix = 0; ix <= cellsX; ix += 1) {
        positions.push(ix * LATTICE_FEET, iz * LATTICE_FEET, 0, ix * LATTICE_FEET, iz * LATTICE_FEET, cellsY * LATTICE_FEET);
      }
      for (let iy = 0; iy <= cellsY; iy += 1) {
        positions.push(0, iz * LATTICE_FEET, iy * LATTICE_FEET, cellsX * LATTICE_FEET, iz * LATTICE_FEET, iy * LATTICE_FEET);
      }
    }
    for (let ix = 0; ix <= cellsX; ix += 1) {
      for (let iy = 0; iy <= cellsY; iy += 1) {
        positions.push(ix * LATTICE_FEET, 0, iy * LATTICE_FEET, ix * LATTICE_FEET, cellsZ * LATTICE_FEET, iy * LATTICE_FEET);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return geometry;
  }, [field.cellsX, field.cellsY, field.cellsZ]);
  useEffect(() => () => latticeGeometry.dispose(), [latticeGeometry]);
  const connectionGeometry = useMemo(() => {
    if (!showConnections || spread || !connections.length) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const palette = {
      interlock: { PASS: [0.49, 0.81, 0.63], REVIEW: [0.84, 0.68, 0.31], FAIL: [0.77, 0.42, 0.42] },
      floor: [0.35, 0.65, 1.0],
      void: [0.72, 0.45, 0.95],
      circulation: [0.35, 0.9, 0.55],
    } as const;
    const include = (connection: ConnectionReport) => {
      if (diagnostic !== "continuity") return true;
      if (continuityOverlay === "all" || continuityOverlay === "interlock") return connection.interlock !== "FAIL";
      if (continuityOverlay === "floor") return connection.floor !== "FAIL";
      if (continuityOverlay === "void") return connection.void !== "FAIL";
      return connection.circulation !== "FAIL";
    };
    for (const connection of connections) {
      if (!include(connection)) continue;
      const a = placements[connection.tileA];
      const b = placements[connection.tileB];
      if (!a || !b) continue;
      positions.push(a.ix * LATTICE_FEET, a.iz * LATTICE_FEET, a.iy * LATTICE_FEET, b.ix * LATTICE_FEET, b.iz * LATTICE_FEET, b.iy * LATTICE_FEET);
      let color: readonly number[] = palette.interlock[connection.interlock] ?? palette.interlock.FAIL;
      if (diagnostic === "continuity") {
        if (continuityOverlay === "floor") color = palette.floor;
        else if (continuityOverlay === "void") color = palette.void;
        else if (continuityOverlay === "circulation") color = palette.circulation;
        else color = palette.interlock[connection.interlock] ?? palette.interlock.FAIL;
      }
      colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
    }
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geometry;
  }, [connections, placements, showConnections, spread, diagnostic, continuityOverlay]);
  useEffect(() => () => connectionGeometry?.dispose(), [connectionGeometry]);

  const meshItems = useMemo(() => visibleMeshes.map((mesh, index) => {
    const placement = placements[mesh.id] ?? { meshId: mesh.id, slotId: null, rotation: 0 as const, mirror: "none" as const, ix: 0, iy: 0, iz: 0, locked: false };
    const model = modelById.get(mesh.id);
    const slot = slotById(placement.slotId);
    const color = colorMode === "category" ? CATEGORY_COLORS[slot?.category ?? "Gathering"] : colorMode === "typology" ? typologyColor(placement.slotId) : "#f4f4f4";
    const matrix = spread || !model ? new THREE.Matrix4().setPosition(index * 40, 0, 0) : placementMatrix(model.anchor, placement);
    if (spread) matrix.setPosition(index * 40, 0, 0);
    return { mesh, color, matrix };
  }), [visibleMeshes, placements, modelById, colorMode, spread]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[40, 80, 30]} intensity={1.1} />
      {meshItems.map(({ mesh, color, matrix }) => (
        <mesh
          key={mesh.id}
          geometry={geometries.get(geometryKey(mesh.id))}
          matrix={matrix}
          matrixAutoUpdate={false}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(mesh.id);
          }}
        >
          <meshStandardMaterial color={color} roughness={0.72} metalness={0.02} emissive={selectedId === mesh.id ? "#145c60" : "#000000"} clippingPlanes={clip} />
        </mesh>
      ))}
      <lineSegments visible={showLattice} geometry={latticeGeometry} renderOrder={2}>
        <lineBasicMaterial color="#9a9a9a" depthWrite={false} />
      </lineSegments>
      {connectionGeometry && (
        <lineSegments visible={showConnections} geometry={connectionGeometry}>
          <lineBasicMaterial vertexColors />
        </lineSegments>
      )}
      <OrbitControls
        key={cameraMode}
        makeDefault
        target={[aimX, aimY, aimZ]}
        enableDamping={false}
      />
    </>
  );
}

const LatticeViewport = forwardRef<LatticeViewportHandle, Props>(function LatticeViewport(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  useImperativeHandle(ref, () => ({ capture: () => canvasRef.current?.toDataURL("image/png") ?? "" }), [canvasKey]);
  return (
    <Canvas
      key={canvasKey}
      gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [80, 64, 80], fov: 40, near: 0.1, far: 8000 }}
      onCreated={({ gl }) => {
        canvasRef.current = gl.domElement;
        const onLost = () => {
          window.setTimeout(() => setCanvasKey((value) => value + 1), 0);
        };
        gl.domElement.addEventListener("webglcontextlost", onLost, false);
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
});

export default LatticeViewport;
