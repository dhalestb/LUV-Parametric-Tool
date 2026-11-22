import type { FloorSample } from './surfaces';

export type PlatformBand = { id:number; elevation:number; minZ:number; maxZ:number; area:number; sampleIds:number[]; kind:'platform'|'transition' };
export type PlatformOptions = { elevationToleranceFeet:number; minimumPlatformAreaFeet2:number };
export const DEFAULT_PLATFORM_OPTIONS: PlatformOptions = { elevationToleranceFeet:0.125, minimumPlatformAreaFeet2:32 };

/** Anchored elevation bands cannot chain adjacent stair treads into a floor.
 * Small bands remain transitions rather than disappearing from the graph.
 * This classification is geometric support, not a room/program designation.
 */
export function platformBands(samples:readonly FloorSample[], options:PlatformOptions=DEFAULT_PLATFORM_OPTIONS):PlatformBand[] {
  if(!Number.isFinite(options.elevationToleranceFeet)||options.elevationToleranceFeet<=0||!Number.isFinite(options.minimumPlatformAreaFeet2)||options.minimumPlatformAreaFeet2<=0) throw new Error('Platform tolerances must be positive finite values.');
  const sorted=samples.filter(s=>!s.roofLid&&s.floorClass!=='obstructed').slice().sort((a,b)=>a.position[2]-b.position[2]||a.id-b.id);
  const groups:FloorSample[][]=[];
  for(const s of sorted){const last=groups.at(-1);if(last&&s.position[2]-last[0].position[2]<=options.elevationToleranceFeet)last.push(s);else groups.push([s]);}
  return groups.map((group,id)=>{const area=group.reduce((n,s)=>n+s.area,0);return {id,elevation:group.reduce((n,s)=>n+s.area*s.position[2],0)/area,minZ:group[0].position[2],maxZ:group.at(-1)!.position[2],area,sampleIds:group.map(s=>s.id),kind:area>=options.minimumPlatformAreaFeet2?'platform':'transition'};});
}
