import { LATTICE_SLOTS, suggestSlot } from "../lattice/slots";
import type { ImportedObj } from "../lattice/types";
import type { ClusterSource } from "./clustering";
import { slotForTypology } from "./hybridization";
import {
  SITE_TYPOLOGIES,
  type PinnedProtoForm,
  type ProtoFormSourceMode,
  type ProtoFormSourceReport,
  type SiteTypologyId,
  type SourceFidelityReport,
  type TypologySourceBinding,
  type TypologyWeight,
} from "./types";

function meshMatchesSlot(mesh: ImportedObj, slotId: string): boolean {
  if (mesh.suggestedSlotId === slotId) return true;
  if (suggestSlot(mesh.filename) === slotId) return true;
  const slot = LATTICE_SLOTS.find((item) => item.id === slotId);
  if (!slot) return false;
  // Soft suggestion tokens for short user filenames (Stepped.obj, Plate.obj, Linear.obj).
  // Confirmed Site bindings remain the persistent source of truth — this never rewrites Lattice.
  const normalized = mesh.filename.toLowerCase().replace(/[_\-./]+/g, " ");
  const tokens = [
    ...slot.keys.flatMap((key) => key.toLowerCase().split(/[^a-z0-9]+/g)),
    ...slot.name.toLowerCase().split(/[^a-z0-9]+/g),
  ].filter((token) => token.length >= 4);
  return tokens.some((token) => normalized.includes(token));
}

function findMeshById(meshes: ImportedObj[], meshId: string | null | undefined) {
  if (!meshId) return null;
  return meshes.find((mesh) => mesh.id === meshId) ?? null;
}

function slotLabel(slotId: string) {
  return LATTICE_SLOTS.find((slot) => slot.id === slotId)?.name ?? slotId;
}

/** Suggest a mesh for a canonical Gathering slot without treating filename inference as locked truth. */
function suggestMeshForSlot(meshes: ImportedObj[], slotId: string, preferredIds: Set<string>) {
  const keyed = meshes.find((mesh) => meshMatchesSlot(mesh, slotId) && !preferredIds.has(mesh.id));
  if (keyed) return keyed;
  return meshes.find((mesh) => meshMatchesSlot(mesh, slotId)) ?? null;
}

/**
 * Resolve typology → mesh for Active Lattice / shared libraries.
 * Priority: user-confirmed Site binding → Lattice catalog assignment (when compatible) →
 * filename/slot suggestion among available meshes → missing/conflict.
 * Never rewrites Lattice assignments.
 */
