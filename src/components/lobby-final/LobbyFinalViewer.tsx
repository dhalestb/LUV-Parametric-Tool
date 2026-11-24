'use client';
import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import type {OriginalArchitecture,SavedMesh} from './types';
import {savedMeshGeometry} from './geometry';
function SavedObject({mesh,color,opacity=1}:{mesh:SavedMesh;color:string;opacity?:number}){
 const geometry=useMemo(()=>savedMeshGeometry(mesh),[mesh]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} dispose={null}><meshStandardMaterial color={color} roughness={.82} side={THREE.DoubleSide} flatShading transparent={opacity<1} opacity={opacity}/></mesh>;
}
function Frame({field,onReady}:{field:OriginalArchitecture['request']['field'];onReady:()=>void}){
 const {camera,size,gl}=useThree();
 const ready=useRef(onReady);ready.current=onReady;
 useEffect(()=>{
  const c=camera as THREE.OrthographicCamera,span=Math.max(field.width,field.depth,field.height),center=new THREE.Vector3(0,0,field.height/2);
  c.up.set(0,0,1);c.position.copy(center).add(new THREE.Vector3(span,-span,span*.85));c.lookAt(center);c.updateMatrixWorld();
  const box=new THREE.Box3();
  for(const x of [-field.width/2,field.width/2])for(const y of [-field.depth/2,field.depth/2])for(const z of [0,field.height])box.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse));
  const extent=box.getSize(new THREE.Vector3()),aspect=size.width/size.height,half=Math.max(extent.y/2,extent.x/(2*aspect))/.88;
  c.left=-half*aspect;c.right=half*aspect;c.top=half;c.bottom=-half;c.near=.01;c.far=span*12;c.zoom=1;c.updateProjectionMatrix();
  gl.domElement.setAttribute('data-mesh-ready','true');ready.current();
 },[camera,size.width,size.height,field,gl]);
 return null;
}
function Field({field}:{field:OriginalArchitecture['request']['field']}){
 const geometry=useMemo(()=>new THREE.EdgesGeometry(new THREE.BoxGeometry(field.width,field.depth,field.height)),[field]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments geometry={geometry} position={[0,0,field.height/2]}><lineBasicMaterial color="#668494" transparent opacity={.85}/></lineSegments>;
}
export default function LobbyFinalViewer({result,showLetters,reset,onReady}:{result:OriginalArchitecture;showLetters:boolean;reset:number;onReady:()=>void}){
 const field=result.request.field;
 return <Canvas key={reset} orthographic dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true}} camera={{up:[0,0,1]}}>
  <color attach="background" args={['#080d12']}/><ambientLight intensity={1.25}/>
  <directionalLight position={[50,-60,90]} intensity={1.7}/><directionalLight position={[-30,20,40]} intensity={.65}/>
  <Frame field={field} onReady={onReady}/><Field field={field}/>
  <SavedObject mesh={result.architecture} color="#dedbcb"/>
  {showLetters&&result.letters.map((l,i)=><SavedObject key={l.id} mesh={l.mesh} color={['#c6b27c','#c49696','#8d9fb8'][i%3]} opacity={.5}/>)}
  <OrbitControls target={[0,0,field.height/2]} enablePan enableZoom/>
 </Canvas>;
}

