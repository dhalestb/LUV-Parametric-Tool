import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import {pointInPolygon,polygonCentroid} from '../siteDevelopment/geometry';
import type {SiteInput,Zone} from './model';
import type {HeightRecord} from './SiteRulePanel';
import {signedArea,type Point,type Ring} from './territories';
import map from './miami-height-regions.json';

export type HeightBand={id:string;role:string;cap:number;section:CrossSection};

function miamiScale(site:SiteInput){
  if(site.modelReference ? site.modelReference.id!=='miami-waterfront' : site.name!=='Miami waterfront study')return null;
  const declared=site.modelReference?.scale??site.coordinates.feetPerModel;
  for(const scale of new Set([declared,3.280839895,1])){
    const parcel:Ring=map.parcel.map(([x,z])=>[x*scale,z*scale]);
    if(site.zones.filter(z=>z.enabled).every(z=>pointInPolygon(polygonCentroid(z.polygon),parcel)))return scale;
  }
  return null;
}

export function siteHeightBands(api:ManifoldToplevel,site:SiteInput,zone:Zone,record:HeightRecord|null,
  permitted:CrossSection,origin:Point,own:<T extends {delete():void}>(s:T)=>T){
  const siteCap=Number((site.constraints as {heightLimitFeet?:number}|null)?.heightLimitFeet??Infinity);
  const zoneCap=Math.min(siteCap,Number(zone.inputParameters.maxHeightFeet??Infinity));
  const scale=miamiScale(site);
  const reference=record?.regions.length?'supplied regions':scale?'Miami road and water surfaces':'uniform limit';
  const tiers=record?.regions.length?record.regions.map(r=>({
    id:r.id,role:r.role,cap:Math.min(siteCap,r.heightFeet),rings:r.contours??[r.polygon],scale:1
  })):scale?map.regions.map(r=>({id:r.id,role:r.id,cap:Math.min(zoneCap,r.heightFeet),rings:r.contours,scale})):[];
  const bands:HeightBand[]=[];
  for(const tier of tiers){
    if(!Number.isFinite(tier.cap)||tier.cap<=0)throw Error('Invalid height for '+tier.id);
    const rings=tier.rings.map(r=>r.map(([x,z]):Point=>[x*tier.scale-origin[0],z*tier.scale-origin[1]]));
    if(rings.length===1&&signedArea(rings[0])<0)rings[0].reverse();
    const section=own(permitted.intersect(own(new api.CrossSection(rings,'NonZero'))));
    if(section.area()>1e-7)bands.push({id:tier.id,role:tier.role,cap:tier.cap,section});
  }
  if(tiers.length){
    const covered=own(api.CrossSection.union(bands.map(b=>b.section)));
    const tolerance=Math.max(1e-5,permitted.area()*1e-8);
    if(own(permitted.subtract(covered)).area()>tolerance)throw Error('Height regions leave buildable ground uncovered.');
    if(bands.reduce((a,b)=>a+b.section.area(),0)-covered.area()>tolerance)throw Error('Height regions overlap.');
  }
  return {reference,bands,zoneCap,base:scale?Math.max(site.coordinates.elevationDatum,map.base*scale):site.coordinates.elevationDatum};
}
