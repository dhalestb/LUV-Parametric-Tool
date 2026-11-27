import * as THREE from 'three';
import {getLetterShape} from '../../vendor/gathering-preserved/src/components/letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterResult,AmphitheaterSource} from '../../vendor/gathering-preserved/src/components/amphitheaterInteractiveTypes';
import {plateLocalBounds,PLATE_PLACEMENT_REVISION,CLOSED_PLATE_PLACEMENT_REVISION_V2,PLATE_REFERENCE_ID} from '../components/gathering-recovery/insertedPlateCellPlacement';
type Point=[number,number];
type Placement={revision:string;validationSHA256?:string;referenceStudyId?:string;requestedTurn?:number;turn?:number;translation?:Point;radiusRatio?:number;checks?:object[]};
export function convexPlanHull(points:Point[]):Point[]{
 const cross=(o:Point,a:Point,b:Point)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lower:Point[]=[],upper:Point[]=[];
 for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
 for(const p of sorted.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
/** The same outward-face tests as the preserved native edge envelope. */
export function plateFacesCell(p:AmphitheaterSource,field:AmphitheaterRequest['field']){
 if(p.letter==='V'||p.letter==='L'&&p.rx===0&&p.ry===0)return true;
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),new THREE.Quaternion().setFromEuler(new THREE.Euler(...[p.rx,p.ry,p.rz].map(THREE.MathUtils.degToRad) as [number,number,number],p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 const shape=getLetterShape(p.letter),center=new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2()),world=(q:THREE.Vector2)=>new THREE.Vector3(q.x-center.x,q.y-center.y,0).applyMatrix4(matrix);
 const xy=[p.x,p.y],faces=[{axis:0,sign:1,limit:field.width/2},{axis:0,sign:-1,limit:field.width/2},{axis:1,sign:1,limit:field.depth/2},{axis:1,sign:-1,limit:field.depth/2}],face=faces.sort((a,b)=>(a.limit-a.sign*xy[a.axis])-(b.limit-b.sign*xy[b.axis]))[0],gap=(q:THREE.Vector3)=>face.limit-face.sign*q.getComponent(face.axis);
 if(p.letter==='L')return gap(world(shape.curves[5].getPoint(.5)))<=gap(world(shape.curves[3].getPoint(.5)));
 const bend=new THREE.CurvePath<THREE.Vector2>();bend.add(shape.curves[1]);bend.add(shape.curves[2]);const inner=[0,1].map(t=>world(shape.curves[5].getPoint(t)));
 return Math.abs(inner[0].z-inner[1].z)<=.01&&gap(world(bend.getPointAt(.5)))<=gap(inner[0]);
}
export function closedPlacementCandidates(measured:AmphitheaterResult,field:AmphitheaterRequest['field'],preferredTurn:number){
 const points:Point[]=[];for(const mesh of [measured.architecture,...measured.letters.map(l=>l.mesh)])for(let i=0;i<mesh.positions.length;i+=3)points.push([mesh.positions[i],mesh.positions[i+1]]);
 const hull=convexPlanHull(points),candidates:{turn:number;translation:Point;source:AmphitheaterSource[];distance:number}[]=[];
 // A rigid rotation/translation fits the closed walls as well as the letters.
 // No glyph or generated architectural mesh is stretched to fill the cell.
 for(let turn=0;turn<360;turn++){
  const angle=THREE.MathUtils.degToRad(turn),c=Math.cos(angle),s=Math.sin(angle),rotated=hull.map(([x,y])=>[c*x-s*y,s*x+c*y]);
  const ranges=[field.width,field.depth].map((extent,i)=>[-extent/2-Math.min(...rotated.map(p=>p[i]))+.1,extent/2-Math.max(...rotated.map(p=>p[i]))-.1]);
  if(ranges.some(([a,b])=>a>b))continue;
  const base=measured.request.source.map(p=>({...p,x:c*p.x-s*p.y,y:s*p.x+c*p.y,rz:p.rz+turn}));
  const choices=ranges.map(([a,b])=>[Math.max(a,Math.min(b,0)),(a+b)/2,a,b]);
  outer:for(const dx of choices[0])for(const dy of choices[1]){
   const source=base.map(p=>({...p,x:p.x+dx,y:p.y+dy}));if(!source.every(p=>plateFacesCell(p,field)))continue;
   if(!source.every(p=>{const b=plateLocalBounds(p);return p.x+b.min.x>=-field.width/2&&p.x+b.max.x<=field.width/2&&p.y+b.min.y>=-field.depth/2&&p.y+b.max.y<=field.depth/2;}))continue;
   candidates.push({turn,translation:[dx,dy],source,distance:Math.min(Math.abs(turn-preferredTurn),360-Math.abs(turn-preferredTurn))});break outer;
  }
 }
 return candidates.sort((a,b)=>a.distance-b.distance||Math.hypot(...a.translation)-Math.hypot(...b.translation));
}
export function plateGeometryReason(error:unknown){const e=error as Error&{stderr?:string},detail=e.stderr??e.message;return [...detail.matchAll(/Error: ([^\r\n]+)/g)].map(m=>m[1]).at(-1)??detail.slice(0,600);}
export function isPlateGeometryRejection(reason:string){return /No clear plate landing|Incomplete|Insufficient|No (?:full curved receiver|direct perimeter continuation|sealed wall receiver|finished wall seam|receiving wall|inward receiving edge)|Full L pier misses|Exported geometry rejected|NotManifold|NoError|outside the (?:selected )?field|envelope is disconnected|Turn the|Orient L and V/.test(reason);}
export async function fitClosedPlatePlacement(request:AmphitheaterRequest,generate:(candidate:AmphitheaterRequest,index:number)=>Promise<AmphitheaterResult>){
 const snapshot=request.sourceSnapshot as {arrangementSeed?:number;platePlacement?:Placement},settings=snapshot?.platePlacement;
 if(settings?.revision!==PLATE_PLACEMENT_REVISION&&settings?.revision!==CLOSED_PLATE_PLACEMENT_REVISION_V2)throw Error('Unknown closed Plate placement revision.');
 const seed=snapshot.arrangementSeed??0,preferredTurn=seed===2923755707?0:(seed>>>0)%360,unturn=THREE.MathUtils.degToRad(-preferredTurn),c=Math.cos(unturn),s=Math.sin(unturn),radiusX=Math.min(request.field.width*.2,request.preferredFeet),radiusY=Math.min(request.field.depth*.2,request.preferredFeet),checks:object[]=[];let index=0;
 const metadata=(extra:object)=>({...(request.sourceSnapshot as object),platePlacement:{revision:settings.revision,referenceStudyId:PLATE_REFERENCE_ID,validationSHA256:settings.validationSHA256,requestedTurn:preferredTurn,...extra}});
 for(const radiusRatio of [1,.98,.96,.94,.92,.9,.86,.82]){
  // Measure the native closed perimeter without clipping it to the requested
  // plan first. This temporary 60-ft measurement is never saved as a design.
  const source=request.source.map(p=>{const x=p.x/radiusX*request.preferredFeet*radiusRatio,y=p.y/radiusY*request.preferredFeet*radiusRatio;return {...p,x:c*x-s*y,y:s*x+c*y,rz:p.rz-preferredTurn};});
  let measured:AmphitheaterResult;
  try{measured=await generate({...request,field:{...request.field,width:60,depth:60},source,sourceSnapshot:metadata({radiusRatio,measurementOnly:true})},index++);}
  catch(error){const reason=plateGeometryReason(error);if(!isPlateGeometryRejection(reason))throw error;checks.push({stage:'measure',radiusRatio,passed:false,reason});continue;}
  if(!(measured.plateReport as unknown as {terminalClosure?:{passed:boolean}})?.terminalClosure?.passed)throw Error('No clear plate landing: terminal corner verification is absent.');
  const candidates=closedPlacementCandidates(measured,request.field,preferredTurn);checks.push({stage:'measure',radiusRatio,passed:true,fittingOrientations:candidates.length});
  for(const placement of candidates.slice(0,4)){
   try{const result=await generate({...request,source:placement.source,sourceSnapshot:metadata({radiusRatio,turn:placement.turn,translation:placement.translation})},index++);
    if(!result.validation.passed||!(result.plateReport as unknown as {terminalClosure?:{passed:boolean}})?.terminalClosure?.passed)throw Error('No clear plate landing: final closed corner verification failed.');
    checks.push({stage:'final',radiusRatio,turn:placement.turn,translation:placement.translation,passed:true});result.request={...result.request,sourceSnapshot:{...(result.request.sourceSnapshot as object),platePlacement:{...((result.request.sourceSnapshot as {platePlacement:Placement}).platePlacement),checks}}};return result;
   }catch(error){const reason=plateGeometryReason(error);if(!isPlateGeometryRejection(reason))throw error;checks.push({stage:'final',radiusRatio,turn:placement.turn,passed:false,reason});}
  }
 }
 throw Object.assign(new Error('No clear plate landing: no closed Study 135 perimeter fits the selected letter size, quantity, spacing and cell.'),{placementChecks:checks});
}
