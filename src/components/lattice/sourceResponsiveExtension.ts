import { geometryRevision } from "./geometryRevision";
import { materialSideIndex } from "./materialSideEvidence";
import { localPoint, worldFromLocal } from "./surfaceAttachment";
import { surfaceOrientation } from "./surfaceOrientation";
import { transitionSections } from "./transitionGeometry";
import { reconstructExtension, SOURCE_CONTOUR_CONSTRUCTION, type ReconstructedContact } from "./extensionReconstruction";
import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";

export type ExtensionInterface = {
  sourceId: string;
  revision: number;
  triangles: number[];
  /** Thickness at the two walking edges, in traversal order. */
  thickness: [number, number];
  interiorDepth: number;
  contour?: {fractions:number[];thickness:number[];underside:Vec3[];gradients:Array<[number,number]>;depthProfiles:number[][];depthVariation:number;
    materialBoundary?:{points:Vec3[];fractions:number[];sourceId:string;method:"verified original-material contact contour"}};
};
export type ExtensionEvidence = {
  start: ExtensionInterface;
  end: ExtensionInterface;
  coordinates: "architectural-feet-z-up";
  method: "measured-source-material-ribbon";
  contourConstruction?:typeof SOURCE_CONTOUR_CONSTRUCTION;
  structuralCapacity: "UNVERIFIED";
  reconstruction?: {status:"PASS";removedVolume:number;walkingCoverage:"VERIFIED"} | {status:"UNVERIFIED";reason:string};
  reconstructedMeshes?: Array<{kind:"bridge"|"plate"|"ramp"|"stair";positions:import("./types").DerivedPositions;indices:number[]}>;
  contacts?: ReconstructedContact[];
  undersideJoins?:Array<{sourceId:string;edges:Array<[Vec3,Vec3]>;coverage:[number,number];parameter:"walking-profile-width"|"source-material-contour-arc";method:"connected exact material-boundary join"}>;
};
type Result = { valid: true; evidence: ExtensionInterface } | { valid: false; reason: string };
const caches = new WeakMap<object, Map<string, Result>>();
const indexes = new WeakMap<object, ReturnType<typeof materialSideIndex>>();

