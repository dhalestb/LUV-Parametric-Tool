import * as THREE from 'three';
import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {getLetterVolumeGeometry} from '../letterGeometry3d';
import {arrangeBoundaryLetters,boundaryVersion,halfSpanVersion,letterTip,type BoundaryArrangement,type Guide} from './flatDeepBoundaryLetters';
import type {AdaptiveOptions} from './flatDeepAdaptive';
import type {HeightBand} from './compositionHeights';
import {projectMesh,siteMesh,type FormationPart,type PlanLayer,type Letter} from './continuousFormation';
import type {Point,Ring} from './territories';

const slab=.75,wallDepth=1.5;
type Check={id:string;passed:boolean;measurement:string};
function rule(checks:Check[],id:string,passed:boolean,measurement:string){
  if(!passed)throw Error(id+' · '+measurement);
  checks.push({id,passed,measurement});
}

function renderGuide(g:Guide,origin:Point,datum:number):Letter{
  const glyph=getLetterVolumeGeometry('L',12),attr=glyph.getAttribute('position'),v=new THREE.Vector3();
  const rotation=new THREE.Quaternion(...g.rotation),positions:number[]=[],indices:number[]=[];
  for(let i=0;i<attr.count;i++){
    v.fromBufferAttribute(attr,i).multiplyScalar(g.size).applyQuaternion(rotation);
    positions.push(origin[0]+g.position[0]+v.x,datum+g.position[2]+v.z,origin[1]+g.position[1]+v.y);
  }
  const index=(i:number)=>glyph.index?glyph.index.getX(i):i;
  for(let i=0;i<(glyph.index?.count??attr.count);i+=3)indices.push(index(i),index(i+2),index(i+1));
  return {id:g.id,letter:'L',nominalSizeFeet:g.size,mesh:{positions,indices}};
}

