import type { WorkspaceTypology } from "./workspaceDualRulesets";
import { reportRules as flatDeepPlanPlateRules } from "./workspace-rules/flat-deep-plan-plate.report";
import { reportRules as openHallRules } from "./workspace-rules/open-hall-workspace.report";
import {
  WORKSPACE_TYPOLOGIES,
  workspaceTypologyName,
} from "./workspaceDualRulesets";

export type WorkspaceRuleSectionId =
  | "open-hall-letter"
  | "open-hall-architecture"
  | "flat-deep-letter"
  | "flat-deep-architecture";

export type WorkspaceRuleSection = {
  id: WorkspaceRuleSectionId;
  typology: WorkspaceTypology | string;
  stage: "letter-arrangement" | "architectural-generation";
  /** @deprecated use stage — kept so older callers reading axis still compile */
  axis: "letter-arrangement" | "architectural-generation";
  title: string;
  rulesetId: string;
  rulesetVersion: string;
  requirements: string[];
  checkLabels: string[];
};

const describeRules = (bindings: { title: string; requirements: string[] }[]) =>
  bindings.map(({ title, requirements }) => [`${title}.`, ...requirements].join(" "));

export const WORKSPACE_RULE_SECTIONS: WorkspaceRuleSection[] = [
  {
    id: "open-hall-letter",
    typology: "open-hall-workspace",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Open Hall · Letter arrangement",
    rulesetId: "open-hall-workspace/letter-arrangement",
    rulesetVersion: openHallRules.version,
    requirements: describeRules(openHallRules.letterBindings),
    checkLabels: openHallRules.letterBindings.flatMap(({ labels }) => labels),
  },
  {
    id: "open-hall-architecture",
    typology: "open-hall-workspace",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Open Hall · Architectural generation",
    rulesetId: "open-hall-workspace/architectural-generation",
    rulesetVersion: openHallRules.version,
    requirements: describeRules(openHallRules.architectureBindings),
    checkLabels: openHallRules.architectureBindings.flatMap(({ labels }) => labels),
  },
  {
    id: "flat-deep-letter",
    typology: "flat-deep-plan-plate",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Flat-Deep Plan Plate · Letter arrangement",
    rulesetId: "flat-deep-plan-plate/letter-arrangement",
    rulesetVersion: flatDeepPlanPlateRules.version,
    requirements: describeRules(flatDeepPlanPlateRules.letterBindings),
    checkLabels: flatDeepPlanPlateRules.letterBindings.flatMap(({ labels }) => labels),
  },
  {
    id: "flat-deep-architecture",
    typology: "flat-deep-plan-plate",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Flat-Deep Plan Plate · Architectural generation",
    rulesetId: "flat-deep-plan-plate/architectural-generation",
    rulesetVersion: flatDeepPlanPlateRules.version,
    requirements: describeRules(flatDeepPlanPlateRules.architectureBindings),
    checkLabels: flatDeepPlanPlateRules.architectureBindings.flatMap(({ labels }) => labels),
  },
];

export function sectionsForTypology(typology: string) {
  return WORKSPACE_RULE_SECTIONS.filter((section) => section.typology === typology);
}

