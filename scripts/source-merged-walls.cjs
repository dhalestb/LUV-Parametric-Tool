const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const {innerProfile}=require('./source-void-field.cjs');

function mergedWalls(w,nodes,edges,field){
  const M=w.Manifold,CS=w.CrossSection;
  const us=nodes.filter(n=>n.p.letter==='U').sort((a,b)=>a.p.z-b.p.z);
  if (!us.length) throw Error('A U source is required to form a plate.');
  const plateSources = us.length > 2 ? us.slice(1,-1) : us;
  const bands=[],walls=[],floors=[],boundarySegments=[];
  const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
  const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
  const add=(id,node,solid,parents)=>{
    if(solid.volume()<.01)throw Error(id+' has no material.');
    bands.push({id,owner:node.id,sources:[node.id,...parents],solid});return bands.at(-1);
  };
  for(const node of nodes){
    const shape=getLetterShape(node.p.letter),center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2());
    const matrix=new T.Matrix4().fromArray(node.matrix),normal=new T.Vector3(0,0,1).applyMatrix3(new T.Matrix3().getNormalMatrix(matrix)).normalize();
    const outer={L:[0,4,5],U:[0,1,2,3],V:[4,6]}[node.p.letter];
    const solids=[],segments=[];
    for(const curveIndex of outer){
      const points=featurePoints({curves:[shape.curves[curveIndex]]},node.p.scale).map(p=>new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(matrix));
      for(let i=1;i<points.length;i++){
        let a=points[i-1],b=points[i];
        const tangent=b.clone().sub(a).normalize(),outward=tangent.clone().cross(normal).normalize(),mid=a.clone().add(b).multiplyScalar(.5);
        // Glyph contours are counterclockwise. Select outward normals facing
        // the closest of the four cell sides. Upright edge normals can point Z;
        // their horizontal projected contour still defines a vertical ribbon.
        const distances=[field.width/2-mid.x,field.width/2+mid.x,field.depth/2-mid.y,field.depth/2+mid.y];
        const directions=[new T.Vector3(1,0,0),new T.Vector3(-1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,-1,0)];
        const facing=directions[distances.indexOf(Math.min(...distances))];
        if(node.p.letter!=='V'&&outward.dot(facing)<.1)continue;
        const plan=b.clone().sub(a).setZ(0),length=plan.length();
        if(length<.01)continue;
        plan.normalize();
        // Extend only straight source boundary ends along their own direction.
        // Curves use the native adaptive contour, without tangent tails.
        const reach=node.p.letter==='U'&&curveIndex!==0&&curveIndex!==3?0:2.5;
        a=a.clone().addScaledVector(plan,-reach);b=b.clone().addScaledVector(plan,reach);
        const offset=new T.Vector3(-plan.y,plan.x,0).multiplyScalar(.6);
        const tops=[a.clone().add(offset),b.clone().add(offset),b.clone().sub(offset),a.clone().sub(offset)];
        const prism=M.hull([...tops.map(p=>p.toArray()),...tops.map(p=>[p.x,p.y,0])]).intersect(clip);
        solids.push(prism);segments.push({a:a.toArray(),b:b.toArray(),curveIndex,extension:reach,thickness:1.2});
      }
    }
    if(!solids.length)throw Error(node.id+' has no exterior-facing boundary.');
    const parents=edges.filter(e=>nodes[e.i]===node||nodes[e.j]===node).map(e=>nodes[e.i]===node?nodes[e.j].id:nodes[e.i].id);
    add('boundary-'+node.id,node,M.union(solids),parents);
    boundarySegments.push({source:node.id,segments});
    walls.push({source:node.id,supportZ:0,contacts:[],rule:'Exterior-facing source boundary, 1.2-ft vertical ribbon to floor; straight-end extension limited to 2.5 ft.'});
  }
  // The two source mouths define a protected corridor, with one foot inward
  // and three feet outward. Its hull connects the offset openings across levels.
  const mouths=plateSources.map(u=>{
    const contour=innerProfile(w,u).sourceContour,a=contour[0],b=contour.at(-1);
    const direction=new T.Vector3(0,1,0).transformDirection(new T.Matrix4().fromArray(u.matrix));
    return new CS([[a,b].map(p=>[p[0]-direction.x,p[1]-direction.y]).concat([b,a].map(p=>[p[0]+3*direction.x,p[1]+3*direction.y]))],'EvenOdd');
  });
  const protectedPlan=CS.hull(mouths); 
  const low=us[0].p.z+field.height/2,high=us.at(-1).p.z+field.height/2;
  const protectedCut=protectedPlan.offset(.002).extrude(field.height-low+.01).translate([0,0,low-.01]);
  for(const b of bands)b.solid=b.solid.subtract(protectedCut);
  
  const wallBands=bands.slice(),wallUnion=M.union(wallBands.map(b=>b.solid));
  for(const u of plateSources){
    const z=u.p.z+field.height/2;
    if(u.line.some(p=>Math.abs(p.z-z)>1e-5))throw Error('Plate U must remain horizontal.');
    const inner=innerProfile(w,u).cs;
    const candidates=wallBands.filter(b=>b.owner!==u.id).map(b=>({band:b,plan:b.solid.slice(z-.375)})).filter(b=>b.plan.area()>.1);
    let match;
    for(let distance=.25;distance<=8&&!match;distance+=.25){
      match=candidates.map(c=>({...c,contact:c.plan.intersect(inner.offset(distance))})).filter(c=>c.contact.area()>.8).sort((a,b)=>b.contact.area()-a.contact.area())[0];
    }
    if(!match)throw Error(u.id+' cannot reach another source wall within eight feet.');
    // Extend the complete inner-contour plane into the receiving wall.
    // The hull includes its full profile rather than a connector strip.
    const plan=CS.hull([inner,match.contact.offset(.08)]).subtract(protectedPlan.offset(.001)),slab=plan.extrude(.75).translate([0,0,z-.75]).intersect(clip);
    const id='plate-'+u.id;add(id,u,slab,[match.band.owner]);
    const contact=slab.intersect(match.band.solid).volume();
    if(contact<.05)throw Error(u.id+' lacks direct positive-volume wall overlap.');
    floors.push({id,source:u.id,topZ:z,bottomZ:z-.75,thickness:.75,netArea:slab.volume()/.75,sourceContour:innerProfile(w,u).sourceContour,links:[{source:match.band.owner,from:[u.p.x,u.p.y],to:[u.p.x,u.p.y],width:0}],contactVolume:contact});
    walls.find(wall=>wall.source===match.band.owner).contacts.push({floor:id,volume:contact});
  }
  
  const union=M.union(bands.map(b=>b.solid)).asOriginal().simplify(1e-5),mesh=union.getMesh();
  const exported=new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.vertProperties),triVerts:new Uint32Array(mesh.triVerts)});exported.merge();
  const solid=new M(exported);
  if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('Merged wall envelope is disconnected: '+solid.decompose().map(s=>s.volume()).join(','));
  const free=protectedPlan;
  const air=free.extrude(Math.max(.75,high-low)).translate([0,0,low]);
  if(Math.abs(solid.intersect(air).volume())>1e-8)throw Error('Protected void obstructed.');
  
  const overlaps=wallBands.flatMap((a,i)=>wallBands.slice(i+1).map(b=>({sources:[a.owner,b.owner],volume:a.solid.intersect(b.solid).volume()}))).filter(p=>p.volume>.01);
  return {bands,primary:wallUnion,solid,tools:[],projections:[],report:{before:wallUnion.volume(),after:solid.volume(),removed:0,added:solid.volume()-wallUnion.volume(),components:1,overhangs:0,addedProjections:0,operations:[]},
    boundaryReport:{version:'merged-walls',typology:'Inserted Horizontal Plate',levels:floors.map(f=>f.topZ),floors,walls,pockets:[],boundarySegments,wallOverlaps:overlaps,voidPlanArea:free.area(),atrium:{sources:nodes.map(n=>n.id),cutterMesh:pack(air),removedVolume:0},limitations:['Boundary ribbons descend to Z=0; straight edges extend up to 2.5 ft. U interior profiles form plates with direct wall overlap. Structural capacity is untested.']}};
}
module.exports={mergedWalls};
