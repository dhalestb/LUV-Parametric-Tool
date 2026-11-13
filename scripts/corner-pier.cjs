const T=require('three');
function cornerPier(w,n,solids){
 const M=w.Manifold, matrix=new T.Matrix4().fromArray(n.matrix);
 const at=(x,y)=>new T.Vector3(x,y,0).applyMatrix4(matrix);
 const corner=at(-.42,-.45), top=corner.z;
 if(Math.abs(at(.42,.45).z-top)>.001)throw Error('Corner L must be horizontal.');
 const walls=solids.filter(s=>s.id.startsWith('boundary-'));
 const candidates=[];
 for(let i=0;i<walls.length;i++)for(const second of walls.slice(i+1)){
   const first=walls[i],joint=first.solid.intersect(second.solid);
   if(joint.volume()<.1)continue;
   const box=joint.boundingBox(),z=box.max[2];
   if(z>=top-.5||top-z>16)continue;
   const x=Math.max(box.min[0],Math.min(corner.x,box.max[0])),y=Math.max(box.min[1],Math.min(corner.y,box.max[1]));
   candidates.push({first,second,distance:Math.hypot(x-corner.x,y-corner.y)});
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 const joint=candidates[0];
 if(!joint||joint.distance>2)throw Error('Place the outer elbow over a wall junction.');
 const profile=[[-.42,-.45],[-.20,-.45],[-.20,-.38],[-.35,-.38],[-.35,-.23],[-.42,-.23]].map(([x,y])=>at(x,y).toArray().slice(0,2));
 const shaft=new w.CrossSection([profile]).extrude(top);
 // Each upward-facing triangle casts a vertical prism below its actual surface.
 const shadows=[];
 for(const part of solids){
   const mesh=part.solid.getMesh(),a=mesh.vertProperties;
   for(let i=0;i<mesh.triVerts.length;i+=3){
     const tri=Array.from(mesh.triVerts.slice(i,i+3),k=>Array.from(a.slice(k*mesh.numProp,k*mesh.numProp+3)));
     const [p,q,r]=tri;
     if((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])<1e-7||Math.min(...tri.map(v=>v[2]))>=top)continue;
     const clipped=M.hull([...tri,...tri.map(v=>[v[0],v[1],-1])]).intersect(shaft);
     if(clipped.volume()>1e-6)shadows.push(clipped);
   }
 }
 const shadow=M.union(shadows);
 const material=shaft.subtract(shadow.translate([0,0,-.015])).asOriginal().simplify(.00001);
 if(material.boundingBox().min[2]<top-16||material.decompose().length!==1)throw Error('Corner elbow lacks a continuous landing within this level.');
 const contacts=solids.map(s=>({id:s.id,volume:material.intersect(s.solid).volume()})).filter(s=>s.volume>.0001);
 if(!contacts.length)throw Error('No pier landing.');
 solids.push({owner:n.id,id:'corner-pier-'+n.id,solid:material});
 return {source:n.id,top,base:material.boundingBox().min[2],corner:corner.toArray(),junction:[joint.first.id,joint.second.id],contacts};
}
module.exports={cornerPier};
