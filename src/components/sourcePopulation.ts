import * as THREE from 'three';
import {getLetterShape,getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest, AmphitheaterSource} from './amphitheaterInteractiveTypes';
type Field=AmphitheaterRequest['field'];
export function suggestedCount(field:Field,size:number){
  // Allocate one nominal letter-sized study bay per 3.5 letter volumes.
  return Math.max(2,Math.round(field.width*field.depth*field.height/(3.5*size**3)));
}
function rotation(p:AmphitheaterSource){
  return new THREE.Euler(...[p.rx,p.ry,p.rz].map(THREE.MathUtils.degToRad) as [number,number,number]);
}
export function populate(existing:AmphitheaterSource[],count:number,field:Field,size:number,seed:number){
  if(!Number.isSafeInteger(count)||count<1||!(size>0))throw Error('Enter a positive whole population and a positive letter size.');
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const result=existing.slice();
  if(count<result.length)throw Error('Remove individual letters or choose New composition to reduce the population.');
  const role=['L','U','V'] as const;
  while(result.length<count){
    let best:AmphitheaterSource|undefined,score=-Infinity;
    for(let j=0;j<48;j++){
      const parent=result[Math.floor(random()*result.length)],letter=role[Math.floor(random()*3)];
      const p={letter,x:0,y:0,z:0,rx:Math.round(random()*120-60)||0,ry:Math.round(random()*100-50)||0,rz:Math.round(random()*360-180)||0,scale:size/.92,scaleX:1,scaleY:1,scaleZ:1};
      if(parent){
        const points=getLetterShape(parent.letter).getPoints(5),i=1+Math.floor(random()*(points.length-1)),q=points[i],d=q.clone().sub(points[i-1]).normalize();
        const target=new THREE.Vector3(q.x*parent.scaleX+d.x*.35,q.y*parent.scaleY+d.y*.35,(random()-.5)*1.6).multiplyScalar(parent.scale).applyEuler(rotation(parent));
        p.x=parent.x+target.x;p.y=parent.y+target.y;p.z=parent.z+target.z;
      }
      const glyph=getLetterVolumeGeometry(letter,12);if(!glyph.boundingBox)glyph.computeBoundingBox();
      const bounds=glyph.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation(p)).scale(new THREE.Vector3(p.scale,p.scale,p.scale)));
      if((['x','y','z'] as const).some((axis,k)=>{const half=[field.width,field.depth,field.height][k]/2;return p[axis]+bounds.min[axis]<-half||p[axis]+bounds.max[axis]>half;}))continue;
      const separation=parent?Math.min(...result.map(a=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z))):0;
      if(separation>score){best=p;score=separation;}
    }
    if(!best)throw Error('No in-field placement found for the next letter. Change the seed, size or field.');
    result.push(best);
  }
  return result;
}
