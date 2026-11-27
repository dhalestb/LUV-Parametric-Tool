import type {Manifold,ManifoldToplevel} from 'manifold-3d';
import type {OfficePlan} from './flatDeepRules/contracts';
import {buildOfficeWorkspace,checkVoidEdgeAssembly,checkVoidEdgeColumns,checkVoidEdgeWalls} from './workspaceRules/void-edge-workspace.geometry';

// Match the native worker's witnesses. These solids are only used to check the finished mesh.
export function auditWorkspace(api:ManifoldToplevel,plan:OfficePlan,combined:Manifold,own:<T extends {delete():void}>(s:T)=>T){
 if(plan.typology==='void-edge-workspace'){
  const layers=new Map<string,Manifold>();
  for(const plate of plan.plates){
   const part=buildOfficeWorkspace(api,{...plan,plates:[plate],links:[]},own).combined;
   if(!part)throw Error('Missing Void Edge element '+plate.id);layers.set(plate.id,part);
  }
  const walls=checkVoidEdgeWalls(api,plan,layers,own),columns=checkVoidEdgeColumns(api,plan,layers);
  const failures=[...walls.contactFailures,...walls.coverageFailures,...walls.overlapFailures,...columns.failures,...checkVoidEdgeAssembly(plan,layers,combined,null).failures];
  if(failures.length)throw Error(failures.join('. '));
  return ['Verified '+walls.wallCount+' walls for receiving-plate contact, 50% perimeter coverage and solid overlap.',columns.count+' seated and twisted columns.',layers.size+' planned components present in the final solid.'];
 }
 const roof=plan.plates.find(p=>p.role==='roof')!;
 const prism=(polygon:[number,number][],top:number,depth:number)=>{
  const section=own(new api.CrossSection([polygon],'EvenOdd'));return own(own(section.extrude(depth)).translate([0,0,top-depth]));
 };
 for(const p of plan.plates){
  const top=p.role==='support'?roof.zTop:p.zTop,bottom=p.zTop-p.thickness;
  let expected=prism(p.polygon,top,top-bottom);
  for(const cut of plan.voids.filter(v=>v.cut&&(!v.roles?.length||v.roles.includes(p.role))))expected=own(expected.subtract(prism(cut.polygon,top+.05,top-bottom+.1)));
  if(expected.isEmpty()||expected.status()!=='NoError')throw Error('Invalid Open Hall element '+p.id);
  const missing=own(expected.subtract(combined));
  if(missing.status()!=='NoError'||missing.volume()>Math.max(.000001,expected.volume()*.000001))throw Error('Open Hall element is missing material: '+p.id);
 }
 const openings=plan.voids.filter(v=>v.cut&&v.roles?.includes('roof'));
 for(const hole of openings){
  const witness=prism(hole.polygon,roof.zTop-.001,roof.thickness-.002);
  const blocked=own(combined.intersect(witness));if(blocked.volume()>Math.max(.000001,witness.volume()*.000001))throw Error('Obstructed skylight '+hole.id);
 }
 if(!openings.length||combined.decompose().map(own).filter(s=>s.volume()>0).length!==1)throw Error('Open Hall needs clear skylights and one connected union.');
 return [openings.length+' unobstructed skylights through the finished roof.',plan.plates.length+' planned components retained in one connected union.'];
}
