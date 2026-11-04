# D. Implementation report

## Repository

| Item | Value |
|---|---|
| Worktree | `C:\Users\DHale\.codex\worktrees\descriptor-comparison-clean\Cursor-APP` |
| Git directory | `C:/Users/DHale/Documents/Codex/Cursor-APP/.git/worktrees/Cursor-APP4` |
| Branch | `feature/descriptor-comparison-clean` |
| HEAD at the start of this work | `b027deff90bdb3371221ee8e538f34652c18e1a7` |
| Original 15 OBJs (read-only) | `C:\Users\DHale\.codex\worktrees\organic-surface-integration\Cursor-APP\local-test-data\architectural-objs` |
| v3.5 baseline dump (not overwritten) | `reports/descriptor-measurement-audit/current-evaluator-dump.json` |
| Draft PR | #6 stays draft until this branch is pushed. |

Other worktrees were not modified. The D: workspace was not used as a write target.

Assumptions verified against the current code: source OBJ Y-up, evaluation Z-up spec feet, 1 unit = 1 ft, `CELL_FEET = 2` remains diagnostic only.

## Files

### New

- `src/components/evaluations/descriptorVersion.ts`
- `src/components/evaluations/v4/geometry.ts`
- `src/components/evaluations/v4/surfaces.ts`
- `src/components/evaluations/v4/circulation.ts`
- `src/components/evaluations/v4/visibility.ts`
- `src/components/evaluations/v4/voids.ts`
- `src/components/evaluations/v4/evidence.ts`
- `src/components/evaluations/v4/formMeasures.ts`
- `src/components/evaluations/v4/evaluateV4.ts`
- `src/components/evaluations/v4/evaluateV4.test.ts`
- `src/components/evaluations/formIdentity.ts`
- `src/components/evaluations/formIdentity.test.ts`
- `src/components/evaluations/boardEvidence.ts`
- `reports/descriptor-v4/audit-levels.mts`
- `reports/descriptor-v4/compare-v35-v4.mts`
- `reports/descriptor-v4/A-specification.md`
- `reports/descriptor-v4/B-before-after.md`
- `reports/descriptor-v4/C-diagram-verification.md`
- `reports/descriptor-v4/D-implementation.md`
- `reports/descriptor-v4/E-validity.md`
- `reports/descriptor-v4/README.md`

### Edited

- `src/components/evaluations/objDescriptorAnalysis.ts` — `evaluateTileModel` defaults to v4 when source is present; `evaluateTileModelLegacy` is the unchanged v3.5 path; NaN is reserved for processing failure.
- `src/components/evaluations/descriptorRank.ts` — a measured 0 is ranked; only non-finite scores are unranked.
- `src/server/registryOpenVolume.ts` — runs v4 and v3.5; payload includes `version`, `unavailable`, and `legacy`.
- `src/components/evaluations/AnalysisViewport.tsx` — draws `EvidenceLayer` patches, tubes, arrows, labels.
- `src/components/evaluations/comparisonBoard.ts` — overlays, legends, `annotationSizes`, unavailable metrics, dashed lines.
- `src/components/evaluations/DescriptorComparison.tsx` — token-sorted registry lookup; missing characteristics score 0 and still show rank.
- `src/components/evaluations/ArchitecturalEvaluations.tsx` — token-sorted registry filename matching; every finite score, including 0, shows a 15-form rank.

### Intentionally not edited

- Original OBJ files and their hashes.
- `reports/descriptor-measurement-audit/current-evaluator-dump.json`
- `src/components/evaluations/descriptorV2.ts` (still exports `DESCRIPTOR_ALGORITHM_VERSION = "v3.5"` for `scripts/descriptor-comparison-check.mts`)
- Lattice placement, circulation-generation, and adaptive geometry.
- Approved presentation PNG/SVG assets.

## Algorithms changed

v4 replaces voxel-shell scoring for all 12 descriptors. The shared pipeline is mesh → floor field → levels → circulation network → visibility / voids / light. See report A for formulas and weights.

v3.5 formulas, thresholds, and weights are unchanged and remain callable.

## Ranking differences

Expected directional changes (not claimed numerical ranks):

