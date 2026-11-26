'use client';
import {useEffect,useState} from 'react';
import GatheringStudio from './gathering-recovery/GatheringStudio';
import WorkspaceStudio from './AmphitheaterStudio';
import LobbyStudio from './LobbyGeneratorStudio';
import {TypologyContext,familyOf,LOBBY_OPTIONS,GATHERING_OPTIONS} from './UnifiedTypologySelect';
import {WORKSPACE_TYPOLOGIES} from './workspaceDualRulesets';
/** Each completed controller retains its own state and rules across category changes. */
export default function UnifiedProtoFormStudio(){const [id,choose]=useState('stepped');useEffect(()=>{const query=new URL(window.location.href).searchParams.get('typology');if(query&&[...LOBBY_OPTIONS,...GATHERING_OPTIONS,...WORKSPACE_TYPOLOGIES].some(([v])=>v===query))choose(query);},[]);const family=familyOf(id);return <TypologyContext.Provider value={{id,choose}}><div hidden={family!=='gathering'}><GatheringStudio/></div><div hidden={family!=='workspace'}><WorkspaceStudio/></div><div hidden={family!=='lobby'}><LobbyStudio/></div></TypologyContext.Provider>;}
