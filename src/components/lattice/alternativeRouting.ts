import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { beginGeometryValidation } from "./geometryRevision";
import { enumerateWalkableAttachments, fitLoftContact, measureSurfaceGap, SURFACE_CONTACT_TOLERANCE } from "./surfaceAttachment";
import { landingHeadroomCheck, transitionSurfaceClear, type ConnectorSurface } from "./connectionClearance";
import { captureConnectionDiagnostics } from "./connectionDiagnostics";
import { switchbackRampPath } from "./portConnectionValidation";
import { ACCESSIBLE_RAMP_SLOPE, planRun, transitionMeshes, transitionPath, transitionSections } from "./transitionGeometry";
import { validateWalkingApproach } from "./walkingApproach";

export type RoutingBudget = { attachments: number; pairs: number; routes: number; maxSpan: number; maxRun: number };
export const DEFAULT_ROUTING_BUDGET: RoutingBudget = { attachments: 64, pairs: 96, routes: 768, maxSpan: 50, maxRun: 72 };
type Anchor = ReturnType<typeof enumerateWalkableAttachments>["anchors"][number];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0]-b[0],a[1]-b[1]);

/** No global search/UI integration: explicitly evaluate one requested relationship. */
export function evaluateAlternativeRoutes(models: TileModel[], tiles: PlacedTile[], sourceId: string, targetId: string,
  existing: ConnectorSurface[], budget: RoutingBudget = DEFAULT_ROUTING_BUDGET, focus?: { targetAnchors: Anchor[] }) {
  if (!Number.isInteger(budget.pairs) || budget.pairs < 1 || budget.pairs > 512 || !Number.isInteger(budget.routes) || budget.routes < 1 || budget.routes > 4608
    || !Number.isFinite(budget.maxSpan) || budget.maxSpan <= 0 || budget.maxSpan > 60 || !Number.isFinite(budget.maxRun) || budget.maxRun <= 0 || budget.maxRun > 96) throw new Error("Invalid bounded routing budget");
  const finish = beginGeometryValidation(), started = performance.now();
  try {
    const source = tiles.find(t=>t.id===sourceId), target = tiles.find(t=>t.id===targetId);
    const ma = models.find(m=>m.id===sourceId), mb = models.find(m=>m.id===targetId);
    if (!source || !target || !ma?.connectionSurface || !mb?.connectionSurface || sourceId===targetId) throw new Error("Two distinct placed OBJ surfaces are required");
    const a = enumerateWalkableAttachments(ma,source,budget.attachments), b = enumerateWalkableAttachments(mb,target,budget.attachments);
    if(focus) {
      if(focus.targetAnchors.length>budget.attachments)throw new Error("Focused anchors exceed attachment budget");
      b.anchors=focus.targetAnchors;
    }
    const generationStart = performance.now();
    const candidates: Array<{ a: Anchor; b: Anchor; rank: number }> = [];
    let distanceRejected = 0;
    for (const aa of a.anchors) for (const bb of b.anchors) {
      const span = distance(aa.point,bb.point);
      if (span < .75 || span > budget.maxSpan) { distanceRejected++; continue; }
      const toward = [(bb.point[0]-aa.point[0])/span,(bb.point[1]-aa.point[1])/span];
      const facing = toward[0]*(aa.outward[0]-bb.outward[0])+toward[1]*(aa.outward[1]-bb.outward[1]);
      candidates.push({ a:aa,b:bb,rank: Math.abs(bb.point[2]-aa.point[2])*3 - facing*8 + span*.1 });
    }
    candidates.sort((x,y)=>x.rank-y.rank);
    // Each source region gets a turn; the budget cannot be consumed by one preferred source end.
    const sourceQueues=a.anchors.map(anchor=>candidates.filter(c=>c.a===anchor)),targetQueues=b.anchors.map(anchor=>candidates.filter(c=>c.b===anchor));
    const queues = focus ? [...targetQueues,...sourceQueues] : [...sourceQueues,...targetQueues];
    const selected: typeof candidates = [];
    const chosen=new Set<typeof candidates[number]>();
    for(let i=0; selected.length<budget.pairs && queues.some(q=>q[i]);i++) for(const q of queues) if(q[i] && !chosen.has(q[i]) && selected.length<budget.pairs) { selected.push(q[i]);chosen.add(q[i]); }
    let generationMs = performance.now()-generationStart + (generationStart-started), validationMs = 0;
    const counts: Record<string,number> = {}, cache: Record<string,number> = {};
    const outcomes: Array<{ route: string; pair: PortPair; reason: string; details?: unknown }> = [];
    const accepted: Array<{ route: string; pair: PortPair; meshes: ReturnType<typeof transitionMeshes> }> = [];
    for (const candidate of selected) {
      const begin = performance.now(), pair = makePair(sourceId,targetId,candidate.a,candidate.b);
      const alternatives = routeAlternatives(pair);
      generationMs += performance.now()-begin;
      for (const alternative of alternatives) {
        if (outcomes.length >= budget.routes) break;
        const tick = performance.now();
        const capture = captureConnectionDiagnostics(()=>validateAlternative(alternative.pair,models,tiles,existing,budget,alternative.name),1000);
        validationMs += performance.now()-tick;
        for (const [key,value] of Object.entries(capture.trace.counts)) if(key.startsWith("cache:")) cache[key]=(cache[key]??0)+value;
        const result = capture.value;
        if(result.reason==="collision or route headroom") result.reason=Object.keys(capture.trace.counts).find(key=>key.startsWith("clearance:"))?.replace("clearance: ","") ?? result.reason;
        counts[result.reason]=(counts[result.reason]??0)+1;
        outcomes.push({route:alternative.name,pair:alternative.pair,reason:result.reason,details: result.details ?? capture.trace.events.filter(e=>e.stage==="clearance")});
        if(result.reason==="accepted") accepted.push({route:alternative.name,pair:alternative.pair,meshes:transitionMeshes(alternative.pair)});
      }
      if(outcomes.length>=budget.routes) break;
    }
    return { source:{id:sourceId,filename:ma.filename,placement:source},target:{id:targetId,filename:mb.filename,placement:target},budget,
      attachments:{source:{runs:a.runs,available:a.available,retained:a.anchors.length,omitted:a.omitted},target:{runs:b.runs,available:b.available,retained:b.anchors.length,omitted:b.omitted}},
      pairs:{withinDistance:candidates.length,distanceRejected,selected:selected.length,omitted:Math.max(0,candidates.length-selected.length)},
      coverage:{sourceWindows:new Set(outcomes.map(o=>o.pair.portA)).size,targetWindows:new Set(outcomes.map(o=>o.pair.portB)).size},
      counts,cache,outcomes,accepted,timing:{generationMs,validationMs,totalMs:performance.now()-started},
      internalContinuity:"unverified" as const, accessibility:"not code-compliance verification" as const };
  } finally { finish(); }
}

