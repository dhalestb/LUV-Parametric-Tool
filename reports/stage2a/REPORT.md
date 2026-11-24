# Stage 2A — Alternative connection routing

2026-10-08. **No additional L1 connection passed the bounded evaluation.** The graph remains two components with L1 isolated. This is a negative result for the evaluated attachments and route families, not proof that L1 cannot connect.

## A. Phase 1.5 checkpoint and baseline

Approved Phase 1.5 work was reviewed and checkpointed locally as **a0cef60c0baaec6847b37404745a003c5110fd52** (`a0cef60`), on `organic-lattice-connections`, following Phase 1 checkpoint `6a839db`. Before committing, the attachment regression, complete fixed-fixture classification/mesh parity, cache-invalidation tests and OBJ hashes passed. The verification measured 2.979 s cold and 0.118–0.182 s warm. All modified/untracked files belonged to Phase 1.5; the working tree was clean immediately after the commit and before Stage 2A edits.

No GitHub/Vercel push or D: drive modification occurred. Stage 2A changes are uncommitted for review. No dependencies were installed.

## B. Files and functions

Stage 2A changes:

- [surfaceAttachment.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceAttachment.ts:269): new `enumerateWalkableAttachments`, reusing the existing exact-source index, boundary runs, transforms, edge windows and geometry-revision scope. Existing attachment functions are unchanged.
- [alternativeRouting.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/alternativeRouting.ts:15): new `evaluateAlternativeRoutes`, `routeAlternatives`, `validateAlternative`, and explicit budgets. This is an opt-in API for specified relationships, with no normal application/UI/search integration.
- [connectionClearance.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/connectionClearance.ts:88): new `landingHeadroomCheck`, using existing geometry-aware BVHs and exact vertical segment/triangle intersections for source meshes and existing connectors. Existing `transitionSurfaceClear` logic is unchanged.
- [l1-alternative-routing.cjs](C:/Users/DHale/Documents/Codex/Cursor-APP/scripts/l1-alternative-routing.cjs): new deterministic original-session harness, two-pass timing, coverage/rejection records, parity and fidelity assertions, and routing regressions.
- This report and `default-final.json`, `expanded-final.json`, `test-confirmation.json`, `phase15-regression.json` provide the evidence.

Also inspected `connectionPorts.ts` (`extractConnectionPorts`, `extractSourceEdgePorts`), `organicConnections.ts` (`detectFeatures`, `findOrganicLinks`, `sealOrganicGraph`), `portConnectionValidation.ts`, `portMatching.ts`, `connectionSynthesis.ts`, `transitionGeometry.ts`, `analyze.ts`, and the Phase 1/1.5 reports. They explain the previous caps and route/validation behavior; they were not rewritten.

## C. Attachment selection

Original discovery caps proxy/source ports at 32 and organic features at 18 (10 tips and 8 edges), then limits organic drafts to 12. Organic snapping chooses one nearby facing boundary. The new opt-in enumeration bypasses those feature/port caps by working directly from the existing upward-triangle boundary index. It does not change normal port extraction.

For each eligible boundary run it proposes 3 ft and 2.1 ft windows at center, 20% and 80% positions, clamped to the actual edge. Duplicate profiles are removed. Round-robin ordering retains different runs before extra windows on a run. Source and target queues both participate in pair selection; distance, facing and elevation affect order, but the shortest proposal is not automatically accepted. All selected pairs receive every route family within budget.

These are geometric proposals, not presumed walkable interfaces. Stage 1 `fitLoftContact(..., false)` requires walkable surface contact, disallowing wall-only attachments. Approach/landing probes additionally check actual source triangles behind the outward boundary. The underlying index still has limits: nearly horizontal boundary segments, upward normals, straight-run merging and a minimum 2 ft run. Sloped or curved regions outside those representations remain unexplored.

Expanded coverage:

| OBJ | Eligible boundary runs | Distinct proposed windows | Retained windows | Actually used windows |
| --- | ---: | ---: | ---: | ---: |
| O1 | 8 | 24 | 24 | 24 |
| G1 | 151 | 339 | 256 | 256 |
| O2 | 6 | 9 | 9 | 9 |
| L1 | 20 | 84 | 84 | 84 for O1/G1; 50 for O2 |

