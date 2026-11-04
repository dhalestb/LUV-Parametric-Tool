# A. Master descriptor measurement matrix

Read-only audit of the working tree at `C:\Users\DHale\.codex\worktrees\descriptor-comparison-clean\Cursor-APP`.

- Branch: `feature/descriptor-comparison-clean`
- HEAD: `b027deff90bdb3371221ee8e538f34652c18e1a7`
- Algorithm version: `DESCRIPTOR_ALGORITHM_VERSION = "v3.5"` in `src/components/evaluations/descriptorV2.ts` line 7
- Active OBJ path: original mesh is supplied, so Open Volume is Surface Clearance only. The older four-term Open Volume blend is not used.

Numerical values in report B come from running this same `evaluateTileModel` on the 15 original OBJs. That dump is `current-evaluator-dump.json` in this folder. It is not an alternate formula.

## How a score is assembled

`absoluteScore = Σ (precise_i × weight_i) / Σ weight_i` (`absoluteScoreOf`, `objDescriptorAnalysis.ts` lines 242–245).

`precise` is the unrounded 0–100 term when the draft sets it. Several descriptors never set `precise`, so the rounded integer `value` is used instead (`fromDrafts`, lines 260–268). The displayed `score` is `clamp100(absoluteScore)`, which rounds to an integer (line 40 and line 279). Registry rank uses `absoluteScore`, not that rounded display score (`registryOpenVolume.ts` lines 72–74).

## Pipeline shared by every descriptor

| Stage | What it does | Where |
| --- | --- | --- |
| Parse | OBJ text to positions and faces | `parseObj`, called from `registryOpenVolume.ts` lines 54–55 |
| Up axis and scale | Registry and the recorded pair use Y-up and 1 file unit = 1 foot. Spec Z is architectural up: file `(x, y, z)` becomes `(x, -z, y)` | `objFidelity.ts` lines 9–16; `registryOpenVolume.ts` lines 56–61 |
| Raster | Triangles are sampled into occupied cells. Anchor is plan center and minimum Z | `analyze.ts` `rasterize` lines 209–310; anchor formula repeated at `objFidelity.ts` lines 58–59 |
| Cell size | `CELL_FEET = 2`. Becomes 4 only if the span exceeds 80 cells or the raster exceeds 12,000 cells | `types.ts` line 2; `analyze.ts` lines 370–376 |
| Occupied volume | `occupiedCellCount × cellFeet³`. This is the volume of surface voxels, not the enclosed interior | `analyze.ts` line 423 |
| Triangles for descriptors | Each OBJ face is fanned into triangles in cell-index space, with area and unit normal | `sourceTriangles`, `objDescriptorAnalysis.ts` lines 334–358 |
| Score | `evaluateTileModel` lines 417–455 calls clearance plus `measureSpatialDescriptors` | `descriptorV2.ts` lines 1153–1186 |
| Rank | All `.obj` files in the registry directory. Sort by `absoluteScore` ascending, then filename. Rank 1 is weakest | `registryOpenVolume.ts` lines 8–9 and 48–75 |

Walkable cell, used by Convergent, Sequential, Circulation Activated, Visually Connected, Vertically Integrated, and Luminous: an unoccupied cell whose cell directly below is occupied, searched inside the occupied bounds and one cell above the top (`walkableCells`, lines 71–86). That is the air cell sitting on the raster shell. It is not a flood of interior rooms and it is not a person-access test.

## Active components

Forty scored terms are implemented. With a mesh source, Open Volume contributes one term. The other eleven contribute 39 terms. Weights below are the weights in source. They already sum to 1 within each descriptor.

### Open Volume

Active only when a mesh source is passed. Weight 1. `scoreDescriptors`, lines 285–295.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Surface Clearance | Share of upward surface whose overhead gap is tall enough to enter | Area-weighted mean of per-sample credit. Credit is 1 if the upward ray hits nothing, 0 if clearance ≤ 5 ft, otherwise `(clearFeet − 5) / 5`, capped at 1 when clearance ≥ 10 ft | 1 | Share of qualifying upward area, 0–1. Displayed × 100 | Already 0–1, then × 100. Not rounded before ranking | Original triangles. Upward if `nz / length ≥ 0.68`. Patches joined on vertices quantized to 0.02 ft. Patch kept if projected XY area ≥ 8 ft² | Centroid, a point near the highest vertex, plus a barycentric grid. Sample count is `clamp(1, 6, ceil(xyArea / 4))` | First overhead triangle after a 0.05 ft epsilon. A hit within 0.75 ft is treated as the same skin. A hit within 3 ft of that skin is skipped when the next hit is absent or more than 3 ft higher | `clearanceAccessCredit` lines 369–374; `rateSurfaceClearance` lines 380–391; `tracePoint` lines 298–315; `samplePoints` lines 230–258; `clusterSurfaces` lines 188–228. Constants lines 8–22 |

