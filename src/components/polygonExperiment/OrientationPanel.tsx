'use client';
import {useEffect,useState} from 'react';

import GenerationMethods from './GenerationMethods';
import ArchitectureReview from './ArchitectureReview';
import styles from './workflow.module.css';

import type {Experiment,Registry} from './model';
import {listOrientations,readSelection,writeSelection,writeSiteSelection,selectionDefault,type OrientationResult,type OrientationSelection} from './orientationStore';

const SETTINGS='luv-experiment-orientation-controls-v1';
const initial={recipe:'print-contour',seed:2101342521,rotationSeed:189,spacing:13,heading:0,datum:0,fixture:false};
export default function OrientationPanel({state,registry,patch,openTerritories}:{state:Experiment;registry:Registry;patch:(p:Partial<Experiment>)=>void;openTerritories:()=>void}){
 const [controls,setControls]=useState(initial),[results,setResults]=useState<OrientationResult[]>([]),[view,setView]=useState<OrientationSelection>(selectionDefault),[notice,setNotice]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;try{const raw=localStorage.getItem(SETTINGS);if(raw)setControls({...initial,...JSON.parse(raw)});setView(readSelection());}catch{setNotice('C1 settings could not be restored; saved results are retained.');}listOrientations().then(r=>{if(active)setResults(r);}).catch(e=>{if(active)setNotice(String(e));});setReady(true);return()=>{active=false;};},[]);
 useEffect(()=>{if(ready&&state.site)localStorage.setItem(SETTINGS,JSON.stringify(controls));},[controls,ready,state.site]);
 const [reference,setReference]=useState('');
 useEffect(()=>{const q=new URLSearchParams(location.search);if(q.get('compare')==='1'){const study=q.get('study');setReference(study&&['0aef1f14-66a5-45b3-a2ba-a31248841e7f','17cb9692-eb78-4a54-9314-7e3de823daa7'].includes(study)?study:'miami-plate-stepped-v1');}},[]);
 const select=(v:OrientationSelection)=>{try{writeSelection(v);setView(v);}catch(e){setNotice('Selection could not be saved: '+String(e));}};
 function selectSaved(r:OrientationResult){setReference('');const u=new URL(location.href);u.searchParams.delete('compare');u.searchParams.delete('study');history.replaceState(history.state,'',u);setResults(old=>[...old.filter(x=>x.id!==r.id),r]);select({...view,id:r.id,siteVisible:view.id===r.id&&view.siteVisible});}
 function exportResults(){if(window.parent!==window){window.parent.dispatchEvent(new CustomEvent('luv-export-orientations',{detail:{version:1,results,view,controls}}));return;}const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,results,view,controls})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='luv-c1-orientation-results.json';a.click();URL.revokeObjectURL(url);}
 const selected=results.find(r=>r.id===view.id);
 return <>
  <GenerationMethods state={state} registry={registry} patch={patch} controls={controls} openTerritories={openTerritories} onSaved={selectSaved} advanced={<div className={styles.technical}>{(['seed','rotationSeed','spacing','heading','datum'] as const).map(k=><label key={k} style={{display:'inline-block',margin:8}}>{k==='heading'?'Preferred site heading °':k==='datum'?'Base elevation feet':k==='spacing'?'Native level spacing feet':k==='rotationSeed'?'Upper rotation seed':'Orientation seed'}<input aria-label={'Orientation '+k} type='number' value={controls[k]} onChange={e=>setControls({...controls,[k]:Number(e.target.value)})}/></label>)}<p>Gallery controls: default upper rotation seed 189 reconstructs the saved 55° rotation; the original rotation seed was not recorded. Native spacing choices: 12 / 13 / 14 / 15 ft. Small-field print courses use their authentic height-dependent spacing and offsets. Placement may try polygon-edge headings if the preferred heading fails. Source letters are never shrunk. Plate uses the seed, heading and base above, with its own spacing and native letter-size controls below. Stepped uses the seed, heading and base with its separately stated controlled configuration.</p></div>}/>
  <ArchitectureReview results={results} selected={selected} view={view} reference={reference} setReference={setReference} select={id=>select({...view,id})} onSaved={selectSaved}>
   <button onClick={exportResults}>Export C1 geometry backup</button>{!reference&&<div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}>{(['organizing','boundaries','siteVisible'] as const).map(k=><label key={k} style={{margin:8}}><input aria-label={'Orientation '+k} type='checkbox' checked={view[k]} disabled={k==='siteVisible'&&(!selected||selected.site.origin==='fixture')} onChange={e=>{const next={...view,[k]:e.target.checked};select(next);if(k==='siteVisible')writeSiteSelection(next);}}/>{k==='siteVisible'?'Show in shared Site viewport':k}</label>)}</div>}{notice&&<p role="status">{notice}</p>}
  </ArchitectureReview>
 </>;
}
