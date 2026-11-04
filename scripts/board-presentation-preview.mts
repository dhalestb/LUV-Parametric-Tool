import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_LAYOUT, STUDY_LAYOUT, comparisonBoardSvg, labelGlyphs, paintComparisonBoard, paintStudyBoard, placeSection, studyBoardSvg } from "../src/components/evaluations/comparisonBoard.ts";
import { cellCenter } from "../src/components/evaluations/descriptorEvidence.ts";
import { openVolumeRegions } from "../src/components/evaluations/openVolume.ts";
import {
  architecturalEdges,
  cellCutPolygon,
  cellMeetsPlane,
  comparisonScale,
  defaultSectionPlane,
  meshBounds,
  simplificationDeviation,
  translatePlane,
  planeFromOrientation,
  sectionTriangles,
  simplifySegments,
  visibleElevation,
} from "../src/components/evaluations/meshSection.ts";
import { fileToSpec, unpackCell } from "../src/components/lattice/types.ts";

/**
 * The 15 original architectural OBJ files stay outside this repository.
 * Pass --source=<directory> or set LUV_ARCHITECTURAL_OBJS.
 */
function externalObjDir() {
  const flag = process.argv.find((arg) => arg.startsWith("--source="));
  const configured = (flag ? flag.slice("--source=".length) : "") || process.env.LUV_ARCHITECTURAL_OBJS || "";
  if (!configured) {
    throw new Error("The 15 original architectural OBJ files are not in this repository. Pass --source=<directory> or set LUV_ARCHITECTURAL_OBJS.");
  }
  return configured;
}

const sourceDir = externalObjDir();
const project = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(project, "reports", "authoritative-objs", "presentation");
const leastName = "Gathering Linear.obj";
const mostName = "Lobby Continuous Hall.obj";
const expectedScore = {
  [leastName]: 37.50000000000001,
  [mostName]: 67.30000000000001,
};

mkdirSync(outDir, { recursive: true });

function sourceHashes() {
  const names = readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith(".obj")).sort();
  if (names.length !== 15) throw new Error(`Expected 15 original OBJ files, found ${names.length}`);
  return Object.fromEntries(names.map((name) => [
    name,
    createHash("sha256").update(readFileSync(join(sourceDir, name))).digest("hex"),
  ]));
}
const hashesBefore = sourceHashes();

const { analyzeMesh } = await import("../src/components/lattice/analyze.ts");
const { evaluateTileModel } = await import("../src/components/evaluations/objDescriptorAnalysis.ts");
const { parseObj } = await import("../src/components/lattice/parseObj.ts");

function trianglesOf(mesh) {
  const triangles = [];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertices.length - 1; index += 1) {
      const at = (vertex) => fileToSpec(
        mesh.positions[vertex * 3],
        mesh.positions[vertex * 3 + 1],
        mesh.positions[vertex * 3 + 2],
        mesh.upAxis,
      );
      triangles.push({ a: at(face.vertices[0]), b: at(face.vertices[index]), c: at(face.vertices[index + 1]) });
    }
  }
  return triangles;
}

function prepare(filename) {
  const full = join(sourceDir, filename);
  const bytes = readFileSync(full);
  const before = createHash("sha256").update(bytes).digest("hex");
  const mesh = parseObj(bytes.toString("utf8"), filename);
  const positions = Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  const model = analyzeMesh(mesh, null, 1, mesh.upAxis);
  const evaluation = evaluateTileModel(model, {
    positions: mesh.positions,
    faces: mesh.faces,
    up: mesh.upAxis,
    unitScale: 1,
  });
  const descriptor = evaluation.descriptors.find((item) => item.id === "openVolume");
  const score = descriptor?.absoluteScore;
  if (score !== expectedScore[filename]) throw new Error(`${filename} score ${score} does not match the authoritative score`);
  if (!positions.equals(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength))) {
    throw new Error(`${filename} positions changed`);
  }
  const after = createHash("sha256").update(readFileSync(full)).digest("hex");
  if (after !== before) throw new Error(`${filename} file bytes changed`);
  const occupied = model.variants[0].occupied.map((packed) => unpackCell(packed));
  const regions = openVolumeRegions(occupied);
  const located = regions.interstitial.length ? regions.interstitial : regions.free;
  const centers = located.map((cell) => cellCenter(model.anchor, cell, model.cellFeet));
  const triangles = trianglesOf(mesh);
  const bounds = meshBounds(triangles);
  return {
    filename,
    score,
    cellFeet: model.cellFeet,
    triangles,
    bounds,
    centers,
    interstitial: regions.interstitial.length,
    free: regions.free.length,
    sha256: after,
    metrics: (descriptor?.components ?? []).filter((component) => component.weight > 0).map((component) => ({
      name: component.name,
      value: component.value,
      weight: component.weight,
    })),
  };
}

