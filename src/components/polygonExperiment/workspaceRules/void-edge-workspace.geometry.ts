// Architecture assembly policy owned exclusively by void-edge-workspace.
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { OfficePlan, OfficePlate, OfficeVoid, Pt } from "../flatDeepRules/contracts";
import {thickenWallArc} from "./void-edge-planar";
import {voidEdgeRules} from "./void-edge-workspace.rules";

export type OfficeWorkspaceSolids = {
  /** Base for separate exports, before cores and outer walls are added. */
  floorsAndColumns: Manifold | null;
  /** Massing without perimeter walls — used for the main viewer mesh. */
  form: Manifold | null;
  /** Separate wall solids for a live show/hide toggle. */
  walls: Manifold | null;
  /** form ∪ walls for validation / volume. */
  combined: Manifold | null;
};

function matchesPlate(hole: OfficeVoid, plate: OfficePlate) {
  return (!hole.plateIds?.length || hole.plateIds.includes(plate.id))
    && (!hole.roles?.length || hole.roles.includes(plate.role));
}

function loftPlateProfiles({Manifold,Mesh}: ManifoldToplevel, plate: OfficePlate, own: (solid: Manifold) => Manifold) {
  const {polygon,zTop,thickness,id}=plate;
  const {upperPolygon,lowerSeat,upperSeat=0,wallThickness,verticalBow}=plate.loft!;
  const bottom=zTop-thickness;
  const seatTop=bottom+lowerSeat;
  const rings=[{polygon,z:bottom},{polygon,z:seatTop}];
  // Sample the ruled faces before triangulating them, including when the two U edges turn 90 degrees.
  const subdivisions=voidEdgeRules.walls.loftIntervals;
  const count=polygon.length;
  const arcCount=wallThickness===undefined?count:count/2;
  for(let step=1;step<=subdivisions;step++){
    const t=step/subdivisions;
    const shift=verticalBow?.offsets[step]??0;
    const dx=shift*(verticalBow?.axis[0]??0),dy=shift*(verticalBow?.axis[1]??0);
    const edge=polygon.slice(0,arcCount).map(([x,y],i):Pt=>[
      x+(upperPolygon[i][0]-x)*t+dx,y+(upperPolygon[i][1]-y)*t+dy,
    ]);
    const profile=step===subdivisions?upperPolygon:wallThickness===undefined?edge:thickenWallArc(edge,wallThickness);
    rings.push({polygon:profile,z:seatTop+(zTop-upperSeat-seatTop)*t});
  }
  if(upperSeat>0)rings.push({polygon:upperPolygon,z:zTop});
  const positions=rings.flatMap(ring=>ring.polygon.flatMap(([x,y])=>[x,y,ring.z]));
  const triangles:number[]=[];
  for(let ring=0;ring<rings.length-1;ring++){
    const lower=ring*count,upper=lower+count;
    for(let i=0;i<count;i++){
      const next=(i+1)%count;
      triangles.push(lower+i,lower+next,upper+next,lower+i,upper+next,upper+i);
    }
  }
  for(const ring of [0,rings.length-1]){
    const start=ring*count;
    if(wallThickness!==undefined){
      // Close the band between corresponding outer and inner arc vertices.
      for(let i=0;i<arcCount-1;i++){
        const a=start+i,b=a+1,c=start+count-2-i,d=c+1;
        if(ring===0)triangles.push(a,c,b,a,d,c);
        else triangles.push(a,b,c,a,c,d);
      }
      continue;
    }
    // Solid column profiles and older wall profiles have convex caps.
    const {polygon:cap,z}=rings[ring];
    const [x,y]=cap.reduce(([x,y],[px,py])=>[x+px/count,y+py/count],[0,0]);
    const center=positions.length/3;
    positions.push(x,y,z);
    for(let i=0;i<count;i++){
      const next=(i+1)%count;
      if(ring===0)triangles.push(center,start+next,start+i);
      else triangles.push(center,start+i,start+next);
    }
  }
  const solid=own(Manifold.ofMesh(new Mesh({numProp:3,vertProperties:new Float32Array(positions),triVerts:new Uint32Array(triangles)})));
  if(solid.status()!=="NoError"||solid.isEmpty()||solid.volume()<=0){
    const detail=plate.role==='column'
      ?`Void-Edge workspace ruleset: could not loft both L profiles for ${id}. Adjust the column L size or core U guides.`
      :`Could not connect both U edges for ${id}. Adjust the wall guide positions.`;
    throw Error(detail);
  }
  return solid;
}

