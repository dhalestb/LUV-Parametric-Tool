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
 if(request.generator==='source-preserving'){
 const data=await require('./source-envelope.cjs').buildSource(request,out);
 const check=spawnSync(process.execPath,[path.join(__dirname,'../proof/rule-validation.cjs'),out],{encoding:'utf8'});
 if(check.status!==0)throw Error('Exported geometry rejected: '+check.stderr);
 const v=JSON.parse(fs.readFileSync(path.join(out,'validation.json')));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...data,id:path.basename(out),created:new Date().toISOString(),request,generator:request.generator,validation:{passed:true,selfIntersectionPairs:v.selfIntersectionPairs,nonAdjacentTriangleChecks:v.nonAdjacentTriangleChecks,legacyFlags:v.broadPhaseFlags},warnings:['Source-derived stepped banks; recess backing, circulation and occupiability have not been verified.']}));
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



