'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {measureCohort} = require('./measure-hybrid-cohort.cjs');
const {generateDesign} = require('./generate-design.cjs');
const {version} = require('./site-rule-influence.cjs');
const {descriptorNames,descriptorRegions} = require('../src/components/polygonExperiment/descriptorInfluence.ts');
const cohort = require('../src/components/polygonExperiment/hybrid-cohort.json');
const base = require('../public/experiment-designs/0aef1f14-66a5-45b3-a2ba-a31248841e7f/input.json');
const control = require('../public/experiment-designs/0aef1f14-66a5-45b3-a2ba-a31248841e7f/response.json');
const proof = require('../public/experiment-designs/miami-plate-stepped-v1/rule-a.json');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'luv-influence-regression-'));
  const request = {domain:'selected-zone',site:base.site,zoneId:base.zoneId,siteRulePlan:base.siteRulePlan,
    reserved:[], planningDiameterFeet:20};
  const manual = platePercent => ({...request,generationMethod:'hybrid-rule',
    ruleInfluence:{version,platePercent,steppedPercent:100-platePercent}});
  const run = input => generateDesign(input,{outputRoot:root});
  try {
    assert.deepEqual(measureCohort(),cohort);
    const pair=manual(50);
    await assert.rejects(()=>run({...pair,ruleInfluence:{...pair.ruleInfluence,galleryPercent:20}}),/Only the versioned/);
    await assert.rejects(()=>run({...pair,ruleInfluence:{...pair.ruleInfluence,steppedPercent:'50'}}),/complementary/);
    await assert.rejects(()=>run({...pair,descriptorAreas:{openVolume:100}}),/one generation method/);
    await assert.rejects(()=>run({...request,generationMethod:'typology-area',descriptorAreas:{openVolume:100}}),/descriptor distribution/);
    assert.throws(()=>descriptorRegions({openVolume:80}),/total 100/);
    assert.throws(()=>descriptorRegions({openVolume:null}),/percentages/);
    assert.throws(()=>descriptorRegions({ordinal:100}),/Unsupported/);
    const kernel=await require('manifold-3d/manifold.js').default();kernel.setup();
    const {generateTerritories,defaults}=require('../src/components/polygonExperiment/territories.ts');
    const {newAssignment}=require('../src/components/polygonExperiment/model.ts');
    const assignment=newAssignment();
    Object.assign(assignment.shares,{'linear-edge-gallery':40,'inserted-plate':30,'vertical-walls':30});
    for(const strategy of ['area','geometry']){
      const result=generateTerritories(kernel,base.site,base.site.zones.find(z=>z.id===base.zoneId),assignment,
        defaults(),strategy,require('../src/components/polygonExperiment/registry-data.json'));
      assert(result.metrics.valid && result.territories.length===3);
    }
    const independent=await run(base);
    assert.equal(independent.orientation.geometryHash,control.orientation.geometryHash);
    assert.equal(independent.architecture.geometryHash,control.architecture.geometryHash);
    const half=await run(manual(50)),quarter=await run(manual(25));
    assert.equal(half.orientation.geometryHash,proof.geometryHash);
    const archiveDir=path.resolve(__dirname,'../public/experiment-architecture');
    const manifest=require(path.join(archiveDir,proof.id+'.manifest.json'));
    const archived=require(path.join(archiveDir,manifest.id+'.json'));
    assert.equal(half.architecture.geometryHash,archived.geometryHash);
    for(const file of ['world-architecture.obj','rule-b/combined-envelope.obj']) {
      const bytes=(dir)=>fs.readFileSync(path.join(dir,file),'utf8').replaceAll('\r\n','\n');
      assert.equal(bytes(path.join(root,half.runId)),bytes(path.resolve(__dirname,'../public/experiment-designs/miami-plate-stepped-v1')));
    }
    assert.notEqual(half.architecture.geometryHash,quarter.architecture.geometryHash);
    const halfRows=half.orientation.provenance.ruleInfluence.ledger;
    quarter.orientation.provenance.ruleInfluence.ledger.forEach((r,i)=>{
      assert(Math.abs(2*r.shiftFeet-halfRows[i].shiftFeet)<1e-9);
    });
    function validate(r) {
      assert.equal(r.status,'complete');assert(r.replay.matched);
      const v=r.architecture.validation;
      assert(v.nativeExports.passed && v.exactSavedAConsumed && v.occupiedSiteEnvelope.passed &&
        r.orientation.validation.sourceSiteEnvelope.passed && !v.sourceCollisions.length && v.connectedSolids===1);
      assert.equal(v.unresolvedFinalMeshIntersections,0);assert(v.outsideArea<1e-6);
      console.log(r.orientation.parameters.recipe,r.architecture.measurements.buildingFootprintFeet2,r.architecture.geometryHash);
    }
    validate(half);validate(quarter);
    for(const descriptor of Object.keys(descriptorNames)) {
      const r=await run({...request,generationMethod:'descriptor',descriptorAreas:{[descriptor]:100}});
      validate(r);
      const region=r.orientation.provenance.ruleInfluence.regions[0];
      assert.equal(region.descriptor,descriptor);assert.equal(region.evaluationVersion,cohort.version);
      assert(Math.abs(region.areaFeet2-control.architecture.measurements.territoryAreaFeet2)<1e-5);
      assert(r.orientation.provenance.ruleInfluence.ledger.every(row=>row.descriptor===descriptor));
    }
    const distributed=await run({...request,generationMethod:'descriptor',descriptorAreas:{openVolume:45,centralized:55}});
    validate(distributed);
    const {ledger,regions}=distributed.orientation.provenance.ruleInfluence;
    assert(regions.length===2 && regions.every(r=>r.generatedSourceFootprintFeet2>0));
    assert(new Set(ledger.map(row=>row.platePercent)).size>1,'Spatial distribution must change local lift weights');
    assert(Math.abs(regions[0].areaFeet2/regions[1].areaFeet2-45/55)<1e-6);
    for(const descriptorAreas of [{openVolume:1,centralized:99},{openVolume:40,visuallyConnected:35,centralized:25}]) {
      await assert.rejects(()=>run({...request,generationMethod:'descriptor',descriptorAreas}),/no native source lift/);
    }
    await assert.rejects(()=>run({...manual(50),reserved:[{id:'field-mask',polygon:base.stepped.organizingField.boundary}]}),/outside territory/);
    await assert.rejects(()=>run({...manual(50),site:{...base.site,fingerprint:'stale'}}),/original Miami/);
    console.log('PASS: independent controls, territory splits, influence ratios, all five measured descriptors, rejection gates and exact replay');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
