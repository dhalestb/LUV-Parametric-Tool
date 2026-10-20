# D. Spatial evidence

The comparison viewer can draw gold, cyan, and slate marks. Those marks are built afterward by `descriptorFigures` (`descriptorV2.ts` lines 1259–1553) from the same occupied cells. The scorer itself returns only names, raw values, rounded values, and weights. It does not return the cells, rays, or triangles that produced each component.

Classification used below:

- Traceable: the current figure uses the same cells or rays the score uses, and the viewer can draw them.
- Discarded: the score computes the geometry, then drops it.
- Reproducible: the same function can be instrumented to keep coordinates without changing the formula.
- Different algorithm: a faithful drawing needs to record samples the current figure does not record.
- Not locatable: the term is a single box or a ratio with no place on the form.

Recommended view is the clearest of Isometric, Section, Plan, or Elevation. The mesh should stay visible. Marks should sit on the original surface or on the cells the term actually counted.

## Open Volume

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Surface Clearance | `measureSurfaceClearance` keeps prisms, outlines, dimension segments, and per-surface sample statistics (lines 575–585). The viewer draws gold only where credit is above 0 and the face is not a ceiling | Traceable for the eligible floor samples. The ceiling samples that still affect the score are omitted from the drawing on purpose | Gold volume on each credited sample, from 0.05 ft above the triangle to the credited height, clipped at the form top. A separate slate mark on ceiling samples that scored as exterior-open so the score and the picture tell the same story | Section through the occupied gap. Isometric for the whole pattern |

## Convergent

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Destination Agreement | The figure draws up to four shortest paths and one destination cell (lines 1317–1330). The score counts every entry | Reproducible. The figure is a subset | All entry-to-destination polylines, gold at the chosen target | Plan |
| Approach Direction Diversity | Sector index is computed and discarded (lines 377–378) | Discarded | A plan tick at each entry, colored by its 45° bin | Plan |
| Path Continuity Into Destination | Straightness is a scalar per path. The figure shows the path but not the straightness value | Reproducible | The same polylines, with a second straight chord in slate where the path bends | Plan |

## Sculptural

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Adjacent Normal Variation | Edge pairs and angles are local to `adjacentDihedral` and discarded. The figure does not draw them. The legend says the cream surface carries this test | Discarded | Short ticks on shared edges, gold where the fold is large | Isometric |
| Normal Orientation Entropy | Bin counts are discarded | Discarded | Color the original triangles by normal bin. Entropy itself is one number and should stay in the caption | Isometric |
| Sectional Area Variation | Per-Z counts are discarded. The figure paints cells on levels whose count differs from the mean by more than 35% (lines 1370–1388), which is not the coefficient of variation | Different algorithm | A stack of plan areas, or a section with each Z band labeled by cell count | Section |
| Plan Asymmetry | The figure tests the same mirror rule on a sample of cells | Reproducible, currently sampled | Gold on cells whose mirror cell is absent | Plan |

## Visually Connected

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Zone-to-Zone Visibility | The figure tests `rayClear` between the first sample of up to 8 zones (lines 1391–1407). The score also requires the enclosure, open-midpoint, or under-cover test, and it uses up to three samples per zone | Different algorithm | Only the rays that pass the score’s acceptance test. Cyan if accepted, slate if blocked | Plan, with a section for vertical pairs |
| Mean Clear Sightline Length | Distance is computed and discarded | Discarded | Dimension the accepted rays | Plan |
| Visible Zone-Pair Fraction | Pair success is a boolean inside the loop | Discarded | Gold anchors for zones that have at least one accepted pair | Plan |

## Surreal

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Non-Axis-Aligned Surface | Per-triangle area is discarded. The figure does not color the mesh | Discarded | Color original triangles gold when the dominant normal component is below 0.85 | Isometric |
| Upper / Lower Centroid Shift | The figure draws one cyan segment between the two centroids (lines 1433–1440) | Traceable as a summary line. The cells in each half are not marked | Gold on the upper half, slate on the lower half, cyan between centroids | Isometric |
| Component Scale Variance | Plate areas are discarded. Hierarchical’s figure colors plates, Surreal’s figure does not | Discarded | Color plates by area | Plan |
| Cantilevered Offset | The figure marks unsupported cells with the same 3×3 test, capped at 60 (lines 1418–1444) | Traceable, sampled when the count is large | All unsupported cells in gold | Isometric |

