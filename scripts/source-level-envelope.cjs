// Each contour develops within its own elevation range. Bridges connect actual feature pairs.
function levelEnvelope(M,nodes,edges,field,preferred) {
  const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
  const bands=[];
  for(const [index,node] of nodes.entries()){
    const neighbors=edges.filter(e=>e.i===index||e.j===index).map(e=>nodes[e.i===index?e.j:e.i]);
    const radius=Math.min(preferred*.23,Math.max(2,(node.p.scale+neighbors.reduce((s,n)=>s+n.p.scale,0)/neighbors.length)*.10));
    const cells=[],pitch=.5;
    for(let iy=0;iy<field.depth/pitch;iy++){
      const y=-field.depth/2+(iy+.5)*pitch;
      for(let ix=0;ix<field.width/pitch;ix++){
        const x=-field.width/2+(ix+.5)*pitch;
        let bottom=Infinity,top=-Infinity;
        for(let k=1;k<node.line.length;k++){
          const a=node.line[k-1],b=node.line[k],dx=b.x-a.x,dy=b.y-a.y;
          const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
          const distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
          if(distance>=radius)continue;
          const z=a.z+(b.z-a.z)*t,step=Math.floor((1-distance/radius)*3);
          bottom=Math.min(bottom,Math.max(0,Math.floor((z-3)/.5)*.5));
          top=Math.max(top,Math.min(field.height,Math.floor((z+1.5+step*1.5)/.5)*.5));
        }
        if(top>bottom)cells.push(M.cube([pitch,pitch,top-bottom]).translate([x-pitch/2,y-pitch/2,bottom]));
      }
    }
    const solid=M.union(cells);
    bands.push({id:'contour-'+node.id,owner:node.id,sources:[node.id,...neighbors.map(n=>n.id)],solid});
  }
  for(const edge of edges){
    const q=edge.q.toArray(),s=edge.s.toArray();
    const supports=[q,s].map(p=>M.cube([3,3,4],true).translate(p));
    bands.push({id:'transition-'+(bands.length+1),sources:[nodes[edge.i].id,nodes[edge.j].id],solid:M.hull(supports).intersect(clip)});
  }
  return bands;
}
function contributionReport(solid,bands,nodes){
  const mesh=solid.getMesh(),p=mesh.vertProperties,ix=mesh.triVerts,areas=new Map(bands.filter(b=>b.owner).map(b=>[b.owner,0]));
  for(let i=0;i<ix.length;i+=3){
    const a=Array.from(p.slice(ix[i]*3,ix[i]*3+3)),b=Array.from(p.slice(ix[i+1]*3,ix[i+1]*3+3)),c=Array.from(p.slice(ix[i+2]*3,ix[i+2]*3+3));
    const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    if(!length)continue;
    const center=a.map((v,k)=>(v+b[k]+c[k])/3),start=center.map((v,k)=>v+n[k]/length*.02),end=center.map((v,k)=>v-n[k]/length*.02);
    for(const band of bands.filter(b=>b.owner))if(band.solid.rayCast(start,end).length)areas.set(band.owner,areas.get(band.owner)+length/2);
  }
  return nodes.map(n=>({letter:n.id,sourceCenterZ:n.p.z,exposedArea:areas.get(n.id),component:'contour-'+n.id,relationships:bands.filter(b=>b.sources.includes(n.id)).map(b=>b.id)}));
}
module.exports={levelEnvelope,contributionReport};

