# Local material classification correction — completion report

Repository: C:/Users/DHale/Documents/Codex/Cursor-APP  
Branch: organic-lattice-connections  
Baseline and unchanged HEAD: 26657ffd752bfce309799155e00a8e9d4c01184d  
Date: 2026-10-08

**Implemented and tested; changes are uncommitted.** The original 277-triangle exclusion set now contains 222 ambiguous triangles. Fifty-five of the 60 prior locally supported candidates receive affirmative material-top classifications. This recovers **no complete attachment window and no new circulation connection**. L1 remains isolated, with two connected components overall.

## A. Baseline, files and functions

Before editing, the branch and exact checkpoint were verified. The sole existing untracked directory was the prior post-correction review. Those reports were preserved. Baseline Stage 1 attachment, surface orientation, 54-candidate replay, bounded Stage 2A routing, and Phase 1.5 cache-invalidation cases passed. TypeScript already had the six errors listed below.

Modified application source:
- [surfaceOrientation.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceOrientation.ts:157): build() adds a bounded fallback for disputed upward triangles, records explicit per-triangle evidence, and uses the corrected physical normal before building shared support regions.
- New [materialSideEvidence.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/materialSideEvidence.ts:10): materialSideIndex(), its spatial tree, prepare(), and query() provide bounded winding-number intervals.

New test:
- [l1-local-material.cjs](C:/Users/DHale/Documents/Codex/Cursor-APP/scripts/l1-local-material.cjs): original-mesh fixture, checkpoint capture, independent exact oracle, all changed classifications, old-interface replay, full finite window audit, geometry hashes, timing, and reuse of the existing Phase 1.5 invalidation cases.

Existing consumers inspected, not modified:
- [analyze.ts — rasterize / analyzeMesh](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/analyze.ts:210).
- [connectionPorts.ts — extractSourceEdgePorts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/connectionPorts.ts:93).
- [surfaceAttachment.ts — surfaceIndex / measureSurfaceGap / enumerateWalkableAttachments](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceAttachment.ts:149).
- [organicConnections.ts — detectFeatures](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/organicConnections.ts:165).
- [walkingApproach.ts — validateWalkingApproach / checkApproach](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/walkingApproach.ts:42).
- [geometryRevision.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/geometryRevision.ts:24), portMatching.ts, connectionClearance.ts, alternativeRouting.ts, and transitionGeometry.ts.

All consumers still use the shared orientation metadata. Their existing eligibility and circulation thresholds are unchanged. A finite physical normal identifies an oriented surface; it does not certify a circulation-width floor. Coarse raster eligibility, edge-port eligibility and continuous walking-surface checks retain their existing separate purposes.

## B. Root cause and correction

On imperfect components, the old fallback classified a triangle using all same-component crossings in a vertical column. Distant defective crossings could produce an incorrect material count; opposite-sign coincident crossings anywhere in that column could invalidate a sound local interface.

O1 triangle 1071, for example, had column counts above=2 and below=3, despite local material below and free space above. G1 triangle 10823 had the correct immediate 0/1 ordering but an opposite-sign coincidence approximately 3.465 ft below it.

The correction preserves the existing component-orientation and column checks. Only still-ambiguous upward triangles on components with established material semantics receive additional interpretation:
1. Four barycentric locations: centroid and the three permutations of (0.6, 0.2, 0.2).
2. At each location, both material sides are tested at 0.005 and 0.02 ft normal offsets: 16 tests for an accepted triangle.
3. The complete interval must lie within the existing 0.1 winding tolerance of material inside and free space outside. Non-finite, contradictory, unresolved or budget-exhausted results remain ambiguous.
4. Walls, undersides, unresolved components and previously accepted triangles are not promoted or reclassified by the fallback.

Near geometry is integrated with exact triangle solid angles. Distant geometry is retained through a first-order flux expansion with a conservative remainder; it is not discarded. The source documents the Hessian bound and integrated second moment used to bound error. The spatial partition is prepared once for the entire witness box and reused for all its samples.

