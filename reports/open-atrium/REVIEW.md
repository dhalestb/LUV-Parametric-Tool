# Open atrium — source-preserving review

The active corrected result is http://127.0.0.1:4201/amphitheater?study=870aec85-3bf6-44d4-97ef-5404293e55cf . The enclosed comparison is http://127.0.0.1:4201/amphitheater?study=9c33b2ef-f0c4-4592-ac17-c92d332b5c60 . Both use the identical saved nine source letters, 13-ft preferred size, 40 × 40 × 60-ft field, and 15-ft floor spacing. No source transforms, source meshes, or floor elevations changed during this correction.

## Cause and correction

The primary source-shaped canyon was open vertically but its closed perimeter rim rose continuously between floors. Existing tests proved valid empty shafts, not views from the galleries. The correction introduces source-contour bays into the PRIMARY atrium rim. Secondary voids retain their existing canyon character.

The primary letter inner curves and explicitly recorded mouth-closure edges determine bay paths. Windows trim the middle of each boundary path, retaining end piers. Their plan shapes are analytically stroked along adaptive contour segments and lofted with the existing taper. Floor slabs are protected: cuts begin 0.25 ft above floor tops and end below the next floor slab, with a small top rim retained. The 0.25-ft upstand is conceptual geometry, not a verified guard design. Other positive geometry is trimmed where the same source-derived bay intersects it. No source letters are moved, rotated, scaled, or replaced. No voxel reconstruction, global stretch, new bridges, or forced placement template was introduced.

Open and enclosed boundary modes are explicit request parameters. Existing requests without the mode retain enclosed behavior. The UI offers Open toward floors / Enclosed lightwell comparison. New standalone sessions default to open mode. Opening a saved study restores its saved mode; choose Open toward floors and Regenerate Architecture to correct an older study while preserving its poses.

## Visibility validation

The generator requires at least two floor-facing portals at every floor, at least two clear sampled paths for EVERY pair of levels (including lower to upper), and at least one upward sky path. Probe points are 4 ft above complete 0.12-ft material witnesses inside actual floor slabs. Cross-level lines must traverse at least 2 ft of the protected primary void. Each accepted path has seven parallel ray checks offset by 0.025 ft around the nominal line.

The independent test rechecks those ray bundles against all triangles of the actual exported mesh using Three.js ray/triangle intersection, independently of the Manifold ray queries. Source geometry equality, unchanged floor levels, positive floor witnesses, open subtractive volumes, and strict mesh checks are also asserted. The comparison tests reproduce blocked rays in the enclosed result.

| Spacing ft | Floor-facing views lower/middle/top | Cross-level paths lower-middle/lower-top/middle-top | Sky paths | Independent rays | Previously blocked rays | Triangles before → after | Material ft³ before → after |
|---|---|---|---|---|---|---|---|
| 12 | 4/4/4 | 3/3/3 | 3 | 168 | 147 | 12938 → 13722 | 5143.05 → 4674.92 |
| 15 | 4/4/4 | 3/3/3 | 3 | 168 | 147 | 12934 → 13722 | 5787.03 → 5214.92 |

All accepted cases have one connected solid, zero precise self-intersections/positive-area coplanar overlaps, no out-of-field geometry, and visible contributions for all nine sources. Existing validation thresholds were retained. Worker plus validation took approximately 6.2–9.1 seconds in the recorded corrected runs; concurrent local load affects these timings.

The 15-ft study floor tops remain 2.64, 17.64, and 32.64 ft. The 12-ft comparison remains 2.64, 14.64, and 26.64 ft. All source poses and source meshes are exactly equal before and after within each comparison.

An additional seed-19 arrangement passes. A deliberately tested U-primary override has floor-facing views but no verified cross-level paths. It is rejected and retained as a negative test. Arbitrary narrow/overlapping source arrangements are not promised to succeed. No threshold was relaxed to accept that case.

## Visual evidence

- before-form.png and after-form.png are actual 4096-pixel application PNG exports, using matching SE isometric views and unchanged framing inputs.
- after-isometric.png is the running viewer.
- sightlines-interface.png shows the actual paired isometric/vertical-section diagram and blue checked paths in the application.
- section-comparison.svg and section-comparison.png are exact before/after solid sections through a tested path, generated directly from exported meshes with Manifold slicing. Gold segments are intersections of the unchanged source-letter triangles with that same section plane. Blue lines shown in the section are only the tested paths that lie in that plane. section-provenance.json records the matrix and paths. Floor-edge gaps in this slice pass between retained piers; this is not a structural evaluation.

The application offers Show validated cross-level sightlines and Presentation & Export → Atrium Sightlines. The high-resolution form PNG downloads succeeded. Automated retrieval of the new visibility PNG stalled, despite the application reporting PNG encoding/export and displaying the rendered preview. No standalone browser visibility-PNG download is claimed. The separate exact-mesh section PNG/SVG is supplied instead. Browser permissions were not changed.

## Tests and build

PASS scripts/open-atrium-tests.cjs, including independent triangle rays, matching 12/15-ft comparisons, second source arrangement, and narrow-U rejection. Its source fixture is now portable at proof/fixtures/void-field-atrium.json and was verified identical to the tested saved request.

PASS all seven existing suites: void-field-tests, void-field-spacing-tests, three-lift-tests, upright-opening-tests, recessed-study-tests, vertical-envelope-constraints-tests, amphitheater-presentation-export-tests. Prior report files were preserved during regression execution. PASS TypeScript --noEmit, targeted ESLint, and production build. Existing unrelated build warnings remain. The rebuilt application generated and saved the corrected geometry through its real API. No deployed Vercel result is claimed.

## Files and safeguards

New implementation: scripts/source-atrium-openings.cjs. Updated dispatch/construction: scripts/source-void-field.cjs. New validation/artifact helpers: scripts/open-atrium-tests.cjs, scripts/open-atrium-section.cjs, proof/fixtures/void-field-atrium.json. Updated UI/report types/export: src/components/AmphitheaterStudio.tsx, amphitheaterInteractiveTypes.ts, amphitheaterPresentationExport.ts, amphitheaterPresentationRender.ts. Updated API validation/error reporting: src/app/api/amphitheater/route.ts.

All work remains in LUV-Gathering-Envelope-Experiment on experiment/gathering-envelope. Pre-edit files and original study were hash-verified at ../LUV-Gathering-Backups/pre-open-atrium-2026-11-12T11-51-05-964Z. HEAD remains eb094d2213405393ae9954aa8399d479ef643b5d. No commit, push, merge, rebase, reset, branch switch, or deployment was performed. Production and original standalone worktrees were not modified.

The saved population metadata/control is 10 while the saved source contains nine actual instances, matching the original displayed study. Regeneration preserved those existing nine instances and that metadata; it did not create another letter or expand the nine-letter review stage.

## Limits

These are sampled geometric sightlines and an open sky path. Illuminance, daylight distribution, glare, structural adequacy, guarding, occupancy, accessible circulation, and final local wall thickness are not verified. No claim of daylight performance or building compliance is made. Existing recessed-void and stepped-amphitheater behavior is preserved; this correction opens the primary Void Field atrium only.
