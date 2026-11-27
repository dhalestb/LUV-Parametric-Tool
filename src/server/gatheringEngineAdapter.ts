import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import manifest from './gatheringEngineManifest.json';
import {GATHERING_ENGINE_REVISION} from '../components/gatheringEngineProvenance';
import {studyResponse} from '../../vendor/gathering-preserved/src/server/amphitheaterStorage';
import {fitPlateCellPlacement} from './insertedPlateCellFitting';
import {fitClosedPlatePlacement} from './insertedPlateClosedPlacement';
import {PLATE_PLACEMENT_REVISION,CLOSED_PLATE_PLACEMENT_REVISION_V2,LEGACY_PLATE_PLACEMENT_REVISION,plateLocalBounds} from '../components/gathering-recovery/insertedPlateCellPlacement';
import plateValidationManifest from './gatheringPlateValidationManifest.json';
import closedPlateManifest from './gatheringPlateClosedManifest.json';
import type {AmphitheaterRequest,AmphitheaterResult} from '../../vendor/gathering-preserved/src/components/amphitheaterInteractiveTypes';

const run=promisify(execFile),hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
type EngineFields={gatheringEngineRevision?:string;gatheringEngineBundleSHA256?:string;gatheringParentStudyId?:string;gatheringOperation?:'new'|'regenerate'|'verified-copy'};
type PlateIdentity={revision?:string;validationSHA256?:string};
type Parent={request:EngineFields&{envelopeVersion?:string;sourceSnapshot?:{platePlacement?:PlateIdentity}};provenance?:{gatheringEngine?:{revision?:string;bundleSHA256?:string}}};
export function assertGatheringRevision(fields:EngineFields){
 if(fields.gatheringEngineRevision!==undefined&&fields.gatheringEngineRevision!==GATHERING_ENGINE_REVISION)throw Error('Unknown saved Gathering engine revision. The saved study was not changed.');
 if(fields.gatheringEngineBundleSHA256!==undefined&&fields.gatheringEngineBundleSHA256!==manifest.bundleSHA256)throw Error('Saved Gathering engine dependencies differ from the verified checkpoint. The saved study was not changed.');
}
/** Each launch verifies the full matched dependency set; no shared-engine fallback. */
export async function verifiedGatheringContext(root=process.cwd(),read:(file:string)=>Promise<Uint8Array>=file=>readFile(file)){
 if(manifest.revision!==GATHERING_ENGINE_REVISION||manifest.files.length!==63||hash(JSON.stringify(manifest.files))!==manifest.bundleSHA256)throw Error('Gathering engine manifest differs from the verified checkpoint.');
 const packageRoot=path.resolve(root,manifest.package);
 await Promise.all(manifest.files.map(async entry=>{
  const file=path.resolve(packageRoot,entry.path);
  if(!file.startsWith(packageRoot+path.sep)||hash(await read(file))!==entry.sha256)throw Error('Gathering engine dependency differs from the verified checkpoint: '+entry.path);
 }));
 return {packageRoot,worker:path.join(packageRoot,manifest.worker),revision:manifest.revision,bundleSHA256:manifest.bundleSHA256};
}
export async function prepareGatheringRequest<T extends {envelopeVersion?:string}>(request:T,loadParent:(id:string)=>Promise<Parent>=async id=>{
 const response=await studyResponse(id);if(!response.ok)throw Error('The parent Gathering study could not be reopened. Its saved geometry was not changed.');return response.json();
}):Promise<T&EngineFields>{
 const fields=request as T&EngineFields;assertGatheringRevision(fields);
 if(fields.gatheringOperation!==undefined&&!['new','regenerate','verified-copy'].includes(fields.gatheringOperation))throw Error('Unknown Gathering generation operation.');
 if(fields.gatheringParentStudyId){
  if(!/^[a-f0-9-]{36}$/.test(fields.gatheringParentStudyId))throw Error('Invalid parent Gathering study ID.');
  if(fields.gatheringOperation!=='regenerate'&&fields.gatheringOperation!=='verified-copy')throw Error('Choose regeneration or an explicit verified copy for an existing Gathering study.');
  const parent=await loadParent(fields.gatheringParentStudyId);
  assertGatheringRevision(parent.request);
  assertGatheringRevision({gatheringEngineRevision:parent.provenance?.gatheringEngine?.revision,gatheringEngineBundleSHA256:parent.provenance?.gatheringEngine?.bundleSHA256});
  const recorded={gatheringEngineRevision:parent.request.gatheringEngineRevision??parent.provenance?.gatheringEngine?.revision,gatheringEngineBundleSHA256:parent.request.gatheringEngineBundleSHA256??parent.provenance?.gatheringEngine?.bundleSHA256};
  assertGatheringRevision(recorded);
  if(parent.request.envelopeVersion!==request.envelopeVersion)throw Error('Regeneration must retain the saved Gathering typology. Choose New Design to change typology.');
  const previousPlate=parent.request.sourceSnapshot?.platePlacement,nextPlate=(request as T&{sourceSnapshot?:{platePlacement?:PlateIdentity}}).sourceSnapshot?.platePlacement;
  if(previousPlate?.revision!==nextPlate?.revision||previousPlate?.validationSHA256!==nextPlate?.validationSHA256)throw Error('Regeneration must retain the saved Plate placement and adapter revision. Choose Generate Design to use the current rules.');
  if(!recorded.gatheringEngineRevision&&fields.gatheringOperation!=='verified-copy')throw Error('This historical study has no recorded Gathering engine. Generate a verified copy to retain its original saved geometry.');
  if(recorded.gatheringEngineRevision&&fields.gatheringOperation!=='regenerate')throw Error('This Gathering study already records its engine. Regenerate it using that recorded revision.');
 }else if(fields.gatheringOperation==='regenerate'||fields.gatheringOperation==='verified-copy')throw Error('Gathering regeneration requires its parent saved study.');
 return {...request,gatheringEngineRevision:manifest.revision,gatheringEngineBundleSHA256:manifest.bundleSHA256,gatheringOperation:fields.gatheringOperation??'new'};
}
export async function runGatheringWorker(file:string,out:string){
 const request=JSON.parse(await readFile(file,'utf8')) as AmphitheaterRequest&EngineFields;assertGatheringRevision(request);
 const context=await verifiedGatheringContext();
 const placement=(request.sourceSnapshot as {platePlacement?:{revision?:string;validationSHA256?:string}}|undefined)?.platePlacement;
 if(placement&&placement.revision!==PLATE_PLACEMENT_REVISION&&placement.revision!==CLOSED_PLATE_PLACEMENT_REVISION_V2&&placement.revision!==LEGACY_PLATE_PLACEMENT_REVISION)throw Error('Unknown Inserted Horizontal Plate placement revision. The saved study was not changed.');
 const sameLevelPlate=placement?.revision===PLATE_PLACEMENT_REVISION,closedPlate=sameLevelPlate||placement?.revision===CLOSED_PLATE_PLACEMENT_REVISION_V2;
 const validationFiles=sameLevelPlate?closedPlateManifest.files:[{file:plateValidationManifest.file,sha256:plateValidationManifest.sha256}],validationHash=sameLevelPlate?closedPlateManifest.bundleSHA256:plateValidationManifest.sha256;
 if(closedPlate){
  for(const entry of validationFiles)if(hash(await readFile(path.resolve(process.cwd(),entry.file)))!==entry.sha256)throw Error('Plate corner adapter differs from the recorded revision.');
  if(sameLevelPlate&&hash(JSON.stringify(closedPlateManifest.files))!==closedPlateManifest.bundleSHA256)throw Error('Plate corner adapter manifest differs.');
  if(placement.validationSHA256!==undefined&&placement.validationSHA256!==validationHash)throw Error('Saved Plate corner validator revision differs. The saved study was not changed.');
  if(request.gatheringOperation!=='new'&&placement.validationSHA256===undefined)throw Error('Saved closed Plate study has no recorded corner validator. The saved study was not changed.');
  request.sourceSnapshot={...(request.sourceSnapshot as object),platePlacement:{...placement,validationSHA256:validationHash}};
 }
 const launch=(input:string,folder:string)=>run(process.execPath,[...(closedPlate?validationFiles.flatMap(entry=>['-r',path.resolve(process.cwd(),entry.file)]):[]),context.worker,input,folder],{cwd:context.packageRoot,windowsHide:true,timeout:180_000,maxBuffer:4_000_000,...(closedPlate?{env:{...process.env,LUV_GATHERING_PLATE_CLOSURE_V2:'1'}}:{})});
 if(request.envelopeVersion==='inserted-plate'&&request.insertedPlate?.version==='edge-connected'&&placement&&request.gatheringOperation==='new'){
  const result=await (closedPlate?fitClosedPlatePlacement:fitPlateCellPlacement)(request,async(candidate,index)=>{
   const folder=path.join(out,'plate-cell-'+index);await mkdir(folder,{recursive:true});const candidateFile=path.join(folder,'request.json');
   // A measured cap may be above a different final wall bearing. Measure the
   // final pier with the same provisional cap rule before seating it again.
   let preliminary=candidate;
   if(closedPlate){const capIndex=candidate.source.findIndex(p=>p.letter==='L'&&Math.abs(p.rx)<1e-8&&Math.abs(p.ry)<1e-8),cap=candidate.source[capIndex],anchor=candidate.source.find(p=>p.letter==='V'&&p.levelIndex===cap?.levelIndex);
    if(cap&&anchor){const box=plateLocalBounds(cap),z=Math.max(-candidate.field.height/2-box.min.z+.000001,Math.min(candidate.field.height/2-box.max.z-.000001,anchor.z+candidate.preferredFeet*.45));preliminary={...candidate,source:candidate.source.map((p,i)=>i===capIndex?{...p,z}:p)};}}
   await writeFile(candidateFile,JSON.stringify(preliminary));
   await launch(candidateFile,folder);
   const initial=JSON.parse(await readFile(path.join(folder,'result.json'),'utf8')) as AmphitheaterResult;
   const pier=(initial.plateReport as unknown as {pier?:{source:string;top:number}})?.pier;
   if(!pier)throw Error('Incomplete Study 135 corner-pier bearing report.');
   const capIndex=candidate.source.findIndex((p,i)=>p.letter==='L'&&Math.abs(p.rx)<1e-8&&Math.abs(p.ry)<1e-8&&pier.source==='L-'+(i+1));
   if(capIndex<0)throw Error('Incomplete Study 135 horizontal corner cap.');
   const cap=candidate.source[capIndex],box=plateLocalBounds(cap),z=pier.top-candidate.field.height/2-box.min.z-.000001;
   if(z+box.max.z>candidate.field.height/2)throw Error('Cap extends outside the selected field.');
   const seated={...candidate,source:candidate.source.map((p,i)=>i===capIndex?{...p,z}:p)};
   await writeFile(candidateFile,JSON.stringify(seated));
   await launch(candidateFile,folder);
   return JSON.parse(await readFile(path.join(folder,'result.json'),'utf8')) as AmphitheaterResult;
  });
  await writeFile(file,JSON.stringify(result.request));await writeFile(path.join(out,'result.json'),JSON.stringify(result));return {stdout:'Study 135 cell placement validated',stderr:''};
 }
 return launch(path.resolve(file),path.resolve(out));
}
export function stampGatheringResult<T extends {request:object}>(result:T){
 const request=result.request as EngineFields;assertGatheringRevision(request);
 if(request.gatheringEngineRevision!==manifest.revision||request.gatheringEngineBundleSHA256!==manifest.bundleSHA256)throw Error('Gathering worker did not retain its recorded engine revision.');
 const previous=(result as T&{provenance?:Record<string,unknown>}).provenance??{};
 return {...result,provenance:{...previous,gatheringEngine:{revision:manifest.revision,bundleSHA256:manifest.bundleSHA256,checkpoint:manifest.checkpoint,dependencies:manifest.files.length,adapter:'package-scoped-gathering-v1'},...(request.gatheringParentStudyId?{parentStudyId:request.gatheringParentStudyId,operation:request.gatheringOperation}:{})}};
}
