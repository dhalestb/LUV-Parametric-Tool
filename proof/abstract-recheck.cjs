const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=__dirname;
const rows=JSON.parse(fs.readFileSync(path.join(root,'abstract-studies/results.json')));
for(const folder of [path.join(root,'abstract-review'),...rows.filter(r=>r.validation).map(r=>path.join(root,'abstract-studies',r.id))]){
 const r=spawnSync(process.execPath,[path.join(root,'abstract-validation.cjs'),folder],{encoding:'utf8'});
 fs.writeFileSync(path.join(folder,'validation.log'),r.stdout+r.stderr);
 console.log(path.basename(folder),r.status===0?'PASS':'FAILED (recorded)');
}
