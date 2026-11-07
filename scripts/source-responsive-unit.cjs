// Analytic fixtures supplement, rather than replace, source-responsive-regression.cjs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(__dirname,'../src/components/lattice',n+'.ts'));
const hash=g=>crypto.createHash('sha256').update(JSON.stringify(g)).digest('hex');
const box=(z0,z1)=>({positions:Float32Array.from([-8,-4,z0,8,-4,z0,8,4,z0,-8,4,z0,-8,-4,z1,8,-4,z1,8,4,z1,-8,4,z1]),triangles:[0,3,2,0,2,1,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]});
const obj='v -8 -4 0\nv 8 -4 0\nv 8 4 0\nv -8 4 0\nv -8 -4 1\nv 8 -4 1\nv 8 4 1\nv -8 4 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8';
const template=load('analyze').analyzeMesh(load('parseObj').parseObj(obj,'analytic.obj'),null,1,'z');
const models=[{...template,id:'A',connectionSurface:box(-.5,0),sourceResponsiveExtensions:true},{...template,id:'B',connectionSurface:box(-.8,.2),sourceResponsiveExtensions:true}];
const tiles=models.map((m,i)=>({id:m.id,ix:i*2,iy:0,iz:0,variant:0}));
const pair=()=>({tileA:'A',tileB:'B',portA:'east',portB:'west',from:[8,0,0],to:[32,0,.2],plan:24,rise:.2,distance:Math.hypot(24,.2),usableWidth:2.5,startWidth:2.5,endWidth:3,startDirection:[1,0,0],endDirection:[-1,0,0],connectionClass:'ADAPTIVE',confidence:1,score:1,facing:1,widthCompatibility:1});
const prepared=()=>{const p=pair();p.path=load('transitionGeometry').transitionPath(p);return p;};
const validate=(p,mm=models,tt=tiles)=>load('portConnectionValidation').validateCirculationConnection(p,mm,tt,[]);
const tests=[];
function test(name,f){try{f();tests.push({name,status:'PASS'});console.log('PASS',name);}catch(e){tests.push({name,status:'FAIL',reason:e.stack});console.log('FAIL',name,e.message);}}
async function main(){
await load('extensionReconstruction').initializeExtensionReconstruction();

test('walking coverage preserves a Double-precision boundary under conforming triangle subdivision',()=>{
 const x=32.19076633453369,y=21.90376787185669,a=[x,y,0],b=[x+10,y,0],c=[x,y+10,0],fractions=[0,.13,.375,.525,.91,1];
 const raw={kind:'ramp',positions:Float64Array.from([...a,...b,...c]),indices:[0,1,2]},points=[a,...fractions.map(t=>b.map((v,k)=>v+t*(c[k]-v)))],indices=[];
 for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);
 const emitted={kind:'ramp',positions:Float64Array.from(points.flat()),indices};
 assert(load('extensionReconstruction').walkingCoverage([raw],[emitted],[]));
 assert.equal(load('extensionReconstruction').walkingCoverage([raw],[{...emitted,indices:indices.slice(3)}],[]),false);
});

test('partial source-contact clipping preserves actual Double boundary coordinates and rejects parallel separated surfaces',()=>{
 const api=load('extensionReconstruction'),a=[[8,0,0],[8,1.05,0],[8,0,1.5]],b=[[8,-8,0],[8,8,0],[8,8,1]];
 const fragments=api.capContactFragments(a,b);assert(fragments.length);assert(fragments.flat().some(p=>p[1]===1.05&&p[2]===0));
 assert(fragments.flat().every(p=>api.pointOnContact(p,a)&&api.pointOnContact(p,b)));
 assert.equal(api.capContactFragments(a.map(p=>[p[0]+1e-7,p[1],p[2]]),b).length,0);
});

