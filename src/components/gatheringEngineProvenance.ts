/** Request metadata only. The preserved package owns every placement/geometry rule. */
export const GATHERING_ENGINE_REVISION = 'gathering-nov22-v1';
export type GatheringContinuation = {
 gatheringEngineRevision:string;
 gatheringParentStudyId:string;
 gatheringOperation:'regenerate'|'verified-copy';
};
type Study = {id:string;request:unknown;provenance?:unknown};
export function recordedGatheringRevision(study:Study|undefined):string|undefined {
 if(!study)return;
 const request=study.request as {gatheringEngineRevision?:unknown};
 const provenance=study.provenance as {gatheringEngine?:{revision?:unknown}}|undefined;
 const value=request.gatheringEngineRevision??provenance?.gatheringEngine?.revision;
 return typeof value==='string'?value:undefined;
}
export function gatheringContinuation(study:Study|undefined):Partial<GatheringContinuation> {
 if(!study)return {};
 const revision=recordedGatheringRevision(study);
 return {gatheringEngineRevision:revision??GATHERING_ENGINE_REVISION,gatheringParentStudyId:study.id,gatheringOperation:revision?'regenerate':'verified-copy'};
}
