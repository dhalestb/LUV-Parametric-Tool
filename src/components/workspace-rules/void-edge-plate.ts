import * as THREE from 'three';
import {getLetterShape,getLetterVolumeGeometry} from '../letterGeometry3d';
import type {IntersectionPlacement} from '../architecturalConnections';
import type {OfficeField,OfficePlan,OfficePlate,Pt,VoidEdgeWallGuide} from './contracts';
import {halfPlane,intersectFootprints,thickenWallArc} from './void-edge-planar';
import {voidEdgeRules,voidEdgeBaseRotations,voidEdgeColumnGuideSize,voidEdgeMainGuideGroups,voidEdgeStoryLayout,voidEdgeWallGuideSettings} from './void-edge-workspace.rules';

const {guides:guideRules,stack:stackRules,field:fieldRules,thickness:thicknessRules,walls:wallRules,columns:columnRules}=voidEdgeRules;
export const VOID_EDGE_OUTER_WALL_THICKNESS=thicknessRules.outerWall;

/** Opposing U profiles establish the extents used by the smooth elliptical plate. */
export function buildVoidEdgeGuides(field:OfficeField,size:number=guideRules.mainEnd.defaultSize,sideSize?:number,baseRotation=0):IntersectionPlacement[] {
  if(!Number.isFinite(size)||size<=0)throw Error('Plate U size must be positive.');
  const geometry=getLetterVolumeGeometry('U',12);
  geometry.computeBoundingBox();
  const box=geometry.boundingBox!;
  const width=(box.max.x-box.min.x)*size, depth=(box.max.y-box.min.y)*size;
  if(width>field.width-guideRules.fieldClearance||depth>field.depth-guideRules.fieldClearance)throw Error('Plate U letters cannot fit inside the selected field. Choose a smaller U size or enlarge the field.');
  const offset=Math.min(size*guideRules.offsetRatio,(field.depth-depth-guideRules.fieldClearance)/2);
  // Measure the cached float mesh rather than assuming an exact .14 ft depth.
  // A small inset keeps its lowest vertex strictly above the worker's floor plane.
  const scaleZ=guideRules.newGuideDepth/(size*(box.max.z-box.min.z));
  const z=-field.height/2+guideRules.centerAboveDatum;
  const guides:IntersectionPlacement[]=[0,1].map(i=>({letter:guideRules.letter,x:0,y:i===0?-offset:offset,z,rx:0,ry:0,rz:i===0?0:180,scale:size,scaleX:1,scaleY:1,scaleZ}));
  if(sideSize!==undefined){
    if(!Number.isFinite(sideSize)||sideSize<=0)throw Error('Side U size must be positive.');
    const sideWidth=(box.max.y-box.min.y)*sideSize,sideDepth=(box.max.x-box.min.x)*sideSize;
    if(sideWidth>field.width-guideRules.fieldClearance||sideDepth>field.depth-guideRules.fieldClearance)throw Error('Side U letters cannot fit inside the selected field. Choose a smaller side U size or enlarge the field.');
    const sideOffset=Math.min(sideSize*guideRules.offsetRatio,(field.width-sideWidth-guideRules.fieldClearance)/2);
    for(const i of [0,1])guides.push({letter:guideRules.letter,x:i===0?-sideOffset:sideOffset,y:0,z,rx:0,ry:0,rz:i===0?270:90,scale:sideSize,scaleX:1,scaleY:1,scaleZ:guideRules.newGuideDepth/(sideSize*(box.max.z-box.min.z))});
  }
  return rotateGuides(guides,baseRotation);
}

function rotateGuides(guides:IntersectionPlacement[],rotation:number){
  const increment=guideRules.rotationIncrement;
  if(!Number.isFinite(rotation)||Math.abs(rotation/increment-Math.round(rotation/increment))>1e-8)throw Error(`Base rotation must use ${increment} degree increments.`);
  return guides.map(p=>{
    const delta=rotation-(p.voidEdgeRotation??0),angle=delta*Math.PI/180;
    return {...p,x:delta?p.x*Math.cos(angle)-p.y*Math.sin(angle):p.x,y:delta?p.x*Math.sin(angle)+p.y*Math.cos(angle):p.y,rz:p.rz+delta,voidEdgeRotation:rotation};
  });
}

function guideTransform(p: IntersectionPlacement,z=p.z){
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x,p.y,z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx*Math.PI/180,p.ry*Math.PI/180,p.rz*Math.PI/180,p.rotationOrder??'XYZ')),
    new THREE.Vector3(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ),
  );
}

/** Find the base angles for which all fresh main U groups and their plates fit in plan. */
export function voidEdgeFittingRotations(field:OfficeField,topSize:number,sideSize:number):number[] {
  let guides:IntersectionPlacement[];
  try{guides=buildVoidEdgeGuides(field,topSize,sideSize);}
  catch{return [];}
  const vertices=getLetterVolumeGeometry(guideRules.letter,12).getAttribute('position');
  const xy=new Map<string,Pt>();
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),y=vertices.getY(i);
    xy.set(`${x},${y}`,[x,y]);
  }
  const points=guides.flatMap(guide=>{
    const matrix=guideTransform(guide);
    return Array.from(xy.values(),([x,y]):Pt=>{
      const p=new THREE.Vector3(x,y,0).applyMatrix4(matrix);
      return [p.x,p.y];
    });
  });
  let polygon:Pt[];
  try{({polygon}=plateEllipse(points,0));}
  catch{return [];}
  const outline=[...points,...polygon];
  const halfWidth=field.width/2+fieldRules.guideTolerance,halfDepth=field.depth/2+fieldRules.guideTolerance;
  const fits=new Set(voidEdgeBaseRotations.filter(rotation=>{
    const angle=THREE.MathUtils.degToRad(rotation),cos=Math.cos(angle),sin=Math.sin(angle);
    return outline.every(([x,y])=>Math.abs(x*cos-y*sin)<=halfWidth&&Math.abs(x*sin+y*cos)<=halfDepth);
  }));
  const rotationStep=stackRules.intermediateRotations[field.height]??stackRules.fallbackRotation;
  const offsets=voidEdgeStoryLayout(field.height).map(({index})=>rotationStep*index);
  return voidEdgeBaseRotations.filter(rotation=>offsets.every(offset=>fits.has((rotation+offset)%360)));
}

