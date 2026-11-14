import * as THREE from 'three';
import {OBJExporter} from 'three/examples/jsm/exporters/OBJExporter.js';
import type {AmphitheaterResult,ProofMesh} from './amphitheaterInteractiveTypes';

export const PRESENTATION_COLORS={letters:'#D6AD4F',form:'#F7F6F5',rules:'#71BEDA'} as const;
export type PlateView='letters'|'form'|'orientation'|'generation';
export type ExportView=PlateView|'board'|'visibility';
export const PLATE_LABELS:Record<ExportView,string>={
  letters:'Original Letters',form:'Architectural Form',orientation:'Orientation Rules',
  generation:'Generation Rules',visibility:'Atrium Sightlines',board:'Four-view Board'
};
export function meshGeometry(mesh:ProofMesh){
  if(!mesh.positions.length||mesh.positions.length%3||!mesh.indices.length||mesh.indices.length%3||
    mesh.positions.some(value=>!Number.isFinite(value))||
    mesh.indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=mesh.positions.length/3)){
    throw Error('The saved mesh contains invalid vertices or faces.');
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));
  geometry.setIndex(mesh.indices);
  return geometry;
}
export function studyOBJ(result:AmphitheaterResult,kind:'letters'|'form'){
  const group=new THREE.Group(),geometries:THREE.BufferGeometry[]=[];
  try{
    const items=kind==='form'?[{id:'architecture',mesh:result.architecture}]:result.letters;
    for(const item of items){
      const geometry=meshGeometry(item.mesh);
      geometries.push(geometry);
      const mesh=new THREE.Mesh(geometry);
      mesh.name=item.id;group.add(mesh);
    }
    return '# LUV study '+result.id+'\n# Units: feet. Coordinates: X/Y plan, Z up.\n'+new OBJExporter().parse(group);
  }finally{geometries.forEach(geometry=>geometry.dispose());group.traverse(object=>{if(object instanceof THREE.Mesh){for(const material of [object.material].flat())material.dispose();}});}
}
export function downloadStudyBlob(blob:Blob,filename:string){
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** Replace the browser's default pixel-density chunk with the requested print density. */
export async function pngWithDpi(blob:Blob,dpi=300){
  const input=new Uint8Array(await blob.arrayBuffer());
  const chunks:Uint8Array[]=[input.slice(0,8)];
  const payload=new Uint8Array(13),data=new DataView(payload.buffer);
  payload.set([112,72,89,115]);
  const pixelsPerMeter=Math.round(dpi/0.0254);
  data.setUint32(4,pixelsPerMeter);data.setUint32(8,pixelsPerMeter);payload[12]=1;
  let crc=0xffffffff;
  for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const density=new Uint8Array(21),view=new DataView(density.buffer);
  view.setUint32(0,9);density.set(payload,4);view.setUint32(17,(crc^0xffffffff)>>>0);
  let offset=8;
  while(offset<input.length){
    const length=new DataView(input.buffer,input.byteOffset+offset,4).getUint32(0);
    const type=String.fromCharCode(...input.slice(offset+4,offset+8));
    if(type!=='pHYs')chunks.push(input.slice(offset,offset+length+12));
    if(type==='IHDR')chunks.push(density);
    offset+=length+12;
  }
  const bytes=new Uint8Array(chunks.reduce((total,chunk)=>total+chunk.length,0));
  let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
  return new Blob([bytes.buffer],{type:'image/png'});
}

export function presentationRules(result:AmphitheaterResult){
  if(result.roomReport)return {
    orientation:['Letters are drawn at their saved positions and rotations.'],
    terraces:['The form view shows the full architectural mesh. The generation view overlays the source letters on the room cutaway when available.']
  };
  const describe=(lift:'lower'|'middle'|'top')=>{
    const sources=result.request.source.filter(p=>p.lift===lift&&(lift!=='middle'||p.architecturalRole==='interior'));
    if(!sources.length)return '';
    const tilts=sources.map(p=>p.rx),low=Math.min(...tilts),high=Math.max(...tilts);
    const tilt=Math.abs(high-low)<.05?low.toFixed(1)+'°':low.toFixed(1)+'° to '+high.toFixed(1)+'°';
    const yaw=[...new Set(sources.map(p=>p.rz.toFixed(0)))].join('° / ')+'°';
    return (lift==='top'?'Upper':lift==='middle'?'Middle interior':'Lower')+' · X '+tilt+' · Z '+yaw;
  };
  const orientation=(['lower','middle','top'] as const).map(describe).filter(Boolean);
  if(result.request.envelopeVersion==='inserted-plate')orientation.splice(0,orientation.length,'L plates and U edge sources: horizontal faces; X/Y tilt 0°.', 'V boundaries: upright faces; X tilt 90°. Z rotation follows each saved source.');
  if(!orientation.length)orientation.push('Source labels show actual saved X tilt and Z plan rotation.');
  orientation.push('X tilt is measured from horizontal; Z turns the letter in plan.');
  const size=result.request.preferredFeet;
  const terraces=result.request.envelopeVersion==='inserted-plate'?['L outlines define .75-ft planar plates with .50-ft edge offset.','2.40-ft geometric links connect source boundaries at each plate elevation.','U channels remain open edge recesses; V upper surfaces define vertical boundary caps.']:result.request.envelopeVersion==='void-field'?[
    'Actual source plan concavities form subtractive volumes along global Z.',
    'Horizontal source-derived floors remain around the protected void network.',
    result.request.voidField?.facadeMode==='face-normal'?'Extract exterior source boundaries; sweep along the negative source-face normal to support Z.':'Extract exterior source boundaries; extend along global Z to support Z.',
    'Source upper surfaces cap the sweep; trim to the field and protected voids.',
    result.request.voidField?.levelCount===4&&result.request.voidField?.facadeMode==='face-normal'?'Automatic upper façades stop at the preceding floor; explicit support Z overrides remain.':'Façades use the saved support elevations; source transformations remain unchanged.',
    result.request.voidField?.facadeMode==='face-normal'?'Neighbor profiles control void taper; exterior façades follow source-face normals.':'Neighbor profiles control void taper; exterior walls follow global Z.'
  ]:result.request.envelopeVersion==='vertical-walls'?[
    'Platforms follow projected letter outlines, offset outward 0.80 ft, with 0.75 ft thickness.',
    'Two stepped bands add '+(size*.075).toFixed(3)+' ft of outward offset per band; vertical steps are capped at '+(size*.12).toFixed(2)+' ft.',
    'Upper/middle bases have up to '+(size*.45).toFixed(2)+' ft depth. Exterior walls extend vertically to their configured support.'
  ]:['Terracing follows the saved envelope operation and original source relationships.'];
  return {orientation,terraces};
}
