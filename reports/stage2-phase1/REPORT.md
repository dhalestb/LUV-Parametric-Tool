# Assignment 2 — Stage 2, Phase 1 completion report

Phase 1 confirms and corrects premature graph suppression. L1 remains isolated in the committed fixed-placement fixture because its attempted connections fail geometric checks. The two valid Stage 1 connections remain unchanged. No full placement search or Phase 2 work was performed.

## A. Environment, scope, and implementation

Verified before source edits: repository `C:\Users\DHale\Documents\Codex\Cursor-APP`, branch `organic-lattice-connections`, HEAD `cd40b20e1d54458a4f57fe90480c73c96499685b`, clean working tree, original session present, TypeScript 5.9.3 installed. Node is v24.21.0. Package and lockfile were not changed.

The tested configuration is the known placement in `scripts/connection-attachment-check.cjs`, with a 4 × 4 × 1 registration field. The saved session contains source geometry and assignments, not the full-search winning arrangement. Findings below concern this reproducible fixture; they are not an exhaustive feasibility result.

| Code | Original OBJ / stable source ID | Bay (x,y,z) | Variant | Transform |
|---|---|---|---|---|
| O2 | undulating workspace.obj / mesh-14-7xy9tm | (0,0,0) | 0 | 0°, no mirror |
| O1 | void workspace.obj / mesh-15-h24ulc | (1,0,0) | 2 | 0°, Y mirror |
| G1 | Gathering, Linear.obj / mesh-6-03znsf | (1,1,0) | 0 | 0°, no mirror |
| L1 | Lobby, Vertical Void.obj / mesh-5-bva2xh | (2,1,0) | 3 | 90°, no mirror |

Modified files and functions, relative to the repository:

| File | Phase 1 change |
|---|---|
| `src/components/lattice/connectionDiagnostics.ts` (new) | Opt-in synchronous/asynchronous captures, bounded event retention, reason counts, nested inclusive/exclusive timings. No console output. |
| `src/components/lattice/surfaceAttachment.ts` | `confirmedCirculationReports()` shares the Stage 1 interface gate; attachment selection/contact diagnostics and timings. Existing tolerances are unchanged. |
| `src/components/lattice/portMatching.ts` | `matchAssemblyPorts()` seeds the graph only with confirmed interfaces; validates the final port geometry, attachment and circulation class before reservation/graph insertion; records specific rejection stages. Clearance certificate includes geometry and placement snapshots. |
| `src/components/lattice/portConnectionValidation.ts` (new) | Existing Stage 1 neck/path/switchback/classification helpers moved into a shared module; `preparePortConnection()` and `portAttachmentMeets()` let matching and synthesis validate the same geometry. No new route family. |
| `src/components/lattice/connectionSynthesis.ts` | `synthesizePortConnectors()` preserves a validated prepared route and rechecks emitted geometry against source meshes and already accepted connectors. Missing source surfaces cannot confer a port graph edge. Organic synthesis records rejections and story-cap skips. |
| `src/components/lattice/connectionClearance.ts` | `transitionSurfaceClear()` distinguishes source triangle collision, headroom, inside-solid and connector collision, including blocker identity. Cached failures retain their reason. Timing only; collision mathematics/tolerances unchanged. |
| `src/components/lattice/connectionPorts.ts` | Records proxy/source port cap counts and omitted records. No cap or ordering changes. |
| `src/components/lattice/organicConnections.ts` | Records feature caps, proximity/facing/attachment failures, draft limits and similar-attachment pruning; times generation and graph sealing. No detour fix or feature expansion. |
| `src/components/lattice/transitionGeometry.ts` | Connector mesh-generation timing only. |
| `src/components/lattice/assignmentSearch.ts` | `evaluateAssignment()` uses confirmed reports instead of provisional voxel reports for its circulation component graph. Adds evaluation timing and search-order/beam-pruning diagnostic hooks. No weight, placement, beam or ordering changes. |
| `src/components/lattice/types.ts` | Adds `SURFACE ATTACHMENT` and `SLOPE` diagnostic rejection labels. |
| `scripts/l1-connectivity-diagnostics.cjs` (new) | Deterministic original-OBJ fixture, checkpoint loader, bounded measurements, suppression regressions, and full fidelity hashes. Never calls placement search. |

Also inspected: `analyze.ts`, `search.ts`, `scripts/connection-attachment-check.cjs`, `scripts/session-arrangement-search.cjs`, and existing regression setup. No Board Mode, viewport, presentation, descriptor, package, lockfile or original OBJ/session changes.

## B. Exact L1 rejection reasons

The detailed current port pass evaluates the Cartesian products of retained ports:

