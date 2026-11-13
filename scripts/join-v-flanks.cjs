// Continue an adjacent perimeter wall beyond the near V flank to the far
// exterior flank. The near-flank strip is redundant and is not constructed.
function joinVFlanks(w, blocks, parts, raw, seams, clip, reach) {
 const wall=(list,id)=>list.find(p=>p.id==='boundary-'+id);
 for(const v of blocks.filter(b=>b.otherFlank)){
  const paths=[{path:v.path,index:v.otherFlank.index===4?6:4},v.otherFlank];
  const neighbors=blocks.filter(b=>b!==v&&b.n.p.levelIndex===v.n.p.levelIndex);
  const options=[];
    const receivingU=neighbors.filter(b=>b.n.p.letter==='U').map(b=>({b,sealed:seams.some(s=>s.source===b.n.id&&s.receiver===v.n.id),volume:wall(parts,b.n.id).solid.intersect(wall(parts,v.n.id).solid).volume()})).filter(q=>q.volume>.1).sort((a,b)=>Number(b.sealed)-Number(a.sealed)||b.volume-a.volume)[0]?.b;
  for(const u of receivingU?[receivingU]:[]){
   for(const l of neighbors.filter(b=>b.n.p.letter==='L')){
    for(const flank of paths){
     const tangent=flank.path[1].clone().sub(flank.path[0]);
     const normal=tangent.clone().cross(v.direction).normalize();
     const corners=flank.path.flatMap(p=>[-.36,.36].map(t=>p.clone().addScaledVector(normal,t)));
     const sweep=w.Manifold.hull(corners.flatMap(p=>[-reach,reach].map(d=>p.clone().addScaledVector(v.direction,d).toArray()))).intersect(clip);
     const uBearing=sweep.intersect(wall(raw,u.n.id).solid),lBearing=sweep.intersect(wall(raw,l.n.id).solid);
     if(uBearing.volume()<=.1||lBearing.volume()<=.1)continue;
     const source=u.path[Math.floor(u.path.length/2)],den=normal.dot(u.direction);
     if(Math.abs(den)<1e-6)continue;
     const distance=Math.abs(normal.dot(flank.path[0].clone().sub(source))/den);
     options.push({flank,normal,corners,sweep,u,l,uBearing,lBearing,distance});
    }
   }
  }
  // The farther exterior flank is A. Stopping at the nearer flank B leaves
  // two free ends; continuing this same U sweep to A closes the perimeter.
  const best=options.sort((a,b)=>b.distance-a.distance)[0];
  if(!best)throw Error('No direct perimeter continuation at '+v.n.id);
  const {flank,normal,corners,sweep,u,l,uBearing,lBearing}=best;
  const anchor=w.Manifold.hull(corners.flatMap(p=>[-.01,.01].map(d=>p.clone().addScaledVector(v.direction,d).toArray())));
  const panel=w.Manifold.hull([anchor,uBearing,lBearing]).intersect(sweep);
  const uPart=wall(parts,u.n.id),lPart=wall(parts,l.n.id);
  const source=u.path[Math.floor(u.path.length/2)];
  if(normal.dot(source.clone().sub(flank.path[0]))<0)normal.negate();
  // Extend only the original curved surface, preserving its cross-section.
  const d=u.direction.clone();
  const target=uBearing.boundingBox();
  const targetPoint=d.clone().fromArray(target.min).lerp(d.clone().fromArray(target.max),.5);
  if(d.dot(targetPoint.clone().sub(source))<0)d.negate();
  const extension=wall(raw,u.n.id).solid.trimByPlane(d.toArray(),d.dot(source)-.01)
   .trimByPlane(normal.toArray(),normal.dot(flank.path[0])-.36);
  uPart.solid=uPart.solid.add(extension);
  lPart.solid=w.Manifold.hull([lPart.solid,lBearing]).intersect(wall(raw,l.n.id).solid);
  wall(parts,v.n.id).solid=panel;
  const redundant=parts.findIndex(p=>p.id==='flank-'+v.n.id);if(redundant>=0)parts.splice(redundant,1);
  const joints=[uPart,lPart].map(part=>{
   const joint=panel.intersect(part.solid),b=joint.boundingBox();
   const sections=Array.from({length:19},(_,i)=>joint.slice(b.min[2]+(b.max[2]-b.min[2])*(i+1)/20).area());
   if(joint.volume()<=.1||sections.some(a=>a<=1e-6))throw Error('Open direct perimeter joint '+v.n.id+' / '+part.owner);
   return {receiver:part.owner,volume:joint.volume(),sectionAreas:sections};
  });
  seams.push({source:v.n.id,receiver:u.n.id,otherReceiver:l.n.id,outerContour:flank.index,kind:'direct B-to-A perimeter joint',redundantFlankRemoved:true,joints});
 }
}
module.exports={joinVFlanks};
