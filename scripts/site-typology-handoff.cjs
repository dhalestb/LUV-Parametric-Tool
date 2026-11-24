// Experimental domain handoff only. No authentic Rule A/B source is modified here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const VERSION='site-to-typology/v1',FIELD_VERSION='independent-organizing-field/v1';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const finite=(n,label)=>assert(Number.isFinite(n),label+' must be finite');
const signed=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2;
const EPS_AREA=1e-5,EPS_HEIGHT=1e-4;
let kernel;async function wasm(){if(!kernel)kernel=require('manifold-3d/manifold.js').default().then(w=>{w.setup();return w});return kernel;}
function simple(r){assert(Array.isArray(r)&&r.length>=3&&r.length<=1024&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'Finite polygon vertices required');const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(let i=0;i<r.length;i++)for(let j=i+2;j<r.length;j++){if(i===0&&j===r.length-1)continue;const a=r[i],b=r[(i+1)%r.length],c=r[j],d=r[(j+1)%r.length];assert(!(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))),'Self-intersecting organizing field');}assert(Math.abs(signed(r))>EPS_AREA,'Empty polygon');}
function canonicalRing(input){let r=input.map(p=>p.slice());for(let pass=0;pass<input.length*2&&r.length>3;pass++){let changed=false;for(let i=0;i<r.length;i++){const a=r[(i+r.length-1)%r.length],b=r[i],c=r[(i+1)%r.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(Math.hypot(b[0]-a[0],b[1]-a[1])<1e-8||(len>0&&Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/len<1e-7)){r.splice(i,1);changed=true;break;}}if(!changed)break;}return r;}
function canonical(w,contours){if(!contours.length)return{contours:[],sourceHash:hash([]),derivedHash:hash([]),symmetricDifferenceFeet2:0};const clean=contours.map(canonicalRing);const a=new w.CrossSection(contours,'NonZero'),b=new w.CrossSection(clean,'NonZero'),ab=a.subtract(b),ba=b.subtract(a),difference=ab.area()+ba.area();a.delete();b.delete();ab.delete();ba.delete();assert(difference<EPS_AREA,'Canonical domain differs from original');return{contours:clean,sourceHash:hash(contours),derivedHash:hash(clean),symmetricDifferenceFeet2:difference};}
function convex(r){const sign=Math.sign(signed(r));return r.every((b,i)=>{const a=r[(i+r.length-1)%r.length],c=r[(i+1)%r.length];return sign*((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>=-1e-7;});}
function rectangle(r){return r.length===4&&r.every((b,i)=>{const a=r[(i+3)%4],c=r[(i+1)%4];return Math.abs((a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1]))<1e-6;});}
function fieldGeometry(w,spec,territory){assert(spec&&spec.version===FIELD_VERSION,'Select an independent organizing field');assert(['rectangle','ellipse','polygon','territory'].includes(spec.shape),'Unsupported field shape');let contours;
 if(spec.shape==='territory'){finite(spec.insetFeet,'Inset');assert(spec.insetFeet>=0,'Negative inset');const cs=new w.CrossSection(territory,'NonZero'),inset=cs.offset(-spec.insetFeet,'Miter');contours=inset.toPolygons();cs.delete();inset.delete();}
 else{assert(spec.center?.length===2&&spec.center.every(Number.isFinite),'Choose field X/Z center');finite(spec.headingDegrees,'Heading');const a=spec.headingDegrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),transform=([x,z])=>[spec.center[0]+c*x-s*z,spec.center[1]+s*x+c*z];let ring;
  if(spec.shape==='polygon'){simple(spec.vertices);ring=spec.vertices;}
  else{finite(spec.widthFeet,'Width');finite(spec.depthFeet,'Depth');assert(spec.widthFeet>0&&spec.depthFeet>0,'Positive field dimensions required');ring=spec.shape==='rectangle'?[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>[x*spec.widthFeet,z*spec.depthFeet]):Array.from({length:48},(_,i)=>[Math.cos(i*Math.PI/24)*spec.widthFeet/2,Math.sin(i*Math.PI/24)*spec.depthFeet/2]);}
  const transformed=ring.map(transform);simple(transformed);if(signed(transformed)<0)transformed.reverse();contours=[transformed];
 }assert(contours.length>0,'Organizing field is empty');return canonical(w,contours).contours;
}
function compatibility(h){const blockers=[],notes=[],a=h.authenticParameters,H=h.requestedHeightFeet,field=h.organizingField.contours;
 if(![20,40,60].includes(H))blockers.push('Choose a native form-height configuration: 20, 40 or 60 ft. No height is selected automatically.');
 if(h.planningClearance&&!h.planningClearance.feasible)blockers.push('Territory fails the explicitly selected planning-clearance disk diameter. This is not a boundary setback.');
 if(field.length!==1)blockers.push('This typology adapter does not yet support holes or multiple organizing regions.');
 if(['room-within-volume','void-field'].includes(h.typologyId))blockers.push('Experimental typology remains disabled; unresolved validation findings are preserved.');
 if(h.typologyId==='linear-edge-gallery')blockers.push('Gallery site-domain formation adapter is not integrated with Generate Design. Authentic historical and independent-field proofs are preserved.');
 if(h.typologyId==='inserted-plate'){
  if(H!==60)blockers.push('Plate 40/20-ft complete configurations remain unverified. Native capacity alone is insufficient.');
  if(a.profile!=='inserted-horizontal-plate/polygon-responsive-v1')blockers.push('Shared polygon handoff requires the corrected polygon-responsive Plate profile; exact Study 135 remains available separately.');
  if(a.preferredFeet!==12||a.spacingFeet!==15||a.seed!==39||a.levels!==4||a.population!==15)blockers.push('Current polygon Plate profile requires its verified 15-letter / four-level / 12-ft / 15-ft spacing / seed-39 recipe.');
  if(field.length===1&&!convex(field[0]))blockers.push('Current Plate placement requires a convex independent field. Choose one explicitly; no bounding-rectangle fallback.');
  if(!(a.extentFraction>0&&a.extentFraction<=1))blockers.push('Plate extent fraction must be greater than 0 and at most 1.');
  notes.push('15 letters / four levels / one pier. Field extent changes center travel, not building coverage. All collisions and receiving relationships still require original A/B validation.');
 }
 if(h.typologyId==='vertical-walls'){
  if(H!==60)blockers.push('Stepped 40/20-ft generation profiles remain unverified. Saved 33.564-ft geometry alone is not a new-height generation proof.');
  if(field.length===1&&!rectangle(field[0]))blockers.push('Stepped native sampler currently requires an explicitly selected rectangle. Irregular fields are retained for planning but cannot silently become rectangles.');
  if(a.preferredFeet!==8||a.population!==6||a.levels!==3||a.spacingFeet!==15)blockers.push('Current Stepped profile retains six 8-ft letters / three levels / 15-ft spacing.');
  notes.push('40 × 40-ft adapter lock removed. Explicit rectangle dimensions, position and heading now reach the native sampler; any design still must pass complete native validation.');
 }
 if(h.fieldValidation.outsidePermittedFeet2>EPS_AREA)blockers.push('Organizing field exceeds territory, setback or protected space. It was not clipped or moved.');
 if(!h.heightRegions.some(r=>r.areaFeet2>EPS_AREA))blockers.push('No verified height domain.');
 if(H===60&&['inserted-plate','vertical-walls'].includes(h.typologyId)&&!h.heightRegions.some(r=>r.heightFeet===60&&r.fieldAreaFeet2>EPS_AREA))notes.push('This field has no 60-ft region. The supported native 60-ft configuration does not override local 40/20-ft caps; actual source and architectural meshes must pass every occupied-region height check.');
 return{ready:blockers.length===0,blockers,notes,architectureValidated:false,simultaneousGenerationEnabled:false,localHeightValidationRequired:true};
}
async function resolve(selection,options={}){
 assert(selection?.version===VERSION,'Unsupported site handoff version');assert(['linear-edge-gallery','inserted-plate','vertical-walls','room-within-volume','void-field'].includes(selection.typologyId),'Unknown typology');
 assert(['compact','broader','custom'].includes(selection.distribution),'Choose spatial distribution objective');finite(selection.setbackFeet,'Setback');assert(selection.setbackFeet>=0&&selection.setbackFeet<=100,'Setback out of range');
 const data=JSON.parse(fs.readFileSync(path.join(ROOT,'public/experiment-inputs/shared-site-rule-references-v1.json')));
 const {plan}=require('./shared-site-rules.cjs');const planOptions={...selection.planOptions,fieldModes:['none','none','none']};assert(!('manualHeightFeet' in planOptions));
 const proof=options.proof||await plan(planOptions,data); // Test-only proof injection never crosses the HTTP/generation interface.
 const t=proof.allocation.territories.find(t=>t.typology===selection.typologyId);assert(t,'No allocated territory for this typology');
 if(selection.source){assert.deepEqual(selection.source,{zoneId:proof.source.zoneId,fingerprint:proof.source.fingerprint,revision:proof.source.revision,polygonHash:proof.source.polygonHash,modelSha256:proof.source.modelSha256},'Stale handoff source');}
 const w=await wasm(),owned=[],own=v=>(owned.push(v),v),section=r=>own(r.length?new w.CrossSection(r,'NonZero'):w.CrossSection.union([]));
 try{const c=canonical(w,t.contours),territory=section(c.contours),permitted=own(territory.offset(-selection.setbackFeet,'Miter'));assert(!permitted.isEmpty(),'Setback consumes territory');
 const planningDiameterFeet=selection.planningDiameterFeet??20;finite(planningDiameterFeet,'Planning diameter');assert(planningDiameterFeet>=0&&planningDiameterFeet<=1000,'Planning diameter out of range');const planningDisk=own(permitted.offset(-planningDiameterFeet/2,'Round'));
 assert(selection.authenticParameters,'Authentic parameters required');const field=fieldGeometry(w,selection.field,c.contours),f=section(field),outside=own(f.subtract(permitted)).area(),heightRegions=proof.heightRegions.map(r=>{const clipped=own(section(r.contours).intersect(territory));return{...r,contours:canonical(w,clipped.toPolygons()).contours,areaFeet2:clipped.area(),fieldAreaFeet2:own(clipped.intersect(f)).area()};}).filter(r=>r.areaFeet2>EPS_AREA);
 const result={version:VERSION,typologyId:selection.typologyId,source:proof.source,sourceSite:data.site,zoneId:proof.source.zoneId,planOptions,proofHash:proof.proofHash,
 territory:{id:t.id,zoneId:proof.source.zoneId,typologyId:t.typology,sourceFingerprint:proof.source.fingerprint,sourceRevision:proof.source.revision,originalContours:t.contours,contours:c.contours,areaFeet2:territory.area(),allocationPercent:t.requestedPercent,canonicalization:c},
 organizingField:{version:FIELD_VERSION,spec:selection.field,contours:field,areaFeet2:f.area(),sourceIdentity:hash({source:proof.source.fingerprint,territory:t.id,spec:selection.field})},
 planningClearance:{diameterFeet:planningDiameterFeet,feasible:!planningDisk.isEmpty(),meaning:'Feasibility disk only, independent of boundary setback; zero explicitly disables this additional screen'},
 protections:{contours:proof.allocation.protected,setbackFeet:selection.setbackFeet,permittedContours:permitted.toPolygons()},heightRegions,requestedHeightFeet:selection.requestedHeightFeet??null,
 distribution:selection.distribution,authenticParameters:selection.authenticParameters,descriptorInfluences:{enabled:false,reserved:true},
 fieldValidation:{outsidePermittedFeet2:outside,utilizationPercent:100*f.area()/territory.area(),remainingTerritoryFeet2:own(territory.subtract(f)).area()},
 coordinatePolicy:'Site X/Z plan, Y up, confirmed feet, no source rescale; explicit source-base datum',heightPolicy:'Measured Roadways/Water distance regions; validate every occupied mesh against local caps',
 architectureGenerated:false};
 result.compatibility=compatibility(result);result.id=hash(result);return result;
 }finally{owned.reverse().forEach(v=>v.delete());}
}
function sourceMatches(h,site,zoneId){const zone=site?.zones.find(z=>z.id===zoneId);assert(zone&&zoneId===h.zoneId,'Handoff polygon unavailable');assert.equal(site.fingerprint,h.source.fingerprint,'Site source fingerprint changed');assert.equal(site.revision,h.source.revision,'Site source revision changed');assert.deepEqual(zone.polygon,h.source.polygon,'Original polygon coordinates differ');assert.deepEqual(site.coordinates,h.source.coordinates,'Source coordinate frame changed');for(const key of ['exclusions','reservedAreas','corridors'])assert.deepEqual(site[key]??[],h.sourceSite[key]??[],'Source protection changed: '+key);assert.deepEqual(zone.holes??[],h.sourceSite.zones.find(z=>z.id===zoneId).holes??[],'Source polygon holes changed');}
async function prepareTypologyInput(input,{allowBlocked=false,proof}={}){
 assert(input.siteHandoffSelection,'Explicit site handoff selection required');const h=await resolve(input.siteHandoffSelection,{proof});sourceMatches(h,input.site,input.zoneId);
 if(!allowBlocked)assert(h.compatibility.ready,h.compatibility.blockers.join(' '));
 assert.equal(input.adaptive?.typologyId,h.typologyId,'Selected typology differs from handoff');assert(!(input.reserved?.length),'Additional reserved regions require a reverified shared plan');
 const a=h.authenticParameters,F=h.organizingField.contours[0],H=h.requestedHeightFeet,field={kind:F&&rectangle(F)?'rectangle':'polygon',boundary:F},selection=input.siteHandoffSelection;
 const result={...input,siteHandoff:h,siteHandoffSelection:selection,seed:a.seed,datum:h.source.buildingBaseFeet,heading:selection.field.headingDegrees??0,development:{...input.development,ruleBasis:'polygon-site-v1',heightFeet:H,planningDiameterFeet:h.planningClearance.diameterFeet},
 adaptive:{...input.adaptive,allocationPercent:h.territory.allocationPercent,territory:{...h.territory,polygon:h.territory.contours[0]},heightFeet:H,setbackFeet:selection.setbackFeet,descriptorDistribution:false,descriptorSpatialTargeting:false},
 siteRulePlan:{source:{zoneId:h.zoneId,polygon:h.source.polygon,coordinates:h.source.coordinates},regions:h.heightRegions.map(r=>({id:r.id,role:({60:'street',40:'intermediate',20:'water'})[r.heightFeet],heightFeet:r.heightFeet,contours:r.contours}))}};
 result.nativeInputPreview={typologyId:h.typologyId,territory:h.territory,organizingField:h.organizingField,heightRegions:h.heightRegions,requestedHeightFeet:H,baseYFeet:h.source.buildingBaseFeet,authenticParameters:a,executable:h.compatibility.ready,blockers:h.compatibility.blockers};
 if(h.typologyId==='linear-edge-gallery'){result.galleryField={version:'linear-edge-gallery/site-field-handoff-v1',ruleA:'linear-gallery-automatic.cjs#arrangeMixed',ruleB:'source-linear-gallery.cjs#buildGallery → linear-gallery-print.cjs',organizingField:field,explicitPlacement:{strategy:'authentic-mixed-running-bond',center:selection.field.center,headingDegrees:selection.field.headingDegrees,nativeCapacityFeet:selection.field.shape==='rectangle'?{width:selection.field.widthFeet,depth:selection.field.depthFeet}:null,nativeInsetFeet:a.nativeInsetFeet??0},seed:a.seed,rotationSeed:a.rotationSeed,spacing:a.spacingFeet,heightFeet:H,executionBlocked:true};}
 if(h.typologyId==='inserted-plate'){result.recipe='edge-connected';result.plate={profile:a.profile,preferredFeet:a.preferredFeet,spacingFeet:a.spacingFeet,insetFeet:0,setbackFeet:selection.setbackFeet,polygonExtentFraction:a.extentFraction,organizingField:field};}
 if(h.typologyId==='vertical-walls'){result.recipe='vertical-walls';result.stepped={population:a.population,preferredFeet:a.preferredFeet,levels:a.levels,spacingFeet:a.spacingFeet,organizingField:field};}
 return result;
}
function clipY(r,ceiling,above){let out=[];for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],ia=above?a[1]>ceiling:a[1]<ceiling,ib=above?b[1]>ceiling:b[1]<ceiling;if(ia)out.push(a);if(ia!==ib){const t=(ceiling-a[1])/(b[1]-a[1]);out.push(a.map((v,j)=>v+t*(b[j]-v)));}}return out;}
function pointIn(p,rings){let inside=false,boundary=false;for(const r of rings){for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[j],b=r[i],dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(den||1)));if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)<1e-6)boundary=true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}}return inside||boundary;}
async function validateOccupiedGeometry(h,components,{throwOnFailure=true}={}){
 const w=await wasm(),owned=[],own=v=>(owned.push(v),v),section=r=>own(r.length?new w.CrossSection(r,'NonZero'):w.CrossSection.union([])),violations=[],ledger=[];assert(components.length,'No occupied geometry supplied');
 try{const permitted=section(h.protections.permittedContours),regions=h.heightRegions.map(r=>({...r,section:section(r.contours)})),base=h.source.buildingBaseFeet;
 for(const {id,mesh} of components){assert(mesh.positions.length%3===0&&mesh.indices.length%3===0&&mesh.positions.every(Number.isFinite)&&mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3),'Invalid mesh '+id);const before=hash(mesh),triangles=[];for(let i=0;i<mesh.indices.length;i+=3)triangles.push(mesh.indices.slice(i,i+3).map(k=>mesh.positions.slice(k*3,k*3+3)));
 const project=ts=>section(ts.map(r=>r.map(p=>[p[0],p[2]])).filter(r=>r.length>=3&&Math.abs(signed(r))>1e-12).map(r=>signed(r)<0?r.reverse():r));
 const footprint=project(triangles),outside=own(footprint.subtract(permitted)).area();let minY=Infinity,maxY=-Infinity;for(let k=1;k<mesh.positions.length;k+=3){minY=Math.min(minY,mesh.positions[k]);maxY=Math.max(maxY,mesh.positions[k]);}
 if(outside>EPS_AREA)violations.push({id,reason:'Occupied geometry outside territory, setback or protection',outsideFeet2:outside});if(minY<base-EPS_HEIGHT)violations.push({id,reason:'Occupied geometry below verified building base',minY,base});
 const local=[];for(const r of regions){const cap=base+r.heightFeet,excess=project(triangles.map(t=>clipY(t,cap+EPS_HEIGHT,true))),excessArea=own(excess.intersect(r.section)).area();let excessVertices=0;for(let k=0;k<mesh.positions.length;k+=3)if(mesh.positions[k+1]>cap+EPS_HEIGHT&&pointIn([mesh.positions[k],mesh.positions[k+2]],r.contours))excessVertices++;const occupied=own(footprint.intersect(r.section)).area();if(excessArea>EPS_AREA||excessVertices)violations.push({id,regionId:r.id,reason:'Occupied geometry exceeds local height cap',capY:cap,excessProjectedAreaFeet2:excessArea,excessVertices});local.push({regionId:r.id,capY:cap,occupiedAreaFeet2:occupied,excessProjectedAreaFeet2:excessArea});}
 const covered=own(w.CrossSection.union(regions.map(r=>r.section))),unassigned=own(footprint.subtract(covered)).area();if(unassigned>EPS_AREA)violations.push({id,reason:'Occupied geometry has unassigned height',unassignedFeet2:unassigned});assert.equal(hash(mesh),before,'Validation mutated saved mesh');ledger.push({id,minY,maxY,outsideFeet2:outside,regions:local});
 }const result={version:'occupied-site-envelope/v1',handoffId:h.id,passed:violations.length===0,violations,ledger,areaToleranceFeet2:EPS_AREA,heightToleranceFeet:EPS_HEIGHT,geometryModified:false,method:'Complete triangle projection and above-cap triangle clipping against each local height region; conservative boundary-vertex checks'};if(throwOnFailure)assert(result.passed,'Local site envelope rejected geometry: '+JSON.stringify(violations.slice(0,8)));return result;
 }finally{owned.reverse().forEach(v=>v.delete());}
}
module.exports={VERSION,FIELD_VERSION,resolve,prepareTypologyInput,validateOccupiedGeometry,canonicalRing,canonical,compatibility,sourceMatches,fieldGeometry,wasm,hash};
if(require.main===module){let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',()=>resolve(JSON.parse(raw)).then(h=>process.stdout.write(JSON.stringify(h))).catch(e=>{console.error(e.message);process.exitCode=1;}));}
