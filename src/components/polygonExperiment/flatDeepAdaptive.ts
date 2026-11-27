import type {CrossSection, ManifoldToplevel} from 'manifold-3d';
import type {Point} from './territories';
import type {HeightBand} from './compositionHeights';

export type AdaptiveOptions = {coverage:number; setback:number; separation:number; minimum:number; letterTarget?:number; spread?:boolean};
export type AdaptivePlacement = {center:Point; angle:number; field:{width:number;depth:number;height:number}};

// Keep the filled L-pocket piers within the plate projection at the native 12 ft grid pitch.
// A residual margin of 2 ft splits into 1 ft on each side of the grid.
function clearGridSpan(available:number) {
  let span=Math.floor(available+1e-7);
  while(span>=20 && (span-4)%12<2)span--;
  return span;
}

// Four guides for each of two plates, four for each of seven wall panels, and one per grid pier.
function guideCount(width:number,depth:number){
  return 36+(Math.max(1,Math.floor((width-4)/12))+1)*(Math.max(1,Math.floor((depth-4)/12))+1);
}
function longestPlate(api:ManifoldToplevel,region:CrossSection,budget:number,minimum:number,target?:number,previous:AdaptivePlacement[]=[]) {
  let best:AdaptivePlacement|undefined;
  let bestArea=0,bestError=Infinity,bestDistance=-1;
  for(let angle=0;angle<180;angle+=15){
    const local=region.rotate(-angle);
    try {
      const {min,max}=local.bounds(),span=max[0]-min[0];
      const widths=new Set([minimum,24,30,36,42,48,60,72,84,96,span,span/2,span/3]);
      for(const proposal of widths){
        const width=clearGridSpan(Math.min(proposal,span,120));
        let maxDepth=Math.min(120,4+budget/(width-4));
        if(target!==undefined){
          const rows=Math.max(2,Math.round((target-36)/(1+Math.max(1,Math.floor((width-4)/12)))));
          maxDepth=Math.min(maxDepth,Math.max(minimum,4+12*rows-1));
        }
        if(width<minimum || maxDepth<minimum || (target===undefined&&!previous.length&&(width-4)*(maxDepth-4)<=bestArea))continue;
        const travel=Math.max(0,span-width), steps=Math.max(1,Math.ceil(travel/6));
        for(let i=0;i<=steps;i++){
          const left=min[0]+travel*i/steps;
          const strip=new api.CrossSection([[[left,min[1]],[left+width,min[1]],[left+width,max[1]],[left,max[1]]]]);
          const obstacle=strip.subtract(local),pieces=obstacle.decompose();
          try {
            const blocked=pieces.filter(p=>!p.isEmpty()).map(p=>p.bounds()).sort((a,b)=>a.min[1]-b.min[1]);
            let bottom=min[1];
            const consider=(top:number)=>{
              const depth=clearGridSpan(Math.min(top-bottom,maxDepth)),area=(width-4)*(depth-4);
              if(depth<minimum)return;
              const error=target===undefined?0:Math.abs(guideCount(width,depth)-target);
              if(error>bestError||(error===bestError&&area<bestArea))return;
              const x=left+width/2,y=(bottom+top)/2,r=angle*Math.PI/180;
              const center:Point=[x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)];
              const separation=previous.length?Math.min(...previous.map(p=>Math.hypot(center[0]-p.center[0],center[1]-p.center[1]))):0;
              if(error===bestError&&area===bestArea&&separation<=bestDistance)return;
              bestDistance=separation;bestError=error;
              best={angle,center,field:{width,depth,height:20}};
              bestArea=area;
            };
            for(const b of blocked){consider(b.min[1]);bottom=Math.max(bottom,b.max[1]);}
            consider(max[1]);
          } finally {pieces.forEach(p=>p.delete());obstacle.delete();strip.delete();}
        }
      }
    } finally {local.delete();}
  }
  return best;
}

export function arrangeAdaptiveFields(api:ManifoldToplevel,region:CrossSection,bands:HeightBand[],zoneCap:number,options:AdaptiveOptions) {
  const {coverage,setback,separation}=options;
  const minimum=Math.max(20,Math.ceil(options.minimum));
  if(![coverage,setback,separation,minimum].every(Number.isFinite)||coverage<=0||coverage>100||setback<0||separation<0)throw Error('Invalid adaptive coverage, clearance or minimum field size.');
  if(zoneCap<=19)throw Error('Flat-Deep needs over 19 ft of field height for the approved slab section and clear headroom.');
  const placements:AdaptivePlacement[]=[];
  let budget=region.area()*coverage/100;
  // The territory already excludes protected ground. Insetting its complete outline also buffers holes.
  let available=region.offset(-Math.max(setback,separation/2));
  try {
    for(const band of bands.filter(b=>b.cap<=19)){
      const next=available.subtract(band.section);available.delete();available=next;
    }
    while(!available.isEmpty() && budget>=(minimum-4)**2){
      const remaining=options.letterTarget===undefined?undefined:options.letterTarget-placements.reduce((n,p)=>n+guideCount(p.field.width,p.field.depth),0);
      if(remaining!==undefined&&placements.length&&remaining<=guideCount(minimum,minimum)/2)break;
      const target=remaining!==undefined&&options.spread&&remaining>=2*guideCount(minimum,minimum)?Math.ceil(remaining/2):remaining;
      const p=longestPlate(api,available,budget,minimum,target,options.spread?placements:[]);
      if(p&&placements.length&&remaining!==undefined&&Math.abs(guideCount(p.field.width,p.field.depth)-remaining)>=remaining)break;
      if(!p)break;
      const {width,depth}=p.field;
      const rect=api.CrossSection.square([width,depth],true),oriented=rect.rotate(p.angle),placed=oriented.translate(p.center);
      try {
        const escape=placed.subtract(available);
        try {if(escape.area()>1e-5)throw Error('Adaptive field crosses a territory boundary or clearance.');} finally {escape.delete();}
        let height=Math.min(zoneCap,40);
        for(const band of bands){
          const inside=placed.intersect(band.section);
          try {if(inside.area()>1e-6)height=Math.min(height,band.cap);} finally {inside.delete();}
        }
        if(height<=19)throw Error('Adaptive field exceeds the local headroom envelope.');
        p.field.height=height;
        const clearance=placed.offset(separation),next=available.subtract(clearance);
        clearance.delete();available.delete();available=next;
        placements.push(p);budget-=(width-4)*(depth-4);
      } finally {placed.delete();oriented.delete();rect.delete();}
    }
  } finally {available.delete();}
  if(!placements.length)throw Error('No full adaptive field meets the planning minimum, clearance, height and requested footprint budget.');
  return placements;
}
