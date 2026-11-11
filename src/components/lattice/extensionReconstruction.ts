import type { ManifoldToplevel, Manifold } from "manifold-3d";
import { geometryRevision } from "./geometryRevision";
import { worldFromLocal } from "./surfaceAttachment";
import { surfaceOrientation } from "./surfaceOrientation";
import { transitionMeshes } from "./transitionGeometry";
import { auditDerivedSelfIntersections } from "./connectionClearance";
import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";

type Mesh = {kind:"bridge"|"plate"|"ramp"|"stair";positions:import("./types").DerivedPositions;indices:number[]};
export type ReconstructedContact = {sourceId:string;sourceTriangle:number;sourceTriangles?:number[];generatedFace:number;triangle:[Vec3,Vec3,Vec3]};
type MaterialBoundary={points:Vec3[];fractions:number[];sourceId:string;method:"verified original-material contact contour"};
type UndersideJoin={sourceId:string;edges:Array<[Vec3,Vec3]>;coverage:[number,number];parameter:"walking-profile-width"|"source-material-contour-arc";method:"connected exact material-boundary join";edgeTopologySegments?:number[]};
type Reconstruction = {status:"PASS";meshes:Mesh[];contacts:ReconstructedContact[];removedVolume:number;walkingCoverage:"VERIFIED";undersideJoins:UndersideJoin[];materialBoundaries?:Array<MaterialBoundary|undefined>} |
  {status:"UNVERIFIED";reason:string;witness?:unknown};
let api:ManifoldToplevel|undefined;
let initialization:Promise<void>|undefined;
const sourceCache=new Map<string,{solid:Manifold;original:number;triangles:[Vec3,Vec3,Vec3][];outward:Vec3[];kernelTriangles:[Vec3,Vec3,Vec3][];kernelOutward:Vec3[];upward:boolean[]}>();
const resultCache=new Map<string,Reconstruction>();
export const SOURCE_CONTOUR_CONSTRUCTION={collarRunFeet:2,maximumCollarThickeningFeet:.15,collarThicknessFraction:.15,maximumContourBreakpoints:65,maximumCombinedBreakpoints:129,maximumDerivedTriangles:8192} as const;

/** The public Mesh interchange format is Float32, while the kernel's vertex
 * callback is Float64. Restore exactly the already-calculated coordinates on
 * a PRIVATE copy; this is not a second placement/unit/axis transformation.
 * Ambiguous or unmapped vertices reject instead of guessing correspondence. */
export function preciseKernelCopy(solid:Manifold,positions:import("./types").DerivedPositions):Manifold {
  const points=new Map<string,Vec3>();
  const key=(p:Vec3)=>Array.from(Float32Array.from(p)).join(',');
  for(let i=0;i<positions.length;i+=3){
    const p=Array.from(positions.slice(i,i+3)) as Vec3,k=key(p),old=points.get(k);
    if(old&&old.some((v,j)=>v!==p[j]))throw new Error("distinct vertices collapse in kernel interchange; precision UNVERIFIED");
    points.set(k,p);
  }
  let missing=0;
  const restored=solid.warpBatch((vertices,count)=>{
    for(let i=0;i<count;i++){
      const p=Array.from(vertices.slice(i*3,i*3+3)) as Vec3,original=points.get(key(p));
      if(!original){missing++;continue;}vertices.set(original,i*3);
    }
  });
  if(missing){restored.delete();throw new Error("kernel vertex correspondence UNVERIFIED");}
  // Read the restored native Double coordinates back through the same public
  // callback and check every vertex. This returned identity copy is discarded.
  let mismatch=0;
  const audit=restored.warpBatch((vertices,count)=>{
    for(let i=0;i<count;i++){
      const p=Array.from(vertices.slice(i*3,i*3+3)) as Vec3,original=points.get(key(p));
      if(!original||original.some((v,j)=>v!==p[j]))mismatch++;
    }
  });audit.delete();
  if(mismatch){restored.delete();throw new Error("native coordinate restoration UNVERIFIED");}
  return restored;
}

/** Normal application WASM initialization, not a shell or alternate security path. */
export function initializeExtensionReconstruction() {
  // A module worker has no Window, but still uses the same reviewed browser
  // runtime. Node regression runners retain the installed ESM package entry.
  const browserRuntime=typeof window!=="undefined"||(typeof self!=="undefined"&&/^https?:$/.test(self.location?.protocol??""));
  const entry=browserRuntime?"/geometry-runtime/manifold-3.5.3/manifold.js":"manifold-3d";
  return initialization??=import(/* webpackIgnore: true */ entry).then(async module=>{
    const factory=module.default as ()=>Promise<ManifoldToplevel>;
    api=await factory();api.setup();
  });
}
/** Shared initialized kernel for bounded derived-geometry operations. */
export function extensionGeometryKernel(){if(!api)throw new Error("Geometry runtime not initialized");return api;}

/** Read native Double coordinates without a Float32 export/reimport round trip.
 * The native vertex order must correspond exactly to the exported indices;
 * never guess correspondence when the kernel exposes a different ordering. */
export function nativeMeshPositions(solid:Manifold,mesh:ReturnType<Manifold["getMesh"]>){
  let positions:Float64Array|undefined;
  const copy=solid.warpBatch((vertices,count)=>{
    if(count*3!==mesh.vertProperties.length)throw new Error("native/exported vertex count correspondence UNVERIFIED");
    positions=vertices.slice();
  });
  copy.delete();
  if(!positions||positions.some((v,i)=>Math.fround(v)!==mesh.vertProperties[i]))throw new Error("native/exported vertex order correspondence UNVERIFIED");
  return positions;
}
function sourceSolid(model:TileModel,tile:PlacedTile) {
  const surface=model.connectionSurface!;
  const key=JSON.stringify([geometryRevision(surface).id,tile,model.variants[tile.variant].rotation,model.variants[tile.variant].mirror]);
  const old=sourceCache.get(key);if(old){sourceCache.delete(key);sourceCache.set(key,old);return old;}
  if(surface.triangles.length/3>50000)throw new Error("source-solid triangle budget; no triangles omitted");
  const metadata=surfaceOrientation(surface);
  if(metadata.components.some(c=>c.boundaryEdges||c.inconsistentEdges||c.uncertainty))throw new Error("whole-source solid UNVERIFIED; local ribbon remains subject to exact clearance");
  const positions=new Float32Array(surface.positions.length),precisePositions=new Float64Array(surface.positions.length),indices=surface.triangles.slice();
  for(let i=0;i<positions.length;i+=3){const p=worldFromLocal(Array.from(surface.positions.slice(i,i+3)) as Vec3,tile,model);positions.set(p,i);precisePositions.set(p,i);}
  const mirrored=model.variants[tile.variant].mirror!=="none";
  for(let i=0;i<indices.length;i+=3)if((metadata.components[metadata.triangles[i/3].component].sign<0)!==mirrored)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  let original=api!.Manifold.reserveIDs(1);
  const input=new api!.Mesh({numProp:3,vertProperties:positions,triVerts:Uint32Array.from(indices),
    runIndex:Uint32Array.of(0,indices.length),runOriginalID:Uint32Array.of(original),faceID:Uint32Array.from(metadata.triangles.map((_,i)=>i))});
  input.merge(); // Kernel copy only. Original source topology and arrays are never changed.
  const rounded=new api!.Manifold(input);
  let solid:Manifold;
  try{solid=preciseKernelCopy(rounded,precisePositions);}finally{rounded.delete();}
  const nativeIds=solid.getMesh().runOriginalID;
  if(nativeIds.length!==1){solid.delete();throw new Error("source native provenance UNVERIFIED");}
  original=nativeIds[0];
  if(solid.status()!=="NoError"||!(solid.volume()>0)){solid.delete();throw new Error("source kernel solid is invalid");}
  const triangles=metadata.triangles.map(t=>t.points.map(p=>worldFromLocal(p,tile,model)) as [Vec3,Vec3,Vec3]);
  const outward=triangles.map((t,i)=>{
    const n=normal(t),sign=metadata.components[metadata.triangles[i].component].sign*(mirrored?-1:1);
    return n.map(v=>v*sign) as Vec3;
  });
  // Preserve both representations: world-coordinate originals and the kernel's
  // Float32 input copy. A contact may not penetrate either representation.
  const kernelTriangles=indices.reduce<[Vec3,Vec3,Vec3][]>((list,_,i)=>{
    if(i%3===0)list.push(indices.slice(i,i+3).map(v=>Array.from(positions.slice(v*3,v*3+3)) as Vec3) as [Vec3,Vec3,Vec3]);return list;
  },[]);
  const result={solid,original,triangles,outward,kernelTriangles,kernelOutward:kernelTriangles.map(normal),upward:metadata.triangles.map(t=>t.normalZ>=.7)};
  if(sourceCache.size>=16){const first=sourceCache.keys().next().value!;sourceCache.get(first)!.solid.delete();sourceCache.delete(first);}
  sourceCache.set(key,result);return result;
}

