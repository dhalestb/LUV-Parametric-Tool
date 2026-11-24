import * as THREE from 'three';
import {getLetterShape,getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';
import type {GallerySettings} from './linearGalleryPopulation';
type Field=AmphitheaterRequest['field'];
type Point=[number,number];
const ROLES={L:'circulation edge',U:'occupation pocket',V:'angular transition'};
export type GalleryCapacity={availableLetters:number;stationPitch:number;pathLength:number;sourceThickness:number;layers:{level:number;zone:'lower'|'upper';bottom:number;top:number;capacity:number;zoneRank:number;nominalZ?:number;allowedOffsets?:(-4|0|4)[]}[];field:Field;preferredFeet:number;scope:string};
function dimensions(size:number){
 if(!Number.isFinite(size)||size<=0)throw Error('Preferred gallery letter size must be positive.');
 const scale=size/.92;
 const boxes=(['L','U','V'] as const).map(letter=>{const g=getLetterVolumeGeometry(letter,12);g.computeBoundingBox();return g.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeScale(scale,scale,scale));});
 return {scale,thickness:Math.max(...boxes.map(b=>b.max.z-b.min.z)),pitch:Math.max(3,Math.min(...boxes.map(b=>Math.min(b.max.x-b.min.x,b.max.y-b.min.y)))*.5)};
}
function pathData(s:GallerySettings){
 const lengths=s.path.slice(1).map((p,i)=>Math.hypot(p[0]-s.path[i][0],p[1]-s.path[i][1])),total=lengths.reduce((a,b)=>a+b,0);
 function at(distance:number){let j=0;while(j<lengths.length-1&&distance>lengths[j])distance-=lengths[j++];const a=s.path[j],b=s.path[j+1],t=distance/lengths[j],heading=Math.atan2(b[1]-a[1],b[0]-a[0]);return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,heading,segment:j};}
 function station(p:Point){let best=0,distance=Infinity,cumulative=0;for(let i=0;i<lengths.length;i++){const a=s.path[i],b=s.path[i+1],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/lengths[i]**2)),d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d<distance){distance=d;best=cumulative+t*lengths[i];}cumulative+=lengths[i];}return best;}
 return {total,at,station};
}
function offset(zone:'lower'|'upper',rank:number,size:number){return (zone==='upper'?size*.16:0)+(rank%2?1:-1)*size*.025;}
function fits(f:Field,size:number,s:GallerySettings,zone:'lower'|'upper',rank:number,count:number){
 const {scale}=dimensions(size),path=pathData(s);
 for(let i=0;i<count;i++){
  const pos=path.at(count===1?path.total/2:path.total*i/(count-1)),shift=offset(zone,rank,size);
  const x=pos.x-Math.sin(pos.heading)*shift,y=pos.y+Math.cos(pos.heading)*shift;
  for(const letter of ['L','U','V'] as const)for(const variation of [-10,0,10]){
   const g=getLetterVolumeGeometry(letter,12),rz=pos.heading+(variation+(zone==='upper'?20:0))*Math.PI/180;
   const box=g.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(rz).scale(new THREE.Vector3(scale,scale,scale))).translate(new THREE.Vector3(x,y,0));
   if(box.min.x < -f.width/2||box.max.x>f.width/2||box.min.y < -f.depth/2||box.max.y>f.depth/2)return false;
  }
 }
 return true;
}
export function galleryCapacity(f:Field,size:number,s:GallerySettings):GalleryCapacity{
 if(![f.width,f.depth,f.height].every(v=>Number.isFinite(v)&&v>0))throw Error('Gallery field dimensions must be positive.');
 const gaps=s.separations??[5,10,15];if(s.arrangementMode!=='defined-levels'&&gaps.some(g=>![5,10,15].includes(g)))throw Error('Gallery source gaps must be 5, 10 or 15 ft.');
 const {thickness,pitch}=dimensions(size),path=pathData(s),mid=f.height/2,layers:GalleryCapacity['layers']=[];
 if(!Number.isFinite(path.total)||path.total<=0)throw Error('Gallery needs a finite nonzero ordered path.');
 const stationLimit=Math.floor(path.total/pitch)+1;
 for(const zone of ['lower','upper'] as const){
  let bottom=zone==='lower'?(s.arrangementMode==='defined-levels'?4.5:Math.min(3,mid*.1)):mid,rank=0;
  while(s.arrangementMode==='defined-levels'?bottom<(zone==='lower'?mid:f.height):bottom+thickness<=(zone==='lower'?mid:f.height)+1e-7){
   const legalOffsets=s.arrangementMode==='defined-levels'?([-4,0,4] as const).filter(o=>bottom+o>=(zone==='lower'?0:mid)&&bottom+o+thickness<=(zone==='lower'?mid:f.height)):undefined;
   let capacity=stationLimit;
   while(capacity>0&&!fits(f,size,s,zone,rank,capacity))capacity--;
   if(legalOffsets?.length===0)capacity=0;
   layers.push({level:layers.length,zone,bottom,top:bottom+thickness,capacity,zoneRank:rank,...(legalOffsets?{nominalZ:bottom,allowedOffsets:legalOffsets}:{})});
   bottom+=s.arrangementMode==='defined-levels'?(s.nominalSpacing??13):thickness+(zone==='lower'?gaps[rank%2]:gaps[2]);rank++;
  }
 }
 return {availableLetters:layers.reduce((n,l)=>n+l.capacity,0),stationPitch:pitch,pathLength:path.total,sourceThickness:thickness,layers,field:{...f},preferredFeet:size,scope:'Capacity of this ordered path with native bounds inside the field, at least 3-ft station pitch and half the shortest native planar span retained between stations; not an occupancy certification.'};
}
export class GalleryCapacityError extends Error{
 readonly code='GALLERY_CAPACITY';
 constructor(public requested:number,public capacity:GalleryCapacity){super('Gallery capacity conflict: requested '+requested+' letters at '+capacity.preferredFeet+' ft in '+[capacity.field.width,capacity.field.depth,capacity.field.height].join(' x ')+' ft; this ordered-path layout supports '+capacity.availableLetters+' letters across '+capacity.layers.filter(l=>l.capacity>0).length+' layers (capacities '+capacity.layers.map(l=>l.capacity).join('/')+'). Native field clearance, source thickness, available reference layers and station pitch '+capacity.stationPitch.toFixed(2)+' ft control this capacity. Try '+(capacity.availableLetters>=3?capacity.availableLetters+' letters, a larger selection field/path, or smaller preferred letters':'a larger selection field/path or smaller preferred letters')+'. Existing edited sources are not changed.');this.name='GalleryCapacityError';}
}
function closestJoint(a:AmphitheaterSource,b:AmphitheaterSource):Point{
 function edges(p:AmphitheaterSource){const shape=getLetterShape(p.letter),c=new THREE.Box2().setFromPoints(shape.getPoints(32)).getCenter(new THREE.Vector2()),angle=p.rz*Math.PI/180;const point=(v:THREE.Vector2)=>new THREE.Vector2((v.x-c.x)*p.scale,(v.y-c.y)*p.scale).rotateAround(new THREE.Vector2(),angle).add(new THREE.Vector2(p.x,p.y));return shape.curves.filter(c=>c.type==='LineCurve').map(c=>[point(c.getPoint(0)),point(c.getPoint(1))]);}
 let best=Infinity,joint:Point=[(a.x+b.x)/2,(a.y+b.y)/2];
 const project=(p:THREE.Vector2,a:THREE.Vector2,b:THREE.Vector2)=>{const d=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(d)/d.lengthSq()));return a.clone().addScaledVector(d,t);};
 for(const aa of edges(a))for(const bb of edges(b)){const da=aa[1].clone().sub(aa[0]),db=bb[1].clone().sub(bb[0]),delta=bb[0].clone().sub(aa[0]),den=da.cross(db);if(Math.abs(den)>1e-12){const t=delta.cross(db)/den,u=delta.cross(da)/den;if(t>=0&&t<=1&&u>=0&&u<=1){const p=aa[0].clone().addScaledVector(da,t);return [p.x,p.y];}}}
 for(const aa of edges(a))for(const bb of edges(b))for(const [p,q] of [[aa[0],project(aa[0],bb[0],bb[1])],[aa[1],project(aa[1],bb[0],bb[1])],[bb[0],project(bb[0],aa[0],aa[1])],[bb[1],project(bb[1],aa[0],aa[1])]]){const distance=p.distanceToSquared(q);if(distance<best){best=distance;joint=[(p.x+q.x)/2,(p.y+q.y)/2];}}
 return joint;
}
function sideFrames(p:AmphitheaterSource){
 const shape=getLetterShape(p.letter),points=shape.getPoints(32),center=new THREE.Box2().setFromPoints(points).getCenter(new THREE.Vector2());
 const origin=new THREE.Vector2(),position=new THREE.Vector2(p.x,p.y);
 const transform=(v:THREE.Vector2)=>v.sub(center).multiplyScalar(p.scale).rotateAround(origin,p.rz*Math.PI/180).add(position);
 return ({L:[0,1,4,5],U:[0,3],V:[4,5,6]}[p.letter]).map(index=>{
  const curve=shape.curves[index],a=transform(curve.getPoint(0)),b=transform(curve.getPoint(1)),axis=b.clone().sub(a).normalize();
  return {mid:a.clone().lerp(b,.5),normal:new THREE.Vector2(axis.y,-axis.x).multiplyScalar(THREE.ShapeUtils.area(points)>0?1:-1)};
 });
}
function placeAtSetback(p:AmphitheaterSource,parents:AmphitheaterSource[],depth:number,f:Field){
 let best=p,score=Infinity;
 const origin=new THREE.Vector2(p.x,p.y),childSides=sideFrames(p);
 for(const parent of parents)for(const edge of sideFrames(parent))for(const child of childSides){
  const rotation=Math.atan2(child.normal.cross(edge.normal),child.normal.dot(edge.normal));
  const shift=edge.mid.clone().addScaledVector(edge.normal,-depth).sub(child.mid.clone().rotateAround(origin,rotation));
  const cost=shift.lengthSq()+Math.abs(rotation);
  if(cost>=score)continue;
  const candidate={...p,x:p.x+shift.x,y:p.y+shift.y,rz:p.rz+rotation*180/Math.PI};
  const matrix=new THREE.Matrix4().makeRotationZ(candidate.rz*Math.PI/180).scale(new THREE.Vector3(p.scale,p.scale,p.scale)).setPosition(candidate.x,candidate.y,0);
  const box=getLetterVolumeGeometry(p.letter,12).boundingBox!.clone().applyMatrix4(matrix);
  if(box.min.x < -f.width/2 || box.max.x > f.width/2 || box.min.y < -f.depth/2 || box.max.y > f.depth/2)continue;
  best=candidate;score=cost;
 }
 return best;
}
export function populateVariableGallery(count:number,f:Field,size:number,s:GallerySettings){
 if(!Number.isSafeInteger(count)||count<3)throw Error('Supply an integer population of at least three letters for L/U/V roles and two architectural zones.');
 const capacity=galleryCapacity(f,size,s),layers=capacity.layers.filter(l=>l.capacity>0);
 if(count>capacity.availableLetters||!layers.some(l=>l.zone==='lower')||!layers.some(l=>l.zone==='upper'))throw new GalleryCapacityError(count,capacity);
 // Select source rows in both zones, then use remaining rows as quantity warrants.
 const selected=count>=layers.length?[...layers]:layers.filter(l=>l.zoneRank===0);
 for(const layer of layers)if(selected.reduce((n,l)=>n+l.capacity,0)<count&&!selected.includes(layer))selected.push(layer);
 selected.sort((a,b)=>a.level-b.level);
 // Include intermediate rows to retain each specified surface relationship.
 for(const zone of ['lower','upper'] as const){const max=Math.max(...selected.filter(l=>l.zone===zone).map(l=>l.zoneRank));for(const layer of layers)if(layer.zone===zone&&layer.zoneRank<max&&!selected.includes(layer))selected.push(layer);}
 selected.sort((a,b)=>a.level-b.level);
 const counts=selected.map(()=>1);let remaining=count-counts.length;
 while(remaining>0){let best=-1,score=-Infinity;selected.forEach((layer,i)=>{const priority=(layer.capacity-counts[i])/(counts[i]+1)+(layer.zone==='lower'?.05:0)-i*.001;if(counts[i]<layer.capacity&&priority>score){score=priority;best=i;}});if(best<0)throw new GalleryCapacityError(count,capacity);counts[best]++;remaining--;}
 const source:AmphitheaterSource[]=[],stations:{segment:number;variation:number;stagger:number;role:string;jointOf:number[];joint?:Point;zone:string;along:number}[]=[];
 const path=pathData(s),{scale}=dimensions(size);let state=s.seed>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 let previous:number[]=[];
 for(let row=0;row<selected.length;row++){
  const layer=selected[row],n=counts[row],ids:number[]=[],joints=previous.slice(1).map((id,i)=>({ids:[previous[i],id],point:closestJoint(source[previous[i]],source[id])}));
  let previousAlong=-capacity.stationPitch;
  for(let rank=0;rank<n;rank++){
   const letter=(['L','U','V'] as const)[source.length%3],nominal=n===1?path.total/2:path.total*rank/(n-1);
   const joint=joints.slice().sort((a,b)=>Math.abs(path.station(a.point)-nominal)-Math.abs(path.station(b.point)-nominal))[0];
   const target=joint?path.station(joint.point):nominal,along=Math.max(previousAlong+capacity.stationPitch,Math.min(path.total-capacity.stationPitch*(n-1-rank),nominal+Math.max(-capacity.stationPitch*.1,Math.min(capacity.stationPitch*.1,target-nominal))));
   const pos=path.at(along),variation=(random()*2-1)*10,rz=pos.heading*180/Math.PI+variation+(layer.zone==='upper'?20:0),stagger=offset(layer.zone,layer.zoneRank,size);
   const x=pos.x-Math.sin(pos.heading)*stagger,y=pos.y+Math.cos(pos.heading)*stagger,g=getLetterVolumeGeometry(letter,12);
   const box=g.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(rz*Math.PI/180).scale(new THREE.Vector3(scale,scale,scale)));
   if(box.min.x+x < -f.width/2||box.max.x+x>f.width/2||box.min.y+y < -f.depth/2||box.max.y+y>f.depth/2)throw new GalleryCapacityError(count,capacity);
   const options=layer.allowedOffsets,chosenOffset=options?(layer.zone==='upper'&&layer.zoneRank===0&&rank===0?0:options[(rank+(s.seed>>>0)+layer.level)%options.length]):undefined;
   const actualBottom=layer.bottom+(chosenOffset??0);
   const p:AmphitheaterSource={...(options?{galleryNominalZ:layer.nominalZ,galleryElevationOffset:chosenOffset,galleryZone:layer.zone}:{}),letter,x,y,z:actualBottom-box.min.z-f.height/2,rx:0,ry:0,rz,rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:row,architecturalRole:letter==='L'?'terrace':letter==='U'?'interior':'perimeter'};
   const placed=s.architectureVersion==='legacy-v2' ? p : placeAtSetback(p,previous.map(i=>source[i]),[1,5,10][((s.seed>>>0)+rank+row)%3],f);
   ids.push(source.length);source.push(placed);stations.push({segment:pos.segment,variation,stagger,role:ROLES[letter],jointOf:joint?.ids??[],joint:joint?.point,zone:layer.zone,along});previousAlong=along;
  }
  previous=ids;
 }
 return {source,stations,settings:{...s,levels:selected.length},capacity};
}
