import {fingerprint,importSite,newAssignment,withImportedSite,type Experiment,type Registry,type SiteInput} from './model';
import {currentTerritoryResult,generateTerritories,geometryKernel} from './territories';

const isFeet=(site:SiteInput)=>site.coordinates.unit==='feet'&&site.coordinates.feetPerModel===1;

// A saved study may predate the source-model unit selection. All polygon rings are already in site feet.
function samePlan(a:SiteInput,b:SiteInput){
  const plan=(s:SiteInput)=>[s.name,s.coordinates.origin,s.coordinates.elevationDatum,s.coordinates.northDeg,
    s.coordinates.rhinoZToGltfY,s.zones.map(z=>[z.id,z.polygon,z.holes,z.enabled]),
    s.exclusions,s.corridors,s.reservedAreas,s.protectionMetadataComplete];
  return JSON.stringify(plan(a))===JSON.stringify(plan(b));
}

export async function syncSiteFeet(state:Experiment,registry:Registry,raw:string|null):Promise<Experiment>{
  const old=state.site;
  if(!old||isFeet(old)&&old.coordinates.unitAssumption==='confirmed'&&state.unitsConfirmed)return state;
  let next=isFeet(old)?old:null;
  if(!next&&raw&&old.origin==='file'){
    const project=JSON.parse(raw);
    if(project.coordinates?.unit==='feet'&&project.coordinates.feetPerModel===1&&project.name===old.name){
      const live=await importSite(raw,'file');
      if(samePlan(old,live))next=live;
    }
  }
  return next?applyStudyUnits(state,registry,next):state;
}

export async function applyStudyUnits(state:Experiment,registry:Registry,source:SiteInput):Promise<Experiment>{
  const old=state.site;
  if(!old)return state;
  let next=source;
  if(next.coordinates.unitAssumption!=='confirmed'){
    const coordinates={...next.coordinates,unitAssumption:'confirmed' as const};
    next={...next,coordinates,unitConfirmation:{sourceFingerprint:next.fingerprint,sourceRevision:next.revision},
      revision:next.revision+':confirmed-units',fingerprint:await fingerprint({source:next.fingerprint,coordinates})};
  }
  if(next.fingerprint===old.fingerprint&&next.revision===old.revision)return {...state,unitsConfirmed:true};
  const updated=withImportedSite(state,next);
  // Reservations and clearance controls use the same world-foot coordinates as the rings.
  for(const zone of next.zones){
    const saved=state.territoryByZone[zone.id];
    if(!saved)continue;
    const prior=old.zones.find(z=>z.id===zone.id)!;
    const assignment=updated.assignments[zone.id]??newAssignment();
    const entry={controls:saved.controls,results:{} as typeof saved.results};
    for(const strategy of ['area','geometry'] as const){
      const result=saved.results[strategy];
      if(!result||!currentTerritoryResult(old,prior,assignment,saved.controls,result))continue;
      const fresh=generateTerritories(await geometryKernel(),next,zone,assignment,saved.controls,strategy,registry);
      if(!fresh.metrics.valid)throw Error('Could not validate the prepared territories for '+zone.name+'.');
      entry.results[strategy]=fresh;
    }
    updated.territoryByZone[zone.id]=entry;
  }
  return {...updated,focus:state.focus,selected:state.selected};
}
