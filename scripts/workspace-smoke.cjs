const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { arrangeOfficeLetters } = require("../src/components/officeWorkspaceRules.ts");
const {
  workspaceDualReports,
  WORKSPACE_DEFAULT_FIELDS,
  LETTER_ARRANGEMENT_RULESET_ID,
  LETTER_ARRANGEMENT_RULESET_VERSION,
  ARCHITECTURAL_GENERATION_RULESET_ID,
  ARCHITECTURAL_GENERATION_RULESET_VERSION,
  workspaceTypologyName,
  WORKSPACE_TYPOLOGIES,
} = require("../src/components/workspaceDualRulesets.ts");
const typology = process.argv[2] || "open-hall-workspace";
const out = process.argv[3] || path.join(process.cwd(), "proof", "interactive-check", "workspace-smoke");
fs.mkdirSync(out, { recursive: true });
const field = WORKSPACE_DEFAULT_FIELDS[typology];
const source = typology === "void-edge-workspace"
  ? [
      { letter: "U", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 3, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { letter: "U", x: 2, y: 1, z: 0, rx: 0, ry: 0, rz: 0, scale: 3, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { letter: "L", x: -3, y: -2, z: 0, rx: 0, ry: 0, rz: 0, scale: 2, scaleX: 1, scaleY: 1, scaleZ: 1 },
    ]
  : [
      { letter: "L", x: -4, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 3, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { letter: "V", x: 4, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 3, scaleX: 1, scaleY: 1, scaleZ: 1 },
      { letter: "L", x: 0, y: 4, z: 0, rx: 0, ry: 0, rz: 0, scale: 2.5, scaleX: 1, scaleY: 1, scaleZ: 1 },
    ];
const arranged = arrangeOfficeLetters(source, typology, 12, [0, 0, 0], field);
if (!arranged.officePlan) throw new Error("no plan");
const dual = workspaceDualReports(arranged.officePlan);
if (dual.letterArrangement.overall === "fail") {
  console.error("letter arrangement failed", dual.letterArrangement.rules.filter((r) => r.status === "fail"));
  process.exit(2);
}
const request = {
  generator: "workspace-ten-rule",
  envelopeVersion: "workspace-ten-rule",
  workspaceTypology: typology,
  typologyName: workspaceTypologyName(typology),
  field,
  preferredFeet: 13,
  population: source.length,
  sourceId: "workspace-smoke",
  sourceName: "workspace smoke " + typology,
  source: arranged.placements,
  workspacePlan: arranged.officePlan,
  letterArrangementReport: dual.letterArrangement,
  architecturalGenerationReport: dual.architecturalGeneration,
  letterArrangementRulesetId: LETTER_ARRANGEMENT_RULESET_ID,
  letterArrangementRulesetVersion: LETTER_ARRANGEMENT_RULESET_VERSION,
  architecturalGenerationRulesetId: ARCHITECTURAL_GENERATION_RULESET_ID,
  architecturalGenerationRulesetVersion: ARCHITECTURAL_GENERATION_RULESET_VERSION,
  rulesetId: `${LETTER_ARRANGEMENT_RULESET_ID}+${ARCHITECTURAL_GENERATION_RULESET_ID}`,
  rulesetVersion: `${LETTER_ARRANGEMENT_RULESET_VERSION}/${ARCHITECTURAL_GENERATION_RULESET_VERSION}`,
};
const reqFile = path.join(out, "request.json");
fs.writeFileSync(reqFile, JSON.stringify(request, null, 2));
const run = spawnSync(process.execPath, [path.join(__dirname, "amphitheater-interactive-worker.cjs"), reqFile, out], {
  cwd: process.cwd(),
  encoding: "utf8",
  windowsHide: true,
});
if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  if (fs.existsSync(path.join(out, "error.txt"))) console.error(fs.readFileSync(path.join(out, "error.txt"), "utf8"));
  process.exit(run.status || 1);
}
const result = JSON.parse(fs.readFileSync(path.join(out, "result.json"), "utf8"));
console.log(
  "PASS",
  typology,
  "among",
  WORKSPACE_TYPOLOGIES.length,
  "LA",
  result.letterArrangementReport.overall,
  "AG",
  result.architecturalGenerationReport.overall,
  "vol",
  result.volume.toFixed(2),
  "letters",
  result.sourceCount,
);
