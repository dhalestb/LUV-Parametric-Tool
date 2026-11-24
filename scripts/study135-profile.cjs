// Saved Rule A inputs, not saved architectural meshes. Native B is executed afresh.
const assert=require('assert/strict');
const {hash}=require('./polygon-plate-edge-proof.cjs');
const PROFILE='study135-exact-v1';
const VERSION='inserted-horizontal-plate/study135-generate-design-v1';
const REQUEST_HASH='0dbabfbbe2fc5e3901d84e4bdb283dc956baee88e71f0e5277cee979172ddc57';
const SOURCE_HASH='6331c67fb087b9074d629d67237fe0f5499655ee49e266d4cf2b7499212d6fa5';
const ARCHITECTURE_HASH='3c63b4c558cc797a59805f03eaa7843ce6b139a6acf9a3fd16643c37184e0f36';
function study135Request(settings,seed){
 const request=structuredClone(require('../fixtures/inserted-plate/study135-request.json'));
 assert.equal(hash(request),REQUEST_HASH,'Study 135 source-pose integrity failed');
 assert.equal(settings.preferredFeet,13,'Study 135 requires its saved 13-ft source size');
 assert.equal(settings.spacingFeet,15,'Study 135 requires its saved 15-ft level spacing');
 assert.equal(settings.insetFeet,0,'Study 135 has no new sampling inset');
 assert.equal(seed,request.sourceSnapshot.arrangementSeed,'Study 135 requires its saved seed and poses');
 return request;
}
function verifyStudy135(formation){
 assert.equal(hash(formation.letters),SOURCE_HASH,'Study 135 source geometry changed');
 assert.equal(hash(formation.architecture),ARCHITECTURE_HASH,'Study 135 native architectural replay changed');
 assert.equal(formation.components.length,19);
 return {studyId:'51c37bd5-0170-47a5-8184-5961d97e7e3a',requestHash:REQUEST_HASH,nativeSourceHash:SOURCE_HASH,nativeArchitectureHash:ARCHITECTURE_HASH,exactNativeReplay:true,
  basis:'Verified original local generating overlay; not attributed to a complete pushed revision',
  poseSource:'Immutable saved Study 135 request; no resampling, sizing or clearance changes',
  worldPlacement:'Rigid heading and translation only; original field stays 60 x 60 x 60 ft'};
}
module.exports={PROFILE,VERSION,study135Request,verifyStudy135};