/** Independent packing gate on unchanged original placement instances.
 * A source that cannot be certified as a solid remains UNVERIFIED. */
export function originalPlacementMaterial(models:TileModel[],tiles:PlacedTile[]) {
  if(!api)return {status:"UNVERIFIED" as const,reason:"material kernel not initialized",pairs:[]};
  const pairs:Array<{source:string;target:string;status:"VERIFIED"|"REJECTED"|"UNVERIFIED";overlap?:number;reason?:string}>=[];
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
    const a=tiles[i],b=tiles[j],ma=models.find(m=>m.id===a.id),mb=models.find(m=>m.id===b.id);
    if(!ma?.connectionSurface||!mb?.connectionSurface){pairs.push({source:a.id,target:b.id,status:"UNVERIFIED",reason:"missing source geometry"});continue;}
    try{
      const intersection=sourceSolid(ma,a).solid.intersect(sourceSolid(mb,b).solid);
      try{const overlap=intersection.volume();pairs.push({source:a.id,target:b.id,status:intersection.status()!=="NoError"||!Number.isFinite(overlap)||overlap<0?"UNVERIFIED":overlap>1e-9?"REJECTED":"VERIFIED",overlap});}finally{intersection.delete();}
    }catch(error){pairs.push({source:a.id,target:b.id,status:"UNVERIFIED",reason:error instanceof Error?error.message:String(error)});}
  }
  return {status:pairs.some(p=>p.status==="REJECTED")?"REJECTED" as const:pairs.some(p=>p.status==="UNVERIFIED")?"UNVERIFIED" as const:"VERIFIED" as const,pairs};
}

/** Actual complete working material, not similarity of old/new face normals.
 * Private source-solid conversion restores the exact tested coordinates. */
export function certifyWorkingMaterial(model:TileModel){
  if(!api)return {status:"UNVERIFIED" as const,reason:"material kernel not initialized"};
  try{const source=sourceSolid(model,{id:model.id,ix:0,iy:0,iz:0,variant:0}),volume=source.solid.volume();
    return {status:"VERIFIED" as const,volume,reason:"complete closed oriented material; exact native coordinate correspondence"};
  }catch(error){return {status:"UNVERIFIED" as const,reason:error instanceof Error?error.message:String(error)};}
}
/** Refine a private material copy near the displacement box. Shared edge keys
 * propagate each split into both incident faces, including outside the box.
 * Source topology remains immutable; dense copies fail without omitting faces. */
export function refineWorkingRegion(model:TileModel,min:Vec3,max:Vec3){
  if(!api)throw new Error("Geometry runtime not initialized");
  if(min.some((v,k)=>!Number.isFinite(v)||!Number.isFinite(max[k])||max[k]<=v||max[k]-v>20))throw new Error("Invalid bounded working region");
  const source=sourceSolid(model,{id:model.id,ix:0,iy:0,iz:0,variant:0});
  const mesh=source.solid.getMesh(),positions=Array.from(nativeMeshPositions(source.solid,mesh));
  let faces=Array.from({length:mesh.triVerts.length/3},(_,i)=>({vertices:Array.from(mesh.triVerts.slice(i*3,i*3+3)),source:mesh.faceID[i]}));
  const edgeKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(',');
  for(let pass=0;pass<6;pass++){
    const splits=new Map<string,number>();
    for(const face of faces){
      if([0,1,2].some(k=>Math.max(...face.vertices.map(v=>positions[v*3+k]))<min[k]||Math.min(...face.vertices.map(v=>positions[v*3+k]))>max[k]))continue;
      for(let j=0;j<3;j++){
        const a=face.vertices[j],b=face.vertices[(j+1)%3],key=edgeKey(a,b);
        if(splits.has(key)||Math.hypot(...[0,1,2].map(k=>positions[a*3+k]-positions[b*3+k]))<=.75)continue;
        const index=positions.length/3;for(let k=0;k<3;k++)positions.push((positions[a*3+k]+positions[b*3+k])/2);splits.set(key,index);
      }
    }
    if(!splits.size)break;
    const next:typeof faces=[];
    for(const face of faces){
      const v=face.vertices,m=v.map((a,j)=>splits.get(edgeKey(a,v[(j+1)%3]))),count=m.filter(x=>x!==undefined).length;
      const emit=(vertices:number[])=>next.push({vertices,source:face.source});
      if(!count)next.push(face);
      else if(count===3){emit([v[0],m[0]!,m[2]!]);emit([m[0]!,v[1],m[1]!]);emit([m[2]!,m[1]!,v[2]]);emit([m[0]!,m[1]!,m[2]!]);}
      else if(count===1){const j=m.findIndex(x=>x!==undefined),a=v[j],b=v[(j+1)%3],c=v[(j+2)%3],ab=m[j]!;emit([a,ab,c]);emit([ab,b,c]);}
      else{const j=m.findIndex((x,k)=>x!==undefined&&m[(k+1)%3]!==undefined),a=v[j],b=v[(j+1)%3],c=v[(j+2)%3],ab=m[j]!,bc=m[(j+1)%3]!;emit([ab,b,bc]);emit([a,ab,c]);emit([ab,bc,c]);}
      if(next.length>50000||positions.length/3>80000)throw new Error("local refinement triangle/vertex budget; candidate unconstructed");
    }
    faces=next;
  }
  return {positions:Float32Array.from(positions),triangles:faces.flatMap(f=>f.vertices),sourceFaces:faces.map(f=>f.source)};
}
const sub=(a:Vec3,b:Vec3)=>a.map((v,k)=>v-b[k]) as Vec3;
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,k)=>s+v*b[k],0);
function normal(t:[Vec3,Vec3,Vec3]){const n=cross(sub(t[1],t[0]),sub(t[2],t[0])),length=Math.hypot(...n);return n.map(v=>v/length) as Vec3;}
export function pointOnContact(p:Vec3,t:[Vec3,Vec3,Vec3]) {
  const a=sub(t[1],t[0]),b=sub(t[2],t[0]),v=sub(p,t[0]),n=cross(a,b);
  const length=Math.hypot(...n);
  if(!length||Math.abs(dot(v,n))>1e-5*length)return false;
  // Dominant-plane barycentrics avoid subtracting nearly equal squared edge
  // products. Thin, nondegenerate cap triangles keep the SAME plane and
  // barycentric thresholds; a zero-area triangle still cannot qualify.
  const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(k=>k!==drop),x=axes[0],y=axes[1];
  const d=a[x]*b[y]-a[y]*b[x];if(!d)return false;
  const u=(v[x]*b[y]-v[y]*b[x])/d,w=(a[x]*v[y]-a[y]*v[x])/d;
  return u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6;
}
function trianglesOf(m:{positions:import("./types").DerivedPositions;indices:number[]}) {
  const triangles:[Vec3,Vec3,Vec3][]=[];
  for(let i=0;i<m.indices.length;i+=3)triangles.push(m.indices.slice(i,i+3).map(v=>Array.from(m.positions.slice(v*3,v*3+3)) as Vec3) as [Vec3,Vec3,Vec3]);
  return triangles;
}
/** A cap may straddle adjacent source triangles after kernel triangulation.
 * Prove coverage of its entire area; testing just its vertices is insufficient.
 * Keep the existing plane tolerance. Never bridge a missing material region. */
