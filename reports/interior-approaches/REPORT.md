# Bounded interior approaches and connection selection

Completed 2026-10-08 in `C:\Users\DHale\Documents\Codex\Cursor-APP`, branch `organic-lattice-connections`.

**Outcome:** 16 source walking windows qualify, 13 beyond the three passing interfaces in the original selected replay. There are two qualified source-to-B pairings, but **zero new validated connectors**. L1 remains isolated. The original O2–O1 ramp and O2–G1 stair remain unchanged.

## Checkpoint and scope

Reviewed the completed local-material correction, its tests and reports; repeated its regressions and fidelity checks. Created the requested local checkpoint **6d0b6f8496cb5b08b0a151def3215fcc05dea5ff**, based on `26657ffd752bfce309799155e00a8e9d4c01184d`. New implementation, tests and this report remain uncommitted. No push, deployment, D: repository change, full assignment search, Stage 2B, scoring change, or Board Mode change.

The fixture uses the four original session meshes, 4 × 4 × 1 cells: O2 `(0,0,0)` variant 0; O1 `(1,0,0)` variant 2; G1 `(1,1,0)` variant 0; L1 `(2,1,0)` variant 3, with no lifts. All coordinates below are world feet.

## A. Files and functions

- `src/components/lattice/surfaceAttachment.ts`: added `enumerateApproachWindows()`. Uses classified physical floor boundary runs, target projections and bounded lateral offsets; distributes proposals across runs before applying the cap. Existing attachment resolver, Stage 1 fitting and legacy enumeration remain intact.
- `src/components/lattice/interiorApproaches.ts`: new `discoverInteriorApproaches()`. Validates full 2/4/6 ft footprints and the existing strict landing requirement. Reports each rejection and omitted-window count. A failed 2 ft prefix also rejects its containing 4/6 ft rectangles. Revision-aware cache includes geometry, placements, orientation, parameters and existing connector geometry.
- `src/components/lattice/walkingApproach.ts`: `placedFaces()`, `nearby()`, `checkApproach()`. Added a conservative XY spatial index for transformed original triangles, preserving all heights and original traversal order. Retained exact support clipping, material enclosure, slope, swept clearance and headroom checks. Added actual interior profile endpoints, support triangle identities and opening/interior obstruction diagnostics. Cached exact material queries by source revision and transform.
- `src/components/lattice/alternativeRouting.ts`: added opt-in `evaluateQualifiedInteriorRoutes()`. Qualifies walking footprints, opening throat, Stage 1 attachment and bounded ramp/stair feasibility before construction. Checks route endpoint direction and local centreline slope, then invokes existing `validateAlternative()`, `routeAlternatives()` and emitted geometry validation. Retains first failures and independent collision evidence. Does not use provisional connectivity to suppress pairs or add graph edges.
- `scripts/l1-interior-approaches.cjs`: deterministic original-mesh discovery, routing, checkpoint replay, cache invalidation, original interface and connector parity, fidelity and benchmark tests.
- `reports/interior-approaches/`: complete outcomes in `updated.json`; checkpoint/current benchmarks; redirected existing regression outputs; repository lint output; this report.

Inspected, without modifying: `connectionPorts.ts` (`extractSourceEdgePorts()` and its 32-port cap), `portMatching.ts` (`assessPortPair()`, `matchAssemblyPorts()` and validated graph insertion), `transitionGeometry.ts` (`transitionPath()`, `transitionSections()`, `transitionMeshes()`), and existing surface-contact/clearance functions. Legacy port ranking and attachment radii remain limitations of the normal placement path. The new API is explicit and bounded; it is not silently wired into global placement or the UI.

## B–D. Previously omitted approaches and physical support

A lattice cell face is a placement boundary, not evidence of a physical opening. New discovery is anchored to the **actual classified OBJ floor boundary**, checks a full-width throat extending 0.5 ft outside it, and follows continuous original walking material inward. The returned interior profile is 2, 4 or 6 ft inside that opening where supported. Existing floor carries that segment; the external connector begins at the opening. No overlapping replacement slab, new hole, cut, deformation or remeshing is produced. Flat interior distance is never counted as ramp climbing run.

