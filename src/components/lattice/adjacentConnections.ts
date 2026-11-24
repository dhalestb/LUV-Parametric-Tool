import { placementWorldZ, type PlacedTile } from "./types";

/** Maximum vertical registration offset still treated as a side-adjacent bay
 * pair for feature proposals. Matches the feature-connection rise screen so
 * floor-aligned neighbors of unequal height remain eligible. Same-plan-bay
 * stacks (dx=dy=0) stay ineligible here. */
export const SIDE_ADJACENT_RISE_FEET = 12;

/** Arrangement eligibility, not a material/contact certificate. Face-neighbor
 * registration bays provide an explicit side-adjacent proposal; diagonal and
 * same-bay stacks do not. Unequal heights may share a side face when their
 * registration Z differs within SIDE_ADJACENT_RISE_FEET. Original boundaries
 * and final connectors still require exact geometry validation. Mesh
 * dimensions are never normalized to a bay. */
export function sideAdjacentRegistration(a:PlacedTile,b:PlacedTile):boolean {
  return Math.abs(a.ix-b.ix)+Math.abs(a.iy-b.iy)===1
    && Math.abs(placementWorldZ(a)-placementWorldZ(b))<=SIDE_ADJACENT_RISE_FEET;
}
