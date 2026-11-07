import { placedConnectionFeatures, connectionFeatures, DEFAULT_CONNECTION_FEATURE_POLICY, type ConnectionFeaturePolicy } from "./connectionFeatures";
import { adaptFeatureLanding } from "./featureAdaptation";
import { localPoint, worldFromLocal } from "./surfaceAttachment";
import { validateCirculationConnection, acceptCirculationClass } from "./portConnectionValidation";
import { transitionPath, transitionMeshes, planRun } from "./transitionGeometry";
import { originalPlacementMaterial } from "./extensionReconstruction";
import { sideAdjacentRegistration } from "./adjacentConnections";
import { startConnectionTiming } from "./connectionDiagnostics";
import { geometryRevision, beginGeometryValidation } from "./geometryRevision";
import { validateWalkingApproach, validateSourceApproach } from "./walkingApproach";
import { landingHeadroomCheck, type ConnectorSurface } from "./connectionClearance";
import type { PlacedTile, PortPair, PortCandidate, TileModel, Vec3 } from "./types";

export type FeatureConnectionOptions={policy?:ConnectionFeaturePolicy;pairs?:number;adaptations?:number;milliseconds?:number;
  onEvaluation?:(e:{pair:PortPair;models:TileModel[];tiles:PlacedTile[];validation:ReturnType<typeof validateCirculationConnection>})=>void};
export type FeatureAttempt={source:string;target:string;featureA:string;featureB:string;categoryA:string;categoryB:string;
  operation:string;reason:string;details?:unknown;geometry?:{from:Vec3;to:Vec3;width:number;rise:number;run:number;bend:number};adaptationMs?:number;validationMs?:number};
const adaptations=new WeakMap<object,Map<string,ReturnType<typeof adaptFeatureLanding>>>();
function workingLanding(model:TileModel,feature:ReturnType<typeof connectionFeatures>["features"][number],width:number,setback:number){
  const revision=geometryRevision(model.connectionSurface!),key=JSON.stringify([model.id,model.anchor,model.cellFeet,feature,width,setback]);let entries=adaptations.get(revision);
  if(!entries){entries=new Map();adaptations.set(revision,entries);}const old=entries.get(key);if(old)return old;
  const end=startConnectionTiming("local feature adaptation");let result:ReturnType<typeof adaptFeatureLanding>;
  try{
    const plan={feature,width,depth:feature.width<width?4:3,setback,elevation:0};
    result=adaptFeatureLanding(model,plan);
    // A perimeter corridor may turn before the straight datum probe reaches
    // its depth. Try the independently measured boundary datum, then require
    // full reconstructed-to-original walking continuity below as usual.
    if(!result.valid&&result.reason==="no physical interior surface behind feature")result=adaptFeatureLanding(model,{...plan,datum:"boundary"});
  }finally{end();}
  if(entries.size>=32)entries.delete(entries.keys().next().value!);entries.set(key,result);return result;
}

/** A landing may feed an existing transverse corridor. Test the whole union
 * of the two full-width legs and an unchanged original continuation. A six-foot
 * straight rectangle through a courtyard is not the only valid approach. */
