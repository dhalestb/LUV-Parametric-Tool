const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
require('../proof/rule-amphitheater.cjs');
const {populate,suggestedCount}=require('../src/components/sourcePopulation.ts');
const baseline=require('../proof/articulated-five/result.json'),base=baseline.request;
const rows=[];
function measure(r){
 const a=r.articulationReport,m=r.architecture,facades=new Map(),parent=new Map(),owners=new Map();
 const root=i=>{while(parent.get(i)!==i){parent.set(i,parent.get(parent.get(i)));i=parent.get(i);}return i;};
 const areas=[];
 for(let i=0;i<m.indices.length;i+=3){
 const ids=m.indices.slice(i,i+3),p=ids.map(j=>m.positions.slice(j*3,j*3+3));
 const u=p[1].map((x,k)=>x-p[0][k]),v=p[2].map((x,k)=>x-p[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
 if(!length||Math.abs(n[2])/length>.05)continue;
 const axis=Math.abs(n[0])>Math.abs(n[1])?0:1;
 const plane=n.map(x=>(Math.round(x/length*1e4)/1e4).toFixed(4)).join(',')+':'+(p[0].reduce((s,x,k)=>s+x*n[k]/length,0)).toFixed(3);
 parent.set(i,i);areas.push([i,length/2,axis,p[0][axis]]);
 for(let j=0;j<3;j++){const k=plane+':'+[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(',');if(owners.has(k))parent.set(root(i),root(owners.get(k)));else owners.set(k,i);}
 }
 for(const [i,area,axis,offset] of areas){const k=root(i),item=facades.get(k)||{area:0,axis,offset};item.area+=area;facades.set(k,item);}
 const heights=r.letters.map(l=>{const zs=l.mesh.positions.filter((_,i)=>i%3===2);return [Math.min(...zs),Math.max(...zs)];});
 const z=r.architecture.positions.filter((_,i)=>i%3===2), ops=a.operations.map(o=>({sources:o.sources,type:o.kind,base:o.center[2]-.4*o.height,top:o.center[2]+.6*o.height,width:o.width,depth:o.depth,bay:o.bayDepth,alcove:o.alcove}));
 return {id:r.id,count:r.sourceCount,heights,centers:r.request.source.map(p=>p.z+30),height:Math.max(...z)-Math.min(...z),walls:[...facades.values()].sort((a,b)=>b.area-a.area).slice(0,3),ops,projections:a.projections,volume:r.volume,pairs:r.validation.nonAdjacentTriangleChecks,components:a.components,openings:ops.filter(o=>o.type==='through opening').length};
}
rows.push(measure(baseline));
for(const [label,count] of [['five-control',5],['8',8],['12',12],['16',16],['auto',suggestedCount(base.field,13)]]){
 const seed=label==='auto'?107:37,source=populate(base.source,count,base.field,13,seed);
 assert.deepEqual(source.slice(0,5),base.source);
 const id=randomUUID(),out=path.resolve('.amphitheater-runs',id);fs.mkdirSync(out);
 const r={...base,source,sourceId:'population-'+label,sourceName:'Population study '+label,articulationElevation:'feature'};
 fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(r));
 execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out]);
 const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));assert.deepEqual(result.request.source,source);
 const row=measure(result);rows.push(row);console.log(label,id,row.height,row.ops.length,row.walls[0]);
 fs.writeFileSync('reports/amphitheater-interactive/population-results.json',JSON.stringify(rows,null,2));
}
