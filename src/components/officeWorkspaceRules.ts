// Compatibility routing only. Architectural policies live in separate typology modules.
import * as rules0 from "./workspace-rules/open-hall-workspace";
import * as rules1 from "./workspace-rules/flat-deep-plan-plate";
import * as rules2 from "./workspace-rules/cascaded-terraced-plates";
import * as rules3 from "./workspace-rules/void-edge-workspace";
import * as rules4 from "./workspace-rules/folded-undulating-work-surface";
export type { Pt, MezzanineWrapFaces, OpenHallCorner, OpenHallGuideRole, OpenHallGuideCandidate, OfficeField, OfficeCheck, OfficePlate, OfficeVoid, OfficeLink, OfficeSlot, OfficePlan } from "./workspace-rules/contracts";
export { DEFAULT_OFFICE_FIELD, MEZZANINE_MIN_WIDTH, OPEN_HALL_OPENING_MIN, OPEN_HALL_OPENING_MAX, OPEN_HALL_OPENING_TARGET, OPEN_HALL_WALL_THICKNESS, OPEN_HALL_ENTRY_WIDTH, OPEN_HALL_COLUMN_SIZES, OPEN_HALL_COLUMN_GRID_SPACINGS, OPEN_HALL_FLOOR_MEZZ_GUIDE_SIZES, OPEN_HALL_WALL_GUIDE_SIZES, OPEN_HALL_ROOF_GUIDE_SIZES, OPEN_HALL_DEFAULT_COLUMN_SIZE, OPEN_HALL_DEFAULT_COLUMN_GRID_SPACING, OPEN_HALL_DEFAULT_FLOOR_MEZZ_GUIDE_SIZE, OPEN_HALL_DEFAULT_WALL_GUIDE_SIZE, OPEN_HALL_DEFAULT_ROOF_GUIDE_SIZE, OPEN_HALL_ROOF_GUIDE_COUNT, normalizeOpenHallGuideSize, normalizeOpenHallColumnSize, normalizeOpenHallColumnGridSpacing, normalizeOpenHallFloorMezzGuideSize, normalizeOpenHallWallGuideSize, normalizeOpenHallRoofGuideSize, nudgePlacementIntoField, buildOpenHallGuideLetters } from "./workspace-rules/open-hall-workspace";
const modules: Record<string, Pick<typeof rules0, "planOfficeWorkspace" | "resolveOfficePlan" | "arrangeOfficeLetters" | "officePlanReady">> = {
  "open-hall-workspace": rules0,
  "flat-deep-plan-plate": rules1,
  "cascaded-terraced-plates": rules2,
  "void-edge-workspace": rules3,
  "folded-undulating-work-surface": rules4,
};
export const OFFICE_TYPOLOGIES = new Set(Object.keys(modules));
function rulesFor(typology: string) {
 const rules = Object.hasOwn(modules, typology) ? modules[typology] : undefined;
 if (!rules) throw Error("Unknown workspace typology: "+typology);
 return rules;
}
export function planOfficeWorkspace(...args: Parameters<typeof rules0.planOfficeWorkspace>) { return rulesFor(args[0]).planOfficeWorkspace(...args); }
export function resolveOfficePlan(...args: Parameters<typeof rules0.resolveOfficePlan>) { return rulesFor(args[0]).resolveOfficePlan(...args); }
export function arrangeOfficeLetters(...args: Parameters<typeof rules0.arrangeOfficeLetters>) { return rulesFor(args[1]).arrangeOfficeLetters(...args); }
export function officePlanReady(plan: Parameters<typeof rules0.officePlanReady>[0]) { return rulesFor(plan.typology).officePlanReady(plan); }
