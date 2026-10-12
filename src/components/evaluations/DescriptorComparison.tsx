"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { IDENTITY_PLACEMENT, tileRootMatrix } from "../lattice/objFidelity";
import { ARCH_DESCRIPTORS } from "./objDescriptorAnalysis";
import type { ArchDescriptorId, FormDescriptorEvaluation } from "./objDescriptorAnalysis";
import type { ImportedObj, TileModel, UpAxis, UpAxisMode, UnitName } from "../lattice/types";
import { fileToSpec, resolvedUp, UNIT_TO_FEET, unpackCell } from "../lattice/types";
import { BOARD_LAYOUT, BOARD_PRESETS, boardLineWidth, comparisonBoardSvg, paintComparisonBoard, paintGoldRegions, placeSection, type BoardModel, type BoardRegion, type DrawContext, type ScoreMetric } from "./comparisonBoard";
import { selectDescriptorExtremes, type ComparedForm } from "./comparisonSelection";
import { buildDescriptorEvidence, geometryContentRevision, resolveEvidence } from "./descriptorEvidence";
import { specFeetToFile, type Vec3 } from "./geometryView";
import {
  architecturalEdges,
  cellCutPolygon,
  cellMeetsPlane,
  comparisonScale,
  defaultSectionPlane,
  meshBounds,
  planeFromOrientation,
  projectPoint,
  rotatePlane,
  sectionTriangles,
  simplifySegments,
  translatePlane,
  visibleElevation,
  type SectionOrientation,
  type Triangle,
} from "./meshSection";
import { openVolumeRegions } from "./openVolume";

const GOLD = "#D6AD4F";

export type ComparisonRow = {
  slotId: string;
  code: string;
  name: string;
  mesh: ImportedObj | null;
  result?: FormDescriptorEvaluation;
  model?: TileModel;
};

type Side = "least" | "most";

function specTriangles(mesh: ImportedObj, unitScale: number, up: UpAxis): Triangle[] {
  const triangles: Triangle[] = [];
  const positions = mesh.positions;
  const toSpec = (index: number): Vec3 => {
    const [x, y, z] = fileToSpec(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0, up);
    return [x * unitScale, y * unitScale, z * unitScale];
  };
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      triangles.push({
        a: toSpec(face.vertices[0]),
        b: toSpec(face.vertices[index]),
        c: toSpec(face.vertices[index + 1]),
      });
    }
  }
  return triangles;
}

function readPngSize(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SolidPreview({
  mesh,
  unitScale,
  upAxisMode,
  up,
  gold,
  cellFeet,
}: {
  mesh: ImportedObj;
  unitScale: number;
  upAxisMode: UpAxisMode;
  up: UpAxis;
  gold: Vec3[];
  cellFeet: number;
}) {
  const group = useRef<THREE.Group>(null);
  const marks = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const position = new THREE.BufferGeometry();
    const array = new Float32Array(mesh.positions);
    position.setAttribute("position", new THREE.BufferAttribute(array, 3));
    const indices: number[] = [];
    for (const face of mesh.faces) {
      for (let index = 1; index < face.vertices.length - 1; index += 1) {
        indices.push(face.vertices[0], face.vertices[index], face.vertices[index + 1]);
      }
    }
    position.setIndex(indices);
    position.computeVertexNormals();
    return position;
  }, [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
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
    const marksMesh = marks.current;
    if (!marksMesh) return;
    const dummy = new THREE.Object3D();
    gold.forEach((center, index) => {
      const file = specFeetToFile(center, up, unitScale);
      dummy.position.set(file[0], file[1], file[2]);
      dummy.updateMatrix();
      marksMesh.setMatrixAt(index, dummy.matrix);
    });
    marksMesh.count = gold.length;
    marksMesh.instanceMatrix.needsUpdate = true;
  }, [gold, up, unitScale]);

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#e8e4dc" roughness={0.72} metalness={0.02} />
      </mesh>
      {gold.length > 0 && (
        <instancedMesh ref={marks} args={[undefined, undefined, gold.length]}>
          <boxGeometry args={[cellFeet / unitScale, cellFeet / unitScale, cellFeet / unitScale]} />
          <meshBasicMaterial color={GOLD} />
        </instancedMesh>
      )}
    </group>
  );
}

