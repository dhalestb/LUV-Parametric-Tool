import {study135,plateStudyHash} from './insertedSitePlate';
import {officePlacement} from './model';
import {galleryWallJoints} from './galleryWallJoints';
import {formOffice,isOffice,type OfficeId} from './workspaceStudy';
import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {maxLetterTarget,fingerprint,isLobbyTypology,newAssignment,type Experiment,type MethodDrafts,type LetterTargets,type Registry,type SiteInput,type Zone} from './model';
import {allocationAreaTolerance,compositionControls,hallControls,currentTerritoryResult,generateTerritories,geometryKernel,type Point,type Ring} from './territories';
import {siteHeightBands} from './compositionHeights';
import type {HeightRecord} from './SiteRulePanel';
import type {OrientationResult} from './orientationStore';
import {hashes,studyFor} from './allocatedDesign';
import {flatDeepId,formFlatDeep} from './flatDeepFormation';
import {formBoundary} from './flatDeepBoundaryArchitecture';
import {formLobby} from './lobbyFormation';
import {formTerritory,projectMesh,siteMesh,type FormationPart,type PlanLayer} from './continuousFormation';

const recipe='Continuous polygon composition';
type Plan=ReturnType<typeof generateTerritories>;

async function composeZone(api:ManifoldToplevel,site:SiteInput,zone:Zone,plan:Plan,registry:Registry,clustering:number,letterTargets:LetterTargets,
  rules:HeightRecord|null,runId:string,progress:(s:string)=>void,distributed:boolean,extendLobbyTerritories:boolean,singleWorkspace=false,draft?:MethodDrafts,minimum=20,plateColumnLimit=5){
  const owned:{delete():void}[]=[];
  function own<T extends {delete():void}>(s:T):T{owned.push(s);return s;}
  const xs=zone.polygon.map(p=>p[0]),zs=zone.polygon.map(p=>p[1]);
  const origin:Point=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
  const relative=(rings:Ring[])=>rings.map(r=>r.map(([x,z]):Point=>[x-origin[0],z-origin[1]]));
  const letters:OrientationResult['components']=[],components:FormationPart[]=[],planLayers:PlanLayer[]=[];
  const formed:Manifold[]=[],members=[];
  let singleField:ReturnType<typeof formFlatDeep>['nativeField']['poses'][number]|undefined;
  let sourceArea=0,openArea=singleWorkspace?plan.allocatableArea-plan.territories[0].area:0;
  const hasWorkspace=plan.territories.some(t=>t.typology===flatDeepId||isOffice(t.typology));
  const otherOffice=plan.territories.some(t=>isOffice(t.typology));
  const adaptive=hasWorkspace&&draft?.flatDeepMode==='adaptive';
  const boundaryMode=hasWorkspace&&(draft?.flatDeepMode==='boundary'||draft?.flatDeepMode==='proportional');
  const hasLobbies=plan.territories.some(t=>isLobbyTypology(t.typology));
  const openLobbies=hasLobbies&&!extendLobbyTerritories;
  const openGround=openLobbies||hasWorkspace;
  const name=otherOffice?'Workspace composition':boundaryMode?'boundary-adaptive Flat-Deep composition':singleWorkspace?'Flat-Deep Plan Plate':hasWorkspace?(adaptive?'adaptive workspace composition':'native workspace composition'):openLobbies?(distributed?'distributed lobby letters':'compact lobby letters'):'continuous composition';
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
        ? await formLobby(rule.id,api,region,origin,datum,label,clustering,cap,bands,rule,letterTargets[t.typology],distributed,extendLobbyTerritories)
        : undefined;
      const target=letterTargets[t.typology], spread=draft?.distributeWorkspaceForms??false;
      if(target!==undefined&&(!Number.isInteger(target)||target<1||target>maxLetterTarget))throw Error(rule.name+' needs a manual letter target from 1 to '+maxLetterTarget+'.');
      const options={letterTarget:target,spread,coverage:draft?.flatDeepCoverage??100,setback:Math.max(draft?.flatDeepSetback??0,Number(zone.inputParameters.setbackFeet??0)),separation:Number(zone.inputParameters.minEdgeClearanceFeet??0),minimum};
      const boundary=t.typology===flatDeepId&&boundaryMode?formBoundary(api,region,origin,datum,bands,envelope.zoneCap,options,draft?.flatDeepMode==='proportional'):undefined;
      const workspace=t.typology===flatDeepId&&!boundaryMode?formFlatDeep(api,region,origin,datum,label,bands,envelope.zoneCap,adaptive?options:undefined,{target,spread,setback:options.setback}):undefined;
      const office=isOffice(t.typology)?formOffice(api,t.typology,officePlacement(draft,t.typology),region,origin,datum,bands,envelope.zoneCap,Number(zone.inputParameters.setbackFeet??0),target,spread,permitted.toPolygons()):undefined;
      if(office)openArea+=office.missing;
      const result=office??boundary??workspace??lobbyResult??formTerritory(api,region,origin,datum,rule,rule.id==='linear-edge-gallery'?{letters:[]}:rule.id==='inserted-plate'?await study135():await studyFor(rule.id),label,clustering,cap,bands,letterTargets[t.typology],plan.seed,plateColumnLimit);
      formed.push(own(result.solid));
      if(workspace){openArea+=workspace.missing;if(singleWorkspace&&workspace.nativeField.fieldCount===1)singleField=workspace.nativeField.poses[0];}
      if(boundary)openArea+=boundary.missing;
      if(openLobbies&&lobbyResult)openArea+=lobbyResult.missing;
      if(result.height>cap+1e-5)throw Error(rule.name+' exceeds the site height limit.');
      sourceArea+=result.sourceArea;letters.push(...result.letters);components.push(...result.parts);planLayers.push(...result.layers);
      members.push({typology:t.typology,name:rule.name,territory:t.id,allocatedPercent:t.requestedPercent,
        achievedPercent:100*result.footprintArea/plan.allocatableArea,territoryAreaFeet2:t.area,footprintAreaFeet2:result.footprintArea,
        missingFeet2:result.missing,outsideFeet2:result.outside,...(office?{office:office.office}:boundary?{boundary:boundary.boundary}:workspace?{nativeField:workspace.nativeField}:lobbyResult?{[lobbyResult.collection]:lobbyResult.placements,footprintCutFeet:lobbyResult.footprintCutFeet}:rule.id==='linear-edge-gallery'?{galleryAdapter:'site-print-contour/v2',horizontalRecessFeet:[0,.5,1,2],sourceCheckpoint:'a6493b62cb784e7ccacc327dbe8dc90a604f1e48'}:{sourceStudyHash:t.typology==='inserted-plate'?plateStudyHash:t.typology===flatDeepId||isOffice(t.typology)?undefined:hashes[t.typology]}),sourceCount:result.letters.length,letterTarget:result.letterTarget,
        sourceEntry:rule.id==='linear-edge-gallery'?'galleryCourses → native glyph exterior faces':boundary?'arrangeBoundaryLetters':rule.A.entry,formationDimensions:boundary?{entry:'buildBoundaryFromLetters',version:boundary.boundary.version}:rule.B.parameters,heightFeet:result.height,heightCapFeet:Number.isFinite(cap)?cap:null});
    }
    const gallery=plan.territories.find(t=>t.typology==='linear-edge-gallery');
    if(gallery&&plan.territories.length>1){
      const contours=relative(gallery.contours);
      const region=own(new api.CrossSection(contours,'NonZero'));
      const legal=envelope.bands.length?own(api.Manifold.union(envelope.bands.map(b=>own(own(region.intersect(b.section)).extrude(b.cap))))):own(region.extrude(Math.max(...members.map(m=>m.heightFeet))));
      let index=0;
      galleryWallJoints(api,contours,components,origin,datum,(body,sources)=>{
        const joint=own(body.intersect(legal));
        if(joint.volume()<.001)return;
        const id='linear-edge-gallery/shared-wall-'+(++index);
        formed.push(joint);components.push({id,sources,mesh:siteMesh(joint,origin,datum)});
        planLayers.push({name:id,typology:'linear-edge-gallery',top:joint.boundingBox().max[2],
          contours:own(joint.project()).toPolygons().map(r=>r.map(([x,y])=>[x+origin[0],y+origin[1]]))});
      });
    }
    // The common lower course joins matching floor edges across typology seams.
    // Each member already passed its own footprint check before the joint union.
    if(!openGround)formed.push(own(permitted.extrude(.25)));
    const final=own(api.Manifold.union(formed));
    if(final.status()!=='NoError'||final.isEmpty())throw Error('Failed to join the polygon composition.');
    const bodies=final.decompose(),domains=permitted.decompose();
    const connectedBodies=bodies.filter(b=>b.volume()>1e-5).length;
    try{
      if(!openGround&&connectedBodies!==domains.length){
        const detached=bodies.filter(b=>b.volume()>1e-5).sort((a,b)=>a.volume()-b.volume())[0];
        throw Error('Architectural components do not meet across this polygon ('+detached.volume().toFixed(2)+' ft³ detached). Try a more clustered layout.');
      }
    }finally{bodies.forEach(b=>b.delete());domains.forEach(d=>d.delete());}
    const mesh=siteMesh(final,origin,datum),finished=own(projectMesh(api,mesh,origin)),footprint=finished.area();
    const outside=own(finished.subtract(permitted)).area(),missing=own(permitted.subtract(finished)).area();
    const protectedArea=plan.protected.length?own(finished.intersect(own(new api.CrossSection(relative(plan.protected),'NonZero')))).area():0;
    const tolerance=Math.max(.01,plan.allocatableArea*1e-6);
    if(Math.max(outside,Math.abs(missing-openArea),protectedArea)>tolerance)throw Error('Finished site projection: '+outside.toFixed(4)+' ft² outside, '+protectedArea.toFixed(4)+' ft² protected, '+missing.toFixed(4)+' ft² open, '+openArea.toFixed(4)+' ft² expected open.');
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
    const provenance={...(hasWorkspace?{distributeWorkspaceForms:draft?.distributeWorkspaceForms??false}:{}),heightPolicy:envelope.reference,heightRegions,...(hasLobbies?{extendLobbyTerritories,lobbyLetterLayout:distributed?'distributed':'compact'}:{}),entry:otherOffice?'Workspace typology rules':boundaryMode?'Boundary-derived Flat-Deep plates':adaptive?'Adaptive Flat-Deep fields':hasWorkspace?'Repeated native Flat-Deep fields':openLobbies?'Native lobby letter groups':recipe,adapter:otherOffice?'workspace-site/v1':boundaryMode?(draft?.flatDeepMode==='proportional'?'flat-deep-boundary/1.1.0':'flat-deep-boundary/1.0.0'):adaptive?'flat-deep-adaptive-fields/v1':hasWorkspace?'flat-deep-packed-fields/v2.2.0':openLobbies?(distributed?'distributed-lobby-letters/v1':'native-lobby-letters/v1'):'polygon-composition/v1',runId,clustering,members,territorySignature:plan.signature,
      buildableAreaFeet2:plan.allocatableArea,grossAreaFeet2:plan.grossArea,areaBasis:hasWorkspace?'Built share is the measured architectural projection divided by buildable zone area. Field and unbuilt territory are excluded.':openLobbies?'Measured projection of the emitted forms over buildable polygon area. Open ground between lobby groups is excluded.':'Horizontal projection of the finished architecture, including open court floors and terraces, measured against buildable polygon area.'};
    const id=crypto.randomUUID(),height=final.boundingBox().max[2];
    const orientation:OrientationResult={id,version:1,kind:'orientation-only',typologyId:singleWorkspace?plan.territories[0].typology:'continuous-site',typologyName:zone.name+' · '+name,
      site,zoneId:zone.id,geometryHash:await fingerprint(letters),components:letters,layers:[],organizingEdges:[],
      counts:letters.reduce((n,l)=>{n[l.letter]++;return n;},{L:0,U:0,V:0}),
      parameters:{recipe:provenance.entry,seed:plan.seed,spacing:0,heading:singleField?.angleDegrees??0,datum,field:singleField?.fieldFeet??{width:Math.max(...xs)-Math.min(...xs),depth:Math.max(...zs)-Math.min(...zs),height}},
      frame:singleField?{center:singleField.center,angle:singleField.angleDegrees*Math.PI/180,corners:singleField.corners}:{center:origin,angle:0,corners:zone.polygon},limitations:['Polygon-scale composition using native letter profiles and registered formation dimensions.'],
      validation:{outsideArea:outside,protectedArea,maxElevationError:0,grossArea:plan.grossArea,permittedArea:plan.allocatableArea,
        triangles:letters.reduce((n,l)=>n+l.mesh.indices.length/3,0),attempts:members.length,milliseconds:plan.metrics.milliseconds},provenance:{...provenance,B:{executed:false}}};
    const measurements={buildingFootprintFeet2:footprint,buildingCoveragePercent:100*footprint/plan.grossArea,sourceLetterCoveragePercent:100*sourceArea/plan.grossArea,
      expectationBuildingCoveragePercent:openGround?null:100*plan.allocatableArea/plan.grossArea,totalPrimaryFloorPlateAreaFeet2:null,exposedTerraceAreaFeet2:null,
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
  const plateZones=zones.filter(z=>(state.assignments[z.id]?.shares['inserted-plate']??0)>0);
  if(plateZones.length>5)throw Error('Inserted Horizontal Plate needs at least one bearing column per occupied zone. Five columns are available across the site.');
  const columnBudget=new Map(plateZones.map(z=>[z.id,1]));
  const areaPerColumn=(z:Zone)=>z.areaFeet2*state.assignments[z.id].shares['inserted-plate']/(1+columnBudget.get(z.id)!);
  for(let i=plateZones.length;plateZones.length&&i<5;i++){
    const z=plateZones.reduce((a,b)=>areaPerColumn(a)>=areaPerColumn(b)?a:b);
    columnBudget.set(z.id,columnBudget.get(z.id)!+1);
  }
  const territoryByZone={...state.territoryByZone};
  try{
    for(const z of zones){
      try{
        const stored=territoryByZone[z.id],c=compositionControls(hallControls(stored?.controls,officePlacement(state.generation?.zones[JSON.stringify([site.fingerprint,z.id])],'open-hall-workspace')==='boundary')),assignment=state.assignments[z.id]??newAssignment();
        const saved=stored?.results.area;
        const plan=saved&&currentTerritoryResult(site,z,assignment,c,saved)?saved:generateTerritories(api,site,z,assignment,c,'area',registry);
        if(!plan.metrics.valid)throw Error('Area allocation failed its coverage checks.');
        const shape=new api.CrossSection(plan.permitted,'NonZero');
        for(const prior of previous){
          const overlap=shape.intersect(prior),area=overlap.area();overlap.delete();
          if(area>allocationAreaTolerance(plan.allocatableArea)){shape.delete();throw Error('Enabled polygons overlap. Each occupied area must belong to one polygon.');}
        }
        previous.push(shape);
        const draft=state.generation?.zones[JSON.stringify([site.fingerprint,z.id])];
        records.push(await composeZone(api,site,z,plan,registry,c.clustering!,draft?.letterTargets??{},readRules(site,z.id),runId,progress,
          state.lobbyLetterLayout==='distributed',draft?.extendLobbyTerritories??true,false,draft,c.minimumDiameter[flatDeepId],columnBudget.get(z.id)));
        territoryByZone[z.id]={controls:c,results:{...stored?.results,area:plan}};
      }catch(e){throw new Error(z.name+' · '+(e instanceof Error?e.message:String(e)),{cause:e});}
    }
    return {records,territoryByZone};
  }finally{previous.forEach(s=>s.delete());}
}

