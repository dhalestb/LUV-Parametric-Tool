// Isolated additive adaptation. Frozen Print-Contour code and all saved sources remain unchanged.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const ROOT=path.resolve(__dirname,'..'),V=path.join(ROOT,'vendor/architectural-board');
const {authenticate,hash}=require('./authentic-polygon-domain.cjs');
const {geometry}=require('./independent-field-gallery.cjs');
const VERSION='linear-edge-gallery/height-aware-perimeter-v1';
const REVISION='authentic-height-bands-1';
const AREA_EPS=1e-6,VOLUME_EPS=1e-7,THICK=.53125;
const vertices=m=>Array.from({length:m.positions.length/3},(_,i)=>m.positions.slice(i*3,i*3+3));
const area=r=>r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-p[1]*q[0]},0)/2;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
function rigid(mesh,p,inverse=false){if(!p)return mesh;const angle=(inverse?-1:1)*p.headingDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return {positions:vertices(mesh).flatMap(([x,y,z])=>{if(inverse){x-=p.center[0];y-=p.center[1];}return [c*x-s*y+(inverse?0:p.center[0]),s*x+c*y+(inverse?0:p.center[1]),z]}),indices:mesh.indices.slice()};}
function immutableWrite(file,data){fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data),{flag:'wx'});}
function obj(m){return vertices(m).map(v=>'v '+v.join(' ')).concat(Array.from({length:m.indices.length/3},(_,i)=>'f '+m.indices.slice(i*3,i*3+3).map(n=>n+1).join(' '))).join('\n');}

// This instruments only records: the original expressions that make geometry are unchanged.
async function traceNative(saved,out){
 const bindings=authenticate(),file=path.join(V,'scripts/linear-gallery-print.cjs'),raw=fs.readFileSync(file),sourceBefore=hash(raw);
 let source=raw.toString('utf8').replace(/\r\n/g,'\n');const additions=[],air=[],passages=[],patches=[];
 const hooks={added:x=>additions.push(structuredClone(x)),air:x=>air.push(structuredClone(x)),passages:(meshes,matrix)=>passages.push({meshes,matrix})};
 function instrument(from,to,reason){assert.equal(source.split(from).length-1,1,'Frozen trace anchor: '+reason);source=source.replace(from,to);patches.push({reason,from,to});}
 instrument("const {derive}=require('./source-envelope.cjs');","const {derive}=require('./source-envelope.cjs');\nconst hooks=require('height-perimeter-trace-hooks');",'read-only event observer');
 const record='surfaces.push({id,kind,sources,bottom,top,zone:p.zone});';
 instrument(record,record+'hooks.added({id,kind,plan:plan.toPolygons(),bottom,top,p,q});','exact generating p/q and panel before native passage cuts');
 const decision='if(sill>prior+.5&&crest>sill+.25){lo=sill;hi=crest;}else{lo=prior;hi=(prior+crest)/2;}';
 instrument(decision,decision+"hooks.air({kind:'height-dependent-partial-return',p,q,plan:panel(p,a,a+thick,q.d-thick,p.d).toPolygons(),bottom:lo>prior?prior:hi,top:lo>prior?lo:crest});",'native partial-return intended air interval');
 instrument('if(rank===0&&band.length>1){',"if(rank===0&&band.length>1){hooks.air({kind:'return-open-lift',p,q,plan:web.toPolygons(),bottom:hi,top:roof});",'native open lift; final existing solid will be subtracted');
 instrument('const lower=[],rotated=[];',"hooks.passages(passages.map(cut=>pack(cut.transform(matrix))),matrix);\n  const lower=[],rotated=[];",'exact selected terrace cuts and native binary rotation');
 require(path.join(V,'proof/rule-amphitheater.cjs'));
 const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));const nativeRequire=mod.require.bind(mod);mod.require=id=>id==='height-perimeter-trace-hooks'?hooks:nativeRequire(id);mod._compile(source,file);
 const request=structuredClone(saved.request),requestHash=hash(request),b=await mod.exports.buildGallery(request,out);
 assert.equal(hash(request),requestHash);assert.equal(hash(b.letters),saved.provenance.nativeSourceMeshHash);assert.equal(hash(b.architecture),saved.provenance.nativeArchitectureHash);
 assert.equal(hash(fs.readFileSync(file)),sourceBefore);
 return {b,trace:{version:1,bindings,originalRuleHash:sourceBefore,requestHash,patches,additions,air,passages,nativeArchitectureHash:hash(b.architecture),nativeLettersHash:hash(b.letters)}};
}

