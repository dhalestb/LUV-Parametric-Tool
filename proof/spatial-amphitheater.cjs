const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const render = require('./render.cjs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename,'utf8'), {compilerOptions:{module:1,target:7,esModuleInterop:true}}
).outputText,filename);
const {getLetterVolumeGeometry} = require('../src/components/letterGeometry3d.ts');
const {controlsFromPreset,scaleFromFootprintFeet}=require('../src/components/architecturalLetterSizing.ts');
const fixture=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'input.json')));
const out=path.resolve(process.argv[3]||path.join(__dirname,'spatial-review'));
const save=(name,data)=>fs.writeFileSync(path.join(out,name),data);
const json=(name,obj)=>save(name,JSON.stringify(obj,null,2));
const rad=a=>a*Math.PI/180;
function serialize(s,color){
  const m=s.getMesh();
  return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts),color};
}
async function generate(h){
  const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
  const {Manifold:M,Mesh}=wasm;
  const snapshot=fixture.snapshot?.data??fixture.workflow??fixture;
  const selected=snapshot.arrangement?.originalPlacements??fixture.source;
  const preset=controlsFromPreset(h);
  const controlled=fixture.notes?.startsWith('Diagnostic direct workflow input');
  const scale=p=>controlled?scaleFromFootprintFeet(preset.preferredFeet):p.scale;
  const width=selected.reduce((v,p)=>v+.92*scale(p)*p.scaleX,0)/selected.length;
  const rise=fixture.levelRise??width*.28;
  if(!(rise>0&&width>0))throw Error('Invalid source size or rise');
  const thick=fixture.thickness??12;
  const heading=Math.atan2(selected.at(-1).y-selected[0].y,selected.at(-1).x-selected[0].x)*180/Math.PI;
  const box=M.cube([20,20,h]).translate([-10,-10,0]);
  const radius=width*.11,shaft=M.cylinder(h,radius,radius,64);
  const items=[],solids=[],parts=[],stairs=[],bays=[],pocketTools=[],solidsForStairs=[];
  const templates=selected.map(p=>{
    const geo=getLetterVolumeGeometry(p.letter,thick),v=geo.getAttribute('position');
    const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(v.array),triVerts:geo.index?new Uint32Array(geo.index.array):Uint32Array.from({length:v.count},(_,i)=>i)});
    mesh.merge();return new M(mesh).scale([p.scaleX,p.scaleY,p.scaleZ]).scale(scale(p));
  });
  for(let i=0;;i++){
    const id=i%selected.length,p=selected[id],z=width*.11+i*rise;
    const wallHeight=width*({L:.28,U:.56,V:.36}[p.letter]);
    if(z+Math.max(wallHeight,p.letter==="V"?scale(p)*p.scaleY*.47:0)>h)break;
    const phi=i*.61;

    // Search the same ordered path at alternative headings around the opening.
    let chosen;
    for(const delta of [0,15,30,45,90]){
      const yaw=heading+delta;
      for(let k=0;k<72;k++){
        const angle=phi+(k%24)*Math.PI/12;
        const stride=width*[.25,.39,.16][Math.floor(k/24)]; const center=i?[items[i-1].center[0]+stride*Math.cos(angle),items[i-1].center[1]+stride*Math.sin(angle),z]:[stride*Math.cos(angle),stride*Math.sin(angle),z];
        const solid=templates[id].rotate([p.letter==="V"?90:0,0,yaw]).translate(center);
        const b=solid.boundingBox();
        if(b.min[0]<-9.3||b.max[0]>9.3||b.min[1]<-9.3||b.max[1]>9.3||b.min[2]<0||b.max[2]>h)continue;
        if(solid.intersect(shaft).volume()>1e-8)continue;
        const ideal=[Math.cos(phi)*width*.25,Math.sin(phi)*width*.25];
        const cost=Math.hypot(center[0]-ideal[0],center[1]-ideal[1])+Math.abs(delta-[0,15,30,45,90][i%5])*.04;
        if(!chosen||cost<chosen.cost)chosen={center,solid,yaw,cost};
      }
    }
    if(!chosen)throw Error('No clear pose at '+h+' ft for instance '+i);
    const {center,solid,yaw}=chosen;
    const profile=templates[id].project();
    const bay=templates[id].boundingBox(),depth=bay.max[1]-bay.min[1],span=bay.max[0]-bay.min[0];
    const slab=width*.065;
    const world=s=>s.rotate([0,0,yaw]).translate(center);
    const lip=profile.offset(width*(i%2?.055:.08),'Round');
    // Fill the U court only at floor level. Retain the concavity above.
    const floor=(p.letter==='U'?lip.hull():lip).extrude(slab);
    const boundary=profile.subtract(profile.offset(-width*.065,'Round'));
    let mass=p.letter==='U'?profile.extrude(wallHeight):boundary.extrude(wallHeight);
    if(p.letter==='V'){
      // Terraced angular cheeks follow both converging strokes.
      mass=mass.warp(q=>{q[2]*=.42+.58*(q[1]-bay.min[1])/depth;});
    }
    let pocket;
    if(p.letter==='U'){
      const d=depth*.25,w=span*.23,clear=wallHeight*.73;
      const cutter=M.cube([w,d,clear]).translate([-w/2,bay.min[1],slab]);
      const before=mass.volume();mass=mass.subtract(cutter);
      pocket={depth:d,width:w,clearHeight:clear,roofThickness:wallHeight-clear-slab,removed:before-mass.volume(),referenceDepth:depth};
      bays.push({id:i,...pocket}); pocketTools.push(world(cutter));
    }
    const built=world(mass.add(floor)).subtract(shaft);
    parts.push(built);solids.push(solid);
    items.push({id:'instance-'+i,sourceIndex:id,source:p,letter:p.letter,footprintFeet:.92*scale(p),center,yaw,tilt:p.letter==="V"?90:0,bounds:solid.boundingBox(),level:z,wallHeight,pocket});
  }
  // Join successive floors at the closest overlap of their projected profiles.
  for(let i=1;i<items.length;i++){
    const a=items[i-1],b=items[i];
    const v=[a,b].find(t=>t.letter==='V')??items.filter(t=>t.letter==='V').sort((l,r)=>Math.abs(l.level-b.level)-Math.abs(r.level-b.level))[0];
    const yaw=(v?.yaw??b.yaw)+(i%2?1:-1)*Math.atan2(.305,.9)*180/Math.PI+90;
    const count=Math.ceil(rise/(width*.065)),run=width*.38,w=width*.16;
    let stair;
    for(const sign of [1,-1]){
      const heading=yaw+(sign<0?180:0);
      for(const poly of parts[i-1].project().intersect(parts[i].project()).toPolygons()){
        for(const q of poly){
          const start=q.map((t,k)=>t*.88+a.center[k]*.12);
          const local=M.union(Array.from({length:count},(_,j)=>M.cube([run/count+.025,w,rise/count+.04]).translate([j*run/count,-w/2,j*rise/count])));
          const s=local.rotate([0,0,heading]).translate([start[0],start[1],a.level+width*.06]);
          if(s.intersect(shaft).volume()>1e-8||s.subtract(box).volume()>1e-8)continue;
          const contact=[parts[i-1],parts[i]].map(p=>p.intersect(s).volume());
          if(contact.every(c=>c>1e-6)){stair={solid:s,contact,heading};break;}
        }
        if(stair)break;
      }
      if(stair)break;
    }
    stairs.push({from:a.id,to:b.id,vSource:v?.id,count,riser:rise/count,tread:run/count,width:w,connected:!!stair,contact:stair?.contact,heading:stair?.heading});
    if(stair)solidsForStairs.push(stair.solid);
  }
  const A=M.union(solids),raw=M.union([...parts,...solidsForStairs]),C=raw.intersect(box);
  bays.forEach((bay,i)=>{const probe=pocketTools[i].intersect(box);bay.afterClipProbeVolume=probe.volume();bay.afterUnionObstructedVolume=C.intersect(probe).volume();});
  const arch=serialize(C,[241,192,119]),letters=serialize(A,[82,172,219]);
  const frame={min:[-10,-10,0],max:[10,10,60]};
  for(const [mode,meshes] of Object.entries({A:[letters],B:[letters,arch],C:[arch]}))for(const view of ['iso','plan','elevation','section']){
    save(h+'-'+mode+'-'+view+'.png',(await render(meshes,view,frame,view==='section')).png);
  }
  json(h+'-architecture.json',arch);
  const bounds=C.boundingBox();
  return {field:[20,20,h],items,levels:items.map(t=>t.level),counts:Object.fromEntries(['L','U','V'].map(l=>[l,items.filter(t=>t.letter===l).length])),terraces:parts.length,bays,stairs,ruleA:A.boundingBox(),ruleB:bounds,height:bounds.max[2]-bounds.min[2],volume:C.volume(),components:C.decompose().length,status:C.status(),shaftRadius:radius,shaftHeight:h,shaftOverlap:[A,C].map(s=>s.intersect(shaft).volume()),trimmed:raw.subtract(box).volume(),outside:C.subtract(box).volume(),scaleAfterGeneration:1};
}

