import type { Vec3 } from "./types";

type Triangle = { points: [Vec3, Vec3, Vec3]; rawNormal: Vec3; area: number };
type Node = { center: Vec3; min: Vec3; max: Vec3; secondMoment: number; normal: Vec3; moment: number[]; children?: Node[]; indices?: number[] };
export type MaterialInterval = { value: number; error: number; exhausted: boolean };

/** A spatial winding-number index for disputed material sides. Near triangles are
 * integrated exactly. Far nodes carry a conservative Taylor remainder, not an
 * unqualified approximation or a vote among rays through an imperfect mesh. */
export function materialSideIndex(triangles: Triangle[], indices: number[]) {
  const stats = { preparations: 0, queries: 0, exactTriangles: 0, farNodes: 0, exhausted: 0, maxExactTriangles: 0 };
  const build = (ids: number[]): Node => {
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const i of ids) for (const p of triangles[i].points) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]);
    }
    const center = min.map((v, k) => (v + max[k]) / 2) as Vec3;
    const node: Node = { center, min, max, secondMoment: 0, normal: [0, 0, 0], moment: Array(9).fill(0) };
    for (const i of ids) {
      const t = triangles[i], centroid = center.map((v, k) => (t.points[0][k] + t.points[1][k] + t.points[2][k]) / 3 - v);
      // Exact integral of |x-center|² over the triangle (positive area measure).
      for (let k = 0; k < 3; k++) {
        const d = t.points.map(p => p[k] - center[k]);
        node.secondMoment += t.area * (d.reduce((s,v) => s+v*v,0) + d.reduce((s,v) => s+v,0) ** 2) / 12;
      }
      for (let a = 0; a < 3; a++) {
        const n = t.rawNormal[a] * t.area; node.normal[a] += n;
        for (let b = 0; b < 3; b++) node.moment[a * 3 + b] += n * centroid[b];
      }
    }
    if (ids.length <= 8) node.indices = ids;
    else {
      const axis = max.map((v, k) => v - min[k]).reduce((best, v, k, spans) => v > spans[best] ? k : best, 0);
      ids.sort((a, b) => triangles[a].points.reduce((s, p) => s + p[axis], 0) - triangles[b].points.reduce((s, p) => s + p[axis], 0));
      const half = Math.floor(ids.length / 2); node.children = [build(ids.slice(0, half)), build(ids.slice(half))];
    }
    return node;
  };
  const root = build([...indices]);
  const prepare = (points: Vec3[], maxExact = 8192) => {
    let error = 0, nodes = 0, infinite = 0, exhausted = false;
    const scale = 4 * Math.PI;
    const queryMin = [0,1,2].map(k => Math.min(...points.map(p => p[k])));
    const queryMax = [0,1,2].map(k => Math.max(...points.map(p => p[k])));
    const exact: number[] = [];
    type Entry = { node: Node; error: number };
    const heap: Entry[] = [];
    const push = (entry: Entry) => {
      let i = heap.length; heap.push(entry);
      while (i) { const parent = (i - 1) >> 1; if (heap[parent].error >= entry.error) break; heap[i] = heap[parent]; i = parent; }
      heap[i] = entry;
    };
    const pop = () => {
      const first = heap[0], last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].error > heap[child].error) child++;
          if (last.error >= heap[child].error) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return first;
    };
    stats.preparations++;
    const add = (node: Node) => {
      const distance = Math.hypot(...queryMin.map((v,k) => Math.max(node.min[k]-queryMax[k],0,v-node.max[k])));
      // For f(r)=r/|r|³, ||D²f[u,u]||²=(9-18c²+45c⁴)/|r|⁸
      // for unit u and c=dot(u,r/|r|), hence ||D²f[u,v]||<=6/|r|⁴
      // by polarization. The remainder is <=3*integral(|x-center|²)/d⁴.
      // Every Taylor segment lies in this convex box, so box distance bounds d.
      // Sum the bounds of disjoint frontier nodes and refine the largest first.
      const bound = distance > .01 ? 3 * node.secondMoment / distance ** 4 / scale : Infinity;
      // Refining large bounds immediately also avoids subtracting huge numbers
      // from the accumulated error. All finite frontier bounds are <=1.
      const finite = bound <= 1;
      if (finite) error += bound; else infinite++;
      push({ node, error: finite ? bound : Infinity });
    };
    add(root);
    while (infinite || error > .02) {
      if (++nodes > 16384 || !heap.length) { exhausted = true; break; }
      const entry = pop(), node = entry.node;
      if (Number.isFinite(entry.error)) error -= entry.error; else infinite--;
      if (node.children) { for (const child of node.children) add(child); continue; }
      if (exact.length + node.indices!.length > maxExact) { exhausted = true; break; }
      exact.push(...node.indices!);
    }
    // One conservative spatial partition serves every witness in this box;
    // nearby material-side samples do not rebuild/refine the same tree.
    return (p: Vec3): MaterialInterval => {
      stats.queries++;
      if (exhausted || p.some((v,k) => v < queryMin[k] || v > queryMax[k])) {
        stats.exhausted++; return { value: NaN, error: Infinity, exhausted: true };
      }
      let value = 0;
      for (const {node} of heap) {
        const r = node.center.map((v,k) => v-p[k]), length = Math.hypot(...r), cube = length ** 3, fifth = length ** 5;
        let flux = 0;
        for (let a = 0; a < 3; a++) {
          flux += node.normal[a] * r[a] / cube;
          for (let b = 0; b < 3; b++) flux += node.moment[a * 3 + b] * ((a === b ? 1 / cube : 0) - 3 * r[a] * r[b] / fifth);
        }
        value += flux / scale;
      }
      for (const i of exact) {
        const [a, b, c] = triangles[i].points;
        const ax = a[0]-p[0], ay = a[1]-p[1], az = a[2]-p[2], bx = b[0]-p[0], by = b[1]-p[1], bz = b[2]-p[2], cx = c[0]-p[0], cy = c[1]-p[1], cz = c[2]-p[2];
        const la = Math.hypot(ax,ay,az), lb = Math.hypot(bx,by,bz), lc = Math.hypot(cx,cy,cz);
        value += 2 * Math.atan2(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx), la*lb*lc+(ax*bx+ay*by+az*bz)*lc+(bx*cx+by*cy+bz*cz)*la+(cx*ax+cy*ay+cz*az)*lb) / scale;
      }
      stats.exactTriangles += exact.length; stats.maxExactTriangles = Math.max(stats.maxExactTriangles, exact.length);
      stats.farNodes += heap.length;
      return { value, error: Math.max(0,error) + 1e-9, exhausted: false };
    };
  };
  return { prepare, query: (p: Vec3, maxExact?: number) => prepare([p],maxExact)(p), stats };
}