function capCoverage(cap:[Vec3,Vec3,Vec3],source:ReturnType<typeof sourceSolid>,claimed:number):number[]|null {
  const original=source.triangles[claimed];if(!original)return null;
  if(cap.every(p=>pointOnContact(p,original)))return [claimed];
  const n=normal(original);if(!n.every(Number.isFinite))return null;
  if(cap.some(p=>Math.abs(dot(sub(p,original[0]),n))>1e-5))return null;
  const dropped=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
  const axes=[0,1,2].filter(k=>k!==dropped);
  const loop=(t:[Vec3,Vec3,Vec3])=>{
    const p=t.map(v=>[v[axes[0]],v[axes[1]]] as [number,number]);
    const area=p.reduce((s,a,i)=>{const b=p[(i+1)%3];return s+a[0]*b[1]-b[0]*a[1];},0);
    if(area<0)p.reverse();return p;
  };
  const min=axes.map(k=>Math.min(...cap.map(p=>p[k]))),max=axes.map(k=>Math.max(...cap.map(p=>p[k])));
  const desired=new api!.CrossSection([loop(cap)]),pieces:InstanceType<ManifoldToplevel["CrossSection"]>[]=[],ids:number[]=[];
  try{
    source.triangles.forEach((t,i)=>{
      if(axes.some((k,j)=>Math.max(...t.map(p=>p[k]))<min[j]||Math.min(...t.map(p=>p[k]))>max[j]))return;
      if(t.some(p=>Math.abs(dot(sub(p,original[0]),n))>1e-5))return;
      const face=new api!.CrossSection([loop(t)]),clipped=face.intersect(desired);face.delete();
      if(clipped.area()>0){pieces.push(clipped);ids.push(i);}else clipped.delete();
    });
    if(!pieces.length)return null;
    const union=api!.CrossSection.union(pieces),missing=desired.subtract(union);
    // Numerical area roundoff only, substantially below the walking-coverage threshold.
    const covered=missing.area()<=1e-10;missing.delete();union.delete();
    return covered?ids:null;
  }finally{desired.delete();pieces.forEach(p=>p.delete());}
}
/** Certify only the coplanar overlap patch when one generated cap triangle
 * spans both the supporting material and the exposed stair riser above it.
 * Neither the rest of that face nor a nearby volume receives an exception. */
export function capContactFragments(generated:[Vec3,Vec3,Vec3],original:[Vec3,Vec3,Vec3]):Array<[Vec3,Vec3,Vec3]>{
  const n=normal(original);if(!n.every(Number.isFinite)||generated.some(p=>Math.abs(dot(sub(p,original[0]),n))>1e-12))return [];
  const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(k=>k!==drop);
  type Point=[number,number];
  const orient=(a:Point,b:Point,p:Point)=>{
    const u=(b[0]-a[0])*(p[1]-a[1]),v=(b[1]-a[1])*(p[0]-a[0]),d=u-v;
    return Math.abs(d)<=16*Number.EPSILON*(Math.abs(u)+Math.abs(v))?0:d;
  };
  const polygon=(t:[Vec3,Vec3,Vec3])=>{const p=t.map(v=>[v[axes[0]],v[axes[1]]] as Point);if(orient(p[0],p[1],p[2])<0)p.reverse();return p;};
  // The native 2D interchange rounded clipping vertices to Float32, unlike
  // the verified Double emitted mesh. Convex triangle clipping needs no native
  // polygon conversion; retain actual endpoint coordinates and all boundaries.
  const clip=polygon(original);let loop=polygon(generated);
  for(let edge=0;edge<3&&loop.length;edge++){
    const a=clip[edge],b=clip[(edge+1)%3],next:Point[]=[];
    const append=(p:Point)=>{const last=next.at(-1);if(!last||last[0]!==p[0]||last[1]!==p[1])next.push(p);};
    for(let i=0;i<loop.length;i++){
      const p=loop[i],q=loop[(i+1)%loop.length],dp=orient(a,b,p),dq=orient(a,b,q);
      if(dp>=0)append(p);
      if((dp<0&&dq>=0)||(dp>=0&&dq<0)){
        const t=dp/(dp-dq);append(t===0?p:t===1?q:[p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    }
    if(next.length>1&&next[0][0]===next.at(-1)![0]&&next[0][1]===next.at(-1)![1])next.pop();loop=next;
  }
  const result:Array<[Vec3,Vec3,Vec3]>=[];if(loop.length<3)return result;
  const area=Math.abs(loop.slice(1,-1).reduce((sum,p,i)=>sum+(p[0]-loop[0][0])*(loop[i+2][1]-loop[0][1])-(p[1]-loop[0][1])*(loop[i+2][0]-loop[0][0]),0))/2;
  if(area<=1e-12)return result;
  const points=loop.map(xy=>{const p:Vec3=[0,0,0];p[axes[0]]=xy[0];p[axes[1]]=xy[1];p[drop]=original[0][drop]-(n[axes[0]]*(p[axes[0]]-original[0][axes[0]])+n[axes[1]]*(p[axes[1]]-original[0][axes[1]]))/n[drop];return p;});
  for(let i=1;i+1<points.length;i++){
    const triangle=[points[0],points[i],points[i+1]] as [Vec3,Vec3,Vec3];
    if(Math.hypot(...cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])))>0&&triangle.every(p=>pointOnContact(p,original)&&pointOnContact(p,generated)))result.push(triangle);
  }
  return result;
}
function nearestTrianglePoint(p:Vec3,t:[Vec3,Vec3,Vec3]):Vec3 {
  const a=sub(t[1],t[0]),b=sub(t[2],t[0]),v=sub(p,t[0]);
  const aa=dot(a,a),ab=dot(a,b),bb=dot(b,b),d=aa*bb-ab*ab;
  if(d<=1e-16)return t[0];
  const u=(bb*dot(a,v)-ab*dot(b,v))/d,w=(aa*dot(b,v)-ab*dot(a,v))/d;
  if(u>=0&&w>=0&&u+w<=1)return t[0].map((q,k)=>q+u*a[k]+w*b[k]) as Vec3;
  const candidates=t.map((start,i)=>{
    const edge=sub(t[(i+1)%3],start),length=dot(edge,edge);
    const s=length?Math.max(0,Math.min(1,dot(sub(p,start),edge)/length)):0;
    return start.map((q,k)=>q+edge[k]*s) as Vec3;
  });
  return candidates.reduce((x,y)=>Math.hypot(...sub(x,p))<Math.hypot(...sub(y,p))?x:y);
}
/** Correct only emitted Float32 rounding at shared cap vertices. Each moved
 * vertex must satisfy ALL incident original triangles under the unchanged
 * contact predicate. No disconnected per-face snapping or source edits. */
type FaceIds = [number, number, number];

/** Refit only the projected vertex's triangle fan. A collapsed ear on a
 * neighbor's edge can be retiled as two triangles of that neighbor. */
function capProjectionPatch(mesh:Mesh,vertex:number,projected:Vec3,incident:Set<number>,
  facesAt:Set<number>[],owner:number[],sourceFace:ArrayLike<number>,sourceOwners:Set<number>) {
  const ids=(face:number)=>mesh.indices.slice(face*3,face*3+3) as FaceIds;
  const point=(i:number)=>Array.from(mesh.positions.slice(i*3,i*3+3)) as Vec3;
  const after=(i:number)=>i===vertex?projected:point(i);
  const areaVector=(tri:FaceIds,get:(i:number)=>Vec3)=>cross(sub(get(tri[1]),get(tri[0])),sub(get(tri[2]),get(tri[0])));
  const oriented=(a:Vec3,b:Vec3)=>Math.hypot(...a)>1e-12&&dot(a,b)>0;
  const edits=new Map<number,FaceIds>();
  for(const face of incident){
    if(edits.has(face))continue;
    const tri=ids(face),old=areaVector(tri,point),next=areaVector(tri,after);
    if(oriented(next,old))continue;
    // Inverted or non-collinear patches need a different cap construction.
    // Only the redundant collinear ear has a unique area-preserving repair.
    if(Math.hypot(...next)!==0)return;
    let repaired=false;
    for(let j=0;j<3;j++){
      const a=tri[j],b=tri[(j+1)%3],mid=tri[(j+2)%3];
      if(dot(sub(after(mid),after(a)),sub(after(mid),after(b)))>=0)continue;
      const common=[...facesAt[a]].filter(f=>facesAt[b].has(f));
      if(common.length!==2)continue;
      const other=common.find(f=>f!==face);
      if(other===undefined||edits.has(other)||owner[other]!==owner[face])continue;
      if(sourceOwners.has(owner[face])&&sourceFace[face]!==sourceFace[other])continue;
      const neighbor=ids(other),k=neighbor.indexOf(b);
      if(k<0||neighbor[(k+1)%3]!==a)continue;
      const tip=neighbor[(k+2)%3];
      if([...facesAt[mid]].some(f=>facesAt[tip].has(f)))continue;
      const first:FaceIds=[b,mid,tip],second:FaceIds=[mid,a,tip],reference=areaVector(neighbor,point);
      if(!oriented(areaVector(first,after),reference)||!oriented(areaVector(second,after),reference))continue;
      edits.set(face,first);edits.set(other,second);repaired=true;break;
    }
    if(!repaired)return;
  }
  return edits;
}

