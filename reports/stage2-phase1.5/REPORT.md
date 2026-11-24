# Phase 1.5 — Performance stabilization

Completed 2026-10-08. Scope: bounded evaluation of the four original session meshes at fixed placements in the existing 4 × 4 × 1 configuration. No complete search, new routes, placement changes, scoring changes, threshold changes, or presentation changes.

## A. Recoverable Phase 1 checkpoint

Local commit **6a839db9e88e67fdea0b986a1671814df03f2802** (`6a839db`), `Checkpoint Stage 2 Phase 1 L1 diagnostics and confirmed connectivity`, on `organic-lattice-connections`.

Reviewed the intended Phase 1 source, diagnostic script, regression tests and reports before committing all 18 files. The attachment regression passed before the checkpoint; the working tree was clean immediately afterward. Stage 1 checkpoint `cd40b20` remains in the history. No push occurred and the D: repository was not modified. Phase 1.5 changes are left uncommitted for review.

## B. Profiling and verified bottlenecks

The benchmark loads either checkpoint lattice source through `git show` in memory or current working-tree source. Both use the same installed TypeScript loader, Node v24.21.0, original session, transforms and evaluation calls. It performs `evaluateAssembly`, `matchAssemblyPorts`, and `synthesizeConnectors`; it never invokes assignment search.

| Code / original OBJ | Bay (x,y,z) | Variant |
| --- | --- | --- |
| O2 / undulating workspace.obj | 0,0,0 | 0 |
| O1 / void workspace.obj | 1,0,0 | 2 |
| G1 / Gathering, Linear.obj | 1,1,0 | 0 |
| L1 / Lobby, Vertical Void.obj | 2,1,0 | 3 |

Each fresh process analyzes source meshes before timing, then evaluates once with cold connection caches and three times with warm caches. Source loading, analysis, report serialization, parity assertions and invalidation tests are outside the measured interval. Thus “cold” is connection-evaluation cold, not application startup.

Separate profiler runs add identical coarse function/loop probes and use diagnostics with no retained events. The following are profiler observations, not the uninstrumented acceptance timings. Nested inclusive times must not be added together.

| Operation | Phase 1 profile | Optimized profile | Interpretation |
| --- | --- | --- | --- |
| Port pair assessment | 3,853 calls; warm 5–10 ms | same count; warm 4–6 ms | Candidate enumeration/scoring was not the bottleneck. |
| Organic feature extraction | 10 calls; cold 8 ms, warm approximately 0.003 ms | 10 calls; cold 7 ms, warm negligible | Existing feature reuse already worked. |
| Surface-distance queries | cold 1,814 ms; warm 1,872–1,988 ms | cold 210 ms; warm 4.5–6.5 ms | Repeated exact nearest-triangle work dominated the warm regression. |
| Source triangle collision loops | cold 1,050 loops, 1,077 ms; warm no loops | cold 1,050 loops, 1,579 ms; warm no loops | Existing source-result caching was already avoiding warm exact collision work. Optimized loop timing includes lazy mesh construction; timing noise and nesting prevent attributing its cold increase to collision arithmetic alone. |
| Headroom | cold 669 loops, 32 ms; warm no loops | cold 669 loops, 39 ms; warm no loops | Checks remain active on misses; exact unchanged inputs reuse results. |
| Collision/clearance, inclusive | cold 3,238 ms; warm 307–312 ms | cold 3,104 ms; warm 18–27 ms | Warm overhead existed even on cached clearance results. |
| Connector mesh generation | warm 415 calls, 31–35 ms | warm 4 calls | Lazy construction also avoids triangle conversion/allocation before cache hits. |
| Connection synthesis, inclusive | warm 25–42 ms | warm 10–15 ms | Includes attachment/clearance subcalls. |
| Graph evaluation, exclusive | warm approximately 0.08–0.10 ms | sub-millisecond | Graph bookkeeping does not explain the regression. |

Cold optimized clearance still dominates. Its approximately 1,486 ms exclusive residual includes source triangle conversion, closed-surface detection, BVH construction, signatures and other bookkeeping; these were not separately isolated, so this is not a measured BVH-only duration. Triangle collisions are the other substantial cold cost. Additional validation alone did not justify the former warm overhead.

