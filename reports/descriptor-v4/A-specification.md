# A. Architectural descriptor specification — v4.1

Worktree: `C:\Users\DHale\.codex\worktrees\descriptor-comparison-clean\Cursor-APP`  
Branch: `feature/descriptor-comparison-clean`  
HEAD at start of this work: `b027deff90bdb3371221ee8e538f34652c18e1a7`  
Active algorithm: `DESCRIPTOR_ALGORITHM_VERSION = "v4.1"` (`src/components/evaluations/descriptorVersion.ts`)  
Legacy algorithm: `LEGACY_DESCRIPTOR_ALGORITHM_VERSION = "v3.5"` (unchanged formulas in `descriptorV2.ts` and `openVolumeClearance.ts`)

Coordinate system: source OBJ is Y-up, 1 unit = 1 ft. Evaluation geometry is converted once into spec feet with Z up (`fileToSpec`). Display transforms never re-enter the score.

Shared analysis (`src/components/evaluations/v4/`):

| Stage | What it produces | Sampling |
|---|---|---|
| `buildAnalysisMesh` | Triangle list in spec feet, FNV source hash, bounds | Every non-degenerate face fan |
| `TriangleGrid` | 2 ft uniform grid, Möller–Trumbore double-sided, 3D DDA | Rays and vertical columns |
| `sampleFloors` | 1 ft plan columns; upward \|nz\| ≥ 0.68; slab gap 1 ft | Floor class: obstructed ≤ 5 ft / sheltered / openVoid (no hit above, enclosure ≥ 0.5) / exposed (roof band 1.5 ft or enclosure < 0.25) / uncertain |
| `buildLevels` | Elevation clusters, 1.5 ft tolerance, ≥ 16 ft² | Occupiable uncovered decks and perimeter branches are levels even without stairs. Roof caps (column lids near the mesh top with extra occupiable footprint < 16 ft²) are excluded |
| `buildCirculationNetwork` | Nodes on eligible floors including uncovered decks that are not roof lids; 8-neighbour walk ≤ 0.35 ft / step ≤ 0.8 ft; chest-height 3 ft clear | Entries = lowest-level openings. `potentialInterfaces` = upper-level openings. Level links: verified BFS step chain / potential plan overlap ≤ 4 ft and rise ≤ 16 ft / disconnected. Potential is never a stair |
| `sameLevelVisibility` / `crossLevelVisibility` | Eye-height mesh rays | Default eye 5.5 ft, 3 ft stride, 24 targets |
| `analyzeVoids` | Free intervals passing ≥ 2 levels | Continuity = min(1, area/64) × span fraction |
| `lightExposure` | 9 overhead + 8 lateral rays from 4 ft above interior nodes | Exposed roof probes excluded |

A missing architectural characteristic scores **0 and is still ranked** among all 15 forms. Floor count does not determine eligibility. NaN is reserved for a genuine processing failure (empty mesh, no triangles). Registry filenames are matched by token-sorted identity so session names such as `void workspace.obj` still receive the official rank. Potential future inter-form connections are drawn gray and are never credited as verified walkable routes.

---

## 3.1 Open Volume — Verified Geometric Measurement

**Intent.** Amount and quality of spatial volume that is open, unobstructed, and potentially occupiable.

**v3.5.** Single term: area-weighted surface clearance. Exterior-open (no hit above, including roofs) counted as fully open. Weight 1.0.

**v4.** Three terms on classified floor samples. Exterior roof exposure is excluded, not credited.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Sheltered Clearance Share | Covered floor with usable height | Σ(sheltered area × credit) / interior area; credit 0 at ≤ 5 ft, 1 at ≥ 10 ft | share | × 100 | 0.45 | No interior floor → unavailable |
| Open Void Share | Interior floor open to sky and laterally enclosed | open-void area / interior area | share | × 100 | 0.25 | No interior floor → unavailable |
| Clearance Volume | Size of usable clear volume | Σ area × min(clearance, 20 ft) over sheltered and open-void | ft³ | 0 → 0, 8000 → 100 | 0.30 | No interior floor → unavailable |

**Diagram.** Gold qualifying clearance and translucent volume; light blue open void; pale aqua low sheltered / uncertain; gray obstructed and excluded exterior. Section and isometric.

## 3.2 Convergent — Verified Geometric Measurement (unavailable without two entries)

**Intent.** Meaningful approaches converge on a shared destination.

**v3.5.** Low-degree voxel-shell paths to a dominant graph end. Destination Agreement 0.45, Approach Direction Diversity 0.35, Path Continuity 0.20. Zero when the graph had too few chains.

