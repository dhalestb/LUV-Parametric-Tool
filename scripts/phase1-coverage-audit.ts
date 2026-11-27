/**
 * Phase 1.2 — 15 original OBJ × 5 descriptor coverage audit.
 * Uses the registry paths from registryOpenVolume.ts.
 * Does not modify meshes. Writes JSON + markdown under reports/.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DESCRIPTOR_ALGORITHM_VERSION, OPEN_VOLUME_ALGORITHM_VERSION } from "../src/components/evaluations/descriptorVersion.ts";
import { evaluateTileModel } from "../src/components/evaluations/objDescriptorAnalysis.ts";
import { analyzeMesh } from "../src/components/lattice/analyze.ts";
import { parseObj } from "../src/components/lattice/parseObj.ts";
import { suggestSlot } from "../src/components/lattice/slots.ts";
import { buildV4Context, evaluateV4 } from "../src/components/evaluations/v4/evaluateV4.ts";

const REGISTRY_DIRECTORY = "C:\\design 7\\assignment 2\\obj files";
const REGISTRY_RELATIVE_DIRS = ["gathering", "lobbies", "workspaces\\v2\\original forms"];
const DESCRIPTOR_IDS = [
  "openVolume",
  "visuallyConnected",
  "circulationActivated",
  "centralized",
  "verticallyIntegrated",
] as const;

type Outcome =
  | "PASS"
  | "MEASURED_ZERO"
  | "NOT_APPLICABLE"
  | "INSUFFICIENT_EVIDENCE"
  | "PROCESSING_FAILURE"
  | "VISUALIZATION_FAILURE"
  | "PASS_WITH_NA_COMPONENTS";

type ComponentNote = {
  name: string;
  status: string;
  precise: number | null;
  reason?: string;
  weight: number;
};

type DescriptorAudit = {
  id: string;
  name: string;
  outcome: Outcome;
  absoluteScore: number | null;
  available: boolean;
  version: string;
  validity: string;
  layerCount: number;
  measuredLayers: number;
  components: ComponentNote[];
  naComponents: string[];
  notes: string[];
  cause?: string;
  proposedCorrection?: string;
};

type FormAudit = {
  filename: string;
  path: string;
  suggestedSlot: string | null;
  importOk: boolean;
  triangleCount: number;
  floorSamples: number;
  levels: number;
  interiorAreaFt2: number;
  networkNodes: number;
  regions: number;
  entries: number;
  error?: string;
  descriptors: DescriptorAudit[];
};

async function listRegistryObjFiles() {
  const files: Array<{ filename: string; path: string }> = [];
  for (const relative of REGISTRY_RELATIVE_DIRS) {
    const directory = join(REGISTRY_DIRECTORY, relative);
    const names = (await readdir(directory))
      .filter((name) => name.toLowerCase().endsWith(".obj"))
      .sort((left, right) => left.localeCompare(right));
    for (const name of names) files.push({ filename: basename(name), path: join(directory, name) });
  }
  return files;
}

function classifyDescriptor(item: ReturnType<typeof evaluateV4>["descriptors"][number]): DescriptorAudit {
  const components: ComponentNote[] = item.evidence.components.map((term) => ({
    name: term.name,
    status: term.status,
    precise: term.precise,
    reason: term.reason,
    weight: term.weight,
  }));
  const naComponents = components
    .filter((term) =>
      term.status === "unavailable"
      || (term.status === "measured" && term.precise === 0 && term.reason && /single|no second|absent|fewer than|no pair|no interior|no supported|no surface/i.test(term.reason)),
    )
    .map((term) => term.name);
  const measuredLayers = item.evidence.layers.filter((layer) => layer.status === "measured" || layer.status === "verified").length;
  const base = {
    id: item.id,
    name: item.name,
    absoluteScore: Number.isFinite(item.absoluteScore) ? item.absoluteScore : null,
    available: item.available,
    version: item.evidence.version,
    validity: item.evidence.validity,
    layerCount: item.evidence.layers.length,
    measuredLayers,
    components,
    naComponents,
    notes: item.evidence.notes,
  };

  if (!item.available || !Number.isFinite(item.absoluteScore)) {
    return {
      ...base,
      outcome: "PROCESSING_FAILURE",
      cause: item.unavailableReason ?? "Non-finite absolute score.",
      proposedCorrection: "Inspect mesh import, empty triangles, or geometry-processing exceptions.",
    };
  }

  if (item.absoluteScore === 0) {
    const absentNote = item.evidence.notes.some((note) => /absent|single-level|one architectural level|no interior|no supported/i.test(note))
      || naComponents.length > 0
      || item.evidence.components.every((term) => term.precise === 0 || term.status === "unavailable");
    return {
      ...base,
      outcome: absentNote ? "MEASURED_ZERO" : "INSUFFICIENT_EVIDENCE",
      cause: absentNote
        ? "Characteristic measured as absent or not present in this configuration."
        : "Zero score without a clear absence note; verify floor detection and component evidence.",
      proposedCorrection: absentNote
        ? "Keep as legitimate measured zero; improve explain copy if needed."
        : "Trace floor samples, levels, and component reasons; do not force a positive score.",
    };
  }

  const scoredPositive = item.evidence.components.some((term) => term.status === "measured" && (term.precise ?? 0) > 0 && (term.raw === undefined || term.raw === null || term.raw !== 0));
  if (scoredPositive && measuredLayers === 0) {
    return {
      ...base,
      outcome: "VISUALIZATION_FAILURE",
      cause: "Positive score with no measured/verified evidence layers.",
      proposedCorrection: "Rebuild evidence layers for measured components; keep diagnostic mode separate from presentation.",
    };
  }

  // Detect N/A-as-measured-zero audit findings that still allow a positive composite.
  const falseZero = item.evidence.components.filter((term) =>
    term.status === "measured"
    && term.precise === 0
    && term.reason
    && /single floor region|single level|no second region|multi-level circulation distribution is absent/i.test(term.reason),
  );
  if (falseZero.length) {
    return {
      ...base,
      outcome: "PASS_WITH_NA_COMPONENTS",
      cause: `N/A components scored as measured zero: ${falseZero.map((term) => term.name).join(", ")}.`,
      proposedCorrection: "Mark those components unavailable so weights renormalize; do not invent architecture.",
    };
  }

  return {
    ...base,
    outcome: "PASS",
  };
}

async function auditForm(file: { filename: string; path: string }, includeTopDecks: boolean): Promise<FormAudit> {
  try {
    const text = await readFile(file.path, "utf8");
    const mesh = parseObj(text, file.filename);
    if (!mesh.positions.length || !mesh.faces.length) {
      return {
        filename: file.filename,
        path: file.path,
        suggestedSlot: suggestSlot(file.filename),
        importOk: false,
        triangleCount: 0,
        floorSamples: 0,
        levels: 0,
        interiorAreaFt2: 0,
        networkNodes: 0,
        regions: 0,
        entries: 0,
        error: "OBJ parsed with no positions or faces.",
        descriptors: DESCRIPTOR_IDS.map((id) => ({
          id,
          name: id,
          outcome: "PROCESSING_FAILURE",
          absoluteScore: null,
          available: false,
          version: "",
          validity: "insufficient-evidence",
          layerCount: 0,
          measuredLayers: 0,
          components: [],
          naComponents: [],
          notes: [],
          cause: "Empty mesh after import.",
          proposedCorrection: "Re-export OBJ; verify unit and up-axis.",
        })),
      };
    }
    const model = analyzeMesh(mesh, null, 1, "y");
    const source = { positions: mesh.positions, faces: mesh.faces, up: "y" as const, unitScale: 1 };
    const ctx = buildV4Context(source, file.filename, { includeTopDecks });
    const evaluation = evaluateV4(source, file.filename, { includeTopDecks });
    // Touch evaluateTileModel path for cache/version parity with the UI.
    evaluateTileModel(model, source, { includeTopDecks });
    const byId = new Map(evaluation.descriptors.map((item) => [item.id, item]));
    return {
      filename: file.filename,
      path: file.path,
      suggestedSlot: suggestSlot(file.filename),
      importOk: true,
      triangleCount: evaluation.summary.triangles,
      floorSamples: evaluation.summary.floorSamples,
      levels: evaluation.summary.levels,
      interiorAreaFt2: Number(ctx.field.interiorArea.toFixed(1)),
      networkNodes: evaluation.summary.networkNodes,
      regions: evaluation.summary.regions,
      entries: evaluation.summary.entries,
      descriptors: DESCRIPTOR_IDS.map((id) => classifyDescriptor(byId.get(id)!)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      filename: file.filename,
      path: file.path,
      suggestedSlot: suggestSlot(file.filename),
      importOk: false,
      triangleCount: 0,
      floorSamples: 0,
      levels: 0,
      interiorAreaFt2: 0,
      networkNodes: 0,
      regions: 0,
      entries: 0,
      error: message,
      descriptors: DESCRIPTOR_IDS.map((id) => ({
        id,
        name: id,
        outcome: "PROCESSING_FAILURE",
        absoluteScore: null,
        available: false,
        version: "",
        validity: "insufficient-evidence",
        layerCount: 0,
        measuredLayers: 0,
        components: [],
        naComponents: [],
        notes: [],
        cause: message,
        proposedCorrection: "Fix import/geometry exception; do not alter the original OBJ without diagnosis.",
      })),
    };
  }
}

function markdownReport(payload: {
  generatedAt: string;
  settings: Record<string, unknown>;
  forms: FormAudit[];
}) {
  const { forms, settings, generatedAt } = payload;
  const counts: Record<string, number> = {};
  for (const form of forms) {
    for (const descriptor of form.descriptors) {
      counts[descriptor.outcome] = (counts[descriptor.outcome] ?? 0) + 1;
    }
  }
  const lines: string[] = [];
  lines.push("# Deliverable A — Baseline and coverage audit");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("## Environment / settings");
  lines.push("");
  for (const [key, value] of Object.entries(settings)) lines.push(`- **${key}:** ${JSON.stringify(value)}`);
  lines.push("");
  lines.push("## Outcome summary (75 cells)");
  lines.push("");
  for (const [outcome, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${outcome}:** ${count}`);
  }
  lines.push("");
  lines.push("## Coverage matrix");
  lines.push("");
  lines.push("| Form | Slot | Open Volume | Visually Connected | Circulation Activated | Centralized | Vertically Integrated | Floors | Levels | Interior ft² |");
  lines.push("|---|---|---|---|---|---|---|---:|---:|---:|");
  for (const form of forms) {
    const cell = (id: string) => {
      const descriptor = form.descriptors.find((item) => item.id === id)!;
      const score = descriptor.absoluteScore === null ? "n/a" : descriptor.absoluteScore.toFixed(1);
      return `${descriptor.outcome} (${score})`;
    };
    lines.push(
      `| ${form.filename} | ${form.suggestedSlot ?? "?"} | ${cell("openVolume")} | ${cell("visuallyConnected")} | ${cell("circulationActivated")} | ${cell("centralized")} | ${cell("verticallyIntegrated")} | ${form.floorSamples} | ${form.levels} | ${form.interiorAreaFt2} |`,
    );
  }
  lines.push("");
  lines.push("## Failures and questionable results");
  lines.push("");
  for (const form of forms) {
    const issues = form.descriptors.filter((descriptor) => descriptor.outcome !== "PASS" && descriptor.outcome !== "MEASURED_ZERO");
    if (!form.importOk || issues.length) {
      lines.push(`### ${form.filename}`);
      if (form.error) lines.push(`- Import/processing error: ${form.error}`);
      for (const descriptor of issues) {
        lines.push(`- **${descriptor.name}** — ${descriptor.outcome}`);
        if (descriptor.cause) lines.push(`  - Cause: ${descriptor.cause}`);
        if (descriptor.proposedCorrection) lines.push(`  - Proposed correction: ${descriptor.proposedCorrection}`);
      }
      lines.push("");
    }
  }
  lines.push("## Measured zeros (legitimate absences)");
  lines.push("");
  for (const form of forms) {
    for (const descriptor of form.descriptors.filter((item) => item.outcome === "MEASURED_ZERO")) {
      lines.push(`- **${form.filename} / ${descriptor.name}** — score 0. ${descriptor.notes[0] ?? descriptor.cause ?? ""}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const includeTopDecks = process.argv.includes("--include-top-decks");
  const files = await listRegistryObjFiles();
  if (files.length !== 15) {
    console.error(`Expected 15 registry OBJs, found ${files.length}`);
  }
  console.log(`Auditing ${files.length} forms · includeTopDecks=${includeTopDecks} · OV ${OPEN_VOLUME_ALGORITHM_VERSION} · suite ${DESCRIPTOR_ALGORITHM_VERSION}`);
  const forms: FormAudit[] = [];
  for (const file of files) {
    const started = Date.now();
    process.stdout.write(`  ${file.filename} … `);
    const form = await auditForm(file, includeTopDecks);
    forms.push(form);
    console.log(`${form.importOk ? "ok" : "FAIL"} · ${form.levels} lvl · ${Date.now() - started}ms`);
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    settings: {
      registryDirectory: REGISTRY_DIRECTORY,
      registryDirs: REGISTRY_RELATIVE_DIRS,
      formCount: forms.length,
      descriptorAlgorithmVersion: DESCRIPTOR_ALGORITHM_VERSION,
      openVolumeAlgorithmVersion: OPEN_VOLUME_ALGORITHM_VERSION,
      includeTopDecks,
      unit: "feet",
      upAxis: "y (file) → z-up analysis",
      sampleFeet: 1,
      clearanceMinFeet: 5,
      clearanceReferenceFeet: 10,
      volumeClearCapFeet: 20,
      eyeHeightFeet: 5.5,
      minLevelAreaFt2: 16,
      note: "Official Open Volume / visibility / light exclude uncovered top decks when includeTopDecks=false. UI currently defaults the toggle to true.",
    },
    forms,
  };
  const outDir = join(process.cwd(), "reports", "five-descriptor-refinement");
  await mkdir(outDir, { recursive: true });
  const tag = includeTopDecks ? "with-top-decks" : "official-no-top-decks";
  const jsonPath = join(outDir, `deliverable-a-coverage-${tag}.json`);
  const mdPath = join(outDir, `deliverable-a-coverage-${tag}.md`);
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(mdPath, markdownReport(payload), "utf8");
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
