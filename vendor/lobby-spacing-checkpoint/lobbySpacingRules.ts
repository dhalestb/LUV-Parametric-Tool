import * as THREE from 'three';
import type {AmphitheaterSource,ProofMesh} from '../lobby-bfce854/src/components/amphitheaterInteractiveTypes';
import type {LobbyId,LobbyEngineRevision} from './lobbyEngineVersions';
import * as originalGlyphs from '../../vendor/lobby-bf7fc3c/src/components/letterGeometry3d';
import * as finalGlyphs from '../../vendor/lobby-bfce854/src/components/letterGeometry3d';

/** Developer-confirmed distances in feet, applied after the original field fitting. */
export const LOBBY_SPACING_REVISION='lobby-spacing-2026-11-25' as const;
export const LOBBY_SPACING_TOLERANCE_FT=1e-5;
export const LOBBY_FIXED_SPACING=Object.freeze({continuousOverlapFt:.405,linearOverlapFt:.747,linearClearanceFt:1.013});
export function hasFixedLobbySpacing(type:LobbyId){return type==='continuous-hall-lobby'||type==='linear-gallery-lobby';}
type SpacingRecord={request?:{sourceSnapshot?:unknown};provenance?:{spacingRuleRevision?:unknown}};
export function recordedLobbySpacingRevision(record:SpacingRecord):typeof LOBBY_SPACING_REVISION|undefined{
 const snapshot=record.request?.sourceSnapshot as {spacingRuleRevision?:unknown}|undefined;
 const revisions=[snapshot?.spacingRuleRevision,record.provenance?.spacingRuleRevision].filter(v=>v!==undefined);
 if(revisions.some(v=>v!==LOBBY_SPACING_REVISION))throw Error('Unknown saved Lobby spacing revision. The study was not changed.');
 return revisions.length?LOBBY_SPACING_REVISION:undefined;
}
export function lobbySpacingRuleDescription(type:LobbyId){
 if(type==='continuous-hall-lobby')return 'New designs overlap neighboring X bounds by 0.405 ft after fitting. Study 87’s 0.729 ft standing-letter center spacing applies to its letter widths; centers follow the actual widths when letter size changes.';
 if(type==='linear-gallery-lobby')return 'New designs keep 0.747 ft X overlap from each flat L to its upright U, then 1.013 ft X clearance from that U to the next flat L. Other letter relationships retain the developer’s original spacing.';
 return undefined;
}
function flatL(p:AmphitheaterSource){return p.letter==='L'&&Math.abs(p.rx%180)<1e-6&&Math.abs(p.ry%180)<1e-6;}
function uprightU(p:AmphitheaterSource){return p.letter==='U'&&Math.abs(Math.abs(p.ry%180)-90)<1e-6;}
function targetGap(type:LobbyId,a:AmphitheaterSource,b:AmphitheaterSource):number|undefined{
 if(type==='continuous-hall-lobby')return -LOBBY_FIXED_SPACING.continuousOverlapFt;
 if(type==='linear-gallery-lobby'&&flatL(a)&&uprightU(b))return -LOBBY_FIXED_SPACING.linearOverlapFt;
 if(type==='linear-gallery-lobby'&&uprightU(a)&&flatL(b))return LOBBY_FIXED_SPACING.linearClearanceFt;
 return undefined;
}
function sourceXBounds(type:LobbyId,p:AmphitheaterSource,engine:LobbyEngineRevision):[number,number]{
 const glyphs=engine==='bf7fc3c'?originalGlyphs:finalGlyphs;
 const linearU=engine==='bfce854'&&type==='linear-gallery-lobby'&&p.letter==='U'&&Math.abs(p.ry)===90;
 const geometry=linearU?finalGlyphs.getLetterVolumeGeometry('U',12,finalGlyphs.linearUInnerHalf(p.scale*p.scaleX),false,finalGlyphs.linearUBend(p.scale,p.scaleY)):glyphs.getLetterVolumeGeometry(p.letter,12);
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(...[p.rx,p.ry,p.rz].map(THREE.MathUtils.degToRad) as [number,number,number],p.rotationOrder??'XYZ')),new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 const points=geometry.getAttribute('position'),point=new THREE.Vector3();let min=Infinity,max=-Infinity;
 for(let i=0;i<points.count;i++){point.fromBufferAttribute(points,i).applyMatrix4(matrix);min=Math.min(min,point.x);max=Math.max(max,point.x);}
 return [min,max];
}
function meshXBounds(mesh:ProofMesh):[number,number]{let min=Infinity,max=-Infinity;for(let i=0;i<mesh.positions.length;i+=3){min=Math.min(min,mesh.positions[i]);max=Math.max(max,mesh.positions[i]);}return [min,max];}
function spacingReport(type:LobbyId,source:AmphitheaterSource[],boxes:[number,number][]){
 const pairs=source.slice(1).map((b,i)=>{
  const a=source[i],target=targetGap(type,a,b),gap=boxes[i+1][0]-boxes[i][1],overlap=Math.max(0,Math.min(boxes[i][1],boxes[i+1][1])-Math.max(boxes[i][0],boxes[i+1][0]));
  return {from:a.letter+'-'+(i+1),to:b.letter+'-'+(i+2),targetSignedGapFt:target??null,signedGapFt:gap,overlapFt:overlap,clearanceFt:Math.max(0,gap),centerSpacingFt:b.x-a.x,passed:target===undefined?null:Math.abs(gap-target)<=LOBBY_SPACING_TOLERANCE_FT&&(target>=0||Math.abs(overlap+target)<=LOBBY_SPACING_TOLERANCE_FT)};
 });
 const applicable=pairs.filter(p=>p.passed!==null);
 return {revision:LOBBY_SPACING_REVISION,axis:'X',units:'ft',toleranceFt:LOBBY_SPACING_TOLERANCE_FT,applicablePairs:applicable.length,unchangedOtherPairs:pairs.length-applicable.length,passed:applicable.every(p=>p.passed),pairs};
}
export function measureLobbySourceSpacing(type:LobbyId,source:AmphitheaterSource[],engine:LobbyEngineRevision){return spacingReport(type,source,source.map(p=>sourceXBounds(type,p,engine)));}
export function measureLobbyMeshSpacing(type:LobbyId,source:AmphitheaterSource[],letters:{mesh:ProofMesh}[]){
 if(letters.length!==source.length)throw Error('Source spacing cannot be checked against a different letter population.');
 return spacingReport(type,source,letters.map(l=>meshXBounds(l.mesh)));
}
export function assertLobbySpacing(report:ReturnType<typeof measureLobbySourceSpacing>){
 const failed=report.pairs.find(p=>p.passed===false);if(failed)throw Error('Fixed Lobby spacing failed for '+failed.from+' / '+failed.to+': measured signed X gap '+failed.signedGapFt.toFixed(6)+' ft; expected '+failed.targetSignedGapFt+' ft.');
}
/** Adjust only new automatic X positions. Never mutate glyphs, scales, rotations or saved sources. */
export function applyFixedLobbySpacing(type:LobbyId,source:AmphitheaterSource[],engine:LobbyEngineRevision,field:{width:number}){
 if(!hasFixedLobbySpacing(type))return source;
 const boxes=source.map(p=>sourceXBounds(type,p,engine)),initial=spacingReport(type,source,boxes);
 if(initial.passed)return source;
 const next=source.map(p=>({...p}));
 for(let i=1;i<next.length;i++){
  const target=targetGap(type,source[i-1],source[i]),gap=target??(boxes[i][0]-boxes[i-1][1]);
  if(target!==undefined&&gap<0&&-gap>Math.min(boxes[i-1][1]-boxes[i-1][0],boxes[i][1]-boxes[i][0])+LOBBY_SPACING_TOLERANCE_FT)throw Error('The fixed overlap exceeds a letter’s X width. Increase the preferred letter size.');
  next[i].x=next[i-1].x+(boxes[i-1][1]-source[i-1].x)-(boxes[i][0]-source[i].x)+gap;
 }
 const fitted=next.map((p,i)=>[boxes[i][0]+p.x-source[i].x,boxes[i][1]+p.x-source[i].x]);
 const min=Math.min(...fitted.map(b=>b[0])),max=Math.max(...fitted.map(b=>b[1])),span=max-min;
 const limit=type==='linear-gallery-lobby'?(field.width-.2)/(53.5/48.6):field.width;
 if(span>limit+LOBBY_SPACING_TOLERANCE_FT)throw Error('Fixed Lobby spacing requires '+span.toFixed(3)+' ft along X; this field allows '+limit.toFixed(3)+' ft. Reduce letter quantity or size, or choose a wider field. The gaps were not compressed.');
 const center=(min+max)/2;next.forEach(p=>{p.x-=center;});
 assertLobbySpacing(measureLobbySourceSpacing(type,next,engine));return next;
}
