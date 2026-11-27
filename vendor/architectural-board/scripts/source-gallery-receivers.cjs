// Gallery-only analytic platforms and finite-width receiver-controlled walls.
const fs=require('node:fs'),path=require('node:path'),T=require('three');
require('../proof/rule-amphitheater.cjs');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const EPS=1e-7,SLAB=.4,WALL=.3,CLEANUP=1e-6;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>a.map((v,i)=>v-b[i]);
function pack(s){const m=s.getMesh(),p=[];for(let i=0;i<m.vertProperties.length;i+=m.numProp)p.push(...m.vertProperties.slice(i,i+3));return {positions:p,indices:Array.from(m.triVerts)};}
const obj=m=>[...Array.from({length:m.positions.length/3},(_,i)=>'v '+m.positions.slice(i*3,i*3+3).join(' ')),...Array.from({length:m.indices.length/3},(_,i)=>'f '+m.indices.slice(i*3,i*3+3).map(x=>x+1).join(' '))].join('\n');
function verticalHit(mesh,x,y,above=-Infinity){
 let z=Infinity;const p=mesh.positions,ix=mesh.indices;
 for(let k=0;k<ix.length;k+=3){const a=ix[k]*3,b=ix[k+1]*3,c=ix[k+2]*3;
  const den=(p[b+1]-p[c+1])*(p[a]-p[c])+(p[c]-p[b])*(p[a+1]-p[c+1]);if(Math.abs(den)<1e-14)continue;
  const u=((p[b+1]-p[c+1])*(x-p[c])+(p[c]-p[b])*(y-p[c+1]))/den,v=((p[c+1]-p[a+1])*(x-p[c])+(p[a]-p[c])*(y-p[c+1]))/den;
  if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9){const hit=u*p[a+2]+v*p[b+2]+(1-u-v)*p[c+2];if(hit>above+EPS&&hit<z)z=hit;}
 }
 return Number.isFinite(z)?z:null;
}
function canonicalizeExport(w,mesh){
 const p=mesh.positions.slice(),tol=1e-5,buckets=new Map();let moved=0,maxDisplacement=0;
 for(let i=0;i<p.length;i+=3){
  const x=p[i],y=p[i+1],gx=Math.floor(x/tol),gy=Math.floor(y/tol);let match;
  for(let dx=-1;dx<=1&&!match;dx++)for(let dy=-1;dy<=1&&!match;dy++)for(const q of buckets.get((gx+dx)+':'+(gy+dy))??[])if(Math.hypot(x-q[0],y-q[1])<=tol){match=q;break;}
  if(match){const d=Math.hypot(x-match[0],y-match[1]);if(d){moved++;maxDisplacement=Math.max(maxDisplacement,d);}p[i]=match[0];p[i+1]=match[1];}
  else{const key=gx+':'+gy,list=buckets.get(key)??[];list.push([x,y]);buckets.set(key,list);}
 }
 const input=new w.Mesh({numProp:3,vertProperties:new Float32Array(p),triVerts:new Uint32Array(mesh.indices)});input.merge();
 const solid=new w.Manifold(input);if(solid.status()!=='NoError')throw Error('Gallery export correspondence weld is invalid: '+solid.status());
 return {solid,mesh:pack(solid),report:{tolerance:tol,movedVertices:moved,maxDisplacement,beforeTriangles:mesh.indices.length/3,afterTriangles:solid.getMesh().triVerts.length/3,zUnchanged:true}};
}

