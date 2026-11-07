"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { LATTICE_SESSION_KEY } from "../browserSession";
import { sha256, type ProjectState } from "./projectStorage";
import { createProjectStorageClient } from "./projectStorageClient";
import { parseObj } from "./parseObj";
import { LATTICE_SLOTS } from "./slots";
import type { ImportedObj, UpAxisMode, UnitName } from "./types";
import { MAX_IMPORTS } from "./types";

/** Session packing matches LatticeStudio so existing localStorage sessions still restore. */
type PackedMesh = Omit<ImportedObj, "positions" | "normals"> & {
  positions: number[];
  normals: number[];
};

export type LatticeSourceOrigin = "empty" | "session" | "user" | "sample";

type LatticeSourceValue = {
  hydrated: boolean;
  origin: LatticeSourceOrigin;
  persistenceError: string | null;
  restoreNotice: string | null;
  saveStatus: "saved" | "saving" | "unsaved" | "failed";
  restoredSession: ProjectState | null;
  updateProject: (slice: Record<string, unknown>) => void;
  exportProject: () => Promise<string>;
  openProject: (text: string) => Promise<void>;
  validateProject: (text: string) => Promise<void>;
  meshes: ImportedObj[];
  assignments: Record<string, string | null>;
  unit: UnitName;
  upAxisMode: UpAxisMode;
  setMeshes: Dispatch<SetStateAction<ImportedObj[]>>;
  setAssignments: Dispatch<SetStateAction<Record<string, string | null>>>;
  setUnit: Dispatch<SetStateAction<UnitName>>;
  setUpAxisMode: Dispatch<SetStateAction<UpAxisMode>>;
  importObjFiles: (files: File[]) => Promise<{ imported: number; error?: string }>;
  /** Explicit fallback. Fills only unassigned slots; never replaces an active Lattice assignment. */
  loadSampleObjs: () => Promise<{ loaded: number; error?: string }>;
};

const LatticeSourceContext = createContext<LatticeSourceValue | null>(null);

function packMesh(mesh: ImportedObj): PackedMesh {
  // Store exact typed buffers; transfer lists are deliberately not used (source buffers stay live).
  return mesh as unknown as PackedMesh;
}

function unpackMesh(mesh: PackedMesh): ImportedObj {
  return { ...mesh, positions: new Float32Array(mesh.positions), normals: new Float32Array(mesh.normals) };
}

function sampleFilename(slot: (typeof LATTICE_SLOTS)[number]) {
  return `${slot.id}-${slot.name.replace(/[ /]/g, "-")}.obj`;
}