function samplePlane(entry, orientation, origin) {
  const plane = planeFromOrientation(orientation, origin);
  const cut = sectionTriangles(entry.triangles, plane);
  const gold = entry.centers.filter((center) => cellMeetsPlane(center, entry.cellFeet, plane)).length;
  return { segments: cut.segments.length, goldCells: gold };
}

function study(entry) {
  const samples = [];
  for (const [axis, orientation] of [[1, "section-y"], [0, "section-x"], [2, "plan"]]) {
    for (let step = -4; step <= 4; step += 1) {
      const offset = step * entry.cellFeet;
      if (Math.abs(offset) > entry.bounds.size[axis] / 2 + 1e-6) continue;
      const origin = [...entry.bounds.center];
      origin[axis] += offset;
      const result = samplePlane(entry, orientation, origin);
      samples.push({ orientation, offsetFeet: offset, ...result });
    }
  }
  const centroid = entry.centers.reduce((sum, center) => [sum[0] + center[0], sum[1] + center[1], sum[2] + center[2]], [0, 0, 0])
    .map((value) => value / Math.max(1, entry.centers.length));
  const center = samples.find((sample) => sample.orientation === "section-y" && sample.offsetFeet === 0);
  const bestY = samples
    .filter((sample) => sample.orientation === "section-y")
    .sort((left, right) => right.goldCells - left.goldCells || Math.abs(left.offsetFeet) - Math.abs(right.offsetFeet))[0];
  return {
    filename: entry.filename,
    interstitialCells: entry.interstitial,
    centerCut: center,
    strongestSectionY: bestY,
    interstitialCentroid: centroid,
    centroidOffsetFromCenter: centroid.map((value, axis) => value - entry.bounds.center[axis]),
    samples,
  };
}

function drawing(entry, plane) {
  const cut = sectionTriangles(entry.triangles, plane);
  const gold = entry.centers.filter((center) => cellMeetsPlane(center, entry.cellFeet, plane));
  const edges = architecturalEdges(entry.triangles);
  return {
    profile: simplifySegments(cut.segments),
    silhouette: simplifySegments(visibleElevation(edges.silhouette, plane, 8)),
    secondary: simplifySegments(visibleElevation(edges.secondary, plane, 4)),
    polygons: gold.map((center) => cellCutPolygon(center, entry.cellFeet, plane)).filter((polygon) => polygon.length >= 3),
    rawSegments: cut.segments.length,
    goldCells: gold.length,
    goldCenters: gold,
    deviation: simplificationDeviation(cut.segments, 0.02),
  };
}

function continuity(centers, cellFeet) {
  if (centers.length < 2) return 0;
  let linked = 0;
  for (const center of centers) {
    const hasNeighbor = centers.some((other) => other !== center
      && Math.abs(other[1] - center[1]) <= cellFeet
      && Math.hypot(other[0] - center[0], other[2] - center[2]) <= cellFeet * 1.2);
    if (hasNeighbor) linked += 1;
  }
  return linked / centers.length;
}

