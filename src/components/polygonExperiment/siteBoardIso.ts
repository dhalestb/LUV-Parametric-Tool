import * as THREE from 'three';
import {loadSiteFromArrayBuffer,miamiParcelScale,scaleRootToFeet} from '../siteDevelopment/siteImport';
import {readSiteGeometryCache} from '../siteDevelopment/siteGeometryCache';
import {geometryFor,formFinish,studioLights,type FormMesh} from './architectureViews';
import type {SiteInput,Zone} from './model';

export async function drawSiteIso(ctx:CanvasRenderingContext2D,site:SiteInput,zones:Zone[],forms:FormMesh[],x:number,y:number,width:number,height:number){
  const ref=site.modelReference;
  const miami=ref?ref.id==='miami-waterfront':site.name==='Miami waterfront study';
  const cached=await readSiteGeometryCache().catch(()=>null);
  let buffer:ArrayBuffer,filename:string;
  if(cached&&ref&&[cached.sampleId,cached.filename,cached.filename.replace(/\.glb$/i,'')].includes(ref.id)){
    buffer=cached.buffer;filename=cached.filename;
  }else if(miami){
    const response=await fetch('/samples/miami-waterfront.glb');
    if(!response.ok)throw Error('The Miami site model could not be loaded.');
    buffer=await response.arrayBuffer();filename='miami-waterfront.glb';
  }else throw Error('Open the matching model in Site Development before exporting its site board.');
  const {root,info}=await loadSiteFromArrayBuffer(buffer,filename);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#000000');
  scene.add(root);
  let renderer:THREE.WebGLRenderer|undefined,lights:ReturnType<typeof studioLights>|undefined;
  try{
    const declared=ref?.scale??site.coordinates.feetPerModel;
    const scale=miami?miamiParcelScale(info,zones,declared)??miamiParcelScale(info,zones,1):declared;
    if(!scale)throw Error('The selected cluster coordinates do not align with the Miami site model.');
    scaleRootToFeet(root,scale);
    const bounds=new THREE.Box3(),material=new THREE.MeshStandardMaterial(formFinish);
    for(const form of forms){
      const mesh=new THREE.Mesh(geometryFor(form),material);
      mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);bounds.expandByObject(mesh);
    }
    const center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(1,bounds.getSize(new THREE.Vector3()).length()/2);
    // Use the Site Development ISO direction and field of view, framed on the selected designs.
    const camera=new THREE.PerspectiveCamera(38,width/height,.5,Math.max(10000,radius*50));
    const halfAngle=Math.min(THREE.MathUtils.degToRad(19),Math.atan(Math.tan(THREE.MathUtils.degToRad(19))*camera.aspect));
    camera.position.set(.9,.75,.9).normalize().multiplyScalar(1.17*radius/Math.sin(halfAngle)).add(center);
    camera.lookAt(center);
    lights=studioLights(bounds,true);scene.add(lights.group);
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(width,height,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.render(scene,camera);ctx.drawImage(renderer.domElement,x,y);
  }finally{
    const materials=new Set<THREE.Material>();
    scene.traverse(object=>{if(object instanceof THREE.Mesh){
      object.geometry.dispose();for(const m of ([] as THREE.Material[]).concat(object.material))materials.add(m);
    }});
    materials.forEach(m=>m.dispose());lights?.dispose();renderer?.dispose();renderer?.forceContextLoss();
  }
}
