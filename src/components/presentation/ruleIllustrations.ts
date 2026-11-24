import * as THREE from 'three';
import type {MeshData,PresentationStudy,SourcePose} from './types';

type Point=[number,number,number];
export type DetailBox={min:Point;max:Point};
export type DetailLayer={mesh:MeshData;color:'letters'|'form'|'rules';opacity?:number;overlay?:boolean};
export type RuleDetail={
 heading:string;bullets:string[];sourceIndices:number[];
 layers:DetailLayer[];lines?:{points:readonly number[][];color:'letters'|'rules'}[];
 view?:'plan'|'isometric';normal?:Point;
 insetIndices?:number[];insetLabel?:string;crop?:DetailBox;
};
type Void={source:string;axis?:number[];sourceContour?:number[][];closedContour?:number[][];cutterMesh?:MeshData;removedVolume?:number};
type PlanPlate={id:string;polygon:number[][];zTop:number;thickness:number;role:string};
type PlanLink={from:number[];to:number[];z0:number;z1:number;width:number};
type WorkspacePlan={plates:PlanPlate[];links:PlanLink[];voids:{polygon:number[][];cut:boolean}[]};
const fmt=(n:number)=>Number(n.toFixed(1)).toString();
export function meshBounds(mesh:MeshData):DetailBox{
 const box:DetailBox={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(let i=0;i<mesh.positions.length;i++){
  const axis=i%3;box.min[axis]=Math.min(box.min[axis],mesh.positions[i]);box.max[axis]=Math.max(box.max[axis],mesh.positions[i]);
 }return box;
}
function union(boxes:DetailBox[]):DetailBox{
 return {min:[0,1,2].map(k=>Math.min(...boxes.map(b=>b.min[k]))) as Point,max:[0,1,2].map(k=>Math.max(...boxes.map(b=>b.max[k]))) as Point};
}
function center(box:DetailBox):Point{return box.min.map((x,k)=>(x+box.max[k])/2) as Point;}
function expand(box:DetailBox,by:number|Point):DetailBox{
 const pad=typeof by==='number'?[by,by,by]:by;return {min:box.min.map((x,k)=>x-pad[k]) as Point,max:box.max.map((x,k)=>x+pad[k]) as Point};
}
function around(point:Point,radius:Point):DetailBox{return {min:point.map((x,k)=>x-radius[k]) as Point,max:point.map((x,k)=>x+radius[k]) as Point};}
/** Exact triangle/box clipping for an illustration. No caps or solids are added. */
export function clipDetailMesh(mesh:MeshData,box:DetailBox):MeshData{
 const positions:number[]=[],indices:number[]=[];
 for(let i=0;i<mesh.indices.length;i+=3){
  let polygon=mesh.indices.slice(i,i+3).map(index=>mesh.positions.slice(index*3,index*3+3) as Point);
  if([0,1,2].some(k=>polygon.every(p=>p[k]<box.min[k])||polygon.every(p=>p[k]>box.max[k])))continue;
  for(let axis=0;axis<3&&polygon.length;axis++)for(const side of [0,1]){
   const limit=side?box.max[axis]:box.min[axis],inside=(p:Point)=>side?p[axis]<=limit:p[axis]>=limit,next:Point[]=[];
   for(let j=0;j<polygon.length;j++){
    const a=polygon[j],b=polygon[(j+1)%polygon.length],ia=inside(a),ib=inside(b);
    if(ia)next.push(a);
    if(ia!==ib){const t=(limit-a[axis])/(b[axis]-a[axis]);next.push(a.map((v,k)=>k===axis?limit:v+t*(b[k]-v)) as Point);}
   }polygon=next;
  }
  for(let j=1;j+1<polygon.length;j++)for(const point of [polygon[0],polygon[j],polygon[j+1]]){indices.push(positions.length/3);positions.push(...point);}
 }return {positions,indices};
}
export function poseNormal(pose:SourcePose):Point{
 const order=pose.rotationOrder as THREE.EulerOrder|undefined;
 return new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(...[pose.rx,pose.ry,pose.rz].map(THREE.MathUtils.degToRad) as Point,order??'XYZ')).toArray() as Point;
}
function tilt(pose:SourcePose){return Math.acos(Math.min(1,Math.abs(poseNormal(pose)[2])))*180/Math.PI;}
function angleRange(poses:SourcePose[],key:'rx'|'ry'|'rz'){
 const values=poses.map(p=>p[key]),lo=Math.min(...values),hi=Math.max(...values);return Math.abs(lo-hi)<.01?fmt(lo)+'°':fmt(lo)+'°–'+fmt(hi)+'°';
}
function poseLine(poses:SourcePose[]){return 'X '+angleRange(poses,'rx')+'; Y '+angleRange(poses,'ry')+'; plan turn '+angleRange(poses,'rz')+'.';}
function vocabulary(study:PresentationStudy,indices:number[]){return [...new Set(indices.map(i=>study.record.request.source[i].letter))].join(' / ');}
function sourceBox(study:PresentationStudy,indices:number[]){return union(indices.map(i=>meshBounds(study.record.letters[i].mesh)));}
function near(study:PresentationStudy,start:number,candidates:number[],count:number){
 const a=center(meshBounds(study.record.letters[start].mesh));return candidates.slice().sort((i,j)=>{
  const d=(k:number)=>center(meshBounds(study.record.letters[k].mesh)).reduce((sum,v,axis)=>sum+(v-a[axis])**2,0);return d(i)-d(j)||i-j;
 }).slice(0,count).sort((a,b)=>a-b);
}
function window(study:PresentationStudy,start:number,count=3){
 const n=study.record.letters.length,limit=Math.min(count,Math.max(1,n-1)),from=Math.max(0,Math.min(n-limit,start));return Array.from({length:limit},(_,i)=>from+i);
}
function sourceLayers(study:PresentationStudy,indices:number[],overlay=false):DetailLayer[]{return indices.map(i=>({mesh:study.record.letters[i].mesh,color:'letters',overlay}));}
function orientation(study:PresentationStudy,indices:number[],heading:string,explanation:string,view:'plan'|'isometric'='isometric'):RuleDetail{
 return {heading,sourceIndices:indices,layers:sourceLayers(study,indices),normal:poseNormal(study.record.request.source[indices[0]]),view,bullets:[explanation,poseLine(indices.map(i=>study.record.request.source[i]))]};
}
function localForm(study:PresentationStudy,box:DetailBox,opacity=1):DetailLayer[]{
 const layers:DetailLayer[]=[{mesh:clipDetailMesh(study.record.architecture,box),color:'form',opacity}];
 if(study.record.perimeterWalls?.indices.length)layers.push({mesh:clipDetailMesh(study.record.perimeterWalls,box),color:'form',opacity});return layers;
}
function neighborhood(study:PresentationStudy,indices:number[],padding=1.3){
 const b=sourceBox(study,indices);return expand(b,[padding,padding,Math.max(padding,.2*(b.max[2]-b.min[2]))]);
}
function shellSection(study:PresentationStudy,indices:number[],padding=1.3){
 const crop=meshBounds(study.record.architecture),letters=sourceBox(study,indices);
 crop.min[0]=Math.max(crop.min[0],letters.min[0]-padding);crop.max[0]=Math.min(crop.max[0],letters.max[0]+padding);return crop;
}
function contourLines(study:PresentationStudy,indices:number[]){
 const features=(study.record.features??[]) as {id:string;line:number[][]}[];
 return indices.flatMap(i=>{const f=features.find(f=>f.id===study.record.letters[i].id);return f?[{points:f.line,color:'rules' as const}]:[];});
}
function lobbyDetails(study:PresentationStudy,chosen?:number){
 const {record}=study,n=record.letters.length,all=record.letters.map((_,i)=>i),horizontal=all.filter(i=>tilt(record.request.source[i])<5),upright=all.filter(i=>tilt(record.request.source[i])>=5);
 const type=study.typology;
 let first=window(study,chosen??Math.max(0,Math.floor(n/2)-1)),second=window(study,Math.min(n-2,Math.floor(n/2)+2));
 let titles=['LETTER ORIENTATION','ADJACENT LETTERS'],notes=['A few source letters show the face orientation.','Neighboring letters retain their relative positions.'];
 if(type==='compressed-sequential-lobby'){
  first=window(study,chosen??0);second=window(study,Math.floor(n/2));titles=['SHORT-FACE PROFILES','TURN TOWARD THE FLOOR'];notes=['L, U and V begin across the short face.','The next profiles turn down along the sequence.'];
 }else if(type==='topographic-ground-field-lobby'){
  const step=all.find(i=>i>0&&Math.abs(Number(record.request.source[i].z)-Number(record.request.source[i-1].z))>.01)??1;
  first=window(study,chosen??Math.max(0,step-1));second=window(study,Math.floor(n/2));titles=['RISING LETTER CHAIN','FLOOR / WALL TRANSITION'];notes=['Successive profiles rise and turn in plan.','Horizontal and tilted profiles define floors and walls.'];
 }else{
  if(horizontal.length)first=near(study,chosen!==undefined&&horizontal.includes(chosen)?chosen:horizontal[Math.floor(horizontal.length/2)],horizontal,type==='vertical-void-lobby'?1:2);
  if(upright.length)second=near(study,upright[Math.floor(upright.length/2)],upright,2);
  titles=[horizontal.length?'HORIZONTAL FLOOR PROFILES':'END PROFILE',type==='vertical-void-lobby'?'UPRIGHT U / V PROFILES':'WALL LETTER ORIENTATION'];
  notes=[horizontal.length?'The selected letter faces lie on the XY plane.':'The end source sets this local profile.',type==='vertical-void-lobby'?'U and V profiles stack along the vertical axis.':'Upright sources define the side-wall rhythm.'];
  if(type==='vertical-void-lobby'){
   const v=upright.find(i=>record.request.source[i].letter==='V'),us=upright.filter(i=>record.request.source[i].letter==='U');
   if(v!==undefined&&us.length)second=[v,...near(study,v,us,1)].sort((a,b)=>a-b);
  }
  if(type==='continuous-hall-lobby'){
   first=window(study,chosen??0);second=window(study,Math.max(0,Math.floor(n/2)-2));
   titles=['HALL-END PROFILES','TURNING WALL PROFILES'];notes=['End and adjacent letters establish the hall entry.','L sources turn progressively between the U profiles.'];
  }
 }
 if(chosen!==undefined&&!first.includes(chosen))first=near(study,chosen,all,2);
 const orientations=[orientation(study,first,titles[0],notes[0]),orientation(study,second,titles[1],notes[1])];
 const voids=((record.boundaryReport as {voids?:Void[]}|undefined)?.voids??[]).filter(v=>v.cutterMesh?.indices.length);
 const v=voids.find(v=>first.some(i=>record.letters[i].id===v.source))??voids.find(v=>second.some(i=>record.letters[i].id===v.source))??voids[0];
 const seed=v?record.letters.findIndex(l=>l.id===v.source):first[0],sourceIndices=[Math.max(0,seed)],box=neighborhood(study,sourceIndices,2);
 let operation:RuleDetail;
 if(v){
  const axis=v.axis??[0,0,1],axisIndex=axis.map(Math.abs).indexOf(Math.max(...axis.map(Math.abs))),extent=Math.max(2,...box.max.map((x,k)=>x-box.min[k]));
  const crop=expand(box,[0,1,2].map(k=>k===axisIndex?extent*.28:0) as Point);
  operation={heading:'INNER CONTOUR SWEEP',sourceIndices,layers:[...sourceLayers(study,sourceIndices),{mesh:clipDetailMesh(v.cutterMesh!,crop),color:'rules',opacity:.3}],lines:v.closedContour?[{points:v.closedContour,color:'rules'}]:[],crop,bullets:['The '+record.request.source[sourceIndices[0]].letter+' inner contour sets the opening.','The blue sweep follows its face direction.']};
 }else{
  const crop=shellSection(study,first,.9);
  operation={heading:'PROFILE TO SHELL',sourceIndices:first,insetIndices:first,insetLabel:'Letter profiles',layers:[...localForm(study,crop,.32),...sourceLayers(study,first,true)],lines:contourLines(study,first),crop,bullets:['The shell surrounds the selected letter profiles.','The changing enclosure narrows or widens the interior.']};
 }
 const two=near(study,sourceIndices[0],all,Math.min(2,n)),localBox=type==='compressed-sequential-lobby'?shellSection(study,two,1.1):neighborhood(study,two,1.1);
 const finish:RuleDetail={heading:type==='compressed-sequential-lobby'?'HOLLOW SHELL DETAIL':'LETTER TO SURFACE / OPENING',sourceIndices:two,layers:[...localForm(study,localBox),...sourceLayers(study,two,true)],lines:contourLines(study,two),crop:localBox,bullets:type==='compressed-sequential-lobby'?['The shell wraps these profiles with an interior clearance.','The neighboring outlines set the changing enclosure.']:['Inner contours remove material from the local surface.','The contour sets the wall or plate opening.']};
 const paths=(record.paths??[]) as {sources:string[];line:number[][]}[];
 const valid=paths.map(p=>p.sources.map(id=>record.letters.findIndex(l=>l.id===id))).filter(ids=>ids.length===2&&ids.every(i=>i>=0));
 const pair=valid.find(ids=>ids.some(i=>second.includes(i)))??near(study,second[0],all,2),jointBox=type==='compressed-sequential-lobby'?shellSection(study,pair,1.2):neighborhood(study,pair,1.2);
 const joint:RuleDetail={heading:type==='vertical-void-lobby'?'STACKED PROFILE JOINT':'NEIGHBORING PROFILE JOINT',sourceIndices:pair,layers:[...localForm(study,jointBox),...sourceLayers(study,pair,true)],lines:contourLines(study,pair),crop:jointBox,bullets:['Adjacent source edges establish the local joint.','The finished surface follows the letter profiles.']};
 return {orientation:orientations,generation:[operation,finish,joint]};
}
function polygonCenter(p:number[][]):number[]{return [0,1].map(k=>p.reduce((s,v)=>s+v[k],0)/p.length);}
function insidePolygon(p:number[],poly:number[][]){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function workspaceDetails(study:PresentationStudy,chosen?:number){
 const {record}=study,plan=record.request.workspacePlan as WorkspacePlan|undefined,all=record.letters.map((_,i)=>i),first=near(study,chosen??0,all,Math.min(2,Math.max(1,all.length-1)));
 let other=near(study,all.length-1,all,Math.min(2,Math.max(1,all.length-1)));
 const different=all.find(i=>!first.some(j=>record.request.source[i].letter===record.request.source[j].letter));
 if(different!==undefined)other=[different];
 const names:Record<string,[string,string]>={
  'open-hall-workspace':['FLOOR / MEZZANINE GUIDES','PERIMETER LETTERS'],
  'flat-deep-plan-plate':['HORIZONTAL L / V GUIDES','EDGE ALIGNMENT'],
  'cascaded-terraced-plates':['L / V PLATE GUIDES','LEVEL AND PLAN ORIENTATION'],
  'void-edge-workspace':['U BAND GUIDES','U / L EDGE ORIENTATION'],
  'folded-undulating-work-surface':['WORK-SURFACE GUIDES','NEIGHBORING LETTER ORIENTATION'],
 };
 const headings=names[study.typology]?.slice()??['LETTER FACE ORIENTATION','NEIGHBORING LETTERS'];
 if(study.typology==='cascaded-terraced-plates'||study.typology==='folded-undulating-work-surface'){
  headings[0]=vocabulary(study,first)+' PLATE GUIDES';headings[1]=vocabulary(study,other)+' LETTER ORIENTATION';
 }
 const orientations=[orientation(study,first,headings[0],vocabulary(study,first)+' guides show the supporting-plane orientation.'),orientation(study,other,headings[1],'The selected letters retain their plan turns and levels.',study.typology==='void-edge-workspace'?'plan':'isometric')];
 const plateBox=neighborhood(study,first,1.4);
 const contact:RuleDetail={heading:'LETTER / PLATE CONTACT',sourceIndices:first,layers:[...localForm(study,plateBox),...sourceLayers(study,first,true)],crop:plateBox,bullets:['The letters rise above their supporting plate.','This detail shows the letter outlines meeting the floor.']};
 const offset=record.request.field.height/2,letterL=all.find(i=>record.request.source[i].letter==='L'),letterU=all.find(i=>record.request.source[i].letter==='U');
 const support=plan?.plates.find(p=>p.role==='support');
 let supportDetail:RuleDetail;
 if(support){
  const p=polygonCenter(support.polygon),r=Math.max(1.6,...support.polygon.flatMap(v=>v.map((x,k)=>Math.abs(x-p[k]))))*1.8;
  const hosts=plan!.plates.filter(plate=>!['support','roof','wall'].includes(plate.role)&&insidePolygon(p,plate.polygon));
  const host=hosts.sort((a,b)=>Math.abs(a.zTop-support.zTop)-Math.abs(b.zTop-support.zTop))[0];
  const crop=around([p[0],p[1],(host?.zTop??support.zTop)+offset],[r,r,Math.max(2.5,r)]),inset=letterL===undefined?first.slice(0,1):[letterL];
  supportDetail={heading:'L SUPPORT / PLATE JOINT',sourceIndices:inset,insetIndices:inset,insetLabel:'L guide',layers:localForm(study,crop),crop,bullets:['An L-shaped support rises into the plate above.','The local joint preserves the two arms of the L section.']};
 }else supportDetail={...contact,heading:'LOCAL PLATE EDGE'};
 let feature:RuleDetail={...contact,heading:'ADJACENT PLATE DETAIL'};
 const link=plan?.links.find(l=>Math.abs(l.z1-l.z0)>.01);
 if(link){
  const r=Math.max(1,link.width),crop:DetailBox={min:[Math.min(link.from[0],link.to[0])-r,Math.min(link.from[1],link.to[1])-r,Math.min(link.z0,link.z1)+offset-1.2],max:[Math.max(link.from[0],link.to[0])+r,Math.max(link.from[1],link.to[1])+r,Math.max(link.z0,link.z1)+offset+1.2]};
  feature={heading:study.typology==='folded-undulating-work-surface'?'RAMP BETWEEN PLATES':'STEPPED PLATE CONNECTION',sourceIndices:first,insetIndices:first,insetLabel:vocabulary(study,first)+' guides',layers:localForm(study,crop),crop,bullets:['Adjacent plate levels differ by '+fmt(Math.abs(link.z1-link.z0))+' ft.','The connector meets both horizontal plate surfaces.']};
 }else{
  const hole=plan?.voids.find(v=>v.cut),plate=plan?.plates.find(p=>p.role==='mezzanine')??plan?.plates.find(p=>p.role==='roof');
  if(hole&&hole.polygon.length){
   const p=hole.polygon[0],base=plan!.plates.find(p=>p.role==='ground')??plan!.plates[0],crop=around([p[0],p[1],base.zTop+offset],[4,4,2]);
   const inset=letterU===undefined?first.slice(0,1):[letterU];
   feature={heading:'U BAND / VOID RIM',sourceIndices:inset,insetIndices:inset,insetLabel:'U guide',layers:localForm(study,crop),crop,bullets:['The floor band turns around the internal opening.','This rim detail keeps the void open through the plate.']};
  }else if(plate){
   const p=plate.polygon[Math.max(0,plate.polygon.length-3)],crop=around([p[0],p[1],plate.zTop+offset],[4,4,2.5]);
   feature={heading:plate.role==='mezzanine'?'MEZZANINE EDGE':'ROOF / SUPPORT DETAIL',sourceIndices:first.slice(0,1),insetIndices:first.slice(0,1),insetLabel:'Letter guide',layers:localForm(study,crop),crop,bullets:[plate.role==='mezzanine'?'The mezzanine forms a level band beside the hall.':'The overhead plate meets the local support.','The detail follows the actual plate edge and thickness.']};
  }
 }
 return {orientation:orientations,generation:[contact,supportDetail,feature]};
}
/** Isolated saved-mesh examples only; this module has no generator or storage imports. */
export function focusedRuleDetails(study:PresentationStudy,ruleSource=''){
 const index=study.record.letters.findIndex(l=>l.id===ruleSource),chosen=index<0?undefined:index;
 return study.category==='lobby'?lobbyDetails(study,chosen):workspaceDetails(study,chosen);
}
