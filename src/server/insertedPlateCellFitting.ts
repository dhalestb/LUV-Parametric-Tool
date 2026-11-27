import {plateCellExpansionLimit,expandPlateCenters,LEGACY_PLATE_PLACEMENT_REVISION as PLATE_PLACEMENT_REVISION,PLATE_REFERENCE_ID} from '../components/gathering-recovery/insertedPlateCellPlacement';
import type {AmphitheaterRequest,AmphitheaterResult} from '../../vendor/gathering-preserved/src/components/amphitheaterInteractiveTypes';
type Snapshot={platePlacement?:{revision:string;referenceStudyId?:string;expansionFactor?:number;cellLimit?:number;checks?:{factor:number;passed:boolean;reason?:string}[]}};
export async function fitPlateCellPlacement(request:AmphitheaterRequest,generate:(candidate:AmphitheaterRequest,index:number)=>Promise<AmphitheaterResult>){
 const settings=(request.sourceSnapshot as Snapshot)?.platePlacement;
 if(settings?.revision!==PLATE_PLACEMENT_REVISION)throw Error('Unknown Inserted Horizontal Plate placement revision.');
 const limit=plateCellExpansionLimit(request.source,request.field),checks:{factor:number;passed:boolean;reason?:string}[]=[];
 let chosen:AmphitheaterResult|undefined,low=1,high=limit;
 async function attempt(factor:number){
  const candidate={...request,source:expandPlateCenters(request.source,factor),sourceSnapshot:{...(request.sourceSnapshot as object),platePlacement:{revision:PLATE_PLACEMENT_REVISION,referenceStudyId:PLATE_REFERENCE_ID,expansionFactor:factor,cellLimit:limit}}};
  try{const result=await generate(candidate,checks.length);if(!result.validation?.passed)throw Error('Exported geometry rejected');checks.push({factor,passed:true});chosen=result;low=factor;return true;}
  catch(error){const e=error as Error&{stderr?:string},detail=e.stderr??e.message,reason=detail.match(/Error: ([^\r\n]+)/)?.[1]??detail.slice(0,500);
   // Retry poses only for native geometric rejection, never for unavailable code or a timeout.
   if(!/Incomplete|No (?:sealed wall receiver|clear plate landing|receiving wall|inward receiving edge|full curved receiver|direct perimeter continuation)|Full L pier misses|Insufficient|NotManifold|Exported geometry rejected|outside the (?:selected )?field|envelope is disconnected|NoError|Turn the|No finished wall seam/i.test(reason))throw error;
   checks.push({factor,passed:false,reason});high=factor;return false;
  }
 }
 // Descend from the glyph-contained cell limit, then refine the largest passing
 // interval. Every accepted pose uses the unchanged native wall/plate validator.
 for(let step=8;step>=1;step--)if(await attempt(1+(limit-1)*step/8))break;
 if(!chosen)throw Error('No clear plate landing: outward placement cannot preserve the approved Study 135 wall and plate connections. Choose New Design or adjust size, spacing or field.');
 for(let i=0;i<2&&high-low>1e-5;i++)await attempt((low+high)/2);
 const result=chosen as AmphitheaterResult;
 result.request={...result.request,sourceSnapshot:{...(result.request.sourceSnapshot as object),platePlacement:{...((result.request.sourceSnapshot as Snapshot).platePlacement),checks}}};
 return result;
}
