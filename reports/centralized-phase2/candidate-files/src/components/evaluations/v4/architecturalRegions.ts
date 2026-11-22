/** Phase 2 experiment. Never replaces the production circulation graph or score. */
import type { V4Context } from './evaluateV4';
import type { Vec3 } from './geometry';

export const ARCHITECTURAL_REGION_EXPERIMENT = 'architectural-regions-phase2-v1';
export type RegionExperimentOptions = { enabled: boolean; maxOpeningFeet?: number };
export type ArchitecturalRegion = { id: number; levelId: number; sampleIds: number[]; nodeIds: number[]; area: number; centroid: Vec3; transitional: boolean; segmentationStatus: 'inferred'; continuousFloorRegionIds: number[]; containsPreviouslyDiscardedSamples: boolean };
export type RegionConnection = {
  id: number; from: number; to: number; type: 'opening' | 'step' | 'vertical-chain' | 'shared-wall';
  status: 'verified' | 'inferred' | 'unknown'; navigable: boolean; location: Vec3; widthFeet: number | null;
  sampleNodePairs: Array<[number, number]>; chainNodeIds: number[]; sourceTriangleIds: number[]; reason: string;
};
type Wall = { nx: number; ny: number; offset: number; lo: number; hi: number; triangles: number[] };
type Cut = Wall & { levelId: number; type: 'physical' | 'opening'; id: number };
export type RegionReconstruction = {
  version: string; sourceId: string; sourceHash: string; regions: ArchitecturalRegion[];
  movementConnections: RegionConnection[]; organizationalRelationships: RegionConnection[];
  cuts: Cut[]; nodeRegionIds: number[]; originalRegions: number; originalRegionEdges: number;
  originalSampleNodes: number; originalSampleEdges: number; limitations: string[];
};
const dot = (p: Vec3, x: number, y: number) => p[0] * x + p[1] * y;

