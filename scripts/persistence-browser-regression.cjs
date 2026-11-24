// Isolated native-browser IndexedDB regression. Never reads the user's browser profile.
/* eslint-disable @typescript-eslint/no-require-imports -- Existing dependency-free CommonJS test harness. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const collection = path.join(root, 'local-test-data/architectural-objs');
const files = fs.readdirSync(collection).filter(n => n.endsWith('.obj'));
const modules = Object.fromEntries(['projectStorage', 'parseObj', 'slots'].map(name => {
  const text = fs.readFileSync(path.join(root, 'src/components/lattice', name + '.ts'), 'utf8');
  return ['/' + name, ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText];
}));
const client = String.raw`
import * as storage from '/projectStorage';
import {parseObj} from '/parseObj';
import {LATTICE_SLOTS} from '/slots';
const output=document.querySelector('pre');
const results=[];
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',reason:String(e)});}output.textContent=JSON.stringify(results,null,2);};
const equal=(a,b)=>check(storage.encodeProjectState(a)===storage.encodeProjectState(b),'Full serialized state differs');
let state,file;
async function run(){
document.querySelector('button').disabled=true;
const started=performance.now();
const deadline=started+300000;
const names=await(await fetch('/inventory')).json();
const meshes=[];
for(const name of names){
if(performance.now()>deadline)throw new Error('Five-minute bounded regression deadline exceeded');
output.textContent='Reading candidate OBJ collection: '+name;
const bytes=new Uint8Array(await(await fetch('/fixture/'+encodeURIComponent(name))).arrayBuffer());
const mesh=parseObj(new TextDecoder().decode(bytes),name);
mesh.originalObjBytes=bytes;mesh.sourceSHA256=await storage.sha256(bytes);meshes.push(mesh);
}
state={version:1,meshes,assignments:Object.fromEntries(meshes.map((m,i)=>[LATTICE_SLOTS[i].id,m.id])),unit:'feet',upAxisMode:'y',
field:{cellsX:7,cellsY:3,cellsZ:1},placements:Object.fromEntries(meshes.slice(0,4).map((m,i)=>[m.id,{meshId:m.id,slotId:null,rotation:[0,90,180,270][i],mirror:i%2?'x':'none',ix:i,iy:1,iz:0,zLift:0,locked:false}])),
architecturalPreferences:{branchRelationships:5,lowerBranches:3,alignment:2,rhythm:1,hierarchy:1,coherence:4,connectorEconomy:1},distributionWeight:70,clusteringPercent:40,assemblyMode:'copies-4',sourceResponsiveExtensions:false,
options:null,generatedConnectors:[],assignmentResult:null,showLattice:true,showConnections:true,
fixturePurpose:'NEW PERSISTENCE TEST CONFIGURATION; NOT THE LOST USER ARRANGEMENT'};
await test('all 15 real candidate OBJ files parsed with original-byte hashes',async()=>{check(meshes.length===15,'Expected 15');for(const m of meshes)check(m.sourceSHA256===await storage.sha256(m.originalObjBytes),'Source hash differs');});
await test('portable complete project round-trip including transformations and preferences',async()=>{file=await storage.makeProject(state);equal(await storage.readProject(JSON.parse(JSON.stringify(file))),state);});
await test('native IndexedDB commit and read-back',async()=>{const old=await storage.loadStoredProject();await storage.storeProject(file,old?.checksum??null);equal(await storage.readProject(await storage.loadStoredProject()),state);});
await test('repeated save/open round-trips',async()=>{for(let i=0;i<3;i++){const current=await storage.loadStoredProject();const next=await storage.makeProject(state);await storage.storeProject(next,current.checksum);equal(await storage.readProject(await storage.loadStoredProject()),state);}});
await test('quota error preserves complete last valid project',async()=>{
const before=await storage.loadStoredProject(),put=IDBObjectStore.prototype.put;
try{IDBObjectStore.prototype.put=function(){throw new DOMException('Injected bounded test quota failure','QuotaExceededError');};
let rejected=false;try{await storage.storeProject(await storage.makeProject({...state,distributionWeight:12}),before.checksum);}catch{rejected=true;}check(rejected,'Save incorrectly succeeded');}
finally{IDBObjectStore.prototype.put=put;}
check((await storage.loadStoredProject()).checksum===before.checksum,'Last valid session lost');});
await test('aborted transaction preserves last valid project',async()=>{
const before=await storage.loadStoredProject(),put=IDBObjectStore.prototype.put;
try{IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);this.transaction.abort();return r;};
let rejected=false;try{await storage.storeProject(await storage.makeProject({...state,clusteringPercent:9}),before.checksum);}catch{rejected=true;}check(rejected,'Aborted save succeeded');}
finally{IDBObjectStore.prototype.put=put;}
check((await storage.loadStoredProject()).checksum===before.checksum,'Aborted save changed current');});
await test('stale competing writer rejected',async()=>{const before=await storage.loadStoredProject();const next=await storage.makeProject({...state,distributionWeight:71});await storage.storeProject(next,before.checksum);let rejected=false;try{await storage.storeProject(file,before.checksum);}catch{rejected=true;}check(rejected,'Stale writer accepted');check((await storage.loadStoredProject()).checksum===next.checksum,'Newer project overwritten');await storage.storeProject(file,next.checksum);});
await test('corrupt portable project rejected',async()=>{let rejected=false;try{await storage.readProject({...file,payload:file.payload+' '});}catch{rejected=true;}check(rejected,'Corruption accepted');});
await test('invalid geometry and missing source mapping rejected',async()=>{for(const input of [{...state,meshes:[{...meshes[0],faces:[]}]},{...state,assignments:{G1:'absent'}}]){let rejected=false;try{await storage.makeProject(input);}catch{rejected=true;}check(rejected,'Invalid state accepted');}});
await test('serialization failure does not overwrite saved project',async()=>{const before=await storage.loadStoredProject();let rejected=false;try{await storage.makeProject({...state,invalid:BigInt(1)});}catch{rejected=true;}check(rejected,'Serialization succeeded');check((await storage.loadStoredProject()).checksum===before.checksum,'Saved data changed');});
await test('legacy real-OBJ session remains readable without changing any coordinates or polygon indices',async()=>{const legacy=await(await fetch('/legacy')).json();const restored=await storage.readProject(legacy);check(restored.meshes.length===15,'Legacy source count differs');for(let i=0;i<15;i++){equal(restored.meshes[i].positions,legacy.meshes[i].positions);equal(restored.meshes[i].faces.map(f=>f.vertices),legacy.meshes[i].faces);}});
await test('derived typed arrays, sets and maps preserve precision',async()=>{const extra={...state,derivedEvidence:{positions:Float64Array.of(1/3,2/3,1),cells:new Set([1,2]),links:new Map([['a','b']])}};equal(await storage.readProject(await storage.makeProject(extra)),extra);});
const final=await storage.loadStoredProject();
const report={results,durationMilliseconds:performance.now()-started,meshCount:meshes.length,sourceHashes:meshes.map(m=>({filename:m.filename,sha256:m.sourceSHA256})),projectChecksum:final.checksum,scope:'Native IndexedDB storage tests; website UI verified separately; no connector feasibility claimed'};
sessionStorage.setItem('qa-summary',JSON.stringify(report));
output.textContent=JSON.stringify(report,null,2);
document.querySelector('a').href=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'}));document.querySelector('a').hidden=false;
}
document.querySelector('button').onclick=()=>run().catch(e=>output.textContent='FAILED: '+e.stack);
document.querySelector('#reopen').onclick=async()=>{const restored=await storage.readProject(await storage.loadStoredProject());const summary=JSON.parse(sessionStorage.getItem('qa-summary')||'{}');output.textContent=JSON.stringify({...summary,reopenedMeshCount:restored.meshes.length,reopenStatus:'PASS',reopenedStateChecksum:await storage.sha256(new TextEncoder().encode(storage.encodeProjectState(restored)))},null,2);};
`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (modules[url.pathname]) { res.setHeader('Content-Type','text/javascript');res.end(modules[url.pathname]);return; }
  if (url.pathname === '/tests.js') { res.setHeader('Content-Type','text/javascript');res.end(client);return; }
  if (url.pathname === '/inventory') { res.setHeader('Content-Type','application/json');res.end(JSON.stringify(files));return; }
  if (url.pathname === '/legacy') { res.setHeader('Content-Type','application/json');fs.createReadStream(path.join(root,'checkpoints/lattice-session.json')).pipe(res);return; }
  if (url.pathname.startsWith('/fixture/')) { const name=decodeURIComponent(url.pathname.slice(9));if(files.includes(name)){fs.createReadStream(path.join(collection,name)).pipe(res);return;} }
  if (url.pathname === '/') { res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated LUV persistence regression</title><h1>Candidate 15-OBJ persistence test</h1><p>Separate origin. Does not access port 3022. No arrangement recovery or connector validation claimed.</p><button>Run bounded persistence tests</button> <button id="reopen">Verify reopened storage</button> <a hidden download="candidate-15-obj-project.json">Download test project</a><pre>Ready</pre><script type="module" src="/tests.js"></script>');return; }
  res.writeHead(404);res.end();
});
server.listen(3031,'127.0.0.1',()=>console.log('Isolated persistence regression: http://127.0.0.1:3031'));
