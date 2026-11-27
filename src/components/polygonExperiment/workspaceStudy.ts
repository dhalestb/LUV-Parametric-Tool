import {auditWorkspace} from './workspaceSolidsAudit';
import * as THREE from 'three';
import type {CrossSection,ManifoldToplevel,Manifold} from 'manifold-3d';
import {getLetterVolumeGeometry} from '../letterGeometry3d';
import {siteMesh,projectMesh,type Letter,type FormationPart,type PlanLayer} from './continuousFormation';
import type {Point as Pt} from './territories';
import type {HeightBand} from './compositionHeights';
import {packNativeFields,selectFields,type FieldPlacement} from './flatDeepPacking';
import {fitOpenHallBoundary} from './openHallBoundary';
import {buildOpenHallGuideLetters,arrangeOfficeLetters} from './workspaceRules/open-hall-workspace';
import {buildOfficeWorkspace as buildHall} from './workspaceRules/open-hall-workspace.geometry';
import {buildOfficeWorkspace as buildVoid} from './workspaceRules/void-edge-workspace.geometry';
import {voidEdgePlate,buildVoidEdgeGuides} from './workspaceRules/void-edge-plate';
import {voidEdgeRules,voidEdgeStoryLayout} from './workspaceRules/void-edge-workspace.rules';
import type {OfficeField,OfficePlan} from './flatDeepRules/contracts';
import type {IntersectionPlacement as Pose} from './workspaceRules/placement';

