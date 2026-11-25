import * as THREE from 'three';
import {drawingCamera,formFinish,geometryFor,meshBox,stepDownDirection,studioLights,type DrawingView,type FormMesh} from './architectureViews';

export const sheetWidth=4323, sheetHeight=847;
const views:DrawingView[]=['Perspective','Plan','Side'];

export async function renderPresentation(meshes:FormMesh[],labels:string[]):Promise<Blob>{
  if(!meshes.length||meshes.some(m=>!m.positions.length||!m.indices.length))throw Error('A finished architecture mesh is required for each view.');
  const sheet=document.createElement('canvas');
  sheet.width=sheetWidth;sheet.height=sheetHeight;
  const ctx=sheet.getContext('2d');
  if(!ctx)throw Error('The browser could not create the presentation image.');
  const width=sheetWidth/3, top=76, height=sheetHeight-top-22;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  const scene=new THREE.Scene(),box=new THREE.Box3(),geometries:THREE.BufferGeometry[]=[];
  const material=new THREE.MeshStandardMaterial(formFinish);
  const forms:THREE.Mesh[]=[];
  try{
    renderer.setSize(width,height,false);
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    scene.background=new THREE.Color('#080f18');
    for(const mesh of meshes){
      const geometry=geometryFor(mesh);geometries.push(geometry);
      const form=new THREE.Mesh(geometry,material);form.castShadow=true;form.receiveShadow=true;
      forms.push(form);scene.add(form);box.union(meshBox(mesh));
    }
    const title=labels.join(' + ');
    const sides=meshes.map(stepDownDirection);
    ctx.fillStyle='#080f18';ctx.fillRect(0,0,sheetWidth,sheetHeight);
    for(const [i,view] of views.entries()){
      const split=view==='Side'&&forms.length>1;
      const count=split?forms.length:1;
      const columns=split?Math.ceil(count/3):1, rows=Math.ceil(count/columns);
      const cellWidth=Math.floor(width/columns), cellHeight=Math.floor(height/rows);
      const labelHeight=split?32:0, drawHeight=cellHeight-labelHeight;
      const aspect=cellWidth/drawHeight;
      const cameras=Array.from({length:count},(_,j)=>drawingCamera(split?[meshes[j]]:meshes,view,sides[j],aspect));
      const sharedHeight=Math.max(...cameras.map(c=>c.halfHeight));
      renderer.setSize(cellWidth,drawHeight,false);
      for(const [j,{camera}] of cameras.entries()){
        const x=i*width+(j%columns)*cellWidth,y=top+Math.floor(j/columns)*cellHeight;
        forms.forEach((f,k)=>{f.visible=!split||k===j;});
        if(split&&camera instanceof THREE.OrthographicCamera){
          camera.left=-sharedHeight*aspect;camera.right=sharedHeight*aspect;
          camera.top=sharedHeight;camera.bottom=-sharedHeight;camera.updateProjectionMatrix();
          ctx.fillStyle='#cad4d7';ctx.font='20px system-ui';ctx.fillText(labels[j],x+35,y+24);
        }
        const rig=studioLights(split?meshBox(meshes[j]):box,true,view==='Side'?sides[j]:undefined);
        scene.add(rig.group);
        try{
          renderer.render(scene,camera);
          ctx.drawImage(renderer.domElement,x,y+labelHeight,cellWidth,drawHeight);
        }finally{scene.remove(rig.group);rig.dispose();}
      }
      const left=i*width+35;
      ctx.fillStyle='#f7f6f5';ctx.font='600 29px system-ui';ctx.fillText(view==='Side'?(split?'Side elevations':'Side elevation'):view,left,39);
      ctx.fillStyle='#a8b5bc';ctx.font='19px system-ui';ctx.fillText(title,left,66,width-72);
      if(i){ctx.fillStyle='#34424b';ctx.fillRect(i*width,22,2,sheetHeight-44);}
    }
    return await new Promise<Blob>((resolve,reject)=>sheet.toBlob(blob=>blob?resolve(blob):reject(Error('PNG export failed.')),'image/png'));
  }finally{
    for(const g of geometries)g.dispose();
    material.dispose();renderer.dispose();renderer.forceContextLoss();
  }
}