function alignCapVertices(mesh:Mesh,runs:ReturnType<Manifold["getMesh"]>,sources:ReturnType<typeof sourceSolid>[]) {
  const constraints=new Map<number,Array<{triangle:[Vec3,Vec3,Vec3];outward:Vec3}>>();
  for(let run=0;run<runs.runOriginalID.length;run++){
    const source=sources.find(s=>s.original===runs.runOriginalID[run]);if(!source)continue;
    for(let face=runs.runIndex[run]/3;face<runs.runIndex[run+1]/3;face++){
      const triangle=source.triangles[runs.faceID[face]];if(!triangle)throw new Error("missing cap provenance");
      for(const vertex of mesh.indices.slice(face*3,face*3+3)){
        const list=constraints.get(vertex)??[];
        if(!list.some(c=>c.triangle===triangle)){
          list.push({triangle,outward:source.outward[runs.faceID[face]]});
        }constraints.set(vertex,list);
      }
    }
  }
  const facesAt=Array.from({length:mesh.positions.length/3},()=>new Set<number>());
  mesh.indices.forEach((v,i)=>facesAt[v].add(Math.floor(i/3)));
  const owner:number[]=[];
  for(let run=0;run<runs.runOriginalID.length;run++)for(let face=runs.runIndex[run]/3;face<runs.runIndex[run+1]/3;face++)owner[face]=runs.runOriginalID[run];
  const sourceOwners=new Set(sources.map(s=>s.original));
  let corrected=0,unresolved=0,maxDisplacement=0,retriangulatedFaces=0;
  for(const [vertex,triangles]of constraints){
    const point=Array.from(mesh.positions.slice(vertex*3,vertex*3+3)) as Vec3;
    // Preserve native vertices already satisfying the unchanged public contact
    // predicate. Reprojecting those vertices can fold tiny Boolean fragments.
    // Independent actual-solid overlap and cap-coverage gates still follow.
    const qualifies=(p:Vec3)=>triangles.every(t=>pointOnContact(p,t.triangle));
    if(qualifies(point))continue;
    // Reconstruct the shared edge from its actual incident source triangles.
    // Searching only around the rounded kernel point can miss the edge entirely
    // on a narrow triangle. The fixed 1e-5-foot correction bound is independent
    // of placement magnitude; acceptance predicates remain unchanged.
    let projected=point;
    for(let pass=0;pass<16;pass++)for(const t of triangles)projected=nearestTrianglePoint(projected,t.triangle);
    const distance=Math.hypot(...sub(projected,point));
    if(distance>1e-5||!qualifies(projected)){unresolved++;continue;}
    const patch=capProjectionPatch(mesh,vertex,projected,facesAt[vertex],facesAt,owner,runs.faceID,sourceOwners);
    if(!patch){unresolved++;continue;}
    for(const [face,tri] of patch){
      for(const i of mesh.indices.slice(face*3,face*3+3))facesAt[i].delete(face);
      mesh.indices.splice(face*3,3,...tri);
      for(const i of tri)facesAt[i].add(face);
    }
    retriangulatedFaces+=patch.size;
    mesh.positions.set(projected,vertex*3);corrected++;maxDisplacement=Math.max(maxDisplacement,distance);
  }
  return {corrected,unresolved,maxDisplacement,retriangulatedFaces};
}
/** Every raw walking facet must remain covered by actual emitted tops or
 * coplanar original walking surfaces. A Boolean subtraction cannot create a gap. */
export function walkingCoverage(raw:Mesh[],emitted:Mesh[],sources:ReturnType<typeof sourceSolid>[],onFailure?:(witness:unknown)=>void) {
  const coverage=emitted.flatMap(trianglesOf).filter(t=>normal(t)[2]>=.7);
  for(const source of sources)source.triangles.forEach((t,i)=>{if(source.upward[i])coverage.push(t);});
  const area=(p:number[][])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
  for(const [facet,top] of raw.flatMap(trianglesOf).filter(t=>normal(t)[2]>=.7).entries()){
    const n=normal(top),min=[0,1].map(k=>Math.min(...top.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...top.map(p=>p[k])));
    const loop=top.map(p=>[p[0],p[1]] as [number,number]);if(area(loop)<0)loop.reverse();
    const desired=new api!.CrossSection([loop]),pieces:InstanceType<ManifoldToplevel["CrossSection"]>[]=[];
    try{
      for(const t of coverage){
        if([0,1].some(k=>Math.max(...t.map(p=>p[k]))<min[k]||Math.min(...t.map(p=>p[k]))>max[k]))continue;
        if(t.some(p=>Math.abs(dot(sub(p,top[0]),n))>1e-4))continue;
        const polygon=t.map(p=>[p[0],p[1]] as [number,number]);if(area(polygon)<0)polygon.reverse();
        const face=new api!.CrossSection([polygon]);const clipped=face.intersect(desired);face.delete();
        if(clipped.area()>1e-10)pieces.push(clipped);else clipped.delete();
      }
      if(!pieces.length){onFailure?.({facet,top,desiredArea:desired.area(),missingArea:desired.area(),reason:"no coplanar walking support"});return false;}
      const union=api!.CrossSection.union(pieces),missing=desired.subtract(union);
      const complete=missing.area()<=1e-6;
      if(!complete)onFailure?.({facet,top,desiredArea:desired.area(),missingArea:missing.area(),supportPieces:pieces.length,missingPolygons:missing.toPolygons().slice(0,8),polygonEvidence:"kernel polygon export; diagnostic coordinates only"});
      missing.delete();union.delete();if(!complete)return false;
    }finally{desired.delete();pieces.forEach(p=>p.delete());}
  }
  return true;
}
function closedLoftIndices(count:number){
  const indices:number[]=[];
  for(let i=0;i<count-1;i++){const a=i*4,b=a+4;indices.push(a,a+1,b+1,a,b+1,b,a+2,b+3,a+3,a+2,b+2,b+3,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1);}
  const end=(count-1)*4;indices.push(0,2,3,0,3,1,end,end+1,end+3,end,end+3,end+2);
  return indices.map((_,i)=>indices[i%3===1?i+1:i%3===2?i-1:i]);
}
/** Piecewise measured underside contours, not a uniform slab. Native union
 * joins the width strips and tread bodies before source subtraction. Walking
 * facets, closure, both caps and actual material overlap are checked afterward. */