Assumption: no overhead surface means fully open, including the exterior air above a roof. The score does not remove ceiling faces. The gold drawing does skip ceilings and samples at or below 5 ft. Those skips do not change the number.

Inactive fallback, used only when no mesh source is passed (`scoreDescriptors` lines 296–302): Architectural Open Space 0.35, Permeability 0.30, Interstitial Space 0.25, Low Mass 0.10, and Enclosed Void at weight 0. OBJ upload and the registry pass the mesh, so this blend is not the current rating.

### Convergent

`corridorScore`, `descriptorV2.ts` lines 303–391. These drafts do not set `precise`. The integer `value` is what gets weighted.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Destination Agreement | Entries that can reach one dominant end | `entries whose shortest path reaches the chosen target / entries` | 0.45 | Fraction of path entries | × 100, then round | Walkable graph. A cell is path-like when its same-level degree is ≤ 2 and it does not touch a room component of ≥ 6 cells. Rooms are cells with degree ≥ 3 | Every path-like cell. Target is the junction reached by the most entries, or one non-entry if there is no junction | Occupied voxel bounds. Returns all zeros if path-like cells < 4 or entries < 2 | 329–388 |
| Approach Direction Diversity | Approaches arriving from different plan directions | `unique 45° sectors / 8`. Sector is `round(((atan2(dy, dx) + π) / (π/4))) mod 8` from entry to destination | 0.35 | Count of sectors, 0–8, stored as a fraction of 8 | × 100, then round | Same paths | Entries that have a path | Same | 377–388 |
| Path Continuity Into Destination | How straight those paths are | Mean of `min(1, straight-line length / (path hops))` | 0.20 | Mean straightness, 0–1 | × 100, then round | Shortest path on the filtered graph (`shortestPath`, lines 393–413) | Same entries | Same | 379–388 |

### Sculptural

`sculptural`, lines 960–989. No `precise` field. Dihedral helper lines 931–958. Section helper lines 897–905. Mirror helper lines 907–920.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Adjacent Normal Variation | How sharply neighboring faces fold | Area-weighted mean angle between normals of triangles that share an edge, divided by 90°. The stored unit string says “/ 60°”. The code divides by 90 | 0.30 | 0–1 fold ratio. Unit label is wrong | × 100, round. 0 if corners are missing or no edge is shared | Original triangles in cell-index space, including corners | Every shared edge. Only the first two triangles on an edge are paired | Whole mesh | 931–958, 972–973, 984 |
| Normal Orientation Entropy | How many different directions the surface faces | Shannon entropy of area in 0.5-normal bins, divided by `ln(26)` | 0.25 | 0–1 | × 100, round | Triangle area and unit normal | All triangles | Whole mesh | 966–979, 985 |
| Sectional Area Variation | Whether successive heights have different amounts of mass | Coefficient of variation of occupied-cell counts per Z, divided by 0.75, capped at 1 | 0.25 | 0–1 | × 100, round | Occupied voxels, grouped by Z index | Every occupied cell | Occupied voxel column | 897–905, 981, 986 |
| Plan Asymmetry | Whether the mass has a mirror across the bounding-box center | Unmatched X-mirror tests plus unmatched Y-mirror tests, divided by `2 × cell count` | 0.20 | 0–1 of mirror tests that miss | × 100, round | Occupied voxels. Mirror index is `round(mid + (mid − coordinate))` | Every occupied cell, two tests each | Occupied bounds | 907–920, 982, 987 |

### Visually Connected