/** Browser canvas styles accept gradients. The board painter only writes color strings. */
function browserDrawContext(ctx: CanvasRenderingContext2D): DrawContext {
  return {
    get fillStyle() {
      return typeof ctx.fillStyle === "string" ? ctx.fillStyle : "#000000";
    },
    set fillStyle(value: string) {
      ctx.fillStyle = value;
    },
    get strokeStyle() {
      return typeof ctx.strokeStyle === "string" ? ctx.strokeStyle : "#000000";
    },
    set strokeStyle(value: string) {
      ctx.strokeStyle = value;
    },
    get lineWidth() {
      return ctx.lineWidth;
    },
    set lineWidth(value: number) {
      ctx.lineWidth = value;
    },
    get font() {
      return ctx.font;
    },
    set font(value: string) {
      ctx.font = value;
    },
    get globalAlpha() {
      return ctx.globalAlpha;
    },
    set globalAlpha(value: number) {
      ctx.globalAlpha = value;
    },
    fillRect(x, y, w, h) {
      ctx.fillRect(x, y, w, h);
    },
    strokeRect(x, y, w, h) {
      ctx.strokeRect(x, y, w, h);
    },
    beginPath() {
      ctx.beginPath();
    },
    moveTo(x, y) {
      ctx.moveTo(x, y);
    },
    lineTo(x, y) {
      ctx.lineTo(x, y);
    },
    closePath() {
      ctx.closePath();
    },
    stroke() {
      ctx.stroke();
    },
    fill() {
      ctx.fill();
    },
    fillText(text, x, y) {
      ctx.fillText(text, x, y);
    },
  };
}

function SectionCanvas({ lines, regions, label }: { lines: BoardModel["leastLines"]; regions: BoardRegion[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 640, 360);
    paintGoldRegions(browserDrawContext(ctx), regions, 360);
    for (const role of ["secondary", "silhouette", "cut"] as const) {
      ctx.strokeStyle = "#F7F6F5";
      ctx.lineWidth = boardLineWidth(role, 360);
      ctx.lineJoin = role === "cut" ? "miter" : "round";
      ctx.lineCap = role === "cut" ? "butt" : "round";
      for (const line of lines) {
        if (line.role !== role) continue;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
    }
  }, [lines, regions]);
  return <canvas ref={ref} aria-label={label} className="h-full w-full" style={{ objectFit: "contain" }} />;
}

