'use strict';

const assert = require('node:assert/strict');
const { sample, VERSION: plateVersion } = require('./plate-polygon-responsive.cjs');
const { hash } = require('./polygon-plate-edge-proof.cjs');
const siteProof = require('../public/experiment-inputs/shared-site-rule-proof-v1.json');
const receiver = require('../public/experiment-designs/0aef1f14-66a5-45b3-a2ba-a31248841e7f/input.json');
const donor = require('../public/experiment-designs/17cb9692-eb78-4a54-9314-7e3de823daa7/rule-a.json');
const version = 'site-rule-influence/plate-to-stepped-v1';

function prepare(input) {
  require('../vendor/typology-proof-20261121/proof/rule-amphitheater.cjs');
  const byDescriptor = input.generationMethod === 'descriptor';
  if(byDescriptor) {
    assert(!input.ruleInfluence, 'Descriptor contributions are computed from verified scores');
    const {descriptorRegions} = require('../src/components/polygonExperiment/descriptorInfluence.ts');
    input = {...input, ruleInfluence:{version, regions:descriptorRegions(input.descriptorAreas)}};
  }
  assert(input.ruleInfluence?.version === version, 'Unsupported cross-typology rule version');
  if (!byDescriptor) {
    assert(!Object.hasOwn(input,'descriptorAreas'), 'Select one generation method per request');
    const supported = new Set(['version','platePercent','steppedPercent']);
    assert(Object.keys(input.ruleInfluence).every(key => supported.has(key)),
      'Only the versioned Plate to Stepped pair is supported');
  }
  const { platePercent, steppedPercent } = input.ruleInfluence;
  assert(byDescriptor || (Number.isFinite(platePercent) && platePercent > 0 && platePercent < 100 &&
    Number.isFinite(steppedPercent) && Math.abs(steppedPercent-(100-platePercent))<1e-9), 'Two positive complementary influence percentages required');
  assert(input.zoneId === receiver.zoneId && input.site?.fingerprint === receiver.site.fingerprint &&
    input.site.revision === receiver.site.revision, 'This proof requires the original Miami Cluster Zone 1');
  const zone = input.site.zones.find(item => item.id === input.zoneId);
  const original = receiver.site.zones.find(item => item.id === receiver.zoneId);
  assert(zone?.enabled && hash(zone.polygon) === hash(original.polygon) &&
    hash(input.site.coordinates) === hash(receiver.site.coordinates), 'Source polygon or coordinate system changed');
  assert(input.domain === 'selected-zone' && !input.siteHandoffSelection && !input.siteHandoff,
    'Select the explicit whole-zone hybrid domain. Applied handoffs require a compatible hybrid adapter.');
  assert(Array.isArray(input.reserved) && Number.isFinite(input.planningDiameterFeet) && input.planningDiameterFeet >= 0,
    'Current site reserves and planning clearance required');
  assert(hash(siteProof.source.polygon)===siteProof.source.polygonHash &&
    siteProof.source.fingerprint===input.site.fingerprint && siteProof.source.revision===input.site.revision &&
    siteProof.source.buildingBaseFeet===receiver.datum, 'Roadways/Water proof source mismatch');
  for(const key of ['exclusions','reservedAreas','corridors']) assert.deepEqual(input.site[key],receiver.site[key],'Source protection changed');
  assert.deepEqual(zone.holes,original.holes,'Source zone holes changed');
  const modelPlan={source:{zoneId:zone.id,polygon:zone.polygon,coordinates:input.site.coordinates},
    regions:siteProof.heightRegions.map(r=>({...r,role:r.id}))};
  return { ...receiver, site:input.site, siteRulePlan:input.siteRulePlan??modelPlan, reserved:input.reserved,
    development:{...receiver.development, planningDiameterFeet:input.planningDiameterFeet},
    ruleInfluence:byDescriptor?input.ruleInfluence:{version, platePercent, steppedPercent} };
}

