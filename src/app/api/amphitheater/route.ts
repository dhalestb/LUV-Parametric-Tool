import { NextRequest, NextResponse } from 'next/server';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {requireStudyStorage,saveStudy,studyResponse,studySummaries} from '@/server/amphitheaterStorage';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AmphitheaterRequest,AmphitheaterResult } from '@/components/amphitheaterInteractiveTypes';
export const maxDuration=300;
export const runtime='nodejs';
export const dynamic='force-dynamic';
const run=promisify(execFile);
const state=globalThis as typeof globalThis & {amphitheaterRunning?:boolean};
function validate(r:AmphitheaterRequest){
 if(!['typology-baseline','source-preserving'].includes(r.generator))throw Error('Unknown generator.');
 if(!r.field||!['width','depth','height'].every(k=>[20,40,60].includes(r.field[k as keyof typeof r.field])))throw Error('Each field dimension must be 20, 40 or 60 feet.');
 if(!Number.isFinite(r.preferredFeet)||r.preferredFeet<=0)throw Error('Preferred letter size must be positive.');
 if(r.population!=='auto'&&(!Number.isSafeInteger(r.population)||r.population<(r.generator==='typology-baseline'?4:2)))throw Error('Population must be auto or an integer supplying at least two L boundaries, one U and one V.');
 if(!Array.isArray(r.source)||!r.source.length)throw Error('Choose a source composition.');
 for(const p of r.source){if(!['L','U','V'].includes(p.letter)||!['x','y','z','rx','ry','rz','scale','scaleX','scaleY','scaleZ'].every(k=>Number.isFinite(p[k as keyof typeof p])))throw Error('Source placements require L/U/V and finite position, rotation and scale values.');if([p.scale,p.scaleX,p.scaleY,p.scaleZ].some(n=>n<=0))throw Error('Source scales must be positive.');}
 if(r.generator==='source-preserving'&&r.envelopeVersion==='vertical-walls'){
  for(const [i,p] of r.source.entries()){
   if(p.rotationOrder!==undefined&&!['XYZ','ZYX'].includes(p.rotationOrder))throw Error('Unsupported source rotation order.');
   if(p.voidKind!==undefined&&!['alcove','through'].includes(p.voidKind))throw Error('Letter '+(i+1)+' needs a through opening or recessed alcove.');
   if(p.voidKind==='alcove'&&p.alcoveDepth!==undefined&&(!Number.isFinite(p.alcoveDepth)||p.alcoveDepth<=0))throw Error('Enter a positive alcove depth in feet for letter '+(i+1)+'.');
  }
 }
 if(r.envelopeVersion==='room-within-volume'&&(r.generator!=='source-preserving'||!['L','U','V'].every(role=>r.source.some(p=>p.letter===role))))throw Error('The room pilot requires preserved L, U and V source letters.');
 if(r.envelopeVersion==='inserted-plate'){if(r.insertedPlate?.version!==undefined&&!['legacy','spanning-v2','suspended','two-u','merged-walls','edge-connected'].includes(r.insertedPlate.version))throw Error('Unknown plate mode.');const spanning=!!r.insertedPlate && r.insertedPlate.version!=='legacy';if(r.generator!=='source-preserving'||(r.insertedPlate?.version!=='edge-connected'&&r.insertedPlate?.version!=='merged-walls'&&(r.source.length<9||r.source.length>(spanning?18:9))))throw Error(spanning?'Inserted Plate requires 9–18 source letters.':'Legacy plate pilot requires nine source letters.');}
 if(r.envelopeVersion==='void-field'){
  if(r.voidField?.levelCount!==undefined&&![3,4].includes(r.voidField.levelCount))throw Error('Void Field supports three or four levels.');
  if(r.voidField?.levelCount===4&&r.source.length!==15)throw Error('Four-level Void Field requires 15 source letters. Use the explicit add-fourth-level operation to retain existing sources.');
  if(r.source.some(p=>p.levelIndex!==undefined&&(!Number.isSafeInteger(p.levelIndex)||p.levelIndex<0||p.levelIndex>=(r.voidField?.levelCount??3))))throw Error('A source level index is outside the requested occupied levels.');
  if(r.population!=='auto'&&(r.population<9||r.population>15))throw Error('Void Field requested population must be 9–15 or Automatic.');
  if(r.voidField?.facadeMode!==undefined&&!['vertical','face-normal'].includes(r.voidField.facadeMode))throw Error('Unknown facade sweep mode.');
  if(r.voidField?.atriumBoundary!==undefined&&!['open','enclosed'].includes(r.voidField.atriumBoundary))throw Error('Unknown atrium boundary mode.');
  if(r.generator!=='source-preserving'||r.source.length<9||r.source.length>15)throw Error('Void Field requires 9–15 source letters and source-preserving generation.');
  if(r.voidField?.taper!==undefined&&(!Number.isFinite(r.voidField.taper)||r.voidField.taper<0||r.voidField.taper>1))throw Error('Void taper must be between 0 and 1.');
 }
 if(r.generator==='typology-baseline'&&!['L','U','V'].every(role=>r.source.some(s=>s.letter===role)))throw Error('This comparison baseline requires L, U and V source functions.');
}
export async function GET(req:NextRequest){
 try{
  const id=req.nextUrl.searchParams.get('id');
  if(id){if(!/^[a-f0-9-]{36}$/.test(id))return NextResponse.json({error:'Invalid study ID'},{status:400});return await studyResponse(id);}
  const fixture=JSON.parse(await readFile(path.join(process.cwd(),'proof/input.json'),'utf8'));
  return NextResponse.json({fixture:fixture.source,studies:await studySummaries()});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Study storage unavailable'},{status:503});}
}
export async function POST(req:NextRequest){
 let r:AmphitheaterRequest;
 try{const text=await req.text();if(text.length>2_000_000)throw Error('Source request exceeds 2 MB.');r=JSON.parse(text);validate(r);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}
 try{requireStudyStorage();}catch(e){return NextResponse.json({error:(e as Error).message},{status:503});}
 if(state.amphitheaterRunning)return NextResponse.json({error:'A comparison study is generating. Wait for it to finish.'},{status:409});
 state.amphitheaterRunning=true;const id=randomUUID();let out:string|undefined;
 try{
 out=await mkdtemp(path.join(tmpdir(),'luv-amphitheater-'));const file=path.join(out,'request.json');await writeFile(file,JSON.stringify(r,null,2));
 await run(process.execPath,[path.join(process.cwd(),'scripts/amphitheater-interactive-worker.cjs'),file,out],{cwd:process.cwd(),windowsHide:true,timeout:180_000,maxBuffer:4_000_000});
 const result:AmphitheaterResult=JSON.parse(await readFile(path.join(out,'result.json'),'utf8'));result.id=id;
 await saveStudy(result);const saved=await studyResponse(id);if(!saved.ok)throw Error('Saved study could not be read back. Reopen study '+id);return new Response(saved.body,{status:201,headers:saved.headers});
 }catch(e){const detail=e instanceof Error?e.message:'Generation failed';console.error('Amphitheater study failed',id,detail);const missed=detail.match(/Perpendicular wall misses its receiver: ([LUV0-9, -]+)/);const reason=missed?'Perpendicular sweeps miss a receiver for '+missed[1]+'. Edit the source placement to connect these walls.':detail.includes('face normal is parallel')?'A source face normal is parallel to its horizontal support. Choose the vertical facade mode or intentionally edit that source orientation.':detail.includes('Open atrium sightlines failed')?'This arrangement has insufficient clear floor-to-atrium or cross-level sightlines. Adjust the source relationships or opening mode; your source poses were not changed.':detail.includes('Void field envelope is disconnected')?'This source arrangement creates a disconnected part or enclosed cavity. Choose New Design, or adjust source positions and void connections.':detail.includes('coplanar overlap')?'The arrangement produced overlapping coplanar surfaces. Choose New Design, or adjust the edited letters and regenerate.':detail.includes('Source lacks')||detail.includes('source lacks')?'A letter has no exposed architectural surface. Move that letter or choose New Design.':detail.includes('Blob')||detail.includes('blob')?'Study storage failed. Check the connected private Blob store and Preview environment permissions.':detail.includes('outside')?'A letter extends outside the field. Move or resize it, or enlarge the field.':'Generation or solid validation failed. Try another arrangement or simplify overlapping letters. If this repeats, inspect the server log using study ID '+id;const unavailablePlate=r.envelopeVersion==='inserted-plate'&&r.insertedPlate?.version==='edge-connected'&&/No full curved receiver|Turn the (outside|U bend)|No inward receiving edge|No sealed wall receiver|No finished wall seam|No clear plate landing|Insufficient landing|Level plates cannot share|Incomplete U end section|extends outside the selected field/i.test(detail);const geometryRejected=unavailablePlate||/source lacks a visible contour|source component fully removed|protected plate opening|no substantial floor area|no compatible edge and frame|exported geometry rejected|envelope is disconnected|Open atrium sightlines failed|directional void obstructed|incomplete across the recessed bay|obstructs the full source-shaped approach|source void does not intersect|missing (back|roof) at final alcove probe|NotManifold/i.test(detail);return NextResponse.json({error:reason+' Your previous study is retained.',id,geometryRejected},{status:422});}
 finally{state.amphitheaterRunning=false;if(out)await rm(out,{recursive:true,force:true}).catch(()=>{});}
}
