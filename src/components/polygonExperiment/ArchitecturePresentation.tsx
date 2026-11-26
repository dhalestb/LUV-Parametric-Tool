'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {loadSavedArchitecture} from './ArchitectureLayer';
import type {OrientationResult} from './orientationStore';
import {renderPresentation,sheetHeight,sheetWidth} from './renderPresentation';

function label(r:OrientationResult){return r.site.zones.find(z=>z.id===r.zoneId)?.name??r.typologyName??'Selected study';}

export async function renderStudyBoard(records:Pick<OrientationResult,'id'|'geometryHash'>[],labels:string[]){
  const meshes=await Promise.all(records.map(async ({id,geometryHash})=>{
    const saved=await loadSavedArchitecture(id);
    if(saved.parentOrientationId!==id||saved.parentGeometryHash!==geometryHash)throw Error('The saved form differs from its source study.');
    return saved.architecture;
  }));
  return renderPresentation(meshes,labels);
}

export const boardLabels=(records:OrientationResult[])=>records.map(label);

export default function ArchitecturePresentation({records,exportOnly=false,children}:{records:OrientationResult[];exportOnly?:boolean;children?:ReactNode}){
  const [open,setOpen]=useState(false),[choice,setChoice]=useState('all'),[image,setImage]=useState({key:'',url:''}),[error,setError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const selected=records.some(r=>r.id===choice)?records.filter(r=>r.id===choice):records;
  const labelKey=JSON.stringify(boardLabels(selected));
  const title=selected.map(label).join(' + ');
  const ids=JSON.stringify(selected.map(({id,geometryHash})=>({id,geometryHash})));
  const key=JSON.stringify([ids,labelKey]);
  const url=image.key===key?image.url:'';
  useEffect(()=>{
    if(!open||exportOnly)return;
    const element=dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[open,exportOnly]);
  useEffect(()=>{
    if(!open||ids==='[]')return;
    let active=true,imageUrl='';
    setImage({key:'',url:''});setError('');
    async function render(){
      const blob=await renderStudyBoard(JSON.parse(ids),JSON.parse(labelKey));
      if(active){imageUrl=URL.createObjectURL(blob);setImage({key,url:imageUrl});}
    }
    render().catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;if(imageUrl)URL.revokeObjectURL(imageUrl);};
  },[open,ids,labelKey,key]);
  const chooser=records.length>1&&<label>Study <select value={records.some(r=>r.id===choice)?choice:'all'} onChange={e=>setChoice(e.target.value)}>
    <option value="all">All selected zones</option>{records.map(r=><option key={r.id} value={r.id}>{label(r)}</option>)}
  </select></label>;
  const download=open&&url&&<a href={url} download={title.replace(/[^a-z0-9-]+/gi,'-')+'-presentation.png'}>Download presentation board PNG · {sheetWidth} × {sheetHeight}</a>;
  if(exportOnly)return <details onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Exports</summary>
    {records.length?<>{chooser}<p>{download||<span role="status">{error||'Preparing presentation board PNG…'}</span>}</p></>:
      <p>Generate a design or <a href="#review-architecture">select a finished study in Step 4</a> to download its presentation board.</p>}
    {children}
  </details>;
  if(!records.length)return null;
  return <>
    <button type="button" onClick={()=>{setChoice('all');setImage({key:'',url:''});setError('');setOpen(true);}}>Presentation views</button>
    {open&&<dialog ref={dialog} aria-label="Architectural presentation" onCancel={()=>setOpen(false)}
      style={{margin:'auto',width:'min(96vw, 1720px)',maxWidth:'96vw',maxHeight:'94vh',padding:16,background:'#101b22',color:'#f7f6f5',border:'1px solid #51646b'}}>
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:16,marginBottom:14}}>
        <strong>Architectural presentation</strong>
        {chooser}
        {download}
        <button type="button" style={{marginLeft:'auto'}} onClick={()=>setOpen(false)}>Close presentation</button>
      </div>
      {url?<img src={url} alt={title+' in perspective, plan and stepped side elevation'} style={{display:'block',width:'100%',height:'auto'}}/>:
        <p role="status">{error||'Rendering presentation…'}</p>}
    </dialog>}
  </>;
}
