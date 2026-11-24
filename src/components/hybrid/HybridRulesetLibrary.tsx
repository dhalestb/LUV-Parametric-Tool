import { useState } from "react";
import { describeRule, fewMatches, noSharedCriteria, rulesetText, hybridFilename, hybridObj, hybridZip } from "./hybridExports";
import type { HybridRuleset } from "./analyzeHybrid";
import type { StoredForm } from "./hybrid.worker";

const control = "rounded border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-sm";

export function RulesetDetails({ ruleset }: { ruleset: HybridRuleset }) {
  if (ruleset.contributors.length < 2) return <p className="text-xs text-[var(--muted)]">{fewMatches}</p>;
  return <>
    <p className="text-xs text-[var(--muted)]">
      Shared criteria use the strictest compatible targets. Other criteria describe what each contributing typology adds.
    </p>
    {!ruleset.rules.some(rule => rule.sources.length > 1) &&
      <p className="text-xs text-[var(--muted)]">{noSharedCriteria}</p>}
    {ruleset.rules.map(rule => {
      const { status, details } = describeRule(rule);
      return <details key={rule.label} className="border-b border-[var(--line)] py-2 text-sm">
        <summary className="cursor-pointer">{rule.label} · {status}</summary>
        <p className="pl-4 text-xs">{details}</p>
        <p className="pl-4 text-xs text-[var(--muted)]">{rule.sources.length > 1 ? "Shared by " : "From "}{rule.sources.join(", ")}</p>
      </details>;
    })}
  </>;
}


function RulesetExports({ label, form }: { label: string; form: StoredForm }) {
  const [error, setError] = useState("");
  function download(format: "txt" | "obj" | "zip") {
    setError("");
    try {
      const content = format === "txt" ? rulesetText(label, form)
        : format === "obj" ? hybridObj(label, form) : hybridZip(label, form).slice().buffer;
      const mime = format === "zip" ? "application/zip" : "text/plain;charset=utf-8";
      const url = URL.createObjectURL(new Blob([content], { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = hybridFilename(label) + (format === "txt" ? "-ruleset" : "") + "." + format;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export this hybrid.");
    }
  }
  return <>
    <div className="flex flex-wrap gap-2" aria-label="Ruleset exports">
      <button type="button" className={control} onClick={() => download("txt")}>Download Ruleset (.txt)</button>
      <button type="button" className={control} onClick={() => download("obj")}>Export OBJ</button>
      <button type="button" className={control} onClick={() => download("zip")}>Export ZIP</button>
    </div>
    {error && <p role="alert" className="text-sm">{error}</p>}
  </>;
}

export default function HybridRulesetLibrary({ label, form, ready }: {
  label: string;
  form?: StoredForm;
  ready: boolean;
}) {
  return <section id="hybrid-rulesets" aria-labelledby="hybrid-rulesets-heading"
    className="scroll-mt-4 space-y-3 rounded border border-[var(--line)] bg-[var(--panel-soft)] p-4">
    <h2 id="hybrid-rulesets-heading" className="text-lg font-semibold">Hybrid Ruleset — {label}</h2>
    {!ready ? <p className="text-sm text-[var(--muted)]">Loading saved ruleset…</p>
      : !form ? <p className="text-sm text-[var(--muted)]">Choose an OBJ for {label} to get started.</p>
      : <>
        <p className="break-all text-sm">{form.mesh.filename}</p>
        {!form.ruleset ? <p className="text-sm text-[var(--muted)]">Select Analyze Form to generate this hybrid’s ruleset.</p>
          : <>
            <RulesetExports key={label + form.mesh.id} label={label} form={form} />
            <p className="text-xs text-[var(--muted)]">ZIP includes the OBJ, text ruleset, and JSON ruleset. OBJ includes the form geometry with the ruleset in its comments.</p>
            <RulesetDetails key={label + form.mesh.id} ruleset={form.ruleset} />
          </>}
      </>}
  </section>;
}
