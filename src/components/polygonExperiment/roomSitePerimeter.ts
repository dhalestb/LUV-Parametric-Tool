import * as THREE from 'three';
import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {getLetterShape,getLetterVolumeGeometry} from '../../../vendor/architectural-board/src/components/letterGeometry3d';
import edgePlatforms from '../../../vendor/architectural-board/scripts/room-edge-platforms.cjs';
import fullPerimeterLofts from '../../../vendor/architectural-board/scripts/full-perimeter-lofts.cjs';
import type {Letter} from './continuousFormation';
import type {Point} from './territories';

import reference from '../../../vendor/architectural-board/proof/fixtures/room-suspended-llv.json';

const tiers=[0,1,2,3].map(rank=>reference.source.filter(p=>p.architecturalRole==='perimeter'&&p.levelIndex===rank));
type WallSink=(id:string,body:Manifold,sources:string[])=>void;
type Node={id:string;matrix:number[];p:{letter:'U'|'L'|'V';x:number;y:number;levelIndex:number;architecturalRole:'perimeter'}};
type Crown={id:string;inner:Point[];seat:Point[];inward:Point};

// Read the edges in the native bay's radial frame before turning it to face the site.
function innerGuide(node:Node,world:THREE.Matrix4):Point[]{
 let points:Point[];
 if(node.p.letter==='V'){
  const shape=getLetterShape('V'),center=new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
  const frame=new THREE.Matrix4().fromArray(node.matrix);
  const sample=(edge:number,t:number):Point=>{
   const p=shape.curves[edge].getPoint(t).sub(center),v=new THREE.Vector3(p.x,p.y,0).applyMatrix4(frame);
   return [v.x,v.y];
  };
  const edge=Math.hypot(...sample(4,.5))>=Math.hypot(...sample(6,.5))?2:1;
  points=[sample(edge,.2),sample(edge,.8)];
 }else points=edgePlatforms.contours(node).inner.map(([x,y]):Point=>[x,y]);
 return points.map(([x,y])=>{const v=new THREE.Vector3(x,y,0).applyMatrix4(world);return [v.x,v.y];});
}

