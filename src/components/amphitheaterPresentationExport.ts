import * as THREE from 'three';
import {OBJExporter} from 'three/examples/jsm/exporters/OBJExporter.js';
import type {AmphitheaterResult,ProofMesh} from './amphitheaterInteractiveTypes';

export const PRESENTATION_COLORS={letters:'#D6AD4F',form:'#F7F6F5',rules:'#71BEDA'} as const;
export type PlateView='letters'|'form'|'orientation'|'generation';
export type ExportView=PlateView|'board';
export const PLATE_LABELS:Record<ExportView,string>={
  letters:'Original Letters',form:'Architectural Form',orientation:'Orientation Rules',
  generation:'Generation Rules',board:'Four-view Board'
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
    const items=kind==='form'?
      [{id:'architecture',mesh:result.architecture},...(!(result.request.workspaceTypology==='open-hall-workspace'&&result.request.openHall?.joinWalls)&&result.perimeterWalls?.indices.length?[{id:'perimeter-walls',mesh:result.perimeterWalls}]:[])]:
      result.letters;
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

export type WorkspaceLessonRow={
  title:string;
  lines:string[];
  /** Which saved meshes to emphasize in the board thumbnail. */
  focus:'ground-letters'|'mezz-letters'|'ground-plate'|'mezzanine'|'supports';
};

export function workspaceRuleStageTitle(result:AmphitheaterResult,view:'orientation'|'generation'){
  const typology=result.request.workspaceTypology;
  const detailed=typology==='open-hall-workspace'||typology==='flat-deep-plan-plate';
  if(view==='orientation')return detailed?'LETTER ARRANGEMENT':'ORIENTATION RULES';
  return detailed?'ARCHITECTURAL GENERATION':'GENERATION RULES';
}

/** Stepped-Amphitheater-style teaching rows for workspace boards. */
export function workspacePresentationLessons(result:AmphitheaterResult):{
  orientation:WorkspaceLessonRow[];
  generation:WorkspaceLessonRow[];
}{
  const typology=result.request.workspaceTypology;
  const faces=result.request.openHall?.mezzanineFaces??2;
  const wrap=faces===2?'an L along two faces':faces===3?'a three-sided channel':'the full perimeter';
  if(typology==='open-hall-workspace'){
    return {
      orientation:[
        {
          title:'GROUND LETTERS',
          focus:'ground-letters',
          lines:[
            'Four L guides mark the square floor.',
            'Their outer tips set the corners.',
            'The smaller field span limits the square.',
          ],
        },
        {
          title:'MEZZANINE LETTERS',
          focus:'mezz-letters',
          lines:[
            'L guides mark the upper band corners.',
            `That band wraps ${wrap}.`,
            'Every guide matches one plan slot.',
          ],
        },
      ],
      generation:[
        {
          title:'GROUND PLATE',
          focus:'ground-plate',
          lines:[
            'Build a continuous square floor.',
            'Wall depth follows the thickness setting.',
            faces===2?'Entry spans the south and west edges.':'Entry opens along the south edge.',
          ],
        },
        {
          title:'MEZZANINE WRAP',
          focus:'mezzanine',
          lines:[
            'Raise a band at mid-height.',
            'Leave a 20–40% opening over the hall.',
            'Keep bands at least 10 ft wide.',
          ],
        },
        {
          title:'SUPPORTS AND ROOF',
          focus:'supports',
          lines:[
            'Stand L columns on an equal XY grid.',
            'A center node also receives a pier.',
            'Use a roof L for one skylight per bay.',
          ],
        },
      ],
    };
  }
  return {
      orientation:[
        {title:'GROUND GUIDES',focus:'ground-letters',lines:[
          'Four L tips set the ground corners.',
          'The field leaves a 2 ft margin per edge.',
          'Grid nodes receive column L guides.',
        ]},
        {title:'MEZZANINE GUIDES',focus:'mezz-letters',lines:[
          'Four L tips set the mezzanine corners.',
          'It spans the full length and half the width.',
          'Wall Ls trace bands and stepped ends.',
        ]},
      ],
      generation:[
        {title:'GROUND PLATE',focus:'ground-plate',lines:[
          'Build one continuous rectangular slab.',
          'Four 2 ft bands line the long edges.',
          'Stepped panels close parts of the ends.',
        ]},
        {title:'MEZZANINE',focus:'mezzanine',lines:[
          'Set the mezzanine at mid-height.',
          'The selected thickness applies to all slabs.',
          'Require more than 8 ft below the mezzanine.',
        ]},
        {title:'SUPPORTS AND ROOF',focus:'supports',lines:[
          'Fill the L pocket at each grid node.',
          'The solid roof follows the floor footprint.',
          'Check the final union and field fit.',
        ]},
      ],
  };
}
