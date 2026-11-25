const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,p);
const dir='../src/components/polygonExperiment/';
const model=require(dir+'model.ts'),territory=require(dir+'territories.ts'),registry=require(dir+'polygonRegistry.ts').default;
const {generateContinuousSite}=require(dir+'continuousDesign.ts');
// Independent audit of all rendered faces, including undersides. Production
// measures the upper envelope of the triangulated solids.
function projectMesh(api,mesh){
  const rings=[];
  for(let i=0;i<mesh.indices.length;i+=3){
    const ring=mesh.indices.slice(i,i+3).map(j=>[mesh.positions[3*j],mesh.positions[3*j+2]]);
    const area=territory.signedArea(ring);
    if(Math.abs(area)>1e-10)rings.push(area>0?ring:ring.reverse());
  }
  return new api.CrossSection(rings,'NonZero');
}

async function main(){
  const api=await require('manifold-3d/manifold.js').default();api.setup();
  territory.geometryKernel=async()=>api;
  global.fetch=async url=>new Response(fs.readFileSync(path.join(__dirname,'../public',new URL(url,'http://localhost').pathname)));
  const project=structuredClone(require('../public/experiment-inputs/two-zone.json'));
  project.exclusions=[];project.corridors=[];project.coordinates.elevationDatum=4;
  project.zones.forEach((z,i)=>{const x=i*350;z.enabled=true;z.maxHeightFeet=48;z.name='Cluster '+(i+1);
    z.polygon=[[x,0],[x+142,0],[x+142,389],[x+80,389],[x+70,365],[x,365]];});
  const state=model.initialState();state.site=await model.importSite(JSON.stringify(project),'file');
  const [a,b]=state.site.zones;
  for(const z of [a,b]){
    const assignment=model.newAssignment();
    for(const t of registry.items.slice(0,5))assignment.shares[t.id]=20;
    state.assignments[z.id]=assignment;
    state.territoryByZone[z.id]={controls:{...territory.defaults(),clustering:100},results:{}};
  }
  const protection=[[[59,95],[81,95],[81,145],[59,145]]];
  state.territoryByZone[a.id].controls.reserved=[{id:'reserved',polygon:protection[0]}];
  Object.assign(state.assignments[b.id].shares,{'linear-edge-gallery':25,'inserted-plate':0,'vertical-walls':25,'room-within-volume':25,'void-field':25});
  const generate=()=>generateContinuousSite(state,registry,()=>null,()=>{});
  // One continuous gallery crosses two supplied envelopes. Measure the exported
  // world-space vertices inside each region, independently of the height report.
  const explicit=structuredClone(state);
  explicit.site.zones[1].enabled=false;
  explicit.site.zones[0].polygon=[[0,0],[150,0],[150,180],[0,180]];
  explicit.territoryByZone[a.id].controls.reserved=[];
  for(const t of model.TYPOLOGIES)explicit.assignments[a.id].shares[t]=t==='linear-edge-gallery'?100:0;
  const rect=(left,right)=>[[left,0],[right,0],[right,180],[left,180]];
  const supplied={regions:[
    {id:'high',role:'street',heightFeet:60,polygon:rect(0,75)},
    {id:'low',role:'water',heightFeet:20,polygon:rect(75,150)}
  ]};
  const fromRegions=()=>generateContinuousSite(explicit,registry,()=>supplied,()=>{});
  const [{architecture:measured}]=(await fromRegions()).records;
  const peaks=[0,0],points=measured.architecture.positions;
  for(let i=0;i<points.length;i+=3){
    if(Math.abs(points[i]-75)<.001)continue;
    const side=Number(points[i]>75);
    peaks[side]=Math.max(peaks[side],points[i+1]-explicit.site.coordinates.elevationDatum);
  }
  assert.deepEqual(peaks,[60,20]);
  supplied.regions[1].polygon=rect(76,150);
  await assert.rejects(fromRegions,/uncovered/);
  supplied.regions[1].polygon=rect(74,150);
  await assert.rejects(fromRegions,/overlap/);
  let old,compactInterface;
  for(const clustering of [100,0,65]){
    state.territoryByZone[a.id].controls.clustering=clustering;
    const batch=await generate();
    assert.equal(batch.records.length,2);
    for(const {orientation:o,architecture:r} of batch.records){
      const plan=batch.territoryByZone[o.zoneId].results.area;
      assert(plan.metrics.valid);
      if(o.zoneId===a.id){
        const perimeter=plan.territories.flatMap(t=>t.contours).reduce((sum,r)=>sum+r.reduce((n,p,i)=>{
          const q=r[(i+1)%r.length];return n+Math.hypot(p[0]-q[0],p[1]-q[1]);
        },0),0);
        if(clustering===100)compactInterface=perimeter;
        if(clustering===0)assert(perimeter>compactInterface*1.15,'Dispersal must increase the interface between typologies.');
      }
      assert.equal(r.validation.connectedBodies,1);
      assert.equal(r.provenance.members.length,o.zoneId===a.id?5:4);
      const projection=projectMesh(api,r.architecture),permitted=new api.CrossSection(plan.permitted,'NonZero');
      const missing=permitted.subtract(projection),excess=projection.subtract(permitted);
      assert(missing.area()<.03&&excess.area()<.03);
      for(const s of [excess,missing,permitted,projection])s.delete();
      for(const m of r.provenance.members){
        assert(Math.abs(m.achievedPercent-m.allocatedPercent)<.0001);
        const regionParts=r.components.filter(p=>p.id.startsWith(m.typology+'/'));
        assert(regionParts.length>=3);
        const raised=r.planLayers.filter(l=>l.typology===m.typology&&l.top>1).map(l=>new api.CrossSection(l.contours,'NonZero'));
        const elevated=api.CrossSection.union(raised);
        assert(elevated.area()>.10*m.footprintAreaFeet2,'Elevated architecture must develop the territory above its ground floor.');
        elevated.delete();raised.forEach(s=>s.delete());
        assert(new Set(r.planLayers.filter(l=>l.typology===m.typology).map(l=>l.top)).size>=2);
        const projectedParts=regionParts.map(p=>projectMesh(api,p.mesh));
        const union=api.CrossSection.union(projectedParts);
        assert(Math.abs(union.area()-m.footprintAreaFeet2)<.035);
        union.delete();projectedParts.forEach(s=>s.delete());
      }
    }
    const current=batch.records.map(r=>r.architecture.geometryHash);
    if(old){assert.notEqual(current[0],old[0]);assert.equal(current[1],old[1]);}
    old=current;console.log('Passed geometry at clustering',clustering);
  }
  const repeat=await generate();assert.deepEqual(repeat.records.map(r=>r.architecture.geometryHash),old);
  // Tapered, re-entrant cluster outlines expose unsupported gallery lintels and
  // detached slivers that a straight rectangular test parcel cannot reproduce.
  const irregular=[
    [[0,162],[33,12],[78,12],[95,0],[137,21],[100,79],[154,143],[142,194]],
    [[0,0],[81,4],[82,53],[143,193],[138,233],[92,233],[72,253],[-3,253]]
  ];
  project.zones.forEach((z,i)=>{
    const ring=irregular[i],scale=Math.sqrt((i?55253:51002)/Math.abs(territory.signedArea(ring)));
    z.polygon=ring.map(([x,y])=>[i*350+x*scale,y*scale]);
  });
  state.site=await model.importSite(JSON.stringify(project),'file');
  for(const level of [100,0,65]){
    state.territoryByZone[a.id].controls.clustering=level;
    const batch=await generate();
    for(const r of batch.records)assert.equal(r.architecture.validation.connectedBodies,1);
  }
  // Both drawn Miami zones, in site feet. A clipped detail in the second
  // zone previously aborted the entire batch at the default 65% clustering.
  project.zones[0].polygon=[
    [1323.2165483067392,-2487.697455981793],[1088.4479030753585,-2420.800970074578],
    [1090.9723746455338,-2273.1238899661494],[1136.411476217358,-2202.440904707371],
    [1231.0761787125698,-2202.440904707371],[1257.5823675191784,-2178.4591874709376],
    [1316.9055773850007,-2212.5385136498057],[1247.4847585767434,-2319.825296657628],
    [1338.3629617203917,-2417.0144707230147]
  ];
  project.zones[1].polygon=[
    [1099.2033506426278,-2140.54308619018],[1201.8104501598311,-2142.1216182644334],
    [1234.1711381032876,-2112.9180811829574],[1299.6818667408008,-2113.7073472200836],
    [1305.9961684647615,-2058.4573372056384],[1219.964002581113,-1860.346705932319],
    [1220.7532686182396,-1788.521762284319],[1103.939120292335,-1781.4181945232315]
  ];
  project.name='Miami waterfront study';
  project.import={filename:'miami-waterfront.glb',sampleId:'miami-waterfront',format:'glb',modelFeetPerUnit:3.280839895};
  project.constraints.heightLimitFeet=80;
  for(const zone of project.zones)zone.maxHeightFeet=80;
  state.site=await model.importSite(JSON.stringify(project),'file');
  for(const [i,z] of state.site.zones.entries()){
    const controls=state.territoryByZone[z.id].controls;
    Object.assign(controls,{clustering:65,areaCutAngle:i===0?0:90,reserved:[]});
    for(const t of model.TYPOLOGIES)state.assignments[z.id].shares[t]=model.isLobbyTypology(t)||t===(i===0?'void-field':'inserted-plate')?0:25;
  }
  const {miamiParcelScale}=require('../src/components/siteDevelopment/siteImport.ts');
  // The native gold Site-layer extents distinguish the two saved Miami frames.
  const parcel={suggestedZone:[[310.797,-781.746],[424.698,-781.746],[424.698,-523.821],[310.797,-523.821]]};
  const modelScale=3.280839895;
  assert.equal(miamiParcelScale(parcel,project.zones,1),modelScale);
  const nativeZones=project.zones.map(z=>({polygon:z.polygon.map(([x,y])=>[x/modelScale,y/modelScale])}));
  assert.equal(miamiParcelScale(parcel,nativeZones,1),1);
  assert.equal(miamiParcelScale(parcel,[nativeZones[0],project.zones[1]],1),null);
  assert.equal(miamiParcelScale(parcel,[],1),null);
  const miami=await generate();
  for(const {architecture,orientation} of miami.records){
    assert.equal(architecture.validation.connectedBodies,1);
    assert.equal(architecture.provenance.members.length,4);
    for(const m of architecture.provenance.members){
      assert(m.sourceCount>1);
      assert(Math.abs(m.achievedPercent-25)<.0001);
    }
    const bands=architecture.provenance.heightRegions;
    console.log(orientation.typologyName,bands.map(b=>[b.role,b.capFeet,b.builtFeet]));
    assert.deepEqual(bands.map(b=>b.capFeet),[60,40,20]);
    assert(bands.every(b=>b.areaFeet2>0 && b.builtFeet<=b.capFeet+.001));
    assert(bands[0].builtFeet>bands[1].builtFeet+5 && bands[1].builtFeet>bands[2].builtFeet+5);
    console.log(orientation.typologyName,orientation.components.length,'source letters');
  }
  // A density edit reuses the prepared territory geometry and affects only the selected study members.
  state.territoryByZone=miami.territoryByZone;
  const key=z=>JSON.stringify([state.site.fingerprint,z.id]);
  const gallery='linear-edge-gallery',stepped='vertical-walls';
  state.generation={method:'typology-area',zones:{
    [key(a)]:{letterTargets:{[gallery]:1}},
    [key(b)]:{letterTargets:{[gallery]:7,[stepped]:24}}
  }};
  const restored=model.loadState(JSON.stringify(state));
  const denser=await generateContinuousSite(restored,registry,()=>null,()=>{});
  for(const [index,{architecture,orientation}] of denser.records.entries()){
    const z=state.site.zones[index],targets=state.generation.zones[key(z)].letterTargets;
    assert.equal(denser.territoryByZone[z.id].results.area,restored.territoryByZone[z.id].results.area);
    assert.equal(architecture.provenance.clustering,65);
    assert.equal(architecture.validation.connectedBodies,1);
    for(const m of architecture.provenance.members){
      const original=miami.records[index].architecture.provenance.members.find(p=>p.typology===m.typology);
      assert.equal(m.territoryAreaFeet2,original.territoryAreaFeet2);
      assert(Math.abs(m.achievedPercent-25)<.0001);
      assert.equal(m.letterTarget,targets[m.typology]??original.letterTarget);
      assert.equal(m.sourceCount,orientation.components.filter(l=>l.id.startsWith(m.typology+'/')).length);
      if(targets[m.typology]===undefined)assert.equal(m.sourceCount,original.sourceCount);
      else if(m.typology===gallery)assert.equal(m.sourceCount,targets[gallery]);
      else assert(m.sourceCount>original.sourceCount&&m.sourceCount<=m.letterTarget);
    }
  }
  console.log('Passed per-cluster letter targets, settings reload, area conservation and independent clustering.');
  const lobby='vertical-void-lobby';
  const lobbyState=structuredClone(restored);
  for(const [index,z] of lobbyState.site.zones.entries()){
    const shares=lobbyState.assignments[z.id].shares;
    shares[lobby]=shares[gallery];shares[gallery]=0;
    lobbyState.generation.zones[key(z)].letterTargets={[lobby]:index===0?6:16};
  }
  const runLobby=()=>generateContinuousSite(lobbyState,registry,()=>null,()=>{});
  const lobbyBatch=await runLobby();
  for(const [index,{architecture,orientation}] of lobbyBatch.records.entries()){
    const m=architecture.provenance.members.find(m=>m.typology===lobby);
    assert.equal(m.sourceCount,index===0?6:16);
    assert.equal(m.stacks.reduce((n,s)=>n+s.count,0),m.sourceCount);
    assert.equal(m.stacks.length,index===0?1:2);
    assert(m.stacks.every(s=>s.sha256.length===64));
    assert(Math.abs(m.achievedPercent-25)<.0001);
    assert.equal(architecture.validation.connectedBodies,1);
    assert(architecture.provenance.heightRegions.every(b=>b.builtFeet<=b.capFeet+.001));
    assert.equal(orientation.components.filter(l=>l.id.startsWith(lobby+'/')).length,m.sourceCount);
    console.log('Miami lobby:',m.stacks.map(s=>s.key),m.achievedPercent,m.sourceCount);
  }
  const compressed='compressed-sequential-lobby';
  for(const [i,z] of lobbyState.site.zones.entries()){
    const shares=lobbyState.assignments[z.id].shares;
    shares[compressed]=shares['room-within-volume'];shares['room-within-volume']=0;
    lobbyState.generation.zones[key(z)].letterTargets[compressed]=i===0?15:18;
  }
  const combined=await runLobby();
  for(const [i,{architecture,orientation}] of combined.records.entries()){
    const member=architecture.provenance.members.find(m=>m.typology===compressed);
    assert.equal(member.sourceCount,i===0?15:18);
    assert.equal(member.sequences.reduce((n,p)=>n+p.count,0),member.sourceCount);
    assert(member.sequences.every(p=>p.sha256.length===64));
    assert.equal(orientation.components.filter(l=>l.id.startsWith(compressed+'/')).length,member.sourceCount);
    assert(Math.abs(member.achievedPercent-25)<.0001);
    assert(architecture.provenance.members.some(m=>m.typology===lobby&&m.stacks.length));
    assert.equal(architecture.validation.connectedBodies,1);
    assert(architecture.provenance.heightRegions.every(r=>r.builtFeet<=r.capFeet+.001));
    console.log('Miami compressed lobby:',member.sequences.map(p=>p.key),member.achievedPercent,member.sourceCount);
  }
  const topo='topographic-ground-field-lobby';
  // Reopen a pre-topographic study with both previously integrated lobbies active.
  const beforeTopo=structuredClone(lobbyState);
  beforeTopo.territoryByZone=combined.territoryByZone;
  delete beforeTopo.profiles[topo];
  for(const a of Object.values(beforeTopo.assignments)){delete a.shares[topo];delete a.variants[topo];}
  for(const t of Object.values(beforeTopo.territoryByZone)){
    for(const k of ['enabled','locked','minimumDiameter'])delete t.controls[k][topo];
  }
  const upgrade=model.loadState(JSON.stringify(beforeTopo));
  for(const [i,z] of upgrade.site.zones.entries()){
    const a=upgrade.assignments[z.id],t=upgrade.territoryByZone[z.id];
    assert.equal(a.shares[topo],0);
    assert.equal(a.variants[topo],'spiral-ground-field');
    assert(territory.currentTerritoryResult(upgrade.site,z,a,t.controls,t.results.area));
    a.shares[topo]=a.shares['vertical-walls'];
    a.shares['vertical-walls']=0;
    upgrade.generation.zones[key(z)].letterTargets[topo]=i===0?7:21;
  }
  const topoBatch=await generateContinuousSite(upgrade,registry,()=>null,()=>{});
  for(const [i,{orientation,architecture}] of topoBatch.records.entries()){
    const m=architecture.provenance.members.find(m=>m.typology===topo);
    assert(Math.abs(m.achievedPercent-25)<.0001);
    assert.equal(m.sourceCount,i===0?7:21);
    assert.equal(m.fields.reduce((n,f)=>n+f.count,0),m.sourceCount);
    assert(m.fields.every(f=>f.sha256===require(dir+'topographic-lobby-fields.json')[f.key]));
    assert.equal(orientation.components.filter(l=>l.id.startsWith(topo+'/')).length,m.sourceCount);
    assert(architecture.provenance.members.some(m=>m.typology===lobby&&m.stacks.length));
    assert(architecture.provenance.members.some(m=>m.typology===compressed&&m.sequences.length));
    assert.equal(architecture.validation.connectedBodies,1);
    assert(architecture.provenance.heightRegions.every(r=>r.builtFeet<=r.capFeet+.001));
    console.log('Miami topographic lobby:',m.fields.map(f=>f.key),m.achievedPercent,m.sourceCount);
  }
  const oldState=structuredClone(restored);
  delete oldState.profiles[compressed];
  for(const a of Object.values(oldState.assignments)){delete a.shares[compressed];delete a.variants[compressed];}
  for(const t of Object.values(oldState.territoryByZone))for(const k of ['enabled','locked','minimumDiameter'])delete t.controls[k][compressed];
  delete oldState.profiles[lobby];
  for(const a of Object.values(oldState.assignments)){delete a.shares[lobby];delete a.variants[lobby];}
  for(const t of Object.values(oldState.territoryByZone))for(const k of ['enabled','locked','minimumDiameter'])delete t.controls[k][lobby];
  const migrated=model.loadState(JSON.stringify(oldState));
  for(const z of migrated.site.zones){
    assert.equal(migrated.assignments[z.id].shares[lobby],0);
    const t=migrated.territoryByZone[z.id];
    assert(territory.currentTerritoryResult(migrated.site,z,migrated.assignments[z.id],t.controls,t.results.area));
  }
  delete state.generation;
  state.site.zones[1].enabled=false;state.site.zones[0].inputParameters.maxHeightFeet=8;
  await assert.rejects(generate,/ft of height/);
  console.log('Passed exact shares, finished-mesh coverage, protected area, connectivity, height, zero shares, per-polygon clustering and deterministic replay.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
