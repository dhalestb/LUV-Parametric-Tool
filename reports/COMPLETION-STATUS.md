# Evaluations completion checkpoint — incomplete

Baseline: 67fa7df3a4381a0ff36b0cc8e68842c96d87ce7e, verified on GitHub 2026-11-22.
Branch: codex/evaluations-completion-2026-11-22.

This checkpoint preserves Phase 1, Phase 2, Stage A and gathering-review artifacts, fixes the legacy vertical diagram, clarifies rankings and adds tested mathematical/reconstruction foundations. It does not activate the revised Centralized score and does not meet final acceptance.

## Implemented

- Real isolated Git worktree based on the published implementation, retaining its compatibility corrections.
- Locked npm installation; package.json and package-lock.json unchanged.
- Anchored 0.125 ft elevation bands prevent transitive stair-tread merging. All usable sample support remains, including smaller transition bands. The configurable 32 ft² platform classification is a provisional geometric diagnostic, not a universal room criterion.
- Centralized-only context reconstruction, leaving historical contexts unchanged. Controlled stairs now produce detected vertical chains without injecting level metadata.
- Pure 40/40/20 metric function with independent reference tests. G is the cube root of the product of capped area/200 ft², width/12 ft, and height/7 ft (open sky gives height factor 1). C caps distinct independently established approaches/4. R uses area-weighted verified reachability excluding the destination; unknown origins produce separate lower/upper bounds. No origins produces unavailable R. These calibration parameters remain configurable, and eligibility/independent approach extraction is not yet wired to this function.
- Legacy Vertically Integrated drawing now uses existing elevation-changing walk-network links. Previous stacked-cell lookup could not find the diagonal rise links in the fixture. No assertion was removed and production v4 scoring is unchanged.
- Existing comparison matrix now shows score, rank/cohort, version and unavailable reason; ranks explicitly say higher is stronger.
- Type-correct existing fixtures and no-emit TypeScript support for .ts test imports. Only archived duplicate candidate source is excluded from compilation; active tests remain included.

## Verification

158 Evaluation tests passed before fixture-only typing corrections; final rerun is recorded in completion-tests-final.log. TypeScript completed without diagnostics after corrections. Production build retry succeeded, with existing lint warnings. Initial build encountered EPERM creating .next/server/app/evaluations; explicitly creating that directory resolved the retry. Installation/build logs are preserved.

The model baseline runner verifies the original source hashes and records all five current results. Linear and Void Field remain unavailable for historical Centralized. The new score has not been substituted to conceal that limitation.

## Outstanding implementation

- Distinguish occupied platform regions from transitions, mesh details and unresolved fragments. Anchored bands alone increase raw region counts and are insufficient as architectural segmentation.
- Verify finite-width portals and continuous route support; classify explicit barriers versus unknown connections; group independent approaches and shared bottlenecks.
- Establish candidate eligibility and integrate measured candidate evidence with the metric function.
- Complete destination/floor selectors, gold patches, cyan approaches, and synchronized plan/isometric evidence in the existing descriptor.
- Validate source units against dimensions; the one-unit/one-foot assumption is still recorded, not independently certified. Preliminary Linear support at z=0.53125 is 769 ft² and one z=10 region is 423 ft² (sum 1,192); agreement with the supplied approximate 1,200 ft² is suggestive, not proof that these are precisely the intended interior/gallery regions.
- Complete all 15 defensible results, geometry-controlled convergence tests, triangulation invariance, loading/tab-switching and screenshot checks.

No architectural source geometry, generation rules, prior worktree, main branch, or historical scoring implementation was replaced. No deployment or merge.
