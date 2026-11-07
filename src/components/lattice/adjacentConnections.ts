import { placementWorldZ, type PlacedTile } from "./types";

/** Arrangement eligibility, not a material/contact certificate. Face-neighbor
 * registration bays provide an explicit side-adjacent proposal; diagonal and
 * stacked bays do not. Original boundaries and final connector still require
 * exact geometry validation. Mesh dimensions are never normalized to a bay. */
export function sideAdjacentRegistration(a:PlacedTile,b:PlacedTile):boolean {
  return Math.abs(placementWorldZ(a)-placementWorldZ(b))<1e-8
    && Math.abs(a.ix-b.ix)+Math.abs(a.iy-b.iy)===1;
}