export function reconstructionContinuity(original:TileModel,working:TileModel,tile:PlacedTile,point:Vec3,outward:Vec3,width:number,models:TileModel[],tiles:PlacedTile[],surfaces:ConnectorSurface[],approachDirections?:Vec3[]){
  const entrance=validateWalkingApproach(working,tile,point,outward,width,2,models,tiles,surfaces);
  if(!entrance.valid)return {valid:false,reason:"reconstructed entrance",evidence:[entrance]};
  const straight=validateWalkingApproach(working,tile,point,outward,width,6,models,tiles,surfaces);
  if(straight.valid)return {valid:true,reason:"full straight walking approach",evidence:[entrance,straight]};
  const side:Vec3=[-outward[1],outward[0],0];
  const evidence:unknown[]=[entrance,straight];
  const directions=approachDirections?.length?approachDirections.map(d=>d.map(v=>-v) as Vec3):[-1,1].map(sign=>side.map(v=>-v*sign) as Vec3);
  // Include intermediate centers: a 2.6-ft perimeter corridor can admit a
  // 2.1-ft turn at 1.5 ft while both the near-rim and 2.1-ft probes fail.
  // Every footprint still undergoes the same exact coverage/slope checks.
  for(const jointDepth of [...new Set([width/2,width/2+.15,width/2+.45,width/2+.75,2.1,3,4])]){
  const ingress=validateWalkingApproach(working,tile,point,outward,width,jointDepth+width/2,models,tiles,surfaces);evidence.push({...ingress,phase:"ingress",jointDepth});if(!ingress.valid)continue;
  const joint=point.map((v,k)=>v-outward[k]*jointDepth) as Vec3;
  // The turn may reach unchanged circulation before a fixed three-foot leg.
  // Probe shorter full-width paths too; neither entrance/landing requirements
  // nor exact footprint, slope, clearance or original-continuation checks change.
  for(const depth of [...new Set([width,width+.45,3,4,5,6])])for(const direction of directions){
    const turnWidth=width*(Math.abs(direction[0]*outward[0]+direction[1]*outward[1])+Math.abs(direction[0]*outward[1]-direction[1]*outward[0]));
    const front=joint.map((v,k)=>v+direction[k]*turnWidth/2) as Vec3;
    const turn=validateWalkingApproach(working,tile,front,direction,turnWidth,turnWidth,models,tiles,surfaces);evidence.push({...turn,phase:"turn",jointDepth,depth,direction});if(!turn.valid)continue;
    const leg=validateWalkingApproach(working,tile,joint,direction,width,depth,models,tiles,surfaces);
    evidence.push({...leg,phase:"leg",jointDepth,depth,direction});if(!leg.valid)continue;
    const end=joint.map((v,k)=>v-direction[k]*depth) as Vec3;
    const oldScene=models.map(m=>m.id===original.id?original:m);
    const continuation=validateWalkingApproach(original,tile,end,direction,width,1,oldScene,tiles,surfaces);
    evidence.push({...continuation,phase:"original continuation",jointDepth,depth,direction});
    if(continuation.valid)return {valid:true,reason:"full-width turn into unchanged original corridor",joint,end,evidence};
  }
  }
  return {valid:false,reason:"no verified walking continuation into unchanged geometry",evidence};
}

/** Architecture-first GENERATION, not a post-hoc scoring bonus. Every candidate
 * comes from enabled physical feature categories. Adapted geometry is validated
 * against the complete fresh scene. No original-floor failure vetoes a proposed
 * replacement before that replacement is constructed and checked. */
