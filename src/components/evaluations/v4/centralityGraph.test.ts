import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCentralityGraph } from "./centralityGraph.ts";

describe("unweighted centrality graph", () => {
  const nodes = [0, 1, 2, 3, 4];
  const examples: Array<[string, Array<[number, number]>, number]> = [
    ["star", [[0, 1], [0, 2], [0, 3], [0, 4]], 90.625],
    ["chain", [[0, 1], [1, 2], [2, 3], [3, 4]], 47.9166666667],
    ["cycle", [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], 30.4166666667],
    ["complete", nodes.flatMap((a) => nodes.filter((b) => b > a).map((b): [number, number] => [a, b])), 35],
  ];
  for (const [name, edges, expected] of examples) it(`${name} agrees with the independent reference`, () => {
    const result = evaluateCentralityGraph({ nodeIds: nodes, edges });
    assert.ok(Math.abs(result.score! - expected) < 1e-8, `${result.score} versus ${expected}`);
  });
  it("counts unreachable nodes as zero and normalizes duplicate edges", () => {
    const result = evaluateCentralityGraph({ nodeIds: nodes, edges: [[0, 1], [1, 0], [1, 2]] });
    assert.equal(result.edgeCount, 2); assert.equal(result.components, 3); assert.equal(result.harmonic, 0.5);
  });
  it("reports insufficient evidence for fewer than three nodes or no edges", () => {
    for (const graph of [{ nodeIds: [0], edges: [] }, { nodeIds: [0, 1], edges: [[0, 1] as const] }, { nodeIds: nodes, edges: [] }]) assert.equal(evaluateCentralityGraph(graph).score, null);
  });
  it("sets hierarchy to zero for equally central hubs", () => {
    const result = evaluateCentralityGraph({ nodeIds: nodes, edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] });
    assert.equal(result.hierarchy, 0);
  });
  it("is invariant to node ordering, deduplication, and reversing edges", () => {
    const a = evaluateCentralityGraph({ nodeIds: nodes, edges: [[0, 1], [0, 2], [0, 3], [0, 4]] });
    const b = evaluateCentralityGraph({ nodeIds: [4, 2, 0, 3, 1], edges: [[4, 0], [2, 0], [1, 0], [3, 0], [0, 1]] });
    assert.equal(a.score, b.score); assert.equal(a.primaryId, b.primaryId);
  });
  it("accepts explicit normalized weights and rejects invalid configurations", () => {
    const graph = { nodeIds: nodes, edges: [[0, 1], [1, 2], [2, 3], [3, 4]] as Array<[number, number]> };
    const result = evaluateCentralityGraph(graph, { harmonic: 1, freeman: 0, betweenness: 0, hierarchy: 0 });
    assert.equal(result.score, result.harmonic * 100);
    assert.throws(() => evaluateCentralityGraph(graph, { harmonic: 0, freeman: 0, betweenness: 0, hierarchy: 0 }));
  });
});