function boardFrom(width, height, least, most, leastDraw, mostDraw) {
  const view = { width: Math.round(width * BOARD_LAYOUT.panelWidth), height: Math.round(height * BOARD_LAYOUT.panelHeight) };
  const shared = comparisonScale(least.bounds.size, most.bounds.size, "physical", view);
  const header = Math.round(height * BOARD_LAYOUT.panelTop);
  const leastPanel = { x: Math.round(width * 0.04), y: header, width: view.width, height: view.height };
  const mostPanel = { x: Math.round(width * 0.52), y: header, width: view.width, height: view.height };
  const leastPlaced = placeSection(leastDraw.profile, leastDraw.silhouette, leastDraw.polygons, "section-y", least.bounds, leastPanel, shared.feetPerPixelA, leastDraw.secondary);
  const mostPlaced = placeSection(mostDraw.profile, mostDraw.silhouette, mostDraw.polygons, "section-y", most.bounds, mostPanel, shared.feetPerPixelB, mostDraw.secondary);
  if (shared.feetPerPixelA !== shared.feetPerPixelB) throw new Error("The two panels do not share a scale");
  return {
    width,
    height,
    descriptorName: "Open Volume",
    title: "Lowest and highest scored forms",
    leastLabel: least.filename,
    mostLabel: most.filename,
    leastScore: least.score.toFixed(1),
    mostScore: most.score.toFixed(1),
    leastHeading: "Lowest Open Volume Score.",
    mostHeading: "Highest Open Volume Score.",
    leastSection: "Section facing Y, offset −4 ft",
    mostSection: "Section facing Y, center",
    leastLines: leastPlaced.lines,
    mostLines: mostPlaced.lines,
    leastRegions: leastPlaced.regions,
    mostRegions: mostPlaced.regions,
    leastMetrics: least.metrics,
    mostMetrics: most.metrics,
    explanation: "Presentation labels only. Scores were not recalculated from the selected sections.",
    legend: "Gold marks interstitial raster cells, not occupiable space.",
    orientation: "Shared architectural scale.",
    notes: [
      "Gold marks interstitial raster cells, not occupiable space.",
      "Gold is not the full Open Volume score.",
      "Architectural Open Space 35%. Permeability 30%. Interstitial Space 25%. Low Mass 10%.",
      "Shared architectural scale. Rank is not circulation feasibility.",
    ],
    scaleLabel: shared.label,
    vectorComplete: true,
    limitation: null,
    feetPerPixel: shared.feetPerPixelA,
  };
}