The finite proposal pool contains **370 source windows: O1 24, G1 337, O2 9**. A 512-window budget per source covers it completely. Nine O1 and seven G1 windows pass; O2 has none. All 16 are **2.1 ft wide and pass at depth 2 ft only**. Their 4/6 ft rectangles and 3 ft strict stair landing fail continuous floor coverage. No 3 ft wide source window qualifies in this pool.

Compared with the original selected 24 interfaces, **13 additional passing windows** are exposed: six O1 and seven G1. All 16 already occur geometrically in the full legacy window inventory; therefore there are **zero newly invented valid boundary locations**. The improvement is qualification before selection and coverage beyond prior ranking/caps. Seven extra G1 projection/offset proposals were tested but do not pass. A preliminary 256-window cap found five G1 successes; testing all 337 finds seven. This is direct evidence of two cap omissions, not proof of exhaustive continuous surface coverage.

All nine O1 windows lie on physical region **26**, elevation **20 ft**. Six G1 windows lie on region **178**, elevation **20 ft**. One G1 window lies on region **58**, elevation **6.666666508 ft**, with **6.767010212 ft** minimum headroom. The upper windows have no finite ceiling detected within the checked vertical projection; JSON encodes Infinity as null, not as zero headroom. Exact window IDs, coordinates and passing depths are tabulated in the evidence appendix.

L1 B remains region **21**, `(40,10.283156395,8.357694626)`, outward `(0,-1,0)`. Both 3 ft and 2.1 ft widths pass depths 2/4/6 and the strict 3 ft landing, with **10.155473709 ft** minimum headroom. A and C remain comparison targets, each at both widths. Their eligibility and complete footprints are recorded in `updated.json` under each relationship's `destination`.

These are conceptual circulation widths, not accessibility certification. All qualified sources narrow to 2.1 ft; rails, clear width and compliant landings remain unresolved. B's 3 ft bare floor does not make the complete route accessible.

## E. Original 24-interface replay

Unchanged before/after: **3 passing walking approaches, 19 coverage failures, 2 local-slope failures; all 24 strict stair landings fail**. The passing three are O1 upper-floor windows, already included in the 16 above. Replay uses the original geometry and original interface profiles from `reports/surface-orientation/corrected.json`, avoiding false ID matching after local-material run renumbering.

The unchanged legacy bounded Stage 2A run still rejects all 192 alternatives. New outcomes are recorded separately; new qualification does not overwrite the historical replay.

## F. Complete qualified source-to-B pairs

Exactly **two** remain after walking/opening/contact and bounded family feasibility qualification; these are two destination widths for the same physical source window:

| Source | Physical region / interface | Destination | Width source → destination | Plan distance | Rise |
|---|---|---|---|---:|---:|
| G1, `Gathering, Linear.obj` | 58, `approach-47-2.1-1.050000` | B-3, L1 region 21 | 2.1 → 3 ft | 28.143331967 ft | +1.691028118 ft |
| G1, `Gathering, Linear.obj` | 58, `approach-47-2.1-1.050000` | B-2.1, L1 region 21 | 2.1 → 2.1 ft | 28.143331967 ft | +1.691028118 ft |

Source point `(13.128291130,18.647270012,6.666666508)`, outward `(1,0,0)`. Its full 2 ft interior profile spans `(11.128291130,19.697270012,6.666666508)` to `(11.128291130,17.597270012,6.666666508)`. Original support triangle indices are included in the JSON. Its 4/6 ft footprint and 3 ft landing fail coverage.

Upper-floor O1/G1 to B would descend 11.642305374 ft: at 1:12 this requires 139.707664488 ft climbing run, beyond the 72 ft bound; source landings also fail. They are explicitly rejected as architectural/bounded-family failures, not silently discarded or declared globally impossible. O2 supplies no qualifying source footprint.

For **each** of the two B pairs:

| Existing route | First failure | Independent collision check of that exact emitted geometry |
|---|---|---|
| Direct | Reverses through opening interface | G1 collision |
| Curved | Local centreline ramp slope | G1 collision |
| Left detour | Local centreline ramp slope | G1 collision |
| Right detour | Local centreline ramp slope | G1 collision |
| Left bridge alignment | Local centreline ramp slope | G1 collision |
| Right bridge alignment | Local centreline ramp slope | O1 collision |
| Left switchback | Reverses through opening interface | G1 collision |
| Right switchback | Insufficient switchback landing length | O1 collision |

The independent B collision audit is diagnostic-only, after routing; it never promotes a rejected path. All 16 B alternatives collide, including those rejected before detailed construction. A repaired path or mesh would require fresh validation; a collision in the old geometry cannot prove every repair would collide.

## G–H. Validated connectors and complete first-failure totals

**Zero new connectors; zero new graph edges.** Original two links, two components and isolated L1 are preserved.

Source proposals rejected before pairing:

| Failure | O1 | G1 | O2 | Total |
|---|---:|---:|---:|---:|
| A: incomplete/overlapping continuous floor coverage | 15 | 180 | 6 | 201 |
| A: local approach slope | 0 | 139 | 3 | 142 |
| A: interior swept clearance/headroom | 0 | 8 | 0 | 8 |
| B: opening swept clearance/headroom | 0 | 3 | 0 | 3 |
| **Rejected / proposed** | **15 / 24** | **330 / 337** | **9 / 9** | **354 / 370** |

All six destination windows pass their 2 ft qualification, so category C has zero rejections. Each passing source pairs with all six targets, giving 96 walking-qualified pairs. Of these, **62** fail bounded ramp-run plus stair-landing feasibility before path construction: O1 36, G1 26. Stage 1 profile contact and span reject none in this fixture. **34 pairs** proceed: O1 18 (C), G1 16 (12 upper-to-C, four lower-to-A/B). No eligible pairs or route families are omitted by the final test budgets.

The 34 pairs produce **272** existing route alternatives:

| First failure | O1–L1 | G1–L1 | O2–L1 | Total |
|---|---:|---:|---:|---:|
| D: reverses through opening interface | 36 | 28 | 0 | 64 |
| D: local centreline ramp slope | 12 | 28 | 0 | 40 |
| E: individual emitted ramp-edge slope | 16 | 12 | 0 | 28 |
| E: folded/reversed loft section | 24 | 16 | 0 | 40 |
| F: original source triangle collision | 44 | 26 | 0 | 70 |
| G: switchback landing length | 12 | 18 | 0 | 30 |
| **Total / accepted** | **144 / 0** | **128 / 0** | **0 / 0** | **272 / 0** |

104 route paths fail preliminary checks; 168 enter detailed validation. Every one of the **68 E-first-failure cases independently fails emitted-geometry collision**. Thus valid endpoint interfaces do not establish a collision-free route, and construction is not proven to be the sole limiting factor. Categories identify first failures, not mutually exclusive physical defects. D means incompatible with the tested path/bound, never proof of impossibility across all possible routes.

## I–J. Geometry fidelity and previous connections

The test hashes normalized original positions, normals and face topology before/after, and checks unchanged full session bytes:

| Original | SHA-256 |
|---|---|
| O2 | `6c61b56e61cb0c3a8c200a0d19713170eab61d313be9883a9b6085f88089f3af` |
| O1 | `0050467218bcf92c83da4b736ddaba4b4db52f66b13438df6492b29017dae25e` |
| G1 | `780b13781015d7dba2ac35824229edb6972569eaccc7a2dea0e41df54663d460` |
| L1 | `419ebffbc55238b96ed0f0fea8401c9b6d13115887b992dd7c7b69688bb807a2` |
| Session | `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b` |

All **47,921** original vertices match renderer-root placement within 1e-5 ft; maximum measured error **6.7435e-7 ft**. Exact serialized equality holds for the original six emitted mesh pieces forming the ramp and stair, across checkpoint and updated cold/warm evaluation. No circulation thresholds or descriptor algorithms changed.

## K. Performance and validation

Fresh-process ABBA benchmark order: checkpoint, updated, updated, checkpoint. Identical original inputs; each process performs analysis once and four fixed-placement evaluations. No full search. Saved `benchmark-{checkpoint,updated}-{1,2}.json` separates classification (a subset of analysis), total analysis, first evaluation and three warm evaluations. Times below are seconds:

