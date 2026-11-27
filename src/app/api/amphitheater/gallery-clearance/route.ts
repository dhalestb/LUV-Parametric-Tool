import {execFile} from 'node:child_process';
import path from 'node:path';
import {studyResponse} from '@/server/amphitheaterStorage';
import {reviewCases,readReviewCase} from '@/server/presentationReviewCatalog';
export const runtime='nodejs';
export async function GET(req:Request){
 const id=new URL(req.url).searchParams.get('id')??'';
 if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Invalid study',{status:400});
 const saved=await studyResponse(id);
 const entry=!saved.ok&&(await reviewCases()).find(c=>c.studyId===id);
 const study=saved.ok?await saved.json():entry?(await readReviewCase(entry.id))?.record:null;
 if(!study)return new Response('Study not found',{status:404});
 if(study.request?.envelopeVersion!=='linear-edge-gallery')return Response.json([]);
 const data=await new Promise<string>((resolve,reject)=>{
  const child=execFile(process.execPath,[path.join(process.cwd(),'src/server/presentation-gallery-clearance.cjs')],{windowsHide:true,timeout:30000,maxBuffer:8000000},(err,out)=>err?reject(err):resolve(out));
  child.stdin?.on('error',reject);child.stdin?.end(JSON.stringify(study));
 });
 return new Response(data,{headers:{'Content-Type':'application/json','Cache-Control':'private, max-age=86400'}});
}
