const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'rule-review');
require('../scripts/ts-test-register.cjs');
const THREE=require('three');
const {getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
function read(file){
 const p=[],ix=[];
 for(const raw of fs.readFileSync(path.join(root,file),'utf8').split(String.fromCharCode(10))){
  const line=raw.trim();if(line.startsWith('v '))p.push(...line.slice(2).split(' ').map(Number));if(line.startsWith('f '))ix.push(...line.slice(2).split(' ').map(v=>+v-1));
 }
 return {p,ix};
}
function inside(point,polygons){
 let result=false;
 for(const polygon of polygons){
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
   const a=polygon[i],b=polygon[j];
   if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
 }
 return result;
}
(async()=>{
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const solid=file=>{const m=read(file);return new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(m.p),triVerts:new Uint32Array(m.ix)}));};
 const final=solid('combined-envelope.obj'),named=new Map(manifest.components.map(c=>[c.id,solid(c.file)]));
 const sourceObjects=fs.readFileSync(path.join(root,'source-instances.obj'),'utf8').split(String.fromCharCode(10)).filter(s=>s.startsWith('o ')).map(s=>s.slice(2));
 assert.deepEqual(sourceObjects,manifest.instances.map(i=>i.id));
 const sourceGeometryChecks=manifest.instances.map(item=>{
  const original=manifest.dimensionInputs[item.sourceIndex];
  assert.deepEqual(item.source,original.source);
  const g=getLetterVolumeGeometry(item.source.letter,12).clone();
  g.scale(original.scale*item.source.scaleX,original.scale*item.source.scaleY,original.scale*item.source.scaleZ);
  g.rotateX(item.tilt*Math.PI/180);g.rotateZ(item.yaw*Math.PI/180);g.translate(...item.center);g.computeBoundingBox();
  const actual={min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()};
  const error=Math.max(...['min','max'].flatMap(k=>actual[k].map((v,i)=>Math.abs(v-item.bounds[k][i]))));
  assert(error<3e-5,'Source geometry transform mismatch: '+item.id);g.dispose();
  return {id:item.id,sourceIndex:item.sourceIndex,transformedBoundsError:error};
 });
 const terraces=manifest.organization.terraces;
 assert(terraces.length>=2);
 assert(terraces.slice(1).every((t,i)=>t.elevation>terraces[i].elevation));
 const anchors=manifest.instances.filter(t=>t.source.letter==='L').map(t=>t.corner);
 const anchorDisplacements=anchors.slice(1).map((t,i)=>Math.hypot(t[0]-anchors[i][0],t[1]-anchors[i][1]));
 assert(anchorDisplacements.every(d=>Math.abs(d-manifest.study.displacement)<1e-8));
 const spacing=terraces.slice(1).map((t,i)=>Math.hypot(t.front[12][0]-terraces[i].front[12][0],t.front[12][1]-terraces[i].front[12][1]));
 const risers=manifest.components.filter(c=>c.kind==='angular-transition').map(c=>{
  const i=+c.id.split('-')[1],s=named.get(c.id);
  return {id:c.id,contacts:[s.intersect(named.get('terrace-'+(i-1))).volume(),s.intersect(named.get('terrace-'+i)).volume()]};
 });
 assert(risers.every(r=>r.contacts.every(v=>v>1e-8)));
 const backing=manifest.tools.filter(t=>t.backingThickness!==undefined).map(t=>{
  const center=t.center;
  const normal=t.normal;
  const probe=center.map((v,i)=>v-normal[i]*(t.depth+t.backingThickness)/2);
  const slice=final.slice(probe[2]);const retained=inside(probe,slice.toPolygons());slice.delete();
  return {id:t.id,nominalBacking:t.backingThickness,probe,backingMaterialAtProbe:retained};
 });
 assert(backing.every(t=>t.backingMaterialAtProbe),'Recess backing missing');
 const contributors=manifest.instances.map(i=>({id:i.id,components:manifest.components.filter(c=>c.sources.includes(i.id)).map(c=>c.id)}));
 assert(contributors.every(c=>c.components.length));
 const result={sourceGeometryChecks,independentSourceObjectIDs:sourceObjects,ascendingTerraces:terraces.length,logicalElevations:terraces.map(t=>t.elevation),sourceAnchorDisplacements:anchorDisplacements,horizontalDisplacements:spacing,nominalMinorRise:manifest.study.minorRise,risers,backing,constructionContributors:contributors,majorLevelSpacingIsSeparate:manifest.study.majorLevelSpacing,sourceObjects:manifest.instances.length};
 fs.writeFileSync(path.join(root,'architectural-geometry-checks.json'),JSON.stringify(result,null,2));
 console.log({terraces:terraces.length,displacementRange:[Math.min(...spacing),Math.max(...spacing)],risersWithBothContacts:risers.filter(r=>r.contacts.every(v=>v>0)).length,backingProbes:backing});
})().catch(e=>{console.error(e);process.exitCode=1});





