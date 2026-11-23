import {findFacadeJoint} from './voidFieldBoardJoint';
import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {AmphitheaterResult,ProofMesh} from './amphitheaterInteractiveTypes';
import {meshGeometry,PLATE_LABELS,PRESENTATION_COLORS,pngWithDpi,presentationRules,workspacePresentationLessons,workspaceRuleStageTitle,type PlateView,type ExportView} from './amphitheaterPresentationExport';

export const BOARD_WIDTH=4096;
export const BOARD_HEIGHT=5156;

export type PresentationOptions={view:ExportView;size:number;transparent:boolean;iso:'SE'|'SW'|'NE'|'NW'|'Pier';ruleSource:string};
type VoidRecord={source:string;axis:number[];sourceContour?:number[][];closedContour?:number[][];closure?:{addedEdges:number[][]};cutterMesh?:ProofMesh;removedVolume?:number;removedMesh?:ProofMesh;alcove?:boolean};
type PresentationResult=AmphitheaterResult&{boundaryReport?:{voids:VoidRecord[];walls?:NonNullable<AmphitheaterResult['voidFieldReport']>['walls']}};
const views:PlateView[]=['letters','form','orientation','generation'];

function fitCamera(box:THREE.Box3,width:number,height:number,iso:PresentationOptions['iso'],azimuth?:THREE.Vector2){
  const center=box.getCenter(new THREE.Vector3()),span=Math.max(1,box.getSize(new THREE.Vector3()).length());
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,span*12);
  camera.up.set(0,0,1);
  camera.position.copy(center).add(new THREE.Vector3(azimuth?azimuth.x*span:(iso==='Pier'||iso.includes('E')?span:-span),azimuth?azimuth.y*span:(iso.includes('N')?span:-span),span*.85));
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
  canvas.width=options.view==='board'?BOARD_WIDTH:options.size;
  canvas.height=options.view==='board'?BOARD_HEIGHT:options.size;
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
  function wrapLines(value:string,maxWidth:number,size:number){
    ctx!.font=size+'px Arial, sans-serif';
    const words=value.split(/\s+/).filter(Boolean);
    const lines:string[]=[];
    let line='';
    for(const word of words){
      const next=line?`${line} ${word}`:word;
      if(line&&ctx!.measureText(next).width>maxWidth){lines.push(line);line=word;}
      else line=next;
    }
    if(line)lines.push(line);
    return lines;
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
      row(.08,.27,'WALL EXTRUSION',[{mesh:wall.mesh,color:white},{mesh:wallLetter?.mesh,color:gold}],
        ['The outer edge extrudes down', 'to form a vertical wall. Its top', 'follows the letter; the platform', 'uses its outline and stays level.']);
      row(.38,.26,'VOIDS AND RECESSES',[{mesh:cut?.cutterMesh,color:blue,opacity:.7},{mesh:cutLetter?.mesh,color:gold}],
        cut?['Extrude the inner contour into', 'the form for a recessed alcove.', 'Extend it through the far side', 'for a through-opening.']:['No subtraction in this study.']);
      row(.68,.28,'TERRACING',[{mesh:band?.mesh,color:white}],
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
    const floor=result.plateReport!.floors.find(f=>result.components.some(c=>c.id===f.id));
    const source=(id?:string)=>result.letters.find(l=>l.id===id);
    const wallLetter=source(wall?.id.slice('boundary-'.length)),cap=source(pier?.id.slice('corner-pier-'.length));
    const slab=result.components.find(c=>c.id===floor?.id);
    const {letters:gold,rules:blue}=PRESENTATION_COLORS;
    text(view==='orientation'?'ORIENTATION RULES':'GENERATION RULES',x,y+width*.045,width*.036,gold);
    function row(top:number,h:number,title:string,caption:string[],letter?:ProofMesh,part?:ProofMesh){
      const scene=new THREE.Scene(),box=new THREE.Box3();
      if(letter)box.expandByObject(addMesh(scene,letter,gold));
      if(part){
        const local=box.clone().expandByScalar(result.request.preferredFeet*.42);
        const planes=local.isEmpty()?[]:([0,1,2] as const).flatMap(i=>[1,-1].map(sign=>
          new THREE.Plane(new THREE.Vector3().setComponent(i,sign),-sign*(sign===1?local.min:local.max).getComponent(i))));
        const object=addMesh(scene,part,blue,.8,planes);
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
      row(.12,.34,'EXTERIOR LETTERS',['L and V stand upright; U turns','onto its side. The faces may lean','slightly. Plan rotation aims each','outer edge along the perimeter.'],wallLetter?.mesh);
      row(.55,.34,'HORIZONTAL CORNER L',cap?['The L lies flat at the top of the','corner pier. Its two arms set the','column footprint.']:['No corner-column source is','present in this study.'],cap?.mesh);
    }else{
      row(.09,.27,'WALL EXTRUSION',['Sweep the exterior edge normal','to the letter face. Trim at the','adjacent perimeter wall.'],wallLetter?.mesh,wall?.mesh);
      row(.39,.27,'HORIZONTAL PLATE',['Inner L and U edges guide one','level plank. Extend or trim its','ends to the inside wall faces.'],source(floor?.source)?.mesh,slab?.mesh);
      row(.69,.27,'COLUMN EXTRUSION',cap?['Extrude the full corner L footprint','vertically down to the base. The','perimeter walls join the shaft.']:['No column was generated.'],cap?.mesh,pier?.mesh);
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
    const cellW=width*.54/cols,cellH=width*.70/rows;
    const extent=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=Math.min(cellW*.91/extent.x,(cellH-width*.052)*.91/extent.y);
    const walls=result.components.filter(c=>c.id.startsWith('boundary-')||c.id.startsWith('corner-pier-'));
    elevations.forEach((top,i)=>{
      const left=x+width*.46+i%cols*cellW,rowY=y+width*.12+Math.floor(i/cols)*cellH;
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
      ink.fillStyle=PRESENTATION_COLORS.form;ink.fill();
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
      ink.lineWidth=width*.0025;ink.strokeStyle=PRESENTATION_COLORS.rules;ink.stroke();
    });
  }

  function voidFieldRules(view:'orientation'|'generation',x:number,y:number,width:number){
    const report=result.voidFieldReport!;
    const {letters:gold,rules:blue,form:white}=PRESENTATION_COLORS;
    const source=(id:string)=>result.letters.find(l=>l.id===id);
    const scene=()=>{const s=new THREE.Scene();lighting(s);return s;};
    function draw(s:THREE.Scene,left:number,top:number,w:number,h:number,box=new THREE.Box3().setFromObject(s),axis?:THREE.Vector2,plan=false){
      top*=1.12;h*=1.12;
      if(box.isEmpty())return;
      renderer.setSize(Math.round(width*w),Math.round(width*h),false);renderer.setClearColor('#000000',0);
      const camera=fitCamera(box,w,h,options.iso,axis);
      if(plan){const center=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3());camera.up.set(0,1,0);camera.position.copy(center).add(new THREE.Vector3(0,0,span.length()*2));camera.lookAt(center);const half=Math.max(span.y,span.x*h/w,1)*.57;camera.top=half;camera.bottom=-half;camera.left=-half*w/h;camera.right=half*w/h;camera.updateProjectionMatrix();}
      renderer.render(s,camera);ctx!.drawImage(renderer.domElement,x+width*left,y+width*top,w*width,h*width);
    }
    const label=(msg:string,left:number,top:number,size=.024,color:string=white)=>text(msg,x+width*left,y+width*top*1.12,width*size*1.1,color);
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
      label('Measured at the saved poses. Z rotation turns the letter in plan.',0,.99,.025);return;
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
  function workspaceRulesPanel(view:'orientation'|'generation',x:number,y:number,width:number){
    // Match Stepped Amphitheater: left graphic, right short teaching lines. No audit-id dumps.
    const {letters:gold,rules:blue,form:white}=PRESENTATION_COLORS;
    const lessons=workspacePresentationLessons(result);
    const rows=view==='orientation'?lessons.orientation:lessons.generation;
    const plan=result.request.workspacePlan;
    const zLift=result.request.field.height/2;
    text(workspaceRuleStageTitle(result,view),x,y+width*.045,width*.036,gold);

    const letterMeshes=(prefer:'L'|'V'|'any')=>{
      const picks=result.letters.filter((_,i)=>{
        const ch=result.request.source[i]?.letter;
        if(prefer==='any')return true;
        return ch===prefer;
      });
      return (picks.length?picks:result.letters).map(letter=>letter.mesh);
    };
    const typology=result.request.workspaceTypology;
    const detailedRules=typology==='open-hall-workspace'||typology==='flat-deep-plan-plate';
    const guideMeshes=(role:'floor'|'mezzanine')=>{
      if(typology==='open-hall-workspace'){
        const matches=result.letters.filter((_,i)=>result.request.source[i]?.openHallRole===role);
        if(matches.length)return matches.map(letter=>letter.mesh);
      }
      if(typology==='flat-deep-plan-plate'){
        const start=role==='floor'?0:4;
        return result.letters.slice(start,start+4).map(letter=>letter.mesh);
      }
      return letterMeshes(role==='floor'?'L':'V');
    };
    const addPlate=(scene:THREE.Scene,role:string|string[],color:string,opacity=1)=>{
      if(!plan)return;
      const roles=new Set(Array.isArray(role)?role:[role]);
      for(const plate of plan.plates.filter(p=>roles.has(p.role))){
        if(plate.polygon.length<3)continue;
        const shape=new THREE.Shape();
        shape.moveTo(plate.polygon[0][0],plate.polygon[0][1]);
        for(let i=1;i<plate.polygon.length;i++)shape.lineTo(plate.polygon[i][0],plate.polygon[i][1]);
        shape.closePath();
        const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(plate.thickness,.05),bevelEnabled:false});
        const material=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity===1});
        resources.push(geometry,material);
        const mesh=new THREE.Mesh(geometry,material);
        mesh.position.z=zLift+plate.zTop-plate.thickness;
        scene.add(mesh);
      }
    };
    type Layer={mesh?:ProofMesh;color:string;opacity?:number;planRoles?:string[]};
    function row(top:number,height:number,title:string,layers:Layer[],lines:string[]){
      const scene=new THREE.Scene();lighting(scene);
      const box=new THREE.Box3();
      for(const layer of layers){
        if(layer.planRoles?.length){
          addPlate(scene,layer.planRoles,layer.color,layer.opacity??1);
          continue;
        }
        if(!layer.mesh?.indices.length)continue;
        const object=addMesh(scene,layer.mesh,layer.color,layer.opacity);
        box.expandByObject(object);
      }
      box.union(new THREE.Box3().setFromObject(scene));
      const w=width*.36,h=width*height;
      if(!box.isEmpty()){
        renderer.setSize(Math.round(w),Math.round(h),false);renderer.setClearColor('#000000',0);
        renderer.render(scene,fitCamera(box,w,h,options.iso));ctx!.drawImage(renderer.domElement,x,y+width*top,w,h);
      }
      scene.clear();
      const left=x+width*.38,base=y+width*(top+.045);
      text(title,left,base,width*.03,blue);
      lines.forEach((value,i)=>text(value,left,base+width*(.052+i*.044),width*.026));
    }

    if(view==='orientation'){
      // Stepped Amphitheater shows one letter large per row — not the whole plan scatter.
      const ground=guideMeshes('floor')[0];
      const mezz=guideMeshes('mezzanine')[0]??letterMeshes('any').find(mesh=>mesh!==ground)??letterMeshes('any')[0];
      row(.10,.36,(detailedRules?rows[0]?.title:undefined)??'GROUND LETTERS',ground?[{mesh:ground,color:gold}]:[],rows[0]?.lines??[]);
      row(.54,.36,(detailedRules?rows[1]?.title:undefined)??'MEZZANINE LETTERS',mezz?[
        {mesh:mezz,color:gold},
        {mesh:result.architecture,color:white,opacity:.12},
      ]:[],rows[1]?.lines??[]);
      return;
    }

    // Generation: same 3-row operation layout as Stepped Amphitheater wall / void / terrace.
    const groundGuides=guideMeshes('floor').slice(0,2).map(mesh=>({mesh,color:gold}));
    const mezzGuides=guideMeshes('mezzanine').slice(0,2).map(mesh=>({mesh,color:gold}));
    const groundLayers:Layer[]=plan
      ?[{planRoles:['ground','working'],color:white},...groundGuides]
      :[{mesh:result.architecture,color:white,opacity:.55},...groundGuides];
    const mezzLayers:Layer[]=plan
      ?[{planRoles:['mezzanine','terrace'],color:blue,opacity:.9},...mezzGuides]
      :[{mesh:result.architecture,color:blue,opacity:.45},...mezzGuides];
    const supportLayers:Layer[]=plan
      ?[{planRoles:['support','roof'],color:white},{mesh:result.architecture,color:white,opacity:.2}]
      :[{mesh:result.architecture,color:white,opacity:.85}];
    row(.08,.27,(detailedRules?rows[0]?.title:undefined)??'GROUND PLATE',groundLayers,rows[0]?.lines??[]);
    row(.38,.26,(detailedRules?rows[1]?.title:undefined)??'MEZZANINE WRAP',mezzLayers,rows[1]?.lines??[]);
    row(.68,.28,(detailedRules?rows[2]?.title:undefined)??'SUPPORTS AND ROOF',supportLayers,rows[2]?.lines??[]);
  }
  async function panel(view:PlateView,x:number,y:number,width:number){
    await new Promise(resolve=>setTimeout(resolve,0));
    if((view==='orientation'||view==='generation')&&(result.letterArrangementReport||result.architecturalGenerationReport||result.generator==='workspace-ten-rule')){workspaceRulesPanel(view,x,y,width);return;}
    if((view==='orientation'||view==='generation')&&result.voidFieldReport){voidFieldRules(view,x,y,width);return;}
    if((view==='orientation'||view==='generation')&&result.plateReport?.version==='edge-connected'){plateRulesPanel(view,x,y,width);return;}
    if(view==='generation'&&result.plateReport){await insertedPlateDetail(x,y,width);return;}
    if((view==='orientation'||view==='generation')&&result.request.envelopeVersion==='vertical-walls'&&steppedRules(view,x,y,width))return;
    if(view==='generation'&&(result.voidFieldReport||(result.request.envelopeVersion==='vertical-walls'&&info.boundaryReport?.walls?.length))){await wallAndVoidGenerationDetail(x,y,width);return;}
    if(view==='generation'&&!result.roomReport){await generationDetail(x,y,width);return;}
    const scene=new THREE.Scene();
    const room=result.roomReport&&result.components.find(c=>c.id==='suspended-room-and-landing');
    const details=view==='orientation'&&!room;
    const showPlans=view==='form'&&result.plateReport?.version==='edge-connected'&&!!result.plateReport.floors.length;
    const drawingWidth=Math.round(width*(showPlans?.45:details?.72:1)),drawingHeight=Math.round(width*(room&&view==='orientation'?.51:details?.64:.76));
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
      const drawDetail=(column:number,items:THREE.Scene,label:string)=>{
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
      drawDetail(0,exterior,loft?'Wall · '+loft.lowerSource+' to '+loft.upperSource:'Exterior walls');
      const interior=new THREE.Scene();
      addMesh(interior,room.mesh,PRESENTATION_COLORS.form,.55);
      const sources=new Set([...report.roomSources,...(report.platforms??[]).map(p=>p.source)]);
      result.letters.filter(l=>sources.has(l.id)).forEach(l=>addMesh(interior,l.mesh,PRESENTATION_COLORS.letters));
      drawDetail(1,interior,'Room and platforms');
      text('GENERATION RULES',x,y+width*.045,width*.036,PRESENTATION_COLORS.letters);
      rules.terraces.forEach((caption,i)=>text(caption,x,y+width*(.59+i*.055),width*.033));
      return;
    }
    const pier=options.iso==='Pier'&&result.components.find(c=>c.id.startsWith('corner-pier-'));
    let direction:THREE.Vector2|undefined;
    if(pier){
      const p=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(pier.mesh.positions,3)).getCenter(new THREE.Vector3());
      p.sub(bounds.getCenter(new THREE.Vector3()));
      direction=new THREE.Vector2(p.x,p.y).rotateAround(new THREE.Vector2(),-Math.PI*2/3).normalize().multiplyScalar(Math.SQRT2);
    }
    // Original Letters: frame the letter set, not the full architectural envelope (which made letters look tiny).
    const letterBounds=new THREE.Box3();
    for(const letter of result.letters){
      letterBounds.union(new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(letter.mesh.positions,3)));
    }
    const frameBounds=view==='letters'&&!letterBounds.isEmpty()?letterBounds:bounds;
    const camera=fitCamera(frameBounds,drawingWidth,drawingHeight,options.iso,direction);
    if(view==='generation'&&result.roomReport){
      addMesh(scene,result.roomCutaway??result.architecture,PRESENTATION_COLORS.form,.55);
      result.letters.forEach(letter=>addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters));
    }
    if(view==='form'){
      const form=addMesh(scene,result.architecture,PRESENTATION_COLORS.form);
      if(room || result.voidFieldReport || result.plateReport || result.request.envelopeVersion==='vertical-walls'){
        const center=bounds.getCenter(new THREE.Vector3());
        const radius=bounds.getSize(new THREE.Vector3()).length()/2;
        const east=direction?.x??(options.iso.includes('E')?1:-1);
        const north=direction?.y??(options.iso.includes('N')?1:-1);
        ambient.intensity=.52;
        fill.intensity=.22;
        key.intensity=2.3;
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
    ctx!.drawImage(renderer.domElement,x,y+width*.08,drawingWidth,drawingHeight);
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
      form:showPlans?['White: horizontal plates     Blue: wall and pier outlines']:['Validated architectural mesh · '+result.sourceCount+' source letters'],
      orientation:result.request.envelopeVersion==='inserted-plate'?['Horizontal L/U sources · upright V boundary sources','Blue arcs show actual saved source rotations']:result.request.envelopeVersion==='void-field'?['Horizontal interior letters · global Z plan rotation','Blue contours define vertical source-derived voids']:result.request.source.some(p=>p.lift)?['Lower / top terraces · middle interior uprights',
        'Blue arcs show actual X tilt and Z rotation']:
        ['Blue arcs show actual X tilt and Z rotation'],
      generation:result.roomReport?['Source letters overlaid on the saved room geometry',result.roomCutaway?'Cutaway exposes the room within the perimeter walls':'Full enclosure']:result.request.envelopeVersion==='inserted-plate'?['L-derived plates intersect U edges and upright V boundaries','Plate elevations and connecting strips follow source relationships']:selectedVoids.some(v=>v.cutterMesh?.indices.length)?
        ['Gold letter contours guide terrace setbacks and vertical exterior walls',
          'Blue inner contours sweep horizontally to carve architectural openings']:
        ['This saved study has no recorded cutter meshes.','Regenerate architecture to create source correspondence data.']
    };
    if(room&&view==='orientation'){
      rules.orientation.forEach((caption,i)=>text(caption,x,y+width*(.62+i*.061),width*.033));
    }else if(view==='orientation'){
      rules.orientation.forEach((caption,i)=>text(caption,x,y+width*(.825+i*.043),room?width*.032:width*.024));
    }else captions[view].forEach((caption,i)=>text(caption,x,y+width*(.905+i*.032),width*.026));
    scene.clear();
  }
  try{
    if(options.view==='board'){
      const margin=canvas.width*.04,gap=canvas.width*.03,width=(canvas.width-2*margin-gap)/2;
      text((result.request.typologyName??'Stepped Amphitheater').toUpperCase(),margin,canvas.width*.075,canvas.width*.045,PRESENTATION_COLORS.form);
      ctx.strokeStyle=PRESENTATION_COLORS.form;ctx.lineWidth=canvas.width*.0007;
      ctx.beginPath();ctx.moveTo(margin,canvas.width*.105);ctx.lineTo(canvas.width-margin,canvas.width*.105);ctx.stroke();
      const contentTop=canvas.width*.12,contentBottom=canvas.height-margin*1.4;
      const rowHeight=(contentBottom-contentTop)/2;
      for(const [i,view] of views.entries()){
        const y=contentTop+Math.floor(i/2)*rowHeight+(result.voidFieldReport?0:(rowHeight-width)/2);
        await panel(view,margin+(i%2)*(width+gap),y,width);
      }
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
