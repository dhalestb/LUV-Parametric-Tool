import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import * as THREE from "three";
import {
  matchedFrame,
  markerEdgeFeet,
  orthographicHalf,
  pointKeptByClip,
  presetCamera,
  registeredDisplayNormal,
  registeredDisplayPoint,
  viewUsesClip,
  worldClippingPlane,
  ANALYSIS_MARKER_SCALE,
} from "../src/components/evaluations/analysisViewer.ts";
import { spatialCategoriesForDescriptor } from "../src/components/evaluations/descriptorEvidence.ts";
import { specFeetToFile } from "../src/components/evaluations/geometryView.ts";
import { planeFromOrientation, rotatePlane, sectionTriangles, translatePlane } from "../src/components/evaluations/meshSection.ts";
import { openVolumeRegions } from "../src/components/evaluations/openVolume.ts";
import { buildCompleteFileGeometry, combinedBoundsSpec, IDENTITY_PLACEMENT, tileRootMatrix, triangleCount } from "../src/components/lattice/objFidelity.ts";
import { parseObj } from "../src/components/lattice/parseObj.ts";

const failures = [];
function check(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failures.push(name);
    process.stdout.write(`FAIL ${name}: ${error instanceof Error ? error.message : error}\n`);
  }
}

check("matched framing uses the larger form for both panels", () => {
  const frame = matchedFrame([[20, 20, 10], [20, 20, 20]]);
  assert.equal(frame.fit, Math.max(60, 20 * 0.85));
  assert.equal(frame.aimY, 10);
  const again = matchedFrame([[20, 20, 10], [20, 20, 20]]);
  assert.equal(again.fit, frame.fit);
  assert.equal(again.aimY, frame.aimY);
});

check("orthographic frames keep the longer side inside both panels", () => {
  const span = 20;
  const wide = orthographicHalf(span, 1.4);
  const narrow = orthographicHalf(span, 0.5);
  assert.ok(wide * 2 > span * 1.5);
  assert.ok(narrow * 0.5 * 2 > span);
  assert.equal(wide, orthographicHalf(span, 1.4));
});

check("a rotated cut keeps the camera on the discarded side of the same plane", () => {
  const anchor = [0, 0, 0];
  const rotated = rotatePlane(planeFromOrientation("section-y", [0, 0, 0]), 35);
  const camera = presetCamera("section-y", 40, 8, rotated.normal);
  const direction = [
    camera.position[0] - camera.target[0],
    camera.position[1] - camera.target[1],
    camera.position[2] - camera.target[2],
  ];
  const expected = registeredDisplayNormal(rotated.normal);
  const directionLength = Math.hypot(...direction) || 1;
  const alignment = (direction[0] * expected[0] + direction[1] * expected[1] + direction[2] * expected[2]) / directionLength;
  assert.ok(alignment > 0.999);
  assert.equal(pointKeptByClip([0, 0, 0], rotated, anchor, "section-y"), true);
  const clip = worldClippingPlane(rotated, anchor, "section-y");
  const origin = [0, 0, 0];
  const distance = clip.normal[0] * origin[0] + clip.normal[1] * origin[1] + clip.normal[2] * origin[2] + clip.constant;
  assert.ok(Math.abs(distance) < 1e-6);
});

check("section and plan cameras are orthographic and isometric is the lattice offset", () => {
  const iso = presetCamera("isometric", 60, 10);
  assert.equal(iso.projection, "perspective");
  assert.deepEqual(iso.position, [60 * 0.72, 10 + 60 * 0.55, 60 * 0.72]);
  assert.equal(presetCamera("section-y", 60, 10).projection, "orthographic");
  assert.equal(presetCamera("plan", 60, 10).projection, "orthographic");
  assert.deepEqual(presetCamera("plan", 60, 10).up, [0, 0, -1]);
  assert.equal(presetCamera("elevation", 60, 10).projection, "orthographic");
  assert.equal(viewUsesClip("elevation"), false);
  assert.equal(viewUsesClip("section-x"), true);
});