Raw profiles: `phase1-profile.json` and `optimized-profile.json`. Cold optimized surface queries have 303 misses and 3,200 hits. Warm queries have 3,469 hits and no misses. Each warm evaluation has 1,054 source-clearance hits and no misses. Source contents are checked eight times per evaluation (four matching, four synthesis), rather than once per geometric query.

## C. Exact optimizations and source references

- `src/components/lattice/surfaceAttachment.ts`: `measureSurfaceGap` now caches exact local query coordinates, radius and walkable tolerance per source-content revision, with a bounded 8,192-entry map. Returned records are copied. Before exact point/triangle distance, triangle AABB distance supplies a conservative lower bound; a triangle is skipped only when it cannot improve either the nearest surface or nearest walkable surface. `buildIndex` and `confirmedWalkableInterface` use content revisions; interface keys include actual rotation/mirror and placement/lift.
- `src/components/lattice/connectionClearance.ts`: `transitionSurfaceClear` constructs connector meshes/triangles lazily, after a source-clearance miss or when an existing connector requires checking. Source BVHs/results and connector BVHs use exact content revisions. The existing 2,000-entry source-result limit remains. The source-result key no longer rounds coordinates to nine decimals; it covers local path/endpoints/profiles/directions, widths, class, rise, plan, angle, lateral offset and endpoint role. Existing-connector collision and seam checks still run against the current connector set; there is no cached whole-assembly approval.
- `src/components/lattice/geometryRevision.ts` (new): `geometryRevision` compares every position and triangle/index with a snapshot, detecting replacement and in-place mutations. WeakMap revision identities invalidate dependent caches without probabilistic hashes. `beginGeometryValidation` amortizes this comparison across a synchronous outer validation call. It must not span asynchronous work or mutations during a call.
- `src/components/lattice/portMatching.ts`: `matchAssemblyPorts` opens that synchronous scope. `portPairClearanceValidated` additionally checks source revisions and actual variant transforms before reusing the prepared-route certificate. Phase 1 confirmed graph insertion and candidate eligibility remain unchanged.
- `src/components/lattice/connectionSynthesis.ts`: `synthesizeConnectors` opens the synchronous scope. Emitted-geometry validation remains intact.
- `scripts/l1-performance.cjs` (new): bounded benchmark, opt-in coarse profiling, complete fixture-result comparison and mutation/invalidation regressions. It does not add normal-use console logging.

No placement candidate was removed or reordered. No route was added. Existing geometric acceptance tolerances, surface-contact checks, triangle intersection, headroom probing and closed-source checks are unchanged. Source-local spatial indexes remain reusable across transforms; changing transforms changes local query keys or interface/certificate identities.

## D. Before-and-after performance

Three serial comparison pairs, each using separate fresh processes and four evaluations. Main runs have profiling and diagnostic capture disabled. Medians are over three cold samples and nine warm samples respectively.

| Evaluation | Phase 1 checkpoint | Phase 1.5 | Reduction | Speedup |
| --- | --- | --- | --- | --- |
| Cold median | 5.832 s | 3.009 s | 48.4% | 1.94× |
| Warm median | 2.100 s | 0.0962 s | 95.4% | 21.8× |
| Cold range | 5.303–6.517 s | 2.695–3.274 s | | |
| Warm range | 1.577–2.371 s | 0.0552–0.1363 s | | |

Raw results: `phase1-run1.json` through `phase1-run3.json`, and corresponding `optimized-run*.json`. The previously reported 4.49/1.65 seconds are historical context, not the denominator: both implementations were remeasured with identical fixture inputs and the same harness here. Host scheduling causes visible variation; these are local bounded observations, not a full-search speed prediction. Warm performance is back near the historical pre-Phase-1 level, while cold evaluation remains above the historical 1.92 seconds.

Reproduction from repository root (no dependency installation):

```powershell
node scripts/l1-performance.cjs --ref=6a839db --label=phase1-check
node scripts/l1-performance.cjs --label=optimized-check
node scripts/l1-performance.cjs --ref=6a839db --label=phase1 --profile
node scripts/l1-performance.cjs --label=optimized --profile
node scripts/l1-performance.cjs --label=invalidation --invalidation
node scripts/connection-attachment-check.cjs
```

## E. Regression results and geometric parity

