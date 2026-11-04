import { LATTICE_SLOTS, type LatticeSlot } from "./slots";

export type ImportedMeshRef = {
  id: string;
  filename: string;
  suggestedSlotId: string | null;
};

function categoryHint(filename: string): LatticeSlot["category"] | null {
  const name = filename.toLowerCase();
  if (name.includes("gathering")) return "Gathering";
  if (name.includes("lobby")) return "Lobby";
  if (name.includes("workspace") || name.includes("office")) return "Office";
  return null;
}

function emptySlot(assignments: Record<string, string | null>, filename: string) {
  const hint = categoryHint(filename);
  if (hint) {
    const matched = LATTICE_SLOTS.find((slot) => slot.category === hint && !assignments[slot.id]);
    if (matched) return matched;
  }
  return LATTICE_SLOTS.find((slot) => !assignments[slot.id]) ?? null;
}

/**
 * Keyword matches claim their slot first. Remaining uploads fill an empty slot
 * in the same program when the filename says so, then any empty slot. An
 * occupied slot is left alone. Catalog slot titles are not renamed.
 */
export function assignImportedMeshes(
  assignments: Record<string, string | null>,
  meshes: ImportedMeshRef[],
) {
  const next = { ...assignments };
  const claimed = new Set(Object.values(next).filter((id): id is string => Boolean(id)));
  const keywordAssigned: string[] = [];
  const filledEmptySlots: string[] = [];
  for (const mesh of meshes) {
    if (claimed.has(mesh.id)) continue;
    if (mesh.suggestedSlotId && !next[mesh.suggestedSlotId]) {
      next[mesh.suggestedSlotId] = mesh.id;
      claimed.add(mesh.id);
      keywordAssigned.push(`${mesh.filename} -> ${mesh.suggestedSlotId}`);
    }
  }
  for (const mesh of meshes) {
    if (claimed.has(mesh.id)) continue;
    const slot = emptySlot(next, mesh.filename);
    if (!slot) break;
    next[slot.id] = mesh.id;
    claimed.add(mesh.id);
    filledEmptySlots.push(`${mesh.filename} -> ${slot.id}`);
  }
  return { assignments: next, keywordAssigned, filledEmptySlots };
}
