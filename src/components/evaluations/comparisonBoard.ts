import type { Vec3 } from "./geometryView";
import { projectPoint, type MeshBounds, type SectionOrientation, type Segment } from "./meshSection";

export const BOARD_PRESETS = [
  { id: "board", label: "Architectural board 7407 × 2160", width: 7407, height: 2160 },
  { id: "uhd", label: "3840 × 2160", width: 3840, height: 2160 },
  { id: "hd", label: "1920 × 1080", width: 1920, height: 1080 },
] as const;

export type BoardLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  role: "cut" | "silhouette" | "secondary";
  /** Older sample drawings. New boards use filled regions instead. */
  gold?: boolean;
};

export type BoardRegion = { points: Array<[number, number]> };

export type ScoreMetric = { name: string; value: number; weight: number; unavailable?: boolean };

/** Projected v4 evidence for one panel. Coordinates are board pixels. */
export type BoardOverlay = {
  id: string;
  color: string;
  alpha: number;
  dashed?: boolean;
  polygons: Array<Array<[number, number]>>;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  points: Array<[number, number]>;
  labels: Array<{ x: number; y: number; text: string }>;
};

export type BoardLegendItem = {
  color: string;
  label: string;
  dashed?: boolean;
  kind: "patch" | "line" | "point";
};

/**
 * Annotation sizes in pixels for a given board height. At 2160 px: heading 32,
 * labels and values 28, secondary 23, swatches 24. They scale with the output
 * size, not with device pixel ratio.
 */
export function annotationSizes(height: number) {
  const scale = height / 2160;
  const px = (base: number) => Math.max(9, Math.round(base * scale));
  return { title: px(36), heading: px(32), label: px(28), value: px(28), secondary: px(23), swatch: px(24) };
}

export type BoardModel = {
  width: number;
  height: number;
  descriptorName: string;
  title: string;
  leastLabel: string;
  mostLabel: string;
  leastScore: string;
  mostScore: string;
  /** Rank headings. Open Volume uses score language rather than viability. */
  leastHeading?: string;
  mostHeading?: string;
  /** Section orientation and offset, drawn under each panel. */
  leastSection?: string;
  mostSection?: string;
  /** Short footer notes. When set, they replace the combined explanation line. */
  notes?: string[];
  leastLines: BoardLine[];
  mostLines: BoardLine[];
  leastRegions?: BoardRegion[];
  mostRegions?: BoardRegion[];
  leastMetrics?: ScoreMetric[];
  mostMetrics?: ScoreMetric[];
  /** v4 projected evidence per panel. */
  leastOverlays?: BoardOverlay[];
  mostOverlays?: BoardOverlay[];
  /** Legend generated from the layers actually drawn. Empty when nothing is drawn. */
  legendItems?: BoardLegendItem[];
  /** Second score line under each score, e.g. "Absolute score 62.4 · Registry rank 9 of 15". */
  leastScoreDetail?: string;
  mostScoreDetail?: string;
  explanation: string;
  legend: string;
  orientation: string;
  scaleLabel: string;
  vectorComplete: boolean;
  limitation: string | null;
};

/** Map spec-feet points into a panel the same way placeSection does. */
export function sectionMapper(
  orientation: SectionOrientation,
  bounds: MeshBounds,
  panel: { x: number; y: number; width: number; height: number },
  feetPerPixel: number,
) {
  const [cx, cy] = projectPoint(bounds.center, orientation);
  return (point: Vec3): [number, number] => {
    const [px, py] = projectPoint(point, orientation);
    return [
      panel.x + panel.width / 2 + (px - cx) / feetPerPixel,
      panel.y + panel.height / 2 - (py - cy) / feetPerPixel,
    ];
  };
}

export const BOARD_LAYOUT = {
  frameTop: 0.22,
  frameHeight: 0.44,
  panelTop: 0.235,
  panelHeight: 0.41,
  panelWidth: 0.44,
  left: 0.04,
  right: 0.52,
};

export type DrawContext = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  globalAlpha: number;
  /** Optional. Browser canvases support dashes; the test rasterizer may not. */
  setLineDash?(segments: number[]): void;
};

