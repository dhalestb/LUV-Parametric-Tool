const T=require('three');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
function roomWithinVolume(w,nodes,field){
 const M=w.Manifold,C=w.CrossSection,th=.45,slab=.6,clearance=3;
 const clip=M.cube([field.width,field.depth,field.height]).translate([-field.width/2,-field.depth/2,0]);
 const features=n=>{const s=getLetterShape(n.p.letter),center=new T.Box2().setFromPoints(s.getPoints(16)).getCenter(new T.Vector2()),mat=new T.Matrix4().fromArray(n.matrix);return {s,world:q=>new T.Vector3(q.x-center.x,q.y-center.y,0).applyMatrix4(mat)}};
 const data=nodes.map(n=>({n,...features(n)}));
 const center=data.reduce((s,a)=>[s[0]+a.n.p.x/nodes.length,s[1]+a.n.p.y/nodes.length],[0,0]);
 const anchor=data.filter(a=>a.n.p.letter==='U').sort((a,b)=>a.n.p.z-b.n.p.z||a.n.id.localeCompare(b.n.id))[0];
 if(!anchor)throw Error('Independent room needs a U concave boundary.');
 const sameLevel=a=>a.n.p.levelIndex===anchor.n.p.levelIndex;
 const nearest=letter=>data.filter(a=>a.n.p.letter===letter&&sameLevel(a)).sort((a,b)=>Math.hypot(a.n.p.x-anchor.n.p.x,a.n.p.y-anchor.n.p.y)-Math.hypot(b.n.p.x-anchor.n.p.x,b.n.p.y-anchor.n.p.y))[0];
 const l=nearest('L'),v=nearest('V');if(!l||!v)throw Error('Independent room needs compatible U, L and V sources at one level.');
 const group=[anchor,l,v],groupIds=group.map(a=>a.n.id);
 const innerPoints=a=>{const ix=a.n.p.letter==='U'?[5,6,7,8]:a.n.p.letter==='L'?[2,3]:[1,2];return ix.flatMap(i=>Array.from({length:9},(_,k)=>a.world(a.s.curves[i].getPoint(k/8))));};
 const seed=C.hull(group.flatMap(a=>innerPoints(a).map(p=>[p.x,p.y])));
 const all=data.flatMap(a=>a.s.getPoints(32).map(p=>a.world(p)));
 const fieldPlan=C.square([field.width-2*th,field.depth-2*th],true);
 const outer=C.hull(all.map(p=>[p.x,p.y])).offset(1.5,'Round',24).intersect(fieldPlan).simplify(1e-5);
 const room=seed.intersect(outer.offset(-clearance-th)).simplify(1e-5);
 if(room.isEmpty()||room.decompose().length!==1)throw Error('Source cluster does not fit a contained room with surrounding clearance.');
 const roomInterior=room.offset(-th).simplify(1e-5);
 if(roomInterior.area()<35)throw Error('Source cluster provides less than 35 square feet of clear room floor.');
 const uInner=innerPoints(anchor),floorZ=Math.min(...uInner.map(p=>p.z));
 const lPoints=l.s.getPoints().map(p=>l.world(p)),height=Math.max(...lPoints.map(p=>p.z))-Math.min(...lPoints.map(p=>p.z));
 if(height<8)throw Error('Source wall height provides less than 8 ft of room headroom.');
 const roomRoofZ=floorZ+height,outerRoofZ=Math.max(...all.map(p=>p.z))+1;
 if(floorZ<slab||roomRoofZ+slab+3>outerRoofZ||outerRoofZ+slab>field.height)throw Error('Room floor, roof, or overhead surrounding void does not fit the unchanged field.');
 const loop=plan=>plan.toPolygons().sort((a,b)=>b.length-a.length)[0];
 const edges=plan=>{const poly=loop(plan);return poly.map((a,i)=>{const b=poly[(i+1)%poly.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return {a,b,len,t:[(b[0]-a[0])/len,(b[1]-a[1])/len],mid:[(a[0]+b[0])/2,(a[1]+b[1])/2]}}).filter(e=>e.len>1e-6)};
 const roomCenter=loop(roomInterior).reduce((s,p,_,a)=>[s[0]+p[0]/a.length,s[1]+p[1]/a.length],[0,0]);
 const roomEdge=edges(room).filter(e=>e.len>4).sort((a,b)=>Math.hypot(a.mid[0]-center[0],a.mid[1]-center[1])-Math.hypot(b.mid[0]-center[0],b.mid[1]-center[1]))[0];
 if(!roomEdge)throw Error('No room boundary is long enough for a 3-ft entrance.');
 const normal=e=>{const n=[e.t[1],-e.t[0]];if(n[0]*(e.mid[0]-roomCenter[0])+n[1]*(e.mid[1]-roomCenter[1])<0)return n.map(x=>-x);return n};
 const doorDepth=th*6;
 const opening=(edge,at,width,z,height)=>{const n=normal(edge);const plan=C.hull([-width/2,width/2].flatMap(t=>[-doorDepth,doorDepth].map(d=>[at[0]+t*edge.t[0]+d*n[0],at[1]+t*edge.t[1]+d*n[1]])));return plan.extrude(height).translate([0,0,z])};
 const roomDoor=opening(roomEdge,roomEdge.mid,3,floorZ-.02,7.12);
 const outerEdge=edges(outer).filter(e=>e.len>4).sort((a,b)=>Math.hypot(a.mid[0]-roomEdge.mid[0],a.mid[1]-roomEdge.mid[1])-Math.hypot(b.mid[0]-roomEdge.mid[0],b.mid[1]-roomEdge.mid[1]))[0];
 if(!outerEdge)throw Error('No containing-envelope entrance boundary.');
 const outerDoor=opening(outerEdge,outerEdge.mid,4,floorZ-.02,8.02);
 let outerWall=outer.subtract(outer.offset(-th)).extrude(outerRoofZ).subtract(outerDoor);
 const rawRoomWall=room.subtract(roomInterior).extrude(height+.05).translate([0,0,floorZ-.025]);
 const roomWall=rawRoomWall.subtract(roomDoor);
 const windowReports=[],contributionBands=[];
 for(const a of data.filter(a=>!groupIds.includes(a.n.id))){
  const edge=edges(outer).filter(e=>e.len>2).sort((a1,b)=>Math.hypot(a1.mid[0]-a.n.p.x,a1.mid[1]-a.n.p.y)-Math.hypot(b.mid[0]-a.n.p.x,b.mid[1]-a.n.p.y))[0];
  const n=normal(edge),projection=p=>[(p.x-edge.mid[0])*edge.t[0]+(p.y-edge.mid[1])*edge.t[1],p.z];
  const points=innerPoints(a).map(projection);
  const width=Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),rise=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));
  let profile;
  if(width<.1||rise<.1){const span=Math.max(.8,Math.min(edge.len*.7,a.n.p.scale*.5));const z=a.n.p.z+field.height/2;profile=C.hull([[-span/2,z-.3],[span/2,z-.3],[span/2,z+.3],[-span/2,z+.3]]);}
  else profile=C.hull(points);
  // Confine apertures above the common floor and below the outer roof.
  profile=profile.intersect(C.square([edge.len-1,outerRoofZ-floorZ-1.5],true).translate([0,(outerRoofZ+floorZ)/2]));
  if(profile.isEmpty())throw Error('Source opening misses the containing wall at '+a.n.id);
  const mesh=profile.extrude(doorDepth*2).translate([0,0,-doorDepth]);
  const transform=new T.Matrix4().makeBasis(new T.Vector3(...edge.t,0),new T.Vector3(0,0,1),new T.Vector3(...n,0)).setPosition(edge.mid[0],edge.mid[1],0);
  const cutter=mesh.transform(transform.elements);
  const removed=outerWall.intersect(cutter).volume();
  if(removed<.05)throw Error('No visible exterior opening from '+a.n.id);
  outerWall=outerWall.subtract(cutter);
  contributionBands.push({id:'opening-'+a.n.id,owner:a.n.id,sources:[a.n.id,...groupIds],solid:cutter});
  windowReports.push({source:a.n.id,rule:a.n.p.letter==='L'&&rise<.1?'horizontal L footprint slot':'projected inner contour opening',removedVolume:removed,edge:edge.mid});
 }
 const bands=[
  {id:'surrounding-floor',sources:nodes.map(n=>n.id),solid:outer.extrude(slab).translate([0,0,floorZ-slab])},
  {id:'surrounding-walls',sources:nodes.map(n=>n.id),solid:outerWall},
  {id:'surrounding-roof',sources:nodes.map(n=>n.id),solid:outer.extrude(slab).translate([0,0,outerRoofZ-.025])},
  {id:'contained-room-walls',sources:groupIds,solid:roomWall},
  {id:'contained-room-roof',sources:groupIds,solid:room.extrude(slab).translate([0,0,roomRoofZ])}
 ];
 for(const a of group)contributionBands.push({id:'room-group-'+a.n.id,owner:a.n.id,sources:groupIds,solid:M.union([roomWall,bands.find(b=>b.id==='contained-room-roof').solid])});
 const solid=M.union(bands.map(b=>b.solid)).intersect(clip).asOriginal().simplify(1e-5);
 if(solid.status()!=='NoError'||solid.decompose().length!==1)throw Error('Independent room and containing envelope are not one valid connected solid.');
 const occupancy=roomInterior.extrude(height-.1).translate([0,0,floorZ+.05]);
 if(solid.intersect(occupancy).volume()>1e-6)throw Error('Room occupancy is obstructed.');
 const outside=outer.offset(-th).subtract(room.offset(clearance-.01));
 if(outside.area()<35)throw Error('Insufficient interstitial area.');
 const ceilingVoid=room.extrude(outerRoofZ-roomRoofZ-slab-.1).translate([0,0,roomRoofZ+slab+.05]);
 if(solid.intersect(ceilingVoid).volume()>1e-6)throw Error('Open volume above the room is obstructed.');
 const edgeNormal=normal(roomEdge),start=roomEdge.mid.map((x,i)=>x-edgeNormal[i]*1.5),end=roomEdge.mid.map((x,i)=>x+edgeNormal[i]*1.5);
 const portalBox=roomDoor.translate([0,0,.05]).intersect(roomInterior.offset(.5).extrude(6.8).translate([0,0,floorZ+.1]));
 if(solid.intersect(portalBox).volume()>1e-5)throw Error('Room entrance is obstructed.');
  const routeObstacles=solid.trimByPlane([0,0,1],floorZ+.05).trimByPlane([0,0,-1],-(floorZ+7)).project();
 const walkable=outer.offset(-th-.001).subtract(routeObstacles).simplify(1e-5).offset(-1.25);
 const inside=(plan,point)=>plan.intersect(C.square([.02,.02],true).translate(point)).area()>.00001;
 const outerNormal=normal(outerEdge),landing=outerEdge.mid.map((x,i)=>x-outerNormal[i]*2);
 const roomLanding=end;
 const routeRegion=walkable.decompose().find(part=>inside(part,roomCenter)&&inside(part,landing)&&inside(part,roomLanding));
 if(!routeRegion)throw Error('No connected 2.5-ft-wide, 7-ft-high geometric access route through both entrances.');
 const routeReport={passed:true,clearWidth:2.5,clearHeight:7,roomPoint:roomCenter,outerLanding:landing,doorLanding:roomLanding,method:'Connected eroded free-space component after projecting all obstacles through the full clearance height',freePlan:routeRegion.toPolygons()};
 const cutaway=M.union(bands.map(b=>b.id==='surrounding-walls'||b.id==='surrounding-roof'?b.solid.trimByPlane([-1,1,0],0):b.solid));
 return {solid,cutaway,primary:solid,bands,contributionBands,tools:[],projections:[],report:{before:solid.volume(),after:solid.volume(),removed:0,added:0,components:1,overhangs:0,addedProjections:0,operations:[]},boundaryReport:{typology:'Room Within Volume',strategy:'Independent Enclosed Room',roomSources:groupIds,access:routeReport,roomPlan:loop(room),outerPlan:loop(outer),roomInteriorPlan:loop(roomInterior),floorZ,roomRoofZ,outerRoofZ,headroom:height,clearRoomArea:roomInterior.area(),interstitialArea:outer.offset(-th).subtract(room).area(),minimumBoundarySeparation:clearance,door:{width:3,height:7.1,center:roomEdge.mid,normal:edgeNormal,approach:[start,end]},outerDoor:{width:4,height:8,center:outerEdge.mid},windows:windowReports,limitations:['One preserved-composition room pilot. No structural or accessibility certification.','Outer envelope is a source-projected hull; inner room is a hull of U/L/V interior features.','Access checked geometrically at 2.5-ft width and 7-ft height; this is not a code-compliance assessment.']}};
}
module.exports={roomWithinVolume};