function hex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1].slice(0, 2), 16), parseInt(match[1].slice(2, 4), 16), parseInt(match[1].slice(4, 6), 16)];
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function rasterBoard(board, painter = paintComparisonBoard) {
  const rgba = Buffer.alloc(board.width * board.height * 4);
  const paintState = { globalAlpha: 1 };
  const set = (x, y, color) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= board.width || py >= board.height) return;
    const index = (py * board.width + px) * 4;
    const alpha = paintState.globalAlpha;
    if (alpha >= 0.999) {
      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = 255;
      return;
    }
    rgba[index] = Math.round(color[0] * alpha + rgba[index] * (1 - alpha));
    rgba[index + 1] = Math.round(color[1] * alpha + rgba[index + 1] * (1 - alpha));
    rgba[index + 2] = Math.round(color[2] * alpha + rgba[index + 2] * (1 - alpha));
    rgba[index + 3] = 255;
  };
  const line = (x1, y1, x2, y2, color) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let step = 0; step <= steps; step += 1) set(x1 + (x2 - x1) * step / steps, y1 + (y2 - y1) * step / steps, color);
  };
  const ctx = {
    fillStyle: "#000000",
    strokeStyle: "#F7F6F5",
    lineWidth: 1,
    font: "16px Arial",
    _path: [],
    get globalAlpha() { return paintState.globalAlpha; },
    set globalAlpha(value) { paintState.globalAlpha = value; },
    fillRect(x, y, w, h) {
      const color = hex(this.fillStyle);
      if (x <= 0 && y <= 0 && w >= board.width && h >= board.height && paintState.globalAlpha >= 0.999) {
        const pixel = (255 << 24) | (color[2] << 16) | (color[1] << 8) | color[0];
        new Uint32Array(rgba.buffer, rgba.byteOffset, board.width * board.height).fill(pixel >>> 0);
        return;
      }
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(board.width, Math.ceil(x + w));
      const y1 = Math.min(board.height, Math.ceil(y + h));
      for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) set(px, py, color);
    },
    strokeRect(x, y, w, h) {
      const color = hex(this.strokeStyle);
      line(x, y, x + w, y, color);
      line(x, y + h, x + w, y + h, color);
      line(x, y, x, y + h, color);
      line(x + w, y, x + w, y + h, color);
    },
    beginPath() { this._path = []; },
    moveTo(x, y) { this._path = [[x, y]]; },
    lineTo(x, y) { this._path.push([x, y]); },
    closePath() { if (this._path.length) this._path.push([...this._path[0]]); },
    stroke() {
      const color = hex(this.strokeStyle);
      const width = Math.max(1, Math.round(this.lineWidth || 1));
      for (let index = 1; index < this._path.length; index += 1) {
        const a = this._path[index - 1];
        const b = this._path[index];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ox = -(b[1] - a[1]) / length;
        const oy = (b[0] - a[0]) / length;
        for (let offset = 0; offset < width; offset += 1) {
          const shift = offset - (width - 1) / 2;
          line(a[0] + ox * shift, a[1] + oy * shift, b[0] + ox * shift, b[1] + oy * shift, color);
        }
      }
    },
    fill() {
      const points = this._path;
      if (points.length < 3) return;
      const color = hex(this.fillStyle);
      let minY = board.height;
      let maxY = 0;
      for (const point of points) {
        minY = Math.min(minY, point[1]);
        maxY = Math.max(maxY, point[1]);
      }
      const startY = Math.max(0, Math.floor(minY));
      const endY = Math.min(board.height - 1, Math.ceil(maxY));
      for (let y = startY; y <= endY; y += 1) {
        const crossings = [];
        for (let index = 0; index < points.length - 1; index += 1) {
          const a = points[index];
          const b = points[index + 1];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
            const t = (y - a[1]) / (b[1] - a[1]);
            crossings.push(a[0] + t * (b[0] - a[0]));
          }
        }
        crossings.sort((left, right) => left - right);
        const alpha = paintState.globalAlpha;
        for (let index = 0; index + 1 < crossings.length; index += 2) {
          const start = Math.max(0, Math.ceil(Math.min(crossings[index], crossings[index + 1])));
          const end = Math.min(board.width - 1, Math.floor(Math.max(crossings[index], crossings[index + 1])));
          const row = y * board.width;
          for (let x = start; x <= end; x += 1) {
            const pixel = (row + x) * 4;
            if (alpha >= 0.999) {
              rgba[pixel] = color[0];
              rgba[pixel + 1] = color[1];
              rgba[pixel + 2] = color[2];
            } else {
              rgba[pixel] = Math.round(color[0] * alpha + rgba[pixel] * (1 - alpha));
              rgba[pixel + 1] = Math.round(color[1] * alpha + rgba[pixel + 1] * (1 - alpha));
              rgba[pixel + 2] = Math.round(color[2] * alpha + rgba[pixel + 2] * (1 - alpha));
            }
            rgba[pixel + 3] = 255;
          }
        }
      }
    },
    fillText(text, x, y) {
      const size = Number.parseFloat(this.font) || 16;
      const color = hex(this.fillStyle);
      for (const glyph of labelGlyphs(text, size)) {
        const left = Math.round(x + glyph.x);
        const top = Math.round(y + glyph.y);
        const right = Math.min(board.width, Math.round(left + glyph.w));
        const bottom = Math.min(board.height, Math.round(top + glyph.h));
        for (let py = Math.max(0, top); py < bottom; py += 1) {
          const row = py * board.width;
          for (let px = Math.max(0, left); px < right; px += 1) {
            const pixel = (row + px) * 4;
            rgba[pixel] = color[0];
            rgba[pixel + 1] = color[1];
            rgba[pixel + 2] = color[2];
            rgba[pixel + 3] = 255;
          }
        }
      }
    },
  };
  painter(ctx, board);
  return { rgba, width: board.width, height: board.height, png: encodePng(rgba, board.width, board.height) };
}

