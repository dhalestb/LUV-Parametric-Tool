// Native spanning plates: exact planar profiles, source-derived frames and connected openings.
const T=require('three'),{upperTriangles}=require('./source-vertical-envelope.cjs'),{innerProfile}=require('./source-void-field.cjs');
const legacy=require('./source-inserted-plate-legacy.cjs');
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
function safe(w,s){const m=s.asOriginal().simplify(1e-5).getMesh(),mesh=new w.Mesh({numProp:3,vertProperties:new Float32Array(m.vertProperties),triVerts:new Uint32Array(m.triVerts)});mesh.merge();const r=new w.Manifold(mesh);if(r.status()!=='NoError')throw Error('Plate Float32 export rejected: '+r.status());return r;}
function insertedPlateEnvelope(w,nodes,edges,letters,field,config){
 if(config?.version==='edge-connected')return require('./source-edge-envelope.cjs').edgeEnvelope(w,nodes,field,config.inward,config.cornerStudy);
 if(config?.version==='merged-walls')return require('./source-merged-walls.cjs').mergedWalls(w,nodes,edges,field);
 if(config?.version==='two-u')return require('./source-two-u.cjs').uPlates(w,nodes,field);
 if(config?.version==='suspended')return require('./source-suspended-plate.cjs').suspendedPlate(w,nodes,letters,field);
 if(!config?.version||config.version==='legacy')return legacy.insertedPlateEnvelope(w,nodes,edges,letters,field);
 if(config.version!=='spanning-v2')throw Error('Unknown Inserted Plate generation mode.');
 if(nodes.length<9||nodes.length>18)throw Error('Inserted Plate requires 9–18 source letters.');
 const M=w.Manifold,CS=w.CrossSection,clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 const index=n=>nodes.indexOf(n),height=n=>n.p.z+field.height/2,normal=n=>new T.Vector3(0,0,1).applyMatrix3(new T.Matrix3().getNormalMatrix(new T.Matrix4().fromArray(n.matrix))).normalize();
 const horizontal=n=>Math.abs(normal(n).z)>1-1e-8;
 const plates=nodes.filter(n=>n.p.architecturalRole==='terrace'||(!n.p.architecturalRole&&n.p.letter==='L'));
 if(!plates.length||plates.some(n=>!horizontal(n)))throw Error('Plate sources require horizontal faces. Source poses were retained; assign upright/oblique letters a boundary role.');
 const edgeNodes=nodes.filter(n=>!plates.includes(n)&&horizontal(n)),uprights=nodes.filter(n=>!horizontal(n));
 if(!edgeNodes.length||!uprights.length)throw Error('Spanning plates require source concavities and upright/oblique boundary sources.');
 const levels=[...new Set(plates.map(height))].sort((a,b)=>a-b);
 if(levels.some((z,i)=>z<.75||z>field.height||(i&&(z-levels[i-1]<12-1e-8||z-levels[i-1]>15+1e-8))))throw Error('Plate levels require 12–15-ft spacing; source elevations were not changed.');
 const nearestLevel=n=>levels.reduce((a,b)=>Math.abs(a-height(n))<Math.abs(b-height(n))?a:b);
 const footprint=l=>CS.union(upperTriangles(l.mesh).map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero')));
 const profiles=letters.map(footprint),bands=[],floors=[],walls=[],pockets=[],tools=[],raw=[];
 const distance=(a,b)=>Math.hypot(a.p.x-b.p.x,a.p.y-b.p.y);
 for(const n of uprights){const i=index(n),z=nearestLevel(n),li=levels.indexOf(z),support=n.p.supportZ??(li?levels[li-1]-.75:0),triangles=upperTriangles(letters[i].mesh),underside=Math.min(...letters[i].mesh.positions.filter((_,k)=>k%3===2));
  if(!Number.isFinite(support)||support<0||support>=underside)throw Error(n.id+': wall support must be below its source underside.');
  const solid=M.union(triangles.map(t=>M.hull([...t,...t.map(p=>[p[0],p[1],support])]))).intersect(clip);
  raw.push({node:n,solid,z,kind:'frame'});walls.push({source:n.id,supportZ:support,upperTriangles:triangles,rule:'source upper geometry defines boundary cap; vertical frame descends to previous floor support'});
 }
 for(const n of edgeNodes){const z=nearestLevel(n),inner=innerProfile(w,n),solid=profiles[index(n)].offset(.15,'Round',2,48).extrude(2.9).translate([0,0,z-.1]).intersect(clip);
  raw.push({node:n,solid,z,kind:'edge'});const cutter=inner.cs.offset(.001,'Round',2,48).extrude(3.66).translate([0,0,z-.751]);
  const protectedOpening=inner.cs.extrude(3.65).translate([0,0,z-.75]);tools.push({id:'source-opening-'+n.id,source:n.id,solid:protectedOpening,cuttingSolid:cutter});pockets.push({source:n.id,floor:'level-'+levels.indexOf(z),bottomZ:z-.75,topZ:z+2.9,sourceContour:inner.sourceContour,cutterMesh:pack(protectedOpening.intersect(clip)),rule:'actual letter concavity cuts through its floor and remains open above',inner,z});
 }
 // Consecutive source concavities establish a continuous, varying atrium, rather than a fixed central cutout.
 const atriumEntries=levels.map(z=>pockets.filter(p=>p.z===z).sort((a,b)=>b.inner.cs.area()-a.inner.cs.area())[0]).filter(Boolean);
 const makeAtrium=clearance=>{const parts=[],profile=p=>clearance?p.inner.cs.offset(clearance,'Round',2,48):p.inner.cs;for(let i=0;i<atriumEntries.length;i++){const a=atriumEntries[i],z0=a.z-.75-(clearance?.001:0),z1=a.z+2.9+(clearance?.001:0);parts.push(profile(a).extrude(z1-z0).translate([0,0,z0]));if(i){const b=atriumEntries[i-1];parts.push(M.hull([profile(b).extrude(.002).translate([0,0,b.z-.001]),profile(a).extrude(.002).translate([0,0,a.z-.001])]));}}return M.union(parts).intersect(clip);};
 const atrium=makeAtrium(0),atriumCut=makeAtrium(.01);tools.push({id:'cross-level-atrium',source:atriumEntries[0].source,solid:atrium,cuttingSolid:atriumCut});
 for(const n of plates){const z=height(n),base=profiles[index(n)].offset(.5,'Round',2,48),compatible=raw.filter(r=>r.solid.boundingBox().min[2]<z&&r.solid.boundingBox().max[2]>z-.75),near=compatible.sort((a,b)=>distance(n,a.node)-distance(n,b.node));
  const selected=[near.find(r=>r.kind==='edge'),...near.filter(r=>r.kind==='frame')].filter(Boolean);if(selected.length<2)throw Error(n.id+': no compatible edge and frame at plate elevation.');
  // Broad infill spans actual source footprints. Different source poses create different plate boundaries.
  const outlines=[base,...selected.map(r=>profiles[index(r.node)].offset(.15,'Round',2,48))],plan=CS.hull(outlines),id='plate-'+n.id;
  const solid=plan.extrude(.75).translate([0,0,z-.75]).intersect(clip),links=selected.map(r=>({source:r.node.id,from:[n.p.x,n.p.y],to:[r.node.p.x,r.node.p.y],width:0}));
  const notch=innerProfile(w,n),protectedNotch=notch.cs.extrude(.75).translate([0,0,z-.75]),notchCut=notch.cs.offset(.001,'Round',2,48).extrude(.752).translate([0,0,z-.751]);tools.push({id:'plate-concavity-'+n.id,source:n.id,solid:protectedNotch,cuttingSolid:notchCut});pockets.push({source:n.id,floor:id,bottomZ:z-.75,topZ:z,sourceContour:notch.sourceContour,cutterMesh:pack(protectedNotch.intersect(clip)),rule:'source inner contour interrupts the inserted plate'});bands.push({id,owner:n.id,sources:[n.id,...selected.map(r=>r.node.id)],solid});floors.push({id,source:n.id,topZ:z,bottomZ:z-.75,thickness:.75,sourceContour:n.line.map(p=>p.toArray()),links,sourceOnlyArea:base.area(),grossArea:solid.volume()/.75,operation:'source-boundary spanning plate'});
 }
 for(const r of raw)bands.push({id:'boundary-'+r.node.id,owner:r.node.id,sources:[r.node.id,...floors.filter(f=>bands.find(b=>b.id===f.id).solid.intersect(r.solid).volume()>1e-6).map(f=>f.source)],solid:r.solid});
 // Continue source-derived atrium clearance through each frame to its support.
 // This prevents a tapered opening from leaving unsupported source-cap fragments.
 for(const wall of walls){const b=bands.find(b=>b.owner===wall.source),box=b.solid.boundingBox(),heightBand=M.cube([field.width,field.depth,box.max[2]-wall.supportZ+.002]).translate([-field.width/2,-field.depth/2,wall.supportZ-.001]),localAtrium=atriumCut.intersect(heightBand);if(localAtrium.isEmpty())continue;const plan=CS.union(upperTriangles(pack(localAtrium)).map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero'))),relief=plan.offset(.001,'Round',2,48).extrude(box.max[2]-wall.supportZ+.002).translate([0,0,wall.supportZ-.001]);b.solid=b.solid.subtract(relief);wall.rule+='; local atrium clearance continues vertically to support';wall.reliefMesh=pack(relief.intersect(clip));}
 const primary=M.union(bands.map(b=>b.solid));let solid=primary;const operations=[];
 for(const t of tools){const next=solid.subtract(t.cuttingSolid);t.removed=solid.volume()-next.volume();solid=next;operations.push({id:t.id,sources:t.id==='cross-level-atrium'?atriumEntries.map(a=>a.source):[t.source],feature:'source concavity',kind:t.id==='cross-level-atrium'?'connected multilevel opening':'through-plate recess',profile:'actual letter inner contour',width:0,height:0,depth:0,bayDepth:0,alcove:false});}
 for(const b of bands){for(const t of tools)b.solid=b.solid.subtract(t.cuttingSolid);b.solid=safe(w,b.solid);if(b.solid.volume()<=1e-6)throw Error(b.id+': source component fully removed by protected openings.');}
 solid=safe(w,solid);if(solid.decompose().length!==1)throw Error('Inserted Plate envelope is disconnected: '+JSON.stringify(solid.decompose().map(s=>({volume:s.volume(),bounds:s.boundingBox(),owners:bands.map(b=>({id:b.id,volume:s.intersect(b.solid).volume()})).filter(b=>b.volume>1e-9)}))));
 for(const t of tools)if(Math.abs(solid.intersect(t.solid).volume())>1e-8)throw Error(t.id+': protected plate opening obstructed '+solid.intersect(t.solid).volume());
 for(const floor of floors){const b=bands.find(b=>b.id===floor.id);floor.netArea=b.solid.volume()/.75;floor.infillArea=floor.grossArea-floor.sourceOnlyArea;if(floor.netArea<4)throw Error(floor.id+': no substantial floor area remains.');}
 for(const wall of walls){wall.contacts=floors.map(f=>({floor:f.id,volume:bands.find(b=>b.owner===wall.source).solid.intersect(bands.find(b=>b.id===f.id).solid).volume()}));if(!wall.contacts.some(c=>c.volume>1e-6))throw Error(wall.source+': frame has no remaining plate contact.');}
 return {bands,primary,solid,tools,projections:[],report:{before:primary.volume(),after:solid.volume(),removed:primary.volume()-solid.volume(),added:0,components:1,overhangs:0,addedProjections:0,operations},boundaryReport:{version:'spanning-v2',typology:'Inserted Horizontal Plate',levels,floors,walls,pockets:pockets.map(({inner,z,...p})=>p),atrium:{entries:atriumEntries.map(a=>({source:a.source,floorZ:a.z,center:a.inner.origin})),sources:atriumEntries.map(a=>a.source),cutterMesh:pack(atrium),removedVolume:primary.volume()-solid.volume()},limitations:['Source-driven conceptual spanning plates; geometric continuity is not certified circulation or structural feasibility.','No source pose changes, fixed building template, volumetric reconstruction or post-generation stretching.']}};
}
module.exports={insertedPlateEnvelope};
