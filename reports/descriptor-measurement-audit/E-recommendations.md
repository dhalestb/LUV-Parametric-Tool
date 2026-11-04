# E. Recommendations

No formula, weight, or drawing was changed for this audit. The order below is the order to consider later, after review.

## 1. Retain unchanged

These terms measure what their formulas say, and the formula is a fair description of the geometry they use.

- Centralized, all three terms. They locate the occupied mass. Document the 0.25 and disk-area assumptions. Do not retune them from this set.
- Sculptural’s Normal Orientation Entropy and Adjacent Normal Variation, after the unit string is corrected from 60° to 90°. The math divides by 90 (`descriptorV2.ts` line 957). The label is the defect, not the ratio.
- Surreal’s Non-Axis-Aligned Surface. It is an area share of the original triangles.
- The registry rule: all 15 original OBJs, rank 1 weakest, filename tie-break (`registryOpenVolume.ts` lines 72–74). The absolute score should remain a fixed formula, not a percentile.

## 2. Better documented

The behavior is intentional in the code and easy to misread.

- Open Volume counts a ray with no overhead hit as fully open, including exterior air above the roof (`clearanceAccessCredit`, line 370). The drawing’s ceiling skip does not apply to the score.
- Monumental volume is occupied-cell count times 8 ft³ at a 2 ft cell (`analyze.ts` line 423), not the interior of the building. Height is the mesh bounding box (`monumental`, lines 1053–1056).
- Walkable cells are unoccupied cells sitting on an occupied cell (`walkableCells`, lines 71–86). Convergent, Sequential, Circulation Activated, Visually Connected, Vertically Integrated, and part of Luminous all inherit that definition.
- Dead-End Quality stores the dead-end fraction and scores one minus that fraction (lines 664–670).
- Cross-Level Spatial Connection and Vertical Void Continuity store a cell count in `raw` and score a different ratio (lines 291–293).
- Convergent, Sculptural, Surreal, Monumental, Hierarchical, and Centralized rank on rounded component integers. The other descriptors rank on unrounded `precise`. Say so next to the number.
- A single hierarchical plate forces dominance to 0 (line 893).
- Empty occupied cells make Centralized score 100 by substituting `[0,0,0]` (lines 1157 and 1168). Monumental can score from the bounding box alone.

## 3. Instrument for spatial evidence

Keep the formulas. Return the coordinates they already compute.

- Surface Clearance: also draw the ceiling and sub-5 ft samples that affect the score, in slate, so the picture matches the number.
- Convergent: keep every entry path and its direction bin.
- Sculptural: keep edge folds and normal bins on the original triangles.
- Visually Connected: keep only rays that pass the acceptance test at lines 788–791, not the simpler `rayClear` preview.
- Surreal: color off-axis triangles and the unsupported cells.
- Sequential: label the change type on each hop.
- Circulation Activated: draw dead ends, detached route cells, and junction clusters.
- Vertically Integrated: draw the links and shafts the score uses. The current figure requires a directly stacked walkable cell, so Gathering Linear can score 72.5 and draw nothing.
- Luminous: draw the 10 scored directions and the upward triangles, not one vertical preview ray.
- Centralized falloff: draw the 0.33 and 0.66 bands. The current gold disk is the half-radius term.

## 4. Reconsider mathematically

Do this only after the documentation in section 2 is accepted or rejected. Do not refit weights to make the 15 files look more separated.

- Open Volume’s fully-open credit for a miss. If the intent is interior volume, a miss above the roof should be classified as exterior air and kept out of the numerator. If the intent is overhead clearance wherever a person could stand, the current credit is consistent and should stay.
- Monumental volume. Replace shell-voxel volume with a stated quantity: bounding-box volume, or a voxel flood of enclosed cells. The current mixture of box height and shell volume answers two different questions.
- Hierarchical dominance on a one-plate form. Scoring it 0 punishes the most dominant case.
- Convergent’s hard zero below 4 path cells and 2 entries. A continuous ratio would not drop Room within Volume and workspace open hall to a tied zero.
- The raw-versus-score mismatch on the two atrium terms. Store the ratio that is weighted.
- One rounding rule. Either every component keeps `precise`, or every component rounds before weighting.

## 5. Replace only after further validation

These names claim more than any revision of the current samples can prove. Replacing them needs a new definition and a check against the original forms, not a weight change.

- Circulation Activated, if the claim is that a person can walk it. The current route graph has no headroom, width, or floor continuity.
- Vertically Integrated, if the claim is an atrium or a stair. The current links are voxel adjacency and holes.
- Luminous, if the claim is daylight. The current test is upward openness of the occupancy grid.
- Sequential and Hierarchical, if the claim is rooms in order or primary and secondary space. Both are plate and bin statistics.
- Visually Connected, if the claim is what a person sees. The current rays are grid lines between walkable bins.

Sculptural and Centralized do not need replacement. They need the evidence and the label corrections above.

## Descriptor Formulas.docx

That document was not in this worktree and was not in the assignment `Cursor-APP` tree that could be searched. No comparison of metric definitions, weights, or normalization against that document is possible. Nothing here recommends reverting to it.

## Files this conclusion rests on

- `src/components/evaluations/descriptorV2.ts`
- `src/components/evaluations/objDescriptorAnalysis.ts`
- `src/components/evaluations/openVolumeClearance.ts`
- `src/components/evaluations/descriptorRank.ts`
- `src/components/lattice/analyze.ts`
- `src/components/lattice/types.ts`
- `src/components/lattice/objFidelity.ts`
- `src/server/registryOpenVolume.ts`
- `reports/descriptor-measurement-audit/current-evaluator-dump.json`
