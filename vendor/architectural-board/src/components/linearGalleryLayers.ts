import {populateVariableGallery,galleryCapacity,GalleryCapacityError} from './linearGalleryVariablePopulation';
import * as THREE from 'three';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';
import type {GallerySettings} from './linearGalleryPopulation';

export function layeredGallery(count:number,f:AmphitheaterRequest['field'],size:number,s:GallerySettings){
 if(!Number.isSafeInteger(count)||count<3)throw Error('Enter an integer population of at least three letters for L/U/V roles.');
 const capacity=galleryCapacity(f,size,s);if(count>capacity.availableLetters)throw new GalleryCapacityError(count,capacity);
 const regression=s.arrangementMode!=='defined-levels'&&count===9&&f.width===40&&f.depth===40&&f.height===60&&size===13&&JSON.stringify(s.separations??[5,10,15])==='[5,10,15]'&&JSON.stringify(s.path)==='[[-8,-4],[0,4],[8,-4]]';
 if(!regression)return populateVariableGallery(count,f,size,s);
 const intervals=s.separations??[5,10,15];
 if(intervals.length!==3||intervals.some(v=>![5,10,15].includes(v)))throw Error('Select three source-surface separations of 5, 10 or 15 ft.');
 const counts=[3,2,2,2],source:AmphitheaterSource[]=[],stations:{segment:number;variation:number;stagger:number;role:string;jointOf:number[];zone:string}[]=[];
 let state=s.seed>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const lengths=s.path.slice(1).map((b,i)=>Math.hypot(b[0]-s.path[i][0],b[1]-s.path[i][1])),total=lengths.reduce((a,b)=>a+b,0);
 function at(distance:number){let j=0;while(j<lengths.length-1&&distance>lengths[j])distance-=lengths[j++];const a=s.path[j],b=s.path[j+1],t=distance/lengths[j];return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,heading:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI,segment:j};}
 let previousTop=0,previous:number[]=[];
 for(let level=0;level<counts.length;level++){
  const ids:number[]=[],bottom=level===3?f.height/2:level===0?3:previousTop+intervals[level-1];
  // The last row starts a separate organization; insufficient fields reject explicitly.
  if(level===3&&bottom<f.height/2)throw Error('Selected intervals leave the upper source row below the mid-height transition.');
  if(level<3&&bottom>=f.height/2)throw Error('Selected intervals place a lower source row above the transition.');
  let top=bottom;
  for(let rank=0;rank<counts[level];rank++){
   const id=source.length,letter=(['L','U','V'] as const)[id%3],st=at(total*(rank+.5)/counts[level]);
   const pair=level&&previous.length>1?[previous[Math.min(rank,previous.length-2)],previous[Math.min(rank+1,previous.length-1)]]:[];
   let x=st.x,y=st.y;
   if(pair.length){x=(source[pair[0]].x+source[pair[1]].x)/2;y=(source[pair[0]].y+source[pair[1]].y)/2;}
   // Distinct upper polygon and unfilled perimeter ends, retaining path station order.
   const stagger=(rank%2?1:-1)*size*.12;
   x+=rank===1&&previous.length===2?size*.32:0;
   y+=stagger+(level===3?size*.24:level*size*.025);
   const variation=(random()*2-1)*10,rz=st.heading+variation+(level===3?25:0);
   const scale=size/.92,g=getLetterVolumeGeometry(letter,12);g.computeBoundingBox();
   const local=g.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(rz)).scale(new THREE.Vector3(scale,scale,scale)));
   const letterBottom=level===3&&rank>0?top+intervals[2]:bottom;
   const z=letterBottom-local.min.z-f.height/2;
   const p:AmphitheaterSource={letter,x,y,z,rx:0,ry:0,rz,rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:level===3?3+rank:level,architecturalRole:letter==='L'?'terrace':letter==='U'?'interior':'perimeter'};
   const bounds=local.clone().translate(new THREE.Vector3(x,y,z+f.height/2));
   if(bounds.min.x < -f.width/2||bounds.max.x>f.width/2||bounds.min.y < -f.depth/2||bounds.max.y>f.depth/2||bounds.max.z>f.height)throw Error('New polygonal source '+(id+1)+' exceeds the selection field; dimensions and size retained.');
   if(level<3&&bounds.max.z>f.height/2)throw Error('Lower source crosses the transition; selected gaps and size conflict.');
   top=Math.max(top,bounds.max.z);ids.push(id);source.push(p);
   stations.push({segment:st.segment,variation,stagger,role:letter==='L'?'circulation edge':letter==='U'?'occupation pocket':'angular transition',jointOf:pair,zone:level===3?'upper':'lower'});
  }
  previous=ids;previousTop=top;
 }
 return {source,stations,settings:s};
}