Each prepared query has an 8,192 exact-triangle budget and 16,384 refinement-step budget. No fixture query exhausted either budget. The largest exact subset was 3,477 triangles, rather than an unrestricted scan of a whole source on each witness. The independent *test oracle* deliberately uses complete component integrals on this bounded fixture.

The existing exact-content geometry revision cache owns the final metadata. In-place geometry/topology changes invalidate it. Placement, rotation and mirror changes continue to use the existing transformed attachment/clearance caches. There are no new cached connector-validation results or exemptions.

This remains finite local material evidence, not proof that an entire form is navigable. Full-footprint support, slope, collision, enclosure and headroom validation remain necessary.

## C. Before/after classifications

“Physical up” below uses normalZ >= 0.7, matching the original 277-triangle audit. It includes steep physical tops and is not a count of usable circulation surfaces.

| Original form | Physical up before | Physical up after | Ambiguous from original audit before | After |
|---|---:|---:|---:|---:|
| O2 — undulating workspace.obj | 4,838 | 4,847 | 11 | 2 |
| O1 — void workspace.obj | 811 | 812 | 47 | 46 |
| G1 — Gathering, Linear.obj | 11,820 | 11,865 | 219 | 174 |
| L1 — Lobby, Vertical Void.obj | 9,075 | 9,075 | 0 | 0 |

The general fallback operates at the existing physical-region threshold of 0.65. Thus it examines 292 disputed upward triangles, including 15 outside the original >=0.7 audit. In total, **57 classifications change**: the 55 above, plus O2 triangle 9770 (normalZ 0.663680) and O1 triangle 3893 (0.674040). Both additional triangles are steep physical tops; neither qualifies for the >=0.7 attachment pool or the >=0.68 raster-floor threshold. Of the 292 examined, 235 remain ambiguous: 222 from the original audit plus 13 below 0.7.

All previously finite physical normals are unchanged, including L1 slab tops, undersides and walls. No source face winding is changed.

## D. Which prior candidates became usable floors?

Of the 60 prior local-top candidates:
- O2: 9 of 10 obtain affirmative material-top evidence; all nine exceed a 1:12 local gradient.
- O1: 1 of 2 obtains affirmative evidence: triangle 1071, area 0.023468 sq ft. It joins the already accepted floor containing triangle 1072. Its flatness and previously measured point headroom of 15.622 ft are sound, but its tiny area does not constitute a new entrance.
- G1: 45 of 48 obtain affirmative evidence. Forty-two exceed a 1:12 local gradient. The three gentle triangles—10823, 24655 and 38487—have only approximately 0.538 ft of point headroom and cannot provide usable circulation.

Therefore **55 are verified local physical tops, but zero new complete usable floor/attachment windows are established**. Point-headroom values above come from the prior exact geometry audit; the original geometry is unchanged. Continuous footprint and clearance results below are newly replayed.

Every changed triangle, its normal, area, location, evidence intervals and justification is recorded in [updated.json](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/local-material/updated.json). A complete human-readable index appears at the end of this report.

## E. Remaining exclusions

The five candidates with prior centroid evidence that still fail the stronger interval test are:

| Form / triangle | First unresolved material-side interval, approximately | Reason retained |
|---|---|---|
| O2 / 9815 | 0.911213 ± 0.019989 | Interval crosses the lower 0.9 material bound |
| O1 / 3881 | 0.915759 ± 0.019908 | An off-centroid/deeper witness remains uncertain |
| G1 / 9198 | 1.082817 ± 0.019991 | Interval crosses the upper 1.1 material bound |
| G1 / 23030 | 1.082739 ± 0.019983 | Same repeated-region uncertainty |
| G1 / 36862 | 1.082749 ± 0.019980 | Same repeated-region uncertainty |

These five are **not proven invalid surfaces**. Their bounded numerical evidence cannot certify every required witness; no tolerance was relaxed to accept them. A more precise query could potentially resolve some, but that is not evidence of a useful corridor. O1 3881 also had only 2.370 ft of point headroom in the original audit.

The other 217 triangles in the original exclusion set retain contradictory or uncertain local material evidence. Their IDs and first failing sample intervals are preserved under each form's “remaining” records in updated.json. None was restored automatically from upward winding or the old 60-candidate list. There were no production budget-exhaustion exclusions in this fixture.

