# Inserted Horizontal Plate — nine-letter architectural pilot

Worktree: LUV-Gathering-Envelope-Experiment. Branch: experiment/gathering-envelope. Protected checkpoint: 9c01558f11ff8ea7824f640f108fb588d9198b6a. Backup branch: backup/gathering-pre-inserted-plate-2026-11-12 points to that checkpoint. No commit, push, merge, or deployment was performed for this pilot.

## Interactive result

http://127.0.0.1:4201/amphitheater?study=4ca1c9e6-7ba6-4975-a94e-096ffbda0a29

Select Inserted Horizontal Plate in Typology, use nine letters or Automatic, 40 × 40 × 60 ft and 13-ft preferred letters. Choose 12–15-ft floor spacing. Seed 19 reproduces the displayed study. Generate Design creates a source composition and architecture in one operation. Regenerate Architecture retains the edited input poses. A/B/C, isometric, plan, elevation, section, per-instance picking and OBJ/PNG presentation tools are retained.

The actual browser/API result matches the independently tested seed-19 source array and architecture mesh exactly. It reopened after refresh. Actual A, B, C and section screenshots accompany this report. The Generation Rules preview now displays actual source letters, plate components and boundary components rather than unrelated opening diagrams.

## Architectural contract

- Nine sources: three L floor sources, three U edge sources, three V boundary sources.
- New designs sample source positions in the selected field, with horizontal L/U faces and upright V faces. Common-axis plan variations are −15°, 0°, +15°. Regeneration never calls the population sampler.
- Each horizontal L outline generates a native .75-ft-thick plate, offset .50 ft in plan. Narrow 2.40-ft analytical links run from that source boundary to actual U/V boundaries intersecting its elevation. The floor domain depends on several letters rather than a fixed floor template.
- Each horizontal U plan profile develops a curved low edge, from .10 ft below to 2.80 ft above its associated L plate. Its actual inside contour remains an open recess above the plate; explicit cutters preserve that pocket when other components overlap it. The associated floor is chosen by source elevation proximity.
- Each upright V generates a vertical boundary beneath its actual upper source triangles. Default support is the previous plate underside; the lowest boundary reaches Z=0. Explicit support Z overrides are permitted only below the source underside. No tilted source is automatically flattened or reoriented. The editor displays unspecified support as Automatic rather than incorrectly implying an explicit zero.
- Field clipping is an actual Boolean intersection. Global Z is up, feet are used throughout. Source coordinates centered in the field receive only the existing +H/2 translation for world-floor geometry.
- Analytic contours, native extrusions, roof prisms and exact Booleans are used. No volumetric grid, post-generation stretching or visual smoothing substitutes for geometry.

## Actual geometry results

| Seed | Volume ft³ | Triangles | Worker ms | Precise triangle-pair checks | Minimum source exposed area ft² |
|---|---:|---:|---:|---:|---:|
| 19 | 2781.816 | 3734 | 2312 | 117527 | 343.35 |
| 37 | 2870.473 | 3546 | 2434 | 109142 | 290.70 |
| 73 | 2940.777 | 4022 | 2256 | 122840 | 341.10 |

All three cases: one connected exported material solid, positive volume, zero precise self-intersections, zero material outside the field, three planar plates and three open protected U recesses. Each source has an identifiable component and at least the unchanged 1-ft² visible contribution threshold. The original coarse preflight flags are retained in JSON, not hidden; strict triangle-pair checks pass.

At 12-ft spacing the plate tops are 3.64, 15.64 and 27.64 ft; at 15-ft spacing they are 3.64, 18.64 and 33.64 ft. A 40-ft-high field with 12-ft levels also passes. The 20-ft-high field is explicitly rejected for this three-level/13-ft-letter configuration rather than silently shrinking letters or level spacing. No claim is made that all combinations fit.

Edited-source test: L-1 moved .50 ft in X, with the exact edited request preserved and the architecture changed. Invalid tilted plate faces and incompatible source roles are explicitly rejected. V-3 has one plate contact; V-6 and V-9 each contact two plates in seed 19. These are material intersections, not structural verification.

All ten regression suites passed (nine prior suites plus Inserted Plate), including the unchanged Amphitheater, Void Field, open atrium, Face-Normal façade and export checks. TypeScript, targeted lint and production build pass. Build retains pre-existing warnings in unrelated components. New role guard was checked again in the final plate suite. OBJ validation confirms the saved letter/form vertex coordinates and triangle counts: letters 5,868 vertices / 1,956 triangles across nine objects; architecture 1,859 vertices / 3,734 triangles. Portable seeding regenerated the fifth study without altering the four existing portable studies.

## Per-letter influence, seed 19

- L-1: horizontal plate and source-boundary links; 343.35 ft² exposed contribution.
- U-2: curved edge and open inner-contour recess; 392.59 ft² exposed contribution.
- V-3: upright source-capped boundary; 435.14 ft² exposed contribution.
- L-4: horizontal plate and source-boundary links; 444.88 ft² exposed contribution.
- U-5: curved edge and open inner-contour recess; 359.88 ft² exposed contribution.
- V-6: upright source-capped boundary; 590.93 ft² exposed contribution.
- L-7: horizontal plate and source-boundary links; 350.71 ft² exposed contribution.
- U-8: curved edge and open inner-contour recess; 403.32 ft² exposed contribution.
- V-9: upright source-capped boundary; 571.44 ft² exposed contribution.

## Evidence and reproduction

ABC-section-study-19.png shows A/B/C and the exact X=0 section for the primary study. ABC-sections.png contains all three alternatives. Isometrics are projections of the actual generated triangles; section contours are exact Manifold slices. evidence-provenance.json records source requests and mesh hashes. SVG triangle rasterization can show fine triangle seams; inspect the actual interactive mesh for surface evaluation.

Run node scripts/inserted-plate-tests.cjs, then node scripts/inserted-plate-evidence.cjs. Use npm run test:envelope for the full ten-suite run. npm run envelope:studies includes the new portable fixture. Full startup instructions are in docs/ENVELOPE_EXPERIMENT.md.

## Files

New: scripts/source-inserted-plate.cjs, src/components/insertedPlatePopulation.ts, scripts/inserted-plate-tests.cjs, scripts/inserted-plate-evidence.cjs, proof/fixtures/inserted-plate-19.json, reports/inserted-plate/*.

Updated: scripts/source-envelope.cjs (separate dispatch), scripts/amphitheater-interactive-worker.cjs (typology warning), scripts/envelope-regression-tests.cjs, src/app/api/amphitheater/route.ts, src/components/AmphitheaterStudio.tsx, src/components/SourcePopulationEditor.tsx, src/components/amphitheaterInteractiveTypes.ts, src/components/amphitheaterPresentationExport.ts, src/components/amphitheaterPresentationRender.ts, proof/fixtures/envelope-studies.json, docs/ENVELOPE_EXPERIMENT.md.

Existing typology implementation modules and validation thresholds are unchanged. Prior generated validation reports were preserved from HEAD; current rerun snapshots are retained inside this report directory.

## Remaining architectural review

This is a nine-letter pilot, with three floors and fixed pilot component dimensions. Its 2.40-ft links describe geometric continuity and must not be represented as certified circulation. Structure, support, accessibility, guarding, headroom, occupancy and daylight have not been verified. U edges are low open recesses. The previous open-atrium system remains unchanged in Void Field; this plate typology does not claim that same atrium/visibility contract. Arbitrary edited arrangements may be rejected when contacts, source roles or horizontal floor conditions are lost. Review these three alternatives before increasing population or adding more operations.
