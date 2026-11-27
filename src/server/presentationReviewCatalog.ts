import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readLobbyFinal} from './lobbyFinalCatalog';
export type ReviewCase={id:string;name:string;group:string;category:'gathering'|'workspace'|'lobby'|'other';typology?:string;studyId:string;file?:string;lobbyNumber?:number;sha256:string};
const dataRoot=()=>path.join(process.cwd(),'data/presentation-review/v1');
export const reviewReportRoot=()=>path.join(process.cwd(),'reports/presentation-rules-2026-11-21');
export const reviewEvidenceFolder=(phase:string)=>phase==='focused'?path.join(process.cwd(),'reports/presentation-focused-details-2026-11-21/png'):path.join(reviewReportRoot(),'png',phase);
export async function reviewCases():Promise<ReviewCase[]>{return JSON.parse(await readFile(path.join(dataRoot(),'catalog.json'),'utf8'));}
export async function readReviewCase(id:string){
 const entry=(await reviewCases()).find(c=>c.id===id);if(!entry)return null;
 const bytes=entry.lobbyNumber?(await readLobbyFinal(String(entry.lobbyNumber),'architecture'))!.bytes:await readFile(path.join(dataRoot(),path.basename(entry.file!)));
 if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Presentation input integrity mismatch.');
 return {entry,record:JSON.parse(bytes.toString()),bytes};
}
export async function storeBoardEvidence(caseId:string,phase:string,bytes:Buffer){
 if(!['baseline','reusable','examples','focused'].includes(phase))throw Error('Unknown evidence phase.');
 const input=await readReviewCase(caseId);if(!input)throw Error('Unknown review case.');
 if(bytes.length<8||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected PNG.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(width!==4096||height!==5156)throw Error('Board dimensions changed.');
 let ppm=0;for(let at=8;at+12<=bytes.length;){const size=bytes.readUInt32BE(at);if(at+12+size>bytes.length)throw Error('Truncated PNG.');if(bytes.toString('ascii',at+4,at+8)==='pHYs')ppm=bytes.readUInt32BE(at+8);at+=size+12;}
 if(ppm!==Math.round(300/.0254))throw Error('Board must retain 300-ppi PNG metadata.');
 const folder=reviewEvidenceFolder(phase);await mkdir(folder,{recursive:true});
 const digest=createHash('sha256').update(bytes).digest('hex'),file=path.join(folder,caseId+'.png');
 let captureHash:string|undefined,exactPNGMatchesFirst=true;
 try{await writeFile(file,bytes,{flag:'wx'});}catch(e){
  if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
  const old=createHash('sha256').update(await readFile(file)).digest('hex');exactPNGMatchesFirst=old===digest;
  if(!exactPNGMatchesFirst){captureHash=digest;try{await writeFile(path.join(folder,caseId+'-'+digest+'.png'),bytes,{flag:'wx'});}catch(other){if((other as NodeJS.ErrnoException).code!=='EEXIST')throw other;}}
 }
 const metadata={caseId,phase,width,height,dpi:300,pngSHA256:digest,captureHash,exactPNGMatchesFirst,inputSHA256:input.entry.sha256,originalStudyId:input.entry.studyId,category:input.entry.category};
 try{await writeFile(path.join(folder,caseId+(captureHash?'-'+captureHash:'')+'.json'),JSON.stringify(metadata,null,2),{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}return metadata;
}