check("clipping keeps the far side of a Y cut and does not alter the source point", () => {
  const anchor = [0, 0, 0];
  const plane = planeFromOrientation("section-y", [0, 0, 0]);
  const kept = [0, -5, 0];
  const discarded = [0, 5, 0];
  const copy = JSON.stringify(discarded);
  assert.equal(pointKeptByClip(kept, plane, anchor, "section-y"), true);
  assert.equal(pointKeptByClip(discarded, plane, anchor, "section-y"), false);
  assert.equal(pointKeptByClip(discarded, plane, anchor, "isometric"), true);
  assert.equal(JSON.stringify(discarded), copy);
  const moved = translatePlane(plane, 6);
  assert.equal(pointKeptByClip(discarded, moved, anchor, "section-y"), true);
});

check("plan clipping removes geometry above the cutting height", () => {
  const plane = planeFromOrientation("plan", [0, 0, 4]);
  assert.equal(pointKeptByClip([0, 0, 2], plane, [0, 0, 0], "plan"), true);
  assert.equal(pointKeptByClip([0, 0, 8], plane, [0, 0, 0], "plan"), false);
});

check("a cell center survives one registration transform and lands on the clip plane", () => {
  const text = "v 0 0 0\nv 2 0 0\nv 0 4 0\nv 0 0 2\nf 1 2 3\nf 1 3 4\n";
  const mesh = parseObj(text, "clip-probe.obj");
  const before = mesh.positions.slice();
  const matrix = tileRootMatrix(mesh, IDENTITY_PLACEMENT(mesh.id), 1, "y", { register: true, applyUnitAndUp: true });
  const anchor = combinedBoundsSpec(mesh, 1, "y").anchor;
  const file = [2, 0, 0];
  const spec = [2, 0, 0];
  const expected = registeredDisplayPoint(spec, anchor);
  const transformed = new THREE.Vector3(...file).applyMatrix4(matrix);
  assert.ok(Math.abs(transformed.x - expected[0]) < 1e-6);
  assert.ok(Math.abs(transformed.y - expected[1]) < 1e-6);
  assert.ok(Math.abs(transformed.z - expected[2]) < 1e-6);
  const roundTrip = specFeetToFile(spec, "y", 1);
  const throughFile = new THREE.Vector3(...roundTrip).applyMatrix4(matrix);
  assert.ok(throughFile.distanceTo(transformed) < 1e-6);
  const plane = planeFromOrientation("section-y", combinedBoundsSpec(mesh, 1, "y").center);
  const clip = worldClippingPlane(plane, anchor, "section-y");
  const onPlane = registeredDisplayPoint(plane.origin, anchor);
  const distance = clip.normal[0] * onPlane[0] + clip.normal[1] * onPlane[1] + clip.normal[2] * onPlane[2] + clip.constant;
  assert.ok(Math.abs(distance) < 1e-6);
  const cut = sectionTriangles([
    { a: [0, 0, 0], b: [2, 0, 0], c: [0, 0, 2] },
  ], planeFromOrientation("plan", [0, 0, 1]));
  assert.equal(cut.pocheReliable, false);
  assert.equal(before.length, mesh.positions.length);
  for (let index = 0; index < before.length; index += 1) assert.equal(mesh.positions[index], before[index]);
});

check("marker scale is a drawing convention and does not change the cell", () => {
  assert.equal(ANALYSIS_MARKER_SCALE, 0.35);
  assert.equal(markerEdgeFeet(2), 0.7);
  assert.notEqual(markerEdgeFeet(2), 2);
});

check("other descriptors do not receive open-volume cells", () => {
  const occupied = [[0, 0, 0], [1, 0, 0]];
  const regions = openVolumeRegions(occupied);
  const monumental = spatialCategoriesForDescriptor({
    descriptorId: "monumental",
    descriptorName: "Monumental",
    occupied,
    free: regions.free,
    interstitial: regions.interstitial,
  });
  assert.equal(monumental.length, 1);
  assert.equal(monumental[0].available, false);
  assert.equal(monumental[0].cells.length, 0);
  assert.match(monumental[0].legend, /Spatial evidence unavailable/);
  const open = spatialCategoriesForDescriptor({
    descriptorId: "openVolume",
    descriptorName: "Open Volume",
    occupied,
    free: regions.free,
    interstitial: regions.interstitial,
  });
  const interstitial = open.find((item) => item.id === "interstitial");
  const permeability = open.find((item) => item.id === "permeability");
  assert.deepEqual(interstitial.cells, regions.interstitial);
  assert.equal(permeability.available, false);
  assert.equal(permeability.cells.length, 0);
  assert.equal(open.find((item) => item.id === "occupied").cells.length, occupied.length);
});