function encodePng(rgba, width, height) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Box-filter the finished board. Preview type is the same artwork, not a second layout. */
function scaleArtwork(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const y0 = (y * srcH) / dstH;
    const y1 = ((y + 1) * srcH) / dstH;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(srcH - 1, Math.ceil(y1) - 1);
    for (let x = 0; x < dstW; x += 1) {
      const x0 = (x * srcW) / dstW;
      const x1 = ((x + 1) * srcW) / dstW;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(srcW - 1, Math.ceil(x1) - 1);
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      for (let sy = iy0; sy <= iy1; sy += 1) {
        const yWeight = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = ix0; sx <= ix1; sx += 1) {
          const sample = yWeight * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const index = (sy * srcW + sx) * 4;
          red += src[index] * sample;
          green += src[index + 1] * sample;
          blue += src[index + 2] * sample;
          weight += sample;
        }
      }
      const out = (y * dstW + x) * 4;
      dst[out] = Math.round(red / weight);
      dst[out + 1] = Math.round(green / weight);
      dst[out + 2] = Math.round(blue / weight);
      dst[out + 3] = 255;
    }
  }
  return dst;
}

const least = prepare(leastName);
process.stdout.write(`prepared ${least.filename} ${least.score}\n`);
const most = prepare(mostName);
process.stdout.write(`prepared ${most.filename} ${most.score}\n`);
const studies = [study(least), study(most)];
const planeLeast = defaultSectionPlane(least.bounds);
const planeMost = defaultSectionPlane(most.bounds);
const leastDraw = drawing(least, planeLeast);
const mostDraw = drawing(most, planeMost);
process.stdout.write(`drawing least cut ${leastDraw.profile.length} from ${leastDraw.rawSegments}, silhouette ${leastDraw.silhouette.length}, secondary ${leastDraw.secondary.length}, gold ${leastDraw.polygons.length}, deviation ${leastDraw.deviation.maxDeviationFeet}\n`);
process.stdout.write(`drawing most cut ${mostDraw.profile.length} from ${mostDraw.rawSegments}, silhouette ${mostDraw.silhouette.length}, secondary ${mostDraw.secondary.length}, gold ${mostDraw.polygons.length}, deviation ${mostDraw.deviation.maxDeviationFeet}\n`);

const leastCandidate = drawing(least, translatePlane(planeLeast, -4));
const mostCandidate = drawing(most, translatePlane(planeMost, -8));
const leastContinuity = { center: continuity(leastDraw.goldCenters, least.cellFeet), candidate: continuity(leastCandidate.goldCenters, least.cellFeet) };
const mostContinuity = { center: continuity(mostDraw.goldCenters, most.cellFeet), candidate: continuity(mostCandidate.goldCenters, most.cellFeet) };
function profileShare(candidate, center) {
  return candidate.rawSegments / Math.max(1, center.rawSegments);
}
const leastProfile = profileShare(leastCandidate, leastDraw);
const mostProfile = profileShare(mostCandidate, mostDraw);
const recommend = (filename, offset, profile, field) => {
  if (profile < 0.4) {
    return `${filename}: keep the center cut. The Y ${offset} ft cut keeps ${Math.round(profile * 100)}% of the center cut's boundary segments, so it grazes the form. Gold-cell count is not the reason.`;
  }
  if (field.candidate + 0.08 < field.center) {
    return `${filename}: keep the center cut. The Y ${offset} ft cut breaks more of the interstitial cell groups. Gold-cell count is not the reason.`;
  }
  return `${filename}: the Y ${offset} ft cut keeps a readable profile (${Math.round(profile * 100)}% of the center boundary segments) and similar interstitial grouping. It is the more informative section. Gold-cell count was not the selector.`;
};
const recommendation = `${recommend(least.filename, -4, leastProfile, leastContinuity)} ${recommend(most.filename, -8, mostProfile, mostContinuity)} The presentation board uses Gathering Linear at Y −4 ft and Lobby Continuous Hall at the center cut. Scores were not recalculated.`;
process.stdout.write(`${recommendation}\n`);

