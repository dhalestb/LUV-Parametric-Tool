'use client';
import {useEffect,useState} from 'react';
import AmphitheaterPresentation from '@/components/AmphitheaterPresentation';
import {LOBBY_OPTIONS} from '@/components/UnifiedTypologySelect';
import {LOBBY_FINALS} from '@/components/lobby-final/registry';
import type {AmphitheaterResult} from '@/components/amphitheaterInteractiveTypes';

type StudyChoice={id:string;created:string;sourceCount:number;request:{sourceSnapshot?:{lobbyTypology?:string}}};
export default function LobbyTransferReview(){
 const [typology,setTypology]=useState<string>('linear-gallery-lobby'),[selection,setSelection]=useState('approved'),[studies,setStudies]=useState<StudyChoice[]>([]),[record,setRecord]=useState<AmphitheaterResult>(),[error,setError]=useState('');
 const title=LOBBY_OPTIONS.find(([id])=>id===typology)![1];
 useEffect(()=>{const controller=new AbortController();fetch('/api/lobby-generate',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Generated studies could not be loaded.');return r.json();}).then(data=>setStudies(data.studies)).catch(e=>{if(!controller.signal.aborted)setError(String(e));});return()=>controller.abort();},[]);
 const choices=studies.filter(s=>s.request.sourceSnapshot?.lobbyTypology===typology);
 const selected=selection==='latest'?choices[0]?.id:selection;
 useEffect(()=>{
  const controller=new AbortController();setRecord(undefined);setError('');
  if(!selected)return()=>controller.abort();
  async function load(){try{
   const original=selection==='approved',entry=LOBBY_FINALS.find(s=>s.typologyId===typology)!;
   const response=await fetch(original?'/api/lobby-final-studies?study='+entry.number+'&asset=architecture':'/api/lobby-generate?id='+selected,{signal:controller.signal});
   if(!response.ok)throw Error('Saved presentation study could not be loaded.');
   const bytes=await response.arrayBuffer();
   if(original){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==entry.files['architecture.json'].sha256)throw Error('Approved original integrity check failed.');}
   const data=JSON.parse(new TextDecoder().decode(bytes));if(!controller.signal.aborted)setRecord(data);
  }catch(e){if(!controller.signal.aborted)setError(String(e));}}
  void load();return()=>controller.abort();
 },[selected,selection,typology]);
 return <main style={{maxWidth:1260,margin:'0 auto',padding:24,color:'var(--ink)'}}>
  <h1>Lobby Presentation Board</h1><p>One selected typology and saved study per board. Export uses the PNG resolution selected below.</p>
  <p><a href="/amphitheater">Proto-Form Generation</a> · <a href="/reports/lobby-final-source-gap-2026-11-21.html">Final-generator source audit</a></p>
  <label>Typology<select aria-label="Board typology" value={typology} onChange={e=>{if(e.target.value===typology)return;setRecord(undefined);setTypology(e.target.value);setSelection('approved');}} style={{display:'block',width:'100%'}}>{LOBBY_OPTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
  <label>Saved study<select aria-label="Board saved study" value={selection} onChange={e=>{if(e.target.value===selection)return;setRecord(undefined);setSelection(e.target.value);}} style={{display:'block',width:'100%',marginBottom:20}}><option value="latest">Latest generated study · pinned Git rules</option><option value="approved">Approved final reference · read-only</option>{choices.map(s=><option key={s.id} value={s.id}>{new Date(s.created).toLocaleString()} · {s.sourceCount} letters</option>)}</select></label>
  {error&&<p role="alert">{error}</p>}{!record&&!error&&<p role="status">{selected?'Loading saved presentation…':'Choose an approved final reference, or generate a new study in Proto-Form Generation.'}</p>}
  {record&&<AmphitheaterPresentation key={record.id} result={record} context={{category:'lobby',typology,title}}/>}
 </main>;
}
