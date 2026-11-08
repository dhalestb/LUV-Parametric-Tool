"use client";
import { lengthControlScale } from "./feetUnits";
import { FeetScaleNote } from "./FeetScaleNote";

import { AxisIndicator } from "./AxisIndicator";
import { TrackballControls } from "@react-three/drei";
import { BoardOrthographicCamera as OrthographicCamera } from "./BoardOrthographicCamera";
import { BoardCanvas as Canvas } from "@/components/BoardCanvas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import AppNav from "./AppNav";
import { DEFAULT_DESCRIPTORS, DESCRIPTORS, type CompositionPlacement, type DescriptorId, type DescriptorSettings } from "./compositionEngine";
import { gridDimensions } from "./constraintValidation";
import { evaluateSpatialDesign } from "./descriptorEvaluation";
import { getLetterVolumeGeometry } from "./letterGeometry3d";
import DashedOctetBoxes from "./DashedOctetBoxes";
import { attractorBlend, dashedGroupMeasure, diagonalAttractorScale, diagonalCenterGap, DIAGONAL_GAP_MAXIMUM, DIAGONAL_GAP_MINIMUM, letterDepthSpan, octetBoxes, pullToOctet, scaleTowardOctet, UNIT_LETTER_SPAN, Z_GAP_MINIMUM } from "./letterVolumeLayout";
import { useGridStore } from "./GridStore";
import {
  DEFAULT_OPTIMIZER_CONTROLS,
  DEFAULT_RULES,
  DEFAULT_SELECTION,
  type GenerationRules,
  type OptimizationFocus,
  type OptimizerControls,
  type OrthogonalGrid,
  type SelectionVolume,
  type SpatialAlternative,
} from "./optimizerTypes";
import { optimizeSpatial } from "./spatialOptimizer";
import { placementCenterInSelection, selectionEvaluationGrid } from "./selectionSearch";
import PrototypeDemonstration from "./UnifiedPrototype";
import { DEFAULT_TYPOLOGY_BY_CATEGORY, type PrototypeCategory, type PrototypeGeometryMode, type PrototypeTypologyId } from "./amphitheaterPrototype";
import { OPTIMIZER_SESSION_KEY, readJson, writeJson } from "./browserSession";
import type { Letter } from "./letterTypes";
import {
  applyDashedGroupSelection,
  capacityShortfallMessages,
  clearHeightRouting,
  heightRoutedSelectionVolume,
  isHeightRoutingActive,
  isSelectionHeightFeet,
  normalizeStoredSelection,
  planSourceFieldCapacity,
  projectSelectionOntoField,
  selectionHeightPresets,
  typologyHeightAssignment,
  type SelectionHeightFeet,
} from "./selectionHeightRouting";
import { intersectingSelectionPlacements, localizeIntersectingPlacements } from "./selectionFieldGeometry";
import {
  ARCHITECTURAL_GRID_LIMITS,
  createArchitecturalGrid,
  normalizeArchitecturalGrid,
  setGridCellCount,
  setGridCellPitch,
  setGridOverall,
  validateArchitecturalGrid,
  type GridAxis,
} from "./architecturalGrid";
import {
  applyLetterSizeControlsToRules,
  controlsFromPreset,
  DEFAULT_LETTER_SIZE_CONTROLS,
  letterFootprintFeet,
  letterSizeControlsFromRules,
  letterSpansMultipleCells,
  validateLetterSizeControls,
  type LetterSizeControls,
} from "./architecturalLetterSizing";
import { evaluateLetterLegibility, summarizeLegibility } from "./letterLegibility";

type OverlayState = { circulation: boolean; volume: boolean; sightlines: boolean; hierarchy: boolean; vertical: boolean };
type DisplayMode = "letters" | "void" | "both";
type Preset = { id: string; name: string; settings: DescriptorSettings; prototypeCategory?: PrototypeCategory; prototypeTypology?: PrototypeTypologyId; prototypeSource?: PrototypeGeometryMode };
type SavedDesign = {
  id: string;
  name: string;
  created: string;
  grid: OrthogonalGrid;
  rules: GenerationRules;
  controls: OptimizerControls;
  selection: SelectionVolume;
  focus: OptimizationFocus;
  descriptors: DescriptorSettings;
  alternatives: SpatialAlternative[];
  selectedIndex: number;
  selectedLetters?: Letter[];
  prototypeCategory?: PrototypeCategory;
  prototypeTypology?: PrototypeTypologyId;
  prototypeSource?: PrototypeGeometryMode;
};
type RunHistory = {
  id: string;
  seed: number;
  focus: OptimizationFocus;
  fit: number | null;
  grid: OrthogonalGrid;
  rules: GenerationRules;
  controls: OptimizerControls;
  selection: SelectionVolume;
  descriptors: DescriptorSettings;
  alternatives: SpatialAlternative[];
  selectedLetters?: Letter[];
};
type OptimizerSession = {
  descriptors: DescriptorSettings;
  grid: OrthogonalGrid;
  rules: GenerationRules;
  controls: OptimizerControls;
  selection: SelectionVolume;
  focus: OptimizationFocus;
  alternatives: SpatialAlternative[];
  selectedIndex: number;
  lockedParent: SpatialAlternative | null;
  overlays: OverlayState;
  displayMode: DisplayMode;
  prototypeCategory: PrototypeCategory;
  prototypeTypology: PrototypeTypologyId;
  history: RunHistory[];
  activeHistoryId?: string | null;
  rankingEnabled: boolean;
  selectedLetters?: Letter[];
};

const panelStyle = { borderColor: "var(--line)", background: "var(--panel)" } as const;
const inputStyle = { borderColor: "var(--line)", background: "var(--panel-soft)" } as const;
const focusLabels: Record<OptimizationFocus, string> = {
  letter: "Letter Space",
  void: "Void Space",
  combined: "Combined",
  auto: "Auto-Select",
};
const comparisonLetters: Letter[] = ["L", "U", "V"];

function selectedLetterCount(alternative: SpatialAlternative, selectedLetters: readonly Letter[]) {
  const selected = new Set(selectedLetters);
  return alternative.placements.reduce((count, placement) => count + (selected.has(placement.cell.letter) ? 1 : 0), 0);
}

function letterInventory(alternative: SpatialAlternative) {
  return comparisonLetters.map((letter) => `${letter} ${alternative.placements.filter((placement) => placement.cell.letter === letter).length}`).join(" · ");
}

/**
 * Legacy Slide→grid mapping kept for documentation / optional import.
 * Composition Fixed 3D Grid pitches are authored locally and are NOT derived from letter size.
 */
function gridCountsFromSlide(settings: { cols: number; rows: number; zLayers: number }): Pick<OrthogonalGrid, "xCells" | "yCells" | "zCells"> {
  return {
    xCells: settings.cols,
    yCells: settings.rows,
    zCells: Math.max(1, settings.zLayers),
  };
}

function rulesSharedFromSlide(settings: { letterThickness: number; yRotationEnabled: boolean; yRotationRange: number; spacing: number; zSpacing: number; attractorGap?: number | null }): Pick<GenerationRules, "letterThicknessPercent" | "allowRotationY" | "maximumRotationY" | "xyGap" | "zGap" | "attractorGap"> {
  return {
    letterThicknessPercent: settings.letterThickness,
    allowRotationY: settings.yRotationEnabled,
    maximumRotationY: settings.yRotationRange,
    xyGap: settings.spacing,
    zGap: settings.zSpacing,
    attractorGap: settings.attractorGap ?? undefined,
  };
}

function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function placementScale(placement: CompositionPlacement): [number, number, number] {
  return [
    placement.scale * (placement.scaleX ?? 1),
    placement.scale * (placement.scaleY ?? 1),
    placement.scale * (placement.scaleZ ?? 1),
  ];
}

function compositionObj(alternative: SpatialAlternative, thickness: number) {
  const lines = ["# Units: feet; 1 coordinate unit = 1 ft", "# VUL optimized architectural composition", `o VUL_Optimizer_${alternative.seed}`];
  let offset = 1;
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const positionVector = new THREE.Vector3();
  alternative.placements.forEach((placement, placementIndex) => {
    const geometry = getLetterVolumeGeometry(placement.cell.letter, thickness);
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    positionVector.set(placement.x, placement.y, placement.z);
    quaternion.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(placement.rx),
      THREE.MathUtils.degToRad(placement.ry),
      THREE.MathUtils.degToRad(placement.rz),
      "XYZ",
    ));
    matrix.compose(positionVector, quaternion, new THREE.Vector3(...placementScale(placement)));
    lines.push(`g ${placement.cell.letter}_${placementIndex + 1}`);
    for (let vertex = 0; vertex < position.count; vertex++) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
      lines.push(`v ${point.x} ${point.y} ${point.z}`);
    }
    const count = index ? index.count : position.count;
    for (let face = 0; face + 2 < count; face += 3) {
      lines.push(`f ${(index ? index.getX(face) : face) + offset} ${(index ? index.getX(face + 1) : face + 1) + offset} ${(index ? index.getX(face + 2) : face + 2) + offset}`);
    }
    offset += position.count;
  });
  return `${lines.join("\n")}\n`;
}

function resultsCsv(alternative: SpatialAlternative) {
  const rows = ["descriptor,target,importance,active_value,deviation,letter_raw,letter_normalized,void_raw,void_normalized,letter_method,void_method"];
  for (const item of alternative.evaluation.descriptors) {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    rows.push([
      item.id, item.target, item.importance, item.activeValue ?? "", item.deviation ?? "",
      item.letter.raw ?? "", item.letter.normalized ?? "", item.void.raw ?? "", item.void.normalized ?? "",
      quote(item.letter.method), quote(item.void.method),
    ].join(","));
  }
  return `${rows.join("\n")}\n`;
}

/**
 * Letters extracted for the prototype source.
 * Height-routed fields use solid AABB intersection (original TRS preserved).
 * Legacy free-form selection keeps the center-in-window crop used by the optimizer UI.
 */
function cropRegionPlacements(alternative: SpatialAlternative, thicknessPercent = 12): CompositionPlacement[] {
  const window = alternative.selection;
  const field = alternative.fullPlacements;
  if (window && field?.length) {
    if (isSelectionHeightFeet(window.heightRouting)) {
      const localized = localizeIntersectingPlacements(field, window, thicknessPercent);
      if (localized.length) return localized;
    }
    const contained = field.filter((placement) => placementCenterInSelection(placement, window));
    if (contained.length) return contained.map((placement) => ({ ...placement, x: placement.x - window.centerX, y: placement.y - window.centerY, z: placement.z - window.centerZ }));
  }
  return alternative.placements;
}

