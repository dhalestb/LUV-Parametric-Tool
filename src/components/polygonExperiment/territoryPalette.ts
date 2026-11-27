import type {Typology} from './model';

const fills={
  'linear-edge-gallery':'#073C52',
  'inserted-plate':'#9BD5E4',
  'vertical-walls':'#0E6F92',
  'room-within-volume':'#F7F6F5',
  'void-field':'#1293C2',
  'vertical-void-lobby':'#B9BEC6',
  'compressed-sequential-lobby':'#095775',
  'topographic-ground-field-lobby':'#71BEDA',
  'open-hall-workspace':'#43A9CF',
  'void-edge-workspace':'#095775',
  'flat-deep-plan-plate':'#D5AC50',
  'linear-gallery-lobby':'#43A9CF',
} satisfies Record<Typology,string>;

export function territoryColor(id:string){
  return Object.hasOwn(fills,id)?fills[id as Typology]:'#B9BEC6';
}

// Use the higher-contrast end of the project palette for architectural linework.
export function territoryInk(fill:string){
  return ['#073C52','#095775','#0E6F92'].includes(fill)?'#F7F6F5':'#073C52';
}