`visuallyConnected`, lines 729–811. Uses `metric()`, so ranking uses the unrounded 0–100 value. Zones: `visualZones`, lines 694–727. Ray: `rayClear`, lines 675–692.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zone-to-Zone Visibility | Share of tested sightlines that stay clear and look architectural | `accepted clear rays / all rays between zone samples` | 0.45 | Fraction of rays | × 100, unrounded precise | Walkable cells binned by 3. A bin needs ≥ 3 cells. Up to 3 samples per zone: centroid-nearest, min X, max X | Every pair of zones whose anchor samples are at least 2 cells apart, then every sample pair | A clear ray counts only if the midpoint is neither walkable nor occupied, or either zone has enclosure ≥ 0.15, or ≥ 35% of the ray has occupied cells within 3 cells above it | 767–807 |
| Mean Clear Sightline Length | How long the accepted sightlines are | Mean, over visible zone pairs, of the longest accepted ray, divided by the occupied plan diagonal, capped at 1 | 0.30 | Length / plan diagonal | × 100 | Same rays. Distance is in cell indices | Same | Same diagonal from occupied bounds | 738, 794–808 |
| Visible Zone-Pair Fraction | Share of separated zone pairs that have at least one accepted sightline | `visible pairs / relevant pairs` | 0.25 | Fraction of pairs | × 100 | Same | Same | Pairs closer than 2 cells are ignored | 775–809 |

If fewer than 2 zones exist, all three terms are 0 (lines 731–736).

### Surreal

`surreal`, lines 991–1043. No `precise` field.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Non-Axis-Aligned Surface | Surface that is not facing an axis | Area whose largest absolute normal component is below 0.85, divided by total triangle area | 0.30 | Area share | × 100, round | Original triangle normals and areas | All triangles | Whole mesh | 992–1001, 1038 |
| Upper / Lower Centroid Shift | The upper half of the mass is offset from the lower half | Plan distance between the centroid of cells at or below the median Z and the centroid of cells above it, divided by the occupied plan diagonal, capped at 1 | 0.25 | Shift / diagonal | × 100, round | Occupied voxels | All cells, split at the median Z | Occupied bounds | 1003–1012, 1039 |
| Component Scale Variance | Plates of very different sizes | Coefficient of variation of connected plan-plate areas, divided by 1.2, capped at 1. A plate is a 4-connected component on one Z with area ≥ 2 | 0.25 | CV / 1.2 | × 100, round | Occupied voxels | `plates`, lines 850–879 | Per Z level inside the occupied set | 1013–1016, 1040 |
| Cantilevered Offset | Upper cells with no mass anywhere below them in a 3×3 plan neighborhood | Unsupported upper cells / upper cells. The lowest Z is excluded from the numerator and the denominator | 0.20 | Fraction of upper cells | × 100, round | Occupied voxels. Support searches every lower Z in the 3×3 | Every cell above the minimum Z | Occupied bounds | 1017–1036, 1041 |

### Monumental

`monumental`, lines 1045–1068. No `precise` field. Height and plan use the mesh bounding box in feet when `bboxFeet` is passed, which `evaluateTileModel` always does (lines 442). Volume uses occupied-cell volume, not the box volume.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Calibrated Height | Absolute height | `(bboxZ − 8) / (40 − 8)` | 0.40 | Feet. 8 ft maps to 0. 40 ft maps to 100 | × 100, clamp, round | Mesh axis-aligned bounds in spec feet | None. One box | The mesh bounds, not the voxel span | 1053–1056, 1064 |
| Calibrated Volume | Absolute bulk | `(occupiedVolumeFeet − 400) / (12000 − 400)` | 0.35 | Cubic feet of occupied voxels. 400 maps to 0. 12,000 maps to 100 | × 100, clamp, round | `occupiedCellCount × cellFeet³` | None | Surface voxels only | 1057–1059, 1065 |
| Vertical Dominance | Tower versus slab | `height / max(bboxX, bboxY)`, then `(ratio − 0.4) / (2.5 − 0.4)` | 0.25 | Height / longer plan side. 0.4 maps to 0. 2.5 maps to 100 | × 100, clamp, round | Mesh bounding box | None | Mesh bounds | 1060–1066 |

### Hierarchical

