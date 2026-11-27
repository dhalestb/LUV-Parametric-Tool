import {NextRequest,NextResponse} from 'next/server';
import {LOBBY_FINALS,LOBBY_ARCHIVE_SHA256} from '@/components/lobby-final/registry';
import {readLobbyFinal} from '@/server/lobbyFinalCatalog';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
 const study=request.nextUrl.searchParams.get('study');
 if(!study)return NextResponse.json({readOnly:true,archiveSha256:LOBBY_ARCHIVE_SHA256,studies:LOBBY_FINALS});
 try {
  const asset=await readLobbyFinal(study,request.nextUrl.searchParams.get('asset')??'architecture');
  if(!asset)return NextResponse.json({error:'Final study or asset not found.'},{status:404});
  return new Response(new Uint8Array(asset.bytes),{headers:{'Content-Type':asset.file.endsWith('.png')?'image/png':'application/json','Cache-Control':'no-store','X-LUV-Original-SHA256':asset.digest,'X-LUV-Read-Only':'true','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('Read-only Lobby catalog:',error);return NextResponse.json({error:'Original study could not be verified. No substitute was loaded.'},{status:500});}
}
function readOnly(){return NextResponse.json({error:'Approved Lobby studies are read-only. No mutation or generation is supported.'},{status:405,headers:{Allow:'GET, HEAD'}});}
export const POST=readOnly;
export const PUT=readOnly;
export const PATCH=readOnly;
export const DELETE=readOnly;

