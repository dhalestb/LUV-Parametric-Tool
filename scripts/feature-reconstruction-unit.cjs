// Analytic reconstruction checks; real-upload acceptance is reported separately.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(__dirname,'../src/components/lattice',n+'.ts'));
function floor(){
 const positions=[];for(const z of [-1,0])for(const x of [-8,4,8])for(const y of [-4,4])positions.push(x,y,z===0&&x===8?-.4:z);
 const faces=[],quad=(a,b,c,d)=>{faces.push([a,b,c],[a,c,d]);};
 for(let i=0;i<2;i++){const a=i*2;quad(a,a+1,a+3,a+2);quad(a+6,a+8,a+9,a+7);quad(a,a+2,a+8,a+6);quad(a+1,a+7,a+9,a+3);}quad(0,6,7,1);quad(4,5,11,10);
 const text=positions.reduce((s,_,i)=>i%3?s:s+`v ${positions.slice(i,i+3).join(' ')}\n`,'')+faces.map(f=>'f '+f.map(v=>v+1).join(' ')).join('\n');
 return load('analyze').analyzeMesh(load('parseObj').parseObj(text,'independent-cambered-floor.obj'),null,1,'z');
}
async function main(){
 await load('extensionReconstruction').initializeExtensionReconstruction();
 // A curved rim can be straight in plan while its actual midpoint elevation
 // differs from the average of its endpoints. No source vertex may be changed.
 {
  const positions=[],faces=[],nx=3,ny=3;
  for(const top of [false,true])for(const x of [-8,4,8])for(const y of [-4,0,4])positions.push(x,y,top?(y===0?.2:0):-1);
  const quad=(a,b,c,d)=>faces.push({vertices:[a,b,c],normals:null},{vertices:[a,c,d],normals:null});
  for(let x=0;x<nx-1;x++)for(let y=0;y<ny-1;y++){const a=x*ny+y;quad(a,a+1,a+ny+1,a+ny);quad(a+9,a+ny+9,a+ny+10,a+10);}
  for(let x=0;x<nx-1;x++){const a=x*ny;quad(a,a+ny,a+ny+9,a+9);quad(a+2,a+11,a+ny+11,a+ny+2);}
  for(let y=0;y<ny-1;y++){quad(y,y+9,y+10,y+1);quad(6+y,7+y,16+y,15+y);}
  const mesh={id:'independent-curved-rim',filename:'independent-curved-rim.obj',positions:new Float32Array(positions),normals:new Float32Array(),faces,upAxis:'z'};
  const before=JSON.stringify(mesh),curved=load('analyze').analyzeMesh(mesh,null,1,'z');
  const edge=load('connectionFeatures').connectionFeatures(curved).features.find(f=>f.outward[0]>.99&&f.point[0]>7&&Math.abs(f.point[1])<1e-6);
  assert(edge,'merged east rim');assert(Math.abs(edge.point[2]-(.2-curved.anchor[2]))<1e-6,JSON.stringify(edge));
  assert.equal(JSON.stringify(mesh),before);
  console.log('PASS merged curved boundary attachments use actual source-triangle elevations rather than averaged endpoint Z');
 }
 const model={...floor(),id:'independent-A',sourceResponsiveExtensions:true},before=JSON.stringify(model.connectionSurface);
 const features=load('connectionFeatures').connectionFeatures(model).features;
 assert(features.some(f=>f.kind==='corner'));assert(features.some(f=>f.kind==='edge'));
 const feature=features.find(f=>f.kind==='edge'&&f.outward[0]>.9&&f.point[0]>7);assert(feature,'measured east perimeter');
 const tile={id:model.id,ix:0,iy:0,iz:0,zLift:0,variant:0};
 assert.equal(load('walkingApproach').validateSourceApproach(model,tile,feature.point,feature.outward,2.1).valid,false);
 const result=load('featureAdaptation').adaptFeatureLanding(model,{feature,width:2.1,depth:3,setback:0,elevation:0});
 assert(result.valid,JSON.stringify(result));assert.equal(JSON.stringify(model.connectionSurface),before);
 const walking=load('walkingApproach').validateWalkingApproach(result.model,tile,result.point,feature.outward,2.1,6,[result.model],[tile],[]);
 assert(walking.valid,JSON.stringify(walking));assert(result.provenance.changedTriangles.length);assert.equal(result.provenance.workingTopology,'CONFORMING_REFINED_COPY');
 console.log('PASS a failing original approach becomes a verified full-depth walking surface on a closed separately reconstructed material copy');
 assert(load('connectionFeatures').placedConnectionFeatures(model,tile,{branch:false,corner:false,edge:false,other:false}).length===0);
 console.log('PASS feature-category controls remove candidates from generation');
 const retracted=load('featureAdaptation').adaptFeatureLanding(model,{feature,width:2.1,depth:3,setback:.5,elevation:0});
 assert(retracted.valid,JSON.stringify(retracted));assert(Math.abs(retracted.point[0]-(result.point[0]-.5))<1e-6);
 assert.equal(retracted.provenance.additionalExternalRun,.5);assert.equal(JSON.stringify(model.connectionSurface),before);
 console.log('PASS retraction changes only the derived tip and reports actual additional external run');
 const extended=load('featureAdaptation').adaptFeatureLanding(model,{feature,width:2.1,depth:3,setback:-.75,elevation:0});
 assert(extended.valid,JSON.stringify(extended));assert(Math.abs(extended.point[0]-(result.point[0]+.75))<1e-6);assert.equal(extended.provenance.additionalExternalRun,-.75);
 assert(load('walkingApproach').validateWalkingApproach(extended.model,tile,extended.point,feature.outward,2.1,3,[extended.model],[tile],[],true).valid);
 assert.equal(JSON.stringify(model.connectionSurface),before);
 console.log('PASS a bounded outward material extension provides an actual flat three-foot landing on a separate closed working mesh');
 for(const halfWidth of [.75,.4]){
 const kernel=load('extensionReconstruction').extensionGeometryKernel(),section=new kernel.CrossSection([[[-8,-4],[4,-4],[4,-halfWidth],[8,-halfWidth],[8,halfWidth],[4,halfWidth],[4,4],[-8,4]]]);
 const solid=section.extrude(1),mesh=solid.getMesh();
 const text=Array.from({length:mesh.vertProperties.length/3},(_,i)=>'v '+Array.from(mesh.vertProperties.slice(i*3,i*3+3)).join(' ')).concat(Array.from({length:mesh.triVerts.length/3},(_,i)=>'f '+Array.from(mesh.triVerts.slice(i*3,i*3+3),v=>v+1).join(' '))).join('\n');solid.delete();section.delete();
 const narrow={...load('analyze').analyzeMesh(load('parseObj').parseObj(text,'independent-root-and-projection.obj'),null,1,'z'),id:'independent-narrow'},unchanged=JSON.stringify(narrow.connectionSurface);
 const branch=load('connectionFeatures').connectionFeatures(narrow).features.find(f=>f.kind==='branch'&&f.outward[0]>.9&&f.point[0]>7);assert(branch,'narrow projection with measured broad material root');assert(branch.width<2);
 const widened=load('featureAdaptation').adaptFeatureLanding(narrow,{feature:branch,width:2.1,depth:4,setback:0,elevation:0});assert(widened.valid,JSON.stringify(widened));
 const nt={id:narrow.id,ix:0,iy:0,iz:0,variant:0};
 const passage=load('walkingApproach').validateWalkingApproach(widened.model,nt,widened.point,branch.outward,2.1,6,[widened.model],[nt],[]);assert(passage.valid,JSON.stringify(passage));assert.equal(JSON.stringify(narrow.connectionSurface),unchanged);
 console.log('PASS a measured narrow projection is widened on a closed derived copy with a full-width path back into its original broad root');
 }
 const api=load('extensionReconstruction').extensionGeometryKernel(),lSection=new api.CrossSection([[[3.5,-1.5],[8,-1.5],[8,1.5],[6.5,1.5],[6.5,8],[3.5,8]]]),lSolid=lSection.extrude(1),lMesh=lSolid.getMesh();
 const lText=Array.from({length:lMesh.vertProperties.length/3},(_,i)=>'v '+Array.from(lMesh.vertProperties.slice(i*3,i*3+3)).join(' ')).concat(Array.from({length:lMesh.triVerts.length/3},(_,i)=>'f '+Array.from(lMesh.triVerts.slice(i*3,i*3+3),v=>v+1).join(' '))).join('\n');lSolid.delete();lSection.delete();
 const corridor={...load('analyze').analyzeMesh(load('parseObj').parseObj(lText,'independent-L-corridor.obj'),null,1,'z'),id:'independent-corridor'},ct={id: 'independent-corridor',ix:0,iy:0,iz:0,variant:0};
 const entry=load('surfaceAttachment').worldFromLocal([8-corridor.anchor[0],-corridor.anchor[1],1-corridor.anchor[2]],ct,corridor),direction=[1,0,0];
 assert.equal(load('walkingApproach').validateWalkingApproach(corridor,ct,entry,direction,2.1,6,[corridor],[ct],[]).valid,false);
 const connection=load('featureConnections').reconstructionContinuity(corridor,corridor,ct,entry,direction,2.1,[corridor],[ct],[]);
 assert(connection.valid,JSON.stringify(connection));assert.equal(connection.reason,'full-width turn into unchanged original corridor');
 assert(Math.abs(connection.joint[0]-(entry[0]-3))<1e-6);
 console.log('PASS a full-width approach can turn three feet inside real floor geometry without claiming support across its courtyard');
 const tightSection=new api.CrossSection([[[5.45,-1.5],[8,-1.5],[8,1.5],[7.55,1.5],[7.55,8],[5.45,8]]]),tightSolid=tightSection.extrude(1),tightMesh=tightSolid.getMesh();
 const tightText=Array.from({length:tightMesh.vertProperties.length/3},(_,i)=>'v '+Array.from(tightMesh.vertProperties.slice(i*3,i*3+3)).join(' ')).concat(Array.from({length:tightMesh.triVerts.length/3},(_,i)=>'f '+Array.from(tightMesh.triVerts.slice(i*3,i*3+3),v=>v+1).join(' '))).join('\n');tightSolid.delete();tightSection.delete();
 const tight={...load('analyze').analyzeMesh(load('parseObj').parseObj(tightText,'independent-narrow-turn.obj'),null,1,'z'),id:'independent-tight'},tt={id:tight.id,ix:0,iy:0,iz:0,variant:0};
 const tightEntry=load('surfaceAttachment').worldFromLocal([8-tight.anchor[0],-tight.anchor[1],1-tight.anchor[2]],tt,tight);
 const tightConnection=load('featureConnections').reconstructionContinuity(tight,tight,tt,tightEntry,direction,2.1,[tight],[tt],[]);
 assert(tightConnection.valid,JSON.stringify(tightConnection));assert(Math.abs(tightConnection.joint[0]-(tightEntry[0]-1.5))<1e-6);
 assert.equal(load('walkingApproach').validateWalkingApproach(tight,tt,tightEntry,direction,2.1,6,[tight],[tt],[]).valid,false);
 console.log('PASS an intermediate 1.5-ft turn center finds full-width physical circulation missed by the previous coarse probes');
 const ringSection=new api.CrossSection([[[-8,-8],[8,-8],[8,8],[-8,8]],[[-5.4,-5.4],[-5.4,5.4],[5.4,5.4],[5.4,-5.4]]]),ringSolid=ringSection.extrude(1),ringMesh=ringSolid.getMesh();
 const ringText=Array.from({length:ringMesh.vertProperties.length/3},(_,i)=>'v '+Array.from(ringMesh.vertProperties.slice(i*3,i*3+3)).join(' ')).concat(Array.from({length:ringMesh.triVerts.length/3},(_,i)=>'f '+Array.from(ringMesh.triVerts.slice(i*3,i*3+3),v=>v+1).join(' '))).join('\n');ringSolid.delete();ringSection.delete();
 const ring={...load('analyze').analyzeMesh(load('parseObj').parseObj(ringText,'independent-narrow-perimeter.obj'),null,1,'z'),id:'independent-ring'},rt={id:ring.id,ix:0,iy:0,iz:0,variant:0},ringBefore=JSON.stringify(ring.connectionSurface);
 const rim=load('connectionFeatures').connectionFeatures(ring).features.find(f=>f.outward[0]>.99&&f.point[0]>7&&Math.abs(f.point[1])<1e-6);assert(rim);
 assert.equal(load('walkingApproach').validateWalkingApproach(ring,rt,rim.point,rim.outward,2.1,3,[ring],[rt],[],true).valid,false);
 const landing=load('featureAdaptation').adaptFeatureLanding(ring,{feature:rim,width:2.1,depth:3,setback:-.75,elevation:0,datum:'boundary'});assert(landing.valid,JSON.stringify(landing));
 assert(load('walkingApproach').validateWalkingApproach(landing.model,rt,landing.point,rim.outward,2.1,3,[landing.model],[rt],[],true).valid);
 assert.equal(load('walkingApproach').validateWalkingApproach(landing.model,rt,landing.point,rim.outward,2.1,6,[landing.model],[rt],[]).valid,false);
 assert.equal(JSON.stringify(ring.connectionSurface),ringBefore);
 console.log('PASS an anchored material extension creates a three-foot flat landing from a 2.6-ft perimeter without filling its courtyard');
 // Half a foot of rise forces the short fixture routes to use stairs; the
 // shallower 0.4-ft case legitimately found a ramp without needing a landing.
 const arrivalSection=new api.CrossSection([[[-8,-8],[8,-8],[8,8],[-8,8]]]),arrivalSolid=arrivalSection.extrude(1.5),arrivalMesh=arrivalSolid.getMesh();
 const arrivalText=Array.from({length:arrivalMesh.vertProperties.length/3},(_,i)=>'v '+Array.from(arrivalMesh.vertProperties.slice(i*3,i*3+3)).join(' ')).concat(Array.from({length:arrivalMesh.triVerts.length/3},(_,i)=>'f '+Array.from(arrivalMesh.triVerts.slice(i*3,i*3+3),v=>v+1).join(' '))).join('\n');arrivalSolid.delete();arrivalSection.delete();
 const arrival={...load('analyze').analyzeMesh(load('parseObj').parseObj(arrivalText,'independent-arrival.obj'),null,1,'z'),id:'independent-arrival',sourceResponsiveExtensions:true};
 const sourceRing={...ring,sourceResponsiveExtensions:true},arrivalBefore=JSON.stringify(arrival.connectionSurface),placements=[rt,{id:arrival.id,ix:1,iy:0,iz:0,variant:0}];
 const generated=load('featureConnections').generateFeatureConnections([sourceRing,arrival],placements,{policy:{branch:false,corner:false,edge:true,other:false},pairs:6,adaptations:6,milliseconds:15000});
 assert(generated.pairs.length,JSON.stringify(generated.featureDiagnostics.attempts.map(a=>({operation:a.operation,reason:a.reason,details:a.details}))).slice(0,12000));assert.equal(generated.componentsAfter,1);
 assert(generated.workingModels[0].featureAdaptation?.plan.setback<0,JSON.stringify(generated.featureDiagnostics.attempts.map(a=>({operation:a.operation,reason:a.reason}))));assert.equal(JSON.stringify(ring.connectionSurface),ringBefore);assert.equal(JSON.stringify(arrival.connectionSurface),arrivalBefore);
 console.log('PASS the website feature generator constructs and validates a required landing extension without source-specific identifiers');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
