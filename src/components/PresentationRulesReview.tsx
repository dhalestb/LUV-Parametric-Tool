'use client';
import {useEffect,useState} from 'react';
import {createAmphitheaterPlate as renderBaseline} from './presentation/verificationBaseline/amphitheaterPresentationRender';
import type {AmphitheaterResult as BaselineRecord} from './presentation/verificationBaseline/amphitheaterInteractiveTypes';
import {renderPresentation,adaptPresentationRecord} from './presentation/renderPresentation';
import {resolvePresentationRules} from './presentation/rules';
import type {PresentationCategory,PresentationOptions} from './presentation/types';
type ReviewCase={id:string;name:string;group:string;category:PresentationCategory;typology?:string;studyId:string};
type Evidence={caseId:string;phase:string;pngSHA256:string;captureHash?:string};
export default function PresentationRulesReview(){
 const [cases,setCases]=useState<ReviewCase[]>([]),[selected,setSelected]=useState('lobby-77'),[status,setStatus]=useState('Loading presentation examples…'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[evidence,setEvidence]=useState<Evidence[]>([]),[phase,setPhase]=useState('focused');
 useEffect(()=>{fetch('/api/presentation-review').then(r=>r.json()).then(data=>{setCases(data.cases);setStatus('Ready to compare the saved presentation examples.');}).catch(e=>setError(String(e)));},[]);
 async function run(items:ReviewCase[],target:'baseline'|'reusable'|'examples'|'focused'){
  setBusy(true);setError('');setPhase(target);
  try{for(const item of items){
   setSelected(item.id);setStatus('Rendering '+item.name+' · '+target+'…');
   const response=await fetch('/api/presentation-review?case='+encodeURIComponent(item.id));if(!response.ok)throw Error('Saved presentation input could not be loaded.');
   const {record}=await response.json();
   const study=adaptPresentationRecord(record,{category:item.category,typology:item.typology,title:item.name});
   const iso=resolvePresentationRules(study).iso;
   const options:PresentationOptions={view:'board',size:4096,transparent:false,iso,ruleSource:''};
   const blob=target==='baseline'?await renderBaseline(record as BaselineRecord,options):await renderPresentation(study,options);
   const stored=await fetch('/api/presentation-review?case='+encodeURIComponent(item.id)+'&phase='+target,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
   const metadata=await stored.json();if(!stored.ok)throw Error(metadata.error);setEvidence(rows=>[...rows.filter(r=>!(r.caseId===item.id&&r.phase===target)),metadata]);
  }setStatus('Completed '+items.length+' '+target+' board PNGs.');}
  catch(e){setError((e as Error).message);setStatus('Rendering stopped; earlier evidence and saved studies are preserved.');}
  finally{setBusy(false);}
 }
 const item=cases.find(c=>c.id===selected),captured=evidence.find(e=>e.caseId===selected&&e.phase===phase),ready=!!captured;
 const imageUrl='/api/presentation-review?case='+selected+'&phase='+phase+(captured?.captureHash?'&capture='+captured.captureHash:'');
 return <main style={{maxWidth:1260,margin:'0 auto',padding:24,color:'var(--ink)'}}>
  <h1>Reusable Presentation Board review</h1><p>Approved Gathering layouts, shared graphic standards, and proposed Workspace / Lobby adaptations.</p>
  <p><a href="/amphitheater">Proto-Form Generation</a> · <a href="/lobby">Read-only Lobby originals</a> · <a href="/reports/presentation-focused-details-2026-11-21.html">Focused rule-detail report</a></p>
  <div style={{display:'flex',flexWrap:'wrap',gap:10,margin:'20px 0'}}>
   <button disabled={busy} onClick={()=>void run(cases.filter(c=>c.group==='approved'),'baseline')}>Capture five approved baselines</button>
   <button disabled={busy} onClick={()=>void run(cases.filter(c=>c.group==='approved'),'reusable')}>Compare five reusable Gathering boards</button>
   <button disabled={busy} onClick={()=>void run(cases.filter(c=>c.group!=='approved'),'examples')}>Render new studies, Workspace and Lobby examples</button>
   <button disabled={busy} onClick={()=>void run(cases.filter(c=>c.category==='workspace'||c.category==='lobby'),'focused')}>Render focused Workspace and Lobby details</button>
  </div>
  <p role="status">{status}</p>{error&&<p role="alert" style={{color:'#ed8989'}}>{error}</p>}
  <label>Presentation example<select aria-label="Presentation example" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);if(phase==='focused'&&cases.find(c=>c.id===e.target.value)?.category==='gathering')setPhase('reusable');}} style={{display:'block',width:'100%'}}>{cases.map(c=><option key={c.id} value={c.id}>{c.group} · {c.name}</option>)}</select></label>
  <label>Evidence version<select aria-label="Evidence version" value={phase} disabled={busy} onChange={e=>setPhase(e.target.value)}><option value="focused">Focused letter and form details</option><option value="baseline">Original corrected renderer</option><option value="reusable">Reusable Gathering rules</option><option value="examples">Previous adaptation (archive)</option></select></label>
  {item&&<><h2>{item.name}</h2><p>Original study ID: {item.studyId}. Saved geometry is displayed without regeneration or rescaling.</p>{item.category!=='gathering'&&<p>Proposed presentation adaptation — camera, section and detail arrangement require review. The source architecture remains the saved original.</p>}</>}
  {(ready||!busy)&&item&&<a href={imageUrl} target="_blank" rel="noreferrer">
   {/* Local rendered evidence PNG, not an external image. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img key={selected+phase+captured?.pngSHA256} src={imageUrl} alt={(item?.name??'Study')+' board evidence'} style={{display:'block',width:'100%',maxWidth:950,marginTop:20}}/>
  </a>}
  <p>{evidence.length} PNG artifacts captured in this browser session. All boards are 4096 × 5156 pixels with 300-ppi metadata.</p>
 </main>;
}
