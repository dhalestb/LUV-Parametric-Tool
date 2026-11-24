import type { NetworkNode } from './circulation';
import type { SightRay } from './visibility';

/** One region per level: most viewing positions with a clear tested sightline.
 * Ties use region ID; the gold point has the most distinct clear connections,
 * with node ID as the deterministic tie breaker. Both ray endpoints count.
 */
export function visualHotspots(origins:NetworkNode[],rays:SightRay[],eyeHeight:number) {
  const key=(p:readonly number[])=>p.map(v=>v.toFixed(6)).join(',');
  const nodes=new Map(origins.map(n=>[key([n.position[0],n.position[1],n.position[2]+eyeHeight]),n]));
  const connections=new Map<number,Set<number>>();
  for(const ray of rays){
    if(!ray.clear)continue;
    const a=nodes.get(key(ray.a)),b=nodes.get(key(ray.b));
    if(!a||!b||a.id===b.id)continue;
    (connections.get(a.id)??connections.set(a.id,new Set()).get(a.id)!).add(b.id);
    (connections.get(b.id)??connections.set(b.id,new Set()).get(b.id)!).add(a.id);
  }
  const groups=new Map<string,NetworkNode[]>();
  for(const n of origins){
    if(n.regionId<0||!connections.get(n.id)?.size)continue;
    const id=`${n.levelId}:${n.regionId}`;
    (groups.get(id)??groups.set(id,[]).get(id)!).push(n);
  }
  const bestByLevel=new Map<number,NetworkNode[]>();
  for(const group of groups.values()){
    const previous=bestByLevel.get(group[0].levelId);
    if(!previous||group.length>previous.length||(group.length===previous.length&&group[0].regionId<previous[0].regionId))bestByLevel.set(group[0].levelId,group);
  }
  return [...bestByLevel.entries()].sort((a,b)=>a[0]-b[0]).map(([levelId,group])=>{
    const best=[...group].sort((a,b)=>(connections.get(b.id)?.size??0)-(connections.get(a.id)?.size??0)||a.id-b.id)[0];
    return {levelId,regionId:best.regionId,locations:group.length,best,bestConnections:connections.get(best.id)!.size};
  });
}