function horizontalCap(mesh:ReturnType<Manifold['getMesh']>,z:number,tolerance:number):Pt[][] {
  const triangles:Pt[][]=[];
  const {numProp,vertProperties,triVerts}=mesh;
  for(let i=0;i<triVerts.length;i+=3){
    const vertices=[triVerts[i],triVerts[i+1],triVerts[i+2]].map(index=>index*numProp);
    if(vertices.every(index=>Math.abs(vertProperties[index+2]-z)<=tolerance)){
      triangles.push(ccw(vertices.map(index=>[vertProperties[index],vertProperties[index+1]])));
    }
  }
  return triangles;
}

function traceLength(points:Pt[], closed=false) {
  const end=closed?points.length:points.length-1;
  let length=0;
  for(let i=0;i<end;i++){
    const a=points[i],b=points[(i+1)%points.length];
    length+=Math.hypot(b[0]-a[0],b[1]-a[1]);
  }
  return length;
}

/** Check contacts, the verified cap traces and overlaps on the assembled wall layers. */
export function checkVoidEdgeWalls(
  {Manifold,CrossSection}: ManifoldToplevel,
  plan: OfficePlan,
  layers: ReadonlyMap<string,Manifold>,
  own: (solid: Manifold) => Manifold,
) {
  const walls=plan.plates.filter(plate=>plate.role==='wall');
  const slabs=new Map(plan.plates.map(plate=>[plate.id,plate]));
  const groups=new Map<string,Manifold[]>();
  const traces=new Map<string,number[]>();
  const contactFailures:string[]=[],coverageFailures:string[]=[],overlapFailures:string[]=[];
  const {minimumContactArea,overlapTolerance,pairings,perimeterCoverage,coverageTolerance}=voidEdgeRules.walls;
  const tolerance=voidEdgeRules.field.solidTolerance;
  for(const wall of walls){
    const baseId=wall.loft?.receiverIds?.[0],upperId=wall.loft?.receiverIds?.[1];
    const base=baseId&&slabs.get(baseId),upper=upperId&&slabs.get(upperId);
    const solid=layers.get(wall.id);
    if(!base||!upper||!solid||!wall.loft){
      contactFailures.push(`${wall.id} is missing a receiving layer.`);
      continue;
    }
    const {min,max}=solid.boundingBox();
    const mesh=solid.getMesh();
    const ends=[
      {label:'lower',slab:base,cap:wall.polygon,z:min[2],aligned:Math.abs(min[2]-(base.zTop-base.thickness))<=tolerance
        &&Math.abs(min[2]+wall.loft.lowerSeat-base.zTop)<=tolerance},
      {label:'upper',slab:upper,cap:wall.loft.upperPolygon,z:max[2],aligned:Math.abs(max[2]-(upper.zTop-upper.thickness))<=tolerance},
    ];
    for(const {label,slab,cap,z,aligned} of ends){
      const receiver=layers.get(slab.id);
      if(!aligned||!receiver){
        contactFailures.push(`${wall.id} does not reach its ${label} plate.`);
        continue;
      }
      const footprint=receiver.slice(slab.zTop-slab.thickness/2);
      const wallCap=new CrossSection(horizontalCap(mesh,z,tolerance));
      const expectedCap=new CrossSection([cap]);
      const match=wallCap.intersect(expectedCap),contact=footprint.intersect(wallCap);
      try {
        if(contact.area()<=minimumContactArea)contactFailures.push(`${wall.id} has no contact area with its ${label} plate.`);
        if(expectedCap.area()-match.area()>tolerance||wallCap.area()-match.area()>tolerance){
          coverageFailures.push(`${wall.id} does not match its ${label} perimeter trace in the export.`);
        }else{
          const span=traceLength(cap.slice(0,cap.length/2));
          const spans=traces.get(slab.id);
          if(spans)spans.push(span);
          else traces.set(slab.id,[span]);
        }
      } finally {
        contact.delete();match.delete();expectedCap.delete();wallCap.delete();footprint.delete();
      }
    }
    const group=groups.get(base.id);
    if(group)group.push(solid);
    else groups.set(base.id,[solid]);
  }
  for(const [baseId,parts] of groups){
    const combined=own(Manifold.union(parts));
    const gap=parts.reduce((volume,wall)=>volume+wall.volume(),0)-combined.volume();
    if(parts.length!==pairings.length||combined.status()!=='NoError'||combined.isEmpty()||gap>overlapTolerance){
      overlapFailures.push(`The story above ${baseId} does not have ${pairings.length} nonoverlapping outer walls.`);
    }
  }
  const coverage=Array.from(traces,([id,spans])=>{
    const span=spans.reduce((sum,length)=>sum+length,0);
    const ratio=span/traceLength(slabs.get(id)!.polygon,true);
    if(spans.length!==pairings.length||Math.abs(ratio-perimeterCoverage)>coverageTolerance){
      coverageFailures.push(`${id} has ${(ratio*100).toFixed(2)}% perimeter coverage from ${spans.length} verified wall traces. Expected ${perimeterCoverage*100}% from ${pairings.length} walls.`);
    }
    return ratio;
  });
  return {wallCount:walls.length,storyCount:groups.size,contactFailures,coverageFailures,coverage,overlapFailures};
}