`hierarchical`, lines 881–895. Plates from lines 850–879. No `precise` field.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Primary / Secondary Difference | One plate is much larger than the next | `(largest − second) / largest`. 0 if either is missing | 0.40 | Fraction of the largest plate | × 100, round | Connected occupied cells on one Z, 4-neighbor, area ≥ 2 | Every occupied cell | Per Z, inside occupied cells | 887, 891 |
| Secondary / Tertiary Difference | The second plate is much larger than the third | `(second − third) / second`. 0 if either is missing | 0.35 | Fraction of the second plate | × 100, round | Same plates | Same | Same | 888, 892 |
| Largest-Region Dominance | The biggest plate’s share of all plate area | `largest / sum of plate areas`, but the score is forced to 0 when fewer than 2 plates exist | 0.25 | Area share | × 100, round, then zeroed for a single plate | Same | Same | Same | 889–893 |

### Sequential

`sequentialAndCirculation`, lines 545–601. Zones: `significantZones`, lines 478–506. Path: `longestSignificantPath`, lines 442–463. Uses `metric()`.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Meaningful Graph Depth | How many zone steps the longest route has | `hops / (hops + 4) × 100` when the path has more than one zone, else 0. Raw stored value is the hop count | 0.35 | Zone hops | Saturating: 4 hops ≈ 50, and more hops approach 100 | Walkable cells in bins of 5 plan cells by 2 Z cells. Bins under 4 cells are dropped. Edges exist when the walkable graph links two bins | Longest path inside each connected zone component, by two breadth-first walks | Walkable cells inside the occupied bounds | 547–549, 596–597 |
| Ordered Zones on Primary Path | How many significant zones sit on that path | `min(1, pathZones / 6) × 100`. Raw is the zone count | 0.30 | Zone count | 6 zones = 100 | Same path | Same | Same | 550, 598 |
| Spatial Transition Diversity | The path changes elevation, size, width, direction, or enclosure | Count of those change types divided by 5. Elevation if centroids differ by ≥ 2 Z. Scale if cell-count ratio is ≥ 1.4 or ≤ 0.7. Width uses the same ratio on plan span. Direction if the turn’s cosine is below 0.5. Enclosure if the side-wall ratio changes by ≥ 0.15 | 0.25 | Types / 5 | × 100 | Successive zones on the path | Each hop | Same | 551–589, 599 |
| Path Legibility | The zone graph is close to a single path | `1 − min(1, extraEdges / zoneCount)` for more than one zone, else 0. Extra edges are edges beyond a tree | 0.10 | 0–1 | × 100 | Zone adjacency | All zone edges | Same | 590–595, 600 |

### Circulation Activated

Same function, lines 603–671. Route cells: `routeCells`, lines 508–543. Uses `metric()`.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reachable Meaningful Space | Significant zones touched by the largest route | Mean, over zones, of the share of zone cells that are on the largest route or adjacent to it | 0.30 | Mean share, 0–1 | × 100 | Route graph and 5×5×2 zones | Every zone cell | Walkable network | 637–639, 666 |
| Route Network Continuity | One route holds most route cells | `largest connected route / all route cells` | 0.25 | Fraction | × 100 | Route cells. A route cell has same-level degree ≤ 2 and does not border a room of ≥ 6 cells, plus cells that touch two route cells | Flood fill on route-restricted links | Same | 614–633, 667 |
| Useful Intersection Density | Junctions that are not the same junction counted twice | Clusters of route cells with ≥ 3 route neighbors, joined when within Chebyshev distance 2. Score is `clusters / (clusters + 3)`. 0 if there are no junctions | 0.20 | Clusters relative to clusters+3 | × 100 | Route graph | Junction cells only | Same | 640–658, 668 |
| Space-to-Route Interface | Zones that touch any route, not only the largest | Same touch ratio as the first term, against every route cell | 0.15 | Mean share | × 100 | All route cells | Every zone | Same | 634–636, 669 |
| Dead-End Quality | Few route dead ends | Raw is `dead-end route cells / route cells`. The score is `(1 − that fraction) × 100` | 0.10 | Dead-end fraction in `raw`. The score rewards the absence of dead ends | `(1 − raw) × 100` | Route degree ≤ 1 | Every route cell | Same | 659–670 |

### Centralized

