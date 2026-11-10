"use client";
import { useCallback,useEffect,useMemo,useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { BoardCanvas } from './BoardCanvas';
import { BoardOrthographicCamera } from './BoardOrthographicCamera';
import { AxisIndicator } from './AxisIndicator';
import AppNav from './AppNav';
import { LETTER_SIZE_PRESETS } from './architecturalLetterSizing';
import { OPTIMIZER_SESSION_KEY } from './browserSession';
import { collectCompositionSources,mergeCompositionSources,compositionRefreshMessage,type ProofSource as Source } from './amphitheaterCompositionSources';


import type { AmphitheaterRequest,AmphitheaterResult,AmphitheaterSummary,ProofMesh } from './amphitheaterInteractiveTypes';
function readCompositionSources(){
 return collectCompositionSources(JSON.parse(localStorage.getItem(OPTIMIZER_SESSION_KEY)??'null'),JSON.parse(localStorage.getItem('vul-optimizer-designs')??'[]'));
}
type View='isometric'|'plan'|'elevation'|'section';
type Mode='A'|'B'|'C';
const panel={border:'1px solid var(--line)',borderRadius:10,padding:16,background:'var(--panel-background)'};
const color=(i:number)=>new THREE.Color().setHSL((i*.61803398875)%1,.58,.6);
const parameterKey=(r:AmphitheaterRequest)=>[r.field.width,r.field.depth,r.field.height,r.preferredFeet].join('/');
function Camera({field,view,reset}:{field:AmphitheaterRequest['field'];view:View;reset:number}){
 const size=useThree(s=>s.size),span=Math.max(field.width,field.depth,field.height),target:[number,number,number]=[0,0,field.height/2];
 const frameSpan=view==='plan'?Math.max(field.width,field.depth):view==='section'?Math.max(field.depth,field.height):view==='elevation'?Math.max(field.width,field.height):Math.hypot(field.width,field.depth,field.height);
 const position:[number,number,number]=view==='plan'?[0,0,field.height/2+span*3]:view==='section'?[-span*3,0,field.height/2]:view==='elevation'?[0,-span*3,field.height/2]:[span*2,-span*2,field.height/2+span*2];
 return <><BoardOrthographicCamera key={view+reset+parameterKey({field,preferredFeet:0} as AmphitheaterRequest)} makeDefault position={position} up={view==='plan'?[0,1,0]:[0,0,1]} zoom={Math.min(size.width,size.height)*.82/frameSpan} near={.01} far={span*20}/><OrbitControls key={view+reset+span} makeDefault target={target} enableRotate={view==='isometric'} enablePan enableZoom/></>;
}
function Surface({mesh,tint,opacity=1,planes,selected,onPick,wire=false}:{mesh:ProofMesh;tint:THREE.ColorRepresentation;opacity?:number;planes:THREE.Plane[];selected?:boolean;onPick?:()=>void;wire?:boolean}){
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));g.setIndex(mesh.indices);g.computeVertexNormals();return g;},[mesh]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} onClick={e=>{if(onPick){e.stopPropagation();onPick();}}}><meshStandardMaterial color={selected?'#ffe374':tint} transparent={opacity<1} opacity={opacity} side={THREE.DoubleSide} clippingPlanes={planes} clipShadows wireframe={wire} polygonOffset={wire} polygonOffsetFactor={wire?-2:0}/></mesh>;
}
function FieldOutline({field}:{field:AmphitheaterRequest['field']}){
 const geometry=useMemo(()=>{const box=new THREE.BoxGeometry(field.width,field.depth,field.height),edges=new THREE.EdgesGeometry(box);box.dispose();return edges;},[field]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments geometry={geometry} position={[0,0,field.height/2]}><lineBasicMaterial color="#7b9bb4" transparent opacity={.7}/></lineSegments>;
}
function Viewer({result,field,mode,view,cut,selected,onPick,isolate,reset}:{result?:AmphitheaterResult;field:AmphitheaterRequest['field'];mode:Mode;view:View;cut:number;selected:string;onPick:(id:string)=>void;isolate:boolean;reset:number}){
 const planes=useMemo(()=>view==='section'?[new THREE.Plane(new THREE.Vector3(1,0,0),-cut)]:[],[view,cut]);
 const picked=result?.components.find(c=>c.id===selected);
 return <div style={{height:580,background:'#080b10',borderRadius:8}}><BoardCanvas dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true}} onCreated={({gl})=>{gl.localClippingEnabled=true;}}><color attach="background" args={['#080b10']}/><ambientLight intensity={1.1}/><directionalLight position={[50,-60,90]} intensity={2}/><directionalLight position={[-40,30,50]} intensity={1}/><Camera field={field} view={view} reset={reset}/><FieldOutline field={field}/>{result&&<>
 {(mode==='B'||mode==='C')&&(isolate&&picked?<Surface mesh={picked.mesh} tint="#e2d5b9" planes={planes}/>:<Surface mesh={result.architecture} tint="#e2d5b9" planes={planes}/>)}
 {(mode==='A'||mode==='B')&&result.letters.filter(l=>!isolate||!selected||l.id===selected).map(l=><Surface key={l.id} mesh={l.mesh} tint={color(result.letters.findIndex(item=>item.id===l.id))} opacity={mode==='B'?.7:1} planes={planes} selected={l.id===selected} onPick={()=>onPick(l.id)}/>)}
 {!isolate&&picked&&mode!=='A'&&<Surface mesh={picked.mesh} tint="#ffe374" planes={planes} wire/>}
 </>}<AxisIndicator/></BoardCanvas></div>;
}
export default function AmphitheaterStudio(){
 const [field,setField]=useState({width:40,depth:40,height:60}),[preferred,setPreferred]=useState(13),[population,setPopulation]=useState('auto');
 const [articulation,setArticulation]=useState(.75),[primary,setPrimary]=useState(false);
 const [organization,setOrganization]=useState<'proximity'|'alignment'>('proximity'),[generator,setGenerator]=useState<AmphitheaterRequest['generator']>('source-preserving'),[sources,setSources]=useState<Source[]>([]),[sourceId,setSourceId]=useState('fixture'),[sourceText,setSourceText]=useState('');
 const [studies,setStudies]=useState<AmphitheaterSummary[]>([]),[result,setResult]=useState<AmphitheaterResult>(),[comparison,setComparison]=useState<AmphitheaterResult>();
 const [mode,setMode]=useState<Mode>('C'),[view,setView]=useState<View>('isometric'),[cut,setCut]=useState(0),[selected,setSelected]=useState(''),[isolate,setIsolate]=useState(false),[reset,setReset]=useState(0);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('Choose a generator to begin.'),[error,setError]=useState('');
 const [sourceMessage,setSourceMessage]=useState('');
 const source=sources.find(s=>s.id===sourceId);
 const displayStudy=useCallback((data:AmphitheaterResult)=>{
  setResult(data);setField(data.request.field);setPreferred(data.request.preferredFeet);setPopulation(String(data.request.population));setGenerator(data.generator);setArticulation(data.request.articulation??0);setPrimary(false);setOrganization(data.request.organization??'proximity');setSelected('');setComparison(undefined);
  setSources(items=>[...items.filter(s=>s.id!==data.request.sourceId),{id:data.request.sourceId,name:data.request.sourceName,source:data.request.source,snapshot:data.request.sourceSnapshot}]);setSourceId(data.request.sourceId);
  const url=new URL(window.location.href);url.searchParams.set('study',data.id);window.history.replaceState(window.history.state,'',url);
 },[]);
 const refreshSources=useCallback(()=>{
  try{const imported=readCompositionSources();setSources(current=>mergeCompositionSources(current,imported,sourceId));setSourceMessage(compositionRefreshMessage(imported.length));setError('');}
  catch{setSourceMessage('Composition storage could not be read. Your selected source has been retained. Open Composition or use source JSON.');}
 },[sourceId]);
 useEffect(()=>{
  let active=true;
  fetch('/api/amphitheater').then(r=>r.json()).then(data=>{
   if(!active)return;
   setSources([{id:'fixture',name:'Recorded L/U/V proof fixture',source:data.fixture}]);setStudies(data.studies);
   try{const imported=readCompositionSources();setSources(current=>mergeCompositionSources(current,imported,'fixture'));setSourceMessage(compositionRefreshMessage(imported.length));}catch{setSourceMessage('Composition storage could not be read. Recorded and saved-study sources remain available.');}
   const id=new URL(window.location.href).searchParams.get('study');
   if(id)fetch('/api/amphitheater?id='+encodeURIComponent(id)).then(r=>r.json()).then(saved=>{if(active&&saved.id)displayStudy(saved);});
  }).catch(e=>setError(String(e)));
  return()=>{active=false;};
 },[displayStudy]);
 const currentRequest=useMemo(()=>source?{generator,articulation,organization,field,preferredFeet:preferred,population:generator==='source-preserving'||population==='auto'?'auto' as const:Number(population),sourceId:source.id,sourceName:source.name,source:source.source,sourceSnapshot:source.snapshot}:null,[source,field,preferred,population,generator,organization,articulation]);
 const stale=result&&JSON.stringify(result.request)!==JSON.stringify(currentRequest);
 async function generate(){if(!currentRequest)return;setBusy(true);setError('');setMessage('Generating actual meshes and running exported-solid / triangle checks…');
  try{const response=await fetch('/api/amphitheater',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(currentRequest)});const data:AmphitheaterResult&{error?:string}=await response.json();if(!response.ok)throw Error(data.error??'Generation failed');displayStudy(data);setStudies(s=>[{id:data.id,created:data.created,request:data.request,sourceCount:data.sourceCount,volume:data.volume},...s]);setSelected('');setComparison(undefined);setMessage('New study generated. Mesh checks passed; review architectural limitations below.');}
  catch(e){setError(e instanceof Error?e.message:String(e));setMessage('Generation rejected. Previous study retained.');}finally{setBusy(false);}
 }
 async function load(id:string,compare=false){setError('');try{const response=await fetch('/api/amphitheater?id='+encodeURIComponent(id));const data:AmphitheaterResult&{error?:string}=await response.json();if(!response.ok)throw Error(data.error);if(compare)setComparison(data);else{displayStudy(data);}}catch(e){setError(String(e));}}
 function applySource(){try{const parsed=JSON.parse(sourceText);if(!Array.isArray(parsed)||!parsed.length)throw Error('Paste an array of source placements.');const item={id:'custom',name:'Edited source composition',source:parsed};setSources(s=>[...s.filter(t=>t.id!=='custom'),item]);setSourceId('custom');setError('');}catch(e){setError(String(e));}}
 const displayField=result?.request.field??field;
 return <main className="p-4 space-y-4" style={{color:'var(--ink)'}}><AppNav/><header><h1 className="text-2xl font-semibold">Interactive Amphitheater Proof</h1><p>Existing LUV application · Z-up geometry in feet · isolated comparison workspace</p></header>
 <div role="note" style={{...panel,borderColor:'#bb9845'}}><strong>Source-driven design and baseline comparison</strong><p>The available 5ec08b0 comparison baseline rearranges, rotates and repeats source letters. It does not preserve the original Composition poses. Selecting it is an explicit comparison choice.</p></div>
 <style jsx>{`.proof-layout {display:grid;grid-template-columns:minmax(270px,340px) minmax(0,1fr);gap:20px} @media(max-width:900px){.proof-layout{grid-template-columns:1fr}}`}</style><div className="proof-layout">
 <aside className="space-y-4"><section style={panel} className="space-y-3"><h2>Generation controls</h2>
 {generator==='source-preserving'&&<label className="block">Envelope articulation · {Math.round(articulation*100)}%<input type="range" min="0" max="1" step=".05" value={articulation} disabled={busy} onChange={e=>setArticulation(+e.target.value)}/></label>}{generator==='source-preserving'&&<label>Relationship priority<select value={organization} onChange={e=>setOrganization(e.target.value as typeof organization)}><option value="proximity">Proximity</option><option value="alignment">Proximity and tangent alignment</option></select></label>}<label className="block">Generator<select aria-label="Generator" className="block w-full" value={generator} disabled={busy} onChange={e=>setGenerator(e.target.value as AmphitheaterRequest['generator'])}><option value="source-preserving">Source-preserving — original relationships</option><option value="typology-baseline">Typology-driven comparison baseline</option></select></label>
 <label className="block">Typology<select aria-label="Typology" className="block w-full"><option>Stepped Amphitheater</option></select></label>
 {(['width','depth','height'] as const).map((axis,i)=><label className="block" key={axis}>{['Width X','Depth Y','Height Z'][i]} (ft)<select aria-label={axis} className="block w-full" value={field[axis]} disabled={busy} onChange={e=>setField(f=>({...f,[axis]:+e.target.value}))}>{[20,40,60].map(n=><option key={n}>{n}</option>)}</select></label>)}
 <label className="block">Preferred letter size (ft)<input aria-label="Preferred letter size" className="block w-full" type="number" min="0.1" step="0.1" value={preferred} disabled={busy} onChange={e=>setPreferred(+e.target.value)}/></label>
 <div className="flex gap-2">{([20,40,60] as const).map(h=><button key={h} disabled={busy} onClick={()=>setPreferred(LETTER_SIZE_PRESETS[h].preferredFeet)} className="border p-1">{LETTER_SIZE_PRESETS[h].preferredFeet}′ preset</button>)}</div><p className="text-xs">Letter presets and field dimensions are independent.</p>
 <label className="block">Letter population<input aria-label="Letter population" className="block w-full" value={generator==='source-preserving'?source?.source.length??0:population} disabled={busy||generator==='source-preserving'} onChange={e=>setPopulation(e.target.value)} placeholder="auto or integer"/></label>
 <label className="block">Source composition<select aria-label="Source composition" className="block w-full" value={sourceId} disabled={busy} onChange={e=>setSourceId(e.target.value)}>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="border p-1" disabled={busy} onClick={refreshSources}>Refresh Composition source list</button><p role="status" className="text-xs">{sourceMessage}</p><a className="underline text-sm" href="/composition" target="_blank" rel="noreferrer">Open Composition to create a study</a><p className="text-xs">Reads current and saved alternatives from Composition on this app origin. Selected windows are localized by translation only before submission. The baseline then rearranges them.</p>
 <button className="border rounded p-3 w-full" disabled={busy||!source||!generator} onClick={()=>void generate()}>{busy?'Generating and validating…':generator==='source-preserving'?'Generate from original letters':'Generate baseline study'}</button><p role="status">{message}</p>{error&&<p role="alert" style={{color:'#ed8989',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{error}</p>}
 </section><details style={panel}><summary>Inspect / edit input composition</summary><p className="text-xs">Edit x/y/z in feet, rx/ry/rz in degrees and scale per instance. Apply before generating.</p><button className="border p-1" onClick={()=>setSourceText(JSON.stringify(source?.source??[],null,2))}>Copy selected source into editor</button><textarea aria-label="Source JSON" style={{width:'100%',height:220,fontSize:11}} value={sourceText} onChange={e=>setSourceText(e.target.value)}/><button disabled={busy} className="border p-1" onClick={applySource}>Use edited source</button></details>
 </aside><section className="space-y-3" style={{minWidth:0}}><section style={panel}><div className="flex flex-wrap gap-2">{(['A','B','C'] as const).map(m=><button aria-pressed={mode===m} className="border rounded p-2" key={m} onClick={()=>setMode(m)}>{m} — {m==='A'?'Original Letters':m==='B'?'Letters + Architecture':'Architecture Only'}</button>)}</div><p className="text-xs my-2">{result?.generator==='typology-baseline'?'Baseline: rearranged source population.':'Original poses; all geometry uses the same field-center to floor translation.'}</p><div className="flex flex-wrap gap-2">{(['isometric','plan','elevation','section'] as const).map(v=><button className="border p-2" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}<button className="border p-2" onClick={()=>setReset(r=>r+1)}>Reset camera</button></div>{view==='section'&&<label>Section X = {cut.toFixed(1)} ft<input aria-label="Section position" type="range" min={-displayField.width/2} max={displayField.width/2} step="0.1" value={cut} onChange={e=>setCut(+e.target.value)}/></label>}
 <p className="text-xs my-2">Orbit: left drag in isometric. Pan: right drag. Zoom: wheel. Section clips at X; A/B/C share exact coordinates and field framing.</p>
 {stale&&<p style={{color:'#e4c67f'}}>Controls differ from the displayed study. Generate to evaluate the new settings.</p>}
 {result?.primary&&<button className="border p-2" onClick={()=>setPrimary(!primary)}>{primary?'Viewing primary envelope · show articulated':'Viewing articulated envelope · show primary'}</button>}
 <Viewer result={primary&&result?.primary?{...result,architecture:result.primary,components:[]}:result} field={displayField} mode={mode} view={view} cut={cut} selected={selected} onPick={setSelected} isolate={isolate} reset={reset}/>
 <p>{result?`Displayed study: ${displayField.width} × ${displayField.depth} × ${displayField.height} ft · ${result.request.preferredFeet} ft letters · ${result.sourceCount} actual instances · ${result.volume.toFixed(3)} ft³`:'No saved geometry is preloaded. Generate a new study.'}</p>
 {result?.articulationReport&&<section><h2>Envelope articulation</h2><p>Primary {result.articulationReport.before.toFixed(2)} ft³ · Final {result.volume.toFixed(2)} ft³ · Removed {result.articulationReport.removed.toFixed(2)} ft³ · Added {(result.articulationReport.added??0).toFixed(2)} ft³ · {result.articulationReport.components} connected component(s)</p><p>{result.articulationReport.operations.filter(o=>o.kind==='backed pocket').length} backed pockets · {result.articulationReport.operations.filter(o=>o.alcove).length} alcove candidates · {result.articulationReport.operations.filter(o=>o.kind==='through opening').length} through openings · {result.articulationReport.overhangs} sheltered cuts · {result.articulationReport.addedProjections} outward additions</p>{result.articulationReport.operations.map(o=><p key={o.id}>{o.kind} · {o.sources.join(' / ')} · {o.feature} · {o.profile} · W × D × H {o.width.toFixed(1)} × {o.depth.toFixed(1)} × {o.height.toFixed(1)} ft · bay {o.bayDepth.toFixed(1)} ft{o.alcove?' · alcove candidate':''}</p>)}</section>}{result?.features&&<details open><summary>Source derivation · plan</summary><svg viewBox={[-displayField.width/2,-displayField.depth/2,displayField.width,displayField.depth].join(" ")} style={{width:"100%",height:170}}><g transform="scale(1,-1)">{result.features.map(f=><polyline key={f.id} fill="none" stroke="#67bace" strokeWidth=".28" points={f.line.map(p=>p.slice(0,2).join(",")).join(" ")}/>)}{result.paths?.map((f,i)=><polyline key={i} fill="none" stroke="orange" strokeWidth=".4" points={f.line.map(p=>p.slice(0,2).join(",")).join(" ")}/>)}</g></svg>Blue: source edges. Orange: cross-letter trajectories.</details>}{result&&<><p style={{color:result.architecturalValidation?.passed?'#9bd4a5':'#edb780'}}>{result.architecturalValidation?(result.architecturalValidation.passed?'Architectural relationship checks passed.':'Architectural relationship checks FAILED — comparison only.'):'Functional architectural compliance has not been verified.'}</p><label>Inspect instance / component<select aria-label="Inspect object" className="block w-full" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All objects</option><optgroup label="Source instances">{result.letters.map(l=><option key={l.id}>{l.id}</option>)}</optgroup><optgroup label="Architectural components">{result.components.map(c=><option key={c.id}>{c.id}</option>)}</optgroup></select></label><label><input type="checkbox" checked={isolate} onChange={e=>setIsolate(e.target.checked)}/> Isolate selected object</label><p className="text-xs">{result.components.find(c=>c.id===selected)?.sources?.join(' · ')}</p><p>Independent geometry check: {result.validation.selfIntersectionPairs} crossings / overlaps across {result.validation.nonAdjacentTriangleChecks.toLocaleString()} pairs.</p>{result.warnings.map(w=><p className="text-xs mt-2" key={w}>{w}</p>)}<a className="underline" href={'/api/amphitheater?id='+result.id} target="_blank" rel="noreferrer">Full study snapshot and meshes (JSON)</a></>}
 </section>
 <section style={panel}><h2>Saved studies and alternatives</h2><p className="text-xs">Every generation retains exact source and settings on disk. Compare is available for matching field dimensions and preferred letter size; no rescaling is applied.</p>{studies.map((s,i)=><div className="flex gap-2 items-center border-t py-2" key={s.id}><span>Study {studies.length-i} · {s.request.field.width}/{s.request.field.depth}/{s.request.field.height} · {s.request.preferredFeet}′ · {s.sourceCount} letters · {s.request.sourceName}</span><button className="border p-1" onClick={()=>void load(s.id)}>Open</button><button className="border p-1" disabled={!result||result.id===s.id||parameterKey(result.request)!==parameterKey(s.request)} onClick={()=>void load(s.id,true)}>Compare</button></div>)}</section>
 {comparison&&<section style={panel}><h2>Comparison study · matching field and size</h2><button className="border p-1" onClick={()=>setComparison(undefined)}>Close comparison</button><p>{comparison.request.sourceName} · {comparison.sourceCount} letters · {comparison.volume.toFixed(3)} ft³ · population {comparison.request.population}</p><Viewer result={comparison} field={comparison.request.field} mode={mode} view={view} cut={cut} selected="" onPick={()=>{}} isolate={false} reset={reset}/></section>}
 </section></div></main>;
}






