import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TileModel, TileVariant } from "../lattice/types.ts";
import { DESCRIPTOR_ALGORITHM_VERSION, OPEN_VOLUME_ALGORITHM_VERSION } from "./descriptorVersion.ts";
import { evaluateTileModel, readV4Cache, v4CacheKeyFor, type DescriptorSource } from "./objDescriptorAnalysis.ts";
import { evaluateOpenVolumeDescriptor } from "./v4/evaluateV4.ts";

function hall(size = 16, height = 14): DescriptorSource {
  const positions: number[] = [];
  const faces: Array<{ vertices: number[] }> = [];
  const vertex = (x: number, up: number, z: number) => {
    positions.push(x, up, z);
    return positions.length / 3 - 1;
  };
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number]) => {
    faces.push({ vertices: [vertex(...a), vertex(...b), vertex(...c), vertex(...d)] });
  };
  quad([0, 0, 0], [size, 0, 0], [size, 0, size], [0, 0, size]);
  quad([0, height, 0], [size, height, 0], [size, height, size], [0, height, size]);
  quad([0, 0, 0], [size, 0, 0], [size, height, 0], [0, height, 0]);
  quad([0, 0, size], [size, 0, size], [size, height, size], [0, height, size]);
  quad([0, 0, 0], [0, 0, size], [0, height, size], [0, height, 0]);
  quad([size, 0, 0], [size, 0, size], [size, height, size], [size, height, 0]);
  return { positions: Float32Array.from(positions), faces, up: "y", unitScale: 1 };
}

function model(id: string): TileModel {
  const variant = {
    rotation: 0,
    mirror: "none",
    occupied: [],
    floor: [],
    passage: [],
    voidCells: [],
    vertical: [],
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    faces: {},
  } as TileVariant;
  return {
    id,
    filename: `${id}.obj`,
    slotId: id,
    anchor: [0, 0, 0],
    bboxMin: [0, 0, 0],
    bboxMax: [16, 16, 14],
    center: [8, 8, 7],
    minZ: 0,
    maxZ: 14,
    vertexCount: 8,
    faceCount: 12,
    occupiedVolume: 0,
    horizontalArea: 0,
    verticalArea: 0,
    openBoundary: 0,
    projection: 0,
    recess: 0,
    cellFeet: 2,
    variants: [variant],
  };
}

describe("Open Volume cache version", () => {
  it("rejects a stored Open Volume result unless its version is exactly v4.3.1 and keeps the other descriptors", () => {
    const form = model("cache-hall");
    const source = hall();
    const key = v4CacheKeyFor(form, source);
    assert.match(key, new RegExp(`^${DESCRIPTOR_ALGORITHM_VERSION}:${OPEN_VOLUME_ALGORITHM_VERSION}:`));

    const first = evaluateTileModel(form, source);
    const open = first.descriptors.find((descriptor) => descriptor.id === "openVolume")!;
    const sculptural = first.descriptors.find((descriptor) => descriptor.id === "sculptural")!;
    assert.equal(open.version, OPEN_VOLUME_ALGORITHM_VERSION);
    assert.equal(open.evidence?.version, OPEN_VOLUME_ALGORITHM_VERSION);
    assert.equal(sculptural.version, DESCRIPTOR_ALGORITHM_VERSION);
    const scored = evaluateOpenVolumeDescriptor(source, form.id);
    assert.equal(open.absoluteScore, scored.absoluteScore);

    const cache = readV4Cache();
    const stored = cache.get(key)!;
    const storedOpen = stored.descriptors.find((descriptor) => descriptor.id === "openVolume")!;
    const storedSculptural = stored.descriptors.find((descriptor) => descriptor.id === "sculptural")!;
    storedOpen.version = "v4.3.0";
    storedOpen.evidence!.version = "v4.3.0";
    storedOpen.absoluteScore = -1;
    storedOpen.evidence!.layers = [];
    storedSculptural.absoluteScore = 81.25;
    const legacy = key.replace(`:${OPEN_VOLUME_ALGORITHM_VERSION}:`, ":");
    cache.delete(key);
    cache.set(legacy, stored);

    const fromLegacy = evaluateTileModel(form, source);
    const legacyOpen = fromLegacy.descriptors.find((descriptor) => descriptor.id === "openVolume")!;
    const legacySculptural = fromLegacy.descriptors.find((descriptor) => descriptor.id === "sculptural")!;
    assert.equal(legacyOpen.version, OPEN_VOLUME_ALGORITHM_VERSION);
    assert.equal(legacyOpen.evidence?.version, OPEN_VOLUME_ALGORITHM_VERSION);
    assert.equal(legacyOpen.absoluteScore, scored.absoluteScore);
    assert.ok((legacyOpen.evidence?.layers ?? []).some((layer) => layer.id === "ov-field"));
    assert.equal(legacySculptural.absoluteScore, 81.25);
    assert.equal(legacySculptural.version, DESCRIPTOR_ALGORITHM_VERSION);
    assert.equal(cache.has(key), true);

    for (const cacheKey of [...cache.keys()]) {
      if (cacheKey.includes(form.id)) cache.delete(cacheKey);
    }
    const retained = fromLegacy.descriptors.map((descriptor) => ({
      ...descriptor,
      version: descriptor.id === "openVolume" ? "v4.3.0" as const : descriptor.version,
      absoluteScore: descriptor.id === "openVolume" ? -1 : descriptor.id === "sculptural" ? 64.5 : descriptor.absoluteScore,
      evidence: descriptor.evidence
        ? { ...descriptor.evidence, version: descriptor.id === "openVolume" ? "v4.3.0" : descriptor.evidence.version, layers: [] }
        : undefined,
    }));
    const fromRetained = evaluateTileModel(form, source, { retainedDescriptors: retained });
    const retainedOpen = fromRetained.descriptors.find((descriptor) => descriptor.id === "openVolume")!;
    const retainedSculptural = fromRetained.descriptors.find((descriptor) => descriptor.id === "sculptural")!;
    assert.equal(retainedOpen.version, OPEN_VOLUME_ALGORITHM_VERSION);
    assert.equal(retainedOpen.evidence?.version, OPEN_VOLUME_ALGORITHM_VERSION);
    assert.equal(retainedOpen.absoluteScore, scored.absoluteScore);
    assert.ok((retainedOpen.evidence?.layers ?? []).some((layer) => layer.id === "ov-field"));
    assert.equal(retainedSculptural.absoluteScore, 64.5);

    const again = evaluateTileModel(form, source);
    assert.equal(again.descriptors.find((descriptor) => descriptor.id === "sculptural")!.absoluteScore, 64.5);
    assert.equal(again.descriptors.find((descriptor) => descriptor.id === "openVolume")!.version, OPEN_VOLUME_ALGORITHM_VERSION);
  });
});
