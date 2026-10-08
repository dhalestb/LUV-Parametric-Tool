import { beginGeometryValidation, geometryRevision } from "./geometryRevision";
import { sourceMaterialAtPoint, surfaceOrientation } from "./surfaceOrientation";
import { localPoint, worldFromLocal } from "./surfaceAttachment";
import type { ConnectorSurface } from "./connectionClearance";
import type { PlacedTile, TileModel, Vec3 } from "./types";

type Face = { points: Vec3[]; normalZ: number; region: number; id: string; min: Vec3; max: Vec3 };
const transformed = new WeakMap<object, Map<string, Face[]>>();
const approaches = new WeakMap<object, Map<string, ReturnType<typeof checkApproach>>>();
const bounds = (points: Vec3[]) => ({min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))) as Vec3,max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))) as Vec3});
function placedFaces(model: TileModel,tile: PlacedTile) {
  const surface=model.connectionSurface!;
  const revision=geometryRevision(surface),key=JSON.stringify([tile,model.variants[tile.variant]?.rotation,model.variants[tile.variant]?.mirror]);
  let entries=transformed.get(revision);if(!entries){entries=new Map();transformed.set(revision,entries);}
  let faces=entries.get(key);
  if(!faces){faces=surfaceOrientation(surface).triangles.map(t=>{const points=t.points.map(p=>worldFromLocal(p,tile,model));return {points,...bounds(points),normalZ:t.normalZ,region:t.region,id:tile.id};});if(entries.size>=16)entries.delete(entries.keys().next().value!);entries.set(key,faces);}
  return faces;
}
/** Clip a 3-D polygon against a linear half-space, preserving exact interpolated height. */
function clip(poly: Vec3[],distance: (p: Vec3)=>number) {
  const out: Vec3[]=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a),db=distance(b),ina=da>=-1e-9,inb=db>=-1e-9;
    if(ina)out.push(a);
    if(ina!==inb){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t) as Vec3);}
  }
  return out;
}
const signedArea=(p:Vec3[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
function within(poly: Vec3[],boundary: Vec3[]) {
  const sign=Math.sign(signedArea(boundary));
  for(let i=0;i<boundary.length && poly.length;i++) {
    const a=boundary[i],b=boundary[(i+1)%boundary.length];
    poly=clip(poly,p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])));
  }
  return poly;
}

/** Continuous triangle coverage and swept headroom over an existing floor; emits no slab.
 * Support and clearance are polygon/prism tests, not a grid of point probes.
 */
export function validateWalkingApproach(model: TileModel,tile: PlacedTile,point: Vec3,outward: Vec3,width: number,depth: number,
  models: TileModel[],tiles: PlacedTile[],existing: ConnectorSurface[]=[],landing=false) {
  const finish=beginGeometryValidation(),start=performance.now();
  try {
    if(!model.connectionSurface)return checkApproach(model,tile,point,outward,width,depth,models,tiles,existing,landing);
    const revision=geometryRevision(model.connectionSurface);
    const key=JSON.stringify([tile,model.variants[tile.variant]?.rotation,model.variants[tile.variant]?.mirror,point,outward,width,depth,landing,
      tiles.map(t=>{const m=models.find(m=>m.id===t.id||m.id===t.id.split("::")[0]);return [t,m?.connectionSurface?geometryRevision(m.connectionSurface).id:null,m?.variants[t.variant]?.rotation,m?.variants[t.variant]?.mirror];}),
      existing.map(m=>geometryRevision(m).id)]);
    let entries=approaches.get(revision);if(!entries){entries=new Map();approaches.set(revision,entries);}
    const cached=entries.get(key);
    if(cached)return {...structuredClone(cached),ms:performance.now()-start,cacheHit:true};
    const result=checkApproach(model,tile,point,outward,width,depth,models,tiles,existing,landing);
    if(entries.size>=256)entries.delete(entries.keys().next().value!);
    entries.set(key,structuredClone(result));return {...result,ms:performance.now()-start,cacheHit:false};
  } finally {finish();}
}

