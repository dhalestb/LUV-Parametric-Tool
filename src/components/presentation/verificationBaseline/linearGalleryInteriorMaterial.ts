import * as THREE from 'three';
import type {AmphitheaterResult} from './amphitheaterInteractiveTypes';

type Surface={id:string;kind:string;zone:string;bottom:number;top:number;sources:string[]};
type Station={sourceId:string;normal:number[];edge:number[][]};
type Patch={normal:THREE.Vector3;plane:number;bounds:THREE.Box3;triangle:THREE.Triangle};

// Presentation material mask. Match the inward skin of a wall, never its jambs or returns.
export function shadeGalleryInterior(form:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,result:AmphitheaterResult){
 const report=result.galleryReport as {surfaces?:Surface[];stations?:Station[];wallThickness?:number}|undefined;
 if(!report?.stations||!report.surfaces||!report.wallThickness)return;
 const byId=new Map(result.components.map(c=>[c.id,c.mesh]));
 const walls:Patch[]=[],floors:Patch[]=[],ceilings:Patch[]=[];
 const tolerance=.018;
 for(const s of report.surfaces){
  const wall=['wall','roof-wall','base-wall'].includes(s.kind),floor=s.kind==='contour-floor',ceiling=s.kind==='roof-plank';
  if(!wall&&!floor&&!ceiling)continue;
  const mesh=byId.get(s.id);if(!mesh)continue;
  const edges=wall?report.stations.filter(e=>e.sourceId===s.sources[0]):[];
  for(let i=0;i<mesh.indices.length;i+=3){
   const [a,b,c]=mesh.indices.slice(i,i+3).map(k=>new THREE.Vector3().fromArray(mesh.positions,k*3));
   const triangle=new THREE.Triangle(a,b,c),normal=triangle.getNormal(new THREE.Vector3());
   if(wall&&!edges.some(e=>{
    const [nx,ny]=e.normal;
    return normal.x*nx+normal.y*ny<-.9999&&Math.abs((a.x-e.edge[0][0])*nx+(a.y-e.edge[0][1])*ny+report.wallThickness!)<tolerance;
   }))continue;
   if(floor&&normal.z<.9999||ceiling&&normal.z>-.9999)continue;
   const patch={normal,plane:normal.dot(a),bounds:new THREE.Box3().setFromPoints([a,b,c]).expandByScalar(tolerance),triangle};
   (wall?walls:floor?floors:ceilings).push(patch);
  }
 }
 const g=form.geometry,attr=g.getAttribute('position');
 // toCreasedNormals produces an unindexed mesh, so a corner can carry two finishes.
 if(g.index)return;
 const colors=new Float32Array(attr.count*3).fill(1),projected=new THREE.Vector3();
 function onPatch(p:THREE.Vector3,patch:Patch){
  if(!patch.bounds.containsPoint(p)||Math.abs(patch.normal.dot(p)-patch.plane)>tolerance)return false;
  return patch.triangle.closestPointToPoint(p,projected).distanceToSquared(p)<tolerance*tolerance;
 }
 for(let i=0;i<attr.count;i+=3){
  const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(attr,i+k));
  const triangle=new THREE.Triangle(a,b,c),p=triangle.getMidpoint(new THREE.Vector3()),n=triangle.getNormal(new THREE.Vector3());
  let inside=false;
  if(Math.abs(n.z)<.001)inside=walls.some(w=>n.dot(w.normal)>.9999&&onPatch(p,w));
  else if(Math.abs(n.z)>.9999){
   // Only paired floor and ceiling surfaces belong to a hollow room. Leave
   // exposed terraces and the underside of the projecting upper mass alone.
   const up=n.z>0,skin=up?floors:ceilings,opposite=up?ceilings:floors;
   inside=skin.some(w=>onPatch(p,w))&&opposite.some(w=>{
    const z=w.triangle.a.z,mid=result.request.field.height/2;
    if(up?(z<=p.z||p.z<mid-.1&&z>mid):(z>=p.z||p.z>mid&&z<mid-.1))return false;
    return onPatch(new THREE.Vector3(p.x,p.y,z),w);
   });
  }
  if(inside)colors.fill(.075,i*3,i*3+9);
 }
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));form.material.vertexColors=true;
}
