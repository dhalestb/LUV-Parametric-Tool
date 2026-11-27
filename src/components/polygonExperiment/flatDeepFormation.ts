import * as THREE from 'three';
import type {CrossSection, Manifold, ManifoldToplevel} from 'manifold-3d';
import {getLetterVolumeGeometry} from '../letterGeometry3d';
import {arrangeOfficeLetters} from './flatDeepRules/flat-deep-plan-plate';
import {buildOfficeWorkspace} from './flatDeepRules/flat-deep-plan-plate.geometry';
import {workspaceDualReports} from './flatDeepRules/reports';
import {reportRules} from './flatDeepRules/flat-deep-plan-plate.report';
import {arrangeAdaptiveFields,type AdaptiveOptions} from './flatDeepAdaptive';
import {packNativeFields,selectFields,type FieldPlacement} from './flatDeepPacking';
import {candidates, projectMesh, siteMesh, type Letter} from './continuousFormation';
import type {HeightBand} from './compositionHeights';
import type {Point} from './territories';

export const flatDeepId = 'flat-deep-plan-plate';
export const flatDeepCommit = 'd4d1242cacba09bf290af01367090f96e27cdb67';
const field = reportRules.defaultField;
type Own = <T extends {delete():void}>(value:T)=>T;

type Arrangement=ReturnType<typeof arrangeOfficeLetters>;
type Guide=Arrangement['placements'][number];

// The native planner already traces the wall panels from transformed vertical L tips.
// For the adaptive plan also recover both slab profiles and every pier from the actual L poses.
function bindAdaptivePlates({placements,officePlan}:Arrangement) {
  function tip(g:Guide):Point {
    const p=new THREE.Vector3(-.42*g.scale,-.45*g.scale,0)
      .applyEuler(new THREE.Euler(g.rx*Math.PI/180,g.ry*Math.PI/180,g.rz*Math.PI/180))
      .add(new THREE.Vector3(g.x,g.y,g.z));
    return [p.x,p.y];
  }
  const ground=placements.slice(0,4).map(tip),mezz=placements.slice(4,8).map(tip);
  let index=8;
  for(const p of officePlan.plates){
    let profile:Point[];
    if(p.role==='ground'||p.role==='roof')profile=ground;
    else if(p.role==='mezzanine')profile=mezz;
    else if(p.role==='support'){
      const g=placements[index++],dx=.42*g.scale,dy=.45*g.scale;
      profile=[[g.x-dx,g.y-dy],[g.x+dx,g.y-dy],[g.x+dx,g.y+dy],[g.x-dx,g.y+dy]];
    } else continue;
    if(profile.some(([x,y],i)=>Math.hypot(x-p.polygon[i][0],y-p.polygon[i][1])>1e-6))
      throw Error('Adaptive L guides do not match the approved plate or pier profile.');
    p.polygon=profile;
  }
  if(index+28!==placements.length)throw Error('Adaptive L guide role counts do not match the architectural plan.');
}

// The source worker uses a centred Z-up plan, lifted half a field for display.
export function buildNativeFlatDeep(api:ManifoldToplevel, own:Own, field=reportRules.defaultField, adaptive=false) {
  const arranged = arrangeOfficeLetters([],flatDeepId,12,[0,0,0],field);
  if(adaptive)bindAdaptivePlates(arranged);
  const {placements,officePlan}=arranged;
  const assembly = buildOfficeWorkspace(api,officePlan,own);
  if (!assembly.combined || !assembly.form) throw Error('Flat-Deep native assembly is incomplete.');
  const lift = (s:Manifold) => own(s.translate([0,0,field.height/2]));
  const solid = lift(assembly.combined);
  const {min,max} = solid.boundingBox();
  if (solid.status() !== 'NoError' || solid.isEmpty() || solid.volume() <= 0 ||
      min[0] < -field.width/2-.0001 || max[0] > field.width/2+.0001 ||
      min[1] < -field.depth/2-.0001 || max[1] > field.depth/2+.0001 ||
      min[2] < -.0001 || max[2] > field.height+.0001) throw Error('Invalid native Flat-Deep solid or field bounds.');
  const reports = workspaceDualReports(officePlan);
  const ag = reports.architecturalGeneration;
  const span = max.map((v,i)=>(v-min[i]).toFixed(2)).join(' × ');
  const limits = [field.width,field.depth,field.height].join(' × ');
  Object.assign(ag.rules[0],{status:'pass',measured:span,threshold:limits,units:'ft',
    evidence:[`Final solid bounds span ${span} ft inside the ${limits} ft field. No completed geometry was uniformly rescaled.`]});
  Object.assign(ag.rules[9],{status:'pass',evidence:[`The final union covers the planned slabs, piers and walls, has valid Manifold status and has ${solid.volume().toFixed(2)} ft³ of positive volume.`]});
  ag.overall = ag.rules.some(r=>r.hard && r.status==='fail')?'fail':
    ag.rules.some(r=>r.hard && r.status==='unverified')?'unverified':'pass';
  if ([reports.letterArrangement,ag].some(r=>r.overall!=='pass')) throw Error('Flat-Deep native ruleset validation failed.');
  return {field,solid,form:lift(assembly.form),walls:assembly.walls?lift(assembly.walls):null,placements,officePlan,reports};
}

