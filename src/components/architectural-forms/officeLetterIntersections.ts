import * as rules0 from "./workspace-rules/open-hall-workspace.intersections";
import * as rules1 from "./workspace-rules/flat-deep-plan-plate.intersections";
import * as rules2 from "./workspace-rules/cascaded-terraced-plates.intersections";
import * as rules3 from "./workspace-rules/void-edge-workspace.intersections";
import * as rules4 from "./workspace-rules/folded-undulating-work-surface.intersections";
const modules: Record<string, typeof rules0 | typeof rules1 | typeof rules2 | typeof rules3 | typeof rules4> = {
"open-hall-workspace": rules0,
"flat-deep-plan-plate": rules1,
"cascaded-terraced-plates": rules2,
"void-edge-workspace": rules3,
"folded-undulating-work-surface": rules4
};
function forTypology(id: string) {
 if (!Object.hasOwn(modules,id)) throw Error("Unknown workspace typology: "+id);
 return modules[id];
}
export function arrangeIntersectingOfficeLetters(...args: Parameters<typeof rules0.arrangeIntersectingOfficeLetters>) { return forTypology(args[1]).arrangeIntersectingOfficeLetters(...args); }
export function validateIntersectingOffice(...args: Parameters<typeof rules0.validateIntersectingOffice>) { return forTypology(args[5].typology).validateIntersectingOffice(...args); }