(async()=>{
 fs.mkdirSync(out,{recursive:true});const rows=[];
 for(const h of [20,40,60]){const row=await generate(h);rows.push(row);json('measurements.json',rows);console.log(h,row.counts,row.height,row.components,row.bays.length,row.stairs.filter(s=>s.connected).length);}
 const pic=(h,m,v)=>'<figure><img src="'+h+'-'+m+'-'+v+'.png"><figcaption>'+h+' ft · '+v+'</figcaption></figure>';
 save('index.html','<!doctype html><meta charset=utf-8><title>Stepped Amphitheater</title><style>body{background:#101820;color:white;font:16px system-ui;margin:3%}section{display:flex}figure{margin:2px;flex:1}img{width:100%}</style><h1>Stepped Amphitheater</h1><section>'+rows.map(r=>pic(r.field[2],'C','iso')).join('')+'</section>'+rows.map(r=>'<h2>20 × 20 × '+r.field[2]+' ft · '+r.items.length+' letters</h2>'+['A','B','C'].map((m,i)=>'<h3>'+['A · Original letters','B · Letters and architecture','C · Architecture only'][i]+'</h3><section>'+['iso','plan','elevation','section'].map(v=>pic(r.field[2],m,v)).join('')+'</section>').join('')).join(''));
})().catch(e=>{console.error(e);process.exitCode=1});



