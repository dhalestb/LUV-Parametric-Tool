import { geometryRevision } from "./geometryRevision";
import { materialSideIndex, type MaterialInterval } from "./materialSideEvidence";
import type { Vec3 } from "./types";

export type SourceSurface = { positions: Float32Array; triangles: number[] };
export type OrientedTriangle = { points: [Vec3, Vec3, Vec3]; rawNormal: Vec3; normalZ: number; area: number; component: number; region: number; localMaterial?: { accepted: boolean; reason: string; samples: MaterialInterval[] } };
export type OrientationComponent = { triangles: number[]; boundaryEdges: number; inconsistentEdges: number; volume: number; sign: number; witnesses: number; uncertainty: string | null };
const cache = new WeakMap<object, ReturnType<typeof build>>();
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const key = (p: Vec3) => p.map(v=>v.toFixed(5)).join(",");

/** Analysis metadata only. Never changes source positions, normals, or triangle order. */
export function surfaceOrientation(surface: SourceSurface) {
  const revision = geometryRevision(surface);
  let value = cache.get(revision);
  if (!value) { value = build(surface); cache.set(revision,value); }
  return value;
}

/** Enclosure guard for a free-space volume that might lie wholly inside another solid. */
export function sourceMaterialAtPoint(surface: SourceSurface,p: Vec3) {
  const metadata=surfaceOrientation(surface);
  let material=false,uncertain=false;
  for(const component of metadata.components) {
    let sum=0;
    for(const i of component.triangles) {
      const [a,b,c]=metadata.triangles[i].points.map(v=>sub(v,p));
      const la=Math.hypot(...a),lb=Math.hypot(...b),lc=Math.hypot(...c);
      sum+=2*Math.atan2(dot(a,cross(b,c)),la*lb*lc+dot(a,b)*lc+dot(b,c)*la+dot(c,a)*lb);
    }
    const occupancy=Math.abs(sum/(4*Math.PI));
    if(occupancy>.9)material=true;
    else if(occupancy>.1)uncertain=true;
  }
  return {material,uncertain};
}

