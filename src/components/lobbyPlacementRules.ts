import type {AmphitheaterSource} from './amphitheaterInteractiveTypes';
import type {LobbyId} from './lobbyEngineVersions';

export const CONTINUOUS_STUDY87_PLACEMENT_REVISION='continuous-study87-z0-v1-2026-11-25' as const;
export type LobbyPlacementRevision=typeof CONTINUOUS_STUDY87_PLACEMENT_REVISION;
type PlacementRecord={request?:{sourceSnapshot?:unknown};provenance?:{placementRuleRevision?:unknown}};

export function recordedLobbyPlacementRevision(record:PlacementRecord):LobbyPlacementRevision|undefined{
 const snapshot=record.request?.sourceSnapshot as {placementRuleRevision?:unknown}|undefined;
 const revisions=[snapshot?.placementRuleRevision,record.provenance?.placementRuleRevision].filter(v=>v!==undefined);
 if(revisions.some(v=>v!==CONTINUOUS_STUDY87_PLACEMENT_REVISION))throw Error('Unknown saved Lobby placement revision. The study was not changed.');
 return revisions.length?CONTINUOUS_STUDY87_PLACEMENT_REVISION:undefined;
}

/** The developer's one-level transform: world Z = half the field height,
 * stored source Z = world Z minus half the field height = 0. No glyph changes. */
export function applyContinuousStudy87Level(source:AmphitheaterSource[]):AmphitheaterSource[]{
 return source.map(item=>({...item,z:0}));
}

/** Existing studies retain their recorded poses/policy; configuration copies
 * explicitly requested from an approved reference retain its source as well. */
export function resolveLobbyPlacementRevision(type:LobbyId,request:{sourceSnapshot?:unknown},parent?:PlacementRecord):LobbyPlacementRevision|undefined{
 const requested=recordedLobbyPlacementRevision({request});
 if(requested&&type!=='continuous-hall-lobby')throw Error('Study 87 placement is registered only for Continuous Hall.');
 if(parent){
  const recorded=recordedLobbyPlacementRevision(parent);
  if(requested!==undefined&&requested!==recorded)throw Error('Regeneration must retain the saved placement revision. Create a new design to use Study 87 placement.');
  return recorded;
 }
 const operation=(request.sourceSnapshot as {operation?:string}|undefined)?.operation;
 if(operation==='approved-configuration-derivative')return requested;
 return type==='continuous-hall-lobby'?CONTINUOUS_STUDY87_PLACEMENT_REVISION:undefined;
}

export function measureContinuousStudy87Placement(source:AmphitheaterSource[]){
 const failedLetters=source.flatMap((item,index)=>item.z===0?[]:[index+1]);
 return {revision:CONTINUOUS_STUDY87_PLACEMENT_REVISION,expectedZ:0,sourceCount:source.length,failedLetters,passed:failedLetters.length===0};
}
export function assertContinuousStudy87Placement(source:AmphitheaterSource[]){
 const report=measureContinuousStudy87Placement(source);
 if(!report.passed)throw Error('New Continuous Hall designs require every source letter at Z = 0 (Study 87). Incorrect letters: '+report.failedLetters.join(', ')+'. Regenerate an existing study to preserve its historical poses.');
}
