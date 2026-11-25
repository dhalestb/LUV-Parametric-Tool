'use client';
import {useEffect,useState} from 'react';
export type DisplayMode='letters'|'architecture'|'combined';
export const DISPLAY_MODE_KEY='luv-experiment-architectural-display-v1';
export const displayFlags=(mode:DisplayMode)=>({letters:mode!=='architecture',architecture:mode!=='letters'});
export function readDisplayMode():DisplayMode{const mode=localStorage.getItem(DISPLAY_MODE_KEY);if(mode==='letters'||mode==='architecture'||mode==='combined')return mode;let letters=true;try{letters=JSON.parse(localStorage.getItem('luv-experiment-orientation-selection-v1')||'{}').letters!==false;}catch{}const architecture=localStorage.getItem('luv-experiment-linear-rule-b-visible-v1')==='true';return architecture?(letters?'combined':'architecture'):'letters';}
export function setDisplayMode(mode:DisplayMode){
  localStorage.setItem(DISPLAY_MODE_KEY,mode);
  window.dispatchEvent(new Event('luv-architectural-display'));
}
export function useArchitecturalDisplay(){const [mode,setMode]=useState<DisplayMode>('letters');useEffect(()=>{const update=()=>setMode(readDisplayMode());update();window.addEventListener('storage',update);window.addEventListener('luv-architectural-display',update);return()=>{window.removeEventListener('storage',update);window.removeEventListener('luv-architectural-display',update);};},[]);return {mode,...displayFlags(mode),select:(value:DisplayMode)=>{setDisplayMode(value);}};}
export function DisplayModeSelector(){const {mode,select}=useArchitecturalDisplay();return <label style={{display:'block',margin:'8px 0'}}>Architectural display <select aria-label='Architectural display mode' value={mode} onChange={e=>select(e.target.value as DisplayMode)}><option value='letters'>Letters Only</option><option value='architecture'>Architecture Only</option><option value='combined'>Combined</option></select><span style={{display:'block'}}>Letters: original L/U/V colors · architecture: gold (translucent in Combined). Site, boundaries and organizing layers remain independent.</span></label>;}
