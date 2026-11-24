// Opt-in controlled V interior-interface experiment. No legacy source is modified.
const assert=require('assert/strict'),T=require('three');
const VERSION='room-within-volume/v-interior-edge-platform-v1';
const mesh=s=>{const m=s.getMesh();return{positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}};
function evaluate(w,{version,node,sourceMesh,wall,shell,floor,thickness}){
 assert.equal(version,VERSION);assert.equal(node.p.letter,'V');assert.equal(node.p.levelIndex,1);assert(thickness>0);const matrix=new T.Matrix4().fromArray(node.matrix),raw=[[-.15,.45],[0,-.16],[.15,.45]],points=raw.map(p=>new T.Vector3(...p,0).applyMatrix4(matrix).toArray());
 const bounds=shell.slice(floor+thickness/2).bounds(),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),source=require('./room-source-contacts.cjs').body(w,sourceMesh),sourcePlan=source.project(),box=source.boundingBox(),limit=Math.hypot(...box.max.map((v,i)=>v-box.min[i])),z=floor+thickness/2,results=[];
 for(let edge=1;edge<=2;edge++){
  const a=points[edge-1],b=points[edge],inner=[a.slice(0,2),b.slice(0,2)],rays=[],ends=[],outer=[],failures=[];
  for(const p of inner){const d=Math.hypot(center[0]-p[0],center[1]-p[1]),dir=center.map((v,i)=>(v-p[i])/d),hits=shell.rayCast([...p,z],[...center,z]);assert(hits.length,'Room ray misses: required geometry unavailable');const h=Array.from(hits[0].position),remain=Math.hypot(center[0]-h[0],center[1]-h[1]);ends.push(h.slice(0,2).map((v,i)=>v+.25*(center[i]-v)/remain));
   const back=wall.rayCast([...p,z],[p[0]-dir[0]*limit,p[1]-dir[1]*limit,z]);const hit=back[0]?Array.from(back[0].position):null;rays.push({inner:[...p,z],roomHit:h,wallHit:hit,reverseSearchLimitFeet:limit});
   // Interface reach is bounded by actual source size and may only cross its projected face.
   if(hit){const distance=Math.hypot(hit[0]-p[0],hit[1]-p[1]),exit=back[1]?Array.from(back[1].position):hit;outer.push(exit.slice(0,2));rays.at(-1).wallDistanceFeet=distance;rays.at(-1).wallExit=exit;}else{outer.push(p);failures.push('No source-linked wall receiver behind inner-edge endpoint');}
  }
  const bridge=new w.CrossSection([[outer[0],outer[1],inner[1],inner[0]]],'EvenOdd'),unsupportedFaceArea=bridge.subtract(sourcePlan).area();if(unsupportedFaceArea>1e-6)failures.push('Receiving strip leaves native projected source face');
  const plan=w.CrossSection.union([bridge,new w.CrossSection([[inner[0],inner[1],ends[1],ends[0]]],'EvenOdd')]),solid=plan.extrude(thickness).translate([0,0,floor]),wallContact=solid.intersect(wall),roomContact=solid.intersect(shell);
  if(solid.decompose().length!==1)failures.push('Disconnected plate');if(wallContact.volume()<.005)failures.push('Native wall contact below 0.005 ft3');if(roomContact.volume()<.005)failures.push('Native room contact below 0.005 ft3');
  results.push({source:node.id,edgeIndex:edge,interiorEdge3D:[a,b],edgeLengthFeet:Math.hypot(...a.map((v,i)=>v-b[i])),rays,unsupportedFaceAreaFeet2:unsupportedFaceArea,wallContactFeet3:wallContact.volume(),roomContactFeet3:roomContact.volume(),wallContactMesh:mesh(wallContact),roomContactMesh:mesh(roomContact),candidateMesh:mesh(solid),status:failures.length?'ineligible':'local-interface-valid',failures});
 }
 return{version:VERSION,source:node.id,edges:results,scope:'Local source/receiver interfaces only. Complete collision, protection and containment validation required.',nativePrinciples:{roomEmbedFeet:.25,minimumJointVolumeFeet3:.005,thicknessFeet:thickness},newBehavior:'V curves 1/2 drive two edge-to-room quads. Reverse ray entry/exit interfaces resolve the intervening source face to an existing source-linked wall, only within its actual projected source geometry. No arbitrary extension or source exterior-edge platform boundary.'};
}
module.exports={VERSION,evaluate};
