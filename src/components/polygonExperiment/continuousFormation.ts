import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {automaticLetterTarget,maxLetterTarget,type RegistryItem} from './model';
import type {OrientationResult} from './orientationStore';
import {signedArea,type Point,type Ring} from './territories';

import type {HeightBand} from './compositionHeights';

export type Letter=OrientationResult['components'][number];
type Mesh=Letter['mesh'];
export type PlanLayer={name:string;typology:string;top:number;contours:Ring[]};
export type FormationPart={id:string;sources:string[];mesh:Mesh};
export type SourceStudy={letters:Letter[]};

// The kernel works in a local, Z-up frame. Store the final meshes in site X/Y/Z.
export function siteMesh(solid:Manifold,origin:Point,datum:number):Mesh {
  const m=solid.getMesh(),positions:number[]=[],indices:number[]=[];
  for(let i=0;i<m.vertProperties.length;i+=m.numProp)
    positions.push(origin[0]+m.vertProperties[i],datum+m.vertProperties[i+2],origin[1]+m.vertProperties[i+1]);
  for(let i=0;i<m.triVerts.length;i+=3)indices.push(m.triVerts[i],m.triVerts[i+2],m.triVerts[i+1]);
  return {positions,indices};
}

// Independently measure the saved mesh, including sheltered spaces and open decks.
export function projectMesh(api:ManifoldToplevel,mesh:Mesh,origin:Point){
  const triangles:Ring[]=[];
  for(let i=0;i<mesh.indices.length;i+=3){
    const r:Ring=mesh.indices.slice(i,i+3).map(j=>[mesh.positions[3*j]-origin[0],mesh.positions[3*j+2]-origin[1]]);
    const area=signedArea(r);
    // On a closed Y-up mesh the upward-facing triangles cover the full plan.
    // Ignoring the coincident underside avoids stacking opposite faces at
    // identical edges of a thin horizontal plate.
    if(area < -1e-10)triangles.push(r.reverse());
  }
  return new api.CrossSection(triangles,'NonZero');
}

export function candidates(domain:CrossSection,label:Point):Point[]{
  const {min,max}=domain.bounds(),points:Point[]=[label];
  const rings=domain.toPolygons();
  // Sample the buildable interior at a resolution proportional to the site.
  const nx=Math.min(45,Math.max(8,Math.ceil((max[0]-min[0])/5)));
  const ny=Math.min(45,Math.max(8,Math.ceil((max[1]-min[1])/5)));
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const x=min[0]+(i+.5)*(max[0]-min[0])/nx,y=min[1]+(j+.5)*(max[1]-min[1])/ny;
    let inside=false;
    for(const ring of rings)for(let k=0,l=ring.length-1;k<ring.length;l=k++){
      const a=ring[k],b=ring[l];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    if(inside)points.push([x,y]);
  }
  return points;
}

function template(letter:Letter){
  const p=letter.mesh.positions;
  let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,y0=Infinity,y1=-Infinity;
  for(let i=0;i<p.length;i+=3){
    x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);z0=Math.min(z0,p[i+2]);z1=Math.max(z1,p[i+2]);
    y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);
  }
  return {letter,cx:(x0+x1)/2,cz:(z0+z1)/2,y0,height:y1-y0,radius:Math.hypot(x1-x0,z1-z0)/2};
}

