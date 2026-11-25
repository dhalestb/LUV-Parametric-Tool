# Lobby fixed-spacing integration — November 25, 2026

The user's developer confirmed these **X-direction distances in feet**, and the user explicitly chose to keep overlaps/gaps fixed when size and field change:

- Continuous Hall: every neighboring source interval overlaps 0.405 ft. The 0.729-ft standing-letter center spacing is specific to Study 87's letter widths. A new 9-ft preferred-size case reproduces 0.729000005-ft standing centers; the 13-ft case uses wider letters and different center distances while retaining the same overlap.
- Linear Gallery: each flat L overlaps the following upright U by 0.747 ft; that U is 1.013 ft clear of the next flat L. Other letter relationships remain as originally supplied. Existing Study 77 measures approximately 0.746733 / 1.013288 ft, which round to the supplied figures. Its original record was not rounded or rewritten.

Study 87's numeric spacing is used as a developer-supplied reference. Its full saved architectural record is not in the local five-original archive; this report does not claim whole-study geometry parity for Study 87. The original Continuous reference remains immutable Study 10.

## Changes

| File | Purpose |
|---|---|
| src/components/lobbySpacingRules.ts | Isolated versioned spacing adapter, actual matching-glyph X bounds, explicit fixed distances, field-fit rejection and source/mesh measurement. No glyph, scale, rotation, Y or Z is changed. |
| src/components/lobbyPopulation.ts | Applies the spacing adapter only to new Continuous/Linear populations after existing placement/fitting; adds the rule description to the existing rules disclosure. |
| src/components/LobbyGeneratorStudio.tsx | Carries the placement revision into new study metadata and displays measured spacing status. Existing Generate/New/Edit/Regenerate controls are retained. |
| src/app/api/lobby-generate/route.ts | Verifies automatic source spacing before generation and actual saved letter meshes afterward; records the spacing revision separately from the engine; regeneration retains the parent's policy. Explicitly edited poses remain editable, with departures reported instead of silently corrected or called compliant. |
| scripts/lobby-spacing-tests.cjs | Independent checks on generated meshes, immutable originals, containment, native validity, persistence, regeneration and rejected cases. |

The private engine assignments remain **bf7fc3c for Continuous** and **bfce854 for Linear**. Both complete 27-file engine packages are unchanged. New placement metadata is **lobby-spacing-2026-11-25**. Older studies are not retagged, repositioned, migrated or overwritten. Regenerate retains their recorded engine and poses; choosing Generate/New creates a separate updated derivative.

Fixed gaps are never squeezed to force a row into a field. Impossible overlap widths and field spans produce explicit errors. These are X-interval relationships, not a newly invented percentage-of-solid-volume limit. The previous 19.2% versus 3.42% material-volume comparison is a different metric; the developer's clarification does not supply a universal volumetric overlap cap.

## Verification

- All five existing approved originals reproduce exact architectural geometry, source poses, letter meshes and components with their original assigned engines.
- Four new designs passed: Continuous at 9-ft preferred size / 40-ft field width and 13-ft / 20-ft width; Linear at 13-ft / 40-ft width and 9-ft / 60-ft width. Each has one connected native Manifold solid, passing original strict architecture validation and actual source/architecture containment.
- Actual saved letter meshes independently measure the stated fixed gaps. Every record reopens exactly. Four updated regenerations, two legacy regenerations and two edited-source regenerations preserve the intended source/version behavior.
- Six rejection checks cover impossible overlap, crowded fixed spacing, incorrect automatic spacing, unknown revision, and legacy-policy switching. Non-X transforms and input arrays remain unchanged; unspecified V relationships retain their original signed gaps.
- Two new board PNGs were exported with the unchanged renderer, verified at 4096 × 5156 / 300 ppi, and visually checked. Linear was recaptured alone after a transient browser-canvas artifact; no renderer/layout code was changed.
- Stable-source TypeScript comparison: 54 baseline diagnostics, 54 current diagnostics, zero new diagnostics. Volatile generated Next type roots are excluded from that comparison because the live preview rewrites them; application compiler settings are not relaxed. Existing unrelated production type/lint limitations remain.
- Before/after SHA-256 checks cover 1012 pre-existing protected files. Only the three listed existing Lobby controller/adapter/API files changed. Every existing saved architectural record, final reference, private runtime package, board file, Gathering source and Workspace source in that inventory remains byte-identical.

Evidence: [tests](tests.json), [source comparison](typescript-comparison.json), [partial / immutable source checks](partial-and-immutable.json), [board verification](board-verification.json).

## Review

[Review the new designs and boards](http://127.0.0.1:3015/reports/lobby-spacing-rules-2026-11-25/index.html). Select one typology at a time, or open the corresponding interactive design.

The new developer branch tip e126c9c0504842af4c1d9e33674530f9971031bf was inspected. Its 239-file update contains broader application, Workspace, site and geometry changes. Its Continuous placement still uses the existing negative-gap path. That broader update was not merged or substituted for the verified packages. No original source worktree was edited. This spacing integration is local; no commit, push, merge or deployment was performed.

Browser verification: New Design was exercised through the original Proto-Form controls. Study `2ce853b9-f4c8-4c29-b9c7-34eb04c1dd4a` records the automatic spacing revision and exactly matches the independently verified 9-ft case. All 15 typology options and the existing Presentation & Export controls remain available. See [browser checks](browser-checks.json).
