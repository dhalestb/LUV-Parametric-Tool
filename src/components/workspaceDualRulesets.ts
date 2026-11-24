import { reportRules as openHallRules } from "./workspace-rules/open-hall-workspace.report";
import { reportRules as flatPlateRules } from "./workspace-rules/flat-deep-plan-plate.report";
import type { OfficeCheck, OfficePlan } from "./officeWorkspaceRules";

/** Keep typology ids/names local so Node can require this module from the amphitheater worker. */
export const WORKSPACE_TYPOLOGIES = [
  ["open-hall-workspace", "Open Hall Workspace"],
  ["flat-deep-plan-plate", "Flat-Deep Plan Plate"],
  ["cascaded-terraced-plates", "Cascaded Workspace"],
  ["void-edge-workspace", "Void-Edge Workspace"],
  ["folded-undulating-work-surface", "Undulating Workspace"],
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

const detailedPolicies = {
  "open-hall-workspace": openHallRules,
  "flat-deep-plan-plate": flatPlateRules,
};

function detailedPolicy(typology: WorkspaceTypology) {
  if (typology === "open-hall-workspace" || typology === "flat-deep-plan-plate") return detailedPolicies[typology];
}

export const WORKSPACE_DEFAULT_FIELDS: Record<WorkspaceTypology, { width: number; depth: number; height: number }> = {
  "open-hall-workspace": openHallRules.defaultField,
  "flat-deep-plan-plate": flatPlateRules.defaultField,
  "cascaded-terraced-plates": { width: 60, depth: 40, height: 20 },
  "void-edge-workspace": { width: 40, depth: 40, height: 20 },
  "folded-undulating-work-surface": { width: 60, depth: 60, height: 20 },
};

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
const LETTER_BINDINGS: Record<WorkspaceTypology, Binding[]> = {
  "open-hall-workspace": openHallRules.letterBindings,
  "flat-deep-plan-plate": flatPlateRules.letterBindings,
  "cascaded-terraced-plates": [
    { title: "Permitted letters and placement", labels: ["Letter variations"] },
    { title: "10 ft grid breaks ≤40%", labels: ["10 ft plan grid", "Break area limit"] },
    { title: "Connected main plate", labels: ["Main plate connected"] },
    { title: "Directional elevation sequences", labels: ["Elevation sequences"] },
    { title: "10×10 usable reserves", labels: ["10×10 usable areas"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
  "void-edge-workspace": [
    { title: "Permitted U/L letters and placement", labels: ["Letter variations"] },
    { title: "Footprint ratio 1:1–5:4", labels: ["Footprint ratio"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "Internal void 10–25% reserved", labels: ["Internal void"] },
    { title: "Working band depth and loop", labels: ["Working depth", "Circulation loop"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
  "folded-undulating-work-surface": [
    { title: "Permitted letters and placement", labels: ["Letter variations"] },
    { title: "Square main plate on 10 ft grid", labels: ["Square main plate", "10 ft plan grid"] },
    { title: "Breaks ≤40% with connected main", labels: ["Break area limit", "Main plate connected"] },
    { title: "Distributed plates and voids", labels: ["Distributed plates"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
};

/** Architectural-generation bindings — plates, voids, supports, clearances, field. */
const ARCH_BINDINGS: Record<WorkspaceTypology, Binding[]> = {
  "open-hall-workspace": openHallRules.architectureBindings,
  "flat-deep-plan-plate": flatPlateRules.architectureBindings,
  "cascaded-terraced-plates": [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Elevation sequences preserved", labels: ["Elevation sequences"] },
    { title: "Plate connections", labels: ["Plate connections"] },
    { title: "10×10 usable areas", labels: ["10×10 usable areas"] },
    { title: "Terrace headroom >10 ft", labels: ["Terrace headroom"] },
  ],
  "void-edge-workspace": [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Level band and vertical void", labels: ["Level band and vertical void"] },
    { title: "Clear headroom >10 ft", labels: ["Clear height"] },
  ],
  "folded-undulating-work-surface": [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Rise and fall elevations", labels: ["Rise and fall"] },
    { title: "Ramp slope ≤1:12", labels: ["Ramp slope"] },
    { title: "Three 5×5 working areas", labels: ["Three working areas"] },
    { title: "Clear headroom >10 ft", labels: ["Clear height"] },
  ],
};

const SOURCE_POLICY =
  "Source letter identities and proportions are preserved; poses may be rearranged to satisfy the letter-arrangement ruleset. Open Hall invents the full role-grouped L guide set on Generate Design. Other typologies do not invent letter quantity: every provided source letter is placed (slots may be reused if more letters than preferred slots).";

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
    sourcePolicy: detailedPolicy(typology)?.sourcePolicy ?? SOURCE_POLICY,
    overall: overallOf(rules),
    rules,
  };
}

export function buildLetterArrangementReport(plan: OfficePlan): DualRulesetReport {
  const typology = plan.typology as WorkspaceTypology;
  const bindings = LETTER_BINDINGS[typology];
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
  const bindings = ARCH_BINDINGS[typology];
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

export function workspaceRulesetIds(typology: WorkspaceTypology) {
  const policy = detailedPolicy(typology);
  if (policy) return { letter: typology + "/letter-arrangement", architecture: typology + "/architectural-generation", version: policy.version };
  return { letter: LETTER_ARRANGEMENT_RULESET_ID, architecture: ARCHITECTURAL_GENERATION_RULESET_ID, version: LETTER_ARRANGEMENT_RULESET_VERSION };
}

export function requirementsForWorkspaceRule(report: DualRulesetReport, rule: DualRuleResult) {
  if (rule.requirements) return rule.requirements;
  const policy = detailedPolicy(report.typology);
  if (!policy || policy.version !== report.rulesetVersion) return [];
  const bindings: Binding[] = report.stage === "letter-arrangement" ? policy.letterBindings : policy.architectureBindings;
  return bindings.find(binding => binding.title === rule.title)?.requirements ?? [];
}

