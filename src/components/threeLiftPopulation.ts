import * as THREE from 'three';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';

type Field=AmphitheaterRequest['field'];
type Lift=NonNullable<AmphitheaterSource['lift']>;
const liftNames:Lift[]=['lower','middle','top'];

function hull(points:THREE.Vector2[]){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=(list:THREE.Vector2[])=>{
    const out:THREE.Vector2[]=[];
    for(const p of list){while(out.length>1&&cross(out.at(-2)!,out.at(-1)!,p)<=0)out.pop();out.push(p);}
    return out;
  };
  return [...half(sorted).slice(0,-1),...half(sorted.slice().reverse()).slice(0,-1)];
}
function matrix(p:AmphitheaterSource){
  return new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ')),
    new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
}
function outline(p:AmphitheaterSource){
  const geometry=getLetterVolumeGeometry(p.letter,12),positions=geometry.getAttribute('position'),m=matrix(p);
  return Array.from({length:positions.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(m));
}
export function populateThreeLifts(existing:AmphitheaterSource[],count:number,field:Field,size:number,seed:number){
  const result=existing.slice();
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const targets=liftNames.map((_,i)=>Math.floor(count/3)+(i<count%3?1:0));
  const totalHeight=Math.min(field.height-1,size*3);
  const lower=size*.28,top=totalHeight-size*.24;
  const elevations=[lower,(lower+top)/2,top];
  const middleUprights=Math.min(2,Math.max(0,targets[1]-1));
  // Place the surrounding terrace letters before testing the actual footprints of interior sources.
  const tasks=liftNames.flatMap((lift,i)=>Array.from({length:targets[i]},(_,slot)=>({lift,slot,index:i,upright:lift==='middle'&&slot<middleUprights})));
  tasks.sort((a,b)=>Number(a.upright)-Number(b.upright));
  for(const task of tasks){
    const already=result.filter(p=>p.lift===task.lift).length;
    if(existing.length&&already>=targets[task.index])continue;
    if(existing.length&&result.length>=count)break;
    let best:AmphitheaterSource|undefined,bestScore=-Infinity;
    const boundary=hull(result.flatMap(p=>outline(p).map(q=>new THREE.Vector2(q.x,q.y))));
    for(let attempt=0;attempt<160;attempt++){
      const letter=(['L','U','V'] as const)[Math.floor(random()*3)];
      const parent=result.length?result[Math.floor(random()*result.length)]:undefined;
      const p:AmphitheaterSource={
        letter,lift:task.lift,architecturalRole:'terrace',rotationOrder:'ZYX',
        x:parent?parent.x+(random()-.5)*size*1.4:0,y:parent?parent.y+(random()-.5)*size*1.4:0,
        z:elevations[task.index]-field.height/2+(random()-.5)*size*.12,
        rx:(random()-.5)*24,ry:0,rz:[0,-15,15][Math.floor(random()*3)],
        scale:size/.92,scaleX:1,scaleY:1,scaleZ:1
      };
      if(task.upright){
        p.x=(random()-.5)*size*.8;p.y=(random()-.5)*size*.8;
        p.rx=90;p.rz=task.slot%2?0:90;
        p.z=elevations[1]-field.height/2+(task.slot%2?1:-1)*size*.08;
        p.architecturalRole='interior';p.voidKind='through';
      }
      const geometry=getLetterVolumeGeometry(letter,12);
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      const bounds=geometry.boundingBox!.clone().applyMatrix4(matrix(p));
      if((['x','y','z'] as const).some((axis,i)=>bounds.min[axis]<-[field.width,field.depth,field.height][i]/2||bounds.max[axis]>[field.width,field.depth,field.height][i]/2))continue;
      const points=outline(p);
      if(task.upright){
        const inside=boundary.length>=3&&points.every(point=>boundary.every((a,i)=>{
          const b=boundary[(i+1)%boundary.length],dx=b.x-a.x,dy=b.y-a.y;
          return (dx*(point.y-a.y)-dy*(point.x-a.x))/Math.hypot(dx,dy)>.8;
        }));
        if(!inside)continue;
      }
      const nearest=result.length?Math.min(...result.map(other=>Math.hypot(p.x-other.x,p.y-other.y))):0;
      const focus=result.length?result.reduce((v,other)=>v.add(new THREE.Vector2(other.x,other.y)),new THREE.Vector2()).divideScalar(result.length):new THREE.Vector2();
      const setback=Math.hypot(p.x-focus.x,p.y-focus.y);
      const score=task.upright?-setback:-Math.abs(nearest-size*.55)-.3*Math.abs(setback-size*.65);
      if(score>bestScore){best=p;bestScore=score;}
    }
    if(!best)throw Error('No contained '+task.lift+' lift placement found. Change seed, letter quantity or field.');
    result.push(best);
  }
  if(result.length!==count)throw Error('Unable to extend the three-lift composition to the requested quantity.');
  const boundary=hull(result.flatMap(p=>outline(p).map(q=>new THREE.Vector2(q.x,q.y))));
  for(const p of result.slice(existing.length).filter(p=>p.architecturalRole==='terrace')){
    const touches=outline(p).some(point=>boundary.some((a,i)=>{
      const b=boundary[(i+1)%boundary.length];
      return Math.abs((b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x))/a.distanceTo(b)<.3;
    }));
    if(touches)p.architecturalRole='perimeter';
  }
  return result;
}
