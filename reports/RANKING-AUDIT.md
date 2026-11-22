# Three-model ranking audit — 2026-11-22

The runner `completion-model-baseline.cjs` loaded each original OBJ directly from the user's gathering directory, used its previously recorded source ID and Z-up / one unit per foot settings, and checked its source hash against the earlier independent browser capture. The source SHA-256 hashes and geometry bounds are in `completion-model-baseline.json`. `verify-rankings.cjs` passes the actual full-precision scores to the application ranking function, checks the cohorts, and verifies that a genuine zero participates. Scores are rounded to one decimal below; ordering used full precision.

| Descriptor / method | Linear.obj | Stepped.obj | Void_Field.obj | Cohort |
|---|---:|---:|---:|---:|
| Open Volume v4.4.0 | 24.8 · rank 3/3 | 1.5 · rank 1/3 | 7.9 · rank 2/3 | 3 |
| Visually Connected v4.3.0 | 32.3 · rank 1/3 | 36.0 · rank 2/3 | 47.5 · rank 3/3 | 3 |
| Circulation Activated v4.3.0 | 44.1 · rank 2/3 | 44.3 · rank 3/3 | 16.3 · rank 1/3 | 3 |
| Vertically Integrated v4.3.0 | 30.0 · rank 2/3 | 45.2 · rank 3/3 | 20.5 · rank 1/3 | 3 |
| Centralized centralized-graph-v1.0.0 | unavailable | 6.1 · rank 1/1 | unavailable | 1 |

Rank 1 is the lowest score within a descriptor's available cohort; 3/3 is the highest. Thus 2/3 means second of three, never two forms out of three were evaluated. All three forms were loaded and evaluated for all five descriptors. Linear and Void Field were **excluded only from the Centralized rank** because its production graph yielded zero verified interregion relationships. The exact production reason for both: `Insufficient evidence: No verified relationships between spatial regions were found.` This originates at `centralityGraph.ts` after `evaluateV4.ts:centralized` builds links only between the old walk-component regions. Phase 2 can preserve opening relationships separately, but is not yet a reliable score graph for these source models.

`assignComparativeRanks` deliberately excludes non-finite scores and includes zero; a controlled [0,25,50] case gives zero rank 1/3. Absence of score therefore requires a specific reason and is not treated as poor architectural performance. The current `2/3` cards in Circulation Activated and Vertically Integrated are valid middle ranks for all three loaded models.

The baseline one-foot-per-unit assumption is plausible from Linear's measured bounds (34.3 × 37.7 × 19.9 units) and approximate floor evidence around 1,192 ft² across major ground/gallery supports. It is not independently certified by metadata in OBJ, so score units remain conditional on the chosen import settings. No source geometry was changed.

The historical Centralized result is preserved. The proposed 40/40/20 formula has unit tests but is not wired into production; the missing two results cannot honestly be assigned numbers until occupied regions, independent routes, and unknown reachability are resolved.
