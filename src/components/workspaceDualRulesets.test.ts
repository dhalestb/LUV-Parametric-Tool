import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arrangeOfficeLetters,
  buildOpenHallGuideLetters,
  officePlanReady,
  planOfficeWorkspace,
} from "./officeWorkspaceRules";
import {
  ARCHITECTURAL_GENERATION_RULESET_ID,
  ARCHITECTURAL_GENERATION_RULESET_VERSION,
  LETTER_ARRANGEMENT_RULESET_ID,
  LETTER_ARRANGEMENT_RULESET_VERSION,
  WORKSPACE_DEFAULT_FIELDS,
  WORKSPACE_TYPOLOGIES,
  buildArchitecturalGenerationReport,
  buildLetterArrangementReport,
  workspaceDualReports,
} from "./workspaceDualRulesets";
import type { IntersectionPlacement } from "./architecturalConnections";

function letter(letter: "L" | "U" | "V", x = 0, y = 0, z = 0): IntersectionPlacement {
  return {
    letter, x, y, z, rx: 0, ry: 0, rz: 0, scale: 3, scaleX: 1, scaleY: 1, scaleZ: 1,
  } as IntersectionPlacement;
}

describe("workspace dual rulesets", () => {
  it("exposes five typologies × two versioned rulesets", () => {
    assert.equal(WORKSPACE_TYPOLOGIES.length, 5);
    assert.equal(LETTER_ARRANGEMENT_RULESET_ID, "workspace-letter-arrangement");
    assert.equal(ARCHITECTURAL_GENERATION_RULESET_ID, "workspace-architectural-generation");
    assert.equal(LETTER_ARRANGEMENT_RULESET_VERSION, "1.2.0");
    assert.equal(ARCHITECTURAL_GENERATION_RULESET_VERSION, "1.2.0");
  });

  it("Open Hall dual bindings are exactly ten per stage", () => {
    const plan = planOfficeWorkspace("open-hall-workspace", 0, [0, 0, 0], WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"]);
    const dual = workspaceDualReports(plan);
    assert.equal(dual.letterArrangement.rules.length, 10);
    assert.equal(dual.architecturalGeneration.rules.length, 10);
  });

  for (const [typology] of WORKSPACE_TYPOLOGIES) {
    it(`builds dual reports for ${typology} inside its default field`, () => {
      const field = WORKSPACE_DEFAULT_FIELDS[typology];
      const plan = planOfficeWorkspace(typology, 0, [0, 0, 0], field);
      assert.ok(officePlanReady(plan), plan.checks.filter((c) => c.status !== "pass").map((c) => `${c.label}:${c.status}`).join("; "));
      const dual = workspaceDualReports(plan);
      assert.equal(dual.letterArrangement.stage, "letter-arrangement");
      assert.equal(dual.architecturalGeneration.stage, "architectural-generation");
      assert.equal(dual.letterArrangement.typology, typology);
      assert.equal(dual.architecturalGeneration.typology, typology);
      assert.equal(dual.letterArrangement.rulesetVersion, LETTER_ARRANGEMENT_RULESET_VERSION);
      assert.equal(dual.architecturalGeneration.rulesetVersion, ARCHITECTURAL_GENERATION_RULESET_VERSION);
      assert.notEqual(dual.letterArrangement.overall, "fail");
      assert.notEqual(dual.architecturalGeneration.overall, "fail");
    });
  }

  it("fails letter arrangement on non-orthogonal Open Hall rotation", () => {
    const plan = planOfficeWorkspace("open-hall-workspace", 7, [0, 0, 0], WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"]);
    const letterReport = buildLetterArrangementReport(plan);
    const rotation = letterReport.rules.find((rule) => /Orthogonal footprint/i.test(rule.title));
    assert.ok(rotation);
    assert.equal(rotation!.status, "fail");
    assert.equal(letterReport.overall, "fail");
  });

  it("fails field containment when the selected field is too small", () => {
    // Open Hall needs ≥10 ft mezzanine bands with 25–40% opening; default 60×60 fits, 20³ cannot.
    const plan = planOfficeWorkspace("open-hall-workspace", 0, [0, 0, 0], WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"]);
    assert.ok(officePlanReady(plan));
    const crampedHall = planOfficeWorkspace("open-hall-workspace", 0, [0, 0, 0], { width: 20, depth: 20, height: 20 });
    assert.equal(officePlanReady(crampedHall), false);
    const width = crampedHall.checks.find((check) => check.label === "Mezzanine platform width");
    const opening = crampedHall.checks.find((check) => check.label === "Mezzanine opening");
    assert.ok(width?.status === "fail" || opening?.status === "fail", `expected mezz width or opening fail; width=${width?.status} opening=${opening?.status}`);
    const cramped = planOfficeWorkspace("cascaded-terraced-plates", 0, [0, 0, 0], { width: 20, depth: 20, height: 20 });
    assert.deepEqual(WORKSPACE_DEFAULT_FIELDS["flat-deep-plan-plate"], { width: 20, depth: 60, height: 20 });
    const arch = buildArchitecturalGenerationReport(plan);
    assert.ok(arch.rules.some((rule) => /Field containment/i.test(rule.title)));
    assert.ok(cramped.checks.some((check) => check.label === "Field envelope"));
  });

  it("arranges the invented Open Hall L guide set", () => {
    const field = WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"];
    const source = buildOpenHallGuideLetters({ ...field, columnSize: 2, floorMezzGuideSize: 11, wallGuideSize: 9, roofGuideSize: 6 }, [0, 0, 0]);
    const arranged = arrangeOfficeLetters(source, "open-hall-workspace", 12, [0, 0, 0], { ...field, columnSize: 2, floorMezzGuideSize: 11, wallGuideSize: 9, roofGuideSize: 6 });
    assert.equal(arranged.placements.length, source.length);
    assert.ok(arranged.officePlan);
    const vocab = arranged.officePlan!.checks.find((check) => check.label === "Letter variations");
    assert.ok(vocab);
    assert.equal(vocab!.status, "pass");
    assert.match(vocab!.detail, /L guides only/i);
    assert.ok(arranged.placements.every((p) => p.letter === "L"));
  });

  it("keeps Open Hall guide letters inside the field", () => {
    const field = WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"];
    const source = buildOpenHallGuideLetters({ ...field, preferredFeet: 13, floorMezzGuideSize: 13, mezzanineFaces: 2 }, [0, 0, 0]);
    const arranged = arrangeOfficeLetters(source, "open-hall-workspace", 12, [0, 0, 0], { ...field, preferredFeet: 13, floorMezzGuideSize: 13, mezzanineFaces: 2 });
    assert.equal(arranged.placements.length, source.length);
    const inside = arranged.officePlan!.checks.find((check) => check.label === "Letters inside field");
    assert.equal(inside?.status, "pass");
    for (const p of arranged.placements) {
      const hx = field.width / 2, hy = field.depth / 2;
      assert.ok(Math.abs(p.x) < hx);
      assert.ok(Math.abs(p.y) < hy);
    }
  });

  it("fails vocabulary when Open Hall has non-L letters", () => {
    const source = [letter("U", 0, 0), letter("U", 1, 0)];
    const arranged = arrangeOfficeLetters(source, "open-hall-workspace", 12, [0, 0, 0], WORKSPACE_DEFAULT_FIELDS["open-hall-workspace"]);
    assert.equal(arranged.placements.length, 2);
    const vocab = arranged.officePlan!.checks.find((check) => check.label === "Letter variations");
    assert.equal(vocab!.status, "fail");
    const letterReport = buildLetterArrangementReport(arranged.officePlan!);
    assert.equal(letterReport.overall, "fail");
  });

  it("does not claim unverified when a measured check fails", () => {
    const plan = planOfficeWorkspace("void-edge-workspace", 11, [0, 0, 0], WORKSPACE_DEFAULT_FIELDS["void-edge-workspace"]);
    const failed = plan.checks.filter((check) => check.status === "fail");
    assert.ok(failed.length >= 1);
    assert.equal(plan.checks.filter((check) => check.status === "unverified").length, 0);
  });
});
