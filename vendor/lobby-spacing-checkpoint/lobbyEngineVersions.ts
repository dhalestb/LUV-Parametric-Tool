export const LOBBY_ENGINES = {
 bf7fc3c: {package:'lobby-bf7fc3c',sourceCommit:'bf7fc3c8a9235fc3d4910b7b266821d484af93bf',engineSHA256:'ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b'},
 bfce854: {package:'lobby-bfce854',sourceCommit:'aec2db587c5bd6a7b169cb2d6f389f7f964405ab',engineSHA256:'bfce854844db696eb3c3759a36d90cfb4d3ed418432fc9aff15f08db6b5dec4d'},
} as const;
export type LobbyEngineRevision=keyof typeof LOBBY_ENGINES;
export const LOBBY_GENERATORS = {
 'vertical-void-lobby':{name:'Vertical Void Lobby',engine:'bf7fc3c'},
 'compressed-sequential-lobby':{name:'Compressed Sequential Lobby',engine:'bfce854'},
 'continuous-hall-lobby':{name:'Continuous Hall Lobby',engine:'bf7fc3c'},
 'topographic-ground-field-lobby':{name:'Topographic Lobby',engine:'bfce854'},
 'linear-gallery-lobby':{name:'Linear Gallery Lobby',engine:'bfce854'},
} as const;
export type LobbyId=keyof typeof LOBBY_GENERATORS;
export function lobbyId(value:unknown):LobbyId{
 if(typeof value!=='string'||!Object.hasOwn(LOBBY_GENERATORS,value))throw Error('Choose one of the five registered Lobby typologies.');
 return value as LobbyId;
}
export function lobbyEngine(value:unknown):LobbyEngineRevision{
 if(value!=='bf7fc3c'&&value!=='bfce854')throw Error('Unknown Lobby engine revision; the saved study was not changed.');
 return value;
}
type Recorded={request?:{engineRevision?:unknown;sourceSnapshot?:unknown};provenance?:{engineRevision?:unknown;sourceCommit?:string;adapter?:string}};
/** Historical v1 derivatives all used bf7fc3c, including their Linear/Compressed/Topo studies. */
export function recordedLobbyEngine(record:Recorded):LobbyEngineRevision{
 const snapshot=record.request?.sourceSnapshot as {engineRevision?:unknown;sourceCommit?:string;adapter?:string}|undefined;
 const explicit=[record.request?.engineRevision,snapshot?.engineRevision,record.provenance?.engineRevision].filter(v=>v!==undefined).map(lobbyEngine);
 if(explicit.length){if(explicit.some(v=>v!==explicit[0]))throw Error('Conflicting saved Lobby engine provenance.');return explicit[0];}
 if(record.provenance?.adapter==='isolated-lobby-v1'||snapshot?.adapter==='isolated-lobby-v1'||record.provenance?.sourceCommit===LOBBY_ENGINES.bf7fc3c.sourceCommit||snapshot?.sourceCommit===LOBBY_ENGINES.bf7fc3c.sourceCommit)return 'bf7fc3c';
 throw Error('This saved Lobby study has no verified engine provenance. Open the approved reference or create a separate new design.');
}