## F. Complete attachment windows and downstream discovery

All **477** finite enumerated windows were compared geometrically against the checkpoint:
- O2: 9.
- O1: 24.
- G1: 330.
- L1: 114.

Every window's point, profile, width and outward direction is unchanged. The test explicitly inspected G1's 74 windows beyond the normal 256 return cap using a private, in-memory audit module. Production code and route budgets were unchanged. G1's support-edge run count rises from 148 to 151, but there is no additional complete window.

See [windows-updated.json](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/local-material/windows-updated.json) and its checkpoint counterpart.

There is a separate, expected change in the 32-port source-edge extraction pool. Corrected G1 face eligibility changes edge numbering and which two geometric ports survive its unchanged ranking/cap:
- Both old and new fixtures contain 4,149 port candidates.
- 4,001 common geometric candidates retain identical assessment fields and classifications, after ignoring renumbered edge IDs.
- 148 candidates are added and 148 removed; **every added and removed candidate is rejected**.
- Added rejection counts: distance 124, angle 5, lateral offset 9, surface attachment 1, slope 3, collision 4, elevation 2.
- Removed rejection counts: distance 99, angle 26, lateral offset 10, slope 4, collision 9.
- Organic candidates considered change from 632 to 611. All other organic diagnostics, links, rejection records, graph degrees and emitted geometry remain identical.

The full candidate delta is in [port-delta.json](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/local-material/port-delta.json). This is not blanket pre/post candidate-list parity; geometric classification parity is proved for the shared candidates, with the changed rejected set audited separately. The fixed replay of the original 54 prematurely suppressed candidates still reaches geometric evaluation, with zero provisional-network suppression.

## G. Replayed 24 source interfaces

The exact prior interfaces, widths and placements were replayed, rather than replaced with newly selected examples.

| Source | Ramp/walk approach pass | Coverage failure | Local slope failure | Stair landing pass |
|---|---:|---:|---:|---:|
| O1, 12 interfaces | 3 | 9 | 0 | 0 |
| G1, 12 interfaces | 0 | 10 | 2 | 0 |
| Total | 3 | 19 | 2 | 0 |

For the 24 stair landing tests, 22 fail coverage and 2 fail local slope. **None of the 21 previously rejected walking approaches becomes valid.**

All three passing walking approaches are the existing O1 sources targeting upper entrance C. All eight routes from each were checked independently: **24/24 still fail source-geometry clearance**. The correction does not create a source approach to middle entrance B.

The bounded Stage 2A rerun also preserves all 192 route specifications and first-failure reasons after ignoring renumbered source edge IDs. No O2–L1 alternatives were added to that batch.

## H. L1 entrance B

B remains the strongest verified middle-floor destination:
- World point: (40, 10.283156395, 8.357694626) ft.
- Existing floor region: 21.
- Widths 2.1 and 3 ft, each with depths 2, 4 and 6 ft: all pass continuous support and clearance.
- Longitudinal and cross slope: 0 on these footprints.
- Minimum measured headroom: 10.155474 ft.
- Existing opening checked for 0.5 ft beyond the endpoint.
- No new slab, cut, deformation or mesh is introduced.

This is an existing OBJ floor, not a lattice-cell face. Flat interior approach depth is not additional ramp climbing run. The 2.1 ft option is narrow conceptual circulation. A 3 ft bare floor strip alone does not establish an accessible circulation system; turning/landing space, rails and the complete route remain unresolved. No accessibility certification is claimed and no architectural threshold was changed.

## I. Newly validated connectors

**None.** The existing O2–O1 ramp and O2–G1 stair have identical emitted vertices, indices and reports. There are six connector mesh pieces representing those two circulation links. The graph has two connected components and L1 remains isolated. No voxel-only direct edge is admitted.

## J. Regression and fidelity results

