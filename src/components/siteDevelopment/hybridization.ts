import { SITE_TYPOLOGIES, type HybridizationMethod, type SiteTypologyId, type TypologyWeight } from "./types";

export const HYBRIDIZATION_METHODS: Array<{ id: HybridizationMethod; name: string; status: "placement" | "experimental"; description: string }> = [
  {
    id: "integrated",
    name: "Integrated hybrid",
    status: "placement",
    description: "Selected proto forms mix inside one cluster according to influence weights. This is typology-weighted placement, not a completed hybrid massing engine.",
  },
  {
    id: "adjacent",
    name: "Adjacent hybrid",
    status: "placement",
    description: "Typologies occupy neighboring subregions of the zone and are scored for adjacency. Connections are reported, not claimed as finished architecture.",
  },
  {
    id: "vertical",
    name: "Vertical hybrid",
    status: "placement",
    description: "Typologies are assigned to elevation bands. Intermediate geometric intersections are not counted as extra floors.",
  },
];

export function defaultWeights(ids: SiteTypologyId[] = ["stepped-amphitheater"]): TypologyWeight[] {
  const unique = [...new Set(ids)];
  const share = unique.length ? 100 / unique.length : 0;
  return unique.map((id) => ({ id, weight: share }));
}

/** Preserve relative priorities while forcing weights to sum to 100. */
export function normalizeWeights(weights: TypologyWeight[]): TypologyWeight[] {
  const positive = weights.map((item) => ({ ...item, weight: Math.max(0, item.weight) }));
  const total = positive.reduce((sum, item) => sum + item.weight, 0);
  if (!positive.length) return [];
  if (total <= 1e-9) {
    const share = 100 / positive.length;
    return positive.map((item) => ({ ...item, weight: share }));
  }
  return positive.map((item) => ({ ...item, weight: (item.weight / total) * 100 }));
}

export function setTypologySelection(current: TypologyWeight[], selected: SiteTypologyId[]): TypologyWeight[] {
  const previous = new Map(current.map((item) => [item.id, item.weight]));
  const next = selected.map((id) => ({ id, weight: previous.get(id) ?? 100 }));
  return normalizeWeights(next);
}

export function setTypologyWeight(current: TypologyWeight[], id: SiteTypologyId, weight: number): TypologyWeight[] {
  return normalizeWeights(current.map((item) => item.id === id ? { ...item, weight } : item));
}

export function pickTypology(weights: TypologyWeight[], random: () => number): SiteTypologyId | null {
  const normalized = normalizeWeights(weights);
  if (!normalized.length) return null;
  let sample = random() * 100;
  for (const item of normalized) {
    sample -= item.weight;
    if (sample <= 0) return item.id;
  }
  return normalized[normalized.length - 1].id;
}

/**
 * Diversity-aware pick. High diversityPercent penalizes already-used typologies.
 * Low diversity permits intentional repetition (Lattice balanceTypologies analogue).
 */
export function pickTypologyWithDiversity(
  weights: TypologyWeight[],
  random: () => number,
  usedCounts: Partial<Record<SiteTypologyId, number>>,
  diversityPercent: number,
): SiteTypologyId | null {
  const normalized = normalizeWeights(weights);
  if (!normalized.length) return null;
  const diversity = Math.max(0, Math.min(100, diversityPercent)) / 100;
  const adjusted = normalized.map((item) => {
    const used = usedCounts[item.id] ?? 0;
    const penalty = diversity * used * 18;
    return { ...item, weight: Math.max(0.5, item.weight - penalty + (used === 0 ? diversity * 12 : 0)) };
  });
  const total = adjusted.reduce((sum, item) => sum + item.weight, 0);
  let sample = random() * total;
  for (const item of adjusted) {
    sample -= item.weight;
    if (sample <= 0) return item.id;
  }
  return adjusted[adjusted.length - 1].id;
}

export function unmetRepresentAll(
  selected: TypologyWeight[],
  usedCounts: Partial<Record<SiteTypologyId, number>>,
): SiteTypologyId[] {
  return selected.map((item) => item.id).filter((id) => !((usedCounts[id] ?? 0) > 0));
}

