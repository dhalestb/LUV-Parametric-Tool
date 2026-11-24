import type { DescriptorResult } from "./objDescriptorAnalysis";
import { gatheringAreaScore } from "./v4/gatheringMetrics";
import { PALETTE, patchLayer } from "./v4/evidence";

type Floor = NonNullable<DescriptorResult["floorResults"]>[number];
type Candidate = NonNullable<Floor["candidates"]>[number];

function floorLeaders(result: DescriptorResult | undefined) {
  if (result?.id !== "centralized" || result.version !== "centralized-area-v4.0.0") return null;
  const leaders = new Map<number, Candidate>();
  for (const floor of result.floorResults ?? []) {
    for (const candidate of floor.candidates ?? []) {
      if (!Number.isFinite(candidate.area) || candidate.area <= 0) continue;
      const current = leaders.get(floor.level);
      if (!current || candidate.area > current.area ||
          (candidate.area === current.area && candidate.region < current.region)) {
        leaders.set(floor.level, candidate);
      }
    }
  }
  return [...leaders].sort(([a], [b]) => a - b);
}

export function gatheringComparison(result: DescriptorResult | undefined, modelId: string) {
  const floors = floorLeaders(result);
  if (!floors?.length) return null;
  const [level, candidate] = floors.reduce((best, next) => next[1].area > best[1].area ? next : best);
  const layers = floors.flatMap(([height, winner]) => {
    if (!winner.patch?.length) return [];
    return [patchLayer({
      id: `ce-floor-gathering/${modelId}/${height}`,
      label: `Floor ${height} ft · R${winner.region} · ${winner.area.toFixed(2)} ft²`,
      color: PALETTE.gold, status: "measured", components: ["Gathering area"],
    }, [winner.patch])];
  });
  return { candidate, level, areaScore: gatheringAreaScore(candidate.area), layers };
}

/** Display-only cohort. Only models awaiting a building score participate in the provisional area rank. */
export function gatheringScoreRanks(entries: { id: string; result?: DescriptorResult }[]) {
  const ranks = new Map<string, { absoluteScore: number; comparativeRank: number; cohortSize: number }>();
  const current = entries.filter(entry => entry.result?.version === "centralized-area-v4.0.0");

  const scores = current.flatMap(({ id, result }) => {
    if (Number.isFinite(result?.absoluteScore)) return [];
    const floors = floorLeaders(result);
    return floors?.length ? [{ id, value: gatheringAreaScore(Math.max(...floors.map(([, c]) => c.area))) }] : [];
  });
  for (const { id, value } of scores) {
    ranks.set(id, { absoluteScore: value, comparativeRank: 1 + scores.filter(s => s.value < value).length, cohortSize: scores.length });
  }
  return ranks;
}
