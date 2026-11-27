import {NextRequest,NextResponse} from 'next/server';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id');if(!id||!/^[a-f0-9-]{36}$/.test(id))return new Response('Invalid study',{status:400});
 try{const folder=path.join(process.cwd(),'reports/lobby-live-transfer-2026-11-21/boards'),metadata=JSON.parse(await readFile(path.join(folder,id+'.json'),'utf8'));if(!/^[a-f0-9-]{36}-[a-f0-9]{64}\.png$/.test(metadata.file))throw Error('Invalid capture');return new Response(new Uint8Array(await readFile(path.join(folder,metadata.file))),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});}catch{return new Response('No captured board',{status:404});}
}
export async function POST(req:NextRequest){
 if(!['127.0.0.1','localhost','[::1]'].includes(req.nextUrl.hostname))return new Response('Local evidence only',{status:403});
 try{const id=req.nextUrl.searchParams.get('id');if(!id||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid study');
 const input=await readFile(path.join(process.cwd(),'data/lobby-generated/v1',id+'.json')),record=JSON.parse(input.toString());if(record.provenance?.approvedFinal!==false)throw Error('Only new derivatives can be captured here.');
 const bytes=Buffer.from(await req.arrayBuffer());if(bytes.length>12000000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==4096||bytes.readUInt32BE(20)!==5156)throw Error('Expected 4096 × 5156 PNG');
 let ppm=0;for(let at=8;at+12<=bytes.length;){const n=bytes.readUInt32BE(at);if(at+n+12>bytes.length)throw Error('Truncated PNG');if(bytes.toString('ascii',at+4,at+8)==='pHYs')ppm=bytes.readUInt32BE(at+8);at+=n+12;}if(ppm!==Math.round(300/.0254))throw Error('Expected 300 ppi');
 const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),digest=hash(bytes),folder=path.join(process.cwd(),'reports/lobby-live-transfer-2026-11-21/boards');await mkdir(folder,{recursive:true});
 const file=id+'-'+digest+'.png';try{await writeFile(path.join(folder,file),bytes,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const metadata={studyId:id,typology:record.provenance.typology,sourceCount:record.sourceCount,recordSHA256:hash(input),meshSHA256:hash(Buffer.from(JSON.stringify(record.architecture))),pngSHA256:digest,file,width:4096,height:5156,dpi:300};await writeFile(path.join(folder,id+'.json'),JSON.stringify(metadata,null,2));return NextResponse.json(metadata);
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
