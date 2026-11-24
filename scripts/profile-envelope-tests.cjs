const fs=require('fs'),assert=require('assert/strict');
require('../proof/rule-amphitheater.cjs');
const {populate}=require('../src/components/sourcePopulation.ts');
const {featurePoints,CURVE_ERROR_FEET}=require('./source-profile-envelope.cjs');
const {getLetterShape,getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const T=require('three');
function boundaryMetrics(mesh){
 let wallArea=0,axisArea=0,horizontalArea=0,minimumArea=Infinity;
 for(let i=0;i<mesh.indices.length;i+=3){
  const [a,b,c]=[0,1,2].map(k=>new T.Vector3().fromArray(mesh.positions,mesh.indices[i+k]*3));
  const n=b.sub(a).cross(c.sub(a)),area=n.length()/2;minimumArea=Math.min(minimumArea,area);n.normalize();
  if(Math.abs(n.z)<1e-6){wallArea+=area;if(Math.max(Math.abs(n.x),Math.abs(n.y))>1-1e-6)axisArea+=area;}
  if(Math.abs(n.z)>1-1e-6)horizontalArea+=area;
 }
 return {wallArea,axisArea,axisWallPercent:100*axisArea/wallArea,horizontalArea,minimumArea};
}
const field={width:40,depth:40,height:60},source=populate([],12,field,13,37);
assert(source.every(p=>p.rx===0&&p.ry===0&&[-15,0,15].includes(p.rz)));
const transitions=populate([],12,field,13,37,{transitions:true});assert(transitions.every(p=>p.rx===0&&p.ry===0&&[-30,-15,0,15,30].includes(p.rz)));
assert.deepEqual(populate(source,13,field,13,37).slice(0,12),source);
const shape=getLetterShape('U'),scale=13/.92,points=featurePoints(shape,scale);
let maximumError=0;
for(const curve of shape.curves)for(let k=0;k<=256;k++){
 const p=curve.getPoint(k/256);let nearest=Infinity;
 for(let j=1;j<points.length;j++){const a=points[j-1],e=points[j].clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(e)/(e.lengthSq()||1)));nearest=Math.min(nearest,p.distanceTo(a.clone().addScaledVector(e,t))*scale);}
 maximumError=Math.max(maximumError,nearest);
}
assert(maximumError<=CURVE_ERROR_FEET*1.02);
const rows=[];
for(const name of ['nine','twelve']){
 const dir='reports/standalone-profile/'+name,before=JSON.parse(fs.readFileSync(dir+'/before.json')),after=JSON.parse(fs.readFileSync(dir+'/after.json'));
 assert.deepEqual(after.letters,before.letters);assert.deepEqual(after.request.source,before.request.source);assert.deepEqual(after.request.field,before.request.field);
 assert.equal(after.request.preferredFeet,before.request.preferredFeet);
 assert.deepEqual(after.paths,before.paths);
 assert.equal(after.articulationReport.components,1);assert.equal(after.validation.selfIntersectionPairs,0);
 assert(after.contributions.every(c=>c.exposedArea>=1));
 const oldMetrics=boundaryMetrics(before.architecture),newMetrics=boundaryMetrics(after.architecture);
 assert(newMetrics.axisWallPercent<oldMetrics.axisWallPercent);assert(newMetrics.horizontalArea>0);
 assert(after.architecture.indices.length<before.architecture.indices.length);
 for(const pocket of after.articulationReport.operations.filter(o=>o.backed)){assert(pocket.ratio>=.15&&pocket.ratio<=.35);}
 rows.push({name,before:oldMetrics,after:newMetrics,cutCountBefore:before.articulationReport.operations.length,cutCountAfter:after.articulationReport.operations.length});
}
fs.writeFileSync('reports/standalone-profile/targeted-tests.json',JSON.stringify({passed:true,maximumCurveErrorFeet:maximumError,curveToleranceFeet:CURVE_ERROR_FEET,rows},null,2));
console.log('PASS exact source meshes / poses / fields, common-axis population and extension, analytic curves, retained relationship graph, source contributions, planar surfaces, pocket ratios and reduced axis-grid artifacts.');

