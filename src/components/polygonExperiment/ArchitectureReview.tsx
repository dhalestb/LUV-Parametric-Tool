'use client';

import dynamic from 'next/dynamic';
import {useEffect,useState,type ReactNode} from 'react';
import {architectureObj,objName} from './architectureObj';
import {downloadDesignFile} from './browserDesigns';
import {ArchitectureControls,loadSavedArchitecture,useArchitecture} from './ArchitectureLayer';
import {DISPLAY_MODE_KEY,DisplayModeSelector,setDisplayMode,readDisplayMode} from './architecturalDisplay';
import {readLibrary,writeLibrary,saveDesignReference,publishDesign,type DesignReference} from './alternatives';
import {readOrientation,saveOrientation,writeSiteSelection,selectionDefault,type OrientationResult,type OrientationSelection} from './orientationStore';
import cohort from './hybrid-cohort.json';
import type {Experiment,Registry} from './model';
import SitePlan from './SitePlan';
import ArchitecturePresentation,{boardLabels,renderStudyBoard} from './ArchitecturePresentation';
import styles from './workflow.module.css';

const CombinedArchitecture=dynamic(()=>import('./CombinedArchitecture'),{ssr:false});
const OrientationView=dynamic(()=>import('./OrientationView'),{ssr:false});
const references=[
  {id:'miami-plate-stepped-v1',name:'Plate-influenced Stepped Amphitheater · 50% Plate / 50% Stepped'},
  {id:cohort.forms[0].study,name:'Independent Stepped Amphitheater'},
  {id:cohort.forms[1].study,name:'Independent Inserted Horizontal Plate'}
];
type Props={state:Experiment;registry:Registry;results:OrientationResult[];selected?:OrientationResult;view:OrientationSelection;reference:string;
  setReference:(id:string)=>void;select:(id:string|null)=>void;onSaved:(r:OrientationResult)=>void;children:ReactNode;renderMethods:(presentationExport:ReactNode)=>ReactNode};

