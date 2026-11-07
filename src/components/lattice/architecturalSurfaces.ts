import type { PlacedTile, TileModel, Vec3 } from "./types";
import { geometryRevision } from "./geometryRevision";
import { surfaceOrientation } from "./surfaceOrientation";
import { localPoint, worldFromLocal } from "./surfaceAttachment";
import { pointOnContact } from "./extensionReconstruction";

export type SurfaceRole = "projecting branch" | "floor plate" | "inclined surface" | "small surface";
export type ArchitecturalSurface = {
  region:number; role:SurfaceRole; interpretation:"geometry hypothesis";
  triangles:number[]; area:number; centroid:Vec3; min:Vec3; max:Vec3;
  majorDirection:Vec3; elongation:number; relativeElevation:number;
  maxSlope:number; shallowAreaFraction:number; walkingSuitability:"UNVERIFIED";hierarchyValue:number;
  sectionWidths:Array<{station:number;maximumContiguousSpan:number;interpretation:"geometric section, not qualified walking width"}>;
};
const cache=new WeakMap<object,ArchitecturalSurface[]>();
const interfaceCache=new WeakMap<object,Map<string,ArchitecturalSurface|null>>();
type InterfaceNode={min:Vec3;max:Vec3;ids?:number[];left?:InterfaceNode;right?:InterfaceNode};
const interfaceTrees=new WeakMap<object,InterfaceNode|null>();
function interfaceTree(metadata:ReturnType<typeof surfaceOrientation>,ids:number[]):InterfaceNode|null{
  if(!ids.length)return null;const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
  for(const id of ids)for(const p of metadata.triangles[id].points)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  if(ids.length<=16)return {min,max,ids};
  const spans=max.map((v,k)=>v-min[k]),axis=spans.indexOf(Math.max(...spans));
  ids.sort((a,b)=>metadata.triangles[a].points.reduce((s,p)=>s+p[axis],0)-metadata.triangles[b].points.reduce((s,p)=>s+p[axis],0));
  const half=Math.floor(ids.length/2);return {min,max,left:interfaceTree(metadata,ids.slice(0,half))!,right:interfaceTree(metadata,ids.slice(half))!};
}
/** Source-derived hypotheses, never a substitute for walking/clearance checks.
 * No filename, slot, source ID, or assumed stacked-plate geometry is used. */
export function architecturalSurfaces(model:TileModel):ArchitecturalSurface[] {
  if(!model.connectionSurface)return [];
  const revision=geometryRevision(model.connectionSurface),old=cache.get(revision);if(old)return old;
  const metadata=surfaceOrientation(model.connectionSurface),groups=new Map<number,number[]>();
  metadata.triangles.forEach((t,i)=>{if(t.normalZ>=.65&&t.region>=0){const ids=groups.get(t.region)??[];ids.push(i);groups.set(t.region,ids);}});
  const records:ArchitecturalSurface[]=[];
  for(const [region,ids]of groups){
    let area=0;const centroid:Vec3=[0,0,0],min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
    let maxSlope=0,shallowArea=0;
    for(const id of ids){const t=metadata.triangles[id];area+=t.area;
      for(const p of t.points)for(let k=0;k<3;k++){centroid[k]+=p[k]*t.area/3;min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
      maxSlope=Math.max(maxSlope,Math.sqrt(Math.max(0,1-t.normalZ*t.normalZ))/t.normalZ);
      if(t.normalZ>=1/Math.sqrt(1+(1/12)**2))shallowArea+=t.area;
    }
    if(!(area>0))continue;for(let k=0;k<3;k++)centroid[k]/=area;
    let xx=0,xy=0,yy=0;
    for(const id of ids){const t=metadata.triangles[id],xs=t.points.map(p=>p[0]-centroid[0]),ys=t.points.map(p=>p[1]-centroid[1]),sx=xs.reduce((s,v)=>s+v,0),sy=ys.reduce((s,v)=>s+v,0);
      // Exact area second moments, independent of triangle subdivision.
      xx+=(sx*sx+xs.reduce((s,v)=>s+v*v,0))*t.area/12;
      xy+=(sx*sy+xs.reduce((s,v,k)=>s+v*ys[k],0))*t.area/12;
      yy+=(sy*sy+ys.reduce((s,v)=>s+v*v,0))*t.area/12;
    }
    const angle=.5*Math.atan2(2*xy,xx-yy),trace=xx+yy,delta=Math.hypot(xx-yy,2*xy);
    const elongation=Math.sqrt((trace+delta)/Math.max(trace-delta,trace*1e-10));
    records.push({region,role:"small surface",interpretation:"geometry hypothesis",triangles:ids,area,centroid,min,max,
      majorDirection:[Math.cos(angle),Math.sin(angle),0],elongation,relativeElevation:0,maxSlope,shallowAreaFraction:shallowArea/area,walkingSuitability:"UNVERIFIED",hierarchyValue:0,sectionWidths:[]});
  }
  const largest=Math.max(0,...records.map(r=>r.area)),low=Math.min(...records.map(r=>r.min[2])),high=Math.max(...records.map(r=>r.max[2]));
  for(const r of records){
    r.relativeElevation=(r.centroid[2]-low)/Math.max(high-low,1e-9);
    // Tiny elongated triangle fragments are not architectural branches. Four
    // square feet is only a semantic screening scale (2 ft × 2 ft), not proof
    // of a supported walking footprint. Rounded rims cannot relabel a largely
    // shallow floor plate as a ramp; exact local slope validation is unchanged.
    const meaningful=r.area>=4,branch=meaningful&&r.elongation>=2.2&&(r.area<largest*.65||records.length===1);
    r.role=!meaningful?"small surface":branch?"projecting branch":r.shallowAreaFraction>=.7&&r.area>=largest*.15?"floor plate":"inclined surface";
    if(branch){
      const along=(p:Vec3)=>(p[0]-r.centroid[0])*r.majorDirection[0]+(p[1]-r.centroid[1])*r.majorDirection[1];
      const across=(p:Vec3)=>-(p[0]-r.centroid[0])*r.majorDirection[1]+(p[1]-r.centroid[1])*r.majorDirection[0];
      let start=Infinity,end=-Infinity;for(const id of r.triangles)for(const p of metadata.triangles[id].points){const d=along(p);start=Math.min(start,d);end=Math.max(end,d);}
      for(const fraction of [.1,.3,.5,.7,.9]){
        const station=start+(end-start)*fraction,intervals:Array<[number,number]>=[];
        for(const id of r.triangles){const t=metadata.triangles[id].points,ds=t.map(p=>along(p)-station),hits:number[]=[];
          for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(ds[i])<1e-10)hits.push(across(t[i]));if(ds[i]*ds[j]<0){const u=ds[i]/(ds[i]-ds[j]);hits.push(across(t[i])+u*(across(t[j])-across(t[i])));}}
          if(hits.length>=2)intervals.push([Math.min(...hits),Math.max(...hits)]);
        }
        intervals.sort((a,b)=>a[0]-b[0]);let lo=Infinity,hi=-Infinity,maximum=0;
        for(const [a,b]of intervals){if(a>hi+1e-10){maximum=Math.max(maximum,hi-lo);lo=a;hi=b;}else hi=Math.max(hi,b);}
        maximum=Math.max(0,maximum,hi-lo);r.sectionWidths.push({station,maximumContiguousSpan:maximum,interpretation:"geometric section, not qualified walking width"});
      }
    }
  }
  const largestFloor=Math.max(0,...records.filter(r=>r.role==="floor plate").map(r=>r.area));
  for(const r of records)if(r.role==="floor plate")r.hierarchyValue=Math.sqrt(r.area/Math.max(largestFloor,1e-9))*Math.max(0,1-r.relativeElevation);
  cache.set(revision,records);return records;
}
/** Map an actual interface point onto its original surface region. A broad
 * plate cannot acquire branch importance solely from an exterior edge normal. */
