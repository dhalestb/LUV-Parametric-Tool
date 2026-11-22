import type {V4Context} from './evaluateV4';
import type {RegionReconstruction} from './architecturalRegions';
import type {Vec3} from './geometry';
const COLORS=['#D6AD4F','#43A9CF','#A0C77B','#CB88AB','#AE9FDA','#E0A176','#7EC6B9'];
export function regionDiagnosticSvg(ctx:V4Context,result:RegionReconstruction,options:{old?:boolean;levelId?:number;isometric?:boolean;showSamples?:boolean;showWalkEdges?:boolean}={}){
  const {network,field,mesh}=ctx;
  const regions=options.old?network.regions:result.regions;
  const project=(p:Vec3)=>options.isometric?[p[0]-p[1],(p[0]+p[1])*.45-p[2]]:[p[0],-p[1]];
  const corners:Vec3[]=[];for(const x of [mesh.bounds.min[0],mesh.bounds.max[0]])for(const y of [mesh.bounds.min[1],mesh.bounds.max[1]])for(const z of [mesh.bounds.min[2],mesh.bounds.max[2]])corners.push([x,y,z]);
  const projected=corners.map(project),minX=Math.min(...projected.map(p=>p[0])),maxX=Math.max(...projected.map(p=>p[0])),minY=Math.min(...projected.map(p=>p[1])),maxY=Math.max(...projected.map(p=>p[1]));
  const scale=Math.min(570/Math.max(1,maxX-minX),400/Math.max(1,maxY-minY));
  const map=(p:Vec3)=>{const q=project(p);return `${(30+(q[0]-minX)*scale).toFixed(2)},${(55+(q[1]-minY)*scale).toFixed(2)}`;};
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="510" viewBox="0 0 640 510"><rect width="640" height="510" fill="#101820"/><g font-family="Arial" fill="white"><text x="20" y="25" font-size="15">${escape(options.old?'Original walk components':'Phase 2 architectural regions')}</text><text x="20" y="45" font-size="11">${regions.length} regions; ${options.old?result.originalRegionEdges:result.movementConnections.filter(c=>c.status==='verified').length} verified movement connections</text></g>`;
  const level=field.levels.find(l=>l.id===options.levelId);
  for(const t of mesh.triangles){if(level&&!options.isometric&&(Math.max(t.a[2],t.b[2],t.c[2])<level.elevation-.2||Math.min(t.a[2],t.b[2],t.c[2])>level.elevation+8))continue;out+=`<path d="M${map(t.a)} L${map(t.b)} L${map(t.c)} Z" fill="none" stroke="#c2c6c9" stroke-opacity=".09" stroke-width=".6"/>`;}
  const cellMap=new Map<string,number>();
  const regionOf=(id:number)=>options.old?network.nodes[id].regionId:result.nodeRegionIds[id];
  for(const n of network.nodes){const s=field.samples[n.sampleId];cellMap.set(`${n.levelId}:${s.ix}:${s.iy}:${Math.round(n.position[2]*10)}`,regionOf(n.id));}
  for(const n of network.nodes){if(options.levelId!==undefined&&n.levelId!==options.levelId)continue;const id=regionOf(n.id);if(id<0)continue;const [x,y,z]=n.position,h=field.sampleFeet/2,s=field.samples[n.sampleId],color=COLORS[id%COLORS.length];
    const points:Vec3[]=[[x-h,y-h,z+.04],[x+h,y-h,z+.04],[x+h,y+h,z+.04],[x-h,y+h,z+.04]];
    out+=`<polygon points="${points.map(map).join(' ')}" fill="${color}" fill-opacity=".18"/>`;
    for(const [dx,dy,a,b]of [[0,-1,0,1],[1,0,1,2],[0,1,2,3],[-1,0,3,0]]){
      if(cellMap.get(`${n.levelId}:${s.ix+dx}:${s.iy+dy}:${Math.round(z*10)}`)===id)continue;
      out+=`<path d="M${map(points[a])} L${map(points[b])}" fill="none" stroke="${color}" stroke-width="1.2"/>`;
    }
    if(options.showSamples)out+=`<circle cx="${map([x,y,z]).split(',')[0]}" cy="${map([x,y,z]).split(',')[1]}" r="1" fill="#fff"/>`;
  }
  if(options.showWalkEdges)for(const e of network.edges){const a=network.nodes[e.a],b=network.nodes[e.b];if(options.levelId!==undefined&&a.levelId!==options.levelId&&b.levelId!==options.levelId)continue;out+=`<path d="M${map(a.position)} L${map(b.position)}" stroke="#ddd" stroke-opacity=".15" fill="none"/>`;}
  if(!options.old)for(const c of [...result.organizationalRelationships.filter(c=>!c.navigable),...result.movementConnections]){
    const a=network.nodes[c.sampleNodePairs[0][0]],b=network.nodes[c.sampleNodePairs[0][1]];
    if(options.levelId!==undefined&&a.levelId!==options.levelId&&b.levelId!==options.levelId)continue;
    const points=c.chainNodeIds.length?c.chainNodeIds.map(id=>network.nodes[id].position):[a.position,b.position];
    out+=`<polyline points="${points.map(map).join(' ')}" fill="none" stroke="${c.navigable?'#FFD35B':c.status==='verified'?'#79D5EA':'#EF8392'}" stroke-width="2.5" ${c.navigable?'':'stroke-dasharray="4 3"'}/>`;
  }
  for(const r of regions){if(options.levelId!==undefined&&r.levelId!==options.levelId)continue;const prefix=!options.old&&'transitional' in r&&r.transitional?'T':'R';out+=`<text x="${map(r.centroid).split(',')[0]}" y="${map(r.centroid).split(',')[1]}" fill="white" stroke="#101820" stroke-width=".5" font-family="Arial" font-size="11">${prefix}${r.id}</text>`;}
  return out+'<text x="20" y="492" fill="#ddd" font-family="Arial" font-size="10">Gold: sampled movement. Dashed cyan: shared wall only. Pink: inferred/unknown. Fill: 18%.</text></svg>';
}
