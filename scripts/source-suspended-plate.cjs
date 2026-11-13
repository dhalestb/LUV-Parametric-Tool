const {upperTriangles}=require('./source-vertical-envelope.cjs');

function suspendedPlate(w,nodes,letters,field) {
  const M=w.Manifold, CS=w.CrossSection;
  const elevation=n=>n.p.z+field.height/2;
  const footprints=letters.map(l=>CS.union(upperTriangles(l.mesh).map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero'))));
  const profile=n=>footprints[nodes.indexOf(n)];
  const terraces=nodes.filter(n=>n.p.architecturalRole==='terrace' && n.line.every(p=>Math.abs(p.z-elevation(n))<1e-5));
  const levels=[...new Set(terraces.map(elevation))].sort((a,b)=>a-b);
  if(levels.length<3)throw Error('A suspended plate needs a horizontal terrace source between two other levels.');
  const low=levels[0], high=levels.at(-1), middle=terraces.filter(n=>elevation(n)>low&&elevation(n)<high)
    .sort((a,b)=>Math.abs(elevation(a)-(low+high)/2)-Math.abs(elevation(b)-(low+high)/2))[0];
  const z=elevation(middle), thickness=.75;
  const pack=s=>{const mesh=s.getMesh();return {positions:Array.from(mesh.vertProperties),indices:Array.from(mesh.triVerts)};};
  const bounds=CS.square([field.width,field.depth]).translate([-field.width/2,-field.depth/2]);
  const hull=CS.hull(footprints).simplify(.10);
  const outside=hull.offset(2,'Miter',2).intersect(bounds);
  const inside=outside.offset(-1.25,'Miter',2);
  const prism=(shape,start,end)=>shape.extrude(end-start).translate([0,0,start]);
  const atLevel=n=>levels.reduce((a,b)=>Math.abs(elevation(n)-a)<=Math.abs(elevation(n)-b)?a:b);
  const bands=[],sources=nodes.map(n=>n.id);
  const band=(id,owner,solid,parents=[owner.id])=>bands.push({id,owner:owner.id,sources:parents,solid});
  // Leave the front of the enclosure open. Its back follows the world-space source hull.
  const axis=middle.p.rz*Math.PI/180;
  const forward=[-Math.sin(axis),Math.cos(axis)],across=[Math.cos(axis),Math.sin(axis)];
  const points=hull.toPolygons().flat();
  const dot=(p,d)=>p[0]*d[0]+p[1]*d[1];
  const coord=(u,v)=>[u*across[0]+v*forward[0],u*across[1]+v*forward[1]];
  const rect=(u0,u1,v0,v1)=>new CS([[coord(u0,v0),coord(u1,v0),coord(u1,v1),coord(u0,v1)]]);
  const extents=d=>[Math.min(...points.map(p=>dot(p,d))),Math.max(...points.map(p=>dot(p,d)))];
  const [left,right]=extents(across),[front,back]=extents(forward);
  const span=Math.hypot(field.width,field.depth)*2;
  const rear=rect(-span,span,front+.36*(back-front),span);
  // Each source defines a piece of the enclosure at its own level. The
  // projected source centers divide the rear elevation into contiguous bays.
  band("rear-enclosure",middle,prism(outside.subtract(inside).intersect(rear),low,high),sources);
  levels.forEach((level,i)=>{
    const group=nodes.filter(n=>atLevel(n)===level).sort((a,b)=>dot([a.p.x,a.p.y],across)-dot([b.p.x,b.p.y],across));
    const boundaries=[-span,...group.slice(1).map((n,j)=>dot([(n.p.x+group[j].p.x)/2,(n.p.y+group[j].p.y)/2],across)),span];
    const start=i?(levels[i-1]+level)/2:low;
    const end=i+1<levels.length?(levels[i+1]+level)/2:high;
    group.forEach((n,j)=>{
      const bay=rect(boundaries[j]+.1,boundaries[j+1]-.1,-span,span);
      const depth=.15+.035*Math.sqrt(profile(n).area());
      const wall=inside.offset(.2).subtract(inside.offset(-depth)).intersect(rect(-span,span,front+.38*(back-front),span)).intersect(bay);
      band('boundary-'+n.id,n,prism(wall,start+.12,end-.12),group.slice(Math.max(0,j-1),j+2).map(adjacent=>adjacent.id));
    });
  });
  band('lower-datum',terraces.find(n=>elevation(n)===low),prism(outside,low-.75,low+.05),sources);
  band('upper-datum',terraces.find(n=>elevation(n)===high),prism(outside,high-.05,high+.75),sources);
  const group=nodes.filter(n=>atLevel(n)===z);
  const free=inside.offset(-3);
  const deck=CS.hull(group.map(profile)).offset(.5,'Miter',2).intersect(free);
  if(deck.area()<.2*inside.area())throw Error('The source group cannot span enough of the void at the selected elevation.');
  const dp=deck.toPolygons().flat();
  const u=dp.reduce((s,p)=>s+dot(p,across),0)/dp.length;
  const deckBack=Math.max(...dp.map(p=>dot(p,forward)));
  const neck=rect(u-1.2,u+1.2,Math.min(...dp.map(p=>dot(p,forward)))+.5,back+4).intersect(outside.offset(-.75));
  const plate=prism(deck,z-thickness,z),attachment=prism(neck,z-thickness,z);
  if(attachment.intersect(plate).volume()<.1)throw Error('Plate and attachment lack positive contact.');
  const id='plate-'+middle.id;
  band(id,middle,plate,group.map(n=>n.id));
  band('plate-attachment',middle,attachment,[middle.id,...group.map(n=>n.id)]);
  const union=M.union(bands.map(b=>b.solid)).asOriginal().simplify(1e-5);
  const mesh=union.getMesh();
  const exported=new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.vertProperties),triVerts:new Uint32Array(mesh.triVerts)});
  exported.merge();
  const solid=new M(exported);
  if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('The suspended plate and enclosure must form one connected solid.');
  const bottom=low+.06,top=high-.06;
  const gaps={above:prism(deck,z+.01,top),below:prism(deck,bottom,z-thickness-.01)};
  const sideBounds=[['left',-span,Math.min(...dp.map(p=>dot(p,across)))-.01,-span,span],['right',Math.max(...dp.map(p=>dot(p,across)))+.01,span,-span,span],['front',-span,span,-span,Math.min(...dp.map(p=>dot(p,forward)))-.01]];
  const clear=inside.offset(-.9);
  for(const [name,...limits] of sideBounds)gaps[name]=prism(clear.intersect(rect(...limits)),bottom,top);
  for(const [name,gap] of Object.entries(gaps)){
    if(gap.volume()/(name==='above'||name==='below'?deck.area():top-bottom)<1||Math.abs(gap.intersect(solid).volume())>1e-8)throw Error('Insufficient protected airspace '+name);
  }
  const voidSolid=M.union(Object.values(gaps));
  return {bands,primary:solid,solid,tools:[],projections:[],report:{before:solid.volume(),after:solid.volume(),removed:0,added:0,components:1,overhangs:0,addedProjections:0,operations:[]},
    boundaryReport:{version:'suspended',typology:'Inserted Horizontal Plate',levels:[z],floors:[{id,source:middle.id,topZ:z,bottomZ:z-thickness,thickness,netArea:deck.area(),links:[],sourceContour:middle.line.map(p=>p.toArray())}],walls:[],pockets:[],
    clearance:{above:top-z-.01,below:z-thickness-.01-bottom,sideAreas:Object.fromEntries(Object.entries(gaps).slice(2).map(([k,s])=>[k,s.volume()/(top-bottom)])),sectionXY:coord(u,(Math.min(...dp.map(p=>dot(p,forward)))+deckBack)/2)},
    atrium:{sources,cutterMesh:pack(voidSolid),removedVolume:0},limitations:['One horizontal plate meets the rear enclosure through a 2.4-ft-wide attachment. The three remaining sides face open space. Structural capacity is untested.']}};
}
module.exports={suspendedPlate};
