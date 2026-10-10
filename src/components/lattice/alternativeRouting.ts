import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { beginGeometryValidation } from "./geometryRevision";
import { enumerateWalkableAttachments, fitLoftContact } from "./surfaceAttachment";
import { transitionSurfaceClear, type ConnectorSurface } from "./connectionClearance";
import { captureConnectionDiagnostics } from "./connectionDiagnostics";
import { switchbackRampPath, validateCirculationConnection } from "./portConnectionValidation";
import { ACCESSIBLE_RAMP_SLOPE, planRun, transitionPath, transitionMeshes } from "./transitionGeometry";
import { discoverInteriorApproaches, type ApproachAnchor, type QualifiedApproach } from "./interiorApproaches";

export type RoutingBudget = { attachments: number; pairs: number; routes: number; maxSpan: number; maxRun: number };
export const DEFAULT_ROUTING_BUDGET: RoutingBudget = { attachments: 64, pairs: 96, routes: 768, maxSpan: 50, maxRun: 72 };
type Anchor = ReturnType<typeof enumerateWalkableAttachments>["anchors"][number];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0]-b[0],a[1]-b[1]);

/** Qualified, bounded opt-in workflow. The legacy raw proposal evaluator below
 * remains available for exact diagnostic replay; global placement is untouched. */
