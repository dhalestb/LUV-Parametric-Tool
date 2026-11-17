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

export function workspaceTypologyName(typology: WorkspaceTypology) {
  return WORKSPACE_TYPOLOGIES.find(([id]) => id === typology)?.[1] ?? typology;
}

/** Stage 1: how letters may be arranged for a typology. */
export const LETTER_ARRANGEMENT_RULESET_ID = "workspace-letter-arrangement";
export const LETTER_ARRANGEMENT_RULESET_VERSION = "1.2.0";

/** Stage 2: how architecture is generated from the arranged letters. */
export const ARCHITECTURAL_GENERATION_RULESET_ID = "workspace-architectural-generation";
export const ARCHITECTURAL_GENERATION_RULESET_VERSION = "1.2.0";

export const WORKSPACE_DEFAULT_FIELDS: Record<WorkspaceTypology, { width: number; depth: number; height: number }> = {
  "open-hall-workspace": { width: 60, depth: 60, height: 20 },
  "flat-deep-plan-plate": { width: 20, depth: 60, height: 20 },
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

type Binding = { title: string; labels: string[]; hard?: boolean };

/** Letter-arrangement bindings — poses, vocabulary, footprint ratios, orientation. */
const LETTER_BINDINGS: Record<WorkspaceTypology, Binding[]> = {
  "open-hall-workspace": [
    { title: "L-only vocabulary", labels: ["Letter variations"] },
    { title: "Orthogonal footprint 0/90/180/270", labels: ["Orthogonal footprint"] },
    { title: "Column L guides on equal XY grid", labels: ["Column L guides"] },
    { title: "Column size · grid 15/20/25 ft", labels: ["Column guide size"] },
    { title: "Floor and mezzanine L letters oriented", labels: ["Floor mezz L guides"] },
    { title: "Floor/mezz guide size 9/11/13 ft or custom", labels: ["Floor mezz guide size"] },
    { title: "Vertical wall L guides · independent size", labels: ["Wall L guides"] },
    { title: "Roof L guides 3/6/9 ft or custom", labels: ["Roof L guides"] },
    { title: "Letters invent form · inside field", labels: ["Letter-derived plates", "Letters inside field"] },
    { title: "No uniform rescale", labels: ["No uniform rescale"] },
  ],
  "flat-deep-plan-plate": [
    { title: "Permitted letters and placement", labels: ["Letter variations"] },
    { title: "Plate ratio 3:2–5:2", labels: ["Working plate ratio"] },
    { title: "15° footprint orientation", labels: ["15° footprint rotation"] },
    { title: "Longitudinal strip ≥5 ft reserved", labels: ["Longitudinal strip"] },
    { title: "Single working elevation intent", labels: ["Single working level"] },
    { title: "No silent rescale of letters", labels: ["No uniform rescale"] },
  ],
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
  "open-hall-workspace": [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Ground filled from floor L outer edges", labels: ["Ground plate filled"] },
    { title: "Central hall · mezz opening over centre", labels: ["Central hall"] },
    { title: "Mezz from pocket L inners · 25–40% · ≥10 ft", labels: ["Mezzanine opening", "Mezzanine platform width"] },
    { title: "Mezzanine mid-height", labels: ["Mezzanine elevation"] },
    { title: "Equal XY grid piers · floor-plate bound", labels: ["Column grid", "Supports and movement"] },
    { title: "Perimeter walls 1.5 ft · entry", labels: ["Perimeter walls and entry"] },
    { title: "Roof filled · skylights at roof L centers", labels: ["Roof plate filled", "Skylight bays"] },
    { title: "Occupied headroom >8 ft", labels: ["Headroom"] },
    { title: "Daylight / structure unverified", labels: [], hard: false },
  ],
  "flat-deep-plan-plate": [
    { title: "Field containment", labels: ["Field envelope"] },
    { title: "Open long edges / daylight", labels: ["Daylight edges"] },
    { title: "One-level working tile", labels: ["One-level tile"] },
    { title: "Clear headroom >10 ft", labels: ["Clear height"] },
  ],
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
    sourcePolicy: SOURCE_POLICY,
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
    LETTER_ARRANGEMENT_RULESET_ID,
    LETTER_ARRANGEMENT_RULESET_VERSION,
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
    ARCHITECTURAL_GENERATION_RULESET_ID,
    ARCHITECTURAL_GENERATION_RULESET_VERSION,
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