test('closed mesh edge topology certifies a whole source-contact seam but rejects partial certificates and physical gaps',()=>{
  const api=load('extensionReconstruction');
  const part=(lo,hi)=>{const g=box(-1,0);return {kind:'ramp',positions:Float64Array.from(g.positions,(v,i)=>i%3===0?27.55+(v+8)/16:i%3===1?lo+(v+4)/8*(hi-lo):19+v),indices:g.triangles};};
  const certificates=m=>Array.from({length:m.indices.length/3},(_,face)=>({generatedFace:face,triangle:m.indices.slice(face*3,face*3+3).map(v=>Array.from(m.positions.slice(v*3,v*3+3)))})).filter(c=>c.triangle.every(p=>p[0]===27.55));
  const mesh=part(13.6,13.9),a=[27.55,13.65,18],b=[27.55,13.85,18],certs=certificates(mesh);
  assert(api.verifiedCapSeamCoversSegment(mesh,certs,a,b));
  assert(api.verifiedCapSeamCoversSegment(mesh,certs,[27.55,13.6-4e-13,18],[27.55,13.9+4e-13,18]));
  assert.equal(api.verifiedCapSeamCoversSegment(mesh,certs,[27.55,13.6-1e-7,18],b),false);
  const partial=certs.map(c=>({...c,triangle:c.triangle.map((p,i)=>p.map((v,k)=>v+(i===0&&k===1?1e-4:0)))}));
  assert.equal(api.verifiedCapSeamCoversSegment(mesh,partial,a,b),false);
  const left=part(13.6,13.75-5e-8),right=part(13.75+5e-8,13.9),gap={kind:'ramp',positions:Float64Array.from([...left.positions,...right.positions]),indices:[...left.indices,...right.indices.map(v=>v+left.positions.length/3)]};
  assert.equal(api.verifiedCapSeamCoversSegment(gap,certificates(gap),a,b),false);
  assert.equal(api.verifiedCapSeamCoversSegment({...mesh,indices:mesh.indices.slice(3)},certs,a,b),false);
});
test('native Double mesh extraction preserves distinct vertices that Float32 export collapses',()=>{
  const reconstruction=load('extensionReconstruction'),kernel=reconstruction.extensionGeometryKernel();
  const cube=kernel.Manifold.cube([1e-7,1,1]),solid=cube.translate([20,0,0]);
  try{const mesh=solid.getMesh(),positions=reconstruction.nativeMeshPositions(solid,mesh);
    assert(new Set(Array.from(positions).filter((_,i)=>i%3===0)).size>new Set(Array.from(mesh.vertProperties).filter((_,i)=>i%3===0)).size);
    const actual=solid.warpBatch(vertices=>vertices.set(positions));
    try{assert.equal(actual.status(),'NoError');assert(Math.abs(actual.volume()-solid.volume())<1e-14);}finally{actual.delete();}
  }finally{solid.delete();cube.delete();}
});
test('interface extrapolation cannot exempt an actual contained intersection',()=>{
  const outside=load('connectionClearance').extrapolatedInterfaceHit;
  const t=[[0,0,0],[1,0,0],[0,1,0]];
  assert.equal(outside([1+3.5e-7,0,0],t,t),true);
  assert.equal(outside([.25,.25,0],t,t),false);
  assert.equal(outside([1,0,0],t,t),false);
  assert.equal(outside([.25,.25,1e-7],t,t),true);
});