// Extract the exact native panel helper; no copied substitute polygon-wall routine.
function nativePanelFactory(w,request){
 const source=fs.readFileSync(path.join(V,'scripts/linear-gallery-print.cjs'),'utf8').replace(/\r\n/g,'\n');
 const from=source.indexOf(' const point=(p,a,d)=>'),to=source.indexOf(" for(const zone of ['lower','upper'])",from),helper=source.slice(from,to);
 assert(helper.includes('const panel=')&&helper.includes('snap('));const grid=request.sourceSnapshot?.terraceRotation?128:8192,snap=x=>Math.round(x*grid)/grid;
 const panel=new Function('CS','snap',helper+'\nreturn panel;')(w.CrossSection,snap);
 const addFrom=source.indexOf(' function add(kind,plan,bottom,top,p,q){'),addTo=source.indexOf(' const rows=',addFrom),addSource=source.slice(addFrom,addTo);
 assert(addSource.includes('plan.extrude(top-bottom).translate([0,0,bottom])'));
 const extrude=new Function('snap','assert','pack','const parts=[],surfaces=[],components=[];\n'+addSource+'\nreturn (plan,bottom,top,p)=>{add("height-aware-downwall",plan,bottom,top,p,p);return parts.pop();};')(snap,assert,pack);
 return {panel,extrude,snap,helperHash:hash(helper),extrudeHelperHash:hash(addSource),grid};
}


// Native rules use local z=0 and H/2; world elevations are explicit datum translations.
function heightBands(heightFeet, buildingBaseFeet){
 assert(Number.isFinite(heightFeet)&&heightFeet>0,'Configured height must be positive.');
 assert(Number.isFinite(buildingBaseFeet),'Verified building base elevation is required.');
 return {heightFeet,buildingBaseFeet,midpointFeet:buildingBaseFeet+heightFeet/2,
  lower:{bottom:buildingBaseFeet,top:buildingBaseFeet+heightFeet/2},
  upper:{bottom:buildingBaseFeet+heightFeet/2,top:buildingBaseFeet+heightFeet}};
}
function bandDecision(heightFeet, buildingBaseFeet, zone, localWallBottomFeet){
 const bands=heightBands(heightFeet,buildingBaseFeet);assert(zone==='lower'||zone==='upper','Unknown native band.');
 assert(Number.isFinite(localWallBottomFeet),'Native wall bottom is required.');
 const band=bands[zone],wallBottom=buildingBaseFeet+localWallBottomFeet;
 assert(wallBottom>=band.bottom-AREA_EPS&&wallBottom<=band.top+AREA_EPS,'Saved wall violates assigned height band.');
 return {bands,zone,worldWallBottomFeet:wallBottom,minimumWallBottomFeet:band.bottom,
  eligible:false,classification:Math.abs(wallBottom-band.bottom)<=AREA_EPS?'complete-to-authentic-band-base':'native-source-relationship-required',
  reasons:[Math.abs(wallBottom-band.bottom)<=AREA_EPS?'Native wall already reaches its assigned band base; projection beyond the lower enclosure does not authorize crossing the midpoint.':'A missing in-band span requires an authentic source/receiver relationship; projected ownership alone cannot authorize infill.']};
}

