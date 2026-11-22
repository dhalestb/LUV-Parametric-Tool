require('../scripts/ts-test-register.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseObj}=require('../src/components/lattice/parseObj.ts');
const {buildV4Context,evaluateV4}=require('../src/components/evaluations/v4/evaluateV4.ts');
const {centralizedContext}=require('../src/components/evaluations/v4/centralizedContext.ts');
const {reconstructArchitecturalRegions}=require('../src/components/evaluations/v4/architecturalRegions.ts');
const {createSpatialReview}=require('../src/components/evaluations/v4/spatialReviewFactory.ts');
const {geometryHash,verifiedResult}=require('../src/components/evaluations/v4/verifiedCentralizedResult.ts');
const {validateVerification}=require('../src/components/evaluations/v4/spatialVerification.ts');
const references=require('./completion-model-baseline.json'),ranks=require('./verified-rankings.json');
async function main(){
 const matrix=[];
 for(const reference of references){
  const filename=reference.filename,bytes=fs.readFileSync(path.join(process.argv[2],filename));
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),reference.sha256);
  const mesh=parseObj(bytes.toString(),filename);
  const review=JSON.parse(fs.readFileSync(path.join(__dirname,'spatial-review',filename+'.spatial-review.json')));
  const hash=await geometryHash(mesh,'z','feet');assert.equal(hash,review.geometryHash);
  const source={positions:mesh.positions,faces:mesh.faces,up:'z',unitScale:1};
  const ctx=centralizedContext(buildV4Context(source,review.sourceId));
  const regions=reconstructArchitecturalRegions(ctx,{enabled:true});
  const automatic=createSpatialReview(ctx,regions,{hash,id:review.sourceId,filename,unit:'feet',up:'z'});
  validateVerification(review,hash,automatic.regions);
  assert.deepEqual({...automatic,updatedAt:''},{...review,updatedAt:''});
  const score=verifiedResult(review,ctx),historical=evaluateV4(source,review.sourceId,{includeTopDecks:false});
  assert.equal(score.available,false);assert.equal(historical.sourceHash,reference.sourceHash);
  const row={filename,sourceSha256:reference.sha256,geometryHash:hash,topDecks:false,unit:'feet',up:'z',regions:review.regions.length,proposedConnections:review.connections.length,descriptors:{}};
  for(const prior of reference.descriptors){
   const current=historical.descriptors.find(d=>d.id===prior.id);
   if(prior.id==='centralized'){row.descriptors.centralized={score:null,rank:null,version:score.version,reason:score.unavailableReason,historicalScore:prior.score};continue;}
   assert.equal(current.absoluteScore,prior.score);
   const ranked=ranks.find(d=>d.id===prior.id).rows.find(r=>r.model===filename);
   row.descriptors[prior.id]={score:current.absoluteScore,rank:ranked.rank,cohort:ranked.cohort};
  }
  matrix.push(row);console.log(filename,row.regions,'regions,',row.proposedConnections,'proposals; verified metadata identity and all four baseline scores');
 }
 fs.writeFileSync(path.join(__dirname,'spatial-review','comparison-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
