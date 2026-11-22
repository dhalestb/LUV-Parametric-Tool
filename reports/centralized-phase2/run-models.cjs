require('../../scripts/ts-test-register.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseObj}=require('../../src/components/lattice/parseObj.ts');
const {buildV4Context,evaluateV4}=require('../../src/components/evaluations/v4/evaluateV4.ts');
const {reconstructArchitecturalRegions}=require('../../src/components/evaluations/v4/architecturalRegions.ts');
const {regionDiagnosticSvg}=require('../../src/components/evaluations/v4/architecturalRegionDiagnostics.ts');
const dir=process.argv[2]||process.env.LUV_PHASE2_MODEL_DIR;
if(!dir)throw new Error('Pass the directory containing Linear.obj, Stepped.obj, Void_Field.obj.');
const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'model-evidence.json'),'utf8'));
const summary=[];
for(const item of prior){
  const raw=fs.readFileSync(path.join(dir,item.filename)),fileHash=crypto.createHash('sha256').update(raw).digest('hex');
  const m=parseObj(raw.toString('utf8'),item.filename),source={positions:m.positions,faces:m.faces,up:'z',unitScale:1};
  const original=Buffer.from(m.positions.buffer).toString('base64');
  const ctx=buildV4Context(source,item.result.sourceId);
  assert.equal(ctx.mesh.sourceHash,item.result.sourceHash,'Must match the actual uploaded model, including source ID, units and up axis.');
  const before=evaluateV4(source,item.result.sourceId),result=reconstructArchitecturalRegions(ctx,{enabled:true});
  assert.equal(Buffer.from(m.positions.buffer).toString('base64'),original);
  const after=evaluateV4(source,item.result.sourceId);
  assert.deepEqual(after,before,'Diagnostic reconstruction must not change any production descriptor result.');
  assert.deepEqual(result,reconstructArchitecturalRegions(ctx,{enabled:true}),'Results must be deterministic.');
  const originalEdges=new Set(ctx.network.edges.map(e=>[e.a,e.b].sort((a,b)=>a-b).join(':')));
  for(const c of result.movementConnections.filter(c=>c.status==='verified')){
    assert.notEqual(c.from,c.to);
    if(c.type==='vertical-chain')assert.ok(c.chainNodeIds.slice(1).every((id,i)=>originalEdges.has([id,c.chainNodeIds[i]].sort((a,b)=>a-b).join(':'))));
    else assert.ok(c.sampleNodePairs.every(pair=>originalEdges.has([...pair].sort((a,b)=>a-b).join(':'))));
    if(c.type==='opening'){assert.ok(c.widthFeet>0&&c.sourceTriangleIds.length>0);for(const [a,b]of c.sampleNodePairs){const pa=ctx.network.nodes[a].position,pb=ctx.network.nodes[b].position;for(const h of [1.5,3,5.5])assert.ok(ctx.grid.segmentClear([pa[0],pa[1],pa[2]+h],[pb[0],pb[1],pb[2]+h]));}}
  }
  const slug=item.filename.replace(/\.obj$/i,'');
  const visuals={before:regionDiagnosticSvg(ctx,result,{old:true,isometric:true}),after:regionDiagnosticSvg(ctx,result,{isometric:true}),plans:ctx.field.levels.map(l=>({levelId:l.id,elevation:l.elevation,before:regionDiagnosticSvg(ctx,result,{old:true,levelId:l.id}),after:regionDiagnosticSvg(ctx,result,{levelId:l.id})}))};
  fs.writeFileSync(path.join(__dirname,slug+'-before.svg'),visuals.before);fs.writeFileSync(path.join(__dirname,slug+'-after.svg'),visuals.after);
  for(const p of visuals.plans)for(const side of ['before','after'])fs.writeFileSync(path.join(__dirname,`${slug}-level-${p.levelId}-${side}.svg`),p[side]);
  const count=(list)=>list.reduce((a,c)=>{const k=c.type+':'+c.status;a[k]=(a[k]||0)+1;return a;},{});
  const pairs=list=>new Set(list.filter(c=>c.status==='verified').map(c=>[c.from,c.to].join(':'))).size;
  const entry={filename:item.filename,sourceFileSha256:fileHash,sourceId:ctx.mesh.sourceId,sourceHash:ctx.mesh.sourceHash,originalRegions:result.originalRegions,spaces:result.regions.filter(r=>!r.transitional).length,transitions:result.regions.filter(r=>r.transitional).length,allRegions:result.regions.length,originalRegionEdges:result.originalRegionEdges,movementRecords:count(result.movementConnections),organizationalRecords:count(result.organizationalRelationships),distinctMovementPairs:pairs(result.movementConnections),distinctOrganizationalPairs:pairs(result.organizationalRelationships),unchangedProductionCentralizedScore:before.descriptors.find(d=>d.id==='centralized').absoluteScore,levels:ctx.field.levels.map(l=>({id:l.id,elevation:l.elevation})),rawNodes:ctx.network.nodes.length,rawEdges:ctx.network.edges.length};
  summary.push(entry);
  fs.writeFileSync(path.join(__dirname,slug+'-evidence.json'),JSON.stringify({summary:entry,result,sampleGraph:{nodes:ctx.network.nodes,edges:ctx.network.edges,levelLinks:ctx.network.levelLinks,samples:ctx.field.samples}},null,2));
  console.log(JSON.stringify(entry));
}
fs.writeFileSync(path.join(__dirname,'final-model-summary.json'),JSON.stringify(summary,null,2));