/**
 * Deterministic instance quotas from typology influence weights (largest-remainder method).
 * Treats percentages as desired share of form *instances*, not footprint coverage.
 */
export function allocateTypologyQuotas(
  weights: TypologyWeight[],
  totalCount: number,
  options?: { representAll?: boolean },
): Record<SiteTypologyId, number> {
  const normalized = normalizeWeights(weights);
  const n = Math.max(0, Math.floor(totalCount));
  const quotas = Object.fromEntries(normalized.map((item) => [item.id, 0])) as Record<SiteTypologyId, number>;
  if (!normalized.length || n <= 0) return quotas;

  const representAll = options?.representAll === true && normalized.length <= n;
  if (representAll) {
    for (const item of normalized) quotas[item.id] = 1;
  }
  const remaining = n - (representAll ? normalized.length : 0);
  if (remaining <= 0) return quotas;

  const exact = normalized.map((item) => ({
    id: item.id,
    value: (item.weight / 100) * remaining,
  }));
  const floors = exact.map((item) => ({ id: item.id, floor: Math.floor(item.value), frac: item.value - Math.floor(item.value) }));
  let assigned = floors.reduce((sum, item) => sum + item.floor, 0);
  for (const item of floors) quotas[item.id] = (quotas[item.id] ?? 0) + item.floor;
  const leftovers = [...floors].sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id));
  let index = 0;
  while (assigned < remaining && leftovers.length) {
    quotas[leftovers[index % leftovers.length].id] += 1;
    assigned += 1;
    index += 1;
  }
  return quotas;
}

/** Next typology that still has unfilled quota; prefers largest remaining deficit. */
export function nextTypologyFromQuotas(
  quotas: Record<SiteTypologyId, number>,
  placed: Partial<Record<SiteTypologyId, number>>,
  preferenceOrder?: SiteTypologyId[],
): SiteTypologyId | null {
  const remaining = (Object.keys(quotas) as SiteTypologyId[])
    .map((id) => ({ id, left: (quotas[id] ?? 0) - (placed[id] ?? 0) }))
    .filter((item) => item.left > 0)
    .sort((a, b) => b.left - a.left || a.id.localeCompare(b.id));
  if (!remaining.length) return null;
  if (preferenceOrder?.length) {
    for (const id of preferenceOrder) {
      const hit = remaining.find((item) => item.id === id);
      if (hit) return hit.id;
    }
  }
  return remaining[0].id;
}

/**
 * Expand quotas into a round-robin sequence so high-count types do not consume the first N
 * successful sites before low-count types get a chance (important when accepted << requested).
 */
export function expandQuotaSequence(
  quotas: Record<SiteTypologyId, number>,
  weightOrder: TypologyWeight[],
): SiteTypologyId[] {
  const remaining: Partial<Record<SiteTypologyId, number>> = { ...quotas };
  const order = [...weightOrder]
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .map((item) => item.id)
    .filter((id) => (quotas[id] ?? 0) > 0);
  const sequence: SiteTypologyId[] = [];
  let guard = 0;
  const total = Object.values(quotas).reduce((sum, value) => sum + (value ?? 0), 0);
  while (sequence.length < total && guard < total + 8) {
    let progressed = false;
    for (const id of order) {
      if ((remaining[id] ?? 0) > 0) {
        sequence.push(id);
        remaining[id] = (remaining[id] ?? 0) - 1;
        progressed = true;
      }
    }
    if (!progressed) break;
    guard += 1;
  }
  return sequence;
}

export function slotForTypology(id: SiteTypologyId) {
  return SITE_TYPOLOGIES.find((item) => item.id === id)?.slotId ?? null;
}

export function typologyForSlot(slotId: string | null): SiteTypologyId | null {
  return SITE_TYPOLOGIES.find((item) => item.slotId === slotId)?.id ?? null;
}

export function hybridizationCapability(method: HybridizationMethod) {
  return HYBRIDIZATION_METHODS.find((item) => item.id === method) ?? HYBRIDIZATION_METHODS[0];
}
