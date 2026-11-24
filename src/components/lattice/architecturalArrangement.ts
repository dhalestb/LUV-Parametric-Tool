import type { LatticeField, Mirror, PlacedTile, PortPair, TileModel } from "./types";
import { architecturalHierarchy, architecturalInterface, architecturalSurfaces, placedArchitecturalSurfaces } from "./architecturalSurfaces";
import { evaluateAlternativeRoutes } from "./alternativeRouting";
import { initializeExtensionReconstruction, originalPlacementMaterial } from "./extensionReconstruction";
import { validateCirculationConnection } from "./portConnectionValidation";
import { transitionMeshes, pathLength } from "./transitionGeometry";
import { synthesizeConnectors } from "./connectionSynthesis";
import type { ConnectorSurface } from "./connectionClearance";
import { originalWalkingCorridor } from "./architecturalNetwork";
import { enumerateWalkableAttachments } from "./surfaceAttachment";
import { beginGeometryValidation } from "./geometryRevision";
import { isBranchInterface, branchSectionAnchors } from "./branchAdaptation";
import { sideAdjacentRegistration } from "./adjacentConnections";

export type ArchitecturalPreferences={branchRelationships:number;lowerBranches:number;alignment:number;rhythm:number;hierarchy:number;coherence:number;connectorEconomy:number};
export const DEFAULT_ARCHITECTURAL_PREFERENCES:ArchitecturalPreferences={branchRelationships:4,lowerBranches:2,alignment:2,rhythm:1,hierarchy:1,coherence:4,connectorEconomy:1};
export type ArchitecturalBudget={proposals:number;arrangements:number;attachments:number;routes:number;milliseconds:number};
export const DEFAULT_ARCHITECTURAL_BUDGET:ArchitecturalBudget={proposals:96,arrangements:8,attachments:128,routes:256,milliseconds:120000};
type Synthesis=ReturnType<typeof synthesizeConnectors>;
type Packing=ReturnType<typeof originalPlacementMaterial>;
export type ArchitecturalCandidate={id:string;tiles:PlacedTile[];preliminaryScore:number;score:number;packing:Packing;formComponents:number;
  status:"REVIEW"|"REJECTED";synthesis:Synthesis;selected:Array<{pair:PortPair;sourceRole:string;targetRole:string;importance:number}>;
  deferred:Array<{reason:string;source:string;target:string}>;rejections:Record<string,number>;regions:Array<{sourceId:string;region:number;role:string;elevation:number;connected:boolean}>;
  interfaceNetwork:{islands:number;internalCirculation:"UNVERIFIED";verifiedInternalLinks:Array<{source:string;from:string;to:string;evidence:ReturnType<typeof originalWalkingCorridor>}>};testedRoutes:number;screening:unknown[]};
export type ArchitecturalStudy={preferences:ArchitecturalPreferences;budget:ArchitecturalBudget;generated:number;evaluated:number;routes:number;
  arrangements:ArchitecturalCandidate[];features:ReturnType<typeof architecturalSurfaces>[];incomplete:boolean;stopReason?:string;durationMs:number;setupMs:number;method:string;
  execution?:{environment:"browser module worker";sourcePreservation:"VERIFIED";interrupted:boolean}};