export type OfficeId='open-hall-workspace'|'void-edge-workspace';
export type OfficeMode='native'|'adaptive'|'boundary';
export const isOffice=(id:string):id is OfficeId=>id==='open-hall-workspace'||id==='void-edge-workspace';
const RAD=Math.PI/180;
type Arrangement={placements:Pose[];officePlan:OfficePlan};
function poseMesh(p:Pose,center:Pt,heading:number,lift:number,origin:Pt,datum:number):Letter['mesh']{
 const g=getLetterVolumeGeometry(p.letter,12),v=new THREE.Vector3(),attr=g.getAttribute('position');
 const m=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*RAD,p.ry*RAD,p.rz*RAD,p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 const positions:number[]=[],indices:number[]=[],c=Math.cos(heading*RAD),s=Math.sin(heading*RAD);
 for(let i=0;i<attr.count;i++){v.fromBufferAttribute(attr,i).applyMatrix4(m);positions.push(origin[0]+center[0]+c*v.x-s*v.y,datum+lift+v.z,origin[1]+center[1]+s*v.x+c*v.y);}
 const ix=(i:number)=>g.index?g.index.getX(i):i;
 for(let i=0;i<(g.index?.count??attr.count);i+=3)indices.push(ix(i),ix(i+2),ix(i+1));
 return {positions,indices};
}
// Distances to the FIRST crossing of every contour keep concavities and courts active.
function rayLength(contours:Pt[][],dx:number,dy:number){
 let nearest=Infinity;
 for(const ring of contours)ring.forEach(([x,y],i)=>{
  const [u,v]=ring[(i+1)%ring.length],ex=u-x,ey=v-y,den=dx*ey-dy*ex;
  if(Math.abs(den)<1e-9)return;
  const t=(x*ey-y*ex)/den,f=(x*dy-y*dx)/den;
  if(t>0&&f>=0&&f<=1)nearest=Math.min(nearest,t);
 });
 if(!Number.isFinite(nearest))throw Error('A Void Edge guide ray has no boundary crossing.');
 return nearest;
}
function voidBoundary(local:CrossSection,height:number,factor:number,balanced:boolean){
 const {min,max}=local.bounds(),length=Math.max(...min.map(Math.abs),...max.map(Math.abs))*3+60;
 const field:OfficeField={width:length,depth:length,height},rings=local.toPolygons();
 const edges=rings.flatMap(r=>r.map((a,i)=>{const b=r[(i+1)%r.length];return {d:Math.hypot(b[0]-a[0],b[1]-a[1]),angle:Math.atan2(b[1]-a[1],b[0]-a[0])/RAD};}));
 const base=Math.round(edges.sort((a,b)=>b.d-a.d)[0].angle/15)*15;
 const increment=voidEdgeRules.stack.intermediateRotations[height];
 const source:Pose[]=[];
 for(const datum of [...voidEdgeStoryLayout(height).map(s=>s.datum),'roof' as const]){
  const angle=base+(datum==='roof'?0:datum/10*increment),r=angle*RAD;
  const seeds=buildVoidEdgeGuides(field,30,20);
  const axes=[[0,-1],[0,1],[-1,0],[1,0]].map(([u,v])=>[u*Math.cos(r)-v*Math.sin(r),u*Math.sin(r)+v*Math.cos(r)]);
  const reaches=axes.map(([dx,dy])=>rayLength(rings,dx,dy));
  const shortest=Math.min(...reaches);
  seeds.forEach((p,i)=>{
   const [u,v]=[[0,-1],[0,1],[-1,0],[1,0]][i];
   const dx=u*Math.cos(r)-v*Math.sin(r),dy=u*Math.sin(r)+v*Math.cos(r);
   const reach=(balanced?shortest+.12*(reaches[i]-shortest):reaches[i])*factor;
   const size=balanced?Math.max(8,reach*(i<2?1.15:.80)):Math.max(8,Math.min(reach*.75,i<2?65:48));
   const offset=balanced?size*.25:Math.max(0,reach-size*.45);
   source.push({...p,scale:size,scaleZ:p.scaleZ*p.scale/size,x:dx*offset,y:dy*offset,
    z:-height/2+(datum==='roof'?height-.8:datum)+.375,rz:p.rz+angle,voidEdgeRotation:angle,voidEdgePlateDatum:datum});
  });
 }
 return voidEdgePlate(source,{...field,voidEdgeRotation:base});
}
export function formOffice(api:ManifoldToplevel,id:OfficeId,mode:OfficeMode,region:CrossSection,origin:Pt,datum:number,bands:HeightBand[],zoneCap:number,setback:number,target?:number,spread=false,siteEdges:Pt[][]=[]){
 const owned:{delete():void}[]=[];const own=<T extends {delete():void}>(s:T)=>{owned.push(s);return s;};
 try{
  let allowed=own(region.offset(-Math.max(0,setback),'Miter'));
  for(const band of bands)if(band.cap<20)allowed=own(allowed.subtract(band.section));
  if(zoneCap<20||allowed.isEmpty())throw Error('No eligible ground has the required 20 ft height.');
  const heightAt=(s:CrossSection)=>Math.min(zoneCap,...bands.filter(b=>own(s.intersect(b.section)).area()>1e-6).map(b=>b.cap));
  const letters:Letter[]=[],parts:FormationPart[]=[],layers:PlanLayer[]=[],forms:Manifold[]=[],studies=[];
  const checks:{id:string;passed:boolean;measurement:string}[]=[];
  type Job={piece:CrossSection;target?:number;field?:FieldPlacement&{size:number;height:number;arrangement:Arrangement}};
  const jobs:Job[]=[];
  type EllipseLevel={ground:CrossSection;second:CrossSection;opening:CrossSection;sources:string[]};
  const levels:EllipseLevel[]=[];
  const distribute=spread||id==='void-edge-workspace';
  const pieces=id==='open-hall-workspace'&&mode==='boundary'?[allowed]:allowed.decompose().map(own);
  let assigned=0,areaSoFar=0;
  for(const piece of pieces){
   areaSoFar+=piece.area();
   const cumulative=target===undefined?0:Math.round(target*areaSoFar/allowed.area());
   const pieceTarget=target===undefined?undefined:Math.max(1,cumulative-assigned);
   assigned=cumulative;
   if(mode==='boundary'&&id==='void-edge-workspace'){
    const seeds=packNativeFields(api,piece,40,40);
    const wanted=pieceTarget===undefined?seeds.length:Math.max(1,Math.round(pieceTarget/20));
    const fields=selectFields(seeds,Math.min(wanted,seeds.length),true);
    if(fields.length>1){
     const bounds=piece.bounds(),reach=2*Math.hypot(bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1]);
     for(const f of fields){
      let cell=piece;
      for(const other of fields){
       if(other===f)continue;
       const dx=other.center[0]-f.center[0],dy=other.center[1]-f.center[1],len=Math.hypot(dx,dy);
       const ux=dx/len,uy=dy/len,mx=f.center[0]+dx/2,my=f.center[1]+dy/2;
       const mask=own(new api.CrossSection([[[-reach,0],[reach,0],[reach,reach],[-reach,reach]].map(([t,d]):Pt=>[mx-uy*t-ux*d,my+ux*t-uy*d])],'EvenOdd'));
       cell=own(cell.intersect(mask));
      }
      const local=cell.decompose().map(own).sort((a,b)=>b.area()-a.area())[0];
      jobs.push({piece:local,target:pieceTarget===undefined?undefined:Math.max(1,Math.round(pieceTarget/fields.length))});
     }
     continue;
    }
   }
   if(mode==='boundary'||(target===undefined&&!distribute)){jobs.push({piece,target:pieceTarget});continue;}
   let best:Job[]=[],bestError=Infinity,bestArea=-1;
   // Compare actual approved arrangements for feasible fields before building the solids.
   for(const size of mode==='native'?[40]:[100,80,60,50,40]){
    const packed=packNativeFields(api,piece,size,size);
    if(!packed.length)continue;
    for(const height of mode==='native'?[20]:[60,40,20]){
     if(height>zoneCap)continue;
     const eligible=packed.filter(p=>{
      const rect=own(own(own(api.CrossSection.square([size,size],true)).rotate(p.angle)).translate(p.center));
      return heightAt(rect)>=height;
     });
     if(!eligible.length)continue;
     const field={width:size,depth:size,height};
     const candidate=id==='open-hall-workspace'?arrangeOfficeLetters(buildOpenHallGuideLetters(field),id,12,[0,0,0],field):
      voidEdgePlate(buildVoidEdgeGuides(field,mode==='native'?30:size*.68,mode==='native'?20:size*.48),field);
     const plan=candidate.officePlan;
     if(!plan||plan.checks.some(c=>c.status==='fail'))continue;
     const per=candidate.placements.length;
     const count=Math.min(eligible.length,pieceTarget===undefined?eligible.length:Math.max(1,Math.round(pieceTarget/per)));
     const error=pieceTarget===undefined?0:Math.abs(count*per-pieceTarget),area=count*size*size;
     if(error>bestError||(error===bestError&&area<=bestArea))continue;
     bestError=error;bestArea=area;
     best=selectFields(eligible,count,distribute).map(p=>({piece,field:{...p,size,height,arrangement:{placements:candidate.placements,officePlan:plan}}}));
    }
   }
   if(!best.length)throw Error('No complete Workspace field fits the assigned territory and height limits.');
   jobs.push(...best);
  }
  for(const {piece,field:placement,target:pieceTarget} of jobs){
   let center:Pt=[0,0],heading=0,h=20,width=40,depth=40,arranged:Arrangement|undefined;
   const sizeChoices=mode==='native'?[40]:[100,80,60,50,40];
   const heightFrom=(cap:number)=>cap>=60?60:cap>=40?40:20;
   if(placement){
    center=placement.center;heading=placement.angle;width=depth=placement.size;h=placement.height;arranged=placement.arrangement;
   }else if(mode==='boundary'){
    // An interior pole is used only as the origin for the U-group survey.
    // The hall uses the entire inset perimeter in its local frame.
    let core=piece;
    for(let d=4;;d+=4){const inner=own(piece.offset(-d));if(inner.isEmpty())break;core=inner;}
    const pole=core.toPolygons()[0][0];center=[...pole];const local=own(piece.translate([-pole[0],-pole[1]]));
    h=heightFrom(heightAt(piece));
    if(id==='open-hall-workspace'){
     arranged=fitOpenHallBoundary(api,local,h,pieceTarget,spread,poses=>poses.every(p=>{
      const footprint=projectMesh(api,poseMesh(p,[0,0],0,h/2,[0,0],0),[0,0]);
      try{
       const escape=footprint.subtract(local);
       try{return escape.area()<1e-6;}finally{escape.delete();}
      }finally{footprint.delete();}
     }),siteEdges.map(r=>r.map(([x,y]):Pt=>[x-pole[0],y-pole[1]])));
    }else{
     let last='',bestError=Infinity,bestHeight=h;
     const heights=pieceTarget===undefined?[h]:[60,40,20].filter(v=>v<=h);
     for(const trialHeight of heights){
     search:for(const balanced of (pieceTarget!==undefined&&!spread?[true,false]:[false,true]))for(const factor of [.88,.78,.68,.58,.48,.4,.32]){
      try{
       const candidate=voidBoundary(local,trialHeight,factor,balanced);
       const profiles=candidate.officePlan.plates.filter(p=>p.role==='ground'||p.role==='mezzanine'||p.role==='roof');
       if(profiles.some(p=>own(own(new api.CrossSection([p.polygon])).subtract(local)).area()>.00001))continue;
       const spill=candidate.placements.some(p=>own(own(projectMesh(api,poseMesh(p,[0,0],0,trialHeight/2,[0,0],0),[0,0])).subtract(local)).area()>.00001);
       if(!spill){
        const error=pieceTarget===undefined?0:Math.abs(candidate.placements.length-pieceTarget);
        if(error<bestError){arranged=candidate;bestError=error;bestHeight=trialHeight;}
        break search;
       }
      }catch(e){last=String(e);}
     }
     }
     h=bestHeight;
     if(!arranged)throw Error('No complete U-derived stack fits the boundary. '+last);
    }
    const bounds=local.bounds();width=bounds.max[0]-bounds.min[0];depth=bounds.max[1]-bounds.min[1];
   }else{
    let found=false;
    for(const size of sizeChoices){
     const fields=packNativeFields(api,piece,size,size);
     if(!fields.length)continue;
     const bounds=piece.bounds(),cx=(bounds.min[0]+bounds.max[0])/2,cy=(bounds.min[1]+bounds.max[1])/2;
     const selected=fields.sort((a,b)=>Math.hypot(a.center[0]-cx,a.center[1]-cy)-Math.hypot(b.center[0]-cx,b.center[1]-cy))[0];
     center=selected.center;heading=selected.angle;width=depth=size;const rect=own(own(own(api.CrossSection.square([width,depth],true)).rotate(heading)).translate(center));
     h=mode==='native'?20:heightFrom(heightAt(rect));found=true;break;
    }
    if(!found)throw Error('No whole permitted Workspace field fits inside this territory.');
    const field={width,depth,height:h};
    const candidate=id==='open-hall-workspace'?arrangeOfficeLetters(buildOpenHallGuideLetters(field),id,12,[0,0,0],field):
      voidEdgePlate(buildVoidEdgeGuides(field,mode==='native'?30:width*.68,mode==='native'?20:depth*.48),field);
    if(!candidate.officePlan)throw Error('The native rule system could not resolve a field plan.');
    arranged={placements:candidate.placements,officePlan:candidate.officePlan};
   }
   const plan=arranged.officePlan,failed=plan.checks.filter(c=>c.status==='fail');
   if(failed.length)throw Error(failed.map(f=>f.label+' '+f.detail).join('. '));
   const builder=id==='open-hall-workspace'?buildHall:buildVoid;
   const built=builder(api,plan,own);if(!built.combined||!built.form)throw Error('The source rules could not assemble the Workspace.');
   const world=(s:Manifold)=>own(own(s.rotate([0,0,heading])).translate([center[0],center[1],h/2]));
   const solid=world(built.combined);
   if(solid.status()!=='NoError'||solid.volume()<=0)throw Error('Invalid Workspace union.');
   const ids=arranged.placements.map((p,i)=>{
    const l={id:id+'-'+studies.length+'-guide-'+i,letter:p.letter,nominalSizeFeet:p.scale,mesh:poseMesh(p,center,heading,h/2,origin,datum)};
    letters.push(l);return l.id;
   });
   const prefix=id+'-'+studies.length+'-';
   const witnesses=auditWorkspace(api,plan,built.combined,own);
   for(const [name,s] of [['form',built.form],['walls',built.walls]] as const)if(s)parts.push({id:prefix+name,mesh:siteMesh(world(s),origin,datum),sources:ids});
   const c=Math.cos(heading*RAD),sn=Math.sin(heading*RAD);
   const transform=([x,y]:Pt):Pt=>[origin[0]+center[0]+c*x-sn*y,origin[1]+center[1]+sn*x+c*y];
   for(const p of plan.plates)layers.push({name:prefix+p.id,typology:id,top:datum+h/2+p.zTop,contours:[p.polygon.map(transform),...plan.voids.filter(v=>v.cut&&(v.roles?.includes(p.role)||v.plateIds?.includes(p.id))).map(v=>v.polygon.map(transform).reverse())]});
   if(id==='void-edge-workspace'){
    const profile=(ring:Pt[])=>own(own(own(new api.CrossSection([ring],'EvenOdd')).rotate(heading)).translate(center));
    const first=plan.plates.find(p=>p.role==='ground'),second=plan.plates.find(p=>p.id==='u-derived-level-10');
    const hole=plan.voids.find(v=>v.cut&&v.plateIds?.includes(second?.id??''));
    if(!first||!second||!hole)throw Error('Void Edge is missing its first ellipse, second plate or core opening.');
    levels.push({ground:profile(first.polygon),second:profile(second.polygon),opening:profile(hole.polygon),sources:ids});
   }
   const capture=(s:string,m:string)=>checks.push({id:s,passed:true,measurement:m});
   witnesses.forEach((m,i)=>capture('Finished geometry '+(i+1),m));
   plan.checks.filter(k=>k.status==='pass').forEach(k=>capture(k.label,k.detail));
   if(id==='open-hall-workspace'&&mode==='boundary')capture('Hall ring and skylights','One central opening at 20–40%, one roof-guide cut per complete column bay, grid piers and open entry.');
   const partHeights=solid.boundingBox();
   if(partHeights.min[2]<-.001||partHeights.max[2]>h+.001)throw Error('Workspace breaches its vertical envelope.');
   forms.push(solid);studies.push({center,heading,width,depth,height:h,letters:ids.length,plates:plan.plates.length,holes:plan.voids.length});
  }
  if(!forms.length)throw Error('No buildable Workspace components.');
  if(levels.length){
   const spacing=voidEdgeRules.stack.spacing,thickness=voidEdgeRules.thickness.slab;
   for(const [index,piece] of allowed.decompose().map(own).entries()){
    const group=levels.filter(level=>own(level.ground.intersect(piece)).area()>.01);
    if(!group.length)continue;
    const together=(key:'ground'|'second'|'opening')=>own(api.CrossSection.union(group.map(level=>level[key])));
    const ellipses=together('ground'),second=together('second'),cores=together('opening');
    // Round site corners at the scale of the lower U-guide plates. Where
    // plates rotate past one another the exposed ellipse remains an atrium edge.
    const radius=Math.min(8,Math.sqrt(ellipses.area()/group.length/Math.PI)/2);
    const inner=own(piece.offset(-radius,'Round',2,72));
    const outline=own(own(inner.offset(radius,'Round',2,72)).intersect(piece));
    const continuous=(shape:CrossSection)=>shape.decompose().map(own).filter(s=>s.area()>.001).length===1;
    // A 0.01 ft perimeter joint keeps independently generated adjoining solids from sharing coplanar faces.
    const deck=(domain:CrossSection,cut:CrossSection)=>own(own(own(own(domain.offset(-.01,'Round',2,72)).subtract(cut)).add(second)).subtract(cores));
    let plate=deck(outline,ellipses);
    if(!continuous(plate)){
     // Rounding may remove a narrow site neck. Restore the neck before
     // reducing any elliptical recess. Preserve every native core opening.
     plate=deck(piece,ellipses);
     for(let inset=1;!continuous(plate);inset*=2){
      const cut=own(ellipses.offset(-inset,'Round',2,72));
      plate=deck(piece,cut);
      if(cut.isEmpty())break;
     }
     if(!continuous(plate))throw Error('The second Void Edge platform cannot connect across the permitted ground.');
    }
    // A narrow bearing overlaps the existing slab. Keep its elliptical core open.
    const infill=own(plate.subtract(own(second.offset(-.04,'Round',2,72))));
    const solid=own(own(infill.extrude(thickness)).translate([0,0,spacing]));
    if(solid.isEmpty()||solid.status()!=='NoError')throw Error('The second Void Edge platform could not be formed.');
    const name='void-edge-workspace-level-two-'+(index+1);
    forms.push(solid);
    parts.push({id:name,mesh:siteMesh(solid,origin,datum),sources:group.flatMap(g=>g.sources)});
    layers.push({name,typology:id,top:datum+spacing+thickness,contours:infill.toPolygons().map(r=>r.map(([x,y]):Pt=>[x+origin[0],y+origin[1]]))});
    checks.push({id:'Continuous second platform '+(index+1),passed:true,measurement:plate.area().toFixed(1)+' ft² connected at the 10 ft datum around '+group.length+' first-level ellipses; '+cores.area().toFixed(1)+' ft² of core openings.'});
   }
  }
  const combined=own(api.Manifold.union(forms)),foot=own(combined.project()),source=own(api.CrossSection.union(letters.map(l=>own(projectMesh(api,l.mesh,origin)))));
  const outside=own(foot.subtract(allowed)).area(),letterOutside=own(source.subtract(allowed)).area();
  if(Math.max(outside,letterOutside)>.001)throw Error(id+' containment failed: architecture '+outside.toFixed(3)+' / letters '+letterOutside.toFixed(3)+' ft².');
  for(const band of bands)for(const l of letters){
   if(l.mesh.positions.some((v,i)=>i%3===1&&v-datum>band.cap+.001)&&own(own(projectMesh(api,l.mesh,origin)).intersect(band.section)).area()>.0001)throw Error('Workspace guide exceeds a local height cap.');
  }
  checks.push({id:'Site containment',passed:true,measurement:'Measured architecture and source letters inside the permitted site.'});
  const footprintArea=foot.area();
  return {solid:combined.asOriginal(),parts,letters,layers,sourceArea:source.area(),footprintArea,missing:region.area()-footprintArea,outside,height:combined.boundingBox().max[2],letterTarget:target??letters.length,office:{id,mode,sourceCommit:'ec79619d4b073ca09e2b6a466fa1f8cf2d2b9c4e',version:id==='open-hall-workspace'?'1.6.0':'2.21.0',studies,checks,letterOutside}};
 }finally{owned.reverse().forEach(s=>s.delete());}
}