export function checkVoidEdgeColumns(
  {CrossSection}:ManifoldToplevel, plan:OfficePlan, layers:ReadonlyMap<string,Manifold>,
) {
  const columns=plan.plates.filter(plate=>plate.role==='column');
  const plates=new Map(plan.plates.map(plate=>[plate.id,plate]));
  const tolerance=voidEdgeRules.field.solidTolerance;
  const failures:string[]=[];
  const twists:number[]=[];
  for(const column of columns){
    const solid=layers.get(column.id);
    const receivers=column.columnReceivers;
    const lower=receivers&&plates.get(receivers[0]),upper=receivers&&plates.get(receivers[1]);
    if(!solid||!lower||!upper||solid.status()!=='NoError'||solid.isEmpty()){
      failures.push(`${column.id} is missing a solid column or receiving plate.`);
      continue;
    }
    const {min,max}=solid.boundingBox();
    const ends=[
      {slab:lower,end:min[2],description:'lower',polygon:column.polygon,sign:1},
      {slab:upper,end:max[2],description:'upper',polygon:column.loft?.upperPolygon??column.polygon,sign:-1},
    ];
    const failuresBefore=failures.length;
    for(const {slab,end,description,polygon,sign} of ends){
      const receiver=layers.get(slab.id),seat=slab.zTop-slab.thickness/2;
      if(!receiver||Math.abs(end-seat)>tolerance){
        failures.push(`${column.id} does not reach the ${description} slab seat.`);
        continue;
      }
      const z=seat+sign*slab.thickness/4;
      const section=receiver.slice(z),columnSection=solid.slice(z);
      const expected=new CrossSection([polygon]);
      const match=columnSection.intersect(expected),contact=section.intersect(columnSection);
      try{
        if(expected.area()-match.area()>tolerance||Math.abs(expected.area()-columnSection.area())>tolerance){
          failures.push(`${column.id} does not match its ${description} filled L profile.`);
        }
        if(columnSection.area()-contact.area()>tolerance){
          failures.push(`${column.id} overlaps an opening or misses solid area on the ${description} slab.`);
        }
      }finally{contact.delete();match.delete();expected.delete();columnSection.delete();section.delete();}
    }
    if(failures.length===failuresBefore){
      const [[lx,ly],[mx,my]]=ends[0].polygon;
      const [[ux,uy],[vx,vy]]=ends[1].polygon;
      const ax=vx-ux,ay=vy-uy,bx=mx-lx,by=my-ly;
      const twist=Math.atan2(ax*by-ay*bx,ax*bx+ay*by)*180/Math.PI;
      twists.push(twist);
      if(Math.abs(twist-voidEdgeRules.columns.lowerRotation)>voidEdgeRules.field.guideTolerance){
        failures.push(`${column.id} turns ${twist.toFixed(2)}° between its verified seats. Expected ${voidEdgeRules.columns.lowerRotation}°.`);
      }
    }
  }
  return {count:columns.length,failures,twists};
}