// Match the nearest plate station on the same 15-ft lift. Rotate and translate both
// native frames into site feet before interpolating XY. Native glyph poses stay rigid.
function influenceSources(source, weights, center, angle, site) {
  const regions = weights.regions ? spatialRegions(weights.regions,site) : [];
  // The bounded receiver is exactly the independently generated seed-69 control.
  // Measure its actual projected source meshes in site feet for spatial weighting.
  const control = regions.length ? require('../public/experiment-designs/0aef1f14-66a5-45b3-a2ba-a31248841e7f/rule-a.json') : null;
  if(control) assert.deepEqual(source,control.provenance.nativeRequest.source,'Independent receiver poses changed');
  const request = donor.provenance.nativeRequest;
  const context = request.sourceSnapshot.polygonAdapter;
  const plate = sample({polygon:context.polygon, frame:request.field, size:12, spacing:15,
    seed:39, fraction:context.extentFraction, orientationBasis:context.orientationBasis});
  const ca = Math.cos(donor.frame.angle), sa = Math.sin(donor.frame.angle);
  const ct = Math.cos(angle), st = Math.sin(angle);
  const anchors = plate.source.map((p,i) => {
    const saved = request.source[i];
    assert(p.x === saved.x && p.y === saved.y && p.levelIndex === saved.levelIndex,
      'Plate station differs from independent native control');
    const dx = donor.frame.center[0]+ca*p.x-sa*p.y-center[0];
    const dz = donor.frame.center[1]+sa*p.x+ca*p.y-center[1];
    return {id:p.letter+'-'+(i+1), x:ct*dx+st*dz, y:-st*dx+ct*dz, level:p.levelIndex};
  });
  const shifts = new Map();
  for (const level of new Set(source.map(p => p.levelIndex))) {
    const group = source.filter(p => p.levelIndex === level);
    const cx = group.reduce((sum,p) => sum+p.x,0)/group.length;
    const cy = group.reduce((sum,p) => sum+p.y,0)/group.length;
    const distance = a => Math.hypot(a.x-cx,a.y-cy);
    const target = anchors.filter(a => a.level === level).sort((a,b)=>distance(a)-distance(b))[0];
    assert(target,'No plate station on this lift');
    const contributions = [];
    if(control){
      const pieces = control.components.flatMap(({mesh},i)=>{
        if(source[i].levelIndex!==level)return [];
        const positions=mesh.positions.map((v,k)=>k%3===1?mesh.positions[k+1]:k%3===2?mesh.positions[k-1]:v);
        return [site.geometry.project({...mesh,positions})];
      });
      const projection=site.w.CrossSection.union(pieces);
      for(const piece of pieces)piece.delete();
      for(const region of regions){
        const section=new site.w.CrossSection(region.contours,'NonZero');
        const intersection=projection.intersect(section), area=intersection.area();
        if(area>1e-6)contributions.push({descriptor:region.descriptor,sourceAreaFeet2:area,platePercent:region.platePercent});
        intersection.delete();section.delete();
      }
      projection.delete();
      assert(contributions.length,'Lift outside descriptor areas');
    }
    const total=contributions.reduce((sum,r)=>sum+r.sourceAreaFeet2,0);
    const percent=contributions.length===0?weights.platePercent:contributions.length===1?contributions[0].platePercent:
      contributions.reduce((sum,r)=>sum+r.platePercent*r.sourceAreaFeet2/total,0);
    shifts.set(level,{target,cx,cy,contributions,percent});
  }
  const ledger = [];
  const poses = source.map((p,i) => {
    const {target,cx,cy,contributions,percent} = shifts.get(p.levelIndex);
    const t = percent/100;
    const x = p.x + t*(target.x-cx), y = p.y + t*(target.y-cy);
    ledger.push({descriptor:contributions.length===1?contributions[0].descriptor:undefined,contributions,platePercent:percent,source:p.letter+'-'+(i+1), donor:target.id, level:p.levelIndex,
      liftCenterXY:[cx,cy], independentXY:[p.x,p.y], donorXY:[target.x,target.y], hybridXY:[x,y], shiftFeet:Math.hypot(x-p.x,y-p.y)});
    return {...p,x,y};
  });
  assert(regions.every(region=>ledger.some(row=>row.contributions.some(r=>r.descriptor===region.descriptor))),
    'An assigned descriptor area contains no native source lift. Choose a different distribution.');
  return {poses, receipt:{...weights,regions:regions.length?regions:undefined, donorRule:plateVersion, donorControl:donor.id,
    receiverRule:'stepped-amphitheater/polygon-territory-v1', donorStage:'Rule A perimeter station',
    receiverStage:'Rule A horizontal position before native Stepped Rule B', plateSeed:39,
    levelSpacingFeet:15, frame:{center,angle}, nativeBefore:hash(source), influenced:hash(poses), ledger}};
}

