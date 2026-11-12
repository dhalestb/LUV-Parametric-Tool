import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {AmphitheaterResult,ProofMesh} from './amphitheaterInteractiveTypes';
import {meshGeometry,PLATE_LABELS,PRESENTATION_COLORS,pngWithDpi,presentationRules,type PlateView,type ExportView} from './amphitheaterPresentationExport';

export type PresentationOptions={view:ExportView;size:number;transparent:boolean;iso:'SE'|'SW'|'NE'|'NW';ruleSource:string};
type VoidRecord={source:string;axis:number[];sourceContour?:number[][];closedContour?:number[][];closure?:{addedEdges:number[][]};cutterMesh?:ProofMesh;removedVolume?:number;alcove?:boolean};
type PresentationResult=AmphitheaterResult&{boundaryReport?:{voids:VoidRecord[]}};
const views:PlateView[]=['letters','form','orientation','generation'];

function fitCamera(box:THREE.Box3,width:number,height:number,iso:PresentationOptions['iso']){
  const center=box.getCenter(new THREE.Vector3()),span=Math.max(1,box.getSize(new THREE.Vector3()).length());
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,span*12);
  camera.up.set(0,0,1);
  camera.position.copy(center).add(new THREE.Vector3(iso.includes('E')?span:-span,iso.includes('N')?span:-span,span*.85));
  camera.lookAt(center);camera.updateMatrixWorld();
  const projected=new THREE.Box3();
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  }
  const extent=projected.getSize(new THREE.Vector3()),aspect=width/height;
  const half=Math.max(extent.y/2,extent.x/(2*aspect))/.86;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  camera.updateProjectionMatrix();
  return camera;
}

