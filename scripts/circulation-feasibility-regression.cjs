// Bounded original-mesh and focused circulation gate regression. No placement search.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule((baseline?cp.execFileSync('git',['show','e0caff2:'+path.relative(root,f).replaceAll('\\','/')],{cwd:root,encoding:'utf8',maxBuffer:2e7}):fs.readFileSync(f,'utf8'))+(f.endsWith('assignmentSearch.ts')?'\nexport { finalize as finalizeForTest };':''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const load=n=>require('../src/components/lattice/'+n+'.ts'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const {parseObj}=load('parseObj'),{analyzeMesh}=load('analyze'),{validateWalkingApproach}=load('walkingApproach'),{validateCirculationConnection,preparePortConnection}=load('portConnectionValidation');
const {matchAssemblyPorts}=load('portMatching'),{synthesizeConnectors}=load('connectionSynthesis'),{evaluateAssembly}=load('search'),{transitionPath,transitionMeshes,transitionSections}=load('transitionGeometry');
const {captureConnectionDiagnostics}=load('connectionDiagnostics');
const {measureSurfaceGap,fitLoftContact}=load('surfaceAttachment');
function geometryStats(pair){const sections=transitionSections(pair),edges=[pair.path,...[-1,1].map(sign=>sections.map(s=>s.center.map((v,k)=>v+sign*s.side[k]*s.width/2)))];return {minSectionWidth:Math.min(...sections.map(s=>s.width)),maxWalkingEdgeSlope:Math.max(...edges.flatMap(edge=>edge.slice(1).map((p,i)=>Math.abs(p[2]-edge[i][2])/Math.max(1e-8,Math.hypot(p[0]-edge[i][0],p[1]-edge[i][1]))))),meshSHA256:hash(JSON.stringify(transitionMeshes(pair).map(m=>({kind:m.kind,positions:Array.from(m.positions),indices:m.indices}))))};}
const out=path.join(root,process.env.CIRCULATION_REPORT_DIR??'reports/stage2c-feasibility-correction');fs.mkdirSync(out,{recursive:true});
const report={mode:baseline?'baseline':'corrected',checks:[],originalFixture:null};
function slab(name,halfY=3,slope=0){
 const positions=[[-8,-halfY,-.5],[8,-halfY,-.5],[8,halfY,-.5],[-8,halfY,-.5],[-8,-halfY,-8*slope],[8,-halfY,8*slope],[8,halfY,8*slope],[-8,halfY,-8*slope]];
 const faces=[[1,4,3,2],[5,6,7,8],[1,2,6,5],[2,3,7,6],[3,4,8,7],[4,1,5,8]];
 const obj=positions.map(p=>'v '+p.join(' ')).join('\n')+'\n'+faces.map(f=>'f '+f.join(' ')).join('\n');
 const mesh=parseObj(obj,name+'.obj');return analyzeMesh(mesh,name,1,'z');
}
if(!baseline){
 const a=slab('a'),b=slab('b'),models=[a,b],tiles=[{id:a.id,ix:0,iy:0,iz:0,variant:0},{id:b.id,ix:1,iy:0,iz:0,variant:0}];
 const surface=a.connectionSurface.positions,x=Math.max(...Array.from(surface).filter((_,i)=>i%3===0)),z=Math.max(...Array.from(surface).filter((_,i)=>i%3===2));
 const point=[x,0,z],approach=(width,depth,landing=false,scene=models,placed=tiles)=>validateWalkingApproach(a,tiles[0],point,[1,0,0],width,depth,scene,placed,[],landing);
 assert(approach(2.1,2).valid,JSON.stringify(approach(2.1,2)));assert(approach(3,3,true).valid);
 assert(!approach(7,2).valid);assert(!approach(3,20,true).valid);assert(!approach(7,3,true).valid);
 report.checks.push('valid approach and supported stair landing; insufficient width/coverage and landing support rejected');
 const tilted=slab('tilted',3,.03),tiltedTile={id:tilted.id,ix:0,iy:0,iz:0,variant:0},tp=tilted.connectionSurface.positions;
 const tiltedPoint=[Math.max(...Array.from(tp).filter((_,i)=>i%3===0)),0,Math.max(...Array.from(tp).filter((_,i)=>i%3===2))];
 assert(validateWalkingApproach(tilted,tiltedTile,tiltedPoint,[1,0,0],2.1,2,[tilted],[tiltedTile],[],false).valid);
 assert(!validateWalkingApproach(tilted,tiltedTile,tiltedPoint,[1,0,0],3,3,[tilted],[tiltedTile],[],true).valid);report.checks.push('walkable incline accepted as approach but rejected as level stair landing');
 const obstacle={positions:Float32Array.from([x-2,-3,z+3,x+1,-3,z+3,x+1,3,z+3,x-2,3,z+3]),indices:[0,1,2,0,2,3]};
 assert(!validateWalkingApproach(a,tiles[0],point,[1,0,0],2.1,2,models,tiles,[obstacle]).valid);report.checks.push('obstructed headroom rejected');
 const raw={tileA:a.id,tileB:b.id,portA:'east',portB:'west',from:point,to:[20-x,0,z],plan:20-2*x,rise:0,distance:20-2*x,facing:1,widthCompatibility:1,usableWidth:2.1,confidence:1,score:10,connectionClass:'DIRECT',startWidth:2.1,endWidth:2.1,startDirection:[1,0,0],endDirection:[-1,0,0]};
 const pair=preparePortConnection({...raw,path:transitionPath(raw,0)}),check=validateCirculationConnection(pair,models,tiles,[]);
 assert.equal(check.reason,'accepted',JSON.stringify(check));report.checks.push('valid direct circulation route accepted by shared gate');
 const valid=synthesizeConnectors(models,tiles,[],{portPairs:[pair]});assert(valid.connectors.length>0);assert.equal(valid.organicDiagnostics.components,1);
 const candidate={pair,accepted:true},reported=synthesizeConnectors(models,tiles,[],{portPairs:[pair],candidates:[candidate]});assert.equal(reported.portCandidates[0].accepted,true);
 const wall={positions:Float32Array.from([10,-3,z-1,10,3,z-1,10,3,z+5,10,-3,z+5]),indices:[0,1,2,0,2,3]};
 assert.notEqual(validateCirculationConnection(pair,models,tiles,[wall]).reason,'accepted');report.checks.push('emitted connector collision rejected');
 const roof={positions:Float32Array.from([9,-3,z+3,11,-3,z+3,11,3,z+3,9,3,z+3]),indices:[0,1,2,0,2,3]};
 assert.equal(validateCirculationConnection(pair,models,tiles,[roof]).reason,'connector route headroom');report.checks.push('overhead generated connector headroom rejected');
 for(let i=2;i<roof.positions.length;i+=3)roof.positions[i]+=20;
 assert.equal(validateCirculationConnection(pair,models,tiles,[roof]).reason,'accepted');
 for(let i=2;i<roof.positions.length;i+=3)roof.positions[i]-=20;
 report.checks.push('changed obstacle geometry invalidates cached headroom result');
 const roofModel={...a,id:'roof',connectionSurface:{positions:roof.positions,triangles:roof.indices}};
 assert.notEqual(validateCirculationConnection(pair,[...models,roofModel],[...tiles,{id:'roof',ix:0,iy:0,iz:0,variant:0}],[]).reason,'accepted');report.checks.push('original-mesh route headroom obstruction rejected');
 const narrow=slab('a',.5),rejected=synthesizeConnectors([narrow,b],tiles,[],{portPairs:[pair]});assert.equal(rejected.portPairs.length,0);assert.equal(rejected.connectors.length,0);assert.equal(rejected.organicDiagnostics.components,2);report.checks.push('rejected route excluded from confirmed graph; two-form assembly disconnected');
 const rejectionReport=synthesizeConnectors([narrow,b],tiles,[],{portPairs:[pair],candidates:[candidate]});assert.equal(rejectionReport.portCandidates[0].accepted,false);assert.equal(candidate.accepted,true);assert.equal(rejectionReport.connectionDiagnostics.acceptedCount,0);assert.equal(rejectionReport.connectionDiagnostics.componentsAfter,2);
 assert.equal(synthesizeConnectors([],[],[],{portPairs:[pair]}).connectors.length,0);report.checks.push('unverified missing source geometry cannot emit confirmed connector');
 const voxelOnly={tileA:a.id,tileB:b.id,interlock:'PASS',floor:'PASS',circulation:'PASS',collision:'PASS'};
 assert.equal(matchAssemblyPorts([narrow,b],tiles,[voxelOnly]).confirmedReports.length,0);report.checks.push('point/voxel report does not prejoin the circulation graph');
}
const bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')),session=JSON.parse(bytes);
const original=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{const p=session.meshes.find(m=>m.id===session.assignments[code]),mesh={...p,positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)},before=hash(JSON.stringify(mesh)),model=analyzeMesh(mesh,code,1,mesh.upAxis);assert.equal(hash(JSON.stringify(mesh)),before);return {code,mesh,model,meshHash:before,tile:{id:mesh.id,ix,iy,iz:0,variant}};});
const models=original.map(s=>s.model),tiles=original.map(s=>s.tile),trials=[];let synthesis,ports,trace,evaluation;
for(let i=0;i<7;i++){const tick=performance.now(),evaluated=evaluateAssembly(models,tiles);evaluation=evaluated;ports=matchAssemblyPorts(models,tiles,evaluated.connections);synthesis=synthesizeConnectors(models,tiles,evaluated.connections,{...ports,portPairs:ports.pairs});trials.push({cache:i?'warm':'cold',ms:performance.now()-tick});}
const captured=captureConnectionDiagnostics(()=>{const p=matchAssemblyPorts(models,tiles,evaluation.connections);return synthesizeConnectors(models,tiles,evaluation.connections,{...p,portPairs:p.pairs});});trace=captured.trace;
const relationships=[...new Map(synthesis.connectors.map(c=>[JSON.stringify(c.portPair),c.portPair])).values()];
if(baseline)fs.writeFileSync(path.join(out,'baseline-pairs.json'),JSON.stringify(relationships,null,2));
const endpointAudit=!baseline?JSON.parse(fs.readFileSync(path.join(out,'baseline-pairs.json'),'utf8')).map(pair=>({pair,emittedKind:transitionMeshes(pair)[0]?.kind,geometry:geometryStats(pair),stage1Attachment:fitLoftContact(pair,models,tiles,true),validation:validateCirculationConnection(pair,models,tiles,[]),approaches:[pair.tileA,pair.tileB].map((id,i)=>{const model=models.find(m=>m.id===id),tile=tiles.find(t=>t.id===id),width=i?pair.endWidth:pair.startWidth,point=i?pair.to:pair.from,direction=i?pair.endDirection:pair.startDirection;return {id,width,point,direction,gap:measureSurfaceGap(model,tile,point,2),result:validateWalkingApproach(model,tile,point,direction,width,transitionMeshes(pair)[0]?.kind==='stair'?Math.max(3,width):2,models,tiles,[],transitionMeshes(pair)[0]?.kind==='stair')};})})):[];
if(!baseline){const old=JSON.parse(fs.readFileSync(path.join(out,'baseline.json'),'utf8')).originalFixture;if(!process.argv.includes('--allow-connector-geometry-change'))assert.deepEqual(endpointAudit.map(item=>item.geometry.meshSHA256),old.relationshipGeometry.map(item=>item.meshSHA256));else report.checks.push('authorized connector geometry revision; replacement geometric assertions run in integrated-connector-regression.cjs');assert.deepEqual(original.map(item=>hash(JSON.stringify(item.mesh))),old.meshHashes.map(item=>item.sha256));report.checks.push(process.argv.includes('--allow-connector-geometry-change')?'original OBJ hashes match baseline':'original OBJ and regenerated prior connector hashes match baseline');}
const finalized=load('assignmentSearch').finalizeForTest('copies-4',4,{cellsX:4,cellsY:4,cellsZ:1},models,models,tiles,1,performance.now(),0);
if(!baseline){assert.notEqual(finalized.status,'PASS');assert.equal(finalized.components,4);}
for(const item of original)assert.equal(hash(JSON.stringify(item.mesh)),item.meshHash,'original mesh unchanged through validation/synthesis');
assert.equal(load('types').LATTICE_FEET,20);assert(tiles.every(t=>t.iz===0&&!t.zLift));assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),hash(bytes));
report.checks.push('original four OBJ/session hashes and single-level fixed placements preserved');
report.originalFixture={lattice:{cellsX:4,cellsY:4,cellsZ:1},status:finalized.status,score:finalized.score,relationshipGeometry:relationships.map(pair=>geometryStats(pair)),relationships,endpointAudit,routeFailureCounts:trace.counts,meshHashes:original.map(s=>({code:s.code,filename:s.mesh.filename,sha256:hash(JSON.stringify(s.mesh)),vertices:s.mesh.positions.length/3,faces:s.mesh.faces.length})),sessionSHA256:hash(bytes),placements:tiles,filenames:original.map(s=>s.mesh.filename),trials,acceptedPorts:synthesis.portPairs.length,connectors:synthesis.connectors.length,ramps:synthesis.ramps,stairs:synthesis.stairs,components:synthesis.organicDiagnostics.components,rejections:ports.rejectionCounts,organicRejections:synthesis.organicDiagnostics.rejections};
fs.writeFileSync(path.join(out,baseline?'baseline.json':'corrected.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode,checks:report.checks,originalFixture:{...report.originalFixture,relationships:undefined,endpointAudit:undefined,organicRejections:undefined,routeFailureCounts:undefined}}));
