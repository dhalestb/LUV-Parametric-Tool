import {normalizeWeights} from '../siteDevelopment/hybridization';
import {DESCRIPTOR_ALGORITHM_VERSION} from '../evaluations/descriptorV2';
import cohort from './hybrid-cohort.json';

export const descriptorNames = {
  openVolume:'Open Volume', visuallyConnected:'Visually Connected',
  circulationActivated:'Circulation Activated', verticallyIntegrated:'Vertically Integrated', centralized:'Centralized'
};
export type Descriptor = keyof typeof descriptorNames;
export type AreaShares = Partial<Record<Descriptor,number>>;
export const influenceVersion = 'site-rule-influence/plate-to-stepped-v1';

export function descriptorContributions(id: Descriptor) {
  if(cohort.version !== DESCRIPTOR_ALGORITHM_VERSION || !Object.hasOwn(descriptorNames,id))
    throw Error('Comparable verified descriptor measurements are unavailable');
  const ratings=cohort.forms.map(form=>{
    const score=form.scores[id];
    if(!Number.isFinite(score)||score<0||score>100) throw Error('Missing verified score for '+form.typology);
    return {typology:form.typology, geometryHash:form.geometryHash, score};
  });
  const plate=ratings.find(r=>r.typology==='inserted-plate'), stepped=ratings.find(r=>r.typology==='vertical-walls');
  if(!plate||!stepped||plate.score+stepped.score===0) throw Error('No positive comparable score for this pair');
  const [weight]=normalizeWeights([{id:'inserted-horizontal-plate',weight:plate.score},{id:'stepped-amphitheater',weight:stepped.score}]);
  return {descriptor:id,cohort:cohort.id,evaluationVersion:cohort.version,ratings,
    platePercent:weight.weight,steppedPercent:100-weight.weight};
}

export function descriptorRegions(shares: AreaShares) {
  if(!shares || typeof shares!=='object' || Array.isArray(shares) ||
    Object.keys(shares).some(key=>!Object.hasOwn(descriptorNames,key))) throw Error('Unsupported descriptor distribution');
  const regions=(Object.keys(descriptorNames) as Descriptor[]).map(id=>{
    const areaPercent=Object.hasOwn(shares,id)?shares[id]:0;
    if(typeof areaPercent!=='number'||!Number.isFinite(areaPercent)||areaPercent<0||areaPercent>100)
      throw Error('Descriptor area shares must be percentages');
    return {id,areaPercent};
  }).filter(region=>region.areaPercent>0).map(({id,areaPercent})=>({areaPercent,...descriptorContributions(id)}));
  if(Math.abs(regions.reduce((sum,r)=>sum+r.areaPercent,0)-100)>1e-8)
    throw Error('Descriptor areas must total 100%');
  return regions;
}
