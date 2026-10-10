import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { transitionPath, planRun, maxPlanSlope, ACCESSIBLE_RAMP_SLOPE, LEVEL_SLOPE, MAX_SWITCHBACK_OFFSET, transitionMeshes, transitionSections } from "./transitionGeometry";
import { landingHeadroomCheck, transitionSurfaceClear, type ConnectorSurface } from "./connectionClearance";
import { validateWalkingApproach } from "./walkingApproach";
import { fitLoftContact, localPoint, measureSurfaceGap, measureFlushWalkingInterface, SURFACE_CONTACT_TOLERANCE } from "./surfaceAttachment";

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

/** Shared circulation gate. It validates the unchanged emitted mesh and existing original-floor approaches. */
export function validateCirculationConnection(pair: PortPair,models: TileModel[],tiles: PlacedTile[],existing: ConnectorSurface[],options: {maxRun?:number;fixedFootprint?:boolean;routeName?:string} = {}) {
  const routeName=options.routeName??"",distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const fail = (reason: string,details?: unknown) => ({reason,details});
  if(!pair.path || pair.path.length<2 || pair.path.some(p=>p.some(v=>!Number.isFinite(v)))) return fail("invalid route path");
  if(Math.hypot(...pair.path[0].map((v,i)=>v-pair.from[i]))>1e-6 || Math.hypot(...pair.path.at(-1)!.map((v,i)=>v-pair.to[i]))>1e-6 || Math.abs(pair.to[2]-pair.from[2]-pair.rise)>1e-6) return fail("route endpoint discontinuity");
  if(Math.min(pair.startWidth??pair.usableWidth,pair.endWidth??pair.usableWidth)<2)return fail("usable width");
  if (!fitLoftContact(pair,models,tiles,false)) return fail("surface attachment");
  const path=pair.path??[],run=planRun(path);
  if(run>(options.maxRun??Infinity) || path.length<2) return fail("route run limit");
  const sections=transitionSections(pair);
  if(sections.some(s=>s.width<2-1e-6)) return fail("usable width");
  const interiorLanding=path.slice(1,-1).some((point,index,interior)=>index>0 && Math.abs(point[2]-interior[index-1][2])<1e-6);
  if((routeName.includes("switchback") || interiorLanding) && Math.abs(pair.rise)>.02) {
    let flatRun=0,maxFlatRun=0;
    for(let i=1;i<path.length;i++) {
      flatRun=Math.abs(path[i][2]-path[i-1][2])<1e-6?flatRun+distance(path[i],path[i-1]):0;
      maxFlatRun=Math.max(maxFlatRun,flatRun);
    }
    if(maxFlatRun+1e-6<Math.max(3,...sections.map(s=>s.width))) return fail("switchback landing length",{maxFlatRun});
  }
  // A folded ribbon cannot represent continuous forward travel, even if its centreline clears obstacles.
  for(let i=1;i<sections.length;i++) {
    const a=sections[i-1],b=sections[i],dx=b.center[0]-a.center[0],dy=b.center[1]-a.center[1];
    if(dx*a.side[1]-dy*a.side[0]<=1e-6 || dx*b.side[1]-dy*b.side[0]<=1e-6) return fail("folded or reversed section");
  }
  const left=sections.map(s=>s.center.map((v,k)=>v-s.side[k]*s.width/2) as Vec3);
  const right=sections.map(s=>s.center.map((v,k)=>v+s.side[k]*s.width/2) as Vec3);
  const orient=(a:Vec3,b:Vec3,c:Vec3)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const first of [left,right]) for(const second of [left,right]) for(let i=1;i<first.length;i++) for(let j=i+2;j<second.length;j++) {
    if(orient(first[i-1],first[i],second[j-1])*orient(first[i-1],first[i],second[j])<0 && orient(second[j-1],second[j],first[i-1])*orient(second[j-1],second[j],first[i])<0) return fail("self-intersecting ribbon");
  }
  const meshes=transitionMeshes(pair),stair=meshes[0]?.kind==="stair";
  if(meshes.some(mesh=>Array.from(mesh.positions).some(v=>!Number.isFinite(v)))) return fail("nonfinite emitted geometry");
  // Bays are centered at 0,20,40,60 ft, consistent with the rendered root transforms.
  if(options.fixedFootprint && meshes.some(mesh=>Array.from(mesh.positions).some((v,i)=>i%3!==2 && (v< -10 || v>70)))) return fail("outside fixed lattice footprint");
  if(stair) {
    // Inspect actual emitted tread/riser vertices, including left and right walking edges.
    for(const mesh of meshes) {
      const at=(i:number)=>Array.from(mesh.positions.slice(i*3,i*3+3)) as Vec3;
      for(const side of [0,1]) {
        const a=at(side),b=at(4+side),c=at(8+side);
        const treadA=pair.rise>0?b:a,treadB=pair.rise>0?c:b,riserA=pair.rise>0?a:b,riserB=pair.rise>0?b:c;
        if(Math.abs(riserB[2]-riserA[2])>.6+1e-6 || Math.abs(riserB[2]-riserA[2])<1e-5) return fail("stair riser");
        if(distance(treadA,treadB)<.75 || Math.abs(treadA[2]-treadB[2])>.02) return fail("stair tread");
      }
      if(Math.abs(at(0)[2]-at(1)[2])>.02) return fail("stair cross slope");
    }
  } else {
    // Every segment, including short samples and both ribbon edges; never average-only slope.
    for(const edge of [left,right,path]) for(let i=1;i<edge.length;i++) {
      const span=distance(edge[i-1],edge[i]),rise=Math.abs(edge[i][2]-edge[i-1][2]);
      if(rise>ACCESSIBLE_RAMP_SLOPE*span+1e-6) return fail("individual ramp segment slope");
    }
    if(sections.some(s=>Math.abs(s.side[2])>1/48)) return fail("walking cross slope");
  }
  // Landing/support probes lie behind each outward edge, on the original source surface.
  const landingPoints:Vec3[]=[];
  const interfaces=[];
  for(const [id,point,direction,width] of [[pair.tileA,pair.from,pair.startDirection,pair.startWidth],[pair.tileB,pair.to,pair.endDirection,pair.endWidth]] as const) {
    const model=models.find(m=>m.id===id||m.id===id.split("::")[0]),tile=tiles.find(t=>t.id===id);
    if(!model||!tile||!direction||!width) return fail("missing landing interface");
    const depth=stair?Math.max(3,width):2;
    for(let d=0;d<=depth;d+=.5) for(let s=-1;s<=1;s+=.5) {
      const p:Vec3=[point[0]-direction[0]*d-direction[1]*width*.5*s,point[1]-direction[1]*d+direction[0]*width*.5*s,point[2]];
      const gap=measureSurfaceGap(model,tile,p,1,SURFACE_CONTACT_TOLERANCE);
      if(gap.distance>SURFACE_CONTACT_TOLERANCE || !["edge","floor"].includes(gap.kind)) return fail(stair?"stair landing support":"walking approach support",{id,point:p,gap});
      landingPoints.push(p);
    }
    const approach=validateWalkingApproach(model,tile,point,direction,width,depth,models,tiles,existing,stair);
    if(!approach.valid)return fail("continuous approach: "+approach.reason,{id,...approach.details as object});
    const section=id===pair.tileA?sections[0]:sections.at(-1)!;
    const edge=([-1,1] as const).map(sign=>section.center.map((v,k)=>v+section.side[k]*section.width*.5*sign) as Vec3) as [Vec3,Vec3];
    // Inspect the actual Float32 emitted top edge, not just a nearby route centre.
    const mesh=id===pair.tileA?meshes[0]:meshes.at(-1)!;
    const offset=id===pair.tileA?0:mesh.positions.length-12;
    const emitted=[Array.from(mesh.positions.slice(offset,offset+3)),Array.from(mesh.positions.slice(offset+3,offset+6))] as [Vec3,Vec3];
    const integration=measureFlushWalkingInterface(model,tile,emitted);
    if(!integration.valid)return fail("flush interface: "+integration.reason,{id,...integration});
    const localStart=localPoint(point,tile,model),localEnd=localPoint(point.map((v,k)=>v+direction[k]) as Vec3,tile,model);
    const localDirection=localEnd.map((v,k)=>v-localStart[k]);
    const sourceSlopes=integration.segments.map(segment=>-(segment.normal[0]*localDirection[0]+segment.normal[1]*localDirection[1])/segment.normal[2]);
    const neighbor=id===pair.tileA?path[1]:path.at(-2)!;
    const routeSlope=(neighbor[2]-point[2])/Math.hypot(neighbor[0]-point[0],neighbor[1]-point[1]);
    interfaces.push({id,edge,emitted,approach,section:integration,sourceOutwardSlopes:sourceSlopes,connectorOutwardSlope:stair?null:routeSlope,slopeMismatch:stair?null:Math.max(...sourceSlopes.map(s=>Math.abs(s-routeSlope))),tangentContinuity:stair?"intentional stair riser": "positional continuity verified; tangent equality not required"});
  }
  if(!transitionSurfaceClear(pair,tiles,models,existing)) return fail("collision or route headroom");
  // The route clearance helper checks original-form headroom, but existing connector
  // surfaces there are tested only for body intersections. Reuse its standing-height
  // validator at actual tread/section walking elevations for overhead connectors too.
  const walkingPoints:Vec3[]=stair
    ? meshes.flatMap(mesh=>(pair.rise>0?[4,5,8,9]:[0,1,4,5]).map(index=>Array.from(mesh.positions.slice(index*3,index*3+3)) as Vec3))
    : [...path,...left,...right];
  const connectorHeadroom=landingHeadroomCheck(walkingPoints,tiles,models,existing);
  if(!connectorHeadroom.clear)return fail("connector route headroom",connectorHeadroom);
  const headroom=landingHeadroomCheck(landingPoints,tiles,models,existing);
  if(!headroom.clear) return fail("landing headroom",headroom);
  // Return the geometry just validated; caller regenerates via the same immutable pair.
  return fail("accepted",{kind:meshes[0]?.kind,run,stairSteps:stair?meshes.length:0,interfaces,internalContinuity:"local approach validated; wider original-form circulation unverified"});
}
