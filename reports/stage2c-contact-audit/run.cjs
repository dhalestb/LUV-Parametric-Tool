/* eslint-disable @typescript-eslint/no-require-imports -- Diagnostic CommonJS harness, no production edits. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),load=n=>require(path.join(root,'src/components/lattice',n+'.ts'));
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {analyzeMesh}=load('analyze'),{faceTriangles}=load('parseObj'),{worldFromLocal,localPoint}=load('surfaceAttachment'),{surfaceOrientation,sourceMaterialAtPoint}=load('surfaceOrientation');
const {transitionMeshes,transitionSections,planRun}=load('transitionGeometry'),{validateAlternative}=load('alternativeRouting'),{validateWalkingApproach}=load('walkingApproach'),{transitionSurfaceClear}=load('connectionClearance');
const {captureConnectionDiagnostics}=load('connectionDiagnostics');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),geometry=m=>hash(JSON.stringify([Array.from(m.positions),Array.from(m.normals),m.faces]));
const bytes=fs.readFileSync(path.join(root,'checkpoints/lattice-session.json')),session=JSON.parse(bytes),prior=JSON.parse(fs.readFileSync(path.join(root,'reports/stage2b-bounded/results.json'))),fixture=JSON.parse(fs.readFileSync(path.join(root,'reports/local-material/surface-regression.json')));
const models=['O2','O1','G1','L1'].map(code=>{const raw=session.meshes.find(m=>m.id===session.assignments[code]),mesh={...raw,positions:Float32Array.from(raw.positions),normals:Float32Array.from(raw.normals),faces:raw.faces.map(f=>Array.isArray(f)?{vertices:f,normals:null}:f)},model=analyzeMesh(mesh,code,1,mesh.upAxis),faceMap=mesh.faces.flatMap((face,index)=>faceTriangles(face).map((_,fan)=>({originalFace:index,fanTriangle:fan})));assert.equal(geometry(mesh),prior.sources.find(s=>s.code===code).geometrySHA256);return {code,mesh,model,faceMap};});
// Instrument only an in-memory copy to enumerate contacts, keeping production
// broad phase, intersection predicate and allowed seam rule unchanged.
const f=path.join(root,'src/components/lattice/connectionClearance.ts'),hook=new Module(f);hook.filename=f;hook.paths=Module._nodeModulePaths(path.dirname(f));
hook._compile(ts.transpileModule(fs.readFileSync(f,'utf8')+`
export function enumerateContacts(pair:PortPair,tile:PlacedTile,model:TileModel){
 const source=trianglesOf({positions:model.connectionSurface!.positions,indices:model.connectionSurface!.triangles});
 const ids=new Map(source.map((t,i)=>[t,i])),tree=build([...source]);
 const endpoint=tile.id===pair.tileA?pair.from:pair.to,dir=tile.id===pair.tileA?pair.startDirection!:pair.endDirection!;
 const ep=localPoint(endpoint,tile,model),dv=sub(localPoint(endpoint.map((v,i)=>v+dir[i]) as Vec3,tile,model),ep);
 const allowed=(p:Vec3)=>Math.abs(dot(sub(p,ep),dv))<=.04&&Math.abs(p[2]-ep[2])<=.26;
 const out:unknown[]=[];
 transitionMeshes(pair).forEach((mesh,mi)=>trianglesOf(mesh).forEach((world,fi)=>{
   const tri=world.map(p=>localPoint(p,tile,model)) as Triangle,box=bounds([tri]);
   const visit=(node:Node)=>{if(!overlaps(box,node))return;if(node.triangles){for(const original of node.triangles)if(intersects(tri,original,()=>false))out.push({mesh:mi,face:fi,sourceTriangle:ids.get(original),originalLocal:original,connectorWorld:world,rejected:intersects(tri,original,allowed)});}else{visit(node.left!);visit(node.right!);}};visit(tree);
 }));return out;
}
`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
const centroid=p=>[0,1,2].map(k=>p.reduce((n,p)=>n+p[k],0)/p.length);
const eps=1e-8;
// Independent plane/interval clipping, not the production segment-hit test.
function intersection(a,b){
 const na=unit(cross(sub(a[1],a[0]),sub(a[2],a[0]))),nb=unit(cross(sub(b[1],b[0]),sub(b[2],b[0]))),axis=cross(na,nb);
 if(!na.every(Number.isFinite)||!nb.every(Number.isFinite))return [];
 if(norm(axis)<eps){if(Math.abs(dot(na,sub(b[0],a[0])))>eps)return [];let poly=a;
   for(let i=0;i<3;i++){const edge=sub(b[(i+1)%3],b[i]),d=p=>dot(nb,cross(edge,sub(p,b[i]))),next=[];for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length],dp=d(p),dq=d(q);if(dp>=-eps)next.push(p);if((dp>eps&&dq< -eps)||(dp< -eps&&dq>eps))next.push(add(p,mul(sub(q,p),dp/(dp-dq))));}poly=next;}return poly;
 }
 const cut=(tri,n,p)=>{const points=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],da=dot(n,sub(a,p)),db=dot(n,sub(b,p));if(Math.abs(da)<=eps)points.push(a);if(da*db<0)points.push(add(a,mul(sub(b,a),da/(da-db))));}return points;};
 const ca=cut(a,nb,b[0]),cb=cut(b,na,a[0]);if(!ca.length||!cb.length)return [];
 const u=unit(axis),origin=ca[0],ts=p=>dot(sub(p,origin),u),ia=ca.map(ts),ib=cb.map(ts),lo=Math.max(Math.min(...ia),Math.min(...ib)),hi=Math.min(Math.max(...ia),Math.max(...ib));return lo>hi+eps?[]:[add(origin,mul(u,lo)),add(origin,mul(u,hi))];
}
function station(point,pair){let best={distance:Infinity,station:0},run=0;for(let i=1;i<pair.path.length;i++){const a=pair.path[i-1],b=pair.path[i],d=sub(b,a),len=Math.hypot(d[0],d[1]),t=Math.max(0,Math.min(1,((point[0]-a[0])*d[0]+(point[1]-a[1])*d[1])/(len*len||1))),p=add(a,mul(d,t)),distance=Math.hypot(point[0]-p[0],point[1]-p[1]);if(distance<best.distance)best={distance,station:run+t*len};run+=len;}return best;}
function centerlineContacts(pair,tile,model,code){const ep=code==='G1'?pair.from:pair.to,dir=code==='G1'?pair.startDirection:pair.endDirection,out=[];surfaceOrientation(model.connectionSurface).triangles.forEach((tri,id)=>{const [a,b,c]=tri.points.map(p=>worldFromLocal(p,tile,model)),u=sub(b,a),v=sub(c,a),n=cross(u,v),uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),det=uu*vv-uv*uv;if(Math.abs(det)<1e-14)return;for(let segment=0;segment<pair.path.length-1;segment++){const p=pair.path[segment],d=sub(pair.path[segment+1],p),den=dot(n,d);if(Math.abs(den)<1e-12)continue;const t=dot(n,sub(a,p))/den;if(t< -1e-9||t>1+1e-9)continue;const point=add(p,mul(d,t)),w=sub(point,a),wu=dot(w,u),wv=dot(w,v),s=(wu*vv-wv*uv)/det,r=(wv*uu-wu*uv)/det;if(s< -1e-9||r< -1e-9||s+r>1+1e-9)continue;const outward=dot(sub(point,ep),dir),height=point[2]-ep[2];out.push({sourceTriangle:id,segment,t,point,outward,height,...station(point,pair),permittedSeam:Math.abs(outward)<=.04&&Math.abs(height)<=.26});}});return out;}
function stageChecks(pair,tiles){const path=pair.path,sections=transitionSections(pair),run=planRun(path),meshes=transitionMeshes(pair),stair=meshes[0].kind==='stair',start=unit(sub(path[1],path[0])),end=unit(sub(path.at(-2),path.at(-1)));
 const slopes=path.slice(1).map((p,i)=>Math.abs(p[2]-path[i][2])/Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
 const folds=sections.slice(1).flatMap((b,i)=>{const a=sections[i],d=sub(b.center,a.center);return d[0]*a.side[1]-d[1]*a.side[0]<=1e-6||d[0]*b.side[1]-d[1]*b.side[0]<=1e-6?[i]:[];});
 const edges=[-1,1].map(sign=>sections.map(s=>add(s.center,mul(s.side,s.width/2*sign))));const edgeSlopes=edges.flatMap(edge=>edge.slice(1).map((p,i)=>Math.abs(p[2]-edge[i][2])/Math.hypot(p[0]-edge[i][0],p[1]-edge[i][1])));
 const approaches=['G1','L1'].map(code=>{const m=models.find(m=>m.code===code),tile=tiles.find(t=>t.id===m.model.id),isA=code==='G1',point=isA?pair.from:pair.to,dir=isA?pair.startDirection:pair.endDirection,width=isA?pair.startWidth:pair.endWidth;return {code,width,walking:validateWalkingApproach(m.model,tile,point,dir,width,2,models.map(m=>m.model),tiles,fixture.connectors),landing:validateWalkingApproach(m.model,tile,point,dir,width,Math.max(3,width),models.map(m=>m.model),tiles,fixture.connectors,true)};});
 return {run,kind:meshes[0].kind,startDot:dot(start,pair.startDirection),endDot:dot(end,pair.endDirection),maxCenterlineSlope:Math.max(...slopes),centrelinePass:dot(start,pair.startDirection)>0&&dot(end,pair.endDirection)>0&&(stair?approaches.every(a=>a.landing.valid):Math.max(...slopes)<=1/12+1e-6)&&approaches.every(a=>a.walking.valid),folds,maxEdgeSlope:Math.max(...edgeSlopes),sections,approaches};}
const alignment=prior.configurations.filter(c=>c.preservedLinks.every(p=>p.clear)).flatMap(c=>{const p=c.bAudits.find(a=>a.target==='B-3')?.pair;if(!p)return [];const u=[(p.to[0]-p.from[0])/p.plan,(p.to[1]-p.from[1])/p.plan,0];return [{number:c.number,worst:Math.min(dot(u,p.startDirection),-dot(u,p.endDirection))}];}).sort((a,b)=>b.worst-a.worst);assert.equal(alignment[0].number,2);
const choices=[[1,'curved','original / clear near-exit underside collision'],[1,'direct','original reversed arrival control'],[2,'curved','best source/destination chord alignment'],[2,'direct','best alignment stair construction'],[3,'right bridge alignment','O1 interference eliminated'],[21,'curved','clear near-G1 departure evidence at a repositioned L1'],[21,'direct','path and sections pass before emitted collision']];
const report={checkpoint:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sessionSHA256:hash(bytes),alignmentRanking:alignment,triangleIdConvention:'zero-based connectionSurface triangle in original OBJ face-fan order; originalFace and fanTriangle also zero-based; mesh/face zero-based emitted mesh and index-triple',cases:[]};
// Analytic outward volume probes, not new route candidates or changed meshes.
// Clip every original source triangle against a full-width rectangular prism.
const clip=(poly,d)=>{const next=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=d(a),db=d(b);if(da>=0)next.push(a);if(da*db<0)next.push(add(a,mul(sub(b,a),da/(da-db))));}return next;};
report.localVolumes=[];
for(const code of ['G1','L1']){const c=prior.configurations[0],pair=c.bAudits.find(a=>a.route==='curved'&&a.target==='B-3').pair,m=models.find(m=>m.code===code),tile=code==='G1'?prior.fixed.find(t=>t.id===m.model.id):c.tile,ep=code==='G1'?pair.from:pair.to,dir=code==='G1'?pair.startDirection:pair.endDirection,width=code==='G1'?pair.startWidth:pair.endWidth,side=[-dir[1],dir[0],0];
 const world=(x,y,z)=>add(ep,add(mul(dir,x),add(mul(side,y),[0,0,z]))),frame=p=>[dot(sub(p,ep),dir),dot(sub(p,ep),side),p[2]-ep[2]];
 const probes=[];
 for(const depth of [.5,2])for(const [name,low,high] of [['body',-.25,-.00001],['headroom',.05,6.5]]){const hits=[];surfaceOrientation(m.model.connectionSurface).triangles.forEach((t,id)=>{let p=t.points.map(p=>frame(worldFromLocal(p,tile,m.model)));for(const d of [p=>p[0]-.040001,p=>depth-p[0],p=>p[1]+width/2,p=>width/2-p[1],p=>p[2]-low,p=>high-p[2]]){p=clip(p,d);if(!p.length)break;}if(p.length>=3&&norm(cross(sub(p[1],p[0]),sub(p[2],p[0])))>1e-10)hits.push({sourceTriangle:id,...m.faceMap[id],region:t.region,normalZ:t.normalZ,polygon:p,world:p.map(p=>world(...p))});});probes.push({name,depth,width,range:[low,high],hits});}
 const materialProbes=[.05,.1,.15,.2,.25,.5,1,2].flatMap(x=>[-.125,.1].map(z=>({outward:x,height:z,point:world(x,0,z),...sourceMaterialAtPoint(m.model.connectionSurface,localPoint(world(x,0,z),tile,m.model))})));
 report.localVolumes.push({code,point:ep,outward:dir,width,probes,materialProbes});
}
for(const [number,route,why] of choices){const c=prior.configurations[number-1],old=c.bAudits.find(a=>a.target==='B-3'&&a.route===route),pair=structuredClone(old.pair),tiles=[...prior.fixed,c.tile],meshes=transitionMeshes(pair),stages=stageChecks(pair,tiles),audit=[];
 for(const code of ['G1','L1']){const m=models.find(m=>m.code===code),tile=tiles.find(t=>t.id===m.model.id),orientation=surfaceOrientation(m.model.connectionSurface),ep=code==='G1'?pair.from:pair.to,dir=code==='G1'?pair.startDirection:pair.endDirection;
  const contacts=hook.exports.enumerateContacts(pair,tile,m.model).map(hit=>{const originalWorld=hit.originalLocal.map(p=>worldFromLocal(p,tile,m.model)),points=intersection(hit.connectorWorld,originalWorld),frames=points.map(p=>({point:p,outward:dot(sub(p,ep),dir),lateral:dot(sub(p,ep),[-dir[1],dir[0],0]),height:p[2]-ep[2],...station(p,pair)})),meta=orientation.triangles[hit.sourceTriangle];return {...hit,...m.faceMap[hit.sourceTriangle],originalWorld,points,frames,sourceNormalZ:meta.normalZ,rawNormal:meta.rawNormal,region:meta.region,component:meta.component,independentConfirmed:points.length>0};});
  const captured=captureConnectionDiagnostics(()=>transitionSurfaceClear(pair,[tile],[m.model]),30);assert.equal(captured.value,false);assert(contacts.some(h=>h.rejected));
  const witnesses=contacts.filter(h=>h.rejected&&h.independentConfirmed).sort((a,b)=>Math.min(...a.frames.map(f=>Math.abs(f.outward)))-Math.min(...b.frames.map(f=>Math.abs(f.outward)))).slice(0,8).map(h=>{const mid=centroid(h.points),n=unit(cross(sub(h.originalWorld[1],h.originalWorld[0]),sub(h.originalWorld[2],h.originalWorld[0])));return {mesh:h.mesh,face:h.face,sourceTriangle:h.sourceTriangle,mid,materialSides:[-1,1].map(sign=>{const p=add(mid,mul(n,sign*.005));return {point:p,...sourceMaterialAtPoint(m.model.connectionSurface,localPoint(p,tile,m.model))};})};});
  audit.push({code,centerlineContacts:centerlineContacts(pair,tile,m.model,code),contacts,witnesses,productionClear:captured.value,counts:{all:contacts.length,rejected:contacts.filter(h=>h.rejected).length,allowed:contacts.filter(h=>!h.rejected).length,independentlyConfirmed:contacts.filter(h=>h.independentConfirmed).length,rejectedNotIndependentlyConfirmed:contacts.filter(h=>h.rejected&&!h.independentConfirmed).length}});
 }
 const check=captureConnectionDiagnostics(()=>validateAlternative(structuredClone(pair),models.map(m=>m.model),tiles,fixture.connectors,{attachments:128,pairs:96,routes:768,maxSpan:50,maxRun:72},route),64);
 report.cases.push({number,tile:c.tile,rotation:c.rotation,route,why,pair,meshSHA256:hash(JSON.stringify(meshes)),meshes,stages,validator:check.value,audit});
 console.log(JSON.stringify({number,route,kind:stages.kind,path:stages.centrelinePass,folds:stages.folds.length,first:check.value.reason,contacts:audit.map(a=>({code:a.code,...a.counts}))}));
}
for(const c of report.cases)for(const a of c.audit)for(const h of a.contacts){h.connectorArea=norm(cross(sub(h.connectorWorld[1],h.connectorWorld[0]),sub(h.connectorWorld[2],h.connectorWorld[0])))/2;if(h.rejected&&!h.independentConfirmed)assert.equal(h.connectorArea,0,'Unconfirmed rejected contact must be separately investigated');}
for(const m of models)assert.equal(geometry(m.mesh),prior.sources.find(s=>s.code===m.code).geometrySHA256);
assert.equal(hash(fs.readFileSync(path.join(root,'checkpoints/lattice-session.json'))),prior.sessionSHA256);assert.equal(hash(JSON.stringify(fixture.connectors)),prior.existingConnectorsSHA256);
report.checks=['Same seven Stage 2B route pairs; original profiles and paths retained; no new placements or families','All production endpoint collision rejections reproduced; source triangle IDs map to original face-fan order','Independent plane/interval intersection witnesses recorded separately from production predicate','Original OBJ geometry and session bytes unchanged; prior ramp/stair hashes unchanged; no graph changes'];
fs.writeFileSync(path.join(__dirname,'audit.json'),JSON.stringify(report,null,2)+'\n');
