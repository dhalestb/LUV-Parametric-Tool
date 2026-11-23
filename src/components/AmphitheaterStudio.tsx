"use client";

import {useCallback,useEffect,useMemo,useState} from 'react';
import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {OrbitControls} from '@react-three/drei';
import {useThree} from '@react-three/fiber';
import {BoardCanvas} from './BoardCanvas';
import {BoardOrthographicCamera} from './BoardOrthographicCamera';
import {AxisIndicator} from './AxisIndicator';
import AppNav from './AppNav';
import AmphitheaterPresentation from './AmphitheaterPresentation';
import type {AmphitheaterRequest,AmphitheaterResult,AmphitheaterSummary,ProofMesh} from './amphitheaterInteractiveTypes';
import {requirementsForWorkspaceRule,WORKSPACE_DEFAULT_FIELDS,WORKSPACE_FIELD_PRESETS,WORKSPACE_TYPOLOGIES,workspaceTypologyName,type DualRulesetReport,type WorkspaceTypology} from './workspaceDualRulesets';
import {sectionsForTypology} from './workspaceRulesetCatalog';
import {FLAT_PLATE_PRESETS,flatPlateClearHeightCheck,flatPlateDimensions,flatPlateSettingsError} from './workspace-rules/flat-deep-plan-plate.plan';
import {flatPlateFloorGuideError} from './workspace-rules/flat-deep-plan-plate';
import {
  OPEN_HALL_COLUMN_GRID_SPACINGS,
  OPEN_HALL_COLUMN_SIZES,
  OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING,
  OPEN_HALL_DEFAULT_COLUMN_SIZE,
  OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE,
  OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE,
  OPEN_HALL_DEFAULT_SLAB_THICKNESS,
  OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE,
  OPEN_HALL_FLOOR_MEZZ_GUIDE_SIZES,
  OPEN_HALL_ROOF_GUIDE_SIZES,
  OPEN_HALL_WALL_GUIDE_SIZES,
  OPEN_HALL_WALL_THICKNESS,
  buildOpenHallGuideLetters,
  normalizeOpenHallGuideSize,
} from "./workspace-rules/open-hall-workspace";
import {
 OPEN_HALL_DEFAULT_MEZZANINE,
 OPEN_HALL_DEFAULT_ROOF_INSET,
 OPEN_HALL_DEFAULT_ROOF_SIZING,
 OPEN_HALL_MEZZANINE_OPTIONS,
 OPEN_HALL_ROOF_SIZING_OPTIONS,
 openHallColumnGridError,
 openHallFieldPresetError,
 openHallRequestGeometry,
} from "./workspace-rules/open-hall-workspace";

type View='isometric'|'plan'|'elevation'|'section';
type Mode='A'|'B'|'C';
const panel={border:'1px solid var(--line)',borderRadius:10,padding:16,background:'var(--panel-background)'};
const color=(i:number)=>new THREE.Color().setHSL((i*.61803398875)%1,.58,.6);
 const parameterKey=(r:AmphitheaterRequest)=>[r.field.width,r.field.depth,r.field.height,r.preferredFeet,r.workspaceTypology??'',r.openHall?.mezzanineFaces??'',r.openHall?.columnSize??'',r.openHall?.columnGridSpacing??'',r.openHall?.floorMezzGuideSize??'',r.openHall?.wallGuideSize??'',r.openHall?.roofGuideSize??'',r.openHall?.roofSizing??'fixed',r.openHall?.roofInset??0,r.rulesetVersion??''].join('/');
