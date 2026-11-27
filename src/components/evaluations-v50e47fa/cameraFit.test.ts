import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {perspectiveFit,presetCamera} from './analysisViewer';

describe('comparison camera fit',()=>{
 it('keeps all corners of the largest shared bounds inside wide, square and narrow panels',()=>{
  for(const aspect of [.5,.75,1,4/3,2])for(const span of [10,40,100]){
   const fit=perspectiveFit(span,aspect),preset=presetCamera('isometric',fit,span/2);
   const camera=new THREE.PerspectiveCamera(40,aspect,.01,10000);
   camera.position.set(...preset.position);camera.up.set(...preset.up);camera.lookAt(...preset.target);camera.updateMatrixWorld();camera.updateProjectionMatrix();
   for(const x of [-span/2,span/2])for(const y of [0,span])for(const z of [-span/2,span/2]){
    const p=new THREE.Vector3(x,y,z).project(camera);
    assert(Math.abs(p.x)<1&&Math.abs(p.y)<1,`corner clipped at aspect ${aspect}, span ${span}: ${p.x}, ${p.y}`);
   }
  }
 });
});