function voidEdgePlateLayer(source:IntersectionPlacement[],field:OfficeField,rotation=0) {
  if(![guideRules.legacyCount,guideRules.currentCount].some(count=>count===source.length)||source.some(p=>p.letter!==guideRules.letter))throw Error('Generate a new Void-Edge design to create opposing U plate guides.');
  const tolerance=fieldRules.guideTolerance;
  // Recover previously saved guides whose floor contact differs only by float rounding.
  source=source.map(p=>{
    const matrix=guideTransform(p,p.z+field.height/2);
    const vertices=getLetterVolumeGeometry('U',12).getAttribute('position');
    let low=Infinity;
    for(let i=0;i<vertices.count;i++)low=Math.min(low,new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(matrix).z);
    return low<0&&low>=-tolerance?{...p,z:p.z-low+guideRules.floorCorrection}:p;
  });
  const points:Pt[]=[];
  for(const p of source){
    const matrix=guideTransform(p);
    const vertices=getLetterVolumeGeometry('U',12).getAttribute('position');
    for(let i=0;i<vertices.count;i++){
      const v=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(matrix);
      if(Math.abs(v.x)>field.width/2+tolerance||Math.abs(v.y)>field.depth/2+tolerance||v.z < -field.height/2-tolerance||v.z>field.height/2+tolerance)throw Error('Plate U guide extends outside the selected field. Reduce its size or edit its placement.');
      const angle=-rotation*Math.PI/180;
      points.push([v.x*Math.cos(angle)-v.y*Math.sin(angle),v.x*Math.sin(angle)+v.y*Math.cos(angle)]);
    }
  }
  const {polygon,rx,ry}=plateEllipse(points,rotation);
  if(polygon.some(([x,y])=>Math.abs(x)>field.width/2+tolerance||Math.abs(y)>field.depth/2+tolerance))throw Error('A rotated plate extends outside the field. Enlarge the field or reduce the plate U sizes.');
  const officePlan:OfficePlan={typology:'void-edge-workspace',rotation:0,plates:[{id:'u-derived-floor',role:'ground',polygon,zTop:-field.height/2+thicknessRules.slab,thickness:thicknessRules.slab}],voids:[],links:[],slots:[],checks:[{label:'U plate guides',status:'pass',detail:`${source.length} placed U profiles define the ellipse extents: ${(rx*2).toFixed(2)} × ${(ry*2).toFixed(2)} ft.`},{label:'Field envelope',status:'pass',detail:'The elliptical plate shares the measured U guide extents and fits the selected field.'}],operations:['Smooth elliptical floor plate sized from the placed U guides’ outer X/Y extents. Existing ratio, opening, circulation and headroom targets are suspended.']};
  return {placements:source,sequence:source.map((_,i)=>i),preservedPairs:[] as number[][],overlapFractions:[] as number[],riseFractions:[] as number[],officePlan,operations:officePlan.operations,supported:true,sourcePolicy:'opposing-u-outer-boundary'};
}

function plateEllipse(points:Pt[],rotation:number) {
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,rx=(maxX-minX)/2,ry=(maxY-minY)/2;
  if(rx<=1e-4||ry<=1e-4)throw Error('The U guides do not define a plate boundary.');
  // Uniform angular sampling preserves a single ellipse without guide-shaped bulges.
  // Cardinal samples keep its width and length exactly tied to the measured U extents.
  const polygon:Pt[]=Array.from({length:stackRules.ellipseSamples},(_,i)=>{
    const angle=i*Math.PI*2/stackRules.ellipseSamples;
    const x=cx+rx*Math.cos(angle),y=cy+ry*Math.sin(angle),turn=rotation*Math.PI/180;
    return [x*Math.cos(turn)-y*Math.sin(turn),x*Math.sin(turn)+y*Math.cos(turn)];
  });
  return {polygon,rx,ry};
}

