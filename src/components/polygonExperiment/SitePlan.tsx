'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {isLobbyTypology,newAssignment,automaticLetterTarget,maxLetterTarget,type LetterTargets,type Typology,type Assignment,type SiteInput,type Zone,type Experiment,type Registry} from './model';
import {categoryByTypology,type SpaceCategory} from './typologyCategories';
import {currentTerritoryResult,compositionControls,generateTerritories,geometryKernel,type Result,type Controls,type Ring} from './territories';
import {useArchitecture} from './ArchitectureLayer';
import type {OrientationResult} from './orientationStore';
import styles from './workflow.module.css';

import {territoryColor,territoryInk} from './territoryPalette';
const path=(rings:Ring[])=>rings.map(r=>'M'+r.map(([x,z])=>x+','+(-z)).join('L')+'Z').join('');
function bounds(ring:Ring){
  const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const x=Math.min(...xs),y=-Math.max(...zs);
  return {x,y,w:Math.max(...xs)-x,h:-Math.min(...zs)-y};
}


type DistributionProps={site:SiteInput;zone:Zone;assignment:Assignment;controls:Controls;registry:Registry;
  category:SpaceCategory|'all';children:ReactNode;disabled:boolean;letterTargets?:LetterTargets;onLetterTarget:(type:Typology,count?:number)=>void};
export function CompositionDistribution({site,zone,assignment,controls,registry,category,children,disabled,letterTargets,onLetterTarget}:DistributionProps){
  const [plan,setPlan]=useState<Result>(),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(async()=>{
      try{
        const api=await geometryKernel();
        if(!active)return;
        const result=generateTerritories(api,site,zone,assignment,compositionControls(controls),'area',registry);
        if(!result.metrics.valid)throw Error('Allocation failed its area check.');
        setPlan(result);setError('');
      }catch(e){if(active){setPlan(undefined);setError(e instanceof Error?e.message:String(e));}}
    },100);
    return()=>{active=false;clearTimeout(timer);};
  },[site,zone,assignment,controls,registry]);
  const {x,y,w,h}=bounds(zone.polygon),pad=.04*Math.max(w,h);
  const visibleTerritories=plan?.territories.filter(t=>category==='all'||categoryByTypology[t.typology]===category)??[];
  return <><div className={styles.distribution}>{children}<figure className={styles.allocationPreview}>
    <figcaption>Allocation preview · {zone.name}</figcaption>
    {error?<small role="status">{error}</small>:<svg viewBox={[x-pad,y-pad,w+2*pad,h+2*pad].join(' ')} role="img" aria-label={'Allocation preview for '+zone.name}>
      <path d={path([zone.polygon,...zone.holes])} fill="#233e44" fillRule="evenodd"/>
      {plan?.territories.map(t=><path key={t.id} data-preview-type={t.typology} d={path(t.contours)} fill={territoryColor(t.typology)} stroke={territoryInk(territoryColor(t.typology))} vectorEffect="non-scaling-stroke"><title>{registry.items.find(r=>r.id===t.typology)?.name} · {t.achievedPercent.toFixed(1)}%</title></path>)}
    </svg>}
  </figure></div>
    {visibleTerritories.length>0&&<fieldset className={styles.inputs} disabled={disabled}>
      <legend>Letter density · {zone.name}</legend>
      <p className={styles.densityHint}>Automatic uses the typology rules. Set a manual target up to 100 letters. Step 4 reports the count that fits.</p>
      <div className={styles.densityFields}>{visibleTerritories.map(t=>{
        const id='letter-target-'+t.typology;
        const name=registry.items.find(item=>item.id===t.typology)!.name;
        const workspace=categoryByTypology[t.typology]==='Workspaces';
        const custom=letterTargets?.[t.typology];
        const auto=automaticLetterTarget(t.area), count=custom??Math.min(auto,maxLetterTarget);
        return <div key={id}>
          <label htmlFor={id}>{name}</label>
          <output htmlFor={id}>{custom===undefined?(workspace?'Automatic · by Workspace rules':t.typology==='linear-edge-gallery'?'Automatic · fit both perimeters':t.typology==='room-within-volume'?'Automatic · fit perimeter lofts':auto+' letters · Automatic'):count+' letters · Manual target'+(t.typology==='linear-edge-gallery'?' · complete perimeter courses take priority':'')}</output>
          <input id={id} type="range" min={isLobbyTypology(t.typology)?2:1} max={maxLetterTarget} step={1} value={count}
            aria-valuetext={custom===undefined?'Automatic':count+' source letters'} onChange={e=>onLetterTarget(t.typology,Number(e.currentTarget.value))}/>
          {custom===undefined&&<button type="button" className={styles.textButton} aria-label={'Set manual count for '+name} onClick={()=>onLetterTarget(t.typology,count)}>Set manual target</button>}
          {custom!==undefined&&<button type="button" className={styles.textButton} aria-label={'Use automatic count for '+name}
            onClick={()=>onLetterTarget(t.typology)}>Use auto</button>}
        </div>;
      })}</div>
    </fieldset>}
  </>;
}

