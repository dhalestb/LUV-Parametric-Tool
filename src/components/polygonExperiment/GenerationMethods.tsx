'use client';

import {useEffect,useState,type ReactNode} from 'react';
import dynamic from 'next/dynamic';
import {descriptorNames,descriptorRegions,influenceVersion,type Descriptor,type AreaShares} from './descriptorInfluence';
import {type Experiment} from './model';
import {defaults as territoryDefaults} from './territories';
import {requestSiteWorker} from './workerClient';
import {readSiteRules} from './SiteRulePanel';
import {saveBrowserDesign} from './browserDesigns';
import {saveDesignReference} from './alternatives';
import {ensureSiteSelection,saveOrientation,selectionDefault,type OrientationResult} from './orientationStore';
import {useSiteHandoff} from './siteHandoffStore';
import {ArchitectureControls} from './ArchitectureLayer';
import cohort from './hybrid-cohort.json';

const OrientationView=dynamic(()=>import('./OrientationView'),{ssr:false});
const studies=[
  {name:'Independent Stepped Amphitheater',dir:cohort.forms[0].study},
  {name:'Independent Inserted Horizontal Plate',dir:cohort.forms[1].study},
  {name:'50% Plate / 50% Stepped proof',dir:'miami-plate-stepped-v1'}
];

function Comparison() {
  const [index,setIndex]=useState(2),[result,setResult]=useState<OrientationResult>(),[error,setError]=useState('');
  useEffect(()=>{
    const abort=new AbortController();
    setResult(undefined);setError('');
    fetch('/experiment-designs/'+studies[index].dir+'/rule-a.json',{signal:abort.signal})
      .then(r=>{if(!r.ok) throw Error('Study geometry unavailable');return r.json();})
      .then(data=>{if(!abort.signal.aborted)setResult(data);})
      .catch(e=>{if(!abort.signal.aborted)setError(String(e));});
    return ()=>abort.abort();
  },[index]);
  return <section aria-label="Miami comparison"><label>Compare Miami studies
    <select value={index} onChange={e=>setIndex(Number(e.target.value))}>{studies.map((s,i)=><option key={s.dir} value={i}>{s.name}</option>)}</select>
  </label>{error&&<p role="status">{error}</p>}{result&&<>
    <ArchitectureControls orientation={result}/><OrientationView result={result} view={selectionDefault}/>
    <details><summary>Source relationships and validation</summary><pre>{JSON.stringify(result.provenance.ruleInfluence??{entry:result.provenance.entry,sourceHash:result.geometryHash},null,2)}</pre></details>
  </>}</section>;
}