export function resolveTypologyBindings(options: {
  meshes: ImportedObj[];
  assignments?: Record<string, string | null>;
  confirmed?: TypologySourceBinding[];
}): TypologySourceBinding[] {
  const meshes = options.meshes;
  const assignments = options.assignments ?? {};
  const confirmedByTypology = new Map(
    (options.confirmed ?? [])
      .filter((item) => item.userConfirmed && item.meshId)
      .map((item) => [item.typologyId, item] as const),
  );
  const claimed = new Set<string>();
  const bindings: TypologySourceBinding[] = [];

  for (const typology of SITE_TYPOLOGIES) {
    const slotId = typology.slotId;
    const prior = confirmedByTypology.get(typology.id);
    if (prior?.meshId) {
      const mesh = findMeshById(meshes, prior.meshId);
      if (mesh) {
        claimed.add(mesh.id);
        bindings.push({
          typologyId: typology.id,
          canonicalSlotId: slotId,
          meshId: mesh.id,
          filename: mesh.filename,
          status: "confirmed",
          conflictNote: null,
          userConfirmed: true,
        });
        continue;
      }
      bindings.push({
        typologyId: typology.id,
        canonicalSlotId: slotId,
        meshId: prior.meshId,
        filename: prior.filename,
        status: "missing",
        conflictNote: `Confirmed mesh ${prior.filename ?? prior.meshId} is no longer in the Active Lattice library.`,
        userConfirmed: true,
      });
      continue;
    }

    const assignedId = assignments[slotId] ?? null;
    const assignedMesh = findMeshById(meshes, assignedId);
    const suggestedMesh = suggestMeshForSlot(meshes, slotId, claimed);

    if (assignedMesh && meshMatchesSlot(assignedMesh, slotId)) {
      claimed.add(assignedMesh.id);
      bindings.push({
        typologyId: typology.id,
        canonicalSlotId: slotId,
        meshId: assignedMesh.id,
        filename: assignedMesh.filename,
        status: "from-assignment",
        conflictNote: null,
        userConfirmed: false,
      });
      continue;
    }

    if (assignedMesh && suggestedMesh && suggestedMesh.id !== assignedMesh.id) {
      claimed.add(suggestedMesh.id);
      bindings.push({
        typologyId: typology.id,
        canonicalSlotId: slotId,
        meshId: suggestedMesh.id,
        filename: suggestedMesh.filename,
        status: "conflict",
        conflictNote: `Lattice ${slotId} (${slotLabel(slotId)}) is assigned to ${assignedMesh.filename}, which does not match this typology. Suggested ${suggestedMesh.filename}. Confirm or pick explicitly — Lattice catalog is unchanged.`,
        userConfirmed: false,
      });
      continue;
    }

    if (assignedMesh && !meshMatchesSlot(assignedMesh, slotId)) {
      claimed.add(assignedMesh.id);
      bindings.push({
        typologyId: typology.id,
        canonicalSlotId: slotId,
        meshId: assignedMesh.id,
        filename: assignedMesh.filename,
        status: "conflict",
        conflictNote: `Lattice ${slotId} is assigned to ${assignedMesh.filename}, which does not match ${typology.name}. Confirm this mesh or select another — no silent substitution.`,
        userConfirmed: false,
      });
      continue;
    }

    if (suggestedMesh) {
      claimed.add(suggestedMesh.id);
      bindings.push({
        typologyId: typology.id,
        canonicalSlotId: slotId,
        meshId: suggestedMesh.id,
        filename: suggestedMesh.filename,
        status: "suggested",
        conflictNote: assignedId && !assignedMesh
          ? `Lattice ${slotId} assignment id is missing from the library; suggested ${suggestedMesh.filename} by filename keys.`
          : null,
        userConfirmed: false,
      });
      continue;
    }

    bindings.push({
      typologyId: typology.id,
      canonicalSlotId: slotId,
      meshId: null,
      filename: null,
      status: "missing",
      conflictNote: `No Active Lattice mesh is bound to ${typology.name} (${slotId}). Assign or select a source OBJ.`,
      userConfirmed: false,
    });
  }

  return bindings;
}

export function bindingsToSources(bindings: TypologySourceBinding[]): ClusterSource[] {
  return bindings
    .filter((binding) => binding.meshId && binding.status !== "missing")
    .map((binding) => ({
      meshId: binding.meshId as string,
      slotId: binding.canonicalSlotId,
      filename: binding.filename ?? undefined,
    }));
}

/** Slot ids required by zone typology checkboxes but absent from the current library. */
export function missingTypologySlots(options: {
  zones: Array<{ typologies: TypologyWeight[] }>;
  sources: ClusterSource[];
}): string[] {
  const have = new Set(options.sources.map((source) => source.slotId).filter((slot): slot is string => !!slot));
  const need = new Set<string>();
  for (const zone of options.zones) {
    for (const typology of zone.typologies) {
      const slot = slotForTypology(typology.id);
      if (slot) need.add(slot);
    }
  }
  return [...need].filter((slot) => !have.has(slot)).sort();
}

export function missingTypologiesForZones(options: {
  zones: Array<{ typologies: TypologyWeight[] }>;
  bindings: TypologySourceBinding[];
}): SiteTypologyId[] {
  const available = new Set(
    options.bindings
      .filter((binding) => binding.meshId && binding.status !== "missing")
      .map((binding) => binding.typologyId),
  );
  const need = new Set<SiteTypologyId>();
  for (const zone of options.zones) {
    for (const typology of zone.typologies) need.add(typology.id);
  }
  return [...need].filter((id) => !available.has(id));
}

export function normalizeProtoFormSourceMode(mode: string | null | undefined): ProtoFormSourceMode {
  if (mode === "imported-obj") return "imported-obj";
  if (mode === "sample-library") return "sample-library";
  if (mode === "saved-lattice-result") return "saved-lattice-result";
  if (mode === "active-lattice") return "active-lattice";
  return "active-lattice";
}

export function pinProtoForms(meshes: ImportedObj[]): PinnedProtoForm[] {
  return meshes.map((mesh) => ({
    meshId: mesh.id,
    filename: mesh.filename,
    slotId: mesh.suggestedSlotId,
    revision: `${mesh.filename}:${mesh.positions.length}:${mesh.faces.length}`,
  }));
}

function sourcesFromMeshes(meshes: ImportedObj[]): ClusterSource[] {
  return meshes.map((mesh) => {
    const slotId = mesh.suggestedSlotId ?? suggestSlot(mesh.filename);
    return { meshId: mesh.id, slotId, filename: mesh.filename };
  });
}

