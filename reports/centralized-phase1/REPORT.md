# Phase 1: architectural spatial graph audit

Stopped at Phase 1 as requested. No evaluation algorithms, thresholds, mathematical weights, architectural source files or prior evaluation records were changed. New files are diagnostic experiments and outputs in this report directory only.

## Confirmed root cause

`circulation.ts` forms regions from connected components of all `walk` sample edges. `evaluateV4.ts` then creates Centralized edges only when a movement edge joins two different retained region IDs. By definition a walk edge cannot join two distinct walk components. Consequently the collapsed Centralized graph cannot retain same-floor room-to-room walk relationships. A doorway can be correctly recognized at sample scale while the rooms merge into one region, eliminating that doorway as a region relationship. Only retained cross-region `step` edges can survive this aggregation.

The current implementation detects connected sampled floor surfaces, not rooms. It has no doorway-based segmentation, enclosure-based subdivision, narrowing/widening segmentation, shared-atrium relationship graph, or semantic room/space parsing. Openings, atriums, enclosure classes and possible level links are computed in the shared context but are not used to construct an independent organizational graph. Current Centralized is a movement-component proxy.

## Pipeline and influences

1. Intersect source triangles with vertical rays on a 1 ft plan grid. Near-horizontal surfaces qualify by absolute normal Z >= 0.68. Surface winding is intentionally tolerated. OBJ object/group boundaries and face connectivity do not define regions.
2. Remove candidate surfaces with an overhead gap below 1 ft, infer clearance and enclosure, and cluster elevations with 1.5 ft tolerance and minimum 16 ft² level area. Roof-lid detection can exclude top surfaces. Triangulation affects ray hits/normals, not semantic region identity; coincident faces, incomplete surfaces, narrow gaps, sampling alignment and sloped geometry can affect inferred floors.
3. Eligible movement nodes have a counted level, are not roof lids, and have more than 5 ft overhead clearance when bounded. Unknown overhead clearance is not excluded by the basic movement graph. This does not certify usability or accessibility.
4. Test the eight neighbouring plan cells. Rise <=0.35 ft is `walk`; rise >0.35 ft and <=0.8 ft is `step`. Larger rise is rejected. A chest-height (3 ft) segment must be unobstructed. Surface gaps, walls, slope, step dimensions and sampling resolution affect these links. Connectivity is tested with rays, not by welding source mesh vertices.
5. Walk components become regions. Retain only components of at least 16 ft²; discarded members get region ID -1. Regions are assigned their dominant level. The component algorithm does not explicitly require equal level IDs, so a gently rising connected surface can span assigned levels.
6. Centralized ignores edges within one region and edges touching discarded regions, deduplicating remaining region pairs into a simple undirected graph. A chain through discarded small tread/platform components can therefore disappear even if sampled movement exists. Existing `network.levelLinks` are not consulted for the Centralized graph; they are used elsewhere. This is a potential model-specific failure, not a confirmed explanation of every missing stair.

Enclosure changes and narrowing can therefore remain inside one region if walking connectivity survives. A sealed wall can split regions, but a door removes that split. Void holes remove support or affect floor classification, but no organizational relationship to a shared void is added. Loss of architectural subdivisions is structural, not merely a small numerical threshold problem.

## Current user-loaded model evidence

Counts below come from the observed evaluation session, not the similarly named bundled sample OBJ files. The uploaded buffers remain in the browser, so detailed offline rejected-edge counts for these exact models were not reconstructed from substitute geometry.

| Source | Retained regions | Centralized edges | Components | Score |
|---|---:|---:|---:|---:|
| Linear.obj | 4 | 0 | 4 | Insufficient evidence |
| Void_Field.obj | 13 | 0 | 13 | Insufficient evidence |
| G2 Stepped.obj | 64 | 25 | 40 | 6.1 |

For Linear and Void_Field, zero edges means there are no direct retained cross-region movement edges after the above aggregation. It does not mean there are no raw walk edges, no doors or no architectural associations. The precise mix of missing geometric support, discarded small regions, level sampling and merging requires subsequent model-specific reconstruction diagnostics. Do not label absent evidence as physical disconnection.

Stepped's 6.1 still uses `centralized-graph-v1.0.0`, the same harmonic/Freeman/betweenness/hierarchy weights of 35/25/25/15%, and the same graph aggregation. Later gathering and presentation edits did not change those metrics or its 64/25 graph counts. Its primary network region is 4; the gathering-selection result remains separate. Low score and fragmented graph do not establish the actual building's architectural centralization.

## Controlled experiment and visual diagnostic

`audit.cjs` constructs independent synthetic 30 × 30 ft floor/roof and wall surfaces and feeds them into the unchanged analysis. These are diagnostic fixtures, not regenerations of user architecture.

| Controlled source | Retained regions | Sample movement edges | Region edges |
|---|---:|---:|---:|
| One open room | 1 | 3422 | 0 |
| Two rooms, partition with 4 ft doorway | 1 | 3344 | 0 |
| Two rooms, sealed partition | 2 | 3334 | 0 |

`controlled-regions.svg` and `.png` show actual sampled regions and boundaries in plan: colors identify regions, white outlines identify their boundaries, black lines identify the source partition. The doorway has ten more raw sample edges than the sealed case but merges its rooms into a single graph node. The experiment asserts these outcomes and is repeatable. Machine-readable counts are in `controlled-results.json`.

Existing source-model viewer diagnostics for G2 are preserved in `../centralized-gathering-review/diagnostics-3d.png` and `diagnostics-plan.png`. These are direct viewer exports with original region overlays enabled; they do not individually color/label all 64 IDs. The controlled diagnostic supplies distinct region IDs and boundaries without claiming a new segmentation of the user models.

## Mathematical and regression checks

Nine existing independent graph tests pass, including star, chain, cycle, complete, disconnected and small networks. For four vertices and zero edges, harmonic closeness, Freeman centralization, betweenness and hierarchy all evaluate to zero. The mathematical blend is therefore zero. The application intentionally publishes no architectural rating (`score: null`, insufficient evidence) because no relationships were established. No unexplained nonzero score is produced.

The fixture experiment passed the explicit 1/1/2 region-count assertions, zero cross-region walk-edge assertions, and greater raw connectivity through the doorway. No production build is required for these report-only additions. No commit, push, merge or deployment occurred.

## Boundary for subsequent work

Phase 1 establishes the aggregation defect. Phase 2 must distinguish architectural segmentation from analysis-cell connectivity before organizational and navigable graphs can be separated. It should preserve actual geometric evidence and uncertainty, trace stair chains across retained/discarded components, and avoid replacing missing relations with proximity or projected overlap. No subsequent-phase reconstruction has been implemented in this audit.
