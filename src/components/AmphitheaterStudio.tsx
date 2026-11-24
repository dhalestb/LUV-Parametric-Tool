"use client";
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { BoardCanvas } from './BoardCanvas';
import { BoardOrthographicCamera } from './BoardOrthographicCamera';
import { AxisIndicator } from './AxisIndicator';
import {getLetterVolumeGeometry} from './letterGeometry3d';
import {populateInsertedPlate} from './insertedPlatePopulation';
import {populateVoidField,applyVoidFieldSpacing,addVoidFieldFourthLevel} from './voidFieldPopulation';
import {populate,suggestedCount} from './sourcePopulation';
import SourcePopulationEditor from './SourcePopulationEditor';
import AppNav from './AppNav';
import AmphitheaterPresentation from './AmphitheaterPresentation';
import { LETTER_SIZE_PRESETS } from './architecturalLetterSizing';
import { OPTIMIZER_SESSION_KEY } from './browserSession';
import { collectCompositionSources,mergeCompositionSources,compositionRefreshMessage,type ProofSource as Source } from './amphitheaterCompositionSources';
import { LOBBY_TYPOLOGIES, fitLobbyLettersToArchitecture, populateLobby, type LobbyLink, type LobbyTypologyId } from './lobbyProof';
import { savePresentationGraphic } from './presentationGraphics';
import TopographicLobbyBoard from './TopographicLobbyBoard';
import type { LobbyStudy } from './lobbyStudy';


