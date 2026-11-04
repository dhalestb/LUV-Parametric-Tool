import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractMassingLayers, scoreMassingSequence } from "./massingLayers.ts";
import { buildAnalysisMesh } from "./geometry.ts";
import type { DescriptorSource } from "../objDescriptorAnalysis.ts";

class MeshBuilder {
  positions: number[] = [];
  faces: Array<{ vertices: number[] }> = [];

  vertex(x: number, up: number, z: number) {
    this.positions.push(x, up, z);
    return this.positions.length / 3 - 1;
  }

  quad(a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]) {
    this.faces.push({ vertices: [this.vertex(...a), this.vertex(...b), this.vertex(...c), this.vertex(...d)] });
  }

  plate(up: number, x0: number, x1: number, z0: number, z1: number) {
    this.quad([x0, up, z0], [x1, up, z0], [x1, up, z1], [x0, up, z1]);
  }

  source(): DescriptorSource {
    return { positions: Float32Array.from(this.positions), faces: this.faces, up: "y", unitScale: 1 };
  }
}

function mesh(source: DescriptorSource, id: string) {
  return buildAnalysisMesh(source, id);
}

describe("massing layers", () => {
  it("reads three aligned equal plates as a regular stacked sequence", () => {
    const m = new MeshBuilder();
    m.plate(0, 0, 30, 0, 30);
    m.plate(12, 0, 30, 0, 30);
    m.plate(24, 0, 30, 0, 30);
    const layers = extractMassingLayers(mesh(m.source(), "stack"));
    assert.equal(layers.length, 3);
    assert.ok(layers.every((layer) => layer.fragments === 1));
    const terms = scoreMassingSequence(layers, 42);
    assert.ok(terms.regularity > 0.95, `regularity ${terms.regularity}`);
    assert.ok(terms.consistency > 0.85, `consistency ${terms.consistency}`);
    assert.ok(terms.progression > 0.85, `progression ${terms.progression}`);
  });

  it("penalizes fragmented, offset plates at uneven heights", () => {
    const regular = new MeshBuilder();
    regular.plate(0, 0, 30, 0, 30);
    regular.plate(12, 0, 30, 0, 30);
    regular.plate(24, 0, 30, 0, 30);
    const messy = new MeshBuilder();
    messy.plate(0, 0, 30, 0, 30);
    messy.plate(5, 0, 8, 0, 8);
    messy.plate(6.5, 22, 30, 20, 30);
    messy.plate(14, 3, 11, 18, 28);
    messy.plate(21, 16, 28, 1, 9);
    const stacked = scoreMassingSequence(extractMassingLayers(mesh(regular.source(), "r")), 42);
    const irregular = scoreMassingSequence(extractMassingLayers(mesh(messy.source(), "m")), 42);
    assert.ok(irregular.consistency < stacked.consistency - 0.2, `consistency messy ${irregular.consistency} vs stack ${stacked.consistency}`);
    assert.ok(irregular.regularity < stacked.regularity, `regularity messy ${irregular.regularity} vs stack ${stacked.regularity}`);
  });
});
