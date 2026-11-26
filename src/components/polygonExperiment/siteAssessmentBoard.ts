import {loadSavedArchitecture} from './ArchitectureLayer';
import {drawSiteIso} from './siteBoardIso';
import type {OrientationResult} from './orientationStore';
import type {Experiment,Registry,Zone} from './model';
import type {Point,Ring} from './territories';
import type {FormMesh} from './architectureViews';
import {territoryColor,territoryInk} from './territoryPalette';

type Design=Awaited<ReturnType<typeof loadSavedArchitecture>>;
type Row={id:string;name:string;share:number;area:number};
type Cluster={record:OrientationResult;zone:Zone;design:Design;rows:Row[]};
const width=2888,height=1781,ink='#F7F6F5',muted='#B9BEC6',gold='#D6AD4F';
const bands=['#095775','#1293C2','#9BD5E4','#F7F6F5'];
const bandLabels=['0–20 ft','>20–40 ft','>40–60 ft','>60 ft'];
const number=(n:number,places:number)=>n.toLocaleString('en-US',{minimumFractionDigits:places,maximumFractionDigits:places});

function measurements(record:OrientationResult,design:Design,registry:Registry):Row[]{
  const name=(id:string)=>registry.items.find(t=>t.id===id)?.name??id;
  const members=design.provenance.members??[];
  if(members.length)return members.map(m=>{
    const area=m.footprintAreaFeet2,share=m.achievedPercent??100*area/record.validation.permittedArea;
    if(!Number.isFinite(area)||!Number.isFinite(share))throw Error('The selected design lacks measured footprint data.');
    return {id:m.typology,name:m.name??name(m.typology),area,share};
  });
  const id=record.typologyId;
  if(id&&registry.items.some(t=>t.id===id)&&record.validation.permittedArea>0&&Number.isFinite(design.validation.footprintArea)){
    const area=design.validation.footprintArea;
    return [{id,name:name(id),area,share:100*area/record.validation.permittedArea}];
  }
  return [];
}

function makePath(contours:Ring[],project:(p:Point)=>Point){
  const path=new Path2D();
  for(const ring of contours){
    if(!ring.length)continue;
    path.moveTo(...project(ring[0]));
    for(let i=1;i<ring.length;i++)path.lineTo(...project(ring[i]));
    path.closePath();
  }
  return path;
}

// Rasterize in plan and keep the topmost built triangle at each pixel.
// Interpolating world Y also measures sloping roofs between their vertices.
function roofHeights(mesh:FormMesh,datum:number,project:(p:Point)=>Point,w:number,h:number){
  const heights=new Float32Array(w*h).fill(-Infinity),p=mesh.positions,ix=mesh.indices;
  const vertices=new Float64Array(p.length);
  for(let i=0;i<p.length;i+=3){
    const [x,y]=project([p[i],p[i+2]]);vertices.set([x,y,p[i+1]-datum],i);
  }
  for(let i=0;i<ix.length;i+=3){
    const a=3*ix[i],b=3*ix[i+1],c=3*ix[i+2],ax=vertices[a],ay=vertices[a+1];
    const bx=vertices[b],by=vertices[b+1],cx=vertices[c],cy=vertices[c+1];
    const det=(bx-ax)*(cy-ay)-(cx-ax)*(by-ay);
    if(Math.abs(det)<1e-9)continue;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=x+.5-ax,dy=y+.5-ay,u=(dx*(cy-ay)-dy*(cx-ax))/det,v=((bx-ax)*dy-(by-ay)*dx)/det;
      if(u<0||v<0||u+v>1)continue;
      const z=vertices[a+2]+u*(vertices[b+2]-vertices[a+2])+v*(vertices[c+2]-vertices[a+2]);
      heights[y*w+x]=Math.max(z,heights[y*w+x]);
    }
  }
  return heights;
}

