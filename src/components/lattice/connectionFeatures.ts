import { geometryRevision } from "./geometryRevision";
import { surfaceOrientation } from "./surfaceOrientation";
import { architecturalSurfaces } from "./architecturalSurfaces";
import { extensionGeometryKernel } from "./extensionReconstruction";
import { worldFromLocal, enumerateWalkableAttachments } from "./surfaceAttachment";
import type { PlacedTile, TileModel, Vec3 } from "./types";

export type ConnectionFeatureKind="branch"|"corner"|"edge"|"other";
export type ConnectionFeaturePolicy={branch:boolean;corner:boolean;edge:boolean;other:boolean};
export const DEFAULT_CONNECTION_FEATURE_POLICY:ConnectionFeaturePolicy={branch:true,corner:true,edge:true,other:false};
export type ConnectionFeature={id:string;kind:ConnectionFeatureKind;region:number;point:Vec3;outward:Vec3;
  sourceFeatureId?:string;
  approachDirections?:Vec3[];
  run:[Vec3,Vec3];width:number;elevation:number;triangles:number[];
  envelope:{depth:number;halfWidth:number;maximumDisplacement:number};
  walking:"UNVERIFIED";classification:string};
type Edge={a:Vec3;b:Vec3;triangle:number;region:number;count:number};
const cache=new WeakMap<object,{features:ConnectionFeature[];excluded:Record<string,number>}>();
const windowCache=new WeakMap<object,ConnectionFeature[]>();
const key=(p:Vec3)=>p.map(v=>v.toFixed(5)).join(",");
const delta=(a:Vec3,b:Vec3)=>a.map((v,k)=>v-b[k]) as Vec3;
const mid=(a:Vec3,b:Vec3)=>a.map((v,k)=>(v+b[k])/2) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1];
const unit=(v:Vec3)=>{const n=Math.hypot(v[0],v[1]);return [v[0]/n,v[1]/n,0] as Vec3;};

/** Connected upper-material boundaries, never each triangle's edges. Source
 * classifications are cached by content revision; instance transforms are fresh.
 * Semantic features are proposals, not certificates of walking or support. */
