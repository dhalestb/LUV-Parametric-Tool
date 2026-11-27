// Only the source-pair scheduling is extended. Native profile, wallMesh, add, seam and thickness code stays exact.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict'),A=require('./room-polygon-domain.cjs'),P=require('./room-variable-perimeter.cjs');
const VERSION='room-within-volume/successive-profile-lofts-v1',FILE=path.resolve(__dirname,'../vendor/typology-proof-20261121/scripts/full-perimeter-lofts.cjs');
const ORIGINAL=` tiers[0].forEach(n=>add(null,n));
 for(let level=1;level<tiers.length;level++){const prev=tiers[level-1],remaining=new Set(prev);
 for(const n of tiers[level]){const cost=p=>Math.hypot(n.p.x-p.p.x,n.p.y-p.p.y);const a=[...remaining].sort((a,b)=>cost(a)-cost(b))[0];if(!a)throw Error('Cannot match full profiles');remaining.delete(a);add(a,n)}
 remaining.forEach(n=>terminations.push({level:level-1,source:n.id,reason:'Level count decreases'}))}`;
function schedule(nodes,manifest){
 assert.equal(manifest.version,P.VERSION);const byId=new Map(nodes.filter(n=>n.p.architecturalRole==='perimeter').map(n=>[n.id,n]));assert.equal(byId.size,nodes.filter(n=>n.p.architecturalRole==='perimeter').length);
 const used=new Set(),columns=manifest.columns.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(c=>{
  assert(c.profileRelationship==='same-native-glyph'&&c.basePolicy==='vertical-to-building-base');assert(c.sources.length>0);const ordered=c.sources.slice().sort((a,b)=>a.levelIndex-b.levelIndex);assert.equal(new Set(ordered.map(s=>s.levelIndex)).size,ordered.length,'Ambiguous level correspondence');assert.equal(ordered[0].sourceId,c.anchorSourceId);
  const list=ordered.map(s=>{const n=byId.get(s.sourceId);assert(n&&!used.has(s.sourceId),'Missing or reused source correspondence');used.add(s.sourceId);assert.equal(n.p.stableSourceId,s.sourceId);assert.equal(n.p.perimeterColumnId,c.id);assert.equal(n.p.levelIndex,s.levelIndex);assert.equal(n.p.letter,s.letter);const {stableSourceId,perimeterColumnId,...pose}=n.p;assert.equal(A.hash(pose),s.adaptedPoseHash,'Source pose differs from explicit correspondence');assert(Math.hypot(n.matrix[12]-c.referenceXY[0],n.matrix[13]-c.referenceXY[1])<1e-9,'Column axis drift');return n;});
  assert(list.every(n=>n.p.letter===list[0].p.letter));for(let i=1;i<list.length;i++)assert(list[i].matrix[14]>list[i-1].matrix[14],'Nonascending source elevations');return{...c,nodes:list};
 });assert.equal(used.size,byId.size,'Unassigned perimeter source; do not infer nearest neighbor');return columns;
}
function create(manifest){
 if(!manifest)return require(FILE);A.authenticate();assert.equal(manifest.version,P.VERSION);let source=fs.readFileSync(FILE,'utf8').replaceAll('\r\n','\n');assert.equal(source.split(ORIGINAL).length,2,'Authenticated native matching block changed');
 source=source.replace(ORIGINAL,` const columns=require('__explicit_room_columns__')(nodes);
 for(const c of columns){add(null,c.nodes[0]);for(let i=1;i<c.nodes.length;i++)add(c.nodes[i-1],c.nodes[i]);}
 metrics.crossLevel={version:${JSON.stringify(VERSION)},columns:columns.map(c=>({id:c.id,anchorSource:c.anchorSourceId,axis:c.referenceXY,sourceIds:c.nodes.map(n=>n.id),spans:c.nodes.slice(1).map((n,i)=>({lowerSource:c.nodes[i].id,upperSource:n.id,lowerLevel:c.nodes[i].p.levelIndex,upperLevel:n.p.levelIndex,missingLevels:Array.from({length:n.p.levelIndex-c.nodes[i].p.levelIndex-1},(_,k)=>c.nodes[i].p.levelIndex+1+k)}))})),intermediateProfilesInvented:false};`);
 const m=new Module(FILE,module);m.filename=FILE;m.paths=Module._nodeModulePaths(path.dirname(FILE));const nativeRequire=Module.createRequire(FILE);m.require=s=>s==='__explicit_room_columns__'?(nodes=>schedule(nodes,manifest)):nativeRequire(s);m._compile(source,FILE);return m.exports;
}
module.exports={VERSION,create,schedule,nativeFile:FILE};
