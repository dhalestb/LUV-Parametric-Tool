const THREE = require('three');
const {getLetterShape} = require('../src/components/letterGeometry3d.ts');

module.exports = function suspendedRoom(w, inner, perimeter, outline, field, platformNodes = [], panels = []) {
  const [front, rear, vee] = inner;
  if (inner.map(n => n.p.letter).join('') !== 'LLV') throw Error('The suspended room needs two upright Ls and one V.');
  const {Manifold: M} = w;
  const thickness = .35;
  function point(node, edge, end = false) {
    const shape = getLetterShape(node.p.letter);
    const center = new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
    const p = shape.curves[edge].getPoint(end ? 1 : 0).sub(center);
    return new THREE.Vector3(p.x,p.y,0).applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
  }
  const jamb = point(front,3), top = point(front,3,true);
  const floor = jamb.z-thickness, roof = Math.min(top.z,point(rear,3,true).z);
  if (roof-floor < 7.5) throw Error('The L jamb is too short for the doorway.');
  const target = point(vee,5).lerp(point(vee,0),.5);
  target.z = (floor+roof)/2;
  const planes = [];
  function plane(a, normal) {
    normal.normalize();
    if (target.clone().sub(a).dot(normal)<0) normal.negate();
    planes.push({normal:normal.toArray(), offset:a.dot(normal)});
  }
  for (const n of [front,rear]) {
    const m = new THREE.Matrix4().fromArray(n.matrix);
    plane(point(n,3), new THREE.Vector3(0,0,1).transformDirection(m));
  }
  const sweep = new THREE.Vector3(0,0,1).transformDirection(new THREE.Matrix4().fromArray(vee.matrix));
  for (const edge of [4,6]) {
    const a = point(vee,edge), b = point(vee,edge,true);
    plane(a,b.sub(a).cross(sweep));
  }
  const blank = M.cube([field.width,field.depth,roof-floor]).translate([-field.width/2,-field.depth/2,floor]);
  function cut(solid, inset) {
    for (const p of planes) solid=solid.trimByPlane(p.normal,p.offset+inset);
    return solid;
  }
  const outer = cut(blank,0);
  const cavity = cut(blank,thickness).trimByPlane([0,0,1],floor+thickness).trimByPlane([0,0,-1],-roof+thickness);
  const floorZ = floor+thickness;
  const along = point(front,2).sub(jamb).setZ(0).normalize();
  const inward = new THREE.Vector3(...planes[0].normal);
  const mid = jamb.clone().addScaledVector(along,1.5);
  const angle=Math.atan2(along.y,along.x)*180/Math.PI;
  const box=(width,depth,height,at,z)=>M.cube([width,depth,height],true).rotate([0,0,angle]).translate([at.x,at.y,z]);
  const cutter=box(3,2,7.1,mid,floorZ+3.55);
  const shell=outer.subtract(cavity).subtract(cutter);
  const bounds=outer.boundingBox();
  const section=outer.slice(floorZ+.1);
  if (section.area()<20 || outer.project().offset(.5).subtract(outline).area()>.01) throw Error('Room footprint lacks surrounding space.');
  // Extend the flush landing from the threshold to the first actual perimeter surface.
  const rayStart=mid.clone().setZ(floorZ-.15);
  const rayEnd=rayStart.clone().addScaledVector(inward,-Math.hypot(field.width,field.depth));
  const hit=perimeter.rayCast(rayStart.toArray(),rayEnd.toArray())[0];
  if(!hit) throw Error('No perimeter landing contact on the doorway axis.');
  const reach=rayStart.distanceTo(new THREE.Vector3(...hit.position))+.2;
  const landing=box(3.8,reach+.25,thickness,mid.clone().addScaledVector(inward,(.25-reach)/2),floorZ-thickness/2);
  if(landing.intersect(perimeter).volume()<.005 || landing.intersect(shell).volume()<.005) throw Error('Landing lacks a positive-area connection.');
  const supports=require("./room-edge-platforms.cjs")(w,platformNodes,panels,shell,floor,thickness);
  const room=M.union([shell,landing,...supports.solids]);
  const clear=box(2.95,2,7,mid,floorZ+3.55);
  if(room.intersect(clear).volume()>1e-6 || perimeter.intersect(clear).volume()>1e-6 || cavity.intersect(cutter).volume()<1) throw Error('Doorway does not open through the wall.');
  return {enclosure:room, platforms:supports.measurements, plan:section, inside:cavity.slice(floorZ+.1), floorZ, roof, headroom:roof-floorZ-thickness, landingLength:reach, jamb:jamb.toArray(), bounds};
};