function constructionBodies(pair:PortPair,raw:Mesh[]):Mesh[]{
  const ca=pair.extension?.start.contour,cb=pair.extension?.end.contour;
  return raw.flatMap((r,step)=>{
    const stair=r.kind==="stair",positions=stair?r.positions.slice(pair.rise>0?12:0,pair.rise>0?36:24):r.positions;
    const count=positions.length/12;
    if(!ca||!cb)return [{kind:r.kind,positions,indices:stair?closedLoftIndices(count):r.indices}];
    if(ca.thickness.length!==ca.fractions.length||cb.thickness.length!==cb.fractions.length)throw new Error("source contour correspondence UNVERIFIED");
    const fractions=[...ca.fractions,...cb.fractions,...ca.materialBoundary?.fractions??[],...cb.materialBoundary?.fractions??[]].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>64*Number.EPSILON);
    // The union contains independent upper and lower material contours. Keep
    // every knot: its bounded construction budget is separate from the limit
    // on each measured source profile, not a geometric acceptance tolerance.
    if(fractions.length>SOURCE_CONTOUR_CONSTRUCTION.maximumCombinedBreakpoints)throw new Error("combined contour construction budget; no source breakpoints omitted");
    const thickness=(c:typeof ca,u:number)=>{let i=0;while(i<c.fractions.length-2&&c.fractions[i+1]<u)i++;const t=(u-c.fractions[i])/(c.fractions[i+1]-c.fractions[i]);return c.thickness[i]+t*(c.thickness[i+1]-c.thickness[i]);};
    const collar=(c:typeof ca,u:number,p:number[],distance:number)=>{
      let i=0;while(i<c.fractions.length-2&&c.fractions[i+1]<u)i++;
      const t=(u-c.fractions[i])/(c.fractions[i+1]-c.fractions[i]),origin=c.underside[i].map((v,k)=>v+t*(c.underside[i+1][k]-v)),gradient=c.gradients[i].map((v,k)=>v+t*(c.gradients[i+1][k]-v));
      const s=Math.max(0,Math.min(1,distance/SOURCE_CONTOUR_CONSTRUCTION.collarRunFeet)),blend=1-s*s*(3-2*s);
      // A bounded material collar follows the measured underside tangent and
      // adds at most min(0.15 ft, 15% local thickness) below it. This changes
      // only the constructed candidate; source/collision/clearance gates follow.
      const flare=Math.min(SOURCE_CONTOUR_CONSTRUCTION.maximumCollarThickeningFeet,thickness(c,u)*SOURCE_CONTOUR_CONSTRUCTION.collarThicknessFraction)*Math.sin(Math.PI*s)**2;
      return {z:origin[2]+gradient[0]*(p[0]-origin[0])+gradient[1]*(p[1]-origin[1])-flare,blend,origin};
    };
    const materialPoint=(c:typeof ca,u:number)=>{const boundary=c.materialBoundary;if(!boundary)return undefined;let i=0;while(i<boundary.fractions.length-2&&boundary.fractions[i+1]<u)i++;const t=(u-boundary.fractions[i])/(boundary.fractions[i+1]-boundary.fractions[i]);return boundary.points[i].map((v,k)=>v+t*(boundary.points[i+1][k]-v));};
    // Preserve the canonical walking triangles exactly. Width-band diagonals
    // change a nonplanar top quad even when every new vertex lies on a section
    // edge. Only the underside needs the full measured material profile.
    // Shared lower vertices and cap fans retain every source contour knot.
    const coordinates:number[]=[],indices:number[]=[],n=fractions.length,stride=n+2;
      for(let section=0;section<count;section++){
        const t=stair?(step+section/(count-1))/raw.length:section/(count-1),s=t*t*(3-2*t),base=section*12;
        for(const bottom of [false,true])for(const u of bottom?fractions:[0,1]){
          const offset=base+(bottom?6:0),p=[0,1,2].map(k=>positions[offset+k]+u*(positions[offset+3+k]-positions[offset+k]));
          if(bottom){
            const da=thickness(ca,u)-(ca.thickness[0]+u*(ca.thickness.at(-1)!-ca.thickness[0])),db=thickness(cb,u)-(cb.thickness[0]+u*(cb.thickness.at(-1)!-cb.thickness[0]));p[2]-=da+(db-da)*s;
            const center=positions.slice(base,base+3).map((v,k)=>(v+positions[base+3+k])/2),a=collar(ca,u,p,Math.hypot(center[0]-pair.from[0],center[1]-pair.from[1])),b=collar(cb,u,p,Math.hypot(center[0]-pair.to[0],center[1]-pair.to[1]));
            const wa=a.blend*(1-s),wb=b.blend*s;p[2]+=wa*(a.z-p[2])+wb*(b.z-p[2]);
            const ma=materialPoint(ca,u),mb=materialPoint(cb,u);
            for(let k=0;k<3;k++)p[k]+=(ma?wa*(ma[k]-a.origin[k]):0)+(mb?wb*(mb[k]-b.origin[k]):0);
          }
          coordinates.push(...p);
        }
      }
    const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,c,b,a,d,c);
    for(let section=0;section<count-1;section++){
      const a=section*stride,b=a+stride;
      quad(a,a+1,b+1,b);
      for(let band=0;band<n-1;band++){
        quad(a+2+band,b+2+band,b+3+band,a+3+band);
      }
      quad(a,b,b+2,a+2);
      quad(a+1,a+n+1,b+n+1,b+1);
    }
    const end=(count-1)*stride;
    // A lower contour may contain vertical side segments. A fan anchored at
    // its upper corner makes collinear zero-area triangles on those segments.
    // Use a private interior cap point instead; every boundary knot stays in
    // the closed mesh, and all actual cap/contact audits still follow CSG.
    for(const [section,reverse]of [[0,false],[end,true]] as const){
      const upper=[0,1].map(i=>coordinates.slice((section+i)*3,(section+i+1)*3)),lower=Array.from({length:n},(_,i)=>coordinates.slice((section+2+i)*3,(section+3+i)*3));
      const center=coordinates.length/3;
      for(let k=0;k<3;k++)coordinates.push((upper[0][k]+upper[1][k])/4+lower.reduce((sum,p)=>sum+p[k],0)/(2*n));
      const boundary=[section,section+1,...Array.from({length:n},(_,i)=>section+n+1-i)];
      for(let i=0;i<boundary.length;i++){
        const a=boundary[i],b=boundary[(i+1)%boundary.length];indices.push(center,reverse?b:a,reverse?a:b);
      }
    }
    return [{kind:r.kind,positions:Float64Array.from(coordinates),indices}];
  });
}
/** Diagnostic candidate geometry before Boolean operations; never a certificate. */
export function extensionConstructionCandidates(pair:PortPair){
  const canonical={...pair,extension:pair.extension?{...pair.extension,reconstructedMeshes:undefined}:undefined};
  return constructionBodies(canonical,transitionMeshes(canonical));
}
/** Cover the whole straight source-contour segment, not only sample points.
 * Barycentric clipping uses arithmetic roundoff only. The plane predicate is
 * the same 1e-5-foot predicate used by the existing source-cap validation. */
