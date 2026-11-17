require('./ts-test-register.cjs');
const Loader=require('node:module');const resolve=Loader._resolveFilename;
Loader._resolveFilename=function(id,...args){return resolve.call(this,id==='manifold-3d/manifold'?'manifold-3d/manifold.js':id,...args)};
const root=require('node:path').resolve(__dirname,'..')+'/';
const {buildConnectionWorkflow}=require(root+'src/components/letterIntersectionSpaces.ts');
const baselineSource=require('node:child_process').execFileSync('git',['show','d6ab92b:src/components/letterIntersectionSpaces.ts'],{cwd:root,encoding:'utf8'});
const baseline=new Loader(root+'src/components/phase2-baseline.ts',module);baseline.filename=root+'src/components/phase2-baseline.ts';baseline.paths=Loader._nodeModulePaths(root+'src/components');
baseline._compile(require('typescript').transpileModule(baselineSource,{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,baseline.filename);
const {DEFAULT_FACE_BRIDGES}=require(root+'src/components/faceBridges.ts');
const assert=require('node:assert/strict');
(async()=>{
 const {default:Module}=await import(require('node:url').pathToFileURL(root+'node_modules/manifold-3d/manifold.js').href);const wasm=await Module();wasm.setup();
 const mixed=['U','L','V'].map((letter,z)=>({letter,x:0,y:0,z,rx:0,ry:0,rz:0,scale:1,scaleX:1,scaleY:1,scaleZ:1}));
 const original=await baseline.exports.buildConnectionWorkflow(mixed,12,DEFAULT_FACE_BRIDGES,'stepped-amphitheater');
 const current=await buildConnectionWorkflow(mixed,12,DEFAULT_FACE_BRIDGES,'stepped-amphitheater');
 assert.deepEqual(current.variants,original.variants);console.log('PASS mixed-letter 20-foot checkpoint equivalence');
 const placements=Array.from({length:12},(_,z)=>({letter:'U',x:0,y:0,z:z*3,rx:0,ry:0,rz:0,scale:12,scaleX:1,scaleY:1,scaleZ:1}));
 for(const typology of ['contained-room-within-volume','stepped-amphitheater']){
 for(const height of [20,40,60]){
 const d=await buildConnectionWorkflow(placements,12,DEFAULT_FACE_BRIDGES,typology,undefined,undefined,undefined,undefined,height);
 const bounds=m=>[0,1,2].map(axis=>{const v=m.positions.filter((_,i)=>i%3===axis);return [Math.min(...v),Math.max(...v)];});
 const enclosure=bounds(d.enclosure);assert.deepEqual(enclosure.map(b=>Math.round(b[1]-b[0])),[20,20,height]);
 for(const [name,m] of Object.entries(d.variants)){
 assert(m.indices.length>0);assert(m.positions.every(Number.isFinite));
 const solid=new wasm.Manifold(new wasm.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)}));assert.equal(solid.status(),'NoError');assert(solid.volume()>0);if(name==='combined'&&height>20){const parts=solid.decompose();console.log('component volumes',parts.map(p=>p.volume()));for(const p of parts)if(p!==solid)p.delete();}solid.delete();
 assert.equal(m.components,1);
 const b=bounds(m);if(name==='letters'&&typology==='contained-room-within-volume')assert(Math.abs(b[2][1]-b[2][0]-height)<1e-4);b.forEach((v,i)=>{assert(v[0]>=enclosure[i][0]-1e-4);assert(v[1]<=enclosure[i][1]+1e-4)});
 console.log(JSON.stringify({typology,height,name,span:b.map(v=>v[1]-v[0]),volume:m.volume,components:m.components}));
 }
 if(height===20){const legacy=await baseline.exports.buildConnectionWorkflow(placements,12,DEFAULT_FACE_BRIDGES,typology);assert.deepEqual(d.variants,legacy.variants);}
 }
 }
})().catch(e=>{console.error(e);process.exitCode=1});