function checkApproach(model: TileModel,tile: PlacedTile,point: Vec3,outward: Vec3,width: number,depth: number,
  models: TileModel[],tiles: PlacedTile[],existing: ConnectorSurface[],landing:boolean) {
  const finish=beginGeometryValidation(),start=performance.now();
  const fail=(reason:string,details:unknown={})=>({valid:false,reason,details,ms:performance.now()-start});
  try {
    if(!model.connectionSurface || !Number.isFinite(width+depth) || width<2 || depth<=0 || depth>6)return fail("invalid approach dimensions");
    const length=Math.hypot(outward[0],outward[1]);if(length<.99)return fail("missing approach direction");
    const dx=-outward[0]/length,dy=-outward[1]/length;
    const frame=(p: Vec3): Vec3 => [(p[0]-point[0])*dx+(p[1]-point[1])*dy,-(p[0]-point[0])*dy+(p[1]-point[1])*dx,p[2]];
    const rectangle:Vec3[]=[[0,-width/2,point[2]],[depth,-width/2,point[2]],[depth,width/2,point[2]],[0,width/2,point[2]]];
    const source=placedFaces(model,tile).map(t=>({...t,points:t.points.map(frame)}));
    const seed=source.filter(t=>t.normalZ>=.7).map(t=>{
      const poly=within(t.points,[[.001,-.001,0],[.003,-.001,0],[.003,.001,0],[.001,.001,0]]);
      return {t,delta:poly.length?Math.abs(poly.reduce((s,p)=>s+p[2],0)/poly.length-point[2]):Infinity};
    }).sort((a,b)=>a.delta-b.delta)[0];
    if(!seed || seed.delta>.2)return fail("no physical floor at entrance");
    const region=seed.t.region;
    const patches=source.filter(t=>t.region===region).map(t=>({face:t,poly:within(t.points,rectangle)})).filter(p=>Math.abs(signedArea(p.poly))>1e-9);
    const area=patches.reduce((sum,p)=>sum+Math.abs(signedArea(p.poly)),0),expected=width*depth;
    if(Math.abs(area-expected)>Math.max(1e-5,expected*1e-6))return fail("incomplete or overlapping floor coverage",{region,area,expected});
    for(let i=0;i<patches.length;i++)for(let j=i+1;j<patches.length;j++)
      if(Math.abs(signedArea(within(patches[i].poly,patches[j].poly)))>1e-7)return fail("ambiguous overlapping floor projections",{region});
    let maxSlope=0,maxCrossSlope=0;
    const planes=patches.map(p=>{
      const [a,b,c]=p.face.points,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],det=ux*vy-uy*vx;
      const sx=(uz*vy-uy*vz)/det,sy=(ux*vz-uz*vx)/det;
      maxSlope=Math.max(maxSlope,Math.abs(sx));maxCrossSlope=Math.max(maxCrossSlope,Math.abs(sy));
      return {poly:p.poly,height:(q:Vec3)=>a[2]+sx*(q[0]-a[0])+sy*(q[1]-a[1])};
    });
    if(maxSlope>(landing?1/48:1/12)+1e-6 || maxCrossSlope>1/48+1e-6)return fail("local approach slope",{region,maxSlope,maxCrossSlope,area});
    // Check the full opening from half a foot outside the real mesh edge as well.
    planes.push({poly:[[-.5,-width/2,point[2]],[0,-width/2,point[2]],[0,width/2,point[2]],[-.5,width/2,point[2]]],height:()=>point[2]});
    const obstacles: Array<{points:Vec3[];id:string}>=[];
    for(const other of tiles) {
      const m=models.find(m=>m.id===other.id||m.id===other.id.split("::")[0]);
      if(!m?.connectionSurface)return fail("missing obstruction geometry",{id:other.id});
      const faces=placedFaces(m,other);
      const probe:Vec3=[point[0]+dx*.01,point[1]+dy*.01,point[2]+.1];
      // Exact surface clipping below handles crossings; a material test also catches enclosure.
      const box={min:[0,1,2].map(k=>Math.min(...faces.map(f=>f.min[k]))),max:[0,1,2].map(k=>Math.max(...faces.map(f=>f.max[k])))};
      if(probe.every((v,k)=>v>=box.min[k]&&v<=box.max[k])) {
        const state=sourceMaterialAtPoint(m.connectionSurface,localPoint(probe,other,m));
        if(state.material||state.uncertain)return fail("approach enclosed by material or uncertain solid",{id:other.id,...state});
      }
      obstacles.push(...faces);
    }
    for(const mesh of existing) {
      const faces:Vec3[][]=[];
      for(let i=0;i<mesh.indices.length;i+=3)faces.push(mesh.indices.slice(i,i+3).map(v=>Array.from(mesh.positions.slice(v*3,v*3+3)) as Vec3));
      if(faces.length) {
        const box=bounds(faces.flat()),probe:Vec3=[point[0]+dx*.01,point[1]+dy*.01,point[2]+.1];
        if(probe.every((v,k)=>v>=box.min[k]&&v<=box.max[k])) {
          const state=sourceMaterialAtPoint({positions:mesh.positions,triangles:mesh.indices},probe);
          if(state.material||state.uncertain)return fail("approach enclosed by connector or uncertain solid",state);
        }
      }
      for(const points of faces)obstacles.push({id:"existing connector",points});
    }
    const low=Math.min(...patches.flatMap(p=>p.poly.map(v=>v[2]))),high=Math.max(...patches.flatMap(p=>p.poly.map(v=>v[2])));
    let minHeadroom=Infinity;
    for(const obstacle of obstacles) {
      const points=obstacle.points.map(frame),box=bounds(points);
      if(box.max[0]<-.5-1e-8||box.min[0]>depth+1e-8||box.max[1]<-width/2-1e-8||box.min[1]>width/2+1e-8||box.max[2]<=low+.05-1e-8)continue;
      for(const plane of planes) {
        let poly=within(points,plane.poly);if(!poly.length)continue;
        poly=clip(poly,p=>p[2]-plane.height(p)-.05);if(!poly.length)continue;
        minHeadroom=Math.min(minHeadroom,...poly.map(p=>p[2]-plane.height(p)));
        if(box.min[2]>high+6.5)continue;
        poly=clip(poly,p=>plane.height(p)+6.5-p[2]);
        if(poly.length)return fail("swept approach clearance or headroom",{region,obstacle:obstacle.id,point:poly[0],minHeadroom,area});
      }
    }
    return {valid:true,reason:"verified existing floor approach",details:{region,area,width,depth,maxSlope,maxCrossSlope,minHeadroom,representation:"existing source surface; no generated slab",openingOutsideDepth:.5},ms:performance.now()-start};
  } finally {finish();}
}
