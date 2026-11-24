const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {derive}=require('./source-envelope.cjs');
const {relationships}=require('./linear-gallery-current-edges.cjs');

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
function obj(m){const lines=[];for(let i=0;i<m.positions.length;i+=3)lines.push('v '+m.positions.slice(i,i+3).join(' '));for(let i=0;i<m.indices.length;i+=3)lines.push('f '+m.indices.slice(i,i+3).map(n=>n+1).join(' '));return lines.join('\n');}
async function buildGallery(request,out){
 const world=derive(request),angle=request.sourceSnapshot?.terraceRotation??0;
 const grid=angle?128:8192,snap=x=>Math.round(x*grid)/grid;
 const upper=p=>p.galleryZone==='upper';
 const rotate=(x,y,degrees)=>{const a=degrees*Math.PI/180;return [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];};
 const local=angle?{...request,source:request.source.map(p=>{if(!upper(p))return p;const [x,y]=rotate(p.x,p.y,-angle);return {...p,x,y,rz:p.rz-angle};})}:request;
 const {letters}=angle?derive(local):world,{nodes}=world,{stations,layers}=relationships(local,letters);
 const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
 const {Manifold:M,CrossSection:CS}=wasm,thick=.53125,mid=request.field.height/2;
 const parts=[],surfaces=[],components=[];
 function add(kind,plan,bottom,top,p,q){
  bottom=snap(bottom);top=snap(top);if(top<=bottom)return;
  const solid=plan.extrude(top-bottom).translate([0,0,bottom]);
  assert(!solid.isEmpty()&&solid.status()==='NoError',kind+' empty or invalid');
  const id=kind+'-'+(parts.length+1),sources=[p.sourceId,q.sourceId];
  surfaces.push({id,kind,sources,bottom,top,zone:p.zone});components.push({id,sources,mesh:pack(solid)});parts.push(solid);
 }
 const rows=layers.map(l=>[0,1,2,3].map(side=>stations.filter(s=>s.level===l.level&&s.side===side).map(s=>({...s,a:snap(dot(s.edge[0],s.tangent)),b:snap(dot(s.edge[1],s.tangent)),d:snap(s.actualBoundary)})).sort((a,b)=>a.a-b.a)));
 const point=(p,a,d)=>p.tangent.map((v,i)=>snap(a*v+d*p.normal[i]));
 const panel=(p,a,b,inner,outer)=>new CS([[point(p,a,inner),point(p,b,inner),point(p,b,outer),point(p,a,outer)]],'NonZero');
 for(const zone of ['lower','upper']){
  const band=layers.filter(l=>l.zone===zone),first=band[0],last=band.at(-1),base=zone==='lower'?0:mid;
  const penultimate=band.at(-2)??first;
  const roof=zone==='lower'?mid:snap(Math.max(request.sourceSnapshot.automaticTerraces?mid+7+thick:0,...stations.filter(s=>s.level===penultimate.level).map(s=>s.top)));
  const outline=[],floorOutline=[];
  for(let side=0;side<4;side++){
   const all=band.flatMap(l=>rows[l.level][side]),cuts=[...new Set(all.flatMap(p=>[p.a,p.b]))].sort((a,b)=>a-b);
   for(let j=1;j<cuts.length;j++){
    const a=cuts[j-1],b=cuts[j];
    const active=all.filter(p=>p.a<b&&p.b>a).sort((p,q)=>p.level-q.level);
    if(!active.length)continue;
    const bottom=active[0],terminal=active.at(-1);
    floorOutline.push(point(bottom,a,bottom.d),point(bottom,b,bottom.d));
    add('base-wall',panel(bottom,a,b,bottom.d-thick,bottom.d),base,bottom.top,bottom,bottom);
    for(let i=0;i<active.length-1;i++){
     const p=active[i],q=active[i+1];
     add('wall',panel(p,a,b,p.d-thick,p.d),p.top,zone==='upper'?Math.min(roof,q.top):q.top,p,q);
     if(p.d!==q.d&&q.top<=roof)add('connection',panel(p,a,b,Math.min(p.d,q.d)-thick,Math.max(p.d,q.d)),q.top-thick,q.top,p,q);
    }
    if(zone==='lower')add('roof-wall',panel(terminal,a,b,terminal.d-thick,terminal.d),terminal.top,roof,terminal,terminal);
    const cap=active.filter(p=>p.level>=(zone==='lower'?last.level:penultimate.level));
    const face=Math.max(...(cap.length?cap:[terminal]).map(p=>p.d));
    outline.push(point(terminal,a,face),point(terminal,b,face));
   }
   if(zone==='upper')for(const p of rows[last.level][side]){
    // Measure the full supporting arm in the source cross-section at midspan.
    const m=letters[p.sourceIndex].mesh,mesh=new wasm.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)});mesh.merge();
    const plan=new M(mesh).slice((p.bottom+p.top)/2),center=(p.a+p.b)/2;
    const probe=plan.intersect(panel(p,center-.005,center+.005,p.d-12,p.d+.01));
    const loops=probe.toPolygons().sort((x,y)=>Math.max(...y.map(v=>dot(v,p.normal)))-Math.max(...x.map(v=>dot(v,p.normal))));
    assert(loops.length);const depth=Math.max(thick,p.d-Math.min(...loops[0].map(v=>dot(v,p.normal))));
    add('edge-column',panel(p,p.a,p.b,p.d-snap(depth),p.d),roof,p.top,p,p);
   }
   // A stepped joint has a return at the foot; above it alternate a daylight
   // opening and a return bearing on the preceding receiver plank.
   for(const [rank,l] of band.entries()){
    const row=rows[l.level][side];
    for(let j=1;j<row.length;j++){
     const left=row[j-1],right=row[j],p=left.d>right.d?left:right,q=p===left?right:left;
     if(Math.abs(left.b-right.a)>.01||p.d-q.d<.01)continue;
     const end=p===left?p.b:p.a,a=p===left?end-thick:end;
     const crest=Math.max(p.top,q.top);
     let lo=base,hi=crest;
     if(rank>0){
      const below=rows[band[rank-1].level][side].filter(s=>s.a<=end&&s.b>=end);
      if(!below.length)continue;
      const prior=Math.max(...below.map(s=>s.top));
      if(prior>=crest)continue;
      // The adjacent lower receiver top sets the sill. When the two
      // receiver tops coincide, leave the upper half of the interval open.
      const sill=Math.min(p.top,q.top);
      if(sill>prior+.5&&crest>sill+.25){lo=sill;hi=crest;}else{lo=prior;hi=(prior+crest)/2;}
     }
     const web=panel(p,a,a+thick,q.d-thick,p.d);
     add('daylight-return',web,lo,hi,p,q);
     if(rank===0&&band.length>1){
      // Carry this joint at its original plan station across the open lift.
      // Only a horizontal plank actually crossing its footprint can restart it.
      const sills=surfaces.filter(s=>s.kind==='connection'&&s.zone===zone&&s.top>hi+thick&&s.top<roof-thick);
      const candidates=sills.map(s=>({s,body:parts[surfaces.indexOf(s)]})).filter(({s,body})=>body.slice(s.top-thick/2).intersect(web).area()>0.01).sort((a,b)=>a.s.top-b.s.top);
      if(candidates.length){
       const sill=candidates[0].s.top;
       const receiver=band.slice(1).flatMap(l=>rows[l.level][side]).filter(r=>r.a<=end+thick&&r.b>=end-thick&&r.top>sill+thick).sort((a,b)=>a.top-b.top)[0];
       const head=receiver?Math.min(roof,receiver.top):roof;
       if(head>sill)add('plank-return',web,sill,head,p,receiver??q);
      }
     }
    }
   }
  }
  const foot=rows[first.level][0];
  add('contour-floor',new CS([floorOutline],'NonZero').simplify(.00001),angle&&zone==='upper'?base-thick:base,angle&&zone==='upper'?base:base+thick,foot[0],foot.at(-1));
  const row=rows[last.level][0];add('roof-plank',new CS([outline],'NonZero').simplify(.00001),roof-thick,roof,row[0],row.at(-1));
 }
 let assembly;
 if(angle){
  // Cut the two opposing long facades in the local frame, then turn the whole upper assembly.
  const doorWidth=3.5,clearHeight=7,reach=17;
  let passages=[-1,1].map(sign=>{const opening=M.cube([reach-7,doorWidth,clearHeight]).translate([sign>0?7:-reach,-doorWidth/2,mid]);return request.sourceSnapshot.terraceEndDoors?opening.rotate([0,0,90]):opening;});
  // Express the rotation on a binary grid so shared straight edges remain
  // collinear when the slicer and viewer read float32 vertices.
  const radians=angle*Math.PI/180,c=Math.round(Math.cos(radians)*4096)/4096,s=Math.round(Math.sin(radians)*4096)/4096;
  const matrix=[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];
  if(request.sourceSnapshot.automaticTerraces){
   const floorIndex=surfaces.findIndex(r=>r.kind==='contour-floor'&&r.zone==='upper');
   const roofIndex=surfaces.findIndex(r=>r.kind==='roof-plank'&&r.zone==='lower');
   const floor=parts[floorIndex].slice(mid-.05),roof=parts[roofIndex].slice(mid-.05);
   const bounds=floor.bounds();
   let best=-Infinity;
   for(const axis of [0,1]){
    const across=1-axis,pair=[];let score=0;
    for(const sign of [-1,1]){
     let pick,quality=-Infinity;
     for(let t=Math.ceil(bounds.min[across]+3);t<bounds.max[across]-2;t++){
      const edge=sign<0?bounds.min[axis]:bounds.max[axis];
      const pos=[0,0,mid],size=[doorWidth,doorWidth,clearHeight];
      pos[across]=t-doorWidth/2;pos[axis]=sign<0?edge-2:edge-4;size[axis]=6;
      const cut=M.cube(size).translate(pos),route=cut.transform(matrix).slice(mid+1);
      if(route.subtract(roof).area()>.0001)continue;
      const outside=cut.slice(mid+1).subtract(floor).area();
      if(outside<doorWidth*1.99||outside>doorWidth*4.1)continue;
      const merit=outside-.05*Math.abs(t);
      if(merit>quality){pick=cut;quality=merit;}
     }
     if(pick){pair.push(pick);score+=quality;}
    }
    if(pair.length===2&&score>best){passages=pair;best=score;}
   }
   assert(Number.isFinite(best),'No supported pair of terrace thresholds');
  }
  const lower=[],rotated=[];
  for(let i=parts.length-1;i>=0;i--){
   if(surfaces[i].zone==='lower'){lower.push(parts[i]);continue;}
   let part=parts[i];for(const cut of passages)part=part.subtract(cut);
   if(part.isEmpty()||part.volume()<1e-8){parts.splice(i,1);surfaces.splice(i,1);components.splice(i,1);continue;}
   rotated.push(part);parts[i]=part.transform(matrix);components[i].mesh=pack(parts[i]);
  }
  const upperBody=M.union(rotated).asOriginal().simplify(.00001).transform(matrix),lowerBody=M.union(lower);
  assembly=lowerBody.add(upperBody);
  for(const cut of passages){
   const route=cut.transform(matrix);
   assert(assembly.intersect(route).volume()<1e-6,'Terrace passage obstructed');
   const support=route.slice(mid+1).subtract(assembly.slice(mid-.05));
   assert(support.area()<.0001,'Discontinuous terrace threshold');
  }
 }else assembly=M.union(parts);
 const joined=assembly.asOriginal().simplify(.00001),architecture=pack(joined),shells=joined.decompose();
 assert.equal(joined.status(),'NoError');assert.equal(shells.length,1,'Print shell volumes and bounds '+JSON.stringify(shells.map(s=>[s.volume(),s.boundingBox()])));
 const field=M.cube([request.field.width,request.field.depth,request.field.height]).translate([-request.field.width/2,-request.field.depth/2,0]);
 assert(joined.subtract(field).volume()<1e-7);
 fs.mkdirSync(out,{recursive:true});const write=(name,data)=>fs.writeFileSync(path.join(out,name),typeof data==='string'?data:JSON.stringify(data));
 write('combined-envelope.obj',obj(architecture));write('combined-envelope.json',architecture);write('request.json',request);
 components.forEach(c=>write(c.id+'.obj',obj(c.mesh)));
 write('manifest.json',{generator:request.generator,validation:{status:joined.status(),shellVolumes:shells.map(s=>s.volume()),outside:0,sourceOutside:0},instances:nodes.map(n=>({pose:n.p,matrix:n.matrix})),components:components.map((c,i)=>({file:c.id+'.obj',sources:c.sources,finalVolume:parts[i].volume()})),tools:[]});
 return {letters:world.letters,architecture,components,sourceCount:letters.length,volume:joined.volume(),bounds:joined.boundingBox(),architecturalValidation:{passed:true,failures:[]},galleryReport:{stations:angle?relationships(request,world.letters).stations:stations,surfaces,transition:mid,wallThickness:thick,deckThickness:thick,solidComponents:1,limitations:[],circulation:[]}};
}
module.exports={buildGallery};
