import * as THREE from 'three';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';
/** New-design sampling only. Regeneration never invokes this function. */
export function populateInsertedPlate(field:AmphitheaterRequest['field'],size:number,seed:number,spacing=12):AmphitheaterSource[]{
 if(!Number.isFinite(spacing)||spacing<12||spacing>15)throw Error('Plate spacing must be 12–15 ft.');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const scale=size/.92,rangeX=field.width/2-size*.65,rangeY=field.depth/2-size*.65;
 if(rangeX<=0||rangeY<=0)throw Error('Nine plate sources do not fit this plan. Enlarge the field or reduce preferred size.');
 for(let attempt=0;attempt<100;attempt++){
 const source:AmphitheaterSource[]=[];
 for(let level=0;level<3;level++)for(const letter of ['L','U','V'] as const){
  const floor=size*.28+level*spacing;
  source.push({letter,x:(random()*2-1)*rangeX*.8,y:(random()*2-1)*rangeY*.8,z:floor+(letter==='V'?size*.35:0)-field.height/2,rx:letter==='V'?90:0,ry:0,rz:[-15,0,15][Math.floor(random()*3)],rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,lift:(['lower','middle','top'] as const)[level],architecturalRole:letter==='L'?'terrace':'perimeter'});
 }
 const fits=source.every(p=>{const g=getLetterVolumeGeometry(p.letter,12),a=g.getAttribute('position'),matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,0,p.rz*Math.PI/180,'ZYX')),new THREE.Vector3(scale,scale,scale));for(let i=0;i<a.count;i++){const q=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix);if(Math.abs(q.x)>field.width/2||Math.abs(q.y)>field.depth/2||q.z<0||q.z>field.height)return false;}return true;});
 if(fits)return source;
 }
 throw Error('Three plate levels at this spacing and preferred size do not fit the selected field. Parameters were not reduced.');
}
