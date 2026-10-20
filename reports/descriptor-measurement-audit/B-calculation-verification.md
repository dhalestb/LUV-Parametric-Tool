# B. Calculation verification

Source of the numbers: `reports/descriptor-measurement-audit/current-evaluator-dump.json`.

That file was produced by the current `evaluateTileModel` on the 15 original OBJs in `C:\Users\DHale\.codex\worktrees\organic-surface-integration\Cursor-APP\local-test-data\architectural-objs`. Settings match the registry: Y-up, unit scale 1, algorithm `v3.5`. Both worked examples used `cellFeet = 2`. This is the current scorer, not an experimental replacement.

`reconstructedFromPrecise` in the dump matches `absoluteScore` for every descriptor on every form. The composite formula holds.

## Rounding

`clamp100` rounds to the nearest integer and clamps to 0–100 (`descriptorV2.ts` line 40).

Two paths then diverge:

- `metric()` stores the unrounded 0–100 number in `precise` and the rounded integer in `value` (lines 42–44). Visually Connected, Sequential, Circulation Activated, Vertically Integrated, and Luminous use this. Ranking uses `precise`.
- Convergent, Sculptural, Surreal, Monumental, Hierarchical, and Centralized build drafts without `precise`. `fromDrafts` copies the already rounded `value` into `precise` (lines 260–268). Ranking uses the rounded component.
- Open Volume sets `precise` to the unrounded `raw × 100` (`openVolumeClearance.ts` line 390; `objDescriptorAnalysis.ts` lines 291–293). The displayed component value is then rounded.

`contribution` is `round(precise × weight / weightSum × 10) / 10` (lines 247–256). Summing the displayed contributions can miss the composite by a tenth.

The UI headline is the registry rank, not `score` and not `absoluteScore`. `score` is the rounded composite and is not the rating.

## Ranking and ties

Registry, `registryOpenVolume.ts` lines 69–74:

1. Measure every `.obj` in the registry directory. The dump contains 15 files, which is the full original set.
2. For each descriptor separately, sort by `absoluteScore` ascending.
3. Break a tie with `filename.localeCompare`.
4. Rank = position + 1. Rank 1 is weakest. Rank 15 is strongest.

The scores are absolute calibrated values. The rank is relative to these 15 files. A form is not scored as a percentile of the set. The 0–100 number is a fixed formula. The rank is that number’s place in the 15.

Session ranking is separate and is not the headline. `assignComparativeRanks` (`descriptorRank.ts` lines 35–79) also sorts weakest to strongest, then breaks ties by raw component values in descending weight order, then by form id. It writes `comparativeRank` for the session only.

Examples of registry ties:

- Convergent absolute score 0: `Gathering, Room within Volume.obj` is rank 1 and `workspace open hall.obj` is rank 2, because the filename sort places Gathering first.
- Sequential absolute score 55: `Gathering Linear.obj` is rank 2 and `Lobby, Linear.obj` is rank 3.
- Vertically Integrated absolute score 100: five forms tie and are ordered by filename from rank 11 through rank 15.

## Missing and empty evidence

`measureSpatialDescriptors` lines 1155–1168, when `cells.length` is 0:

| Descriptor | What the empty path does | Result of the diagnostic call with bbox 20 × 30 × 12 ft and volume 0 |
| --- | --- | --- |
| Centralized | Substitutes the single cell `[0,0,0]` | All three components score 100. Composite would be 100. This is a placeholder, not a measured center |
| Monumental | Uses that placeholder cell only if `bboxFeet` is absent. With a bbox, height is the bbox height | Height raw 12 ft scores 13. Volume 0 scores 0. Dominance 0.4 scores 0. Composite is nonzero from the box alone |
| Sculptural, Surreal, Luminous | Cells are empty, so voxel terms are 0. Triangle terms still run if triangles were passed | All zero in the diagnostic because no triangles were passed. A mesh with triangles and no occupied cells can still score these three |
| Convergent, Visually Connected, Sequential, Circulation Activated, Vertically Integrated | Empty graphs | All zero |
| Open Volume | Not in that function. With a mesh, clearance still runs on the triangles even if the occupied list is empty | A roof with no overhead can score near 100 with no occupied cells |

