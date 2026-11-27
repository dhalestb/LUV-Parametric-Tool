// Opt-in orchestration only: the authenticated platform formation code is executed unchanged.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict'),T=require('three'),A=require('./room-polygon-domain.cjs');
const VERSION='room-within-volume/eligible-edge-platforms-v1',FILE=path.resolve(__dirname,'../vendor/typology-proof-20261121/scripts/room-edge-platforms.cjs');
const mesh=s=>{const m=s.getMesh();return{positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)}};
function instrument(observer){
 A.authenticate();let source=fs.readFileSync(FILE,'utf8').replaceAll('\r\n','\n');
 const inserts=[
  ["    const {inner,outer}=contours(node);","\n    require('__platform_observer__').contours(node,inner,outer);"],
  ["      const hits=shell.rayCast([...p,z],[...center,z]);","\n      require('__platform_observer__').ray(node,p,z,center,hits);"],
  ["    const wallOverlap=plate.intersect(wall).volume(), roomOverlap=plate.intersect(shell).volume();","\n    require('__platform_observer__').plate(node,plate,wallOverlap,roomOverlap);"],
 ];
 for(const [anchor,after]of inserts){assert.equal(source.split(anchor).length,2,'Native platform source changed');source=source.replace(anchor,anchor+after);}
 const m=new Module(FILE,module);m.filename=FILE;m.paths=Module._nodeModulePaths(path.dirname(FILE));const nativeRequire=Module.createRequire(FILE);m.require=s=>s==='__platform_observer__'?observer:nativeRequire(s);m._compile(source,FILE);return m.exports;
}
function sourceEdges(node,inner,outer){
 const {getLetterShape}=require('../vendor/typology-proof-20261121/src/components/letterGeometry3d.ts'),shape=getLetterShape(node.p.letter),center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2()),matrix=new T.Matrix4().fromArray(node.matrix);
 const point=(i,t)=>{const p=shape.curves[i].getPoint(t).sub(center);return new T.Vector3(p.x,p.y,0).applyMatrix4(matrix).toArray();};
 let inner3,edges;
 if(node.p.letter==='U'){
  inner3=Array.from({length:17},(_,i)=>{const t=1-(.25+i/32);return t<.5?point(6,t*2):point(7,t*2-1);});edges={inner:[6,7],outer:[1,2],range:'Native middle-bowl samples .25 through .75'};
 }else{
  const radius=i=>Math.hypot(...point(i,.5).slice(0,2)),[outside,inside]=radius(0)>radius(5)?[0,2]:[5,3];inner3=[point(inside,.18),point(inside,.82)];edges={inner:[inside],outer:[outside],range:'Native .18 to .82 interval on the selected inner stroke'};
 }
 assert(inner3.length===inner.length&&inner3.every((p,i)=>Math.hypot(p[0]-inner[i][0],p[1]-inner[i][1])<1e-9),'Diagnostic edge does not match the native contour');
 const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-points[i][j])),0),a=inner3[0],b=inner3.at(-1);
 return{...edges,innerTransformed3D:inner3,innerProjected:inner,outerProjected:outer,innerPolylineLengthFeet:length(inner3),innerProjectedLengthFeet:length(inner),innerChordYawDegrees:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI,innerElevationRangeFeet:[Math.min(...inner3.map(p=>p[2])),Math.max(...inner3.map(p=>p[2]))],rule:'Original contours() projects the tilted edge onto the finished horizontal floor plane. There is no separate native minimum-length threshold; native connected-plate and >=0.005-ft³ endpoint contacts decide formation.'};
}
function create(config,events=[],provenance={}){
 assert.equal(config.version,VERSION);assert(Array.isArray(config.requiredSourceIds));assert.equal(new Set(config.requiredSourceIds).size,config.requiredSourceIds.length);assert(config.requiredSourceIds.every(s=>typeof s==='string'));
 return function optionalPlatforms(w,nodes,panels,shell,floor,thickness){
  assert(Number.isFinite(floor)&&Number.isFinite(thickness)&&thickness>0);assert.equal(shell.status(),'NoError');assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length,'Ambiguous platform source identities');
  for(const n of nodes){assert(n.p.architecturalRole==='perimeter'&&n.p.levelIndex===1,'Only the original suspended-room course is eligible');assert(['L','U','V'].includes(n.p.letter),'Unknown source glyph');assert(n.matrix.length===16&&n.matrix.every(Number.isFinite),'Invalid source transformation');}
  for(const id of config.requiredSourceIds)assert(nodes.some(n=>n.id===id),'Required platform source is unavailable: '+id);
  const fingerprint=()=>A.hash({nodes:nodes.map(n=>({id:n.id,p:n.p,matrix:n.matrix})),panels:panels.map(p=>({id:p.id,sources:p.sources,mesh:mesh(p.solid)})),shell:mesh(shell)}),before=fingerprint();
  const ledger={version:VERSION,provenance,floorFeet:floor,topFeet:floor+thickness,thicknessFeet:thickness,requiredSourceIds:config.requiredSourceIds,mandatoryDoorwayLanding:'Always remains in suspended-polygon-room.cjs; never optional here',nativeFile:FILE,nativeSha256:A.hash(fs.readFileSync(FILE)),inputFingerprint:before,candidates:[],status:'evaluating',assemblyValidated:false};events.push(ledger);
  const solids=[],measurements=[];let current;
  const native=instrument({contours(n,inner,outer){current.edge=sourceEdges(n,inner,outer);},ray(n,p,z,center,hits){current.receivingRays.push({origin:[...p,z],toward:[...center,z],firstHit:hits[0]?Array.from(hits[0].position):null,hitCount:hits.length});},plate(n,solid,wallOverlap,roomOverlap){current.geometry={status:solid.status(),connectedBodies:solid.decompose().length,volumeFeet3:solid.volume(),footprintFeet2:solid.project().area(),wallOverlapFeet3:wallOverlap,roomOverlapFeet3:roomOverlap,meshHash:A.hash(mesh(solid))};}});
  try{
   for(const node of nodes){
    current={source:node.id,letter:node.p.letter,level:node.p.levelIndex+1,poseHash:A.hash(node.p),matrix:node.matrix.slice(),required:config.requiredSourceIds.includes(node.id),sourceWalls:panels.filter(p=>p.sources.includes(node.id)).map(p=>({id:p.id,sources:p.sources,meshHash:A.hash(mesh(p.solid))})),roomSources:provenance.roomSourceIds??[],receivingRays:[]};ledger.candidates.push(current);
    if(!['L','U'].includes(node.p.letter)){
     current.status='skipped';current.reasonCode='native-glyph-not-supported';current.reason='Original liveRoom selects only L/U for room-edge platforms; V has no authenticated platform contour branch.';
    }else{
     try{
      const result=native(w,[node],panels,shell,floor,thickness);assert.equal(result.solids.length,1);assert.equal(result.measurements.length,1);assert.equal(result.measurements[0].source,node.id);assert.equal(result.solids[0].status(),'NoError');assert(result.solids[0].volume()>0,'Non-positive native platform');
      current.status='generated';current.reasonCode='native-interface-valid';current.reason='Original formation succeeded: one connected source-derived plate and both native endpoint contact thresholds met.';current.nativeMeasurement=result.measurements[0];solids.push(result.solids[0]);measurements.push(result.measurements[0]);
     }catch(e){
      if(e.message==='No room-floor intersection for '+node.id){current.status='skipped';current.reasonCode='no-room-floor-receiver';current.reason=e.message;}
      else if(e.message==='Incomplete room or perimeter joint for '+node.id){current.status='skipped';current.reasonCode='native-joint-ineligible';current.reason=e.message;}
      else{current.status='error';current.reasonCode='unexpected-error-not-optional';current.reason=e.message;throw e;}
     }
    }
    if(current.required&&current.status!=='generated')throw Error('Required platform source '+node.id+' is ineligible: '+current.reason);
   }
   ledger.status='optional-candidates-evaluated';ledger.generated=measurements.map(x=>x.source);ledger.skipped=ledger.candidates.filter(x=>x.status==='skipped').map(x=>x.source);return{solids,measurements,eligibility:ledger};
  }catch(e){ledger.status='blocked';ledger.blocker=e.message;throw e;}
  finally{ledger.inputsUnchanged=fingerprint()===before;assert(ledger.inputsUnchanged,'Platform eligibility changed source letters, wall geometry or receiving shell');}
 };
}
module.exports={VERSION,create,sourceEdges,nativeFile:FILE};
