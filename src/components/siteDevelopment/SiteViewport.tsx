"use client";

import {DisplayModeSelector} from '../polygonExperiment/architecturalDisplay';
import {writeSiteSelection,selectionDefault} from '../polygonExperiment/orientationStore';
import {OrientationGeometry,useSiteOrientation} from '../polygonExperiment/OrientationScene';
import SharedAlternatives,{useSceneLayers,usePublished} from "../polygonExperiment/SharedAlternatives";
import { Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildFileSpaceGeometries, IDENTITY_PLACEMENT, tileRootMatrix } from "../lattice/objFidelity";
import { typologyColor } from "../lattice/slots";
import type { ImportedObj, TileModel, UnitName, UpAxisMode } from "../lattice/types";
import { UNIT_TO_FEET } from "../lattice/types";
import { drawingToolsActive, polygonClosed, polygonOpen, rayIntersectXzPlane, type Point } from "./geometry";
import type { ClusterZone, PlacementAnchor, PointerKind, SiteAssemblyConnector, SiteCluster, SiteTool, ViewCorridor } from "./types";

export type SiteViewMode = "top" | "iso" | "perspective";
/** Viewer verification layers for coverage geometry. */
export type SiteOverlayMode = "forms" | "architectural-footprints" | "collision-envelopes" | "compare";

type Props = {
  orientationSource: import("./types").SiteDevelopmentProject;
  siteRoot: THREE.Group | null;
  feetPerModel: number;
  /** World Y (ft) of the Site/gold surface datum — zone overlays and drafts track this elevation. */
  siteSurfaceDatumY?: number;
  layers: Array<{ id: string; name: string; visible: boolean }>;
  zones: ClusterZone[];
  exclusions: ClusterZone[];
  anchors: PlacementAnchor[];
  corridors: ViewCorridor[];
  clusters: SiteCluster[];
  assemblyConnectors?: SiteAssemblyConnector[];
  meshes: ImportedObj[];
  models: TileModel[];
  latticeUnit: UnitName;
  upAxisMode: UpAxisMode;
  view: SiteViewMode;
  tool: SiteTool;
  overlayMode?: SiteOverlayMode;
  /** World cells counted toward architectural coverage (same raster as numeric union). */
  footprintCells?: Array<{ x: number; z: number; cellFeet: number }>;
  footprintPerForm?: Array<{ id: string; x: number; z: number; area: number; envelopeArea: number }>;
  collisionEnvelopes?: Array<{ id: string; ring: Point[] }>;
  coverageSummary?: Array<{
    zoneId: string;
    zoneName: string;
    usableArea: number;
    achievedFootprintArea: number;
    targetFootprintArea: number;
    achievedCoverage: number;
    targetCoverage: number;
  }>;
  selectedZoneId: string | null;
  selectedClusterId: string | null;
  draft: Point[];
  cursor: Point | null;
  aim: [number, number, number];
  span: number;
  onSelectZone: (id: string | null) => void;
  onSelectCluster: (id: string | null) => void;
  onPointer: (point: Point, event: { type: PointerKind; shift: boolean }) => void;
};

