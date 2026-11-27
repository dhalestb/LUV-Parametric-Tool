import {PDFDocument,PDFHexString,rgb,beginText,endText,setFontAndSize,setTextMatrix,showText,setFillingRgbColor,
  pushGraphicsState,popGraphicsState,rectangle,clip,endPath,concatTransformationMatrix,drawObject} from 'pdf-lib';
import {loadSavedArchitecture} from './ArchitectureLayer';
import {measurements,roofHeights} from './siteAssessmentBoard';
import {territoryColor,territoryInk} from './territoryPalette';
import {clusterBoardTitle,drawCategoryTitle} from './clusterBoardTitle';
import {clusterViews} from './clusterViews';
import {visibleEdges} from './clusterLines';
import glyphs from './boardGlyphs.json';

const H=2160,white='#F7F6F5',gold='#D6AD4F',blue='#71BEDA',gray='#B9BEC6',rule='#6C6C6B';
const bands=['#095775','#1293C2','#9BD5E4','#F7F6F5'];
const rgbParts=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const color=hex=>rgb(...rgbParts(hex));
const num=(value,digits)=>value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const fmt=value=>Number(value.toFixed(3));
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not encode a board illustration.')),'image/png'));

function diagram(doc,width,height,commands){
  return doc.context.register(doc.context.flateStream(commands,{Type:'XObject',Subtype:'Form',BBox:[0,0,width,height],Resources:{}}));
}
function zoneBounds(zone){
  const xs=zone.polygon.map(p=>p[0]),zs=zone.polygon.map(p=>p[1]);
  const x=Math.min(...xs),z=Math.min(...zs),dx=Math.max(...xs)-x,dz=Math.max(...zs)-z;
  return {cx:x+dx/2,cz:z+dz/2,dx,dz};
}
function maps(doc,cluster,scale){
  const {zone,mesh,site,layers}=cluster,{cx,cz}=zoneBounds(zone);
  const w=800,h=640,project=([x,z])=>[w/2+(x-cx)*scale,h/2-(z-cz)*scale];
  const geometry=rings=>rings.map(r=>r.map((p,i)=>project(p).map(fmt).join(' ')+(i?' l':' m')).join(' ')+' h').join(' ');
  const outline=geometry([zone.polygon,...zone.holes]);
  const heights=roofHeights(mesh,site.coordinates.elevationDatum,project,w,h);
  const fills=bands.map(()=>[]);
  for(let y=0;y<h;y++){
    let start=0,previous=-1;
    for(let x=0;x<=w;x++){
      const ft=x===w?-Infinity:heights[y*w+x];
      const band=!Number.isFinite(ft)?-1:ft<=20.001?0:ft<=40.001?1:ft<=60.001?2:3;
      if(previous===band)continue;
      if(previous>=0)fills[previous].push(start+' '+y+' '+(x-start)+' 1 re');
      start=x;previous=band;
    }
  }
  const topDown='1 0 0 -1 0 '+h+' cm\n',edge=rgbParts(gray).join(' ')+' RG 2 w '+outline+' S';
  const paths=[...layers].sort((a,b)=>a.top-b.top).map(layer=>{
    const c=territoryColor(layer.typology);
    return rgbParts(c).join(' ')+' rg '+rgbParts(territoryInk(c)).join(' ')+' RG 1 w '+geometry(layer.contours)+' B*';
  });
  if(!paths.length){
    // Legacy designs have component meshes but lack explicit plan-layer contours.
    const groups=new Map();
    for(const part of cluster.parts){
      const id=cluster.rows.length===1?cluster.rows[0].id:part.id?.split('/')[0];
      if(!part.mesh||!cluster.rows.some(r=>r.id===id))continue;
      const triangles=groups.get(id)??[];groups.set(id,triangles);
      const {positions:p,indices}=part.mesh;
      for(let i=0;i<indices.length;i+=3){
        const ring=indices.slice(i,i+3).map(k=>[p[k*3],p[k*3+2]]);
        const [a,b,c]=ring,cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        if(Math.abs(cross)>1e-6)triangles.push(geometry([cross>0?ring:[a,c,b]]));
      }
    }
    for(const [id,pathsForId] of groups)paths.push(rgbParts(territoryColor(id)).join(' ')+' rg '+pathsForId.join(' ')+' f');
    if(!paths.length)throw Error('This saved study has no measured typology plan to export.');
  }
  const height=diagram(doc,w,h,topDown+fills.map((r,i)=>rgbParts(bands[i]).join(' ')+' rg '+r.join(' ')+' f').join('\n')+'\n'+edge);
  return {height,plan:diagram(doc,w,h,topDown+paths.join('\n')+'\n'+edge)};
}

