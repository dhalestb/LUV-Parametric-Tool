// Source coordinates are Composition-local, centered in all axes. The viewer uses floor Z=0.
const fs=require('node:fs'),path=require('node:path'),T=require('three');
require('../proof/rule-amphitheater.cjs'); // registers the project's TypeScript glyph loader
const {getLetterShape,getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const v=(x,y,z)=>new T.Vector3(x,y,z),distance=(a,b)=>a.distanceTo(b);
function derive(r){
 const letters=[],nodes=r.source.map((p,i)=>{
 const matrix=new T.Matrix4().compose(v(p.x,p.y,p.z+r.field.height/2),new T.Quaternion().setFromEuler(new T.Euler(...[p.rx,p.ry,p.rz].map(T.MathUtils.degToRad))),v(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 const g=getLetterVolumeGeometry(p.letter,12),attr=g.getAttribute('position'),positions=[],indices=[];
 for(let k=0;k<attr.count;k++){const q=new T.Vector3().fromBufferAttribute(attr,k).applyMatrix4(matrix);if(Math.abs(q.x)>r.field.width/2||Math.abs(q.y)>r.field.depth/2||q.z<0||q.z>r.field.height)throw Error('Letter '+(i+1)+' extends outside the selected field. Edit its pose or enlarge the field.');positions.push(...q.toArray());}
 for(let k=0;k<(g.index?.count??attr.count);k++)indices.push(g.index?g.index.getX(k):k);
 const id=p.letter+'-'+(i+1);letters.push({id,mesh:{positions,indices}});
 const shape=getLetterShape(p.letter),raw=shape.getPoints(6),center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2());
 const line=raw.map(pt=>v(pt.x-center.x,pt.y-center.y,0).applyMatrix4(matrix));
 return {id,line,matrix:matrix.toArray(),p};
 });
 const pairs=[];
 for(let i=0;i<nodes.length;i++)for(let j=0;j<i;j++){
 let best;const a=nodes[i].line,b=nodes[j].line;
 for(let k=1;k<a.length;k++)for(let l=1;l<b.length;l++){
 const A=new T.Line3(a[k-1],a[k]),B=new T.Line3(b[l-1],b[l]);
 let q=A.getCenter(new T.Vector3()),s;
 for(let t=0;t<5;t++){s=B.closestPointToPoint(q,true,new T.Vector3());q=A.closestPointToPoint(s,true,new T.Vector3());}
 const d=distance(q,s),u=A.delta(new T.Vector3()).normalize(),v=B.delta(new T.Vector3()).normalize(),score=d*(1+(r.organization==='alignment'?1:.12)*(1-Math.abs(u.dot(v))));
 if(!best||score<best.score)best={i,j,k,l,q,s,u,v,d,score};
 }pairs.push(best);}
 const roots=nodes.map((_,i)=>i),root=i=>roots[i]===i?i:root(roots[i]),edges=[];
 for(const e of pairs.sort((a,b)=>a.score-b.score)){if(root(e.i)===root(e.j))continue;roots[root(e.i)]=root(e.j);edges.push(e);}
 return {nodes,edges,letters};
}
async function buildSource(r,out){
 if(r.source.length<2)throw Error('Use at least two original letters for cross-letter development.');
 const {nodes,edges,letters}=derive(r),w=await require('manifold-3d/manifold.js').default();w.setup();const M=w.Manifold;
 const {width:W,depth:D,height:H}=r.field,pitch=.5,paths=[],bands=[];
 for(const e of edges){
 const dir=e.s.clone().sub(e.q),reach=Math.min(r.preferredFeet*.4,e.d*.4);
 const orient=t=>t.clone().multiplyScalar(t.dot(dir)<0?-reach:reach);
 const c=new T.CubicBezierCurve3(e.q,e.q.clone().add(orient(e.u)),e.s.clone().sub(orient(e.v)),e.s);
 const link=c.getPoints(16);paths.push({sources:[nodes[e.i].id,nodes[e.j].id],line:link.map(p=>p.toArray())});
 const chain=(line,k)=>{const n=line.length-1,idx=a=>(a+n)%n;return Array.from({length:n+1},(_,t)=>line[idx(k+t)]);};
 const traces=[chain(nodes[e.i].line,e.k),link,chain(nodes[e.j].line,e.l)];
 const segments=traces.flatMap(line=>line.slice(1).map((b,i)=>[line[i],b]));
 const radius=Math.min(r.preferredFeet*.36,Math.max(2,(nodes[e.i].p.scale+nodes[e.j].p.scale)*.16)),cells=[];
 // Quantize elevation only after sampling each trajectory in world coordinates.
 // Contiguous column runs produce closed stepped banks with source-shaped inlets.
 for(let iy=0;iy<D/pitch;iy++){
 let start=0,last=0;const y=-D/2+(iy+.5)*pitch;
 for(let ix=0;ix<=W/pitch;ix++){
 let top=0;if(ix<W/pitch){const x=-W/2+(ix+.5)*pitch;
 for(const [a,b] of segments){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
 if(d<radius){const z=a.z+(b.z-a.z)*t,level=Math.floor((1-d/radius)*3);
 top=Math.max(top,Math.min(H,Math.max(1,Math.round((z*.70+level*1.5)/1.5)*1.5)));}}}
 if(top!==last){if(last)cells.push(M.cube([(ix-start)*pitch,pitch,last]).translate([-W/2+start*pitch,y-pitch/2,0]));start=ix;last=top;}
 }}
 const solid=M.union(cells);bands.push({solid,id:'bank-'+(bands.length+1),sources:paths.at(-1).sources});
 }
 const primary=M.union(bands.map(b=>b.solid));
 const degree=r.articulation??0;
 if(!Number.isFinite(degree)||degree<0||degree>1)throw Error('Articulation must be between 0 and 1');
 const {solid,tools,projections,report}=require('./source-articulation.cjs').articulate(M,primary,nodes,edges,degree,r.field,r.articulationElevation);
 for(const band of bands)for(const tool of tools)band.solid=band.solid.subtract(tool.solid);
 for(const p of projections)bands.push({id:p.id,sources:p.sources,solid:p.solid.intersect(solid)});
 const bounds=solid.boundingBox(),shellVolumes=solid.decompose().map(s=>s.volume());
 const mesh=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}};
 const dump=(f,data)=>fs.writeFileSync(path.join(out,f),JSON.stringify(data));
 const obj=(f,m)=>{let text='';for(let i=0;i<m.positions.length;i+=3)text+='v '+m.positions.slice(i,i+3).join(' ')+'\n';for(let i=0;i<m.indices.length;i+=3)text+='f '+m.indices.slice(i,i+3).map(x=>x+1).join(' ')+'\n';fs.writeFileSync(path.join(out,f),text);};
 const architecture=mesh(solid),components=bands.map(b=>({id:b.id,sources:b.sources,mesh:mesh(b.solid)}));
 obj('combined-envelope.obj',architecture);dump('combined-envelope.json',architecture);
 const outside=solid.subtract(M.cube([W,D,H]).translate([-W/2,-D/2,0])).volume();
 dump('manifest.json',{generator:r.generator,validation:{status:solid.status(),outside,sourceOutside:0,shellVolumes},instances:nodes.map(n=>({pose:n.p,matrix:n.matrix})),components:components.map((c,i)=>{const file=c.id+'.obj';obj(file,c.mesh);return {file,sources:c.sources,finalVolume:bands[i].solid.volume()}}),tools:tools.map(t=>{const file=t.id+'.obj';obj(file,mesh(t.solid));return {file,removed:t.removed,finalObstruction:solid.intersect(t.solid).volume()}})});
 return {primary:mesh(primary),articulationReport:report,architecture,letters,components,paths,features:nodes.map(n=>({id:n.id,line:n.line.map(p=>p.toArray())})),bounds,volume:solid.volume(),sourceCount:letters.length};
}
module.exports={derive,buildSource};
