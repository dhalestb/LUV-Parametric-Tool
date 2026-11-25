"use client";
import UnifiedTypologySelect from './UnifiedTypologySelect';
import {workspaceRulesetIds} from "./workspaceDualRulesets";
import {buildVoidEdgeGuides,voidEdgeFittingRotations,VOID_EDGE_OUTER_WALL_THICKNESS} from './workspace-rules/void-edge-plate';
import {voidEdgeRules,voidEdgeAutoRotation,voidEdgeBaseRotations,voidEdgeColumnGuideSize,voidEdgeCoreGuideSizes,voidEdgeGuidesForCoreSizes,voidEdgeMainGuideSizes,voidEdgeWallGuideSettings} from './workspace-rules/void-edge-workspace.rules';

import { useCallback,useEffect,useMemo,useState } from 'react';
import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { BoardCanvas } from './BoardCanvas';
import { BoardOrthographicCamera } from './BoardOrthographicCamera';
import { AxisIndicator } from './AxisIndicator';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import {populatePerimeterLevels,populateInsertedPlate,populateSpanningPlate,suggestedInsertedPlateCount,applyInsertedPlateSpacing} from './insertedPlatePopulation';
import {populateVoidField,applyVoidFieldSpacing,addVoidFieldFourthLevel} from './voidFieldPopulation';
import {populate,suggestedCount} from './sourcePopulation';
import SourcePopulationEditor from './SourcePopulationEditor';
import AppNav from './AppNav';
import AmphitheaterPresentation from './AmphitheaterPresentation';
import { LETTER_SIZE_PRESETS } from './architecturalLetterSizing';
import { OPTIMIZER_SESSION_KEY } from './browserSession';
import { collectCompositionSources,mergeCompositionSources,compositionRefreshMessage,type ProofSource as Source } from './amphitheaterCompositionSources';


import type { AmphitheaterRequest,AmphitheaterResult,AmphitheaterSummary,ProofMesh } from './amphitheaterInteractiveTypes';
import {
  requirementsForWorkspaceRule,
  WORKSPACE_DEFAULT_FIELDS,
  WORKSPACE_FIELD_PRESETS,
  WORKSPACE_TYPOLOGIES,
  workspaceTypologyName,
  type DualRulesetReport,
  type WorkspaceTypology,
} from "./workspaceDualRulesets";
import { sectionsForTypology } from "./workspaceRulesetCatalog";
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
} from "./officeWorkspaceRules";
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
import { flatPlateFloorGuideError } from "./workspace-rules/flat-deep-plan-plate";
import { FLAT_PLATE_PRESETS, flatPlateClearHeightCheck, flatPlateDimensions, flatPlateSettingsError } from "./workspace-rules/flat-deep-plan-plate.plan";
function readCompositionSources(){
 return collectCompositionSources(JSON.parse(localStorage.getItem(OPTIMIZER_SESSION_KEY)??'null'),JSON.parse(localStorage.getItem('vul-optimizer-designs')??'[]'));
}
type View='isometric'|'plan'|'elevation'|'section';
function isUpdatedWorkspace(id?: WorkspaceTypology) {
 return id==='open-hall-workspace'||id==='flat-deep-plan-plate'||id==='void-edge-workspace';
}
type Mode='A'|'B'|'C';
const panel={border:'1px solid var(--line)',borderRadius:10,padding:16,background:'var(--panel-background)'};
const color=(i:number)=>new THREE.Color().setHSL((i*.61803398875)%1,.58,.6);
 const parameterKey=(r:AmphitheaterRequest)=>[r.field.width,r.field.depth,r.field.height,r.preferredFeet,r.workspaceTypology??'',r.openHall?.mezzanineFaces??'',r.openHall?.columnSize??'',r.openHall?.columnGridSpacing??'',r.openHall?.floorMezzGuideSize??'',r.openHall?.wallGuideSize??'',r.openHall?.roofGuideSize??'',r.openHall?.roofSizing??'fixed',r.openHall?.roofInset??0,r.rulesetVersion??''].join('/');
function generationSettingsKey(request: AmphitheaterRequest) {
 if (request.workspaceTypology === 'void-edge-workspace') {
  const {topSize,sideSize}=voidEdgeCoreGuideSizes(request.voidEdgeCore,request.source);
  return [parameterKey(request),topSize,sideSize,request.voidEdgeCore?.wallThickness??voidEdgeRules.thickness.core,
   request.voidEdgeCore?.slabThickness??voidEdgeRules.thickness.slab,request.voidEdgeRotation??request.source[0]?.voidEdgeRotation??0,
   request.voidEdgeOuterWallThickness??VOID_EDGE_OUTER_WALL_THICKNESS,voidEdgeColumnGuideSize(request.voidEdgeColumnSize,request.source),
   request.voidEdgeJoinShell??voidEdgeRules.joinShellByDefault,...Object.values(voidEdgeWallGuideSettings(request.voidEdgeWallGuide))].join('/');
 }
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
function Surface({mesh,tint,opacity=1,planes,selected,onPick,wire=false,sharp=false,onTop=false,wallDepth=false}:{mesh:ProofMesh;tint:THREE.ColorRepresentation;opacity?:number;planes:THREE.Plane[];selected?:boolean;onPick?:()=>void;wire?:boolean;sharp?:boolean;onTop?:boolean;wallDepth?:boolean}){
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));g.setIndex(mesh.indices);if(sharp){const creased=toCreasedNormals(g,Math.PI/6);if(creased!==g)g.dispose();return creased;}g.computeVertexNormals();return g;},[mesh,sharp]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} renderOrder={onTop?2:0} onClick={e=>{if(onPick){e.stopPropagation();onPick();}}}><meshStandardMaterial color={selected?'#ffe374':tint} transparent={opacity<1} opacity={opacity} depthTest={!onTop||wallDepth} depthWrite={!onTop} side={THREE.DoubleSide} clippingPlanes={planes} clipShadows wireframe={wire} polygonOffset={wire} polygonOffsetFactor={wire?-2:0}/></mesh>;
}
type WallOccluder = {mesh:ProofMesh;steepFacesOnly?:boolean};