export default function ArchitectureReview({state,registry,results,selected,view,reference,setReference,select,onSaved,children,renderMethods}:Props){
  const [referenceView,setReferenceView]=useState(selectionDefault);
  const [loaded,setLoaded]=useState<{id:string;record:OrientationResult}>(),[notice,setNotice]=useState('');
  const [library,setLibrary]=useState<DesignReference[]>([]),[name,setName]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{const sync=()=>setLibrary(readLibrary().designs??[]);sync();window.addEventListener('polygon-alternatives',sync);window.addEventListener('storage',sync);
    return()=>{window.removeEventListener('polygon-alternatives',sync);window.removeEventListener('storage',sync);};},[]);
  useEffect(()=>{
    const abort=new AbortController();setLoaded(undefined);setNotice('');
    if(reference)fetch('/experiment-designs/'+reference+'/rule-a.json',{signal:abort.signal})
      .then(r=>{if(!r.ok)throw Error('The reference study is unavailable.');return r.json();})
      .then(record=>{if(!abort.signal.aborted)setLoaded({id:reference,record});})
      .catch(e=>{if(!abort.signal.aborted)setNotice(String(e));});
    return()=>abort.abort();
  },[reference]);
  const record=reference?(loaded?.id===reference?loaded.record:undefined):selected;
  const {result,error,loading}=useArchitecture(record),saved=library.find(r=>r.id===record?.id);
  const title=result?.typologyName??record?.typologyName??'Linear Edge Gallery';
  useEffect(()=>{setName(saved?.name??(record?record.typologyName??record.parameters.recipe:''));},[record,saved?.name]);
  function choose(value:string){
    const ref=references.find(s=>'ref/'+s.id===value);setNotice('');setReference(ref?.id??'');
    if(!ref)select(value||null);
    const url=new URL(location.href);if(ref){url.searchParams.set('compare','1');url.searchParams.set('study',ref.id);}else{url.searchParams.delete('compare');url.searchParams.delete('study');}
    history.replaceState(history.state,'',url);
  }
  async function save(){
    if(!record||!result||saving)return;setSaving(true);
    try{
      const old=await readOrientation(record.id);
      if(old&&old.geometryHash!==record.geometryHash)throw Error('Saved source geometry differs from the selected study.');
      if(!old)await saveOrientation(record);
      if(!readLibrary().designs?.some(d=>d.id===record.id)){
        if(!result.measurements)throw Error('The architecture has no recorded coverage measurement.');
        saveDesignReference({status:'complete',orientation:record,architecture:{id:result.id,url:result.url,measurements:result.measurements}});
      }
      if(name.trim())writeLibrary(l=>({...l,designs:l.designs?.map(d=>d.id===record.id?{...d,name:name.trim()}:d)}));
      onSaved(record);setNotice('Alternative saved in this browser.');
    }catch(e){setNotice(String(e));}finally{setSaving(false);}
  }
  const [zoneChoices,setZoneChoices]=useState<Record<string,string>>({});
  const [showSite3D,setShowSite3D]=useState(false);
  const site=state.site;
  const selectedRun=(selected?.provenance as {runId?:string}|undefined)?.runId;
  const matches=(site?.zones??[]).map(zone=>{
    const options=library.filter(d=>d.status==='complete'&&d.zoneId===zone.id&&d.site.fingerprint===site!.fingerprint&&d.site.revision===site!.revision)
      .flatMap(d=>{const r=results.find(r=>r.id===d.id&&r.geometryHash===d.orientationHash&&r.zoneId===zone.id&&r.site.fingerprint===site!.fingerprint&&r.site.revision===site!.revision);return r?[{d,r}]:[];})
      .sort((a,b)=>b.d.createdAt.localeCompare(a.d.createdAt));
    const key=JSON.stringify([site!.fingerprint,zone.id,selectedRun]);
    const choice=zoneChoices[key];
    const defaultChoice=selectedRun?options.find(o=>(o.r.provenance as {runId?:string}).runId===selectedRun):options[0];
    const shown=choice===''?undefined:options.find(o=>o.d.id===choice)??defaultChoice;
    return {zone,options,key,shown};
  });
  const group=matches.flatMap(m=>m.shown?[m.shown.r]:[]);
  function showGroupOnSite(designs=group){
    if(!designs.length||site?.origin==='fixture')return false;
    try{
      const ids=new Set(designs.map(r=>r.id)),time=new Date().toISOString();
      writeLibrary(l=>({...l,activeDesignId:'',designs:l.designs?.map(d=>ids.has(d.id)?{...d,publishedAt:d.publishedAt??time}:d)}));
      if(!localStorage.getItem(DISPLAY_MODE_KEY)&&readDisplayMode()==='letters')setDisplayMode('architecture');
      writeSiteSelection({...selectionDefault,siteVisible:true,organizing:false,siteGroup:designs.map(r=>({id:r.id,hash:r.geometryHash,zoneId:r.zoneId}))});
      setNotice('The selected designs are ready together in Site Development. Choose Architecture Only to see their buildings.');
      return true;
    }catch(e){setNotice(String(e));return false;}
  }
  const [exporting,setExporting]=useState(false),[exportStatus,setExportStatus]=useState('');
  const [renderingBoard,setRenderingBoard]=useState(false),[boardStatus,setBoardStatus]=useState('');
  const boardRecords=group.length?group:record&&result?[record]:[];
  async function downloadBoard(){
    if(!boardRecords.length||renderingBoard)return;
    setRenderingBoard(true);setBoardStatus('');
    try{
      const labels=boardLabels(boardRecords);
      const png=await renderStudyBoard(boardRecords,labels);
      downloadDesignFile(png,objName(labels.join(' + '))+'-presentation.png');
      setBoardStatus('Presentation board download started.');
    }catch(e){setBoardStatus('PNG export failed. '+(e instanceof Error?e.message:String(e)));}
    finally{setRenderingBoard(false);}
  }
  async function exportForms(records:OrientationResult[],filename:string){
    if(exporting||!records.length)return;
    setExporting(true);setExportStatus('');
    try{
      const forms=await Promise.all(records.map(async r=>{
        const design=await loadSavedArchitecture(r.id);
        if(design.parentOrientationId!==r.id||design.parentGeometryHash!==r.geometryHash)
          throw Error('The saved form does not match the selected study.');
        const zoneName=r.site.zones.find(z=>z.id===r.zoneId)?.name??r.zoneId;
        return {name:zoneName+' '+(design.typologyName??r.parameters.recipe),...design.architecture};
      }));
      const file=objName(filename)+'.obj';
      downloadDesignFile(architectureObj(forms),file);
      setExportStatus('Download started for '+file+'.');
    }catch(e){setExportStatus('OBJ export failed. '+(e instanceof Error?e.message:String(e)));}
    finally{setExporting(false);}
  }
  const heightPassed=result?.validation.occupiedSiteEnvelope?.passed??result?.validation.allocatedHeightChecked;
  return <>{renderMethods(<ArchitecturePresentation key={record?.id} exportOnly records={boardRecords}/>)}
  <section id="review-architecture" className={styles.review} aria-labelledby="review-heading">
    <h2 id="review-heading"><small>04</small> Review Generated Architecture</h2>
    {site&&site.zones.length>0&&<section id="combined-site-plan"><h3>Combined site plan</h3>
      <SitePlan state={state} site={site} registry={registry} records={Object.fromEntries(matches.map(m=>[m.zone.id,m.shown?.r]))}/>
      <p>Territory colors show the prepared allocations. Architectural outlines show the saved design selected for each polygon.</p>
      <div className={styles.zoneChoices}>{matches.map(({zone,options,key,shown})=><label key={key}>{zone.name}
        {options.length?<select aria-label={zone.name+' plan design'} value={shown?.d.id??''} onChange={e=>setZoneChoices({...zoneChoices,[key]:e.target.value})}>
          <option value="">Hide architecture</option>{options.map(o=><option key={o.d.id} value={o.d.id}>{o.d.name}</option>)}</select>:<small>No completed design for this site revision</small>}
      </label>)}</div>
      {matches.some(m=>m.shown)&&<><button className={styles.textButton} aria-expanded={showSite3D} onClick={()=>setShowSite3D(!showSite3D)}>{showSite3D?'Close combined 3D view':'View combined architecture in 3D'}</button>
        {group.length>0&&site.origin!=='fixture'&&<div className={styles.zoneTabs}><button onClick={()=>showGroupOnSite()}>Show selected designs together in Site Development</button><a href="/site-development" onClick={e=>{if(!showGroupOnSite())e.preventDefault();}}>Open Site Development</a></div>}
        {showSite3D&&<CombinedArchitecture site={site} records={group}/>}</>}
    </section>}
    <div className={styles.reviewBar}><label>Saved alternatives &amp; reference studies
      <select aria-label="Saved orientation result" value={reference?'ref/'+reference:selected?.id??''} onChange={e=>choose(e.target.value)}>
        <option value="">Choose a study</option>
        <optgroup label="Saved alternatives">{results.map(r=><option key={r.id} value={r.id}>{library.find(d=>d.id===r.id)?.name??((r.typologyName??r.parameters.recipe)+' · '+r.id.slice(0,8))}</option>)}</optgroup>
        <optgroup label="Miami reference studies">{references.map(r=><option key={r.id} value={'ref/'+r.id}>{r.name}</option>)}</optgroup>
      </select></label>{record&&<DisplayModeSelector/>}
    </div>
    {!record&&<p>{reference?'Loading saved study…':'Generate a design or select a saved study to review its geometry.'}</p>}
    {record&&<><h3>{title}</h3>{record.provenance.ruleInfluence!==undefined&&<p>Plate perimeter stations guide native Stepped Rule A placement. Authentic Stepped Rule B generates the walls, terraces and openings.</p>}
      {result?<div className={styles.metrics}>
        <div><span>{result.provenance.adapter==='polygon-composition/v1'?'Developed ground footprint':'Building footprint'}</span><strong>{result.validation.footprintArea.toFixed(2)} ft²</strong></div>
        <div><span>Actual coverage</span><strong>{result.measurements?result.measurements.buildingCoveragePercent.toFixed(2)+'%':'Unrecorded'}</strong></div>
        <div><span>Site containment</span><strong>{result.validation.outsideArea<=(result.validation.areaToleranceFeet2??1e-6)&&result.validation.protectedArea<=(result.validation.areaToleranceFeet2??1e-6)?'Passed':'Review'}</strong></div>
        <div><span>Site height check</span><strong>{heightPassed===undefined?'Unrecorded':heightPassed?'Passed':'Review'}</strong></div>
      </div>:<p role="status">{loading?'Loading architectural geometry…':error||'Only source-letter geometry is available.'}</p>}
      {result?.provenance.adapter==='polygon-composition/v1'&&<table className={styles.areaReport}><caption>Measured composition · {result.provenance.clustering}% clustering · {result.provenance.buildableAreaFeet2?.toLocaleString(undefined,{maximumFractionDigits:1})} ft² buildable ground</caption>
        <thead><tr><th>Typology</th><th>Requested</th><th>Built share</th><th>Footprint</th><th>Letters placed</th><th>Letter target</th></tr></thead>
        <tbody>{result.provenance.members?.map(m=><tr key={m.typology}><td>{m.name}</td><td>{m.allocatedPercent}%</td><td>{m.achievedPercent.toFixed(2)}%</td><td>{m.footprintAreaFeet2.toLocaleString(undefined,{maximumFractionDigits:1})} ft²</td><td>{m.sourceCount??'—'}</td><td>{m.letterTarget??'—'}</td></tr>)}</tbody>
      </table>}
      {result?.provenance.heightRegions?.length ? <table className={styles.areaReport}>
        <caption>Site heights above base · {result.provenance.heightPolicy}</caption>
        <thead><tr><th>Region</th><th>Height limit</th><th>Built height</th></tr></thead>
        <tbody>{result.provenance.heightRegions.map(b=><tr key={b.id}><td>{b.role}</td><td>{b.capFeet.toFixed(1)} ft</td><td>{b.builtFeet.toFixed(1)} ft</td></tr>)}</tbody>
      </table> : result?.provenance.adapter==='polygon-composition/v1'&&<p>{result.provenance.heightPolicy==='uniform limit'?'This polygon used a uniform height limit.':'This saved study predates regional height measurements. Generate Design creates a new study with the current site rules.'}</p>}
      <div className={styles.viewer}><OrientationView result={record} view={reference?referenceView:view}/></div>
      {result&&<ArchitecturePresentation records={reference?[record]:boardRecords} key={record.id}/>}
      <div className={styles.alternative}><label>Alternative name<input aria-label="Alternative name" value={name} onChange={e=>setName(e.target.value)}/></label>
        <button disabled={!result||saving||!name.trim()} onClick={save}>Save Alternative</button>
        {record.site.origin!=='fixture'&&saved?.status==='complete'&&result&&<button onClick={()=>{try{
          if(record.typologyId==='continuous-site'){
            const run=(record.provenance as {runId?:string}).runId;
            const publishedSiblings=results.filter(r=>r.zoneId!==record.zoneId&&run&&
              (r.provenance as {runId?:string}).runId===run&&library.some(d=>d.id===r.id&&d.publishedAt));
            showGroupOnSite([record,...publishedSiblings]);
          }else{publishDesign(record.id);setNotice('Published. Choose this design in Site Development.');}
        }catch(e){setNotice(String(e));}}}>{saved.publishedAt?'Published to Site Development':'Publish to Site Development'}</button>}
      </div>
    </>}
    {notice&&<p role="status">{notice}</p>}
    <details className={styles.advanced}><summary>Review settings, exports &amp; technical details</summary>{children}
      {reference&&(['boundaries','organizing'] as const).map(key=><label key={key}><input type="checkbox" checked={referenceView[key]} onChange={e=>setReferenceView({...referenceView,[key]:e.target.checked})}/>{key==='boundaries'?'Site boundaries':'Organizing field'}</label>)}
      {record&&<><p>{record.components.length} source letters · L {record.counts.L} / U {record.counts.U} / V {record.counts.V} · native nominal sizes {[...new Set(record.components.map(c=>Number(c.nominalSizeFeet.toFixed(6))))].join(', ')} ft</p><ArchitectureControls orientation={record} technical/>
        <details><summary>Rule A geometry, provenance and validation</summary><pre>{JSON.stringify({id:record.id,counts:record.counts,parameters:record.parameters,frame:record.frame,geometryHash:record.geometryHash,validation:record.validation,provenance:record.provenance,limitations:record.limitations},null,2)}</pre></details></>}
    </details>
    <section id="form-exports" className={styles.objExport} aria-labelledby="obj-export-heading">
      <h3 id="obj-export-heading">Export architectural forms</h3>
      <p>{record||group.length?'OBJ files use site coordinates in feet, with Y up.':'Generate a design or select a saved study to export its form.'}</p>
      <div className={styles.zoneTabs}>
        <button type="button" disabled={!boardRecords.length||renderingBoard} onClick={downloadBoard}>Download Presentation Board PNG{boardRecords.length>1&&' ('+boardRecords.length+' zones)'}</button>
        <button type="button" disabled={exporting||!result} onClick={()=>record&&exportForms([record],(saved?.name??title)+'-'+record.id.slice(0,8))}>Download selected form OBJ</button>
        {group.length>0&&<button type="button" disabled={exporting} onClick={()=>exportForms(group,(site?.name??'site')+'-forms')}>Download site plan OBJ ({group.length} {group.length===1?'zone':'zones'})</button>}
      </div>
      {(renderingBoard||boardStatus)&&<p role="status">{renderingBoard?'Preparing presentation board PNG…':boardStatus}</p>}
      {(exporting||exportStatus)&&<p role="status">{exporting?'Preparing OBJ…':exportStatus}</p>}
    </section>
  </section></>;
}
