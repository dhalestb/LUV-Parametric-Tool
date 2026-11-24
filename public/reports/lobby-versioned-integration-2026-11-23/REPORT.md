# Five Lobby generators — versioned integration review

The existing Proto-Form Generation interface now uses two private, pinned Lobby engine packages. No Gathering, Workspace, shared generator, selector registration, or Presentation Board implementation was replaced. This is an isolated local implementation for review; graphical adaptations remain proposed.

## Preview

[Open Proto-Form Generation](http://127.0.0.1:3015/amphitheater?typology=linear-gallery-lobby&lobbyStudy=50a5ce70-2b88-47ff-a205-a1d6f10e12c6). [Review one board at a time](http://127.0.0.1:3015/reports/lobby-versioned-integration-2026-11-23/index.html).

Port 3015 is a local alias of the existing integration development server on 3014, serving `<project>` on branch `architectural-space-generation`, HEAD `d40fbc7eef38ac19f5bd51fe3bb3beca89b690ec`. Ports 3001, 3013 and 3014 were left running. A second Next watcher was stopped after repeated recompilation; the alias reuses the existing `.next-presentation-rules-dev` process. Restart only the alias with `node scripts/lobby-versioned-preview.cjs` if needed. No public deployment, Git mutation, commit, push, merge or pull request was performed.

## Engine assignments and provenance

| Typology | Engine | Approved reference |
|---|---|---|
| Vertical Void Lobby | bf7fc3c | Study 26 |
| Compressed Sequential Lobby | bfce854 | Study 66 |
| Continuous Hall Lobby | bf7fc3c | Study 10 |
| Topographic Lobby | bfce854 | Study 65 |
| Linear Gallery Lobby | bfce854 | Study 77 |

- `bf7fc3c`: source commit `bf7fc3c8a9235fc3d4910b7b266821d484af93bf`; envelope SHA-256 `ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b`; private folder `vendor/lobby-bf7fc3c`.
- `bfce854`: source commit `aec2db587c5bd6a7b169cb2d6f389f7f964405ab`; envelope SHA-256 `bfce854844db696eb3c3759a36d90cfb4d3ed418432fc9aff15f08db6b5dec4d`; private folder `vendor/lobby-bfce854`.

The newer package is the exact candidate established by the successful isolated investigation: the supplied final ZIP placement/glyph/source-driver files, developer-confirmed unchanged helpers and worker dependencies, and the unmodified handoff engine. Every installed runtime file is checked against its manifest before generation. This preserves the tested package; it does not claim recovery of an unpreserved November 18 historical file. See [installed-package.json](installed-package.json) and [the prior engine handoff report](../lobby-engine-handoff-2026-11-23/REPORT.md).

## Rules and workflow

Ruleset A remains the selected package’s `lobbyProof.ts`: `populateLobby`, letter ordering, original placement, scale, tilt, rotation, outline fitting and field fitting. The optional Topographic level control calls that same package’s `applyLobbyZLevels` and retains its original validation. Ruleset B remains the private worker → `source-envelope.cjs` → `lobbyEnvelope` in `source-lobby-envelope.cjs`, with its matching `letterGeometry3d.ts`, `source-profile-envelope.cjs`, `source-vertical-envelope.cjs` and native validation. Complete dependency files and hashes are in `src/server/lobbyEngineManifest.json`.

The 15 existing selector entries are unchanged and contain exactly the five requested Lobby names. Generate Design and New Design call authentic population rules. These rules are deterministic: unchanged parameters create the same geometry under a new identity; variation is tested by changing quantity from six to seven, rather than adding an invented random-placement algorithm. Fields, preferred size, active L/U/V composition, and supported Topographic level controls remain available. Linear defaults to L/U.

Open approved reference verifies original bytes and disables modification of that reference. Generate from this configuration creates an independent derivative from its exact source/settings. Editing and Regenerate Architecture preserve every supplied pose and the saved revision; new records carry request, source-snapshot and provenance engine fields plus package/envelope hashes. Reopening a legacy `isolated-lobby-v1` result retains `bf7fc3c`, including historical Compressed/Topographic/Linear alternatives. Unknown or conflicting provenance is rejected. GET does not rewrite records.

## Exact approved-study reproduction

| Typology | Letters | Architecture triangles | Engine | Source / letters / architecture / components |
|---|---|---|---|---|
| Vertical Void Lobby | 10 | 4194 | bf7fc3c | All exact |
| Compressed Sequential Lobby | 15 | 2716 | bfce854 | All exact |
| Continuous Hall Lobby | 15 | 7754 | bf7fc3c | All exact |
| Topographic Lobby | 15 | 9018 | bfce854 | All exact |
| Linear Gallery Lobby | 15 | 7306 | bfce854 | All exact |

All five source arrays, letter mesh arrays, final architecture vertices/indices and component meshes compare exactly with the approved saved originals. Native strict validation passed on every derivative with zero strict crossings/coplanar overlaps. Original data remained unchanged. Mesh hashes, source IDs, counts and native test counts: [api-validation.json](api-validation.json).

## Two new designs per typology

| Typology | Field ft | 6-letter triangles / overlap pairs | 7-letter triangles / overlap pairs |
|---|---|---|---|
| Vertical Void Lobby | 40 × 40 × 60 | 2762 / 2 | 3252 / 1 |
| Compressed Sequential Lobby | 40 × 20 × 20 | 996 / 0 | 1056 / 0 |
| Continuous Hall Lobby | 40 × 20 × 20 | 2400 / 5 | 3196 / 5 |
| Topographic Lobby | 40 × 40 × 40 | 3632 / 0 | 4498 / 0 |
| Linear Gallery Lobby | 40 × 20 × 20 | 3036 / 3 | 3160 / 0 |

All ten candidates passed, kept the requested number and exact transmitted poses, and produced distinct geometry hashes between the six- and seven-letter cases. Preferred size was 13 ft. Each was reopened byte-for-byte and regenerated with identical architecture/source arrays using the parent’s engine revision and a fresh UUID. An additional edited-pose regeneration moved one source X by 0.05 ft; all edited poses were retained and strict validation passed. See [edited-regeneration.json](edited-regeneration.json).

Source overlaps above are exact positive-volume Manifold intersections of saved letter solids, not bounding-box guesses. Original rules allow some intersections: approved studies also contain overlaps (Linear 0, Compressed 0, Topographic 5, Vertical 4, Continuous 12 pairs). No new collision prohibition, clearance threshold or bridge was introduced. Full pair identities, volumes and actual source bounds are in [geometry-measurements.json](geometry-measurements.json).

All 15 approved/new architectures are single connected Manifold solids with `NoError`; every architectural and source-letter vertex lies within its field to the unchanged numerical tolerance. The original strict validator reported zero prohibited triangle intersections; its nonzero legacy broad-phase flags and warnings are retained. Junction checks confirm connected output, exact component/source associations and original contour operations. These tests establish geometric connectivity and mesh validity; they do not certify structural adequacy or circulation. The engines do not export a separate engineering joint certificate.

Invalid outside-field sources and saved-revision switches were rejected with HTTP 422 for each type. New-design engine overrides and unknown revisions were also rejected. Attempts to mutate approved-reference API records returned 405. No validator threshold or original engine byte was changed. See [engine-guard-tests.json](engine-guard-tests.json).

## Browser and persistence checks

Generate Design and New Design were exercised through the existing controls. Saved-study query links reopen the matching stored result; reload and switching among preserved family controllers retain the selected Lobby identity. A Lobby-only URL-state fix avoids passing stale Next.js history state when changing study identities. Existing A/B/C viewers, isometric/plan/elevation/section and Presentation & Export are reused. Browser screenshots and recorded selected-study URLs are supplied with this report.

## Presentation exports for visual review

The existing renderer, shared layout, title formatting, colors, transparency, focused source details, cropped generation illustrations, camera profiles, section settings, bullets and typography are unchanged. Every board contains one typology and the actual architecture of its associated new seven-letter study. Two orientation details and three generation details were checked against all ten new records without mutating geometry. Each detail uses a few actual sources rather than the whole form. No tracking footer was introduced.

All five PNGs are 4096 × 5156 pixels with 300 ppi metadata. The same export-sizing function also produced a verified 2048 × 2578, 300 ppi board. Native board generation was captured by a standalone local QA harness using the unchanged application renderer, because the browser download tool stalled. Individually recaptured boards were visually checked after transient browser canvas artifacts; the renderer was not modified. The application’s export button was separately exercised and reported its selected resolution.

- [Vertical Void Lobby PNG](boards/vertical-void-lobby-4096px.png) · [open the saved study](http://127.0.0.1:3015/amphitheater?typology=vertical-void-lobby&lobbyStudy=9651281f-c4a9-4adf-b8f8-239faebe3653).
- [Compressed Sequential Lobby PNG](boards/compressed-sequential-lobby-4096px.png) · [open the saved study](http://127.0.0.1:3015/amphitheater?typology=compressed-sequential-lobby&lobbyStudy=0cabc668-bb29-49c1-bae1-8e6c181aa160).
- [Continuous Hall Lobby PNG](boards/continuous-hall-lobby-4096px.png) · [open the saved study](http://127.0.0.1:3015/amphitheater?typology=continuous-hall-lobby&lobbyStudy=d61f793e-3482-4cde-9dcc-5d4257975edc).
- [Topographic Lobby PNG](boards/topographic-ground-field-lobby-4096px.png) · [open the saved study](http://127.0.0.1:3015/amphitheater?typology=topographic-ground-field-lobby&lobbyStudy=cf04bf68-069e-4ec1-b33d-19398dff5437).
- [Linear Gallery Lobby PNG](boards/linear-gallery-lobby-4096px.png) · [open the saved study](http://127.0.0.1:3015/amphitheater?typology=linear-gallery-lobby&lobbyStudy=50a5ce70-2b88-47ff-a205-a1d6f10e12c6).

These remain proposed Lobby graphics requiring visual approval. The Compressed board uses stored source/architecture geometry; the developer’s separate viewport-only `fitLobbyLettersToArchitecture` / clear-height display adjustment is not applied to saved geometry or silently baked into this export. Its raw letter/shell size relationship is therefore preserved.

## Preservation and regression

1705 archived source files match the established checkpoint. All 292 architectural records present before this task remain byte-identical (the earlier 286 plus six already existing records). All 20 approved Lobby assets are intact. The original 389 and corrective 391 source files also match their authoritative checkpoints. All 969 unchanged current baseline files, shared presentation code, Gathering controllers/runtime, Workspace implementations and source packages retain their before hashes. The original 27-file Lobby package is unchanged. [Preservation evidence](preservation.json).

Workspace isolation tests passed: all five plans/arrangements on both existing routes, wrong-type rejection, direct-intersection placement equivalence, generated-mesh equivalence, and preserved Study 201 PNG/STL/result hashes. No Workspace commits `4e8e988` or `58df1c1` were integrated. [Workspace test log](workspace-regression.log).

Fresh TypeScript comparison uses restored baseline source bytes in a compiler-host overlay: 54 baseline diagnostics, 54 current diagnostics, 0 new errors. [Diagnostic comparison](typescript-comparison.json). The sandbox build initially could not download existing Google Fonts; the network-enabled build compiled successfully, then failed on existing lint errors, including prohibited require imports in the unchanged `src/server/presentation-gallery-clearance.cjs`. Unrelated errors were not repaired or disabled. [Network build log](build-network.log), [Lobby lint log](lobby-lint.log). A clean production build remains unresolved.

## File-by-file changes

| File or addition | Purpose |
|---|---|
| src/components/LobbyGeneratorStudio.tsx | Updated existing Lobby controller: dispatch original placement packages, preserve engine on regeneration, reopen immutable configurations as separate derivatives, persist selection/URL, retain current viewers and presentation component. |
| src/app/api/lobby-generate/route.ts | Updated private Lobby endpoint: pinned engine dispatch and 27-file integrity checks, recorded parent revision, reject revision switching, preserve native warnings, append-only independent identities. |
| next.config.ts | Added tracing of the new private engine package for the existing Lobby API route. |
| src/components/lobbyEngineVersions.ts | Added exact public names, engine assignments, and verified legacy provenance resolution; unknown/conflicting provenance is rejected. |
| src/components/lobbyPopulation.ts | Added original/final placement dispatch and the original optional Topographic level helper. |
| src/server/lobbyEngineManifest.json | Added complete SHA-256 manifests for the two 27-file runtime packages. |
| vendor/lobby-bfce854/** | Added 27 byte-identical files from the successfully verified final engine package. The old private package is untouched. |
| data/lobby-generated/v1/<fresh UUID>.json | Added new alternatives from reproduction, browser and API tests. No existing file or approved original was overwritten. |
| scripts/setup-lobby-versioned.cjs | One-time preservation and exact package installation. |
| scripts/connect-lobby-versions.cjs | One-time guarded API/registry connection. |
| scripts/connect-lobby-controls.cjs | One-time guarded UI adapter connection. |
| scripts/lobby-versioned-validation.cjs | Approved parity, new arrangements, regeneration, reopen and negative API tests. |
| scripts/lobby-versioned-geometry.cjs | Source-solid overlap, actual vertex containment, connectivity, native validation and source associations. |
| scripts/lobby-versioned-typecheck.cjs | Fresh TypeScript diagnostic comparison against in-memory restored baseline files. |
| scripts/lobby-versioned-preservation.cjs | Existing source, archived checkpoint, authoritative worktree, saved record, private package and presentation-detail checks. |
| scripts/lobby-versioned-board-evidence.cjs | Standalone local QA harness on 3016, using the unchanged renderer. No application route or generator workflow added. |
| scripts/lobby-versioned-report.cjs | Produces this report and a static review page showing one selected board at a time. |
| scripts/lobby-versioned-preview.cjs | Local port 3015 alias of the existing integration server on 3014; forwards HTTP and development WebSockets without starting another Next watcher. |
| reports/lobby-versioned-integration-2026-11-23/** | Preservation manifests, all validation evidence, PNGs, screenshots, build/lint/type logs and this report. |
| public/reports/lobby-versioned-integration-2026-11-23/** | Copies of review PNGs and screenshots, one-board HTML review, and documentation. No geometry records or source ZIPs copied. |

Only the pre-existing Lobby UI, private Lobby API and package tracing configuration require application changes. Next.js may generate ignored build/type-cache metadata during checks; archived source and application records are preserved. Existing uncommitted work remains uncommitted. No shared geometric helper or Presentation Board layout was edited.

## Review boundary

The versioned integration and selected test cases are ready for local review. Graphical approval, arbitrary untested parameter combinations, structural/circulation certification and resolving the repository’s existing production lint/type failures are outside the completed validation claim. Failed future candidates remain explicit errors; no generic fallback exists.