function build(surface: SourceSurface) {
  const started = performance.now();
  const triangles: OrientedTriangle[] = [];
  const edges = new Map<string, Array<{ triangle: number; direction: boolean }>>();
  const parents: number[] = [];
  const find = (i: number): number => parents[i]===i ? i : (parents[i]=find(parents[i]));
  for (let i=0;i<surface.triangles.length;i+=3) {
    const points = surface.triangles.slice(i,i+3).map(v=>Array.from(surface.positions.slice(v*3,v*3+3)) as Vec3) as [Vec3,Vec3,Vec3];
    const n = cross(sub(points[1],points[0]),sub(points[2],points[0])), length = Math.hypot(...n), index=triangles.length;
    parents.push(index);
    triangles.push({points,rawNormal:n.map(v=>length?v/length:0) as Vec3,normalZ:NaN,area:length/2,component:-1,region:-1});
    for(let j=0;j<3;j++) {
      const a=key(points[j]),b=key(points[(j+1)%3]),id=[a,b].sort().join("|");
      const refs=edges.get(id)??[];
      if(refs.length) parents[find(index)]=find(refs[0].triangle);
      refs.push({triangle:index,direction:a<b});edges.set(id,refs);
    }
  }
  const components: OrientationComponent[] = [], roots=new Map<number,number>();
  triangles.forEach((t,i)=>{
    const root=find(i);
    if(!roots.has(root)) {roots.set(root,components.length);components.push({triangles:[],boundaryEdges:0,inconsistentEdges:0,volume:0,sign:0,witnesses:0,uncertainty:null});}
    t.component=roots.get(root)!;const c=components[t.component];c.triangles.push(i);
    c.volume+=dot(t.points[0],cross(t.points[1],t.points[2]))/6;
  });
  for(const refs of edges.values()) {
    const c=components[triangles[refs[0].triangle].component];
    if(refs.length===1)c.boundaryEdges++;
    else if(refs.length!==2 || refs[0].direction===refs[1].direction)c.inconsistentEdges++;
  }
  const boxes=components.map(c=>{
    const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
    for(const i of c.triangles)for(const p of triangles[i].points)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
    return {min,max};
  });
  // Bounded component witnesses, not an all-pairs operation on every triangle or placement.
  const winding = (p: Vec3, c: OrientationComponent) => {
    let sum=0;
    for(const i of c.triangles) {
      const [a,b,d]=triangles[i].points;
      const ax=a[0]-p[0],ay=a[1]-p[1],az=a[2]-p[2],bx=b[0]-p[0],by=b[1]-p[1],bz=b[2]-p[2],dx=d[0]-p[0],dy=d[1]-p[1],dz=d[2]-p[2];
      const la=Math.hypot(ax,ay,az),lb=Math.hypot(bx,by,bz),ld=Math.hypot(dx,dy,dz);
      sum+=2*Math.atan2(ax*(by*dz-bz*dy)+ay*(bz*dx-bx*dz)+az*(bx*dy-by*dx),la*lb*ld+(ax*bx+ay*by+az*bz)*ld+(bx*dx+by*dy+bz*dz)*la+(dx*ax+dy*ay+dz*az)*lb);
    }
    return sum/(4*Math.PI);
  };
  for(const c of components) {
    const box=boxes[components.indexOf(c)];
    // An enclosed shell could describe a cavity rather than another solid. Without
    // boolean/material semantics, do not silently flip its cavity-facing normals.
    if(boxes.some(other=>other!==box&&box.min.every((v,k)=>v>=other.min[k]&&box.max[k]<=other.max[k]))) {
      c.uncertainty="nested or coincident component: material semantics unresolved";continue;
    }
    if(Math.abs(c.volume)<1e-6) {c.uncertainty="non-solid component";continue;}
    const sign=Math.sign(c.volume),sectors=new Map<string,number>();
    // Different elevations, positions and face directions must agree about the material side.
    for(const i of c.triangles) {
      const t=triangles[i],p=t.points[0],n=t.rawNormal;
      const sector=[...p.map(v=>Math.floor(v/4)),...n.map(v=>Math.round(v))].join(",");
      const old=sectors.get(sector);if(old===undefined || triangles[old].area<t.area)sectors.set(sector,i);
    }
    const witnesses=[...sectors.values()].sort((a,b)=>triangles[b].area-triangles[a].area).slice(0,12);
    let conflict=false;
    for(const i of witnesses) {
      const t=triangles[i],p=t.points[0].map((_,k)=>(t.points[0][k]+t.points[1][k]+t.points[2][k])/3) as Vec3;
      const offset=Math.min(.05,Math.sqrt(t.area)*.1);
      const inside=winding(p.map((v,k)=>v-sign*t.rawNormal[k]*offset) as Vec3,c);
      const outside=winding(p.map((v,k)=>v+sign*t.rawNormal[k]*offset) as Vec3,c);
      if(Math.abs(inside-sign)<.1 && Math.abs(outside)<.1)c.witnesses++;
      else if(Math.abs(outside-sign)<.1 && Math.abs(inside)<.1) conflict=true;
    }
    if(conflict || c.witnesses<Math.min(4,witnesses.length) || !c.witnesses) {c.uncertainty="material-side witnesses ambiguous";continue;}
    c.sign=sign;
    if(c.boundaryEdges||c.inconsistentEdges)c.uncertainty="imperfect component: balanced columns or bounded local material evidence required";
  }
  // Spatial columns independently check below-material / above-free ordering on open shells.
  const spanX=boxes.reduce((v,b)=>Math.max(v,b.max[0]-b.min[0]),0),spanY=boxes.reduce((v,b)=>Math.max(v,b.max[1]-b.min[1]),0);
  const columns=new Map<string,number[]>(),cell=Math.max(.75,spanX/64,spanY/64);
  triangles.forEach((t,i)=>{
    if(Math.abs(t.rawNormal[2])<1e-8)return;
    const xs=t.points.map(p=>p[0]),ys=t.points.map(p=>p[1]);
    for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)
      for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++) {
        const k=`${x},${y}`,bucket=columns.get(k)??[];bucket.push(i);columns.set(k,bucket);
      }
  });
  for(const t of triangles) {
    const component=components[t.component],nz=t.rawNormal[2]*component.sign;
    if(!component.sign)continue;
    t.normalZ=nz;
    if((!component.boundaryEdges&&!component.inconsistentEdges) || Math.abs(nz)<.65)continue;
    const p=t.points[0].map((_,k)=>(t.points[0][k]+t.points[1][k]+t.points[2][k])/3) as Vec3;
    const hits: Array<{z:number;sign:number}>=[];
    for(const i of columns.get(`${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`)??[]) {
      const other=triangles[i];if(other.component!==t.component)continue;
      const [a,b,c]=other.points,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(d)<1e-12)continue;
      const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/d;
      const v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/d;
      if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)hits.push({z:u*a[2]+v*b[2]+(1-u-v)*c[2],sign:Math.sign(other.rawNormal[2]*component.sign)});
    }
    hits.sort((a,b)=>a.z-b.z);
    let previous:typeof hits[number]|undefined,balanced=true,above=0,at=0;
    for(const hit of hits) {
      if(previous && Math.abs(hit.z-previous.z)<1e-6) {if(hit.sign!==previous.sign)balanced=false;continue;}
      if(hit.z>p[2]+1e-6)above+=hit.sign;
      else if(Math.abs(hit.z-p[2])<=1e-6)at+=hit.sign;
      previous=hit;
    }
    // Vertical winding from the unbounded free space: exactly one material side.
    // A defect below this interface cannot turn a verified top into an underside.
    const below=above+at;
    if(!balanced || (nz>0 ? above!==0||below!==1 : above!==1||below!==0))t.normalZ=NaN;
  }
  // A defective distant column crossing is not sufficient evidence against a
  // local top. Only disputed upward faces receive this bounded fallback; accepted
  // faces, walls, undersides, and components without material semantics are kept.
  const localStarted = performance.now(), materialIndexes = new Map<number, ReturnType<typeof materialSideIndex>>();
  const barycentric = [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]];
  for (const t of triangles) {
    const component = components[t.component], nz = t.rawNormal[2] * component.sign;
    if (Number.isFinite(t.normalZ) || nz < .65 || !component.sign) continue;
    let index = materialIndexes.get(t.component);
    if (!index) { index = materialSideIndex(triangles, component.triangles); materialIndexes.set(t.component, index); }
    const evidence = { accepted: true, reason: "bounded material below / free space above at four local witnesses and two offsets", samples: [] as MaterialInterval[] };
    const witnesses: Array<{point: Vec3; expected: number}> = [];
    for (const weights of barycentric) {
      const p = t.points[0].map((_, k) => weights.reduce((sum, w, j) => sum + w * t.points[j][k], 0)) as Vec3;
      for (const offset of [.005, .02]) for (const side of [-1, 1]) {
        witnesses.push({ point: p.map((v,k) => v + side * component.sign * t.rawNormal[k] * offset) as Vec3, expected: side < 0 ? component.sign : 0 });
      }
    }
    const query = index.prepare(witnesses.map(w => w.point));
    for (const {point,expected} of witnesses) {
      const sample = query(point);
      evidence.samples.push(sample);
      if (sample.exhausted || !Number.isFinite(sample.value) || !Number.isFinite(sample.error) || Math.abs(sample.value - expected) + sample.error >= .1) {
        evidence.accepted = false;
        evidence.reason = sample.exhausted ? "bounded material query exhausted" : "contradictory or uncertain local material side";
        break;
      }
    }
    t.localMaterial = evidence;
    if (evidence.accepted) t.normalZ = nz;
  }
  const localMaterial = { buildMs: performance.now() - localStarted, components: [...materialIndexes].map(([component, index]) => ({ component, ...index.stats })) };
  // Edge-connected support patches are not automatically a navigable internal network.
  triangles.forEach((_,i)=>parents[i]=i);
  for(const refs of edges.values())if(refs.length===2 && refs.every(r=>triangles[r.triangle].normalZ>=.65))parents[find(refs[0].triangle)]=find(refs[1].triangle);
  const regions=new Map<number,number>();
  triangles.forEach((t,i)=>{if(t.normalZ>=.65){const root=find(i);if(!regions.has(root))regions.set(root,regions.size);t.region=regions.get(root)!;}});
  return {triangles,components,regionCount:regions.size,localMaterial,buildMs:performance.now()-started};
}
