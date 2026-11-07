import { DEFAULT_ARCHITECTURAL_BUDGET, rankArchitecturalCandidates, type ArchitecturalBudget, type ArchitecturalPreferences, type ArchitecturalStudy } from "./architecturalArrangement";
import type { ArchitecturalWorkerResponse } from "./architecturalArrangement.worker";
import { geometryRevision } from "./geometryRevision";
import type { LatticeField, PlacedTile, TileModel } from "./types";

export type ArchitecturalJob={result:Promise<ArchitecturalStudy>;cancel:()=>void;dispose:()=>void};
/** Copy imported analysis data into an isolated worker. No source ArrayBuffer
 * is transferred/detached, no main-thread fallback, and no automatic retry. */
export function startArchitecturalJob(models:TileModel[],seeds:PlacedTile[],field:LatticeField,preferences:ArchitecturalPreferences,
  progress:(message:string)=>void,budget:ArchitecturalBudget=DEFAULT_ARCHITECTURAL_BUDGET,adaptBranches=false,branchSurfaceTargets=false):ArchitecturalJob {
  if(typeof Worker==="undefined")throw new Error("Architectural comparison requires module-worker support; geometry remains UNVERIFIED");
  const guards=models.map(m=>m.connectionSurface?geometryRevision(m.connectionSurface):null),started=performance.now();
  const transforms=()=>JSON.stringify(models.map(m=>[m.id,m.anchor,m.variants.map(v=>[v.rotation,v.mirror])]));
  const transformGuard=transforms();
  const worker=new Worker(new URL("./architecturalArrangement.worker.ts",import.meta.url),{type:"module"});
  let checkpoint:ArchitecturalStudy|undefined,settled=false;
  let resolveResult!:(study:ArchitecturalStudy)=>void,rejectResult!:(error:Error)=>void;
  const result=new Promise<ArchitecturalStudy>((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
  const unchanged=()=>transforms()===transformGuard&&models.every((m,i)=>!!m.connectionSurface&&geometryRevision(m.connectionSurface)===guards[i]);
  const finish=(study?:ArchitecturalStudy,error?:string)=>{
    if(settled)return;settled=true;clearTimeout(timer);worker.terminate();
    if(!unchanged()){rejectResult(new Error("Source geometry changed during worker comparison; stale results rejected"));return;}
    if(study)resolveResult(study);else rejectResult(new Error(error??"Architectural worker failed; no completed geometry checkpoint"));
  };
  const interrupt=(reason:string)=>{
    if(checkpoint)finish({...checkpoint,arrangements:rankArchitecturalCandidates(checkpoint.arrangements),incomplete:true,stopReason:`${reason}; in-flight arrangement UNVERIFIED`,durationMs:performance.now()-started,
      execution:{environment:"browser module worker",sourcePreservation:"VERIFIED",interrupted:true}});
    else finish(undefined,`${reason}; no completed checkpoint, geometry UNVERIFIED`);
  };
  // External supervision also bounds an individual synchronous geometry call.
  // Only completed, independently validated arrangement checkpoints survive.
  const timer=setTimeout(()=>interrupt("worker wall-time limit"),Math.min(315000,Math.max(1000,budget.milliseconds)+15000));
  worker.onmessage=(event:MessageEvent<ArchitecturalWorkerResponse>)=>{
    if(settled)return;const message=event.data;
    if(message.kind==="progress")progress(message.message);
    else if(message.kind==="checkpoint")checkpoint=message.study;
    else if(message.kind==="result")finish(message.study);
    else if(message.kind==="error")interrupt(`worker error: ${message.message}`);
  };
  worker.onerror=()=>interrupt("worker initialization or geometry execution failed");
  worker.onmessageerror=()=>interrupt("worker result transfer failed");
  try{worker.postMessage({models,seeds,field,preferences,budget,adaptBranches,branchSurfaceTargets});}catch(error){finish(undefined,error instanceof Error?error.message:String(error));}
  return {result,cancel:()=>interrupt("cancelled"),dispose:()=>finish(undefined,"worker disposed")};
}
