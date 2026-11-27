import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import {fingerprint,isLobbyTypology,newAssignment,type LobbyTypology,type Experiment,type Registry,type SiteInput,type Typology,type Zone} from './model';
import {currentTerritoryResult,defaults,generateTerritories,geometryKernel,signedArea,type Ring,type Point,type Territory} from './territories';
import type {OrientationResult} from './orientationStore';
import type {HeightRecord} from './SiteRulePanel';
import originalHashes from './allocated-study-hashes.json';
import stackHashes from './vertical-lobby-stacks.json';
import sequenceHashes from './compressed-lobby-sequences.json';
import fieldHashes from './topographic-lobby-fields.json';

import galleryHashes from './linear-lobby-galleries.json';

const referenceStudy:Record<LobbyTypology,string>={
  'vertical-void-lobby':'40-10','compressed-sequential-lobby':'20-15','topographic-ground-field-lobby':'60-15','linear-gallery-lobby':'reference-77'
};
export const lobbyStudyHashes:Record<LobbyTypology,Record<string,string>>={
  'vertical-void-lobby':stackHashes,'compressed-sequential-lobby':sequenceHashes,'topographic-ground-field-lobby':fieldHashes,'linear-gallery-lobby':galleryHashes
};
export const hashes={...originalHashes,'vertical-void-lobby':stackHashes['40-10'],'compressed-sequential-lobby':sequenceHashes['20-15'],'topographic-ground-field-lobby':fieldHashes['60-15'],'linear-gallery-lobby':galleryHashes['reference-77']};

type Mesh={positions:number[];indices:number[]};
type Letter=OrientationResult['components'][number];
type Part={id:string;sources:string[];mesh:Mesh};
type SavedTypology=keyof typeof hashes;
type Study={type:SavedTypology;datum:number;letters:Letter[];components:Part[];architecture:Mesh;envelope:Ring;
  metrics:{sourceArea:number;footprintArea:number};provenance:Record<string,unknown>};
type PreparedStudy=Study & {center:Point;height:number};
type Placement={heightCheck:{requiredFeet:number;siteCapFeet:number|null;zoneCapFeet:number|null;eligibleRegionIds:string[]};study:PreparedStudy;center:Point;angle:number;boundary:Ring;territory:Territory};
const cache=new Map<string,Promise<PreparedStudy>>();

async function loadStudy(type:SavedTypology,file:string,hash:string):Promise<PreparedStudy>{
  const response=await fetch('/allocated-studies/'+file+'.json.gz?v='+hash);
  if(!response.ok||!response.body)throw Error('Could not load the '+type+' architectural study.');
  const bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')!==hash)throw Error('Study integrity check failed for '+type);
  const study:Study=JSON.parse(new TextDecoder().decode(bytes));
  const {center}=bounds(study.envelope);
  let height=0;
  for(const mesh of [study.architecture,...study.letters.map(l=>l.mesh)]){
    for(let i=1;i<mesh.positions.length;i+=3)height=Math.max(height,mesh.positions[i]-study.datum);
  }
  return {...study,center,height};
}
function cachedStudy(type:SavedTypology,file:string,hash:string){
  if(!cache.has(file))cache.set(file,loadStudy(type,file,hash).catch(e=>{cache.delete(file);throw e;}));
  return cache.get(file)!;
}
export function lobbyStudy(type:LobbyTypology,height:number,count:number){
  const key=height+'-'+count;
  const hash=lobbyStudyHashes[type][key];
  if(!hash)throw Error('Unregistered field or population for '+type);
  return cachedStudy(type,type+'/'+key,hash);
}
export function studyFor(type:Typology){
  if(type==='flat-deep-plan-plate'||type==='open-hall-workspace'||type==='void-edge-workspace')throw Error('Use Generate Design to generate the live Workspace ruleset in this territory.');
  if(isLobbyTypology(type))return cachedStudy(type,type+'/'+referenceStudy[type],hashes[type]);
  return cachedStudy(type,type,hashes[type]);
}
function bounds(r:Ring){
  const xs=r.map(p=>p[0]),zs=r.map(p=>p[1]);
  const x=Math.min(...xs),z=Math.min(...zs),width=Math.max(...xs)-x,depth=Math.max(...zs)-z;
  return {x,z,width,depth,center:[x+width/2,z+depth/2] as Point};
}
function ringSection(api:ManifoldToplevel,r:Ring){return new api.CrossSection([signedArea(r)<0?[...r].reverse():r]);}
function rotate(x:number,z:number,c:number,s:number):Point{return [x*c-z*s,x*s+z*c];}

