import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {candidates,projectMesh,type Letter,type SourceStudy} from './continuousFormation';
import type {HeightBand} from './compositionHeights';
import type {Point} from './territories';

type Own=<T extends {delete():void}>(shape:T)=>T;
type Mesh=Letter['mesh'];
const studyId='51c37bd5-0170-47a5-8184-5961d97e7e3a';
export const plateStudyHash='3c63b4c558cc797a59805f03eaa7843ce6b139a6acf9a3fd16643c37184e0f36';
let cached:Promise<SourceStudy>|undefined;

async function loadStudy135():Promise<SourceStudy>{
  const urls=['/experiment-designs/2f90f039-ae47-40b3-bf20-272b1772cc42/rule-a.json',
    '/experiment-architecture/12a20c9e2aec7159b55966ffedac4f4cc70a4f3d2e35169efaf6a67741144fe1.json'];
  const [orientation,architecture]=await Promise.all(urls.map(async url=>{
    const response=await fetch(url);
    if(!response.ok)throw Error('Study 135 could not be loaded.');
    return response.json();
  }));
  if(architecture.provenance.study135?.studyId!==studyId||architecture.provenance.study135.nativeArchitectureHash!==plateStudyHash||
    architecture.parentGeometryHash!==orientation.geometryHash||architecture.components.length!==19||orientation.components.length!==15)
    throw Error('Study 135 is missing its matched letter and architectural records.');
  return {letters:orientation.components,components:architecture.components};
}

export function study135(){
  return cached??=loadStudy135().catch(error=>{cached=undefined;throw error;});
}