function OptimizationScene({ alternative, grid, thickness, overlays, displayMode }: {
  alternative: SpatialAlternative;
  grid: OrthogonalGrid;
  thickness: number;
  overlays: OverlayState;
  displayMode: DisplayMode;
}) {
  const dimensions = useMemo(() => gridDimensions(grid), [grid]);
  const maxDimension = Math.max(dimensions.width, dimensions.height, dimensions.depth, 1);
  const zoom = Math.min(90, 380 / maxDimension);
  const showLetters = displayMode !== "void";
  const renderPlacements = alternative.selection && alternative.fullPlacements ? alternative.fullPlacements : alternative.placements;
  const groupBoxes = useMemo(() => octetBoxes(renderPlacements.map((placement) => {
    const [width, height, depth] = placementScale(placement);
    return {
      col: placement.col,
      row: placement.row,
      layerIndex: placement.layerIndex,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      halfX: (width * UNIT_LETTER_SPAN) / 2,
      halfY: (height * UNIT_LETTER_SPAN) / 2,
      halfZ: letterDepthSpan(depth, thickness, false) / 2,
    };
  }), { cols: grid.xCells, rows: grid.yCells, layers: grid.zCells }), [renderPlacements, grid.xCells, grid.yCells, grid.zCells, thickness]);
  const insideSelection = (placement: CompositionPlacement) => {
    if (!alternative.selection) return true;
    if (isSelectionHeightFeet(alternative.selection.heightRouting)) {
      return intersectingSelectionPlacements([placement], alternative.selection, thickness).length > 0;
    }
    return placementCenterInSelection(placement, alternative.selection);
  };
  return <Canvas dpr={[1, 1.5]} gl={{ antialias: true }}>
    <color attach="background" args={["#05080b"]} />
    <ambientLight intensity={0.65} />
    <directionalLight position={[8, 10, 12]} intensity={1.15} />
    <OrthographicCamera makeDefault position={[maxDimension, -maxDimension, maxDimension * Math.SQRT2]} up={[0, 0, 1]} zoom={zoom} near={0.01} far={300} />
    <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth)]} />
      <lineBasicMaterial color="#3dd6db" transparent opacity={0.7} />
    </lineSegments>
    {overlays.volume && <mesh>
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshBasicMaterial color="#2a8791" wireframe transparent opacity={0.2} />
    </mesh>}
    {(displayMode === "void" || displayMode === "both") && <mesh>
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshStandardMaterial color="#4bc1d0" transparent opacity={displayMode === "void" ? 0.22 : 0.1} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>}
    <DashedOctetBoxes boxes={groupBoxes} />
    {alternative.selection && <lineSegments position={[alternative.selection.centerX, alternative.selection.centerY, alternative.selection.centerZ]}>
      <edgesGeometry args={[new THREE.BoxGeometry(alternative.selection.width, alternative.selection.height, alternative.selection.depth)]} />
      <lineBasicMaterial color="#ffbd4a" depthTest={false} />
    </lineSegments>}
    {renderPlacements.map((placement, index) => {
      const selectedByWindow = insideSelection(placement);
      return (
      <mesh
        key={`${placement.sourceIndex}-${index}`}
        geometry={getLetterVolumeGeometry(placement.cell.letter, thickness)}
        position={[placement.x, placement.y, placement.z]}
        rotation={[THREE.MathUtils.degToRad(placement.rx), THREE.MathUtils.degToRad(placement.ry), THREE.MathUtils.degToRad(placement.rz)]}
        scale={placementScale(placement)}
      >
        <meshStandardMaterial
          color={showLetters
            ? selectedByWindow
              ? new THREE.Color().setHSL(0.51 + placement.layerIndex * 0.018, overlays.hierarchy ? 0.7 : 0.55, overlays.hierarchy ? Math.max(0.35, 0.82 - placement.scale * 0.28) : 0.74)
              : "#596368"
            : "#080b0d"}
          transparent={!showLetters || Boolean(alternative.selection && !selectedByWindow)}
          opacity={!showLetters ? 0.72 : alternative.selection && !selectedByWindow ? 0.16 : 1}
          roughness={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>
    )})}
    {overlays.circulation && <mesh position={[0, 0, 0]}>
      <boxGeometry args={[Math.max(0.05, 0.8), dimensions.height, Math.max(0.05, dimensions.depth * 0.15)]} />
      <meshBasicMaterial color="#ffbd4a" transparent opacity={0.3} />
    </mesh>}
    {overlays.sightlines && <>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([
            -dimensions.width / 2, 0, 0, dimensions.width / 2, 0, 0,
            0, -dimensions.height / 2, 0, 0, dimensions.height / 2, 0,
          ]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#ff765f" />
      </lineSegments>
    </>}
    {overlays.vertical && <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array([
          0, 0, -dimensions.depth / 2, 0, 0, dimensions.depth / 2,
          grid.cellX, 0, -dimensions.depth / 2, grid.cellX, 0, dimensions.depth / 2,
        ]), 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#b38cff" />
    </lineSegments>}
    <TrackballControls makeDefault target={[0, 0, 0]} rotateSpeed={5} noRotate={false} noZoom={false} noPan={false} maxDistance={0} zoomSpeed={1.2} staticMoving />
    <AxisIndicator scale={2 / 3} cornerInset={35}/>
  </Canvas>;
}

function Slider({ label, value, onChange, color = "var(--accent-light)", disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; color?: string; disabled?: boolean;
}) {
  return <label className="grid grid-cols-[66px_minmax(70px,1fr)_30px] items-center gap-1 text-[10px]">
    <span style={{ color: "var(--muted)" }}>{label}</span>
    <input type="range" min={0} max={100} step={1} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} style={{ accentColor: color }} />
    <span className="text-right tabular-nums">{value}</span>
  </label>;
}

const NUMBER_ENTRY_LIMIT = 200;

function NumberInput({ label, value, min, max, step = 1, disabled = false, onChange }: {
  label: string; value: number; min: number; max?: number; step?: number; disabled?: boolean; onChange: (value: number) => void;
}) {
  const factor=lengthControlScale(label), unitScale=factor??1;
  const displayLabel=factor===undefined?label:`${label} (ft)`;
  const ceiling = max === undefined ? undefined : Math.min(max, NUMBER_ENTRY_LIMIT);
  return <label className="flex items-center justify-between gap-2 text-[10px]">
    <span style={{ color: "var(--muted)" }}>{displayLabel}</span>
    <input type="number" aria-label={displayLabel} value={Number((value*unitScale).toFixed(5))} min={min*unitScale} max={ceiling === undefined ? undefined : ceiling*unitScale} step={step*unitScale} disabled={disabled} onChange={(event) => {
      const next = Number(event.target.value)/unitScale;
      if (!Number.isFinite(next) || (ceiling !== undefined && next > ceiling)) return;
      onChange(next);
    }} className="w-20 rounded border px-1.5 py-1 text-right tabular-nums disabled:opacity-45" style={inputStyle} />
  </label>;
}

function clampSelectionToGrid(selection: SelectionVolume, dimensions: ReturnType<typeof gridDimensions>): SelectionVolume {
  return projectSelectionOntoField(selection, dimensions);
}

function Check({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: disabled ? "var(--text-secondary)" : "var(--muted)" }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="accent-[var(--accent)]" />
    {label}
  </label>;
}

function SelectionEnvelopePreview({selection,grid}:{selection:SelectionVolume;grid:OrthogonalGrid}) {
  const field=gridDimensions(grid),span=Math.max(field.width,field.height,field.depth,selection.depth,20);
  return <div className="mt-2 h-56" role="img" aria-label={`Selection envelope 20 by 20 by ${selection.depth} feet in the fixed grid`}>
    <Canvas dpr={[1,1.5]}><color attach="background" args={["#05080b"]}/>
      <OrthographicCamera makeDefault position={[span,-span,span*Math.SQRT2]} up={[0,0,1]} zoom={140/span} near={.01} far={span*10}/>
      <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(field.width,field.height,field.depth)]}/><lineBasicMaterial color="#3dd6db" transparent opacity={.5}/></lineSegments>
      {Array.from({length:grid.zCells+1},(_,i)=><lineSegments key={i} position={[0,0,-field.depth/2+i*grid.cellZ]}><edgesGeometry args={[new THREE.PlaneGeometry(field.width,field.height)]}/><lineBasicMaterial color="#3dd6db" transparent opacity={.25}/></lineSegments>)}
      <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(selection.width,selection.height,selection.depth)]}/><lineBasicMaterial color="#ffbd4a" depthTest={false}/></lineSegments>
      <TrackballControls makeDefault target={[0,0,0]} rotateSpeed={5}/><AxisIndicator scale={2/3} cornerInset={25}/>
    </Canvas>
  </div>;
}

