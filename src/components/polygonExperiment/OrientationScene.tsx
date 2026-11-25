'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArchitectureGeometry,useArchitecture} from './ArchitectureLayer';
import {useArchitecturalDisplay} from './architecturalDisplay';
import {Line} from '@react-three/drei';
import * as THREE from 'three';
import {importSite} from './model';
import type {SiteInput} from './model';
import {visibilityStatus} from './orientationPresentation';
import {LETTER_COLORS} from '../letterGeometry3d';
import {readSiteSelection,readOrientation,selectionDefault,type OrientationResult,type OrientationSelection} from './orientationStore';
function LetterMesh({component,sectionPlane}:{component:OrientationResult['components'][number];sectionPlane?:THREE.Plane}){const g=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(component.mesh.positions,3));g.setIndex(component.mesh.indices);g.computeVertexNormals();return g;},[component]);useEffect(()=>()=>g.dispose(),[g]);return <mesh name={component.id} geometry={g}><meshStandardMaterial clippingPlanes={sectionPlane?[sectionPlane]:[]} side={sectionPlane?THREE.DoubleSide:THREE.FrontSide} color={LETTER_COLORS[component.letter]}/></mesh>;}
export function OrientationGeometry({result,view,sectionPlane}:{result:OrientationResult;view:OrientationSelection;sectionPlane?:THREE.Plane}){const display=useArchitecturalDisplay(),z=result.site.zones.find(z=>z.id===result.zoneId);return <group name={'Rule-A-'+result.id}><ArchitectureGeometry orientation={result} sectionPlane={sectionPlane}/>{display.letters&&result.components.map(c=><LetterMesh key={c.id} component={c} sectionPlane={sectionPlane}/>)}{view.organizing&&<>{result.layers.map(l=><Line key={l.level} points={[...l.world,l.world[0]]} color='#D6AD4F' lineWidth={1}/>)}{result.organizingEdges.map(e=><Line key={e.id} points={e.points} color='#9BD5E4' lineWidth={2}/>)}</>}{view.boundaries&&z&&<><Line points={[...z.polygon,z.polygon[0]].map(p=>[p[0],result.parameters.datum,p[1]])} color='#9BD5E4' lineWidth={2}/>{[...result.site.exclusions.map(e=>e.polygon),...z.holes].map((r,i)=><Line key={i} points={[...r,r[0]].map(p=>[p[0],result.parameters.datum+.02,p[1]])} color='#D6AD4F' lineWidth={3}/>)}</>}</group>;}
export function useSiteOrientation(zones:{id:string;polygon:[number,number][]}[],sourceRaw:string){
 const [view,setView]=useState<OrientationSelection>(selectionDefault),[records,setRecords]=useState<OrientationResult[]>([]);
 const [site,setSite]=useState<SiteInput|null>(null),[loadedSource,setLoadedSource]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
   let sequence=0;
   async function load(){
     const n=++sequence;setLoading(true);
     try{
       const next=readSiteSelection();
       const ids=next.siteGroup?.length?next.siteGroup.map(s=>s.id):next.id?[next.id]:[];
       const [saved,source]=await Promise.all([Promise.all(ids.map(readOrientation)),importSite(sourceRaw,'file')]);
       if(n!==sequence)return;
       setView(next);setRecords(saved.filter((r):r is OrientationResult=>!!r));setSite(source);setLoadedSource(sourceRaw);setError('');
      }catch(e){
       if(n===sequence){setRecords([]);setSite(null);setLoadedSource(sourceRaw);setError('Cannot read saved orientation or Site source. '+String(e));}
     }
     finally{if(n===sequence)setLoading(false);}
   }
   void load();window.addEventListener('storage',load);window.addEventListener('luv-orientation-change',load);
   return()=>{sequence++;window.removeEventListener('storage',load);window.removeEventListener('luv-orientation-change',load);};
 },[sourceRaw]);
 const single=records.find(r=>r.id===view.id),architecture=useArchitecture(single),display=useArchitecturalDisplay();
 const effectiveView={...view,letters:display.letters},pending=loading||loadedSource!==sourceRaw;
 if(view.siteGroup?.length){
   const visible:OrientationResult[]=[],reasons:string[]=[];
   for(const item of view.siteGroup){
     const r=records.find(r=>r.id===item.id&&r.geometryHash===item.hash&&r.zoneId===item.zoneId);
     const status=visibilityStatus({...effectiveView,id:item.id},r,zones,site,pending,error,display.architecture);
     if(status.visible&&r)visible.push(r);else reasons.push(status.message);
   }
   return {records:visible,view:effectiveView,grouped:true,message:pending?'Checking the selected polygons…':
     'Combined site selection · '+visible.length+' of '+view.siteGroup.length+' designs visible. '+[...new Set(reasons)].join(' ')};
 }
 const status=visibilityStatus(effectiveView,single,zones,site,pending,error,!!architecture.result&&architecture.visible);
 const unavailable=display.architecture&&!architecture.result?' Rule B: '+(architecture.loading?'loading saved geometry.':architecture.error||'unavailable.'):'';
 return {records:status.visible&&single?[single]:[],view:effectiveView,grouped:false,message:status.message+unavailable};
}
