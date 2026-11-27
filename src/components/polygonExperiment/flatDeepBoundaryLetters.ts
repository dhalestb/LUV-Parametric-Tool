import * as THREE from 'three';
import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import {getLetterVolumeGeometry} from '../letterGeometry3d';
import type {HeightBand} from './compositionHeights';
import type {AdaptiveOptions} from './flatDeepAdaptive';
import type {Point,Ring} from './territories';

export const boundaryVersion='flat-deep-boundary/1.0.0';
export const halfSpanVersion='flat-deep-boundary/1.1.0';
export type GuideRole='ground'|'mezzanine'|'pier'|'wall';
export type Guide={id:string;role:GuideRole;size:number;position:[number,number,number];rotation:[number,number,number,number]};
type Panel={kind:'mezz-band'|'roof-band'|'end';corners:string[]};
export type GuideGroup={ground:string[][];mezzanine:string[][];piers:string[];panels:Panel[];heading:number};
export type BoundaryArrangement={version:typeof boundaryVersion|typeof halfSpanVersion;guides:Guide[];groups:GuideGroup[]};
const radians=Math.PI/180;
const axisZ=new THREE.Vector3(0,0,1),axisX=new THREE.Vector3(1,0,0);
const turn=(angle:number)=>new THREE.Quaternion().setFromAxisAngle(axisZ,angle);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const fromLocal=([x,y]:Point,r:number):Point=>[x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)];
export function letterTip(g:Guide):[number,number,number]{
  return new THREE.Vector3(-.42*g.size,-.45*g.size,0).applyQuaternion(new THREE.Quaternion(...g.rotation))
    .add(new THREE.Vector3(...g.position)).toArray();
}

// Major axis of area, accounting for the signs of inner loops.
function principalHeading(rings:Ring[]){
  let area=0,x=0,y=0,xx=0,yy=0,xy=0;
  for(const ring of rings)ring.forEach(([a,b],i)=>{
    const [c,d]=ring[(i+1)%ring.length],k=a*d-c*b;
    area+=k/2;x+=(a+c)*k/6;y+=(b+d)*k/6;
    xx+=(a*a+a*c+c*c)*k/12;yy+=(b*b+b*d+d*d)*k/12;xy+=(2*a*b+a*d+c*b+2*c*d)*k/24;
  });
  return .5*Math.atan2(2*(xy-x*y/area),xx-yy-(x*x-y*y)/area);
}

type Hit={at:(x:number)=>number;slope:number};
function spans(rings:Ring[],x:number){
  const hits:Hit[]=[];
  for(const ring of rings)ring.forEach(([u,v],i)=>{
    const [s,t]=ring[(i+1)%ring.length];
    if((u>x)===(s>x))return;
    const slope=(t-v)/(s-u);hits.push({at:q=>v+(q-u)*slope,slope});
  });
  hits.sort((a,b)=>a.at(x)-b.at(x));
  const pairs:[Hit,Hit][]=[];
  for(let i=1;i<hits.length;i+=2)pairs.push([hits[i-1],hits[i]]);
  return pairs;
}

// Between consecutive vertex stations each boundary intercept is linear.
// The open mezzanine edge follows half the local span, up to the reviewed 16 ft reach.
function mezzanineLoops(api:ManifoldToplevel,rings:Ring[],halfSpan:boolean){
  const stations=[...new Set(rings.flat().map(p=>p[0]))].sort((a,b)=>a-b),traps:Ring[]=[];
  for(let i=1;i<stations.length;i++){
    const a=stations[i-1],b=stations[i];
    if(b-a<1e-7)continue;
    for(const [lo,hi] of spans(rings,(a+b)/2)){
      const width=(x:number)=>hi.at(x)-lo.at(x),cuts=[a,b];
      if(!halfSpan&&(width(a)-32)*(width(b)-32)<0)cuts.splice(1,0,a+(b-a)*(32-width(a))/(width(b)-width(a)));
      const edge=(x:number)=>lo.at(x)+(halfSpan?width(x)/2:Math.min(16,width(x)/2));
      for(let j=1;j<cuts.length;j++){
        const u=cuts[j-1],v=cuts[j];traps.push([[u,lo.at(u)],[v,lo.at(v)],[v,edge(v)],[u,edge(u)]]);
      }
    }
  }
  const sections=new api.CrossSection(traps,'NonZero'),clean=sections.simplify(.015);
  // Simplification can bridge a concave boundary. Keep the scanline-derived tips there.
  const ground=new api.CrossSection(rings,'NonZero'),outside=clean.subtract(ground);
  try{return (outside.area()<1e-6?clean:sections).toPolygons();}finally{outside.delete();ground.delete();sections.delete();clean.delete();}
}

