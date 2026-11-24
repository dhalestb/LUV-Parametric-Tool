// Opt-in integration of authenticated Inserted Horizontal Plate and the accepted cap adapter.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),V=path.join(ROOT,'vendor/typology-proof-20261121');
const {authenticate,hash}=require('./polygon-plate-edge-proof.cjs');
const {planCapElevation,bounds,VERSION:CAP_VERSION}=require('./plate-corner-top-adapter.cjs');
const studyProfile=require('./study135-profile.cjs');
const polygonAdapter=require('./plate-polygon-responsive.cjs');
const VERSION='inserted-horizontal-plate/generate-design-v1';
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v),{flag:'wx'});
function siteMesh(mesh,center,angle,datum){const c=Math.cos(angle),s=Math.sin(angle),positions=[],indices=[];for(let i=0;i<mesh.positions.length;i+=3){const[x,y,z]=mesh.positions.slice(i,i+3);positions.push(center[0]+c*x-s*y,datum+z,center[1]+s*x+c*y);}for(let i=0;i<mesh.indices.length;i+=3)indices.push(mesh.indices[i],mesh.indices[i+2],mesh.indices[i+1]);return{positions,indices};}
function obj(m){let t='';for(let i=0;i<m.positions.length;i+=3)t+='v '+m.positions.slice(i,i+3).join(' ')+'\n';for(let i=0;i<m.indices.length;i+=3)t+='f '+m.indices.slice(i,i+3).map(i=>i+1).join(' ')+'\n';return t;}
function validateRing(r){assert(Array.isArray(r)&&r.length>=3&&r.length<=128&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'Organizing field needs finite site X/Z vertices');const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(let i=0;i<r.length;i++)for(let j=i+2;j<r.length;j++){if(i===0&&j===r.length-1)continue;const a=r[i],b=r[(i+1)%r.length],c=r[j],d=r[(j+1)%r.length];assert(!(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))),'Organizing field self-intersects');}}
async function generatePlateDesign(input,{outputRoot,runId=crypto.randomUUID()}={}){
 const started=Date.now(),inputHash=hash(input);authenticate();const handoff=input.siteHandoff,nativeHeight=handoff?.requestedHeightFeet??60;if(handoff)assert(handoff.compatibility.ready,'Unverified site handoff');
 assert.equal(input.development?.ruleBasis,'polygon-site-v1','Plate requires explicit Site height regions');
 assert.equal(input.adaptive?.typologyId,'inserted-plate');assert.equal(input.recipe,'edge-connected','Only edge-connected with the accepted corner-L adapter is integrated');
 assert(!input.adaptive.descriptorDistribution&&!input.adaptive.descriptorSpatialTargeting,'Descriptor generation is not integrated');
 const {site,zoneId}=input,zone=site?.zones.find(z=>z.id===zoneId);assert(zone,'Select a source polygon');
 assert(site.coordinates.unitAssumption==='confirmed'&&Number.isFinite(site.coordinates.feetPerModel)&&site.coordinates.feetPerModel>0,'Confirmed source units required; polygon coordinates must already be feet');
 const settings=input.plate;assert(settings,'Plate parameters required');
 const profile=settings.profile??'parameterized-corner-top-v1';assert(['parameterized-corner-top-v1',studyProfile.PROFILE,polygonAdapter.VERSION].includes(profile),'Unknown Plate generation profile');
 const isPolygon=profile===polygonAdapter.VERSION; const isStudy135=profile===studyProfile.PROFILE,studyRequest=isStudy135?studyProfile.study135Request(settings,input.seed):null,adapterVersion=isStudy135?studyProfile.VERSION:isPolygon?polygonAdapter.VERSION:VERSION;
 for(const [k,min,max] of [['preferredFeet',1,100],['spacingFeet',12,15],['insetFeet',0,5],['setbackFeet',0,100]])assert(Number.isFinite(settings[k])&&settings[k]>=min&&settings[k]<=max,'Invalid Plate '+k);
 assert(Number.isSafeInteger(input.seed)&&input.seed>=0&&input.seed<=4294967295,'Invalid seed');assert(Number.isFinite(input.heading)&&Number.isFinite(input.datum),'Finite heading and actual base required');
 assert(Number.isFinite(input.development.targetBuildingCoveragePercent)&&input.development.targetBuildingCoveragePercent>0&&input.development.targetBuildingCoveragePercent<=100,'Invalid coverage evaluation target');
 const field=settings.organizingField;assert(['rectangle','polygon'].includes(field?.kind),'Select an independent rectangle or polygon organizing field');validateRing(field.boundary);
 if(field.kind==='rectangle'){assert.equal(field.boundary.length,4);for(let i=0;i<4;i++){const a=field.boundary[i],b=field.boundary[(i+1)%4],c=field.boundary[(i+2)%4];assert(Math.abs((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))<1e-6,'Rectangle field requires four right-angle corners');}}
 const allocation=input.adaptive.allocationPercent,territory=input.adaptive.territory;
 if(territory)assert.equal(territory.typologyId,'inserted-plate','Wrong typology territory');
 const plan=await require('./site-rule-contract.cjs').planSiteRules({site,zoneId,allocationPercent:allocation,territory,reserved:input.reserved??[],heightRegions:input.siteRulePlan?.regions??[],heightSource:input.siteRulePlan?.source});
 assert.equal(plan.status,'site-rules-ready',plan.blockers.join(' '));
 const w=await require('manifold-3d/manifold.js').default();w.setup();const g=require('./independent-field-gallery.cjs').geometry(w),domain=new w.CrossSection(plan.siteRules.domain),fieldSection=g.section(field.boundary);
 assert(fieldSection.area()>1e-6,'Empty organizing field');const clearanceDomain=domain.offset(-settings.setbackFeet,'Miter');
 assert(fieldSection.subtract(clearanceDomain).area()<1e-6,'Organizing field exceeds the territory, exclusion, corridor or requested setback');
 const heights=plan.siteRules.regions.filter(r=>r.areaFeet2>1e-6&&(handoff||fieldSection.intersect(new w.CrossSection(r.contours)).area()>1e-6));
 assert(heights.length>0&&(handoff||heights.every(r=>r.heightFeet===60)),'PLATE_HEIGHT_UNSUPPORTED: this integration validates a uniform 60-ft field; 20/40-ft or mixed-height arrangements remain unavailable, without source distortion');
 const allowedHeight=w.CrossSection.union(heights.map(r=>new w.CrossSection(r.contours)));assert(fieldSection.subtract(allowedHeight).area()<1e-6,'Organizing field has unassigned height');
 const diameter=input.development.planningDiameterFeet;assert(Number.isFinite(diameter)&&diameter>=0,'Invalid planning disk diameter');assert(!domain.offset(-diameter/2,'Round').isEmpty(),'Territory fails the existing planning-disk feasibility screen');
 const angle=input.heading*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),local=field.boundary.map(([x,y])=>[c*x+s*y,-s*x+c*y]);
 const low=[0,1].map(i=>Math.min(...local.map(p=>p[i]))),high=[0,1].map(i=>Math.max(...local.map(p=>p[i]))),middle=low.map((v,i)=>(v+high[i])/2),center=[c*middle[0]-s*middle[1],s*middle[0]+c*middle[1]];
 const corners=t=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const x=middle[0]+a*(high[0]-low[0])*t/2,y=middle[1]+b*(high[1]-low[1])*t/2;return[c*x-s*y,s*x+c*y]});
 let lo=1,hi=1;if(!isPolygon){lo=0;for(let i=0;i<40;i++){let t=(lo+hi)/2;if(g.section(corners(t)).subtract(fieldSection).area()<1e-8)lo=t;else hi=t;}}
 const polygonLocal=local.map(p=>[p[0]-middle[0],p[1]-middle[1]]);
 const constructionSupport=isPolygon?polygonAdapter.domainSupport(polygonLocal,nativeHeight):null;
 const workspace=settings.computationalWorkspace;
 if(isPolygon&&workspace)assert(Number.isFinite(workspace.widthFeet)&&Number.isFinite(workspace.depthFeet)&&workspace.widthFeet>=constructionSupport.width&&workspace.depthFeet>=constructionSupport.depth,'Computational workspace must contain the domain-derived finite sweep support; it cannot constrain architecture');
 const frame=studyRequest?.field??(isPolygon?{width:workspace?.widthFeet??constructionSupport.width,depth:workspace?.depthFeet??constructionSupport.depth,height:nativeHeight}:{width:(high[0]-low[0])*lo-2*settings.insetFeet,depth:(high[1]-low[1])*lo-2*settings.insetFeet,height:nativeHeight});assert(frame.width>0&&frame.depth>0,'No native capacity after field inset');
 require(path.join(V,'proof/rule-amphitheater.cjs'));const T=require('three'),native=require(path.join(V,'scripts/source-envelope.cjs')),population=require(path.join(V,'src/components/insertedPlatePopulation.ts'));
 const polygonSample=isPolygon?polygonAdapter.sample({polygon:polygonLocal,frame,size:settings.preferredFeet,spacing:settings.spacingFeet,seed:input.seed,fraction:settings.polygonExtentFraction??.40,orientationBasis:settings.polygonOrientationBasis??'native'}):null;
 const buildSource=(request,dir)=>isPolygon?polygonAdapter.withContext(polygonLocal,()=>native.buildSource(request,dir)):native.buildSource(request,dir);
 const count=studyRequest?.population??population.suggestedPerimeterPlateCount(frame,settings.preferredFeet,settings.spacingFeet),source=studyRequest?.source??polygonSample?.source??population.populatePerimeterLevels(frame,settings.preferredFeet,input.seed,settings.spacingFeet,count);
 const initial=studyRequest??{generator:'source-preserving',typologyName:'Inserted Horizontal Plate',envelopeVersion:'inserted-plate',insertedPlate:{version:'edge-connected'},field:frame,preferredFeet:settings.preferredFeet,population:source.length,sourceId:hash({inputHash,source}),sourceName:'Generate Design Â· Inserted Horizontal Plate',sourceSnapshot:{arrangementSeed:input.seed,floorSpacing:settings.spacingFeet,orientationVersion:7},source};
 if(isPolygon)initial.sourceSnapshot.polygonAdapter={version:polygonAdapter.VERSION,domainRevision:polygonAdapter.DOMAIN_REVISION,architecturalDomain:{polygon:polygonLocal,heightFeet:nativeHeight},computationalWorkspace:{widthFeet:frame.width,depthFeet:frame.depth},finiteSweepSupport:constructionSupport,polygon:polygonLocal,ledger:polygonSample.ledger,context:polygonSample.context,nativeRecipeHash:polygonSample.nativeRecipeHash,orientationBasis:settings.polygonOrientationBasis??'native',extentFraction:settings.polygonExtentFraction??.40};
 const out=path.join(outputRoot??path.join(ROOT,'public/experiment-designs'),runId);assert(!fs.existsSync(out),'Immutable run already exists');fs.mkdirSync(out,{recursive:true});write(path.join(out,'input.json'),input);
 // Native B planning resolves the authentic receiver top before final A is saved.
 // This planning assembly is freshly executed, never a saved architectural substitute.
 const planningDir=path.join(out,'native-planning');fs.mkdirSync(planningDir);const planning=await buildSource(initial,planningDir);write(path.join(planningDir,'request.json'),initial);
 const capId=planning.plateReport.pier?.source,capIndex=planning.letters.findIndex(l=>l.id===capId);assert(capIndex>=0,'Native corner pier missing');
 const capBefore=planning.letters[capIndex],capBox=bounds(capBefore.mesh),column=g.project(capBefore.mesh).extrude(frame.height);
 const sourceClearances=planning.letters.filter(l=>l.id!==capId).map(l=>{const x=column.intersect(g.body(l.mesh));return x.volume()>1e-8?{source:l.id,top:x.boundingBox().max[2]}:null}).filter(Boolean);
 const capPlan=isStudy135?{version:studyProfile.VERSION,deltaZFeet:0,reason:"Original Study 135 cap/pier relationship retained"}:planCapElevation({capBottom:capBox.min[2],capTop:capBox.max[2],pierTop:planning.plateReport.pier.top,baseElevationFeet:0,heightFeet:frame.height,minimumSourceClearanceFeet:Math.max(0,...sourceClearances.map(x=>x.top+1e-5))});
 const request=structuredClone(initial);request.source[capIndex].z+=capPlan.deltaZFeet;if(!isStudy135)request.sourceSnapshot.cornerAdapter={version:CAP_VERSION,plan:capPlan};
 const derived=native.derive(request),savedNativeA=derived.letters,nativeAHash=hash(savedNativeA);
 for(let i=0;i<savedNativeA.length;i++)if(i!==capIndex)assert.deepEqual(savedNativeA[i],planning.letters[i]);
 const cap=savedNativeA[capIndex];assert.deepEqual(cap.mesh.indices,capBefore.mesh.indices);cap.mesh.positions.forEach((v,i)=>assert(Math.abs(v-capBefore.mesh.positions[i]-(i%3===2?capPlan.deltaZFeet:0))<1e-10,'Native cap deformed'));
 const componentsA=savedNativeA.map((l,i)=>({id:l.id,letter:request.source[i].letter,nominalSizeFeet:settings.preferredFeet,mesh:siteMesh(l.mesh,center,angle,input.datum)}));
 const localToWorldPlan=([x,y])=>[center[0]+c*x-s*y,center[1]+s*x+c*y];
 const actualPlan=mesh=>{const p=g.project(mesh);return new w.CrossSection(p.toPolygons().map(r=>r.map(localToWorldPlan)),'NonZero')};
 const letterPlan=w.CrossSection.union(savedNativeA.map(l=>actualPlan(l.mesh)));assert(letterPlan.subtract(fieldSection).area()<1e-6&&letterPlan.subtract(clearanceDomain).area()<1e-6,'Complete source-letter projection outside assigned field or clearances');
 const sourceSiteEnvelope=handoff?await require('./site-typology-handoff.cjs').validateOccupiedGeometry(handoff,componentsA):undefined;
 const geometryHash=hash(componentsA),orientationId=hash({runId,geometryHash}),counts=Object.fromEntries(['L','U','V'].map(t=>[t,source.filter(s=>s.letter===t).length]));
 const territoryBoundary=territory?.polygon??zone.polygon;
 const orientation={version:1,id:orientationId,kind:'orientation-only',typologyId:'inserted-plate',typologyName:'Inserted Horizontal Plate',site,zoneId,geometryHash,counts,
 parameters:{recipe:'edge-connected + '+(isStudy135?studyProfile.PROFILE:isPolygon?polygonAdapter.VERSION:CAP_VERSION),seed:input.seed,spacing:settings.spacingFeet,heading:input.heading,datum:input.datum,field:frame},frame:{center,angle,corners:corners(lo)},components:componentsA,
 layers:[{level:0,world:field.boundary.map(p=>[p[0],input.datum,p[1]])}],organizingEdges:[{id:'allocated-territory',points:[...territoryBoundary,territoryBoundary[0]].map(p=>[p[0],input.datum+.02,p[1]])}],
 validation:{sourceSiteEnvelope,outsideArea:letterPlan.subtract(clearanceDomain).area(),maxElevationError:0,triangles:componentsA.reduce((n,c)=>n+c.mesh.indices.length/3,0),attempts:1,grossArea:plan.siteRules.grossAreaFeet2,permittedArea:domain.area(),protectedArea:plan.siteRules.grossAreaFeet2-plan.siteRules.permittedAreaFeet2,milliseconds:Date.now()-started},
 provenance:{siteHandoff:handoff,entry:isStudy135?'Study 135 saved source poses -> source-envelope.cjs#derive':isPolygon?'plate-polygon-responsive.cjs#sample (native recipe, polygon placement) -> source-envelope.cjs#derive + '+CAP_VERSION:'insertedPlatePopulation.ts#populatePerimeterLevels -> source-envelope.cjs#derive + '+CAP_VERSION,B:{executed:false},inputHash,nativeSourceHash:nativeAHash,nativeRequest:request,sourceFingerprint:site.fingerprint,sourceRevision:site.revision,siteRules:plan.siteRules,organizingField:field,territory:territory??{id:zoneId+'-full-territory',polygon:zone.polygon},adapterVersion,capPlan},
 limitations:[isStudy135?'Exact Study 135 profile: saved 13-ft letters, 15-ft spacing and 60-ft native field; rigid placement only, no adaptive population.':isPolygon?'Convex polygon source placement;15 letters/four levels/one pier only. Native numerical box must not determine finished architecture.':'Explicit native rectangular capacity fitted within independent organizing input; no free irregular-domain population.','60-ft homogeneous field only in this integration.','Geometric contact is not certified walking circulation or structural compliance.']};
 write(path.join(out,'rule-a.json'),orientation);write(path.join(out,'native-rule-a.json'),{request,letters:savedNativeA,sourceHash:nativeAHash});const exactA=hash(orientation);
 const finalDir=path.join(out,'rule-b');fs.mkdirSync(finalDir);
 // Dependency injection is scoped to this dedicated generation child process and restored
 // in finally. All original source files and original exports remain unchanged afterward.
 const joints=require(path.join(V,'scripts/full-corner-joints.cjs')),originalPier=joints.fullCornerPier;
 let formation;
 try{
  if(!isStudy135)joints.fullCornerPier=(wasm,node,parts,nativeField)=>{
   assert.equal(node.id,capId);const m=new T.Matrix4().fromArray(node.matrix),points=require(path.join(V,'src/components/letterGeometry3d.ts')).getLetterShape('L').getPoints().map(p=>new T.Vector3(p.x,p.y,0).applyMatrix4(m));
   assert(points.every(p=>Math.abs(p.z-points[0].z)<1e-6),'Corner L must remain horizontal');
   const profile=new wasm.CrossSection([points.map(p=>[p.x,p.y])],'EvenOdd'),top=bounds(savedNativeA[capIndex].mesh).min[2],solid=profile.extrude(top);
   assert(top>0&&top<nativeField.height);const contacts=parts.map(p=>({id:p.id,overlap:p.solid.intersect(solid)})).filter(p=>p.overlap.volume()>.0001).map(p=>({id:p.id,volume:p.overlap.volume(),base:p.overlap.boundingBox().min[2],top:p.overlap.boundingBox().max[2]}));
   assert(contacts.length>0,'Cap pier has no receiving architecture');parts.push({id:'corner-pier-'+node.id,owner:node.id,solid});return{source:node.id,base:0,top,area:profile.area(),contacts,adapterVersion:CAP_VERSION};
  };
  formation=await buildSource(request,finalDir);
 }finally{joints.fullCornerPier=originalPier;}
 const study135=isStudy135?studyProfile.verifyStudy135(formation):undefined;
 assert.equal(joints.fullCornerPier,originalPier);assert.equal(hash(formation.letters),nativeAHash,'Rule B must consume exact saved A');assert.equal(hash(orientation),exactA,'Saved Rule A mutated');
 formation.components.filter(c=>!c.id.startsWith('corner-pier')).forEach(c=>assert.deepEqual(c.mesh,planning.components.find(p=>p.id===c.id).mesh,'Cap correction changed native wall/plate geometry'));
 const finalBody=g.body(formation.architecture),pierId='corner-pier-'+capId,pier=g.body(formation.components.find(x=>x.id===pierId).mesh),capBody=g.body(cap.mesh),oldPier=g.body(planning.components.find(x=>x.id===pierId).mesh);
 assert.equal(finalBody.status(),'NoError');assert.equal(finalBody.decompose().length,1,'Disconnected architecture');
 const contacts=formation.components.filter(c=>c.id!==pierId).map(c=>({id:c.id,before:g.body(planning.components.find(p=>p.id===c.id).mesh).intersect(oldPier).volume(),after:g.body(c.mesh).intersect(pier).volume()}));assert(contacts.every(c=>c.before<=1e-6||c.after>1e-6),'Pier connection lost');
 const sourceCollisions=[];for(let i=0;i<savedNativeA.length;i++)for(let j=i+1;j<savedNativeA.length;j++){const volume=g.body(savedNativeA[i].mesh).intersect(g.body(savedNativeA[j].mesh)).volume();if(volume>1e-6)sourceCollisions.push({a:savedNativeA[i].id,b:savedNativeA[j].id,volumeFeet3:volume});}
 if(isPolygon)assert.equal(sourceCollisions.length,0,'Polygon variant requires zero source collisions: '+JSON.stringify(sourceCollisions));
 const polygonJunctions=isPolygon?polygonAdapter.validateJunctions(formation,request,g):undefined;
 if(isPolygon){const b=bounds(formation.architecture);assert(b.min[0]>-constructionSupport.width/2+.1&&b.max[0]<constructionSupport.width/2-.1&&b.min[1]>-constructionSupport.depth/2+.1&&b.max[1]<constructionSupport.depth/2-.1,'Numerical clipping box contacted');assert.equal(formation.plateReport.floors.length,4);}
 const warnings=sourceCollisions.length?[`Preserved native source arrangement contains ${sourceCollisions.length} positive-volume source-letter overlap(s): ${sourceCollisions.map(x=>x.a+' / '+x.b+' ('+x.volumeFeet3.toFixed(6)+' ft³)').join(', ')}. No clearance correction applied.`]:[];
 const capCollisions=savedNativeA.filter(l=>l.id!==capId).map(l=>({id:l.id,volume:capBody.intersect(g.body(l.mesh)).volume()}));assert(capCollisions.every(c=>c.volume<1e-6),'Cap intersects source letter');
 const seat=bounds(cap.mesh).min[2],gap=seat-pier.boundingBox().max[2],bearing=capBody.slice(seat+1e-5).intersect(pier.slice(seat-1e-5)).area();assert(Math.abs(gap)<3e-6&&bearing>formation.plateReport.pier.area*.999,'Cap bearing failed');
 const openings=formation.plateReport.pockets.map(p=>({source:p.source,blockedVolumeFeet3:finalBody.intersect(g.body(p.cutterMesh)).volume()}));assert(openings.every(p=>Math.abs(p.blockedVolumeFeet3)<1e-7),'Native opening obstructed');
 assert(formation.contributions.every(c=>c.exposedArea>=1),'A native source has no exposed contribution');
 const footprint=actualPlan(formation.architecture),outside=footprint.subtract(clearanceDomain).area(),outsideHeight=footprint.subtract(allowedHeight).area();assert(outside<1e-6&&outsideHeight<1e-6,'Architecture exceeds territory, protection, clearance or height region');
 assert(bounds(formation.architecture).min[2]>=-1e-6&&bounds(formation.architecture).max[2]<=nativeHeight+1e-6&&bounds(cap.mesh).max[2]<=nativeHeight,'Height envelope exceeded');
 write(path.join(finalDir,'request.json'),request);
 const strict=spawnSync(process.execPath,[path.join(V,'proof/rule-validation.cjs'),finalDir],{encoding:'utf8',maxBuffer:5e6});fs.writeFileSync(path.join(out,'export-validation.log'),strict.stdout+'\n'+strict.stderr);assert.equal(strict.status,0,strict.stdout+'\n'+strict.stderr);const exported=JSON.parse(fs.readFileSync(path.join(finalDir,'validation.json')));assert(exported.passed);
 const architectureMesh=siteMesh(formation.architecture,center,angle,input.datum),architectureComponents=formation.components.map(c=>({...c,mesh:siteMesh(c.mesh,center,angle,input.datum)}));
 const occupiedSiteEnvelope=handoff?await require('./site-typology-handoff.cjs').validateOccupiedGeometry(handoff,[{id:'complete-rule-b',mesh:architectureMesh}]):undefined;
 const architectureHash=hash(architectureMesh),architectureId=hash({orientationId,architectureHash}),floorArea=formation.plateReport.floors.reduce((n,f)=>n+g.body(formation.components.find(c=>c.id===f.id).mesh).volume()/f.thickness,0);
 const measurements={expectationBuildingCoveragePercent:input.development.targetBuildingCoveragePercent,sourceLetterCoveragePercent:100*letterPlan.area()/domain.area(),buildingCoveragePercent:100*footprint.area()/domain.area(),totalPrimaryFloorPlateAreaFeet2:floorArea,exposedTerraceAreaFeet2:null,openSiteAreaFeet2:domain.area()-footprint.area(),registeredProtectedVoidAreaFeet2:plan.siteRules.grossAreaFeet2-plan.siteRules.permittedAreaFeet2,buildingFootprintFeet2:footprint.area(),territoryAreaFeet2:domain.area(),siteAreaFeet2:plan.siteRules.grossAreaFeet2,plateLevels:formation.plateReport.floors.map(f=>input.datum+f.topZ)};
 const architecture={version:1,warnings,id:architectureId,typologyId:'inserted-plate',typologyName:'Inserted Horizontal Plate',parentOrientationId:orientationId,parentGeometryHash:geometryHash,geometryHash:architectureHash,architecture:architectureMesh,components:architectureComponents,measurements,
 validation:{occupiedSiteEnvelope,polygonJunctions,sourceCollisions,sourceCollisionFree:sourceCollisions.length===0,study135,outsideArea:outside,protectedArea:0,footprintArea:footprint.area(),heightAboveDatum:bounds(formation.architecture).max[2],completeHeightIncludingSourceLetters:Math.max(...savedNativeA.map(l=>bounds(l.mesh).max[2])),triangles:architectureMesh.indices.length/3,connectedSolids:1,openings,allSourcesExposed:true,worldBaseFeet:input.datum,worldCeilingFeet:input.datum+nativeHeight,worldArchitectureBounds:bounds(architectureMesh),capPierGapFeet:gap,capBearingAreaFeet2:bearing,capCollisions,finishedPierContacts:contacts.filter(c=>c.after>1e-6),nativeExports:exported,nativeSourceHash:nativeAHash,exactSavedAConsumed:true},
 provenance:{siteHandoff:handoff,study135,entry:'source-envelope.cjs#buildSource -> source-inserted-plate.cjs#insertedPlateEnvelope -> source-edge-envelope.cjs#edgeEnvelope'+(isPolygon?' via polygon-responsive exterior context':'')+(isStudy135?' (unmodified native pier)':' + '+CAP_VERSION),adapterVersion,originalBindings:authenticate(),nativeRequestHash:hash(request),sourceHash:nativeAHash,inputHash,sourceFingerprint:site.fingerprint,sourceRevision:site.revision,capPlan,sourceClearances,siteRules:plan.siteRules,organizingField:field,sourcePolygon:zone.polygon,territory:territory??{id:zoneId+'-full-territory',polygon:zone.polygon},footprint:footprint.toPolygons(),axisConversion:'native X/Y plan Z up -> site X/Z plan Y up; triangle winding reversed once; site polygon coordinates already feet'},plateReport:formation.plateReport,
 exports:{nativeObj:'/experiment-designs/'+runId+'/rule-b/combined-envelope.obj',worldObj:'/experiment-designs/'+runId+'/world-architecture.obj'},limitations:orientation.limitations};
 assert.equal(hash(input),inputHash);assert.equal(hash(orientation),exactA);fs.writeFileSync(path.join(out,'world-architecture.obj'),obj(architectureMesh),{flag:'wx'});write(path.join(out,'architecture.json'),architecture);
 const architectureRoot=outputRoot?path.join(outputRoot,runId,'architecture-library'):path.join(ROOT,'public/experiment-architecture');fs.mkdirSync(architectureRoot,{recursive:true});write(path.join(architectureRoot,architectureId+'.json'),architecture);
 const url='/experiment-architecture/'+architectureId+'.json';write(path.join(architectureRoot,orientationId+'.manifest.json'),{id:architectureId,parentOrientationId:orientationId,url});
 const response={warnings,status:'complete',runId,orientation,architecture:{id:architectureId,url,geometryHash:architectureHash,components:architectureComponents.length,measurements,validation:architecture.validation},recoveryUrl:'/experiment-designs/'+runId+'/response.json'};write(path.join(out,'response.json'),response);return response;
}
module.exports={generatePlateDesign,siteMesh,validateRing,VERSION};
