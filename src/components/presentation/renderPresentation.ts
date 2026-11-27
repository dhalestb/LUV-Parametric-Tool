import {adaptPresentationRecord,type PresentationOptions,type PresentationStudy} from './types';
import {createAmphitheaterPlate} from './approved/amphitheaterPresentationRender';
import type {AmphitheaterResult} from './approved/amphitheaterInteractiveTypes';
import {renderAdaptedPresentation} from './adaptedPresentation';
import {resolvePresentationRules,type PresentationOverrides} from './rules';
export {adaptPresentationRecord};
export async function renderPresentation(study:PresentationStudy,options:PresentationOptions,overrides:PresentationOverrides={}){
 const rules=resolvePresentationRules(study,overrides);
 return rules.gathering?createAmphitheaterPlate(study.record as unknown as AmphitheaterResult,options):renderAdaptedPresentation(study,options,overrides);
}
