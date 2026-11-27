const {spawn}=require('node:child_process');
const path=require('node:path');
const net=require('node:net');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.LUV_EXPERIMENT_PORT||3020);
const probe=net.createServer();
probe.once('error',e=>{console.error('Port '+port+' unavailable: '+e.message);process.exitCode=1;});
probe.listen(port,'127.0.0.1',()=>probe.close(()=>{
const env={...process.env,LUV_BUILD_DIRECTORY:'.next-site-polygon-morphogenesis',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of Object.keys(env))if(/^(BLOB_|VERCEL|AWS_|DATABASE_|SUPABASE_)/.test(key))delete env[key];
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exitCode=code??1);
}));
