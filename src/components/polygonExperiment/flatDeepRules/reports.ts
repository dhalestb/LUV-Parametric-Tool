import {reportRules as policy1} from "./flat-deep-plan-plate.report";
import type { OfficeCheck, OfficePlan } from "./contracts";

/** Keep typology ids/names local so Node can require this module from the amphitheater worker. */
export const WORKSPACE_TYPOLOGIES = [
  ["flat-deep-plan-plate", "Flat-Deep Plan Plate"],
] as const;

export type WorkspaceTypology = (typeof WORKSPACE_TYPOLOGIES)[number][0];
export const WORKSPACE_FIELD_PRESETS = [20, 40, 60] as const;

export function workspaceTypologyName(typology: WorkspaceTypology) {
  return WORKSPACE_TYPOLOGIES.find(([id]) => id === typology)?.[1] ?? typology;
}

/** Stage 1: how letters may be arranged for a typology. */
export const LETTER_ARRANGEMENT_RULESET_ID = "workspace-letter-arrangement";
export const LETTER_ARRANGEMENT_RULESET_VERSION = "1.2.0";

/** Stage 2: how architecture is generated from the arranged letters. */
export const ARCHITECTURAL_GENERATION_RULESET_ID = "workspace-architectural-generation";
export const ARCHITECTURAL_GENERATION_RULESET_VERSION = "1.2.0";



export type DualRuleStatus = "pass" | "fail" | "unverified";
export type DualRuleResult = {
  id: string;
  title: string;
  status: DualRuleStatus;
  hard: boolean;
  measured?: string;
  threshold?: string;
  units?: string;
  requirements?: string[];
  evidence: string[];
};
export type DualRulesetReport = {
  rulesetId: string;
  rulesetVersion: string;
  stage: "letter-arrangement" | "architectural-generation";
  typology: WorkspaceTypology;
  typologyName: string;
  sourcePolicy: string;
  overall: DualRuleStatus;
  rules: DualRuleResult[];
};

type Binding = { title: string; labels: string[]; hard?: boolean; requirements?: string[] };

/** Letter-arrangement bindings — poses, vocabulary, footprint ratios, orientation. */


/** Architectural-generation bindings — plates, voids, supports, clearances, field. */




function aggregate(items: OfficeCheck[]): DualRuleStatus {
  if (items.some((item) => item.status === "fail")) return "fail";
  if (items.some((item) => item.status === "unverified") || !items.length) return "unverified";
  return "pass";
}

function overallOf(rules: DualRuleResult[]): DualRuleStatus {
  const hard = rules.filter((rule) => rule.hard);
  if (hard.some((rule) => rule.status === "fail")) return "fail";
  if (hard.some((rule) => rule.status === "unverified")) return "unverified";
  return "pass";
}

function buildStage(
  plan: OfficePlan,
  typology: WorkspaceTypology,
  stage: DualRulesetReport["stage"],
  bindings: Binding[],
  rulesetId: string,
  rulesetVersion: string,
): DualRulesetReport {
  const rules = bindings.map((binding, index): DualRuleResult => {
    const evidenceChecks = plan.checks.filter((check) => binding.labels.includes(check.label));
    return {
      id: `${stage === "letter-arrangement" ? "LA" : "AG"}-${String(index + 1).padStart(2, "0")}`,
      title: binding.title,
      status: aggregate(evidenceChecks),
      hard: binding.hard ?? true,
      ...(binding.requirements ? { requirements: binding.requirements } : {}),
      evidence: evidenceChecks.length
        ? evidenceChecks.map((check) => `${check.label} [${check.status}]: ${check.detail}`)
        : ["No measurement was recorded for this rule on the relevant geometry."],
    };
  });
  return {
    rulesetId,
    rulesetVersion,
    stage,
    typology,
    typologyName: workspaceTypologyName(typology),
    sourcePolicy: policies[typology].sourcePolicy,
    overall: overallOf(rules),
    rules,
  };
}

export function buildLetterArrangementReport(plan: OfficePlan): DualRulesetReport {
  const typology = plan.typology as WorkspaceTypology;
  const bindings = policies[typology]?.letterBindings;
  if (!bindings) throw new Error(`Unknown workspace typology for letter arrangement: ${plan.typology}`);
  return buildStage(
    plan,
    typology,
    "letter-arrangement",
    bindings,
    workspaceRulesetIds(typology).letter,
    workspaceRulesetIds(typology).version,
  );
}

export function buildArchitecturalGenerationReport(plan: OfficePlan): DualRulesetReport {
  const typology = plan.typology as WorkspaceTypology;
  const bindings = policies[typology]?.architectureBindings;
  if (!bindings) throw new Error(`Unknown workspace typology for architectural generation: ${plan.typology}`);
  return buildStage(
    plan,
    typology,
    "architectural-generation",
    bindings,
    workspaceRulesetIds(typology).architecture,
    workspaceRulesetIds(typology).version,
  );
}

export function workspaceDualReports(plan: OfficePlan) {
  return {
    letterArrangement: buildLetterArrangementReport(plan),
    architecturalGeneration: buildArchitecturalGenerationReport(plan),
  };
}

export function isWorkspaceTypology(value: string): value is WorkspaceTypology {
  return WORKSPACE_TYPOLOGIES.some(([id]) => id === value);
}

const policies = {
"flat-deep-plan-plate": policy1,
};
export function requirementsForWorkspaceRule(report: DualRulesetReport, rule: DualRuleResult) {
  if (rule.requirements) return rule.requirements;
  const policy = policies[report.typology];
  if (!policy || policy.version !== report.rulesetVersion) return [];
  const bindings: Binding[] = report.stage === "letter-arrangement" ? policy.letterBindings : policy.architectureBindings;
  return bindings.find(binding => binding.title === rule.title)?.requirements ?? [];
}

export function workspaceRulesetIds(typology: WorkspaceTypology) {
 if (!Object.hasOwn(policies,typology)) throw Error("Unknown workspace typology: "+typology);
 return {letter: typology+"/letter-arrangement",architecture: typology+"/architectural-generation",version:policies[typology].version};
}
export const WORKSPACE_DEFAULT_FIELDS = Object.fromEntries(Object.entries(policies).map(([id,p])=>[id,p.defaultField])) as Record<WorkspaceTypology,{width:number;depth:number;height:number}>;
