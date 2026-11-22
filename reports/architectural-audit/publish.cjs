const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const out = path.join(root,'public/centralized-source-review');
const models = require(path.join(out,'source-evidence.json'));
const previous = require('../spatial-review/comparison-matrix.json');
const decisions = {
 'Linear.obj': {
   10: ['Covered lower-floor gathering candidate.', 'Is the blue footprint the occupied lower hall? Mark the stair entrance if this model is meant to include one.'],
   3: ['Covered gallery candidate with localized low headroom.', 'Does the blue area include a covered exterior loft? Identify its boundary and the stair landing inside or outside the outline.'],
   4: ['Predominantly open-to-sky upper surface. Occupancy is unknown.', 'Is this accessible occupied space or a roof? Indicate the access point if occupied.']},
 'Stepped.obj': {
   70: ['Connected floor with localized obstructions. Its seven-foot-clear footprint is too narrow for a ten-foot gathering patch.', 'Is the gathering floor intended to continue past the blue outline across one of the three labeled steps? Identify that boundary and the intended approaches.'],
   215: ['Narrow stepped-floor candidate with overhead obstructions.', 'Does the intended occupiable floor continue into an adjoining platform? Indicate the shared edge if it does.'],
   2: ['Narrow lower-level floor with separated clear patches.', 'Is this a transition or part of a wider gathering platform? Mark the adjoining platform if it is continuous.']},
 'Void_Field.obj': {
   3: ['Predominantly open-to-sky top surface with multiple clear pieces.', 'Is this an accessible occupied deck? Identify its access point if so.'],
   0: ['Covered lower-level floor. Its seven-foot-clear footprint does not fit a ten-foot circle.', 'Is the curved surface a passage or part of an occupied gathering room beyond the outline?'],
   34: ['Provisional gathering-space candidate. Source geometry supports a continuous 372.25 ft² patch with at least seven feet of headroom and an 11.73 ft clear diameter. Access remains unresolved.', 'Review decision: retain R56 and R95 as potential connections. Neither is an approved entrance. Both are excluded from convergence and accessibility until a continuous approach is confirmed.']}
};
const reasons={
 'Linear.obj':'Both covered footprints pass the area and width checks. Their interior/gallery boundary and a traversable route between levels are unverified.',
 'Stepped.obj':'R70 has three local step crossings. None of the three selected clear footprints contains a ten-foot gathering circle. A larger continuous destination or an alternate boundary requires evidence.',
 'Void_Field.obj':'R34 passes the geometric area and width checks. Neither proposed approach has continuous support across the full tested strip. Occupied origins and access remain unresolved.'
};
const names={openVolume:'Open Volume',visuallyConnected:'Visually Connected',circulationActivated:'Circulation Activated',verticallyIntegrated:'Vertically Integrated',centralized:'Centralized'};
const byModel=models.map(m=>({geometryHash:m.geometryHash,regions:m.reviews.map(r=>({id:r.region,z:r.z,support:r.supportArea,clear:r.clear7Area,width:r.maxClearDiskDiameterFt,anchor:m.filename.split('.')[0]+'-R'+r.region,finding:decisions[m.filename][r.region][0]}))}));
fs.writeFileSync(path.join(root,'src/components/evaluations/v4/sourceReviewIndex.json'),JSON.stringify(byModel,null,2)+'\n');
const matrix=previous.map(m=>({filename:m.filename,sourceSha256:m.sourceSha256,geometryHash:m.geometryHash,unit:m.unit,up:m.up,includeTopDecks:m.topDecks,scores:Object.fromEntries(Object.entries(m.descriptors).map(([id,d])=>[id,id==='centralized'?{score:null,rank:null,version:d.version,reason:reasons[m.filename]}:d])),historicalGraphCentralized:m.descriptors.centralized.historicalScore}));
fs.writeFileSync(path.join(out,'comparison-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
const voidField=models.find(m=>m.filename==='Void_Field.obj');
const r34=voidField.reviews.find(r=>r.region===34);
const reviewDecision={
 filename:voidField.filename,geometryHash:voidField.geometryHash,sourceSha256:voidField.sourceSha256,
 region:r34.region,classification:'provisional gathering-space candidate',access:'unresolved',
 continuousClearAreaFt2:r34.largestClear7Piece,minimumHeadroomForThisAreaFt:7,
 clearPatchDiameterFt:r34.maxClearDiskDiameterFt,
 crossings:[56,95].map(id=>{
   const crossing=r34.routes.find(c=>c.other===id);
   return {to:id,state:'potential',verifiedApproach:false,countsForConvergence:false,countsForAccessibility:false,
     testedSegments:crossing.tested,passingLocalStrips:crossing.passing};
 }),destinationApproved:false,score:null
};
fs.writeFileSync(path.join(out,'architectural-decisions.json'),JSON.stringify([reviewDecision],null,2)+'\n');
const f=(n,d=1)=>n==null?'—':n.toFixed(d);
const img=(file,alt)=>'<a href="'+file+'"><img src="'+file+'" alt="'+alt+'"></a>';
function card(m,r){
 const id='R'+r.region,anchor=m.filename.split('.')[0]+'-'+id,prefix=m.filename+'-'+id;
 const points=r.minimumSamples[0],routes=r.routes.map(c=>{
   const reasons=[...new Set(c.examples.flatMap(x=>x.tests.filter(t=>!t.pass).map(t=>t.reason)))];
   const small=c.examples.flatMap(x=>x.tests).filter(t=>t.missingFt2>0).map(t=>t.missingFt2);
   return '<li><b>'+id+' ↔ R'+c.other+'</b> · '+c.passing+' of '+c.tested+' candidate segments have a passing local crossing. '+(c.passing?'Example endpoints in feet '+c.examplePath.map(p=>'('+p.map(v=>f(v,2)).join(', ')+')').join(' → ')+'. ':'')+(reasons.length?'Failed trials: '+reasons.join(', ')+'. ':'')+(small.length?'Smallest reported missing support among the whole-strip failures: '+f(Math.min(...small),4)+' ft².':'')+'</li>';
 }).join('');
 return '<article id="'+anchor+'"><h3>'+id+' · elevation '+f(r.z,2)+' ft</h3><p><strong>'+decisions[m.filename][r.region][0]+'</strong></p><div class="views">'+img(prefix+'-plan.svg','Source plan of '+id)+img(prefix+'-3D.svg','Isometric view of '+id)+'</div><dl>'+
 [['Sampled mask',f(r.cellArea,0)+' ft²'],['Source floor inside mask',f(r.supportArea,2)+' ft²'],['Plan span X × Y',r.spans.map(v=>f(v,2)).join(' × ')+' ft'],['Floor with ≥7 ft headroom',f(r.clear7Area,2)+' ft²'],['Largest continuous clear piece',f(r.largestClear7Piece,2)+' ft²'],['Largest clear circle diameter',f(r.maxClearDiskDiameterFt,2)+' ft'],['Floor below 7 ft',f(r.low7Area,2)+' ft²'],['Floor open to sky',f(r.uncoveredArea,2)+' ft²'],['Sampled covered headroom, min / median / max',[r.minClear,r.medianBoundedClear,r.maxBoundedClear].map(v=>f(v,2)).join(' / ')+' ft']].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>'+
 (points?'<p>The white ring locates a sampled minimum at ('+points.point.map(v=>f(v,2)).join(', ')+') ft. Overhead triangle '+points.overheadTriangle+' is '+f(r.minClear,2)+' ft above floor triangle '+points.floorTriangle+'.</p>':'<p>All one-foot sample centers are open to the sky. Small overhangs between sample centers are included in the area measurements.</p>')+
 '<h4>Crossings</h4>'+(routes?'<ul>'+routes+'</ul>':'<p>The existing reconstruction supplied no crossing at this location. Physical access remains unknown.</p>')+
 '<p class="decision"><b>Decision on this view</b> · '+decisions[m.filename][r.region][1]+'</p></article>';
}
const descriptions={
 'Linear.obj':'The 1,192 ft² count is the area of the original sample cells. Clipping their two masks to the actual floor faces gives 1,164.78 ft², of which 1,157.36 ft² has seven feet of headroom. Only 0.59 ft² has no modeled cover. Covered exterior lofts cannot be separated from interior floor by headroom alone. The entire coplanar component at R3 spans 855.86 ft², extending beyond the selected footprint. No sloping walkable face bridges the floors. Under the 0.8 ft maximum step rise, even the combined walkable elevations across the whole building have gaps: '+models[0].verticalGaps.map(a=>a.map(v=>f(v,2)).join('–')).join(', ')+' ft. An R10–R3 stair or ramp cannot be verified.',
 'Stepped.obj':'R70 has 10.51 ft² below 5.86 ft of headroom and 17.04 ft² below 7 ft. The 5.85 ft sampled minimum is localized. The source supports three short steps into neighboring regions. Their endpoint height changes are roughly 0.26, 0.18 and 0.77 ft. The tests establish local transitions. Independent approaches from occupied origins still need tracing.',
 'Void_Field.obj':'The earlier 387 ft² for R34 counted grid cells. Their intersection with the source floor is 375.17 ft². The largest continuous seven-foot-clear patch is 372.25 ft². Its 11.73 ft clear diameter makes R34 a geometric gathering candidate. Sub-cell floor gaps at the proposed approaches prevent confirming a continuous two-foot strip. Their small size warrants checking the intended joints.'};
const nav=models.map(m=>'<p>'+m.filename+' '+m.reviews.map(r=>'<a href="#'+m.filename.split('.')[0]+'-R'+r.region+'">R'+r.region+'</a>').join(' · ')+'</p>').join('');
const rows=matrix.map(m=>'<tr><th>'+m.filename+'</th>'+Object.keys(names).map(id=>'<td>'+(id==='centralized'?'Pending':f(m.scores[id].score)+' ('+m.scores[id].rank+'/3)')+'</td>').join('')+'</tr>').join('');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Centralized · source review</title><style>body{font:16px/1.5 system-ui;color:#1b303b;background:#f6f5f1;max-width:1160px;margin:auto;padding:2rem}h1,h2,h3,h4{line-height:1.15}h2{margin-top:3rem}article{border-top:2px solid #637d87;padding:1rem 0}a{color:#085a75}table{border-collapse:collapse;font-size:.92rem}th,td{padding:.5rem;text-align:left;border-bottom:1px solid #9aa7ab}.scroll{overflow:auto}.views{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:.5rem}.views img{width:100%;display:block}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem}dt{font-size:.85rem;color:#425865}dd{margin:0;font-weight:650}.decision{border-left:4px solid #aa740e;background:#f0e8d6;padding:.75rem}li{margin:.4rem 0}</style><main><h1>Centralized architectural review</h1><p>Feet · Z up · three original OBJ files · nine reviewed locations</p><div class="scroll"><table><thead><tr><th>Source</th>'+Object.values(names).map(n=>'<th>'+n+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div><p>Parentheses give rank among the three models. The historical graph method scored Stepped 6.13 and had insufficient evidence for Linear and Void_Field. The approved destination method weights Gathering Suitability 40%, Circulation Convergence 40% and Accessibility 20%. Its three results await architectural confirmation.</p>'+nav+
 '<h2>How to read the evidence</h2><p>Blue is source-supported floor within the original review boundary. Orange marks overhead geometry below seven feet. Violet marks open sky. A white ring locates one sampled minimum. Cyan traces a passing local crossing and amber marks an unresolved proposal. A gold destination and converging circulation become available after verification in the Evaluation tab.</p><p>Each floor footprint is the union of coplanar OBJ triangles clipped to the selected one-foot cells. The outlines can end at sampling boundaries inside a larger floor. Headroom areas use projected, height-clipped triangles. Reported minimum and median heights use covered sample centers. A circular fit inside the seven-foot-clear floor measures local width independently of the rectangular plan span. Thin vertical faces divide patches. Seven feet is the comparison band. The two-foot route strip checks continuous support, headroom and step rise with geometric and sampled tests. Four transverse offsets up to 0.4 ft allow for crossings off the sample centerline. Repeated crossings of the same boundary do not establish independent circulation branches. The OBJ files have one architecture object and no room, stair or occupancy labels.</p><p><a href="source-evidence.json">Source measurements, vertices and route trials</a> · <a href="comparison-matrix.json">Full-precision comparison matrix</a></p>'+
 models.map(m=>'<section><h2>'+m.filename+'</h2><p>'+descriptions[m.filename]+'</p>'+m.reviews.map(r=>card(m,r)).join('')+'</section>').join('')+'</main></html>';
fs.writeFileSync(path.join(out,'index.html'),html);