function WallDepth({occluders,planes}:{occluders:WallOccluder[];planes:THREE.Plane[]}){
 const geometries=useMemo(()=>occluders.map(({mesh,steepFacesOnly})=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));
  if(!steepFacesOnly){
   geometry.setIndex(mesh.indices);
   return geometry;
  }
  // A combined mesh has no wall labels. Keep its steep faces and skip its slab tops.
  const indices:number[]=[];
  const origin=new THREE.Vector3(),edgeA=new THREE.Vector3(),edgeB=new THREE.Vector3();
  for(let i=0;i<mesh.indices.length;i+=3){
   const a=mesh.indices[i],b=mesh.indices[i+1],c=mesh.indices[i+2];
   origin.fromArray(mesh.positions,a*3);
   edgeA.fromArray(mesh.positions,b*3).sub(origin);
   edgeB.fromArray(mesh.positions,c*3).sub(origin);
   const normal=edgeA.cross(edgeB);
   if(Math.abs(normal.z)<normal.length()*.5)indices.push(a,b,c);
  }
  geometry.setIndex(indices);
  return geometry;
 }),[occluders]);
 useEffect(()=>()=>geometries.forEach(geometry=>geometry.dispose()),[geometries]);
 // Preserve the rendered architecture and rebuild only wall depth for the letters.
 return <>{geometries.map((geometry,index)=><mesh key={geometry.uuid} geometry={geometry} renderOrder={1} frustumCulled={false}
  onBeforeRender={index===0?renderer=>renderer.clearDepth():undefined}>
  <meshBasicMaterial transparent colorWrite={false} depthWrite depthTest forceSinglePass side={THREE.DoubleSide} clippingPlanes={planes}/>
 </mesh>)}</>;
}
function VisibilityLines({result}:{result:AmphitheaterResult}){
 const visibility=result.voidFieldReport?.visibility;
 const geometry=useMemo(()=>{const lines=visibility?[...visibility.crossLevel.flatMap(p=>p.views),...visibility.sky]:[];return new THREE.BufferGeometry().setFromPoints(lines.flatMap(p=>[new THREE.Vector3(...p.start as [number,number,number]),new THREE.Vector3(...p.end as [number,number,number])]));},[visibility]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);return <lineSegments geometry={geometry}><lineBasicMaterial color="#71BEDA" depthTest={false}/></lineSegments>;
}
function FieldOutline({field}:{field:AmphitheaterRequest['field']}){
 const geometry=useMemo(()=>{const box=new THREE.BoxGeometry(field.width,field.depth,field.height),edges=new THREE.EdgesGeometry(box);box.dispose();return edges;},[field]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments geometry={geometry} position={[0,0,field.height/2]}><lineBasicMaterial color="#7b9bb4" transparent opacity={.7}/></lineSegments>;
}
export function Viewer({result,draft,field,mode,view,cut,selected,onPick,isolate,reset,sightlines=false,showWalls=true,hiddenLayers=[],showLettersOnTop=false}:{result?:AmphitheaterResult;draft?:AmphitheaterRequest['source'];field:AmphitheaterRequest['field'];mode:Mode;view:View;cut:number;selected:string;onPick:(id:string)=>void;isolate:boolean;reset:number;sightlines?:boolean;showWalls?:boolean;hiddenLayers?:string[];showLettersOnTop?:boolean}){
 const planes=useMemo(()=>view==='section'?[new THREE.Plane(new THREE.Vector3(1,0,0),-cut)]:[],[view,cut]);
 const picked=result?.components.find(c=>c.id===selected);
 const sharpForm=['profiles','vertical-walls','void-field','inserted-plate','room-within-volume','workspace-ten-rule'].includes(result?.request.envelopeVersion??'');
 const wallMesh=result?.perimeterWalls??result?.components.find(c=>c.id==='workspace-walls')?.mesh;
 const updatedWorkspace=isUpdatedWorkspace(result?.request.workspaceTypology);
 const overlayLetters=updatedWorkspace&&showLettersOnTop&&mode==='B'&&result?.generator==='workspace-ten-rule';
 const joinedVoidShell=result?.request.workspaceTypology==='void-edge-workspace'&&result.request.voidEdgeJoinShell===true;
 const visibleLayers=useMemo(()=>!updatedWorkspace||joinedVoidShell?undefined:result?.workspaceLayers?.filter(layer=>!hiddenLayers.includes(layer.role)),[updatedWorkspace,joinedVoidShell,result?.workspaceLayers,hiddenLayers]);
 const visibleWall=showWalls&&!isolate&&!(result?.request.workspaceTypology==='open-hall-workspace'&&result.request.openHall?.joinWalls)&&wallMesh?.indices.length?wallMesh:undefined;
 const isolatedComponent=isolate&&picked;
 const wallOccluders=useMemo<WallOccluder[]>(()=>{
  if(!overlayLetters||!result||isolatedComponent)return [];
  const occluders:WallOccluder[]=visibleLayers
   ?visibleLayers.filter(layer=>layer.role==='wall'||layer.role==='support').map(layer=>({mesh:layer.mesh}))
   :[{mesh:result.architecture,steepFacesOnly:true}];
  if(visibleWall)occluders.push({mesh:visibleWall});
  return occluders;
 },[overlayLetters,result,isolatedComponent,visibleLayers,visibleWall]);
 return <div style={{height:580,background:'#080b10',borderRadius:8}}><BoardCanvas dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true}} onCreated={({gl})=>{gl.localClippingEnabled=true;}}><color attach="background" args={['#080b10']}/><ambientLight intensity={1.1}/><directionalLight position={[50,-60,90]} intensity={2}/><directionalLight position={[-40,30,50]} intensity={1}/><Camera field={field} view={view} reset={reset}/><FieldOutline field={field}/>{mode==='A'&&draft?.map((p,i)=><mesh dispose={null} key={i} geometry={getLetterVolumeGeometry(p.letter,12)} position={[p.x,p.y,p.z+field.height/2]} rotation={[p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ']} scale={[p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ]}><meshStandardMaterial color={color(i)} clippingPlanes={planes}/></mesh>)}{result&&<>
 {(mode==='B'||mode==='C')&&(isolatedComponent?<Surface sharp={sharpForm} mesh={isolatedComponent.mesh} tint="#e2d5b9" planes={planes}/>:visibleLayers?visibleLayers.map(layer=><Surface key={layer.id} sharp mesh={layer.mesh} tint="#e2d5b9" planes={planes}/>):<Surface sharp={sharpForm} mesh={result.architecture} tint="#e2d5b9" planes={planes}/>)}
 {(mode==='B'||mode==='C')&&visibleWall&&<Surface sharp mesh={visibleWall} tint={updatedWorkspace?"#e2d5b9":"#cbb896"} planes={planes} selected={selected==='workspace-walls'} onPick={()=>onPick('workspace-walls')}/>}
 {wallOccluders.length>0&&<WallDepth occluders={wallOccluders} planes={planes}/>}
 {((mode==='A'&&!draft)||mode==='B')&&result.letters.filter(l=>!isolate||!selected||l.id===selected).map(l=><Surface key={l.id} mesh={l.mesh} tint={color(result.letters.findIndex(item=>item.id===l.id))} opacity={mode==='B'?.7:1} planes={planes} onTop={overlayLetters} wallDepth={wallOccluders.length>0} selected={l.id===selected} onPick={()=>onPick(l.id)}/>)}
 {mode==='B'&&result.voidFieldReport?.voids.map(v=><Surface key={v.source} mesh={v.cutterMesh} tint="#71BEDA" opacity={.22} planes={planes}/>)}
 {!isolate&&picked&&mode!=='A'&&picked.id!=='workspace-walls'&&<Surface mesh={picked.mesh} tint="#ffe374" planes={planes} wire/>}
 {sightlines&&mode!=='A'&&result.voidFieldReport?.visibility&&<VisibilityLines result={result}/>}
 </>}<AxisIndicator/></BoardCanvas></div>;
}
function voidSettingsKey(value:AmphitheaterRequest['voidField']){return JSON.stringify(value,Object.keys(value??{}).sort());}
import {fourLevelStudy, fourLevelBaseline} from './fourLevelStudy';
import {perimeterLayout,perimeterRoomSource} from './perimeterRoomLayout';
export default function AmphitheaterStudio(){
 const [atriumBoundary,setAtriumBoundary]=useState<'open'|'enclosed'>('open'),[showSightlines,setShowSightlines]=useState(false);
 const [facadeMode,setFacadeMode]=useState<'vertical'|'face-normal'>('face-normal');
 const [floorSpacing,setFloorSpacing]=useState(12);
 const [levelCount,setLevelCount]=useState<3|4>(3);
 const [amphLevels,setAmphLevels]=useState(3),[amphSpacing,setAmphSpacing]=useState<number|undefined>();
 const [sourceTransitions,setSourceTransitions]=useState(false);
 const [plateMode,setPlateMode]=useState<'spanning-v2'|'legacy'|'suspended'|'two-u'|'merged-walls'|'edge-connected'>('edge-connected');
 const [envelopeVersion,setEnvelopeVersion]=useState<'profiles'|'vertical-walls'|'void-field'|'inserted-plate'|'room-within-volume'|'workspace-ten-rule'>('vertical-walls');
 const [workspaceTypology,setWorkspaceTypology]=useState<WorkspaceTypology|''>('');
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
 const [voidTaper,setVoidTaper]=useState(.35),[voidMode,setVoidMode]=useState<'straight'|'neighbor-taper'>('neighbor-taper'),[voidConnectivity,setVoidConnectivity]=useState<'adjacent'|'none'>('adjacent');
 const [editing,setEditing]=useState(false),[seed,setSeed]=useState<number|undefined>();
 const [field,setField]=useState({width:40,depth:40,height:60}),[preferred,setPreferred]=useState(13),[population,setPopulation]=useState('auto');
 const [articulation,setArticulation]=useState(.75),[primary,setPrimary]=useState(false);
 const [elevationMode,setElevationMode]=useState<'feature'|undefined>('feature');
 const [organization,setOrganization]=useState<'proximity'|'alignment'>('proximity'),[generator,setGenerator]=useState<AmphitheaterRequest['generator']>('source-preserving'),[sources,setSources]=useState<Source[]>([]),[sourceId,setSourceId]=useState('fixture'),[sourceText,setSourceText]=useState('');
 const [studies,setStudies]=useState<AmphitheaterSummary[]>([]),[result,setResult]=useState<AmphitheaterResult>(),[comparison,setComparison]=useState<AmphitheaterResult>();
 const [voidSideSize,setVoidSideSize]=useState<number>(voidEdgeRules.guides.mainSide.defaultSize);
 const [voidTopSize,setVoidTopSize]=useState<number>(voidEdgeRules.guides.mainEnd.defaultSize);
 const [voidBaseRotation,setVoidBaseRotation]=useState<number|null>(null);
 const [coreTopSize,setCoreTopSize]=useState<number>(voidEdgeRules.guides.coreEnd.defaultSize),[coreSideSize,setCoreSideSize]=useState<number>(voidEdgeRules.guides.coreSide.defaultSize);
 const [coreWallThickness,setCoreWallThickness]=useState<number>(voidEdgeRules.thickness.core),[voidSlabThickness,setVoidSlabThickness]=useState<number>(voidEdgeRules.thickness.slab);
 const [outerWallThickness,setOuterWallThickness]=useState<number>(VOID_EDGE_OUTER_WALL_THICKNESS);
 const [voidJoinShell,setVoidJoinShell]=useState<boolean>(voidEdgeRules.joinShellByDefault);
 const [voidColumnSize,setVoidColumnSize]=useState<number>(voidEdgeRules.columns.defaultSize);
 const [verticalWallGuide,setVerticalWallGuide]=useState(()=>voidEdgeWallGuideSettings());
 const [hiddenVoidLayers,setHiddenVoidLayers]=useState<string[]>([]);
 const savedVoidShellJoined=result?.request.workspaceTypology==='void-edge-workspace'&&result.request.voidEdgeJoinShell===true;
 const [mode,setMode]=useState<Mode>('C'),[view,setView]=useState<View>('isometric'),[cut,setCut]=useState(0),[selected,setSelected]=useState(''),[isolate,setIsolate]=useState(false),[reset,setReset]=useState(0);
 const [showLettersOnTop,setShowLettersOnTop]=useState(false);
 const [roomCutaway,setRoomCutaway]=useState(false);
 const [roomLevels,setRoomLevels]=useState(2),[roomSpacing,setRoomSpacing]=useState(12);
 const [roomOrder,setRoomOrder]=useState<'custom'|'original'|'shuffle'|'suspended'|'platforms'>('custom');
 const [shuffleSeed,setShuffleSeed]=useState('18');

 function chooseOrder(order:typeof roomOrder){
  setRoomOrder(order);
  if(order==='custom')return;
  setField({...fourLevelBaseline.field});setPreferred(fourLevelBaseline.preferredFeet);setPopulation(String(fourLevelBaseline.source.length));
  setRoomLevels(4);setRoomSpacing(15);setFullProfiles(true);
 }
 const [fullProfiles,setFullProfiles]=useState(false);
 const [roomVersion,setRoomVersion]=useState<"perimeter-room"|"anchored-room"|"contour-walls"|"hull-pilot">("perimeter-room");
 const fixedPattern=envelopeVersion==='room-within-volume'&&roomOrder!=='custom'&&roomVersion==='perimeter-room';
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('Choose the field and letter quantity, then Generate Design.'),[error,setError]=useState('');
 const [sourceMessage,setSourceMessage]=useState('');
 const source=sources.find(s=>s.id===sourceId);
 const displayStudy=useCallback((data:AmphitheaterResult)=>{
  // Older spacing-only edits could save the sidebar count and size with the previous source array.
  const request=data.request;
  const liftLayout=(request.sourceSnapshot as {liftLayout?:{levels:number;spacing?:number}}|undefined)?.liftLayout;
  setAmphLevels(liftLayout?.levels??3);setAmphSpacing(liftLayout?.spacing);
  const snapshot=request.sourceSnapshot as {baseline?:string;order?:string;seed?:number}|undefined;
  const savedOrder=snapshot?.baseline===fourLevelBaseline.sourceSnapshot.baseline && request.roomWithinVolume?.fullProfiles ? snapshot.order : undefined;
  setRoomOrder(savedOrder==='platforms'||savedOrder==='suspended'||savedOrder==='original'||savedOrder==='shuffle'?savedOrder:'custom');
  setShuffleSeed(String(snapshot?.seed??18));
  setFullProfiles(request.roomWithinVolume?.fullProfiles === true);
  if(request.insertedPlate?.version==='edge-connected'&&typeof request.population==='number'&&request.population!==data.sourceCount){
   const scale=request.source[0]?.scale;
   const uniform=scale&&request.source.every(p=>Math.abs(p.scale-scale)<1e-8);
   data={...data,request:{...request,population:data.sourceCount,preferredFeet:uniform?Number((scale*.92).toFixed(4)):request.preferredFeet}};
  }
  if(request.roomWithinVolume?.version==='perimeter-room'){setRoomCutaway(false);const rings=request.source.filter(p=>p.architecturalRole==='perimeter');setRoomLevels(Math.max(2,...rings.map(p=>(p.levelIndex??0)+1)));const z=(i:number)=>rings.find(p=>p.levelIndex===i)?.z;setRoomSpacing(Math.round(100*((z(1)??12)-(z(0)??0)))/100);}
  const savedOpenHall=openHallRequestGeometry(data.request.openHall,data.request.workspaceTypology==='open-hall-workspace'?data.request.preferredFeet:OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE);
  setRoomVersion(data.request.roomWithinVolume?.version??(data.request.envelopeVersion==='room-within-volume'?'hull-pilot':'contour-walls'));setPlateMode(data.request.insertedPlate?.version??'spanning-v2');setLevelCount(data.request.voidField?.levelCount??3);setFacadeMode(data.request.voidField?.facadeMode??'vertical');setAtriumBoundary(data.request.voidField?.atriumBoundary??'enclosed');setShowSightlines(false);setFloorSpacing((data.request.sourceSnapshot as {floorSpacing?:number}|undefined)?.floorSpacing??12);setWorkspaceTypology(data.request.workspaceTypology??'');setMezzanineFaces(OPEN_HALL_MEZZANINE_OPTIONS.find(option=>option.value===data.request.openHall?.mezzanineFaces)?.value??OPEN_HALL_DEFAULT_MEZZANINE);setPerimeterWalls(data.request.openHall?.perimeterWalls!==false);setJoinWalls(data.request.openHall?.joinWalls===true);setColumnSize(normalizeOpenHallGuideSize(data.request.openHall?.columnSize,OPEN_HALL_DEFAULT_COLUMN_SIZE));setColumnGridSpacing(normalizeOpenHallGuideSize(data.request.openHall?.columnGridSpacing,OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING));setFloorMezzGuideSize(normalizeOpenHallGuideSize(savedOpenHall.floorMezzGuideSize,OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE));setWallGuideSize(normalizeOpenHallGuideSize(data.request.openHall?.wallGuideSize,OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE));setRoofGuideSize(normalizeOpenHallGuideSize(data.request.openHall?.roofGuideSize,OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE));setRoofSizing(savedOpenHall.roofSizing);setRoofInset(data.request.openHall?.roofInset??OPEN_HALL_DEFAULT_ROOF_INSET);setEnvelopeVersion(data.request.envelopeVersion==='workspace-ten-rule'?'workspace-ten-rule':data.request.envelopeVersion==='room-within-volume'?'room-within-volume':data.request.envelopeVersion==='inserted-plate'?'inserted-plate':data.request.envelopeVersion==='void-field'?'void-field':data.request.envelopeVersion==='vertical-walls'?'vertical-walls':'profiles');setVoidTaper(data.request.voidField?.taper??.35);setVoidMode(data.request.voidField?.profileMode??'neighbor-taper');setVoidConnectivity(data.request.voidField?.connectivity??'adjacent');setResult(data);setField(data.request.field);setPreferred(data.request.preferredFeet);setPopulation(String(data.request.population));setEditing(false);setGenerator(data.generator);setElevationMode(data.request.articulationElevation);setArticulation(data.request.articulation??0);setPrimary(false);setOrganization(data.request.organization??'proximity');setSelected('');setComparison(undefined);
  setCoreWallThickness(data.request.voidEdgeCore?.wallThickness??voidEdgeRules.thickness.core);setVoidSlabThickness(data.request.voidEdgeCore?.slabThickness??voidEdgeRules.thickness.slab);
  setOuterWallThickness(data.request.voidEdgeOuterWallThickness??VOID_EDGE_OUTER_WALL_THICKNESS);
  if(data.request.workspaceTypology==='void-edge-workspace'){
   const mainSizes=voidEdgeMainGuideSizes(data.request.source);
   setVoidTopSize(mainSizes.topSize);
   setVoidSideSize(mainSizes.sideSize);
   const sizes=voidEdgeCoreGuideSizes(data.request.voidEdgeCore,data.request.source);
   setCoreTopSize(sizes.topSize);
   setCoreSideSize(sizes.sideSize);
   setVoidBaseRotation(data.request.voidEdgeRotation??null);
   setVerticalWallGuide(voidEdgeWallGuideSettings(data.request.voidEdgeWallGuide));
   setVoidColumnSize(voidEdgeColumnGuideSize(data.request.voidEdgeColumnSize,data.request.source));
   setVoidJoinShell(data.request.voidEdgeJoinShell??voidEdgeRules.joinShellByDefault);
  }
  const flatDimensions=flatPlateDimensions(data.request.flatPlate);
  setFlatColumnSize(flatDimensions.columnSize);setFlatFloorGuide(flatDimensions.floorMezzGuideSize);setFlatWallGuide(flatDimensions.wallGuideSize);
  setFlatShowWalls(data.request.flatPlate?.showWalls!==false);setFlatJoinWalls(data.request.flatPlate?.joinWalls===true);
  setFlatColumnSpacing(flatDimensions.columnSpacing);setFlatWallThickness(flatDimensions.wallThickness);setFlatSlabThickness(flatDimensions.slabThickness);
  setWallThickness(normalizeOpenHallGuideSize(data.request.openHall?.wallThickness,OPEN_HALL_WALL_THICKNESS));setSlabThickness(normalizeOpenHallGuideSize(data.request.openHall?.slabThickness,OPEN_HALL_DEFAULT_SLAB_THICKNESS));
  setSources(items=>[...items.filter(s=>s.id!==data.request.sourceId),{id:data.request.sourceId,name:data.request.sourceName,source:data.request.source,snapshot:data.request.sourceSnapshot}]);setSourceId(data.request.sourceId);
  const url=new URL(window.location.href);url.searchParams.set('study',data.id);window.history.replaceState(window.history.state,'',url);
 },[]);
 const refreshSources=useCallback(()=>{
  try{const imported=readCompositionSources();setSources(current=>mergeCompositionSources(current,imported,sourceId));setSourceMessage(compositionRefreshMessage(imported.length));setError('');}
  catch{setSourceMessage('Composition storage could not be read. Your selected source has been retained. Open Composition or use source JSON.');}
 },[sourceId]);
 useEffect(()=>{
  let active=true;
  fetch('/api/amphitheater').then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error??'Study storage unavailable');return data;}).then(data=>{
   if(!active)return;
   setSources([{id:'fixture',name:'Recorded L/U/V proof fixture',source:data.fixture}]);setStudies(data.studies.filter((s:AmphitheaterSummary)=>s.request.generator==="workspace-ten-rule"));
   try{const imported=readCompositionSources();setSources(current=>mergeCompositionSources(current,imported,'fixture'));setSourceMessage(compositionRefreshMessage(imported.length));}catch{setSourceMessage('Composition storage could not be read. Recorded and saved-study sources remain available.');}
   const query=new URL(window.location.href).searchParams; if(query.get('room')==='perimeter'){setEnvelopeVersion('room-within-volume');setRoomVersion('perimeter-room');} const requestedView=query.get('view');if(requestedView==='A'||requestedView==='B'||requestedView==='C')setMode(requestedView);const id=query.get('study');
   if(id)fetch('/api/amphitheater?id='+encodeURIComponent(id)).then(r=>r.json()).then(saved=>{if(active&&saved.id)displayStudy(saved);});
  }).catch(e=>setError(String(e)));
  return()=>{active=false;};
 },[displayStudy]);
 const workspaceMode=Boolean(workspaceTypology);
 const openHallError = workspaceTypology === 'open-hall-workspace'
  ? openHallFieldPresetError(field) ?? openHallColumnGridError({columnSize,columnGridSpacing})
  : undefined;
 const flatPlate = useMemo(() => ({
  columnSize: flatColumnSize, floorMezzGuideSize: flatFloorGuide, wallGuideSize: flatWallGuide,
  columnSpacing: flatColumnSpacing, wallThickness: flatWallThickness, slabThickness: flatSlabThickness,
  showWalls: flatShowWalls, joinWalls: flatJoinWalls,
 }), [flatColumnSize, flatFloorGuide, flatWallGuide, flatColumnSpacing, flatWallThickness, flatSlabThickness, flatShowWalls, flatJoinWalls]);
 const flatPlateMode = workspaceTypology === 'flat-deep-plan-plate';
 const selectedRulesTypology = workspaceTypology === 'open-hall-workspace' || flatPlateMode || workspaceTypology === 'void-edge-workspace'
  ? workspaceTypology : undefined;
 const savedRulesTypology = result?.request.workspaceTypology
  ?? result?.letterArrangementReport?.typology ?? result?.architecturalGenerationReport?.typology;
 const savedRulesMatchSelection = !selectedRulesTypology || savedRulesTypology === selectedRulesTypology;
 const flatClearHeight = flatPlateClearHeightCheck(field.height, flatSlabThickness);
 const flatPlateError = flatPlateMode
  ? flatPlateSettingsError(flatPlate) ?? (flatClearHeight.ok ? flatPlateFloorGuideError({...field, flatPlate}) : flatClearHeight.detail)
  : undefined;
 const unavailableFloorGuides = flatPlateMode && flatClearHeight.ok
  ? FLAT_PLATE_PRESETS.floorMezzGuideSize.filter(floorMezzGuideSize => flatPlateFloorGuideError({...field, flatPlate:{...flatPlate, floorMezzGuideSize}}))
  : [];
 const generationBlocked = Boolean(openHallError || flatPlateError);
 const voidEdgeMode=workspaceTypology==='void-edge-workspace';
 const voidEdgeFit=useMemo(()=>{
  if(!voidEdgeMode)return undefined;
  const fits=(angles:number[])=>voidBaseRotation===null?angles.length>0:angles.includes(voidBaseRotation);
  const angles=voidEdgeFittingRotations(field,voidTopSize,voidSideSize);
  return {
   angles,
   unavailableTop:voidEdgeRules.guides.mainEnd.presets.filter(size=>!fits(voidEdgeFittingRotations(field,size,voidSideSize))),
   unavailableSide:voidEdgeRules.guides.mainSide.presets.filter(size=>!fits(voidEdgeFittingRotations(field,voidTopSize,size))),
  };
 },[voidEdgeMode,field,voidTopSize,voidSideSize,voidBaseRotation]);
 const voidEdgeNewDesignError=voidEdgeFit&&(voidEdgeFit.angles.length===0
  ?'These plate U sizes do not fit through the full stack. Choose smaller sizes or enlarge the field.'
  :voidBaseRotation!==null&&!voidEdgeFit.angles.includes(voidBaseRotation)
   ?'The plates do not fit at this rotation. Choose Auto, a different angle, or smaller plate U sizes.'
   :undefined);
 const currentRequest=useMemo(()=>source?{roomWithinVolume:!workspaceMode&&envelopeVersion==='room-within-volume'?{version:roomVersion,...(roomVersion==='perimeter-room'&&fullProfiles?{fullProfiles:true}:{}),...(roomOrder==='platforms'?{suspendedLLV:true,edgePlatforms:true}:roomOrder==='suspended'?{suspendedLLV:true}:{})}:undefined,insertedPlate:!workspaceMode&&envelopeVersion==='inserted-plate'?{version:plateMode}:undefined,typologyName:workspaceTypology?workspaceTypologyName(workspaceTypology):envelopeVersion==='room-within-volume'?'Room Within Volume':envelopeVersion==='inserted-plate'?'Inserted Horizontal Plate':envelopeVersion==='void-field'?'Void Field Gathering':'Stepped Amphitheater',workspaceTypology:workspaceTypology||undefined,flatPlate:flatPlateMode?flatPlate:undefined,openHall:workspaceTypology==='open-hall-workspace'?{mezzanineFaces,perimeterWalls,columnSize,columnGridSpacing,floorMezzGuideSize,wallGuideSize,roofGuideSize,roofSizing,roofInset,joinWalls,wallThickness,slabThickness}:undefined,letterArrangementRulesetId:workspaceTypology?workspaceRulesetIds(workspaceTypology!).letter:undefined,letterArrangementRulesetVersion:workspaceTypology?workspaceRulesetIds(workspaceTypology).version:undefined,architecturalGenerationRulesetId:workspaceTypology?workspaceRulesetIds(workspaceTypology!).architecture:undefined,architecturalGenerationRulesetVersion:workspaceTypology?workspaceRulesetIds(workspaceTypology).version:undefined,rulesetId:workspaceTypology?`${workspaceRulesetIds(workspaceTypology!).letter}+${workspaceRulesetIds(workspaceTypology!).architecture}`:undefined,rulesetVersion:workspaceTypology?`${workspaceRulesetIds(workspaceTypology!).version}/${workspaceRulesetIds(workspaceTypology!).version}`:undefined,voidEdgeRotation:voidEdgeMode?voidBaseRotation??undefined:undefined,voidEdgeCore:voidEdgeMode?{topSize:coreTopSize,sideSize:coreSideSize,wallThickness:coreWallThickness,slabThickness:voidSlabThickness}:undefined,voidEdgeOuterWallThickness:voidEdgeMode?outerWallThickness:undefined,voidEdgeWallGuide:workspaceTypology==='void-edge-workspace'?verticalWallGuide:undefined,voidEdgeColumnSize:workspaceTypology==='void-edge-workspace'?voidColumnSize:undefined,voidEdgeJoinShell:workspaceTypology==='void-edge-workspace'?voidJoinShell:undefined,voidField:!workspaceMode&&envelopeVersion==='void-field'?{...(levelCount===4?{levelCount}:{}),facadeMode,atriumBoundary,taper:voidTaper,profileMode:voidMode,connectivity:voidConnectivity}:undefined,generator:workspaceTypology?'workspace-ten-rule' as const:generator,envelopeVersion:workspaceTypology?'workspace-ten-rule' as const:envelopeVersion,articulationElevation:elevationMode,articulation,organization,field,preferredFeet:workspaceTypology==='open-hall-workspace'?floorMezzGuideSize:preferred,population:population==='auto'?'auto' as const:Number(population),sourceId:source.id,sourceName:source.name,source:source.source,sourceSnapshot:source.snapshot}:null,[source,field,preferred,population,generator,organization,articulation,elevationMode,envelopeVersion,workspaceTypology,mezzanineFaces,perimeterWalls,columnSize,columnGridSpacing,floorMezzGuideSize,wallGuideSize,roofGuideSize,roofSizing,roofInset,joinWalls,wallThickness,slabThickness,voidTaper,voidMode,voidConnectivity,atriumBoundary,facadeMode,levelCount,plateMode,roomVersion,fullProfiles,roomOrder,workspaceMode,flatPlateMode,flatPlate,voidEdgeMode,voidBaseRotation,coreTopSize,coreSideSize,coreWallThickness,voidSlabThickness,outerWallThickness,verticalWallGuide,voidColumnSize,voidJoinShell]);
 const changedPlateInputs=envelopeVersion==='inserted-plate' && !!result && (preferred!==result.request.preferredFeet || (population!=='auto' && Number(population)!==result.sourceCount && sourceId!=='custom'));
 const stale=Boolean(result && currentRequest && (
  (Boolean(result.request.roomWithinVolume?.fullProfiles)!==Boolean(currentRequest.roomWithinVolume?.fullProfiles)) || (envelopeVersion==='room-within-volume'&&(result.request.roomWithinVolume?.version??'hull-pilot')!==roomVersion) || (envelopeVersion==='inserted-plate'&&(result.request.insertedPlate?.version??'legacy')!==plateMode) || voidSettingsKey(result.request.voidField)!==voidSettingsKey(currentRequest.voidField) || result.generator!==currentRequest.generator || result.request.envelopeVersion!==currentRequest.envelopeVersion ||
  result.request.workspaceTypology!==currentRequest.workspaceTypology || result.request.rulesetVersion!==currentRequest.rulesetVersion ||
  generationSettingsKey(result.request)!==generationSettingsKey(currentRequest) || result.request.population!==currentRequest.population ||
  (result.request.organization??'proximity')!==currentRequest.organization ||
  (result.request.articulation??0)!==currentRequest.articulation ||
  result.request.sourceId!==currentRequest.sourceId || JSON.stringify(result.request.source)!==JSON.stringify(currentRequest.source)
 ));
 async function generate(request:AmphitheaterRequest|null=currentRequest,candidate=1,guideSource?:'ruleset'){
  if(!request)return;
  let requested=request;
  if(request.workspaceTypology==='void-edge-workspace'){
   const previous=result?.request.workspaceTypology==='void-edge-workspace'?result.request:undefined;
   const sizes={topSize:coreTopSize,sideSize:coreSideSize};
   const previousSizes=voidEdgeCoreGuideSizes(previous?.voidEdgeCore,previous?.source);
   requested={...request,source:voidEdgeGuidesForCoreSizes(request.source,sizes,previousSizes),
    voidEdgeSourceHeight:previous?.sourceId===request.sourceId?previous.field.height:request.voidEdgeSourceHeight,
    voidEdgeRotation:voidBaseRotation??undefined,voidEdgeOuterWallThickness:outerWallThickness,voidEdgeWallGuide:verticalWallGuide,voidEdgeColumnSize:voidColumnSize,voidEdgeJoinShell:voidJoinShell,
    voidEdgeCore:{...sizes,wallThickness:coreWallThickness,slabThickness:voidSlabThickness}};
  }else if(request.workspaceTypology==='open-hall-workspace'){
   requested={...request,openHall:{...request.openHall,joinWalls,wallThickness,slabThickness}};
  }else if(request.workspaceTypology==='flat-deep-plan-plate'){
   requested={...request,preferredFeet:flatFloorGuide,flatPlate};
  }
  setBusy(true);setError('');setMessage(guideSource?'Generating guides and architecture from the ruleset…':candidate===1?'Generating architecture and checking the exported mesh…':'Checking new composition candidate '+candidate+' with the selected dimensions and letter quantity…');
  try{const response=await fetch('/api/amphitheater',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(guideSource?{...requested,guideSource}:requested)});const payload=await response.json();if(!response.ok){if(payload.geometryRejected){setError(payload.error);setMessage('Geometry rejected. Previous study retained.');return 'geometry-rejected';}throw Error(payload.error??'Generation failed');}setMessage('Loading validated, saved architecture…');const data:AmphitheaterResult=payload.architecture?payload:await fetch('/api/amphitheater?id='+payload.id).then(async r=>{if(!r.ok)throw Error('Saved result could not be loaded. Retry opening study '+payload.id);return r.json();});displayStudy(data);setStudies(s=>[{id:data.id,created:data.created,request:data.request,sourceCount:data.sourceCount,volume:data.volume},...s]);setSelected('');setComparison(undefined);setMessage('New study generated. Mesh checks passed.'+(candidate>1?' Accepted composition candidate '+candidate+'.':''));return 'accepted';}
  catch(e){setError(e instanceof Error?e.message:String(e));setMessage('Generation rejected. Previous study retained.');}finally{setBusy(false);}
 }
 async function regenerateArchitecture() {
  if (!currentRequest) return;
  if (currentRequest.workspaceTypology !== 'open-hall-workspace') {
   await generate(currentRequest);
   return;
  }
  try {
   const guides = buildOpenHallGuideLetters({
    ...currentRequest.field, ...currentRequest.openHall, preferredFeet: currentRequest.preferredFeet,
   });
   await generate(guides.length === currentRequest.source.length ? currentRequest : {
    ...currentRequest,
    source: guides,
    population: guides.length,
    sourceId: crypto.randomUUID(),
    sourceName: `${workspaceTypologyName(currentRequest.workspaceTypology)} · ${guides.length} letters`,
    sourceSnapshot: undefined,
   });
  } catch (e) {
   setError(e instanceof Error ? e.message : String(e));
   setMessage('Generation rejected. Previous study retained.');
  }
 }
 async function newDesign(){
  if(workspaceMode){
   if(!workspaceTypology){setError('Choose a workspace typology first.');return;}
   try{
    const openHall=workspaceTypology==='open-hall-workspace';
    const flatDeepPlate=workspaceTypology==='flat-deep-plan-plate';
    const useRuleGuides=openHall||flatDeepPlate;
    const arrangementSeed=useRuleGuides?0:seed??crypto.getRandomValues(new Uint32Array(1))[0];
    const openHallOpts=openHall?{mezzanineFaces,perimeterWalls,columnSize,columnGridSpacing,floorMezzGuideSize,wallGuideSize,roofGuideSize,roofSizing,roofInset}:undefined;
    let poses: AmphitheaterRequest['source'] = [];
    if (voidEdgeMode) {
      if(voidEdgeNewDesignError)throw Error(voidEdgeNewDesignError);
      const rotation=voidBaseRotation??voidEdgeAutoRotation(voidEdgeFit?.angles??[],arrangementSeed);
      if(rotation===undefined)throw Error('Choose plate U sizes that fit the field.');
      poses=buildVoidEdgeGuides(field,voidTopSize,voidSideSize,rotation);
    } else if (!useRuleGuides) {
      const count = population === 'auto' ? Math.max(4, currentRequest?.source.length ?? 8) : Number(population);
      if (!Number.isSafeInteger(count) || count < 2) throw Error('Enter Automatic or a whole letter quantity of at least 2.');
      poses = populate([], count, field, preferred, arrangementSeed, {spread:true});
    }
    const id=crypto.randomUUID(),typologyName=workspaceTypologyName(workspaceTypology);
    const name=useRuleGuides?typologyName:`${typologyName} · ${poses.length} letters · seed ${arrangementSeed}`;
    if(!useRuleGuides&&!voidEdgeMode){
     setSources(items=>[...items.filter(s=>s.id!==id&&s.id!=='custom'),{id,name,source:poses}]);setSourceId(id);
    }
    await generate({field,preferredFeet:workspaceTypology==='void-edge-workspace'?voidTopSize:openHall?floorMezzGuideSize:preferred,population:useRuleGuides?'auto':poses.length,source:poses,sourceId:id,sourceName:name,generator:'workspace-ten-rule',envelopeVersion:'workspace-ten-rule',workspaceTypology,typologyName,openHall:openHallOpts,letterArrangementRulesetId:workspaceRulesetIds(workspaceTypology!).letter,letterArrangementRulesetVersion:workspaceRulesetIds(workspaceTypology!).version,architecturalGenerationRulesetId:workspaceRulesetIds(workspaceTypology!).architecture,architecturalGenerationRulesetVersion:workspaceRulesetIds(workspaceTypology!).version,insertedPlate:undefined,voidField:undefined,roomWithinVolume:undefined},1,useRuleGuides?'ruleset':undefined);
   }catch(e){setError(e instanceof Error?e.message:String(e));setMessage(workspaceTypology==='flat-deep-plan-plate'?'Generation rejected. Previous study retained.':'Adjust preferred letter size or field, then Generate Design again.');}
   return;
  }
  if(envelopeVersion==='room-within-volume'&&roomVersion==='perimeter-room'){
   if(roomOrder!=='custom'){
    if(roomOrder==='shuffle'&&(!/^\d+$/.test(shuffleSeed)||Number(shuffleSeed)>0xffffffff)){setError('Enter a whole shuffle seed from 0 to 4294967295.');return;}
    await generate(fourLevelStudy(roomOrder,Number(shuffleSeed)));return;
   }
   try{for(let candidate=1;candidate<=5;candidate++){const poses=perimeterRoomSource(field,preferred,population,Math.random(),roomLevels,roomSpacing);
   const status=await generate({field,preferredFeet:preferred,population:population==='auto'?'auto':Number(population),source:poses,sourceId:crypto.randomUUID(),sourceName:'Terraced perimeter room',generator:'source-preserving',typologyName:'Room Within Volume',envelopeVersion,roomWithinVolume:{version:roomVersion,...(roomVersion==='perimeter-room'&&fullProfiles?{fullProfiles:true}:{})}},candidate);if(status!=='geometry-rejected')break;}
   }catch(e){setError(e instanceof Error?e.message:String(e));}return;
  }
  if(envelopeVersion==='room-within-volume'){if(!currentRequest){setError('Open a saved study or select source letters first.');return;}if(result&&(preferred!==result.request.preferredFeet||(population!=='auto'&&Number(population)!==currentRequest.source.length))){setError('This one-room pilot preserves letter size and quantity. Use Edit Letters to change the source.');return;}await generate({...currentRequest,envelopeVersion:'room-within-volume',typologyName:'Room Within Volume',population:currentRequest.source.length,insertedPlate:undefined,voidField:undefined});return;}
  setError('');setMessage('Creating source composition…');
  try{
   const attempts=seed===undefined?(envelopeVersion==='vertical-walls'?5:envelopeVersion==='void-field'||(envelopeVersion==='inserted-plate'&&plateMode==='edge-connected')?8:1):1;
   for(let candidate=1;candidate<=attempts;candidate++){
   const arrangementSeed=seed??crypto.getRandomValues(new Uint32Array(1))[0];
   const count=population==='auto'?(envelopeVersion==='inserted-plate'?(plateMode==='legacy'?9:(plateMode==='two-u'||(plateMode==='edge-connected'||plateMode==='merged-walls'))?12:suggestedInsertedPlateCount(field,preferred,floorSpacing)):envelopeVersion==='void-field'&&levelCount===4?15:['void-field','inserted-plate'].includes(envelopeVersion)?9:suggestedCount(field,preferred)):Number(population);
   if(!Number.isSafeInteger(count)||count<2)throw Error('Enter Automatic or a whole letter quantity of at least 2.');
   if(envelopeVersion==='inserted-plate'&&plateMode==='two-u'&&count!==12)throw Error('Two U plates require 12 letters.');
   if(envelopeVersion==='inserted-plate'&&plateMode!=='edge-connected'&&plateMode!=='merged-walls'&&(count<9||count>(plateMode==='legacy'?9:18)))throw Error(plateMode==='legacy'?'Legacy comparison requires nine letters.':'Enter 9–18 letters or Automatic.');
   if(envelopeVersion==='void-field'&&levelCount===4&&count!==15)throw Error('Four-level Void Field requires 15 letters.');
   if(envelopeVersion==='void-field'&&(count<9||count>15))throw Error('Void Field accepts 9–15 letters, or Automatic (9).');
   const sampled=envelopeVersion==='inserted-plate'&&plateMode==='edge-connected'?populatePerimeterLevels(field,preferred,arrangementSeed,floorSpacing,count):envelopeVersion==='inserted-plate'?(plateMode==='legacy'?populateInsertedPlate(field,preferred,arrangementSeed,floorSpacing):populateSpanningPlate(field,preferred,arrangementSeed,floorSpacing,count)):envelopeVersion==='void-field'?populateVoidField(field,preferred,arrangementSeed,floorSpacing,count,levelCount):populate([],count,field,preferred,arrangementSeed,{transitions:sourceTransitions,envelopeRoles:envelopeVersion==='vertical-walls',threeLifts:envelopeVersion==='vertical-walls',spread:true,liftLayout:amphLevels===3&&amphSpacing===undefined?undefined:{levels:amphLevels,spacing:amphSpacing}});
   const placements=sampled;
   const id=crypto.randomUUID(),name='Design · '+placements.length+' letters · seed '+arrangementSeed;
   const request:AmphitheaterRequest={insertedPlate:envelopeVersion==='inserted-plate'?{version:plateMode}:undefined,typologyName:envelopeVersion==='inserted-plate'?'Inserted Horizontal Plate':envelopeVersion==='void-field'?'Void Field Gathering':'Stepped Amphitheater',voidField:envelopeVersion==='void-field'?{...(levelCount===4?{levelCount}:{}),facadeMode,atriumBoundary,taper:voidTaper,profileMode:voidMode,connectivity:voidConnectivity}:undefined,generator:'source-preserving',envelopeVersion,articulationElevation:'feature',articulation,organization,field,preferredFeet:preferred,population:population==='auto'?'auto':count,sourceId:id,sourceName:name,source:placements,sourceSnapshot:{arrangementSeed,sourceTransitions,...(envelopeVersion==='vertical-walls'?{liftLayout:{levels:amphLevels,spacing:amphSpacing}}:{}),...(envelopeVersion==='void-field'?{levelCount}:{}),floorSpacing:['void-field','inserted-plate'].includes(envelopeVersion)?floorSpacing:undefined,orientationVersion:envelopeVersion==='inserted-plate'&&plateMode==='edge-connected'?7:envelopeVersion==='vertical-walls'?8:3}};
   const status=await generate(request,candidate);
   if(status!=='geometry-rejected'){if(status==='accepted')setMode('C');return;}
   }
  }catch(e){setError(e instanceof Error?e.message:String(e));setMessage('Adjust the selected settings and try again.');}
 }
 async function addFourthLevel(){if(!currentRequest)return;try{const placements=addVoidFieldFourthLevel(currentRequest.source,field,15);await generate({...currentRequest,population:15,source:placements,voidField:{...currentRequest.voidField,levelCount:4,atriumBoundary:'open'},sourceId:crypto.randomUUID(),sourceName:'Four levels · original 12 retained + 3 upper sources',sourceSnapshot:{...((currentRequest.sourceSnapshot??{}) as Record<string,unknown>),levelCount:4,floorSpacing:15,originalStudy:result?.id}});setMode('C');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function adjustSpacing(){if(!currentRequest)return;try{const placements=envelopeVersion==='inserted-plate'?applyInsertedPlateSpacing(currentRequest.source,field,floorSpacing):applyVoidFieldSpacing(currentRequest.source,field,floorSpacing);await generate({...currentRequest,source:placements,sourceId:crypto.randomUUID(),sourceName:floorSpacing+' ft floor spacing · '+currentRequest.sourceName,sourceSnapshot:{...(currentRequest.sourceSnapshot as Record<string,unknown>),floorSpacing,previousSourceId:currentRequest.sourceId,...(envelopeVersion==='inserted-plate'&&plateMode==='edge-connected'?{orientationVersion:7,cornerStudy:undefined}:{})}});setMode('C');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function load(id:string,compare=false){setError('');try{const response=await fetch('/api/amphitheater?id='+encodeURIComponent(id));const data:AmphitheaterResult&{error?:string}=await response.json();if(!response.ok)throw Error(data.error);if(compare)setComparison(data);else{displayStudy(data);}}catch(e){setError(String(e));}}
 function updateDraft(placements:AmphitheaterRequest['source'],name:string){setSources(items=>[...items.filter(s=>s.id!=='custom'),{id:'custom',name,source:placements,snapshot:envelopeVersion==='inserted-plate'&&plateMode==='edge-connected'?{...(source?.snapshot as Record<string,unknown>),orientationVersion:7,cornerStudy:undefined}:source?.snapshot}]);setSourceId('custom');setElevationMode('feature');setMode('A');}
 function applySource(){try{const parsed=JSON.parse(sourceText);if(!Array.isArray(parsed)||!parsed.length)throw Error('Paste an array of source placements.');const item={id:'custom',name:'Edited source composition',source:parsed};setSources(s=>[...s.filter(t=>t.id!=='custom'),item]);setSourceId('custom');setError('');}catch(e){setError(String(e));}}
 const displayField=result?.request.field??field;
 return <main className="p-4 space-y-4" style={{color:'var(--ink)'}}><AppNav/><header><h1 className="text-2xl font-semibold">Proto-Form Generation</h1><p>Existing LUV application · Z-up geometry in feet · isolated comparison workspace</p></header>
 <style jsx>{`.proof-layout {display:grid;grid-template-columns:minmax(270px,340px) minmax(0,1fr);gap:20px} @media(max-width:900px){.proof-layout{grid-template-columns:1fr}}`}</style><div className="proof-layout">
 <aside className="space-y-4"><section style={panel} className="space-y-3"><h2>Generation controls</h2>
 <label className="block">Typology<UnifiedTypologySelect family="workspace" aria-label="Typology" className="block w-full" value={workspaceTypology||(envelopeVersion==='room-within-volume'?'room-within-volume':envelopeVersion==='inserted-plate'?'inserted-plate':envelopeVersion==='void-field'?'void-field':'stepped')} disabled={busy} onChange={e=>{const value=e.target.value;if(WORKSPACE_TYPOLOGIES.some(([id])=>id===value)){const id=value as WorkspaceTypology;setWorkspaceTypology(id);if(id==='void-edge-workspace')setPreferred(voidEdgeRules.guides.mainEnd.defaultSize);setEnvelopeVersion('workspace-ten-rule');setGenerator('workspace-ten-rule');setField(WORKSPACE_DEFAULT_FIELDS[id]);setError('');return;}setWorkspaceTypology('');if(value==='room-within-volume'){setRoomVersion('perimeter-room');chooseOrder('platforms');setError('');}setEnvelopeVersion(value==='room-within-volume'?'room-within-volume':value==='inserted-plate'?'inserted-plate':value==='void-field'?'void-field':'vertical-walls');setGenerator('source-preserving');if(value==='stepped'||value==='void-field'||value==='inserted-plate'){setField({width:40,depth:40,height:60});setPreferred(LETTER_SIZE_PRESETS[60].preferredFeet);}else if(value==='room-within-volume'){setField({width:40,depth:40,height:60});setPreferred(LETTER_SIZE_PRESETS[60].preferredFeet);}}}>
 <optgroup label="Gathering proofs"><option value="stepped">Stepped Amphitheater</option><option value="inserted-plate">Inserted Horizontal Plate</option><option value="void-field">Void-Field</option><option value="room-within-volume">Room Within Volume</option></optgroup><optgroup label="Workspace typologies · dual rulesets">{WORKSPACE_TYPOLOGIES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</optgroup></UnifiedTypologySelect></label>
 {selectedRulesTypology&&<section aria-label="Current typology rules">
  <h3>Current rules · {workspaceTypologyName(selectedRulesTypology)}</h3>
  {sectionsForTypology(selectedRulesTypology).map(section=><details key={section.id}>
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
 {selectedRulesTypology&&<p className="text-xs">
  The letter arrangement ruleset runs before architectural generation.{' '}
  {workspaceTypology==='open-hall-workspace'
   ? 'Open Hall creates plates, piers, walls and skylights from a plan set by the field and guide settings.'
   : workspaceTypology==='flat-deep-plan-plate'
    ? 'Generate Design and New Design lay out L guides for the floor, mezzanine, columns and walls from the selected settings.'
    : workspaceTypology==='void-edge-workspace'
     ? 'Generate Design and New Design place U guides and derive column L guides from the core U endpoints.'
     : 'Generate Design and New Design build a fresh letter set sized to the preferred footprint inside the field.'}{' '}
  {workspaceTypology==='open-hall-workspace'
   ? 'Regenerate Architecture reseats the existing guides when the slot count matches and builds new guides when it changes.'
   : flatPlateMode
    ? 'Regenerate Architecture rebuilds the plan and its L guides from the current settings.'
    : workspaceTypology==='void-edge-workspace'
     ? 'Regenerate Architecture rebuilds the plates, core, walls and columns from the guides and current settings.'
     : 'Regenerate Architecture rebuilds the settings-based plan and reseats the retained letter guides.'}{' '}
  Change the field dimensions below and regenerate to revalidate. Geometric proof only.
 </p>}
 {workspaceMode&&!selectedRulesTypology&&<p className="text-xs">Two-stage workspace path: letter arrangement ruleset, then architectural generation. {workspaceTypology==='open-hall-workspace'?'Open Hall invents oriented L letters by role, then fills architecture as L footprints: corner pads from floor/mezz letters, L piers from column letters, L wall fills, L skylights from roof letters.':'Generate Design / New Design builds a fresh letter set sized to the preferred footprint inside the field.'} Regenerate Architecture keeps the current letters and only rearranges poses. Defaults apply for field size; change X/Y/Z below and regenerate to revalidate. Geometric proof only.</p>}
 {workspaceTypology==='open-hall-workspace'&&<div className="space-y-2"><label className="block">Mezzanine plate option<select aria-label="Mezzanine plate option" className="block w-full" value={mezzanineFaces} disabled={busy} onChange={e=>setMezzanineFaces(Number(e.target.value) as 2|3|4)}>{OPEN_HALL_MEZZANINE_OPTIONS.map(({value,label})=><option key={value} value={value}>{label}</option>)}</select></label>
<div><p className="text-xs mb-1">Column L guide size</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_COLUMN_SIZES.map(n=><button key={n} type="button" disabled={busy} aria-pressed={columnSize===n} className="border p-1" onClick={()=>setColumnSize(n)}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom column guide size" type="number" min="0.1" step="any" className="border w-16 p-1" disabled={busy} value={columnSize} onChange={e=>setColumnSize(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_COLUMN_SIZE))}/></label></div></div>
<div><p className="text-xs mb-1">Column grid spacing (XY · equal · floor-plate boundary)</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_COLUMN_GRID_SPACINGS.map(n=><button key={n} type="button" disabled={busy} aria-pressed={columnGridSpacing===n} className="border p-1" onClick={()=>setColumnGridSpacing(n)}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom column grid spacing" type="number" min="1" step="any" className="border w-16 p-1" disabled={busy} value={columnGridSpacing} onChange={e=>setColumnGridSpacing(normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING))}/></label></div></div>
<div><p className="text-xs mb-1">Floor and mezzanine L guides</p><div className="flex gap-2 flex-wrap">{OPEN_HALL_FLOOR_MEZZ_GUIDE_SIZES.map(n=><button key={n} type="button" disabled={busy} aria-pressed={floorMezzGuideSize===n} className="border p-1" onClick={()=>{setFloorMezzGuideSize(n);setPreferred(n);}}>{n}′</button>)}<label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom floor mezz guide size" type="number" min="0.1" step="any" className="border w-16 p-1" disabled={busy} value={floorMezzGuideSize} onChange={e=>{const n=normalizeOpenHallGuideSize(+e.target.value,OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE);setFloorMezzGuideSize(n);setPreferred(n);}}/></label></div></div>
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
{(['width','depth','height'] as const).map((axis,i)=><label className="block" key={axis}>{['Width X','Depth Y','Height Z'][i]} (ft)<select aria-label={axis} className="block w-full" value={field[axis]} disabled={busy||fixedPattern} onChange={e=>setField(f=>({...f,[axis]:+e.target.value}))}>{(workspaceTypology==='void-edge-workspace'?voidEdgeRules.field.sizes:WORKSPACE_FIELD_PRESETS).map(n=><option key={n}>{n}</option>)}</select></label>)}
 {generationBlocked&&<p role="alert" style={{color:'#ed8989'}}>{openHallError??flatPlateError}</p>}
 {voidEdgeFit&&<fieldset className="space-y-2">
  <legend>Plate U sizes for a new design</legend>
  {([
   ['Top bottom U size','Top/bottom pair',voidTopSize,setVoidTopSize,voidEdgeRules.guides.mainEnd.presets,voidEdgeFit.unavailableTop],
   ['Side U size','Left/right pair',voidSideSize,setVoidSideSize,voidEdgeRules.guides.mainSide.presets,voidEdgeFit.unavailableSide],
  ] as const).map(([label,pair,value,setSize,presets,unavailable])=><div key={label}>
   <p>{pair} (ft)</p>
   <div className="flex gap-2 flex-wrap">
    {presets.map(size=>{
     const fits=!unavailable.some(unavailableSize=>unavailableSize===size);
     return <button key={size} type="button" disabled={busy} className={`border p-1${fits?'':' opacity-50'}`}
      aria-label={`${label} ${size} ft${fits?'':' · does not fit with current settings'}`}
      aria-pressed={value===size} onClick={()=>setSize(size)}>{size}′</button>;
    })}
    <label>Custom<input aria-label={label} className="w-16" type="number" min="0.1" step="any" disabled={busy}
     value={value||''} onChange={e=>setSize(+e.target.value)}/></label>
   </div>
  </div>)}
  <p className="text-xs">Generate Design and New Design use these sizes. Regenerate Architecture uses the saved plate U groups.</p>
  {(voidEdgeFit.unavailableTop.length>0||voidEdgeFit.unavailableSide.length>0)&&<p className="text-xs">Dimmed presets need a different paired size, rotation, or field.</p>}
  {voidEdgeNewDesignError&&<p role="status" className="text-xs">{voidEdgeNewDesignError}</p>}
 </fieldset>}
 {workspaceTypology==='void-edge-workspace'&&<fieldset><legend>Hollow elliptical core</legend>{([['Core top/bottom U size',coreTopSize,setCoreTopSize,voidEdgeRules.guides.coreEnd.presets],['Core left/right U size',coreSideSize,setCoreSideSize,voidEdgeRules.guides.coreSide.presets]] as const).map(([label,value,setValue,presets])=><div key={label}><p>{label} (ft)</p><div className="flex gap-2 flex-wrap">{presets.map(n=><button key={n} className="border p-1" disabled={busy} aria-pressed={value===n} onClick={()=>setValue(n)}>{n}′</button>)}<label>Custom<input aria-label={label} className="w-16" type="number" min="0.1" step="any" disabled={busy} value={value} onChange={e=>setValue(+e.target.value)}/></label></div></div>)}<p className="text-xs">Regenerate applies the core sizes and thicknesses. Four core U guides size each intermediate plate’s opening. Every other group also extrudes a hollow segment up to 10 ft. The ground and roof plates cover the core opening.</p></fieldset>}
 {workspaceTypology==='void-edge-workspace'&&<fieldset>
  <legend>Column L size (ft)</legend>
  <div className="flex gap-2 flex-wrap">{voidEdgeRules.columns.presets.map(size=><button key={size} type="button" disabled={busy} className="border p-1" aria-pressed={voidColumnSize===size} onClick={()=>setVoidColumnSize(size)}>{size}′</button>)}
   <label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom column L size" className="border w-16 p-1" type="number" min={voidEdgeRules.columns.minimumSize} step="any" disabled={busy} value={voidColumnSize||''} onChange={e=>setVoidColumnSize(+e.target.value)}/></label>
  </div>
  <p className="text-xs">Regenerate Architecture to apply the new column width.</p>
 </fieldset>}
 {workspaceTypology==='void-edge-workspace'&&<fieldset>
  <legend>Vertical wall U guides</legend>
  <p className="text-xs mb-1">Vertical wall U size (ft)</p>
  <div className="flex gap-2 flex-wrap">{voidEdgeRules.walls.verticalGuide.presets.map(size=><button key={size} type="button" disabled={busy} className="border p-1" aria-pressed={verticalWallGuide.size===size} onClick={()=>setVerticalWallGuide(guide=>({...guide,size}))}>{size}′</button>)}
   <label className="text-xs flex items-center gap-1">Custom<input aria-label="Custom vertical wall U size" className="border w-16 p-1" type="number" min="0.1" step="any" disabled={busy} value={verticalWallGuide.size||''} onChange={e=>setVerticalWallGuide(guide=>({...guide,size:+e.target.value}))}/></label>
  </div>
  <label className="block text-xs mt-2">Wall bow direction<select className="block w-full" disabled={busy} value={verticalWallGuide.direction} onChange={e=>{const direction=e.target.value==='outward'?'outward':'inward';setVerticalWallGuide(guide=>({...guide,direction}));}}><option value="inward">Inward</option><option value="outward">Outward</option></select></label>
  <p className="text-xs">Larger U guides deepen the bow between plates. Regenerate Architecture applies these settings while keeping the 50% plate-edge coverage.</p>
 </fieldset>}
 {workspaceTypology==='void-edge-workspace'&&<fieldset><legend>Thickness and visibility</legend><div className="grid grid-cols-2 gap-2"><label>Core wall thickness (ft)<input aria-label="Core wall thickness" className="block w-full" type="number" min="0.1" step="0.25" disabled={busy} value={coreWallThickness} onChange={e=>setCoreWallThickness(+e.target.value)}/></label><label>Outer wall thickness (ft)<input aria-label="Outer wall thickness" className="block w-full" type="number" min="0.1" step="0.25" disabled={busy} value={outerWallThickness} onChange={e=>setOuterWallThickness(+e.target.value)}/></label><label>Slab thickness (ft)<input aria-label="Void Edge slab thickness" className="block w-full" type="number" min="0.1" step="0.25" disabled={busy} value={voidSlabThickness} onChange={e=>setVoidSlabThickness(+e.target.value)}/></label></div>
  <label className="block"><input type="checkbox" checked={voidJoinShell} disabled={busy} onChange={e=>setVoidJoinShell(e.target.checked)}/> Join cores and walls with floors and columns (regenerate to apply)</label>
  {savedVoidShellJoined&&<p className="text-xs">Turn off joining and regenerate to hide individual layers.</p>}
  {[['ground','Show floor plate'],['mezzanine','Show intermediate plates'],['roof','Show roof plate'],['support','Show core walls'],['column','Show columns'],['wall','Show outer walls']].map(([role,label])=><label key={role} className="block"><input type="checkbox" checked={savedVoidShellJoined||!hiddenVoidLayers.includes(role)} disabled={busy||savedVoidShellJoined} onChange={e=>setHiddenVoidLayers(current=>e.target.checked?current.filter(r=>r!==role):[...current,role])}/>{label}</label>)}<p className="text-xs">Visibility updates the viewer only. Regenerate older studies once to enable these controls. Thickness changes require regeneration.</p></fieldset>}
 {workspaceTypology==='void-edge-workspace'&&<label className="block">Base and roof rotation<select aria-label="Base and roof rotation" className="block w-full" disabled={busy} value={voidBaseRotation??'auto'} onChange={e=>setVoidBaseRotation(e.target.value==='auto'?null:+e.target.value)}><option value="auto">Auto · fit New Design, keep saved angle on Regenerate</option>{voidEdgeBaseRotations.map(n=><option key={n} value={n}>{n}°</option>)}</select><span className="text-xs">Intermediate angles are relative to the base. Core and roof match the base angle.</span></label>}
 {workspaceTypology!=='void-edge-workspace'&&workspaceTypology!=='open-hall-workspace'&&workspaceTypology!=='flat-deep-plan-plate'&&<>
 <label className="block">Preferred letter size (ft)<input aria-label="Preferred letter size" className="block w-full" type="number" min="0" step="any" value={preferred} disabled={busy||fixedPattern} onChange={e=>setPreferred(+e.target.value)}/></label>
 <div className="flex gap-2">{([20,40,60] as const).map(h=><button key={h} disabled={busy||fixedPattern} onClick={()=>setPreferred(LETTER_SIZE_PRESETS[h].preferredFeet)} className="border p-1">{LETTER_SIZE_PRESETS[h].preferredFeet}′ preset</button>)}</div><p className="text-xs">Letter presets and field dimensions are independent.</p>
 <label className="block">Letter quantity<input aria-label="Letter quantity" className="block w-full" value={population==='auto'?'Automatic':population} disabled={busy||fixedPattern} onChange={e=>setPopulation(/^auto(matic)?$/i.test(e.target.value)?'auto':e.target.value)} placeholder="Automatic or a whole number"/></label>
 </>}
 {envelopeVersion==='void-field'&&<div><label className="block">Occupied levels<select className="block w-full" aria-label="Occupied levels" value={levelCount} disabled={busy} onChange={e=>setLevelCount(+e.target.value as 3|4)}><option value={3}>3 levels</option><option value={4}>4 levels · 15 letters required</option></select></label><label className="block">Atrium boundary<select className="block w-full" aria-label="Atrium boundary" value={atriumBoundary} disabled={busy} onChange={e=>setAtriumBoundary(e.target.value as typeof atriumBoundary)}><option value="open">Open toward floors · validate sightlines</option><option value="enclosed">Enclosed lightwell · comparison baseline</option></select></label><label className="block">Exterior façade sweep<select className="block w-full" aria-label="Facade sweep" value={facadeMode} disabled={busy} onChange={e=>setFacadeMode(e.target.value as typeof facadeMode)}><option value="vertical">Global Z · vertical comparison</option><option value="face-normal">Face-Normal Façade · source-perpendicular sweep</option></select></label><p>Face-Normal sweeps follow the saved source-face normal. For four levels, automatic upper façade supports stop at the preceding floor; explicit support Z overrides remain available.</p><p>Level settings apply to new compositions. Regeneration retains existing source poses. Enclosed mode is a lightwell comparison and does not validate floor-facing atrium views.</p>{source?.source.length===12&&<button disabled={busy} className="border p-2" onClick={()=>void addFourthLevel()}>Add fourth level at 15 ft · retain existing 12 letters</button>}</div>}
 {envelopeVersion==='inserted-plate'&&<p className="text-xs">{(plateMode==='edge-connected'||plateMode==='merged-walls')?'Enter a quantity or use Automatic (12).':plateMode==='two-u'?'Four L/U/V groups · 12 letters.':plateMode==='legacy'?'Legacy comparison: 9 letters.':'9–18 letters; Automatic uses '+suggestedInsertedPlateCount(field,preferred,floorSpacing)+'.'} New Design creates a new arrangement; Regenerate Architecture preserves every existing source pose and quantity.</p>}
 {envelopeVersion==='void-field'&&<p className="text-xs">9–15 letters; Automatic uses {levelCount===4?15:9}. Generate Design / New Design uses this quantity. Regenerate Architecture keeps the existing source letters. New Design checks up to eight compositions when no seed is specified; rejected candidates do not change the selected dimensions or size.</p>}
 {envelopeVersion==='vertical-walls'&&<div>
 <label>Amphitheater levels<input className="block w-full" type="number" min={2} step={1} value={amphLevels||''} disabled={busy} onChange={e=>setAmphLevels(Number(e.target.value))}/></label>
 <label>Level spacing<select className="block w-full" value={amphSpacing??'auto'} disabled={busy} onChange={e=>setAmphSpacing(e.target.value==='auto'?undefined:Number(e.target.value))}><option value="auto">Automatic</option>{[12,13,14,15].map(n=><option key={n} value={n}>{n} ft</option>)}</select></label>
 <p className="text-xs">Generate Design and New Design use these levels. Regenerate Architecture keeps the displayed letter elevations.</p></div>}
 {['void-field','inserted-plate'].includes(envelopeVersion)&&<div><label>Floor-to-floor spacing<select aria-label="Floor-to-floor spacing" className="block w-full" value={floorSpacing} disabled={busy} onChange={e=>setFloorSpacing(+e.target.value)}>{[12,13,14,15].map(n=><option key={n} value={n}>{n} ft</option>)}</select></label><p className="text-xs">Used by Generate Design and New Design. Adjust current levels moves only source elevations and saves a separate result. Regenerate Architecture retains current poses.</p>{result&&<button disabled={busy||changedPlateInputs} className="border p-2" onClick={()=>void adjustSpacing()}>Adjust current levels to {floorSpacing} ft</button>}</div>}
 {envelopeVersion==='room-within-volume'&&roomVersion==='perimeter-room'&&<div><label>Perimeter arrangement<select className="block w-full" value={roomOrder} disabled={busy} onChange={e=>chooseOrder(e.target.value as typeof roomOrder)}><option value="custom">Custom layout</option><option value="original">5/5/4/4 · Current order</option><option value="platforms">5/5/4/4 · Suspended room with L and U platforms</option><option value="suspended">5/5/4/4 · Suspended L/L/V room</option><option value="shuffle">5/5/4/4 · Seeded shuffle</option></select></label>{fixedPattern&&<p>13′ / 9′ / 13′ / 9′ perimeter letters · 15 ft between levels · three interior room letters.</p>}{roomOrder==="shuffle"&&<div><label>Shuffle seed<input className="block w-full" type="number" min="0" max="4294967295" step="1" disabled={busy} value={shuffleSeed} onChange={e=>setShuffleSeed(e.target.value)}/></label><button type="button" disabled={busy} onClick={()=>setShuffleSeed(String(crypto.getRandomValues(new Uint32Array(1))[0]))}>Pick new seed</button><p>Generate Design saves a variation. Reuse its seed to repeat the upper-level order. If a wall intersects itself, choose another seed.</p></div>}<label>Wall profile<select className="block w-full" value={fullProfiles?"full":"overlap"} onChange={e=>setFullProfiles(e.target.value==="full")} disabled={busy||fixedPattern}><option value="overlap">Overlapping contour portions</option><option value="full">Loft complete exterior profiles</option></select></label><label>Perimeter levels<select className="block w-full" value={roomLevels} disabled={busy||fixedPattern} onChange={e=>setRoomLevels(+e.target.value)}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label>Level spacing<select className="block w-full" value={roomSpacing} disabled={busy||fixedPattern} onChange={e=>setRoomSpacing(+e.target.value)}>{Array.from(new Set([12,13,14,15,roomSpacing])).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} ft</option>)}</select></label><p className="text-xs">Generate Design applies these settings to new perimeter letters and walls. Regenerate Architecture keeps the current letter elevations. These levels do not add interior floors.</p></div>}
 {envelopeVersion==='room-within-volume'&&<label>Room derivation<select aria-label="Room derivation" value={roomVersion} onChange={e=>setRoomVersion(e.target.value as typeof roomVersion)} disabled={busy} className="block w-full"><option value="perimeter-room">{roomOrder==='platforms'||roomOrder==='suspended'?'Terraced perimeter walls and suspended room':'Terraced perimeter walls and U alcove'}</option><option value="anchored-room">U room · L floor · folded V roof</option><option value="contour-walls">Native U/L/V contour walls</option><option value="hull-pilot">Original hull pilot — comparison</option></select><p className="text-xs">{roomVersion==='perimeter-room'?fixedPattern?'Generate Design applies the selected order. Regenerate Architecture preserves your current letters.':'Automatic uses '+perimeterLayout(field,preferred,roomLevels).total+' letters for the selected perimeter. Generate Design creates new letters. Regenerate Architecture uses the current letters.':'Generate a separate room study from the current source letters.'}</p></label>}
 <button className="border rounded p-3 w-full" disabled={busy||generationBlocked||Boolean(voidEdgeNewDesignError)} onClick={newDesign}>{busy?'Generating and validating…':envelopeVersion==='room-within-volume'&&roomVersion!=='perimeter-room'?'Generate Room From Current Letters':'Generate Design'}</button>
 {changedPlateInputs&&<p>Choose Generate Design to apply the selected letter size and quantity.</p>}
 {result&&<div className="flex flex-wrap gap-2"><button disabled={busy||generationBlocked||Boolean(voidEdgeNewDesignError)||(envelopeVersion==='room-within-volume'&&roomVersion!=='perimeter-room')} onClick={newDesign}>New Design</button>
 {(workspaceTypology==='open-hall-workspace'||flatPlateMode||voidEdgeMode)
  ? <button disabled={busy} onClick={()=>setMode('A')}>View Letters</button>
  : <button disabled={busy} onClick={()=>{setEditing(true);setMode('A');}}>Edit Letters</button>}
 <button disabled={busy||generationBlocked||!source||changedPlateInputs} onClick={regenerateArchitecture}>Regenerate Architecture</button></div>}
 <p role="status">{message}</p>{error&&<p role="alert" style={{color:'#ed8989',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{error}</p>}
 {editing&&generator==='source-preserving'&&<fieldset disabled={busy}><SourcePopulationEditor voidField={envelopeVersion==='void-field'} envelopeRoles={envelopeVersion==='vertical-walls'} showPopulation={false} source={source?.source??[]} field={field} preferred={preferred} onApply={updateDraft} onRestore={s=>{setField(s.field);setPreferred(s.preferred);updateDraft(s.source,s.name);}}/></fieldset>}
 <details><summary>Advanced Settings</summary>{envelopeVersion==='inserted-plate'&&<label>Plate generation<select aria-label="Plate generation" value={plateMode} onChange={e=>setPlateMode(e.target.value as typeof plateMode)} disabled={busy}><option value="edge-connected">Flush plates with edge connection</option><option value="merged-walls">Merged exterior walls and U interiors</option><option value="two-u">Two U plates · four L/U/V groups</option><option value="suspended">Single plate in a large void</option><option value="spanning-v2">Source-driven spanning plates</option><option value="legacy">Legacy nine-letter ledges · comparison</option></select></label>}<label>Envelope operation<select aria-label="Envelope operation" value={envelopeVersion} disabled={busy} onChange={e=>setEnvelopeVersion(e.target.value as typeof envelopeVersion)}><option value="inserted-plate">Inserted Plate · horizontal floors and letter-derived boundaries</option><option value="void-field">Void Field · plan concavities developed along Z</option><option value="room-within-volume">Room Within Volume · independent room pilot</option><option value="profiles">Preserved profile envelope</option><option value="vertical-walls">Vertical walls, through openings and recessed alcoves</option></select></label><p className="text-xs">The experimental operation validates explicit source roles and may reject disconnected cuts or export degeneracies. It never falls back silently. Use the supplied wall studies for geometric evaluation.</p>
 {envelopeVersion==='void-field'&&<fieldset className="space-y-2"><legend>Void Field · 9–15 letters</legend><p>Horizontal interior letters use Z rotations 75° / 90° / 105°. Regeneration retains original poses. {facadeMode==='face-normal'?'Exterior façades follow source-face normals and are geometrically trimmed to the field.':'Exterior walls remain vertical.'}</p><label>Profile development<select aria-label="Void profile development" value={voidMode} onChange={e=>setVoidMode(e.target.value as typeof voidMode)}><option value="straight">Straight source profiles</option><option value="neighbor-taper">Neighbor-derived taper</option></select></label><label>Taper strength<input aria-label="Void taper strength" type="number" min="0" max="1" step=".05" value={voidTaper} onChange={e=>setVoidTaper(+e.target.value)}/></label><label>Void connections<select value={voidConnectivity} onChange={e=>setVoidConnectivity(e.target.value as typeof voidConnectivity)}><option value="adjacent">Adjacent voids between floors</option><option value="none">Separate voids</option></select></label><p>Void extent and floor levels follow source elevations. Roles are editable in Edit Letters. Profile shifts/splits and circulation verification are deferred.</p></fieldset>}
 <label className="block"><input type="checkbox" checked={sourceTransitions} onChange={e=>setSourceTransitions(e.target.checked)}/> Allow ±30° source transitions (Stepped Amphitheater)</label>{!['void-field','inserted-plate'].includes(envelopeVersion)&&<p className="text-xs">Experimental perimeter walls use global Z and support Z defaults to the field floor. New designs use the selected levels. Upright interior letters belong to intermediate levels and make X/Y through openings; edit roles and support Z in Edit Letters. New lower and upper terrace letters incline up to 12 degrees. Interior letters define through openings or backed alcoves. Edit Letters controls the opening and recess depth. Edit Letters permits intentional upright boundaries. Regeneration preserves all edited poses.</p>}<label>Arrangement seed<input aria-label="Arrangement seed" type="number" value={seed??''} placeholder="New seed each design" onChange={e=>setSeed(e.target.value===''?undefined:+e.target.value)}/></label>
  {generator==='source-preserving'&&envelopeVersion==='profiles'&&<label className="block">Envelope articulation · {Math.round(articulation*100)}%<input type="range" min="0" max="1" step=".05" value={articulation} disabled={busy} onChange={e=>setArticulation(+e.target.value)}/></label>}{generator==='source-preserving'&&<label>Relationship priority<select value={organization} onChange={e=>setOrganization(e.target.value as typeof organization)}><option value="proximity">Proximity</option><option value="alignment">Proximity and tangent alignment</option></select></label>}<label className="block">Generator<select aria-label="Generator" className="block w-full" value={generator} disabled={busy} onChange={e=>setGenerator(e.target.value as AmphitheaterRequest['generator'])}><option value="source-preserving">Source-preserving — original relationships</option><option value="typology-baseline">Typology-driven comparison baseline</option></select></label>
 <label className="block">Source composition<select aria-label="Source composition" className="block w-full" value={sourceId} disabled={busy} onChange={e=>setSourceId(e.target.value)}>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="border p-1" disabled={busy} onClick={refreshSources}>Refresh Composition source list</button><p role="status" className="text-xs">{sourceMessage}</p><a className="underline text-sm" href="/composition" target="_blank" rel="noreferrer">Open Composition to create a study</a><p className="text-xs">Reads current and saved alternatives from Composition on this app origin. Selected windows are localized by translation only before submission. The baseline then rearranges them.</p>

 <button disabled={busy||!source} onClick={()=>void generate()}>Generate from selected source</button><details style={panel}><summary>Inspect / edit input composition</summary><p className="text-xs">Edit x/y/z in feet, rx/ry/rz in degrees and scale per instance. Apply before generating.</p><button className="border p-1" onClick={()=>setSourceText(JSON.stringify(source?.source??[],null,2))}>Copy selected source into editor</button><textarea aria-label="Source JSON" style={{width:'100%',height:220,fontSize:11}} value={sourceText} onChange={e=>setSourceText(e.target.value)}/><button disabled={busy} className="border p-1" onClick={applySource}>Use edited source</button></details></details></section>
 </aside><section className="space-y-3" style={{minWidth:0}}><section style={panel}><div className="flex flex-wrap gap-2">{(['A','B','C'] as const).map(m=><button aria-pressed={mode===m} className="border rounded p-2" key={m} onClick={()=>setMode(m)}>{m} — {m==='A'?'Original Letters':m==='B'?'Letters + Architecture':'Architecture Only'}</button>)}</div>
 {mode==='B'&&(isUpdatedWorkspace(result?.request.workspaceTypology)||isUpdatedWorkspace(comparison?.request.workspaceTypology))&&<label className="flex w-fit items-center gap-2 text-sm"><input type="checkbox" checked={showLettersOnTop} onChange={e=>setShowLettersOnTop(e.target.checked)}/> Show letters on top</label>}
 <p className="text-xs my-2">{result?.generator==='workspace-ten-rule'
  ? (result.request.workspaceTypology==='open-hall-workspace'||result.request.workspaceTypology==='flat-deep-plan-plate'
   ? 'The field and settings determine the guide layout. The architecture is built and checked against that layout.'
   : 'Workspace dual rulesets: letter arrangement then architectural generation. Identities and proportions preserved; poses may rearrange.')
  : result?.generator==='typology-baseline'?'Baseline: rearranged source population.':'Original poses; all geometry uses the same field-center to floor translation.'}</p>
 <div className="flex flex-wrap gap-2">{(['isometric','plan','elevation','section'] as const).map(v=><button className="border p-2" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}<button className="border p-2" onClick={()=>setReset(r=>r+1)}>Reset camera</button></div>{view==='section'&&<label>Section X = {cut.toFixed(1)} ft<input aria-label="Section position" type="range" min={-displayField.width/2} max={displayField.width/2} step="0.1" value={cut} onChange={e=>setCut(+e.target.value)}/></label>}
 <p className="text-xs my-2">Orbit: left drag in isometric. Pan: right drag. Zoom: wheel. Section clips at X; A/B/C share exact coordinates and field framing.</p>
 {stale&&<p style={{color:'#e4c67f'}}>Controls differ from the displayed study. Generate to evaluate the new settings.</p>}
 {result?.voidFieldReport?.visibility&&<label className="block"><input type="checkbox" checked={showSightlines} onChange={e=>setShowSightlines(e.target.checked)}/> Show validated cross-level sightlines</label>}
 {result?.roomReport&&<button className="border p-2" onClick={()=>setRoomCutaway(!roomCutaway)}>{roomCutaway?'Cutaway view · show full enclosure':'Full enclosure · show cutaway'}</button>}
 {result?.primary&&!result.roomReport&&<button className="border p-2" onClick={()=>setPrimary(!primary)}>{primary?'Viewing primary envelope · show articulated':'Viewing articulated envelope · show primary'}</button>}
 <Viewer showLettersOnTop={showLettersOnTop} hiddenLayers={hiddenVoidLayers} sightlines={showSightlines} showWalls={workspaceTypology==='open-hall-workspace'?perimeterWalls:workspaceTypology==='flat-deep-plan-plate'?flatShowWalls:true} draft={sourceId==='custom'&&generator==='source-preserving'?source?.source:undefined} result={primary&&result?.primary?{...result,architecture:result.primary,components:[]}:result?.roomReport&&roomCutaway&&result.roomCutaway?{...result,architecture:result.roomCutaway}:result} field={mode==='A'&&sourceId==='custom'?field:displayField} mode={mode} view={view} cut={cut} selected={selected} onPick={setSelected} isolate={isolate} reset={reset}/>
  {envelopeVersion==='room-within-volume'&&<p>Independent Enclosed Room pilot: generate from the selected letters or edit them, then regenerate. Source transforms and quantity are preserved.</p>}
 {result?.roomReport&&<section>{result.roomReport.perimeter&&<p>Perimeter letters: {result.roomReport.perimeter.lower} lower and {result.roomReport.perimeter.upper} upper · {result.roomReport.perimeter.interior} room letters · {(result.roomReport.perimeter.baseCoverage*100).toFixed(1)}% angular coverage · largest base gap at most {result.roomReport.perimeter.maxGapFeet.toFixed(1)} ft.</p>}<h3>Independent Enclosed Room — measured geometry</h3><p>{result.roomReport.clearRoomArea.toFixed(1)} ft² clear room · {result.roomReport.headroom.toFixed(2)} ft headroom · {result.roomReport.interstitialArea.toFixed(1)} ft² surrounding space.</p><p>Room sources: {result.roomReport.roomSources.join(', ')}. {result.roomReport.windows.length} further source-derived outer openings. Access check: {result.roomReport.access.clearWidth} ft wide × {result.roomReport.access.clearHeight} ft high.</p>{result.roomReport.contours&&<><p>{result.roomReport.contours.method}. Room boundary offset: {result.roomReport.contours.roomOffset} ft; outer boundary offset: {result.roomReport.contours.envelopeOffset} ft.</p><details><summary>Each letter’s measured influence</summary>{result.contributions?.map(c=><p key={c.letter}>{c.letter}: {c.relationships.join(', ')} · {(c.exposedArea??0).toFixed(1)} ft² exposed surface</p>)}</details></>}<p>Geometric pilot; architectural access and structural performance are not certified.</p></section>}
 <p>{result?`Displayed study: ${displayField.width} × ${displayField.depth} × ${displayField.height} ft · ${result.request.preferredFeet} ft letters · ${result.sourceCount} actual instances · ${result.volume.toFixed(3)} ft³${result.request.workspaceTypology?' · '+workspaceTypologyName(result.request.workspaceTypology):''}`:'No saved geometry is preloaded. Generate a new study.'}</p>
 {isUpdatedWorkspace(result?.request.workspaceTypology)&&(result?.letterArrangementReport||result?.architecturalGenerationReport)&&<details key={result.id} open={savedRulesMatchSelection} style={{marginTop:16}}>
 <summary>Saved study rules{savedRulesTypology&&` · ${workspaceTypologyName(savedRulesTypology)}`}</summary>
 <p className="text-xs">Geometric proof only — not certified for occupancy, circulation, accessibility, or structure. All measured rules stay listed below (pass and fail).</p>
 {result.letterArrangementReport&&<WorkspaceRuleGroup report={result.letterArrangementReport}/>}
 {result.architecturalGenerationReport&&<WorkspaceRuleGroup report={result.architecturalGenerationReport}/>}
 </details>}
 {!isUpdatedWorkspace(result?.request.workspaceTypology)&&(result?.letterArrangementReport||result?.architecturalGenerationReport)&&<section style={{marginTop:16}}><h2>Workspace dual rulesets</h2><p className="text-xs">Geometric proof only — not certified for occupancy, circulation, accessibility, or structure. All measured rules stay listed below (pass and fail).</p>
 {result.letterArrangementReport&&<details open><summary><strong>Letter arrangement</strong> · {result.letterArrangementReport.rulesetId} v{result.letterArrangementReport.rulesetVersion} · {result.letterArrangementReport.overall.toUpperCase()} · {result.letterArrangementReport.rules.length} rules</summary>{result.letterArrangementReport.rules.map(rule=><details key={rule.id} open style={{border:'1px solid var(--line)',borderRadius:6,padding:8,marginTop:6}}><summary>{rule.id} · {rule.status.toUpperCase()} · {rule.title}</summary>{rule.measured&&<p className="text-xs">Measured {rule.measured}{rule.threshold?` · threshold ${rule.threshold}`:''}{rule.units?` · ${rule.units}`:''}</p>}{rule.evidence.map((item,index)=><p className="text-xs" key={index}>{item}</p>)}</details>)}</details>}
 {result.architecturalGenerationReport&&<details open><summary><strong>Architectural generation</strong> · {result.architecturalGenerationReport.rulesetId} v{result.architecturalGenerationReport.rulesetVersion} · {result.architecturalGenerationReport.overall.toUpperCase()} · {result.architecturalGenerationReport.rules.length} rules</summary>{result.architecturalGenerationReport.rules.map(rule=><details key={rule.id} open style={{border:'1px solid var(--line)',borderRadius:6,padding:8,marginTop:6}}><summary>{rule.id} · {rule.status.toUpperCase()} · {rule.title}</summary>{rule.measured&&<p className="text-xs">Measured {rule.measured}{rule.threshold?` · threshold ${rule.threshold}`:''}{rule.units?` · ${rule.units}`:''}</p>}{rule.evidence.map((item,index)=><p className="text-xs" key={index}>{item}</p>)}</details>)}</details>}
 </section>}
 {result?.plateReport?.version==='edge-connected'?<p>The two horizontal plates share a footprint. The upper plate meets an L wall along its edge.</p>:result?.plateReport?.version==='merged-walls'?<p>Exterior letter edges form overlapping walls. The two middle U interiors form plates that meet adjacent walls directly.</p>:result?.plateReport?.version==='two-u'?<p>Middle U bends form the inserted plates. Partial L corners form walls and upright V arms form frames.</p>:envelopeVersion==='inserted-plate'&&<p>Inserted Plate: horizontal plate sources span compatible letter-derived edge and frame boundaries. Letter concavities protect openings between levels. New sources use horizontal L/U and upright V roles; regeneration preserves all saved poses. Legacy ledges remain in Advanced Settings for comparison.</p>}
 {result?.plateReport&&<details open><summary>Inserted Plate source influence and geometry</summary>{result.plateReport.floors.map(f=><p key={f.id}>{f.source} · horizontal plate at {f.topZ.toFixed(2)} ft {f.netArea!==undefined?' · '+f.netArea.toFixed(1)+' ft² net floor':''} · {f.links.map(l=>l.source).join(', ')} boundary links</p>)}{result.plateReport.pockets.map(p=><p key={p.source}>{p.source} · open curved edge recess above {p.floor}</p>)}{result.plateReport.walls.map(w=><p key={w.source}>{w.source} · upright boundary · support {w.supportZ.toFixed(2)} ft · {w.contacts.filter(c=>c.volume>1e-6).length} plate contacts</p>)}<p>{result.plateReport.limitations.join(' ')}</p></details>}
 {result?.voidFieldReport&&<p>Displayed façade mode: {result.voidFieldReport.facadeMode==='face-normal'?'Face-Normal · source-perpendicular':'Global Z · vertical comparison'}.</p>}
 {result?.voidFieldReport&&<details open><summary>Void Field source influence and geometry</summary><p>Three source-derived canyons · {result.voidFieldReport.floors.length} horizontal levels · source-derived height {result.voidFieldReport.extent[1].toFixed(1)} ft within the unchanged {displayField.height} ft field.</p>{result.voidFieldReport.roles.map(role=>{const v=result.voidFieldReport?.voids.find(v=>v.source===role.source);return <p key={role.source}>{role.source} · {role.role}{v?' · '+v.hierarchy+' void · '+v.removedVolume.toFixed(1)+' ft³ removed · '+v.closure.rule :role.role==='terrace'?' · source-shaped horizontal platform':result.voidFieldReport?.facadeMode==='face-normal'?' · source platform and source-normal exterior façade':' · source platform and vertical exterior boundary'}.</p>;})}<p>{result.voidFieldReport.limitations.join(' ')}</p></details>}
 {result?.voidFieldReport?.visibility&&<section><h2>Atrium visibility checks</h2><p>{result.voidFieldReport.visibility.floorViews.map(f=>f.portalCount).join(' / ')} floor-facing views across {result.voidFieldReport.floors.length} occupied levels · {result.voidFieldReport.visibility.crossLevel.reduce((n,p)=>n+p.views.length,0)} cross-level paths · {result.voidFieldReport.visibility.sky.length} open-to-sky paths. Rays are backed by actual floor material and checked against the exported solid. Daylight levels, guarding and circulation are not verified.</p></section>}
 {result?.voidFieldReport?.facadeMode==='face-normal'&&<details><summary>Face-Normal Façade test details</summary><p>Source caps and poses are preserved. Sweep direction follows each source-face normal. Horizontal support cuts and field-boundary cuts remain planar.</p>{result.voidFieldReport.walls?.map(w=><p key={w.source}>{w.source} · support {(w.supportZ??0).toFixed(2)} ft ({w.supportRule??'reported support'}) · {(w.maximumPlanShift??0).toFixed(2)} ft potential lateral travel · {(w.fieldTrimVolume??0).toFixed(2)} ft³ trimmed at field boundaries · {w.floorContacts?.filter(c=>c.volume>1e-6).length??0} positive floor contacts.</p>)}<p>Geometric contacts and mesh connectivity are tested; structural performance is not verified.</p></details>}
 <details><summary>Advanced result details</summary>{result?.articulationReport&&<section><h2>Envelope articulation</h2><p>Primary {result.articulationReport.before.toFixed(2)} ft³ · Final {result.volume.toFixed(2)} ft³ · Removed {result.articulationReport.removed.toFixed(2)} ft³ · Added {(result.articulationReport.added??0).toFixed(2)} ft³ · {result.articulationReport.components} connected component(s)</p><p>{result.articulationReport.operations.filter(o=>o.kind==='backed pocket').length} backed pockets · {result.articulationReport.operations.filter(o=>o.alcove).length} alcove candidates · {result.articulationReport.operations.filter(o=>(o.kind==='through opening'||o.kind==='directional through void'||o.kind==='vertical canyon void')).length} through openings · {result.articulationReport.overhangs} sheltered cuts · {result.articulationReport.addedProjections} outward additions</p>{result.articulationReport.operations.map(o=><p key={o.id}>{o.kind} · {o.sources.join(' / ')} · {o.feature} · {o.profile} · W × D × H {o.width.toFixed(1)} × {o.depth.toFixed(1)} × {o.height.toFixed(1)} ft · bay {o.bayDepth.toFixed(1)} ft{o.alcove?' · alcove candidate':''}</p>)}</section>}{result?.contributions&&<section><h2>Visible source contributions</h2>{result.contributions.map(c=><p key={c.letter}>{c.letter} · {c.component} · {(c.exposedArea??0).toFixed(1)} ft² exposed surface · {c.relationships.join(', ')}</p>)}</section>}{result?.features&&<details open><summary>Source derivation · plan</summary><svg viewBox={[-displayField.width/2,-displayField.depth/2,displayField.width,displayField.depth].join(" ")} style={{width:"100%",height:170}}><g transform="scale(1,-1)">{result.features.map(f=><polyline key={f.id} fill="none" stroke="#67bace" strokeWidth=".28" points={f.line.map(p=>p.slice(0,2).join(",")).join(" ")}/>)}{result.paths?.map((f,i)=><polyline key={i} fill="none" stroke="orange" strokeWidth=".4" points={f.line.map(p=>p.slice(0,2).join(",")).join(" ")}/>)}</g></svg>Blue: source edges. Orange: cross-letter trajectories.</details>}{result&&<><p style={{color:result.architecturalValidation?.passed?'#9bd4a5':'#edb780'}}>{result.architecturalValidation?(result.architecturalValidation.passed?'Architectural relationship checks passed.':'Architectural relationship checks FAILED — comparison only.'):'Functional architectural compliance has not been verified.'}</p><label>Inspect instance / component<select aria-label="Inspect object" className="block w-full" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All objects</option><optgroup label="Source instances">{result.letters.map(l=><option key={l.id}>{l.id}</option>)}</optgroup><optgroup label="Architectural components">{result.components.map(c=><option key={c.id}>{c.id}</option>)}</optgroup></select></label><label><input type="checkbox" checked={isolate} onChange={e=>setIsolate(e.target.checked)}/> Isolate selected object</label><p className="text-xs">{result.components.find(c=>c.id===selected)?.sources?.join(' · ')}</p><p>Independent geometry check: {result.validation.selfIntersectionPairs} crossings / overlaps across {result.validation.nonAdjacentTriangleChecks.toLocaleString()} pairs.</p>{result.warnings.map(w=><p className="text-xs mt-2" key={w}>{w}</p>)}<a className="underline" href={'/api/amphitheater?id='+result.id} target="_blank" rel="noreferrer">Full study snapshot and meshes (JSON)</a></>}
 </details></section>{result&&<AmphitheaterPresentation result={result} disabled={busy}/>}<section style={panel}><h2>Saved studies and alternatives</h2><p className="text-xs">Saved studies retain their source composition, typology, ruleset identifiers/versions, and generation settings. Compare is available for matching field dimensions and preferred letter size; no rescaling is applied.</p>{studies.map((s,i)=><div className="flex gap-2 items-center border-t py-2" key={s.id}><span>Study {studies.length-i} · {s.request.workspaceTypology?workspaceTypologyName(s.request.workspaceTypology)+' · ':''}{s.request.field.width}/{s.request.field.depth}/{s.request.field.height} · {s.request.preferredFeet}′ · {s.sourceCount} letters · {s.request.sourceName}</span><button className="border p-1" onClick={()=>void load(s.id)}>Open</button><button className="border p-1" disabled={!result||result.id===s.id||parameterKey(result.request)!==parameterKey(s.request)} onClick={()=>void load(s.id,true)}>Compare</button></div>)}</section>
 {comparison&&<section style={panel}><h2>Comparison study · matching field and size</h2><button className="border p-1" onClick={()=>setComparison(undefined)}>Close comparison</button><p>{comparison.request.sourceName} · {comparison.sourceCount} letters · {comparison.volume.toFixed(3)} ft³ · population {comparison.request.population}</p><Viewer showLettersOnTop={showLettersOnTop} result={comparison} field={comparison.request.field} mode={mode} view={view} cut={cut} selected="" onPick={()=>{}} isolate={false} reset={reset}/></section>}
 </section></div></main>;
}
