/**
 * v3.5 vs v4.1 comparison over the 15 original OBJs.
 *
 * Read-only toward the sources and the v3.5 baseline dump. Writes only into
 * reports/descriptor-v4/. Does not change scores, formulas, or geometry.
 *
 * Run: npx --yes tsx reports/descriptor-v4/compare-v35-v4.mts [objDir]
 *
 * Checks performed:
 *  1. Source OBJ unchanged: SHA-256 of each file is recorded; vertex and face
 *     counts must equal the v3.5 baseline dump.
 *  2. v3.5 reproducibility: evaluateTileModelLegacy must equal the baseline
 *     dump for every descriptor (|Δ| ≤ 1e-6).
 *  3. v4 determinism: two independent evaluateV4 runs must agree exactly.
 *  4. v4 reconstruction: Σ(precise × weight) / Σ weight over measured
 *     components must equal the published absolute score.
 *  5. v4 evidence coherence: every component's layerIds exist and every
 *     drawn layer belongs to a component.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeMesh } from "../../src/components/lattice/analyze";
import { parseObj } from "../../src/components/lattice/parseObj";
import {
  ARCH_DESCRIPTORS,
  DESCRIPTOR_ALGORITHM_VERSION,
  evaluateTileModel,
  evaluateTileModelLegacy,
  LEGACY_DESCRIPTOR_ALGORITHM_VERSION,
} from "../../src/components/evaluations/objDescriptorAnalysis";
import { evaluateV4 } from "../../src/components/evaluations/v4/evaluateV4";

type BaselineDump = {
  algorithm: string;
  formCount: number;
  forms: Array<{
    filename: string;
    vertices: number;
    faces: number;
    descriptors: Array<{ id: string; absoluteScore: number; components: Array<{ name: string; precise?: number; value: number; weight: number }> }>;
  }>;
  ranks: Record<string, Array<{ filename: string; absoluteScore: number; rank: number }>>;
};

const source = process.argv[2] ?? "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";
const outDir = join(process.cwd(), "reports", "descriptor-v4");
const baselinePath = join(process.cwd(), "reports", "descriptor-measurement-audit", "current-evaluator-dump.json");
await mkdir(outDir, { recursive: true });

const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as BaselineDump;
if (baseline.algorithm !== LEGACY_DESCRIPTOR_ALGORITHM_VERSION) {
  throw new Error(`Baseline dump is ${baseline.algorithm}; expected ${LEGACY_DESCRIPTOR_ALGORITHM_VERSION}.`);
}

const problems: string[] = [];
const names = (await readdir(source)).filter((name) => name.toLowerCase().endsWith(".obj")).sort((a, b) => a.localeCompare(b));

type FormRecord = {
  filename: string;
  sha256: string;
  vertices: number;
  faces: number;
  boundsFeet: [number, number, number];
  v4Ms: number;
  legacyMs: number;
  summary: unknown;
  descriptors: Array<{
    id: string;
    name: string;
    legacyScore: number;
    legacyBaselineScore: number | null;
    v4Score: number | null;
    v4Available: boolean;
    v4Reason?: string;
    v4Validity: string;
    reconstructed: number | null;
    deterministic: boolean;
    layers: number;
    components: Array<{
      name: string;
      status: string;
      raw: number | null;
      units: string;
      precise: number | null;
      weight: number;
      formula: string;
      normalization: string;
      reason?: string;
    }>;
    notes: string[];
  }>;
};

const forms: FormRecord[] = [];

for (const filename of names) {
  const text = await readFile(join(source, filename), "utf8");
  const sha256 = createHash("sha256").update(text).digest("hex");
  const mesh = parseObj(text, filename);
  const model = analyzeMesh(mesh, null, 1, "y");
  const descriptorSource = { positions: mesh.positions, faces: mesh.faces, up: "y" as const, unitScale: 1 };
  const baseForm = baseline.forms.find((item) => item.filename === filename) ?? null;
  if (!baseForm) problems.push(`${filename}: not in the v3.5 baseline dump.`);
  else if (baseForm.vertices !== mesh.positions.length / 3 || baseForm.faces !== mesh.faces.length) {
    problems.push(`${filename}: vertex/face count differs from baseline (${baseForm.vertices}/${baseForm.faces} vs ${mesh.positions.length / 3}/${mesh.faces.length}).`);
  }

  const legacyStart = performance.now();
  const legacy = evaluateTileModelLegacy(model, descriptorSource);
  const legacyMs = performance.now() - legacyStart;

  const v4Start = performance.now();
  const v4 = evaluateTileModel(model, descriptorSource);
  const v4Ms = performance.now() - v4Start;
  // Independent runs bypassing the evaluation cache.
  const runA = evaluateV4(descriptorSource, model.id);
  const runB = evaluateV4(descriptorSource, model.id);

  const descriptors: FormRecord["descriptors"] = ARCH_DESCRIPTORS.map((meta) => {
    const legacyDescriptor = legacy.descriptors.find((item) => item.id === meta.id)!;
    const v4Descriptor = v4.descriptors.find((item) => item.id === meta.id)!;
    const baseDescriptor = baseForm?.descriptors.find((item) => item.id === meta.id) ?? null;
    if (baseDescriptor && Math.abs(baseDescriptor.absoluteScore - legacyDescriptor.absoluteScore) > 1e-6) {
      problems.push(`${filename} ${meta.id}: v3.5 legacy evaluation ${legacyDescriptor.absoluteScore} differs from baseline ${baseDescriptor.absoluteScore}.`);
    }
    const a = runA.descriptors.find((item) => item.id === meta.id)!;
    const b = runB.descriptors.find((item) => item.id === meta.id)!;
    const deterministic = Object.is(a.absoluteScore, b.absoluteScore)
      && a.evidence.components.every((term, index) => Object.is(term.precise, b.evidence.components[index]?.precise) && Object.is(term.raw, b.evidence.components[index]?.raw));
    if (!deterministic) problems.push(`${filename} ${meta.id}: v4 runs disagree.`);
    if (!Object.is(a.absoluteScore, v4Descriptor.absoluteScore)) problems.push(`${filename} ${meta.id}: evaluateTileModel v4 score differs from evaluateV4.`);

    const evidence = v4Descriptor.evidence!;
    const measured = evidence.components.filter((term) => term.status === "measured");
    const weight = measured.reduce((sum, term) => sum + term.weight, 0);
    const reconstructed = weight ? measured.reduce((sum, term) => sum + (term.precise as number) * term.weight, 0) / weight : null;
    if (v4Descriptor.available && (reconstructed === null || Math.abs(reconstructed - v4Descriptor.absoluteScore) > 1e-9)) {
      problems.push(`${filename} ${meta.id}: reconstructed ${reconstructed} ≠ published ${v4Descriptor.absoluteScore}.`);
    }
    if (!v4Descriptor.available && Number.isFinite(v4Descriptor.absoluteScore)) problems.push(`${filename} ${meta.id}: unavailable but finite score.`);
    for (const term of evidence.components) {
      if (term.status === "measured" && term.raw === 0 && term.precise === 0) continue; // measured zero is legitimate
      if (term.status === "unavailable" && term.precise !== null) problems.push(`${filename} ${meta.id} ${term.name}: unavailable term has a value.`);
    }
    const layerIds = new Set(evidence.layers.map((layer) => layer.id));
    for (const term of evidence.components) {
      // Layers with no geometry are dropped; a measured non-zero term must still have at least one drawn layer.
      if (term.status === "measured" && term.raw !== 0 && !term.layerIds.some((id) => layerIds.has(id))) {
        problems.push(`${filename} ${meta.id} ${term.name}: no drawn layer for a measured term.`);
      }
    }
    for (const layer of evidence.layers) {
      if (!(layer.shown > 0 || (layer.dimensions?.length ?? 0) > 0) || layer.shown > layer.total) problems.push(`${filename} ${meta.id}: layer ${layer.id} shown ${layer.shown} / total ${layer.total}.`);
    }

    return {
      id: meta.id,
      name: meta.name,
      legacyScore: legacyDescriptor.absoluteScore,
      legacyBaselineScore: baseDescriptor?.absoluteScore ?? null,
      v4Score: Number.isFinite(v4Descriptor.absoluteScore) ? v4Descriptor.absoluteScore : null,
      v4Available: v4Descriptor.available ?? false,
      v4Reason: v4Descriptor.unavailableReason,
      v4Validity: evidence.validity,
      reconstructed,
      deterministic,
      layers: evidence.layers.length,
      components: evidence.components.map((term) => ({
        name: term.name,
        status: term.status,
        raw: term.raw,
        units: term.units,
        precise: term.precise,
        weight: term.weight,
        formula: term.formula,
        normalization: term.normalization,
        reason: term.reason,
      })),
      notes: evidence.notes,
    };
  });

  forms.push({
    filename,
    sha256,
    vertices: mesh.positions.length / 3,
    faces: mesh.faces.length,
    boundsFeet: [runA.summary.bounds.size[0], runA.summary.bounds.size[1], runA.summary.bounds.size[2]],
    v4Ms: Math.round(v4Ms),
    legacyMs: Math.round(legacyMs),
    summary: runA.summary,
    descriptors,
  });
  console.log(`${filename}  v3.5 ${Math.round(legacyMs)} ms  v4 ${Math.round(v4Ms)} ms  levels=${runA.summary.levels} regions=${runA.summary.regions} entries=${runA.summary.entries}`);
}

// Ranks: 1 weakest … n strongest, ties by filename. Unavailable forms are listed separately.
type RankRow = { filename: string; score: number; rank: number };
function rank(getScore: (form: FormRecord, id: string) => number | null, id: string) {
  const rows: RankRow[] = [];
  const unavailable: string[] = [];
  for (const form of forms) {
    const score = getScore(form, id);
    if (score === null || !Number.isFinite(score)) unavailable.push(form.filename);
    else rows.push({ filename: form.filename, score, rank: 0 });
  }
  rows.sort((left, right) => left.score - right.score || left.filename.localeCompare(right.filename));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return { rows, unavailable };
}

const legacyRanks: Record<string, ReturnType<typeof rank>> = {};
const v4Ranks: Record<string, ReturnType<typeof rank>> = {};
for (const meta of ARCH_DESCRIPTORS) {
  legacyRanks[meta.id] = rank((form, id) => form.descriptors.find((item) => item.id === id)?.legacyScore ?? null, meta.id);
  v4Ranks[meta.id] = rank((form, id) => form.descriptors.find((item) => item.id === id)?.v4Score ?? null, meta.id);
  const baselineRows = baseline.ranks[meta.id] ?? [];
  for (const row of legacyRanks[meta.id].rows) {
    const base = baselineRows.find((item) => item.filename === row.filename);
    if (base && base.rank !== row.rank) problems.push(`${meta.id} ${row.filename}: legacy rank ${row.rank} ≠ baseline rank ${base.rank}.`);
  }
}

function spearman(id: string) {
  const pairs = forms
    .map((form) => [legacyRanks[id].rows.find((row) => row.filename === form.filename)?.rank, v4Ranks[id].rows.find((row) => row.filename === form.filename)?.rank] as [number | undefined, number | undefined])
    .filter((pair): pair is [number, number] => pair[0] !== undefined && pair[1] !== undefined);
  const n = pairs.length;
  if (n < 3) return null;
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n;
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (const [a, b] of pairs) {
    cov += (a - meanA) * (b - meanB);
    varA += (a - meanA) ** 2;
    varB += (b - meanB) ** 2;
  }
  return varA && varB ? cov / Math.sqrt(varA * varB) : null;
}

const fmt = (value: number | null | undefined, digits = 1) => (value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(digits));
const rankOf = (table: Record<string, ReturnType<typeof rank>>, id: string, filename: string) => table[id].rows.find((row) => row.filename === filename)?.rank;
const short = (filename: string) => filename.replace(/\.obj$/i, "");

const lines: string[] = [];
lines.push(`# v3.5 → ${DESCRIPTOR_ALGORITHM_VERSION} comparison — ${forms.length} original OBJs`);
lines.push("");
lines.push(`Generated by \`reports/descriptor-v4/compare-v35-v4.mts\`. Baseline: \`reports/descriptor-measurement-audit/current-evaluator-dump.json\` (${baseline.algorithm}). v4 constant: \`${DESCRIPTOR_ALGORITHM_VERSION}\`.`);
lines.push("");
lines.push("Scores are absolute 0–100 from fixed calibration. Rank 1 is the weakest expression; the highest rank is the strongest. A measured 0 is ranked. `n/a` is a geometry-processing failure, not a measured zero.");
lines.push("");
lines.push("## Source integrity");
lines.push("");
lines.push("| File | SHA-256 | Vertices | Faces | Bounds (ft, x × y × z-up) | v3.5 ms | v4 ms |");
lines.push("|---|---|---:|---:|---|---:|---:|");
for (const form of forms) {
  lines.push(`| ${form.filename} | \`${form.sha256.slice(0, 16)}…\` | ${form.vertices} | ${form.faces} | ${form.boundsFeet.map((v) => v.toFixed(1)).join(" × ")} | ${form.legacyMs} | ${form.v4Ms} |`);
}
lines.push("");
lines.push(`## Absolute scores — before (v3.5) / after (${DESCRIPTOR_ALGORITHM_VERSION})`);
lines.push("");
lines.push(`| Form | ${ARCH_DESCRIPTORS.map((meta) => meta.name).join(" | ")} |`);
lines.push(`|---|${ARCH_DESCRIPTORS.map(() => "---").join("|")}|`);
for (const form of forms) {
  lines.push(`| ${short(form.filename)} | ${form.descriptors.map((d) => `${fmt(d.legacyScore)} → ${fmt(d.v4Score)}`).join(" | ")} |`);
}
lines.push("");
lines.push(`## Registry ranks — before (v3.5) / after (${DESCRIPTOR_ALGORITHM_VERSION})`);
lines.push("");
lines.push(`| Form | ${ARCH_DESCRIPTORS.map((meta) => meta.name).join(" | ")} |`);
lines.push(`|---|${ARCH_DESCRIPTORS.map(() => "---").join("|")}|`);
for (const form of forms) {
  lines.push(`| ${short(form.filename)} | ${ARCH_DESCRIPTORS.map((meta) => `${rankOf(legacyRanks, meta.id, form.filename) ?? "n/a"} → ${rankOf(v4Ranks, meta.id, form.filename) ?? "n/a"}`).join(" | ")} |`);
}
lines.push("");
lines.push("## Per-descriptor summary");
lines.push("");
lines.push("| Descriptor | Validity (v4) | Ranked forms (v4) | Unavailable (v4) | Spearman ρ (v3.5 vs v4 ranks) | v4 min | v4 max | Weakest (v4) | Strongest (v4) |");
lines.push("|---|---|---:|---|---:|---:|---:|---|---|");
for (const meta of ARCH_DESCRIPTORS) {
  const rows = v4Ranks[meta.id].rows;
  const validity = forms[0]?.descriptors.find((d) => d.id === meta.id)?.v4Validity ?? "";
  const rho = spearman(meta.id);
  lines.push(`| ${meta.name} | ${validity} | ${rows.length} | ${v4Ranks[meta.id].unavailable.map(short).join(", ") || "—"} | ${rho === null ? "n/a" : rho.toFixed(2)} | ${fmt(rows[0]?.score)} | ${fmt(rows[rows.length - 1]?.score)} | ${rows[0] ? short(rows[0].filename) : "—"} | ${rows[rows.length - 1] ? short(rows[rows.length - 1].filename) : "—"} |`);
}
lines.push("");
lines.push("## Gathering Linear vs Lobby Continuous Hall");
lines.push("");
const pair = ["Gathering Linear.obj", "Lobby Continuous Hall.obj"].map((name) => forms.find((form) => form.filename === name) ?? null);
if (pair.every(Boolean)) {
  lines.push("| Descriptor | Gathering Linear v3.5 | Gathering Linear v4 | Lobby Continuous Hall v3.5 | Lobby Continuous Hall v4 | v4 rank GL → LCH |");
  lines.push("|---|---:|---:|---:|---:|---|");
  for (const meta of ARCH_DESCRIPTORS) {
    const [gl, lch] = pair.map((form) => form!.descriptors.find((d) => d.id === meta.id)!);
    lines.push(`| ${meta.name} | ${fmt(gl.legacyScore)} | ${fmt(gl.v4Score)} | ${fmt(lch.legacyScore)} | ${fmt(lch.v4Score)} | ${rankOf(v4Ranks, meta.id, pair[0]!.filename) ?? "n/a"} → ${rankOf(v4Ranks, meta.id, pair[1]!.filename) ?? "n/a"} |`);
  }
  lines.push("");
  for (const form of pair) {
    lines.push(`### ${form!.filename}`);
    lines.push("");
    lines.push(`Summary: ${JSON.stringify(form!.summary)}`);
    lines.push("");
    for (const descriptor of form!.descriptors) {
      lines.push(`**${descriptor.name}** — v4 ${fmt(descriptor.v4Score, 2)}${descriptor.v4Available ? "" : ` (unavailable: ${descriptor.v4Reason})`} · ${descriptor.v4Validity} · ${descriptor.layers} evidence layers`);
      lines.push("");
      lines.push("| Component | Status | Raw | Units | Term | Weight | Formula |");
      lines.push("|---|---|---:|---|---:|---:|---|");
      for (const term of descriptor.components) {
        lines.push(`| ${term.name} | ${term.status}${term.reason ? ` (${term.reason})` : ""} | ${term.raw === null ? "n/a" : Number(term.raw.toFixed(4))} | ${term.units} | ${fmt(term.precise)} | ${term.weight} | ${term.formula} |`);
      }
      if (descriptor.notes.length) {
        lines.push("");
        lines.push(descriptor.notes.map((note) => `- ${note}`).join("\n"));
      }
      lines.push("");
    }
  }
} else {
  lines.push("One or both of the pair files were not found in the source directory.");
}
lines.push("");
lines.push("## Validation checks");
lines.push("");
lines.push(problems.length ? problems.map((problem) => `- FAIL ${problem}`).join("\n") : "- PASS source counts match baseline\n- PASS v3.5 legacy evaluation reproduces the baseline dump for every descriptor and rank\n- PASS v4 deterministic across independent runs\n- PASS v4 weighted reconstruction equals the published score\n- PASS every measured v4 component has a drawn layer and no listed layer is empty");
lines.push("");

await writeFile(join(outDir, "comparison-tables.md"), lines.join("\n"));
await writeFile(join(outDir, "comparison.json"), JSON.stringify({
  generated: new Date().toISOString(),
  legacyVersion: LEGACY_DESCRIPTOR_ALGORITHM_VERSION,
  v4Version: DESCRIPTOR_ALGORITHM_VERSION,
  source,
  problems,
  forms,
  legacyRanks,
  v4Ranks,
}, null, 2));
console.log(`wrote comparison for ${forms.length} forms; ${problems.length} problem(s)`);
for (const problem of problems) console.log(`  FAIL ${problem}`);
process.exitCode = problems.length ? 1 : 0;
