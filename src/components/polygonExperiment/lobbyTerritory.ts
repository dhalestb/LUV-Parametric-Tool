import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import type {Point} from './territories';
import type {LobbyTypology} from './model';
import type {HeightBand} from './compositionHeights';
import {siteMesh,type FormationPart,type PlanLayer} from './continuousFormation';

type Own=<T extends {delete():void}>(item:T)=>T;
export type LobbyStation={
  point:Point; radius:number; heading:number; peak:number;
  levels:number[]; footprint:CrossSection; sources:string[]; prefix:string;
};

// Continue the checkpoint assemblies as occupied architecture out to the site edges.
// The stations and their source letters keep their native sizes and coordinates.
export function developLobbyTerritory(api:ManifoldToplevel,typology:LobbyTypology,domain:CrossSection,
  stations:LobbyStation[],bands:HeightBand[],cap:number,origin:Point,datum:number,own:Own,
  solids:Manifold[],parts:FormationPart[],layers:PlanLayer[],pitch:number,thickness:number){
  const {min,max}=domain.bounds(),reach=2*Math.hypot(max[0]-min[0],max[1]-min[1])+pitch;
  const radial=typology==='vertical-void-lobby'||typology==='topographic-ground-field-lobby';
  const terrace=typology==='topographic-ground-field-lobby';
  const gallery=typology==='linear-gallery-lobby';
  // Leave openings and the entire native upper envelope visible. Overlap the
  // station very slightly at the joint so the emitted meshes meet at site precision.
  const cores=own(api.CrossSection.union(stations.map(s=>own(s.footprint.offset(-.15)))));
  const remaining=own(domain.subtract(cores));
  function strip(p:Point,d:Point,lo:number,hi:number){
    const vertex=(u:number,v:number):Point=>[p[0]+d[0]*u-d[1]*v,p[1]+d[1]*u+d[0]*v];
    return own(new api.CrossSection([[vertex(lo,-reach),vertex(hi,-reach),vertex(hi,reach),vertex(lo,reach)]]));
  }
  function boundsAlong(section:CrossSection,p:Point,axis:Point){
    let low=Infinity,high=-Infinity;
    for(const ring of section.toPolygons())for(const [x,y] of ring){
      const u=(x-p[0])*axis[0]+(y-p[1])*axis[1];
      low=Math.min(low,u);high=Math.max(high,u);
    }
    return [low,high];
  }
  for(const station of stations){
    let cell=remaining;
    for(const other of stations){
      if(other===station)continue;
      const dx=other.point[0]-station.point[0],dy=other.point[1]-station.point[1],len=Math.hypot(dx,dy);
      cell=own(cell.intersect(strip(station.point,[dx/len,dy/len],-reach,len/2)));
    }
    if(cell.isEmpty())continue;
    const angle=station.heading*Math.PI/180,along:Point=[Math.cos(angle),Math.sin(angle)],across:Point=[-along[1],along[0]];
    const zones=bands.length?bands.map(b=>({id:b.id,area:own(cell.intersect(b.section)),cap:b.cap})):
      [{id:'field',area:cell,cap}];
    function build(id:string,shape:CrossSection,base:number,top:number){
      // Remove near-coincident vertices left by intersecting territory and height boundaries
      // before triangulating the local shape for the renderer's float mesh.
      shape=own(shape.simplify(.00001));
      if(top<=base||shape.isEmpty())return;
      const extruded=own(shape.extrude(top-base));
      const solid=base?own(extruded.translate([0,0,base])):extruded;
      solids.push(solid);
      parts.push({id:station.prefix+id,sources:station.sources,mesh:siteMesh(solid,origin,datum)});
      layers.push({name:station.prefix+id,typology,top,contours:shape.toPolygons().map(r=>r.map(([x,z])=>[origin[0]+x,origin[1]+z]))});
    }
    function develop(section:CrossSection,index:number){
      for(const zone of zones){
        const clipped=own(section.intersect(zone.area));
        if(clipped.area()<1e-8)continue;
        const height=Math.min(station.peak,zone.cap);
        const key=zone.id+'/bay-'+index+'/';
        if(terrace){
          // Rising ground follows the projected field, returning in flights at
          // the checkpoint's terrace rise and landing at the local height limit.
          const rise=Math.min(pitch*.12,height/4);
          const steps=Math.max(1,Math.floor((height-2*rise)/rise));
          const flight=index%(2*steps);
          build(key+'contour terrace',clipped,0,height-rise*Math.min(flight,2*steps-flight));
          continue;
        }
        const count=station.levels.length,phase=((index%count)+count)%count;
        const level=gallery?station.peak-(index%2===0?5.4:0):station.levels[phase];
        const top=Math.min(height,Math.max(.75+2*thickness,level));
        // The floor above the through-passage is carried by side walls.
        // Each clipped island gets its own bearings, including concave edges.
        for(const [i,island] of clipped.decompose().entries()){
          own(island);
          const name=key+i+'/',rim=own(island.subtract(own(island.offset(-thickness))));
          const [lo,hi]=boundsAlong(island,station.point,across);
          const opening=strip(station.point,across,lo+(hi-lo)*.22,hi-(hi-lo)*.22);
          const walls=own(rim.subtract(opening));
          build(name+'bearing walls',walls,0,top);
          if(radial&&top>12)build(name+'atrium walk',island,top/2-thickness,top/2);
          build(name+(radial?'stack gallery':gallery?'gallery pad':'passage shell'),island,Math.max(0,top-thickness),top);
        }
      }
    }
    // Keep through-passages and atrium openings clear inside the native core.
    // Only their entrance landings meet the surrounding site-level architecture.
    const seed=own(station.footprint.hull());
    for(const zone of zones){
      const landing=own(zone.area.intersect(seed));
      build(zone.id+'/entry landing',landing,0,Math.min(.75+2*thickness,zone.cap));
      zone.area=own(zone.area.subtract(seed));
    }
    if(radial){
      // Offset the checkpoint silhouette, so these galleries and terraces turn
      // around the actual stack or spiral and follow it into irregular parcels.
      let previous=seed;
      const width=Math.max(pitch*.55,reach/100);
      for(let i=1;i<=Math.ceil(reach/width);i++){
        const next=own(seed.offset(i*width,'Round',2,24));
        develop(own(next.subtract(previous)),i);
        previous=next;
        if(own(cell.subtract(next)).isEmpty())break;
      }
    }else{
      // The compressed hall varies along its axis. Gallery pads alternate
      // across parallel runs and retain the checkpoint's 5.4 ft level change.
      const axis=gallery?across:along,[lo,hi]=boundsAlong(cell,station.point,axis);
      const width=Math.max(pitch,reach/100);
      for(let i=Math.floor(lo/width);i<=Math.floor(hi/width);i++)
        develop(strip(station.point,axis,i*width,(i+1)*width),i);
    }
  }
}
