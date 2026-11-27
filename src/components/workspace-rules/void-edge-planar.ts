import type { Pt } from './contracts';

/** Close a counterclockwise plate arc with an inner edge offset in plan. */
export function thickenWallArc(arc: Pt[], thickness: number): Pt[] {
  const normals=arc.slice(1).map(([x,y],index):Pt=>{
    const [ax,ay]=arc[index],dx=x-ax,dy=y-ay,length=Math.hypot(dx,dy);
    if(length<=1e-8)throw Error('The outer wall edge folds over. Adjust the plate U guides.');
    return [-dy/length,dx/length];
  });
  const inner=arc.map(([x,y],index):Pt=>{
    const a=normals[Math.max(0,index-1)],b=normals[Math.min(normals.length-1,index)];
    const corner=1+a[0]*b[0]+a[1]*b[1];
    if(corner<=1e-8)throw Error('The outer wall edge folds over. Adjust the plate U guides.');
    return [x+(a[0]+b[0])*thickness/corner,y+(a[1]+b[1])*thickness/corner];
  });
  for(let i=1;i<arc.length;i++){
    const dx=arc[i][0]-arc[i-1][0],dy=arc[i][1]-arc[i-1][1];
    const ix=inner[i][0]-inner[i-1][0],iy=inner[i][1]-inner[i-1][1];
    if(dx*ix+dy*iy<=0)throw Error('Outer wall thickness is too large for the U edge. Reduce the thickness or enlarge the plate guides.');
  }
  return [...arc,...inner.reverse()];
}

export function halfPlane(poly: Pt[], nx: number, ny: number, limit: number, keepBelow: boolean): Pt[] {
  if (poly.length < 3) return [];
  const side = (p: Pt) => nx * p[0] + ny * p[1];
  const inside = (p: Pt) => keepBelow ? side(p) <= limit + 1e-7 : side(p) >= limit - 1e-7;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
    const cin = inside(cur), pin = inside(prev);
    if (cin !== pin) {
      const sa = side(prev), sb = side(cur), t = (limit - sa) / ((sb - sa) || 1e-12);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (cin) out.push(cur);
  }
  return out;
}

/** Clip a polygon to a convex counterclockwise footprint. */
export function intersectFootprints(subject: Pt[], clip: Pt[]): Pt[] {
  let poly = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const nx = a[1] - b[1], ny = b[0] - a[0];
    poly = halfPlane(poly, nx, ny, nx * a[0] + ny * a[1], false);
    if (poly.length < 3) return [];
  }
  return poly;
}
