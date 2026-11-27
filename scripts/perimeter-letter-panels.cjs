const assert = require('node:assert/strict');

// The outermost real contour crossing at this bearing, in floor coordinates.
function crossing(nodes, angle) {
  const x = Math.cos(angle), y = Math.sin(angle);
  let best;
  for (const node of nodes) {
    const line = node.line;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const det = x * dy - y * dx;
      if (Math.abs(det) < 1e-9) continue;
      const t = (a.x * y - a.y * x) / det;
      const r = (a.x * dy - a.y * dx) / det;
      if (t < 0 || t > 1 || r <= 0 || (best && r <= best.r)) continue;
      best = { id: node.id, r, z: a.z + t * (b.z - a.z) };
    }
  }
  return best;
}

function panel(w, samples) {
  const points = [], faces = [];
  const width = samples.length;
  // Two inner facets meet at a ridge; thickness is measured toward the room.
  const rows = 2+7*(samples[0].chain.length-1);
  for (const interior of [false, true]) {
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < width; i++) {
        const {angle,chain}=samples[i];
        const k=Math.max(0,Math.min(chain.length-2,Math.floor((row-1)/7)));
        const low=chain[k],high=chain[k+1];
        const t = row === 0 ? 0 : (row-1-7*k)/7;
        const blend = t*t*(3-2*t);
        const terminal = high || low;
        const r = low.r + blend*(terminal.r-low.r);
        const crease = 1-Math.abs(2*i/(width-1)-1);
        const depth = interior ? .28 + .36*crease : 0;
        const z = row === 0 ? 0 : high ? low.z+t*(high.z-low.z) : low.z*(row/(rows-1));
        points.push((r-depth)*Math.cos(angle),(r-depth)*Math.sin(angle),z);
      }
    }
  }
  const sheet = width*rows;
  function quad(a,b,c,d){faces.push(a,b,c,a,c,d);}
  for(let j=0;j<rows-1;j++)for(let i=0;i<width-1;i++){
    const a=j*width+i,b=a+1;
    quad(a,b,b+width,a+width);quad(a+sheet,a+width+sheet,b+width+sheet,b+sheet);
  }
  for(let i=0;i<width-1;i++){
    const k=(rows-1)*width+i;
    quad(i,i+sheet,i+sheet+1,i+1);quad(k,k+1,k+1+sheet,k+sheet);
  }
  for(let j=0;j<rows-1;j++){
    const a=j*width,b=a+width-1;
    quad(a,a+width,a+width+sheet,a+sheet);quad(b,b+sheet,b+width+sheet,b+width);
  }
  const solid=new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(points),triVerts:new Uint32Array(faces)}));
  assert.equal(solid.status(),'NoError');assert(solid.volume()>0);
  return solid;
}
module.exports=function buildWalls(w,nodes,metrics,onPanel){
  const perimeter=nodes.filter(n=>Math.abs(n.p.rx)<15 && Math.abs(n.p.ry)<15);
  const low=perimeter.filter(n=>n.p.levelIndex===0), upper=perimeter.filter(n=>n.p.levelIndex===1);
  const tiers=Array.from({length:1+Math.max(...perimeter.map(n=>n.p.levelIndex))},(_,i)=>perimeter.filter(n=>n.p.levelIndex===i));
  const reached=new Set();
  const steps=720,turn=2*Math.PI, rays=[];
  let opens=0,rises=0,closedSlots=0;
  for(let i=0;i<steps;i++){
    const angle=i*turn/steps,chain=[];
    for(const tier of tiers){const hit=crossing(tier,angle),prev=chain.at(-1);
      if(!hit||(prev&&(hit.z<=prev.z||Math.abs(hit.r-prev.r)>3)))break;
      chain.push(hit);
    }
    rays.push({angle,chain});
  }
  // Close only short circumferential slots bracketed by compatible contours.
  // Work upward: never interpolate across an unsupported lower level.
  const limit=Math.min(2.5,low[0].p.scale*.12);
  for(let k=0;k<tiers.length;k++){
    const hits=rays.map((s,i)=>s.chain[k]?i:-1).filter(i=>i>=0);
    for(let h=0;h<hits.length;h++){
      const i=hits[h],j=hits[(h+1)%hits.length],span=(j-i+steps)%steps;
      if(span<2)continue;
      const a=rays[i].chain[k],b=rays[j].chain[k];
      if(Math.hypot(Math.max(a.r,b.r)*turn*span/steps,b.r-a.r)>limit||Math.abs(a.z-b.z)>limit)continue;
      const gap=Array.from({length:span-1},(_,n)=>rays[(i+n+1)%steps]);
      if(gap.some(s=>s.chain.length!==k))continue;
      gap.forEach((s,n)=>{const t=(n+1)/span;s.chain.push({id:t<.5?a.id:b.id,r:a.r+t*(b.r-a.r),z:a.z+t*(b.z-a.z)});});
      closedSlots++;
    }
  }
  // A lone narrow tongue above a broad wall is an opening, not a freestanding fin.
  // Trim only the unsupported upper reach; retain its real contour below.
  let trimmedFins=0;
  for(let k=tiers.length-1;k>=1;k--){
    const empty=rays.findIndex(s=>s.chain.length<=k);if(empty<0)continue;
    let arc=[];
    for(let n=1;n<=steps;n++){const s=rays[(empty+n)%steps];
      if(s.chain.length>k){arc.push(s);continue;}
      if(arc.length && arc.length*turn/steps*Math.max(...arc.map(v=>v.chain[k].r))<limit){
        for(const v of arc)v.chain.length=k;
        trimmedFins++;
      }
      arc=[];
    }
  }
  // Keep one wall across changes of source ID where the geometry continues.
  const compatible=(a,b)=>a.chain.length&&a.chain.length===b.chain.length&&a.chain.every((c,k)=>Math.abs(c.r-b.chain[k].r)<=limit&&Math.abs(c.z-b.chain[k].z)<=limit);
  const start=Math.max(0,rays.findIndex((s,i)=>!compatible(rays[(i+steps-1)%steps],s)));
  const runs=[];let prev;
  for(let n=0;n<steps;n++){const s=rays[(start+n)%steps];
    if(!s.chain.length){opens++;prev=null;continue;}
    if(s.chain.length>1)rises++;
    if(!prev||!compatible(prev,s))runs.push({samples:[]});
    runs.at(-1).samples.push(s);prev=s;
  }
  if(runs.length===1&&runs[0].samples.length===steps&&compatible(prev,rays[start])) {
    // A complete periodic wall is built as two half-shells with coincident seams.
    const samples=runs.pop().samples,half=steps/2;
    runs.push({samples:samples.slice(0,half+1)},{samples:[...samples.slice(half),samples[0]]});
  }
  const used=new Array(steps).fill(false);
  const walls=runs.filter(r=>r.samples.length>=3).map((run,i)=>{
    const solid=panel(w,run.samples);
    // A mesh interval needs two successive samples from the same source run.
    for(const s of run.samples.slice(0,-1))used[Math.round(s.angle*steps/(2*Math.PI))%steps]=true;
    const first=run.samples[0];
    reached.add(first.chain.length);
    onPanel?.('perimeter-'+i,solid,[...new Set(run.samples.flatMap(s=>s.chain.map(c=>c.id)))]);
    return solid;
  });
  if(metrics){
    let gap=0,longest=0;
    for(const hit of [...used,...used]){gap=hit?0:gap+1;longest=Math.max(gap,longest);}
    const radius=Math.max(...low.flatMap(n=>n.line.map(q=>Math.hypot(q.x,q.y))));
    Object.assign(metrics,{closedSlots,trimmedFins,slotLimitFeet:limit,baseCoverage:used.filter(Boolean).length/steps,maxGapFeet:Math.min(steps,longest)*2*Math.PI*radius/steps});
  }
  assert(reached.has(tiers.length),"No continuous letter-derived wall reaches the highest perimeter level.");
  const shell=w.Manifold.union(walls);
  assert.equal(shell.status(),'NoError');assert(rises>0,'No upper contours within reach of the lower perimeter.');
  console.log({lower:low.map(n=>n.id),upper:upper.map(n=>n.id),baseCoverage:(steps-opens)/steps,upperCoverage:rises/steps,panels:walls.length});
  return shell;
};
