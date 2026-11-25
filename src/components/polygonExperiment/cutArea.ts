import type {CrossSection, ManifoldToplevel} from 'manifold-3d';
import type {Point, Ring} from './territories';

// Both territory and descriptor-area allocation use this same swept half-plane.
export function cutArea(api: ManifoldToplevel, region: CrossSection, boundary: Ring,
  normal: Point, target: number, tolerance: number): CrossSection {
  const tangent: Point = [-normal[1],normal[0]];
  const dot = (p: Point, axis: Point) => p[0]*axis[0]+p[1]*axis[1];
  const dots = region.toPolygons().flat().map(p=>dot(p as Point,normal));
  let lo = Math.min(...dots)-1, hi = Math.max(...dots)+1;
  const margin = 4*Math.max(1,...boundary.map(p=>Math.hypot(p[0]-boundary[0][0],p[1]-boundary[0][1])));
  const lateral = boundary.map(p=>dot(p,tangent));
  const left = Math.min(...lateral)-margin, right = Math.max(...lateral)+margin, base = lo-margin;
  const point = (u:number,v:number):Point => [normal[0]*u+tangent[0]*v,normal[1]*u+tangent[1]*v];
  let best: CrossSection | undefined, error = Infinity;
  for(let i=0;i<60;i++) {
    const mid=(lo+hi)/2;
    const mask=new api.CrossSection([[point(base,left),point(mid,left),point(mid,right),point(base,right)]]);
    const clipped=region.intersect(mask);
    mask.delete();
    const measured=clipped.area(), difference=Math.abs(measured-target);
    if(difference<error) { best?.delete(); best=clipped; error=difference; }
    else clipped.delete();
    if(difference<tolerance*.05) break;
    if(measured<target) lo=mid; else hi=mid;
  }
  if(!best) throw Error('Area sweep could not measure the permitted polygon');
  return best;
}
