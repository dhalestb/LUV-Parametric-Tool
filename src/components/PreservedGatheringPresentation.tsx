'use client';
import Presentation from './AmphitheaterPresentation';
import type {AmphitheaterResult as CurrentResult} from './amphitheaterInteractiveTypes';
import type {AmphitheaterResult} from '../../vendor/gathering-preserved/src/components/amphitheaterInteractiveTypes';
/** The completed renderer already accepts saved Linear Edge meshes at runtime. */
export default function PreservedGatheringPresentation({result,disabled}:{result:AmphitheaterResult;disabled?:boolean}){return <Presentation result={result as unknown as CurrentResult} disabled={disabled}/>;}
