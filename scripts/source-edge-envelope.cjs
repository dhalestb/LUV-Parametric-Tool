const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
function edgeEnvelope(wasm,nodes,field,inward=false,cornerStudy){
 const M=wasm.Manifold, solids=[], perimeters=[], us=[];
 const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 const reach=Math.hypot(field.width,field.depth);
 const automatic=inward&&!cornerStudy;
 const horizontalLs=automatic?nodes.filter(n=>n.p.letter==='L'&&Math.abs(new T.Vector3(0,0,1).transformDirection(new T.Matrix4().fromArray(n.matrix)).z)>0.999999):[];
 if(horizontalLs.length>1)throw Error('This envelope supports one horizontal corner pier.');
 const pierNode=automatic?horizontalLs[0]:cornerStudy&&nodes.find(n=>n.id===cornerStudy.pier);
 for(const n of nodes){
   if(n===pierNode)continue;
   const shape=getLetterShape(n.p.letter), matrix=new T.Matrix4().fromArray(n.matrix);
   const center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2());
   const world=q=>new T.Vector3(q.x-center.x,q.y-center.y,0).applyMatrix4(matrix);
   const faceNormal=new T.Vector3(0,0,1).transformDirection(matrix);
   const verticalAxis=new T.Vector3(n.p.letter==='U'?1:0,n.p.letter==='U'?0:1,0).transformDirection(matrix);
   if(Math.abs(verticalAxis.z)<.9)throw Error('Orient L and V upright and turn U onto its side before generating.');
   const faces=[{axis:0,sign:1,limit:field.width/2},{axis:0,sign:-1,limit:field.width/2},{axis:1,sign:1,limit:field.depth/2},{axis:1,sign:-1,limit:field.depth/2}];
   const position=[n.p.x,n.p.y];
   const face=faces.sort((a,b)=>(a.limit-a.sign*position[a.axis])-(b.limit-b.sign*position[b.axis]))[0];
   const gap=q=>face.limit-face.sign*q.getComponent(face.axis);
   const type=n.p.letter;
   let path,edge,otherFlank;
   if(type==='U'){
     const bend=new T.CurvePath();bend.add(shape.curves[1]);bend.add(shape.curves[2]);
     path=Array.from({length:25},(_,i)=>world(bend.getPointAt((1+i/24)/3)));edge='middle third of outer bend';
     const inner=[0,1].map(t=>world(shape.curves[5].getPoint(t)));
     if(Math.abs(inner[0].z-inner[1].z)>.01||gap(path[12])>gap(inner[0]))throw Error('Turn the U bend toward its nearest cell wall and keep its lower arm level.');
     us.push({n,inner});
   }else{
     const candidates=type==='L'?[5]:[4,6];
     const flankDistance=i=>Math.min(...faces.map(f=>f.limit-f.sign*world(shape.curves[i].getPoint(.5)).getComponent(f.axis)));
     const idx=(automatic||cornerStudy?.flank===n.id)&&type==="V"?candidates.sort((a,b)=>flankDistance(a)-flankDistance(b))[0]:candidates.sort((a,b)=>gap(world(shape.curves[a].getPoint(.5)))-gap(world(shape.curves[b].getPoint(.5))))[0];
     if(automatic && type==='V'){const index=idx===4?6:4;otherFlank={index,path:[0,1].map(t=>world(shape.curves[index].getPoint(t)))};}
     path=[0,1].map(t=>world(shape.curves[idx].getPoint(t)));edge='outer contour '+idx;
     if(type==='L'&&gap(path[0].clone().lerp(path[1],.5))>gap(world(shape.curves[3].getPoint(.5))))throw Error('Turn the outside of the L leg toward its nearest cell wall.');
   }
   if(inward&&type==='L')us.push({n,inner:[0,1].map(t=>world(shape.curves[2].getPoint(t)))});
   const sweep=()=>{
     const d=faceNormal;
     const pieces=[];
     for(let j=1;j<path.length;j++){
       const pts=[j-1,j].flatMap(i=>{const tangent=path[Math.min(i+1,path.length-1)].clone().sub(path[Math.max(0,i-1)]);const offset=new T.Vector3().crossVectors(tangent,d).normalize().multiplyScalar(.36);return [-1,1].flatMap(k=>[-1,1].map(h=>path[i].clone().addScaledVector(offset,k).addScaledVector(d,h*reach).toArray()));});
       pieces.push(M.hull(pts));
     }
     return M.union(pieces).intersect(clip);
   };
   perimeters.push({n,face,edge,sweep,path,otherFlank,direction:faceNormal});
 }
 for(const block of perimeters)solids.push({id:'boundary-'+block.n.id,owner:block.n.id,solid:block.sweep()});
 let floors=[],primary,edgeJoint,limitations=[];
 if(inward){
 for(const {n,inner} of us){
   const z=inner[0].z,mid=inner[0].clone().lerp(inner[1],.5);
   const candidates=[];
   for(const wall of solids.filter(s=>s.id.startsWith('boundary-')&&s.owner!==n.id)){
     for(const polygon of wall.solid.slice(z-.375).toPolygons()){
       for(let j=0;j<polygon.length;j++){
         const a=polygon[j],b=polygon[(j+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
         if(len<2)continue;
         const t=Math.max(0.5,Math.min(len-.5,((mid.x*.2-a[0])*dx+(mid.y*.2-a[1])*dy)/len));
         const x=a[0]+t*dx/len,y=a[1]+t*dy/len;
         if((x-mid.x)*mid.x+(y-mid.y)*mid.y>=0)continue;
         const center=polygon.reduce((s,p)=>[s[0]+p[0]/polygon.length,s[1]+p[1]/polygon.length],[0,0]);
         const half=Math.min(2,t,len-t),ends=[-half,half].map(d=>[x+d*dx/len+(center[0]-(a[0]+b[0])/2)*.4,y+d*dy/len+(center[1]-(a[1]+b[1])/2)*.4]);
         const plan=wasm.CrossSection.hull([...inner.map(p=>[p.x,p.y]),...ends]);
         if(plan.area()<4)continue;
         candidates.push({score:Math.hypot(x,y),plan,ends,wall});
       }
     }
   }
   candidates.sort((a,b)=>a.score-b.score);
   let floor;
   for(const c of candidates){
     const solid=c.plan.extrude(.75).translate([0,0,z-.75]);
     const overlap=c.wall.solid.intersect(solid);
     if(overlap.volume()<.1||overlap.slice(z-.375).area()<.1)continue;
     const id='plate-'+n.id;
     floor={id,source:n.id,topZ:z,bottomZ:z-.75,thickness:.75,sourceContour:c.plan.toPolygons()[0],netArea:c.plan.area(),
       links:[{source:c.wall.owner,from:c.ends[0],to:c.ends[1],width:Math.hypot(c.ends[0][0]-c.ends[1][0],c.ends[0][1]-c.ends[1][1])}]};
     solids.push({id,owner:n.id,solid});floors.push(floor);break;
   }
   if(!floor)throw Error('No inward receiving edge for '+n.id);
 }

}else{
 us.sort((a,b)=>a.inner[0].z-b.inner[0].z);
 if(us.length<2)throw Error('Two U elevations are needed.');
 const idx=Math.floor((us.length-2)/2),pair=us.slice(idx,idx+2);
 const upper=pair[1],receiver=perimeters.filter(b=>b.n.p.letter==='L').sort((a,b)=>Math.abs(a.n.p.z-upper.n.p.z)-Math.abs(b.n.p.z-upper.n.p.z))[0];
 const receiving=solids.find(s=>s.owner===receiver.n.id),z=upper.inner[0].z;
 const outline=receiving.solid.slice(z-.375).toPolygons()[0];
 if(!outline)throw Error('Upper plate misses the L elevation.');
 // Use the long outside edge of the actual section, including oblique walls.
 const uv=pair.flatMap(q=>q.inner.map(v=>[v.x,v.y]));
 function receivingEdge(poly,block){
   if(!poly?.length)throw Error('Plate misses receiving wall.');
   const {axis,sign}=block.face;
   const edges=poly.map((a,i)=>{const b=poly[(i+1)%poly.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return {a,b,len};});
   const longest=Math.max(...edges.map(e=>e.len));
   const e=edges.filter(e=>e.len>=longest*.8).sort((a,b)=>sign*((b.a[axis]+b.b[axis])-(a.a[axis]+a.b[axis])))[0];
   const c=poly.reduce((s,p)=>s.map((v,i)=>v+p[i]/poly.length),[0,0]); const coordinate=t=>e.a.map((v,i)=>v+(e.b[i]-v)*t/e.len+(c[i]-(e.a[i]+e.b[i])/2)*.6);
   const mid=uv.reduce((v,p)=>v+((p[0]-e.a[0])*(e.b[0]-e.a[0])+(p[1]-e.a[1])*(e.b[1]-e.a[1]))/e.len,0)/uv.length;
   const length=Math.min(e.len*.3,6),start=Math.min(e.len-length,Math.max(0,mid-length/2));
   return {coordinate,start,end:start+length};
 }
 const {coordinate,start,end}=receivingEdge(outline,receiver);
 const lower=pair[0],lowerL=perimeters.filter(b=>b.n.p.letter==='L').sort((a,b)=>Math.abs(a.n.p.z-lower.n.p.z)-Math.abs(b.n.p.z-lower.n.p.z))[0];
 const le=receivingEdge(solids.find(s=>s.owner===lowerL.n.id).solid.slice(lower.inner[0].z-.375).toPolygons()[0],lowerL);
 const plan=wasm.CrossSection.hull([...uv,coordinate(start),coordinate(end),le.coordinate(le.start),le.coordinate(le.end)]);
 primary=M.union(solids.map(s=>s.solid));
 for(const {n,inner} of pair){
   const topZ=inner[0].z,solid=plan.extrude(.75).translate([0,0,topZ-.75]),id='plate-'+n.id;
   const links=solids.filter(w=>w.id.startsWith('boundary')&&w.solid.intersect(solid).volume()>.05).map(w=>({source:w.owner,from:coordinate(start),to:coordinate(end),width:0}));
   solids.push({solid,id,owner:n.id});floors.push({id,source:n.id,topZ,bottomZ:topZ-.75,thickness:.75,sourceContour:plan.toPolygons()[0],netArea:plan.area(),links});
 }

 edgeJoint={source:upper.n.id,wall:receiver.n.id,length:end-start,footprintDifference:0};limitations=[upper.n.id+' meets '+receiver.n.id];
 }
 // Trim each wall to the furthest actual contact in either sweep direction.
 const untrimmed=solids.map(s=>({...s}));
 const trimReport=[];
 for(const item of solids.filter(s=>s.id.startsWith('boundary-'))){
   const block=perimeters.find(p=>p.n.id===item.owner);
   const direction=block.direction;
   const project=p=>p[0]*direction.x+p[1]*direction.y+p[2]*direction.z;
   const contacts=untrimmed.filter(other=>other.owner!==item.owner).map(other=>({other,overlap:item.solid.intersect(other.solid)})).filter(c=>c.overlap.volume()>.001);
   
   
   if(inward && block.path.length===2){
     // Cap each chord of the swept profile at its actual solid intersections.
     // A hull inside a convex sweep preserves the receiver's inclined termination.
     const joinedWalls=contacts.filter(c=>c.other.id.startsWith('boundary-')&&c.overlap.volume()>.1);
     if(!joinedWalls.length)throw Error('No sealed wall receiver for '+item.owner);
     const slices=[];
     for(let j=1;j<block.path.length;j++){
       const ends=[j-1,j].flatMap(i=>{
         const tangent=block.path[Math.min(i+1,block.path.length-1)].clone().sub(block.path[Math.max(0,i-1)]);
         const offset=new T.Vector3().crossVectors(tangent,direction).normalize().multiplyScalar(.36);
         return [-1,1].map(sign=>block.path[i].clone().addScaledVector(offset,sign));
       });
       const chord=M.hull(ends.flatMap(p=>[-reach,reach].map(h=>p.clone().addScaledVector(direction,h).toArray()))).intersect(clip);
       const anchor=M.hull(ends.flatMap(p=>[-.005,.005].map(h=>p.clone().addScaledVector(direction,h).toArray())));
       const intersections=contacts.map(c=>chord.intersect(c.overlap)).filter(s=>s.volume()>1e-8);
       if(intersections.length)slices.push(M.hull([anchor,...intersections]));
       else slices.push(anchor.intersect(chord));
     }
     item.solid=M.union(slices);
     trimReport.push({source:item.owner,receivers:joinedWalls.map(c=>c.other.owner)});
     continue;
   }
   const points=contacts.flatMap(c=>{const mesh=c.overlap.getMesh();return Array.from({length:mesh.vertProperties.length/mesh.numProp},(_,i)=>project(mesh.vertProperties.slice(i*mesh.numProp,i*mesh.numProp+3)));});
   const anchors=block.path.map(p=>project(p.toArray()));
   const low=Math.min(...points,...anchors)-.002,high=Math.max(...points,...anchors)+.002;
   item.solid=item.solid.trimByPlane(direction.toArray(),low).trimByPlane(direction.clone().negate().toArray(),-high);
   trimReport.push({source:item.owner,start:low,end:high,receivers:contacts.map(c=>c.other.owner)});
 }
 const seams=inward?require('./seal-curved-walls.cjs').sealCurvedWalls(wasm,perimeters,solids,untrimmed):[];
 if(process.env.LUV_SECTION_OUTPUT){const mesh=solid=>{const m=solid.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}};require('fs').writeFileSync(process.env.LUV_SECTION_OUTPUT,JSON.stringify({walls:solids.map(b=>({id:b.id,mesh:mesh(b.solid)})),trimReport,floors,parts:M.union(solids.map(b=>b.solid)).decompose().length}));}
 const missing=trimReport.filter(r=>!r.receivers.length);if(missing.length)throw Error('Perpendicular wall misses its receiver: '+missing.map(r=>r.source).join(', '));
 if(inward){
   for(const item of solids.filter(s=>s.id.startsWith('boundary-'))){
     const seam=solids.filter(s=>s.id.startsWith('boundary-')&&s!==item).map(s=>item.solid.intersect(s.solid)).some(s=>{
       if(s.volume()<=.1)return false;
       const b=s.boundingBox();
       return Math.max(...b.max.map((v,i)=>v-b.min[i]))>=1;
     });
     if(!seam)throw Error('No finished wall seam for '+item.owner);
   }
 }
 primary=M.union(solids.filter(s=>s.id.startsWith('boundary-')).map(s=>s.solid));

 if(edgeJoint){edgeJoint.overlap=solids.at(-1).solid.intersect(solids.find(s=>s.owner===edgeJoint.wall).solid).volume();if(edgeJoint.overlap<=.05)throw Error('Insufficient receiving-wall overlap.');}
 if(cornerStudy?.fullPier)seams.push(require('./full-corner-joints.cjs').sealOpposite(wasm,perimeters,solids,untrimmed,cornerStudy.joint));
 if(automatic){
   const {sealOpposite}=require('./full-corner-joints.cjs');
   for(const u of perimeters.filter(p=>p.n.p.letter==='U')){
     const reverse=u.direction.clone().negate();
     const candidates=[];
     for(const wall of perimeters.filter(p=>p.path.length===2)){
       const normal=wall.path[1].clone().sub(wall.path[0]).cross(wall.direction).normalize();
       const alignment=normal.dot(reverse);
       if(Math.abs(alignment)<1e-6)continue;
       const distances=u.path.map(p=>normal.dot(wall.path[0].clone().sub(p))/alignment);
       const distance=Math.min(...distances);
       if(distance>0&&distance<reach)candidates.push({wall,distance});
     }
     for(const {wall} of candidates.sort((a,b)=>b.distance-a.distance)){
       try{
         seams.push(sealOpposite(wasm,perimeters,solids,untrimmed,{panel:u.n.id,wall:wall.n.id}));
         break;
       }catch(error){
         if(!['Insufficient reverse U bearing','Incomplete reverse U bearing'].includes(error.message))throw error;
       }
     }
   }
 }
 const pier=(cornerStudy?.fullPier||(automatic&&pierNode))?require('./full-corner-joints.cjs').fullCornerPier(wasm,pierNode,solids,field):pierNode?require("./corner-pier.cjs").cornerPier(wasm,pierNode,solids):undefined;
 if(cornerStudy?.pierPlates)require('./full-corner-joints.cjs').joinPlatesToPier(wasm,solids,floors,pier,cornerStudy.pierPlates);
 if(cornerStudy?.pierBends)seams.push(...require('./full-corner-joints.cjs').extendBendsToPier(wasm,perimeters,solids,untrimmed,pier,cornerStudy.pierBends));
 if(automatic&&pier){
   const {extendBendsToPier,joinPlatesToPier}=require('./full-corner-joints.cjs');
   for(const block of perimeters.filter(p=>p.n.p.letter==='U')){
     const id=block.n.id;
     try{
       seams.push(...extendBendsToPier(wasm,perimeters,solids,untrimmed,pier,[id]));
     }catch(error){
       if(error.message.startsWith('Pier does not cut across ')||error.message.startsWith('Incomplete curved end at '))continue;
       throw error;
     }
     joinPlatesToPier(wasm,solids,floors,pier,[id]);
   }
 }
 if(automatic)seams.push(...require('./join-curved-neighbors.cjs').joinCurvedNeighbors(wasm,perimeters,solids,untrimmed,floors));
 if(automatic)require('./join-v-flanks.cjs').joinVFlanks(wasm,perimeters,solids,untrimmed,seams,clip,reach);
 if(automatic||cornerStudy?.continuousLevels)require('./join-level-plates.cjs').joinLevelPlates(wasm,nodes,solids,floors);
 const solid=M.union(solids.map(s=>s.solid)).asOriginal().simplify(1e-5);
 if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('Exterior envelope is disconnected.');
 const bands=solids.map(item=>({...item,sources:[...new Set([item.owner,...solids.filter(s=>s.owner!==item.owner&&s.solid.intersect(item.solid).volume()>.001).map(s=>s.owner)])]}));
 const walls=perimeters.map(p=>({source:p.n.id,rule:p.edge+' facing '+(p.face.sign>0?'+':'−')+'XY'[p.face.axis],supportZ:solids.find(s=>s.owner===p.n.id).solid.boundingBox().min[2],contacts:floors.map(f=>({floor:f.id,volume:solids.find(s=>s.id===f.id).solid.intersect(solids.find(s=>s.owner===p.n.id).solid).volume()}))}));
 return {solid,primary,bands,tools:[],projections:[],report:{before:primary.volume(),after:solid.volume(),removed:0,added:solid.volume()-primary.volume(),components:1,overhangs:0,addedProjections:0,operations:[]},boundaryReport:{version:'edge-connected',typology:'Inserted Horizontal Plate',floors,walls,pockets:[],pier,seams,trimReport,edgeJoint,limitations}};
}
module.exports={edgeEnvelope};