function makePair(tileA: string,tileB: string,a: Anchor,b: Anchor): PortPair {
  const plan=distance(a.point,b.point), rise=b.point[2]-a.point[2];
  return {tileA,tileB,portA:a.id,portB:b.id,from:a.point,to:b.point,plan,rise,distance:Math.hypot(plan,rise),facing:0,
    widthCompatibility:Math.min(a.width,b.width)/Math.max(a.width,b.width),usableWidth:Math.min(a.width,b.width),confidence:0,score:0,
    startWidth:a.width,endWidth:b.width,startDirection:a.outward,endDirection:b.outward,startProfile:a.run,endProfile:b.run,
    connectionClass:Math.abs(rise)/plan>1/20?"VERTICAL":"ADAPTIVE"};
}
export function routeAlternatives(original: PortPair) {
  const definitions: Array<[string,Vec3[]]> = [
    ["direct",[original.from,original.to]], ["curved",transitionPath(original,0)],
    ["left detour",transitionPath(original,4)], ["right detour",transitionPath(original,-4)],
    ["left bridge alignment",transitionPath(original,8)], ["right bridge alignment",transitionPath(original,-8)],
    ["left switchback",switchbackRampPath(original.from,original.to,8)], ["right switchback",switchbackRampPath(original.from,original.to,-8)],
  ];
  return definitions.map(([name,path])=>{
    path[0]=original.from;path[path.length-1]=original.to;
    return {name,pair:{...original,path,startProfile:original.startProfile?.map(p=>[...p]) as [Vec3,Vec3],endProfile:original.endProfile?.map(p=>[...p]) as [Vec3,Vec3]}};
  });
}

/** Additional opt-in checks; legacy thresholds/classification are not changed. */
export function validateAlternative(pair: PortPair,models: TileModel[],tiles: PlacedTile[],existing: ConnectorSurface[],budget: RoutingBudget, routeName = "") {
  const fail = (reason: string,details?: unknown) => ({reason,details});
  if(!pair.path || pair.path.length<2 || pair.path.some(p=>p.some(v=>!Number.isFinite(v)))) return fail("invalid route path");
  if(Math.hypot(...pair.path[0].map((v,i)=>v-pair.from[i]))>1e-6 || Math.hypot(...pair.path.at(-1)!.map((v,i)=>v-pair.to[i]))>1e-6 || Math.abs(pair.to[2]-pair.from[2]-pair.rise)>1e-6) return fail("route endpoint discontinuity");
  if (!fitLoftContact(pair,models,tiles,false)) return fail("surface attachment");
  const path=pair.path??[],run=planRun(path);
  if(run>budget.maxRun || path.length<2) return fail("route run limit");
  const sections=transitionSections(pair);
  if(sections.some(s=>s.width<2-1e-6)) return fail("usable width");
  if(routeName.includes("switchback") && Math.abs(pair.rise)>.02) {
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
  if(meshes.some(mesh=>Array.from(mesh.positions).some((v,i)=>i%3!==2 && (v< -10 || v>70)))) return fail("outside fixed lattice footprint");
  if(stair) {
    // Inspect actual emitted tread/riser vertices, including left and right walking edges.
    for(const mesh of meshes) {
      const at=(i:number)=>Array.from(mesh.positions.slice(i*3,i*3+3)) as Vec3;
      for(const side of [0,1]) {
        const a=at(side),b=at(4+side),c=at(8+side);
        if(Math.abs(c[2]-b[2])>.6+1e-6 || Math.abs(c[2]-b[2])<1e-5) return fail("stair riser");
        if(distance(a,b)<.75 || Math.abs(a[2]-b[2])>.02) return fail("stair tread");
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
  for(const [id,point,direction,width] of [[pair.tileA,pair.from,pair.startDirection,pair.startWidth],[pair.tileB,pair.to,pair.endDirection,pair.endWidth]] as const) {
    const model=models.find(m=>m.id===id),tile=tiles.find(t=>t.id===id);
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
  }
  if(!transitionSurfaceClear(pair,tiles,models,existing)) return fail("collision or route headroom");
  const headroom=landingHeadroomCheck(landingPoints,tiles,models,existing);
  if(!headroom.clear) return fail("landing headroom",headroom);
  // Return the geometry just validated; caller regenerates via the same immutable pair.
  return fail("accepted",{kind:meshes[0]?.kind,run,stairSteps:stair?meshes.length:0});
}