export async function createAmphitheaterPlate(result:AmphitheaterResult,options:PresentationOptions){
  if(!result.architecture.indices.length)throw Error('Generate and save a design before exporting.');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true});
  renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NoToneMapping;renderer.localClippingEnabled=true;
  const canvas=document.createElement('canvas');
  canvas.width=options.size;canvas.height=options.view==='board'?Math.round(options.size*1.125):options.size;
  const ctx=canvas.getContext('2d');
  if(!ctx){renderer.dispose();throw Error('PNG creation is unavailable in this browser.');}
  if(!options.transparent){ctx.fillStyle='#000000';ctx.fillRect(0,0,canvas.width,canvas.height);}
  const resources:{dispose:()=>void}[]=[];
  const info=result as PresentationResult;
  const rules=presentationRules(result);
  const selectedVoids=(info.boundaryReport?.voids??[]).filter(v=>!options.ruleSource||v.source===options.ruleSource);
  const bounds=new THREE.Box3();
  for(const mesh of [result.architecture,...result.letters.map(letter=>letter.mesh)]){
    const attr=new THREE.Float32BufferAttribute(mesh.positions,3);
    bounds.union(new THREE.Box3().setFromBufferAttribute(attr));
  }
  function addMesh(scene:THREE.Scene,mesh:ProofMesh,color:string,opacity=1,clippingPlanes:THREE.Plane[]=[]){
    const original=meshGeometry(mesh),geometry=toCreasedNormals(original,Math.PI/6);
    if(geometry!==original)original.dispose();
    const material=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,
      transparent:opacity<1,opacity,depthWrite:opacity===1,clippingPlanes});
    resources.push(geometry,material);
    const object=new THREE.Mesh(geometry,material);scene.add(object);return object;
  }
  function line(scene:THREE.Scene,points:THREE.Vector3[],color:string=PRESENTATION_COLORS.rules){
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const material=new THREE.LineBasicMaterial({color,depthTest:false});
    resources.push(geometry,material);
    const object=new THREE.Line(geometry,material);object.renderOrder=20;scene.add(object);
  }
  function arrow(scene:THREE.Scene,start:THREE.Vector3,direction:THREE.Vector3,length:number){
    const helper=new THREE.ArrowHelper(direction.clone().normalize(),start,length,PRESENTATION_COLORS.rules,length*.15,length*.07);
    scene.add(helper);resources.push(helper.line.geometry,helper.cone.geometry);
    const materials=[helper.line.material,helper.cone.material].flat();
    resources.push(...materials);
  }
  function text(value:string,x:number,y:number,size:number,color:string=PRESENTATION_COLORS.form){
    ctx!.fillStyle=color;ctx!.font=size+'px Arial, sans-serif';ctx!.fillText(value,x,y);
  }
  function lighting(scene:THREE.Scene){
    scene.add(new THREE.AmbientLight(0xffffff,.85));
    const light=new THREE.DirectionalLight(0xffffff,1.65);light.position.set(40,-60,90);scene.add(light);
  }
  async function voidFieldGenerationDetail(x:number,y:number,width:number){
    text('GENERATION RULES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
    const allWalls=result.voidFieldReport?.walls??[];
    const walls=allWalls.filter(wall=>!options.ruleSource||wall.source===options.ruleSource);
    const wall=[...walls].sort((a,b)=>(b.maximumPlanShift??0)-(a.maximumPlanShift??0))[0];
    const record=selectedVoids[0];
    const rows:('void'|'wall')[]=record&&wall?['void','wall']:wall?['wall']:record?['void']:[];
    if(!rows.length){text('This source has no saved void or façade operation.',x,y+width*.2,width*.026);return;}
    for(const [row,kind] of rows.entries()){
      const id=kind==='wall'?wall!.source:record!.source;
      const letter=result.letters.find(item=>item.id===id);if(!letter)continue;
      const sourceBox=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(letter.mesh.positions,3));
      const box=sourceBox.clone();
      const operation=kind==='wall'?wall!.mesh:record!.cutterMesh;
      if(operation)box.union(new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(operation.positions,3)));
      box.expandByScalar(result.request.preferredFeet*.12);
      const planes=[new THREE.Plane(new THREE.Vector3(1,0,0),-box.min.x),new THREE.Plane(new THREE.Vector3(-1,0,0),box.max.x),new THREE.Plane(new THREE.Vector3(0,1,0),-box.min.y),new THREE.Plane(new THREE.Vector3(0,-1,0),box.max.y)];
      const rowY=y+width*(.11+row*.37),cellWidth=width*.31,cellHeight=width*.26;
      text(id+' · '+(kind==='wall'?'EXTRUSION':'SUBTRACTION'),x,rowY,width*.029,PRESENTATION_COLORS.rules);
      const normal=wall?.normal;
      for(let stage=0;stage<3;stage++){
        await new Promise(resolve=>setTimeout(resolve,0));
        const scene=new THREE.Scene();lighting(scene);
        const px=x+stage*width*.345;
        const label=stage===0?'Original source':kind==='wall'?(stage===1?'Sweep from source face':'Trimmed exterior façade'):(stage===1?'Inner contour + cutter':'Void through actual form');
        text(label,px,rowY+width*.04,width*.022);
        addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters,stage===0?1:.75);
        if(stage>0&&operation){
          if(stage===2)addMesh(scene,result.architecture,PRESENTATION_COLORS.form,.22,planes);
          addMesh(scene,kind==='wall'&&stage===2?(wall!.finalMesh??operation):operation,PRESENTATION_COLORS.rules,.7);
        }
        if(kind==='wall'){
          const traces=wall!.trace??[];
          if(stage===0&&normal){const center=sourceBox.getCenter(new THREE.Vector3());arrow(scene,center,new THREE.Vector3(...normal as [number,number,number]),result.request.preferredFeet*.45);}
          if(stage>0)for(const trace of traces.slice(0,4)){
            const start=new THREE.Vector3(...trace.roof as [number,number,number]),end=new THREE.Vector3(...trace.support as [number,number,number]);
            arrow(scene,start,end.clone().sub(start),start.distanceTo(end));
          }
        }else if(record?.sourceContour?.length){
          const contour=(record.closedContour??record.sourceContour).map(p=>new THREE.Vector3(...p as [number,number,number]));line(scene,[...contour,contour[0]]);
          if(stage>0)arrow(scene,sourceBox.getCenter(new THREE.Vector3()),new THREE.Vector3(...record.axis as [number,number,number]),result.request.preferredFeet*.5);
        }
        renderer.setSize(Math.round(cellWidth),Math.round(cellHeight),false);renderer.setClearColor('#000000',0);
        renderer.render(scene,fitCamera(box,cellWidth,cellHeight,options.iso));ctx!.drawImage(renderer.domElement,px,rowY+width*.06,cellWidth,cellHeight);scene.clear();
      }
    }
    const faceNormal=wall?.mode==='face-normal';
    text(wall?(faceNormal?'Façade sweeps perpendicular to its saved source face.':'Façade uses global Z (vertical comparison).'):'Void follows the actual source concavity; subtract through levels.',x,y+width*.86,width*.025);
    if(wall){
      const n=wall.normal;
      text(faceNormal&&n?'Face normal n = ('+n.map(v=>v.toFixed(3)).join(', ')+'); sweep direction = −n.':'Source upper geometry caps the vertical sweep.',x,y+width*.90,width*.024);
      text('Support Z '+(wall.supportZ??0).toFixed(2)+' ft · '+(wall.supportRule??'saved support')+'.',x,y+width*.94,width*.024);
    }else text('Blue: subtractive cutter · gold: unchanged source letter.',x,y+width*.90,width*.024);
    text('Trim to field + protected voids. Floors stay horizontal.',x,y+width*.98,width*.024);
  }

  async function generationDetail(x:number,y:number,width:number){
    text('GENERATION RULES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
    const records=selectedVoids.filter(v=>v.sourceContour?.length&&v.cutterMesh?.indices.length).slice(0,2);
    if(!records.length){
      text('Regenerate this study to record source-to-void geometry.',x,y+width*.2,width*.026);
      return;
    }
    const cellWidth=width*.31,cellHeight=width*(records.length===1?.59:.30);
    for(const [row,record] of records.entries()){
      const letter=result.letters.find(item=>item.id===record.source);
      if(!letter||!record.sourceContour)continue;
      const sourceBox=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(letter.mesh.positions,3));
      const center=sourceBox.getCenter(new THREE.Vector3());
      const localBox=sourceBox.clone().expandByScalar(result.request.preferredFeet*.28);
      if(result.request.envelopeVersion==='void-field'&&record.cutterMesh){localBox.union(new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(record.cutterMesh.positions,3)));}
      const planes=[
        new THREE.Plane(new THREE.Vector3(1,0,0),-localBox.min.x),
        new THREE.Plane(new THREE.Vector3(-1,0,0),localBox.max.x),
        new THREE.Plane(new THREE.Vector3(0,1,0),-localBox.min.y),
        new THREE.Plane(new THREE.Vector3(0,-1,0),localBox.max.y),
        new THREE.Plane(new THREE.Vector3(0,0,1),-localBox.min.z),
        new THREE.Plane(new THREE.Vector3(0,0,-1),localBox.max.z)
      ];
      const rowY=y+width*(.11+row*.37);
      text(record.source,x,rowY,width*.029,PRESENTATION_COLORS.rules);
      for(let stage=0;stage<3;stage++){
        await new Promise(resolve=>setTimeout(resolve,0));
        const scene=new THREE.Scene();lighting(scene);
        const px=x+stage*width*.345;
        const labels=['Source letter','Inner contour + cutter','Opening through form'];
        text(labels[stage],px,rowY+width*.045,width*.024);
        renderer.setSize(Math.round(cellWidth),Math.round(cellHeight),false);renderer.setClearColor('#000000',0);
        if(stage<2)addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters,stage===0?1:.4);
        if(stage===2)addMesh(scene,result.architecture,PRESENTATION_COLORS.form,.48,planes);
        if(stage>0&&record.cutterMesh)addMesh(scene,record.cutterMesh,PRESENTATION_COLORS.rules,.65,planes);
        const contour=(record.closedContour??record.sourceContour).map(p=>new THREE.Vector3(...p as [number,number,number]));
        line(scene,[...contour,contour[0]]);
        if(stage>0)arrow(scene,center,new THREE.Vector3(...record.axis as [number,number,number]),result.request.preferredFeet*.4);
        renderer.render(scene,fitCamera(localBox,cellWidth,cellHeight,options.iso));
        ctx!.drawImage(renderer.domElement,px,rowY+width*.065,cellWidth,cellHeight);
      }
    }
    text('Source contour → cutter → opening in clipped form',x,y+width*.89,width*.026);
    if(result.request.envelopeVersion==='vertical-walls'){
      text('Platform 0.75 ft · step out '+(result.request.preferredFeet*.075).toFixed(3)+' ft · rise ≤ '+(result.request.preferredFeet*.12).toFixed(2)+' ft',x,y+width*.93,width*.024);
      text('Horizontal terraces · vertical exterior walls',x,y+width*.97,width*.024);
    }
    if(selectedVoids.length>2)text('Showing two sources. Select a Rule source for another detail.',x,y+width*.967,width*.024);
  }

  async function visibilityPanel(x:number,y:number,width:number){
    const visibility=result.voidFieldReport?.visibility;
    text('ATRIUM SIGHTLINES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
    if(!visibility){text('This saved study has no validated atrium sightlines.',x,y+width*.20,width*.025);return;}
    const source=result.letters.find(l=>l.id===visibility.source),paths=visibility.crossLevel.flatMap(p=>p.views.slice(0,2));
    const representative=paths[0],axis=representative?new THREE.Vector3(...representative.end as [number,number,number]).sub(new THREE.Vector3(...representative.start as [number,number,number])):new THREE.Vector3(1,0,0);
    const normal=new THREE.Vector3(-axis.y,axis.x,0).normalize(),center=bounds.getCenter(new THREE.Vector3());
    for(let stage=0;stage<2;stage++){
      const scene=new THREE.Scene();lighting(scene);
      const origin=representative?new THREE.Vector3(...representative.start as [number,number,number]):center;
      const planes=stage===1?[new THREE.Plane(normal,-normal.dot(origin))]:[];
      addMesh(scene,result.architecture,PRESENTATION_COLORS.form,stage===0?.38:1,planes);
      if(stage===0&&source)addMesh(scene,source.mesh,PRESENTATION_COLORS.letters,.48);
      for(const ray of paths)line(scene,[new THREE.Vector3(...ray.start as [number,number,number]),new THREE.Vector3(...ray.end as [number,number,number])]);
      for(const ray of visibility.sky.slice(0,1))line(scene,[new THREE.Vector3(...ray.start as [number,number,number]),new THREE.Vector3(...ray.end as [number,number,number])]);
      for(const level of visibility.floorViews)for(const ray of level.views.slice(0,1))line(scene,[new THREE.Vector3(...ray.start as [number,number,number]),new THREE.Vector3(...ray.end as [number,number,number])]);
      const cell=width*.48,height=width*.62,camera=fitCamera(bounds,cell,height,options.iso);
      if(stage===1){camera.position.copy(center).addScaledVector(normal,Math.max(1,bounds.getSize(new THREE.Vector3()).length())*2);camera.lookAt(center);camera.updateMatrixWorld();}
      renderer.setSize(Math.round(cell),Math.round(height),false);renderer.setClearColor('#000000',0);renderer.render(scene,camera);
      ctx!.drawImage(renderer.domElement,x+stage*width*.52,y+width*.13,cell,height);
      text(stage===0?'Actual form · translucent':'Vertical section through a tested path',x+stage*width*.52,y+width*.10,width*.022);
    }
    text(visibility.source+' contours → floor-facing bays → cross-level views',x,y+width*.80,width*.026);
    text('Floor views: '+visibility.floorViews.map(f=>f.portalCount).join(' / ')+' · Cross-level paths: '+visibility.crossLevel.reduce((n,p)=>n+p.views.length,0),x,y+width*.85,width*.025);
    text('Blue lines are clear sampled paths in the exported geometry.',x,y+width*.90,width*.024);
    text('Open to sky; daylight performance and guarding are not verified.',x,y+width*.95,width*.023);
  }

  async function insertedPlateDetail(x:number,y:number,width:number){
    const report=result.plateReport!;
    const cell=Math.round(width*.31),height=Math.round(width*.62);
    for(let stage=0;stage<3;stage++){
      renderer.setSize(cell,height,false);renderer.setClearColor('#000000',0);
      const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,.9));const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(40,-60,90);scene.add(light);
      if(stage===0)result.letters.forEach(l=>addMesh(scene,l.mesh,PRESENTATION_COLORS.letters));
      else {addMesh(scene,result.architecture,PRESENTATION_COLORS.form,.4);const ids=stage===1?report.floors.map(f=>f.id):result.components.filter(c=>c.id.startsWith('boundary-')).map(c=>c.id);for(const id of ids){const c=result.components.find(c=>c.id===id);if(c)addMesh(scene,c.mesh,PRESENTATION_COLORS.rules,.9);}}
      renderer.render(scene,fitCamera(bounds,cell,height,options.iso));ctx!.drawImage(renderer.domElement,x+stage*width*.34,y+width*.12,cell,height);scene.clear();
      text(['Original sources','Horizontal plates','Edges + boundaries'][stage],x+stage*width*.34,y+width*.10,width*.022);
    }
    text('INSERTED PLATE — ACTUAL COMPONENTS',x,y+width*.045,width*.035,PRESENTATION_COLORS.letters);
    text('L outlines → planar plates → connections to U/V boundaries',x,y+width*.80,width*.026);
    text('U inside contours retain open recesses above the plates.',x,y+width*.85,width*.026);
    text('V source caps define vertical walls to the previous plate support.',x,y+width*.90,width*.024);
    text('Plate links are geometric; circulation and structural support are not certified.',x,y+width*.95,width*.021);
  }

  async function panel(view:PlateView,x:number,y:number,width:number){
    await new Promise(resolve=>setTimeout(resolve,0));
    if(view==='generation'&&result.plateReport){await insertedPlateDetail(x,y,width);return;}
    if(view==='generation'&&result.voidFieldReport){await voidFieldGenerationDetail(x,y,width);return;}
    if(view==='generation'){await generationDetail(x,y,width);return;}
    const scene=new THREE.Scene();
    const details=view==='orientation';
    const drawingWidth=Math.round(width*(details?.72:1)),drawingHeight=Math.round(width*(details?.64:.76));
    const limit=renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number;
    if(Math.max(drawingWidth,drawingHeight)>limit)throw Error('This GPU cannot render this resolution. Choose 2048 pixels.');
    renderer.setSize(drawingWidth,drawingHeight,false);renderer.setClearColor('#000000',0);
    const ambient=new THREE.AmbientLight(0xffffff,.85),key=new THREE.DirectionalLight(0xffffff,1.65);
    key.position.set(40,-60,90);scene.add(ambient,key);
    const fill=new THREE.DirectionalLight(0xffffff,.5);fill.position.set(-30,25,30);scene.add(fill);
    const camera=fitCamera(bounds,drawingWidth,drawingHeight,options.iso);
    if(view==='form')addMesh(scene,result.architecture,PRESENTATION_COLORS.form);
    if(view==='letters'||view==='orientation'){
      result.letters.forEach(letter=>addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters,1));
    }
    const annotationSources=details?(result.plateReport?result.letters.slice(0,3).map(l=>l.id):selectedVoids.length?selectedVoids.map(v=>v.source):
      result.letters.filter((_,i)=>result.request.source[i]?.architecturalRole==='interior').map(v=>v.id)):[];
    if(view==='orientation'){
      for(const id of annotationSources){
        const index=result.letters.findIndex(letter=>letter.id===id),p=result.request.source[index];
        if(!p)continue;
        const origin=new THREE.Vector3(p.x,p.y,p.z+result.request.field.height/2),radius=result.request.preferredFeet*.36;
        const yaw=p.rz*Math.PI/180;
        const arc=Array.from({length:33},(_,i)=>new THREE.Vector3(radius*Math.cos(yaw*i/32),radius*Math.sin(yaw*i/32),0).add(origin));
        line(scene,arc);arrow(scene,arc.at(-1)!,new THREE.Vector3(-Math.sin(yaw),Math.cos(yaw),0),radius*.33);
        const tilt=Array.from({length:33},(_,i)=>new THREE.Vector3(0,radius*Math.cos(p.rx*Math.PI/180*i/32),radius*Math.sin(p.rx*Math.PI/180*i/32))
          .applyAxisAngle(new THREE.Vector3(0,0,1),yaw).add(origin));
        line(scene,tilt);
        const record=selectedVoids.find(v=>v.source===id);
        if(record?.sourceContour?.length)line(scene,[...(record.closedContour??record.sourceContour),(record.closedContour??record.sourceContour)[0]].map(p=>new THREE.Vector3(...p as [number,number,number])));
      }
    }
    renderer.render(scene,camera);
    text(PLATE_LABELS[view].toUpperCase(),x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
    ctx!.drawImage(renderer.domElement,x,y+width*.08,drawingWidth,drawingHeight);
    if(details){
      const rail=x+width*.745;
      annotationSources.slice(0,8).forEach((id,i)=>{
        const index=result.letters.findIndex(letter=>letter.id===id),p=result.request.source[index];
        if(!p)return;
        const labelY=y+width*(.15+i*.115);
        const projected=new THREE.Vector3(p.x,p.y,p.z+result.request.field.height/2).project(camera);
        ctx!.strokeStyle=PRESENTATION_COLORS.rules;ctx!.lineWidth=Math.max(1,width*.001);
        ctx!.beginPath();ctx!.moveTo(x+(projected.x+1)*drawingWidth/2,y+width*.08+(1-projected.y)*drawingHeight/2);
        ctx!.lineTo(rail-width*.015,labelY-width*.008);ctx!.stroke();
        text(id+(p.lift?' · '+p.lift:''),rail,labelY,width*.026,PRESENTATION_COLORS.rules);
        if(view==='orientation'){
          text('X '+p.rx.toFixed(0)+'°  Y '+p.ry.toFixed(0)+'°',rail,labelY+width*.035,width*.025);
          text('Z '+p.rz.toFixed(0)+'°',rail,labelY+width*.07,width*.025);
        }else{
          const record=selectedVoids.find(v=>v.source===id);
          text(record?.alcove?'Bounded alcove':'Through opening',rail,labelY+width*.025,width*.017);
          if(record?.removedVolume!==undefined)text(record.removedVolume.toFixed(1)+' ft³ removed',rail,labelY+width*.05,width*.016);
        }
      });
    }
    const captions:Record<PlateView,string[]> = {
      letters:['Original source identities and transformations'],
      form:['Validated architectural mesh · '+result.sourceCount+' source letters'],
      orientation:result.request.envelopeVersion==='inserted-plate'?['Horizontal L/U sources · upright V boundary sources','Blue arcs show actual saved source rotations']:result.request.envelopeVersion==='void-field'?['Horizontal interior letters · global Z plan rotation','Blue contours define vertical source-derived voids']:result.request.source.some(p=>p.lift)?['Lower / top terraces · middle interior uprights',
        'Blue arcs show actual X tilt and Z rotation']:
        ['Blue arcs show actual X tilt and Z rotation'],
      generation:result.request.envelopeVersion==='inserted-plate'?['L-derived plates intersect U edges and upright V boundaries','Plate elevations and connecting strips follow source relationships']:selectedVoids.some(v=>v.cutterMesh?.indices.length)?
        ['Gold letter contours guide terrace setbacks and vertical exterior walls',
          'Blue inner contours sweep horizontally to carve architectural openings']:
        ['This saved study has no recorded cutter meshes.','Regenerate architecture to create source correspondence data.']
    };
    if(view==='orientation'){
      rules.orientation.forEach((caption,i)=>text(caption,x,y+width*(.825+i*.04),width*.024));
    }else captions[view].forEach((caption,i)=>text(caption,x,y+width*(.905+i*.032),width*.026));
    scene.clear();
  }
  try{
    if(options.view==='board'){
      const margin=canvas.width*.04,gap=canvas.width*.03,width=(canvas.width-2*margin-gap)/2;
      text((result.request.typologyName??'Stepped Amphitheater').toUpperCase(),margin,canvas.width*.075,canvas.width*.045,PRESENTATION_COLORS.form);
      ctx.strokeStyle=PRESENTATION_COLORS.form;ctx.lineWidth=canvas.width*.0007;
      ctx.beginPath();ctx.moveTo(margin,canvas.width*.105);ctx.lineTo(canvas.width-margin,canvas.width*.105);ctx.stroke();
      for(const [i,view] of views.entries())await panel(view,margin+(i%2)*(width+gap),canvas.width*.135+Math.floor(i/2)*(width+gap),width);
      text(result.request.field.width+' × '+result.request.field.depth+' × '+result.request.field.height+' ft · '+result.request.preferredFeet+' ft preferred letters',
        margin,canvas.height-margin*.5,canvas.width*.018);
    }else {
      text((result.request.typologyName??'Stepped Amphitheater').toUpperCase(),canvas.width*.04,canvas.width*.06,canvas.width*.035,PRESENTATION_COLORS.form);
      if(options.view==='visibility')await visibilityPanel(canvas.width*.04,canvas.width*.09,canvas.width*.89);else await panel(options.view,canvas.width*.04,canvas.width*.09,canvas.width*.89);
    }
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG encoding failed.')),'image/png'));
    return await pngWithDpi(blob);
  }finally{
    resources.forEach(resource=>resource.dispose());
    renderer.dispose();renderer.forceContextLoss();
    canvas.width=canvas.height=1;
  }
}
