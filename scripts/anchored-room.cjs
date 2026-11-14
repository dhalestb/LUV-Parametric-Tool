const THREE = require('three');
const { getLetterShape } = require('../src/components/letterGeometry3d.ts');

function feature(node, edges) {
  const shape = getLetterShape(node.p.letter);
  const center = new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
  const transform = new THREE.Matrix4().fromArray(node.matrix);
  return edges.flatMap((i, index) => {
    const curve = shape.curves[i];
    const points = curve.getPoints(curve.type === 'LineCurve' ? 1 : 32);
    return points.slice(index ? 1 : 0).map(p =>
      new THREE.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(transform));
  });
}

function anchoredRoom(w,nodes,field,outerPilot) {
  const {Manifold:M,CrossSection:C}=w;
  const base=outerPilot.boundaryReport;
  const [u,l,v]=base.roomSources.map(id=>nodes.find(n=>n.id===id));
  const curve=[...feature(u,[1]),...feature(u,[2]).slice(1)].sort((a,b)=>a.z-b.z);
  const foot=feature(l,[2]), flank=feature(v,[4]);
  const origin=curve[0];
  const depthAxis=new THREE.Vector3(0,0,1).transformDirection(new THREE.Matrix4().fromArray(u.matrix)).setZ(0).normalize();
  if(depthAxis.dot(foot[0].clone().sub(origin))<0) depthAxis.negate();
  const across=new THREE.Vector3(-depthAxis.y,depthAxis.x,0);
  if(across.dot(foot[0].clone().sub(curve[Math.floor(curve.length/2)]))<0) across.negate();
  const x=p=>across.dot(p.clone().sub(origin)), y=p=>depthAxis.dot(p.clone().sub(origin));
  const floor=base.floorZ, th=.45;
  const high=curve.at(-1), low=curve[0];
  const shear=(y(high)-y(low))/(high.z-low.z);
  const depth=foot.reduce((s,p)=>s+y(p),0)/foot.length;
  const right=Math.max(...foot.map(x));
  const left=Math.min(...curve.map(x));
  const valleyZ=Math.max(floor+8.7,...flank.map(p=>p.z));
  const rise=(Math.max(...flank.map(p=>p.z))-Math.min(...flank.map(p=>p.z)))*.30;
  const span=right-left;
  if(span<5||depth<5||valleyZ+rise+3>base.outerRoofZ)throw Error('The U/L/V cluster cannot enclose a clear room.');
  // Extend the upper end of the actual bend to a folded cap. The valley location
  // follows the horizontal position of the V tip inside the room section.
  const tip=flank.reduce((a,b)=>a.z<b.z?a:b);
  const valley=Math.max(x(high)+span*.18,Math.min(right-span*.18,x(tip)));
  const outline=[[right,low.z],[right,valleyZ+rise],[valley,valleyZ],[x(high),valleyZ+rise],
    ...curve.slice().reverse().map(p=>[x(p),p.z])];
  const profile=new C([outline],'EvenOdd');
  const cavity=profile.offset(-th,'Miter');
  const zBand=(z,h)=>C.square([span+10,h]).translate([left-5,z]);
  const usable=profile.intersect(zBand(floor-th,base.outerRoofZ-floor+th));
  const air=cavity.intersect(zBand(floor,base.outerRoofZ-floor));
  const shape=(s,d,start=0)=>s.extrude(d).translate([0,0,start]);
  const volume=shape(usable,depth);
  const internal=shape(air,depth-2*th,th);
  const shell=volume.subtract(internal);
  const doorX=(right+left)*.5;
  const doorway=shape(C.square([3,7.12]).translate([doorX-1.5,floor-.005]),2*th,-th*.5);
  const opened=shell.subtract(doorway);
  // Column-major affine map from section (across, elevation) and sweep depth.
  // Shear restores the measured out-of-plane displacement of the tilted U bend.
  const matrix=[across.x,across.y,0,0,depthAxis.x*shear,depthAxis.y*shear,1,0,
    depthAxis.x,depthAxis.y,0,0,origin.x-depthAxis.x*shear*low.z,origin.y-depthAxis.y*shear*low.z,0,1];
  const map=s=>s.transform(matrix);
  const split=(lo,hi)=>opened.intersect(shape(zBand(lo,hi-lo),depth+1,-.5));
  // Partition the top by its actual folded underside, including the valley.
  const capMask=new C([[[x(high)-.1,valleyZ+rise-.55],[valley,valleyZ-.55],[right+.1,valleyZ+rise-.55],
    [right+.1,valleyZ+rise+1],[x(high)-.1,valleyZ+rise+1]]],'EvenOdd');
  const cap=opened.intersect(shape(capMask,depth));
  const slab=split(floor-th-.01,floor);
  const walls=opened.subtract(cap).subtract(slab);
  const bands=outerPilot.bands.filter(b=>b.id.startsWith('surrounding-'));
  const item=(id,n,s)=>({id,owner:n.id,sources:[n.id,...[u.id,l.id,v.id].filter(id=>id!==n.id)],solid:map(s)});
  const inner=[item('L-floor',l,slab),item('U-room-walls',u,walls),item('V-folded-roof',v,cap)];
  const room=map(opened),footprint=map(volume).project();
  const outer=new C([base.outerPlan],'EvenOdd');
  if(footprint.offset(3).subtract(outer.offset(-th)).area()>.001)throw Error('Room violates the surrounding clearance.');
  const commonFloor=bands.find(b=>b.id==='surrounding-floor');
  commonFloor.solid=commonFloor.solid.subtract(inner[0].solid);
  bands.push(...inner);
  const solid=M.union(bands.map(b=>b.solid)).asOriginal().simplify(1e-5);
  const tol=.0001;
  const probe=map(internal).trimByPlane([0,0,1],floor+.01);
  if(solid.intersect(probe).volume()>tol)throw Error('Room contains an obstruction.');
  const landing=map(doorway).trimByPlane([0,0,1],floor+.01);
  if(solid.intersect(landing).volume()>tol)throw Error('Room doorway is obstructed.');
  const obstacles=solid.trimByPlane([0,0,1],floor+.02).trimByPlane([0,0,-1],-(floor+7.02)).project();
  const clear=outer.offset(-th).subtract(obstacles).offset(-1.25);
  const roomPoint=new THREE.Vector3(doorX,floor+1,depth/2).applyMatrix4(new THREE.Matrix4().fromArray(matrix));
  const contains=(region,p)=>region.intersect(C.square([.02,.02],true).translate(p)).area()>.0001;
  if(!clear.decompose().some(p=>contains(p,[roomPoint.x,roomPoint.y])&&contains(p,base.access.outerLanding)))throw Error('Room is unreachable from the exterior entrance.');
  const roomAir=map(internal).slice(floor+.02);
  const cutaway=M.union(bands.map(b=>b.id.startsWith('surrounding-')&&b.id!=='surrounding-floor'?b.solid.trimByPlane([-1,1,0],0):b.solid));
  return {...outerPilot,solid,primary:solid,cutaway,bands,
    contributionBands:[...outerPilot.contributionBands.filter(b=>!b.id.startsWith('room-contour-')),...inner],
    boundaryReport:{...base,version:'anchored-room',strategy:'U bend swept to L floor with folded V enclosure',contours:undefined,
      roomPlan:footprint.toPolygons()[0],roomInteriorPlan:roomAir.toPolygons()[0],roomRoofZ:valleyZ+rise,
      headroom:valleyZ-.55-floor,clearRoomArea:roomAir.area(),interstitialArea:outer.offset(-th).subtract(footprint).area(),
      door:{width:3,height:7.12},access:{passed:true,clearWidth:2.5,clearHeight:7,roomPoint:[roomPoint.x,roomPoint.y]},
      features:{u:u.id,l:l.id,v:v.id,bend:curve.map(p=>p.toArray()),foot:foot.map(p=>p.toArray()),flank:flank.map(p=>p.toArray()),depth,valleyZ,rise,sectionMatrix:matrix,doorX,roomPoint:roomPoint.toArray(),floorLift:floor-foot[0].z},
      limitations:['Surrounding enclosure and its apertures are retained from the contour study. The copied V flank rise is compressed to 30 percent and mirrored at the valley.']}};
}
module.exports={anchoredRoom};
