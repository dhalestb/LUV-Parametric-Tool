# B. Before-and-after measurement tables

v3.5 numbers are copied from `reports/descriptor-measurement-audit/current-evaluator-dump.json` (algorithm `v3.5`, 15 forms). That dump is not overwritten.

v4 numbers are produced by:

```
npx --yes tsx reports/descriptor-v4/compare-v35-v4.mts
```

That script writes `comparison-tables.md` and `comparison.json` in this folder. It also re-runs the legacy evaluator and fails if any v3.5 score or rank differs from the dump (|Δ| > 1e-6). This report records the v3.5 baseline in full so the comparison is readable even before that script has been executed in this session.

Rank 1 is weakest. Rank 15 is strongest. v4.1 ranks every form for every descriptor. A genuine 0 is a rank, not an exclusion. `n/a` is reserved for a geometry-processing failure.

---

## v3.5 absolute scores (baseline)

| Form | Open Volume | Convergent | Sculptural | Visually Connected | Surreal | Monumental | Hierarchical | Sequential | Circulation Activated | Centralized | Vertically Integrated | Luminous |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gathering Linear | 45.46 | 73.25 | 46.35 | 26.41 | 32.70 | 37.50 | 12.15 | 55.00 | 92.58 | 61.50 | 72.50 | 52.00 |
| Gathering, Plate | 47.43 | 47.30 | 56.40 | 29.90 | 25.95 | 31.20 | 6.20 | 61.67 | 41.28 | 67.75 | 93.18 | 53.20 |
| Gathering, Room within Volume | 99.72 | 0.00 | 55.30 | 38.38 | 29.95 | 30.80 | 21.50 | 74.77 | 27.89 | 43.35 | 45.00 | 76.40 |
| Gathering, Stepped | 75.18 | 40.05 | 64.20 | 29.87 | 26.05 | 29.10 | 11.40 | 82.67 | 37.10 | 78.15 | 97.73 | 62.30 |
| Gathering Void Field | 82.49 | 56.70 | 61.20 | 30.41 | 27.25 | 27.70 | 29.50 | 62.14 | 69.15 | 89.65 | 85.00 | 66.50 |
| Lobby Continuous Hall | 88.80 | 32.15 | 66.10 | 41.65 | 34.20 | 26.75 | 37.15 | 49.67 | 58.04 | 90.20 | 0.00 | 86.00 |
| Lobby, Ground Field | 62.69 | 48.15 | 45.50 | 22.85 | 22.65 | 31.95 | 8.75 | 68.27 | 48.79 | 87.20 | 100.00 | 63.90 |
| Lobby, Linear | 46.31 | 64.55 | 48.40 | 21.90 | 28.40 | 31.15 | 6.35 | 55.00 | 79.40 | 65.25 | 100.00 | 49.40 |
| Lobby, Sequential | 18.72 | 74.70 | 50.20 | 22.38 | 29.10 | 32.30 | 6.25 | 56.67 | 89.58 | 81.75 | 100.00 | 47.40 |
| Lobby Vertical Void | 67.39 | 44.10 | 48.30 | 23.18 | 19.50 | 33.65 | 10.90 | 68.02 | 31.79 | 69.25 | 100.00 | 37.30 |
| workspace cascaded | 61.49 | 53.50 | 47.10 | 23.43 | 26.45 | 34.70 | 13.40 | 63.46 | 69.82 | 75.05 | 45.00 | 58.10 |
| workspace flat deep-plate | 82.93 | 38.45 | 52.05 | 35.57 | 31.55 | 31.90 | 5.70 | 58.33 | 39.24 | 38.00 | 100.00 | 65.90 |
| workspace open hall | 93.71 | 0.00 | 60.80 | 28.81 | 34.40 | 28.05 | 9.80 | 67.50 | 11.59 | 64.65 | 66.89 | 75.10 |
| workspace undulating | 64.21 | 45.15 | 50.05 | 24.76 | 31.65 | 31.90 | 4.20 | 61.88 | 50.01 | 93.10 | 97.73 | 54.90 |
| workspace void | 92.71 | 47.20 | 64.35 | 38.47 | 36.30 | 26.65 | 28.45 | 62.78 | 49.99 | 80.05 | 45.00 | 75.00 |

## v3.5 registry ranks (1 weakest … 15 strongest)

| Form | OV | Cv | Sc | VC | Su | Mo | Hi | Sq | CA | Ce | VI | Lu |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Gathering Linear | 2 | 14 | 2 | 7 | 12 | 15 | 10 | 2 | 15 | 3 | 6 | 4 |
| Gathering, Plate | 4 | 9 | 10 | 10 | 3 | 8 | 3 | 6 | 6 | 6 | 8 | 5 |
| Gathering, Room within Volume | 15 | 1 | 9 | 13 | 9 | 6 | 12 | 14 | 2 | 2 | 2 | 14 |
| Gathering, Stepped | 9 | 5 | 13 | 9 | 4 | 5 | 9 | 15 | 4 | 9 | 9 | 8 |
| Gathering Void Field | 10 | 12 | 12 | 11 | 6 | 3 | 14 | 8 | 11 | 13 | 7 | 11 |
| Lobby Continuous Hall | 12 | 3 | 15 | 15 | 13 | 2 | 15 | 1 | 10 | 14 | 1 | 15 |
| Lobby, Ground Field | 6 | 10 | 1 | 3 | 2 | 11 | 6 | 13 | 7 | 12 | 12 | 9 |
| Lobby, Linear | 3 | 13 | 5 | 1 | 7 | 7 | 5 | 3 | 13 | 5 | 13 | 3 |
| Lobby, Sequential | 1 | 15 | 7 | 2 | 8 | 12 | 4 | 4 | 14 | 11 | 14 | 2 |
| Lobby Vertical Void | 8 | 6 | 4 | 4 | 1 | 13 | 8 | 12 | 3 | 7 | 11 | 1 |
| workspace cascaded | 5 | 11 | 3 | 5 | 5 | 14 | 11 | 10 | 12 | 8 | 3 | 7 |
| workspace flat deep-plate | 11 | 4 | 8 | 12 | 10 | 9 | 2 | 5 | 5 | 1 | 15 | 10 |
| workspace open hall | 14 | 2 | 11 | 8 | 14 | 4 | 7 | 11 | 1 | 4 | 5 | 13 |
| workspace undulating | 7 | 7 | 6 | 6 | 11 | 10 | 1 | 7 | 9 | 15 | 10 | 6 |
| workspace void | 13 | 8 | 14 | 14 | 15 | 1 | 13 | 9 | 8 | 10 | 4 | 12 |

