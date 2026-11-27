import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DescriptorSource } from "../objDescriptorAnalysis.ts";
import { openVolumeSummary } from "../openVolumeSummary.ts";
import { presentLayers } from "../presentEvidence.ts";
import { evaluateOpenVolumeDescriptor } from "./evaluateV4.ts";

function fixture() {
  const source: DescriptorSource = { positions: [], faces: [], up: "z", unitScale: 1 };
  const positions: number[] = [];
  source.positions = positions;
  const quad = (...points: number[][]) => {
    const vertices = points.map((point) => { positions.push(...point); return positions.length / 3 - 1; });
    source.faces.push({ vertices });
  };
  const plate = (x: number, z: number, size: number) => quad([x, 0, z], [x + size, 0, z], [x + size, size, z], [x, size, z]);
  const room = (x: number, z: number, size: number, height = 9) => {
    plate(x, z, size); plate(x, z + height, size);
    quad([x, 0, z], [x + size, 0, z], [x + size, 0, z + height], [x, 0, z + height]);
    quad([x, size, z], [x + size, size, z], [x + size, size, z + height], [x, size, z + height]);
    quad([x, 0, z], [x, size, z], [x, size, z + height], [x, 0, z + height]);
    quad([x + size, 0, z], [x + size, size, z], [x + size, size, z + height], [x + size, 0, z + height]);
  };
  return { source, room, plate, quad };
}