function spatialRegions(requested,{w,domain,zone}) {
  const {cutArea} = require('../src/components/polygonExperiment/cutArea.ts');
  const policy = require('../src/components/polygonExperiment/geometryTolerances.json');
  const area=domain.area(), tolerance=Math.max(policy.allocationAbsoluteFeet2,area*policy.allocationRelative);
  let remaining = domain;
  try {
    return requested.map((r,i)=>{
      const target = area*r.areaPercent/100;
      const last = i===requested.length-1;
      const part = last?remaining:cutArea(w,remaining,zone.polygon,[1,0],target,tolerance);
      try {
        assert(Math.abs(part.area()-target)<=tolerance,'Descriptor area differs from requested area');
        const result={...r,areaFeet2:part.area(),contours:part.toPolygons()};
        if(!last) {
          const next=remaining.subtract(part);
          if(remaining!==domain) remaining.delete();
          remaining=next;
        }
        return result;
      } finally { if(!last) part.delete(); }
    });
  } finally { if(remaining!==domain) remaining.delete(); }
}

async function generateInfluencedDesign(input,outputRoot) {
  assert(outputRoot,'Hybrid execution requires an isolated job directory');
  const fs = require('node:fs'), path = require('node:path');
  const {generateSteppedDesign} = require('./stepped-design.cjs');
  const prepared = prepare(input);
  const trialRoot = fs.mkdtempSync(path.join(outputRoot,'replay-'));
  try {
    const replay = await generateSteppedDesign(prepared,{outputRoot:trialRoot});
    const result = await generateSteppedDesign(prepared,{outputRoot,expectedReplay:{matched:true,
      sourceHash:replay.orientation.geometryHash,architectureHash:replay.architecture.geometryHash}});
    assert.equal(result.orientation.geometryHash,replay.orientation.geometryHash,'Rule A replay differs');
    assert.equal(result.architecture.geometryHash,replay.architecture.geometryHash,'Rule B replay differs');
    result.replay={matched:true,sourceHash:replay.orientation.geometryHash,architectureHash:replay.architecture.geometryHash};
    return result;
  } finally { fs.rmSync(trialRoot,{recursive:true,force:true}); }
}
function localEnvelope(domain,siteRules) {
  const base={id:siteProof.proofHash,source:siteProof.source,protections:{permittedContours:domain}};
  return {...base,heightRegions:siteProof.heightRegions,additionalHeightRegions:siteRules.regions};
}
async function validateLocal(envelope,components) {
  const {validateOccupiedGeometry} = require('./site-typology-handoff.cjs');
  const local = await validateOccupiedGeometry(envelope,components);
  await validateOccupiedGeometry({...envelope,heightRegions:envelope.additionalHeightRegions},components);
  return local;
}
module.exports = {generateInfluencedDesign,version,influenceSources,localEnvelope,validateLocal};