export function reconstructArchitecturalRegions(ctx: V4Context, options: RegionExperimentOptions): RegionReconstruction | null {
  if (!options.enabled) return null;
  const { mesh, field, network, grid } = ctx;
  const cuts: Cut[] = [];
  // Slice vertical source faces at a level-relative body height. Collinear wall
  // fragments supply both jambs for an inferred opening separator.
  for (const level of field.levels) {
    const z = level.elevation + 1.5;
    const groups = new Map<string, Wall[]>();
    for (const t of mesh.triangles) {
      if (Math.abs(t.normal[2]) > 0.15) continue;
      const points: Vec3[] = [];
      for (const [a, b] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]) {
        if (Math.abs(a[2]-b[2]) < 1e-8 || z < Math.min(a[2],b[2])-1e-7 || z > Math.max(a[2],b[2])+1e-7) continue;
        const s=(z-a[2])/(b[2]-a[2]); points.push([a[0]+s*(b[0]-a[0]),a[1]+s*(b[1]-a[1]),z]);
      }
      if (points.length < 2) continue;
      let nx=t.normal[0],ny=t.normal[1]; const length=Math.hypot(nx,ny);nx/=length;ny/=length;
      if(nx < -1e-8 || (Math.abs(nx)<1e-8 && ny<0)){nx=-nx;ny=-ny;}
      const offset=dot(points[0],nx,ny), axis=points.map(p=>dot(p,-ny,nx));
      if(Math.max(...axis)-Math.min(...axis)<0.01)continue;
      const key=`${Math.round(nx*10000)}:${Math.round(ny*10000)}:${Math.round(offset*100)}`;
      const list=groups.get(key)??[];list.push({nx,ny,offset,lo:Math.min(...axis),hi:Math.max(...axis),triangles:[t.id]});groups.set(key,list);
    }
    for(const walls of groups.values()){
      walls.sort((a,b)=>a.lo-b.lo||a.hi-b.hi);
      const merged:Wall[]=[];
      for(const wall of walls){const last=merged.at(-1);if(last&&wall.lo<=last.hi+0.05){last.hi=Math.max(last.hi,wall.hi);last.triangles.push(...wall.triangles);}else merged.push({...wall,triangles:[...wall.triangles]});}
      for(const wall of merged)cuts.push({...wall,levelId:level.id,type:'physical',id:cuts.length});
      for(let i=1;i<merged.length;i++){
        const a=merged[i-1],b=merged[i],gap=b.lo-a.hi;
        if(gap<0.5||gap>(options.maxOpeningFeet??8)||a.hi-a.lo<1||b.hi-b.lo<1)continue;
        cuts.push({...a,lo:a.hi,hi:b.lo,triangles:[...a.triangles,...b.triangles],levelId:level.id,type:'opening',id:cuts.length});
      }
    }
  }
  const crossing=(a:Vec3,b:Vec3,levelId:number)=>cuts.filter(c=>{
    if(c.levelId!==levelId)return false;
    const da=dot(a,c.nx,c.ny)-c.offset,db=dot(b,c.nx,c.ny)-c.offset;
    if(da*db>0||Math.abs(da-db)<1e-8)return false;
    const f=da/(da-db),p:Vec3=[a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1]),a[2]+f*(b[2]-a[2])];
    const along=dot(p,-c.ny,c.nx);return along>=c.lo-1e-6&&along<=c.hi+1e-6;
  });
  const accepted=network.nodes.filter(n=>n.levelId>=0),nodeRegionIds=network.nodes.map(()=>-1);
  const segmentation=new Map<number,number[]>();
  for(const edge of network.edges){const a=network.nodes[edge.a],b=network.nodes[edge.b];if(edge.kind!=='walk'||a.levelId!==b.levelId||crossing(a.position,b.position,a.levelId).length)continue; (segmentation.get(a.id)??segmentation.set(a.id,[]).get(a.id)!).push(b.id);(segmentation.get(b.id)??segmentation.set(b.id,[]).get(b.id)!).push(a.id);}
  const regions:ArchitecturalRegion[]=[];
  for(const node of accepted){if(nodeRegionIds[node.id]>=0)continue;const ids=[node.id];nodeRegionIds[node.id]=regions.length;for(let i=0;i<ids.length;i++)for(const next of segmentation.get(ids[i])??[]){if(nodeRegionIds[next]>=0)continue;nodeRegionIds[next]=regions.length;ids.push(next);}
    const samples=ids.map(id=>field.samples[network.nodes[id].sampleId]),area=samples.reduce((s,v)=>s+v.area,0);
    const centroid=[0,1,2].map(axis=>samples.reduce((s,v)=>s+v.area*v.position[axis],0)/area) as Vec3;
    regions.push({id:regions.length,levelId:node.levelId,nodeIds:ids,sampleIds:samples.map(s=>s.id),area,centroid,transitional:area<16,segmentationStatus:'inferred',continuousFloorRegionIds:[...new Set(ids.map(id=>network.nodes[id].regionId).filter(id=>id>=0))],containsPreviouslyDiscardedSamples:ids.some(id=>network.nodes[id].regionId<0)});
  }
  const connections:RegionConnection[]=[],byKey=new Map<string,RegionConnection>();
  const record=(a:number,b:number,type:RegionConnection['type'],status:RegionConnection['status'],navigable:boolean,location:Vec3,width:number|null,pair:[number,number],triangles:number[],keyExtra='',chain:number[]=[])=>{
    if(a<0||b<0||a===b)return;const lo=Math.min(a,b),hi=Math.max(a,b),key=`${lo}:${hi}:${type}:${keyExtra}`;
    const old=byKey.get(key);if(old){old.sampleNodePairs.push(pair);old.sourceTriangleIds=[...new Set([...old.sourceTriangleIds,...triangles])];return;}
    const c:RegionConnection={id:connections.length,from:lo,to:hi,type,status,navigable,location,widthFeet:width,sampleNodePairs:[pair],chainNodeIds:chain,sourceTriangleIds:[...new Set(triangles)],reason:type==='opening'?'Two collinear source wall fragments bound this gap; an original unobstructed movement edge crosses it. Width is measured along the source wall line; accessibility and door semantics are unverified.':type==='shared-wall'?'Source wall separates supported samples on opposite sides. This is shared-boundary evidence only; it establishes no navigable route.':type==='vertical-chain'?'Existing verified sample chain spans distinct levels.':'Original rise-limited, unobstructed step edge crosses region boundaries.'};connections.push(c);byKey.set(key,c);
  };
  const originalPairs=new Set<string>();
  for(const edge of network.edges){const a=network.nodes[edge.a],b=network.nodes[edge.b];if(a.regionId>=0&&b.regionId>=0&&a.regionId!==b.regionId)originalPairs.add([a.regionId,b.regionId].sort((a,b)=>a-b).join(':'));
    const ra=nodeRegionIds[a.id],rb=nodeRegionIds[b.id];if(ra===rb)continue;
    const boundaries=crossing(a.position,b.position,a.levelId),physical=boundaries.find(c=>c.type==='physical');
    const midpoint=a.position.map((v,i)=>(v+b.position[i])/2) as Vec3;
    if(physical){record(ra,rb,'shared-wall','inferred',false,midpoint,null,[a.id,b.id],physical.triangles,String(physical.id));continue;}
    const opening=boundaries.find(c=>c.type==='opening');
    if(opening){
      // Recheck a second body height; the shared movement edge tests 3 ft.
      const clear=[1.5,3,5.5].every(height=>grid.segmentClear([a.position[0],a.position[1],a.position[2]+height],[b.position[0],b.position[1],b.position[2]+height]));
      record(ra,rb,'opening',clear?'verified':'unknown',clear,midpoint,opening.hi-opening.lo,[a.id,b.id],opening.triangles,String(opening.id));
    }else if(edge.kind==='step') record(ra,rb,'step','verified',true,midpoint,null,[a.id,b.id],[field.samples[a.sampleId].triangleId,field.samples[b.sampleId].triangleId]);
    else record(ra,rb,'step','unknown',false,midpoint,null,[a.id,b.id],[]);
  }
  for(const link of network.levelLinks){if(link.status!=='verified'||link.chainNodeIds.length<2)continue;const chain=link.chainNodeIds;
    // Do not override a source-wall rejection along a chain.
    const obstructed=chain.slice(1).some((id,i)=>{const a=network.nodes[chain[i]],b=network.nodes[id];return crossing(a.position,b.position,a.levelId).some(c=>c.type==='physical');});
    if(obstructed)continue;const a=chain[0],b=chain.at(-1)!;
    record(nodeRegionIds[a],nodeRegionIds[b],'vertical-chain','verified',true,network.nodes[chain[Math.floor(chain.length/2)]].position,null,[a,b],chain.map(id=>field.samples[network.nodes[id].sampleId].triangleId),`${link.lowerLevelId}:${link.upperLevelId}`,[...chain]);
  }
  // A geometrically shared wall is organizational evidence even when no walk
  // edge crosses it. Nearby spaces without the intervening source wall do not qualify.
  for(const wall of cuts.filter(c=>c.type==='physical')){
    const bins=new Map<number,{negative:number[];positive:number[]}>();
    for(const node of accepted){if(node.levelId!==wall.levelId)continue;const d=dot(node.position,wall.nx,wall.ny)-wall.offset;
      const t=dot(node.position,-wall.ny,wall.nx);if(Math.abs(d)<1e-5||Math.abs(d)>field.sampleFeet*1.5||t<wall.lo||t>wall.hi)continue;
      const bin=Math.floor(t/field.sampleFeet),entry=bins.get(bin)??{negative:[],positive:[]};entry[d<0?'negative':'positive'].push(node.id);bins.set(bin,entry);
    }
    for(const bin of bins.values())for(const a of bin.negative)for(const b of bin.positive){
      const na=network.nodes[a],nb=network.nodes[b];
      const midpoint=na.position.map((v,i)=>(v+nb.position[i])/2) as Vec3;
      record(nodeRegionIds[a],nodeRegionIds[b],'shared-wall','verified',false,midpoint,null,[a,b],wall.triangles);
    }
  }
  return {version:ARCHITECTURAL_REGION_EXPERIMENT,sourceId:mesh.sourceId,sourceHash:mesh.sourceHash,regions,movementConnections:connections.filter(c=>c.navigable||c.status==='unknown'),organizationalRelationships:connections.filter(c=>c.type==='opening'||c.type==='shared-wall'),cuts,nodeRegionIds,originalRegions:network.regions.length,originalRegionEdges:originalPairs.size,originalSampleNodes:network.nodes.length,originalSampleEdges:network.edges.length,limitations:['Experimental geometry-supported regions, not semantic room recognition.','Wall-plane opening separators require two collinear wall fragments; unsupported or curved-wall transitions are left unsplit.','Connection verification is sampled geometry, not accessibility certification. Missing evidence remains unknown.','No organizational relationships inferred from mere proximity, floor overlap, or common projected coordinates.','Small components are retained as transitions. No production scores or gathering eligibility are changed.']};
}
