import type { PlacedTile, TileModel, Vec3 } from "./types";
import type { ConnectorSurface } from "./connectionClearance";
import { measureFlushWalkingInterface } from "./surfaceAttachment";
import { validateWalkingApproach } from "./walkingApproach";

/** Verify a straight internal corridor on EXISTING material, never a generated
 * slab or an assumed edge between two ports belonging to the same form.
 * Longer/curved/stair routes remain unverified by this bounded method. */
export function originalWalkingCorridor(model:TileModel,tile:PlacedTile,a:Vec3,b:Vec3,width:number,models:TileModel[],tiles:PlacedTile[],existing:ConnectorSurface[]=[]){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  const fail=(reason:string)=>({status:"UNVERIFIED" as const,reason,checks:[] as unknown[]});
  if(!Number.isFinite(length+width)||width<2||length<.1||length>24)return fail("internal corridor/junction outside bounded straight-footprint method");
  if(Math.abs(b[2]-a[2])/length>1/12+1e-6)return fail("internal chord exceeds walking slope");
  const ux=dx/length,uy=dy/length,count=Math.ceil(length/6),checks:unknown[]=[];
  const center=(u:number):Vec3=>a.map((v,k)=>v+(b[k]-v)*u) as Vec3;
  // Exact full-width section contact also prevents nominal heights above the
  // actual floor from being mistaken for a continuous internal walking path.
  for(let i=0;i<=count;i++){
    const p=center(i/count),section:[Vec3,Vec3]=[[p[0]-uy*width/2,p[1]+ux*width/2,p[2]],[p[0]+uy*width/2,p[1]-ux*width/2,p[2]]];
    const contact=measureFlushWalkingInterface(model,tile,section);
    if(!contact.valid)return fail("internal section lacks flush full-width original floor support");
    if(i<count){const result=validateWalkingApproach(model,tile,p,[-ux,-uy,0],width,length/count,models,tiles,existing);
      checks.push({start:p,depth:length/count,reason:result.reason,valid:result.valid});
      if(!result.valid)return {status:"UNVERIFIED" as const,reason:result.reason,checks};}
  }
  return {status:"VERIFIED" as const,reason:"full-width original corridor, slope and swept headroom verified",checks};
}
