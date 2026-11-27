'use client';
import {useEffect,useState} from 'react';
import type {AmphitheaterResult} from './amphitheaterInteractiveTypes';
import {BOARD_WIDTH,createAmphitheaterPlate,type PresentationOptions,type PresentationContext} from './amphitheaterPresentationRender';
import {adaptPresentationRecord} from './presentation/types';
import {resolvePresentationRules} from './presentation/rules';
import {PLATE_LABELS,presentationRules,downloadStudyBlob,studyOBJ,type ExportView} from './amphitheaterPresentationExport';
import {presentationExportDimensions,sizeBoardPNG} from './presentationExportSizing';

export default function AmphitheaterPresentation({result,disabled=false,context}:{result:AmphitheaterResult;disabled?:boolean;context?:PresentationContext}){
  const [view,setView]=useState<ExportView>('board');
  const [resolution,setResolution]=useState(4096);
  const [transparent,setTransparent]=useState(false);
  const [cameraChoice,setCameraChoice]=useState<{studyId:string;direction:PresentationOptions['iso']}|null>(null);
  const hasPier=!!result.plateReport&&result.components.some(c=>c.id.startsWith('corner-pier-'));
  const resolved=resolvePresentationRules(adaptPresentationRecord(result,context));
  const defaultDirection=resolved.iso;
  const iso=cameraChoice?.studyId===result.id?cameraChoice.direction:defaultDirection;
  const [ruleSource,setRuleSource]=useState('');
  const [sectionChoice,setSectionChoice]=useState<{studyId:string;axis:'x'|'y'|'longest-plan';fraction:number}|null>(null);
  const section=sectionChoice?.studyId===result.id?sectionChoice:undefined;
  const overrides=section?{section:{axis:section.axis,origin:'bounds-center' as const,fraction:section.fraction}}:undefined;
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [exporting,setExporting]=useState(false);
  const [previewing,setPreviewing]=useState(false);
  const rules=context?.category==='lobby'?{orientation:['Original letter transforms and dimensions are retained.'],terraces:['Board section and source overlays are proposed display settings; the approved mesh is unchanged.']}:presentationRules(result);
  const sources=result.letters.filter((letter,i)=>result.request.source[i]?.architecturalRole==='interior'||(result.request.envelopeVersion==='vertical-walls'&&result.request.source[i]?.architecturalRole==='perimeter')||result.voidFieldReport?.walls?.some(wall=>wall.source===letter.id));
  const activeSource=sources.some(source=>source.id===ruleSource)?ruleSource:'';
  useEffect(()=>{
    let active=true,url='';
    setPreviewing(true);setPreview('');setError('');
    createAmphitheaterPlate(result,{view,size:view==='board'?BOARD_WIDTH:900,transparent,iso,ruleSource:activeSource},context,overrides)
      .then(blob=>{
        if(!active)return;
        url=URL.createObjectURL(blob);setPreview(url);
      }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(active)setPreviewing(false);});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[result,view,transparent,iso,activeSource,context?.category,context?.typology,context?.title,section?.axis,section?.fraction]);
  async function exportPNG(){
    setExporting(true);setError('');setMessage('Rendering the high-resolution PNG…');
    try{
      const board=view==='board';
      const {width,height}=presentationExportDimensions(view,resolution);
      const blob=board?await sizeBoardPNG(await (await fetch(preview)).blob(),resolution):await createAmphitheaterPlate(result,{view,size:resolution,transparent,iso,ruleSource:activeSource},context,overrides);
      downloadStudyBlob(blob,'amphitheater-'+result.id+'-'+view+'-'+width+'px.png');
      setMessage('PNG exported at '+width+' × '+height+' pixels with 300 ppi metadata.');
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
    {!resolved.gathering&&<p>Proposed typology illustrations — rule content, camera and sections require review. The presentation layout is locked.</p>}
    <p className="text-sm">Exports use the displayed saved study. The four-view board follows a 2 × 2 layout for placement in InDesign.</p>
    <p className="text-sm">Presentation formatting locked: fixed fonts, colors and illustration frames. PNG exports use the approved resolution presets.</p>
    <div className="flex flex-wrap gap-3">
      <label>Presentation view<select aria-label="Presentation view" value={view} disabled={blocked} onChange={e=>setView(e.target.value as ExportView)}>
        {(Object.keys(PLATE_LABELS) as ExportView[]).map(key=><option key={key} value={key}>{PLATE_LABELS[key]}</option>)}
      </select></label>
      <label>PNG resolution<select aria-label="PNG resolution" value={resolution} disabled={blocked} onChange={e=>setResolution(+e.target.value)}>
        <option value={2048}>2048 px</option><option value={4096}>4096 px</option>
      </select></label><span>{presentationExportDimensions(view,resolution).width} {'\u00d7'} {presentationExportDimensions(view,resolution).height} px · 300 ppi</span>
      <label>Isometric direction<select aria-label="Presentation isometric direction" value={iso} disabled={blocked} onChange={e=>setCameraChoice({studyId:result.id,direction:e.target.value as PresentationOptions['iso']})}>
        {hasPier&&<option value="Pier">Column at rear right</option>}
        {(['SE','SW','NE','NW'] as const).map(direction=><option key={direction}>{direction}</option>)}
      </select></label>
      <label><input type="checkbox" checked={transparent} disabled={blocked} onChange={e=>setTransparent(e.target.checked)}/> Transparent PNG background</label>
    </div>
    {!resolved.gathering&&<details><summary>Proposed section settings</summary><label>Section axis<select aria-label="Presentation section axis" value={section?.axis??resolved.section.axis} onChange={e=>setSectionChoice({studyId:result.id,axis:e.target.value as 'x'|'y'|'longest-plan',fraction:section?.fraction??resolved.section.fraction})}><option value="x">X</option><option value="y">Y</option><option value="longest-plan">Longest plan direction</option></select></label><label>Position within saved mesh <input aria-label="Presentation section position" type="range" min={0} max={1} step={.05} value={section?.fraction??resolved.section.fraction} onChange={e=>setSectionChoice({studyId:result.id,axis:section?.axis??resolved.section.axis,fraction:+e.target.value})}/></label><button onClick={()=>setSectionChoice(null)}>Reset typology section</button><p>Display clipping only; saved geometry is unchanged.</p></details>}
    {(view==='orientation'||view==='generation'||view==='board')&&!result.voidFieldReport&&sources.length>0&&<label>Rule source<select aria-label="Rule source" value={activeSource} disabled={blocked} onChange={e=>setRuleSource(e.target.value)}>
      <option value="">All source operations</option>{sources.map(source=><option key={source.id} value={source.id}>{source.id}</option>)}
    </select></label>}
    <details open={Boolean(result.letterArrangementReport||result.architecturalGenerationReport||result.generator==='workspace-ten-rule')}><summary>{result.letterArrangementReport||result.architecturalGenerationReport||result.generator==='workspace-ten-rule'?'Workspace dual ruleset results':result.plateReport?'Orientation and generation rules':result.roomReport?'Exterior wall and interior room rules':'Measured orientation and terracing rules'}</summary>
      <div className="space-y-2 py-2">{[...rules.orientation,...rules.terraces].map(rule=><p key={rule}>{rule}</p>)}
      {!result.plateReport&&!result.roomReport&&result.request.envelopeVersion!=='void-field'&&result.generator!=='workspace-ten-rule'&&!result.letterArrangementReport&&resolved.gathering&&<p>Current middle-interior generation uses X tilt 90°. The proposed 75° and 105° X tilts require further generator support.</p>}</div>
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
