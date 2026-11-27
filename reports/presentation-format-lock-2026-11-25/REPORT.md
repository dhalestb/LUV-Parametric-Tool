# Presentation format lock and Lobby spacing checkpoint

The new checkpoint extends `c6b1a3d7eadca367152e62c591fe9d052c4d6eca` without merging another development branch. All fifteen existing Proto-Form options remain registered. Existing Gathering and Workspace source implementations, both verified Lobby engine packages, saved studies, architecture meshes, and historical board PNGs are preserved.

## Changes

| File | Purpose |
| --- | --- |
| `src/components/presentation/formatContract.ts` | Existing dimensions, DPI, font, palette, frames, margins, rendering constants and approved export presets, frozen in one module; canonical PNG size/density checks. |
| `src/components/presentation/formatGuards.ts` | Reject overflowing text or unsupported detail counts and color roles without reducing fonts or moving illustrations. |
| `src/components/presentation/rules.ts` | Import the unchanged formatting constants; preserve the existing Gathering strategies and typology display profiles. |
| `src/components/presentation/adaptedPresentation.ts` | Retain existing detail layout and wrapping; validate rule content, titles, captions and body text against fixed frames. |
| `src/components/presentationExportSizing.ts` | Enforce the existing 2048/4096 export presets; keep canonical PNG bytes and scale a separate smaller export. |
| `src/components/AmphitheaterPresentation.tsx` | Explain the format lock outside the exported board. Existing presentation controls remain available. |
| `presentation-format-lock.json` | Hash baseline for 31 format/enforcement files and 413 existing evidence files. Newly created studies, boards and versioned packages remain possible. |
| `scripts/presentation-format-lock.cjs`, `scripts/presentation-format-tests.cjs` | Portable integrity, contract, editable-rule and negative checks. |
| `.github/workflows/presentation-format-lock.yml`, `.github/CODEOWNERS`, `package.json` | CI workflow, preserved owner entry plus explicit template ownership, and `npm run presentation:check`. |
| `src/components/lobbySpacingRules.ts`, `lobbyPopulation.ts`, `LobbyGeneratorStudio.tsx`, `src/app/api/lobby-generate/route.ts` | Previously completed fixed-foot Continuous/Linear spacing corrections, revision metadata, validation and historical-study behavior. |
| `scripts/lobby-spacing-checkpoint-tests.cjs` | Four corrected-spacing reference configurations, native exact replay option, and legacy provenance check. |
| `docs/presentation-format-lock/README.md` | Developer pull instructions, editable rule boundaries, validation commands and GitHub enforcement handoff. |

## Spacing included

Continuous Hall uses 0.405 ft neighboring source-mesh X-bound overlap. Linear Gallery uses 0.747 ft flat-L-to-upright-U overlap and 1.013 ft upright-U-to-next-flat-L clearance. Distances stay fixed in feet. Other Linear relationships remain unchanged. Unsupported crowded fields fail instead of shrinking these distances.

Spacing revision: `lobby-spacing-2026-11-25`. Existing records retain their old poses and spacing provenance. Engine assignments remain `bf7fc3c` for Vertical Void/Continuous Hall and `bfce854` for Compressed/Topographic/Linear. No volumetric overlap threshold is invented.

## Verification

- Presentation contract checks passed for 22 immutable saved rule fixtures, fixed fonts, color roles, frames, export presets and 300 ppi; permitted rule edits, overflow failures and simulated protected-source tampering were exercised.
- All five approved Lobby studies and five earlier new arrangements replayed exactly through their pinned native engines.
- All four corrected-spacing configurations replayed exactly, including architecture, letters and components. Actual mesh bounds match the confirmed fixed-foot distances; engine and spacing revisions remain pinned.
- The published collection contains 71 saved Lobby derivatives. Previous approved assets, verified packages and historical board PNGs are byte-identical to the preceding checkpoint.
- Gathering rendering-operation equivalence, special helpers, colors and default PNG density passed. No new visual layout is introduced.
- TypeScript comparison reports 54 baseline diagnostics, 54 current diagnostics, and no new diagnostics. Existing project-wide errors are not resolved by this task.

`validation.json`, `preservation.json`, and `gathering-render-equivalence.json` contain the compact results. Detailed generation, persistence, negative and earlier browser/board evidence remains in `reports/lobby-spacing-rules-2026-11-25/`. Its two board examples are preserved earlier captures; this task did not rewrite them or claim a fresh GPU pixel comparison.

## Review enforcement limitation

Runtime formatting guards, the hash baseline, CI workflow and owner entries are included. GitHub required-code-owner approval and required status checks have **not** been configured: the connector could not edit rulesets, and Computer Use stopped because it could not establish the native browser URL reliably. No repository protection settings were changed. The developer handoff gives the exact branch-scoped settings for the owner to enable; CODEOWNERS alone is not an enforced review gate.

No original-source worktree was staged or committed, no application branches were merged, no existing saved studies or boards were rewritten, and no application deployment was requested.
