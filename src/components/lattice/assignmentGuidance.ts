import { geometryRevision } from "./geometryRevision";
import { architecturalInterface } from "./architecturalSurfaces";
import { branchBoundaries } from "./branchBoundaries";
import { enumerateWalkableAttachments, localPoint, worldFromLocal } from "./surfaceAttachment";
import type { PlacedTile, TileModel, Vec3 } from "./types";
import { sideAdjacentRegistration } from "./adjacentConnections";
import { LATTICE_FEET } from "./types";
import { connectionFeatures } from "./connectionFeatures";

type Interface={point:Vec3;outward:Vec3;branch:boolean};
const cache=new WeakMap<object,Interface[]>();
/** Source-content cache only. Placement/orientation is applied freshly below.
 * Guidance is not a walking, contact, material or collision certificate. */
function interfaces(model:TileModel){
  if(!model.connectionSurface)return [];
  if(model.connectionFeaturePolicy)return connectionFeatures(model).features.filter(f=>model.connectionFeaturePolicy![f.kind]).map(f=>({point:f.point,outward:f.outward,branch:f.kind==="branch"}));
  const revision=geometryRevision(model.connectionSurface),old=cache.get(revision);if(old)return old;
  const tile={id:model.id,ix:0,iy:0,iz:0,variant:0},raw=enumerateWalkableAttachments(model,tile,64).anchors;
  const branchRecords=branchBoundaries(model).map(b=>({point:[...b.point] as Vec3,outward:[...b.outward] as Vec3,branch:true}));
  const records=[...branchRecords,...raw.map(a=>{const point=localPoint(a.point,tile,model),end=localPoint(a.point.map((v,k)=>v+a.outward[k]) as Vec3,tile,model);
    return {point,outward:end.map((v,k)=>v-point[k]) as Vec3,branch:false};})];
  const selected=[...records.filter(r=>r.branch).slice(0,16),...records.filter(r=>!r.branch).slice(0,16)];cache.set(revision,selected);return selected;
}
/** Maximum spanning forest of geometric opportunities, not circulation edges.
 * Count independent relationships first; duplicate pairs/cycles cannot make
 * one favorable pair outrank a potential network including more forms. */