function undersideSegmentCovered(a:Vec3,b:Vec3,triangles:[Vec3,Vec3,Vec3][]){
  const intervals:Array<[number,number]>=[],epsilon=128*Number.EPSILON;
  for(const t of triangles){
    const n=normal(t);if([a,b].some(p=>Math.abs(dot(sub(p,t[0]),n))>1e-5))continue;
    const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),[x,y]=[0,1,2].filter(k=>k!==drop),u=sub(t[1],t[0]),v=sub(t[2],t[0]),det=u[x]*v[y]-u[y]*v[x];if(!det)continue;
    const bary=(p:Vec3)=>{const q=sub(p,t[0]),s=(q[x]*v[y]-q[y]*v[x])/det,r=(u[x]*q[y]-u[y]*q[x])/det;return [1-s-r,s,r];};
    const start=bary(a),end=bary(b);let lo=0,hi=1;
    for(let k=0;k<3;k++){const d=end[k]-start[k];if(Math.abs(d)<epsilon){if(start[k]<-epsilon){hi=-1;break;}}else{const at=(-epsilon-start[k])/d;if(d>0)lo=Math.max(lo,at);else hi=Math.min(hi,at);}}
    if(lo<=hi&&hi>=0&&lo<=1)intervals.push([Math.max(0,lo),Math.min(1,hi)]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let covered=0;
  for(const [lo,hi]of intervals){if(lo>covered+epsilon)return false;covered=Math.max(covered,hi);if(covered>=1-epsilon)return true;}
  return false;
}
/** Independent edge-topology proof for a seam on thin contact triangles.
 * A connected chain has no geometric gaps: every edge is shared by the actual
 * emitted underside and a WHOLE independently certified source-contact face.
 * Partial contact fragments cannot certify a whole mesh edge. No spatial
 * welding or contact tolerance expansion is performed here. */
export function verifiedCapSeamCoversSegment(mesh:Mesh,certificates:Array<{generatedFace:number;triangle:[Vec3,Vec3,Vec3]}>,a:Vec3,b:Vec3){
  const triangles=trianglesOf(mesh),delta=sub(b,a),axis=delta.map(Math.abs).indexOf(Math.max(...delta.map(Math.abs))),length=Math.hypot(...delta);
  if(length<1e-10)return false;
  const certified=new Set(certificates.filter(c=>triangles[c.generatedFace]&&triangles[c.generatedFace].every(p=>c.triangle.some(q=>p.every((v,k)=>v===q[k])))).map(c=>c.generatedFace));
  const adjacency=new Map<string,Array<{face:number;from:number;to:number}>>();
  for(let face=0;face<mesh.indices.length/3;face++)for(let j=0;j<3;j++){
    const from=mesh.indices[face*3+j],to=mesh.indices[face*3+(j+1)%3],key=from<to?`${from}:${to}`:`${to}:${from}`,edges=adjacency.get(key)??[];
    edges.push({face,from,to});adjacency.set(key,edges);
  }
  // The production caller has also checked volume, intersections and material.
  // Enforce the closed oriented edge premise independently for this proof.
  if([...adjacency.values()].some(e=>e.length!==2||e[0].from!==e[1].to||e[0].to!==e[1].from))return false;
  const parent=new Map<number,number>(),values=new Map<number,number>();
  const find=(v:number):number=>{if(!parent.has(v)){parent.set(v,v);return v;}const p=parent.get(v)!;if(p===v)return v;const r=find(p);parent.set(v,r);return r;};
  for(const edges of adjacency.values()){
    const under=edges.find(e=>!certified.has(e.face)&&normal(triangles[e.face])[2]<-.2);
    if(!under||!edges.some(e=>e.face!==under.face&&certified.has(e.face)))continue;
    const ids=[under.from,under.to],points=ids.map(v=>Array.from(mesh.positions.slice(v*3,v*3+3)) as Vec3);
    const parameters=points.map(p=>(p[axis]-a[axis])/delta[axis]);
    // IEEE coordinate-roundoff bound only; no architectural distance allowance.
    const scale=Math.max(1,...a.map(Math.abs),...b.map(Math.abs),...points.flatMap(p=>p.map(Math.abs))),roundoff=128*Number.EPSILON*scale;
    if(points.some((p,i)=>Math.hypot(...p.map((v,k)=>v-a[k]-parameters[i]*delta[k]))>roundoff))continue;
    parent.set(find(ids[0]),find(ids[1]));ids.forEach((v,i)=>values.set(v,parameters[i]));
  }
  for(const root of new Set([...values.keys()].map(find))){
    const group=[...values].filter(([v])=>find(v)===root).map(([,u])=>u);
    const coordinateScale=Math.max(1,...a.map(Math.abs),...b.map(Math.abs)),arithmetic=128*Number.EPSILON*coordinateScale/Math.abs(delta[axis]);
    if(Math.min(...group)<=arithmetic&&Math.max(...group)>=1-arithmetic)return true;
  }
  return false;
}
/** Canonicalize only machine-roundoff duplicates in the NEW Boolean mesh.
 * This is a construction operation, never an intersection exemption. It keeps
 * every face and is followed by closed-edge, degeneracy, exact intersection,
 * native-solid, original-material and walking-coverage checks on the result. */
export function canonicalizeDerivedSeams(mesh:Mesh){
  let scale=1;for(const v of mesh.positions)scale=Math.max(scale,Math.abs(v));
  const bound=64*Number.EPSILON*scale,buckets=new Map<string,number[]>(),remap:number[]=[];
  let corrected=0,maxDisplacement=0;
  const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
  for(let vertex=0;vertex<mesh.positions.length/3;vertex++){
    const p=Array.from(mesh.positions.slice(vertex*3,vertex*3+3)),cell=p.map(v=>Math.floor(v/bound));let match:number|undefined;
    for(let x=-1;x<=1&&match===undefined;x++)for(let y=-1;y<=1&&match===undefined;y++)for(let z=-1;z<=1&&match===undefined;z++)for(const other of buckets.get(key(cell[0]+x,cell[1]+y,cell[2]+z))??[]){
      const distance=Math.hypot(...p.map((v,k)=>v-mesh.positions[other*3+k]));
      if(distance<=bound){match=other;maxDisplacement=Math.max(maxDisplacement,distance);break;}
    }
    if(match===undefined){match=vertex;const k=key(cell[0],cell[1],cell[2]),list=buckets.get(k)??[];list.push(vertex);buckets.set(k,list);}
    else {mesh.positions.set(mesh.positions.slice(match*3,match*3+3),vertex*3);corrected++;}
    remap[vertex]=match;
  }
  mesh.indices=mesh.indices.map(i=>remap[i]);
  return {corrected,maxDisplacement,roundoffBound:bound};
}
function actualMeshIntegrity(mesh:Mesh) {
  const edges=new Map<string,number[]>(),origin=Array.from(mesh.positions.slice(0,3)) as Vec3;
  let volume=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const ids=mesh.indices.slice(i,i+3);
    if(ids.some(v=>!Number.isInteger(v)||v<0||v*3+2>=mesh.positions.length))throw new Error("invalid derived index");
    const points=ids.map(v=>Array.from(mesh.positions.slice(v*3,v*3+3)) as Vec3);
    if(points.some(p=>p.some(v=>!Number.isFinite(v))))throw new Error("nonfinite derived coordinates");
    if(Math.hypot(...cross(sub(points[1],points[0]),sub(points[2],points[0])))<=1e-12)throw Object.assign(new Error("degenerate derived face"),{witness:{face:i/3,vertices:ids,points}});
    volume+=dot(sub(points[0],origin),cross(sub(points[1],origin),sub(points[2],origin)))/6;
    for(let j=0;j<3;j++){
      const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');
      const refs=edges.get(key)??[];refs.push(a<b?1:-1);edges.set(key,refs);
    }
  }
  const invalidEdges=[...edges.entries()].filter(([,e])=>e.length!==2||e[0]+e[1]!==0);
  if(!(volume>0)||invalidEdges.length)throw Object.assign(new Error("actual derived mesh is not closed and oriented"),{witness:{volume,invalidEdges:invalidEdges.length,examples:invalidEdges.slice(0,8).map(([key,orientations])=>({vertices:key,orientations,points:key.split(',').map(v=>Array.from(mesh.positions.slice(Number(v)*3,Number(v)*3+3)))}))}});
  const intersections=auditDerivedSelfIntersections(mesh);
  if(!intersections.clear)throw Object.assign(new Error("actual derived self-intersection"),{witness:intersections});
}

/** Reconstruct only the NEW connector volume outside the immutable originals.
 * Source-derived cap fragments must independently lie on their recorded source
 * triangle. Nonlocal cuts and loss of any walking facet reject reconstruction. */
