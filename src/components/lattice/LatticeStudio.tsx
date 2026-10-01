"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import AppNav from "../AppNav";
import { analyzeMesh } from "./analyze";
import { assembledObj, assemblyManifest, voxelUnionObj } from "./exportAssembly";
import type { LatticeViewportHandle } from "./LatticeViewport";

const LatticeViewport = dynamic(() => import("./LatticeViewport"), { ssr: false });
import { parseObj } from "./parseObj";
import { evaluateAssembly, placedFromRecord, searchAssemblies } from "./search";
import { DEFAULT_DISTRIBUTION_PREFS } from "./distribution";
import { LATTICE_SLOTS, slotById } from "./slots";
import { LATTICE_SESSION_KEY, readJson, writeJson } from "../browserSession";
import {
  clampLatticeCells,
  DEFAULT_LATTICE_FIELD,
  latticePerformanceWarning,
  MAX_IMPORTS,
  REQUIRED_TILES,
  resolvedUp,
  UNIT_TO_FEET,
  type Assembly,
  type CameraMode,
  type ColorMode,
  type ContinuityOverlay,
  type DiagnosticMode,
  type DistributionPrefs,
  type ImportedObj,
  type LatticeField,
  type Placement,
  type PlacementNote,
  type SearchStats,
  type TileModel,
  type UnitName,
  type UpAxisMode,
} from "./types";

const buttonClass = "rounded border px-2 py-1 text-[10px] disabled:opacity-40";
const buttonStyle = { borderColor: "var(--line)" } as const;

function download(name: string, content: BlobPart, type: string) {
  const url = typeof content === "string" && content.startsWith("data:") ? content : URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  if (!url.startsWith("data:")) URL.revokeObjectURL(url);
}

function emptyPlacement(meshId: string, slotId: string | null): Placement {
  return { meshId, slotId, rotation: 0, mirror: "none", ix: 0, iy: 0, iz: 0, locked: false };
}

function sourceIdOf(id: string) {
  const split = id.indexOf("::");
  return split === -1 ? id : id.slice(0, split);
}

function boardFromTiles(
  tiles: Assembly["tiles"],
  sourceModels: TileModel[],
  sourceMeshes: ImportedObj[],
  previous: { placements: Record<string, Placement> } | null = null,
) {
  const modelById = new Map(sourceModels.map((model) => [model.id, model]));
  const meshById = new Map(sourceMeshes.map((mesh) => [mesh.id, mesh]));
  const lockedCells = new Set(
    Object.values(previous?.placements ?? {})
      .filter((placement) => placement.locked)
      .map((placement) => `${placement.ix},${placement.iy},${placement.iz}`),
  );
  const instanceMeshes: ImportedObj[] = [];
  const instanceModels: TileModel[] = [];
  const instancePlacements: Record<string, Placement> = {};
  for (const tile of tiles) {
    const sourceId = sourceIdOf(tile.id);
    const sourceModel = modelById.get(tile.id) ?? modelById.get(sourceId);
    const sourceMesh = meshById.get(tile.id) ?? meshById.get(sourceId);
    const variant = sourceModel?.variants[tile.variant];
    if (!sourceModel || !sourceMesh || !variant) continue;
    instanceMeshes.push({ ...sourceMesh, id: tile.id });
    instanceModels.push({ ...sourceModel, id: tile.id });
    instancePlacements[tile.id] = {
      meshId: tile.id,
      slotId: sourceModel.slotId,
      rotation: variant.rotation,
      mirror: variant.mirror,
      ix: tile.ix,
      iy: tile.iy,
      iz: tile.iz,
      locked: lockedCells.has(`${tile.ix},${tile.iy},${tile.iz}`),
    };
  }
  return { meshes: instanceMeshes, models: instanceModels, placements: instancePlacements };
}

type PackedMesh = Omit<ImportedObj, "positions" | "normals"> & {
  positions: number[];
  normals: number[];
};

type LatticeSession = {
  version: 1;
  meshes: PackedMesh[];
  assignments: Record<string, string | null>;
  unit: UnitName;
  upAxisMode: UpAxisMode;
  field: LatticeField;
  placements: Record<string, Placement>;
  options: Assembly[] | null;
  activeOption: "A" | "B" | "C" | "manual";
  selectedId: string | null;
  colorMode: ColorMode;
  showLattice: boolean;
  showConnections: boolean;
  cameraMode: CameraMode;
  diagnostic: DiagnosticMode;
  continuityOverlay: ContinuityOverlay;
  presentation: boolean;
  status: string;
  distributionWeight: number;
  clusteringPercent: number;
  balanceTypologies: boolean;
  balanceCategories: boolean;
  preventLargeClusters: boolean;
  stats: SearchStats | null;
  copyCount: 2 | 4 | 8;
};

function packMesh(mesh: ImportedObj): PackedMesh {
  return {
    ...mesh,
    positions: Array.from(mesh.positions),
    normals: Array.from(mesh.normals),
  };
}

function unpackMesh(mesh: PackedMesh): ImportedObj {
  return {
    ...mesh,
    positions: new Float32Array(mesh.positions),
    normals: new Float32Array(mesh.normals),
  };
}

