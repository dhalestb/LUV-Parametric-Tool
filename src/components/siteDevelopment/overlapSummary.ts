import { polygonsOverlap } from "./geometry";
import type { ClusterZone } from "./types";

export function summarizeZoneOverlaps(zones: ClusterZone[]) {
  const names: string[] = [];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      if (!polygonsOverlap(zones[i].polygon, zones[j].polygon)) continue;
      names.push(`${zones[i].name} ∩ ${zones[j].name}`);
    }
  }
  return {
    count: names.length,
    names,
    summary: names.length
      ? `${names.length} overlapping development-zone relationship${names.length === 1 ? "" : "s"} detected. Review zone boundaries.`
      : null,
  };
}
