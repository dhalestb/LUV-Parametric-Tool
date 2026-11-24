const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve('.amphitheater-runs');
const placements=[['L',-12,-3,-13,0],['U',1,-2,-8,12],['V',11,1,0,-16],['V',6,11,-4,65],['L',-9,9,-2,-35]];
const source=placements.map(([letter,x,y,z,rz])=>({letter,x,y,z,rz,rx:0,ry:0,scale:13/.92,scaleX:1,scaleY:1,scaleZ:1}));
for(const count of [3,5]){
 const base={generator:'source-preserving',field:{width:40,depth:40,height:60},preferredFeet:13,population:'auto',sourceId:'nested-'+count,sourceName:count===3?'Offset sequence':'Offset sequence + V and L',source:source.slice(0,count)};
 let primary;
 for(const degree of [0,.75]){
 const request={...base,articulation:degree},id=randomUUID(),out=path.join(root,id);
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
 execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out]);
 const r=JSON.parse(fs.readFileSync(path.join(out,'result.json'))),a=r.articulationReport;
 if(!degree)primary=r;
 assert.deepEqual(r.letters,primary.letters);assert.deepEqual(r.primary,primary.architecture);
 assert.equal(r.validation.selfIntersectionPairs,0);assert.equal(a.components,1);
 assert(Math.abs(a.before+a.added-a.removed-a.after)<1e-5);
 for(const o of a.operations.filter(o=>o.backed))assert(o.ratio>=.15&&o.ratio<=.35);
 console.log(JSON.stringify({id,count,degree,before:a.before,after:a.after,added:a.added,removed:a.removed,projections:a.addedProjections,ops:a.operations.map(o=>[o.feature,o.kind,o.alcove,o.profile]),pairs:r.validation.nonAdjacentTriangleChecks}));
 }}

