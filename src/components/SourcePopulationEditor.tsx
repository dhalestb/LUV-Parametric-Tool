'use client';
import {useState} from 'react';
import {populate,suggestedCount} from './sourcePopulation';
import type {AmphitheaterSource as Letter, AmphitheaterRequest as Request} from './amphitheaterInteractiveTypes';
type Snapshot={name:string;source:Letter[];field:Request['field'];preferred:number};
type Props={showPopulation?:boolean;source:Letter[];field:Request['field'];preferred:number;onApply:(source:Letter[],name:string)=>void;onRestore:(s:Snapshot)=>void};
const storageKey='luv-amphitheater-source-drafts-v1';
export default function SourcePopulationEditor({showPopulation=true,source,field,preferred,onApply,onRestore}:Props){
 const [target,setTarget]=useState('auto'),[seed,setSeed]=useState(37),[index,setIndex]=useState(0),[name,setName]=useState('Composition'),[message,setMessage]=useState(''),[saved,setSaved]=useState<Snapshot[]>([]),[savedIndex,setSavedIndex]=useState(0);
 const selected=Math.min(index,Math.max(0,source.length-1)),letter=source[selected];
 function action(fn:()=>void){try{fn();}catch(e){setMessage(e instanceof Error?e.message:String(e));}}
 function arrange(existing:Letter[],n:number){const next=populate(existing,n,field,preferred,seed);onApply(next,name);setMessage('Composition ready · '+next.length+' source letters');}
 function change(patch:Partial<Letter>){onApply(source.map((p,i)=>i===selected?{...p,...patch}:p),name);}
 function read():Snapshot[]{return JSON.parse(localStorage.getItem(storageKey)??'[]');}
 const count=target==='auto'?suggestedCount(field,preferred):Number(target);
 return <details open onToggle={e=>{if(e.currentTarget.open)action(()=>setSaved(read()));}}><summary>Arrange and save source letters ({source.length})</summary>
 {showPopulation&&<><label>Target population <input value={target} onChange={e=>setTarget(e.target.value)}/></label><small>Auto suggests {suggestedCount(field,preferred)} from field volume and preferred size.</small>
 </>}<label>Arrangement seed <input type="number" value={seed} onChange={e=>setSeed(+e.target.value)}/></label>
 <div>{showPopulation&&<><button type="button" onClick={()=>action(()=>arrange(source,count))}>Extend selected composition</button> · <button type="button" onClick={()=>action(()=>arrange([],count))}>New composition</button> ·</>} <button type="button" onClick={()=>action(()=>{arrange(source,source.length+1);setIndex(source.length);})}>Add one letter</button></div>
 {letter&&<><label>Individual letter <select value={selected} onChange={e=>setIndex(+e.target.value)}>{source.map((p,i)=><option key={i} value={i}>{i+1} · {p.letter}</option>)}</select></label><select aria-label="Letter shape" value={letter.letter} onChange={e=>change({letter:e.target.value as Letter['letter']})}>{['L','U','V'].map(l=><option key={l}>{l}</option>)}</select>
 <div className="grid grid-cols-3 gap-1">{(['x','y','z','rx','ry','rz','scale','scaleX','scaleY','scaleZ'] as const).map(k=><label key={k}>{k}<input className="w-full" type="number" step="any" key={selected+'-'+k+'-'+letter[k]} defaultValue={letter[k]} onBlur={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n!==letter[k])change({[k]:n});}}/></label>)}</div>
 <button onClick={()=>{onApply(source.filter((_,i)=>i!==selected),name);setIndex(0);}}>Remove selected letter</button></>}
 <div><input aria-label="Composition name" value={name} onChange={e=>setName(e.target.value)}/><button onClick={()=>action(()=>{const list=[...read(),{name,source,field,preferred}];localStorage.setItem(storageKey,JSON.stringify(list));setSaved(list);setSavedIndex(list.length-1);setMessage('Saved composition in this browser.');})}>Save composition</button></div>
 {saved.length>0&&<><select aria-label="Saved source composition" value={savedIndex} onChange={e=>setSavedIndex(+e.target.value)}>{saved.map((s,i)=><option key={i} value={i}>{s.name} · {s.source.length} letters</option>)}</select><button onClick={()=>{const s=saved[savedIndex];onRestore(s);setName(s.name);setIndex(0);}}>Restore composition</button></>}
 <p role="status">{message}</p></details>;
}