Ties in v3.5 used filename after score (see dump). Several Vertically Integrated scores sit on 45.00 or 100.00 because voxel shaft detection saturated.

---

## v4.1 columns

Filled by `comparison-tables.md` and `comparison.json`. The comparison passed: source vertex and face counts match the v3.5 dump, the legacy evaluator reproduces every baseline score and rank, two independent v4.1 runs agree, and each published score reconstructs from its measured components. All 15 forms are ranked on all 12 descriptors. None are unavailable.

| Descriptor | Ranked | Unavailable | Spearman ρ vs v3.5 | v4.1 min | v4.1 max | Weakest | Strongest |
|---|---:|---|---:|---:|---:|---|---|
| Open Volume | 15 | — | 0.30 | 1.6 | 33.0 | Lobby Continuous Hall | Gathering, Room within Volume |
| Convergent | 15 | — | -0.22 | 3.2 | 98.9 | Gathering Linear | Lobby Continuous Hall |
| Sculptural | 15 | — | 0.82 | 45.8 | 66.4 | Gathering Linear | Gathering Void Field |
| Visually Connected | 15 | — | 0.19 | 0.0 | 65.7 | Lobby Continuous Hall | Gathering, Plate |
| Surreal | 15 | — | -0.24 | 22.7 | 73.3 | Lobby Vertical Void | Gathering, Plate |
| Monumental | 15 | — | 0.02 | 20.7 | 33.3 | Lobby, Sequential | Gathering, Room within Volume |
| Hierarchical | 15 | — | -0.38 | 0.0 | 46.7 | Gathering, Room within Volume | workspace void |
| Sequential | 15 | — | 0.02 | 0.0 | 6.3 | Lobby Vertical Void | workspace undulating |
| Circulation Activated | 15 | — | -0.47 | 33.7 | 79.4 | Gathering Linear | Lobby Continuous Hall |
| Centralized | 15 | — | 0.24 | 7.0 | 59.7 | workspace void | Lobby Continuous Hall |
| Vertically Integrated | 15 | — | 0.59 | 0.0 | 33.7 | Gathering Void Field | Lobby, Ground Field |
| Luminous | 15 | — | -0.32 | 0.0 | 78.5 | Lobby Continuous Hall | Lobby Vertical Void |

---

## Representative pair — why ranks are expected to move

### Gathering Linear.obj (v3.5)

High Circulation Activated (92.58, rank 15). Low Open Volume (45.46, rank 2) and Sculptural (46.35, rank 2). Highest Monumental (37.50, rank 15).

Circulation Activated fell from 92.6 (rank 15) to 33.7 (rank 1). The v3.5 score followed a dense voxel shell. v4.1 requires entries, region joins, and junctions on a floor-surface network, and this form has the fewest of those among the 15.

Monumental fell from 37.5 (rank 15) to 25.2 (rank 6). The 20 ft cube no longer wins on bounding height alone. Clear volume and sheltered height keep it in the middle of the group.

Open Volume moved from 45.5 (rank 2) to 11.6 (rank 8). Exterior exposure is excluded. The remaining interior clearance is real and still ranked.

Sequential moved from 55.0 (rank 2) to 6.3 (rank 4). Many forms share 6.3 because the verified route does not climb a level. Ties keep that score and break by filename.

### Lobby Continuous Hall.obj (v3.5)

Highest Visually Connected (41.65) and Luminous (86). Highest Sculptural (66.10) and Hierarchical (37.15). Zero Vertically Integrated (rank 1). Lowest Sequential (49.67).

Vertically Integrated stays 0. The rank moves from 1 to 4 because five single-level forms score 0 and ties break by filename. The score is a measured absence, not an unavailable result.

Luminous fell from 86.0 (rank 15) to 0.0 (rank 1). The only detected surface is an uncovered deck at 18.9 ft, so there is no interior standing position to receive light. Roof exposure is not counted.

Visually Connected fell from 41.7 (rank 15) to 0.0 (rank 1). Fewer than two eye-height positions share that deck, so same-level sight is absent and the form is still ranked.

Sculptural stays high in absolute terms, 66.1 to 64.2, and the rank moves from 15 to 11. Fold angle, orientation, section, and mirror asymmetry are measured on the original triangles.

Hierarchical fell from 37.1 (rank 15) to 0.0 (rank 2). One level and one occupiable region produce no hierarchy of planes. That zero is ranked. Convergent rose from 32.2 (rank 3) to 98.9 (rank 15) because the verified floor routes reach one destination.

---

## How to read a large rank change

A rank move is not automatically more accurate. For each large Δ the comparison script’s per-component table should be checked against:

1. The architectural intent in report A.
2. The evidence layers drawn for that form.
3. Whether the v3.5 term was a voxel-shell proxy (expected to move) or an already-surface measurement (should move only when the new classification, e.g. roof vs interior, changes the input).

Do not retune weights to restore a preferred 15-form spread.