**v4.** Entries = lowest-level boundary nodes with an open outward 3 ft chest ray, clustered by primary side. Destination = clearance-weighted floor concentration within 8 ft. Routes are shortest paths on the floor network. Unsupported entries are candidates, not routes.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Destination Agreement | Entries whose floor route reaches the destination | verified / entries | share | × 100 | 0.40 | < 2 entries or no network → descriptor unavailable |
| Approach Direction Diversity | Arrival sides | distinct 60° sectors / 6 | sectors | × 100 | 0.25 | same |
| Convergence Concentration | Floor gathered at the destination | clearance-weighted share within 8 ft | share | 0 → 0, 0.35 → 100 | 0.15 | same |
| Approach Continuity | Directness | mean(straight / route length) | ratio | × 100 | 0.20 | 0 when no verified route |

**Diagram.** Cyan verified routes and arrows; gold destination; pale aqua numbered entries; dashed gray unsupported candidates. Plan preferred.

## 3.3 Sculptural — Verified Geometric Measurement

**Intent.** Formal articulation and three-dimensional surface complexity, area-weighted so polygon density does not inflate the score.

**v3.5.** Adjacent Normal Variation (documented as / 60° but computed / 90°), Orientation Entropy, Sectional Area Variation, Plan Asymmetry on voxel plates. Diagram painted the whole form.

**v4.** Same families of signal, computed on the original mesh. The 90° dihedral normalization is labelled as 90°.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Adjacent Fold Angle | Shared-edge dihedrals | area-weighted mean dihedral | degrees | / 90° × 100 | 0.30 | No shared edges → unavailable |
| Orientation Variety | Normal spread | Shannon entropy of 26 bins / log 26 | ratio | × 100 | 0.25 | No area → unavailable |
| Sectional Variation | Height change of the form | CV of surface area per 2 ft band | cv | / 0.75 × 100 | 0.25 | < 2 bands → unavailable |
| Mirror Asymmetry | Bilateral departure | unmatched 1 ft plan columns under best x or y mirror | share | × 100 | 0.20 | No columns → unavailable |

**Diagram.** Gold fold edges ≥ 30°; light blue minority-orientation surfaces (not the whole mesh); mid-blue sectional bars with ft² labels; gray unmatched mirror columns. Component layers are selectable.

## 3.4 Visually Connected — Verified Geometric Measurement

**Intent.** Same-level visual relationships. Vertical views belong to Vertically Integrated.

**v3.5.** Voxel-bin visibility across the occupied shell, including unrelated elevations.

**v4.** Standing origins every 3 ft on supported floors, grouped by detected level. Eye height 5.5 ft (configurable). Rays test the original mesh. No material is treated as transparent.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Same-Level Coverage | Clear same-level rays | clear / tested | share | × 100 | 0.40 | < 2 origins on one level → unavailable |
| Mean Clear Sightline | Reach of clear views | mean clear length / plan diagonal | ft | × 100 | 0.30 | All blocked is measured zero |
| Region-Pair Connection | Distinct regions that see each other | connected pairs / tested pairs | share | × 100 | 0.30 | Single region → unavailable (renormalize) |

**Diagram.** Cyan accepted sightlines; gold eye-height origins; light blue visible targets; dashed gray obstructed rays. Plan and section.

## 3.5 Surreal — Architectural Proxy

**Intent.** Unusual geometric arrangements. Geometry cannot prove surreal intent.

**v3.5.** Non-axis share, upper/lower centroid shift, voxel-plate scale CV, cantilevered voxel cells. Scale CV often dominated the score because voxel segmentation produced many fragments.

**v4.** Mesh and floor-column measurements. Scale contrast uses occupiable-region clear-height ratio, not fragment count.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Non-Axis Surface Area | Surfaces > 15° from every axis | area share | share | 0 → 0, 0.5 → 100 | 0.30 | No area → unavailable |
| Upper/Lower Displacement | Shifted mass halves | plan distance of half-centroids | ft | 0 → 0, 0.25 × plan → 100 | 0.25 | No halves → unavailable |
| Unsupported Floor Share | Upper floor with nothing beneath | unsupported upper area / upper area | share | × 100 | 0.25 | No upper level → unavailable |
| Region Scale Contrast | Clear-height contrast | 1 − min/max region mean clearance | ratio | × 100 | 0.20 | < 2 regions → unavailable |

**Diagram.** Gold unsupported upper floor; light blue non-axis surfaces; cyan displacement arrow; mid-blue region clearance labels.

## 3.6 Monumental — Verified Geometric Measurement (context still missing)