- Forms that won Monumental on bounding-box height (Gathering Linear, rank 15) should move unless they also have a large clear volume.
- Forms that won Circulation Activated on voxel-graph density (Gathering Linear, rank 15) should keep continuity only if a floor network exists; activation terms change.
- Forms that scored Vertically Integrated 0 or 100 from shaft detection (Lobby Continuous Hall = 0) receive separate void / view / circulation terms when two or more levels exist. A genuine single-level form scores 0 for Vertically Integrated and is still ranked.
- Open Volume and Luminous lose roof-as-interior credit; an exterior-only slab scores 0, not n/a.
- Hierarchical on one-level halls is measured among occupiable regions on that level. Missing secondary/tertiary planes score 0.
- Occupiable upper decks and perimeter branches count as levels even without internal stairs. Roof caps do not.
- Registry ranks use token-sorted filename identity so every form displays its 15-form rank.

Exact v4 ranks are the output of `compare-v35-v4.mts`.

## Geometry preservation

`buildAnalysisMesh` copies positions into a new `Float64Array`. Source `positions` and `faces` are never written. The comparison script records SHA-256 of each OBJ and checks vertex/face counts against the v3.5 dump. Fixture tests assert the source arrays are bit-identical after `evaluateV4`.

## Tests and comparison

Ran on 2026-10-20:

```
npx --yes tsx --test src/components/evaluations/v4/evaluateV4.test.ts src/components/evaluations/formIdentity.test.ts
npx --yes tsx reports/descriptor-v4/compare-v35-v4.mts
npx --yes tsx reports/descriptor-v4/audit-levels.mts
```

- Evaluator and filename-identity tests: 33 passed, 0 failed.
- Comparison: 15 forms, 0 problems. Legacy scores reproduce the v3.5 dump. v4.1 is deterministic, reconstructs from its components, and ranks every form on every descriptor.
- Level audit: written to `level-audit.md`. No form has a verified stair. Sub-16 ft² projecting surfaces are connection interfaces, not floors.

`npx tsc --noEmit`, `npx eslint .`, and `npx next build` were not re-run for this commit. The pre-existing type and lint findings below are unchanged, and a production build restarts the Next compiler.

Pre-existing, recorded separately (do not treat as v4 regressions):

- tsc errors in `descriptorCache.test.ts`, `descriptorRank.test.ts`, `descriptorV2.test.ts`, `openVolume.test.ts`
- ESLint warnings in `amphitheaterPrototype.ts`, `lattice/distribution.ts`, `LatticeViewport.tsx`, `lattice/search.ts`
- `scripts/descriptor-comparison-check.mts` asserts `descriptorV2.ts` version is still `"v3.5"` and that the legacy Surface Clearance term still exists — that remains true.

Production `next build` restarts the Next compiler and can break a running `npx next dev -p 3010`. If a build is run later, restart that dev server; do not kill an existing healthy process without checking.

## Export verification

Board painter and SVG markup include overlays, legend swatches, dashed potential lines, and score/rank labels. 3D PNG export uses `exportSize` (default 7407 × 2160) and `annotationSizes`. Browser capture of the 12 v4 diagrams is still outstanding (file inputs cannot be automated; use Load original pair + Analyze All Forms, then the 15-form registry).

## Remaining limitations

1. OBJ files do not name doors, glazing, stairs, or program. Entries are geometric openings; light is potential penetration; stairs are never invented.
2. Floor classification uses enclosure probes. Ambiguous 0.25–0.5 enclosure is reported as uncertain and not credited.
3. Face winding is ignored (`|nz|`); slab undersides are dropped by the 1 ft slab-gap rule. Non-manifold meshes can still produce uncertain columns.
4. Eye-height visibility is a sampled set (3 ft stride, 24 targets), not an exhaustive visual graph.
5. v4 evaluation of a 40k-triangle OBJ is heavier than v3.5 voxels. The v4 cache keys on positions, faces, unit, up, and eye height.
6. The comparison script, fixture tests, and 15-form level audit have been run. See `comparison-tables.md` and `level-audit.md`.
7. This report is included in the v4.1 commit on `feature/descriptor-comparison-clean`.
