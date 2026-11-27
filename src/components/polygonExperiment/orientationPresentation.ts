import * as THREE from 'three';
import type {OrientationResult,OrientationSelection} from './orientationStore';
import type {SiteInput} from './model';
export function cameraContext(result:OrientationResult){return 'luv-experiment-orientation-camera-v2:'+encodeURIComponent(JSON.stringify([result.site.origin==='fixture'?'fixture':'site',result.site.name,result.site.coordinates,result.zoneId]));}
export function meshBounds(result:OrientationResult){const box=new THREE.Box3();for(const component of result.components){const p=component.mesh.positions;for(let i=0;i<p.length;i+=3)box.expandByPoint(new THREE.Vector3(p[i],p[i+1],p[i+2]));}return box;}
export function frameGeometry(result:OrientationResult,preset:string,aspect:number,fov=75){const box=meshBounds(result),target=box.getCenter(new THREE.Vector3()),radius=Math.max(box.getSize(new THREE.Vector3()).length()/2,.1),vertical=THREE.MathUtils.degToRad(fov)/2,horizontal=Math.atan(Math.tan(vertical)*Math.max(aspect,.01)),distance=radius/Math.sin(Math.min(vertical,horizontal))*1.12;const directions:Record<string,number[]>={Perspective:[1,.9,1],Plan:[0,1,0],Elevation:[0,0,1],Side:[1,.001,0],Section:[1,0,0]};const direction=new THREE.Vector3(...directions[preset]??directions.Perspective).normalize();return {position:target.clone().addScaledVector(direction,distance).toArray(),target:target.toArray()};}
export function validCamera(value:unknown):value is {position:number[];target:number[]}{const v=value as {position?:number[];target?:number[]}|null;return !!v&&[v.position,v.target].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))&&new THREE.Vector3(...v.position!).distanceTo(new THREE.Vector3(...v.target!))>.001;}
export function visibilityStatus(view:OrientationSelection,result:OrientationResult|undefined,zones:{id:string;polygon:[number,number][]}[],site:SiteInput|null,loading=false,error='',architectureVisible=false){
 const hidden=(reason:string)=>({visible:false,message:'C1 hidden: '+reason});
 if(loading)return hidden('loading saved orientation and current source.');
 if(error)return hidden(error);
 if(!view.id)return hidden('no saved orientation selected.');
 if(!result)return hidden('selected result is missing from orientation storage. Restore its C1 geometry backup.');
 if(!view.siteVisible)return hidden('Show in shared Site viewport is off.');
 if(result.site.origin==='fixture')return hidden('fixture results are confined to the C1 viewer.');
 const current=zones.find(z=>z.id===result.zoneId),saved=result.site.zones.find(z=>z.id===result.zoneId);
 if(!current)return hidden('source zone '+result.zoneId+' is unavailable in this Site project.');
 if(!saved)return hidden('saved result has no source-zone snapshot.');
 if(JSON.stringify(current.polygon)!==JSON.stringify(saved.polygon))return hidden('polygon mismatch: current boundary differs from the saved source. Original result retained.');
 if(!site)return hidden('current Site source metadata is unavailable.');
 const currentZone=site.zones.find(z=>z.id===result.zoneId);
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 if(!currentZone||!same(currentZone.polygon,saved.polygon)||!same(currentZone.holes,saved.holes))return hidden('stale source revision: polygon boundary or holes changed. Saved geometry was not modified.');
 const coordinateFrame=(coordinates:SiteInput['coordinates'])=>Object.fromEntries(Object.entries(coordinates).filter(([key])=>key!=='unitAssumption'));
 if(!same(coordinateFrame(site.coordinates),coordinateFrame(result.site.coordinates)))return hidden('stale source revision: coordinate frame or unit conversion changed. Saved geometry was not modified.');
 if(!same(site.exclusions,result.site.exclusions)||!same(site.corridors,result.site.corridors)||!same(site.reservedAreas,result.site.reservedAreas))return hidden('stale source revision: protection geometry changed. Saved geometry was not modified.');
 if(site.name!==result.site.name)return hidden('stale source revision: Site project identity changed. Saved geometry was not modified.');
 if(site.coordinates.unitAssumption!=='confirmed')return hidden('site unit confirmation is unresolved; coordinate frame, polygon and protection geometry match. Verify the loaded model, then use Confirm site units. No rescaling or regeneration is required for this metadata-only mismatch.');
 if(!same(site.coordinates,result.site.coordinates))return hidden('saved source unit-confirmation metadata differs. Review the saved provenance before sharing this result.');
 if(!view.letters&&!view.organizing&&!view.boundaries&&!architectureVisible)return hidden('all C1 display layers are off.');
 return {visible:true,message:'C1: '+(view.letters?result.components.length+' saved letter meshes':architectureVisible?'saved Rule B architecture':'letters hidden; overlays only')+' in shared Site viewport. '+(site.revision!==result.site.revision?'Source revision differs; exact boundary, coordinate and protection checks match.':'Source revision and polygon match.')};
}

