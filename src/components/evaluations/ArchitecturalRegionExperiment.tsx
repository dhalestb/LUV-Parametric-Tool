"use client";
import {useState} from 'react';
import type {ImportedObj,UnitName,UpAxisMode} from '../lattice/types';
import {resolvedUp,UNIT_TO_FEET} from '../lattice/types';
import type {V4Context} from './v4/evaluateV4';
import type {RegionReconstruction} from './v4/architecturalRegions';
import {regionDiagnosticSvg} from './v4/architecturalRegionDiagnostics';

export default function ArchitecturalRegionExperiment({meshes,unit,upAxisMode}:{meshes:ImportedObj[];unit:UnitName;upAxisMode:UpAxisMode}){
  const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [items,setItems]=useState<Array<{filename:string;ctx:V4Context;result:RegionReconstruction}>>([]);
  const [samples,setSamples]=useState(false),[walk,setWalk]=useState(false);
  const save=(name:string,text:string,type:string)=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function run(){setBusy(true);setError('');try{
    const {buildV4Context}=await import('./v4/evaluateV4');const {reconstructArchitecturalRegions}=await import('./v4/architecturalRegions');
    const next=[];for(const mesh of meshes){await new Promise(resolve=>setTimeout(resolve,0));const ctx=buildV4Context({positions:mesh.positions,faces:mesh.faces,up:resolvedUp(mesh.upAxis,upAxisMode),unitScale:UNIT_TO_FEET[unit]},mesh.id);const result=reconstructArchitecturalRegions(ctx,{enabled:true})!;next.push({filename:mesh.filename,ctx,result});}setItems(next);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <details className="rounded border p-3 text-[12px]" style={{borderColor:'var(--line)'}}><summary>Phase 2 architectural region experiment</summary>
    <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable isolated diagnostic (production scores unchanged)</label>
    {enabled&&<div className="space-y-2"><button disabled={busy||!meshes.length} onClick={()=>void run()}>{busy?'Reconstructing experimental regions…':'Run Phase 2 diagnostics'}</button>
      <label><input type="checkbox" checked={samples} onChange={e=>setSamples(e.target.checked)}/> Show original samples</label>
      <label><input type="checkbox" checked={walk} onChange={e=>setWalk(e.target.checked)}/> Show original movement edges</label>
      {error&&<p>{error}</p>}
      {items.length>0&&<button onClick={()=>save('architectural-phase2-diagnostics.json',JSON.stringify(items.map(({filename,ctx,result})=>({filename,result,sampleGraph:{nodes:ctx.network.nodes,edges:ctx.network.edges,levelLinks:ctx.network.levelLinks,samples:ctx.field.samples},levels:ctx.field.levels.map(l=>({id:l.id,elevation:l.elevation})),visuals:{before:regionDiagnosticSvg(ctx,result,{old:true}),after:regionDiagnosticSvg(ctx,result),isometric:regionDiagnosticSvg(ctx,result,{isometric:true}),plans:ctx.field.levels.map(l=>({levelId:l.id,before:regionDiagnosticSvg(ctx,result,{old:true,levelId:l.id}),after:regionDiagnosticSvg(ctx,result,{levelId:l.id})}))}})),null,2),'application/json')}>Export Phase 2 evidence and diagrams</button>}
      {items.map(({filename,ctx,result})=><section key={result.sourceId}><h3>{filename}</h3><p>Original retained regions {result.originalRegions} → {result.regions.filter(r=>!r.transitional).length} experimental spaces + {result.regions.filter(r=>r.transitional).length} small transitions/fragments · Verified movement records {result.originalRegionEdges} → {result.movementConnections.filter(c=>c.status==='verified').length} · Verified organizational records {result.organizationalRelationships.filter(c=>c.status==='verified').length}</p><p>Experimental sampled geometry; shared-wall relationships are not walking routes. Small fragments are retained evidence, not confirmed architectural rooms.</p><div className="grid grid-cols-2 gap-2">{[true,false].map(old=><img key={String(old)} alt={`${filename} ${old?'original':'experimental'} region boundaries`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(regionDiagnosticSvg(ctx,result,{old,isometric:true,showSamples:samples,showWalkEdges:walk}))}`}/>)}</div></section>)}
    </div>}
  </details>;
}
