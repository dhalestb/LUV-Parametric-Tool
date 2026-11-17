/**
 * Canonical workspace ruleset catalog: five typologies × two stages
 * (letter arrangement + architectural generation) = ten rulesets.
 * Replaces the former Horizontal/Vertical ten-rule Word-document catalog.
 */

import type { WorkspaceTypology } from "./workspaceDualRulesets";
import {
  ARCHITECTURAL_GENERATION_RULESET_ID,
  ARCHITECTURAL_GENERATION_RULESET_VERSION,
  LETTER_ARRANGEMENT_RULESET_ID,
  LETTER_ARRANGEMENT_RULESET_VERSION,
  WORKSPACE_TYPOLOGIES,
  workspaceTypologyName,
} from "./workspaceDualRulesets";

export type WorkspaceRuleSectionId =
  | "open-hall-letter"
  | "open-hall-architecture"
  | "flat-deep-letter"
  | "flat-deep-architecture"
  | "cascaded-letter"
  | "cascaded-architecture"
  | "void-edge-letter"
  | "void-edge-architecture"
  | "undulating-letter"
  | "undulating-architecture";

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

export const WORKSPACE_RULE_SECTIONS: WorkspaceRuleSection[] = [
  {
    id: "open-hall-letter",
    typology: "open-hall-workspace",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Open Hall · Letter arrangement",
    rulesetId: LETTER_ARRANGEMENT_RULESET_ID,
    rulesetVersion: LETTER_ARRANGEMENT_RULESET_VERSION,
    requirements: [
      "Letter-arrangement ruleset orients L-only role sets: 4 floor corner Ls (outer tips), mezzanine 2/3/4-channel outer + pocket Ls (inner crooks), column grid Ls, vertical wall Ls, roof quadrant Ls; orthogonal 0/90/180/270.",
      "Equal XY column grid at 15 / 20 / 25 ft bounded by the floor-plate perimeter; column / floor-mezz / wall / roof letter sizes independent; letters inside field; no uniform rescale.",
    ],
    checkLabels: ["Letter variations", "Orthogonal footprint", "Column L guides", "Column guide size", "Floor mezz L guides", "Floor mezz guide size", "Wall L guides", "Roof L guides", "Letter-derived plates", "Letters inside field", "No uniform rescale"],
  },
  {
    id: "open-hall-architecture",
    typology: "open-hall-workspace",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Open Hall · Architectural generation",
    rulesetId: ARCHITECTURAL_GENERATION_RULESET_ID,
    rulesetVersion: ARCHITECTURAL_GENERATION_RULESET_VERSION,
    requirements: [
      "Architectural-generation ruleset fills L footprints from arranged letters: ground from floor L outer edges + L corner fills; mezz pads from mezz letters (25–40% opening, ≥10 ft band); filled-pocket piers from column L letters on every equal XY column-grid node (including centre).",
      "L wall fills at wall letters plus 1.5 ft shell/entry; L skylights from roof letters; headroom >8 ft; field containment. Daylight/structure unverified.",
    ],
    checkLabels: ["Field envelope", "Ground plate filled", "Central hall", "Mezzanine opening", "Mezzanine platform width", "Mezzanine elevation", "Column grid", "Supports and movement", "Perimeter walls and entry", "Roof plate filled", "Skylight bays", "Headroom"],
  },
  {
    id: "flat-deep-letter",
    typology: "flat-deep-plan-plate",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Flat-Deep Plan Plate · Letter arrangement",
    rulesetId: LETTER_ARRANGEMENT_RULESET_ID,
    rulesetVersion: LETTER_ARRANGEMENT_RULESET_VERSION,
    requirements: [
      "L/V variations form one continuous rectangular plate; ratio 3:2–5:2; 15° rotation; ≥5 ft longitudinal strip joining short ends.",
      "Vertical L supports in a repeating pattern without obstructing the strip; openings along both long edges.",
    ],
    checkLabels: ["Letter variations", "Working plate ratio", "15° footprint rotation", "Longitudinal strip", "Single working level", "No uniform rescale"],
  },
  {
    id: "flat-deep-architecture",
    typology: "flat-deep-plan-plate",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Flat-Deep Plan Plate · Architectural generation",
    rulesetId: ARCHITECTURAL_GENERATION_RULESET_ID,
    rulesetVersion: ARCHITECTURAL_GENERATION_RULESET_VERSION,
    requirements: [
      "One continuous working plate at a single elevation; protected longitudinal route ≥5 ft; repeating supports; daylight edges; >10 ft clear headroom; field containment.",
    ],
    checkLabels: ["Field envelope", "Daylight edges", "One-level tile", "Clear height"],
  },
  {
    id: "cascaded-letter",
    typology: "cascaded-terraced-plates",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Cascaded Workspace · Letter arrangement",
    rulesetId: LETTER_ARRANGEMENT_RULESET_ID,
    rulesetVersion: LETTER_ARRANGEMENT_RULESET_VERSION,
    requirements: [
      "L/V variations establish a horizontal main plate and adjacent rectangular plates; breaks on a 10 ft grid; combined break area ≤40% of the main plate; remaining main stays connected.",
      "Sequences extend away with a consistent upward or downward direction; reserve a clear 10×10 ft usable area on each occupied plate.",
    ],
    checkLabels: ["Letter variations", "10 ft plan grid", "Break area limit", "Main plate connected", "Elevation sequences", "10×10 usable areas", "15° footprint rotation", "No uniform rescale"],
  },
  {
    id: "cascaded-architecture",
    typology: "cascaded-terraced-plates",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Cascaded Workspace · Architectural generation",
    rulesetId: ARCHITECTURAL_GENERATION_RULESET_ID,
    rulesetVersion: ARCHITECTURAL_GENERATION_RULESET_VERSION,
    requirements: [
      "Generate main plate and rectangular breaks; displaced plates and voids; directional elevation sequences; stairs/ramps between consecutive plates; >10 ft headroom; field containment.",
    ],
    checkLabels: ["Field envelope", "Elevation sequences", "Plate connections", "Terrace headroom", "10×10 usable areas"],
  },
  {
    id: "void-edge-letter",
    typology: "void-edge-workspace",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Void-Edge Workspace · Letter arrangement",
    rulesetId: LETTER_ARRANGEMENT_RULESET_ID,
    rulesetVersion: LETTER_ARRANGEMENT_RULESET_VERSION,
    requirements: [
      "U variations form a continuous footprint; ratio 1:1–5:4; 15° rotation; one internal opening 10–25% offset from center; ≥5 ft at the narrowest band; continuous loop and entry.",
    ],
    checkLabels: ["Letter variations", "Footprint ratio", "15° footprint rotation", "Internal void", "Working depth", "Circulation loop", "No uniform rescale"],
  },
  {
    id: "void-edge-architecture",
    typology: "void-edge-workspace",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Void-Edge Workspace · Architectural generation",
    rulesetId: ARCHITECTURAL_GENERATION_RULESET_ID,
    rulesetVersion: ARCHITECTURAL_GENERATION_RULESET_VERSION,
    requirements: [
      "Continuous plate with offset internal void 10–25%; ≥5 ft narrowest band; continuous route; level band; void through overhead; supports outside; >10 ft clear height; field containment.",
    ],
    checkLabels: ["Field envelope", "Level band and vertical void", "Clear height"],
  },
  {
    id: "undulating-letter",
    typology: "folded-undulating-work-surface",
    stage: "letter-arrangement",
    axis: "letter-arrangement",
    title: "Undulating Workspace · Letter arrangement",
    rulesetId: LETTER_ARRANGEMENT_RULESET_ID,
    rulesetVersion: LETTER_ARRANGEMENT_RULESET_VERSION,
    requirements: [
      "L variations form a horizontal square main plate; 15° rotation; 10 ft grid breaks ≤40%; remaining main connected; adjacent plates distributed; some breaks left as voids.",
    ],
    checkLabels: ["Letter variations", "Square main plate", "10 ft plan grid", "Break area limit", "Main plate connected", "Distributed plates", "15° footprint rotation", "No uniform rescale"],
  },
  {
    id: "undulating-architecture",
    typology: "folded-undulating-work-surface",
    stage: "architectural-generation",
    axis: "architectural-generation",
    title: "Undulating Workspace · Architectural generation",
    rulesetId: ARCHITECTURAL_GENERATION_RULESET_ID,
    rulesetVersion: ARCHITECTURAL_GENERATION_RULESET_VERSION,
    requirements: [
      "Square main plate with distributed elevated plates and voids; rise-and-fall neighbors; connections ≤1:12; ≥3 clear 5×5 working patches; >10 ft headroom; field containment.",
    ],
    checkLabels: ["Field envelope", "Rise and fall", "Ramp slope", "Three working areas", "Clear height"],
  },
];