function findFields(api:ManifoldToplevel,region:CrossSection,label:Point,bands:HeightBand[],zoneCap:number){
  if (zoneCap<field.height) throw Error(`Flat-Deep requires a ${field.height} ft native field. The zone height cap is ${zoneCap} ft.`);
  const low=bands.filter(b=>b.cap<field.height);
  const excluded=low.length?api.CrossSection.union(low.map(b=>b.section)):null;
  const domain=excluded?region.subtract(excluded):region;
  const rect=api.CrossSection.square([field.width,field.depth],true);
  try{
    if (domain.area()+1e-6<rect.area()) throw Error(`Flat-Deep needs ${rect.area()} ft² for the full 20 × 60 ft field. Only ${domain.area().toFixed(2)} ft² is available at the required height.`);
    const packed=packNativeFields(api,domain,field.width,field.depth);
    if(packed.length)return packed;
    const points=candidates(domain,label).sort((a,b)=>Math.hypot(a[0]-label[0],a[1]-label[1])-Math.hypot(b[0]-label[0],b[1]-label[1]));
    // Prefer the native heading, then its quarter turn, then intermediate headings.
    for (const angle of [0,90,15,30,45,60,75,105,120,135,150,165]){
      const oriented=rect.rotate(angle);
      try {for(const center of points){
        const placed=oriented.translate(center),outside=placed.subtract(domain);
        const fits=outside.area()<1e-7;
        outside.delete();placed.delete();
        if(fits)return [{angle,center}];
      }} finally {oriented.delete();}
    }
    throw Error('No tested orientation and position fits the complete 20 × 60 ft field within the buildable territory at 20 ft clear height.');
  }finally{rect.delete();if(domain!==region)domain.delete();excluded?.delete();}
}

function emitField(api:ManifoldToplevel,region:CrossSection,origin:Point,datum:number,
  {angle,center}:FieldPlacement,native:ReturnType<typeof buildNativeFlatDeep>,fieldNumber:number) {
  const field=native.field;
  const prefix='flat-deep-'+fieldNumber+'-';
  const owned:{delete():void}[]=[];
  const own:Own=value=>{owned.push(value);return value;};
  try {

    const place=(s:Manifold)=>own(own(s.rotate([0,0,angle])).translate([center[0],center[1],0]));
    const solid=place(native.solid);
    const rotation=new THREE.Matrix4().makeRotationZ(angle*Math.PI/180);
    const letters:Letter[]=native.placements.map((p,index)=>{
      const glyph=getLetterVolumeGeometry(p.letter,12),attr=glyph.getAttribute('position');
      const rad=THREE.MathUtils.degToRad;
      const pose=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z+field.height/2),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(p.rx),rad(p.ry),rad(p.rz),p.rotationOrder??'XYZ')),
        new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
      const v=new THREE.Vector3(),positions:number[]=[],indices:number[]=[];
      for(let i=0;i<attr.count;i++){
        v.fromBufferAttribute(attr,i).applyMatrix4(pose);
        if(Math.abs(v.x)>field.width/2 || Math.abs(v.y)>field.depth/2 || v.z<0 || v.z>field.height)throw Error(`L guide ${index+1} exceeds the native field.`);
        v.applyMatrix4(rotation);
        positions.push(origin[0]+center[0]+v.x,datum+v.z,origin[1]+center[1]+v.y);
      }
      const ix=(i:number)=>glyph.index?glyph.index.getX(i):i;
      for(let i=0;i<(glyph.index?.count??attr.count);i+=3)indices.push(ix(i),ix(i+2),ix(i+1));
      return {id:prefix+'L-'+(index+1),letter:p.letter,nominalSizeFeet:p.scale,mesh:{positions,indices}};
    });
    const source=own(api.CrossSection.union(letters.map(l=>own(projectMesh(api,l.mesh,origin)))));
    const footprint=own(projectMesh(api,siteMesh(solid,origin,datum),origin));
    const outside=own(footprint.subtract(region)).area(),letterOutside=own(source.subtract(region)).area();
    if(Math.max(outside,letterOutside)>.00001)throw Error('Native architecture or L guides extend outside their assigned territory.');
    const parts=[{id:'flat-deep-form',solid:native.form},...(native.walls?[{id:'flat-deep-walls',solid:native.walls}]:[])].map(p=>({
      id:prefix+p.id,mesh:siteMesh(place(p.solid),origin,datum),sources:letters.map(l=>l.id)}));
    const layers=native.officePlan.plates.map(p=>({name:prefix+p.id,typology:flatDeepId,top:datum+field.height/2+p.zTop,
      contours:[p.polygon.map(([x,y]):Point=>{const v=new THREE.Vector3(x,y,0).applyMatrix4(rotation);return [origin[0]+center[0]+v.x,origin[1]+center[1]+v.y];})]}));
    const fieldCenter:Point=[center[0]+origin[0],center[1]+origin[1]];
    const corners=([[-1,-1],[1,-1],[1,1],[-1,1]] as Point[]).map(([x,y]):Point=>{
      const v=new THREE.Vector3(x*field.width/2,y*field.depth/2,0).applyMatrix4(rotation);
      return [fieldCenter[0]+v.x,fieldCenter[1]+v.y];
    });
    const pose={center:fieldCenter,corners,angleDegrees:angle,datumFeet:datum,fieldFeet:field};
    return {solid:solid.translate([0,0,0]),letters,parts,layers,sourceArea:source.area(),height:solid.boundingBox().max[2],
      outside,pose,letterOutside};
  } finally {owned.reverse().forEach(x=>x.delete());}
}