async function analyze(saved,ledger,groundReference,traceBundle,policy){
 assert.equal(policy.version,1);assert.equal(policy.buildingBaseFeet,0,'This controlled fixture adapter requires its explicit verified native base datum.');
 assert.equal(policy.scope,'controlled-fixture');assert(saved.input.site.zones.find(z=>z.id===saved.input.zoneId)?.id==='irregular-proof','Miami/full-site is not enabled');
 assert.equal(saved.input.site.coordinates.feetPerModel,1);assert.equal(saved.input.site.coordinates.unitAssumption,'confirmed');
 const ledgerInputHash=hash(fs.readFileSync(ledger.inputPath));
 assert.equal(ledger.inputSha256,ledgerInputHash,'Ledger input changed');
 assert.equal(hash(saved),hash(JSON.parse(fs.readFileSync(ledger.inputPath))),'Saved fixture differs from authoritative ledger input');
 authenticate();
 assert.equal(hash(traceBundle.b.letters),saved.provenance.nativeSourceMeshHash,'Cached native sources changed');
 assert.equal(hash(traceBundle.b.architecture),saved.provenance.nativeArchitectureHash,'Cached native architecture changed');
 assert.equal(groundReference.case,'rectangular-field');
 const w=await require('manifold-3d/manifold.js').default();w.setup();const g=geometry(w),CS=w.CrossSection,M=w.Manifold,{panel,extrude,snap,helperHash,extrudeHelperHash,grid}=nativePanelFactory(w,saved.request);
 const b=traceBundle.b,trace=traceBundle.trace,whole=g.body(b.architecture),cm=new Map(b.components.map(c=>[c.id,c])),events=new Map(trace.additions.map(x=>[x.id,x]));
 const matrix=trace.passages[0]?.matrix??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const rotateBody=(body,zone)=>zone==='upper'?body.transform(matrix):body;
 const transformedPlan=(plan,zone)=>rotateBody(plan.extrude(.01),zone).slice(.005);
 const worldPlacement=saved.input.organizingField.placement;
 const nativeTerritory=saved.input.territory.polygon.map(([x,y])=>{const p=rigid({positions:[x,y,0],indices:[]},worldPlacement,true).positions;return p.slice(0,2)}),territory=new CS([nativeTerritory]);
 const surfaceMap=new Map(b.galleryReport.surfaces.map(s=>[s.id,s]));
 const wallKinds=new Set(['base-wall','wall','roof-wall','edge-column','daylight-return','plank-return']);
 const wallBodies=b.components.filter(c=>wallKinds.has(surfaceMap.get(c.id)?.kind)).map(c=>g.body(c.mesh)),walls=M.union(wallBodies),ground=walls.slice(.75),groundEnclosure=new CS(ground.toPolygons().filter(p=>area(p)>0));
 const upperFloorEvent=trace.additions.find(e=>e.kind==='contour-floor'&&e.p.zone==='upper');assert(upperFloorEvent);
 const upperEnclosure=transformedPlan(new CS(upperFloorEvent.plan), 'upper');
 const combinedEnclosure=groundEnclosure.add(upperEnclosure);
 const letters=M.union(b.letters.map(l=>g.body(l.mesh)));
 const protection=[];
 function protect(id,kind,body,provenance){const air=body.subtract(whole);if(air.isEmpty()||air.volume()<=VOLUME_EPS)return;protection.push({id,kind,body:air,baselineAirVolumeFeet3:air.volume(),provenance});}
 for(const [i,a]of trace.air.entries()){if(a.top<=a.bottom)continue;protect('native-air-'+i,a.kind,rotateBody(new CS(a.plan).extrude(a.top-a.bottom).translate([0,0,a.bottom]),a.p.zone),{sourceIds:[a.p.sourceId,a.q.sourceId],sourceEdges:[a.p.curveIndex,a.q.curveIndex],zone:a.p.zone,bottom:a.bottom,top:a.top});}
 for(const a of trace.additions.filter(e=>['base-wall','wall','roof-wall','edge-column'].includes(e.kind)&&e.p.setback>0)){
  const p=a.p,t=p.tangent,pts=a.plan.flat(),lo=Math.min(...pts.map(v=>dot(v,t))),hi=Math.max(...pts.map(v=>dot(v,t))),nativeAir=panel(p,lo,hi,p.d,p.d+p.setback);
  protect('recess-'+a.id,'native-recess-air',rotateBody(nativeAir.extrude(a.top-a.bottom).translate([0,0,a.bottom]),p.zone),{sourceId:p.sourceId,curveIndex:p.curveIndex,setbackFeet:p.setback,wallId:a.id,bottom:a.bottom,top:a.top});
 }
 for(const [i,p]of trace.passages.flatMap(p=>p.meshes).entries()){const body=g.body(p);assert(body.intersect(whole).volume()<1e-6,'Native terrace passage is not clear');protect('terrace-passage-'+i,'terrace-passage',body,{originalRule:'linear-gallery-print.cjs native selected passage',base:saved.request.field.height/2,clearHeight:7});}
 const expectedIds=groundReference.rows.filter(x=>x.outsideGroundEnclosureFeet2>VOLUME_EPS).map(x=>x.id).sort();assert.equal(expectedIds.length,13);
 const decisions=[],candidateSolids=new Map();
 for(const id of expectedIds){
  const e=events.get(id),c=cm.get(id);assert(e&&c&&e.kind==='base-wall'&&e.p.zone==='upper');
  const p=e.p,station=b.galleryReport.stations.find(s=>s.sourceId===p.sourceId&&s.curveIndex===p.curveIndex&&s.side===p.side&&s.level===p.level);assert(station);
  const band=bandDecision(saved.request.field.height,policy.buildingBaseFeet,p.zone,e.bottom);
  decisions.push({id,source:{letterId:p.sourceId,curveIndex:p.curveIndex,zone:p.zone,sourceBottomFeet:station.bottom,sourceTopFeet:station.top,setbackFeet:p.setback},originalWall:{bottom:e.bottom,top:e.top,meshHash:hash(c.mesh)},...band,
   attribution:{unambiguous:true,method:'Exact native add() event and saved source station'},
   extension:null,relations:ledger.walls.find(x=>x.id===id)?.relatedConnectionsAndReturns??[]});
 }

 return {w,g,whole,walls,letters,territory,trace,b,decisions,candidateSolids,protection,worldPlacement,policy,helperHash,extrudeHelperHash,grid,ledger,groundReference,saved};
}