Passed:
- Independent exact winding oracle for **1,157 samples**, including accepted and retained-ambiguous evidence. Every exact value lies within the reported interval; maximum observed approximation error is 0.000254, below the <=0.02 interval allowance.
- O1 1071 and adjacent accepted floor; representative O2/G1 recovery; retained uncertain cases.
- All previously accepted physical normals, L1 tops/undersides and unsupported-sheet exclusion.
- Local-evidence invalidation after in-place vertex/topology edits; individual reversed face rejection; cloned whole-shell reversal preserving physical classifications.
- Existing surface-orientation regression, including original 54-candidate replay, intermediate thin obstruction, lower-floor headroom failure, transforms and emitted-path invalidation.
- Stage 1 connection-attachment regression.
- Phase 1.5 unchanged cache-invalidation cases for geometry, topology, placement, lift, rotation, mirror, contact tolerances, paths, profiles, widths, class, endpoint edits, connector trees and prepared certificates.
- Bounded Stage 2A 192-route cold/warm regression and original 24-interface replay.
- Complete 477-window geometric comparison.
- Original OBJ hashes and all 47,921 original vertices matching the renderer's root transform within 1e-5 ft.
- Targeted ESLint for the two source modules and the test harness.
- Production build.

TypeScript: **six pre-existing errors; no new errors**:
- TS5097: descriptorCache.test.ts lines 3 and 4; descriptorRank.test.ts line 3; descriptorV2.test.ts line 3; openVolume.test.ts line 3.
- TS2352: descriptorCache.test.ts line 13, incomplete faces object in an unrelated TileVariant fixture.

The first production build was blocked by the Windows sandbox's SWC/jsc.baseUrl canonicalization permission error. The required build passed outside the sandbox. Existing unrelated lint warnings remained. No dependencies were installed and no unrelated tests were changed.

Session SHA-256: 6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b.

Original OBJ hashes are listed below. They cover the original positions, normals and face data, not generated proxy meshes. Both before/after mutation guards and the prior checkpoint hashes agree.

## K. Performance

Two fresh processes per version were run sequentially in checkpoint / updated / updated / checkpoint order, with identical original meshes, placements and four evaluations per process. The full placement search was never called. First-evaluation timing excludes analysis; combined cold timing below is analysis plus that evaluation and excludes module loading and test-only audits.

| Measurement | Checkpoint | Updated |
|---|---:|---:|
| Four-form classification, mean | 1.611 s | 3.497 s |
| Four-form analysis, mean | 2.193 s | 4.218 s |
| First fixed-placement evaluation, mean | 3.308 s | 3.022 s |
| Analysis + first evaluation, mean | 5.502 s | 7.240 s |
| Warm evaluation, median of six | 0.0797 s | 0.1002 s |
| Warm evaluation range | 0.061–0.198 s | 0.065–0.154 s |

The added material evidence costs approximately **1.822 s per fresh four-form geometry revision**: O2 0.382 s, O1 0.105 s, G1 1.333 s, and L1 about 0.001 s of loop overhead with no fallback queries. It is not repeated for unchanged placements.

Mean cached classification lookup times, including existing exact geometry-revision comparisons, are approximately O2 0.480 ms, O1 0.215 ms, G1 1.226 ms and L1 0.889 ms. These are not zero-cost cache lookups; geometry equality is still checked.

The additional cold cost is real. The small warm median increase is reported rather than described as an optimization; the ranges overlap and this sample is too small for a strong throughput claim. The first evaluation also processes a changed rejected candidate set, including 21 fewer organic candidates, so its lower time is not evidence that the classifier itself became faster. G1 remains the dominant new cold cost. Large revisions may hit the conservative budget and leave more surfaces ambiguous.

See [performance.json](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/local-material/performance.json) and the four benchmark snapshots. Earlier concurrently executed regression timings are not used for this comparison.

## L. Recommended next work

**Prioritize bounded interior/source-approach selection, using the existing continuous validator, before Stage 2B placement optimization.**

The new evidence removes a real classification defect but changes none of the complete windows or 24 approach outcomes. Twenty-one source interfaces still lack a valid continuous approach, while B is a verified destination. The three usable source approaches lead to routes that collide; none is an otherwise fully valid route rejected only by loft/stair construction. These results do not establish that all placements are geometrically impossible.