const full = boardFrom(7407, 2160, least, most, leastCandidate, mostDraw);
if (full.leastLines.filter((line) => line.role === "cut").length !== leastCandidate.profile.length) {
  throw new Error("Gathering Linear board is not the Y −4 ft section");
}
if (full.mostLines.filter((line) => line.role === "cut").length !== mostDraw.profile.length) {
  throw new Error("Lobby Continuous Hall board is not the center section");
}
if (leastCandidate.rawSegments === leastDraw.rawSegments) throw new Error("The Y −4 ft cut did not change the Gathering Linear section");
const svg = comparisonBoardSvg(full);
writeFileSync(join(outDir, "open-volume-board.svg"), svg);
process.stdout.write("svg written\n");
const painted = rasterBoard(full);
writeFileSync(join(outDir, "open-volume-board.png"), painted.png);
process.stdout.write(`png ${painted.png.readUInt32BE(16)}x${painted.png.readUInt32BE(20)}\n`);
const previewPng = encodePng(scaleArtwork(painted.rgba, painted.width, painted.height, 1920, 560), 1920, 560);
writeFileSync(join(outDir, "open-volume-preview.png"), previewPng);
process.stdout.write(`preview ${previewPng.readUInt32BE(16)}x${previewPng.readUInt32BE(20)} scaled from ${painted.width}x${painted.height}\n`);

function studyBoard(width, height) {
  const panelW = Math.round(width * STUDY_LAYOUT.frameW * 0.92);
  const panelH = Math.round(height * STUDY_LAYOUT.frameH * 0.76);
  const shared = comparisonScale(least.bounds.size, most.bounds.size, "physical", { width: panelW, height: panelH });
  const slots = [
    { draw: leastDraw, entry: least, column: 0, row: 0, heading: `${least.filename}   center`, detail: `${leastDraw.rawSegments} boundary segments, ${leastDraw.profile.length} drawn, ${leastDraw.goldCells} interstitial cells` },
    { draw: leastCandidate, entry: least, column: 1, row: 0, heading: `${least.filename}   Y -4 ft`, detail: `${leastCandidate.rawSegments} boundary segments, ${leastCandidate.profile.length} drawn, ${leastCandidate.goldCells} interstitial cells` },
    { draw: mostDraw, entry: most, column: 0, row: 1, heading: `${most.filename}   center`, detail: `${mostDraw.rawSegments} boundary segments, ${mostDraw.profile.length} drawn, ${mostDraw.goldCells} interstitial cells` },
    { draw: mostCandidate, entry: most, column: 1, row: 1, heading: `${most.filename}   Y -8 ft`, detail: `${mostCandidate.rawSegments} boundary segments, ${mostCandidate.profile.length} drawn, ${mostCandidate.goldCells} interstitial cells` },
  ];
  const panels = slots.map((slot) => {
    const frameX = Math.round(width * (STUDY_LAYOUT.frameX + slot.column * STUDY_LAYOUT.column));
    const frameY = Math.round(height * STUDY_LAYOUT.rows[slot.row].frame);
    const frameW = Math.round(width * STUDY_LAYOUT.frameW);
    const frameH = Math.round(height * STUDY_LAYOUT.frameH);
    const panel = {
      x: frameX + Math.round(frameW * 0.04),
      y: frameY + Math.round(frameH * 0.18),
      width: Math.round(frameW * 0.92),
      height: Math.round(frameH * 0.76),
    };
    const placed = placeSection(slot.draw.profile, slot.draw.silhouette, slot.draw.polygons, "section-y", slot.entry.bounds, panel, shared.feetPerPixelA, slot.draw.secondary);
    return { heading: slot.heading, detail: slot.detail, lines: placed.lines, regions: placed.regions };
  });
  return {
    width,
    height,
    title: "Section position comparison",
    note: `Same architectural scale, ${shared.feetPerPixelA.toFixed(4)} ft per pixel. Gold is interstitial raster cells, not occupiable space.`,
    rowNotes: [
      "Y −4 ft reveals clearer spatial organization and preserves 51% of the center cut's boundary segments.",
      "Center section retained. The Y −8 ft alternative preserves only 33% of the center boundary segments.",
    ],
    panels,
    feetPerPixel: shared.feetPerPixelA,
  };
}

