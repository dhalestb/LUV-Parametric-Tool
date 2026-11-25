import * as original from '../../vendor/lobby-bf7fc3c/src/components/lobbyProof';
import * as final from '../../vendor/lobby-bfce854/src/components/lobbyProof';
import {LOBBY_GENERATORS,type LobbyId,type LobbyEngineRevision} from './lobbyEngineVersions';
import {applyFixedLobbySpacing,hasFixedLobbySpacing,lobbySpacingRuleDescription,LOBBY_SPACING_REVISION} from './lobbySpacingRules';
export function lobbyOrientationRules(id:LobbyId,engine:LobbyEngineRevision=LOBBY_GENERATORS[id].engine){
 const rules=(engine==='bf7fc3c'?original:final).LOBBY_TYPOLOGIES.find(t=>t.id===id)!.rules;
 const spacing=lobbySpacingRuleDescription(id);return spacing?[...rules,spacing]:rules;
}
export function populateVersionedLobby(id:LobbyId,preferred:number,count:number,field:{width:number;depth:number;height:number},active:('L'|'U'|'V')[],levels?:{count:number;spacing:number}){
 const engine=LOBBY_GENERATORS[id].engine;
 const source=(engine==='bf7fc3c'?original:final).populateLobby(id,preferred,count,field,'proximity',active).source;
 const leveled=levels&&id==='topographic-ground-field-lobby'?final.applyLobbyZLevels(source,field,levels.count,levels.spacing):source;
 return {engineRevision:engine,source:applyFixedLobbySpacing(id,leveled,engine,field),...(hasFixedLobbySpacing(id)?{spacingRuleRevision:LOBBY_SPACING_REVISION}:{})};
}

