import {buildOfficeWorkspace as build0} from "./workspace-rules/open-hall-workspace.geometry";
import {buildOfficeWorkspace as build1} from "./workspace-rules/flat-deep-plan-plate.geometry";
import {buildOfficeWorkspace as build2} from "./workspace-rules/cascaded-terraced-plates.geometry";
import {buildOfficeWorkspace as build3} from "./workspace-rules/void-edge-workspace.geometry";
import {buildOfficeWorkspace as build4} from "./workspace-rules/folded-undulating-work-surface.geometry";
export type {OfficeWorkspaceSolids} from "./workspace-rules/open-hall-workspace.geometry";
const builders: Record<string, typeof build0> = {
"open-hall-workspace": build0,
"flat-deep-plan-plate": build1,
"cascaded-terraced-plates": build2,
"void-edge-workspace": build3,
"folded-undulating-work-surface": build4
};
export function buildOfficeWorkspace(...args: Parameters<typeof build0>) {
 const id=args[1].typology;
 const build=Object.hasOwn(builders,id)?builders[id]:undefined;
 if (!build) throw Error("Unknown workspace typology: "+id);
 return build(...args);
}
