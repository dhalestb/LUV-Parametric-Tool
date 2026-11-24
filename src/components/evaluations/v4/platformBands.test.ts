import assert from 'node:assert/strict';
import {it} from 'node:test';
import {platformBands} from './platformBands';
import type {FloorSample} from './surfaces';
function sample(id:number,z:number,area:number):FloorSample{return {id,ix:id,iy:0,position:[id,0,z],area,triangleId:0,clearance:7,overheadTriangleId:1,enclosure:1,floorClass:'sheltered',levelId:0,supported:true,roofLid:false};}
it('keeps two platforms distinct across a chain of stair treads',()=>{const s=[sample(0,0,100),...Array.from({length:11},(_,i)=>sample(i+1,(i+1)*.7,8)),sample(12,8.4,100)];const bands=platformBands(s);assert.equal(bands.filter(b=>b.kind==='platform').length,2);assert.equal(bands.filter(b=>b.kind==='transition').length,11);assert.equal(bands.flatMap(b=>b.sampleIds).length,s.length);});
it('anchors tolerance rather than transitively merging successive samples',()=>{assert.equal(platformBands([sample(0,0,20),sample(1,.1,20),sample(2,.2,20)]).length,2);});
it('does not classify seven-foot clearance as unusable',()=>{assert.equal(platformBands([sample(0,10,100)])[0].kind,'platform');});
it('preserves area and elevation under subdivision of sample support',()=>{const a=platformBands([sample(0,4,100)])[0],b=platformBands(Array.from({length:100},(_,i)=>sample(i,4,1)))[0];assert.equal(a.area,b.area);assert.equal(a.elevation,b.elevation);assert.equal(a.kind,b.kind);});
it('is deterministic under input reordering',()=>{const s=[sample(0,0,50),sample(1,10,50)];assert.deepEqual(platformBands(s),platformBands([...s].reverse()));});
