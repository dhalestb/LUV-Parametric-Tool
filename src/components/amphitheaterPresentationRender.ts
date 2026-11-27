import type {AmphitheaterResult} from './amphitheaterInteractiveTypes';
import {adaptPresentationRecord,renderPresentation} from './presentation/renderPresentation';
import type {PresentationCategory,PresentationOptions} from './presentation/types';
import {SHARED_BOARD_RULES,type PresentationOverrides} from './presentation/rules';
export type {PresentationOptions};
export const BOARD_WIDTH=SHARED_BOARD_RULES.width,BOARD_HEIGHT=SHARED_BOARD_RULES.height;
export type PresentationContext={category?:PresentationCategory;typology?:string;title?:string};
export function createAmphitheaterPlate(result:AmphitheaterResult,options:PresentationOptions,context?:PresentationContext,overrides?:PresentationOverrides){
 return renderPresentation(adaptPresentationRecord(result,context),options,overrides);
}
