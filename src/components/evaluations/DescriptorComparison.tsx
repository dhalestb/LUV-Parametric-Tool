"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AnalysisViewport, { createCameraBus } from "./AnalysisViewport";
import { ARCH_DESCRIPTORS } from "./objDescriptorAnalysis";
import type { ArchDescriptorId, FormDescriptorEvaluation } from "./objDescriptorAnalysis";
import type { ImportedObj, TileModel, UpAxis, UpAxisMode, UnitName } from "../lattice/types";
import { fileToSpec, resolvedUp, UNIT_TO_FEET, unpackCell } from "../lattice/types";
import { combinedBoundsSpec, triangleCount } from "../lattice/objFidelity";
import { BOARD_LAYOUT, BOARD_PRESETS, boardLineWidth, comparisonBoardSvg, paintComparisonBoard, paintGoldRegions, placeSection, type BoardModel, type BoardRegion, type DrawContext, type ScoreMetric } from "./comparisonBoard";
import { selectDescriptorExtremes, type ComparedForm } from "./comparisonSelection";
import { buildDescriptorEvidence, cellCenter, geometryContentRevision, resolveEvidence, spatialCategoriesForDescriptor, type SpatialEvidenceCategory } from "./descriptorEvidence";
import { ANALYSIS_MARKER_NOTE, ANALYSIS_OPACITY_STANDARD, matchedFrame, worldClippingPlane, type AnalysisView } from "./analysisViewer";
import type { Vec3 } from "./geometryView";
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
  const [view, setView] = useState<AnalysisView | "technical">("isometric");
  const [viewReset, setViewReset] = useState(0);
  const [scaleMode, setScaleMode] = useState<"physical" | "fit">("physical");
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [analysisOnly, setAnalysisOnly] = useState(false);
  const [opacity, setOpacity] = useState(ANALYSIS_OPACITY_STANDARD);
  const [categoryId, setCategoryId] = useState("interstitial");
  const [syncCameras, setSyncCameras] = useState(true);
  const cameraBus = useRef(createCameraBus()).current;
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
      categories: SpatialEvidenceCategory[];
      anchor: Vec3;
    }>();
    for (const item of prepared) {
      if (!item.row.mesh) continue;
      const triangles = specTriangles(item.row.mesh, unitScale, item.up);
      const bounds = meshBounds(triangles);
      const occupied = (item.row.model?.variants[0]?.occupied ?? []).map((packed) => unpackCell(packed));
      const regions = descriptorId === "openVolume" ? openVolumeRegions(occupied) : { free: [] as Array<[number, number, number]>, interstitial: [] as Array<[number, number, number]> };
      const located = regions.interstitial.length ? regions.interstitial : regions.free;
      const categories = spatialCategoriesForDescriptor({
        descriptorId,
        descriptorName: item.descriptor?.name ?? descriptorId,
        occupied: descriptorId === "openVolume" ? occupied : [],
        free: descriptorId === "openVolume" ? regions.free : [],
        interstitial: descriptorId === "openVolume" ? regions.interstitial : [],
      });
      const anchor = combinedBoundsSpec(item.row.mesh, unitScale, item.up).anchor;
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
      map.set(`${item.form.formId}:${item.form.meshId}`, { item, triangles, bounds, evidence, categories, anchor });
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

  function panelLines(side: Side, data: NonNullable<typeof least>, width: number, height: number, goldCenters?: Vec3[]) {
    const plane = cutFor(side, data.bounds);
    const cut = sectionTriangles(data.triangles, plane);
    const cellFeet = data.item.row.model?.cellFeet ?? 2;
    const edges = architecturalEdges(data.triangles);
    const silhouette = showContext ? simplifySegments(visibleElevation(edges.silhouette, plane, 8)) : [];
    const secondary = showContext ? simplifySegments(visibleElevation(edges.secondary, plane, 4)) : [];
    const profile = simplifySegments(cut.segments);
    const sourceCenters = goldCenters ?? data.evidence.features.flatMap((feature) => feature.centers);
    const gold = showAnalysis
      ? sourceCenters.filter((center) => cellMeetsPlane(center, cellFeet, plane))
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

  const frame = useMemo(
    () => matchedFrame([least?.bounds.size, most?.bounds.size].filter((size): size is Vec3 => !!size)),
    [least, most],
  );
  function categoryCenters(data: NonNullable<typeof least>) {
    const category = data.categories.find((item) => item.id === categoryId) ?? data.categories.find((item) => item.available);
    const cellFeet = data.item.row.model?.cellFeet;
    const anchor = data.item.row.model?.anchor;
    if (!category?.available || !cellFeet || !anchor) return [];
    return category.cells.map((cell) => cellCenter(anchor, cell, cellFeet));
  }

  const leastView = view === "technical" && least ? panelLines("least", least, 640, 360, categoryCenters(least)) : null;
  const mostView = view === "technical" && most ? panelLines("most", most, 640, 360, categoryCenters(most)) : null;
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
      legend: least.evidence.overlayAvailable && showAnalysis ? "Gold marks interstitial raster cells. It is not occupiable space. Shared architectural scale." : "Gold overlay unavailable for this descriptor.",
      orientation: `${orientation}. ${least.evidence.sectionPlaneNote}`,
      scaleLabel: scale.label,
      vectorComplete: true,
      limitation: leastCut.cut.limitation,
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

  function liveClip(side: Side, data: NonNullable<typeof least>) {
    if (view === "technical" || view === "isometric" || view === "elevation") {
      return { clip: null, segments: [], limitation: null as string | null, normal: null as Vec3 | null };
    }
    const plane = cutFor(side, data.bounds);
    const cut = sectionTriangles(data.triangles, plane);
    return {
      clip: worldClippingPlane(plane, data.anchor, view),
      segments: cut.segments,
      limitation: cut.limitation,
      normal: plane.normal as Vec3,
    };
  }

  const panel = (side: Side, data: NonNullable<typeof least> | null, drawing: typeof leastView) => {
    const clip = data ? liveClip(side, data) : null;
    const category = data?.categories.find((item) => item.id === categoryId) ?? data?.categories[0];
    const markerCount = data && showAnalysis ? categoryCenters(data).length : 0;
    return (
      <div className="flex min-h-[320px] flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--line)", background: "#000" }} data-analysis-panel={side}>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: GOLD }}>{side === "least" ? (descriptorId === "openVolume" ? "Lowest Open Volume Score" : "Least viable") : (descriptorId === "openVolume" ? "Highest Open Volume Score" : "Most viable")}</div>
        {!data || !data.item.descriptor || !data.item.row.mesh ? (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>No eligible form for this side.</p>
        ) : (
          <>
            <div className="text-[12px]" style={{ color: "#F7F6F5" }}>
              {descriptorName} · {data.item.row.code} · {data.item.row.mesh.filename}
            </div>
            <div className="text-[18px] font-semibold" style={{ color: "#F7F6F5" }}>{data.item.descriptor.absoluteScore.toFixed(1)} / 100</div>
            <div className="relative min-h-[360px] flex-1 overflow-hidden">
              {view === "technical" && drawing ? (
                <SectionCanvas lines={drawing.lines} regions={drawing.regions} label={`${side} ${descriptorName} technical section`} />
              ) : data.item.row.mesh && (
                <AnalysisViewport
                  mesh={data.item.row.mesh}
                  unitScale={unitScale}
                  upAxisMode={upAxisMode}
                  up={data.item.up}
                  view={view === "technical" ? "isometric" : view}
                  fit={frame.fit}
                  aimY={frame.aimY}
                  span={frame.span}
                  resetKey={viewReset}
                  sync={syncCameras}
                  panelId={side}
                  bus={cameraBus}
                  showMesh={!(analysisOnly && showAnalysis)}
                  markers={showAnalysis ? categoryCenters(data) : []}
                  cellFeet={data.item.row.model?.cellFeet ?? 2}
                  opacity={opacity}
                  clip={clip?.clip ?? null}
                  cutSegments={clip?.segments ?? []}
                  discardedNormal={clip?.normal ?? null}
                  label={`${side} ${descriptorName} ${view}`}
                />
              )}
            </div>
            <ul className="space-y-1">
              {data.item.descriptor.components.filter((component) => component.weight > 0).map((component) => (
                <li key={component.name} className="flex justify-between gap-2 text-[10px]" style={{ color: "#F7F6F5" }}>
                  <span>{component.name}</span>
                  <span>{component.value} · weight {Math.round(component.weight * 100)}%</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px]" style={{ color: "#71BEDA" }}>{category?.legend ?? data.evidence.explanation}</p>
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>
              {data.item.row.mesh.positions.length / 3} vertices · {triangleCount(data.item.row.mesh)} triangles · {data.evidence.evidenceClass}
              {category?.available ? ` · ${markerCount} marker cells` : " · spatial evidence unavailable"}
              {clip?.limitation ? ` · ${clip.limitation}` : ""}
              {drawing?.cut.limitation ? ` · ${drawing.cut.limitation}` : ""}
            </p>
          </>
        )}
      </div>
    );
  };

  const categories = least?.categories ?? most?.categories ?? [];
  const selectedCategory = categories.find((item) => item.id === categoryId) ?? categories[0];
  const cutActive = view === "technical" || view === "section-x" || view === "section-y" || view === "plan";

  function chooseView(next: AnalysisView | "technical") {
    cameraBus.pose = null;
    cameraBus.source = null;
    setView(next);
    if (next === "section-x" || next === "section-y" || next === "plan") setOrientation(next);
    setViewReset((value) => value + 1);
  }

  async function exportViewPng() {
    if (view === "technical") {
      setExportNote("3D image export uses Isometric, Section, Plan, or Elevation. The section-board PNG and SVG are unchanged.");
      return;
    }
    const sources = ["least", "most"].map((side) => document.querySelector(`[data-analysis-panel="${side}"] canvas`) as HTMLCanvasElement | null);
    if (sources.some((canvas) => !canvas)) {
      setExportNote("The 3D view is not ready to export.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setExportNote("Canvas export is unavailable in this browser.");
      return;
    }
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1600, 900);
    sources.forEach((source, index) => {
      if (source) ctx.drawImage(source, index * 800, 96, 800, 760);
    });
    ctx.fillStyle = "#F7F6F5";
    ctx.font = "24px sans-serif";
    ctx.fillText(`${descriptorName} · ${view}`, 24, 36);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = GOLD;
    ctx.fillText(least?.item.row.mesh?.filename ?? "", 24, 68);
    ctx.fillText(most?.item.row.mesh?.filename ?? "", 824, 68);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setExportNote("3D PNG encoding failed. No file was saved.");
      return;
    }
    download(`descriptor-${descriptorId}-${view}-3d.png`, blob);
    setExportNote("Saved a separate 3D view PNG. The section-board PNG and SVG were not changed.");
  }

  return (
    <section className="rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }} data-descriptor-comparison data-comparison-mode={view}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide">Descriptor comparison</h2>
          <p className="mt-1 max-w-4xl text-[11px]" style={{ color: "var(--muted)" }}>{selection.population} {selection.note}</p>
        </div>
        <label className="text-[11px]" style={{ color: "var(--muted)" }}>
          Descriptor
          <select className="ml-2 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)", color: "var(--ink)" }} value={descriptorId} onChange={(event) => { setLeastPick(null); setMostPick(null); setCategoryId(event.target.value === "openVolume" ? "interstitial" : "aggregate"); onDescriptor(event.target.value as ArchDescriptorId); }}>
            {ARCH_DESCRIPTORS.map((descriptor) => <option key={descriptor.id} value={descriptor.id}>{descriptor.name}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "#71BEDA" }}>
        Circulation feasibility is not part of this score. A high Monumental or Sculptural result can still fail a circulation constraint.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span style={{ color: "var(--muted)" }}>View</span>
        {([
          ["isometric", "Isometric"],
          ["section-x", "Section X"],
          ["section-y", "Section Y"],
          ["plan", "Plan"],
          ["elevation", "Elevation"],
          ["technical", "Technical drawing"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} className="rounded border px-2 py-1" style={{ borderColor: view === id ? "var(--accent)" : "var(--line)" }} onClick={() => chooseView(id)}>{label}</button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span style={{ color: "var(--muted)" }}>Analysis</span>
        <button type="button" aria-pressed={showAnalysis} className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setShowAnalysis((value) => !value)}>{showAnalysis ? "On" : "Off"}</button>
        <button type="button" aria-pressed={analysisOnly} className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} disabled={!showAnalysis || view === "technical"} onClick={() => setAnalysisOnly((value) => !value)}>{analysisOnly ? "Analysis only" : "Form and analysis"}</button>
        <label>
          Opacity {opacity.toFixed(2)}
          <input className="ml-2 align-middle" type="range" min={0.04} max={0.8} step={0.01} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
        </label>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setOpacity(ANALYSIS_OPACITY_STANDARD)}>Standard opacity</button>
        <label>
          Metric
          <select className="ml-1 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)" }} value={selectedCategory?.id ?? ""} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.available ? item.label : `${item.label} (unavailable)`}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span style={{ color: "var(--muted)" }}>Camera</span>
        <button type="button" aria-pressed={syncCameras} className="rounded border px-2 py-1" style={{ borderColor: syncCameras ? "var(--accent)" : "var(--line)" }} onClick={() => setSyncCameras(true)}>Synchronized</button>
        <button type="button" aria-pressed={!syncCameras} className="rounded border px-2 py-1" style={{ borderColor: !syncCameras ? "var(--accent)" : "var(--line)" }} onClick={() => setSyncCameras(false)}>Independent</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => { cameraBus.pose = null; setViewReset((value) => value + 1); }}>Reset view</button>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => { cameraBus.pose = null; setViewReset((value) => value + 1); }}>Fit both forms</button>
        {view === "technical" && (
          <>
            <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setScaleMode(scaleMode === "physical" ? "fit" : "physical")}>{scale.label}</button>
            <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setShowContext((value) => !value)}>{showContext ? "Context on" : "Context off"}</button>
          </>
        )}
        {cutActive && (
          <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setSync((value) => !value)}>{sync ? "Synchronized cuts" : "Independent cuts"}</button>
        )}
        {cutActive && <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={resetView}>Reset cut</button>}
      </div>
      {cutActive && (
        <div className="mt-2 flex flex-wrap gap-4 text-[11px]" style={{ color: "#F7F6F5" }}>
          <label>
            Cut position ({controlsFor("least").offset.toFixed(1)} ft)
            <input className="ml-2 align-middle" type="range" min={-40} max={40} step={0.5} value={controlsFor("least").offset} onChange={(event) => setOffset("least", Number(event.target.value))} />
          </label>
          {!sync && (
            <label>
              Other cut ({controlsFor("most").offset.toFixed(1)} ft)
              <input className="ml-2 align-middle" type="range" min={-40} max={40} step={0.5} value={controlsFor("most").offset} onChange={(event) => setOffset("most", Number(event.target.value))} />
            </label>
          )}
          <label>
            Cut rotation ({controlsFor("least").spin.toFixed(0)}°)
            <input className="ml-2 align-middle" type="range" min={-180} max={180} step={1} value={controlsFor("least").spin} onChange={(event) => setSpin("least", Number(event.target.value))} />
          </label>
          {!sync && (
            <label>
              Other rotation ({controlsFor("most").spin.toFixed(0)}°)
              <input className="ml-2 align-middle" type="range" min={-180} max={180} step={1} value={controlsFor("most").spin} onChange={(event) => setSpin("most", Number(event.target.value))} />
            </label>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
        {selectedCategory?.legend} {selectedCategory?.available ? ANALYSIS_MARKER_NOTE : ""} The score and rank use the complete imported model. Moving a cut does not recalculate them. PNG and SVG still export the interstitial section board.
      </p>
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
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => void exportViewPng()}>Export 3D PNG</button>
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
