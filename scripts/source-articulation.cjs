// Measure bays on the actual stepped solid at the elevation of each candidate.
function articulate(M, primary, nodes, edges, degree, field, elevationMode) {
  const operations = [], tools = [], skipped = [], projections=[];
  let final = primary;
  for (const edge of degree ? edges : []) {
    for (const [index, segment, anchor, tangent] of [
      [edge.i, edge.k, edge.q, edge.u], [edge.j, edge.l, edge.s, edge.v]
    ]) {
      const node = nodes[index], sources = [nodes[edge.i].id, nodes[edge.j].id];
      const axis = Math.abs(tangent.x) >= Math.abs(tangent.y) ? 1 : 0;
      const cross = 1 - axis, coords = anchor.toArray();
      // Project the feature normal onto the dominant face of the terraced bank.
      const sign = coords[axis] >= [node.p.x,node.p.y][axis] ? 1 : -1;
      const point = (along, across, z) => axis === 0 ? [sign*along,across,z] : [across,sign*along,z];
      const center = Math.round(coords[cross]*4)/4 + .0625;
      const floor = Math.max(.625, Math.floor(elevationMode==='feature'?Math.max(anchor.z*.19,Math.min(anchor.z, (edge.q.z+edge.s.z)/2)*.70-node.p.scale*.70):anchor.z*.19)+.125);
      const ray = (solid, across, z) => solid.rayCast(point(80,across,z),point(-80,across,z))
        .map(hit=>sign*hit.position[axis]);
      const hits = ray(final,center,floor+.25);
      const bayIndex = hits.findIndex((a,i)=>i%2===0 && a>=sign*coords[axis] && hits[i+1]<=sign*coords[axis]);
      if (bayIndex<0) continue;
      const face=hits[bayIndex], rear=hits[bayIndex+1], bay=face-rear;
      const width=Math.min(node.p.scale*.45,bay*.75)*(0.65+degree*.35);
      const height=Math.min(node.p.scale*.55,anchor.z*.33)*(0.65+degree*.35);
      const through=node.p.letter==='V' && Math.abs(edge.u.dot(edge.v))<.94;
      const depth=through?bay:bay*(.15+.20*degree);
      if(width<2 || height<2 || depth<1) continue;
      const chords=[-.49,-.32,0,.32,.49].map(t=>ray(final,center+t*width,floor+height*.4));
      const front=through?Math.max(face,...chords.map(chord=>chord[bayIndex]??face))+.85:face+.75;
      const end=through?Math.min(rear,...chords.map(chord=>chord[bayIndex+1]??rear))-.85:face-depth;
      // Section of the source boundary: curved soffit, folded soffit or planar lintel.
      const curve=node.p.letter==='U', fold=node.p.letter==='V';
      const profile=[[-.5,0],[.5,0]];
      for(let k=0;k<=(curve?8:2);k++){
        const t=k/(curve?8:2);
        profile.push([.5-t,curve?.65+.35*Math.sin(Math.PI*t):fold?1-.5*Math.abs(2*t-1):1]);
      }
      const cutter=M.hull([end,front].flatMap(d=>profile.map(([x,z])=>point(d,center+x*width,floor+z*height))));
      const candidate=final.subtract(cutter), removed=final.volume()-candidate.volume();
      const probe=(a,b,c)=>candidate.rayCast(a,b).length===c;
      const mid=floor+height*.4;
      // Verify approach, backing or second exit, and overhead material across the mouth.
      const clear=[-.32,0,.32].every(t=>{
        const y=center+t*width;
        const clearEnd=through?end-.01:end+.12;
        return probe(point(front+.01,y,mid),point(clearEnd,y,mid),0)
          && (through || probe(point(end+.12,y,mid),point(end-.38,y,mid),1))
          && candidate.rayCast(point(face-depth*.45,y,mid),point(face-depth*.45,y,80)).length>=2;
      });
      if(!clear || removed<1 || candidate.status()!=='NoError' || candidate.decompose().length!==1 ||
        tools.some(t=>t.solid.intersect(cutter).volume()>.000001)){
        skipped.push({source:node.id,segment,reason:'Clearance, backing, roof, overlap or connectivity check'});continue;
      }
      const id='bay-'+(operations.length+1);
      operations.push({id,sources,feature:node.id+' contour segment '+segment,kind:through?'through opening':'backed pocket',profile:curve?'curved':fold?'folded':'planar',width,height,depth,bayDepth:bay,ratio:depth/bay,removed,backed:!through,center:point(face,center,mid),alcove:!through&&width>=3&&depth>=3&&height*(curve?.65:fold?.5:1)>=6.67});
      tools.push({id,solid:cutter,removed,verify:solid=>[-.32,0,.32].every(t=>{const y=center+t*width;return solid.rayCast(point(front+.01,y,mid),point(through?end-.01:end+.12,y,mid)).length===0 && (through||solid.rayCast(point(end+.12,y,mid),point(end-.38,y,mid)).length===1);})});final=candidate;
      // Project a lintel from the roof only on a bay facing the open field edge.
      // Reject an interior court or another wall beyond the mouth.
      const lintelFloor=floor+height+.25;
      const fieldLimit=(axis===0?field.width:field.depth)/2;
      const extension=Math.min(width*.50*degree,depth*.32*degree,(fieldLimit-face)*.85);
      if(extension>.5 && face+extension<fieldLimit && hits[0]===face &&
         [-.4,0,.4].every(t=>primary.rayCast(point(face+.01,center+t*width,mid),point(80,center+t*width,mid)).length===0)){
        const corners=[face-1.5,face+extension].flatMap(d=>[-.52,.52].flatMap(t=>
          [lintelFloor,lintelFloor+.75].map(z=>point(d,center+t*width,z))));
        const canopy=M.hull(corners),bearing=canopy.intersect(final).volume(),grown=final.add(canopy);
        const added=grown.volume()-final.volume();
        if(bearing>.5 && added>.5 && grown.status()==='NoError' && grown.decompose().length===1 &&
           tools.every(t=>t.solid.intersect(canopy).volume()<1e-8)){
           projections.push({id:id+'-lintel',elevation:lintelFloor,sources,solid:canopy,added,extension});final=grown;
        }
      }
    }
  }
  // Recheck each approved void against the final solid.
  for(const tool of tools)if(!tool.verify(final)||final.intersect(tool.solid).volume()>1e-8)throw Error('Obstructed '+tool.id);
  return {solid:final,tools,projections,report:{degree,before:primary.volume(),after:final.volume(),removed:tools.reduce((sum,t)=>sum+t.removed,0),added:projections.reduce((sum,p)=>sum+p.added,0),projections:projections.map(({id,sources,added,extension,elevation})=>({id,sources,added,extension,elevation})),operations,skipped,components:final.decompose().length,overhangs:operations.length,addedProjections:projections.length}};
}
module.exports={articulate};
