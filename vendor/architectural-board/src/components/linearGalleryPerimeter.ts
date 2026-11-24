import * as THREE from 'three';
import {getLetterShape,getLetterVolumeGeometry} from './letterGeometry3d';
import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';
type Field=AmphitheaterRequest['field'];
type Letter=AmphitheaterSource['letter'];
type Point=[number,number];
export type FootprintControls={mode:'automatic'|'manual';inset:number;lowerArea?:number;upperArea?:number;layerAreas?:Record<number,number>};
type Settings={seed:number;path:Point[];footprint:FootprintControls;arrangementMode?:string;nominalSpacing?:number;separations?:number[]};
const letters:Letter[]=['L','U','V'], tangents:Point[]=[[1,0],[0,1],[-1,0],[0,-1]], normals:Point[]=[[0,-1],[1,0],[0,1],[-1,0]];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const shifted=(a:Point,b:Point,d:number):Point=>[a[0]+b[0]*d,a[1]+b[1]*d];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function hull(points:Point[]){
 const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const half=(v:Point[])=>{const h:Point[]=[];for(const p of v){while(h.length>1){const a=h[h.length-2],b=h[h.length-1];if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>1e-7)break;h.pop();}h.push(p);}return h.slice(0,-1);};
 return [...half(sorted),...half(sorted.reverse())];
}
function clearOf(a:Point[],b:Point[],gap:number){
 return [a,b].some(poly=>poly.some((p,i)=>{const q=poly[(i+1)%poly.length],d=distance(p,q);if(d<1e-7)return false;const n:Point=[(q[1]-p[1])/d,(p[0]-q[0])/d],u=a.map(v=>dot(v,n)),v=b.map(v=>dot(v,n));return Math.max(...u)+gap<=Math.min(...v)||Math.max(...v)+gap<=Math.min(...u);}));
}
export function glyph(letter:Letter,side:number,size:number,variant:number){
 const ids={L:[0,5],U:[0,3],V:[4,6]}[letter],curveIndex=ids[variant%ids.length],shape=getLetterShape(letter),line=shape.curves[curveIndex];
 const d=line.getPoint(1).sub(line.getPoint(0)).normalize(),sign=Math.sign(THREE.ShapeUtils.area(shape.getPoints(32)));
 let angle=Math.atan2(normals[side][1],normals[side][0])-Math.atan2(-sign*d.x,sign*d.y);
 const geometry=getLetterVolumeGeometry(letter,12),attr=geometry.getAttribute('position'),scale=size/.92;
 // Select the vertical mesh face that corresponds to the straight glyph curve.
 let match=-Infinity;
 const target=new THREE.Vector2(sign*d.y,-sign*d.x);
 const idx=geometry.index,vertices=idx?.count??attr.count;
 for(let i=0;i<vertices;i+=3){
  const [a,b,c]=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(attr,idx?idx.getX(i+k):i+k));
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  if(Math.abs(normal.z)>1e-5)continue;
  const similarity=normal.x*target.x+normal.y*target.y;
  if(similarity>match){match=similarity;angle=Math.atan2(normals[side][1],normals[side][0])-Math.atan2(normal.y,normal.x);}
 }
 const xyz=Array.from({length:attr.count},(_,i)=>{const x=attr.getX(i)*scale,y=attr.getY(i)*scale;return [x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),attr.getZ(i)*scale];});
 const uv=xyz.map(([x,y])=>[dot([x,y],tangents[side]),dot([x,y],normals[side])]);
 // The beveled mesh's vertical exterior face can lie beyond the nominal font contour.
 const face=Math.max(...uv.map(p=>p[1])),ends=uv.filter(p=>face-p[1]<1e-5).map(p=>p[0]);
 if(Math.max(...ends)-Math.min(...ends)<.1)throw Error(letter+' exterior mesh side could not be resolved.');
 return {outline:hull(xyz.map(([x,y])=>[x,y])),letter,curveIndex,angle,scale,face,from:Math.min(...ends),to:Math.max(...ends),minU:Math.min(...uv.map(p=>p[0])),maxU:Math.max(...uv.map(p=>p[0])),minN:Math.min(...uv.map(p=>p[1])),minZ:Math.min(...xyz.map(p=>p[2])),maxZ:Math.max(...xyz.map(p=>p[2]))};
}
type Slot={offset:number;outline:Point[];side:number;letter:Letter;curveIndex:number;angle:number;position:Point;edge:[Point,Point];interval:Point;box:number[];minZ:number;maxZ:number};
export function perimeterStudy(f:Field,size:number,s:Settings,requested?:number){
 const seed=s.seed>>>0,mid=f.height/2,control=s.footprint,scale=size/.92;
 if(!Number.isFinite(control.inset)||control.inset<0||!Number.isFinite(size)||size<=0)throw Error('Enter a nonnegative inset and positive letter size.');
 const cache=new Map<string,ReturnType<typeof glyph>>();
 function profile(letter:Letter,side:number,variant:number){const key=[letter,side,variant%2].join();let g=cache.get(key);if(!g){g=glyph(letter,side,size,variant);cache.set(key,g);}return g;}
 if(requested===undefined && control.mode==='automatic' && !Object.keys(control.layerAreas??{}).length)return closedCourses(f,size,s);
 const thickness=Math.max(...letters.map(l=>{const g=profile(l,0,0);return g.maxZ-g.minZ;}));
 const layers=[];const defined=s.arrangementMode==='defined-levels',spacing=s.nominalSpacing??13,gaps=s.separations??[5,10,15];
 if(defined?![12,13,14,15].includes(spacing):gaps.length!==3||gaps.some(g=>![5,10,15].includes(g)))throw Error('Invalid gallery level spacing.');
 const pathStart=s.path[0], firstSide=normals.map(n=>dot(n,pathStart)).reduce((best,v,i,a)=>v>a[best]?i:best,0);
 for(const zone of ['lower','upper'] as const){
  const base=zone==='lower'?0:mid,limit=base+mid;
  for(let nominal=zone==='upper'?mid:defined?4.5:Math.min(3,mid*.1),rank=0;nominal<limit;nominal+=defined?spacing:thickness+gaps[zone==='upper'?2:rank%2],rank++){
   const offsets=(defined?[-4,0,4]:[0]).filter(z=>nominal+z>=base-1e-7&&nominal+z+thickness<=limit+1e-7);
   if(!offsets.length)continue;
   const level:number=layers.length,depths=[1,1,1,1],key=(seed+(zone==='upper'?2:0))%4;
   depths[key]=zone==='upper'?5:10;
   const w=f.width-2*control.inset-depths[1]-depths[3],h=f.depth-2*control.inset-depths[0]-depths[2];
   if(w<=0||h<=0)throw Error('Inset and setbacks leave no polygon within the field.');
   const maxArea=w*h,target:number|undefined=control.layerAreas?.[level]??(control.mode==='manual'?(zone==='lower'?control.lowerArea:control.upperArea):maxArea);
   if(!target||target<=0||target>maxArea+1e-7)throw Error('Layer '+(level+1)+' needs a positive target at or below '+maxArea.toFixed(1)+' ft² for this inset and setbacks.');
   const factor=Math.sqrt(target/maxArea),width=w*factor,height=h*factor,cx=(depths[3]-depths[1])/2,cy=(depths[0]-depths[2])/2;
   const vertices:Point[]=[[cx-width/2,cy-height/2],[cx+width/2,cy-height/2],[cx+width/2,cy+height/2],[cx-width/2,cy+height/2]];
   const lengths=[width,height,width,height],clear=.5;
   let best:Slot[]=[],bestDistance=Infinity;
   const lower:Slot[]=layers.length?layers[layers.length-1].slots:[];
   const jointTargets=lower.flatMap((k,i)=>lower.slice(i+1).flatMap(other=>k.edge.flatMap(a=>other.edge.filter(b=>distance(a,b)<=Math.max(1,size*.35)).map(b=>shifted(a,[b[0]-a[0],b[1]-a[1]],.5)))));
   for(let trial=0;trial<24;trial++){
   const slots:Slot[]=[];
   for(let pass=0;;pass++){
    let added=false;
    for(let j=0;j<4;j++){
     const side=(firstSide+j+trial%4)%4,letter=letters[(level+j+pass+seed+Math.floor(trial/4))%3],g=profile(letter,side,level+j+seed+Math.floor(trial/12)),t=tangents[side],n=normals[side];
     const length=lengths[side],depth=g.face-g.minN,span=g.maxU-g.minU;
     if(depth>lengths[(side+1)%4]-clear)continue;
     const corner=vertices[side],existing=slots.filter(x=>x.side===side);
     const begin=existing.length?Math.max(...existing.flatMap(x=>x.box.map((_,i)=>i%2===0?dot([x.box[i],x.box[i+1]],t)-dot(corner,t):0)))+clear:clear;
     // Slide along this finite side until both the glyph and the corner clearance fit.
     for(let start=Math.max(begin,clear);start+span<=length-clear+1e-7;start+=.25){
      const origin=shifted(shifted(corner,t,start-g.minU),n,-g.face);
      const a=shifted(corner,t,start),b=shifted(shifted(a,t,span),n,-depth);
      const box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
      const outline=g.outline.map((v):Point=>[v[0]+origin[0],v[1]+origin[1]]);
      const preferred=(slots.length+seed+level)%offsets.length;
      const candidates=zone==='upper'&&rank===0&&!slots.length?[0]:offsets.map((_,i)=>offsets[(preferred+i)%offsets.length]);
      const offset=candidates.find(z=>slots.every(k=>z+thickness+clear<=k.offset||k.offset+thickness+clear<=z||clearOf(outline,k.outline,clear)));
      if(offset===undefined)continue;
      const interval:Point=[start+g.from-g.minU,start+g.to-g.minU];
      slots.push({offset,outline,side,letter,curveIndex:g.curveIndex,angle:g.angle,position:origin,edge:[shifted(corner,t,interval[0]),shifted(corner,t,interval[1])],interval,box,minZ:g.minZ,maxZ:g.maxZ});added=true;break;
     }
    }
    if(!added)break;
   }
   const jointDistance=slots.reduce((sum,k)=>sum+(jointTargets.length?Math.min(...jointTargets.map(j=>distance(j,shifted(k.edge[0],tangents[k.side],distance(...k.edge)/2)))):0),0);
   if(slots.length>best.length || slots.length===best.length&&jointDistance<bestDistance){best=slots;bestDistance=jointDistance;}
   }
   const slots:Slot[]=best;
   layers.push({level,zone,nominal,offsets,polygonId:zone+'-'+level,vertices,lengths,depths,target,achieved:width*height,usablePerimeter:lengths.reduce((a,b)=>a+Math.max(0,b-2*clear),0),capacity:slots.length,perimeter:lengths.reduce((sum,v)=>sum+v,0),slots,count:0});
  }
 }
 // Estimate full perimeter demand side by side from the native exterior edge
 // lengths, then limit automatic placement to the collision-tested slots.
 const demand=layers.map(l=>l.lengths.reduce((sum,length,side)=>{
  const slots=l.slots.filter(k=>k.side===side);
  const mean=slots.length?slots.reduce((n,k)=>n+k.interval[1]-k.interval[0],0)/slots.length:
   letters.reduce((n,c)=>{const g=profile(c,side,0);return n+g.to-g.from;},0)/letters.length;
  return sum+Math.ceil(length/mean);
 },0));
 const available=layers.reduce((n,l)=>n+l.capacity,0),count=requested??layers.reduce((n,l,i)=>n+Math.min(l.capacity,demand[i]),0);
 if(!Number.isSafeInteger(count)||count<3||count>available)throw Error('Requested '+count+' letters. The measured perimeter layout fits '+available+' at '+size+' ft (layer capacities '+layers.map(l=>l.capacity).join('/')+'). Select a feasible quantity or increase the field.');
 for(const zone of ['upper','lower']){const l=layers.find(l=>l.zone===zone&&l.capacity);if(!l||zone==='upper'&&l.nominal!==mid)throw Error('Cannot anchor both zones with this size and footprint.');l.count++;}
 for(let i=2;i<count;i++){const l=layers.filter(l=>l.count<l.capacity).sort((a,b)=>(b.capacity-b.count)/(b.count+1)-(a.capacity-a.count)/(a.count+1))[0];l.count++;}
 const source:AmphitheaterSource[]=[],stations=[];const empty=[];
 for(const l of layers){
  const selected=l.slots.slice(0,l.count);
  for(const k of selected){
   const offset=k.offset,bottom=l.nominal+offset;
   const p:AmphitheaterSource={letter:k.letter,x:k.position[0],y:k.position[1],z:bottom-k.minZ-mid,rx:0,ry:0,rz:k.angle*180/Math.PI,rotationOrder:'ZYX',scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:l.level,...(defined?{galleryZone:l.zone,galleryNominalZ:l.nominal,galleryElevationOffset:offset as -4|0|4}:{})};
   source.push(p);stations.push({id:k.letter+'-'+source.length,type:k.letter,level:l.level,zone:l.zone,polygonId:l.polygonId,side:k.side,curveIndex:k.curveIndex,edge:k.edge,tangent:tangents[k.side],normal:normals[k.side],setback:l.depths[k.side],bottom,top:bottom+k.maxZ-k.minZ,offset,lower:[] as string[],upper:[] as string[],joints:[] as Point[]});
  }
  for(let side=0;side<4;side++){let end=0;for(const k of selected.filter(k=>k.side===side).sort((a,b)=>a.interval[0]-b.interval[0])){if(k.interval[0]>end)empty.push({polygonId:l.polygonId,side,from:end,to:k.interval[0]});end=k.interval[1];}if(end<l.lengths[side])empty.push({polygonId:l.polygonId,side,from:end,to:l.lengths[side]});}
 }
 // Record neighboring occupied intervals independently of actual end-to-end joints.
 for(const upper of stations)for(const lower of stations.filter(k=>k.level===upper.level-1&&k.side===upper.side)){
  const lowerSpan=lower.edge.map(p=>dot(p,upper.tangent)),upperSpan=upper.edge.map(p=>dot(p,upper.tangent));
  if(Math.min(lowerSpan[1],upperSpan[1])-Math.max(lowerSpan[0],upperSpan[0])<=1e-6)continue;
  upper.lower.push(lower.id);lower.upper.push(upper.id);
 }
 const perimeterJoints=[];
 for(const layer of layers){
  const onLayer=stations.filter(s=>s.level===layer.level).sort((a,b)=>a.side-b.side||dot(a.edge[0],a.tangent)-dot(b.edge[0],b.tangent));
  for(let i=0;i<onLayer.length&&onLayer.length>1;i++){
   const left=onLayer[i],right=onLayer[(i+1)%onLayer.length],a=left.edge[1],b=right.edge[0],gap=distance(a,b);
   if(gap>Math.max(1,size*.35))continue;
   const point:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   perimeterJoints.push({level:layer.level,letters:[left.id,right.id],endpoints:[a,b],point,gap});
   for(const upper of stations.filter(s=>s.level===layer.level+1)){
    const along=dot([point[0]-upper.edge[0][0],point[1]-upper.edge[0][1]],upper.tangent);
    if(along<0||along>distance(...upper.edge)||distance(shifted(upper.edge[0],upper.tangent,along),point)>10.001)continue;
    upper.joints.push(point);for(const lower of [left,right]){if(!upper.lower.includes(lower.id))upper.lower.push(lower.id);if(!lower.upper.includes(upper.id))lower.upper.push(upper.id);}
   }
  }
 }
 return {source,stations,perimeterJoints,available,empty,layers:layers.map(({slots,...l},i)=>({...l,edgesForFullPerimeter:demand[i],occupiedEdgeFeet:slots.slice(0,l.count).reduce((sum,k)=>sum+k.interval[1]-k.interval[0],0)}))};
}