export function resolveProtoFormSources(options: {
  mode: ProtoFormSourceMode;
  latticeMeshes: ImportedObj[];
  importedMeshes: ImportedObj[];
  sampleMeshes: ImportedObj[];
  pinned: PinnedProtoForm[];
  /** Lattice catalog slot → meshId map (authoritative for Active Lattice). */
  latticeAssignments?: Record<string, string | null>;
  /** Persisted Site typology bindings (confirmed picks survive catalog edits). */
  typologyBindings?: TypologySourceBinding[];
}): {
  meshes: ImportedObj[];
  sources: ClusterSource[];
  bindings: TypologySourceBinding[];
  report: ProtoFormSourceReport;
} {
  const { mode } = options;

  if (mode === "imported-obj") {
    const meshes = options.importedMeshes;
    const bindings = resolveTypologyBindings({ meshes, confirmed: options.typologyBindings });
    return {
      meshes,
      sources: sourcesFromMeshes(meshes),
      bindings,
      report: {
        mode,
        availableCount: meshes.length,
        missing: [],
        labels: meshes.map((mesh) => mesh.filename),
        bindings,
        unresolvedTypologies: bindings.filter((item) => item.status === "missing").map((item) => item.typologyId),
        conflictCount: bindings.filter((item) => item.status === "conflict").length,
        note: meshes.length
          ? `Using ${meshes.length} project-imported OBJ protoform(s).`
          : "Imported OBJ Library is empty. Import OBJ files into Site Development first.",
      },
    };
  }

  if (mode === "sample-library") {
    const meshes = options.sampleMeshes;
    const bindings = resolveTypologyBindings({
      meshes,
      assignments: Object.fromEntries(meshes.filter((mesh) => mesh.suggestedSlotId).map((mesh) => [mesh.suggestedSlotId as string, mesh.id])),
      confirmed: options.typologyBindings,
    });
    return {
      meshes,
      sources: bindingsToSources(bindings).length ? bindingsToSources(bindings) : sourcesFromMeshes(meshes),
      bindings,
      report: {
        mode,
        availableCount: meshes.length,
        missing: [],
        labels: meshes.map((mesh) => mesh.filename),
        bindings,
        unresolvedTypologies: bindings.filter((item) => item.status === "missing").map((item) => item.typologyId),
        conflictCount: bindings.filter((item) => item.status === "conflict").length,
        note: meshes.length
          ? `Using ${meshes.length} built-in sample protoform(s). Samples load only when this mode is selected.`
          : "Sample Library has not been loaded yet. Choose Sample Library and load samples explicitly.",
      },
    };
  }

  if (mode === "saved-lattice-result") {
    const byId = new Map(options.latticeMeshes.map((mesh) => [mesh.id, mesh]));
    const byName = new Map(options.latticeMeshes.map((mesh) => [mesh.filename, mesh]));
    const meshes: ImportedObj[] = [];
    const missing: string[] = [];
    for (const pin of options.pinned) {
      const match = byId.get(pin.meshId) ?? byName.get(pin.filename) ?? null;
      if (!match) {
        missing.push(`${pin.filename} (${pin.meshId})`);
        continue;
      }
      meshes.push(match);
    }
    const bindings = resolveTypologyBindings({
      meshes,
      assignments: options.latticeAssignments,
      confirmed: options.typologyBindings,
    });
    return {
      meshes,
      sources: bindingsToSources(bindings).length ? bindingsToSources(bindings) : sourcesFromMeshes(meshes),
      bindings,
      report: {
        mode,
        availableCount: meshes.length,
        missing,
        labels: meshes.map((mesh) => mesh.filename),
        bindings,
        unresolvedTypologies: bindings.filter((item) => item.status === "missing").map((item) => item.typologyId),
        conflictCount: bindings.filter((item) => item.status === "conflict").length,
        note: options.pinned.length
          ? missing.length
            ? `Pinned Lattice library restored ${meshes.length}/${options.pinned.length} forms. Missing assets were not substituted.`
            : `Using pinned Lattice library of ${meshes.length} protoform(s).`
          : "No Lattice library has been pinned yet. Pin the active Lattice library first.",
      },
    };
  }

  // active-lattice — Lattice meshes + catalog assignments are authoritative; no sample fill-in.
  const meshes = options.latticeMeshes;
  const bindings = resolveTypologyBindings({
    meshes,
    assignments: options.latticeAssignments,
    confirmed: options.typologyBindings,
  });
  const sources = bindingsToSources(bindings);
  const unresolved = bindings.filter((item) => item.status === "missing");
  const conflicts = bindings.filter((item) => item.status === "conflict");
  return {
    meshes,
    sources,
    bindings,
    report: {
      mode: "active-lattice",
      availableCount: meshes.length,
      missing: unresolved.map((item) => `${item.typologyId} (${item.canonicalSlotId})`),
      labels: meshes.map((mesh) => mesh.filename),
      bindings,
      unresolvedTypologies: unresolved.map((item) => item.typologyId),
      conflictCount: conflicts.length,
      note: meshes.length
        ? `Using the active Lattice library (${meshes.length} OBJ form(s)) with typology bindings. Shared via LatticeSourceProvider / vul-lattice-session. Conflicts: ${conflicts.length}. Unresolved: ${unresolved.length}.`
        : "Active Lattice Library is empty. Import or assign OBJs on the Lattice tab, or switch source mode.",
    },
  };
}

