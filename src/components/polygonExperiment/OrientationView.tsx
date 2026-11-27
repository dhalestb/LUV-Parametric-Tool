'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {OrbitControls,OrthographicCamera,PerspectiveCamera} from '@react-three/drei';
import * as THREE from 'three';
import type {OrbitControls as Controls} from 'three-stdlib';
import {drawingCamera,stepDownDirection,type FormMesh} from './architectureViews';
import {useArchitecture} from './ArchitectureLayer';
import {ArchitectureLighting} from './ArchitectureLighting';
import {OrientationGeometry} from './OrientationScene';
import {cameraContext,frameGeometry,validCamera,meshBounds} from './orientationPresentation';
import type {OrientationResult,OrientationSelection} from './orientationStore';
const orthographicPreset=(preset:string)=>['Plan','Elevation','Side','Section'].includes(preset);

function Camera({result,preset,command,form,side}:{
  result:OrientationResult;preset:string;command:number;form?:FormMesh;side?:THREE.Vector3;
}){
  const {camera,size}=useThree();
  const controls=useRef<Controls>(null),latest=useRef(result),lastCommand=useRef(0);
  latest.current=result;
  const key=cameraContext(result);
  const orthographic=camera instanceof THREE.OrthographicCamera;
  const projection=preset==='Side'&&side?'stepped-side':orthographic?'orthographic':'perspective';
  useEffect(()=>{
    if(orthographicPreset(preset)!==orthographic)return;
    type Pose={position:number[];target:number[];zoom?:number;preset?:string;projection?:string};
    let saved:Pose|null=null;
    try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    const forceFrame=lastCommand.current!==command;
    lastCommand.current=command;
    const needsProjection=preset==='Side'||preset==='Elevation';
    const restore=saved&&validCamera(saved)&&!forceFrame&&(saved.preset??'Perspective')===preset&&
      (!needsProjection||saved.projection===projection);
    const aspect=size.width/Math.max(size.height,1);
    const fit=preset==='Side'&&form&&side?drawingCamera([form],'Side',side,aspect):undefined;
    const pose=restore&&saved?saved:fit?{position:fit.camera.position.toArray(),target:fit.center.toArray()}:
      frameGeometry(latest.current,preset,aspect);
    camera.up.set(0,preset==='Plan'?0:1,preset==='Plan'?-1:0);
    camera.position.fromArray(pose.position);
    camera.lookAt(...pose.target as [number,number,number]);
    controls.current?.target.fromArray(pose.target);
    if(camera instanceof THREE.OrthographicCamera){
      if(restore&&saved&&Number.isFinite(saved.zoom))camera.zoom=saved.zoom!;
      else if(fit)camera.zoom=size.height/(2*fit.halfHeight);
      else{
        const study=latest.current,box=meshBounds(study);
        for(const [x,z] of study.site.zones.find(zone=>zone.id===study.zoneId)?.polygon??[]){
          box.expandByPoint(new THREE.Vector3(x,study.parameters.datum,z));
        }
        const span=box.getSize(new THREE.Vector3());
        const width=preset==='Side'||preset==='Section'?span.z:span.x;
        camera.zoom=Math.min(size.width/Math.max(width,1),size.height/Math.max(preset==='Plan'?span.z:span.y,1))/1.4;
      }
    }
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);controls.current?.update();
    localStorage.setItem(key,JSON.stringify({position:camera.position.toArray(),target:pose.target,preset,projection,zoom:camera.zoom}));
  },[camera,key,preset,command,size.width,size.height,form,side,orthographic,projection]);
  return <OrbitControls ref={controls} enableRotate={!orthographicPreset(preset)} onEnd={()=>
    localStorage.setItem(key,JSON.stringify({position:camera.position.toArray(),target:controls.current?.target.toArray(),
      preset,projection,zoom:camera.zoom}))}/>;
}
function ContextView({result,view}:{result:OrientationResult;view:OrientationSelection}){const [preset,setPreset]=useState(()=>{try{return JSON.parse(localStorage.getItem(cameraContext(result))||'null')?.preset??'Perspective';}catch{return 'Perspective';}}),[command,setCommand]=useState(0);const {result:architecture}=useArchitecture(result);const form=architecture?.architecture;const side=useMemo(()=>preset==='Side'&&form?stepDownDirection(form):undefined,[form,preset]);const sectionPlane=preset==='Section'?new THREE.Plane(new THREE.Vector3(-1,0,0),meshBounds(result).getCenter(new THREE.Vector3()).x):undefined;return <><div style={{display:'flex',gap:8,margin:'12px 0',flexWrap:'wrap'}}><button onClick={()=>setCommand(n=>n+1)}>Frame Selected Geometry</button>{['Perspective','Plan','Elevation','Side','Section'].map(p=><button key={p} aria-pressed={preset===p} onClick={()=>{setPreset(p);setCommand(n=>n+1);}}>{p}</button>)}</div><div style={{height:500}}><Canvas shadows gl={{localClippingEnabled:true}}>{orthographicPreset(preset)?<OrthographicCamera makeDefault up={preset==='Plan'?[0,0,-1]:[0,1,0]} near={.05} far={100000}/>:<PerspectiveCamera makeDefault near={.05} far={100000} fov={75}/>}<color attach='background' args={['#080F18']}/><ArchitectureLighting studies={result} shadows={!sectionPlane} side={side}/><Camera result={result} preset={preset} command={command} form={form} side={side}/><OrientationGeometry result={result} view={view} sectionPlane={sectionPlane}/></Canvas></div><details><summary>View and camera details</summary><p>{preset==='Section'?'Orthographic section through saved mesh center · camera +X; front half clipped for display only. No geometry is changed.':preset==='Plan'?'Orthographic Plan · +X right, −Z up · matches Site Development top view. Pan / zoom; orbit resumes in Perspective.':preset==='Side'?'Orthographic side elevation framed along the descending roof profile.':preset==='Elevation'?'Orthographic front elevation · +X right, +Y up.':'Perspective comparison · orbit / pan / zoom.'} Actual saved source-letter meshes. Camera context: {result.site.origin==='fixture'?'fixture':'site'} · {result.site.name} · {result.zoneId}. Comparisons retain this context’s camera; Frame Selected Geometry fits actual mesh bounds. Rule A remains unchanged; the optional saved Rule B architectural layer is controlled above.</p></details></>;}
export default function OrientationView(props:{result:OrientationResult;view:OrientationSelection}){return <ContextView key={cameraContext(props.result)} {...props}/>;}


