# Four-level Void Field — preserved-source result

Isolated experiment: experiment/gathering-envelope. HEAD/checkpoint remains 9c01558f11ff8ea7824f640f108fb588d9198b6a. Pre-four-level source work is preserved in the prior hash-verified void-field-population backup. This task makes no commit, push, merge or deployment.

## Actual application result

After: http://127.0.0.1:4201/amphitheater?study=44abffe5-966f-4e12-8a0e-c8970f0d5dba
Before, retained unchanged: http://127.0.0.1:4201/amphitheater?study=42536cbc-756c-4082-a9bd-0806a3dd6847

The actual UI Add fourth level action was tested. It kept all twelve original letter identities, scales, positions, rotations and letter meshes exactly, then appended L-13, U-14 and V-15. These three retain the upper source group's plan locations, sizes and orientations at +15 ft Z. It generated native architecture and saved a separate study with open atrium, four levels and fifteen letters. The saved API architecture matches the independently validated worker mesh exactly. The existing field remains 40 × 40 × 60 ft; preferred letters remain 13 ft.

Four floor tops: 2.64, 17.64, 32.64 and 47.64 ft. Actual architectural height increases from 37.6927 to 52.6927 ft. The 60-ft field remains a limit, not a target for stretching. Volume: 9131.1185 ft³; exported architecture: 17,714 triangles.

## Geometry and sightlines

One connected exported material solid, positive volume, no material outside the selected field, zero precise self-intersections across 831,312 tested nonadjacent pairs, unobstructed protected voids and visible contributions from all fifteen sources. The original coarse flags remain recorded (520) rather than hidden; the precise geometric checks pass. Independent analysis also finds actual horizontal top-face area on each of the four floor planes; areas are recorded in checks.json.

Three source-derived atrium openings per floor; three validated sightlines for each of the six floor pairs (18 cross-level paths), plus three sky paths. All 231 offset rays were independently checked against actual exported triangles, in addition to the existing exported-solid ray/foot-witness checks.

The first four-level attempt already opened all four floors but its previous gallery sampling found no lowest-to-highest path. For four-level studies only, the validator additionally samples .35, .50 and .75-ft source-boundary setbacks, alongside the previous 1.05–1.75-ft positions. These are additional candidate viewpoints, not a relaxation of ray clearance or material support. All seven .025-ft ray offsets, .12-ft material witnesses, 4-ft eye height, minimum two portals per floor, minimum two views per floor pair, and protected-void/topology thresholds remain unchanged. The original three-level probe set and rejected U-primary regression remain unchanged. The resulting nearer-edge paths are actual clear rays, independently confirmed in triangles; they are not a circulation or guarding design.

## Controls

Occupied levels (3 or 4) and Atrium boundary are now in the primary controls. Four-level new designs require fifteen letters; Automatic selects fifteen for four levels and nine for three. Existing three-level studies load unchanged. Add fourth level at 15 ft retains an existing twelve-letter, three-level composition already at 15-ft spacing and adds exactly three sources; it never silently relocates the original letters. Other spacing/source counts are explicitly rejected by that additive operation. Regenerate Architecture continues to use exactly the current poses.

Level indices extend the legacy lower/middle/top tags without rewriting original source records. Original twelve sources use their unchanged legacy tags; only the three appended sources receive levelIndex 3. New four-level compositions have explicit indices. A source index/configuration mismatch is rejected by the API. The settings comparison now ignores object-key order so an equivalent saved configuration does not incorrectly show the yellow controls-differ warning.

## Regression and reproduction

All twelve suites pass, including the eleven prior suites and the new four-level tests. TypeScript, targeted lint and production build pass; existing unrelated build warnings remain. A fresh seeded four-level composition (seed 37) also passes with 17,496 triangles. A 40-ft field is explicitly rejected for this four-level, 15-ft-spacing, 13-ft-letter configuration. No size or spacing is silently reduced.

Run node scripts/four-level-void-tests.cjs, then node scripts/four-level-void-sections.cjs. The tests use portable original and new request fixtures, not local study files. Sections are exact Manifold cuts through a tested lowest-to-highest path, in an identical coordinate frame before and after. The dashed line on the before image is the after-path for positional comparison, not a claimed before-view. application-C.png and application-section.png show actual application results.

## Files

Updated: src/components/amphitheaterInteractiveTypes.ts; src/components/voidFieldPopulation.ts; scripts/source-void-field.cjs; scripts/source-atrium-openings.cjs; src/components/AmphitheaterStudio.tsx; src/components/SourcePopulationEditor.tsx; src/app/api/amphitheater/route.ts; scripts/envelope-regression-tests.cjs; docs/ENVELOPE_EXPERIMENT.md; proof/fixtures/envelope-studies.json.

New: scripts/four-level-void-tests.cjs; scripts/four-level-void-sections.cjs; proof/fixtures/four-level-original-12.json; proof/fixtures/four-level-void.json; reports/four-level-void/*.

## Limits

Four-level pilot supports fifteen letters and three interior source voids. Arbitrary arrangements/edits may fail valid geometry or visibility requirements and remain rejected. Sampled sightlines and material continuity do not certify usable circulation, headroom throughout the floor, structure, guarding, accessibility or daylight performance. The top level is not stretched to 60 ft. Existing Stepped Amphitheater, Inserted Plate and other worktrees are unchanged.
