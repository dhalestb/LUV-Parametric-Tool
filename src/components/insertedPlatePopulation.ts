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

/** Expanded source sampling only; saved source transformations remain authoritative. */
export function suggestedInsertedPlateCount(field:AmphitheaterRequest['field'],size:number,spacing=12){
 const capacity=Math.max(1,Math.min(4,Math.floor((field.height-size*1.13)/spacing)+1));
 return Math.max(9,capacity*3);
}
export function populateSpanningPlate(field:AmphitheaterRequest['field'],size:number,seed:number,spacing=12,quantity=12):AmphitheaterSource[]{
 if(!Number.isSafeInteger(quantity)||quantity<1)throw Error('Enter a positive whole number of letters.');
 if(!Number.isFinite(spacing)||spacing<12||spacing>15)throw Error('Plate spacing must be 12–15 ft.');
 const capacity=Math.min(4,Math.floor((field.height-size*1.13)/spacing)+1),groups=Math.max(1,Math.floor(quantity/3)),levels=Math.min(capacity,groups);
 if(levels<1)throw Error('Sources do not fit the selected height and preferred size. Parameters were not changed.');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const scale=size/.92,rangeX=field.width/2-size*.65,rangeY=field.depth/2-size*.65;
 if(rangeX<=0||rangeY<=0)throw Error('Plate sources do not fit this plan. Parameters were not changed.');
 for(let attempt=0;attempt<100;attempt++){
 const source:AmphitheaterSource[]=[];
 for(let i=0;i<quantity;i++){
  const group=Math.floor(i/3),level=group<groups?Math.floor(group*levels/groups):(i-groups*3)%levels,letter=(['L','U','V'] as const)[i%3],floor=size*.28+level*spacing;
  source.push({letter,x:(random()*2-1)*rangeX*.8,y:(random()*2-1)*rangeY*.8,z:floor+(letter==='V'?size*.35:0)-field.height/2,rx:letter==='V'?90:0,ry:0,rz:[-15,0,15][Math.floor(random()*3)],rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:level,lift:(['lower','middle','top','top'] as const)[level],architecturalRole:letter==='L'?'terrace':'perimeter'});
 }
 const fits=source.every(p=>{const g=getLetterVolumeGeometry(p.letter,12),a=g.getAttribute('position'),matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,0,p.rz*Math.PI/180,'ZYX')),new THREE.Vector3(scale,scale,scale));for(let i=0;i<a.count;i++){const q=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix);if(Math.abs(q.x)>field.width/2||Math.abs(q.y)>field.depth/2||q.z<0||q.z>field.height)return false;}return true;});
 if(fits)return source;
 }
 throw Error('Sources do not fit the selected field at this quantity, size and spacing. Parameters were not reduced.');
}

