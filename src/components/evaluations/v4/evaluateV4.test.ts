import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESCRIPTOR_ALGORITHM_VERSION, LEGACY_DESCRIPTOR_ALGORITHM_VERSION } from "../descriptorVersion.ts";
import type { DescriptorSource } from "../objDescriptorAnalysis.ts";
import { PALETTE } from "./evidence.ts";
import { buildV4Context, evaluateV4 } from "./evaluateV4.ts";

/**
 * Synthetic fixtures in OBJ file coordinates: Y is up, 1 unit = 1 ft.
 * Each fixture is a known architectural situation whose v4 behaviour is predictable.
 */
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

  /** Horizontal plate at height `up` spanning x0..x1 and z0..z1 (file z = plan depth). */
  plate(up: number, x0: number, x1: number, z0: number, z1: number) {
    this.quad([x0, up, z0], [x1, up, z0], [x1, up, z1], [x0, up, z1]);
  }

  /** Vertical wall along x at plan depth z. */
  wallX(z: number, x0: number, x1: number, up0: number, up1: number) {
    this.quad([x0, up0, z], [x1, up0, z], [x1, up1, z], [x0, up1, z]);
  }

  /** Vertical wall along z at x. */
  wallZ(x: number, z0: number, z1: number, up0: number, up1: number) {
    this.quad([x, up0, z0], [x, up0, z1], [x, up1, z1], [x, up1, z0]);
  }

  source(): DescriptorSource {
    return { positions: Float32Array.from(this.positions), faces: this.faces, up: "y", unitScale: 1 };
  }
}

/** Open slab: 30 × 30 ft ground plate, nothing above it. */
function openSlab() {
  const m = new MeshBuilder();
  m.plate(0, 0, 30, 0, 30);
  return m.source();
}

/** Closed hall: ground plate, four full walls, roof at `height`. No openings. */
function closedHall(height: number, size = 30) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(height, 0, size, 0, size);
  m.wallX(0, 0, size, 0, height);
  m.wallX(size, 0, size, 0, height);
  m.wallZ(0, 0, size, 0, height);
  m.wallZ(size, 0, size, 0, height);
  return m.source();
}

/** Hall with one doorway: like closedHall but the +x wall stops 8 ft short on one end (8 ft opening). */
function hallWithDoor(height: number, size = 30) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(height, 0, size, 0, size);
  m.wallX(0, 0, size, 0, height);
  m.wallX(size, 0, size, 0, height);
  m.wallZ(0, 0, size, 0, height);
  m.wallZ(size, 8, size, 0, height); // opening between z = 0 and 8 on the +x side
  return m.source();
}

/** Two levels with a central void: ground, mezzanine ring at 12 ft with a 10 × 10 hole, roof at 24 ft, full walls. */
function atrium(size = 30, hole: [number, number] = [10, 20], roof = 24, mezz = 12) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(mezz, 0, size, 0, hole[0]);
  m.plate(mezz, 0, size, hole[1], size);
  m.plate(mezz, 0, hole[0], hole[0], hole[1]);
  m.plate(mezz, hole[1], size, hole[0], hole[1]);
  m.plate(roof, 0, size, 0, size);
  m.wallX(0, 0, size, 0, roof);
  m.wallX(size, 0, size, 0, roof);
  m.wallZ(0, 0, size, 0, roof);
  m.wallZ(size, 0, size, 0, roof);
  return m.source();
}

/** Two stacked closed floors with no void between them (solid mezzanine). */
function stacked(size = 30, roof = 24, mezz = 12) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(mezz, 0, size, 0, size);
  m.plate(roof, 0, size, 0, size);
  m.wallX(0, 0, size, 0, roof);
  m.wallX(size, 0, size, 0, roof);
  m.wallZ(0, 0, size, 0, roof);
  m.wallZ(size, 0, size, 0, roof);
  return m.source();
}

/** Two rooms sharing a wall. Sightlines across the wall must be blocked. */
function twoRooms(height = 12, size = 30) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(height, 0, size, 0, size);
  m.wallX(0, 0, size, 0, height);
  m.wallX(size, 0, size, 0, height);
  m.wallZ(0, 0, size, 0, height);
  m.wallZ(size, 0, size, 0, height);
  m.wallZ(size / 2, 0, size, 0, height);
  return m.source();
}

