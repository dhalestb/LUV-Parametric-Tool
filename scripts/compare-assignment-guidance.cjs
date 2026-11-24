const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
const read=arg=>{const file=fs.realpathSync(path.resolve(root,arg));assert(file.startsWith(root+path.sep));return {file,data:JSON.parse(fs.readFileSync(file))};};
const before=read(process.argv[2]),after=read(process.argv[3]),out=path.join(root,'reports',`assignment-guidance-comparison-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out);
assert.deepEqual(before.data.field,after.data.field);const a={...before.data.options},b={...after.data.options};delete a.guided;delete b.guided;assert.deepEqual(a,b);
const key=tiles=>JSON.stringify(tiles.map(t=>[t.id,t.ix,t.iy,t.iz,t.zLift??0,t.variant]));
const common=[];
for(let i=0;i<2;i++){const original=before.data.runs[i],guided=after.data.runs[i];assert.equal(original.search.evaluated,guided.search.evaluated);
  const lookup=new Map(original.observations.map(o=>[key(o.tiles),o]));
  for(const row of guided.observations){const match=lookup.get(key(row.tiles));if(match){assert.deepEqual(row,match);common.push({temperature:original.temperature,tiles:row.tiles,geometry:row.geometry,classification:row.classification});}}
}
assert(common.length>0);
for(const [file,sha]of before.data.preservation)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,file);
const report={baseline:before.file,guided:after.file,inputAndBudgetParity:true,commonClassificationAndGeometryParity:common,
  performance:before.data.runs.map((r,i)=>({temperature:r.temperature,candidates:r.search.evaluated,beforeMs:r.durationMs,afterMs:after.data.runs[i].durationMs,improvementPercent:(1-after.data.runs[i].durationMs/r.durationMs)*100})),
  limitations:['Different candidate ordering intentionally explores different poses; only shared poses establish classification parity','Cold search follows completed OBJ analysis/runtime initialization, not cold upload or cold process startup','No positive circulation achieved in this four-form benchmark','Cold ordering regressed; warm ordering improved in this bounded case; no universal speedup claimed','No concurrent build or geometry job launched by the agent during controlled runs; broader system load was not controlled']};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report.performance,null,2));console.log('COMMON',common.length);console.log('OUTPUT',out);
