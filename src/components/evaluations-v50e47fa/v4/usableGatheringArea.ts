import type { ManifoldToplevel, Vec2 } from 'manifold-3d';
import type { AnalysisTriangle, Vec3 } from './geometry';

const EPS = 1e-4;
export const USABLE_HEADROOM_FT = 7;
type Sample = {position: Vec3; triangleId: number};
function signed(poly:Vec2[]) {
    return poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-p[1]*q[0];},0)/2;
}
function clip(points:Vec3[],height:number,above:boolean) {
    const result:Vec3[]=[];
    for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        const inside=above?a[2]>=height:a[2]<=height;
        if(inside)result.push(a);
        if(inside!==(above?b[2]>=height:b[2]<=height)){
            const t=(height-a[2])/(b[2]-a[2]);
            result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),height]);
        }
    }
    return result;
}

// A shared edge of positive length in 3D joins pieces on different support
// planes. Point contacts and overlapping plan projections do not establish continuity.
function sharesEdge(a:Vec3,b:Vec3,c:Vec3,d:Vec3) {
    const v=b.map((n,i)=>n-a[i]),len=Math.hypot(...v);
    if(len<=EPS)return false;
    const project=(p:Vec3)=>v.reduce((sum,n,i)=>sum+n*(p[i]-a[i]),0)/len;
    const u=project(c),w=project(d);
    if(Math.min(len,Math.max(u,w))-Math.max(0,Math.min(u,w))<=EPS)return false;
    return [[c,u],[d,w]].every(pair=>{
        const [p,t]=pair as [Vec3,number];
        return Math.hypot(...p.map((n,i)=>n-a[i]-v[i]*t/len))<EPS;
    });
}

/** Plan area within the sampled boundary, clipped against source faces on each
 * support plane. Separate planar pieces contribute to floor area individually. */
export function usableGatheringArea(lib:ManifoldToplevel,mesh:AnalysisTriangle[],samples:Sample[],pitch:number) {
    const C=lib.CrossSection;
    function union(polys:Vec2[][]){
        const contours=polys.filter(p=>Math.abs(signed(p))>1e-10).map(p=>signed(p)<0?p.reverse():p);
        return contours.length?new C(contours,'NonZero'):C.square([0,0]);
    }
    const planes=new Map<string,{sx:number;sy:number;z:number;cells:Vec2[][]}>();
    for(const s of samples){
        const t=mesh[s.triangleId];
        if(!t || Math.abs(t.normal[2])<EPS)continue;
        const sx=-t.normal[0]/t.normal[2],sy=-t.normal[1]/t.normal[2],z=t.a[2]-sx*t.a[0]-sy*t.a[1];
        const key=[sx,sy,z].map(n=>Math.round(n*1e6)).join(',');
        let plane=planes.get(key);
        if(!plane){plane={sx,sy,z,cells:[]};planes.set(key,plane);}
        const [x,y]=s.position,h=pitch/2;
        plane.cells.push([[x-h,y-h],[x+h,y-h],[x+h,y+h],[x-h,y+h]]);
    }
    const parts:{area:number;triangles:number[];edges:[Vec3,Vec3][];plane:number}[]=[];
    let planeIndex=0;
    for(const {sx,sy,z,cells} of planes.values()){
        planeIndex++;
        const mask=union(cells),box=mask.bounds();
        const support:Vec2[][]=[],obstructions:Vec2[][]=[];
        for(const t of mesh){
            if([0,1].some(k=>Math.max(t.a[k],t.b[k],t.c[k])<box.min[k] || Math.min(t.a[k],t.b[k],t.c[k])>box.max[k]))continue;
            const verts:Vec3[]=[t.a,t.b,t.c].map(([x,y,h])=>[x,y,h-(sx*x+sy*y+z)]);
            if(verts.every(p=>Math.abs(p[2])<=EPS)){
                support.push(verts.map(([x,y])=>[x,y]));
                continue;
            }
            const cut:Vec2[]=clip(clip(verts,EPS,true),USABLE_HEADROOM_FT-EPS,false).map(([x,y])=>[x,y]);
            if(Math.abs(signed(cut))>1e-10){obstructions.push(cut);continue;}
            // A thin modeled partition can divide a gathering area even with zero plan area.
            for(let i=0;i<cut.length;i++){
                const [x,y]=cut[i],[u,v]=cut[(i+1)%cut.length],len=Math.hypot(u-x,v-y);
                if(len<EPS)continue;
                const dx=-(v-y)*.001/len,dy=(u-x)*.001/len;
                obstructions.push([[x+dx,y+dy],[u+dx,v+dy],[u-dx,v-dy],[x-dx,y-dy]]);
            }
        }
        const source=union(support),blocked=union(obstructions),footprint=source.intersect(mask),usable=footprint.subtract(blocked);
        for(const part of usable.decompose()){
            const area=part.area();
            if(area>EPS){
                const contours=part.toPolygons(),points=contours.flat();
                const triangles=lib.triangulate(contours).flatMap(face=>face.flatMap(i=>{
                    const [x,y]=points[i];return [x,y,sx*x+sy*y+z+.03];
                }));
                const edges:[Vec3,Vec3][]=[];
                for(const loop of contours){
                    const ring:Vec3[]=loop.map(([x,y])=>[x,y,sx*x+sy*y+z]);
                    ring.forEach((p,i)=>edges.push([p,ring[(i+1)%ring.length]]));
                }
                parts.push({area,triangles,edges,plane:planeIndex});
            }
            part.delete();
        }
        for(const section of [mask,source,blocked,footprint,usable])section.delete();
    }
    const groups=parts.map((_,i)=>i);
    const group=(i:number):number=>groups[i]===i?i:(groups[i]=group(groups[i]));
    for(let i=0;i<parts.length;i++)for(let j=0;j<i;j++){
        const a=parts[i],b=parts[j];
        if(a.plane!==b.plane && group(i)!==group(j) && a.edges.some(([p,q])=>b.edges.some(([r,s])=>sharesEdge(p,q,r,s))))groups[group(i)]=group(j);
    }
    const pieces=new Map<number,{area:number;triangles:number[]}>();
    parts.forEach((p,i)=>{
        const id=group(i),piece=pieces.get(id)??{area:0,triangles:[]};
        piece.area+=p.area;piece.triangles=piece.triangles.concat(p.triangles);
        pieces.set(id,piece);
    });
    const largest=[...pieces.values()].sort((a,b)=>b.area-a.area)[0];
    return {area:largest?.area??0,total:parts.reduce((sum,p)=>sum+p.area,0),triangles:largest?.triangles??[]};
}
