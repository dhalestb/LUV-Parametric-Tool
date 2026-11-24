# Void Field Gathering — nine-letter review

Implementation remains uncommitted on experiment/gathering-envelope at protected HEAD eb094d2213405393ae9954aa8399d479ef643b5d. No push, merge, deployment, or twelve-letter expansion.

## Preservation

Before editing, all 14 modified/untracked presentation files were copied and SHA256 verified at ../LUV-Gathering-Backups/pre-void-field-2026-11-12T05-50-47-028Z. Original standalone f5eb105698143f2d255adcc8290b4fcc667450b8 and production 12197f777bc99950cf06999d56b089b5a02f4961 remain unchanged. Existing study storage is retained.

## Review links

- Baseline nine-letter result: http://127.0.0.1:4201/amphitheater?study=e413270b-bfae-4b29-af02-86090cd1537f
- Edited U-3 result: http://127.0.0.1:4201/amphitheater?study=b325cae8-3e54-4150-8a2a-541ebd8e8a37
- Separate seed-37 alternative: http://127.0.0.1:4201/amphitheater?study=b1718fcc-9cd2-473c-8854-37a13d161b97

Start in this worktree with npm.cmd run dev -- --hostname 127.0.0.1 --port 4201. Study snapshots persist locally in .amphitheater-runs, outside Git. Hosted Vercel Blob behavior was preserved but not deployed or retested remotely.

## Reconciled geometry contract

X/Y are plan coordinates in feet; Z is up. Source request coordinates are field-centered. Exactly one +field.height/2 translation produces floor-based geometry. Source transforms are never regenerated or normalized by Regenerate Architecture.

Default nine-letter population is spatially sampled, then classified using convex-hull position/clearance. Three interior sources use horizontal XY faces and Z yaw 75/90/105 degrees. Six surrounding sources form platforms/enclosure, grouped by source elevations. Edited poses remain exact, including the tested 95-degree yaw exception.

L missing quadrants close at real arm-tip extents. U/V channels close with an explicit inner-mouth chord. Original curves, added closure edges, matrices, cutters, removed mesh, affected floor IDs, and hierarchy are recorded. The nominal glyph contour is transformed with the full source matrix and adaptively tessellated to 0.01-ft chord error. Original source meshes are unchanged. No voxel or elevation-snap pipeline is used.

Positive floor domains combine actual letter-mesh plan footprints and narrow adjacency strips. Occupied levels follow measured source-lift elevations. Perimeter walls use vertical supporting-boundary construction with actual source-surface roofs and edited support Z. Void rims are developed from source profiles, then protected volumes are subtracted after positive unions.

The initial taper is homothetic. A measured neighboring profile area relationship sets a bounded scale change, with scale 1 at the source elevation. Straight mode has identical upper/lower areas. Explicit two-axis scale vectors are required by the installed loft binding; scalar scale inputs collapsed a top dimension during development. The final tests independently measure both end sections to guard this failure.

Subtraction includes an explicit 0.001-ft geometric clearance at cutter interfaces, approximately 0.3 mm. Float32 seam cleanup retains the existing 0.00001-ft simplification. Existing exported-mesh intersection and topology thresholds are unchanged.

Nearest-adjacent voids connect only between floor slabs. Already-open connections are recorded and not counted as new cuts. Every exported cutter must remove material and remain unobstructed. Geometric connectivity is distinguished from usable circulation.

## Actual geometry results

| Field height ft | Seed | Mode | Triangles | Material ft³ | Worker + validation seconds | Form height ft |
|---|---|---|---|---|---|---|
| 20 | 19 | neighbor-taper | 10726 | 4048.68 | 5.42 | 19.98 |
| 40 | 19 | neighbor-taper | 10718 | 4258.74 | 5.27 | 22.60 |
| 60 | 19 | neighbor-taper | 10716 | 4258.74 | 5.31 | 22.60 |
| 60 | 19 | straight | 10674 | 4258.73 | 5.30 | 22.60 |
| 60 | 37 | neighbor-taper | 8600 | 3850.55 | 4.96 | 22.33 |

All accepted cases have one connected solid, zero precise self-intersection/positive-area coplanar failures, no out-of-field geometry, three real floor openings, and visible attributed surfaces for all nine sources. validation.json retains pair counts, volumes, timing, and source influence. Source areas are attributed, not an exclusive partition between different letters.

