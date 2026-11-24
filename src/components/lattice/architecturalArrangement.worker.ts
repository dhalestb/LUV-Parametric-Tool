import { studyArchitecturalArrangements, type ArchitecturalBudget, type ArchitecturalPreferences, type ArchitecturalStudy } from "./architecturalArrangement";
import { geometryRevision } from "./geometryRevision";
import { studyBranchAdaptations } from "./branchAdaptationStudy";
import type { LatticeField, PlacedTile, TileModel } from "./types";

export type ArchitecturalWorkerRequest={models:TileModel[];seeds:PlacedTile[];field:LatticeField;preferences:ArchitecturalPreferences;budget:ArchitecturalBudget;adaptBranches?:boolean;branchSurfaceTargets?:boolean};
export type ArchitecturalWorkerResponse={kind:"progress";message:string}|{kind:"checkpoint"|"result";study:ArchitecturalStudy}|{kind:"error";message:string};
const scope=self as unknown as {postMessage:(message:ArchitecturalWorkerResponse)=>void;onmessage:((event:MessageEvent<ArchitecturalWorkerRequest>)=>void)|null};
let started=false;
scope.onmessage=event=>{
  if(started)return;started=true;
  const request=event.data,guards=request.models.map(m=>m.connectionSurface?geometryRevision(m.connectionSurface):null);
  const preserved=()=>request.models.every((m,i)=>!!m.connectionSurface&&geometryRevision(m.connectionSurface)===guards[i]);
  const emit=(kind:"checkpoint"|"result",study:ArchitecturalStudy)=>{
    if(!preserved())throw new Error("Worker source geometry changed; result rejected");
    scope.postMessage({kind,study:{...study,execution:{environment:"browser module worker",sourcePreservation:"VERIFIED",interrupted:false}}});
  };
  const progress=(message:string)=>scope.postMessage({kind:"progress",message});
  const workflow=request.adaptBranches?studyBranchAdaptations(request.models,request.seeds,request.field,request.preferences,request.budget,progress,study=>emit("checkpoint",study),request.branchSurfaceTargets):
    studyArchitecturalArrangements(request.models,request.seeds,request.field,request.preferences,request.budget,progress,()=>false,study=>emit("checkpoint",study));
  void workflow
    .then(study=>emit("result",study))
    .catch(error=>scope.postMessage({kind:"error",message:error instanceof Error?error.message:String(error)}));
};
