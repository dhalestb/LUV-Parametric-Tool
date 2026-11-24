import { architecturalSurfaces, type ArchitecturalSurface } from "./architecturalSurfaces";
import { analyzeMesh } from "./analyze";
import { geometryRevision } from "./geometryRevision";
import { auditDerivedSelfIntersections } from "./connectionClearance";
import { surfaceOrientation } from "./surfaceOrientation";
import { localPoint, worldFromLocal, type WalkableAnchor } from "./surfaceAttachment";
import { pointOnContact, certifyWorkingMaterial } from "./extensionReconstruction";
import type { ImportedObj, TileModel, Vec3 } from "./types";

export type BranchAdjustment = {
  region:number; end:-1|1; widening:number; extension:number; redirection:number; elevation:number;flattenUpper?:boolean;
};
export const BRANCH_ADAPTATION_LIMITS={maximumDisplacement:1.5,maximumExtent:8,maximumVertices:80000,maximumTriangles:50000};
export type BranchProvenance={sourceRevision:number;sourceId:string;plan:BranchAdjustment;
  originalDirection:Vec3;originalCentroid:Vec3;
  changedVertices:number[];changedTriangles:number[];branchTriangles:number[];maximumDisplacement:number;
  displacementCost:number;extent: {min:Vec3;max:Vec3};
  rotatedFaceNormals:number[];materialVolume:number;
  topology:"UNCHANGED";sourceGeometry:"UNCHANGED";selfIntersection:"VERIFIED";
  walkingSuitability:"UNVERIFIED";structuralCapacity:"UNVERIFIED"};
export type BranchAdaptation={valid:true;model:TileModel;provenance:BranchProvenance}|
  {valid:false;reason:string;witness?:unknown};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,k)=>s+v*b[k],0);
const subtract=(a:Vec3,b:Vec3)=>a.map((v,k)=>v-b[k]) as Vec3;
function normal(p:Float32Array,f:number[]){const a=Array.from(p.slice(f[0]*3,f[0]*3+3)) as Vec3,b=Array.from(p.slice(f[1]*3,f[1]*3+3)) as Vec3,c=Array.from(p.slice(f[2]*3,f[2]*3+3)) as Vec3;
  const u=subtract(b,a),v=subtract(c,a);return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]] as Vec3;}

/** Private full-mesh working copy. A compact, smooth displacement field moves
 * upper surface, underside and side walls together. Original indices and all
 * unaffected coordinate values remain exact; no source repair or remeshing.
 * This is a candidate construction, never a circulation acceptance certificate. */