export default function CompositionStudio() {
  const [capacityNotice, setCapacityNotice] = useState<string>("");
  const store = useGridStore();
  const { setAppliedComposition, setLayerMode } = store;
  const [descriptors, setDescriptors] = useState<DescriptorSettings>(() => structuredClone(DEFAULT_DESCRIPTORS));
  const [grid, setGrid] = useState<OrthogonalGrid>(() => createArchitecturalGrid());
  const [rules, setRules] = useState<GenerationRules>(() => ({
    ...DEFAULT_RULES,
    ...rulesSharedFromSlide(store),
  }));
  const [letterSizes, setLetterSizes] = useState<LetterSizeControls>(() => letterSizeControlsFromRules({
    ...DEFAULT_RULES,
    ...rulesSharedFromSlide(store),
  }));
  const [controls, setControls] = useState<OptimizerControls>(() => ({ ...DEFAULT_OPTIMIZER_CONTROLS }));
  const [selection, setSelection] = useState<SelectionVolume>(() => ({ ...DEFAULT_SELECTION }));
  const [focus, setFocus] = useState<OptimizationFocus>("combined");
  const [selectedLetters, setSelectedLetters] = useState<Letter[]>([...comparisonLetters]);
  const [alternatives, setAlternatives] = useState<SpatialAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [optimizing, setOptimizing] = useState(false);
  const [rankingEnabled, setRankingEnabled] = useState(true);
  const [lockedParent, setLockedParent] = useState<SpatialAlternative | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>({ circulation: false, volume: false, sightlines: false, hierarchy: false, vertical: false });
  const [displayMode, setDisplayMode] = useState<DisplayMode>("letters");
  const [prototypeCategory, setPrototypeCategory] = useState<PrototypeCategory>("gathering");
  const [prototypeTypology, setPrototypeTypology] = useState<PrototypeTypologyId>("stepped-amphitheater");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("My preset");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [keptNotice, setKeptNotice] = useState("Working session is kept in this browser.");
  const [gridNotice, setGridNotice] = useState("");
  /** Once true, Slide gap/font sync must not overwrite Composition pitches or letter-size feet controls. */
  const [compositionGridOwned, setCompositionGridOwned] = useState(true);
  const slideSourceSignature = `${store.cols}:${store.rows}:${store.layerMode}:${store.zLayers}:${store.letterThickness}:${store.yRotationEnabled}:${store.yRotationRange}:${store.spacing}:${store.zSpacing}:${store.attractorGap ?? "auto"}`;
  const lastSlideSourceSignature = useRef<string | null>(null);
  const heightRoutingActive = isHeightRoutingActive(selection);
  const typologyHeight = typologyHeightAssignment(prototypeTypology);
  const gridValidation = useMemo(() => validateArchitecturalGrid(grid), [grid]);
  const letterValidation = useMemo(() => validateLetterSizeControls(letterSizes), [letterSizes]);
  const sourceCells = useMemo(() => [store.cells, ...store.layerCells.slice(0, Math.max(0, store.zLayers - 1))].flat(), [store.cells, store.layerCells, store.zLayers]);
  const selectedSourceCells = useMemo(() => sourceCells.filter((cell) => selectedLetters.includes(cell.letter)), [sourceCells, selectedLetters]);
  const evaluationFocus = focus === "auto" ? "combined" : focus;
  const evaluatedAlternatives = useMemo(() => alternatives.slice(0, 4).map((alternative) => ({
    ...alternative,
    evaluation: evaluateSpatialDesign({
      placements: alternative.placements,
      grid: alternative.selection ? selectionEvaluationGrid(alternative.selection, grid) : grid,
      rules,
      descriptors,
      controls,
      focus: evaluationFocus,
      sourceCount: alternative.selection ? undefined : selectedSourceCells.length,
      bounds: alternative.selection ? "center" : "body",
      ignoreCirculationClearance: true,
    }),
  })).sort((a, b) => selectedLetterCount(b, selectedLetters) - selectedLetterCount(a, selectedLetters) || (b.evaluation.fit ?? -1) - (a.evaluation.fit ?? -1)), [alternatives, grid, rules, descriptors, controls, evaluationFocus, selectedSourceCells.length, selectedLetters]);
  const selected = evaluatedAlternatives[Math.min(selectedIndex, Math.max(0, evaluatedAlternatives.length - 1))];
  const completePrototypePlacements = useMemo<CompositionPlacement[]>(() => {
    if (selected?.fullPlacements?.length) return selected.fullPlacements;
    if (selected?.placements.length && !selected.selection) return selected.placements;
    const offsetX = (grid.xCells - 1) * grid.cellX / 2;
    const offsetY = (grid.yCells - 1) * grid.cellY / 2;
    const offsetZ = (grid.zCells - 1) * grid.cellZ / 2;
    const capacity = grid.xCells * grid.yCells * grid.zCells;
    const scale = rules.preferredLetterSize ?? Math.max(rules.minimumLetterSize, rules.maximumLetterSize);
    const xyBlend = attractorBlend(rules.xyGap ?? 56);
    const zBlend = attractorBlend(rules.zGap ?? 56);
    const diagonalScale = rules.attractorGap == null
      ? 1
      : diagonalAttractorScale(rules.attractorGap, rules.xyGap ?? 56, scale * UNIT_LETTER_SPAN);
    return sourceCells.slice(0, capacity).map((cell, index) => {
      const xIndex = index % grid.xCells;
      const yIndex = Math.floor(index / grid.xCells) % grid.yCells;
      const zIndex = Math.floor(index / (grid.xCells * grid.yCells));
      const x = xIndex * grid.cellX - offsetX;
      const y = offsetY - yIndex * grid.cellY;
      const z = zIndex * grid.cellZ - offsetZ;
      const steps = {
        col: xIndex, row: yIndex, layer: zIndex,
        cols: grid.xCells, rows: grid.yCells, layers: grid.zCells,
        x, y, z,
        xStep: grid.cellX, yStep: -grid.cellY, zStep: grid.cellZ,
      };
      const pulled = pullToOctet({ ...steps, xyBlend, zBlend });
      const attracted = diagonalScale === 1 ? pulled : scaleTowardOctet({ ...steps, scale: diagonalScale });
      return {
        cell,
        sourceIndex: index,
        layerIndex: zIndex,
        col: xIndex,
        row: yIndex,
        x: attracted.x,
        y: attracted.y,
        z: attracted.z,
        rx: 0,
        ry: 0,
        rz: cell.rotation,
        scale,
      };
    });
  }, [selected, sourceCells, grid, rules.minimumLetterSize, rules.preferredLetterSize, rules.maximumLetterSize, rules.xyGap, rules.zGap, rules.attractorGap]);
  const prototypeSourcePlacements = useMemo<CompositionPlacement[]>(
    () => selected ? cropRegionPlacements(selected, rules.letterThicknessPercent) : completePrototypePlacements,
    [selected, completePrototypePlacements, rules.letterThicknessPercent],
  );
  const prototypeSourceOptions = useMemo(() => evaluatedAlternatives.map((alternative, index) => {
    const crop = cropRegionPlacements(alternative, rules.letterThicknessPercent);
    return {
      index,
      label: `Alternative ${index + 1} · seed ${alternative.seed} · ${crop.length} crop letters${alternative.selection ? ` · center ${alternative.selection.centerX.toFixed(1)}, ${alternative.selection.centerY.toFixed(1)}, ${alternative.selection.centerZ.toFixed(1)}` : ""}`,
    };
  }), [evaluatedAlternatives, rules.letterThicknessPercent]);
  const prototypeSourceLabel = selected
    ? `Alternative ${selectedIndex + 1} · seed ${selected.seed} · ${prototypeSourcePlacements.length} crop letters${selected.selection ? ` · selected ${selected.selection.width.toFixed(1)} × ${selected.selection.height.toFixed(1)} × ${selected.selection.depth.toFixed(1)}${isSelectionHeightFeet(selected.selection.heightRouting) ? ` · height route ${selected.selection.heightRouting} ft` : ""} at center (${selected.selection.centerX.toFixed(1)}, ${selected.selection.centerY.toFixed(1)}, ${selected.selection.centerZ.toFixed(1)})` : ""}`
    : `Original synchronized grid · ${prototypeSourcePlacements.length} objects`;
  const selectedIsApplied = Boolean(selected
    && store.appliedComposition?.seed === selected.seed
    && store.appliedComposition.alternativeIndex === selectedIndex);
  const dimensions = useMemo(() => gridDimensions(grid), [grid]);
  const dashedSelection = useMemo(() => dashedGroupMeasure({
    cols: grid.xCells,
    rows: grid.yCells,
    layers: grid.zCells,
    cellX: grid.cellX,
    cellY: grid.cellY,
    cellZ: grid.cellZ,
    letterScale: Math.max(rules.minimumLetterSize, rules.maximumLetterSize),
    thickness: rules.letterThicknessPercent,
    attractorScale: rules.attractorGap == null
      ? 1
      : diagonalAttractorScale(rules.attractorGap, rules.xyGap ?? 56, Math.max(rules.minimumLetterSize, rules.maximumLetterSize) * UNIT_LETTER_SPAN),
  }), [grid, rules.minimumLetterSize, rules.maximumLetterSize, rules.letterThicknessPercent, rules.attractorGap, rules.xyGap]);
  const selectionValid = !selection.enabled || (selection.width <= dimensions.width && selection.height <= dimensions.height && selection.depth <= dimensions.depth);
  const capacityPlan = heightRoutingActive && isSelectionHeightFeet(selection.heightRouting)
    ? planSourceFieldCapacity(grid, selection.heightRouting)
    : null;
  const capacityShortfall = capacityPlan ? capacityShortfallMessages(capacityPlan) : [];

  useEffect(() => {
    setSelection((current) => {
      const clamped = clampSelectionToGrid(current, dimensions);
      const unchanged = (Object.keys(clamped) as Array<keyof SelectionVolume>)
        .every((key) => clamped[key] === current[key]);
      return unchanged ? current : clamped;
    });
  }, [dimensions]);
  useEffect(() => {
    if (!storageReady || !dashedSelection) return;
    setSelection((current) => {
      const next = clampSelectionToGrid(applyDashedGroupSelection(current, dashedSelection), dimensions);
      const unchanged = (Object.keys(next) as Array<keyof SelectionVolume>)
        .every((key) => next[key] === current[key]);
      return unchanged ? current : next;
    });
  }, [dashedSelection, dimensions, storageReady]);

  useEffect(() => {
    try {
      const presetData = localStorage.getItem("vul-optimizer-presets");
      const designData = localStorage.getItem("vul-optimizer-designs");
      if (presetData) setPresets(JSON.parse(presetData));
      if (designData) setSavedDesigns(JSON.parse(designData));
    } catch { /* Ignore unavailable or corrupted storage. */ }
    const session = readJson<OptimizerSession>(OPTIMIZER_SESSION_KEY);
    if (session?.descriptors && session.grid && session.rules && session.controls && session.selection && session.focus) {
      setDescriptors(session.descriptors);
      const restoredGrid = normalizeArchitecturalGrid(session.grid);
      setGrid(restoredGrid);
      setCompositionGridOwned(true);
      setRules(session.rules);
      setLetterSizes(letterSizeControlsFromRules(session.rules));
      setControls({ ...session.controls, alternatives: Math.min(4, session.controls.alternatives) });
      setSelection(normalizeStoredSelection(session.selection));
      setFocus(session.focus);
      if (Array.isArray(session.selectedLetters) && session.selectedLetters.length) setSelectedLetters(session.selectedLetters.filter((letter): letter is Letter => comparisonLetters.includes(letter)));
      setAlternatives(Array.isArray(session.alternatives) ? session.alternatives : []);
      setSelectedIndex(Math.min(3, session.selectedIndex ?? 0));
      setLockedParent(session.lockedParent ?? null);
      if (session.overlays) setOverlays(session.overlays);
      if (session.displayMode) setDisplayMode(session.displayMode);
      if (session.prototypeCategory) setPrototypeCategory(session.prototypeCategory);
      if (session.prototypeTypology) setPrototypeTypology(session.prototypeTypology);
      if (Array.isArray(session.history)) setHistory(session.history);
      setActiveHistoryId(session.activeHistoryId ?? null);
      if (typeof session.rankingEnabled === "boolean") setRankingEnabled(session.rankingEnabled);
      const count = Array.isArray(session.alternatives) ? session.alternatives.length : 0;
      setKeptNotice(count > 0 ? `Restored ${count} result${count === 1 ? "" : "s"} from this browser.` : "Working session is kept in this browser.");
    }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    writeJson("vul-optimizer-designs", savedDesigns);
  }, [storageReady, savedDesigns]);
  useEffect(() => {
    if (!storageReady || optimizing) return;
    const session: OptimizerSession = {
      descriptors, grid, rules, controls, selection, focus, alternatives, selectedIndex, lockedParent,
      overlays, displayMode, prototypeCategory, prototypeTypology, history, activeHistoryId, rankingEnabled, selectedLetters,
    };
    const persist = () => {
      if (!writeJson(OPTIMIZER_SESSION_KEY, session)) setStorageMessage("Browser storage is full or unavailable. Delete previous runs or presets before saving more.");
    };
    const timer = window.setTimeout(persist, 300);
    return () => {
      window.clearTimeout(timer);
      persist();
    };
  }, [storageReady, optimizing, descriptors, grid, rules, controls, selection, focus, alternatives, selectedIndex, lockedParent, overlays, displayMode, prototypeCategory, prototypeTypology, history, activeHistoryId, rankingEnabled, selectedLetters]);
  const displayModeForFocus = (next: OptimizationFocus): DisplayMode => next === "letter" ? "letters" : next === "void" ? "void" : "both";

  const runOptimization = useCallback(async () => {
    if (!grid.locked || !selectionValid || !selectedSourceCells.length || optimizing) return;
    if (history.length >= 10) { setStorageMessage("Configuration history is full (10 runs). Delete a previous run before generating another."); return; }
    setStorageMessage("");
    setSelection((current) => ({ ...current, enabled: true }));
    setOptimizing(true);
    setProgress(0);
    const result = await optimizeSpatial({
      sourceCells: selectedSourceCells,
      selectedLetters,
      descriptors,
      grid,
      rules,
      controls,
      focus,
      selection: { ...selection, enabled: true },
      lockedParent,
    }, (nextProgress, strongest) => {
      setProgress(nextProgress);
      setAlternatives(strongest);
    });
    setAlternatives(result.alternatives);
    setRankingEnabled(result.rankingEnabled);
    setSelectedIndex(0);
    const runId = `${Date.now()}`;
    const nextHistory: RunHistory[] = [{
      id: runId,
      seed: controls.seed,
      focus,
      fit: result.alternatives[0]?.evaluation.fit ?? null,
      grid: structuredClone(grid),
      rules: structuredClone(rules),
      controls: structuredClone(controls),
      selection: { ...structuredClone(selection), enabled: true },
      descriptors: structuredClone(descriptors),
      alternatives: structuredClone(result.alternatives),
      selectedLetters: [...selectedLetters],
    }, ...history];
    const saved = writeJson(OPTIMIZER_SESSION_KEY, { descriptors, grid, rules, controls, selection: { ...selection, enabled: true }, focus, alternatives: result.alternatives, selectedIndex: 0, lockedParent, overlays, displayMode, prototypeCategory, prototypeTypology, history: nextHistory, activeHistoryId: runId, rankingEnabled: result.rankingEnabled, selectedLetters });
    if (saved) { setHistory(nextHistory); setActiveHistoryId(runId); }
    else setStorageMessage("This run could not be saved: browser storage is full or unavailable. Delete previous runs or presets, then generate again.");
    setOptimizing(false);
  }, [grid, selectionValid, optimizing, selectedSourceCells, selectedLetters, descriptors, rules, controls, focus, selection, lockedParent, history, overlays, displayMode, prototypeCategory, prototypeTypology]);

  useEffect(() => {
    if (!store.slideReady) return;
    const firstSync = lastSlideSourceSignature.current === null;
    if (!firstSync && lastSlideSourceSignature.current === slideSourceSignature) return;
    lastSlideSourceSignature.current = slideSourceSignature;
    const shared = rulesSharedFromSlide(store);
    // Shared Slide settings: thickness, rotation, attractor gaps. Letter feet sizes stay on Composition.
    setRules((current) => ({
      ...current,
      letterThicknessPercent: shared.letterThicknessPercent,
      allowRotationY: shared.allowRotationY,
      maximumRotationY: shared.maximumRotationY,
      xyGap: shared.xyGap,
      zGap: shared.zGap,
      attractorGap: shared.attractorGap,
    }));
    // Composition owns pitches/overall. Optionally absorb Slide cell counts only before local authorship.
    if (!compositionGridOwned) {
      const counts = gridCountsFromSlide(store);
      setGrid((current) => {
        const next = { ...current, ...counts, locked: current.locked };
        return next;
      });
    }
    if (firstSync) return;
    setAlternatives([]);
    setSelectedIndex(0);
    setLockedParent(null);
  }, [slideSourceSignature, store, selection.heightRouting, compositionGridOwned]);

  const applySelectedToSlide = () => {
    if (!selected) return;
    const activeBounds = selected.selection ?? dimensions;
    setAppliedComposition({
      seed: selected.seed,
      alternativeIndex: selectedIndex,
      placements: cropRegionPlacements(selected, rules.letterThicknessPercent),
      width: activeBounds.width,
      height: activeBounds.height,
      depth: activeBounds.depth,
      sourceCenter: selected.selection ? { x: selected.selection.centerX, y: selected.selection.centerY, z: selected.selection.centerZ } : undefined,
    });
    setLayerMode(true);
  };

  const syncSlideCellCounts = (next: OrthogonalGrid) => {
    // Keep Slide source capacity aligned with Composition cell counts without rewriting pitches.
    if (next.xCells !== store.cols || next.yCells !== store.rows) store.resizeGrid(next.xCells, next.yCells);
    if (next.zCells !== store.zLayers) {
      store.setLayerMode(true);
      store.setZLayers(next.zCells);
    }
  };

  const commitGrid = (next: OrthogonalGrid, notice?: string) => {
    const validation = validateArchitecturalGrid(next);
    if (!validation.valid) {
      setGridNotice(validation.errors.join(" "));
      return;
    }
    setCapacityNotice("");
    setCompositionGridOwned(true);
    setGrid(next);
    syncSlideCellCounts(next);
    setGridNotice([...(validation.warnings), notice].filter(Boolean).join(" "));
    // Preserve selection size/height when overall grows; clamp only if it no longer fits.
    setSelection((current) => clampSelectionToGrid(current, gridDimensions(next)));
  };

  const applyHeightPreset = (height: SelectionHeightFeet) => {
    const plan = planSourceFieldCapacity(grid, height);
    const nextGrid = grid;
    setCompositionGridOwned(true);
    setGrid(nextGrid);
    syncSlideCellCounts(nextGrid);
    setLayerMode(true);
    setSelection(clampSelectionToGrid(heightRoutedSelectionVolume(height, selection), gridDimensions(nextGrid)));
    setCapacityNotice(capacityShortfallMessages(plan).join(" "));
    setGridNotice(validateArchitecturalGrid(nextGrid).warnings.join(" "));
    setAlternatives([]);
    setSelectedIndex(0);
    setLockedParent(null);
  };

  const clearHeightPreset = () => {
    setSelection(clearHeightRouting(selection));
    setCapacityNotice("");
  };

  const setLetterSizeValue = (key: keyof LetterSizeControls, value: number | boolean) => {
    setLetterSizes((current) => {
      const next = { ...current, [key]: value } as LetterSizeControls;
      const validation = validateLetterSizeControls(next);
      if (!validation.valid) {
        setGridNotice(validation.errors.join(" "));
        return current;
      }
      setRules((rulesCurrent) => applyLetterSizeControlsToRules(rulesCurrent, next));
      setGridNotice(validation.warnings.join(" "));
      return next;
    });
  };

  const setDescriptor = (id: DescriptorId, key: "intensity" | "importance", value: number) => {
    setDescriptors((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  };
  const setGridValue = (key: keyof OrthogonalGrid, value: number | boolean) => {
    if (key === "locked") {
      setGrid((current) => ({ ...current, locked: Boolean(value) }));
      return;
    }
    if (typeof value !== "number" || grid.locked) return;
    if (key === "xCells") commitGrid(setGridCellCount(grid, "x", value));
    else if (key === "yCells") commitGrid(setGridCellCount(grid, "y", value));
    else if (key === "zCells") commitGrid(setGridCellCount(grid, "z", value));
    else if (key === "cellX") commitGrid(setGridCellPitch(grid, "x", value), "Cell X changed; letter sizes were not modified.");
    else if (key === "cellY") commitGrid(setGridCellPitch(grid, "y", value), "Cell Y changed; letter sizes were not modified.");
    else if (key === "cellZ") commitGrid(setGridCellPitch(grid, "z", value), "Cell Z changed; letter sizes were not modified.");
  };
  const setOverallValue = (axis: GridAxis, overall: number) => {
    if (grid.locked) return;
    commitGrid(setGridOverall(grid, axis, overall), `Overall ${axis.toUpperCase()} updated cell pitch only; cell count and letter sizes unchanged.`);
  };
  const setRule = (key: keyof GenerationRules, value: number | boolean) => {
    if (key === "letterThicknessPercent" && typeof value === "number") store.setLetterThickness(value);
    if (key === "allowRotationY" && typeof value === "boolean") store.setYRotationEnabled(value);
    if (key === "maximumRotationY" && typeof value === "number") store.setYRotationRange(value);
    setRules((current) => ({ ...current, [key]: value }));
  };
  const setControl = (key: keyof OptimizerControls, value: number) => setControls((current) => ({ ...current, [key]: key === "alternatives" ? Math.min(4, value) : value }));
  const setSelectionValue = (key: keyof SelectionVolume, value: number | boolean) => setSelection((current) => {
    if (isHeightRoutingActive(current) && (key === "width" || key === "height" || key === "depth" || key === "heightRouting")) {
      return current;
    }
    return clampSelectionToGrid({ ...current, [key]: value }, dimensions);
  });
  const resetAll = () => {
    const nextGrid = createArchitecturalGrid();
    const nextSizes = { ...DEFAULT_LETTER_SIZE_CONTROLS };
    setDescriptors(structuredClone(DEFAULT_DESCRIPTORS));
    setCompositionGridOwned(true);
    setGrid(nextGrid);
    syncSlideCellCounts(nextGrid);
    setLetterSizes(nextSizes);
    setRules(applyLetterSizeControlsToRules({ ...DEFAULT_RULES, ...rulesSharedFromSlide(store) }, nextSizes));
    setControls({ ...DEFAULT_OPTIMIZER_CONTROLS });
    setSelection({ ...DEFAULT_SELECTION, heightRouting: null });
    setCapacityNotice("");
    setGridNotice("");
    setFocus("combined");
    setSelectedLetters([...comparisonLetters]);
    setDisplayMode("both");
    setPrototypeCategory("gathering");
    setPrototypeTypology("stepped-amphitheater");
    setLockedParent(null);
  };
  const savePreset = () => {
    if (presets.length >= 12) { setStorageMessage("Presets are full (12 presets). Delete a previous preset before saving another."); return; }
    const next = [{ id: crypto.randomUUID(), name: presetName.trim() || "Preset", settings: structuredClone(descriptors), prototypeCategory, prototypeTypology, prototypeSource: (displayMode === "void" ? "voids" : displayMode === "both" ? "combined" : "letters") as PrototypeGeometryMode }, ...presets];
    if (writeJson("vul-optimizer-presets", next)) { setPresets(next); setStorageMessage(""); }
    else setStorageMessage("Preset could not be saved: browser storage is full or unavailable. Delete previous runs or presets and try again.");
  };
  const deletePreset = () => {
    const next = presets.filter(p => p.id !== selectedPresetId);
    if (writeJson("vul-optimizer-presets", next)) { setPresets(next); setSelectedPresetId(""); setStorageMessage(""); }
    else setStorageMessage("Could not update presets in browser storage.");
  };
  const deleteHistory = (id: string) => {
    const next = history.filter(run => run.id !== id);
    const activeId = activeHistoryId === id ? null : activeHistoryId;
    const session = { descriptors, grid, rules, controls, selection, focus, alternatives, selectedIndex, lockedParent, overlays, displayMode, prototypeCategory, prototypeTypology, history: next, activeHistoryId: activeId, rankingEnabled, selectedLetters };
    if (writeJson(OPTIMIZER_SESSION_KEY, session)) { setHistory(next); setActiveHistoryId(activeId); setStorageMessage(""); }
    else setStorageMessage("Could not update history in browser storage.");
  };
  const saveDesign = () => {
    if (!selected) return;
    const design: SavedDesign = {
      id: `${Date.now()}`,
      name: `Seed ${selected.seed} · ${focusLabels[focus]}`,
      created: new Date().toLocaleString(),
      grid: structuredClone(grid),
      rules: structuredClone(rules),
      controls: structuredClone(controls),
      selection: structuredClone(selection),
      focus,
      descriptors: structuredClone(descriptors),
      alternatives: structuredClone(evaluatedAlternatives),
      selectedIndex,
      selectedLetters: [...selectedLetters],
      prototypeCategory,
      prototypeTypology,
      prototypeSource: (displayMode === "void" ? "voids" : displayMode === "both" ? "combined" : "letters") as PrototypeGeometryMode,
    };
    setSavedDesigns((current) => [design, ...current].slice(0, 8));
  };
  const restoreDesign = (design: SavedDesign) => {
    setGrid(normalizeArchitecturalGrid(design.grid));
    setCompositionGridOwned(true);
    setRules(design.rules);
    setLetterSizes(letterSizeControlsFromRules(design.rules));
    setControls({ ...design.controls, alternatives: Math.min(4, design.controls.alternatives) });
    setSelection(design.selection ?? { ...DEFAULT_SELECTION });
    setFocus(design.focus);
    setDescriptors(design.descriptors); setAlternatives(design.alternatives); setSelectedIndex(Math.min(3, design.selectedIndex));
    if (design.selectedLetters?.length) setSelectedLetters(design.selectedLetters);
    if (design.prototypeCategory) setPrototypeCategory(design.prototypeCategory);
    if (design.prototypeTypology) setPrototypeTypology(design.prototypeTypology);
    setDisplayMode(design.prototypeSource ? (design.prototypeSource === "voids" ? "void" : design.prototypeSource === "combined" ? "both" : "letters") : displayModeForFocus(design.focus));
  };
  const restoreHistoryRun = (index: number) => {
    const previous = history[index];
    if (!previous) return;
    setGrid(normalizeArchitecturalGrid(previous.grid));
    setCompositionGridOwned(true);
    setRules(previous.rules);
    setLetterSizes(letterSizeControlsFromRules(previous.rules));
    setControls({ ...previous.controls, alternatives: Math.min(4, previous.controls.alternatives) });
    setSelection(previous.selection ?? { ...DEFAULT_SELECTION });
    setFocus(previous.focus);
    if (previous.selectedLetters?.length) setSelectedLetters(previous.selectedLetters);
    setDisplayMode(displayModeForFocus(previous.focus));
    setDescriptors(previous.descriptors);
    setAlternatives(previous.alternatives);
    setSelectedIndex(0);
    setLockedParent(null);
    setActiveHistoryId(previous.id);
  };

  const legibilityReport = useMemo(() => {
    if (!selected) return null;
    return evaluateLetterLegibility({
      placements: cropRegionPlacements(selected, rules.letterThicknessPercent),
      thicknessPercent: rules.letterThicknessPercent,
      selection: selected.selection ?? null,
      preserveProportions: rules.preserveProportions,
    });
  }, [selected, rules.letterThicknessPercent, rules.preserveProportions]);

  const preferredSpansCells = letterSpansMultipleCells(letterSizes.preferredFeet, Math.min(grid.cellX, grid.cellY));
  const undo = () => restoreHistoryRun(0);
  const toggleComparisonLetter = (letter: Letter) => {
    const enabled = selectedLetters.includes(letter);
    if (enabled && selectedLetters.length === 1) return;
    setSelectedLetters(enabled ? selectedLetters.filter((item) => item !== letter) : comparisonLetters.filter((item) => item === letter || selectedLetters.includes(item)));
    setAlternatives([]);
    setSelectedIndex(0);
    setLockedParent(null);
  };

  return <main data-board-page="composition" className="mx-auto flex min-h-screen w-full max-w-[1900px] flex-col gap-3 px-4 py-4 md:px-5">
    {storageMessage && <p role="alert" className="rounded border p-2 text-xs text-amber-300" style={{borderColor:"var(--line)"}}>{storageMessage}</p>}
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-lg font-semibold">Parametric Spatial Optimizer</h1><p className="text-[10px] uppercase tracking-[0.13em]" style={{ color: "var(--muted)" }}>fixed orthogonal grid · letter + void evaluation</p></div>
        <AppNav />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => document.getElementById("prototype-demonstration")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--accent-gold)", color: "var(--accent-gold)" }}>Prototype demo</button>
        {selected && <span className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: selectedIsApplied ? "var(--accent-secondary)" : "var(--accent-gold)", color: selectedIsApplied ? "var(--accent-light)" : "var(--accent-gold)", background: selectedIsApplied ? "var(--panel-background)" : "var(--input-background)" }}>{selectedIsApplied ? "Selected result applied to Slide" : "Selected result ready to apply"}</span>}
        {selected && <button type="button" onClick={applySelectedToSlide} disabled={selectedIsApplied} className="rounded border px-2 py-1 text-[10px] disabled:opacity-50" style={{ borderColor: "var(--accent-secondary)", background: "var(--accent-secondary)", color: "var(--text-primary)" }}>{selectedIsApplied ? "Applied to Slide" : "Apply selected to Slide"}</button>}
        <span className="rounded border px-2 py-1 text-[10px]" title="Refresh restores results, descriptors, the selection, the letter field, and prototype settings from this browser. Save configuration stores a named copy. Reset returns the optimizer controls to their defaults." style={{ borderColor: "var(--line)", color: "var(--muted)" }}>{keptNotice}</span>
        <button type="button" onClick={undo} disabled={!history.length} className="rounded border px-2 py-1 text-[10px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Undo run</button>
        <button type="button" onClick={saveDesign} disabled={!selected} className="rounded border px-2 py-1 text-[10px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Save configuration</button>
        <button type="button" onClick={resetAll} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)" }}>Reset</button>
        <button type="button" onClick={() => void runOptimization()} disabled={!grid.locked || !selectionValid || !gridValidation.valid || !letterValidation.valid || !selectedSourceCells.length || optimizing} className="rounded px-3 py-1 text-[11px] font-semibold text-black disabled:opacity-40" style={{ background: "var(--accent-primary)" }}>{optimizing ? `Optimizing ${progress}%` : "Generate + optimize"}</button>
      </div>
    </header><FeetScaleNote/>

    {optimizing && <div className="h-1 overflow-hidden rounded bg-[var(--input-background)]"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} /></div>}
    {!grid.locked && <p className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "#9b7634", color: "#ffd38a", background: "#2b2415" }}>Lock the Fixed 3D Grid before optimization.</p>}
    {!selectionValid && <p className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "#9b563d", color: "#ffad95", background: "#2b1815" }}>The selection volume must fit completely inside the overall solution volume.</p>}
    {!gridValidation.valid && <p className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "#9b563d", color: "#ffad95", background: "#2b1815" }}>{gridValidation.errors.join(" ")}</p>}
    {!letterValidation.valid && <p className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "#9b563d", color: "#ffad95", background: "#2b1815" }}>{letterValidation.errors.join(" ")}</p>}
    {gridNotice && <p className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "#9b7634", color: "#ffd38a", background: "#2b2415" }}>{gridNotice}</p>}
    {!selectedSourceCells.length && <p className="rounded border px-3 py-2 text-[11px]" style={{ borderColor: "#9b563d", color: "#ffad95", background: "#2b1815" }}>None of the enabled letter types are present in the current composition.</p>}
    <p className="rounded border px-3 py-2 text-[10px]" style={{ borderColor: "var(--accent-secondary)", color: "var(--accent-pale)", background: "var(--panel-background)" }}>
      Composition Fixed 3D Grid pitches and letter footprints (ft) are independent. Slide still supplies letter identities, thickness, and rotation; cell counts stay aligned for source capacity. Letter size is the unrotated plan footprint = scale × 0.92 ft. Generate creates alternatives; Apply selected to Slide transfers the selected arrangement.</p>

    <div className="board-composition-content"><div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
      <aside className="space-y-3">
        <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="flex items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold">Selection volume</h2><p className="text-[9px]" style={{ color: "var(--muted)" }}>Search a smaller composition inside the overall solution.</p></div>
            <span className="text-[10px]" style={{ color: "var(--accent-gold)" }}>One box per alternative</span>
          </div>
          <div className="mt-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Height-specific fields</h3>
            <p className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>20 × 20 ft plan × 20 / 40 / 60 ft height (X width, Y depth, Z height). Dashed-group auto-sizing is disabled while a height route is active. Letters are taken by solid intersection, not center-point only.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectionHeightPresets().map((preset) => (
                <button
                  key={preset.height}
                  type="button"
                  aria-pressed={selection.heightRouting === preset.height}
                  onClick={() => applyHeightPreset(preset.height)}
                  className="rounded border px-2 py-1 text-[10px] font-semibold"
                  style={{
                    borderColor: selection.heightRouting === preset.height ? "var(--accent-gold)" : "var(--line)",
                    background: selection.heightRouting === preset.height ? "var(--accent-dark)" : "transparent",
                    color: selection.heightRouting === preset.height ? "var(--accent-pale)" : "var(--muted)",
                  }}
                >
                  {preset.label}
                </button>
              ))}
              <button type="button" onClick={clearHeightPreset} disabled={!heightRoutingActive} className="rounded border px-2 py-1 text-[10px] disabled:opacity-40" style={{ borderColor: "var(--line)" }}>Clear height route</button>
            </div>
            {capacityNotice && <p className="mt-2 text-[9px]" style={{ color: "var(--accent-gold)" }}>{capacityNotice}</p>}
            <p className="mt-2 text-[9px]" style={{ color: typologyHeight.status === "unresolved" ? "var(--muted)" : "var(--accent-pale)" }}>
              Typology height for {prototypeTypology}: {typologyHeight.status === "assigned" ? `${typologyHeight.height} ft (${typologyHeight.source})` : `unresolved — ${typologyHeight.reason}`}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <NumberInput label="Selection X" value={selection.width} min={Math.min(0.5, dimensions.width)} max={dimensions.width} step={0.1} disabled={!selection.enabled || heightRoutingActive || Boolean(dashedSelection)} onChange={(value) => setSelectionValue("width", value)} />
            <NumberInput label="Search step X" value={selection.stepX} min={0.1} max={Math.max(0.1, dimensions.width)} step={0.1} disabled={!selection.enabled || Boolean(dashedSelection && !heightRoutingActive)} onChange={(value) => setSelectionValue("stepX", value)} />
            <NumberInput label="Selection Y" value={selection.height} min={Math.min(0.5, dimensions.height)} max={dimensions.height} step={0.1} disabled={!selection.enabled || heightRoutingActive || Boolean(dashedSelection)} onChange={(value) => setSelectionValue("height", value)} />
            <NumberInput label="Search step Y" value={selection.stepY} min={0.1} max={Math.max(0.1, dimensions.height)} step={0.1} disabled={!selection.enabled || Boolean(dashedSelection && !heightRoutingActive)} onChange={(value) => setSelectionValue("stepY", value)} />
            <NumberInput label="Selection Z" value={selection.depth} min={Math.min(0.5, dimensions.depth)} max={dimensions.depth} step={0.1} disabled={!selection.enabled || heightRoutingActive || Boolean(dashedSelection)} onChange={(value) => setSelectionValue("depth", value)} />
            <NumberInput label="Search step Z" value={selection.stepZ} min={0.1} max={Math.max(0.1, dimensions.depth)} step={0.1} disabled={!selection.enabled || Boolean(dashedSelection && !heightRoutingActive)} onChange={(value) => setSelectionValue("stepZ", value)} />
          </div>
          <p className="mt-2 text-[9px]" style={{ color: selection.enabled ? "var(--accent-gold)" : "var(--muted)" }}>{heightRoutingActive ? `Height route ${selection.heightRouting} ft: fixed 20 × 20 × ${selection.depth.toFixed(0)} ft field. Search steps ${selection.stepX.toFixed(2)} × ${selection.stepY.toFixed(2)} × ${selection.stepZ.toFixed(2)} reposition the window inside the source field. Letters whose solids intersect the box are kept with original transforms. The architectural generator uses this height and physically trims boundary crossings.` : dashedSelection ? `The selection box matches each dashed group: ${selection.width.toFixed(2)} × ${selection.height.toFixed(2)} × ${selection.depth.toFixed(2)}, centered on that group. Search steps of ${selection.stepX.toFixed(2)} × ${selection.stepY.toFixed(2)} × ${selection.stepZ.toFixed(2)} move from one dashed box to the next.` : selection.enabled ? `The optimizer searches ${selection.width.toFixed(1)} × ${selection.height.toFixed(1)} × ${selection.depth.toFixed(1)} windows. Every letter whose center is inside the gold box is evaluated, including letters that cross the crop. Selection dimensions automatically reduce when the overall solution becomes smaller.` : "The entire overall grid is evaluated and exported."}</p>
          {heightRoutingActive && <SelectionEnvelopePreview selection={selection} grid={grid}/>}
          {capacityShortfall.length > 0 && <p role="alert" className="mt-2 text-[9px]" style={{color:"#ffad95"}}>{capacityShortfall.join(" ")}</p>}
          {!selectionValid && heightRoutingActive && <p className="mt-2 text-[9px]" style={{ color: "#ffad95" }}>The height-routed selection does not fit inside the current source field. Expand overall X/Y/Z or choose a shorter height.</p>}
        </section>

        <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Fixed 3D grid</h2><p className="text-[9px]" style={{ color: "var(--muted)" }}>Independent cell counts and pitches (ft). Example field 60×60×80 ft. Lock before generation.</p></div><button type="button" onClick={() => setGridValue("locked", !grid.locked)} className="rounded px-2 py-1 text-[10px] font-medium" style={{ background: grid.locked ? "var(--accent-light)" : "var(--input-background)", color: grid.locked ? "var(--app-background)" : "var(--text-primary)" }}>{grid.locked ? "Locked" : "Unlocked"}</button></div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <NumberInput label="X cells" value={grid.xCells} min={ARCHITECTURAL_GRID_LIMITS.cellsMin} max={ARCHITECTURAL_GRID_LIMITS.cellsMax} disabled={grid.locked} onChange={(value) => setGridValue("xCells", value)} />
            <NumberInput label="Cell X" value={Number(grid.cellX.toFixed(3))} min={ARCHITECTURAL_GRID_LIMITS.cellPitchMin} max={ARCHITECTURAL_GRID_LIMITS.cellPitchMax} step={0.1} disabled={grid.locked} onChange={(value) => setGridValue("cellX", value)} />
            <NumberInput label="Y cells" value={grid.yCells} min={ARCHITECTURAL_GRID_LIMITS.cellsMin} max={ARCHITECTURAL_GRID_LIMITS.cellsMax} disabled={grid.locked} onChange={(value) => setGridValue("yCells", value)} />
            <NumberInput label="Cell Y" value={Number(grid.cellY.toFixed(3))} min={ARCHITECTURAL_GRID_LIMITS.cellPitchMin} max={ARCHITECTURAL_GRID_LIMITS.cellPitchMax} step={0.1} disabled={grid.locked} onChange={(value) => setGridValue("cellY", value)} />
            <NumberInput label="Z cells" value={grid.zCells} min={ARCHITECTURAL_GRID_LIMITS.cellsMin} max={ARCHITECTURAL_GRID_LIMITS.cellsMax} disabled={grid.locked} onChange={(value) => setGridValue("zCells", value)} />
            <NumberInput label="Cell Z" value={Number(grid.cellZ.toFixed(3))} min={ARCHITECTURAL_GRID_LIMITS.cellPitchMin} max={ARCHITECTURAL_GRID_LIMITS.cellPitchMax} step={0.1} disabled={grid.locked} onChange={(value) => setGridValue("cellZ", value)} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 border-t pt-2" style={{ borderColor: "var(--line)" }}>
            <NumberInput label="Overall X" value={Number(dimensions.width.toFixed(2))} min={ARCHITECTURAL_GRID_LIMITS.overallMin} max={ARCHITECTURAL_GRID_LIMITS.overallMax} step={0.1} disabled={grid.locked} onChange={(value) => setOverallValue("x", value)} />
            <NumberInput label="Overall Y" value={Number(dimensions.height.toFixed(2))} min={ARCHITECTURAL_GRID_LIMITS.overallMin} max={ARCHITECTURAL_GRID_LIMITS.overallMax} step={0.1} disabled={grid.locked} onChange={(value) => setOverallValue("y", value)} />
            <NumberInput label="Overall Z" value={Number(dimensions.depth.toFixed(2))} min={ARCHITECTURAL_GRID_LIMITS.overallMin} max={ARCHITECTURAL_GRID_LIMITS.overallMax} step={0.1} disabled={grid.locked} onChange={(value) => setOverallValue("z", value)} />
          </div>
          <p className="mt-2 rounded bg-[var(--input-background)] px-2 py-1 text-[10px] tabular-nums" style={{ color: "var(--accent-pale)" }}>Overall: {dimensions.width.toFixed(1)} × {dimensions.height.toFixed(1)} × {dimensions.depth.toFixed(1)} ft · {dimensions.volume.toFixed(1)} ft³ · {grid.xCells * grid.yCells * grid.zCells} cells</p>
          <p className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>Changing cell pitch updates overall on that axis only. Changing overall updates pitch and keeps cell count. Letter sizes are not coupled to pitch.</p>
          {preferredSpansCells && <p className="mt-1 text-[9px]" style={{ color: "var(--accent-gold)" }}>Preferred letter footprint ({letterSizes.preferredFeet.toFixed(1)} ft) can span multiple cells (min pitch {Math.min(grid.cellX, grid.cellY).toFixed(2)} ft).</p>}
        </section>

        <section className="rounded-xl border p-3" style={panelStyle}>
          <h2 className="text-sm font-semibold">Architectural letter size</h2>
          <p className="text-[9px]" style={{ color: "var(--muted)" }}>Unrotated plan footprint in feet (scale × 0.92). Presets follow selection height guidelines and remain editable. Different letters may vary within min–max.</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {([20, 40, 60] as const).map((height) => (
              <button
                key={height}
                type="button"
                onClick={() => {
                  const sizes = controlsFromPreset(height, letterSizes);
                  setLetterSizes(sizes);
                  setRules((current) => applyLetterSizeControlsToRules(current, sizes));
                }}
                className="rounded border px-2 py-1 text-[10px]"
                style={{ borderColor: "var(--line)" }}
              >
                {height}&apos; letters
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <NumberInput label="Min size ft" value={letterSizes.minimumFeet} min={1} max={40} step={0.5} onChange={(value) => setLetterSizeValue("minimumFeet", value)} />
            <NumberInput label="Preferred ft" value={letterSizes.preferredFeet} min={1} max={40} step={0.5} onChange={(value) => setLetterSizeValue("preferredFeet", value)} />
            <NumberInput label="Max size ft" value={letterSizes.maximumFeet} min={1} max={40} step={0.5} onChange={(value) => setLetterSizeValue("maximumFeet", value)} />
            <NumberInput label="Variation %" value={letterSizes.variationPercent} min={0} max={100} step={5} onChange={(value) => setLetterSizeValue("variationPercent", value)} />
          </div>
          <div className="mt-2">
            <Check label="Preserve letter proportions" checked={letterSizes.preserveProportions} onChange={(checked) => setLetterSizeValue("preserveProportions", checked)} />
          </div>
          <p className="mt-2 text-[9px]" style={{ color: "var(--muted)" }}>Optimizer scale range {rules.minimumLetterSize.toFixed(2)}–{rules.maximumLetterSize.toFixed(2)} (preferred { (rules.preferredLetterSize ?? rules.maximumLetterSize).toFixed(2) }). Footprints {letterFootprintFeet(rules.minimumLetterSize).toFixed(1)}–{letterFootprintFeet(rules.maximumLetterSize).toFixed(1)} ft.</p>
          {legibilityReport && (
            <p className="mt-2 text-[9px]" style={{ color: legibilityReport.compromisedCount ? "#ffad95" : "var(--accent-pale)" }}>
              Legibility: score {(legibilityReport.recognizabilityProxy * 100).toFixed(0)}% · {legibilityReport.compromisedCount} compromised · {legibilityReport.watchCount} watch — {summarizeLegibility(legibilityReport)}
            </p>
          )}
        </section>



        <section className="rounded-xl border p-3" style={panelStyle}>
          <h2 className="text-sm font-semibold">Hard constraints</h2>
          <p className="text-[9px]" style={{ color: "var(--muted)" }}>Shared source geometry and feasibility limits used to generate and rank alternatives.</p>
          <h3 className="mt-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent-pale)" }}>Shared Slide geometry</h3>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
            <NumberInput label="Columns" value={store.cols} min={2} max={16} onChange={(value) => store.resizeGrid(value, store.rows)} />
            <NumberInput label="Rows" value={store.rows} min={2} max={12} onChange={(value) => store.resizeGrid(store.cols, value)} />
            <NumberInput label="XY gap" value={store.spacing} min={8} max={120} onChange={store.setSpacing} />
            <NumberInput label="Letter size" value={store.fontSize} min={16} max={96} onChange={store.setFontSize} />
            <NumberInput label="Z layers" value={store.zLayers} min={2} max={8} disabled={!store.layerMode} onChange={store.setZLayers} />
            <NumberInput label="Z gap" value={store.zSpacing} min={Z_GAP_MINIMUM} max={120} step={2} disabled={!store.layerMode} onChange={store.setZSpacing} />
            <NumberInput label="45° gap" value={store.attractorGap ?? Math.round(diagonalCenterGap(store.spacing, Math.max(0.1, store.fontSize / 50) * UNIT_LETTER_SPAN))} min={DIAGONAL_GAP_MINIMUM} max={DIAGONAL_GAP_MAXIMUM} disabled={!store.layerMode} onChange={store.setAttractorGap} />
            <NumberInput label="Thickness %" value={store.letterThickness} min={0.01} step={1} onChange={store.setLetterThickness} />
            <NumberInput label="Y range ±°" value={store.yRotationRange} min={0} max={180} step={15} disabled={!store.yRotationEnabled} onChange={store.setYRotationRange} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <Check label="3D layers" checked={store.layerMode} onChange={store.setLayerMode} />
            <Check label="Y rotation" checked={store.yRotationEnabled} onChange={store.setYRotationEnabled} />
          </div>
          <h3 className="mt-3 border-t pt-2 text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: "var(--line)", color: "var(--accent-pale)" }}>Optimizer feasibility</h3>
          <p className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>Letter footprint min/preferred/max are set in Architectural letter size (feet). Clearance remains in feet.</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <NumberInput label="Clearance" value={rules.minimumClearance} min={0} max={4} step={0.1} onChange={(value) => setRule("minimumClearance", value)} />
            <NumberInput label="Max intersections" value={rules.maximumIntersections} min={0} max={500} onChange={(value) => setRule("maximumIntersections", value)} />
            <NumberInput label="Rotation step" value={rules.rotationStep} min={1} max={90} onChange={(value) => setRule("rotationStep", value)} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <Check label="Rotate X" checked={rules.allowRotationX} onChange={(value) => setRule("allowRotationX", value)} />
            <Check label="Rotate Z" checked={rules.allowRotationZ} onChange={(value) => setRule("allowRotationZ", value)} />
            <Check label="Keep proportions" checked={rules.preserveProportions} onChange={(value) => setRule("preserveProportions", value)} />
            <Check label="Repeat objects" checked={rules.allowRepeat} onChange={(value) => setRule("allowRepeat", value)} />
            <Check label="Remove objects" checked={rules.allowRemove} onChange={(value) => setRule("allowRemove", value)} />
            <Check label="Reposition" checked={rules.allowReposition} disabled={rules.lockExistingLocations} onChange={(value) => setRule("allowReposition", value)} />
            <Check label="Lock locations" checked={rules.lockExistingLocations} onChange={(value) => setRule("lockExistingLocations", value)} />
            <Check label="Modify geometry" checked={rules.allowGeometryModification} onChange={(value) => setRule("allowGeometryModification", value)} />
          </div>
        </section>

        <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Descriptor targets</h2><p className="text-[9px]" style={{ color: "var(--muted)" }}>Zero importance excludes ranking, not measurement.</p></div></div>
          <div className="mt-2 max-h-[620px] space-y-1.5 overflow-auto pr-1">
            {DESCRIPTORS.map((descriptor) => <div key={descriptor.id} className="rounded-lg border p-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}>
              <div className="mb-1 flex justify-between"><strong className="text-[10px]">{descriptor.name}</strong><span className="text-[8px] uppercase" style={{ color: descriptor.kind === "objective" ? "var(--accent-light)" : "var(--accent-gold)" }}>{descriptor.kind}</span></div>
              <Slider label="Target" value={descriptors[descriptor.id].intensity} onChange={(value) => setDescriptor(descriptor.id, "intensity", value)} />
              <Slider label="Importance" value={descriptors[descriptor.id].importance} color="var(--accent-gold)" onChange={(value) => setDescriptor(descriptor.id, "importance", value)} />
            </div>)}
          </div>
          <div className="mt-2 flex gap-1"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1 text-[10px]" style={inputStyle} /><button type="button" onClick={savePreset} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)" }}>Save preset</button></div>
          {presets.length > 0 && <select aria-label="Load descriptor preset" value={selectedPresetId} onChange={(event) => { setSelectedPresetId(event.target.value); const preset = presets.find((item) => item.id === event.target.value); if (preset) { setDescriptors(structuredClone(preset.settings)); if (preset.prototypeCategory) setPrototypeCategory(preset.prototypeCategory); if (preset.prototypeTypology) setPrototypeTypology(preset.prototypeTypology); if (preset.prototypeSource) setDisplayMode(preset.prototypeSource === "voids" ? "void" : preset.prototypeSource === "combined" ? "both" : "letters"); } }} className="mt-1 w-full rounded border px-2 py-1 text-[10px]" style={inputStyle}><option value="" disabled>Load descriptor preset…</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>}
          {selectedPresetId && <button type="button" onClick={deletePreset} className="mt-1 rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)" }}>Delete selected preset</button>}
        </section>
      </aside>

      <section className="min-w-0 space-y-3">
        <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold">Optimization focus</h2><p className="text-[9px]" style={{ color: "var(--muted)" }}>Targets and importance remain unchanged when focus changes.</p></div>
            <div className="flex flex-wrap gap-1">{(["letter","void","combined","auto"] as OptimizationFocus[]).map((value) => <button key={value} type="button" onClick={() => { setFocus(value); setDisplayMode(displayModeForFocus(value)); }} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: focus === value ? "var(--accent)" : "var(--line)", background: focus === value ? "var(--accent-dark)" : "transparent", color: focus === value ? "var(--accent-pale)" : "var(--muted)" }}>{focusLabels[value]}</button>)}</div>
          </div>
          {(focus === "combined" || focus === "auto") && <div className="mt-2"><Slider label="Letter/void" value={controls.combinedBalance} onChange={(value) => setControl("combinedBalance", value)} /><div className="flex justify-between pl-[68px] text-[8px]" style={{ color: "var(--muted)" }}><span>0 · void</span><span>50 · equal</span><span>100 · letter</span></div></div>}
          <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-3" style={{ borderColor: "var(--line)" }}>
            <NumberInput label="Alternatives" value={Math.min(4, controls.alternatives)} min={3} max={4} onChange={(value) => setControl("alternatives", value)} />
            <NumberInput label="Generations" value={controls.generations} min={1} max={30} onChange={(value) => setControl("generations", value)} />
            <NumberInput label="Random seed" value={controls.seed} min={1} max={999999} onChange={(value) => setControl("seed", value)} />
            <div className="sm:col-span-3"><Slider label="Intensity" value={controls.intensity} onChange={(value) => setControl("intensity", value)} /></div>
            <div className="sm:col-span-3"><Slider label="Preserve" value={controls.preservePercent} color="var(--accent-light)" disabled={!lockedParent} onChange={(value) => setControl("preservePercent", value)} /></div>
            <div><Slider label="Surreal L" value={controls.surrealManualLetter} color="var(--accent-light)" onChange={(value) => setControl("surrealManualLetter", value)} /></div>
            <div><Slider label="Surreal V" value={controls.surrealManualVoid} color="var(--accent-light)" onChange={(value) => setControl("surrealManualVoid", value)} /></div>
          </div>
        </section>

        <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold">Alternative comparison</h2><p className="text-[9px]" style={{ color: "var(--muted)" }}>Alternatives are generated from the enabled letters and ranked by how many of those letters they contain. Descriptor fit breaks ties.</p></div>
            <div className="flex gap-1"><select value={displayMode} onChange={(event) => setDisplayMode(event.target.value as DisplayMode)} className="rounded border px-2 py-1 text-[10px]" style={inputStyle}><option value="letters">Letters</option><option value="void">Void proxy</option><option value="both">Letters + void</option></select>{Object.entries(overlays).map(([key, value]) => <button key={key} type="button" onClick={() => setOverlays((current) => ({ ...current, [key]: !value }))} className="rounded border px-1.5 py-1 text-[9px]" style={{ borderColor: value ? "var(--accent)" : "var(--line)", color: value ? "var(--accent-pale)" : "var(--muted)" }}>{key}</button>)}</div>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-2" style={{ borderColor: "var(--line)", background: "var(--panel-soft)" }}>
            <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--muted)" }}>Generate with</span>
            {comparisonLetters.map((letter) => {
              const enabled = selectedLetters.includes(letter);
              const available = sourceCells.filter((cell) => cell.letter === letter).length;
              return <button key={letter} type="button" aria-pressed={enabled} onClick={() => toggleComparisonLetter(letter)} className="rounded border px-3 py-1 text-[10px] font-semibold" style={{ borderColor: enabled ? "var(--accent-gold)" : "var(--line)", background: enabled ? "var(--accent-dark)" : "transparent", color: enabled ? "var(--accent-pale)" : "var(--muted)" }}>{letter} · {available}</button>;
            })}
            <span className="text-[9px]" style={{ color: "var(--muted)" }}>{selectedSourceCells.length} source letters enabled</span>
          </div>
          {evaluatedAlternatives.length === 0 ? <div className="flex h-72 items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Generate alternatives to begin comparison.</div> : <div className="grid gap-2 sm:grid-cols-2">
            {evaluatedAlternatives.slice(0, Math.max(3, controls.alternatives)).map((alternative, index) => <article key={alternative.id} className="overflow-hidden rounded-lg border" style={{ borderColor: index === selectedIndex ? "var(--accent)" : "var(--line)", background: "var(--input-background)" }}>
              <button type="button" onClick={() => setSelectedIndex(index)} className="flex w-full items-center justify-between px-2 py-1.5 text-left">
                <span className="text-[10px] font-medium">Alt {index + 1} · {focusLabels[alternative.focus]}{index === selectedIndex ? " · prototype source" : ""}</span>
                <span className="text-[10px] tabular-nums" style={{ color: "#7ee8c2" }}>{selectedLetterCount(alternative, selectedLetters)} selected letters</span>
              </button>
              <div className="h-60"><OptimizationScene alternative={alternative} grid={grid} thickness={store.letterThickness} overlays={overlays} displayMode={displayMode} /></div>
              <div className="flex items-center justify-between border-t px-2 py-1 text-[9px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}><span>seed {alternative.seed} · gen {alternative.generation + 1}</span><span>{letterInventory(alternative)}</span></div>
            </article>)}
          </div>}
        </section>

        {selected && <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold">Selected configuration</h2><p className="text-[9px]" style={{ color: "var(--muted)" }}>Seed {selected.seed} · {focusLabels[selected.focus]} · {cropRegionPlacements(selected).length} crop letters{selected.selection ? ` · window center (${selected.selection.centerX.toFixed(1)}, ${selected.selection.centerY.toFixed(1)}, ${selected.selection.centerZ.toFixed(1)})` : ""}</p></div>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setLockedParent(lockedParent?.id === selected.id ? null : selected)} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: lockedParent?.id === selected.id ? "var(--accent-light)" : "var(--line)", color: lockedParent?.id === selected.id ? "var(--accent-pale)" : "var(--ink)" }}>{lockedParent?.id === selected.id ? "Configuration locked" : "Lock for next run"}</button>
              <button type="button" onClick={() => downloadFile(`vul-optimized-${selected.seed}.obj`, compositionObj(selected, store.letterThickness), "text/plain")} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)" }}>Export OBJ</button>
              <button type="button" onClick={() => downloadFile(`vul-analysis-${selected.seed}.json`, JSON.stringify({ units: "feet", feetPerModelUnit: 1, legacySliderUnitsPerFoot: 50, grid, selection, rules, controls, focus, descriptors, alternative: selected }, null, 2), "application/json")} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)" }}>Export JSON</button>
              <button type="button" onClick={() => downloadFile(`vul-analysis-${selected.seed}.csv`, resultsCsv(selected), "text/csv")} className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--line)" }}>Export CSV</button>
            </div>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[9px]">
              <thead style={{ color: "var(--muted)" }}><tr><th className="p-1 text-left">Descriptor</th><th>Target</th><th>Importance</th><th>Active</th><th>Deviation</th><th>Letter raw</th><th>Letter 0–100</th><th>Void raw</th><th>Void 0–100</th><th className="text-left">Reliability</th></tr></thead>
              <tbody>{selected.evaluation.descriptors.map((item) => <tr key={item.id} className="border-t" style={{ borderColor: "var(--panel-border)" }}>
                <td className="p-1 font-medium">{DESCRIPTORS.find((descriptor) => descriptor.id === item.id)?.name}</td>
                <td className="text-center">{item.target}</td><td className="text-center">{item.importance}</td>
                <td className="text-center">{item.activeValue?.toFixed(1) ?? "N/A"}</td><td className="text-center">{item.deviation?.toFixed(1) ?? "N/A"}</td>
                <td className="text-center" title={item.letter.method}>{item.letter.applicable ? `${item.letter.raw?.toFixed(2)} ${item.letter.unit}` : "N/A"}</td>
                <td className="text-center">{item.letter.normalized?.toFixed(1) ?? "N/A"}</td>
                <td className="text-center" title={item.void.method}>{item.void.applicable ? `${item.void.raw?.toFixed(2)} ${item.void.unit}` : "N/A"}</td>
                <td className="text-center">{item.void.normalized?.toFixed(1) ?? "N/A"}</td>
                <td className="text-left" style={{ color: item.letter.reliability === "manual assessment" || item.void.reliability === "manual assessment" ? "var(--accent-gold)" : "var(--muted)" }}>{item.letter.reliability === item.void.reliability ? item.letter.reliability : `L: ${item.letter.reliability}; V: ${item.void.reliability}`}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>}
      </section>

      <aside className="space-y-3">
        <section className="rounded-xl border p-3" style={panelStyle}>
          <h2 className="text-sm font-semibold">Analysis summary</h2>
          {!selected ? <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>No selected result.</p> : <>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[["Weighted fit", selected.evaluation.fit?.toFixed(1) ?? "Not ranked"],["Void volume", `${(selected.evaluation.raw.voidRatio * 100).toFixed(1)}%`],["Accessible void", `${(selected.evaluation.raw.accessibleVoidRatio * 100).toFixed(1)}%`],["Sightlines", `${(selected.evaluation.raw.sightlineRatio * 100).toFixed(1)}%`],["Sky proxy", `${(selected.evaluation.raw.skyExposureRatio * 100).toFixed(1)}%`],["Intersections", selected.evaluation.raw.intersectionCount]].map(([label, value]) => <div key={String(label)} className="rounded border p-2" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}><div className="text-[8px] uppercase" style={{ color: "var(--muted)" }}>{label}</div><div className="text-sm tabular-nums">{value}</div></div>)}
            </div>
            {selected.selection && <div className="mt-2 rounded border p-2 text-[9px]" style={{ borderColor: "var(--accent-gold)", color: "var(--accent-gold)", background: "var(--input-background)" }}>
              Best {selected.selection.width.toFixed(1)} × {selected.selection.height.toFixed(1)} × {selected.selection.depth.toFixed(1)} subsection at overall coordinates ({selected.selection.centerX.toFixed(2)}, {selected.selection.centerY.toFixed(2)}, {selected.selection.centerZ.toFixed(2)}). Evaluated {selected.selection.evaluatedPositions} candidate positions{selected.selection.exhaustive ? " exhaustively" : ` from ${selected.selection.totalPositions} grid positions plus source-aware samples`}.
            </div>}
            <div className="mt-2"><h3 className="text-[10px] font-medium">Key tradeoffs</h3>{selected.evaluation.tradeoffs.map((tradeoff) => <p key={tradeoff} className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>• {tradeoff}</p>)}</div>
            <p className="mt-2 text-[9px]" style={{ color: "var(--text-secondary)" }}>Void connectivity, visibility, and daylight are geometric voxel proxies. They are not validated circulation, code, or daylight-performance simulations.</p>
          </>}
        </section>

        <section className="rounded-xl border p-3" style={panelStyle}>
          <div className="flex justify-between"><h2 className="text-sm font-semibold">Saved configurations</h2>{savedDesigns.length > 0 && <button type="button" onClick={() => setSavedDesigns([])} className="text-[9px]" style={{ color: "var(--muted)" }}>Clear</button>}</div>
          {savedDesigns.length === 0 ? <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>Save a complete grid, objective, geometry, and analysis state.</p> : <div className="mt-2 max-h-64 space-y-1 overflow-auto">{savedDesigns.map((design) => <button key={design.id} type="button" onClick={() => restoreDesign(design)} className="w-full rounded border p-2 text-left" style={{ borderColor: "var(--line)", background: "var(--input-background)" }}><div className="text-[10px] font-medium">{design.name}</div><div className="text-[8px]" style={{ color: "var(--muted)" }}>{design.created} · {design.alternatives.length} alternatives</div></button>)}</div>}
        </section>

        <section className="rounded-xl border p-3" style={panelStyle}>
          <h2 className="text-sm font-semibold">Configuration history</h2>
          {history.length === 0 ? <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>Optimization runs are kept here. Select any run to restore it; newer runs stay available.</p> : <div className="mt-2 max-h-48 space-y-1 overflow-auto">{history.map((run, index) => {
            const isActive = run.id === activeHistoryId;
            return <div key={run.id} className="flex gap-1"><button type="button" onClick={() => restoreHistoryRun(index)} className="w-full rounded border p-2 text-left text-[9px] transition-colors hover:bg-[var(--panel-background)]" style={{ borderColor: isActive ? "var(--accent-secondary)" : "var(--line)", background: isActive ? "var(--panel-background)" : "var(--input-background)", color: isActive ? "var(--accent-light)" : undefined }}><strong>Run {history.length - index}</strong> · seed {run.seed} · {focusLabels[run.focus]} · {run.fit?.toFixed(1) ?? "unranked"}{isActive ? " · active" : ""}<div className="mt-0.5 text-[8px]" style={{ color: "var(--muted)" }}>{run.alternatives.length} alternatives · click to restore</div></button><button type="button" aria-label={`Delete run ${history.length - index}`} onClick={() => deleteHistory(run.id)} className="rounded border px-2 text-[9px]" style={{borderColor:"var(--line)"}}>Delete</button></div>;
          })}</div>}
        </section>

        <section className="rounded-xl border p-3 text-[9px]" style={panelStyle}>
          <h2 className="text-sm font-semibold">Evaluation basis</h2>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Enabled-letter count determines comparison order. Descriptor fit resolves ties between alternatives with the same selected-letter count.</p>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Circulation clearance is excluded from comparison ranking and does not produce an invalid warning in this panel.</p>
        </section>
      </aside>
    </div>
    <PrototypeDemonstration
      key="architecture-workflow"
      selectionOnly={Boolean(selected?.selection)}
      sourcePlacements={prototypeSourcePlacements}
      completeSourcePlacements={completePrototypePlacements}
      sourceLabel={prototypeSourceLabel}
      envelopeHeight={isSelectionHeightFeet(selection.heightRouting) ? selection.heightRouting : 20}
      sourceBounds={selected?.selection ?? dimensions}
      sourceThickness={rules.letterThicknessPercent}
      sourceOptions={prototypeSourceOptions}
      selectedSourceIndex={Math.min(selectedIndex, Math.max(0, evaluatedAlternatives.length - 1))}
      onSourceIndexChange={setSelectedIndex}
      descriptors={descriptors}
      selectedMode={displayMode === "void" ? "voids" : displayMode === "both" ? "combined" : "letters"}
      onSelectedModeChange={(mode: PrototypeGeometryMode) => setDisplayMode(mode === "voids" ? "void" : mode === "combined" ? "both" : "letters")}
      selectedCategory={prototypeCategory}
      selectedTypology={prototypeTypology}
      onSelectedCategoryChange={(category: PrototypeCategory) => { setPrototypeCategory(category); setPrototypeTypology(DEFAULT_TYPOLOGY_BY_CATEGORY[category]); }}
      onSelectedTypologyChange={setPrototypeTypology}
    />
  </div></main>;
}







