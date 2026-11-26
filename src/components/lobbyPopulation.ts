import * as original from '../../vendor/lobby-bf7fc3c/src/components/lobbyProof';
import * as final from '../../vendor/lobby-bfce854/src/components/lobbyProof';
import {LOBBY_GENERATORS,type LobbyId,type LobbyEngineRevision} from './lobbyEngineVersions';
import {applyFixedLobbySpacing,hasFixedLobbySpacing,lobbySpacingRuleDescription,LOBBY_SPACING_REVISION} from './lobbySpacingRules';
import {applyContinuousStudy87Level,CONTINUOUS_STUDY87_PLACEMENT_REVISION} from './lobbyPlacementRules';
export function lobbyOrientationRules(id:LobbyId,engine:LobbyEngineRevision=LOBBY_GENERATORS[id].engine){
 const rules=(engine==='bf7fc3c'?original:final).LOBBY_TYPOLOGIES.find(t=>t.id===id)!.rules;
 const spacing=lobbySpacingRuleDescription(id);
 return [...rules,...(spacing?[spacing]:[]),...(id==='continuous-hall-lobby'?['New automatic designs follow Study 87: after the original placement and fitting, every source letter has Z = 0 on one level. Saved studies and approved-reference copies retain their original poses.']:[])];
}
export function populateVersionedLobby(id:LobbyId,preferred:number,count:number,field:{width:number;depth:number;height:number},active:('L'|'U'|'V')[],levels?:{count:number;spacing:number},placementPolicy:'current'|'legacy'='current'){
 const engine=LOBBY_GENERATORS[id].engine;
 const source=(engine==='bf7fc3c'?original:final).populateLobby(id,preferred,count,field,'proximity',active).source;
 const continuous=id==='continuous-hall-lobby'&&placementPolicy==='current';
 const leveled=continuous?applyContinuousStudy87Level(source):levels&&id==='topographic-ground-field-lobby'?final.applyLobbyZLevels(source,field,levels.count,levels.spacing):source;
 return {engineRevision:engine,source:applyFixedLobbySpacing(id,leveled,engine,field),...(hasFixedLobbySpacing(id)?{spacingRuleRevision:LOBBY_SPACING_REVISION}:{}),...(continuous?{placementRuleRevision:CONTINUOUS_STUDY87_PLACEMENT_REVISION}:{})};
}