const studyFull = studyBoard(7407, 2160);
const studySvg = studyBoardSvg(studyFull);
writeFileSync(join(outDir, "section-comparison.svg"), studySvg);
const studyPainted = rasterBoard(studyFull, paintStudyBoard);
writeFileSync(join(outDir, "section-comparison.png"), studyPainted.png);
writeFileSync(join(outDir, "section-comparison-preview.png"), encodePng(scaleArtwork(studyPainted.rgba, studyPainted.width, studyPainted.height, 1920, 560), 1920, 560));
writeFileSync(join(outDir, "section-position-study.json"), JSON.stringify({
  presentation: {
    least: { filename: least.filename, section: "Y", offsetFeet: -4, rawCutSegments: leastCandidate.rawSegments, drawnCutSegments: leastCandidate.profile.length, goldCells: leastCandidate.goldCells },
    most: { filename: most.filename, section: "Y", offsetFeet: 0, rawCutSegments: mostDraw.rawSegments, drawnCutSegments: mostDraw.profile.length, goldCells: mostDraw.goldCells },
    feetPerPixel: full.feetPerPixel,
    scoresRecalculated: false,
  },
  defaultPlane: "section-y through each geometric center remains the evaluator default. The presentation board uses Y −4 ft for Gathering Linear and the center cut for Lobby Continuous Hall.",
  recommendation,
  criteria: "A candidate is more informative only when it keeps at least 40% of the center cut's boundary segments and does not break interstitial grouping by more than 8 points. The larger gold-cell count is reported and is not the selector.",
  scale: { feetPerPixel: full.feetPerPixel, shared: true, studyFeetPerPixel: studyFull.feetPerPixel },
  simplification: {
    toleranceFeet: 0.02,
    least: leastDraw.deviation,
    most: mostDraw.deviation,
    meaning: "Dropped points lie within the tolerance of the remaining cut line. Chain endpoints are kept. Source faces are unchanged.",
  },
  drawing: {
    least: { rawCutSegments: leastDraw.rawSegments, drawnCutSegments: leastDraw.profile.length, silhouetteSegments: leastDraw.silhouette.length, secondarySegments: leastDraw.secondary.length, goldCells: leastDraw.goldCells, continuity: leastContinuity.center },
    most: { rawCutSegments: mostDraw.rawSegments, drawnCutSegments: mostDraw.profile.length, silhouetteSegments: mostDraw.silhouette.length, secondarySegments: mostDraw.secondary.length, goldCells: mostDraw.goldCells, continuity: mostContinuity.center },
    leastCandidate: { offsetFeet: -4, rawCutSegments: leastCandidate.rawSegments, drawnCutSegments: leastCandidate.profile.length, goldCells: leastCandidate.goldCells, profileShare: leastProfile, continuity: leastContinuity.candidate },
    mostCandidate: { offsetFeet: -8, rawCutSegments: mostCandidate.rawSegments, drawnCutSegments: mostCandidate.profile.length, goldCells: mostCandidate.goldCells, profileShare: mostProfile, continuity: mostContinuity.candidate },
  },
  metrics: { least: least.metrics, most: most.metrics },
  scoresUnchanged: true,
  forms: studies,
}, null, 2));