export function insertedSitePlate(api:ManifoldToplevel,land:CrossSection,origin:Point,datum:number,height:number,bands:HeightBand[],
  study:SourceStudy,target:number|undefined,limit:number,label:Point,slab:number,own:Own,
  build:(id:string,plan:CrossSection,lo:number,hi:number,ids:string[])=>void,emit:(id:string,s:Manifold,ids:string[])=>void){
  const parts=study.components!,letters:Letter[]=[],vertices:Point[]=[];
  let base=Infinity;
  for(const {mesh} of [...parts,...study.letters]){
    for(let i=0;i<mesh.positions.length;i+=3){
      vertices.push([mesh.positions[i],mesh.positions[i+2]]);
      base=Math.min(base,mesh.positions[i+1]);
    }
  }
  const hull=own(api.CrossSection.hull([vertices])),bounds=hull.bounds();
  const cx=(bounds.min[0]+bounds.max[0])/2,cz=(bounds.min[1]+bounds.max[1])/2;
  const centered=own(hull.translate([-cx,-cz])),occupied:CrossSection[]=[];
  const ground=land.decompose().map(own).filter(p=>p.area()>.01);
  const regions=bands.length?bands.map(b=>({section:own(land.intersect(b.section)),cap:b.cap})):[{section:land,cap:height}];
  const elevations=(mesh:Mesh)=>mesh.positions.filter((_,i)=>i%3===1);
  const low=(mesh:Mesh)=>Math.min(...elevations(mesh))-base;
  const high=(mesh:Mesh)=>Math.max(...elevations(mesh))-base;
  const levelIds=[['L-1','U-2','V-3'],['U-4','V-5','L-6','U-7'],['L-8','U-9','V-10','L-11'],['L-12','U-13','V-14']];
  const courses=levelIds.map(ids=>{
    const walls=parts.filter(p=>ids.some(id=>p.id==='boundary-'+id));
    const plate=parts.find(p=>p.id==='plate-'+ids[0])!;
    const guides=study.letters.filter(l=>ids.includes(l.id));
    return {ids,plate,bottom:Math.max(...walls.map(w=>low(w.mesh))),crest:Math.min(...walls.map(w=>high(w.mesh))),
      required:Math.max(...[...walls,...guides,plate].map(w=>high(w.mesh)))};
  });
  // Share one scale and one vertical datum across the territory. A lower cap
  // removes whole native courses before any plan-fit reduction is considered.
  let scale=Math.min(1,(height-.05)/courses[0].required);
  const pierGuide=study.letters.find(l=>l.id==='L-15')!;
  const pier=parts.find(p=>p.id==='corner-pier-L-15')!;
  const receivers:{center:Point;angle:number;course:number;ids:string[];width:number}[]=[];
  const transitions:{section:CrossSection;high:number;low:number}[]=[];
  for(const upper of regions)for(const lower of regions){
    if(upper.cap<=lower.cap||!courses.some(c=>c.required*scale<=upper.cap&&c.required*scale>lower.cap))continue;
    const seam=own(own(upper.section.offset(.35)).intersect(lower.section));
    // The continuous band can cross the same height boundary several times. Seat its pier on the longest interface.
    const section=seam.decompose().map(own).sort((a,b)=>b.area()-a.area())[0];
    if(section&&section.area()>1)transitions.push({section,high:upper.cap,low:lower.cap});
  }
  transitions.sort((a,b)=>b.section.area()-a.section.area());
  if(transitions.length>limit)throw Error('Inserted Horizontal Plate needs '+transitions.length+' transition columns in this territory. Its share of the five site columns is '+limit+'.');
  // If every available shaft is needed at a height break, the transverse
  // plates carry the native receiver assembly back to those same L piers.
  const reserve=transitions.length;
  const retainNativePier=reserve<limit;
  const count=Math.min(Math.max(1,limit-reserve),target===undefined?Math.max(ground.length,Math.ceil(Math.sqrt(land.area())/28)):Math.max(1,Math.round(target/study.letters.length)));
  const centers:Point[]=[];
  const sites=regions.flatMap(r=>r.section.decompose().map(own).filter(p=>p.area()>1).map(section=>{
    const corners=own(section.simplify(3)).toPolygons().flat();
    return {section,cap:r.cap,points:candidates(section,label).map(p=>({p,corner:Math.min(...corners.map(v=>Math.hypot(p[0]-v[0],p[1]-v[1])))}))};
  })).sort((a,b)=>b.cap-a.cap);
  const visited=new Set<CrossSection>();
  for(let index=0;index<count;index++){
    let pose:{p:Point;scale:number;angle:number;shape:CrossSection;cap:number}|undefined;
    const ordered=[...sites].sort((a,b)=>Number(visited.has(a.section))-Number(visited.has(b.section))||b.cap-a.cap);
    for(const region of ordered){
      const ranked=region.points.map(v=>({...v,rank:(centers.length?Math.min(...centers.map(s=>Math.hypot(s[0]-v.p[0],s[1]-v.p[1]))):0)-Math.abs(v.corner-18)})).sort((a,b)=>b.rank-a.rank);
      for(const trialScale of centers.length?[scale]:[scale,scale*.85,scale*.7]){
        if(courses[0].required*trialScale>region.cap)continue;
        for(const angle of [0,45,90,135,180,225,270,315]){
          const rotated=own(own(centered.scale(trialScale)).rotate(angle));
          for(const {p} of ranked){
            const shape=rotated.translate(p),outside=shape.subtract(region.section);
            const fits=outside.area()<1e-7;outside.delete();
            if(fits&&!occupied.some(other=>{const hit=shape.intersect(other);const overlaps=hit.area()>.00001;hit.delete();return overlaps;})){
              pose={p,scale:trialScale,angle,shape:own(shape),cap:region.cap};break;
            }
            shape.delete();
          }
          if(pose)break;
        }
        if(pose)break;
      }
      if(pose){visited.add(region.section);break;}
    }
    if(!pose)break;
    scale=pose.scale;
    const {p,angle,shape}=pose,theta=angle*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
    centers.push(p);occupied.push(own(shape.offset(1.5)));
    const prefix='inserted-plate/study135-'+(index+1)+'/';
    const active=courses.filter(c=>c.required*scale<=pose!.cap);
    const kept=new Set(active.flatMap(c=>c.ids));
    const pierTop=Math.min(high(pier.mesh)*scale,Math.max(...active.map(c=>c.required))*scale);
    const pierShift=Math.min(0,pose.cap-high(pierGuide.mesh)*scale-.01,pierTop-low(pierGuide.mesh)*scale);
    function coordinates(mesh:Mesh,world:boolean,shift=0){
      const positions:number[]=[];
      for(let i=0;i<mesh.positions.length;i+=3){
        const x=(mesh.positions[i]-cx)*scale,z=(mesh.positions[i+2]-cz)*scale;
        const u=p[0]+cos*x-sin*z,v=p[1]+sin*x+cos*z,y=(mesh.positions[i+1]-base)*scale+shift;
        positions.push(...(world?[origin[0]+u,datum+y,origin[1]+v]:[u,v,y]));
      }
      return positions;
    }
    for(const l of study.letters.filter(l=>kept.has(l.id)||(retainNativePier&&l===pierGuide)))letters.push({...l,id:prefix+l.id,nominalSizeFeet:l.nominalSizeFeet*scale,mesh:{positions:coordinates(l.mesh,true,l===pierGuide?pierShift:0),indices:l.mesh.indices}});
    for(const part of parts){
      if(part===pier&&!retainNativePier)continue;
      if(part!==pier&&!kept.has(part.id.replace(/^(plate|boundary)-/,'')))continue;
      const indices=Uint32Array.from(part.mesh.indices);
      for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
      const mesh=new api.Mesh({numProp:3,vertProperties:Float32Array.from(coordinates(part.mesh,false)),triVerts:indices});
      mesh.merge();
      const solid=own(new api.Manifold(mesh));
      if(solid.isEmpty()||solid.status()!=='NoError')throw Error('Study 135 produced an invalid '+part.id+'.');
      const ids=part.sources.filter(s=>kept.has(s)||(retainNativePier&&s===pierGuide.id)).map(s=>prefix+s);
      // Only the shaft terminates at a lower course. The wall and floor
      // meshes retain their complete source edges and relative heights.
      const body=part===pier?own(solid.trimByPlane([0,0,-1],-pierTop)):solid;
      emit('study135-'+(index+1)+'/'+part.id,body,ids);
      const course=courses.findIndex(c=>c.plate===part);
      if(course>=0){
        const plan=own(body.project()),corners=plan.toPolygons().flat();
        let a=corners[0],b=a,reach=0;
        for(const x of corners)for(const y of corners){const d=Math.hypot(x[0]-y[0],x[1]-y[1]);if(d>reach){a=x;b=y;reach=d;}}
        receivers.push({course,ids,center:[(a[0]+b[0])/2,(a[1]+b[1])/2],angle:Math.atan2(b[1]-a[1],b[0]-a[0]),width:plan.area()/reach});
      }
    }
  }
  if(!centers.length)throw Error('No complete Study 135 receiver course fits the footprint and local height limits.');
  // At a change of course count, seat the native corner L astride the
  // interface. The top part of the shaft bears on the higher side only.
  const joints:{center:Point;id:string}[]=[];
  const src=own(projectMesh(api,pierGuide.mesh,[0,0])),pb=src.bounds();
  const pc:Point=[(pb.min[0]+pb.max[0])/2,(pb.min[1]+pb.max[1])/2];
  const foot=own(own(src.translate([-pc[0],-pc[1]])).scale(scale));
  for(const transition of transitions){

    const sites=transition.section.toPolygons().flatMap(r=>r.flatMap((a,i)=>{
      const b=r[(i+1)%r.length];return [.5,.25,.75,0].map(t=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])] as Point);
    }));
    const mid=transition.section.bounds();
    const distance=(p:Point)=>Math.hypot(p[0]-(mid.min[0]+mid.max[0])/2,p[1]-(mid.min[1]+mid.max[1])/2);
    sites.sort((a,b)=>distance(a)-distance(b));
    let placed=false;
    for(const at of sites){
      for(const deg of [0,90,180,270,45,135,225,315]){
        const r=deg*Math.PI/180,c=Math.cos(r),sn=Math.sin(r);
        const shape=own(own(foot.rotate(deg)).translate(at));
        if(own(shape.subtract(land)).area()>1e-6||occupied.some(s=>own(shape.intersect(s)).area()>.001))continue;
        const legs=regions.map(region=>({cap:region.cap,shape:own(shape.intersect(region.section))})).filter(g=>g.shape.area()>.01);
        if(!legs.some(g=>g.cap===transition.high)||!legs.some(g=>g.cap===transition.low))continue;
        const id='inserted-plate/transition-'+(joints.length+1)+'/L-15';
        const seat=Math.min(...legs.map(g=>g.cap))-.02-(high(pierGuide.mesh)-low(pierGuide.mesh))*scale;
        const positions:number[]=[];
        for(let i=0;i<pierGuide.mesh.positions.length;i+=3){
          const v=pierGuide.mesh.positions,x=(v[i]-pc[0])*scale,y=(v[i+2]-pc[1])*scale;
          positions.push(origin[0]+at[0]+c*x-sn*y,datum+seat+(v[i+1]-base-low(pierGuide.mesh))*scale,origin[1]+at[1]+sn*x+c*y);
        }
        letters.push({...pierGuide,id,nominalSizeFeet:pierGuide.nominalSizeFeet*scale,mesh:{positions,indices:pierGuide.mesh.indices}});
        for(const [j,g] of legs.entries())build('transition-'+(joints.length+1)+'/corner-pier-'+(j+1),g.shape,0,g.cap-.02,[id]);
        occupied.push(shape);joints.push({center:at,id});placed=true;break;
      }
      if(placed)break;
    }
    if(!placed)throw Error('A Study 135 transition column cannot fit at the change from '+transition.high+' to '+transition.low+' ft.');
  }
  for(const [level,course] of courses.entries()){
    const legal=regions.filter(g=>g.cap>=course.required*scale);
    if(!legal.length)continue;
    const occupiedCourse=own(api.CrossSection.union(legal.map(g=>g.section)));
    const guides=receivers.filter(p=>p.course===level);
    if(!guides.length)continue;
    const bottom=course.bottom*scale,crest=course.crest*scale;
    const floor=low(course.plate.mesh)*scale,ceiling=high(course.plate.mesh)*scale;
    for(const [i,piece] of occupiedCourse.decompose().map(own).filter(p=>p.area()>.05).entries()){
      const name='course-'+(level+1)+'/piece-'+(i+1)+'/';
      const rim=own(piece.subtract(own(piece.offset(-slab,'Miter',2))));
      const local=guides.filter(g=>candidatesContain(piece,g.center));
      const receiver=local[0]??guides[0];
      const support=joints.filter(j=>own(own(piece.offset(1)).intersect(own(api.CrossSection.square([1,1],true).translate(j.center)))).area()>.01);
      const ids=Array.from(new Set([...receiver.ids,...support.map(j=>j.id)]));
      build(name+'continuous wall band',rim,bottom,crest,ids);
      // Extend the plate along its measured inner-edge span. At a transition
      // carry the span through the L shaft and terminate at the opposite wall.
      const runs=[...local.map(g=>({at:g.center,angle:g.angle,width:g.width,ids:g.ids})),...support.map(j=>({at:j.center,
        angle:Math.atan2(receiver.center[1]-j.center[1],receiver.center[0]-j.center[0]),width:receiver.width,ids:[...receiver.ids,j.id]}))];
      if(!runs.length){
        const point=candidates(piece,label).find(p=>candidatesContain(piece,p));
        if(!point)throw Error('Unable to seat a transverse plate in the permitted course.');
        runs.push({at:point,angle:receiver.angle,width:receiver.width,ids:receiver.ids});
      }
      const ext=piece.bounds(),length=4*Math.hypot(ext.max[0]-ext.min[0],ext.max[1]-ext.min[1])+40;
      for(const [k,run] of runs.entries()){
        const strip=(width:number)=>own(piece.intersect(own(own(own(api.CrossSection.square([length,width],true)).rotate(run.angle*180/Math.PI)).translate(run.at))));
        build(name+'interior plate-'+(k+1),strip(run.width),floor,ceiling,run.ids);
        build(name+'interior wall band-'+(k+1),strip(slab),bottom,crest,run.ids);
      }
    }
  }
  function candidatesContain(piece:CrossSection,p:Point){
    const probe=own(own(api.CrossSection.square([.05,.05],true)).translate(p));
    return own(probe.intersect(piece)).area()>.001;
  }
  build('entry plate',land,0,slab,letters.filter(l=>l.id.endsWith('/L-15')).map(l=>l.id));
  return letters;
}

