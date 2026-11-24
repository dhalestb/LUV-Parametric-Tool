import { connectionDiagnostic } from "./connectionDiagnostics";

type Geometry = { positions: ArrayLike<number>; triangles?: readonly number[]; indices?: readonly number[] };
type Revision = { id: number; positions: Float64Array; indices: number[] };
const revisions = new WeakMap<object, Revision>();
let checked = new WeakMap<object, Revision>();
let depth = 0, nextId = 1;

/** Synchronous validation transaction. Geometry is checked once per outer call, never per triangle query. */
export function beginGeometryValidation() {
  if (depth++ === 0) checked = new WeakMap();
  return () => { if (--depth === 0) checked = new WeakMap(); };
}

function equal(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** Exact content comparison detects replacement AND in-place edits, including unchanged object IDs. */
export function geometryRevision(surface: Geometry): Revision {
  const known = depth ? checked.get(surface) : undefined;
  if (known) return known;
  const indices = surface.triangles ?? surface.indices ?? [];
  let revision = revisions.get(surface);
  if (!revision || !equal(surface.positions, revision.positions) || !equal(indices, revision.indices)) {
    revision = { id: nextId++, positions: Float64Array.from(surface.positions), indices: Array.from(indices) };
    revisions.set(surface, revision);
    connectionDiagnostic("cache", "geometry revision changed");
  } else connectionDiagnostic("cache", "geometry content unchanged");
  if (depth) checked.set(surface, revision);
  return revision;
}
