import {get,list,put} from '@vercel/blob';
import {readFile,mkdir,writeFile,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import type {AmphitheaterResult,AmphitheaterSummary} from '@/components/amphitheaterInteractiveTypes';
const localRoot=path.join(process.cwd(),'.amphitheater-runs');
const prefix='amphitheater/v1/';
const durable=()=>Boolean(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID);
export function requireStudyStorage(){
 if(process.env.VERCEL&&!durable())throw Error('Persistent study storage is not connected. Connect a private Vercel Blob store to this project Preview environment and redeploy.');
}
export async function saveStudy(result:AmphitheaterResult){
 requireStudyStorage();
 if(durable()){
  const summary:AmphitheaterSummary={id:result.id,created:result.created,request:result.request,volume:result.volume,sourceCount:result.sourceCount};
  await put(prefix+result.id+'/result.json',JSON.stringify(result),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
  await put(prefix+result.id+'/summary.json',JSON.stringify(summary),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
  return;
 }
 const folder=path.join(localRoot,result.id);
 await mkdir(folder,{recursive:true});
 await writeFile(path.join(folder,'result.pending'),JSON.stringify(result));
 await rename(path.join(folder,'result.pending'),path.join(folder,'result.json'));
}
export async function studyResponse(id:string){
 requireStudyStorage();
 if(durable()){
  const blob=await get(prefix+id+'/result.json',{access:'private',useCache:false});
  if(!blob||blob.statusCode!==200)return Response.json({error:'Study not found'},{status:404});
  // Streaming bypasses the buffered Function response size limit for mesh snapshots.
  return new Response(blob.stream,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 }
 try{return new Response(await readFile(path.join(localRoot,id,'result.json')),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return Response.json({error:'Study not found'},{status:404});throw e;}
}
export async function studySummaries(){
 requireStudyStorage();
 const studies:AmphitheaterSummary[]=[];
 if(durable()){
  let cursor:string|undefined;
  do{
   const page=await list({prefix,cursor,limit:1000});
   for(const file of page.blobs.filter(b=>b.pathname.endsWith('/summary.json'))){
    const blob=await get(file.pathname,{access:'private',useCache:false});
    if(blob?.statusCode===200)studies.push(await new Response(blob.stream).json());
   }
   cursor=page.hasMore?page.cursor:undefined;
  }while(cursor);
 }else{
  await mkdir(localRoot,{recursive:true});
  for(const id of await readdir(localRoot)){
   try{const r=JSON.parse(await readFile(path.join(localRoot,id,'result.json'),'utf8'));studies.push({id:r.id,created:r.created,request:r.request,volume:r.volume,sourceCount:r.sourceCount});}
   catch{ /* A worker directory is not a saved study until result.json is published. */ }
  }
 }
 return studies.sort((a,b)=>b.created.localeCompare(a.created));
}