import type { AmphitheaterRequest,AmphitheaterResult,AmphitheaterSummary,ProofMesh } from './amphitheaterInteractiveTypes';
function readCompositionSources(){
 return collectCompositionSources(JSON.parse(localStorage.getItem(OPTIMIZER_SESSION_KEY)??'null'),JSON.parse(localStorage.getItem('vul-optimizer-designs')??'[]'));
}
type View='isometric'|'plan'|'elevation'|'section';
type IsoDirection='NW'|'SW'|'SE'|'NE';
const ISO_DIRECTIONS=['NW','SW','SE','NE'] as const;
type Mode='A'|'B'|'C';
const panel={border:'1px solid var(--line)',borderRadius:10,padding:16,background:'var(--panel-background)'};
const color=(i:number)=>new THREE.Color().setHSL((i*.61803398875)%1,.58,.6);
const parameterKey=(r:AmphitheaterRequest)=>[r.field.width,r.field.depth,r.field.height,r.preferredFeet].join('/');
function lobbyCountMessage(count:number){return count?count+' saved lobby alternative'+(count===1?'':'s')+'.':'No saved lobby alternatives yet. Generate Design to store one.';}
function studyProof(request:AmphitheaterRequest):'gathering'|'lobby'{
 if(request.proof==='lobby'||request.proof==='gathering')return request.proof;
 return /lobby/i.test(request.typologyName??'')?'lobby':'gathering';
}
function Camera({field,view,reset,iso}:{field:AmphitheaterRequest['field'];view:View;reset:number;iso:IsoDirection}){
 const size=useThree(s=>s.size),span=Math.max(field.width,field.depth,field.height),target:[number,number,number]=[0,0,field.height/2];
 const frameSpan=view==='plan'?Math.max(field.width,field.depth):view==='section'?Math.max(field.depth,field.height):view==='elevation'?Math.max(field.width,field.height):Math.hypot(field.width,field.depth,field.height);
 const position:[number,number,number]=view==='plan'?[0,0,field.height/2+span*3]:view==='section'?[-span*3,0,field.height/2]:view==='elevation'?[0,-span*3,field.height/2]:[(iso.includes('E')?1:-1)*span*2,(iso.includes('N')?1:-1)*span*2,field.height/2+span*2];
 return <><BoardOrthographicCamera key={view+iso+reset+parameterKey({field,preferredFeet:0} as AmphitheaterRequest)} makeDefault position={position} up={view==='plan'?[0,1,0]:[0,0,1]} zoom={Math.min(size.width,size.height)*.82/frameSpan} near={.01} far={span*20}/><OrbitControls key={view+iso+reset+span} makeDefault target={target} enableRotate={view==='isometric'} enablePan enableZoom/></>;
}
const ISO_EXPORT_WIDTH=4096;
function IsoCapture({onReady}:{onReady:(capture:()=>Promise<Blob>)=>void}){
 const gl=useThree(state=>state.gl),scene=useThree(state=>state.scene),camera=useThree(state=>state.camera);
 useEffect(()=>{onReady(()=>new Promise((resolve,reject)=>{
  const previousSize=new THREE.Vector2(),previousRatio=gl.getPixelRatio();
  gl.getSize(previousSize);
  const hidden:THREE.Object3D[]=[];
  const restore=()=>{hidden.forEach(object=>{object.visible=true;});gl.setPixelRatio(previousRatio);gl.setSize(previousSize.x,previousSize.y,false);};
  try{
   scene.traverse(object=>{if(object.name==='field-outline'){object.visible=false;hidden.push(object);}});
   const ortho=camera as THREE.OrthographicCamera;
   const frame={left:ortho.left,right:ortho.right,top:ortho.top,bottom:ortho.bottom};
   const half=Math.min(ortho.right-ortho.left,ortho.top-ortho.bottom)/2;
   const centerX=(ortho.left+ortho.right)/2,centerY=(ortho.top+ortho.bottom)/2;
   ortho.left=centerX-half;ortho.right=centerX+half;ortho.top=centerY+half;ortho.bottom=centerY-half;ortho.updateProjectionMatrix();
   gl.setPixelRatio(1);gl.setSize(ISO_EXPORT_WIDTH,ISO_EXPORT_WIDTH,false);gl.render(scene,camera);
   const view=document.createElement('canvas');
   view.width=gl.domElement.width;view.height=gl.domElement.height;
   const viewCtx=view.getContext('2d');
   ortho.left=frame.left;ortho.right=frame.right;ortho.top=frame.top;ortho.bottom=frame.bottom;ortho.updateProjectionMatrix();
   if(!viewCtx||view.width<ISO_EXPORT_WIDTH){restore();reject(new Error('Could not export the isometric view at 4096 px.'));return;}
   viewCtx.drawImage(gl.domElement,0,0);restore();
   view.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not export the isometric view.')),'image/png');
  }catch(error){restore();reject(error instanceof Error?error:new Error('Could not export the isometric view.'));}
 }));},[camera,gl,onReady,scene]);
 return null;
}
async function labelIsoExport(blob:Blob,name:string){
 const bitmap=await createImageBitmap(blob);
 const width=ISO_EXPORT_WIDTH;
 const source=document.createElement('canvas');
 source.width=width;source.height=width;
 const sourceCtx=source.getContext('2d',{willReadFrequently:true});
 const canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=width;
 const ctx=canvas.getContext('2d');
 if(!sourceCtx||!ctx){bitmap.close();throw new Error('Could not label the isometric view.');}
 sourceCtx.fillStyle='#080b10';sourceCtx.fillRect(0,0,width,width);
 const fit=Math.min(width/bitmap.width,width/bitmap.height);
 sourceCtx.drawImage(bitmap,(width-bitmap.width*fit)/2,(width-bitmap.height*fit)/2,bitmap.width*fit,bitmap.height*fit);bitmap.close();
 const plateRatio=1.125;
 const fontSize=width*.045/plateRatio;
 const textX=width*(.04/plateRatio+(1-1/plateRatio)/2);
 const textY=width*.075/plateRatio;
 const clearance=Math.ceil(textY+fontSize*.45);
 const bottom=width-Math.round(width*.015);
 const pixels=sourceCtx.getImageData(0,0,width,width).data;
 let minX=width,minY=width,maxX=0,maxY=0,found=false;
 for(let y=0;y<width;y+=2)for(let x=0;x<width;x+=2){
  const i=(y*width+x)*4;
  if(pixels[i]+pixels[i+1]+pixels[i+2]>60){found=true;if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}
 }
 ctx.fillStyle='#080b10';ctx.fillRect(0,0,width,width);
 if(!found||(minY>=clearance&&maxY<=bottom))ctx.drawImage(source,0,0);
 else{
  const contentHeight=Math.max(1,maxY-minY+1);
  const shift=Math.max(0,clearance-minY);
  if(maxY+shift<=bottom)ctx.drawImage(source,0,shift);
  else{
   const scale=Math.min(1,(bottom-clearance)/contentHeight);
   ctx.drawImage(source,(width-width*scale)/2,clearance-minY*scale,width*scale,width*scale);
  }
 }
 ctx.font=fontSize+'px Arial, sans-serif';
 ctx.fillStyle='#D6AD4F';
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
 ctx.fillText(name.toUpperCase(),textX,textY);
 return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not label the isometric view.')),'image/png'));
}
function Surface({mesh,tint,opacity=1,planes,selected,onPick,wire=false,sharp=false}:{mesh:ProofMesh;tint:THREE.ColorRepresentation;opacity?:number;planes:THREE.Plane[];selected?:boolean;onPick?:()=>void;wire?:boolean;sharp?:boolean}){
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));g.setIndex(mesh.indices);if(sharp){const creased=toCreasedNormals(g,Math.PI/6);if(creased!==g)g.dispose();return creased;}g.computeVertexNormals();return g;},[mesh,sharp]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} onClick={e=>{if(onPick){e.stopPropagation();onPick();}}}><meshStandardMaterial color={selected?'#ffe374':tint} transparent={opacity<1} opacity={opacity} side={THREE.DoubleSide} clippingPlanes={planes} clipShadows wireframe={wire} polygonOffset={wire} polygonOffsetFactor={wire?-2:0}/></mesh>;
}
function VisibilityLines({result}:{result:AmphitheaterResult}){
 const visibility=result.voidFieldReport?.visibility;
 const geometry=useMemo(()=>{const lines=visibility?[...visibility.crossLevel.flatMap(p=>p.views),...visibility.sky]:[];return new THREE.BufferGeometry().setFromPoints(lines.flatMap(p=>[new THREE.Vector3(...p.start as [number,number,number]),new THREE.Vector3(...p.end as [number,number,number])]));},[visibility]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);return <lineSegments geometry={geometry}><lineBasicMaterial color="#71BEDA" depthTest={false}/></lineSegments>;
}
function FieldOutline({field}:{field:AmphitheaterRequest['field']}){
 const geometry=useMemo(()=>{const box=new THREE.BoxGeometry(field.width,field.depth,field.height),edges=new THREE.EdgesGeometry(box);box.dispose();return edges;},[field]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments name="field-outline" geometry={geometry} position={[0,0,field.height/2]}><lineBasicMaterial color="#7b9bb4" transparent opacity={.7}/></lineSegments>;
}
function LobbyConnections({links,lift}:{links:LobbyLink[];lift:number}){
 return <>{links.map((link,index)=>{
  const a=new THREE.Vector3(link.from[0],link.from[1],link.from[2]+lift),b=new THREE.Vector3(link.to[0],link.to[1],link.to[2]+lift);
  if(link.kind==='plate'){
   const dx=b.x-a.x,dy=b.y-a.y,length=Math.max(Math.hypot(dx,dy),.2),angle=Math.atan2(dy,dx);
   return <mesh key={index} position={[(a.x+b.x)/2,(a.y+b.y)/2,a.z]} rotation={[0,0,angle]}><boxGeometry args={[length,Math.max(length*.22,.4),.12]}/><meshStandardMaterial color="#c8b48a"/></mesh>;
  }
  const delta=b.clone().sub(a),length=Math.max(delta.length(),.05),mid=a.clone().add(b).multiplyScalar(.5);
  const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  return <mesh key={index} position={mid} quaternion={quaternion}><cylinderGeometry args={[link.kind==='bridge'?.28:.16,link.kind==='bridge'?.28:.16,length,16]}/><meshStandardMaterial color={link.kind==='bridge'?'#d7c4a3':'#8fb8c9'}/></mesh>;
 })}</>;
}
function Viewer({result,draft,field,mode,view,cut,selected,onPick,isolate,reset,iso,onCapture,sightlines=false,links=[],letters,architecture}:{result?:AmphitheaterResult;draft?:AmphitheaterRequest['source'];field:AmphitheaterRequest['field'];mode:Mode;view:View;cut:number;selected:string;onPick:(id:string)=>void;isolate:boolean;reset:number;iso:IsoDirection;onCapture?:(capture:()=>Promise<Blob>)=>void;sightlines?:boolean;links?:LobbyLink[];letters?:AmphitheaterResult['letters'];architecture?:AmphitheaterResult['architecture']}){
 const planes=useMemo(()=>view==='section'?[new THREE.Plane(new THREE.Vector3(1,0,0),-cut)]:[],[view,cut]);
 const picked=result?.components.find(c=>c.id===selected);
 const shownLetters=letters??result?.letters??[];
 const shell=architecture??result?.architecture;
 return <div style={{height:580,background:'#080b10',borderRadius:8}}><BoardCanvas dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true}} onCreated={({gl})=>{gl.localClippingEnabled=true;}}><color attach="background" args={['#080b10']}/><ambientLight intensity={1.1}/><directionalLight position={[50,-60,90]} intensity={2}/><directionalLight position={[-40,30,50]} intensity={1}/><Camera field={field} view={view} reset={reset} iso={iso}/>{onCapture&&<IsoCapture onReady={onCapture}/>}<FieldOutline field={field}/>{mode==='A'&&draft?.map((p,i)=><mesh dispose={null} key={i} geometry={getLetterVolumeGeometry(p.letter,12)} position={[p.x,p.y,p.z+field.height/2]} rotation={[p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ']} scale={[p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ]}><meshStandardMaterial color={color(i)} clippingPlanes={planes}/></mesh>)}{mode==='A'&&links.length>0&&<LobbyConnections links={links} lift={field.height/2}/>}{result&&<>
 {(mode==='B'||mode==='C')&&shell&&(isolate&&picked?<Surface sharp={['profiles','vertical-walls','void-field','inserted-plate'].includes(result.request.envelopeVersion??'')} mesh={picked.mesh} tint="#e2d5b9" planes={planes}/>:<Surface sharp={['profiles','vertical-walls','void-field','inserted-plate'].includes(result.request.envelopeVersion??'')} mesh={shell} tint="#e2d5b9" planes={planes}/>)}
 {((mode==='A'&&!draft)||mode==='B')&&shownLetters.filter(l=>!isolate||!selected||l.id===selected).map(l=><Surface key={l.id} mesh={l.mesh} tint={color(shownLetters.findIndex(item=>item.id===l.id))} opacity={mode==='B'?.7:1} planes={planes} selected={l.id===selected} onPick={()=>onPick(l.id)}/>)}
 {mode==='B'&&result.voidFieldReport?.voids.map(v=><Surface key={v.source} mesh={v.cutterMesh} tint="#71BEDA" opacity={.22} planes={planes}/>)}
 {!isolate&&picked&&mode!=='A'&&<Surface mesh={picked.mesh} tint="#ffe374" planes={planes} wire/>}
 {sightlines&&mode!=='A'&&result.voidFieldReport?.visibility&&<VisibilityLines result={result}/>}
 </>}<AxisIndicator/></BoardCanvas></div>;
}
function voidSettingsKey(value:AmphitheaterRequest['voidField']){return JSON.stringify(value,Object.keys(value??{}).sort());}
function LobbyStudyName({study,index,total,draft,busy,compareDisabled,onDraft,onSave,onOpen,onDelete,onCompare}:{study:LobbyStudy;index:number;total:number;draft:string;busy:boolean;compareDisabled:boolean;onDraft:(value:string)=>void;onSave:()=>void;onOpen:()=>void;onDelete:()=>void;onCompare:()=>void}){
 const nameChanged=draft.trim()!==study.name&&draft.trim().length>0;
 return <form className="space-y-2 border-t py-2" onSubmit={event=>{event.preventDefault();onSave();}}><div className="flex flex-wrap gap-2 items-center"><span>Study {total-index} · {study.field.width}/{study.field.depth}/{study.field.height} · {study.preferredFeet}′ · {study.sourceCount} letters</span><input aria-label={'Name for study '+(total-index)} name="name" value={draft} onChange={event=>onDraft(event.target.value)} className="min-w-40 border p-1" style={{background:'var(--input-background)'}}/></div><div className="flex flex-wrap gap-2"><button className="border p-1" type="submit" disabled={!nameChanged||busy}>Save</button><button className="border p-1" type="button" onClick={onOpen}>Open</button><button className="border p-1" type="button" onClick={onDelete}>Delete</button><button className="border p-1" type="button" disabled={compareDisabled||busy} onClick={onCompare}>Compare</button></div></form>;
}
export default function AmphitheaterStudio({heading = 'Interactive Gathering Proof', variant = 'gathering'}: {heading?: string; variant?: 'gathering' | 'lobby'} = {}){
 const [atriumBoundary,setAtriumBoundary]=useState<'open'|'enclosed'>('open'),[showSightlines,setShowSightlines]=useState(false);
 const [facadeMode,setFacadeMode]=useState<'vertical'|'face-normal'>('face-normal');
 const [floorSpacing,setFloorSpacing]=useState(12);
 const [levelCount,setLevelCount]=useState<3|4>(3);
 const [sourceTransitions,setSourceTransitions]=useState(false);
 const [lobbyId,setLobbyId]=useState<LobbyTypologyId>('vertical-void-lobby');
 const [letterOn,setLetterOn]=useState({L:true,U:true,V:true});
 const [lobbyLinks,setLobbyLinks]=useState<LobbyLink[]>([]);
 const [envelopeVersion,setEnvelopeVersion]=useState<'profiles'|'vertical-walls'|'void-field'|'inserted-plate'>('vertical-walls');
 const [voidTaper,setVoidTaper]=useState(.35),[voidMode,setVoidMode]=useState<'straight'|'neighbor-taper'>('neighbor-taper'),[voidConnectivity,setVoidConnectivity]=useState<'adjacent'|'none'>('adjacent');
 const [editing,setEditing]=useState(false),[seed,setSeed]=useState<number|undefined>();
 const [field,setField]=useState({width:40,depth:40,height:60}),[preferred,setPreferred]=useState(13),[population,setPopulation]=useState('auto');
 const [articulation,setArticulation]=useState(.75),[primary,setPrimary]=useState(false);
 const [elevationMode,setElevationMode]=useState<'feature'|undefined>('feature');
 const [organization,setOrganization]=useState<'proximity'|'alignment'>('proximity'),[generator,setGenerator]=useState<AmphitheaterRequest['generator']>('source-preserving'),[sources,setSources]=useState<Source[]>([]),[sourceId,setSourceId]=useState('fixture'),[sourceText,setSourceText]=useState('');
 const [studies,setStudies]=useState<AmphitheaterSummary[]>([]),[lobbyStudies,setLobbyStudies]=useState<LobbyStudy[]>([]),[result,setResult]=useState<AmphitheaterResult>(),[comparison,setComparison]=useState<AmphitheaterResult>();
 const [mode,setMode]=useState<Mode>('C'),[view,setView]=useState<View>('isometric'),[iso,setIso]=useState<IsoDirection>('SE'),[cut,setCut]=useState(0),[selected,setSelected]=useState(''),[isolate,setIsolate]=useState(false),[reset,setReset]=useState(0);
 const [exportingIso,setExportingIso]=useState(false);
 const captureIso=useRef<(()=>Promise<Blob>)|null>(null);
 const registerCapture=useCallback((capture:()=>Promise<Blob>)=>{captureIso.current=capture;},[]);
 async function exportIso(){
  const typology=LOBBY_TYPOLOGIES.find(item=>item.name===result?.request.typologyName)??LOBBY_TYPOLOGIES.find(item=>item.id===lobbyId);
  if(!typology)return;
  setExportingIso(true);setError('');
  try{
   if(view!=='isometric')setView('isometric');
   if(view!=='isometric')await new Promise(resolve=>setTimeout(resolve,500));
   const capture=captureIso.current;
   if(!capture)throw new Error('The isometric view is not ready.');
   const blob=await labelIsoExport(await capture(),typology.name);
   await savePresentationGraphic(typology.id,typology.name,blob,'lobby-isos');
   setMessage(typology.name+' '+iso+' isometric view sent to the top row of Lobby Proofs. Sending another replaces it.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setExportingIso(false);}
 }
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('Choose the field and letter quantity, then Generate Design.'),[error,setError]=useState('');
 const [sourceMessage,setSourceMessage]=useState('');
 const [nameDrafts,setNameDrafts]=useState<Record<string,string>>({});
 const source=sources.find(s=>s.id===sourceId);
 const displayStudy=useCallback((data:AmphitheaterResult)=>{
  setLevelCount(data.request.voidField?.levelCount??3);setFacadeMode(data.request.voidField?.facadeMode??'vertical');setAtriumBoundary(data.request.voidField?.atriumBoundary??'enclosed');setShowSightlines(false);setFloorSpacing((data.request.sourceSnapshot as {floorSpacing?:number}|undefined)?.floorSpacing??12);setEnvelopeVersion(data.request.envelopeVersion==='inserted-plate'?'inserted-plate':data.request.envelopeVersion==='void-field'?'void-field':data.request.envelopeVersion==='vertical-walls'?'vertical-walls':'profiles');setVoidTaper(data.request.voidField?.taper??.35);setVoidMode(data.request.voidField?.profileMode??'neighbor-taper');setVoidConnectivity(data.request.voidField?.connectivity??'adjacent');setResult(data);setField(data.request.field);setPreferred(data.request.preferredFeet);setPopulation(String(data.request.population));setEditing(false);setGenerator(data.generator);setElevationMode(data.request.articulationElevation);setArticulation(data.request.articulation??0);setPrimary(false);setOrganization(data.request.organization??'proximity');setSelected('');setComparison(undefined);
  setSources(items=>[...items.filter(s=>s.id!==data.request.sourceId),{id:data.request.sourceId,name:data.request.sourceName,source:data.request.source,snapshot:data.request.sourceSnapshot}]);setSourceId(data.request.sourceId);
  const url=new URL(window.location.href);url.searchParams.set('study',data.id);window.history.replaceState(window.history.state,'',url);
 },[]);
 const refreshSources=useCallback(()=>{
  try{const imported=readCompositionSources();setSources(current=>mergeCompositionSources(current,imported,sourceId));setSourceMessage(compositionRefreshMessage(imported.length));setError('');}
  catch{setSourceMessage('Composition storage could not be read. Your selected source has been retained. Open Composition or use source JSON.');}
 },[sourceId]);
 function showLobbyStudy(study:LobbyStudy){
  setLobbyId(study.typologyId);setField(study.field);setPreferred(study.preferredFeet);setPopulation(String(study.population));setLobbyLinks(study.links);setResult(undefined);setComparison(undefined);
  setSources(items=>[{id:study.id,name:study.name,source:study.source},...items.filter(item=>item.id!==study.id)]);setSourceId(study.id);setMode('A');
  const url=new URL(window.location.href);url.searchParams.set('study',study.id);window.history.replaceState(window.history.state,'',url);
  if(study.architectureStudyId)fetch('/api/amphitheater?id='+encodeURIComponent(study.architectureStudyId)).then(async r=>{const data:AmphitheaterResult&{error?:string}=await r.json();if(!r.ok)throw Error(data.error);return data;}).then(data=>{setResult(data);setMode('B');}).catch(()=>{});
 }
 useEffect(()=>{
  let active=true;
  if(variant==='lobby'){
   fetch('/api/lobby').then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error??'Lobby study storage unavailable');return data;}).then((data:{studies:LobbyStudy[]})=>{
    if(!active)return;
    setLobbyStudies(data.studies);setSources(data.studies.map(study=>({id:study.id,name:study.name,source:study.source})));setSourceId(current=>data.studies.some(study=>study.id===current)?current:'');setSourceMessage(lobbyCountMessage(data.studies.length));
    const id=new URL(window.location.href).searchParams.get('study');
    const saved=data.studies.find(study=>study.id===id);
    if(saved)showLobbyStudy(saved);
   }).catch(e=>setError(String(e)));
   return()=>{active=false;};
  }
  fetch('/api/amphitheater').then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error??'Study storage unavailable');return data;}).then(data=>{
   if(!active)return;
   setSources([{id:'fixture',name:'Recorded L/U/V proof fixture',source:data.fixture}]);setStudies(data.studies.filter((study:AmphitheaterSummary)=>studyProof(study.request)==='gathering'));
   try{const imported=readCompositionSources();setSources(current=>mergeCompositionSources(current,imported,'fixture'));setSourceMessage(compositionRefreshMessage(imported.length));}catch{setSourceMessage('Composition storage could not be read. Recorded and saved-study sources remain available.');}
   const query=new URL(window.location.href).searchParams; if(query.get('view')==='A')setMode('A');const id=query.get('study');
   if(id)fetch('/api/amphitheater?id='+encodeURIComponent(id)).then(r=>r.json()).then(saved=>{if(active&&saved.id&&studyProof(saved.request)==='gathering')displayStudy(saved);});
  }).catch(e=>setError(String(e)));
  return()=>{active=false;};
 },[displayStudy,variant]);
 const currentRequest=useMemo(()=>{
  if(!source)return null;
  if(variant==='lobby'){
   const typology=LOBBY_TYPOLOGIES.find(item=>item.id===lobbyId);
   return {proof:'lobby' as const,typologyName:typology?.name,generator:'source-preserving' as const,organization,articulationElevation:'feature' as const,articulation,field,preferredFeet:preferred,population:population==='auto'?'auto' as const:Number(population),sourceId:source.id,sourceName:source.name,source:source.source};
  }
  return {proof:variant,typologyName:envelopeVersion==='inserted-plate'?'Inserted Horizontal Plate':envelopeVersion==='void-field'?'Void Field Gathering':'Stepped Amphitheater',voidField:envelopeVersion==='void-field'?{...(levelCount===4?{levelCount}:{}),facadeMode,atriumBoundary,taper:voidTaper,profileMode:voidMode,connectivity:voidConnectivity}:undefined,generator,envelopeVersion,articulationElevation:elevationMode,articulation,organization,field,preferredFeet:preferred,population:population==='auto'?'auto' as const:Number(population),sourceId:source.id,sourceName:source.name,source:source.source,sourceSnapshot:source.snapshot};
 },[source,field,preferred,population,generator,organization,articulation,elevationMode,envelopeVersion,voidTaper,voidMode,voidConnectivity,atriumBoundary,facadeMode,levelCount,variant,lobbyId]);
 const stale=Boolean(result && currentRequest && (
  voidSettingsKey(result.request.voidField)!==voidSettingsKey(currentRequest.voidField) || result.generator!==currentRequest.generator || result.request.envelopeVersion!==currentRequest.envelopeVersion ||
  parameterKey(result.request)!==parameterKey(currentRequest) || result.request.population!==currentRequest.population ||
  (result.request.organization??'proximity')!==currentRequest.organization ||
  (result.request.articulation??0)!==currentRequest.articulation ||
  result.request.sourceId!==currentRequest.sourceId || JSON.stringify(result.request.source)!==JSON.stringify(currentRequest.source)
 ));
 async function generate(request:AmphitheaterRequest|null=currentRequest,candidate=1){if(!request)return;setBusy(true);setError('');setMessage(candidate===1?'Generating architecture and checking the exported mesh…':'Checking new composition candidate '+candidate+' with the selected dimensions and letter quantity…');
  try{const response=await fetch('/api/amphitheater',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});const payload=await response.json();if(!response.ok){if(payload.geometryRejected){setError(payload.error);setMessage('Geometry rejected. Previous study retained.');return 'geometry-rejected';}throw Error(payload.error??'Generation failed');}setMessage('Loading validated, saved architecture…');const data:AmphitheaterResult=payload.architecture?payload:await fetch('/api/amphitheater?id='+payload.id).then(async r=>{if(!r.ok)throw Error('Saved result could not be loaded. Retry opening study '+payload.id);return r.json();});if(variant==='lobby'){setResult(data);setSelected('');setComparison(undefined);setMode('B');setMessage('Architecture generated from the letter outlines. Mesh checks passed.');return data;}displayStudy(data);setStudies(s=>[{id:data.id,created:data.created,request:data.request,sourceCount:data.sourceCount,volume:data.volume},...s]);setSelected('');setComparison(undefined);setMessage('New study generated. Mesh checks passed.'+(candidate>1?' Accepted composition candidate '+candidate+'.':''));return 'accepted';}
  catch(e){setError(e instanceof Error?e.message:String(e));setMessage('Generation rejected. Previous study retained.');}finally{setBusy(false);}
 }
 async function newDesign(){
  if(variant==='lobby'){
   setError('');setBusy(true);
   try{
    const count=population==='auto'?6:Number(population);
    const active=(['L','U','V'] as const).filter(letter=>letterOn[letter]);
    const placed=populateLobby(lobbyId,preferred,count,field,organization,active);
    const typology=LOBBY_TYPOLOGIES.find(item=>item.id===lobbyId)!;
    const name=typology.name+' · '+placed.source.length+' letters';
    const sourceId=crypto.randomUUID();
    const architecture=await generate({proof:'lobby',typologyName:typology.name,generator:'source-preserving',organization,articulationElevation:'feature',articulation,field,preferredFeet:preferred,population:count,sourceId,sourceName:name,source:placed.source});
    if(!architecture||typeof architecture!=='object'||!('id' in architecture))return;
    const response=await fetch('/api/lobby',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({typologyId:lobbyId,name,field,preferredFeet:preferred,population:count,source:placed.source,links:placed.links,architectureStudyId:architecture.id})});
    const saved:LobbyStudy&{error?:string}=await response.json();
    if(!response.ok)throw Error(saved.error??'Could not save the lobby study.');
    setLobbyStudies(items=>[saved,...items.filter(item=>item.id!==saved.id)]);
    showLobbyStudy(saved);
    if(architecture&&typeof architecture==='object'&&'architecture' in architecture){setResult(architecture);setMode('B');}
    setSourceMessage('Saved in the lobby repository.');
    setMessage(architecture&&typeof architecture==='object'&&'id' in architecture?typology.name+' saved. Architecture follows the letter outlines.':typology.name+' saved in the lobby repository.');
   }catch(e){setError(e instanceof Error?e.message:String(e));setMessage('Adjust the selected settings and try again.');}
   finally{setBusy(false);}
   return;
  }
  setError('');setMessage('Creating source composition…');
  try{
   const attempts=seed===undefined?(envelopeVersion==='vertical-walls'?5:envelopeVersion==='void-field'?8:1):1;
   for(let candidate=1;candidate<=attempts;candidate++){
   const arrangementSeed=seed??crypto.getRandomValues(new Uint32Array(1))[0];
   const count=population==='auto'?(envelopeVersion==='void-field'&&levelCount===4?15:['void-field','inserted-plate'].includes(envelopeVersion)?9:suggestedCount(field,preferred)):Number(population);
   if(!Number.isSafeInteger(count)||count<2)throw Error('Enter Automatic or a whole letter quantity of at least 2.');
   if(envelopeVersion==='inserted-plate'&&count!==9)throw Error('This typology pilot requires nine letters. Enter 9 or Automatic.');
   if(envelopeVersion==='void-field'&&levelCount===4&&count!==15)throw Error('Four-level Void Field requires 15 letters.');
   if(envelopeVersion==='void-field'&&(count<9||count>15))throw Error('Void Field accepts 9–15 letters, or Automatic (9).');
   const placements=envelopeVersion==='inserted-plate'?populateInsertedPlate(field,preferred,arrangementSeed,floorSpacing):envelopeVersion==='void-field'?populateVoidField(field,preferred,arrangementSeed,floorSpacing,count,levelCount):populate([],count,field,preferred,arrangementSeed,{transitions:sourceTransitions,envelopeRoles:envelopeVersion==='vertical-walls',threeLifts:envelopeVersion==='vertical-walls'});
   const id=crypto.randomUUID(),name='Design · '+placements.length+' letters · seed '+arrangementSeed;
   const request:AmphitheaterRequest={proof:variant,typologyName:envelopeVersion==='inserted-plate'?'Inserted Horizontal Plate':envelopeVersion==='void-field'?'Void Field Gathering':'Stepped Amphitheater',voidField:envelopeVersion==='void-field'?{...(levelCount===4?{levelCount}:{}),facadeMode,atriumBoundary,taper:voidTaper,profileMode:voidMode,connectivity:voidConnectivity}:undefined,generator:'source-preserving',envelopeVersion,articulationElevation:'feature',articulation,organization,field,preferredFeet:preferred,population:population==='auto'?'auto':count,sourceId:id,sourceName:name,source:placements,sourceSnapshot:{arrangementSeed,sourceTransitions,...(envelopeVersion==='void-field'?{levelCount}:{}),floorSpacing:['void-field','inserted-plate'].includes(envelopeVersion)?floorSpacing:undefined,orientationVersion:envelopeVersion==='vertical-walls'?6:3}};
   const status=await generate(request,candidate);
   if(status!=='geometry-rejected'){if(status==='accepted')setMode('C');return;}
   }
  }catch(e){setError(e instanceof Error?e.message:String(e));setMessage('Adjust the selected settings and try again.');}
 }
 async function addFourthLevel(){if(!currentRequest)return;try{const placements=addVoidFieldFourthLevel(currentRequest.source,field,15);await generate({...currentRequest,population:15,source:placements,voidField:{...currentRequest.voidField,levelCount:4,atriumBoundary:'open'},sourceId:crypto.randomUUID(),sourceName:'Four levels · original 12 retained + 3 upper sources',sourceSnapshot:{...((currentRequest.sourceSnapshot??{}) as Record<string,unknown>),levelCount:4,floorSpacing:15,originalStudy:result?.id}});setMode('C');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function adjustSpacing(){if(!currentRequest)return;try{const placements=applyVoidFieldSpacing(currentRequest.source,field,floorSpacing);await generate({...currentRequest,source:placements,sourceId:crypto.randomUUID(),sourceName:floorSpacing+' ft floor spacing · '+currentRequest.sourceName,sourceSnapshot:{floorSpacing,previousSourceId:currentRequest.sourceId}});setMode('C');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function load(id:string,compare=false){setError('');try{if(variant==='lobby'){const response=await fetch('/api/lobby?id='+encodeURIComponent(id));const data:LobbyStudy&{error?:string}=await response.json();if(!response.ok)throw Error(data.error);showLobbyStudy(data);return;}const response=await fetch('/api/amphitheater?id='+encodeURIComponent(id));const data:AmphitheaterResult&{error?:string}=await response.json();if(!response.ok)throw Error(data.error);if(compare)setComparison(data);else{displayStudy(data);}}catch(e){setError(String(e));}}
 async function compareLobby(study:LobbyStudy){if(!result||!study.architectureStudyId)return;setError('');try{const response=await fetch('/api/amphitheater?id='+encodeURIComponent(study.architectureStudyId));const data:AmphitheaterResult&{error?:string}=await response.json();if(!response.ok)throw Error(data.error);setComparison(data);}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function renameLobby(id:string,name:string){const trimmed=name.trim();if(!trimmed){setError('Enter a study name.');return;}setError('');try{const response=await fetch('/api/lobby',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:trimmed})});const data:LobbyStudy&{error?:string}=await response.json();if(!response.ok)throw Error(data.error);setLobbyStudies(items=>items.map(item=>item.id===id?data:item));setSources(items=>items.map(item=>item.id===id?{...item,name:data.name}:item));setSourceMessage('Saved in the lobby repository.');setNameDrafts(drafts=>{const next={...drafts};delete next[id];return next;});setMessage('Study name saved.');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function deleteLobby(id:string){if(!window.confirm('Delete this lobby study?'))return;setError('');try{const response=await fetch('/api/lobby?id='+encodeURIComponent(id),{method:'DELETE'});const data:{error?:string}=await response.json();if(!response.ok)throw Error(data.error);const remaining=lobbyStudies.filter(item=>item.id!==id);setLobbyStudies(remaining);setSources(items=>items.filter(item=>item.id!==id));setSourceMessage(lobbyCountMessage(remaining.length));if(sourceId===id){setSourceId('');setLobbyLinks([]);setResult(undefined);const url=new URL(window.location.href);url.searchParams.delete('study');window.history.replaceState(window.history.state,'',url);}if(comparison?.id===lobbyStudies.find(item=>item.id===id)?.architectureStudyId)setComparison(undefined);setMessage('Study deleted.');}catch(e){setError(e instanceof Error?e.message:String(e));}}
 function updateDraft(placements:AmphitheaterRequest['source'],name:string){setSources(items=>[...items.filter(s=>s.id!=='custom'),{id:'custom',name,source:placements}]);setSourceId('custom');setElevationMode('feature');setMode('A');}
 function applySource(){try{const parsed=JSON.parse(sourceText);if(!Array.isArray(parsed)||!parsed.length)throw Error('Paste an array of source placements.');const item={id:'custom',name:'Edited source composition',source:parsed};setSources(s=>[...s.filter(t=>t.id!=='custom'),item]);setSourceId('custom');setError('');}catch(e){setError(String(e));}}
 const displayField=result?.request.field??field;
 const fitted=useMemo(()=>{if(variant!=='lobby'||!result||!/compressed/i.test(result.request.typologyName??''))return undefined;const architecture=primary&&result.primary?result.primary:result.architecture;return fitLobbyLettersToArchitecture(result.letters,architecture);},[variant,result,primary]);
 const lobbyBoard=useMemo(()=>{if(variant!=='lobby'||!(preferred>0))return null;const typology=LOBBY_TYPOLOGIES.find(item=>item.id===lobbyId);if(!typology)return null;const saved=lobbyStudies.find(study=>study.id===sourceId);try{const letters=populateLobby(lobbyId,preferred,6,field,'proximity',(['L','U','V'] as const).filter(letter=>letterOn[letter])).source;const form=saved?.typologyId===lobbyId&&result?.architecture.positions.length?result.architecture:undefined;return {title:typology.name,letters,form};}catch{return null;}},[variant,lobbyId,lobbyStudies,sourceId,preferred,field,result,letterOn]);
 const lobbyComparable=(study:LobbyStudy)=>Boolean(result&&study.architectureStudyId&&study.id!==sourceId&&parameterKey({field:study.field,preferredFeet:study.preferredFeet} as AmphitheaterRequest)===parameterKey(result.request));
 const comparisonPanel=comparison?<section style={panel}><h2>Comparison study · matching field and size</h2><div className="flex flex-wrap gap-2">{ISO_DIRECTIONS.map(direction=><button key={direction} className="border p-1" aria-label={`Comparison isometric ${direction}`} aria-pressed={iso===direction&&view==='isometric'} onClick={()=>{setIso(direction);setView('isometric');setReset(count=>count+1);}}>{direction}</button>)}</div><button className="border p-1" onClick={()=>setComparison(undefined)}>Close comparison</button><p>{comparison.request.sourceName} · {comparison.sourceCount} letters · {comparison.volume.toFixed(3)} ft³ · population {comparison.request.population}</p><Viewer result={comparison} field={comparison.request.field} mode={mode} view={view} iso={iso} cut={cut} selected="" onPick={()=>{}} isolate={false} reset={reset}/></section>:null;
 const visibleStudies=studies.filter(s=>studyProof(s.request)==='gathering');
 return <main className="p-4 space-y-4" style={{color:'var(--ink)'}}><AppNav/><header><h1 className="text-2xl font-semibold">{heading}</h1><p>Existing LUV application · Z-up geometry in feet · isolated comparison workspace</p></header>
 <style jsx>{`.proof-layout {display:grid;grid-template-columns:minmax(270px,340px) minmax(0,1fr);gap:20px} @media(max-width:900px){.proof-layout{grid-template-columns:1fr}}`}</style><div className="proof-layout">
 <aside className="space-y-4"><section style={panel} className="space-y-3"><h2>Generation controls</h2>
 {variant==='lobby'?<label className="block">Typology<select aria-label="Typology" className="block w-full" value={lobbyId} disabled={busy} onChange={e=>{const id=e.target.value as LobbyTypologyId;setLobbyId(id);if(id==='topographic-ground-field-lobby')setField({width:40,depth:40,height:40});else if(id!=='vertical-void-lobby')setField({width:40,depth:20,height:20});}}>{LOBBY_TYPOLOGIES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>:<label className="block">Typology<select aria-label="Typology" className="block w-full" value={envelopeVersion==='inserted-plate'?'inserted-plate':envelopeVersion==='void-field'?'void-field':'stepped'} disabled={busy} onChange={e=>{setEnvelopeVersion(e.target.value==='inserted-plate'?'inserted-plate':e.target.value==='void-field'?'void-field':'vertical-walls');}}><option value="stepped">Stepped Amphitheater</option><option value="inserted-plate">Inserted Horizontal Plate · nine-letter pilot</option><option value="void-field">Void Field Gathering · 9–15 letters</option></select></label>}
 {variant==='lobby'&&<div><p className="text-xs font-semibold">{LOBBY_TYPOLOGIES.find(item=>item.id===lobbyId)?.name}</p><ul className="list-disc space-y-1 pl-4 text-xs">{LOBBY_TYPOLOGIES.find(item=>item.id===lobbyId)?.rules.map(rule=><li key={rule}>{rule}</li>)}</ul></div>}
 {variant==='lobby'&&<fieldset className="flex flex-wrap gap-3"><legend className="text-xs">Letters</legend>{(['L','U','V'] as const).map(letter=><label key={letter} className="text-xs"><input type="checkbox" checked={letterOn[letter]} disabled={busy} onChange={event=>{const next={...letterOn,[letter]:event.target.checked};if(!next.L&&!next.U&&!next.V){setError('Leave at least one of L, U, or V on.');return;}setError('');setLetterOn(next);}}/> {letter}</label>)}</fieldset>}
 {(['width','depth','height'] as const).map((axis,i)=><label className="block" key={axis}>{['Width X','Depth Y','Height Z'][i]} (ft)<select aria-label={axis} className="block w-full" value={field[axis]} disabled={busy} onChange={e=>setField(f=>({...f,[axis]:+e.target.value}))}>{[20,40,60].map(n=><option key={n}>{n}</option>)}</select></label>)}
 <label className="block">Preferred letter size (ft)<input aria-label="Preferred letter size" className="block w-full" type="number" min="0.1" step="0.1" value={preferred} disabled={busy} onChange={e=>setPreferred(+e.target.value)}/></label>
 <div className="flex gap-2">{([20,40,60] as const).map(h=><button key={h} disabled={busy} onClick={()=>setPreferred(LETTER_SIZE_PRESETS[h].preferredFeet)} className="border p-1">{LETTER_SIZE_PRESETS[h].preferredFeet}′ preset</button>)}</div><p className="text-xs">Letter presets and field dimensions are independent.</p>
 <label className="block">Letter quantity<input aria-label="Letter quantity" className="block w-full" value={population==='auto'?'Automatic':population} disabled={busy} onChange={e=>setPopulation(/^auto(matic)?$/i.test(e.target.value)?'auto':e.target.value)} placeholder="Automatic or a whole number"/></label>
 {envelopeVersion==='void-field'&&<div><label className="block">Occupied levels<select className="block w-full" aria-label="Occupied levels" value={levelCount} disabled={busy} onChange={e=>setLevelCount(+e.target.value as 3|4)}><option value={3}>3 levels</option><option value={4}>4 levels · 15 letters required</option></select></label><label className="block">Atrium boundary<select className="block w-full" aria-label="Atrium boundary" value={atriumBoundary} disabled={busy} onChange={e=>setAtriumBoundary(e.target.value as typeof atriumBoundary)}><option value="open">Open toward floors · validate sightlines</option><option value="enclosed">Enclosed lightwell · comparison baseline</option></select></label><label className="block">Exterior façade sweep<select className="block w-full" aria-label="Facade sweep" value={facadeMode} disabled={busy} onChange={e=>setFacadeMode(e.target.value as typeof facadeMode)}><option value="vertical">Global Z · vertical comparison</option><option value="face-normal">Face-Normal Façade · source-perpendicular sweep</option></select></label><p>Face-Normal sweeps follow the saved source-face normal. For four levels, automatic upper façade supports stop at the preceding floor; explicit support Z overrides remain available.</p><p>Level settings apply to new compositions. Regeneration retains existing source poses. Enclosed mode is a lightwell comparison and does not validate floor-facing atrium views.</p>{source?.source.length===12&&<button disabled={busy} className="border p-2" onClick={()=>void addFourthLevel()}>Add fourth level at 15 ft · retain existing 12 letters</button>}</div>}
 {envelopeVersion==='void-field'&&<p className="text-xs">9–15 letters; Automatic uses {levelCount===4?15:9}. Generate Design / New Design uses this quantity. Regenerate Architecture keeps the existing source letters. New Design checks up to eight compositions when no seed is specified; rejected candidates do not change the selected dimensions or size.</p>}
 {['void-field','inserted-plate'].includes(envelopeVersion)&&<div><label>Floor-to-floor spacing<select aria-label="Floor-to-floor spacing" className="block w-full" value={floorSpacing} disabled={busy} onChange={e=>setFloorSpacing(+e.target.value)}>{[12,13,14,15].map(n=><option key={n} value={n}>{n} ft</option>)}</select></label><p className="text-xs">Used by Generate Design and New Design. Adjust current levels moves only source elevations and saves a separate result. Regenerate Architecture retains current poses.</p>{result&&<button disabled={busy} className="border p-2" onClick={()=>void adjustSpacing()}>Adjust current levels to {floorSpacing} ft</button>}</div>}
 <button className="border rounded p-3 w-full" disabled={busy} onClick={newDesign}>{busy?'Generating and validating…':'Generate Design'}</button>
 {result&&<div className="flex flex-wrap gap-2"><button disabled={busy} onClick={newDesign}>New Design</button><button disabled={busy} onClick={()=>{setEditing(true);setMode('A');}}>Edit Letters</button><button disabled={busy||!source} onClick={()=>void generate()}>Regenerate Architecture</button></div>}
 <p role="status">{message}</p>{error&&<p role="alert" style={{color:'#ed8989',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{error}</p>}
 {editing&&generator==='source-preserving'&&<fieldset disabled={busy}><SourcePopulationEditor voidField={envelopeVersion==='void-field'} envelopeRoles={envelopeVersion==='vertical-walls'} showPopulation={false} source={source?.source??[]} field={field} preferred={preferred} onApply={updateDraft} onRestore={s=>{setField(s.field);setPreferred(s.preferred);updateDraft(s.source,s.name);}}/></fieldset>}
 <details><summary>Advanced Settings</summary>{variant!=='lobby'&&<><label>Envelope operation<select aria-label="Envelope operation" value={envelopeVersion} disabled={busy} onChange={e=>setEnvelopeVersion(e.target.value as typeof envelopeVersion)}><option value="inserted-plate">Inserted Plate · horizontal floors and letter-derived boundaries</option><option value="void-field">Void Field · plan concavities developed along Z</option><option value="profiles">Preserved profile envelope</option><option value="vertical-walls">Vertical walls, through openings and recessed alcoves</option></select></label><p className="text-xs">The experimental operation validates explicit source roles and may reject disconnected cuts or export degeneracies. It never falls back silently. Use the supplied wall studies for geometric evaluation.</p></>}
 {envelopeVersion==='void-field'&&<fieldset className="space-y-2"><legend>Void Field · 9–15 letters</legend><p>Horizontal interior letters use Z rotations 75° / 90° / 105°. Regeneration retains original poses. {facadeMode==='face-normal'?'Exterior façades follow source-face normals and are geometrically trimmed to the field.':'Exterior walls remain vertical.'}</p><label>Profile development<select aria-label="Void profile development" value={voidMode} onChange={e=>setVoidMode(e.target.value as typeof voidMode)}><option value="straight">Straight source profiles</option><option value="neighbor-taper">Neighbor-derived taper</option></select></label><label>Taper strength<input aria-label="Void taper strength" type="number" min="0" max="1" step=".05" value={voidTaper} onChange={e=>setVoidTaper(+e.target.value)}/></label><label>Void connections<select value={voidConnectivity} onChange={e=>setVoidConnectivity(e.target.value as typeof voidConnectivity)}><option value="adjacent">Adjacent voids between floors</option><option value="none">Separate voids</option></select></label><p>Void extent and floor levels follow source elevations. Roles are editable in Edit Letters. Profile shifts/splits and circulation verification are deferred.</p></fieldset>}
 <label className="block"><input type="checkbox" checked={sourceTransitions} onChange={e=>setSourceTransitions(e.target.checked)}/> Allow ±30° source transitions (Stepped Amphitheater)</label>{!['void-field','inserted-plate'].includes(envelopeVersion)&&<p className="text-xs">Experimental perimeter walls use global Z and support Z defaults to the field floor. New designs use lower, middle and top lifts. Upright interior letters belong to the middle lift and make X/Y through openings; edit roles and support Z in Edit Letters. New lower and upper terrace letters incline up to 12 degrees. Interior letters define through openings or backed alcoves. Edit Letters controls the opening and recess depth. Edit Letters permits intentional upright boundaries. Regeneration preserves all edited poses.</p>}<label>Arrangement seed<input aria-label="Arrangement seed" type="number" value={seed??''} placeholder="New seed each design" onChange={e=>setSeed(e.target.value===''?undefined:+e.target.value)}/></label>
  {generator==='source-preserving'&&envelopeVersion==='profiles'&&<label className="block">Envelope articulation · {Math.round(articulation*100)}%<input type="range" min="0" max="1" step=".05" value={articulation} disabled={busy} onChange={e=>setArticulation(+e.target.value)}/></label>}{generator==='source-preserving'&&<label>Relationship priority<select value={organization} onChange={e=>setOrganization(e.target.value as typeof organization)}><option value="proximity">Proximity</option><option value="alignment">Proximity and tangent alignment</option></select></label>}<label className="block">Generator<select aria-label="Generator" className="block w-full" value={generator} disabled={busy} onChange={e=>setGenerator(e.target.value as AmphitheaterRequest['generator'])}><option value="source-preserving">Source-preserving — original relationships</option><option value="typology-baseline">Typology-driven comparison baseline</option></select></label>
 <label className="block">{variant==='lobby'?'Lobby alternatives':'Source composition'}<select aria-label={variant==='lobby'?'Lobby alternatives':'Source composition'} className="block w-full" value={sourceId} disabled={busy} onChange={e=>variant==='lobby'?void load(e.target.value):setSourceId(e.target.value)}>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{variant==='lobby'?<p role="status" className="text-xs">{sourceMessage}</p>:<><button className="border p-1" disabled={busy} onClick={refreshSources}>Refresh Composition source list</button><p role="status" className="text-xs">{sourceMessage}</p><a className="underline text-sm" href="/composition" target="_blank" rel="noreferrer">Open Composition to create a study</a><p className="text-xs">Reads current and saved alternatives from Composition on this app origin. Selected windows are localized by translation only before submission. The baseline then rearranges them.</p></>}

 <button disabled={busy||!source} onClick={()=>void generate()}>Generate from selected source</button><details style={panel}><summary>Inspect / edit input composition</summary><p className="text-xs">Edit x/y/z in feet, rx/ry/rz in degrees and scale per instance. Apply before generating.</p><button className="border p-1" onClick={()=>setSourceText(JSON.stringify(source?.source??[],null,2))}>Copy selected source into editor</button><textarea aria-label="Source JSON" style={{width:'100%',height:220,fontSize:11}} value={sourceText} onChange={e=>setSourceText(e.target.value)}/><button disabled={busy} className="border p-1" onClick={applySource}>Use edited source</button></details></details></section>
 </aside><section className="space-y-3" style={{minWidth:0}}><section style={panel}><div className="flex flex-wrap gap-2">{(['A','B','C'] as const).map(m=><button aria-pressed={mode===m} className="border rounded p-2" key={m} onClick={()=>setMode(m)}>{m} — {m==='A'?'Original Letters':m==='B'?'Letters + Architecture':'Architecture Only'}</button>)}</div><p className="text-xs my-2">{result?.generator==='typology-baseline'?'Baseline: rearranged source population.':'Original poses; all geometry uses the same field-center to floor translation.'}</p><div className="flex flex-wrap gap-2">{(['isometric','plan','elevation','section'] as const).map(v=><button className="border p-2" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}<button className="border p-2" onClick={()=>setReset(r=>r+1)}>Reset camera</button>{variant==='lobby'&&ISO_DIRECTIONS.map(direction=><button key={direction} className="border p-2" aria-label={`Isometric ${direction}`} aria-pressed={iso===direction&&view==='isometric'} onClick={()=>{setIso(direction);setView('isometric');setReset(count=>count+1);}}>{direction}</button>)}{variant==='lobby'&&<button className="border p-2" disabled={busy||exportingIso} onClick={()=>void exportIso()}>{exportingIso?'Exporting ISO…':'Export ISO to Board'}</button>}</div>{view==='section'&&<label>Section X = {cut.toFixed(1)} ft<input aria-label="Section position" type="range" min={-displayField.width/2} max={displayField.width/2} step="0.1" value={cut} onChange={e=>setCut(+e.target.value)}/></label>}
 <p className="text-xs my-2">Orbit: left drag in isometric. Pan: right drag. Zoom: wheel. Section clips at X; A/B/C share exact coordinates and field framing.</p>
 {stale&&<p style={{color:'#e4c67f'}}>Controls differ from the displayed study. Generate to evaluate the new settings.</p>}
 {result?.voidFieldReport?.visibility&&<label className="block"><input type="checkbox" checked={showSightlines} onChange={e=>setShowSightlines(e.target.checked)}/> Show validated cross-level sightlines</label>}
 {result?.primary&&<button className="border p-2" onClick={()=>setPrimary(!primary)}>{primary?'Viewing primary envelope · show articulated':'Viewing articulated envelope · show primary'}</button>}
 <Viewer sightlines={showSightlines} links={variant==='lobby'?lobbyLinks:[]} letters={fitted?.letters} architecture={fitted?.architecture} draft={sourceId==='custom'&&generator==='source-preserving'?source?.source:undefined} result={primary&&result?.primary?{...result,architecture:result.primary,components:[]}:result} field={mode==='A'&&sourceId==='custom'?field:displayField} mode={mode} view={view} iso={iso} cut={cut} selected={selected} onPick={setSelected} isolate={isolate} reset={reset} onCapture={variant==='lobby'?registerCapture:undefined}/>
 <p>{result?`Displayed study: ${displayField.width} × ${displayField.depth} × ${displayField.height} ft · ${result.request.preferredFeet} ft letters · ${result.sourceCount} actual instances · ${result.volume.toFixed(3)} ft³`:variant==='lobby'&&source?`${source.name} · original letters follow the selected rules.`:'No saved geometry is preloaded. Generate a new study.'}</p>
 {lobbyBoard&&<TopographicLobbyBoard title={lobbyBoard.title} letters={lobbyBoard.letters} form={lobbyBoard.form}/>}
 {envelopeVersion==='inserted-plate'&&<p>Inserted Plate pilot: three horizontal L plates, three horizontal U edges and recesses, three upright V boundaries. L/U X and Y tilt 0°; V X tilt 90°; common-axis Z variations −15° / 0° / +15°. New designs only; regeneration preserves all poses.</p>}
 {result?.plateReport&&<details open><summary>Inserted Plate source influence and geometry</summary>{result.plateReport.floors.map(f=><p key={f.id}>{f.source} · horizontal plate at {f.topZ.toFixed(2)} ft · {f.links.map(l=>l.source).join(', ')} boundary links</p>)}{result.plateReport.pockets.map(p=><p key={p.source}>{p.source} · open curved edge recess above {p.floor}</p>)}{result.plateReport.walls.map(w=><p key={w.source}>{w.source} · upright boundary · support {w.supportZ.toFixed(2)} ft · {w.contacts.filter(c=>c.volume>1e-6).length} plate contacts</p>)}<p>{result.plateReport.limitations.join(' ')}</p></details>}
 {result?.voidFieldReport&&<p>Displayed façade mode: {result.voidFieldReport.facadeMode==='face-normal'?'Face-Normal · source-perpendicular':'Global Z · vertical comparison'}.</p>}
 {result?.voidFieldReport?.extent&&result.voidFieldReport.roles&&<details open><summary>Void Field source influence and geometry</summary><p>Three source-derived canyons · {result.voidFieldReport.floors.length} horizontal levels · source-derived height {result.voidFieldReport.extent[1].toFixed(1)} ft within the unchanged {displayField.height} ft field.</p>{result.voidFieldReport.roles.map(role=>{const v=result.voidFieldReport?.voids.find(v=>v.source===role.source);return <p key={role.source}>{role.source} · {role.role}{v?' · '+v.hierarchy+' void · '+v.removedVolume.toFixed(1)+' ft³ removed · '+v.closure.rule :role.role==='terrace'?' · source-shaped horizontal platform':result.voidFieldReport?.facadeMode==='face-normal'?' · source platform and source-normal exterior façade':' · source platform and vertical exterior boundary'}.</p>;})}<p>{result.voidFieldReport.limitations.join(' ')}</p></details>}
 {result?.voidFieldReport?.visibility&&<section><h2>Atrium visibility checks</h2><p>{result.voidFieldReport.visibility.floorViews.map(f=>f.portalCount).join(' / ')} floor-facing views across {result.voidFieldReport.floors.length} occupied levels · {result.voidFieldReport.visibility.crossLevel.reduce((n,p)=>n+p.views.length,0)} cross-level paths · {result.voidFieldReport.visibility.sky.length} open-to-sky paths. Rays are backed by actual floor material and checked against the exported solid. Daylight levels, guarding and circulation are not verified.</p></section>}
 {result?.voidFieldReport?.facadeMode==='face-normal'&&<details><summary>Face-Normal Façade test details</summary><p>Source caps and poses are preserved. Sweep direction follows each source-face normal. Horizontal support cuts and field-boundary cuts remain planar.</p>{result.voidFieldReport.walls?.map(w=><p key={w.source}>{w.source} · support {(w.supportZ??0).toFixed(2)} ft ({w.supportRule??'reported support'}) · {(w.maximumPlanShift??0).toFixed(2)} ft potential lateral travel · {(w.fieldTrimVolume??0).toFixed(2)} ft³ trimmed at field boundaries · {w.floorContacts?.filter(c=>c.volume>1e-6).length??0} positive floor contacts.</p>)}<p>Geometric contacts and mesh connectivity are tested; structural performance is not verified.</p></details>}
 <details><summary>Advanced result details</summary>{result?.articulationReport&&<section><h2>Envelope articulation</h2><p>Primary {result.articulationReport.before.toFixed(2)} ft³ · Final {result.volume.toFixed(2)} ft³ · Removed {result.articulationReport.removed.toFixed(2)} ft³ · Added {(result.articulationReport.added??0).toFixed(2)} ft³ · {result.articulationReport.components} connected component(s)</p><p>{result.articulationReport.operations.filter(o=>o.kind==='backed pocket').length} backed pockets · {result.articulationReport.operations.filter(o=>o.alcove).length} alcove candidates · {result.articulationReport.operations.filter(o=>(o.kind==='through opening'||o.kind==='directional through void'||o.kind==='vertical canyon void')).length} through openings · {result.articulationReport.overhangs} sheltered cuts · {result.articulationReport.addedProjections} outward additions</p>{result.articulationReport.operations.map(o=><p key={o.id}>{o.kind} · {o.sources.join(' / ')} · {o.feature} · {o.profile} · W × D × H {o.width.toFixed(1)} × {o.depth.toFixed(1)} × {o.height.toFixed(1)} ft · bay {o.bayDepth.toFixed(1)} ft{o.alcove?' · alcove candidate':''}</p>)}</section>}{result?.contributions&&<section><h2>Visible source contributions</h2>{result.contributions.map(c=><p key={c.letter}>{c.letter} · {c.component} · {c.exposedArea.toFixed(1)} ft² exposed surface · {c.relationships.join(', ')}</p>)}</section>}{result?.features&&<details open><summary>Source derivation · plan</summary><svg viewBox={[-displayField.width/2,-displayField.depth/2,displayField.width,displayField.depth].join(" ")} style={{width:"100%",height:170}}><g transform="scale(1,-1)">{result.features.map(f=><polyline key={f.id} fill="none" stroke="#67bace" strokeWidth=".28" points={f.line.map(p=>p.slice(0,2).join(",")).join(" ")}/>)}{result.paths?.map((f,i)=><polyline key={i} fill="none" stroke="orange" strokeWidth=".4" points={f.line.map(p=>p.slice(0,2).join(",")).join(" ")}/>)}</g></svg>Blue: source edges. Orange: cross-letter trajectories.</details>}{result&&<><p style={{color:result.architecturalValidation?.passed?'#9bd4a5':'#edb780'}}>{result.architecturalValidation?(result.architecturalValidation.passed?'Architectural relationship checks passed.':'Architectural relationship checks FAILED — comparison only.'):'Functional architectural compliance has not been verified.'}</p><label>Inspect instance / component<select aria-label="Inspect object" className="block w-full" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All objects</option><optgroup label="Source instances">{result.letters.map(l=><option key={l.id}>{l.id}</option>)}</optgroup><optgroup label="Architectural components">{result.components.map(c=><option key={c.id}>{c.id}</option>)}</optgroup></select></label><label><input type="checkbox" checked={isolate} onChange={e=>setIsolate(e.target.checked)}/> Isolate selected object</label><p className="text-xs">{result.components.find(c=>c.id===selected)?.sources?.join(' · ')}</p><p>Independent geometry check: {result.validation.selfIntersectionPairs} crossings / overlaps across {result.validation.nonAdjacentTriangleChecks.toLocaleString()} pairs.</p>{result.warnings.map(w=><p className="text-xs mt-2" key={w}>{w}</p>)}<a className="underline" href={'/api/amphitheater?id='+result.id} target="_blank" rel="noreferrer">Full study snapshot and meshes (JSON)</a></>}
 </details></section>{result&&<AmphitheaterPresentation result={result} disabled={busy}/>}{variant==='lobby'&&comparisonPanel}<section style={panel}><h2>Saved studies and alternatives</h2><p className="text-xs">{variant==='lobby'?'Lobby studies and alternatives are stored in the lobby repository. Gathering runs are not listed here. Compare is available for matching field dimensions and preferred letter size; no rescaling is applied.':'Saved gathering studies retain their source composition and generation settings. Lobby runs are stored separately. Compare is available for matching field dimensions and preferred letter size; no rescaling is applied.'}</p>{variant==='lobby'?<>{lobbyStudies.length===0&&<p className="text-xs">No saved lobby studies.</p>}{lobbyStudies.map((s,i)=><LobbyStudyName key={s.id} study={s} index={i} total={lobbyStudies.length} draft={nameDrafts[s.id]??s.name} busy={busy} compareDisabled={!lobbyComparable(s)} onDraft={value=>setNameDrafts(current=>({...current,[s.id]:value}))} onSave={()=>void renameLobby(s.id,nameDrafts[s.id]??s.name)} onOpen={()=>void load(s.id)} onDelete={()=>void deleteLobby(s.id)} onCompare={()=>void compareLobby(s)}/>)}</>:<>{visibleStudies.length===0&&<p className="text-xs">No saved gathering studies.</p>}{visibleStudies.map((s,i)=><div className="flex gap-2 items-center border-t py-2" key={s.id}><span>Study {visibleStudies.length-i} · {s.request.field.width}/{s.request.field.depth}/{s.request.field.height} · {s.request.preferredFeet}′ · {s.sourceCount} letters · {s.request.sourceName}</span><button className="border p-1" onClick={()=>void load(s.id)}>Open</button><button className="border p-1" disabled={!result||result.id===s.id||parameterKey(result.request)!==parameterKey(s.request)} onClick={()=>void load(s.id,true)}>Compare</button></div>)}</>}</section>
 {variant!=='lobby'&&comparisonPanel}
 </section></div></main>;
}






