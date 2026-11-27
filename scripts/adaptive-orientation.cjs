// Adaptive domain integration. Native typology rules are authenticated, never rewritten.
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),{generate,hash}=require('./polygon-orientation.cjs'),catalog=require('../src/components/polygonExperiment/adaptive-registry.json');
const area=r=>Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2);
const positive=r=>r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0)>0?r:[...r].reverse();
function validateRing(r){if(!Array.isArray(r)||r.length<3||r.length>1000||!r.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||area(r)<1e-6)throw Error('Invalid adaptive region');}
async function execute(input){
 if(!input.adaptive){if(input.adaptiveField||input.generationRegion||input.setbackFeet)throw Error('Adaptive domain requires explicit adaptive request');return generate(input);}
 const a=input.adaptive,entry=catalog.items.find(r=>r.id===a.typologyId);
 if(!entry||!entry.adaptiveAdapter)throw Error('Authentic rules registered, but this typology has no adaptive adapter yet.');
 if(!entry.supportedAdaptiveVariants.includes(input.recipe))throw Error('Selected authentic variant does not support this adaptive adapter.');
 for(const b of [...entry.A.bindings,...entry.B.bindings])if(hash(fs.readFileSync(path.join(ROOT,b.sourceFile)))!==b.sha256)throw Error('Authentic rule hash mismatch: '+b.sourceFile);
 if(a.descriptorDistribution||a.descriptorSpatialTargeting)throw Error('Descriptors are reserved; not implemented.');
 if(!input.site?.protectionMetadataComplete||input.site.coordinates?.unitAssumption!=='confirmed')throw Error('Confirmed source units and complete protection metadata required.');
 const zone=input.site.zones.find(z=>z.id===input.zoneId);if(!zone)throw Error('Source zone unavailable');
 const {allocationPercent,coveragePercent,heightFeet,setbackFeet}=a;
 if(![allocationPercent,coveragePercent,heightFeet,setbackFeet].every(Number.isFinite)||allocationPercent<=0||allocationPercent>100||coveragePercent<=0||coveragePercent>100||heightFeet<12||heightFeet>120||setbackFeet<0||setbackFeet>100)throw Error('Invalid adaptive limits; this first adapter supports heights 12–120 ft.');
 const siteHeight=Number(zone.inputParameters.maxHeightFeet);if(siteHeight>0&&heightFeet>siteHeight)throw Error('Requested height exceeds the selected zone limit.');
 const region=a.territory?.polygon??zone.polygon;validateRing(region);
 if(a.territory&&(a.territory.zoneId!==zone.id||a.territory.sourceFingerprint!==input.site.fingerprint||a.territory.typologyId!==entry.id))throw Error('Territory identity or source fingerprint mismatch.');
 if(!a.territory&&allocationPercent!==100)throw Error('Partial allocation requires an existing explicit territory polygon; percentages do not manufacture boundaries.');
 const w=await require('manifold-3d/manifold.js').default();w.setup();const owned=[],own=x=>(owned.push(x),x),section=r=>own(new w.CrossSection([positive(r)]));
 try{
 const outer=section(zone.polygon),regionSection=section(region);if(own(regionSection.subtract(outer)).area()>1e-6)throw Error('Territory extends outside source polygon.');
 const masks=[...(zone.holes||[]),...input.site.exclusions.map(x=>x.polygon),...(input.site.reservedAreas||[]).map(x=>x.polygon),...(input.reserved||[]).map(x=>x.polygon)];
 for(const c of input.site.corridors||[])for(let i=1;i<c.points.length;i++){const p=c.points[i-1],q=c.points[i],dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy),h=c.widthFeet/2;if(!Number.isFinite(h)||h<=0)throw Error('Invalid corridor');if(!len)continue;const ux=dx/len,uy=dy/len,nx=-uy*h,ny=ux*h;masks.push([[p[0]-ux*h+nx,p[1]-uy*h+ny],[p[0]-ux*h-nx,p[1]-uy*h-ny],[q[0]+ux*h-nx,q[1]+uy*h-ny],[q[0]+ux*h+nx,q[1]+uy*h+ny]]);}
 masks.forEach(validateRing);const protectedRegion=own(w.CrossSection.union(masks.map(section))),base=own(regionSection.subtract(protectedRegion)),permitted=own(base.offset(-setbackFeet));if(permitted.area()<1e-6)throw Error('Setbacks and protections leave no generation area.');
 // Coverage is an explicit organizing-field search budget, not a claim about Rule B footprint.
 const extent=a.organizingFieldBudgetPercent??coveragePercent;if(!Number.isFinite(extent)||extent<=0||extent>100)throw Error('Invalid spatial-extent budget');const budget=permitted.area()*extent/100,headings=[input.heading??0,...region.map((p,i)=>{const q=region[(i+1)%region.length];return Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;})];
 const trials=[],candidates=[];for(const angle of [...new Set(headings)]){const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),rot=region.map(([x,z])=>[c*x+s*z,-s*x+c*z]),xs=rot.map(p=>p[0]),zs=rot.map(p=>p[1]),W=Math.max(...xs)-Math.min(...xs)-2*setbackFeet,D=Math.max(...zs)-Math.min(...zs)-2*setbackFeet;if(W<=0||D<=0)continue;const ratio=W/D;for(const f of [1,.9,.8]){const width=Math.min(W,Math.sqrt(budget*ratio))*f,depth=Math.min(D,Math.sqrt(budget/ratio))*f;if(Math.min(width,depth)>=25)candidates.push({width,depth,height:heightFeet,angle});}}
 if(!candidates.length)throw Error('No supported mixed-letter field dimensions fit the available budget; no letters were scaled.');
 let result;
 for(const candidate of candidates.slice(0,9)){try{const {angle,...field}=candidate;result=await generate({...input,adaptiveField:field,generationRegion:region,setbackFeet,heading:angle});trials.push({field,heading:angle,accepted:true});break;}catch(e){trials.push({field:candidate,accepted:false,reason:e.message});}}
 if(!result)throw Error('Authentic adaptive attempts failed; no substitute layout generated. '+JSON.stringify(trials));
 const triangles=[];for(const component of result.components)for(let i=0;i<component.mesh.indices.length;i+=3){const t=component.mesh.indices.slice(i,i+3).map(j=>[component.mesh.positions[j*3],component.mesh.positions[j*3+2]]);if(area(t)>1e-10)triangles.push(positive(t));}
 const footprint=own(new w.CrossSection(triangles,'NonZero')),outside=own(footprint.subtract(permitted)).area(),protectionOverlap=own(footprint.intersect(protectedRegion)).area();
 const points=result.components.flatMap(c=>{const p=c.mesh.positions;return Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3));}),min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
 if(outside>1e-6||protectionOverlap>1e-6||max[1]-input.datum>heightFeet+1e-6||min[1]<input.datum-1e-6)throw Error('Adaptive complete-geometry containment/height validation failed.');
 result.adaptive={version:1,adapter:entry.adaptiveAdapter,typologyId:entry.id,region:{polygon:region,territory:a.territory??null},allocationPercent,organizingFieldBudgetPercent:extent,requestedBuildingCoveragePercent:coveragePercent,achievedBuildingCoveragePercent:null,coveragePolicy:'Spatial extent budgets the organizing field independently of the architectural coverage target. Building coverage is measured after Rule B.',heightFeet,setbackFeet,availableEnvelopeVolumeFeet3:permitted.area()*heightFeet,descriptorDistribution:false,descriptorSpatialTargeting:false,trials};
 result.validation.adaptive={sourceZoneArea:outer.area(),territoryArea:regionSection.area(),permittedArea:permitted.area(),organizingFieldArea:result.parameters.field.width*result.parameters.field.depth,letterFootprintFeet2:footprint.area(),letterCoveragePercent:100*footprint.area()/permitted.area(),unusedPermittedAreaFeet2:permitted.area()-footprint.area(),outsideArea:outside,protectionOverlap,min,max,dimensions:max.map((x,i)=>x-min[i]),heightAboveDatum:max[1]-input.datum,nativeSpacingFeet:input.spacing,courseElevations:result.layers.map(l=>l.world[0][1]),setbackConstraintPassed:true};
 result.provenance.adaptive={registryVersion:catalog.version,input:structuredClone(a),sourceFingerprint:input.site.fingerprint,sourceRevision:input.site.revision,sourcePolygonHash:hash(zone.polygon),regionHash:hash(region),adapterSourceHash:hash(fs.readFileSync(__filename)),historicalResultsReused:false,B:{executed:false,bindings:entry.B.bindings,contract:'Consume this exact saved provenance.request, nativeMeshHash, poses, frame and geometryHash; never rerun Rule A.'}};
 result.id=hash({geometryHash:result.geometryHash,sourceGeometryHash:result.sourceGeometryHash,adaptive:result.adaptive,provenance:result.provenance.adaptive});
 result.limitations=['Authentic rectangular organizing field fitted within polygon; this is not a free-form perimeter rule.','Rule A only. Building footprint coverage cannot be measured before Rule B.','Spacing means native course spacing, not an invented minimum gap between running-bond letters.','Only Linear Edge Gallery print-contour adaptive adapter implemented; other authentic definitions remain registered.','No U letters occur in this authentic variant.'];
 return result;
 }finally{owned.reverse().forEach(x=>x.delete());}
}
module.exports={execute};if(require.main===module){let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',async()=>{try{process.stdout.write(JSON.stringify(await execute(JSON.parse(raw))));}catch(e){process.stderr.write(e.message);process.exitCode=1;}});}
