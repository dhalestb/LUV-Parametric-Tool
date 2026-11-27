import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {candidates,projectMesh,type Letter} from './continuousFormation';
import type {Point} from './territories';

type Own=<T extends {delete():void}>(s:T)=>T;
type Build=(name:string,shape:CrossSection,lo:number,hi:number,sources:string[])=>void;
type Support={body:Manifold;id:string};

// Position each room with clearance from the complete loft silhouettes. A
// horizontal landing joins its threshold to a measured slice of a real loft.
export function suspendRooms(api:ManifoldToplevel,land:CrossSection,origin:Point,datum:number,cap:number,
  shell:number,door:number,head:number,width:number,guides:Letter[],walls:Support[],wanted:number,
  label:Point,prefix:string,own:Own,build:Build){
 const floor=Math.min(12,(cap-head-2*shell)/2),roof=floor+head+2*shell;
 const bearings=walls.map(w=>({id:w.id,section:own(w.body.slice(floor-shell/2))})).filter(w=>!w.section.isEmpty());
 if(!bearings.length)return [];
 const blocked=own(own(api.CrossSection.union(walls.map(w=>own(w.body.project())))).offset(1));
 const usable=own(land.offset(-1)),pool=candidates(usable,label),placed:Letter[]=[],centers:Point[]=[];
 const forbidden:CrossSection[]=[blocked];
 const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const sockets=bearings.flatMap(b=>b.section.toPolygons().flatMap(loop=>loop.map(p=>({p,id:b.id,section:b.section}))));
 for(let i=0;i<wanted;i++){
  const guide=guides[i%guides.length],profile=own(projectMesh(api,guide.mesh,[0,0])),bounds=profile.bounds();
  const center:Point=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[1]+bounds.max[1])/2];
  const raw=own(own(profile.hull()).offset(2.5)),shape=own(raw.translate([-center[0],-center[1]]));
  const ys=guide.mesh.positions.filter((_,j)=>j%3===1),bottom=Math.min(...ys),top=Math.max(...ys);
  const scale=Math.min(1,(cap-floor)/(top-bottom));
  const local=own(shape.scale([scale,scale]));
  const sorted=pool.map(p=>({p,score:centers.length?Math.min(...centers.map(c=>distance(p,c))):-distance(p,label)})).sort((a,b)=>b.score-a.score);
  let seated=false;
  for(const {p} of sorted){
   const room=own(local.translate(p));
   if(own(room.subtract(usable)).area()>.00001||forbidden.some(f=>own(room.intersect(f)).area()>.00001))continue;
   const ordered=sockets.map(b=>({...b,d:distance(p,b.p)})).sort((a,b)=>a.d-b.d);
   for(const seat of ordered){
    if(seat.d<1e-4)continue;
    const ux=(seat.p[0]-p[0])/seat.d,uy=(seat.p[1]-p[1])/seat.d;
    const strip=(half:number,start:number,end:number)=>new api.CrossSection([[[-half,start],[half,start],[half,end],[-half,end]].map(([v,u]):Point=>[p[0]+ux*u-uy*v,p[1]+uy*u+ux*v])],'EvenOdd');
    const landing=own(strip(width/2,0,seat.d+.5));
    if(own(landing.subtract(land)).area()>.0001||own(landing.intersect(seat.section)).area()<.03)continue;
    const id=prefix+'/inner-'+(i+1)+'-'+guide.letter;
    const positions=guide.mesh.positions.map((v,j)=>j%3===0?origin[0]+p[0]+(v-center[0])*scale:j%3===2?origin[1]+p[1]+(v-center[1])*scale:datum+floor+(v-bottom)*scale);
    placed.push({...guide,id,nominalSizeFeet:guide.nominalSizeFeet*scale,mesh:{positions,indices:guide.mesh.indices}});
    const wall=own(room.subtract(own(room.offset(-shell))));
    const opening=own(strip(door/2,0,seat.d));
    build('suspended room floor '+i,room,floor-shell,floor,[id]);
    build('suspended room landing '+i,landing,floor-shell,floor,[id,seat.id]);
    build('suspended room walls '+i,own(wall.subtract(opening)),floor,roof-shell,[id]);
    build('suspended room header '+i,own(wall.intersect(opening)),floor+head,roof-shell,[id]);
    build('suspended room roof '+i,room,roof-shell,roof,[id]);
    forbidden.push(own(room.offset(1)));centers.push(p);seated=true;break;
   }
   if(seated)break;
  }
  if(!seated)break;
 }
 return placed;
}

