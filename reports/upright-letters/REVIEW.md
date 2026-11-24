# Upright source-letter voids

Review the saved application study at http://127.0.0.1:4199/amphitheater?study=446f03d9-c5a7-4649-a25a-eec40e6ca584.

The experiment is on experiment/gathering-envelope in LUV-Gathering-Envelope-Experiment. Its HEAD and backup/gathering-pre-envelope-2026-11-11 remain f5eb105698143f2d255adcc8290b4fcc667450b8. The protected original worktree was clean at final verification. Changes remain uncommitted.

## Geometry

New interior letters stand at X tilt 90 degrees, with global Z plan turns selected from 0, 75, 90 and 105 degrees. ZYX rotation order applies the X tilt before the plan turn. Existing records retain their prior XYZ convention unless explicitly edited.

The opening profile uses the original L inner corner, U channel, or V notch in the placed source plane. Its coordinates use the full source matrix, including scale and elevation. The profile is closed at its mouth and swept along the horizontal source-plane normal. It retains its actual upright dimensions. There is no vertical inversion or separate height reduction.

Alcoves use finite cutters located at the envelope boundary. A source-related bay supplies backing and overhead material. Through openings cross the selection field. Source-shaped terrace setbacks, vertical exterior walls and horizontal floor plates continue to develop from the source relationships.

Each opening records its source contour, matrix, normal, clipped cutter, removed mesh and removed volume. letter-influence-24.png and its SVG show each upright interior source, the cutter and the final plan section at the same coordinates. Each row uses a different stated section elevation.

The population algorithm assigns distinct interior elevations for new compositions. Regeneration uses the submitted placements. Stand upright and plan-turn controls are available for individual interior letters in Edit Letters.

## Checks

Three representative studies passed the unchanged solid, connectivity, containment and triangle intersection thresholds.

| Seed | Letters | Triangles | Volume ft³ |
| --- | --- | --- | --- |
| 19 | 8 | 4690 | 12459.94 |
| 21 | 8 | 3772 | 11764.72 |
| 24 | 12 | 6900 | 16604.58 |

The tests compare every contour point with the source matrix, verify a horizontal sweep aligned with the source normal, require visible contributions and check the final approach, backing and roof volumes.

The three saved horizontal studies still pass with their earlier geometry metrics. The L/V opening, raised support, invalid pose rejection and population extension tests pass. The validator change adds support for explicit rotation order and retains every geometric threshold.

TypeScript, focused lint and the production build passed. The build retains existing warnings in unrelated components.

Interactive Generate Design produced seed 24 with 12 actual letters at 40 × 40 × 60 ft and preferred letter size 13 ft. A/B/C, section and saved-study reopening were inspected. Editing L-3 alcove depth to 4 ft generated study 91366d9d-f6df-4874-b450-78c0d53dae49. Source meshes and every pose property remained identical, while volume changed from 16604.580 to 16716.088 ft³.

Run from this worktree with Node available.

- npm run build
- npm run start -- -H 127.0.0.1 -p 4199
- node scripts/upright-opening-tests.cjs
- node scripts/recessed-study-tests.cjs
- node scripts/vertical-envelope-constraints-tests.cjs

## Limits

The broader eight-seed sample accepted four studies. The other four were rejected for missing roof material, an unintended cavity, or an exported intersection. Full automatic reliability remains limited. New Design may try up to five candidates. Fixed-seed generation and edited-source regeneration keep the submitted arrangement.

The current upright operation supports a vertical source plane at X tilt 90 degrees with Y tilt zero. Leaning source planes need a separate supported construction.

The recorded roof and backing are geometric material checks. Structural support, access, and occupied circulation remain unverified. Tall support faces remain visible in the architectural result.

## Files touched by the upright change

- scripts/upright-opening-profile.cjs
- scripts/experimental-opening-profile.cjs
- scripts/source-vertical-envelope.cjs
- scripts/source-envelope.cjs
- proof/rule-validation.cjs
- src/components/sourcePopulation.ts
- src/components/amphitheaterInteractiveTypes.ts
- src/components/AmphitheaterStudio.tsx
- src/components/SourcePopulationEditor.tsx
- src/app/api/amphitheater/route.ts
- scripts/upright-opening-tests.cjs
- scripts/upright-study-sampling.cjs
- scripts/upright-influence-diagrams.cjs
- scripts/recessed-study-tests.cjs
- scripts/vertical-envelope-constraints-tests.cjs
- reports/upright-letters/

No push or merge was performed.