export function generateFeatureConnections(models:TileModel[],tiles:PlacedTile[],options:FeatureConnectionOptions={}){
  const finish=beginGeometryValidation(),started=performance.now();
  try{
    const policy=options.policy??DEFAULT_CONNECTION_FEATURE_POLICY,pairLimit=options.pairs??8,adaptationLimit=options.adaptations??4,milliseconds=options.milliseconds??10000;
    if(!Number.isInteger(pairLimit)||pairLimit<1||pairLimit>128||!Number.isInteger(adaptationLimit)||adaptationLimit<0||adaptationLimit>32||!Number.isFinite(milliseconds)||milliseconds<1)throw new Error("Invalid feature construction budget");
    const inventory=models.map(m=>({id:m.id,counts:Object.fromEntries(["branch","corner","edge","other"].map(k=>[k,connectionFeatures(m).features.filter(f=>f.kind===k).length])),excluded:connectionFeatures(m).excluded}));
    const features=models.map((m,i)=>placedConnectionFeatures(m,tiles[i],policy).map(f=>{
      const side:Vec3=[-f.outward[1],f.outward[0],0],probes=[-1.05,0,1.05].map(u=>f.point.map((v,k)=>v-f.outward[k]+side[k]*u) as Vec3);
      return {...f,sourceApproach:validateSourceApproach(m,tiles[i],f.point,f.outward,2.1),sourceClearance:landingHeadroomCheck(probes,tiles,models)};
    }));
    let candidates:Array<{a:number;b:number;fa:typeof features[number][number];fb:typeof features[number][number];rank:number}>=[];
    let screened=0;
    const tier=(k:string)=>["branch","corner","edge","other"].indexOf(k);
    for(let a=0;a<models.length;a++)for(let b=a+1;b<models.length;b++){
      if(!sideAdjacentRegistration(tiles[a],tiles[b]))continue;
      const dx=tiles[b].ix-tiles[a].ix,dy=tiles[b].iy-tiles[a].iy;
      // Only the shared sides of adjacent registration bays. No whole-mesh fallback.
      const aa=features[a].filter(f=>f.outward[0]*dx+f.outward[1]*dy>.25),bb=features[b].filter(f=>f.outward[0]*dx+f.outward[1]*dy<-.25);
      for(const fa of aa)for(const fb of bb){const span=Math.hypot(fa.point[0]-fb.point[0],fa.point[1]-fb.point[1]),rise=Math.abs(fa.point[2]-fb.point[2]);
        if(span<1||span>50||rise>12){screened++;continue;}
        const branches=Number(fa.kind==="branch")+Number(fb.kind==="branch");
        // Shortest gap is not necessarily cheapest circulation. Prefer room
        // for real treads within the same architectural category; deficits
        // remain eligible for retraction/routing, never counted as infeasible.
        const flightDeficit=Math.max(0,Math.ceil(rise/.6)*.75-span);
        const approachCost=(f:typeof fa)=>f.sourceApproach.valid?0:f.sourceApproach.reason==="local approach slope"?20:300;
        // A slope failure can hide an independent low ceiling. Keep blocked
        // interfaces eligible for reconstruction, but try physically open
        // approaches first instead of exhausting the budget beneath slabs.
        candidates.push({a,b,fa,fb,rank:(2-branches)*10000+(tier(fa.kind)+tier(fb.kind))*1000+Number(!fa.sourceClearance.clear)*1000+Number(!fb.sourceClearance.clear)*1000+approachCost(fa)+approachCost(fb)+flightDeficit*100+rise*12+span});
      }
    }
    candidates.sort((a,b)=>a.rank-b.rank||a.fa.id.localeCompare(b.fa.id)||a.fb.id.localeCompare(b.fb.id));
    const signatures=new Set<string>(),rawCandidates=candidates.length;
    candidates=candidates.filter(c=>{const signature=JSON.stringify([c.a,c.b,c.fa.point,c.fb.point,c.fa.outward,c.fb.outward,Math.min(2.1,c.fa.width,c.fb.width)]);if(signatures.has(signature))return false;signatures.add(signature);return true;});
    // Keep a bounded fallback share after the highest-priority features fail.
    // This is shortlist allocation, not a claim that untested branches fail.
    const groups=[candidates.filter(c=>c.fa.kind==="branch"||c.fb.kind==="branch"),candidates.filter(c=>c.fa.kind!=="branch"&&c.fb.kind!=="branch"&&(c.fa.kind==="corner"||c.fb.kind==="corner")),candidates.filter(c=>![c.fa.kind,c.fb.kind].some(k=>k==="branch"||k==="corner"))].filter(g=>g.length);
    // A dozen width/position windows on one physical edge must not crowd out
    // every other branch or floor level in a bounded architectural shortlist.
    const featureKey=(f:typeof features[number][number])=>f.sourceFeatureId??f.id.split("@")[0];
    const selected=groups.flatMap(group=>{
      const remaining=group.slice(),chosen:typeof group=[],sources=new Set<string>(),targets=new Set<string>(),quota=Math.max(1,Math.floor(pairLimit/groups.length));
      while(chosen.length<quota&&remaining.length){
        const candidate=remaining.find(c=>!sources.has(featureKey(c.fa))&&!targets.has(featureKey(c.fb)))??remaining.find(c=>!sources.has(featureKey(c.fa)))??remaining[0];
        chosen.push(candidate);remaining.splice(remaining.indexOf(candidate),1);sources.add(featureKey(candidate.fa));targets.add(featureKey(candidate.fb));
      }
      return chosen;
    });
    for(const c of candidates)if(selected.length<pairLimit&&!selected.includes(c))selected.push(c);
    const attempts:FeatureAttempt[]=[],pairs:PortPair[]=[],surfaces:ConnectorSurface[]=[],used=new Set<string>(),parent=tiles.map((_,i)=>i);
    const find=(i:number):number=>parent[i]===i?i:find(parent[i]);
    let workingModels=models.slice(),tested=0,adapted=0,stopReason="feature candidates exhausted";
    // Reserve attempts for actual retraction, not only zero-setback flattening.
    // All variants share the same adaptation budget and remain explicitly untested
    // when it expires. No already-valid source prefix suppresses a retraction.
    const adaptationOrder:typeof selected=[];
    for(let row=0;row<selected.length;row++)for(const group of groups){const c=group.filter(c=>selected.includes(c))[row];if(c)adaptationOrder.push(c);}
    const initial=adaptationOrder.slice(0,Math.max(1,Math.ceil(adaptationLimit*2/3)));
    // Give the highest-priority branch reconstructions a turn before expensive
    // unchanged floor-edge routes consume the entire shared time budget.
    const schedule:Array<typeof selected[number]&{setbacks:number[];flatStairLanding?:boolean}>=[...initial.flatMap(c=>[{...c,setbacks:[-1]},{...c,setbacks:[0],flatStairLanding:true},{...c,setbacks:[0]}]),...selected.filter(c=>!initial.includes(c)).map(c=>({...c,setbacks:[-1]})),...[.5,1].flatMap(setback=>initial.map(c=>({...c,setbacks:[setback]})))];
    const packingCache=new Map<string,ReturnType<typeof originalPlacementMaterial>>();
    for(const candidate of schedule){
      if(performance.now()-started>=milliseconds){stopReason="feature wall-time budget";break;}
      const {a,b,fa,fb}=candidate;if(find(a)===find(b))continue;
      const identity=[tiles[a].id,fa.id,tiles[b].id,fb.id].join('|');if(!used.has(identity)){if(tested>=pairLimit){stopReason="feature pair budget";break;}used.add(identity);tested++;}
      const width=2.1,base={source:tiles[a].id,target:tiles[b].id,featureA:fa.id,featureB:fb.id,categoryA:fa.kind,categoryB:fb.kind};
      let accepted=false;
      // Try the unchanged geometry, then reconstruct local landings and retract
      // them. Flat approach depth is never counted as ramp climbing run.
      for(const setback of candidate.setbacks){
        if(performance.now()-started>=milliseconds){stopReason="feature wall-time budget";break;}
        // A qualified walking approach is not proof that a planar connector
        // section coincides with its curved rim. The explicit zero-setback
        // construction must remain eligible to reconstruct BOTH local rims.
        // Its actual material and original-continuation checks still follow.
        let endpointSetbacks=[setback,setback],landingChecks:Array<ReturnType<typeof validateWalkingApproach>>|undefined;
        if(candidate.flatStairLanding){
          const rise=Math.abs(fb.point[2]-fa.point[2]),span=Math.hypot(fb.point[0]-fa.point[0],fb.point[1]-fa.point[1]);
          if(rise<=.2||rise*12<=span)continue;
          landingChecks=[a,b].map((index,k)=>{const f=k===0?fa:fb;return validateWalkingApproach(workingModels[index],tiles[index],f.point,f.outward,width,3,workingModels,tiles,surfaces,true);});
          if(landingChecks.every(c=>c.valid))continue;
          // Extend only a deficient footprint; flatten an adequately supported
          // but sloping landing. A qualified opposite endpoint stays unchanged.
          // These are construction proposals, never circulation certificates.
          endpointSetbacks=landingChecks.map(c=>!c.valid&&["incomplete or overlapping floor coverage","no physical floor at entrance","disconnected interior footprint"].includes(c.reason)?-.75:0);
        }
        let scene=workingModels,from=fa.point,to=fb.point;
        if(setback>=0){
          if(adapted>=adaptationLimit)break;adapted++;
          const results=[a,b].map((index,k)=>{const placed=k===0?fa:fb,source=workingModels[index],feature=connectionFeatures(source).features.find(f=>f.id===(placed.sourceFeatureId??placed.id));
            if(endpointSetbacks[k]===0&&candidate.flatStairLanding&&landingChecks![k].valid)return {valid:true as const,model:source,point:localPoint(placed.point,tiles[index],source),provenance:undefined};
            return feature?workingLanding(source,{...feature,point:localPoint(placed.point,tiles[index],source)},width,endpointSetbacks[k]):undefined;});
          if(results.some(r=>!r?.valid)){attempts.push({...base,operation:`local landing / setbacks ${endpointSetbacks.join(",")}`,reason:"adaptation rejected",details:results.map(r=>r?.valid?{valid:true,provenance:r.provenance}:r)});continue;}
          scene=workingModels.slice();scene[a]=results[0]!.valid?results[0]!.model:scene[a];scene[b]=results[1]!.valid?results[1]!.model:scene[b];
          from=worldFromLocal(results[0]!.valid?results[0]!.point:localPoint(fa.point,tiles[a],scene[a]),tiles[a],scene[a]);
          to=worldFromLocal(results[1]!.valid?results[1]!.point:localPoint(fb.point,tiles[b],scene[b]),tiles[b],scene[b]);
          // Check the entire reconstructed approach back to unchanged walking
          // geometry, not just the flat two-foot endpoint plateau.
          const continuity=[a,b].map((index,k)=>results[k]?.valid&&results[k].provenance?reconstructionContinuity(workingModels[index],scene[index],tiles[index],k===0?from:to,k===0?fa.outward:fb.outward,width,scene,tiles,surfaces,k===0?fa.approachDirections:fb.approachDirections):{valid:true,reason:"unchanged source approach; final scene validation still required"});
          if(continuity.some(c=>!c.valid)){attempts.push({...base,operation:`reconstructed approach / setbacks ${endpointSetbacks.join(",")}`,reason:"reconstruction-to-original walking continuity",details:continuity});continue;}
        }
        const packingKey=scene.map(m=>geometryRevision(m.connectionSurface!).id).join(":"),knownPacking=packingCache.get(packingKey)??originalPlacementMaterial(scene,tiles);
        packingCache.set(packingKey,knownPacking);
        if(knownPacking.status==="REJECTED"){
          attempts.push({...base,operation:setback<0?"original placement packing":`reconstructed placement packing / setback ${setback}`,reason:"working forms penetrate",details:knownPacking});continue;
        }
        const gap=Math.hypot(to[0]-from[0],to[1]-from[1]),stairRun=Math.ceil(Math.abs(to[2]-from[2])/.6)*1;
        const offset=Math.min(6,Math.max(2,Math.sqrt(Math.max(0,stairRun*stairRun-gap*gap))/2));
        const bends=stairRun>gap?[0,2,-2,offset,-offset]:[0,2,-2];
        for(const bend of [...new Set(bends)]){
          if(performance.now()-started>=milliseconds){stopReason="feature wall-time budget";break;}
          const plan=Math.hypot(to[0]-from[0],to[1]-from[1]),rise=to[2]-from[2];
          const pair:PortPair={tileA:tiles[a].id,tileB:tiles[b].id,portA:fa.id,portB:fb.id,from:[...from],to:[...to],plan,rise,distance:Math.hypot(plan,rise),usableWidth:width,startWidth:width,endWidth:width,startDirection:fa.outward,endDirection:fb.outward,connectionClass:Math.abs(rise)>.1?"VERTICAL":"ADAPTIVE",confidence:1,facing:1,widthCompatibility:1,score:0};
          pair.featureConnection={source:fa.kind,target:fb.kind,sourceFeature:fa.id,targetFeature:fb.id};
          pair.path=transitionPath(pair,bend);
          if(!acceptCirculationClass(pair)){attempts.push({...base,operation:`${setback<0?"original":"reconstructed"} bend ${bend}`,reason:"route slope/run"});continue;}
          const before=performance.now(),validation=validateCirculationConnection(pair,scene,tiles,surfaces,{maxRun:72});
          options.onEvaluation?.({pair,models:scene,tiles,validation});
          attempts.push({...base,operation:`${setback<0?"original":"reconstructed setbacks "+endpointSetbacks.join(",")} bend ${bend}`,geometry:{from:[...pair.from],to:[...pair.to],width,rise,run:planRun(pair.path!),bend},reason:validation.reason,details:validation.details,validationMs:performance.now()-before});
          if(validation.reason!=="accepted")continue;
          // Fresh material packing after deformation; original source touch or
          // a validator pass cannot excuse working forms penetrating each other.
          const packing=originalPlacementMaterial(scene,tiles);if(packing.status!=="VERIFIED"){attempts.push({...base,operation:"working-scene packing",reason:packing.status,details:packing});continue;}
          pair.featureConnection={source:fa.kind,target:fb.kind,sourceFeature:fa.id,targetFeature:fb.id};
          pairs.push(pair);workingModels=scene;surfaces.push(...transitionMeshes(pair).map(m=>({...m,portPair:pair})));parent[find(a)]=find(b);accepted=true;break;
        }
        if(accepted)break;
      }
      if(pairs.length&&new Set(parent.map((_,i)=>find(i))).size===1){stopReason="first validated feature network";break;}
    }
    const components=new Set(parent.map((_,i)=>find(i))).size,candidateRecords:PortCandidate[]=pairs.map(pair=>({pair,accepted:true}));
    if(stopReason==="feature candidates exhausted"&&tested<candidates.length)stopReason="feature pair budget";
    return {workingModels,pairs,candidates:candidateRecords,confirmedReports:[],componentsBefore:tiles.length,componentsAfter:components,rejectionCounts:{},constructionDiagnostics:[],assessedPairs:candidates.length+screened,cheapRejections:screened,detailedRoutes:attempts.filter(a=>a.validationMs!==undefined).length,score:pairs.length*5,multiConnectionBonus:pairs.length*5,
      featureDiagnostics:{inventory:inventory.map((item,i)=>({...item,windows:features[i].length,sourceQualified:features[i].filter(f=>f.sourceApproach.valid).length,clearanceProbesPassed:features[i].filter(f=>f.sourceClearance.clear).length,qualifiedExamples:features[i].filter(f=>f.sourceApproach.valid).slice(0,8).map(f=>({id:f.id,kind:f.kind,point:f.point,outward:f.outward})),levels:[...new Set(features[i].map(f=>Math.round(f.elevation*100)/100))]})),policy,generated:candidates.length,duplicates:rawCandidates-candidates.length,evaluated:tested,adaptations:adapted,attempts,stopReason,ms:performance.now()-started,omitted:Math.max(0,candidates.length-tested)}};
  }finally{finish();}
}
