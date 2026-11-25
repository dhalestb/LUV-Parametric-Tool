import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {fingerprint,isLobbyTypology,newAssignment,type Experiment,type LetterTargets,type Registry,type SiteInput,type Zone} from './model';
import {allocationAreaTolerance,compositionControls,currentTerritoryResult,generateTerritories,geometryKernel,type Point,type Ring} from './territories';
import {siteHeightBands} from './compositionHeights';
import type {HeightRecord} from './SiteRulePanel';
import type {OrientationResult} from './orientationStore';
import {hashes,studyFor} from './allocatedDesign';
import {formLobby} from './lobbyFormation';
import {formTerritory,projectMesh,siteMesh,type FormationPart,type PlanLayer} from './continuousFormation';

const recipe='Continuous polygon composition';
type Plan=ReturnType<typeof generateTerritories>;

async function composeZone(api:ManifoldToplevel,site:SiteInput,zone:Zone,plan:Plan,registry:Registry,clustering:number,letterTargets:LetterTargets,
  rules:HeightRecord|null,runId:string,progress:(s:string)=>void){
  const owned:{delete():void}[]=[];
  function own<T extends {delete():void}>(s:T):T{owned.push(s);return s;}
  const xs=zone.polygon.map(p=>p[0]),zs=zone.polygon.map(p=>p[1]);
  const origin:Point=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
  const relative=(rings:Ring[])=>rings.map(r=>r.map(([x,z]):Point=>[x-origin[0],z-origin[1]]));
  const letters:OrientationResult['components']=[],components:FormationPart[]=[],planLayers:PlanLayer[]=[];
  const formed:Manifold[]=[],members=[];
  let sourceArea=0;
  try{
    const permitted=own(new api.CrossSection(relative(plan.permitted),'NonZero'));
    const envelope=siteHeightBands(api,site,zone,rules,permitted,origin,own);
    const datum=envelope.base;
    for(const t of plan.territories){
      const rule=registry.items.find(r=>r.id===t.typology)!;
      progress('Forming '+rule.name+' in '+zone.name+'…');
      await new Promise(resolve=>setTimeout(resolve,0));
      if(t.screen==='infeasible')throw Error(rule.name+' cannot meet its minimum planning diameter with this layout. Adjust its share or clustering.');
      const region=own(new api.CrossSection(relative(t.contours),'NonZero'));
      const bands=envelope.bands.filter(b=>own(region.intersect(b.section)).area()>1e-7);
      const cap=bands.length?Math.max(...bands.map(b=>b.cap)):envelope.zoneCap;
      const label:Point=[t.label[0]-origin[0],t.label[1]-origin[1]];
      const lobbyResult=isLobbyTypology(rule.id)
        ? await formLobby(rule.id,api,region,origin,datum,label,clustering,cap,bands,letterTargets[t.typology])
        : undefined;
      const result=lobbyResult??formTerritory(api,region,origin,datum,rule,await studyFor(rule.id),label,clustering,cap,bands,letterTargets[t.typology]);
      formed.push(own(result.solid));
      if(result.height>cap+1e-5)throw Error(rule.name+' exceeds the site height limit.');
      sourceArea+=result.sourceArea;letters.push(...result.letters);components.push(...result.parts);planLayers.push(...result.layers);
      members.push({typology:t.typology,name:rule.name,territory:t.id,allocatedPercent:t.requestedPercent,
        achievedPercent:100*result.footprintArea/plan.allocatableArea,territoryAreaFeet2:t.area,footprintAreaFeet2:result.footprintArea,
        missingFeet2:result.missing,outsideFeet2:result.outside,...(lobbyResult?{[lobbyResult.collection]:lobbyResult.placements}:{sourceStudyHash:hashes[t.typology]}),sourceCount:result.letters.length,letterTarget:result.letterTarget,
        sourceEntry:rule.A.entry,formationDimensions:rule.B.parameters,heightFeet:result.height,heightCapFeet:Number.isFinite(cap)?cap:null});
    }
    // The common lower course joins matching floor edges across typology seams.
    // Each member already passed its own footprint check before the joint union.
    const joint=own(permitted.extrude(.25));
    const final=own(api.Manifold.union([...formed,joint]));
    if(final.status()!=='NoError'||final.isEmpty())throw Error('Failed to join the polygon composition.');
    const bodies=final.decompose(),domains=permitted.decompose();
    const connectedBodies=bodies.filter(b=>b.volume()>1e-5).length;
    try{
      if(connectedBodies!==domains.length){
        const detached=bodies.filter(b=>b.volume()>1e-5).sort((a,b)=>a.volume()-b.volume())[0];
        throw Error('Architectural components do not meet across this polygon ('+detached.volume().toFixed(2)+' ft³ detached). Try a more clustered layout.');
      }
    }finally{bodies.forEach(b=>b.delete());domains.forEach(d=>d.delete());}
    const mesh=siteMesh(final,origin,datum),finished=own(projectMesh(api,mesh,origin)),footprint=finished.area();
    const outside=own(finished.subtract(permitted)).area(),missing=own(permitted.subtract(finished)).area();
    const protectedArea=plan.protected.length?own(finished.intersect(own(new api.CrossSection(relative(plan.protected),'NonZero')))).area():0;
    const tolerance=Math.max(.01,plan.allocatableArea*1e-6);
    if(Math.max(outside,missing,protectedArea)>tolerance)throw Error('Finished architecture failed the measured site area or protection check.');
    const heightRegions=envelope.bands.map(b=>{
      const prism=own(b.section.extrude(final.boundingBox().max[2]+1));
      const occupied=own(final.intersect(prism));
      const above=own(occupied.trimByPlane([0,0,1],b.cap+.0001));
      const excessArea=above.isEmpty()?0:own(above.project()).area();
      if(excessArea>Math.max(.001,b.section.area()*1e-8))
        throw Error('Finished architecture exceeds the '+b.role+' envelope over '+excessArea.toFixed(4)+' ft².');
      // Coincident faces at a stepped roof belong to both closed prisms.
      // Measure the local peak inside the band and audit excess over its full area above.
      const interior=own(b.section.offset(-.0001));
      const measured=own(final.intersect(own(interior.extrude(final.boundingBox().max[2]+1))));
      const builtFeet=measured.isEmpty()?0:measured.boundingBox().max[2];
      return {id:b.id,role:b.role,capFeet:b.cap,builtFeet,excessAreaFeet2:excessArea,areaFeet2:b.section.area()};
    });
    const provenance={heightPolicy:envelope.reference,heightRegions,entry:recipe,adapter:'polygon-composition/v1',runId,clustering,members,territorySignature:plan.signature,
      buildableAreaFeet2:plan.allocatableArea,grossAreaFeet2:plan.grossArea,areaBasis:'Horizontal projection of the finished architecture, including open court floors and terraces, measured against buildable polygon area.'};
    const id=crypto.randomUUID(),height=final.boundingBox().max[2];
    const orientation:OrientationResult={id,version:1,kind:'orientation-only',typologyId:'continuous-site',typologyName:zone.name+' · continuous composition',
      site,zoneId:zone.id,geometryHash:await fingerprint(letters),components:letters,layers:[],organizingEdges:[],
      counts:letters.reduce((n,l)=>{n[l.letter]++;return n;},{L:0,U:0,V:0}),
      parameters:{recipe,seed:plan.seed,spacing:0,heading:0,datum,field:{width:Math.max(...xs)-Math.min(...xs),depth:Math.max(...zs)-Math.min(...zs),height}},
      frame:{center:origin,angle:0,corners:zone.polygon},limitations:['Polygon-scale composition using native letter profiles and registered formation dimensions.'],
      validation:{outsideArea:outside,protectedArea,maxElevationError:0,grossArea:plan.grossArea,permittedArea:plan.allocatableArea,
        triangles:letters.reduce((n,l)=>n+l.mesh.indices.length/3,0),attempts:members.length,milliseconds:plan.metrics.milliseconds},provenance:{...provenance,B:{executed:false}}};
    const measurements={buildingFootprintFeet2:footprint,buildingCoveragePercent:100*footprint/plan.grossArea,sourceLetterCoveragePercent:100*sourceArea/plan.grossArea,
      expectationBuildingCoveragePercent:100*plan.allocatableArea/plan.grossArea,totalPrimaryFloorPlateAreaFeet2:null,exposedTerraceAreaFeet2:null,
      openSiteAreaFeet2:Math.max(0,plan.grossArea-footprint),registeredProtectedVoidAreaFeet2:plan.protectedArea};
    const architecture={id:crypto.randomUUID(),url:'',typologyName:orientation.typologyName,parentOrientationId:id,parentGeometryHash:orientation.geometryHash,
      geometryHash:await fingerprint(mesh),architecture:mesh,components,planLayers,site,zoneId:zone.id,provenance,measurements,
      validation:{allocatedHeightChecked:members.every(m=>m.heightCapFeet!==null),outsideArea:outside,protectedArea,footprintArea:footprint,
        areaToleranceFeet2:tolerance,missingFeet2:missing,connectedBodies,heightAboveDatum:height,triangles:mesh.indices.length/3}};
    return {orientation,architecture};
  }finally{owned.reverse().forEach(s=>s.delete());}
}