const GOLD = "#D6AD4F";
const INK = "#F7F6F5";
const CYAN = "#1293C2";
const BLUE = "#71BEDA";
const GRAY = "#B9BEC6";
export const GOLD_FILL_ALPHA = 0.16;
export const GOLD_EDGE_ALPHA = 0.22;

export function boardLineWidth(role: BoardLine["role"], height: number) {
  const scale = Math.max(0.55, height / 2160);
  if (role === "cut") return 10 * scale;
  if (role === "silhouette") return 2.5 * scale;
  return 0.9 * scale;
}

export function goldEdgeWidth(height: number) {
  return Math.max(0.6, 1.15 * Math.max(0.55, height / 2160));
}

export function placeSection(
  cutSegments: Segment[],
  silhouette: Segment[],
  goldPolygons: Vec3[][],
  orientation: SectionOrientation,
  bounds: MeshBounds,
  panel: { x: number; y: number; width: number; height: number },
  feetPerPixel: number,
  secondary: Segment[] = [],
): { lines: BoardLine[]; regions: BoardRegion[] } {
  const [cx, cy] = projectPoint(bounds.center, orientation);
  const map = (point: Vec3): [number, number] => {
    const [px, py] = projectPoint(point, orientation);
    return [
      panel.x + panel.width / 2 + (px - cx) / feetPerPixel,
      panel.y + panel.height / 2 - (py - cy) / feetPerPixel,
    ];
  };
  const toLine = (segment: Segment, role: BoardLine["role"]): BoardLine => {
    const [x1, y1] = map(segment.a);
    const [x2, y2] = map(segment.b);
    return { x1, y1, x2, y2, role };
  };
  const lines = [
    ...secondary.map((segment) => toLine(segment, "secondary")),
    ...silhouette.map((segment) => toLine(segment, "silhouette")),
    ...cutSegments.map((segment) => toLine(segment, "cut")),
  ];
  const seen = new Set<string>();
  const regions: BoardRegion[] = [];
  for (const polygon of goldPolygons) {
    if (polygon.length < 3) continue;
    const points = polygon.map((point) => map(point));
    const key = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).sort().join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    regions.push({ points });
  }
  return { lines, regions };
}

type BoardText = { text: string; x: number; y: number; size: number; fill: string };

