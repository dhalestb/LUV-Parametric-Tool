require('../../scripts/ts-test-register.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseObj}=require('../../src/components/lattice/parseObj.ts');
const {buildV4Context}=require('../../src/components/evaluations/v4/evaluateV4.ts');
const {centralizedContext}=require('../../src/components/evaluations/v4/centralizedContext.ts');
const {reconstructArchitecturalRegions}=require('../../src/components/evaluations/v4/architecturalRegions.ts');
const {restoreReview}=require('../../src/components/evaluations/v4/spatialVerification.ts');
const {createSpatialReview}=require('../../src/components/evaluations/v4/spatialReviewFactory.ts');
const {geometryHash,verifiedResult}=require('../../src/components/evaluations/v4/verifiedCentralizedResult.ts');
const {round,measure,verifyStrip,elevationGaps}=require('./geometry.cjs');
const {regionDiagnosticSvg}=require('../../src/components/evaluations/v4/architecturalRegionDiagnostics.ts');
const refs=require('../spatial-review/confirmations.json'),baseline=require('../spatial-review/comparison-matrix.json');
const out=path.join(__dirname,'../../public/centralized-source-review');
const projections=(bounds,iso)=>{
  const proj=p=>iso?[p[0]-p[1],(p[0]+p[1])*.45-p[2]]:[p[0],-p[1]];
  const pts=[];
  for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])pts.push(proj([x,y,z]));
  const ax=pts.map(p=>p[0]),ay=pts.map(p=>p[1]),x0=Math.min(...ax),y0=Math.min(...ay),s=Math.min(570/Math.max(1,Math.max(...ax)-x0),400/Math.max(1,Math.max(...ay)-y0));
  return p=>{const [x,y]=proj(p);return [30+(x-x0)*s,55+(y-y0)*s].map(n=>+n.toFixed(2));};
};
function draw(ctx,recon,row,iso){
 const r=recon.regions[row.region],project=projections(ctx.mesh.bounds,iso);
 let svg=regionDiagnosticSvg(ctx,recon,{selectedRegion:r.id,isometric:iso,levelId:iso?undefined:r.levelId});
 // Replace the coarse cell overlay with clipped source footprints, including holes.
 svg=svg.slice(0,svg.indexOf('<polygon'));
 const area=(loops,color,opacity)=>'<path fill-rule="evenodd" d="'+loops.map(poly=>'M'+poly.map(([x,y])=>project([x,y,row.z]).join(',')).join(' L')+' Z').join(' ')+'" fill="'+color+'" fill-opacity="'+opacity+'" stroke="'+color+'" stroke-width=".65"/>';
 svg+=area(row.footprint,'#7c97bd',.54)+area(row.uncovered,'#a18bba',.78)+area(row.low,'#f47e54',.9);
 for(const [i,route] of row.routes.entries()){
   const p=route.examplePath.map(project),mid=p[Math.floor(p.length/2)],x=mid[0],y=mid[1],labelY=72+i*18;
   const color=route.passing?'#5ad0df':'#ffcf85';
   svg+='<polyline points="'+p.map(v=>v.join(',')).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3"/><circle cx="'+x+'" cy="'+y+'" r="4" fill="'+color+'"/><path d="M'+x+','+y+' L520,'+labelY+'" fill="none" stroke="'+color+'" stroke-width=".65"/><text x="523" y="'+(labelY+3)+'" font-family="Arial" font-size="11" fill="'+color+'">R'+route.other+'</text>';
 }
 if(row.minimumSamples.length){const [x,y]=project(row.minimumSamples[0].point);svg+='<circle cx="'+x+'" cy="'+y+'" r="5" fill="#171922" stroke="white" stroke-width="2"/>';}
 svg+='<text x="16" y="475" font-family="Arial" font-size="11" fill="white">Blue: source support · orange: below 7 ft · violet: no cover · ring: sampled minimum</text><text x="16" y="492" font-family="Arial" font-size="11" fill="white">Cyan: tested local crossing · amber: unresolved crossing · all units in feet</text></svg>';
 return svg;
}
function auditRoutes(C,ctx,recon,id){
 const grouped=new Map();
 for(const c of recon.movementConnections.filter(c=>c.from===id||c.to===id)){
   const other=c.from===id?c.to:c.from,group=grouped.get(other)??new Map();
   for(const ids of [...c.sampleNodePairs,...(c.chainNodeIds.length?[c.chainNodeIds]:[])]){
     const points=ids.map(n=>ctx.network.nodes[n].position),key=[ids.join(','),ids.slice().reverse().join(',')].sort()[0];
     if(group.has(key))continue;
     let route=points,tests=points.slice(1).map((p,i)=>verifyStrip(C,ctx,points[i],p));
     const originalTests=tests;
     // An offset stays within the same endpoint cells. Keep both trials for audit.
     if(points.length===2 && tests.some(t=>!t.pass)){
       const [a,b]=points,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
       if(len>0)for(const offset of [-.4,-.2,.2,.4]){
         const trial=points.map(p=>[p[0]-offset*dy/len,p[1]+offset*dx/len,p[2]]);
         const outcome=verifyStrip(C,ctx,trial[0],trial[1]);
         if(outcome.pass){route=trial;tests=[outcome];break;}
       }
     }
     group.set(key,{path:route.map(p=>p.map(round)),originalPath:points.map(p=>p.map(round)),originalTests,types:c.type,sourceTriangles:c.sourceTriangleIds,pass:tests.every(t=>t.pass),tests});
   }
   grouped.set(other,group);
 }
 return [...grouped].map(([other,group])=>{const options=[...group.values()],good=options.filter(o=>o.pass);const example=good[0]??options[0];return {other,tested:options.length,passing:good.length,examplePath:example.path,examples:options};});
}
(async()=>{
 const C=(await (await import('manifold-3d')).default());C.setup();
 fs.mkdirSync(out,{recursive:true});const all=[];
 for(const ref of refs){
   const original=baseline.find(x=>x.filename===ref.filename),raw=fs.readFileSync(path.join(process.argv[2],ref.filename));
   assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),original.sourceSha256);
   const m=parseObj(raw.toString('utf8'),ref.filename);
   assert.equal(await geometryHash(m,'z','feet'),ref.geometryHash);
   const meta=require('../spatial-review/'+ref.filename+'.spatial-review.json');
   const ctx=centralizedContext(buildV4Context({...m,unitScale:1,up:'z'},meta.sourceId));
   const recon=reconstructArchitecturalRegions(ctx,{enabled:true});
   const floorReview=restoreReview(meta,await createSpatialReview(ctx,recon,{id:meta.sourceId,hash:ref.geometryHash,filename:ref.filename,unit:'feet',up:'z'},C));
   const model={filename:ref.filename,geometryHash:ref.geometryHash,sourceSha256:original.sourceSha256,sourceHeader:raw.toString('utf8').split(/\r?\n/).slice(0,2),groups:m.groups.map(g=>g.name),reviews:[]};
   if(ref.filename==='Linear.obj')model.verticalGaps=elevationGaps(ctx.mesh.triangles,recon.regions[10].centroid[2],recon.regions[3].centroid[2]);
   for(const location of ref.locations){
     const r=recon.regions[location.id],seed=meta.regions.find(v=>v.id===r.id);
     assert.deepEqual(r.sampleIds,seed.sampleIds);
     assert.deepEqual(r.sampleIds.map(id=>ctx.field.samples[id].position),seed.boundaryCells);
     assert.ok(seed.boundaryCells.every(p=>Math.abs(p[2]-r.centroid[2])<.0001),'expected horizontal region');
     const row=measure(C.CrossSection,ctx,r,seed);row.routes=auditRoutes(C.CrossSection,ctx,recon,r.id);
     assert.ok(Math.abs(row.clear7Area+row.low7Area-row.supportArea)<.001);
     assert.ok(row.clear7Area<=row.supportArea+.001&&row.supportArea<=r.area+.001);
     model.reviews.push(row);
     for(const iso of [false,true])fs.writeFileSync(path.join(out,ref.filename+'-R'+r.id+(iso?'-3D':'-plan')+'.svg'),draw(ctx,recon,row,iso));
     console.log(ref.filename,'R'+r.id,'support',row.supportArea,'clear',row.clear7Area,'covered',row.coveredArea,'diameter',row.maxClearDiskDiameterFt,'min',row.minClear,'median',row.medianBoundedClear,'routes',row.routes.map(s=>[s.other,s.passing,s.tested]));
   }
   const result=verifiedResult(floorReview,ctx);assert.equal(result.available,false);
   all.push(model);
 }
 fs.writeFileSync(path.join(out,'source-evidence.json'),JSON.stringify(all,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
