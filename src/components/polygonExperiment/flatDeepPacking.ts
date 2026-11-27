import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import type {Point} from './territories';

export type FieldPlacement={center:Point;angle:number};

function rotate(x:number,y:number,angle:number):Point {
  const r=angle*Math.PI/180;
  return [x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)];
}

function headings(domain:CrossSection) {
  const edges=domain.toPolygons().flatMap(ring=>ring.map(([x,y],i)=>{
    const [u,v]=ring[(i+1)%ring.length];
    return {angle:Math.atan2(v-y,u-x)*180/Math.PI,length:Math.hypot(u-x,v-y)};
  })).sort((a,b)=>b.length-a.length);
  const angles=new Set([0,90,15,30,45,60,75,105,120,135,150,165]);
  for(const {angle} of edges.slice(0,8)){
    for(const turn of [0,90])angles.add(Math.round(((angle+turn+360)%180)*1000)/1000);
  }
  return [...angles];
}

// A full-width column is feasible only over intervals where none of its
// width crosses a boundary or hole. Each connected obstacle blocks its Y span.
function columnLayout(api:ManifoldToplevel,domain:CrossSection,width:number,depth:number,angle:number) {
  const local=domain.rotate(-angle);
  try {
    const {min,max}=local.bounds(),span=max[0]-min[0],eps=1e-7;
    let best:FieldPlacement[]=[];
    for(const offset of new Set([0,width/4,width/2,3*width/4,span%width])){
      const layout:FieldPlacement[]=[];
      for(let left=min[0]+offset;left+width<=max[0]+eps;left+=width){
        const strip=new api.CrossSection([[[left,min[1]],[left+width,min[1]],[left+width,max[1]],[left,max[1]]]]);
        const blocked=strip.subtract(local),pieces=blocked.decompose();
        try {
          const intervals=pieces.filter(piece=>!piece.isEmpty()).map(piece=>piece.bounds()).sort((a,b)=>a.min[1]-b.min[1]);
          let bottom=min[1];
          function fill(top:number){
            const count=Math.floor((top-bottom+eps)/depth);
            const start=bottom+(top-bottom-count*depth)/2;
            for(let i=0;i<count;i++)layout.push({center:rotate(left+width/2,start+(i+.5)*depth,angle),angle});
          }
          for(const interval of intervals){fill(interval.min[1]);bottom=Math.max(bottom,interval.max[1]);}
          fill(max[1]);
        } finally {pieces.forEach(p=>p.delete());blocked.delete();strip.delete();}
      }
      if(layout.length>best.length)best=layout;
    }
    return best;
  } finally {local.delete();}
}

export function packNativeFields(api:ManifoldToplevel,domain:CrossSection,width:number,depth:number) {
  const field=api.CrossSection.square([width,depth],true);
  const result:FieldPlacement[]=[];
  let remaining=domain;
  try {
    while(remaining.area()+1e-6>=width*depth){
      let best:FieldPlacement[]=[];
      for(const angle of headings(remaining)){
        const trial=columnLayout(api,remaining,width,depth,angle);
        if(trial.length>best.length)best=trial;
      }
      if(!best.length)break;
      const rectangles=best.map(({angle,center})=>{
        const rotated=field.rotate(angle);
        try{return rotated.translate(center);}finally{rotated.delete();}
      });
      try {
        const batch=api.CrossSection.union(rectangles),outside=batch.subtract(remaining);
        try {
          const tolerance=1e-5*best.length;
          if(outside.area()>tolerance || Math.abs(batch.area()-best.length*width*depth)>tolerance)
            throw Error('Native field packing failed its overlap or boundary check.');
          const next=remaining.subtract(batch);
          if(remaining!==domain)remaining.delete();
          remaining=next;
          result.push(...best);
        } finally {outside.delete();batch.delete();}
      } finally {rectangles.forEach(r=>r.delete());}
    }
    return result;
  } finally {if(remaining!==domain)remaining.delete();field.delete();}
}

/** Pick contained fields in compact or dispersed order before building any geometry. */
export function selectFields<T extends FieldPlacement>(fields:T[], count:number, spread:boolean):T[] {
  if(count>=fields.length)return fields;
  const pool=[...fields], chosen:T[]=[];
  const center:Point=[0,0];
  for(const p of fields){center[0]+=p.center[0]/fields.length;center[1]+=p.center[1]/fields.length;}
  const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  while(chosen.length<count&&pool.length){
    const score=(p:T)=>spread&&chosen.length
      ? Math.min(...chosen.map(q=>distance(q.center,p.center)))
      : distance(p.center,center)*(spread&&count>1?1:-1);
    let best=0;
    for(let i=1;i<pool.length;i++)if(score(pool[i])>score(pool[best]))best=i;
    chosen.push(pool.splice(best,1)[0]);
  }
  return chosen;
}
