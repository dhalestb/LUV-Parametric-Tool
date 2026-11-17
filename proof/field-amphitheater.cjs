const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const THREE = require('three');
const render = require('./render.cjs');
const {requestConfig}=require('./field-config.cjs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename,'utf8'), {compilerOptions:{module:1,target:7,esModuleInterop:true}}
).outputText,filename);
const {getLetterVolumeGeometry,getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {controlsFromPreset,scaleFromFootprintFeet}=require('../src/components/architecturalLetterSizing.ts');
const fixture=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'input.json')));
const out=path.resolve(process.argv[3]||path.join(__dirname,'field-review'));
const save=(name,data)=>fs.writeFileSync(path.join(out,name),data);
const json=(name,data)=>save(name,JSON.stringify(data,null,2));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,t)=>a.map(v=>v*t);
const mix=(a,b,t)=>add(a,mul(sub(b,a),t));
const distance=(a,b)=>Math.hypot(...sub(a,b));
const colors={terrace:[216,177,106],enclosure:[125,194,169],transition:[197,151,210],recess:[236,105,111],source:[65,143,202]};
function meshOf(solid,color){
  const m=solid.getMesh();
  const positions=[];
  for(let i=0;i<m.vertProperties.length;i+=m.numProp)positions.push(...m.vertProperties.slice(i,i+3));
  return {positions,indices:Array.from(m.triVerts),color};
}
async function generate(config){
  const {width:fieldWidth,depth:fieldDepth,height:h,majorLevelSpacing}=requestConfig(config);
  const label=[fieldWidth,fieldDepth,h].join('x');
  const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
  const {Manifold:M,Mesh}=wasm;
  const owned=[];
  const own=s=>{owned.push(s);return s;};
  const hull=points=>own(M.hull(points));
  const union=pieces=>own(M.union(pieces));
  const snapshot=fixture.snapshot?.data??fixture.workflow??fixture;
  const selected=snapshot.arrangement?.originalPlacements??fixture.source;
  if(!selected?.length)throw Error('Missing selected source');
  const preset=controlsFromPreset(h);
  const controlled=fixture.notes?.startsWith('Diagnostic direct workflow input');
  const scales=selected.map(p=>controlled?scaleFromFootprintFeet(preset.preferredFeet):p.scale);
  const width=selected.reduce((v,p,i)=>v+.92*scales[i]*p.scaleX,0)/selected.length;
  const rise=fixture.levelRise??width*.28;
  const heading=Math.atan2(selected.at(-1).y-selected[0].y,selected.at(-1).x-selected[0].x)*180/Math.PI;
  // Preserve the existing feasible height-dependent population calculation.
  let count=0;
  for(;;count++){
    const p=selected[count%selected.length],z=width*.11+count*rise;
    const extent=Math.max(width*({L:.28,U:.56,V:.36}[p.letter]),p.letter==='V'?scales[count%selected.length]*p.scaleY*.47:0);
    if(z+extent>h)break;
  }
  const box=own(M.cube([fieldWidth,fieldDepth,h]).translate([-fieldWidth/2,-fieldDepth/2,0]));
  const baselineCount=count;
  const baselineRegions=Math.ceil(count/3);
  const lanes=Math.max(1,Math.floor(fieldWidth/(width*1.25)));
  const extraPlanRegions=Math.max(0,Math.floor((fieldDepth-20)/(width*.9)));
  const tiers=baselineRegions+extraPlanRegions;
  const groups=[];
  count=lanes===1&&tiers===baselineRegions?baselineCount:lanes*tiers*3;
  for(let i=0;i<count;i++){
    const p=selected[i%selected.length];
    if(!groups.length||groups.at(-1).some(id=>selected[id%selected.length].letter===p.letter))groups.push([]);
    groups.at(-1).push(i);
  }
  const items=[],sourceSolids=[],features=[],components=[],cuts=[],circulation=[];
  const base=width*.12;
  const minorRise=tiers>1?Math.min(rise*2.3,(h-base-width*.98)/(tiers-1)):0;
  const majorLevels=Array.from({length:Math.floor((h-base)/majorLevelSpacing)+1},(_,i)=>base+i*majorLevelSpacing);
  const levels=Array.from({length:tiers},(_,i)=>base+i*minorRise);
  const regionRise=minorRise;  const sourceTemplates=selected.map((p,i)=>{
    const geo=getLetterVolumeGeometry(p.letter,fixture.thickness??12),pos=geo.getAttribute('position');
    const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(pos.array),triVerts:geo.index?new Uint32Array(geo.index.array):Uint32Array.from({length:pos.count},(_,k)=>k)});
    mesh.merge();
    return own(new M(mesh).scale([scales[i]*p.scaleX,scales[i]*p.scaleY,scales[i]*p.scaleZ]));
  });
  const world=(item,p)=>{
    const point=new THREE.Vector3(...p);
    point.applyAxisAngle(new THREE.Vector3(1,0,0),item.tilt*Math.PI/180);
    point.applyAxisAngle(new THREE.Vector3(0,0,1),item.yaw*Math.PI/180);
    return add(point.toArray(),item.center);
  };
  const featurePoint=(item,x,y)=>{
    const p=selected[item.sourceIndex],scale=scales[item.sourceIndex];
    const outline=getLetterShape(p.letter).getPoints(24);
    const minX=Math.min(...outline.map(q=>q.x)),maxX=Math.max(...outline.map(q=>q.x));
    const minY=Math.min(...outline.map(q=>q.y)),maxY=Math.max(...outline.map(q=>q.y));
    return [(x-(minX+maxX)/2)*scale*p.scaleX,(y-(minY+maxY)/2)*scale*p.scaleY,0];
  };
  function record(kind,solid,sources,method,extra={}){
    if(solid.isEmpty()||solid.status()!=='NoError')throw Error('Invalid '+kind);
    const entry={id:'component-'+components.length,kind,sources,method,...extra};
    components.push({...entry,solid});return entry;
  }
  const plate=(points,thickness)=>hull(points.flatMap(p=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[add(p,[x*width*.008,y*width*.008,0]),add(p,[x*width*.008,y*width*.008,-thickness])]))));
  // A finite, low gathering focus is derived from the first L's inner corner.
  let protectedSpace;
  for(const [g,ids] of groups.entries()){
    const tier=Math.floor(g/lanes),lane=g%lanes;
    const level=levels[tier];
    if(level+width*.6>h)throw Error('Grouped configuration exceeds height; level rise requires review');
    for(const [slot,id] of ids.entries()){
      const si=id%selected.length,p=selected[si],phi=heading*Math.PI/180;
      const laneSpan=Math.max(0,fieldWidth-width*1.7);
      const focusDepthForPlacement=Math.min(fieldDepth*.22,width*.7);
      const firstCenter=-fieldDepth/2+focusDepthForPlacement+width*.60;
      const lastCenter=fieldDepth/2-width*.65;
      const laneCenter=lanes>1?(lane/(lanes-1)-.5)*laneSpan:0;
      const tierCenter=tiers>1?firstCenter+(lastCenter-firstCenter)*tier/(tiers-1):firstCenter;
      const local=[width*((tier%2?1:-1)*.09+(slot===1?.18:slot===2?-.13:0)),
        width*(slot===2?.18:slot===1?-.06:0)];
      const center=[laneCenter+.7*(local[0]*Math.cos(phi)-local[1]*Math.sin(phi)),
        tierCenter+.7*(local[0]*Math.sin(phi)+local[1]*Math.cos(phi)),
        level+(p.letter==="V"?width*.45:0)];      const override=fixture.orientationOverride;
      const active=override?.enabled===true&&(!override.heights||override.heights.includes(h))&&(!override.instances||override.instances.includes('instance-'+id));
      const allowed=active?override.yaw:[0,15,30,45,90];
      if(!Array.isArray(allowed)||!allowed.length)throw Error('Empty activated yaw set');
      let chosen;
      const target=[0,15,30,45,90][id%5],rejected=[];
      for(const relativeYaw of allowed){
        const yaw=heading+relativeYaw,tilt=p.letter==='V'?90:0;
        const solid=own(sourceTemplates[si].rotate([tilt,0,yaw]).translate(center)),b=solid.boundingBox();
        if(b.min[0]<-fieldWidth/2||b.max[0]>fieldWidth/2||b.min[1]<-fieldDepth/2||b.max[1]>fieldDepth/2||b.min[2]<0||b.max[2]>h){rejected.push({relativeYaw,reason:'source containment'});continue;}
        const cost=Math.abs(relativeYaw-target);
        if(!chosen||cost<chosen.cost)chosen={relativeYaw,yaw,tilt,solid,cost};
      }
      if(!chosen)throw Error('No contained orientation for '+id+' at '+h);
      const item={id:'instance-'+id,sourceIndex:si,source:p,letter:p.letter,group:g,tier,lane,level,center,principalHeading:heading,allowedYaw:allowed,relativeYaw:chosen.relativeYaw,yaw:chosen.yaw,tilt:chosen.tilt,pivot:center,overrideActive:active,rejected,bounds:chosen.solid.boundingBox(),footprintFeet:.92*scales[si]};
      items.push(item);sourceSolids.push(chosen.solid);
      const outline=getLetterShape(p.letter).getPoints(24);
      const nearest=(x,y)=>outline.reduce((a,b)=>Math.hypot(a.x-x,a.y-y)<Math.hypot(b.x-x,b.y-y)?a:b);
      const wp=(x,y)=>{const q=nearest(x,y);return world(item,featurePoint(item,q.x,q.y));};
      if(p.letter==='L'){
        const corner=wp(-.12,-.18),a=wp(.42,-.18),b=wp(-.12,.45);
        const edges=[[corner,a],[corner,b]];
        features.push({instance:item.id,type:'orthogonal inner edges',points:[a,corner,b]});
        for(const edge of edges){
          const inward=mul(sub(item.center,edge[0]),.28);
          const polygon=[edge[0],edge[1],add(edge[1],inward),add(edge[0],inward)];
          record('terrace',plate(polygon,width*.075),[item.id],'extend actual L inner edge toward its local interior');
          const top=edge.map(q=>add(q,[0,0,width*.22]));
          record('enclosure',hull([...edge,...top].flatMap(q=>[q,add(q,mul(inward,.12))])),[item.id],'L edge raised into orthogonal boundary');
        }
        item.terraceEdge=[corner,a];item.otherEdge=[corner,b];
        if(!protectedSpace){
          const focus=add(corner,mul(add(sub(a,corner),sub(b,corner)),.24));
          const depth=width*.22;
          protectedSpace=own(M.cube([depth,depth,width*.45],true).translate([focus[0],focus[1],base+width*.225+width*.10]));
          features.push({instance:item.id,type:'finite central gathering space',points:[focus],height:width*.45,depth});
        }
      }else if(p.letter==='U'){
        const start=outline.findIndex(q=>Math.hypot(q.x-.14,q.y-.45)<1e-5);
        const end=outline.findIndex((q,k)=>k>start&&Math.hypot(q.x+.14,q.y-.45)<1e-5);
        if(start<0||end<0)throw Error('Inner U curve extraction failed');
        const curve=outline.slice(start,end+1).map(q=>world(item,featurePoint(item,q.x,q.y)));
        features.push({instance:item.id,type:'sampled actual U inner curve',points:curve});
        const strips=[],wallHeight=width*.48,band=width*.08;
        for(let j=1;j<curve.length;j++){
          const originalA=curve[j-1],originalB=curve[j],d=sub(originalB,originalA),length=Math.hypot(d[0],d[1]);
          const extension=mul(d,.08),a=sub(originalA,extension),b=add(originalB,extension);
          if(length<1e-7)continue;
          const n=[-d[1]/length*band,d[0]/length*band,0];
          const wall=hull([a,b,add(a,n),add(b,n)].flatMap(q=>[q,add(q,[0,0,wallHeight])]));
          strips.push(wall);
        }
        const enclosure=union(strips);
        record('enclosure',enclosure,[item.id],'offset adjacent inner-curve tangents and extend vertically', {curveSamples:curve.length});
        item.curve=curve;item.wallHeight=wallHeight;
        // Cut a sheltered pocket into a local curve bay, retaining its roof.
        const j=Math.floor(curve.length/2),a=curve[j-1],b=curve[j+1],d=sub(b,a);
        const tangent=mul(d,1/distance(a,b)),normal=[-tangent[1],tangent[0],0];
        const bayDepth=distance(curve[0],curve[Math.floor(curve.length/2)]),cutDepth=bayDepth*.25,cutWidth=width*.22;
        const mid=mix(a,b,.5),basePoint=add(mid,mul(normal,cutDepth*.5));
        const corners=[-1,1].flatMap(s=>[-1,1].map(t=>add(basePoint,add(mul(tangent,s*cutWidth*.5),mul(normal,t*cutDepth*.5)))));
        const tool=hull(corners.flatMap(q=>[add(q,[0,0,width*.08]),add(q,[0,0,wallHeight*.72])]));
        cuts.push({solid:tool,source:item.id,depth:cutDepth,referenceDepth:bayDepth,width:cutWidth,clearHeight:wallHeight*.72-width*.08});
      }else{
        const apex=wp(0,-.16),left=wp(-.15,.45),right=wp(.15,.45);
        features.push({instance:item.id,type:'V converging arms and apex',points:[left,apex,right]});
        item.arms=[left,apex,right];
      }
    }
    const region=items.filter(t=>t.group===g),l=region.find(t=>t.letter==='L'),u=region.find(t=>t.letter==='U'),v=region.find(t=>t.letter==='V');
    if(l&&u){
      // Ruled strip cells share sampled U geometry and the L's actual straight edge.
      const samples=u.curve.filter((_,j)=>j%3===0);
      if(samples.at(-1)!==u.curve.at(-1))samples.push(u.curve.at(-1));
      const cells=[];
      for(let j=1;j<samples.length;j++){
        const a=mix(l.terraceEdge[0],l.terraceEdge[1],(j-1)/(samples.length-1));
        const b=mix(l.terraceEdge[0],l.terraceEdge[1],j/(samples.length-1));
        cells.push(plate([a,b,samples[j],samples[j-1]],width*.075));
      }
      record('terrace',union(cells),[l.id,u.id],'ruled L-edge to U-curve platform cells');
      // Partial cover follows the same related boundaries, forming a recessed bay.
      const a=mix(l.terraceEdge[0],l.terraceEdge[1],.2),b=mix(l.terraceEdge[0],l.terraceEdge[1],.6);
      const target=mix(u.curve[Math.floor(u.curve.length/2)],a,.7);
    }
    if(v&&(l||u)){
      const receiver=l?.terraceEdge??[u.curve[0],u.curve.at(-1)];
      const [left,apex,right]=v.arms;
      // Each triangular cheek interpolates an actual V arm to a neighboring edge.
      for(const [arm,target] of [[left,receiver[0]],[right,receiver[1]]]){
        const offset=sub(world(v,[0,0,width*.035]),world(v,[0,0,0]));
        const volume=hull([apex,arm,target].flatMap(q=>[sub(q,offset),add(q,offset)]));
        record('transition',volume,[v.id,(l??u).id],'ruled volume between V apex/arm and adjacent boundary');
      }
    }
  }
  // Construct level transitions from neighboring shared spaces along V-derived arms.
  for(let g=1;g<groups.length;g++){
    const lower=items.filter(t=>t.group===g-1),upper=items.filter(t=>t.group===g);
    const l=lower.find(t=>t.terraceEdge),target=upper.find(t=>t.terraceEdge);
    const v=lower.find(t=>t.arms)??upper.find(t=>t.arms);
    if(!l||!target||!v){circulation.push({from:g-1,to:g,status:'unresolved',reason:'missing L landing or V transition'});continue;}
    record('transition',plate([...l.terraceEdge,...target.terraceEdge],width*.09),[l.id,target.id],'ruled interlevel L-edge connection, dimensional review required');
    const a=mix(...l.terraceEdge,.45),b=mix(...target.terraceEdge,.45);
    const midpoint=[v.arms[1][0],v.arms[1][1],(a[2]+b[2])/2];
    const route=[a,midpoint,b],flightParts=[],segments=[];
    for(let k=1;k<route.length;k++){
      const p=route[k-1],q=route[k],delta=sub(q,p),run=Math.hypot(delta[0],delta[1]);
      const n=Math.max(1,Math.ceil(Math.abs(delta[2])/(width*.055))),tread=run/n,w=width*.13;
      if(run<1e-5){segments.push({status:'unresolved',reason:'zero run'});continue;}
      const normal=[-delta[1]/run*w/2,delta[0]/run*w/2,0];
      for(let j=0;j<n;j++){
        const s=mix(p,q,j/n),t=mix(p,q,(j+1)/n),top=t[2];
        s[2]=top;t[2]=top;
        flightParts.push(plate([add(s,normal),sub(s,normal),sub(t,normal),add(t,normal)],Math.abs(delta[2])/n+width*.055));
      }
      segments.push({run,riser:Math.abs(delta[2])/n,tread,width:w,steps:n});
    }
    if(flightParts.length){
      record('transition',union(flightParts),[l.id,v.id,target.id],'stepped ruled path through V apex between L landing edges');
      circulation.push({from:g-1,to:g,sourceIds:[l.id,v.id,target.id],route,segments,status:'dimensional review required'});
    }
  }
    const A=union(sourceSolids);
  // A broad front gathering area opens upward across all tiers.
  const focusWidth=Math.min(fieldWidth*.28,width*lanes*.6);
  const focusDepth=Math.min(fieldDepth*.22,width*.7);
  const focusFloor=base+width*.11;
  protectedSpace=own(M.cube([focusWidth,focusDepth,h-focusFloor])
    .translate([-focusWidth/2,-fieldDepth/2,focusFloor]));
  const sourceFocusOverlap=A.intersect(protectedSpace).volume();
  if(sourceFocusOverlap>1e-8)throw Error('Source letters obstruct the requested front gathering area');  const raw=union(components.map(c=>c.solid)),tools=[protectedSpace,...cuts.map(c=>c.solid)];
  const C=own(raw.subtract(union(tools)).intersect(box));
  const meshes=Object.fromEntries(['terrace','enclosure','transition'].map(k=>[k,meshOf(union(components.filter(c=>c.kind===k).map(c=>c.solid)).subtract(union(tools)).intersect(box),colors[k])]));
  const architecture=meshOf(C,[230,201,155]),source=meshOf(A,colors.source);
  const frame={min:[-30,-30,0],max:[30,30,60]};
  for(const [mode,list] of Object.entries({A:[source],B:[architecture,source],C:[architecture],D:Object.values(meshes)})){
    for(const view of ['iso','plan','elevation','section'])save(label+'-'+mode+'-'+view+'.png',(await render(list,view,frame,view==='section')).png);
  }
  // Source feature ribbons are actual measured geometry for the derivation view.
  const ribbons=features.filter(f=>f.points.length>1).flatMap(f=>f.points.slice(1).map((p,i)=>plate([f.points[i],p,add(p,[.02,.02,.02])],.025)));
  save(label+'-features.png',(await render([meshOf(union(ribbons),[244,99,110]),...Object.values(meshes)],'iso',frame)).png);
  json(label+'-architecture.json',architecture);
  const pockets=cuts.map(c=>({source:c.source,depth:c.depth,referenceDepth:c.referenceDepth,width:c.width,clearHeight:c.clearHeight,removedFromArchitecture:raw.intersect(c.solid).volume(),finalObstruction:C.intersect(c.solid).volume()}));
  const result={label,field:[fieldWidth,fieldDepth,h],majorLevelSpacing,majorLevels,minorRise,lanes,tiers,height:h,heading,letterCount:count,levelCount:tiers,levels,groups,items,features,components:components.map(({solid,...c})=>({...c,rawVolume:solid.volume(),bounds:solid.boundingBox()})),pockets,circulation,geometry:{status:C.status(),shells:C.decompose().map(p=>({volume:p.volume(),bounds:p.boundingBox()})),components:C.decompose().filter(p=>p.volume()>1e-8).length,bounds:C.boundingBox(),volume:C.volume(),outside:C.subtract(box).volume(),clipped:raw.subtract(box).volume(),focusBounds:protectedSpace.boundingBox(),focusArchitectureOverlap:C.intersect(protectedSpace).volume(),focusSourceOverlap:A.intersect(protectedSpace).volume(),ruleABounds:A.boundingBox(),sourceOutside:A.subtract(box).volume(),geometryHash:crypto.createHash('sha256').update(JSON.stringify(architecture)).digest('hex')}};
  json(label+'-derivation.json',result);
  console.log(h,count,groups.length,result.geometry.status,result.geometry.components,result.geometry.volume);
  // Each height has its own WASM module, released when this generation finishes.
  return result;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const rows=[];
 for(const dims of fixture.fields??[[20,20,20],[40,40,20],[60,40,40],[60,60,60]]){rows.push(await generate({width:dims[0],depth:dims[1],height:dims[2],majorLevelSpacing:fixture.majorLevelSpacing??12}));json('measurements.json',rows);}
 const pic=(h,m,v)=>'<figure><img src="'+h+'-'+m+'-'+v+'.png"><figcaption>'+h+' ft · '+v+'</figcaption></figure>';
 save('index.html','<!doctype html><meta charset=utf-8><title>Multi-letter amphitheater</title><style>body{background:#101820;color:white;font:16px system-ui;margin:3%}section{display:flex}figure{margin:2px;flex:1}img{width:100%}td,th{padding:6px;border-bottom:1px solid #486}</style><h1>Selection Field Dimensions · architectural studies</h1><p><a href="/controls">Open pre-generation controls</a></p><p>Derivation colors · sand terraces · green enclosures · violet transitions · red source features</p><section>'+rows.map(r=>pic(r.label,'C','iso')).join('')+'</section>'+rows.map(r=>'<h2>'+r.label+' ft · '+r.letterCount+' letters · '+r.levelCount+' shared levels</h2><p><a href="'+r.label+'-derivation.json">Source features, component provenance and measurements</a></p><table><tr><th>Instance</th><th>Source / role</th><th>Region / elevation</th><th>Yaw / tilt</th></tr>'+r.items.map(t=>'<tr><td>'+t.id+'</td><td>'+t.sourceIndex+' / '+t.letter+'</td><td>'+t.group+' / '+t.level.toFixed(2)+'</td><td>'+t.relativeYaw+' / '+t.tilt+'</td></tr>').join('')+'</table>'+['A','B','C','D'].map((m,i)=>'<h3>'+['Original letters','Letters and architecture','Architecture only','Geometric derivation'][i]+'</h3><section>'+['iso','plan','elevation','section'].map(v=>pic(r.label,m,v)).join('')+'</section>').join('')+'<img style="max-width:600px" src="'+r.label+'-features.png">').join(''));
})().catch(e=>{console.error(e);process.exitCode=1});










