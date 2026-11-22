require('../../scripts/ts-test-register.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseObj}=require('../../src/components/lattice/parseObj.ts');
const {buildV4Context,evaluateV4}=require('../../src/components/evaluations/v4/evaluateV4.ts');
const {centralizedContext}=require('../../src/components/evaluations/v4/centralizedContext.ts');
const {reconstructArchitecturalRegions}=require('../../src/components/evaluations/v4/architecturalRegions.ts');
const {createSpatialReview}=require('../../src/components/evaluations/v4/spatialReviewFactory.ts');
const {evaluateFloors}=require('../../src/components/evaluations/v4/spatialVerification.ts');
const {geometryHash,verifiedResult}=require('../../src/components/evaluations/v4/verifiedCentralizedResult.ts');
const baseline=require('../spatial-review/comparison-matrix.json');
(async()=>{
  const lib=await (await import('manifold-3d')).default();lib.setup();
  const rows=[];
  for(const previous of baseline){
    const raw=fs.readFileSync(path.join(process.argv[2],previous.filename));
    assert.equal(require('node:crypto').createHash('sha256').update(raw).digest('hex'),previous.sourceSha256);
    const m=parseObj(raw.toString(),previous.filename),source={...m,unitScale:1,up:'z'};
    const hash=await geometryHash(m,'z','feet');
    const meta=require('../spatial-review/'+previous.filename+'.spatial-review.json');
    const ctx=centralizedContext(buildV4Context(source,meta.sourceId));
    const review=await createSpatialReview(ctx,reconstructArchitecturalRegions(ctx,{enabled:true}),{hash,id:meta.sourceId,filename:previous.filename,up:'z',unit:'feet'},lib);
    const levels=evaluateFloors(review),result=verifiedResult(review,ctx);
    const historical=evaluateV4(source,meta.sourceId,{includeTopDecks:false});
    const comparison={};
    for(const [id,d] of Object.entries(previous.descriptors)){
      if(id==='centralized')continue;
      assert.equal(historical.descriptors.find(x=>x.id===id).absoluteScore,d.score);
      comparison[id]=d.score;
    }
    const expected=require('../../public/centralized-source-review/source-evidence.json').find(m=>m.filename===previous.filename);
    for(const audit of expected.reviews){
      const candidate=levels.flatMap(f=>f.destinations).find(d=>d.region.id===audit.region);
      assert.ok(candidate,previous.filename+' R'+audit.region+' missing');
      assert.ok(Math.abs(candidate.region.area-audit.largestClear7Piece)<.02);
      assert.ok(candidate.areaPercent>0 && candidate.areaPercent<=100);
      assert.ok(Math.abs(candidate.metrics.suitability-candidate.region.area/(candidate.region.area+200))<1e-10);
    }
    if(previous.filename==='Linear.obj'){
      const containing=id=>levels.find(f=>f.destinations.some(d=>d.region.id===id));
      assert.ok(containing(10)&&containing(3));assert.notEqual(containing(10).level,containing(3).level);
      for(const [id,other] of [[10,3],[3,10]])assert.ok(!containing(id).connections.some(c=>c.from===other||c.to===other));
    }
    rows.push({filename:previous.filename,method:result.version,comparison,buildingScore:result.available?result.absoluteScore:null,
      floors:levels.map(f=>({floor:f.level,score:f.score,candidates:f.destinations.map(d=>({region:d.region.id,area:d.region.area,levelArea:d.floorArea,levelPercent:d.areaPercent,score:d.score,measuredGathering:d.metrics?.suitability??null,reasons:d.reasons}))}))});
  }
  fs.writeFileSync(path.join(__dirname,'area-results.json'),JSON.stringify(rows,null,2)+'\n');
  console.log('Verified three source files, twelve baseline scores and independent Linear R10/R3 floor graphs.');
})().catch(e=>{console.error(e);process.exitCode=1;});
