import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import type {OfficePlan,OfficePlate,Pt} from './flatDeepRules/contracts';
import type {IntersectionPlacement as Pose} from './workspaceRules/placement';
import {openHallFilledLPocketPolygon,OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE,MEZZANINE_MIN_WIDTH,OPEN_HALL_OPENING_TARGET,OPEN_HALL_COLUMN_GRID_SPACINGS,OPEN_HALL_ENTRY_WIDTH,OPEN_HALL_OPENING_MIN,OPEN_HALL_OPENING_MAX} from './workspaceRules/open-hall-workspace';

class HallFitError extends Error {}

// A curving frontage is often sampled as dozens of short survey edges. Rank its
// walkable length, and carry the same opening station across each constituent edge.
function entryFacade(loop:Pt[],lengths:number[],siteEdges:Pt[][]){
 const n=loop.length;
 const headings=loop.map((p,i)=>Math.atan2(loop[(i+1)%n][1]-p[1],loop[(i+1)%n][0]-p[0]));
 const turn=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 function nearSite(p:Pt){
  return siteEdges.some(r=>r.some((a,j)=>{
   const b=r[(j+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1];
   const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
   return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<4;
  }));
 }
 const exposed=loop.map((p,i)=>nearSite([(p[0]+loop[(i+1)%n][0])/2,(p[1]+loop[(i+1)%n][1])/2]));
 const runs:{edges:number[];length:number;exposed:boolean}[]=[];
 for(let start=0;start<n;start++){
  const edges=[start];let length=lengths[start],bend=0;
  for(let j=1;j<n;j++){
   const i=(start+j)%n,delta=turn(headings[(i+n-1)%n],headings[i]);
   if(delta>Math.PI/5||bend+delta>Math.PI/2||exposed[i]!==exposed[start])break;
   edges.push(i);length+=lengths[i];bend+=delta;
  }
  runs.push({edges,length,exposed:exposed[start]});
 }
 const ordered=runs.filter(r=>r.length>=OPEN_HALL_ENTRY_WIDTH+2).sort((a,b)=>b.length-a.length);
 if(!ordered.length)throw new HallFitError('No facade is long enough for the hall entry and its jambs.');
 return ordered.find(r=>r.exposed&&r.length>=ordered[0].length*.65)??ordered[0];
}

// The boundary extension uses the native four-face ring option, with one
// guide-defined outside loop and a separate mezzanine opening. All units are feet.
export function openHallBoundary(api:ManifoldToplevel,ground:CrossSection,height:number,pitch:number=OPEN_HALL_COLUMN_GRID_SPACINGS[1], guideFits?:(poses:Pose[])=>boolean,siteEdges:Pt[][]=[]){
 const owned:CrossSection[]=[];const own=(s:CrossSection)=>{owned.push(s);return s;};
 const placements:Pose[]=[],plates:OfficePlate[]=[],voids:OfficePlan['voids']=[];
 const base=-height/2,roof=height/2-.05,slab=.75;
 const normal=(a:Pt,b:Pt):Pt=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[0]-a[0])/d,(b[1]-a[1])/d];};
 const section=(loop:Pt[])=>own(new api.CrossSection([loop]));
 const box=(x:number,y:number,a:number,b:number):Pt[]=>[[x-a,y-b],[x+a,y-b],[x+a,y+b],[x-a,y+b]];
 const tip=(p:Pose):Pt=>{const a=p.rz*Math.PI/180;return [p.x+p.scale*(-.42*Math.cos(a)+.45*Math.sin(a)),p.y+p.scale*(-.42*Math.sin(a)-.45*Math.cos(a))];};
 function guide(role:Pose['openHallRole'],x:number,y:number,z:number,rz:number,size:number,vertical=false){
  const p:Pose={letter:'L',openHallRole:role,x,y,z,rx:vertical?90:0,ry:0,rz,rotationOrder:vertical?'ZYX':'XYZ',scale:size,scaleX:1,scaleY:1,scaleZ:1};
  placements.push(p);return p;
 }
 function trace(loop:Pt[],role:'floor'|'mezzanine',z:number){
  return loop.map((p,i)=>{const u=normal(p,loop[(i+1)%loop.length]),size=Math.min(6,Math.max(1,Math.hypot(loop[(i+1)%loop.length][0]-p[0],loop[(i+1)%loop.length][1]-p[1])/3));
   const g=guide(role,p[0],p[1],z,Math.atan2(u[1],u[0])*180/Math.PI,size);
   const incoming=normal(loop[(i+loop.length-1)%loop.length],p);
   const nx=-incoming[1]-u[1],ny=incoming[0]+u[0],norm=Math.hypot(nx,ny)||1;
   const initial=g.rz;
   for(const scale of [size,Math.min(2,size),Math.min(1,size)])for(const yaw of [0,15,30,45,60,75,90,-15,-30,-45,-60,-75,-90,135,180]){
    g.scale=scale;g.rz=initial+yaw;g.x=p[0];g.y=p[1];
    const t=tip(g);g.x+=p[0]-t[0];g.y+=p[1]-t[1];
    if(!guideFits||guideFits([g]))return tip(g);
    // The bevel can project past a sharp survey vertex. Seat the guide along
    // its edge and set the corner out from that measured guide displacement.
    const dx=g.x,dy=g.y;
    for(const seat of [.05,.15,.5,1,2,4,6]){
     g.x=dx+seat*nx/norm;g.y=dy+seat*ny/norm;
     if(guideFits([g])){const anchor=tip(g);return [anchor[0]-seat*nx/norm,anchor[1]-seat*ny/norm] as Pt;}
    }
   }
   throw new HallFitError('A perimeter guide cannot seat at the boundary corner.');});
 }
 try{
  const loops=ground.toPolygons();if(loops.length!==1)throw new HallFitError('Open Hall needs one continuous hall perimeter without an internal site exclusion.');
  // A polygonal arc is inscribed in the ideal round offset. Allow for its
  // chord error so the built gallery clears the minimum even at concave corners.
  const arcSegments=36;
  const inset=(depth:number)=>own(ground.offset(-depth,'Round',2,arcSegments));
  let left=MEZZANINE_MIN_WIDTH/Math.cos(Math.PI/arcSegments),right=left;
  // A gallery requires one clear opening. Ignore isolated inset pockets when sizing it.
  const openingAt=(depth:number)=>inset(depth).decompose().map(own).sort((a,b)=>b.area()-a.area())[0];
  const openingArea=(depth:number)=>openingAt(depth)?.area()??0;
  const target=ground.area()*OPEN_HALL_OPENING_TARGET;
  if(openingArea(left)<ground.area()*OPEN_HALL_OPENING_MIN)throw new HallFitError('Open Hall cannot fit a 10 ft ring and a 20% hall opening.');
  while(openingArea(right)>target)right*=1.5;
  for(let i=0;i<26;i++){const mid=(left+right)/2;if(openingArea(mid)>target)left=mid;else right=mid;}
  const inner=openingAt(right)?.toPolygons()??[];
  if(inner.length!==1)throw new HallFitError('The central hall opening splits at the required gallery width.');
  const outer=trace(loops[0],'floor',base+slab/2);
  const mezz=trace(loops[0],'mezzanine',-slab/2),opening=trace(inner[0],'mezzanine',-slab/2);
  plates.push({id:'hall-ground',role:'ground',polygon:outer,zTop:base+slab,thickness:slab},{id:'hall-ring',role:'mezzanine',polygon:mezz,zTop:0,thickness:slab},{id:'hall-roof',role:'roof',polygon:outer,zTop:roof,thickness:slab});
  voids.push({id:'central-hall',polygon:opening,roles:['mezzanine'],cut:true});
  const openingShare=section(opening).area()/ground.area();
  if(openingShare<OPEN_HALL_OPENING_MIN||openingShare>OPEN_HALL_OPENING_MAX)throw new HallFitError('The measured Open Hall opening must occupy 20–40%.');
  const {min,max}=ground.bounds();
  const inside=(loop:Pt[])=>own(section(loop).subtract(ground)).area()<1e-7;
  const piers:Pt[][]=[],bays:Pt[]=[],nodes=new Set<string>();
  const center:Pt=[(min[0]+max[0])/2,(min[1]+max[1])/2];
  for(let i=Math.ceil((min[0]-center[0])/pitch);i<=(max[0]-center[0])/pitch;i++){
   for(let j=Math.ceil((min[1]-center[1])/pitch);j<=(max[1]-center[1])/pitch;j++){
    const x=center[0]+i*pitch,y=center[1]+j*pitch;
    if(inside(box(x,y,1.4,1.4))){
     nodes.add(i+','+j);
     const g=guide('column',x,y,base+1.05,((i+j)%4)*90,2);
     const polygon=box(g.x,g.y,Math.abs((i+j)%2)?.9:.84,Math.abs((i+j)%2)?.84:.9);piers.push(polygon);
     plates.push({id:'pier-'+piers.length,role:'support',polygon,zTop:.05,thickness:.05-base-.2});
    }
    
   }
  }
  // Native Open Hall places one roof L at the centre of every complete column bay.
  for(const key of nodes){
   const [i,j]=key.split(',').map(Number);
   if(!nodes.has((i+1)+','+j)||!nodes.has(i+','+(j+1))||!nodes.has((i+1)+','+(j+1)))continue;
   const x=center[0]+(i+.5)*pitch,y=center[1]+(j+.5)*pitch;
   if(inside(box(x,y,pitch/2,pitch/2)))bays.push([x,y]);
  }
  if(!bays.length)throw new HallFitError('Open Hall requires at least one complete roof bay.');
  for(const [i,p] of bays.entries()){
   const g=guide('roof',p[0],p[1],roof-slab/2,(i%4)*90,OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE);
   voids.push({id:'roof-cut-'+(i+1),cut:true,roles:['roof'],polygon:openHallFilledLPocketPolygon([g.x,g.y],g.scale,g.rz)});
  }
  const lengths=outer.map((p,i)=>Math.hypot(p[0]-outer[(i+1)%outer.length][0],p[1]-outer[(i+1)%outer.length][1]));
  const entry=entryFacade(outer,lengths,siteEdges);
  const entryWidth=Math.max(OPEN_HALL_ENTRY_WIDTH,entry.length/3);
  const openingStart=(entry.length-entryWidth)/2,openingEnd=openingStart+entryWidth;
  const starts=new Map<number,number>();
  let station=0;
  for(const i of entry.edges){starts.set(i,station);station+=lengths[i];}
  outer.forEach((a,i)=>{
   const u=normal(a,outer[(i+1)%outer.length]),len=lengths[i],distance=starts.get(i);
   const runs=distance===undefined?[[0,len]]:[[0,Math.min(len,openingStart-distance)],[Math.max(0,openingEnd-distance),len]];
   for(const [lo,hi] of runs){
    if(hi-lo<.1)continue;
    const start:Pt=[a[0]+u[0]*lo,a[1]+u[1]*lo],end:Pt=[a[0]+u[0]*hi,a[1]+u[1]*hi];
    const heading=Math.atan2(u[1],u[0])*180/Math.PI;
    // Place the outer bottom and top corners of each vertical L on its jamb.
    const corner=(p:Pt,z:number,direction:number,up:number)=>{
     const g=guide('wall',p[0],p[1],z,heading+(direction<0?180:0),Math.min(2,(hi-lo)/3),true);
     g.rx=up*90;
     const originalSize=g.scale;
     for(const size of new Set([originalSize,Math.min(1,originalSize)])){
      g.scale=size;g.z=z+up*.45*size;
      // Seat the vertical L on its own wall run, clear of the bevel at a sharp
      // junction. Its heading and surveyed end distance define the wall end.
      for(const advance of [.25,.5,1,2,4,8,16]){
       const endDistance=direction*(.42*size+Math.min(advance,(hi-lo)/3));
       const bearing=.15*size;
       g.x=p[0]+endDistance*u[0]-bearing*u[1];g.y=p[1]+endDistance*u[1]+bearing*u[0];
       if(!guideFits||guideFits([g]))return [g.x-endDistance*u[0]+bearing*u[1],g.y-endDistance*u[1]-bearing*u[0],g.z-up*.45*size];
      }
     }
     throw new HallFitError('A vertical L cannot seat inside its wall run.');
    };
    const a0=corner(start,base+slab,1,1),a1=corner(end,base+slab,-1,1),a2=corner(end,roof-slab,-1,-1);corner(start,roof-slab,1,-1);
    const strip:Pt[]=[[a0[0],a0[1]],[a1[0],a1[1]],[a1[0]-1.5*u[1],a1[1]+1.5*u[0]],[a0[0]-1.5*u[1],a0[1]+1.5*u[0]]];
    for(const polygon of own(section(strip).intersect(ground)).toPolygons())plates.push({id:'perimeter-'+plates.length,role:'wall',polygon,zTop:a2[2],thickness:a2[2]-a0[2]});
   }
  });
  const officePlan:OfficePlan={typology:'open-hall-workspace',rotation:0,plates,voids,slots:[],links:[],checks:[
   {label:'Continuous hall ring',status:'pass',detail:`One exterior and one central opening. Opening ${(openingShare*100).toFixed(2)}%, gallery construction offset ${right.toFixed(2)} ft.`},
   {label:'Entry and bay layout',status:'pass',detail:`${entryWidth.toFixed(2)} ft clear entry on a ${entry.length.toFixed(2)} ft wall, ${piers.length} piers on a ${pitch} ft grid, ${bays.length} skylight bays.`},
  ],operations:['Boundary ring with a continuous hall, equal grid, one roof cut per complete bay and an open entry.']};
  return {placements,officePlan};
 }finally{owned.reverse().forEach(x=>x.delete());}
}

