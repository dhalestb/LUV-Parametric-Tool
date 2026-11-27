import {NextRequest,NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {reviewCases,readReviewCase,storeBoardEvidence,reviewEvidenceFolder} from '@/server/presentationReviewCatalog';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 try{
  const id=request.nextUrl.searchParams.get('case');if(!id)return NextResponse.json({cases:await reviewCases()});
  const item=await readReviewCase(id);if(!item)return NextResponse.json({error:'Unknown presentation case.'},{status:404});
  const phase=request.nextUrl.searchParams.get('phase');
  if(phase){if(!['baseline','reusable','examples','focused'].includes(phase))return new Response('Unknown phase',{status:400});const capture=request.nextUrl.searchParams.get('capture');if(capture&&!/^[a-f0-9]{64}$/.test(capture))return new Response('Invalid capture',{status:400});return new Response(new Uint8Array(await readFile(path.join(reviewEvidenceFolder(phase),item.entry.id+(capture?'-'+capture:'')+'.png'))),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});}
  return NextResponse.json({entry:item.entry,record:item.record});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:500});}
}
export async function POST(request:NextRequest){
 if(!['127.0.0.1','localhost','[::1]'].includes(request.nextUrl.hostname))return new Response('Evidence capture is local only.',{status:403});
 try{const bytes=Buffer.from(await request.arrayBuffer());if(bytes.length>12_000_000)return new Response('PNG exceeds evidence size limit.',{status:413});return NextResponse.json(await storeBoardEvidence(request.nextUrl.searchParams.get('case')??'',request.nextUrl.searchParams.get('phase')??'',bytes));}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
