'use client';

import {useState,type ReactNode} from 'react';
import {descriptorNames,descriptorRegions,influenceVersion,type AreaShares,type Descriptor} from './descriptorInfluence';
import {newAssignment,type Experiment,type GenerationMethod,type Registry,type Typology} from './model';
import {defaults as territoryDefaults} from './territories';
import {requestSiteWorker} from './workerClient';
import {readSiteRules} from './SiteRulePanel';
import {saveBrowserDesign} from './browserDesigns';
import {saveDesignReference} from './alternatives';
import {ensureSiteSelection,saveOrientation,type OrientationResult} from './orientationStore';
import {useSiteHandoff} from './siteHandoffStore';
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
  const rules=draft.rules??defaultRules, areas:AreaShares=draft.descriptors??{openVolume:100};
  const assignment=(zoneId&&state.assignments[zoneId])||newAssignment();
  const territory=(zoneId&&state.territoryByZone[zoneId]?.controls)||territoryDefaults();
  const handoff=useSiteHandoff();
  const rows=method==='descriptor'?Object.entries(descriptorNames).map(([id,name])=>({id,name,value:areas[id as Descriptor]??0,locked:false})):
    registry.items.map(t=>({id:t.id,name:t.name,value:(method==='hybrid-rule'?rules:assignment.shares)[t.id],
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
  const supportedSite=site?.fingerprint==='662e7000dd4f4982c7205c443e24fb3dc05aca1fa7a77d1e910933c9b38bb637'&&zoneId==='zone-1-1210';
  const unsupported=method==='hybrid-rule'?positive.filter(r=>!supportedPair.includes(r.id as Typology)):[];
  let scoreError='',regions:ReturnType<typeof descriptorRegions>=[];
  if(method==='descriptor'&&!percentageError)try{regions=descriptorRegions(areas);}catch(e){scoreError=String(e);}
  function selectMethod(next:GenerationMethod){
    setMessage('');patch({generation:{method:next,zones}});
    const url=new URL(location.href);url.searchParams.set('method',next);history.replaceState(history.state,'',url);
  }
  function edit(id:string,n:number){
    setMessage('');
    if(method==='typology-area'&&zoneId)patch({assignments:{...state.assignments,[zoneId]:{...assignment,shares:{...assignment.shares,[id]:n}}}});
    else patch({generation:{method,zones:{...zones,[draftKey]:method==='descriptor'?{...draft,descriptors:{...areas,[id]:n}}:{...draft,rules:{...rules,[id]:n}}}}});
  }
  let reason='',fix:ReactNode=null;
  if(!site||!zone){reason='Select a site and polygon before generating.';fix=recovery;}
  else if(!zone.enabled){reason='This polygon is disabled in the site project.';fix=<button onClick={()=>reveal('select-site')}>Select another polygon</button>;}
  else if(!state.unitsConfirmed||site.coordinates.unitAssumption!=='confirmed'||!site.protectionMetadataComplete){
    reason='Confirmed site units and complete protection geometry are required.';
    fix=<button onClick={()=>reveal('select-site')}>Review site input</button>;
  }else if(percentageError){reason=percentageError;fix=<button onClick={()=>reveal('allocation-inputs')}>Edit percentages</button>;}
  else if(unsupported.length||(method==='hybrid-rule'&&positive.length!==2)){
    reason=unsupported.length?'Rule connections are unverified for '+unsupported.map(r=>r.name).join(', ')+'.':'Both Plate and Stepped require positive influence.';
    fix=<button onClick={()=>{setMessage('');patch({generation:{method,zones:{...zones,[draftKey]:{...draft,rules:defaultRules}}}});}}>Use verified 50% Plate / 50% Stepped</button>;
  }else if(method!=='typology-area'&&!supportedSite){
    reason='This rule relationship is verified in Miami Cluster Zone 1.';
    fix=site.zones.some(z=>z.id==='zone-1-1210')?<button onClick={()=>patch({focus:'zone-1-1210'})}>Select Miami Cluster Zone 1</button>:recovery;
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
  const action=(a:RunAction)=><WorkflowAction action={{...a,reason:reason||a.reason,fix:reason?fix:a.fix}}
    site={zone?site!.name+' / '+zone.name:'No site selected'} method={meta.name} allocation={summary}/>;
  return <>
    <section className={styles.methods} id="site-generation-methods" aria-labelledby="method-heading">
      <h2 id="method-heading"><small>02</small> Choose Generation Method</h2>
      <div className={styles.methodGrid} role="group" aria-label="Generation method">{methods.map((m,i)=><button type="button" key={m.id} className={styles.method} disabled={busy} aria-pressed={method===m.id} onClick={()=>selectMethod(m.id)}>
        <span>Method {i+1}</span><strong>{m.name}</strong><em>{m.label}</em></button>)}</div>
      <fieldset className={styles.inputs} id="allocation-inputs" disabled={busy||!zone}>
        <legend>{method==='hybrid-rule'?'Architectural rule influence':method==='typology-area'?'Polygon area by typology':'Polygon area by descriptor'}</legend>
        <div className={styles.fields}>{rows.map(r=><label key={r.id}>{r.name}<span><input aria-label={r.name+' percentage'} type="number" min="0" max="100" step="any" value={r.value} disabled={r.locked} onChange={e=>edit(r.id,Number(e.target.value))}/><b>%</b></span>{r.locked&&<em>Locked or disabled</em>}</label>)}</div>
      </fieldset>
      <div className={styles.total}><b data-valid={!percentageError}>Total {Number(total.toFixed(6))}% / 100%</b><span>Building footprint coverage is measured after generation.</span></div>
      {method==='typology-area'&&<button className={styles.textButton} onClick={openTerritories}>Territory allocation &amp; constraints ↗</button>}
      {method==='hybrid-rule'&&<p className={styles.note}>Verified pair · Inserted Horizontal Plate guides native Stepped Rule A placement. Stepped Rule B forms the architecture. Other rule connections await validation.</p>}
      {method==='descriptor'&&<div className={styles.scorePanel}><strong>Verified typology contributions</strong>
        {regions.map(r=><p key={r.descriptor}>{descriptorNames[r.descriptor]} <b>Plate {r.platePercent.toFixed(2)}%</b> · Stepped {r.steppedPercent.toFixed(2)}%</p>)}
        {!regions.length&&<p>{scoreError||'Complete a 100% allocation to calculate contributions.'}</p>}
        <details><summary>Evaluations scores and eligibility</summary>{regions.map(r=><p key={r.descriptor}>{descriptorNames[r.descriptor]} · {r.evaluationVersion} · {r.ratings.map(x=>(x.typology==='vertical-walls'?'Stepped':'Plate')+' '+x.score.toFixed(2)).join(' / ')}</p>)}</details><p>Comparable scores are unavailable for Gallery, Room Within Volume and Void Field.</p></div>}
    </section>
    {method==='typology-area'?<DesignPanel state={state} controls={controls} onSaved={onSaved} onBusy={setBusy} renderAction={action} commonBlocked={!!reason} openTerritories={openTerritories}/>:action({run:generate,busy,message,eligible:method==='descriptor'?'Inserted Horizontal Plate and Stepped Amphitheater':undefined,correction:<button onClick={()=>reveal('allocation-inputs')}>Edit percentages</button>})}
    <details className={styles.advanced}><summary>Advanced generation settings</summary>{advanced}
      {method!=='typology-area'&&<p>Miami Cluster Zone 1 uses the Roadways/Water 60/40/20-ft height regions. Plate seed 39 supplies stations for the three native lifts of Stepped seed 69. Within-lift spacing and orientation are preserved. The planning clearance is {Math.max(territory.minimumDiameter['vertical-walls'],territory.minimumDiameter['inserted-plate'])} ft in diameter.</p>}
      {method==='descriptor'&&<p>Evaluations {cohort.version} measures the two independent Rule B studies with {cohort.forms[0].cellFeet}-ft voxels. A sweep along the site X axis allocates the requested areas. A lift receives its rule weights from its source-letter footprint in each region. Every selected region requires native source geometry.</p>}{method!=='typology-area'&&handoff.enabled&&<label><input type="checkbox" checked={useFullZone} onChange={e=>chooseDomain(e.target.checked)}/> Use the full polygon for {meta.name}</label>}</details>
  </>;
}
