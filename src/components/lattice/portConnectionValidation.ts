import type { PlacedTile, PortPair, TileModel } from "./types";
import { transitionPath, planRun, maxPlanSlope, ACCESSIBLE_RAMP_SLOPE, LEVEL_SLOPE, MAX_SWITCHBACK_OFFSET } from "./transitionGeometry";
import { fitLoftContact, measureSurfaceGap, SURFACE_CONTACT_TOLERANCE } from "./surfaceAttachment";

/** The existing Stage 1 port geometry, prepared before it may reserve a port or join the graph. */
export function preparePortConnection(original: PortPair): PortPair {
  const pair = neckForLoft({...original, connectionClass: original.connectionClass ?? (Math.abs(original.rise) > 0.5 ? "VERTICAL" : original.plan <= 4 ? "DIRECT" : "ADAPTIVE")});
  const routedBend = pathBend(original.path, original.from, original.to);
  pair.path = pair.connectionClass === "VERTICAL" && Math.abs(routedBend) > 6 ? switchbackRampPath(pair.from, pair.to, routedBend) : transitionPath(pair, routedBend);
  return pair;
}

export function portAttachmentMeets(pair: PortPair, models: TileModel[], tiles: PlacedTile[]) {
  for (const [id, point] of [[pair.tileA, pair.from], [pair.tileB, pair.to]] as const) {
    const tile = tiles.find(item => item.id === id);
    const model = models.find(item => item.id === id || item.id === id.split("::")[0]);
    if (!tile || !model?.connectionSurface) return false;
    const gap = measureSurfaceGap(model, tile, point, 2);
    // Stage 1 explicit ports may meet walls; organic links still require walkable floor/edge contact.
    if (gap.distance > SURFACE_CONTACT_TOLERANCE || !["floor", "edge", "wall"].includes(gap.kind)) return false;
  }
  return fitLoftContact(pair, models, tiles, true);
}

/** A plate or ramp must earn that class from the path slope. A steep short span is not level. */
export function acceptCirculationClass(pair: PortPair) {
  const path = pair.path ?? [];
  const run = planRun(path);
  const rise = pair.rise;
  const slope = Math.abs(rise) / Math.max(run, 0.25);
  const local = maxPlanSlope(path);
  const stair = pair.connectionClass === "VERTICAL" && run + 1e-3 < Math.abs(rise) * 12;
  if (stair) return !(run > 16 && slope < 0.15);
  if (local > ACCESSIBLE_RAMP_SLOPE + 0.03 || slope > ACCESSIBLE_RAMP_SLOPE + 1e-3) {
    const absRise = Math.abs(rise);
    const stairRun = Math.max(2, absRise * 0.4);
    if (absRise <= 12 && run >= stairRun) {
      pair.connectionClass = "VERTICAL";
      return true;
    }
    return false;
  }
  if (pair.connectionClass !== "VERTICAL" && slope > LEVEL_SLOPE + 1e-6) pair.connectionClass = "VERTICAL";
  return true;
}

/** A coincident shared face has no span for a bezier. Pull the loft ends a short shoulder apart without moving the source mesh. */
function neckForLoft(pair: PortPair): PortPair {
  const plan = Math.hypot(pair.to[0] - pair.from[0], pair.to[1] - pair.from[1]);
  if (plan >= 0.75) return pair;
  const dx = pair.to[0] - pair.from[0];
  const dy = pair.to[1] - pair.from[1];
  const ux = plan > 0.05 ? dx / plan : pair.startDirection?.[0] ?? 1;
  const uy = plan > 0.05 ? dy / plan : pair.startDirection?.[1] ?? 0;
  const length = Math.hypot(ux, uy) || 1;
  const sx = ux / length;
  const sy = uy / length;
  const shoulder = 0.9;
  const from: [number, number, number] = [pair.from[0] - sx * shoulder, pair.from[1] - sy * shoulder, pair.from[2]];
  const to: [number, number, number] = [pair.to[0] + sx * shoulder, pair.to[1] + sy * shoulder, pair.to[2]];
  const nextPlan = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const rise = to[2] - from[2];
  return {
    ...pair,
    from,
    to,
    plan: nextPlan,
    rise,
    distance: Math.hypot(nextPlan, rise),
    startDirection: pair.startDirection ?? [sx, sy, 0],
    endDirection: pair.endDirection ?? [-sx, -sy, 0],
  };
}

function pathBend(path: Array<[number, number, number]> | undefined, from: [number, number, number], to: [number, number, number]) {
  if (!path || path.length < 3) return 0;
  const mid = path[Math.floor(path.length / 2)];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy) || 1;
  const sx = dx / plan;
  const sy = dy / plan;
  return (mid[0] - (from[0] + to[0]) / 2) * -sy + (mid[1] - (from[1] + to[1]) / 2) * sx;
}

function samplePolyline(points: Array<[number, number, number]>, spacing: number) {
  const out: Array<[number, number, number]> = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      out.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, start[2] + (end[2] - start[2]) * t]);
    }
  }
  return out;
}

function buildSwitchback(from: [number, number, number], to: [number, number, number], bend: number) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy) || 1;
  const ux = dx / plan;
  const uy = dy / plan;
  const rise = to[2] - from[2];
  const landing = Math.min(4, Math.max(2, (Math.abs(rise) / ACCESSIBLE_RAMP_SLOPE) * 0.12));
  const midX = (from[0] + to[0]) / 2 - uy * bend;
  const midY = (from[1] + to[1]) / 2 + ux * bend;
  const landingZ = from[2] + rise * 0.5;
  const landA: [number, number, number] = [midX - ux * landing / 2, midY - uy * landing / 2, landingZ];
  const landB: [number, number, number] = [midX + ux * landing / 2, midY + uy * landing / 2, landingZ];
  return samplePolyline([from, landA, landB, to], 0.75);
}

/** Lengthen a steep gap into a 1:12 ramp with a level landing. Endpoints stay on their own surface elevations. */
export function switchbackRampPath(from: [number, number, number], to: [number, number, number], bend: number) {
  const sign = Math.sign(bend) || 1;
  const required = Math.abs(to[2] - from[2]) / ACCESSIBLE_RAMP_SLOPE;
  let offset = Math.max(0.5, Math.abs(bend));
  let path = buildSwitchback(from, to, sign * offset);
  while (planRun(path) + 1e-3 < required && offset < MAX_SWITCHBACK_OFFSET) {
    offset = Math.min(MAX_SWITCHBACK_OFFSET, offset + 0.5);
    path = buildSwitchback(from, to, sign * offset);
  }
  return path;
}