export function adaptBranch(model:TileModel,plan:BranchAdjustment):BranchAdaptation {
  const source=model.connectionSurface;
  if(!source)return {valid:false,reason:"missing original geometry"};
  if(source.positions.length/3>BRANCH_ADAPTATION_LIMITS.maximumVertices||source.triangles.length/3>BRANCH_ADAPTATION_LIMITS.maximumTriangles)
    return {valid:false,reason:"complete-mesh adaptation budget; no triangles omitted"};
  const physical=surfaceOrientation(source);
  if(physical.components.some(c=>c.boundaryEdges||c.inconsistentEdges||c.uncertainty))return {valid:false,reason:"whole working-material topology UNVERIFIED; local open/nonmanifold adaptation not implemented"};
  if(![-1,1].includes(plan.end)||![plan.widening,plan.extension,plan.redirection,plan.elevation].every(Number.isFinite)||plan.widening<0||plan.widening>1.5||Math.abs(plan.extension)>1||Math.abs(plan.redirection)>.75||Math.abs(plan.elevation)>.25)
    return {valid:false,reason:"bounded branch adjustment limits"};
  const branch=architecturalSurfaces(model).find(r=>r.region===plan.region&&r.role==="projecting branch");
  if(!branch)return {valid:false,reason:"no geometry-derived projecting branch"};
  const axis=branch.majorDirection.map(v=>v*plan.end) as Vec3,side:Vec3=[-axis[1],axis[0],0];
  const along=(p:Vec3)=>dot(subtract(p,branch.centroid),axis);
  // Exact original branch vertices, not an assumed rectangular branch.
  const vertices=[...new Set(branch.triangles.flatMap(i=>source.triangles.slice(i*3,i*3+3)))];
  const points=vertices.map(i=>Array.from(source.positions.slice(i*3,i*3+3)) as Vec3);
  const start=Math.min(...points.map(along)),end=Math.max(...points.map(along)),length=end-start;
  const extent=Math.min(BRANCH_ADAPTATION_LIMITS.maximumExtent-.5,length);
  if(extent<2.5)return {valid:false,reason:"branch too short for bounded smooth adjustment"};
  const root=end-extent;
  const upperHeight=(p:Vec3)=>{let height=-Infinity;
    for(const id of branch.triangles){const [a,b,c]=physical.triangles[id].points,u=subtract(b,a),v=subtract(c,a),den=u[0]*v[1]-u[1]*v[0];if(Math.abs(den)<1e-12)continue;
      const s=((p[0]-a[0])*v[1]-(p[1]-a[1])*v[0])/den,t=(u[0]*(p[1]-a[1])-u[1]*(p[0]-a[0]))/den;
      if(s>=-1e-7&&t>=-1e-7&&s+t<=1+1e-7)height=Math.max(height,a[2]+s*u[2]+t*v[2]);}
    return height;};
  const positions=source.positions.slice(),changedVertices:number[]=[],changedSet=new Set<number>();
  let maximumDisplacement=0,displacementCost=0;
  const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3){
    const p=Array.from(source.positions.slice(i,i+3)) as Vec3,a=along(p),b=dot(subtract(p,branch.centroid),side);
    // Compact support extends 0.5 ft beyond the original tip so its wall and
    // underside are moved as one material region. Distant floors stay fixed.
    const axial=smooth((a-root)/Math.max(1,extent*.55))*(1-smooth((a-end-.05)/.45));
    const lateral=1-smooth((Math.abs(b)-1.75)/1.75);
    // Do not drag a neighboring upper floor into a lower-branch adjustment.
    // A private material envelope includes the branch underside, fades below
    // it, and stops above the measured branch surface elevation range.
    const vertical=smooth((p[2]-(branch.min[2]-1.5))/.25)*(1-smooth((p[2]-branch.max[2]-.025)/.125));
    const weight=axial*lateral*vertical;
    if(weight===0)continue;
    const spread=plan.widening*Math.tanh(b/.5),across=spread+plan.redirection;
    const top=plan.flattenUpper?upperHeight(p):-Infinity;
    // Lift the actual upper contour and its corresponding material column
    // together, rather than laying a new plate on top. A .25-ft maximum local
    // vertical correction is a deformation bound, not a relaxed slope limit.
    const correction=Number.isFinite(top)?branch.max[2]-top:0;
    if(Math.abs(weight*(plan.elevation+correction))>.25)return {valid:false,reason:"upper-contour correction exceeds local elevation limit",witness:{vertex:i/3,correction,weight}};
    const moved=p.map((v,k)=>v+weight*(axis[k]*plan.extension+side[k]*across+(k===2?plan.elevation+correction:0))) as Vec3;
    positions.set(moved,i);
    const displacement=Math.hypot(...p.map((v,k)=>positions[i+k]-v));
    if(displacement===0)continue;
    if(displacement>BRANCH_ADAPTATION_LIMITS.maximumDisplacement)return {valid:false,reason:"maximum local displacement exceeded",witness:{vertex:i/3,displacement}};
    changedVertices.push(i/3);changedSet.add(i/3);maximumDisplacement=Math.max(maximumDisplacement,displacement);displacementCost+=displacement*displacement;
    for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k],positions[i+k]);max[k]=Math.max(max[k],p[k],positions[i+k]);}
  }
  if(!changedVertices.length)return {valid:false,reason:"adjustment leaves branch unchanged"};
  const changedTriangles:number[]=[],rotatedFaceNormals:number[]=[];
  for(let i=0;i<source.triangles.length;i+=3){const face=source.triangles.slice(i,i+3);if(!face.some(v=>changedSet.has(v)))continue;
    changedTriangles.push(i/3);const before=normal(source.positions,face),after=normal(positions,face);
    if(Math.hypot(...after)<1e-10)return {valid:false,reason:"degenerate adapted triangle",witness:{face:i/3,before,after}};
    // A material-preserving shear can rotate a wall normal past its original
    // direction. This dot product is diagnostic, not a winding certificate.
    // Exact self-intersection and complete native material checks below decide.
    if(dot(before,after)<=0)rotatedFaceNormals.push(i/3);
    // A sparse long triangle can carry a moved endpoint beyond the influence
    // field. Account for its entire geometry, including unchanged vertices.
    for(const vertex of face)for(let k=0;k<3;k++){min[k]=Math.min(min[k],source.positions[vertex*3+k],positions[vertex*3+k]);max[k]=Math.max(max[k],source.positions[vertex*3+k],positions[vertex*3+k]);}
    if(face.some(vertex=>along(Array.from(source.positions.slice(vertex*3,vertex*3+3)) as Vec3)<end-BRANCH_ADAPTATION_LIMITS.maximumExtent))
      return {valid:false,reason:"sparse face extends adjustment beyond local branch extent",witness:{face:i/3}};
  }
  // Complete original/working mesh, including remote geometry. A disputed
  // pre-existing self-contact remains unsupported rather than being repaired.
  // OBJ may duplicate a vertex for normal/group seams. Recognize only exact
  // coordinate identity on an audit index copy; do not weld source geometry
  // or use a distance tolerance to conceal material intersections.
  const representatives=new Map<string,number>(),auditVertices:number[]=[];
  for(let i=0;i<positions.length;i+=3){const key=Array.from(positions.slice(i,i+3)).join(',');
    const representative=representatives.get(key)??i/3;representatives.set(key,representative);auditVertices.push(representative);}
  const intersection=auditDerivedSelfIntersections({positions,indices:source.triangles.map(i=>auditVertices[i])});
  if(!intersection.clear)return {valid:false,reason:"working mesh self-intersection UNVERIFIED",witness:intersection};
  const faces=source.triangles.reduce<ImportedObj["faces"]>((all,_,i)=>{if(i%3===0)all.push({vertices:source.triangles.slice(i,i+3),normals:null});return all;},[]);
  const absolute=positions.map((v,i)=>v+model.anchor[i%3]);
  // Explicit architectural coordinates are already converted once. Rebuild
  // voxels, ports and all variants from working geometry, with the original
  // registration anchor fixed. No extra unit or axis conversion occurs.
  const working=analyzeMesh({id:model.id,filename:model.filename,positions:absolute,normals:new Float32Array(),faces,upAxis:"z"} as ImportedObj,model.slotId,1,"z",model.cellFeet,model.anchor);
  // Keep the exact adjusted Float32 coordinates instead of an add/subtract
  // round trip through the source registration anchor.
  working.connectionSurface={positions,triangles:source.triangles.slice()};
  working.sourceResponsiveExtensions=true;
  const material=certifyWorkingMaterial(working);
  if(material.status!=="VERIFIED")return {valid:false,reason:"working material UNVERIFIED: "+material.reason};
  const provenance:BranchProvenance={sourceRevision:geometryRevision(source).id,sourceId:model.id,plan:{...plan},originalDirection:[...branch.majorDirection],originalCentroid:[...branch.centroid],changedVertices,changedTriangles,branchTriangles:branch.triangles.slice(),maximumDisplacement,displacementCost,extent:{min,max},rotatedFaceNormals,materialVolume:material.volume,topology:"UNCHANGED",sourceGeometry:"UNCHANGED",selfIntersection:"VERIFIED",walkingSuitability:"UNVERIFIED",structuralCapacity:"UNVERIFIED"};
  working.branchAdaptation=provenance;
  return {valid:true,model:working,provenance};
}