/** Verify that the union accounts for each component, even when a valid mesh was returned. */
export function checkVoidEdgeAssembly(
  plan:OfficePlan, layers:ReadonlyMap<string,Manifold>, combined:Manifold, separateBase:Manifold|null,
) {
  const failures:string[]=[];
  let baseCount=0;
  for(const {id,role} of plan.plates){
    const part=layers.get(id);
    if(!part||part.status()!=='NoError'||part.isEmpty()||part.volume()<=0){
      failures.push(`${id} is missing a valid export mesh.`);
      continue;
    }
    const inBase=role!=='wall'&&role!=='support';
    if(inBase)baseCount++;
    const assemblies=[{solid:combined,label:'complete assembly'}];
    if(separateBase&&inBase)assemblies.push({solid:separateBase,label:'floors, roof and columns export'});
    for(const {solid,label} of assemblies){
      const missing=part.subtract(solid);
      try{
        const tolerance=Math.max(voidEdgeRules.assembly.volumeTolerance,part.volume()*voidEdgeRules.assembly.relativeVolumeTolerance);
        if(missing.status()!=='NoError'||(!missing.isEmpty()&&Math.abs(missing.volume())>tolerance)){
          failures.push(`${id} is incomplete in the ${label}.`);
        }
      }finally{missing.delete();}
    }
  }
  return {failures,baseCount,shellCount:plan.plates.length-baseCount};
}