function assertTextClearsFrames(markup) {
  const frames = [...markup.matchAll(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    right: Number(match[1]) + Number(match[3]),
    bottom: Number(match[2]) + Number(match[4]),
  }));
  const texts = [...markup.matchAll(/<text x="([0-9.]+)" y="([0-9.]+)"[^>]*font-size="([0-9.]+)">(.*?)<\/text>/g)];
  for (const match of texts) {
    const x = Number(match[1]);
    const baseline = Number(match[2]);
    const size = Number(match[3]);
    const text = match[4];
    const top = baseline - size;
    const right = x + text.length * size * 0.62;
    for (const frame of frames) {
      const hits = right > frame.x + 4 && x < frame.right - 4 && baseline > frame.y + 4 && top < frame.bottom - 4;
      if (hits) throw new Error(`Text crosses a drawing frame: ${text}`);
    }
  }
}

function assertLabels(markup, width, height) {
  const boxes = [];
  const pattern = /<text x="([0-9.]+)" y="([0-9.]+)"[^>]*font-size="([0-9.]+)">(.*?)<\/text>/g;
  for (const match of markup.matchAll(pattern)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const size = Number(match[3]);
    const text = match[4].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
    const box = { text, x, top: y - size, right: x + text.length * size * 0.62, bottom: y + size * 0.15 };
    if (box.x < 8 || box.top < 2 || box.right > width - 8 || box.bottom > height - 2) {
      throw new Error(`Label clipped: ${text}`);
    }
    boxes.push(box);
  }
  if (boxes.length < 12) throw new Error("The board is missing text labels");
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const clear = a.right < b.x + 2 || b.right < a.x + 2 || a.bottom < b.top + 2 || b.bottom < a.top + 2;
      if (!clear) throw new Error(`Labels overlap: "${a.text}" and "${b.text}"`);
    }
  }
}

const required = ["Open Volume", leastName, mostName, "37.5", "67.3", "Lowest Open Volume Score.", "Highest Open Volume Score.", "offset −4 ft", "Section facing Y, center", "#D6AD4F", "#F7F6F5", "#000000", "architectural scale", "circulation", "Architectural Open Space", "Permeability", "Interstitial Space", "Low Mass", "not the full Open Volume score", "not occupiable"];
const missing = required.filter((text) => !svg.includes(text));
if (missing.length) throw new Error(`SVG is missing ${missing.join(", ")}`);
if (svg.includes("Least viable") || svg.includes("Most viable")) throw new Error("Old viability headings are still on the board");
if (!svg.includes("fill-opacity=\"0.16\"") || !svg.includes("stroke-opacity=\"0.22\"") || !svg.includes("least-section-cut") || !svg.includes("least-secondary") || !svg.includes("stroke-width=\"10.00\"")) {
  throw new Error("SVG is missing translucent gold, the heavier cut, or secondary edges");
}
assertLabels(svg, full.width, full.height);
const hashesAfter = sourceHashes();
for (const name of Object.keys(hashesBefore)) {
  if (hashesAfter[name] !== hashesBefore[name]) throw new Error(`${name} bytes changed`);
}
if (!studySvg.includes(leastName) || !studySvg.includes("Y -4 ft") || !studySvg.includes("Y -8 ft")) {
  throw new Error("Section comparison is missing a candidate label");
}
if (!studySvg.includes("preserves 51% of the center cut's boundary segments.") || !studySvg.includes("Center section retained. The Y −8 ft alternative preserves only 33% of the center boundary segments.")) {
  throw new Error("Section comparison is missing a row note");
}
if (studySvg.includes("Gold-cell count was not the selector")) throw new Error("The long section footer is still on the board");
assertLabels(studySvg, studyFull.width, studyFull.height);
assertTextClearsFrames(studySvg);
if (previewPng.readUInt32BE(16) !== 1920 || previewPng.readUInt32BE(20) !== 560) throw new Error("Open Volume preview is not a 1920×560 scale of the board");
if (painted.width !== 7407 || painted.height !== 2160 || studyPainted.width !== 7407 || studyPainted.height !== 2160) {
  throw new Error("A final board was not rendered at 7407×2160");
}
process.stdout.write("presentation preview complete\n");
