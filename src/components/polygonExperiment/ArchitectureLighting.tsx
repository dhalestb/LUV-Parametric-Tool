'use client';

import {useMemo} from 'react';
import * as THREE from 'three';
import type {OrientationResult} from './orientationStore';

export function ArchitectureLighting({studies, shadows = true}: {
  studies: OrientationResult | OrientationResult[];
  shadows?: boolean;
}) {
  const {target, position, radius} = useMemo(() => {
    const bounds = new THREE.Box3();
    for (const study of Array.isArray(studies) ? studies : [studies]) {
      const {datum, field} = study.parameters;
      for (const [x, z] of study.frame.corners) {
        bounds.expandByPoint(new THREE.Vector3(x, datum, z));
        bounds.expandByPoint(new THREE.Vector3(x, datum + field.height, z));
      }
    }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(1, sphere.radius * 1.05);
    const target = new THREE.Object3D();
    target.position.copy(sphere.center);
    const position = new THREE.Vector3(-1, 1.15, -0.65).normalize()
      .multiplyScalar(2 * radius).add(sphere.center);
    return {target, position, radius};
  }, [studies]);

  return <>
    <hemisphereLight args={['#ffffff', '#636976', 0.75]} />
    <primitive object={target} />
    <directionalLight position={position} target={target} intensity={1.9} castShadow={shadows}
      shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-left={-radius} shadow-camera-right={radius}
      shadow-camera-top={radius} shadow-camera-bottom={-radius}
      shadow-camera-near={radius * 0.5} shadow-camera-far={radius * 3.5}
      shadow-normalBias={radius / 5000} shadow-bias={-0.00005} />
  </>;
}
