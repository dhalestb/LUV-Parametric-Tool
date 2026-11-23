import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireStudyStorage, saveStudy, studyResponse, studySummaries } from '@/server/amphitheaterStorage';
import type { AmphitheaterRequest, AmphitheaterResult } from '@/components/amphitheaterInteractiveTypes';
import { isWorkspaceTypology, workspaceDualReports, WORKSPACE_FIELD_PRESETS, workspaceTypologyName } from '@/components/workspaceDualRulesets';
import * as openHall from '@/components/workspace-rules/open-hall-workspace';
import { arrangeOfficeLetters as arrangeFlatPlate } from '@/components/workspace-rules/flat-deep-plan-plate';
import { flatPlateDimensions } from '@/components/workspace-rules/flat-deep-plan-plate.plan';

const {buildOpenHallGuideLetters, openHallColumnGridError, openHallFieldPresetError, openHallRequestGeometry, openHallSettingsError}=openHall;
export const maxDuration=300;
export const runtime='nodejs';
export const dynamic='force-dynamic';
const run=promisify(execFile);
const state=globalThis as typeof globalThis & {amphitheaterRunning?:boolean};
function validate(r: AmphitheaterRequest, useRuleGuides: boolean) {
  if (r.generator !== 'workspace-ten-rule' || r.envelopeVersion !== 'workspace-ten-rule' || !isWorkspaceTypology(r.workspaceTypology)) {
    throw Error('Choose Open Hall Workspace or Flat-Deep Plan Plate.');
  }
  if (!r.field || !(['width','depth','height'] as const).every(axis=>WORKSPACE_FIELD_PRESETS.some(size=>size===r.field[axis]))) {
    throw Error('Each field dimension must be 20, 40 or 60 feet.');
  }
  if (!Number.isFinite(r.preferredFeet) || r.preferredFeet <= 0) throw Error('Preferred letter size must be positive.');
  if (!Array.isArray(r.source)) throw Error('Invalid guide list.');
  if (useRuleGuides) {
    if (r.source.length || r.population !== 'auto') throw Error('New designs require an empty source and automatic population.');
  } else if (!r.source.length) throw Error('Open a saved study first.');
  if (r.source.some(p=>!p || p.letter!=='L' || ![p.x,p.y,p.z,p.rx,p.ry,p.rz,p.scale,p.scaleX,p.scaleY,p.scaleZ].every(Number.isFinite) || [p.scale,p.scaleX,p.scaleY,p.scaleZ].some(size=>size<=0))) {
    throw Error('Guide letters require L geometry with finite positions and rotations and positive scales.');
  }
  const error = r.workspaceTypology === 'open-hall-workspace' ? openHallSettingsError(r.openHall) : undefined;
  if (error) throw Error(error);
}
export async function GET(req:NextRequest){
 try{
  const id=req.nextUrl.searchParams.get('id');
  if(id){if(!/^[a-f0-9-]{36}$/.test(id))return NextResponse.json({error:'Invalid study ID'},{status:400});return await studyResponse(id);}
  return NextResponse.json({studies:await studySummaries()});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Study storage unavailable'},{status:503});}
}
export async function POST(req:NextRequest){
 let r:AmphitheaterRequest;
 let useRuleGuides:boolean;
 try{
  const text=await req.text();
  if(text.length>2_000_000)throw Error('Source request exceeds 2 MB.');
  const {guideSource,...request}=JSON.parse(text) as AmphitheaterRequest & {guideSource?:unknown};
  if(guideSource!==undefined&&guideSource!=='ruleset')throw Error('Unknown guide source.');
  r=request;
  useRuleGuides=guideSource==='ruleset';
  validate(r,useRuleGuides);
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}
 try{requireStudyStorage();}catch(e){return NextResponse.json({error:(e as Error).message},{status:503});}
 if(state.amphitheaterRunning)return NextResponse.json({error:'A comparison study is generating. Wait for it to finish.'},{status:409});
 state.amphitheaterRunning=true;const id=randomUUID();let out:string|undefined;
 try{
  const fieldError=r.workspaceTypology==='open-hall-workspace'?openHallFieldPresetError(r.field):undefined;
  if(fieldError)return NextResponse.json({error:fieldError+' Previous study retained.',id,geometryRejected:true},{status:422});
  const openHallGeometry=r.workspaceTypology==='open-hall-workspace'?openHallRequestGeometry(r.openHall,r.preferredFeet):undefined;
  const gridError=openHallGeometry?openHallColumnGridError(openHallGeometry):undefined;
  if(gridError)return NextResponse.json({error:gridError+' Previous study retained.',id,geometryRejected:true},{status:422});
  const workspaceField={
   ...r.field,
   preferredFeet:r.preferredFeet,
   ...(r.workspaceTypology==='flat-deep-plan-plate'?{flatPlate:r.flatPlate}:{}),
   ...openHallGeometry,
  };
  const source=useRuleGuides&&openHallGeometry?buildOpenHallGuideLetters(workspaceField):r.source;
  const arrange=r.workspaceTypology==='open-hall-workspace'?openHall.arrangeOfficeLetters:arrangeFlatPlate;
  const arranged=arrange(source,r.workspaceTypology,12,[0,0,0],workspaceField);
  if(!arranged.officePlan)return NextResponse.json({error:'The selected source could not be arranged for this workspace typology. Previous study retained.',id,geometryRejected:true},{status:422});
  const dual=workspaceDualReports(arranged.officePlan);
  if(dual.letterArrangement.overall==='fail'){
   const failed=dual.letterArrangement.rules.filter(rule=>rule.status==='fail').map(rule=>`${rule.id} ${rule.title}: ${rule.evidence[0]??'failed'}`);
   return NextResponse.json({error:`Letter arrangement ruleset failed before architectural generation. ${failed.join(' | ')} Previous study retained.`,id,geometryRejected:true,letterArrangementReport:dual.letterArrangement},{status:422});
  }
  r={
   ...r,
   typologyName:workspaceTypologyName(r.workspaceTypology),
   envelopeVersion:'workspace-ten-rule',
   letterArrangementRulesetId:dual.letterArrangement.rulesetId,
   letterArrangementRulesetVersion:dual.letterArrangement.rulesetVersion,
   architecturalGenerationRulesetId:dual.architecturalGeneration.rulesetId,
   architecturalGenerationRulesetVersion:dual.architecturalGeneration.rulesetVersion,
   rulesetId:`${dual.letterArrangement.rulesetId}+${dual.architecturalGeneration.rulesetId}`,
   rulesetVersion:`${dual.letterArrangement.rulesetVersion}/${dual.architecturalGeneration.rulesetVersion}`,
   workspacePlan:arranged.officePlan,
   letterArrangementReport:dual.letterArrangement,
   architecturalGenerationReport:dual.architecturalGeneration,
   source:arranged.placements,
   ...(useRuleGuides||r.workspaceTypology==='flat-deep-plan-plate'?{
    population:arranged.placements.length,
    sourceName:`${workspaceTypologyName(r.workspaceTypology!)} · ${arranged.placements.length} letters`,
    ...(openHallGeometry
     ? {openHall:{...r.openHall,...openHallGeometry}}
     : {flatPlate:{...r.flatPlate,...flatPlateDimensions(r.flatPlate)}}),
   }:{}),
  };
 out=await mkdtemp(path.join(tmpdir(),'luv-amphitheater-'));const file=path.join(out,'request.json');await writeFile(file,JSON.stringify(r,null,2));
 await run(process.execPath,[path.join(process.cwd(),'scripts/proto-form-worker.cjs'),file,out],{cwd:process.cwd(),windowsHide:true,timeout:180_000,maxBuffer:4_000_000});
 const result:AmphitheaterResult=JSON.parse(await readFile(path.join(out,'result.json'),'utf8'));result.id=id;
 await saveStudy(result);const saved=await studyResponse(id);if(!saved.ok)throw Error('Saved study could not be read back. Reopen study '+id);return new Response(saved.body,{status:201,headers:saved.headers});
 }catch(e){const detail=e instanceof Error?e.message:'Generation failed';console.error('Amphitheater study failed',id,detail);
  if(r.generator==='workspace-ten-rule'&&(r.workspaceTypology==='open-hall-workspace'||r.workspaceTypology==='flat-deep-plan-plate')){
   const meshFailure=detail.match(/^Error: (Final workspace geometry failed the architectural generation ruleset\.[^\r\n]*)/m)?.[1];
   const inputFailure=r.workspaceTypology==='open-hall-workspace'
    ?detail.startsWith('Roof inset leaves no space between pillar edges')
    :detail.startsWith('Flat Deep Plan Plate ');
   const failure=meshFailure??(inputFailure?detail:undefined);
   if(failure)return NextResponse.json({error:failure+' Previous study retained.',id,geometryRejected:true},{status:422});
  }
  return NextResponse.json({error:reasonForRejection(detail)+' Previous study retained.',id,geometryRejected:true},{status:422});
 } finally {state.amphitheaterRunning=false;if(out)await rm(out,{recursive:true,force:true}).catch(()=>{});}
}

function reasonForRejection(detail:string) {
 const match=detail.match(/^Error: ((?:Workspace|Letter arrangement|Letter \d+)[^\r\n]*)/m);
 return match?.[1]??'Generation failed. Check the selected dimensions and guide sizes.';
}
