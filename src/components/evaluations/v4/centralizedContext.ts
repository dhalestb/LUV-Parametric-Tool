import type {V4Context} from './evaluateV4';
import {platformBands} from './platformBands';
import {buildCirculationNetwork} from './circulation';
import {cellKey, type FloorField, type Level} from './surfaces';

/** Reconstruct only Centralized's level/network view; historical contexts remain intact. */
export function centralizedContext(ctx:V4Context):V4Context {
  const samples=ctx.field.samples.map(s=>({...s,levelId:-1}));
  const bands=platformBands(samples);
  const levels:Level[]=bands.map(b=>{
    const areaByClass={obstructed:0,sheltered:0,openVoid:0,exposed:0,uncertain:0};
    const centroid:[number,number,number]=[0,0,b.elevation];
    for(const id of b.sampleIds){const s=samples[id];s.levelId=b.id;areaByClass[s.floorClass]+=s.area;centroid[0]+=s.position[0]*s.area/b.area;centroid[1]+=s.position[1]*s.area/b.area;}
    return {...b,areaByClass,centroid};
  });
  const byCell=new Map<string,typeof samples>();
  for(const s of samples){const key=cellKey(s.ix,s.iy);const list=byCell.get(key)??[];list.push(s);byCell.set(key,list);}
  const field:FloorField={...ctx.field,samples,levels,byCell};
  return {...ctx,field,network:buildCirculationNetwork(field,ctx.grid)};
}
