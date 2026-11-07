import { analyzeMesh } from "./analyze";
import { geometryRevision } from "./geometryRevision";
import { surfaceOrientation } from "./surfaceOrientation";
import { auditDerivedSelfIntersections } from "./connectionClearance";
import { certifyWorkingMaterial, refineWorkingRegion } from "./extensionReconstruction";
import type { ConnectionFeature } from "./connectionFeatures";
import type { ImportedObj, TileModel, Vec3 } from "./types";

export type FeatureAdaptationPlan={feature:ConnectionFeature;width:number;depth:number;setback:number;elevation:number;datum?:"interior"|"boundary"};
export type FeatureAdaptationProvenance={sourceId:string;sourceRevision:number;featureId:string;featureKind:ConnectionFeature["kind"];
  operation:"localized material-column reconstruction";plan:FeatureAdaptationPlan;changedVertices:number[];changedTriangles:number[];
  maximumDisplacement:number;originalPoint:Vec3;reconstructedPoint:Vec3;additionalExternalRun:number;
  sourceGeometry:"UNCHANGED";workingTopology:"CONFORMING_REFINED_COPY";material:"VERIFIED";selfIntersection:"VERIFIED";
  circulation:"UNVERIFIED";structuralCapacity:"UNVERIFIED"};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};

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
