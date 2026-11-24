const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execute}=require('./adaptive-orientation.cjs'),{buildArchitecture}=require('./design-rule-b.cjs'),{hash}=require('./polygon-orientation.cjs');
async function generateDesign(input){
 if(input.siteHandoff&&!input.siteHandoffSelection)throw Error('Site handoff must be resolved by the server from an explicit selection');
 if(input.siteHandoffSelection)input=await require('./site-typology-handoff.cjs').prepareTypologyInput(input);
 if(input.adaptive?.typologyId==='vertical-walls')return require('./stepped-design.cjs').generateSteppedDesign(input);
 if(input.adaptive?.typologyId==='inserted-plate')return require('./inserted-plate-design.cjs').generatePlateDesign(input);
 if(input.development?.ruleBasis!=='historical-study'){
  const plan=await require('./site-rule-contract.cjs').planSiteRules({...input,allocationPercent:input.adaptive?.allocationPercent??100,territory:input.adaptive?.territory,heightRegions:input.siteRulePlan?.regions??[],heightSource:input.siteRulePlan?.source});
  if(plan.blockers.length)throw Error(plan.blockers.join(' '));
  throw Error('AUTHENTIC_POLYGON_ADAPTER_REQUIRED: site rules validated, but the original Print-Contour A/B still assume four sides. No perimeter-ring or rectangular substitute generated.');
 }
 const d=input.development;if(!d||!['compact','distributed-connected','perimeter-oriented'].includes(d.distribution))throw Error('Select a supported spatial-domain strategy');
 if(!Number.isFinite(d.targetBuildingCoveragePercent)||d.targetBuildingCoveragePercent<=0||d.targetBuildingCoveragePercent>100||!Number.isFinite(d.spatialExtentPercent)||d.spatialExtentPercent<=0||d.spatialExtentPercent>100)throw Error('Invalid independent coverage or spatial-extent control');
 if(!Number.isFinite(d.planningDiameterFeet)||d.planningDiameterFeet<0)throw Error('Invalid planning diameter');
 if(!Number.isFinite(d.nativeFieldInsetFeet)||d.nativeFieldInsetFeet<0||d.nativeFieldInsetFeet>5)throw Error('Native field inset must be between 0 and 5 feet');
 const adaptive={...input.adaptive,coveragePercent:d.targetBuildingCoveragePercent,organizingFieldBudgetPercent:d.spatialExtentPercent};
 const a=await execute({...input,adaptive,nativeOptions:{fieldInsetFeet:d.nativeFieldInsetFeet}});
 const w=await require('manifold-3d/manifold.js').default();w.setup();const ring=a.adaptive.region.polygon,section=new w.CrossSection([ring]),test=section.offset(-d.planningDiameterFeet/2,'Round');const feasible=!test.isEmpty();test.delete();section.delete();if(!feasible)throw Error('Region fails the existing planning-clearance disk-diameter screen; this is not a boundary setback.');
 const runId=crypto.randomUUID(),generationId=a.id;a.id=hash({generationId,runId});a.development={...d,runId,generationId,createdAt:new Date().toISOString(),planningDiameterMeaning:'Feasibility disk diameter only; zero disables the extra screen in Generate Design. Existing Territory Studio positive-diameter validation is unchanged. Not a boundary setback',distributionMeaning:'Experimental domain-search policy around unchanged native field-perimeter rules; not a new architectural rule'};
 const root=process.cwd(),out=path.join(root,'public/experiment-designs',runId);fs.mkdirSync(out,{recursive:true});const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value),{flag:'wx'});write('rule-a.json',a);const exact=hash(a);
 let response;try{const b=await buildArchitecture(a,{reserved:input.reserved??[],targetCoveragePercent:d.targetBuildingCoveragePercent},path.join(out,'rule-b'));if(hash(a)!==exact)throw Error('Rule B mutated the saved Rule A record');const dest=path.join(root,'public/experiment-architecture');fs.mkdirSync(dest,{recursive:true});const filename=b.id+'.json',target=path.join(dest,filename);if(fs.existsSync(target)){if(hash(fs.readFileSync(target))!==hash(JSON.stringify(b)))throw Error('Immutable architecture conflict');}else fs.writeFileSync(target,JSON.stringify(b),{flag:'wx'});const url='/experiment-architecture/'+filename;fs.writeFileSync(path.join(dest,a.id+'.manifest.json'),JSON.stringify({id:b.id,parentOrientationId:a.id,url}),{flag:'wx'});response={status:'complete',runId,orientation:a,architecture:{id:b.id,url,geometryHash:b.geometryHash,components:b.components.length,measurements:b.measurements,validation:b.validation},recoveryUrl:'/experiment-designs/'+runId+'/response.json'};}catch(e){response={status:'rule-a-only',runId,orientation:a,error:{stage:'Rule B',message:e.message},recoveryUrl:'/experiment-designs/'+runId+'/response.json'};}
 write('response.json',response);return response;
}
module.exports={generateDesign};if(require.main===module){let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',async()=>{try{process.stdout.write(JSON.stringify(await generateDesign(JSON.parse(raw))));}catch(e){process.stderr.write(e.message);process.exitCode=1;}});}