function wrapLines(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shared label positions for the canvas PNG and the Illustrator SVG. */
export function boardLabels(board: BoardModel): BoardText[] {
  const { width, height } = board;
  const margin = Math.round(width * 0.03);
  const mid = Math.round(width / 2 + width * 0.015);
  const sizes = annotationSizes(height);
  const title = sizes.title;
  const rank = sizes.secondary;
  const name = sizes.label;
  const score = sizes.heading;
  const small = sizes.secondary;
  const body = sizes.secondary;
  const labels: BoardText[] = [
    { text: board.descriptorName, x: margin, y: Math.round(height * 0.046), size: title, fill: INK },
    { text: board.title, x: margin, y: Math.round(height * 0.078), size: small, fill: BLUE },
    { text: board.leastHeading ?? "Least viable", x: margin, y: Math.round(height * 0.120), size: rank, fill: GOLD },
    { text: board.leastLabel, x: margin, y: Math.round(height * 0.162), size: name, fill: INK },
    { text: board.leastScore, x: margin, y: Math.round(height * 0.208), size: score, fill: GOLD },
    { text: board.mostHeading ?? "Most viable", x: mid, y: Math.round(height * 0.120), size: rank, fill: GOLD },
    { text: board.mostLabel, x: mid, y: Math.round(height * 0.162), size: name, fill: INK },
    { text: board.mostScore, x: mid, y: Math.round(height * 0.208), size: score, fill: GOLD },
  ];
  if (board.leastScoreDetail) labels.push({ text: board.leastScoreDetail, x: margin + Math.round(width * 0.12), y: Math.round(height * 0.208), size: sizes.value, fill: INK });
  if (board.mostScoreDetail) labels.push({ text: board.mostScoreDetail, x: mid + Math.round(width * 0.12), y: Math.round(height * 0.208), size: sizes.value, fill: INK });
  if (board.leastSection) {
    labels.push({ text: board.leastSection, x: margin, y: Math.round(height * 0.692), size: small, fill: BLUE });
  }
  if (board.mostSection) {
    labels.push({ text: board.mostSection, x: mid, y: Math.round(height * 0.692), size: small, fill: BLUE });
  }
  if (board.notes?.length) {
    const noteFill = [GOLD, INK, INK, BLUE];
    board.notes.forEach((note, index) => {
      labels.push({
        text: note,
        x: margin,
        y: Math.round(height * (0.888 + index * 0.026)),
        size: body,
        fill: noteFill[index] ?? INK,
      });
    });
  } else {
    const footer = wrapLines(board.explanation, Math.max(42, Math.floor((width * 0.94) / (body * 0.56))));
    footer.slice(0, 2).forEach((line, index) => {
      labels.push({ text: line, x: margin, y: Math.round(height * 0.905 + index * body * 1.35), size: body, fill: INK });
    });
    labels.push({
      text: `${board.legend}  ${board.orientation}  ${board.scaleLabel}`,
      x: margin,
      y: Math.round(height * 0.962),
      size: small,
      fill: BLUE,
    });
  }
  if (board.limitation) {
    labels.push({ text: board.limitation, x: margin, y: Math.round(height * 0.988), size: small, fill: GOLD });
  }
  return labels;
}

function metricLayout(board: BoardModel) {
  const sizes = annotationSizes(board.height);
  const size = sizes.secondary;
  const barH = Math.max(7, Math.round(board.height * 0.012));
  const column = board.width * 0.42;
  const labels: BoardText[] = [];
  const bars: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
  const write = (metrics: ScoreMetric[] | undefined, origin: number) => {
    if (!metrics?.length) return;
    const nameX = origin;
    const barX = origin + column * 0.48;
    const barW = column * 0.2;
    const valueX = origin + column * 0.71;
    const step = Math.min(0.037, 0.15 / Math.max(1, metrics.length));
    metrics.forEach((metric, index) => {
      const y = Math.round(board.height * (0.725 + index * step));
      const points = metric.weight * metric.value;
      labels.push({ text: metric.name, x: nameX, y, size, fill: INK });
      labels.push({
        text: metric.unavailable ? "unavailable  not scored" : `${Math.round(metric.value)}  ${Math.round(metric.weight * 100)}%  ${points.toFixed(1)} pts`,
        x: valueX,
        y,
        size,
        fill: metric.unavailable ? GRAY : GOLD,
      });
      bars.push({ x: barX, y: y - barH, w: barW, h: barH, fill: "#2A2A2A" });
      if (!metric.unavailable) {
        bars.push({
          x: barX,
          y: y - barH,
          w: Math.max(1, barW * Math.max(0, Math.min(100, metric.value)) / 100),
          h: barH,
          fill: GOLD,
        });
      }
    });
  };
  write(board.leastMetrics, Math.round(board.width * 0.04));
  write(board.mostMetrics, Math.round(board.width * 0.52));
  return { labels, bars };
}

/** Legend in the header, right of the form labels, outside the drawing frames. */
function legendLayout(board: BoardModel) {
  const items = board.legendItems ?? [];
  const sizes = annotationSizes(board.height);
  const x = Math.round(board.width * 0.76);
  const swatch = sizes.swatch;
  const rowStep = Math.round(swatch * 1.45);
  const top = Math.round(board.height * 0.045);
  const labels: BoardText[] = [];
  const swatches: Array<{ x: number; y: number; w: number; h: number; color: string; dashed: boolean; kind: BoardLegendItem["kind"] }> = [];
  if (!items.length) return { labels, swatches };
  labels.push({ text: "Legend", x, y: top, size: sizes.secondary, fill: BLUE });
  items.slice(0, 9).forEach((item, index) => {
    const y = top + rowStep * (index + 1);
    swatches.push({ x, y: y - swatch * 0.8, w: swatch, h: swatch * 0.8, color: item.color, dashed: Boolean(item.dashed), kind: item.kind });
    labels.push({ text: item.label, x: x + swatch + Math.round(swatch * 0.5), y, size: sizes.swatch, fill: INK });
  });
  return { labels, swatches };
}

function paintOverlays(ctx: DrawContext, overlays: BoardOverlay[] | undefined, height: number) {
  if (!overlays?.length) return;
  const scale = Math.max(0.55, height / 2160);
  for (const overlay of overlays) {
    ctx.fillStyle = overlay.color;
    ctx.strokeStyle = overlay.color;
    ctx.globalAlpha = overlay.alpha;
    for (const polygon of overlay.polygons) {
      if (polygon.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let index = 1; index < polygon.length; index += 1) ctx.lineTo(polygon[index][0], polygon[index][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, overlay.alpha + 0.5);
    ctx.lineWidth = 2.2 * scale;
    ctx.setLineDash?.(overlay.dashed ? [8 * scale, 6 * scale] : []);
    for (const line of overlay.lines) {
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    }
    ctx.setLineDash?.([]);
    ctx.globalAlpha = 1;
    const dot = 7 * scale;
    for (const [x, y] of overlay.points) ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    const size = annotationSizes(height).secondary;
    ctx.font = `${size}px Arial, Helvetica, sans-serif`;
    for (const label of overlay.labels) ctx.fillText(label.text, label.x + dot, label.y - dot);
  }
  ctx.globalAlpha = 1;
}

export function paintComparisonBoard(ctx: DrawContext, board: BoardModel) {
  const { width, height } = board;
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, width, height);
  paintRegions(ctx, board.leastRegions ?? [], height);
  paintRegions(ctx, board.mostRegions ?? [], height);
  for (const role of ["secondary", "silhouette", "cut"] as const) {
    strokeLines(ctx, board.leastLines.filter((line) => line.role === role && !line.gold), height);
    strokeLines(ctx, board.mostLines.filter((line) => line.role === role && !line.gold), height);
  }
  strokeLines(ctx, [...board.leastLines, ...board.mostLines].filter((line) => line.gold), height);
  paintOverlays(ctx, board.leastOverlays, height);
  paintOverlays(ctx, board.mostOverlays, height);
  const metrics = metricLayout(board);
  for (const bar of metrics.bars) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = bar.fill;
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  }
  const legend = legendLayout(board);
  for (const swatch of legend.swatches) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = swatch.color;
    if (swatch.kind === "patch") ctx.fillRect(swatch.x, swatch.y, swatch.w, swatch.h);
    else if (swatch.kind === "point") ctx.fillRect(swatch.x + swatch.w * 0.3, swatch.y + swatch.h * 0.2, swatch.w * 0.4, swatch.h * 0.6);
    else {
      ctx.strokeStyle = swatch.color;
      ctx.lineWidth = Math.max(1.5, 2.2 * (height / 2160));
      ctx.setLineDash?.(swatch.dashed ? [6 * (height / 2160), 5 * (height / 2160)] : []);
      ctx.beginPath();
      ctx.moveTo(swatch.x, swatch.y + swatch.h / 2);
      ctx.lineTo(swatch.x + swatch.w, swatch.y + swatch.h / 2);
      ctx.stroke();
      ctx.setLineDash?.([]);
    }
  }

  const margin = Math.round(width * 0.03);
  const header = Math.round(height * BOARD_LAYOUT.frameTop);
  const footer = Math.round(height * (1 - BOARD_LAYOUT.frameTop - BOARD_LAYOUT.frameHeight));
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = Math.max(1, width / 1400);
  ctx.strokeRect(margin, header, width - margin * 2, height - header - footer);
  ctx.beginPath();
  ctx.moveTo(width / 2, header);
  ctx.lineTo(width / 2, height - footer);
  ctx.stroke();

  ctx.globalAlpha = 1;
  for (const label of [...boardLabels(board), ...metrics.labels, ...legend.labels]) {
    ctx.fillStyle = label.fill;
    ctx.font = `${label.size}px Arial, Helvetica, sans-serif`;
    ctx.fillText(label.text, label.x, label.y);
  }
}