/** Extrudes a validated office plan. Voids are cut from plates only, so ramps and supports stay intact. */
export function buildOfficeWorkspace(wasm: ManifoldToplevel, plan: OfficePlan, own: (solid: Manifold) => Manifold): OfficeWorkspaceSolids {
  if (plan.typology !== "void-edge-workspace") throw Error("Wrong architecture rules module: "+plan.typology);
  const { Manifold } = wasm;
  const roofs = plan.plates.filter((plate) => plate.role === "roof");
  // Letter-derived core segments use their authored heights.
  const autoTieSupportsToRoof = roofs.length > 0 && !roofs.some((roof) => roof.id === "u-derived-roof");
  const bodyPlates: Manifold[] = [];
  const wallPlates: Manifold[] = [];
  const connectors: Manifold[] = [];
  const voids = plan.voids.filter((hole) => hole.cut && hole.polygon.length >= 3);
  const scopedVoids = voids.filter((hole) => hole.plateIds?.length || hole.roles?.length);
  let roofTied = false;

  const extrude = (polygon: Pt[], zTop: number, thickness: number) => {
    const loop = ccw(polygon);
    if (loop.length < 3 || Math.abs(signedArea(loop)) < 1e-4) return null;
    const height = Math.max(thickness, 0.05);
    const solid = Manifold.extrude([loop], height).translate([0, 0, zTop - height]);
    if (solid.status() !== "NoError" || solid.isEmpty()) { try { solid.delete(); } catch { /* already released */ } return null; }
    return own(solid);
  };

  for (const plate of plan.plates) {
    if (plate.role === "support") continue;
    const polygon = plate.id.startsWith("sill-") ? extendSill(plate) : plate.polygon;
    let solid = plate.loft ? loftPlateProfiles(wasm, plate, own) : extrude(polygon, plate.zTop, plate.thickness);
    if (!solid) continue;
    for (const hole of scopedVoids.filter((hole) => matchesPlate(hole, plate))) {
      const cutter = extrude(hole.polygon, plate.zTop + 0.05, plate.thickness + 0.1);
      if (cutter) solid = subtract(solid, cutter, own) ?? solid;
    }
    if (plate.role === "wall") wallPlates.push(solid);
    else bodyPlates.push(solid);
  }

  let field = union(Manifold, bodyPlates, own);
  // Legacy unscoped cuts still shaft through the whole assembly.
  const cuts = voids.filter((hole) => !hole.plateIds?.length && !hole.roles?.length);
  if (field && cuts.length) {
    const low = Math.min(...plan.plates.map((plate) => plate.zTop - plate.thickness)) - 1;
    const high = Math.max(...plan.plates.map((plate) => plate.zTop)) + 1;
    const shafts = cuts.flatMap((hole) => {
      const shaft = extrude(hole.polygon, high, high - low);
      return shaft ? [shaft] : [];
    });
    const cutter = union(Manifold, shafts, own);
    if (cutter) field = subtract(field, cutter, own);
  }

  for (const plate of plan.plates) {
    if (plate.role !== "support") continue;
    const bottom = plate.zTop - plate.thickness;
    let zTop = plate.zTop;
    if (autoTieSupportsToRoof && plate.polygon.some((point) => roofs.some((roof) => pointInPoly(point, roof.polygon)))) {
      zTop = Math.max(zTop, ...roofs.map((roof) => roof.zTop));
      roofTied = true;
    }
    let solid = extrude(plate.polygon, zTop, zTop - bottom);
    if(solid)for(const hole of voids.filter(hole=>matchesPlate(hole,plate))){
      const cutter=extrude(hole.polygon,zTop+.1,zTop-bottom+.2);
      if(cutter)solid=subtract(solid,cutter,own);
    }
    if (solid) connectors.push(solid);
  }

  if (autoTieSupportsToRoof && !roofTied) {
    const hosts = plan.plates.filter((plate) => plate.role !== "roof" && plate.role !== "support" && plate.role !== "wall" && plate.role !== "column");
    const host = [...hosts].sort((a, b) => b.zTop - a.zTop).find((plate) => {
      const center = centroid(plate.polygon);
      return roofs.some((roof) => pointInPoly(center, roof.polygon)) && !plan.voids.some((hole) => hole.cut && pointInPoly(center, hole.polygon));
    });
    if (host) {
      const center = centroid(host.polygon);
      const top = Math.max(...roofs.map((roof) => roof.zTop));
      const column = extrude(square(center, 0.7), top, top - (host.zTop - host.thickness));
      if (column) connectors.push(column);
    }
  }

  for (const link of plan.links) {
    const ramp = extrudeLink(Manifold, link, own);
    if (ramp) connectors.push(ramp);
  }
  const sillJoin = joinSills(Manifold, plan, own);
  if (sillJoin) connectors.push(sillJoin);

  const form = union(Manifold, [field, ...connectors].filter((solid): solid is Manifold => Boolean(solid)), own);
  const walls = union(Manifold, wallPlates, own);
  const combined = union(Manifold, [form, walls].filter((solid): solid is Manifold => Boolean(solid)), own);
  return { floorsAndColumns: field, form, walls, combined };
}