## Monumental

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Calibrated Height | The figure draws one vertical segment from minimum Z to maximum Z of the occupied cells (lines 1511–1523). The score uses the mesh bounding box, which can differ from the voxel span | Different algorithm | A vertical dimension on the mesh box, labeled in feet | Elevation |
| Calibrated Volume | No cell list is retained for this term. The figure draws the occupied-cell box, while the score sums cell volume | Not locatable as a volume. The box is a different object | State the cubic feet in the caption. Do not paint the box as if it were the measured volume | Elevation, with the caption |
| Vertical Dominance | One ratio of the box | Not locatable beyond the box edges | The same height line and the longer plan edge | Elevation and Plan |

## Hierarchical

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Primary / Secondary Difference | The figure flood-fills the same plates and colors the largest gold and the second cyan, 40 cells each (lines 1449–1457) | Traceable, sampled | Both full plates, with the area numbers | Plan |
| Secondary / Tertiary Difference | Third plate is slate in the same figure | Traceable, sampled | The third plate in slate | Plan |
| Largest-Region Dominance | The ratio is not drawn. The largest plate is | Reproducible | Gold plate plus the caption share | Plan |

## Sequential

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Meaningful Graph Depth | The figure draws the longest zone path (lines 1460–1477) | Traceable | Cyan links between zone centroids, gold at the ends | Plan, section if Z changes |
| Ordered Zones on Primary Path | Same path. Zone membership is discarded after the centroids are drawn | Reproducible | Outline each zone on the path | Plan |
| Spatial Transition Diversity | The change-type set is discarded | Discarded | Label each hop with the change that fired: elevation, scale, width, direction, enclosure | Plan and Section |
| Path Legibility | Extra edges are counted and discarded | Discarded | Draw the extra edges in slate beside the main path | Plan |

## Circulation Activated

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Reachable Meaningful Space | The figure shows a sample of the largest route and its junctions (lines 1480–1508). It does not show which zone cells were touched | Different algorithm | Cyan route, gold where a zone cell touches it | Plan |
| Route Network Continuity | The largest component is in the figure. Detached route cells are not | Reproducible | Slate for route cells outside the largest component | Plan |
| Useful Intersection Density | Junctions with 3 or more branches are gold. Clustering within distance 2 is not drawn | Reproducible | One gold mark per cluster, not per cell | Plan |
| Space-to-Route Interface | Touch test is discarded | Discarded | Highlight zone cells that neighbor any route cell | Plan |
| Dead-End Quality | Degree ≤ 1 cells are counted and not marked | Discarded | Slate caps on dead-end cells | Plan |

## Centralized

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Center Concentration | The figure draws a cyan line from the box center to the mass center (lines 1333–1350) | Traceable | That line, with both endpoints marked | Plan |
| Radial Occupancy Falloff | Inner and outer counts are discarded. The figure colors cells inside half the radius, which is the next term’s radius, not the 0.33 and 0.66 bands | Different algorithm | Three plan bands at 0.33 and 0.66 of the farthest cell | Plan |
| Inner-Zone Dominance | The half-radius split in the figure matches this term, on a sample of 90 cells | Traceable, sampled | Gold inside half radius, slate outside | Plan |

## Vertically Integrated

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Traversable Vertical Connectivity | Reachability is discarded. The figure only marks a walkable cell that has another walkable cell directly above or below (lines 1353–1367). Gathering Linear scores 72.5 and the current figure draws nothing, because the score’s links include diagonal and walled connections | Different algorithm | Draw the graph edges that actually connect successive levels | Section |
| Cross-Level Spatial Connection | Shaft cells are computed inside `atriumShafts` and discarded | Discarded | Gold on the shaft columns that overlap a level pair | Section |
| Vertical Void Continuity | Same discarded shafts | Discarded | The largest shaft, with its height labeled | Section |
| Reachable Level Diversity | Reached level ids are discarded | Discarded | Color reached plates cyan and unreached plates slate | Section |

## Luminous

| Component | Evidence | Status | Recommended drawing | View |
| --- | --- | --- | --- | --- |
| Upward Hemispherical Exposure | The figure draws one vertical ray from 8 walkable samples (lines 1536–1548). The score uses up to 36 samples and 10 directions | Different algorithm | The 10 directions from each scored sample. Cyan if clear, slate if blocked | Isometric |
| Sky-Facing Opening | Upward triangles and their vertical rays are discarded | Discarded | Gold on upward triangles whose vertical ray is clear | Plan |
| Daylight Penetration | Hit distance is discarded. The figure’s single vertical ray is not the scored set | Discarded | Length of each scored ray, cut at the first occupied cell | Section |

## What should not be drawn from the aggregate score

A high rank does not identify a region. Monumental volume, path legibility, entropy, and dead-end quality are single ratios. Painting the whole form gold because the composite is high would invent a location the evaluator does not have.
