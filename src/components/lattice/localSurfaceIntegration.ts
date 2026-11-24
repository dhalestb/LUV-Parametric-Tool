import type { ManifoldToplevel, CrossSection } from "manifold-3d";
import type { TileModel, PlacedTile, Vec3, PortPair } from "./types";
import type { ConnectorSurface } from "./connectionClearance";
import { surfaceOrientation, sourceMaterialAtPoint } from "./surfaceOrientation";
import { worldFromLocal, localPoint } from "./surfaceAttachment";
import { geometryRevision, beginGeometryValidation } from "./geometryRevision";
import { DEFAULT_ADAPTATION_LIMITS, type AdaptationMode, type AdaptationLimits, fitAdaptiveRampElevation } from "./adaptiveGeometry";
import { acceptCirculationClass, validateCirculationConnection } from "./portConnectionValidation";
import { transitionMeshes, planRun } from "./transitionGeometry";
import { auditGeneratedSurface } from "./connectionClearance";
import { preciseKernelCopy } from "./extensionReconstruction";

type XY = [number, number];
export type SurfaceProvenance = { sourceId:string; sourceRevision:number; sourceTriangles:number[]; coordinates:"world-feet-z-up"; operation:string };
export type LocalPatch = { valid:boolean; reason:string; provenance:SurfaceProvenance; polygons:XY[][]; triangles:Array<{id:number;points:Vec3[]}>; z:number; region:number; boundaryEdges:number; ambiguous:number; ms:number };
export type SurfaceAddition = { category:"landing"|"support"|"circulation"|"derived-form"; surface:ConnectorSurface; provenance:SurfaceProvenance };
function localFloorHeight(point:Vec3,triangles:Array<{points:Vec3[]}>) {
 let best=Infinity,z=NaN;
 for(const {points:[a,b,c]}of triangles){const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-12)continue;const s=((point[0]-a[0])*vy-(point[1]-a[1])*vx)/det,t=(ux*(point[1]-a[1])-uy*(point[0]-a[0]))/det;
  let distance=s>=-1e-8&&t>=-1e-8&&s+t<=1+1e-8?0:Infinity;
  for(const [p,q]of [[a,b],[b,c],[c,a]]){const dx=q[0]-p[0],dy=q[1]-p[1],length=dx*dx+dy*dy,u=length?Math.max(0,Math.min(1,((point[0]-p[0])*dx+(point[1]-p[1])*dy)/length)):0;distance=Math.min(distance,Math.hypot(point[0]-p[0]-u*dx,point[1]-p[1]-u*dy));}
  if(distance<best){best=distance;z=a[2]+s*(b[2]-a[2])+t*(c[2]-a[2]);}
 }
 return z;
}
const area = (p:XY[]) => p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const near = (a:Vec3,b:Vec3) => Math.hypot(...a.map((v,k)=>v-b[k]));
const mesh = (s:ReturnType<ManifoldToplevel["Manifold"]["cube"]>):ConnectorSurface => {const m=s.getMesh();return {positions:m.vertProperties.slice(),indices:Array.from(m.triVerts)};};
const patchCache = new WeakMap<object,Map<string,LocalPatch>>();

/** A local planar physical floor patch, independent of whole-object solid status.
 * Geometric edge adjacency is inherited from the physical-side classifier (1e-5 ft
 * coordinate keys). A union reconstructs boundary loops but never fills holes.
 * Open sheets can be extracted as geometric evidence, but are not asserted to be
 * physical walking floors without the existing classifier's material evidence.
 */
