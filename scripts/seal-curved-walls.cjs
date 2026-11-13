function sealCurvedWalls(wasm, perimeters, solids, untrimmed) {
 const T=require('three'), M=wasm.Manifold, seams=[];
 for(const block of perimeters.filter(b=>b.n.p.letter==='U')){
   const item=solids.find(s=>s.owner===block.n.id),d=block.direction;
   const candidates=[];
   for(const receiver of perimeters.filter(b=>b.path.length===2)){
     const face=receiver.path[1].clone().sub(receiver.path[0]).cross(receiver.direction).normalize();
     if(face.dot(d)<0)face.negate();
     if(face.dot(d)<1e-5)continue;
     const offset=face.dot(receiver.path[0])+.36;
     const raw=untrimmed.find(s=>s.owner===receiver.n.id);
     const cap=[], near=[];
     for(let i=0;i<block.path.length;i++){
       const tangent=block.path[Math.min(i+1,block.path.length-1)].clone().sub(block.path[Math.max(0,i-1)]);
       const across=tangent.cross(d).normalize();
       for(const sign of [-1,1]){
         const p=block.path[i].clone().addScaledVector(across,.36*sign);
         const t=(offset-face.dot(p))/face.dot(d);
         const end=p.clone().addScaledVector(d,t);
         cap.push(end);
         if(t>0 && raw.solid.rayCast(end.clone().addScaledVector(face,.02).toArray(),end.clone().addScaledVector(face,-.02).toArray()).length)near.push(t);
       }
     }
     if(near.length===cap.length)candidates.push({receiver,face,offset,raw,cap,reach:Math.min(...near)});
   }
   candidates.sort((a,b)=>b.reach-a.reach);
   const best=candidates[0];if(!best)throw Error('No full curved receiver for '+item.owner);
   const {receiver,face,offset,raw,cap}=best;
   const full=untrimmed.find(s=>s.owner===item.owner).solid;
   const start=d.dot(block.path[0]);
   const extended=item.solid.add(full.trimByPlane(d.toArray(),start-.005));
   const panel=extended.trimByPlane(face.clone().negate().toArray(),-offset);
   const bearing=panel.intersect(raw.solid);
   const target=solids.find(s=>s.owner===receiver.n.id);
   target.solid=M.hull([target.solid,bearing]).intersect(raw.solid);
   item.solid=panel;
   const angleZ=Math.atan2(face.y,face.x)*180/Math.PI;
   const angleY=Math.acos(Math.max(-1,Math.min(1,face.z)))*180/Math.PI;
   const align=s=>s.rotate([0,0,-angleZ]).rotate([0,-angleY,0]);
   const section=align(panel).slice(offset-.001);
   const uncovered=section.subtract(align(target.solid).slice(offset-.001)).area();
   if(section.area()<.1||uncovered>1e-4)throw Error('Incomplete U end section at '+item.owner+' ('+uncovered+' sq ft).');
   const sectionArea=section.area();
   seams.push({source:item.owner,receiver:receiver.n.id,face:face.toArray(),offset,sectionArea,uncovered,cap:cap.map(p=>p.toArray())});
 }
 return seams;
}
module.exports={sealCurvedWalls};
