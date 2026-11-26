// Versioned domain specialization of the frozen authentic gallery engine.
// Frozen files are read and hash checked, never rewritten. Formation operations stay verbatim.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const {spawnSync}=require('node:child_process');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor/architectural-board');
const VERSION = 'linear-edge-gallery/authentic-polygon-domain-v1-proof';
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const area = ring => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - p[1] * q[0]; }, 0) / 2;
const rotate = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const relativeFiles = ['scripts/linear-gallery-automatic.cjs', 'src/components/linearGalleryPerimeter.ts', 'scripts/source-envelope.cjs', 'scripts/source-linear-gallery.cjs', 'scripts/linear-gallery-current-edges.cjs', 'scripts/linear-gallery-print.cjs', 'src/components/letterGeometry3d.ts'];
const frozen = {
 'scripts/linear-gallery-automatic.cjs':'44f03e0ac0425b8c4728165e8c4d63853b0e6849d5a3509192f48423cc63406e',
 'src/components/linearGalleryPerimeter.ts':'20f5be90b7e5179d4984259f64ea41db9addc79b203c8207d098ddd9eaf5a124',
 'scripts/source-envelope.cjs':'78c1df5575eb8d6d0ebc287aa18598d791c0b558cb8b9780538da67cafa0c695',
 'scripts/source-linear-gallery.cjs':'b366a94c970ddd797e055ecb43b55f538eed19444cfcebfa11199872b335faf5',
 'scripts/linear-gallery-current-edges.cjs':'60f51476e0c5e33744f96cafdc440e2ed91d74acc63983e067323b8cd3a39954',
 'scripts/linear-gallery-print.cjs':'0ca95098fe2fd7d6e55d934d6228eda91f293430803f0bfe4109fac8cd15c379',
 'src/components/letterGeometry3d.ts':'ade11f4e8cd6123ed9c63a0e17629f09988c2685fd13dd9b5b9d86115a0f5b47'
};
function authenticate() {
 return relativeFiles.map(file => {const actual=hash(fs.readFileSync(path.join(VENDOR,file))); assert.equal(actual,frozen[file],file); return {file,sha256:actual};});
}
function frames(vertices) {
 return vertices.map((p,i) => {const q=vertices[(i+1)%vertices.length],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);return {tangent:[dx/length,dy/length],normal:[dy/length,-dx/length],length};});
}
function nativeGlyphOnSide(glyph, letter, side, size, variant, domain) {
 // Rigid yaw only. Native scale, mesh, exterior curve and span are retained.
 const g=glyph(letter,0,size,variant),t=frames(domain.lower)[side].tangent,a=Math.atan2(t[1],t[0]);
 return {...g,angle:g.angle+a,outline:g.outline.map(p=>rotate(p,a))};
}
function specialize(domain, trace = []) {
 authenticate(); require(path.join(VENDOR,'proof/rule-amphitheater.cjs'));
 const changes=[],cache=new Map();
 // The site's upper gallery retains the checkpoint's compact four-sided, rotated terrace.
 const polygonSite = domain.nativeUpper === true;
 let band = 'lower';
 const cacheGlyph = new Map();
 const hooks={
  glyph:(g,letter,side,size,variant)=>{
   const key=[band,letter,side,size,variant].join('/');
   if(!cacheGlyph.has(key)) cacheGlyph.set(key, polygonSite && band==='upper'
    ? g(letter,side,size,variant)
    : nativeGlyphOnSide(g,letter,side % domain.lower.length,size,variant,domain));
   return cacheGlyph.get(key);
  },
  frames:()=>frames(domain.lower),
  usable:(length,i)=>band==='upper'?length:length-(domain.cornerMargins?.[i]??domain.cornerClearanceFeet)-(domain.cornerMargins?.[(i+1)%domain.lower.length]??domain.cornerClearanceFeet),
  region:zone=>{band=zone;const vertices=domain[zone];return {vertices,lengths:frames(vertices).map(f=>f.length)};},
  starts:(region,lengths,cornerBack)=>region.vertices.map((p,i)=>{
   const occupied=lengths[i]-(cornerBack.to-cornerBack.from);
   const start=domain.cornerMargins?.[i]??domain.cornerClearanceFeet, end=domain.cornerMargins?.[(i+1)%region.vertices.length]??domain.cornerClearanceFeet;
   const available=region.lengths[i]-start-end;
   assert(occupied<=available+1e-7,'NATIVE_POPULATION_CAPACITY: edge '+i+' needs '+occupied+' ft, available '+available);
   const offset=start+(available-occupied)/2,t=frames(region.vertices)[i].tangent;
   return [p[0]+offset*t[0],p[1]+offset*t[1]];
  }),
  area,
  trace:(operation,data)=>trace.push({operation,...data})
 };
 function load(rel) {
  if(cache.has(rel))return cache.get(rel).exports;
  const filename=path.join(VENDOR,rel);let source=fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n');
  function patch(from,to,reason) {assert.equal(source.split(from).length-1,1,'Patch identity: '+rel+' '+reason);changes.push({file:rel,reason,from,to});source=source.replace(from,to);}
  if(rel==='scripts/linear-gallery-automatic.cjs') {
   patch("const {glyph}=require('../src/components/linearGalleryPerimeter.ts');", "const {glyph:nativeGlyph}=require('../src/components/linearGalleryPerimeter.ts');\nconst hooks=require('polygon-domain-hooks');const glyph=(...args)=>hooks.glyph(nativeGlyph,...args);", 'rigid native glyph orientation to actual edge');
   patch('previous=[[],[],[],[]]', 'previous=hooks.frames().map(()=>[])', 'N-edge running-bond history');
   patch('const tangents=[[1,0],[0,1],[-1,0],[0,-1]],normals=[[0,-1],[1,0],[0,1],[-1,0]];', 'const tangents=hooks.frames().map(f=>f.tangent),normals=hooks.frames().map(f=>f.normal);', 'polygon edge frames');
   const begin=source.indexOf(' const limit='),end=source.indexOf(" for(const zone of ['lower','upper'])",begin);
   patch(source.slice(begin,end),'', 'remove rectangular capacity and projecting-width budget');
   patch('const cornerSize=level%2?cornerLimit:4,other=10-cornerSize;', `const region=hooks.region(zone),limit=region.lengths,small=Math.min(...limit)<25,cornerLimit=small?4:6;
 const baseWidth=small?span(glyph('L',0,4,0))+span(glyph('L',0,4,1))+span(glyph('V',0,5,0)):span(glyph('L',0,10,0))+span(glyph('L',0,10,1))+span(glyph('V',0,5,0));
 const cornerSize=level%2?cornerLimit:4,other=10-cornerSize;`, 'capacity from each lower/upper polygon course');
   patch('const available=limit[side%2]-(side%2?0:shift);','const available=limit[side]-2*'+domain.cornerClearanceFeet+';', 'actual edge usable length');
   patch('side%2||limit[0]>45','side%2||available>45','native fill test uses current edge');
   patch('const [width,height]=lengths,x=-width/2,y=-height/2;\n const vertices=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];', 'const vertices=hooks.starts(region,lengths,cornerBack);', 'place native letter runs on polygon-derived interior course');
   patch('side<4','side<tangents.length','N-side placement');
   patch("...(j===0?{secondSide:(side+3)%4,secondCurve:5}:{})", "...{}", 'open corner interface: no false perpendicular second receiver at oblique corner');
   patch('layers.push({...ref,vertices,lengths,count,capacity:count,perimeter:2*(width+height),occupiedEdgeFeet:2*(width+height),achieved:width*height,target:width*height,edgesForFullPerimeter:count+4});', 'layers.push({...ref,vertices:region.vertices,lengths,count,capacity:count,perimeter:region.lengths.reduce((a,b)=>a+b,0),occupiedEdgeFeet:lengths.reduce((a,b)=>a+b,0),achieved:hooks.area(region.vertices),target:hooks.area(region.vertices),edgesForFullPerimeter:count});', 'polygon layer topology and areas');
   if(polygonSite) {
    patch('small=Math.min(...limit)<25', 'small=Math.min(...limit.map(hooks.usable))<25', 'size native corner populations for the usable edge');
    patch('const available=limit[side]-2*'+domain.cornerClearanceFeet+';', 'const available=hooks.usable(limit[side],side);', 'angular corner clearances');
    patch('at+=span(g);previous[side]', "at+=span(g)+(zone==='lower'?1/8192:0);previous[side]", 'one native grid unit between oblique coplanar source ends');
    patch('const sides=tangents.map((t,side)=>{', "const courseTangents=zone==='upper'?[[1,0],[0,1],[-1,0],[0,-1]]:tangents,courseNormals=courseTangents.map(t=>[t[1],-t[0]]);\n const sides=courseTangents.map((t,side)=>{", 'compact upper gallery keeps its native orthogonal receiving edges');
    patch('previous=hooks.frames().map(()=>[])', 'previous=Array.from({length:Math.max(4,hooks.frames().length)},()=>[])', 'reserve running bond history for both footprints');
    patch('const vertices=hooks.starts(region,lengths,cornerBack);', "const [w,h]=lengths;const vertices=zone==='upper'?[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]:hooks.starts(region,lengths,cornerBack);", 'native upper corner locations about the terrace center');
    patch('side<tangents.length', 'side<courseTangents.length', 'traverse the current footprint');
    patch('t=tangents[side],n=normals[side]', 't=courseTangents[side],n=courseNormals[side]', 'use the frame of the current course');
    patch('...{}', "...(zone==='upper'&&j===0?{secondSide:(side+3)%4,secondCurve:5}:{})", 'preserve native upper corner second receivers');
    patch('vertices:region.vertices,lengths,count', "vertices:zone==='upper'?vertices:region.vertices,lengths,count", 'store the actual upper footprint');
   }
   patch('const count=source.length-before;', "const count=source.length-before;hooks.trace('arrangeMixed-course',{level,zone,count,vertices:region.vertices});", 'trace actual original course execution');
  }
  if(rel==='scripts/linear-gallery-current-edges.cjs') {
   patch('const sides=[0,1,2,3].map(side=>', 'const sides=reference.vertices.map((_,side)=>','N-edge actual-source relationship reconstruction');
   patch('reference.vertices[(side+1)%4]','reference.vertices[(side+1)%reference.vertices.length]','N-edge fallback');
   patch('sides[(i+3)%4]','sides[(i+sides.length-1)%sides.length]','previous side topology');
   patch('vertices[(i+1)%4]','vertices[(i+1)%vertices.length]','polygon area');
   patch('for(const side of [0,1,2,3])','for(const side of layer.vertices.map((_,i)=>i))','N-side empty intervals');
  }
  if(rel==='scripts/linear-gallery-print.cjs') {
   if(polygonSite) {
    patch('p.tangent.map((v,i)=>snap(a*v+d*p.normal[i]))','p.tangent.map((v,i)=>a*v+d*p.normal[i])', 'apply the native grid in the receiver frame so oblique wall faces stay collinear');
   }
   patch('const rows=layers.map(l=>[0,1,2,3].map(side=>','const rows=layers.map(l=>l.vertices.map((_,side)=>','N-side source-derived formation rows');
   patch('side<4','side<rows[first.level].length','N-side wall and contour traversal');
   patch("const id=kind+'-'+(parts.length+1),sources=[p.sourceId,q.sourceId];", "const id=kind+'-'+(parts.length+1),sources=[p.sourceId,q.sourceId];require('polygon-domain-hooks').trace('buildGallery-add',{kind,bottom,top,sources,level:p.level,receiverLevel:q.level});", 'trace unchanged formation operations');
  }
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(rel,mod);
  const originalRequire=mod.require.bind(mod);
  mod.require=id=>{if(id==='polygon-domain-hooks')return hooks;const target=path.resolve(path.dirname(filename),id);const local=path.relative(VENDOR,target).replace(/\\/g,'/');if(['scripts/source-linear-gallery.cjs','scripts/linear-gallery-print.cjs','scripts/linear-gallery-current-edges.cjs','scripts/linear-gallery-automatic.cjs'].includes(local))return load(local);return originalRequire(id);};
  mod._compile(source,filename);return mod.exports;
 }
 return {arrangeMixed:load('scripts/linear-gallery-automatic.cjs').arrangeMixed,buildGallery:load('scripts/source-linear-gallery.cjs').buildGallery,changes};
}
async function prepareDomain(input, wasm) {
 assert(Number.isSafeInteger(input.seed)&&input.seed>=0&&input.seed<=4294967295);assert(Number.isSafeInteger(input.rotationSeed)&&input.rotationSeed>=0&&input.rotationSeed<=4294967295);assert([12,13,14,15].includes(input.spacing));
 for(const n of Object.values(input.distribution).filter(x=>typeof x!=='string'))assert(Number.isFinite(n)&&n>=0,'Finite nonnegative distribution parameter required');
 assert.equal(input.site.coordinates.unitAssumption,'confirmed');assert.equal(input.site.coordinates.feetPerModel,1);
 assert.equal(input.site.coordinates.unit,'feet');assert(input.site.protectionMetadataComplete);
 const {planSiteRules}=require('./site-rule-contract.cjs');
 const policy=await planSiteRules({site:input.site,zoneId:input.zoneId,allocationPercent:input.allocationPercent,heightRegions:input.heightRecord.regions,heightSource:input.heightRecord.source,territory:input.territory});
 assert.equal(policy.status,'site-rules-ready',policy.blockers.join('; '));
 assert.equal(policy.siteRules.regions.length,1,'MULTI_HEIGHT_REGION: controlled proof supports a single explicit test envelope only');
 const region=policy.siteRules.regions[0];assert([20,40,60].includes(region.heightFeet));
 const CS=wasm.CrossSection,permitted=new CS(policy.siteRules.domain),development=permitted.offset(-input.distribution.lowerInsetFeet,'Miter');
 const lower=development.toPolygons();assert.equal(lower.length,1,'DISCONNECTED_OR_HOLED_COURSE_UNSUPPORTED');assert(lower[0].length>=5,'Irregular proof needs >=5 sides');
 const upper=permitted.offset(-input.distribution.upperInsetFeet,'Miter').toPolygons();assert.equal(upper.length,1);assert.equal(upper[0].length,lower[0].length,'OFFSET_TOPOLOGY_CHANGE');
 const orient=r=>area(r)<0?r.slice().reverse():r;
 const domain={lower:orient(lower[0]),upper:orient(upper[0]),cornerClearanceFeet:input.distribution.cornerClearanceFeet};
 for(const ring of [domain.lower,domain.upper])assert(ring.every((p,i)=>{const q=ring[(i+1)%ring.length],r=ring[(i+2)%ring.length];return (q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0])>1e-8;}),'CONCAVE_COURSE_UNSUPPORTED');
 return {policy,domain,height:region.heightFeet,permitted};
}
async function runAdapter(input,out) {
 assert(!fs.existsSync(out),'Immutable proof directory already exists: '+out);
 const original=hash(input),bindings=authenticate(),wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
 const {policy,domain,height,permitted}=await prepareDomain(input,wasm);
 const trace=[],engine=specialize(domain,trace),evidence=require('../src/components/polygonExperiment/registry-data.json').items[0].evidence.find(e=>e.variant==='print-contour');
 const request=structuredClone(evidence.request),all=input.site.zones.find(z=>z.id===input.zoneId).polygon;
 // Axis-aligned broad-phase box only; never a placement or coverage target.
 request.field={width:2*Math.max(...all.map(p=>Math.abs(p[0])))+2,depth:2*Math.max(...all.map(p=>Math.abs(p[1])))+2,height};
 request.source=[];request.linearGallery.seed=input.seed;request.linearGallery.nominalSpacing=input.spacing;
 request.sourceSnapshot={rotationSeed:input.rotationSeed};
 await engine.arrangeMixed(request);
 const derive=require(path.join(VENDOR,'scripts/source-envelope.cjs')).derive;
 const nativeA=derive(request).letters,requestBefore=hash(request),aHash=hash(nativeA);
 function project(mesh){const triangles=[];for(let i=0;i<mesh.indices.length;i+=3){const t=mesh.indices.slice(i,i+3).map(k=>mesh.positions.slice(3*k,3*k+2));if(Math.abs(area(t))>1e-10)triangles.push(area(t)<0?t.reverse():t);}return new wasm.CrossSection(triangles,'NonZero');}
 for(const l of nativeA)assert(project(l.mesh).subtract(permitted).area()<1e-6,'SOURCE_OUTSIDE_POLYGON '+l.id);
 const b=await engine.buildGallery(request,path.join(out,'native'));
 assert.equal(hash(request),requestBefore);assert.equal(hash(b.letters),aHash);assert.equal(hash(input),original);
 const projected=project(b.architecture),outside=projected.subtract(permitted).area();assert(outside<1e-6,'ARCHITECTURE_OUTSIDE_POLYGON '+outside);
 const sourceProjection=wasm.CrossSection.union(nativeA.map(l=>project(l.mesh)));
 const inner=permitted.offset(-input.distribution.interiorEvidenceInsetFeet,'Miter');
 const byKind={};for(const s of b.galleryReport.surfaces)byKind[s.kind]=(byKind[s.kind]||0)+1;
 for(const kind of ['base-wall','wall','connection','daylight-return','contour-floor','roof-plank','edge-column'])assert(byKind[kind]>0,'MISSING_AUTHENTIC_OPERATION '+kind);
 const floors=b.galleryReport.surfaces.filter(s=>s.kind==='contour-floor').map(s=>{const c=b.components.find(c=>c.id===s.id);return {id:s.id,zone:s.zone,areaFeet2:project(c.mesh).area()};});
 const maxHeight=Math.max(...b.architecture.positions.filter((_,i)=>i%3===2));assert(maxHeight<=height+1e-6);
 const exportCheck=spawnSync(process.execPath,[path.join(VENDOR,'proof/rule-validation.cjs'),path.join(out,'native')],{encoding:'utf8',maxBuffer:4000000});
 fs.writeFileSync(path.join(out,'native-export-check.log'),exportCheck.stdout+'\n'+exportCheck.stderr);
 const exportValidation=JSON.parse(fs.readFileSync(path.join(out,'native','validation.json'),'utf8'));
 const result={version:VERSION,input,policy,domain,request,letters:nativeA,architecture:b.architecture,components:b.components,galleryReport:b.galleryReport,bindings,adapterChanges:engine.changes,operationTrace:trace,
  provenance:{originalInputHash:original,sourceMeshHash:aHash,requestHash:requestBefore,architectureHash:hash(b.architecture),sourceFilesUnmodified:true,adapterHash:hash(fs.readFileSync(__filename)),method:'hash-locked in-memory domain specialization of arrangeMixed, relationships and buildGallery; native dispatcher, glyph and derive unchanged',heightAuthority:input.heightRecord,notMiamiClassification:true},
  validation:{passed:exportCheck.status===0,nativeFormationPassed:true,exportValidation,outsideAreaFeet2:outside,heightFeet:maxHeight,heightEnvelopeFeet:height,solidComponents:b.galleryReport.solidComponents,inputUnchanged:true,ruleAUnchangedByB:true,sourceMeshHashMatches:true},
  measurements:{polygonAreaFeet2:permitted.area(),projectedArchitecturalAreaFeet2:projected.area(),projectedArchitecturalCoveragePercent:100*projected.area()/permitted.area(),sourceLetterAreaFeet2:sourceProjection.area(),letters:nativeA.length,counts:Object.fromEntries(['L','U','V'].map(l=>[l,request.source.filter(p=>p.letter===l).length])),architecturalComponents:b.components.length,byKind,floors,sourceAreaInInteriorFeet2:sourceProjection.intersect(inner).area(),architectureAreaInInteriorFeet2:projected.intersect(inner).area(),interiorInsetFeet:input.distribution.interiorEvidenceInsetFeet,unusedAreaFeet2:permitted.area()-projected.area()},
  limitations:['Controlled irregular fixture; not full Miami generation.','At oblique corners, native letter runs terminate with open interfaces; no fabricated second perpendicular arm or new corner-closure wall.','Convex, single-loop same-topology offsets only; holes, split courses, cross-tier architecture and corner closure remain unresolved.','Original axis-based terrace-threshold search remains active and may reject other polygons.','Original upper binary-grid rotation and snap tolerances remain; no structural or accessibility certification.']};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result));return result;
}
module.exports={runAdapter,specialize,authenticate,hash,VERSION};
