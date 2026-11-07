// Analytic safeguards only; these are not real-OBJ connector success evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
async function main(){
await load('extensionReconstruction').initializeExtensionReconstruction();
const positions=[],faces=[];
for(let x=0;x<=12;x++)for(const [y,z]of [[-.65,-.4],[.65,-.4],[.65,0],[-.65,0]])positions.push(x,y,z);
for(let x=0;x<12;x++)for(let k=0;k<4;k++){const a=x*4+k,b=x*4+(k+1)%4,c=b+4,d=a+4;faces.push({vertices:[a,b,c],normals:null},{vertices:[a,c,d],normals:null});}
faces.push({vertices:[3,2,1],normals:null},{vertices:[3,1,0],normals:null},{vertices:[48,49,50],normals:null},{vertices:[48,50,51],normals:null});
const model=load('analyze').analyzeMesh({id:'analytic-branch',filename:'analytic-only',positions:Float32Array.from(positions),normals:new Float32Array(),faces,groups:[],suggestedSlotId:null,upAxis:'z'},null,1,'z');
const branch=load('architecturalSurfaces').architecturalSurfaces(model).find(r=>r.role==='projecting branch');assert(branch);
const original=model.connectionSurface.positions.slice(),indices=model.connectionSurface.triangles.slice();
const plan={region:branch.region,end:1,widening:.5,extension:0,redirection:0,elevation:0};
const result=load('branchAdaptation').adaptBranch(model,plan);assert(result.valid,result.reason);
const tile={id:model.id,ix:0,iy:0,iz:0,variant:0},point=[4,0,.4],outward=[1,0,0];
assert.equal(load('walkingApproach').validateWalkingApproach(model,tile,point,outward,2.1,2,[model],[tile],[]).valid,false);
assert.equal(load('walkingApproach').validateWalkingApproach(result.model,tile,point,outward,2.1,2,[result.model],[tile],[]).valid,true);
console.log('PASS bounded widening creates full required walking footprint on analytic branch');
assert.deepEqual(model.connectionSurface.positions,original);assert.deepEqual(result.model.connectionSurface.triangles,indices);assert.deepEqual(result.model.anchor,model.anchor);
const changed=new Set(result.provenance.changedVertices);for(let i=0;i<original.length;i++)if(!changed.has(Math.floor(i/3)))assert.equal(result.model.connectionSurface.positions[i],original[i]);
console.log('PASS original source, topology, datum and unaffected vertices remain exact');
for(const change of [{extension:.25},{extension:-.5},{redirection:.2},{elevation:.1},{flattenUpper:true}]){const attempt=load('branchAdaptation').adaptBranch(model,{...plan,...change});assert(attempt.valid,attempt.reason);assert(attempt.provenance.maximumDisplacement<=1.5);}
assert(load('branchAdaptation').branchAdjustmentPlans(branch).some(p=>p.extension<0));
console.log('PASS bounded extension, redirection, elevation and contour correction construct independently audited working copies');
assert.equal(load('branchAdaptation').adaptBranch(model,{...plan,widening:2}).valid,false);
assert.equal(load('branchAdaptation').adaptBranch(model,{...plan,elevation:.3}).valid,false);
assert.equal(load('branchAdaptation').adaptBranch(model,{...plan,redirection:NaN}).valid,false);
console.log('PASS excessive displacement requests and nonfinite parameters rejected');
const open={...model,connectionSurface:{positions:original,triangles:indices.slice(0,-6)}};
assert.equal(load('branchAdaptation').adaptBranch(open,plan).valid,false);
console.log('PASS unsupported open material cannot be silently repaired or accepted');
assert.equal(result.provenance.walkingSuitability,'UNVERIFIED');assert.equal(result.provenance.structuralCapacity,'UNVERIFIED');
console.log('PASS reconstruction alone does not claim circulation or structural feasibility');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