`centralized`, lines 813–848. No `precise` field. Uses occupied mass, not walkable space.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Center Concentration | Mass centered in its box | `1 − min(1, 2 × planOffset / planDiagonal)`. Offset is the occupied centroid versus the box center | 0.40 | 0–1 | × 100, round | Occupied voxels | All cells | Occupied bounds | 814–820, 844 |
| Radial Occupancy Falloff | More cells near the middle than at the edge | `(innerRatio − outerRatio) / (innerRatio + outerRatio)`, floored at 0. Inner is radius < 0.33 of the farthest cell. Outer is radius ≥ 0.66. Each count is divided by the area fraction of a disk (0.1089 and 0.5644) | 0.35 | Signed density contrast, stored ≥ 0 | × 100, round | Plan distance from the mass centroid | All cells | Farthest occupied cell sets the radius | 821–840, 845 |
| Inner-Zone Dominance | Extra mass inside half the radius | `(share within 0.5 × max radius − 0.25) / 0.35`, floored at 0, then capped at 1 | 0.25 | Extra share. Can exceed 1 before the cap | × 100, round, cap 100 | Same radii | All cells | Same | 841–846 |

### Vertically Integrated

`verticallyIntegrated`, lines 234–296. Uses `metric()`. A level is a Z with at least 4 walkable cells and at least `max(6, 30% of the largest level)` (`levelsOf`, lines 162–173). Shafts: `atriumShafts`, lines 175–232.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Traversable Vertical Connectivity | Successive walkable plates can reach each other on the graph | Linked successive level pairs / pairs. 0 if fewer than 2 levels | 0.35 | Fraction of level pairs | × 100 | Walkable graph, including 3×3 vertical steps and walled shafts | Reachability from each level | Walkable cells | 249–262, 291 |
| Cross-Level Spatial Connection | An atrium opens between successive plates | Mean of `min(1, shaftArea / 8)` for shafts that overlap each level pair. Raw stored value is the mean shaft area in cells, not that 0–1 ratio | 0.30 | Raw: mean atrium cells. Score: mean of the capped ratio | Score is the ratio × 100. Raw is a different number | Occupied cells that leave a vertical hole through plates of ≥ 6 cells, at least 3 cells tall, shaft area ≥ 4 and ≤ 75% of the plan, and 35% of the shaft beside mass | Full column scan of the occupied bounds | Occupied bounds | 273–285, 292 |
| Vertical Void Continuity | The largest atrium is both wide and tall | `min(1, area/8) × min(1, shaftHeight / massHeight)`. Raw stored value is the shaft’s plan cell count | 0.25 | Raw: cell count. Score: product of the two caps | Product × 100 | Same shafts | Largest shaft | Occupied mass height | 270–272, 293 |
| Reachable Level Diversity | How many plates the lowest plate can reach | Reached plates / plates | 0.10 | Fraction | × 100 | Walkable graph from the lowest level | Levels only | Same | 250–263, 294 |

### Luminous

`luminous`, lines 1082–1137. Uses `metric()`. Sky directions are the 10 vectors at lines 1070–1080.

| Component | Intended characteristic | Calculation | Weight | Raw and unit | Normalization | Inputs | Sampling | Boundary | Lines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Upward Hemispherical Exposure | Walkable samples that can see upward directions | Mean, over samples, of clear sky rays / 10 | 0.40 | Fraction of rays | × 100 | Occupied cells block `rayClear`. Target is `sample + direction × max(height+2, 8)` | At most 36 walkable cells, stride `floor(count / 36)` | Rays stop at the first occupied cell. Clear means the whole segment missed | 1083–1100, 1133 |
| Sky-Facing Opening | Upward surface with open sky above it | Area of upward triangles (`normal Z ≥ 0.65`) whose vertical ray is clear, divided by sampled upward area. Without triangles, it is the share of walkable columns whose top cell sees upward | 0.30 | Area share | × 100 | Triangle centroids rounded to cell indices, started one cell above the surface | At most 48 upward triangles | Vertical ray of `height + 3` cells | 1102–1131, 1134 |
| Daylight Penetration | How far those sky rays travel before a hit | Mean of `min(1, hitDistance / massHeight)` over every sky ray, including blocked rays | 0.30 | Distance / height | × 100 | Same 10 directions and samples | Every sample × 10 | Same rays | 1085–1101, 1135 |

## What the names do not measure

None of the twelve descriptors tests door width, stair risers, guardrails, glazing transmittance, lumens, or a walking person. Open Volume is the only term that uses a stated body-height threshold, and that threshold is 5 ft of vertical clearance, not a path.