const key=(tiles:PlacedTile[])=>tiles.map(t=>JSON.stringify([t.id,t.ix,t.iy,t.iz,t.variant,t.zLift??0])).sort().join('|');
export const architecturalPlacementKey=key;
export function rankArchitecturalCandidates(arrangements:ArchitecturalCandidate[]){
  return arrangements.slice().sort((a,b)=>(a.packing.status==="REJECTED"?1:0)-(b.packing.status==="REJECTED"?1:0)||(a.packing.status==="UNVERIFIED"?1:0)-(b.packing.status==="UNVERIFIED"?1:0)||a.formComponents-b.formComponents||a.interfaceNetwork.islands-b.interfaceNetwork.islands||b.score-a.score);
}
function roleValue(role:string){return role==="projecting branch"?2:role==="inclined surface"?1:0;}
function interfaceValue(model:TileModel,tile:PlacedTile,point:PortPair["from"],prefs:ArchitecturalPreferences){
  const r=architecturalInterface(model,tile,point);if(!r)return 0;
  return roleValue(r.role)*prefs.branchRelationships+(r.role==="projecting branch"?(1-r.relativeElevation)*prefs.lowerBranches:0)+architecturalHierarchy(r)*prefs.hierarchy;
}
function rhythm(tiles:PlacedTile[]){
  const gaps=tiles.map((a,i)=>Math.min(...tiles.filter((_,j)=>j!==i).map(b=>Math.hypot(a.ix-b.ix,a.iy-b.iy))));
  const mean=gaps.reduce((s,v)=>s+v,0)/gaps.length;
  return 1/(1+Math.sqrt(gaps.reduce((s,v)=>s+(v-mean)**2,0)/gaps.length)/Math.max(mean,1e-9));
}
function preliminary(models:TileModel[],tiles:PlacedTile[],prefs:ArchitecturalPreferences){
  const features=models.map(m=>placedArchitecturalSurfaces(m,tiles.find(t=>t.id===m.id)!));let value=0;
  for(let i=0;i<features.length;i++)for(let j=i+1;j<features.length;j++){
    let best=-100;
    for(const a of features[i])for(const b of features[j]){
      const dx=b.centroid[0]-a.centroid[0],dy=b.centroid[1]-a.centroid[1],span=Math.hypot(dx,dy);if(span<.75||span>60)continue;
      const aligned=(Math.abs((a.majorDirection[0]*dx+a.majorDirection[1]*dy)/span)+Math.abs((b.majorDirection[0]*dx+b.majorDirection[1]*dy)/span))/2;
      const branches=roleValue(a.role)+roleValue(b.role),lower=(a.role==="projecting branch"?1-a.relativeElevation:0)+(b.role==="projecting branch"?1-b.relativeElevation:0);
      const hierarchy=architecturalHierarchy(a)+architecturalHierarchy(b);
      best=Math.max(best,branches*prefs.branchRelationships+lower*prefs.lowerBranches+hierarchy*prefs.hierarchy+aligned*prefs.alignment-Math.abs(a.centroid[2]-b.centroid[2])*.5-span*.025);
    }
    value+=best;
  }
  return value+rhythm(tiles)*prefs.rhythm;
}
/** Reserve a comparison for economical floor openings when the preferred
 * branch hypothesis is not representable. These are unvalidated forecasts. */
function floorForecast(models:TileModel[],tiles:PlacedTile[]){
  const anchors=models.map((m,i)=>enumerateWalkableAttachments(m,tiles[i],32).anchors.filter(a=>architecturalInterface(m,tiles[i],a.point)?.role==="floor plate"));
  let cost=Infinity;
  for(let i=0;i<anchors.length;i++)for(let j=i+1;j<anchors.length;j++)for(const a of anchors[i])for(const b of anchors[j]){
    const dx=b.point[0]-a.point[0],dy=b.point[1]-a.point[1],span=Math.hypot(dx,dy);if(span<.75||span>50)continue;
    const fa=(dx*a.outward[0]+dy*a.outward[1])/span,fb=-(dx*b.outward[0]+dy*b.outward[1])/span;
    if(fa<=0||fb<=0)continue;cost=Math.min(cost,span+Math.abs(b.point[2]-a.point[2])*12+(2-fa-fb)*8);
  }
  return cost;
}
/** Deterministic bounded neighborhood. Sources remain unchanged; all rotations
 * and mirrors come from their existing instance-variant tables. */
