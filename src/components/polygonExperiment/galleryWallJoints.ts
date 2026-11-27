import type {Manifold,ManifoldToplevel,Vec3} from 'manifold-3d';
import type {FormationPart} from './continuousFormation';
import type {Point,Ring} from './territories';

type Face={points:Vec3[];nx:number;ny:number;part:FormationPart};
const contactTolerance=.035,reach=8;

function faces(parts:FormationPart[],origin:Point,datum:number){
 const result:Face[]=[];
 for(const part of parts){
  const {indices,positions}=part.mesh;
  for(let i=0;i<indices.length;i+=3){
   const points=indices.slice(i,i+3).map(j=>[positions[3*j]-origin[0],positions[3*j+1]-datum,positions[3*j+2]-origin[1]] as Vec3);
   const [a,b,c]=points;
   const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
   const ny=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const nz=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
   const norm=Math.hypot(nx,ny);
   if(norm>1e-6&&Math.abs(nz)<norm*.6)result.push({points,nx:nx/norm,ny:ny/norm,part});
  }
 }
 return result;
}

// Clip a face in the seam's local (distance along, height, depth) frame.
function clip(poly:Vec3[],axis:0|2,limit:number,sign:number){
 const out:Vec3[]=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  const da=(a[axis]-limit)*sign,db=(b[axis]-limit)*sign;
  if(da>=0)out.push(a);
  if((da<0&&db>0)||(da>0&&db<0)){
   const t=da/(da-db);
   out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2])]);
  }
 }
 return out;
}

export function galleryWallJoints(api:ManifoldToplevel,rings:Ring[],parts:FormationPart[],origin:Point,datum:number,
 emit:(solid:Manifold,sourceIds:string[])=>void){
 const gallery=faces(parts.filter(p=>p.id.startsWith('linear-edge-gallery/')&&p.id.includes('/lower-')&&
  /base-wall-|roof-wall-|\/face-|perimeter closures/.test(p.id)),origin,datum);
 const other=faces(parts.filter(p=>!p.id.startsWith('linear-edge-gallery/')&&
  /wall|enclosure|shell|edge receivers|perimeter supports|seating terrace|full-(base|loft)/i.test(p.id.split('/').slice(1).join('/')||p.id)),origin,datum);
 if(!gallery.length||!other.length)return;
 for(const ring of rings)for(let edge=0;edge<ring.length;edge++){
  const a=ring[edge],b=ring[(edge+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
  if(len<.01)continue;
  const ux=dx/len,uy=dy/len,owned:{delete():void}[]=[];
  function own<T extends {delete():void}>(v:T){owned.push(v);return v;}
  function local(face:Face,lo:number,hi:number){
   let poly=face.points.map(([x,z,y]):Vec3=>[(x-a[0])*ux+(y-a[1])*uy,z,-(x-a[0])*uy+(y-a[1])*ux]);
   if(poly.every(p=>p[0]<0)||poly.every(p=>p[0]>len)||poly.every(p=>p[2]<lo)||poly.every(p=>p[2]>hi))return [];
   poly=clip(clip(poly,0,0,1),0,len,-1);
   return clip(clip(poly,2,lo,1),2,hi,-1);
  }
  try{
   const contact:Ring[]=[],sources=new Set<string>();
   for(const face of other){
    if(-uy*face.nx+ux*face.ny<.8)continue;
    const poly=local(face,-contactTolerance,contactTolerance);
    if(poly.length<3)continue;
    contact.push(poly.map(([u,z])=>[u,z]));
   }
   if(!contact.length)continue;
   const mask=own(new api.CrossSection(contact,'NonZero'));
   if(mask.area()<.001)continue;
   const wedges:Manifold[]=[];
   for(const face of gallery){
    if(-uy*face.nx+ux*face.ny>-.8)continue;
    const poly=local(face,0,reach);
    if(poly.length<3||poly.every(p=>p[2]<.005))continue;
    const outline=own(new api.CrossSection([poly.map(([u,z])=>[u,z] as Point)],'EvenOdd'));
    if(own(outline.intersect(mask)).area()<.001)continue;
    // Sweep only the facing triangle back to the shared boundary. The
    // opposing wall's elevation mask preserves its doorways and open storeys.
    // Seat the joint into the source wall. Its published triangle positions
    // have already made a float round trip and can miss the solid by microns.
    wedges.push(own(api.Manifold.hull([...poly.map(([u,z,d]):Vec3=>[u,z,d+.025]),...poly.map(([u,z]):Vec3=>[u,z,0])])));
    for(const id of face.part.sources)sources.add(id);
   }
   if(!wedges.length)continue;
   const overlap=own(own(api.Manifold.union(wedges)).intersect(own(mask.extrude(reach))));
   if(overlap.isEmpty()||overlap.volume()<.001)continue;
   const oriented=own(own(own(overlap.mirror([0,0,1])).rotate([90,0,0])).rotate([0,0,Math.atan2(dy,dx)*180/Math.PI]));
   emit(own(oriented.translate([a[0],a[1],0])),[...sources]);
  }finally{owned.reverse().forEach(v=>v.delete());}
 }
}