| Pair | Port pairs | Recorded terminal outcomes |
|---|---:|---|
| O2–L1 | 644 | 644 DISTANCE |
| O1–L1 | 532 | 495 DISTANCE; 15 LATERAL OFFSET; 12 ANGLE; 2 ELEVATION; 4 COLLISION; 2 SLOPE; 2 SURFACE ATTACHMENT |
| G1–L1 | 896 | 703 DISTANCE; 96 ANGLE; 31 LATERAL OFFSET; 12 ELEVATION; 47 COLLISION; 3 SLOPE; 4 SURFACE ATTACHMENT |

These are candidate outcomes, not counts of individual bend attempts. A candidate can fail different checks on different attempts; its final label describes the last attempted rejection. Structured per-attempt events preserve the distinction. Assessment events also distinguish actual distance/facing/width failures from the compatibility-score fallback that uses the same legacy labels. No retained L1 candidate was rejected as PORT IN USE in this fixture.

Organic attempts give more concrete blockers:

- **O1 → L1 stair:** source `(30.000, 2.753, 2.248)` ft; target `(35.844, 12.836, 6.392)` ft; rise 4.144 ft; endpoint plan span 11.654 ft; usable width 2.197 ft. Attachment and classification reach the clearance stage. A vertical headroom probe at approximately `(35.844, 11.737, 6.396)` ft hits **Lobby, Vertical Void.obj**. The required 6.5-foot standing-clearance column is blocked. The current aggregate organic rejection calls this “route collision”; the new trace identifies headroom specifically.
- **G1 → L1 near-level loft:** source `(21.275, 19.439, 18.094)` ft; target `(35.844, 24.555, 18.524)` ft; rise 0.430 ft; endpoint plan span 15.441 ft; width 2.255 ft. The loft intersects **Gathering, Linear.obj** outside the allowed attachment seam. This is a source triangle collision, not a missing landing or insufficient width.
- **O2 → L1:** organic generation skips the pair because the X registration difference is two bays. Port matching still considers its retained ports, but all 644 pairs fail DISTANCE.
- **G1–L1 direct voxel proposal:** the report's floor/circulation overlap does not meet at a walkable OBJ interface. Stage 1 confirmation remains false; no direct graph edge is added.

Exposure limits are also observed, but their omitted records have not been route-validated:

- L1 has 28 source ports and retains all 28; the 32-port cap does not discard an L1 port.
- G1 has 208 source-port candidates and retains 32, omitting 176.
- L1 organic detection has 9 tips and 30 edge features; it retains 9 tips and 8 edges before port-derived features, then retains 18 of 38 combined features.
- G1 has 7 tips and 168 edge features; it retains 7 tips and 8 edges before port-derived features, then retains 18 of 33 combined features.

Those limits may hide alternatives, but Phase 1 does not assert that any omitted feature would yield a valid connection. Search-order/pruning hooks are implemented; no placement search was run, so search omissions are explicitly unmeasured.

## C–D. Premature suppression and corrections

**Actual fixture:** the checkpoint initializes port matching's union-find graph from the G1–L1 voxel PASS relationship before Stage 1 confirmation. Consequently, **54 otherwise eligible G1–L1 port candidates are labelled NETWORK REDUNDANT without geometric route validation**. The corrected implementation considers all 54. They resolve to 47 collision/clearance, 3 slope and 4 surface-attachment failures. No valid L1 edge was recovered from these 54.

**Controlled regression on original geometry:** the original O2/O1 pair has a valid port route but no direct confirmed interface. Supplying a counterfactual voxel PASS report to this unchanged geometry makes the checkpoint suppress the route: 1 accepted route becomes 0. After correction, the same report leaves the valid route accepted: 1 remains 1. This proves the bug can suppress a valid required edge; it does not claim that the actual L1 fixture had such a valid edge.

Corrections:

1. Confirm voxel-proposed interfaces before seeding either port matching or assignment circulation graphs.
2. Prepare the existing Stage 1 final port geometry before it can reserve a port or join the graph. Check suitable source contact, fitted usable width and circulation class first.
3. Do not regenerate a different path while trusting a certificate for the old path. Certificates are invalidated by geometry/placement changes; synthesis checks the emitted geometry again against its actual accepted-connector set.
4. Seal the final organic graph from confirmed direct interfaces and successfully meshed, validated links, preserving Stage 1 behavior.

Explicit port contact still permits the Stage 1 floor/edge/wall interface types. Organic contact remains floor/edge only. No contact, width, slope, triangle-intersection or headroom threshold was relaxed. The existing switchback/neck helpers were shared for validation consistency, not expanded into a new routing algorithm.

## E. Deterministic test results

Reproduction commands from repository root:

```powershell
node scripts/l1-connectivity-diagnostics.cjs --record-baseline
node scripts/l1-connectivity-diagnostics.cjs
node scripts/connection-attachment-check.cjs
```

The baseline option reads `cd40b20` source through `git show` into memory and inserts timing probes only. It never resets/checks out files. Both modes use the original saved session and the same fixed placement.

