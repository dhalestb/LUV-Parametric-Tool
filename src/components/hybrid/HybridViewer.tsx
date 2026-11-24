import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { DoubleSide, Matrix4, Plane, Vector3, type Box3 } from "three";
import { useEffect, useMemo, useState } from "react";
import { buildCompleteFileGeometry } from "../lattice/objFidelity";
import type { StoredForm } from "./hybrid.worker";

const views = ["SW Iso", "NW Iso", "SE Iso", "NE Iso", "Plan", "Section"] as const;
type View = (typeof views)[number];
const DEFAULT_VIEW: View = "SE Iso";

function Camera({ bounds, view }: { bounds: Box3; view: View }) {
  const size = useThree(state => state.size);
  const center = bounds.getCenter(new Vector3());
  const dimensions = bounds.getSize(new Vector3());
  const span = Math.max(dimensions.length(), 0.01);
  // The preview uses Y-up. North is -Z, matching the generator's +Y in Z-up.
  const sight = view === "Plan" ? new Vector3(0, 1, 0)
    : view === "Section" ? new Vector3(-1, 0, 0)
    : new Vector3(view.includes("E") ? 1 : -1, 1, view.includes("N") ? -1 : 1).normalize();
  const up = view === "Plan" ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(up, sight).normalize();
  const vertical = new Vector3().crossVectors(sight, right);
  const extent = (axis: Vector3) => Math.abs(axis.x) * dimensions.x + Math.abs(axis.y) * dimensions.y + Math.abs(axis.z) * dimensions.z;
  const zoom = 0.82 * Math.min(size.width / Math.max(extent(right), span * 0.01), size.height / Math.max(extent(vertical), span * 0.01));
  const position = center.clone().addScaledVector(sight, 2 * span);
  return <>
    <OrthographicCamera makeDefault position={position} up={up} zoom={zoom || 1} near={span / 1000} far={span * 10} />
    <OrbitControls makeDefault target={center} enableRotate={view !== "Plan" && view !== "Section"} />
  </>;
}

export default function HybridViewer({ form }: { form: StoredForm }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [reset, setReset] = useState(0);
  const geometry = useMemo(() => {
    const mesh = buildCompleteFileGeometry(form.mesh);
    if (form.up === "z") mesh.applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2));
    mesh.computeBoundingBox();
    return mesh;
  }, [form.mesh, form.up]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const bounds = geometry.boundingBox!;
  const cut = useMemo(() => [new Plane(new Vector3(1, 0, 0), -(bounds.min.x + bounds.max.x) / 2)], [bounds]);
  const button = "rounded border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-sm";
  return <>
    <div className="my-2 flex flex-wrap items-center gap-2" aria-label="Camera views">
      {views.map(option => <button key={option} type="button" aria-pressed={view === option}
        className={button} style={{ borderColor: view === option ? "var(--accent)" : undefined }}
        onClick={() => { setView(option); setReset(value => value + 1); }}>{option}</button>)}
      <button type="button" className={button} onClick={() => { setView(DEFAULT_VIEW); setReset(value => value + 1); }}>Reset Camera</button>
    </div>
    {view === "Section" && <p className="text-xs text-[var(--muted)]">Center cut, looking east</p>}
    <div className="h-[52vh]">
      <Canvas onCreated={({ gl }) => { gl.localClippingEnabled = true; }}>
        <Camera key={view + reset} bounds={bounds} view={view} />
        <ambientLight intensity={1.3} />
        <directionalLight position={[3, 7, 5]} intensity={2} />
        <mesh geometry={geometry}>
          <meshStandardMaterial color="#dedbd1" side={DoubleSide} clippingPlanes={view === "Section" ? cut : null} />
        </mesh>
      </Canvas>
    </div>
  </>;
}
