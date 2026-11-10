const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const THREE=require('three'),{MeshBVH}=require('three-mesh-bvh');
const root=__dirname,folder=path.join(root,'rule-review'),out=path.join(root,'rule-influence');
fs.mkdirSync(out,{recursive:true});
const input=JSON.parse(fs.readFileSync(path.join(root,'input.json')));
function geometry(mesh){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));g.setIndex(mesh.indices);
 return {mesh,bvh:new MeshBVH(g)};
}
const baseline=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),baseFinal=geometry(JSON.parse(fs.readFileSync(path.join(folder,'combined-envelope.json')))),baseRaw=geometry(JSON.parse(fs.readFileSync(path.join(folder,'raw-construction.json'))));
function deviation(mesh,target){
 let max=0,count=0;
 for(let i=0;i<mesh.positions.length;i+=3){
  const result=target.bvh.closestPointToPoint(new THREE.Vector3(...mesh.positions.slice(i,i+3)));
  if(result){max=Math.max(max,result.distance);if(result.distance>.0005)count++;}
 }
 return {max,count};
}
const rows=[];
for(const item of baseline.instances){
 const dir=path.join(out,item.id);fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'input.json');
 fs.writeFileSync(file,JSON.stringify({...input,perturb:{instance:item.id,vector:[0,0,.05]}}));
 const run=spawnSync(process.execPath,[path.join(root,'rule-amphitheater.cjs'),file,dir,'--fast'],{encoding:'utf8'});
 fs.writeFileSync(path.join(dir,'generation.log'),run.stdout+run.stderr);
 if(run.status){rows.push({id:item.id,status:'perturbation failed',error:run.stderr});continue;}
 const candidate=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),end=geometry(JSON.parse(fs.readFileSync(path.join(dir,'combined-envelope.json')))),raw=geometry(JSON.parse(fs.readFileSync(path.join(dir,'raw-construction.json'))));
 const f=[deviation(baseFinal.mesh,end),deviation(end.mesh,baseFinal)],r=[deviation(baseRaw.mesh,raw),deviation(raw.mesh,baseRaw)];
 const finalDelta=Math.max(...f.map(t=>t.max)),rawDelta=Math.max(...r.map(t=>t.max));
 const valid=candidate.validation.status==='NoError'&&candidate.validation.shellVolumes.length===1&&candidate.validation.shellVolumes[0]>0&&candidate.validation.outside===0;
 const result={id:item.id,role:item.source.letter,sourceIndex:item.sourceIndex,perturbation:[0,0,.05],constructionOperand:baseline.components.some(c=>c.sources.includes(item.id)),rawBoundaryDelta:rawDelta,finalBoundaryDelta:finalDelta,changedFinalVertices:f.reduce((n,t)=>n+t.count,0),volumeDelta:candidate.validation.volume-baseline.validation.volume,perturbationSolidValid:valid,status:!valid?'perturbed solid requires review':finalDelta>.0005?'retained surface influence measured':rawDelta>.0005?'raw influence removed or masked after Booleans':'retained influence not demonstrated'};
 rows.push(result);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Full bidirectional vertex-to-triangle boundary distance; 0.05 ft source pivot perturbation, 0.0005 ft significance threshold',rows},null,2));
 console.log(item.id,result.status,finalDelta.toFixed(6));
}

