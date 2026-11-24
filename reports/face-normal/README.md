# Face-Normal Façade experiment — 2026-11-12

Implemented only in LUV-Gathering-Envelope-Experiment, experiment/gathering-envelope. HEAD remains eb094d2213405393ae9954aa8399d479ef643b5d. No commit, push, merge, or deployment.

## Application

After: http://127.0.0.1:4201/amphitheater?study=2e69a8d4-aeae-49f0-b9bb-5cee619e5dfa
Before: http://127.0.0.1:4201/amphitheater?study=870aec85-3bf6-44d4-97ef-5404293e55cf

Advanced Settings > Exterior façade sweep selects vertical baseline or Face-Normal Façade. Regenerate Architecture preserves the exact existing source transforms and saves a separate study. Actual browser regeneration succeeded and refresh reopened the new result. A/B/C and section views inspected. Local server port 4201.

## Geometry

The new façade follows the transformed source face normal (inverse-transpose local +Z). Its downward sweep is toward the horizontal support elevation; it is not a warp of the old architectural mesh. Sources are converted to native sweep coordinates before construction, roof prisms are built there, then mapped back and Boolean trimmed to the actual field. Source caps, floor planes and protected cutters are retained. Plan strips use the exterior supporting boundaries of the source in sweep coordinates. Nominal .85-ft strip radius and 32-segment circular joins are unchanged. Inclined wall thickness perpendicular to its surface is not certified.

A horizontal face normal uses the existing global-Z construction exactly. A normal parallel to the horizontal support is rejected explicitly. No source is rotated automatically. Existing legacy vertical mode is still the default. This is specific to Void Field, not a replacement for Stepped Amphitheater vertical walls.

The saved API outputs were independently compared: all nine source poses and source meshes are byte-for-byte equal in their JSON structures, and all floor records match. Preferred size remains 13 ft; field remains 40 × 40 × 60 ft. At 15-ft spacing, floor tops remain 2.64, 17.64, and 32.64 ft.

## Matched native-generation tests

| Spacing | Before volume ft³ | After volume ft³ | Triangles before / after | Before / after ms |
|---|---:|---:|---:|---:|
| 12 | 4674.921 | 4648.644 | 13722 / 13406 | 5793 / 6016 |
| 15 | 5214.919 | 5145.373 | 13722 / 13386 | 5788 / 5878 |

Both cases: single connected exported solid, positive volume, zero precise self-intersections, zero out-of-field volume, protected voids unobstructed, original positive wall/floor contacts preserved, identical occupied-floor solids, each source with at least 1 ft² exposed contribution. Source-cap probes lie on original source triangles. Actual mesh sections translate along independently derived normals. 168 independently checked exported-triangle visibility rays per case remain clear; four portals per floor, nine cross-level paths, three sky paths. Horizontal-control solid symmetric difference is exactly zero. Parallel-support rejection tested. Existing validation thresholds unchanged; new section-area comparison accounts for Float32 coordinate uncertainty.

At 15 ft, maximum pre-trim lateral travel: L-1 .94 ft; U-2 .52 ft; L-5 2.50 ft; U-6 3.60 ft; V-9 6.05 ft. Actual field cropping removes 5.15 ft³ from L-5 and 116.21 ft³ from V-9. Field-cut faces and void boundaries may be vertical; they are distinct from the native façade sweep. The form is not stretched to fill the 60-ft field.

Eight existing suites passed: void-field, level-spacing, three-lift, upright-opening, recessed-study, vertical-envelope constraints, presentation/export, and open-atrium. TypeScript and targeted lint passed. Production build passed with pre-existing warnings in unrelated files. See regressions.json and validation.json. Legacy coarse flags are retained in validation reports, not hidden; strict exported-solid and triangle-pair tests pass.

## Evidence

section-comparison.png and SVG are exact Manifold slices of the generated before/after meshes through U-6, not illustrative replacements. Gold intersects the unchanged source mesh; blue is the actual final U-6 façade section. Section provenance records its matrix. Application screenshots show the saved result, original letters overlay, and section.

## Files for this change

- scripts/source-face-normal-facade.cjs — native sweep construction and provenance.
- scripts/source-void-field.cjs — explicit mode, protected cuts, final façade mesh/contact reports.
- scripts/face-normal-tests.cjs — matched native geometry comparisons and controls.
- scripts/face-normal-section.cjs — exact before/after section.
- src/components/amphitheaterInteractiveTypes.ts — mode and geometric report types.
- src/components/AmphitheaterStudio.tsx — control, regeneration parameter, measured details and captions.
- src/app/api/amphitheater/route.ts — mode validation and actionable invalid-normal error.
- reports/face-normal/* — results and evidence.

The worktree already contained extensive uncommitted presentation, population, void-field and open-atrium work; it was backed up before editing and remains uncommitted. No unrelated worktree was edited.

## Preservation and limits

Pre-edit hash-verified backup: C:/Users/DHale/Documents/Codex/LUV-Gathering-Backups/pre-face-normal-2026-11-12T14-57-24-550Z. A final hash-verified backup accompanies this report and includes both saved studies, source files and evidence. Return to the prior implementation by opening that preserved copy or creating another isolated worktree from the protected checkpoint and restoring the backup files; do not reset the current experiment.

Nine-letter review only; general populations and arbitrary edited poses may reject. Existing study metadata says quantity 10 while the preserved actual composition has nine letters; this task intentionally preserves the exact nine rather than silently repopulating. Geometric visibility does not certify daylight, structure, guarding, accessibility or usable circulation. No resolution inflation, voxel reconstruction, post-generation stretch, or validation relaxation was used. The initial roof-patch construction was rejected for fragments; native sweep coordinates corrected it (initial-rejection.txt retained).