| Check | Checkpoint | Updated |
|---|---|---|
| Accepted circulation relationships | O2–O1 ramp, O2–G1 stair | Same endpoints, widths, surface gaps and kinds |
| Connected components / isolated forms | 2 / L1 | 2 / L1 |
| G1–L1 false direct voxel edge | Rejected during final synthesis | Rejected before port graph seeding and during final synthesis |
| G1–L1 candidates prematurely skipped | 54 | 0 |
| O2/O1 route under injected provisional PASS | Suppressed, 0 accepted | Preserved, 1 accepted |
| Existing Stage 1 attachment script | PASS | PASS |
| Full original geometry/session hash checks | PASS | PASS |
| Cold/warm result parity | PASS | PASS |
| Fast/detailed matching parity | — | PASS |
| Mutated endpoint certificate and rejection | — | PASS |

Updated source ESLint check passes. Whole-project TypeScript checking still reports six errors in untouched descriptor/evaluation tests (five TS5097 import-extension errors and one TS2352 fixture cast). A compiler-host comparison against checkpoint versions of changed files produced exactly the same six diagnostics; there are no added TypeScript diagnostics. See `typecheck.json`. No full aggregation or other search-invoking regression script was run.

## F. Bounded performance

Three evaluations per mode: one cold connection-cache pass after source analysis, followed by two identical warm passes in the same process. TypeScript transpilation, source analysis, regression probes and report serialization are excluded from the evaluation totals. These are instrumented diagnostic measurements, not a forecast of full-search runtime; updated detailed-event collection adds overhead absent from the timing-only checkpoint loader.

| Measurement (ms) | Baseline cold | Updated cold | Baseline warm mean | Updated warm mean |
|---|---:|---:|---:|---:|
| candidate generation | 29.79 | 750.85 | 11.54 | 487.88 |
| surface attachment selection | 271.38 | 1378.97 | 14.56 | 931.70 |
| connector geometry | 18.99 | 33.64 | 10.04 | 22.61 |
| collision and clearance | 1484.79 | 2300.64 | 77.86 | 195.84 |
| network graph | 0.20 | 0.69 | 0.05 | 0.12 |
| **Overall fixed candidate evaluation** | 1917.50 | 4486.62 | 122.46 | 1647.88 |

The five phase rows use exclusive time so nested operations are not counted twice. Candidate-generation residual time includes preparation and explicit port-center checks outside the timed attachment functions. Overall candidate evaluation is inclusive and covers proxy evaluation, port matching and synthesis in the harness. Network timing covers interface graph gating and final graph sealing; the checkpoint has only the final sealing probe.

The corrected fixture is slower, especially warm. It evaluates previously suppressed candidates, performs attachment/class checks before graph insertion, and revalidates final geometry. Source-clearance calls increase from 245 to 412 per evaluation; connector-generation calls increase from 248 to 415. No speedup is claimed. Optimization was deliberately deferred, as requested.

## G. Original OBJ fidelity

Original vertex/face counts remain O2 8,802/15,487; O1 3,972/5,890; G1 20,865/41,604; L1 14,282/28,528. The test hashes every loaded position, normal and face record before/after analysis and after regression execution. The raw session file is also hashed before/after. All checks pass, and baseline/updated source hashes agree.

Session SHA-256: `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`.

The original session bytes remain unchanged. Float32 analysis inputs use the same Stage 1 conversion. No source mesh was repaired, simplified, trimmed or replaced.

## H–I. Remaining limits and recommended Phase 2

Unchanged limits include source-port/feature caps, one selected attachment per feature pairing, restricted organic neighbor pairs, profiled candidates bypassing the old organic detour branch, limited existing port bend choices, greedy port reservation, story limits, one retained initial placement pair and narrow growth beams. The form-level graph also does not independently establish internal walkability between every arrival/departure region within an OBJ. These are not resolved by Phase 1.

Recommended Phase 2, subject to authorization:

1. Start with the two exact L1 blockers above. Preserve endpoints where possible and evaluate alternative attachment windows/routes that avoid G1 mass and L1 headroom obstructions.
2. Evaluate omitted G1 ports and L1/G1 features in a bounded diagnostic experiment before changing global caps.
3. Preserve the corrected confirmation gates and regression fixture while expanding route coverage. Require one fully validated four-form witness before claiming feasibility.
4. Use the measured cost breakdown to plan caching/deduplication separately; verify accepted/rejected geometry parity before any optimization.
5. Expand placement-order exploration only after the fixed-placement route diagnostics are reliable. Keep descriptor scoring subordinate to verified complete circulation.

No Phase 2 implementation, placement search, branching junction, descriptor/scoring change, lattice change, or presentation-component change was made. Work is left uncommitted for review.

Machine-readable evidence: `baseline.json`, `updated.json`, `typecheck.json`. Traces retain complete reason counts and up to three representative records per reason/pair/blocker group, including stable IDs and transforms; they are not exhaustive logs of every route. Both captures had zero event-budget drops before this deliberate report compaction.
