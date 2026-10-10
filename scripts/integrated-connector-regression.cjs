// Deterministic endpoint sections, synthetic positive/negative routes, and bounded original-OBJ alternatives.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript');
const before=process.argv.includes('--before'),root=path.resolve(__dirname,'..');
const snapshot='C:/Users/DHale/.codex/visualizations/2026/10/08/01a11a08-af57-78a1-949a-6593c892fa51/integrated-before';
require.extensions['.ts']=(m,f)=>{
 const prior=path.join(snapshot,path.basename(f));let source=fs.readFileSync(before&&fs.existsSync(prior)?prior:f,'utf8');
 if(f.endsWith('assignmentSearch.ts'))source+='\nexport { finalize as finalizeForTest };';
 m._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
};
const load=n=>require('../src/components/lattice/'+n+'.ts'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const {parseObj}=load('parseObj'),{analyzeMesh}=load('analyze');
const {transitionPath,transitionMeshes,transitionSections}=load('transitionGeometry');
const {validateCirculationConnection}=load('portConnectionValidation');
const {measureSurfaceGap,measureFlushWalkingInterface}=load('surfaceAttachment');
const {validateWalkingApproach}=load('walkingApproach');
const {transitionSurfaceClear}=load('connectionClearance');
const {captureConnectionDiagnostics}=load('connectionDiagnostics');
const {matchAssemblyPorts}=load('portMatching'),{synthesizeConnectors}=load('connectionSynthesis'),{evaluateAssembly}=load('search');
const {finalizeForTest}=load('assignmentSearch');
const out=path.join(root,'reports/stage2c-integrated-connectors');fs.mkdirSync(out,{recursive:true});
function slab(name,halfX=8,halfY=3,cross=0){
 const p=[[-halfX,-halfY,-.5],[halfX,-halfY,-.5],[halfX,halfY,-.5],[-halfX,halfY,-.5],[-halfX,-halfY,-halfY*cross],[halfX,-halfY,-halfY*cross],[halfX,halfY,halfY*cross],[-halfX,halfY,halfY*cross]];
 const faces=[[1,4,3,2],[5,6,7,8],[1,2,6,5],[2,3,7,6],[3,4,8,7],[4,1,5,8]];
 const mesh=parseObj(p.map(p=>'v '+p.join(' ')).join('\n')+'\n'+faces.map(f=>'f '+f.join(' ')).join('\n'),name+'.obj');
 return analyzeMesh(mesh,name,1,'z');
}
const tile=(m,x,lift=0)=>({id:m.id,ix:x,iy:0,iz:0,variant:0,zLift:lift});
const top=m=>Math.max(...Array.from(m.connectionSurface.positions).filter((_,i)=>i%3===2));
function pair(a,b,rise=0,width=3){const z=top(a),p={tileA:a.id,tileB:b.id,portA:'east',portB:'west',from:[8,0,z],to:[12,0,z+rise],plan:4,rise,distance:Math.hypot(4,rise),usableWidth:width,startWidth:width,endWidth:width,startDirection:[1,0,0],endDirection:[-1,0,0],connectionClass:rise?'VERTICAL':'DIRECT',confidence:1,score:1,facing:1,widthCompatibility:1};p.path=transitionPath(p);return p;}
function stats(p){
 const sections=transitionSections(p),meshes=transitionMeshes(p),edges=[p.path,...[-1,1].map(sign=>sections.map(s=>s.center.map((v,k)=>v+sign*s.side[k]*s.width/2)))];
 let degenerates=0;for(const m of meshes)for(let i=0;i<m.indices.length;i+=3){const vertices=m.indices.slice(i,i+3).map(n=>Array.from(m.positions.slice(n*3,n*3+3))),u=vertices[1].map((v,k)=>v-vertices[0][k]),v=vertices[2].map((v,k)=>v-vertices[0][k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=1e-9)degenerates++;}
 return {kind:meshes[0]?.kind,pieces:meshes.length,minWidth:Math.min(...sections.map(s=>s.width)),maxRibbonSlope:Math.max(...edges.flatMap(edge=>edge.slice(1).map((p,i)=>Math.abs(p[2]-edge[i][2])/Math.max(1e-8,Math.hypot(p[0]-edge[i][0],p[1]-edge[i][1]))))),degenerateFaces:degenerates};
}
function sections(p,models,tiles){const s=transitionSections(p),meshes=transitionMeshes(p);return [p.tileA,p.tileB].map((id,index)=>{
 const model=models.find(m=>m.id===id),placed=tiles.find(t=>t.id===id),mesh=index?meshes.at(-1):meshes[0],offset=index?mesh.positions.length-12:0;
 const edge=[Array.from(mesh.positions.slice(offset,offset+3)),Array.from(mesh.positions.slice(offset+3,offset+6))];
 return {id,edge,fullInterface:measureFlushWalkingInterface?measureFlushWalkingInterface(model,placed,edge):{status:'UNVERIFIED',reason:'prior validator lacks full-interface check'},centerGap:measureSurfaceGap(model,placed,index?p.to:p.from,2),approach:validateWalkingApproach(model,placed,index?p.to:p.from,index?p.endDirection:p.startDirection,index?p.endWidth:p.startWidth,meshes[0].kind==='stair'?Math.max(3,index?p.endWidth:p.startWidth):2,models,tiles,[],meshes[0].kind==='stair'),crossSlope:s[index?s.length-1:0].side[2]};});}
const synthetic=[];
function check(name,p,models,tiles,expected,existing=[]){const capture=captureConnectionDiagnostics(()=>validateCirculationConnection(p,models,tiles,existing));const result={name,pair:p,expected,result:capture.value,geometry:stats(p),sections:sections(p,models,tiles),collision:transitionSurfaceClear(p,tiles,models,existing),clearanceEvents:capture.trace.events.filter(e=>e.stage==='clearance')};synthetic.push(result);if(!before){if((result.result.reason==='accepted')!==expected)fs.writeFileSync(path.join(out,'test-failure.json'),JSON.stringify(result,null,2));assert.equal(result.result.reason==='accepted',expected,name+': '+JSON.stringify(result.result));if(expected){assert.equal(result.geometry.degenerateFaces,0);assert(result.sections.every(s=>s.fullInterface.valid));}}return result;}
const a=slab('A'),b=slab('B'),models=[a,b],tiles=[tile(a,0),tile(b,1)];
const level=check('level flush',pair(a,b),models,tiles,true);
const ramp=check('supported flush ramp',pair(a,b,.2),models,[tiles[0],tile(b,1,.2)],true);
const stair=check('ascending stair',pair(a,b,1.2),models,[tiles[0],tile(b,1,1.2)],true);
const down=pair(a,b,-1.2);down.from[2]+=1.2;down.to[2]+=1.2;down.path=transitionPath(down);check('descending stair',down,models,[tile(a,0,1.2),tiles[1]],true);
const raised=pair(a,b);raised.from[2]+=.05;raised.to[2]+=.05;raised.path=transitionPath(raised);check('raised overlay plate',raised,models,tiles,false);
const wrongArrival=pair(a,b);wrongArrival.to[2]+=.05;wrongArrival.rise=.05;wrongArrival.path=transitionPath(wrongArrival);check('destination lip',wrongArrival,models,tiles,false);
const below=pair(a,b);below.to[2]-=.05;below.rise=-.05;below.path=transitionPath(below);check('destination below floor',below,models,tiles,false);
const wall=pair(a,b);wall.from[2]+=1;wall.to[2]+=1;wall.path=transitionPath(wall);check('wall-only or unsupported contact',wall,models,tiles,false);
const gap=pair(a,b);gap.to[0]=11;gap.plan=3;gap.path=transitionPath(gap);check('unsupported arrival gap',gap,models,tiles,false);
check('insufficient route width',pair(a,b,0,1.8),models,tiles,false);
const narrow=slab('narrow',8,.8),np=pair(narrow,b,1.2);check('unsupported stair landing',np,[narrow,b],[tile(narrow,0),tile(b,1,1.2)],false);
const short=slab('short',1),sp=pair(short,b,2);sp.from[0]=1;sp.plan=11;sp.path=transitionPath(sp);check('insufficient landing depth',sp,[short,b],[tile(short,0),tile(b,1,2)],false);
const excessive=pair(a,b,.2);excessive.path[3][2]+=.3;check('excessive local ramp slope',excessive,models,[tiles[0],tile(b,1,.2)],false);
const roof={positions:Float32Array.from([9,-3,top(a)+3,11,-3,top(a)+3,11,3,top(a)+3,9,3,top(a)+3]),indices:[0,1,2,0,2,3]};check('overhead connector',pair(a,b),models,tiles,false,[roof]);
const penetration=pair(a,b);penetration.from[0]=7.97;penetration.plan=4.03;penetration.path=transitionPath(penetration);check('interior endpoint material penetration',penetration,models,tiles,false);
const stepRoof={...a,id:'step-roof',connectionSurface:{positions:Float32Array.from([8,-3,top(a)+6.95,8.1,-3,top(a)+6.95,8.1,3,top(a)+6.95,8,3,top(a)+6.95]),triangles:[0,1,2,0,2,3]}};
check('stair headroom at actual tread elevation',pair(a,b,1.2),[a,b,stepRoof],[tiles[0],tile(b,1,1.2),tile(stepRoof,0)],false);
const c=slab('cross-slope',8,3,.01),cp=pair(c,b,.2),mid=top(c)-.03;cp.from[2]=mid;cp.to[2]=top(b)+.2;cp.rise=cp.to[2]-mid;cp.startProfile=[[8,-1.5,mid-.015],[8,1.5,mid+.015]];cp.endProfile=[[12,1.5,cp.to[2]],[12,-1.5,cp.to[2]]];cp.path=transitionPath(cp);check('adapted transverse endpoint profile',cp,[c,b],[tile(c,0),tile(b,1,.2)],true);
const gateStart=performance.now();for(let i=0;i<100;i++)assert.equal(validateCirculationConnection(level.pair,models,tiles,[]).reason,'accepted');const gateBenchmark={calls:100,totalMs:performance.now()-gateStart};
if(!before){for(const valid of [level,ramp,stair]){const placed=valid.name==='level flush'?tiles:[tiles[0],tile(b,1,valid.pair.rise)];const synth=synthesizeConnectors(models,placed,[],{portPairs:[valid.pair]});assert(synth.connectors.length>0,valid.name+' graph emission');assert.equal(synth.organicDiagnostics.components,1);}const rejected=synthesizeConnectors(models,tiles,[],{portPairs:[raised]});assert.equal(rejected.portPairs.length,0);assert(rejected.connectors.every(c=>c.portPair.from[2]===top(a)&&c.portPair.to[2]===top(b)));const noRoute=synthesizeConnectors([narrow,b],[tile(narrow,0),tiles[1]],[],{portPairs:[np]});assert.equal(noRoute.connectors.length,0);assert.equal(noRoute.organicDiagnostics.components,2);}
const bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'));assert.equal(hash(bytes),'6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b');const session=JSON.parse(bytes);
const original=[['O2',0,0,0],['O1',1,0,2],['G1',1,1,0],['L1',2,1,3]].map(([code,ix,iy,variant])=>{const p=session.meshes.find(m=>m.id===session.assignments[code]),mesh={...p,positions:Float32Array.from(p.positions),normals:Float32Array.from(p.normals),faces:p.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)},initial=hash(JSON.stringify(mesh));return {code,mesh,initial,model:analyzeMesh(mesh,code,1,mesh.upAxis),tile:{id:p.id,ix,iy,iz:0,variant}};});
const om=original.map(o=>o.model),ot=original.map(o=>o.tile),trials=[];let matched,synth,evaluated;
for(let i=0;i<7;i++){const start=performance.now();evaluated=evaluateAssembly(om,ot);matched=matchAssemblyPorts(om,ot,evaluated.connections);synth=synthesizeConnectors(om,ot,evaluated.connections,{...matched,portPairs:matched.pairs});trials.push({cache:i?'warm':'cold',ms:performance.now()-start});}
const priorPairs=JSON.parse(fs.readFileSync(path.join(root,'reports/stage2c-feasibility-correction/baseline-pairs.json')));
const replay=priorPairs.map(old=>{const p=structuredClone(old);if(!before)p.path=transitionPath(p);return {pair:p,geometry:stats(p),validation:validateCirculationConnection(p,om,ot,[]),sections:sections(p,om,ot),independentCollision:transitionSurfaceClear(p,ot,om,[])};});
const alternatives=[];
if(!before){
 const {routeAlternatives,validateAlternative,evaluateQualifiedInteriorRoutes}=load('alternativeRouting'),{discoverInteriorApproaches}=load('interiorApproaches');
 const budget={attachments:16,pairs:8,routes:64,maxSpan:40,maxRun:72};
 for(const old of priorPairs){const target=om.find(m=>m.id===old.tileB),placed=ot.find(t=>t.id===old.tileB),dest=discoverInteriorApproaches(target,placed,om,ot,[],{windows:128,targets:[old.to]}),targets=dest.qualified.slice(0,4).map(q=>q.anchor);
  const exact=routeAlternatives(old).map(r=>({route:r.name,pair:r.pair,geometry:stats(r.pair),validation:validateAlternative(r.pair,om,ot,[],budget,r.name)}));
  const qualified=targets.length?evaluateQualifiedInteriorRoutes(om,ot,old.tileA,old.tileB,targets,[],budget,128):null;
  const source=om.find(m=>m.id===old.tileA),sourceTile=ot.find(t=>t.id===old.tileA);
  const narrowSource={width:2,walking:validateWalkingApproach(source,sourceTile,old.from,old.startDirection,2,2,om,ot,[]),landing:validateWalkingApproach(source,sourceTile,old.from,old.startDirection,2,3,om,ot,[],true)};
  const narrowWindowRoutes=[];
  // Diagnostic minimum-width windows use the unchanged 2 ft rule. Existing discovery
  // proposes 3/2.1 ft windows only; do not change its production search ordering here.
  if(narrowSource.walking.valid)for(const target of targets){const plan=Math.hypot(target.point[0]-old.from[0],target.point[1]-old.from[1]),rise=target.point[2]-old.from[2];
    const proposal={...old,to:target.point,plan,rise,distance:Math.hypot(plan,rise),usableWidth:2,startWidth:2,endWidth:target.width,endDirection:target.outward,startProfile:undefined,endProfile:target.run,connectionClass:Math.abs(rise)/plan>1/20?'VERTICAL':'ADAPTIVE'};
    for(const route of routeAlternatives(proposal))narrowWindowRoutes.push({route:route.name,pair:route.pair,validation:validateAlternative(route.pair,om,ot,[],budget,route.name)});
  }
  alternatives.push({tileA:old.tileA,tileB:old.tileB,budget,targetDiscovery:dest,exact,qualified,narrowSource,narrowWindowRoutes});
 }
}
const final=finalizeForTest('copies-4',4,{cellsX:4,cellsY:4,cellsZ:1},om,om,ot,1,performance.now(),0);
for(const o of original)assert.equal(hash(JSON.stringify(o.mesh)),o.initial);assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),hash(bytes));assert.equal(load('types').LATTICE_FEET,20);assert(ot.every(t=>t.iz===0&&!t.zLift));
const result={mode:before?'before':'after',synthetic,gateBenchmark,original:{sessionSHA256:hash(bytes),lattice:{cellsX:4,cellsY:4,cellsZ:1},placements:ot,hashes:original.map(o=>({code:o.code,sha256:o.initial})),trials,connectors:synth.connectors.length,ramps:synth.ramps,stairs:synth.stairs,components:synth.organicDiagnostics.components,status:final.status,portRejections:matched.rejectionCounts,organicRejections:synth.organicDiagnostics.rejections,replay},alternatives};
fs.writeFileSync(path.join(out,before?'before-integrated.json':'after-integrated.json'),JSON.stringify(result,null,2));
// Actual mesh walking sections in a longitudinal diagnostic plane, not a browser screenshot.
for(const example of [level,ramp,stair]){const p=example.pair,meshes=transitionMeshes(p),scale=105,xx=x=>100+(x-6)*scale,zz=z=>310-(z-top(a))*scale;const lines=meshes.flatMap(m=>{const sections=m.positions.length/12,points=Array.from({length:sections},(_,i)=>[m.positions[i*12],m.positions[i*12+2]]);return ['<polyline fill="none" stroke="#D6AD4F" stroke-width="3" points="'+points.map(([x,z])=>xx(x)+','+zz(z)).join(' ')+'"/>'];});const svg='<svg xmlns="http://www.w3.org/2000/svg" width="850" height="440" viewBox="0 0 850 440"><rect width="850" height="440" fill="#000"/><g font-family="Arial" fill="#F7F6F5"><text x="30" y="34" font-size="19">'+(before?'Before':'After')+' — '+example.name+'</text><text x="30" y="60" font-size="14">'+example.result.reason+'; original floor white, emitted walking section gold</text></g><path d="M '+xx(6)+' '+zz(p.from[2])+' H '+xx(8)+' M '+xx(12)+' '+zz(p.to[2])+' H '+xx(14)+'" fill="none" stroke="#F7F6F5" stroke-width="4"/>'+lines.join('')+'<g stroke="#71BEDA" stroke-dasharray="4 4"><path d="M '+xx(8)+' 90 V 385 M '+xx(12)+' 90 V 385"/></g></svg>';fs.writeFileSync(path.join(out,(before?'before-':'after-')+example.name.replaceAll(' ','-')+'-section.svg'),svg);}
console.log(JSON.stringify({mode:result.mode,synthetic:synthetic.map(s=>({name:s.name,reason:s.result.reason,geometry:s.geometry})),original:{...result.original,replay:undefined,organicRejections:undefined},alternatives:alternatives.map(a=>({pair:a.tileA+' / '+a.tileB,exact:a.exact.length,qualified:a.qualified?.outcomes.length??0,accepted:a.qualified?.accepted.length??0}))}));
