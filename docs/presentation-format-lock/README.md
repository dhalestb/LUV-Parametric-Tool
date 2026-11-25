# Proto-Form presentation checkpoint — 25 November 2026

Branch: `codex/proto-form-presentation-locked-2026-11-25`.
Base: `c6b1a3d7eadca367152e62c591fe9d052c4d6eca` on `codex/lobby-versioned-integration-2026-11-24`.

This checkpoint retains the fifteen existing Proto-Form selections: five Gathering, five Workspace, and five Lobby typologies. It adds the confirmed Continuous Hall and Linear Gallery placement corrections and protects the existing presentation template. It does not import another developer's entire branch, replace the Workspace implementation, merge, or deploy.

## Get the checkpoint safely

Use a separate clone if your existing checkout contains work you must preserve:

```powershell
git clone -c core.longpaths=true --single-branch --branch codex/proto-form-presentation-locked-2026-11-25 https://github.com/dhalestb/LUV-Parametric-Tool.git LUV-ProtoForm-Checkpoint
cd LUV-ProtoForm-Checkpoint
npm ci --ignore-scripts
npm run presentation:check
npm run dev -- --port 3015
```

Open `http://127.0.0.1:3015/amphitheater`. The unified selector includes Open Hall Workspace, Flat-Deep Plan Plate, Cascaded Workspace, Void-Edge Workspace, and Undulating Workspace as well as the five Gathering and five Lobby options. Do not reset or overwrite a developer's existing checkout to obtain this checkpoint.

## Formatting contract and editable rules

`src/components/presentation/formatContract.ts` preserves the existing constants: canonical 4096 × 5156 board, 300 ppi, Arial, black background, gold letters (`#D6AD4F`), white form (`#F7F6F5`), cyan rules (`#71BEDA`), fixed title and body sizes, illustration rectangles, text columns, and spacing. The existing export presets remain 4096 × 5156 and 2048 × 2578; the smaller export is a separate scaled copy. Canonical PNGs remain byte-identical when exported at 4096 pixels.

The existing Gathering rendering strategies, helpers, approved study overrides, and images remain intact. Workspace and Lobby boards still use the existing focused orientation and generation detail panels. No tracking footer is added, and each board still represents one displayed typology and study.

Developers may update rule descriptions, bullet text, selected source letters, cropped details, illustration geometry, and supported typology generation rules. Use `src/components/presentation/ruleIllustrations.ts` for the adapted board's content and the existing typology modules or new isolated versioned adapters for architectural rules. Use the existing `letters`, `form`, and `rules` color roles. Fixed camera-fitting behavior and illustration frames stay in the protected renderer; existing per-study view controls remain available.

The existing template has up to two orientation details and three generation details. Group related rules within those slots or create a separate board. Long titles, captions, unbreakable words, or overflowing rule text now raise a useful error; the renderer does not reduce fonts or move illustrations to accommodate them.

`presentation-format-lock.json` records normalized source hashes for the formatting implementation and raw-byte hashes for existing saved evidence. New study IDs, board filenames, and versioned packages can be added without rewriting the baseline. Changes to protected formatting or historical evidence fail `npm run presentation:check`. An intentional template revision requires explicit owner review, a new format revision, and an updated baseline; do not regenerate the manifest just to make an unrelated typology change pass.

## Confirmed fixed-foot Lobby corrections

New automatically arranged designs use spacing revision `lobby-spacing-2026-11-25`:

| Typology | Neighboring source-mesh X-bound relationship |
| --- | --- |
| Continuous Hall Lobby | 0.405 ft overlap at every neighboring pair |
| Linear Gallery Lobby | Flat L → upright U: 0.747 ft overlap; upright U → next flat L: 1.013 ft clearance |

Distances remain fixed in feet when letter size or field changes. Continuous Hall's 0.729-ft standing-letter center spacing is specific to the 9-ft reference widths. Unspecified Linear V relationships retain their previous rules. Crowded fields and impossible overlap requests are rejected instead of compressing the distances. These X-bound relationships do not define a volumetric overlap percentage limit.

The architecture engines are unchanged: Vertical Void and Continuous Hall use `bf7fc3c`; Compressed Sequential, Topographic, and Linear Gallery use `bfce854`. Existing saved studies retain their original poses, engines, and spacing provenance. Regeneration uses each study's pinned engine; it does not silently apply new placement rules to old studies. Edited-source studies report their actual spacing status rather than claiming automatic-spacing compliance.

## Validation

```powershell
npm run presentation:check
node scripts/lobby-integration-smoke.cjs --replay
node scripts/lobby-spacing-checkpoint-tests.cjs --replay
```

The presentation checks cover fixed dimensions, font metrics, colors, frames, export presets, density, editable rule content, overflow rejection, and simulated template tampering across 22 saved rule fixtures. The native engine checks reproduce all five approved studies and five earlier new designs exactly. Four further corrected-spacing configurations reproduce their saved letters, architecture, and components exactly and preserve their engine and spacing revisions. The checkpoint includes 71 saved Lobby derivatives, the original approved records, and the earlier Presentation Board PNGs without rewriting them.

Evidence is in `reports/presentation-format-lock-2026-11-25/` and `reports/lobby-spacing-rules-2026-11-25/`. The two new-spacing board examples are under `public/reports/lobby-spacing-rules-2026-11-25/`. They were captured before this formatting guard was added; they are preserved examples, not a claim of a new browser capture during this checkpoint task. Gathering rendering-operation equivalence passed; fresh browser visual inspection was unavailable after Computer Use stopped because it could not establish the native browser URL reliably.

The existing project has 54 TypeScript diagnostics; comparison found the same 54 and no new diagnostics. This checkpoint is not a claim that those pre-existing diagnostics or an application-wide production build have been resolved.

## GitHub enforcement

The `Proto-Form presentation` workflow runs the `Presentation format lock` check on this branch and pull requests. `.github/CODEOWNERS` identifies the repository owner for the template and enforcement files; its existing repository-wide owner entry is retained.

**GitHub required-check and required-owner-review enforcement has not been enabled by this checkpoint.** The connector could not write repository rules, and Computer Use stopped before the signed-in settings page could be controlled. CODEOWNERS and a workflow alone cannot prevent a collaborator from bypassing review or editing the baseline.

To enforce this at GitHub, the repository owner should add a separate active branch ruleset targeting only `refs/heads/codex/proto-form-presentation-locked-2026-11-25`, require pull requests and code-owner approval, require the `Presentation format lock` status check, and block force pushes and branch deletion. Leave the existing main-branch ruleset unchanged. Developers should submit typology and rule changes against this checkpoint branch so that its template, baseline, and workflow apply.