export function extractLocalSurface(api:ManifoldToplevel,model:TileModel,tile:PlacedTile,point:Vec3,extent=6):LocalPatch {
 const finish=beginGeometryValidation(),start=performance.now();
 try {
  if(!model.connectionSurface)throw new Error("missing source geometry");
  const revision=geometryRevision(model.connectionSurface),key=JSON.stringify([tile,model.variants[tile.variant],point,extent]);
  let entries=patchCache.get(revision);if(!entries){entries=new Map();patchCache.set(revision,entries);}
  const cached=entries.get(key);if(cached)return structuredClone(cached);
  const metadata=surfaceOrientation(model.connectionSurface);
  const nearby=metadata.triangles.map((t,id)=>({id,t,points:t.points.map(p=>worldFromLocal(p,tile,model))})).filter(t=>t.points.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<=extent));
  const floors=nearby.filter(t=>t.t.normalZ>=.7&&t.points.every(p=>Math.abs(p[2]-point[2])<=1e-4));
  const seed=floors.slice().sort((a,b)=>Math.min(...a.points.map(p=>near(p,point)))-Math.min(...b.points.map(p=>near(p,point))))[0];
  const chosen=seed?nearby.filter(t=>t.t.normalZ>=.7&&t.t.region===seed.t.region):[];
  const pieces=chosen.map(t=>{let p=t.points.map(p=>[p[0],p[1]] as XY);if(area(p)<0)p=p.reverse();return new api.CrossSection([p]);});
  const union=pieces.length?api.CrossSection.union(pieces):api.CrossSection.square([0,0]);
  try {
   const polygons=union.toPolygons() as XY[][];
   const rawArea=chosen.reduce((n,t)=>n+Math.abs(area(t.points.map(p=>[p[0],p[1]] as XY))),0);
   const overlap=rawArea-union.area();
   const result:LocalPatch={valid:chosen.length>0&&overlap<=1e-6,reason:!chosen.length?"no locally verified planar physical floor":overlap>1e-6?"overlapping local floors":"locally verified physical floor; global solid not required",provenance:{sourceId:tile.id,sourceRevision:revision.id,sourceTriangles:chosen.map(t=>t.id),coordinates:"world-feet-z-up",operation:"local floor extraction"},polygons,triangles:chosen.map(t=>({id:t.id,points:t.points})),z:point[2],region:seed?.t.region??-1,boundaryEdges:polygons.reduce((n,p)=>n+p.length,0),ambiguous:nearby.filter(t=>!Number.isFinite(t.t.normalZ)).length,ms:performance.now()-start};
   if(entries.size>=64)entries.delete(entries.keys().next().value!);entries.set(key,result);return structuredClone(result);
  }finally{union.delete();pieces.forEach(p=>p.delete());}
 }finally{finish();}
}

/** Geometric extraction for explicitly open sheets: reports orientation and
 * topology, not an inferred material side or circulation PASS. */
export function inspectOpenSurface(model:TileModel) {
 const s=model.connectionSurface;if(!s)return {valid:false,reason:"missing surface",boundaryEdges:0,ambiguousEdges:0};
 const edges=new Map<string,number>(),normals:Vec3[]=[];
 for(let i=0;i<s.triangles.length;i+=3){const p=s.triangles.slice(i,i+3).map(v=>Array.from(s.positions.slice(v*3,v*3+3)) as Vec3),u=p[1].map((v,k)=>v-p[0][k]),v=p[2].map((v,k)=>v-p[0][k]),n:Vec3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);if(len<1e-9)return {valid:false,reason:"degenerate local triangle",boundaryEdges:0,ambiguousEdges:0};normals.push(n.map(v=>v/len) as Vec3);for(let k=0;k<3;k++){const key=[p[k],p[(k+1)%3]].map(p=>p.map(v=>v.toFixed(5)).join(",")).sort().join("|");edges.set(key,(edges.get(key)??0)+1);}}
 const ambiguousEdges=[...edges.values()].filter(n=>n>2).length,consistent=normals.every(n=>n[2]>=.7);
 return {valid:consistent&&!ambiguousEdges,reason:consistent&&!ambiguousEdges?"oriented open surface extracted; physical walking side unverified":"ambiguous local surface",boundaryEdges:[...edges.values()].filter(n=>n===1).length,ambiguousEdges,normals};
}

