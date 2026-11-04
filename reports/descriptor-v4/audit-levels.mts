/**
 * Direct geometric audit of architectural levels on the 15 original OBJs.
 *
 * Distinguishes:
 *   1. existing architectural levels (occupiable floors, including uncovered decks)
 *   2. potential future inter-form connections (upper openings, perimeter branches)
 *   3. existing geometrically verified circulation routes (walk/step chains)
 *
 * Does not invent stairs. Does not modify source OBJs, lattice placement, or
 * connection-generation. Writes only into reports/descriptor-v4/.
 *
 * Run: npx --yes tsx reports/descriptor-v4/audit-levels.mts [objDir]
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DESCRIPTOR_ALGORITHM_VERSION } from "../../src/components/evaluations/descriptorVersion";
import { parseObj } from "../../src/components/lattice/parseObj";
import { buildV4Context, V4_EVALUATORS } from "../../src/components/evaluations/v4/evaluateV4";

const source = process.argv[2] ?? "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";
const outDir = join(process.cwd(), "reports", "descriptor-v4");
await mkdir(outDir, { recursive: true });

const names = (await readdir(source)).filter((name) => name.toLowerCase().endsWith(".obj")).sort((a, b) => a.localeCompare(b));
if (names.length !== 15) {
  throw new Error(`Expected 15 original OBJs, found ${names.length} in ${source}`);
}

const DESCRIPTOR_IDS = [
  "openVolume",
  "convergent",
  "sculptural",
  "visuallyConnected",
  "surreal",
  "monumental",
  "hierarchical",
  "sequential",
  "circulationActivated",
  "centralized",
  "verticallyIntegrated",
  "luminous",
] as const;

type AuditForm = {
  filename: string;
  vertices: number;
  faces: number;
  triangles: number;
  boundsFeet: { min: number[]; max: number[]; size: number[] };
  levels: Array<{
    id: number;
    elevationFt: number;
    areaFt2: number;
    interiorAreaFt2: number;
    deckAreaFt2: number;
    areaByClass: Record<string, number>;
  }>;
  interiorFloorRegions: Array<{ id: number; levelId: number; areaFt2: number; elevationFt: number; floorClass: string }>;
  branches: Array<{ id: number; levelId: number; elevationFt: number; areaFt2: number; upper: boolean; independent: boolean; tips: number }>;
  independentInterfaces: number;
  belowLevelInteriorFt2: number;
  verifiedLinks: Array<{ lowerLevelId: number; upperLevelId: number }>;
  potentialLinks: Array<{ lowerLevelId: number; upperLevelId: number }>;
  disconnectedLinks: Array<{ lowerLevelId: number; upperLevelId: number }>;
  entries: number;
  potentialInterfaces: number;
  uncertainAreaFt2: number;
  roofLidAreaFt2: number;
  deckAreaFt2: number;
  uncertainNotes: string[];
  scores: Record<string, { score: number | null; available: boolean; reason?: string }>;
};

const forms: AuditForm[] = [];

for (const filename of names) {
  process.stdout.write(`auditing ${filename}\n`);
  const text = await readFile(join(source, filename), "utf8");
  const mesh = parseObj(text, filename);
  const descriptorSource = { positions: mesh.positions, faces: mesh.faces, up: "y" as const, unitScale: 1 };
  const ctx = buildV4Context(descriptorSource, filename);
  const descriptors = V4_EVALUATORS.map((evaluate) => evaluate(ctx));
  const uncertainNotes: string[] = [];
  if (ctx.field.areaByClass.uncertain >= 16) {
    uncertainNotes.push(`${ctx.field.areaByClass.uncertain.toFixed(0)} ft² of floor has enclosure 0.25–0.5 and is reported, not credited as interior volume.`);
  }
  if (ctx.field.roofLidArea >= 16) {
    uncertainNotes.push(`${ctx.field.roofLidArea.toFixed(0)} ft² of uncovered samples classified as roof caps, not occupiable levels.`);
  }
  const scores: AuditForm["scores"] = {};
  for (const item of descriptors) {
    scores[item.id] = {
      score: Number.isFinite(item.absoluteScore) ? item.absoluteScore : null,
      available: item.available,
      reason: item.unavailableReason,
    };
  }
  forms.push({
    filename,
    vertices: mesh.positions.length / 3,
    faces: mesh.faces.length,
    triangles: ctx.mesh.triangles.length,
    boundsFeet: {
      min: [...ctx.mesh.bounds.min],
      max: [...ctx.mesh.bounds.max],
      size: [...ctx.mesh.bounds.size],
    },
    levels: ctx.field.levels.map((level) => ({
      id: level.id,
      elevationFt: level.elevation,
      areaFt2: level.area,
      interiorAreaFt2: level.areaByClass.sheltered + level.areaByClass.openVoid + level.areaByClass.uncertain + level.areaByClass.obstructed,
      deckAreaFt2: level.areaByClass.exposed,
      areaByClass: { ...level.areaByClass },
    })),
    interiorFloorRegions: ctx.network.regions.map((region) => ({
      id: region.id,
      levelId: region.levelId,
      areaFt2: region.area,
      elevationFt: region.centroid[2],
      floorClass: region.floorClass,
    })),
    branches: ctx.field.branches.map((branch) => ({
      id: branch.id,
      levelId: branch.levelId,
      elevationFt: branch.elevation,
      areaFt2: branch.area,
      upper: branch.upper,
      independent: branch.independent,
      tips: branch.tips.length,
    })),
    independentInterfaces: ctx.field.branches.filter((branch) => branch.independent).length,
    belowLevelInteriorFt2: ctx.field.belowLevelInteriorArea,
    verifiedLinks: ctx.network.levelLinks.filter((link) => link.status === "verified").map((link) => ({ lowerLevelId: link.lowerLevelId, upperLevelId: link.upperLevelId })),
    potentialLinks: ctx.network.levelLinks.filter((link) => link.status === "potential").map((link) => ({ lowerLevelId: link.lowerLevelId, upperLevelId: link.upperLevelId })),
    disconnectedLinks: ctx.network.levelLinks.filter((link) => link.status === "disconnected").map((link) => ({ lowerLevelId: link.lowerLevelId, upperLevelId: link.upperLevelId })),
    entries: ctx.network.entries.length,
    potentialInterfaces: ctx.network.potentialInterfaces.length,
    uncertainAreaFt2: ctx.field.areaByClass.uncertain,
    roofLidAreaFt2: ctx.field.roofLidArea,
    deckAreaFt2: ctx.field.deckArea,
    uncertainNotes,
    scores,
  });
}

const ranked: Record<string, Array<{ filename: string; score: number; rank: number }>> = {};
for (const id of DESCRIPTOR_IDS) {
  const rows = forms
    .filter((form) => form.scores[id]?.available && form.scores[id].score !== null)
    .map((form) => ({ filename: form.filename, score: form.scores[id].score as number }))
    .sort((left, right) => left.score - right.score || left.filename.localeCompare(right.filename))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  ranked[id] = rows;
}

await writeFile(join(outDir, "level-audit.json"), JSON.stringify({ version: DESCRIPTOR_ALGORITHM_VERSION, formCount: forms.length, forms, ranks: ranked }, null, 2));

const lines: string[] = [];
lines.push("# Architectural level audit — 15 original OBJs");
lines.push("");
lines.push("Geometric examination of the original meshes. Original OBJ vertices, faces, and topology were not modified.");
lines.push("");
lines.push("Three classifications are kept separate:");
lines.push("");
lines.push("1. **Existing architectural levels** — occupiable or potentially occupiable floor clusters (≥ 16 ft²), including uncovered decks and perimeter branches. Roof caps are excluded. An elevated level is counted even when no internal stair or ramp exists.");
lines.push("2. **Potential future inter-form connections** — upper-level perimeter openings and projecting branches. These are connection opportunities, not verified walkable routes.");
lines.push("3. **Existing geometrically verified circulation** — walk/step chains that actually join neighbouring samples. Potential links are never credited as stairs.");
lines.push("");
lines.push(`Forms audited: ${forms.length}.`);
lines.push("");
lines.push("## Level counts");
lines.push("");
lines.push("| Form | Levels | Elevations (ft) | Interior regions | Branches (upper / independent) | Verified links | Potential links | Disconnected | Lowest entries | Upper interfaces | Uncertain ft² | Below-level interior ft² |");
lines.push("|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const form of forms) {
  const elevations = form.levels.map((level) => level.elevationFt.toFixed(1)).join(", ") || "—";
  const upperBranches = form.branches.filter((branch) => branch.upper).length;
  lines.push(`| ${form.filename} | ${form.levels.length} | ${elevations} | ${form.interiorFloorRegions.length} | ${form.branches.length} (${upperBranches} / ${form.independentInterfaces}) | ${form.verifiedLinks.length} | ${form.potentialLinks.length} | ${form.disconnectedLinks.length} | ${form.entries} | ${form.potentialInterfaces} | ${form.uncertainAreaFt2.toFixed(0)} | ${form.belowLevelInteriorFt2.toFixed(0)} |`);
}
lines.push("");
lines.push("## Per-form notes");
lines.push("");
for (const form of forms) {
  lines.push(`### ${form.filename}`);
  lines.push("");
  lines.push(`Bounds ${form.boundsFeet.size.map((value) => value.toFixed(1)).join(" × ")} ft. ${form.vertices} vertices, ${form.faces} faces, ${form.triangles} triangles.`);
  lines.push("");
  if (!form.levels.length) lines.push("No occupiable level of 16 ft² was detected.");
  for (const level of form.levels) {
    lines.push(`- Level ${level.id}: elevation ${level.elevationFt.toFixed(2)} ft, ${level.areaFt2.toFixed(0)} ft² total, ${level.interiorAreaFt2.toFixed(0)} ft² interior, ${level.deckAreaFt2.toFixed(0)} ft² uncovered deck.`);
  }
  for (const branch of form.branches) {
    lines.push(`- Perimeter branch ${branch.id} on ${branch.independent ? "no counted level" : `level ${branch.levelId}`} at ${branch.elevationFt.toFixed(1)} ft, ${branch.areaFt2.toFixed(0)} ft², ${branch.independent ? "independent connection interface (not a floor)" : branch.upper ? "upper-level interface" : "lowest-level interface"}, ${branch.tips} tips.`);
  }
  if (!form.branches.length) lines.push("- No projecting connection interface of 4 ft² was detected. Interior levels still use the 16 ft² threshold.");
  for (const link of form.verifiedLinks) lines.push(`- Verified internal vertical connection: level ${link.lowerLevelId} → ${link.upperLevelId}.`);
  for (const link of form.potentialLinks) lines.push(`- Potential (unverified) level adjacency: level ${link.lowerLevelId} → ${link.upperLevelId}. Not a stair.`);
  for (const link of form.disconnectedLinks) lines.push(`- Disconnected consecutive levels: ${link.lowerLevelId} → ${link.upperLevelId}. The upper level still exists.`);
  if (form.potentialInterfaces) lines.push(`- ${form.potentialInterfaces} upper-level perimeter opening(s) recorded as potential external connection interfaces.`);
  for (const note of form.uncertainNotes) lines.push(`- Uncertain: ${note}`);
  lines.push("");
}

const single = forms.filter((form) => form.levels.length === 1);
const three = forms.filter((form) => form.levels.length >= 3);
lines.push("## Interpretation");
lines.push("");
lines.push(`Single-level forms: ${single.length ? single.map((form) => form.filename).join("; ") : "none"}.`);
lines.push(`Forms with three or more levels: ${three.length ? three.map((form) => `${form.filename} (${form.levels.length})`).join("; ") : "none"}.`);
lines.push("");
lines.push("Upper levels without an internal stair remain levels. Their perimeter openings remain potential interfaces. They are not credited as verified circulation.");
lines.push("");
lines.push("## Descriptor ranking completeness");
lines.push("");
lines.push("| Descriptor | Ranked forms | Processing failures |");
lines.push("|---|---:|---:|");
for (const id of DESCRIPTOR_IDS) {
  const failures = forms.filter((form) => !form.scores[id]?.available).length;
  lines.push(`| ${id} | ${ranked[id].length} | ${failures} |`);
}
lines.push("");
lines.push("Every finite score, including 0, is ranked 1…n in the same 15-form group. Ties use filename after score. A processing failure is `n/a`, not 0.");
lines.push("");
lines.push("## v4.1 scores (0–100)");
lines.push("");
lines.push(`| Form | ${DESCRIPTOR_IDS.map((id) => id).join(" | ")} |`);
lines.push(`|---|${DESCRIPTOR_IDS.map(() => "---:").join("|")}|`);
for (const form of forms) {
  const cells = DESCRIPTOR_IDS.map((id) => {
    const score = form.scores[id];
    return score?.available && score.score !== null ? score.score.toFixed(1) : "n/a";
  });
  lines.push(`| ${form.filename} | ${cells.join(" | ")} |`);
}
lines.push("");
lines.push("## v4.1 ranks (1 weakest … 15 strongest)");
lines.push("");
lines.push(`| Form | ${DESCRIPTOR_IDS.map((id) => id).join(" | ")} |`);
lines.push(`|---|${DESCRIPTOR_IDS.map(() => "---:").join("|")}|`);
for (const form of forms) {
  const cells = DESCRIPTOR_IDS.map((id) => {
    const row = ranked[id].find((item) => item.filename === form.filename);
    return row ? String(row.rank) : "n/a";
  });
  lines.push(`| ${form.filename} | ${cells.join(" | ")} |`);
}
lines.push("");
const room = forms.find((form) => form.filename.toLowerCase().includes("room within"));
if (room) {
  const missing = DESCRIPTOR_IDS.filter((id) => !room.scores[id]?.available);
  lines.push(`Gathering — Room within Volume has ${room.levels.length} counted interior level(s) and a finite score for ${DESCRIPTOR_IDS.length - missing.length} of ${DESCRIPTOR_IDS.length} descriptors.${missing.length ? ` Processing failures: ${missing.join(", ")}.` : " No descriptor was skipped because of floor count."}`);
  lines.push("");
}

await writeFile(join(outDir, "level-audit.md"), lines.join("\n"));
process.stdout.write(`Wrote ${join(outDir, "level-audit.md")} for ${forms.length} forms.\n`);