function form(ctx,ids){
 // This correction grants no new wall operations. Never accept a forged eligibility flag.
 assert.equal(ids.length,0,'Cross-band downward extensions are prohibited by authentic height bands.');
 const architecture=structuredClone(ctx.b.architecture),worldArchitecture=structuredClone(ctx.saved.architecture);
 return {version:VERSION,revision:REVISION,scope:'controlled-fixture',selected:[],additions:[],architecture,worldArchitecture,
  sourceMeshHash:hash(ctx.saved.letters),baselineArchitectureHash:hash(ctx.saved.architecture),architectureHash:hash(architecture),worldArchitectureHash:hash(worldArchitecture),
  validation:{passed:true,addedMaterialFeet3:0,removedMaterialFeet3:0,geometryUnchanged:true},
  provenance:{adapter:VERSION,revision:REVISION,adapterHash:hash(fs.readFileSync(__filename)),baselineInputHash:hash(ctx.saved),sourceLettersUnchanged:true,
   bands:heightBands(ctx.saved.request.field.height,ctx.policy.buildingBaseFeet),originalComponentCount:ctx.b.components.length,newComponentCount:ctx.b.components.length}};
}

module.exports={REVISION,heightBands,bandDecision,VERSION,traceNative,analyze,form,pack,obj,rigid,hash,AREA_EPS,VOLUME_EPS};
