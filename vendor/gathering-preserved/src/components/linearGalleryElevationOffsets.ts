import * as THREE from 'three';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterSource,AmphitheaterRequest} from './amphitheaterInteractiveTypes';
export function gallerySourceBounds(p:AmphitheaterSource,f:AmphitheaterRequest['field']){
 const g=getLetterVolumeGeometry(p.letter,12);g.computeBoundingBox();
 const m=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+f.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(...[p.rx,p.ry,p.rz].map(THREE.MathUtils.degToRad) as [number,number,number],p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 return g.boundingBox!.clone().applyMatrix4(m);
}
export function setGalleryLetterOffset(source:AmphitheaterSource[],index:number,offset:-4|0|4,f:AmphitheaterRequest['field']){
 const p=source[index];if(!p||p.galleryNominalZ===undefined||!p.galleryZone||![-4,0,4].includes(offset))throw Error('This letter needs a defined nominal gallery level and a -4, 0 or +4-ft offset.');
 const bounds=gallerySourceBounds(p,f),bottom=p.galleryNominalZ+offset,top=bottom+bounds.max.z-bounds.min.z,mid=f.height/2;
 if(bottom<(p.galleryZone==='lower'?0:mid)||top>(p.galleryZone==='lower'?mid:f.height))throw Error('This offset crosses the source zone or field boundary. Existing elevations retained.');
 const next=source.map((q,i)=>i===index?{...q,z:q.z+bottom-bounds.min.z,galleryElevationOffset:offset}:q);
 const upper=next.filter(q=>q.galleryZone==='upper').map(q=>gallerySourceBounds(q,f).min.z);
 if(!upper.length||Math.abs(Math.min(...upper)-mid)>1e-7)throw Error('At least one upper source must remain anchored at '+mid+' ft. Existing elevations retained.');
 return next;
}
