const EPS = 0.0001;
const round = (n) => Number(n.toFixed(4));
const signedArea = (p) => p.reduce((s,a,i) => {
  const b = p[(i+1)%p.length];
  return s+a[0]*b[1]-b[0]*a[1];
},0)/2;
function clipZ(points,z,above) {
  const result=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length];
    const inside=p=>above?p[2]>=z:p[2]<=z;
    if(inside(a)) result.push(a);
    if(inside(a)!==inside(b)) {
      const t=(z-a[2])/(b[2]-a[2]);
      result.push(a.map((v,k)=>v+t*(b[k]-v)));
    }
  }
  return result;
}
function rectangle(x,y,size) {
  const h=size/2;
  return [[x-h,y-h],[x+h,y-h],[x+h,y+h],[x-h,y+h]];
}
// Positive winding makes overlaps a union, even with opposite OBJ face winding.
function section(C,polys) {
  const loops=polys.filter(p=>p.length>=3&&Math.abs(signedArea(p))>1e-10)
    .map(p=>signedArea(p)<0?p.slice().reverse():p);
  return loops.length?new C(loops,'NonZero'):C.square([0,0]);
}
function projectedBlockers(C,triangles,z,height,bufferWalls=false) {
  const polygons=[];
  for(const t of triangles) {
    const sliced=clipZ(clipZ([t.a,t.b,t.c],z+EPS,true),z+height-EPS,false);
    const xy=sliced.map(p=>p.slice(0,2));
    if(Math.abs(signedArea(xy))>1e-10) {polygons.push(xy);continue;}
    if(!bufferWalls||xy.length<2)continue;
    // A zero-thickness wall has no area but can interrupt clear width.
    for(let i=0;i<xy.length;i++){
      const a=xy[i],b=xy[(i+1)%xy.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);
      if(l<EPS)continue;
      const ox=-dy/l*.001,oy=dx/l*.001;
      polygons.push([[a[0]+ox,a[1]+oy],[b[0]+ox,b[1]+oy],[b[0]-ox,b[1]-oy],[a[0]-ox,a[1]-oy]]);
    }
  }
  return section(C,polygons);
}
function diameter(space) {
  if(space.area()<EPS)return 0;
  const b=space.bounds(); let lo=0,hi=Math.min(b.max[0]-b.min[0],b.max[1]-b.min[1])/2;
  for(let i=0;i<16;i++){const mid=(lo+hi)/2,tmp=space.offset(-mid,'Round',2,128);
    if(tmp.area()>EPS)lo=mid;else hi=mid;tmp.delete();}
  return Math.floor(lo*200)/100;
}
function measure(C,ctx,r,base) {
  const z=r.centroid[2], triangles=ctx.mesh.triangles;
  const local=triangles.filter(t=>Math.max(...[t.a,t.b,t.c].map(p=>p[2]))>=z-EPS);
  const floor=section(C,local.filter(t=>[t.a,t.b,t.c].every(p=>Math.abs(p[2]-z)<EPS))
    .map(t=>[t.a,t.b,t.c].map(p=>p.slice(0,2))));
  const mask=section(C,base.boundaryCells.map(([x,y])=>rectangle(x,y,ctx.field.sampleFeet)));
  const footprint=floor.intersect(mask);
  const support=footprint.area();
  const clearAt=(h)=>{const block=projectedBlockers(C,local,z,h);const clear=footprint.subtract(block);block.delete();return clear;};
  const clear7=clearAt(7),sky=clearAt(ctx.mesh.bounds.max[2]-z+1);
  const walls=projectedBlockers(C,local,z,7,true),walking=footprint.subtract(walls);
  const samples=r.sampleIds.map(id=>ctx.field.samples[id]);
  const bounded=samples.filter(s=>s.clearance!==null).sort((a,b)=>a.clearance-b.clearance);
  const minimum=bounded[0],median=bounded.length?bounded[Math.floor(bounded.length/2)].clearance:null;
  const sameMin=minimum?bounded.filter(s=>s.clearance<minimum.clearance+.01):[];
  const bands=[5,5.86,6,7,7.5].map(h=>{const clear=clearAt(h),area=clear.area();clear.delete();return {height:h,clearArea:round(area)};});
  const low=footprint.subtract(clear7), comps=walking.decompose(),bbox=footprint.bounds();
  const matchedPlanes=floor.decompose().map(part=>{const overlap=part.intersect(mask),n=overlap.area(),all=part.area();overlap.delete();part.delete();return {overlap:round(n),connectedCoplanarArea:round(all)};}).filter(p=>p.overlap>EPS);
  const result={region:r.id,z:round(z),cellArea:r.area,supportArea:round(support),clear7Area:round(clear7.area()),low7Area:round(low.area()),uncoveredArea:round(sky.area()),coveredArea:round(support-sky.area()),clear7CoveredArea:round(clear7.area()-sky.area()),maxClearDiskDiameterFt:diameter(walking),largestClear7Piece:round(Math.max(0,...comps.map(c=>c.area()))),extent:bbox,spans:bbox.max.map((v,i)=>round(v-bbox.min[i])),sourcePlaneComponents:matchedPlanes,clearanceBands:bands,minClear:minimum?round(minimum.clearance):null,medianBoundedClear:median===null?null:round(median),maxBoundedClear:bounded.length?round(bounded.at(-1).clearance):null,minimumSamples:sameMin.map(s=>({point:s.position.map(round),floorTriangle:s.triangleId,overheadTriangle:s.overheadTriangleId})),footprint:footprint.toPolygons(),low:low.toPolygons(),uncovered:sky.toPolygons(),centroid:r.centroid.map(round)};
  for(const p of [floor,mask,footprint,clear7,sky,walls,walking,low,...comps])p.delete();
  return result;
}
function verifyStrip(C,ctx,a,b) {
  const first=inspectSegment(ctx.grid,a,b);
  if(!first.pass)return first;
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const edge=(p,k)=>[p[0]-k*dy/length,p[1]+k*dx/length];
  const rect=section(C,[[edge(a,-1),edge(b,-1),edge(b,1),edge(a,1)]]);
  const bounds=rect.bounds(),lo=Math.min(a[2],b[2]),hi=Math.max(a[2],b[2]);
  const nearby=ctx.mesh.triangles.filter(t=>[0,1].every(k=>Math.min(t.a[k],t.b[k],t.c[k])<=bounds.max[k]&&Math.max(t.a[k],t.b[k],t.c[k])>=bounds.min[k]));
  const faces=nearby.filter(t=>Math.abs(t.normal[2])>=.68).map(t=>clipZ(clipZ([t.a,t.b,t.c],lo-EPS,true),hi+EPS,false).map(p=>p.slice(0,2)));
  const support=section(C,faces),missing=rect.subtract(support);
  const walls=projectedBlockers(C,nearby,hi,7,true),occupied=rect.intersect(walls);
  const gap=missing.area(),blocked=occupied.area();
  for(const poly of [occupied,walls,missing,support,rect])poly.delete();
  if(gap>1e-5)return {pass:false,reason:'Projected strip has unsupported floor',missingFt2:round(gap)};
  if(blocked>1e-5)return {pass:false,reason:'Source geometry intrudes into strip',blockedFt2:round(blocked)};
  return {...first,sourceFloorTriangles:nearby.filter(t=>Math.abs(t.normal[2])>=.68&&Math.min(t.a[2],t.b[2],t.c[2])<=hi+EPS&&Math.max(t.a[2],t.b[2],t.c[2])>=lo-EPS).map(t=>t.id),reason:'Continuous two-foot local strip with source support and checked headroom'};
}
function inspectSegment(grid,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),n=Math.max(1,Math.ceil(length/.125));
  if(length<EPS)return {pass:false,reason:'No horizontal run'};
  let minHead=Infinity,maxRise=0;
  for(const offset of [-1,-.75,-.5,-.25,0,.25,.5,.75,1]){
    let previous=null;
    for(let i=0;i<=n;i++){
      const t=i/n,x=a[0]+dx*t-offset*dy/length,y=a[1]+dy*t+offset*dx/length,want=a[2]+(b[2]-a[2])*t;
      const hits=grid.verticalIntersections(x,y);
      const h=hits.filter(p=>Math.abs(p.normalZ)>=.68&&p.z>=Math.min(a[2],b[2])-.13&&p.z<=Math.max(a[2],b[2])+.13)
        .sort((u,v)=>Math.abs(u.z-want)-Math.abs(v.z-want))[0];
      const fail=(reason)=>({pass:false,reason,location:[x,y,h?.z??want].map(round)});
      if(!h)return fail('Width probe loses floor support');
      const over=hits.find(p=>p.z>h.z+EPS);
      if(over){minHead=Math.min(minHead,over.z-h.z);if(over.z-h.z<7-EPS)return fail('Clear height below 7 ft');}
      if(previous){
        const rise=Math.abs(h.z-previous[2]);maxRise=Math.max(maxRise,rise);
        if(rise>.8+EPS)return fail('Rise exceeds graph step limit');
        for(const height of [.15,1.5,3,5.5,6.95]){
          const z=Math.max(previous[2],h.z)+height;
          if(!grid.segmentClear([previous[0],previous[1],z],[x,y,z]))return fail('Source face blocks cross-section');
        }
      }
      previous=[x,y,h.z];
    }
  }
  return {pass:true,reason:'Two-foot local strip passes sampled support and seven-foot headroom checks',minHead:Number.isFinite(minHead)?round(minHead):null,maxRise:round(maxRise)};
}
function elevationGaps(triangles,from,to){
  const intervals=triangles.filter(t=>Math.abs(t.normal[2])>=.68).map(t=>[Math.min(t.a[2],t.b[2],t.c[2]),Math.max(t.a[2],t.b[2],t.c[2])]).sort((a,b)=>a[0]-b[0]);
  let end=from;const gaps=[];
  for(const [lo,hi] of intervals){if(hi<=from||lo>to+EPS)continue;if(lo-end>.8+EPS)gaps.push([round(end),round(lo)]);end=Math.max(end,hi);}
  if(to-end>.8+EPS)gaps.push([round(end),round(to)]);return gaps;
}
module.exports={round,measure,inspectSegment,verifyStrip,elevationGaps,section,clipZ};