const prism=(api:ManifoldToplevel,section:CrossSection,z:number,thickness=.25)=>{const raw=section.extrude(thickness),placed=raw.translate([0,0,z-thickness]);try{return mesh(placed);}finally{raw.delete();placed.delete();}};
const onBoundary=(p:Vec3,loops:XY[][])=>loops.some(loop=>loop.some((a,i)=>{const b=loop[(i+1)%loop.length],dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d:-1;return t>=-1e-6&&t<=1+1e-6&&Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=1e-5;}));
function effectiveWithAdditions(model:TileModel,tile:PlacedTile,additions:ConnectorSurface[]):TileModel {
 const source=model.connectionSurface!;const positions=Array.from(source.positions),triangles=source.triangles.slice();
 for(const addition of additions){const offset=positions.length/3;for(let i=0;i<addition.positions.length;i+=3)positions.push(...localPoint(Array.from(addition.positions.slice(i,i+3)) as Vec3,tile,model));const mirrored=model.variants[tile.variant].mirror!=="none";for(let i=0;i<addition.indices.length;i+=3){const f=addition.indices.slice(i,i+3);if(mirrored)[f[1],f[2]]=[f[2],f[1]];triangles.push(...f.map(v=>v+offset));}}
 return {...model,connectionSurface:{positions:new Float32Array(positions),triangles}};
}

/** Polygonal completion uses true floor union/difference, not its bounding box.
 * It never overlays existing floor or removes source triangles. Contact is only
 * permitted on the exact common footprint boundary below the verified floor.
 */