export function LatticeSourceProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [origin, setOrigin] = useState<LatticeSourceOrigin>("empty");
  const [persistenceError,setPersistenceError]=useState<string|null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const writer = useRef(`writer-${Date.now()}-${Math.random()}`);
  const [saveStatus, setSaveStatus] = useState<LatticeSourceValue["saveStatus"]>("unsaved");
  const [restoredSession, setRestoredSession] = useState<ProjectState | null>(null);
  const project = useRef<ProjectState>({ version: 1, meshes: [] });
  const checksum = useRef<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const writable = useRef(false);
  const storageClient = useRef<ReturnType<typeof createProjectStorageClient> | null>(null);
  const [meshes, setMeshes] = useState<ImportedObj[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [unit, setUnit] = useState<UnitName>("feet");
  const [upAxisMode, setUpAxisMode] = useState<UpAxisMode>("auto");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = createProjectStorageClient(); storageClient.current = client;
        const rawLegacy = window.localStorage.getItem(LATTICE_SESSION_KEY);
        const restored = await client.request<{state:ProjectState|null;checksum:string|null}>("load", { legacy: rawLegacy });
        const saved = restored.state;
        if (cancelled) return;
        checksum.current = restored.checksum;
        if (saved) {
          project.current = saved;
          setRestoredSession(saved);
          setMeshes((saved.meshes as PackedMesh[]).map(unpackMesh));
          if (saved.assignments) setAssignments(saved.assignments as Record<string, string | null>);
          if (saved.unit) setUnit(saved.unit as UnitName);
          if (saved.upAxisMode) setUpAxisMode(saved.upAxisMode as UpAxisMode);
          setOrigin(saved.meshes.length ? "session" : "empty");
        }
        writable.current = true;
        let interrupted = false;
        try { interrupted = window.localStorage.getItem("luv-project-unsaved-revision") !== null || window.sessionStorage.getItem("luv-project-unsaved") === "yes"; } catch { /* persistent storage may be unavailable */ }
        setSaveStatus(restored.checksum && !interrupted ? "saved" : "unsaved");
        if (interrupted) setRestoreNotice("An unfinished save was detected. This is the last complete project; newer unsaved changes are not confirmed. Export it before deciding how to continue.");
      } catch (error) {
        if (!cancelled) { setPersistenceError(`Project restore failed; autosave is paused: ${error instanceof Error ? error.message : String(error)}`); setSaveStatus("failed"); }
      } finally { if (!cancelled) setHydrated(true); }
    })();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); storageClient.current?.dispose(); storageClient.current=null; };
  }, []);

  const updateProject = useCallback((slice: Record<string, unknown>) => {
    project.current = { ...project.current, ...slice };
    const revision = ++generation.current;
    if (!writable.current) return;
    setSaveStatus("unsaved");
    try { window.sessionStorage.setItem("luv-project-unsaved", "yes"); } catch { /* unload warning still applies */ }
    try { window.localStorage.setItem("luv-project-unsaved-revision", writer.current); } catch { /* IDB still governs verified saving */ }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saving.current = saving.current.catch(() => {}).then(async () => {
        if (revision !== generation.current) return;
        setSaveStatus("saving");
        try {
          if (!storageClient.current) throw new Error("Project storage is not initialized.");
          checksum.current = await storageClient.current.request<string>("save", { state: project.current, expected: checksum.current });
          if (revision === generation.current) {
            setSaveStatus("saved");
            try { window.sessionStorage.removeItem("luv-project-unsaved"); } catch { /* stale marker is conservative */ }
            try { if (window.localStorage.getItem("luv-project-unsaved-revision") === writer.current) window.localStorage.removeItem("luv-project-unsaved-revision"); } catch { /* stale marker is conservative */ }
            setPersistenceError(null);
          }
        } catch (error) {
          setSaveStatus("failed");
          setPersistenceError(`Project save failed (${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}). Last complete project retained; Save Project before closing.`);
        }
      });
    }, 500);
  }, []);

  useEffect(() => {
    if (hydrated) updateProject({ meshes: meshes.map(packMesh), assignments, unit, upAxisMode });
  }, [hydrated, meshes, assignments, unit, upAxisMode, updateProject]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveStatus !== "saved") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  const exportProject = useCallback(async () => {
    if(!storageClient.current)throw new Error("Project storage is not initialized.");
    return storageClient.current.request<string>("export", {state:project.current});
  }, []);
  const validateProject = useCallback(async (text: string) => {
    if(!storageClient.current)throw new Error("Project storage is not initialized.");
    await storageClient.current.request("validate", {text});
  }, []);
  const openProject = useCallback(async (text: string) => {
    if(!storageClient.current)throw new Error("Project storage is not initialized.");
    await storageClient.current.request("validate", {text});
    if (timer.current) clearTimeout(timer.current);
    ++generation.current;
    await saving.current;
    const opened = await storageClient.current.request<{state:ProjectState;checksum:string}>("open", {text,expected:checksum.current});
    const next = opened.state;
    checksum.current = opened.checksum;
    project.current = next;
    writable.current = true;
    setMeshes((next.meshes as PackedMesh[]).map(unpackMesh));
    setAssignments((next.assignments ?? {}) as Record<string, string | null>);
    setUnit((next.unit ?? "feet") as UnitName);
    setUpAxisMode((next.upAxisMode ?? "auto") as UpAxisMode);
    setRestoredSession(next);
    setOrigin("session");
    setSaveStatus("saved");
    setPersistenceError(null);
    setRestoreNotice(null);
  }, []);

  const importObjFiles = useCallback(async (files: File[]) => {
    if (!hydrated) return { imported: 0, error: "Wait for project restoration to finish." };
    const room = MAX_IMPORTS - meshes.length;
    const accepted = [...files].filter((file) => file.name.toLowerCase().endsWith(".obj")).slice(0, Math.max(0, room));
    if (!accepted.length) {
      return { imported: 0, error: room <= 0 ? `The upload limit is ${MAX_IMPORTS} OBJ files.` : "Choose OBJ files." };
    }
    const parsed: ImportedObj[] = [];
    const errors: string[] = [];
    for (const file of accepted) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const mesh = parseObj(new TextDecoder().decode(bytes), file.name);
        mesh.originalObjBytes = bytes;
        mesh.sourceSHA256 = await sha256(bytes);
        parsed.push(mesh);
      }
      catch (error) { errors.push(error instanceof Error ? error.message : file.name); }
    }
    setMeshes((current) => [...current, ...parsed].slice(0, MAX_IMPORTS));
    setAssignments((current) => {
      const next = { ...current };
      for (const mesh of parsed) {
        if (mesh.suggestedSlotId && !next[mesh.suggestedSlotId]) next[mesh.suggestedSlotId] = mesh.id;
      }
      return next;
    });
    setOrigin("user");
    return { imported: parsed.length, error: errors[0] };
  }, [meshes.length, hydrated]);

  const loadSampleObjs = useCallback(async () => {
    const openSlots = LATTICE_SLOTS.filter((slot) => !assignments[slot.id]);
    if (!openSlots.length) return { loaded: 0, error: "Every Lattice slot already has a source OBJ." };
    const parsed: ImportedObj[] = [];
    for (const slot of openSlots) {
      const filename = sampleFilename(slot);
      const response = await fetch(`/part2-samples/${filename}`);
      if (!response.ok) return { loaded: parsed.length, error: `Missing sample ${filename}` };
      const mesh = parseObj(await response.text(), filename);
      mesh.suggestedSlotId = slot.id;
      parsed.push(mesh);
    }
    setMeshes((current) => [...current, ...parsed].slice(0, MAX_IMPORTS));
    setAssignments((current) => {
      const next = { ...current };
      for (const mesh of parsed) {
        if (mesh.suggestedSlotId && !next[mesh.suggestedSlotId]) next[mesh.suggestedSlotId] = mesh.id;
      }
      return next;
    });
    setOrigin(assignments && Object.values(assignments).some(Boolean) ? "user" : "sample");
    return { loaded: parsed.length };
  }, [assignments]);

  const value = useMemo<LatticeSourceValue>(() => ({
    hydrated,
    origin,
    persistenceError,
    restoreNotice,
    saveStatus, restoredSession, updateProject, exportProject, openProject, validateProject,
    meshes,
    assignments,
    unit,
    upAxisMode,
    setMeshes,
    setAssignments,
    setUnit,
    setUpAxisMode,
    importObjFiles,
    loadSampleObjs,
  }), [hydrated, origin, persistenceError, restoreNotice, saveStatus, restoredSession, updateProject, exportProject, openProject, validateProject, meshes, assignments, unit, upAxisMode, importObjFiles, loadSampleObjs]);

  return <LatticeSourceContext.Provider value={value}>{children}</LatticeSourceContext.Provider>;
}

export function useLatticeSource() {
  const value = useContext(LatticeSourceContext);
  if (!value) throw new Error("useLatticeSource must be used inside LatticeSourceProvider");
  return value;
}