// Rule B deliberately accepts only posed letters and their incidence lists.
// Site boundaries, prepared contours, and target areas are unavailable to the builder.
export function buildBoundaryFromLetters(api:ManifoldToplevel,a:BoundaryArrangement,origin:Point,datum:number){
  const owned:{delete():void}[]=[];const own=<T extends {delete():void}>(s:T)=>{owned.push(s);return s;};
  const byId=new Map(a.guides.map(g=>[g.id,g])),parts:FormationPart[]=[],layers:PlanLayer[]=[],solids:Manifold[]=[],checks:Check[]=[];
  const guide=(id:string,role:Guide['role'])=>{const g=byId.get(id);if(!g||g.role!==role)throw Error('Missing '+role+' L guide '+id);return g;};
  const shape=(rings:Ring[])=>own(new api.CrossSection(rings,'NonZero'));
  const lookup=(loops:string[][],role:Guide['role'])=>loops.map(loop=>loop.map(id=>letterTip(guide(id,role))));
  const settings:{height:number;heading:number;groundArea:number;mezzanineArea:number;pierCount:number;panels:number;ties:number}[]=[];
  try{
    if((a.version!==boundaryVersion&&a.version!==halfSpanVersion)||!a.groups.length||byId.size!==a.guides.length)throw Error('Invalid boundary Rule A record.');
    for(const [idx,group] of a.groups.entries()){
      const members:Manifold[]=[],prefix='boundary-'+(idx+1)+'-';
      const groundTips=lookup(group.ground,'ground'),mezzTips=lookup(group.mezzanine,'mezzanine');
      const allGround=groundTips.flat(),allMezz=mezzTips.flat();
      const xy=(loops:number[][][])=>loops.map(loop=>loop.map(([x,y]):Point=>[x,y]));
      const ground=shape(xy(groundTips)),mezz=shape(xy(mezzTips)),groundZ=allGround[0][2],mezzZ=allMezz[0][2],height=mezzZ*2;
      const check=(id:string,pass:boolean,msg:string)=>rule(checks,id,pass,'Component '+(idx+1)+' · '+msg);
      check('AG-05',ground.area()>0&&allGround.every(p=>Math.abs(p[2]-slab)<1e-5),'continuous plate traced from '+allGround.length+' ground tips');
      check('AG-03',mezz.area()>0&&(a.version!==halfSpanVersion||Math.abs(mezz.area()/ground.area()-.5)<.0005)&&mezz.area()<=ground.area()*.501&&own(mezz.subtract(ground)).area()<.025,'mezzanine '+mezz.area().toFixed(2)+' ft² of '+ground.area().toFixed(2)+' ft²');
      check('AG-04',mezzZ-2*slab>8,'lower clear height '+(mezzZ-2*slab).toFixed(2)+' ft');
      check('AG-06',allMezz.every(p=>Math.abs(p[2]-mezzZ)<1e-5),'level mid-height mezzanine and three 0.75 ft slab sections');
      const build=(id:string,profile:CrossSection,bottom:number,top:number,sources:string[],plan=false)=>{
        if(profile.area()<1e-7||top<=bottom)throw Error('Degenerate guide profile '+id);
        const solid=own(own(profile.extrude(top-bottom)).translate([0,0,bottom]));
        if(solid.status()!=='NoError'||solid.volume()<=0)throw Error('Invalid solid '+id);
        members.push(solid);parts.push({id:prefix+id,mesh:siteMesh(solid,origin,datum),sources});
        if(plan)layers.push({name:prefix+id,typology:'flat-deep-plan-plate',top:top+datum,contours:profile.toPolygons().map(r=>r.map(([x,y]):Point=>[origin[0]+x,origin[1]+y]))});
      };
      const roofPanel=group.panels.find(p=>p.kind==='roof-band')??group.panels.find(p=>p.kind==='end');
      if(!roofPanel)throw Error('Missing roof elevation guides.');
      const roofZ=letterTip(guide(roofPanel.corners[2],'wall'))[2]+slab;
      check('AG-02',Math.abs(roofZ-height+.05)<1e-5,'unperforated roof shares the ground loops and meets the wall-head guides');
      build('ground',ground,groundZ-slab,groundZ,group.ground.flat(),true);
      build('mezzanine',mezz,mezzZ-slab,mezzZ,group.mezzanine.flat(),true);
      build('roof',ground,roofZ-slab,roofZ,[...group.ground.flat(),roofPanel.corners[2]],true);
      for(const [i,id] of group.piers.entries()){
        const g=guide(id,'pier'),[x,y,z]=g.position;
        const axis=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion(...g.rotation));
        const dx=.42*g.size,dy=.45*g.size;
        const profile=shape([[[-dx,-dy],[dx,-dy],[dx,dy],[-dx,dy]].map(([u,v]):Point=>[x+u*axis.x-v*axis.y,y+u*axis.y+v*axis.x])]);
        if(own(profile.subtract(ground)).area()>1e-5)throw Error('Pier leaves the ground-guide footprint.');
        build('pier-'+(i+1),profile,z-.85,roofZ,[id,roofPanel.corners[2]]);
      }
      check('AG-07',group.piers.length>0,group.piers.length+' filled L pockets reach the roof');
      let ties=0,bands=0,ends=0;
      for(const [i,panel] of group.panels.entries()){
        const [p,e,upperEnd,upperStart]=panel.corners.map(id=>letterTip(guide(id,'wall')));
        const dx=e[0]-p[0],dy=e[1]-p[1],length=Math.hypot(dx,dy);
        if(length<.0001||Math.abs(p[2]-e[2])>.00001||Math.abs(upperEnd[2]-upperStart[2])>.00001||
            Math.hypot(upperEnd[0]-e[0],upperEnd[1]-e[1],upperStart[0]-p[0],upperStart[1]-p[1])>.00001)throw Error('Wall guide tips do not define a vertical panel.');
        const u=dx/length,v=dy/length;
        function strip(run:number){return own(shape([[[p[0],p[1]],[p[0]+run*u,p[1]+run*v],
          [p[0]+run*u-wallDepth*v,p[1]+run*v+wallDepth*u],[p[0]-wallDepth*v,p[1]+wallDepth*u]]]).intersect(ground));}
        const panelShape=strip(length);
        build('wall-'+(i+1),panelShape,p[2],upperEnd[2],panel.corners);
        if(panel.kind==='end'){ends++;if(Math.abs(upperEnd[2]-roofZ+slab)>1e-5||Math.min(Math.abs(p[2]-slab),Math.abs(p[2]-mezzZ+2.75))>1e-5)throw Error('Stepped wall levels disagree with the slab guides.');}
        else{bands++;if(Math.abs(upperEnd[2]-p[2]-2)>1e-5)throw Error('Wall band must be 2 ft deep vertically.');}
        if(panel.kind==='mezz-band'&&own(panelShape.intersect(mezz)).area()<1e-5){
          // Hang the free flank from its roof at the leading wall L.
          build('band-tie-'+(i+1),strip(Math.min(length,wallDepth)),upperEnd[2]-.02,roofZ,panel.corners.concat(roofPanel.corners[2]));ties++;
        }
      }
      check('AG-08',bands+ends===group.panels.length,bands+' measured long-flank bands; '+ties+' guide-seated free-flank ties');
      check('AG-09',group.panels.length>0,ends+' end panels following local mezzanine occupancy');
      const combined=own(api.Manifold.union(members));
      const bodies=combined.decompose().map(own).filter(body=>body.volume()>1e-5);
      if(combined.status()!=='NoError'||bodies.length!==1)throw Error('Guide-generated plates and walls did not form one connected component ('+bodies.length+').');
      for(const part of members){
        const missing=part.subtract(combined);
        try{if(missing.status()!=='NoError'||Math.abs(missing.volume())>Math.max(.0001,part.volume()*1e-6))throw Error('Join lost material from a guide-generated part.');}finally{missing.delete();}
      }
      check('AG-10',combined.volume()>0,members.length+' positive solids with input-material inclusion and one connected output');
      solids.push(combined);settings.push({height:roofZ,heading:group.heading,groundArea:ground.area(),mezzanineArea:mezz.area(),pierCount:group.piers.length,panels:group.panels.length,ties});
    }
    const solid=api.Manifold.union(solids);
    return {solid,parts,layers,checks,settings};
  }finally{owned.reverse().forEach(s=>s.delete());}
}