Other cliffs that produce a real zero rather than a placeholder:

- Convergent returns all zeros when path-like cells are fewer than 4 or entries are fewer than 2 (lines 344–355).
- Visually Connected returns all zeros when fewer than 2 zones exist (lines 731–736).
- Hierarchical sets Largest-Region Dominance to 0 when only one plate exists, even if that plate is the entire mass (line 893).
- Vertically Integrated stays 0 when fewer than two substantial walkable levels exist (lines 249–264).

Invalid OBJ text fails in `parseObj` before a score is stored. The registry promise clears itself on failure (`registryOpenVolume.ts` lines 39–42). The UI comparison skips a slot that has no mesh or whose status is not ready.

## Worked example: Gathering Linear.obj

Original file. 20,865 vertices, 41,604 faces, 674 occupied cells, cell 2 ft, occupied-voxel volume 5,392 ft³, mesh box 20 × 20 × 20 ft.

Reconstruction uses the weighted `precise` values. Where `precise` equals the rounded `value`, that is because this descriptor does not keep the unrounded term.

| Descriptor | Components (precise × weight) | Composite | Rounded display | Registry rank |
| --- | --- | --- | --- | --- |
| Open Volume | 45.4597 × 1 | 45.46 | 45 | 2 of 15 |
| Convergent | 80×0.45 + 63×0.35 + 76×0.20 = 36 + 22.05 + 15.2 | 73.25 | 73 | 14 of 15 |
| Sculptural | 15×0.30 + 97×0.25 + 44×0.25 + 33×0.20 = 4.5 + 24.25 + 11 + 6.6 | 46.35 | 46 | 2 of 15 |
| Visually Connected | 15.0242×0.45 + 40.9103×0.30 + 29.5056×0.25 | 26.41 | 26 | 7 of 15 |
| Surreal | 24×0.30 + 2×0.25 + 100×0.25 + 0×0.20 = 7.2 + 0.5 + 25 + 0 | 32.70 | 33 | 12 of 15 |
| Monumental | 38×0.40 + 43×0.35 + 29×0.25 = 15.2 + 15.05 + 7.25 | 37.50 | 38 | 15 of 15 |
| Hierarchical | 3×0.40 + 22×0.35 + 13×0.25 = 1.2 + 7.7 + 3.25 | 12.15 | 12 | 10 of 15 |
| Sequential | 42.857×0.35 + 66.667×0.30 + 80×0.25 + 0×0.10 = 15 + 20 + 20 + 0 | 55.00 | 55 | 2 of 15 |
| Circulation Activated | 90.736×0.30 + 93.506×0.25 + 88.462×0.20 + 100×0.15 + 92.857×0.10 | 92.58 | 93 | 15 of 15 |
| Centralized | 89×0.40 + 49×0.35 + 35×0.25 = 35.6 + 17.15 + 8.75 | 61.50 | 62 | 3 of 15 |
| Vertically Integrated | 100×0.35 + 50×0.30 + 50×0.25 + 100×0.10 | 72.50 | 73 | 6 of 15 |
| Luminous | 58×0.40 + 30×0.30 + 66×0.30 = 23.2 + 9 + 19.8 | 52.00 | 52 | 4 of 15 |

Selected raw inputs for this file:

- Surface clearance raw 0.4546, so 45.46% of qualifying upward area receives credit after the 5 ft gate.
- Destination agreement raw 0.7959 is rounded to 80 before weighting. Direction diversity raw 0.625 is rounded to 63, not 62.5.
- Dihedral raw 0.153 is the mean angle divided by 90, then rounded to 15. The unit string says 60°.
- Monumental height raw is 20 ft. `(20−8)/32×100 = 37.5`, rounded to 38. Volume raw 5,392 ft³. `(5392−400)/11600×100 = 43.03`, rounded to 43. Dominance raw 1.0. `(1−0.4)/2.1×100 = 28.57`, rounded to 29.
- Sequential depth raw is 3 hops. `3/(3+4)×100 = 42.857`. Path length raw is 4 zones. `4/6×100 = 66.667`.
- Vertically Integrated cross-level raw is 4 atrium cells, while the scored term is 50. The raw and the score are not the same quantity. See report A.
- Cantilever raw is 0. No upper occupied cell lacked a 3×3 support.

