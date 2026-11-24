import { DEFAULT_ASSIGNMENT_SEARCH_OPTIONS, type AssemblyTestMode, type AssignmentResult, type AssignmentSearchOptions } from "./assignmentSearch";
import type { AssignmentWorkerResponse } from "./assignmentSearch.worker";
import { geometryRevision } from "./geometryRevision";
import type { TileModel, LatticeField } from "./types";
export type AssignmentJob={result:Promise<AssignmentResult>;cancel:()=>void;dispose:()=>void};
let idleWorker:Worker|undefined;
export function disposeIdleAssignmentWorker(){idleWorker?.terminate();idleWorker=undefined;}
export function startAssignmentJob(models:TileModel[],count:1|2|3|4|8,mode:AssemblyTestMode,field:LatticeField,seeds:TileModel[],progress:(message:string,percent?:number)=>void,options:AssignmentSearchOptions=DEFAULT_ASSIGNMENT_SEARCH_OPTIONS):AssignmentJob{
  if(typeof Worker==="undefined")throw new Error("Assembly search requires module-worker support");
  const worker=idleWorker??new Worker(new URL("./assignmentSearch.worker.ts",import.meta.url),{type:"module"});idleWorker=undefined;
  const guards=models.map(m=>m.connectionSurface?geometryRevision(m.connectionSurface):null);
  const metadata=()=>JSON.stringify(models.map(m=>[m.id,m.anchor,m.sourceResponsiveExtensions,m.variants.map(v=>[v.rotation,v.mirror])]));const before=metadata();
  let settled=false,resolve!:(result:AssignmentResult)=>void,reject!:(error:Error)=>void;
  const result=new Promise<AssignmentResult>((a,b)=>{resolve=a;reject=b;});
  const finish=(value?:AssignmentResult,error?:string)=>{if(settled)return;settled=true;clearTimeout(timer);
    if(metadata()!==before||!models.every((m,i)=>!m.connectionSurface||geometryRevision(m.connectionSurface)===guards[i])){worker.terminate();reject(new Error("Source or transform changed; stale assembly rejected"));return;}
    if(value){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
      if(idleWorker&&idleWorker!==worker)idleWorker.terminate();idleWorker=worker;resolve(value);
    }else{worker.terminate();reject(new Error(error??"Assembly failed"));}};
  const timer=setTimeout(()=>finish(undefined,"Assembly wall-time limit; in-flight geometry remains unverified and the existing assembly is retained"),Math.min(315000,options.milliseconds+15000));
  worker.onmessage=(event:MessageEvent<AssignmentWorkerResponse>)=>{if(settled)return;const m=event.data;
    if(m.kind==="progress")progress(m.message,m.percent);else if(m.kind==="result")finish(m.result);else finish(undefined,m.message);};
  worker.onerror=()=>finish(undefined,"Assembly worker initialization/execution failed");worker.onmessageerror=()=>finish(undefined,"Assembly result transfer failed");
  try{worker.postMessage({models,count,mode,field,seedIds:seeds.map(m=>m.id.split("::")[0]),options});}catch(error){finish(undefined,String(error));}
  return {result,cancel:()=>finish(undefined,"cancelled"),dispose:()=>finish(undefined,"cancelled")};
}
