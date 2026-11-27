import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {glyph} from '../../../vendor/architectural-board/src/components/linearGalleryPerimeter';
import {getLetterVolumeGeometry} from '../../../vendor/architectural-board/src/components/letterGeometry3d';
import type {Letter} from './continuousFormation';
import type {Point} from './territories';

type Emit=(name:string,plan:CrossSection,lo:number,hi:number,sources:string[])=>void;
type Own=(plan:CrossSection)=>CrossSection;
type Station={id:string;from:number;to:number;depth:number;top:number;arm:number};
type Side={start:Point;tx:number;ty:number;length:number};
const span=(p:ReturnType<typeof glyph>)=>p.to-p.from;

// Keep the native beveled glyphs in an indexed mesh. A full site perimeter
// commonly uses hundreds of letters, most of whose triangle vertices are shared.
function profile(letter:'L'|'V',feet:number,variant:number){
 const p=glyph(letter,0,feet,variant),g=getLetterVolumeGeometry(letter,12);
 const attr=g.getAttribute('position'),vertices: [number,number,number][]=[],indices:number[]=[];
 const seen=new Map<string,number>(),c=Math.cos(p.angle),s=Math.sin(p.angle);
 const pointIndex=(index:number)=>{
  const x=attr.getX(index)*p.scale,y=attr.getY(index)*p.scale,z=attr.getZ(index)*p.scale;
  const key=[x,y,z].join(',');let i=seen.get(key);
  if(i===undefined){i=vertices.length;seen.set(key,i);vertices.push([c*x-s*y-p.from,p.face+s*x+c*y,z-p.minZ]);}
  return i;
 };
 for(let i=0;i<(g.index?.count??attr.count);i+=3){
  for(const j of [i,i+2,i+1])indices.push(pointIndex(g.index?g.index.getX(j):j));
 }
 // Measure the supporting arm behind its exterior face at midspan.
 const mid=(p.from+p.to)/2,depths:number[]=[];
 const outline=getLetterShapeOutline();
 function getLetterShapeOutline(){
  // Intersect the actual native mesh with a vertical plane halfway along its edge.
  const depthAtMid=(a:number[],b:number[])=>{
   if((a[0]<=mid-p.from&&b[0]>mid-p.from)||(b[0]<=mid-p.from&&a[0]>mid-p.from))
    depths.push(a[1]+(b[1]-a[1])*(mid-p.from-a[0])/(b[0]-a[0]));
  };
  for(let i=0;i<indices.length;i+=3){
   const v=indices.slice(i,i+3).map(j=>vertices[j]);
   if(Math.min(...v.map(a=>a[2]))>=(p.maxZ-p.minZ)/2||Math.max(...v.map(a=>a[2]))<=(p.maxZ-p.minZ)/2)continue;
   const points:number[][]=[];
   for(let j=0;j<3;j++){const a=v[j],b=v[(j+1)%3],h=(p.maxZ-p.minZ)/2;
    if((a[2]<=h&&b[2]>h)||(b[2]<=h&&a[2]>h)){const t=(h-a[2])/(b[2]-a[2]);points.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
   if(points.length===2)depthAtMid(points[0],points[1]);
  }
  return depths.filter(d=>d>.05).sort((a,b)=>a-b);
 }
 const nativeIndices=Uint32Array.from(indices,(_,i)=>indices[i%3===0?i:i%3===1?i+1:i-1]);
 return {...p,vertices,indices,nativeIndices,arm:outline[0]??.53125};
}
const profiles=[profile('L',4,0),profile('V',5,0),profile('L',6,1)];
function sides(plan:CrossSection):Side[]{
 return plan.toPolygons().flatMap(loop=>loop.map((start,i)=>{
  const end=loop[(i+1)%loop.length],dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
  return {start,tx:dx/length,ty:dy/length,length};
 }));
}
function randomSequence(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function point(side:Side,along:number,inward:number):Point{
 return [side.start[0]+along*side.tx-inward*side.ty,side.start[1]+along*side.ty+inward*side.tx];
}
function panel(api:ManifoldToplevel,side:Side,a:number,b:number,d:number,e:number){
 return new api.CrossSection([[point(side,a,d),point(side,b,d),point(side,b,e),point(side,a,e)]],'EvenOdd');
}
// Fit the Study 177 upper footprint in plan before generating any letters.
// Its two side lengths may reduce together to stay on the supporting roof.
function upperPlan(api:ManifoldToplevel,lower:CrossSection,own:Own){
 const side=sides(lower).reduce((a,b)=>a.length>b.length?a:b);
 const heading=Math.atan2(side.ty,side.tx)*180/Math.PI;
 const {min,max}=lower.bounds();
 // Locked mixed-course reference areas and compact upper aspect ratio.
 const target=lower.area()*548.736/928.501,aspect=Math.sqrt(28.3616/19.3478);
 const centers:Point[]=[];
 for(let i=1;i<8;i++)for(let j=1;j<8;j++)centers.push([min[0]+(max[0]-min[0])*i/8,min[1]+(max[1]-min[1])*j/8]);
 centers.sort((p,q)=>Math.hypot(2*p[0]-min[0]-max[0],2*p[1]-min[1]-max[1])-Math.hypot(2*q[0]-min[0]-max[0],2*q[1]-min[1]-max[1]));
 const terrace=own(lower.offset(-2.5,'Miter',2));
 // Search the reference proportions first. For slender parcels, try a
 // narrower upper gallery at the same rotation and keep a walkable margin.
 for(const angle of [heading+25,heading-25,heading])for(const ratio of [aspect,1/aspect,1.65,1/1.65]){
  for(let scale=1;Math.sqrt(target)*scale>=8;scale*=.92){
   const size=Math.sqrt(target)*scale;
   if(Math.min(size*ratio,size/ratio)<12)break;
   const shape=own(own(api.CrossSection.square([size*ratio,size/ratio],true)).rotate(angle));
   for(const center of centers){
    const trial=shape.translate(center),outside=trial.subtract(terrace),fits=outside.area()<1e-8;
    outside.delete();if(fits)return own(trial);trial.delete();
   }
  }
 }

}
export function galleryCourses(api:ManifoldToplevel,domain:CrossSection,origin:Point,datum:number,
 height:number,target:number|undefined,wall:number,prefix:string,seed:number,emit:Emit){
 const letters:Letter[]=[],owned:CrossSection[]=[],sourceSolids:Manifold[]=[];
 const own:Own=s=>{owned.push(s);return s;};
 const mid=height/2,random=randomSequence(seed);
 try{
  const pieces=domain.decompose().map(own);
  for(const [part,piece] of pieces.entries()){
   // Set the local building line just inside the protected/site boundary so
   // straight letter faces can follow a polygonal approximation of a curved cut.
   // A sharp residual tip cannot receive two full-size glyphs. Bevel the
   // organizing contour before placing letters so those tips remain terrace.
   const core=own(piece.offset(-6,'Miter',2));
   const eased=core.isEmpty()?piece:own(core.offset(4.25,'Square',2));
   const candidate=own(eased.simplify(1.3));
   const lower=!candidate.isEmpty()&&own(candidate.subtract(piece)).area()<1e-8?candidate:piece;
   const upper=upperPlan(api,lower,own);
   // A sliver that cannot carry an articulated upper gallery remains terrace.
   // Never emit a standalone lower block masquerading as the two-level gallery.
   if(!upper)continue;
   const floors=[lower,upper],edges=floors.map(sides);
   const perimeters=edges.map(list=>list.reduce((sum,s)=>sum+s.length,0));
   const levels=floors.map((_,i)=>{
    const base=i*mid,first=i?base:Math.min(4.5,mid/4),step=Math.min(13,(base+mid-first-1)/(i?2:1));
    const row:number[]=[];
    for(let z=first;z<=base+mid-1+.000001;z+=step)row.push(z);
    return row;
   });
   const demand=perimeters.reduce((sum,p,i)=>sum+p*levels[i].length,0);
   const budget=target===undefined?Infinity:target*piece.area()/domain.area();
   for(const [storey,footprint] of floors.entries()){
    const base=storey*mid,nominals=levels[storey],storeyName=(storey?'upper':'lower')+'-'+part;
    const ids:string[]=[],occupied:CrossSection[]=[],roofCuts:CrossSection[]=[],floorCuts:CrossSection[]=[];
    const sidesHere=edges[storey];
    // Each occupied lift needs a complete course. Apply a soft count
    // to optional lifts, never to a centered patch on an individual side.
    if(Number.isFinite(budget)){
     const minimum=storey?3:2;
     const wanted=Math.max(minimum,Math.round(budget*4.8/demand*nominals.length));
     if(wanted<nominals.length){
      const full=[...nominals];
      nominals.splice(0,nominals.length,...Array.from({length:wanted},(_,i)=>full[Math.round(i*(full.length-1)/(wanted-1))]));
     }
    }
    const placed:{min:Point;max:Point;bottom:number;top:number;body:Manifold}[]=[];
    const doors:CrossSection[]=[];
    if(storey)for(const i of [0,2]){const side=sidesHere[i];doors.push(own(panel(api,side,side.length/2-1.75,side.length/2+1.75,-1,9)));}
    const passages=own(api.CrossSection.union(doors));
    const parts:{name:string;shape:CrossSection;lo:number;hi:number;ids:string[]}[]=[];
    const add=(name:string,shape:CrossSection,lo:number,hi:number,source:string[])=>{
     if(hi>lo&&!shape.isEmpty())parts.push({name,shape,lo,hi,ids:source});
    };
    const heads:number[]=[],columns:{shape:CrossSection;top:number;id:string}[]=[];
    for(const [sideIndex,side] of sidesHere.entries()){

     const rows:Station[][]=[];
     const localPanel=(a:number,b:number,d:number,e:number)=>own(panel(api,side,a,b,d,e));
     // Reject corner/courtyard crossings using the full bevel hull, not just
     // the exterior receiving edge. Rows share a straight facade datum.
     for(const [rank,nominal] of nominals.entries()){
      const row:Station[]=[];rows.push(row);
      const order=[...profiles];let j=0;
      const end=side.length;
      // Offset successive starts so the setbacks read in running bond.
      let at=rank%2 && end>12?1.75:0;
      while(at+2<end){
       if(j%3===0){for(let k=2;k>0;k--){const n=Math.floor(random()*(k+1));[order[k],order[n]]=[order[n],order[k]];}}
       const first=j++%3;
       const fitting=order.map((_,k)=>order[(first+k)%3]).filter(candidate=>at+span(candidate)<=end);
       if(!fitting.length)break;
       let accepted=false;
       for(const p of fitting){
       const width=span(p);
       const cycle=[0,1,2,.5],phase=(row.length+rank+sideIndex+storey)%4;
       let depth=row.length?cycle[phase]:0;
       if(row.length&&depth===row[row.length-1].depth)depth=cycle[(phase+1)%4];
       const hull=own(new api.CrossSection([p.outline.map(([x,y])=>point(side,at+x-p.from,depth+p.face+y))],'EvenOdd'));
       if(own(hull.subtract(footprint)).area()>1e-7){
        continue;
       }
       const variance=mid<25?mid/8:4;
       const offsets=[-variance,0,variance].filter(z=>nominal+z>=base&&nominal+z+p.maxZ-p.minZ<=base+mid+.000001);
       if(!offsets.length)continue;
       const xy=p.vertices.map(([x,y])=>point(side,at+x,depth+y));
       const bounds=hull.bounds(),rise=p.maxZ-p.minZ;
       const neighbours=placed.filter(s=>s.min[0]<bounds.max[0]&&s.max[0]>bounds.min[0]&&s.min[1]<bounds.max[1]&&s.max[1]>bounds.min[1]);
       const raw=new api.Mesh({numProp:3,vertProperties:new Float32Array(xy.flatMap(([x,y],i)=>[x,y,p.vertices[i][2]])),
        triVerts:p.nativeIndices});
       raw.merge();const original=new api.Manifold(raw);
       let bottom:number|undefined;
       for(const offset of new Set([offsets[(sideIndex+row.length+rank)%offsets.length],...offsets])){
        const z=nominal+offset,body=original.translate([0,0,z]);
        const overlaps=neighbours.some(s=>{
         if(s.top<=z||s.bottom>=z+rise)return false;
         const hit=body.intersect(s.body),volume=hit.volume();hit.delete();return volume>1e-7;
        });
        if(overlaps){body.delete();continue;}
        sourceSolids.push(body);placed.push({...bounds,bottom:z,top:z+rise,body});bottom=z;break;
       }
       original.delete();
       if(bottom===undefined)continue;
       const top=bottom+rise;
       const id=prefix+'/'+storeyName+'/side-'+sideIndex+'/lift-'+rank+'/'+p.letter+(row.length+1);
       const positions=xy.flatMap(([x,y],i)=>[x+origin[0],datum+bottom!+p.vertices[i][2],y+origin[1]]);
       letters.push({id,letter:p.letter,nominalSizeFeet:Math.round(p.scale*.92),mesh:{positions,indices:p.indices}});
       ids.push(id);row.push({id,from:at,to:at+width,depth,top,arm:p.arm});at+=width;accepted=true;break;
       }
       if(!accepted)at+=.25;
      }
     }
     const all=rows.flat();if(!all.length)continue;
     const sideName='side-'+sideIndex+'/';
     const cuts=[...new Set(all.flatMap(s=>[s.from,s.to]))].sort((a,b)=>a-b);
     const planks:{shape:CrossSection;top:number;id:string}[]=[];
     for(let i=1;i<cuts.length;i++){
      const a=cuts[i-1],b=cuts[i];if(b-a<1e-6)continue;
      const active=all.filter(s=>s.from<b&&s.to>a);if(!active.length)continue;
      const first=active[0],last=active[active.length-1];
      occupied.push(localPanel(a,b,-1,wall+.01));
      if(first.depth)floorCuts.push(localPanel(a,b,-1,first.depth));
      const cap=active.filter(s=>rows.slice(storey?-2:-1).some(row=>row.includes(s)));
      const recess=Math.min(...(cap.length?cap:[last]).map(s=>s.depth));
      if(recess)roofCuts.push(localPanel(a,b,-1,recess));
      add(sideName+'base-wall-'+i,localPanel(a,b,first.depth,first.depth+wall),base,first.top,[first.id]);
      for(let k=1;k<active.length;k++){
       const p=active[k-1],q=active[k];
       add(sideName+'face-'+i+'-'+k,localPanel(a,b,p.depth,p.depth+wall),p.top,q.top,[p.id,q.id]);
       if(p.depth!==q.depth){
        const shape=localPanel(a,b,Math.min(p.depth,q.depth),Math.max(p.depth,q.depth)+wall);
        add(sideName+'receiver-plank-'+i+'-'+k,shape,q.top-wall,q.top,[p.id,q.id]);planks.push({shape,top:q.top,id:q.id});
       }
      }
      add(sideName+'roof-wall-'+i,localPanel(a,b,last.depth,last.depth+wall),last.top,base+mid,[last.id]);
     }
     for(const [rank,row] of rows.entries()){
      if(storey&&rank===nominals.length-2)heads.push(...row.map(s=>s.top));
      if(storey&&rank===nominals.length-1)for(const s of row)columns.push({shape:localPanel(s.from,s.to,s.depth,s.depth+Math.max(wall,s.arm)),top:s.top,id:s.id});
      for(let j=1;j<row.length;j++){
       const left=row[j-1],right=row[j];if(Math.abs(left.to-right.from)>.01||left.depth===right.depth)continue;
       const end=left.to,start=left.depth<right.depth?end-wall:end;
       const crest=Math.max(left.top,right.top),sill=Math.min(left.top,right.top);
       const below=rank?rows[rank-1].filter(s=>s.from<=end&&s.to>=end):[];
       if(rank&&!below.length)continue;
       const prior=rank?Math.max(...below.map(s=>s.top)):base;
       if(prior>=crest)continue;
       const raised=rank>0&&sill>prior+.5&&crest>sill+.25;
       const lo=raised?sill:prior,hi=rank&&!raised?(prior+crest)/2:crest;
       const web=localPanel(start,start+wall,Math.min(left.depth,right.depth),Math.max(left.depth,right.depth)+wall);
       add(sideName+'daylight-return-'+rank+'-'+j,web,lo,hi,[left.id,right.id]);
       if(rank===0){
        const bearing=planks.filter(pl=>pl.top>hi+wall&&pl.top<base+mid-wall&&own(pl.shape.intersect(web)).area()>.01).sort((a,b)=>a.top-b.top)[0];
        if(bearing){
         const next=all.filter(s=>s.from<=end+wall&&s.to>=end-wall&&s.top>bearing.top+wall).sort((a,b)=>a.top-b.top)[0];
         add(sideName+'plank-return-'+j,web,bearing.top,next?.top??base+mid,[left.id,bearing.id]);
        }
       }
      }
     }
    }
    if(!ids.length)throw Error('No native letter course fits the '+storeyName+' Gallery perimeter.');
    const roof=storey?Math.min(height,Math.max(base+7+wall,...heads)):mid;
    const shell=own(footprint.subtract(own(footprint.offset(-wall,'Miter',2))));
    add('perimeter closures',own(shell.subtract(own(api.CrossSection.union(occupied)))),base,roof,ids);
    const write=(name:string,shape:CrossSection,lo:number,hi:number,source:string[])=>{
     if(hi>lo&&!shape.isEmpty())emit(storeyName+'/'+name,shape,lo,hi,source);
    };
    for(const part of parts){
     const hi=part.name.includes('/daylight-return-')?part.hi:Math.min(part.hi,roof);
     if(storey&&part.lo<base+7){
      write(part.name,own(part.shape.subtract(passages)),part.lo,Math.min(hi,base+7),part.ids);
      write(part.name+'/head',part.shape,base+7,hi,part.ids);
     }else write(part.name,part.shape,part.lo,hi,part.ids);
    }
    for(const [i,c] of columns.entries())write('edge-column-'+i,c.shape,roof,c.top,[c.id]);
    write('contour floor',own(footprint.subtract(own(api.CrossSection.union(floorCuts)))),storey?base-wall:base,storey?base:wall,ids);
    write('enclosed roof',own(footprint.subtract(own(api.CrossSection.union(roofCuts)))),roof-wall,roof,ids);
   }
  }
  return letters;
 }finally{sourceSolids.forEach(s=>s.delete());owned.reverse().forEach(s=>s.delete());}
}