export default function GenerationMethods({state,children,onSaved}:{state:Experiment;children:ReactNode;onSaved:(result:OrientationResult)=>void}) {
  const [method,setMethod]=useState('typology-area'),[plate,setPlate]=useState(50);
  const [shares,setShares]=useState<AreaShares>({openVolume:100});
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[compare,setCompare]=useState(false);
  useEffect(()=>{
    const query=new URLSearchParams(window.location.search), requested=query.get('method');
    if(requested==='hybrid-rule'||requested==='descriptor')setMethod(requested);
    setCompare(query.get('compare')==='1');
  },[]);
  const handoff=useSiteHandoff(),site=state.site,zoneId=state.focus;
  const controls=(zoneId&&state.territoryByZone[zoneId]?.controls)||territoryDefaults();
  const clearance=Math.max(controls.minimumDiameter['vertical-walls'],controls.minimumDiameter['inserted-plate']);
  const compatible=site?.fingerprint==='662e7000dd4f4982c7205c443e24fb3dc05aca1fa7a77d1e910933c9b38bb637'&&zoneId==='zone-1-1210';
  let scoreError='',regions:ReturnType<typeof descriptorRegions>=[];
  if(method==='descriptor')try{regions=descriptorRegions(shares);}catch(e){scoreError=e instanceof Error?e.message:String(e);}

  async function generate(){
    if(!site||!zoneId||busy)return;
    setBusy(true);setNotice('Generating and replaying authentic geometry…');
    try{
      const request={generationMethod:method,domain:'selected-zone',site,zoneId,siteRulePlan:readSiteRules(site,zoneId),
        reserved:controls.reserved,planningDiameterFeet:clearance,...(method==='descriptor'?{descriptorAreas:shares}:
        {ruleInfluence:{version:influenceVersion,platePercent:plate,steppedPercent:100-plate}})};
      const response=await requestSiteWorker('/experiment/site-polygon-morphogenesis/design',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      const result=await response.json();
      if(!response.ok||result.status!=='complete'||!result.replay?.matched)throw Error(result.error||'Replay or formation failed');
      ensureSiteSelection();
      await saveBrowserDesign(result.orientation,result.architecture,result.payload);
      await saveOrientation(result.orientation);
      saveDesignReference(result);
      onSaved(result.orientation);
      setNotice('Saved '+result.orientation.id.slice(0,8)+' · '+result.orientation.components.length+' letters · '+
        result.architecture.components+' components · '+result.architecture.measurements.buildingCoveragePercent.toFixed(3)+'% footprint coverage · replay matched.');
    }catch(e){setNotice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }

  return <section id="site-generation-methods" aria-label="Site generation methods"><label>Generation method
    <select disabled={busy} value={method} onChange={e=>{setMethod(e.target.value);setNotice('');}}>
      <option value="typology-area">Typology Area Distribution</option><option value="hybrid-rule">Hybrid Rule Distribution</option>
      <option value="descriptor">Descriptor-Based Distribution</option>
    </select></label>
    <div hidden={method!=='typology-area'}>{children}</div>
    {method!=='typology-area'&&<fieldset disabled={busy}>
      <legend>{method==='descriptor'?'Descriptor area shares':'Typology rule influence'}</legend>
      <p>Miami Cluster Zone 1 · full permitted polygon · Roadways/Water 60/40/20-ft local caps · {clearance} ft planning diameter.
        Plate seed 39 guides the horizontal position of three Stepped lifts from seed 69. Each lift keeps its original letter spacing and orientation. Native Stepped Rule B forms the walls, terraces and openings.</p>
      {method==='hybrid-rule'?<label>Inserted Horizontal Plate influence %
        <input aria-label="Plate rule influence" type="number" min="1" max="99" value={plate} onChange={e=>setPlate(Number(e.target.value))}/>
        Stepped Amphitheater influence {100-plate}%</label>:<>
        <p>Measured independent Miami Rule B studies · Evaluations {cohort.version} · {cohort.forms[0].cellFeet}-ft voxels.
          Area shares divide the permitted polygon along the site X axis. Each lift takes its rule weights from the area of its source letters within each descriptor region. Every selected region requires source geometry.</p>
        {Object.entries(descriptorNames).map(([id,name])=><label key={id} style={{display:'inline-block',margin:6}}>{name} area %
          <input aria-label={name+' area percentage'} type="number" min="0" max="100" value={shares[id as Descriptor]??0}
            onChange={e=>setShares({...shares,[id]:Number(e.target.value)})}/></label>)}
        {scoreError?<p role="status">{scoreError}</p>:<table><thead><tr><th>Descriptor</th><th>Site area</th><th>Stepped score</th><th>Plate score</th><th>Stepped influence</th><th>Plate influence</th></tr></thead>
          <tbody>{regions.map(r=><tr key={r.descriptor}><td>{descriptorNames[r.descriptor]}</td><td>{r.areaPercent}%</td>
            {r.ratings.map(v=><td key={v.typology}>{v.score.toFixed(2)}</td>)}<td>{r.steppedPercent.toFixed(2)}%</td><td>{r.platePercent.toFixed(2)}%</td></tr>)}</tbody></table>}
      </>}
      {handoff.active&&<label><input type="checkbox" checked={handoff.enabled} onChange={e=>handoff.setEnabled(e.target.checked)}/>Use applied single-typology site handoff</label>}
      {handoff.enabled&&<p>Clear the applied handoff to select the full-zone hybrid domain. The saved handoff remains available.</p>}
      {!compatible&&<p>Load the Miami checkpoint and focus Cluster Zone 1 to use the verified pair.</p>}
      <button disabled={!compatible||handoff.enabled||!!scoreError||(method==='hybrid-rule'&&!(plate>0&&plate<100))} onClick={generate}>Generate and validate design</button>
      <p role="status">{notice}</p>
      <button aria-expanded={compare} onClick={()=>setCompare(!compare)}>{compare?'Close study comparison':'Compare independent and hybrid studies'}</button>
    </fieldset>}
    {method!=='typology-area'&&compare&&<Comparison/>}
  </section>;
}
