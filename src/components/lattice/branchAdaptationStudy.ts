import { adaptBranch, branchAdjustmentPlans, type BranchProvenance } from "./branchAdaptation";
import { architecturalSurfaces } from "./architecturalSurfaces";
import { studyArchitecturalArrangements, rankArchitecturalCandidates, type ArchitecturalStudy, type ArchitecturalPreferences, type ArchitecturalBudget, type ArchitecturalCandidate } from "./architecturalArrangement";
import type { TileModel, PlacedTile, LatticeField } from "./types";

export type AdaptedCandidate=ArchitecturalCandidate & {workingModels?:TileModel[];branchAdaptations?:BranchProvenance[]};
export type BranchStudy=ArchitecturalStudy & {originalModels?:TileModel[];adaptationAttempts?:Array<{source:string;plan:unknown;reason:string;maximumDisplacement?:number;witness?:unknown}>};
/** Unmodified branch-only attempts precede private working adaptations. Search
 * stays bounded, cannot fall back to a broad floor-plate success, and includes
 * deformation magnitude in its separate design cost. All actual connector
 * checks run on reanalyzed final working geometry, not the untouched original. */
export async function studyBranchAdaptations(models:TileModel[],seeds:PlacedTile[],field:LatticeField,prefs:ArchitecturalPreferences,budget:ArchitecturalBudget,
  progress:(message:string)=>void,checkpoint:(study:BranchStudy)=>void,branchSurfaceTargets=false):Promise<BranchStudy>{
  const started=performance.now(),attempts:NonNullable<BranchStudy["adaptationAttempts"]>=[];
  const features=models.map(architecturalSurfaces);
  if(!features.some(regions=>regions.some(r=>r.role==="projecting branch"))){
    return {preferences:prefs,budget,generated:0,evaluated:0,routes:0,arrangements:[],features,incomplete:true,
      stopReason:"no geometry-classified projecting branch available for the implemented local adaptation; floor-surface adaptation remains unsupported",
      durationMs:performance.now()-started,setupMs:performance.now()-started,method:"branch adaptation eligibility screening",originalModels:models,adaptationAttempts:[]};
  }
  const bounded={...budget,proposals:Math.min(48,budget.proposals),arrangements:2,routes:Math.min(32,budget.routes),milliseconds:Math.min(40000,budget.milliseconds)};
  progress("Testing original projecting branches before local adaptation");
  const result:BranchStudy=await studyArchitecturalArrangements(models,seeds,field,prefs,bounded,progress,()=>false,checkpoint,true,branchSurfaceTargets);
  result.adaptationAttempts=attempts;result.method="unmodified branch-only baseline, bounded private branch-end adaptation, fresh final working-mesh and circulation validation";
  result.originalModels=models;
  if(result.arrangements.some(a=>a.selected.length))return result;
  const branches=models.map(m=>architecturalSurfaces(m).filter(r=>r.role==="projecting branch").sort((a,b)=>a.relativeElevation-b.relativeElevation||b.area-a.area)[0]);
  // Small widening/contour and bounded branch-tip setback hypotheses.
  // The adjustment API also supports bounded extension/redirection/elevation;
  // those require a diagnosed directional or level deficiency, not blind use.
  const planGroups=branches.map(b=>b?branchAdjustmentPlans(b):[]);
  const planCount=Math.max(0,...planGroups.map(plans=>plans.length));
  for(let step=0;step<planCount;step++){
    if(performance.now()-started>=budget.milliseconds||result.routes>=budget.routes){result.incomplete=true;result.stopReason="branch adaptation wall/route budget";break;}
    const working=models.slice(),provenance:BranchProvenance[]=[];
    for(let i=0;i<models.length;i++){
      const plan=planGroups[i][step];if(!plan)continue;
      progress(`Branch working copy ${step+1}/${planCount}: bounded adjustment of instance ${i+1}`);
      await new Promise(resolve=>setTimeout(resolve,0));
      const adaptation=adaptBranch(models[i],plan);
      attempts.push({source:models[i].id,plan,reason:adaptation.valid?"working geometry valid; connector unverified":adaptation.reason,
        maximumDisplacement:adaptation.valid?adaptation.provenance.maximumDisplacement:undefined,witness:adaptation.valid?undefined:adaptation.witness});
      if(adaptation.valid){working[i]=adaptation.model;provenance.push(adaptation.provenance);}
      if(performance.now()-started>=budget.milliseconds)break;
    }
    if(!provenance.length)continue;
    const remaining=budget.milliseconds-(performance.now()-started);if(remaining<1000||budget.routes-result.routes<8){result.incomplete=true;result.stopReason="working copy constructed; circulation untested due budget";break;}
    const run=await studyArchitecturalArrangements(working,seeds,field,prefs,{...bounded,milliseconds:Math.min(40000,remaining),routes:Math.min(32,budget.routes-result.routes)},progress,()=>false,()=>{},true,branchSurfaceTargets);
    for(const candidate of run.arrangements){const adapted:AdaptedCandidate={...candidate,id:`adapted-${step}-${candidate.id}`,workingModels:working,branchAdaptations:provenance,
      score:candidate.score-provenance.reduce((s,p)=>s+p.maximumDisplacement+p.displacementCost*.01,0)};result.arrangements.push(adapted);}
    result.routes+=run.routes;result.generated+=run.generated;result.evaluated+=run.evaluated;result.durationMs=performance.now()-started;checkpoint(result);
    if(run.arrangements.some(a=>a.selected.length))break;
  }
  result.arrangements=rankArchitecturalCandidates(result.arrangements);result.durationMs=performance.now()-started;
  if(result.durationMs>=budget.milliseconds){result.incomplete=true;result.stopReason="branch adaptation wall-time budget; remaining plans untested";}
  return result;
}
