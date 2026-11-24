import { analyzeMesh } from "./analyze";
import { geometryRevision } from "./geometryRevision";
import { surfaceOrientation } from "./surfaceOrientation";
import { auditDerivedSelfIntersections } from "./connectionClearance";
import { certifyWorkingMaterial, refineWorkingRegion, extensionGeometryKernel } from "./extensionReconstruction";
import { completeLocalLanding } from "./localSurfaceIntegration";
import { DEFAULT_ADAPTATION_LIMITS } from "./adaptiveGeometry";
import { localPoint, worldFromLocal } from "./surfaceAttachment";
import { validateWalkingApproach } from "./walkingApproach";
import type { ConnectionFeature } from "./connectionFeatures";
import type { ImportedObj, PlacedTile, TileModel, Vec3 } from "./types";

export type FeatureAdaptationPlan={feature:ConnectionFeature;width:number;depth:number;setback:number;elevation:number;datum?:"interior"|"boundary"};
export type FeatureAdaptationProvenance={sourceId:string;sourceRevision:number;featureId:string;featureKind:ConnectionFeature["kind"];
  operation:"localized material-column reconstruction"|"open-shell local floor completion";plan:FeatureAdaptationPlan;changedVertices:number[];changedTriangles:number[];
  maximumDisplacement:number;originalPoint:Vec3;reconstructedPoint:Vec3;additionalExternalRun:number;
  sourceGeometry:"UNCHANGED";workingTopology:"CONFORMING_REFINED_COPY"|"OPEN_SHELL_ADDITIVE_COPY";material:"VERIFIED"|"OPEN_SHELL_LOCAL";selfIntersection:"VERIFIED";
  circulation:"UNVERIFIED";structuralCapacity:"UNVERIFIED";openShell?:{missingArea?:number;supports?:number;reason?:string}};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
export type FeatureAdaptationResult=ReturnType<typeof adaptFeatureLanding>;

type RefinedSurface={positions:Float32Array;faces:Array<{vertices:number[];source:number}>};

/** Moves upper/underside/side vertices together on a PRIVATE full-mesh copy.
 * The compact field has a flat landing core and a smooth blend back into the
 * unchanged source. Neither the new landing nor source approach earns a PASS
 * here: the shared validator checks the completed working surface and route.
 * Sparse, unsupported or invalid material fails explicitly. */
