// Analytic search/cache checks. Real uploaded mesh evidence is collected separately.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(__dirname,'../src/components/lattice',n+'.ts'));
const mesh=load('parseObj').parseObj('v -8 -4 0\nv 8 -4 0\nv 8 4 0\nv -8 4 0\nv -8 -4 1\nv 8 -4 1\nv 8 4 1\nv -8 4 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8','analytic-search.obj');
const model={...load('analyze').analyzeMesh(mesh,null,1,'z'),id:'A'};
const tile={id:'A',ix:0,iy:0,iz:0,variant:0,zLift:0};
const jobs=model.variants.map((_,variant)=>({tiles:[{...tile,variant}]}));
assert.equal(load('assignmentGuidance').uniqueAssignmentCandidates(jobs,[model]).length,8);
assert.equal(load('assignmentGuidance').uniqueAssignmentCandidates([...jobs,...jobs.map(j=>({tiles:j.tiles.map(t=>({...t,ix:1}))}))],[model]).length,16);
console.log('PASS equivalent mirror/rotation deduplication preserves different lattice positions');
const check=load('walkingApproach').validateSourceApproach;
const top=Math.max(...Array.from(model.connectionSurface.positions).filter((_,i)=>i%3===2));
const p=[8,0,top],d=[1,0,0];
assert.equal(check(model,tile,p,d,2.5).valid,true);
assert.equal(check(model,tile,p,d,2.5).cacheHit,true);
for(let variant=0;variant<model.variants.length;variant++){
  const placed={...tile,variant,ix:4,iy:6};
  const world=load('surfaceAttachment').worldFromLocal(p,placed,model);
  const tip=load('surfaceAttachment').worldFromLocal(p.map((v,i)=>v+d[i]),placed,model);
  assert.equal(check(model,placed,world,tip.map((v,i)=>v-world[i]),2.5).valid,true);
}
assert.equal(check(model,tile,p,d,12).valid,false);
console.log('PASS source approach is transform-invariant; width changes cannot reuse its result');
const before=check(model,tile,p,d,2.5);
for(let i=2;i<model.connectionSurface.positions.length;i+=3)model.connectionSurface.positions[i]+=1;
assert.equal(check(model,tile,p,d,2.5).valid,false);
assert.equal(before.valid,true);
console.log('PASS in-place geometry revision invalidates a cached approach');
async function main(){
 const search=load('assignmentSearch').searchAssignmentCopies;
 const other={...model,id:'B'},pool=[model,other],field={cellsX:8,cellsY:8,cellsZ:1},ids=new Set(['A','B']);
 await assert.rejects(search(pool,2,{cancelled:()=>true,onProgress:()=>{}},'copies-2',field,pool,ids,{guided:true,perStage:2,candidates:2,milliseconds:1000}),/cancelled/);
 await assert.rejects(search(pool,2,{cancelled:()=>false,onProgress:()=>{}},'copies-2',field,pool,ids,{guided:true,perStage:0,candidates:2,milliseconds:1000}),/Invalid bounded/);
 console.log('PASS cancellation and invalid budgets do not emit a result');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