function AssemblyConnectorMesh({ connector }: { connector: SiteAssemblyConnector }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(connector.positions, 3));
    geo.setIndex(connector.indices);
    geo.computeVertexNormals();
    return geo;
  }, [connector]);
  return (
    <mesh geometry={geometry} raycast={() => {}}>
      <meshStandardMaterial color="#c4a35a" transparent opacity={0.72} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function shapeGeometry(points: Point[]) {
  const ring = polygonOpen(points);
  if (ring.length < 3) return null;
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function SiteTile({ mesh, cluster, unitScale, upAxisMode, selected }: {
  mesh: ImportedObj;
  cluster: SiteCluster;
  unitScale: number;
  upAxisMode: UpAxisMode;
  selected: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const geos = useMemo(() => buildFileSpaceGeometries(mesh), [mesh]);
  useEffect(() => {
    if (!group.current) return;
    const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id, cluster.slotId), unitScale, upAxisMode, { register: true, applyUnitAndUp: true });
    // Guarantee the foundation datum (min display Y) sits at the parent origin.
    // Parent Y is the Site-surface elevation (+ user offset); do not leave residual registration lift.
    const probe = new THREE.Vector3();
    let minY = Infinity;
    for (const { geometry } of geos) {
      const positions = geometry.getAttribute("position");
      if (!positions) continue;
      for (let i = 0; i < positions.count; i += 1) {
        probe.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        if (probe.y < minY) minY = probe.y;
      }
    }
    if (Number.isFinite(minY) && Math.abs(minY) > 1e-4) {
      matrix.premultiply(new THREE.Matrix4().makeTranslation(0, -minY, 0));
    }
    group.current.matrix.copy(matrix);
    group.current.matrixAutoUpdate = false;
    group.current.updateMatrixWorld(true);
    // geos is memoized from mesh; keep this dependency list length stable for Fast Refresh.
  }, [mesh, cluster.slotId, unitScale, upAxisMode]);
  useEffect(() => () => geos.forEach((item) => item.geometry.dispose()), [geos]);
  return (
    <group position={[cluster.x, cluster.elevation, cluster.z]} rotation={[0, cluster.yawDeg * Math.PI / 180, 0]}>
      <group ref={group}>
        {geos.map(({ name, geometry }) => (
          <mesh key={`${cluster.id}:${name}`} geometry={geometry}>
            <meshStandardMaterial color={typologyColor(cluster.slotId)} roughness={0.68} metalness={0.04} emissive={selected ? "#145c60" : "#000"} />
          </mesh>
        ))}
      </group>
      {(selected || cluster.yawAdjustedFromPreferred) && (
        <Html center distanceFactor={80} style={{ pointerEvents: "none", whiteSpace: "nowrap", fontSize: 10, color: "#ffe6a8", textShadow: "0 0 4px #000" }}>
          {cluster.typology ?? cluster.slotId ?? "form"} · yaw {cluster.yawDeg.toFixed(0)}°
          {cluster.yawAdjustedFromPreferred ? " ★" : ""}
        </Html>
      )}
    </group>
  );
}

function DrawingCapture({ enabled, onPointer }: { enabled: boolean; onPointer: Props["onPointer"] }) {
  const { camera, gl } = useThree();
  const onPointerRef = useRef(onPointer);
  onPointerRef.current = onPointer;
  useEffect(() => {
    if (!enabled) return;
    const element = gl.domElement;
    const ndc = new THREE.Vector2();
    const toSite = (clientX: number, clientY: number): Point | null => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      camera.updateMatrixWorld(true);
      const origin = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
      const farPoint = new THREE.Vector3(ndc.x, ndc.y, 1).unproject(camera);
      const direction = farPoint.sub(origin);
      const length = direction.length();
      if (length < 1e-9) return null;
      direction.multiplyScalar(1 / length);
      return rayIntersectXzPlane([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z]);
    };
    const emit = (event: PointerEvent | MouseEvent, type: PointerKind) => {
      // Left button only — right-drag is reserved for OrbitControls pan.
      if ("button" in event && event.button !== 0 && type !== "pointermove") return;
      if (type === "pointermove" && (event as PointerEvent).buttons === 2) return;
      const point = toSite(event.clientX, event.clientY);
      if (!point) return;
      if (type !== "pointermove") event.preventDefault();
      onPointerRef.current(point, { type, shift: event.shiftKey });
    };
    const onDown = (event: PointerEvent) => emit(event, "pointerdown");
    const onMove = (event: PointerEvent) => emit(event, "pointermove");
    const onDbl = (event: MouseEvent) => emit(event, "dblclick");
    const onContext = (event: Event) => event.preventDefault();
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("dblclick", onDbl);
    element.addEventListener("contextmenu", onContext);
    element.style.cursor = "crosshair";
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("dblclick", onDbl);
      element.removeEventListener("contextmenu", onContext);
      element.style.cursor = "";
    };
  }, [camera, enabled, gl]);
  return null;
}

function Cameras({ view, span }: { view: SiteViewMode; span: number }) {
  const fit = Math.max(80, span * 0.7);
  const far = Math.max(20000, fit * 30);
  // Position is applied by Aim when aim/view/span change — avoid prop-binding that
  // would fight OrbitControls pan on every parent re-render (e.g. cursor updates).
  if (view === "top") {
    // Do not bind `zoom` as a React prop — parent re-renders (cursor/draft) would
    // reset OrbitControls wheel zoom on every frame.
    return (
      <OrthographicCamera
        key="top"
        makeDefault
        up={[0, 0, -1]}
        near={1}
        far={far}
      />
    );
  }
  if (view === "iso") {
    return <PerspectiveCamera key="iso" makeDefault fov={38} near={1} far={far} />;
  }
  return <PerspectiveCamera key="perspective" makeDefault fov={42} near={1} far={far} />;
}

