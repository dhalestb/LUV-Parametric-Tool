const THREE = require('three');
const {getLetterShape} = require('../src/components/letterGeometry3d.ts');
const {featurePoints} = require('./source-profile-envelope.cjs');

function uprightOpening(w, node, field, bearing) {
  const source = node.p;
  const shape = getLetterShape(source.letter);
  const spans = {L:[2,4], U:[5,9], V:[1,3]};
  const curves = shape.curves.slice(...spans[source.letter]);
  const raw = featurePoints({curves}, source.scale * Math.max(source.scaleX, source.scaleY));
  if (source.letter === 'L') raw.push(new THREE.Vector2(raw[0].x, raw.at(-1).y));
  const center = new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
  const matrix = new THREE.Matrix4().fromArray(node.matrix);
  const side = new THREE.Vector3().setFromMatrixColumn(matrix,0).normalize();
  const normal = new THREE.Vector3().setFromMatrixColumn(matrix,2).normalize();
  if (Math.abs(side.z)>1e-8 || Math.abs(normal.z)>1e-8) {
    throw Error(node.id + ': upright opening requires a vertical source plane and horizontal sweep normal.');
  }
  const sourceContour = raw.map(point => new THREE.Vector3(point.x-center.x,point.y-center.y,0).applyMatrix4(matrix).toArray());
  const section = sourceContour.map(([x,y,z]) => [(x-source.x)*side.x+(y-source.y)*side.y,z]);
  const profile = new w.CrossSection([section],'NonZero');
  const xmin = Math.min(...section.map(point=>point[0]));
  const xmax = Math.max(...section.map(point=>point[0]));
  const floor = Math.min(...section.map(point=>point[1]));
  const crown = Math.max(...section.map(point=>point[1]));
  if (profile.isEmpty() || floor<.1 || crown+.8>field.height) {
    throw Error(node.id + ': the upright opening needs floor and roof material within the selected field.');
  }
  const width = xmax-xmin;
  const height = crown-floor;
  const depth = source.alcoveDepth ?? Math.min(source.scale*.42,field.depth*.2);
  const alcove = source.voidKind === 'alcove';
  if (alcove && (!Number.isFinite(depth) || depth<=0 || depth>Math.hypot(field.width,field.depth))) {
    throw Error(node.id + ': invalid upright alcove depth.');
  }
  const reach = Math.hypot(field.width,field.depth)*1.2;
  const axis = normal.toArray();
  let sign = 1;
  const sweep = (crossSection,start,end) => crossSection.extrude(end-start)
    .translate([0,0,sign===1?start:-end])
    .rotate([90,0,source.rz]).translate([source.x,source.y,0]);
  let mouth = -depth*.45;
  if (alcove) {
    const contact = bearing.intersect(sweep(profile,-reach,reach));
    if (!contact.isEmpty()) {
      const vertices = contact.getMesh().vertProperties;
      const distances = [];
      for (let i=0;i<vertices.length;i+=3) {
        distances.push((vertices[i]-source.x)*axis[0]+(vertices[i+1]-source.y)*axis[1]);
      }
      const first = Math.min(...distances);
      const last = Math.max(...distances);
      if (Math.abs(last)<Math.abs(first)) {
        sign=-1;
        axis[0]*=-1;
        axis[1]*=-1;
        mouth=-last-.06;
      } else mouth=first-.06;
    }
  }
  const back = mouth+depth;
  const wall = .8;
  const frame = new w.CrossSection([[
    [xmin-wall,0],[xmax+wall,0],[xmax+wall,crown+wall],[xmin-wall,crown+wall]
  ]]);
  const host = source.lift && !alcove ? null : sweep(frame,alcove?mouth:-1.5,alcove?back+wall:1.5);
  const solid = sweep(profile,alcove?mouth-.04:-reach,alcove?back:reach);
  const point = (x,d,z) => [source.x+side.x*x+axis[0]*d,source.y+side.y*x+axis[1]*d,z];
  const mid = (xmin+xmax)/2;
  const probeZ = floor+height*.65;
  const probe = {start:point(mid,-reach,probeZ),end:point(mid,alcove?back-.04:reach,probeZ)};
  const roofSection = new w.CrossSection([[
    [xmin,crown+.1],[xmax,crown+.1],[xmax,crown+.3],[xmin,crown+.3]
  ]]);
  return {
    host,
    tool:{
      id:'directional-'+node.id,source:node.id,solid,
      cuttingSolid:solid.minkowskiSum(w.Manifold.cube([.00004,.00004,.00004],true)),
      ...probe,alcove,width,height,depth:alcove?depth:2*reach,
      approach:alcove?sweep(profile,-reach,mouth):null,
      backing:alcove?sweep(profile,back+.16,back+.56):null,
      soffit:alcove?sweep(roofSection,mouth+depth*.1,back-depth*.1):null,
      checks:alcove?{back:point(mid,back+.4,probeZ),roof:point(mid,mouth+depth*.5,crown+.2)}:null
    },
    report:{
      source:node.id,axis,yaw:source.rz,tilt:source.rx,rotationOrder:source.rotationOrder,
      profile:source.letter+' actual upright inner contour',sourceContour,section,
      sourcePlaneOrigin:[source.x,source.y,source.z+field.height/2],
      side:side.toArray(),sourceNormal:normal.toArray(),
      probe,alcove,depth:alcove?depth:undefined,mouth:alcove?mouth:undefined,
      back:alcove?back:undefined,profileBounds:{xmin,xmax,floor,crown},
      sourceMatrix:node.matrix
    }
  };
}
module.exports = {uprightOpening};
