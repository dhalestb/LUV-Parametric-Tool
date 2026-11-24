import type { ClusterZone, GenerationMode, GenerationScopeSummary } from "./types";

/** Map legacy project values onto the current generation-scope vocabulary. */
export function normalizeGenerationMode(mode: string | null | undefined): GenerationMode {
  if (mode === "selected-zone-only") return "selected-zone-only";
  if (mode === "entire-site") return "entire-site";
  if (mode === "hybrid-site") return "hybrid-site";
  if (mode === "enabled-zones") return "enabled-zones";
  // Legacy "selected-zones" meant every saved Cluster Zone, not the UI selection.
  if (mode === "selected-zones") return "enabled-zones";
  return "enabled-zones";
}

export function resolveParticipatingZones(options: {
  zones: ClusterZone[];
  mode: GenerationMode;
  selectedZoneId: string | null;
}): { zones: ClusterZone[]; summary: GenerationScopeSummary; notes: string[] } {
  const notes: string[] = [];
  const development = options.zones.filter((zone) => zone.kind === "zone");

  if (options.mode === "selected-zone-only") {
    const selected = development.find((zone) => zone.id === options.selectedZoneId) ?? null;
    if (!selected) {
      notes.push("Selected Zone Only requires an active Cluster Zone selection. No zones participated.");
      return {
        zones: [],
        summary: {
          mode: options.mode,
          selectedZoneId: options.selectedZoneId,
          participatingZoneIds: [],
          participatingZoneNames: [],
        },
        notes,
      };
    }
    return {
      zones: [selected],
      summary: {
        mode: options.mode,
        selectedZoneId: selected.id,
        participatingZoneIds: [selected.id],
        participatingZoneNames: [selected.name],
      },
      notes,
    };
  }

  if (options.mode === "entire-site" || options.mode === "hybrid-site") {
    // Entire/hybrid use the suggested site boundary inside generateSiteClusters.
    // Saved Cluster Zones do not automatically participate.
    return {
      zones: development,
      summary: {
        mode: options.mode,
        selectedZoneId: options.selectedZoneId,
        participatingZoneIds: development.map((zone) => zone.id),
        participatingZoneNames: development.map((zone) => zone.name),
      },
      notes,
    };
  }

  // enabled-zones: only zones the user explicitly authorized.
  const enabled = development.filter((zone) => zone.enabled !== false);
  const skipped = development.filter((zone) => zone.enabled === false);
  if (skipped.length) {
    notes.push(`${skipped.length} disabled Cluster Zone${skipped.length === 1 ? "" : "s"} excluded from generation: ${skipped.map((zone) => zone.name).join(", ")}.`);
  }
  if (!enabled.length) {
    notes.push("All Enabled Zones mode has no enabled Cluster Zones. Enable at least one zone or switch scope.");
  }
  return {
    zones: enabled,
    summary: {
      mode: "enabled-zones",
      selectedZoneId: options.selectedZoneId,
      participatingZoneIds: enabled.map((zone) => zone.id),
      participatingZoneNames: enabled.map((zone) => zone.name),
    },
    notes,
  };
}