function overlayMarkup(overlays: BoardOverlay[] | undefined, height: number) {
  if (!overlays?.length) return "";
  const scale = Math.max(0.55, height / 2160);
  const size = annotationSizes(height).secondary;
  return overlays.map((overlay) => {
    const polygons = overlay.polygons
      .filter((polygon) => polygon.length >= 3)
      .map((polygon) => `<polygon points="${polygon.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}"/>`)
      .join("");
    const lines = overlay.lines.map((line) => `M ${line.x1.toFixed(1)} ${line.y1.toFixed(1)} L ${line.x2.toFixed(1)} ${line.y2.toFixed(1)}`).join(" ");
    const dot = (7 * scale).toFixed(1);
    const points = overlay.points.map(([x, y]) => `<rect x="${(x - 3.5 * scale).toFixed(1)}" y="${(y - 3.5 * scale).toFixed(1)}" width="${dot}" height="${dot}"/>`).join("");
    const labels = overlay.labels.map((label) => `<text x="${(label.x + 7 * scale).toFixed(1)}" y="${(label.y - 7 * scale).toFixed(1)}" font-size="${size}" fill="${overlay.color}">${escapeXml(label.text)}</text>`).join("");
    return `<g id="evidence-${escapeXml(overlay.id)}">
    <g fill="${overlay.color}" fill-opacity="${overlay.alpha}" stroke="none">${polygons}</g>
    <g fill="none" stroke="${overlay.color}" stroke-opacity="${Math.min(1, overlay.alpha + 0.5)}" stroke-width="${(2.2 * scale).toFixed(2)}"${overlay.dashed ? ` stroke-dasharray="${(8 * scale).toFixed(1)} ${(6 * scale).toFixed(1)}"` : ""}>${lines ? `<path d="${lines}"/>` : ""}</g>
    <g fill="${overlay.color}">${points}</g>
    <g font-family="Arial, Helvetica, sans-serif">${labels}</g>
  </g>`;
  }).join("\n  ");
}

