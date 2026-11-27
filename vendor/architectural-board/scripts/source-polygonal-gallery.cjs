// Rule 5B v2: actual transformed contours; open native recesses, no inferred infill.
const fs=require('node:fs'),path=require('node:path'),T=require('three');
require('../proof/rule-amphitheater.cjs');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const EPS=1e-7,THICKNESS=.4;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
const obj=m=>[...Array.from({length:m.positions.length/3},(_,i)=>'v '+m.positions.slice(i*3,i*3+3).join(' ')),...Array.from({length:m.indices.length/3},(_,i)=>'f '+m.indices.slice(i*3,i*3+3).map(v=>v+1).join(' '))].join('\n');
function contains(contours,p){let inside=false;for(const c of contours)for(let i=0,j=c.length-1;i<c.length;j=i++){const a=c[i],b=c[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
async function buildPolygonalGallery(r,out){
 if(r.linearGallery?.footprint){const data=await require('./linear-gallery-approved-envelope.cjs').build(r,out);if(!data.architecturalValidation.passed)throw Error(data.architecturalValidation.failures.join('; '));return {...data,parts:undefined,root:undefined,galleryReport:{...data.report,solidComponents:data.report.componentClassification.length,exportStatus:'NoError',profileTolerance:1e-7,limitations:['Circulation access and structural support unverified.',...data.report.surfaces.filter(c=>c.kind==='connection'&&c.headroom!==null&&c.headroom<7).map(c=>c.id+': '+c.headroom.toFixed(2)+' ft overhead clearance; invalid for circulation.')],circulation:[]}};}
 if(r.linearGallery?.architectureVersion!=='legacy-v2')return require('./source-gallery-receivers.cjs').buildReceiverGallery(r,out);
 const {nodes,letters}=require('./source-envelope.cjs').derive(r);
 require('../src/components/linearGalleryPopulation.ts').galleryArrangement(r);
 if(r.source.length<3||r.generator!=='source-preserving')throw Error('Polygonal gallery needs at least three preserved L/U/V sources.');
 const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
 const M=wasm.Manifold,CS=wasm.CrossSection,H=r.field.height,mid=H/2,bands=[],profiles=[],projections=[],walls=[],relationships=[];
 const polygon=p=>new CS([p],'NonZero');
 const union=items=>items.length?CS.union(items):new CS();
 const rect=(a,b,n,depth)=>polygon([a,b,b.map((v,k)=>v+n[k]*depth),a.map((v,k)=>v+n[k]*depth)]);
 const fieldPlan=polygon([[-r.field.width/2,-r.field.depth/2],[r.field.width/2,-r.field.depth/2],[r.field.width/2,r.field.depth/2],[-r.field.width/2,r.field.depth/2]]);
 function band(id,sources,solid){if(!solid.isEmpty())bands.push({id,sources,solid});}
 for(const [index,n] of nodes.entries()){
  const shape=getLetterShape(n.p.letter),matrix=new T.Matrix4().fromArray(n.matrix);
  const normal=new T.Vector3(0,0,1).transformDirection(matrix);
  if(Math.abs(normal.z)<1-1e-6)throw Error(n.id+': polygonal v2 needs a horizontal native source profile. Edited pose retained; upright/tilted development requires an explicit architectural operation.');
  const center=new T.Box2().setFromPoints(shape.getPoints(32)).getCenter(new T.Vector2());
  const transform=p=>new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(matrix).toArray().slice(0,2);
  const contour=featurePoints(shape,n.p.scale*Math.max(n.p.scaleX,n.p.scaleY)).map(transform),native=polygon(contour);
  const positions=letters[index].mesh.positions,zs=positions.filter((_,i)=>i%3===2),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  if(minZ<mid-EPS&&maxZ>mid+EPS)throw Error(n.id+': source crosses the mid-height transition. Pose retained.');
  const zone=minZ>=mid-EPS?'upper':'lower',z=zone==='upper'?minZ+THICKNESS:maxZ;
  const area=contour.reduce((sum,p,i)=>sum+cross(p,contour[(i+1)%contour.length]),0)/2;
  // Select only native exterior line curves. Bezier chords never become wall edges.
  const indices={L:[0,1,4,5],U:[0,3],V:[4,5,6]}[n.p.letter];
  const edges=indices.map(curveIndex=>{const c=shape.curves[curveIndex],a=transform(c.getPoint(0)),b=transform(c.getPoint(1)),d=sub(b,a),length=Math.hypot(...d),t=d.map(v=>v/length),normal=area>0?[t[1],-t[0]]:[-t[1],t[0]];return {curveIndex,a,b,t,normal,length};});
  profiles.push({source:n.id,level:n.p.levelIndex,zone,minZ,maxZ,z,contour,native,edges,plan:native,projectionPlans:[]});
 }
 if(!profiles.some(p=>p.zone==='lower')||!profiles.some(p=>p.zone==='upper'))throw Error('Polygonal gallery requires actual source groups on both sides of the mid-height transition. Existing poses retained.');
 const firstUpper=Math.min(...profiles.filter(p=>p.zone==='upper').map(p=>p.minZ));
 if(Math.abs(firstUpper-mid)>EPS)throw Error('Upper footprint must begin exactly at Z='+mid+' ft; first native underside is '+firstUpper+' ft. Edited source poses retained.');
 for(const [index,p] of profiles.entries()){
  for(const [edgeIndex,e] of p.edges.entries()){
   const preferred=[1,5,10][(index+edgeIndex)%3],choices=[preferred,...[10,5,1].filter(d=>d!==preferred)];
   let depth,projection;
   for(const candidate of choices){const strip=rect(e.a,e.b,e.normal,candidate);if(strip.subtract(fieldPlan).area()<EPS){depth=candidate;projection=strip;break;}}
   if(!depth)throw Error(p.source+': no permitted exterior projection fits the field; source retained.');
   // Never fill the native concavity. Projections are supported only by selected outer edges.
   projection=projection.subtract(p.native);
   p.projectionPlans.push(projection);projections.push({source:p.source,level:p.level,zone:p.zone,curveIndex:e.curveIndex,a:e.a,b:e.b,normal:e.normal,depth,z:p.z,usableWidth:depth,occupancy:depth===1?'edge articulation':'candidate; circulation clearance not certified',contours:projection.toPolygons()});
  }
  p.plan=union([p.native,...p.projectionPlans]);
 }
 const levels=[...new Set(profiles.map(p=>p.level))].sort((a,b)=>a-b),floors=[];
 for(const level of levels){
  const ps=profiles.filter(p=>p.level===level),z=ps[0].z;
  if(ps.some(p=>Math.abs(p.z-z)>EPS))throw Error('Edited sources in level '+level+' have different physical top elevations. Preserve poses and explicitly split this level.');
  const plan=union(ps.map(p=>p.plan)),solid=plan.extrude(THICKNESS).translate([0,0,z-THICKNESS]);
  band('polygonal-level-'+level,ps.map(p=>p.source),solid);
  const eroded=plan.offset(-1.5,'Miter',2),clearRegions=eroded.isEmpty()?0:eroded.decompose().length;
  floors.push({level,z,zone:ps[0].zone,sources:ps.map(p=>p.source),area:plan.area(),contours:plan.toPolygons(),occupiedRegions:plan.decompose().length,threeFootClearRegions:clearRegions,plan});
 }
 const ordered=floors.slice().sort((a,b)=>a.z-b.z);
 for(let i=1;i<ordered.length;i++){
  const below=profiles.filter(p=>p.level===ordered[i-1].level),above=profiles.filter(p=>p.level===ordered[i].level),gap=Math.min(...above.map(p=>p.minZ))-Math.max(...below.map(p=>p.maxZ));
  const crossesZone=below[0].zone!==above[0].zone;
  const valid=crossesZone?Math.abs(Math.min(...above.map(p=>p.minZ))-mid)<=EPS:[5,10,15].some(v=>Math.abs(gap-v)<1e-5);
  relationships.push({lower:ordered[i-1].level,upper:ordered[i].level,actualSurfaceSeparation:gap,crossesZone,rule:crossesZone?'exact mid-height anchor; no inter-zone spacing interval':'within-zone 5/10/15-ft source-surface separation',valid});
  if(!valid)throw Error('Actual source-surface separation '+gap+' ft is not 5, 10 or 15 ft. Edited poses retained.');
 }
 const wallGroups=new Map();
 function addWallPlan(p,top,plan,receivers=[]){const key=p.level+':'+top;let group=wallGroups.get(key);if(!group){group={level:p.level,zone:p.zone,bottom:p.z-THICKNESS,top,plans:[],sources:new Set()};wallGroups.set(key,group);}group.plans.push(plan);group.sources.add(p.source);receivers.forEach(id=>group.sources.add(id));}
 // Exact edge events divide contact regions. Inward-ray events divide corresponding recesses.
 for(const p of profiles)for(const e of p.edges){
  const candidates=profiles.filter(q=>p.zone==='lower'?q.zone==='upper'&&Math.abs(q.minZ-mid)<=EPS:q.minZ>p.maxZ+EPS),events=[0,e.length];
  if(p.zone==='lower')addWallPlan(p,mid,rect(e.a,e.b,e.normal.map(v=>-v),.3).intersect(p.native));
  for(const q of candidates)for(const contour of q.plan.toPolygons())for(let i=0;i<contour.length;i++){
   const a=contour[i],b=contour[(i+1)%contour.length],v=sub(b,a),den=cross(e.t,v);
   if(Math.abs(den)>EPS){const t=cross(sub(a,e.a),v)/den,u=cross(sub(a,e.a),e.t)/den;if(t>EPS&&t<e.length-EPS&&u>=-EPS&&u<=1+EPS)events.push(t);}
   const t=dot(sub(a,e.a),e.t);if(t>EPS&&t<e.length-EPS)events.push(t);
  }
  const stops=[...new Set(events.map(x=>Math.round(x*1e8)/1e8))].sort((a,b)=>a-b);
  for(let i=1;i<stops.length;i++){
   const lo=stops[i-1],hi=stops[i];if(hi-lo<1e-5)continue;
   const at=t=>e.a.map((v,k)=>v+e.t[k]*t),center=at((lo+hi)/2);
   let receiver,condition='no-upper-receiver',setback;
   for(const q of candidates.slice().sort((a,b)=>a.minZ-b.minZ)){
    const contours=q.plan.toPolygons();
    if(contains(contours,center)){receiver=q;condition='direct-contact';setback=0;break;}
    const inward=e.normal.map(v=>-v),hits=[];
    for(const c of contours)for(let j=0;j<c.length;j++){
     const a=c[j],b=c[(j+1)%c.length],v=sub(b,a),den=cross(inward,v);
     if(Math.abs(den)>EPS){const d=cross(sub(a,center),v)/den,u=cross(sub(a,center),inward)/den;if(d>EPS&&d<=10&&u>=0&&u<=1)hits.push(d);}
    }
    if(hits.length){receiver=q;condition='recessed';setback=Math.min(...hits);break;}
   }
   let top=p.zone==='lower'?mid:receiver?receiver.z-THICKNESS:p.z;
   const transition=p.zone==='lower';
   const a=at(lo),b=at(hi),wallPlan=rect(a,b,e.normal.map(v=>-v),.3).intersect(p.plan);
   if(p.zone==='upper'&&top>p.z+EPS)addWallPlan(p,top,wallPlan,receiver?[receiver.source]:[]);
   const contact=receiver&&condition==='direct-contact'?wallPlan.intersect(receiver.plan).area():0;
   walls.push({source:p.source,curveIndex:e.curveIndex,a,b,bottomZ:p.z,topZ:top,condition,receiver:receiver?.source,setback:setback??null,physicalContact:contact>EPS,contactArea:contact,transition,vertical:true,unresolved:!receiver&&p.zone==='upper'});
  }
 }
 for(const [index,group] of [...wallGroups.values()].entries()){const plan=union(group.plans).simplify(EPS);band('wall-group-'+group.level+'-'+index,[...group.sources],plan.extrude(group.top-group.bottom).translate([0,0,group.bottom]));}
 const raw=M.union(bands.map(b=>b.solid)).simplify(EPS),clip=M.cube([r.field.width,r.field.depth,H]).translate([-r.field.width/2,-r.field.depth/2,0]);
 if(raw.subtract(clip).volume()>1e-6)throw Error('Polygonal architecture exceeds field. No automatic clipping permitted.');
 if(raw.status()!=='NoError')throw Error('Polygonal Boolean result: '+raw.status());
 const architecture=pack(raw),mesh=new wasm.Mesh({numProp:3,vertProperties:new Float32Array(architecture.positions),triVerts:new Uint32Array(architecture.indices)});mesh.merge();const exported=new M(mesh);
 if(exported.status()!=='NoError')throw Error('Polygonal Float32 export: '+exported.status());
 const components=bands.map(b=>({id:b.id,sources:b.sources,mesh:pack(b.solid)}));
 // Measure route material and width; a union is never treated as circulation validation.
 const routeChecks=floors.map(f=>({level:f.level,connectedOccupiedPlan:f.occupiedRegions===1,threeFootClearRegions:f.threeFootClearRegions}));
 const conflicts=[];
 if(routeChecks.some(f=>!f.connectedOccupiedPlan||f.threeFootClearRegions!==1))conflicts.push('Source-derived occupied surfaces do not provide one continuous 3-ft-clear route at every level.');
 conflicts.push('No source-derived interlevel walking connection has been validated; vertical walls establish geometry only.');
 const lowerSolid=M.union(bands.filter(b=>b.solid.boundingBox().max[2]<=mid+EPS).map(b=>b.solid)),upperSolid=M.union(bands.filter(b=>b.solid.boundingBox().min[2]>=mid-EPS).map(b=>b.solid));
 const lowerTop=lowerSolid.boundingBox().max[2],upperBottom=upperSolid.boundingBox().min[2];
 const transitionCheck={elevation:mid,lowerTop,upperBottom,verticalGap:upperBottom-lowerTop,passed:Math.abs(lowerTop-mid)<=EPS&&Math.abs(upperBottom-mid)<=EPS,lowerWallMaximum:Math.max(...walls.filter(w=>profiles.find(p=>p.source===w.source).zone==='lower').map(w=>w.topZ)),contactPlanArea:lowerSolid.slice(mid-1e-5).intersect(upperSolid.slice(mid+1e-5)).area()};
 if(!transitionCheck.passed)throw Error('Zone extents do not meet at the exact mid-height transition.');
 const galleryReport={transition:transitionCheck,version:'polygonal-v2',midHeight:mid,floors:floors.map(({plan,...f})=>f),sourceProfiles:profiles.map(({native,plan,projectionPlans,edges,...p})=>({...p,edges})),projections,walls,relationships,routeChecks,circulation:[],solidComponents:raw.decompose().length,exportStatus:exported.status(),profileTolerance:.01,intentionalOpenings:'Only native contours and exterior strips are occupied; all other regions remain empty.',limitations:conflicts};
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'combined-envelope.json'),JSON.stringify(architecture));fs.writeFileSync(path.join(out,'combined-envelope.obj'),obj(architecture));
 for(const c of components)fs.writeFileSync(path.join(out,c.id+'.obj'),obj(c.mesh));
 const manifest={generator:r.generator,validation:{status:raw.status(),outside:0,sourceOutside:0,shellVolumes:raw.decompose().map(s=>s.volume())},instances:nodes.map(n=>({pose:n.p,matrix:n.matrix})),components:[{id:'zone-lower',solid:lowerSolid,zone:'lower'},{id:'zone-upper',solid:upperSolid,zone:'upper'}].map(c=>{const file=c.id+'.obj';fs.writeFileSync(path.join(out,file),obj(pack(c.solid)));return {file,sources:profiles.filter(p=>p.zone===c.zone).map(p=>p.source),finalVolume:c.solid.volume()};}),tools:[]};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(out,'gallery-report.json'),JSON.stringify(galleryReport,null,2));
 return {architecture,primary:architecture,letters,components,volume:raw.volume(),bounds:raw.boundingBox(),sourceCount:r.source.length,galleryReport,architecturalValidation:{passed:conflicts.length===0,failures:conflicts},paths:[]};
}
module.exports={buildPolygonalGallery};
