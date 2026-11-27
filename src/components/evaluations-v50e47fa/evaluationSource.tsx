'use client';

import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {parseObj} from '../lattice/parseObj';
import {LATTICE_SLOTS} from '../lattice/slots';
import {MAX_IMPORTS, type ImportedObj, type UnitName, type UpAxisMode} from '../lattice/types';
import {evaluationImportSlot, packEvaluationSource, unpackEvaluationSource} from './evaluationSourceState';
import {evaluationLocalStorage} from './evaluationStorage';

type EvaluationSources = {
  hydrated: boolean; geometryPersisted: boolean; origin: string;
  meshes: ImportedObj[]; assignments: Record<string,string|null>; unit: UnitName; upAxisMode: UpAxisMode;
  setMeshes: Dispatch<SetStateAction<ImportedObj[]>>; setAssignments: Dispatch<SetStateAction<Record<string,string|null>>>;
  setUnit: Dispatch<SetStateAction<UnitName>>; setUpAxisMode: Dispatch<SetStateAction<UpAxisMode>>;
  importObjFiles: (files: File[]) => Promise<{imported: number; error?: string; note?: string; firstAssignedSlot?: string}>;
  loadSampleObjs: () => Promise<{loaded: number; error?: string}>;
};
const EvaluationSourceContext = createContext<EvaluationSources|null>(null);

export function EvaluationsSourceProvider({children}: {children: React.ReactNode}) {
  const started = useRef(false);
  const [hydrated,setHydrated]=useState(false), [geometryPersisted,setGeometryPersisted]=useState(true), [origin,setOrigin]=useState('empty');
  const [meshes,setMeshes]=useState<ImportedObj[]>([]), [assignments,setAssignments]=useState<Record<string,string|null>>({});
  const [unit,setUnit]=useState<UnitName>('feet'), [upAxisMode,setUpAxisMode]=useState<UpAxisMode>('auto');
  useEffect(()=>{
    if(started.current)return;
    started.current=true;
    const saved=unpackEvaluationSource(evaluationLocalStorage.getItem('source-session'));
    if(saved){setMeshes(saved.meshes);setAssignments(saved.assignments);setUnit(saved.unit);setUpAxisMode(saved.upAxisMode);setOrigin('session');}
    setHydrated(true);
  },[]);
  useEffect(()=>{
    if(!hydrated)return;
    const handle=window.setTimeout(()=>{
      try{evaluationLocalStorage.setItem('source-session',packEvaluationSource({meshes,assignments,unit,upAxisMode}));setGeometryPersisted(true);}
      catch{setGeometryPersisted(false);}
    },200);
    return()=>window.clearTimeout(handle);
  },[hydrated,meshes,assignments,unit,upAxisMode]);
  const importObjFiles=useCallback(async(files:File[])=>{
    const accepted=files.filter(file=>file.name.toLowerCase().endsWith('.obj')).slice(0,Math.max(0,MAX_IMPORTS-meshes.length));
    if(!accepted.length)return{imported:0,error:meshes.length>=MAX_IMPORTS?`The upload limit is ${MAX_IMPORTS} OBJ files.`:'Choose OBJ files.'};
    const parsed:ImportedObj[]=[],errors:string[]=[];
    for (const file of accepted) {
      try {
        const mesh = parseObj(await file.text(), file.name);
        parsed.push({ ...mesh, suggestedSlotId: evaluationImportSlot(mesh) });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : file.name);
      }
    }
    setMeshes(current=>[...current,...parsed].slice(0,MAX_IMPORTS));
    setAssignments(current=>{const next={...current};for(const mesh of parsed)if(mesh.suggestedSlotId&&!next[mesh.suggestedSlotId])next[mesh.suggestedSlotId]=mesh.id;return next;});
    setOrigin('user');return{imported:parsed.length,error:errors[0],firstAssignedSlot:parsed.find(mesh=>mesh.suggestedSlotId&&!assignments[mesh.suggestedSlotId])?.suggestedSlotId??undefined};
  },[meshes.length,assignments]);
  const loadSampleObjs=useCallback(async()=>{
    const open=LATTICE_SLOTS.filter(slot=>!assignments[slot.id]);
    if(!open.length)return{loaded:0,error:'Every Evaluations slot already has a source OBJ.'};
    const files:File[]=[];
    try{for(const slot of open){const filename=`${slot.id}-${slot.name.replace(/[ /]/g,'-')}.obj`,response=await fetch(`/part2-samples/${filename}`);if(!response.ok)return{loaded:0,error:`Missing sample ${filename}`};files.push(new File([await response.text()],filename,{type:'text/plain'}));}
      const result=await importObjFiles(files);return{loaded:result.imported,error:result.error};
    }catch(e){return{loaded:0,error:e instanceof Error?e.message:'Sample import failed.'};}
  },[assignments,importObjFiles]);
  const value=useMemo(()=>({hydrated,geometryPersisted,origin,meshes,assignments,unit,upAxisMode,setMeshes,setAssignments,setUnit,setUpAxisMode,importObjFiles,loadSampleObjs}),[hydrated,geometryPersisted,origin,meshes,assignments,unit,upAxisMode,importObjFiles,loadSampleObjs]);
  return <EvaluationSourceContext.Provider value={value}>{children}</EvaluationSourceContext.Provider>;
}

export function useEvaluationSource(){const value=useContext(EvaluationSourceContext);if(!value)throw Error('Evaluations source provider is unavailable.');return value;}
