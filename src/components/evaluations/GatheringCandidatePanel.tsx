import { useMemo, useState } from 'react';
import type { DescriptorResult } from './objDescriptorAnalysis';
import { gatheringAreaScore } from './v4/gatheringMetrics';

type CandidateModel = { id:string; name:string; result:DescriptorResult };
type Floor = NonNullable<DescriptorResult['floorResults']>[number];
type Candidate = NonNullable<Floor['candidates']>[number];

function floorPlan(candidates:Candidate[]) {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    const paths=candidates.map(candidate=>{
        const xyz=candidate.patch ?? [],commands:string[]=[];
        for(let i=0;i+8<xyz.length;i+=9){
            const points:string[]=[];
            for(let j=0;j<9;j+=3){
                const x=xyz[i+j],y=-xyz[i+j+1];
                x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
                points.push(x.toFixed(3)+' '+y.toFixed(3));
            }
            commands.push('M'+points.join('L')+'Z');
        }
        return {id:candidate.region,d:commands.join('')};
    });
    const pad=Math.max(x1-x0,y1-y0,1)*.05;
    return {paths,viewBox:Number.isFinite(x0)?[x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad].join(' '):null};
}

export default function GatheringCandidatePanel({models}:{models:CandidateModel[]}) {
    const [modelId,setModel]=useState(''),[level,setLevel]=useState<number|null>(null),[region,setRegion]=useState<number|null>(null);
    const model=models.find(m=>m.id===modelId) ?? models[0];
    const floors=model?.result.floorResults ?? [];
    const floor=floors.find(f=>f.level===level) ?? floors.find(f=>f.candidates?.length) ?? floors[0];
    const candidates=useMemo(()=>[...(floor?.candidates??[])].sort((a,b)=>b.area-a.area||a.region-b.region),[floor]);
    const selected=candidates.find(c=>c.region===region) ?? candidates[0];
    const plan=useMemo(()=>floorPlan(candidates),[candidates]);
    if(!model)return null;
    return <section aria-label="Gathering candidates" className="my-3 space-y-2 rounded border p-3 text-xs" style={{borderColor:'var(--line)'}}>
        <h3 className="font-semibold">Gathering candidates</h3>
        <div className="flex flex-wrap items-center gap-3">
            <label>Model <select value={model.id} onChange={e=>{setModel(e.target.value);setLevel(null);setRegion(null);}}>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            {floor && <label>Floor <select value={floor.level} onChange={e=>{setLevel(Number(e.target.value));setRegion(null);}}>{floors.map(f=><option key={f.level} value={f.level}>{f.level} ft</option>)}</select></label>}
            <span>Building Centralized score · {Number.isFinite(model.result.absoluteScore)?model.result.absoluteScore.toFixed(1)+'/100':'N/A · pending review'}</span>
        </div>
        {selected ? <>
            <p>{candidates.length} {candidates.length===1?'candidate':'candidates'} on this floor. Gathering area is scored out of 100 and carries 40% of the overall Centralized score. Floor shares are provisional until occupancy is confirmed.</p>
            <div className="grid gap-3 md:grid-cols-2">
                {plan.viewBox && <figure className="rounded bg-black p-2">
                    <svg aria-label={'Candidate footprints at '+floor.level+' ft, R'+selected.region+' selected'} role="img" viewBox={plan.viewBox} style={{width:'100%',height:220}}>
                        {plan.paths.filter(p=>p.id!==selected.region).map(p=><path key={p.id} d={p.d} fill="#378aa6"/>)}
                        <path d={plan.paths.find(p=>p.id===selected.region)?.d} fill="#e2b74f"/>
                    </svg>
                    <figcaption>Gold · R{selected.region} · {selected.area.toFixed(2)} ft² · {gatheringAreaScore(selected.area).toFixed(2)}/100</figcaption>
                </figure>}
                <div className="max-h-72 overflow-auto">
                    <table className="w-full text-left"><thead className="sticky top-0" style={{background:'var(--panel-background)'}}><tr>{['Candidate','Usable area','Floor share','Area score'].map(title=><th className="p-1" key={title}>{title}</th>)}</tr></thead>
                    <tbody>{candidates.map(c=><tr key={c.region} style={{color:c.region===selected.region?'#e2b74f':undefined}}>
                        <td className="p-1"><button type="button" aria-pressed={c.region===selected.region} className="underline" onClick={()=>setRegion(c.region)}>R{c.region}</button></td>
                        <td>{c.area.toFixed(2)} ft²</td><td>{c.percent==null?'—':c.percent.toFixed(1)+'%'}</td><td>{gatheringAreaScore(c.area).toFixed(2)}/100</td>
                    </tr>)}</tbody></table>
                </div>
            </div>
        </> : <p>No gathering candidates on this floor.</p>}
    </section>;
}
