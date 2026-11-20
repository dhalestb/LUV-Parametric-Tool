import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {visualHotspots} from './visualHotspots';
import type {NetworkNode} from './circulation';
import type {SightRay} from './visibility';

describe('visual hotspots',()=>{
 it('selects one largest visually connected region on each floor and its strongest sampled position',()=>{
  const node=(id:number,levelId:number,regionId:number):NetworkNode=>({id,levelId,regionId,sampleId:id,position:[id,0,levelId*10],systemId:0,degree:0});
  const nodes=[node(1,0,1),node(2,0,1),node(3,0,1),node(4,0,2),node(5,0,2),node(6,1,3),node(7,1,3),node(8,1,4)];
  const ray=(a:NetworkNode,b:NetworkNode,clear=true):SightRay=>({a:[a.position[0],0,a.position[2]+5.5],b:[b.position[0],0,b.position[2]+5.5],clear,blockedAt:clear?null:[0,0,0],fromLevelId:a.levelId,toLevelId:b.levelId,fromRegionId:a.regionId,toRegionId:b.regionId});
  const rays=[ray(nodes[0],nodes[1]),ray(nodes[2],nodes[1]),ray(nodes[3],nodes[4]),ray(nodes[5],nodes[6]),ray(nodes[6],nodes[7],false)];
  const found=visualHotspots(nodes,rays,5.5);
  assert.deepEqual(found.map(x=>[x.levelId,x.regionId,x.locations,x.best.id,x.bestConnections]),[[0,1,3,2,2],[1,3,2,6,1]]);
  assert.deepEqual(visualHotspots(nodes,[],5.5),[]);
 });
});