test('derived Boolean seam repair retains every face and does not weld physical gaps',()=>{
  // Recorded independent triangles at the actual G4/L1 Boolean seam. The
  // duplicate endpoint differs by 3.66e-15 feet; no source mesh is involved.
  const mesh={kind:'stair',positions:Float64Array.from([
    29.163310050964355,17.122171878814697,.7023863196372986,
    29.133899600853965,17.28325745162067,.745798319600232,
    29.163310050964355,17.421074784410102,.7769202276497661,
    29.14724120379687,17.414055844075445,.7769423958920193,
    29.146827901126933,17.416233406892342,.777530976580563,
    29.163310050964355,17.421074784410106,.776920227649767
  ]),indices:[0,1,2,3,4,5]};
  const geometry=load('extensionReconstruction'),audit=load('connectionClearance').auditDerivedSelfIntersections;
  assert.equal(audit(mesh).clear,false);
  const repair=geometry.canonicalizeDerivedSeams(mesh);
  assert.equal(mesh.indices.length,6);assert.equal(repair.corrected,1);
  assert(repair.maxDisplacement<4e-15);assert.equal(audit(mesh).clear,true);
  const separated={kind:'bridge',positions:Float64Array.from([0,0,0,1e-7,0,0]),indices:[]};
  assert.equal(geometry.canonicalizeDerivedSeams(separated).corrected,0);
});
test('verified interface metadata does not exempt genuine triangle penetration',()=>{
  const wall={...models[0],connectionSurface:{positions:Float32Array.from([0,0,-1,0,1,1,0,-1,1]),triangles:[0,1,2]}};
  const generated={positions:Float64Array.from([-1,0,0,1,0,0,0,.5,0]),indices:[0,1,2]};
  const metadata={extension:{reconstruction:{status:'PASS'},contacts:[{sourceId:'A',sourceTriangle:0,sourceTriangles:[0]}]}};
  const result=load('connectionClearance').auditGeneratedSurface(generated,[wall],[tiles[0]],()=>false,metadata);
  assert.equal(result.clear,false);assert.equal(result.sourceFace,0);assert.equal(result.generatedFace,0);
});
const originals=models.map(m=>hash(m.connectionSurface));let accepted;
test('different source thicknesses produce a validated derived ramp',()=>{accepted=prepared();assert.equal(validate(accepted).reason,'accepted',JSON.stringify(accepted.extension?.reconstruction));assert.equal(accepted.extension.start.thickness[0],.5);assert(Math.abs(accepted.extension.end.thickness[0]-1)<1e-6);const sections=load('transitionGeometry').transitionSections(accepted);assert(sections.some(s=>s.thickness[0]>.5&&s.thickness[0]<1));});
test('curved feature reconstruction preserves nonplanar canonical walking facets',()=>{
  const mm=[models[0],{...models[1],connectionSurface:box(-.8,1)}],p=pair();p.to[2]=1;p.rise=1;p.featureConnection={source:'edge',target:'edge',sourceFeature:'independent-east',targetFeature:'independent-west'};
  p.path=load('transitionGeometry').transitionPath(p,4);
  const result=validate(p,mm);assert.equal(result.reason,'accepted',JSON.stringify(result));
});
test('feature frames follow a feasible offset path without reversing walking triangles',()=>{
 const api=load('transitionGeometry'),p={...pair(),from:[0,0,0],to:[4,8,.35],rise:.35,plan:Math.hypot(4,8),usableWidth:2.1,startWidth:2.1,endWidth:2.1,featureConnection:{source:'edge',target:'edge',sourceFeature:'independent-a',targetFeature:'independent-b'}};
 p.path=api.transitionPath(p);const sections=api.transitionSections(p),edge=s=>[-1,1].map(sign=>s.center.map((v,k)=>v+sign*s.side[k]*s.width/2));
 const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=1;i<sections.length;i++){const [a,b]=edge(sections[i-1]),[c,d]=edge(sections[i]);assert(orient(a,b,d)<0&&orient(a,d,c)<0);}
 for(const s of [sections[0],sections.at(-1)])assert(Math.abs(s.side[0])<1e-12&&s.side[1]===1&&s.side[2]===0);
 for(const sign of [-1,0,1])for(let i=1;i<sections.length;i++){
   const point=s=>s.center.map((v,k)=>v+sign*s.side[k]*s.width/2),a=point(sections[i-1]),b=point(sections[i]);
   assert(Math.abs(b[2]-a[2])<=Math.hypot(b[0]-a[0],b[1]-a[1])/12+1e-6);
 }
});