**Intent.** Architectural scale and spatial magnitude. Site, human scale, and cultural monumentality are not in the OBJ.

**v3.5.** Bounding-box height, shell-voxel volume, height / plan. Diagram was a dominant cube.

**v4.** Height in feet, identifiable clear volume (same clearance integral as Open Volume, cap 10 000 ft³), largest level, 95th-percentile sheltered clearance, vertical dominance. No bounding-box overlay.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Height | Overall height | bounding height | ft | 8 → 0, 40 → 100 | 0.35 | always measured |
| Identifiable Clear Volume | Usable clear volume | Σ area × min(clearance, 20) | ft³ | 0 → 0, 10 000 → 100 | 0.25 | No interior → unavailable |
| Largest Uninterrupted Level | One large floor | max level area | ft² | 0 → 0, 1600 → 100 | 0.15 | No level ≥ 16 ft² → unavailable |
| Tallest Clear Height | Tallest covered height | p95 sheltered clearance | ft | 8 → 0, 30 → 100 | 0.15 | No sheltered floor → unavailable |
| Vertical Dominance | Height vs plan | height / max plan side | ratio | 0.4 → 0, 2.5 → 100 | 0.10 | always measured |

**Diagram.** Gold height dimension; cyan plan dimensions; light blue volume columns and tall-clear markers; gray largest-level reference. No bounding box.

## 3.7 Hierarchical — Verified Geometric Measurement

**Intent.** Organization of primary, secondary, and tertiary architectural planes. Not program hierarchy.

**v3.5.** Connected voxel plates. The largest plate was treated as primary regardless of whether it was a floor.

**v4.** Detected floor levels from original surfaces.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Primary Dominance | Largest level vs the rest | (A₁/ΣA − 1/n) / (1 − 1/n) | share | equal → 0, one level holds all → 100 | 0.35 | < 2 levels → unavailable |
| Primary/Secondary Gap | Step between first and second | 1 − A₂/A₁ | ratio | × 100 | 0.30 | same |
| Secondary/Tertiary Gap | Third tier | 1 − A₃/A₂ | ratio | × 100 | 0.20 | Only two levels → term unavailable |
| Elevation Separation | Height set-apart | \|z₁ − area-weighted mean z of others\| | ft | 0 → 0, 10 → 100 | 0.15 | same |

**Diagram.** Gold primary, light blue secondary, mid-blue tertiary, gray further levels, with area and elevation labels. Isometric, plan, section.

## 3.8 Sequential — Verified Geometric Measurement

**Intent.** Progression through ordered spatial regions. Length is not automatically better.

**v3.5.** Longest voxel-zone chain. Fabricated stair-like links appeared as continuous sequences.

**v4.** Longest verified floor-network route from the largest lowest-level entry. Events = regions entered in order. Transitions score elevation, direction, scale, and enclosure change. Unverified vertical links are dashed potential, never drawn as stairs.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Sequence Length | Distinct regions on the route | n / (n + 3) | regions | saturating | 0.25 | No entry → unavailable |
| Transition Quality | Meaningful changes | mean of min(3, change types) / 3 | ratio | × 100 | 0.35 | 0 when no transition |
| Elevation Progression | Levels visited | (visited − 1) / (levels − 1) | levels | × 100 | 0.15 | Single level → term unavailable |
| Verified Share | Vertical moves that are supported | verified / (verified + potential) | share | × 100 | 0.25 | No vertical move → term unavailable |

**Diagram.** Cyan path and direction arrow; gold numbered events; pale aqua horizontal transitions; light blue verified vertical transitions; dashed gray potential links.

## 3.9 Circulation Activated — Verified Geometric Measurement

**Intent.** Circulation that connects and activates space. Activation is a junction, interface, or access opportunity, not mere adjacency.

**v3.5.** Low-degree voxel route graph. Large voxel blocks. Gathering Linear ranked 15 largely because the shell graph was dense.

**v4.** Floor-surface network. Spine = union of shortest paths among entries, region anchors, and verified level links.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Network Continuity | One connected system | largest-system nodes / nodes | share | × 100 | 0.25 | No movement surface → unavailable |
| Region Reach | Regions served | regions in largest system / regions | share | × 100 | 0.25 | No region ≥ 16 ft² → term unavailable |
| Interfaces | Entries + region joins + verified level links | i / (i + 4) | count | saturating | 0.20 | 0 is measured |
| Junctions | Spine nodes with ≥ 3 neighbours, clustered 3 ft | j / (j + 3) | count | saturating | 0.15 | 0 is measured |
| Level Distribution | Levels the spine reaches | levels on spine / levels | levels | × 100 | 0.15 | Single level → term unavailable |

