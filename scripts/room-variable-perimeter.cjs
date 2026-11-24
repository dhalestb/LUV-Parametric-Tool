// Explicit variable source populations; no density heuristic or new glyph/rotation rule.
const assert=require('assert/strict'),A=require('./room-polygon-domain.cjs');
const VERSION='room-within-volume/variable-perimeter-population-v1';
function selectPopulation(reference,catalog,selection){
 assert.equal(selection.version,VERSION);assert.equal(selection.referenceRequestHash,A.hash(reference));
 assert(Array.isArray(catalog)&&catalog.length===reference.source.length);const byId=new Map(catalog.map(n=>[n.id,n]));assert.equal(byId.size,catalog.length);
 // Catalog comes from authenticated derive() nodes, with the original pose bound to its saved identity.
 assert.deepEqual(catalog.map(n=>n.p),reference.source,'Reference catalog does not match the authenticated source request');
 assert(selection.columns.length>0);const columnIds=new Set(selection.columns.map(c=>c.id));assert.equal(columnIds.size,selection.columns.length);
 const used=new Set(),columns=selection.columns.map(c=>{
  assert.equal(c.basePolicy,'vertical-to-building-base');assert.equal(c.profileRelationship,'same-native-glyph');
  const anchor=byId.get(c.anchorSourceId);assert(anchor?.p.architecturalRole==='perimeter','Missing anchor source');
  const sources=c.sourceIds.map(id=>{assert(!used.has(id),'Source assigned to multiple columns');used.add(id);const n=byId.get(id);assert(n?.p.architecturalRole==='perimeter','Unknown/non-perimeter source');assert.equal(n.p.letter,anchor.p.letter,'Mixed glyph profiles need reviewed correspondence');assert(Number.isInteger(n.p.levelIndex)&&n.p.levelIndex>=0);return n;}).sort((a,b)=>a.p.levelIndex-b.p.levelIndex);
  assert(sources.length>0);assert.equal(new Set(sources.map(n=>n.p.levelIndex)).size,sources.length,'Ambiguous multiple profiles at one column level');assert.equal(sources[0].id,c.anchorSourceId,'Base anchor must be the first available source');
  return{id:c.id,anchorSourceId:c.anchorSourceId,referenceXY:[anchor.p.x,anchor.p.y],profileRelationship:c.profileRelationship,basePolicy:c.basePolicy,sources:sources.map(n=>({sourceId:n.id,levelIndex:n.p.levelIndex,letter:n.p.letter,originalPoseHash:A.hash(n.p),adaptedPoseHash:A.hash({...n.p,x:anchor.p.x,y:anchor.p.y})}))};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const neighbors=new Map([...columnIds].map(id=>[id,new Set()])),seen=new Set();
 for(const edge of selection.adjacency){assert(edge.length===2&&edge[0]!==edge[1]&&edge.every(id=>columnIds.has(id)),'Unsupported architectural adjacency');const k=edge.slice().sort().join('|');assert(!seen.has(k),'Duplicate adjacency');seen.add(k);edge.forEach((id,i)=>neighbors.get(id).add(edge[1-i]));}
 assert([...neighbors.values()].every(s=>s.size<=2),'Branching perimeter correspondence requires review');
 const source=columns.flatMap(c=>c.sources.map(s=>{const p=byId.get(s.sourceId).p;return{...p,x:c.referenceXY[0],y:c.referenceXY[1],stableSourceId:s.sourceId,perimeterColumnId:c.id};}));
 const interior=(selection.includeInterior?catalog.filter(n=>n.p.architecturalRole==='interior'):[]).map(n=>({...n.p,stableSourceId:n.id}));
 const levels=[...new Set(catalog.filter(n=>n.p.architecturalRole==='perimeter').map(n=>n.p.levelIndex))].sort((a,b)=>a-b),counts=levels.map(level=>source.filter(p=>p.levelIndex===level).length);
 const r=structuredClone(reference),parent=r.sourceSnapshot;r.source=[...source,...interior];r.population=r.source.length;
 // Parent's full-building counts, landing acceptance and placement history are evidence,
 // not active validation of this smaller arrangement. Keep them explicitly under history.
 r.sourceSnapshot={baseline:parent.baseline,order:parent.order,openTopPlanks:parent.openTopPlanks,printWallFeet:parent.printWallFeet,computationalSupportFeet:parent.computationalSupportFeet,adapterVersion:VERSION,parentProvenance:{referenceRequestHash:selection.referenceRequestHash,sourceSnapshot:parent},
  perimeterProfile:parent.perimeterProfile?{...parent.perimeterProfile,counts,placementPreserved:source.every(p=>{const n=byId.get(p.stableSourceId);return p.x===n.p.x&&p.y===n.p.y;}),interiorPreserved:!!selection.includeInterior,operation:'Retain each selected authentic source scale; update actual availability counts. Original profile application is retained under parentProvenance.'}:undefined,
  variablePopulation:{version:VERSION,referenceRequestHash:selection.referenceRequestHash,columns,adjacency:selection.adjacency,includeInterior:!!selection.includeInterior,populationByLevel:Object.fromEntries(levels.map((level,i)=>[level,counts[i]])),selectionPolicy:'Explicit controlled source availability at polygon-established anchors; no inferred automatic territory-density rule. Selected native sizes/elevations/rotations are preserved; no intermediate letters are created.'}};
 r.sourceId=A.hash({version:VERSION,source:r.source,selection});r.sourceName='Room Within Volume · controlled variable perimeter population';return r;
}
function deriveStable(ctx,request){
 assert.equal(request.sourceSnapshot?.variablePopulation?.version,VERSION);const d=ctx.native.derive(request),ids=new Set();for(let i=0;i<d.nodes.length;i++){const id=d.nodes[i].p.stableSourceId;assert(typeof id==='string'&&id.startsWith(d.nodes[i].p.letter+'-')&&!ids.has(id),'Missing or ambiguous persistent source identity');ids.add(id);d.nodes[i].id=id;d.letters[i].id=id;}return d;
}
module.exports={VERSION,selectPopulation,deriveStable};
