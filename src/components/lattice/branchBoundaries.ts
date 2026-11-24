import { architecturalSurfaces } from "./architecturalSurfaces";
import { geometryRevision } from "./geometryRevision";
import { surfaceOrientation } from "./surfaceOrientation";
import type { TileModel, Vec3 } from "./types";

export type BranchBoundary={point:Vec3;outward:Vec3;region:number;edgeSpan:number;triangle:number;interpretation:"branch boundary hypothesis; walking UNVERIFIED"};
const cache=new WeakMap<object,BranchBoundary[]>();
/** Exact-coordinate upper-region boundaries. This separate analysis never
 * changes mesh indices or coordinates and never certifies material/clearance.
 * Narrow branches are recognized without requiring a 2-foot walking opening.
 * A terminal hypothesis must follow the measured major axis, not a fabricated
 * pair of opposite directions on an interior cross-section. */
export function branchBoundaries(model:TileModel):BranchBoundary[]{
  if(!model.connectionSurface)return [];
  const revision=geometryRevision(model.connectionSurface),old=cache.get(revision);if(old)return old;
  const metadata=surfaceOrientation(model.connectionSurface),regions=architecturalSurfaces(model).filter(r=>r.role==="projecting branch");
  const branches=new Map(regions.map(r=>[r.region,r]));
  const edges=new Map<string,{a:Vec3;b:Vec3;triangle:number;region:number;count:number}>();
  for(let id=0;id<metadata.triangles.length;id++){
    const tri=metadata.triangles[id];if(tri.normalZ<.65)continue;
    for(let k=0;k<3;k++){
      const a=tri.points[k],b=tri.points[(k+1)%3],key=[a.join(','),b.join(',')].sort().join('|'),old=edges.get(key);
      if(old)old.count++;else edges.set(key,{a,b,triangle:id,region:tri.region,count:1});
    }
  }
  const result:BranchBoundary[]=[];
  for(const edge of edges.values()){
    const branch=branches.get(edge.region);if(edge.count!==1||!branch)continue;
    const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],width=Math.hypot(dx,dy);if(width<1e-6)continue;
    const point=edge.a.map((v,k)=>(v+edge.b[k])/2) as Vec3,tri=metadata.triangles[edge.triangle];
    const center=tri.points[0].map((_,k)=>tri.points.reduce((s,p)=>s+p[k],0)/3) as Vec3;
    let outward:Vec3=[-dy/width,dx/width,0];
    if((center[0]-point[0])*outward[0]+(center[1]-point[1])*outward[1]>0)outward=outward.map(v=>-v) as Vec3;
    if(Math.abs(outward[0]*branch.majorDirection[0]+outward[1]*branch.majorDirection[1])<.65)continue;
    result.push({point,outward,region:edge.region,edgeSpan:width,triangle:edge.triangle,interpretation:"branch boundary hypothesis; walking UNVERIFIED"});
  }
  result.sort((a,b)=>a.point[2]-b.point[2]||b.edgeSpan-a.edgeSpan||a.triangle-b.triangle);
  cache.set(revision,result);return result;
}