/** Two disconnected 12 × 12 slabs 20 ft apart. No connecting floor. */
function disconnectedPlates() {
  const m = new MeshBuilder();
  m.plate(0, 0, 12, 0, 12);
  m.plate(0, 32, 44, 0, 12);
  return m.source();
}

/** Closed hall with a 10 ft wide opening in one side wall (lateral light, not a doorway at the end). */
function hallWithSideOpening(height = 14, size = 30) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(height, 0, size, 0, size);
  m.wallX(0, 0, 10, 0, height);
  m.wallX(0, 20, size, 0, height);
  m.wallX(size, 0, size, 0, height);
  m.wallZ(0, 0, size, 0, height);
  m.wallZ(size, 0, size, 0, height);
  return m.source();
}

/** Closed hall with an uncovered terrace projecting beyond the footprint at 12 ft. Roof remains at 24 ft. */
function hallWithTerrace(size = 30, roof = 24, terrace = 12) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(roof, 0, size, 0, size);
  m.wallX(0, 0, size, 0, roof);
  m.wallX(size, 0, size, 0, roof);
  m.wallZ(0, 0, size, 0, roof);
  m.wallZ(size, 0, size, 0, roof);
  m.plate(terrace, size, size + 14, 8, 22);
  return m.source();
}

/** Ground, mezzanine ring, and an upper projecting terrace. Roof is a covering cap, not a floor. */
function threeLevelHall(size = 30, roof = 28, mezz = 10, terrace = 18) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(mezz, 0, size, 0, 8);
  m.plate(mezz, 0, size, 22, size);
  m.plate(mezz, 0, 8, 8, 22);
  m.plate(mezz, 22, size, 8, 22);
  m.plate(terrace, size, size + 14, 8, 22);
  m.plate(roof, 0, size, 0, size);
  m.wallX(0, 0, size, 0, roof);
  m.wallX(size, 0, size, 0, roof);
  m.wallZ(0, 0, size, 0, roof);
  m.wallZ(size, 0, size, 0, roof);
  return m.source();
}

/** Closed hall plus a 4 × 3 ft uncovered ledge. 12 ft² is a connection, not a second floor. */
function hallWithSmallLedge(size = 30, roof = 24, ledge = 12) {
  const m = new MeshBuilder();
  m.plate(0, 0, size, 0, size);
  m.plate(roof, 0, size, 0, size);
  m.wallX(0, 0, size, 0, roof);
  m.wallX(size, 0, size, 0, roof);
  m.wallZ(0, 0, size, 0, roof);
  m.wallZ(size, 0, size, 0, roof);
  m.plate(ledge, size, size + 4, 12, 15);
  return m.source();
}

function emptyMesh(): DescriptorSource {
  return { positions: new Float32Array(), faces: [], up: "y", unitScale: 1 };
}

function descriptor(evaluation: ReturnType<typeof evaluateV4>, id: string) {
  const found = evaluation.descriptors.find((item) => item.id === id);
  assert.ok(found, `descriptor ${id} missing`);
  return found;
}

function term(evaluation: ReturnType<typeof evaluateV4>, id: string, name: string) {
  const found = descriptor(evaluation, id).evidence.components.find((item) => item.name === name);
  assert.ok(found, `component ${name} missing on ${id}`);
  return found;
}

describe("v4 version constants", () => {
  it("publishes v4.1 and keeps v3.5 as the legacy constant", () => {
    assert.equal(DESCRIPTOR_ALGORITHM_VERSION, "v4.1");
    assert.equal(LEGACY_DESCRIPTOR_ALGORITHM_VERSION, "v3.5");
  });
});