describe("all qualifying Open Volume regions", () => {
  it("shows disconnected regions on both platforms and separates their total from the scoring field", () => {
    const { source, room } = fixture();
    room(0, 0, 20); room(30, 15, 16);
    const before = JSON.stringify(source);
    const result = evaluateOpenVolumeDescriptor(source, "two-platforms");
    const m = result.evidence.measurements;
    assert.equal(m.qualifyingClearFloorFt2, 136);
    assert.equal(m.continuousFieldPockets, 2);
    assert.equal(m.continuousFieldFloorFt2, 100);
    assert.equal(m.continuousFieldVolumeFt3, 700);
    assert.equal(m.totalQualifyingFloorFt2, 136);
    assert.equal(m.totalQualifyingVolumeFt3, 952);
    assert.equal(m.clearanceVolumeFt3, 700);
    const display = presentLayers(result.evidence.layers, "openVolume");
    assert.deepEqual(display.map((layer) => layer.id), ["ov-regions", "ov-regions-volume"]);
    const floors = display.find((layer) => layer.id === "ov-regions")!;
    assert.equal(floors.total, 136);
    assert.equal(floors.shown, 136);
    const z = [...floors.triangles!].filter((_, i) => i % 3 === 2);
    assert.ok(z.some((height) => height < 1));
    assert.ok(z.some((height) => height > 14));
    const volumes = display.find((layer) => layer.id === "ov-regions-volume")!;
    assert.equal(volumes.shown, 136);
    assert.equal(volumes.triangles!.length, 136 * 108);
    assert.deepEqual(presentLayers(result.evidence.layers, "openVolume", { componentFocus: "Continuous Field" }).map((layer) => layer.id), ["ov-field", "ov-field-volume"]);
    assert.deepEqual(presentLayers(result.evidence.layers, "openVolume", { componentFocus: "Total qualifying volume" }).map((layer) => layer.id), ["ov-regions-volume"]);
    assert.ok(openVolumeSummary(m)[0].includes("952 ft³"));
    assert.ok(openVolumeSummary(m)[2].includes("700 ft³"));
    assert.equal(JSON.stringify(source), before);
  });

  it("excludes open decks even when Include top decks is enabled", () => {
    const { source, plate } = fixture();
    plate(0, 0, 12);
    const off = evaluateOpenVolumeDescriptor(source, "deck", { includeTopDecks: false });
    const on = evaluateOpenVolumeDescriptor(source, "deck", { includeTopDecks: true });
    assert.equal(off.evidence.measurements.totalQualifyingVolumeFt3, 0);
    assert.equal(on.evidence.measurements.continuousFieldFloorFt2, 0);
    assert.equal(on.evidence.measurements.totalQualifyingFloorFt2, 0);
    assert.equal(on.evidence.measurements.totalQualifyingVolumeFt3, 0);
    assert.equal(on.evidence.measurements.interiorFloorAreaFt2, 0);
    assert.equal(on.absoluteScore, 0);
    assert.equal(on.evidence.measurements.excludedOpenSkyFloorFt2, 144);
    assert.equal(on.evidence.measurements.openSkyExcluded, 1);
    const displayed = presentLayers(on.evidence.layers, "openVolume");
    assert.deepEqual(displayed, []);
    assert.deepEqual(on.evidence.components.map((c) => c.name), ["Sheltered Clearance Share", "Clearance Volume"]);
  });

  it("keeps all covered platforms while removing exposed roofs from numerator and denominator", () => {
    const { source, room, plate } = fixture();
    room(0, 0, 20); room(30, 15, 16); plate(60, 30, 12);
    const off = evaluateOpenVolumeDescriptor(source, "mixed", { includeTopDecks: false });
    const on = evaluateOpenVolumeDescriptor(source, "mixed", { includeTopDecks: true });
    assert.deepEqual(on, off);
    assert.equal(on.evidence.measurements.interiorFloorAreaFt2, 656);
    assert.equal(on.evidence.measurements.totalQualifyingFloorFt2, 136);
    assert.equal(on.evidence.measurements.totalQualifyingVolumeFt3, 952);
    assert.equal(on.evidence.measurements.continuousFieldFloorFt2, 100);
    assert.equal(on.evidence.measurements.openVoidAreaFt2, 0);
    assert.equal(on.evidence.measurements.topDeckAreaFt2, 0);
    const heights = on.evidence.layers.find((l) => l.id === "ov-regions-volume")!.triangles!;
    assert.ok([...heights].filter((_, i) => i % 3 === 2).every((z) => z < 24));
    assert.deepEqual(on.evidence.components.map((c) => c.weight), [0, 1]);
  });

  it("excludes a court open to sky despite lateral enclosure", () => {
    const { source, room } = fixture();
    room(0, 0, 20);
    source.faces.splice(1, 1); // Remove the roof; keep the floor and all walls.
    const result = evaluateOpenVolumeDescriptor(source, "open-court", { includeTopDecks: true });
    assert.equal(result.absoluteScore, 0);
    assert.equal(result.evidence.measurements.totalQualifyingVolumeFt3, 0);
    assert.equal(result.evidence.measurements.interiorFloorAreaFt2, 0);
    assert.ok(Number(result.evidence.measurements.excludedOpenSkyFloorFt2) > 0);
    assert.deepEqual(presentLayers(result.evidence.layers, "openVolume"), []);
  });

  it("does not fabricate zero totals for cached evidence without all-region measurements", () => {
    assert.match(openVolumeSummary({ continuousFieldVolumeFt3: 750 })[0], /not in this cached result/);
  });

  it("accepts exactly seven feet and keeps probes and illustrated volumes below the ceiling", () => {
    const { source, room, quad } = fixture();
    room(0, 10, 20, 7);
    // A wall above the roof must not obstruct a probe inside the room.
    quad([10, 0, 17.1], [10, 20, 17.1], [10, 20, 18], [10, 0, 18]);
    const result = evaluateOpenVolumeDescriptor(source, "upper-seven-foot-room");
    assert.equal(result.evidence.measurements.qualifyingClearFloorFt2, 100);
    assert.equal(result.evidence.measurements.totalQualifyingVolumeFt3, 700);
    assert.equal(result.evidence.measurements.qualifyingVolumeHeightFt, 7);
    const volume = result.evidence.layers.find((layer) => layer.id === "ov-regions-volume")!;
    const heights = [...volume.triangles!].filter((_, i) => i % 3 === 2);
    assert.ok(heights.every((z) => z >= 10 && z <= 17));
  });
});