The expanded pass omits 83 G1 windows. L1 windows outside the O2 distance bound remain unavailable to that relationship. The counts are windows on runs, not 84 independent floors or verified internally connected regions.

## D. Route families and independent relationships

Placements are exactly O2 `(0,0),v0`, O1 `(1,0),v2`, G1 `(1,1),v0`, L1 `(2,1),v3`; all z indices are zero. The original 4 × 4 × 1 lattice and session OBJ transforms are unchanged.

Eight families per selected pair: direct, existing smooth curve, left/right 4 ft detours, left/right 8 ft bridge alignments, and left/right switchbacks using the existing generator. Ramp versus stair emission uses the existing `transitionMeshes` machinery. No source OBJ is modified and no detached pads/platforms are added.

The geometric checks inspect emitted stair treads/risers and individual ramp segments on both walking edges as well as the centerline. Switchback level landing length is checked independently. Width, folded/reversed sections, projected ribbon self-crossing, source landing support, emitted-mesh collision and headroom all gate acceptance. Existing route geometry and clearance caches are retained.

Stage 2A uses explicit conservative screening assumptions: 2 ft minimum walking width; 0.6 ft maximum riser (matching the existing emitter), 0.75 ft minimum tread, 0.02 ft tread/cross-level tolerance; stair approach depth at least max(3 ft, width); other approaches 2 ft; switchback landing length at least max(3 ft, width); ramp segment slope at most 1:12 and walking cross slope at most 1:48. Approach support is sampled every 0.5 ft in depth at five width positions, using the existing 0.2 ft contact tolerance. These additional opt-in screens do not change legacy thresholds and are **not code-compliance certification**. Some rejected proposals might become feasible with a differently designed landing or stair.

Routes are also limited to 50 ft endpoint plan span, 72 ft path run and the four-bay plan footprint `[-10,70] × [-10,70]` ft (bay centers at 0,20,40,60). They cannot create unrestricted all-to-all connections. No extra vertical field clipping is imposed on the original OBJ elevations; no stacking or zLift changes occur.

| Relationship | Pairs inside distance bound | Pairs evaluated | Routes evaluated | In-range pairs omitted |
| --- | ---: | ---: | ---: | ---: |
| O1–L1 | 2,016 | 512 | 4,096 | 1,504 |
| G1–L1 | 21,504 | 512 | 4,096 | 20,992 |
| O2–L1 | 337 | 337 | 2,696 | 0 |

O2–L1 additionally has 419 retained-window combinations outside the explicit distance range. This is a targeted expansion to a two-bay relationship, not a change to global port tolerances. The default budget is 64 retained windows per OBJ, 96 pairs and 768 routes per relationship. The expanded pass uses 256 windows, 512 pairs and 4,096 routes; hard guards reject unbounded input.

### Specific geometric findings

**O1–L1:** Changing elevations and edge windows does not overcome the sampled conflicts. A representative alternative from O1 `(19.707,8.663,20.000)` to L1 `(35.844,24.478,18.524)`, width 2.1 ft, reaches exact mesh validation but intersects **void workspace.obj**. A lower stair proposal starting at O1 `(30.000,2.753,2.248)` fails source landing support at `(27.500,1.703,2.248)`: the nearest surface is a wall 0.496 ft away. The original L1 headroom obstruction remains independently reproduced by the regression probe; it was not relaxed. In the final gate order, new candidates can fail earlier collision/support tests, so zero first-failure headroom counts here do not imply that the original headroom issue was solved.

**G1–L1:** A representative direct stair from G1 `(18.497,24.362,3.819)` to L1 `(35.844,11.783,6.396)` intersects **Gathering, Linear.obj**. An alternative near-level right bridge alignment from G1 `(12.361,24.362,6.091)` to L1 `(35.844,11.333,6.398)` avoids earlier failures but its standing-clearance probe around `(16.405,9.684,6.229)` hits the unrelated **void workspace.obj**. This demonstrates why validation must include all four originals, not only the intended endpoints.

**O2–L1:** Longer candidates were evaluated, including all 337 window pairs inside the 50 ft span budget. None reaches a valid connection. At a representative upper O2 approach, `(1.033,-3.414,17.999)` is 0.344 ft from the nearest floor, outside the 0.2 ft support tolerance; a lower approach similarly misses by 0.351 ft. Other candidates fail local slopes, tread geometry, reversed loft sections or the bounded footprint. This shows limitations of the sampled edge/landing arrangement, not that every longer route is impossible.

