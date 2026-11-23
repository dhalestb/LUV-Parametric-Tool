import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {projectLayers} from './boardEvidence';
import {PALETTE,type EvidenceLayer} from './v4/evidence';

describe('evaluation edge visibility',()=>{
 it('keeps arrow shafts and heads while hiding segment and polyline edges',()=>{
  const base={color:PALETTE.gold,status:'measured',components:[] as string[],lineStyle:'solid',shown:1,total:1} as const;
  const layers:EvidenceLayer[]=[
   {...base,id:'arrow',label:'Arrow',kind:'arrow',arrows:[{a:[0,0,0],b:[10,0,0]}]},
   {...base,id:'edge',label:'Edge',kind:'segment',segments:[{a:[0,1,0],b:[10,1,0]}]},
   {...base,id:'path',label:'Path',kind:'polyline',polylines:[[[0,2,0],[10,2,0]]]},
  ];
  const map=(p:[number,number,number]):[number,number]=>[p[0],p[1]];
  const hidden=projectLayers(layers,map,null,{showEdges:false});
  assert.deepEqual(hidden.map(x=>x.id),['arrow']);
  assert.equal(hidden[0].lines.length,1);
  assert.equal(hidden[0].polygons.length,1);
  assert.deepEqual(projectLayers(layers,map,null,{showEdges:true}).map(x=>x.id),['arrow','edge','path']);
 });
});
