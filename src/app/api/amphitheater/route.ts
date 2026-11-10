import { NextRequest, NextResponse } from 'next/server';
import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AmphitheaterRequest,AmphitheaterResult } from '@/components/amphitheaterInteractiveTypes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const run=promisify(execFile),root=path.join(process.cwd(),'.amphitheater-runs');
const state=globalThis as typeof globalThis & {amphitheaterRunning?:boolean};
function validate(r:AmphitheaterRequest){
 if(!['typology-baseline','source-preserving'].includes(r.generator))throw Error('Unknown generator.');
 if(!r.field||!['width','depth','height'].every(k=>[20,40,60].includes(r.field[k as keyof typeof r.field])))throw Error('Each field dimension must be 20, 40 or 60 feet.');
 if(!Number.isFinite(r.preferredFeet)||r.preferredFeet<=0)throw Error('Preferred letter size must be positive.');
 if(r.population!=='auto'&&(!Number.isSafeInteger(r.population)||r.population<4))throw Error('Population must be auto or an integer supplying at least two L boundaries, one U and one V.');
 if(!Array.isArray(r.source)||!r.source.length)throw Error('Choose a source composition.');
 for(const p of r.source){if(!['L','U','V'].includes(p.letter)||!['x','y','z','rx','ry','rz','scale','scaleX','scaleY','scaleZ'].every(k=>Number.isFinite(p[k as keyof typeof p])))throw Error('Source placements require L/U/V and finite position, rotation and scale values.');if([p.scale,p.scaleX,p.scaleY,p.scaleZ].some(n=>n<=0))throw Error('Source scales must be positive.');}
 if(r.generator==='typology-baseline'&&!['L','U','V'].every(role=>r.source.some(s=>s.letter===role)))throw Error('This comparison baseline requires L, U and V source functions.');
}
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id');
 if(id){if(!/^[a-f0-9-]{36}$/.test(id))return NextResponse.json({error:'Invalid study ID'},{status:400});try{return NextResponse.json(JSON.parse(await readFile(path.join(root,id,'result.json'),'utf8')));}catch{return NextResponse.json({error:'Study not found'},{status:404});}}
 const fixture=JSON.parse(await readFile(path.join(process.cwd(),'proof/input.json'),'utf8'));
 await mkdir(root,{recursive:true});const studies=[];
 for(const entry of await readdir(root)){try{const r:AmphitheaterResult=JSON.parse(await readFile(path.join(root,entry,'result.json'),'utf8'));studies.push({id:r.id,created:r.created,request:r.request,volume:r.volume,sourceCount:r.sourceCount});}catch{ /* Incomplete runs are never presented as validated studies. */ }}
 return NextResponse.json({fixture:fixture.source,studies:studies.sort((a,b)=>b.created.localeCompare(a.created))});
}
export async function POST(req:NextRequest){
 let r:AmphitheaterRequest;
 try{const text=await req.text();if(text.length>2_000_000)throw Error('Source request exceeds 2 MB.');r=JSON.parse(text);validate(r);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid request'},{status:400});}
 if(state.amphitheaterRunning)return NextResponse.json({error:'A comparison study is generating. Wait for it to finish.'},{status:409});
 state.amphitheaterRunning=true;const id=randomUUID(),out=path.join(root,id);
 try{
 await mkdir(out,{recursive:true});const file=path.join(out,'request.json');await writeFile(file,JSON.stringify(r,null,2));
 await run(process.execPath,[path.join(process.cwd(),'scripts/amphitheater-interactive-worker.cjs'),file,out],{cwd:process.cwd(),windowsHide:true,timeout:180_000,maxBuffer:4_000_000});
 return NextResponse.json(JSON.parse(await readFile(path.join(out,'result.json'),'utf8')),{status:201});
 }catch(e){const message=e instanceof Error?e.message:'Generation failed';await writeFile(path.join(out,'api-error.txt'),message).catch(()=>{});return NextResponse.json({error:'Study rejected; parameters were preserved. '+message.slice(-2200),id},{status:422});}
 finally{state.amphitheaterRunning=false;}
}

