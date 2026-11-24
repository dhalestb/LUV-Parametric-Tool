import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {buildV4Context} from './evaluateV4.ts';
import {reconstructArchitecturalRegions} from './architecturalRegions.ts';
import {shortestPaths,pathTo} from './circulation.ts';

export function roomFixture(partitions: Array<{x:number; gaps:Array<[number,number]>;height?:number}>=[],size=30){
  const positions:number[]=[],faces:Array<{vertices:number[]}>=[];
  const quad=(...points:number[][])=>{const vertices=points.map(p=>{positions.push(...p);return positions.length/3-1;});faces.push({vertices});};
  const wall=(x:number,a:number,b:number,height=12)=>quad([x,a,0],[x,b,0],[x,b,height],[x,a,height]);
  quad([0,0,0],[size,0,0],[size,size,0],[0,size,0]);quad([0,0,12],[size,0,12],[size,size,12],[0,size,12]);
  wall(0,0,size);wall(size,0,size);quad([0,0,0],[size,0,0],[size,0,12],[0,0,12]);quad([0,size,0],[size,size,0],[size,size,12],[0,size,12]);
  for(const p of partitions){let y=0;for(const [a,b]of p.gaps){wall(p.x,y,a,p.height);y=b;}wall(p.x,y,size,p.height);}
  return {positions:Float32Array.from(positions),faces,up:'z' as const,unitScale:1};
}
const run=(source:ReturnType<typeof roomFixture>)=>reconstructArchitecturalRegions(buildV4Context(source,'fixture'),{enabled:true})!;
function slabSource(slabs:number[][]){const positions:number[]=[],faces:Array<{vertices:number[]}>=[];for(const [z,x0,x1,y0,y1]of slabs){const ids=[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]].map(p=>{positions.push(...p);return positions.length/3-1;});faces.push({vertices:ids});}return {positions:Float32Array.from(positions),faces,up:'z' as const,unitScale:1};}
function addQuad(source:ReturnType<typeof roomFixture>,points:number[][]){const start=source.positions.length/3;source.positions=Float32Array.from([...source.positions,...points.flat()]);source.faces.push({vertices:[0,1,2,3].map(i=>start+i)});return source;}
describe('experimental architectural segmentation',()=>{
  it('is disabled unless explicitly enabled',()=>assert.equal(reconstructArchitecturalRegions(buildV4Context(roomFixture(),'flag'),{enabled:false}),null));
  it('leaves an unpartitioned open room intact',()=>{const r=run(roomFixture());assert.equal(r.regions.length,1);assert.equal(r.movementConnections.length,0);});
  it('preserves two rooms and one verified doorway',()=>{const r=run(roomFixture([{x:15,gaps:[[13,17]]}]));assert.equal(r.regions.length,2);assert.equal(r.movementConnections.length,1);const c=r.movementConnections[0];assert.equal(c.type,'opening');assert.equal(c.status,'verified');assert.equal(c.widthFeet,4);assert.ok(c.sourceTriangleIds.length>0);assert.ok(c.sampleNodePairs.length>0);});
  it('keeps a sealed partition closed',()=>{const r=run(roomFixture([{x:15,gaps:[]}]));assert.equal(r.regions.length,2);assert.equal(r.movementConnections.length,0);});
  it('preserves multiple doorways independently',()=>{const r=run(roomFixture([{x:15,gaps:[[5,9],[20,24]]}]));assert.equal(r.regions.length,2);assert.equal(r.movementConnections.filter(c=>c.status==='verified').length,2);});
  it('identifies a linear sequence without merging its rooms',()=>{const r=run(roomFixture([{x:10,gaps:[[13,17]]},{x:20,gaps:[[13,17]]}]));assert.equal(r.regions.length,3);assert.equal(r.movementConnections.length,2);});
  it('does not invent a closure for an unsupported partial partition',()=>{const r=run(roomFixture([{x:15,gaps:[[0,14]]}]));assert.equal(r.regions.length,1);});
  it('preserves a narrow supported passage',()=>{const r=run(roomFixture([{x:15,gaps:[[14,16]]}]));assert.equal(r.regions.length,2);assert.equal(r.movementConnections[0].widthFeet,2);});
  it('retains sub-16 sq ft transition regions and their connections',()=>{const r=run(roomFixture([{x:3,gaps:[[1,3]]},{x:5,gaps:[[1,3]]}],6));assert.ok(r.regions.some(v=>v.transitional));assert.ok(r.movementConnections.length>0);});
  it('does not use a low physical partition as a verified doorway',()=>{const r=run(roomFixture([{x:15,gaps:[],height:2}]));assert.equal(r.regions.length,2);assert.equal(r.movementConnections.filter(c=>c.status==='verified').length,0);assert.ok(r.organizationalRelationships.some(c=>c.type==='shared-wall'));});
  it('is deterministic and preserves the source buffers',()=>{const s=roomFixture([{x:15,gaps:[[13,17]]}]),before=Array.from(s.positions);assert.deepEqual(run(s),run(s));assert.deepEqual(Array.from(s.positions),before);});
  it('preserves verified sampled stair chains between levels',()=>{
    const slabs=[[0,0,20,0,16]];for(let i=1;i<=12;i++)slabs.push([i*.7,20+(i-1)*3,20+i*3,4,12]);slabs.push([8.4,56,76,0,16]);
    const source=slabSource(slabs),ctx=buildV4Context(source,'stairs');
    const first=ctx.network.nodes.find(n=>n.position[2]===0)!,last=ctx.network.nodes.find(n=>Math.abs(n.position[2]-8.4)<.01)!;
    const route=shortestPaths(ctx.network,[first.id]);assert.ok(Number.isFinite(route.dist[last.id]),'source sample graph must support the complete stair route');
    // Supply the known platform level metadata. The shared production elevation
    // clustering merges closely spaced tread elevations; Phase 2 must preserve
    // an existing verified chain when supplied, without changing that extractor.
    ctx.network.levelLinks=[{lowerLevelId:0,upperLevelId:1,status:'verified',chainNodeIds:pathTo(route.prev,last.id),anchor:null}];
    const r=reconstructArchitecturalRegions(ctx,{enabled:true})!;
    assert.ok(r.movementConnections.some(c=>c.type==='step'&&c.status==='verified'));
    assert.ok(r.movementConnections.some(c=>c.type==='vertical-chain'&&c.status==='verified'&&c.chainNodeIds.length>1));
  });
  it('does not create vertical access from overlapping plates',()=>{
    const r=run(slabSource([[0,0,20,0,20],[10,10,30,0,20]]));
    assert.equal(r.movementConnections.filter(c=>c.status==='verified').length,0);
  });
  it('does not invent an organizational center or arbitrary subdivisions around an atrium',()=>{
    const r=run(slabSource([[0,0,10,0,30],[0,20,30,0,30],[0,10,20,0,10],[0,10,20,20,30]]));
    assert.equal(r.regions.length,1);assert.equal(r.organizationalRelationships.length,0);assert.equal(r.movementConnections.length,0);
  });
  it('preserves separate wings without inventing proximity connections',()=>{
    const r=run(slabSource([[0,0,20,0,20],[0,25,45,0,20]]));assert.equal(r.regions.length,2);assert.equal(r.movementConnections.length,0);
  });
  it('uses shared wall evidence without equating it to circulation',()=>{const r=run(roomFixture([{x:15,gaps:[]}]));assert.ok(r.organizationalRelationships.some(c=>c.type==='shared-wall'&&c.status==='verified'&&!c.navigable));assert.equal(r.movementConnections.length,0);});
  it('retains three separate rooms opening onto a common corridor',()=>{
    const s=roomFixture([],40);for(const [a,b]of [[0,4],[8,16],[20,28],[32,40]])addQuad(s,[[a,8,0],[b,8,0],[b,8,12],[a,8,12]]);
    for(const x of [13,26])addQuad(s,[[x,8,0],[x,40,0],[x,40,12],[x,8,12]]);
    const r=run(s);assert.equal(r.regions.length,4);assert.equal(r.movementConnections.filter(c=>c.type==='opening'&&c.status==='verified').length,3);
  });
  it('classifies a low-headroom gap as unknown rather than verified walking',()=>{
    const s=roomFixture([{x:15,gaps:[[13,17]]}]);addQuad(s,[[15,13,4],[15,17,4],[15,17,12],[15,13,12]]);
    const r=run(s);assert.equal(r.movementConnections.filter(c=>c.status==='verified').length,0);assert.ok(r.movementConnections.some(c=>c.status==='unknown'));
  });
  it('detects a rotated planar partition without typology or axis-specific rules',()=>{
    const s=roomFixture([{x:15,gaps:[[13,17]]}]);for(let i=0;i<s.positions.length;i+=3){const x=s.positions[i],y=s.positions[i+1];s.positions[i]=x*Math.cos(Math.PI/6)-y*Math.sin(Math.PI/6);s.positions[i+1]=x*Math.sin(Math.PI/6)+y*Math.cos(Math.PI/6);}
    const r=run(s);assert.equal(r.regions.filter(v=>!v.transitional).length,2);assert.equal(r.movementConnections.filter(c=>c.type==='opening'&&c.status==='verified').length,1);
  });
  it('retains every original movement node exactly once without changing its graph',()=>{
    const ctx=buildV4Context(roomFixture([{x:15,gaps:[[13,17]]}]),'preservation'),original=JSON.stringify(ctx.network);
    const r=reconstructArchitecturalRegions(ctx,{enabled:true})!,ids=r.regions.flatMap(v=>v.nodeIds);
    assert.equal(ids.length,ctx.network.nodes.length);assert.equal(new Set(ids).size,ids.length);assert.equal(JSON.stringify(ctx.network),original);
    assert.ok(r.regions.every(v=>v.sampleIds.length===v.nodeIds.length&&v.continuousFloorRegionIds.length>0));
  });
});
