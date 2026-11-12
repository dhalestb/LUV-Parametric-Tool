# Adjustable Void Field level spacing

Floor-to-floor spacing offers 12, 13, 14, or 15 feet. Default 12 ft. Generate Design/New Design create source lifts at the selected spacing. Adjust current levels explicitly moves only source Z elevations, generates architecture, and saves a separate study. Regenerate Architecture preserves all edited source poses. Existing studies are retained.

Current study adjusted to 12 ft: 82ae3ed7-a127-4ed5-8aa6-03b0b6cfc83c. Floor tops 2.64, 14.64, 26.64 ft. 15-ft geometry test floor tops 2.64, 17.64, 32.64 ft. Slabs remain 0.75 ft thick. Clear slab-to-slab height is 11.25–14.25 ft before intersecting geometry.

Both actual geometry tests passed unchanged strict validation with zero precise intersections, one connected solid, and exact source transformations except the explicitly adjusted Z values. Undersized fields are rejected without reducing spacing or letter size. TypeScript, targeted lint and production build passed. Running application generated and saved the adjusted 12-ft result.

Changed src/components/voidFieldPopulation.ts and AmphitheaterStudio.tsx. Added scripts/void-field-spacing-tests.cjs and level-spacing-validation.json. Pre-edit files preserved in ../LUV-Gathering-Backups/pre-level-spacing-2026-11-12T06-28-23-738Z. No commit, push, merge or deployment.
