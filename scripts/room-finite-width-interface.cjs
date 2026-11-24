// Versioned supplemental receiving-interface proof. Does not move sources or alter native formation.
const assert=require('assert/strict'),crypto=require('crypto');
const VERSION='room-within-volume/finite-width-landing-v1',hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const mesh=s=>{const m=s.getMesh();return{positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}};
function resolve(w,args,reference){
 const {perimeter,panels,shell,mid,inward,along,floorZ,thickness,inner,cavity,cutter}=args;
 assert.equal(thickness,.5,'Only the verified 0.5-ft native landing thickness is supported');
 assert.deepEqual(inner.map(n=>n.p),reference.interiorPoses,'Reference landing cannot be transferred to a different interior source frame');
 const reach=reference.reachFeet;assert(Number.isFinite(reach)&&reach>0&&reach===reference.nativeReport.door.landingLength,'Landing reach must be the exact existing native reference extent');
 const angle=Math.atan2(along.y,along.x)*180/Math.PI,box=(width,depth,height,at,z)=>w.Manifold.cube([width,depth,height],true).rotate([0,0,angle]).translate([at.x,at.y,z]);
 // Exact original construction with its frozen existing reach; no increased width, thickness or extension.
 const landing=box(3.8,reach+.25,thickness,mid.clone().addScaledVector(inward,(.25-reach)/2),floorZ-thickness/2);
 const joint=landing.intersect(perimeter),roomJoint=landing.intersect(shell),area=joint.project().area(),slices=Array.from({length:9},(_,i)=>{const z=floorZ-thickness+thickness*(.0002+(1-.0004)*i/8);return{z,areaFeet2:joint.slice(z).area()};});
 assert.equal(landing.status(),'NoError');assert.equal(joint.status(),'NoError');assert.equal(landing.decompose().length,1);assert.equal(joint.decompose().length,1,'Ambiguous disconnected receiving patches');
 assert(joint.volume()>=.005&&roomJoint.volume()>=.005,'Native positive-volume joint threshold not met');assert(area>.01&&slices.every(s=>s.areaFeet2>.01),'No finite receiving patch through the full plate thickness');
 const owners=panels.map(p=>({id:p.id,sources:p.sources,patch:p.solid.intersect(landing)})).filter(p=>p.patch.volume()>1e-6);
 assert(owners.length===1,'Fallback requires one clearly attributable receiving wall, not competing wall fragments');
 const owner=owners[0];assert(owner.sources.length===2&&owner.sources.every(id=>/^([LUV])-\d+$/.test(id)),'Receiver lacks source-edge provenance');
 assert(joint.subtract(owner.patch).volume()<1e-6&&owner.patch.subtract(joint).volume()<1e-6,'Attributed source wall does not explain the complete joint');
 const doorway=box(2.95,2,7,mid,floorZ+3.55),threshold=box(3,2,7.1,mid,floorZ+3.55),approach=box(3,20,7.1,mid.clone().addScaledVector(inward,-10),floorZ+3.55);
 // These preserve the native opening; the approach is an explicit additional test for this controlled footprint.
 for(const [name,air]of [['doorway',doorway],['threshold',threshold],['first-20-ft-approach',approach]])assert(perimeter.intersect(air).volume()<1e-6&&landing.intersect(air).volume()<1e-6,name+' obstructed');
 assert(landing.intersect(cavity).volume()<1e-6,'Landing intrudes into protected room air');assert(cavity.intersect(cutter).volume()>=1,'Original room doorway opening does not connect to its cavity');
 const local=p=>[(p[0]-mid.x)*along.x+(p[1]-mid.y)*along.y,-(p[0]-mid.x)*inward.x-(p[1]-mid.y)*inward.y,p[2]],points=[];const jm=joint.getMesh();for(let i=0;i<jm.vertProperties.length;i+=3)points.push(local(Array.from(jm.vertProperties.slice(i,i+3))));
 const evidence={version:VERSION,method:'finite-width-source-interface',defaultMethod:'original centerline first-hit ray',reference:reference.provenance,widthFeet:3.8,thicknessFeet:thickness,reachFeet:reach,reachChangeFeet:0,sourcePosesUnchanged:true,sourceLetterIds:owner.sources,receivingWall:owner.id,contactVolumeFeet3:joint.volume(),roomJointVolumeFeet3:roomJoint.volume(),contactProjectedAreaFeet2:area,contactBounds:joint.boundingBox(),landingFrameBounds:{min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))},contactSlices:slices,landingMeshHash:hash(mesh(landing)),contactMeshHash:hash(mesh(joint)),protectedAir:{doorway:{width:2.95,depth:2,height:7,intersectionFeet3:0},threshold:{width:3,depth:2,height:7.1,intersectionFeet3:0},approach:{width:3,length:20,height:7.1,intersectionFeet3:0},roomCavityIntersectionFeet3:0},limitations:['The controlled landing terminates at a partial-width wall joint; no through-wall route, full-width bearing or structural certification is claimed.','No generic fallback for disconnected or multiply attributed receiving patches; those configurations remain rejected.'],mesh:mesh(landing),contactMesh:mesh(joint)};
 return{reachFeet:reach,evidence,landing};
}
function verifyRoom(w,args,resolution){const {landing,room,perimeter,clear,cavity,cutter}=args;assert.equal(hash(mesh(landing)),resolution.evidence.landingMeshHash,'Native construction differs from validated unchanged footprint');assert(room.intersect(clear).volume()<1e-6&&perimeter.intersect(clear).volume()<1e-6);assert(room.intersect(cavity).volume()<1e-6,'Completed room/platform group occupies protected room cavity');assert(cavity.intersect(cutter).volume()>1);resolution.evidence.completedRoomOpeningChecks={passed:true,doorwayRoomIntersectionFeet3:room.intersect(clear).volume(),doorwayPerimeterIntersectionFeet3:perimeter.intersect(clear).volume(),cavityOccupiedFeet3:room.intersect(cavity).volume()};}
module.exports={VERSION,resolve,verifyRoom,hash,mesh};
