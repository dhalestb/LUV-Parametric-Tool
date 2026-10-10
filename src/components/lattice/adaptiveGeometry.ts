import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { localPoint, worldFromLocal, measureFlushWalkingInterface } from "./surfaceAttachment";
import { validateWalkingApproach } from "./walkingApproach";
import { acceptCirculationClass, validateCirculationConnection } from "./portConnectionValidation";
import { transitionMeshes, transitionSections, planRun } from "./transitionGeometry";
import { routeAlternatives } from "./alternativeRouting";
import { geometryRevision } from "./geometryRevision";
import type { ConnectorSurface } from "./connectionClearance";
import { surfaceOrientation } from "./surfaceOrientation";

export type AdaptationMode = "Preserve Original" | "Allow Derived Adaptation";
export type AdaptationLimits = { extentFeet:number; removedCubicFeet:number; landingSquareFeet:number; connectorFeet:number; supports:number; triangles:number; candidates:number };
/** Physical units: feet, square feet, cubic feet. No optimizer weight changes. */
export const DEFAULT_ADAPTATION_LIMITS:AdaptationLimits = {extentFeet:6,removedCubicFeet:8,landingSquareFeet:24,connectorFeet:72,supports:4,triangles:250000,candidates:32};
export type Box = {min:Vec3;max:Vec3};
export type AdaptationProposal = {
  sourceId:string; operation:"opening"|"landing"; box:Box; purpose:string;
  /** A column must bear on this independently identified original floor. */
  supports?:Array<{box:Box;bearingId:string}>;
};
export type AdaptationRecord = {sourceId:string;sourceRevision:number;operation:string;box:Box;purpose:string;addedCubicFeet:number;removedCubicFeet:number;addedSquareFeet:number};
export type CategorizedGeometry = {category:"derived-form"|"landing"|"support"|"circulation";sourceId:string;surface:ConnectorSurface};

/** Deterministic rectangular extension and column proposal from real floor
 * triangles. This is a proposal, never proof of support: the transaction below
 * rechecks full bearing coverage, source access, material and final circulation.
 */
export function proposeAdaptiveLanding(pair:PortPair,side:"A"|"B",models:TileModel[],tiles:PlacedTile[],
  limits:AdaptationLimits=DEFAULT_ADAPTATION_LIMITS):AdaptationProposal|undefined {
  const point=side==="A"?pair.from:pair.to,direction=side==="A"?pair.startDirection:pair.endDirection,width=side==="A"?pair.startWidth:pair.endWidth;
  if(!direction||!width||width<2||Math.abs(direction[0])+Math.abs(direction[1])!==1||direction[2]!==0)return undefined;
  const depth=Math.max(3,width),end=point.map((v,k)=>v+direction[k]*depth) as Vec3;
  const min:Vec3=[Math.min(point[0],end[0])-Math.abs(direction[1])*width/2,Math.min(point[1],end[1])-Math.abs(direction[0])*width/2,point[2]-.25];
  const max:Vec3=[Math.max(point[0],end[0])+Math.abs(direction[1])*width/2,Math.max(point[1],end[1])+Math.abs(direction[0])*width/2,point[2]];
  const center:Vec3=[end[0]-direction[0],end[1]-direction[1],min[2]];
  const bearings:Array<{id:string;z:number;triangle:number}>=[];
  for(const tile of tiles){
    const model=models.find(m=>m.id===tile.id);if(!model?.connectionSurface)continue;
    for(const [triangle,face]of surfaceOrientation(model.connectionSurface).triangles.entries()){
      if(face.normalZ<.7)continue;
      const points=face.points.map(p=>worldFromLocal(p,tile,model));
      const z=points[0][2];if(points.some(p=>Math.abs(p[2]-z)>1e-4)||z>=center[2]||center[2]-z>limits.extentFeet)continue;
      const signs=points.map((p,i)=>{const q=points[(i+1)%3];return(q[0]-p[0])*(center[1]-p[1])-(q[1]-p[1])*(center[0]-p[0]);});
      if(signs.every(v=>v>=-1e-8)||signs.every(v=>v<=1e-8))bearings.push({id:tile.id,z,triangle});
    }
  }
  bearings.sort((a,b)=>b.z-a.z||a.id.localeCompare(b.id)||a.triangle-b.triangle);
  const bearing=bearings[0];
  return {sourceId:side==="A"?pair.tileA:pair.tileB,operation:"landing",box:{min,max},purpose:"bounded flush landing extension",
    supports:bearing?[{bearingId:bearing.id,box:{min:[center[0]-1,center[1]-1,bearing.z],max:[center[0]+1,center[1]+1,center[2]]}}]:[]};
}