test('reconstructed stairs retain verified treads, closed material, and both endpoint caps',()=>{
  const mm=[models[0],{...models[1],connectionSurface:box(-.8,1.2)}],tt=[tiles[0],{...tiles[1],ix:1}];
  const p=pair();p.to=[12,0,mm[1].connectionSurface.positions[14]];p.rise=p.to[2];p.plan=4;p.distance=Math.hypot(p.plan,p.rise);p.connectionClass='VERTICAL';p.startWidth=2.5;p.endWidth=2.5;p.path=load('transitionGeometry').transitionPath(p);
  const captured=load('connectionDiagnostics').captureConnectionDiagnostics(()=>validate(p,mm,tt),5000),result=captured.value;
  const audit=result.reason==='accepted'?undefined:load('transitionGeometry').transitionMeshes(p).map(mesh=>load('connectionClearance').auditGeneratedSurface(mesh,mm,tt,(point,id)=>p.extension?.contacts?.some(c=>c.sourceId===id&&load('extensionReconstruction').pointOnContact(point,c.triangle)),p));
  assert.equal(result.reason,'accepted',JSON.stringify({result,audit,contacts:p.extension?.contacts,events:captured.trace.events.filter(e=>e.stage!=='cache').map(e=>({stage:e.stage,reason:e.reason,point:e.detail.point,blocker:e.detail.blocker?.id}))}));
  assert.equal(p.extension.reconstruction.walkingCoverage,'VERIFIED');assert(p.extension.contacts.some(c=>c.sourceId==='A'));assert(p.extension.contacts.some(c=>c.sourceId==='B'));
  assert(load('transitionGeometry').transitionMeshes(p).every(m=>m.kind==='stair'));
});
test('actual emitted underside differs from the legacy slab',()=>{assert(accepted.extension);const measured=load('transitionGeometry').transitionMeshes(accepted),old=structuredClone(accepted);delete old.extension;assert.notEqual(hash(measured),hash(load('transitionGeometry').transitionMeshes(old)));});