function Aim({ view, aim, span }: { view: SiteViewMode; aim: [number, number, number]; span: number }) {
  const get = useThree((state) => state.get);
  const controls = useThree((state) => state.controls);
  // Value-stable key — parent often rebuilds the aim tuple each render.
  const aimKey = `${view}|${span.toFixed(2)}|${aim[0].toFixed(2)},${aim[1].toFixed(2)},${aim[2].toFixed(2)}`;
  useEffect(() => {
    const { camera } = get();
    const fit = Math.max(80, span * 0.7);
    if (view === "top") {
      camera.up.set(0, 0, -1);
      camera.position.set(aim[0], Math.max(aim[1], 0) + fit * 2.4, aim[2]);
      if ("isOrthographicCamera" in camera && (camera as THREE.OrthographicCamera).isOrthographicCamera) {
        (camera as THREE.OrthographicCamera).zoom = Math.max(0.03, 480 / fit);
      }
    } else if (view === "iso") {
      camera.up.set(0, 1, 0);
      camera.position.set(aim[0] + fit * 0.9, aim[1] + fit * 0.75, aim[2] + fit * 0.9);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(aim[0], aim[1] + fit * 0.35, aim[2] + fit * 1.4);
    }
    camera.userData.siteViewKey = aimKey;
    camera.lookAt(aim[0], aim[1], aim[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    // Re-run when OrbitControls mounts (controls goes null → instance) so target matches aim.
    const orbit = (controls ?? get().controls) as (THREE.EventDispatcher & { target?: THREE.Vector3; update?: () => void }) | null;
    if (orbit?.target && typeof orbit.update === "function") {
      orbit.target.set(aim[0], aim[1], aim[2]);
      try { const saved=JSON.parse(localStorage.getItem('luv-experiment-site-camera-v1')??'null');if(saved?.key===aimKey){camera.position.fromArray(saved.position);orbit.target.fromArray(saved.target);if('zoom' in camera)(camera as THREE.PerspectiveCamera).zoom=saved.zoom;camera.updateProjectionMatrix();} } catch {}
      orbit.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- aimKey encodes aim/span/view
  }, [aimKey, get, controls]);
  return null;
}

/**
 * Top / drawing: right-drag pans in screen space. Reads camera/controls live from the
 * R3F store so view switches do not leave a stale OrbitControls target that snaps pan back.
 * OrbitControls still owns zoom and iso/perspective rotate.
 */
function TopViewRightPan({ active }: { active: boolean }) {
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (!active) return;
    const element = gl.domElement;
    let dragging = false;
    let prevX = 0;
    let prevY = 0;
    const offset = new THREE.Vector3();
    const xAxis = new THREE.Vector3();
    const yAxis = new THREE.Vector3();

    const onContext = (event: Event) => event.preventDefault();
    const onDown = (event: PointerEvent) => {
      if (event.button !== 2) return;
      dragging = true;
      prevX = event.clientX;
      prevY = event.clientY;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic / restricted events */
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - prevX;
      const dy = event.clientY - prevY;
      prevX = event.clientX;
      prevY = event.clientY;
      if (dx === 0 && dy === 0) return;
      const { camera, controls } = get();
      camera.updateMatrixWorld(true);
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      const orbit = controls as { target?: THREE.Vector3; update?: () => void } | null;
      if ("isOrthographicCamera" in camera && (camera as THREE.OrthographicCamera).isOrthographicCamera) {
        const ortho = camera as THREE.OrthographicCamera;
        const worldW = (ortho.right - ortho.left) / ortho.zoom;
        const worldH = (ortho.top - ortho.bottom) / ortho.zoom;
        xAxis.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar((-dx * worldW) / width);
        yAxis.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar((dy * worldH) / height);
      } else {
        const target = orbit?.target ?? new THREE.Vector3();
        const distance = camera.position.distanceTo(target);
        const fov = "fov" in camera ? (camera as THREE.PerspectiveCamera).fov : 50;
        const half = Math.tan((fov * Math.PI) / 360) * Math.max(distance, 1);
        xAxis.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar((-dx * 2 * half) / height);
        yAxis.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar((dy * 2 * half) / height);
      }
      offset.copy(xAxis).add(yAxis);
      camera.position.add(offset);
      orbit?.target?.add(offset);
      orbit?.update?.();
      event.preventDefault();
    };
    const onUp = (event: PointerEvent) => {
      if (!dragging || event.button !== 2) return;
      dragging = false;
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };
    // Capture phase so we win over DrawingCapture / OrbitControls for right-button only.
    element.addEventListener("pointerdown", onDown, true);
    element.addEventListener("pointermove", onMove, true);
    element.addEventListener("pointerup", onUp, true);
    element.addEventListener("pointercancel", onUp, true);
    element.addEventListener("contextmenu", onContext);
    return () => {
      element.removeEventListener("pointerdown", onDown, true);
      element.removeEventListener("pointermove", onMove, true);
      element.removeEventListener("pointerup", onUp, true);
      element.removeEventListener("pointercancel", onUp, true);
      element.removeEventListener("contextmenu", onContext);
    };
  }, [active, get, gl]);
  return null;
}

/** Always-on pan/zoom; top locks rotation; drawing tools keep left-click free for vertices. */
function SiteOrbitControls({ view, drawing }: { view: SiteViewMode; drawing: boolean }) {
  const top = view === "top";
  const getScene = useThree(state=>state.get);
  const saveCamera=()=>{const {camera,controls}=getScene();const orbit=controls as unknown as {target:THREE.Vector3};if(!orbit?.target)return;localStorage.setItem('luv-experiment-site-camera-v1',JSON.stringify({key:camera.userData.siteViewKey,position:camera.position.toArray(),target:orbit.target.toArray(),zoom:(camera as THREE.PerspectiveCamera).zoom}));};
  useEffect(() => {
    const onContext = (event: Event) => event.preventDefault();
    // Prevent the browser menu from eating right-drag pan on the viewport.
    const canvas = document.querySelector("canvas");
    canvas?.addEventListener("contextmenu", onContext);
    return () => canvas?.removeEventListener("contextmenu", onContext);
  }, []);
  return (
    <OrbitControls
      makeDefault
      onEnd={saveCamera}
      enableDamping={false}
      enablePan
      enableZoom
      enableRotate={!top && !drawing}
      screenSpacePanning
      minDistance={20}
      maxDistance={1e7}
      // No artificial pan bounds — entire imported site remains reachable.
      mouseButtons={{
        LEFT: top || drawing ? -1 as unknown as THREE.MOUSE : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: top || drawing ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}

function SiteModel({root,scale,layers,drawing}:{root:THREE.Group;scale:number;layers:Props['layers'];drawing:boolean}) {
  const model = useMemo(() => root.clone(true), [root]);
  useLayoutEffect(() => {
    const visibility = new Map(layers.map(layer => [layer.name, layer.visible]));
    model.children.forEach(child => { child.visible = visibility.get(child.name) ?? true; });
    model.traverse(child => {
      if (drawing) child.raycast = () => {};
      else Reflect.deleteProperty(child, "raycast");
    });
  }, [model,layers,drawing]);
  return <primitive object={model} scale={scale} dispose={null}/>;
}

export default function SiteViewport(props: Props) {
  const scene=useSceneLayers();
  const orientation=useSiteOrientation(props.zones, JSON.stringify(props.orientationSource));
  const published=usePublished();
  const drawing = drawingToolsActive(props.tool);
  const unitScale = UNIT_TO_FEET[props.latticeUnit];


  const meshById = useMemo(() => new Map(props.meshes.map((mesh) => [mesh.id, mesh])), [props.meshes]);
  const preview = props.cursor && props.draft.length ? [...props.draft, props.cursor] : props.draft;
  const overlayY = (props.siteSurfaceDatumY ?? 0) + 0.35;
  const overlayMode = props.overlayMode ?? "forms";
  const showForms = scene.layers.clusters && published.showOriginal && (!published.visible || published.compare) && (overlayMode === "forms" || overlayMode === "compare");
  const showFootprints = overlayMode === "architectural-footprints" || overlayMode === "compare";
  const showEnvelopes = overlayMode === "collision-envelopes" || overlayMode === "compare";
  const footprintCells = props.footprintCells ?? [];
  const collisionEnvelopes = props.collisionEnvelopes ?? [];
  const formOpacity = overlayMode === "compare" ? 0.35 : 1;

  return (
    <><div style={{position:'absolute',top:8,right:8,zIndex:20,background:'var(--panel-background)',padding:8,fontSize:11}}>{(['model','polygons','clusters'] as const).map(key=><label key={key} style={{marginRight:10}}><input type='checkbox' aria-label={'Shared viewport '+key} checked={scene.layers[key]} onChange={()=>scene.toggle(key)}/>{key}</label>)}<span>One world-space camera · territories are previews</span><DisplayModeSelector/><p role="status" aria-label="C1 shared visibility" style={{maxWidth:480,marginBottom:0}}>{orientation.message}</p>{orientation.grouped&&<button onClick={()=>writeSiteSelection(selectionDefault)}>Hide combined designs</button>}</div><Canvas gl={{ antialias: true, alpha: false }} style={{ width: "100%", height: "100%", background: "#000", cursor: drawing ? "crosshair" : "default" }} onPointerMissed={() => { if (!drawing) { props.onSelectZone(null); props.onSelectCluster(null); } }}>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[80, 140, 40]} intensity={1.1} />
      <directionalLight position={[-40, 60, -80]} intensity={0.25} />
      <Cameras view={props.view} span={props.span} />
      <Aim view={props.view} aim={props.aim} span={props.span} />
      <DrawingCapture enabled={drawing} onPointer={props.onPointer} />
      <group visible={scene.layers.model}>{props.siteRoot&&<SiteModel root={props.siteRoot} scale={props.feetPerModel} layers={props.layers} drawing={drawing}/>}</group>
      <SharedAlternatives datum={props.siteSurfaceDatumY??0} zones={props.zones}/>{orientation.records.map(r=><OrientationGeometry key={r.id} result={r} view={orientation.view}/>)}
      {props.zones.filter((zone) => scene.layers.polygons && zone.visible !== false).map((zone) => {
        const geometry = shapeGeometry(zone.polygon);
        const ring = polygonClosed(zone.polygon).map(([x, z]) => [x, overlayY + 0.15, z] as [number, number, number]);
        const selected = props.selectedZoneId === zone.id;
        const summary = (props.coverageSummary ?? []).find((item) => item.zoneId === zone.id);
        return (
          <group key={zone.id} onClick={(event) => { if (drawing) return; event.stopPropagation(); props.onSelectZone(zone.id); }}>
            {geometry && (
              <mesh geometry={geometry} position={[0, overlayY, 0]} raycast={drawing ? () => {} : undefined}>
                <meshStandardMaterial color={zone.color} transparent opacity={selected ? 0.42 : zone.enabled === false ? 0.08 : 0.18} depthWrite={false} />
              </mesh>
            )}
            {ring.length > 1 && <Line points={ring} color={zone.enabled === false ? "#666666" : zone.color} lineWidth={selected ? 3 : 1.5} />}
            {showFootprints && summary && selected && (
              <group position={[polygonOpen(zone.polygon)[0]?.[0] ?? 0, overlayY + 12, polygonOpen(zone.polygon)[0]?.[1] ?? 0]}>
                <mesh raycast={() => {}}>
                  <boxGeometry args={[0.01, 0.01, 0.01]} />
                  <meshBasicMaterial color="#8ff2f4" />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
      {props.exclusions.map((zone) => {
        const geometry = shapeGeometry(zone.polygon);
        const ring = polygonClosed(zone.polygon).map(([x, z]) => [x, overlayY + 0.2, z] as [number, number, number]);
        return (
          <group key={zone.id}>
            {geometry && (
              <mesh geometry={geometry} position={[0, overlayY + 0.05, 0]} raycast={drawing ? () => {} : undefined}>
                <meshStandardMaterial color="#874b3e" transparent opacity={0.28} depthWrite={false} />
              </mesh>
            )}
            {ring.length > 1 && <Line points={ring} color="#ff927f" lineWidth={1.5} />}
          </group>
        );
      })}
      {props.corridors.map((corridor) => (
        corridor.points.length > 1 ? <Line key={corridor.id} points={corridor.points.map(([x, z]) => [x, overlayY + 8, z] as [number, number, number])} color="#8ff2f4" lineWidth={2} dashed /> : null
      ))}
      {props.anchors.map((anchor) => (
        <mesh key={anchor.id} position={[anchor.point[0], overlayY + 2, anchor.point[1]]} raycast={drawing ? () => {} : undefined}>
          <sphereGeometry args={[2.2, 10, 8]} />
          <meshStandardMaterial color="#ffd58b" />
        </mesh>
      ))}
      {preview.length > 0 && (
        <Line points={preview.map(([x, z]) => [x, overlayY + 0.5, z] as [number, number, number])} color="#3dd6db" lineWidth={2} />
      )}
      {props.draft.map((point, index) => (
        <mesh key={`draft-${index}`} position={[point[0], overlayY + 1.2, point[1]]} raycast={() => {}}>
          <sphereGeometry args={[index === 0 ? 3.2 : 2.2, 10, 8]} />
          <meshStandardMaterial color={index === 0 ? "#ffd58b" : "#3dd6db"} />
        </mesh>
      ))}
      {props.zones.filter((zone) => zone.id === props.selectedZoneId).flatMap((zone) => (
        polygonOpen(zone.polygon).map((point, index) => (
          <mesh key={`${zone.id}-v-${index}`} position={[point[0], overlayY + 1.5, point[1]]} raycast={() => {}}>
            <sphereGeometry args={[2.4, 10, 8]} />
            <meshStandardMaterial color="#ffd58b" />
          </mesh>
        ))
      ))}
      {showFootprints && footprintCells.map((cell, index) => (
        <mesh
          key={`fp-${index}-${cell.x.toFixed(1)}-${cell.z.toFixed(1)}`}
          position={[cell.x, overlayY + 0.55, cell.z]}
          raycast={() => {}}
        >
          <boxGeometry args={[cell.cellFeet * 0.92, 0.35, cell.cellFeet * 0.92]} />
          <meshStandardMaterial color="#3dd6db" transparent opacity={0.78} depthWrite={false} emissive="#0a3a3c" />
        </mesh>
      ))}
      {showEnvelopes && collisionEnvelopes.map((envelope) => {
        const ring = envelope.ring.map(([x, z]) => [x, overlayY + 0.9, z] as [number, number, number]);
        const geometry = shapeGeometry(envelope.ring);
        return (
          <group key={`env-${envelope.id}`}>
            {geometry && (
              <mesh geometry={geometry} position={[0, overlayY + 0.7, 0]} raycast={() => {}}>
                <meshStandardMaterial color="#ffd58b" transparent opacity={0.12} depthWrite={false} wireframe={false} />
              </mesh>
            )}
            {ring.length > 1 && <Line points={[...ring, ring[0]]} color="#ffd58b" lineWidth={1.5} />}
          </group>
        );
      })}
      {showForms && props.clusters.map((cluster) => {
        const mesh = meshById.get(cluster.meshId);
        if (!mesh) {
          // Explicit missing-source diagnostic — never present a gold solid as completed architecture.
          return (
            <group
              key={cluster.id}
              position={[cluster.x, cluster.elevation + 10, cluster.z]}
              onClick={(event) => { if (drawing) return; event.stopPropagation(); props.onSelectCluster(cluster.id); }}
            >
              <mesh raycast={drawing ? () => {} : undefined}>
                <boxGeometry args={[20, 20, 20]} />
                <meshStandardMaterial
                  color="#ff927f"
                  wireframe
                  transparent
                  opacity={0.85 * formOpacity}
                  emissive={props.selectedClusterId === cluster.id ? "#145c60" : "#401010"}
                />
              </mesh>
              <mesh position={[0, 14, 0]} raycast={() => {}}>
                <boxGeometry args={[18, 1.2, 0.4]} />
                <meshBasicMaterial color="#ff927f" />
              </mesh>
              <mesh position={[0, 12.2, 0]} raycast={() => {}}>
                <boxGeometry args={[14, 0.8, 0.35]} />
                <meshBasicMaterial color="#1a0a0a" />
              </mesh>
            </group>
          );
        }
        return (
          <group
            key={cluster.id}
            onClick={(event) => { if (drawing) return; event.stopPropagation(); props.onSelectCluster(cluster.id); }}
          >
            <group visible={formOpacity > 0.99 ? true : true}>
              <SiteTile mesh={mesh} cluster={cluster} unitScale={unitScale} upAxisMode={props.upAxisMode} selected={props.selectedClusterId === cluster.id} />
            </group>
          </group>
        );
      })}
      {(props.assemblyConnectors ?? []).filter((item) => item.accepted && item.positions.length >= 9).map((connector) => (
        <AssemblyConnectorMesh key={connector.id} connector={connector} />
      ))}
      <TopViewRightPan active={props.view === "top" || drawing} />
      <SiteOrbitControls view={props.view} drawing={drawing} />
    </Canvas></>
  );
}