function generationSettingsKey(request: AmphitheaterRequest) {
 if (request.workspaceTypology === 'flat-deep-plan-plate') {
  const dimensions = flatPlateDimensions(request.flatPlate);
  return [
   parameterKey({...request, preferredFeet: dimensions.floorMezzGuideSize}),
   ...Object.values(dimensions),
   request.flatPlate?.joinWalls === true,
  ].join('/');
 }
 if (request.workspaceTypology !== 'open-hall-workspace') return parameterKey(request);
 const openHall = request.openHall;
 const pillarSized = openHall?.roofSizing === 'pillar';
 const activeRoofSettings = {
  roofGuideSize: pillarSized ? undefined : openHall?.roofGuideSize ?? OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE,
  roofInset: pillarSized ? openHall?.roofInset : undefined,
 };
 return [
  parameterKey({...request, openHall: {...openHall, ...activeRoofSettings}}),
  openHall?.wallThickness ?? OPEN_HALL_WALL_THICKNESS,
  openHall?.slabThickness ?? OPEN_HALL_DEFAULT_SLAB_THICKNESS,
 ].join('/');
}
const FLAT_PLATE_DEFAULTS = flatPlateDimensions(undefined);
function WorkspaceRuleGroup({report}: {report: DualRulesetReport}) {
 const title = report.stage === 'letter-arrangement' ? 'Letter Arrangement' : 'Architectural Generation';
 return <details open>
  <summary><strong>{title}</strong> · {report.rulesetId} v{report.rulesetVersion} · {report.overall.toUpperCase()} · {report.rules.length} rules</summary>
  {report.rules.map(rule=>{
   const requirements = requirementsForWorkspaceRule(report, rule);
   return <details key={rule.id} open style={{border:'1px solid var(--line)',borderRadius:6,padding:8,marginTop:6}}>
    <summary>{rule.id} · {rule.status.toUpperCase()} · {rule.title}</summary>
    {requirements.length>0&&<ul className="my-2 list-disc pl-5 text-xs">
     {requirements.map(requirement=><li key={requirement}>{requirement}</li>)}
    </ul>}
    {rule.measured&&<p className="text-xs">Measured {rule.measured}{rule.threshold?` · threshold ${rule.threshold}`:''}{rule.units?` · ${rule.units}`:''}</p>}
    {rule.evidence.map((item,index)=><p className="text-xs" key={index}>{item}</p>)}
   </details>;
  })}
 </details>;
}
function Camera({field,view,reset}:{field:AmphitheaterRequest['field'];view:View;reset:number}){
 const size=useThree(s=>s.size),span=Math.max(field.width,field.depth,field.height),target:[number,number,number]=[0,0,field.height/2];
 const frameSpan=view==='plan'?Math.max(field.width,field.depth):view==='section'?Math.max(field.depth,field.height):view==='elevation'?Math.max(field.width,field.height):Math.hypot(field.width,field.depth,field.height);
 const position:[number,number,number]=view==='plan'?[0,0,field.height/2+span*3]:view==='section'?[-span*3,0,field.height/2]:view==='elevation'?[0,-span*3,field.height/2]:[span*2,-span*2,field.height/2+span*2];
 return <><BoardOrthographicCamera key={view+reset+parameterKey({field,preferredFeet:0} as AmphitheaterRequest)} makeDefault position={position} up={view==='plan'?[0,1,0]:[0,0,1]} zoom={Math.min(size.width,size.height)*.82/frameSpan} near={.01} far={span*20}/><OrbitControls key={view+reset+span} makeDefault target={target} enableRotate={view==='isometric'} enablePan enableZoom/></>;
}
function Surface({mesh,tint,opacity=1,planes,selected,onPick,wire=false,sharp=false}:{mesh:ProofMesh;tint:THREE.ColorRepresentation;opacity?:number;planes:THREE.Plane[];selected?:boolean;onPick?:()=>void;wire?:boolean;sharp?:boolean}){
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));g.setIndex(mesh.indices);if(sharp){const creased=toCreasedNormals(g,Math.PI/6);if(creased!==g)g.dispose();return creased;}g.computeVertexNormals();return g;},[mesh,sharp]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} onClick={e=>{if(onPick){e.stopPropagation();onPick();}}}><meshStandardMaterial color={selected?'#ffe374':tint} transparent={opacity<1} opacity={opacity} side={THREE.DoubleSide} clippingPlanes={planes} clipShadows wireframe={wire} polygonOffset={wire} polygonOffsetFactor={wire?-2:0}/></mesh>;
}
function FieldOutline({field}:{field:AmphitheaterRequest['field']}){
 const geometry=useMemo(()=>{const box=new THREE.BoxGeometry(field.width,field.depth,field.height),edges=new THREE.EdgesGeometry(box);box.dispose();return edges;},[field]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments geometry={geometry} position={[0,0,field.height/2]}><lineBasicMaterial color="#7b9bb4" transparent opacity={.7}/></lineSegments>;
}
function Viewer({result,field,mode,view,cut,selected,onPick,isolate,reset,showWalls=true}:{result?:AmphitheaterResult;field:AmphitheaterRequest['field'];mode:Mode;view:View;cut:number;selected:string;onPick:(id:string)=>void;isolate:boolean;reset:number;showWalls?:boolean}){
 const planes=useMemo(()=>view==='section'?[new THREE.Plane(new THREE.Vector3(1,0,0),-cut)]:[],[view,cut]);
 const picked=result?.components.find(c=>c.id===selected);
 const wallMesh=result?.perimeterWalls??result?.components.find(c=>c.id==='workspace-walls')?.mesh;
 return <div style={{height:580,background:'#080b10',borderRadius:8}}><BoardCanvas dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true}} onCreated={({gl})=>{gl.localClippingEnabled=true;}}><color attach="background" args={['#080b10']}/><ambientLight intensity={1.1}/><directionalLight position={[50,-60,90]} intensity={2}/><directionalLight position={[-40,30,50]} intensity={1}/><Camera field={field} view={view} reset={reset}/><FieldOutline field={field}/>{result&&<>
 {(mode==='B'||mode==='C')&&(isolate&&picked?<Surface sharp mesh={picked.mesh} tint="#e2d5b9" planes={planes}/>:<Surface sharp mesh={result.architecture} tint="#e2d5b9" planes={planes}/>)}
 {(mode==='B'||mode==='C')&&showWalls&&!(result.request.workspaceTypology==='open-hall-workspace'&&result.request.openHall?.joinWalls)&&wallMesh&&wallMesh.indices.length>0&&!isolate&&<Surface sharp mesh={wallMesh} tint="#e2d5b9" planes={planes} selected={selected==='workspace-walls'} onPick={()=>onPick('workspace-walls')}/>}
 {(mode==='A'||mode==='B')&&result.letters.filter(l=>!isolate||!selected||l.id===selected).map(l=><Surface key={l.id} mesh={l.mesh} tint={color(result.letters.findIndex(item=>item.id===l.id))} opacity={mode==='B'?.7:1} planes={planes} selected={l.id===selected} onPick={()=>onPick(l.id)}/>)}
 {!isolate&&picked&&mode!=='A'&&picked.id!=='workspace-walls'&&<Surface mesh={picked.mesh} tint="#ffe374" planes={planes} wire/>}
 </>}<AxisIndicator/></BoardCanvas></div>;
}
export default function AmphitheaterStudio() {
 const [workspaceTypology,setWorkspaceTypology]=useState<WorkspaceTypology>('open-hall-workspace');
 const [field,setField]=useState(WORKSPACE_DEFAULT_FIELDS['open-hall-workspace']);
 const [result,setResult]=useState<AmphitheaterResult>();
 const [studies,setStudies]=useState<AmphitheaterSummary[]>([]);
 const [comparison,setComparison]=useState<AmphitheaterResult>();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [mode,setMode]=useState<Mode>('C');
 const [view,setView]=useState<View>('isometric');
 const [cut,setCut]=useState(0);
 const [selected,setSelected]=useState('');
 const [isolate,setIsolate]=useState(false);
 const [reset,setReset]=useState(0);

 const [mezzanineFaces,setMezzanineFaces]=useState<2|3|4>(OPEN_HALL_DEFAULT_MEZZANINE);
 const [perimeterWalls,setPerimeterWalls]=useState(true),[joinWalls,setJoinWalls]=useState(false);
 const [wallThickness,setWallThickness]=useState(OPEN_HALL_WALL_THICKNESS),[slabThickness,setSlabThickness]=useState(OPEN_HALL_DEFAULT_SLAB_THICKNESS);
 const [columnSize,setColumnSize]=useState(OPEN_HALL_DEFAULT_COLUMN_SIZE);
 const [flatColumnSize,setFlatColumnSize]=useState(FLAT_PLATE_DEFAULTS.columnSize),[flatFloorGuide,setFlatFloorGuide]=useState(FLAT_PLATE_DEFAULTS.floorMezzGuideSize),[flatWallGuide,setFlatWallGuide]=useState(FLAT_PLATE_DEFAULTS.wallGuideSize);
 const [flatShowWalls,setFlatShowWalls]=useState(true),[flatJoinWalls,setFlatJoinWalls]=useState(false);
 const [flatColumnSpacing,setFlatColumnSpacing]=useState(FLAT_PLATE_DEFAULTS.columnSpacing),[flatWallThickness,setFlatWallThickness]=useState(FLAT_PLATE_DEFAULTS.wallThickness),[flatSlabThickness,setFlatSlabThickness]=useState(FLAT_PLATE_DEFAULTS.slabThickness);
 const [columnGridSpacing,setColumnGridSpacing]=useState(OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING);
 const [floorMezzGuideSize,setFloorMezzGuideSize]=useState(OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE);
 const [wallGuideSize,setWallGuideSize]=useState(OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE);
 const [roofGuideSize,setRoofGuideSize]=useState(OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE); const [roofSizing,setRoofSizing]=useState<'fixed'|'pillar'>(OPEN_HALL_DEFAULT_ROOF_SIZING); const [roofInset,setRoofInset]=useState(OPEN_HALL_DEFAULT_ROOF_INSET);

 const openHallError = workspaceTypology === 'open-hall-workspace'
  ? openHallFieldPresetError(field) ?? openHallColumnGridError({columnSize,columnGridSpacing})
  : undefined;
 const flatPlate = useMemo(() => ({
  columnSize: flatColumnSize, floorMezzGuideSize: flatFloorGuide, wallGuideSize: flatWallGuide,
  columnSpacing: flatColumnSpacing, wallThickness: flatWallThickness, slabThickness: flatSlabThickness,
  showWalls: flatShowWalls, joinWalls: flatJoinWalls,
 }), [flatColumnSize, flatFloorGuide, flatWallGuide, flatColumnSpacing, flatWallThickness, flatSlabThickness, flatShowWalls, flatJoinWalls]);
 const flatPlateMode = workspaceTypology === 'flat-deep-plan-plate';
 const savedRulesTypology=result?.request.workspaceTypology;
 const savedRulesMatchSelection=savedRulesTypology===workspaceTypology;
 const flatClearHeight = flatPlateClearHeightCheck(field.height, flatSlabThickness);
 const flatPlateError = flatPlateMode
  ? flatPlateSettingsError(flatPlate) ?? (flatClearHeight.ok ? flatPlateFloorGuideError({...field, flatPlate}) : flatClearHeight.detail)
  : undefined;
 const unavailableFloorGuides = flatPlateMode && flatClearHeight.ok
  ? FLAT_PLATE_PRESETS.floorMezzGuideSize.filter(floorMezzGuideSize => flatPlateFloorGuideError({...field, flatPlate:{...flatPlate, floorMezzGuideSize}}))
  : [];
 const generationBlocked = Boolean(openHallError || flatPlateError);

 const displayField=result?.request.field??field;
 const openHall={mezzanineFaces,perimeterWalls,joinWalls,wallThickness,slabThickness,columnSize,columnGridSpacing,floorMezzGuideSize,wallGuideSize,roofGuideSize,roofSizing,roofInset};
 const draft: AmphitheaterRequest = {
   generator:'workspace-ten-rule',envelopeVersion:'workspace-ten-rule',workspaceTypology,field,
   preferredFeet:flatPlateMode?flatFloorGuide:floorMezzGuideSize,
   ...(flatPlateMode?{flatPlate}:{openHall}),
   source:[],sourceId:'',sourceName:'',population:'auto',
 };
 const stale = result && generationSettingsKey(result.request)!==generationSettingsKey({...draft,rulesetVersion:result.request.rulesetVersion});

 const displayStudy=useCallback((study: AmphitheaterResult)=>{
  const request=study.request;
  const flatSettings=flatPlateDimensions(request.flatPlate);
  const hallSettings=openHallRequestGeometry(request.openHall,request.preferredFeet);
  setResult(study);setField(request.field);setWorkspaceTypology(request.workspaceTypology);
  setFlatColumnSize(flatSettings.columnSize);setFlatFloorGuide(flatSettings.floorMezzGuideSize);setFlatWallGuide(flatSettings.wallGuideSize);
  setFlatColumnSpacing(flatSettings.columnSpacing);setFlatWallThickness(flatSettings.wallThickness);setFlatSlabThickness(flatSettings.slabThickness);
  setFlatShowWalls(request.flatPlate?.showWalls!==false);setFlatJoinWalls(request.flatPlate?.joinWalls===true);
  setMezzanineFaces(hallSettings.mezzanineFaces);setColumnSize(hallSettings.columnSize);setColumnGridSpacing(hallSettings.columnGridSpacing);
  setFloorMezzGuideSize(hallSettings.floorMezzGuideSize);setWallGuideSize(hallSettings.wallGuideSize);setRoofGuideSize(hallSettings.roofGuideSize);
  setRoofSizing(hallSettings.roofSizing);setRoofInset(hallSettings.roofInset);setWallThickness(hallSettings.wallThickness);setSlabThickness(hallSettings.slabThickness);
  setPerimeterWalls(request.openHall?.perimeterWalls!==false);setJoinWalls(request.openHall?.joinWalls===true);
  setComparison(undefined);setSelected('');
  const url=new URL(window.location.href);url.searchParams.set('study',study.id);window.history.replaceState(window.history.state,'',url);
 },[]);

 const fetchStudy=useCallback(async(id:string)=>{
  const response=await fetch('/api/amphitheater?id='+encodeURIComponent(id));
  const data: AmphitheaterResult & {error?:string}=await response.json();
  if(!response.ok)throw Error(data.error??'The saved study could not be opened.');
  return data;
 },[]);

 useEffect(()=>{
  let active=true;
  async function loadStudies(){
   const response=await fetch('/api/amphitheater');
   const data=await response.json();
   if(!response.ok)throw Error(data.error??'Study storage unavailable.');
   if(!active)return;
   setStudies(data.studies);
   const id=new URL(window.location.href).searchParams.get('study');
   if(id){const study=await fetchStudy(id);if(active)displayStudy(study);}
  }
  void loadStudies().catch(cause=>{if(active)setError(String(cause));});
  return()=>{active=false;};
 },[displayStudy,fetchStudy]);

 async function generate(regenerate=false) {
  setBusy(true);setError('');setMessage('Generating and validating the study…');
  try {
   let request: AmphitheaterRequest={...draft,sourceId:crypto.randomUUID(),sourceName:workspaceTypologyName(workspaceTypology)};
   if(regenerate&&result){
    const saved=result.request;
    request={...request,source:saved.source,sourceId:saved.sourceId,sourceName:saved.sourceName,sourceSnapshot:saved.sourceSnapshot,population:saved.source.length};
    if(workspaceTypology==='open-hall-workspace'){
     const guides=buildOpenHallGuideLetters({...field,...openHall});
     if(guides.length!==request.source.length)request={...request,source:guides,population:guides.length,sourceId:crypto.randomUUID(),sourceName:workspaceTypologyName(workspaceTypology)+" · "+guides.length+" letters",sourceSnapshot:undefined};
    }
   }
   const response=await fetch('/api/amphitheater',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(regenerate?request:{...request,guideSource:'ruleset'})});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error??'Generation failed.');
   const study:AmphitheaterResult=payload.architecture?payload:await fetchStudy(payload.id);
   displayStudy(study);setStudies(items=>[study,...items]);setMessage('Study saved. Mesh checks passed.');
  } catch(cause){setError(cause instanceof Error?cause.message:String(cause));setMessage('');}finally{setBusy(false);}
 }

 async function openStudy(id:string,compare=false){
  try{const study=await fetchStudy(id);if(compare)setComparison(study);else displayStudy(study);}
  catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
 }

 return <main className="space-y-4 p-4">
  <AppNav/>
  <h1>Proto-Form Generation</h1>
  <div className="grid gap-5 lg:grid-cols-[minmax(270px,340px)_minmax(0,1fr)]">
   <aside className="space-y-3" style={panel}>
    <h2>Generation controls</h2>
    <label className="block">Typology<select aria-label="Typology" className="block w-full" value={workspaceTypology} disabled={busy} onChange={event=>{const typology=event.target.value as WorkspaceTypology;setWorkspaceTypology(typology);setField(WORKSPACE_DEFAULT_FIELDS[typology]);setError("");}}>
      {WORKSPACE_TYPOLOGIES.map(([id,name])=><option key={id} value={id}>{name}</option>)}
    </select></label>
 {<section aria-label="Current typology rules">
  <h3>Current rules · {workspaceTypologyName(workspaceTypology)}</h3>
  {sectionsForTypology(workspaceTypology).map(section=><details key={section.id}>
   <summary>{section.stage==='letter-arrangement'?'Letter Arrangement':'Architectural Generation'} · {section.requirements.length} rules</summary>
   <ol className="list-decimal space-y-2 pl-5 text-xs">
    {section.requirements.map(requirement=><li key={requirement}>{requirement}</li>)}
   </ol>
  </details>)}
 </section>}
 {flatPlateMode&&<fieldset className="space-y-2">
  <legend>Flat Deep Plan Plate</legend>
  {([['Column L size',flatColumnSize,setFlatColumnSize,FLAT_PLATE_PRESETS.columnSize],['Floor and mezzanine L size',flatFloorGuide,setFlatFloorGuide,FLAT_PLATE_PRESETS.floorMezzGuideSize],['Wall L size',flatWallGuide,setFlatWallGuide,FLAT_PLATE_PRESETS.wallGuideSize]] as const)
   .map(([label,value,setValue,presets])=><div key={label}>
    <p className="text-xs mb-1">{label}</p>
    <div className="flex gap-2 flex-wrap">
     {presets.map(n=><button key={n} type="button" className="border p-1" aria-label={`${label} ${n} ft`} aria-pressed={value===n}
      disabled={busy||(label==='Floor and mezzanine L size'&&unavailableFloorGuides.some(size=>size===n))} onClick={()=>setValue(n)}>{n}′</button>)}
     <label className="text-xs flex items-center gap-1">Custom<input className="border w-16 p-1" aria-label={label} type="number" min="0" step="any" disabled={busy} value={value} onChange={e=>setValue(+e.target.value)}/></label>
    </div>
    {label==='Floor and mezzanine L size'&&unavailableFloorGuides.length>0&&<p className="text-xs">Larger presets need more room at the floor and mezzanine corners.</p>}
   </div>)}
  <div>
   <p className="text-xs mb-1">Target column grid spacing (ft)</p>
   <div className="flex gap-2 flex-wrap">
    {FLAT_PLATE_PRESETS.columnSpacing.map(n=><button key={n} type="button" className="border p-1" aria-pressed={flatColumnSpacing===n} disabled={busy} onClick={()=>setFlatColumnSpacing(n)}>{n}′</button>)}
    <label className="text-xs flex items-center gap-1">Custom<input className="border w-16 p-1" aria-label="Custom flat plate column spacing" type="number" min="1" step="any" disabled={busy} value={flatColumnSpacing} onChange={e=>setFlatColumnSpacing(+e.target.value)}/></label>
   </div>
   <p className="text-xs">A span shorter than the target uses one fitting bay.</p>
  </div>
  <div className="grid grid-cols-2 gap-2">
   <label className="text-xs">Wall thickness (ft)<input aria-label="Flat plate wall thickness" className="block border w-full p-1" type="number" min="0" step="any" disabled={busy} value={flatWallThickness} onChange={e=>setFlatWallThickness(+e.target.value)}/></label>
   <label className="text-xs">Slab thickness (ft)<input aria-label="Flat plate slab thickness" className="block border w-full p-1" type="number" min="0" step="any" disabled={busy} value={flatSlabThickness} onChange={e=>setFlatSlabThickness(+e.target.value)}/></label>
  </div>
  <p className="text-xs">Wall thickness sets panel depth. Thicker slabs reduce clearance below the mezzanine. The roof follows the floor footprint and is solid.</p>
  <label className="block"><input type="checkbox" checked={flatShowWalls} disabled={busy||Boolean(result?.request.workspaceTypology==='flat-deep-plan-plate'&&result.request.flatPlate?.joinWalls)} onChange={e=>setFlatShowWalls(e.target.checked)}/> Show walls</label>
  <label className="block"><input type="checkbox" checked={flatJoinWalls} disabled={busy} onChange={e=>setFlatJoinWalls(e.target.checked)}/> Join walls into main massing (regenerate to apply)</label>
  {result?.request.workspaceTypology==='flat-deep-plan-plate'&&result.request.flatPlate?.joinWalls&&<p className="text-xs">Turn off Join walls and regenerate to hide walls in this study.</p>}
 </fieldset>}
 {workspaceTypology==='open-hall-workspace'&&<div className="space-y-2"><label className="block">Mezzanine plate option<select aria-label="Mezzanine plate option" className="block w-full" value={mezzanineFaces} disabled={busy} onChange={e=>setMezzanineFaces(Number(e.target.value) as 2|3|4)}>{OPEN_HALL_MEZZANINE_OPTIONS.map(({value,label})=><option key={value} value={value}>{label}</option>)}</select></label>
<div><p className="text-xs mb-1">Column L guide size</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_COLUMN_SIZES.map(n=><button key={n} type="button" disabled={busy} aria-pressed={columnSize===n} className="border p-1" onClick={()=>setColumnSize(n)}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom column guide size" type="number" min="0.1" step="any" className="border w-16 p-1" disabled={busy} value={columnSize} onChange={e=>setColumnSize(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_COLUMN_SIZE))}/></label></div></div>
<div><p className="text-xs mb-1">Column grid spacing (XY · equal · floor-plate boundary)</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_COLUMN_GRID_SPACINGS.map(n=><button key={n} type="button" disabled={busy} aria-pressed={columnGridSpacing===n} className="border p-1" onClick={()=>setColumnGridSpacing(n)}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom column grid spacing" type="number" min="1" step="any" className="border w-16 p-1" disabled={busy} value={columnGridSpacing} onChange={e=>setColumnGridSpacing(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING))}/></label></div></div>
<div><p className="text-xs mb-1">Floor and mezzanine L guides</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_FLOOR_MEZZ_GUIDE_SIZES.map(n=><button key={n} type="button" disabled={busy} aria-pressed={floorMezzGuideSize===n} className="border p-1" onClick={()=>{setFloorMezzGuideSize(n);}}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom floor mezz guide size" type="number" min="0.1" step="any" className="border w-16 p-1" disabled={busy} value={floorMezzGuideSize} onChange={e=>{const n=normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE);setFloorMezzGuideSize(n);}}/></label></div></div>
<div><p className="text-xs mb-1">Wall L guides (independent of floor/mezz)</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_WALL_GUIDE_SIZES.map(n=><button key={n} type="button" disabled={busy} aria-pressed={wallGuideSize===n} className="border p-1" onClick={()=>setWallGuideSize(n)}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom wall guide size" type="number" min="0.1" step="any" className="border w-16 p-1" disabled={busy} value={wallGuideSize} onChange={e=>setWallGuideSize(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE))}/></label></div><p className="text-xs">Set the wall thickness separately below.</p></div>
<div>
 <label className="block text-xs">Roof sizing<select aria-label="Roof sizing" value={roofSizing} onChange={e=>setRoofSizing(e.target.value as 'fixed'|'pillar')} disabled={busy} className="block w-full">{OPEN_HALL_ROOF_SIZING_OPTIONS.map(({value,label})=><option key={value} value={value}>{label}</option>)}</select></label>
 {roofSizing==='pillar'
  ? <label className="block text-xs">Inward offset from pillar edges (ft)<input aria-label="Roof inward offset" type="number" min="0" step="0.25" value={roofInset} disabled={busy} onChange={e=>setRoofInset(Math.max(0,Number(e.target.value)||0))}/></label>
  : <fieldset disabled={busy}>
   <legend className="text-xs">Fixed roof L guide size</legend>
   <div className="flex gap-2 flex-wrap">{OPEN_HALL_ROOF_GUIDE_SIZES.map(n=><button key={n} type="button" aria-pressed={roofGuideSize===n} className="border p-1" onClick={()=>setRoofGuideSize(n)}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom roof guide size" type="number" min="0.1" step="any" className="border w-16 p-1" value={roofGuideSize} onChange={e=>setRoofGuideSize(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE))}/></label></div>
  </fieldset>}
</div>
<div className="grid grid-cols-2 gap-2"><label className="text-xs">Wall thickness (ft)<input aria-label="Wall thickness" type="number" min="0.1" step="0.25" className="block border w-full p-1" disabled={busy} value={wallThickness} onChange={e=>setWallThickness(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_WALL_THICKNESS))}/></label><label className="text-xs">Slab thickness (ft)<input aria-label="Slab thickness" type="number" min="0.1" step="0.25" className="block border w-full p-1" disabled={busy} value={slabThickness} onChange={e=>setSlabThickness(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_SLAB_THICKNESS))}/></label></div><p className="text-xs">Thicker walls can reduce the floor footprint. Thicker slabs reduce clearance around the mezzanine.</p><label className="block"><input type="checkbox" checked={perimeterWalls} onChange={e=>setPerimeterWalls(e.target.checked)}/> Show perimeter walls</label><label className="block"><input type="checkbox" checked={joinWalls} onChange={e=>setJoinWalls(e.target.checked)}/> Join walls into the main massing</label><p className="text-xs">Letter-driven Open Hall: floor plate from outer edges of 4 corner Ls; mezzanine 2/3/4-channel from outer + pocket Ls (pockets from inner edges). Floor/mezz presets 9 / 11 / 13′; wall size independent.</p></div>}
{(['width','depth','height'] as const).map((axis,i)=><label className="block" key={axis}>{['Width X','Depth Y','Height Z'][i]} (ft)<select aria-label={axis} className="block w-full" value={field[axis]} disabled={busy} onChange={e=>setField(f=>({...f,[axis]:+e.target.value}))}>{WORKSPACE_FIELD_PRESETS.map(n=><option key={n}>{n}</option>)}</select></label>)}
 {generationBlocked&&<p role="alert" style={{color:'#ed8989'}}>{openHallError??flatPlateError}</p>}
    <button className="border rounded p-3 w-full" disabled={busy||generationBlocked} onClick={()=>void generate()}>Generate Design</button>
    {result&&<div className="flex flex-wrap gap-2">
      <button disabled={busy||generationBlocked} onClick={()=>void generate()}>New Design</button>
      <button disabled={busy} onClick={()=>setMode("A")}>View Letters</button>
      <button disabled={busy||generationBlocked} onClick={()=>void generate(true)}>Regenerate Architecture</button>
    </div>}
    <p role="status">{message}</p>
    {error&&<p role="alert" style={{color:"#ed8989"}}>{error}</p>}
   </aside>
   <section className="space-y-3 min-w-0">
    <section style={panel} className="space-y-3">
     <div className="flex flex-wrap gap-2">{(["A","B","C"] as const).map(item=><button type="button" key={item} aria-pressed={mode===item} onClick={()=>setMode(item)}>{item} — {item==="A"?"Original Letters":item==="B"?"Letters + Architecture":"Architecture Only"}</button>)}</div>
     <div className="flex flex-wrap gap-2">{(["isometric","plan","elevation","section"] as const).map(item=><button type="button" key={item} aria-pressed={view===item} onClick={()=>setView(item)}>{item}</button>)}<button onClick={()=>setReset(value=>value+1)}>Reset camera</button></div>
     {view==="section"&&<label>Section X = {cut.toFixed(1)} ft<input aria-label="Section position" type="range" min={-displayField.width/2} max={displayField.width/2} step="0.1" value={cut} onChange={event=>setCut(+event.target.value)}/></label>}
     {stale&&<p className="text-xs">Controls differ from the displayed study. Generate to evaluate the new settings.</p>}
     <Viewer result={result} field={displayField} mode={mode} view={view} cut={cut} selected={selected} onPick={setSelected} isolate={isolate} reset={reset} showWalls={flatPlateMode?flatShowWalls:perimeterWalls}/>
     {result&&<><p>Displayed study · {workspaceTypologyName(result.request.workspaceTypology)} · {result.sourceCount} letters · {result.volume.toFixed(2)} ft³</p>
      <label>Inspect object <select aria-label="Inspect object" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">All objects</option>{[...result.letters,...result.components].map(object=><option key={object.id}>{object.id}</option>)}</select></label>
      <label className="ml-2"><input type="checkbox" checked={isolate} onChange={event=>setIsolate(event.target.checked)}/> Isolate selection</label>
      <details key={result.id} open={savedRulesMatchSelection}>
       <summary>Saved study rules · {workspaceTypologyName(result.request.workspaceTypology)}</summary>
       {result.letterArrangementReport&&<WorkspaceRuleGroup report={result.letterArrangementReport}/>}
       {result.architecturalGenerationReport&&<WorkspaceRuleGroup report={result.architecturalGenerationReport}/>}
      </details>
      <a className="underline text-xs" href={"/api/amphitheater?id="+result.id} target="_blank" rel="noreferrer">Study snapshot and meshes (JSON)</a></>}
    </section>
    {result&&<AmphitheaterPresentation result={result} disabled={busy} joinWalls={joinWalls} onJoinWalls={setJoinWalls}/>} 
    <section style={panel} className="space-y-2"><h2>Saved studies</h2>
     {studies.map(study=><div className="flex flex-wrap items-center gap-2" key={study.id}>
      <span>{study.request.sourceName} · {study.request.field.width} × {study.request.field.depth} × {study.request.field.height} ft · {study.sourceCount} letters</span>
      <button disabled={busy} onClick={()=>void openStudy(study.id)}>Open</button>
      <button disabled={busy||!result||result.id===study.id||parameterKey(result.request)!==parameterKey(study.request)} onClick={()=>void openStudy(study.id,true)}>Compare</button>
     </div>)}
    </section>
    {comparison&&<section style={panel}><h2>Comparison study</h2><button onClick={()=>setComparison(undefined)}>Close comparison</button><p>{comparison.request.sourceName}</p><Viewer result={comparison} field={comparison.request.field} mode={mode} view={view} cut={cut} selected="" onPick={()=>{}} isolate={false} reset={reset}/></section>}
   </section>
  </div>
 </main>;
}
