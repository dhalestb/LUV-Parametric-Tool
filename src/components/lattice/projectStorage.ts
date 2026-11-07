/** Complete, versioned projects. Legacy Local Storage is read, never removed. */
export type ProjectState = Record<string, unknown> & { version: 1; meshes: unknown[] };
export type ProjectFile = { format: "luv-project"; version: 2; registrationFeet: 20; savedAt: string; checksum: string; payload: string };
const DB = "luv-architectural-projects";
const STORE = "projects";

export function encodeProjectState(state: unknown): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Uint8Array) {
      let binary = "";
      for (let offset = 0; offset < value.length; offset += 8192) binary += String.fromCharCode(...value.subarray(offset, offset + 8192));
      return { $luv: "Bytes", values: btoa(binary) };
    }
    if (ArrayBuffer.isView(value)) return { $luv: value.constructor.name, values: Array.from(value as unknown as ArrayLike<number>) };
    if (value instanceof Set) return { $luv: "Set", values: Array.from(value) };
    if (value instanceof Map) return { $luv: "Map", values: Array.from(value) };
    if (typeof value === "number" && !Number.isFinite(value)) return { $luv: "Number", values: String(value) };
    return value;
  });
}

export function decodeProjectState(text: string): ProjectState {
  const state = JSON.parse(text, (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe project key.");
    if (!value || typeof value !== "object" || !value.$luv) return value;
    switch (value.$luv) {
      case "Bytes": return Uint8Array.from(atob(value.values), character => character.charCodeAt(0));
      case "Float32Array": return new Float32Array(value.values);
      case "Float64Array": return new Float64Array(value.values);
      case "Uint32Array": return new Uint32Array(value.values);
      case "Uint8Array": return new Uint8Array(value.values);
      case "Int32Array": return new Int32Array(value.values);
      case "Set": return new Set(value.values);
      case "Map": return new Map(value.values);
      case "Number": return Number(value.values);
      default: throw new Error("Unsupported project data type.");
    }
  });
  validateProjectState(state);
  return state;
}

export function validateProjectState(value: unknown): asserts value is ProjectState {
  if (!value || typeof value !== "object") throw new Error("Missing project state.");
  const state = value as ProjectState;
  if (state.version !== 1 || !Array.isArray(state.meshes) || state.meshes.length > 30) throw new Error("Unsupported project version or mesh collection.");
  const ids = new Set<string>();
  for (const entry of state.meshes) {
    const mesh = entry as { id: string; filename: string; positions: ArrayLike<number>; normals: ArrayLike<number>; faces: { vertices: number[]; normals: number[] | null }[]; upAxis: string };
    if (!mesh || typeof mesh.id !== "string" || ids.has(mesh.id) || typeof mesh.filename !== "string") throw new Error("Invalid or duplicate source identity.");
    ids.add(mesh.id);
    if (!["y", "z"].includes(mesh.upAxis) || !mesh.positions || mesh.positions.length < 9 || mesh.positions.length % 3 || !mesh.normals || mesh.normals.length % 3 || !Array.isArray(mesh.faces) || !mesh.faces.length) throw new Error(`Invalid geometry: ${mesh.filename}`);
    for (const array of [mesh.positions, mesh.normals]) for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) throw new Error(`Nonfinite geometry: ${mesh.filename}`);
    for (const face of mesh.faces) {
      if (!Array.isArray(face.vertices) || face.vertices.length < 3 || face.vertices.some(i => !Number.isInteger(i) || i < 0 || i >= mesh.positions.length / 3)) throw new Error(`Invalid face: ${mesh.filename}`);
      if (face.normals && (face.normals.length !== face.vertices.length || face.normals.some(i => !Number.isInteger(i) || i < 0 || i >= mesh.normals.length / 3))) throw new Error(`Invalid normals: ${mesh.filename}`);
    }
  }
  if (state.assignments && Object.values(state.assignments as object).some(id => id !== null && !ids.has(String(id)))) throw new Error("Mapping references an absent source.");
  if (state.unit && !["feet", "inches", "meters", "millimeters"].includes(String(state.unit))) throw new Error("Unsupported units.");
  if (state.upAxisMode && !["auto", "y", "z"].includes(String(state.upAxisMode))) throw new Error("Unsupported axis interpretation.");
  if (state.field) for (const axis of ["cellsX", "cellsY", "cellsZ"]) {
    const n = (state.field as Record<string, number>)[axis];
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error("Invalid lattice dimensions.");
  }
  const validatePlacements = (placements: unknown) => {
    if (!placements || typeof placements !== "object" || Array.isArray(placements)) throw new Error("Invalid placement record.");
    for (const value of Object.values(placements)) {
      const pose = value as Record<string, unknown>;
      if (!pose || !ids.has(String(pose.meshId).split("::")[0]) || ![0, 90, 180, 270].includes(Number(pose.rotation)) || !["none", "x", "y"].includes(String(pose.mirror))) throw new Error("Invalid placement identity or orientation.");
      for (const axis of ["ix", "iy", "iz"]) if (!Number.isInteger(pose[axis]) || Number(pose[axis]) < 0) throw new Error("Invalid lattice registration.");
      if (pose.zLift !== undefined && !Number.isFinite(pose.zLift)) throw new Error("Invalid elevation offset.");
    }
  };
  if (state.placements) validatePlacements(state.placements);
  const preview = state.preview as { placements?: unknown; meshes?: unknown[] } | undefined;
  if (preview?.placements) validatePlacements(preview.placements);
  if (preview?.meshes) validateProjectState({ version: 1, meshes: preview.meshes });
  if (state.architecturalPreferences && Object.values(state.architecturalPreferences).some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 20)) throw new Error("Invalid architectural preference.");
  if (state.generatedConnectors) {
    if (!Array.isArray(state.generatedConnectors)) throw new Error("Invalid connector collection.");
    for (const connector of state.generatedConnectors as { positions: ArrayLike<number>; indices: number[]; fromTile: string; toTile: string }[]) {
      if (!connector.positions || connector.positions.length % 3 || !Array.isArray(connector.indices) || connector.indices.length % 3 || !ids.has(connector.fromTile.split("::")[0]) || !ids.has(connector.toTile.split("::")[0])) throw new Error("Invalid derived connector geometry or source identity.");
      for (let i = 0; i < connector.positions.length; i++) if (!Number.isFinite(connector.positions[i])) throw new Error("Invalid derived vertex.");
      if (connector.indices.some(i => !Number.isInteger(i) || i < 0 || i >= connector.positions.length / 3)) throw new Error("Invalid derived face index.");
    }
  }
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function makeProject(state: ProjectState): Promise<ProjectFile> {
  validateProjectState(state);
  const payload = encodeProjectState(state);
  return { format: "luv-project", version: 2, registrationFeet: 20, savedAt: new Date().toISOString(), checksum: await sha256(new TextEncoder().encode(payload)), payload };
}