export function formTerritory(api:ManifoldToplevel,domain:CrossSection,origin:Point,datum:number,
  rule:RegistryItem,study:SourceStudy,label:Point,clustering:number,cap:number,bands:HeightBand[]=[],letterTarget?:number){
  const owned:{delete():void}[]=[];
  function own<T extends {delete():void}>(shape:T):T{owned.push(shape);return shape;}
  const parts:FormationPart[]=[],layers:PlanLayer[]=[],letters:Letter[]=[],solids:Manifold[]=[];
  const projections:CrossSection[]=[],profiles:CrossSection[]=[];
  const params=rule.B.parameters,number=(key:string)=>{const n=params[key];if(typeof n!=='number'||!(n>0))throw Error('Missing rule dimension '+key);return n;};
  const inset=(s:CrossSection,feet:number)=>own(s.offset(-feet,'Miter',2));
  const subtract=(a:CrossSection,b:CrossSection)=>own(a.subtract(b));
  const intersect=(a:CrossSection,b:CrossSection)=>own(a.intersect(b));
  const unite=(s:CrossSection[])=>own(api.CrossSection.union(s));
  const band=(s:CrossSection,width:number)=>subtract(s,inset(s,width));
  let floorBase=0,partPrefix='';
  const base=rule.id==='linear-edge-gallery'?number('printWallAndSlabFeet'):rule.id==='room-within-volume'?number('printShellFeet'):.75;
  function build(name:string,shape:CrossSection,bottom:number,top:number){
    if(shape.isEmpty()||top<=bottom)return;
    // Boolean cuts can leave nearly coincident edges at a plate opening.
    // Clean these below rendering precision before triangulating a floor.
    // The emitted footprint is still checked against the untouched territory.
    const clean=own(shape.simplify(.00001));
    if(clean.isEmpty())return;
    name=partPrefix+name;
    const solid=own(own(clean.extrude(top-bottom)).translate([0,0,bottom+floorBase]));
    solids.push(solid);
    parts.push({id:rule.id+'/'+name,sources:letters.map(l=>l.id),mesh:siteMesh(solid,origin,datum)});
    layers.push({name,typology:rule.id,top:top+floorBase,contours:clean.toPolygons().map(r=>r.map(([x,y])=>[origin[0]+x,origin[1]+y]))});
  }
  try{
    const pool=candidates(domain,label),{min,max}=domain.bounds(),diagonal=Math.hypot(max[0]-min[0],max[1]-min[1]);
    const prototypes=[...new Set(study.letters.map(l=>l.letter))].map(g=>template(study.letters.find(l=>l.letter===g)!));
    const chosen:{point:Point;radius:number}[]=[];
    const quantity=letterTarget??automaticLetterTarget(domain.area());
    if(!Number.isInteger(quantity)||quantity<1||quantity>maxLetterTarget)throw Error(rule.name+' letter target must be between 1 and '+maxLetterTarget+'.');
    const height=bands.length?Math.max(...bands.map(b=>b.cap)):Math.min(cap,rule.id==='vertical-walls'?22:rule.id==='linear-edge-gallery'?26:39);
    const minRise=rule.id==='linear-edge-gallery'?number('printOpeningHeightFeet')+2*base:
      rule.id==='room-within-volume'?number('doorHeightFeet')+2*base:
      rule.id==='inserted-plate'||rule.id==='void-field'?(rule.A.parameters.spacingFeet as number[])[0]:base;
    if(height<minRise+base)throw Error(rule.name+' requires at least '+(minRise+base).toFixed(2)+' ft of height.');
    // Native glyph poses supply the plan outlines of supports, cuts and rooms.
    // Changing clustering moves their stations. It never rescales a glyph.
    for(let k=0;k<quantity;k++){
      const proto=prototypes[k%prototypes.length];
      if(proto.height>height)continue;
      let point:Point|undefined;
      const score=(p:Point)=>{
        const centerDistance=Math.hypot(p[0]-label[0],p[1]-label[1]);
        if(!chosen.length)return -centerDistance;
        const nearest=Math.min(...chosen.map(a=>Math.hypot(p[0]-a.point[0],p[1]-a.point[1])-a.radius-proto.radius));
        if(nearest<2)return -Infinity;
        return nearest/(1+5*(clustering/100)*centerDistance/Math.max(1,diagonal));
      };
      const sorted=pool.map(p=>({p,value:score(p)})).filter(x=>Number.isFinite(x.value)).sort((a,b)=>b.value-a.value);
      // A conservative square checks clearance for the complete source mesh.
      const box=own(api.CrossSection.square([2*proto.radius,2*proto.radius],true));
      for(const {p} of sorted){
        const at=box.translate(p),outside=at.subtract(domain),fits=outside.area()<1e-8;
        const clearsHeight=fits&&bands.every(b=>b.cap>=proto.height||intersect(at,b.section).area()<1e-8);
        outside.delete();at.delete();
        if(clearsHeight){point=p;break;}
      }
      if(!point)continue;
      chosen.push({point,radius:proto.radius});
      const {letter}=proto,positions:number[]=[];
      for(let i=0;i<letter.mesh.positions.length;i+=3){
        const p=letter.mesh.positions;
        positions.push(origin[0]+point[0]+p[i]-proto.cx,datum+p[i+1]-proto.y0,origin[1]+point[1]+p[i+2]-proto.cz);
      }
      const source={...letter,id:rule.id+'/station-'+(k+1)+'-'+letter.letter,mesh:{positions,indices:letter.mesh.indices}};
      letters.push(source);
      const projected=own(projectMesh(api,source.mesh,origin));
      projections.push(projected);profiles.push(own(projected.hull()));
    }
    if(!letters.length)throw Error('No full-scale '+rule.name+' source fits this territory. Increase its share or clustering.');
    const footprint=unite(projections),fields=unite(profiles);
    function formStorey(domain:CrossSection,height:number,spatial:boolean){
      const inside=(s:CrossSection)=>intersect(domain,s);
      const courts=inside(inset(fields,-3)),rim=(s:CrossSection,w:number)=>inside(subtract(inset(s,-w),s));
      const core=inside(inset(footprint,-.35)),interior=inset(domain,5);
      const lifts=spatial?1:height>=2*minRise+base?2:1;
      const level=spatial?height-base:Math.min(13,(height-base)/lifts),upperLevel=lifts*level;
      // Adjacent occupied floor and court surfaces share the datum. The other
      // levels grow directly from the territory contour and the Rule A stations.
      if(rule.id==='linear-edge-gallery'){
        const wall=number('printWallAndSlabFeet'),opening=number('printOpeningWidthFeet');
        const gallery=band(domain,Math.max(6,level*.7));
        const innerEdge=intersect(gallery,inset(domain,wall));
        const carrier=inside(unite([band(domain,wall),rim(interior,wall),core]));
        const gates=unite(chosen.map(({point})=>{
          const cut=own(api.CrossSection.square([opening,diagonal*2],true));return own(cut.translate(point));
        }));
        build('open gallery courts',subtract(domain,gallery),0,wall);
        build('continuous gallery walk',gallery,0,wall);
        build('contour walls and receivers',unite([subtract(carrier,gates),core]),wall,level);
        build('gallery lintels',carrier,Math.min(level-1,number('printOpeningHeightFeet')+wall),level);
        build('edge gallery roof',gallery,level,level+wall);
        build('inner parapet',band(innerEdge,wall),level+wall,Math.min(height,level+wall+2));
      }else if(rule.id==='inserted-plate'){
        const slab=number('plateThicknessFeet'),pier=number('edgeSweepHalfWidthFeet');
        const receivers=inside(inset(footprint,-pier));
        const supports=spatial?unite([receivers,band(domain,pier)]):receivers,slots=subtract(courts,inset(fields,-1));
        const gaps=unite(chosen.map(({point})=>{
          const seam=own(api.CrossSection.square([diagonal*2,3],true));return own(seam.translate(point));
        }));
        const openings=subtract(slots,gaps),upper=subtract(domain,openings),middle=subtract(domain,intersect(openings,interior));
        build('entry plate',domain,0,slab);
        build('edge receivers',supports,slab,spatial?height:upperLevel);
        if(lifts===2)build('intermediate inserted plate',middle,level-slab,level);
        build('upper inserted plate',upper,upperLevel-slab,upperLevel);
      }else if(rule.id==='vertical-walls'){
        const slab=number('platformThicknessFeet'),run=3.5,rise=Math.min(1.5,.12*letters[0].nominalSizeFeet);
        build('amphitheater floor',domain,0,slab);
        const stage=inside(inset(fields,-number('initialOffsetFeet')));
        // Each successive seating bank stays supported by the bank below it.
        for(let i=1;i<=Math.min(8,Math.floor((height-slab)/rise));i++){
          const banks=subtract(domain,inset(stage,-i*run));
          build('seating terrace '+i,banks,slab+(i-1)*rise,slab+i*rise);
        }
        build('performance platforms',stage,slab,slab+rise);
      }else if(rule.id==='room-within-volume'){
        const shell=number('printShellFeet'),door=number('doorWidthFeet');
        const rooms=intersect(interior,inset(fields,-2.5)),wall=band(rooms,shell);
        const doors=unite(chosen.map(({point})=>{
          const slot=own(api.CrossSection.square([door,diagonal*2],true));return own(slot.translate(point));
        }));
        const landing=intersect(domain,unite(chosen.map(({point})=>{
          const spine=own(api.CrossSection.square([diagonal*2,number('landingWidthFeet')],true));return own(spine.translate(point));
        })));
        build('perimeter hall floor',domain,0,shell);
        const roomFloor=lifts===2?level:shell;
        build('outer hall enclosure',subtract(band(domain,shell),doors),shell,spatial?height:upperLevel);
        build('inner room supports',core,shell,roomFloor);
        // A circulation strip may re-enter a concave territory on the far
        // side of an indentation. Only its runs that reach a room are landings.
        const roomLandings=landing.decompose().map(piece=>own(piece))
          .filter(piece=>intersect(piece,rooms).area()>0);
        build('room floors and landings',unite([rooms,...roomLandings]),roomFloor-shell,roomFloor);
        build('inner room enclosures',subtract(wall,doors),roomFloor,upperLevel-shell);
        build('door headers',wall,roomFloor+number('doorHeightFeet'),upperLevel-shell);
        build('room roofs and perimeter planks',unite([rooms,band(domain,3)]),upperLevel-shell,upperLevel);
      }else{
        const slab=number('floorThicknessFeet'),edge=number('rimThicknessFeet');
        const wells=intersect(interior,inset(fields,-number('sourceOffsetFeet')));
        const lower=subtract(domain,wells),upperWells=inside(inset(wells,-number('defaultTaper')*2));
        build('open atrium floors',wells,0,slab);
        build('ground concourse',lower,0,slab);
        build('atrium support walls',rim(wells,edge),slab,upperLevel);
        build('perimeter supports',band(domain,edge),slab,spatial?height:upperLevel);
        if(lifts===2)build('first void field deck',lower,level-slab,level);
        build('upper void field deck',subtract(domain,upperWells),upperLevel-slab,upperLevel);
        build('upper atrium rims',rim(upperWells,edge),upperLevel,Math.min(height,upperLevel+edge));
      }
    }
    if(bands.length){
      for(const band of bands){
        const local=intersect(domain,band.section);
        if(local.area()<=1e-7)continue;
        if(band.cap<minRise+base)throw Error(rule.name+' requires at least '+(minRise+base).toFixed(2)+' ft of height in '+band.id+'.');
        // Terraces grow at the native riser and tread. Occupied typologies
        // repeat their walks, rooms and decks within each local envelope.
        const count=rule.id==='vertical-walls'?1:Math.max(1,Math.floor(band.cap/Math.max(15,minRise+base)));
        const storey=band.cap/count;
        for(let i=0;i<count;i++){
          floorBase=i*storey;partPrefix=band.id+'/level-'+(i+1)+'/';
          formStorey(local,storey,true);
        }
      }
    }else formStorey(domain,height,false);
    if(solids.length<2)throw Error('The territory has insufficient space for '+rule.name+'.');
    const solid=own(api.Manifold.union(solids));
    if(solid.status()!=='NoError'||solid.isEmpty())throw Error(rule.name+' failed solid formation.');
    const mesh=siteMesh(solid,origin,datum),plan=own(projectMesh(api,mesh,origin));
    const outside=own(plan.subtract(domain)).area(),missing=own(domain.subtract(plan)).area();
    const tolerance=Math.max(.01,domain.area()*1e-6);
    if(Math.max(outside,missing)>tolerance)throw Error(rule.name+' failed the footprint check ('+missing.toFixed(3)+' ft² missing, '+outside.toFixed(3)+' ft² outside).');
    return {solid:solid.translate([0,0,0]),letterTarget:quantity,letters,parts,layers,sourceArea:footprint.area(),footprintArea:plan.area(),outside,missing,height:solid.boundingBox().max[2]};
  }finally{for(const shape of owned.reverse())shape.delete();}
}