export function evaluateQualifiedInteriorRoutes(models:TileModel[],tiles:PlacedTile[],sourceId:string,targetId:string,targets:ApproachAnchor[],
  existing:ConnectorSurface[]=[],budget:RoutingBudget=DEFAULT_ROUTING_BUDGET,windows=256) {
  if(!Number.isInteger(budget.pairs)||budget.pairs<1||budget.pairs>512||!Number.isInteger(budget.routes)||budget.routes<1||budget.routes>4608
    ||!Number.isFinite(budget.maxSpan)||budget.maxSpan<=0||budget.maxSpan>60||!Number.isFinite(budget.maxRun)||budget.maxRun<=0||budget.maxRun>96||targets.length>8)throw new Error("Invalid qualified routing budget");
  const finish=beginGeometryValidation(),start=performance.now();
  try {
    const source=tiles.find(t=>t.id===sourceId),target=tiles.find(t=>t.id===targetId),ma=models.find(m=>m.id===sourceId),mb=models.find(m=>m.id===targetId);
    if(!source||!target||!ma||!mb||sourceId===targetId)throw new Error("Two distinct placed OBJ forms required");
    const destination=discoverInteriorApproaches(mb,target,models,tiles,existing,{windows:Math.max(1,targets.length),anchors:targets});
    const discovery=discoverInteriorApproaches(ma,source,models,tiles,existing,{windows,targets:targets.map(t=>t.point)});
    type Candidate={pair:PortPair; source:QualifiedApproach; destination:QualifiedApproach; targetIndex:number; selected:boolean};
    const pairs:Candidate[]=[],preconstruction:Array<{pair?:PortPair; stage:string; reason:string; details?:unknown}>=[];
    for(const o of discovery.outcomes)if(o.stage!=="QUALIFIED_WALKING_OPENING")preconstruction.push({stage:o.stage,reason:o.reason,details:o});
    for(const o of destination.outcomes)if(o.stage!=="QUALIFIED_WALKING_OPENING")preconstruction.push({stage:o.stage==="B_NO_OPENING"?o.stage:"C_NO_DESTINATION_APPROACH",reason:o.reason,details:o});
    for(const a of discovery.qualified)for(const b of destination.qualified){
      const pair=makePair(sourceId,targetId,a.anchor,b.anchor);
      if(pair.plan<.75||pair.plan>budget.maxSpan){preconstruction.push({pair,stage:"D_ROUTE_FEASIBILITY",reason:"span outside bounded route family"});continue;}
      if(!fitLoftContact(pair,models,tiles,false)){preconstruction.push({pair,stage:"B_NO_OPENING",reason:"attachment profile fails Stage 1 surface contact"});continue;}
      if(Math.abs(pair.rise)>budget.maxRun*ACCESSIBLE_RAMP_SLOPE+1e-6&&(!a.landing.valid||!b.landing.valid)){
        preconstruction.push({pair,stage:"G_ARCHITECTURAL_REQUIREMENTS",reason:"ramp requires more than bounded run; stair landing is invalid",details:{requiredRampRun:Math.abs(pair.rise)/ACCESSIBLE_RAMP_SLOPE,maxRun:budget.maxRun,sourceLanding:a.landing,destinationLanding:b.landing}});continue;
      }
      // Opening clearance is already a full-width swept throat, not a centre
      // point probe. A blocked straight chord does not eliminate possible detours.
      pairs.push({pair,source:a,destination:b,targetIndex:targets.findIndex(t=>t.id===b.anchor.id),selected:false});
    }
    const queues=targets.map((_,i)=>pairs.filter(p=>p.targetIndex===i).sort((a,b)=>Math.abs(a.pair.rise)-Math.abs(b.pair.rise)||a.pair.plan-b.pair.plan||a.pair.portA.localeCompare(b.pair.portA)));
    const selected:Candidate[]=[];
    for(let i=0;selected.length<budget.pairs&&queues.some(q=>q[i]);i++)for(const q of queues)if(q[i]&&selected.length<budget.pairs){q[i].selected=true;selected.push(q[i]);}
    const outcomes:Array<{pair:PortPair;route:string;stage:string;reason:string;details?:unknown;constructed:boolean;independentEmittedClearance?:boolean;clearanceEvidence?:unknown}>=[];
    const accepted:Array<{pair:PortPair;route:string;meshes:ReturnType<typeof transitionMeshes>}>=[];
    let constructionMs=0;
    for(const candidate of selected){
      if(outcomes.length>=budget.routes)break;
      for(const alternative of routeAlternatives(candidate.pair)){
        if(outcomes.length>=budget.routes)break;
        const pair=alternative.pair,path=pair.path!,run=planRun(path);
        const reject=(stage:string,reason:string,details?:unknown)=>outcomes.push({pair,route:alternative.name,stage,reason,details,constructed:false});
        if(run>budget.maxRun){reject("D_ROUTE_FEASIBILITY","route run limit");continue;}
        const startStep=[path[1][0]-path[0][0],path[1][1]-path[0][1]],n=path.length-1,endStep=[path[n-1][0]-path[n][0],path[n-1][1]-path[n][1]];
        if(startStep[0]*pair.startDirection![0]+startStep[1]*pair.startDirection![1]<=1e-6||endStep[0]*pair.endDirection![0]+endStep[1]*pair.endDirection![1]<=1e-6){reject("D_ROUTE_FEASIBILITY","path reverses through opening interface");continue;}
        const stair=pair.connectionClass==="VERTICAL"&&run<Math.abs(pair.rise)*12;
        if(stair&&(!candidate.source.landing.valid||!candidate.destination.landing.valid)){reject("G_ARCHITECTURAL_REQUIREMENTS","stair landing lacks continuous flat support",{source:candidate.source.landing,destination:candidate.destination.landing});continue;}
        if(!stair&&path.slice(1).some((p,i)=>Math.abs(p[2]-path[i][2])>ACCESSIBLE_RAMP_SLOPE*distance(p,path[i])+1e-6)){reject("D_ROUTE_FEASIBILITY","centreline exceeds individual ramp segment slope");continue;}
        const tick=performance.now(),capture=captureConnectionDiagnostics(()=>validateAlternative(pair,models,tiles,existing,budget,alternative.name),100);
        const value=capture.value;
        const clearance=Object.keys(capture.trace.counts).find(k=>k.startsWith("clearance:"))?.replace("clearance: ","");
        const reason=value.reason==="collision or route headroom"?clearance??value.reason:value.reason;
        const stage=reason==="accepted"?"ACCEPTED":reason.includes("collision")?"F_ORIGINAL_GEOMETRY_COLLISION":reason.includes("headroom")||reason.includes("landing")||reason.includes("usable width")?"G_ARCHITECTURAL_REQUIREMENTS":"E_CONNECTOR_CONSTRUCTION";
        // A construction first failure is not proof that repairing construction
        // would suffice. Independently inspect that emitted geometry's clearance.
        const independent=stage==="E_CONNECTOR_CONSTRUCTION"?captureConnectionDiagnostics(()=>transitionSurfaceClear(pair,tiles,models,existing),16):undefined;
        outcomes.push({pair,route:alternative.name,stage,reason,details:value.details,constructed:true,independentEmittedClearance:independent?.value,
          clearanceEvidence:(independent??capture).trace.events.filter(e=>e.stage==="clearance")});
        if(reason==="accepted")accepted.push({pair,route:alternative.name,meshes:transitionMeshes(pair)});
        constructionMs+=performance.now()-tick;
      }
    }
    return {source:{id:sourceId,filename:ma.filename,placement:source},target:{id:targetId,filename:mb.filename,placement:target},budget,discovery,destination,
      qualifiedPairs:pairs,preconstruction,outcomes,accepted,omittedPairs:pairs.filter(p=>!p.selected).length,
      untestedSelectedPairs:selected.filter(p=>!outcomes.some(o=>o.pair.portA===p.pair.portA&&o.pair.portB===p.pair.portB)).length,
      timing:{discoveryMs:discovery.ms+destination.ms,constructionMs,totalMs:performance.now()-start},
      representation:"existing interior floor to verified opening, then emitted external connector",accessibility:"not code-compliance verification"};
  } finally {finish();}
}

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

/** Opt-in routing retains its bounded footprint and run policy; circulation checks are shared. */
export function validateAlternative(pair: PortPair,models: TileModel[],tiles: PlacedTile[],existing: ConnectorSurface[],budget: RoutingBudget, routeName = "") {
  return validateCirculationConnection(pair,models,tiles,existing,{maxRun:budget.maxRun,fixedFootprint:true,routeName});
}
