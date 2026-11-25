import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import {clusteredCut} from './clusteredCut';
import {cutArea} from './cutArea';
import {TYPOLOGIES,type Assignment,type Registry,type SiteInput,type Typology,type Zone} from './model';
import {adapterForVariant} from './adapters';
import tolerancePolicy from './geometryTolerances.json';
export const allocationAreaTolerance=(area:number)=>Math.max(tolerancePolicy.allocationAbsoluteFeet2,area*tolerancePolicy.allocationRelative);
export type Point=[number,number];
export type Ring=Point[];
export type Strategy='area'|'geometry';
export type Controls={clustering?:number;areaCutAngle?:number;enabled:Record<Typology,boolean>;locked:Record<Typology,boolean>;minimumDiameter:Record<Typology,number>;seed:number;reserved:{id:string;polygon:Ring}[]};
export type Territory={id:string;typology:Typology;contours:Ring[];area:number;requestedPercent:number;achievedPercent:number;label:Point;components:number;screen:'passes-planning-screen'|'infeasible';findings:string[];rules:ReturnType<typeof adapterForVariant>;parameters:{A:Record<string,unknown>;B:Record<string,unknown>}};
export type Result={strategy:Strategy;seed:number;signature:string;source:{id:string;revision:string;fingerprint:string};permitted:Ring[];protected:Ring[];grossArea:number;protectedArea:number;allocatableArea:number;territories:Territory[];metrics:{outside:number;overlap:number;omitted:number;maxAreaError:number;tolerance:number;allocationTolerance?:number;valid:boolean;milliseconds:number};cutDirections:Point[]};
export type TerritoryState={controls:Controls;results:Partial<Record<Strategy,Result>>};
export const defaults=():Controls=>({enabled:Object.fromEntries(TYPOLOGIES.map(t=>[t,true])) as Controls['enabled'],locked:Object.fromEntries(TYPOLOGIES.map(t=>[t,false])) as Controls['locked'],minimumDiameter:Object.fromEntries(TYPOLOGIES.map(t=>[t,20])) as Controls['minimumDiameter'],seed:2041,reserved:[]});
export const compositionControls=(controls:Controls=defaults()):Controls=>({...controls,clustering:controls.clustering??65});
export function redistribute(shares:Assignment['shares'],c:Controls):Assignment['shares'] {
 const next={...shares};let locked=0;const free:Typology[]=[];
 for(const t of TYPOLOGIES){if(!c.enabled[t]){if(c.locked[t]&&shares[t]!==0)throw Error('Unlock a nonzero allocation before disabling it.');next[t]=0;}else if(c.locked[t])locked+=shares[t];else free.push(t);}
 if(locked>100||(!free.length&&Math.abs(locked-100)>1e-8))throw Error('Locked percentages leave no valid redistribution.');
 const each=free.length?(100-locked)/free.length:0;free.forEach((t,i)=>{next[t]=i===free.length-1?100-locked-each*i:each;});return next;
}
export function validateAllocation(a:Assignment,c:Controls){let sum=0;for(const t of TYPOLOGIES){const n=a.shares[t];if(!Number.isFinite(n)||n<0||n>100)throw Error('Percentages must be finite and between 0 and 100.');if(!c.enabled[t]&&n!==0)throw Error('Disabled typologies must have zero allocation. Use explicit redistribution.');if(c.enabled[t])sum+=n;if(!Number.isFinite(c.minimumDiameter[t])||c.minimumDiameter[t]<=0)throw Error('Planning diameter must be positive.');}if(Math.abs(sum-100)>1e-8)throw Error(`Enabled allocations total ${sum}%; exactly 100% is required.`);if(!Number.isSafeInteger(c.seed))throw Error('Seed must be an integer.');}
export const signature=(site:SiteInput,zone:Zone,a:Assignment,c:Controls)=>JSON.stringify({version:2,source:site.fingerprint,zone:zone.id,polygon:zone.polygon,holes:zone.holes,exclusions:site.exclusions,corridors:site.corridors,reservedAreas:site.reservedAreas,shares:a.shares,variants:a.variants,controls:c});
export function currentTerritoryResult(site:SiteInput,zone:Zone,a:Assignment,c:Controls,r:Result){return r.signature===signature(site,zone,a,c)&&r.source.id===zone.id&&r.source.fingerprint===site.fingerprint&&r.source.revision===site.revision&&r.metrics.valid&&r.metrics.maxAreaError<=allocationAreaTolerance(r.allocatableArea);}
let initializing:Promise<ManifoldToplevel>|undefined;
export function geometryKernel(){if(!initializing){const entry='/geometry-runtime/manifold-3.5.3/manifold.js';initializing=import(/* webpackIgnore: true */ entry).then(async module=>{const api:ManifoldToplevel=await module.default();api.setup();return api;}).catch(error=>{initializing=undefined;throw error;});}return initializing;}
export function signedArea(r:Ring){return r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;}
const positive=(r:Ring)=>signedArea(r)<0?[...r].reverse():r;
/** Deterministic interior label, maximizing sampled distance to all outer/hole edges. */
function interiorLabel(rings:Ring[]):Point {
 const points=rings.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);let minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),best:Point=points[0],bestDistance=-1;const center:Point=[(minX+maxX)/2,(minY+maxY)/2],centrality=(p:Point)=>(p[0]-center[0])**2+(p[1]-center[1])**2;
 function distance(p:Point){let inside=false,distance=Infinity;for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[j],b=r[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));distance=Math.min(distance,(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2);}return inside?distance:-1;}
 for(let pass=0;pass<3;pass++){const sx=(maxX-minX)/16,sy=(maxY-minY)/16;for(let i=0;i<16;i++)for(let j=0;j<16;j++){const p:Point=[minX+(i+.5)*sx,minY+(j+.5)*sy],d=distance(p);if(d>bestDistance+1e-12||(Math.abs(d-bestDistance)<1e-12&&centrality(p)<centrality(best))){best=p;bestDistance=d;}}minX=best[0]-sx;maxX=best[0]+sx;minY=best[1]-sy;maxY=best[1]+sy;}
 return best;
}
export function generateTerritories(api:ManifoldToplevel,site:SiteInput,zone:Zone,a:Assignment,c:Controls,strategy:Strategy,registry:Registry):Result {
 const start=performance.now();validateAllocation(a,c);
 if(c.clustering!==undefined&&(!Number.isFinite(c.clustering)||c.clustering<0||c.clustering>100))throw Error('Clustering must be between 0 and 100.');
 if(!site.protectionMetadataComplete)throw Error('Reimport the source Site JSON to recover corridor and protected-area metadata omitted by the foundation.');
 const owned:CrossSection[]=[];const own=(v:CrossSection)=>{owned.push(v);return v;};
 const section=(rings:Ring[])=>own(new api.CrossSection(rings,'NonZero'));
 const ringSection=(r:Ring)=>section([positive(r)]);
 try{
 const outer=ringSection(zone.polygon),protectedPieces:CrossSection[]=[];
 for(const p of [...site.exclusions,...site.reservedAreas,...c.reserved])protectedPieces.push(ringSection(p.polygon));
 for(const h of zone.holes)protectedPieces.push(ringSection(h));
 // All imported view/circulation corridor centerlines are conservatively reserved.
 // Square end caps and round joints cover their stated full width.
 for(const corridor of site.corridors){const w=corridor.widthFeet/2;for(let i=0;i<corridor.points.length-1;i++){const p=corridor.points[i],q=corridor.points[i+1],dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);if(!len)continue;const ux=dx/len,uy=dy/len,nx=-uy*w,ny=ux*w;protectedPieces.push(ringSection([[p[0]-ux*w+nx,p[1]-uy*w+ny],[p[0]-ux*w-nx,p[1]-uy*w-ny],[q[0]+ux*w-nx,q[1]+uy*w-ny],[q[0]+ux*w+nx,q[1]+uy*w+ny]]));}}
 const protectedUnion=own(api.CrossSection.union(protectedPieces)),permitted=own(outer.subtract(protectedUnion)),clippedProtection=own(outer.intersect(protectedUnion));
 const area=permitted.area(),tolerance=Math.max(.001,area*1e-7),allocationTolerance=allocationAreaTolerance(area);
 if(area<=tolerance)throw Error('No allocatable area remains after protected regions.');
 const ids=TYPOLOGIES.filter(t=>c.enabled[t]&&a.shares[t]>0);
 // Seed rotates deterministic typology order; canonical order at seed 2041.
 const shift=((c.seed-2041)%ids.length+ids.length)%ids.length,order=[...ids.slice(shift),...ids.slice(0,shift)];
 let remaining=permitted;const sections:CrossSection[]=[],territories:Territory[]=[],cutDirections:Point[]=[];

 for(let index=0;index<order.length;index++){
 const id=order[index],requested=area*a.shares[id]/100;
 const xs=zone.polygon.map(p=>p[0]),zs=zone.polygon.map(p=>p[1]);
 const alongDepth=c.clustering!==undefined&&Math.max(...zs)-Math.min(...zs)>Math.max(...xs)-Math.min(...xs);
 const radians=(c.areaCutAngle??(alongDepth?90:0))*Math.PI/180;
 let n:Point=[Math.cos(radians),Math.sin(radians)];
 if(strategy==='geometry'){let length=-1;for(const r of remaining.toPolygons()){if(signedArea(r as Ring)<=0)continue;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length],dx=q[0]-p[0],dy=q[1]-p[1],d=Math.hypot(dx,dy);if(d>length+1e-8){length=d;n=[-dy/d,dx/d];}}}}
 cutDirections.push(n);const piece=index===order.length-1?remaining:own(strategy==='area'&&c.clustering!==undefined&&c.clustering<100?clusteredCut(api,remaining,zone.polygon,n,requested,allocationTolerance,c.clustering):cutArea(api,remaining,zone.polygon,n,requested,allocationTolerance));sections.push(piece);const contours=piece.toPolygons() as Ring[],measured=piece.area(),parts=piece.decompose();
 let label:Point=[0,0],bestArea=-1,screen:Territory['screen']='passes-planning-screen';const findings:string[]=[];
 for(const part of parts){const erosion=part.offset(-c.minimumDiameter[id]/2,'Round',2,32);if(erosion.isEmpty()){screen='infeasible';findings.push(`A component cannot contain the ${c.minimumDiameter[id]} ft planning-clearance disk.`);}if(part.area()>bestArea){bestArea=part.area();label=interiorLabel(part.toPolygons() as Ring[]);}erosion.delete();part.delete();}
 if(parts.length>1)findings.push(`${parts.length} disconnected components: future letter connectivity requires review.`);
 findings.push('Planning clearance is a user-selected geometric screen, not an authenticated typology minimum. Full A/B architectural fit remains unverified.');
 const rule=registry.items.find(t=>t.id===id)!;
 territories.push({id:`${zone.id}:${strategy}:${id}`,typology:id,contours,area:measured,requestedPercent:a.shares[id],achievedPercent:measured/area*100,label,components:parts.length,screen,findings,rules:adapterForVariant(registry,id,a.variants[id]),parameters:{A:rule.A.parameters,B:rule.B.parameters}});
 if(index<order.length-1)remaining=own(remaining.subtract(piece));
 }
 const union=own(api.CrossSection.union(sections)),outside=own(union.subtract(permitted)).area(),omitted=own(permitted.subtract(union)).area();let overlap=0;for(let i=0;i<sections.length;i++)for(let j=i+1;j<sections.length;j++)overlap+=own(sections[i].intersect(sections[j])).area();
 const maxAreaError=Math.max(...territories.map(t=>Math.abs(t.area-area*t.requestedPercent/100)));
 return {strategy,seed:c.seed,signature:signature(site,zone,a,c),source:{id:zone.id,revision:site.revision,fingerprint:site.fingerprint},permitted:permitted.toPolygons() as Ring[],protected:clippedProtection.toPolygons() as Ring[],grossArea:outer.area(),protectedArea:clippedProtection.area(),allocatableArea:area,territories,cutDirections,metrics:{outside,overlap,omitted,maxAreaError,tolerance,allocationTolerance,valid:outside<=tolerance&&overlap<=tolerance&&omitted<=tolerance&&maxAreaError<=allocationTolerance&&territories.every(t=>t.area>0),milliseconds:performance.now()-start}};
 }finally{for(const shape of owned.reverse())shape.delete();}
}
