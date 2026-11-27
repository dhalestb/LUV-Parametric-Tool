import * as THREE from 'three';
import reference from './insertedPlateStudy135.json';
import type {AmphitheaterSource,AmphitheaterRequest} from '../../../vendor/gathering-preserved/src/components/amphitheaterInteractiveTypes';
import {getLetterVolumeGeometry} from '../../../vendor/gathering-preserved/src/components/letterGeometry3d';
import {populatePerimeterLevels,suggestedPerimeterPlateCount} from '../../../vendor/gathering-preserved/src/components/insertedPlatePopulation';

export const LEGACY_PLATE_PLACEMENT_REVISION='study135-cell-placement-v1';
export const CLOSED_PLATE_PLACEMENT_REVISION_V2='study135-closed-cell-placement-v2';
export const PLATE_PLACEMENT_REVISION='study135-closed-cell-placement-v3';
export const PLATE_REFERENCE_ID=reference.studyId;
export function plateLocalBounds(p:AmphitheaterSource){
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion().setFromEuler(new THREE.Euler(...[p.rx,p.ry,p.rz].map(THREE.MathUtils.degToRad) as [number,number,number],p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 const geometry=getLetterVolumeGeometry(p.letter,12),vertices=geometry.getAttribute('position'),bounds=new THREE.Box3(),point=new THREE.Vector3();
 for(let i=0;i<vertices.count;i++)bounds.expandByPoint(point.fromBufferAttribute(vertices,i).applyMatrix4(matrix));
 return bounds;
}
/** Sample the approved 3/4/4/3 source relationships; only pose placement changes.
 * Custom quantities retain the existing native sampler. No architecture is copied. */
export function populateStudy135Plate(field:AmphitheaterRequest['field'],size:number,seed:number,spacing:number,quantity:number):AmphitheaterSource[]{
 const expected=suggestedPerimeterPlateCount(field,size,spacing);
 if(quantity!==expected)return populatePerimeterLevels(field,size,seed,spacing,quantity);
 const levels=Math.min(4,Math.floor((field.height-size*1.13)/spacing)+1),rows=levels===4?[0,1,2,3]:levels===3?[0,1,3]:levels===2?[0,3]:[0];
 // A seed rotates the complete approved arrangement, retaining inter-level joints.
 const turn=seed===2923755707?0:(seed>>>0)%360,angle=THREE.MathUtils.degToRad(turn),scale=size/.92;
 const radiusX=Math.min(field.width*.2,size),radiusY=Math.min(field.depth*.2,size);
 const result:AmphitheaterSource[]=[];
 const xy=(p:{x:number;y:number})=>({x:(p.x*Math.cos(angle)-p.y*Math.sin(angle))*radiusX/reference.preferredFeet,y:(p.x*Math.sin(angle)+p.y*Math.cos(angle))*radiusY/reference.preferredFeet});
 for(const [level,index]of rows.entries())for(const p of reference.source.filter(p=>p.levelIndex===index&&!(p.letter==='L'&&p.rx===0&&p.ry===0))){
  const base=size*.28+level*spacing-field.height/2,vz=base+size*.35;
  result.push({...p,...xy(p),letter:p.letter as AmphitheaterSource['letter'],architecturalRole:p.architecturalRole as AmphitheaterSource['architecturalRole'],rotationOrder:'ZYX',rz:p.rz+turn,scale,z:p.letter==='V'?vz+(vz+scale*.62>field.height/2?0:.12*scale):base+.24*scale,levelIndex:level,lift:level===0?'lower':level===1?'middle':'top'});
 }
 const capLevel=Math.min(2,levels-1),anchor=result.find(p=>p.levelIndex===capLevel&&p.letter==='V')!;
 // The native first pass measures the actual pier top. The server then seats
 // this cap on that bearing, as in Study 135, and validates the final poses.
 const pose:AmphitheaterSource={...anchor,letter:'L',rx:0,ry:0,rz:anchor.rz+60,z:anchor.z+size*.45,architecturalRole:'terrace'};
 const box=plateLocalBounds(pose);pose.z=THREE.MathUtils.clamp(pose.z,-field.height/2-box.min.z+.000001,field.height/2-box.max.z-.000001);result.push(pose);
 return result;
}
/** Common XY translation factor is bounded by actual rotated glyph vertices.
 * Letter size, rotations, vertical levels and relative center directions stay fixed. */
export function plateCellExpansionLimit(source:AmphitheaterSource[],field:AmphitheaterRequest['field']){
 let factor=Infinity;
 for(const p of source){const b=plateLocalBounds(p);for(const [axis,extent]of [['x',field.width],['y',field.depth]] as const){
  if(p[axis]>1e-9)factor=Math.min(factor,(extent/2-b.max[axis]-.001)/p[axis]);
  else if(p[axis]<-1e-9)factor=Math.min(factor,(-extent/2-b.min[axis]+.001)/p[axis]);
 }}
 if(!Number.isFinite(factor)||factor<=1.0001)throw Error('No clear plate landing: no outward placement fits these letters in the selected cell.');
 return factor;
}
export function expandPlateCenters(source:AmphitheaterSource[],factor:number){return source.map(p=>({...p,x:p.x*factor,y:p.y*factor}));}
