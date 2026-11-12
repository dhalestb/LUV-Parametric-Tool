import * as THREE from 'three';
import {populateThreeLifts} from './threeLiftPopulation';
import {getLetterShape,getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest, AmphitheaterSource} from './amphitheaterInteractiveTypes';
type Field=AmphitheaterRequest['field'];
export function suggestedCount(field:Field,size:number){
  // Allocate one nominal letter-sized study bay per 3.5 letter volumes.
  return Math.max(2,Math.round(field.width*field.depth*field.height/(3.5*size**3)));
}
function rotation(p:AmphitheaterSource){
  return new THREE.Euler(...[p.rx,p.ry,p.rz].map(THREE.MathUtils.degToRad) as [number,number,number],p.rotationOrder??'XYZ');
}
export function populate(existing:AmphitheaterSource[],count:number,field:Field,size:number,seed:number,options:{transitions?:boolean;legacyOrientations?:boolean;envelopeRoles?:boolean;threeLifts?:boolean}={}){
  if(!Number.isSafeInteger(count)||count<1||!(size>0))throw Error('Enter a positive whole population and a positive letter size.');
  if(options.threeLifts){
    if(count<existing.length)throw Error('Remove individual letters or choose New Design to reduce the quantity.');
    return populateThreeLifts(existing,count,field,size,seed);
  }
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const result=existing.slice();
  if(count<result.length)throw Error('Remove individual letters or choose New composition to reduce the population.');
  const role=['L','U','V'] as const;
  while(result.length<count){
    let best:AmphitheaterSource|undefined,score=-Infinity;
    for(let j=0;j<48;j++){
      const parent=result[Math.floor(random()*result.length)],letter=role[Math.floor(random()*3)];
      const p:AmphitheaterSource={letter,x:0,y:0,z:0,rx:Math.round(random()*120-60)||0,ry:Math.round(random()*100-50)||0,rz:Math.round(random()*360-180)||0,scale:size/.92,scaleX:1,scaleY:1,scaleZ:1};
      if(!options.legacyOrientations){const axis=existing[0]?.rz??0;const choices=options.transitions?[0,0,0,-15,15,-30,30]:[0,0,0,-15,15];const choice=Math.abs(Math.round(p.rz))%choices.length;p.rx=0;p.ry=0;p.rz=axis+choices[choice];}
      if(options.envelopeRoles){
        p.architecturalRole=result.length%3===2?'interior':'perimeter';
        if(p.architecturalRole==='interior'){
          p.rx=90;p.ry=0;p.rotationOrder='ZYX';
          p.rz=[0,75,90,105][Math.floor(random()*4)];
          p.voidKind=result.filter(s=>s.architecturalRole==='interior').length%2===0?'alcove':'through';
        }else{
          p.rx=(random()<.5?-1:1)*(12+Math.floor(random()*9));
        }
        p.z=Math.max(-field.height*.30,-field.height/2+size*.6);
      }
      if(parent){
        const points=getLetterShape(parent.letter).getPoints(5),i=1+Math.floor(random()*(points.length-1)),q=points[i],d=q.clone().sub(points[i-1]).normalize();
        const target=new THREE.Vector3(q.x*parent.scaleX+d.x*.35,q.y*parent.scaleY+d.y*.35,(random()-.5)*1.6).multiplyScalar(parent.scale).applyEuler(rotation(parent));
        p.x=parent.x+target.x;p.y=parent.y+target.y;p.z=parent.z+target.z;
        if(options.envelopeRoles){
          const rise=size*(.18+.17*random());
          p.z=parent.z+(p.architecturalRole==='interior'?rise*.25:rise);
        }
      }
      if(options.envelopeRoles && p.architecturalRole==='interior'){
        const level=result.filter(a=>a.architecturalRole==='interior').length;
        const rise=Math.min(size*.9,Math.max(0,field.height-size*1.5)/Math.max(1,Math.floor(count/3)-1));
        p.z=-field.height/2+size*.75+level*rise;
      }
      const glyph=getLetterVolumeGeometry(letter,12);if(!glyph.boundingBox)glyph.computeBoundingBox();
      const bounds=glyph.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation(p)).scale(new THREE.Vector3(p.scale,p.scale,p.scale)));
      if((['x','y','z'] as const).some((axis,k)=>{const half=[field.width,field.depth,field.height][k]/2;return p[axis]+bounds.min[axis]<-half||p[axis]+bounds.max[axis]>half;}))continue;
      const separation=parent?Math.min(...result.map(a=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z))):0;
      let fit=separation;
      if(options.envelopeRoles&&parent){
        // Favor overlapping neighboring bays with distinct setbacks around the sources.
        const nearby=Math.min(...result.map(a=>Math.hypot(a.x-p.x,a.y-p.y)));
        const focus=result.reduce((v,a)=>[v[0]+a.x/result.length,v[1]+a.y/result.length],[0,0]);
        const setback=Math.hypot(p.x-focus[0],p.y-focus[1]);
        const interior=p.architecturalRole==='interior';
        fit=-Math.abs(nearby-size*(interior ? .32 : .65))-.4*Math.abs(setback-size*(interior ? .25 : .85));
      }
      if(options.envelopeRoles && p.architecturalRole==='interior'){
        for(const other of result.filter(s=>s.architecturalRole==='interior')){
          const yaw=(p.voidKind==='through'?p.rz:other.rz)*Math.PI/180;
          const lateral=Math.abs((p.x-other.x)*Math.cos(yaw)+(p.y-other.y)*Math.sin(yaw));
          // Reserve material at the rear and crown of neighboring recessed bays.
          if(other.voidKind!==p.voidKind && lateral<size*.9 && Math.abs(p.z-other.z)<size){
            fit-=1000+10*(size*.9-lateral);
          }
        }
      }
      if(fit>score){best=p;score=fit;}
    }
    if(!best)throw Error('No in-field placement found for the next letter. Change the seed, size or field.');
    result.push(best);
  }
  return result;
}
