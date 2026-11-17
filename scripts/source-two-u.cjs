const T=require('three');

function uPlates(w,nodes,field){
  const {Manifold:M,CrossSection:CS}=w;
  const groups=['U','L','V'].map(type=>nodes.filter(n=>n.p.letter===type).sort((a,b)=>a.p.z-b.p.z));
  if(groups.some(g=>g.length!==4))throw Error('Two U plates require four letters of each type.');
  const [us,ls,vs]=groups;
  const height=n=>n.p.z+field.height/2;
  const horizontal=n=>n.line.every(p=>Math.abs(p.z-height(n))<1e-5);
  if(!us.every(horizontal)||!ls.every(horizontal))throw Error('Horizontal U and L source faces are required.');
  const levels=us.map(height);
  if(levels.some((z,i)=>i&&z-levels[i-1]<2))throw Error('Four distinct source elevations are required.');
  const bands=[],floors=[],walls=[];
  const add=(id,owner,other,solid)=>{bands.push({id,owner:owner.id,sources:[owner.id,other.id],solid});return solid;};
  const prism=(plan,z,h)=>plan.extrude(h).translate([0,0,z]);
  // Work in the original glyph plane. Convert the generated member back
  // through the saved source matrix, including scale and rotation order.
  function outline(n){
    const inverse=new T.Matrix4().fromArray(n.matrix).invert();
    return new CS([n.line.map(p=>p.clone().applyMatrix4(inverse).toArray().slice(0,2))],'EvenOdd');
  }
  function world(n,shape,depth){
    return shape.extrude(depth).translate([0,0,-depth/2]).transform(n.matrix);
  }
  const plans=(shape)=>shape.toPolygons().flat();
  const rect=(x,y,width,depth)=>CS.square([width,depth]).translate([x,y]);
  // A finite-width tie between the closest points of two material sections.
  function join(a,b,z,n,m,label){
    const aa=a.slice(z),bb=b.slice(z);
    if(!aa.numVert()||!bb.numVert())throw Error(label+' has no receiving face at its elevation.');
    if(aa.intersect(bb).area()>.12)return;
    let pair,distance=Infinity;
    for(const p of plans(aa))for(const q of plans(bb)){
      const gap=Math.hypot(p[0]-q[0],p[1]-q[1]);
      if(gap<distance){pair=[p,q];distance=gap;}
    }
    const plan=CS.hull(pair.map(p=>CS.circle(.62,12).translate(p)));
    add(label,n,m,prism(plan,z-.22,.44));
  }
  let previousWall;
  for(let i=0;i<4;i++){
    const u=us[i],l=ls[i],v=vs[i],z=levels[i],middle=i===1||i===2;
    const shape=outline(u),ys=plans(shape).map(p=>p[1]),tip=Math.max(...ys);
    // The end of the first straight segment is the spring of the curved bend.
    const bend=u.line[1].clone().applyMatrix4(new T.Matrix4().fromArray(u.matrix).invert()).y;
    const cut=bend+(tip-bend)*(middle?(i===1?.60:.48):.30);
    const trim=shape.intersect(rect(-2,-2,4,cut+2));
    const fill=trim.hull().intersect(rect(-2,-2,4,bend+2));
    const plan=middle?trim.add(fill):trim;
    const slab=world(u,plan,.75/(u.p.scale*u.p.scaleZ)).translate([0,0,-.375]);
    const id=(middle?'plate-':i?'canopy-':'landing-')+u.id;
    add(id,u,l,slab);
    if(middle)floors.push({id,source:u.id,topZ:z,bottomZ:z-.75,thickness:.75,netArea:slab.volume()/.75,links:[],sourceContour:u.line.map(p=>p.toArray())});
    const lShape=outline(l),xy=plans(lShape),xmin=Math.min(...xy.map(p=>p[0])),ymin=Math.min(...xy.map(p=>p[1]));
    const local=lShape.intersect(rect(xmin-.001,ymin-.001,.001+.70*(Math.max(...xy.map(p=>p[0]))-xmin),.001+.35*(Math.max(...xy.map(p=>p[1]))-ymin)));
    const bottom=i?levels[i-1]-.15:Math.max(0,z-2),top=i===3?z+3:z+1;
    const wall=world(l,local,(top-bottom)/(l.p.scale*l.p.scaleZ)).translate([0,0,(top+bottom)/2-height(l)]);
    add('boundary-'+l.id,l,u,wall);
    walls.push({source:l.id,supportZ:bottom,contacts:[],rule:'Partial horizontal L corner extended vertically between source levels.'});
    join(slab,wall,z-.37,u,l,'plate-tie-'+u.id);
    const contact=wall.intersect(slab).volume();
    walls.at(-1).contacts.push({floor:id,volume:contact});
    if(middle)floors.at(-1).links.push({source:l.id,from:[u.p.x,u.p.y],to:[l.p.x,l.p.y],width:contact>.001?0:1.24});
    if(previousWall)join(wall,previousWall,levels[i-1]+.25,l,ls[i-1],'return-tie-'+l.id);
    previousWall=wall;
    const vShape=outline(v),vy=plans(vShape).map(p=>p[1]),vmin=Math.min(...vy);
    const frame=world(v,vShape.intersect(rect(-2,vmin-.01,4,.01+.70*(Math.max(...vy)-vmin))),.12);
    add('boundary-'+v.id,v,l,frame);
    const box=frame.boundingBox(),joint=Math.max(bottom+.25,box.min[2]+.65);
    // The retained V typically extends above its L return. Tie its lower fork at the nearest common height.
    if(joint>=Math.min(top,box.max[2])-.22)throw Error(v.id+' has no overlapping wall elevation.');
    join(frame,wall,joint,v,l,'frame-tie-'+v.id);
  }
  const solid=M.union(bands.map(b=>b.solid)).asOriginal().simplify(1e-5);
  if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('U plate envelope is disconnected.');
  const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
  // A through-height void inside the convex plan extent of the assembly.
  const footprints=bands.map(b=>b.solid.project()),occupied=CS.union(footprints);
  const plateEdges=floors.map(f=>bands.find(b=>b.id===f.id).solid.project().offset(1));
  const free=occupied.hull().subtract(occupied.offset(.08)).decompose().filter(region=>plateEdges.every(edge=>region.intersect(edge).area()>1)).sort((a,b)=>b.area()-a.area())[0];
  if(!free||free.area()<4)throw Error('No continuous void beside the source plates.');
  const air=prism(free,levels[0],levels[3]-levels[0]);
  if(Math.abs(solid.intersect(air).volume())>1e-8)throw Error('Protected through-height void obstructed.');
  return {bands,primary:solid,solid,tools:[],projections:[],report:{before:solid.volume(),after:solid.volume(),removed:0,added:0,components:1,overhangs:0,addedProjections:0,operations:[]},
    boundaryReport:{typology:'Inserted Horizontal Plate',version:'two-u',levels:levels.slice(1,3),floors,walls,pockets:[],atrium:{sources:nodes.map(n=>n.id),cutterMesh:pack(air),removedVolume:0},voidPlanArea:free.area(),limitations:['Middle U bends define two plates. Outer Us form a landing and canopy. L returns and cropped V forks are connected geometrically. Structural capacity is untested.']}};
}
module.exports={uPlates};