export function reconstructExtension(pair:PortPair,models:TileModel[],tiles:PlacedTile[],constructionPass=0):Reconstruction {
  if(constructionPass>1)return {status:"UNVERIFIED",reason:"bounded material-contour construction exhausted"};
  if(!api)return {status:"UNVERIFIED",reason:"extension kernel not initialized"};
  const raw=transitionMeshes(pair);
  const key=JSON.stringify([pair,models.filter(m=>[pair.tileA,pair.tileB].includes(m.id)).map(m=>geometryRevision(m.connectionSurface!).id),tiles]);
  const cached=resultCache.get(key);if(cached)return structuredClone(cached);
  const owned:Manifold[]=[];
  try{
    const endpoints=[pair.tileA,pair.tileB].map(id=>{const tile=tiles.find(t=>t.id===id),model=models.find(m=>m.id===id||m.id===id.split("::")[0]);if(!tile||!model?.connectionSurface)throw new Error("missing source solid");return sourceSolid(model,tile);});
    const meshes:Mesh[]=[],contacts:ReconstructedContact[]=[];let removedVolume=0;
    const bodies=constructionBodies(pair,raw).map(r=>{
      const {positions,indices}=r;
      const input=new api!.Mesh({numProp:3,vertProperties:Float32Array.from(positions),triVerts:Uint32Array.from(indices)});input.merge();
      let solid:Manifold;
      try{solid=new api!.Manifold(input);}catch(error){throw Object.assign(new Error(`raw ${r.kind} body: ${String(error)}`),{witness:{positions:Array.from(positions),indices}});}
      owned.push(solid);
      if(positions instanceof Float64Array){solid=preciseKernelCopy(solid,positions);owned.push(solid);}
      if(solid.status()!=="NoError"||!(solid.volume()>0))throw new Error("raw connector solid invalid");
      return {kind:r.kind,solid};
    });
    // A stair is one material body, not disconnected independently clipped
    // tread boxes. All original tread facets remain subject to the complete
    // coverage proof below and to independent tread/riser checks in the gate.
    const construction=bodies.length>1?[{kind:raw[0].kind,solid:api.Manifold.union(bodies.map(b=>b.solid))}]:bodies;
    if(construction!==bodies)owned.push(construction[0].solid);
    for(const r of construction){
      let solid=r.solid;
      const before=solid.volume();
      for(const source of endpoints){solid=solid.subtract(source.solid);owned.push(solid);}
      const triangleBudget=pair.featureConnection?SOURCE_CONTOUR_CONSTRUCTION.maximumDerivedTriangles:4096;
      if(solid.status()!=="NoError"||!(solid.volume()>0)||solid.numTri()>triangleBudget)throw Object.assign(new Error("invalid or excessive reconstructed connector"),{witness:{status:solid.status(),volume:solid.volume(),triangles:solid.numTri(),triangleBudget,constructionPass}});
      for(const source of endpoints){const overlap=solid.intersect(source.solid);owned.push(overlap);if(overlap.status()!=="NoError"||overlap.volume()>1e-9)throw new Error("reconstructed material overlap");}
      removedVolume+=before-solid.volume();
      // Boolean fragments cannot constitute one traversable extension. Retain a
      // single candidate body; complete walking coverage and both-end contact
      // proofs below must still pass after discarding derived-only fragments.
      const fragments=solid.decompose();owned.push(...fragments);
      if(!fragments.length)throw new Error("empty reconstructed connector");
      const body=fragments.reduce((a,b)=>a.volume()>b.volume()?a:b);
      const m=body.getMesh(),mesh={kind:r.kind,positions:nativeMeshPositions(body,m),indices:Array.from(m.triVerts)};
      const alignment=alignCapVertices(mesh,m,endpoints);
      Object.assign(alignment,{seams:canonicalizeDerivedSeams(mesh)});
      actualMeshIntegrity(mesh);
      // nativeMeshPositions proved the index correspondence. Apply the actual
      // emitted coordinates to a private identity copy, avoiding a Float32
      // round trip that can collapse distinct Boolean intersection vertices.
      let comparisonBody=body;
      if(alignment.retriangulatedFaces){
        const input=new api!.Mesh({numProp:3,vertProperties:Float32Array.from(mesh.positions),triVerts:Uint32Array.from(mesh.indices)});
        const rebuilt=new api!.Manifold(input);owned.push(rebuilt);
        comparisonBody=preciseKernelCopy(rebuilt,mesh.positions);owned.push(comparisonBody);
      }
      const actual=alignment.retriangulatedFaces?comparisonBody:body.warpBatch((vertices,count)=>{
        if(vertices.length!==mesh.positions.length||count*3!==mesh.positions.length)throw new Error("emitted native vertex correspondence UNVERIFIED");
        vertices.set(mesh.positions);
      });if(!alignment.retriangulatedFaces)owned.push(actual);
      if(actual.status()!=="NoError"||!(actual.volume()>0))throw new Error("emitted reconstruction is not a closed valid solid");
      const components=actual.decompose();
      const connected=components.length===1;components.forEach(c=>c.delete());
      if(!connected)throw new Error("disconnected emitted reconstruction");
      for(const source of endpoints){
        const overlap=actual.intersect(source.solid);owned.push(overlap);
        if(overlap.status()!=="NoError"||overlap.volume()>1e-9){
          const error=new Error("actual emitted material overlap");
          Object.assign(error,{witness:{sourceOriginalID:source.original,volume:overlap.volume(),triangles:overlap.numTri(),alignment}});throw error;
        }
      }
      const triangles=trianglesOf(mesh);
      for(let run=0;run<m.runOriginalID.length;run++){
        const sourceIndex=endpoints.findIndex(s=>s.original===m.runOriginalID[run]);if(sourceIndex<0)continue;
        const endpoint=sourceIndex===0?pair.from:pair.to,id=sourceIndex===0?pair.tileA:pair.tileB;
        for(let face=m.runIndex[run]/3;face<m.runIndex[run+1]/3;face++){
          const triangle=triangles[face],sourceTriangle=m.faceID[face],original=endpoints[sourceIndex].triangles[sourceTriangle];
          const sourceTriangles=capCoverage(triangle,endpoints[sourceIndex],sourceTriangle);
          if(!sourceTriangles) {
            const error=new Error("source-cap correspondence UNVERIFIED");
            Object.assign(error,{witness:{sourceId:id,sourceTriangle,generatedFace:face,runOriginalID:m.runOriginalID[run],
              originalTriangle:original,generatedTriangle:triangle,vertexCorrespondence:original?triangle.map(p=>pointOnContact(p,original)):null,
              coordinateFrame:"architectural-feet-z-up",removedVolume:before-solid.volume()}});
            throw error;
          }
          if(triangle.some(p=>Math.hypot(p[0]-endpoint[0],p[1]-endpoint[1])>Math.max(pair.startWidth??pair.usableWidth,pair.endWidth??pair.usableWidth)+2))throw new Error("nonlocal route cut requires rerouting");
          contacts.push({sourceId:id,sourceTriangle,sourceTriangles,generatedFace:face,triangle});
        }
      }
      // An uncut endpoint cap retains the raw connector's ID rather than a
      // source ID. Qualify it from actual source geometry, never from proximity.
      for(let side=0;side<endpoints.length;side++){
        const id=side===0?pair.tileA:pair.tileB,point=side===0?pair.from:pair.to;
        const direction=side===0?pair.startDirection:pair.endDirection;if(!direction)continue;
        for(let face=0;face<triangles.length;face++){
          const t=triangles[face],n=normal(t);
          if(Math.abs(dot(n,direction))<.7||t.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])>Math.max(pair.startWidth??pair.usableWidth,pair.endWidth??pair.usableWidth)+2))continue;
          if(contacts.some(c=>c.sourceId===id&&c.generatedFace===face))continue;
          const source=endpoints[side];
          const claimed=source.triangles.findIndex(original=>t.every(p=>Math.abs(dot(sub(p,original[0]),normal(original)))<=1e-5)&&t.some(p=>pointOnContact(p,original)));
          if(claimed<0)continue;
          const ids=capCoverage(t,source,claimed);
          if(ids)contacts.push({sourceId:id,sourceTriangle:claimed,sourceTriangles:ids,generatedFace:face,triangle:t});
          else for(let original=0;original<source.triangles.length;original++){
            const triangle=source.triangles[original];
            for(const fragment of capContactFragments(t,triangle))contacts.push({sourceId:id,sourceTriangle:original,sourceTriangles:[original],generatedFace:face,triangle:fragment});
          }
        }
      }
      meshes.push(mesh);
    }
    if(![pair.tileA,pair.tileB].every(id=>contacts.some(c=>c.sourceId===id)))throw new Error("both endpoint material caps not verified");
    let walkingWitness:unknown;
    if(!walkingCoverage(raw,meshes,endpoints,witness=>{walkingWitness=witness;})){
      const error=new Error("reconstruction loses continuous walking surface");
      Object.assign(error,{witness:walkingWitness});throw error;
    }
    const undersideJoins:UndersideJoin[]=[],proposals:Array<MaterialBoundary|undefined>=[];
    // Upper and lower OBJ rims need not share XY coordinates. Certify a
    // connected full-width join on the ACTUAL original/emitted boundaries,
    // rather than assume the lower rim sits vertically beneath the floor edge.
    for(const [side,contour]of [pair.extension?.start.contour,pair.extension?.end.contour].entries())if(contour){
      const id=side===0?pair.tileA:pair.tileB,endpoint=side===0?pair.from:pair.to;
      const width=side===0?pair.startWidth??pair.usableWidth:pair.endWidth??pair.usableWidth,direction=side===0?pair.startDirection!:pair.endDirection!,length=Math.hypot(direction[0],direction[1]),across:Vec3=[-direction[1]/length,direction[0]/length,0];
      const fraction=(p:Vec3)=>.5+dot(sub(p,endpoint),across)/width;
      const bound=width+2,original=endpoints[side].triangles.filter((t,i)=>endpoints[side].outward[i][2]<-.2&&[0,1].every(k=>Math.min(...t.map(p=>p[k]))<=endpoint[k]+bound&&Math.max(...t.map(p=>p[k]))>=endpoint[k]-bound));
      const cap=contacts.filter(c=>c.sourceId===id).map(c=>c.triangle),edges:Array<{a:Vec3;b:Vec3;nodes:[string,string];interval:[number,number]}>=[];
      const emittedUnderside=meshes.flatMap(trianglesOf).filter(t=>normal(t)[2]<-.2);
      if(contour.materialBoundary){
        const points=contour.materialBoundary.points,edgeTopologySegments:number[]=[];
        for(let i=1;i<points.length;i++){
          const a=points[i-1],b=points[i],coverage={original:undersideSegmentCovered(a,b,original),cap:undersideSegmentCovered(a,b,cap),derivedUnderside:undersideSegmentCovered(a,b,emittedUnderside)};
          if(coverage.original&&(!coverage.cap||!coverage.derivedUnderside)&&meshes.some(mesh=>verifiedCapSeamCoversSegment(mesh,contacts.filter(c=>c.sourceId===id),a,b))){coverage.cap=true;coverage.derivedUnderside=true;edgeTopologySegments.push(i);}
          if(Object.values(coverage).some(ok=>!ok)){
            const midpoint=a.map((v,k)=>(v+b[k])/2) as Vec3;
            const nearest=(triangles:[Vec3,Vec3,Vec3][])=>triangles.map((triangle,index)=>({index,triangle,distance:Math.min(...triangle.map(p=>Math.hypot(...sub(p,midpoint)))),midpointOnFace:pointOnContact(midpoint,triangle)})).sort((a,b)=>a.distance-b.distance).slice(0,6);
            const unclassifiedLocalContacts:Array<{generatedFace:number;triangle:[Vec3,Vec3,Vec3];directionDot:number;sourceTriangles:number[]}>=[];
            for(const mesh of meshes)for(const [face,triangle]of trianglesOf(mesh).entries()){
              if(unclassifiedLocalContacts.length>=6||contacts.some(c=>c.sourceId===id&&c.generatedFace===face)||[0,1,2].some(k=>Math.max(...triangle.map(p=>p[k]))<Math.min(a[k],b[k])-1e-5||Math.min(...triangle.map(p=>p[k]))>Math.max(a[k],b[k])+1e-5))continue;
              const source=endpoints[side],claimed=source.triangles.findIndex(t=>triangle.every(p=>Math.abs(dot(sub(p,t[0]),normal(t)))<=1e-5)&&triangle.some(p=>pointOnContact(p,t)));
              if(claimed<0)continue;const sourceTriangles=capCoverage(triangle,source,claimed);
              if(sourceTriangles)unclassifiedLocalContacts.push({generatedFace:face,triangle,directionDot:Math.abs(dot(normal(triangle),direction)),sourceTriangles});
            }
            throw Object.assign(new Error("matched original underside contour discontinuity"),{witness:{sourceId:id,segment:i,from:a,to:b,coverage,originalWitnesses:nearest(original),capWitnesses:nearest(cap),derivedWitnesses:nearest(emittedUnderside),unclassifiedLocalContacts,witnessLimit:6}});
          }
        }
        undersideJoins.push({sourceId:id,edges:points.slice(1).map((p,i)=>[points[i],p]),coverage:[0,1],parameter:"source-material-contour-arc",method:"connected exact material-boundary join",edgeTopologySegments});continue;
      }
      // Only an exterior derived underside / verified source-cap seam is an
      // attachment boundary. Diagonals inside a contact patch are not contours.
      for(const [mi,mesh]of meshes.entries()){
      const capFaces=new Set(contacts.filter(c=>c.sourceId===id).map(c=>c.generatedFace)),adjacency=new Map<string,number[]>();
      const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
      for(let f=0;f<mesh.indices.length/3;f++)for(let j=0;j<3;j++){const a=mesh.indices[f*3+j],b=mesh.indices[f*3+(j+1)%3],key=edgeKey(a,b),list=adjacency.get(key)??[];list.push(f);adjacency.set(key,list);}
      for(let face=0;face<mesh.indices.length/3;face++){
        if(capFaces.has(face))continue;
        const ids=mesh.indices.slice(face*3,face*3+3),t=ids.map(v=>Array.from(mesh.positions.slice(v*3,v*3+3)) as Vec3) as [Vec3,Vec3,Vec3];if(normal(t)[2]>=-.2)continue;
        for(let edge=0;edge<3;edge++){
          if(!(adjacency.get(edgeKey(ids[edge],ids[(edge+1)%3]))??[]).some(f=>capFaces.has(f)))continue;
          const a=t[edge],b=t[(edge+1)%3];if([a,b].some(p=>Math.hypot(p[0]-endpoint[0],p[1]-endpoint[1])>bound))continue;
          if(!undersideSegmentCovered(a,b,original)||!undersideSegmentCovered(a,b,cap))continue;
          const u=fraction(a),v=fraction(b);edges.push({a,b,nodes:[`${mi}:${ids[edge]}`,`${mi}:${ids[(edge+1)%3]}`],interval:[Math.max(0,Math.min(u,v)),Math.min(1,Math.max(u,v))]});
        }
      }
      }
      const parent=new Map<string,string>(),find=(x:string):string=>{const p=parent.get(x);if(!p){parent.set(x,x);return x;}if(p===x)return x;const r=find(p);parent.set(x,r);return r;};
      for(const e of edges)parent.set(find(e.nodes[0]),find(e.nodes[1]));
      let verified:typeof edges|undefined;
      for(const root of new Set(edges.map(e=>find(e.nodes[0])))){
        const group=edges.filter(e=>find(e.nodes[0])===root),intervals=group.map(e=>e.interval).filter(([a,b])=>b>=a).sort((a,b)=>a[0]-b[0]);let covered=0;
        for(const [lo,hi]of intervals){if(lo>covered+128*Number.EPSILON)break;covered=Math.max(covered,hi);}if(covered>=1-128*Number.EPSILON){verified=group;break;}
      }
      if(!verified){
        if(constructionPass||!edges.length)throw Object.assign(new Error("actual underside boundary join UNVERIFIED"),{witness:{sourceId:id,qualifiedEdges:edges.length,intervals:edges.map(e=>e.interval)}});
        // The actual lower material can be narrower/asymmetric relative to the
        // walking deck. Use the verified connected lower contour to CONSTRUCT
        // a tapered underside, never to accept the unchanged rectangular one.
        const groups=[...new Set(edges.map(e=>find(e.nodes[0])))].map(root=>edges.filter(e=>find(e.nodes[0])===root)).sort((a,b)=>Math.max(...b.flatMap(e=>e.interval))-Math.min(...b.flatMap(e=>e.interval))-(Math.max(...a.flatMap(e=>e.interval))-Math.min(...a.flatMap(e=>e.interval))));
        const group=groups[0],nodes=new Map<string,Vec3>(),adjacent=new Map<string,string[]>();
        for(const e of group){for(const [node,p]of [[e.nodes[0],e.a],[e.nodes[1],e.b]] as Array<[string,Vec3]>)nodes.set(node,p);for(const [a,b]of [e.nodes,[e.nodes[1],e.nodes[0]]]){const list=adjacent.get(a)??[];if(!list.includes(b))list.push(b);adjacent.set(a,list);}}
        const ordered=[...nodes.keys()].sort((a,b)=>fraction(nodes.get(a)!)-fraction(nodes.get(b)!)),start=ordered[0],end=ordered.at(-1)!,queue=[start],previous=new Map<string,string|null>([[start,null]]);
        for(let i=0;i<queue.length&&!previous.has(end);i++)for(const next of adjacent.get(queue[i])??[])if(!previous.has(next)){previous.set(next,queue[i]);queue.push(next);}
        const path:string[]=[];for(let node:string|null=end;node!==null;node=previous.get(node)??null)path.unshift(node);
        const points=path.map(node=>nodes.get(node)!),distances=[0];for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(...sub(points[i],points[i-1])));
        const run=distances.at(-1)!;if(points.length<2||points.length>65||run<1e-4)throw new Error("verified lower-contour construction budget or degeneracy");
        proposals[side]={points,fractions:distances.map(d=>d/run),sourceId:id,method:"verified original-material contact contour"};continue;
      }
      undersideJoins.push({sourceId:id,edges:verified.map(e=>[e.a,e.b]),coverage:[0,1],parameter:"walking-profile-width",method:"connected exact material-boundary join"});
    }
    if(proposals.some(Boolean)){
      for(const [side,boundary]of proposals.entries())if(boundary){const contour=side===0?pair.extension!.start.contour!:pair.extension!.end.contour!;contour.materialBoundary=boundary;}
      const rebuilt=reconstructExtension(pair,models,tiles,constructionPass+1);if(rebuilt.status==="PASS"){if(resultCache.size>=64)resultCache.delete(resultCache.keys().next().value!);resultCache.set(key,structuredClone(rebuilt));}return structuredClone(rebuilt);
    }
    const result:Reconstruction={status:"PASS",meshes,contacts,removedVolume,walkingCoverage:"VERIFIED",undersideJoins,materialBoundaries:[pair.extension?.start.contour?.materialBoundary,pair.extension?.end.contour?.materialBoundary]};
    if(resultCache.size>=64)resultCache.delete(resultCache.keys().next().value!);resultCache.set(key,result);return structuredClone(result);
  }catch(error){return {status:"UNVERIFIED",reason:error instanceof Error?error.message:String(error),
    witness:error instanceof Error?(error as Error & {witness?:unknown}).witness:undefined};}
  finally{owned.forEach(s=>s.delete());}
}
