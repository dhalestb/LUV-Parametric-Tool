const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {measure,verifyStrip,elevationGaps}=require('./geometry.cjs');
let C;
before(async()=>{const lib=await (await import('manifold-3d')).default();lib.setup();C=lib.CrossSection;});
const plane=(x0,y0,x1,y1,z)=>{const a=[x0,y0,z],b=[x1,y0,z],c=[x1,y1,z],d=[x0,y1,z];return [{a,b,c,normal:[0,0,1],id:1},{a,b:c,c:d,normal:[0,0,1],id:2}];};
const close=(v,target)=>assert.ok(Math.abs(v-target)<.002, v+' vs '+target);
test('a localized low beam changes only its projected area, even with duplicated floor faces',()=>{
 const samples=Array.from({length:100},(_,id)=>({position:[id%10+.5,Math.floor(id/10)+.5,0],clearance:id%10<2?5.85:10,triangleId:1,overheadTriangleId:3}));
 const floor=plane(0,0,10,10,0);
 const ctx={field:{samples,sampleFeet:1},mesh:{bounds:{max:[10,10,10]},triangles:[...floor,...floor,...plane(0,0,10,10,10),...plane(0,0,2,10,5.85)]}};
 const r=measure(C,ctx,{id:0,area:100,centroid:[5,5,0],sampleIds:samples.map((_,i)=>i)},{boundaryCells:samples.map(s=>s.position)});
 close(r.supportArea,100);close(r.clear7Area,80);close(r.low7Area,20);close(r.uncoveredArea,0);
 assert.ok(r.maxClearDiskDiameterFt>=7.98&&r.maxClearDiskDiameterFt<=8);
});
test('a sub-sample slit interrupts a crossing that looks supported at all sample centers',()=>{
 const grid={verticalIntersections:()=>[{normalZ:1,z:0}],segmentClear:()=>true};
 const ctx=triangles=>({grid,mesh:{triangles}});
 const a=[.5,1,0],b=[2.5,1,0];
 assert.ok(verifyStrip(C,ctx(plane(0,0,3,2,0)),a,b).pass);
 const result=verifyStrip(C,ctx([...plane(0,0,1.013,2,0),...plane(1.025,0,3,2,0)]),a,b);
 assert.equal(result.pass,false);close(result.missingFt2,.024);
});
test('clearance prism catches a thin blocking wall between sampled rays',()=>{
 const a=[1.001,.33,.02],b=[1.001,.46,.02],c=[1.001,.43,2];
 const grid={verticalIntersections:()=>[{normalZ:1,z:0}],segmentClear:()=>true};
 const result=verifyStrip(C,{grid,mesh:{triangles:[...plane(0,0,3,2,0),{a,b,c,normal:[1,0,0]}]}},[.5,1,0],[2.5,1,0]);
 assert.equal(result.pass,false);assert.equal(result.reason,'Source geometry intrudes into strip');
});
test('overlapping floors have no inferred vertical route; a continuous sloped face spans the gap',()=>{
 const floors=[...plane(0,0,10,10,0),...plane(0,0,10,10,4)];
 assert.deepEqual(elevationGaps(floors,0,4),[[0,4]]);
 assert.deepEqual(elevationGaps([...floors,{a:[0,0,0],b:[9,0,4],c:[9,1,4],normal:[-.4,0,.91]}],0,4),[]);
});
