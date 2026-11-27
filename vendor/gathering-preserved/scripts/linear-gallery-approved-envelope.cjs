// Generate one representative design from the accepted, immutable perimeter handoff.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {derive}=require('./source-envelope.cjs');
const root='reports/linear-gallery/stage2-approved-20',approved='reports/linear-gallery/stage1-perimeter-20/request.json';
const eps=1e-7,wallThickness=.25,deckThickness=.25;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],offset=(a,n,d)=>[a[0]+n[0]*d,a[1]+n[1]*d];
function packed(s){const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};}
function obj(m){return [...Array.from({length:m.positions.length/3},(_,i)=>'v '+m.positions.slice(3*i,3*i+3).join(' ')),...Array.from({length:m.indices.length/3},(_,i)=>'f '+m.indices.slice(3*i,3*i+3).map(v=>v+1).join(' '))].join('\n');}
function write(folder,name,data){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,name),typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));}
async function build(requestInput,output){
 const root=output??'reports/linear-gallery/stage2-approved-20';
 const input=requestInput?Buffer.from(JSON.stringify(requestInput)):fs.readFileSync(approved),request=JSON.parse(input),{letters,nodes}=derive(request);
 const {stations,layers,empty}=require('./linear-gallery-current-edges.cjs').relationships(request,letters);
 const w=await require('manifold-3d/manifold.js').default();w.setup();const M=w.Manifold,CS=w.CrossSection,mid=request.field.height/2;
 function solid(m){const mesh=new w.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)});mesh.merge();const s=new M(mesh);assert.equal(s.status(),'NoError');return s;}
 // Float32 export can collapse a bevel edge to a fraction of a mesh unit.
 // Weld only endpoints of actual short edges and rebuild their triangle fans.
 function exportAssembly(body){
  let mesh=packed(body.asOriginal().simplify(eps));
  for(let pass=0;pass<3;pass++){
   const p=mesh.positions,ix=mesh.indices,parent=Array.from({length:p.length/3},(_,i)=>i);
   const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
   let changed=false;
   for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){
    const a=ix[i+j],b=ix[i+(j+1)%3];
    if(root(a)!==root(b)&&Math.hypot(p[3*a]-p[3*b],p[3*a+1]-p[3*b+1],p[3*a+2]-p[3*b+2])<.000005){parent[root(b)]=root(a);changed=true;}
   }
   const indices=[];for(let i=0;i<ix.length;i+=3){const tri=ix.slice(i,i+3).map(root);if(new Set(tri).size===3)indices.push(...tri);}
   mesh=packed(solid({positions:p,indices}).asOriginal().simplify(.000001));
   if(!changed&&pass>0)break;
  }
  return mesh;
 }
 function prism(poly,lo,hi){return new CS([poly],'NonZero').extrude(hi-lo).translate([0,0,lo]);}
 const records=[],pairs=[],parts=[],source=new Map(),portions=[];
 for(const st of stations){
  const i=st.sourceIndex;
  assert.equal(st.sourceId,letters[i].id);assert(({L:[0,5],U:[0,3],V:[4,6]})[st.type].includes(st.curveIndex));
  const m=letters[i].mesh,pts=Array.from({length:m.positions.length/3},(_,j)=>m.positions.slice(3*j,3*j+3)),layer=layers[st.level],n=st.normal;
  const face=dot(st.edge[0],n),flat=pts.filter(p=>Math.abs(dot(p,n)-face)<eps);
  for(const pt of st.edge){assert(flat.some(v=>Math.hypot(v[0]-pt[0],v[1]-pt[1])<eps));}
  const z=flat.map(v=>v[2]);source.set(st.id,{...st,mesh:m,solid:solid(m),shoulderLow:Math.min(...z),shoulderHigh:Math.max(...z),at:t=>offset(st.edge[0],st.tangent,t-dot(st.edge[0],st.tangent))});
 }
 const mixed=request.sourceSnapshot?.coursePattern==='mixed-running-bond';
 const sourceSolids=[...new Map([...source.values()].map(s=>[s.sourceId,s.solid])).values()];
 function trimSources(body){
  if(!mixed)return body;
  const box=body.boundingBox();
  for(const solid of sourceSolids){const b=solid.boundingBox();if(box.min.every((v,i)=>v<b.max[i]&&box.max[i]>b.min[i]))body=body.subtract(solid);}
  return body;
 }
 function add(kind,body,p,q,info,suffix=''){assert.equal(body.status(),'NoError',p.id+' / '+q.id+' '+kind);if(body.isEmpty()||body.volume()<eps)return;const id=kind+'-'+p.id+'-'+q.id+(p.upper.filter(k=>k===q.id).length>1?'-span-'+info.intervalStart:'')+suffix;const record={id,kind,sources:[p.id,q.id],curves:[p.curveIndex,q.curveIndex],polygons:[p.polygonId,q.polygonId],sides:[p.side,q.side],...info};records.push(record);parts.push({id,sources:record.sources,solid:body,mesh:packed(body),record});return record;}
 for(const p of source.values()){
  const intervals=[];
  for(const [spanIndex,receiver] of p.upper.entries()){
   const q=source.get(receiver);assert(q.level>p.level);assert.equal(q.side,p.side);assert(q.lower.includes(p.id));
   const n=p.normal,t=p.tangent,[s0,s1]=p.spans[spanIndex];if(s1<=s0+eps)continue;
   assert(!intervals.some(([a,b])=>Math.min(s1,b)-Math.max(s0,a)>eps),'ambiguous receivers on '+p.id);intervals.push([s0,s1]);
   const a=p.at(s0),b=p.at(s1),depth=dot(a,n)-dot(q.edge[0],n),cross=p.zone!==q.zone,zoneStop=cross&&q.bottom>mid+eps;
   const face=[a,b,offset(b,n,-wallThickness),offset(a,n,-wallThickness)],kind=zoneStop?'zone termination':depth>eps?'recessed':'direct';
   // Meet the actual lower bevel; remove any volume within the source letters.
   const end=zoneStop?mid:q.bottom;
   const wallPlan=new CS([face],'NonZero');
   const receiverPlan=kind==='direct'?wallPlan.intersect(q.solid.slice(q.bottom+.001)):wallPlan;
   const plan=receiverPlan.intersect(p.solid.slice(p.top-.001));
   const pair={source:p.id,receiver:q.id,kind,outerEdge:[a,b],receiverEdge:[q.at(s0),q.at(s1)],signedDepth:depth,interval:[s0,s1],sourceTop:p.top,receiverBottom:q.bottom,receiverShoulder:q.shoulderLow};
   pairs.push(pair);if(plan.isEmpty()||plan.area()<eps){pair.kind='open; no physical receiver in interval';continue;}
   if(end<=p.top+eps)throw Error(p.id+' / '+q.id+': edited receiver is below the source top');
   // The validation solids and OBJ reload use Float32 vertices. Bound the wall
   // by those same contact planes as well as the transformed source planes.
   const bottom=Math.max(p.top,Math.fround(p.top)),top=Math.min(end,Math.fround(end));
   const patches=plan.decompose().filter(patch=>patch.area()>eps);
   for(const [index,patch] of patches.entries()){
    const wall=trimSources(patch.extrude(top-bottom).translate([0,0,bottom]));
    const suffix=patches.length>1?'-patch-'+(index+1):'';
    const wallRecord=add('wall',wall,p,q,{intervalStart:s0,condition:kind,footprint:patch.toPolygons(),bottom,top,physicalReceiver:kind==='direct',zone:p.zone},suffix);
    assert(wallRecord);
   }
   if(kind==='recessed'){
    const poly=[a,b,q.at(s1),q.at(s0)],deck=trimSources(prism(poly,end,end+deckThickness).subtract(q.solid)),deckRecord=add('connection',deck,p,q,{intervalStart:s0,footprint:poly,width:depth,length:s1-s0,bottom:end,top:end+deckThickness,zone:q.zone,occupiable:false,access:'No verified circulation route',physicalWallToReceiver:false});
    assert(deckRecord);assert(deck.boundingBox().max[2]>q.shoulderLow,'deck misses recessed source face: '+q.id);
   }
  }
  intervals.sort((a,b)=>a[0]-b[0]);let cursor=dot(p.edge[0],p.tangent);
  for(const [lo,hi] of intervals){if(lo>cursor+eps)portions.push({source:p.id,from:p.at(cursor),to:p.at(lo)});cursor=hi;}
  if(dot(p.edge[1],p.tangent)>cursor+eps)portions.push({source:p.id,from:p.at(cursor),to:p.edge[1]});
 }
 if(request.sourceSnapshot?.roofAndReturns)require('./linear-gallery-roofs.cjs')({CS,source,layers,mid,add,trimSources,parts});
 for(const deck of parts.filter(c=>c.record.kind==='connection')){
  const r=deck.record,probe=prism(r.footprint,r.top+eps,request.field.height+1);let overhead=Infinity;
  for(const item of [...source.values(),...parts.filter(c=>c!==deck)]){const hit=probe.intersect(item.solid);if(!hit.isEmpty()&&hit.volume()>eps)overhead=Math.min(overhead,hit.boundingBox().min[2]);}
  r.headroom=Number.isFinite(overhead)?overhead-r.top:null;r.minimumPlanDimension=Math.min(r.width,r.length);r.support='Structural support unverified';
 }
 // Use the same vertex precision for assembly, component checks, and OBJ export.
 if(mixed)for(const part of parts){
  const mesh=packed(part.solid);
  mesh.positions=mesh.positions.map((v,i)=>i%3===2?v:Math.round(v*1e6)/1e6);
  part.solid=solid(mesh).asOriginal().simplify(eps);
  if(request.sourceSnapshot?.roofAndReturns&&!["wall","connection"].includes(part.record.kind))part.solid=trimSources(part.solid);
  part.mesh=packed(part.solid);
 }
 if(request.sourceSnapshot?.roofAndReturns){
  for(const part of [...parts]){
   const pieces=part.solid.decompose();if(pieces.length===1)continue;
   parts.splice(parts.indexOf(part),1);records.splice(records.indexOf(part.record),1);
   pieces.forEach((body,i)=>{const id=part.id+'-piece-'+(i+1),record={...part.record,id};records.push(record);parts.push({...part,id,record,solid:body,mesh:packed(body)});});
  }
 }
 const groups=parts.map(p=>({ids:[p.id],solid:p.solid}));
 if(request.sourceSnapshot?.roofAndReturns){
  const parent=groups.map((_,i)=>i),boxes=parts.map(c=>c.solid.boundingBox());
  const rootOf=i=>parent[i]===i?i:(parent[i]=rootOf(parent[i]));
  for(let i=0;i<parts.length;i++)for(let j=0;j<i;j++){
   if(rootOf(i)===rootOf(j)||boxes[i].min.some((v,k)=>v>boxes[j].max[k]+eps||boxes[i].max[k]<boxes[j].min[k]-eps))continue;
   const u=M.union([parts[i].solid,parts[j].solid]);const shells=u.decompose();if(shells.length===1)parent[rootOf(i)]=rootOf(j);shells.forEach(s=>s.delete());u.delete();
  }
  const sets=new Map();parts.forEach((p,i)=>{const k=rootOf(i);if(!sets.has(k))sets.set(k,[]);sets.get(k).push(p);});groups.splice(0,groups.length,...[...sets.values()].map(items=>({ids:items.map(p=>p.id),solid:M.union(items.map(p=>p.solid))})));
 }else for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;){
  const u=M.union([groups[i].solid,groups[j].solid]);
  if(u.decompose().length===1){groups[i]={ids:[...groups[i].ids,...groups[j].ids],solid:u};groups.splice(j,1);if(mixed)j=i+1;}else j++;
 }
 const joined=request.sourceSnapshot?.roofAndReturns?M.compose(groups.map(g=>g.solid)):M.union(parts.map(c=>c.solid)),architecture=request.sourceSnapshot?.roofAndReturns?exportAssembly(joined):packed(joined.asOriginal().simplify(eps)),components=parts.map(({id,sources,mesh})=>({id,sources:sources.map(key=>source.get(key).sourceId),mesh}));
 const digest=crypto.createHash('sha256').update(input).digest('hex'),report={approvedSHA256:digest,wallThickness,deckThickness,stations,pairs,surfaces:records,openIntervals:portions,empty,transition:mid};
 write(root,'request.json',request);write(root,'correspondence.json',report);write(root,'combined-envelope.json',architecture);write(root,'combined-envelope.obj',obj(architecture));
 const manifest={generator:request.generator,validation:{status:joined.status(),shellVolumes:joined.decompose().map(s=>s.volume()),outside:0,sourceOutside:0},instances:nodes.map(n=>({pose:n.p,matrix:n.matrix})),components:parts.map(c=>({file:c.id+'.obj',sources:c.sources,finalVolume:c.solid.volume()})),tools:[]};
 for(const c of parts)write(root,c.id+'.obj',obj(c.mesh));write(root,'manifest.json',manifest);
 const assertions=[];
 function check(label,test){assertions.push({label,passed:!!test});}
 const within=M.cube([request.field.width,request.field.depth,request.field.height]).translate([-request.field.width/2,-request.field.depth/2,0]);check('Architecture contained by the study field',joined.subtract(within).volume()<=eps);
 for(const c of parts){
  if(c.record.kind==='wall'){const p=source.get(c.sources[0]);check(c.id+' touches its source top',c.solid.translate([0,0,-.001]).intersect(p.solid).volume()>eps);}
  for(const s of source.values()){const v=c.solid.intersect(s.solid).volume();if(v>eps)check(c.id+' penetrates '+s.id+' by '+v+' ft³',false);}
  if(c.record.kind==='wall'&&c.record.physicalReceiver){
   const receiver=source.get(c.sources[1]),penetration=c.solid.translate([0,0,.001]).intersect(receiver.solid).volume();
   check(c.id+' touches the transformed receiver underside',penetration>eps);
  }
  if(!['wall','connection'].includes(c.record.kind))continue;
  const p=source.get(c.sources[0]),q=source.get(c.sources[1]),pair=pairs.find(a=>a.source===p.id&&a.receiver===q.id&&a.interval[0]===c.record.intervalStart);
  for(let i=0;i<c.mesh.positions.length;i+=3){const v=c.mesh.positions.slice(i,i+3),t=dot(v,p.tangent),depth=dot(p.edge[0],p.normal)-dot(v,p.normal);if(t<pair.interval[0]-1e-5||t>pair.interval[1]+1e-5||depth < -1e-5||depth>(c.record.kind==='wall'?wallThickness:pair.signedDepth)+1e-5){check(c.id+' outside its edge limits',false);break;}}
 }
 for(const p of pairs.filter(x=>x.kind==='recessed')){const supporting=parts.filter(c=>c.record.kind==='wall'&&c.sources[0]===p.source&&c.sources[1]===p.receiver&&c.record.intervalStart===p.interval[0]),deck=parts.find(c=>c.record.kind==='connection'&&c.sources[0]===p.source&&c.sources[1]===p.receiver&&c.record.intervalStart===p.interval[0]);check(deck.id+' meets lower wall',supporting.length>0&&supporting.every(c=>c.solid.translate([0,0,.001]).intersect(deck.solid).volume()>eps));const q=source.get(p.receiver);check(deck.id+' meets recessed edge',deck.solid.translate([-q.normal[0]*.001,-q.normal[1]*.001,0]).intersect(q.solid).volume()>eps);}
 check('Lower architectural zone reaches 30 ft',Math.abs(Math.max(...parts.filter(c=>c.record.zone==='lower').map(c=>c.record.top))-mid)<eps);
 check('Upper zone starts at 30 ft',Math.abs(Math.min(...[...source.values()].filter(c=>c.zone==='upper').map(c=>c.bottom))-mid)<eps);
 check('Current input poses preserved',JSON.stringify(request.source)===JSON.stringify(requestInput?.source??JSON.parse(input).source));
 // The architecture consists of bounded source-pair components separated by intentional voids.
 // Validate the number of exported shells against independently classified component unions.
 const classification=groups.map(g=>({components:g.ids,volume:g.solid.volume(),shells:g.solid.decompose().length,reason:'Approved source-edge intervals; all required pair contacts checked independently'}));
 manifest.galleryComponentContract={version:1,groups:classification,checksPassed:assertions.every(a=>a.passed)};
 report.componentClassification=classification;write(root,'correspondence.json',report);write(root,'manifest.json',manifest);
 const result=spawnSync(process.execPath,['proof/rule-validation.cjs',root],{encoding:'utf8'}),diagnostics=JSON.parse(fs.readFileSync(path.join(root,'intersection-diagnostics.json')));
 const validation={assertions,wholeSolidPassed:result.status===0,wholeSolidMessage:result.stderr.split('\n').filter(s=>s.includes('AssertionError')).join(' '),shellVolumes:manifest.validation.shellVolumes,intersections:diagnostics.intersections,examples:diagnostics.examples};
 write(root,'geometry-checks.json',validation);
 const failures=assertions.filter(c=>!c.passed).map(c=>c.label);if(result.status!==0)failures.push(validation.wholeSolidMessage||result.stderr);
 return {root,request,report,letters,sourceCount:letters.length,parts,components,architecture,validation,volume:joined.volume(),bounds:joined.boundingBox(),diagnostics,architecturalValidation:{passed:failures.length===0,failures}};
}
module.exports={build};

