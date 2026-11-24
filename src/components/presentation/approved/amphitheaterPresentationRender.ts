import {SHARED_BOARD_RULES as shared,GATHERING_BOARD_RULES as profiles} from '../rules';
import {plateJunctionSvg} from './plateJunctionPresentation';
import {shadeGalleryInterior} from './linearGalleryInteriorMaterial';
import {galleryPanel,galleryJoint} from './linearGalleryPresentationPanel';
import {findFacadeJoint} from './voidFieldBoardJoint';
import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {AmphitheaterResult,ProofMesh} from './amphitheaterInteractiveTypes';
import {meshGeometry,PLATE_LABELS,PRESENTATION_COLORS,pngWithDpi,presentationRules,type PlateView,type ExportView} from './amphitheaterPresentationExport';

export const BOARD_WIDTH=shared.width;
export const BOARD_HEIGHT=shared.height;
const plateBoardRowGapIncrease=profiles['inserted-plate'].detailRowGapIncrease; // Fraction of one board column per successive detail.

export type PresentationOptions={view:ExportView;size:number;transparent:boolean;iso:'SE'|'SW'|'NE'|'NW'|'Pier';ruleSource:string};
type VoidRecord={source:string;axis:number[];sourceContour?:number[][];closedContour?:number[][];closure?:{addedEdges:number[][]};cutterMesh?:ProofMesh;removedVolume?:number;removedMesh?:ProofMesh;alcove?:boolean};
type PresentationResult=AmphitheaterResult&{boundaryReport?:{voids:VoidRecord[];walls?:NonNullable<AmphitheaterResult['voidFieldReport']>['walls']}};
const views:PlateView[]=['letters','form','orientation','generation'];

