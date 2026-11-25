import * as THREE from 'three';

export type FormMesh = {positions: number[]; indices: number[]};
export type DrawingView = 'Perspective' | 'Plan' | 'Side';
export const formFinish = {color:'#F7F6F5', roughness:0.94, flatShading:true};
export function geometryFor(mesh: FormMesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setIndex(mesh.indices);
  g.computeVertexNormals();
  return g;
}

export function meshBox(mesh: FormMesh) {
  const box = new THREE.Box3(), point = new THREE.Vector3();
  for (let i=0; i<mesh.positions.length; i+=3) box.expandByPoint(point.fromArray(mesh.positions,i));
  return box;
}

// Sample the roof envelope at a fixed plan resolution so densely triangulated
// details do not dominate the choice of elevation.
function roofSamples(mesh: FormMesh) {
  const bounds = meshBox(mesh), size = bounds.getSize(new THREE.Vector3());
  const cells = new Map<number, THREE.Vector3>(), p = mesh.positions;
  const step = Math.max(size.x,size.z,1)/64;
  for (let i=0; i<p.length; i+=3) {
    const ix=Math.floor((p[i]-bounds.min.x)/step), iz=Math.floor((p[i+2]-bounds.min.z)/step);
    const key=iz*66+ix, old=cells.get(key);
    if (!old || p[i+1]>old.y) cells.set(key,new THREE.Vector3(p[i],p[i+1],p[i+2]));
  }
  return [...cells.values()];
}

function profileScore(points: THREE.Vector3[], rightX: number, rightZ: number) {
  let min=Infinity,max=-Infinity;
  for(const p of points){const u=p.x*rightX+p.z*rightZ;min=Math.min(min,u);max=Math.max(max,u);}
  const bins=Array<number>(24).fill(-Infinity);
  for(const p of points){
    const u=(p.x*rightX+p.z*rightZ-min)/Math.max(max-min,.001);
    const i=Math.min(23,Math.floor(u*24));
    bins[i]=Math.max(bins[i],p.y);
  }
  const profile=bins.filter(Number.isFinite);
  if(profile.length<2)return 0;
  // Negative covariance rewards a visible descent over the whole silhouette.
  const mid=(profile.length-1)/2;
  return profile.reduce((n,h,i)=>n+(mid-i)*h,0)/(profile.length*profile.length);
}

export function stepDownDirection(mesh: FormMesh) {
  const points=roofSamples(mesh);
  let best=-Infinity, direction=new THREE.Vector3(0,0,1);
  for(let i=0;i<72;i++){
    const yaw=i*Math.PI/36, x=Math.sin(yaw), z=Math.cos(yaw);
    const score=profileScore(points,z,-x);
    if(score>best+.0001){best=score;direction=new THREE.Vector3(x,0,z);}
  }
  return direction;
}

export function drawingCamera(meshes: FormMesh[], view: DrawingView, side: THREE.Vector3, aspect:number) {
  const dir=view==='Side'?side:view==='Plan'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,.85,1).normalize();
  const up=view==='Plan'?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,dir).normalize();
  const vertical=new THREE.Vector3().crossVectors(dir,right);
  const box=new THREE.Box3();
  meshes.forEach(m=>box.union(meshBox(m)));
  const center=box.getCenter(new THREE.Vector3()), radius=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
  const fov=32,tan=Math.tan(THREE.MathUtils.degToRad(fov/2)),p=new THREE.Vector3();
  let halfHeight=.01,distance=radius;
  for(const m of meshes)for(let i=0;i<m.positions.length;i+=3){
    p.fromArray(m.positions,i).sub(center);
    const screen=Math.max(Math.abs(p.dot(right))/aspect,Math.abs(p.dot(vertical)));
    halfHeight=Math.max(halfHeight,screen*1.12);
    distance=Math.max(distance,p.dot(dir)+screen*1.12/tan);
  }
  if(view!=='Perspective')distance=radius*3;
  const camera=view==='Perspective'?new THREE.PerspectiveCamera(fov,aspect,.01,distance+3*radius):
    new THREE.OrthographicCamera(-halfHeight*aspect,halfHeight*aspect,halfHeight,-halfHeight,.01,distance+3*radius);
  camera.up.copy(up);camera.position.copy(center).addScaledVector(dir,distance);camera.lookAt(center);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  return {camera,center,halfHeight};
}

export function studioLights(bounds: THREE.Box3, shadows: boolean, side?: THREE.Vector3) {
  const sphere=bounds.getBoundingSphere(new THREE.Sphere()),radius=Math.max(1,sphere.radius*1.05);
  const group=new THREE.Group();
  const sky=new THREE.HemisphereLight('#ffffff','#636976',side?1.02:.75);
  const key=new THREE.DirectionalLight('#ffffff',1.9);
  let direction=new THREE.Vector3(-1,1.15,-.65);
  if(side){
    const right=new THREE.Vector3(side.z,0,-side.x);
    direction=side.clone().multiplyScalar(.8).addScaledVector(right,-.9);
    direction.y=.85;
  }
  key.target.position.copy(sphere.center);
  key.position.copy(sphere.center).addScaledVector(direction.normalize(),2*radius);
  key.castShadow=shadows;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:radius*.5,far:radius*3.5});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias=radius/5000;key.shadow.bias=-.00005;
  group.add(sky,key,key.target);
  return {group,dispose:()=>key.dispose()};
}
