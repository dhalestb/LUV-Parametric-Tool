"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AnalysisViewport, { createCameraBus } from "./AnalysisViewport";
import { ARCH_DESCRIPTORS } from "./objDescriptorAnalysis";
import { findMatchingFilename } from "./formIdentity";
import type { ArchDescriptorId, FormDescriptorEvaluation } from "./objDescriptorAnalysis";
import type { ImportedObj, TileModel, UpAxis, UpAxisMode, UnitName } from "../lattice/types";
import { fileToSpec, resolvedUp, UNIT_TO_FEET, unpackCell } from "../lattice/types";
import { combinedBoundsSpec, triangleCount } from "../lattice/objFidelity";
import { annotationSizes, BOARD_LAYOUT, BOARD_PRESETS, boardLineWidth, comparisonBoardSvg, paintComparisonBoard, paintGoldRegions, placeSection, sectionMapper, type BoardModel, type BoardRegion, type DrawContext, type ScoreMetric } from "./comparisonBoard";
import { legendFromLayers, legendKind, projectLayers } from "./boardEvidence";
import type { BoardOverlay } from "./comparisonBoard";
import type { EvidenceLayer } from "./v4/evidence";
import { selectDescriptorExtremes, type ComparedForm } from "./comparisonSelection";
import { buildDescriptorEvidence, cellCenter, geometryContentRevision, resolveEvidence, spatialCategoriesForDescriptor, type SpatialEvidenceCategory } from "./descriptorEvidence";
import { ANALYSIS_MARKER_NOTE, ANALYSIS_MARKER_SCALE, ANALYSIS_OPACITY_STANDARD, matchedFrame, worldClippingPlane, type AnalysisView } from "./analysisViewer";
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
import { diagnoseOpenVolume, openVolumeRegions } from "./openVolume";
import { auditPermeability, classifyPassingRay, displaySlab, highlightedPermeabilityRay, PERMEABILITY_DIRECTIONS, permeabilityRayKey, slabAxis, slabTFromOffset } from "./openVolumeDisplay";
import { CLEARANCE_MIN_AREA, clearanceNote, measureSurfaceClearance } from "./openVolumeClearance";
import { descriptorFigures } from "./descriptorV2";

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
    setLineDash(segments) {
      ctx.setLineDash(segments);
    },
  };
}