## E. Counts and unresolved coverage

Expanded pass: **10,888 alternatives evaluated, 0 accepted**. Each receives one first-failure reason; later gates are not implied to pass. Repeated warm evaluations are not counted as additional unique routes.

| First failure | O1–L1 | G1–L1 | O2–L1 |
| --- | ---: | ---: | ---: |
| Folded/reversed section | 1,897 | 1,225 | 1,370 |
| Individual ramp segment slope | 473 | 699 | 245 |
| Switchback landing length | 628 | 540 | 94 |
| Stair landing support | 514 | 839 | 241 |
| Walking approach support | 99 | 241 | 146 |
| Stair tread | 26 | 115 | 503 |
| Stair cross slope | 296 | 43 | 0 |
| Self-intersecting ribbon | 18 | 109 | 0 |
| Source triangle collision | 29 | 277 | 0 |
| Route headroom | 0 | 8 | 0 |
| Outside bounded lattice footprint | 116 | 0 | 97 |
| **Total** | **4,096** | **4,096** | **2,696** |

Of these, 10,675 fail a geometry/circulation/support screen and 213 exceed the chosen footprint policy. The 22,496 in-range but unselected pairs, 419 distance-excluded pairs, and omitted G1 windows remain unresolved. There is no exhaustive count of all possible attachments or routes. The default pass separately evaluates 2,304 routes with zero accepted; it overlaps the expanded pass and is not added to its unique coverage count.

The JSON records retain every proposal's actual endpoint identities, transforms, profiles and first-failure classification. Full paths and detailed evidence are kept for the first example of each route-family/reason combination; other paths are reproducible from the original endpoints and route family. This bounds report size.

## F. Connectivity

Before and after: valid O2–O1 and O2–G1 relationships; **two object components, isolated L1**. No new edge is inserted because no alternative passed validation. The existing graph insertion correction and all 54 formerly suppressed candidates are preserved.

Each relationship is evaluated independently against the same baseline connector set. Alternatives are not combined without mutual collision checking. The harness can report the effect of a single accepted L1 edge on object-node components, but it always reports `fullyValidatedCirculation: false` and `internalContinuity: unverified`: a route entering one surface region does not prove a route through disconnected floors/regions of the same OBJ. No fully validated four-form network is claimed.

## G. Geometry and OBJ fidelity

Original session SHA-256 remains `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`. Loaded positions, normals and faces are hashed before and after evaluation. All four geometry hashes match Phase 1.5; they are included in each JSON report. No public sample mesh, source edit, remeshing or decimation was used. Geometry mutation tests operate only on copies.

The legacy classification oracle and every emitted legacy connector vertex/index remain equal to Phase 1. Changes do not touch descriptor scoring, typology generation, search weights, placement optimization, lattice dimensions, normal UI or Board Mode.

## H. Tests and build

- `node scripts/l1-performance.cjs --label=stage2a-regression --invalidation`: PASS. Every baseline candidate/direct report/graph outcome and emitted connector matches the Phase 1 oracle. All 54 corrected G1–L1 candidates remain evaluated. Geometry, transform and parameter invalidation checks pass. Output retained as `phase15-regression.json`.
- `node scripts/connection-attachment-check.cjs`: PASS; surface-anchored ramp/stair and invalid voxel-only rejection preserved.
- Default and expanded `l1-alternative-routing.cjs` runs: PASS for cold/warm classification and emitted-geometry parity, deterministic budgets, endpoint continuity, original OBJ hashes and unchanged two-component baseline.
- Added regressions reject a narrow route, an explicitly disconnected route endpoint, a too-short switchback landing, and a route whose acceptable average slope hides an excessive individual walking-edge segment. Original L1 headroom stays blocked; moving copied source geometry invalidates the headroom spatial index and clears that test probe.
- ESLint on changed sources and `git diff --check`: PASS.
- `npx tsc --noEmit --incremental false`: same six pre-existing errors in untouched evaluation tests (five TS5097 extension imports; one TS2352 descriptor fixture cast). No new diagnostics. No unrelated test repairs were made.
- `npm run build`: PASS after the required sandbox retry. The first attempt failed because Windows denied SWC directory canonicalization. The permitted local retry compiled, checked types and generated all 11 pages. Existing unused-variable and React-hook warnings remain outside this change.