export function completeLocalLanding(api:ManifoldToplevel,model:TileModel,tile:PlacedTile,point:Vec3,footprint:XY[],models:TileModel[],tiles:PlacedTile[],limits:AdaptationLimits=DEFAULT_ADAPTATION_LIMITS) {
 const start=performance.now(),patch=extractLocalSurface(api,model,tile,point,limits.extentFeet),geometry:SurfaceAddition[]=[];
 const fail=(reason:string,details:unknown={})=>({valid:false,reason,patch,geometry,models,details,ms:performance.now()-start});
 if(!patch.valid)return fail(patch.reason);
 if(Object.values(limits).some(v=>!Number.isFinite(v)||v<=0))return fail("invalid limits");
 if(footprint.length<3||footprint.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])>limits.extentFeet))return fail("local extent limit");
 const desired=new api.CrossSection([area(footprint)<0?footprint.slice().reverse():footprint]),floor=new api.CrossSection(patch.polygons),missing=desired.subtract(floor),overlap=desired.intersect(floor);
 try {
  const missingArea=missing.area(),loops=missing.toPolygons() as XY[][];
  if(desired.area()<=0||Math.abs(desired.area()-Math.abs(area(footprint)))>1e-6)return fail("invalid or self-intersecting landing footprint");
  if(missingArea>limits.landingSquareFeet)return fail("added area limit",{missingArea});
  if(overlap.area()<1e-5)return fail("no original-floor overlap; internal access unverified",{missingArea});
  if(missingArea<1e-8)return {...fail("already supported"),valid:true,details:{missingArea,loops}};
    // Extend the adjacent piecewise-linear floor planes at the actual irregular
  // boundary. A flat overlay would misclassify existing undulating floor as a gap.
  const height=(p:Vec3)=>localFloorHeight(p,patch.triangles);
  const surface=prism(api,missing,point[2]);
  for(let i=0;i<surface.positions.length;i+=3){const p:Vec3=Array.from(surface.positions.slice(i,i+3)) as Vec3;surface.positions[i+2]+=height(p)-point[2];}
  if(surface.indices.length/3>limits.triangles)return fail("mesh complexity limit");
  geometry.push({category:"landing",surface,provenance:{...patch.provenance,operation:"polygonal missing-region completion"}});
  const contact=(p:Vec3,id:string)=>id===tile.id&&p[2]<=height(p)+1e-5&&p[2]>=height(p)-.25-1e-5&&onBoundary(p,patch.polygons)&&onBoundary(p,loops);
  const collision=auditGeneratedSurface(surface,models,tiles,contact);
  if(!collision.clear)return fail("landing intersects existing material",{missingArea,loops,collision});
  // A surface may fit between triangles yet be enclosed: do not waive the existing material guard.
  for(const loop of loops.filter(p=>area(p)>0)){const p:Vec3=[loop.reduce((s,p)=>s+p[0],0)/loop.length,loop.reduce((s,p)=>s+p[1],0)/loop.length,point[2]-.125];p[2]=height(p)-.125;for(const t of tiles){const m=models.find(m=>m.id===t.id)!;const state=sourceMaterialAtPoint(m.connectionSurface!,localPoint(p,t,m));if(state.material||state.uncertain)return fail("addition enclosed by material or uncertain source",{id:t.id,state,point:p,missingArea,loops});}}
  // Each missing island needs actual full-footprint bearing. A 0.5 ft square is
  // a conceptual column, not a structural capacity claim. No walking-headroom
  // requirement is incorrectly imposed on the lower bearing surface.
  const supports:ConnectorSurface[]=[];
  for(const loop of loops.filter(p=>area(p)>0)){
   const cx=loop.reduce((s,p)=>s+p[0],0)/loop.length,cy=loop.reduce((s,p)=>s+p[1],0)/loop.length;
   const bearingFoot:XY[]=[[cx-.25,cy-.25],[cx+.25,cy-.25],[cx+.25,cy+.25],[cx-.25,cy+.25]],columnFoot=new api.CrossSection([bearingFoot]),within=columnFoot.subtract(missing);
   try {
    if(bearingFoot.some(p=>Math.abs(height([p[0],p[1],point[2]])-point[2])>1e-5))return fail("nonplanar underside requires shaped support",{missingArea,loops,bearingFoot});
    if(within.area()>1e-7)return fail("missing region too narrow for verified column footprint",{missingArea,loops,bearingFoot});
    let chosen:{surface:ConnectorSurface;id:string;z:number}|undefined;
    for(const bt of tiles){const bm=models.find(m=>m.id===bt.id)!;const levels=[...new Set(surfaceOrientation(bm.connectionSurface!).triangles.filter(t=>t.normalZ>=.7).map(t=>worldFromLocal(t.points[0],bt,bm)[2]).filter(z=>z<point[2]-.25&&point[2]-z<=limits.extentFeet))].sort((a,b)=>b-a);
     for(const z of levels){const bp=extractLocalSurface(api,bm,bt,[cx,cy,z],limits.extentFeet);if(!bp.valid)continue;const bf=new api.CrossSection(bp.polygons),gap=columnFoot.subtract(bf);const covered=gap.area()<1e-7;gap.delete();bf.delete();if(!covered)continue;const column=prism(api,columnFoot,point[2]-.25,point[2]-.25-z);const check=auditGeneratedSurface(column,models,tiles,(p,id)=>id===bt.id&&Math.abs(p[2]-z)<1e-5);if(check.clear){chosen={surface:column,id:bt.id,z};break;}}
     if(chosen)break;
    }
    if(!chosen)return fail("no collision-free physical bearing within extent",{missingArea,loops,bearingFoot});
    supports.push(chosen.surface);if(supports.length>limits.supports)return fail("support count limit");
    geometry.push({category:"support",surface:chosen.surface,provenance:{...patch.provenance,operation:`conceptual column bearing on ${chosen.id} at ${chosen.z}`}});
   }finally{within.delete();columnFoot.delete();}
  }
    const effective=models.map(m=>m.id===model.id?effectiveWithAdditions(m,tile,[surface,...supports]):m);
  const landingCheck=validatePolygonalLanding(api,effective.find(m=>m.id===model.id)!,tile,point,footprint,effective,tiles);
  if(!landingCheck.valid)return fail("reconstructed landing: "+landingCheck.reason,landingCheck);
  return {valid:true,reason:"local additive completion; circulation requires strict validation",patch,geometry,models:effective,details:{missingArea,loops,conceptualSupports:supports.length,structuralEngineering:"unverified"},ms:performance.now()-start};
 }finally{desired.delete();floor.delete();missing.delete();overlap.delete();}
}

