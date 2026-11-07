const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f.replace(/\.ts$/,'.cts'),compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const load=n=>require(path.join(root,'src/components/lattice',n+'.ts')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const score=load('assignmentGuidance').interfaceNetworkPriority;
const isolated=[{a:0,b:1,priority:240}],network=[{a:0,b:1,priority:40},{a:1,b:2,priority:30},{a:2,b:3,priority:20}];
assert(score(4,network)>score(4,isolated));assert.equal(score(4,[...isolated,...isolated]),score(4,isolated));
assert.equal(score(4,[...network,{a:0,b:3,priority:1}]),score(4,network));assert.equal(score(1,[]),0);
console.log('PASS independent opportunities cover all forms before favoring one strong pair; duplicate edges/cycles do not inflate the score');
const narrowObj='v -6 -.65 -.4\nv 6 -.65 -.4\nv 6 .65 -.4\nv -6 .65 -.4\nv -6 -.65 0\nv 6 -.65 0\nv 6 .65 0\nv -6 .65 0\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8';
const narrow=load('analyze').analyzeMesh(load('parseObj').parseObj(narrowObj,'analytic-narrow-branch.obj'),null,1,'z');
const immutable=Array.from(narrow.connectionSurface.positions),ends=load('branchBoundaries').branchBoundaries(narrow);
assert(ends.length>=2);assert(ends.every(e=>e.edgeSpan<2&&Math.abs(e.outward[0])>.99));
assert(ends.some(e=>e.outward[0]>0)&&ends.some(e=>e.outward[0]<0));
assert.deepEqual(Array.from(narrow.connectionSurface.positions),immutable);
console.log('PASS narrow real-boundary hypotheses are detected without walking acceptance or fabricated interior directions');
if(process.argv.includes('--analytic-only'))process.exit(0);
const recordFile=path.join(root,'reports/authoritative-obj-verification/user-confirmed-orientations-2026-10-11.json'),record=JSON.parse(fs.readFileSync(recordFile));
const guards=[recordFile,path.join(root,'checkpoints/lattice-session.json'),...record.sources.map(s=>path.join(root,s.relativePath))].map(f=>[f,hash(f)]);
const serial=(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,models=record.sources.map(s=>{const f=path.join(root,s.relativePath);assert.equal(hash(f),s.sha256);const obj=load('parseObj').parseObj(fs.readFileSync(f,'utf8'),path.basename(f));obj.id=s.id;return load('analyze').analyzeMesh(obj,null,1,'y');});
const source=JSON.stringify(models.map(m=>m.connectionSurface),serial),cells=[[0,0],[1,0],[1,1],[0,1]],hypotheses=[];
const release=load('geometryRevision').beginGeometryValidation();
try{
  for(const variants of [[0,0,0,0],[0,3,6,9],[3,6,9,0]]){
    const tiles=models.map((m,i)=>({id:m.id,ix:cells[i][0],iy:cells[i][1],iz:0,variant:variants[i]}));
    hypotheses.push({tiles,priority:load('assignmentGuidance').assignmentInterfacePriority(models,tiles),transforms:models.map((m,i)=>({rotation:m.variants[variants[i]].rotation,mirror:m.variants[variants[i]].mirror})),classification:'GEOMETRIC OPPORTUNITY ONLY; circulation UNVERIFIED'});
  }
}finally{release();}
assert(new Set(hypotheses.map(h=>h.priority)).size>1,'Actual transformed OBJ interfaces must affect priority');
assert.equal(JSON.stringify(models.map(m=>m.connectionSurface),serial),source);for(const [f,sha]of guards)assert.equal(hash(f),sha,f);
const out=path.join(root,'reports','interface-network-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out);
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({tests:['network opportunity coverage','no duplicate/cycle inflation','narrow branch exposed-boundary direction and source preservation','real transformed OBJ priority varies','source and checkpoint preservation'],branchEvidence:models.map(m=>({filename:m.filename,boundaries:load('branchBoundaries').branchBoundaries(m)})),hypotheses,preservation:guards,limitations:'No new connection generation or acceptance is claimed by this ranking-only replay.'},serial,2),{flag:'wx'});
console.log(JSON.stringify(hypotheses));console.log('OUTPUT',out);