function place(api:ManifoldToplevel,study:PreparedStudy,t:Territory,prior:Ring[],site:SiteInput,zone:Zone,rules:HeightRecord|null):Placement|undefined {
  const owned:CrossSection[]=[];
  const own=(v:CrossSection)=>{owned.push(v);return v;};
  try{
    const siteCap=Number((site.constraints as {heightLimitFeet?:number}|null)?.heightLimitFeet??Infinity);
    const zoneCap=rules?.regions.length?Infinity:Number(zone.inputParameters.maxHeightFeet??Infinity);
    const heightCheck={requiredFeet:study.height,siteCapFeet:Number.isFinite(siteCap)?siteCap:null,zoneCapFeet:Number.isFinite(zoneCap)?zoneCap:null,
      eligibleRegionIds:(rules?.regions??[]).filter(r=>r.heightFeet+1e-6>=study.height).map(r=>r.id)};
    if(study.height>Math.min(siteCap,zoneCap)+1e-6)throw Error('The '+study.type+' study needs '+study.height.toFixed(1)+' ft of height.');
    let domain=own(new api.CrossSection(t.contours,'NonZero'));
    if(rules?.regions.length){
      const eligible:CrossSection[]=[],lower:CrossSection[]=[];
      for(const region of rules.regions){
        const section=own(ringSection(api,region.polygon as Ring));
        (region.heightFeet+1e-6>=study.height?eligible:lower).push(section);
      }
      domain=own(domain.intersect(own(api.CrossSection.union(eligible))));
      if(lower.length)domain=own(domain.subtract(own(api.CrossSection.union(lower))));
    }
    for(const r of prior)domain=own(domain.subtract(own(ringSection(api,r))));
    if(domain.isEmpty())return;
    const box=bounds(domain.toPolygons().flat() as Ring);
    const points:Point[]=[t.label,box.center];
    for(let i=0;i<=16;i++)for(let j=0;j<=16;j++)points.push([box.x+box.width*i/16,box.z+box.depth*j/16]);
    points.sort((a,b)=>Math.hypot(a[0]-t.label[0],a[1]-t.label[1])-Math.hypot(b[0]-t.label[0],b[1]-t.label[1]));
    const angles=new Set(Array.from({length:12},(_,i)=>15*i));
    for(const r of t.contours)for(let i=0;i<r.length;i++){
      const p=r[i],q=r[(i+1)%r.length];angles.add(Math.round(Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI));
    }
    for(const angle of angles){
      const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
      const local=study.envelope.map(p=>rotate(p[0]-study.center[0],p[1]-study.center[1],c,s));
      const extent=bounds(local);
      if(extent.width>box.width+1e-6||extent.depth>box.depth+1e-6)continue;
      const shape=own(ringSection(api,local));
      for(const center of points){
        const left=center[0]+extent.x,back=center[1]+extent.z;
        if(left<box.x-1e-6||back<box.z-1e-6||left+extent.width>box.x+box.width+1e-6||back+extent.depth>box.z+box.depth+1e-6)continue;
        const located=shape.translate(center),outside=located.subtract(domain);
        const fits=outside.area()<=1e-8;
        outside.delete();located.delete();
        if(fits)return {study,heightCheck,center,angle,territory:t,boundary:local.map(([x,z])=>[x+center[0],z+center[1]])};
      }
    }
  }finally{for(const shape of owned.reverse())shape.delete();}
}

function transformMesh(mesh:Mesh,p:Placement,datum:number):Mesh{
  const theta=p.angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),positions=[];
  for(let i=0;i<mesh.positions.length;i+=3){
    const [x,z]=rotate(mesh.positions[i]-p.study.center[0],mesh.positions[i+2]-p.study.center[1],c,s);
    positions.push(x+p.center[0],mesh.positions[i+1]-p.study.datum+datum,z+p.center[1]);
  }
  return {positions,indices:mesh.indices};
}

