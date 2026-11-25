import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import type {Point,Ring} from './territories';

// Move equal-area boundaries between a compact band and interlocking fingers.
// The sweep is monotone in u for every cross-site station v, so bisection
// can recover exact shares on concave, holed and disconnected domains.
export function clusteredCut(api:ManifoldToplevel,region:CrossSection,boundary:Ring,normal:Point,
  target:number,tolerance:number,clustering:number):CrossSection {
  const tangent:Point=[-normal[1],normal[0]];
  const dot=(p:Point,d:Point)=>p[0]*d[0]+p[1]*d[1];
  const us=boundary.map(p=>dot(p,normal)),vs=boundary.map(p=>dot(p,tangent));
  const u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);
  const spread=(100-clustering)/100;
  const world=(u:number,v:number):Point=>[normal[0]*u+tangent[0]*v,normal[1]*u+tangent[1]*v];
  let lo=0,hi=1,best:CrossSection|undefined,error=Infinity;
  for(let step=0;step<55;step++){
    const f=(lo+hi)/2;
    const line:Ring=[world(u0-1,v0-1)];
    for(let i=0;i<=40;i++){
      const t=i/40;
      const wave=Math.sin(2*Math.PI*(1+spread)*t);
      // This pair of power curves always stays ordered at adjacent cuts.
      const exponent=1+5*spread*Math.abs(wave);
      const g=wave>=0?1-(1-f)**exponent:f**exponent;
      line.push(world(u0+(u1-u0)*g,v0+(v1-v0)*t));
    }
    line.push(world(u0-1,v1+1));
    const mask=new api.CrossSection([line]),piece=region.intersect(mask);
    mask.delete();
    const area=piece.area(),delta=Math.abs(area-target);
    if(delta<error){best?.delete();best=piece;error=delta;}else piece.delete();
    if(error<tolerance*.04)break;
    if(area<target)lo=f;else hi=f;
  }
  if(!best)throw Error('The clustering sweep could not resolve the requested area.');
  return best;
}
