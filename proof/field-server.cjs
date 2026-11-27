const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {requestConfig,cacheKey}=require('./field-config.cjs');
const root=__dirname;
const fixture=JSON.parse(fs.readFileSync(path.join(root,'input.json')));
const jobs=new Map();
let active=false;
const page=`<!doctype html><meta charset=utf-8><title>Selection Field Dimensions</title>
<style>body{font:17px system-ui;background:#101820;color:#eee;max-width:900px;margin:5% auto}label{display:inline-block;margin:12px}select,input,button{font:inherit;padding:9px}section{border:1px solid #456;padding:20px;margin:20px 0}a{color:#a8d5ec}</style>
<h1>Selection Field Dimensions</h1><p>Choose a source and architectural envelope before generation.</p>
<section><label>Composition source <select id=source><option>Recorded L/U/V review source</option></select></label><p>Original source registration · 20 × 20 × 20 ft</p></section>
<section><label>Width X <select id=width><option>20</option><option>40</option><option>60</option></select> ft</label>
<label>Length / depth Y <select id=depth><option>20</option><option>40</option><option>60</option></select> ft</label>
<label>Height Z <select id=height><option>20</option><option>40</option><option>60</option></select> ft</label>
<label>Major occupied level spacing <input id=major type=number min=12 max=15 step=.1 value=12> ft</label><p>Minor terrace rises are generated separately. Major occupied decks require clear-height verification.</p></section>
<section><label>Category <select id=category><option value=gathering>Gathering</option><option value=office>Office</option><option value=lobby>Lobby</option></select></label>
<label>Typology <select id=typology><option value=stepped-amphitheater>Stepped Amphitheater</option></select></label><p id=scope></p></section>
<button id=generate>Generate study</button><p id=status>Geometry requires generation.</p>
<p><a href="/field-review/index.html">Open four comparison fixtures</a></p>
<script>
const fields=['width','depth','height','major','category','typology'];
let revision=0;
function changed(){revision++;statusEl.textContent='Configuration changed. Regenerate geometry.';generate.disabled=category.value!=='gathering';scope.textContent=category.value==='gathering'?'':'Dimensions remain selected. Architectural generation in this proof is available for Stepped Amphitheater.';}
const statusEl=document.getElementById('status'),generate=document.getElementById('generate');
fields.forEach(id=>document.getElementById(id).addEventListener('change',changed));
generate.onclick=async()=>{
 const captured=revision;generate.disabled=true;
 try{
 const config={width:+document.getElementById('width').value,depth:+document.getElementById('depth').value,height:+document.getElementById('height').value,majorLevelSpacing:+document.getElementById('major').value,category:category.value,typology:typology.value};
 const r=await fetch('/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
 const data=await r.json();if(!r.ok)throw Error(data.error);
 statusEl.textContent='Generating geometry…';
 for(;;){await new Promise(r=>setTimeout(r,1500));const job=await(await fetch('/jobs/'+data.key)).json();
 if(captured!==revision){statusEl.textContent='Configuration changed. Regenerate to view matching geometry.';break;}
 if(job.state==='failed')throw Error(job.error);
 if(job.state==='done'){statusEl.innerHTML='<a href="'+job.url+'">Open this generated study</a>';break;}}
 }catch(e){statusEl.textContent=e.message;}finally{generate.disabled=category.value!=='gathering';}
};
</script>`;
const server=http.createServer(async(req,res)=>{
 const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(Buffer.isBuffer(data)?data:type==='application/json'?JSON.stringify(data):data);};
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'||url.pathname==='/controls')return send(200,page,'text/html');
 if(url.pathname.startsWith('/jobs/'))return send(200,jobs.get(url.pathname.split('/').pop())??{state:'failed',error:'Unknown job'});
 if(url.pathname==='/generate'&&req.method==='POST'){
  let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)return send(413,{error:'Request too large'});}
  try{
   const config=requestConfig(JSON.parse(text));
   if(config.category!=='gathering'||config.typology!=='stepped-amphitheater')return send(400,{error:'Only Stepped Amphitheater generation is implemented in this proof'});
   const key=cacheKey(config,fixture);
   if(jobs.get(key)?.state==='done')return send(200,{key});
   if(active)return send(409,{error:'A study is generating. Wait for completion before starting another.'});
   const folder=path.join(root,'field-jobs',key);fs.mkdirSync(folder,{recursive:true});
   const input=path.join(folder,'input.json');
   fs.writeFileSync(input,JSON.stringify({...fixture,fields:[[config.width,config.depth,config.height]],majorLevelSpacing:config.majorLevelSpacing}));
   jobs.set(key,{state:'running'});active=true;
   const child=spawn(process.execPath,[path.join(root,'field-amphitheater.cjs'),input,folder],{windowsHide:true,env:process.env});
   let output='';child.stderr.on('data',s=>output+=s);child.stdout.on('data',s=>output+=s);
   child.on('error',e=>{active=false;jobs.set(key,{state:'failed',error:e.message});});
   child.on('exit',code=>{active=false;fs.writeFileSync(path.join(folder,'generation.log'),output);jobs.set(key,code===0?{state:'done',url:'/field-jobs/'+key+'/index.html'}:{state:'failed',error:output.slice(-1800)});});
   return send(202,{key});
  }catch(e){return send(400,{error:e.message});}
 }
 const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!filename.startsWith(root+path.sep))return send(403,{error:'Invalid path'});
 if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())return send(404,{error:'File not found'});
 const type={'.png':'image/png','.html':'text/html','.json':'application/json','.md':'text/plain'}[path.extname(filename)]??'application/octet-stream';
 send(200,fs.readFileSync(filename),type);
});
server.listen(4178,'127.0.0.1',()=>console.log('Field proof http://127.0.0.1:4178/controls'));

