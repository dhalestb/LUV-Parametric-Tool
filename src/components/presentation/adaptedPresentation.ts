import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {fitCamera} from './approved/amphitheaterPresentationRender';
import {pngWithDpi} from './approved/amphitheaterPresentationExport';
import {resolvePresentationRules,SHARED_BOARD_RULES as shared,type PresentationOverrides} from './rules';
import {focusedRuleDetails,type RuleDetail} from './ruleIllustrations';
import type {MeshData,PresentationOptions,PresentationStudy} from './types';

function bounds(mesh:MeshData){
 const box=new THREE.Box3();for(let i=0;i<mesh.positions.length;i+=3)box.expandByPoint(new THREE.Vector3(mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]));return box;
}
/** Presentation clipping only: the saved solid is neither cut nor written back. */
export function presentationSection(study:PresentationStudy,overrides:PresentationOverrides={}){
 const rules=resolvePresentationRules(study,overrides),box=bounds(study.record.architecture),size=box.getSize(new THREE.Vector3());
 const axis=rules.section.axis==='longest-plan'?(size.x>=size.y?'x':'y'):rules.section.axis;
 let at=box.min[axis]+size[axis]*rules.section.fraction,origin='mesh bounds';
 const report=study.record.boundaryReport as {voids?:{cutterMesh?:MeshData}[]}|undefined;
 const voidReport=study.record.voidFieldReport as typeof report;
 const cutter=[...(report?.voids??[]),...(voidReport?.voids??[])].find(v=>v.cutterMesh?.positions.length)?.cutterMesh;
 if(rules.section.origin==='primary-void'&&cutter&&overrides.section?.fraction===undefined){at=bounds(cutter).getCenter(new THREE.Vector3())[axis];origin='recorded void';}
 return {axis,at,origin,box};
}
export async function renderAdaptedPresentation(study:PresentationStudy,options:PresentationOptions,overrides:PresentationOverrides={}){
 const {record}=study,rules=resolvePresentationRules(study,{...overrides,iso:options.iso}),section=presentationSection(study,overrides);
 const canvas=document.createElement('canvas');canvas.width=options.view==='board'?shared.width:options.size;canvas.height=options.view==='board'?shared.height:options.size;
 const context=canvas.getContext('2d');if(!context)throw Error('Presentation canvas unavailable.');const ctx=context;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.localClippingEnabled=true;
 const resources:{dispose:()=>void}[]=[];
 if(!options.transparent){ctx.fillStyle=shared.background;ctx.fillRect(0,0,canvas.width,canvas.height);}
 const text=(s:string,x:number,y:number,size:number,color:string=shared.colors.form)=>{ctx.fillStyle=color;ctx.font=size+'px '+shared.font;ctx.fillText(s,x,y);};
 function wrapped(s:string,x:number,y:number,size:number,maxWidth:number,lineHeight:number){
  ctx.font=size+'px '+shared.font;let line='',row=0;for(const word of s.split(/\s+/)){const trial=line?line+' '+word:word;if(line&&ctx.measureText(trial).width>maxWidth){text(line,x,y+row++*lineHeight,size);line=word;}else line=trial;}if(line)text(line,x,y+row++*lineHeight,size);return y+row*lineHeight;
 }
 function add(scene:THREE.Scene,mesh:MeshData,color:string,opacity=1,plane?:THREE.Plane,overlay=false){
  if(!mesh.indices.length)return;
  if(mesh.positions.length%3||mesh.indices.length%3||mesh.positions.some(v=>!Number.isFinite(v))||mesh.indices.some(v=>!Number.isSafeInteger(v)||v<0||v>=mesh.positions.length/3))throw Error('Invalid saved presentation mesh.');
  const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));raw.setIndex([...mesh.indices]);
  const geometry=toCreasedNormals(raw,shared.material.creaseAngle);if(geometry!==raw)raw.dispose();resources.push(geometry);
  const material=new THREE.MeshStandardMaterial({color,roughness:shared.material.roughness,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity===1,clippingPlanes:plane?[plane]:[]});resources.push(material);const object=new THREE.Mesh(geometry,material);if(overlay){material.depthTest=false;object.renderOrder=5;}scene.add(object);
 }
 function scene(){const s=new THREE.Scene();s.add(new THREE.AmbientLight(0xffffff,.85));const key=new THREE.DirectionalLight(0xffffff,1.65);key.position.set(40,-60,90);s.add(key);return s;}
 const union=section.box.clone();record.letters.forEach(l=>union.union(bounds(l.mesh)));if(record.perimeterWalls?.indices.length)union.union(bounds(record.perimeterWalls));
 function drawing(kind:'letters'|'form'|'orientation'|'section'|'components',x:number,y:number,w:number,h:number){
  const s=scene();let camera:THREE.Camera;
  if(kind==='letters'||kind==='orientation'){
   add(s,record.architecture,shared.colors.form,shared.material.sourceContextOpacity);
   record.letters.filter(l=>!options.ruleSource||l.id===options.ruleSource).forEach(l=>add(s,l.mesh,shared.colors.letters));
  }else{
   const plane=kind==='section'?new THREE.Plane(new THREE.Vector3(section.axis==='x'?-1:0,section.axis==='y'?-1:0,0),section.at):undefined;
   if(kind==='components'&&rules.visibleComponentIds){record.components.filter(c=>rules.visibleComponentIds!.includes(c.id)).forEach(c=>add(s,c.mesh,shared.colors.form,rules.contextOpacity));}
   else add(s,record.architecture,shared.colors.form,kind==='components'?rules.contextOpacity:1,plane);
   if(record.perimeterWalls?.indices.length)add(s,record.perimeterWalls,shared.colors.form,1,plane);
   if(kind==='components')record.letters.filter(l=>!options.ruleSource||l.id===options.ruleSource).forEach(l=>add(s,l.mesh,shared.colors.letters));
  }
  camera=fitCamera(union,w,h,rules.iso);
  if(kind==='orientation'&&rules.adaptation.orientation==='plan'){
   const center=union.getCenter(new THREE.Vector3()),size=union.getSize(new THREE.Vector3()),aspect=w/h;
   const half=Math.max(size.y,size.x/aspect,1)/2/shared.camera.occupancy;
   const plan=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.01,Math.max(100,size.z*5));plan.position.set(center.x,center.y,union.max.z+Math.max(30,size.z*2));plan.up.set(0,1,0);plan.lookAt(center);camera=plan;
  }
  if(kind==='section'){
   const center=union.getCenter(new THREE.Vector3()),azimuth=section.axis==='x'?new THREE.Vector2(1,-.12):new THREE.Vector2(.12,1);
   camera=fitCamera(union,w,h,rules.iso,azimuth);camera.lookAt(center);camera.updateMatrixWorld();
  }
  const limit=renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number;
  if(Math.max(w,h)>limit)throw Error('This GPU cannot render this resolution. Choose 2048 pixels.');
  renderer.setSize(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),false);renderer.setClearColor(shared.background,options.transparent?0:1);renderer.render(s,camera);ctx!.drawImage(renderer.domElement,x,y,w,h);s.clear();
 }
 const details=focusedRuleDetails(study,options.ruleSource);
 function renderDetailScene(s:THREE.Scene,x:number,y:number,w:number,h:number,view?:'plan'|'isometric',normal?:number[]){
  const box=new THREE.Box3().setFromObject(s);if(box.isEmpty())return;
  let camera:THREE.Camera=fitCamera(box,w,h,rules.iso);
  if(view==='plan'){
   const c=box.getCenter(new THREE.Vector3()),d=box.getSize(new THREE.Vector3()),half=Math.max(d.y,d.x/(w/h),1)/2/shared.camera.occupancy;
   const plan=new THREE.OrthographicCamera(-half*w/h,half*w/h,half,-half,.01,Math.max(100,d.z*5));
   plan.position.set(c.x,c.y,box.max.z+Math.max(30,d.z*2));plan.up.set(0,1,0);plan.lookAt(c);camera=plan;
  }
  if(normal&&view!=='plan'){
   const c=box.getCenter(new THREE.Vector3()),span=Math.max(1,box.getSize(new THREE.Vector3()).length());
   const helper=new THREE.ArrowHelper(new THREE.Vector3(normal[0],normal[1],normal[2]).normalize(),c,span*.24,shared.colors.rules,span*.07,span*.025);s.add(helper);
   resources.push(helper.line.geometry,helper.cone.geometry,...[helper.line.material,helper.cone.material].flat());
  }
  const limit=renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number;
  if(Math.max(w,h)>limit)throw Error('This GPU cannot render this resolution. Choose 2048 pixels.');
  renderer.setSize(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),false);renderer.setClearColor(shared.background,options.transparent?0:1);renderer.render(s,camera);ctx.drawImage(renderer.domElement,x,y,w,h);s.clear();
 }
 function ruleDetail(spec:RuleDetail,x:number,y:number,w:number){
  const compact=options.view==='generation',imageHeight=compact?.24:.34;
  const s=scene();
  for(const layer of spec.layers)add(s,layer.mesh,shared.colors[layer.color],layer.opacity??1,undefined,layer.overlay);
  for(const line of spec.lines??[]){
   if(line.points.length<2)continue;
   const geometry=new THREE.BufferGeometry().setFromPoints(line.points.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
   const material=new THREE.LineBasicMaterial({color:shared.colors[line.color],depthTest:false});resources.push(geometry,material);
   const object=new THREE.Line(geometry,material);object.renderOrder=10;s.add(object);
  }
  const imageW=w*shared.detail.imageWidth;
  if(spec.insetIndices?.length){
   renderDetailScene(s,x+imageW*.34,y,imageW*.66,w*(compact?.23:.32),spec.view);
   const letters=scene();spec.insetIndices.forEach(i=>add(letters,record.letters[i].mesh,shared.colors.letters));
   renderDetailScene(letters,x,y+w*.015,imageW*.32,w*(compact?.15:.21));
   text(spec.insetLabel??'Letter guide',x,y+w*(compact?.20:.26),w*.019,shared.colors.rules);
  }else renderDetailScene(s,x,y,imageW,w*imageHeight,spec.view,spec.normal);
  const left=x+w*shared.detail.textLeft,rail=w*(1-shared.detail.textLeft);
  text(spec.heading,left,y+w*.03,w*shared.detail.headingSize*(compact?.9:1),shared.colors.rules);
  let cursor=y+w*(shared.detail.firstLine+.03)*(compact?.8:1);
  for(const line of spec.bullets)cursor=wrapped('• '+line,left,cursor,w*shared.detail.bodySize*(compact?.85:1),rail,w*shared.detail.lineSpacing*(compact?.8:1))+w*.015;
 }
 function panel(view:'letters'|'form'|'orientation'|'generation'|'visibility',x:number,y:number,w:number){
  const title={letters:'Original Letters',form:'Architectural Form',orientation:'Orientation Rules',generation:'Generation Rules',visibility:'Section / Visibility'}[view];
  text(title.toUpperCase(),x,y+w*shared.layout.panelHeadingY,w*shared.layout.panelHeadingSize,shared.colors.letters);
  if(view==='letters'||view==='form'){
   drawing(view,x,y+w*.08,w,w*.84);
   return;
  }
  if(view==='visibility'){drawing('section',x,y+w*.08,w,w*.84);return;}
  const items=view==='orientation'?details.orientation:details.generation,rows=view==='orientation'?[.10,.65]:options.view==='generation'?[.10,.40,.70]:[.10,.55,1.00];
  items.forEach((spec,i)=>ruleDetail(spec,x,y+w*rows[i],w));
 }
 try{
  if(options.view==='board'){
   const m=canvas.width*shared.layout.margin,gap=canvas.width*shared.layout.columnGap,w=(canvas.width-2*m-gap)/2;
   const title=study.title.toUpperCase();let font=canvas.width*shared.layout.titleSize;ctx.font=font+'px '+shared.font;while(ctx.measureText(title).width>canvas.width-2*m)ctx.font=(font-=1)+'px '+shared.font;
   text(title,m,canvas.width*shared.layout.titleBaseline,font);ctx.strokeStyle=shared.colors.form;ctx.lineWidth=canvas.width*shared.layout.separatorWeight;ctx.beginPath();ctx.moveTo(m,canvas.width*shared.layout.separatorY);ctx.lineTo(canvas.width-m,canvas.width*shared.layout.separatorY);ctx.stroke();
   (['letters','form','orientation','generation'] as const).forEach((view,i)=>panel(view,m+(i%2)*(w+gap),canvas.width*shared.layout.contentTop+Math.floor(i/2)*w*shared.layout.rowPitch,w));
  }else panel(options.view,canvas.width*.04,canvas.width*.09,canvas.width*.89);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG encoding failed.')),'image/png'));
  return await pngWithDpi(blob,shared.dpi);
 }finally{resources.forEach(r=>r.dispose());renderer.dispose();renderer.forceContextLoss();canvas.width=canvas.height=1;}
}
