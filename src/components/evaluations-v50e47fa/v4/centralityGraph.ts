/** Centralization of a simple, undirected, unweighted region graph. */
export type CentralityWeights = { harmonic: number; freeman: number; betweenness: number; hierarchy: number };
export const DEFAULT_CENTRALITY_WEIGHTS: Readonly<CentralityWeights> = Object.freeze({ harmonic: 0.35, freeman: 0.25, betweenness: 0.25, hierarchy: 0.15 });
export type CentralityGraph = { nodeIds: number[]; edges: Array<readonly [number, number]> };
export type CentralityResult = {
  primaryId: number | null; closeness: number[]; betweenness: number[]; harmonic: number;
  freeman: number; primaryBetweenness: number; hierarchy: number; score: number | null;
  components: number; edgeCount: number; insufficientReason?: string;
};

export function evaluateCentralityGraph(graph: CentralityGraph, weights: CentralityWeights = DEFAULT_CENTRALITY_WEIGHTS): CentralityResult {
  const values = Object.values(weights);
  if (values.some((v) => !Number.isFinite(v) || v < 0) || Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error("Centrality weights must be nonnegative and sum to 1.");
  const ids = [...graph.nodeIds].sort((a, b) => a - b);
  if (new Set(ids).size !== ids.length) throw new Error("Graph node IDs must be unique.");
  const n = ids.length, index = new Map(ids.map((id, i) => [id, i]));
  const adjacency = ids.map(() => new Set<number>());
  for (const [a, b] of graph.edges) {
    const x = index.get(a), y = index.get(b);
    if (x === undefined || y === undefined) throw new Error("Graph edge references an unknown node.");
    if (x !== y) { adjacency[x].add(y); adjacency[y].add(x); }
  }
  const edgeCount = adjacency.reduce((sum, neighbours) => sum + neighbours.size, 0) / 2;
  const closeness = Array<number>(n).fill(0), between = Array<number>(n).fill(0);
  let components = 0;
  const seen = new Set<number>();
  for (let start = 0; start < n; start++) {
    if (!seen.has(start)) {
      components++;
      const pending = [start]; seen.add(start);
      while (pending.length) for (const next of adjacency[pending.pop()!]!) if (!seen.has(next)) { seen.add(next); pending.push(next); }
    }
    const distance = Array<number>(n).fill(-1), paths = Array<number>(n).fill(0), pred = ids.map(() => [] as number[]), stack: number[] = [], queue = [start];
    distance[start] = 0; paths[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q]; stack.push(v);
      for (const w of adjacency[v]) {
        if (distance[w] < 0) { distance[w] = distance[v] + 1; queue.push(w); }
        if (distance[w] === distance[v] + 1) { paths[w] += paths[v]; pred[w].push(v); }
      }
    }
    closeness[start] = n > 1 ? distance.reduce((sum, d) => sum + (d > 0 ? 1 / d : 0), 0) / (n - 1) : 0;
    const delta = Array<number>(n).fill(0);
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred[w]) delta[v] += paths[v] / paths[w] * (1 + delta[w]);
      if (w !== start) between[w] += delta[w];
    }
  }
  const normalizedBetween = between.map((value) => n >= 3 ? value / ((n - 1) * (n - 2)) : 0);
  let primary = -1;
  for (let i = 0; i < n; i++) if (primary < 0 || closeness[i] > closeness[primary] + 1e-12) primary = i;
  const harmonic = primary < 0 ? 0 : closeness[primary];
  const second = n > 1 ? Math.max(...closeness.filter((_, i) => i !== primary)) : 0;
  const hierarchy = harmonic > 0 && harmonic - second > 1e-12 ? Math.max(0, (harmonic - second) / harmonic) : 0;
  const degrees = adjacency.map((a) => a.size), maxDegree = n ? Math.max(...degrees) : 0;
  const freeman = n >= 3 ? degrees.reduce((sum, degree) => sum + maxDegree - degree, 0) / ((n - 1) * (n - 2)) : 0;
  const primaryBetweenness = primary < 0 ? 0 : normalizedBetween[primary];
  const insufficientReason = n < 3 ? "Fewer than three spatial regions were identified." : edgeCount === 0 ? "No verified relationships between spatial regions were found." : undefined;
  const score = insufficientReason ? null : 100 * (weights.harmonic * harmonic + weights.freeman * freeman + weights.betweenness * primaryBetweenness + weights.hierarchy * hierarchy);
  return { primaryId: primary < 0 ? null : ids[primary], closeness, betweenness: normalizedBetween, harmonic, freeman, primaryBetweenness, hierarchy, score, components, edgeCount, insufficientReason };
}