function closedCourses(f:Field,size:number,s:Settings){
 const mid=f.height/2,margin=s.footprint.inset,span=(g:ReturnType<typeof glyph>)=>g.to-g.from;
 const arm=span(glyph('L',0,size,0)),back=span(glyph('L',3,size,1)),corner=arm+back;
 const clearWidth=f.width-2*margin,clearDepth=f.depth-2*margin;
 if(clearWidth<=corner+.01||clearDepth<corner-.000001)throw Error('The field and inset need room for four corner Ls and a projecting upper footprint.');
 const source:AmphitheaterSource[]=[],stations=[],layers=[];
 const defined=s.arrangementMode==='defined-levels',spacing=s.nominalSpacing??13;
 const thickness=glyph('L',0,size,0).maxZ-glyph('L',0,size,0).minZ;
 const gaps=s.separations??[5,10,15];
 if(defined?![12,13,14,15].includes(spacing):gaps.length!==3||gaps.some(n=>![5,10,15].includes(n)))throw Error('Invalid gallery spacing.');
 for(const zone of ['lower','upper'] as const){
  const overhang=Math.min(9,clearWidth-corner);
  const dims=[clearWidth-overhang,clearDepth];
  const fills=dims.map(d=>{
   let remaining=d-corner;
   const sequence:Letter[]=[];
   while(remaining>=arm-.000001){
    const v=span(glyph('V',0,size,0)),letter=remaining>=v&&zone==='upper'?'V':'L';
    sequence.push(letter);remaining-=letter==='V'?v:arm;
   }
   return sequence;
  });
  const [width,height]=fills.map(seq=>corner+seq.reduce((sum,c)=>sum+span(glyph(c,0,size,0)),0));
  const x=(zone==='upper'?overhang:-overhang)/2-width/2,y=-height/2;
  const vertices:Point[]=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
  const base=zone==='upper'?mid:0;
  for(let z=base+(zone==='upper'?0:defined?4.5:Math.min(3,mid*.1)),rank=0;z+thickness<=base+mid+1e-7;z+=defined?spacing:thickness+gaps[zone==='upper'?2:rank%2],rank++){
   const level:number=layers.length,polygonId=zone+'-'+level,before=source.length;
   for(let side=0;side<4;side++){
    let cursor=0;
    for(const [index,letter] of (['L',...fills[side%2]] as Letter[]).entries()){
     const g=glyph(letter,side,size,0),t=tangents[side],n=normals[side],v=vertices[side];
     const position=shifted(shifted(v,t,cursor-g.from),n,-g.face);
     const offset=defined && index>0 && z+4+thickness<=base+mid?4:0;
     source.push({letter,x:position[0],y:position[1],z:z+offset-g.minZ-mid,rx:0,ry:0,rz:g.angle*180/Math.PI,rotationOrder:'ZYX',scale:g.scale,scaleX:1,scaleY:1,scaleZ:1,levelIndex:level,...(defined?{galleryZone:zone,galleryNominalZ:z,galleryElevationOffset:offset as 0|4}:{})});
     const id=letter+'-'+source.length;
     const edge=[shifted(v,t,cursor),shifted(v,t,cursor+span(g))];
     stations.push({id,type:letter,curveIndex:g.curveIndex,side,level,zone,polygonId,edge,normal:n,tangent:t,bottom:z+offset,top:z+offset+thickness,offset,lower:[],upper:[],joints:[],...(index===0?{secondSide:(side+3)%4,secondCurve:5}:{})});
     cursor+=span(g);
    }
   }
   const count=source.length-before,perimeter=2*(width+height);
   layers.push({level,zone,polygonId,nominal:z,vertices,lengths:[width,height,width,height],achieved:width*height,target:width*height,perimeter,count,capacity:count,occupiedEdgeFeet:perimeter,edgesForFullPerimeter:count+4});
  }
 }
 if(!layers.some(l=>l.zone==='lower')||!layers.some(l=>l.zone==='upper'))throw Error('Both footprints must fit at least one layer.');
 return {source,stations,layers,empty:[],perimeterJoints:[],available:source.length};
}
