import type {AmphitheaterResult} from './amphitheaterInteractiveTypes';

type Layer={zone:string;vertices:number[][];lengths:number[];count:number;nominal:number};
type Snapshot={layers?:Layer[];terraceRotation?:number;printGallery?:boolean};
type Surface={kind:string;zone:string;top:number};
const gold='#D6AD4F',cyan='#71BEDA',white='#F7F6F5';
const ft=(n:number)=>Number(n.toFixed(1))+'′';

// Draw from the saved footprint loops and intersect the actual exported mesh.
export function galleryPanel(ctx:CanvasRenderingContext2D,result:AmphitheaterResult,view:'orientation'|'generation',x:number,y:number,width:number){
 const snapshot=result.request.sourceSnapshot as Snapshot|undefined,layers=snapshot?.layers;
 const lower=layers?.find(l=>l.zone==='lower'),upper=layers?.find(l=>l.zone==='upper');
 if(!layers||!lower||!upper)return false;
 const {field}=result.request,mid=field.height/2,angle=snapshot?.terraceRotation??0;
 const surfaces=(result.galleryReport as {surfaces?:Surface[]}|undefined)?.surfaces??[];
 const roof=surfaces.find(s=>s.kind==='roof-plank'&&s.zone==='upper')?.top;
 const cut=.03125,scale=400/Math.max(field.width,field.depth);
 const sizes=[...new Set(result.request.source.map(p=>Math.round(p.scale*.92)))].sort((a,b)=>a-b);
 ctx.save();ctx.translate(x,y);ctx.scale(width/1000,width/1000);
 function label(s:string,a:number,b:number,size=26,color=white){ctx.fillStyle=color;ctx.font=size+'px Arial, sans-serif';ctx.fillText(s,a,b);}
 function line(a:number,b:number,c:number,d:number,color:string,weight=2){ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.lineWidth=weight;ctx.strokeStyle=color;ctx.stroke();}
 label(view==='orientation'?'ORIENTATION RULES':'GENERATION RULES',0,45,36,gold);
 if(view==='orientation'){
  const cx=290,cy=306;
  function footprint(l:Layer,color:string,fill:string){ctx.beginPath();l.vertices.forEach(([a,b],i)=>{if(i===0)ctx.moveTo(cx+a*scale,cy-b*scale);else ctx.lineTo(cx+a*scale,cy-b*scale);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=color;ctx.stroke();}
  footprint(lower,cyan,'rgba(113,190,218,0.24)');footprint(upper,gold,'rgba(214,173,79,0.18)');
  ctx.setLineDash([9,7]);line(cx-215,cy-cut*scale,cx+215,cy-cut*scale,white);ctx.setLineDash([]);
  label('LOWER FOOTPRINT',565,194,24,cyan);label(ft(lower.lengths[0])+' × '+ft(lower.lengths[1]),565,239,32);
  label('UPPER FOOTPRINT',565,322,24,gold);label(ft(upper.lengths[0])+' × '+ft(upper.lengths[1]),565,367,32);
  label('Upper turn  '+angle+'°',565,425,26);
  label('Footprints meet at '+ft(mid),565,473,26);
  const stations=(result.galleryReport as {stations?:{setback:number;offset:number}[]}|undefined)?.stations??[];
  const values=(k:'setback'|'offset')=>[...new Set(stations.map(s=>s[k]).filter(Number.isFinite))].sort((a,b)=>a-b).map(v=>(v>0&&k==='offset'?'+':'')+ft(v)).join(', ');
  const notes=[sizes.map(v=>ft(v)).join(', ')+' letters in running bond across '+layers.length+' lifts.',
   ...(stations.length?['Edge recess from footprint: '+values('setback')+'.','Letter base relative to nominal lift: '+values('offset')+'.']:[]),
   'The lower mass meets the cantilever at half the field height.',
   ...(angle?['Automatic upper rotation ranges from 25° to 75°.']:[]),
   'Both exterior arms of each corner L generate wall segments.'];
  notes.forEach((n,i)=>label('•  '+n,0,628+i*46,26));
 }else{
  const s=440/Math.max(field.width,field.height),cx=268,ground=530;
  const m=result.architecture;
  ctx.beginPath();
  for(let i=0;i<m.indices.length;i+=3){const points:number[][]=[];
   for(let j=0;j<3;j++){const a=m.indices[i+j]*3,b=m.indices[i+(j+1)%3]*3,p=m.positions,ay=p[a+1],by=p[b+1];
    if((ay<cut)===(by<cut))continue;
    const t=(cut-ay)/(by-ay);points.push([cx+(p[a]+t*(p[b]-p[a]))*s,ground-(p[a+2]+t*(p[b+2]-p[a+2]))*s]);}
   if(points.length===2){ctx.moveTo(points[0][0],points[0][1]);ctx.lineTo(points[1][0],points[1][1]);}
  }
  ctx.lineWidth=3;ctx.strokeStyle=white;ctx.stroke();
  for(const [z,title] of [[0,'Base'],[mid,'Terrace level'],...(roof===undefined?[]:[[roof,'Upper roof']])] as [number,string][]){const h=ground-z*s;line(441,h,492,h,cyan);label(ft(z)+'   '+title,502,h+8,26,cyan);}
  label('Section',0,578,32);
  const notes=snapshot?.printGallery?['Wall segments rise to the top edges of the receiving letters above.','Setbacks form recesses. Partial returns leave daylight slots.',...(surfaces.some(s=>s.kind==='contour-floor')?['Floor slabs follow the stepped base of each mass.']:[]),'Top letter extrusions form columns above the upper roof.',...(angle?['Two level openings connect the upper floor to the terraces.']:[]),'The roof meets the second lift of letters from the top.']:['Exterior letter edges establish the wall positions.','Wall heights respond to the receiving edges above.'];
  notes.forEach((n,i)=>label('•  '+n,0,628+i*46,26));
 }
 ctx.restore();return true;
}

export function galleryJoint(ctx:CanvasRenderingContext2D,result:AmphitheaterResult,x:number,y:number,width:number,draw:(ids:string[],walls:string[],dx:number,dy:number)=>void){
 type Edge={id:string;sourceId:string;zone:string;edge:number[][];tangent:number[];top:number;upper:string[];spans:number[][]};
 const edges=(result.galleryReport as {stations?:Edge[]}|undefined)?.stations??[],lookup=new Map(edges.map(e=>[e.id,e]));
 const candidates=edges.filter(e=>e.zone==='lower'&&e.upper?.length===2&&e.spans?.length===2&&e.upper.every(id=>lookup.get(id)?.zone==='lower')&&Math.abs(lookup.get(e.upper[0])!.top-lookup.get(e.upper[1])!.top)>1);
 const rise=(e:Edge)=>Math.max(...e.upper.map(id=>lookup.get(id)!.top))-e.top;
 const source=candidates.sort((a,b)=>rise(a)-rise(b))[0];if(!source)return;
 ctx.save();ctx.translate(x,y);ctx.scale(width/2000,width/2000);
 const note=(s:string,a:number,b:number,size:number,color:string)=>{ctx.fillStyle=color;ctx.font=size+'px Arial';ctx.fillText(s,a,b);};
 note('LETTER EDGE WALL FORMATION',0,45,32,cyan);
 const receivers=source.upper.map(id=>lookup.get(id)!);
 const surfaces=(result.galleryReport as {surfaces?:{id:string;kind:string;sources:string[]}[]}|undefined)?.surfaces??[];
 const walls=surfaces.filter(s=>s.kind==='wall'&&s.sources[0]===source.sourceId&&receivers.some(r=>s.sources[1]===r.sourceId)).map(s=>s.id);
 draw([source.sourceId,...receivers.map(q=>q.sourceId)],walls,source.tangent[1],-source.tangent[0]);
 note('One edge, two receiving heights',360,139,32,white);
 note('Each portion rises to the top edge',360,208,26,white);
 note('of its receiving letter.',360,252,26,white);
 ctx.restore();
}