async function pictures(doc,clusters,status){
  const view=clusterViews(clusters);
  // Raster perspectives at their final print density. Orthographic crease lines and diagrams remain vector.
  async function render(mode,index,w,h,label){
    status('Rendering '+label+'…');await new Promise(resolve=>setTimeout(resolve,0));
    const shot=await view(label,Math.round(w),Math.round(h),index,mode);
    const blob=await png(shot.canvas);
    shot.canvas.width=shot.canvas.height=1;
    const image=await doc.embedPng(await blob.arrayBuffer());
    await image.embed();
    if(index===null)return {image};
    const lines=visibleEdges(clusters[index].mesh,shot);
    const path=lines.replace(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g,'$1 $2 m $3 $4 l ');
    const strokes=diagram(doc,shot.width,shot.height,'1 0 0 -1 0 '+shot.height+' cm .24 .24 .24 RG 1 J 1.5 w '+path+' S');
    return {image,strokes,w:shot.width,h:shot.height,bar:shot.sourceBarPixels/shot.width};
  }
  const density=300/72;
  const site=await render('site',null,2480*density,835*density,'site perspective');
  const perspective=await render('persp',null,1830*density,1464*density,'cluster perspective');
  const mapScale=Math.min(...clusters.flatMap(({zone})=>{
    const {dx,dz}=zoneBounds(zone);return [768/Math.max(dx,1),608/Math.max(dz,1)];
  }));
  const zones=[];
  for(const [i,c] of clusters.entries()){
    const plan=await render('plan',i,1280*3,660*3,c.zone.name+' roof plan');
    const side=await render('side',i,1170*4,468*4,c.zone.name+' elevation');
    zones.push({plan,side,maps:maps(doc,c,mapScale)});
  }
  return {site,perspective,zones};
}