/** Smallest attempts first; all dimensions are feet after configured import.
 * A region number is measured per upload, never a reference-mesh special case. */
export function branchAdjustmentPlans(branch:ArchitecturalSurface):BranchAdjustment[]{
  const plans:BranchAdjustment[]=[.25,.5,.75,1].flatMap(widening=>[-1,1].map(end=>({region:branch.region,end:end as -1|1,widening,extension:0,redirection:0,elevation:0,flattenUpper:widening>=.75})));
  // Retract the actual derived tip/underside together to leave external space
  // for a landing or climbing run. This does not credit flat approach distance
  // as climbing run or relax final slope/width/contact requirements.
  for(const setback of [.5,1])for(const end of [-1,1] as const)plans.push({region:branch.region,end,widening:.5,extension:-setback,redirection:0,elevation:0});
  return plans;
}

/** Retain branch identity after adaptation changes PCA/region segmentation.
 * Correspondence is exact original triangle indexing plus physical point
 * containment on the final working upper surface, never just proximity. */
export function isBranchInterface(model:TileModel,tile:import("./types").PlacedTile,point:Vec3){
  if(!model.connectionSurface||!model.branchAdaptation)return false;
  const p=localPoint(point,tile,model),metadata=surfaceOrientation(model.connectionSurface);
  return model.branchAdaptation.branchTriangles.some(id=>{const triangle=metadata.triangles[id];return triangle.normalZ>=.65&&pointOnContact(p,triangle.points);});
}

/** Candidate cross-sections through actual branch triangles. Curved branch
 * boundaries need not already contain a straight 2-ft exterior edge. These
 * interior starts still earn complete approach, throat, emitted cap, material
 * overlap and clearance validation; a section span alone earns no acceptance. */