/** Legend built from the layers that are drawn right now, with per-layer toggles. */
function EvidenceLegend({
  layers,
  hidden,
  onToggle,
  side,
}: {
  layers: EvidenceLayer[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  side: Side;
}) {
  if (!layers.length) return null;
  return (
    <ul className="grid gap-1 text-[10px] sm:grid-cols-2" data-evidence-legend={side} style={{ color: "#F7F6F5" }}>
      {layers.map((layer) => {
        const kind = legendKind(layer);
        const off = hidden.has(layer.id);
        const sampled = layer.shown < layer.total ? ` · ${layer.shown} of ${layer.total} drawn` : "";
        return (
          <li key={layer.id} className="flex items-start gap-2">
            <button
              type="button"
              aria-pressed={!off}
              aria-label={`${off ? "Show" : "Hide"} ${layer.label}`}
              className="mt-[2px] inline-flex h-[12px] w-[22px] shrink-0 items-center justify-center rounded-[2px] border"
              style={{ borderColor: off ? "#B9BEC6" : layer.color, background: off ? "transparent" : kind === "patch" ? layer.color : "transparent", opacity: off ? 0.5 : 1 }}
              onClick={() => onToggle(layer.id)}
            >
              {kind === "line" && <span className="block h-0 w-[16px]" style={{ borderTop: `2px ${layer.lineStyle === "dashed" ? "dashed" : "solid"} ${layer.color}` }} />}
              {kind === "point" && <span className="block h-[6px] w-[6px]" style={{ background: layer.color }} />}
            </button>
            <span style={{ opacity: off ? 0.5 : 1 }}>
              {layer.label}{sampled}
              <span style={{ color: "#B9BEC6" }}> · {layer.status}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SectionCanvas({ lines, regions, overlays = [], label }: { lines: BoardModel["leastLines"]; regions: BoardRegion[]; overlays?: BoardOverlay[]; label: string }) {
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
    for (const overlay of overlays) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, overlay.alpha + 0.35);
      ctx.fillStyle = overlay.color;
      ctx.strokeStyle = overlay.color;
      ctx.lineWidth = overlay.dashed ? 1 : 1.4;
      ctx.setLineDash(overlay.dashed ? [5, 4] : []);
      for (const polygon of overlay.polygons) {
        if (polygon.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(polygon[0][0], polygon[0][1]);
        for (const point of polygon.slice(1)) ctx.lineTo(point[0], point[1]);
        ctx.closePath();
        ctx.fill();
      }
      for (const line of overlay.lines) {
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const point of overlay.points) {
        ctx.beginPath();
        ctx.arc(point[0], point[1], 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.font = "11px Arial, Helvetica, sans-serif";
      ctx.fillStyle = "#F7F6F5";
      for (const item of overlay.labels) ctx.fillText(item.text, item.x + 4, item.y - 4);
      ctx.restore();
    }
  }, [lines, overlays, regions]);
  return <canvas ref={ref} aria-label={label} className="h-full w-full" style={{ objectFit: "contain" }} />;
}

function PermeabilityFaceMap({
  rays,
  selected,
  onSelect,
}: {
  rays: Array<{ origin: [number, number, number]; end: [number, number, number]; direction: [number, number, number]; passed: boolean }>;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  if (!rays.length) return null;
  const direction = rays[0].direction;
  const axes = [0, 1, 2].filter((axis) => direction[axis] === 0);
  const [rowAxis, colAxis] = axes;
  const rows = [...new Set(rays.map((ray) => ray.origin[rowAxis]))].sort((left, right) => left - right);
  const cols = [...new Set(rays.map((ray) => ray.origin[colAxis]))].sort((left, right) => left - right);
  const labels = ["X", "Y", "Z"];
  const activeKey = selected ?? (() => {
    const highlighted = highlightedPermeabilityRay(rays);
    return highlighted ? permeabilityRayKey(highlighted) : null;
  })();
  const active = rays.find((ray) => permeabilityRayKey(ray) === activeKey);
  const placement = active?.passed ? classifyPassingRay(active, rays) : null;
  const placementText = placement === "between"
    ? "Occupied columns bracket it within three cells."
    : placement === "around"
      ? "This column misses the mass and crosses envelope air."
      : placement === "uncertain"
        ? "Occupied columns bracket it farther than three cells."
        : "";
  const directionLabel = PERMEABILITY_DIRECTIONS.find((item) => item.direction.every((value, index) => value === direction[index]))?.label;
  return (
    <div className="mt-1" data-permeability-map>
      <p className="text-[10px]" style={{ color: "#B9BEC6" }}>
        {directionLabel} column grid. Rows {labels[rowAxis]}, columns {labels[colAxis]}. This is the evaluator&apos;s test grid, not a floor plan.
      </p>
      {active && (
        <p className="text-[10px]" style={{ color: "#F7F6F5" }}>
          Selected {directionLabel} test {active.passed ? "passed" : "blocked"}. Origin cell {active.origin.join(", ")}. {active.passed ? "Exit cell" : "First occupied cell"} {active.end.join(", ")}. {placementText}
        </p>
      )}
      <div className="mt-1 inline-grid gap-px" style={{ gridTemplateColumns: `repeat(${cols.length}, 9px)` }}>
        {rows.map((row) => cols.map((col) => {
          const ray = rays.find((item) => item.origin[rowAxis] === row && item.origin[colAxis] === col);
          if (!ray) return <span key={`${row}:${col}`} />;
          const key = permeabilityRayKey(ray);
          const active = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              aria-label={`${ray.passed ? "Passed" : "Blocked"} test at ${ray.origin.join(", ")}`}
              className="h-[9px] w-[9px] rounded-[1px]"
              style={{
                background: ray.passed ? "#71BEDA" : "#B9BEC6",
                outline: active ? "2px solid #D6AD4F" : "1px solid transparent",
              }}
              onClick={() => onSelect(key)}
            >{ray.passed ? null : <span className="mx-auto block h-[3px] w-[3px] rounded-full" style={{ background: "#D6AD4F" }} />}</button>
          );
        }))}
      </div>
    </div>
  );
}

export default function DescriptorComparison({
  rows,
  descriptorId,
  onDescriptor,
  unit,
  upAxisMode,
  registryRanks,
}: {
  rows: ComparisonRow[];
  descriptorId: ArchDescriptorId;
  onDescriptor: (id: ArchDescriptorId) => void;
  unit: UnitName;
  upAxisMode: UpAxisMode;
  registryRanks?: Record<string, Array<{ filename: string; absoluteScore?: number; rank: number; cohortSize: number }>>;
}) {
  const [view, setView] = useState<AnalysisView | "technical">("isometric");
  const [viewReset, setViewReset] = useState(0);
  const [scaleMode, setScaleMode] = useState<"physical" | "fit">("physical");
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [analysisOnly, setAnalysisOnly] = useState(false);
  const [opacity, setOpacity] = useState(ANALYSIS_OPACITY_STANDARD);
  useEffect(() => {
    setOpacity((value) => (value < 0.35 ? ANALYSIS_OPACITY_STANDARD : value));
  }, []);
  useEffect(() => {
    setCategoryId((current) => {
      if (descriptorId === "openVolume") return current === "aggregate" ? "overall" : current;
      return "aggregate";
    });
  }, [descriptorId]);
  const [categoryId, setCategoryId] = useState("overall");
  const [evidenceFocus, setEvidenceFocus] = useState("architectural-open");
  const [diagramMode, setDiagramMode] = useState<"presentation" | "diagnostic">("presentation");
  const [rayDirection, setRayDirection] = useState("+X");
  const [showDirectionRays, setShowDirectionRays] = useState(false);
  const [selectedRay, setSelectedRay] = useState<{ least: string | null; most: string | null }>({ least: null, most: null });
  const [slabT, setSlabT] = useState(0.5);
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
  /** v4 evidence layers switched off by the user, per descriptor. */
  const [hiddenLayers, setHiddenLayers] = useState<Record<string, string[]>>({});
  /** v4 component focus: show only layers that support this component. */
  const [componentFocus, setComponentFocus] = useState<string>("all");
  useEffect(() => {
    setComponentFocus("all");
  }, [descriptorId]);
  const hiddenSet = useMemo(() => new Set(hiddenLayers[descriptorId] ?? []), [hiddenLayers, descriptorId]);
  function toggleLayer(id: string) {
    setHiddenLayers((current) => {
      const list = current[descriptorId] ?? [];
      return { ...current, [descriptorId]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] };
    });
  }

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
      ineligibleReason: !row.mesh
        ? "No source OBJ."
        : row.result?.status !== "ready"
          ? "Not evaluated."
          : !descriptor
            ? "Missing score."
            : !Number.isFinite(descriptor.absoluteScore)
              ? (descriptor.unavailableReason ?? "Unavailable: the geometry offered no evidence.")
              : undefined,
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
      const diagnosis = descriptorId === "openVolume" ? diagnoseOpenVolume(occupied) : null;
      const located = regions.interstitial.length ? regions.interstitial : regions.free;
      const categories = spatialCategoriesForDescriptor({
        descriptorId,
        descriptorName: item.descriptor?.name ?? descriptorId,
        occupied: descriptorId === "openVolume" ? occupied : [],
        free: descriptorId === "openVolume" ? regions.free : [],
        interstitial: descriptorId === "openVolume" ? regions.interstitial : [],
        permeabilityRays: diagnosis?.rays,
        solidity: diagnosis?.solidity,
        voidComponents: diagnosis?.voids,
        enclosed: diagnosis?.enclosedCells,
        // v4 results carry their own evidence layers; the v3.5 voxel figure is only built for legacy results.
        figure: descriptorId === "openVolume" || item.descriptor?.evidence ? undefined : descriptorFigures(descriptorId, {
          cells: occupied,
          cellFeet: item.row.model?.cellFeet ?? 2,
          bboxFeet: item.row.result?.raw ? [item.row.result.raw.bboxX, item.row.result.raw.bboxY, item.row.result.raw.bboxZ] : undefined,
          occupiedVolumeFeet: item.row.result?.raw?.occupiedVolume,
        }),
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
  const boundaryStudies = useMemo(() => {
    const run = (data: NonNullable<typeof least> | null) => {
      const occupied = data?.categories.find((item) => item.id === "occupied")?.cells ?? [];
      const mesh = data?.item.row.mesh;
      const anchor = data?.item.row.model?.anchor ?? null;
      const cellFeet = data?.item.row.model?.cellFeet ?? 2;
      if (!occupied.length || !mesh || !anchor || !data) return null;
      const clearance = measureSurfaceClearance({
        mesh,
        unitScale,
        up: data.item.up,
        anchor,
        cellFeet,
        occupied,
        minArea: CLEARANCE_MIN_AREA,
      });
      return { clearance, anchor, cellFeet };
    };
    return { least: run(least), most: run(most) };
  }, [least, most, unitScale]);
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
    const map = sectionMapper(plane.orientation, data.bounds, { x: 0, y: 0, width, height }, feet);
    const overlays = projectLayers(v4Layers(data), map, plane.orientation === "plan" ? null : plane);
    return { ...placed, cut, plane, goldCount: gold.length, overlays };
  }

  const frame = useMemo(
    () => matchedFrame([least?.bounds.size, most?.bounds.size].filter((size): size is Vec3 => !!size)),
    [least, most],
  );
  function focusId() {
    if (descriptorId === "openVolume" && categoryId === "overall") return evidenceFocus;
    return categoryId;
  }

  function drawnCategory(data: NonNullable<typeof least>) {
    return data.categories.find((item) => item.id === focusId()) ?? data.categories.find((item) => item.id === categoryId) ?? data.categories.find((item) => item.available);
  }

  function slabPosition(side: Side, data: NonNullable<typeof least>) {
    if (view === "section-x" || view === "section-y" || view === "plan") {
      const axis = slabAxis(view);
      const onPlane = slabTFromOffset(data.bounds.size[axis], controlsFor(side).offset);
      return Math.max(0, onPlane - 0.12);
    }
    return slabT;
  }

  function categoryCenters(data: NonNullable<typeof least>, side: Side = "least") {
    const category = drawnCategory(data);
    const cellFeet = data.item.row.model?.cellFeet;
    const anchor = data.item.row.model?.anchor;
    if (!category?.available || category.id === "permeability" || !cellFeet || !anchor) return [];
    const marks = displaySlab(category.swatches.length ? category.swatches : category.cells.map((cell) => ({ cell, color: GOLD })), slabAxis(view), slabPosition(side, data));
    return marks.map((mark) => cellCenter(anchor, mark.cell, cellFeet));
  }

  function categoryMarkers(data: NonNullable<typeof least>, side: Side) {
    const category = drawnCategory(data);
    const cellFeet = data.item.row.model?.cellFeet;
    const anchor = data.item.row.model?.anchor;
    if (!category?.available || category.id === "permeability" || !cellFeet || !anchor) return [];
    if (category.id === "architectural-open" && diagramMode === "presentation") return [];
    const source = category.swatches.length ? category.swatches : category.cells.map((cell) => ({ cell, color: GOLD }));
    const fullDiagram = category.id === "aggregate" && (view === "isometric" || view === "elevation");
    const marks = category.id === "architectural-open" || fullDiagram ? source : displaySlab(source, slabAxis(view), slabPosition(side, data));
    const scaleFor = (color: string) => {
      if (category.id === "architectural-open") return 0.88 / ANALYSIS_MARKER_SCALE;
      if (category.id === "low-mass") return 0.62 / ANALYSIS_MARKER_SCALE;
      if (category.id === "aggregate") return (color === "#D6AD4F" ? 2.4 : 1.6) / ANALYSIS_MARKER_SCALE;
      return 1;
    };
    return marks.map((mark) => ({ center: cellCenter(anchor, mark.cell, cellFeet), color: mark.color, scale: scaleFor(mark.color) }));
  }

  function openSpaceLayers(data: NonNullable<typeof least>, side: Side) {
    const study = boundaryStudies[side];
    const empty = {
      field: null as Array<[number, number, number]> | null,
      shell: null as Array<[number, number, number]> | null,
      context: null as Array<[number, number, number]> | null,
      guides: [] as Array<{ a: Vec3; b: Vec3 }>,
      dimensions: [] as Array<{ a: Vec3; b: Vec3 }>,
      volumes: null as Float32Array | null,
      guideColor: "#71BEDA",
      anchor: data.item.row.model?.anchor ?? null,
    };
    if (focusId() !== "architectural-open" || diagramMode !== "presentation" || !study || !empty.anchor) return empty;
    return {
      ...empty,
      guides: study.clearance.outlines,
      dimensions: study.clearance.dimensions,
      volumes: study.clearance.prisms,
    };
  }

  /** v4 evidence layers for a form, after component focus and user toggles. */
  function v4Layers(data: NonNullable<typeof least>, applyHidden = true): EvidenceLayer[] {
    const all = data.item.descriptor?.evidence?.layers ?? [];
    return all.filter((layer) => {
      if (applyHidden && hiddenSet.has(layer.id)) return false;
      if (componentFocus !== "all" && !layer.components.includes(componentFocus)) return false;
      return layer.total > 0 || (layer.dimensions?.length ?? 0) > 0;
    });
  }
  const usesV4 = Boolean(least?.item.descriptor?.evidence || most?.item.descriptor?.evidence);

  function rayMeetsPlane(a: Vec3, b: Vec3, plane: { origin: Vec3; normal: Vec3 }, band: number) {
    const signed = (point: Vec3) => plane.normal[0] * (point[0] - plane.origin[0]) + plane.normal[1] * (point[1] - plane.origin[1]) + plane.normal[2] * (point[2] - plane.origin[2]);
    const da = signed(a);
    const db = signed(b);
    return da * db <= 0 || Math.min(Math.abs(da), Math.abs(db)) <= band;
  }

  function directionRays(data: NonNullable<typeof least>) {
    const category = data.categories.find((item) => item.id === "permeability");
    const direction = PERMEABILITY_DIRECTIONS.find((item) => item.id === rayDirection);
    if (!category?.rays.length || !direction) return [];
    return category.rays.filter((ray) => ray.direction[0] === direction.direction[0] && ray.direction[1] === direction.direction[1] && ray.direction[2] === direction.direction[2]);
  }

  function categoryRays(data: NonNullable<typeof least>, side: Side) {
    const cellFeet = data.item.row.model?.cellFeet;
    const anchor = data.item.row.model?.anchor;
    const category = drawnCategory(data);
    if (!category?.available || !cellFeet || !anchor) return [];
    if (category.id === "aggregate" && category.rays.length) {
      return category.rays.map((ray) => ({
        a: cellCenter(anchor, ray.origin, cellFeet),
        b: cellCenter(anchor, ray.end, cellFeet),
        color: ray.color,
        blocked: !ray.passed,
        selected: false,
        prominent: true,
      }));
    }
    if (category.id !== "permeability") return [];
    const group = directionRays(data);
    const chosen = group.find((ray) => permeabilityRayKey(ray) === selectedRay[side]) ?? highlightedPermeabilityRay(group);
    const chosenKey = chosen ? permeabilityRayKey(chosen) : "";
    const visible = showDirectionRays ? group : chosen ? [chosen] : [];
    const plane = view === "section-x" || view === "section-y" || view === "plan" ? cutFor(side, data.bounds) : null;
    return visible
      .filter((ray) => ray.passed ? ray.origin.some((value, index) => value !== ray.end[index]) : true)
      .filter((ray) => {
        if (permeabilityRayKey(ray) === chosenKey) return true;
        if (!plane) return true;
        const a = cellCenter(anchor, ray.origin, cellFeet);
        const b = cellCenter(anchor, ray.end, cellFeet);
        return rayMeetsPlane(a, b, plane, cellFeet * 2);
      })
      .map((ray) => ({
        a: cellCenter(anchor, ray.origin, cellFeet),
        b: cellCenter(anchor, ray.end, cellFeet),
        color: ray.passed ? "#71BEDA" : "#B9BEC6",
        blocked: !ray.passed,
        selected: permeabilityRayKey(ray) === chosenKey,
      }));
  }

  const leastView = view === "technical" && least ? panelLines("least", least, 640, 360, categoryCenters(least, "least")) : null;
  const mostView = view === "technical" && most ? panelLines("most", most, 640, 360, categoryCenters(most, "most")) : null;
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
        unavailable: component.status === "unavailable",
      })) ?? []
    );
    const rankText = (filename: string | undefined) => {
      const rank = findMatchingFilename(filename, registryRanks?.[descriptorId]);
      return rank ? `${rank.rank} of ${rank.cohortSize}` : null;
    };
    const scoreText = (descriptor: NonNullable<typeof least>["item"]["descriptor"]) => (
      descriptor && Number.isFinite(descriptor.absoluteScore) ? descriptor.absoluteScore.toFixed(1) : "unavailable"
    );
    const dy = height * BOARD_LAYOUT.panelTop;
    const leastRank = rankText(least.item.row.mesh?.filename);
    const mostRank = rankText(most.item.row.mesh?.filename);
    const compared = `${selection.note} Least is ${least.item.row.mesh?.filename ?? "the lower form"} at ${leastRank ?? scoreText(least.item.descriptor)}. Most is ${most.item.row.mesh?.filename ?? "the higher form"} at ${mostRank ?? scoreText(most.item.descriptor)}.`;
    const panelWidth = width * BOARD_LAYOUT.panelWidth;
    const panelHeight = height * BOARD_LAYOUT.panelHeight;
    const overlaysFor = (side: Side, data: NonNullable<typeof least>, left: number) => {
      if (!showAnalysis || !data.item.descriptor?.evidence) return [];
      const plane = cutFor(side, data.bounds);
      const fitted = comparisonScale(least.bounds.size, most.bounds.size, scaleMode, { width: panelWidth, height: panelHeight });
      const feet = side === "least" ? fitted.feetPerPixelA : fitted.feetPerPixelB;
      const map = sectionMapper(plane.orientation, data.bounds, { x: left, y: dy, width: panelWidth, height: panelHeight }, feet);
      return projectLayers(v4Layers(data), map, plane.orientation === "plan" ? null : plane);
    };
    const leastOverlays = overlaysFor("least", least, width * BOARD_LAYOUT.left);
    const mostOverlays = overlaysFor("most", most, width * BOARD_LAYOUT.right);
    const drawnLayers = [...v4Layers(least), ...v4Layers(most)].filter((layer) => [...leastOverlays, ...mostOverlays].some((overlay) => overlay.id === layer.id));
    const legendItems = usesV4 ? legendFromLayers(drawnLayers) : undefined;
    const v4Notes = usesV4 ? [
      `Overlays are the v4 evaluator's recorded evidence in spec feet. ${orientation === "plan" ? "Plan shows every drawn layer." : "Sections show evidence within 6 ft of the cut."}`,
      "Labels state measured, potential, verified, or excluded. Dashed lines are potential or obstructed; solid lines are measured or verified.",
      "Absolute score is 0–100 from fixed calibration. Registry rank is the form's place among the 15 source OBJs. A missing characteristic scores 0 and is ranked. NaN is reserved for a processing failure.",
      "Shared architectural scale. Rank is not circulation feasibility.",
    ] : undefined;
    return {
      width,
      height,
      descriptorName,
      title: "Lowest and highest scored forms for this descriptor",
      leastLabel: `${least.item.row.code}  ${least.item.row.mesh?.filename ?? ""}`,
      mostLabel: `${most.item.row.code}  ${most.item.row.mesh?.filename ?? ""}`,
      leastScore: usesV4 ? `Score ${scoreText(least.item.descriptor)}` : (leastRank ?? scoreText(least.item.descriptor)),
      mostScore: usesV4 ? `Score ${scoreText(most.item.descriptor)}` : (mostRank ?? scoreText(most.item.descriptor)),
      leastScoreDetail: usesV4 ? `Registry rank ${leastRank ?? "pending"}` : undefined,
      mostScoreDetail: usesV4 ? `Registry rank ${mostRank ?? "pending"}` : undefined,
      leastHeading: descriptorId === "openVolume" ? "Lowest Open Volume Score." : usesV4 ? `Lowest ${descriptorName} score.` : undefined,
      mostHeading: descriptorId === "openVolume" ? "Highest Open Volume Score." : usesV4 ? `Highest ${descriptorName} score.` : undefined,
      leastSection: descriptorId === "openVolume" || usesV4 ? sectionCaption(orientation, controlsFor("least").offset) : undefined,
      mostSection: descriptorId === "openVolume" || usesV4 ? sectionCaption(orientation, controlsFor("most").offset) : undefined,
      notes: usesV4 ? v4Notes : descriptorId === "openVolume" ? [
        "Gold is the clearance above each upper surface when that clearance is above 5 ft.",
        "Clearance at or below 5 ft adds nothing. Credit rises to fully open at 10 ft. Exterior-open samples count as fully open.",
        "Surface Clearance is the Open Volume rating.",
        "Shared architectural scale. Rank is not circulation feasibility.",
      ] : undefined,
      leastLines: leastCut.lines.map((line) => shiftLine(line, width * BOARD_LAYOUT.left, dy)),
      mostLines: mostCut.lines.map((line) => shiftLine(line, width * BOARD_LAYOUT.right, dy)),
      leastRegions: usesV4 ? [] : shiftRegions(leastCut.regions, width * BOARD_LAYOUT.left, dy),
      mostRegions: usesV4 ? [] : shiftRegions(mostCut.regions, width * BOARD_LAYOUT.right, dy),
      leastOverlays,
      mostOverlays,
      legendItems,
      leastMetrics: metrics(least.item.descriptor),
      mostMetrics: metrics(most.item.descriptor),
      explanation: descriptorId === "openVolume" && !usesV4
        ? `${compared} Gold marks interstitial raster cells on this cut. It is not verified accessible or occupiable space. Open Volume rank is not circulation feasibility.`
        : compared,
      legend: usesV4
        ? (legendItems?.length ? `Legend lists the ${legendItems.length} evidence layers drawn on this board.` : "No evidence layer meets this cut.")
        : least.evidence.overlayAvailable && showAnalysis ? "Gold marks interstitial raster cells. It is not occupiable space. Shared architectural scale." : "Gold overlay unavailable for this descriptor.",
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

  const rankingResolved = Boolean(registryRanks?.[descriptorId]?.length);
  function exportBlocked() {
    if (!rankingResolved) {
      setExportNote("Registry ranking is still resolving. Export waits until every rank is known.");
      return true;
    }
    return false;
  }

  async function exportPng() {
    if (exportBlocked()) return;
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
    if (exportBlocked()) return;
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

  function v4Caption(data: NonNullable<typeof least>) {
    const evidence = data.item.descriptor?.evidence;
    if (!evidence) return "";
    const validity = evidence.validity === "verified-geometric"
      ? "Verified geometric measurement"
      : evidence.validity === "architectural-proxy"
        ? "Architectural proxy"
        : evidence.validity === "potential-relationship"
          ? "Potential spatial relationship"
          : "Insufficient evidence";
    const notes = evidence.notes.slice(0, 3).join(" ");
    return `${validity}. Source ${evidence.sourceHash}, ${evidence.coordinateSystem}, ${evidence.units}. ${notes}`.trim();
  }

  function panelCaption(data: NonNullable<typeof least>, markerCount: number) {
    const focus = focusId();
    const free = data.categories.find((item) => item.id === "architectural-open")?.cells.length ?? 0;
    const interstitial = data.categories.find((item) => item.id === "interstitial")?.cells.length ?? 0;
    const occupied = data.categories.find((item) => item.id === "occupied")?.cells.length ?? 0;
    const formVolume = occupied + free;
    const componentName = focus === "permeability" ? "Permeability"
      : focus === "architectural-open" ? "Architectural Open Space"
        : focus === "interstitial" ? "Interstitial Space"
          : focus === "low-mass" ? "Low Mass" : "";
    const component = data.item.descriptor?.components.find((item) => item.name === componentName);
    const scoreBit = component ? `${component.name} ${component.value} · weight ${Math.round(component.weight * 100)}% · contribution ${component.contribution ?? 0}` : "";
    if (focus === "permeability") {
      const rays = data.categories.find((item) => item.id === "permeability")?.rays ?? [];
      const audit = auditPermeability(rays);
      const rates = audit.directions.map((item) => `${item.id} ${item.passed}/${item.total}`).join(", ");
      return `These rays are a separate inspection. They are not the Open Volume rating. Measured tests ${audit.passed}/${audit.total}. Equal-weight mean ${(audit.equalWeight * 100).toFixed(2)} across six directions. ${rates}. Between surfaces ${audit.between}. Around the mass ${audit.around}. Uncertain ${audit.uncertain}. A clear column is not circulation.`;
    }
    if (focus === "interstitial") return `Interstitial cells ${interstitial} of ${formVolume || "—"} occupied-bounds cells. Slab shows ${markerCount}. This inspection is not the Open Volume rating.`;
    if (focus === "architectural-open" && diagramMode === "presentation") {
      const study = boundaryStudies[data === least ? "least" : "most"];
      const clearance = data.item.descriptor?.components.find((item) => item.name === "Surface Clearance");
      const clearanceBit = clearance ? `Ordering measurement ${clearance.value}. The registry rank above is the rating.` : "";
      return study ? `${clearanceBit} ${clearanceNote(study.clearance)}` : clearanceBit;
    }
    if (focus === "architectural-open") return `Diagnostic cells: ${markerCount} of ${free} rectangular-box cells. This inspection is not the Open Volume rating.`;
    if (focus === "low-mass") return `Occupied raster in the display slab: ${markerCount} of ${occupied}. Gold is below-mean solidity. This inspection is not the Open Volume rating.`;
    if (descriptorId !== "openVolume") return drawnCategory(data)?.legend ?? "Gold and cyan mark the measurements that place this rank.";
    return data.categories.find((item) => item.id === categoryId)?.legend ?? scoreBit;
  }

  const panel = (side: Side, data: NonNullable<typeof least> | null, drawing: typeof leastView) => {
    const clip = data ? liveClip(side, data) : null;
    const v4 = Boolean(data?.item.descriptor?.evidence);
    const markerCount = data && showAnalysis && !v4 ? categoryMarkers(data, side).length : 0;
    const layers = data && showAnalysis && !v4 ? openSpaceLayers(data, side) : null;
    const evidenceLayers = data && showAnalysis && v4 ? v4Layers(data) : [];
    const legendLayers = data && v4 ? v4Layers(data, false) : [];
    const registryRank = findMatchingFilename(data?.item.row.mesh?.filename, registryRanks?.[descriptorId]);
    const descriptor = data?.item.descriptor;
    const available = descriptor ? Number.isFinite(descriptor.absoluteScore) : false;
    return (
      <div className="flex min-h-[420px] flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--line)", background: "#000" }} data-analysis-panel={side}>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: GOLD }}>{side === "least" ? `Least ${descriptorId === "openVolume" ? "open volume" : descriptorName} on this page` : `Most ${descriptorId === "openVolume" ? "open volume" : descriptorName} on this page`}</div>
        {!data || !data.item.descriptor || !data.item.row.mesh ? (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>No eligible form for this side.</p>
        ) : (
          <>
            <div className="text-[12px]" style={{ color: "#F7F6F5" }}>
              {descriptorName} · {data.item.row.code} · {data.item.row.mesh.filename} · {data.item.descriptor.version ?? "v3.5"}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: GOLD }}>Absolute score</div>
                <div className="text-[28px] font-semibold leading-none" style={{ color: "#F7F6F5" }} data-absolute-score={available ? data.item.descriptor.absoluteScore.toFixed(2) : "unavailable"}>
                  {available ? data.item.descriptor.absoluteScore.toFixed(1) : "Unavailable"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: GOLD }}>Registry rank</div>
                <div className="text-[28px] font-semibold leading-none" style={{ color: "#F7F6F5" }} data-registry-rank={registryRank ? `${registryRank.rank}/${registryRank.cohortSize}` : available ? "pending" : "unavailable"}>
                  {registryRank ? `${registryRank.rank} of ${registryRank.cohortSize}` : available ? "Ranking…" : "Not ranked"}
                </div>
              </div>
            </div>
            <p className="text-[11px]" style={{ color: "#F7F6F5" }}>
              {!available
                ? (data.item.descriptor.unavailableReason ?? "The geometry offered no evidence for this descriptor.")
                : registryRank
                  ? (descriptorId === "openVolume"
                    ? `Score is 0–100 from fixed calibration. 1 is the least open volume in the ${registryRank.cohortSize}-form source registry. ${registryRank.cohortSize} is the most.`
                    : `Score is 0–100 from fixed calibration. 1 is the weakest ${descriptorName} in the ${registryRank.cohortSize}-form source registry. ${registryRank.cohortSize} is the strongest.`)
                  : "Score is 0–100 from fixed calibration. Rank is the form’s place among every OBJ in the lattice source registry."}
            </p>
            {focusId() === "architectural-open" && diagramMode === "presentation" && !v4 && (
              <p className="text-[11px]" style={{ color: "#D6AD4F" }}>
                Gold marks part of the free space in the lattice cell above each floor when the clearance is above 5 ft. It does not fill the cell, it stops at the top of the form, and it is not drawn on the ceiling or in a gap of 5 ft or less. Cyan outlines the supporting surface where the clearance counts.
              </p>
            )}
            <div className="relative min-h-[480px] flex-1 overflow-hidden">
              {view === "technical" && drawing ? (
                <SectionCanvas lines={drawing.lines} regions={drawing.regions} overlays={drawing.overlays} label={`${side} ${descriptorName} technical section`} />
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
                  markers={showAnalysis && !v4 ? categoryMarkers(data, side) : []}
                  evidenceRays={showAnalysis && !v4 ? categoryRays(data, side) : []}
                  layers={evidenceLayers}
                  fieldCells={layers?.field ?? null}
                  fieldAnchor={layers?.anchor ?? null}
                  fieldOpacity={layers?.volumes ? 0.34 : 0.28}
                  shellCells={layers?.shell ?? null}
                  contextCells={layers?.context ?? null}
                  cellFeet={data.item.row.model?.cellFeet ?? 2}
                  opacity={opacity}
                  clip={clip?.clip ?? null}
                  cutSegments={clip?.segments ?? []}
                  guideSegments={layers?.guides ?? []}
                  guideColor={layers?.guideColor}
                  dimensionSegments={layers?.dimensions ?? []}
                  volumeTriangles={layers?.volumes ?? null}
                  discardedNormal={clip?.normal ?? null}
                  label={`${side} ${descriptorName} ${view}`}
                />
              )}
            </div>
            {focusId() === "permeability" && !v4 && (
              <PermeabilityFaceMap
                rays={directionRays(data)}
                selected={selectedRay[side]}
                onSelect={(key) => setSelectedRay((current) => ({ ...current, [side]: key }))}
              />
            )}
            {v4 && (
              <>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "#71BEDA" }}>Legend · drawn layers</div>
                <EvidenceLegend layers={legendLayers} hidden={hiddenSet} onToggle={toggleLayer} side={side} />
                {!legendLayers.length && <p className="text-[10px]" style={{ color: "#B9BEC6" }}>No evidence layer is drawn for this component focus.</p>}
              </>
            )}
            {descriptorId !== "openVolume" && !v4 && (
              <p className="text-[10px]" style={{ color: "#B9BEC6" }}>These measurements place the rank. They are not the rating.</p>
            )}
            {v4 && (
              <p className="text-[10px]" style={{ color: "#B9BEC6" }}>Weighted components. Unavailable terms are left out and the remaining weights are renormalized.</p>
            )}
            <ul className="space-y-1">
              {data.item.descriptor.components.filter((component) => component.weight > 0).map((component) => (
                <li key={component.name} className="flex justify-between gap-2 text-[10px]" style={{ color: component.status === "unavailable" ? "#B9BEC6" : "#F7F6F5" }} title={component.formula ? `${component.formula} · ${component.normalization ?? ""}` : undefined}>
                  <span>{descriptorId === "openVolume" && !v4 ? "Ordering measurement" : component.name}</span>
                  <span>
                    {component.status === "unavailable"
                      ? `unavailable · ${component.reason ?? "no evidence"}`
                      : descriptorId === "openVolume" && !v4
                        ? `clearance ${component.value}`
                        : `${component.value} · weight ${Math.round(component.weight * 100)}% · ${component.contribution ?? 0} pts`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px]" style={{ color: "#F7F6F5" }}>{v4 ? v4Caption(data) : panelCaption(data, markerCount)}</p>
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>
              {data.item.row.mesh.positions.length / 3} vertices · {triangleCount(data.item.row.mesh)} triangles
              {clip?.limitation ? ` · ${clip.limitation}` : ""}
              {drawing?.cut.limitation ? ` · ${drawing.cut.limitation}` : ""}
            </p>
          </>
        )}
      </div>
    );
  };

  const categories = least?.categories ?? most?.categories ?? [];
  const metricOrder = ["overall", "architectural-open", "permeability", "interstitial", "low-mass", "occupied", "enclosed-void", "connected-void"];
  const metricOptions = [...categories].sort((left, right) => {
    const rank = (id: string) => {
      const index = metricOrder.indexOf(id);
      return index === -1 ? metricOrder.length : index;
    };
    return rank(left.id) - rank(right.id);
  });
  const selectedCategory = categories.find((item) => item.id === categoryId) ?? metricOptions[0];
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
    if (exportBlocked()) return;
    const sources = ["least", "most"].map((side) => document.querySelector(`[data-analysis-panel="${side}"] canvas`) as HTMLCanvasElement | null);
    if (sources.some((canvas) => !canvas)) {
      setExportNote("The 3D view is not ready to export.");
      return;
    }
    // Same aspect as the board. Annotation sizes scale with the output height.
    const width = exportSize.width;
    const height = exportSize.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setExportNote("Canvas export is unavailable in this browser.");
      return;
    }
    const sizes = annotationSizes(height);
    const margin = Math.round(width * 0.03);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const panelTop = Math.round(height * 0.22);
    const panelHeight = Math.round(height * 0.56);
    const panelWidth = Math.round(width * 0.44);
    const lefts = [Math.round(width * 0.04), Math.round(width * 0.52)];
    sources.forEach((source, index) => {
      if (!source) return;
      const ratio = Math.min(panelWidth / source.width, panelHeight / source.height);
      const drawW = source.width * ratio;
      const drawH = source.height * ratio;
      ctx.drawImage(source, lefts[index] + (panelWidth - drawW) / 2, panelTop + (panelHeight - drawH) / 2, drawW, drawH);
    });
    const sides: Array<[NonNullable<typeof least> | null, number]> = [[least, lefts[0]], [most, lefts[1]]];
    ctx.fillStyle = "#F7F6F5";
    ctx.font = `${sizes.title}px Arial, Helvetica, sans-serif`;
    ctx.fillText(`${descriptorName} · ${view}`, margin, Math.round(height * 0.05));
    for (const [data, x] of sides) {
      if (!data) continue;
      const rank = registryRanks?.[descriptorId]?.find((item) => item.filename === data.item.row.mesh?.filename);
      const score = data.item.descriptor && Number.isFinite(data.item.descriptor.absoluteScore) ? data.item.descriptor.absoluteScore.toFixed(1) : "unavailable";
      ctx.fillStyle = GOLD;
      ctx.font = `${sizes.heading}px Arial, Helvetica, sans-serif`;
      ctx.fillText(data.item.row.mesh?.filename ?? "", x, Math.round(height * 0.11));
      ctx.fillStyle = "#F7F6F5";
      ctx.font = `${sizes.value}px Arial, Helvetica, sans-serif`;
      ctx.fillText(`Absolute score ${score} · Registry rank ${rank ? `${rank.rank} of ${rank.cohortSize}` : "pending"}`, x, Math.round(height * 0.16));
    }
    const legendLayers = [...(least ? v4Layers(least) : []), ...(most ? v4Layers(most) : [])];
    const legendItems = legendFromLayers(legendLayers);
    if (legendItems.length) {
      const x = Math.round(width * 0.76);
      const top = Math.round(height * 0.045);
      const step = Math.round(sizes.swatch * 1.45);
      ctx.fillStyle = "#71BEDA";
      ctx.font = `${sizes.secondary}px Arial, Helvetica, sans-serif`;
      ctx.fillText("Legend", x, top);
      legendItems.slice(0, 9).forEach((item, index) => {
        const y = top + step * (index + 1);
        ctx.fillStyle = item.color;
        ctx.strokeStyle = item.color;
        if (item.kind === "patch") ctx.fillRect(x, y - sizes.swatch * 0.8, sizes.swatch, sizes.swatch * 0.8);
        else if (item.kind === "point") ctx.fillRect(x + sizes.swatch * 0.3, y - sizes.swatch * 0.65, sizes.swatch * 0.4, sizes.swatch * 0.5);
        else {
          ctx.lineWidth = Math.max(1.5, 2.2 * (height / 2160));
          ctx.setLineDash(item.dashed ? [6 * (height / 2160), 5 * (height / 2160)] : []);
          ctx.beginPath();
          ctx.moveTo(x, y - sizes.swatch * 0.4);
          ctx.lineTo(x + sizes.swatch, y - sizes.swatch * 0.4);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = "#F7F6F5";
        ctx.font = `${sizes.swatch}px Arial, Helvetica, sans-serif`;
        ctx.fillText(item.label, x + sizes.swatch * 1.5, y);
      });
    }
    ctx.fillStyle = "#71BEDA";
    ctx.font = `${sizes.secondary}px Arial, Helvetica, sans-serif`;
    ctx.fillText(`${selection.note} Absolute score is 0–100 from fixed calibration; rank is the place among the 15 source OBJs. Source OBJ geometry was not modified.`, margin, Math.round(height * 0.86));
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setExportNote("3D PNG encoding failed. No file was saved.");
      return;
    }
    download(`descriptor-${descriptorId}-${view}-3d-${width}x${height}.png`, blob);
    setExportNote(`Saved a separate 3D view PNG ${width}×${height} with legend. The section-board PNG and SVG were not changed.`);
  }

  const openFocus = descriptorId === "openVolume" && !usesV4;
  const focusedMetric = focusId();
  const componentNames = [...new Set([...(least?.item.descriptor?.components ?? []), ...(most?.item.descriptor?.components ?? [])].filter((component) => component.weight > 0).map((component) => component.name))];
  const contributionRows = openFocus && least?.item.descriptor && most?.item.descriptor
    ? least.item.descriptor.components.filter((item) => item.weight > 0).map((left) => {
      const right = most.item.descriptor?.components.find((item) => item.name === left.name);
      return { name: left.name, left: left.value, right: right?.value ?? 0, leftWeight: left.contribution ?? 0, rightWeight: right?.contribution ?? 0, gap: (right?.contribution ?? 0) - (left.contribution ?? 0) };
    })
    : [];
  const largestGap = contributionRows.reduce<typeof contributionRows[number] | undefined>((best, row) => (
    Math.abs(row.gap) > Math.abs(best?.gap ?? -1) ? row : best
  ), undefined);

  return (
    <section className="rounded border p-3" style={{ borderColor: "var(--line)", background: "var(--panel-background)" }} data-descriptor-comparison data-comparison-mode={view}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide">Descriptor comparison</h2>
          <p className="mt-1 max-w-4xl text-[11px]" style={{ color: "var(--muted)" }}>{selection.population} {selection.note}</p>
        </div>
        <label className="text-[11px]" style={{ color: "var(--muted)" }}>
          Descriptor
          <select className="ml-2 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)", color: "var(--ink)" }} value={descriptorId} onChange={(event) => { setLeastPick(null); setMostPick(null); setCategoryId(event.target.value === "openVolume" ? "overall" : "aggregate"); onDescriptor(event.target.value as ArchDescriptorId); }}>
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
          <input className="ml-2 align-middle" type="range" min={0.35} max={0.9} step={0.01} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
        </label>
        <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setOpacity(ANALYSIS_OPACITY_STANDARD)}>Standard opacity</button>
        {usesV4 ? (
          <label>
            Component layers
            <select className="ml-1 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)" }} value={componentFocus} onChange={(event) => setComponentFocus(event.target.value)}>
              <option value="all">All components</option>
              {componentNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : (
          <label>
            Metric
            <select className="ml-1 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)" }} value={selectedCategory?.id ?? ""} onChange={(event) => setCategoryId(event.target.value)}>
              {metricOptions.map((item) => <option key={item.id} value={item.id}>{item.available ? item.label : `${item.label} (unavailable)`}</option>)}
            </select>
          </label>
        )}
        {usesV4 && (hiddenLayers[descriptorId]?.length ?? 0) > 0 && (
          <button type="button" className="rounded border px-2 py-1" style={{ borderColor: "var(--line)" }} onClick={() => setHiddenLayers((current) => ({ ...current, [descriptorId]: [] }))}>Show all layers</button>
        )}
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
      {openFocus && categoryId === "overall" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span style={{ color: "var(--muted)" }}>Focus</span>
          {([
            ["permeability", "Permeability"],
            ["architectural-open", "Surface clearance"],
            ["interstitial", "Interstitial Space"],
            ["low-mass", "Low Mass"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={evidenceFocus === id} className="rounded border px-2 py-1" style={{ borderColor: evidenceFocus === id ? "var(--accent)" : "var(--line)" }} onClick={() => setEvidenceFocus(id)}>{label}</button>
          ))}
          {largestGap && <span style={{ color: "#D6AD4F" }}>{descriptorId === "openVolume" ? "The two forms are ordered by measured clearance. The rating above is each form’s place in the source registry." : `Largest weighted difference: ${largestGap.name} (${largestGap.gap >= 0 ? "+" : ""}${largestGap.gap.toFixed(1)} points)`}</span>}
        </div>
      )}
      {openFocus && focusedMetric === "architectural-open" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span style={{ color: "var(--muted)" }}>Diagram</span>
          <button type="button" aria-pressed={diagramMode === "presentation"} className="rounded border px-2 py-1" style={{ borderColor: diagramMode === "presentation" ? "var(--accent)" : "var(--line)" }} onClick={() => setDiagramMode("presentation")}>Architectural</button>
          <button type="button" aria-pressed={diagramMode === "diagnostic"} className="rounded border px-2 py-1" style={{ borderColor: diagramMode === "diagnostic" ? "var(--accent)" : "var(--line)" }} onClick={() => setDiagramMode("diagnostic")}>Diagnostic cells</button>
          <span style={{ color: "#B9BEC6" }}>The cream mesh is the imported form. Gold fills the clearance that places the form in the registry.</span>
        </div>
      )}
      {openFocus && contributionRows.length > 0 && (
        <p className="mt-2 text-[11px]" style={{ color: "#F7F6F5" }}>
          {descriptorId === "openVolume"
            ? "Measured clearance orders these two forms. Their ratings are the registry ranks above."
            : contributionRows.map((row) => `${row.name} ${row.left} / ${row.right} (weighted ${row.leftWeight.toFixed(1)} / ${row.rightWeight.toFixed(1)})`).join(" · ")}
        </p>
      )}
      {openFocus && focusedMetric === "permeability" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <label>
            Direction
            <select className="ml-1 rounded border bg-transparent px-2 py-1" style={{ borderColor: "var(--line)" }} value={rayDirection} onChange={(event) => { setRayDirection(event.target.value); setSelectedRay({ least: null, most: null }); }}>
              {PERMEABILITY_DIRECTIONS.map((direction) => <option key={direction.id} value={direction.id}>{direction.label}</option>)}
            </select>
          </label>
          <button type="button" aria-pressed={showDirectionRays} className="rounded border px-2 py-1" style={{ borderColor: showDirectionRays ? "var(--accent)" : "var(--line)" }} onClick={() => setShowDirectionRays((value) => !value)}>{showDirectionRays ? "Showing this direction" : "Show this direction's tests"}</button>
          <span style={{ color: "#B9BEC6" }}>Solid blue passed. Dashed gray blocked. Gold marks the obstruction and the selected origin.</span>
        </div>
      )}
      {openFocus && focusedMetric !== "permeability" && focusedMetric !== "architectural-open" && focusedMetric !== "aggregate" && view !== "section-x" && view !== "section-y" && view !== "plan" && (
        <label className="mt-2 block text-[11px]" style={{ color: "#F7F6F5" }}>
          Display slab {slabT.toFixed(2)}
          <input className="ml-2 align-middle" type="range" min={0} max={1} step={0.05} value={slabT} onChange={(event) => setSlabT(Number(event.target.value))} />
        </label>
      )}
      <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
        {usesV4
          ? "Evidence layers are the v4 evaluator's recorded measurements on the original surfaces. Each legend entry is a drawn layer; toggle it or focus one component."
          : openFocus && categoryId === "overall" ? `Overall comparison. Focused evidence: ${focusedMetric === "permeability" ? "Permeability" : focusedMetric === "architectural-open" ? "Surface clearance" : focusedMetric === "interstitial" ? "Interstitial Space" : "Low Mass"}.` : descriptorId === "openVolume" ? "One measurement is drawn." : "Gold and cyan mark the measurements that place this rank."} The mesh stays the reference. Moving a cut or hiding a layer does not recalculate the score.
      </p>
      <details className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        <summary>Measurement notes</summary>
        {usesV4 ? (
          <ul className="mt-1 space-y-1">
            {(least?.item.descriptor?.components ?? most?.item.descriptor?.components ?? []).filter((component) => component.weight > 0).map((component) => (
              <li key={component.name}>
                <span style={{ color: "#F7F6F5" }}>{component.name}</span> — {component.intent} Formula: {component.formula}. Units: {component.rawUnit}. Normalization: {component.normalization}. Weight {Math.round(component.weight * 100)}%.
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">{(least ? drawnCategory(least) : most ? drawnCategory(most) : undefined)?.legend ?? selectedCategory?.legend} {ANALYSIS_MARKER_NOTE}</p>
        )}
      </details>
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