/** Local closed-component cut. Unrelated nonmanifold components remain intact.
 * An open/ambiguous selected volume is rejected, never silently capped. */
export function cutLocalComponent(api:ManifoldToplevel,model:TileModel,tile:PlacedTile,triangleIds:number[],tool:ConnectorSurface,mode:AdaptationMode,limits:AdaptationLimits=DEFAULT_ADAPTATION_LIMITS) {
 if(mode!=="Allow Derived Adaptation")throw new Error("derived removal requires explicit opt-in");
 const source=model.connectionSurface!;if(!triangleIds.length||new Set(triangleIds).size!==triangleIds.length||triangleIds.some(i=>!Number.isInteger(i)||i<0||i>=source.triangles.length/3))throw new Error("invalid source triangle selection");
 const world=new Float32Array(source.positions.length);for(let i=0;i<world.length;i+=3)world.set(worldFromLocal(Array.from(source.positions.slice(i,i+3)) as Vec3,tile,model),i);
 const indices=triangleIds.flatMap(i=>{const f=source.triangles.slice(i*3,i*3+3);if(model.variants[tile.variant].mirror!=="none")[f[1],f[2]]=[f[2],f[1]];return f;});
 const raw=new api.Mesh({numProp:3,vertProperties:world,triVerts:Uint32Array.from(indices)});raw.merge();
 const solid=new api.Manifold(raw),roundedCutter=new api.Manifold(new api.Mesh({numProp:3,vertProperties:Float32Array.from(tool.positions),triVerts:Uint32Array.from(tool.indices)}));
 let cutter=roundedCutter;
 if(tool.positions instanceof Float64Array){try{cutter=preciseKernelCopy(roundedCutter,tool.positions);}catch(error){solid.delete();throw error;}finally{roundedCutter.delete();}}
 try {
  if(solid.status()!=="NoError"||solid.volume()<=0||cutter.status()!=="NoError")throw new Error("ambiguous local material volume");
  const box=solid.boundingBox();if(box.max.some((v,k)=>v-box.min[k]>limits.extentFeet))throw new Error("local solid extent limit");
  const result=solid.subtract(cutter);try{const removed=solid.volume()-result.volume();if(result.status()!=="NoError"||removed<=0||removed>limits.removedCubicFeet||result.numTri()>limits.triangles)throw new Error("invalid or excessive local cut");const selected=new Set(triangleIds),kept={...model,connectionSurface:{positions:source.positions.slice(),triangles:source.triangles.filter((_,i)=>!selected.has(Math.floor(i/3)))}};const surface=mesh(result);return {model:effectiveWithAdditions(kept,tile,[surface]),removed,provenance:{sourceId:tile.id,sourceRevision:geometryRevision(source).id,sourceTriangles:triangleIds.slice(),coordinates:"world-feet-z-up" as const,operation:"verified local closed-component cut"}};}finally{result.delete();}
 }finally{solid.delete();cutter.delete();}
}

/** Adaptive cubic sampling: maximum chord 0.5 ft, midpoint deviation 0.005 ft.
 * Endpoint tangents follow actual interfaces. Elevation is fitted to walking-edge
 * travel by the prior adapter; flat segments never buy climbing distance. */
