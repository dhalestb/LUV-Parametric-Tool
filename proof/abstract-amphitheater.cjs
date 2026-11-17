const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const THREE=require('three');
const render=require('./render.cjs');
const {requestConfig}=require('./field-config.cjs');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,filename);
const {getLetterShape,getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const {controlsFromPreset,scaleFromFootprintFeet}=require('../src/components/architecturalLetterSizing.ts');
const input=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'input.json')));
const out=path.resolve(process.argv[3]||path.join(__dirname,'abstract-review'));
const config=requestConfig(input.field??{width:60,depth:40,height:40});
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(p,t)=>p.map(v=>v*t);
const mix=(a,b,t)=>add(a,mul(sub(b,a),t));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=p=>mul(p,1/Math.hypot(...p));
function serialize(s,color){
 const m=s.getMesh(),positions=[];
 for(let i=0;i<m.vertProperties.length;i+=m.numProp)positions.push(...m.vertProperties.slice(i,i+3));
 return {positions,indices:Array.from(m.triVerts),color};
}
function obj(name,mesh){
 return ['# Feet; Z up; polygon mesh','o '+name,...Array.from({length:mesh.positions.length/3},(_,i)=>'v '+mesh.positions.slice(i*3,i*3+3).join(' ')),...Array.from({length:mesh.indices.length/3},(_,i)=>'f '+mesh.indices.slice(i*3,i*3+3).map(v=>v+1).join(' '))].join(String.fromCharCode(10));
}
async function main(){
 const started=performance.now();
 fs.mkdirSync(out,{recursive:true});
 const write=(n,v)=>fs.writeFileSync(path.join(out,n),v);
 const json=(n,v)=>write(n,JSON.stringify(v,null,2));
 const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
 const {Manifold:M,Mesh}=wasm;
 const union=parts=>M.union(parts);
 const sources=input.snapshot?.data?.arrangement?.originalPlacements??input.source;
 const preferred=input.preferredFeet??controlsFromPreset(config.height).preferredFeet;
 if(!(preferred>0))throw Error("Preferred size must be positive");
 const scales=sources.map(p=>input.preferredFeet!==undefined||input.notes?.startsWith('Diagnostic direct workflow input')?scaleFromFootprintFeet(preferred):p.scale);
 const span=sources.reduce((v,p,i)=>v+.92*scales[i]*p.scaleX,0)/sources.length;
 const heading=Math.atan2(sources.at(-1).y-sources[0].y,sources.at(-1).x-sources[0].x)*180/Math.PI;
 const instances=[],sourceSolids=[],features=[],regions=[],masses=[],tools=[];
 const box=M.cube([config.width,config.depth,config.height]).translate([-config.width/2,-config.depth/2,0]);
 // Four complementary boundary regions establish the sides and rear of the open focus.
 const margin=span*.8;
 const maxX=config.width/2-margin,maxY=config.depth/2-margin;
 if(maxX<=0||maxY<=0)throw Error('Exact source dimensions leave no feasible boundary region');
 const boundary=[[-maxX,-maxY],[-maxX*.82,maxY],[maxX*.82,maxY],[maxX,-maxY]];
 const segmentLengths=boundary.slice(1).map((p,i)=>Math.hypot(...sub(p,boundary[i])));
 const pathLength=segmentLengths.reduce((a,b)=>a+b,0);
 const autoRegions=Math.max(3,Math.floor(pathLength/(span*1.25))+1);
 const population=input.population==='auto'?autoRegions*3:(input.population??12);
 if(!Number.isInteger(population)||population<9||population%3!==0)throw Error('This complementary feature study requires a multiple of three source instances, at least nine');
 const regionCount=population/3;
 const centers=Array.from({length:regionCount},(_,i)=>{
  let d=pathLength*i/(regionCount-1);
  for(let j=0;j<segmentLengths.length;j++){
   if(d<=segmentLengths[j]||j===segmentLengths.length-1)return mix(boundary[j],boundary[j+1],d/segmentLengths[j]);
   d-=segmentLengths[j];
  }
 }); function point(item,raw){
  const p=sources[item.sourceIndex],s=scales[item.sourceIndex];
  const shape=getLetterShape(p.letter).getPoints(32);
  const min=[Math.min(...shape.map(q=>q.x)),Math.min(...shape.map(q=>q.y))],max=[Math.max(...shape.map(q=>q.x)),Math.max(...shape.map(q=>q.y))];
  const v=new THREE.Vector3((raw[0]-(min[0]+max[0])/2)*s*p.scaleX,(raw[1]-(min[1]+max[1])/2)*s*p.scaleY,(raw[2]??0)*s*p.scaleZ);
  v.applyAxisAngle(new THREE.Vector3(1,0,0),item.tilt*Math.PI/180);
  v.applyAxisAngle(new THREE.Vector3(0,0,1),item.yaw*Math.PI/180);
  return add(v.toArray(),item.center);
 }
 for(let r=0;r<centers.length;r++){
  const progression=Math.sin(Math.PI*r/(centers.length-1));
  const region={id:'region-'+r,base:Math.min(span*(.25+.55*progression),config.height-span*1.6)};
  for(const [j,letter] of ['L','U','V'].entries()){
   const matches=sources.map((p,i)=>({p,i})).filter(t=>t.p.letter===letter);
   if(!matches.length)throw Error('Envelope requires selected L/U/V source features');
   const si=matches[r%matches.length].i,p=sources[si],s=scales[si];
   const geo=getLetterVolumeGeometry(letter,input.thickness??12),pos=geo.getAttribute('position');
   const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(pos.array),triVerts:geo.index?new Uint32Array(geo.index.array):Uint32Array.from({length:pos.count},(_,i)=>i)});
   mesh.merge();
   const center=[centers[r][0]+(j-1)*span*.17,centers[r][1]+(j===0?-span*.15:0),region.base+(letter==='V'?span*.5:0)];
   const active=input.orientationOverride?.enabled===true&&(!input.orientationOverride.heights||input.orientationOverride.heights.includes(config.height))&&(!input.orientationOverride.instances||input.orientationOverride.instances.includes('source-'+r+'-'+letter));
   const allowed=active?input.orientationOverride.yaw:[0,15,30,45,90];
   let chosen;
   for(const relativeYaw of allowed){
    const yaw=heading+relativeYaw,tilt=letter==='V'?90:0;
    const solid=new M(mesh).scale([s*p.scaleX,s*p.scaleY,s*p.scaleZ]).rotate([tilt,0,yaw]).translate(center);
    if(solid.subtract(box).volume()>1e-8)continue;
    const score=Math.abs(relativeYaw-[0,15,30,45,90][r%5]);
    if(!chosen||score<chosen.score)chosen={yaw,tilt,relativeYaw,solid,score};
   }
   if(!chosen)throw Error('Source pose infeasible in selected field');
   const item={id:'source-'+r+'-'+letter,sourceIndex:si,source:p,region:r,letter,center,pivot:center,yaw:chosen.yaw,relativeYaw:chosen.relativeYaw,tilt:chosen.tilt,overrideActive:active,footprintFeet:s*.92,bounds:chosen.solid.boundingBox()};
   instances.push(item);sourceSolids.push(chosen.solid);
   if(letter==='L'){
    region.L=item;
    region.edge=[point(item,[-.12,-.18]),point(item,[.42,-.18])];
    region.corner=point(item,[-.12,-.18]);
    region.perpendicular=[region.corner,point(item,[-.12,.45])];
    features.push({id:item.id+'-edges',source:item.id,type:'perpendicular inner edges',points:[region.edge[1],region.corner,region.perpendicular[1]]});
   }else if(letter==='U'){
    region.U=item;
    const points=getLetterShape('U').getPoints(32);
    const start=points.findIndex(q=>Math.hypot(q.x+.42,q.y+.08)<1e-6);
    const end=points.findIndex((q,i)=>i>start&&Math.hypot(q.x-.42,q.y-.45)<1e-6);
    if(start<0||end<0)throw Error('Actual U Bezier boundary unavailable');
    // Keep the sampled curved outer boundary and its true tangent transitions.
    region.curve=points.slice(start,end).map(q=>point(item,[q.x,q.y]));
    features.push({id:item.id+'-curve',source:item.id,type:'actual U outer Bezier boundary',points:region.curve});
   }else{
    region.V=item;region.arms=[point(item,[-.15,.45]),point(item,[0,-.16]),point(item,[.15,.45])];
    features.push({id:item.id+'-arms',source:item.id,type:'V arm directions and apex',points:region.arms});
   }
  }
  region.top=Math.max(...region.arms.map(p=>p[2]))+Math.hypot(...sub(region.edge[1],region.edge[0]))*.8;
  if(region.top>config.height)throw Error('Feature-derived upper envelope exceeds height');
  regions.push(region);
 }
 function surfaceCell(bottom,top,thickness){
  const vertices=[],n=bottom.length;
  for(let i=0;i<n;i++){
   const tangent=sub(bottom[Math.min(i+1,n-1)],bottom[Math.max(0,i-1)]);
   const normal=norm(cross(tangent,sub(top[i],bottom[i])));
   for(const side of [-1,1])for(const p of [bottom[i],top[i]])vertices.push(...add(p,mul(normal,side*thickness/2)));
  }
  const triangles=[];
  const quad=(a,b,c,d)=>triangles.push(a,b,c,a,c,d);
  for(let i=1;i<n;i++){
   const a=(i-1)*4,b=i*4;
   quad(a,b,b+1,a+1);quad(a+2,a+3,b+3,b+2);
   quad(a,a+2,b+2,b);quad(a+1,b+1,b+3,a+3);
  }
  quad(0,1,3,2);const last=(n-1)*4;quad(last,last+2,last+3,last+1);
  let volume=0;
  for(let i=0;i<triangles.length;i+=3){
   const [a,b,c]=triangles.slice(i,i+3).map(k=>vertices.slice(k*3,k*3+3));
   volume+=a.reduce((sum,v,k)=>sum+v*cross(b,c)[k],0)/6;
  }
  if(volume<0)for(let i=0;i<triangles.length;i+=3)[triangles[i+1],triangles[i+2]]=[triangles[i+2],triangles[i+1]];
  const solid=new M(new Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(triangles)}));
  if(solid.status()!=='NoError'||solid.volume()<=0)throw Error('Invalid thickened ruled envelope');
  return solid;
 }
 function thickSurface(bottom,top,thickness){
  const cells=[];
  for(let i=1;i<bottom.length;i++){
   const tangent=norm(sub(bottom[i],bottom[i-1]));
   const extension=mul(tangent,thickness*.035);
   cells.push(surfaceCell([sub(bottom[i-1],extension),add(bottom[i],extension)],
     [sub(top[i-1],extension),add(top[i],extension)],thickness));
  }
  // Boolean construction resolves intersecting local ruled cells before export.
  let layer=cells;
  while(layer.length>1){
   const next=[];
   for(let i=0;i<layer.length;i+=6)next.push(union(layer.slice(i,i+6)));
   layer=next;
  }
  return layer[0];
 }
 // Generate new cross-letter trajectories. No complete source profile is copied.
 const generated=[];
 const sample=(curve,t)=>{
  const x=t*(curve.length-1),i=Math.floor(x);
  return mix(curve[i],curve[Math.min(i+1,curve.length-1)],x-i);
 };
 const anchor=r=>mix(r.corner,sample(r.curve,.5),.35);
 for(let i=1;i<regions.length;i++){
  const a=regions[i-1],b=regions[i],bottom=[],top=[],derivation=[];
  for(let j=0;j<=24;j++){
   const t=j/24,pa=sample(a.curve,t),pb=sample(b.curve,t);
   const devA=sub(pa,mix(a.curve[0],a.curve.at(-1),t));
   const devB=sub(pb,mix(b.curve[0],b.curve.at(-1),t));
   const curvature=mix(devA,devB,t);
   const linear=mix(anchor(a),anchor(b),t);
   const p=add(linear,mul(curvature,.62));
   const lDirection=mix(sub(a.perpendicular[1],a.perpendicular[0]),sub(b.edge[1],b.edge[0]),t);
   const armA=t<=.5?mix(a.arms[0],a.arms[1],t*2):mix(a.arms[1],a.arms[2],t*2-1);
   const armB=t<=.5?mix(b.arms[0],b.arms[1],t*2):mix(b.arms[1],b.arms[2],t*2-1);
   const v=mix(armA,armB,t);
   const z=Math.max(p[2]+span*.3,v[2]+Math.hypot(...lDirection)*.75);
   bottom.push(p);
   top.push([p[0]+lDirection[0]*.4,p[1]+lDirection[1]*.4,z]);
   derivation.push({t,sourceCurvePoints:[pa,pb],curvatureDeviation:curvature,Ldirection:lDirection,VfoldPoint:v,generatedLower:p,generatedUpper:top.at(-1)});
  }
  generated.push({a,b,bottom,top,derivation});
 }
 // Additional instances influence the same three principal envelope components.
 for(let k=0;k<3;k++){
  const edges=generated.filter((_,i)=>Math.min(2,Math.floor(i*3/generated.length))===k);
  if(!edges.length)continue;
  const thickness=span*.20;
  const solids=edges.map(e=>thickSurface(e.bottom,e.top,thickness));
  masses.push({id:'abstract-'+k,name:['Orthogonal_curved_projection','Cross_letter_folded_enclosure','Angular_recessed_envelope'][k],
   sources:[...new Set(edges.flatMap(e=>[e.a.L.id,e.a.U.id,e.a.V.id,e.b.L.id,e.b.U.id,e.b.V.id]))],
   operations:['derive L-axis / U-curvature relationship trajectory','blend curvature deviations from two source U curves','V-arm-driven folded upper rail','local ruled cells, thickening and Boolean intersection'],
   construction:'new feature relationship surface; no copied complete letter outline',
   solid:union(solids),bottom:edges.flatMap(e=>e.bottom),top:edges.flatMap(e=>e.top),derivation:edges.flatMap(e=>e.derivation),thickness});
 } // Carve a source-boundary-defined open gathering volume.
 const left=regions[0],rearLeft=regions[Math.floor((regions.length-1)/3)],rearRight=regions[Math.ceil(2*(regions.length-1)/3)],right=regions.at(-1);
 const focal=[left.corner, mix(rearLeft.curve[0],rearLeft.curve.at(-1),.5),mix(rearRight.curve[0],rearRight.curve.at(-1),.5),right.corner].map(p=>[p[0],p[1]]);
 const focusFloor=Math.min(...regions.map(r=>r.base))+span*.12;
 const area=focal.reduce((sum,p,i)=>{const q=focal[(i+1)%focal.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
 if(area<0)focal.reverse();
  const focalCenter=focal.reduce((sum,p)=>add(sum,mul(p,1/focal.length)),[0,0]);
 const focusInset=.72;
 const finalFocal=focal.map(p=>mix(focalCenter,p,focusInset));
 const focus=M.extrude([finalFocal],config.height-focusFloor).translate([0,0,focusFloor]); tools.push({id:'primary-gathering-void',sources:regions.flatMap(r=>[r.L.id,r.U.id]),operation:'extrude focal polygon from L corners and U profile centers',solid:focus,role:'primary open volume',focusInset,profile:finalFocal});
 for(const [i,mass] of masses.entries()){
  const j=Math.floor(mass.bottom.length*.55),p=mass.bottom[j];
  const tangent=norm(sub(mass.bottom[j+1],mass.bottom[j-1])),normal=norm(cross(tangent,[0,0,1]));
  const bayDepth=Math.hypot(...sub(regions[i].edge[1],regions[i].perpendicular[1]));
  const depth=bayDepth*.25,width=span*.35,height=span*.5;
  const angle=Math.atan2(tangent[1],tangent[0])*180/Math.PI;
  const center=add(p,mul(normal,mass.thickness*.45));
  const solid=M.cube([width,depth,height],true).rotate([0,0,angle]).translate([center[0],center[1],p[2]+height*.75]);
  tools.push({id:'alcove-'+i,sources:mass.sources,operation:'subtract recess in source-related envelope bay',role:'recess',bayDepth,depth,width,height,solid});
 }
 const raw=union(masses.map(m=>m.solid)),negative=union(tools.map(t=>t.solid));
 console.log('raw',raw.status(),raw.volume(),'negative',negative.status(),negative.volume(),tools.map(t=>[t.id,t.solid.status(),t.solid.volume()]));
 const combined=raw.subtract(negative).intersect(box).simplify();
 if(combined.status()!=='NoError'||combined.volume()<=0)throw Error('Final envelope Boolean failed');
 const A=union(sourceSolids);
 const named=masses.map(m=>({...m,final:m.solid.subtract(negative).intersect(box).simplify()}));
 const combinedMesh=serialize(combined,[224,218,197]),sourceMesh=serialize(A,[52,155,213]);
 const frame={min:[-30,-30,0],max:[30,30,60]};
 const colored=named.map((m,i)=>serialize(m.final,[[167,198,188],[219,191,143],[172,167,201]][i]));
 for(const [mode,meshes] of Object.entries({A:[sourceMesh],B:[combinedMesh,sourceMesh],C:[combinedMesh],D:colored})){
  for(const view of ['iso','plan','elevation','section'])write(mode+'-'+view+'.png',(await render(meshes,view,frame,view==='section')).png);
 }
 const ribbonSolids=[];
 for(const f of features)for(let i=1;i<f.points.length;i++){
  const a=f.points[i-1],b=f.points[i];
  const d=sub(b,a),length=Math.hypot(...d);
  if(length<1e-7)continue;
  const geom=new THREE.CylinderGeometry(.045,.045,length,5);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...d).normalize());
  geom.applyQuaternion(q);geom.translate(...mix(a,b,.5));
  const p=geom.getAttribute('position'),ix=geom.getIndex();
  const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(p.array),triVerts:new Uint32Array(ix.array)});mesh.merge();
  const solid=new M(mesh);if(solid.status()==='NoError')ribbonSolids.push(solid);
 }
 write('derivation.png',(await render([...colored,serialize(union(ribbonSolids),[243,105,105])],'iso',frame)).png);
 for(const m of named)write(m.name+'.obj',obj(m.name,serialize(m.final)));
 for(const tool of tools)write(tool.id+'.obj',obj(tool.id,serialize(tool.solid)));
  for(const view of ['iso','plan','elevation','section']){
  const toolMeshes=tools.map((tool,i)=>serialize(tool.solid,i===0?[99,174,212]:[230,125,116]));
  write('tools-'+view+'.png',(await render(toolMeshes,view,frame,view==='section')).png);
 }
 write('combined-envelope.obj',obj('Combined_Envelope',combinedMesh));
 write('original-letters.obj',obj('Source_LUV',sourceMesh));
 json('combined-envelope.json',combinedMesh);
 const shellVolumes=combined.decompose().map(s=>s.volume());
 const manifest={
  study:{requestedSize:preferred,requestedPopulation:input.population??12,actualPopulation:instances.length,autoRegions,pathLength,runtimeMs:performance.now()-started,primaryConstruction:"cross-letter trajectories from L directions, U curvature deviations and V folds"},config,heading,sourceRegistration:[20,20,20],instances,features,
  components:named.map(({solid,final,bottom,top,...m})=>({...m,bottom,top,rawVolume:solid.volume(),finalVolume:final.volume(),bounds:final.boundingBox(),status:final.status(),file:m.name+'.obj'})),
  tools:tools.map(({solid,...t})=>({...t,removed:raw.intersect(solid).volume(),finalObstruction:combined.intersect(solid).volume(),bounds:solid.boundingBox(),status:solid.status(),file:t.id+'.obj'})),
  validation:{status:combined.status(),volume:combined.volume(),bounds:combined.boundingBox(),shellVolumes,outside:combined.subtract(box).volume(),sourceOutside:A.subtract(box).volume(),sourceFocusOverlap:A.intersect(focus).volume(),clipped:raw.subtract(box).volume(),sourceCount:instances.length},
  limitations:['Envelope proof only; full occupied terrace and circulation compliance unverified','OBJ meshes in feet/Z-up; no native NURBS or 3dm output','Curvature, surface thickness and selected feature relationships require architectural review']
 };
 json('manifest.json',manifest);
 const pic=(mode,view)=>'<figure><img src="'+mode+'-'+view+'.png"><figcaption>'+view+'</figcaption></figure>';
 write('index.html','<!doctype html><meta charset=utf-8><title>Architectural envelope proof</title><style>body{background:#101820;color:#eee;font:16px system-ui;margin:3%}section{display:flex}figure{margin:4px;flex:1}img{width:100%}a{color:#bde0f4}</style><h1>'+config.width+' × '+config.depth+' × '+config.height+' ft · Abstract envelope</h1><p>Blue · original sources. Warm white · generated envelope.</p><img style="max-width:900px" src="C-iso.png">'+['A','B','C','D'].map((m,i)=>'<h2>'+['Original Letters','Letters + Envelope','Envelope Only','Named components'][i]+'</h2><section>'+['iso','plan','elevation','section'].map(v=>pic(m,v)).join('')+'</section>').join('')+'<h2>Source feature derivation</h2><p>Red · selected source edges and curves over the three derived masses.</p><img style="max-width:900px" src="derivation.png"><h2>Explicit subtractive volumes</h2><section>'+['iso','plan','elevation','section'].map(v=>pic('tools',v)).join('')+'</section><p><a href="manifest.json">Source/operation manifest</a> · <a href="validation.json">Geometric validation</a> · <a href="README.md">Limitations and construction report</a> · <a href="../abstract-exports.zip">Download OBJ export package</a></p><p>'+['combined-envelope.obj',...named.map(m=>m.name+'.obj'),...tools.map(t=>t.id+'.obj'),'original-letters.obj'].map(f=>'<a href="'+f+'">'+f+'</a>').join(' · ')+'</p>');
 console.log(JSON.stringify(manifest.validation));
 console.log(manifest.tools.map(t=>({id:t.id,removed:t.removed,obstruction:t.finalObstruction})));
}
main().catch(e=>{console.error(e);process.exitCode=1});














