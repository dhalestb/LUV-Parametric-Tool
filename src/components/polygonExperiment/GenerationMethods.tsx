'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {descriptorNames,descriptorRegions,influenceVersion,type AreaShares,type Descriptor} from './descriptorInfluence';
import {newAssignment,type Experiment,type GenerationMethod,type Registry,type Typology} from './model';
import {defaults as territoryDefaults,geometryKernel,generateTerritories,currentTerritoryResult} from './territories';
import {applyStudyUnits} from './syncSiteFeet';
import {requestSiteWorker,WorkerAccess} from './workerClient';
import {readSiteRules} from './SiteRulePanel';
import {saveBrowserDesign,removeAllocatedArchitectures} from './browserDesigns';
import {saveDesignReference,saveDesignReferences} from './alternatives';
import {ensureSiteSelection,saveOrientation,removeAllocatedOrientations,type OrientationResult} from './orientationStore';
import {useSiteHandoff} from './siteHandoffStore';
import {generateAllocatedSite} from './allocatedDesign';
import {generateContinuousSite} from './continuousDesign';
import {compositionControls,validateAllocation} from './territories';
import {CompositionDistribution} from './SitePlan';
import {categoryByTypology,spaceCategories,type SpaceCategory} from './typologyCategories';
import DesignPanel from './DesignPanel';
import WorkflowAction,{reveal,type RunAction} from './WorkflowAction';
import cohort from './hybrid-cohort.json';
import styles from './workflow.module.css';

const methods = [
  {id:'typology-area',name:'Typology Area Distribution',label:'Allocate ground to typologies'},
  {id:'hybrid-rule',name:'Hybrid Rule Distribution',label:'Weight architectural rules'},
  {id:'descriptor',name:'Descriptor-Based Distribution',label:'Allocate ground to descriptors'},
] as const;
const supportedPair:Typology[]=['inserted-plate','vertical-walls'];
const defaultRules={...newAssignment().shares,'linear-edge-gallery':0,'inserted-plate':50,'vertical-walls':50};
const recovery=<a href="/experiment-recovery/index.html">Restore Miami Checkpoint</a>;
type Props={state:Experiment;registry:Registry;patch:(p:Partial<Experiment>)=>void;onSaved:(r:OrientationResult)=>void;
  controls:{seed:number;rotationSeed:number;spacing:number;heading:number;datum:number};openTerritories:()=>void;advanced:ReactNode};