export async function readProject(value: unknown): Promise<ProjectState> {
  const file = value as ProjectFile;
  if (file?.format !== "luv-project") {
    // Historical v1 stores polygon index arrays, whereas current imports use ObjFace records.
    // Change only the container representation: all original index order and coordinates remain.
    const legacy = value as ProjectState;
    if (!legacy || !Array.isArray(legacy.meshes)) throw new Error("Missing legacy geometry.");
    const normalized = { ...legacy, meshes: legacy.meshes.map(entry => {
      const mesh = entry as Record<string, unknown>;
      if (!Array.isArray(mesh.faces)) return mesh;
      return { ...mesh, faces: mesh.faces.map(face => Array.isArray(face) ? { vertices: face, normals: null } : face) };
    }) };
    validateProjectState(normalized);
    return decodeProjectState(encodeProjectState(normalized));
  }
  if (file.version !== 2 || file.registrationFeet !== 20 || typeof file.payload !== "string" || await sha256(new TextEncoder().encode(file.payload)) !== file.checksum) throw new Error("Project checksum or format is invalid.");
  const state = decodeProjectState(file.payload);
  for (const entry of state.meshes) {
    const mesh = entry as { originalObjBytes?: Uint8Array; sourceSHA256?: string };
    if (mesh.originalObjBytes && (!mesh.sourceSHA256 || await sha256(mesh.originalObjBytes) !== mesh.sourceSHA256)) throw new Error("Original OBJ byte hash mismatch.");
  }
  return state;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Project storage is blocked by another tab."));
  });
}

export async function loadStoredProject(): Promise<ProjectFile | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get("current");
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Project read failed."));
    });
  } finally { db.close(); }
}

/** Optimistic concurrency protects newer writes in another tab. Both records commit atomically. */
export async function storeProject(file: ProjectFile, expectedChecksum: string | null): Promise<void> {
  await readProject(file);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let conflict = false;
      const request = store.get("current");
      request.onsuccess = () => {
        const previous = request.result as ProjectFile | undefined;
        if ((previous?.checksum ?? null) !== expectedChecksum) { conflict = true; tx.abort(); return; }
        if (previous) store.put(previous, "previous");
        store.put(file, "current");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(conflict ? new Error("Another tab saved a newer project. Export this work before reopening.") : tx.error ?? new Error("Project transaction failed."));
    });
    const persisted = await loadStoredProject();
    if (!persisted || persisted.checksum !== file.checksum) throw new Error("Persisted project verification failed.");
    await readProject(persisted);
  } finally { db.close(); }
}
