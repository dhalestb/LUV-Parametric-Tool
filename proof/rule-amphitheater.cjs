const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const THREE=require('three');
const render=require('./render.cjs');
const {requestConfig}=require('./field-config.cjs');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,filename);
const {getLetterShape,getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const {controlsFromPreset,scaleFromFootprintFeet}=require('../src/components/architecturalLetterSizing.ts');
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(p,t)=>p.map(v=>v*t),mix=(a,b,t)=>add(a,mul(sub(b,a),t));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=p=>{const n=Math.hypot(...p);if(n<1e-10)throw Error('Degenerate geometric direction');return mul(p,1/n);};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function serialize(s,color){const m=s.getMesh(),positions=[];for(let i=0;i<m.vertProperties.length;i+=m.numProp)positions.push(...m.vertProperties.slice(i,i+3));return {positions,indices:Array.from(m.triVerts),color};}
function obj(name,m,offset=0){return ['# feet; Z up; polygon mesh','o '+name,...Array.from({length:m.positions.length/3},(_,i)=>'v '+m.positions.slice(i*3,i*3+3).join(' ')),...Array.from({length:m.indices.length/3},(_,i)=>'f '+m.indices.slice(i*3,i*3+3).map(v=>v+1+offset).join(' '))].join(String.fromCharCode(10));}
async function build(input,out,fast=false){
 const started=performance.now(),config=requestConfig(input.field??{width:60,depth:40,height:40});
 fs.mkdirSync(out,{recursive:true});
 const write=(n,v)=>fs.writeFileSync(path.join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2));
 const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
 const {Manifold:M,Mesh}=wasm,union=parts=>M.union(parts);
 function surfaceCell(bottom,top,thickness){
  // Sweep each ruled-surface triangle along one consistent cell normal.
  // The Boolean union resolves adjacent prisms rather than accepting an
  // offset skin whose changing vertex normals can fold through itself.
  const tangent=sub(bottom.at(-1),bottom[0]);
  const rise=sub(mix(top[0],top.at(-1),.5),mix(bottom[0],bottom.at(-1),.5));
  const offset=mul(norm(cross(tangent,rise)),thickness/2),cells=[];
  const prism=triangle=>M.hull(triangle.flatMap(p=>[add(p,offset),sub(p,offset)]));
  for(let i=1;i<bottom.length;i++){
   cells.push(prism([bottom[i-1],bottom[i],top[i]]));
   cells.push(prism([bottom[i-1],top[i],top[i-1]]));
  }
  const solid=union(cells);
  if(solid.status()!=='NoError'||solid.volume()<=0)throw Error('Invalid thickened ruled envelope');
  return solid;
 }
 const sources=input.snapshot?.data?.arrangement?.originalPlacements??input.source;
 if(!sources?.length)throw Error('Selected Composition source is missing');
 const roles=Object.fromEntries(['L','U','V'].map(role=>[role,sources.map((p,i)=>({p,i})).filter(t=>t.p.letter===role)]));
 if(Object.values(roles).some(a=>!a.length))throw Error('This source set cannot provide the specified L boundaries, U enclosures and V transitions');
 const preferred=input.preferredFeet??controlsFromPreset(config.height).preferredFeet;
 const scales=sources.map(p=>input.preferredFeet!==undefined||input.notes?.startsWith('Diagnostic direct workflow input')?scaleFromFootprintFeet(preferred):p.scale);
 const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
 const S=mean(sources.map((p,i)=>scales[i]*p.scaleX*.92));
 const stroke=mean(sources.map((p,i)=>scales[i]*p.scaleZ*((input.thickness??12)/100+.02)));
 const lLength=mean(roles.L.map(t=>scales[t.i]*t.p.scaleX*.54));
 const uDepth=mean(roles.U.map(t=>scales[t.i]*t.p.scaleY*.73));
  const uArc=mean(roles.U.map(({p,i})=>{
  const points=getLetterShape('U').getPoints(32);
  const start=points.findIndex(q=>Math.hypot(q.x-.14,q.y-.45)<1e-6),end=points.findIndex((q,j)=>j>start&&Math.hypot(q.x+.14,q.y-.45)<1e-6);
  const curve=points.slice(start,end+1);
  return curve.slice(1).reduce((sum,q,j)=>sum+Math.hypot((q.x-curve[j].x)*p.scaleX,(q.y-curve[j].y)*p.scaleY)*scales[i],0);
 }));
 const uprightVHeight=Math.max(...roles.V.map(({p,i})=>{
  const g=getLetterVolumeGeometry('V',input.thickness??12);g.computeBoundingBox();
  return (g.boundingBox.max.y-g.boundingBox.min.y)*scales[i]*p.scaleY;
 }));
 const margin=S*.57,base=stroke;
 const focusDepth=uDepth,focusWidth=Math.min(config.width-2*margin,uDepth+2*lLength);
 const halfWidth=(config.width-2*margin)/2;
 const stageFront=-config.depth/2+Math.max(stroke,uDepth*.25+stroke*.35),stageBack=stageFront+focusDepth;
 const displacement=S*(input.staggerPercent??25)/100,run=displacement/Math.sqrt(2);
 const firstY=stageBack+stroke*.5,lastY=config.depth/2-margin;
 const minorRise=input.minorRise??stroke;
 if(!(minorRise>0&&run>0&&halfWidth>0&&lastY>firstY))throw Error('Field/source dimensions cannot accommodate a focus and ascending terraces');
 const planTerraces=Math.floor((lastY-firstY)/run)+1;
 const heightTerraces=Math.floor((config.height-base-Math.max(uprightVHeight,uDepth))/minorRise)+1;
 const capacity=Math.min(planTerraces,heightTerraces);
 if(capacity<2)throw Error('This field cannot accommodate an ascending pair of source-derived terraces');
 const boundaryLength=2*(capacity-1)*run+halfWidth*2;
 const enclosureSupportLength=Math.hypot(boundaryLength,config.height-(base+(capacity-1)*minorRise));
 const uNeed=Math.max(1,Math.ceil(enclosureSupportLength/uArc));
 const desired={L:capacity,U:uNeed,V:Math.max(1,capacity-1)};
 let counts={...desired};
 if(input.population!==undefined&&input.population!=='auto'){
  if(!Number.isInteger(input.population)||input.population<Object.keys(roles).length+1)throw Error('Target cannot supply the three required source functions');
  counts={L:2,U:1,V:1};
  while(counts.L+counts.U+counts.V<input.population){
   const candidates=['L','U','V'].filter(role=>counts[role]<desired[role]&&(role!=='V'||counts.V<Math.max(1,counts.L-1))).sort((a,b)=>(desired[b]-counts[b])/desired[b]-(desired[a]-counts[a])/desired[a]);
   if(!candidates.length){counts.U++;continue;}
   counts[candidates[0]]++;
  }

  if(counts.L+counts.U+counts.V!==input.population)throw Error('Target cannot reconcile terrace transitions without unused instances');
 }
 const terraceCount=counts.L,level=i=>base+i*minorRise;
 const heading=90+(roles.L[0].p.rz??0);
 const instances=[],features=[],sourceSolids=[],components=[],tools=[],cursors={L:0,U:0,V:0};
 const palette=i=>{const c=new THREE.Color().setHSL((i*.61803398875)%1,.6,.62);return [c.r,c.g,c.b].map(v=>v*255);};
 function transform(item,p){
  const s=scales[item.sourceIndex],source=item.source,shape=getLetterShape(source.letter).getPoints(32);
  const mid=[(Math.min(...shape.map(q=>q.x))+Math.max(...shape.map(q=>q.x)))/2,(Math.min(...shape.map(q=>q.y))+Math.max(...shape.map(q=>q.y)))/2];
  const q=new THREE.Vector3((p[0]-mid[0])*s*source.scaleX,(p[1]-mid[1])*s*source.scaleY,(p[2]??0)*s*source.scaleZ);
  q.applyAxisAngle(new THREE.Vector3(1,0,0),item.tilt*Math.PI/180).applyAxisAngle(new THREE.Vector3(0,0,1),item.yaw*Math.PI/180);
  return add(q.toArray(),item.center);
 }
 const box=M.cube([config.width,config.depth,config.height]).translate([-config.width/2,-config.depth/2,0]);
 function instance(role,target,index,intent={}){
  const original=roles[role][cursors[role]++%roles[role].length],source=original.p,s=scales[original.i];
  const id=role+'-'+index;
  const active=input.orientationOverride?.enabled===true&&(!input.orientationOverride.heights||input.orientationOverride.heights.includes(config.height))&&(!input.orientationOverride.instances||input.orientationOverride.instances.includes(id));
  const allowed=active?input.orientationOverride.yaw:[0,15,30,45,90];
  const geo=getLetterVolumeGeometry(role,input.thickness??12),pos=geo.getAttribute('position');
  const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(pos.array),triVerts:geo.index?new Uint32Array(geo.index.array):Uint32Array.from({length:pos.count},(_,i)=>i)});mesh.merge();
  let selected;
  for(const relativeYaw of allowed){
   const yaw=heading+relativeYaw,tilt=role==='V'?90:0;
   let center=[...target];
   const item={id,sourceIndex:original.i,source,center,yaw,tilt};
   if(role==='L'){const offset=sub(transform(item,[-.12,-.18]),center);center=sub(center,offset);item.center=center;}
   if(input.perturb?.instance===id){center=add(center,input.perturb.vector??[0,0,.05]);item.center=center;}
   const solid=new M(mesh).scale([s*source.scaleX,s*source.scaleY,s*source.scaleZ]).rotate([tilt,0,yaw]).translate(center);
   if(solid.subtract(box).volume()>1e-8)continue;
   const desiredAngle=role==='L'?heading+90:heading;
      let cost=Math.abs(Math.atan2(Math.sin((yaw-desiredAngle)*Math.PI/180),Math.cos((yaw-desiredAngle)*Math.PI/180)));
   if(role==='U'){
    const desired=norm([intent.focus[0]-center[0],intent.focus[1]-center[1],0]);
    const mouth=[-Math.sin(yaw*Math.PI/180),Math.cos(yaw*Math.PI/180),0];
    cost=Math.acos(Math.max(-1,Math.min(1,dot(mouth,desired))));
   }
   if(role==='V'&&intent.ascent){
    const horizontal=norm([intent.ascent[0],intent.ascent[1],0]),axis=[Math.cos(yaw*Math.PI/180),Math.sin(yaw*Math.PI/180),0];
    cost=Math.acos(Math.max(-1,Math.min(1,Math.abs(dot(axis,horizontal)))));
   }
   if(!selected||cost<selected.cost)selected={...item,relativeYaw,overrideActive:active,allowedYaw:allowed,cost,solid,pivot:center,role:{L:'ascending terrace boundary',U:'focus-facing enclosure curvature',V:'inter-terrace direction and angular transition'}[role],footprintFeet:s*.92,bounds:solid.boundingBox(),selectionReason:'L edge across gathering focus; U opening toward focus; V plane toward ascending terrace route'};
  }
  if(!selected)throw Error('No permitted contained pose for '+id);
  const {solid,...record}=selected;instances.push(record);sourceSolids.push(solid);
  if(role==='L'){
   record.corner=transform(record,[-.12,-.18]);record.edge=[record.corner,transform(record,[.42,-.18])];record.perpendicular=[record.corner,transform(record,[-.12,.45])];
   features.push({id:id+'-orthogonal',source:id,type:'L perpendicular edges',points:[record.edge[1],record.corner,record.perpendicular[1]]});
  }else if(role==='U'){
   const points=getLetterShape('U').getPoints(32),start=points.findIndex(p=>Math.hypot(p.x-.14,p.y-.45)<1e-6),end=points.findIndex((p,i)=>i>start&&Math.hypot(p.x+.14,p.y-.45)<1e-6);
   record.curve=points.slice(start,end+1).map(p=>transform(record,[p.x,p.y]));
   features.push({id:id+'-concavity',source:id,type:'U inner Bezier curve, tangents and normals',points:record.curve,tangents:record.curve.map((p,i)=>norm(sub(record.curve[Math.min(i+1,record.curve.length-1)],record.curve[Math.max(0,i-1)])))});
  }else{
   record.arms=[transform(record,[-.15,.45]),transform(record,[0,-.16]),transform(record,[.15,.45])];
   record.armDirections=[norm(sub(record.arms[0],record.arms[1])),norm(sub(record.arms[2],record.arms[1]))];
   features.push({id:id+'-transition',source:id,type:'V apex, arms and transition plane',points:record.arms});
  }
  return record;
 }
 const L=Array.from({length:counts.L},(_,i)=>instance('L',[(i%2?1:-1)*run*.5,firstY+i*run,level(i)],i));
 const U=Array.from({length:counts.U},(_,i)=>{
  const t=counts.U===1?.5:i/(counts.U-1),z=Math.min(config.height-stroke*1.5,base+uDepth+t*Math.max(0,config.height-stroke*1.5-base-uDepth));
  return instance('U',[halfWidth-S*.15,firstY+t*(terraceCount-1)*run,z],i,{focus:[0,(stageFront+stageBack)/2,base]});
 });
 const V=Array.from({length:counts.V},(_,i)=>{
  const j=counts.V===1?Math.max(0,Math.floor((terraceCount-2)/2)):Math.round(i*(terraceCount-2)/(counts.V-1));
  const a=L[j],b=L[Math.min(j+1,L.length-1)],mid=mix(a.corner,b.corner,.5);
  const v=instance('V',[(i%2?1:-1)*(halfWidth-S*.1),mid[1],mid[2]+S*.5],i,{ascent:sub(b.corner,a.corner)});
  const ascent=norm(sub(b.corner,a.corner));
  v.forwardArm=v.armDirections.reduce((x,y)=>dot(y,ascent)>dot(x,ascent)?y:x);
  return Object.assign(v,{from:a.id,to:b.id,ascentDirection:ascent});
 });
 const sample=(curve,t)=>{const x=Math.max(0,Math.min(1,t))*(curve.length-1),i=Math.floor(x);return mix(curve[i],curve[Math.min(i+1,curve.length-1)],x-i);};
 const uAt=t=>{
  const x=Math.max(0,Math.min(1,t))*(U.length-1),i=Math.floor(x),j=Math.min(i+1,U.length-1);
  return {a:U[i],b:U[j],t:x-i,sources:x-i===0?[U[i].id]:[...new Set([U[i].id,U[j].id])]};
 };
  const curveDeviation=(u,t)=>{
  const deviation=sub(sample(u.curve,t),mix(u.curve[0],u.curve.at(-1),t));
  const yaw=u.yaw*Math.PI/180,mouth=[-Math.sin(yaw),Math.cos(yaw),0],side=[Math.cos(yaw),Math.sin(yaw),0];
  const focusDirection=norm([-u.center[0],(stageFront+stageBack)/2-u.center[1],0]);
  const alignment=Math.max(0,dot(mouth,focusDirection));
  const lateral=[Math.cos((heading+90)*Math.PI/180),Math.sin((heading+90)*Math.PI/180),0],depthAxis=[Math.cos(heading*Math.PI/180),Math.sin(heading*Math.PI/180),0];
  return mul(add(mul(lateral,dot(deviation,side)),mul(depthAxis,dot(deviation,mouth))),alignment);
 };
 function component(name,kind,solid,sources,records,extra={}){
  if(solid.status()!=='NoError'||solid.volume()<=0)throw Error('Invalid constructed '+name);
  components.push({id:name,name,kind,solid,sources:[...new Set(sources)],operations:records,...extra});
 }
 function planarPlate(front,back,thickness){
  const polygon=[...front.map(p=>[p[0],p[1]]),...back.slice().reverse().map(p=>[p[0],p[1]])];
  const signed=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  if(signed<0)polygon.reverse();
  return M.extrude([polygon],thickness).translate([0,0,front[0][2]-thickness/2]);
 } const terraces=[];
 for(let i=0;i<L.length;i++){
  const l=L[i],u=uAt(L.length===1?0:i/(L.length-1)),front=[],back=[];
  const axis=norm(sub(l.edge[1],l.edge[0]));
  for(let j=0;j<=24;j++){
   const t=j/24,dev=mix(curveDeviation(u.a,t),curveDeviation(u.b,t),u.t);
   const p=add(l.corner,mul(axis,(t-.5)*halfWidth*2));
   p[1]+=dev[1]*.32;p[0]+=dev[0]*.12;
   front.push(p);back.push(add(p,[0,run+stroke*.2,0]));
  }
  const solid=planarPlate(front,back,stroke*.35);
  component('terrace-'+i,'terrace',solid,[l.id,...u.sources],['L-derived horizontal boundary','U-curvature-shaped terrace edge','controlled slab thickening'],{front,back,elevation:l.corner[2]});
  terraces.push({l,u,front,back,solid});
  if(i>0){
   const prev=terraces[i-1],v=V.reduce((a,b)=>Math.abs(b.center[1]-l.corner[1])<Math.abs(a.center[1]-l.corner[1])?b:a),lower=prev.back,upper=front.map((p,j)=>add(p,[0,(v.arms[0][1]-v.arms[1][1])*.025,0]));
   component('riser-'+i,'angular-transition',surfaceCell(lower,upper,stroke*.22),[prev.l.id,l.id,v.id,...prev.u.sources,...u.sources],['inter-terrace riser/envelope','V arm-related fold direction'],{from:prev.l.id,to:l.id});
  }
 }
 // Enclosing surfaces follow the rising terrace edges; their regions derive from U support.
 for(const side of [-1,1]){
  const grouped=new Map();
  for(let i=0;i<terraces.length-1;i++){
   const t0=i/(terraces.length-1),t1=(i+1)/(terraces.length-1),control=uAt((t0+t1)/2);
   const edgeIndex=side<0?24:0,lower=[],upper=[],profileSources=new Set(control.sources);
   const v=V.find(v=>v.from===L[i].id&&v.to===L[i+1].id)??V.reduce((a,b)=>Math.abs(b.center[1]-L[i].corner[1])<Math.abs(a.center[1]-L[i].corner[1])?b:a);
   for(let j=0;j<=12;j++){
    const t=j/12,progress=t0+(t1-t0)*t,p=mix(terraces[i].front[edgeIndex],terraces[i+1].front[edgeIndex],t);
    const dev=mix(curveDeviation(control.a,progress),curveDeviation(control.b,progress),control.t);
    
    lower.push(p);
    const c=uAt(progress),roof=mix(c.a.center,c.b.center,c.t);
    c.sources.forEach(id=>profileSources.add(id));
    const arm=t<=.5?mix(v.arms[0],v.arms[1],t*2):mix(v.arms[1],v.arms[2],t*2-1);
    const projection=Math.hypot(...sub(L[i].perpendicular[1],L[i].perpendicular[0]));
    const from=L.find(l=>l.id===v.from),to=L.find(l=>l.id===v.to);
    const transitionReference=(from.corner[2]+to.corner[2])/2+S*.5;
    const fold=(arm[2]-transitionReference)*.22;
    upper.push([p[0]-side*(projection+Math.hypot(dev[0],dev[1])*.25*Math.sin(Math.PI*progress)),p[1]+dev[1]*.15,Math.max(p[2]+stroke*2,roof[2]+fold)]);
   }
   const key=control.a.id;
   if(!grouped.has(key))grouped.set(key,{solids:[],sources:[],profiles:[]});
   const group=grouped.get(key);
   const bayDepth=mean(lower.map((p,j)=>Math.hypot(upper[j][0]-p[0],upper[j][1]-p[1])));
   group.solids.push(surfaceCell(lower,upper,bayDepth*.4));
   group.sources.push(L[i].id,L[i+1].id,...profileSources,v.id);
   group.profiles.push({lower,upper,thickness:bayDepth*.4,sources:[L[i].id,L[i+1].id,...profileSources,v.id]});
  }
  for(const [key,g] of grouped)component('enclosure-'+(side<0?'left-':'right-')+key,'enclosing-envelope',union(g.solids),g.sources,['rising terrace edge relationships','U curvature and support elevations','V folded upper boundary','L-directed inward projection'],{profiles:g.profiles});
 }
 const last=terraces.at(-1),rearU=U.at(-1),rearLower=last.back,rearUpper=rearLower.map((p,j)=>add(p,[0,curveDeviation(rearU,j/24)[1]*.5,Math.max(stroke*2,rearU.center[2]-p[2])]));
 component('rear-enclosure','enclosing-envelope',surfaceCell(rearLower,rearUpper,Math.max(stroke,Math.hypot(...curveDeviation(rearU,.5)))*.4),[last.l.id,rearU.id],['last ascending terrace / U profile rear enclosure'],{profiles:[{lower:rearLower,upper:rearUpper,thickness:Math.max(stroke,Math.hypot(...curveDeviation(rearU,.5)))*.4,sources:[last.l.id,rearU.id]}]});
 // Presentation surface and explicit gathering volume share exactly the same source-derived boundary.
 const first=L[0],focusU=U[0],stageZ=first.corner[2],stageA=[],stageB=[];
 for(let j=0;j<=24;j++){
  const t=j/24,dev=curveDeviation(focusU,t);
  stageA.push([(t-.5)*focusWidth,stageFront+dev[1]*.25,stageZ]);
  stageB.push([(t-.5)*focusWidth,stageBack+dev[1]*.25,stageZ]);
 }
  component('presentation-focus-surface','gathering-surface',planarPlate(stageA,stageB,stroke*.35),[first.id,focusU.id],['L orthogonal focus span','U-derived focus boundary','horizontal presentation relationship'],{front:stageA,back:stageB});
 const thresholdBack=stageB.map((p,j)=>{
  const t=.5-(j/24-.5)*focusWidth/(halfWidth*2),x=t*24,k=Math.floor(x);
  const q=mix(terraces[0].front[k],terraces[0].front[Math.min(k+1,24)],x-k);
  return add(q,[0,stroke*.08,0]);
 });
 component('focus-terrace-threshold','gathering-transition',planarPlate(stageB.map(p=>add(p,[0,-stroke*.08,0])),thresholdBack,stroke*.35),[first.id,focusU.id],['shared gathering focus / first terrace boundary connection']);
 const rear=terraces.at(-1);
 const endRail=rear.back.map((p,j)=>{
  const t=.5-(j/24-.5)*focusWidth/(halfWidth*2),x=t*24,k=Math.floor(x);
  return mix(rear.back[k],rear.back[Math.min(k+1,24)],x-k);
 });
 const openPolygon=[...stageA.map(p=>[p[0],p[1]]),...endRail.slice().reverse().map(p=>[p[0],p[1]])];
 const signedArea=openPolygon.reduce((s,p,i)=>{const q=openPolygon[(i+1)%openPolygon.length];return s+p[0]*q[1]-q[0]*p[1];},0);
 if(signedArea<0)openPolygon.reverse();
 const minY=Math.min(...stageA.map(p=>p[1])),maxY=Math.max(...endRail.map(p=>p[1]));
 const frontBottom=stageZ+stroke*.35,rearBottom=rear.l.corner[2]+stroke*2;
 const openSolid=M.extrude([openPolygon],config.height).warp(p=>{
  if(p[2]<config.height*.5){const t=Math.max(0,Math.min(1,(p[1]-minY)/(maxY-minY)));p[2]=frontBottom+(rearBottom-frontBottom)*t;}
 });
 tools.push({id:'primary-gathering-void',role:'primary open gathering space',sources:[first.id,focusU.id,rear.l.id,...rear.u.sources],solid:openSolid,operation:'source-bounded open volume above the ascending terrace zone',profile:openPolygon,frontBottom,rearBottom,reference:'only actual focus/front/rear boundary sources'}); for(const c of components.filter(c=>c.kind==='enclosing-envelope')){
  const profile=c.profiles[0],j=c.id==='rear-enclosure'?Math.floor(profile.lower.length/6):Math.floor(profile.lower.length/2),p=profile.lower[j],q=profile.upper[j];
  const localL=L.find(l=>profile.sources.includes(l.id)),localU=U.find(u=>profile.sources.includes(u.id));
  if(!localL||!localU)continue;
  const bayDepth=Math.hypot(q[0]-p[0],q[1]-p[1]);
  if(bayDepth<=0)continue;
  const depth=bayDepth*(input.alcoveDepthPercent??25)/100;
  const localSpan=Math.hypot(...sub(profile.lower.at(-1),profile.lower[0]));
  const width=Math.min(lLength,S*.35,localSpan*.75);
  const height=Math.min(uDepth*.55,(q[2]-p[2])*.45);
  if(!(width>0&&height>0))throw Error('No valid local enclosure bay for '+c.id);
  const desiredNormal=c.id.startsWith('enclosure-left')?[1,0,0]:c.id.startsWith('enclosure-right')?[-1,0,0]:[0,-1,0];
  const tangent=norm(sub(profile.lower.at(-1),profile.lower[0]));
  let normal=norm(cross(tangent,sub(mix(profile.upper[0],profile.upper.at(-1),.5),mix(profile.lower[0],profile.lower.at(-1),.5))));
  if(dot(normal,desiredNormal)<0)normal=mul(normal,-1);
  const localUp=norm(cross(tangent,normal));
  const surfacePoint=mix(p,q,.5);
  const center=add(surfacePoint,mul(normal,profile.thickness/2-depth/2));
  const corners=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])corners.push(add(center,add(mul(tangent,x*width/2),add(mul(normal,y*depth/2),mul(localUp,z*height/2)))));
  const solid=M.hull(corners);
  tools.push({id:'recess-'+c.id,role:'recess',sources:[...new Set(profile.sources)],localComponent:c.id,normal,center,bayDepth,depth,width,height,backingThickness:profile.thickness-depth,solid,operation:'recess in exact owning ruled profile bay',bayReference:{lower:p,upper:q,profileSources:profile.sources}});
 } const rawUnion=union(components.map(c=>c.solid)).asOriginal().simplify();
 const rawShells=rawUnion.decompose(),sealedSeams=rawShells.filter(s=>s.volume()<0).map(s=>({volume:s.volume(),bounds:s.boundingBox()}));
 // Close only sealed voids created by thickened construction intersections.
 // Architectural voids and recesses are subtracted afterwards and stay protected.
 const raw=union(rawShells.filter(s=>s.volume()>0)),negative=union(tools.map(t=>t.solid));
 const cutClearance=1e-4;
 const effectiveNegative=negative.minkowskiSum(M.sphere(cutClearance,8));
 const beforeCanonical=raw.subtract(effectiveNegative).intersect(box).asOriginal().simplify();
 const exportGrid=1e-5;
 const condition=solid=>{
  const mesh=solid.getMesh(),positions=[],remap=[],seen=new Map(),triangles=[];
  for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp){
   const p=Array.from(mesh.vertProperties.slice(i,i+3)).map(v=>Math.round(v/exportGrid)*exportGrid),key=p.join(',');
   if(!seen.has(key)){seen.set(key,positions.length/3);positions.push(...p);}
   remap.push(seen.get(key));
  }
  for(let i=0;i<mesh.triVerts.length;i+=3){
   const ids=Array.from(mesh.triVerts.slice(i,i+3)).map(k=>remap[k]);
   if(new Set(ids).size===3)triangles.push(...ids);
  }
  return new M(new Mesh({numProp:3,vertProperties:new Float32Array(positions),triVerts:new Uint32Array(triangles)}));
 }; const C=condition(beforeCanonical);
 if(C.status()!=='NoError'||C.volume()<=0)throw Error('Invalid final architecture');
 const named=components.map(c=>({...c,final:condition(c.solid.subtract(effectiveNegative).intersect(box).asOriginal().simplify())}));
 const finalMesh=serialize(C,[226,214,187]),rawMesh=serialize(raw);
 json('combined-envelope.json',finalMesh);json('raw-construction.json',rawMesh);
 const sourceUnion=union(sourceSolids);
 const operandUse=instances.map(i=>({id:i.id,components:components.filter(c=>c.sources.includes(i.id)).map(c=>c.id)}));
 if(operandUse.some(i=>!i.components.length))throw Error('Population exceeds active geometric support: unused source operand');
 const manifest={config,heading,reconciliation:{requested:input.population??'auto',generated:instances.length,placed:instances.length,displayed:instances.length,constructionOperands:operandUse,actualInfluence:'See separately measured rule-influence/results.json'},dimensionInputs:sources.map((p,i)=>({sourceIndex:i,source:p,scale:scales[i]})),study:{requestedPopulation:input.population??'auto',actualPopulation:instances.length,preferredSize:preferred,counts,capacity:{terracesByPlan:planTerraces,terracesByHeight:heightTerraces},desired,enclosureSupportLength,measuredUArcLength:uArc,uprightVHeight,sourceRegistration:[20,20,20],minorRise,run,displacement,majorLevelSpacing:config.majorLevelSpacing,runtimeMs:performance.now()-started},organization:{focus:{width:focusWidth,depth:focusDepth,elevation:stageZ},terraces:terraces.map(t=>({source:t.l.id,elevation:t.l.corner[2],front:t.front,back:t.back})),enclosureSupports:U.map(u=>({id:u.id,position:u.center})),circulationRelationships:V.map(v=>({source:v.id,from:v.from,to:v.to,directions:v.armDirections,forwardArm:v.forwardArm,ascentDirection:v.ascentDirection,status:'V-directed connection relationship; usable stair/ramp not constructed'}))},instances,features,
 components:named.map(({solid,final,...c})=>({...c,rawVolume:solid.volume(),finalVolume:final.volume(),bounds:final.boundingBox(),status:final.status(),file:c.name+'.obj'})),
 tools:tools.map(({solid,...t})=>({...t,removed:raw.intersect(solid).volume(),finalObstruction:C.intersect(solid).volume(),bounds:solid.boundingBox(),file:t.id+'.obj'})),
 validation:{sealedConstructionSeams:sealedSeams,status:C.status(),volume:C.volume(),bounds:C.boundingBox(),shellVolumes:C.decompose().map(s=>s.volume()),outside:C.subtract(box).volume(),sourceOutside:sourceUnion.subtract(box).volume(),sourceCount:instances.length,beforeSerializationShellVolumes:beforeCanonical.decompose().map(s=>s.volume()),serializationVolumeDelta:C.volume()-beforeCanonical.volume(),numericalCutClearance:cutClearance,exportGrid,sourceFocusOverlap:sourceUnion.intersect(tools[0].solid).volume(),clipped:raw.subtract(box).volume()}};
 json('manifest.json',manifest);
 if(fast)return manifest;
 const frame={min:[-30,-30,0],max:[30,30,60]},sourceMeshes=sourceSolids.map((s,i)=>serialize(s,palette(i))),colored=named.filter(c=>c.final.volume()>0).map((c,i)=>serialize(c.final,palette(i)));
 for(const [mode,list] of Object.entries({A:sourceMeshes,B:[finalMesh,...sourceMeshes],C:[finalMesh],D:colored,T:tools.map((t,i)=>serialize(t.solid,palette(i)))}))for(const view of ['iso','plan','elevation','section'])write(mode+'-'+view+'.png',(await render(list,view,frame,view==='section')).png);
 for(const c of named)write(c.name+'.obj',obj(c.name,serialize(c.final)));
 for(const t of tools)write(t.id+'.obj',obj(t.id,serialize(t.solid)));
 write('effective-cutters.obj',obj('Effective_cutters_with_numerical_clearance',serialize(effectiveNegative)));
 write('combined-envelope.obj',obj('Rule_Governed_Amphitheater',finalMesh));write('original-letters.obj',obj('Reference_Instances',serialize(sourceUnion)));
 let sourceOffset=0;const sourceObjects=[];
 for(let i=0;i<sourceMeshes.length;i++){
  sourceObjects.push(obj(instances[i].id,sourceMeshes[i],sourceOffset));
  sourceOffset+=sourceMeshes[i].positions.length/3;
 }
 write('source-instances.obj',sourceObjects.join(String.fromCharCode(10)));
 const pic=(mode,v)=>'<figure><img src="'+mode+'-'+v+'.png"><figcaption>'+v+'</figcaption></figure>';
 write('index.html','<!doctype html><meta charset=utf-8><title>Rule-governed amphitheater proof</title><style>body{background:#101820;color:white;font:16px system-ui;margin:3%}a{color:#add8ef}section{display:flex}figure{margin:4px;flex:1}img{width:100%}</style><h1>60 × 40 × 40 ft · Rule-governed amphitheater proof</h1><p>'+instances.length+' source instances · '+terraceCount+' ascending terrace relationships · '+named.length+' source-related architectural components</p><p><a href="manifest.json">Organization, provenance and measurements</a> · <a href="validation.json">Geometry validation</a> · <a href="README.md">Compliance and limitations</a></p>'+['A','B','C','D','T'].map((m,i)=>'<h2>'+['Independently colored source instances','Letters + architecture','Architecture only','Named architecture components','Explicit negative volumes'][i]+'</h2><section>'+['iso','plan','elevation','section'].map(v=>pic(m,v)).join('')+'</section>').join('')+'<p>'+['combined-envelope.obj',...named.map(c=>c.name+'.obj'),...tools.map(t=>t.id+'.obj')].map(f=>'<a href="'+f+'">'+f+'</a>').join(' · ')+'</p>');
 return manifest;
}
if(require.main===module){
 const input=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'input.json')));
 const out=path.resolve(process.argv[3]||path.join(__dirname,'rule-review'));
 build(input,out,process.argv.includes('--fast')).then(m=>console.log(JSON.stringify({study:m.study,validation:m.validation}))).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={build};



















