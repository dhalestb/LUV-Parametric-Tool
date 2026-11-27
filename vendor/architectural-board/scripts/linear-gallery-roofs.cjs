// Additional envelope components use the current transformed edge assignments.
module.exports=function finish({CS,source,layers,mid,add,trimSources,parts}){
 const vals=[...source.values()],dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
 const bySide=(level,side)=>vals.filter(p=>p.level===level&&p.side===side).sort((a,b)=>dot(a.edge[0],a.tangent)-dot(b.edge[0],b.tangent));
 const pt=(p,t,d)=>p.tangent.map((v,i)=>v*t+p.normal[i]*d);
 const strip=(p,a,b,out,inside)=>new CS([[pt(p,a,out),pt(p,b,out),pt(p,b,inside),pt(p,a,inside)]],'NonZero');
 const thickness=.25;
 const registered=(kind,plan,lo,hi,p,q,info={})=>{
  if(hi-lo<1e-6||plan.isEmpty())return;
  const body=trimSources(plan.extrude(hi-lo).translate([0,0,lo]));
  return add(kind,body,p,q,{zone:p.zone,bottom:lo,top:hi,...info});
 };
 for(const zone of ['lower','upper']){
  const band=layers.filter(l=>l.zone===zone),base=zone==='upper'?mid:0;
  const first=band[0],last=band.at(-1),plankLevel=zone==='lower'?last:band.at(-2)??first;
  const height=zone==='lower'?mid:plankLevel.reference.nominal;
  const outline=[];
  for(let side=0;side<4;side++){
   const row=bySide(plankLevel.level,side);
   const finalRow=bySide(last.level,side);
   const cuts=[...new Set([...row,...finalRow].flatMap(p=>p.edge.map(v=>Math.round(dot(v,p.tangent)*1e6)/1e6)))].sort((a,b)=>a-b);
   for(let i=1;i<cuts.length;i++){
    const a=cuts[i-1],b=cuts[i],at=(a+b)/2;
    const active=[...row,...finalRow].filter(p=>dot(p.edge[0],p.tangent)<=at&&dot(p.edge[1],p.tangent)>=at);
    if(!active.length)continue;
    const p=active[0],face=Math.max(...active.map(s=>s.actualBoundary));outline.push(pt(p,a,face),pt(p,b,face));
   }
   for(const p of bySide(first.level,side)){
    const a=dot(p.edge[0],p.tangent),b=dot(p.edge[1],p.tangent);
    const plan=strip(p,a,b,p.actualBoundary,p.actualBoundary-thickness).intersect(p.solid.slice(p.bottom+.001));
    registered('base-wall',plan,base,p.bottom,p,p);
   }
   if(zone==='upper')for(const p of finalRow){
    if(!parts.some(c=>c.record.kind==='wall'&&c.sources[1]===p.id))continue;
    // Intersect the letter with the width of its wall-bearing stroke at midspan.
    const a=dot(p.edge[0],p.tangent),b=dot(p.edge[1],p.tangent),center=(a+b)/2;
    const section=p.solid.slice(p.bottom+.001),probe=strip(p,center-.01,center+.01,p.actualBoundary,p.actualBoundary-10).intersect(section);
    const loops=probe.decompose().sort((a,b)=>b.bounds().max[0]-a.bounds().max[0]);
    if(!loops.length)continue;
    const near=loops.sort((a,b)=>Math.max(...b.toPolygons().flat().map(v=>dot(v,p.normal)))-Math.max(...a.toPolygons().flat().map(v=>dot(v,p.normal))))[0];
    const inner=Math.min(...near.toPolygons().flat().map(v=>dot(v,p.normal)));
    registered('edge-column',strip(p,a,b,p.actualBoundary,inner).intersect(section),height,p.bottom,p,p,{innerFace:inner});
   }
   for(const [rank,l] of band.entries()){
    if(rank%3===0&&band.length>2||l===last)continue;
    const row=bySide(l.level,side);
    for(let j=1;j<row.length;j++){
     const left=row[j-1],right=row[j],p=left.actualBoundary>right.actualBoundary?left:right,q=p===left?right:left;
     if(p.actualBoundary-q.actualBoundary<.25)continue;
     const end=p===left?dot(p.edge[1],p.tangent):dot(p.edge[0],p.tangent);
     const a=p===left?end-thickness:end,b=a+thickness;
     const plan=strip(p,a,b,p.actualBoundary,q.actualBoundary).intersect(p.solid.slice(p.top-.001));
     const next=bySide(band[rank+1].level,side).filter(s=>dot(s.edge[0],s.tangent)<=end+.01&&dot(s.edge[1],s.tangent)>=end-.01);
     if(next.length)registered('daylight-return',plan,p.top,p.top+.65*(Math.min(...next.map(s=>s.bottom))-p.top),p,q);
    }
   }
  }
  const row=bySide(plankLevel.level,0);
  registered('roof-plank',new CS([outline],'NonZero').simplify(.00001),height-thickness,height,row[0],row.at(-1),{outline});
 }
};
