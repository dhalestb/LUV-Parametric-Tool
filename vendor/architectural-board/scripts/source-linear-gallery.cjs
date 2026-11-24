// Rule 5B: analytic source-profile development; no voxel or amphitheater terraces.
const fs=require('fs'),path=require('path'),T=require('three');
require('../proof/rule-amphitheater.cjs');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const {validateGallery}=require('../src/components/linearGalleryPopulation.ts');
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
async function buildGallery(r,out){
 if(r.sourceSnapshot?.printGallery===true)return require('./linear-gallery-print.cjs').buildGallery(r,out);
 if(r.linearGallery?.version==='polygonal-v2')return require('./source-polygonal-gallery.cjs').buildPolygonalGallery(r,out);
 validateGallery(r.linearGallery);
 if(!r.source.length)throw Error('Gallery needs source letters.');
 if(r.generator!=='source-preserving')throw Error('Gallery requires source-preserving generation.');
 const {nodes,letters}=require('./source-envelope.cjs').derive(r),w=await require('manifold-3d/manifold.js').default();w.setup();
 const M=w.Manifold,CS=w.CrossSection,{width:W,depth:D,height:H}=r.field,s=r.linearGallery,width=s.width,thickness=.6,bands=[],floors=[],pockets=[],circulation=[];
 const polygon=p=>new CS([p],'NonZero');
 const strip=(a,b,width)=>{const d=dist(a,b);if(d<1e-8)return CS.circle(width/2,24).translate(a);const nx=-(b[1]-a[1])/d*width/2,ny=(b[0]-a[0])/d*width/2;return polygon([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]);};
 const slab=(plan,z)=>plan.extrude(thickness).translate([0,0,z-thickness]);
 const clip=M.cube([W,D,H]).translate([-W/2,-D/2,0]);
 function sectionFor(n,curves){
  const shape=getLetterShape(n.p.letter),center=new T.Box2().setFromPoints(shape.getPoints(32)).getCenter(new T.Vector2());
  const q=new T.Quaternion().setFromEuler(new T.Euler(...[n.p.rx,n.p.ry,n.p.rz].map(T.MathUtils.degToRad),n.p.rotationOrder??'XYZ')),normal=new T.Vector3(0,0,1).applyQuaternion(q);
  // Upright profiles develop into plan using their saved horizontal face axis.
  // Horizontal faces use their actual XY projection. Both keep source scale/yaw.
  const upright=Math.abs(normal.z)<.2,axis=new T.Vector3(1,0,0).applyQuaternion(q),len=Math.hypot(axis.x,axis.y);
  if(upright&&len<.1)throw Error(n.id+': cannot develop horizontal face axis.');
  const points=featurePoints(curves?{curves}:shape,n.p.scale*Math.max(n.p.scaleX,n.p.scaleY));
  if(curves&&n.p.letter==='L')points.push(new T.Vector2(points[0].x,points.at(-1).y));
  const line=points.map(p=>{
   const x=(p.x-center.x)*n.p.scale*n.p.scaleX,y=(p.y-center.y)*n.p.scale*n.p.scaleY;
   if(upright)return [n.p.x+x*axis.x/len-y*axis.y/len,n.p.y+x*axis.y/len+y*axis.x/len];
   return new T.Vector3(p.x-center.x,p.y-center.y,0).applyMatrix4(new T.Matrix4().fromArray(n.matrix)).toArray().slice(0,2);
  });
  return {line,mode:upright?'saved face developed into horizontal plan':'actual horizontal source projection'};
 }
 const lengths=s.path.slice(1).map((p,i)=>dist(p,s.path[i])),cumulative=[0];lengths.forEach(l=>cumulative.push(cumulative.at(-1)+l));
 function station(p){let best;for(let i=0;i<lengths.length;i++){const a=s.path[i],b=s.path[i+1],t=Math.max(0,Math.min(1,((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/lengths[i]**2)),q=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],d=dist(p,q);if(!best||d<best.d)best={d,q,along:cumulative[i]+t*lengths[i],segment:i};}return best;}
 const groups=new Map();
 for(const n of nodes){if(!Number.isSafeInteger(n.p.levelIndex))throw Error('Gallery sources require preserved level indices.');const group=groups.get(n.p.levelIndex)||[];group.push(n);groups.set(n.p.levelIndex,group);}
 const levels=[...groups.entries()].sort((a,b)=>a[0]-b[0]);
 for(const [index,group] of levels){
  group.sort((a,b)=>station([a.p.x,a.p.y]).along-station([b.p.x,b.p.y]).along);
  const zs=group.map(n=>n.p.z+H/2);if(Math.max(...zs)-Math.min(...zs)>.05)throw Error('Gallery level elevations differ; align source elevations within each level.');
  const z=zs.reduce((a,b)=>a+b,0)/zs.length;
  if(z<thickness||z+8>H)throw Error('Gallery level lacks eight feet of review headroom inside field.');
  const plans=[],sourceProfiles=[];
  for(const n of group){
   const shape=getLetterShape(n.p.letter),outer=sectionFor(n),range={L:[2,4],U:[5,9],V:[1,3]}[n.p.letter],inner=sectionFor(n,shape.curves.slice(...range));
   
   let footprint=polygon(outer.line),pocket=polygon(inner.line);
   if(pocket.area()>.5){footprint=footprint.add(pocket);pockets.push({source:n.id,level:index,area:pocket.area(),contour:inner.line,mode:outer.mode});}
   plans.push(footprint);sourceProfiles.push({source:n.id,outer:outer.line,inner:inner.line,mode:outer.mode});
   // Recess enclosure follows the back of the native inner contour; mouth stays open.
   if(n.p.letter==='U'&&inner.line.length>3){
    const back=inner.line.slice(1,-1),wallPlan=CS.union(back.slice(1).map((b,i)=>strip(back[i],b,.35)));
    const wall=wallPlan.extrude(3.2).translate([0,0,z-.1]);
    bands.push({id:'pocket-wall-'+n.id,sources:group.map(n=>n.id),solid:wall});
   }
  }
  const route=[];
  for(let i=0;i<group.length;i++){
   const n=group[i],p=[n.p.x,n.p.y],st=station(p);
   if(i){const prev=station([group[i-1].p.x,group[i-1].p.y]);for(let k=prev.segment+1;k<=st.segment;k++)route.push(s.path[k]);}
   route.push(p);
  }
  const corridor=CS.union(route.slice(1).map((b,i)=>strip(route[i],b,Math.min(4,width*.5))));
  const plan=CS.union([...plans,corridor]),solid=slab(plan,z);
  if(solid.decompose().length!==1)throw Error('Ordered gallery floor is disconnected: '+JSON.stringify({level:index,volumes:solid.decompose().map(x=>x.volume()),route,profiles:sourceProfiles}));
  bands.push({id:'gallery-level-'+index,sources:group.map(n=>n.id),solid});
  floors.push({level:index,z,area:plan.area(),route,sourceProfiles,plan,corridor,solid,sources:group.map(n=>n.id)});
 }
 if(floors.length!==2)throw Error('Legacy gallery operation requires its two saved occupied levels.');
 const floorCirculation=[];
 for(const floor of floors){
 const clearance=floor.corridor.extrude(8).translate([0,0,floor.z+.01]);
 for(const band of bands)if(band.id.startsWith('pocket-wall-'))band.solid=band.solid.subtract(clearance);
 const obstruction=M.union(bands.filter(b=>b.id.startsWith('pocket-wall-')).map(b=>b.solid)).intersect(clearance).volume();
 if(Math.abs(obstruction)>1e-7)throw Error('Pocket walls obstruct the main gallery route.');
 floorCirculation.push({level:floor.level,corridorWidth:Math.min(4,width*.5),clearHeadroom:8,pocketWallObstruction:obstruction});
 }
 // One necessary stair, between the far endpoints of the two source-defined galleries.
 const lower=floors[0],upper=floors[1],start=lower.route[0],end=upper.route.at(-1),rise=upper.z-lower.z,run=dist(start,end),steps=Math.ceil(rise/.6),parts=[];
 if(rise<=0||run<Math.min(width,3))throw Error('No available run for an interlevel connection.');
 for(let i=0;i<steps;i++){
  const t=i/steps,u=(i+1)/steps,a=start.map((v,k)=>v+(end[k]-v)*t),b=start.map((v,k)=>v+(end[k]-v)*u),top=lower.z+rise*(i+1)/steps;
  parts.push(strip(a,b,2.6).extrude(Math.max(thickness,rise/steps+thickness)).translate([0,0,top-Math.max(thickness,rise/steps+thickness)]));
 }
 const stair=M.union(parts);
 bands.push({id:'selective-interlevel-stair',sources:[...lower.sources,...upper.sources],solid:stair});
 circulation.push({from:lower.level,to:upper.level,steps,rise:rise/steps,tread:run/steps,width:2.6,geometricOnly:true,clearHeadroom:8});
 const clearanceTools=[];
 for(let i=0;i<steps-1;i++){const t=(i+.03)/steps,u=(i+.97)/steps,a=start.map((v,k)=>v+(end[k]-v)*t),b=start.map((v,k)=>v+(end[k]-v)*u),top=lower.z+rise*(i+1)/steps;clearanceTools.push(strip(a,b,2.5).extrude(8).translate([0,0,top+.01]));}
 const clearance=M.union(clearanceTools);
 for(const band of bands)if(band.id!=='selective-interlevel-stair')band.solid=band.solid.subtract(clearance);
 const raw=M.union(bands.map(b=>b.solid)),solid=raw.intersect(clip);
 if(Math.abs(solid.intersect(clearance).volume())>1e-7)throw Error('Stair overhead clearance is obstructed.');
 if(raw.subtract(clip).volume()>1e-6)throw Error('Gallery development exceeds field; source poses retained.');
 if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('Gallery architectural solids are disconnected or invalid.');
 // Preserve a vertical, source-path-adjacent open volume. Probe on the right of path.
 const a=s.path[0],b=s.path[1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),center=[(a[0]+b[0])/2+dy/len*width*1.6,(a[1]+b[1])/2-dx/len*width*1.6];
 const voidTool=CS.circle(Math.min(1.2,width*.14),32).translate(center).extrude(upper.z-lower.z+8).translate([0,0,lower.z]);
 const voidObstruction=solid.intersect(voidTool).volume();
 if(voidObstruction>1e-7)throw Error('Shared adjacent open-volume probe is obstructed.');
 // Re-import Float32 export to verify actual delivered topology.
 const architecture=pack(solid),mesh32=new w.Mesh({numProp:3,vertProperties:new Float32Array(architecture.positions),triVerts:new Uint32Array(architecture.indices)});mesh32.merge();const exported=new M(mesh32);
 if(exported.status()!=='NoError')throw Error('Gallery exported mesh invalid: '+exported.status());
 const components=bands.map(b=>({id:b.id,sources:b.sources,mesh:pack(b.solid)}));
 const obj=m=>[...Array.from({length:m.positions.length/3},(_,i)=>'v '+m.positions.slice(i*3,i*3+3).join(' ')),...Array.from({length:m.indices.length/3},(_,i)=>'f '+m.indices.slice(i*3,i*3+3).map(v=>v+1).join(' '))].join('\n');
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'combined-envelope.json'),JSON.stringify(architecture));fs.writeFileSync(path.join(out,'combined-envelope.obj'),obj(architecture));
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({generator:r.generator,validation:{status:solid.status(),outside:0,sourceOutside:0,shellVolumes:solid.decompose().map(s=>s.volume())},instances:nodes.map(n=>({pose:n.p,matrix:n.matrix})),components:components.map((c,i)=>{const file=c.id+'.obj';fs.writeFileSync(path.join(out,file),obj(c.mesh));return {file,sources:c.sources,finalVolume:bands[i].solid.volume()};}),tools:[]}));
 const galleryReport={floors:floors.map(({plan,corridor,solid,...f})=>f),pockets,circulation,floorCirculation,openVolume:{center,obstruction:voidObstruction},solidComponents:1,exportStatus:exported.status(),profileTolerance:.01,limitations:['Profile development of upright letters is planar, not a literal projection of the face.','Stair rise, tread and width are reported; code compliance and structural capacity are not certified.','Open-volume probe verifies a local vertical sight corridor, not complete daylight performance.']};
 fs.writeFileSync(path.join(out,'gallery-report.json'),JSON.stringify(galleryReport,null,2));
 return {architecture,primary:architecture,letters,components,volume:solid.volume(),bounds:solid.boundingBox(),sourceCount:r.source.length,galleryReport,paths:floors.map(f=>({sources:f.sources,line:f.route.map(p=>[...p,f.z])}))};
}
module.exports={buildGallery};