A focused next authorization should:
1. Use validateWalkingApproach() to qualify source and destination footprints before spending the small attachment/pair budget in evaluateAlternativeRoutes().
2. Examine bounded 2–6 ft interior approach positions only where original connected physical floor supports the full width and depth, with existing openings and all clearance gates intact.
3. Keep B as the first verified L1 destination and distinguish walking approaches from stair/ramp landing requirements.
4. Record whether any fully qualified attachment pair fails solely in transitionSections() / transitionMeshes(). Only then prioritize connector-construction correction for that demonstrable pair.

Relevant implementation sites: [surfaceAttachment.ts — enumerateWalkableAttachments](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceAttachment.ts:271), [walkingApproach.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/walkingApproach.ts:42), and [alternativeRouting.ts — evaluateAlternativeRoutes / validateAlternative](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/alternativeRouting.ts:16). Connector-specific follow-up, if demonstrated, belongs in [transitionGeometry.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/transitionGeometry.ts:95).

Stage 2B remains a later bounded experiment if qualified source approaches still cannot reach B under the current arrangement. It has not begun. Remaining limitations include finite witnesses, unresolved imperfect geometry, unchanged source-port caps, boundary-oriented attachment enumeration, small routing budgets, construction failures, and unverified architectural circulation widths/landings.

## Reproduction

From the repository root:
- node scripts/l1-local-material.cjs --checkpoint
- node scripts/l1-local-material.cjs
- node scripts/l1-local-material.cjs --checkpoint --windows
- node scripts/l1-local-material.cjs --windows
- node scripts/l1-local-material.cjs --checkpoint --benchmark
- node scripts/l1-local-material.cjs --benchmark
- node scripts/connection-attachment-check.cjs
- npx eslint src/components/lattice/materialSideEvidence.ts src/components/lattice/surfaceOrientation.ts scripts/l1-local-material.cjs --rule '@typescript-eslint/no-require-imports: off'
- npx tsc --noEmit --incremental false
- npm run build

The existing surface-orientation harness was also run with its output redirected in memory to reports/local-material/surface-regression.json, preserving its original committed reports.

No commit, push, deployment, D: repository access, full aggregation search, placement optimization, route-algorithm change, threshold change, descriptor-scoring edit or Board Mode edit was performed.

## Original OBJ hashes

| Form | SHA-256 |
|---|---|
| O2 | 6c61b56e61cb0c3a8c200a0d19713170eab61d313be9883a9b6085f88089f3af |
| O1 | 0050467218bcf92c83da4b736ddaba4b4db52f66b13438df6492b29017dae25e |
| G1 | 780b13781015d7dba2ac35824229edb6972569eaccc7a2dea0e41df54663d460 |
| L1 | 419ebffbc55238b96ed0f0fea8401c9b6d13115887b992dd7c7b69688bb807a2 |

## Every changed classification

All rows were previously ambiguous. Each now has material below / free space above at all 16 bounded witnesses, independently checked against exact winding. This is physical-top evidence, not a complete walking window. Triangle and face indices are zero-based. Full sample intervals, world centroids and remaining exclusions are in updated.json. “Outside 277” marks the two steeper triangles below normalZ 0.7.

