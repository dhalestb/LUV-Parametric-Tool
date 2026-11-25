// Run with node scripts/test-allocated-site.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true}
  });
  module._compile(result.outputText, filename);
};
const root = path.resolve(__dirname, '..');
const dir = root + '/src/components/polygonExperiment/';
const model = require(dir+'model.ts');
const territory = require(dir+'territories.ts');
const registry = require(dir+'polygonRegistry.ts').default;
const {generateAllocatedSite} = require(dir+'allocatedDesign.ts');

async function main() {
  const kernel = await require('manifold-3d/manifold.js').default(); kernel.setup();
  territory.geometryKernel = async () => kernel;
  global.fetch = async url => {
    const name = new URL(url, 'http://localhost').pathname;
    assert.match(name, /^\/allocated-studies\/(?:[a-z-]+|vertical-void-lobby\/40-10|compressed-sequential-lobby\/20-15|topographic-ground-field-lobby\/60-15|linear-gallery-lobby\/reference-77)\.json\.gz$/);
    return new Response(fs.readFileSync(root+'/public'+name));
  };
  const project = require('../public/experiment-inputs/two-zone.json');
  project.coordinates.unit='feet'; project.coordinates.feetPerModel=1; project.coordinates.unitAssumption='confirmed';
  project.exclusions=[]; project.corridors=[];
  project.zones.forEach((z,i)=>{
    const x=i*400;
    z.enabled=true;z.maxHeightFeet=48;z.name='Cluster '+(i+1);
    z.polygon=[[x,0],[x+142,0],[x+142,389],[x+80,389],[x+70,365],[x,365]];
  });
  const state=model.initialState();
  state.site=await model.importSite(JSON.stringify(project),'file');
  const [first,second]=state.site.zones;
  for(const zone of state.site.zones)state.assignments[zone.id]=model.newAssignment();
  const shares=state.assignments[first.id].shares;
  for(const t of registry.items.slice(0,5))shares[t.id]=20;
  state.assignments[second.id].shares={...shares,'inserted-plate':0,'linear-edge-gallery':40};
  const controls=territory.defaults();
  controls.reserved=[{id:'keep-clear',polygon:[[60,100],[80,100],[80,145],[60,145]]}];
  state.territoryByZone[first.id]={controls,results:{}};
  const before=JSON.stringify(state);
  const generate=(s,rules=()=>null)=>generateAllocatedSite(s,registry,rules,()=>{});
  const result=await generate(state);
  assert.equal(JSON.stringify(state),before);
  assert.equal(result.records.length,2);
  const ids=new Set(),runIds=new Set();
  for(const {orientation:a,architecture:b} of result.records){
    const plan=result.territoryByZone[a.zoneId].results.area;
    const members=b.provenance.members;
    assert(plan.metrics.valid);
    assert.equal(members.length,a.zoneId===first.id?5:4);
    assert.equal(a.geometryHash,await model.fingerprint(a.components));
    assert.equal(b.geometryHash,await model.fingerprint(b.architecture));
    assert.equal(b.parentGeometryHash,a.geometryHash);
    assert.equal(b.parentOrientationId,a.id);
    runIds.add(b.provenance.runId);ids.add(a.id);
    for(const m of members){
      const t=plan.territories.find(t=>t.id===m.territory);
      assert.equal(m.scale,1);assert(m.footprintAreaFeet2>0);
      assert.equal(t.requestedPercent,state.assignments[a.zoneId].shares[m.typology]);
      const permitted=new kernel.CrossSection(t.contours);
      const boundary=new kernel.CrossSection([m.placementBoundary]);
      const outside=boundary.subtract(permitted);
      assert(outside.area()<1e-6);
      for(const surface of [outside,boundary,permitted])surface.delete();
    }
    assert(b.validation.heightAboveDatum<=48);
    assert(b.measurements.buildingCoveragePercent>0&&b.measurements.buildingCoveragePercent<100);
    assert.equal(b.components.length,new Set(b.components.map(p=>p.id)).size);
    assert.equal(a.components.length,new Set(a.components.map(p=>p.id)).size);
  }
  assert.equal(runIds.size,1);assert.equal(ids.size,2);
  state.territoryByZone=result.territoryByZone;
  const again=await generate(state);
  assert.deepEqual(again.records.map(r=>r.architecture.geometryHash),result.records.map(r=>r.architecture.geometryHash));
  const invalid=structuredClone(state);
  invalid.assignments[second.id].shares['void-field']=0;
  await assert.rejects(generate(invalid),/Cluster 2.*100%/);
  const tooLow=structuredClone(state);
  tooLow.site.zones[0].inputParameters.maxHeightFeet=10;
  await assert.rejects(generate(tooLow),/Cluster 1.*height/);
  const restricted=structuredClone(state);
  restricted.site.zones[1].enabled=false;
  restricted.assignments[first.id]=model.newAssignment();
  const rules=()=>({regions:[{id:'high',heightFeet:40,polygon:first.polygon}]});
  assert.equal((await generate(restricted,rules)).records.length,1);
  const lobbyState=structuredClone(restricted);
  lobbyState.assignments[first.id].shares['linear-edge-gallery']=0;
  lobbyState.assignments[first.id].shares['vertical-void-lobby']=100;
  const [{orientation:lobby,architecture:lobbyForm}]=(await generate(lobbyState)).records;
  assert.equal(lobby.components.length,10);
  assert.equal(lobbyForm.provenance.members[0].source.engine,'bf7fc3c');
  assert.equal(lobbyForm.provenance.members[0].scale,1);
  lobbyState.assignments[first.id].shares['vertical-void-lobby']=0;
  lobbyState.assignments[first.id].shares['compressed-sequential-lobby']=100;
  const [compressed]=(await generate(lobbyState)).records;
  assert.equal(compressed.orientation.components.length,15);
  assert.equal(compressed.architecture.provenance.members[0].source.engine,'bfce854');
  assert.equal(compressed.architecture.provenance.members[0].scale,1);
  const topo='topographic-ground-field-lobby';
  lobbyState.assignments[first.id].shares['compressed-sequential-lobby']=0;
  lobbyState.assignments[first.id].shares[topo]=100;
  lobbyState.site.zones[0].inputParameters.maxHeightFeet=60;
  const [groundField]=(await generate(lobbyState)).records;
  const member=groundField.architecture.provenance.members[0];
  assert.equal(member.typology,topo);
  assert.equal(member.source.variant,'spiral-ground-field');
  assert.equal(member.source.engine,'bfce854');
  assert.equal(member.scale,1);
  assert.deepEqual(groundField.orientation.components.map(l=>l.letter),Array.from({length:15},(_,i)=>['U','L','V'][i%3]));
  const ys=groundField.architecture.architecture.positions.filter((_,i)=>i%3===1);
  assert(Math.abs(Math.min(...ys)-lobbyState.site.coordinates.elevationDatum)<1e-5);
  const gallery='linear-gallery-lobby';
  lobbyState.assignments[first.id].shares[topo]=0;
  lobbyState.assignments[first.id].shares[gallery]=100;
  const [linear]=(await generate(lobbyState)).records;
  const galleryMember=linear.architecture.provenance.members[0];
  assert.equal(galleryMember.typology,gallery);
  assert.equal(galleryMember.source.referenceStudy,77);
  assert.equal(galleryMember.source.engine,'bfce854');
  assert.equal(galleryMember.scale,1);
  assert.deepEqual(linear.orientation.components.map(l=>l.letter),Array.from({length:15},(_,i)=>i%2?'U':'L'));
  console.log('Passed native placement of gathering and lobby studies, two-zone allocations, protection, height limits, repeatability, disabled zones and saved geometry hashes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