/** Fit one hall before building its solids. The site setback and every hole are already in territory. */
export function fitOpenHallBoundary(api:ManifoldToplevel,territory:CrossSection,height:number,
 target:number|undefined,spread:boolean,guidesFit:(poses:Pose[])=>boolean,siteEdges:Pt[][]=[]){
 const owned:CrossSection[]=[];
 const own=(section:CrossSection)=>{owned.push(section);return section;};
 const largestFirst=(section:CrossSection)=>section.decompose().map(own).sort((a,b)=>b.area()-a.area());
 let reason='No connected area can seat a complete hall.';
 const tryOutline=(outline:CrossSection,pitch:number)=>{
  if(outline.isEmpty()||outline.toPolygons().length!==1)return;
  try{
   const plan=openHallBoundary(api,outline,height,pitch,guidesFit,siteEdges);
   if(guidesFit(plan.placements))return plan;
   reason='The posed guides extend beyond the permitted ground.';
  }catch(error){
   if(!(error instanceof HallFitError))throw error;
   reason=error.message;
  }
 };
 const pitches=[OPEN_HALL_COLUMN_GRID_SPACINGS[1],...OPEN_HALL_COLUMN_GRID_SPACINGS.filter(p=>p!==OPEN_HALL_COLUMN_GRID_SPACINGS[1])];
 function fitPiece(piece:CrossSection){
  let best=tryOutline(piece,pitches[0]);
  if(target===undefined&&best)return best;
  const outline=piece;
  for(const pitch of pitches){
   if(outline===piece&&pitch===pitches[0])continue;
   const trial=tryOutline(outline,pitch);
   if(!trial)continue;
   if(target===undefined)return trial;
   if(!best||Math.abs(trial.placements.length-target)<Math.abs(best.placements.length-target))best=trial;
  }
  return best;
 }
 try{
  // Prefer the largest architectural footprint. Actual guide containment
  // is measured independently, including when a narrower territory needs a closer fit.
  const lobes=[0,.25,1,2,4,8].map(allowance=>largestFirst(own(territory.offset(-allowance,'Miter',2))));
  for(const lobe of lobes.flat().sort((a,b)=>b.area()-a.area())){
   const fit=fitPiece(lobe);
   if(fit)return fit;
  }
  for(const components of lobes){
   // A thin neck or tail can consume the gallery width. Grow a perimeter around
   // one viable opening core, bounded by the same permitted lobe, before placing guides.
   for(const lobe of components){
    const cores=largestFirst(own(lobe.offset(-MEZZANINE_MIN_WIDTH,'Miter',2)));
    for(const core of cores){
     const envelope=own(core.offset(MEZZANINE_MIN_WIDTH,'Miter',2));
     const outline=own(envelope.intersect(lobe));
     const fit=fitPiece(outline);
     if(fit)return fit;
    }
   }
  }
  throw new HallFitError('No continuous boundary-adaptive Open Hall fits this territory. '+reason);
 }finally{owned.reverse().forEach(section=>section.delete());}
}