export async function generateSingleFlatDeep(state:Experiment,registry:Registry,zone:Zone,rules:HeightRecord|null,territoryId?:string,id:OfficeId|typeof flatDeepId=flatDeepId){
  const site=state.site;
  if(!site?.protectionMetadataComplete||!zone.enabled)throw Error('A current, enabled site polygon and its protected geometry are required.');
  const api=await geometryKernel(),stored=state.territoryByZone[zone.id],controls=compositionControls(hallControls(stored?.controls,officePlacement(state.generation?.zones[JSON.stringify([site.fingerprint,zone.id])],'open-hall-workspace')==='boundary'));
  const assignment=state.assignments[zone.id]??newAssignment();
  const plans=Object.values(stored?.results??{}).filter(p=>p&&currentTerritoryResult(site,zone,assignment,controls,p));
  const plan=plans.find(p=>p?.territories.some(t=>t.id===territoryId))??generateTerritories(api,site,zone,assignment,controls,'area',registry);
  const territory=plan.territories.find(t=>t.typology===id&&(!territoryId||t.id===territoryId));
  if(!territory||!plan.metrics.valid||(!territoryId&&territory.requestedPercent!==100))throw Error('Select a current Workspace territory or allocate 100% to the polygon.');
  const draft=state.generation?.zones[JSON.stringify([site.fingerprint,zone.id])];
  return composeZone(api,site,zone,{...plan,territories:[territory]},registry,controls.clustering!,draft?.letterTargets??{},rules,crypto.randomUUID(),()=>{},false,false,true,draft,controls.minimumDiameter[flatDeepId]);
}