export function organicRoute(pair:PortPair,bend=0) {
 const next=structuredClone(pair),a=pair.from,b=pair.to,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),da=pair.startDirection??[dx/length,dy/length,0],db=pair.endDirection??[-dx/length,-dy/length,0],h=Math.min(6,length*.35);
 const c=a.map((v,k)=>v+da[k]*h) as Vec3,d=b.map((v,k)=>v+db[k]*h) as Vec3;
 const at=(t:number):Vec3=>{const u=1-t,bump=16*t*t*u*u;return [u*u*u*a[0]+3*u*u*t*c[0]+3*u*t*t*d[0]+t*t*t*b[0]-dy/length*bend*bump,u*u*u*a[1]+3*u*u*t*c[1]+3*u*t*t*d[1]+t*t*t*b[1]+dx/length*bend*bump,a[2]+t*(b[2]-a[2])];};
 const path:Vec3[]=[a];const sample=(ta:number,tb:number,depth:number)=>{const p=at(ta),q=at(tb),mid=at((ta+tb)/2),deviation=Math.hypot(mid[0]-(p[0]+q[0])/2,mid[1]-(p[1]+q[1])/2);if(depth<12&&(Math.hypot(q[0]-p[0],q[1]-p[1])>.5||deviation>.005)){sample(ta,(ta+tb)/2,depth+1);sample((ta+tb)/2,tb,depth+1);}else path.push(q);};sample(0,1,0);
 // Existing stair meshing interpolates section indices. Equal arc-length samples
 // make those indices represent walking distance rather than spline parameter.
 const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
 const total=lengths.at(-1)!,count=Math.max(2,Math.ceil(total/.25)),uniform:Vec3[]=[];let segment=1;
 for(let i=0;i<=count;i++){const distance=total*i/count;while(segment<path.length-1&&lengths[segment]<distance)segment++;const lo=path[segment-1],hi=path[segment],t=(distance-lengths[segment-1])/(lengths[segment]-lengths[segment-1]||1);uniform.push(lo.map((v,k)=>v+(hi[k]-v)*t) as Vec3);}uniform[0]=a;uniform[uniform.length-1]=b;next.path=uniform;
 const fit=fitAdaptiveRampElevation(next);return fit.fitted?fit.pair:next;
}

export function evaluateLocalSurfaceConnection(api:ManifoldToplevel,models:TileModel[],tiles:PlacedTile[],original:PortPair,options:{enabled?:boolean;limits?:AdaptationLimits;milliseconds?:number}={}) {
 const start=performance.now(),limits=options.limits??DEFAULT_ADAPTATION_LIMITS,outcomes:Array<{route:string;reason:string;details?:unknown}>=[],geometry:SurfaceAddition[]=[],proposals:SurfaceAddition[]=[];
 if(!options.enabled)return {status:"DISABLED",outcomes,geometry,confirmedEdges:[],ms:performance.now()-start};
 let effective=models;
 for(const side of ["A","B"] as const){const id=side==="A"?original.tileA:original.tileB,point=side==="A"?original.from:original.to,direction=side==="A"?original.startDirection:original.endDirection,width=side==="A"?original.startWidth:original.endWidth;const m=effective.find(m=>m.id===id),tile=tiles.find(t=>t.id===id);if(!m||!tile||!direction||!width)continue;
  const depth=Math.max(3,width),foot:XY[]=[[0,-width/2],[depth,-width/2],[depth,width/2],[0,width/2]].map(([x,y])=>[point[0]-direction[0]*x-direction[1]*y,point[1]-direction[1]*x+direction[0]*y]);
  const completion=completeLocalLanding(api,m,tile,point,foot,effective,tiles,limits);outcomes.push({route:`${side} local completion`,reason:completion.reason,details:{completion:completion.details,patch:completion.patch}});proposals.push(...completion.geometry);if(completion.valid){effective=completion.models;geometry.push(...completion.geometry);}
 }
 for(const stair of [false,true])for(const bend of [0,1,-1,2,-2,4,-4]){if(outcomes.length>=limits.candidates||performance.now()-start>(options.milliseconds??30000))return {status:"FAIL",reason:"bounded evaluation budget",outcomes,geometry:[],proposals,confirmedEdges:[],ms:performance.now()-start};const pair=organicRoute(original,bend);pair.connectionClass=stair?"VERTICAL":"ADAPTIVE";if(planRun(pair.path!)>limits.connectorFeet){outcomes.push({route:`${bend}`,reason:"travel limit"});continue;}if(!acceptCirculationClass(structuredClone(pair))){outcomes.push({route:`${bend}`,reason:"existing circulation class gate"});continue;}const result=validateCirculationConnection(pair,effective,tiles,[],{maxRun:limits.connectorFeet});outcomes.push({route:`${stair?"stair":"ramp"} bend ${bend}`,reason:result.reason,details:result.details});if(result.reason==="accepted"){const meshes=transitionMeshes(pair);return {status:"PASS",pair,meshes,effectiveModels:effective,outcomes,geometry,proposals,confirmedEdges:[{tileA:pair.tileA,tileB:pair.tileB}],ms:performance.now()-start};}}
 return {status:"FAIL",outcomes,geometry:[],proposals,confirmedEdges:[],ms:performance.now()-start};
}