## Worked example: Lobby Continuous Hall.obj

Original file. 2,110 vertices, 4,152 faces, 200 occupied cells, cell 2 ft, occupied-voxel volume 1,600 ft³, mesh box 20.59 × 20.00 × 20.68 ft.

| Descriptor | Composite | Rounded display | Registry rank |
| --- | --- | --- | --- |
| Open Volume | 88.80 | 89 | 12 of 15 |
| Convergent | 32.15 = 40×0.45 + 13×0.35 + 48×0.20 | 32 | 3 of 15 |
| Sculptural | 66.10 = 17×0.30 + 100×0.25 + 100×0.25 + 55×0.20 | 66 | 15 of 15 |
| Visually Connected | 41.65 | 42 | 15 of 15 |
| Surreal | 34.20 = 28×0.30 + 3×0.25 + 89×0.25 + 14×0.20 | 34 | 13 of 15 |
| Monumental | 26.75 = 40×0.40 + 10×0.35 + 29×0.25 | 27 | 2 of 15 |
| Hierarchical | 37.15 = 5×0.40 + 79×0.35 + 30×0.25 | 37 | 15 of 15 |
| Sequential | 49.67 = 33.333×0.35 + 50×0.30 + 60×0.25 + 80×0.10 | 50 | 1 of 15 |
| Circulation Activated | 58.04 | 58 | 10 of 15 |
| Centralized | 90.20 = 86×0.40 + 88×0.35 + 100×0.25 | 90 | 14 of 15 |
| Vertically Integrated | 0 | 0 | 1 of 15 |
| Luminous | 86 = 89×0.40 + 77×0.30 + 91×0.30 | 86 | 15 of 15 |

Monumental check from the box: height 20.676 ft gives `(20.676−8)/32×100 = 39.61`, rounded to 40. Volume 1,600 ft³ gives `(1600−400)/11600×100 = 10.34`, rounded to 10. Dominance 1.004 gives `(1.004−0.4)/2.1×100 = 28.76`, rounded to 29. Weighted sum 26.75.

Vertically Integrated is a genuine zero for this mesh: no successive substantial walkable levels were linked. It is not the empty-cell placeholder. Convergent is not zero; 40% of its path entries reach the chosen end, in one of eight direction bins (raw 0.125, rounded to 13).

## Registry order for all 15 original files

Rank 1 is weakest. Scores are `absoluteScore`.

Open Volume: Lobby Sequential 18.72; Gathering Linear 45.46; Lobby Linear 46.31; Gathering Plate 47.43; workspace cascaded 61.49; Lobby Ground Field 62.69; workspace undulating 64.21; Lobby Vertical Void 67.39; Gathering Stepped 75.18; Gathering Void Field 82.49; workspace flat deep-plate 82.93; Lobby Continuous Hall 88.80; workspace void 92.71; workspace open hall 93.71; Gathering Room within Volume 99.72.

Convergent: Room within Volume 0; workspace open hall 0; Lobby Continuous Hall 32.15; workspace flat deep-plate 38.45; Gathering Stepped 40.05; Lobby Vertical Void 44.10; workspace undulating 45.15; workspace void 47.20; Gathering Plate 47.30; Lobby Ground Field 48.15; workspace cascaded 53.50; Gathering Void Field 56.70; Lobby Linear 64.55; Gathering Linear 73.25; Lobby Sequential 74.70.

Sculptural: Lobby Ground Field 45.50; Gathering Linear 46.35; workspace cascaded 47.10; Lobby Vertical Void 48.30; Lobby Linear 48.40; workspace undulating 50.05; Lobby Sequential 50.20; workspace flat deep-plate 52.05; Room within Volume 55.30; Gathering Plate 56.40; workspace open hall 60.80; Gathering Void Field 61.20; Gathering Stepped 64.20; workspace void 64.35; Lobby Continuous Hall 66.10.

Visually Connected: Lobby Linear 21.90; Lobby Sequential 22.38; Lobby Ground Field 22.85; Lobby Vertical Void 23.18; workspace cascaded 23.43; workspace undulating 24.76; Gathering Linear 26.41; workspace open hall 28.81; Gathering Stepped 29.87; Gathering Plate 29.90; Gathering Void Field 30.41; workspace flat deep-plate 35.57; Room within Volume 38.38; workspace void 38.47; Lobby Continuous Hall 41.65.

