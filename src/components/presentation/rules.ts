import type {Iso,PresentationStudy} from './types';
import {SHARED_BOARD_RULES} from './formatContract';
export {SHARED_BOARD_RULES} from './formatContract';
export const GATHERING_BOARD_RULES=Object.freeze({
 'vertical-walls':Object.freeze({strategy:'steppedRules',iso:'SE' as Iso,orientationRows:[.10,.54],generationRows:[.10,.54],section:'saved cutter / physical wall profiles',annotations:'saved source pose and terrace dimensions'}),
 'linear-edge-gallery':Object.freeze({strategy:'galleryPanel + galleryJoint',iso:'SE' as Iso,sectionPlanY:.03125,formImageTop:.025,section:'saved footprint surfaces; base / transition / roof elevations',annotations:'saved perimeter loops, receiving edge stations and source-derived clearance'}),
 'inserted-plate':Object.freeze({strategy:'plateRulesPanel + platePlans + plateJunctionSvg',iso:'Pier' as Iso,formWidth:.56,detailRowGapIncrease:.073,section:'plate-wall joint and saved floor contours',annotations:'per-floor plans and unchanged junction illustration'}),
 'room-within-volume':Object.freeze({strategy:'saved perimeter tiers / stacked room and roof details',iso:'SW' as Iso,stackedRowPitch:.44,roomDetailOpacity:.48,section:'saved roomCutaway and actual loft profiles',annotations:'actual letter counts, sizes, floor elevation and top-plank mode'}),
 'void-field':Object.freeze({strategy:'voidFieldRules + findFacadeJoint',iso:'SE' as Iso,section:'actual facade joint; sightline section through saved tested path',annotations:'saved tilt / rotation range and original void contours'}),
});
export type SectionRule={axis:'x'|'y'|'longest-plan';origin:'bounds-center'|'primary-void';fraction:number};
export type AdaptedProfile={status:'proposed';iso:Iso;section:SectionRule;contextOpacity:number;orientation:'plan'|'isometric';note:string};
const proposed=(iso:Iso,axis:SectionRule['axis'],origin:SectionRule['origin'],orientation:AdaptedProfile['orientation'],note:string):AdaptedProfile=>({status:'proposed',iso,section:{axis,origin,fraction:.5},contextOpacity:.35,orientation,note});
/** These are presentation proposals, not imported architectural-generation rules. */
export const ADAPTED_BOARD_RULES:Readonly<Record<string,AdaptedProfile>>={
 'open-hall-workspace':proposed('SE','y','bounds-center','plan','Longitudinal section through the saved hall; separate perimeter walls remain visible.'),
 'flat-deep-plan-plate':proposed('SE','x','bounds-center','plan','Cross-section through the saved deep plate; plan view preserves its breadth.'),
 'cascaded-terraced-plates':proposed('SW','y','bounds-center','isometric','Section and oblique orientation show the actual terrace elevations.'),
 'void-edge-workspace':proposed('NE','x','primary-void','plan','Section uses a recorded void center when available; otherwise the actual mesh center.'),
 'folded-undulating-work-surface':proposed('SE','y','bounds-center','isometric','Section exposes the saved folds; no flattened plate is substituted.'),
 'linear-gallery-lobby':proposed('SE','y','primary-void','plan','Section follows the elongated saved Lobby, using a recorded void center.'),
 'compressed-sequential-lobby':proposed('SE','x','primary-void','plan','Transverse section distinguishes the compressed sequence from the linear Lobby.'),
 'topographic-ground-field-lobby':proposed('SW','y','primary-void','isometric','Oblique orientation and a mesh-centered section show the saved ground-field relief.'),
 'vertical-void-lobby':proposed('SW','x','primary-void','isometric','Vertical section passes through the recorded void center.'),
 'continuous-hall-lobby':proposed('SE','y','primary-void','plan','Longitudinal section follows the saved hall without generating new geometry.'),
};
export const APPROVED_STUDY_PRESENTATION_OVERRIDES:Readonly<Record<string,{iso:Iso;source:string}>>={
 '1c16cdee-59af-4ca0-ad74-9695a120d4b8':{iso:'SE',source:'Approved Stepped PNG and saved configuration'},
 '7f45b9b2-b404-4ce9-bab5-11997e124ed6':{iso:'SE',source:'Approved Linear PNG; 20-ft field and saved section elevations'},
 '51c37bd5-0170-47a5-8184-5961d97e7e3a':{iso:'Pier',source:'Study 135 PNG; actual saved corner pier determines azimuth'},
 '72883ed3-ea47-4475-8172-3dc491735798':{iso:'SW',source:'Approved Room PNG; saved full-rim planks and print-wall configuration'},
 'c1fbdb4a-6f45-4b98-86d3-0255b7fdab01':{iso:'SE',source:'Approved Void PNG; saved face-normal facade and physical joint'},
};
export type PresentationOverrides={iso?:Iso;section?:Partial<SectionRule>;contextOpacity?:number;visibleComponentIds?:readonly string[]};
export function resolvePresentationRules(study:PresentationStudy,manual:PresentationOverrides={}){
 const gathering=study.category==='gathering'?GATHERING_BOARD_RULES[study.typology as keyof typeof GATHERING_BOARD_RULES]:undefined;
 const approved=APPROVED_STUDY_PRESENTATION_OVERRIDES[study.originalId];
 const adaptation=ADAPTED_BOARD_RULES[study.typology]??proposed('SE','longest-plan','bounds-center','isometric','Unregistered typology: automatic framing and section are proposed for review. Register an explicit profile before treating it as approved.');
 const pier=study.record.components.some(c=>c.id.startsWith('corner-pier-'));
 const defaultIso=approved?.iso??(gathering?study.typology==='inserted-plate'&&!pier?'SE':gathering.iso:adaptation.iso);
 const section={...adaptation.section,...manual.section};
 if(!Number.isFinite(section.fraction)||section.fraction<0||section.fraction>1)throw Error('Section fraction must be between zero and one.');
 const contextOpacity=manual.contextOpacity??adaptation.contextOpacity;
 if(!Number.isFinite(contextOpacity)||contextOpacity<0||contextOpacity>1)throw Error('Presentation opacity must be between zero and one.');
 return {shared:SHARED_BOARD_RULES,gathering,adaptation,approvedStudy:approved,status:gathering?'approved Gathering strategy' as const:'proposed adaptation' as const,iso:manual.iso??defaultIso,section,contextOpacity,visibleComponentIds:manual.visibleComponentIds};
}