test('descending feature stairs preserve actual tread dimensions and endpoint walking levels',()=>{
  const mm=[{...models[0],connectionSurface:box(-.5,1.2)},{...models[1],connectionSurface:box(-.8,0)}],tt=[tiles[0],{...tiles[1],ix:1}];
  const p=pair();p.from=[8,0,mm[0].connectionSurface.positions[14]];p.to=[12,0,0];p.rise=-p.from[2];p.plan=4;p.distance=Math.hypot(p.plan,p.rise);p.connectionClass='VERTICAL';p.startWidth=2.5;p.endWidth=2.5;
  p.featureConnection={source:'branch',target:'edge',sourceFeature:'independent-branch',targetFeature:'independent-edge'};p.path=load('transitionGeometry').transitionPath(p);
  const result=validate(p,mm,tt);assert.equal(result.reason,'accepted',JSON.stringify(result));assert.equal(p.extension.reconstruction.walkingCoverage,'VERIFIED');
});
test('website synthesis retains and freshly validates the measured path',()=>{
  const result=load('connectionSynthesis').synthesizeConnectors(models,tiles,[],{portPairs:[structuredClone(accepted)]});
  assert.equal(result.portPairs.length,1);assert.equal(result.organicDiagnostics.components,1);
  const emitted=result.connectors.filter(m=>m.portPair?.portA===accepted.portA&&m.portPair?.portB===accepted.portB);
  assert.deepEqual(emitted.map(m=>({positions:Array.from(m.positions),indices:m.indices})),load('transitionGeometry').transitionMeshes(accepted).map(m=>({positions:Array.from(m.positions),indices:m.indices})));
});
test('derived reconstruction is closed, source-cap verified, and walking-continuous',()=>{assert.equal(accepted.extension.reconstruction.status,'PASS');assert.equal(accepted.extension.reconstruction.walkingCoverage,'VERIFIED');for(const id of ['A','B'])assert(accepted.extension.contacts.some(c=>c.sourceId===id));});
test('website OBJ export preserves exact validated extension coordinates',()=>{
  const meshes=load('transitionGeometry').transitionMeshes(accepted);
  const connectors=meshes.map((mesh,i)=>({...mesh,id:'analytic-'+i,fromTile:'A',toTile:'B',direction:'none',reason:'analytic export regression',cost:0,portPair:accepted}));
  const text=load('connectionSynthesis').connectorsToObj(connectors);
  const vertices=text.split('\n').filter(line=>line.startsWith('v ')).flatMap(line=>line.slice(2).split(' ').map(Number));
  assert.deepEqual(vertices,meshes.flatMap(m=>Array.from(m.positions)));
  assert(!text.includes('reconstructedMeshes'));assert(text.includes('sourceTriangles'));
});
test('legacy fixtures retain uniform geometry without opt-in',()=>{const p=prepared(),legacy=models.map(m=>({...m,sourceResponsiveExtensions:false}));assert.equal(validate(p,legacy).reason,'accepted');assert.equal(p.extension,undefined);assert(load('transitionGeometry').transitionSections(p).every(s=>s.thickness===undefined));});
test('source arrays and topology remain unchanged',()=>assert.deepEqual(models.map(m=>hash(m.connectionSurface)),originals));
test('open underside does not become fabricated material',()=>{const open={...models[0],connectionSurface:{positions:models[0].connectionSurface.positions.slice(),triangles:[4,5,6,4,6,7]}};assert.notEqual(validate(prepared(),[open,models[1]]).reason,'accepted');});
test('placement changes cannot reuse a previous validation',()=>{const moved=tiles.map(t=>({...t}));moved[0].iy=1;assert.notEqual(validate(structuredClone(accepted),models,moved).reason,'accepted');});
test('headroom remains mandatory',()=>{const roof={...template,id:'roof',connectionSurface:box(1,1.2)},tt=[...tiles,{id:'roof',ix:0,iy:0,iz:0,variant:0}];assert.notEqual(validate(prepared(),[...models,roof],tt).reason,'accepted');});
test('original internal corridor requires actual full-width floor and clearance',()=>{
  const check=load('architecturalNetwork').originalWalkingCorridor;
  assert.equal(check(models[0],tiles[0],[-4,0,0],[4,0,0],2.5,models,tiles).status,'VERIFIED');
  const roof={...template,id:'roof',connectionSurface:box(1,1.2)},tt=[...tiles,{id:'roof',ix:0,iy:0,iz:0,variant:0}];
  assert.equal(check(models[0],tiles[0],[-4,0,0],[4,0,0],2.5,[...models,roof],tt).status,'UNVERIFIED');
  assert.equal(check(models[0],tiles[0],[-4,0,0],[4,0,10],2.5,models,tiles).status,'UNVERIFIED');
});
test('surface-role moments are subdivision-invariant and geometry revisions invalidate them',()=>{
  const original=box(-.5,0),refined={positions:Float32Array.from([...original.positions,0,0,0]),triangles:[...original.triangles.slice(0,6),4,5,8,5,6,8,6,7,8,7,4,8,...original.triangles.slice(12)]};
  const profile=load('architecturalSurfaces').architecturalSurfaces;
  const a=profile({...models[0],connectionSurface:original})[0],holder={...models[0],connectionSurface:refined},b=profile(holder)[0];
  assert.equal(a.role,b.role);assert(Math.abs(a.elongation-b.elongation)<1e-12);assert(Math.abs(a.area-b.area)<1e-12);
  for(let i=0;i<refined.positions.length;i+=3)refined.positions[i]*=2;
  assert(profile(holder)[0].elongation>b.elongation*1.9);
});
test('width remains mandatory',()=>{const p=prepared();p.startWidth=1;assert.notEqual(validate(p).reason,'accepted');});
test('geometry revisions invalidate thickness and emitted-mesh caches',()=>{const changed={...models[1],connectionSurface:{positions:models[1].connectionSurface.positions.slice(),triangles:models[1].connectionSurface.triangles.slice()}};for(let i=2;i<12;i+=3)changed.connectionSurface.positions[i]-=.1;const p=prepared();assert.equal(validate(p,[models[0],changed]).reason,'accepted');assert.notEqual(p.extension.end.revision,accepted.extension.end.revision);assert.notEqual(hash(load('transitionGeometry').transitionMeshes(p)),hash(load('transitionGeometry').transitionMeshes(accepted)));});
console.log(JSON.stringify(tests,null,2));if(tests.some(t=>t.status==='FAIL'))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
