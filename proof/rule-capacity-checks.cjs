const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=__dirname,out=path.join(root,'rule-capacity-checks');
fs.mkdirSync(out,{recursive:true});
const source=JSON.parse(fs.readFileSync(path.join(root,'input.json')));
const cases=[...[20,40,60].map(h=>({id:'height-'+h,field:{width:60,depth:40,height:h},preferredFeet:11})),...[5,7,13,31].map(n=>({id:'target-'+n,population:n,field:{width:60,depth:40,height:40}}))];
const rows=[];
for(const c of cases){
 const input={...source,...c},folder=path.join(out,c.id);fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,'input.json');fs.writeFileSync(file,JSON.stringify(input));
 const run=spawnSync(process.execPath,[path.join(root,'rule-amphitheater.cjs'),file,folder,'--fast'],{encoding:'utf8'});
 const m=run.status===0?JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))):null;
 rows.push({id:c.id,status:run.status,study:m?.study,error:run.status?run.stderr:undefined,geometry:m?.validation});
 fs.writeFileSync(path.join(folder,'generation.log'),run.stdout+run.stderr);
 console.log(c.id,run.status,m?.study.actualPopulation,m?.study.counts);
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(rows,null,2));

