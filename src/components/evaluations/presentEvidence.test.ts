import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRAPHIC } from "./graphicStyle.ts";
import { presentLayers, presentationEmptyNote } from "./presentEvidence.ts";
import { PALETTE, type EvidenceLayer } from "./v4/evidence.ts";

function layer(partial: Partial<EvidenceLayer> & Pick<EvidenceLayer, "id" | "kind">): EvidenceLayer {
  return {
    label: partial.label ?? partial.id,
    color: partial.color ?? PALETTE.gold,
    status: partial.status ?? "measured",
    components: partial.components ?? [],
    lineStyle: partial.lineStyle ?? "solid",
    shown: partial.shown ?? 1,
    total: partial.total ?? 1,
    ...partial,
  };
}

describe("presentLayers", () => {
  it("does not mutate source layers and restyles from the shared graphic roles", () => {
    const source = layer({
      id: "ov-qualifying",
      kind: "patch",
      label: "Qualifying sheltered clearance > 5 ft (measured)",
      color: PALETTE.gold,
      components: ["Sheltered Clearance Share"],
      opacity: 0.55,
    });
    const presented = presentLayers([source], "openVolume");
    assert.equal(source.color, PALETTE.gold);
    assert.equal(source.label.includes("Qualifying"), true);
    assert.equal(presented.length, 1);
    assert.equal(presented[0].color, GRAPHIC.colors.surface);
    assert.equal(presented[0].label, "Sheltered clearance.");
  });

  it("hides Open Volume diagnostics and keeps only sheltered clearance", () => {
    const layers = [
      layer({ id: "ov-qualifying", kind: "patch", total: 4 }),
      layer({ id: "ov-void", kind: "patch", total: 2 }),
      layer({ id: "ov-exposed", kind: "patch", status: "excluded", total: 3 }),
    ];
    const presented = presentLayers(layers, "openVolume");
    assert.deepEqual(presented.map((item) => item.id), ["ov-qualifying"]);
  });

  it("shows Convergent routes in yellow and entries/destination as dots", () => {
    const layers = [
      layer({ id: "cv-routes", kind: "polyline", status: "verified", color: PALETTE.cyan, polylines: [[[0, 0, 0], [4, 0, 0]]] }),
      layer({ id: "cv-entries", kind: "point", points: [[0, 0, 0]] }),
      layer({ id: "cv-destination", kind: "point", points: [[4, 0, 0]] }),
      layer({ id: "cv-unsupported", kind: "segment", status: "excluded", segments: [{ a: [0, 0, 0], b: [1, 0, 0] }] }),
      layer({ id: "cv-potential", kind: "point", status: "potential", points: [[2, 2, 2]] }),
    ];
    const presented = presentLayers(layers, "convergent");
    assert.deepEqual(presented.map((item) => item.id), ["cv-routes", "cv-entries", "cv-destination"]);
    assert.equal(presented[0].color, GRAPHIC.colors.connection);
    assert.equal(presented[1].pointShape, "circle");
    assert.equal(presented[1].color, GRAPHIC.colors.entry);
    assert.equal(presented[2].pointShape, "circle");
    assert.ok((presented[2].pointScale ?? 1) > (presented[1].pointScale ?? 1));
  });

  it("keeps a focused component even when it is hidden in the default pair drawing", () => {
    const layers = [
      layer({ id: "ov-qualifying", kind: "patch", components: ["Sheltered Clearance Share"] }),
      layer({ id: "ov-void", kind: "patch", components: ["Open Void Share"] }),
    ];
    const presented = presentLayers(layers, "openVolume", { componentFocus: "Open Void Share" });
    assert.deepEqual(presented.map((item) => item.id), ["ov-void"]);
    assert.equal(presented[0].color, GRAPHIC.colors.surface);
  });

  it("returns a short empty-state note when nothing qualifies", () => {
    assert.equal(presentationEmptyNote("openVolume", []), "No qualifying sheltered clearance.");
    assert.equal(presentationEmptyNote("openVolume", [layer({ id: "ov-qualifying", kind: "patch", total: 2 })]), null);
    assert.equal(presentationEmptyNote("sequential", []), "No verified upward route from the main entry.");
  });

  it("shows Sculptural folds, orientation surfaces, and sectional bars", () => {
    const layers = [
      layer({ id: "sc-folds", kind: "segment", segments: [{ a: [0, 0, 0], b: [1, 0, 1] }] }),
      layer({
        id: "sc-orientation",
        kind: "patch",
        total: 2,
        hideInternalEdges: true,
        triangles: Float32Array.from([
          0, 0, 0, 2, 0, 0, 2, 2, 0,
          0, 0, 0, 2, 2, 0, 0, 2, 0,
        ]),
      }),
      layer({
        id: "sc-bands",
        kind: "segment",
        segments: [{ a: [0, 0, 2], b: [10, 0, 2] }],
        dimensions: [{ a: [0, 0, 2], b: [10, 0, 2], text: "40 ft²" }],
      }),
      layer({ id: "sc-mirror", kind: "point", points: [[1, 1, 1]] }),
    ];
    const presented = presentLayers(layers, "sculptural");
    assert.deepEqual(presented.map((item) => item.id), ["sc-folds", "sc-orientation", "sc-bands"]);
    assert.equal(presented[0].color, GRAPHIC.colors.surface);
    assert.equal(presented[0].label, "Measured folds");
    assert.equal(presented[1].label, "Surface orientation variety");
    assert.equal(presented[1].hideInternalEdges, false);
    assert.equal(presented[1].segments, undefined);
    assert.equal(presented[2].label, "Sectional variation");
    assert.equal(presented[2].color, GRAPHIC.colors.connection);
  });

  it("keeps every analysis face until merge is requested", () => {
    const source = layer({
      id: "su-nonaxis",
      kind: "patch",
      total: 2,
      hideInternalEdges: true,
      triangles: Float32Array.from([
        0, 0, 0, 2, 0, 0, 2, 2, 0,
        0, 0, 0, 2, 2, 0, 0, 2, 0,
      ]),
      segments: [{ a: [0, 0, 0], b: [2, 0, 0] }],
    });
    const presented = presentLayers([source], "surreal");
    assert.equal(presented[0].hideInternalEdges, false);
    assert.equal(presented[0].segments, undefined);
  });

  it("merges adjacent faces into cluster outlines on any descriptor when asked", () => {
    const triangles = Float32Array.from([
      0, 0, 0, 2, 0, 0, 2, 2, 0,
      0, 0, 0, 2, 2, 0, 0, 2, 0,
    ]);
    const surreal = presentLayers([layer({ id: "su-nonaxis", kind: "patch", total: 2, triangles })], "surreal", { mergeFaces: true });
    const sculptural = presentLayers([layer({ id: "sc-orientation", kind: "patch", total: 2, triangles })], "sculptural", { mergeFaces: true });
    assert.equal(surreal[0].hideInternalEdges, true);
    assert.equal(surreal[0].segments?.length, 4);
    assert.equal(sculptural[0].hideInternalEdges, true);
    assert.equal(sculptural[0].segments?.length, 4);
  });

  it("draws luminous laterals from the floor edge at probe height by default", () => {
    const presented = presentLayers([
      layer({
        id: "lu-lit",
        kind: "patch",
        triangles: Float32Array.from([
          0, 0, 0, 20, 0, 0, 20, 20, 0,
          0, 0, 0, 20, 20, 0, 0, 20, 0,
        ]),
      }),
      layer({
        id: "lu-lateral",
        kind: "arrow",
        arrows: [{ a: [16, 10, 4], b: [10, 10, 4] }],
      }),
      layer({
        id: "lu-overhead",
        kind: "arrow",
        arrows: [{ a: [10, 10, 10], b: [10, 10, 4] }],
      }),
      layer({
        id: "lu-blocked",
        kind: "segment",
        components: ["Overhead Light Exposure", "Lateral Light Exposure"],
        segments: [{ a: [10, 10, 4], b: [12, 10, 4] }],
      }),
    ], "luminous");
    assert.deepEqual(presented.map((item) => item.id), ["lu-lit", "lu-lateral", "lu-overhead"]);
    const lateral = presented.find((item) => item.id === "lu-lateral");
    const overhead = presented.find((item) => item.id === "lu-overhead");
    assert.ok(lateral?.arrows?.[0]);
    assert.deepEqual(lateral.arrows[0].b, [10, 10, 4]);
    assert.ok(lateral.arrows[0].a[0] > 20, `outer end should sit past the floor edge, got ${lateral.arrows[0].a[0]}`);
    assert.equal(lateral.arrows[0].a[2], 4);
    assert.deepEqual(overhead?.arrows?.[0], { a: [10, 10, 10], b: [10, 10, 4] });
  });

  it("seats lateral and overhead arrows on each local plate when asked", () => {
    const layers = [
      layer({
        id: "lu-lit",
        kind: "patch",
        triangles: Float32Array.from([
          0, 0, 0, 20, 0, 0, 20, 20, 0,
          0, 0, 0, 20, 20, 0, 0, 20, 0,
        ]),
      }),
      layer({
        id: "lu-lateral",
        kind: "arrow",
        arrows: [{ a: [16, 10, 4], b: [10, 10, 4] }],
      }),
      layer({
        id: "lu-overhead",
        kind: "arrow",
        arrows: [{ a: [10, 10, 10], b: [10, 10, 4] }],
      }),
    ];
    const presented = presentLayers(layers, "luminous", { seatOnPlate: true });
    const lateral = presented.find((item) => item.id === "lu-lateral");
    const overhead = presented.find((item) => item.id === "lu-overhead");
    assert.ok(lateral?.arrows?.[0]);
    assert.ok(Math.abs(lateral.arrows[0].b[2] - 0.25) < 1e-6);
    assert.ok(Math.abs(lateral.arrows[0].a[2] - 0.25) < 1e-6);
    assert.ok(overhead?.arrows?.[0]);
    assert.ok(Math.abs(overhead.arrows[0].b[2] - 0.25) < 1e-6);
    assert.ok(overhead.arrows[0].a[2] > overhead.arrows[0].b[2]);
  });

  it("seats lower-level luminous arrows on their own plate, not only the top", () => {
    const presented = presentLayers([
      layer({
        id: "lu-lit",
        kind: "patch",
        triangles: Float32Array.from([
          0, 0, 0, 4, 0, 0, 4, 4, 0,
          0, 0, 20, 4, 0, 20, 4, 4, 20,
        ]),
      }),
      layer({
        id: "lu-lateral",
        kind: "arrow",
        arrows: [
          { a: [6, 2, 4], b: [2, 2, 4] },
          { a: [6, 2, 24], b: [2, 2, 24] },
        ],
      }),
    ], "luminous", { seatOnPlate: true });
    const arrows = presented.find((item) => item.id === "lu-lateral")?.arrows ?? [];
    assert.ok(Math.abs(arrows[0].b[2] - 0.25) < 1e-6);
    assert.ok(Math.abs(arrows[0].a[2] - 0.25) < 1e-6);
    assert.ok(Math.abs(arrows[1].b[2] - 20.25) < 1e-6);
    assert.ok(Math.abs(arrows[1].a[2] - 20.25) < 1e-6);
  });

  it("drops luminous arrows by the probe offset even without a recorded plate", () => {
    const presented = presentLayers([
      layer({
        id: "lu-overhead",
        kind: "arrow",
        arrows: [{ a: [0, 0, 10], b: [0, 0, 4] }],
      }),
      layer({
        id: "lu-lateral",
        kind: "arrow",
        arrows: [{ a: [6, 0, 4], b: [0, 0, 4] }],
      }),
    ], "luminous", { seatOnPlate: true });
    const overhead = presented.find((item) => item.id === "lu-overhead")?.arrows?.[0];
    const lateral = presented.find((item) => item.id === "lu-lateral")?.arrows?.[0];
    assert.ok(overhead);
    assert.ok(Math.abs(overhead.b[2] - 0.25) < 1e-6);
    assert.ok(Math.abs(overhead.a[2] - 6.25) < 1e-6);
    assert.ok(lateral);
    assert.ok(Math.abs(lateral.b[2] - 0.25) < 1e-6);
  });

  it("shows blocked light rays for the two light components when asked", () => {
    const layers = [
      layer({ id: "lu-lit", kind: "patch", components: ["Lit Region Share"] }),
      layer({ id: "lu-overhead", kind: "arrow", components: ["Overhead Light Exposure"], arrows: [{ a: [0, 0, 6], b: [0, 0, 4] }] }),
      layer({ id: "lu-lateral", kind: "arrow", components: ["Lateral Light Exposure"], arrows: [{ a: [6, 0, 4], b: [0, 0, 4] }] }),
      layer({
        id: "lu-blocked",
        kind: "segment",
        components: ["Overhead Light Exposure", "Lateral Light Exposure"],
        segments: [{ a: [0, 0, 4], b: [2, 0, 4] }],
      }),
    ];
    const hidden = presentLayers(layers, "luminous", { componentFocus: "Lateral Light Exposure" });
    assert.deepEqual(hidden.map((item) => item.id), ["lu-lateral"]);
    const shown = presentLayers(layers, "luminous", { showBlocked: true });
    assert.ok(shown.some((item) => item.id === "lu-blocked"));
    assert.equal(shown.find((item) => item.id === "lu-blocked")?.label, "Blocked light rays");
    const focused = presentLayers(layers, "luminous", { componentFocus: "Overhead Light Exposure", showBlocked: true });
    assert.deepEqual(focused.map((item) => item.id), ["lu-overhead", "lu-blocked"]);
  });

  it("keeps Visually Connected sightlines at eye height by default", () => {
    const presented = presentLayers([
      layer({
        id: "vc-clear",
        kind: "segment",
        segments: [{ a: [0, 0, 5.5], b: [8, 0, 5.5] }],
      }),
      layer({
        id: "vc-origins",
        kind: "point",
        points: [[0, 0, 5.5], [8, 0, 5.5]],
      }),
    ], "visuallyConnected");
    assert.deepEqual(presented.map((item) => item.id), ["vc-clear", "vc-origins"]);
    assert.deepEqual(presented[0].arrows?.[0], { a: [0, 0, 5.5], b: [8, 0, 5.5] });
    assert.deepEqual(presented[1].points, [[0, 0, 5.5], [8, 0, 5.5]]);
  });

  it("seats Visually Connected sightlines and origins on each local plate when asked", () => {
    const presented = presentLayers([
      layer({
        id: "vc-clear",
        kind: "segment",
        segments: [
          { a: [0, 0, 5.5], b: [8, 0, 5.5] },
          { a: [0, 0, 25.5], b: [8, 0, 25.5] },
        ],
      }),
      layer({
        id: "vc-origins",
        kind: "point",
        points: [[0, 0, 5.5], [8, 0, 25.5]],
      }),
    ], "visuallyConnected", { seatOnPlate: true });
    const sight = presented.find((item) => item.id === "vc-clear")?.arrows ?? [];
    const origins = presented.find((item) => item.id === "vc-origins")?.points ?? [];
    assert.ok(Math.abs(sight[0].a[2] - 0.25) < 1e-6);
    assert.ok(Math.abs(sight[0].b[2] - 0.25) < 1e-6);
    assert.ok(Math.abs(sight[1].a[2] - 20.25) < 1e-6);
    assert.ok(Math.abs(sight[1].b[2] - 20.25) < 1e-6);
    assert.ok(Math.abs(origins[0][2] - 0.25) < 1e-6);
    assert.ok(Math.abs(origins[1][2] - 20.25) < 1e-6);
  });

  it("draws Centralized clear volume as #71BEDA", () => {
    const presented = presentLayers([
      layer({ id: "ce-inner", kind: "patch", total: 2 }),
      layer({ id: "ce-inner-clear", kind: "volume", total: 1, color: PALETTE.paleAqua }),
      layer({ id: "ce-center", kind: "arrow", arrows: [{ a: [0, 0, 0], b: [1, 0, 0] }] }),
    ], "centralized");
    assert.deepEqual(presented.map((item) => item.id), ["ce-inner", "ce-inner-clear", "ce-center"]);
    assert.equal(presented[1].color, "#71BEDA");
    assert.equal(presented[1].label, "Central clear volume");
  });

  it("clips Monumental clear volume columns to the massing height", () => {
    const presented = presentLayers([
      layer({ id: "mo-height", kind: "arrow", arrows: [{ a: [0, 0, 0], b: [0, 0, 10] }] }),
      layer({
        id: "mo-volume",
        kind: "volume",
        total: 1,
        triangles: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 20, 0, 0, 0, 1, 1, 20, 0, 1, 20]),
      }),
      layer({ id: "mo-level", kind: "patch", total: 1 }),
    ], "monumental");
    const zs = [...(presented.find((item) => item.id === "mo-volume")?.triangles ?? [])].filter((_, index) => index % 3 === 2);
    assert.ok(zs.length > 0);
    assert.ok(zs.every((z) => z <= 10 + 1e-6));
  });

  it("draws Monumental floor plane in light blue and clear volume in cyan", () => {
    const presented = presentLayers([
      layer({ id: "mo-volume", kind: "volume", total: 1, color: PALETTE.lightBlue }),
      layer({ id: "mo-level", kind: "patch", total: 1, color: PALETTE.gray }),
      layer({ id: "mo-height", kind: "arrow", arrows: [{ a: [0, 0, 0], b: [0, 0, 10] }] }),
    ], "monumental");
    assert.equal(presented.find((item) => item.id === "mo-volume")?.color, GRAPHIC.colors.surface);
    assert.equal(presented.find((item) => item.id === "mo-level")?.color, "#71BEDA");
  });

  it("shows Sequential ascent as one verified route with numbered stages", () => {
    const layers = [
      layer({ id: "sq-layers", kind: "patch", total: 4 }),
      layer({ id: "sq-order", kind: "arrow", arrows: [{ a: [0, 0, 0], b: [0, 0, 8] }] }),
      layer({ id: "sq-path", kind: "polyline", polylines: [[[0, 0, 0], [4, 0, 8]]] }),
      layer({ id: "sq-arrows", kind: "arrow", arrows: [{ a: [0, 0, 0], b: [4, 0, 8] }] }),
      layer({ id: "sq-stages", kind: "point", points: [[0, 0, 0], [4, 0, 8]], pointLabels: ["1 Entry", "2 Arrival"] }),
      layer({ id: "sq-metrics", kind: "segment", dimensions: [{ a: [0, 0, 0], b: [0, 0, 8], text: "8.0 ft" }] }),
    ];
    const presented = presentLayers(layers, "sequential");
    assert.deepEqual(presented.map((item) => item.id), ["sq-path", "sq-arrows", "sq-stages", "sq-metrics"]);
    assert.equal(presented[0].color, GRAPHIC.colors.connection);
    assert.equal(presented[2].color, GRAPHIC.colors.surface);
    assert.deepEqual(presented[2].pointLabels, ["1 Entry", "2 Arrival"]);
  });
});
