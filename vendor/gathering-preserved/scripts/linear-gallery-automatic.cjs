const assert=require('node:assert/strict');
require('../proof/rule-amphitheater.cjs');
const {glyph}=require('../src/components/linearGalleryPerimeter.ts');
async function arrangeMixed(request){
const mid=request.field.height/2,settings=request.linearGallery,margin=settings.footprint.inset;
const source=[],stations=[],layers=[],previous=[[],[],[],[]];
const tangents=[[1,0],[0,1],[-1,0],[0,-1]],normals=[[0,-1],[1,0],[0,1],[-1,0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const span=g=>g.to-g.from;
let seed=settings.seed>>>0;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function arrange(parts,start,prior){
 let best=[],score=-Infinity;
 for(let trial=0;trial<100;trial++){
  const order=parts.slice();
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  let at=start;const gaps=[at];
  for(const g of order){at+=span(g);gaps.push(at);}
  const distances=gaps.map(x=>Math.min(5,...prior.map(y=>Math.abs(x-y))));
  const value=Math.min(...distances)*10+distances.reduce((a,b)=>a+Math.min(2,b),0);
  if(value>score){score=value;best=order;}
 }
 return best;
}
const rotationSeed=request.sourceSnapshot.rotationSeed??settings.seed;
 const angle=25+((Math.imul(rotationSeed^0x59c3,2654435761)>>>0)%51);
 const radians=angle*Math.PI/180;
 const turn=([x,y])=>[x*Math.cos(radians)-y*Math.sin(radians),x*Math.sin(radians)+y*Math.cos(radians)];
 const refs=[];
 const spacing=settings.nominalSpacing??13;
 const limit=[request.field.width-2*margin,request.field.depth-2*margin];
 const small=Math.min(...limit)<25;
 const cornerLimit=small?4:6;
 const baseWidth=small?span(glyph('L',0,4,0))+span(glyph('L',3,4,1))+span(glyph('V',0,5,0)):span(glyph('L',0,10,0))+span(glyph('L',3,10,1))+span(glyph('V',0,5,0));
 const shift=Math.min(9,limit[0]-baseWidth);
 if(shift<=0)throw Error('Field inset leaves insufficient width for a mixed-size projecting footprint.');
 for(const zone of ['lower','upper']){
 const base=zone==='upper'?mid:0,first=zone==='upper'?base:Math.min(4.5,mid/4),step=Math.min(spacing,(base+mid-first-1)/(zone==='upper'?2:1));
 for(let z=first;z<=base+mid-1+.000001;z+=step){const level=refs.length;refs.push({level,zone,nominal:z,polygonId:zone+'-'+level});}
 }
 for(const ref of refs){
 const {level,zone,nominal,polygonId}=ref;
 const cornerSize=level%2?cornerLimit:4,other=10-cornerSize;
 const sides=tangents.map((t,side)=>{
  const shapes=small?[glyph('V',side,5,0)]:[glyph('L',side,other,0),glyph('L',side,other,1),glyph('V',side,5,0)];
  const available=limit[side%2]-(side%2?0:shift);
  let used=baseWidth;
  if(small&&side%2){const g=glyph('L',side,6,0);if(used+span(g)<=available){shapes.push(g);used+=span(g);}else{shapes[0]=glyph('V',side,6,0);used+=span(shapes[0])-span(glyph('V',side,5,0));}}
  for(let i=0;side%2||limit[0]>45;i++){const g=glyph('L',side,[4,5,5][i%3],0);if(used+span(g)>available-.01)break;shapes.push(g);used+=span(g);}
  
  if(zone==='upper'){
   if(small)return [glyph('V',side,side%2?6:5,0)];
   if(side%2===0)return shapes.slice(0,2);
   return shapes.slice(0,3).concat(glyph('L',side,4,0));
  }
  return shapes;
 });
 const corner=glyph('L',0,cornerSize,0),cornerBack=glyph('L',3,cornerSize,1);
 const lengths=sides.map(parts=>span(corner)+span(cornerBack)+parts.reduce((n,g)=>n+span(g),0));
 const [width,height]=lengths,x=-width/2,y=-height/2;
 const vertices=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
 const before=source.length;
 for(let side=0;side<4;side++){
  const v=vertices[side],t=tangents[side],n=normals[side],g0=glyph('L',side,cornerSize,0);
  const order=arrange(sides[side],dot(v,t)+span(g0),previous[side]);
  previous[side]=[];
  let at=0;
  for(const [j,g] of [g0,...order].entries()){
   const setback=j===0?0:[0,1,2,0.5][(j+level+side)%4];
   const choices=(mid<25?[-mid/8,0,mid/8]:[-4,0,4]).filter(z=>nominal+z>=(zone==='upper'?mid:0)&&nominal+z+g.maxZ-g.minZ<=(zone==='upper'?2*mid:mid));
   const offset=choices[(side+j+level)%choices.length];
   const point=(d,depth)=>v.map((p,k)=>p+t[k]*d-n[k]*depth);
   const [px,py]=point(at-g.from,g.face+setback);
   const bottom=nominal+offset,size=Math.round(g.scale*.92);
   source.push({letter:g.letter,x:px,y:py,z:bottom-g.minZ-mid,rx:0,ry:0,rz:g.angle*180/Math.PI,rotationOrder:'ZYX',scale:g.scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:level,galleryZone:zone,galleryNominalZ:nominal,galleryElevationOffset:offset});
   const edge=[point(at,setback),point(at+span(g),setback)];
   stations.push({id:g.letter+'-'+source.length,type:g.letter,curveIndex:g.curveIndex,level,zone,polygonId,side,edge,tangent:t,normal:n,bottom,top:bottom+g.maxZ-g.minZ,offset,setback,size,...(j===0?{secondSide:(side+3)%4,secondCurve:5}:{})});
   at+=span(g);previous[side].push(dot(v,t)+at);
  }
 }
 const count=source.length-before;
 layers.push({...ref,vertices,lengths,count,capacity:count,perimeter:2*(width+height),occupiedEdgeFeet:2*(width+height),achieved:width*height,target:width*height,edgesForFullPerimeter:count+4});
 assert.deepEqual([...new Set(stations.filter(s=>s.level===level).map(s=>s.size))].sort(),[4,5,6]);
}
Object.assign(request,{preferredFeet:5,source,sourceName:'Linear Edge Gallery · '+angle+'° compact upper form',sourceSnapshot:{linearGallery:settings,terraceRotation:angle,automaticTerraces:true,printGallery:true,roofAndReturns:true,coursePattern:"mixed-running-bond",stations,layers,empty:[],perimeterJoints:[]}});

 const w=await require('manifold-3d/manifold.js').default();w.setup();
 for(const layer of layers.filter(l=>l.zone==='upper'))layer.vertices=layer.vertices.map(turn);
 for(const [i,p] of source.entries())if(p.galleryZone==='upper'){
  [p.x,p.y]=turn([p.x,p.y]);p.rz+=angle;
  const st=stations[i];st.edge=st.edge.map(turn);st.tangent=turn(st.tangent);st.normal=turn(st.normal);
 }
 const letters=require('./source-envelope.cjs').derive(request).letters;
 const solids=[];
 for(const [i,letter] of letters.entries()){
  const m=new w.Mesh({numProp:3,vertProperties:new Float32Array(letter.mesh.positions),triVerts:new Uint32Array(letter.mesh.indices)});m.merge();
  const original=new w.Manifold(m),p=source[i],st=stations[i],base=st.zone==='upper'?mid:0;
  let accepted=false;
  for(const offset of new Set(mid<25?[st.offset,-mid/8,0,mid/8]:[st.offset,-4,0,4])){
   const delta=offset-st.offset;
   if(st.bottom+delta<base||st.top+delta>base+mid)continue;
   const candidate=original.translate([0,0,delta]);
   if(solids.some(s=>candidate.intersect(s).volume()>1e-7))continue;
   solids.push(candidate);p.z+=delta;p.galleryElevationOffset=offset;st.offset=offset;st.bottom+=delta;st.top+=delta;accepted=true;break;
  }
  assert(accepted,'No collision-free elevation for '+letter.id);
 }
 return request;
}
module.exports={arrangeMixed};