| Version / run | Classification | Total analysis | Cold evaluation | Analysis + cold | Warm evaluations |
|---|---:|---:|---:|---:|---|
| Checkpoint 1 | 7.557 | 8.951 | 6.918 | 15.868 | .179, .161, .150 |
| Updated 1 | 5.286 | 6.462 | 5.446 | 11.908 | .084, .067, .067 |
| Updated 2 | 3.219 | 4.186 | 7.076 | 11.262 | .205, .159, .150 |
| Checkpoint 2 | 7.971 | 9.305 | 6.438 | 15.743 | .193, .157, .158 |

Mean cold evaluation: checkpoint **6.678 s**, updated **6.261 s**. There is substantial host/process variability; these two-run samples do **not** establish a dependable speedup. Classification source is unchanged; its apparent timing improvement is not attributed to this change. The prior reported 7.24 s combined result was a different run and is not substituted for this session's matched-input measurements. Existing cold classification cost remains visible and unresolved. Normal assembly evaluation does not invoke the new discovery workflow.

The final full diagnostic run additionally measured the opt-in workflow (after fixture analysis/evaluation): O1 cold **3.221 s**, warm **.163 s**; G1 cold **3.815 s**, warm **.083 s**; O2 cold **.056 s**, warm **.009 s**. These relationship timings share previously prepared scene metadata; they are not independent process-cold totals. Discovery accounts for 2.621/3.222/.056 s respectively; detailed construction/independent E audit .570/.550/0 s. Test-only 1,110 full-scan comparisons and supplemental B audits are excluded from these workflow timers. Final test execution overlapped lint, so use the isolated ABBA table for standard before/after comparison.

No additional unrestricted triangle scan was added per footprint. The XY grid conservatively narrows support/obstruction triangles; it does not truncate vertical clearance. Exact enclosure material queries reuse revision/transform-specific metadata. Discovery caches include other form geometry and emitted connector revisions. Larger-depth rejection reuses a failed contained prefix. The deterministic test compares **1,110 original-mesh footprint results** against the checkpoint's full-scan implementation, including prefix shortcuts; validity, successful physical region and minimum headroom agree. Cache tests exercise in-place vertices/topology, moved/lifted/rotated/mirrored placements, and a thin obstruction between samples.

Required validation:

- Local-material regression: PASS, including the independent disputed-triangle material oracle, original 24 interfaces and B depth/width results.
- Surface orientation: PASS; 54 formerly suppressed candidates still receive geometric evaluation; underside and lower-floor headroom rejections preserved.
- Stage 1 attachment regression: PASS; confirmed surface-contact acceptance and invalid voxel links retain behavior.
- Phase 1.5: PASS shared geometric-candidate/emitted-geometry parity and cache invalidation. The previously documented 148 added/148 removed rejected candidates from local-material classification remain accounted for, not mistaken for new differences.
- Legacy bounded Stage 2A: PASS cold/warm parity; original 192 outcomes unchanged.
- New bounded approaches: PASS all 1,110 full-scan comparisons, original 24 replay, complete finite proposal pool, 34 qualified pairs/two B pairs, obstruction/invalidation tests, original geometry/renderer checks and unchanged connectors.
- ESLint on all four changed/new TypeScript files and new CommonJS harness: PASS. Repository-wide lint still fails in existing scripts/reports; the CommonJS test harness has a narrowly documented require-import exception.
- `npx tsc --noEmit`: six existing failures, no new-file errors: TS5097 in `descriptorCache.test.ts` lines 3/4, `descriptorRank.test.ts` line 3, `descriptorV2.test.ts` line 3 and `openVolume.test.ts` line 3; TS2352 for the existing `faces: {}` fixture in `descriptorCache.test.ts` line 13. These unrelated tests were not edited.
- `npm run build`: PASS, all 11 pages generated. Initial sandbox run hit Windows SWC path AccessDenied; approved execution outside the sandbox completed. Existing unrelated warnings remain. Build success does not replace the separate TypeScript failure report.

