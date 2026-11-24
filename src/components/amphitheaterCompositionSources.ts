import { localizeIntersectingPlacements } from './selectionFieldGeometry';
import { placementCenterInSelection } from './selectionSearch';
import type { SpatialAlternative } from './optimizerTypes';
import type { AmphitheaterSource } from './amphitheaterInteractiveTypes';
export type ProofSource={id:string;name:string;source:AmphitheaterSource[];snapshot?:unknown};
type SavedComposition={alternatives?:SpatialAlternative[];name?:string;id?:string};
export function collectCompositionSources(session:SavedComposition|null,saved:SavedComposition[]):ProofSource[]{
 const imported:ProofSource[]=[];
 function collect(entry:SavedComposition,prefix:string){
  for(const [i,a] of (entry.alternatives??[]).entries()){
   let placements=a.placements;
   if(a.selection&&a.fullPlacements?.length){const w=a.selection;if(w.heightRouting)placements=localizeIntersectingPlacements(a.fullPlacements,w,12);else placements=a.fullPlacements.filter(p=>placementCenterInSelection(p,w)).map(p=>({...p,x:p.x-w.centerX,y:p.y-w.centerY,z:p.z-w.centerZ}));}
   const source=placements.filter(p=>['L','U','V'].includes(p.cell.letter)).map(p=>({letter:p.cell.letter as 'L'|'U'|'V',x:p.x,y:p.y,z:p.z,rx:p.rx,ry:p.ry,rz:p.rz,scale:p.scale,scaleX:p.scaleX??1,scaleY:p.scaleY??1,scaleZ:p.scaleZ??1}));
   if(source.length)imported.push({id:prefix+':'+a.id,name:(entry.name??'Current Composition')+' · alternative '+(i+1)+' · '+source.length+' source letters',source,snapshot:a});
  }
 }
 if(session)collect(session,'session');
 for(const entry of saved)collect(entry,'saved:'+entry.id);
 return imported;
}
/** Refresh live sources without losing the snapshot currently being evaluated. */
export function mergeCompositionSources(current:ProofSource[],imported:ProofSource[],selectedId:string):ProofSource[]{
 const merged=new Map(current.filter(s=>s.id==='fixture'||s.id==='custom'||s.id===selectedId).map(s=>[s.id,s]));
 for(const source of imported)merged.set(source.id,source);
 return Array.from(merged.values());
}
export function compositionRefreshMessage(count:number){
 return count?`Refreshed ${count} Composition source${count===1?'':'s'}. Choose a source, then Generate baseline study to create new geometry.`:'No current or saved Composition studies were found on this app origin. Your selected study source is retained. Open Composition here, generate a study, then refresh this list.';
}
