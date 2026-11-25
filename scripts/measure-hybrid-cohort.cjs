// Rebuild the review cohort using the same geometry path as the Evaluations tab.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('../vendor/typology-proof-20261121/proof/rule-amphitheater.cjs');
const {parseObj} = require('../src/components/lattice/parseObj.ts');
const {analyzeMesh} = require('../src/components/lattice/analyze.ts');
const {evaluateTileModel} = require('../src/components/evaluations/objDescriptorAnalysis.ts');
const {DESCRIPTOR_ALGORITHM_VERSION} = require('../src/components/evaluations/descriptorV2.ts');
const {hash} = require('./polygon-plate-edge-proof.cjs');

const controls = [
  ['vertical-walls','G1','0aef1f14-66a5-45b3-a2ba-a31248841e7f'],
  ['inserted-plate','G3','17cb9692-eb78-4a54-9314-7e3de823daa7'],
];
const descriptors = ['openVolume','visuallyConnected','circulationActivated','verticallyIntegrated','centralized'];
function measureCohort() {
  const forms = controls.map(([typology,slot,study]) => {
    const dir = path.resolve(__dirname,'../public/experiment-designs',study);
    const bytes = fs.readFileSync(path.join(dir,'world-architecture.obj'));
    const obj = parseObj(bytes.toString(),typology+'.obj');
    const response = require(path.join(dir,'response.json'));
    assert(response.status==='complete' && response.architecture.validation.nativeExports.passed);
    const mesh = require(path.resolve(__dirname,'../public'+response.architecture.url)).architecture;
    assert.equal(hash(mesh),response.architecture.geometryHash);
    assert.deepEqual(Array.from(obj.positions),mesh.positions.map(Math.fround));
    assert.deepEqual(obj.faces.flatMap(f=>f.vertices),mesh.indices);
    const model = analyzeMesh(obj,slot,1,'y');
    const evaluation = evaluateTileModel(model,{positions:obj.positions,faces:obj.faces,up:'y',unitScale:1});
    const scores = Object.fromEntries(descriptors.map(id=>{
      const value = evaluation.descriptors.find(d=>d.id===id)?.absoluteScore;
      assert(Number.isFinite(value) && value>=0 && value<=100);
      return [id,value];
    }));
    return {typology,slot,study,geometryHash:response.architecture.geometryHash,objSha256:hash(bytes),
      cellFeet:model.cellFeet,scores};
  });
  assert.equal(forms[0].cellFeet,forms[1].cellFeet,'Cohort needs equal voxel resolution');
  return {id:'miami-zone1-independent-rule-b/v1',version:DESCRIPTOR_ALGORITHM_VERSION,
    basis:'Complete site-coordinate Rule B OBJ, Y up, feet',forms};
}
module.exports = {measureCohort};
if(require.main === module) console.log(JSON.stringify(measureCohort(),null,2));
