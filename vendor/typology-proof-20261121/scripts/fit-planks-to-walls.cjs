// Construct a horizontal ribbon from real interior letter edges. Only finished
// architectural solids, never the letter meshes, are allowed to receive its ends.
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const mid=e=>mix(...e,.5);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function fitPlanks(w,nodes,solids,floors,profiles){
 const {CrossSection:C,Manifold:M}=w, replacements=[];
 for(const [level,group] of Map.groupBy(profiles,p=>p.n.p.levelIndex)){
  const ends=group.map(p=>p.inner.map(q=>[q.x,q.y]));
  const points=ends.flat(), center=[0,1].map(i=>points.reduce((s,p)=>s+p[i],0)/points.length);
  const top=group.reduce((s,p)=>s+mid(p.inner.map(q=>[q.z]))[0],0)/group.length,base=top-.75;
  const walls=solids.filter(s=>s.id.startsWith('boundary-')||s.id.startsWith('corner-pier-'));
  const pieces=[], endings=[];
  // A gently waisted ribbon between successive full-width guide sections.
  const order=ends.slice().sort((a,b)=>Math.atan2(...sub(mid(a),center).reverse())-Math.atan2(...sub(mid(b),center).reverse()));
  for(let k=1;k<order.length;k++){
   const a=order[k-1],b=order[k].slice();
   if(dist(a[0],b[0])+dist(a[1],b[1])>dist(a[0],b[1])+dist(a[1],b[0]))b.reverse();
   let prev=a;
   for(let i=1;i<=12;i++){
    const t=i/12,m=mix(mid(a),mid(b),t),ease=Math.sin(Math.PI*t)**2;
    const next=a.map((p,j)=>mix(mix(p,b[j],t),mix(m,center,.17),.38*ease));
    pieces.push(C.hull([...prev,...next]));prev=next;
   }
  }
  const segments=[];
  for(const wall of walls)for(const loop of wall.solid.slice(top-.375).toPolygons())
   loop.forEach((a,i)=>segments.push({a,b:loop[(i+1)%loop.length],wall}));
  function hit(p){
   const d=sub(p,center), hits=[];
   for(const s of segments){
    const v=sub(s.b,s.a),den=cross(d,v);if(Math.abs(den)<1e-8)continue;
    const q=sub(s.a,center),t=cross(q,v)/den,u=cross(q,d)/den;
    if(t>0&&u>=0&&u<=1)hits.push({s,t});
   }
   return hits.sort((a,b)=>a.t-b.t)[0];
  }
  // Extend each guide to the visible wall (including across the source glyph).
  // Use the actual receiver even when a ray through a guide misses a corner.
  for(const [i,e] of ends.entries()){
   const m=mid(e);let h=hit(m);
   if(!h){
    const near=segments.map(s=>{const v=sub(s.b,s.a),u=Math.max(.05,Math.min(.95,sub(m,s.a).reduce((a,x,k)=>a+x*v[k],0)/(dist(s.a,s.b)**2||1)));return mix(s.a,s.b,u)}).sort((a,b)=>dist(a,m)-dist(b,m));
    for(const q of near){h=hit(mix(center,q,1.01));if(h)break;}
   }
   if(!h)throw Error('No receiving wall for '+group[i].n.id);
   const s=h.s,len=dist(s.a,s.b),v=sub(s.b,s.a);
   const t=Math.max(0,Math.min(1,sub(m,s.a).reduce((a,x,k)=>a+x*v[k],0)/(len*len)));
   const width=Math.min(len,dist(...e)),start=Math.max(0,Math.min(1-width/len,t-width/len/2));
   const lip=[start,start+width/len].map(u=>mix(center,mix(s.a,s.b,u),1.15));
   pieces.push(C.hull([...e,...lip,...e.map(q=>mix(q,center,.25))]));
   endings.push({source:group[i].n.id,receiver:s.wall.id});
  }
  const plan=C.union(pieces).simplify(.002);
  // Fit the level footprint to the innermost silhouette through the whole
  // slab thickness. This also catches a tilted face between the two elevations.
  const bounds=plan.bounds(), shadow=[];
  const slab=M.cube([bounds.max[0]-bounds.min[0]+200,bounds.max[1]-bounds.min[1]+200,.75]).translate([bounds.min[0]-100,bounds.min[1]-100,base]);
  for(const wall of walls){
   const band=wall.solid.intersect(slab);
   if(band.isEmpty())continue;
   const inner=band.project().offset(-.10).simplify(.001);
   for(const loop of inner.toPolygons())for(let j=0;j<loop.length;j++){
    const a=loop[j],b=loop[(j+1)%loop.length];
    shadow.push(C.hull([a,b,mix(center,a,40),mix(center,b,40)]));
   }
  }
  const clipped=(shadow.length?plan.subtract(C.union(shadow)):plan).simplify(.002);
  const interior=clipped.decompose().sort((a,b)=>b.area()-a.area())[0];
  if(!interior)throw Error('Plate was entirely trimmed');
  const solid=interior.extrude(.75).translate([0,0,base]);
  const joints=walls.map(s=>({source:s.owner,id:s.id,volume:s.solid.intersect(solid).volume()})).filter(j=>j.volume>.001);
  if(solid.decompose().length!==1||endings.some(e=>!joints.some(j=>j.id===e.receiver)))throw Error('Incomplete plate-to-wall joint at level '+(level+1)+': '+JSON.stringify(endings.filter(e=>!joints.some(j=>j.id===e.receiver))));
  const owners=group.map(p=>p.n.id),f=floors.find(f=>f.source===owners[0]),section=solid.slice(top-.375);
  replacements.push({...f,topZ:top,bottomZ:base,netArea:section.area(),sourceContour:section.toPolygons()[0],links:joints,sourceEdges:owners,finishedWallJoints:joints,endings});
  solids.find(p=>p.id===f.id).solid=solid;
  for(const other of floors.filter(q=>owners.includes(q.source)&&q!==f)){const idx=solids.findIndex(s=>s.id===other.id);if(idx>=0)solids.splice(idx,1);}
 }
 floors.splice(0,floors.length,...replacements);
}
module.exports={fitPlanks};
