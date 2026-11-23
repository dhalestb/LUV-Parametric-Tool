'use client';
import {useEffect,useState} from 'react';
import type {AmphitheaterResult} from './amphitheaterInteractiveTypes';
import {BOARD_WIDTH,BOARD_HEIGHT,createAmphitheaterPlate,type PresentationOptions} from './amphitheaterPresentationRender';
import {PLATE_LABELS,downloadStudyBlob,studyOBJ,type ExportView} from './amphitheaterPresentationExport';

export default function AmphitheaterPresentation({result,disabled=false,joinWalls=false,onJoinWalls}:{result:AmphitheaterResult;disabled?:boolean;joinWalls?:boolean;onJoinWalls?:(value:boolean)=>void}){
  const [view,setView]=useState<ExportView>('board');
  const [resolution,setResolution]=useState(4096);
  const [transparent,setTransparent]=useState(false);
  const [cameraChoice,setCameraChoice]=useState<{studyId:string;direction:PresentationOptions['iso']}|null>(null);
  const iso=cameraChoice?.studyId===result.id?cameraChoice.direction:'SE';
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [exporting,setExporting]=useState(false);
  const [previewing,setPreviewing]=useState(false);
  useEffect(()=>{
    let active=true,url='';
    setPreviewing(true);setPreview('');setError('');
    createAmphitheaterPlate(result,{view,size:view==='board'?BOARD_WIDTH:900,transparent,iso})
      .then(blob=>{
        if(!active)return;
        url=URL.createObjectURL(blob);setPreview(url);
      }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(active)setPreviewing(false);});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[result,view,transparent,iso]);
  async function exportPNG(){
    setExporting(true);setError('');setMessage('Rendering the high-resolution PNG…');
    try{
      const board=view==='board';
      const width=board?BOARD_WIDTH:resolution,height=board?BOARD_HEIGHT:resolution;
      const blob=board?await (await fetch(preview)).blob():await createAmphitheaterPlate(result,{view,size:resolution,transparent,iso});
      downloadStudyBlob(blob,'amphitheater-'+result.id+'-'+view+'-'+width+'px.png');
      setMessage('PNG exported at '+width+' × '+height+' pixels with 300 ppi metadata.');
    }catch(e){setError(e instanceof Error?e.message:String(e));setMessage('');}
    finally{setExporting(false);}
  }
  function exportOBJ(kind:'letters'|'form'){
    setError('');
    try{
      if(kind==='form'&&result.request.workspaceTypology==='open-hall-workspace'&&joinWalls&&!result.request.openHall?.joinWalls){
        setMessage('Generate the Open Hall study after enabling joined walls, then export the form OBJ.');
        return;
      }
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
      {view==='board'?<span>{BOARD_WIDTH} {'\u00d7'} {BOARD_HEIGHT} px · 300 ppi</span>:<label>PNG resolution<select aria-label="PNG resolution" value={resolution} disabled={blocked} onChange={e=>setResolution(+e.target.value)}>
        <option value={2048}>2048 px</option><option value={4096}>4096 px</option>
      </select></label>}
      <label>Isometric direction<select aria-label="Presentation isometric direction" value={iso} disabled={blocked} onChange={e=>setCameraChoice({studyId:result.id,direction:e.target.value as PresentationOptions['iso']})}>
        {(['SE','SW','NE','NW'] as const).map(direction=><option key={direction}>{direction}</option>)}
      </select></label>
      <label><input type="checkbox" checked={transparent} disabled={blocked} onChange={e=>setTransparent(e.target.checked)}/> Transparent PNG background</label>
    </div>
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
    {result.request.workspaceTypology==='open-hall-workspace'&&<label className="block"><input type="checkbox" checked={joinWalls} disabled={blocked} onChange={e=>onJoinWalls?.(e.target.checked)}/> Join walls into Form OBJ <span className="text-xs">· generate the study after changing this setting</span></label>}
    <p role="status">{message}</p>
    {error&&<p role="alert" style={{color:'#ed8989'}}>{error}</p>}
  </section>;
}
