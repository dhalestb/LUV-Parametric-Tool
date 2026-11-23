import assert from 'node:assert/strict';
import {it} from 'node:test';
import {buildV4Context} from './evaluateV4';
import {centralizedContext} from './centralizedContext';

it('reconstructs platform elevations without mutating historical context or losing stair nodes',()=>{
  const positions:number[]=[],faces:Array<{vertices:number[]}>=[];
  const slab=(z:number,x0:number,x1:number,y0:number,y1:number)=>{const start=positions.length/3;positions.push(x0,y0,z,x1,y0,z,x1,y1,z,x0,y1,z);faces.push({vertices:[start,start+1,start+2,start+3]});};
  slab(0,0,20,0,16);for(let i=1;i<=12;i++)slab(i*.7,20+(i-1)*3,20+i*3,4,12);slab(8.4,56,76,0,16);
  const source={positions:Float32Array.from(positions),faces,up:'z' as const,unitScale:1};
  const old=buildV4Context(source,'platform-regression');const before=JSON.stringify({field:old.field,network:old.network});
  const next=centralizedContext(old);assert.equal(JSON.stringify({field:old.field,network:old.network}),before);
  assert.ok(next.field.levels.some(l=>Math.abs(l.elevation)<.01));assert.ok(next.field.levels.some(l=>Math.abs(l.elevation-8.4)<.01));
  assert.ok(next.field.levels.every(l=>l.maxZ-l.minZ<=.125001));
  assert.ok(next.network.nodes.length>=old.network.nodes.length);
  assert.ok(next.network.levelLinks.some(l=>l.status==='verified'),'vertical links must be detected without injected metadata');
});
