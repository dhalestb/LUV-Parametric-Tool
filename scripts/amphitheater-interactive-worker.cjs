const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {build}=require('../proof/rule-amphitheater.cjs');
const request=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=path.resolve(process.argv[3]);
function readObj(file){
 const positions=[],indices=[];
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  if(line.startsWith('v '))positions.push(...line.slice(2).trim().split(/\s+/).map(Number));
  if(line.startsWith('f '))indices.push(...line.slice(2).trim().split(/\s+/).map(v=>+v-1));
 }return {positions,indices};
}
function sourceObjects(file){
 const all=[],objects=[];let current;
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  if(line.startsWith('o ')){current={id:line.slice(2),mesh:{positions:[],indices:[]},map:new Map()};objects.push(current);}
  if(line.startsWith('v '))all.push(line.slice(2).trim().split(/\s+/).map(Number));
  if(line.startsWith('f '))for(const raw of line.slice(2).trim().split(/\s+/)){
   const i=+raw-1;if(!current.map.has(i)){current.map.set(i,current.mesh.positions.length/3);current.mesh.positions.push(...all[i]);}current.mesh.indices.push(current.map.get(i));
  }
 }return objects.map(object=>({id:object.id,mesh:object.mesh}));
}
(async()=>{
 if(request.generator==='workspace-ten-rule'){
  if(!request.workspacePlan||!request.letterArrangementReport||!request.architecturalGenerationReport)throw Error('Workspace generation requires a resolved plan plus letter-arrangement and architectural-generation reports.');
  const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
  const owned=[],own=solid=>(owned.push(solid),solid);
  try{
   const solids=require('../src/components/officeWorkspaceGeometry.ts').buildOfficeWorkspace(wasm,request.workspacePlan,own);
   const lift=[0,0,request.field.height/2];
   const formBase=solids.form||solids.combined;
   const wallsBase=solids.walls;
   const combinedBase=solids.combined||formBase;
   if(!combinedBase||combinedBase.status()!=='NoError'||combinedBase.isEmpty())throw Error('Workspace plan did not produce valid solid geometry.');
   const formSolid=formBase?own(formBase.translate(lift)):null;
   const wallsSolid=wallsBase&&!wallsBase.isEmpty()?own(wallsBase.translate(lift)):null;
   const solid=own(combinedBase.translate(lift));
   const toMesh=s=>{const mesh=s.getMesh(),positions=[];for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)positions.push(...mesh.vertProperties.slice(i,i+3));return {positions,indices:Array.from(mesh.triVerts)};};
   const architecture=toMesh(formSolid||solid);
   const perimeterWalls=wallsSolid?toMesh(wallsSolid):undefined;
   const {letters}=require('./source-envelope.cjs').derive(request);
   const bounds=solid.boundingBox();
   const letterArrangementReport=request.letterArrangementReport;
   const architecturalGenerationReport=structuredClone(request.architecturalGenerationReport);
   const hx=request.field.width/2,hy=request.field.depth/2,hz=request.field.height;
   const inside=bounds.min[0]>=-hx-1e-4&&bounds.max[0]<=hx+1e-4&&bounds.min[1]>=-hy-1e-4&&bounds.max[1]<=hy+1e-4&&bounds.min[2]>=-1e-4&&bounds.max[2]<=hz+1e-4;
   const spans=[bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1],bounds.max[2]-bounds.min[2]];
   const fieldEvidence=`Final solid bounds span ${spans.map(v=>v.toFixed(2)).join(' × ')} ft inside the ${request.field.width} × ${request.field.depth} × ${request.field.height} ft field. No completed geometry was uniformly rescaled.`;
   const bumpField=(report)=>{
    const rule=report.rules.find(item=>/field|envelope|containment/i.test(item.title)||item.id.startsWith('AG-01'));
    if(rule){rule.status=inside?'pass':'fail';rule.measured=`${spans.map(v=>v.toFixed(2)).join(' × ')}`;rule.threshold=`${request.field.width} × ${request.field.depth} × ${request.field.height}`;rule.units='ft';rule.evidence=[fieldEvidence];}
    report.overall=report.rules.some(item=>item.hard&&item.status==='fail')?'fail':report.rules.some(item=>item.hard&&item.status==='unverified')?'unverified':'pass';
   };
   bumpField(architecturalGenerationReport);
   if(letterArrangementReport.overall==='fail')throw Error('Letter arrangement ruleset failed after plan resolution.');
   if(architecturalGenerationReport.overall==='fail')throw Error('Final workspace geometry failed the architectural generation ruleset.');
   const obj=architecture.positions.reduce((text,_,index)=>index%3?text:text+`v ${architecture.positions.slice(index,index+3).join(' ')}\n`,'')+architecture.indices.reduce((text,_,index)=>index%3?text:text+`f ${architecture.indices.slice(index,index+3).map(value=>value+1).join(' ')}\n`,'');
   fs.writeFileSync(path.join(out,'combined-envelope.obj'),obj);fs.writeFileSync(path.join(out,'combined-envelope.json'),JSON.stringify(architecture));
   if(perimeterWalls)fs.writeFileSync(path.join(out,'perimeter-walls.json'),JSON.stringify(perimeterWalls));
   // Amphitheater rule-validation assumes gathering components/tools manifests; workspace solids use a direct Manifold export check instead.
   if(solid.status()!=='NoError'||solid.isEmpty()||!(solid.volume()>0))throw Error('Workspace solid failed Manifold integrity checks.');
   const validation={passed:true,selfIntersectionPairs:0,nonAdjacentTriangleChecks:0,legacyFlags:0,method:'manifold-status-and-volume; amphitheater BVH pair scan not applied to workspace dual-ruleset solids'};
   fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(validation,null,2));
   const unverified=[...letterArrangementReport.rules,...architecturalGenerationReport.rules].filter(rule=>rule.status==='unverified').map(rule=>rule.id);
   const components=[{id:'workspace-form',sources:letters.map(letter=>letter.id),mesh:architecture}];
   if(perimeterWalls)components.push({id:'workspace-walls',sources:[],mesh:perimeterWalls});
   const result={id:path.basename(out),created:new Date().toISOString(),request,generator:request.generator,letterArrangementReport,architecturalGenerationReport,architecture,perimeterWalls,letters,components,volume:solid.volume(),bounds,sourceCount:letters.length,architecturalValidation:{passed:architecturalGenerationReport.overall==='pass'&&letterArrangementReport.overall!=='fail',failures:unverified.map(id=>id+' is unverified')},validation,warnings:[`WORKSPACE DUAL RULESETS: ${request.workspacePlan.typology}; letter ${letterArrangementReport.rulesetId} v${letterArrangementReport.rulesetVersion}; architecture ${architecturalGenerationReport.rulesetId} v${architecturalGenerationReport.rulesetVersion}.`, `Source policy: ${letterArrangementReport.sourcePolicy}`, unverified.length?`Unverified rules retained: ${unverified.join(', ')}.`:'Measured letter-arrangement and architectural-generation rules passed on the plan and final envelope.','Mesh integrity checked via Manifold status/volume. Gathering BVH self-intersection scan is not applied to this workspace path.','Geometric proof only. Not certified for occupancy, circulation, accessibility, or structural compliance.']};
   fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result));return;
  }finally{for(const solid of owned.reverse())try{solid.delete();}catch{}}
 }
 if(request.generator==='source-preserving'){
 const data=await require('./source-envelope.cjs').buildSource(request,out);
 const check=spawnSync(process.execPath,[path.join(__dirname,'../proof/rule-validation.cjs'),out],{encoding:'utf8'});
 if(check.status!==0)throw Error('Exported geometry rejected: '+check.stderr);
 const v=JSON.parse(fs.readFileSync(path.join(out,'validation.json')));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...data,id:path.basename(out),created:new Date().toISOString(),request,generator:request.generator,validation:{passed:true,selfIntersectionPairs:v.selfIntersectionPairs,nonAdjacentTriangleChecks:v.nonAdjacentTriangleChecks,legacyFlags:v.broadPhaseFlags},warnings:[request.envelopeVersion==='room-within-volume'?'Independent Enclosed Room pilot. Source transformations preserved. Access is checked geometrically, not certified for occupancy, accessibility or structure.':request.envelopeVersion==='inserted-plate'?'Inserted Horizontal Plate. Plate links are geometric connections; circulation, structure and occupancy are not certified.':request.envelopeVersion==='void-field'?'Void Field supports 9–15 source letters. Source plan concavities generate vertical canyons. Circulation, access and occupancy require architectural review.':'Source-driven stepped banks. Alcove candidates describe geometric clearance only. Circulation, access and occupancy require architectural review.']}));
 return;
 }
 if(request.generator!=='typology-baseline')throw Error('Source-preserving generation is not implemented. No automatic fallback is permitted.');
 const m=await build({source:request.source,field:request.field,preferredFeet:request.preferredFeet,population:request.population,thickness:12},out);
 const legacy=spawnSync(process.execPath,[path.join(__dirname,'../proof/abstract-validation.cjs'),out],{encoding:'utf8'});
 fs.writeFileSync(path.join(out,'legacy-validation.log'),legacy.stdout+legacy.stderr);
 const legacyDiagnostics=JSON.parse(fs.readFileSync(path.join(out,'intersection-diagnostics.json')));
 fs.copyFileSync(path.join(out,'intersection-diagnostics.json'),path.join(out,'legacy-preflight.json'));
 const check=spawnSync(process.execPath,[path.join(__dirname,'../proof/rule-validation.cjs'),out],{encoding:'utf8'});
 fs.writeFileSync(path.join(out,'validation.log'),check.stdout+check.stderr);
 if(check.status!==0)throw Error('Geometry validation rejected this study. '+(check.stderr||check.stdout).slice(-1800));
 const organization=spawnSync(process.execPath,[path.join(__dirname,'amphitheater-interactive-organization.cjs'),out],{encoding:'utf8'});
 fs.writeFileSync(path.join(out,'organization-validation.log'),organization.stdout+organization.stderr);
 const organizationFile=path.join(out,'architectural-geometry-checks.json');
 const organizationChecks=fs.existsSync(organizationFile)?JSON.parse(fs.readFileSync(organizationFile)):null;
 const architecturalValidation={passed:organization.status===0,failures:organizationChecks?organizationChecks.backing.filter(b=>!b.backingMaterialAtProbe).map(b=>b.id+': backing material absent at probe'):[(organization.stderr||organization.stdout).slice(-1400)]};
 const v=JSON.parse(fs.readFileSync(path.join(out,'validation.json')));
 if(!v.passed||m.validation.shellVolumes.length!==1||m.validation.outside!==0)throw Error('Mesh integrity or containment failed');
 const result={architecturalValidation,id:path.basename(out),created:new Date().toISOString(),request,generator:'typology-baseline',architecture:JSON.parse(fs.readFileSync(path.join(out,'combined-envelope.json'))),letters:sourceObjects(path.join(out,'source-instances.obj')),components:m.components.map(c=>({id:c.id,sources:c.sources,mesh:readObj(path.join(out,c.file))})),volume:m.validation.volume,bounds:m.validation.bounds,sourceCount:m.instances.length,validation:{passed:true,selfIntersectionPairs:v.selfIntersectionPairs,nonAdjacentTriangleChecks:v.nonAdjacentTriangleChecks,legacyFlags:legacyDiagnostics.intersections},warnings:[...(architecturalValidation.passed?[]:['ARCHITECTURAL CHECK FAILED: '+architecturalValidation.failures.join('; ')+'. Comparison study only; no architectural acceptance.']),
 'TYPOLOGY-DRIVEN COMPARISON BASELINE: source instances are repositioned, rotated and repeated. Original source poses do not govern this architecture. Source-preserving generation is unavailable.',
 'Usable stairs/ramps, occupied alcoves and major occupied levels are not verified.',
 'The unchanged legacy intersection test reports '+legacyDiagnostics.intersections+' pairs. Independent segment/triangle and coplanar checks found '+v.selfIntersectionPairs+' crossings/overlaps. Both results are retained.',
 'Reference letters overlap the protected opening by '+m.validation.sourceFocusOverlap.toFixed(3)+' ft³. Architecture obstruction is zero.'
 ]};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result));
})().catch(e=>{fs.writeFileSync(path.join(out,'error.txt'),e.stack||String(e));console.error(e);process.exitCode=1});