export async function renderSiteAssessment(records:OrientationResult[],state:Experiment,registry:Registry){
  if(!records.length)throw Error('Select a completed design in the combined site plan.');
  const site=records[0].site;
  const clusters:Cluster[]=await Promise.all(records.map(async record=>{
    const zone=record.site.zones.find(z=>z.id===record.zoneId),design=await loadSavedArchitecture(record.id);
    if(!zone||site.fingerprint!==record.site.fingerprint||site.revision!==record.site.revision||
      design.parentGeometryHash!==record.geometryHash||design.parentOrientationId!==record.id)throw Error('The selected forms do not match the same saved site.');
    return {record,zone,design,rows:measurements(record,design,registry)};
  }));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Could not create the site board.');
  ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);
  function text(value:string,x:number,y:number,size:number,color=ink,maxWidth=width,align:CanvasTextAlign='left'){
    ctx!.fillStyle=color;ctx!.font=size+'px Arial, sans-serif';ctx!.textAlign=align;ctx!.fillText(value,x,y,maxWidth);
  }
  function line(x:number,y:number,w:number){ctx!.fillStyle=muted;ctx!.fillRect(x,y,w,1);}
  text(site.name.toUpperCase(),48,69,51,gold,2080);
  text('SITE DEVELOPMENT',width-48,67,27,ink,640,'right');line(48,96,width-96);
  text('SITE ISO',48,153,33);text('COMBINED SITE PLAN',1450,153,33);text('BUILT HEIGHT',2170,153,33);
  await drawSiteIso(ctx,site,clusters.map(c=>c.zone),clusters.map(c=>c.design.architecture),48,184,1356,942);
  const w=650,h=730,top=190,points=clusters.flatMap(c=>c.zone.polygon);
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const scale=Math.min((w-126)/Math.max(1,maxX-minX),(h-32)/Math.max(1,maxZ-minZ));
  const project=([x,z]:Point):Point=>[(x-(minX+maxX)/2)*scale+w/2-28,((maxZ+minZ)/2-z)*scale+h/2];
  const legend=new Map<string,string>();
  for(const [i,{record,zone,design,rows}] of clusters.entries()){
    const layers=design.planLayers??[];
    const contour=makePath([zone.polygon,...zone.holes],project);
    ctx.save();ctx.translate(1450,top);ctx.fillStyle='#14242B';ctx.fill(contour,'evenodd');
    const saved=state.territoryByZone[zone.id]?.results.area;
    const signature=(record.provenance as {territorySignature?:string}).territorySignature;
    if(signature&&saved?.signature===signature)for(const t of saved.territories){
      ctx.fillStyle=territoryColor(t.typology);ctx.fill(makePath(t.contours,project),'evenodd');
    }
    for(const layer of [...layers].sort((a,b)=>a.top-b.top)){
      const path=makePath(layer.contours,project),fill=territoryColor(layer.typology);
      ctx.fillStyle=fill;ctx.fill(path,'evenodd');ctx.lineWidth=.9;ctx.strokeStyle=territoryInk(fill);ctx.stroke(path);
    }
    const heights=roofHeights(design.architecture,site.coordinates.elevationDatum,project,w,h);
    const map=document.createElement('canvas');map.width=w;map.height=h;
    const mc=map.getContext('2d')!,pixels=mc.createImageData(w,h);
    const colors=bands.map(hex=>[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)));
    const fallback=document.createElement('canvas');fallback.width=w;fallback.height=h;
    const fc=fallback.getContext('2d')!,mask=layers.length?null:fc.createImageData(w,h);
    // Older allocated studies retain their typology in the component ID even
    // when the user has since prepared a different territory allocation.
    const legacyFootprints=new Map<string,Path2D>();
    if(!layers.length&&rows.length>1){
      for(const component of design.components){
        const part=component as {id?:string;mesh?:FormMesh}|null;
        const id=part?.id?.split('/')[0],mesh=part?.mesh;
        if(!mesh||!id||!rows.some(row=>row.id===id))continue;
        const path=legacyFootprints.get(id)??new Path2D();
        for(let j=0;j<mesh.indices.length;j+=3){
          const [a,b,c]=mesh.indices.slice(j,j+3).map(index=>project([mesh.positions[3*index],mesh.positions[3*index+2]]));
          const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
          if(Math.abs(cross)<1e-8)continue;
          path.moveTo(...a);path.lineTo(...(cross>0?b:c));path.lineTo(...(cross>0?c:b));path.closePath();
        }
        legacyFootprints.set(id,path);
      }
    }
    const single=rows.length===1?territoryColor(rows[0].id):ink;
    const tint=[1,3,5].map(k=>parseInt(single.slice(k,k+2),16));
    for(let j=0;j<heights.length;j++){
      if(!Number.isFinite(heights[j]))continue;
      const feet=heights[j],band=feet<=20.001?0:feet<=40.001?1:feet<=60.001?2:3;
      pixels.data.set([...colors[band],255],4*j);
      if(mask)mask.data.set([...tint,255],4*j);
    }
    if(mask){fc.putImageData(mask,0,0);ctx.drawImage(fallback,0,0);}
    for(const [id,path] of legacyFootprints){ctx.fillStyle=territoryColor(id);ctx.fill(path);}
    ctx.lineWidth=2;ctx.strokeStyle=muted;ctx.stroke(contour);ctx.restore();
    mc.putImageData(pixels,0,0);ctx.drawImage(map,2170,top);
    ctx.save();ctx.translate(2170,top);ctx.strokeStyle=muted;ctx.lineWidth=2;ctx.stroke(contour);ctx.restore();
    const ring=zone.polygon.map(project),labelX=Math.max(...ring.map(p=>p[0]))+10,labelY=top+(Math.min(...ring.map(p=>p[1]))+Math.max(...ring.map(p=>p[1])))/2;
    for(const x of [1450,2170])text(String(i+1).padStart(2,'0'),x+labelX,labelY,24,gold);
    rows.forEach(row=>legend.set(row.id,row.name));
  }
  function swatch(x:number,y:number,fill:string,label:string,max:number){
    ctx!.fillStyle=fill;ctx!.fillRect(x,y-18,23,17);ctx!.strokeStyle=muted;ctx!.lineWidth=1;ctx!.strokeRect(x,y-18,23,17);
    text(label,x+34,y,21,ink,max-34);
  }
  text('TYPOLOGIES',1450,955,22,gold);text('HEIGHT ABOVE SITE DATUM',2170,955,22,gold);
  [...legend].forEach(([id,name],i)=>swatch(1450+(i%2)*335,997+Math.floor(i/2)*32,territoryColor(id),name,328));
  bands.forEach((fill,i)=>swatch(2170+(i%2)*250,997+Math.floor(i/2)*36,fill,bandLabels[i],240));
  line(48,1168,width-96);
  const cols=Math.min(2,clusters.length),blocks=Math.ceil(clusters.length/cols),colWidth=(width-96)/cols,blockHeight=570/blocks;
  for(const [i,{zone,rows}] of clusters.entries()){
    const x=48+(i%cols)*colWidth,y=1168+Math.floor(i/cols)*blockHeight,right=x+colWidth-44;
    text(String(i+1).padStart(2,'0')+'   '+zone.name.toUpperCase(),x,y+53,34,gold,colWidth-65);
    text('TYPOLOGY',x,y+106,22,muted);text('BUILT SHARE',right-280,y+106,22,muted,220,'right');text('FOOTPRINT (ft²)',right,y+106,22,muted,260,'right');line(x,y+121,colWidth-44);
    const step=Math.min(56,(blockHeight-140)/Math.max(1,rows.length));
    if(!rows.length)text('Per-typology measurements unavailable for this study.',x,y+166,24,muted,colWidth-60);
    rows.forEach((r,j)=>{
      const baseline=y+125+(j+.8)*step,font=Math.min(30,step*.72);
      ctx.fillStyle=territoryColor(r.id);ctx.fillRect(x,baseline-font*.73,22,16);
      text(r.name,x+38,baseline,font,ink,colWidth*.51);text(number(r.share,2)+'%',right-280,baseline,font,ink,220,'right');
      text(number(r.area,1),right,baseline,font,ink,255,'right');
    });
  }
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG export failed.')),'image/png'));
}