export function sourceFingerprint(meshes: ImportedObj[]) {
  return meshes.map((mesh) => `${mesh.id}|${mesh.filename}|${mesh.positions.length}`).sort().join(";");
}

export function placementsReferenceMissingSources(
  clusters: Array<{ meshId: string }>,
  meshes: ImportedObj[],
) {
  const ids = new Set(meshes.map((mesh) => mesh.id));
  return clusters.filter((cluster) => !ids.has(cluster.meshId)).map((cluster) => cluster.meshId);
}

export function evaluateSourceFidelity(options: {
  clusters: Array<{ meshId: string; typology: SiteTypologyId | null; slotId: string | null }>;
  meshes: ImportedObj[];
  protoFormSource: ProtoFormSourceMode;
}): SourceFidelityReport {
  const byId = new Map(options.meshes.map((mesh) => [mesh.id, mesh]));
  const rows = options.clusters.map((cluster) => {
    const mesh = byId.get(cluster.meshId) ?? null;
    return {
      typology: cluster.typology,
      slotId: cluster.slotId,
      filename: mesh?.filename ?? null,
      meshId: cluster.meshId,
      available: !!mesh,
      rendered: mesh ? "authentic-obj" as const : "missing-source" as const,
    };
  });
  const missingSourceCount = rows.filter((row) => !row.available).length;
  const looksLikeSampleId = (id: string) => /mesh-\d+-/.test(id) === false && id.includes("sample");
  const substitutionCount = options.protoFormSource === "active-lattice"
    ? rows.filter((row) => row.available && looksLikeSampleId(row.meshId)).length
    : 0;
  const passed = options.clusters.length > 0 && missingSourceCount === 0 && substitutionCount === 0;
  return {
    passed,
    placedCount: rows.length,
    resolvedCount: rows.filter((row) => row.available).length,
    missingSourceCount,
    fallbackCount: missingSourceCount,
    substitutionCount,
    rows,
    note: !options.clusters.length
      ? "No placements to evaluate for source fidelity."
      : passed
        ? `Source fidelity pass: ${rows.length} placement(s) reference available authentic OBJ meshes.`
        : `Source fidelity fail: ${missingSourceCount} missing-source placement(s)${substitutionCount ? `, ${substitutionCount} sample substitution(s)` : ""}. Regenerate after repairing typology bindings.`,
  };
}

export function confirmTypologyBinding(
  current: TypologySourceBinding[],
  typologyId: SiteTypologyId,
  mesh: ImportedObj | null,
): TypologySourceBinding[] {
  const slotId = SITE_TYPOLOGIES.find((item) => item.id === typologyId)?.slotId ?? "G1";
  const next: TypologySourceBinding = mesh
    ? {
      typologyId,
      canonicalSlotId: slotId,
      meshId: mesh.id,
      filename: mesh.filename,
      status: "confirmed",
      conflictNote: null,
      userConfirmed: true,
    }
    : {
      typologyId,
      canonicalSlotId: slotId,
      meshId: null,
      filename: null,
      status: "missing",
      conflictNote: "Cleared typology source binding.",
      userConfirmed: true,
    };
  const others = current.filter((item) => item.typologyId !== typologyId);
  return [...others, next];
}

export function confirmAllResolvedBindings(bindings: TypologySourceBinding[]): TypologySourceBinding[] {
  return bindings.map((binding) => (
    binding.meshId && binding.status !== "missing"
      ? { ...binding, status: "confirmed" as const, userConfirmed: true, conflictNote: null }
      : binding
  ));
}