**Diagram.** Cyan spine polylines; gold interface markers; light blue junctions; gray dead ends and disconnected floor. Plan and isometric. Narrow lines, not voxel blocks.

## 3.10 Centralized — Architectural Proxy

**Intent.** Concentration around a geometric or spatial center. Mass centrality is not the same as a central public space.

**v3.5.** Occupied-cell centroid vs box center, radial voxel falloff, inner-zone share. Oversized gold voxels.

**v4.** Area-weighted surface centroid, inner-ellipse surface share, inner clear-volume share, occupiable-node centroid.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Mass Centre Concentration | Surface centroid vs box center | 1 − offset / (0.25 × plan) | ft | 0 offset → 100 | 0.35 | No area → unavailable |
| Radial Concentration | Surface inside half-radius ellipse | (share − 0.25) / 0.75 | share | uniform → 0 | 0.30 | always measured if area exists |
| Inner Clearance Dominance | Clear volume inside the ellipse | (share − 0.25) / 0.75 | share | uniform → 0 | 0.20 | No clear volume → unavailable |
| Occupiable Centrality | Standing-node centroid vs box center | 1 − offset / (0.25 × plan) | ft | 0 offset → 100 | 0.15 | No standing surface → unavailable |

**Diagram.** Gold inner surfaces; pale aqua inner clear floor; cyan mass-centre marker and offset; gray radial guides. Plan and isometric.

## 3.11 Vertically Integrated — Verified Geometric Measurement

**Intent.** Relationships between levels through voids, views, and circulation, reported separately.

**v3.5.** Voxel adjacency and shaft detection. Lobby Continuous Hall scored 0. Vertically adjacent cells were treated as circulation.

**v4.** Four explicit components. Circulation is verified / potential / disconnected. A void without a stair scores the void and the view, not the circulation.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Vertical Void Continuity | Interior void through levels | max min(1, area/64) × (span − 1)/(levels − 1) | ratio | × 100; 0 if none | 0.30 | < 2 levels → descriptor unavailable |
| Vertical Visual Connectivity | Cross-level eye-height rays | clear / tested | share | × 100 | 0.25 | No cross-level pair → term unavailable |
| Vertical Circulation | Consecutive level pairs | verified 1, potential 0.5, disconnected 0 | ratio | × 100 | 0.30 | 0 is measured when pairs exist |
| Integrated-Level Distribution | Area in the largest verified-connected level set | connected area / all level area | share | × 100 | 0.15 | 0 when no two levels are verified-connected |

**Diagram.** Pale aqua void volumes; light blue cross-level sightlines; cyan verified chains; gold connected levels; dashed gray potential links. Section and isometric.

## 3.12 Luminous — Potential Spatial Relationship

**Intent.** Potential natural-light penetration through overhead and lateral openings. Not illuminance, not glazing, not daylight standards.

**v3.5.** Upward hemispherical exposure, sky-facing opening, daylight penetration. Roof samples counted as interior light. Diagram used large cyan columns.

**v4.** Probes at interior standing nodes only. Exposed roofs excluded. Label: Potential Natural-Light Penetration.

| Component | Feature | Formula | Units | Normalization | Weight | Missing |
|---|---|---|---|---|---|---|
| Overhead Light Exposure | Escaped upper-hemisphere rays | mean escaped / 9 | share | × 100 | 0.35 | No interior probe → unavailable |
| Lateral Light Exposure | Escaped horizontal rays | mean escaped / 8 | share | × 100 | 0.35 | same |
| Lit Region Share | Interior with any escaped ray | lit probes / probes | share | × 100 | 0.30 | same |

**Diagram.** Gold overhead arrows (inward); cyan lateral arrows; pale aqua lit floor; gray dark floor and dashed blocked rays. Isometric and section.

---

## Shared diagram and scoring rules

- Palette only: `#F7F6F5 #B9BEC6 #9BD5E4 #71BEDA #43A9CF #1293C2 #0E6F92 #095775 #073C52 #D6AD4F`. Background `#000000`.
- Legend is generated from layers actually drawn. Sampled layers state `shown of total`.
- Annotation sizes at 7407 × 2160: heading 36, labels 32, values 28, secondary 23, swatches 24. Other sizes scale by height / 2160.
- Absolute score 0–100. Registry rank 1 weakest … n strongest among forms that could be measured. Ties break on filename.
- v3.5 remains callable as `evaluateTileModelLegacy`. Registry payload includes `legacy` ranks for comparison.