export function connectionFeatures(model:TileModel){
  if(!model.connectionSurface)return {features:[],excluded:{missingGeometry:1}};
  const revision=geometryRevision(model.connectionSurface),old=cache.get(revision);if(old)return old;
  const metadata=surfaceOrientation(model.connectionSurface),edges=new Map<string,Edge>();
  const excluded:Record<string,number>={undersideOrWall:0,ambiguous:0,internalTriangulation:0,shortBoundary:0};
  const regions=new Map(architecturalSurfaces(model).map(r=>[r.region,r]));
  // Polygon union and near-collinear run grouping operate in plan. Their
  // endpoint-averaged Z is not a surface sample on a cambered or beveled rim.
  // Resolve every semantic attachment on its actual connected upper region.
  const onRegion=(region:number,xy:Vec3)=>{
    for(const id of regions.get(region)?.triangles??[]){
      const [a,b,c]=metadata.triangles[id].points,ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;
      if(Math.abs(det)<1e-12)continue;
      const u=((xy[0]-a[0])*vy-(xy[1]-a[1])*vx)/det,v=(ux*(xy[1]-a[1])-uy*(xy[0]-a[0]))/det;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return [xy[0],xy[1],a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])] as Vec3;
    }
    return undefined;
  };
  for(let i=0;i<metadata.triangles.length;i++){
    const t=metadata.triangles[i];
    if(!Number.isFinite(t.normalZ)){excluded.ambiguous++;continue;}
    if(t.normalZ<.65){excluded.undersideOrWall++;continue;}
    for(let j=0;j<3;j++){
      const a=t.points[j],b=t.points[(j+1)%3],id=[key(a),key(b)].sort().join("|");
      const prior=edges.get(id);if(prior)prior.count++;else edges.set(id,{a,b,triangle:i,region:t.region,count:1});
    }
  }
  // Reconstruct each connected upper footprint from polygon union. This removes
  // T-junction/seam diagonals without welding or changing any source vertices.
  // Different floor regions stay separate; holes remain holes.
  const kernel=extensionGeometryKernel(),boundary:Edge[]=[];
  for(const region of regions.values()){
    if(region.area<4)continue;
    const pieces=region.triangles.map(id=>{let p=metadata.triangles[id].points.map(q=>[q[0],q[1]] as [number,number]);const a=p[0],b=p[1],c=p[2];if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0)p=p.reverse();return new kernel.CrossSection([p]);});
    const union=kernel.CrossSection.union(pieces);
    try{
      for(const loop of union.toPolygons())for(let i=0;i<loop.length;i++){
        const resolve=(xy:number[])=>{for(const id of region.triangles){const t=metadata.triangles[id],[a,b,c]=t.points,ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-12)continue;const u=((xy[0]-a[0])*vy-(xy[1]-a[1])*vx)/det,v=(ux*(xy[1]-a[1])-uy*(xy[0]-a[0]))/det;if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return {point:[xy[0],xy[1],a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])] as Vec3,id};}return undefined;};
        const a=resolve(loop[i]),b=resolve(loop[(i+1)%loop.length]);if(a&&b)boundary.push({a:a.point,b:b.point,region:region.region,triangle:a.id,count:1});
      }
    }finally{union.delete();pieces.forEach(p=>p.delete());}
  }
  excluded.internalTriangulation=[...edges.values()].filter(e=>e.count>1).length;
  // Merge connected collinear pieces before choosing attachment regions.
  const incidence=new Map<string,number[]>();boundary.forEach((e,i)=>{for(const p of [e.a,e.b]){const k=key(p),list=incidence.get(k)??[];list.push(i);incidence.set(k,list);}});
  const visited=new Set<number>(),runs:Array<{a:Vec3;b:Vec3;point:Vec3;region:number;triangles:number[];outward:Vec3}>=[];
  for(let seed=0;seed<boundary.length;seed++){
    if(visited.has(seed))continue;visited.add(seed);const e=boundary[seed],direction=unit(delta(e.b,e.a));
    if(!Number.isFinite(direction[0]))continue;
    let a=e.a,b=e.b;const triangles=[e.triangle];
    for(const end of [0,1]){let more=true;while(more){more=false;const p=end===0?a:b;
      for(const index of incidence.get(key(p))??[]){const next=boundary[index];if(visited.has(index)||next.region!==e.region)continue;
        const q=key(next.a)===key(p)?next.b:next.a,v=unit(delta(q,p));
        if(Math.abs(dot(v,direction))<.995||Math.abs(q[2]-p[2])>.2*Math.hypot(q[0]-p[0],q[1]-p[1]))continue;
        visited.add(index);triangles.push(next.triangle);if(end===0)a=q;else b=q;more=true;break;
      }
    }}
    const width=Math.hypot(b[0]-a[0],b[1]-a[1]);if(width<.5){excluded.shortBoundary++;continue;}
    // A near-collinear chord may also leave a curved footprint. Fall back to
    // the measured seed boundary, never an interpolated point outside material.
    const p=onRegion(e.region,mid(a,b))??onRegion(e.region,mid(e.a,e.b));
    if(!p){excluded.unresolvedBoundary=(excluded.unresolvedBoundary??0)+1;continue;}
    const t=metadata.triangles[e.triangle],center=t.points.reduce((s,q)=>s.map((v,k)=>v+q[k]/3) as Vec3,[0,0,0] as Vec3);
    let outward:Vec3=[-(b[1]-a[1])/width,(b[0]-a[0])/width,0];
    if(dot(delta(center,p),outward)>0)outward=outward.map(v=>-v) as Vec3;
    runs.push({a,b,point:p,region:e.region,triangles,outward});
  }
  const features:ConnectionFeature[]=[];
  for(const [i,r]of runs.entries()){
    const region=regions.get(r.region),point=r.point,width=Math.hypot(r.b[0]-r.a[0],r.b[1]-r.a[1]);
    if(!region||region.area<4){excluded.noUsableRegion=(excluded.noUsableRegion??0)+1;continue;}
    // Whole-region elongated branches remain recognized. Local projections on
    // broad plates need a narrow terminal followed by a wider material root.
    const inwardSpan=(depth:number)=>{
      const p=point.map((v,k)=>v-r.outward[k]*depth) as Vec3,side:Vec3=[-r.outward[1],r.outward[0],0],intervals:Array<[number,number]>=[];
      for(const id of region?.triangles??[]){const tri=metadata.triangles[id];if(tri.points.every(q=>Math.abs(q[2]-p[2])>1.5))continue;
        const d=tri.points.map(q=>dot(delta(q,p),r.outward)),hits:number[]=[];
        for(let j=0;j<3;j++){const k=(j+1)%3;if(Math.abs(d[j])<1e-7)hits.push(dot(delta(tri.points[j],p),side));if(d[j]*d[k]<0){const u=d[j]/(d[j]-d[k]),q=tri.points[j].map((v,n)=>v+u*(tri.points[k][n]-v)) as Vec3;hits.push(dot(delta(q,p),side));}}
        if(hits.length>=2)intervals.push([Math.min(...hits),Math.max(...hits)]);
      }
      intervals.sort((a,b)=>a[0]-b[0]);let lo=Infinity,hi=-Infinity;
      for(const [a,b]of intervals){if(a>hi+1e-5){if(lo<=0&&hi>=0)return hi-lo;lo=a;hi=b;}else hi=Math.max(hi,b);}return lo<=0&&hi>=0?hi-lo:0;
    };
    const near=inwardSpan(2),root=inwardSpan(5),projection=near>=.5&&near<=6&&root>=near*1.4;
    const branch=region?.role==="projecting branch"||projection;
    // Narrow projections remain hypotheses for reconstruction. Semantic
    // recognition never certifies their original or reconstructed walking width.
    if(width<2&&!branch){excluded.noUsableRegion=(excluded.noUsableRegion??0)+1;continue;}
    features.push({id:`${branch?"branch":"edge"}-${i}`,kind:branch?"branch":"edge",region:r.region,point,outward:r.outward,run:[r.a,r.b],width,elevation:point[2],triangles:r.triangles,
      envelope:{depth:6,halfWidth:Math.min(width/2+1,4),maximumDisplacement:1.5},walking:"UNVERIFIED",
      classification:branch?`upper-material projection; near/root section widths ${near}/${root}`:`exposed upper-material perimeter; local projection test ${near}/${root}`});
  }
  // Corners join two true perimeter runs, never an internal mesh diagonal.
  for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
    const a=runs[i],b=runs[j];if(a.region!==b.region||(regions.get(a.region)?.area??0)<4||Math.hypot(...delta(a.b,a.a))<2||Math.hypot(...delta(b.b,b.a))<2||dot(a.outward,b.outward)>.85||dot(a.outward,b.outward)<-.2)continue;
    const shared=[a.a,a.b].find(p=>[b.a,b.b].some(q=>key(p)===key(q)));if(!shared)continue;
    const outward=unit(a.outward.map((v,k)=>v+b.outward[k]) as Vec3);
    const approachDirections=[a,b].map(r=>unit(delta(key(r.a)===key(shared)?r.b:r.a,shared)));
    features.push({id:`corner-${i}-${j}`,kind:"corner",region:a.region,point:shared,outward,approachDirections,run:[a.a,b.b],width:Math.min(Math.hypot(...delta(a.b,a.a)),Math.hypot(...delta(b.b,b.a))),elevation:shared[2],triangles:[...new Set([...a.triangles,...b.triangles])],envelope:{depth:6,halfWidth:3,maximumDisplacement:1.5},walking:"UNVERIFIED",classification:"intersection of two exterior upper-material boundary runs"});
  }
  features.sort((a,b)=>["branch","corner","edge","other"].indexOf(a.kind)-["branch","corner","edge","other"].indexOf(b.kind)||b.width-a.width||a.id.localeCompare(b.id));
  const result={features,excluded};cache.set(revision,result);return result;
}
export function placedConnectionFeatures(model:TileModel,tile:PlacedTile,policy:ConnectionFeaturePolicy=DEFAULT_CONNECTION_FEATURE_POLICY){
  const revision=geometryRevision(model.connectionSurface!);let windows=windowCache.get(revision);
  if(!windows){
    const features=connectionFeatures(model).features,identity=model.variants.findIndex(v=>v.rotation===0&&v.mirror==="none"),root={id:model.id,ix:0,iy:0,iz:0,variant:identity};
    if(identity<0)throw new Error("Canonical source transform unavailable");
    const raw=enumerateWalkableAttachments(model,root,256).anchors,seen=new Set<string>();windows=[];
    // Existing surface windows are cheap geometric proposals. Restrict them to
    // the already classified true perimeter BEFORE any walking or route tests.
    // No internal triangle or unrelated source surface enters the route pool.
    for(const feature of features){
      if(feature.kind==="corner"){
        const metadata=surfaceOrientation(model.connectionSurface!);
        for(const inset of [1.2,1.8]){
          const p=feature.point.map((v,k)=>v-feature.outward[k]*inset) as Vec3;
          for(const t of metadata.triangles){
            if(t.region!==feature.region||t.normalZ<.65)continue;
            const [a,b,c]=t.points,dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-a[0],ey=c[1]-a[1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-12)continue;
            const u=((p[0]-a[0])*ey-(p[1]-a[1])*ex)/det,v=(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/det;
            if(u<0||v<0||u+v>1)continue;p[2]=a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
            const side:Vec3=[-feature.outward[1],feature.outward[0],0];
            windows.push({...feature,id:feature.id+'@interior-'+inset,sourceFeatureId:feature.id,point:p,elevation:p[2],run:[p.map((v,k)=>v-side[k]*1.05) as Vec3,p.map((v,k)=>v+side[k]*1.05) as Vec3],width:2.1});break;
          }
        }
        continue;
      }
      const matches=raw.filter(a=>{
        if(dot(a.outward,feature.outward)<.7)return false;
        const d=delta(feature.run[1],feature.run[0]),q=delta(a.point,feature.run[0]),length=d.reduce((s,v)=>s+v*v,0),u=Math.max(0,Math.min(1,d.reduce((s,v,k)=>s+v*q[k],0)/(length||1)));
        return Math.hypot(...a.point.map((v,k)=>v-feature.run[0][k]-u*d[k]))<=.5;
      });
      for(const anchor of matches){const key=JSON.stringify([anchor.run,anchor.outward]);if(seen.has(key))continue;seen.add(key);
        windows.push({...feature,id:feature.id+'@'+anchor.id,sourceFeatureId:feature.id,point:anchor.point,outward:anchor.outward,run:anchor.run,width:anchor.width,elevation:anchor.point[2]});}
      if(!matches.length)windows.push(feature);
    }
    // The older attachment enumerator has its own port/feature limits. A long
    // true perimeter must not be represented only by its midpoint when that
    // enumerator supplies no useful windows on an upper floor. Retain all old
    // identities first, then add bounded samples measured on the actual mesh.
    const metadata=surfaceOrientation(model.connectionSurface!);
    const measured=(p:Vec3,region:number)=>{
      for(const t of metadata.triangles){
        if(t.region!==region||t.normalZ<.65)continue;
        const [a,b,c]=t.points,ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;if(Math.abs(det)<1e-12)continue;
        const u=((p[0]-a[0])*vy-(p[1]-a[1])*vx)/det,v=(ux*(p[1]-a[1])-uy*(p[0]-a[0]))/det;
        if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)return [p[0],p[1],a[2]+u*(b[2]-a[2])+v*(c[2]-a[2])] as Vec3;
      }
      return undefined;
    };
    const signatures=new Set(windows.map(f=>JSON.stringify([f.point,f.outward,Math.min(2.1,f.width)])));let added=0,omitted=0;
    for(const feature of features){
      if(feature.kind==="corner"||feature.width<2.1)continue;
      const [a,b]=feature.run,length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<2.1)continue;
      const tangent:Vec3=[(b[0]-a[0])/length,(b[1]-a[1])/length,0],margin=1.05/length;
      for(const station of [.2,.5,.8]){
        if(added>=256){omitted++;continue;}
        const u=Math.max(margin,Math.min(1-margin,station)),point=measured(a.map((v,k)=>v+u*(b[k]-v)) as Vec3,feature.region);if(!point)continue;
        const signature=JSON.stringify([point,feature.outward,2.1]);if(signatures.has(signature))continue;
        const run=[-1,1].map(sign=>measured(point.map((v,k)=>v+sign*1.05*tangent[k]) as Vec3,feature.region));if(run.some(p=>!p))continue;
        signatures.add(signature);added++;windows.push({...feature,id:feature.id+'@measured-2.1-'+station,sourceFeatureId:feature.id,point,run:run as [Vec3,Vec3],width:2.1,elevation:point[2]});
      }
    }
    connectionFeatures(model).excluded.measuredWindowBudget=omitted;
    windowCache.set(revision,windows);
  }
  return windows.filter(f=>policy[f.kind]).map(f=>{
    const point=worldFromLocal(f.point,tile,model),tip=worldFromLocal(f.point.map((v,k)=>v+f.outward[k]) as Vec3,tile,model);
    const approachDirections=f.approachDirections?.map(d=>delta(worldFromLocal(f.point.map((v,k)=>v+d[k]) as Vec3,tile,model),point));
    return {...f,point,outward:delta(tip,point),approachDirections,run:f.run.map(p=>worldFromLocal(p,tile,model)) as [Vec3,Vec3],elevation:point[2]};
  });
}
