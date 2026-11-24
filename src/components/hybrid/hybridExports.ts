import { strToU8, zipSync } from "three/addons/libs/fflate.module.js";
import type { HybridRule } from "./analyzeHybrid";
import type { StoredForm } from "./hybrid.worker";

export const fewMatches = "Fewer than two typologies matched. There are no shared criteria.";
export const noSharedCriteria = "These matches have no identical measured criteria. Their complementary rules are listed below.";

export function describeRule({ min, max, value }: HybridRule) {
  const conflict = max !== undefined && min > max;
  const target = max === undefined ? "at least " + min : min === max ? String(min) : min + "–" + max;
  const measured = Number(value.toFixed(2));
  if (conflict) {
    return { status: "Conflicting targets", details: "The contributing targets have no common range · Measured: " + measured };
  }
  const meets = value >= min && (max === undefined || value <= max);
  return { status: meets ? "Met" : "Outside target", details: "Target: " + target + " · Measured: " + measured };
}

export function rulesetText(label: string, form: StoredForm) {
  const { mesh, ruleset, fits, unit, up } = form;
  if (!ruleset) throw new Error("Analyze this hybrid to generate a ruleset.");
  const lines = [
    label + " — Hybrid Ruleset",
    "Form: " + mesh.filename,
    "Model units: " + unit + " · Up axis: " + up.toUpperCase(),
    "",
    "Typology mix",
    ...(fits ?? []).map(fit => "- " + fit.name + ": " + fit.percent + "%"),
    "",
    "Rules",
  ];
  if (ruleset.contributors.length < 2) lines.push(fewMatches, "");
  else if (!ruleset.rules.some(rule => rule.sources.length > 1)) lines.push(noSharedCriteria, "");
  for (const rule of ruleset.rules) {
    const { status, details } = describeRule(rule);
    lines.push(rule.label + " — " + status, details, (rule.sources.length > 1 ? "Shared by: " : "From: ") + rule.sources.join(", "), "");
  }
  return lines.join("\r\n") + "\r\n";
}

export function hybridFilename(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
}

export function hybridObj(label: string, form: StoredForm) {
  const { mesh } = form;
  // Keep imported coordinates, polygon faces, winding and normals in their original units.
  const lines = [
    "# Units: " + form.unit + "; " + form.up.toUpperCase() + "-up",
    ...rulesetText(label, form).split(/\r?\n/).map(line => "# " + line),
    "o " + hybridFilename(label),
  ];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lines.push("v " + Array.from(mesh.positions.subarray(i, i + 3)).join(" "));
  }
  for (let i = 0; i < mesh.normals.length; i += 3) {
    lines.push("vn " + Array.from(mesh.normals.subarray(i, i + 3)).join(" "));
  }
  const groups = new Map(mesh.groups.map(group => [group.faceStart, group.name]));
  mesh.faces.forEach((face, index) => {
    const group = groups.get(index);
    if (group) lines.push("g " + group.replace(/[\r\n]/g, " "));
    lines.push("f " + face.vertices.map((vertex, corner) => {
      const normal = face.normals?.[corner];
      return normal !== undefined && normal >= 0 && normal < mesh.normals.length / 3
        ? (vertex + 1) + "//" + (normal + 1) : String(vertex + 1);
    }).join(" "));
  });
  return lines.join("\n") + "\n";
}

export function hybridZip(label: string, form: StoredForm) {
  const filename = hybridFilename(label);
  return zipSync({
    [filename + ".obj"]: strToU8(hybridObj(label, form)),
    [filename + "-ruleset.txt"]: strToU8(rulesetText(label, form)),
    [filename + "-ruleset.json"]: strToU8(JSON.stringify({
      hybrid: label,
      source: form.mesh.filename,
      units: form.unit,
      upAxis: form.up,
      typologyMix: form.fits,
      ruleset: form.ruleset,
    }, null, 2)),
  });
}