describe("v4 shared geometry", () => {
  it("does not modify the source arrays", () => {
    const source = atrium();
    const before = Array.from(source.positions);
    const faceCount = source.faces.length;
    evaluateV4(source, "fixture-atrium");
    assert.deepEqual(Array.from(source.positions), before);
    assert.equal(source.faces.length, faceCount);
  });

  it("finds one level on an open slab and two in the atrium", () => {
    const slab = buildV4Context(openSlab(), "slab");
    assert.equal(slab.field.levels.length, 1);
    const hall = buildV4Context(atrium(), "atrium");
    assert.equal(hall.field.levels.length, 2);
    assert.ok(Math.abs(hall.field.levels[0].elevation - 0) < 0.01);
    assert.ok(Math.abs(hall.field.levels[1].elevation - 12) < 0.01);
    // Roof top samples are exposed and do not form a level.
    assert.ok(hall.field.levels.every((level) => level.elevation < 23));
  });

  it("keeps a closed hall as one level: the roof cap is not a storey", () => {
    const ctx = buildV4Context(closedHall(14), "closed-levels");
    assert.equal(ctx.field.levels.length, 1);
    assert.ok(Math.abs(ctx.field.levels[0].elevation - 0) < 0.01);
    assert.ok(ctx.field.roofLidArea >= 16);
  });

  it("counts an uncovered projecting terrace as a second level even without a stair", () => {
    const ctx = buildV4Context(hallWithTerrace(), "terrace");
    assert.equal(ctx.field.levels.length, 2);
    assert.ok(ctx.field.levels.some((level) => Math.abs(level.elevation - 12) < 0.6));
    assert.ok(ctx.field.branches.length >= 1, "expected a perimeter branch on the terrace");
    assert.ok(ctx.network.potentialInterfaces.length >= 1 || ctx.field.branches.some((branch) => branch.upper), "upper terrace is a potential connection, not a verified stair");
    assert.ok(ctx.network.levelLinks.every((link) => link.status !== "verified"), "no stair geometry exists; do not invent a verified route");
  });

  it("keeps a sub-16 ft² projecting ledge as a connection interface and not a floor", () => {
    const ctx = buildV4Context(hallWithSmallLedge(), "ledge");
    assert.equal(ctx.field.levels.length, 1, `levels ${ctx.field.levels.map((level) => level.elevation).join(", ")}`);
    const independent = ctx.field.branches.filter((branch) => branch.independent);
    assert.ok(independent.length >= 1, "expected an independent connection interface");
    assert.ok(independent.every((branch) => branch.area < 16 && branch.area >= 4));
    assert.ok(ctx.network.potentialInterfaces.some((entry) => entry.levelId < 0));
    assert.ok(ctx.network.levelLinks.every((link) => link.status !== "verified"));
  });

  it("recognizes three interior levels when an upper deck exists without an internal stair", () => {
    const ctx = buildV4Context(threeLevelHall(), "three");
    assert.equal(ctx.field.levels.length, 3, `expected 3 levels, got ${ctx.field.levels.map((level) => level.elevation).join(", ")}`);
    assert.ok(ctx.field.levels.every((level) => level.elevation < 27));
    assert.ok(ctx.network.levelLinks.every((link) => link.status !== "verified"));
  });

  it("classifies a closed hall floor as sheltered with the roof clearance", () => {
    const ctx = buildV4Context(closedHall(14), "hall14");
    const sheltered = ctx.field.samples.filter((sample) => sample.floorClass === "sheltered");
    assert.ok(sheltered.length > 800, `expected most of 900 samples sheltered, got ${sheltered.length}`);
    assert.ok(sheltered.every((sample) => sample.clearance !== null && Math.abs(sample.clearance - 14) < 0.01));
  });

  it("classifies the atrium hole as open void and the open slab as exposed", () => {
    const hall = buildV4Context(atrium(), "atrium");
    const voidSamples = hall.field.samples.filter((sample) => sample.floorClass === "openVoid");
    // Ground samples under the 10 × 10 hole see the roof 24 ft above: sheltered, not void.
    // Void columns are detected by analyzeVoids as free intervals passing the mezzanine level.
    assert.ok(hall.voids.components.length >= 1, "expected a void component");
    assert.ok(hall.voids.components[0].area >= 64, `void area ${hall.voids.components[0].area}`);
    assert.equal(voidSamples.length, 0);
    const slab = buildV4Context(openSlab(), "slab");
    assert.ok(slab.field.samples.every((sample) => sample.floorClass === "exposed"));
  });

  it("finds doorway entries only where the wall is open", () => {
    const closed = buildV4Context(closedHall(14), "closed");
    assert.equal(closed.network.entries.length, 0);
    const door = buildV4Context(hallWithDoor(14), "door");
    assert.ok(door.network.entries.length >= 1, "expected at least one entry cluster");
    // The opening is on the +x side of the file plan (x = 30); the outward direction must point along +x in spec plan.
    assert.ok(door.network.entries.every((entry) => entry.outward[0] > 0.9), JSON.stringify(door.network.entries.map((entry) => entry.outward)));
  });
});