function extrudeLink(Manifold: ManifoldToplevel["Manifold"], link: OfficePlan["links"][number], own: (solid: Manifold) => Manifold) {
  const dx = link.to[0] - link.from[0], dy = link.to[1] - link.from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;
  const extra = 0.3, half = link.width / 2, height = Math.max(link.thickness, 0.05);
  const loop: Pt[] = [[-extra, -half], [len + extra, -half], [len + extra, half], [-extra, half]];
  const base = Manifold.extrude([loop], height);
  if (base.status() !== "NoError") { try { base.delete(); } catch { /* already released */ } return null; }
  const warped = base.warp((point) => {
    const t = Math.max(0, Math.min(1, point[0] / len));
    point[2] += link.z0 + (link.z1 - link.z0) * t - height;
  });
  const turned = warped.rotate([0, 0, Math.atan2(dy, dx) * 180 / Math.PI]).translate([link.from[0], link.from[1], 0]);
  if (turned.status() !== "NoError" || turned.isEmpty()) { try { turned.delete(); } catch { /* already released */ } return null; }
  return own(turned);
}

function union(Manifold: ManifoldToplevel["Manifold"], solids: Manifold[], own: (solid: Manifold) => Manifold) {
  const items = solids.filter((solid) => solid && !solid.isEmpty());
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  const merged = Manifold.union(items);
  if (merged.status() !== "NoError" || merged.isEmpty() || merged.volume()<=0) {
    merged.delete();
    throw Error("Void-Edge workspace rule AG-10: could not join all planned parts into a valid assembly.");
  }
  return own(merged);
}

function subtract(body: Manifold, cutter: Manifold, own: (solid: Manifold) => Manifold) {
  const cut = body.subtract(cutter);
  if (cut.status() !== "NoError" || cut.isEmpty()) { try { cut.delete(); } catch { /* already released */ } return body; }
  return own(cut);
}

function signedArea(poly: Pt[]) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}
function ccw(poly: Pt[]) { return signedArea(poly) >= 0 ? poly : [...poly].reverse(); }
function centroid(poly: Pt[]): Pt {
  const area = signedArea(poly) || 1e-8;
  let x = 0, y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], cross = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * cross; y += (p[1] + q[1]) * cross;
  }
  return [x / (6 * area), y / (6 * area)];
}
function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}
function joinSills(Manifold: ManifoldToplevel["Manifold"], plan: OfficePlan, own: (solid: Manifold) => Manifold) {
  const sillA = plan.plates.find((plate) => plate.id === "sill-a");
  const sillB = plan.plates.find((plate) => plate.id === "sill-b");
  if (!sillA || !sillB) return null;
  const low = sillA.zTop <= sillB.zTop ? sillA : sillB;
  const high = low === sillA ? sillB : sillA;
  const ys = low.polygon.map((point) => point[1]);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return extrudeLink(Manifold, {
    id: "sill-join",
    from: [-0.8, midY],
    to: [0.8, midY],
    z0: low.zTop,
    z1: high.zTop,
    width: 3,
    thickness: Math.min(low.thickness, high.thickness, 0.4),
  }, own);
}
function extendSill(plate: OfficePlan["plates"][number]): Pt[] {
  const maxY = Math.max(...plate.polygon.map((point) => point[1]));
  const towardNeighbor = plate.id.endsWith("-b") ? -1 : 1;
  return plate.polygon.map(([x, y]) => {
    const ny = Math.abs(y - maxY) < 0.25 ? y + 0.45 : y;
    const nx = Math.abs(x) < 0.25 ? x + towardNeighbor * 0.45 : x;
    return [nx, ny] as Pt;
  });
}
function square(center: Pt, size: number): Pt[] {
  const half = size / 2;
  return [[center[0] - half, center[1] - half], [center[0] + half, center[1] - half], [center[0] + half, center[1] + half], [center[0] - half, center[1] + half]];
}
