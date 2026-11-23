import type {RegionConnection,RegionReconstruction} from './architecturalRegions';

/** Count portal identities, not sample edges. One region-pair may have several
 * measured doorways, but routes sharing a bottleneck upstream count once.
 * A finite-width, occupant-safe route still requires separate geometric proof.
 */
export function destinationRoutes(reconstruction:Pick<RegionReconstruction,'regions'|'movementConnections'>,destination:number){
 const regions=reconstruction.regions;
 if(!regions.some(r=>r.id===destination))throw new Error('Unknown destination');
 const links=reconstruction.movementConnections.filter(c=>c.status==='verified'&&c.navigable);
 const ids=new Set(regions.map(r=>r.id));const adjacency=new Map<number,Set<number>>(regions.map(r=>[r.id,new Set()]));
 for(const c of links){if(!ids.has(c.from)||!ids.has(c.to))throw new Error('Link references unknown region');adjacency.get(c.from)!.add(c.to);adjacency.get(c.to)!.add(c.from);}
 const reached=new Set([destination]),queue=[destination];for(let i=0;i<queue.length;i++)for(const next of adjacency.get(queue[i])!){if(!reached.has(next)){reached.add(next);queue.push(next);}}
 // Neighbors that reconnect upstream are one corridor branch, even when the
 // destination has multiple portals to that shared corridor.
 const approachRegions=[...adjacency.get(destination)!].sort((a,b)=>a-b);
 const branchOf=new Map<number,number>();let branch=0;
 for(const start of approachRegions){if(branchOf.has(start))continue;const pending=[start];branchOf.set(start,branch);for(let i=0;i<pending.length;i++)for(const next of adjacency.get(pending[i])!){if(next===destination||branchOf.has(next))continue;branchOf.set(next,branch);pending.push(next);}branch++;}
 const unknownPairs=new Set(reconstruction.movementConnections.filter(c=>c.status==='unknown').map(c=>[Math.min(c.from,c.to),Math.max(c.from,c.to)].join(':')));
 const unknown=regions.filter(r=>r.id!==destination&&!reached.has(r.id));
 const connectedArea=regions.filter(r=>r.id!==destination&&reached.has(r.id)).reduce((s,r)=>s+r.area,0);
 const unknownArea=unknown.reduce((s,r)=>s+r.area,0);
 return {approachRegions,approachCount:branch,reachedRegionIds:[...reached].sort((a,b)=>a-b),connectedArea,unknownArea,unknownBoundaryRecords:unknownPairs.size,
  // Missing edges in arbitrary OBJ geometry are not evidence of physical disconnection.
  disconnectedArea:0,reachabilityStatus:unknownArea?'bounded':'verified-within-sampled-graph'};
}