export function formBoundary(api:ManifoldToplevel,region:CrossSection,origin:Point,datum:number,bands:HeightBand[],cap:number,options:AdaptiveOptions,halfSpan=false){
  let arrangement=arrangeBoundaryLetters(api,region,bands,cap,options,halfSpan);
  const target=options.letterTarget;
  if(target!==undefined){
    // Regenerate Rule A on a continuous inset or a tighter support grid. Never edit a finished solid.
    let coverage=options.coverage,pitch=12;
    for(let pass=0;pass<5;pass++){
      const count=arrangement.guides.length;
      if(count===target)break;
      if(count>target){
        if(options.spread)break;
        coverage*=Math.max(.3,target/count);
      }else{
        const next=Math.max(6,pitch*Math.sqrt(count/target));
        if(Math.abs(next-pitch)<.05)break;
        pitch=next;
      }
      let trial;
      try{trial=arrangeBoundaryLetters(api,region,bands,cap,{...options,coverage},halfSpan,pitch);}
      catch{break;} // The last valid arrangement still satisfies the site and native rules.
      if(Math.abs(trial.guides.length-target)>=Math.abs(count-target))break;
      arrangement=trial;
    }
  }
  const built=buildBoundaryFromLetters(api,arrangement,origin,datum),solid=built.solid;
  const owned:{delete():void}[]=[],own=<T extends {delete():void}>(s:T)=>{owned.push(s);return s;};
  try{
    const letters=arrangement.guides.map(g=>renderGuide(g,origin,datum)),checks=built.checks;
    const footprint=own(projectMesh(api,siteMesh(solid,origin,datum),origin)),source=own(api.CrossSection.union(letters.map(l=>own(projectMesh(api,l.mesh,origin)))));
    const limits=new Map<string,number>();
    arrangement.groups.forEach((g,i)=>{
      const height=built.settings[i].height+.05;
      for(const id of [...g.ground.flat(),...g.mezzanine.flat(),...g.piers,...g.panels.flatMap(p=>p.corners)])limits.set(id,height);
    });
    for(const l of letters){
      const elevations=l.mesh.positions.filter((_,i)=>i%3===1).map(y=>y-datum);
      if(Math.min(...elevations)<-.00001||Math.max(...elevations)>(limits.get(l.id)??0)+.00001)throw Error('Boundary L crosses the local vertical envelope.');
      for(const b of bands)if(Math.max(...elevations)>b.cap+.00001){
        const projected=own(projectMesh(api,l.mesh,origin));
        if(own(projected.intersect(b.section)).area()>1e-5)throw Error('Boundary L crosses a restricted height band.');
      }
    }
    const area=footprint.area(),outside=own(footprint.subtract(region)).area(),letterOutside=own(source.subtract(region)).area();
    const sources=new Set(built.parts.flatMap(p=>p.sources));
    const gs=arrangement.groups;
    rule(checks,'LA-01',letters.every(l=>sources.has(l.id)),letters.length+' authentic, referenced Ls');
    rule(checks,'LA-02',area<=region.area()*options.coverage/100+.05,'footprint inside the requested area budget');
    rule(checks,'LA-03',arrangement.guides.every(g=>Math.abs(Math.hypot(...g.rotation)-1)<1e-5),'unit rotations in local boundary and span frames');
    rule(checks,'LA-04',gs.every(g=>g.mezzanine.length>0),halfSpan?'measured half-span mezzanine with an open edge':'half-span ribbon with 16 ft maximum reach');
    rule(checks,'LA-05',gs.every(g=>g.piers.length>0),'span-following support rows at a maximum 12 ft pitch');
    rule(checks,'LA-06',arrangement.guides.every(g=>Number.isFinite(g.size)&&g.size>0),'uniform physical size per L');
    rule(checks,'LA-07',gs.every(g=>[...g.ground,...g.mezzanine].every(r=>r.length>=3)),'ordered tip loops including interior boundaries');
    rule(checks,'LA-08',gs.every(g=>g.panels.every(p=>p.corners.length===4)),'four vertical guides per boundary panel');
    rule(checks,'LA-09',arrangement.guides.every(g=>g.size<=({ground:6,mezzanine:6,pier:2,wall:1}[g.role])+1e-8),'role size limits and local clearances');
    rule(checks,'LA-10',letterOutside<.001,'outside letter projection '+letterOutside.toFixed(6)+' ft²');
    rule(checks,'AG-01',outside<.001&&solid.status()==='NoError','outside architectural projection '+outside.toFixed(6)+' ft²');
    return {solid,parts:built.parts,layers:built.layers,letters,sourceArea:source.area(),footprintArea:area,missing:own(region.subtract(footprint)).area(),outside,height:solid.boundingBox().max[2],letterTarget:target??letters.length,
      boundary:{version:arrangement.version,sourceCommit:'d4d1242cacba09bf290af01367090f96e27cdb67',arrangement,components:built.settings,checks,letterOutside,territoryCoveragePercent:100*area/region.area()}};
  }catch(e){solid.delete();throw e;}finally{owned.reverse().forEach(s=>s.delete());}
}