function externalDir() {
  const flag = process.argv.find((arg) => arg.startsWith("--source="));
  return (flag ? flag.slice("--source=".length) : "") || process.env.LUV_ARCHITECTURAL_OBJS || "";
}

const source = externalDir();
if (!source) {
  process.stdout.write("SKIP original OBJ files. Pass --source=<directory>.\n");
} else {
  const inventory = JSON.parse(readFileSync(new URL("../reports/authoritative-objs/mesh-inventory.json", import.meta.url), "utf8"));
  const files = readdirSync(source).filter((name) => name.toLowerCase().endsWith(".obj"));
  check("the external directory still has the 15 original meshes", () => {
    assert.equal(files.length, 15);
  });
  let slowest = { filename: "", ms: 0 };
  for (const filename of files) {
    const bytes = readFileSync(join(source, filename));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const recorded = inventory.files.find((item) => item.filename === filename);
    const started = performance.now();
    const mesh = parseObj(bytes.toString("utf8"), filename);
    const geometry = buildCompleteFileGeometry(mesh);
    const indexCount = geometry.getIndex()?.count ?? 0;
    const bounds = combinedBoundsSpec(mesh, 1, "y");
    const elapsed = performance.now() - started;
    if (elapsed > slowest.ms) slowest = { filename, ms: elapsed };
    check(`${filename} matches the recorded mesh and is not rewritten`, () => {
      assert.ok(recorded, "missing inventory row");
      assert.equal(hash, recorded.sha256);
      assert.equal(mesh.positions.length / 3, recorded.vertices);
      assert.equal(triangleCount(mesh), recorded.triangles);
      assert.equal(indexCount / 3, recorded.triangles);
      assert.equal(mesh.upAxis, "y");
      const fileSize = recorded.fileBounds.size;
      const expected = [fileSize[0], fileSize[2], fileSize[1]];
      assert.ok(Math.abs(bounds.size[0] - expected[0]) < 1e-3);
      assert.ok(Math.abs(bounds.size[1] - expected[1]) < 1e-3);
      assert.ok(Math.abs(bounds.size[2] - expected[2]) < 1e-3);
    });
    geometry.dispose();
  }
  process.stdout.write(`OBJ prepare slowest ${slowest.filename} ${slowest.ms.toFixed(1)} ms\n`);
  for (const filename of ["Gathering Linear.obj", "Lobby Continuous Hall.obj"]) {
    const mesh = parseObj(readFileSync(join(source, filename), "utf8"), filename);
    const positions = mesh.positions.slice();
    const anchor = combinedBoundsSpec(mesh, 1, "y").anchor;
    const triangles = [];
    const toSpec = (index) => {
      const x = positions[index * 3];
      const y = positions[index * 3 + 1];
      const z = positions[index * 3 + 2];
      return [x, -z, y];
    };
    for (const face of mesh.faces) {
      for (let index = 1; index < face.vertices.length - 1; index += 1) {
        triangles.push({ a: toSpec(face.vertices[0]), b: toSpec(face.vertices[index]), c: toSpec(face.vertices[index + 1]) });
      }
    }
    const started = performance.now();
    const cut = sectionTriangles(triangles, planeFromOrientation("section-y", [
      (anchor[0]),
      (anchor[1]),
      anchor[2] + (combinedBoundsSpec(mesh, 1, "y").size[2] / 2),
    ]));
    const elapsed = performance.now() - started;
    check(`${filename} section Y keeps the source vertices`, () => {
      assert.ok(cut.segments.length > 0);
      assert.equal(positions.length, mesh.positions.length);
      for (let index = 0; index < positions.length; index += 1) assert.equal(positions[index], mesh.positions[index]);
    });
    process.stdout.write(`${filename} section-y segments ${cut.segments.length} poche ${cut.pocheReliable} in ${elapsed.toFixed(1)} ms\n`);
  }
}

if (failures.length) {
  process.stderr.write(`FAIL ${failures.length}\n`);
  process.exit(1);
}
process.stdout.write("analysis viewer checks passed\n");