export default function GenerationMethods({state,registry,patch,onSaved,controls,openTerritories,advanced}:Props) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const method=state.generation?.method??'typology-area',meta=methods.find(m=>m.id===method)!;
  const site=state.site,zone=site?.zones.find(z=>z.id===state.focus),zoneId=zone?.id;
  const draftKey=JSON.stringify([site?.fingerprint,zoneId]), zones=state.generation?.zones??{},draft=zones[draftKey]??{};
  type DraftValues=Partial<Record<GenerationMethod,Record<string,number>>>;
  const [category,setCategory]=useState<SpaceCategory|'all'>('all');
  const storageKey='luv-pending-generation-percentages-v1';
  const [pending,setPending]=useState<DraftValues>({});
  useEffect(()=>{try{setPending(JSON.parse(localStorage.getItem(storageKey)??'{}')??{});}catch{}},[]);
  function storePending(next:DraftValues){setPending(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{}}
  const rules=(!zone&&pending['hybrid-rule'])||draft.rules||defaultRules, areas:AreaShares=(!zone&&pending.descriptor)||draft.descriptors||{openVolume:100};
  const assignment=(zoneId&&state.assignments[zoneId])||newAssignment();
  const areaValues=(!zone&&pending['typology-area'])||assignment.shares;
  const territory=(zoneId&&state.territoryByZone[zoneId]?.controls)||territoryDefaults();
  const latest=useRef(state);
  latest.current=state;
  const [preparing,setPreparing]=useState(false),[planNotice,setPlanNotice]=useState('');
  useEffect(()=>{setMessage('');setPlanNotice('');},[site?.fingerprint,zoneId,method]);
  const enabledZones=site?.zones.filter(z=>z.enabled)??[];
  const preparationBlocker=!site?.protectionMetadataComplete?'Refresh the site polygons in Section 1 to load their protection geometry.':
    !enabledZones.length?'Enable a polygon in Site Development, then refresh the site polygons in Section 1.':'';
  const preparedCount=enabledZones.filter(z=>{
    const stored=state.territoryByZone[z.id],area=stored?.results.area;
    return site&&area&&currentTerritoryResult(site,z,state.assignments[z.id]??newAssignment(),stored.controls,area);
  }).length;
  async function prepareAreas(){
    if(!site||preparationBlocker||busy||preparing)return;
    setPreparing(true);setPlanNotice('');
    try{
      const kernel=await geometryKernel();
      if(latest.current!==state)throw Error('Site settings changed. Prepare territories again.');
      const next={...state.territoryByZone};
      for(const z of enabledZones){
        try{
          const c=compositionControls(next[z.id]?.controls);
          const area=generateTerritories(kernel,site,z,state.assignments[z.id]??newAssignment(),c,'area',registry);
          if(!area.metrics.valid)throw Error('Territory validation failed.');
          next[z.id]={controls:c,results:{...next[z.id]?.results,area}};
        }catch(e){throw Error(z.name+' · '+(e instanceof Error?e.message:String(e)));}
      }
      patch({territoryByZone:next});
    }catch(e){setPlanNotice(e instanceof Error?e.message:String(e));}finally{setPreparing(false);}
  }
  const handoff=useSiteHandoff();
  const rows=method==='descriptor'?Object.entries(descriptorNames).map(([id,name])=>({id,name,value:areas[id as Descriptor]??0,locked:false,category:undefined})):
    registry.items.filter(t=>method!=='hybrid-rule'||t.id!=='vertical-void-lobby').map(t=>({id:t.id,name:t.name,category:categoryByTypology[t.id],value:(method==='hybrid-rule'?rules:areaValues)[t.id]??0,
      locked:method==='typology-area'&&(territory.locked[t.id]||!territory.enabled[t.id])}));
  const total=rows.reduce((sum,r)=>sum+r.value,0),positive=rows.filter(r=>r.value>0);
  const summary=positive.map(r=>r.name+' '+r.value+'%').join(' · ')||'No allocation selected';
  const percentageError=rows.some(r=>!Number.isFinite(r.value)||r.value<0||r.value>100)?'Use a value from 0 to 100 for every percentage.':
    Math.abs(total-100)>1e-8?'Percentages total '+Number(total.toFixed(6))+'%. Adjust the allocation to reach 100%.':'';
  const handoffId=handoff.active?.id??'unavailable';
  const useFullZone=method!=='typology-area'&&draft.fullZone?.[method]===handoffId;
  function chooseDomain(full:boolean){
    if(method==='typology-area')return;
    setMessage('');
    patch({generation:{method,zones:{...zones,[draftKey]:{...draft,fullZone:{...draft.fullZone,[method]:full?handoffId:undefined}}}}});
  }
  const originalMiami=site?.fingerprint==='662e7000dd4f4982c7205c443e24fb3dc05aca1fa7a77d1e910933c9b38bb637';
  const supportedSite=originalMiami&&zoneId==='zone-1-1210';
  const unsupported=method==='hybrid-rule'?positive.filter(r=>!supportedPair.includes(r.id as Typology)):[];
  let scoreError='',regions:ReturnType<typeof descriptorRegions>=[];
  if(method==='descriptor'&&!percentageError)try{regions=descriptorRegions(areas);}catch(e){scoreError=String(e);}
  function selectMethod(next:GenerationMethod){
    setMessage('');patch({generation:{method:next,zones}});
    const url=new URL(location.href);url.searchParams.set('method',next);history.replaceState(history.state,'',url);
  }
  function editLetterTarget(typology:Typology,count?:number){
    const letterTargets={...draft.letterTargets};
    if(count===undefined)delete letterTargets[typology];
    else letterTargets[typology]=count;
    patch({generation:{method,zones:{...zones,[draftKey]:{...draft,letterTargets}}}});
    setMessage('');
  }
  function edit(id:string,n:number){
    setMessage('');
    if(!zone){storePending({...pending,[method]:{...Object.fromEntries(rows.map(r=>[r.id,r.value])),[id]:n}});return;}
    if(method==='typology-area'&&zoneId)patch({assignments:{...state.assignments,[zoneId]:{...assignment,shares:{...assignment.shares,[id]:n}}}});
    else patch({generation:{method,zones:{...zones,[draftKey]:method==='descriptor'?{...draft,descriptors:{...areas,[id]:n}}:{...draft,rules:{...rules,[id]:n}}}}});
  }
  const [confirming,setConfirming]=useState(false),[unitError,setUnitError]=useState('');
  async function confirmStudyUnits(){
    if(!site||confirming)return;
    setConfirming(true);setUnitError('');
    try{
      const next=await applyStudyUnits(state,registry,site);
      if(latest.current!==state)throw Error('The study changed. Review the current units and confirm again.');
      patch(next);
    }catch(e){setUnitError(e instanceof Error?e.message:String(e));}finally{setConfirming(false);}
  }
  let reason='',fix:ReactNode=null,setup=false;
  if(!site||!zone){reason='Select a site and polygon before generating.';fix=recovery;}
  else if(!zone.enabled){reason='This polygon is disabled in the site project.';fix=<button onClick={()=>reveal('select-site')}>Select another polygon</button>;}
  else if(!state.unitsConfirmed||site.coordinates.unitAssumption!=='confirmed'){
    reason='Confirm the model units for this study before generating.';setup=true;
    fix=<><p>Imported units are {site.coordinates.unit}. One model unit equals {Number(site.coordinates.feetPerModel.toPrecision(7))} ft. Prepared polygons use site feet.</p>
      <button disabled={confirming} onClick={confirmStudyUnits}>{confirming?'Checking territories…':'Confirm '+site.coordinates.unit+' for this study'}</button>
      <a href="/site-development">Change source units in Site Development</a>{unitError&&<p role="alert">{unitError}</p>}</>;
  }else if(!site.protectionMetadataComplete){
    reason='Refresh the site polygons to import their protection geometry.';
    fix=<button onClick={()=>reveal('select-site')}>Review site input</button>;
  }else if(percentageError){reason=percentageError;fix=<button onClick={()=>reveal('allocation-inputs')}>Edit percentages</button>;}
  else if(unsupported.length||(method==='hybrid-rule'&&positive.length!==2)){
    reason=unsupported.length?'Rule connections are unverified for '+unsupported.map(r=>r.name).join(', ')+'.':'Both Plate and Stepped require positive influence.';
    fix=<button onClick={()=>{setMessage('');patch({generation:{method,zones:{...zones,[draftKey]:{...draft,rules:defaultRules}}}});}}>Use verified 50% Plate / 50% Stepped</button>;
  }else if(method!=='typology-area'&&!supportedSite){
    reason='This rule relationship is verified for the original Miami Cluster Zone 1 geometry. Use Typology Area Distribution on a newly drawn polygon.';
    fix=originalMiami?<button onClick={()=>patch({focus:'zone-1-1210'})}>Select Miami Cluster Zone 1</button>:<button onClick={()=>selectMethod('typology-area')}>Use Typology Area Distribution</button>;
  }else if(method!=='typology-area'&&handoff.enabled&&!useFullZone){
    reason='An independent site handoff is applied. This method requires the full selected polygon.';
    fix=<button onClick={()=>chooseDomain(true)}>Use full polygon for this method</button>;
  }else if(scoreError){reason=scoreError;fix=<button onClick={()=>reveal('allocation-inputs')}>Review descriptor shares</button>;}
  else if(method==='typology-area'&&positive.some(r=>!territory.enabled[r.id as Typology])){
    reason='A disabled typology has a positive territory share.';fix=<button onClick={openTerritories}>Edit territory constraints</button>;
  }
  async function generate(){
    if(!site||!zoneId||busy||reason)return;
    setBusy(true);setMessage('Generating and replaying architectural geometry…');
    try{
      const clearance=Math.max(territory.minimumDiameter['vertical-walls'],territory.minimumDiameter['inserted-plate']);
      const request={generationMethod:method,domain:'selected-zone',site,zoneId,siteRulePlan:readSiteRules(site,zoneId),reserved:territory.reserved,planningDiameterFeet:clearance,
        ...(method==='descriptor'?{descriptorAreas:areas}:{ruleInfluence:{version:influenceVersion,platePercent:rules['inserted-plate'],steppedPercent:rules['vertical-walls']}})};
      const response=await requestSiteWorker('/experiment/site-polygon-morphogenesis/design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      const result=await response.json();
      if(!response.ok||result.status!=='complete'||!result.replay?.matched)throw Error(result.error||'Replay or formation failed');
      ensureSiteSelection();await saveBrowserDesign(result.orientation,result.architecture,result.payload);
      await saveOrientation(result.orientation);saveDesignReference(result);onSaved(result.orientation);
      setMessage('Saved alternative · '+result.orientation.components.length+' letters · '+result.architecture.components+' components · replay matched.');
    }catch(e){setMessage('Generation blocked. '+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}
  }
  const inFlight=useRef(false);
  let allocationBlocker=site?preparationBlocker:'Select a site before generating.';
  if(!allocationBlocker){
    for(const z of enabledZones){
      try{validateAllocation(state.assignments[z.id]??newAssignment(),state.territoryByZone[z.id]?.controls??territoryDefaults());}
      catch(e){allocationBlocker=z.name+' · '+(e instanceof Error?e.message:String(e));break;}
    }
  }
  async function generateAll(nativeStudies=false){
    if(allocationBlocker||inFlight.current||busy||preparing)return;
    inFlight.current=true;setBusy(true);setMessage('Preparing site territories…');
    try{
      const generator=nativeStudies?generateAllocatedSite:generateContinuousSite;
      const batch=await generator(state,registry,readSiteRules,setMessage);
      const ids=batch.records.map(record=>record.orientation.id);
      const assertCurrent=()=>{if(latest.current!==state)throw Error('The site or allocations changed during generation. Run again with the current settings.');};
      assertCurrent();
      try{
        ensureSiteSelection();
        for(const {orientation,architecture} of batch.records){
          await saveBrowserDesign(orientation,architecture,{architecture});
          await saveOrientation(orientation);
        }
        assertCurrent();
        saveDesignReferences(batch.records.map(record=>({...record,status:'complete'})));
      }catch(e){
        await Promise.all([removeAllocatedArchitectures(ids),removeAllocatedOrientations(ids)]);
        throw e;
      }
      patch({territoryByZone:batch.territoryByZone});
      for(const record of batch.records)onSaved(record.orientation);
      const count=batch.records.reduce((n,r)=>n+r.architecture.provenance.members.length,0);
      setMessage('Generated '+count+(nativeStudies?' typology placements across ':' typology compositions across ')+ids.length+' polygon'+(ids.length===1?'':'s')+'.');
      document.getElementById('combined-site-plan')?.scrollIntoView({block:'start'});
    }catch(e){setMessage('Generation blocked. '+(e instanceof Error?e.message:String(e))+' This run produced no new saved design.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  function percentageField(r:typeof rows[number]) {
    return <label key={r.id}>{r.name}<span><input aria-label={r.name+' percentage'} type="number" min="0" max="100" step="any" onFocus={e=>e.currentTarget.select()} value={r.value} disabled={r.locked} onChange={e=>edit(r.id,Number(e.target.value))}/><b>%</b></span>{r.locked&&<em>Locked or disabled</em>}</label>;
  }
  const action=(a:RunAction)=><WorkflowAction action={{...a,reason:reason||a.reason,fix:reason?fix:a.fix,setup:reason?setup:a.setup}}
    site={zone?site!.name+' / '+zone.name:'No site selected'} method={meta.name} allocation={summary}/>;
  return <>
    <section className={styles.methods} id="site-generation-methods" aria-labelledby="method-heading">
      <h2 id="method-heading"><small>02</small> Choose Generation Method</h2>
      <div className={styles.methodGrid} role="group" aria-label="Generation method">{methods.map((m,i)=><button type="button" key={m.id} className={styles.method} disabled={busy} aria-pressed={method===m.id} onClick={()=>selectMethod(m.id)}>
        <span>Method {i+1}</span><strong>{m.name}</strong><em>{m.label}</em></button>)}</div>
      {site&&site.zones.length>1&&<div className={styles.zoneTabs} role="group" aria-label="Edit polygon allocation">{site.zones.map(z=><button key={z.id} disabled={busy||preparing} aria-pressed={z.id===zoneId} onClick={()=>patch({focus:z.id})}>{z.name}</button>)}</div>}
      <fieldset className={styles.inputs} id="allocation-inputs" disabled={busy}>
        <legend>{method==='hybrid-rule'?'Architectural rule influence':method==='typology-area'?'Polygon area by typology':'Polygon area by descriptor'}{zone&&' · '+zone.name}</legend>
        {method==='typology-area'?<>
          <label className={styles.categoryFilter}>Space category
            <select value={category} onChange={e=>setCategory(e.currentTarget.value as SpaceCategory|'all')}>
              <option value="all">All categories</option>
              {spaceCategories.map(name=><option key={name}>{name}</option>)}
            </select>
          </label>
          {spaceCategories.filter(name=>category==='all'||category===name).map(name=>{
            const members=rows.filter(row=>row.category===name);
            if(!members.length) return category==='all'?null:<p key={name}>No typologies available in {name} yet.</p>;
            const share=members.reduce((sum,row)=>sum+row.value,0);
            return <fieldset className={styles.categoryGroup} key={name}>
              <legend>{name} <span>· {Number(share.toFixed(6))}%</span></legend>
              <div className={styles.fields}>{members.map(percentageField)}</div>
            </fieldset>;
          })}
        </>:<div className={styles.fields}>{rows.map(percentageField)}</div>}
      </fieldset>
      {method==='typology-area'&&site&&zone&&<CompositionDistribution key={draftKey} site={site} zone={zone} assignment={assignment} controls={territory}
        registry={registry} category={category} letterTargets={draft.letterTargets} onLetterTarget={editLetterTarget} disabled={busy||preparing}>
        <div className={styles.clustering}>
        <label htmlFor="composition-clustering">Typology clustering · {zone.name}</label>
        <output htmlFor="composition-clustering">{territory.clustering??65}%</output>
        <input id="composition-clustering" type="range" min="0" max="100" step="1"
          value={territory.clustering??65} disabled={busy||preparing} onChange={e=>{
            const c={...territory,clustering:Number(e.currentTarget.value)};
            patch({territoryByZone:{...state.territoryByZone,[zone.id]:{controls:c,results:state.territoryByZone[zone.id]?.results??{}}}});
            setPlanNotice('');setMessage('');
          }}/>
        <span>Dispersed</span><span>Clustered</span>
      </div></CompositionDistribution>}
      {!zone&&<p>Set your percentages now. Select a polygon to apply them and generate.</p>}
      {zone&&pending[method]&&<button className={styles.textButton} disabled={busy} onClick={()=>{
        const values=Object.fromEntries(rows.map(r=>[r.id,r.locked?r.value:pending[method]?.[r.id]??r.value]));
        if(method==='typology-area')patch({assignments:{...state.assignments,[zone.id]:{...assignment,shares:values as typeof assignment.shares}}});
        else patch({generation:{method,zones:{...zones,[draftKey]:method==='descriptor'?{...draft,descriptors:values}:{...draft,rules:values as typeof assignment.shares}}}});
        const next={...pending};delete next[method];storePending(next);setMessage('');
      }}>Apply draft percentages to this polygon</button>}
      <div className={styles.total}><b data-valid={!percentageError}>Total {Number(total.toFixed(6))}% / 100%</b><span>{method==='typology-area'?'Total across all space categories, including open court floors and terraces.':'Building footprint coverage is measured after generation.'}</span></div>
      {method==='typology-area'&&site&&<div className={styles.zoneTabs}><button type="button" onClick={prepareAreas} aria-describedby="territory-preparation-status" disabled={busy||preparing||!!preparationBlocker}>{preparing?'Preparing territories…':'Prepare site territories'}</button><a href="#combined-site-plan">View site plan</a></div>}
      {method==='typology-area'&&site&&<p role="status" id="territory-preparation-status">{planNotice||preparationBlocker||(
        preparedCount===enabledZones.length?'Territories prepared. View the site plan or prepare again after editing percentages.':
        preparedCount>0?preparedCount+' of '+enabledZones.length+' polygons have current territories. Prepare again to update the site plan.':
        'Generate Design prepares territories automatically. Use Prepare site territories to preview the allocation.'
      )}</p>}
      {method==='typology-area'&&<button className={styles.textButton} onClick={openTerritories}>Territory allocation &amp; constraints ↗</button>}
      {method==='hybrid-rule'&&<p className={styles.note}>Verified pair · Inserted Horizontal Plate guides native Stepped Rule A placement. Stepped Rule B forms the architecture. Other rule connections await validation.</p>}
      {method==='descriptor'&&<div className={styles.scorePanel}><strong>Verified typology contributions</strong>
        {regions.map(r=><p key={r.descriptor}>{descriptorNames[r.descriptor]} <b>Plate {r.platePercent.toFixed(2)}%</b> · Stepped {r.steppedPercent.toFixed(2)}%</p>)}
        {!regions.length&&<p>{scoreError||'Complete a 100% allocation to calculate contributions.'}</p>}
        <details><summary>Evaluations scores and eligibility</summary>{regions.map(r=><p key={r.descriptor}>{descriptorNames[r.descriptor]} · {r.evaluationVersion} · {r.ratings.map(x=>(x.typology==='vertical-walls'?'Stepped':'Plate')+' '+x.score.toFixed(2)).join(' / ')}</p>)}</details><p>Comparable scores are unavailable for Gallery, Room Within Volume and Void Field.</p></div>}
    </section>
    {method==='typology-area'?<>
      <WorkflowAction local site={site?.name??'No site selected'} method="Continuous typology composition"
        allocation={<><span>Forms connected galleries, decks, terraces, rooms and courts across the enabled polygons.</span>{enabledZones.map(z=><span key={z.id} style={{display:'block'}}><strong>{z.name}</strong>{' · '+registry.items.filter(t=>(state.assignments[z.id]??newAssignment()).shares[t.id]>0).map(t=>t.name+' '+(state.assignments[z.id]??newAssignment()).shares[t.id]+'%').join(' · ')}</span>)}</>}
        action={{run:()=>generateAll(),busy:busy||preparing,reason:allocationBlocker,message,fix:!site?recovery:undefined}}/>
      <details className={styles.advanced}><summary>Generate a single typology with custom settings</summary>
        <DesignPanel state={state} controls={controls} onSaved={onSaved} onBusy={setBusy} commonBlocked={!!reason||busy} openTerritories={openTerritories}
          renderAction={a=><div><p>{reason||a.reason||a.target}</p>{reason?fix:a.fix&&a.reason?a.fix:null}
            <button disabled={busy||!!reason||!!a.reason} onClick={a.run}>Generate single typology</button>
            {a.message&&<p role="status">{a.message}</p>}<WorkerAccess/></div>}/>
      </details>
    </>:action({run:generate,busy,message,eligible:method==='descriptor'?'Inserted Horizontal Plate and Stepped Amphitheater':undefined,correction:<button onClick={()=>reveal('allocation-inputs')}>Edit percentages</button>})}
    <details className={styles.advanced}><summary>Advanced generation settings</summary>{advanced}
      {method==='typology-area'&&<button disabled={busy||preparing||!!allocationBlocker} onClick={()=>generateAll(true)}>Generate individual native study placements</button>}
      {method!=='typology-area'&&<p>Miami Cluster Zone 1 uses the Roadways/Water 60/40/20-ft height regions. Plate seed 39 supplies stations for the three native lifts of Stepped seed 69. Within-lift spacing and orientation are preserved. The planning clearance is {Math.max(territory.minimumDiameter['vertical-walls'],territory.minimumDiameter['inserted-plate'])} ft in diameter.</p>}
      {method==='descriptor'&&<p>Evaluations {cohort.version} measures the two independent Rule B studies with {cohort.forms[0].cellFeet}-ft voxels. A sweep along the site X axis allocates the requested areas. A lift receives its rule weights from its source-letter footprint in each region. Every selected region requires native source geometry.</p>}{method!=='typology-area'&&handoff.enabled&&<label><input type="checkbox" checked={useFullZone} onChange={e=>chooseDomain(e.target.checked)}/> Use the full polygon for {meta.name}</label>}</details>
  </>;
}