/** Vertical intersection with the complete triangle, not a voxel or nearest vertex. */
function height(points: [Vec3, Vec3, Vec3], p: Vec3): number | null {
  const [a,b,c] = points;
  const det = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if (Math.abs(det)<1e-12) return null;
  const u = ((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/det;
  const v = ((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/det;
  if (u< -1e-7 || v< -1e-7 || u+v>1+1e-7) return null;
  return a[2]*u+b[2]*v+c[2]*(1-u-v);
}

/** Geometry-only qualification. Open or disputed regions fail locally rather than
 * inventing an underside. No filename, assignment ID or source triangle is special. */
function interfaceEvidence(model: TileModel, tile: PlacedTile, point: Vec3,
  direction: Vec3, width: number, profile: [Vec3,Vec3], reverse: boolean,contour=false): Result {
  const surface = model.connectionSurface;
  if (!surface) return { valid:false, reason:"missing source material geometry" };
  const revision = geometryRevision(surface), metadata = surfaceOrientation(surface);
  let cache = caches.get(revision);
  if (!cache) { cache = new Map(); caches.set(revision,cache); }
  const key = JSON.stringify({tile,point,direction,width,profile,reverse,contour});
  const previous = cache.get(key);
  if (previous) return previous;
  const evaluate = (): Result => {
    const length = Math.hypot(direction[0],direction[1]);
    if (length<1e-6 || !Number.isFinite(width) || width<2) return {valid:false,reason:"invalid material interface dimensions"};
    let index = indexes.get(revision);
    if (!index) {
      index = materialSideIndex(metadata.triangles,metadata.triangles.map((_,i)=>i));
      indexes.set(revision,index);
    }
    const samples: number[] = [], ids = new Set<number>(),depthProfiles:number[][]=[],underside:Vec3[]=[],gradients:Array<[number,number]>=[];
    let fractions=[0,.25,.5,.75,1];
    if(contour){
      // Keep every source-facet breakpoint across the actual interface plane.
      // Uniform probes alone cannot preserve a sharp underside contour kink.
      const [a,b]=profile.map(p=>localPoint(p,tile,model)),dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,knots=[...fractions];
      const along=(p:Vec3)=>((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length,plane=(p:Vec3)=>(p[0]-a[0])*dy-(p[1]-a[1])*dx;
      for(const triangle of metadata.triangles){
        if(!(triangle.normalZ>=.7||triangle.normalZ<-.2))continue;
        for(let j=0;j<3;j++){const p=triangle.points[j],q=triangle.points[(j+1)%3],d=plane(p),e=plane(q);
          if(Math.abs(d)<1e-12){const u=along(p);if(u>0&&u<1)knots.push(u);}
          if(d*e<0){const s=d/(d-e),u=along(p)+s*(along(q)-along(p));if(u>0&&u<1)knots.push(u);}
        }
      }
      fractions=knots.sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>64*Number.EPSILON);
      if(fractions.length>SOURCE_CONTOUR_CONSTRUCTION.maximumContourBreakpoints)return {valid:false,reason:`source contour has ${fractions.length} breakpoints; bounded contour construction UNVERIFIED (none silently omitted)`};
    }
    for (const t of fractions) {
      const edge = profile[0].map((v,k)=>v+(profile[1][k]-v)*t) as Vec3;
      const depths: number[] = [];
      for (const d of contour?[0,.1,.4,.8]:[.1,.4,.8]) {
        const p = localPoint([edge[0]-direction[0]/length*d,edge[1]-direction[1]/length*d,edge[2]],tile,model);
        const hits: Array<{z:number;id:number;normal:number}> = [];
        for (let i=0;i<metadata.triangles.length;i++) {
          const triangle = metadata.triangles[i], z = height(triangle.points,p);
          if (z!==null) hits.push({z,id:i,normal:triangle.normalZ});
        }
        const top = hits.filter(h=>h.normal>=.7 && Math.abs(h.z-p[2])<=.08)
          .sort((a,b)=>Math.abs(a.z-p[2])-Math.abs(b.z-p[2]))[0];
        if (!top) return {valid:false,reason:"source upper surface not established across full interface"};
        const below = hits.filter(h=>h.z<top.z-1e-5).sort((a,b)=>b.z-a.z)[0];
        if (!below || !(below.normal<-.2)) return {valid:false,reason:"source underside missing or ambiguous"};
        const thickness = top.z-below.z;
        if (!(thickness>1e-4) || !Number.isFinite(thickness)) return {valid:false,reason:"invalid source thickness"};
        // The exact boundary lies on a cap, not inside its material interval.
        // Interior probes still require winding evidence; the boundary is
        // separately proved by actual upper/underside facets and native caps.
        if(d>0){const material = index.query([p[0],p[1],(top.z+below.z)/2]);
          if (material.exhausted || Math.abs(material.value)-material.error<.9)return {valid:false,reason:"local material interval UNVERIFIED"};}
        if(contour&&d===0){
          underside.push(worldFromLocal([p[0],p[1],below.z],tile,model));
          const [a,b,c]=metadata.triangles[below.id].points.map(q=>worldFromLocal(q,tile,model)),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),nz=u[0]*v[1]-u[1]*v[0];
          gradients.push([-(u[1]*v[2]-u[2]*v[1])/nz,-(u[2]*v[0]-u[0]*v[2])/nz]);
        }
        depths.push(thickness); ids.add(top.id); ids.add(below.id);
      }
      // Do not extrapolate a rapidly changing or discontinuous underside as a ribbon.
      if (!contour&&Math.max(...depths)-Math.min(...depths)>.1)
        return {valid:false,reason:`source underside requires curved reconstruction: thicknesses ${depths.join(",")} ft; depth variation ${Math.max(...depths)-Math.min(...depths)} ft exceeds linear-ribbon limit 0.1 ft`};
      samples.push(depths[0]);
      depthProfiles.push(depths);
    }
    const ends: [number,number] = [samples[0],samples.at(-1)!];
    if (!contour&&samples.some((v,i)=>Math.abs(v-(ends[0]+(ends[1]-ends[0])*i/4))>.05))
      return {valid:false,reason:"nonlinear source cross-section requires reconstruction"};
    return {valid:true,evidence:{sourceId:tile.id,revision:revision.id,triangles:[...ids],
      thickness:reverse?[ends[1],ends[0]]:ends,interiorDepth:.8,
      contour:contour?{fractions,thickness:samples,underside,gradients,depthProfiles,depthVariation:Math.max(...depthProfiles.map(p=>Math.max(...p)-Math.min(...p)))}:undefined}};
  };
  const result = evaluate();
  if (cache.size>=512) cache.clear();
  cache.set(key,result);
  return result;
}

/** Called after Stage 1 resolves the actual upper edge. Adds metadata only;
 * transitionMeshes uses it for every validation, rendering and export operation. */
export function resolveSourceResponsiveExtension(pair: PortPair, models: TileModel[], tiles: PlacedTile[]) {
  const results: ExtensionInterface[] = [];
  const sections = transitionSections(pair);
  for (const side of ["start","end"] as const) {
    const id = side==="start"?pair.tileA:pair.tileB;
    const model = models.find(m=>m.id===id || m.id===id.split("::")[0]);
    const tile = tiles.find(t=>t.id===id);
    const point = side==="start"?pair.from:pair.to;
    const direction = side==="start"?pair.startDirection:pair.endDirection;
    const section=side==="start"?sections[0]:sections.at(-1);
    const width = (side==="start"?pair.startWidth:pair.endWidth)??pair.usableWidth;
    if (!model || !tile || !direction || !section) return {valid:false as const,reason:"missing source-responsive interface"};
    const profile = [-1,1].map(sign=>section.center.map((v,k)=>v+section.side[k]*section.width*.5*sign) as Vec3) as [Vec3,Vec3];
    const result = interfaceEvidence(model,tile,point,direction,width,profile,false,!!pair.featureConnection);
    if (!result.valid) return {valid:false as const,reason:`${side}: ${result.reason}`};
    results.push(result.evidence);
  }
  pair.extension = {start:results[0],end:results[1],coordinates:"architectural-feet-z-up",
    method:"measured-source-material-ribbon",structuralCapacity:"UNVERIFIED",contourConstruction:pair.featureConnection?{...SOURCE_CONTOUR_CONSTRUCTION}:undefined};
  const reconstruction=reconstructExtension(pair,models,tiles);
  if(reconstruction.status==="PASS"){
    pair.extension.reconstruction={status:"PASS",removedVolume:reconstruction.removedVolume,walkingCoverage:"VERIFIED"};
    pair.extension.reconstructedMeshes=reconstruction.meshes;
    pair.extension.contacts=reconstruction.contacts;
    pair.extension.undersideJoins=reconstruction.undersideJoins;
    if(reconstruction.materialBoundaries?.[0]&&pair.extension.start.contour)pair.extension.start.contour.materialBoundary=reconstruction.materialBoundaries[0];
    if(reconstruction.materialBoundaries?.[1]&&pair.extension.end.contour)pair.extension.end.contour.materialBoundary=reconstruction.materialBoundaries[1];
  }else {
    pair.extension.reconstruction=reconstruction;
    return {valid:false as const,reason:`reconstruction UNVERIFIED: ${reconstruction.reason}`,witness:reconstruction.witness,evidence:pair.extension};
  }
  return {valid:true as const,evidence:pair.extension};
}

export function requiresSourceResponsiveExtension(pair: PortPair, models: TileModel[]) {
  return models.some(m=>m.sourceResponsiveExtensions &&
    [pair.tileA,pair.tileB].some(id=>id===m.id || id.split("::")[0]===m.id));
}