/** Fit elevation to the shortest emitted walking edge per climbing segment.
 * Existing flat landing segments stay flat. Cross-sloped interfaces are left
 * to the strict validator instead of pretending this planar fit handles them.
 */
export function fitAdaptiveRampElevation(pair:PortPair) {
  const next=structuredClone(pair),path=next.path;
  if(!path||path.length<2)return {pair:next,fitted:false,reason:"missing path"};
  const sections=transitionSections(next);
  if(sections.some(s=>Math.abs(s.side[2])>1e-10))return {pair:next,fitted:false,reason:"cross-sloped interface requires independent ribbon fit"};
  const edges=[path,...[-1,1].map(sign=>sections.map(s=>s.center.map((v,k)=>v+sign*s.side[k]*s.width/2) as Vec3))];
  const increments=path.slice(1).map((p,i)=>Math.abs(p[2]-path[i][2])<1e-6?0:Math.min(...edges.map(e=>Math.hypot(e[i+1][0]-e[i][0],e[i+1][1]-e[i][1]))));
  const climbingRun=increments.reduce((sum,v)=>sum+v,0),requiredRun=12*Math.abs(next.rise);
  if(climbingRun+1e-6<requiredRun)return {pair:next,fitted:false,reason:"insufficient ribbon climbing run",climbingRun,requiredRun};
  let traveled=0;
  for(let i=1;i<path.length;i++){traveled+=increments[i-1];path[i][2]=next.from[2]+(climbingRun?next.rise*traveled/climbingRun:0);}
  path[0]=next.from;path[path.length-1]=next.to;
  return {pair:next,fitted:true,reason:"ribbon elevation fitted; acceptance still requires full validation",climbingRun,requiredRun};
}

const dimensions=(box:Box)=>box.max.map((v,k)=>v-box.min[k]) as Vec3;
function validBox(box:Box) {return [...box.min,...box.max].every(Number.isFinite)&&dimensions(box).every(v=>v>0);}
function boxSolid(api:ManifoldToplevel,box:Box) {
  const cube=api.Manifold.cube(dimensions(box));
  try{return cube.translate(box.min);}finally{cube.delete();}
}
function meshOf(solid:Manifold):ConnectorSurface {const mesh=solid.getMesh();return {positions:mesh.vertProperties.slice(),indices:Array.from(mesh.triVerts)};}
function solidOf(api:ManifoldToplevel,model:TileModel,tile:PlacedTile) {
  if(!model.connectionSurface)throw new Error("missing source geometry");
  const positions=new Float32Array(model.connectionSurface.positions.length);
  for(let i=0;i<positions.length;i+=3)positions.set(worldFromLocal(Array.from(model.connectionSurface.positions.slice(i,i+3)) as Vec3,tile,model),i);
  const indices=model.connectionSurface.triangles.slice();
  if(model.variants[tile.variant].mirror!=="none")for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const mesh=new api.Mesh({numProp:3,vertProperties:positions,triVerts:Uint32Array.from(indices)});
  mesh.merge(); // Derived topology only; source arrays remain untouched.
  const solid=new api.Manifold(mesh);
  if(solid.status()!=="NoError"||!Number.isFinite(solid.volume())||solid.volume()<=0){solid.delete();throw new Error("source is not an oriented positive-volume manifold");}
  return solid;
}
function effectiveModel(original:TileModel,tile:PlacedTile,surface:ConnectorSurface):TileModel {
  const positions=new Float32Array(surface.positions.length);
  for(let i=0;i<positions.length;i+=3)positions.set(localPoint(Array.from(surface.positions.slice(i,i+3)) as Vec3,tile,original),i);
  const triangles=surface.indices.slice();
  if(original.variants[tile.variant].mirror!=="none")for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  return {...original,connectionSurface:{positions,triangles}};
}
function checkedMesh(solid:Manifold,limit:number) {
  if(solid.status()!=="NoError"||solid.volume()<=0||!Number.isFinite(solid.volume())||solid.numTri()>limit)throw new Error("invalid or excessive derived solid");
  const mesh=meshOf(solid);
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3).map(v=>Array.from(mesh.positions.slice(v*3,v*3+3)));
    const u=b.map((v,k)=>v-a[k]),w=c.map((v,k)=>v-a[k]);
    if(![...a,...b,...c].every(Number.isFinite)||Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])<=1e-9)throw new Error("nonfinite or degenerate derived mesh");
  }
  return mesh;
}