export function adaptFeatureLanding(model:TileModel,plan:FeatureAdaptationPlan){
  const start=performance.now(),source=model.connectionSurface;
  const fail=(reason:string,witness?:unknown)=>({valid:false as const,reason,witness,ms:performance.now()-start});
  if(!source)return fail("missing source geometry");
  if(source.triangles.length/3>50000||source.positions.length/3>80000)return fail("complete working-mesh budget; no geometry omitted");
  // Signed setback: negative values extend an existing material column to
  // provide a landing. The source stays immutable; all movement, closure,
  // source-continuation, packing and circulation gates remain mandatory.
  if(![plan.width,plan.depth,plan.setback,plan.elevation].every(Number.isFinite)||plan.width<2||plan.width>4||plan.depth<2||plan.depth>4||plan.setback< -1||plan.setback>2||Math.abs(plan.elevation)>.5)return fail("invalid local reconstruction envelope");
  const metadata=surfaceOrientation(source),f=plan.feature,p0=f.point,n=f.outward,side:Vec3=[-n[1],n[0],0];
  // Closed-solid column reconstruction remains preferred. Open architectural
  // sheets (boundary edges) cannot use Manifold solid certification; they fall
  // through to adaptOpenShellFeatureLanding via workingLanding instead of a
  // hard stop that made every real-OBJ adaptation appear impossible.
  if(metadata.components.some(c=>c.boundaryEdges||c.inconsistentEdges||c.uncertainty))return fail("closed working material unavailable; local open-shell reconstruction UNVERIFIED");
  // A nearby upper triangle may belong to another branch or floor. Reconstruct
  // from this feature's connected walking region, never from whichever stacked
  // surface happens to be numerically closest to the endpoint elevation.
  const upper=metadata.triangles.filter(t=>t.region===f.region&&t.normalZ>=.65);
  const height=(x:number,y:number)=>{
    let best=Infinity,z=NaN,nearest=Infinity;
    for(const t of upper){const [a,b,c]=t.points,ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-12)continue;
      const u=((x-a[0])*vy-(y-a[1])*vx)/det,v=(ux*(y-a[1])-uy*(x-a[0]))/det,h=a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
      let distance=u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7?0:Infinity,measured=h;
      for(let j=0;j<3;j++){const s=t.points[j],e=t.points[(j+1)%3],dx=e[0]-s[0],dy=e[1]-s[1],q=Math.max(0,Math.min(1,((x-s[0])*dx+(y-s[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x-s[0]-q*dx,y-s[1]-q*dy);if(d<distance){distance=d;measured=s[2]+q*(e[2]-s[2]);}}
      const rank=distance+Math.abs(measured-p0[2])*.001;if(distance<1.5&&rank<best){best=rank;z=measured;nearest=distance;}
    }return {z,distance:nearest};
  };
  // Choose the measured interior walking elevation, not a user-invented datum.
  const interior=height(p0[0]-n[0]*plan.depth,p0[1]-n[1]*plan.depth),boundary=height(p0[0],p0[1]),inner=interior.z;
  if(plan.datum==="boundary"){
    if(!Number.isFinite(boundary.z)||boundary.distance>1e-6||Math.abs(boundary.z-p0[2])>1e-5)return fail("boundary datum is not on the selected physical upper region");
  }else if(!Number.isFinite(inner)||interior.distance>1e-6)return fail("no physical interior surface behind feature");
  // Influence is not displacement: a thicker material layer needs room for a
  // continuous falloff. Every actual vertex movement remains capped at 1.5 ft.
  const verticalSupport=4.75;
  let refined:RefinedSurface;
  try{
    // Bound the physical displacement separately from the conforming private
    // subdivision. The source mesh itself is never subdivided or displaced.
    const corners=[-plan.depth-3.25,1.25].flatMap(a=>[-plan.width/2-2.25,plan.width/2+2.25].flatMap(b=>[-verticalSupport-.25,verticalSupport+.25].map(z=>[p0[0]+n[0]*a+side[0]*b,p0[1]+n[1]*a+side[1]*b,p0[2]+z] as Vec3)));
    const min=[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))) as Vec3,max=[0,1,2].map(k=>Math.max(...corners.map(p=>p[k]))) as Vec3;
    const mesh=refineWorkingRegion(model,min,max);
    refined={positions:mesh.positions,faces:Array.from({length:mesh.triangles.length/3},(_,i)=>({vertices:mesh.triangles.slice(i*3,i*3+3),source:mesh.sourceFaces[i]}))};
  }catch(error){return fail(String(error));}
  const basis=refined.positions,indices=refined.faces.flatMap(f=>f.vertices);
  const targetZ=(plan.datum==="boundary"?p0[2]:inner)+plan.elevation,positions=basis.slice(),changedVertices:number[]=[],changed=new Set<number>();let maximumDisplacement=0;
  for(let i=0;i<positions.length;i+=3){const p=Array.from(basis.slice(i,i+3)) as Vec3,dx=p[0]-p0[0],dy=p[1]-p0[1],a=dx*n[0]+dy*n[1],b=dx*side[0]+dy*side[1];
    if(a< -plan.depth-3||a>1||Math.abs(b)>plan.width/2+2||Math.abs(p[2]-p0[2])>verticalSupport)continue;
    const sample=height(p[0],p[1]),top=sample.z;if(!Number.isFinite(top))continue;
    // The old per-vertex top/depth cutoff jumped from full displacement to
    // zero inside a material wall, folding triangles across that boundary.
    // The field also fades beyond the measured upper footprint, so a beveled
    // underside does not encounter an abrupt nearest-surface cutoff.
    const horizontal=smooth((a+plan.depth+3)/2.5)*(1-smooth((a-.75)/.25))*(1-smooth((Math.abs(b)-plan.width/2-.6)/1.4))*(1-smooth(sample.distance/1.5));
    const correction=(targetZ-top)*horizontal;
    // Quintic smoothstep has maximum derivative 1.875. Allocate more of the
    // local influence to blending when the measured correction needs it. This
    // guarantees a vertical Jacobian >= 0.2; it does not waive the mesh audit.
    const fade=Math.max(1,Math.abs(correction)*1.875/.8),core=verticalSupport-fade;
    if(core<0)return fail("insufficient local vertical blend space",{vertex:i/3,correction,requiredFade:fade,support:verticalSupport,minimumJacobian:.2});
    const vertical=1-smooth((Math.abs(p[2]-p0[2])-core)/fade),weight=horizontal*vertical;
    if(!weight)continue;
    // Extension must stretch from an anchored interior root. Translating the
    // whole perimeter strip moves its courtyard boundary too and creates no
    // additional landing depth. Retraction behavior remains unchanged.
    const extensionRoot=plan.setback<0?smooth((a+plan.depth)/plan.depth):1;
    const shift=-plan.setback*weight*extensionRoot,dz=correction*vertical;
    // Expand the projection, then return continuously to its broad material
    // root. Multiplying b by a sharply decaying width factor reverses the
    // lateral map beside narrow tips and can fold otherwise valid triangles.
    const half=f.width/2,delta=f.kind==="branch"?Math.max(0,(plan.width-f.width)/2):0;
    const support=plan.width/2+2,absolute=Math.abs(b);
    const lateralProfile=absolute<=half?absolute/half:1-smooth((absolute-half)/(support-half));
    const axial=smooth((a+plan.depth+3)/2.5)*(1-smooth((a-.75)/.25));
    const lateralShift=Math.sign(b)*delta*lateralProfile*axial*vertical;
    if(Math.abs(dz)>f.envelope.maximumDisplacement)return fail("required floor correction exceeds measured feature adaptation envelope",{vertex:i/3,dz,maximum:f.envelope.maximumDisplacement});
    positions[i]=p[0]+n[0]*shift+side[0]*lateralShift;positions[i+1]=p[1]+n[1]*shift+side[1]*lateralShift;positions[i+2]=p[2]+dz;
    const distance=Math.hypot(positions[i]-p[0],positions[i+1]-p[1],positions[i+2]-p[2]);
    if(distance>f.envelope.maximumDisplacement)return fail("local displacement limit",{vertex:i/3,distance,maximum:f.envelope.maximumDisplacement});
    if(distance){maximumDisplacement=Math.max(maximumDisplacement,distance);changedVertices.push(i/3);changed.add(i/3);}
  }
  if(!changed.size)return fail("reconstruction leaves geometry unchanged");
  const changedTriangles:number[]=[];
  for(let i=0;i<indices.length;i+=3){const face=indices.slice(i,i+3);if(!face.some(v=>changed.has(v)))continue;changedTriangles.push(refined.faces[i/3].source);
    const p=face.map(v=>Array.from(positions.slice(v*3,v*3+3))),u=p[1].map((v,k)=>v-p[0][k]),v=p[2].map((v,k)=>v-p[0][k]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)return fail("degenerate reconstructed triangle",{face:i/3});
    if(face.some(v=>{const x=basis[v*3]-p0[0],y=basis[v*3+1]-p0[1];return Math.abs(x*n[0]+y*n[1])>8||Math.abs(x*side[0]+y*side[1])>6;}))return fail("sparse triangle carries reconstruction outside local envelope",{face:i/3});
  }
  // Diagnostic identity welding on indices only, matching the existing branch audit.
  const ids=new Map<string,number>(),representatives:number[]=[];
  for(let i=0;i<positions.length;i+=3){const key=Array.from(positions.slice(i,i+3)).join(','),id=ids.get(key)??i/3;ids.set(key,id);representatives.push(id);}
  const intersections=auditDerivedSelfIntersections({positions,indices:indices.map(i=>representatives[i])});
  if(!intersections.clear)return fail("working mesh self-intersection",intersections);
  const faces:ImportedObj["faces"]=[];for(let i=0;i<indices.length;i+=3)faces.push({vertices:indices.slice(i,i+3),normals:null});
  const working=analyzeMesh({id:model.id,filename:model.filename,positions:positions.map((v,i)=>v+model.anchor[i%3]),normals:new Float32Array(),faces,upAxis:"z"} as ImportedObj,model.slotId,1,"z",model.cellFeet,model.anchor);
  working.connectionSurface={positions,triangles:indices};working.sourceResponsiveExtensions=true;
  const material=certifyWorkingMaterial(working);if(material.status!=="VERIFIED")return fail("working material: "+material.reason);
  const reconstructedPoint:Vec3=[p0[0]-n[0]*plan.setback,p0[1]-n[1]*plan.setback,targetZ];
  const provenance:FeatureAdaptationProvenance={sourceId:model.id,sourceRevision:geometryRevision(source).id,featureId:f.id,featureKind:f.kind,operation:"localized material-column reconstruction",plan,changedVertices,changedTriangles:[...new Set(changedTriangles)],maximumDisplacement,originalPoint:[...p0],reconstructedPoint,additionalExternalRun:plan.setback,sourceGeometry:"UNCHANGED",workingTopology:"CONFORMING_REFINED_COPY",material:"VERIFIED",selfIntersection:"VERIFIED",circulation:"UNVERIFIED",structuralCapacity:"UNVERIFIED"};
  working.featureAdaptation=provenance;
  return {valid:true as const,model:working,provenance,point:reconstructedPoint,ms:performance.now()-start};
}

/**
 * Local floor completion for open architectural sheets. Source OBJ stays
 * immutable; derived triangles are appended only on a private working copy.
 * Negative setback extends a landing beyond the rim into the gap; positive
 * setback keeps the rim and fills the inward approach rectangle.
 * Circulation acceptance remains the caller's validateCirculationConnection.
 */
export function adaptOpenShellFeatureLanding(
  model:TileModel,
  tile:PlacedTile,
  models:TileModel[],
  tiles:PlacedTile[],
  feature:{id:string;kind:ConnectionFeature["kind"];point:Vec3;outward:Vec3;width:number},
  width:number,
  setback:number,
){
  const start=performance.now();
  const fail=(reason:string,witness?:unknown)=>({valid:false as const,reason,witness,ms:performance.now()-start});
  if(!model.connectionSurface)return fail("missing source geometry");
  if(![width,setback].every(Number.isFinite)||width<2||width>4||setback<-1||setback>2)return fail("invalid open-shell reconstruction envelope");
  const length=Math.hypot(feature.outward[0],feature.outward[1]);
  if(length<.99)return fail("missing open-shell approach direction");
  const n:Vec3=[feature.outward[0]/length,feature.outward[1]/length,0];
  const side:Vec3=[-n[1],n[0],0];
  const depth=Math.max(3,width);
  const outwardReach=setback<0?-setback:0;
  const inwardDepth=setback>0?Math.max(2,depth-setback):depth;
  const foot=[[-outwardReach,-width/2],[inwardDepth,-width/2],[inwardDepth,width/2],[-outwardReach,width/2]].map(
    ([x,y])=>[feature.point[0]-n[0]*x-side[0]*y,feature.point[1]-n[1]*x-side[1]*y] as [number,number],
  );

  // Prefer exact planar polygonal completion when the source floor is level.
  // Stair landings (positive setback) need an explicit retracted strip; the planar
  // completer does not record changedTriangles for later approach fusion.
  try{
    if(setback>0)throw new Error("skip planar completion for retracted stair landing");
    const api=extensionGeometryKernel();
    const limits={...DEFAULT_ADAPTATION_LIMITS,landingSquareFeet:Math.max(DEFAULT_ADAPTATION_LIMITS.landingSquareFeet,width*(inwardDepth+outwardReach)+4)};
    const completion=completeLocalLanding(api,model,tile,feature.point,foot,models,tiles,limits);
    if(completion.valid){
      const working=completion.models.find(m=>m.id===model.id);
      if(!working?.connectionSurface)return fail("open-shell working model missing");
      const reconstructedPoint:Vec3=[feature.point[0]-n[0]*setback,feature.point[1]-n[1]*setback,feature.point[2]];
      const provenance:FeatureAdaptationProvenance={
        sourceId:model.id,sourceRevision:geometryRevision(model.connectionSurface).id,featureId:feature.id,featureKind:feature.kind,
        operation:"open-shell local floor completion",
        plan:{feature:feature as ConnectionFeature,width,depth:inwardDepth,setback,elevation:0,datum:"boundary"},
        changedVertices:[],changedTriangles:[],maximumDisplacement:Math.max(outwardReach,Math.abs(setback)),
        originalPoint:[...feature.point],reconstructedPoint,additionalExternalRun:setback,
        sourceGeometry:"UNCHANGED",workingTopology:"OPEN_SHELL_ADDITIVE_COPY",material:"OPEN_SHELL_LOCAL",
        selfIntersection:"VERIFIED",circulation:"UNVERIFIED",structuralCapacity:"UNVERIFIED",
        openShell:{missingArea:(completion.details as {missingArea?:number}|undefined)?.missingArea,supports:(completion.details as {conceptualSupports?:number}|undefined)?.conceptualSupports,reason:completion.reason},
      };
      working.featureAdaptation=provenance;working.sourceResponsiveExtensions=true;
      return {valid:true as const,model:working,provenance,point:reconstructedPoint,ms:performance.now()-start,sceneModels:completion.models};
    }
  }catch{/* fall through to undulating derived pad */}

  // Undulating open sheets often fail planar extractLocalSurface (1e-4 Z band).
  // Add ONLY the outward gap plus a thin attachment strip so the derived pad
  // does not re-cover existing floor triangles (which trips self-intersection).
  const metadata=surfaceOrientation(model.connectionSurface);
  const band=.5;
  const upper=metadata.triangles.map((t,id)=>({id,t,points:t.points.map(p=>worldFromLocal(p,tile,model))}))
    .filter(t=>t.t.normalZ>=.65&&t.points.some(p=>Math.hypot(p[0]-feature.point[0],p[1]-feature.point[1])<=Math.max(inwardDepth,outwardReach)+width+1)&&t.points.some(p=>Math.abs(p[2]-feature.point[2])<=band));
  if(!upper.length)return fail("open-shell landing: no nearby walkable surface within elevation band",{band,point:feature.point});
  const samples=upper.flatMap(t=>t.points.filter(p=>Math.hypot(p[0]-feature.point[0],p[1]-feature.point[1])<=4&&Math.abs(p[2]-feature.point[2])<=band).map(p=>p[2])).sort((a,b)=>a-b);
  if(!samples.length)return fail("open-shell landing: no elevation samples");
  const targetZ=samples[Math.floor(samples.length/2)];
  const pointInTri=(p:[number,number],a:Vec3,b:Vec3,c:Vec3)=>{
    const v0:[number,number]=[c[0]-a[0],c[1]-a[1]],v1:[number,number]=[b[0]-a[0],b[1]-a[1]],v2:[number,number]=[p[0]-a[0],p[1]-a[1]];
    const dot00=v0[0]*v0[0]+v0[1]*v0[1],dot01=v0[0]*v1[0]+v0[1]*v1[1],dot02=v0[0]*v2[0]+v0[1]*v2[1],dot11=v1[0]*v1[0]+v1[1]*v1[1],dot12=v1[0]*v2[0]+v1[1]*v2[1];
    const inv=1/(dot00*dot11-dot01*dot01||1),u=(dot11*dot02-dot01*dot12)*inv,v=(dot00*dot12-dot01*dot02)*inv;return u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6;
  };
  const covered=(p:[number,number])=>upper.some(t=>pointInTri(p,t.points[0],t.points[1],t.points[2]));
  // Attachment strip just inside the rim must touch existing floor.
  const attach=[[0.05,-width/2+.05],[0.2,-width/2+.05],[0.2,width/2-.05],[0.05,width/2-.05]].map(
    ([x,y])=>[feature.point[0]-n[0]*x-side[0]*y,feature.point[1]-n[1]*x-side[1]*y] as [number,number],
  );
  if(!attach.some(covered))return fail("open-shell landing: rim lacks existing floor attachment",{attach,targetZ});
  // Measure rim, then keep the derived pad inside the clear gap to other forms.
  // When the outward gap is shorter than a 2 ft approach, retract the strip into
  // empty source space so the walking approach lives on reconstructed floor.
  // Stair landings need ≥3.15 ft clear inward so a 3 ft approach rectangle fits
  // after pad-only candidate selection (no source double-count / edge trim).
  const padHalf=width/2+0.05,needDepth=setback>0?3.15:2.05;
  const sampleHalf=Math.min(padHalf-0.15,Math.max(0.25,(feature.width||width)/2));
  let rimOut=0;
  for(const b of [-sampleHalf,0,sampleHalf]){
    let last=-1;
    for(let s=0;s<=5.0;s+=0.05){
      const p:[number,number]=[feature.point[0]+n[0]*s-side[0]*b,feature.point[1]+n[1]*s-side[1]*b];
      if(covered(p))last=s;
    }
    if(last>rimOut)rimOut=last;
  }
  const otherHit=(x:number,y:number,z:number)=>{
    for(let i=0;i<models.length;i++){
      if(tiles[i].id===tile.id)continue;
      const other=models[i];if(!other.connectionSurface)continue;
      const meta=surfaceOrientation(other.connectionSurface);
      for(const t of meta.triangles){
        const pts=t.points.map(p=>worldFromLocal(p,tiles[i],other));
        if(pts.every(p=>Math.abs(p[2]-z)>3))continue;
        if(pts.some(p=>Math.hypot(p[0]-x,p[1]-y)<0.2&&Math.abs(p[2]-z)<3))return true;
        if(t.normalZ>=.5&&pointInTri([x,y],pts[0],pts[1],pts[2])&&Math.abs((pts[0][2]+pts[1][2]+pts[2][2])/3-z)<=1.5)return true;
      }
    }
    return false;
  };
  let maxOuter=6;
  for(let s=Math.max(0,rimOut)+0.05;s<=6;s+=0.05){
    const x=feature.point[0]+n[0]*s,y=feature.point[1]+n[1]*s;
    if(otherHit(x,y,targetZ)){maxOuter=s-0.25;break;}
  }
  const clearHalf=padHalf;
  // Positive setback = retract landing into the source (stair 3 ft depth).
  // Negative/zero = outward gap pad for deficient entrances.
  const retractInward=setback>0;
  let inner=Math.max(0,rimOut)+0.05;
  let outer=Math.min(inner+Math.max(outwardReach,needDepth),maxOuter);
  let rebuildLocal=false;
  if(retractInward){
    // Measure inward depth from the fixed architectural attachment (s=0), not
    // from the outward rim tongue. A tip with rimOut>0 otherwise shortens the
    // landing below the required 3 ft approach rectangle.
    rebuildLocal=true;
    outer=Math.max(0,rimOut)+0.05;
    inner=-Math.max(needDepth,3.15,setback+2.05);
    for(let s=inner;s<=outer;s+=0.1){
      if(otherHit(feature.point[0]+n[0]*s,feature.point[1]+n[1]*s,targetZ))
        return fail("open-shell landing: retracted landing blocked by neighboring form",{inner,outer,s,maxOuter});
    }
  }else if(outer-inner<needDepth){
    // Retract into the source form when the outward gap is too short.
    rebuildLocal=true;
    outer=Math.max(Math.min(maxOuter,Math.max(rimOut,0)+0.35),inner);
    inner=outer-needDepth;
    for(let s=inner;s<Math.min(0,outer);s+=0.1){
      if(otherHit(feature.point[0]+n[0]*s,feature.point[1]+n[1]*s,targetZ))
        return fail("open-shell landing: retracted strip blocked by neighboring form",{inner,outer,s,maxOuter});
    }
  }
  if(outer-inner<needDepth-1e-6)return fail("open-shell landing: insufficient clear run for approach pad",{inner,outer,maxOuter,rimOut,needDepth,retractInward});
  // Retracted stair landings keep the architectural attachment point (XY and the
  // measured rim elevation). Only the inward pad grows; loft contact must still
  // meet the original boundary. Outward pads move the endpoint to the outer rim.
  const attachmentZ=Number.isFinite(feature.point[2])?feature.point[2]:targetZ;
  const padZ=retractInward?attachmentZ:targetZ;
  const endpoint:Vec3=retractInward
    ?[feature.point[0],feature.point[1],attachmentZ]
    :[feature.point[0]+n[0]*outer,feature.point[1]+n[1]*outer,padZ];
  const c0:Vec3=[feature.point[0]+n[0]*outer-side[0]*clearHalf,feature.point[1]+n[1]*outer-side[1]*clearHalf,padZ];
  const c1:Vec3=[feature.point[0]+n[0]*inner-side[0]*clearHalf,feature.point[1]+n[1]*inner-side[1]*clearHalf,padZ];
  const c2:Vec3=[feature.point[0]+n[0]*inner+side[0]*clearHalf,feature.point[1]+n[1]*inner+side[1]*clearHalf,padZ];
  const c3:Vec3=[feature.point[0]+n[0]*outer+side[0]*clearHalf,feature.point[1]+n[1]*outer+side[1]*clearHalf,padZ];
  const worldArea=(c1[0]-c0[0])*(c2[1]-c0[1])-(c2[0]-c0[0])*(c1[1]-c0[1]);
  const ordered=worldArea<0?[c0,c3,c2,c1]:[c0,c1,c2,c3];
  const local=ordered.map(p=>localPoint(p,tile,model));
  // Round-trip through the tile transform; reject collapsed pads under mirror.
  const round=local.map(p=>worldFromLocal(p,tile,model));
  const rtArea=Math.abs((round[1][0]-round[0][0])*(round[2][1]-round[0][1])-(round[2][0]-round[0][0])*(round[1][1]-round[0][1]));
  if(rtArea<width*(outer-inner)*0.85)return fail("open-shell derived landing collapsed under tile transform",{rtArea,expected:width*(outer-inner),rimOut,inner,outer});
  const padMinX=Math.min(...ordered.map(p=>p[0])),padMaxX=Math.max(...ordered.map(p=>p[0]));
  const padMinY=Math.min(...ordered.map(p=>p[1])),padMaxY=Math.max(...ordered.map(p=>p[1]));
  const inPadXY=(x:number,y:number)=>x>=padMinX-1e-4&&x<=padMaxX+1e-4&&y>=padMinY-1e-4&&y<=padMaxY+1e-4;
  // Derived copy: drop source upper faces under the reconstructed strip so the
  // pad alone owns that footprint (exact coverage; source OBJ stays untouched).
  const srcPos=model.connectionSurface.positions,srcTri=model.connectionSurface.triangles;
  const positions:number[]=[];
  const remap=new Map<number,number>();
  const mapVertex=(i:number)=>{const old=remap.get(i);if(old!==undefined)return old;const n=positions.length/3;positions.push(srcPos[i*3],srcPos[i*3+1],srcPos[i*3+2]);remap.set(i,n);return n;};
  const triangles:number[]=[];
  for(let i=0;i<srcTri.length;i+=3){
    const ids=[srcTri[i],srcTri[i+1],srcTri[i+2]];
    const world=ids.map(id=>worldFromLocal([srcPos[id*3],srcPos[id*3+1],srcPos[id*3+2]],tile,model));
    if(rebuildLocal){
      const cx=(world[0][0]+world[1][0]+world[2][0])/3,cy=(world[0][1]+world[1][1]+world[2][1])/3,cz=(world[0][2]+world[1][2]+world[2][2])/3;
      const u=world[1].map((v,k)=>v-world[0][k]),v=world[2].map((v,k)=>v-world[0][k]);
      const nz=u[0]*v[1]-u[1]*v[0];
      const up=Math.hypot(u[0],u[1],u[2])>1e-12&&Math.hypot(v[0],v[1],v[2])>1e-12?nz/Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],nz):0;
      if(Math.abs(cz-padZ)<=band&&up>=.65&&(inPadXY(cx,cy)||world.some(p=>inPadXY(p[0],p[1]))))continue;
    }
    triangles.push(mapVertex(ids[0]),mapVertex(ids[1]),mapVertex(ids[2]));
  }
  const base=positions.length/3;
  const changedVertices:number[]=[];
  for(const p of local){positions.push(p[0],p[1],p[2]);changedVertices.push(positions.length/3-1);}
  const triStart=triangles.length/3;
  triangles.push(base,base+1,base+2,base,base+2,base+3);
  const changedTriangles=[triStart,triStart+1];
  // Fix winding in WORLD space. Local-space NZ flips under mirror variants and
  // produced downward pads that failed "no physical floor at entrance".
  for(let i=0;i<2;i++){
    const ids=triangles.slice((triStart+i)*3,(triStart+i)*3+3);
    const face=ids.map(v=>worldFromLocal([positions[v*3],positions[v*3+1],positions[v*3+2]] as Vec3,tile,model));
    const u=face[1].map((v,k)=>v-face[0][k]),v=face[2].map((v,k)=>v-face[0][k]);
    const nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0];
    if(Math.hypot(nx,ny,nz)<1e-10)return fail("open-shell derived landing degenerate");
    if(nz<0){const a=triangles[(triStart+i)*3+1];triangles[(triStart+i)*3+1]=triangles[(triStart+i)*3+2];triangles[(triStart+i)*3+2]=a;}
  }

  const faces:ImportedObj["faces"]=[];for(let i=0;i<triangles.length;i+=3)faces.push({vertices:triangles.slice(i,i+3),normals:null});
  const absolute=positions.map((v,i)=>v+model.anchor[i%3]);
  const working=analyzeMesh({id:model.id,filename:model.filename,positions:Float32Array.from(absolute),normals:new Float32Array(),faces,upAxis:"z"} as ImportedObj,model.slotId,1,"z",model.cellFeet,model.anchor);
  working.connectionSurface={positions:Float32Array.from(positions),triangles:triangles.slice()};
  working.sourceResponsiveExtensions=true;
  const reconstructedPoint:Vec3=[...endpoint];
  const provenance:FeatureAdaptationProvenance={
    sourceId:model.id,sourceRevision:geometryRevision(model.connectionSurface).id,featureId:feature.id,featureKind:feature.kind,
    operation:"open-shell local floor completion",
    plan:{feature:feature as ConnectionFeature,width,depth:inwardDepth,setback,elevation:padZ-feature.point[2],datum:"boundary"},
    changedVertices,changedTriangles,
    maximumDisplacement:Math.max(outwardReach,Math.abs(setback),Math.abs(padZ-feature.point[2])),
    originalPoint:[...feature.point],reconstructedPoint,additionalExternalRun:setback,
    sourceGeometry:"UNCHANGED",workingTopology:"OPEN_SHELL_ADDITIVE_COPY",material:"OPEN_SHELL_LOCAL",
    selfIntersection:"VERIFIED",circulation:"UNVERIFIED",structuralCapacity:"UNVERIFIED",
    openShell:{missingArea:(outer-inner)*width,reason:`derived approach pad ${((outer-inner)*width).toFixed(2)} ft² on undulating open sheet${rebuildLocal?" with branch retraction":""}`},
  };
  working.featureAdaptation=provenance;
  // Self-check uses the architectural attachment for retracted landings so the
  // pad must meet the original endpoint, not a median-shifted contact point.
  const approach=validateWalkingApproach(working,tile,reconstructedPoint,n,width,2,[working],[tile]);
  if(!approach.valid)return fail("open-shell derived landing failed approach: "+approach.reason,{...(approach.details as object),rimOut,inner,outer});
  return {valid:true as const,model:working,provenance,point:reconstructedPoint,ms:performance.now()-start};
}
