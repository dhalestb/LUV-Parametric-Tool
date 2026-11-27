import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import type {DescriptorSource} from '../objDescriptorAnalysis.ts';
import {evaluateOpenVolumeDescriptor} from './evaluateV4.ts';
import {openVolumeSummary} from '../openVolumeSummary.ts';

function fixture(){
 const source:DescriptorSource={positions:[],faces:[],up:'z',unitScale:1},positions=source.positions as number[];
 const quad=(...points:number[][])=>source.faces.push({vertices:points.map(p=>{positions.push(...p);return positions.length/3-1;})});
 const room=(x:number,w:number,d:number,h=7)=>{
  quad([x,0,0],[x+w,0,0],[x+w,d,0],[x,d,0]);quad([x,0,h],[x+w,0,h],[x+w,d,h],[x,d,h]);
  quad([x,0,0],[x+w,0,0],[x+w,0,h],[x,0,h]);quad([x,d,0],[x+w,d,0],[x+w,d,h],[x,d,h]);
  quad([x,0,0],[x,d,0],[x,d,h],[x,0,h]);quad([x+w,0,0],[x+w,d,0],[x+w,d,h],[x+w,0,h]);
 };return{source,room};
}
describe('Open Volume 400 ft² calibration',()=>{
 it('credits a measured 100 ft² field at 25, a 400 ft² field at 100, and caps larger fields',()=>{
  for(const [size,area,score]of [[20,100,25],[30,400,100],[35,625,100],[9,0,0]]){
   const f=fixture();f.room(0,size,size);const before=JSON.stringify(f.source),r=evaluateOpenVolumeDescriptor(f.source,'reference-'+size);
   assert.equal(r.evidence.measurements.continuousFieldFloorFt2,area);assert.equal(r.evidence.measurements.continuousFieldVolumeFt3,area*7);assert.equal(r.absoluteScore,score);assert.equal(JSON.stringify(f.source),before);
  }
 });
 it('uses the continuous field rather than the equal total of disconnected fields',()=>{
  const one=fixture(),two=fixture();one.room(0,20,30);two.room(0,20,20);two.room(40,20,20);
  const a=evaluateOpenVolumeDescriptor(one.source,'continuous'),b=evaluateOpenVolumeDescriptor(two.source,'fragmented');
  assert.equal(a.evidence.measurements.totalQualifyingVolumeFt3,1400);assert.equal(b.evidence.measurements.totalQualifyingVolumeFt3,1400);
  assert.equal(a.absoluteScore,50);assert.equal(b.absoluteScore,25);
 });
 it('keeps the share diagnostic unweighted and gives no extra credit for height or added nonqualifying floor',()=>{
  const base=fixture(),tall=fixture(),extra=fixture();base.room(0,20,20);tall.room(0,20,20,14);extra.room(0,20,20);extra.room(40,30,30,6.5);
  const a=evaluateOpenVolumeDescriptor(base.source,'base'),b=evaluateOpenVolumeDescriptor(tall.source,'tall'),c=evaluateOpenVolumeDescriptor(extra.source,'extra');
  assert.equal(a.absoluteScore,25);assert.equal(b.absoluteScore,25);assert.equal(c.absoluteScore,25);
  assert.notEqual(a.evidence.components[0].raw,c.evidence.components[0].raw);assert.equal(c.evidence.components[0].weight,0);assert.equal(c.evidence.components[1].weight,1);
  assert.equal(a.evidence.measurements.qualifyingVolumeHeightFt,7);
 });
 it('explains the new calibration only for its own version, retaining historical summaries',()=>{
  const f=fixture();f.room(0,20,20);const m=evaluateOpenVolumeDescriptor(f.source,'summary').evidence.measurements;
  assert(openVolumeSummary(m,'v4.7.0').at(-1)!.includes('2,800 ft³'));
  assert.equal(openVolumeSummary(m,'v4.6.0').length,4);assert.equal(openVolumeSummary(m).length,4);
 });
});
