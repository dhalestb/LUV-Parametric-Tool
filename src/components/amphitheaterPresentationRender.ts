import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {AmphitheaterResult,ProofMesh} from './amphitheaterInteractiveTypes';
import {meshGeometry,PLATE_LABELS,PRESENTATION_COLORS,pngWithDpi,workspacePresentationLessons,workspaceRuleStageTitle,type PlateView,type ExportView} from './amphitheaterPresentationExport';

export const BOARD_WIDTH=4096;
export const BOARD_HEIGHT=5156;

export type PresentationOptions={view:ExportView;size:number;transparent:boolean;iso:'SE'|'SW'|'NE'|'NW'};
const views:PlateView[]=['letters','form','orientation','generation'];

function fitCamera(box:THREE.Box3,width:number,height:number,iso:PresentationOptions['iso'],azimuth?:THREE.Vector2){
  const center=box.getCenter(new THREE.Vector3()),span=Math.max(1,box.getSize(new THREE.Vector3()).length());
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,span*12);
  camera.up.set(0,0,1);
  camera.position.copy(center).add(new THREE.Vector3(azimuth?azimuth.x*span:(iso.includes('E')?span:-span),azimuth?azimuth.y*span:(iso.includes('N')?span:-span),span*.85));
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
  function addMesh(scene:THREE.Scene,mesh:ProofMesh,color:string,opacity=1,clippingPlanes:THREE.Plane[]=[]){
    const original=meshGeometry(mesh),geometry=toCreasedNormals(original,Math.PI/6);
    if(geometry!==original)original.dispose();
    const material=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,
      transparent:opacity<1,opacity,depthWrite:opacity===1,clippingPlanes});
    resources.push(geometry,material);
    const object=new THREE.Mesh(geometry,material);scene.add(object);return object;
  }
  function text(value:string,x:number,y:number,size:number,color:string=PRESENTATION_COLORS.form){
    ctx!.fillStyle=color;ctx!.font=size+'px Arial, sans-serif';ctx!.fillText(value,x,y);
  }
  function lighting(scene:THREE.Scene){
    scene.add(new THREE.AmbientLight(0xffffff,.85));
    const light=new THREE.DirectionalLight(0xffffff,1.65);light.position.set(40,-60,90);scene.add(light);
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
  function panel(view:PlateView,x:number,y:number,width:number){
    if(view==='orientation'||view==='generation'){workspaceRulesPanel(view,x,y,width);return;}
    const scene=new THREE.Scene();lighting(scene);
    if(view==='letters') {
      for(const letter of result.letters)addMesh(scene,letter.mesh,PRESENTATION_COLORS.letters);
    } else {
      addMesh(scene,result.architecture,PRESENTATION_COLORS.form);
      if(result.perimeterWalls?.indices.length)addMesh(scene,result.perimeterWalls,PRESENTATION_COLORS.form);
    }
    const height=width*.85;
    text(PLATE_LABELS[view].toUpperCase(),x,y+width*.045,width*.036);
    const bounds=new THREE.Box3().setFromObject(scene);
    if(!bounds.isEmpty()){
      renderer.setSize(Math.round(width),Math.round(height),false);renderer.setClearColor('#000000',0);
      renderer.render(scene,fitCamera(bounds,width,height,options.iso));
      ctx!.drawImage(renderer.domElement,x,y+width*.085,width,height);
    }
    scene.clear();
  }

  try {
    const margin=canvas.width*.04;
    text((result.request.typologyName??result.request.workspaceTypology).toUpperCase(),margin,canvas.width*.075,canvas.width*.045);
    if(options.view==='board'){
      const gap=canvas.width*.03,width=(canvas.width-2*margin-gap)/2;
      const rowHeight=(canvas.height-canvas.width*.12-margin*1.4)/2;
      views.forEach((view,index)=>panel(view,margin+(index%2)*(width+gap),canvas.width*.12+Math.floor(index/2)*rowHeight+(rowHeight-width)/2,width));
      const field=result.request.field;
      text(field.width+' × '+field.depth+' × '+field.height+' ft · '+result.sourceCount+' letters',margin,canvas.height-margin*.5,canvas.width*.018);
    } else panel(options.view,margin,canvas.width*.105,canvas.width*.89);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG encoding failed.')),'image/png'));
    return await pngWithDpi(blob);
  } finally {
    resources.forEach(resource=>resource.dispose());renderer.dispose();renderer.forceContextLoss();
    canvas.width=canvas.height=1;
  }
}