export function architecturalProposals(models:TileModel[],seeds:PlacedTile[],field:LatticeField,limit:number,mirrors:Mirror[]=["none","x","y"],priority?:(tiles:PlacedTile[])=>number){
  if(models.length<2||models.length>8||models.some(m=>!m.connectionSurface)||new Set(models.map(m=>m.id)).size!==models.length)throw new Error("Architectural study requires 2–8 distinct imported instances");
  if(![field.cellsX,field.cellsY,field.cellsZ].every(n=>Number.isInteger(n)&&n>=1)||field.cellsX*field.cellsY<models.length||field.cellsZ!==1)throw new Error("Use a single-level lattice with enough cells");
  if(!Number.isInteger(limit)||limit<2||limit>512||!mirrors.length)throw new Error("Invalid bounded proposal/transform policy");
  const used=new Set<string>();
  const baseline:PlacedTile[]=models.map((m,i)=>{const old=seeds.find(t=>t.id===m.id);let ix=old?.ix??i%field.cellsX,iy=old?.iy??Math.floor(i/field.cellsX);
    if(ix<0||iy<0||ix>=field.cellsX||iy>=field.cellsY||used.has(`${ix},${iy}`)){let cell=0;while(used.has(`${cell%field.cellsX},${Math.floor(cell/field.cellsX)}`))cell++;ix=cell%field.cellsX;iy=Math.floor(cell/field.cellsX);}
    used.add(`${ix},${iy}`);const variant=old?.variant??0;if(!m.variants[variant])throw new Error("Missing seed orientation");return {id:m.id,ix,iy,iz:0,variant,zLift:old?.zLift??0};});
  const physicalKey=(tiles:PlacedTile[])=>tiles.map(t=>{const v=models.find(m=>m.id===t.id)!.variants[t.variant],a=v.rotation*Math.PI/180,c=Math.round(Math.cos(a)),s=Math.round(Math.sin(a)),x=v.mirror==="x"?-1:1,y=v.mirror==="y"?-1:1;return JSON.stringify([t.id,t.ix,t.iy,t.iz,t.zLift??0,c*x,-s*y,s*x,c*y]);}).sort().join('|');
  // Right-angle mirrored variant tables contain equivalent transforms. Omit
  // duplicate proposals; do not reuse validation between different instances.
  const proposals=[baseline],seen=new Set([physicalKey(baseline)]);
  let stageLimit=Math.ceil(limit*.65);
  const add=(tiles:PlacedTile[])=>{const signature=physicalKey(tiles);if(proposals.length>=stageLimit||seen.has(signature))return;seen.add(signature);proposals.push(tiles);};
  // Round-robin orientation variants ensures one source cannot consume the budget.
  for(let v=0;v<Math.max(...models.map(m=>m.variants.length));v++)for(let i=0;i<models.length;i++){
    if(!models[i].variants[v]||!mirrors.includes(models[i].variants[v].mirror))continue;
    add(baseline.map((t,j)=>({...t,variant:j===i?v:t.variant})));
  }
  const moves=[[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]];
  // Large uploads may require several lattice increments; never resize them
  // to one cell. These offsets are proposals, not bounding-box collision proof.
  for(let i=0;i<models.length;i++)for(let j=i+1;j<models.length;j++)for(const axis of [0,1]){
    const step=Math.ceil(((models[i].bboxMax[axis]-models[i].bboxMin[axis])+(models[j].bboxMax[axis]-models[j].bboxMin[axis]))/40);
    if(step>2&&step<Math.max(field.cellsX,field.cellsY))for(const move of [[step,0],[-step,0],[0,step],[0,-step]])if(!moves.some(m=>m[0]===move[0]&&m[1]===move[1]))moves.unshift(move);
  }
  for(const [dx,dy]of moves)for(let i=0;i<models.length;i++)for(let v=0;v<models[i].variants.length;v++){
    const t=baseline[i],ix=t.ix+dx,iy=t.iy+dy;
    if(!mirrors.includes(models[i].variants[v].mirror)||ix<0||iy<0||ix>=field.cellsX||iy>=field.cellsY||baseline.some((b,j)=>j!==i&&b.ix===ix&&b.iy===iy))continue;
    add(baseline.map((b,j)=>j===i?{...b,ix,iy,variant:v}:{...b}));
  }
  // A second bounded neighborhood combines changes to several instances.
  // Elites are preliminary design hypotheses, not feasible arrangements.
  const elites=proposals.slice().sort((a,b)=>(priority?.(b)??0)-(priority?.(a)??0)).slice(0,4);stageLimit=limit;
  for(const parent of elites)for(let i=0;i<models.length;i++)for(let v=0;v<models[i].variants.length;v++){
    if(mirrors.includes(models[i].variants[v].mirror))add(parent.map((t,j)=>({...t,variant:j===i?v:t.variant})));
    for(const [dx,dy]of moves.slice(0,4)){const ix=parent[i].ix+dx,iy=parent[i].iy+dy;
      if(ix>=0&&iy>=0&&ix<field.cellsX&&iy<field.cellsY&&!parent.some((t,j)=>j!==i&&t.ix===ix&&t.iy===iy))add(parent.map((t,j)=>j===i?{...t,ix,iy}:{...t}));}
  }
  return proposals;
}
function components(ids:string[],edges:Array<[string,string]>){const parents=new Map(ids.map(id=>[id,id]));const find=(id:string):string=>parents.get(id)===id?id:find(parents.get(id)!);
  for(const [a,b]of edges){if(!parents.has(a))parents.set(a,a);if(!parents.has(b))parents.set(b,b);parents.set(find(a),find(b));}return new Set([...parents.keys()].map(find)).size;}

