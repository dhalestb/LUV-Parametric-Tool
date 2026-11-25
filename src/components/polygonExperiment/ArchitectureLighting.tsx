'use client';

import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type {OrientationResult} from './orientationStore';
import {studioLights} from './architectureViews';

export function ArchitectureLighting({studies,shadows=true,side}: {
  studies:OrientationResult|OrientationResult[];shadows?:boolean;side?:THREE.Vector3;
}) {
  const box=new THREE.Box3();
  for(const study of Array.isArray(studies)?studies:[studies]){
    const {datum,field}=study.parameters;
    for(const [x,z] of study.frame.corners){
      box.expandByPoint(new THREE.Vector3(x,datum,z));
      box.expandByPoint(new THREE.Vector3(x,datum+field.height,z));
    }
  }
  const {x,y,z}=box.min,{x:X,y:Y,z:Z}=box.max;
  const rig=useMemo(()=>studioLights(new THREE.Box3(new THREE.Vector3(x,y,z),new THREE.Vector3(X,Y,Z)),shadows,side),
    [x,y,z,X,Y,Z,shadows,side]);
  useEffect(()=>()=>rig.dispose(),[rig]);
  return <primitive object={rig.group}/>;
}