/** Explicit derived CSG transaction. Non-manifold originals block this portion;
 * no triangle deletion, approximation, or silent source repair is substituted.
 * Backend is injected so synchronous application search never initializes WASM.
 */
export function deriveAdaptedAssembly(api:ManifoldToplevel,models:TileModel[],tiles:PlacedTile[],pair:PortPair,
  proposals:AdaptationProposal[],mode:AdaptationMode="Preserve Original",limits:AdaptationLimits=DEFAULT_ADAPTATION_LIMITS,existing:ConnectorSurface[]=[]) {
  const started=performance.now(),owned:Manifold[]=[],records:AdaptationRecord[]=[],geometry:CategorizedGeometry[]=[],solids=new Map<string,Manifold>();
  const retain=(s:Manifold)=>{owned.push(s);return s;};
  const fail=(reason:string)=>({valid:false,reason,models,records:[] as AdaptationRecord[],geometry:[] as CategorizedGeometry[],ms:performance.now()-started});
  try {
    if(Object.values(limits).some(v=>!Number.isFinite(v)||v<=0)||!Number.isInteger(limits.supports)||!Number.isInteger(limits.triangles)||!Number.isInteger(limits.candidates))return fail("invalid adaptation limits");
    if(proposals.length>limits.candidates)return fail("adaptation candidate limit");
    if(proposals.some(p=>p.operation==="opening")&&mode!=="Allow Derived Adaptation")return fail("derived cutting not authorized");
    let landingArea=0,supportCount=0,removed=0;
    // Validate the complete obstruction scene rather than silently omitting a bad solid.
    for(const tile of tiles){const model=models.find(m=>m.id===tile.id);if(!model)return fail("missing source model");solids.set(tile.id,retain(solidOf(api,model,tile)));}
    const existingSolids=existing.map(surface=>{
      const mesh=new api.Mesh({numProp:3,vertProperties:surface.positions.slice(),triVerts:Uint32Array.from(surface.indices)});mesh.merge();
      return retain(new api.Manifold(mesh));
    });
    for(const proposal of proposals){
      const model=models.find(m=>m.id===proposal.sourceId),tile=tiles.find(t=>t.id===proposal.sourceId),source=solids.get(proposal.sourceId);
      if(!model||!tile||!source||!validBox(proposal.box)||!proposal.purpose.trim())return fail("invalid adaptation proposal");
      const endpoint=proposal.sourceId===pair.tileA?pair.from:proposal.sourceId===pair.tileB?pair.to:undefined;
      if(!endpoint||[...proposal.box.min,...proposal.box.max].some((v,i)=>Math.abs(v-endpoint[i%3])>limits.extentFeet))return fail("local adaptation extent");
      const tool=retain(boxSolid(api,proposal.box));
      if(existingSolids.some(other=>retain(other.intersect(tool)).volume()>1e-8))return fail("adaptation intersects existing connector");
      let next:Manifold;
      if(proposal.operation==="opening"){
        if(mode!=="Allow Derived Adaptation")return fail("derived cutting not authorized");
        next=retain(source.subtract(tool));const loss=source.volume()-next.volume();removed+=loss;
        if(loss<=1e-8||removed>limits.removedCubicFeet)return fail("empty or excessive material removal");
        records.push({sourceId:proposal.sourceId,sourceRevision:geometryRevision(model.connectionSurface!).id,operation:"opening",box:structuredClone(proposal.box),purpose:proposal.purpose,addedCubicFeet:0,removedCubicFeet:loss,addedSquareFeet:0});
      }else{
        const size=dimensions(proposal.box),direction=proposal.sourceId===pair.tileA?pair.startDirection:pair.endDirection,width=proposal.sourceId===pair.tileA?pair.startWidth:pair.endWidth;
        if(!direction||!width||Math.abs(proposal.box.max[2]-endpoint[2])>1e-4||Math.abs(size[2]-.25)>1e-6)return fail("raised or incorrect landing elevation");
        // Cardinal rectangular landings only. Other directions require a polygonal adaptation.
        if(Math.abs(direction[0])+Math.abs(direction[1])!==1||direction[2]!==0)return fail("unsupported landing frame");
        const edge=([-1,1] as const).map(sign=>[endpoint[0]-direction[1]*width*.5*sign,endpoint[1]+direction[0]*width*.5*sign,endpoint[2]] as Vec3) as [Vec3,Vec3];
        const seam=measureFlushWalkingInterface(model,tile,edge);
        if(!seam.valid||!seam.boundaryVerified)return fail("landing lacks full original-floor boundary contact");
        const approach=validateWalkingApproach(model,tile,endpoint,direction,width,2,models,tiles);
        if(!approach.valid)return fail("landing has no verified internal route: "+approach.reason);
        const center=proposal.box.min.map((v,k)=>(v+proposal.box.max[k])/2) as Vec3;
        const along=(center[0]-endpoint[0])*direction[0]+(center[1]-endpoint[1])*direction[1];
        const lateral=(center[0]-endpoint[0])*(-direction[1])+(center[1]-endpoint[1])*direction[0];
        const depth=direction[0]?size[0]:size[1],actualWidth=direction[0]?size[1]:size[0];
        if(Math.abs(along-depth/2)>1e-5||Math.abs(lateral)>1e-5||Math.abs(actualWidth-width)>1e-5)return fail("landing does not continue the original boundary");
        landingArea+=size[0]*size[1];supportCount+=proposal.supports?.length??0;
        if(landingArea>limits.landingSquareFeet||supportCount>limits.supports)return fail("landing or support budget");
        if(!proposal.supports?.length)return fail("unsupported landing");
        // Exact kernel intersection plus contact distance, never a proximity-only bearing.
        if(retain(source.intersect(tool)).volume()>1e-8)return fail("landing penetrates original material");
        for(const [id,other]of solids)if(id!==proposal.sourceId&&retain(other.intersect(tool)).volume()>1e-8)return fail("landing obstacle collision");
        next=retain(source.add(tool));
        for(const support of proposal.supports){
          const bearing=solids.get(support.bearingId),bearingModel=models.find(m=>m.id===support.bearingId),bearingTile=tiles.find(t=>t.id===support.bearingId);
          if(!bearing||!bearingModel||!bearingTile||!validBox(support.box))return fail("missing support bearing");
          const b=support.box;
          if([...b.min,...b.max].some((v,i)=>Math.abs(v-endpoint[i%3])>limits.extentFeet))return fail("support extent limit");
          if(Math.abs(b.max[2]-proposal.box.min[2])>1e-5||b.min[0]<proposal.box.min[0]||b.max[0]>proposal.box.max[0]||b.min[1]<proposal.box.min[1]||b.max[1]>proposal.box.max[1])return fail("support does not bear on landing underside");
          // Conservative 2 ft bearing footprint uses the established full polygon validator.
          // Its headroom check can reject a physically real bearing under a low slab;
          // such bearings remain unsupported here rather than weakening this test.
          const bearingCheck=validateWalkingApproach(bearingModel,bearingTile,[b.max[0],(b.min[1]+b.max[1])/2,b.min[2]],[1,0,0],b.max[1]-b.min[1],b.max[0]-b.min[0],models,tiles);
          if(!bearingCheck.valid)return fail("invalid physical bearing: "+bearingCheck.reason);
          const column=retain(boxSolid(api,b));
          if(retain(column.intersect(next)).volume()>1e-8||existingSolids.some(other=>retain(column.intersect(other)).volume()>1e-8))return fail("support intersects generated geometry");
          if(column.minGap(bearing,1e-4)>1e-5||retain(column.intersect(bearing)).volume()>1e-8)return fail("support bearing gap or penetration");
          for(const other of solids.values())if(retain(column.intersect(other)).volume()>1e-8)return fail("support obstacle collision");
          next=retain(next.add(column));
          geometry.push({category:"support",sourceId:proposal.sourceId,surface:checkedMesh(column,limits.triangles)});
          records.push({sourceId:proposal.sourceId,sourceRevision:geometryRevision(model.connectionSurface!).id,operation:"column",box:structuredClone(b),purpose:"conceptual bearing for "+proposal.purpose,addedCubicFeet:column.volume(),removedCubicFeet:0,addedSquareFeet:0});
        }
        geometry.push({category:"landing",sourceId:proposal.sourceId,surface:checkedMesh(tool,limits.triangles)});
        records.push({sourceId:proposal.sourceId,sourceRevision:geometryRevision(model.connectionSurface!).id,operation:"landing",box:structuredClone(proposal.box),purpose:proposal.purpose,addedCubicFeet:tool.volume(),removedCubicFeet:0,addedSquareFeet:size[0]*size[1]});
      }
      checkedMesh(next,limits.triangles);solids.set(proposal.sourceId,next);
    }
    const effective=models.map(model=>{
      const tile=tiles.find(t=>t.id===model.id);
      if(!tile||!proposals.some(p=>p.sourceId===model.id))return model;
      const surface=checkedMesh(solids.get(model.id)!,limits.triangles);
      geometry.push({category:"derived-form",sourceId:model.id,surface});return effectiveModel(model,tile,surface);
    });
    return {valid:true,reason:"derived assembly constructed; circulation unverified",models:effective,records,geometry,ms:performance.now()-started};
  }catch(e){return fail("reliable derived operation blocked: "+(e instanceof Error?e.message:String(e)));}
  finally{for(const solid of owned)solid.delete();}
}