describe("v4 descriptor behaviour on fixtures", () => {
  const slab = evaluateV4(openSlab(), "slab");
  const hall = evaluateV4(closedHall(14), "hall14");
  const tall = evaluateV4(closedHall(30), "hall30");
  const low = evaluateV4(closedHall(9), "hall9");
  const door = evaluateV4(hallWithDoor(14), "door");
  const atriumEval = evaluateV4(atrium(), "atrium");
  const stackedEval = evaluateV4(stacked(), "stacked");

  it("reports twelve descriptors with the v4 version and a source hash", () => {
    assert.equal(hall.version, "v4.1");
    assert.equal(hall.descriptors.length, 12);
    assert.match(hall.sourceHash, /^[0-9a-f]{8}$/);
    for (const item of hall.descriptors) assert.equal(item.evidence.version, "v4.1");
  });

  it("scores Open Volume high for a 14 ft clear hall and reports a bare slab as having no interior", () => {
    const hallOpen = descriptor(hall, "openVolume");
    assert.ok(hallOpen.available);
    assert.ok(hallOpen.absoluteScore > 70, `hall open volume ${hallOpen.absoluteScore}`);
    assert.ok(term(hall, "openVolume", "Sheltered Clearance Share").precise! > 95);
    const slabOpen = descriptor(slab, "openVolume");
    // Nothing is above the slab and nothing encloses it: interior volume is absent, scored 0, still ranked.
    assert.equal(slabOpen.available, true);
    assert.equal(slabOpen.absoluteScore, 0);
    // The low hall is a measured value, not an absence: 9 ft clearance earns partial credit.
    const lowOpen = descriptor(low, "openVolume");
    assert.ok(lowOpen.available);
    assert.ok(lowOpen.absoluteScore > 0 && lowOpen.absoluteScore < hallOpen.absoluteScore, `low ${lowOpen.absoluteScore} vs hall ${hallOpen.absoluteScore}`);
  });

  it("scores a missing characteristic as 0 and still ranks the form", () => {
    for (const id of hall.descriptors.map((item) => item.id)) {
      const item = descriptor(hall, id);
      assert.equal(item.available, true, `${id} should remain ranked`);
      assert.ok(Number.isFinite(item.absoluteScore), `${id} should be finite`);
    }
    assert.equal(descriptor(hall, "verticallyIntegrated").absoluteScore, 0);
    assert.ok(Number.isFinite(descriptor(hall, "hierarchical").absoluteScore));
    assert.ok(Number.isFinite(descriptor(hall, "convergent").absoluteScore));
    assert.ok(Number.isFinite(descriptor(hall, "sequential").absoluteScore));
  });

  it("scores Convergent and Sequential once a doorway exists", () => {
    assert.ok(descriptor(door, "sequential").available, descriptor(door, "sequential").unavailableReason);
    assert.ok(Number.isFinite(descriptor(door, "sequential").absoluteScore));
    const convergent = descriptor(door, "convergent");
    assert.ok(convergent.available);
    assert.ok(Number.isFinite(convergent.absoluteScore));
  });

  it("gives a closed box measured-zero light, not unavailable", () => {
    const luminous = descriptor(hall, "luminous");
    assert.ok(luminous.available);
    assert.ok(luminous.absoluteScore < 8, `sealed hall edge leak ${luminous.absoluteScore}`);
    assert.equal(luminous.evidence.validity, "potential-relationship");
  });

  it("gives the roofless slab measured-zero interior light rather than inflating overhead exposure", () => {
    const luminous = descriptor(slab, "luminous");
    assert.equal(luminous.available, true);
    assert.equal(luminous.absoluteScore, 0);
  });

  it("ranks Monumental by height: tall hall above low hall", () => {
    const tallScore = descriptor(tall, "monumental").absoluteScore;
    const lowScore = descriptor(low, "monumental").absoluteScore;
    assert.ok(tallScore > lowScore, `tall ${tallScore} low ${lowScore}`);
    const height = term(tall, "monumental", "Height");
    assert.equal(height.units, "ft");
    assert.ok(Math.abs((height.raw as number) - 30) < 0.01);
  });

  it("measures two levels in the atrium and makes Hierarchical available", () => {
    const hierarchical = descriptor(atriumEval, "hierarchical");
    assert.ok(hierarchical.available, hierarchical.unavailableReason);
    const levels = atriumEval.summary.levels;
    assert.equal(levels, 2);
  });

  it("credits the atrium void in Vertically Integrated and not the solid stack", () => {
    const atriumVi = descriptor(atriumEval, "verticallyIntegrated");
    const stackedVi = descriptor(stackedEval, "verticallyIntegrated");
    assert.ok(atriumVi.available, atriumVi.unavailableReason);
    assert.ok(stackedVi.available, stackedVi.unavailableReason);
    const atriumVoid = term(atriumEval, "verticallyIntegrated", "Vertical Void Continuity");
    const stackedVoid = term(stackedEval, "verticallyIntegrated", "Vertical Void Continuity");
    assert.ok(atriumVoid.precise! > 0, `atrium void ${atriumVoid.precise}`);
    assert.equal(stackedVoid.precise, 0);
    assert.ok(atriumVi.absoluteScore > stackedVi.absoluteScore);
    // Both stacks have no stair geometry: the level link is potential or disconnected, never verified.
    const circulation = term(atriumEval, "verticallyIntegrated", "Vertical Circulation");
    assert.ok(circulation.precise! <= 50, `vertical circulation ${circulation.precise}`);
  });

  it("is deterministic and reconstructs every published score from its components", () => {
    const again = evaluateV4(atrium(), "atrium");
    for (const item of atriumEval.descriptors) {
      const repeat = descriptor(again, item.id);
      assert.ok(Object.is(item.absoluteScore, repeat.absoluteScore), `${item.id} differs between runs`);
      const measured = item.evidence.components.filter((component) => component.status === "measured");
      const weight = measured.reduce((sum, component) => sum + component.weight, 0);
      if (!item.available) {
        assert.ok(Number.isNaN(item.absoluteScore));
        continue;
      }
      if (!weight) {
        assert.equal(item.absoluteScore, 0);
        continue;
      }
      const reconstructed = measured.reduce((sum, component) => sum + (component.precise as number) * component.weight, 0) / weight;
      assert.ok(Math.abs(reconstructed - item.absoluteScore) < 1e-9, `${item.id} reconstruct ${reconstructed} vs ${item.absoluteScore}`);
      assert.ok(item.absoluteScore >= 0 && item.absoluteScore <= 100);
    }
  });

  it("documents every component and keeps unavailable terms out of the score", () => {
    for (const evaluation of [slab, hall, door, atriumEval]) {
      for (const item of evaluation.descriptors) {
        for (const component of item.evidence.components) {
          assert.ok(component.intent && component.formula && component.units && component.normalization, `${item.id} ${component.name} undocumented`);
          assert.ok(component.weight > 0);
          if (component.status === "unavailable") {
            assert.equal(component.precise, null);
            assert.ok(component.reason, `${item.id} ${component.name} unavailable without a reason`);
          } else {
            assert.ok(Number.isFinite(component.precise));
          }
        }
      }
    }
  });

  it("draws only palette colours and gives every measured component a drawn layer", () => {
    const palette = new Set(Object.values(PALETTE));
    for (const evaluation of [slab, hall, door, atriumEval, stackedEval]) {
      for (const item of evaluation.descriptors) {
        const drawn = new Set(item.evidence.layers.map((layer) => layer.id));
        for (const layer of item.evidence.layers) {
          assert.ok(palette.has(layer.color), `${item.id} layer ${layer.id} colour ${layer.color} not in palette`);
          assert.ok(layer.label.length > 0);
          assert.ok(layer.total >= layer.shown, `${item.id} layer ${layer.id} shown ${layer.shown} > total ${layer.total}`);
          assert.ok(layer.shown > 0 || (layer.dimensions?.length ?? 0) > 0, `${item.id} layer ${layer.id} is empty but listed`);
        }
        if (item.available && item.absoluteScore > 0) {
          assert.ok(item.evidence.layers.length > 0, `${item.id} available but drew nothing`);
          for (const component of item.evidence.components) {
            if (component.status !== "measured" || component.raw === 0) continue;
            assert.ok(component.layerIds.some((id) => drawn.has(id)), `${item.id} ${component.name} measured ${component.raw} but no layer drawn`);
          }
        }
      }
    }
  });

  it("blocks same-level sightlines through a closed partition", () => {
    const rooms = evaluateV4(twoRooms(), "rooms");
    const visual = descriptor(rooms, "visuallyConnected");
    assert.ok(visual.available);
    const coverage = term(rooms, "visuallyConnected", "Same-Level Coverage");
    assert.ok((coverage.raw as number) < 0.85, `partitioned hall coverage ${coverage.raw}`);
    const open = descriptor(hall, "visuallyConnected");
    const openCoverage = term(hall, "visuallyConnected", "Same-Level Coverage");
    assert.ok((openCoverage.precise as number) > (coverage.precise as number), "an undivided hall must outrank a partitioned hall on same-level coverage");
    const blockedLayer = visual.evidence.layers.find((layer) => layer.id === "vc-blocked");
    assert.ok(blockedLayer && blockedLayer.total > 0, "blocked rays must be recorded");
  });

  it("does not invent circulation between disconnected plates", () => {
    const plates = evaluateV4(disconnectedPlates(), "plates");
    const circulation = descriptor(plates, "circulationActivated");
    assert.ok(circulation.available, circulation.unavailableReason);
    const continuity = term(plates, "circulationActivated", "Network Continuity");
    assert.ok((continuity.raw as number) < 1, `disconnected plates must not form one system, continuity ${continuity.raw}`);
    const disconnectedLayer = circulation.evidence.layers.find((layer) => layer.id === "ca-disconnected");
    assert.ok(disconnectedLayer && disconnectedLayer.total > 0, "the smaller plate must appear as disconnected floor");
  });

  it("credits lateral openings and not a sealed box", () => {
    const side = evaluateV4(hallWithSideOpening(), "side");
    const sealed = term(hall, "luminous", "Lateral Light Exposure");
    const opened = term(side, "luminous", "Lateral Light Exposure");
    assert.ok(descriptor(side, "luminous").available);
    assert.ok((opened.precise as number) > (sealed.precise as number), `side ${opened.precise} sealed ${sealed.precise}`);
  });

  it("uses the configured eye height for sightlines", () => {
    const ctxDefault = buildV4Context(hallWithDoor(14), "eye-default");
    const ctxTall = buildV4Context(hallWithDoor(14), "eye-tall", { eyeHeightFeet: 6.5 });
    assert.equal(ctxDefault.eyeHeight, 5.5);
    assert.equal(ctxTall.eyeHeight, 6.5);
    assert.ok(ctxDefault.sameLevel.rays.length > 0);
    assert.ok(ctxDefault.sameLevel.rays.every((ray) => Math.abs(ray.a[2] - 5.5) < 0.01));
    assert.ok(ctxTall.sameLevel.rays.every((ray) => Math.abs(ray.a[2] - 6.5) < 0.01));
  });

  it("reports a geometry-processing failure, not a measured zero, for an empty mesh", () => {
    const empty = evaluateV4(emptyMesh(), "empty");
    assert.equal(empty.descriptors.length, 12);
    for (const item of empty.descriptors) {
      assert.equal(item.available, false, item.id);
      assert.ok(Number.isNaN(item.absoluteScore), item.id);
      assert.match(item.unavailableReason ?? "", /no triangles/i);
    }
  });
});
