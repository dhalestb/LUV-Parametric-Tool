import {NextRequest,NextResponse} from 'next/server';
import {readFile,writeFile,mkdir,readdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {LOBBY_ENGINES,LOBBY_GENERATORS,lobbyId,lobbyEngine,recordedLobbyEngine} from '@/components/lobbyEngineVersions';
import manifests from '@/server/lobbyEngineManifest.json';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
const run=promisify(execFile),root=path.join(process.cwd(),'data/lobby-generated/v1');
const names:Record<string,string>={'vertical-void-lobby':'Vertical Void Lobby','compressed-sequential-lobby':'Compressed Sequential Lobby','continuous-hall-lobby':'Continuous Hall Lobby','topographic-ground-field-lobby':'Topographic Lobby','linear-gallery-lobby':'Linear Gallery Lobby'};
const state=globalThis as typeof globalThis&{lobbyPrivateRunning?:boolean};
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id');
 if(id){if(!/^[0-9a-f-]{36}$/.test(id))return NextResponse.json({error:'Invalid generated study ID'},{status:400});try{return new Response(await readFile(path.join(root,id+'.json')),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Generated study not found'},{status:404});}}
 await mkdir(root,{recursive:true});const studies=[];for(const file of await readdir(root)){if(!/^[0-9a-f-]{36}\.json$/.test(file))continue;const r=JSON.parse(await readFile(path.join(root,file),'utf8'));studies.push({id:r.id,created:r.created,request:r.request,sourceCount:r.sourceCount,volume:r.volume});}return NextResponse.json({studies:studies.sort((a,b)=>b.created.localeCompare(a.created))});
}
export async function POST(req:NextRequest){
 if(state.lobbyPrivateRunning)return NextResponse.json({error:'Another Lobby mesh is being validated. Retry after it finishes.'},{status:409});
 let out:string|undefined;state.lobbyPrivateRunning=true;
 try{
 const body=await req.text();if(body.length>2_000_000)throw Error('Source request exceeds 2 MB.');
const r=JSON.parse(body),type=lobbyId(r.lobbyTypology);
let engine=r.engineRevision===undefined?LOBBY_GENERATORS[type].engine:lobbyEngine(r.engineRevision);
if(r.operation==='regenerate'||r.parentStudyId!==undefined){
if(r.operation!=='regenerate'||typeof r.parentStudyId!=='string'||!/^[a-f0-9-]{36}$/.test(r.parentStudyId))throw Error('Regeneration requires the saved parent study identity.');
let parent;try{parent=JSON.parse(await readFile(path.join(root,r.parentStudyId+'.json'),'utf8'));}catch{throw Error('Saved parent unavailable. Approved references cannot be regenerated in place.');}
if(parent.request.sourceSnapshot?.lobbyTypology!==type)throw Error('Regeneration cannot change the parent Lobby typology.');
const recorded=recordedLobbyEngine(parent);
if(r.engineRevision!==undefined&&engine!==recorded)throw Error('Regeneration must use the saved engine revision '+recorded+'. Create a new design to use another revision.');
engine=recorded;}
else if(engine!==LOBBY_GENERATORS[type].engine)throw Error('New designs must use the verified engine for this Lobby typology. Historical revisions require a saved parent and Regenerate Architecture.');
const version=LOBBY_ENGINES[engine],packageRoot=path.join(process.cwd(),'vendor',version.package);
for(const f of manifests[engine])if(createHash('sha256').update(await readFile(path.join(packageRoot,f.file))).digest('hex')!==f.sha256)throw Error('Verified Lobby source integrity failed: '+f.file);if(!names[r.lobbyTypology])throw Error('Choose one of the five registered Lobby typologies.');
 if(!r.field||!['width','depth','height'].every(k=>[20,40,60].includes(r.field[k])))throw Error('Field dimensions must be 20, 40 or 60 ft.');
 if(!(Number.isFinite(r.preferredFeet)&&r.preferredFeet>0))throw Error('Preferred letter size must be positive.');
 if(!Array.isArray(r.source)||r.source.length<2)throw Error('At least two source letters are required.');
 if(r.population!=='auto'&&r.population!==r.source.length)throw Error('Requested and actual source populations differ.');
 for(const p of r.source){if(!['L','U','V'].includes(p.letter)||!['x','y','z','rx','ry','rz','scale','scaleX','scaleY','scaleZ'].every(k=>Number.isFinite(p[k]))||[p.scale,p.scaleX,p.scaleY,p.scaleZ].some(v=>v<=0)||p.rotationOrder&&!['XYZ','ZYX'].includes(p.rotationOrder))throw Error('L/U/V source poses require finite coordinates, valid rotation order and positive scales.');}
 const id=randomUUID();
 const request={...r,engineRevision:engine,proof:'lobby',typologyName:names[r.lobbyTypology],generator:'source-preserving',articulationElevation:'feature',sourceId:randomUUID(),sourceName:r.sourceName||names[r.lobbyTypology],sourceSnapshot:{...r.sourceSnapshot,lobbyTypology:r.lobbyTypology,engineRevision:engine,engineSHA256:version.engineSHA256,sourceCommit:version.sourceCommit,adapter:'isolated-lobby-v2'}};
 out=await mkdtemp(path.join(tmpdir(),'luv-lobby-private-'));await writeFile(path.join(out,'request.json'),JSON.stringify(request));
 await run(process.execPath,[path.join(packageRoot,'scripts/amphitheater-interactive-worker.cjs'),path.join(out,'request.json'),out],{cwd:process.cwd(),windowsHide:true,timeout:180000,maxBuffer:4000000});
 const result=JSON.parse(await readFile(path.join(out,'result.json'),'utf8'));if(!result.validation?.passed||JSON.stringify(result.request.source)!==JSON.stringify(r.source)||(result.letters.length!==r.source.length||result.sourceCount!==r.source.length))throw Error('Validated result did not preserve the requested source configuration.');
 result.id=id;result.warnings=[...(result.warnings??[]),'Versioned Lobby engine '+engine+'. New derivative; approved references remain immutable.'];result.provenance={sourceCommit:version.sourceCommit,engineRevision:engine,engineSHA256:version.engineSHA256,packageManifestSHA256:createHash('sha256').update(JSON.stringify(manifests[engine])).digest('hex'),typology:r.lobbyTypology,adapter:'isolated-lobby-v2',approvedFinal:false,...(r.parentStudyId?{parentStudyId:r.parentStudyId}:{})};
 await mkdir(root,{recursive:true});await writeFile(path.join(root,id+'.json'),JSON.stringify(result),{flag:'wx'});
 return NextResponse.json(result,{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e),geometryRejected:true,previousStudyRetained:true},{status:422});}
 finally{state.lobbyPrivateRunning=false;if(out&&path.dirname(out)===tmpdir()&&path.basename(out).startsWith('luv-lobby-private-'))await rm(out,{recursive:true,force:true});}
}
