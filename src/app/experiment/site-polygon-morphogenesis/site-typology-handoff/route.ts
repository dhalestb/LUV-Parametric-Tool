import {spawn} from 'node:child_process';
import path from 'node:path';
export const runtime='nodejs';
export async function POST(request:Request){
 const host=request.headers.get('host')??'',origin=request.headers.get('origin');
 const url=new URL('http://'+host);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||(origin&&origin!==url.origin))return Response.json({error:'Local same-origin experiment only'},{status:403});
 const body=await request.text();if(body.length>2000000)return Response.json({error:'Input too large'},{status:413});
 return await new Promise<Response>(resolve=>{
  const child=spawn(process.execPath,[path.join(process.cwd(),'scripts/site-typology-handoff.cjs')],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',error='',finished=false;
  const done=(response:Response)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(response);};
  const timer=setTimeout(()=>{child.kill();done(Response.json({error:'Site rule validation exceeded 60 seconds; previous result retained'},{status:408}));},60000);
  request.signal.addEventListener('abort',()=>{child.kill();done(Response.json({error:'Cancelled'},{status:499}));},{once:true});
  child.stdout.on('data',b=>{output+=b;if(output.length>40000000){child.kill();done(Response.json({error:'Site-rule validation output exceeds the response limit'},{status:413}));}});
  child.stderr.on('data',b=>error+=b);
  child.on('error',e=>done(Response.json({error:e.message},{status:500})));
  child.on('close',code=>done(code===0?new Response(output,{headers:{'Content-Type':'application/json'}}):Response.json({error:error||'Site-rule validation failed'},{status:422})));
  child.stdin.end(body);
 });
}


