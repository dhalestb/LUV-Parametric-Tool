"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppNav from "../AppNav";
import {SiteRulesForProject} from "../polygonExperiment/SiteRulePanel";
import { analyzeMesh } from "../lattice/analyze";
import { useLatticeSource } from "../lattice/latticeSource";
import { parseObj } from "../lattice/parseObj";
import { LATTICE_SLOTS } from "../lattice/slots";
import { resolvedUp, UNIT_TO_FEET, type TileModel } from "../lattice/types";
import {
  analyzeArchitecturalFootprint,
  architecturalFootprintWorldCells,
  ARCHITECTURAL_FOOTPRINT_METHOD,
} from "./architecturalFootprint";
import { coverageGfaCompatibility, estimateAutomaticCountForZone, resolvedEdgeClearanceFeet } from "./capacity";
import { createDefaultZone, createExclusion, generateSiteClusters } from "./clustering";
import { summarizeTradeoffs } from "./architecturalObjectives";
import { drawingToolsActive, orientedPlanEnvelope, polygonArea, polygonClosed, polygonOpen, polygonToolsNeedTopView, polygonsNearlyEqual, rectanglePolygon, shouldClosePolygon, shouldIgnoreDuplicateClick, translatePolygon, validatePolygon, type Point } from "./geometry";
import { hybridizationCapability, setTypologySelection, setTypologyWeight, slotForTypology } from "./hybridization";
import { assembleLocalArchitecturalGroups, classifySiteResult } from "./latticeAssemblyAdapter";
import { summarizeZoneOverlaps } from "./overlapSummary";
import {
  confirmAllResolvedBindings,
  confirmTypologyBinding,
  missingTypologiesForZones,
  missingTypologySlots,
  pinProtoForms,
  placementsReferenceMissingSources,
  resolveProtoFormSources,
  sourceFingerprint,
} from "./protoFormSource";
import { resolveParticipatingZones } from "./generationScope";
import { parseProject, readProjectSession, serializeProject, writeProjectSession } from "./projectStore";
import { readSiteGeometryCache, writeSiteGeometryCache } from "./siteGeometryCache";
import { applySiteCoordinates, coordinatesForUnit, miamiParcelScale, loadSiteFromArrayBuffer, suggestedOverlayNote, type LoadedSite } from "./siteImport";
import { createSiteSurfaceSampler } from "./siteSurface";
import { evaluateAlternative, programNote } from "./evaluation";
import { combinedBoundsSpec } from "../lattice/objFidelity";
import type { ReactNode } from "react";
import {
  emptyProject,
  PROTO_FORM_BAY_FEET,
  SITE_COORDINATE_POLICY,
  SITE_TYPOLOGIES,
  type ClusterZone,
  type DistributionMode,
  type GenerationMode,
  type GenerationAlternative,
  type HybridizationMethod,
  type PointerKind,
  type ProtoFormSourceMode,
  type QuantityMode,
  type SiteDevelopmentProject,
  type SiteTool,
  type SiteTypologyId,
} from "./types";
import type { SiteOverlayMode, SiteViewMode } from "./SiteViewport";
import type { ImportedObj } from "../lattice/types";

const SiteViewport = dynamic(() => import("./SiteViewport"), { ssr: false });

const SAMPLE_GLB = "/samples/miami-waterfront.glb";
const buttonClass = "rounded border px-2 py-1 text-[10px] disabled:opacity-40";
const buttonStyle = { borderColor: "var(--line)" } as const;
const actionStyle = { ...buttonStyle, background: "var(--accent-primary)", color: "var(--app-background)" } as const;

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Panel({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <article className="rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold" onClick={() => onToggle(id)}>
        <span>{title}</span>
        <span className="text-[10px] font-normal" style={{ color: "var(--muted)" }}>{open ? "collapse" : "expand"}</span>
      </button>
      {open ? <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: "var(--line)" }}>{children}</div> : null}
    </article>
  );
}

