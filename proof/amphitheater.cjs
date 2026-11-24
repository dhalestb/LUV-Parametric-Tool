const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const THREE = require('three');
const render = require('./render.cjs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename,'utf8'), {compilerOptions:{module:1,target:7,esModuleInterop:true}}
).outputText,filename);
const {getLetterVolumeGeometry} = require('../src/components/letterGeometry3d.ts');

function meshOf(solid,color) {
  const mesh=solid.getMesh();
  return {positions:Array.from(mesh.vertProperties),indices:Array.from(mesh.triVerts),color};
}
function save(name,data) {
  fs.writeFileSync(path.join(out,name),data);
}
const out=path.resolve(process.argv[3] || path.join(__dirname,'results'));
const input=JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname,'input.json')));
fs.mkdirSync(out,{recursive:true});

async function main() {
  const wasm=await require('manifold-3d/manifold.js').default();
  wasm.setup();
  const {Manifold:M,Mesh}=wasm;
  const snapshot=input.snapshot?.data ?? input.workflow ?? input;
  const source=snapshot.arrangement?.originalPlacements ?? input.source;
  if(!Array.isArray(source)||source.length<2) throw Error('Supply a Composition workflow with original placements or a source fixture.');
  const widths=source.map(p=>p.scale*p.scaleX*.92);
  const width=widths.reduce((a,b)=>a+b,0)/widths.length;
  const direction=Math.atan2(source.at(-1).y-source[0].y,source.at(-1).x-source[0].x);
  const heading=direction*180/Math.PI;
  const plates=[],letters=[],links=[],anchors=[],records=[];
  const depth=width*.08;
  const rise=input.levelRise || width*.23;
  const tangent=[Math.cos(direction),Math.sin(direction)];
  const side=[-tangent[1],tangent[0]];
  let cylinder=M.cylinder(rise*source.length+4*width,width*.12,width*.12,48)
    .translate([0,0,-2*width]);
  for (const [i,p] of source.entries()) {
    const distance=(i-(source.length-1)/2)*width*.22;
    const setback=(i%2?1:-1)*width*.125;
    const x=distance*tangent[0]+setback*side[0], y=distance*tangent[1]+setback*side[1];
    const yaw=heading+[0,15,30,45,90][i%5];
    const tilt=p.letter==='V'?90:0;
    const g=getLetterVolumeGeometry(p.letter,input.thickness || 12);
    const pos=g.getAttribute('position');
    const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(pos.array),triVerts:g.index?new Uint32Array(g.index.array):Uint32Array.from({length:pos.count},(_,k)=>k)});
    mesh.merge();
    const solid=new M(mesh).scale([p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ])
      .rotate([tilt,0,yaw]).translate([x,y,i*rise]);
    letters.push(solid);
    records.push({sourceIndex:i,source:p,role:{L:'terrace boundary',U:'enclosure',V:'transition'}[p.letter],yaw,tilt,origin:[x,y,i*rise]});
  }
  const original=M.union(letters);
  let bestDistance=Infinity,clearShaft;
  for(let ix=-8;ix<=8;ix++)for(let iy=-8;iy<=8;iy++){
    const dx=ix*width/12,dy=iy*width/12,dist=Math.hypot(dx,dy);
    if(dist>=bestDistance)continue;
    const candidate=cylinder.translate([dx,dy,0]);
    const overlap=original.intersect(candidate);
    if(overlap.volume()<1e-9){clearShaft=candidate;bestDistance=dist;}
    overlap.delete();
  }
  if(!clearShaft)throw Error('No unobstructed central opening found');
  cylinder=clearShaft;
  for(const [i,solid] of letters.entries()){
    const profile=solid.project().offset(width*(i%2?.09:.045),'Round');
    const level=i*rise, blank=profile.extrude(depth).translate([0,0,level-depth]);
    const bounds=blank.boundingBox(), bay=bounds.max[1]-bounds.min[1];
    const notchWidth=(bounds.max[0]-bounds.min[0])*.3;
    const cutter=M.cube([notchWidth,bay*.25,depth*3])
      .translate([(bounds.min[0]+bounds.max[0]-notchWidth)/2,bounds.min[1],level-2*depth]);
    const recessed=i%2?blank.subtract(cutter):blank;
    const plate=recessed.subtract(cylinder);
    plates.push(plate);
    const meshData=meshOf(plate);
    let best=0, anchor;
    for(let j=0;j<meshData.indices.length;j+=3){
      const tri=meshData.indices.slice(j,j+3).map(id=>meshData.positions.slice(id*3,id*3+3));
      if(!tri.every(q=>Math.abs(q[2]-level)<1e-4)) continue;
      const [a,b,c]=tri;
      const area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
      if(area>best){best=area;anchor=[0,1,2].map(k=>(a[k]+b[k]+c[k])/3);}
    }
    if(!anchor)throw Error('Missing horizontal terrace '+i);
    anchors.push(anchor);
    Object.assign(records[i],{localBayDepth:bay,notchRemoved:blank.volume()-recessed.volume(),horizontalTopTriangleArea:best/2});
  }
  for(let i=1;i<anchors.length;i++){
    const a=anchors[i-1],b=anchors[i],dx=b[0]-a[0],dy=b[1]-a[1],run=Math.hypot(dx,dy);
    if(run<1e-6)throw Error('Coincident ramp endpoints');
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    const ramp=M.cube([run+depth,width*.13,depth],true).refine(8).warp(q=>{
      const t=Math.max(0,Math.min(1,q[0]/run+.5));
      q[2]+=t*t*(3-2*t)*(b[2]-a[2])+a[2]-depth*.5;
    }).rotate([0,0,angle]).translate([(a[0]+b[0])/2,(a[1]+b[1])/2,0]).subtract(cylinder);
    links.push(ramp);
    records[i].incomingRamp={meanSlope:(b[2]-a[2])/run,contacts:[plates[i-1],plates[i]].map(s=>s.intersect(ramp).volume())};
  }
  const architecture=M.union([...plates,...links]);
  const both=architecture.add(original);
  const bb=both.boundingBox(),span=bb.max.map((v,k)=>v-bb.min[k]),center=bb.max.map((v,k)=>(v+bb.min[k])/2);
  const results=[],html=[];
  for(const h of [20,40,60]){
    const dims=[20,20,h],factor=Math.min(...dims.map((v,k)=>v/span[k]));
    const box=M.cube(dims,true);
    const fit=s=>s.translate(center.map(v=>-v)).scale(factor).intersect(box);
    const A=fit(original),C=fit(architecture);
    const frame={min:dims.map(v=>-v/2),max:dims.map(v=>v/2)};
    const originalMesh=meshOf(A,[74,155,221]),archMesh=meshOf(C,[255,194,98]);
    const row={height:h,factor,status:C.status(),components:C.decompose().length,bounds:C.boundingBox(),outside:C.subtract(box).volume(),openingArchitectureOverlap:C.intersect(fit(cylinder)).volume(),openingLetterOverlap:A.intersect(fit(cylinder)).volume(),architectureOutsideLetters:C.subtract(A).volume(),sourceCount:source.length};
    results.push(row);
    save(h+'-architecture.json',JSON.stringify(archMesh));
    html.push('<h2>20 × 20 × '+h+' ft</h2>');
    for(const [title,meshes] of [['A · Rule A letters',[originalMesh]],['B · Letters and architecture',[originalMesh,archMesh]],['C · Architecture only',[archMesh]]]){
      html.push('<h3>'+title+'</h3><div>');
      for(const view of ['iso','plan','elevation','section']){
        const img=await render(meshes,view,frame,view==='section');
        const filename=h+'-'+title[0]+'-'+view+'.png';
        save(filename,img.png);
        html.push('<figure><img src="'+filename+'"><figcaption>'+view+'</figcaption></figure>');
      }
      html.push('</div>');
    }
  }
  save('measurements.json',JSON.stringify({records,results},null,2));
  save('index.html','<!doctype html><meta charset=utf-8><title>Stepped Amphitheater</title><style>body{background:#101820;color:white;font:16px system-ui;padding:2%}div{display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:3px}img{width:100%}</style><h1>Stepped Amphitheater</h1><p>Blue · arranged letters &nbsp; Gold · projected terraces and connecting ramps</p>'+html.join(''));
  console.log(results);
}
main().catch(e=>{console.error(e);process.exitCode=1});