function legendMarkup(board: BoardModel) {
  const legend = legendLayout(board);
  if (!legend.labels.length) return "";
  const scale = board.height / 2160;
  const swatches = legend.swatches.map((swatch) => {
    if (swatch.kind === "patch") return `<rect x="${swatch.x}" y="${swatch.y.toFixed(1)}" width="${swatch.w}" height="${swatch.h.toFixed(1)}" fill="${swatch.color}"/>`;
    if (swatch.kind === "point") return `<rect x="${(swatch.x + swatch.w * 0.3).toFixed(1)}" y="${(swatch.y + swatch.h * 0.2).toFixed(1)}" width="${(swatch.w * 0.4).toFixed(1)}" height="${(swatch.h * 0.6).toFixed(1)}" fill="${swatch.color}"/>`;
    const y = (swatch.y + swatch.h / 2).toFixed(1);
    return `<line x1="${swatch.x}" y1="${y}" x2="${swatch.x + swatch.w}" y2="${y}" stroke="${swatch.color}" stroke-width="${Math.max(1.5, 2.2 * scale).toFixed(2)}"${swatch.dashed ? ` stroke-dasharray="${(6 * scale).toFixed(1)} ${(5 * scale).toFixed(1)}"` : ""}/>`;
  }).join("\n    ");
  const texts = legend.labels.map((label) => `<text x="${label.x}" y="${label.y}" fill="${label.fill}" font-size="${label.size}">${escapeXml(label.text)}</text>`).join("\n    ");
  return `<g id="legend" font-family="Arial, Helvetica, sans-serif">
    ${swatches}
    ${texts}
  </g>`;
}

function uniqueRegionEdges(regions: BoardRegion[]) {
  const seen = new Set<string>();
  const edges: Array<[[number, number], [number, number]]> = [];
  for (const region of regions) {
    const points = region.points;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const startKey = `${start[0].toFixed(2)},${start[1].toFixed(2)}`;
      const endKey = `${end[0].toFixed(2)},${end[1].toFixed(2)}`;
      const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([start, end]);
    }
  }
  return edges;
}