// Project the saved world mesh using the same X/Z coordinates as the site.
function ArchitecturePlan({zone,record}:{zone:Zone;record:OrientationResult}){
  const {result,error}=useArchitecture(record);
  const canvas=useRef<HTMLCanvasElement>(null);
  const {x,y,w,h}=bounds(zone.polygon);
  useEffect(()=>{
    const el=canvas.current,ctx=el?.getContext('2d');
    if(!el||!ctx||!result)return;
    const scale=768/Math.max(w,h);
    el.width=Math.max(1,Math.ceil(w*scale));el.height=Math.max(1,Math.ceil(h*scale));
    ctx.scale(el.width/w,el.height/h);ctx.translate(-x,-y);
    if(result.planLayers){
      ctx.lineWidth=Math.max(w/el.width,h/el.height)*1.4;
      ctx.lineJoin='round';
      for(const layer of [...result.planLayers].sort((a,b)=>a.top-b.top)){
        const fill=territoryColor(layer.typology);
        ctx.beginPath();
        for(const ring of layer.contours){
          if(!ring.length)continue;
          ctx.moveTo(ring[0][0],-ring[0][1]);
          for(const [px,pz] of ring.slice(1))ctx.lineTo(px,-pz);
          ctx.closePath();
        }
        ctx.fillStyle=fill;ctx.fill('evenodd');
        ctx.strokeStyle=territoryInk(fill);ctx.stroke();
      }
      return;
    }
    const {positions,indices}=result.architecture;
    ctx.fillStyle='#F7F6F5';ctx.shadowColor='#073C52';ctx.shadowBlur=2;ctx.beginPath();
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const ax=positions[a],ay=-positions[a+2],bx=positions[b],by=-positions[b+2],cx=positions[c],cy=-positions[c+2];
      const cross=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(cross===0)continue;
      ctx.moveTo(ax,ay);
      if(cross>0){ctx.lineTo(bx,by);ctx.lineTo(cx,cy);}else{ctx.lineTo(cx,cy);ctx.lineTo(bx,by);}
      ctx.closePath();
    }
    ctx.fill();
  },[result,x,y,w,h]);
  return result?<foreignObject x={x} y={y} width={w} height={h} pointerEvents="none" data-architecture-zone={zone.id}><canvas ref={canvas} style={{display:'block',width:'100%',height:'100%'}} aria-label={zone.name+' architectural footprint'}/></foreignObject>:
    <text x={x+w/2} y={y+h/2} textAnchor="middle" fontSize={Math.min(w,h)*.07} fill="white">{error?'Geometry unavailable':'Loading geometry…'}</text>;
}

export default function SitePlan({state,site,focusZone,records,registry}:{registry?:Registry;state:Experiment;site:SiteInput;focusZone?:(zone:string)=>void;records?:Record<string,OrientationResult|undefined>}){
  if(!site.zones.length)return null;
  const {x,y,w,h}=bounds(site.zones.flatMap(z=>z.polygon)),pad=Math.max(w,h)*.05;
  const shownTypes=new Set<string>();
  return <><svg className={records?styles.combinedPlan:styles.zonePlan} viewBox={[x-pad,y-pad,w+2*pad,h+2*pad].join(' ')} role={focusZone?'group':'img'} aria-label={records?'Combined polygon results':'Site polygon boundaries'}>
    {site.zones.map(z=>{
      const stored=state.territoryByZone[z.id],area=stored?.results.area;
      const current=!!records&&area&&currentTerritoryResult(site,z,state.assignments[z.id]??newAssignment(),stored.controls,area);
      if(current)for(const t of area.territories)shownTypes.add(t.typology);
      const outline=path([z.polygon,...(z.holes??[])]);
      return <g key={z.id}><path d={outline} fill="#233e44" fillRule="evenodd"/>
        {current&&area.territories.map(t=><path key={t.id} data-territory={t.id} d={path(t.contours)} fill={territoryColor(t.typology)} stroke={territoryInk(territoryColor(t.typology))} strokeWidth="0.7" vectorEffect="non-scaling-stroke" fillRule="nonzero"><title>{z.name} · {t.typology} · {t.achievedPercent.toFixed(1)}%</title></path>)}
        {records?.[z.id]&&<ArchitecturePlan zone={z} record={records[z.id]!}/>}
        <path d={outline} fill="transparent" fillRule="evenodd" pointerEvents={focusZone?'visiblePainted':'none'} stroke={state.focus===z.id?'#F7F6F5':'#B9BEC6'} strokeWidth={state.focus===z.id?2.5:1.5} vectorEffect="non-scaling-stroke"
          role={focusZone?'button':undefined} tabIndex={focusZone?0:undefined} aria-label={focusZone?'Edit '+z.name:undefined} aria-pressed={focusZone?state.focus===z.id:undefined}
          onClick={focusZone?()=>focusZone(z.id):undefined} onKeyDown={e=>{if(focusZone&&(e.key==='Enter'||e.key===' ')){e.preventDefault();focusZone(z.id);}}}><title>{z.name}</title></path>
      </g>;
    })}
  </svg>{registry&&shownTypes.size>0&&<div className={styles.planKey} aria-label="Territory colors">{registry.items.filter(t=>shownTypes.has(t.id)).map(t=><span key={t.id}><i style={{background:territoryColor(t.id)}}/>{t.name}</span>)}</div>}</>;
}
