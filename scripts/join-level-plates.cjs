function joinLevelPlates(w, nodes, parts, floors) {
 const level=new Map(nodes.map(node=>[node.id,node.p.levelIndex]));
 for(const floor of floors.filter(f=>f.source.startsWith('L-'))){
   const neighbors=floors.filter(f=>f.source.startsWith('U-')&&level.get(f.source)===level.get(floor.source));
   if(!neighbors.length) continue;
   const top=neighbors[0].topZ;
   if(neighbors.some(f=>Math.abs(f.topZ-top)>.001)||Math.abs(top-floor.topZ)>=floor.thickness)throw Error('Level plates cannot share an elevation at '+floor.source);
   const part=parts.find(p=>p.id===floor.id);
   const seed=new w.CrossSection([floor.sourceContour]);
   const mid=top-floor.thickness/2;
   const walls=w.Manifold.union(parts.filter(p=>p.id.startsWith('boundary-')).map(p=>p.solid)).slice(mid);
   const landings=[];
   for(const neighbor of neighbors){
     const rawTarget=parts.find(p=>p.id===neighbor.id).solid.slice(mid).subtract(walls);
     // Remove Boolean-section slivers before offsetting; retain all landing thresholds.
     const target=rawTarget.simplify(1e-5);
     if(Math.abs(rawTarget.area()-target.area())>1e-4)throw Error('Plate section simplification changed its area at '+neighbor.source);
     // An inset gives each landing finite area beyond the wall.
     const interior=target.offset(-.75);
     const bounds=interior.bounds();
     if(interior.isEmpty())throw Error('No clear plate landing at '+neighbor.source);
     const center=bounds.min.map((v,i)=>(v+bounds.max[i])/2);
     const patch=target.intersect(w.CrossSection.square([3,3],true).translate(center));
     if(patch.area()<2)throw Error('Insufficient landing at '+neighbor.source);
     landings.push(patch);

   }
   const plan=w.CrossSection.hull([seed,...landings]);
   floor.originalTopZ=floor.topZ;
   floor.topZ=top;floor.bottomZ=top-floor.thickness;
   floor.sourceContour=plan.toPolygons()[0];floor.netArea=plan.area();
   part.solid=plan.extrude(floor.thickness).translate([0,0,floor.bottomZ]);
   floor.plateContacts=neighbors.map(f=>{
     const area=plan.intersect(parts.find(p=>p.id===f.id).solid.slice(mid)).subtract(walls).area();
     if(area<2)throw Error('Incomplete slab union at '+f.source);
     return {source:f.source,clearOverlapArea:area};
   });
 }
}
module.exports={joinLevelPlates};