export default function DescriptorComparison({
  rows,
  descriptorId,
  onDescriptor,
  unit,
  upAxisMode,
}: {
  rows: ComparisonRow[];
  descriptorId: ArchDescriptorId;
  onDescriptor: (id: ArchDescriptorId) => void;
  unit: UnitName;
  upAxisMode: UpAxisMode;
}) {
  const [mode, setMode] = useState<"section" | "model3d">("section");
  const [scaleMode, setScaleMode] = useState<"physical" | "fit">("physical");
  const [showGold, setShowGold] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [sync, setSync] = useState(true);
  const [orientation, setOrientation] = useState<Exclude<SectionOrientation, "custom">>("section-y");
  const [sharedOffset, setSharedOffset] = useState(0);
  const [sharedSpin, setSharedSpin] = useState(0);
  const [offsets, setOffsets] = useState({ least: 0, most: 0 });
  const [spins, setSpins] = useState({ least: 0, most: 0 });
  const [leastPick, setLeastPick] = useState<string | null>(null);
  const [mostPick, setMostPick] = useState<string | null>(null);
  const [preset, setPreset] = useState<(typeof BOARD_PRESETS)[number]["id"] | "custom">("board");
  const [customWidth, setCustomWidth] = useState(7407);
  const [customHeight, setCustomHeight] = useState(2160);
  const [preview, setPreview] = useState(false);
  const [exportNote, setExportNote] = useState("");

  const unitScale = UNIT_TO_FEET[unit];
  const prepared = useMemo(() => rows.map((row) => {
    const descriptor = row.result?.descriptors.find((item) => item.id === descriptorId);
    const up = row.mesh ? resolvedUp(row.mesh.upAxis, upAxisMode) : "z";
    const revision = row.mesh ? geometryContentRevision(row.mesh.positions, row.mesh.id) : "";
    const form: ComparedForm = {
      formId: row.slotId,
      slotId: row.slotId,
      meshId: row.mesh?.id ?? "",
      filename: row.mesh?.filename ?? "",
      geometryRevision: revision,
      absoluteScore: descriptor?.absoluteScore ?? null,
      circulationFeasible: null,
      eligible: Boolean(row.mesh && row.result?.status === "ready" && descriptor && Number.isFinite(descriptor.absoluteScore)),
      ineligibleReason: !row.mesh ? "No source OBJ." : row.result?.status !== "ready" ? "Not evaluated." : !descriptor ? "Missing score." : undefined,
    };
    return { row, form, up, revision, descriptor };
  }), [rows, descriptorId, upAxisMode]);

  const selection = useMemo(
    () => selectDescriptorExtremes(descriptorId, prepared.map((item) => item.form)),
    [descriptorId, prepared],
  );
  const leastForm = selection.leastTies.find((form) => form.formId === leastPick) ?? selection.least;
  const mostForm = selection.mostTies.find((form) => form.formId === mostPick) ?? selection.most;

  const geometry = useMemo(() => {
    const map = new Map<string, {
      item: (typeof prepared)[number];
      triangles: Triangle[];
      bounds: ReturnType<typeof meshBounds>;
      evidence: ReturnType<typeof buildDescriptorEvidence>;
    }>();
    for (const item of prepared) {
      if (!item.row.mesh) continue;
      const triangles = specTriangles(item.row.mesh, unitScale, item.up);
      const bounds = meshBounds(triangles);
      const occupied = (item.row.model?.variants[0]?.occupied ?? []).map((packed) => unpackCell(packed));
      const regions = descriptorId === "openVolume" ? openVolumeRegions(occupied) : { free: [] as Array<[number, number, number]>, interstitial: [] as Array<[number, number, number]> };
      const located = regions.interstitial.length ? regions.interstitial : regions.free;
      const evidence = resolveEvidence(buildDescriptorEvidence({
        descriptorId,
        descriptorName: item.descriptor?.name ?? descriptorId,
        formId: item.form.formId,
        meshId: item.form.meshId,
        filename: item.form.filename,
        score: item.descriptor?.score ?? 0,
        absoluteScore: item.descriptor?.absoluteScore ?? 0,
        evaluationRecordId: `${item.form.meshId}:${descriptorId}`,
        geometryRevision: item.revision,
        components: item.descriptor?.components.map((component) => ({
          name: component.name,
          value: component.value,
          raw: component.raw,
          rawUnit: component.rawUnit,
        })) ?? [],
        anchor: item.row.model?.anchor ?? null,
        cellFeet: item.row.model?.cellFeet ?? null,
        locatedCells: descriptorId === "openVolume" ? located : undefined,
      }), item.form.formId, item.revision);
      map.set(`${item.form.formId}:${item.form.meshId}`, { item, triangles, bounds, evidence });
    }
    return map;
  }, [prepared, unitScale, descriptorId]);

  const least = leastForm ? geometry.get(`${leastForm.formId}:${leastForm.meshId}`) ?? null : null;
  const most = mostForm ? geometry.get(`${mostForm.formId}:${mostForm.meshId}`) ?? null : null;
  const scale = comparisonScale(
    least?.bounds.size ?? [1, 1, 1],
    most?.bounds.size ?? [1, 1, 1],
    scaleMode,
    { width: 640, height: 360 },
  );

  function sectionCaption(current: typeof orientation, offset: number) {
    const facing = current === "plan" ? "Plan" : current === "section-x" ? "Section facing X" : "Section facing Y";
    if (Math.abs(offset) < 0.05) return `${facing}, center`;
    const magnitude = Number.isInteger(offset) ? String(Math.abs(offset)) : Math.abs(offset).toFixed(1);
    return `${facing}, offset ${offset < 0 ? "−" : "+"}${magnitude} ft`;
  }

  function controlsFor(side: Side) {
    return {
      offset: sync ? sharedOffset : offsets[side],
      spin: sync ? sharedSpin : spins[side],
    };
  }

  function cutFor(side: Side, bounds: ReturnType<typeof meshBounds>) {
    const control = controlsFor(side);
    const base = planeFromOrientation(orientation, bounds.center);
    return rotatePlane(translatePlane(base, control.offset), control.spin);
  }

  function panelLines(side: Side, data: NonNullable<typeof least>, width: number, height: number) {
    const plane = cutFor(side, data.bounds);
    const cut = sectionTriangles(data.triangles, plane);
    const cellFeet = data.item.row.model?.cellFeet ?? 2;
    const edges = architecturalEdges(data.triangles);
    const silhouette = showContext ? simplifySegments(visibleElevation(edges.silhouette, plane, 8)) : [];
    const secondary = showContext ? simplifySegments(visibleElevation(edges.secondary, plane, 4)) : [];
    const profile = simplifySegments(cut.segments);
    const gold = showGold
      ? data.evidence.features.flatMap((feature) => feature.centers.filter((center) => cellMeetsPlane(center, feature.cellFeet, plane)))
      : [];
    const polygons = gold
      .map((center) => cellCutPolygon(center, cellFeet, plane))
      .filter((polygon) => polygon.length >= 3);
    const fitted = comparisonScale(
      least?.bounds.size ?? data.bounds.size,
      most?.bounds.size ?? data.bounds.size,
      scaleMode,
      { width, height },
    );
    const feet = side === "least" ? fitted.feetPerPixelA : fitted.feetPerPixelB;
    const placed = placeSection(profile, silhouette, polygons, plane.orientation, data.bounds, { x: 0, y: 0, width, height }, feet, secondary);
    return { ...placed, cut, plane, goldCount: gold.length };
  }

  const leastView = least ? panelLines("least", least, 640, 360) : null;
  const mostView = most ? panelLines("most", most, 640, 360) : null;
  const descriptorName = ARCH_DESCRIPTORS.find((item) => item.id === descriptorId)?.name ?? descriptorId;
  const exportSize = preset === "custom"
    ? { width: Math.round(customWidth), height: Math.round(customHeight) }
    : BOARD_PRESETS.find((item) => item.id === preset) ?? BOARD_PRESETS[0];

  function makeBoard(width: number, height: number): BoardModel | null {
    if (!least || !most) return null;
    const leastCut = panelLines("least", least, width * BOARD_LAYOUT.panelWidth, height * BOARD_LAYOUT.panelHeight);
    const mostCut = panelLines("most", most, width * BOARD_LAYOUT.panelWidth, height * BOARD_LAYOUT.panelHeight);
    const shiftLine = (line: BoardModel["leastLines"][number], dx: number, dy: number) => ({
      ...line, x1: line.x1 + dx, x2: line.x2 + dx, y1: line.y1 + dy, y2: line.y2 + dy,
    });
    const shiftRegions = (regions: BoardRegion[], dx: number, dy: number) => regions.map((region) => ({
      points: region.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
    }));
    const metrics = (descriptor: NonNullable<typeof least>["item"]["descriptor"]): ScoreMetric[] => (
      descriptor?.components.filter((component) => component.weight > 0).map((component) => ({
        name: component.name,
        value: component.value,
        weight: component.weight,
      })) ?? []
    );
    const dy = height * BOARD_LAYOUT.panelTop;
    const compared = `${selection.note} Least viable is ${least.item.row.mesh?.filename ?? "the lower form"} at ${least.item.descriptor?.absoluteScore.toFixed(1) ?? "—"}. Most viable is ${most.item.row.mesh?.filename ?? "the higher form"} at ${most.item.descriptor?.absoluteScore.toFixed(1) ?? "—"}.`;
    return {
      width,
      height,
      descriptorName,
      title: "Lowest and highest scored forms for this descriptor",
      leastLabel: `${least.item.row.code}  ${least.item.row.mesh?.filename ?? ""}`,
      mostLabel: `${most.item.row.code}  ${most.item.row.mesh?.filename ?? ""}`,
      leastScore: least.item.descriptor ? least.item.descriptor.absoluteScore.toFixed(1) : "—",
      mostScore: most.item.descriptor ? most.item.descriptor.absoluteScore.toFixed(1) : "—",
      leastHeading: descriptorId === "openVolume" ? "Lowest Open Volume Score." : undefined,
      mostHeading: descriptorId === "openVolume" ? "Highest Open Volume Score." : undefined,
      leastSection: descriptorId === "openVolume" ? sectionCaption(orientation, controlsFor("least").offset) : undefined,
      mostSection: descriptorId === "openVolume" ? sectionCaption(orientation, controlsFor("most").offset) : undefined,
      notes: descriptorId === "openVolume" ? [
        "Gold marks interstitial raster cells, not occupiable space.",
        "Gold is not the full Open Volume score.",
        "Architectural Open Space 35%. Permeability 30%. Interstitial Space 25%. Low Mass 10%.",
        "Shared architectural scale. Rank is not circulation feasibility.",
      ] : undefined,
      leastLines: leastCut.lines.map((line) => shiftLine(line, width * BOARD_LAYOUT.left, dy)),
      mostLines: mostCut.lines.map((line) => shiftLine(line, width * BOARD_LAYOUT.right, dy)),
      leastRegions: shiftRegions(leastCut.regions, width * BOARD_LAYOUT.left, dy),
      mostRegions: shiftRegions(mostCut.regions, width * BOARD_LAYOUT.right, dy),
      leastMetrics: metrics(least.item.descriptor),
      mostMetrics: metrics(most.item.descriptor),
      explanation: descriptorId === "openVolume"
        ? `${compared} Gold marks interstitial raster cells on this cut. It is not verified accessible or occupiable space. Open Volume rank is not circulation feasibility.`
        : compared,
      legend: least.evidence.overlayAvailable && showGold ? "Gold marks interstitial raster cells. It is not occupiable space. Shared architectural scale." : "Gold overlay unavailable for this descriptor.",
      orientation: `${orientation}. ${least.evidence.sectionPlaneNote}`,
      scaleLabel: scale.label,
      vectorComplete: mode === "section",
      limitation: mode === "section" ? leastCut.cut.limitation : "3D comparison is a shaded view. SVG export from this mode is annotation only.",
    };
  }

  const board = preview ? makeBoard(exportSize.width, exportSize.height) : null;

  function setOffset(side: Side, value: number) {
    if (sync) setSharedOffset(value);
    else setOffsets((current) => ({ ...current, [side]: value }));
  }
  function setSpin(side: Side, value: number) {
    if (sync) setSharedSpin(value);
    else setSpins((current) => ({ ...current, [side]: value }));
  }

  function resetView() {
    setSharedOffset(0);
    setSharedSpin(0);
    setOffsets({ least: 0, most: 0 });
    setSpins({ least: 0, most: 0 });
    setOrientation("section-y");
  }

  async function exportPng() {
    const board = makeBoard(exportSize.width, exportSize.height);
    if (!board) {
      setExportNote("Analyze forms before exporting a comparison.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = board.width;
    canvas.height = board.height;
    if (canvas.width !== board.width || canvas.height !== board.height) {
      setExportNote(`This browser cannot allocate ${board.width}×${board.height}. Choose 1920×1080 and export again.`);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setExportNote("Canvas export is unavailable in this browser.");
      return;
    }
    paintComparisonBoard(browserDrawContext(ctx), board);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setExportNote("PNG encoding failed. No file was saved.");
      return;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const size = readPngSize(bytes);
    if (!size || size.width !== board.width || size.height !== board.height) {
      setExportNote(`Export was ${size?.width ?? 0}×${size?.height ?? 0}, not ${board.width}×${board.height}. The file was not saved.`);
      return;
    }
    download(`descriptor-${descriptorId}-${board.width}x${board.height}.png`, blob);
    setExportNote(`Saved PNG ${size.width}×${size.height}.`);
  }

  function exportSvg() {
    const board = makeBoard(exportSize.width, exportSize.height);
    if (!board) {
      setExportNote("Analyze forms before exporting a comparison.");
      return;
    }
    download(`descriptor-${descriptorId}.svg`, new Blob([comparisonBoardSvg(board)], { type: "image/svg+xml" }));
    setExportNote(board.vectorComplete ? "Saved SVG section linework." : "Saved SVG annotations. The 3D shading is not in the vector file.");
  }

  const panel = (side: Side, data: NonNullable<typeof least> | null, view: typeof leastView) => (
    <div className="flex min-h-[320px] flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--line)", background: "#000" }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: GOLD }}>{side === "least" ? (descriptorId === "openVolume" ? "Lowest Open Volume Score" : "Least viable") : (descriptorId === "openVolume" ? "Highest Open Volume Score" : "Most viable")}</div>
      {!data || !view || !data.item.descriptor ? (
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>No eligible form for this side.</p>
      ) : (
        <>
          <div className="text-[12px]" style={{ color: "#F7F6F5" }}>
            {descriptorName} · {data.item.row.code} · {data.item.row.mesh?.filename}
          </div>
          <div className="text-[18px] font-semibold" style={{ color: "#F7F6F5" }}>{data.item.descriptor.absoluteScore.toFixed(1)} / 100</div>
          <div className="relative min-h-[220px] flex-1 overflow-hidden">
            {mode === "section" ? (
              <SectionCanvas lines={view.lines} regions={view.regions} label={`${side} ${descriptorName} section`} />
            ) : (
              <Canvas frameloop="demand" camera={{ position: [48, 36, 48], fov: 40, near: 0.1, far: 4000 }} style={{ width: "100%", height: "100%", minHeight: 220, background: "#000" }}>
                <ambientLight intensity={0.75} />
                <directionalLight position={[40, 80, 30]} intensity={1.15} />
                {data.item.row.mesh && (
                  <SolidPreview
                    mesh={data.item.row.mesh}
                    unitScale={unitScale}
                    upAxisMode={upAxisMode}
                    up={data.item.up}
                    gold={showGold ? data.evidence.features.flatMap((feature) => feature.centers) : []}
                    cellFeet={data.item.row.model?.cellFeet ?? 2}
                  />
                )}
                <OrbitControls makeDefault target={[0, 8, 0]} enableDamping={false} />
              </Canvas>
            )}
          </div>
          <p className="text-[11px]" style={{ color: "#71BEDA" }}>{data.evidence.explanation}</p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            {data.evidence.evidenceClass} · revision {data.evidence.geometryRevision} · gold cells on this cut {view.goldCount}
            {view.cut.limitation ? ` · ${view.cut.limitation}` : ""}
          </p>
          <label className="text-[11px]" style={{ color: "#F7F6F5" }}>
            Move cut ({controlsFor(side).offset.toFixed(1)} ft)
            <input className="ml-2 align-middle" type="range" min={-40} max={40} step={0.5} value={controlsFor(side).offset} onChange={(event) => setOffset(side, Number(event.target.value))} />
          </label>
          <label className="text-[11px]" style={{ color: "#F7F6F5" }}>
            Rotate cut ({controlsFor(side).spin.toFixed(0)}°)
            <input className="ml-2 align-middle" type="range" min={-180} max={180} step={1} value={controlsFor(side).spin} onChange={(event) => setSpin(side, Number(event.target.value))} />
          </label>
        </>
      )}
    </div>
  );

  return (
    <section className="rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }} data-descriptor-comparison>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide">Descriptor comparison</h2>
          <p className="mt-1 max-w-4xl text-[11px]" style={{ color: "var(--muted)" }}>{selection.population} {selection.note}</p>
        </div>
        <label className="text-[11px]" style={{ color: "var(--muted)" }}>
          Descriptor
          <select className="ml-2 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)", color: "var(--ink)" }} value={descriptorId} onChange={(event) => { setLeastPick(null); setMostPick(null); onDescriptor(event.target.value as ArchDescriptorId); }}>
            {ARCH_DESCRIPTORS.map((descriptor) => <option key={descriptor.id} value={descriptor.id}>{descriptor.name}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "#71BEDA" }}>
        Circulation feasibility is not part of this score. A high Monumental or Sculptural result can still fail a circulation constraint.
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setMode(mode === "section" ? "model3d" : "section")}>{mode === "section" ? "Section" : "3D"}</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setScaleMode(scaleMode === "physical" ? "fit" : "physical")}>{scale.label}</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setShowGold((value) => !value)}>{showGold ? "Gold on" : "Gold off"}</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setShowContext((value) => !value)}>{showContext ? "Context on" : "Context off"}</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setSync((value) => !value)}>{sync ? "Synchronized cuts" : "Independent cuts"}</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={resetView}>Reset cut</button>
        <label>
          Cut
          <select className="ml-1 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)" }} value={orientation} onChange={(event) => setOrientation(event.target.value as Exclude<SectionOrientation, "custom">)}>
            <option value="section-y">Section Y</option>
            <option value="section-x">Section X</option>
            <option value="plan">Plan</option>
          </select>
        </label>
      </div>
      {(selection.leastTies.length > 1 || selection.mostTies.length > 1) && (
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          {selection.leastTies.length > 1 && (
            <label>
              Tied least
              <select className="ml-1 bg-transparent" value={leastForm?.formId ?? ""} onChange={(event) => setLeastPick(event.target.value)}>
                {selection.leastTies.map((form) => <option key={form.formId} value={form.formId}>{form.formId} {form.absoluteScore?.toFixed(1)}</option>)}
              </select>
            </label>
          )}
          {selection.mostTies.length > 1 && (
            <label>
              Tied most
              <select className="ml-1 bg-transparent" value={mostForm?.formId ?? ""} onChange={(event) => setMostPick(event.target.value)}>
                {selection.mostTies.map((form) => <option key={form.formId} value={form.formId}>{form.formId} {form.absoluteScore?.toFixed(1)}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {panel("least", least, leastView)}
        {panel("most", most, mostView)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setPreview((value) => !value)}>{preview ? "Hide board preview" : "Board preview"}</button>
        <button type="button" className="rounded px-2 py-1 text-black" style={{ background: "#1293C2" }} onClick={() => void exportPng()}>Export PNG</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={exportSvg}>Export SVG</button>
        <label>
          Export size
          <select className="ml-1 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)" }} value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}>
            {BOARD_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            <option value="custom">Custom</option>
          </select>
        </label>
        {preset === "custom" && (
          <>
            <input className="w-20 rounded border bg-transparent px-1" style={{ borderColor: "var(--line)" }} type="number" min={320} max={8192} value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} />
            <input className="w-20 rounded border bg-transparent px-1" style={{ borderColor: "var(--line)" }} type="number" min={240} max={8192} value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} />
          </>
        )}
        <span style={{ color: "var(--muted)" }}>{exportNote}</span>
      </div>
      {preview && board && (
        <div className="mt-3 overflow-hidden rounded border [&>svg]:h-auto [&>svg]:w-full" style={{ borderColor: "var(--line)", background: "#000" }} dangerouslySetInnerHTML={{ __html: comparisonBoardSvg(board).replace(/^<\?xml[^>]*>\s*/, "") }} />
      )}
      {least && (
        <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
          Default cut origin {defaultSectionPlane(least.bounds).origin.map((value) => value.toFixed(1)).join(", ")} ft.
          Screen section uses architectural X and Z for a Y cut. {projectPoint(least.bounds.center, orientation).map((value) => value.toFixed(1)).join(", ")} is the projected center.
        </p>
      )}
    </section>
  );
}
