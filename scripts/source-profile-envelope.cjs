// Analytic projected contours with local, source-derived horizontal terraces.
// No XY voxel cells and no rounding of source or envelope coordinates.
const CURVE_ERROR_FEET=.01;
function featurePoints(shape,scale){
 const points=[];
 for(const curve of shape.curves){
  if(!points.length)points.push(curve.getPoint(0));
  function split(a,b,depth){
   const start=curve.getPoint(a),end=curve.getPoint(b),edge=end.clone().sub(start),length=edge.lengthSq();
   const error=Math.max(...[.25,.5,.75].map(t=>{
    const point=curve.getPoint(a+t*(b-a)),along=length?Math.max(0,Math.min(1,point.clone().sub(start).dot(edge)/length)):0;
    return point.distanceTo(start.clone().addScaledVector(edge,along))*scale;
   }));
   if(error>CURVE_ERROR_FEET&&depth<10){const mid=(a+b)/2;split(a,mid,depth+1);split(mid,b,depth+1);}
   else points.push(end);
  }
  split(0,1,0);
 }
 return points;
}
function profileEnvelope(wasm,nodes,edges,field,preferred){
 const M=wasm.Manifold,CS=wasm.CrossSection,bands=[];
 const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 for(const [index,node] of nodes.entries()){
  const neighbors=edges.filter(e=>e.i===index||e.j===index).map(e=>nodes[e.i===index?e.j:e.i]);
  const radius=Math.min(preferred*.23,Math.max(2,(node.p.scale+neighbors.reduce((s,n)=>s+n.p.scale,0)/neighbors.length)*.10));
  const polygon=node.line.map(p=>[p.x,p.y]);
  let footprint=new CS([polygon],'NonZero');
  // A genuinely upright source can project to a line. Thicken that projected
  // edge locally instead of changing the source's orientation or dropping it.
  if(footprint.isEmpty()){
   footprint.delete();
   const segments=[];
   for(let i=1;i<polygon.length;i++){
    const disks=[polygon[i-1],polygon[i]].map(p=>CS.circle(.05,16).translate(p));
    segments.push(CS.hull(disks));disks.forEach(d=>d.delete());
   }
   footprint=CS.union(segments);segments.forEach(s=>s.delete());
  }
  const heights=node.line.map(p=>p.z).sort((a,b)=>a-b);
  const low=Math.max(0,heights[0]-3),levels=[heights[0]+1.5,node.matrix[14]+3,heights.at(-1)+4.5];
  const tiers=[];
  for(let tier=0;tier<3;tier++){
   const offset=radius*(3-tier)/3,segments=Math.max(16,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-CURVE_ERROR_FEET/offset))));
   const plan=footprint.offset(offset,'Round',2,segments),top=Math.min(field.height,levels[tier]);
   if(top>low&&!plan.isEmpty())tiers.push(plan.extrude(top-low).translate([0,0,low]));
   plan.delete();
  }
  footprint.delete();
  const solid=M.union(tiers).intersect(clip);
  bands.push({id:'contour-'+node.id,owner:node.id,sources:[node.id,...neighbors.map(n=>n.id)],solid});
 }
 for(const edge of edges){
  const supports=[edge.q,edge.s].map(p=>M.cube([3,3,4],true).translate(p.toArray()));
  bands.push({id:'transition-'+(bands.length+1),sources:[nodes[edge.i].id,nodes[edge.j].id],solid:M.hull(supports).intersect(clip)});
 }
 return bands;
}
module.exports={featurePoints,profileEnvelope,CURVE_ERROR_FEET};