export function sectionsForTypology(typology: string) {
  return WORKSPACE_RULE_SECTIONS.filter((section) => section.typology === typology);
}

export function sectionForCheck(typology: string, label: string) {
  return WORKSPACE_RULE_SECTIONS.find((section) => section.typology === typology && section.checkLabels.includes(label))
    ?? WORKSPACE_RULE_SECTIONS.find((section) => section.checkLabels.includes(label))
    ?? WORKSPACE_RULE_SECTIONS[0];
}

export type OfficeCheckStatus = "pass" | "fail" | "unverified";

export function summarizeWorkspaceChecks(
  typology: string,
  checks: { label: string; status: OfficeCheckStatus; detail: string }[],
) {
  return sectionsForTypology(typology).map((section) => {
    const items = checks.filter((check) => section.checkLabels.includes(check.label));
    const failed = items.filter((item) => item.status === "fail").length;
    const passed = items.filter((item) => item.status === "pass").length;
    const unverified = items.filter((item) => item.status === "unverified").length;
    const status: OfficeCheckStatus = failed ? "fail" : unverified ? "unverified" : items.length ? "pass" : "unverified";
    return { section, items, passed, failed, unverified, status };
  });
}

export { WORKSPACE_TYPOLOGIES, workspaceTypologyName };