/** Fill each evaluated cell, then stroke each cell edge once so shared edges do not stack. */
export function paintGoldRegions(ctx: DrawContext, regions: BoardRegion[], height: number) {
  ctx.fillStyle = GOLD;
  ctx.globalAlpha = GOLD_FILL_ALPHA;
  for (const region of regions) {
    if (region.points.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(region.points[0][0], region.points[0][1]);
    for (let index = 1; index < region.points.length; index += 1) ctx.lineTo(region.points[index][0], region.points[index][1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = goldEdgeWidth(height);
  ctx.globalAlpha = GOLD_EDGE_ALPHA;
  for (const [start, end] of uniqueRegionEdges(regions)) {
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintRegions(ctx: DrawContext, regions: BoardRegion[], height: number) {
  paintGoldRegions(ctx, regions, height);
}

function strokeLines(ctx: DrawContext, lines: BoardLine[], height: number) {
  for (const line of lines) {
    ctx.strokeStyle = line.gold ? GOLD : INK;
    ctx.lineWidth = line.gold ? boardLineWidth("silhouette", height) : boardLineWidth(line.role ?? "cut", height);
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pathData(lines: BoardLine[]) {
  return lines.map((line) => `M ${line.x1.toFixed(2)} ${line.y1.toFixed(2)} L ${line.x2.toFixed(2)} ${line.y2.toFixed(2)}`).join(" ");
}

function regionMarkup(regions: BoardRegion[]) {
  return regions
    .filter((region) => region.points.length >= 3)
    .map((region) => `<polygon points="${region.points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}"/>`)
    .join("\n    ");
}

function regionEdgeMarkup(regions: BoardRegion[]) {
  const edges = uniqueRegionEdges(regions)
    .map(([start, end]) => `M ${start[0].toFixed(2)} ${start[1].toFixed(2)} L ${end[0].toFixed(2)} ${end[1].toFixed(2)}`)
    .join(" ");
  return `<path fill="none" d="${edges}"/>`;
}

function rolePath(lines: BoardLine[], role: BoardLine["role"]) {
  return pathData(lines.filter((line) => line.role === role && !line.gold));
}

/** Vector board. Section profiles, silhouettes, gold cells, metric bars, and labels are editable. */
export function comparisonBoardSvg(board: BoardModel) {
  const margin = Math.round(board.width * 0.03);
  const header = Math.round(board.height * BOARD_LAYOUT.frameTop);
  const frameHeight = Math.round(board.height * BOARD_LAYOUT.frameHeight);
  const cutWidth = boardLineWidth("cut", board.height).toFixed(2);
  const silhouetteWidth = boardLineWidth("silhouette", board.height).toFixed(2);
  const secondaryWidth = boardLineWidth("secondary", board.height).toFixed(2);
  const edge = goldEdgeWidth(board.height).toFixed(2);
  const frameWidth = Math.max(1, board.width / 1400).toFixed(2);
  const metrics = metricLayout(board);
  const bars = metrics.bars.map((bar) => `<rect x="${bar.x.toFixed(1)}" y="${bar.y.toFixed(1)}" width="${bar.w.toFixed(1)}" height="${bar.h.toFixed(1)}" fill="${bar.fill}"/>`).join("\n    ");
  const texts = [...boardLabels(board), ...metrics.labels].map((label) => (
    `<text x="${label.x}" y="${label.y}" fill="${label.fill}" font-family="Arial, Helvetica, sans-serif" font-size="${label.size}">${escapeXml(label.text)}</text>`
  ));
  const lineGroup = (id: string, d: string, width: string) => (
    `<g id="${id}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${d ? `<path d="${d}"/>` : ""}</g>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${board.width}" height="${board.height}" viewBox="0 0 ${board.width} ${board.height}">
  <title>${escapeXml(board.descriptorName)} comparison</title>
  <desc>Black board, white section linework, and translucent evidence overlays in the approved palette (gold #D6AD4F and blues). Overlays are the evaluator's recorded evidence, not a claim of occupiable space. Source OBJ geometry was not modified.</desc>
  <g id="background">
    <rect width="100%" height="100%" fill="#000000"/>
  </g>
  <g id="least-open-volume">
    <g fill="${GOLD}" fill-opacity="${GOLD_FILL_ALPHA}" stroke="none">${regionMarkup(board.leastRegions ?? [])}</g>
    <g fill="none" stroke="${GOLD}" stroke-opacity="${GOLD_EDGE_ALPHA}" stroke-width="${edge}">${regionEdgeMarkup(board.leastRegions ?? [])}</g>
  </g>
  <g id="most-open-volume">
    <g fill="${GOLD}" fill-opacity="${GOLD_FILL_ALPHA}" stroke="none">${regionMarkup(board.mostRegions ?? [])}</g>
    <g fill="none" stroke="${GOLD}" stroke-opacity="${GOLD_EDGE_ALPHA}" stroke-width="${edge}">${regionEdgeMarkup(board.mostRegions ?? [])}</g>
  </g>
  ${lineGroup("least-secondary", rolePath(board.leastLines, "secondary"), secondaryWidth)}
  ${lineGroup("most-secondary", rolePath(board.mostLines, "secondary"), secondaryWidth)}
  ${lineGroup("least-silhouette", rolePath(board.leastLines, "silhouette"), silhouetteWidth)}
  ${lineGroup("most-silhouette", rolePath(board.mostLines, "silhouette"), silhouetteWidth)}
  ${lineGroup("least-section-cut", rolePath(board.leastLines, "cut"), cutWidth)}
  ${lineGroup("most-section-cut", rolePath(board.mostLines, "cut"), cutWidth)}
  ${overlayMarkup(board.leastOverlays, board.height)}
  ${overlayMarkup(board.mostOverlays, board.height)}
  <g id="score-components">
    ${bars}
  </g>
  <g id="frame" fill="none" stroke="${CYAN}" stroke-width="${frameWidth}">
    <rect x="${margin}" y="${header}" width="${Math.round(board.width * 0.94)}" height="${frameHeight}"/>
    <line x1="${board.width / 2}" y1="${header}" x2="${board.width / 2}" y2="${header + frameHeight}"/>
  </g>
  ${legendMarkup(board)}
  <g id="labels" font-family="Arial, Helvetica, sans-serif">
    ${texts.join("\n    ")}
  </g>
</svg>`;
}

const GLYPHS: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "00100", "00100", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "−": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "–": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "%": ["11001", "11010", "00100", "01000", "00100", "01011", "10011"],
};

/** Shared section-comparison placement. Notes sit in the gaps under each row. */
export const STUDY_LAYOUT = {
  frameX: 0.03,
  frameW: 0.45,
  frameH: 0.30,
  column: 0.48,
  rows: [
    { heading: 0.108, frame: 0.150, note: 0.492 },
    { heading: 0.545, frame: 0.590, note: 0.945 },
  ],
} as const;

export type StudyPanel = {
  heading: string;
  detail: string;
  lines: BoardLine[];
  regions: BoardRegion[];
};

export type StudyBoard = {
  width: number;
  height: number;
  title: string;
  note: string;
  /** One concise note under each comparison row. */
  rowNotes: [string, string];
  panels: StudyPanel[];
};

function studyText(board: StudyBoard): BoardText[] {
  const margin = Math.round(board.width * 0.03);
  const title = Math.max(20, Math.round(board.height * 0.03));
  const body = Math.max(13, Math.round(board.height * 0.015));
  const small = Math.max(12, Math.round(board.height * 0.014));
  const labels: BoardText[] = [
    { text: board.title, x: margin, y: Math.round(board.height * 0.04), size: title, fill: INK },
    { text: board.note, x: margin, y: Math.round(board.height * 0.072), size: small, fill: BLUE },
  ];
  board.panels.forEach((panel, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = Math.round(board.width * (0.04 + column * STUDY_LAYOUT.column));
    const y = Math.round(board.height * STUDY_LAYOUT.rows[row].heading);
    labels.push({ text: panel.heading, x, y, size: body, fill: GOLD });
    labels.push({ text: panel.detail, x, y: y + Math.round(body * 1.35), size: small, fill: INK });
  });
  const noteSize = Math.max(12, Math.round(board.height * 0.015));
  board.rowNotes.forEach((text, row) => {
    labels.push({
      text,
      x: margin,
      y: Math.round(board.height * STUDY_LAYOUT.rows[row].note),
      size: noteSize,
      fill: INK,
    });
  });
  return labels;
}

function paintPanels(ctx: DrawContext, panels: StudyPanel[], height: number) {
  for (const panel of panels) {
    paintRegions(ctx, panel.regions, height);
    for (const role of ["secondary", "silhouette", "cut"] as const) {
      strokeLines(ctx, panel.lines.filter((line) => line.role === role), height);
    }
  }
}

export function paintStudyBoard(ctx: DrawContext, board: StudyBoard) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, board.width, board.height);
  paintPanels(ctx, board.panels, board.height);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = Math.max(1, board.width / 1400);
  for (let index = 0; index < board.panels.length; index += 1) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    ctx.strokeRect(
      Math.round(board.width * (STUDY_LAYOUT.frameX + column * STUDY_LAYOUT.column)),
      Math.round(board.height * STUDY_LAYOUT.rows[row].frame),
      Math.round(board.width * STUDY_LAYOUT.frameW),
      Math.round(board.height * STUDY_LAYOUT.frameH),
    );
  }
  for (const label of studyText(board)) {
    ctx.fillStyle = label.fill;
    ctx.font = `${label.size}px Arial, Helvetica, sans-serif`;
    ctx.fillText(label.text, label.x, label.y);
  }
}

export function studyBoardSvg(board: StudyBoard) {
  const edge = goldEdgeWidth(board.height).toFixed(2);
  const texts = studyText(board).map((label) => (
    `<text x="${label.x}" y="${label.y}" fill="${label.fill}" font-family="Arial, Helvetica, sans-serif" font-size="${label.size}">${escapeXml(label.text)}</text>`
  ));
  const panels = board.panels.map((panel, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = Math.round(board.width * (STUDY_LAYOUT.frameX + column * STUDY_LAYOUT.column));
    const y = Math.round(board.height * STUDY_LAYOUT.rows[row].frame);
    const width = Math.round(board.width * STUDY_LAYOUT.frameW);
    const height = Math.round(board.height * STUDY_LAYOUT.frameH);
    return `<g id="study-${index}">
    <g fill="${GOLD}" fill-opacity="${GOLD_FILL_ALPHA}" stroke="none">${regionMarkup(panel.regions)}</g>
    <g fill="none" stroke="${GOLD}" stroke-opacity="${GOLD_EDGE_ALPHA}" stroke-width="${edge}">${regionEdgeMarkup(panel.regions)}</g>
    <g fill="none" stroke="${INK}" stroke-width="${boardLineWidth("secondary", board.height).toFixed(2)}"><path d="${rolePath(panel.lines, "secondary")}"/></g>
    <g fill="none" stroke="${INK}" stroke-width="${boardLineWidth("silhouette", board.height).toFixed(2)}"><path d="${rolePath(panel.lines, "silhouette")}"/></g>
    <g fill="none" stroke="${INK}" stroke-width="${boardLineWidth("cut", board.height).toFixed(2)}"><path d="${rolePath(panel.lines, "cut")}"/></g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${CYAN}"/>
  </g>`;
  }).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${board.width}" height="${board.height}" viewBox="0 0 ${board.width} ${board.height}">
  <rect width="100%" height="100%" fill="#000000"/>
  ${panels}
  <g id="study-labels" font-family="Arial, Helvetica, sans-serif">
    ${texts.join("\n    ")}
  </g>
</svg>`;
}

/** Block letters for a canvas that cannot draw fonts. The SVG uses live Arial text. */
export function labelGlyphs(text: string, fontSize: number) {
  const cell = fontSize / 7;
  const advance = fontSize * 0.56;
  const scaleX = advance / (cell * 6);
  const glyphs: Array<{ x: number; y: number; w: number; h: number }> = [];
  let cursor = 0;
  for (const character of text) {
    const rows = GLYPHS[character.toUpperCase()] ?? GLYPHS[character] ?? ["00000", "00000", "11111", "00000", "11111", "00000", "00000"];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === "1") glyphs.push({ x: cursor + x * cell * scaleX, y: y * cell - fontSize, w: cell * scaleX, h: cell });
      }
    });
    cursor += advance;
  }
  return glyphs;
}