export default function SiteDevelopmentStudio() {
  const lattice = useLatticeSource();
  const [project, setProject] = useState<SiteDevelopmentProject>(() => emptyProject("Miami waterfront study"));
  const [status, setStatus] = useState("Import a GLB/OBJ site or load the optional Miami sample. Lattice proto forms stay 20 ft bays.");
  const [tool, setTool] = useState<SiteTool>("orbit");
  const [view, setView] = useState<SiteViewMode>(()=>{const value=localStorage.getItem('luv-experiment-site-view-mode');return value==='top'||value==='perspective'?value:'iso';});
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const lastDown = useRef<{ point: Point; time: number } | null>(null);
  const [models, setModels] = useState<TileModel[]>([]);
  const [importedMeshes, setImportedMeshes] = useState<ImportedObj[]>([]);
  const [sampleMeshes, setSampleMeshes] = useState<ImportedObj[]>([]);
  const [busy, setBusy] = useState(false);
  const [siteLoading, setSiteLoading] = useState(false);
  /** Keep site geometry in React state so viewport updates survive selection re-renders. */
  const [loadedSite, setLoadedSite] = useState<LoadedSite | null>(null);
  const [optimizationStage, setOptimizationStage] = useState<"initial" | "refinement" | "extended">("refinement");
  const cancelRef = useRef(false);
  const [sourceNote, setSourceNote] = useState("Proto-form source defaults to the Active Lattice Library. Samples are never loaded silently.");
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    site: true,
    zones: true,
    settings: true,
    generation: true,
    diagnostics: false,
  });
  const [showOverlapDetails, setShowOverlapDetails] = useState(false);
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);
  const [showCoordinateDetails, setShowCoordinateDetails] = useState(false);
  const [overlayMode, setOverlayMode] = useState<SiteOverlayMode>("forms");
  const history = useRef<SiteDevelopmentProject[]>([]);
  const future = useRef<SiteDevelopmentProject[]>([]);
  const moveStart = useRef<{ point: Point; polygon: Point[] } | null>(null);
  useEffect(()=>{localStorage.setItem('luv-experiment-site-view-mode',view);},[view]);
  const sessionReady = useRef(false);
  /** State gate so the first persist never runs against the empty initial project before restore applies. */
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const lastSourceFingerprint = useRef<string>("");
  const projectRef = useRef(project);
  projectRef.current = project;

  const persistenceReady = useRef(false);

  useEffect(() => {
    if (!sessionHydrated || project.coordinates.unit !== "feet" || project.coordinates.feetPerModel !== 1 || project.coordinates.unitAssumption === "confirmed") return;
    setProject(current => current.coordinates.unit === "feet" && current.coordinates.feetPerModel === 1
      ? { ...current, coordinates: { ...current.coordinates, unitAssumption: "confirmed" } }
      : current);
  }, [sessionHydrated, project.coordinates]);

  const pushHistory = useCallback((next: SiteDevelopmentProject) => {
    history.current = [...history.current.slice(-24), project];
    future.current = [];
    setProject(next);
  }, [project]);

  useEffect(() => {
    try {
      const restored = readProjectSession();
      if (restored) {
        setProject(restored);
        const firstZone = restored.zones.find((zone) => zone.kind === "zone") ?? restored.zones[0] ?? null;
        if (firstZone) setSelectedZoneId(firstZone.id);
      }
    } catch { /* keep empty */ }
    sessionReady.current = true;
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    persistenceReady.current = true;
    {
      writeProjectSession(project, { allowClearZones: project.zones.length === 0 });
    }
  }, [project, sessionHydrated]);

  useEffect(() => {
    const flush = () => {
      if (!persistenceReady.current) return;
      writeProjectSession(projectRef.current, { allowClearZones: projectRef.current.zones.length === 0 });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("luv-flush-project", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("luv-flush-project", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  // Keep Architectural Development controls available whenever zones exist.
  useEffect(() => {
    if (selectedZoneId && project.zones.some((zone) => zone.id === selectedZoneId)) return;
    if (selectedZoneId && project.exclusions.some((zone) => zone.id === selectedZoneId)) return;
    const firstZone = project.zones.find((zone) => zone.kind === "zone") ?? project.zones[0] ?? null;
    if (firstZone) setSelectedZoneId(firstZone.id);
  }, [project.zones, project.exclusions, selectedZoneId]);

  const resolvedSource = useMemo(() => resolveProtoFormSources({
    mode: project.protoFormSource,
    latticeMeshes: lattice.meshes,
    importedMeshes,
    sampleMeshes,
    pinned: project.pinnedProtoForms,
    latticeAssignments: lattice.assignments,
    typologyBindings: project.typologyBindings,
  }), [project.protoFormSource, project.pinnedProtoForms, project.typologyBindings, lattice.meshes, lattice.assignments, importedMeshes, sampleMeshes]);
  const displayMeshes = resolvedSource.meshes;
  const typologyBindings = resolvedSource.bindings;

  useEffect(() => {
    setSourceNote(resolvedSource.report.note);
  }, [resolvedSource.report.note]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(displayMeshes.map((mesh) => Promise.resolve(analyzeMesh(mesh, mesh.suggestedSlotId, UNIT_TO_FEET[lattice.unit], resolvedUp(mesh.upAxis, lattice.upAxisMode))))).then((next) => {
      if (!cancelled) setModels(next);
    });
    return () => { cancelled = true; };
  }, [displayMeshes, lattice.unit, lattice.upAxisMode]);

  useEffect(() => {
    const bindingKey = typologyBindings.map((binding) => `${binding.typologyId}:${binding.meshId ?? ""}:${binding.status}`).join(";");
    const fingerprint = `${project.protoFormSource}|${sourceFingerprint(displayMeshes)}|${bindingKey}`;
    if (!sessionReady.current) {
      lastSourceFingerprint.current = fingerprint;
      return;
    }
    if (lastSourceFingerprint.current && lastSourceFingerprint.current !== fingerprint && project.alternatives.length) {
      const missing = placementsReferenceMissingSources(project.alternatives.flatMap((item) => item.clusters), displayMeshes);
      setProject((current) => ({
        ...current,
        alternatives: current.alternatives.map((item) => ({
          ...item,
          stale: true,
          staleReason: missing.length
            ? `Source library or typology bindings changed — ${missing.length} placement(s) reference unavailable meshes. Regenerate; unresolved IDs are not remapped silently.`
            : "Source library or typology bindings changed — regenerate to apply confirmed OBJ sources.",
        })),
      }));
      setStatus(missing.length
        ? `Proto-form source/bindings changed. Marked alternatives stale because ${missing.length} placement(s) referenced unavailable meshes.`
        : "Proto-form source or typology bindings changed. Alternatives marked stale — regenerate to refresh geometry.");
    }
    lastSourceFingerprint.current = fingerprint;
  }, [project.protoFormSource, displayMeshes, typologyBindings, project.alternatives.length]);

  const modelScale = project.import.modelFeetPerUnit ?? project.coordinates.feetPerModel;
  const siteInfo = loadedSite ? applySiteCoordinates(loadedSite.info, { ...project.coordinates, feetPerModel: modelScale }) : null;
  const surfaceSampler = useMemo(
    () => createSiteSurfaceSampler(loadedSite?.root ?? null, modelScale, loadedSite?.info.layers ?? []),
    [loadedSite, modelScale],
  );
  const selected = [...project.zones, ...project.exclusions].find((zone) => zone.id === selectedZoneId) ?? null;
  const active = project.alternatives.find((item) => item.id === project.activeAlternativeId) ?? project.alternatives[0] ?? null;
  const bbox = siteInfo?.bboxFeet;
  // Prefer framing the selected zone / active placements so elevation and containment are visible.
  // Full-site bbox Y includes adjacent towers and pulls the iso camera into mid-air.
  const frameTarget = (() => {
    const foundationY = surfaceSampler.datumY;
    if (active?.clusters.length) {
      const xs = active.clusters.map((cluster) => cluster.x);
      const zs = active.clusters.map((cluster) => cluster.z);
      const ys = active.clusters.map((cluster) => cluster.elevation);
      const pad = 60;
      return {
        aim: [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2 + 10,
          (Math.min(...zs) + Math.max(...zs)) / 2,
        ] as [number, number, number],
        span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 80) + pad,
      };
    }
    if (selected && selected.polygon.length >= 3) {
      const xs = selected.polygon.map((point) => point[0]);
      const zs = selected.polygon.map((point) => point[1]);
      return {
        aim: [(Math.min(...xs) + Math.max(...xs)) / 2, foundationY + 8, (Math.min(...zs) + Math.max(...zs)) / 2] as [number, number, number],
        span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 80) + 40,
      };
    }
    if (bbox) {
      return {
        aim: [(bbox.min[0] + bbox.max[0]) / 2, foundationY + 20, (bbox.min[2] + bbox.max[2]) / 2] as [number, number, number],
        span: Math.max(bbox.max[0] - bbox.min[0], bbox.max[2] - bbox.min[2], 80),
      };
    }
    return { aim: [0, 20, 0] as [number, number, number], span: 200 };
  })();
  const aim = frameTarget.aim;
  const span = frameTarget.span;

  const overlapSummary = useMemo(() => summarizeZoneOverlaps(project.zones), [project.zones]);

  const fetchTypologySampleMeshes = async (slotIds?: string[]) => {
    const wanted = new Set(slotIds ?? SITE_TYPOLOGIES.map((item) => item.slotId));
    const parsed: ImportedObj[] = [];
    for (const typology of SITE_TYPOLOGIES) {
      if (!wanted.has(typology.slotId)) continue;
      const slot = LATTICE_SLOTS.find((item) => item.id === typology.slotId);
      if (!slot) continue;
      const filename = `${slot.id}-${slot.name.replace(/[ /]/g, "-")}.obj`;
      const response = await fetch(`/part2-samples/${filename}`);
      if (!response.ok) continue;
      const mesh = parseObj(await response.text(), filename);
      mesh.suggestedSlotId = slot.id;
      parsed.push(mesh);
    }
    return parsed;
  };

  const loadSampleLibrary = async () => {
    const parsed = await fetchTypologySampleMeshes();
    setSampleMeshes(parsed);
    setProject((current) => ({ ...current, protoFormSource: "sample-library", alternatives: [], activeAlternativeId: null }));
    setStatus(parsed.length
      ? `Loaded ${parsed.length} built-in sample proto forms into Sample Library mode. These do not replace Active Lattice or imported OBJs.`
      : "Sample OBJ files were not found under /part2-samples.");
  };

  const importProtoObjs = async (files: FileList | null) => {
    if (!files?.length) return;
    const parsed: ImportedObj[] = [];
    for (const file of [...files]) {
      if (!file.name.toLowerCase().endsWith(".obj")) continue;
      try { parsed.push(parseObj(await file.text(), file.name)); }
      catch (error) { setStatus(error instanceof Error ? error.message : `Failed to parse ${file.name}`); }
    }
    if (!parsed.length) {
      setStatus("Choose one or more OBJ proto-form files.");
      return;
    }
    setImportedMeshes((current) => [...current, ...parsed]);
    setProject((current) => ({ ...current, protoFormSource: "imported-obj", alternatives: [], activeAlternativeId: null }));
    setStatus(`Imported ${parsed.length} OBJ proto form(s) into the project Imported OBJ Library.`);
  };

  const loadBuffer = async (buffer: ArrayBuffer, filename: string, sampleId: string | null = null, options?: { quiet?: boolean; signal?: AbortSignal; verifyParcel?: boolean }) => {
    setSiteLoading(true);
    if (!options?.quiet) setStatus(`Loading ${filename}…`);
    try {
      const loaded = await loadSiteFromArrayBuffer(buffer, filename);
      if (options?.signal?.aborted) return;
      const current = projectRef.current;
      const matched = sampleId === "miami-waterfront"
        ? miamiParcelScale(loaded.info, current.zones, current.coordinates.feetPerModel) : null;
      if (options?.verifyParcel && matched === null) return;
      const scale = sampleId === "miami-waterfront"
        ? (current.import.sampleId === sampleId ? current.import.modelFeetPerUnit : undefined) ?? matched
        : null;
      setLoadedSite(loaded);
      const format = filename.toLowerCase().endsWith(".obj") ? "obj" as const : "glb" as const;
      const coordinates = options?.quiet || sampleId === "miami-waterfront" ? current.coordinates : {
        ...coordinatesForUnit(current.coordinates.unit, true),
        origin: current.coordinates.origin, elevationDatum: current.coordinates.elevationDatum, northDeg: current.coordinates.northDeg,
      };
      const info = applySiteCoordinates(loaded.info, { ...coordinates, feetPerModel: scale ?? coordinates.feetPerModel });
      setProject((current) => ({
        ...current,
        coordinates,
        import: { filename, format, sampleId, ...(scale != null ? { modelFeetPerUnit: scale } : {}) },
        layers: info.layers.map((layer) => ({ id: layer.id, visible: layer.visible, kind: layer.kind })),
      }));
      try {
        await writeSiteGeometryCache({
          filename,
          sampleId,
          format,
          buffer,
          savedAt: new Date().toISOString(),
        });
      } catch {
        /* geometry cache is best-effort; project JSON still persists zones */
      }
      setStatus(`${filename} loaded · ${info.meshCount} meshes · ${info.layers.map((layer) => layer.name).join(", ")}. ${info.notes[0] ?? ""}`.trim());
      if (!options?.quiet) setView("iso");
      setOpenPanels((current) => ({ ...current, site: true }));
    } catch (error) {
      if (options?.signal?.aborted) return;
      setLoadedSite(null);
      setStatus(error instanceof Error ? `Site load failed: ${error.message}` : `Site load failed for ${filename}.`);
      throw error;
    } finally {
      if (!options?.signal?.aborted) setSiteLoading(false);
    }
  };

  const onImportFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      await loadBuffer(await file.arrayBuffer(), file.name);
    } catch {
      /* status already set in loadBuffer */
    }
  };

  const loadMiamiSample = async () => {
    if (siteLoading) return;
    setSiteLoading(true);
    setStatus("Fetching Miami waterfront sample…");
    try {
      const response = await fetch(SAMPLE_GLB, { cache: "no-cache" });
      if (!response.ok) {
        setStatus(`Miami sample missing (HTTP ${response.status}). Expected ${SAMPLE_GLB} — import a Site GLB from disk instead.`);
        return;
      }
      const buffer = await response.arrayBuffer();
      if (!buffer.byteLength) {
        setStatus("Miami sample file was empty. Import a Site GLB from disk.");
        return;
      }
      await loadBuffer(buffer, "miami-waterfront.glb", "miami-waterfront");
    } catch (error) {
      setStatus(error instanceof Error ? `Miami sample failed: ${error.message}` : "Miami sample failed to load.");
    } finally {
      setSiteLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionHydrated) return;
    const controller = new AbortController();
    const signal = controller.signal;
    async function restore() {
      setSiteLoading(true);
      try {
        const current = projectRef.current;
        const ref = current.import;
        const miami = ref.sampleId === "miami-waterfront" || ref.filename === "miami-waterfront.glb";
        const cached = await readSiteGeometryCache().catch(() => null);
        if (signal.aborted) return;
        if (cached?.buffer.byteLength && (ref.filename === cached.filename ||
            (ref.sampleId && ref.sampleId === cached.sampleId) || (!ref.filename && !ref.sampleId))) {
          try {
            await loadBuffer(cached.buffer, cached.filename, miami ? "miami-waterfront" : cached.sampleId, { quiet: true, signal });
            return;
          } catch (error) { if (!miami) throw error; }
        }
        const checkLegacy = !ref.filename && !ref.sampleId && current.name === "Miami waterfront study" && current.zones.length > 0;
        if (!miami && !checkLegacy) return;
        const response = await fetch(SAMPLE_GLB, { cache: "force-cache", signal });
        if (!response.ok) throw Error("Miami sample could not be restored (HTTP " + response.status + ").");
        await loadBuffer(await response.arrayBuffer(), "miami-waterfront.glb", "miami-waterfront", { quiet: true, signal, verifyParcel: checkLegacy });
      } catch (error) {
        if (!signal.aborted) setStatus("Site model restore failed. " + String(error));
      } finally {
        if (!signal.aborted) setSiteLoading(false);
      }
    }
    void restore();
    return () => controller.abort();
  }, [sessionHydrated]);

  const commitPolygon = (points: Point[], asExclusion: boolean) => {
    const issues = validatePolygon(points, {
      others: asExclusion ? project.exclusions.map((zone) => zone.polygon) : project.zones.map((zone) => zone.polygon),
    });
    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length) {
      setStatus(blocking.map((issue) => issue.message).join(" · "));
      return;
    }
    const next = asExclusion
      ? { ...project, exclusions: [...project.exclusions, createExclusion(polygonOpen(points), project.exclusions.length)] }
      : { ...project, zones: [...project.zones, createDefaultZone(polygonOpen(points), project.zones.length)] };
    pushHistory(next);
    setSelectedZoneId((asExclusion ? next.exclusions : next.zones).at(-1)?.id ?? null);
    setDraft([]);
    setRectStart(null);
    setCursor(null);
    setTool("orbit");
    setStatus(issues.length ? issues.map((issue) => issue.message).join(" · ") : `${asExclusion ? "Exclusion" : "Cluster Zone"} saved in site feet. Orbit restored.`);
  };

  const chooseTool = (id: SiteTool) => {
    setTool(id);
    setDraft([]);
    setRectStart(null);
    setCursor(null);
    moveStart.current = null;
    lastDown.current = null;
    if (polygonToolsNeedTopView(id)) {
      setView("top");
      setStatus("Drawing mode: top view. Left-click to place vertices. Right-drag to pan · wheel to zoom. Enter, double-click, or click the first vertex to close. Escape cancels.");
    }
  };

  const onPointer = (point: Point, event: { type: PointerKind; shift: boolean }) => {
    setCursor(point);
    if (event.type === "pointermove") return;
    if (event.type === "dblclick") {
      if ((tool === "draw-polygon" || tool === "exclusion") && draft.length >= 3) {
        commitPolygon(draft, tool === "exclusion");
      }
      return;
    }
    const now = performance.now();
    if (lastDown.current && shouldIgnoreDuplicateClick(lastDown.current.point, point, now - lastDown.current.time)) {
      return;
    }
    lastDown.current = { point, time: now };
    if (tool === "draw-polygon" || tool === "exclusion") {
      if (shouldClosePolygon(draft, point)) {
        commitPolygon(draft, tool === "exclusion");
        return;
      }
      setDraft((current) => [...current, point]);
      return;
    }
    if (tool === "draw-rectangle") {
      if (!rectStart) { setRectStart(point); setDraft([point]); return; }
      commitPolygon(rectanglePolygon(rectStart, point), false);
      return;
    }
    if (tool === "anchor") {
      pushHistory({ ...project, anchors: [...project.anchors, { id: `anchor-${project.anchors.length + 1}`, name: `Anchor ${project.anchors.length + 1}`, point, zoneId: selectedZoneId }] });
      return;
    }
    if (tool === "view-corridor") {
      const current = project.corridors.at(-1);
      if (!current || current.points.length >= 2) {
        pushHistory({ ...project, corridors: [...project.corridors, { id: `view-${project.corridors.length + 1}`, name: `View ${project.corridors.length + 1}`, points: [point], widthFeet: 40, priority: 70 }] });
      } else {
        pushHistory({ ...project, corridors: project.corridors.map((item, index) => index === project.corridors.length - 1 ? { ...item, points: [...item.points, point] } : item) });
      }
      return;
    }
    if (tool === "arrival") {
      pushHistory({ ...project, arrivals: [...project.arrivals, { id: `arrive-${project.arrivals.length + 1}`, name: `Arrival ${project.arrivals.length + 1}`, point, kind: "public" }] });
      return;
    }
    if (tool === "edit-vertex" && selected) {
      const ring = polygonOpen(selected.polygon);
      let best = 0;
      let dist = Infinity;
      ring.forEach((vertex, index) => {
        const d = Math.hypot(vertex[0] - point[0], vertex[1] - point[1]);
        if (d < dist) { dist = d; best = index; }
      });
      if (event.shift && ring.length > 3) {
        const nextPoly = ring.filter((_, index) => index !== best);
        const key = selected.kind === "exclusion" ? "exclusions" : "zones";
        pushHistory({ ...project, [key]: project[key].map((zone) => zone.id === selected.id ? { ...zone, polygon: nextPoly } : zone) });
        setStatus(`Deleted vertex ${best + 1} of ${selected.name}. Shift-click removes a vertex; click moves the nearest vertex.`);
        return;
      }
      const nextPoly = ring.map((vertex, index) => index === best ? point : vertex);
      const key = selected.kind === "exclusion" ? "exclusions" : "zones";
      pushHistory({ ...project, [key]: project[key].map((zone) => zone.id === selected.id ? { ...zone, polygon: nextPoly } : zone) });
      return;
    }
    if (tool === "move-zone" && selected) {
      if (!moveStart.current) {
        moveStart.current = { point, polygon: selected.polygon };
        return;
      }
      const dx = point[0] - moveStart.current.point[0];
      const dz = point[1] - moveStart.current.point[1];
      const nextPoly = translatePolygon(moveStart.current.polygon, dx, dz);
      const key = selected.kind === "exclusion" ? "exclusions" : "zones";
      pushHistory({ ...project, [key]: project[key].map((zone) => zone.id === selected.id ? { ...zone, polygon: nextPoly } : zone) });
      moveStart.current = { point, polygon: nextPoly };
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && draft.length >= 3) commitPolygon(draft, tool === "exclusion");
      if (event.key === "Escape") { setDraft([]); setRectStart(null); setCursor(null); setTool("orbit"); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const previous = history.current.pop();
        if (previous) { future.current.push(project); setProject(previous); }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        const next = future.current.pop();
        if (next) { history.current.push(project); setProject(next); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const acceptSuggested = () => {
    if (!siteInfo?.suggestedZone) { setStatus("No suggested overlay is available. Draw a Cluster Zone."); return; }
    const gold = siteInfo.suggestedZone;
    if (selected?.kind === "zone") {
      const confirmed = typeof window === "undefined" || window.confirm(
        `Replace “${selected.name}” boundary with the gold Site surface footprint? This removes curves that extend into the water if they are outside the Site layer.`,
      );
      if (!confirmed) {
        setStatus("Gold Site snap cancelled. The active Cluster Zone polygon was left unchanged.");
        return;
      }
      pushHistory({
        ...project,
        zones: project.zones.map((zone) => zone.id === selected.id ? { ...zone, polygon: gold.map((point) => [point[0], point[1]] as Point) } : zone),
      });
      setStatus("Cluster Zone boundary snapped to the gold Site surface footprint. Re-generate clusters to keep forms inside that pad.");
      return;
    }
    const duplicate = project.zones.some((zone) => polygonsNearlyEqual(zone.polygon, gold));
    if (duplicate) {
      const confirmed = typeof window !== "undefined" && window.confirm("A Cluster Zone already matches the gold Site footprint. Duplicate it anyway?");
      if (!confirmed) {
        setStatus("Suggested overlay not duplicated. Select an existing zone and click again to snap it to the gold Site surface.");
        return;
      }
    } else {
      setStatus("Created Cluster Zone from the gold Site surface footprint (not a verified legal property boundary).");
    }
    commitPolygon(gold, false);
  };

  const updateZone = (patch: Partial<ClusterZone>) => {
    if (!selected || selected.kind !== "zone") return;
    pushHistory({
      ...project,
      zones: project.zones.map((zone) => zone.id === selected.id ? { ...zone, ...patch } : zone),
      alternatives: project.alternatives.map((item) => ({
        ...item,
        stale: true,
        staleReason: `Zone “${selected.name}” settings changed — regenerate to apply.`,
      })),
    });
  };

  const generate = async (modeOverride?: GenerationMode) => {
    const mode = modeOverride ?? project.generationMode;
    if (mode === "selected-zone-only" && !selectedZoneId) {
      setStatus("Select a Cluster Zone before generating the selected zone.");
      return;
    }
    cancelRef.current = false;
    setBusy(true);
    try {
      let libraryMeshes = displayMeshes;
      if (project.protoFormSource === "sample-library" && !libraryMeshes.length) {
        const parsed = await fetchTypologySampleMeshes();
        setSampleMeshes(parsed);
        libraryMeshes = parsed;
      }
      const resolved = resolveProtoFormSources({
        mode: project.protoFormSource,
        latticeMeshes: lattice.meshes,
        importedMeshes,
        sampleMeshes: project.protoFormSource === "sample-library" ? libraryMeshes : sampleMeshes,
        pinned: project.pinnedProtoForms,
        latticeAssignments: lattice.assignments,
        typologyBindings: project.typologyBindings,
      });
      const participating = resolveParticipatingZones({
        zones: project.zones,
        mode,
        selectedZoneId,
      });
      // Active Lattice / imported / pinned: never silently substitute samples for missing typologies.
      const missingSlots = missingTypologySlots({ zones: participating.zones, sources: resolved.sources });
      const missingTypologies = missingTypologiesForZones({ zones: participating.zones, bindings: resolved.bindings });
      if (project.protoFormSource !== "sample-library" && missingTypologies.length) {
        const detail = resolved.bindings
          .filter((binding) => missingTypologies.includes(binding.typologyId))
          .map((binding) => `${binding.typologyId}/${binding.canonicalSlotId}:${binding.conflictNote ?? "unresolved"}`)
          .join(" · ");
        setStatus(
          `Generation aborted — missing authentic sources for ${missingTypologies.join(", ")}. `
          + `Unresolved slots: ${missingSlots.join(", ") || "n/a"}. `
          + `Confirm typology bindings or assign OBJs in Lattice. ${detail}`,
        );
        return;
      }
      if (!resolved.sources.length) {
        setStatus(`${resolved.report.note} Generation aborted — no proto-form OBJs are available for the selected typologies.`);
        return;
      }
      const fidelityWarning = (resolved.report.conflictCount ?? 0) > 0
        ? ` Typology/catalog conflicts: ${resolved.report.conflictCount} (confirm bindings before treating results as final).`
        : "";
      const latticeUnitScale = UNIT_TO_FEET[lattice.unit];
      const activeSources = resolved.sources.map((item) => {
        const mesh = resolved.meshes.find((entry) => entry.id === item.meshId);
        let planWidthFeet = PROTO_FORM_BAY_FEET;
        let planDepthFeet = PROTO_FORM_BAY_FEET;
        let architecturalFootprintAreaFeet = PROTO_FORM_BAY_FEET * PROTO_FORM_BAY_FEET;
        let footprintMask = undefined as ReturnType<typeof analyzeArchitecturalFootprint> | undefined;
        if (mesh) {
          const up = resolvedUp(mesh.upAxis, lattice.upAxisMode);
          const bounds = combinedBoundsSpec(mesh, latticeUnitScale, up);
          // Spec Z-up plan is XY. Collision uses authentic AABB envelopes — do not shrink OBJs to the 20 ft bay.
          planWidthFeet = Math.max(PROTO_FORM_BAY_FEET, bounds.size[0]);
          planDepthFeet = Math.max(PROTO_FORM_BAY_FEET, bounds.size[1]);
          footprintMask = analyzeArchitecturalFootprint(mesh, latticeUnitScale, lattice.upAxisMode);
          architecturalFootprintAreaFeet = footprintMask.occupancyAreaFeet;
        }
        return {
          ...item,
          filename: mesh?.filename,
          planWidthFeet,
          planDepthFeet,
          architecturalFootprintAreaFeet,
          footprintMask,
        };
      });
      const surfaceSampler = createSiteSurfaceSampler(
        loadedSite?.root ?? null,
        modelScale,
        loadedSite?.info.layers ?? [],
      );
      // Multi-objective alternatives share the project seed so differences reflect objective bias,
      // not arbitrary seed ranking. Labels are rewritten from measured outcomes after generation.
      const objectiveSpecs: Array<{ id: string; objectiveMode: "max-coverage" | "max-quantity" | "max-clusters" }> = [
        { id: "A", objectiveMode: "max-coverage" },
        { id: "B", objectiveMode: "max-quantity" },
        { id: "C", objectiveMode: "max-clusters" },
      ];
      const distributionMode = selected?.kind === "zone" ? selected.distributionMode : "balanced";
      const exclusionPolygons = project.exclusions.map((zone) => zone.polygon);
      const alternatives: GenerationAlternative[] = [];
      for (let index = 0; index < objectiveSpecs.length; index += 1) {
        if (cancelRef.current) break;
        const spec = objectiveSpecs[index];
        // Selected Zone Only and Entire Site replace the active snapshot.
        // Generate All Enabled Zones rebuilds every enabled zone fresh (settings preserved; prior geometry replaced).
        // Progressive stages: initial skips expensive repack; refinement is default; extended is opt-in.
        const base = generateSiteClusters({
          zones: project.zones,
          exclusions: project.exclusions,
          sources: activeSources,
          water: siteInfo?.waterPolyline ?? [],
          roads: siteInfo?.roadPolyline ?? [],
          corridors: project.corridors,
          anchors: project.anchors,
          suggested: siteInfo?.suggestedZone ?? null,
          constraints: project.constraints,
          mode,
          selectedZoneId,
          protoFormSource: project.protoFormSource,
          sourceLabels: resolved.report.labels,
          distributionMode,
          evaluationBudget: project.evaluationBudget,
          seed: project.seed,
          label: `${spec.id} · ${spec.objectiveMode}`,
          alternativeId: spec.id,
          existingClusters: [],
          surfaceSampler,
          optimizationStage,
          objectiveMode: spec.objectiveMode,
          cancelled: () => cancelRef.current,
        });
        // Yield so Cancel can interrupt between alternatives; skip connector synthesis when costly.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelRef.current) break;
        // Connector synthesis remains available for tiny groups; larger selected-zone runs stay placement-first.
        const skipAssembly = !models.length || base.clusters.length > 4;
        const assembled = skipAssembly
          ? {
            clusters: base.clusters,
            placementKind: base.placementKind,
            report: {
              architecturalGroups: new Set(base.clusters.map((cluster) => `${cluster.zoneId}:${cluster.architecturalClusterId}`)).size,
              groupsAttempted: 0,
              groupsConnected: 0,
              unconnectedForms: base.clusters.length,
              connectorsAccepted: 0,
              connectorsRejected: 0,
              feasibilityFailures: models.length ? [{
                groupId: -1,
                category: "budget",
                reason: `Skipped Lattice connector synthesis for ${base.clusters.length} forms to keep selected-zone placement responsive.`,
              }] : [],
              budgetLimited: true,
              note: "Site placement completed. Lattice connector synthesis skipped for responsiveness.",
            },
            connectors: [],
          }
          : await assembleLocalArchitecturalGroups({
            clusters: base.clusters,
            models,
            zones: project.zones,
            exclusions: exclusionPolygons,
            heightLimitFeet: project.constraints.heightLimitFeet,
            maxSearchGroups: 0,
            timeBudgetMs: 1500,
            cancelled: () => cancelRef.current,
          });
        if (cancelRef.current) break;
        // Guard: selected-zone results may only contain the selected zone's forms.
        const scopedClusters = mode === "selected-zone-only" && selectedZoneId
          ? assembled.clusters.filter((cluster) => cluster.zoneId === selectedZoneId)
          : assembled.clusters.filter((cluster) => cluster.zoneId !== "entire-site" || mode === "entire-site" || mode === "hybrid-site");
        const merged = {
          ...base,
          clusters: scopedClusters,
          placementKind: assembled.placementKind,
          assemblyReport: assembled.report,
          assemblyConnectors: assembled.connectors,
          stale: false,
          staleReason: null,
        };
        alternatives.push(evaluateAlternative(merged, {
          zones: project.zones,
          exclusions: project.exclusions,
          water: siteInfo?.waterPolyline ?? [],
          roads: siteInfo?.roadPolyline ?? [],
          corridors: project.corridors,
          constraints: project.constraints,
          notes: surfaceSampler.uncertain ? [surfaceSampler.sample(0, 0).reason] : [],
          surfaceSampler,
          meshes: resolved.meshes,
        }));
      }
      if (cancelRef.current) {
        setStatus("Generation cancelled. Previous valid alternatives were left unchanged.");
        return;
      }
      setProject((current) => ({
        ...current,
        generationMode: mode,
        alternatives,
        activeAlternativeId: alternatives[0]?.id ?? null,
      }));
      const scope = alternatives[0]?.scope;
      const stats = alternatives[0]?.zoneStats ?? [];
      const assemblyReport = alternatives[0]?.assemblyReport ?? null;
      const classification = classifySiteResult(alternatives[0]?.clusters ?? [], assemblyReport);
      const statsText = stats.map((item) => `${item.zoneName}: ${item.accepted}/${item.requested} · cov ${item.achievedCoverage.toFixed(1)}% · clusters ${item.architecturalClusters}/${item.preferredClusters ?? "?"}${item.budgetExhausted ? " · budget" : ""}`).join(" · ");
      const assemblyText = assemblyReport
        ? `Assembly groups ${assemblyReport.groupsConnected}/${assemblyReport.groupsAttempted} connected · connectors ${assemblyReport.connectorsAccepted} ok / ${assemblyReport.connectorsRejected} rejected · unconnected forms ${assemblyReport.unconnectedForms}${assemblyReport.budgetLimited ? " · assembly budget" : ""}`
        : "Assembly not run";
      const scopeText = scope
        ? `Scope ${scope.mode}${scope.participatingZoneNames.length ? ` · ${scope.participatingZoneNames.join(", ")}` : " · no zones"}`
        : "Scope unknown";
      const selectedOnlyNote = mode === "selected-zone-only"
        ? " Selected Zone Only filled the active editing zone and cleared other-zone forms from this alternative — use Generate All Enabled Zones to fill every zone with en checked."
        : "";
      const enabledCount = project.zones.filter((zone) => zone.enabled !== false).length;
      const multiZoneHint = mode === "enabled-zones" && enabledCount > 1
        ? ` ${enabledCount} enabled zones participated; uncheck en on zones you do not want filled (for example a full-site Zone 1).`
        : "";
      const missingText = resolved.report.missing.length ? ` Missing sources: ${resolved.report.missing.join(", ")}.` : "";
      const fidelityText = ` Source fidelity ${alternatives.filter((item) => item.sourceFidelityPassed).length}/3 · Placement ${alternatives.filter((item) => item.hardPassed).length}/3 · Overall ${alternatives.filter((item) => item.hardPassed && item.sourceFidelityPassed).length}/3.`;
      const tradeoffText = summarizeTradeoffs(alternatives).join(" ");
      const stageText = ` Stage ${optimizationStage}.`;
      setStatus(`${classification.note} ${assemblyText}. Source ${project.protoFormSource}. ${scopeText}.${selectedOnlyNote}${multiZoneHint}${fidelityWarning} ${alternatives.map((item) => `${item.id}:${item.clusters.length}`).join(" · ")}. ${statsText}.${stageText}${tradeoffText ? ` ${tradeoffText}` : ""} ${fidelityText} Registration bay ${PROTO_FORM_BAY_FEET} ft (collision uses authentic plan extents).${missingText}`);
      setView("iso");
    } finally {
      setBusy(false);
    }
  };

  const layerRows = siteInfo?.layers ?? [];
  const issues = selected
    ? validatePolygon(selected.polygon, { others: project.zones.filter((zone) => zone.id !== selected.id).map((zone) => zone.polygon) }).filter((issue) => issue.code !== "overlap")
    : [];
  const togglePanel = (id: string) => setOpenPanels((current) => ({ ...current, [id]: !current[id] }));
  const activeStats = active?.zoneStats ?? [];
  const requestedTotal = activeStats.reduce((sum, item) => sum + item.requested, 0);
  const acceptedTotal = activeStats.reduce((sum, item) => sum + item.accepted, 0);
  const totalAchievedFootprint = activeStats.reduce((sum, item) => sum + (item.achievedFootprintArea ?? 0), 0);
  const planSourcesForEstimate = useMemo(() => {
    const latticeUnitScale = UNIT_TO_FEET[lattice.unit];
    return displayMeshes.map((mesh) => {
      const up = resolvedUp(mesh.upAxis, lattice.upAxisMode);
      const bounds = combinedBoundsSpec(mesh, latticeUnitScale, up);
      const mask = analyzeArchitecturalFootprint(mesh, latticeUnitScale, lattice.upAxisMode);
      const slotId = mesh.suggestedSlotId ?? typologyBindings.find((binding) => binding.meshId === mesh.id)?.canonicalSlotId ?? null;
      return {
        meshId: mesh.id,
        slotId,
        planWidthFeet: Math.max(PROTO_FORM_BAY_FEET, bounds.size[0]),
        planDepthFeet: Math.max(PROTO_FORM_BAY_FEET, bounds.size[1]),
        architecturalFootprintAreaFeet: mask.occupancyAreaFeet,
        footprintMask: mask,
      };
    });
  }, [displayMeshes, lattice.unit, lattice.upAxisMode, typologyBindings]);

  const footprintOverlay = useMemo(() => {
    if (overlayMode !== "architectural-footprints" && overlayMode !== "compare") return null;
    const latticeUnitScale = UNIT_TO_FEET[lattice.unit];
    const maskById = new Map(
      displayMeshes.map((mesh) => [mesh.id, analyzeArchitecturalFootprint(mesh, latticeUnitScale, lattice.upAxisMode)]),
    );
    const placements = (active?.clusters ?? [])
      .map((cluster) => {
        const mask = maskById.get(cluster.meshId);
        if (!mask) return null;
        return { x: cluster.x, z: cluster.z, yawDeg: cluster.yawDeg, mask };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
    const cells = architecturalFootprintWorldCells(placements);
    const perForm = (active?.clusters ?? []).map((cluster) => {
      const mask = maskById.get(cluster.meshId);
      return {
        id: cluster.id,
        x: cluster.x,
        z: cluster.z,
        area: mask?.occupancyAreaFeet ?? 0,
        envelopeArea: mask?.envelopeAreaFeet ?? PROTO_FORM_BAY_FEET * PROTO_FORM_BAY_FEET,
      };
    });
    return { cells, perForm, method: ARCHITECTURAL_FOOTPRINT_METHOD };
  }, [active?.clusters, displayMeshes, lattice.unit, lattice.upAxisMode, overlayMode]);

  const collisionOverlay = useMemo(() => {
    if (overlayMode !== "collision-envelopes" && overlayMode !== "compare") return null;
    const latticeUnitScale = UNIT_TO_FEET[lattice.unit];
    return (active?.clusters ?? []).map((cluster) => {
      const mesh = displayMeshes.find((item) => item.id === cluster.meshId);
      let w = PROTO_FORM_BAY_FEET;
      let d = PROTO_FORM_BAY_FEET;
      if (mesh) {
        const up = resolvedUp(mesh.upAxis, lattice.upAxisMode);
        const bounds = combinedBoundsSpec(mesh, latticeUnitScale, up);
        w = Math.max(PROTO_FORM_BAY_FEET, bounds.size[0]);
        d = Math.max(PROTO_FORM_BAY_FEET, bounds.size[1]);
      }
      return {
        id: cluster.id,
        ring: polygonClosed(orientedPlanEnvelope(cluster.x, cluster.z, w, d, cluster.yawDeg)),
      };
    });
  }, [active?.clusters, displayMeshes, lattice.unit, lattice.upAxisMode, overlayMode]);
  const estimateForms = (zone: ClusterZone) => estimateAutomaticCountForZone(
    zone,
    project.exclusions.map((item) => item.polygon),
    planSourcesForEstimate,
    (id) => slotForTypology(id as SiteTypologyId),
  );

  return (
    <section className="flex min-h-screen flex-col p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>LUV Parametric Tool</p>
          <h1 className="text-xl font-semibold">Site Development</h1>
        </div>
        <AppNav />
      </header>
      <SiteRulesForProject project={project} zoneId={selected?.kind==='zone'?selected.id:null}/> 
      <p className="mt-2 max-w-5xl text-[11px]" style={{ color: "var(--muted)" }}>
        Isolated worktree · http://localhost:3010 · site placement of 20 ft proto forms (not connected Lattice assemblies).
      </p>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <div className="max-h-[calc(100vh-8rem)] space-y-2 overflow-auto pr-1">
          <Panel id="site" title="1. Site Model" open={!!openPanels.site} onToggle={togglePanel}>
            <div className="flex flex-wrap gap-2">
              <label className={buttonClass} style={buttonStyle}>
                Import GLB / OBJ
                <input type="file" accept=".glb,.gltf,.obj" className="hidden" onChange={(event) => onImportFiles(event.target.files)} />
              </label>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={siteLoading} onClick={() => void loadMiamiSample()}>
                {siteLoading ? "Loading Miami…" : "Load Miami sample"}
              </button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={acceptSuggested}>
                {selected?.kind === "zone" ? "Snap zone to gold Site" : "Use suggested overlay"}
              </button>
            </div>
            <p className="mt-2 text-[10px]" style={{ color: siteLoading || /fail|missing|empty/i.test(status) ? "#ffd58b" : siteInfo ? "#8ff2f4" : "var(--muted)" }}>{status}</p>
            <p className="mt-1 text-[10px]" style={{ color: "#ffd58b" }}>{suggestedOverlayNote(siteInfo?.suggestedZone ?? null)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <label>Units
                <select className="ml-1 bg-transparent" value={project.coordinates.unit} onChange={(event) => {
                  const unit = event.target.value as typeof project.coordinates.unit;
                  setProject(current => ({
                    ...current, import: { ...current.import, modelFeetPerUnit: current.import.sampleId === "miami-waterfront" ? UNIT_TO_FEET[unit] : undefined }, coordinates: { ...current.coordinates, unit, feetPerModel: UNIT_TO_FEET[unit], unitAssumption: unit === "feet" ? "confirmed" : "unresolved" },
                  }));
                }}>
                  <option value="meters">meters → feet</option>
                  <option value="feet">feet</option>
                  <option value="millimeters">mm → feet</option>
                  <option value="inches">inches → feet</option>
                </select>
              </label>
              <label>North
                <input type="number" className="ml-1 w-16 bg-transparent" value={project.coordinates.northDeg} onChange={(event) => setProject((current) => ({ ...current, coordinates: { ...current.coordinates, northDeg: Number(event.target.value) } }))} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span style={{ color: project.coordinates.unitAssumption === "confirmed" ? "#8ff2f4" : "#ffd58b" }}>
                Site units: {project.coordinates.unit} · {project.coordinates.unitAssumption} · {modelScale.toFixed(5)} ft per model unit
              </span>
              {project.coordinates.unitAssumption !== "confirmed" && <button
                type="button"
                className={buttonClass}
                style={actionStyle}
                onClick={() => {
                  setProject((current) => ({
                    ...current,
                    coordinates: { ...current.coordinates, unitAssumption: "confirmed" },
                  }));
                  setStatus(`Confirmed site units as ${project.coordinates.unit} (feetPerModel=${project.coordinates.feetPerModel}). Lattice site-constrained generation may proceed.`);
                }}
              >
                Confirm site units
              </button>}
            </div>
            <div className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
              Proto-form vertical axis (shared with Lattice)
              <div className="mt-1 flex flex-wrap gap-1">
                {([
                  ["auto", "Auto"],
                  ["y", "Y vertical"],
                  ["z", "Z vertical"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={buttonClass}
                    style={{
                      ...buttonStyle,
                      borderColor: lattice.upAxisMode === mode ? "var(--accent)" : "var(--line)",
                      background: lattice.upAxisMode === mode ? "var(--accent-primary)" : "transparent",
                      color: lattice.upAxisMode === mode ? "var(--app-background)" : "var(--muted)",
                    }}
                    onClick={() => lattice.setUpAxisMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1">Z-up Rhino OBJs look sideways under Y vertical — switch to Z vertical.</p>
            </div>
            <div className="mt-2 space-y-1 text-[10px]">
              {layerRows.map((layer) => (
                <label key={layer.id} className="flex items-center justify-between gap-2">
                  <span>{layer.name}</span>
                  <input type="checkbox" checked={project.layers.find((item) => item.id === layer.id)?.visible ?? true} onChange={(event) => setProject((current) => ({ ...current, layers: current.layers.map((item) => item.id === layer.id ? { ...item, visible: event.target.checked } : item) }))} />
                </label>
              ))}
              {!layerRows.length && <p style={{ color: "var(--muted)" }}>Layers appear after import.</p>}
            </div>
            <button type="button" className="mt-2 text-[10px]" style={{ color: "var(--muted)" }} onClick={() => setShowCoordinateDetails((value) => !value)}>
              {showCoordinateDetails ? "Hide" : "Show"} coordinate diagnostics
            </button>
            {showCoordinateDetails && (
              <div className="mt-1 space-y-1 text-[10px]" style={{ color: "var(--muted)" }}>
                <p>{SITE_COORDINATE_POLICY}</p>
                {siteInfo && (
                  <p>
                    Model bbox {siteInfo.bboxModel.min.map((n) => n.toFixed(1)).join(", ")} → {siteInfo.bboxModel.max.map((n) => n.toFixed(1)).join(", ")}
                    {" "}· feet span ready · unit {project.coordinates.unitAssumption}
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel id="zones" title="2. Development Zones" open={!!openPanels.zones} onToggle={togglePanel}>
            <div className="mt-2 flex flex-wrap gap-1">
              {(["orbit", "draw-polygon", "draw-rectangle", "edit-vertex", "move-zone", "exclusion", "anchor", "view-corridor", "arrival"] as SiteTool[]).map((id) => (
                <button key={id} type="button" className={buttonClass} style={{ ...buttonStyle, color: tool === id ? "#ffd58b" : "var(--muted)" }} onClick={() => chooseTool(id)}>{id}</button>
              ))}
              <button type="button" className={buttonClass} style={buttonStyle} disabled={!selected} onClick={() => {
                if (!selected) return;
                const boundsWidth = Math.max(40, Math.abs(selected.polygon[0]?.[0] - (selected.polygon[1]?.[0] ?? selected.polygon[0][0])));
                const offset = Math.max(80, boundsWidth * 0.15);
                const copy = { ...selected, id: `${selected.id}-copy`, name: `${selected.name} copy`, polygon: translatePolygon(selected.polygon, offset, 0) };
                pushHistory(selected.kind === "exclusion" ? { ...project, exclusions: [...project.exclusions, copy] } : { ...project, zones: [...project.zones, copy] });
                setSelectedZoneId(copy.id);
                chooseTool("move-zone");
                setStatus(`${copy.name} offset by ${offset.toFixed(0)} ft. Move-zone is active — click two points to reposition, or redraw.`);
              }}>Duplicate</button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={!selected} onClick={() => {
                if (!selected) return;
                pushHistory({ ...project, zones: project.zones.filter((zone) => zone.id !== selected.id), exclusions: project.exclusions.filter((zone) => zone.id !== selected.id) });
                setSelectedZoneId(null);
              }}>Delete</button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => {
                const previous = history.current.pop();
                if (previous) { future.current.push(project); setProject(previous); }
              }}>Undo</button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => {
                const next = future.current.pop();
                if (next) { history.current.push(project); setProject(next); }
              }}>Redo</button>
            </div>
            <p className="mt-2 text-[10px]" style={{ color: drawingToolsActive(tool) ? "#ffd58b" : "var(--muted)" }}>
              {drawingToolsActive(tool)
                ? `Drawing · ${tool} · left-click place · right-drag pan${draft.length ? ` · ${draft.length} vertices` : ""}${cursor ? ` · ${cursor[0].toFixed(1)}, ${cursor[1].toFixed(1)} ft` : ""}`
                : "Draw polygon/rectangle. Select edits settings; enable authorizes generation. Top view: right-drag pans."}
            </p>
            <div className="mt-2 space-y-1 text-[10px]">
              {project.zones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-2 rounded border px-2 py-1" style={{ borderColor: selectedZoneId === zone.id ? zone.color : "var(--line)", background: selectedZoneId === zone.id ? "rgba(61,214,219,0.06)" : "transparent" }}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedZoneId(zone.id); setOpenPanels((current) => ({ ...current, settings: true })); }} title="Select to edit quantity, dispersion, and typologies in Architectural Development">
                    <span style={{ color: zone.color }}>●</span> {zone.name} · {polygonArea(zone.polygon).toFixed(0)} ft²
                    {selectedZoneId === zone.id ? " · editing" : ""}
                    {!zone.enabled ? " · disabled" : ""}
                    <span className="block" style={{ color: "var(--muted)" }}>
                      {zone.quantityMode === "automatic"
                        ? `auto ~${estimateForms(zone)} forms · ${zone.targetCoveragePercent}% coverage`
                        : `manual ${zone.targetCount} forms · ${zone.targetCoveragePercent}% coverage target`}
                    </span>
                  </button>
                  <label className="shrink-0" title="Enable for All Enabled Zones generation">
                    <input type="checkbox" checked={zone.enabled !== false} onChange={(event) => {
                      pushHistory({ ...project, zones: project.zones.map((item) => item.id === zone.id ? { ...item, enabled: event.target.checked } : item) });
                    }} /> en
                  </label>
                  <label className="shrink-0" title="Show polygon in viewport">
                    <input type="checkbox" checked={zone.visible !== false} onChange={(event) => {
                      pushHistory({ ...project, zones: project.zones.map((item) => item.id === zone.id ? { ...item, visible: event.target.checked } : item) });
                    }} /> vis
                  </label>
                </div>
              ))}
              {!project.zones.length && <p style={{ color: "var(--muted)" }}>No Cluster Zones yet. Draw a polygon or use the suggested overlay.</p>}
            </div>
            {overlapSummary.summary && (
              <div className="mt-2 text-[10px]" style={{ color: "#ffd58b" }}>
                <button type="button" className="text-left" onClick={() => setShowOverlapDetails((value) => !value)}>
                  {overlapSummary.summary} {showOverlapDetails ? "▾" : "▸"}
                </button>
                {showOverlapDetails && (
                  <ul className="mt-1 list-disc pl-4" style={{ color: "var(--muted)" }}>
                    {overlapSummary.names.map((name) => <li key={name}>{name}</li>)}
                  </ul>
                )}
              </div>
            )}
            {issues.map((issue) => <p key={issue.message} className="mt-1 text-[10px]" style={{ color: issue.severity === "error" ? "#ff927f" : "#ffd58b" }}>{issue.message}</p>)}
          </Panel>

          <Panel id="settings" title={`3. Architectural Development${selected?.kind === "zone" ? ` · ${selected.name}` : ""}`} open={!!openPanels.settings} onToggle={togglePanel}>
            {selected?.kind !== "zone" ? (
              <div className="space-y-2 text-[10px]">
                <p style={{ color: "#ffd58b" }}>Quantity controls are per Cluster Zone. Select a zone below (or in section 2) to edit requested form count, coverage, and dispersion.</p>
                {project.zones.length ? (
                  <div className="flex flex-wrap gap-1">
                    {project.zones.map((zone) => (
                      <button
                        key={zone.id}
                        type="button"
                        className={buttonClass}
                        style={buttonStyle}
                        onClick={() => setSelectedZoneId(zone.id)}
                      >
                        Edit {zone.name}
                        {zone.quantityMode === "automatic" ? ` · auto` : ` · ${zone.targetCount} forms`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--muted)" }}>Draw a Cluster Zone or use the suggested overlay first.</p>
                )}
              </div>
            ) : (
              <>
              <input className="w-full bg-transparent text-[11px]" value={selected.name} onChange={(event) => updateZone({ name: event.target.value })} />
              <p className="mt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Quantity and intensity</p>
              <label className="mt-1 block text-[10px]">Quantity mode
                <select className="ml-1 bg-transparent" value={selected.quantityMode} onChange={(event) => updateZone({ quantityMode: event.target.value as QuantityMode })}>
                  <option value="manual">Manual — requested form count</option>
                  <option value="automatic">Automatic — capacity, coverage, GFA</option>
                </select>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <label>Requested forms <input type="number" min={0} className="ml-1 w-14 bg-transparent" value={selected.targetCount} onChange={(event) => updateZone({ targetCount: Number(event.target.value), quantityMode: "manual" })} /></label>
                <label>Target coverage % <input type="number" min={5} max={90} className="ml-1 w-14 bg-transparent" value={selected.targetCoveragePercent} onChange={(event) => updateZone({ targetCoveragePercent: Number(event.target.value) })} /></label>
                <label>Target GFA ft² <input type="number" min={0} className="ml-1 w-20 bg-transparent" value={selected.targetGrossFloorArea} onChange={(event) => updateZone({ targetGrossFloorArea: Number(event.target.value) })} /></label>
                <label>Preferred max <input type="number" min={1} className="ml-1 w-14 bg-transparent" value={selected.maxCount} onChange={(event) => updateZone({ maxCount: Number(event.target.value) })} /></label>
                <label>Min forms <input type="number" min={0} className="ml-1 w-14 bg-transparent" value={selected.minCount} onChange={(event) => updateZone({ minCount: Number(event.target.value) })} /></label>
                <label>Max height ft <input type="number" className="ml-1 w-14 bg-transparent" value={selected.maxHeightFeet} onChange={(event) => updateZone({ maxHeightFeet: Number(event.target.value) })} /></label>
                <label>Yaw deg <input type="number" className="ml-1 w-14 bg-transparent" value={selected.preferredYawDeg} onChange={(event) => updateZone({ preferredYawDeg: Number(event.target.value) })} /></label>
                <label title="Fixed = all forms use Yaw deg. Automatic = search 0/90/180/270 per form. Hybrid = try preferred first, then alternatives.">
                  Orientation
                  <select className="ml-1 bg-transparent" value={selected.orientationMode ?? "fixed"} onChange={(event) => updateZone({ orientationMode: event.target.value as "fixed" | "automatic" | "hybrid" })}>
                    <option value="fixed">Fixed</option>
                    <option value="automatic">Automatic</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </label>
                <label title="Force preferred yaw only (disables orientation search).">
                  <input type="checkbox" className="mr-1" checked={selected.lockPreferredYaw === true} onChange={(event) => updateZone({ lockPreferredYaw: event.target.checked })} />
                  Lock yaw
                </label>
                <label title="After coarse 0/90/180/270, also try 45° steps when Automatic/Hybrid.">
                  <input type="checkbox" className="mr-1" checked={selected.orientationFine45 === true} onChange={(event) => updateZone({ orientationFine45: event.target.checked })} />
                  Fine 45°
                </label>
                <label>Elevation offset ft <input type="number" step={0.1} className="ml-1 w-14 bg-transparent" value={selected.elevationOffsetFeet ?? 0} onChange={(event) => updateZone({ elevationOffsetFeet: Number(event.target.value) })} title="0 = sit on Site surface foundation datum" /></label>
              </div>
              <p className="text-[10px]" style={{ color: "var(--muted)" }}>Elevation offset is relative to the Site/gold surface. 0 ft places the form base on that surface. Building height limits are separate.</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Geometric clearances (edge-based)</p>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
                <label title="0 ft allows forms to touch. Overlaps remain invalid.">
                  Min edge clearance ft
                  <input type="number" min={0} step={0.1} className="ml-1 w-14 bg-transparent" value={selected.minEdgeClearanceFeet} onChange={(event) => updateZone({ minEdgeClearanceFeet: Math.max(0, Number(event.target.value)), minSpacingFeet: PROTO_FORM_BAY_FEET + Math.max(0, Number(event.target.value)) })} />
                </label>
                <label title="Separation between distinct architectural groups in this zone.">
                  Cluster separation ft
                  <input type="number" min={0} step={0.1} className="ml-1 w-14 bg-transparent" value={selected.clusterSeparationFeet} onChange={(event) => updateZone({ clusterSeparationFeet: Math.max(0, Number(event.target.value)) })} />
                </label>
                <label title="Separation versus forms in other Cluster Zones.">
                  Cross-zone separation ft
                  <input type="number" min={0} step={0.1} className="ml-1 w-14 bg-transparent" value={selected.crossZoneSeparationFeet} onChange={(event) => updateZone({ crossZoneSeparationFeet: Math.max(0, Number(event.target.value)) })} />
                </label>
                <label title="Extra tolerance reserved for validated Lattice connectors.">
                  Connection tolerance ft
                  <input type="number" min={0} step={0.1} className="ml-1 w-14 bg-transparent" value={selected.connectionToleranceFeet} onChange={(event) => updateZone({ connectionToleranceFeet: Math.max(0, Number(event.target.value)) })} />
                </label>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Spatial organization preferences</p>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
                <label title="Geographic spread of architectural groups across the zone. Soft preference — does not change form count, coverage target, or hard clearances.">
                  Dispersion {selected.dispersionPercent}%
                  <input type="range" min={0} max={100} className="ml-1 align-middle" value={selected.dispersionPercent} onChange={(event) => updateZone({ dispersionPercent: Number(event.target.value) })} />
                </label>
                <label title="How tightly forms organize within each architectural group. Independent of dispersion. Soft preference — does not change form count or coverage.">
                  Concentration {selected.concentrationPercent}%
                  <input type="range" min={0} max={100} className="ml-1 align-middle" value={selected.concentrationPercent} onChange={(event) => updateZone({ concentrationPercent: Number(event.target.value) })} />
                </label>
                <label title="Preferred number of architectural groups. Separate from Dispersion and Concentration.">
                  Preferred clusters <input type="number" min={1} max={24} className="ml-1 w-14 bg-transparent" value={selected.preferredClusterCount} onChange={(event) => updateZone({ preferredClusterCount: Number(event.target.value) })} />
                </label>
              </div>
              <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
                Dispersion and Concentration guide placement scoring. Quantity, coverage, and edge/cluster clearances remain the development controls. Density was removed — it only changed search-grid spacing and duplicated intensity.
              </p>
              <label className="mt-2 block text-[10px]">Distribution mode
                <select className="ml-1 bg-transparent" value={selected.distributionMode} onChange={(event) => updateZone({ distributionMode: event.target.value as DistributionMode })}>
                  <option value="balanced">Balanced Site Development</option>
                  <option value="waterfront">Waterfront-Oriented</option>
                  <option value="roadway-buffer">Roadway Acoustic Buffering</option>
                  <option value="custom-anchors">Custom Cluster Anchors</option>
                  <option value="hybrid">Hybrid Site-Responsive</option>
                </select>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <label>Waterfront % <input type="number" className="ml-1 w-14 bg-transparent" value={selected.waterfrontPriority} onChange={(event) => updateZone({ waterfrontPriority: Number(event.target.value) })} /></label>
                <label>Acoustic % <input type="number" className="ml-1 w-14 bg-transparent" value={selected.acousticPriority} onChange={(event) => updateZone({ acousticPriority: Number(event.target.value) })} /></label>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Typology hybridization</p>
              {SITE_TYPOLOGIES.map((item) => {
                const activeWeight = selected.typologies.find((weight) => weight.id === item.id);
                return (
                  <div key={item.id} className="mt-1 text-[10px]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!activeWeight} onChange={(event) => {
                        const ids = event.target.checked
                          ? [...selected.typologies.map((weight) => weight.id), item.id]
                          : selected.typologies.map((weight) => weight.id).filter((id) => id !== item.id);
                        updateZone({ typologies: setTypologySelection(selected.typologies, ids as SiteTypologyId[]) });
                      }} />
                      {item.name}
                    </label>
                    {activeWeight && (
                      <input type="range" min={1} max={100} value={activeWeight.weight} onChange={(event) => updateZone({ typologies: setTypologyWeight(selected.typologies, item.id, Number(event.target.value)) })} />
                    )}
                    {activeWeight && <span className="ml-2">{activeWeight.weight.toFixed(0)}%</span>}
                  </div>
                );
              })}
              <label className="mt-2 block text-[10px]">Hybridization
                <select className="ml-1 bg-transparent" value={selected.hybridization} onChange={(event) => updateZone({ hybridization: event.target.value as HybridizationMethod })}>
                  <option value="integrated">Integrated</option>
                  <option value="adjacent">Adjacent</option>
                  <option value="vertical">Vertical</option>
                </select>
              </label>
              <label className="mt-1 block text-[10px]">Typology diversity {selected.typologyDiversityPercent}%
                <input type="range" min={0} max={100} className="ml-1 align-middle" value={selected.typologyDiversityPercent} onChange={(event) => updateZone({ typologyDiversityPercent: Number(event.target.value) })} />
              </label>
              <label className="mt-1 flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={selected.representAllTypologies} onChange={(event) => updateZone({ representAllTypologies: event.target.checked })} />
                Represent all selected typologies
              </label>
              <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>{hybridizationCapability(selected.hybridization).description}</p>
              <a className="text-[10px] underline" href="/experiment/site-polygon-morphogenesis?method=hybrid-rule#site-generation-methods">Open architectural rule distribution</a>
              <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>
                {selected.quantityMode === "automatic"
                  ? `Estimate ${estimateForms(selected)} forms at ${selected.targetCoveragePercent}% coverage (authentic OBJ footprints).`
                  : `Manual ${selected.targetCount} forms · auto estimate ${estimateForms({ ...selected, quantityMode: "automatic" })}.`}
                {" "}
                Edge clearance {resolvedEdgeClearanceFeet(selected).toFixed(1)} ft (0 = touch allowed). Cluster separation {selected.clusterSeparationFeet.toFixed(1)} ft.
                {" "}
                {coverageGfaCompatibility(selected, project.exclusions.map((zone) => zone.polygon), planSourcesForEstimate).notes[0] ?? "Coverage and GFA treated as independent planning targets. Typology % ≠ coverage %."}
                {" "}Spatially grouped site placement — not Lattice-connected assemblies.
              </p>
              </>
            )}
          </Panel>

          <Panel id="generation" title="4. Generation and Alternatives" open={!!openPanels.generation} onToggle={togglePanel}>
            <label className="text-[10px]">Default generation scope
              <select className="ml-1 bg-transparent" value={project.generationMode} onChange={(event) => setProject((current) => ({ ...current, generationMode: event.target.value as GenerationMode }))}>
                <option value="selected-zone-only">Selected Zone Only</option>
                <option value="enabled-zones">All Enabled Zones</option>
                <option value="entire-site">Entire Buildable Site</option>
                <option value="hybrid-site">Hybrid site</option>
              </select>
            </label>
            <label className="ml-3 text-[10px]">Seed
              <input type="number" className="ml-1 w-20 bg-transparent" value={project.seed} onChange={(event) => setProject((current) => ({ ...current, seed: Number(event.target.value) }))} />
            </label>
            <label className="ml-3 text-[10px]">Eval budget
              <input type="number" min={500} className="ml-1 w-20 bg-transparent" value={project.evaluationBudget} onChange={(event) => setProject((current) => ({ ...current, evaluationBudget: Number(event.target.value) }))} title="Computational limit, not an architectural quantity target" />
              <label className="ml-2" title="Initial = fast valid pack. Refinement = budgeted improve (default). Extended = opt-in deeper search.">
                Stage
                <select className="ml-1 bg-transparent" value={optimizationStage} onChange={(event) => setOptimizationStage(event.target.value as typeof optimizationStage)}>
                  <option value="initial">Initial</option>
                  <option value="refinement">Refinement</option>
                  <option value="extended">Extended</option>
                </select>
              </label>
            </label>
            <label className="mt-2 block text-[10px]">Proto-Form Source
              <select
                className="ml-1 bg-transparent"
                value={project.protoFormSource}
                onChange={(event) => setProject((current) => ({
                  ...current,
                  protoFormSource: event.target.value as ProtoFormSourceMode,
                  alternatives: [],
                  activeAlternativeId: null,
                }))}
              >
                <option value="active-lattice">Active Lattice Library</option>
                <option value="imported-obj">Imported OBJ Library</option>
                <option value="saved-lattice-result">Saved / Pinned Lattice Library</option>
                <option value="sample-library">Sample Library (explicit)</option>
              </select>
            </label>
            <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
              {resolvedSource.report.availableCount} assets available
              {resolvedSource.report.missing.length ? ` · ${resolvedSource.report.missing.length} unresolved` : ""}
              {(resolvedSource.report.conflictCount ?? 0) > 0 ? ` · ${resolvedSource.report.conflictCount} catalog conflict(s)` : ""}
            </p>
            <div className="mt-2 space-y-1 rounded border px-2 py-2 text-[10px]" style={{ borderColor: "var(--line)" }}>
              <p className="font-semibold">Typology → OBJ bindings</p>
              <p style={{ color: "var(--muted)" }}>
                Canonical slots G1–G5 keep Lattice meanings. Site bindings select the mesh for each typology without rewriting the Lattice catalog.
              </p>
              {typologyBindings.map((binding) => {
                const typologyName = SITE_TYPOLOGIES.find((item) => item.id === binding.typologyId)?.name ?? binding.typologyId;
                const statusColor = binding.status === "missing" || binding.status === "conflict"
                  ? "#ff927f"
                  : binding.status === "confirmed"
                    ? "#8ff2f4"
                    : "#ffd58b";
                return (
                  <div key={binding.typologyId} className="border-t pt-1" style={{ borderColor: "var(--line)" }}>
                    <p>
                      <span style={{ color: statusColor }}>{binding.status}</span>
                      {" · "}
                      {typologyName} → {binding.canonicalSlotId}
                      {" · "}
                      {binding.filename ?? "(none)"}
                      {binding.meshId ? ` · ${binding.meshId}` : ""}
                    </p>
                    {binding.conflictNote && <p style={{ color: "#ff927f" }}>{binding.conflictNote}</p>}
                    <label className="mt-1 flex items-center gap-1">
                      Source OBJ
                      <select
                        className="ml-1 max-w-[14rem] bg-transparent"
                        value={binding.meshId ?? ""}
                        onChange={(event) => {
                          const mesh = displayMeshes.find((item) => item.id === event.target.value) ?? null;
                          setProject((current) => ({
                            ...current,
                            typologyBindings: confirmTypologyBinding(current.typologyBindings, binding.typologyId, mesh),
                          }));
                        }}
                      >
                        <option value="">— unresolved —</option>
                        {displayMeshes.map((mesh) => (
                          <option key={mesh.id} value={mesh.id}>{mesh.filename}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })}
              <button
                type="button"
                className={`${buttonClass} mt-1`}
                style={buttonStyle}
                disabled={!typologyBindings.some((binding) => binding.meshId)}
                onClick={() => setProject((current) => ({
                  ...current,
                  typologyBindings: confirmAllResolvedBindings(typologyBindings),
                }))}
              >
                Confirm all resolved bindings
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className={buttonClass} style={buttonStyle}>
                Import OBJ forms
                <input type="file" accept=".obj" multiple className="hidden" onChange={(event) => importProtoObjs(event.target.files)} />
              </label>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => {
                if (!lattice.meshes.length) {
                  setStatus("Active Lattice Library is empty — nothing to pin.");
                  return;
                }
                setProject((current) => ({
                  ...current,
                  pinnedProtoForms: pinProtoForms(lattice.meshes),
                  protoFormSource: "saved-lattice-result",
                  alternatives: [],
                  activeAlternativeId: null,
                }));
                setStatus(`Pinned ${lattice.meshes.length} Active Lattice form(s).`);
              }}>Pin Lattice library</button>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={loadSampleLibrary}>Load samples</button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={!importedMeshes.length} onClick={() => {
                setImportedMeshes([]);
                setProject((current) => ({ ...current, alternatives: [], activeAlternativeId: null }));
                setStatus("Cleared Imported OBJ Library.");
              }}>Clear imported</button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={busy || !selectedZoneId} onClick={() => generate("selected-zone-only")} title="Only the zone marked editing — other zones are cleared from this result">
                {busy ? "Generating…" : "Generate Selected Zone"}
              </button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={busy} onClick={() => generate("enabled-zones")} title="Every Cluster Zone with en checked, using each zone’s own typology settings">
                {busy ? "Generating…" : "Generate All Enabled Zones"}
              </button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={busy} onClick={() => generate("entire-site")}>
                {busy ? "Generating…" : "Generate Entire Buildable Site"}
              </button>
              <button type="button" className={buttonClass} style={buttonStyle} disabled={!busy} onClick={() => { cancelRef.current = true; setStatus("Cancel requested…"); }}>
                Cancel generation
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {project.alternatives.map((item) => (
                <button key={item.id} type="button" className={buttonClass} style={{ ...buttonStyle, color: project.activeAlternativeId === item.id ? "#ffd58b" : "var(--muted)" }} onClick={() => setProject((current) => ({ ...current, activeAlternativeId: item.id }))}>
                  {item.id} · {item.clusters.length} · {item.stale ? "stale" : !(item.sourceFidelityPassed && item.hardPassed) ? (item.sourceFidelityPassed ? "place fail" : "source fail") : "pass"}
                </button>
              ))}
            </div>
            {active && (
              <div className="mt-2 space-y-1 rounded border px-2 py-2 text-[10px]" style={{ borderColor: "var(--line)" }}>
                <p className="font-semibold">Alternative {active.id}{active.stale ? " · needs regeneration" : ""}</p>
                {active.staleReason && <p style={{ color: "#ffd58b" }}>{active.staleReason}</p>}
                <p>Generation scope: {active.scope.mode}</p>
                <p>Zones: {active.scope.participatingZoneNames.join(", ") || "none"}</p>
                <p>Requested forms: {requestedTotal}</p>
                <p>Accepted forms: {acceptedTotal}</p>
                <p style={{ color: active.sourceFidelityPassed ? "#8ff2f4" : "#ff927f" }}>
                  Source fidelity: {active.sourceFidelityPassed ? "pass" : "fail"}
                  {active.sourceFidelity
                    ? ` · ${active.sourceFidelity.resolvedCount}/${active.sourceFidelity.placedCount} authentic OBJ · missing ${active.sourceFidelity.missingSourceCount} · fallback ${active.sourceFidelity.fallbackCount}`
                    : ""}
                </p>
                {active.sourceFidelity?.note && <p style={{ color: "var(--muted)" }}>{active.sourceFidelity.note}</p>}
                <p>Whole-site built footprint (sum of zone unions): {totalAchievedFootprint.toFixed(0)} ft² — not a combined coverage target.</p>
                {(active.zoneStats[0]?.estimatedGrossFloorArea ?? 0) > 0 && (
                  <p>Estimated GFA proxy: {active.zoneStats.reduce((sum, item) => sum + item.estimatedGrossFloorArea, 0).toFixed(0)} ft² (not verified commercial floor area)</p>
                )}
                <p>
                  Collisions: {active.zoneStats.reduce((sum, item) => sum + (item.destructiveCollisions ?? 0), 0)}
                  · boundary fails: {active.zoneStats.reduce((sum, item) => sum + (item.boundaryViolations ?? 0), 0)}
                </p>
                {active.zoneStats.map((stats) => {
                  const reqMix = Object.entries(stats.typologyRequestedPercent ?? {})
                    .map(([id, pct]) => `${SITE_TYPOLOGIES.find((item) => item.id === id)?.name ?? id} ${Number(pct).toFixed(0)}%`)
                    .join(" · ") || "—";
                  const achMix = Object.entries(stats.typologyCounts ?? {})
                    .map(([id, count]) => {
                      const pct = stats.typologyAchievedPercent?.[id];
                      return `${SITE_TYPOLOGIES.find((item) => item.id === id)?.name ?? id} ${count}${pct != null ? ` (${Number(pct).toFixed(0)}%)` : ""}`;
                    })
                    .join(" · ") || "none";
                  return (
                    <div key={stats.zoneId} className="mt-2 rounded border px-2 py-2" style={{ borderColor: "var(--line)" }}>
                      <p className="font-semibold">{stats.zoneName}</p>
                      <p>Available development area: {stats.usableArea.toFixed(0)} ft²</p>
                      <p>Target coverage: {stats.targetCoverage}% · Target building footprint: {(stats.targetFootprintArea ?? 0).toFixed(0)} ft²</p>
                      <p>Architectural building footprint: {(stats.achievedFootprintArea ?? 0).toFixed(0)} ft² · Achieved coverage: {stats.achievedCoverage.toFixed(1)}%</p>
                      <p>Coverage difference: {(stats.coverageShortfallArea ?? 0) > 0 ? `shortfall ${(stats.coverageShortfallArea ?? 0).toFixed(0)} ft²` : `met / overshoot ${(stats.achievedFootprintArea - (stats.targetFootprintArea ?? 0)).toFixed(0)} ft²`}</p>
                      <p style={{ color: "var(--muted)" }}>
                        Collision envelope union: {(stats.collisionEnvelopeArea ?? 0).toFixed(0)} ft²
                        {" · "}mean arch footprint {(stats.meanSourceFootprintArea ?? 0).toFixed(0)} ft²
                        {" · "}mean envelope {(stats.meanCollisionEnvelopeArea ?? 0).toFixed(0)} ft²
                      </p>
                      <p style={{ color: "var(--muted)" }}>Footprint method: {stats.footprintMethod}</p>
                      <p>
                        {stats.quantityMode === "automatic" ? "Automatic quantity estimate" : "Requested forms"}: {stats.requested}
                        {" · "}Accepted forms: {stats.accepted}
                        {stats.rejected ? ` · Rejected attempts: ${stats.rejected}` : ""}
                      </p>
                      <p>Requested typology mix: {reqMix}</p>
                      <p>Achieved typology mix: {achMix}</p>
                      <p>Preferred versus actual clusters: {stats.preferredClusters ?? "?"} / {stats.architecturalClusters}</p>
                      <p>
                        Orientation mode: {stats.orientationMode ?? "fixed"}
                        {(stats.orientationAdjustedCount ?? 0) > 0
                          ? ` · ${stats.orientationAdjustedCount} form(s) yaw ≠ preferred`
                          : " · all preferred yaw"}
                      </p>
                      <p style={{ color: "var(--muted)" }}>Registration-bay proxy: {(stats.registrationBayFootprintArea ?? 0).toFixed(0)} ft² (not used for coverage).</p>
                      {stats.stopReason && <p style={{ color: "#ffd58b" }}>{stats.stopReason}</p>}
                    </div>
                  );
                })}
                <p>Source: {active.protoFormSource} · mode {active.distributionMode}</p>
                <p style={{ color: "#ffd58b" }}>
                  Status: {active.placementKind}
                  {active.placementKind === "lattice-connected-assembly"
                    ? " — geometrically validated Lattice connectors"
                    : " — not Lattice-connected assemblies / not a complete building"}
                </p>
                {active.assemblyReport && (
                  <>
                    <p>Lattice groups connected: {active.assemblyReport.groupsConnected}/{active.assemblyReport.groupsAttempted}</p>
                    <p>Connectors: {active.assemblyReport.connectorsAccepted} accepted · {active.assemblyReport.connectorsRejected} rejected</p>
                    <p>Unconnected forms: {active.assemblyReport.unconnectedForms}{active.assemblyReport.budgetLimited ? " · assembly budget limited" : ""}</p>
                    {active.assemblyReport.feasibilityFailures.slice(0, 4).map((item) => (
                      <p key={`${item.groupId}-${item.category}-${item.reason.slice(0, 24)}`} style={{ color: "#ffd58b" }}>
                        Feasibility · group {item.groupId}: {item.category} — {item.reason}
                      </p>
                    ))}
                  </>
                )}
                <p>
                  Placement: {active.hardPassed && active.sourceFidelityPassed ? "overall pass" : active.hardPassed ? "placement hard pass / source fail" : "hard fail"}
                  {!active.sourceFidelityPassed ? " · source fidelity required for overall pass" : ""}
                  {!active.hardPassed
                    && (active.findings.some((item) => item.kind === "hard" && !item.passed)
                      || (active.assemblyReport?.feasibilityFailures ?? []).some((item) => item.category === "collision" || item.category === "site-boundary" || item.category === "height"))
                    ? " · mandatory collision/boundary/height/source constraints failed"
                    : ""}
                  {active.assemblyReport?.budgetLimited ? " · assembly budget limited (placement may still be valid)" : ""}
                </p>
                <p style={{ color: "var(--muted)" }}>
                  Lattice assembly: {active.placementKind === "lattice-connected-assembly"
                    ? "connected assembly validated"
                    : "not claimed — independent site placements only"}
                </p>
                {active.zoneStats[0]?.stopReason && <p style={{ color: "#ffd58b" }}>{active.zoneStats[0].stopReason}</p>}
              </div>
            )}
            {active?.clusters.find((cluster) => cluster.id === selectedClusterId) && (() => {
              const selectedCluster = active.clusters.find((cluster) => cluster.id === selectedClusterId)!;
              const preferredYaw = project.zones.find((zone) => zone.id === selectedCluster.zoneId)?.preferredYawDeg ?? 0;
              return (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <p className="col-span-2">Selected cluster · 20 ft bay · {selectedCluster.typology}</p>
                <p className="col-span-2" style={{ color: "var(--muted)" }}>
                  Preferred zone yaw {preferredYaw}° · actual {selectedCluster.yawDeg}°
                  {selectedCluster.yawAdjustedFromPreferred || Math.abs(selectedCluster.yawDeg - preferredYaw) > 0.5
                    ? " · adjusted from preferred"
                    : " · matches preferred / fixed"}
                </p>
                {(["x", "z", "elevation", "yawDeg"] as const).map((key) => (
                  <label key={key}>{key}
                    <input type="number" className="ml-1 w-16 bg-transparent" value={Number(active.clusters.find((cluster) => cluster.id === selectedClusterId)?.[key].toFixed(2))} onChange={(event) => {
                      const value = Number(event.target.value);
                      setProject((current) => ({
                        ...current,
                        alternatives: current.alternatives.map((item) => item.id !== current.activeAlternativeId ? item : {
                          ...item,
                          clusters: item.clusters.map((cluster) => cluster.id === selectedClusterId ? { ...cluster, [key]: value } : cluster),
                        }),
                      }));
                    }} />
                  </label>
                ))}
              </div>
              );
            })()}
          </Panel>

          <Panel id="diagnostics" title="5. Diagnostics and Export" open={!!openPanels.diagnostics} onToggle={togglePanel}>
            <input className="w-full bg-transparent text-[11px]" value={project.name} onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => download(`${project.name.replace(/\s+/g, "-")}.json`, serializeProject(project))}>Export JSON</button>
              <label className={buttonClass} style={buttonStyle}>
                Import JSON
                <input type="file" accept=".json" className="hidden" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  pushHistory(parseProject(await file.text()));
                  setStatus("Project configuration restored. Re-link the site GLB if needed.");
                }} />
              </label>
              <button type="button" className={buttonClass} style={buttonStyle} onClick={() => setShowAdvancedDiagnostics((value) => !value)}>
                {showAdvancedDiagnostics ? "Hide" : "Show"} advanced diagnostics
              </button>
            </div>
            {showAdvancedDiagnostics && (
              <div className="mt-2 max-h-48 space-y-1 overflow-auto text-[10px]" style={{ color: "var(--muted)" }}>
                <p>{sourceNote}</p>
                {(active?.zoneStats ?? []).map((item) => (
                  <p key={item.zoneId}>
                    {item.zoneName}: requested {item.requested} · accepted {item.accepted} · rejected {item.rejected} · coverage {item.achievedCoverage.toFixed(1)}% / {item.targetCoverage}% · usable {item.usableArea.toFixed(0)} ft²
                    {item.budgetExhausted ? " · budget exhausted" : ""}
                  </p>
                ))}
                {(active?.findings ?? []).map((finding) => (
                  <p key={finding.id} style={{ color: finding.kind === "hard" && !finding.passed ? "#ff927f" : "var(--muted)" }}>
                    [{finding.kind}] {finding.category}: {finding.reason}
                  </p>
                ))}
                <p className="mt-2">{programNote(project.constraints)}</p>
              </div>
            )}
          </Panel>
        </div>

        <article className="min-h-[640px] rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
            {(["top", "iso", "perspective"] as SiteViewMode[]).map((id) => (
              <button key={id} type="button" className={buttonClass} style={{ ...buttonStyle, color: view === id ? "#8ff2f4" : "var(--muted)" }} onClick={() => setView(id)}>{id}</button>
            ))}
            <span style={{ color: "var(--muted)" }}>Overlay</span>
            {([
              { id: "forms" as const, label: "Forms" },
              { id: "architectural-footprints" as const, label: "Building footprints" },
              { id: "collision-envelopes" as const, label: "Collision envelopes" },
              { id: "compare" as const, label: "Compare" },
            ]).map((item) => (
              <button
                key={item.id}
                type="button"
                className={buttonClass}
                style={{ ...buttonStyle, color: overlayMode === item.id ? "#8ff2f4" : "var(--muted)" }}
                onClick={() => setOverlayMode(item.id)}
              >
                {item.label}
              </button>
            ))}
            <span style={{ color: "var(--muted)" }}>{active ? `${active.clusters.length} proto forms · ${PROTO_FORM_BAY_FEET} ft bays · site placement` : "No clusters"}</span>
            {drawingToolsActive(tool) && (
              <span style={{ color: "#ffd58b" }}>
                DRAWING · {tool} · {cursor ? `${cursor[0].toFixed(1)}, ${cursor[1].toFixed(1)} ft` : "move over the site"} · {draft.length} vertices
              </span>
            )}
          </div>
          {(overlayMode === "architectural-footprints" || overlayMode === "compare") && activeStats[0] && (
            <p className="mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
              Footprint overlay uses the same mesh plan-occupancy raster as coverage.
              Selected/active zones: usable {activeStats.reduce((sum, item) => sum + item.usableArea, 0).toFixed(0)} ft²
              · architectural union {totalAchievedFootprint.toFixed(0)} ft²
              · method: {activeStats[0]?.footprintMethod ?? ARCHITECTURAL_FOOTPRINT_METHOD}
            </p>
          )}
          <div className="relative h-[calc(100vh-11rem)] min-h-[560px] overflow-hidden rounded border" style={{ borderColor: drawingToolsActive(tool) ? "#ffd58b" : "var(--line)" }}>
            {drawingToolsActive(tool) && (
              <p className="pointer-events-none absolute left-2 top-2 z-10 rounded border px-2 py-1 text-[10px]" style={{ borderColor: "#ffd58b", background: "rgba(0,0,0,0.72)", color: "#ffd58b" }}>
                Drawing mode · orbit off · site feet {cursor ? `${cursor[0].toFixed(1)}, ${cursor[1].toFixed(1)}` : "—"}
              </p>
            )}
            <SiteViewport orientationSource={project}
              siteRoot={loadedSite?.root ?? null}
              feetPerModel={modelScale}
              siteSurfaceDatumY={surfaceSampler.datumY}
              layers={layerRows.map((layer) => ({ id: layer.id, name: layer.name, visible: project.layers.find((item) => item.id === layer.id)?.visible ?? true }))}
              zones={project.zones}
              exclusions={project.exclusions}
              anchors={project.anchors}
              corridors={project.corridors}
              clusters={active?.clusters ?? []}
              assemblyConnectors={active?.assemblyConnectors ?? []}
              meshes={displayMeshes}
              models={models}
              latticeUnit={lattice.unit}
              upAxisMode={lattice.upAxisMode}
              view={view}
              tool={tool}
              overlayMode={overlayMode}
              footprintCells={footprintOverlay?.cells ?? []}
              footprintPerForm={footprintOverlay?.perForm ?? []}
              collisionEnvelopes={collisionOverlay ?? []}
              coverageSummary={activeStats.map((stats) => ({
                zoneId: stats.zoneId,
                zoneName: stats.zoneName,
                usableArea: stats.usableArea,
                achievedFootprintArea: stats.achievedFootprintArea,
                targetFootprintArea: stats.targetFootprintArea,
                achievedCoverage: stats.achievedCoverage,
                targetCoverage: stats.targetCoverage,
              }))}
              selectedZoneId={selectedZoneId}
              selectedClusterId={selectedClusterId}
              draft={tool === "draw-rectangle" && rectStart && cursor ? rectanglePolygon(rectStart, cursor) : rectStart && draft.length ? rectanglePolygon(rectStart, draft[draft.length - 1] ?? rectStart) : draft}
              cursor={cursor}
              aim={aim}
              span={span}
              onSelectZone={setSelectedZoneId}
              onSelectCluster={setSelectedClusterId}
              onPointer={onPointer}
            />
          </div>
        </article>
      </div>
    </section>
  );
}
