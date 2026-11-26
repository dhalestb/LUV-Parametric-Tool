const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {generateDesign}=require('./generate-design.cjs');

async function verify(record,root) {
  const {source,regions}=record, {coordinates,zoneId,polygon}=source;
  const site={coordinates,protectionMetadataComplete:true,zones:[{id:zoneId,polygon,holes:[],inputParameters:{maxHeightFeet:80}}],
    fingerprint:'polygon-gallery-test',revision:'fixture',exclusions:[],reservedAreas:[],corridors:[]};
  const input={site,zoneId,seed:2101342521,rotationSeed:189,spacing:13,heading:0,datum:0,recipe:'print-contour',
    adaptive:{typologyId:'linear-edge-gallery',allocationPercent:100,setbackFeet:0},development:{ruleBasis:'polygon-site-v1',planningDiameterFeet:20},siteRulePlan:{source,regions}};
  const response=await generateDesign(input,{outputRoot:root});
  assert.equal(response.status,'complete');
  const architecture=JSON.parse(fs.readFileSync(path.join(root,response.runId,'architecture-library',response.architecture.id+'.json')));
  assert.equal(architecture.parentGeometryHash,response.orientation.geometryHash);
  assert.equal(architecture.provenance.checkpoint,'a6493b62cb784e7ccacc327dbe8dc90a604f1e48');
  assert(architecture.validation.occupiedSiteEnvelope.passed);
  assert(architecture.validation.outsideArea<=1e-6);
  const m=architecture.measurements;
  assert(m.sourceLetterCoveragePercent>0 && m.sourceLetterCoveragePercent<=100);
  assert(m.totalPrimaryFloorPlateAreaFeet2>0 && m.exposedTerraceAreaFeet2>=0 && Number.isFinite(m.registeredProtectedVoidAreaFeet2));
  assert.equal(architecture.validation.occupiedSiteEnvelope.ledger.length,architecture.provenance.regions.length);
  assert(response.orientation.components.every(l=>Number.isFinite(l.nominalSizeFeet)));
  const ids=new Set(response.orientation.components.map(l=>l.id));
  for(const part of architecture.components)assert(part.sources.length && part.sources.every(id=>ids.has(id)));
  const kinds=new Set(architecture.components.map(p=>p.kind));
  for(const kind of ['wall','contour-floor','roof-plank','edge-column','daylight-return','connection'])assert(kinds.has(kind),kind);
  for(const r of architecture.provenance.regions){
    assert(r.sourceCount>0 && r.solidComponents===1 && r.outsideAreaFeet2<=1e-6 && r.buildingFootprintFeet2>0);
    assert(r.heightFeet<=r.limitFeet+1e-6 && r.builtFeet>0);
  }
  const wire=JSON.stringify({...response,payload:{architecture}});
  console.log(JSON.stringify({zoneId,letters:ids.size,parts:architecture.components.length,area:architecture.measurements.buildingFootprintFeet2,
    heights:architecture.provenance.heightRegions,bytes:Buffer.byteLength(wire),gz:zlib.gzipSync(wire).length}));
  await assert.rejects(()=>generateDesign({...input,siteRulePlan:{...input.siteRulePlan,regions:[]}}, {outputRoot:root}),/HEIGHT_BOUNDARIES_REQUIRED/);
}
async function main(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'test-gallery-polygon-'));
  try {
    const file=process.argv[2];
    if(file) await verify(JSON.parse(fs.readFileSync(file,'utf8')),root);
    else {
      const polygon=[[0,0],[115,0],[115,50],[68,50],[68,100],[0,100]];
      const source={zoneId:'concave',polygon,coordinates:{unit:'feet',unitAssumption:'confirmed',feetPerModel:1,elevationDatum:0}};
      await verify({source,regions:[{id:'street',role:'street',heightFeet:60,polygon}]},root);
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
