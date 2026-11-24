'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import AmphitheaterPresentation from '../AmphitheaterPresentation';
import type {AmphitheaterResult} from '../amphitheaterInteractiveTypes';
import {LOBBY_FINALS} from './registry';
import type {OriginalArchitecture} from './types';
import styles from './lobby-final.module.css';
const Viewer=dynamic(()=>import('./LobbyFinalViewer'),{ssr:false,loading:()=> <p className={styles.loading}>Preparing the saved-mesh viewer…</p>});
export default function LobbyFinalPanel({initialStudy='77'}:{initialStudy?:string}){
 const [selected,setSelected]=useState(LOBBY_FINALS.some(s=>String(s.number)===initialStudy)?initialStudy:'77'),[result,setResult]=useState<OriginalArchitecture>(),[error,setError]=useState(''),[ready,setReady]=useState(false),[showLetters,setShowLetters]=useState(true),[reset,setReset]=useState(0);
 const entry=LOBBY_FINALS.find(s=>String(s.number)===selected)??LOBBY_FINALS[0];
 useEffect(()=>{
  const controller=new AbortController();setResult(undefined);setError('');setReady(false);
  async function load(){try{
   const response=await fetch('/api/lobby-final-studies?study='+entry.number+'&asset=architecture',{signal:controller.signal});
   if(!response.ok)throw Error('Saved study could not be loaded. No replacement was generated.');
   const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==entry.files['architecture.json'].sha256)throw Error('Original mesh integrity check failed.');
   const data=JSON.parse(new TextDecoder().decode(bytes)) as OriginalArchitecture;
   if(data.id!==entry.architectureStudyId||data.sourceCount!==entry.count)throw Error('Original study identity mismatch.');
   if(!controller.signal.aborted)setResult(data);
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Saved study unavailable.');}}
  void load();return()=>controller.abort();
 },[entry]);
 function select(value:string){setResult(undefined);setReady(false);setSelected(value);setReset(v=>v+1);const url=new URL(window.location.href);url.searchParams.set('study',value);window.history.replaceState(window.history.state,'',url);}
 return <main className={styles.root}>
  <header className={styles.header}><div><p className={styles.eyebrow}>LOBBY / APPROVED FINALS</p><h1>Five final studies</h1><p className={styles.muted}>Original saved results from the developer’s export.</p></div><span className={styles.badge}>Read-only collection</span></header>
  <div className={styles.selector}><label htmlFor="lobby-final-study">Final study</label><select id="lobby-final-study" value={selected} onChange={e=>select(e.target.value)}>{LOBBY_FINALS.map(s=><option key={s.id} value={s.number}>Study {s.number} — {s.name}</option>)}</select></div>
  <section className={styles.title}><h2>Study {entry.number} — {entry.name}</h2><p>{entry.field.width} × {entry.field.depth} × {entry.field.height} ft <span> / </span> {entry.preferredFeet}-ft preferred letters <span> / </span> {entry.count} saved letters · {entry.types}</p></section>
  <div className={styles.grid}><section className={styles.model}><div className={styles.toolbar}><strong>Saved architecture</strong><div><label><input type="checkbox" checked={showLetters} onChange={e=>setShowLetters(e.target.checked)}/> Saved letter solids</label><button onClick={()=>setReset(v=>v+1)}>Reset view</button></div></div>
   <div className={styles.canvas} data-testid="saved-mesh-viewer" aria-label={'Saved 3D geometry for Study '+entry.number}>
   {error?<p role="alert" className={styles.loading}>{error}</p>:result?<Viewer key={entry.id} result={result} showLetters={showLetters} reset={reset} onReady={()=>setReady(true)}/>:<p role="status" className={styles.loading}>Loading and verifying original mesh…</p>}
   </div><p className={styles.status} role="status" data-testid="mesh-status">{result&&ready?'Original mesh verified · '+(result.architecture.indices.length/3).toLocaleString()+' triangles':'Saved mesh loading'}{result&&ready?' · Orbit / zoom to inspect':''}</p>
  </section><aside className={styles.reference}><h3>Developer’s reference</h3><img key={entry.id} src={'/api/lobby-final-studies?study='+entry.number+'&asset=reference'} alt={'Original southeast isometric reference — '+entry.name} width={812} height={580}/><p className={styles.muted}>Original view B · southeast isometric</p><p>Raw saved meshes are shown at left. No post-generation fitting or reshaping is applied. Reference lighting and display adjustments may differ.</p><a href={'/api/lobby-final-studies?study='+entry.number+'&asset=reference'} target="_blank" rel="noreferrer">Open full reference ↗</a></aside></div>
  <section className={styles.provenance}><h3>Original record</h3><dl><div><dt>Lobby study ID</dt><dd>{entry.lobbyStudyId}</dd></div><div><dt>Architecture ID</dt><dd>{entry.architectureStudyId}</dd></div><div><dt>Family</dt><dd>{entry.typologyId}</dd></div><div><dt>Integrity</dt><dd>SHA-256 checked before display</dd></div></dl>
  <p>Approved originals are immutable in this interface. Editing, generation, saving and deletion are unavailable.</p>
  <details><summary>Source configuration and provenance</summary><p>Recorded validation: {result?.validation.selfIntersectionPairs??'—'} intersections / overlaps. This is the developer’s stored validation, not a new geometry audit.</p><p>Original request source ID: {result?.request.sourceId??'—'}</p><p>Archive SHA-256: {entry.archiveSha256}</p><p>Saved architecture SHA-256: {entry.files['architecture.json'].sha256}</p><p><a href={'/api/lobby-final-studies?study='+entry.number+'&asset=study'} target="_blank" rel="noreferrer">Original configuration JSON</a> · <a href={'/api/lobby-final-studies?study='+entry.number+'&asset=summary'} target="_blank" rel="noreferrer">Original summary</a> · <a href={'/api/lobby-final-studies?study='+entry.number+'&asset=architecture'} target="_blank" rel="noreferrer">Original meshes JSON</a></p>
  {result&&<pre>{JSON.stringify(result.request.source,null,2)}</pre>}</details></section>
 {result&&<AmphitheaterPresentation result={result as unknown as AmphitheaterResult} context={{category:'lobby',typology:entry.typologyId,title:entry.name}}/>}
 </main>;
}