/** Design preferences rank only candidates that survive independent mandatory
 * geometry checks. This study does not change descriptor/evaluation formulas. */
export async function studyArchitecturalArrangements(input:TileModel[],seeds:PlacedTile[],field:LatticeField,prefs:ArchitecturalPreferences=DEFAULT_ARCHITECTURAL_PREFERENCES,
  budget:ArchitecturalBudget=DEFAULT_ARCHITECTURAL_BUDGET,progress:(message:string)=>void=()=>{},cancelled:()=>boolean=()=>false,
  checkpoint:(study:ArchitecturalStudy)=>void=()=>{},branchOnly=false,branchSurfaceTargets=false):Promise<ArchitecturalStudy>{
  // Explicit older six-weight fixtures retain their previous zero hierarchy
  // preference. The website's new default exposes the seventh weight.
  prefs={...prefs,hierarchy:prefs.hierarchy??0};
  if(Object.keys(DEFAULT_ARCHITECTURAL_PREFERENCES).some(k=>!Number.isFinite(prefs[k as keyof ArchitecturalPreferences]))||Object.values(prefs).some(v=>!Number.isFinite(v)||v<0||v>20)||!Number.isInteger(budget.arrangements)||budget.arrangements<2||budget.arrangements>24
    ||!Number.isInteger(budget.routes)||budget.routes<8||budget.routes>1024||!Number.isInteger(budget.attachments)||budget.attachments<8||budget.attachments>256
    ||!Number.isFinite(budget.milliseconds)||budget.milliseconds<1000||budget.milliseconds>300000)throw new Error("Invalid architecture preferences or bounded study budget");
  await initializeExtensionReconstruction();const started=performance.now(),models=input.map(m=>({...m,sourceResponsiveExtensions:true}));
  progress("Analyzing complete source surfaces and bounded orientation/placement proposals");await new Promise(resolve=>setTimeout(resolve,0));
  let selected:Array<{tiles:PlacedTile[];score:number}>,result:ArchitecturalStudy;
  // This synchronous batch only reads source geometry. Check exact revisions
  // once per source rather than rescanning dense arrays for every hypothesis.
  // Release before checkpoints, async yields, or any connector validation.
  const releaseSetup=beginGeometryValidation();
  try{
  const proposed=architecturalProposals(models,seeds,field,budget.proposals,["none","x","y"],tiles=>preliminary(models,tiles,prefs));
  // A translated diagonal pose must not consume the adjacent-construction
  // comparison slots merely because its broad floor forecast ranks well.
  // Retain the original baseline; restrict new proposals to at least one
  // eligible side relationship. Isolated forms are still reported by the graph.
  const proposals=branchSurfaceTargets?proposed.filter((tiles,index)=>index===0||tiles.some((a,i)=>tiles.some((b,j)=>j>i&&sideAdjacentRegistration(a,b)))):proposed;
  const ranked=proposals.map(tiles=>({tiles,score:preliminary(models,tiles,prefs)})).sort((a,b)=>b.score-a.score||key(a.tiles).localeCompare(key(b.tiles)));
  const baseline=ranked.find(r=>key(r.tiles)===key(proposals[0]))!;
  selected=[baseline];const selectedKeys=new Set([key(baseline.tiles)]);
  const take=(candidate:typeof baseline|undefined)=>{if(candidate&&selected.length<budget.arrangements&&!selectedKeys.has(key(candidate.tiles))){selected.push(candidate);selectedKeys.add(key(candidate.tiles));}};
  const floorComparisons=ranked.map(r=>({proposal:r,cost:floorForecast(models,r.tiles)})).filter(r=>Number.isFinite(r.cost)).sort((a,b)=>a.cost-b.cost||b.proposal.score-a.proposal.score);
  take(floorComparisons.find(r=>r.proposal.tiles.some((t,i)=>models[i].variants[t.variant].mirror!==models[i].variants[baseline.tiles[i].variant].mirror))?.proposal);
  take(floorComparisons.find(r=>r.proposal!==baseline)?.proposal);
  // Reserve comparisons for rotated, mirrored, and translated configurations
  // before filling the remaining slots by preliminary compatibility.
  take(ranked.find(r=>r.tiles.some((t,i)=>models[i].variants[t.variant].rotation!==models[i].variants[baseline.tiles[i].variant].rotation)));
  take(ranked.find(r=>r.tiles.some((t,i)=>models[i].variants[t.variant].mirror!==models[i].variants[baseline.tiles[i].variant].mirror)));
  take(ranked.find(r=>r.tiles.some((t,i)=>t.ix!==baseline.tiles[i].ix||t.iy!==baseline.tiles[i].iy)));
  for(const r of ranked)take(r);
  result={preferences:{...prefs},budget:{...budget},generated:proposals.length,evaluated:0,routes:0,arrangements:[],features:models.map(architecturalSurfaces),incomplete:false,durationMs:0,setupMs:performance.now()-started,
    method:"source-surface hypotheses, instance orientation/placement neighborhood, mandatory original packing and emitted-geometry validation, coherent network selection"};
  }finally{releaseSetup();}
  checkpoint(result);
  for(const [index,proposal]of selected.entries()){
    if(cancelled()||performance.now()-started>=budget.milliseconds){result.incomplete=true;result.stopReason=cancelled()?"cancelled":"wall-time budget";break;}
    progress(`Architectural arrangement ${index+1}/${selected.length}: original material and branch interfaces`);await new Promise(resolve=>setTimeout(resolve,0));
    const tiles=proposal.tiles,packing=originalPlacementMaterial(models,tiles),accepted:Array<{pair:PortPair;importance:number;sourceRole:string;targetRole:string}>=[],rejections:Record<string,number>={},screening:unknown[]=[];let testedRoutes=0;
    if(packing.status!=="REJECTED")for(let i=0;i<models.length;i++)for(let j=i+1;j<models.length;j++){
      if(result.routes>=budget.routes||performance.now()-started>=budget.milliseconds||cancelled()){result.incomplete=true;result.stopReason="route/time/cancellation budget";break;}
      const ma=models[i],mb=models[j],ta=tiles[i],tb=tiles[j],value=(m:TileModel,t:PlacedTile,p:PortPair["from"])=>interfaceValue(m,t,p,prefs);
      if(branchSurfaceTargets&&!sideAdjacentRegistration(ta,tb))continue;
      const maxRoutes=Math.min(16,budget.routes-result.routes);
      const evaluation=evaluateAlternativeRoutes(models,tiles,ma.id,mb.id,[],{attachments:budget.attachments,pairs:2,routes:maxRoutes,maxSpan:50,maxRun:72},{
        interfaceRank:(m,t,a)=>value(m,t,a.point),rank:(a,b)=>-4*(value(ma,ta,a.point)+value(mb,tb,b.point)),
        additionalAnchors:branchOnly?(m,t)=>branchSectionAnchors(m,t,Math.min(32,budget.attachments)):undefined,
        interfaceFilter:branchOnly&&!branchSurfaceTargets?(m,t,a)=>isBranchInterface(m,t,a.point)||architecturalInterface(m,t,a.point)?.role==="projecting branch":undefined,
        pairFilter:branchOnly&&branchSurfaceTargets?(a,b)=>isBranchInterface(ma,ta,a.point)||isBranchInterface(mb,tb,b.point)||architecturalInterface(ma,ta,a.point)?.role==="projecting branch"||architecturalInterface(mb,tb,b.point)?.role==="projecting branch":undefined});
      testedRoutes+=evaluation.outcomes.length;result.routes+=evaluation.outcomes.length;
      for(const [reason,count]of Object.entries(evaluation.counts))rejections[reason]=(rejections[reason]??0)+count;
      screening.push({source:ma.id,target:mb.id,attachments:evaluation.attachments,approachRejections:evaluation.approachRejections,
        interfaces:evaluation.interfaceAssessments.map(a=>{const m=models.find(m=>m.id===a.sourceId)!,t=tiles.find(t=>t.id===a.sourceId)!,surface=architecturalInterface(m,t,a.point);return {...a,region:surface?.region,role:surface?.role??"unclassified",relativeElevation:surface?.relativeElevation};})});
      for(const a of evaluation.accepted){const sa=architecturalInterface(ma,ta,a.pair.from),sb=architecturalInterface(mb,tb,a.pair.to);
        const path=a.pair.path!,first=path[1].map((v,k)=>v-path[0][k]),last=path[path.length-2].map((v,k)=>v-path.at(-1)![k]);
        const agreement=(d:number[],out:number[]|undefined)=>out?Math.max(0,(d[0]*out[0]+d[1]*out[1])/Math.max(Math.hypot(d[0],d[1]),1e-9)):0;
        accepted.push({pair:a.pair,sourceRole:isBranchInterface(ma,ta,a.pair.from)?"projecting branch":sa?.role??"unclassified",targetRole:isBranchInterface(mb,tb,a.pair.to)?"projecting branch":sb?.role??"unclassified",importance:value(ma,ta,a.pair.from)+value(mb,tb,a.pair.to)+prefs.alignment*(agreement(first,a.pair.startDirection)+agreement(last,a.pair.endDirection))/2-pathLength(a.pair.path??[])*prefs.connectorEconomy*.025});}
    }
    accepted.sort((a,b)=>b.importance-a.importance||a.pair.portA.localeCompare(b.pair.portA));
    const chosen:typeof accepted=[],meshes:ConnectorSurface[]=[],deferred:ArchitecturalCandidate["deferred"]=[],usedPairs=new Set<string>(),usedNodes=new Set<string>();
    const internalLinks:ArchitecturalCandidate["interfaceNetwork"]["verifiedInternalLinks"]=[],endpoints:Array<{id:string;point:PortPair["from"];width:number;node:string}>=[];
    const node=(id:string,p:PortPair["from"])=>`${id}:${JSON.stringify(p)}`;
    for(const a of accepted){const p=a.pair,pairKey=[p.tileA,p.tileB].sort().join('|'),na=node(p.tileA,p.from),nb=node(p.tileB,p.to);
      const links:typeof internalLinks=[];
      if(chosen.length&&!usedPairs.has(pairKey))for(const [id,point,n,width]of [[p.tileA,p.from,na,p.startWidth??p.usableWidth],[p.tileB,p.to,nb,p.endWidth??p.usableWidth]] as const){
        for(const old of endpoints.filter(e=>e.id===id)){
          const evidence=originalWalkingCorridor(models.find(m=>m.id===id)!,tiles.find(t=>t.id===id)!,old.point,point,Math.min(width,old.width),models,tiles,meshes);
          if(evidence.status==="VERIFIED"){links.push({source:id,from:old.node,to:n,evidence});break;}
        }
      }
      let reason=packing.status==="UNVERIFIED"?"original scene material packing UNVERIFIED; no confirmed network promotion":usedPairs.has(pairKey)?"redundant form relationship":chosen.length&&!usedNodes.has(na)&&!usedNodes.has(nb)&&!links.length?"disconnected elevation/interface island; no verified original internal corridor":undefined;
      if(!reason){const actual=validateCirculationConnection(p,models,tiles,meshes,{fixedFootprint:true,maxRun:72});if(actual.reason!=="accepted")reason=actual.reason;}
      if(reason){deferred.push({source:p.tileA,target:p.tileB,reason});continue;}
      chosen.push(a);meshes.push(...transitionMeshes(p));usedPairs.add(pairKey);usedNodes.add(na);usedNodes.add(nb);internalLinks.push(...links);
      endpoints.push({id:p.tileA,point:p.from,width:p.startWidth??p.usableWidth,node:na},{id:p.tileB,point:p.to,width:p.endWidth??p.usableWidth,node:nb});
    }
    const synthesis=synthesizeConnectors(models,tiles,[],{portPairs:chosen.map(a=>a.pair),networkOnly:true});
    const kept=chosen.filter(a=>synthesis.portPairs?.some(p=>p.tileA===a.pair.tileA&&p.tileB===a.pair.tileB&&p.portA===a.pair.portA&&p.portB===a.pair.portB));
    usedNodes.clear();for(const a of kept){usedNodes.add(node(a.pair.tileA,a.pair.from));usedNodes.add(node(a.pair.tileB,a.pair.to));}
    // The interface network describes geometric patches. Internal walkable
    // paths between separated interfaces are not inferred from a tile ID.
    const regionNodes=new Set(kept.flatMap(a=>[[a.pair.tileA,a.pair.from],[a.pair.tileB,a.pair.to]] as const).map(([id,p])=>`${id}:${architecturalInterface(models.find(m=>m.id===id)!,tiles.find(t=>t.id===id)!,p)?.region}`));
    const regions=models.flatMap((m,i)=>architecturalSurfaces(m).map(r=>({sourceId:m.id,region:r.region,role:r.role,elevation:r.centroid[2]+(tiles[i].zLift??0),connected:regionNodes.has(`${m.id}:${r.region}`)})));
    const formComponents=components(models.map(m=>m.id),(synthesis.portPairs??[]).map(p=>[p.tileA,p.tileB]));
    const verifiedInternalLinks=internalLinks.filter(l=>usedNodes.has(l.from)&&usedNodes.has(l.to));
    const islands=components([...usedNodes],[...kept.map(a=>[node(a.pair.tileA,a.pair.from),node(a.pair.tileB,a.pair.to)] as [string,string]),...verifiedInternalLinks.map(l=>[l.from,l.to] as [string,string])]);
    const score=kept.reduce((s,a)=>s+a.importance,0)+rhythm(tiles)*prefs.rhythm+(models.length-formComponents)*prefs.coherence;
    result.arrangements.push({id:`architectural-${index}`,tiles,preliminaryScore:proposal.score,packing,score,formComponents,status:packing.status==="REJECTED"?"REJECTED":"REVIEW",synthesis,selected:kept,deferred,rejections,regions,
      interfaceNetwork:{islands,internalCirculation:"UNVERIFIED",verifiedInternalLinks},testedRoutes,screening});result.evaluated++;
    result.durationMs=performance.now()-started;checkpoint(result);
  }
  result.arrangements=rankArchitecturalCandidates(result.arrangements);
  result.durationMs=performance.now()-started;return result;
}