export function formFlatDeep(api:ManifoldToplevel,region:CrossSection,origin:Point,datum:number,label:Point,bands:HeightBand[],zoneCap:number,adaptive?:AdaptiveOptions,policy?:{target?:number;spread?:boolean;setback:number}){
  const owned:{delete():void}[]=[];
  const own:Own=value=>{owned.push(value);return value;};
  try {
    const reference=adaptive?null:buildNativeFlatDeep(api,own);
    const placements=adaptive?arrangeAdaptiveFields(api,region,bands,zoneCap,adaptive):(()=>{
      const domain=policy&&policy.setback>0?own(region.offset(-policy.setback,'Miter')):region;
      const all=findFields(api,domain,label,bands,zoneCap);
      const count=policy?.target===undefined?all.length:Math.max(1,Math.round(policy.target/reference!.placements.length));
      return selectFields(all,count,!!policy?.spread).map(p=>({...p,field}));
    })();
    let expectedVolume=0;
    const fields=placements.map((placement,i)=>{
      const localOwned:{delete():void}[]=[];
      const localOwn:Own=value=>{localOwned.push(value);return value;};
      try {
      const native=reference??buildNativeFlatDeep(api,localOwn,placement.field,true);
      expectedVolume+=native.solid.volume();
      const result=emitField(api,region,origin,datum,placement,native,i+1);
      own(result.solid);
      return {...result,rulesets:native.reports};
      } finally {localOwned.reverse().forEach(v=>v.delete());}
    });
    const solid=own(api.Manifold.union(fields.map(f=>f.solid)));
    const volumeFeet3=solid.volume();
    if(solid.status()!=='NoError'||Math.abs(volumeFeet3-expectedVolume)>.001*fields.length)
      throw Error('The repeated Workspace solids failed the native volume check.');
    const footprint=own(projectMesh(api,siteMesh(solid,origin,datum),origin));
    const footprintArea=footprint.area(),outside=own(footprint.subtract(region)).area();
    const missing=own(region.subtract(footprint)).area();
    const letters=fields.flatMap(f=>f.letters);
    return {solid:solid.translate([0,0,0]),letters,parts:fields.flatMap(f=>f.parts),layers:fields.flatMap(f=>f.layers),
      sourceArea:fields.reduce((a,f)=>a+f.sourceArea,0),height:solid.boundingBox().max[2],outside,missing,footprintArea,letterTarget:policy?.target??letters.length,
      nativeField:{sourceCommit:flatDeepCommit,version:reportRules.version,poses:fields.map(f=>f.pose),fieldCount:fields.length,
        ...(adaptive?{method:'adaptive',options:adaptive,fieldReports:fields.map(f=>f.rulesets)}:{}),
        fieldAreaFeet2:placements.reduce((total,p)=>total+p.field.width*p.field.depth,0),territoryCoveragePercent:100*footprintArea/region.area(),
        letterOutsideFeet2:fields.reduce((a,f)=>a+f.letterOutside,0),volumeFeet3,rulesets:fields[0].rulesets}};
  } finally {owned.reverse().forEach(x=>x.delete());}
}
