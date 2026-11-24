import { beginGeometryValidation, geometryRevision } from "./geometryRevision";
import { enumerateApproachWindows, type WalkableAnchor } from "./surfaceAttachment";
import { validateWalkingApproach } from "./walkingApproach";
import type { ConnectorSurface } from "./connectionClearance";
import type { PlacedTile, TileModel, Vec3 } from "./types";

export type ApproachAnchor = WalkableAnchor & {id:string};
export type ApproachResult = ReturnType<typeof validateWalkingApproach>;
export type QualifiedApproach = { anchor: ApproachAnchor; walking: Array<{depth:number; result:ApproachResult}>; landing: ApproachResult };
type Discovery = { available:number; omitted:number; tested:number; qualified:QualifiedApproach[];
  outcomes:Array<{anchor:ApproachAnchor; stage:string; reason:string; walking:QualifiedApproach["walking"]; landing?:ApproachResult}>; ms:number; cacheHit:boolean };
const cache=new WeakMap<object,Map<string,Discovery>>();

/** Original floor carries the approach from its interior profile to the opening.
 * Connector geometry starts at the opening; existing floor is never re-meshed,
 * and its flat run is never credited toward the external ramp's climb. */
export function discoverInteriorApproaches(model:TileModel,tile:PlacedTile,models:TileModel[],tiles:PlacedTile[],existing:ConnectorSurface[]=[],
  options:{windows?:number; targets?:Vec3[]; anchors?:ApproachAnchor[]}={}) : Discovery {
  const finish=beginGeometryValidation(),start=performance.now();
  try {
    if(!model.connectionSurface)throw new Error("Original OBJ surface required");
    const windows=options.windows??256;
    if(!Number.isInteger(windows)||windows<1||windows>1024||options.anchors&&options.anchors.length>windows)throw new Error("Invalid approach budget");
    const revision=geometryRevision(model.connectionSurface);
    const key=JSON.stringify([tile,model.variants[tile.variant]?.rotation,model.variants[tile.variant]?.mirror,options,tiles.map(t=>{const m=models.find(m=>m.id===t.id||m.id===t.id.split("::")[0]);return [t,m?.connectionSurface?geometryRevision(m.connectionSurface).id:null,m?.variants[t.variant]?.rotation,m?.variants[t.variant]?.mirror];}),existing.map(m=>geometryRevision(m).id)]);
    let entries=cache.get(revision);if(!entries){entries=new Map();cache.set(revision,entries);}
    const old=entries.get(key);if(old)return {...structuredClone(old),ms:performance.now()-start,cacheHit:true};
    const proposals=options.anchors?{anchors:options.anchors,available:options.anchors.length,omitted:0}:enumerateApproachWindows(model,tile,windows,options.targets);
    const result:Discovery={available:proposals.available,omitted:proposals.omitted,tested:proposals.anchors.length,qualified:[],outcomes:[],ms:0,cacheHit:false};
    for(const anchor of proposals.anchors){
      const first=validateWalkingApproach(model,tile,anchor.point,anchor.outward,anchor.width,2,models,tiles,existing);
      const walking=[{depth:2,result:first}];
      // A larger rectangle contains the same failed prefix; do not spend another
      // expensive query to rediscover a hole, obstruction or slope in that prefix.
      if(!first.valid){
        for(const depth of [4,6])walking.push({depth,result:{...first,reason:"invalid 2 ft prefix: "+first.reason}});
        const zone=(first.details as {zone?:string}).zone;
        result.outcomes.push({anchor,walking,stage:zone==="opening"?"B_NO_OPENING":"A_NO_SOURCE_APPROACH",reason:first.reason});continue;
      }
      for(const depth of [4,6])walking.push({depth,result:validateWalkingApproach(model,tile,anchor.point,anchor.outward,anchor.width,depth,models,tiles,existing)});
      const landing=validateWalkingApproach(model,tile,anchor.point,anchor.outward,anchor.width,Math.max(3,anchor.width),models,tiles,existing,true);
      result.qualified.push({anchor,walking,landing});
      result.outcomes.push({anchor,walking,landing,stage:"QUALIFIED_WALKING_OPENING",reason:"continuous original floor and swept opening throat verified"});
    }
    result.ms=performance.now()-start;
    if(entries.size>=16)entries.delete(entries.keys().next().value!);entries.set(key,structuredClone(result));return result;
  } finally {finish();}
}