/** Independent continuous coverage and headroom check for a nonrectangular
 * planar landing. Geometrically coincident edges may connect separate source
 * islands; positive-area overlap, gaps and disputed material faces are rejected.
 */
export function validatePolygonalLanding(api:ManifoldToplevel,model:TileModel,tile:PlacedTile,point:Vec3,footprint:XY[],models:TileModel[],tiles:PlacedTile[]) {
 const desired=new api.CrossSection([area(footprint)<0?footprint.slice().reverse():footprint]),pieces:CrossSection[]=[];
 try {
  let sum=0;const metadata=surfaceOrientation(model.connectionSurface!);
  for(const t of metadata.triangles){if(!(t.normalZ>=.7))continue;const p=t.points.map(p=>worldFromLocal(p,tile,model));if(p.some(v=>Math.abs(v[2]-point[2])>1e-4))continue;let loop=p.map(p=>[p[0],p[1]] as XY);if(area(loop)<0)loop=loop.reverse();const face=new api.CrossSection([loop]);const clipped=face.intersect(desired);face.delete();if(clipped.area()>1e-9){sum+=clipped.area();pieces.push(clipped);}else clipped.delete();}
  if(!pieces.length)return {valid:false,reason:"no physical floor under polygon"};
  const coverage=api.CrossSection.union(pieces),gap=desired.subtract(coverage);try{if(gap.area()>1e-6||sum-coverage.area()>1e-6)return {valid:false,reason:"actual polygon footprint has gaps or overlapping floor",missingArea:gap.area(),overlapArea:sum-coverage.area()};}finally{coverage.delete();gap.delete();}
  const volume=prism(api,desired,point[2]+6.5,6.45),clearance=auditGeneratedSurface(volume,models,tiles);
  if(!clearance.clear)return {valid:false,reason:"polygonal landing swept headroom",clearance};
  const inside=(p:Vec3)=>{let count=0;for(let i=0,j=footprint.length-1;i<footprint.length;j=i++){const a=footprint[i],b=footprint[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])count++;}return count%2===1;};
  for(const t of tiles){const m=models.find(m=>m.id===t.id);if(!m?.connectionSurface)return {valid:false,reason:"missing obstruction geometry"};for(const p of footprint){const state=sourceMaterialAtPoint(m.connectionSurface,localPoint([p[0],p[1],point[2]+.1],t,m));if(state.material||state.uncertain)return {valid:false,reason:"polygonal clearance enclosed by material or uncertain source",sourceId:t.id};}for(let i=0;i<m.connectionSurface.positions.length;i+=3){const p=worldFromLocal(Array.from(m.connectionSurface.positions.slice(i,i+3)) as Vec3,t,m);if(p[2]>point[2]+.05&&p[2]<point[2]+6.5&&inside(p))return {valid:false,reason:"obstacle enclosed in landing clearance",sourceId:t.id,point:p};}}
  return {valid:true,reason:"full polygonal floor coverage and swept headroom",area:desired.area()};
 }finally{desired.delete();pieces.forEach(p=>p.delete());}
}