export function interfaceNetworkPriority(count:number,edges:Array<{a:number;b:number;priority:number}>){
  const parent=Array.from({length:count},(_,i)=>i),find=(i:number):number=>parent[i]===i?i:find(parent[i]);
  let links=0,quality=0;
  for(const edge of edges.slice().sort((a,b)=>b.priority-a.priority||a.a-b.a||a.b-b.b)){
    if(!Number.isFinite(edge.priority)||edge.a<0||edge.b<0||edge.a>=count||edge.b>=count)continue;
    const a=find(edge.a),b=find(edge.b);if(a===b)continue;
    parent[a]=b;links++;quality+=Math.max(-500,Math.min(500,edge.priority));
  }
  // Bounded quality cannot outrank including one more independent form.
  return links*1000+(count>1?quality/(count-1):0);
}
export function assignmentInterfacePriority(models:TileModel[],tiles:PlacedTile[]){
  const opportunities:Array<{a:number;b:number;priority:number}>=[];
  const placed=models.map((m,i)=>interfaces(m).map(a=>{const point=worldFromLocal(a.point,tiles[i],m),end=worldFromLocal(a.point.map((v,k)=>v+a.outward[k]) as Vec3,tiles[i],m);return {...a,point,outward:end.map((v,k)=>v-point[k]) as Vec3};}));
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    if(!sideAdjacentRegistration(tiles[i],tiles[j]))continue;
    let best=-Infinity;
    for(const a of placed[i])for(const b of placed[j]){
    const dx=b.point[0]-a.point[0],dy=b.point[1]-a.point[1],span=Math.hypot(dx,dy),rise=Math.abs(b.point[2]-a.point[2]);
    if(span<.1||span>60||rise>12)continue;
    const facingA=(dx*a.outward[0]+dy*a.outward[1])/span,facingB=-(dx*b.outward[0]+dy*b.outward[1])/span;
    // Heading mismatch affects priority; independent landing/redirection
    // construction may resolve it, so it is not an opportunity exclusion.
    // Branch preference belongs to the side shared by these registration bays.
    // Wrong-side ends may still be routed by reconstruction, but must not earn
    // the same orientation preference as ends exposed toward that neighbor.
    const sideX=tiles[j].ix-tiles[i].ix,sideY=tiles[j].iy-tiles[i].iy;
    const towardSide=(p:Interface,tile:PlacedTile,sign:number)=>
      sign*(p.outward[0]*sideX+p.outward[1]*sideY)>.1
      && sign*((p.point[0]-tile.ix*LATTICE_FEET)*sideX+(p.point[1]-tile.iy*LATTICE_FEET)*sideY)>=0;
    const tier=Number(a.branch&&towardSide(a,tiles[i],1))+Number(b.branch&&towardSide(b,tiles[j],-1));
    best=Math.max(best,tier*100+20*(facingA+facingB)-span-rise*6);
    }
    if(Number.isFinite(best))opportunities.push({a:i,b:j,priority:best});
  }
  return interfaceNetworkPriority(models.length,opportunities);
}
export function confirmedBranchRelationships(models:TileModel[],tiles:PlacedTile[],pairs:import("./types").PortPair[]){
  let score=0;
  for(const p of pairs){const a=models.find(m=>m.id===p.tileA),b=models.find(m=>m.id===p.tileB),ta=tiles.find(t=>t.id===p.tileA),tb=tiles.find(t=>t.id===p.tileB);
    if(!a||!b||!ta||!tb)continue;
    const branches=Number(architecturalInterface(a,ta,p.from)?.role==="projecting branch")+Number(architecturalInterface(b,tb,p.to)?.role==="projecting branch");
    score+=branches===2?2:branches===1?1:0;
  }
  return score;
}
/** Reserve a quarter of each stage for original-order diversity/floor fallback.
 * Only the bounded search omits candidates; none is geometrically rejected by
 * this heuristic. Budget omissions remain explicit in the result. */
export function orderAssignmentCandidates<T extends {tiles:PlacedTile[]}>(items:T[],models:TileModel[],limit:number,guided:boolean){
  if(!guided)return items.slice(0,limit);
  const ranked=items.map((item,i)=>({item,i,priority:assignmentInterfacePriority(models,item.tiles)})).sort((a,b)=>b.priority-a.priority||a.i-b.i);
  const selected=ranked.slice(0,Math.max(0,Math.floor(limit*.75))).map(r=>r.item),seen=new Set(selected);
  for(const item of items)if(selected.length<limit&&!seen.has(item)){selected.push(item);seen.add(item);}
  return selected;
}

/** Remove exact equivalent instance transforms BEFORE expensive evaluation.
 * The 12 rotation/mirror records contain only eight distinct XY transforms.
 * No global translation equivalence is assumed: obstacles and field bounds matter.
 */
export function uniqueAssignmentCandidates<T extends {tiles:PlacedTile[]}>(items:T[],models:TileModel[]):T[]{
  const byId=new Map(models.map(m=>[m.id,m])),seen=new Set<string>();
  return items.filter(item=>{
    const key=item.tiles.map(tile=>{
      const variant=byId.get(tile.id)?.variants[tile.variant];
      if(!variant)throw new Error("Missing candidate transform");
      const angle=variant.rotation*Math.PI/180,c=Math.round(Math.cos(angle)),s=Math.round(Math.sin(angle));
      const x=variant.mirror==="x"?-1:1,y=variant.mirror==="y"?-1:1;
      return [tile.id,tile.ix,tile.iy,tile.iz,tile.zLift??0,c*x,-s*y,s*x,c*y];
    }).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const signature=JSON.stringify(key);if(seen.has(signature))return false;seen.add(signature);return true;
  });
}
