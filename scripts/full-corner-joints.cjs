function sealOpposite(w,blocks,solids,raw,seam){
 const u=blocks.find(p=>p.n.id===seam.panel), l=blocks.find(p=>p.n.id===seam.wall);
 const get=(parts,id)=>parts.find(s=>s.id==='boundary-'+id);
 const normal=l.path[1].clone().sub(l.path[0]).cross(l.direction).normalize(), d=u.direction.clone().negate();
 if(normal.dot(d)<0)normal.negate();
 const offset=normal.dot(l.path[0])+.36;
 const back=normal.clone().negate().toArray();
 const uWall=get(solids,seam.panel), lWall=get(solids,seam.wall);
 const extension=get(raw,seam.panel).solid.trimByPlane(d.toArray(),d.dot(u.path[0])-.005).trimByPlane(back,-offset);
 const bearing=extension.intersect(get(raw,seam.wall).solid);
 if(bearing.volume()<.1)throw Error('Insufficient reverse U bearing');
 const rotate=s=>s.rotate([0,0,-Math.atan2(normal.y,normal.x)*180/Math.PI]).rotate([0,-Math.acos(normal.z)*180/Math.PI,0]);
 const cut=offset-.001;
 const section=rotate(extension).slice(cut);
 const ref=get(raw,seam.panel).solid;
 // Compare to a complete section normal to the sweep, correcting for obliquity.
 const profileArea=rotateToSweep(ref,u.direction).slice(u.direction.dot(u.path[0])).area();
 const expected=profileArea/normal.dot(d);
 const uncovered=section.subtract(rotate(bearing).slice(cut)).area();
 if(Math.abs(section.area()-expected)>.001||uncovered>.0001)throw Error('Incomplete reverse U bearing');
 lWall.solid=w.Manifold.hull([lWall.solid,bearing]).intersect(get(raw,seam.wall).solid);
 uWall.solid=uWall.solid.add(extension).trimByPlane(back,-offset);
 return {source:seam.panel,receiver:seam.wall,sectionArea:section.area(),uncovered,face:normal.toArray(),offset};
}
function rotateToSweep(s,n){
 return s.rotate([0,0,-Math.atan2(n.y,n.x)*180/Math.PI]).rotate([0,-Math.acos(n.z)*180/Math.PI,0]);
}
function fullCornerPier(w,node,parts,field) {
 const T=require('three');
 const transform=new T.Matrix4().fromArray(node.matrix);
 const points=require('../src/components/letterGeometry3d.ts').getLetterShape('L').getPoints();
 const corners=points.map(p=>new T.Vector3(p.x,p.y,0).applyMatrix4(transform));
 if(corners.some(p=>Math.abs(p.z-corners[0].z)>.001))throw Error('Corner L must be horizontal');
 const profile=new w.CrossSection([corners.map(p=>[p.x,p.y])],'EvenOdd');
 const shaft=profile.extrude(field.height);
 const contacts=parts.map(p=>({id:p.id,overlap:p.solid.intersect(shaft)}))
   .filter(p=>p.overlap.volume()>.0001)
   .map(p=>({id:p.id,volume:p.overlap.volume(),base:p.overlap.boundingBox().min[2],top:p.overlap.boundingBox().max[2]}));
 if(!contacts.length)throw Error('Full L pier misses all receivers');
 const top=Math.max(...contacts.map(c=>c.top));
 if(top<corners[0].z)throw Error('Full L pier misses the top level');
 const solid=profile.extrude(top);
 parts.push({id:'corner-pier-'+node.id,owner:node.id,solid});
 return {source:node.id,base:0,top,area:profile.area(),contacts};
}
function joinPlatesToPier(w, parts, floors, pier, sources) {
 const shaft=parts.find(p=>p.id==='corner-pier-'+pier.source).solid;
 for(const source of sources){
   const floor=floors.find(f=>f.source===source), plate=parts.find(p=>p.id===floor.id);
   const mid=(floor.topZ+floor.bottomZ)/2;
   const footprint=shaft.slice(mid).simplify(.0001).toPolygons()[0];
   const center=floor.sourceContour.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/floor.sourceContour.length),[0,0]);
   const edges=footprint.map((a,i)=>{
     const b=footprint[(i+1)%footprint.length], dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
     const outward=[dy/length,-dx/length], midpoint=a.map((v,i)=>(v+b[i])/2);
     const facing=outward.reduce((v,n,j)=>v+n*(center[j]-midpoint[j]),0);
     return {a,b,length,outward,facing,distance:Math.hypot(center[0]-midpoint[0],center[1]-midpoint[1])};
   }).filter(e=>e.length>=2&&e.facing>0).sort((a,b)=>a.distance-b.distance);
   if(!edges.length)throw Error('No exposed pier edge for '+source);
   const {a,b,length,outward}=edges[0];
   const ends=[.04,.96].map(t=>a.map((v,i)=>v+t*(b[i]-v)-.05*outward[i]));
   const plan=w.CrossSection.hull([...floor.sourceContour,...ends]);
   const slab=plan.extrude(floor.thickness).translate([0,0,floor.bottomZ]);
   const overlap=slab.intersect(shaft), volume=overlap.volume();
   if(volume<length*.92*.049*floor.thickness)throw Error('Incomplete plate bearing for '+source);
   plate.solid=slab;
   floor.netArea=plan.area(); floor.sourceContour=plan.toPolygons()[0];
   floor.links.push({source:pier.source,from:ends[0],to:ends[1],width:length*.92});
   pier.contacts.push({id:plate.id,volume,base:floor.bottomZ,top:floor.topZ});
 }
}
function extendBendsToPier(w, perimeters, parts, untrimmed, pier, sources) {
 const shaft=parts.find(part=>part.id==='corner-pier-'+pier.source).solid;
 const seams=[];
 for(const source of sources){
   const block=perimeters.find(part=>part.n.id===source);
   const panel=parts.find(part=>part.id==='boundary-'+source);
   const raw=untrimmed.find(part=>part.id===panel.id).solid;
   const direction=block.direction;
   const start=direction.dot(block.path[0]);
   const sweep=raw.trimByPlane(direction.toArray(),start);
   const overlapDepth=.02;
   const stop=shaft.translate(direction.clone().multiplyScalar(overlapDepth).toArray());
   const segments=sweep.subtract(stop).decompose();
   const anchored=segments.filter(s=>s.intersect(panel.solid).volume()>.001);
   if(anchored.length!==1 || segments.length<2)throw Error('Pier does not cut across '+source);
   const extended=panel.solid.add(anchored[0]);
   const bearing=extended.intersect(shaft);
   const align=s=>rotateToSweep(s,direction);
   const expected=align(raw).slice(start).area();
   const missed=align(raw).slice(start).subtract(align(bearing).project()).area();
   if(bearing.volume()<=0 || missed>.0001)throw Error('Incomplete curved end at '+source+': '+missed);
   panel.solid=extended;
   const box=bearing.boundingBox();
   pier.contacts=pier.contacts.filter(p=>p.id!==panel.id);
   pier.contacts.push({id:panel.id,volume:bearing.volume(),base:box.min[2],top:box.max[2]});
   seams.push({source,receiver:pier.source,sectionArea:expected,uncovered:missed,overlapDepth});
 }
 return seams;
}
module.exports={fullCornerPier,sealOpposite,joinPlatesToPier,extendBendsToPier};
