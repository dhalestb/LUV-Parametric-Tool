import * as THREE from 'three';
import type {SavedMesh} from './types';
/** GPU copies only. Never weld, offset, fit or modify original arrays. */
export function savedMeshGeometry(mesh:SavedMesh) {
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));
 geometry.setIndex(Array.from(mesh.indices));
 geometry.computeVertexNormals();
 return geometry;
}