export function fitCamera(box:THREE.Box3,width:number,height:number,iso:PresentationOptions['iso'],azimuth?:THREE.Vector2){
  const center=box.getCenter(new THREE.Vector3()),span=Math.max(1,box.getSize(new THREE.Vector3()).length());
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,shared.camera.near,span*shared.camera.farSpan);
  camera.up.set(0,0,1);
  camera.position.copy(center).add(new THREE.Vector3(azimuth?azimuth.x*span:(iso==='Pier'||iso.includes('E')?span:-span),azimuth?azimuth.y*span:(iso.includes('N')?span:-span),span*shared.camera.elevation));
  camera.lookAt(center);camera.updateMatrixWorld();
  const projected=new THREE.Box3();
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  }
  const extent=projected.getSize(new THREE.Vector3()),aspect=width/height;
  const half=Math.max(extent.y/2,extent.x/(2*aspect))/shared.camera.occupancy;
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
  canvas.width=options.view==='board'?BOARD_WIDTH:options.size;
  canvas.height=options.view==='board'?BOARD_HEIGHT:options.size;
  const ctx=canvas.getContext('2d');
  if(!ctx){renderer.dispose();throw Error('PNG creation is unavailable in this browser.');}
  if(!options.transparent){ctx.fillStyle=shared.background;ctx.fillRect(0,0,canvas.width,canvas.height);}
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
    const material=new THREE.MeshStandardMaterial({color,roughness:shared.material.roughness,side:THREE.DoubleSide,
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
  let boardPanel:{x:number;y:number;width:number}|undefined;
  const studyTitle=result.request.envelopeVersion==='linear-edge-gallery'?'Linear Edge':result.request.typologyName??'Stepped Amphitheater';
  const typologyTitle=result.request.envelopeVersion==='void-field'?'Void-Field':studyTitle;
  function text(value:string,x:number,y:number,size:number,color:string=PRESENTATION_COLORS.form){
    if(options.view==='board'&&boardPanel){
      const w=boardPanel.width;
      if(['ORIGINAL LETTERS','ARCHITECTURAL FORM','ORIENTATION RULES','GENERATION RULES'].includes(value)){
        size=w*shared.layout.panelHeadingSize;y=boardPanel.y+w*shared.layout.panelHeadingY;
      }
    }
    ctx!.fillStyle=color;ctx!.font=size+'px '+shared.font;ctx!.fillText(value,x,y);
  }
  function lighting(scene:THREE.Scene){
    scene.add(new THREE.AmbientLight(0xffffff,.85));
    const light=new THREE.DirectionalLight(0xffffff,1.65);light.position.set(40,-60,90);scene.add(light);
  }
  function steppedRules(view:'orientation'|'generation',x:number,y:number,width:number){
    const report=info.boundaryReport;
    if(!report?.walls?.length)return false;
    const walls=report.walls.filter(w=>w.mesh?.indices.length);
    const wall=walls.find(w=>w.source===options.ruleSource)??walls[0];
    if(!wall?.mesh)return false;
    const voids=report.voids??[];
    const cut=voids.find(v=>v.source===options.ruleSource)??voids.find(v=>v.alcove)??voids[0];
    const source=(id:string)=>result.letters.find(l=>l.id===id);
    const wallLetter=source(wall.source);
    const cutLetter=cut&&source(cut.source);
    const terraceId=result.request.source.findIndex(p=>p.architecturalRole==='terrace'&&p.lift!=='lower');
    const preferredBand=options.ruleSource||result.letters[terraceId]?.id;
    const band=result.components.find(c=>c.id==='contour-'+preferredBand&&preferredBand!==cut?.source)
      ??result.components.find(c=>c.id==='contour-'+wall.source);
    type Layer={mesh?:ProofMesh;color:string;opacity?:number};
    function row(top:number,height:number,title:string,layers:Layer[],lines:string[]){
      const scene=new THREE.Scene();lighting(scene);
      const box=new THREE.Box3();
      for(const layer of layers){
        if(!layer.mesh?.indices.length)continue;
        const object=addMesh(scene,layer.mesh,layer.color,layer.opacity);
        box.expandByObject(object);
      }
      const w=width*.36,h=width*height;
      if(!box.isEmpty()){
        renderer.setSize(Math.round(w),Math.round(h),false);renderer.setClearColor('#000000',0);
        renderer.render(scene,fitCamera(box,w,h,options.iso));ctx!.drawImage(renderer.domElement,x,y+width*top,w,h);
      }
      const left=x+width*.38,base=y+width*(top+.045);
      text(title,left,base,width*.03,PRESENTATION_COLORS.rules);
      lines.forEach((value,i)=>text(value,left,base+width*(.052+i*.044),width*.026));
    }
    const {letters:gold,rules:blue,form:white}=PRESENTATION_COLORS;
    text(view==='orientation'?'ORIENTATION RULES':'GENERATION RULES',x,y+width*.045,width*.036,gold);
    if(view==='orientation'){
      row(.10,.36,'EXTERIOR LETTERS',[{mesh:wallLetter?.mesh,color:gold}],
        ['Perimeter faces start horizontal.', 'New letters may slope up or down', 'by up to 12 degrees. The slope', 'sets the upper edge of the wall.']);
      row(.54,.36,'INTERIOR LETTERS',[{mesh:cutLetter?.mesh,color:gold}],
        cut?['The inner edge defines the void.', 'Turning the letter in plan aims', 'its extrusion into the form.']:['No interior void in this study.']);
    }else{
      row(options.view==='board'?.10:.08,.27,'WALL EXTRUSION',[{mesh:wall.mesh,color:white},{mesh:wallLetter?.mesh,color:gold}],
        ['The outer edge extrudes down', 'to form a vertical wall. Its top', 'follows the letter; the platform', 'uses its outline and stays level.']);
      row(options.view==='board'?.54:.38,.26,'VOIDS AND RECESSES',[{mesh:cut?.cutterMesh,color:blue,opacity:.7},{mesh:cutLetter?.mesh,color:gold}],
        cut?['Extrude the inner contour into', 'the form for a recessed alcove.', 'Extend it through the far side', 'for a through-opening.']:['No subtraction in this study.']);
      row(options.view==='board'?.98:.68,.28,'TERRACING',[{mesh:band?.mesh,color:white}],
        ['Level platforms follow the outline.', 'Successive offsets form wider', 'steps beneath the platform.']);
    }
    return true;
  }
  async function wallAndVoidGenerationDetail(x:number,y:number,width:number){
    text('GENERATION RULES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
    const allWalls=result.voidFieldReport?.walls??info.boundaryReport?.walls??[];
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
        const label=stage===0?'Original source':kind==='wall'?(stage===1?(result.voidFieldReport?'Sweep from source face':'Sweep exterior edge down'):'Trimmed exterior façade'):(stage===1?'Inner contour + cutter':'Void through actual form');
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
    text(wall?(faceNormal?'Façade sweeps perpendicular to its saved source face.':'Exterior edge sweeps vertically down to its support.'):'Void follows the actual source concavity; subtract through levels.',x,y+width*.86,width*.025);
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

  function plateRulesPanel(view:'orientation'|'generation',x:number,y:number,width:number){
    const wall=result.components.find(c=>c.id.startsWith('boundary-U-'))??result.components.find(c=>c.id.startsWith('boundary-'));
    const pier=result.components.find(c=>c.id.startsWith('corner-pier-'));
    const source=(id?:string)=>result.letters.find(l=>l.id===id);
    const wallLetter=source(wall?.id.slice('boundary-'.length)),cap=source(pier?.id.slice('corner-pier-'.length));

    const extraGap=options.view==='board'?plateBoardRowGapIncrease:0;
    const {letters:gold,rules:blue}=PRESENTATION_COLORS;
    text(view==='orientation'?'ORIENTATION RULES':'GENERATION RULES',x,y+width*.045,width*.036,gold);
    function row(top:number,h:number,title:string,caption:string[],letter?:ProofMesh,part?:ProofMesh){
      const scene=new THREE.Scene(),box=new THREE.Box3();
      if(letter)box.expandByObject(addMesh(scene,letter,gold));
      if(part){
        const local=box.clone().expandByScalar(result.request.preferredFeet*.42);
        const planes=local.isEmpty()?[]:([0,1,2] as const).flatMap(i=>[1,-1].map(sign=>
          new THREE.Plane(new THREE.Vector3().setComponent(i,sign),-sign*(sign===1?local.min:local.max).getComponent(i))));
        const object=addMesh(scene,part,PRESENTATION_COLORS.form,.38,planes);
        const visible=new THREE.Box3().setFromObject(object);
        box.union(local.isEmpty()?visible:visible.intersect(local));
      }
      if(!box.isEmpty()){
        const w=width*.39,hh=width*h;lighting(scene);
        renderer.setSize(Math.round(w),Math.round(hh),false);renderer.setClearColor('#000000',0);
        renderer.render(scene,fitCamera(box,w,hh,options.iso));ctx!.drawImage(renderer.domElement,x,y+top*width,w,hh);
      }
      const left=x+width*.405;
      text(title,left,y+width*(top+.05),width*.031,blue);
      caption.forEach((v,i)=>text(v,left,y+width*(top+.112+i*.044),width*.026));
    }
    if(view==='orientation'){
      row(.09,.34,'EXTERIOR LETTERS',["L and V stand upright. U turns onto its side.","Face lean ranges from 0° to 5° off vertical","(V 0°, L 3°, U 5°). Exterior edges of these","letters extrude toward adjacent letter edges","to form floating wall bands."],wallLetter?.mesh);
      row(.429+extraGap,.34,'HORIZONTAL CORNER L',cap?['The L lies flat at the top of the','corner pier. Its two arms set the','column footprint.']:['No corner-column source is','present in this study.'],cap?.mesh);
    }else{
      const seams=result.plateReport!.seams??[];
      const pair=seams.find(s=>s.source.startsWith('U-')&&s.receiver.startsWith('L-')&&s.cap?.length)
        ??seams.find(s=>s.cap?.length&&source(s.source)&&source(s.receiver));
      const ink=ctx!;
      const wallCaption=['Exterior letter edges extrude','perpendicular to their faces toward','the edges of adjoining letters.','The segments meet to form a floating',pier?'band secured by the column.':'wall band.'];
      if(pair?.cap?.length){
        const scene=new THREE.Scene(),box=new THREE.Box3();
        const cap=pair.cap.map(p=>new THREE.Vector3(...p));
        const joint=new THREE.Box3().setFromPoints(cap).getCenter(new THREE.Vector3());
        const centers:THREE.Vector3[]=[];
        for(const id of [pair.source,pair.receiver]){
          const index=result.letters.findIndex(l=>l.id===id);
          const pose=result.request.source[index],letter=result.letters[index];
          const band=result.components.find(c=>c.id==='boundary-'+id);
          if(!letter||!pose||!band)continue;
          const object=addMesh(scene,letter.mesh,gold);
          const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
          centers.push(center);box.expandByObject(object);
          const rad=THREE.MathUtils.degToRad;
          const normal=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(rad(pose.rx),rad(pose.ry),rad(pose.rz),pose.rotationOrder??'XYZ'));
          if(normal.dot(joint.clone().sub(center))<0)normal.negate();
          const p=letter.mesh.positions;
          let start=-Infinity;
          for(let i=0;i<p.length;i+=3)start=Math.max(start,p[i]*normal.x+p[i+1]*normal.y+p[i+2]*normal.z);
          const end=Math.max(...cap.map(v=>normal.dot(v)));
          // Isolate the existing wall between the letter face and the saved joint.
          addMesh(scene,band.mesh,PRESENTATION_COLORS.form,.38,[
            new THREE.Plane(normal,-start),new THREE.Plane(normal.clone().negate(),end+.001)]);
        }
        cap.forEach(v=>box.expandByPoint(v));
        const axis=centers.length===2?new THREE.Vector2(centers[0].y-centers[1].y,centers[1].x-centers[0].x).normalize().multiplyScalar(-1.45):undefined;
        const w=width*.39,h=width*.28;
        lighting(scene);renderer.setSize(Math.round(w),Math.round(h),false);renderer.setClearColor('#000000',0);
        renderer.render(scene,fitCamera(box,w,h,options.iso,axis));
        ink.drawImage(renderer.domElement,x,y+width*.085,w,h);
        row(.09,.27,'WALL EXTRUSION',wallCaption);
      }else{
        row(.09,.27,'WALL EXTRUSION',wallCaption,wallLetter?.mesh,wall?.mesh);
      }
      row(.4306+extraGap,.27,'HORIZONTAL PLATE',['A level plate spans from one inner','letter edge to the other, covering','the inner face at each end.']);
      // Rule diagram in a common axonometric projection. The two ends of
      // the plate share the coordinates of the letters’ horizontal inner edges.
      ink.save();
      ink.translate(x+width*.045,y+width*(.4306+extraGap));
      ink.scale(width*.00112,width*.00112);
      function face(d:string,fill:string){
        ink.fillStyle=fill;
        ink.fill(new Path2D(d));
      }
      function letter(dx:number,dy:number,path:string,top:string,side:string){
        ink.save();
        ink.transform(1,-.25,0,1,dx,dy);
        ink.globalAlpha=.65;
        ink.save();
        ink.translate(10,-5);
        face(path,'#94783a');
        ink.restore();
        face(side,'#aa8538');
        face(top,'#f3ce76');
        face(path,gold);
        ink.restore();
      }
      // Rear L: its inner edge runs from local (18,0) to (88,0).
      letter(145,99,'M0 -65 H18 V0 H88 V13 H0 Z',
        'M0 -65 H18 L28 -70 H10 Z M18 0 H88 L98 -5 H28 Z',
        'M18 -65 L28 -70 V-5 L18 0 Z M88 0 L98 -5 V8 L88 13 Z');
      face('M163 94.5 L233 77 L132 145 L62 162.5 Z',blue);
      face('M62 162.5 L132 145 V151 L62 168.5 Z','#518da3');
      face('M163 94.5 L62 162.5 V168.5 L163 100.5 Z','#3e7286');
      // Sideways U opens to the right. Its lower inner edge is the near end.
      letter(32,170,'M100 -47 H30 C-8 -47 -8 13 30 13 H100 V0 H30 C10 0 10 -34 30 -34 H100 Z',
        'M30 -47 H100 L110 -52 H40 Z M30 0 H100 L110 -5 H40 Z',
        'M100 -47 L110 -52 V-39 L100 -34 Z M100 0 L110 -5 V8 L100 13 Z M30 0 C10 0 10 -34 30 -34 L40 -39 C20 -39 20 -5 40 -5 Z');
      ink.restore();
      row(options.view==='board'&&plateJunctionSvg(result.plateReport!) ? .9659+3*extraGap : .69+2*extraGap,.27,'COLUMN EXTRUSION',cap?['Extrude the full corner L footprint','vertically down to the base. The','perimeter walls join the shaft.']:['No column was generated.'],cap?.mesh,pier?.mesh);
    }
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
    text('GENERATION RULES',x,y+width*.045,width*.035,PRESENTATION_COLORS.letters);
    text('L outlines → planar plates → connections to U/V boundaries',x,y+width*.80,width*.026);
    text('U inside contours retain open recesses above the plates.',x,y+width*.85,width*.026);
    text('V source caps define vertical walls to the previous plate support.',x,y+width*.90,width*.024);
    text('Plate links are geometric; circulation and structural support are not certified.',x,y+width*.95,width*.021);
  }

  function platePlans(x:number,y:number,width:number){
    const floors=result.plateReport!.floors;
    const elevations=[...new Set(floors.map(f=>f.topZ))].sort((a,b)=>a-b);
    const cols=elevations.length===1?1:2,rows=Math.ceil(elevations.length/cols);
    const cellW=width*.43/cols,cellH=width*.70/rows;
    const extent=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=Math.min(cellW*.91/extent.x,(cellH-width*.052)*.91/extent.y);
    const walls=result.components.filter(c=>c.id.startsWith('boundary-')||c.id.startsWith('corner-pier-'));
    elevations.forEach((top,i)=>{
      const left=x+width*.57+i%cols*cellW,rowY=y+width*.12+Math.floor(i/cols)*cellH;
      const levelFloors=floors.filter(f=>f.topZ===top);
      const cut=(top+levelFloors[0].bottomZ)/2;
      text('Level '+(i+1),left,rowY,width*.028);
      const originX=left+cellW/2,originY=rowY+cellH/2;
      const px=(v:number)=>originX+(v-center.x)*scale;
      const py=(v:number)=>originY-(v-center.y)*scale;
      const ink=ctx!;
      // Project the horizontal top triangles so trimmed ends and holes survive.
      ink.beginPath();
      for(const floor of levelFloors){
        const mesh=result.components.find(c=>c.id===floor.id)?.mesh;
        if(!mesh)continue;
        const {indices,positions:p}=mesh;
        for(let k=0;k<indices.length;k+=3){
          const a=3*indices[k],b=3*indices[k+1],c=3*indices[k+2];
          if([a,b,c].some(v=>Math.abs(p[v+2]-top)>.015))continue;
          ink.moveTo(px(p[a]),py(p[a+1]));ink.lineTo(px(p[b]),py(p[b+1]));
          ink.lineTo(px(p[c]),py(p[c+1]));ink.closePath();
        }
      }
      ink.fillStyle=PRESENTATION_COLORS.rules;ink.fill();
      // Slice each wall at mid-slab so upper stories cannot obscure the joint.
      ink.beginPath();
      for(const {mesh:{indices,positions:p}} of walls){
        for(let k=0;k<indices.length;k+=3){
          let hits=0;
          for(let edge=0;edge<3;edge++){
            const a=3*indices[k+edge],b=3*indices[k+(edge+1)%3];
            if((p[a+2]>cut)===(p[b+2]>cut))continue;
            const t=(cut-p[a+2])/(p[b+2]-p[a+2]);
            const xx=px(p[a]+t*(p[b]-p[a])),yy=py(p[a+1]+t*(p[b+1]-p[a+1]));
            if(hits++===0)ink.moveTo(xx,yy);else ink.lineTo(xx,yy);
          }
        }
      }
      ink.lineWidth=width*.0025;ink.strokeStyle=PRESENTATION_COLORS.form;ink.stroke();
    });
  }

  function voidFieldRules(view:'orientation'|'generation',x:number,y:number,width:number){
    const report=result.voidFieldReport!;
    const {letters:gold,rules:blue,form:white}=PRESENTATION_COLORS;
    const source=(id:string)=>result.letters.find(l=>l.id===id);
    const scene=()=>{const s=new THREE.Scene();lighting(s);return s;};
    function draw(s:THREE.Scene,left:number,top:number,w:number,h:number,box=new THREE.Box3().setFromObject(s),axis?:THREE.Vector2,plan=false){
      top*=1.32;h*=1.32;
      if(box.isEmpty())return;
      renderer.setSize(Math.round(width*w),Math.round(width*h),false);renderer.setClearColor('#000000',0);
      const camera=fitCamera(box,w,h,options.iso,axis);
      if(plan){const center=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3());camera.up.set(0,1,0);camera.position.copy(center).add(new THREE.Vector3(0,0,span.length()*2));camera.lookAt(center);const half=Math.max(span.y,span.x*h/w,1)*.57;camera.top=half;camera.bottom=-half;camera.left=-half*w/h;camera.right=half*w/h;camera.updateProjectionMatrix();}
      renderer.render(s,camera);ctx!.drawImage(renderer.domElement,x+width*left,y+width*top,w*width,h*width);
    }
    const label=(msg:string,left:number,top:number,size=.024,color:string=white)=>text(msg,x+width*left,y+width*top*1.32,width*(color===blue?.031:size*1.25),color);
    label(view==='orientation'?'ORIENTATION RULES':'GENERATION RULES',0,.045,.036,gold);
    if(view==='orientation'){
      const poses=result.request.source.map((p,i)=>({p,l:result.letters[i]}));
      const outside=poses.filter(({l})=>!report.voids.some(v=>v.source===l.id));
      const groups=[{name:'EXTERIOR · ALL LEVELS',items:outside}];
      groups.push({name:'INTERIOR VOID SOURCES',items:poses.filter(({l})=>report.voids.some(v=>v.source===l.id))});
      const step=.86/groups.length;
      groups.forEach(({name,items},i)=>{
        if(!items.length)return;
        const top=.09+i*step,s=scene();
        items.forEach(({l})=>addMesh(s,l.mesh,gold));draw(s,0,top,.38,step);
        label(name,.40,top+.035,.03,blue);
        const range=(values:number[])=>{const vals=values.map(v=>+v.toFixed(1));const a=Math.min(...vals),b=Math.max(...vals);return a===b?a+'°':a+'° to '+b+'°';};
        label(i?'Group the inner contours in plan.':'Perimeter faces lie nearly level.',.40,top+.095);
        label(i?'Together they define the void field.':'Tilt varies across the levels.',.40,top+.14);
        label('Face tilt: X '+range(items.map(({p})=>p.rx))+'; Y '+range(items.map(({p})=>p.ry)),.40,top+.21);
        label('Plan rotation: '+[...new Set(items.map(({p})=>+p.rz.toFixed(1)))].sort((a,b)=>a-b).join('° / ')+'°',.40,top+.26);
      });
      return;
    }
    const title=(t:string,y:number)=>label(t,0,y,.032,blue);
    const stages=(names:string[],top:number)=>names.forEach((n,i)=>label(n,i*.34,top,.024));
    title('VOID SUBTRACTION',.12);stages(['Source profiles · plan','Letters + extrusions','Void through form'],.17);
    function stroke(s:THREE.Scene,pts:THREE.Vector3[],radius:number,color:string){
      for(let i=1;i<pts.length;i++){
        const d=pts[i].clone().sub(pts[i-1]);if(d.length()<1e-6)continue;
        const g=new THREE.CylinderGeometry(radius,radius,d.length(),8),m=new THREE.MeshBasicMaterial({color,depthTest:false,depthWrite:false});
        const tube=new THREE.Mesh(g,m);tube.position.copy(pts[i-1]).lerp(pts[i],.5);tube.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());tube.renderOrder=25;s.add(tube);resources.push(g,m);
      }
    }
    const vs=[scene(),scene(),scene()];addMesh(vs[2],result.architecture,white,.12);
    for(const v of report.voids){
      const l=source(v.source);if(l){addMesh(vs[0],l.mesh,gold,.73);addMesh(vs[1],l.mesh,gold);}
      const pts=v.closedContour.map(p=>new THREE.Vector3().fromArray(p));
      if(pts.length){pts.push(pts[0]);for(const s of vs.slice(0,2))stroke(s,pts,result.request.preferredFeet*.017,blue);}
      if(v.cutterMesh?.indices.length){addMesh(vs[1],v.cutterMesh,blue,.29);addMesh(vs[2],v.cutterMesh,blue,.83);}
    }
    vs.forEach((s,i)=>draw(s,i*.34,.18,.32,.26,undefined,undefined,i===0));
    label('Inner contours extrude through the occupied levels.',0,.47);
    title('WALL EXTRUSION',.56);stages(['Original sources','Sweep from source face','Wall joint detail'],.61);
    const joint=findFacadeJoint(report.walls??[]);
    if(!joint){label('No intersecting pair verified in the saved wall meshes.',0,.78);return;}
    const detail=new THREE.Scene();
    detail.add(new THREE.AmbientLight(0xffffff,1.2));
    const key=new THREE.DirectionalLight(0xffffff,2.1);
    key.position.copy(joint.normal).multiplyScalar(3);key.position.z+=1;detail.add(key);
    const ws=[scene(),scene(),detail];

    joint.walls.forEach((w,i)=>{
      const l=source(w.source);if(l){addMesh(ws[0],l.mesh,gold);addMesh(ws[1],l.mesh,gold);}
      addMesh(ws[1],w.mesh,i?white:'#C2BBB0',.94);
      addMesh(detail,w.finalMesh!,white);
    });
    {
      const [p,q]=joint.edge;
      stroke(detail,[p.clone().lerp(q,.08),p.clone().lerp(q,.92)],result.request.preferredFeet*.015,blue);
    }
    ws.forEach((s,i)=>draw(s,i*.34,.63,.32,.27,undefined,i===2?joint.axis:undefined));
    label(report.facadeMode==='face-normal'?'Each wall sweeps perpendicular to its source face.':'Each exterior edge sweeps vertically to its support.',0,.94);
    label('Blue line: seam between the two finished wall segments.',0,.985);
  }
  async function panel(view:PlateView,x:number,y:number,width:number){
    boardPanel={x,y,width};
    if(result.request.envelopeVersion==='linear-edge-gallery'&&(view==='orientation'||view==='generation')&&galleryPanel(ctx!,result,view,x,y,width))return;
    await new Promise(resolve=>setTimeout(resolve,0));
    if((view==='orientation'||view==='generation')&&result.voidFieldReport){voidFieldRules(view,x,y,width);return;}
    if((view==='orientation'||view==='generation')&&result.plateReport?.version==='edge-connected'){plateRulesPanel(view,x,y,width);return;}
    if(view==='generation'&&result.plateReport){await insertedPlateDetail(x,y,width);return;}
    if((view==='orientation'||view==='generation')&&result.request.envelopeVersion==='vertical-walls'&&steppedRules(view,x,y,width))return;
    if(view==='generation'&&(result.voidFieldReport||(result.request.envelopeVersion==='vertical-walls'&&info.boundaryReport?.walls?.length))){await wallAndVoidGenerationDetail(x,y,width);return;}
    const gallery=result.request.envelopeVersion==='linear-edge-gallery';
    if(view==='generation'&&!result.roomReport&&!gallery){await generationDetail(x,y,width);return;}
    const scene=new THREE.Scene();
    const room=result.roomReport&&result.components.find(c=>c.id==='suspended-room-and-landing');
    if(room&&view==='orientation'&&result.roomReport){
      text('ORIENTATION RULES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
      const perimeter=result.request.source.filter(p=>p.architecturalRole==='perimeter');
      const levels=Array.from(new Set(perimeter.map(p=>p.levelIndex??0))).sort((a,b)=>a-b);
      function drawOrientationLetters(letters:typeof result.letters,left:number,top:number){
        if(!letters.length)return;
        const scene=new THREE.Scene();
        letters.forEach(letter=>addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters));
        const w=Math.round(width*.27),h=Math.round(width*.20);
        const camera=fitCamera(new THREE.Box3().setFromObject(scene),w,h,options.iso);
        const bounds=new THREE.Box3(),point=new THREE.Vector3();
        scene.traverse(object=>{
          if(!(object instanceof THREE.Mesh))return;
          const positions=object.geometry.getAttribute('position');
          for(let i=0;i<positions.count;i++){
            bounds.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse));
          }
        });
        const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
        const half=Math.max(size.y,size.x*h/w,.01)/1.82;
        camera.left=center.x-half*w/h;camera.right=center.x+half*w/h;
        camera.top=center.y+half;camera.bottom=center.y-half;camera.updateProjectionMatrix();
        lighting(scene);renderer.setSize(w,h,false);renderer.setClearColor('#000000',0);
        renderer.render(scene,camera);ctx!.drawImage(renderer.domElement,left,top,w,h);
      }
      levels.forEach((level,i)=>{
        const left=x+width*.5*(i%2),top=y+width*(.09+Math.floor(i/2)*.23);
        const poses=perimeter.filter(p=>(p.levelIndex??0)===level);
        drawOrientationLetters(result.letters.filter((_,j)=>{
          const pose=result.request.source[j];
          return pose?.architecturalRole==='perimeter'&&(pose.levelIndex??0)===level;
        }),left,top);
        const labelX=left+width*.28;
        text('LEVEL '+(level+1),labelX,top+width*.064,width*.03,PRESENTATION_COLORS.rules);
        const sizes=[...new Set(poses.map(p=>+(p.scale*.92).toFixed(1)))];
        text(poses.length+' perimeter letters',labelX,top+width*.114,width*.025);
        text(sizes.join(' / ')+' ft',labelX,top+width*.153,width*.025);
      });
      const bottom=.115+Math.ceil(levels.length/2)*.23;
      const tiltNote=rules.orientation.find(v=>v.startsWith('Perimeter faces'));
      if(tiltNote)text('•  '+tiltNote,x,y+width*bottom,width*.026);
      const interior=result.letters.filter((_,i)=>result.request.source[i]?.architecturalRole==='interior');
      if(interior.length){
        // Use the same heading-first arrangement as Room and Platforms.
        const headingY=y+width*(bottom+.229),labelX=x+width*.28;
        drawOrientationLetters(interior,x,headingY+width*.0185);
        text('INTERIOR LETTERS',labelX,headingY,width*.03,PRESENTATION_COLORS.rules);
        text('•  The letters stand upright to define',labelX,headingY+width*.053,width*.026);
        text('   the suspended room.',labelX,headingY+width*.09,width*.026);
      }
      return;
    }
    const details=view==='orientation'&&!room;
    const showPlans=view==='form'&&result.plateReport?.version==='edge-connected'&&!!result.plateReport.floors.length;
    const drawingWidth=Math.round(width*(showPlans?profiles['inserted-plate'].formWidth:details?.72:1)),drawingHeight=Math.round(width*(room&&view==='orientation'?.51:details?.64:options.view==='board'?.98:.76));
    const limit=renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number;
    if(Math.max(drawingWidth,drawingHeight)>limit)throw Error('This GPU cannot render this resolution. Choose 2048 pixels.');
    renderer.setSize(drawingWidth,drawingHeight,false);renderer.setClearColor('#000000',0);
    const ambient=new THREE.AmbientLight(0xffffff,.85),key=new THREE.DirectionalLight(0xffffff,1.65);
    key.position.set(40,-60,90);scene.add(ambient,key);
    const fill=new THREE.DirectionalLight(0xffffff,.5);fill.position.set(-30,25,30);scene.add(fill);
    if(room && view==='generation' && result.roomReport){
      const report=result.roomReport;
      const panels=report.perimeter?.fullProfiles?.panels??[];
      const loft=panels.find(p=>p.kind==='loft' && p.lowerSource.startsWith('U'))??panels.find(p=>p.kind==='loft');
      const roof=result.components.find(c=>c.id==='open-top-planks');
      const stacked=!!roof&&!!result.roomShell;
      const notes=[
        ['Exterior walls span between the full outer profiles of letters on successive levels.'],
        ['Upright interior letters define the polygonal room.','The room floor sits '+report.floorZ.toFixed(1)+' ft above the base.','Level 2 platforms extend from the inner letter edges to the room.'],
        [result.request.sourceSnapshot && (result.request.sourceSnapshot as {openTopPlanks?:unknown}).openTopPlanks===true
          ?'The upper planks join around an open center.':'The inner edges of the top letters guide four planks to a shared center joint.',
          'The planks meet the perimeter walls and leave openings above the room.']
      ];
      const drawDetail=(column:number,items:THREE.Scene,label:string)=>{
        if(stacked){
          const board=options.view==='board';
          const top=.095+column*(board?profiles['room-within-volume'].stackedRowPitch:.29),w=Math.round(width*.38),h=Math.round(width*(board?.30:.22));
          const box=new THREE.Box3().setFromObject(items);
          lighting(items);renderer.setSize(w,h,false);
          renderer.render(items,fitCamera(box,w,h,options.iso));
          ctx!.drawImage(renderer.domElement,x,y+width*top,w,h);
          const left=x+width*.405,size=width*(board?.026:.023);
          text(label.toUpperCase(),left,y+width*(top+.04),width*.031,PRESENTATION_COLORS.rules);
          let baseline=y+width*(top+.105);
          for(const note of notes[column]){
            text('•',left,baseline,size);
            let line='';
            for(const word of note.split(' ')){
              const next=line?line+' '+word:word;
              if(line&&ctx!.measureText(next).width>width*.555){
                text(line,left+width*.027,baseline,size);baseline+=size*1.35;line=word;
              }else line=next;
            }
            text(line,left+width*.027,baseline,size);baseline+=size*1.7;
          }
          return;
        }
        const w=Math.round(width*.48),h=Math.round(width*.42);
        const box=new THREE.Box3().setFromObject(items);
        lighting(items);
        renderer.setSize(w,h,false);
        renderer.render(items,fitCamera(box,w,h,options.iso));
        const left=x+column*width*.51;
        ctx!.drawImage(renderer.domElement,left,y+width*.13,w,h);
        text(label,left,y+width*.105,width*.029,PRESENTATION_COLORS.rules);
      };
      const exterior=new THREE.Scene();
      if(loft){
        addMesh(exterior,loft.mesh,PRESENTATION_COLORS.form,.75);
        for(const profile of [loft.lowerProfile,loft.upperProfile]){
          line(exterior,profile.map(([x,y,z])=>new THREE.Vector3(x,y,z)));
        }
        result.letters.filter(l=>l.id===loft.lowerSource||l.id===loft.upperSource).forEach(l=>addMesh(exterior,l.mesh,PRESENTATION_COLORS.letters));
      }else{
        addMesh(exterior,result.architecture,PRESENTATION_COLORS.form,.35);
        result.letters.filter(l=>!report.roomSources.includes(l.id)).forEach(l=>addMesh(exterior,l.mesh,PRESENTATION_COLORS.letters));
      }
      drawDetail(0,exterior,'Wall extrusion');
      const interior=new THREE.Scene();
      addMesh(interior,room.mesh,result.roomShell?PRESENTATION_COLORS.rules:PRESENTATION_COLORS.form,.48);
      const sources=new Set([...report.roomSources,...(report.platforms??[]).map(p=>p.source)]);
      result.letters.filter(l=>sources.has(l.id)).forEach(l=>addMesh(interior,l.mesh,PRESENTATION_COLORS.letters));
      drawDetail(1,interior,'Room and platforms');
      text('GENERATION RULES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
      if(stacked&&roof){
        const roofScene=new THREE.Scene();
        addMesh(roofScene,roof.mesh,PRESENTATION_COLORS.form);
        result.letters.filter(l=>roof.sources?.includes(l.id)).forEach(l=>addMesh(roofScene,l.mesh,PRESENTATION_COLORS.letters,.35));
        drawDetail(2,roofScene,'Roof planks');
      }else rules.terraces.forEach((caption,i)=>text(caption,x,y+width*(.59+i*.055),width*.033));
      return;
    }
    const pier=options.iso==='Pier'&&result.components.find(c=>c.id.startsWith('corner-pier-'));
    let direction:THREE.Vector2|undefined;
    if(pier){
      const p=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(pier.mesh.positions,3)).getCenter(new THREE.Vector3());
      p.sub(bounds.getCenter(new THREE.Vector3()));
      direction=new THREE.Vector2(p.x,p.y).rotateAround(new THREE.Vector2(),-Math.PI*2/3).normalize().multiplyScalar(Math.SQRT2);
    }
    const fullWidth=showPlans?Math.round(width):drawingWidth;
    const camera=fitCamera(bounds,fullWidth,drawingHeight,options.iso,direction);
    if(showPlans)camera.setViewOffset(fullWidth,drawingHeight,(fullWidth-drawingWidth)/2,0,drawingWidth,drawingHeight);
    if(view==='generation'&&gallery){
      addMesh(scene,result.architecture,PRESENTATION_COLORS.form,.35);
      for(const floor of result.components.filter(c=>c.id.startsWith('contour-floor-')))addMesh(scene,floor.mesh,PRESENTATION_COLORS.rules);
    }
    if(view==='generation'&&result.roomReport){
      addMesh(scene,result.roomCutaway??result.architecture,PRESENTATION_COLORS.form,.55);
      result.letters.forEach(letter=>addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters));
    }
    if(view==='form'){
      const form=addMesh(scene,result.architecture,PRESENTATION_COLORS.form);
      for(const cut of result.voidFieldReport?.voids??[]){
        const mesh=cut.cutterMesh;
        if(!mesh?.indices.length)continue;
        let rimZ=-Infinity;
        for(let i=2;i<mesh.positions.length;i+=3)rimZ=Math.max(rimZ,mesh.positions[i]);
        const indices:number[]=[];
        for(let i=0;i<mesh.indices.length;i+=3){
          const triangle=mesh.indices.slice(i,i+3);
          if(triangle.every(vertex=>Math.abs(mesh.positions[3*vertex+2]-rimZ)<.0001))indices.push(...triangle);
        }
        if(indices.length)addMesh(scene,{positions:mesh.positions,indices},PRESENTATION_COLORS.rules,.68);
      }
      if(result.request.envelopeVersion==='vertical-walls'&&result.request.typologyName==='Stepped Amphitheater'){
        const treadElevations=new Set<number>();
        result.letters.forEach((letter,i)=>{
          const pose=result.request.source[i];
          if(!pose||pose.architecturalRole==='interior')return;
          const underside=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(letter.mesh.positions,3)).min.z;
          const contour=result.components.find(c=>c.id==='contour-'+letter.id);
          if(!contour)return;
          const {positions,indices}=contour.mesh;
          for(let j=0;j<indices.length;j+=3){
            const a=3*indices[j],b=3*indices[j+1],c=3*indices[j+2],z=positions[a+2];
            if(z>underside+.001||z<underside-.75-result.request.preferredFeet*.12-.13)continue;
            if(Math.abs(z-positions[b+2])>.0001||Math.abs(z-positions[c+2])>.0001)continue;
            if((positions[b]-positions[a])*(positions[c+1]-positions[a+1])>(positions[b+1]-positions[a+1])*(positions[c]-positions[a]))treadElevations.add(Math.round(z*1000));
          }
        });
        // Color the exposed faces of the finished mesh so openings and cuts remain visible.
        const {positions,indices}=result.architecture,treads:number[]=[];
        for(let i=0;i<indices.length;i+=3){
          const a=3*indices[i],b=3*indices[i+1],c=3*indices[i+2],z=positions[a+2];
          if(!treadElevations.has(Math.round(z*1000))||Math.abs(z-positions[b+2])>.0001||Math.abs(z-positions[c+2])>.0001)continue;
          if((positions[b]-positions[a])*(positions[c+1]-positions[a+1])>(positions[b+1]-positions[a+1])*(positions[c]-positions[a]))treads.push(indices[i],indices[i+1],indices[i+2]);
        }
        if(treads.length){
          const surface=addMesh(scene,{positions,indices:treads},PRESENTATION_COLORS.rules);
          surface.material.polygonOffset=true;surface.material.polygonOffsetFactor=-1;surface.material.polygonOffsetUnits=-1;
          surface.receiveShadow=true;
        }
      }
      if(result.roomShell){
        const shell=addMesh(scene,result.roomShell,PRESENTATION_COLORS.rules);
        shell.material.polygonOffset=true;shell.material.polygonOffsetFactor=-1;shell.material.polygonOffsetUnits=-1;
        shell.receiveShadow=true;
      }
      if(showPlans){
        const floors=new Set(result.plateReport!.floors.map(f=>f.id));
        for(const component of result.components.filter(c=>floors.has(c.id))){
          const plate=addMesh(scene,component.mesh,PRESENTATION_COLORS.rules);
          plate.material.polygonOffset=true;
          plate.material.polygonOffsetFactor=-1;
          plate.material.polygonOffsetUnits=-1;
          plate.receiveShadow=true;
        }
      }
      if(gallery || room || result.voidFieldReport || result.plateReport || result.request.envelopeVersion==='vertical-walls'){
        const center=bounds.getCenter(new THREE.Vector3());
        const radius=bounds.getSize(new THREE.Vector3()).length()/2;
        const east=direction?.x??(options.iso.includes('E')?1:-1);
        const north=direction?.y??(options.iso.includes('N')?1:-1);
        ambient.intensity=.52;
        fill.intensity=.22;
        key.intensity=2.3;
        if(gallery){
          ambient.intensity=.68;fill.intensity=.38;key.intensity=1.85;
          key.shadow.intensity=.65;
          shadeGalleryInterior(form,result);
        }
        key.position.copy(center).addScaledVector(new THREE.Vector3(east*.35,north,1.2).normalize(),radius*3);
        key.target.position.copy(center);
        scene.add(key.target);
        const shadowCamera=key.shadow.camera;
        Object.assign(shadowCamera,{left:-radius,right:radius,top:radius,bottom:-radius,near:radius,far:radius*5});
        shadowCamera.updateProjectionMatrix();
        key.shadow.mapSize.set(2048,2048);
        key.shadow.normalBias=radius*.0006;
        key.shadow.bias=-.00015;
        renderer.shadowMap.enabled=true;
        key.castShadow=form.castShadow=form.receiveShadow=true;
      }
    }
    if(gallery&&view==='form'){
      const response=await fetch('/api/amphitheater/gallery-clearance?id='+encodeURIComponent(result.id));
      if(!response.ok)throw Error('Unable to calculate gallery terrace clearances.');
      for(const mesh of await response.json() as ProofMesh[])addMesh(scene,mesh,PRESENTATION_COLORS.rules);
      const stations=(result.galleryReport as {stations?:{edge:number[][];top:number}[]}|undefined)?.stations??[];
      // Give the edge overlay a consistent weight at print resolution.
      const ink=new THREE.MeshBasicMaterial({color:PRESENTATION_COLORS.letters});
      resources.push(ink);
      for(const station of stations){
        const [a,b]=station.edge.map(([x,y])=>new THREE.Vector3(x,y,station.top+.018));
        const d=b.clone().sub(a);if(d.length()<.01)continue;
        const stroke=new THREE.CylinderGeometry(.055,.055,d.length(),6);
        const edge=new THREE.Mesh(stroke,ink);edge.position.copy(a).lerp(b,.5);
        edge.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());resources.push(stroke);scene.add(edge);
      }
    }
    if(view==='letters')addMesh(scene,result.architecture,PRESENTATION_COLORS.form,shared.material.sourceContextOpacity);
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
    if(key.castShadow){renderer.shadowMap.enabled=false;key.shadow.dispose();}
    text(PLATE_LABELS[view].toUpperCase(),x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
    const imageTop=gallery&&view==='form'&&options.view==='board'?profiles['linear-edge-gallery'].formImageTop:.08;
    ctx!.drawImage(renderer.domElement,x,y+width*imageTop,drawingWidth,drawingHeight);
    if(showPlans)platePlans(x,y,width);
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
      form:showPlans?['Blue plates     White wall and pier outlines']:['Validated architectural mesh · '+result.sourceCount+' source letters'],
      orientation:result.request.envelopeVersion==='inserted-plate'?['Horizontal L/U sources · upright V boundary sources','Blue arcs show actual saved source rotations']:result.request.envelopeVersion==='void-field'?['Horizontal interior letters · global Z plan rotation','Blue contours define vertical source-derived voids']:result.request.source.some(p=>p.lift)?['Lower / top terraces · middle interior uprights',
        'Blue arcs show actual X tilt and Z rotation']:
        ['Blue arcs show actual X tilt and Z rotation'],
      generation:gallery?rules.terraces:result.roomReport?['Source letters overlaid on the saved room geometry',result.roomCutaway?'Cutaway exposes the room within the perimeter walls':'Full enclosure']:result.request.envelopeVersion==='inserted-plate'?['L-derived plates intersect U edges and upright V boundaries','Plate elevations and connecting strips follow source relationships']:selectedVoids.some(v=>v.cutterMesh?.indices.length)?
        ['Gold letter contours guide terrace setbacks and vertical exterior walls',
          'Blue inner contours sweep horizontally to carve architectural openings']:
        ['This saved study has no recorded cutter meshes.','Regenerate architecture to create source correspondence data.']
    };
    if(room&&view==='orientation'){
      rules.orientation.forEach((caption,i)=>text('•  '+caption,x,y+width*(.62+i*.061),width*.029));
    }else if(view==='orientation'){
      rules.orientation.forEach((caption,i)=>text(caption,x,y+width*(.825+i*.043),room?width*.032:width*.024));
    }else if(options.view!=='board'||(view!=='letters'&&view!=='form'))captions[view].forEach((caption,i)=>text(caption,x,y+width*((result.voidFieldReport?.98:.905)+i*.032),width*.026));
    if(result.voidFieldReport?.voids.length&&view==='form'&&options.view==='board')text('Blue marks the atrium openings.',x,y+width*.985,width*.024);
    if(result.request.typologyName==='Stepped Amphitheater'&&result.request.envelopeVersion==='vertical-walls'&&view==='form'&&options.view==='board')text('Blue marks the level surfaces of the stepped terraces.',x,y+width*.985,width*.024);
    if(result.roomShell&&view==='form'&&options.view==='board')text('Blue indicates the suspended room within the volume.',x,y+width*.985,width*.024);
    if(gallery&&view==='form')text('Blue fill indicates linear edge gathering locations.',x,y+width*1.005,width*.024);
    scene.clear();
  }
  try{
    if(options.view==='board'){
      const margin=canvas.width*shared.layout.margin,gap=canvas.width*shared.layout.columnGap,width=(canvas.width-2*margin-gap)/2;
      text(typologyTitle.toUpperCase(),margin,canvas.width*shared.layout.titleBaseline,canvas.width*shared.layout.titleSize,PRESENTATION_COLORS.form);
      ctx.strokeStyle=PRESENTATION_COLORS.form;ctx.lineWidth=canvas.width*shared.layout.separatorWeight;
      ctx.beginPath();ctx.moveTo(margin,canvas.width*shared.layout.separatorY);ctx.lineTo(canvas.width-margin,canvas.width*shared.layout.separatorY);ctx.stroke();
      const contentTop=canvas.width*shared.layout.contentTop;
      for(const [i,view] of views.entries()){
        const y=contentTop+Math.floor(i/2)*width*shared.layout.rowPitch;
        await panel(view,margin+(i%2)*(width+gap),y,width);
      }
      if(result.plateReport?.version==='edge-connected'){
        const svg=plateJunctionSvg(result.plateReport);
        if(svg){
          const detail=new Image();
          detail.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
          await detail.decode();
          ctx.drawImage(detail,margin+width+gap,contentTop+width*(1.7448+2*plateBoardRowGapIncrease),width,width*.425);
        }
      }
      if(result.request.envelopeVersion==='linear-edge-gallery')galleryJoint(ctx,result,margin+width+gap,contentTop+width*1.98,width*2,(ids,walls,dx,dy)=>{
        const detail=new THREE.Scene();lighting(detail);
        result.letters.filter(l=>ids.includes(l.id)).forEach(l=>addMesh(detail,l.mesh,PRESENTATION_COLORS.letters));
        result.components.filter(c=>walls.includes(c.id)).forEach(c=>addMesh(detail,c.mesh,PRESENTATION_COLORS.form));
        const box=new THREE.Box3().setFromObject(detail),w=342,h=422;
        renderer.setSize(w*2,h*2,false);renderer.setClearColor('#000000',0);
        const axis=new THREE.Vector2(dx+.8*dy,dy-.8*dx).normalize().multiplyScalar(1.5);
        renderer.render(detail,fitCamera(box,w,h,options.iso,axis));ctx.drawImage(renderer.domElement,0,65,w,h);
      });

    }else {
      text(studyTitle.toUpperCase(),canvas.width*.04,canvas.width*.06,canvas.width*.035,PRESENTATION_COLORS.form);
      if(options.view==='visibility')await visibilityPanel(canvas.width*.04,canvas.width*.09,canvas.width*.89);else await panel(options.view,canvas.width*.04,canvas.width*.09,canvas.width*.89);
    }
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG encoding failed.')),'image/png'));
    return await pngWithDpi(blob,shared.dpi);
  }finally{
    resources.forEach(resource=>resource.dispose());
    renderer.dispose();renderer.forceContextLoss();
    canvas.width=canvas.height=1;
  }
}
