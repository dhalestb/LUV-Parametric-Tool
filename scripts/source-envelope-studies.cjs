const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto'),{execFileSync}=require('child_process'),assert=require('assert/strict');
const cases=[
[['L',-12,-3,-13,0],['U',1,-2,-8,12],['V',11,1,0,-16]],
[['U',-9,-9,-8,35],['L',9,-8,0,100],['U',1,10,4,-42],['V',-10,6,-2,62]],
[['V',-11,8,0,-24],['V',10,10,4,54],['L',1,0,-10,45],['U',4,-12,-3,92]]
];cases.push(cases[0].map((a,i)=>i===1?[a[0],a[1],a[2]+4,...a.slice(3)]:a));
const results=[];
for(const [n,c] of cases.entries()){
const source=c.map(([letter,x,y,z,rz])=>({letter,x,y,z,rz,rx:0,ry:0,scale:13/.92,scaleX:1,scaleY:1,scaleZ:1})),request={generator:'source-preserving',field:{width:40,depth:40,height:60},preferredFeet:13,population:'auto',sourceId:'network-'+n,sourceName:['Offset sequence','Split courtyard','Converging fields','Offset sequence · U moved 4 ft'][n],source},id=randomUUID(),out=path.resolve('.amphitheater-runs',id);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out]);
const r=JSON.parse(fs.readFileSync(path.join(out,'result.json')));assert.deepEqual(r.request.source,source);results.push(r);
console.log(JSON.stringify({id,name:request.sourceName,volume:r.volume,triangles:r.architecture.indices.length/3,pairs:r.validation.nonAdjacentTriangleChecks,edges:r.paths.map(e=>e.sources)}));
}
assert.deepEqual(results[0].letters[0],results[3].letters[0]);assert.deepEqual(results[0].letters[2],results[3].letters[2]);assert.notDeepEqual(results[0].paths,results[3].paths);assert.notEqual(results[0].volume,results[3].volume);


