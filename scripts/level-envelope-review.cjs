const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),{randomUUID}=require('crypto');
const before=JSON.parse(fs.readFileSync('.amphitheater-runs/e1f5d69b-aa17-4fd1-9d7f-e63f6c3114b3/result.json'));
const out=path.resolve('.amphitheater-runs',randomUUID());fs.mkdirSync(out);
const request={...before.request,envelopeVersion:'levels',sourceName:'Nine letters · elevation-bounded envelope'};
fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out]);
const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
console.log(result.id,result.volume,result.contributions);