PASS: deep equality with the checkpoint oracle across every port candidate outcome/reason and embedded score, direct report, confirmed report, graph field, organic rejection diagnostic, and emitted connector vertex/index. Cold and warm results also compare equal. The oracle is `phase1-classifications.json`; normalized result SHA-256 is `4e1892a91d3e08b8336fb0d82ef7d1ff3ee759b0f7478b809e78a28785cc17e9`.

- All **54** formerly suppressed G1–L1 candidates remain eligible and receive geometric outcomes: 47 collision, 3 slope, 4 surface attachment; none is rejected as network-redundant.
- Invalid direct voxel connectivity remains rejected. The valid O2–O1 ramp and O2–G1 organic stair remain accepted with unchanged geometry. Six emitted mesh pieces represent two circulation relationships, not six graph edges.
- There are still **two components**, with **L1 isolated**. L1 was not artificially connected.
- The original L1 fixture still fails a live headroom check. Surface contact remains active. These validations are cached only for unchanged inputs.
- PASS invalidation tests for source vertices/topology, replacement source objects, placement/lift/rotation/mirror, query radii/tolerances, changed connection path (including a 1e-10 edit), widths, directions, profiles, class and endpoints. Mutating derived source geometry invalidates direct-interface/headroom/prepared-route results. Mutating existing connector vertices or indices invalidates its spatial tree. All destructive mutation tests operate on clones.
- `connection-attachment-check.cjs`: PASS, including Stage 1 attachment regressions.
- ESLint on all five changed/new source files: PASS. `git diff --check`: PASS.
- Full TypeScript check (`npx tsc --noEmit --incremental false`): still fails on the same six pre-existing descriptor/evaluation-test diagnostics (five TS5097 import-extension errors and one TS2352 descriptor fixture conversion). No new errors were reported. Unrelated tests/source were not changed to hide them.

Architectural scoring and placement/search source have no diff from the Phase 1 checkpoint. This establishes parity for the bounded fixture and explicit mutation cases; it does not prove every possible future placement.

## F. Original OBJ fidelity

The raw `checkpoints/lattice-session.json` is unchanged: SHA-256 `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`.

Each benchmark hashes the original loaded positions, normals and faces before analysis and after evaluation, with equality asserted. Hash representation is the application's loaded Float32 positions/normals and normalized face records; the separate raw-session hash verifies the serialized originals as well.

| OBJ code | Geometry SHA-256 |
| --- | --- |
| O2 | `6c61b56e61cb0c3a8c200a0d19713170eab61d313be9883a9b6085f88089f3af` |
| O1 | `0050467218bcf92c83da4b736ddaba4b4db52f66b13438df6492b29017dae25e` |
| G1 | `780b13781015d7dba2ac35824229edb6972569eaccc7a2dea0e41df54663d460` |
| L1 | `419ebffbc55238b96ed0f0fea8401c9b6d13115887b992dd7c7b69688bb807a2` |

No original OBJ/session asset was edited, decimated or substituted.

## G. Remaining limitations and risks

New geometry still pays spatial-index construction and exact collision costs. New placements/routes can miss caches; a repeated identical-placement speedup should not be extrapolated to the approximately 1,212-candidate search. Cache eviction also limits reuse in larger workloads. Exact content snapshots and cached query results add memory, not measured here; weak keys allow superseded geometry revisions to be collected, but live source maps retain entries up to their limits.

The synchronous revision scope relies on source geometry not changing during a single synchronous evaluation. Future asynchronous evaluation needs a revised scope model. Existing organic feature/voxel analysis caches were not redesigned; source edits must still follow the application's analysis lifecycle. Connector-tree reuse is implemented, but the fixture creates fresh emitted connector objects each pass, so it is not the main measured improvement.

The current routing/placement restrictions that leave L1 isolated remain. This phase intentionally does not resolve them or weaken their validation.

## H. Recommendation for Phase 2

Performance stabilization is sufficient to begin an explicitly authorized, bounded Phase 2: diagnose and test selected L1 placement/route alternatives with this parity, timing and fidelity harness retained. Establish per-fixture runtime limits and collect cache-miss rates before expanding search. If cold geometry cost becomes dominant, profile BVH construction, closed-surface detection and triangle conversion separately before further optimization.

No Phase 2 work or complete search has begun. Await authorization.