async function buildReceiverGallery(r,out){
 require('../src/components/linearGalleryPopulation.ts').galleryArrangement(r);
 const {nodes,letters}=require('./source-envelope.cjs').derive(r),w=await require('manifold-3d/manifold.js').default();w.setup();
 const M=w.Manifold,CS=w.CrossSection,mid=r.field.height/2,defined=r.linearGallery.arrangementMode==='defined-levels';
 const polygon=p=>new CS([p],'NonZero'),union=ps=>ps.length?CS.union(ps).simplify(CLEANUP):CS.square(0);
 const rect=(a,b,n,d)=>polygon([a,b,b.map((v,i)=>v+n[i]*d),a.map((v,i)=>v+n[i]*d)]);
 const field=polygon([[-r.field.width/2,-r.field.depth/2],[r.field.width/2,-r.field.depth/2],[r.field.width/2,r.field.depth/2],[-r.field.width/2,r.field.depth/2]]);
 const profiles=[],projections=[],bands=[],floors=[],wallRecords=[],wallGroups=new Map(),relationships=[];
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],matrix=new T.Matrix4().fromArray(n.matrix),normal=new T.Vector3(0,0,1).transformDirection(matrix);
  if(Math.abs(normal.z)<1-1e-6)throw Error(n.id+': gallery requires a horizontal source; edited orientation retained.');
  const pos=letters[i].mesh.positions,zs=pos.filter((_,j)=>j%3===2),minZ=Math.min(...zs),maxZ=Math.max(...zs),zone=minZ>=mid-EPS?'upper':'lower';
  if(minZ<mid-EPS&&maxZ>mid+EPS)throw Error(n.id+': source crosses the mid-height boundary. Pose retained.');
  if(defined){
   const p=n.p;if(p.galleryNominalZ===undefined||![-4,0,4].includes(p.galleryElevationOffset)||p.galleryZone!==zone||Math.abs(minZ-p.galleryNominalZ-p.galleryElevationOffset)>EPS)throw Error(n.id+': edited elevation does not match its defined nominal level and discrete offset; pose retained.');
  }
  const shape=getLetterShape(n.p.letter),center=new T.Box2().setFromPoints(shape.getPoints(32)).getCenter(new T.Vector2());
  const transform=p=>new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(matrix).toArray().slice(0,2);
  const contour=featurePoints(shape,n.p.scale*Math.max(n.p.scaleX,n.p.scaleY)).map(transform),native=polygon(contour);
  const signed=contour.reduce((s,a,j)=>s+cross(a,contour[(j+1)%contour.length]),0)/2;
  const edges={L:[0,1,4,5],U:[0,3],V:[4,5,6]}[n.p.letter].map(curveIndex=>{const c=shape.curves[curveIndex],a=transform(c.getPoint(0)),b=transform(c.getPoint(1)),d=sub(b,a),length=Math.hypot(...d),t=d.map(v=>v/length),normal=signed>0?[t[1],-t[0]]:[-t[1],t[0]];return {a,b,t,normal,length,curveIndex};});
  profiles.push({source:n.id,level:n.p.levelIndex,nominalZ:n.p.galleryNominalZ,elevationOffset:n.p.galleryElevationOffset,zone,minZ,maxZ,base:minZ,z:minZ+SLAB,contour,native,edges,mesh:letters[i].mesh});
 }
 if(!profiles.some(p=>p.zone==='lower')||!profiles.some(p=>p.zone==='upper')||Math.abs(Math.min(...profiles.filter(p=>p.zone==='upper').map(p=>p.minZ))-mid)>EPS)throw Error('Upper footprint must begin exactly at Z='+mid+' ft. Edited poses retained.');
 for(const p of profiles){p.plan=p.native;p.contours=p.native.toPolygons();}
 // Consolidate coincident surfaces only; nominal levels never generate a slab.
 const heightGroups=new Map();
 for(const p of profiles){let group=[...heightGroups.values()].find(g=>g.zone===p.zone&&Math.abs(g.base-p.base)<=EPS);if(!group){group={base:p.base,zone:p.zone,profiles:[]};heightGroups.set(heightGroups.size,group);}group.profiles.push(p);}
 for(const group of [...heightGroups.values()].sort((a,b)=>a.base-b.base)){
  const ps=group.profiles,plan=union(ps.map(p=>p.plan)),native=union(ps.map(p=>p.native)),level=floors.length;
  const solid=plan.extrude(SLAB).translate([0,0,group.base]),id='polygonal-level-'+level;
  const clear=plan.offset(-1.5,'Miter',2),widthRegions=clear.isEmpty()?0:clear.decompose().length;
  bands.push({id,sources:ps.map(p=>p.source),zone:group.zone,solid});
  floors.push({id,level,nominalLevels:[...new Set(ps.map(p=>p.level))],z:group.base+SLAB,bottomZ:group.base,zone:group.zone,sources:ps.map(p=>p.source),area:plan.area(),nativeArea:native.area(),exteriorProjectionArea:plan.subtract(native).area(),duplicateAreaRemoved:ps.reduce((a,p)=>a+p.plan.area(),0)-plan.area(),unsupportedInfillArea:0,contours:plan.toPolygons(),purpose:widthRegions?'native letter footprint; circulation unverified':'source-edge articulation only; no occupied width certified',planar:true,occupiedRegions:plan.decompose().length,threeFootClearRegions:widthRegions,plan,solid});
  for(const p of ps)p.floorMesh=pack(solid);
 }
 const nominalLevels=[...new Set(profiles.map(p=>p.level))].sort((a,b)=>a-b);
 for(let i=1;i<nominalLevels.length;i++){
  const below=profiles.filter(p=>p.level===nominalLevels[i-1]),above=profiles.filter(p=>p.level===nominalLevels[i]),gap=Math.min(...above.map(p=>p.minZ))-Math.max(...below.map(p=>p.maxZ)),crossesZone=below[0].zone!==above[0].zone;
  const valid=defined||crossesZone||[5,10,15].some(v=>Math.abs(gap-v)<1e-5);
  relationships.push({lower:nominalLevels[i-1],upper:nominalLevels[i],actualSurfaceSeparation:gap,crossesZone,valid,rule:defined?'nominal levels and discrete offsets; source-gap constraints inactive':crossesZone?'exact half-height anchor':'5/10/15-ft source-surface gaps'});
  if(!valid)throw Error('Edited source-surface separation '+gap+' ft is not 5, 10 or 15 ft. Poses retained.');
 }
 function sample(plan){const m=plan.extrude(.01).getMesh();for(let k=0;k<m.triVerts.length;k+=3){const ids=Array.from(m.triVerts.slice(k,k+3));if(ids.every(i=>m.vertProperties[i*m.numProp+2]>.009))return [0,1].map(a=>ids.reduce((s,i)=>s+m.vertProperties[i*m.numProp+a],0)/3);}return plan.toPolygons()[0][0];}
 function addPiece(p,e,plan,receiver,condition){
  if(plan.isEmpty()||plan.area()<=EPS)return;
  const receivingZ=receiver?.base,top=p.zone==='lower'?Math.min(mid,receivingZ??mid):receivingZ??p.z;
  const physical=condition==='direct-contact'&&receiver&&Math.abs(top-receiver.base)<=EPS;
  const point=sample(plan),hit=physical?verticalHit(receiver.mesh,point[0],point[1],p.z):null;
  if(top>p.z+EPS){
   const key=p.zone+':'+p.z+':'+top;let g=wallGroups.get(key);if(!g){g={zone:p.zone,start:p.z,top,plans:[],sources:new Set()};wallGroups.set(key,g);}g.plans.push(plan);g.sources.add(p.source);if(receiver)g.sources.add(receiver.source);
  }
  wallRecords.push({source:p.source,curveIndex:e.curveIndex,a:e.a,b:e.b,contours:plan.toPolygons(),bottomZ:p.z,topZ:top,receiver:receiver?.source,receivingZ:receivingZ??null,worldMeshReceivingZ:hit,nativeReceiverUnderside:receiver?.minZ??null,condition:p.zone==='lower'&&receivingZ>mid?'mid-height-transition':condition,physicalContact:!!physical,contactArea:physical?plan.area():0,vertical:true,unresolved:!receiver&&p.zone==='upper',transition:p.zone==='lower'&&Math.abs(top-mid)<=EPS});
 }
 for(const p of profiles)for(const e of p.edges){
  const occupiedElsewhere=union(profiles.filter(q=>q!==p&&Math.abs(q.base-p.base)<=EPS).map(q=>q.native));
  let remaining=rect(e.a,e.b,e.normal.map(v=>-v),WALL).intersect(p.native).subtract(occupiedElsewhere).simplify(CLEANUP);
  for(const q of profiles.filter(q=>q!==p&&q.base>p.z+EPS).sort((a,b)=>a.base-b.base)){
   if(remaining.isEmpty())break;
   const direct=remaining.intersect(q.plan);if(!direct.isEmpty()){addPiece(p,e,direct,q,'direct-contact');remaining=remaining.subtract(direct);}
   if(remaining.isEmpty())break;
   for(const edge of q.edges){
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
    if(dot(edge.normal,e.normal)<1-1e-12 || (p.zone==='lower' && q.base>mid+EPS))continue;
    const depth=-dot(sub(edge.a,e.a),e.normal);
    if(![1,5,10].some(d=>Math.abs(d-depth)<1e-5))continue;
    const ends=[edge.a,edge.b].map(v=>dot(sub(v,e.a),e.t));
    const lo=Math.max(0,Math.min(...ends)),hi=Math.min(e.length,Math.max(...ends));
    if(hi<=lo+EPS)continue;
    const at=t=>e.a.map((v,i)=>v+e.t[i]*t);
    const foot=remaining.intersect(rect(at(lo),at(hi),e.normal,-WALL));
    for(const part of foot.decompose()){
     if(part.isEmpty() || part.area()<=EPS)continue;
     const ts=part.toPolygons().flat().map(v=>dot(sub(v,e.a),e.t));
     if(!ts.length || Math.max(...ts)-Math.min(...ts)<=EPS)continue;
     const a=at(Math.min(...ts)),b=at(Math.max(...ts));
     let strip=rect(a,b,e.normal,-depth);
     for(const other of profiles.filter(o=>o.maxZ>q.base+EPS && o.base<q.base+SLAB-EPS))strip=strip.subtract(other.native);
     if(strip.area()<=EPS)continue;
     const overhead=profiles.filter(o=>o.base>=q.base+SLAB-EPS && o.native.intersect(strip).area()>EPS);
     const id='setback-'+projections.length;
     bands.push({id,sources:[p.source,q.source],zone:q.zone,solid:strip.extrude(SLAB).translate([0,0,q.base])});
     projections.push({id,source:p.source,receiver:q.source,curveIndex:e.curveIndex,receiverCurve:edge.curveIndex,a,b,normal:e.normal,depth,z:q.base+SLAB,contours:strip.toPolygons(),headroom:overhead.length?Math.min(...overhead.map(o=>o.base))-q.base-SLAB:null,occupiable:false,purpose:'connection between setback walls; no verified circulation route'});
     addPiece(p,e,part,q,'recessed');remaining=remaining.subtract(part);
    }
   }
  }
  addPiece(p,e,remaining,null,p.zone==='lower'?'mid-height-transition':'no-upper-receiver');
 }
 for(const [i,g] of [...wallGroups.values()].entries()){
  const plan=union(g.plans),solid=plan.extrude(g.top-g.start).translate([0,0,g.start]);
  bands.push({id:'wall-group-'+i,sources:[...g.sources],zone:g.zone,solid,start:g.start,top:g.top});
 }
 const raw=M.union(bands.map(b=>b.solid)).asOriginal().simplify(CLEANUP),clip=M.cube([r.field.width,r.field.depth,r.field.height]).translate([-r.field.width/2,-r.field.depth/2,0]);
 if(raw.status()!=='NoError'||raw.subtract(clip).volume()>1e-6)throw Error('Gallery receiver geometry is invalid or outside the field; no source poses altered.');
 const cleaned=canonicalizeExport(w,pack(raw)),architecture=cleaned.mesh,exported=cleaned.solid;
 if(exported.status()!=='NoError')throw Error('Gallery Float32 export invalid: '+exported.status());
 let penetration=0;
 for(const b of bands.filter(b=>b.id.startsWith('wall-')))for(const f of floors)penetration=Math.max(penetration,Math.abs(b.solid.intersect(f.solid).volume()));
 const overshoots=wallRecords.filter(a=>a.receivingZ!==null&&a.topZ>a.receivingZ+EPS);
 const missingHits=wallRecords.filter(a=>a.physicalContact&&(a.worldMeshReceivingZ===null||Math.fround(a.topZ)>a.worldMeshReceivingZ+EPS));
 const lower=M.union(bands.filter(b=>b.zone==='lower').map(b=>b.solid)),upper=M.union(bands.filter(b=>b.zone==='upper').map(b=>b.solid));
 const transition={elevation:mid,lowerTop:lower.boundingBox().max[2],upperBottom:upper.boundingBox().min[2],verticalGap:upper.boundingBox().min[2]-lower.boundingBox().max[2],lowerWallMaximum:Math.max(...wallRecords.filter(a=>profiles.find(p=>p.source===a.source).zone==='lower').map(a=>a.topZ))};
 transition.passed=Math.abs(transition.lowerTop-mid)<=EPS&&Math.abs(transition.upperBottom-mid)<=EPS;
 if(!transition.passed)throw Error('Receiver-derived source arrangement does not meet at the exact mid-height boundary. Poses retained.');
 const floorPlates=floors.map(({plan,solid,...f})=>f),routeChecks=floors.map(f=>({level:f.level,connectedOccupiedPlan:f.occupiedRegions===1,threeFootClearRegions:f.threeFootClearRegions}));
 const failures=[];
 if(overshoots.length||missingHits.length||penetration>EPS)failures.push('Wall-receiver penetration remains.');
 if(routeChecks.some(f=>!f.connectedOccupiedPlan||f.threeFootClearRegions!==1))failures.push('Some source platforms do not have one continuous 3-ft-clear region.');
 failures.push('Staggered platforms have no independently validated interlevel walking route.');
 const galleryReport={exportCleanup:cleaned.report,version:'receiver-v3',arrangementMode:r.linearGallery.arrangementMode??'source-gaps',midHeight:mid,transition,floors:floorPlates,retainedFloorPlates:floorPlates,projections,walls:wallRecords,relationships,routeChecks,circulation:[],sourceProfiles:profiles.map(({native,plan,mesh,floorMesh,edges,contours,...p})=>({...p,edges})),solidComponents:exported.decompose().length,exportStatus:exported.status(),profileTolerance:.01,wallValidation:{overshootCount:overshoots.length,unverifiedDirectMeshHits:missingHits.length,maxFloorPenetrationVolume:penetration,passed:overshoots.length===0&&missingHits.length===0&&penetration<=EPS},openings:{arbitraryInfillArea:0,policy:'No nominal-level slab, native recess fill, transition slab, bridge or cap across empty regions.'},limitations:failures};
 const components=bands.map(b=>({id:b.id,sources:b.sources,mesh:pack(b.solid)}));
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'combined-envelope.json'),JSON.stringify(architecture));fs.writeFileSync(path.join(out,'combined-envelope.obj'),obj(architecture));
 for(const c of components)fs.writeFileSync(path.join(out,c.id+'.obj'),obj(c.mesh));
 const manifest={generator:r.generator,validation:{status:raw.status(),outside:0,sourceOutside:0,shellVolumes:exported.decompose().map(s=>s.volume())},instances:nodes.map(n=>({pose:n.p,matrix:n.matrix})),components:[{id:'zone-lower',solid:lower,zone:'lower'},{id:'zone-upper',solid:upper,zone:'upper'}].map(c=>{const file=c.id+'.obj';fs.writeFileSync(path.join(out,file),obj(pack(c.solid)));return {file,sources:profiles.filter(p=>p.zone===c.zone).map(p=>p.source),finalVolume:c.solid.volume()};}),tools:[]};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(out,'gallery-report.json'),JSON.stringify(galleryReport,null,2));fs.writeFileSync(path.join(out,'wall-receivers.json'),JSON.stringify({validation:galleryReport.wallValidation,walls:wallRecords},null,2));fs.writeFileSync(path.join(out,'retained-floor-plates.json'),JSON.stringify(floorPlates,null,2));
 return {architecture,primary:architecture,letters,components,sourceCount:r.source.length,volume:exported.volume(),bounds:exported.boundingBox(),galleryReport,architecturalValidation:{passed:failures.length===0,failures},paths:[]};
}
module.exports={buildReceiverGallery,verticalHit,canonicalizeExport};
