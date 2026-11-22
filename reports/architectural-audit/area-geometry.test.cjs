require('../../scripts/ts-test-register.cjs');
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {usableGatheringArea}=require('../../src/components/evaluations/v4/usableGatheringArea.ts');
let lib;
before(async()=>{lib=await (await import('manifold-3d')).default();lib.setup();});
function platform(x,y,w,h,z,slope=0){
    const at=(u,v)=>[u,v,z+(u-x)*slope];
    const a=at(x,y),b=at(x+w,y),c=at(x+w,y+h),d=at(x,y+h);
    return [{a,b,c,normal:[-slope,0,1]},{a,b:c,c:d,normal:[-slope,0,1]}];
}
function measure(mesh,centers){
    return usableGatheringArea(lib,mesh,centers.map(([x,y,triangleId])=>({position:[x,y,0],triangleId})),1);
}
function near(a,b){assert.ok(Math.abs(a-b)<.0001,a+' vs '+b);}
test('a one-foot-wide L keeps both arms and excludes the missing corner',()=>{
    const mesh=[...platform(0,0,3,1,0),...platform(0,1,1,2,0)];
    const cells=Array.from({length:9},(_,i)=>[i%3+.5,Math.floor(i/3)+.5,0]);
    const area=measure(mesh,cells);
    near(area.area,5);near(area.total,5);
});
test('local low overhead removes only its footprint; disconnected leftovers stay separate',()=>{
    const mesh=[...platform(0,0,4,1,0),...platform(1,0,1,1,6),...platform(0,0,4,1,7)];
    const area=measure(mesh,Array.from({length:4},(_,i)=>[i+.5,.5,0]));
    near(area.area,2);near(area.total,3);
});
test('adjacent planar and sloping surfaces join at a measured common edge',()=>{
    const mesh=[...platform(0,0,1,1,0),...platform(1,0,1,1,0,.25)];
    near(measure(mesh,[[.5,.5,0],[1.5,.5,2]]).area,2);
});
test('corner contacts and overlapping levels do not pool disconnected gathering capacity',()=>{
    const diagonal=[...platform(0,0,1,1,0),...platform(1,1,1,1,0)];
    const stacked=[...platform(0,0,1,1,0),...platform(0,0,1,1,10)];
    for(const [mesh,cells] of [[diagonal,[[.5,.5,0],[1.5,1.5,2]]],[stacked,[[.5,.5,0],[.5,.5,2]]]]){
        const r=measure(mesh,cells);near(r.total,2);near(r.area,1);
    }
});