/** Explicit spacing edit: move whole source levels by their horizontal plate elevations. */
export function applyInsertedPlateSpacing(source:AmphitheaterSource[],field:AmphitheaterRequest['field'],spacing:number){
 if(!Number.isFinite(spacing)||spacing<12||spacing>15)throw Error('Plate spacing must be 12–15 ft.');
 const elevations=[...new Set(source.filter(p=>p.architecturalRole==='terrace').map(p=>p.z))].sort((a,b)=>a-b);
 if(!elevations.length)throw Error('Assign horizontal plate sources before adjusting spacing.');
 const next=source.map(p=>{const nearest=elevations.reduce((a,b)=>Math.abs(a-p.z)<Math.abs(b-p.z)?a:b),index=elevations.indexOf(nearest);return {...p,z:p.z+elevations[0]+index*spacing-nearest};});
 for(const p of next){const g=getLetterVolumeGeometry(p.letter,12),a=g.getAttribute('position'),matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));for(let i=0;i<a.count;i++){const q=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(matrix);if(Math.abs(q.x)>field.width/2||Math.abs(q.y)>field.depth/2||q.z<0||q.z>field.height)throw Error('This spacing puts a source outside the field. No source changes were applied.');}}
 return next;
}
/** Orient new edge-connected sources before they are saved or displayed. */
export function orientEdgeSources(source:AmphitheaterSource[],field:AmphitheaterRequest['field'],seed=37):AmphitheaterSource[]{
 const phase=((seed>>>0)%2===0?180:0)+((seed>>>0)%5-2)*0.8;
 // Allocate equal perimeter sectors within each floor, including partial groups.
 const levelOf=(p:AmphitheaterSource,index:number)=>p.levelIndex??Math.floor(index/3);
 const counts=new Map<number,number>(), nextSlot=new Map<number,number>();
 source.forEach((p,i)=>{const level=levelOf(p,i);counts.set(level,(counts.get(level)??0)+1);});
 return source.map((p,i)=>{
   const level=levelOf(p,i),slot=nextSlot.get(level)??0;
   nextSlot.set(level,slot+1);
   const az=66+phase+(level%2)*11+slot*360/counts.get(level)!;
   const t=az*Math.PI/180;
   const x=field.width*.325*Math.cos(t),y=field.depth*.325*Math.sin(t);
   const yaw=az+66+(p.letter==='V'?0:180);
   const rx=p.letter==='L'?87:p.letter==='V'?90:0;
   const ry=p.letter==='U'?85:0;
   // A sideways U's local +Y points inward; its local +X runs downward.
   const rz=p.letter==='U'?az+156:yaw;
   return {...p,x,y,rx,ry,rz,rotationOrder:'ZYX',z:p.z+p.scale*(p.letter==='V'?(p.z+p.scale*.62>field.height/2?0:.12):.24)};
 });
}




export function populatePerimeterLevels(field:AmphitheaterRequest['field'],size:number,seed:number,spacing:number,quantity:number):AmphitheaterSource[]{
 const levels=Math.min(4,Math.floor((field.height-size*1.13)/spacing)+1);
 if(levels<1||!Number.isSafeInteger(quantity)||quantity<2*levels)throw Error('Provide at least two letters per occupied level ('+2*levels+' for this field).');
 let state=seed>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const counts=Array<number>(levels).fill(2);
 const reservePier=quantity>2*levels;
 for(let i=2*levels;i<quantity-Number(reservePier);i++){
   const eligible=counts.map((_,index)=>index).filter(j=>counts[j]<=Math.min(...counts)+1);
   counts[eligible[Math.floor(random()*eligible.length)]]++;
 }
 if(quantity-Number(reservePier)>2*levels&&levels>1&&counts.every(n=>n===counts[0])){counts[0]--;counts[1]++;}
 const source:AmphitheaterSource[]=[];
 const phase=random()*360;
 for(let level=0;level<levels;level++){
   const count=counts[level],shift=Math.floor(random()*3),offset=random()*28;
   for(let slot=0;slot<count;slot++){
     const letter=(['L','U','V'] as const)[(slot+shift)%3];
     const az=phase+360*slot/count+offset,angle=az*Math.PI/180;
     const scale=size/.92,base=size*.28+level*spacing-field.height/2;
     const vz=base+size*.35;
     source.push({letter,x:Math.min(field.width*.325,size)*Math.cos(angle),y:Math.min(field.depth*.325,size)*Math.sin(angle),
       z:letter==='V'?vz+(vz+scale*.62>field.height/2?0:.12*scale):base+.24*scale,
       rx:letter==='L'?87:letter==='V'?90:0,ry:letter==='U'?85:0,rz:az+66+({L:180,U:90,V:0}[letter]),
       rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:level,lift:(['lower','middle','top','top'] as const)[level],
       architecturalRole:letter==='L'?'terrace':'perimeter'});
   }
 }
 const pierLevel=Math.min(2,levels-1);
 const ring=source.filter(p=>p.levelIndex===pierLevel);
 const anchor=ring.find(p=>p.letter==='V')??ring[0];
 const corner={...anchor,letter:'L' as const,rx:0,ry:0,rz:anchor.rz+60,
   z:Math.min(field.height/2-size*.1,anchor.z+size*.45),architecturalRole:'terrace' as const};
 if(reservePier)source.push(corner);
 else source[source.indexOf(anchor)]=corner;
 return source;
}
