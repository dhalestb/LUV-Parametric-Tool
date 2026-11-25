'use client';

import {useEffect,useRef,useState} from 'react';
import {loadSavedArchitecture} from './ArchitectureLayer';
import type {OrientationResult} from './orientationStore';
import {renderPresentation,sheetHeight,sheetWidth} from './renderPresentation';

function label(r:OrientationResult){return r.site.zones.find(z=>z.id===r.zoneId)?.name??r.typologyName??'Selected study';}

export default function ArchitecturePresentation({records,initialId}:{records:OrientationResult[];initialId?:string}){
  const [open,setOpen]=useState(false),[choice,setChoice]=useState('all'),[url,setUrl]=useState(''),[error,setError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const selected=choice==='all'?records:records.filter(r=>r.id===choice);
  const labelKey=JSON.stringify(selected.map(label));
  const title=selected.map(label).join(' + ');
  const ids=JSON.stringify(selected.map(r=>[r.id,r.geometryHash]));
  useEffect(()=>{
    if(!open)return;
    const element=dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[open]);
  useEffect(()=>{
    if(!open)return;
    let active=true,imageUrl='';
    setUrl('');setError('');
    async function render(){
      const sources=JSON.parse(ids) as [string,string][];
      const meshes=await Promise.all(sources.map(async ([id,hash])=>{
        const saved=await loadSavedArchitecture(id);
        if(saved.parentOrientationId!==id||saved.parentGeometryHash!==hash)throw Error('The saved form differs from its source study.');
        return saved.architecture;
      }));
      if(!active)return;
      const blob=await renderPresentation(meshes,JSON.parse(labelKey) as string[]);
      if(active){imageUrl=URL.createObjectURL(blob);setUrl(imageUrl);}
    }
    render().catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;if(imageUrl)URL.revokeObjectURL(imageUrl);};
  },[open,ids,labelKey]);
  if(!records.length)return null;
  return <>
    <button type="button" onClick={()=>{setChoice(initialId??'all');setUrl('');setError('');setOpen(true);}}>Presentation views</button>
    {open&&<dialog ref={dialog} aria-label="Architectural presentation" onCancel={()=>setOpen(false)}
      style={{margin:'auto',width:'min(96vw, 1720px)',maxWidth:'96vw',maxHeight:'94vh',padding:16,background:'#101b22',color:'#f7f6f5',border:'1px solid #51646b'}}>
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:16,marginBottom:14}}>
        <strong>Architectural presentation</strong>
        {records.length>1&&<label>Study <select value={choice} onChange={e=>{setUrl('');setChoice(e.target.value);}}>
          <option value="all">All selected zones</option>{records.map(r=><option key={r.id} value={r.id}>{label(r)}</option>)}
        </select></label>}
        {url&&<a href={url} download={title.replace(/[^a-z0-9-]+/gi,'-')+'-presentation.png'}>Download PNG · {sheetWidth} × {sheetHeight}</a>}
        <button type="button" style={{marginLeft:'auto'}} onClick={()=>setOpen(false)}>Close presentation</button>
      </div>
      {url?<img src={url} alt={title+' in perspective, plan and stepped side elevation'} style={{display:'block',width:'100%',height:'auto'}}/>:
        <p role="status">{error||'Rendering presentation…'}</p>}
    </dialog>}
  </>;
}