function coreOpening(polygon: Pt[], rotation: number, wall: number): Pt[] {
  const angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const local:Pt[]=polygon.map(([x,y])=>[x*c+y*s,-x*s+y*c]);
  const xs=local.map(p=>p[0]),ys=local.map(p=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const rx=(Math.max(...xs)-Math.min(...xs))/2,ry=(Math.max(...ys)-Math.min(...ys))/2;
  if(wall>=Math.min(rx*rx/ry,ry*ry/rx))throw Error('Core wall thickness is too large for this ellipse. Reduce wall thickness or enlarge the core.');
  return local.map(([x,y])=>{
    const nx=(x-cx)/(rx*rx),ny=(y-cy)/(ry*ry),len=Math.hypot(nx,ny);
    const ix=x-wall*nx/len,iy=y-wall*ny/len;
    return [ix*c-iy*s,ix*s+iy*c];
  });
}

function plateCenter({polygon}: OfficePlate): Pt {
  const a=polygon[0],b=polygon[polygon.length/2];
  return [(a[0]+b[0])/2,(a[1]+b[1])/2];
}

function fitsInsidePlate(polygon:Pt[], plate:OfficePlate) {
  return polygon.every(([x,y])=>plate.polygon.every((a,i)=>{
    const b=plate.polygon[(i+1)%plate.polygon.length];
    return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>1e-8;
  }));
}

function filledColumnBounds(letter:IntersectionPlacement['letter']) {
  return new THREE.Box2().setFromPoints(getLetterShape(letter).getPoints(16)).getSize(new THREE.Vector2());
}

function columnGuideProfile(guide:IntersectionPlacement,bounds:THREE.Vector2):Pt[] {
  const halfX=bounds.x*guide.scale*guide.scaleX/2,halfY=bounds.y*guide.scale*guide.scaleY/2;
  const corners:Pt[]=[[-halfX,-halfY],[halfX,-halfY],[halfX,halfY],[-halfX,halfY]];
  const angle=THREE.MathUtils.degToRad(guide.rz),cos=Math.cos(angle),sin=Math.sin(angle);
  return corners.map(([x,y])=>[guide.x+cos*x-sin*y,guide.y+sin*x+cos*y]);
}

function dropColumnsFromCore(
  datum:number, lower:OfficePlate, upper:OfficePlate, core:OfficePlate,
  coreGuides:IntersectionPlacement[], openings:OfficePlan['voids'], size:number,
) {
  const uBounds=new THREE.Box2().setFromPoints(getLetterShape(guideRules.letter).getPoints(16));
  const uCenter=uBounds.getCenter(new THREE.Vector2());
  const tips=[uBounds.min.x,uBounds.max.x].map(x=>new THREE.Vector3(x-uCenter.x,uBounds.max.y-uCenter.y,0));
  const letterBounds=filledColumnBounds(columnRules.letter);
  const bounds=letterBounds.clone().multiplyScalar(size);
  const footprint:Pt[]=[[-bounds.x/2,-bounds.y/2],[bounds.x/2,-bounds.y/2],[bounds.x/2,bounds.y/2],[-bounds.x/2,bounds.y/2]];
  const turn=THREE.MathUtils.degToRad(columnRules.lowerRotation),cos=Math.cos(turn),sin=Math.sin(turn);
  const lowerFootprint=footprint.map(([a,b]):Pt=>[a*cos-b*sin,a*sin+b*cos]);
  const seats=[{slab:upper,footprint},{slab:lower,footprint:lowerFootprint}].map(({slab,footprint})=>{
    const xs=footprint.map(p=>p[0]),ys=footprint.map(p=>p[1]);
    return {
      holes:openings.filter(hole=>hole.plateIds?.includes(slab.id)),
      minX:Math.min(...xs),maxX:Math.max(...xs),halfY:Math.max(...ys),
    };
  });
  const geometry=getLetterVolumeGeometry(columnRules.letter,12);
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const letterDepth=Math.min(columnRules.guideDepth,upper.thickness/2);
  const scaleZ=letterDepth/(size*(geometry.boundingBox!.max.z-geometry.boundingBox!.min.z));
  const center=new THREE.Vector2(...plateCenter(core));
  const top=upper.zTop-upper.thickness/2,bottom=lower.zTop-lower.thickness/2;
  const clearance=columnRules.openingClearance;
  const columns:OfficePlate[]=[],placements:IntersectionPlacement[]=[];
  let shifted=0;
  for(const u of coreGuides.slice(0,columnRules.endGuideCount)){
    const matrix=guideTransform(u);
    for(const tip of tips){
      const point=tip.clone().applyMatrix4(matrix);
      const outward=new THREE.Vector2(point.x,point.y).sub(center);
      if(outward.length()<fieldRules.guideTolerance)throw Error('Void-Edge workspace ruleset: a core U endpoint cannot orient a column. Move the core U away from the opening center.');
      outward.normalize();
      const tangent=new THREE.Vector2(-outward.y,outward.x);
      const radial=point.x*outward.x+point.y*outward.y,side=point.x*tangent.x+point.y*tangent.y;
      // Clear the opening within each seat's radial strip, including the rotated lower footprint.
      const blocked=seats.flatMap(({holes,minX,maxX,halfY})=>holes.flatMap(({polygon})=>{
        const strip=halfPlane(halfPlane(polygon,tangent.x,tangent.y,side+halfY,true),
          tangent.x,tangent.y,side-halfY,false);
        if(!strip.length)return [];
        const reach=strip.map(([x,y])=>x*outward.x+y*outward.y);
        return [{start:Math.min(...reach)-maxX,end:Math.max(...reach)-minX}];
      })).sort((a,b)=>a.start-b.start);
      const initialCenter=radial+bounds.x/2;
      let radialCenter=initialCenter;
      for(const {start,end} of blocked)if(radialCenter>start-clearance&&radialCenter<end+clearance)radialCenter=end+clearance;
      if(radialCenter>initialCenter)shifted++;
      const x=point.x+outward.x*(radialCenter-radial),y=point.y+outward.y*(radialCenter-radial);
      const rz=THREE.MathUtils.radToDeg(Math.atan2(outward.y,outward.x));
      const guide={letter:columnRules.letter,voidEdgeRole:'column' as const,x,y,rx:0,ry:0,scale:size,scaleX:1,scaleY:1,scaleZ};
      const upperGuide={...guide,voidEdgePlateDatum:datum+stackRules.spacing,z:top,rz};
      const lowerGuide={...guide,voidEdgePlateDatum:datum,z:bottom,rz:rz+columnRules.lowerRotation};
      const polygon=columnGuideProfile(lowerGuide,letterBounds),upperPolygon=columnGuideProfile(upperGuide,letterBounds);
      const id=`core-end-column-${datum}-${columns.length+1}`;
      if(!fitsInsidePlate(polygon,lower)||!fitsInsidePlate(upperPolygon,upper)||columns.some(column=>
        intersectFootprints(polygon,column.polygon).length>=3||intersectFootprints(upperPolygon,column.loft!.upperPolygon).length>=3)){
        throw Error(`Void-Edge workspace ruleset: the four core-end columns above ${datum} ft need separate solid landings on both plates. Reduce the column L size or adjust the core U guides.`);
      }
      placements.push(upperGuide,lowerGuide);
      columns.push({id,role:'column',polygon,zTop:upperGuide.z,thickness:upperGuide.z-lowerGuide.z,columnReceivers:[lower.id,upper.id],
        loft:{upperPolygon,lowerSeat:lower.thickness/2,upperSeat:upper.thickness/2}});
    }
  }
  return {columns,placements,shifted};
}

function wallGuides(guides: IntersectionPlacement[],plate: OfficePlate) {
  const [bottom,top,left,right]=guides;
  if(left&&right)return {bottom,top,left,right};
  // Recover the side bends from a quarter-turn of the bottom U in older two-guide studies.
  const [x,y]=plateCenter(plate);
  const dx=bottom.x-x,dy=bottom.y-y;
  return {
    bottom,top,
    left:{...bottom,x:x+dy,y:y-dx,rz:bottom.rz-90},
    right:{...bottom,x:x-dy,y:y+dx,rz:bottom.rz+90},
  };
}

function outerUBend() {
  const shape=getLetterShape('U');
  const center=new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
  const bend=new THREE.CurvePath<THREE.Vector2>();
  bend.add(shape.curves[1]);
  bend.add(shape.curves[2]);
  return {bend,center};
}

function wallBendSampler({bend,center}:ReturnType<typeof outerUBend>) {
  const {profileIntervals}=wallRules;
  return (span:number)=>Array.from({length:profileIntervals+1},(_,i)=>
    bend.getPointAt(0.5+span*(i/profileIntervals-0.5)).sub(center));
}

function verticalBendDepths(bend:THREE.CurvePath<THREE.Vector2>):number[] {
  const start=bend.getPoint(0),end=bend.getPoint(1),count=wallRules.loftIntervals;
  return Array.from({length:count+1},(_,index)=>{
    if(index===0||index===count)return 0;
    const fraction=index/count;
    const x=THREE.MathUtils.lerp(start.x,end.x,fraction);
    // The sideways U's original X axis is now vertical. Sample its bend at equal heights.
    let low=0,high=1;
    for(let step=0;step<24;step++){
      const t=(low+high)/2;
      if(bend.getPoint(t).x<x)low=t;
      else high=t;
    }
    return THREE.MathUtils.lerp(start.y,end.y,fraction)-bend.getPoint((low+high)/2).y;
  });
}

function wallBowFromGuide(guide:IntersectionPlacement,depths:number[]) {
  // The normalized height stations map the guide's bend to the story. Depth is relative
  // to the bend chord, so translation cancels and both plate connections stay fixed.
  const depthAxis=new THREE.Vector3(0,-1,0).transformDirection(guideTransform(guide));
  const axis:Pt=[depthAxis.x,depthAxis.y];
  return {axis,offsets:depths.map(depth=>depth*guide.scale*guide.scaleY)};
}

function placeVerticalWallGuide(
  id:string, lower:OfficePlate, upper:OfficePlate, lowerArc:Pt[], upperArc:Pt[],
  {size,direction}:VoidEdgeWallGuide, bendApex:THREE.Vector2, bowDepth:number, field:OfficeField,
) {
  const station=wallRules.profileIntervals/2;
  const midpoint=new THREE.Vector2(...lowerArc[station]).lerp(new THREE.Vector2(...upperArc[station]),0.5);
  const center=new THREE.Vector2(...plateCenter(lower)).lerp(new THREE.Vector2(...plateCenter(upper)),0.5);
  const outward=midpoint.clone().sub(center);
  if(outward.length()<=fieldRules.guideTolerance)throw Error(`Void-Edge workspace ruleset: no vertical section could be placed for ${id}. Adjust its horizontal U guides.`);
  outward.normalize();
  const opening=outward.clone().multiplyScalar(direction==='inward'?1:-1);
  const geometry=getLetterVolumeGeometry(guideRules.letter,12);
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const box=geometry.boundingBox!;
  const seat=lower.zTop,ceiling=upper.zTop-upper.thickness;
  const depth=wallRules.verticalGuide.displayDepth;
  const scaleX=Math.min(1,(ceiling-seat-guideRules.fieldClearance)/((box.max.x-box.min.x)*size));
  const reference=midpoint.addScaledVector(opening,-bowDepth);
  // Register the outside bend to the exterior wall surface, using the letter origin only for its transform.
  const anchor=reference.clone().addScaledVector(opening,-bendApex.y*size);
  const tolerance=fieldRules.guideTolerance;
  if(Math.abs(reference.x)>field.width/2+tolerance||Math.abs(reference.y)>field.depth/2+tolerance){
    throw Error(`Void-Edge workspace ruleset: the vertical U bend for ${id} reaches outside the selected field. Reduce the vertical wall U size, bow inward, or enlarge the field.`);
  }
  const guide:IntersectionPlacement={
    voidEdgeRole:'wall',voidEdgeWallId:id,letter:guideRules.letter,
    x:anchor.x,y:anchor.y,z:(seat+ceiling)/2-bendApex.x*size*scaleX,
    rx:0,ry:-90,rz:THREE.MathUtils.radToDeg(Math.atan2(-opening.x,opening.y)),rotationOrder:'ZYX',
    scale:size,scaleX,
    scaleY:1,scaleZ:depth/((box.max.z-box.min.z)*size),
  };
  return guide;
}

function projectBendToPlate(bend: THREE.Vector2[], guide: IntersectionPlacement,plate: OfficePlate): Pt[] | null {
  const matrix=guideTransform(guide);
  const [cx,cy]=plateCenter(plate);
  const rays=bend.map(point=>{
    const p=new THREE.Vector3(point.x,point.y,0).applyMatrix4(matrix);
    return [p.x-cx,p.y-cy] as Pt;
  });
  const turns=rays.slice(1).map(([x,y],i)=>rays[i][0]*y-rays[i][1]*x);
  const direction=Math.sign(turns.reduce((sum,turn)=>sum+turn,0));
  if(!direction||turns.some(turn=>turn*direction<=1e-8))return null;
  if(direction<0)rays.reverse();
  return rays.map(([dx,dy]):Pt=>{
    let distance=Infinity;
    for(const [i,[x,y]] of plate.polygon.entries()){
      const [nextX,nextY]=plate.polygon[(i+1)%plate.polygon.length];
      const nx=nextY-y,ny=x-nextX;
      const rate=nx*dx+ny*dy;
      if(rate>0)distance=Math.min(distance,(nx*(x-cx)+ny*(y-cy))/rate);
    }
    if(!Number.isFinite(distance))throw Error('A U bend could not be projected to its plate edge. Adjust the guide position.');
    return [cx+dx*distance,cy+dy*distance];
  });
}

function wallArcStations(arc: readonly Pt[]): number[] {
  const distances=[0];
  for(let i=1;i<arc.length;i++)distances.push(distances[i-1]+Math.hypot(arc[i][0]-arc[i-1][0],arc[i][1]-arc[i-1][1]));
  return distances;
}

function resampleWallArc(arc: Pt[]): Pt[] {
  const distances=wallArcStations(arc),length=distances[distances.length-1];
  // Use evenly spaced samples so the offset has no tiny edges between near-coincident stations.
  const sections=wallRules.profileIntervals;
  return Array.from({length:sections+1},(_,index):Pt=>{
    const station=index/sections*length;
    const after=distances.findIndex(distance=>distance>=station);
    if(after<=0)return arc[after===0?0:arc.length-1];
    const t=(station-distances[after-1])/(distances[after]-distances[after-1]);
    const a=arc[after-1],b=arc[after];
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  });
}

function wallArcsAtPlate(plate:OfficePlate, guides:ReturnType<typeof wallGuides>,sampleBend:ReturnType<typeof wallBendSampler>) {
  const perimeter=wallArcStations([...plate.polygon,plate.polygon[0]]).at(-1)!;
  const sides=wallRules.pairings.map(([side])=>side);
  const {perimeterCoverage,coverageTolerance}=wallRules;
  let low=0,high=1;
  // Widen both ends of each bend by the same fraction, preserving the guide sizes, poses and pairings.
  while(high-low>coverageTolerance/10){
    const span=(low+high)/2;
    const bend=sampleBend(span);
    const projected=sides.map(side=>projectBendToPlate(bend,guides[side],plate));
    if(projected.some(arc=>arc===null)){
      high=span;
      continue;
    }
    const arcs=projected.map(arc=>resampleWallArc(arc!));
    const coverage=arcs.reduce((total,arc)=>total+wallArcStations(arc).at(-1)!,0)/perimeter;
    if(Math.abs(coverage-perimeterCoverage)<=coverageTolerance){
      return {arcs:Object.fromEntries(sides.map((side,index)=>[side,arcs[index]])),coverage};
    }
    if(coverage<perimeterCoverage)low=span;
    else high=span;
  }
  throw Error(`Void-Edge workspace ruleset: the U bends at ${plate.id} could not cover ${perimeterCoverage*100}% of the perimeter. Move the U guides toward the perimeter or turn their bends outward.`);
}

/** Build each intermediate plate and its opening from separate main and core U guides. */
export function voidEdgePlate(source:IntersectionPlacement[],field:OfficeField) {
  const columnSize=voidEdgeColumnGuideSize(field.voidEdgeColumnSize,source);
  if(!Number.isFinite(columnSize)||columnSize<columnRules.minimumSize){
    throw Error(`Void-Edge workspace ruleset: enter a column L size of at least ${columnRules.minimumSize} ft.`);
  }
  const savedCore=source.filter(p=>p.voidEdgeRole==='core');
  const {main,tagged:usesDatums,ground:floorGuides,roof:savedRoof}=voidEdgeMainGuideGroups(source);
  const groupSize=floorGuides.length;
  if(![guideRules.legacyCount,guideRules.currentCount].some(count=>count===groupSize)||main.length%groupSize)throw Error('Generate a new Void-Edge design to create the plate guides.');
  // Older saves without source height can be recovered when both end groups match a known height.
  const savedHeight=field.voidEdgeSourceHeight??fieldRules.sizes.find(height=>
    savedRoof.length===groupSize
    &&floorGuides.every(p=>Math.abs(p.z+height/2-guideRules.centerAboveDatum)<=fieldRules.guideTolerance)
    &&savedRoof.every(p=>Math.abs(p.z-height/2-guideRules.centerAboveDatum+stackRules.roofGuideClearance)<=fieldRules.guideTolerance));
  const heightShift=(field.height-(savedHeight??field.height))/2;
  const moveEnd=(guides:IntersectionPlacement[],change:number)=>change?guides.map(p=>({...p,z:p.z+change})):guides;
  const baseRotation=field.voidEdgeRotation??main[0].voidEdgeRotation??0;
  const floorSource=rotateGuides(moveEnd(floorGuides,-heightShift),baseRotation);
  const floor=voidEdgePlateLayer(floorSource,field,baseRotation);
  const roofSource=savedRoof.length?moveEnd(savedRoof,heightShift):floor.placements.map(p=>({...p,z:p.z+field.height-stackRules.roofGuideClearance}));
  const roof=voidEdgePlateLayer(rotateGuides(roofSource,baseRotation),field,baseRotation);
  const officePlan=floor.officePlan;
  const mainGuideGroups=[floor.placements];
  const placements:IntersectionPlacement[]=floor.placements.map(p=>({...p,voidEdgePlateDatum:0}));
  const plateSpacing=stackRules.spacing;
  const step=stackRules.intermediateRotations[field.height]??stackRules.fallbackRotation;
  const stories=voidEdgeStoryLayout(field.height);
  const intermediateStories=stories.slice(1);
  const rises=intermediateStories.map(story=>story.datum);
  const savedMiddle=!usesDatums&&savedRoof.length?main.slice(groupSize,-groupSize):[];
  let retainedMainGroups=1+Number(savedRoof.length===groupSize);
  let retainedCoreGroups=0;
  for(const [index,rise] of rises.entries()){
    const savedGuides=usesDatums?main.filter(p=>p.voidEdgePlateDatum===rise):savedMiddle.slice(index*groupSize,(index+1)*groupSize);
    const retain=(usesDatums||savedMiddle.length===rises.length*groupSize)&&savedGuides.length===groupSize;
    const guides=retain?savedGuides:floor.placements;
    if(retain)retainedMainGroups++;
    // The ten-foot datum controls Z; each saved layer retains its edited XY poses and sizes.
    const rotation=baseRotation+step*(index+1);
    const rotated=rotateGuides(guides,rotation).map(p=>({...p,z:-field.height/2+rise+guideRules.centerAboveDatum}));
    const layer=voidEdgePlateLayer(rotated,field,rotation);
    mainGuideGroups.push(layer.placements);
    officePlan.plates.push({...layer.officePlan.plates[0],id:`u-derived-level-${rise}`,role:'mezzanine',zTop:-field.height/2+rise+thicknessRules.slab});
    placements.push(...layer.placements.map(p=>({...p,voidEdgePlateDatum:rise})));
  }
  const roofTop=field.height/2-stackRules.roofSetback;
  officePlan.plates.push({...roof.officePlan.plates[0],id:'u-derived-roof',role:'roof',zTop:roofTop});
  placements.push(...roof.placements.map(p=>({...p,voidEdgePlateDatum:'roof' as const})));
  // Reuse a saved profile at missing levels, including older saves with one group at the floor.
  const savedCoreDatum=savedCore[0]?.voidEdgePlateDatum;
  const savedCoreProfile=savedCore.filter(p=>p.voidEdgePlateDatum===savedCoreDatum);
  const fallbackCore=savedCoreProfile.length===guideRules.currentCount
    ?savedCoreProfile
    :buildVoidEdgeGuides(field,field.voidEdgeCore?.topSize??guideRules.coreEnd.defaultSize,field.voidEdgeCore?.sideSize??guideRules.coreSide.defaultSize);
  const wall=field.voidEdgeCore?.wallThickness??thicknessRules.core,slab=field.voidEdgeCore?.slabThickness??thicknessRules.slab;
  if(!Number.isFinite(wall)||wall<=0||!Number.isFinite(slab)||slab<=0||slab>=thicknessRules.slabLimit)throw Error(`Wall and slab thickness must be positive. Slab thickness must be less than ${thicknessRules.slabLimit} ft.`);
  const outerThickness=field.voidEdgeOuterWallThickness??VOID_EDGE_OUTER_WALL_THICKNESS;
  if(!Number.isFinite(outerThickness)||outerThickness<=0)throw Error('Outer wall thickness must be a positive number.');
  const mainPlates=[...officePlan.plates];
  for(const plate of mainPlates){
    if(plate.role!=='roof')plate.zTop+=slab-thicknessRules.slab;
    plate.thickness=slab;
  }
  const coresAtDatum=new Map<number,{outline:OfficePlate;guides:IntersectionPlacement[]}>();
  for(const {index,datum:rise,kind} of intermediateStories){
    const bottom=-field.height/2+rise;
    const savedGuides=savedCore.filter(p=>p.voidEdgePlateDatum===rise);
    const retain=savedGuides.length===guideRules.currentCount;
    if(retain)retainedCoreGroups++;
    const guides=rotateGuides(retain?savedGuides:fallbackCore,baseRotation)
      .map(p=>({...p,z:bottom+slab/2,voidEdgeRole:'core' as const,voidEdgePlateDatum:rise}));
    const core=voidEdgePlateLayer(guides,field,baseRotation);
    const outline=core.officePlan.plates[0];
    const polygon=outline.polygon;
    coresAtDatum.set(rise,{outline,guides:core.placements});
    const host=mainPlates[index];
    const plateIds=[host.id];
    const receivingPlates=[host];
    if(kind==='core'){
      const id=`elliptical-core-${rise}`;
      const zTop=Math.min(bottom+plateSpacing,roofTop);
      officePlan.plates.push({id,role:'support',polygon,zTop,thickness:zTop-bottom});
      plateIds.push(id);
      receivingPlates.push(mainPlates[index+1]);
    }
    if(receivingPlates.some(plate=>!fitsInsidePlate(polygon,plate)))throw Error(`The core must fit inside its receiving plates at ${rise} ft. Reduce the core U sizes or enlarge the plate guides.`);
    officePlan.voids.push({id:`core-interior-${rise}`,polygon:coreOpening(polygon,baseRotation,wall),cut:true,plateIds});
    placements.push(...core.placements);
  }
  const wallGuide=voidEdgeWallGuideSettings(field.voidEdgeWallGuide);
  if(!Number.isFinite(wallGuide.size)||wallGuide.size<=0||!['inward','outward'].includes(wallGuide.direction)){
    throw Error('Void-Edge workspace ruleset: choose a positive vertical wall U size and an inward or outward bow.');
  }
  const outsideBend=outerUBend();
  const sampleBend=wallBendSampler(outsideBend);
  const bendDepths=verticalBendDepths(outsideBend.bend);
  const bendApex=outsideBend.bend.getPointAt(0.5).sub(outsideBend.center);
  const bowDepth=bendDepths[wallRules.loftIntervals/2]*wallGuide.size;
  const wallStories=stories.filter(story=>story.kind==='outer-walls'&&story.upperDatum!=='roof');
  const outerWallDatums=wallStories.map(story=>story.datum);
  const wallSides=wallRules.pairings.map(([lowerSide])=>lowerSide);
  const wallCoverage:number[]=[];
  let shiftedColumns=0;
  for(const {index,datum:rise,upperDatum} of wallStories){
    const lower=mainPlates[index],upper=mainPlates[index+1];
    const core=coresAtDatum.get(Number(upperDatum))!;
    const openings=officePlan.voids.filter(hole=>hole.plateIds?.includes(lower.id)||hole.plateIds?.includes(upper.id));
    const dropped=dropColumnsFromCore(rise,lower,upper,core.outline,core.guides,openings,columnSize);
    placements.push(...dropped.placements);
    officePlan.plates.push(...dropped.columns);
    shiftedColumns+=dropped.shifted;
    const lowerGuides=wallGuides(mainGuideGroups[index],lower),upperGuides=wallGuides(mainGuideGroups[index+1],upper);
    const lowerEdge=wallArcsAtPlate(lower,lowerGuides,sampleBend),upperEdge=wallArcsAtPlate(upper,upperGuides,sampleBend);
    wallCoverage.push(lowerEdge.coverage,upperEdge.coverage);
    for(const [side,upperSide] of wallRules.pairings){
      const lowerArc=lowerEdge.arcs[side],upperArc=upperEdge.arcs[upperSide];
      const polygon=thickenWallArc(lowerArc,outerThickness),upperPolygon=thickenWallArc(upperArc,outerThickness);
      const bottom=lower.zTop-lower.thickness,zTop=upper.zTop-upper.thickness;
      const id=`outer-edge-${rise}-${side}`;
      const guide=placeVerticalWallGuide(id,lower,upper,lowerArc,upperArc,wallGuide,bendApex,bowDepth,field);
      placements.push(guide);
      officePlan.plates.push({id,role:'wall',polygon,zTop,thickness:zTop-bottom,
        loft:{upperPolygon,lowerSeat:lower.thickness,wallThickness:outerThickness,receiverIds:[lower.id,upper.id],verticalBow:wallBowFromGuide(guide,bendDepths)}});
    }
  }
  officePlan.checks[0].detail=`${groupSize} main U guides per plate at ${[0,...rises].join(', ')} ft and at the separate roof.`;
  if(rises.length)officePlan.checks[0].detail+=` ${guideRules.currentCount} core U guides per intermediate plate at ${rises.join(', ')} ft.`;
  const check=(label:string,detail:string,passed=true)=>{
    officePlan.checks.push({label,status:passed?'pass':'fail',detail});
  };
  const near=(a:number,b:number)=>Math.abs(a-b)<=fieldRules.guideTolerance;
  const floorZ=-field.height/2;
  const intermediate=mainPlates.slice(1,-1);
  const coreGuides=placements.filter(p=>p.voidEdgeRole==='core');
  const coreSegments=officePlan.plates.filter(p=>p.role==='support');
  const columns=officePlan.plates.filter(p=>p.role==='column');
  const columnGuides=placements.filter(p=>p.voidEdgeRole==='column');
  const columnsPerStory=columnRules.endGuideCount*columnRules.tipsPerGuide;
  const outerWalls=officePlan.plates.filter(p=>p.role==='wall');
  const verticalGuides=placements.filter(p=>p.voidEdgeRole==='wall');
  const coreDatums=intermediateStories.filter(story=>story.kind==='core').map(story=>story.datum);
  const mainGroups=[...mainGuideGroups,roof.placements];
  const sizes=(guides:IntersectionPlacement[])=>[...new Set(guides.map(p=>p.scale))].join(', ');

  check('Main guide groups by plate',`${mainGroups.length} main guide groups with ${groupSize} U guides each, including the separate roof group.`,
    mainGroups.length===rises.length+2&&mainGroups.every(group=>group.length===groupSize));
  check('Independent U guide sizes',
    `Main end guide sizes are ${sizes(mainGroups.flatMap(group=>group.slice(0,2)))} ft. ${groupSize===guideRules.currentCount?`Main side guide sizes are ${sizes(mainGroups.flatMap(group=>group.slice(2)))} ft. `:''}Core guide sizes are ${sizes(coreGuides)||'absent at this height'}${coreGuides.length?' ft':''}.`,
    placements.every(p=>[p.scale,p.scaleX,p.scaleY,p.scaleZ].every(scale=>Number.isFinite(scale)&&scale>0)));
  check('15° base rotation',`Ground, roof and core guides use the ${baseRotation}° base rotation.`,
    near(baseRotation/guideRules.rotationIncrement,Math.round(baseRotation/guideRules.rotationIncrement))&&[...floor.placements,...roof.placements,...coreGuides].every(p=>p.voidEdgeRotation===baseRotation));
  check('Intermediate rotation sequence',`Intermediate groups turn by ${step}° per plate, at ${rises.map((_,i)=>baseRotation+step*(i+1)).join(', ')||'no intermediate angles'}°.`,
    mainGuideGroups.slice(1).every((group,i)=>group.every(p=>p.voidEdgeRotation===baseRotation+step*(i+1))));
  check('Four core guides per intermediate plate',`${coreGuides.length} core U guides across ${rises.length} intermediate plates. Each column has a pair of ${columnSize} ft L guides. The upper L tracks the core U tip and the lower L turns ${columnRules.lowerRotation}°.`,
    coreGuides.length===rises.length*guideRules.currentCount&&rises.every(rise=>coreGuides.filter(p=>p.voidEdgePlateDatum===rise).length===guideRules.currentCount)
    &&columnGuides.length===wallStories.length*columnsPerStory*2&&columnGuides.every(guide=>guide.letter===columnRules.letter&&guide.scale===columnSize)
    &&columnGuides.filter((_,i)=>i%2===0).every((upper,i)=>near(columnGuides[i*2+1].rz-upper.rz,columnRules.lowerRotation)));
  check('Guide elevations and depth',`Intermediate main guides are ${guideRules.centerAboveDatum} ft above their datums. Core guides sit ${slab/2} ft above their datums, at the slab midpoint.${heightShift?' Ground and roof guides were reseated for the new field height.':''}`,
    mainGuideGroups.slice(1).every((group,i)=>group.every(p=>near(p.z,floorZ+rises[i]+guideRules.centerAboveDatum)))
    &&coreGuides.every(p=>typeof p.voidEdgePlateDatum==='number'&&near(p.z,floorZ+p.voidEdgePlateDatum+slab/2)));
  check('Saved guide recovery',`Reused ${retainedMainGroups} of ${mainGroups.length} main groups and ${retainedCoreGroups} of ${rises.length} core groups from the submitted guides. Built the remaining groups from the applicable reference guides.`);
  check('U pairings for the outer walls',`${outerWalls.length} wall profiles use the ${wallRules.pairings.map(pair=>pair.join('–')).join(', ')} guide pairs and one ${wallGuide.size} ft sideways U per wall.`,
    outerWalls.length===outerWallDatums.length*wallSides.length&&verticalGuides.length===outerWalls.length
    &&outerWalls.every(wall=>verticalGuides.some(guide=>guide.voidEdgeWallId===wall.id&&guide.ry===-90)));
  check('Arranged guides inside the field',`Horizontal U and L guides and the ${verticalGuides.length} vertical U bend anchors fit inside the ${field.width} × ${field.depth} × ${field.height} ft field. Vertical U arms are construction references at the perimeter.`);

  check('Elliptical slabs from the main U guides',`${mainPlates.length} independently measured plate outlines with ${stackRules.ellipseSamples} ellipse samples each.`,
    mainPlates.every(plate=>plate.polygon.length===stackRules.ellipseSamples));
  check('Ten-foot plate stack and solid end caps',`Ground starts at 0 ft, intermediate plates start at ${rises.join(', ')||'no intermediate datums'} ft, and the roof finishes at ${field.height-stackRules.roofSetback} ft. The end plates have no core cut.`,
    near(mainPlates[0].zTop-slab,floorZ)&&near(mainPlates.at(-1)!.zTop,roofTop)
    &&intermediate.every((plate,i)=>near(plate.zTop-slab,floorZ+rises[i]))
    &&officePlan.voids.every(hole=>!hole.plateIds?.some(id=>id===mainPlates[0].id||id===mainPlates.at(-1)!.id)));
  check('Shared adjustable slab thickness',`All ${mainPlates.length} slabs use the selected ${slab} ft thickness.`,
    mainPlates.every(plate=>near(plate.thickness,slab)));
  check('Per-level core openings',`${officePlan.voids.length} core openings sized by the individual intermediate guide groups and scoped to their plates and any rising segments.`,
    officePlan.voids.length===rises.length&&officePlan.voids.every((hole,i)=>hole.cut&&hole.plateIds?.[0]===intermediate[i].id
      &&(intermediateStories[i].kind==='core'?hole.plateIds[1]===`elliptical-core-${rises[i]}`&&hole.plateIds.length===2:hole.plateIds.length===1)));
  check('Core fit and wall thickness',`The ${rises.length} outer core profiles fit inside their receiving plates and accept the ${wall} ft inward wall offset.`);
  check('Alternating hollow core segments',`${coreSegments.length} hollow segments start at ${coreDatums.join(', ')||'no intermediate datums'} ft and end at the next datum or roof. ${columns.length} columns twist between filled L profiles ${columnRules.lowerRotation}° apart. ${shiftedColumns} moved outward from their U tips to clear the slab openings.`,
    coreSegments.length===coreDatums.length&&coreSegments.every((plate,i)=>near(plate.zTop-plate.thickness,floorZ+coreDatums[i])
      &&near(plate.zTop,Math.min(floorZ+coreDatums[i]+plateSpacing,roofTop)))
    &&wallStories.every(({index})=>columns.filter(column=>column.columnReceivers?.[0]===mainPlates[index].id
      &&column.columnReceivers[1]===mainPlates[index+1].id&&column.loft&&near(column.thickness,plateSpacing)).length===columnsPerStory));
  check('Outer wall profiles from U bends',`${outerWalls.length} walls bow ${wallGuide.direction} up to ${bowDepth.toFixed(2)} ft. Each outside U bend meets the exterior wall face at mid-height. The walls cover ${wallRules.perimeterCoverage*100}% at each of the ${wallCoverage.length} receiving plate edges.`,
    wallCoverage.length===2*wallStories.length&&wallCoverage.every(coverage=>Math.abs(coverage-wallRules.perimeterCoverage)<=wallRules.coverageTolerance)
    &&outerWalls.length===outerWallDatums.length*wallSides.length&&outerWalls.every(plate=>plate.loft
      &&plate.polygon.length===plate.loft.upperPolygon.length&&near(plate.loft.lowerSeat,slab)
      &&plate.loft.verticalBow?.offsets[0]===0&&plate.loft.verticalBow.offsets.at(-1)===0));
  check('Four outer walls and adjustable thickness',`${wallSides.length} walls rise ${plateSpacing} ft from each of the ${outerWallDatums.join(', ')||'eligible'} ft datums. The plan thickness is ${outerThickness} ft.`,
    outerWalls.length===outerWallDatums.length*wallSides.length&&outerWallDatums.every(datum=>wallSides.every(side=>outerWalls.some(
      plate=>plate.id===`outer-edge-${datum}-${side}`&&near(plate.zTop-plate.thickness,floorZ+datum)&&near(plate.thickness,plateSpacing)
        &&plate.loft?.wallThickness===outerThickness))));
  officePlan.operations.push('Place the main U formations at every 10 ft plate and at the separate roof. Intermediate plates keep their rotation sequence.');
  officePlan.operations.push('Seat four core U guides at every intermediate plate, centered on the slab thickness.');
  officePlan.operations.push(`Base, roof and core share ${baseRotation} degrees. Intermediate plates rotate by ${step} degree increments relative to the base.`);
  officePlan.operations.push(`Extrude a hollow elliptical core segment from the first elevated plate and every other plate above it, up to the next 10 ft datum or the roof. Core walls are ${wall} ft thick and slabs are ${slab} ft thick.`);
  officePlan.operations.push('Size each intermediate opening from its own core U guides. Span the opening with the ground and roof plates.');
  officePlan.operations.push(`On each core-free story, loft four filled L columns downward from the outer arm tips of the upper core U guides to lower L guides turned ${columnRules.lowerRotation}°.`);
  officePlan.operations.push(`On each story without core walls, project the horizontal U bends onto the receiving plates for ${wallRules.perimeterCoverage*100}% combined perimeter coverage. Match the side-to-end pairs and bow each wall ${wallGuide.direction} using a ${wallGuide.size} ft sideways U. Offset the walls inward by ${outerThickness} ft in plan.`);
  return {...floor,placements,sequence:placements.map((_,i)=>i),officePlan,operations:officePlan.operations};
}