Reproduce the new suite with `node scripts/l1-interior-approaches.cjs`. Use `--checkpoint --benchmark` and `--benchmark` for matched-input standard evaluation timing. Existing regression outputs were redirected under this report directory so checkpointed reports remain untouched.

## L. Recommendation and remaining limitations

**Recommend a separately authorized, bounded Stage 2B L1 placement/orientation feasibility study using these qualified interfaces and the existing route families.** Discovery and material classification now expose real source walking regions; further relaxation of floor classification is not supported by this evidence. At the current placement, all exact B route geometries collide with G1 or O1, and construction-first-failure cases also collide. A construction-only repair has therefore not been shown sufficient.

This is a feasibility recommendation, not a claim that moving L1 will solve it: 12 B alternatives first collide with G1 itself, so changing the destination may still leave an obstructed source exit. Begin with a small explicit L1 variant/placement set, retain the existing two links and all surface/width/slope/landing/headroom gates, and report blockers and emitted geometry for every candidate. Prioritize region 58 to B. Keep scoring separate from circulation acceptance. If G1 exit obstruction persists across those bounded placements, return to a targeted existing-family exit/loft feasibility investigation before expanding routes or global search.

The 2.1 ft source width and missing stair landings remain architectural constraints; a conceptual result must not be reported as an accessible network. The sampled finite boundary windows do not exhaust every possible opening position or direction. A/C are comparison cases, and no internal whole-building accessibility proof is made. Valid 2 ft local support is not proof of global internal circulation.

No Stage 2B implementation has begun. Stop here for authorization.

## Evidence appendix: all qualified source windows

All rows: width 2.1 ft; only 2 ft depth passes; 4/6 ft and strict 3 ft landing fail coverage. The complete JSON retains exact coordinates, footprint polygons/profiles and support triangle indices.

| Form | Window ID | Point (x, y, z), ft | Physical region | Original three passing interfaces? |
|---|---|---|---:|---|
| O1 | `approach-5-2.1-1.371829` | (19.868121338, 8.663131714, 20.000000000) | 26 | Additional |
| O1 | `approach-6-2.1-1.438411` | (18.496292114, 7.613131714, 20.000000000) | 26 | Additional |
| O1 | `approach-7-2.1-1.050000` | (19.868121338, 6.174720764, 20.000000000) | 26 | Additional |
| O1 | `approach-5-2.1-1.210915` | (19.707206726, 8.663131714, 20.000000000) | 26 | Yes |
| O1 | `approach-6-2.1-1.244205` | (18.496292114, 7.418926239, 20.000000000) | 26 | Yes |
| O1 | `approach-7-2.1-1.210915` | (19.707206726, 6.174720764, 20.000000000) | 26 | Yes |
| O1 | `approach-5-2.1-1.050000` | (19.546292114, 8.663131714, 20.000000000) | 26 | Additional |
| O1 | `approach-6-2.1-1.050000` | (18.496292114, 7.224720764, 20.000000000) | 26 | Additional |
| O1 | `approach-7-2.1-1.371829` | (19.546292114, 6.174720764, 20.000000000) | 26 | Additional |
| G1 | `approach-47-2.1-1.050000` | (13.128291130, 18.647270012, 6.666666508) | 58 | Additional |
| G1 | `approach-147-2.1-1.768802` | (21.352729988, 10.571971893, 20.000000000) | 178 | Additional |
| G1 | `approach-148-2.1-1.050000` | (21.352729988, 13.128291130, 20.000000000) | 178 | Additional |
| G1 | `approach-147-2.1-1.409401` | (20.993329048, 10.571971893, 20.000000000) | 178 | Additional |
| G1 | `approach-148-2.1-1.409401` | (20.993329048, 13.128291130, 20.000000000) | 178 | Additional |
| G1 | `approach-147-2.1-1.050000` | (20.633928108, 10.571971893, 20.000000000) | 178 | Additional |
| G1 | `approach-148-2.1-1.768802` | (20.633928108, 13.128291130, 20.000000000) | 178 | Additional |

Repository-wide ESLint total: **172 existing errors**; zero errors in the files changed for this assignment. Full machine-readable output: `eslint-repository.json`.