function boardPage(page,clusters,pics,offset){
  function text(x,y,value,size,fill=white,right=false){
    const letters=Array.from(value,c=>glyphs[c]??glyphs['?']);
    const codes=letters.map(([n])=>n.toString(16).padStart(2,'0')).join('');
    const dx=right?letters.reduce((n,g)=>n+g[1],0)*size/1000:0;
    page.pushOperators(pushGraphicsState(),beginText(),setFontAndSize('BoardArial',size),setFillingRgbColor(...rgbParts(fill)),
      setTextMatrix(1,0,0,1,x-dx,H-y),showText(PDFHexString.of(codes)),endText(),popGraphicsState());
  }
  function line(x,y,X,Y,fill=rule,thickness=1.6){
    page.drawLine({start:{x,y:H-y},end:{x:X,y:H-Y},color:color(fill),thickness});
  }
  function swatch(x,y,c){page.drawRectangle({x,y:H-y-1,width:22,height:16,color:color(c),borderColor:color(gray),borderWidth:1});}
  function form(ref,x,y,scale){
    const name=page.node.newXObject('Drawing',ref);
    page.pushOperators(pushGraphicsState(),concatTransformationMatrix(scale,0,0,scale,x,H-y),drawObject(name),popGraphicsState());
  }
  function image(pic,x,y,w,h){
    page.drawImage(pic.image,{x,y:H-y-h,width:w,height:h});
    if(pic.strokes)form(pic.strokes,x,y+h,w/pic.w);
  }
  function bar(x,y,dx){
    line(x,y,x+dx,y,white,3);line(x,y-9,x,y+2,white,3);line(x+dx,y-9,x+dx,y+2,white,3);text(x+dx+17,y+7,'50 ft',25);
  }
  const heads=[[150,2636,clusters[0].site.name.toUpperCase()],[2775,4584,'CLUSTER PERSPECTIVE'],[4710,5988,'CLUSTER PLANS'],[6108,7280,'SIDE ELEVATIONS']];
  for(const [x,r,label] of heads){text(x,375,label,63,'#FFFFFF');line(x,418,r,418);}
  for(const x of [2704,4647,6048])line(x,268,x,2056,gray,2);
  text(150,469,'SITE PERSPECTIVE  /  SITE CONTEXT',25,gold);
  text(2775,469,'COMBINED CLUSTER VIEW  /  ARCHITECTURAL STUDY',25,gold);
  image(pics.site,150,495,2480,835);image(pics.perspective,2760,504,1830,1464);
  text(150,1385,'BUILT HEIGHT',28,gold);text(820,1385,'COMBINED SITE PLAN',28,gold);
  ['0–20 ft','>20–40 ft','>40–60 ft','>60 ft'].forEach((label,i)=>{
    const y=1738+(i-1.5)*50;swatch(540,y,bands[i]);text(579,y,label,26);
  });
  line(2775,1983,4584,1983);
  const hasAccents=clusters.some(c=>c.layers.some(l=>/seating terrace|performance platforms|continuous gallery walk|atrium walk|gallery pad|contour terrace/i.test(l.name)));
  if(hasAccents){swatch(2775,2031,blue);text(2811,2031,'Letter-derived gathering platforms and walks',26);}
  for(const [i,c] of clusters.entries()){
    const y=469+i*790,top=1404+i*330,base=top+44,name=c.zone.name.toUpperCase();
    const {side,plan,maps}=pics.zones[i];
    form(maps.height,150,top+320,.5);form(maps.plan,820,top+320,.5);
    text(1273,base,name+(offset?'  /  CONTINUED':''),32,gold);text(1273,base+44,'TYPOLOGY',25,gray);
    text(2386,base+44,'BUILT SHARE',25,gray,true);text(2636,base+44,'FOOTPRINT (ft²)',25,gray,true);
    line(1273,base+56,2636,base+56);
    c.rows.slice(offset,offset+5).forEach((row,j)=>{
      const yy=base+106+j*43;
      swatch(1273,yy,territoryColor(row.id));text(1311,yy,row.name,30);
      text(2386,yy,num(row.share,2)+'%',29,white,true);text(2636,yy,num(row.area,1),29,white,true);
    });
    text(4710,y,name+'  /  ROOF PLAN',25,gold);image(plan,4708,y+50,1280,660);bar(4725,y+742,1280*plan.bar);
    text(6108,y,name+'  /  ORTHOGRAPHIC',25,gold);image(side,6108,y+12,1170,468);
    const ground=y+12+.91*468;line(6108,ground,7280,ground,gray,1.3);bar(6110,ground+34,1170*side.bar);
    const zoneIndex=c.site.zones.findIndex(z=>z.id===c.zone.id);
    const zoom=448/1143;
    page.pushOperators(pushGraphicsState(),rectangle(6110,H-y-512-225,448,225),clip(),endPath());
    image(side,6110-(zoneIndex===0?2034:2988)*zoom,y+512-(zoneIndex===0?1055:1138)*zoom,4680*zoom,1872*zoom);
    page.pushOperators(popGraphicsState());text(6605,y+583,'FACADE DETAIL',23,blue);text(6605,y+625,'Enlarged detail',25,gray);
  }
  line(4710,1240,5988,1240);line(6108,1240,7280,1240);
}

export async function renderClusterPdf(records,registry,status){
  const clusters=[];
  for(const r of records){
    const site=r.site, zone=site.zones.find(z=>z.id===r.zoneId), d=await loadSavedArchitecture(r.id);
    if(!zone||d.parentGeometryHash!==r.geometryHash||d.parentOrientationId!==r.id||
       site.fingerprint!==records[0].site.fingerprint||site.revision!==records[0].site.revision)
      throw Error('The selected forms must belong to the same saved site.');
    const rows=measurements(r,d,registry);
    if(!rows.length)throw Error('The saved study has no typology footprint measurements.');
    clusters.push({zone,site,rows,mesh:d.architecture,parts:d.components??[],layers:d.planLayers??[]});
  }
  if(!clusters.length)throw Error('Select a completed study first.');
  const response=await fetch('/boards/cluster-letterheads.pdf');
  if(!response.ok)throw Error('The approved InDesign letterhead could not be loaded.');
  const template=await PDFDocument.load(await response.arrayBuffer()),doc=await PDFDocument.create();
  const heading=clusterBoardTitle(clusters);
  doc.setTitle(heading.title);
  for(let start=0;start<clusters.length;start+=2){
    const pair=clusters.slice(start,start+2),pics=await pictures(doc,pair,status);
    for(let offset=0;offset<Math.max(...pair.map(c=>c.rows.length));offset+=5){
      const [page]=await doc.copyPages(template,[heading.template]);doc.addPage(page);
      if(heading.template===3)drawCategoryTitle(page,heading.title);
      boardPage(page,pair,pics,offset);
    }
  }
  status('Writing the vector PDF…');
  return new Blob([await doc.save()],{type:'application/pdf'});
}