/** Explicitly reconstruct a declared upward open floor sheet as a local derived
 * slab. This is construction of new material, not inference of a solid from OBJ
 * winding. A complete, independently classified bearing footprint is mandatory.
 * The canonical sheet and all unrelated source triangles remain untouched. */
export function reconstructOpenFloor(api:ManifoldToplevel,model:TileModel,tile:PlacedTile,triangleIds:number[],bearing:TileModel,bearingTile:PlacedTile,models:TileModel[],tiles:PlacedTile[],options:{mode:AdaptationMode;declaredWalkingSide?:"up";thickness?:number},limits:AdaptationLimits=DEFAULT_ADAPTATION_LIMITS) {
 if(options.mode!=="Allow Derived Adaptation"||options.declaredWalkingSide!=="up")throw new Error("explicit local reconstruction and walking-side declaration required");
 const source=model.connectionSurface!,thickness=options.thickness??.25;
 if(!Number.isFinite(thickness)||thickness<=0||thickness>.25||!triangleIds.length||new Set(triangleIds).size!==triangleIds.length||triangleIds.some(i=>!Number.isInteger(i)||i<0||i>=source.triangles.length/3))throw new Error("invalid sheet selection or thickness");
 const selected=new Set(triangleIds),points=triangleIds.flatMap(i=>source.triangles.slice(i*3,i*3+3).map(v=>worldFromLocal(Array.from(source.positions.slice(v*3,v*3+3)) as Vec3,tile,model))),z=points[0][2];
 if(points.some(p=>Math.abs(p[2]-z)>1e-4)||[0,1].some(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k]))>limits.extentFeet))throw new Error("nonplanar or excessive open patch");
 const pieces:CrossSection[]=[];
 try {
  for(let i=0;i<points.length;i+=3){const p=points.slice(i,i+3).map(p=>[p[0],p[1]] as XY);if(area(p)<=1e-9)throw new Error("ambiguous sheet orientation");pieces.push(new api.CrossSection([p]));}
  const floor=api.CrossSection.union(pieces);try{
   if(floor.area()>limits.landingSquareFeet||Math.abs(pieces.reduce((s,p)=>s+p.area(),0)-floor.area())>1e-6)throw new Error("overlapping or excessive sheet reconstruction");
   const loops=floor.toPolygons() as XY[][];if(loops.filter(p=>area(p)>0).length!==1)throw new Error("disconnected sheet islands");
   const center:Vec3=[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length,z-thickness];
   const bp=extractLocalSurface(api,bearing,bearingTile,center,limits.extentFeet);if(!bp.valid)throw new Error("unverified sheet bearing");
   const bearingFloor=new api.CrossSection(bp.polygons),missing=floor.subtract(bearingFloor);try{if(missing.area()>1e-6||bp.triangles.some(t=>t.points.some(p=>Math.abs(p[2]-(z-thickness))>1e-4)))throw new Error("incomplete or nonlevel sheet bearing");}finally{bearingFloor.delete();missing.delete();}
   const surface=prism(api,floor,z,thickness),kept={...model,connectionSurface:{positions:source.positions.slice(),triangles:source.triangles.filter((_,i)=>!selected.has(Math.floor(i/3)))}};
   const effective=models.map(m=>m.id===model.id?kept:m),collision=auditGeneratedSurface(surface,effective,tiles,(p,id)=>id===bearingTile.id&&Math.abs(p[2]-(z-thickness))<=1e-5);if(!collision.clear)throw new Error("reconstructed sheet intersects other geometry");
   const next=effectiveWithAdditions(kept,tile,[surface]);return {model:next,models:effective.map(m=>m.id===model.id?next:m),surface,provenance:{sourceId:tile.id,sourceRevision:geometryRevision(source).id,sourceTriangles:triangleIds.slice(),coordinates:"world-feet-z-up" as const,operation:"declared open floor reconstructed with independently covered bearing"},addedVolume:floor.area()*thickness,structuralEngineering:"unverified"};
  }finally{floor.delete();}
 }finally{pieces.forEach(p=>p.delete());}
}