export function branchSectionAnchors(model:TileModel,tile:import("./types").PlacedTile,limit=32):Array<WalkableAnchor&{id:string}>{
  if(!model.connectionSurface)return [];
  const metadata=surfaceOrientation(model.connectionSurface),surfaces=architecturalSurfaces(model);
  const groups=model.branchAdaptation?[{triangles:model.branchAdaptation.branchTriangles,centroid:model.branchAdaptation.originalCentroid,majorDirection:model.branchAdaptation.originalDirection}]:surfaces.filter(r=>r.role==="projecting branch");
  const anchors:Array<WalkableAnchor&{id:string}>=[];
  for(const [g,branch]of groups.entries()){
    if(!branch.majorDirection)continue;const axis=branch.majorDirection,side:Vec3=[-axis[1],axis[0],0];
    const along=(p:Vec3)=>dot(subtract(p,branch.centroid),axis),across=(p:Vec3)=>dot(subtract(p,branch.centroid),side);
    let start=Infinity,end=-Infinity;
    for(const id of branch.triangles)for(const p of metadata.triangles[id].points){start=Math.min(start,along(p));end=Math.max(end,along(p));}
    for(const fraction of [.15,.3,.5,.7,.85]){
      const station=start+(end-start)*fraction,segments:Array<{a:number;b:number;triangle:number}>=[];
      for(const id of branch.triangles){const t=metadata.triangles[id];if(t.normalZ<.7)continue;const distances=t.points.map(p=>along(p)-station),hits:number[]=[];
        for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(distances[i])<1e-10)hits.push(across(t.points[i]));if(distances[i]*distances[j]<0){const u=distances[i]/(distances[i]-distances[j]);hits.push(across(t.points[i])+u*(across(t.points[j])-across(t.points[i])));}}
        if(hits.length>=2)segments.push({a:Math.min(...hits),b:Math.max(...hits),triangle:id});
      }
      segments.sort((a,b)=>a.a-b.a);const intervals:Array<[number,number]>=[];
      for(const segment of segments){const last=intervals.at(-1);if(!last||segment.a>last[1]+1e-9)intervals.push([segment.a,segment.b]);else last[1]=Math.max(last[1],segment.b);}
      const widest=intervals.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];if(!widest||widest[1]-widest[0]<2.1)continue;
      const middle=(widest[0]+widest[1])/2,triangle=segments.find(s=>s.a<=middle&&s.b>=middle);if(!triangle)continue;
      const point=branch.centroid.map((v,k)=>v+axis[k]*station+side[k]*middle) as Vec3;
      const [a,b,c]=metadata.triangles[triangle.triangle].points,u=subtract(b,a),v=subtract(c,a),den=u[0]*v[1]-u[1]*v[0];if(Math.abs(den)<1e-12)continue;
      const s=((point[0]-a[0])*v[1]-(point[1]-a[1])*v[0])/den,t=(u[0]*(point[1]-a[1])-u[1]*(point[0]-a[0]))/den;point[2]=a[2]+s*u[2]+t*v[2];
      const world=worldFromLocal(point,tile,model),profile=[-1,1].map(sign=>worldFromLocal(point.map((v,k)=>v+side[k]*1.05*sign) as Vec3,tile,model)) as [Vec3,Vec3];
      for(const sign of [-1,1]){const endPoint=worldFromLocal(point.map((v,k)=>v+axis[k]*sign) as Vec3,tile,model),outward=endPoint.map((v,k)=>v-world[k]) as Vec3;
        anchors.push({id:`branch-section-${g}-${fraction}-${sign}`,point:world,run:profile,width:2.1,outward,kind:"edge",snap:0});if(anchors.length>=limit)return anchors;}
    }
  }
  return anchors;
}

/** Full separately identified working geometry; no source file is rewritten.
 * Already interpreted architectural coordinates are placed exactly once. */
export function workingBranchesToObj(models:TileModel[],tiles:import("./types").PlacedTile[]){
  const lines=["# Derived working assembly; architectural feet, Z-up", "# Original uploads are separate immutable sources. Not a circulation certificate." ];let offset=0;
  for(const model of models){const surface=model.connectionSurface,tile=tiles.find(t=>t.id===model.id);if(!surface||!tile)throw new Error("Missing working geometry or placement");
    lines.push(`g ${model.branchAdaptation||model.featureAdaptation?"adapted-working":"unchanged-instance"}-${model.id.replace(/[^a-zA-Z0-9_-]/g,"_")}`);
    for(let i=0;i<surface.positions.length;i+=3){const p=worldFromLocal(Array.from(surface.positions.slice(i,i+3)) as Vec3,tile,model);lines.push(`v ${p.map(String).join(" ")}`);}
    for(let i=0;i<surface.triangles.length;i+=3){const f=surface.triangles.slice(i,i+3);if(model.variants[tile.variant].mirror!=="none")[f[1],f[2]]=[f[2],f[1]];lines.push(`f ${f.map(v=>v+offset+1).join(" ")}`);}
    offset+=surface.positions.length/3;
  }
  return lines.join("\n")+"\n";
}