| Form | Triangle | Original face | Physical normalZ | Area (sq ft) | Local gradient | Prior 60 candidate? |
|---|---:|---:|---:|---:|---:|---|
| O2 | 9710 | 9665 | 0.992529 | 0.090907 | 0.122926 | Yes |
| O2 | 9711 | 9666 | 0.992524 | 0.067626 | 0.122970 | Yes |
| O2 | 9765 | 9720 | 0.992539 | 0.100518 | 0.122845 | Yes |
| O2 | 9767 | 9722 | 0.992534 | 0.191431 | 0.122883 | Yes |
| O2 | 9768 | 9723 | 0.992530 | 0.191432 | 0.122920 | Yes |
| O2 | 9770 | 9725 | 0.663680 | 0.043585 | 1.127074 | Outside 277 |
| O2 | 9771 | 9726 | 0.992532 | 0.123797 | 0.122901 | Yes |
| O2 | 9772 | 9727 | 0.992539 | 0.100515 | 0.122845 | Yes |
| O2 | 9773 | 9728 | 0.992530 | 0.191428 | 0.122920 | Yes |
| O2 | 9774 | 9729 | 0.992534 | 0.191427 | 0.122883 | Yes |
| O1 | 1071 | 1071 | 1.000000 | 0.023468 | 0.000000 | Yes |
| O1 | 3893 | 3893 | 0.674040 | 0.247664 | 1.095920 | Outside 277 |
| G1 | 3950 | 3950 | 0.891840 | 0.044853 | 0.507210 | Yes |
| G1 | 3951 | 3951 | 0.980297 | 0.073671 | 0.201498 | Yes |
| G1 | 3952 | 3952 | 0.946956 | 0.152188 | 0.339363 | Yes |
| G1 | 3955 | 3955 | 0.780783 | 0.005049 | 0.800225 | Yes |
| G1 | 3956 | 3956 | 0.769790 | 0.082350 | 0.829184 | Yes |
| G1 | 3984 | 3984 | 0.992217 | 0.145245 | 0.125495 | Yes |
| G1 | 3985 | 3985 | 0.992217 | 0.145245 | 0.125495 | Yes |
| G1 | 3987 | 3987 | 0.992217 | 0.145245 | 0.125495 | Yes |
| G1 | 4018 | 4018 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 4020 | 4020 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 4022 | 4022 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 4023 | 4023 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 6301 | 6301 | 0.707753 | 0.001596 | 0.998172 | Yes |
| G1 | 9130 | 9130 | 0.983548 | 0.146526 | 0.183670 | Yes |
| G1 | 10823 | 10823 | 0.999229 | 0.144227 | 0.039297 | Yes |
| G1 | 17782 | 17782 | 0.891840 | 0.044853 | 0.507212 | Yes |
| G1 | 17783 | 17783 | 0.980297 | 0.073671 | 0.201498 | Yes |
| G1 | 17784 | 17784 | 0.946957 | 0.152188 | 0.339362 | Yes |
| G1 | 17787 | 17787 | 0.780783 | 0.005049 | 0.800225 | Yes |
| G1 | 17788 | 17788 | 0.769790 | 0.082349 | 0.829183 | Yes |
| G1 | 17816 | 17816 | 0.992217 | 0.145245 | 0.125494 | Yes |
| G1 | 17817 | 17817 | 0.992217 | 0.145245 | 0.125494 | Yes |
| G1 | 17819 | 17819 | 0.992217 | 0.145245 | 0.125494 | Yes |
| G1 | 17850 | 17850 | 0.992217 | 0.145246 | 0.125493 | Yes |
| G1 | 17852 | 17852 | 0.992217 | 0.145246 | 0.125494 | Yes |
| G1 | 17854 | 17854 | 0.992217 | 0.145246 | 0.125494 | Yes |
| G1 | 17855 | 17855 | 0.992217 | 0.145246 | 0.125494 | Yes |
| G1 | 20133 | 20133 | 0.707761 | 0.001596 | 0.998149 | Yes |
| G1 | 22962 | 22962 | 0.983548 | 0.146526 | 0.183670 | Yes |
| G1 | 24655 | 24655 | 0.999229 | 0.144227 | 0.039297 | Yes |
| G1 | 31614 | 31614 | 0.891841 | 0.044853 | 0.507207 | Yes |
| G1 | 31615 | 31615 | 0.980297 | 0.073671 | 0.201497 | Yes |
| G1 | 31616 | 31616 | 0.946956 | 0.152188 | 0.339363 | Yes |
| G1 | 31619 | 31619 | 0.780784 | 0.005049 | 0.800223 | Yes |
| G1 | 31620 | 31620 | 0.769791 | 0.082350 | 0.829182 | Yes |
| G1 | 31648 | 31648 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 31649 | 31649 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 31651 | 31651 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 31682 | 31682 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 31684 | 31684 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 31686 | 31686 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 31687 | 31687 | 0.992217 | 0.145246 | 0.125495 | Yes |
| G1 | 33965 | 33965 | 0.707754 | 0.001596 | 0.998170 | Yes |
| G1 | 36794 | 36794 | 0.983548 | 0.146526 | 0.183667 | Yes |
| G1 | 38487 | 38487 | 0.999229 | 0.144227 | 0.039297 | Yes |