export async function generateContinuousSite(state:Experiment,registry:Registry,readRules:(s:SiteInput,id:string)=>HeightRecord|null,progress:(s:string)=>void){
  const site=state.site;
  if(!site?.protectionMetadataComplete)throw Error('Load the site polygons with their protection geometry.');
  const zones=site.zones.filter(z=>z.enabled);
  if(!zones.length)throw Error('Enable a site polygon before generating.');
  const api=await geometryKernel(),runId=crypto.randomUUID(),records=[],previous:CrossSection[]=[];
  const territoryByZone={...state.territoryByZone};
  try{
    for(const z of zones){
      try{
        const stored=territoryByZone[z.id],c=compositionControls(stored?.controls),assignment=state.assignments[z.id]??newAssignment();
        const saved=stored?.results.area;
        const plan=saved&&currentTerritoryResult(site,z,assignment,c,saved)?saved:generateTerritories(api,site,z,assignment,c,'area',registry);
        if(!plan.metrics.valid)throw Error('Area allocation failed its coverage checks.');
        const shape=new api.CrossSection(plan.permitted,'NonZero');
        for(const prior of previous){
          const overlap=shape.intersect(prior),area=overlap.area();overlap.delete();
          if(area>allocationAreaTolerance(plan.allocatableArea)){shape.delete();throw Error('Enabled polygons overlap. Each occupied area must belong to one polygon.');}
        }
        previous.push(shape);
        const letterTargets=state.generation?.zones[JSON.stringify([site.fingerprint,z.id])]?.letterTargets??{};
        records.push(await composeZone(api,site,z,plan,registry,c.clustering!,letterTargets,readRules(site,z.id),runId,progress));
        territoryByZone[z.id]={controls:c,results:{...stored?.results,area:plan}};
      }catch(e){throw new Error(z.name+' · '+(e instanceof Error?e.message:String(e)),{cause:e});}
    }
    return {records,territoryByZone};
  }finally{previous.forEach(s=>s.delete());}
}
