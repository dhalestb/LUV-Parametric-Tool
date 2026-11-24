/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic CommonJS fixture with a TypeScript require hook. */
// Exactly 24 L1 transforms; no search algorithm, mesh, scoring or application changes.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),out=path.join(root,'reports/stage2b-bounded');fs.mkdirSync(out,{recursive:true});
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const load=n=>require('../src/components/lattice/'+n+'.ts'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const {analyzeMesh}=load('analyze'),{worldFromLocal,localPoint}=load('surfaceAttachment'),{tileRootMatrix}=load('objFidelity'),THREE=require('three');
const {evaluateQualifiedInteriorRoutes,validateAlternative}=load('alternativeRouting'),{transitionSurfaceClear}=load('connectionClearance'),{transitionMeshes}=load('transitionGeometry'),{captureConnectionDiagnostics}=load('connectionDiagnostics');
const bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')),session=JSON.parse(bytes),prior=JSON.parse(fs.readFileSync(path.join(root,'reports/interior-approaches/updated.json'))),fixture=JSON.parse(fs.readFileSync(path.join(root,'reports/local-material/surface-regression.json')));
const geometry=m=>hash(JSON.stringify([Array.from(m.positions),Array.from(m.normals),m.faces]));
const sources=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{const raw=session.meshes.find(m=>m.id===session.assignments[code]),mesh={...raw,positions:Float32Array.from(raw.positions),normals:Float32Array.from(raw.normals),faces:raw.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)};const before=geometry(mesh),model=analyzeMesh(mesh,code,1,mesh.upAxis);assert.equal(before,prior.sources.find(s=>s.code===code).geometrySHA256);return {code,mesh,before,model,tile:{id:mesh.id,ix,iy,iz:0,variant}};});
const models=sources.map(s=>s.model),fixed=sources.slice(0,3).map(s=>s.tile),l1=sources[3],g1=sources[2],oldMeshes=fixture.connectors,oldHash=hash(JSON.stringify(oldMeshes));
const fixedHash=hash(JSON.stringify(fixed)),oldPairs=[...new Map(oldMeshes.map(m=>[JSON.stringify(m.portPair),m.portPair])).values()];assert.equal(oldPairs.length,2);
// Diagnostic-only hook: reuse the exact private intersection implementation to
// locate the first offending ORIGINAL emitted triangle. No substitute geometry,
// clearance threshold or acceptance path is introduced by this hook.
const hookFile=path.join(root,'src/components/lattice/connectionClearance.ts'),hook=new Module(hookFile);hook.filename=hookFile;hook.paths=Module._nodeModulePaths(path.dirname(hookFile));
const hookSource=fs.readFileSync(hookFile,'utf8')+`\nexport function firstCollisionTriangle(pair:PortPair,tile:PlacedTile,model:TileModel) {
 const surface=model.connectionSurface!;let tree=cache.get(geometryRevision(surface));
 if(!tree){tree=build(trianglesOf({positions:surface.positions,indices:surface.triangles}));cache.set(geometryRevision(surface),tree);}
 const endpoint=tile.id===pair.tileA?pair.from:tile.id===pair.tileB?pair.to:null;
 const direction=tile.id===pair.tileA?pair.startDirection:pair.endDirection;
 const localEnd=endpoint?localPoint(endpoint,tile,model):null;
 const localDir=endpoint&&direction?sub(localPoint(endpoint.map((v,i)=>v+direction[i]) as Vec3,tile,model),localEnd!):null;
 const allowed=(p:Vec3)=>!!localEnd&&!!localDir&&Math.abs(dot(sub(p,localEnd),localDir))<=.04&&Math.abs(p[2]-localEnd[2])<=.26;
 for(const tri of transitionMeshes(pair).flatMap(trianglesOf))if(collides(tri.map(p=>localPoint(p,tile,model)) as Triangle,tree,allowed))return tri;
 return null;
}`;
hook._compile(ts.transpileModule(hookSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,hookFile);
const normal=x=>JSON.parse(JSON.stringify(x,(k,v)=>['ms','cacheHit','timing','clearanceEvidence'].includes(k)?undefined:v instanceof Float32Array?Array.from(v):v));
const compactDiscovery=d=>({available:d.available,tested:d.tested,omitted:d.omitted,qualified:d.qualified.map(q=>({anchor:q.anchor,walking:q.walking.map(w=>({depth:w.depth,valid:w.result.valid,reason:w.result.reason,region:w.result.details?.region,minHeadroom:w.result.details?.minHeadroom})),landing:{valid:q.landing.valid,reason:q.landing.reason}})),outcomes:d.outcomes.map(o=>({anchor:o.anchor,stage:o.stage,reason:o.reason,walking:o.walking.map(w=>({depth:w.depth,valid:w.result.valid,reason:w.result.reason,details:w.result.valid?{region:w.result.details.region,minHeadroom:w.result.details.minHeadroom}:w.result.details}))}))});
function clearance(pair,tiles,modelList,existing=[]){const c=captureConnectionDiagnostics(()=>transitionSurfaceClear(pair,tiles,modelList,existing),32);return {clear:c.value,events:c.trace.events.filter(e=>e.stage==='clearance').map(e=>({reason:e.reason,filename:e.detail.filename,blocker:e.detail.blocker?.id,point:e.detail.point}))};}
// Baseline plus nearest vacant cells around G1. Four proper rotations only;
// mirrored variants and lifts are deliberately outside this finite study.
const cells=[[2,1],[0,1],[1,2],[0,2],[2,0],[2,2]],rotations=[90,0,180,270];
const configurations=cells.flatMap(([ix,iy])=>rotations.map(rotation=>({id:l1.model.id,ix,iy,iz:0,variant:l1.model.variants.findIndex(v=>v.rotation===rotation&&v.mirror==='none')})));
assert.equal(configurations.length,24);assert.equal(new Set(configurations.map(t=>JSON.stringify(t))).size,24);
const report={checkpoint:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sessionSHA256:hash(bytes),sources:sources.map(s=>({code:s.code,filename:s.mesh.filename,geometrySHA256:s.before})),fixed,field:{cellsX:4,cellsY:4,cellsZ:1},policy:{cells,rotations,mirror:'none',lifts:false,maxConfigurations:24,maxSpan:50,maxRun:72,sourceWindowCap:512,routeFamilies:8},configurations:[],checks:[]};
assert.equal(report.sessionSHA256,prior.sessionSHA256);
const started=performance.now();
for(let index=0;index<configurations.length;index++){
 const tile=configurations[index],tiles=[...fixed,tile],variant=l1.model.variants[tile.variant];assert(tile.variant>=0&&tile.ix>=0&&tile.ix<4&&tile.iy>=0&&tile.iy<4&&tile.iz===0);assert(!fixed.some(t=>t.ix===tile.ix&&t.iy===tile.iy));
 const tick=performance.now();
 const transform=p=>worldFromLocal(localPoint(p,l1.tile,l1.model),tile,l1.model);
 const targets=['B','A','C'].flatMap(name=>[3,2.1].map(width=>{const old=fixture.approaches.find(e=>e.name===name),point=transform(old.point),tip=transform(old.point.map((v,k)=>v+old.outward[k])),outward=tip.map((v,k)=>v-point[k]),side=[-outward[1],outward[0],0];return {id:name+'-'+width,point,outward,width,kind:'edge',snap:0,run:[point.map((v,k)=>v-side[k]*width/2),point.map((v,k)=>v+side[k]*width/2)]};}));
 const preservedLinks=oldPairs.map(pair=>({from:pair.tileA,to:pair.tileB,...clearance(pair,[tile],[l1.model])}));
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let transformError=0;
 const matrix=tileRootMatrix(l1.mesh,{...tile,rotation:variant.rotation,mirror:variant.mirror},1,'auto');
 for(let i=0;i<l1.model.connectionSurface.positions.length;i+=3){const p=worldFromLocal(Array.from(l1.model.connectionSurface.positions.slice(i,i+3)),tile,l1.model);for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}const rootPoint=new THREE.Vector3(...l1.mesh.positions.slice(i,i+3)).applyMatrix4(matrix);transformError=Math.max(transformError,Math.hypot(p[0]-rootPoint.x,p[1]-rootPoint.z,p[2]-rootPoint.y));}assert(transformError<1e-5);
 const planarBoundsFit=[0,1].every(k=>bounds.min[k]>=-10-1e-6&&bounds.max[k]<=70+1e-6);
 const budget={attachments:128,pairs:96,routes:768,maxSpan:50,maxRun:72};
 const result=evaluateQualifiedInteriorRoutes(models,tiles,g1.model.id,l1.model.id,targets,oldMeshes,budget,512);
 assert.equal(result.discovery.omitted,0);assert.equal(result.omittedPairs,0);assert.equal(result.untestedSelectedPairs,0);
 const warm=evaluateQualifiedInteriorRoutes(models,tiles,g1.model.id,l1.model.id,targets,oldMeshes,budget,512);assert.deepEqual(normal(result),normal(warm));
 const bAudits=result.outcomes.filter(o=>o.pair.portB.startsWith('B-')&&o.pair.portA==='approach-47-2.1-1.050000').map(o=>{
   const blockers=sources.map(s=>{const t=s.code==='L1'?tile:s.tile,c=clearance(o.pair,[t],[s.model]);let triangle=null;if(c.events.some(e=>e.reason==='source triangle collision')){triangle=hook.exports.firstCollisionTriangle(o.pair,t,s.model);assert(triangle,'triangle collision diagnostic must reproduce exact production test');}const maxPlanRadius=triangle?Math.max(...triangle.map(p=>Math.hypot(p[0]-o.pair.from[0],p[1]-o.pair.from[1]))):null;return {code:s.code,...c,firstCollisionTriangle:triangle,maxPlanRadius,nearG1Exit:s.code==='G1'&&triangle!==null&&maxPlanRadius<=2.5};});
   return {route:o.route,target:o.pair.portB,pair:o.pair,firstFailure:o.reason,blockers,existingConnectors:clearance(o.pair,[],[],oldMeshes)};
 });
 const validated=[];
 for(const candidate of result.accepted){assert.equal(validateAlternative(structuredClone(candidate.pair),models,tiles,oldMeshes,budget,candidate.route).reason,'accepted');assert.deepEqual(normal(transitionMeshes(candidate.pair)),normal(candidate.meshes));validated.push({pair:candidate.pair,route:candidate.route,preservesExisting:preservedLinks.every(x=>x.clear),planarBoundsFit});}
 const row={number:index+1,tile,rotation:variant.rotation,mirror:variant.mirror,bounds,planarBoundsFit,transformError,preservedLinks,targets,discovery:compactDiscovery(result.discovery),destination:compactDiscovery(result.destination),qualifiedPairs:result.qualifiedPairs.map(q=>({pair:q.pair,sourceRegion:q.source.walking[0].result.details.region,destinationRegion:q.destination.walking[0].result.details.region})),preconstruction:result.preconstruction.map(p=>({pair:p.pair,stage:p.stage,reason:p.reason,details:p.pair?p.details:undefined})),outcomes:result.outcomes.map(o=>({pair:o.pair,route:o.route,stage:o.stage,reason:o.reason,constructed:o.constructed,independentEmittedClearance:o.independentEmittedClearance})),bAudits,validated,eligibleValidated:validated.filter(v=>v.preservesExisting&&v.planarBoundsFit),timing:result.timing,warmTiming:warm.timing,totalMs:performance.now()-tick};
 assert.equal(hash(JSON.stringify(oldMeshes)),oldHash);assert.equal(hash(JSON.stringify(fixed)),fixedHash);for(const s of sources)assert.equal(geometry(s.mesh),s.before);
 report.configurations.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({n:row.number,cell:[tile.ix,tile.iy],rotation:row.rotation,oldLinks:preservedLinks.map(x=>x.clear),sources:result.discovery.qualified.length,pairs:row.qualifiedPairs.length,routes:row.outcomes.length,bRoutes:bAudits.length,validated:row.eligibleValidated.length,ms:row.totalMs}));
}
assert.equal(report.configurations.length,24);assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),report.sessionSHA256);
report.checks=['Exactly 24 distinct vacant in-field L1 transforms; O1/O2/G1 fixed; no lifts or mirrored variants','Cold/warm qualified-route parity for every configuration; no window, pair or route truncation','Original OBJ positions/normals/faces and session hashes unchanged; every L1 vertex matches renderer root in all 24 configurations','Original six ramp/stair mesh pieces unchanged; new L1 obstruction of existing routes tested independently','G1/B exact emitted geometry independently checked against each original form and old connectors; first colliding triangle reproduced using unchanged production intersection helpers','Any accepted route independently revalidated before counting; provisional voxel graph relationships never establish success'];
report.totalMs=performance.now()-started;report.existingConnectorsSHA256=oldHash;
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,configurations:24,validated:report.configurations.reduce((n,r)=>n+r.eligibleValidated.length,0),ms:report.totalMs}));