Surreal: Lobby Vertical Void 19.50; Lobby Ground Field 22.65; Gathering Plate 25.95; Gathering Stepped 26.05; workspace cascaded 26.45; Gathering Void Field 27.25; Lobby Linear 28.40; Lobby Sequential 29.10; Room within Volume 29.95; workspace flat deep-plate 31.55; workspace undulating 31.65; Gathering Linear 32.70; Lobby Continuous Hall 34.20; workspace open hall 34.40; workspace void 36.30.

Monumental: workspace void 26.65; Lobby Continuous Hall 26.75; Gathering Void Field 27.70; workspace open hall 28.05; Gathering Stepped 29.10; Room within Volume 30.80; Lobby Linear 31.15; Gathering Plate 31.20; workspace flat deep-plate 31.90; workspace undulating 31.90; Lobby Ground Field 31.95; Lobby Sequential 32.30; Lobby Vertical Void 33.65; workspace cascaded 34.70; Gathering Linear 37.50.

Hierarchical: workspace undulating 4.20; workspace flat deep-plate 5.70; Gathering Plate 6.20; Lobby Sequential 6.25; Lobby Linear 6.35; Lobby Ground Field 8.75; workspace open hall 9.80; Lobby Vertical Void 10.90; Gathering Stepped 11.40; Gathering Linear 12.15; workspace cascaded 13.40; Room within Volume 21.50; workspace void 28.45; Gathering Void Field 29.50; Lobby Continuous Hall 37.15.

Sequential: Lobby Continuous Hall 49.67; Gathering Linear 55.00; Lobby Linear 55.00; Lobby Sequential 56.67; workspace flat deep-plate 58.33; Gathering Plate 61.67; workspace undulating 61.88; Gathering Void Field 62.14; workspace void 62.78; workspace cascaded 63.46; workspace open hall 67.50; Lobby Vertical Void 68.02; Lobby Ground Field 68.27; Room within Volume 74.77; Gathering Stepped 82.67.

Circulation Activated: workspace open hall 11.59; Room within Volume 27.89; Lobby Vertical Void 31.79; Gathering Stepped 37.10; workspace flat deep-plate 39.24; Gathering Plate 41.28; Lobby Ground Field 48.79; workspace void 49.99; workspace undulating 50.01; Lobby Continuous Hall 58.04; Gathering Void Field 69.15; workspace cascaded 69.82; Lobby Linear 79.40; Lobby Sequential 89.58; Gathering Linear 92.58.

Centralized: workspace flat deep-plate 38.00; Room within Volume 43.35; Gathering Linear 61.50; workspace open hall 64.65; Lobby Linear 65.25; Gathering Plate 67.75; Lobby Vertical Void 69.25; workspace cascaded 75.05; Gathering Stepped 78.15; workspace void 80.05; Lobby Sequential 81.75; Lobby Ground Field 87.20; Gathering Void Field 89.65; Lobby Continuous Hall 90.20; workspace undulating 93.10.

Vertically Integrated: Lobby Continuous Hall 0; Room within Volume 45.00; workspace cascaded 45.00; workspace void 45.00; workspace open hall 66.89; Gathering Linear 72.50; Gathering Void Field 85.00; Gathering Plate 93.18; Gathering Stepped 97.73; workspace undulating 97.73; then five forms at 100, filename order: Lobby Vertical Void, Lobby Ground Field, Lobby Linear, Lobby Sequential, workspace flat deep-plate.

Luminous: Lobby Vertical Void 37.30; Lobby Sequential 47.40; Lobby Linear 49.40; Gathering Linear 52.00; Gathering Plate 53.20; workspace undulating 54.90; workspace cascaded 58.10; Gathering Stepped 62.30; Lobby Ground Field 63.90; workspace flat deep-plate 65.90; Gathering Void Field 66.50; workspace void 75.00; workspace open hall 75.10; Room within Volume 76.40; Lobby Continuous Hall 86.00.

The two equal Sequential scores and the two equal Monumental scores of 31.90 are broken by filename, as are the Vertically Integrated ties at 45 and at 100.
