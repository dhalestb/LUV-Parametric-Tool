// Lobby spaces keep the saved letter poses.
// Every typology uses horizontal terraces, vertical exterior walls, and a 0.75 ft platform.
// The opening cutter follows each letter's saved rotation and imprints that contour through the form.
const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
const {upperTriangles}=require('./source-vertical-envelope.cjs');

function pack(solid){const mesh=solid.getMesh();return {positions:Array.from(mesh.vertProperties),indices:Array.from(mesh.triVerts)};}
function hull2d(points){
 const unique=[];
 for(const p of points){if(!unique.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-4))unique.push(p);}
 if(unique.length<3)return null;
 unique.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lower=[];
 for(const p of unique){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 const upper=[];
 for(const p of unique.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 lower.pop();upper.pop();
 return [...lower,...upper];
}
function planOf(CS,mesh){
 const up=upperTriangles(mesh);
 if(up.length){const cs=CS.union(up.map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero')));if(!cs.isEmpty()&&cs.area()>.05)return cs;}
 const pts=[];
 for(let i=0;i<mesh.positions.length;i+=3)pts.push([mesh.positions[i],mesh.positions[i+1]]);
 const hull=hull2d(pts);
 return hull?new CS([hull],'NonZero'):null;
}
function contourOf(w,node){
 const p=node.p,shape=getLetterShape(p.letter),range={L:[2,4],U:[5,9],V:[1,3]}[p.letter];
 const samples=shape.getPoints(16),center=new T.Box2().setFromPoints(samples).getCenter(new T.Vector2());
 const matrix=new T.Matrix4().fromArray(node.matrix);
 const points=featurePoints({curves:shape.curves.slice(...range)},p.scale*Math.max(p.scaleX,p.scaleY,p.scaleZ));
 const original=points.map(q=>new T.Vector3(q.x-center.x,q.y-center.y,0).applyMatrix4(matrix).toArray());
 const closed=[...original];
 if(p.letter==='L')closed.push(new T.Vector3(points[0].x-center.x,points.at(-1).y-center.y,0).applyMatrix4(matrix).toArray());
 let cs=new w.CrossSection([closed.map(q=>q.slice(0,2))],'NonZero');
 if(cs.isEmpty()||cs.area()<.05){const hull=hull2d(original.map(q=>q.slice(0,2)));cs=hull?new w.CrossSection([hull],'NonZero'):cs;}
 const sx=p.scale*p.scaleX,sy=p.scale*p.scaleY;
 const local=points.map(q=>[(q.x-center.x)*sx,(q.y-center.y)*sy]);
 if(p.letter==='L')local.push([(points[0].x-center.x)*sx,(points.at(-1).y-center.y)*sy]);
 return {cs,local,sourceContour:original,closedContour:closed,closure:{rule:p.letter==='L'?'inner-edge missing quadrant, closed at actual arm-tip extents':'chord between actual inner mouth endpoints',addedEdges:p.letter==='L'?[original.at(-1),closed.at(-1),original[0]]:[original.at(-1),original[0]]}};
}
function poseFrame(node){
 const basis=new T.Matrix4().fromArray(node.matrix);
 const position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
 basis.decompose(position,rotation,scale);
 return {frame:new T.Matrix4().compose(position,rotation,new T.Vector3(1,1,1)),axis:new T.Vector3(0,0,1).applyQuaternion(rotation).normalize()};
}
function orientedCut(w,node,local,field,depth){
 const CS=w.CrossSection;
 let section=new CS([local],'NonZero');
 if(section.isEmpty()||section.area()<.05)return null;
 let imprint=section;
 try{const shrunk=section.offset(-.2,'Round',2,24);if(!shrunk.isEmpty()&&shrunk.area()>.05)imprint=shrunk;}catch{/* the full contour still marks the surface */}
 const {frame}=poseFrame(node);
 const reach=depth??Math.hypot(field.width,field.depth,field.height);
 const sweep=profile=>profile.extrude(reach*2).translate([0,0,-reach]).transform(frame.elements);
 let cutting=sweep(imprint);
 try{const grown=imprint.offset(.03,'Round',2,24);if(!grown.isEmpty())cutting=sweep(grown);}catch{/* cut with the imprint itself */}
 return {core:sweep(imprint),cutting};
}
function floatSafe(w,solid){
 const mesh=solid.asOriginal().simplify(1e-5).getMesh(),p=[],ix=[],map=new Map(),remap=[];
 for(let i=0;i<mesh.vertProperties.length;i+=3){const q=Array.from(mesh.vertProperties.slice(i,i+3),Math.fround),key=q.join(',');if(!map.has(key)){map.set(key,p.length/3);p.push(...q);}remap.push(map.get(key));}
 for(let i=0;i<mesh.triVerts.length;i+=3){const t=Array.from(mesh.triVerts.slice(i,i+3),j=>remap[j]);if(new Set(t).size<3)continue;ix.push(...t);}
 const mesh32=new w.Mesh({numProp:3,vertProperties:new Float32Array(p),triVerts:new Uint32Array(ix)});mesh32.merge();
 const result=new w.Manifold(mesh32);
 if(result.status()!=='NoError')throw Error('Lobby envelope export failed: '+result.status());
 return result;
}
function letterQuaternion(node){
 const p=node.p;
 return new T.Quaternion().setFromEuler(new T.Euler(T.MathUtils.degToRad(p.rx),T.MathUtils.degToRad(p.ry),T.MathUtils.degToRad(p.rz),p.rotationOrder||'XYZ'));
}
function letterSleeve(w,origin,quaternion,center,hx,hy,hz){
 const rect=[[center.x-hx,center.y-hy],[center.x+hx,center.y-hy],[center.x+hx,center.y+hy],[center.x-hx,center.y+hy]];
 const slab=new w.CrossSection([rect],'NonZero').extrude(hz*2).translate([0,0,center.z-hz]);
 return slab.transform(new T.Matrix4().compose(origin,quaternion,new T.Vector3(1,1,1)).elements);
}
function sleeveOf(w,node,mesh,field){
 const quaternion=letterQuaternion(node);
 const origin=new T.Vector3(node.p.x,node.p.y,node.p.z+field.height/2);
 const inverse=quaternion.clone().invert();
 const min=new T.Vector3(Infinity,Infinity,Infinity),max=new T.Vector3(-Infinity,-Infinity,-Infinity);
 for(let i=0;i<mesh.positions.length;i+=3){
  const point=new T.Vector3(mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]).sub(origin).applyQuaternion(inverse);
  min.min(point);max.max(point);
 }
 const center=min.clone().add(max).multiplyScalar(.5);
 const pad=1.7-1.05;
 return {origin,quaternion,center,hx:(max.x-min.x)/2+pad,hy:(max.y-min.y)/2+pad,hz:(max.z-min.z)/2+pad};
}
function loftFits(M,w,fits){
 const slices=fits.map(fit=>letterSleeve(w,fit.origin,fit.quaternion,fit.center,fit.hx,fit.hy,fit.hz));
 const pieces=[...slices];
 for(let index=0;index<fits.length-1;index++){
  const a=fits[index],b=fits[index+1];
  let previous=slices[index];
  for(const u of [1/3,2/3]){
   const sleeve=letterSleeve(w,a.origin.clone().lerp(b.origin,u),a.quaternion.clone().slerp(b.quaternion,u),a.center.clone().lerp(b.center,u),a.hx+(b.hx-a.hx)*u,a.hy+(b.hy-a.hy)*u,a.hz+(b.hz-a.hz)*u);
   pieces.push(sleeve,M.hull([previous,sleeve]));
   previous=sleeve;
  }
  pieces.push(M.hull([previous,slices[index+1]]));
 }
 return M.union(pieces);
}
function insetFit(fit){
 const wall=1.7;
 return {...fit,hx:Math.max(.4,fit.hx-wall),hy:Math.max(.4,fit.hy-wall),hz:Math.max(.3,fit.hz-wall)};
}
function letterBox(M,mesh,margin){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let index=0;index<mesh.positions.length;index+=3){
  min[0]=Math.min(min[0],mesh.positions[index]);min[1]=Math.min(min[1],mesh.positions[index+1]);min[2]=Math.min(min[2],mesh.positions[index+2]);
  max[0]=Math.max(max[0],mesh.positions[index]);max[1]=Math.max(max[1],mesh.positions[index+1]);max[2]=Math.max(max[2],mesh.positions[index+2]);
 }
 const size=min.map((value,axis)=>Math.max(.8,max[axis]-value+margin*2));
 const center=min.map((value,axis)=>(value+max[axis])/2);
 return M.cube(size,true).translate(center);
}
function recenterOnLetters(solid,letters,clip){
 const box=solid.boundingBox();
 const solidMid=box.min.map((value,axis)=>(value+box.max[axis])/2);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const letter of letters){
  const positions=letter.mesh.positions;
  for(let index=0;index<positions.length;index+=3){
   min[0]=Math.min(min[0],positions[index]);min[1]=Math.min(min[1],positions[index+1]);min[2]=Math.min(min[2],positions[index+2]);
   max[0]=Math.max(max[0],positions[index]);max[1]=Math.max(max[1],positions[index+1]);max[2]=Math.max(max[2],positions[index+2]);
  }
 }
 const letterMid=min.map((value,axis)=>(value+max[axis])/2);
 const delta=letterMid.map((value,axis)=>value-solidMid[axis]);
 const moved=delta.some(value=>Math.abs(value)>.05)?solid.translate(delta):solid;
 return moved.intersect(clip);
}
function lobbyEnvelope(w,nodes,edges,letters,field,preferred,typologyName=''){
 const M=w.Manifold,CS=w.CrossSection;
 const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 const tools=[],voids=[],walls=[];
 const plans=letters.map(letter=>planOf(CS,letter.mesh));
 const plateTop=letters.map(letter=>{const zs=letter.mesh.positions.filter((_,i)=>i%3===2);return Math.min(field.height,Math.max(.75,Math.min(...zs)));});
 const parts=[];
 const spanOf=cs=>{const box=cs.bounds();return {center:[(box.min[0]+box.max[0])/2,(box.min[1]+box.max[1])/2],radius:Math.max(.4,Math.hypot(box.max[0]-box.min[0],box.max[1]-box.min[1])/2)};};
 const twist=/compressed/i.test(typologyName||'');
 let outerSolid=null,innerSolid=null;
 if(twist){
  const fitted=nodes.map((node,index)=>{
   const fit=sleeveOf(w,node,letters[index].mesh,field);
   const extra=Math.max(0,1-(1.7-1.05));
   return {...fit,hx:fit.hx+extra,hy:fit.hy+extra,hz:fit.hz+extra};
  });
  const hallAxis=fit=>[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)].map(axis=>Math.abs(axis.applyQuaternion(fit.quaternion).x));
  for(let index=0;index<fitted.length-1;index++){
   const gap=fitted[index].origin.distanceTo(fitted[index+1].origin);
   for(const fit of [fitted[index],fitted[index+1]]){
    const along=hallAxis(fit);
    const hall=along.indexOf(Math.max(...along));
    const key=['hx','hy','hz'][hall];
    fit[key]=Math.max(fit[key],gap/2+1);
   }
  }
  outerSolid=loftFits(M,w,fitted);
  const cavity=fitted.map(fit=>{
   const next={...fit};
   const along=hallAxis(fit);
   const open=along.indexOf(Math.max(...along));
   ['hx','hy','hz'].forEach((key,axis)=>{if(axis!==open)next[key]=Math.max(.4,fit[key]-1);});
   return next;
  });
  const opened=[
   {...cavity[0],origin:cavity[0].origin.clone().add(new T.Vector3(-4,0,0))},
   ...cavity,
   {...cavity.at(-1),origin:cavity.at(-1).origin.clone().add(new T.Vector3(4,0,0))},
  ];
  innerSolid=loftFits(M,w,opened);
 }
  if(!twist)nodes.forEach((node,index)=>{
  let plan=plans[index];
  if(!plan||plan.isEmpty())plan=CS.circle(Math.max(.6,preferred*.08),16).translate([node.p.x,node.p.y]);
  plans[index]=plan;
  const low=Math.min(...letters[index].mesh.positions.filter((_,i)=>i%3===2));
  const plateBottom=Math.max(0,Math.min(field.height-.75,low-.75));
  plateTop[index]=plateBottom+.75;
  parts.push(plan.offset(.8,'Round',2,32).extrude(.75).translate([0,0,plateBottom]));
  const strip=plan.offset(.9,'Round',2,32).subtract(plan.offset(.25,'Round',2,32));
  const rise=Math.min(preferred*.12,Math.max(.05,plateBottom/3||.05));
  for(let tier=1;tier<=2;tier++){
   const top=Math.max(.75,plateTop[index]-(tier-1)*rise);
   parts.push(plan.offset(.8+tier*preferred*.075,'Round',2,32).extrude(top));
  }
  if(!strip.isEmpty()&&plateBottom>.05)parts.push(strip.extrude(plateTop[index]));
 });
 if(!twist)for(const edge of edges){
  const a=plans[edge.i],b=plans[edge.j];
  if(!a||!b||a.isEmpty()||b.isEmpty())continue;
  let terrace;
  try{terrace=CS.hull([a,b]);}catch{terrace=null;}
  if(!terrace||terrace.isEmpty()){const A=spanOf(a),B=spanOf(b);terrace=CS.hull([CS.circle(A.radius,24).translate(A.center),CS.circle(B.radius,24).translate(B.center)]);}
  const floor=Math.max(0,Math.min(plateTop[edge.i],plateTop[edge.j])-.75);
  parts.push(terrace.extrude(.75).translate([0,0,floor]));
 }
 let solid=recenterOnLetters(twist?outerSolid.intersect(clip).subtract(innerSolid):M.union(parts),letters,clip).simplify(1e-5);
 if(twist){
  const fitted=solid.boundingBox();
  const span=fitted.min.map((value,axis)=>Math.max(fitted.max[axis]-value,1e-6));
  const mid=fitted.min.map((value,axis)=>(value+fitted.max[axis])/2);
  const factor=[field.width/span[0],field.depth/span[1],field.height/span[2]];
  solid=solid.translate(mid.map(value=>-value)).scale(factor).translate([0,0,field.height/2]).intersect(clip).simplify(1e-5);
 }
 if(!twist)solid=M.union([solid,...letters.map(letter=>letterBox(M,letter.mesh,1))]).intersect(clip).simplify(1e-5);
 nodes.forEach((node,index)=>{
  if(twist)return;
  const contour=contourOf(w,node);
  const cut=orientedCut(w,node,contour.local,field);
  const profile=!contour.cs.isEmpty()&&contour.cs.area()>=.05?contour.cs:plans[index];
  let core=cut?.core,cutting=cut?.cutting;
  if(!cutting||cutting.isEmpty()){
   if(!profile||profile.isEmpty())return;
   core=profile.extrude(field.height+2).translate([0,0,-1]).intersect(clip);
   cutting=core;
  }
  const removedPiece=solid.intersect(cutting);
  const removed=removedPiece.volume();
  if(removed<1e-3)return;
  const next=solid.subtract(cutting);
  if(next.isEmpty())return;
  solid=next.simplify(1e-5);
  const axis=poseFrame(node).axis.toArray();
  voids.push({source:node.id,sourceContour:contour.sourceContour,closedContour:contour.closedContour,closure:contour.closure,axis,yaw:node.p.rz,tilt:node.p.rx,profile:node.p.letter+' inner contour',cutterMesh:pack(cutting),removedVolume:removed,alcove:false});
  tools.push({id:'opening-'+node.id,source:node.id,solid:core,cuttingSolid:cutting,removed,alcove:false,width:1,height:field.height,depth:field.height}); });
 const partsLeft=solid.decompose().filter(part=>part.volume()>1e-4);
 if(!partsLeft.length)throw Error('The lobby envelope has no solid. The letters need to meet inside the field.');
 const main=partsLeft.reduce((largest,part)=>part.volume()>largest.volume()?part:largest);
 solid=partsLeft.some(part=>part!==main&&part.volume()>main.volume()*.05)?M.union(partsLeft.filter(part=>part===main||part.volume()>main.volume()*.05)).simplify(1e-5):main;
 if(solid.decompose().filter(part=>part.volume()>1e-4).length!==1)solid=main;
 for(const tool of tools)solid=solid.subtract(tool.cuttingSolid);
 solid=floatSafe(w,solid.simplify(1e-5));
 const bands=[{id:'lobby-envelope',owner:nodes[0].id,sources:nodes.map(node=>node.id),solid}];
 const report={before:solid.volume(),after:solid.volume(),removed:tools.reduce((sum,tool)=>sum+tool.removed,0),added:0,components:1,overhangs:0,addedProjections:0,operations:tools.map(tool=>({id:tool.id,sources:[tool.source],feature:'inner source contour',kind:'directional through void',profile:'closed inner contour',width:1,height:field.height,depth:field.height,bayDepth:0,alcove:false,removed:tool.removed}))};
 return {family:'stepped',bands,primary:solid,solid,tools,projections:[],report,boundaryReport:{walls,voids,floors:[],limitations:['Letters on XY are 0.75 ft floor plates. Letters on other rotations form the walls. Each letter imprints its contour along its saved rotation. Circulation and structure are not certified.']}};
}
module.exports={lobbyEnvelope};
