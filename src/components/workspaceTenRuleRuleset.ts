/**
 * Compatibility shim: the former single "ten-rule" report is replaced by the
 * dual letter-arrangement + architectural-generation rulesets.
 */
export {
  WORKSPACE_TYPOLOGIES,
  workspaceTypologyName,
  type WorkspaceTypology,
  LETTER_ARRANGEMENT_RULESET_ID as WORKSPACE_RULESET_ID,
  LETTER_ARRANGEMENT_RULESET_VERSION as WORKSPACE_RULESET_VERSION,
  workspaceDualReports,
  buildLetterArrangementReport,
  buildArchitecturalGenerationReport,
  type DualRulesetReport as WorkspaceRuleReport,
  type DualRuleResult as WorkspaceRuleResult,
  type DualRuleStatus as WorkspaceRuleStatus,
} from "./workspaceDualRulesets";

import { workspaceDualReports, type DualRulesetReport } from "./workspaceDualRulesets";
import type { OfficePlan } from "./officeWorkspaceRules";

/** @deprecated Prefer workspaceDualReports / buildLetterArrangementReport. */
export function buildWorkspaceRuleReport(plan: OfficePlan): DualRulesetReport {
  const dual = workspaceDualReports(plan);
  return {
    ...dual.letterArrangement,
    rules: [...dual.letterArrangement.rules, ...dual.architecturalGeneration.rules],
    overall:
      dual.letterArrangement.overall === "fail" || dual.architecturalGeneration.overall === "fail"
        ? "fail"
        : dual.letterArrangement.overall === "unverified" || dual.architecturalGeneration.overall === "unverified"
          ? "unverified"
          : "pass",
  };
}
