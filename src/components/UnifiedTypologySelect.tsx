'use client';
import {createContext,useContext,useEffect,type SelectHTMLAttributes,type ChangeEvent} from 'react';
import {WORKSPACE_TYPOLOGIES} from './workspaceDualRulesets';
export const LOBBY_OPTIONS=[['vertical-void-lobby','Vertical Void Lobby'],['compressed-sequential-lobby','Compressed Sequential Lobby'],['continuous-hall-lobby','Continuous Hall Lobby'],['topographic-ground-field-lobby','Topographic Lobby'],['linear-gallery-lobby','Linear Gallery Lobby']] as const;
export const GATHERING_OPTIONS=[['stepped','Stepped Amphitheater'],['linear-edge-gallery','Linear Edge Gallery'],['inserted-plate','Inserted Horizontal Plate'],['void-field','Void-Field'],['room-within-volume','Room Within Volume']] as const;
export type Family='gathering'|'workspace'|'lobby';
export function familyOf(id:string):Family{return LOBBY_OPTIONS.some(([v])=>v===id)?'lobby':WORKSPACE_TYPOLOGIES.some(([v])=>v===id)?'workspace':'gathering';}
export const TypologyContext=createContext<{id:string;choose:(id:string)=>void}>({id:'stepped',choose:()=>{}});
/** Delegates to each preserved controller's own selection handler. */
export default function UnifiedTypologySelect({family,onChange,value,...props}:SelectHTMLAttributes<HTMLSelectElement>&{family:Family}){
 const context=useContext(TypologyContext);
 // A category switch routes to its native controller. Loading a saved study in
 // that controller routes its resulting selection back to the shared selector.
 useEffect(()=>{if(familyOf(context.id)===family&&context.id!==value)onChange?.({target:{value:context.id}} as ChangeEvent<HTMLSelectElement>);},[context.id]);
 useEffect(()=>{if(typeof value==='string'&&familyOf(value)===family&&familyOf(context.id)===family&&context.id!==value)context.choose(value);},[value]);
 return <select {...props} value={familyOf(context.id)===family?context.id:value} onChange={e=>{const url=new URL(window.location.href);url.searchParams.set('typology',e.target.value);url.searchParams.delete('study');url.searchParams.delete('lobbyStudy');window.history.replaceState(window.history.state,'',url);context.choose(e.target.value);if(familyOf(e.target.value)===family)onChange?.(e);}}>
 {[['Gathering',GATHERING_OPTIONS],['Workspace',WORKSPACE_TYPOLOGIES],['Lobby',LOBBY_OPTIONS]].map(([label,items])=><optgroup key={String(label)} label={String(label)}>{(items as readonly (readonly [string,string])[]).map(([id,title])=><option key={id} value={id}>{title}</option>)}</optgroup>)}
 </select>;
}
