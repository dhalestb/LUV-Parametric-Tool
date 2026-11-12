import * as THREE from 'three';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';
type Point={x:number;y:number};
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points:Point[]){
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),lower:Point[]=[],upper:Point[]=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
 for(const p of sorted.reverse()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
/** Seeded spatial sampling, then classification. No poses change during regeneration. */
export function populateVoidField(field:AmphitheaterRequest['field'],size:number,seed:number,floorSpacing?:number,quantity=9,levelCount:3|4=3):AmphitheaterSource[]{
 if(![3,4].includes(levelCount)||levelCount===4&&quantity!==15)throw Error('Four-level Void Field requires 15 letters.');
 if(!Number.isSafeInteger(quantity)||quantity<9||quantity>15)throw Error('Void Field quantity must be 9–15 letters.');
 if(floorSpacing!==undefined&&(!Number.isFinite(floorSpacing)||floorSpacing<12||floorSpacing>15))throw Error('Level spacing must be between 12 and 15 feet.');
 if(floorSpacing!==undefined&&size*.28+(levelCount-1)*floorSpacing+size*.3>field.height)throw Error(levelCount+' levels at '+floorSpacing+' ft spacing do not fit this field height. Select a taller field; spacing and letter size were not reduced.');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const scale=size/.92,rangeX=field.width/2-size*.68,rangeY=field.depth/2-size*.68;
 if(rangeX<=0||rangeY<=0)throw Error('Preferred letters leave insufficient plan space for the requested sources. Enlarge width/depth or reduce the preferred size.');
 for(let attempt=0;attempt<160;attempt++){
  const points:Point[]=[];
  for(let k=0;k<200&&points.length<quantity;k++){const p={x:(random()*2-1)*rangeX,y:(random()*2-1)*rangeY};if(points.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>size*.36))points.push(p);}
  if(points.length!==quantity)continue;
  const boundary=hull(points);
  const interior=points.filter(p=>!boundary.includes(p)).map(p=>({p,clearance:Math.min(...boundary.map((a,i)=>cross(a,boundary[(i+1)%boundary.length],p)/Math.hypot(a.x-boundary[(i+1)%boundary.length].x,a.y-boundary[(i+1)%boundary.length].y)))})).sort((a,b)=>b.clearance-a.clearance);
  if(interior.length<3||interior[2].clearance<size*.10)continue;
  const selected=interior.slice(0,3).map(p=>p.p);
  let occupied=0;
  const source:AmphitheaterSource[]=points.map(p=>{
   const index=selected.indexOf(p),isVoid=index>=0;
   const slot=isVoid?index:occupied++,letter=(['L','U','V'] as const)[slot%3];
   const level=isVoid?1:Math.floor(slot*levelCount/(quantity-3)),lift=(['lower','middle','top','top'] as const)[level];
   const rx=isVoid?0:(random()*2-1)*10,rz=isVoid?[75,90,105][index]:(Math.round((random()*2-1)*2)*15||0);
   const worldZ=floorSpacing===undefined?(isVoid?Math.min(field.height*.5,size*.95):Math.min(field.height-size*.3,size*(.28+level*.58))):size*.28+floorSpacing*level+(isVoid?size*.09:0);
   return {letter,...(levelCount===4?{levelIndex:level}:{}),...p,z:worldZ-field.height/2,rx,ry:0,rz,rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,lift,architecturalRole:isVoid?'interior':boundary.includes(p)?'perimeter':'terrace'};
  });
  const fits=source.every(p=>{
   const g=getLetterVolumeGeometry(p.letter,12);if(!g.boundingBox)g.computeBoundingBox();
   const matrix=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rx*Math.PI/180,0,p.rz*Math.PI/180,'ZYX')).scale(new THREE.Vector3(scale,scale,scale)).setPosition(p.x,p.y,p.z+field.height/2);
   const box=g.boundingBox!.clone().applyMatrix4(matrix);
   return box.min.x>=-field.width/2&&box.max.x<=field.width/2&&box.min.y>=-field.depth/2&&box.max.y<=field.depth/2&&box.min.z>1&&box.max.z<field.height;
  });
  if(fits)return source;
 }
 throw Error('No valid requested-population spatial arrangement fits these dimensions. Use a wider/deeper field or smaller preferred letters; parameters were not changed.');
}

/** Explicit user action: move lift elevations only. Regeneration never calls this. */
export function applyVoidFieldSpacing(source:AmphitheaterSource[],field:AmphitheaterRequest['field'],spacing:number){
 if(!Number.isFinite(spacing)||spacing<12||spacing>15)throw Error('Level spacing must be between 12 and 15 feet.');
 const lifts=['lower','middle','top'] as const;
 const indices=[...new Set(source.filter(p=>p.architecturalRole!=='interior').map(p=>p.levelIndex??lifts.indexOf(p.lift!)))].sort((a,b)=>a-b);
 const centers=indices.map(index=>{const group=source.filter(p=>(p.levelIndex??lifts.indexOf(p.lift!))===index&&p.architecturalRole!=='interior');if(!group.length)throw Error('Spacing requires occupied source letters in all three lifts.');return group.reduce((sum,p)=>sum+p.z,0)/group.length;});
 const next=source.map(p=>{const index=p.levelIndex??lifts.indexOf(p.lift!);if(index<0)throw Error('Assign a lift before adjusting this source.');return {...p,z:p.z+centers[0]+index*spacing-centers[index]};});
 for(const p of next){const geometry=getLetterVolumeGeometry(p.letter,12),position=geometry.getAttribute('position');const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));for(let i=0;i<position.count;i++){const q=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix);if(Math.abs(q.x)>field.width/2||Math.abs(q.y)>field.depth/2||q.z<0||q.z>field.height)throw Error('This spacing puts a source outside the field. Select a taller field or adjust the letters; no poses were applied.');}}
 return next;
}

/** Explicit additive operation: retain every existing pose and add only the fourth lift. */
export function addVoidFieldFourthLevel(source:AmphitheaterSource[],field:AmphitheaterRequest['field'],spacing:number):AmphitheaterSource[]{
 if(source.length!==12||spacing!==15)throw Error('Preserve-source fourth-level operation requires the existing 12 letters and 15-ft spacing.');
 const group=(index:number)=>source.filter(p=>p.architecturalRole!=='interior'&&(p.levelIndex??(['lower','middle','top'] as const).indexOf(p.lift!))===index);
 const groups=[0,1,2].map(group);if(groups.some(g=>g.length!==3))throw Error('Assign three occupied sources to each existing level before adding the fourth.');
 const centers=groups.map(g=>g.reduce((s,p)=>s+p.z,0)/g.length);if(centers.slice(1).some((z,i)=>Math.abs(z-centers[i]-spacing)>1e-6))throw Error('Existing levels are not 15 ft apart. No letters were changed.');
 const next=[...source.map(p=>({...p})),...groups[2].map(p=>({...p,z:p.z+spacing,levelIndex:3}))];
 for(const p of next){const g=getLetterVolumeGeometry(p.letter,12),a=g.getAttribute('position'),m=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));for(let i=0;i<a.count;i++){const q=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(m);if(Math.abs(q.x)>field.width/2||Math.abs(q.y)>field.depth/2||q.z<0||q.z>field.height)throw Error('Fourth-level sources do not fit the field. Existing letters were retained.');}}
 return next;
}