function pose(id:string,role:GuideRole,anchor:THREE.Vector3,q:THREE.Quaternion,size:number):Guide{
  const center=anchor.clone();
  if(role!=='pier')center.sub(new THREE.Vector3(-.42*size,-.45*size,0).applyQuaternion(q));
  return {id,role,size,position:center.toArray(),rotation:q.toArray()};
}

// A rotated bounding box conservatively encloses the actual L glyph.
function guideEnvelope(api:ManifoldToplevel,g:Guide,box:THREE.Box3){
  const points:Point[]=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).multiplyScalar(g.size).applyQuaternion(new THREE.Quaternion(...g.rotation));
    points.push([p.x+g.position[0],p.y+g.position[1]]);
  }
  points.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  function chain(sorted:Point[]){
    const vertices:Point[]=[];
    for(const p of sorted){
      while(vertices.length>=2){
        const [a,b]=vertices.slice(-2);
        if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>1e-12)break;
        vertices.pop();
      }
      vertices.push(p);
    }
    return vertices.slice(0,-1);
  }
  return new api.CrossSection([[...chain(points),...chain([...points].reverse())]]);
}

export function arrangeBoundaryLetters(api:ManifoldToplevel,region:CrossSection,bands:HeightBand[],cap:number,options:AdaptiveOptions,halfSpan=false,pitch=12):BoundaryArrangement {
  if(!(cap>19)||![options.coverage,options.minimum,options.setback,options.separation].every(Number.isFinite)||
      options.coverage<=0||options.coverage>100||Math.min(options.setback,options.separation)<0)throw Error('Invalid boundary placement budget, height or clearance.');
  const guides:Guide[]=[],groups:GuideGroup[]=[];
  const allocated:{delete():void}[]=[];const own=<T extends {delete():void}>(s:T)=>{allocated.push(s);return s;};
  try{
    let allowed=own(region.offset(-Math.max(options.setback,options.separation/2),'Miter',2));
    for(const b of bands)if(b.cap<=19)allowed=own(allowed.subtract(b.section));
    const offset=(d:number)=>allowed.offset(-d,'Miter',2);
    let inset=2,shape=own(offset(inset));const budget=region.area()*options.coverage/100;
    if(shape.area()>budget){
      const {min,max}=allowed.bounds();let lo=inset,hi=Math.hypot(max[0]-min[0],max[1]-min[1]);
      for(let i=0;i<30;i++){const mid=(lo+hi)/2,probe=offset(mid);if(probe.area()>budget)lo=mid;else hi=mid;probe.delete();}
      inset=hi;shape=own(offset(inset));
    }
    const glyph=getLetterVolumeGeometry('L',12);glyph.computeBoundingBox();const box=glyph.boundingBox!;
    function add(role:GuideRole,anchor:THREE.Vector3,q:THREE.Quaternion,desired:number){
      for(const size of (halfSpan?[desired,desired*.65,desired*.4,desired*.25,desired*.125]:[desired,desired*.65,desired*.4])){
        const g=pose('boundary-L-'+(guides.length+1),role,anchor,q,size);
        const hull=guideEnvelope(api,g,box),outside=hull.subtract(allowed);
        const fits=outside.area()<1e-7;outside.delete();hull.delete();
        if(fits){guides.push(g);return g.id;}
      }
      throw Error('A boundary L cannot fit at the required site clearance.');
    }
    for(const piece of shape.decompose().map(own)){
      if(piece.isEmpty()||own(piece.offset(-Math.max(1,options.minimum/2-2))).isEmpty())continue;
      const approx=own(piece.simplify(.3));
      const safe=approx.area()<=piece.area()+.001&&own(approx.subtract(piece)).area()<.001?approx:piece;
      const angle=principalHeading(safe.toPolygons()),local=own(safe.rotate(-angle/radians));
      const rings=local.toPolygons(),mez=mezzanineLoops(api,rings,halfSpan);
      let height=Math.min(40,cap);
      for(const band of bands)if(own(safe.intersect(band.section)).area()>1e-6)height=Math.min(height,band.cap);
      if(height<=19)throw Error('A continuous boundary plate needs more than 19 ft of headroom envelope.');
      function anchor(p:Point,z:number){const [x,y]=fromLocal(p,angle);return new THREE.Vector3(x,y,z);}
      function corners(loops:Ring[],role:'ground'|'mezzanine',z:number){
        return loops.map(ring=>ring.map((p,i)=>{
          const next=ring[(i+1)%ring.length],prev=ring[(i+ring.length-1)%ring.length];
          const q=turn(angle+Math.atan2(next[1]-p[1],next[0]-p[0]));
          const size=Math.min(6,Math.max(1,Math.min(distance(prev,p),distance(p,next))*.35));
          return add(role,anchor(p,z),q,size);
        }));
      }
      const group:GuideGroup={ground:corners(rings,'ground',.75),mezzanine:corners(mez,'mezzanine',height/2),panels:[],piers:[],heading:angle/radians};
      const {min,max}=local.bounds(),n=Math.max(1,Math.ceil((max[0]-min[0])/pitch));
      for(let i=0;i<n;i++){
        const x=min[0]+(i+.5)*(max[0]-min[0])/n;
        for(const [lo,hi] of spans(rings,x)){
          const lower=lo.at(x),width=hi.at(x)-lower,count=Math.max(1,Math.ceil(width/pitch));
          // In the proportional edition a support row follows the open edge.
          // Interior nodes divide each half-span into bays of at most 12 ft.
          const halfBays=Math.ceil(width/(2*pitch));
          const fractions=halfSpan
            ? Array.from({length:2*halfBays-1},(_,j)=>(j+1)/(2*halfBays))
            : Array.from({length:count},(_,j)=>(j+.5)/count);
          for(const fraction of fractions){
            const p:Point=[x,lower+fraction*width];
            // Row tangents interpolate the directions of the two actual flanks.
            const q=turn(angle+Math.atan((1-fraction)*lo.slope+fraction*hi.slope));
            const size=Math.min(2,width/count*.45);
            if(size<1)continue;
            const g=pose('', 'pier',anchor(p,1.05),q,size);
            const disk=own(api.CrossSection.circle(.64*size,16)),pocket=own(disk.translate([g.position[0],g.position[1]]));
            const escape=own(pocket.subtract(safe));
            if(escape.area()<1e-7)group.piers.push(add('pier',anchor(p,1.05),q,size));
          }
        }
      }
      if(!group.piers.length)throw Error('The polygon cannot seat a complete L-pocket pier.');
      const panel=(p:Point,end:Point,bottom:number,top:number,kind:Panel['kind'])=>{
        if(distance(p,end)<.001)return;
        const heading=angle+Math.atan2(end[1]-p[1],end[0]-p[0]);
        const plane=turn(heading).multiply(new THREE.Quaternion().setFromAxisAngle(axisX,Math.PI/2));
        const corners=[p,end,end,p].map((v,i)=>add('wall',anchor(v,i<2?bottom:top),plane.clone().multiply(turn(i*Math.PI/2)),Math.min(1,distance(p,end)*.45)));
        group.panels.push({kind,corners});
      };
      // Split end walls wherever the guide-defined mezzanine edge meets the exterior.
      const mezzSection=own(new api.CrossSection(mez,'NonZero'));
      for(const ring of rings)ring.forEach((p,i)=>{
        const e=ring[(i+1)%ring.length],dx=e[0]-p[0],dy=e[1]-p[1],len=distance(p,e);
        if(len<.001)return;
        if(Math.abs(dx)>=Math.abs(dy)){
          panel(p,e,height/2-2.75,height/2-.75,'mezz-band');
          panel(p,e,height-2.8,height-.8,'roof-band');return;
        }
        const cuts=[0,1];
        for(const v of mez.flat()){
          const fraction=((v[0]-p[0])*dx+(v[1]-p[1])*dy)/(len*len);
          if(fraction>1e-5&&fraction<1-1e-5&&Math.abs((v[0]-p[0])*dy-(v[1]-p[1])*dx)/len<.03)cuts.push(fraction);
        }
        cuts.sort((a,b)=>a-b);
        const at=(f:number):Point=>[p[0]+f*dx,p[1]+f*dy];
        for(let j=1;j<cuts.length;j++){
          const a=at(cuts[j-1]),b=at(cuts[j]);if(distance(a,b)<.02)continue;
          const m=at((cuts[j-1]+cuts[j])/2),sample=own(api.CrossSection.circle(.004,8));
          const inside=own(sample.translate([m[0]-.04*dy/len,m[1]+.04*dx/len]));
          const full=own(inside.intersect(mezzSection)).area()>1e-6;
          panel(a,b,full ? .75 : height/2-2.75,height-.8,'end');
        }
      });
      groups.push(group);
    }
    if(!groups.length)throw Error('No boundary component meets the site clearance, minimum span and footprint budget.');
    return {version:halfSpan?halfSpanVersion:boundaryVersion,guides,groups};
  }finally{allocated.reverse().forEach(s=>s.delete());}
}