export default function LatticeStudio() {
  const [meshes, setMeshes] = useState<ImportedObj[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [unit, setUnit] = useState<UnitName>("feet");
  const [upAxisMode, setUpAxisMode] = useState<UpAxisMode>("auto");
  const [field, setField] = useState<LatticeField>(DEFAULT_LATTICE_FIELD);
  const [fieldRevision, setFieldRevision] = useState(0);
  const [prefsRevision, setPrefsRevision] = useState(0);
  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [models, setModels] = useState<TileModel[]>([]);
  const [options, setOptions] = useState<Assembly[] | null>(null);
  const [activeOption, setActiveOption] = useState<"A" | "B" | "C" | "manual">("manual");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("category");
  const [showLattice, setShowLattice] = useState(false);
  const [showConnections, setShowConnections] = useState(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>("iso");
  const [diagnostic, setDiagnostic] = useState<DiagnosticMode>("originals");
  const [continuityOverlay, setContinuityOverlay] = useState<ContinuityOverlay>("all");
  const [presentation, setPresentation] = useState(false);
  const [status, setStatus] = useState("Upload OBJ meshes. Fifteen typology slots are ready.");
  const [distributionWeight, setDistributionWeight] = useState(70);
  const [clusteringPercent, setClusteringPercent] = useState(40);
  const [balanceTypologies, setBalanceTypologies] = useState(true);
  const [balanceCategories, setBalanceCategories] = useState(true);
  const [preventLargeClusters, setPreventLargeClusters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [copyCount, setCopyCount] = useState<2 | 4 | 8>(4);
  const [copyWarning, setCopyWarning] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<Array<{ slotId: string; score: number; tiles: number; warning: string | null }>>([]);
  const [preview, setPreview] = useState<{ meshes: ImportedObj[]; models: TileModel[]; placements: Record<string, Placement> } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const cache = useRef(new Map<string, TileModel>());
  const cancelRef = useRef(0);
  const busyRef = useRef(false);
  const viewRef = useRef<LatticeViewportHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingAssembly = useRef<{ options: Assembly[]; active: "A" | "B" | "C" | "manual"; placements: Record<string, Placement> } | null>(null);
  busyRef.current = busy;

  const assigned = useMemo(() => LATTICE_SLOTS.flatMap((slot) => {
    const mesh = meshes.find((item) => item.id === assignments[slot.id]);
    return mesh ? [{ slot, mesh }] : [];
  }), [assignments, meshes]);
  const missing = LATTICE_SLOTS.filter((slot) => !assignments[slot.id]);
  const report = useMemo(() => models.length >= 2 ? evaluateAssembly(models, placedFromRecord(models, placements)) : null, [models, placements]);
  const selected = (preview?.meshes ?? meshes).find((mesh) => mesh.id === selectedId) ?? null;
  const selectedPlacement = selected ? (preview?.placements[selected.id] ?? placements[selected.id] ?? null) : null;
  const selectedModel = (preview?.models.find((model) => model.id === selectedId) ?? models.find((model) => model.id === (selected ? sourceIdOf(selected.id) : ""))) ?? null;

  useEffect(() => {
    const saved = readJson<LatticeSession>(LATTICE_SESSION_KEY);
    if (saved?.version === 1 && Array.isArray(saved.meshes)) {
      const restoredMeshes = saved.meshes.map(unpackMesh);
      setMeshes(restoredMeshes);
      if (saved.assignments) setAssignments(saved.assignments);
      if (saved.unit) setUnit(saved.unit);
      if (saved.upAxisMode) setUpAxisMode(saved.upAxisMode);
      if (saved.field) {
        setField({
          cellsX: clampLatticeCells(saved.field.cellsX),
          cellsY: clampLatticeCells(saved.field.cellsY),
          cellsZ: clampLatticeCells(saved.field.cellsZ),
        });
      }
      if (saved.placements) setPlacements(saved.placements);
      if (saved.options) setOptions(saved.options);
      if (saved.activeOption) setActiveOption(saved.activeOption);
      if (saved.selectedId !== undefined) setSelectedId(saved.selectedId);
      if (saved.colorMode) setColorMode(saved.colorMode);
      if (typeof saved.showLattice === "boolean") setShowLattice(saved.showLattice);
      if (typeof saved.showConnections === "boolean") setShowConnections(saved.showConnections);
      if (saved.cameraMode) setCameraMode(saved.cameraMode);
      if (saved.diagnostic) setDiagnostic(saved.diagnostic);
      if (saved.continuityOverlay) setContinuityOverlay(saved.continuityOverlay);
      if (typeof saved.presentation === "boolean") setPresentation(saved.presentation);
      if (typeof saved.status === "string") setStatus(saved.status);
      if (typeof saved.distributionWeight === "number") setDistributionWeight(saved.distributionWeight);
      if (typeof saved.clusteringPercent === "number") setClusteringPercent(saved.clusteringPercent);
      if (typeof saved.balanceTypologies === "boolean") setBalanceTypologies(saved.balanceTypologies);
      if (typeof saved.balanceCategories === "boolean") setBalanceCategories(saved.balanceCategories);
      if (typeof saved.preventLargeClusters === "boolean") setPreventLargeClusters(saved.preventLargeClusters);
      if (saved.stats) setStats(saved.stats);
      if (saved.copyCount === 2 || saved.copyCount === 4 || saved.copyCount === 8) setCopyCount(saved.copyCount);
      if (saved.options?.length) {
        pendingAssembly.current = {
          options: saved.options,
          active: saved.activeOption ?? "A",
          placements: saved.placements ?? {},
        };
      }
      setStatus(saved.status || `Restored Part 2 session · ${restoredMeshes.length} OBJ${restoredMeshes.length === 1 ? "" : "s"}.`);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    const pending = pendingAssembly.current;
    if (!sessionReady || !pending || models.length < 1 || meshes.length < 1) return;
    pendingAssembly.current = null;
    const option = pending.options.find((item) => item.id === pending.active) ?? pending.options[0];
    if (!option) return;
    setPreview(boardFromTiles(option.tiles, models, meshes, { placements: pending.placements }));
    setActiveOption(option.id);
    setDiagnostic("distribution");
    setColorMode("typology");
  }, [sessionReady, models, meshes]);

  useEffect(() => {
    if (!sessionReady) return;
    const payload: LatticeSession = {
      version: 1,
      meshes: meshes.map(packMesh),
      assignments,
      unit,
      upAxisMode,
      field,
      placements,
      options,
      activeOption,
      selectedId,
      colorMode,
      showLattice,
      showConnections,
      cameraMode,
      diagnostic,
      continuityOverlay,
      presentation,
      status,
      distributionWeight,
      clusteringPercent,
      balanceTypologies,
      balanceCategories,
      preventLargeClusters,
      stats,
      copyCount,
    };
    const handle = window.setTimeout(() => {
      if (!writeJson(LATTICE_SESSION_KEY, payload)) {
        // Retry without bulky diagnostic notes if quota is tight.
        const slim = {
          ...payload,
          options: payload.options?.map((option) => ({ ...option, placementNotes: undefined, connections: option.connections.slice(0, 80) })) ?? null,
        };
        writeJson(LATTICE_SESSION_KEY, slim);
      }
    }, 450);
    return () => window.clearTimeout(handle);
  }, [
    sessionReady, meshes, assignments, unit, upAxisMode, field, placements, options, activeOption, selectedId,
    colorMode, showLattice, showConnections, cameraMode, diagnostic, continuityOverlay, presentation, status,
    distributionWeight, clusteringPercent, balanceTypologies, balanceCategories, preventLargeClusters, stats, copyCount,
  ]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const scale = UNIT_TO_FEET[unit];
      const sources = meshes.map((mesh) => {
        const slot = LATTICE_SLOTS.find((item) => assignments[item.id] === mesh.id);
        return { mesh, slotId: slot?.id ?? mesh.suggestedSlotId };
      });
      const built: TileModel[] = [];
      for (const item of sources) {
        const up = resolvedUp(item.mesh.upAxis, upAxisMode);
        const key = `${item.mesh.id}:${unit}:${up}`;
        let model = cache.current.get(key);
        if (!model) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (cancelled) return;
          model = analyzeMesh(item.mesh, item.slotId, scale, up);
          cache.current.set(key, model);
        }
        built.push({ ...model, slotId: item.slotId });
      }
      const cell = built.reduce((largest, model) => Math.max(largest, model.cellFeet), 2);
      const aligned = built.map((model) => {
        if (model.cellFeet === cell) return model;
        const source = sources.find((item) => item.mesh.id === model.id);
        if (!source) return model;
        const up = resolvedUp(source.mesh.upAxis, upAxisMode);
        const key = `${model.id}:${unit}:${up}:${cell}`;
        const cached = cache.current.get(key) ?? analyzeMesh(source.mesh, source.slotId, scale, up, cell);
        cache.current.set(key, cached);
        return { ...cached, slotId: source.slotId };
      });
      if (cancelled) return;
      setModels(aligned);
      setPlacements((current) => {
        const next = { ...current };
        for (const model of aligned) next[model.id] = { ...(next[model.id] ?? emptyPlacement(model.id, model.slotId)), slotId: model.slotId };
        return next;
      });
    };
    void run();
    return () => { cancelled = true; };
  }, [meshes, assignments, unit, upAxisMode]);

  useEffect(() => {
    if (fieldRevision === 0 || models.length < 1) return;
    const handle = window.setTimeout(() => { void runSearch(); }, 400);
    return () => window.clearTimeout(handle);
  }, [fieldRevision, models.length]);

  useEffect(() => {
    if (prefsRevision === 0 || models.length < 1) return;
    const handle = window.setTimeout(() => {
      if (busyRef.current) return;
      void runSearch();
    }, 900);
    return () => window.clearTimeout(handle);
  }, [prefsRevision, models.length]);

  function bumpDistributionPrefs() {
    setPrefsRevision((current) => current + 1);
  }

  function clearSavedSession() {
    cancelRef.current += 1;
    pendingAssembly.current = null;
    window.localStorage.removeItem(LATTICE_SESSION_KEY);
    setMeshes([]);
    setAssignments({});
    setUnit("feet");
    setUpAxisMode("auto");
    setField(DEFAULT_LATTICE_FIELD);
    setFieldRevision(0);
    setPrefsRevision(0);
    setPlacements({});
    setModels([]);
    setOptions(null);
    setActiveOption("manual");
    setSelectedId(null);
    setColorMode("category");
    setShowLattice(false);
    setShowConnections(true);
    setCameraMode("iso");
    setDiagnostic("originals");
    setContinuityOverlay("all");
    setPresentation(false);
    setStatus("Part 2 session cleared. Upload OBJ meshes to begin again.");
    setDistributionWeight(70);
    setClusteringPercent(40);
    setBalanceTypologies(true);
    setBalanceCategories(true);
    setPreventLargeClusters(true);
    setBusy(false);
    setProgressPercent(null);
    setStats(null);
    setCopyCount(4);
    setCopyWarning(null);
    setCatalogue([]);
    setPreview(null);
    cache.current.clear();
  }

  async function importFiles(files: File[]) {
    const room = MAX_IMPORTS - meshes.length;
    const accepted = [...files].filter((file) => file.name.toLowerCase().endsWith(".obj")).slice(0, room);
    if (!accepted.length) {
      setStatus(room <= 0 ? `The upload limit is ${MAX_IMPORTS} OBJ files.` : "Choose OBJ files.");
      return;
    }
    const parsed: ImportedObj[] = [];
    const errors: string[] = [];
    for (let index = 0; index < accepted.length; index += 1) {
      setStatus(`Importing ${index + 1} / ${accepted.length}: ${accepted[index].name}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      try { parsed.push(parseObj(await accepted[index].text(), accepted[index].name)); }
      catch (error) { errors.push(error instanceof Error ? error.message : accepted[index].name); }
    }
    setMeshes((current) => [...current, ...parsed].slice(0, MAX_IMPORTS));
    setAssignments((current) => {
      const next = { ...current };
      for (const mesh of parsed) {
        if (mesh.suggestedSlotId && !next[mesh.suggestedSlotId]) next[mesh.suggestedSlotId] = mesh.id;
      }
      return next;
    });
    setPreview(null);
    setStatus(`Imported ${parsed.length} OBJ file${parsed.length === 1 ? "" : "s"}.${errors.length ? ` ${errors[0]}` : ""}`);
  }

  function removeMesh(meshId: string) {
    const mesh = meshes.find((item) => item.id === meshId);
    cancelRef.current += 1;
    setBusy(false);
    setMeshes((current) => current.filter((item) => item.id !== meshId));
    setAssignments((current) => {
      const next = { ...current };
      for (const slot of LATTICE_SLOTS) if (next[slot.id] === meshId) next[slot.id] = null;
      return next;
    });
    setPlacements((current) => {
      const next = { ...current };
      delete next[meshId];
      return next;
    });
    setModels((current) => current.filter((model) => model.id !== meshId));
    setOptions(null);
    setStats(null);
    setActiveOption("manual");
    setPresentation(false);
    setPreview(null);
    if (selectedId === meshId) setSelectedId(null);
    for (const key of [...cache.current.keys()]) if (key.startsWith(`${meshId}:`)) cache.current.delete(key);
    setStatus(mesh ? `Removed ${mesh.filename}.` : "Removed OBJ.");
  }

  async function runSearch() {
    const token = ++cancelRef.current;
    setBusy(true);
    setProgressPercent(0);
    setStatus("Starting assembly…");
    const started = performance.now();
    const currentModels = models;
    const cells = field.cellsX * field.cellsY * field.cellsZ;
    if (currentModels.length < 1) {
      setBusy(false);
      setProgressPercent(null);
      setStatus("Upload at least one OBJ before filling the lattice.");
      return;
    }
    const distribution: DistributionPrefs = {
      ...DEFAULT_DISTRIBUTION_PREFS,
      weight: distributionWeight / 100,
      clustering: clusteringPercent / 100,
      balanceTypologies,
      balanceCategories,
      preventLargeClusters,
    };
    try {
      const lockedPlacements = Object.values(preview?.placements ?? placements);
      const result = await searchAssemblies(currentModels, lockedPlacements, {
        cancelled: () => token !== cancelRef.current,
        onProgress: (message, percent) => {
          setStatus(message);
          if (percent !== undefined) setProgressPercent(percent);
        },
      }, field, { populate: true, distribution });
      if (token !== cancelRef.current) return;
      result.stats.analysisMilliseconds = performance.now() - started - result.stats.milliseconds;
      const board = boardFromTiles(result.options[0].tiles, currentModels, meshes, preview);
      setOptions(result.options);
      setStats(result.stats);
      setPreview(board);
      setActiveOption("A");
      setDiagnostic("distribution");
      setColorMode("typology");
      setPresentation(false);
      setProgressPercent(100);
      const unique = new Set(board.models.map((model) => sourceIdOf(model.id))).size;
      const dist = result.options[0].distributionScore;
      const maxCluster = result.options[0].distribution?.maxCluster ?? 0;
      setStatus(`Option A assembles ${board.meshes.length} / ${cells} cells with ${unique} OBJ types. Interlock ${result.options[0].score.toFixed(1)} · Distribution ${dist.toFixed(1)} · Largest same-type cluster ${maxCluster}.`);
    } catch (error) {
      if (error instanceof Error && error.message === "cancelled") setStatus((current) => current.startsWith("Removed ") ? current : "Aggregation cancelled.");
      else setStatus(error instanceof Error ? error.message : "Aggregation failed.");
    } finally {
      if (token === cancelRef.current) {
        setBusy(false);
        setProgressPercent(null);
      }
    }
  }

  function chooseOption(option: Assembly) {
    const board = boardFromTiles(option.tiles, models, meshes, preview);
    setPreview(board);
    setActiveOption(option.id);
    setDiagnostic("distribution");
    setColorMode("typology");
    setPresentation(false);
    const cells = field.cellsX * field.cellsY * field.cellsZ;
    setStatus(`Option ${option.id} assembles ${board.meshes.length} / ${cells} cells. Interlock ${option.score.toFixed(1)} · Distribution ${option.distributionScore.toFixed(1)} · Largest same-type cluster ${option.distribution?.maxCluster ?? 0}.`);
  }

  function updateSelected(change: Partial<Placement>) {
    if (!selected || selectedPlacement?.locked) return;
    setActiveOption("manual");
    const apply = (current: Record<string, Placement>) => {
      const previous = current[selected.id];
      if (!previous) return current;
      const next = { ...previous, ...change };
      next.ix = Math.max(0, Math.min(field.cellsX - 1, next.ix));
      next.iy = Math.max(0, Math.min(field.cellsY - 1, next.iy));
      next.iz = Math.max(0, Math.min(field.cellsZ - 1, next.iz));
      return { ...current, [selected.id]: next };
    };
    if (preview) setPreview({ ...preview, placements: apply(preview.placements) });
    else {
      setPresentation(false);
      setPlacements((current) => apply(current));
    }
  }

  function setLatticeCells(axis: keyof LatticeField, value: number) {
    const cells = clampLatticeCells(value);
    if (field[axis] === cells) return;
    setField({ ...field, [axis]: cells });
    setFieldRevision((current) => current + 1);
  }

  async function runCopies(count: 2 | 4 | 8) {
    const model = selectedModel ?? models[0];
    const mesh = meshes.find((item) => item.id === model?.id);
    if (!model || !mesh) return;
    const token = ++cancelRef.current;
    setBusy(true);
    setProgressPercent(0);
    setCopyCount(count);
    const copies = Array.from({ length: count }, (_, index) => ({ ...model, id: `${model.id}::${index}`, filename: `${mesh.filename} copy ${index + 1}` }));
    const copyMeshes = copies.map((copy, index) => ({ ...mesh, id: copy.id, filename: copy.filename, suggestedSlotId: mesh.suggestedSlotId }));
    try {
      const result = await searchAssemblies(copies, [], {
        cancelled: () => token !== cancelRef.current,
        onProgress: (message, percent) => {
          setStatus(message);
          if (percent !== undefined) setProgressPercent(percent);
        },
      }, field);
      if (token !== cancelRef.current) return;
      const best = result.options[0];
      const failed = best.tiles.length < count || best.connections.length === 0 || best.connections.every((connection) => connection.interlock === "FAIL");
      setCopyWarning(failed ? `${slotById(model.slotId)?.code ?? mesh.filename} cannot form a ${count}-copy interlock through rotation, mirror, and lattice shifts alone. The source mesh was not remodeled.` : null);
      const nextPlacements: Record<string, Placement> = {};
      for (const tile of best.tiles) {
        const variant = copies.find((item) => item.id === tile.id)?.variants[tile.variant];
        nextPlacements[tile.id] = { meshId: tile.id, slotId: model.slotId, rotation: variant?.rotation ?? 0, mirror: variant?.mirror ?? "none", ix: tile.ix, iy: tile.iy, iz: tile.iz, locked: false };
      }
      setPreview({ meshes: copyMeshes, models: copies, placements: nextPlacements });
      setDiagnostic("copies");
      setPresentation(false);
      setProgressPercent(100);
      setStatus(`${count}-copy test score ${best.score.toFixed(1)}.`);
    } catch (error) {
      if (!(error instanceof Error && error.message === "cancelled")) setStatus(error instanceof Error ? error.message : "Copy test failed.");
    } finally {
      if (token === cancelRef.current) {
        setBusy(false);
        setProgressPercent(null);
      }
    }
  }

  async function runCatalogue() {
    if (!models.length) return;
    const token = ++cancelRef.current;
    setBusy(true);
    setProgressPercent(0);
    const rows: Array<{ slotId: string; score: number; tiles: number; warning: string | null }> = [];
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      if (token !== cancelRef.current) return;
      const mesh = meshes.find((item) => item.id === model.id);
      if (!mesh) continue;
      const cataloguePct = Math.round((index / Math.max(1, models.length)) * 100);
      setProgressPercent(cataloguePct);
      setStatus(`Catalogue ${slotById(model.slotId)?.code ?? model.filename} · ${cataloguePct}%`);
      const copies = Array.from({ length: 4 }, (_, copyIndex) => ({ ...model, id: `${model.id}::${copyIndex}` }));
      const result = await searchAssemblies(copies, [], {
        cancelled: () => token !== cancelRef.current,
        onProgress: (_message, percent) => {
          if (percent === undefined) return;
          const local = cataloguePct + Math.round((percent / 100) * (100 / Math.max(1, models.length)));
          setProgressPercent(Math.min(99, local));
        },
      }, field);
      const best = result.options[0];
      const warning = best.tiles.length < 4 || best.connections.every((connection) => connection.interlock === "FAIL") ? "Needs review: rigid copies did not interlock." : null;
      rows.push({ slotId: model.slotId ?? model.filename, score: best.score, tiles: best.tiles.length, warning });
    }
    if (token === cancelRef.current) {
      setCatalogue(rows);
      setDiagnostic("copies");
      setProgressPercent(100);
      setStatus(`Catalogue test finished for ${rows.length} typologies.`);
      setBusy(false);
      setProgressPercent(null);
    }
  }

  function exportPng(name: string, overlay: "clean" | "lattice" = "clean", nextCamera?: CameraMode) {
    const previousLattice = showLattice;
    const previousConnections = showConnections;
    if (nextCamera) setCameraMode(nextCamera);
    setShowLattice(overlay === "lattice");
    setShowConnections(false);
    const finish = () => {
      try {
        const url = viewRef.current?.capture();
        if (url) download(name, url, "image/png");
      } finally {
        setShowLattice(previousLattice);
        setShowConnections(previousConnections);
      }
    };
    // Wait for React state + R3F to paint without the grid before capturing.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(finish, 180);
      });
    });
  }

  const shown = preview ?? { meshes: assigned.map((item) => item.mesh), models, placements };
  const activeAssembly = options?.find((option) => option.id === activeOption) ?? null;
  const shownReport = preview && activeAssembly ? activeAssembly : report;
  const cellCount = field.cellsX * field.cellsY * field.cellsZ;
  const listedConnections = shownReport?.connections.slice(0, 24) ?? [];
  const selectedNote: PlacementNote | null = activeAssembly?.placementNotes?.find((note) => note.tileId === selectedId)
    ?? activeAssembly?.placementNotes?.find((note) => note.ix === selectedPlacement?.ix && note.iy === selectedPlacement?.iy && note.iz === selectedPlacement?.iz)
    ?? null;
  const selectedLinks = shownReport?.connections.filter((connection) => connection.tileA === selectedId || connection.tileB === selectedId) ?? [];

  return (
    <div
      className="flex h-screen flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); void importFiles([...event.dataTransfer.files]); }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="text-sm">Part 2 registration lattice for 15 OBJ meshes</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>{field.cellsX} × {field.cellsY} × {field.cellsZ} cells · 20 ft each. Interlock + global distribution assembly.</div>
        </div>
        <AppNav />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="overflow-auto border-r p-3" style={{ borderColor: "var(--line)" }}>
          <button type="button" className={buttonClass} style={buttonStyle} onClick={() => fileRef.current?.click()}>Upload OBJ files</button>
          <input ref={fileRef} type="file" accept=".obj" multiple hidden onChange={(event) => { if (event.target.files) void importFiles([...event.target.files]); event.target.value = ""; }} />
            <button type="button" className={`${buttonClass} ml-2`} style={buttonStyle} onClick={() => void loadSamples(importFiles).catch((error) => setStatus(error instanceof Error ? error.message : "Sample load failed."))}>Load 15 samples</button>
          <label className="mt-3 block text-[10px]" style={{ color: "var(--muted)" }}>
            Global units
            <select className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]" style={buttonStyle} value={unit} onChange={(event) => setUnit(event.target.value as UnitName)}>
              <option value="feet">Feet</option>
              <option value="inches">Inches</option>
              <option value="meters">Meters</option>
              <option value="millimeters">Millimeters</option>
            </select>
          </label>
          <label className="mt-3 block text-[10px]" style={{ color: "var(--muted)" }}>
            Up axis
            <select className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]" style={buttonStyle} value={upAxisMode} onChange={(event) => setUpAxisMode(event.target.value as UpAxisMode)}>
              <option value="auto">Auto</option>
              <option value="y">Y up</option>
              <option value="z">Z up</option>
            </select>
          </label>
          <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>Auto stands a standard OBJ upright. Choose Z up when the file was saved with Z vertical.</p>
          <div className="mt-3 text-[10px]" style={{ color: "var(--muted)" }}>
            Lattice cells
            <div className="mt-1 grid grid-cols-3 gap-1">
              {([["cellsX", "X"], ["cellsY", "Y"], ["cellsZ", "Z"]] as const).map(([axis, label]) => (
                <label key={axis}>
                  {label}
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-2 py-1 text-[11px]"
                    style={buttonStyle}
                    type="number"
                    min={1}
                    max={16}
                    value={field[axis]}
                    onChange={(event) => setLatticeCells(axis, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
            <p className="mt-1">{field.cellsX * 20} × {field.cellsY * 20} × {field.cellsZ * 20} ft. Assembly chooses tile and orientation from neighbor compatibility.</p>
            {latticePerformanceWarning(field) && (
              <p className="mt-1" style={{ color: "var(--danger-text)" }}>{latticePerformanceWarning(field)}</p>
            )}
          </div>
          <p className="mt-3 text-[12px]">Uploaded: {meshes.length} / {REQUIRED_TILES}</p>
          {meshes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {meshes.map((mesh) => (
                <li key={mesh.id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="min-w-0 truncate">{mesh.filename}</span>
                  <button type="button" className={buttonClass} style={buttonStyle} onClick={() => removeMesh(mesh.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px]" style={{ color: missing.length ? "var(--danger-text)" : "var(--muted)" }}>Assigned: {assigned.length} / {REQUIRED_TILES}. {missing.length ? `Missing ${missing.map((slot) => slot.code).join(", ")}` : "Every typology slot has a mesh."}</p>
          <div className="mt-3 space-y-1">
            {LATTICE_SLOTS.map((slot) => (
              <label key={slot.id} className="grid grid-cols-[42px_1fr] items-center gap-1 text-[10px]">
                <span>{slot.code}</span>
                <select className="rounded border bg-transparent px-1 py-1" style={buttonStyle} value={assignments[slot.id] ?? ""} onChange={(event) => {
                  const meshId = event.target.value || null;
                  setAssignments((current) => {
                    const next = { ...current, [slot.id]: meshId };
                    if (meshId) for (const other of LATTICE_SLOTS) if (other.id !== slot.id && next[other.id] === meshId) next[other.id] = null;
                    return next;
                  });
                }}>
                  <option value="">Unassigned</option>
                  {meshes.map((mesh) => <option key={mesh.id} value={mesh.id}>{mesh.filename}{mesh.suggestedSlotId === slot.id ? " · suggested" : ""}</option>)}
                </select>
              </label>
            ))}
          </div>
          {selected && selectedPlacement && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">{selected.filename}</div>
              <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>{selectedModel ? `${selectedModel.vertexCount} vertices · ${selectedModel.faceCount} faces · ${selectedModel.minZ.toFixed(1)} to ${selectedModel.maxZ.toFixed(1)} ft` : "Analysis pending"}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ rotation: ((selectedPlacement.rotation + 90) % 360) as Placement["rotation"] })}>Rotate 90°</button>
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ mirror: selectedPlacement.mirror === "x" ? "none" : "x" })}>Mirror X</button>
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ mirror: selectedPlacement.mirror === "y" ? "none" : "y" })}>Mirror Y</button>
                {(["ix", "iy", "iz"] as const).flatMap((axis) => [1, -1].map((step) => (
                  <button type="button" key={`${axis}${step}`} className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ [axis]: selectedPlacement[axis] + step })}>
                    Move {step > 0 ? "+" : "-"}{axis.slice(1).toUpperCase()}
                  </button>
                )))}
                <button type="button" className={buttonClass} style={buttonStyle} disabled={selectedPlacement.locked} onClick={() => updateSelected({ rotation: 0, mirror: "none", ix: 0, iy: 0, iz: 0 })}>Reset</button>
                <button type="button" className={buttonClass} style={buttonStyle} onClick={() => {
                  if (!selected || !selectedPlacement) return;
                  const nextLocked = !selectedPlacement.locked;
                  if (preview) {
                    setPreview({
                      ...preview,
                      placements: { ...preview.placements, [selected.id]: { ...selectedPlacement, locked: nextLocked } },
                    });
                  } else {
                    setPlacements((current) => ({ ...current, [selected.id]: { ...current[selected.id], locked: nextLocked } }));
                  }
                }}>{selectedPlacement.locked ? "Unlock" : "Lock Position"}</button>
              </div>
            </div>
          )}
        </aside>
        <main className="relative min-h-0">
          <div className="absolute left-3 top-3 z-10 flex max-w-[70%] flex-wrap gap-1">
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setColorMode("white")}>White Model</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setColorMode("category")}>Color by Category</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setColorMode("typology")}>Color by Typology</button>
            <button
              type="button"
              className={buttonClass}
              style={{ ...buttonStyle, borderColor: showLattice ? "var(--accent)" : "var(--line)" }}
              onClick={() => setShowLattice((value) => !value)}
            >
              {showLattice ? "Lattice Grid On" : "Lattice Grid Off"}
            </button>
            <button
              type="button"
              className={buttonClass}
              style={{ ...buttonStyle, borderColor: showConnections ? "var(--accent)" : "var(--line)" }}
              onClick={() => setShowConnections((value) => !value)}
            >
              {showConnections ? "Connections On" : "Connections Off"}
            </button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("all"); setPresentation(false); }}>Interlock Graph</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("floor"); setPresentation(false); }}>Floor Paths</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("void"); setPresentation(false); }}>Void Paths</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("continuity"); setContinuityOverlay("circulation"); setPresentation(false); }}>Circulation Paths</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => { setDiagnostic("distribution"); setColorMode("typology"); setPresentation(false); }}>Distribution Map</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("iso")}>Isometric</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("plan")}>Plan</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setCameraMode("section")}>Section</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setPresentation((value) => !value)}>{presentation ? "Exit Presentation" : "Presentation Mode"}</button>
          </div>
          <LatticeViewport
            ref={viewRef}
            meshes={shown.meshes}
            models={shown.models}
            placements={shown.placements}
            unitScale={UNIT_TO_FEET[unit]}
            upAxisMode={upAxisMode}
            field={field}
            colorMode={presentation ? "white" : colorMode}
            showLattice={showLattice}
            showConnections={showConnections}
            cameraMode={cameraMode}
            diagnostic={diagnostic}
            continuityOverlay={continuityOverlay}
            presentation={presentation}
            selectedId={selectedId}
            connections={shownReport?.connections ?? []}
            onSelect={setSelectedId}
          />
          <div className="absolute bottom-3 left-3 right-3 space-y-1">
            {busy && progressPercent !== null && (
              <div className="rounded border px-2 py-1.5" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--panel) 88%, transparent)" }}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                  <span style={{ color: "var(--muted)" }}>Assembly progress</span>
                  <span style={{ color: "var(--accent)" }}>{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded" style={{ background: "color-mix(in srgb, var(--line) 70%, transparent)" }}>
                  <div className="h-full transition-[width] duration-150 ease-out" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%`, background: "var(--accent)" }} />
                </div>
              </div>
            )}
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>{status}</p>
          </div>
        </main>
        <aside className="overflow-auto border-l p-3 text-[10px]" style={{ borderColor: "var(--line)" }}>
          <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || models.length < 1} onClick={() => void runSearch()}>ASSEMBLE INTERLOCKING LATTICE</button>
          <button type="button" className={`${buttonClass} mt-2 block`} style={buttonStyle} disabled={busy || models.length < 1} onClick={() => void runSearch()}>REASSEMBLE UNLOCKED CELLS</button>
          <button type="button" className={`${buttonClass} mt-2 block`} style={buttonStyle} onClick={clearSavedSession}>CLEAR SAVED SESSION</button>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Part 2 autosaves meshes, prefs, and the last assembly so switching tabs does not reset it.</p>
          {busy && progressPercent !== null && (
            <div className="mt-2 rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="mb-1 flex items-center justify-between">
                <span style={{ color: "var(--muted)" }}>Progress</span>
                <span style={{ color: "var(--accent)" }}>{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded" style={{ background: "color-mix(in srgb, var(--line) 70%, transparent)" }}>
                <div className="h-full transition-[width] duration-150 ease-out" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%`, background: "var(--accent)" }} />
              </div>
            </div>
          )}
          <div className="mt-3 rounded border p-2 space-y-2" style={{ borderColor: "var(--line)" }}>
            <div className="text-[11px]">DISTRIBUTION</div>
            <p style={{ color: "var(--muted)" }}>Changing these controls re-assembles after a short pause.</p>
            <label className="block" style={{ color: "var(--muted)" }}>
              Dispersion {distributionWeight}% · 0% interlock bias · 100% maximum dispersion
              <input
                className="mt-1 w-full"
                type="range"
                min={0}
                max={100}
                value={distributionWeight}
                onChange={(event) => {
                  setDistributionWeight(Number(event.target.value));
                  bumpDistributionPrefs();
                }}
              />
            </label>
            <label className="block" style={{ color: "var(--muted)" }}>
              Clustering {clusteringPercent}% · 0% disperse same types · 100% allow aggregation
              <input
                className="mt-1 w-full"
                type="range"
                min={0}
                max={100}
                value={clusteringPercent}
                onChange={(event) => {
                  setClusteringPercent(Number(event.target.value));
                  bumpDistributionPrefs();
                }}
              />
            </label>
            <div>
              Largest same-type cluster: <span style={{ color: "var(--accent)" }}>{activeAssembly?.distribution?.maxCluster ?? "—"}</span>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={balanceTypologies}
                onChange={(event) => {
                  setBalanceTypologies(event.target.checked);
                  bumpDistributionPrefs();
                }}
              />
              Balance Typologies
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={balanceCategories}
                onChange={(event) => {
                  setBalanceCategories(event.target.checked);
                  bumpDistributionPrefs();
                }}
              />
              Balance Categories
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preventLargeClusters}
                onChange={(event) => {
                  setPreventLargeClusters(event.target.checked);
                  bumpDistributionPrefs();
                }}
              />
              Prevent Large Clusters
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {([2, 4, 8] as const).map((count) => <button type="button" key={count} className={buttonClass} style={buttonStyle} disabled={busy || !models.length} onClick={() => void runCopies(count)}>INTERLOCK TEST {count}</button>)}
          </div>
          <button type="button" className={`${buttonClass} mt-2`} style={buttonStyle} disabled={busy || !models.length} onClick={() => void runCatalogue()}>CATALOGUE TEST</button>
          {busy && <button type="button" className={`${buttonClass} mt-2`} style={buttonStyle} onClick={() => { cancelRef.current += 1; }}>Cancel</button>}
          <p className="mt-3" style={{ color: "var(--muted)" }}>Interlock stays primary. Clustering scales same-type aggregation only; 0% is not a forced checkerboard.</p>
          <div className="mt-2 space-y-1">
            {options?.map((option) => (
              <button type="button" key={option.id} className={`${buttonClass} block w-full text-left`} style={{ ...buttonStyle, outline: activeOption === option.id ? "1px solid var(--accent)" : undefined }} onClick={() => chooseOption(option)}>
                Option {option.id} — {option.title}. Interlock {option.score.toFixed(1)} · Distribution {option.distributionScore.toFixed(1)}. Largest cluster {option.distribution?.maxCluster ?? "—"}. Cells {option.tiles.length}/{cellCount}.
              </button>
            ))}
          </div>
          {stats && <p className="mt-2" style={{ color: "var(--muted)" }}>{stats.candidatesTested} placements tested · {stats.pairwiseComparisons} interface comparisons · {Math.round(stats.milliseconds)} ms search · {Math.round(Math.max(0, stats.analysisMilliseconds))} ms with analysis</p>}
          {selectedNote && (
            <div className="mt-3 space-y-1 rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">Selected tile diagnostics</div>
              <div>Type: {selectedNote.filename}</div>
              <div>Orientation: {selectedNote.rotation}° / {selectedNote.mirror === "none" ? "no mirror" : `mirror ${selectedNote.mirror}`}</div>
              <div>Cell: {selectedNote.ix}, {selectedNote.iy}, {selectedNote.iz}</div>
              <div>Interlock score: {selectedNote.score.toFixed(1)}</div>
              <div>Floor continuity: {selectedNote.floor.toFixed(1)}</div>
              <div>Void continuity: {selectedNote.void.toFixed(1)}</div>
              <div>Circulation continuity: {selectedNote.circulation.toFixed(1)}</div>
              <div>Complementary interlock: {selectedNote.complementary.toFixed(1)}</div>
              <div>Collision: {selectedNote.collision.toFixed(1)}</div>
              {selectedNote.distribution !== undefined && <div>Distribution delta: {selectedNote.distribution.toFixed(1)}</div>}
              <div>Reason: {selectedNote.reason}</div>
              {selectedNote.neighbors.length > 0 && <div>Neighbors scored: {selectedNote.neighbors.map((neighbor) => `${neighbor.direction} ${neighbor.score.toFixed(1)}`).join(" · ")}</div>}
              {selectedLinks.map((connection, index) => (
                <div key={`${connection.tileA}-${connection.tileB}-${index}`} className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                  <div>{connection.labelA} ↔ {connection.labelB}</div>
                  <div>Interlock {connection.interlock} · Floor {connection.floor} · Void {connection.void} · Circ {connection.circulation}</div>
                  {connection.reason && <div>{connection.reason}</div>}
                </div>
              ))}
            </div>
          )}
          {shownReport && (
            <div className="mt-3 space-y-1">
              <div>OBJ types loaded: {meshes.length}</div>
              <div>Cells assembled: {shown.models.length} / {cellCount}</div>
              <div>OBJ types used: {new Set(shown.models.map((model) => sourceIdOf(model.id))).size}</div>
              <div>Connected components: {shownReport.components}</div>
              <div>Valid interlocks: {shownReport.connections.filter((connection) => connection.interlock === "PASS").length}</div>
              <div>Floor continuities: {shownReport.connections.filter((connection) => connection.floor === "PASS").length}</div>
              <div>Void continuities: {shownReport.connections.filter((connection) => connection.void === "PASS").length}</div>
              <div>Circulation continuities: {shownReport.connections.filter((connection) => connection.circulation === "PASS").length}</div>
              <div>Collision warnings: {shownReport.connections.filter((connection) => connection.collision !== "PASS").length}</div>
              {activeAssembly && <div>Distribution score: {activeAssembly.distributionScore.toFixed(1)}</div>}
              {activeAssembly?.distribution && (
                <>
                  <div>Target / type: {activeAssembly.distribution.targetPerType.toFixed(1)}</div>
                  <div>Largest same-type cluster: {activeAssembly.distribution.maxCluster}</div>
                  <div>Max same-type run: {activeAssembly.distribution.maxRun}</div>
                  <div>Neighborhood diversity: {(activeAssembly.distribution.neighborhoodDiversity * 100).toFixed(0)}%</div>
                  <div>Categories · G {activeAssembly.distribution.categoryCounts.Gathering ?? 0} · O {activeAssembly.distribution.categoryCounts.Office ?? 0} · L {activeAssembly.distribution.categoryCounts.Lobby ?? 0}</div>
                </>
              )}
            </div>
          )}
          {activeAssembly?.distribution && (
            <div className="mt-3 max-h-56 space-y-1 overflow-auto rounded border p-2" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px]">Typology distribution</div>
              {activeAssembly.distribution.typologyRows.map((row) => (
                <div key={row.sourceId}>
                  {slotById(row.slotId)?.code ?? row.filename}: {row.count} ({row.percent.toFixed(1)}%) · target {row.target.toFixed(1)} · Δ {row.difference >= 0 ? "+" : ""}{row.difference.toFixed(1)} · cluster {row.largestCluster} · run {row.maxRun} · avg dist {row.avgSameTypeDistance.toFixed(1)}
                </div>
              ))}
            </div>
          )}
          {copyWarning && <p className="mt-3 rounded p-2" style={{ background: "var(--danger-bg)", color: "var(--danger-text)" }}>{copyWarning}</p>}
          <div className="mt-3 max-h-48 space-y-2 overflow-auto">
            {shownReport && shownReport.connections.length > listedConnections.length && <p style={{ color: "var(--muted)" }}>Showing {listedConnections.length} of {shownReport.connections.length} neighbor checks.</p>}
            {listedConnections.map((connection, index) => (
              <div key={`${connection.tileA}-${connection.tileB}-${index}`} className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                <div>Tile A: {connection.labelA}</div>
                <div>Tile B: {connection.labelB}</div>
                <div>Transform A: {connection.transformA}</div>
                <div>Transform B: {connection.transformB}</div>
                <div>Connection direction: {connection.direction}</div>
                <div>Floor continuity: {connection.floor}</div>
                <div>Void continuity: {connection.void}</div>
                <div>Circulation continuity: {connection.circulation}</div>
                <div>Collision: {connection.collision}</div>
                <div>Interlock: {connection.interlock}</div>
              </div>
            ))}
          </div>
          {catalogue.length > 0 && (
            <div className="mt-3">
              {catalogue.map((row) => <div key={row.slotId}>{row.slotId} · score {row.score.toFixed(1)} · {row.tiles} copies{row.warning ? ` · ${row.warning}` : ""}</div>)}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1">
            {(["originals", "lattice", "interfaces", "pairwise", "transforms", "assembly", "validation", "continuity", "distribution", "copies"] as DiagnosticMode[]).map((mode) => (
              <button type="button" key={mode} className={buttonClass} style={buttonStyle} onClick={() => {
                setDiagnostic(mode);
                setPresentation(false);
                if (mode === "continuity") setContinuityOverlay("all");
                if (mode === "distribution") setColorMode("typology");
                if (mode !== "copies" && mode !== "assembly" && mode !== "continuity" && mode !== "validation" && mode !== "distribution") setPreview(null);
              }}>{mode}</button>
            ))}
          </div>
          {diagnostic === "interfaces" && selectedModel && <p className="mt-2">Open boundary cells {selectedModel.openBoundary}. Projection {selectedModel.projection.toFixed(1)} ft. Recess {selectedModel.recess.toFixed(1)} ft. Horizontal area {selectedModel.horizontalArea.toFixed(1)} ft². Vertical area {selectedModel.verticalArea.toFixed(1)} ft².</p>}
          {diagnostic === "transforms" && models.map((model) => {
            const placement = placements[model.id];
            return <div key={model.id}>{slotById(model.slotId)?.code} {placement ? `${placement.rotation}° ${placement.mirror} @ ${placement.ix},${placement.iy},${placement.iz}${placement.locked ? " locked" : ""}` : "unplaced"}</div>;
          })}
          <div className="mt-3 flex flex-wrap gap-1">
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!shown.models.length} onClick={() => download("assembly.obj", assembledObj(shown.meshes, shown.placements, shown.models, UNIT_TO_FEET[unit], upAxisMode), "text/plain")}>EXPORT ASSEMBLED OBJ</button>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!shown.models.length} onClick={() => download("assembly.json", JSON.stringify(assemblyManifest(shown.meshes, shown.placements, shown.models, UNIT_TO_FEET[unit], unit, field), null, 2), "application/json")}>assembly.json</button>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!shown.models.length} onClick={() => download("assembly-union.obj", voxelUnionObj(shown.models, shown.placements), "text/plain")}>UNION FOR EXPORT</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-isometric.png", "clean", "iso")}>Isometric PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-plan.png", "clean", "plan")}>Plan PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-section.png", "clean", "section")}>Section PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} onClick={() => exportPng("lattice-assembly.png", "lattice", "iso")}>Lattice + assembly PNG</button>
            <button type="button" className={buttonClass} style={buttonStyle} disabled={!preview} onClick={() => download(`interlock-${copyCount}.obj`, assembledObj(shown.meshes, shown.placements, shown.models, UNIT_TO_FEET[unit], upAxisMode), "text/plain")}>{copyCount}-copy OBJ</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

async function loadSamples(importFiles: (files: File[]) => Promise<void>) {
  const files: File[] = [];
  for (const slot of LATTICE_SLOTS) {
    const filename = `${slot.id}-${slot.name.replace(/[ /]/g, "-")}.obj`;
    const response = await fetch(`/part2-samples/${filename}`);
    if (!response.ok) throw new Error(`Missing sample ${filename}`);
    files.push(new File([await response.text()], filename, { type: "text/plain" }));
  }
  await importFiles(files);
}
