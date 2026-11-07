import { beginGeometryValidation, geometryRevision } from "./geometryRevision";
import { connectionDiagnostic, startConnectionTiming } from "./connectionDiagnostics";
import type { PlacedTile, PortPair, TileModel, Vec3 } from "./types";
import { placementWorldZ } from "./types";
import { transitionMeshes, transitionSections } from "./transitionGeometry";
import { measureFlushWalkingInterface, worldFromLocal } from "./surfaceAttachment";
import { pointOnContact } from "./extensionReconstruction";
import { requiresSourceResponsiveExtension, resolveSourceResponsiveExtension } from "./sourceResponsiveExtension";

type Triangle = [Vec3,Vec3,Vec3];
type Bounds = {min:Vec3;max:Vec3};
type Node = Bounds & {left?:Node;right?:Node;triangles?:Triangle[];closed?:boolean};
export type ConnectorSurface = {positions:import("./types").DerivedPositions;indices:number[];portPair?:PortPair};
const cache=new WeakMap<object,Node>();
const sourceClearanceCache=new WeakMap<object,Map<string,{ clear: boolean; reason?: string }>>();
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function bounds(triangles:Triangle[]):Bounds {
  const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity];
  for(const tri of triangles) for(const p of tri) for(let i=0;i<3;i++) {min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  return {min,max};
}
function build(triangles:Triangle[]):Node {
  const box=bounds(triangles);
  if(triangles.length<=12) return {...box,triangles};
  const spans=box.max.map((v,i)=>v-box.min[i]),axis=spans.indexOf(Math.max(...spans));
  triangles.sort((a,b)=>a.reduce((s,p)=>s+p[axis],0)-b.reduce((s,p)=>s+p[axis],0));
  const mid=Math.floor(triangles.length/2);
  return {...box,left:build(triangles.slice(0,mid)),right:build(triangles.slice(mid))};
}
function trianglesOf(surface:ConnectorSurface):Triangle[] {
  const out:Triangle[]=[];
  for(let i=0;i<surface.indices.length;i+=3) out.push(surface.indices.slice(i,i+3).map(index=>Array.from(surface.positions.slice(index*3,index*3+3)) as Vec3) as Triangle);
  return out;
}
function overlaps(a:Bounds,b:Bounds) {return a.min.every((v,i)=>v<=b.max[i]+1e-6&&a.max[i]>=b.min[i]-1e-6);}
function segmentHit(a:Vec3,b:Vec3,tri:Triangle):Vec3|null {
  const dir=sub(b,a),e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),h=cross(dir,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-8) return null;
  const s=sub(a,tri[0]),u=dot(s,h)/det;
  if(u< -1e-6||u>1+1e-6) return null;
  const q=cross(s,e1),v=dot(dir,q)/det;
  if(v< -1e-6||u+v>1+1e-6) return null;
  const t=dot(e2,q)/det;
  return t>=-1e-6&&t<=1+1e-6?a.map((x,i)=>x+dir[i]*t) as Vec3:null;
}
function pointInside(p:Vec3,tri:Triangle) {
  const a=sub(tri[1],tri[0]),b=sub(tri[2],tri[0]),v=sub(p,tri[0]),n=cross(a,b),nn=dot(n,n);
  if(nn<1e-12||Math.abs(dot(v,n))>1e-5*Math.sqrt(nn)) return false;
  const aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),av=dot(a,v),bv=dot(b,v),d=aa*bb-ab*ab;
  const u=(bb*av-ab*bv)/d,w=(aa*bv-ab*av)/d;
  return u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6;
}
function intersects(a:Triangle,b:Triangle,allowed:(p:Vec3)=>boolean) {
  for(const [first,second] of [[a,b],[b,a]]) {
    for(let i=0;i<3;i++) {const hit=segmentHit(first[i],first[(i+1)%3],second);if(hit&&!allowed(hit))return true;}
    for(const p of first) if(pointInside(p,second)&&!allowed(p)) return true;
  }
  const normal=cross(sub(a[1],a[0]),sub(a[2],a[0]));
  if(Math.hypot(...normal)>1e-8&&b.every(p=>Math.abs(dot(sub(p,a[0]),normal))<1e-6*Math.hypot(...normal))) {
    const drop=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=[0,1,2].filter(i=>i!==drop);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++) {
      const p=a[i],q=b[j],r=sub(a[(i+1)%3],p),s=sub(b[(j+1)%3],q),v=sub(q,p);
      const det=r[axes[0]]*s[axes[1]]-r[axes[1]]*s[axes[0]];
      if(Math.abs(det)<1e-10)continue;
      const t=(v[axes[0]]*s[axes[1]]-v[axes[1]]*s[axes[0]])/det,u=(v[axes[0]]*r[axes[1]]-v[axes[1]]*r[axes[0]])/det;
      if(t>=0&&t<=1&&u>=0&&u<=1&&!allowed(p.map((x,k)=>x+r[k]*t) as Vec3))return true;
    }
  }
  return false;
}
function closedSurface(triangles:Triangle[]) {
  const edges=new Map<string,number>(),key=(p:Vec3)=>p.map(v=>v.toFixed(5)).join(',');
  for(const tri of triangles)for(let i=0;i<3;i++){const edge=[key(tri[i]),key(tri[(i+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
  return edges.size>0&&[...edges.values()].every(n=>n===2);
}
/** Certify an extrapolated hit outside either actual triangle. This is only
 * used for reconstructed interfaces with independently verified source faces.
 * The small arithmetic bound is not a geometric contact tolerance. */
export function extrapolatedInterfaceHit(p:Vec3,a:Triangle,b:Triangle):boolean {
  return [a,b].some(t=>p.some((value,k)=>{
    const values=t.map(q=>q[k]),min=Math.min(...values),max=Math.max(...values);
    const roundoff=64*Number.EPSILON*Math.max(1,Math.abs(value),...values.map(Math.abs));
    return value<min-roundoff||value>max+roundoff;
  }));
}
function triangleEdges(t:Triangle):string[] {
  return t.map((p,i)=>[p.join(','),t[(i+1)%3].join(',')].sort().join('|'));
}
function collides(tri:Triangle,node:Node,allowed:(p:Vec3,source?:Triangle)=>boolean,box=bounds([tri])):boolean {
  if(!overlaps(box,node)) return false;
  return node.triangles?node.triangles.some(other=>intersects(tri,other,p=>allowed(p,other))):
    collides(tri,node.left!,allowed,box)||collides(tri,node.right!,allowed,box);
}
function localPoint(p:Vec3,tile:PlacedTile,model:TileModel):Vec3 {
  const variant=model.variants[tile.variant],angle=-variant.rotation*Math.PI/180;
  const x=p[0]-tile.ix*20,y=p[1]-tile.iy*20;
  const rx=x*Math.cos(angle)-y*Math.sin(angle),ry=x*Math.sin(angle)+y*Math.cos(angle);
  return [variant.mirror==="x"?-rx:rx,variant.mirror==="y"?-ry:ry,p[2]-placementWorldZ(tile)];
}

/** Additional Stage 2A landing probes. Uses the same 6.5 ft vertical clearance as routes. */
export function landingHeadroomCheck(points: Vec3[], tiles: PlacedTile[], models: TileModel[], existing: ConnectorSurface[] = []) {
  const finish = beginGeometryValidation();
  try {
    for (const tile of tiles) {
      const model = models.find(m => m.id === tile.id || m.id === tile.id.split("::")[0]);
      if (!model?.connectionSurface) return { clear: false, reason: "missing surface", id: tile.id };
      const revision = geometryRevision(model.connectionSurface);
      let tree = cache.get(revision);
      if (!tree) {
        const triangles = trianglesOf({ positions: model.connectionSurface.positions, indices: model.connectionSurface.triangles });
        tree = build(triangles); tree.closed = closedSurface(triangles); cache.set(revision, tree);
      }
      for (const point of points) {
        const a = localPoint([point[0], point[1], point[2] + .05], tile, model);
        const b = localPoint([point[0], point[1], point[2] + 6.5], tile, model);
        const box = bounds([[a,b,b]]);
        const probe = (node: Node): boolean => overlaps(box,node) && (node.triangles
          ? node.triangles.some(t => !!segmentHit(a,b,t)) : probe(node.left!) || probe(node.right!));
        if (probe(tree)) return { clear: false, reason: "headroom", id: tile.id, filename: model.filename, point };
      }
    }
    for (const mesh of existing) {
      const revision=geometryRevision(mesh);
      let tree=cache.get(revision);
      if(!tree){tree=build(trianglesOf(mesh));cache.set(revision,tree);}
      for(const point of points) {
        const a:Vec3=[point[0],point[1],point[2]+.05],b:Vec3=[point[0],point[1],point[2]+6.5];
        const box=bounds([[a,b,b]]);
        const probe=(node:Node):boolean=>overlaps(box,node)&&(node.triangles?node.triangles.some(t=>!!segmentHit(a,b,t)):probe(node.left!)||probe(node.right!));
        if(probe(tree))return {clear:false,reason:"connector headroom",point};
      }
    }
    return { clear: true };
  } finally { finish(); }
}
/** Exact triangle surface intersection; only a 0.04' seam at the intended edge is allowed. */
export function transitionSurfaceClear(pair:PortPair,tiles:PlacedTile[],models:TileModel[],existing:ConnectorSurface[]=[]):boolean {
  const finishGeometry = beginGeometryValidation();
  try {
  const finishTiming = startConnectionTiming("collision and clearance");
  try {
  if(requiresSourceResponsiveExtension(pair,models)) {
    delete pair.extension;
    const material=resolveSourceResponsiveExtension(pair,models,tiles);
    if(!material.valid){connectionDiagnostic("clearance","source-responsive material interface",{pair,reason:material.reason});return false;}
  }
  let tris: Triangle[] | undefined;
  const connectorTriangles = () => tris ??= transitionMeshes(pair).flatMap(trianglesOf);
  for(const tile of tiles) {
    const model=models.find(m=>m.id===tile.id||m.id===tile.id.split("::")[0]);
    if(!model?.connectionSurface) continue; // Voxel clearance remains mandatory for older/session models.
    const surface=model.connectionSurface;
    const revision=geometryRevision(surface);
    let tree=cache.get(revision);
    if(!tree) {const sourceTriangles=trianglesOf({positions:surface.positions,indices:surface.triangles});const closed=closedSurface(sourceTriangles);tree=build(sourceTriangles);tree.closed=closed;cache.set(revision,tree);}
    let checks=sourceClearanceCache.get(revision);
    if(!checks){checks=new Map();sourceClearanceCache.set(revision,checks);}
    // Exact local values: even sub-tolerance parameter edits must miss the cache.
    const canonical=(p:Vec3)=>p;
    const localDirection=(d:Vec3|undefined)=>d?canonical(sub(localPoint(pair.from.map((v,i)=>v+d[i]) as Vec3,tile,model),localPoint(pair.from,tile,model))):undefined;
    const signature=JSON.stringify({role:tile.id===pair.tileA?'A':tile.id===pair.tileB?'B':'obstacle',from:canonical(localPoint(pair.from,tile,model)),to:canonical(localPoint(pair.to,tile,model)),path:pair.path?.map(p=>canonical(localPoint(p,tile,model))),startDirection:localDirection(pair.startDirection),endDirection:localDirection(pair.endDirection),startWidth:pair.startWidth,endWidth:pair.endWidth,width:pair.usableWidth,startProfile:pair.startProfile?.map(p=>canonical(localPoint(p,tile,model))),endProfile:pair.endProfile?.map(p=>canonical(localPoint(p,tile,model))),class:pair.connectionClass,angle:pair.angle,lateralOffset:pair.lateralOffset,rise:pair.rise,plan:pair.plan});
    const constructionSignature=signature+JSON.stringify(pair.extension??null);
    const previous=checks.get(constructionSignature);
    if(previous!==undefined){connectionDiagnostic("cache", "source clearance hit");if(!previous.clear){connectionDiagnostic("clearance", previous.reason ?? "source collision or clearance", { pair, blocker: tile, filename: model.filename, cached: true });return false;}continue;}
    connectionDiagnostic("cache", "source clearance miss");
    let failureReason: string | undefined;
    const clearSource=()=>{
    const endpoint=tile.id===pair.tileA?pair.from:tile.id===pair.tileB?pair.to:null;
    const direction=tile.id===pair.tileA?pair.startDirection:pair.endDirection;
    const localEnd=endpoint?localPoint(endpoint,tile,model):null;
    const localDir=endpoint&&direction?sub(localPoint(endpoint.map((v,i)=>v+direction[i]) as Vec3,tile,model),localEnd!):null;
    const meshes=endpoint?transitionMeshes(pair):[],endMesh=tile.id===pair.tileA?meshes[0]:meshes.at(-1);
    const offset=tile.id===pair.tileA?0:(endMesh?.positions.length??12)-12;
    const seam=endMesh?[Array.from(endMesh.positions.slice(offset,offset+3)),Array.from(endMesh.positions.slice(offset+3,offset+6))] as [Vec3,Vec3]:undefined;
    const interfaceCheck=seam?measureFlushWalkingInterface(model,tile,seam):undefined;
    const localSeam=seam?.map(p=>localPoint(p,tile,model));
    // Only coplanar contact at a proven physical walking boundary is exempt.
    // Follow its actual cross-slope; never exempt a band penetrating the form.
    const allowed=(p:Vec3)=>{
      if(pair.extension?.reconstruction?.status==="PASS") {
        const world=worldFromLocal(p,tile,model);
        return !!pair.extension.contacts?.some(contact=>contact.sourceId===tile.id&&pointOnContact(world,contact.triangle));
      }
      if(!localEnd||!localDir||!localSeam||!interfaceCheck?.valid||!interfaceCheck.boundaryVerified)return false;
      if(Math.abs(dot(sub(p,localEnd),localDir))>1e-5)return false;
      const [a,b]=localSeam,edge=sub(b,a),lengthSquared=edge[0]**2+edge[1]**2;
      const t=((p[0]-a[0])*edge[0]+(p[1]-a[1])*edge[1])/lengthSquared;
      const floor=a[2]+edge[2]*t;
      // Contact is confined to the same verified boundary plane. A deeper
      // source-responsive cap does not permit overlap anywhere along the route.
      const bottomSeam=endMesh?[Array.from(endMesh.positions.slice(offset+6,offset+9)),Array.from(endMesh.positions.slice(offset+9,offset+12))].map(q=>localPoint(q as Vec3,tile,model)):undefined;
      const underside=pair.extension&&bottomSeam?bottomSeam[0][2]+(bottomSeam[1][2]-bottomSeam[0][2])*t:floor-.25;
      return t>=-1e-6&&t<=1+1e-6&&p[2]<=floor+1e-6&&p[2]>=underside-1e-6;
    };
    const verifiedSourceFaces=new Set<string>();
    const verifiedSourceEdges=new Set<string>();
    if(pair.extension?.reconstruction?.status==="PASS")for(const contact of pair.extension.contacts??[]){
      if(contact.sourceId!==tile.id)continue;
      for(const face of contact.sourceTriangles??[contact.sourceTriangle]){
        const indices=surface.triangles.slice(face*3,face*3+3);
        if(indices.length===3){
          const triangle=indices.map(i=>Array.from(surface.positions.slice(i*3,i*3+3)) as Vec3) as Triangle;
          verifiedSourceFaces.add(triangle.flat().join(','));
          triangleEdges(triangle).forEach(edge=>verifiedSourceEdges.add(edge));
        }
      }
    }
    for(const tri of connectorTriangles()) {
      const localTriangle=tri.map(p=>localPoint(p,tile,model)) as Triangle;
      // Include the neighboring original face on the exact same interface edge.
      // This still exempts only a hit certified outside an actual triangle.
      const interfaceContact=(p:Vec3,source?:Triangle)=>allowed(p)||!!(source&&(verifiedSourceFaces.has(source.flat().join(','))||triangleEdges(source).some(edge=>verifiedSourceEdges.has(edge)))&&extrapolatedInterfaceHit(p,localTriangle,source));
      if(collides(localTriangle,tree,interfaceContact)){failureReason = "source triangle collision";connectionDiagnostic("clearance", failureReason, { pair, blocker: tile, filename: model.filename });return false;}
    }
    // Standing clearance over the walking ribbon, including walls/roof above it.
    for(const section of transitionSections(pair)) for(const side of [-.5,0,.5]) {
      const p=section.center.map((v,i)=>v+section.side[i]*section.width*side) as Vec3;
      const a=localPoint([p[0],p[1],p[2]+.05],tile,model),b=localPoint([p[0],p[1],p[2]+6.5],tile,model);
      const probeBounds=bounds([[a,b,b]]);
      const probe=(node:Node):boolean=>overlaps(probeBounds,node)&&(node.triangles?node.triangles.some(t=>!!segmentHit(a,b,t)):probe(node.left!)||probe(node.right!));
      if(probe(tree)){failureReason = "headroom";connectionDiagnostic("clearance", failureReason, { pair, blocker: tile, filename: model.filename, point: p });return false;}
      if(tree.closed) {
        const far:Vec3=[a[0],a[1],tree.max[2]+1],hits:number[]=[],rayBounds=bounds([[a,[a[0],a[1],tree.max[2]+1],[a[0],a[1],tree.max[2]+1]]]);
        const collect=(node:Node)=>{
          if(!overlaps(rayBounds,node))return;
          if(node.triangles)for(const tri of node.triangles){const hit=segmentHit(a,far,tri);if(hit)hits.push(hit[2]);}
          else {collect(node.left!);collect(node.right!);}
        };
        collect(tree);hits.sort((x,y)=>x-y);
        if(hits.filter((z,i)=>i===0||Math.abs(z-hits[i-1])>1e-5).length%2===1){failureReason = "inside closed source";connectionDiagnostic("clearance", failureReason, { pair, blocker: tile, filename: model.filename, point: p });return false;}
      }
    }
    return true;
    };
    const clear=clearSource();
    if(checks.size>=2000)checks.delete(checks.keys().next().value!);
    checks.set(constructionSignature,{ clear, reason: failureReason });
    if(!clear)return false;
  }
  for(const mesh of existing) {
    const revision=geometryRevision(mesh);
    let tree=cache.get(revision);
    if(!tree){tree=build(trianglesOf(mesh));cache.set(revision,tree);connectionDiagnostic("cache", "connector tree miss");}
    else connectionDiagnostic("cache", "connector tree hit");
    const other=mesh.portPair;
    const seamContact=(p:Vec3)=>{
      if(!other)return false;
      for(const tile of [pair.tileA,pair.tileB]) {
        if(tile!==other.tileA&&tile!==other.tileB)continue;
        const a=tile===pair.tileA?pair.from:pair.to,na=tile===pair.tileA?pair.startDirection:pair.endDirection;
        const b=tile===other.tileA?other.from:other.to,nb=tile===other.tileA?other.startDirection:other.endDirection;
        if(na&&nb&&Math.abs(dot(sub(p,a),na))<1e-5&&Math.abs(dot(sub(p,b),nb))<1e-5&&Math.abs(p[2]-a[2])<=.26&&Math.abs(p[2]-b[2])<=.26)return true;
      }
      return false;
    };
    if(connectorTriangles().some(tri=>collides(tri,tree,seamContact))) { connectionDiagnostic("clearance", "connector collision", { pair, blocker: other }); return false; }
  }
  return true;

  } finally { finishTiming(); }

  } finally { finishGeometry(); }
}

/** Independent exact triangle audit for new local additions. Returns the first
 * original/generated face witness. The caller must justify every contact point;
 * this does not change existing connector collision behavior or tolerances. */
export function auditGeneratedSurface(surface:ConnectorSurface,models:TileModel[],tiles:PlacedTile[],allowed:(point:Vec3,sourceId:string)=>boolean=()=>false,verifiedPair?:PortPair) {
  const generated=trianglesOf(surface);
  let extrapolatedHits=0;
  for(const tile of tiles){const model=models.find(m=>m.id===tile.id);if(!model?.connectionSurface)return {clear:false,reason:"missing obstruction geometry",sourceId:tile.id};
    const source=trianglesOf({positions:model.connectionSurface.positions,indices:model.connectionSurface.triangles});
    const boxes=source.map(t=>bounds([t]));
    const verifiedFaces=new Set<number>(),verifiedEdges=new Set<string>();
    if(verifiedPair?.extension?.reconstruction?.status==="PASS")for(const c of verifiedPair.extension.contacts??[]){
      if(c.sourceId!==tile.id)continue;
      for(const face of c.sourceTriangles??[c.sourceTriangle])if(source[face]){
        verifiedFaces.add(face);triangleEdges(source[face]).forEach(edge=>verifiedEdges.add(edge));
      }
    }
    for(const [generatedFace,world]of generated.entries()){const triangle=world.map(p=>localPoint(p,tile,model)) as Triangle,box=bounds([triangle]);
      let rejectedPoint:Vec3|undefined;
      for(const [sourceFace,other]of source.entries())if(overlaps(box,boxes[sourceFace])&&intersects(triangle,other,p=>{
        const v=model.variants[tile.variant],a=v.rotation*Math.PI/180,x=v.mirror==="x"?-p[0]:p[0],y=v.mirror==="y"?-p[1]:p[1];
        const worldPoint:Vec3=[x*Math.cos(a)-y*Math.sin(a)+tile.ix*20,x*Math.sin(a)+y*Math.cos(a)+tile.iy*20,p[2]+placementWorldZ(tile)];
        const verified=verifiedFaces.has(sourceFace)||triangleEdges(other).some(edge=>verifiedEdges.has(edge));
        const extrapolated=!!verified&&extrapolatedInterfaceHit(p,triangle,other);
        if(extrapolated)extrapolatedHits++;
        const accepted=allowed(worldPoint,tile.id)||extrapolated;
        if(!accepted)rejectedPoint=worldPoint;
        return accepted;
      }))return {clear:false,reason:"triangle intersection",sourceId:tile.id,sourceFace,generatedFace,originalTriangle:other,generatedTriangle:world,rejectedPoint,extrapolatedHits};
    }
  }
  return {clear:true,reason:"no prohibited triangle intersection",extrapolatedHits};
}

/** Independent self-intersection gate on the actual derived coordinates.
 * Only shared topological vertices/edges qualify as ordinary mesh contact. */
export function auditDerivedSelfIntersections(surface:ConnectorSurface) {
  // BVH construction sorts its input; preserve the face-to-index correspondence.
  const triangles=trianglesOf(surface),tree=build(triangles.slice());
  const identities=new Map(triangles.map((t,i)=>[t,i]));
  for(const [face,triangle]of triangles.entries()){
    const box=bounds([triangle]);
    const visit=(node:Node):{faceA:number;faceB:number;triangleA:Triangle;triangleB:Triangle;shared:Vec3[]}|null=>{
      if(!overlaps(box,node))return null;
      if(node.triangles){
        for(const other of node.triangles){
          const second=identities.get(other)!;if(second<=face)continue;
          const indices=surface.indices.slice(face*3,face*3+3),otherIndices=surface.indices.slice(second*3,second*3+3);
          const shared=indices.filter(i=>otherIndices.includes(i)).map(i=>Array.from(surface.positions.slice(i*3,i*3+3)) as Vec3);
          if(shared.length===2){
            const a=cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])),b=cross(sub(other[1],other[0]),sub(other[2],other[0]));
            // Distinct planes intersect only on their common edge. Consistently
            // oriented coplanar neighbors occupy opposite sides of that edge.
            if(Math.hypot(...cross(a,b))>1e-12*Math.hypot(...a)*Math.hypot(...b)||dot(a,b)>=0)continue;
          }
          const containsActualPoint=(p:Vec3,t:Triangle)=>{
            const a=sub(t[1],t[0]),b=sub(t[2],t[0]),v=sub(p,t[0]),n=cross(a,b),length=Math.hypot(...n);
            if(!length||Math.abs(dot(v,n))/length>1e-12)return false;
            const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(k=>k!==drop),x=axes[0],y=axes[1];
            const d=a[x]*b[y]-a[y]*b[x];if(!d)return false;
            const u=(v[x]*b[y]-v[y]*b[x])/d,w=(a[x]*v[y]-a[y]*v[x])/d,roundoff=128*Number.EPSILON;
            return u>=-roundoff&&w>=-roundoff&&u+w<=1+roundoff;
          };
          const allowed=(p:Vec3)=>{
            // The existing obstruction test conservatively extends segments.
            // For mesh self-contact, an extrapolated hit outside either actual
            // triangle is not a physical intersection. Source collision rules
            // below/above are intentionally unchanged.
            if(!containsActualPoint(p,triangle)||!containsActualPoint(p,other))return true;
            if(shared.length===1)return Math.hypot(...sub(p,shared[0]))<=1e-7;
            if(shared.length!==2)return false;
            const edge=sub(shared[1],shared[0]),length=dot(edge,edge);
            const t=dot(sub(p,shared[0]),edge)/length;
            const closest=shared[0].map((v,k)=>v+Math.max(0,Math.min(1,t))*edge[k]) as Vec3;
            return Math.hypot(...sub(p,closest))<=1e-7;
          };
          if(intersects(triangle,other,allowed))return {faceA:face,faceB:second,triangleA:triangle,triangleB:other,shared};
        }
        return null;
      }
      return visit(node.left!)??visit(node.right!);
    };
    const witness=visit(tree);if(witness)return {clear:false,...witness};
  }
  return {clear:true};
}