export function architecturalInterface(model:TileModel,tile:PlacedTile,point:Vec3):ArchitecturalSurface|undefined {
  if(!model.connectionSurface)return undefined;
  const revision=geometryRevision(model.connectionSurface);
  let entries=interfaceCache.get(revision);if(!entries){entries=new Map();interfaceCache.set(revision,entries);}
  const p=localPoint(point,tile,model),metadata=surfaceOrientation(model.connectionSurface);
  const key=p.join(',');if(entries.has(key))return entries.get(key)??undefined;
  const retain=(surface:ArchitecturalSurface|undefined)=>{if(entries!.size>=4096)entries!.delete(entries!.keys().next().value!);entries!.set(key,surface??null);return surface;};
  if(!interfaceTrees.has(revision))interfaceTrees.set(revision,interfaceTree(metadata,metadata.triangles.map((t,i)=>t.normalZ>=.65?i:-1).filter(i=>i>=0)));
  const ids:number[]=[],visit=(node:InterfaceNode|null)=>{if(!node||p.some((v,k)=>v<node.min[k]-1e-5||v>node.max[k]+1e-5))return;
    if(node.ids)ids.push(...node.ids);else{visit(node.left!);visit(node.right!);}};
  visit(interfaceTrees.get(revision)!);ids.sort((a,b)=>a-b);
  for(const id of ids){const t=metadata.triangles[id];
    if(t.normalZ<.65||!Number.isFinite(t.normalZ))continue;
    if([0,1,2].some(k=>p[k]<Math.min(...t.points.map(q=>q[k]))-1e-5||p[k]>Math.max(...t.points.map(q=>q[k]))+1e-5))continue;
    if(pointOnContact(p,t.points))return retain(architecturalSurfaces(model).find(r=>r.region===t.region));
  }
  return retain(undefined);
}
export function placedArchitecturalSurfaces(model:TileModel,tile:PlacedTile){
  return architecturalSurfaces(model).map(r=>({...r,sourceId:tile.id,centroid:worldFromLocal(r.centroid,tile,model),
    majorDirection:(()=>{const end=worldFromLocal(r.centroid.map((v,k)=>v+r.majorDirection[k]) as Vec3,tile,model),center=worldFromLocal(r.centroid,tile,model);return end.map((v,k)=>v-center[k]) as Vec3;})()}));
}

/** Adjustable geometric hierarchy proxy, not inferred architectural program.
 * Larger, lower floor plates receive a different hypothesis priority from
 * small or high plates. Actual walking suitability is checked independently. */
export function architecturalHierarchy(surface:ArchitecturalSurface){return surface.hierarchyValue;}
