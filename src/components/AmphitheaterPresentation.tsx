'use client';
import {useEffect,useState} from 'react';
import type {AmphitheaterResult} from './amphitheaterInteractiveTypes';
import {createAmphitheaterPlate,type PresentationOptions} from './amphitheaterPresentationRender';
import {PLATE_LABELS,presentationRules,downloadStudyBlob,studyOBJ,type ExportView} from './amphitheaterPresentationExport';

export default function AmphitheaterPresentation({result,disabled=false}:{result:AmphitheaterResult;disabled?:boolean}){
  const [view,setView]=useState<ExportView>('board');
  const [resolution,setResolution]=useState(4096);
  const [transparent,setTransparent]=useState(false);
  const [iso,setIso]=useState<PresentationOptions['iso']>('SE');
  const [ruleSource,setRuleSource]=useState('');
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [exporting,setExporting]=useState(false);
  const [previewing,setPreviewing]=useState(false);
  const rules=presentationRules(result);
  const sources=result.letters.filter((letter,i)=>result.request.source[i]?.architecturalRole==='interior'||result.voidFieldReport?.walls?.some(wall=>wall.source===letter.id));
  const activeSource=sources.some(source=>source.id===ruleSource)?ruleSource:'';
  useEffect(()=>{
    let active=true,url='';
    setPreviewing(true);setPreview('');setError('');
    createAmphitheaterPlate(result,{view,size:900,transparent,iso,ruleSource:activeSource})
      .then(blob=>{
        if(!active)return;
        url=URL.createObjectURL(blob);setPreview(url);
      }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(active)setPreviewing(false);});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[result,view,transparent,iso,activeSource]);
  async function exportPNG(){
    setExporting(true);setError('');setMessage('Rendering the high-resolution PNG…');
    try{
      const blob=await createAmphitheaterPlate(result,{view,size:resolution,transparent,iso,ruleSource:activeSource});
      downloadStudyBlob(blob,'amphitheater-'+result.id+'-'+view+'-'+resolution+'px.png');
      setMessage('PNG exported at '+resolution+' × '+(view==='board'?Math.round(resolution*1.125):resolution)+' pixels with 300 ppi metadata.');
    }catch(e){setError(e instanceof Error?e.message:String(e));setMessage('');}
    finally{setExporting(false);}
  }
  function exportOBJ(kind:'letters'|'form'){
    setError('');
    try{
      downloadStudyBlob(new Blob([studyOBJ(result,kind)],{type:'text/plain'}),'amphitheater-'+result.id+'-'+kind+'.obj');
      setMessage((kind==='letters'?'Source letter instances':'Architectural form')+' exported in feet with Z up.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  const blocked=disabled||exporting;
  return <section id="amphitheater-presentation" className="space-y-3" style={{border:'1px solid var(--line)',borderRadius:10,padding:16,background:'var(--panel-background)'}}>
    <h2>Presentation &amp; Export</h2>
    <p className="text-sm">Exports use the displayed saved study. The four-view board follows a 2 × 2 layout for placement in InDesign.</p>
    <div className="flex flex-wrap gap-3">
      <label>Presentation view<select aria-label="Presentation view" value={view} disabled={blocked} onChange={e=>setView(e.target.value as ExportView)}>
        {(Object.keys(PLATE_LABELS) as ExportView[]).map(key=><option key={key} value={key}>{PLATE_LABELS[key]}</option>)}
      </select></label>
      <label>PNG resolution<select aria-label="PNG resolution" value={resolution} disabled={blocked} onChange={e=>setResolution(+e.target.value)}>
        <option value={2048}>2048 px</option><option value={4096}>4096 px</option>
      </select></label>
      <label>Isometric direction<select aria-label="Presentation isometric direction" value={iso} disabled={blocked} onChange={e=>setIso(e.target.value as PresentationOptions['iso'])}>
        {(['SE','SW','NE','NW'] as const).map(direction=><option key={direction}>{direction}</option>)}
      </select></label>
      <label><input type="checkbox" checked={transparent} disabled={blocked} onChange={e=>setTransparent(e.target.checked)}/> Transparent PNG background</label>
    </div>
    {(view==='orientation'||view==='generation'||view==='board')&&sources.length>0&&<label>Rule source<select aria-label="Rule source" value={activeSource} disabled={blocked} onChange={e=>setRuleSource(e.target.value)}>
      <option value="">All source operations</option>{sources.map(source=><option key={source.id} value={source.id}>{source.id}</option>)}
    </select></label>}
    <details><summary>Measured orientation and terracing rules</summary>
      <div className="space-y-2 py-2">{[...rules.orientation,...rules.terraces].map(rule=><p key={rule}>{rule}</p>)}
      {!result.roomReport&&result.request.envelopeVersion!=='void-field'&&<p>Current middle-interior generation uses X tilt 90°. The proposed 75° and 105° X tilts require further generator support.</p>}</div>
    </details>
    <div style={{background:'#000',border:'1px solid #34404a',maxWidth:900}}>
      {previewing&&<p role="status" className="p-4">Preparing presentation preview…</p>}
      {/* This local Blob URL is already a rendered PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview&&<img src={preview} alt={PLATE_LABELS[view]+' presentation preview'} style={{display:'block',width:'100%',height:'auto'}}/>}
    </div>
    <div className="flex flex-wrap gap-3">
      <button className="border rounded p-2" disabled={blocked||previewing||!preview} onClick={()=>void exportPNG()}>{exporting?'Exporting PNG…':'Export high-resolution PNG'}</button>
      <button className="border rounded p-2" disabled={blocked} onClick={()=>exportOBJ('letters')}>Export Letters OBJ</button>
      <button className="border rounded p-2" disabled={blocked} onClick={()=>exportOBJ('form')}>Export Form OBJ</button>
    </div>
    <p role="status">{message}</p>
    {error&&<p role="alert" style={{color:'#ed8989'}}>{error}</p>}
  </section>;
}