Reproduce only bounded work:

```powershell
node scripts/l1-alternative-routing.cjs --label=default-final
node scripts/l1-alternative-routing.cjs --pairs=512 --attachments=256 --label=expanded-final
node scripts/connection-attachment-check.cjs
```

## I. Performance

Normal fixed-placement evaluation still uses the unchanged pipeline. The current parity/invalidation run measured **2.245 s cold**, warm **0.108 / 0.097 / 0.081 s** (median 0.097 s). Phase 1.5 reference medians were 3.009 s and 0.0962 s. This single current comparison confirms preserved warm behavior, not a newly established cold speedup.

Routing costs are additional opt-in costs, measured after baseline evaluation has populated shared source indexes. “Cold alternatives” means first evaluation of these route queries; it is not application-startup cold. O1, G1 and O2 execute serially and share geometry caches. Timing includes diagnostic capture but excludes mesh analysis, result serialization and post-run assertions.

| Budget / relationship | First alternative pass | Repeated pass |
| --- | ---: | ---: |
| Default O1–L1 | 0.345 s | 0.131 s |
| Default G1–L1 | 0.873 s | 0.111 s |
| Default O2–L1 | 0.145 s | 0.332 s |
| **Default total, 2,304 routes** | **1.363 s** | **0.575 s** |
| Expanded O1–L1 | 1.206 s | 0.975 s |
| Expanded G1–L1 | 2.901 s | 1.044 s |
| Expanded O2–L1 | 0.711 s | 0.958 s |
| **Expanded total, 10,888 routes** | **4.818 s** | **2.978 s** |

Default generation costs total 42 ms first / 27 ms repeated; validation 1,311 / 541 ms. Expanded generation totals 167 / 202 ms; validation 4,619 / 2,731 ms. Remaining time is reporting/counter bookkeeping within evaluation. These are observations from `default-final.json` and `expanded-final.json`, not repeated statistical medians. Host variability is visible, including an O2 warm pass slower than its first pass.

Expanded surface-gap cache: first-pass misses O1 762, G1 4,628, O2 57; repeated misses zero, with respectively 39,439 / 57,130 / 18,498 hits. Source-clearance checks: O1 58 and G1 819 cold misses become the same numbers of warm hits; O2 routes fail earlier and perform zero source-clearance checks. No validation result is reused across different geometry or transformed query values. There is no cache of final route acceptance; cheap structural checks still run on repeats.

Do not multiply these measurements into a claimed full-search runtime. Do not enable thousands of alternatives for every placement candidate by default.

## J. Remaining limitations

This evaluator broadens attachment and route coverage without changing placements, but is not a general obstacle router. It samples discrete straight boundary windows, eight route families and limited pairs. The existing loft generator frequently folds when detours disagree with boundary directions. Existing stair meshing can produce unacceptable tread/cross-level geometry; those proposals are rejected rather than repaired. Longer exterior routes, unsampled sloping/curved attachments, custom intermediate landings and other flight layouts remain unexplored.

Approach support and headroom use finite sampling consistent with the existing validation approach. They do not prove continuous coverage of an entire landing or code-compliant accessibility; an accepted future route would still need stronger landing-area and internal-region continuity verification before claiming fully validated building circulation. No accepted route was found here, so this limitation did not create a graph edge. Existing baseline connections retain their prior classification; this opt-in investigation does not retroactively certify them against every additional Stage 2A screen.

No arbitrary source walls, undersides, or voxel proximity were accepted as new circulation. No new connector geometry is installed in the application because none passes the gates.

## K. Recommended Stage 2B strategy

If authorized, begin with a small explicit neighborhood of L1 orientations and adjacent bays while freezing the other placements. Rank opportunities by compatible walkable regions, supported approaches, elevation and obstruction evidence before expensive routing. Carry forward the exact-source gates and test multiple promising region pairs, then evaluate confirmed component reduction before descriptor scoring. Keep scoring/weights unchanged until separately approved.

First add or define region-level internal circulation evidence; do not equate one node per OBJ with floor-to-floor continuity. Use the default route budget only on a short list of promising placements and expand budgets for selected unresolved cases. Measure cache misses and runtime per fixture before any broad search. A separate routing improvement could address the observed folded lofts and inadequate switchback landings without weakening geometry checks.

**Stage 2B and the full placement search have not begun. Await authorization.**
