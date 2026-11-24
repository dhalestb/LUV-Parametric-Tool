import * as openHall from "./workspace-rules/open-hall-workspace";
import * as flatPlate from "./workspace-rules/flat-deep-plan-plate";
import * as existing from "./officeWorkspaceRules";
export type { OfficeCheck, OfficeField, OfficePlan } from "./workspace-rules/contracts";
export { OFFICE_TYPOLOGIES } from "./officeWorkspaceRules";
export { buildOpenHallGuideLetters, MEZZANINE_MIN_WIDTH } from "./workspace-rules/open-hall-workspace";

function workspaceRules(typology: string) {
  switch (typology) {
    case "open-hall-workspace": return openHall;
    case "flat-deep-plan-plate": return flatPlate;
    default: return existing;
  }
}

export function arrangeOfficeLetters(...args: Parameters<typeof openHall.arrangeOfficeLetters>) {
  return workspaceRules(args[1]).arrangeOfficeLetters(...args);
}

export function planOfficeWorkspace(...args: Parameters<typeof openHall.planOfficeWorkspace>) {
  return workspaceRules(args[0]).planOfficeWorkspace(...args);
}

export function officePlanReady(plan: Parameters<typeof openHall.officePlanReady>[0]) {
  return workspaceRules(plan.typology).officePlanReady(plan);
}