/** Bounded opt-in integration with the unchanged Stage 2C acceptance gate.
 * Default callers keep original geometry. No provisional graph edge is emitted.
 */
export function evaluateAdaptiveConnection(api:ManifoldToplevel,models:TileModel[],tiles:PlacedTile[],original:PortPair,
  options:{mode?:AdaptationMode;limits?:AdaptationLimits;proposals?:AdaptationProposal[];generateLandings?:boolean;relocated?:PortPair[];existing?:ConnectorSurface[]}={}) {
  const started=performance.now(),limits=options.limits??DEFAULT_ADAPTATION_LIMITS,outcomes:Array<{level:number;route:string;reason:string;details?:unknown}>=[];
  const evaluate=(pair:PortPair,effective:TileModel[],level:number)=>{
    const routes=routeAlternatives(pair);
    // Ramps earn enough climbing travel before stairs are investigated. Flat
    // landings do not contribute to run. Existing mesh validation still checks
    // every emitted ribbon edge and the actual stair tread/riser dimensions.
    const candidates:Array<{name:string;pair:PortPair;ramp:boolean}>=[...routes.map(r=>({name:r.name+" ramp",pair:{...r.pair,connectionClass:Math.abs(pair.rise)>1e-6?"VERTICAL" as const:pair.connectionClass},ramp:true})),
      ...routes.filter(r=>!r.name.includes("switchback")).map(r=>({name:r.name+" stair",pair:{...r.pair,connectionClass:"VERTICAL" as const},ramp:false}))];
    for(const route of candidates){
      if(outcomes.length>=limits.candidates)break;
      const climbingRun=route.pair.path!.slice(1).reduce((sum,p,i)=>sum+(Math.abs(p[2]-route.pair.path![i][2])>1e-6?Math.hypot(p[0]-route.pair.path![i][0],p[1]-route.pair.path![i][1]):0),0);
      if(planRun(route.pair.path!)>limits.connectorFeet){outcomes.push({level,route:route.name,reason:"connector length limit"});continue;}
      if(route.ramp&&climbingRun+1e-6<12*Math.abs(pair.rise)){outcomes.push({level,route:route.name,reason:"insufficient climbing run",details:{requiredRampRun:12*Math.abs(pair.rise),climbingRun}});continue;}
      if(route.ramp){const fit=fitAdaptiveRampElevation(route.pair);if(fit.fitted)route.pair=fit.pair;else if(fit.reason==="insufficient ribbon climbing run"){outcomes.push({level,route:route.name,reason:fit.reason,details:fit});continue;}}
      if(!acceptCirculationClass(route.pair)){outcomes.push({level,route:route.name,reason:"existing circulation class gate"});continue;}
      const result=validateCirculationConnection(route.pair,effective,tiles,options.existing??[],{maxRun:limits.connectorFeet,routeName:route.name});
      outcomes.push({level,route:route.name,reason:result.reason,details:{validation:result.details,requiredRampRun:12*Math.abs(pair.rise),climbingRun}});
      if(result.reason==="accepted")return {pair:route.pair,meshes:transitionMeshes(route.pair)};
    }
  };
  let accepted=evaluate(structuredClone(original),models,1);
  for(const relocated of options.relocated??[])if(!accepted&&outcomes.length<limits.candidates)accepted=evaluate(structuredClone(relocated),models,2);
  let adaptation:ReturnType<typeof deriveAdaptedAssembly>|undefined;
  const proposals=options.proposals??(options.generateLandings?[proposeAdaptiveLanding(original,"A",models,tiles,limits),proposeAdaptiveLanding(original,"B",models,tiles,limits)].filter((p):p is AdaptationProposal=>!!p):[]);
  if(!accepted&&proposals.length){
    adaptation=deriveAdaptedAssembly(api,models,tiles,original,proposals,options.mode,limits,options.existing);
    if(adaptation.valid){
      const existingPairs=[...new Set((options.existing??[]).map(surface=>surface.portPair).filter((p):p is PortPair=>!!p))];
      for(const existingPair of existingPairs){
        const result=validateCirculationConnection(existingPair,adaptation.models,tiles,(options.existing??[]).filter(surface=>surface.portPair!==existingPair));
        if(result.reason!=="accepted")return {status:"FAIL" as const,accepted:undefined,outcomes:[...outcomes,{level:3,route:"preserve existing circulation",reason:result.reason}],adaptation,confirmedEdges:[],geometry:[],supportVerification:"unverified",internalContinuity:"local interfaces only; wider internal circulation unverified",ms:performance.now()-started};
      }
      const adaptedPair=structuredClone(original);
      for(const proposal of proposals)if(proposal.operation==="landing"){
        const source=proposal.sourceId===original.tileA,direction=source?original.startDirection:original.endDirection;
        if(!direction)continue;
        const size=dimensions(proposal.box),depth=direction[0]?size[0]:size[1],point=source?adaptedPair.from:adaptedPair.to;
        const shifted=point.map((v,k)=>v+direction[k]*depth) as Vec3;
        if(source){adaptedPair.from=shifted;adaptedPair.startProfile=undefined;}else{adaptedPair.to=shifted;adaptedPair.endProfile=undefined;}
      }
      adaptedPair.plan=Math.hypot(adaptedPair.to[0]-adaptedPair.from[0],adaptedPair.to[1]-adaptedPair.from[1]);
      adaptedPair.rise=adaptedPair.to[2]-adaptedPair.from[2];adaptedPair.distance=Math.hypot(adaptedPair.plan,adaptedPair.rise);adaptedPair.path=undefined;
      accepted=evaluate(adaptedPair,adaptation.models,proposals.some(p=>p.operation==="opening")?4:3);
    }
    else outcomes.push({level:3,route:"adaptation",reason:adaptation.reason});
  }
  return {status:accepted?"PASS" as const:"FAIL" as const,accepted,outcomes,adaptation,
    confirmedEdges:accepted?[{tileA:accepted.pair.tileA,tileB:accepted.pair.tileB}]:[],
    geometry:accepted?[...(adaptation?.geometry??[]),...accepted.meshes.map(surface=>({category:"circulation" as const,sourceId:original.tileA,surface}))]:[],
    supportVerification:adaptation?.valid&&adaptation.records.some(r=>r.operation==="column")?"geometric bearing and conceptual support only; structural engineering unverified":"no generated support verified; structural engineering unverified",
    internalContinuity:"local interfaces only; wider internal circulation unverified",ms:performance.now()-started};
}