async function assemble(site:SiteInput,zone:Zone,plan:ReturnType<typeof generateTerritories>,placements:Placement[],runId:string){
  const datum=site.coordinates.elevationDatum,letters:Letter[]=[],parts:Part[]=[];
  const mesh:Mesh={positions:[],indices:[]},members=[];
  let footprint=0,sourceArea=0,height=0;
  for(const p of placements){
    const prefix=p.study.type+'/';
    for(const l of p.study.letters)letters.push({id:prefix+l.id,letter:l.letter,nominalSizeFeet:l.nominalSizeFeet,mesh:transformMesh(l.mesh,p,datum)});
    for(const c of p.study.components)parts.push({id:prefix+c.id,sources:c.sources.map(s=>prefix+s),mesh:transformMesh(c.mesh,p,datum)});
    const world=transformMesh(p.study.architecture,p,datum),offset=mesh.positions.length/3;
    for(const n of world.positions)mesh.positions.push(n);
    for(const i of world.indices)mesh.indices.push(i+offset);
    footprint+=p.study.metrics.footprintArea;sourceArea+=p.study.metrics.sourceArea;height=Math.max(height,p.study.height);
    members.push({typology:p.study.type,studyHash:hashes[p.study.type],source:p.study.provenance,territory:p.territory.id,allocatedPercent:p.territory.requestedPercent,
      territoryAreaFeet2:p.territory.area,footprintAreaFeet2:p.study.metrics.footprintArea,center:p.center,angle:p.angle,scale:1,heightCheck:p.heightCheck,placementBoundary:p.boundary});
  }
  const box=bounds(zone.polygon),id=crypto.randomUUID(),recipe='Allocated native typologies';
  const provenance={entry:'Independent native Rule A/B studies placed at full scale in allocated territories',runId,members,territorySignature:plan.signature};
  const orientation:OrientationResult={id,version:1,kind:'orientation-only',typologyId:'allocated-site',typologyName:zone.name+' · allocated typologies',
    site,zoneId:zone.id,geometryHash:await fingerprint(letters),components:letters,layers:[],organizingEdges:[],
    counts:letters.reduce((n,l)=>{n[l.letter]++;return n;},{L:0,U:0,V:0}),
    parameters:{recipe,seed:plan.seed,spacing:0,heading:0,datum,field:{width:box.width,depth:box.depth,height}},
    frame:{center:box.center,angle:0,corners:zone.polygon},limitations:['Each positive allocation receives one independent native study at its authored dimensions.'],
    validation:{outsideArea:0,protectedArea:0,maxElevationError:0,grossArea:plan.grossArea,permittedArea:plan.allocatableArea,
      triangles:letters.reduce((n,l)=>n+l.mesh.indices.length/3,0),attempts:placements.length,milliseconds:plan.metrics.milliseconds},provenance:{...provenance,B:{executed:false}}};
  const measurements={buildingFootprintFeet2:footprint,buildingCoveragePercent:100*footprint/plan.grossArea,sourceLetterCoveragePercent:100*sourceArea/plan.grossArea,
    expectationBuildingCoveragePercent:null,totalPrimaryFloorPlateAreaFeet2:null,exposedTerraceAreaFeet2:null,openSiteAreaFeet2:plan.grossArea-footprint,registeredProtectedVoidAreaFeet2:plan.protectedArea};
  const architecture={id:crypto.randomUUID(),url:'',typologyName:orientation.typologyName,parentOrientationId:id,parentGeometryHash:orientation.geometryHash,
    geometryHash:await fingerprint(mesh),architecture:mesh,components:parts,site,zoneId:zone.id,provenance,measurements,
    validation:{allocatedHeightChecked:placements.every(p=>p.heightCheck.siteCapFeet!==null||p.heightCheck.zoneCapFeet!==null||p.heightCheck.eligibleRegionIds.length>0),outsideArea:0,protectedArea:0,footprintArea:footprint,heightAboveDatum:height,triangles:mesh.indices.length/3}};
  return {orientation,architecture};
}
export async function generateAllocatedSite(state:Experiment,registry:Registry,readRules:(s:SiteInput,id:string)=>HeightRecord|null,progress:(s:string)=>void){
  const site=state.site;
  if(!site?.protectionMetadataComplete)throw Error('Load the site polygons and their protection geometry.');
  const zones=site.zones.filter(z=>z.enabled);
  if(!zones.length)throw Error('Enable a site polygon before generating.');
  const api=await geometryKernel(),runId=crypto.randomUUID(),records=[],prior:Ring[]=[];
  const territoryByZone={...state.territoryByZone};
  for(const zone of zones){
    const assignment=state.assignments[zone.id]??newAssignment(),stored=territoryByZone[zone.id],controls=stored?.controls??defaults();
    progress('Generating '+zone.name+'…');
    await new Promise(resolve=>setTimeout(resolve,0));
    try{
      const rules=readRules(site,zone.id);
      let missing='';
      for(const angle of new Set([controls.areaCutAngle??0,90,45,-45,0])){
        const c=angle===(controls.areaCutAngle??0)?controls:{...controls,areaCutAngle:angle};
        const saved=stored?.results.area;
        const plan=saved&&currentTerritoryResult(site,zone,assignment,c,saved)?saved:generateTerritories(api,site,zone,assignment,c,'area',registry);
        if(!plan.metrics.valid)throw Error('Area allocation failed its geometry checks.');
        const placements:Placement[]=[];
        for(const t of plan.territories){
          const p=place(api,await studyFor(t.typology),t,prior,site,zone,rules);
          if(!p||t.screen==='infeasible'){missing=registry.items.find(s=>s.id===t.typology)!.name;break;}
          placements.push(p);
        }
        if(placements.length!==plan.territories.length)continue;
        records.push(await assemble(site,zone,plan,placements,runId));
        prior.push(...placements.map(p=>p.boundary));
        territoryByZone[zone.id]={controls:c,results:{...stored?.results,area:plan}};
        missing='';break;
      }
      if(missing)throw Error(missing+' could not fit inside its allocation at native scale. Increase its share or edit the site constraints.');
    }catch(e){throw Error(zone.name+' · '+(e instanceof Error?e.message:String(e)));}
  }
  return {records,territoryByZone};
}