// Upper letters on a long or concave site share local joints. Test the span
// before building it so a plank cannot take a shortcut across an open court.
function joinCrowns(api:ManifoldToplevel,domain:CrossSection,crowns:Crown[],z:number,loop:number,emit:WallSink){
 const center=(points:Point[]):Point=>points.reduce<Point>((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
 const pending=crowns.slice();
 while(pending.length){
  const first=pending.shift()!,at=center(first.inner);
  const near=pending.map(c=>({c,at:center(c.inner)})).sort((a,b)=>Math.hypot(a.at[0]-at[0],a.at[1]-at[1])-Math.hypot(b.at[0]-at[0],b.at[1]-at[1])).slice(0,6);
  const candidates=[center([at,...near.slice(0,3).map(n=>n.at)]),...near.map(n=>center([at,n.at])),at];
  const inside:Point=[at[0]+8*first.inward[0],at[1]+8*first.inward[1]];
  candidates.unshift(center([candidates[0],inside]));
  let best:{c:Crown;shape:CrossSection}[]=[];
  for(const tip of candidates){
   const spans:typeof best=[];
   for(const c of [first,...near.map(n=>n.c)]){
    const radius=.55;
    const outline:Point[]=[...c.inner,...c.seat,[tip[0]-radius,tip[1]],[tip[0]+radius,tip[1]],[tip[0],tip[1]-radius],[tip[0],tip[1]+radius]];
    const plan=api.CrossSection.hull([outline]);
    const outside=plan.subtract(domain),fits=outside.area()<1e-7;outside.delete();
    if(fits)spans.push({c,shape:plan});else plan.delete();
    if(!spans.length||spans.length===4)break;
   }
   if(spans.length>best.length){best.forEach(p=>p.shape.delete());best=spans;}else spans.forEach(p=>p.shape.delete());
   if(best.length===4)break;
  }
  for(const {c,shape} of best){
   const index=pending.indexOf(c);if(index>=0)pending.splice(index,1);
   const raw=shape.extrude(.5),solid=raw.translate([0,0,z-.5]);
   try{emit('top-plank-'+loop+'-'+crowns.indexOf(c),solid,[c.id]);}finally{solid.delete();raw.delete();shape.delete();}
  }
 }
}

// Each bay uses the locked full-profile builder in its own tangent frame.
// Its radial profile selector sees the outward face even around a concave site.
export function roomPerimeter(api:ManifoldToplevel,domain:CrossSection,origin:Point,datum:number,height:number,
  prefix:string,size:number,wall:number,target:number|undefined,emit:WallSink){
 const first=5;
 const levels=Math.min(4,Math.max(2,1+Math.floor((height-first-2)/4)));
 const spacing=Math.min(15,(height-first-2)/(levels-1));
 const result:Letter[]=[];
 const templates=new Map<number,{body:Manifold;upper:number}[]>();
 const loopsLength=(ring:Point[])=>ring.reduce((sum,p,j)=>sum+Math.hypot(p[0]-ring[(j+1)%ring.length][0],p[1]-ring[(j+1)%ring.length][1]),0);
 const route=domain.offset(-(.8*size+1),'Round',2,16);
 try{
  const loops=route.toPolygons(),totalLength=loops.reduce((sum,ring)=>sum+loopsLength(ring),0);
  for(const [loopIndex,loop] of loops.entries()){
   const crowns:Crown[]=[];
   const roofZ=first+(levels-1)*spacing-.45;
   const lengths=loop.map((a,i)=>Math.hypot(loop[(i+1)%loop.length][0]-a[0],loop[(i+1)%loop.length][1]-a[1]));
   const perimeter=lengths.reduce((a,b)=>a+b,0);
   const fit=Math.floor(perimeter/(1.25*size));
   const count=target===undefined?fit:Math.min(fit,Math.max(1,Math.round(target*perimeter/Math.max(1,totalLength)/levels)));
   for(let i=0;i<count;i++){
    let distance=(i+.5)*perimeter/count,edge=0;
    while(edge<loop.length-1&&distance>=lengths[edge])distance-=lengths[edge++];
    const a=loop[edge],b=loop[(edge+1)%loop.length],yaw=Math.atan2(b[1]-a[1],b[0]-a[0]);
    const cx=a[0]+distance*Math.cos(yaw),cy=a[1]+distance*Math.sin(yaw);
    const bay=i%tiers[0].length,base=tiers[0][bay];
    const heading=yaw-Math.atan2(base.y,base.x)-Math.PI/2;
    const world=new THREE.Matrix4().makeRotationZ(heading).setPosition(cx,cy,0)
      .multiply(new THREE.Matrix4().makeTranslation(-base.x,-base.y,0));
    const nodes:Node[]=[],glyphs:Letter[]=[];
    for(let rank=0;rank<levels;rank++){
     const pose=tiers[rank][bay];
     if(!pose)break; // The fifth reference bay terminates at the second lift.
     const letter=pose.letter as 'U'|'L'|'V',scale=pose.scale;
     const rotation=new THREE.Euler(pose.rx*Math.PI/180,pose.ry*Math.PI/180,pose.rz*Math.PI/180,'ZYX');
     const local=new THREE.Matrix4().compose(new THREE.Vector3(pose.x,pose.y,first+rank*spacing),
       new THREE.Quaternion().setFromEuler(rotation),new THREE.Vector3(scale,scale,scale));
     const id=prefix+'/bay-'+loopIndex+'-'+i+'/lift-'+rank+'-'+letter;
     nodes.push({id,matrix:local.toArray(),p:{letter,x:pose.x,y:pose.y,levelIndex:rank,architecturalRole:'perimeter'}});
     const transform=world.clone().multiply(local);
     const g=getLetterVolumeGeometry(letter,12),attr=g.getAttribute('position');
     const positions:number[]=[],indices:number[]=[];
     for(let j=0;j<attr.count;j++){
      const pt=new THREE.Vector3().fromBufferAttribute(attr,j).applyMatrix4(transform);
      positions.push(origin[0]+pt.x,datum+pt.z,origin[1]+pt.y);
     }
     for(let j=0;j<(g.index?.count??attr.count);j+=3)
      for(const k of [j,j+2,j+1])indices.push(g.index?g.index.getX(k):k);
     glyphs.push({id,letter,nominalSizeFeet:scale*.92,mesh:{positions,indices}});
    }
    // Both the native glyph and the loft must stay in this height region.
    const planPoints=glyphs.flatMap(g=>{
     const points:Point[]=[];
     for(let j=0;j<g.mesh.positions.length;j+=3)
      points.push([g.mesh.positions[j]-origin[0],g.mesh.positions[j+2]-origin[1]]);
     return points;
    });
    const hull=api.CrossSection.hull([planPoints]),escape=hull.subtract(domain);
    const fits=escape.area()<1e-6;
    escape.delete();hull.delete();
    if(!fits)continue;
    // Own the temporary hulls that the native print loft uses for its tiles.
    const owned:Manifold[]=[];
    const own=(body:Manifold)=>{owned.push(body);return body;};
    const kernel={Manifold:{hull:(pts:Parameters<typeof api.Manifold.hull>[0])=>own(api.Manifold.hull(pts)),
       union:(items:Manifold[])=>own(api.Manifold.union(items))}};
    try{
     const key=bay;
     let series=templates.get(key);
     if(!series){
      series=[];templates.set(key,series);
      const seriesForBay=series;
      fullPerimeterLofts(kernel,nodes,{},(_id:string,body:Manifold,sources:string[])=>{
       own(body);
       const upper=nodes.findIndex(n=>n.id===sources[sources.length-1]);
       seriesForBay.push({body:body.translate([-base.x,-base.y,0]),upper});
      },wall);
     }
     // Equal poses repeat with the five reference bays. Rigid instances share the exact
     // native loft geometry, but each panel retains its own source-letter IDs.
     for(const {body,upper} of series){
      const rotated=own(body.rotate([0,0,heading*180/Math.PI]));
      const placed=own(rotated.translate([cx,cy,0]));
      const ids=upper?[nodes[upper-1].id,nodes[upper].id]:[nodes[0].id];
      emit('full-'+(upper?'loft':'base')+'-'+loopIndex+'-'+i+'-'+upper,placed,ids);
      if(upper===levels-1){
       const node=nodes[upper],inner=innerGuide(node,world);
       const center=inner[Math.floor(inner.length/2)];
       const section=placed.slice(roofZ-.25);
       try{
        const rim=section.toPolygons().flat().sort((p,q)=>Math.hypot(p[0]-center[0],p[1]-center[1])-Math.hypot(q[0]-center[0],q[1]-center[1]));
        if(!rim.length)throw Error('No top wall bearing for '+node.id);
        const patch=api.CrossSection.circle(.8,16),at=patch.translate(rim[0]),bearing=section.intersect(at);
        try{crowns.push({id:node.id,inner,seat:bearing.toPolygons().flat(),inward:[-Math.sin(yaw),Math.cos(yaw)]});}
        finally{bearing.delete();at.delete();patch.delete();}
       }finally{section.delete();}
      }
     }
     result.push(...glyphs);
    }finally{for(const body of owned.reverse())body.delete();}
   }
   joinCrowns(api,domain,crowns,roofZ,loopIndex,emit);
  }
  return result;
 }finally{for(const series of templates.values())for(const panel of series)panel.body.delete();route.delete();}
}