Seed 21 is deliberately rejected for a closed cavity of approximately 0.108 ft³. The test enforces rejection. It is not silently filled, deleted, or published as successful. Arbitrary seeds/edits can still be rejected.

## Source influence in the review study

| Source | Role | X tilt / Z yaw degrees | Floor-based center Z ft | Operation |
|---|---|---|---|---|
| L-1 | perimeter | 3.76 / -30 | 3.6400000000000006 | Outer contour wall + local platform |
| U-2 | perimeter | 2.41 / 0 | 3.6400000000000006 | Outer contour wall + local platform |
| U-3 | interior | 0.00 / 90 | 12.350000000000001 | secondary Z canyon, 300.29 ft³ removed |
| V-4 | perimeter | -2.11 / 0 | 11.18 | Outer contour wall + local platform |
| V-5 | interior | 0.00 / 105 | 12.350000000000001 | secondary Z canyon, 345.95 ft³ removed |
| L-6 | terrace | -4.75 / -15 | 11.18 | Local source-shaped platform |
| U-7 | perimeter | -7.89 / 15 | 18.72 | Outer contour wall + local platform |
| L-8 | interior | 0.00 / 75 | 12.350000000000001 | primary Z canyon, 1539.17 ft³ removed |
| V-9 | perimeter | -4.68 / 15 | 18.72 | Outer contour wall + local platform |

The displayed 40 × 40 × 60-ft field and 13-ft preferred size remain unchanged. This source arrangement produces a roughly 22.6-ft form. The generator does not force the form to fill the 60-ft field.

## Interactive evidence

Generate Design created source letters and architecture in one click and saved the result. A/B/C, isometric, plan, and clipped section views were inspected. U-3 was moved +0.4 ft X and rotated from Z=90 to Z=95 degrees. Only those two source values changed. Material volume changed from 4258.7403 to 4260.9477 ft³. Saved edited study reopened after a browser refresh. New Design with seed 37 created a separate source composition/result while retaining both earlier studies.

nine-letter-board.png is the actual 4096 × 4608 application export with 300 ppi metadata. It shows original letters, architecture, angles, and L/U source-to-cutter-to-opening details. V-5-void-detail.png supplies the third interior source. Screenshots document the running application and actual sectional view.

## Checks

Passed: scripts/void-field-tests.cjs, scripts/three-lift-tests.cjs, scripts/upright-opening-tests.cjs, scripts/recessed-study-tests.cjs, scripts/vertical-envelope-constraints-tests.cjs, scripts/amphitheater-presentation-export-tests.cjs, TypeScript --noEmit, targeted ESLint, production build. The build reports existing unrelated hook/unused-variable warnings. Test-generated timing changes to the old upright report were restored after copying the new run here.

## Review limits and recommended next steps

Stop at nine letters for visual review. Initial implementation supports straight/homothetic taper only; lateral section shifts, asymmetric taper, profile splits/merges, extra interstitial pockets and a full future void-field system are deferred. Three source voids can overlap into fewer connected air regions, so source count is not a claim of three disjoint openings. No structural, occupancy, access, circulation, or final local minimum-thickness certification is claimed. Wall-rim thickness values describe nominal construction before unions/cuts.

UI controls expose typology, field dimensions, preferred size, nine-letter quantity, profile mode, taper strength, adjacency mode, source roles and exact source edits. Extent and floor levels are source-derived defaults; advanced request values can configure extents and primary source but are not yet full UI controls. Remaining typologies are untouched. Wider/deeper-field sampling and arbitrary edited poses are not exhaustively validated. No Vercel operation is claimed.

## Local source changes

New: scripts/source-void-field.cjs, scripts/void-field-tests.cjs, src/components/voidFieldPopulation.ts, reports/void-field.

Updated: scripts/source-envelope.cjs, scripts/amphitheater-interactive-worker.cjs, src/app/api/amphitheater/route.ts, src/components/AmphitheaterStudio.tsx, src/components/SourcePopulationEditor.tsx, src/components/amphitheaterInteractiveTypes.ts. Existing uncommitted presentation files are retained; amphitheaterPresentationRender.ts, amphitheaterPresentationExport.ts and AmphitheaterPresentation.tsx now distinguish Void Field geometry/rules. No Composition or Presentation Board route was changed.

Post-implementation source/study backup verified at C:\Users\DHale\Documents\Codex\LUV-Gathering-Backups\void-field-nine-letter-2026-11-12T06-16-48-644Z. This backup precedes this final report appendix.
