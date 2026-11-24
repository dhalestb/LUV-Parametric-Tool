# Stage 2C bounded circulation-validation correction

Completed October 9, 2026. Development repository: C:/Users/DHale/Documents/Codex/Cursor-APP. Branch organic-lattice-connections; unchanged HEAD e0caff28e420ec7a22d57854b72df725f4b334ec. No staging, commit, push, merge, deployment, D: access, or placement search.

## Validation baseline and scope

PASS — Exact checkpoints/lattice-session.json SHA-256: 6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b. Original O2 undulating workspace.obj (0,0,0), variant 0; O1 void workspace.obj (1,0,0), variant 2; G1 Gathering, Linear.obj (1,1,0), variant 0; L1 Lobby, Vertical Void.obj (2,1,0), variant 3. Field 4 x 4 x 1, registration 20 feet, no zLift.

UNVERIFIED — Historical G2 Gathering, Void Field.obj / O1 open hall workspace.obj assembly, its placements, scores 35.1912/34.6267, and alleged two-piece stair failure. None is a regression expectation. No sample geometry was substituted. Missing original fixture prevents testing that specific assembly; it does not prevent testing this verified checkpoint or independent deterministic synthetic geometry.

The baseline was executed from immutable commit e0caff2 through a test-only TypeScript require hook. This did not restore or edit application files. Existing pre-correction baseline.json from the initial run was confirmed before continuing implementation; the final measurements repeat that immutable source on identical fixed placements. The test-only hook exposes internal assignment finalize without changing its production export or formulas. Its fixed-placement raw scores in JSON are diagnostic outputs, not recovered historical scores or optimization results.

## Root cause and implemented correction

FAIL (baseline) — Ordinary port matching used Stage 1 surface contact, coarse route classification and collision checks. It omitted the stronger endpoint coverage/landing and emitted-route tests already present in validateAlternative. Organic synthesis had the same gap. A point-only confirmedWalkableInterface result could also prejoin circulation without validating a usable full-width passage. Clearance alone therefore established circulation too early.

PASS (corrected) — One shared validateCirculationConnection now gates both matching and final synthesis. It reuses existing physical floor/edge attachment, emitted section width, reversal/folding/self-intersection, stair tread/riser, individual ramp segment/cross-slope, approach/landing support, continuous walking footprint and headroom validation. It validates the same pair used by transitionMeshes and retains final collision checks against earlier accepted connectors. No connector construction, circulation thresholds, score weights or original meshes were changed.

Two bounded additions close gaps exposed while sharing validation: unnamed ordinary switchback paths with interior level segments receive the existing landing-length requirement; existing generated connectors receive the existing standing-height check over actual tread/section walking elevations (route clearance previously checked their body intersections only). No tolerance is relaxed. Headroom continues to use the existing numerical limits.

Point-only/voxel reports are unverified evidence, not confirmed edges. They cannot prejoin the matcher or final graph. Supported direct generated routes still pass the shared gate, proven by the closed-slab synthetic fixture. A genuine mesh-to-mesh passage without a generated connector remains conservatively unverified until a complete passage footprint is qualified; this may reduce true direct-interlock detection and is documented rather than treated as physical impossibility.

Final synthesis updates candidate accepted flags, rejection counts and component counts from its accepted emitted result without mutating matching diagnostics. Accepted connector counts, final graph and assignment feasibility use the same result. Ordinary assignment finalization already reports FAIL when a multi-form assembly has no validated links; its formulas are unchanged.

## Verified four-form before and after

| Measure | Immutable baseline | Corrected |
| --- | ---: | ---: |
| Accepted port relationships | 1 | 0 |
| Accepted organic-generated relationships | 1 stair | 0 |
| Generated mesh pieces | 6 (1 ramp + 5 stair pieces) | 0 |
| Ramp relationships | 1 | 0 |
| Stair relationships | 1 | 0 |
| Bridges / organic counter | 0 / 0 | 0 / 0 |
| Confirmed graph edges | 2 | 0 |
| Connected components | 2 | 4 |
| L1 connected | No | No |
| Fixed assignment status | REVIEW | FAIL |

A stair selected through the organic-generation path increments the stair counter; it does not increment the organic counter. Piece counts are not relationship counts.

The prior O2–O1 ramp is surface-attached according to the Stage 1 gate, but its maximum walking ribbon-edge segment slope is 0.169649708 (limit 0.083333333). This is its first shared-gate failure. Independently, O2's 2.028381 ft wide x 2 ft deep approach has projected coverage 4.040436 sq ft against 4.056763 required and fails coverage; O1's 3.732628 ft destination approach has no physical floor at its entrance. Endpoint coordinates and profiles are retained in baseline-pairs.json and corrected.json.

The prior O2–G1 stair also passes Stage 1 attachment, but its emitted ribbon narrows to 1.948125 ft despite 2.028374 ft endpoint widths (required minimum 2 ft). Width is its first shared-gate failure. Independently both 3 ft deep landing footprints fail coverage: O2 region 17 covers 5.856641 / 6.085121 sq ft; G1 region 58 covers 5.185171 / 6.085121 sq ft. These are verified failures of the original four-form route, not evidence for the missing G2–O1 historical stair.

No G1–L1 connection is accepted before or after. The current bounded ordinary synthesis records G1–L1 route-collision rejections; no Stage 2B placement/alternative-route study was rerun. Rejecting these fixed routes does not prove all possible placements or physical routes impossible.

The same 4,149 port candidates are enumerated. Before: 4,148 rejected, 1 accepted. After: 4,149 rejected. Revised first candidate rejection counts: distance 3,529; angle 339; lateral offset 127; elevation 30; shared circulation validation 103; slope 10; surface attachment 11. The prior 6 NETWORK REDUNDANT candidates are no longer suppressed by prematurely accepted routes. Multiple bend attempts are distinct from candidate counts; detailed route first-failure counts are retained in corrected.json. Final organic synthesis rejects 12 alternatives for route collision and 1 for invalid circulation/usable width.

## Source locations

| File / function | Change |
| --- | --- |
| src/components/lattice/portConnectionValidation.ts:133 validateCirculationConnection | Shared stronger validator extracted from alternativeRouting; reuse of walkingApproach and clearance; additional existing-connector headroom and unnamed switchback landing checks |
| src/components/lattice/alternativeRouting.ts:166 validateAlternative | Thin shared-validator adapter, retaining its existing maxRun and fixed-footprint option |
| src/components/lattice/portMatching.ts:126–158 matchAssemblyPorts | Full gate before port reservation/graph insertion; remove point-only graph prejoins |
| src/components/lattice/connectionSynthesis.ts:280–290 synthesizeConnectors | Final candidate flags/counts/components synchronized with emitted accepted result |
| src/components/lattice/connectionSynthesis.ts:422–480 synthesizePortConnectors | Final shared gate before emission/graph joining; unresolved direct contact excluded |
| src/components/lattice/connectionSynthesis.ts:570–575 appendOrganicLink | Shared gate before organic mesh emission and accepted graph insertion |
| src/components/lattice/types.ts:156 PortRejection | CIRCULATION VALIDATION diagnostic category |
| scripts/circulation-feasibility-regression.cjs | Deterministic closed-slab synthetic tests and immutable/fixed original-mesh baseline comparisons; no search |

Inspected/reused, unchanged: walkingApproach.ts:56 validateWalkingApproach; connectionClearance.ts:88 landingHeadroomCheck and :124 transitionSurfaceClear; transitionGeometry.ts transitionSections/transitionMeshes; surfaceAttachment.ts measureSurfaceGap/fitLoftContact; organicConnections.ts sealOrganicGraph; assignmentSearch.ts:317 finalize and :340–350 final graph/status logic.

## Executed validation

PASS — Focused circulation script: supported approach and 3 x 3 ft stair landing; insufficient width/coverage/landing depth; supported incline acceptable as approach but rejected as level landing; obstructed approach headroom; valid direct route; emitted connector collision; overhead original-form and generated-connector clearance; in-place obstacle geometry change invalidating cache; final rejection excluded from graph; disconnected two-form result; missing original geometry excluded; point-only reports cannot prejoin; final accepted flags consistent and input matching records unchanged; original OBJ and prior connector regeneration hashes match baseline; 20 ft and single-level registration; fixed four-form final status is FAIL.

PASS — Existing node scripts/connection-attachment-check.cjs. Incomplete network is correctly reported and no invalid links are emitted. Output: attachment-check.txt. Its Stage 1 assertions alone do not prove a connection exists; the focused script supplies positive accepted-route tests.

PASS — All 24 descriptor tests in descriptorCache, descriptorRank, descriptorV2 and openVolume; 4 suites, 0 failures.

PASS — Component ESLint on all 5 modified TypeScript files; no warnings/errors. git diff --check passes.

PASS — npm run build (Next 15.5.27): compiled, production lint/type checks, generated all 11 static entries and completed traces. Existing unrelated unused-variable/hook warnings remain. Initial sandbox SWC path resolution failed with Windows Access denied; the authorized external-sandbox retry passed. An intermediate import omission during extraction was fixed before the final successful build.

FAIL (pre-existing standalone check) — npx tsc --noEmit still reports 5 TS5097 imports ending in .ts across descriptor test files and 1 TS2352 incomplete TileVariant cast in descriptorCache.test.ts:13. No remaining new application-source TypeScript errors. Those descriptor test files are byte-identical to the preservation snapshot; their runtime tests all pass. No changes were made to silence these unrelated errors.

Reproduction, in repository PowerShell:

~~~powershell
node scripts/circulation-feasibility-regression.cjs --baseline
node scripts/circulation-feasibility-regression.cjs
node scripts/connection-attachment-check.cjs
npx eslint src/components/lattice/alternativeRouting.ts src/components/lattice/connectionSynthesis.ts src/components/lattice/portConnectionValidation.ts src/components/lattice/portMatching.ts src/components/lattice/types.ts
npx tsc --noEmit
npm run build
~~~

The baseline pass must precede the corrected pass because its exact accepted pairs and hashes are the immutable comparison fixture. Neither invokes placement search. Older assignment scripts containing placement searches or assumptions that missing-source connectors are accepted were not used as success criteria.

## Bounded timing

Fresh processes, identical original meshes/placements, one cold + six warm evaluations each; timed evaluateAssembly + matchAssemblyPorts + synthesizeConnectors. Analysis/import/module loading and extra diagnostics/endpoint audits/finalization are outside the timed region. Synthetic fixtures run only on the corrected side and use different geometry identities; the original fixture has not been evaluated before its cold trial.

| Timing, ms | Baseline | Corrected |
| --- | ---: | ---: |
| Cold | 2308.05 | 1993.66 |
| Warm mean (6) | 75.40 | 90.04 |
| Warm median | 63.31 | 88.71 |
| Warm range | 56.65–139.98 | 82.88–101.52 |

Warm mean overhead: 14.64 ms (19.42%). Stronger validation has a measurable bounded warm cost. Cold changes include early rejection of formerly emitted geometry and runtime noise; they are not evidence of a general search acceleration. These samples do not predict a complete-search runtime. No performance refactoring was attempted.

## Preservation evidence

PASS — Session hash remains exact. All original imported vertices, normals and face records are hashed before analysis and after complete validation/synthesis; unchanged, including four independent per-mesh hashes in both JSON results. Counts: O2 8,802 vertices / 15,487 faces; O1 3,972 / 5,890; G1 20,865 / 41,604; L1 14,282 / 28,528. Actual counts in JSON are authoritative. Source originals are never modified, cut, scaled differently or remeshed.

PASS — Regeneration of both prior connector pairs using unchanged transitionGeometry produces identical SHA-256 values before/after: ramp c02416dd0ab591f7d0c78f98a468a86c30d4af05a50bbc838dff04d6bc9ffcbc; stair f33c223f3b0f4a1f824071f45e5fdb98bd24c1bb7251e1d786fb61f51a8cf2cc. The corrected pipeline excludes invalid instances rather than altering their construction. Generated connector arrays remain separate from original source data.

PASS — Preservation snapshot comparison: 493 pre-existing files byte-identical; only the 5 authorized lattice source modules changed. No missing/unexpected files, staged diff empty, HEAD unchanged. All 12 pre-existing UI changes, old Stage 2C reports, presentation assets and color-system documentation remain unchanged. Scoring, placement search, descriptor formulas, orientation/unit conversion and geometry-revision code are byte-identical. Other worktrees/production deployment were not touched. Preservation data: preservation.json.

## Remaining limitations and next authorization

UNVERIFIED — Historical G2–O1 remains unavailable. Its particular OBJ winding/material topology, landing/approach feasibility, two-piece stair, scores and alternative selection cannot be tested without the original meshes and exact placements. No conclusions about it follow from this checkpoint.

UNVERIFIED — Existing route headroom uses discrete route/tread/edge samples and the current geometric clearance implementation; endpoint approaches use continuous footprint/prism checks. This is the repository's validated conceptual circulation standard, not proof of a continuous full-route swept pedestrian volume or ADA compliance. Synthetic widths around 2.1 ft must not be labeled accessible.

UNVERIFIED — Non-generated direct mesh-to-mesh interfaces are excluded pending full-width passage validation. Missing source geometry cannot emit confirmed assignment connectors. The legacy synthesizeConnectors overload without assignment options is outside this correction and remains weaker; it must not be interpreted as the corrected assignment pipeline.

FAIL (remaining presentation semantics) — LatticeStudio.tsx:1364,1376–1379,1416 and1546 still expose raw neighbor floor/circulation/interlock metrics and PASS labels from evaluateAssembly. Those are heuristic evaluation evidence, not accepted circulation edges. Final assignment status, generated connector list, accepted port diagnostics and graph now agree, but a separate bounded UI labeling/status correction is recommended so these older panels explicitly say provisional/unverified. UI was preserved as required; no claim is made that every legacy display was synchronized.

Recommended next bounded correction: audit and repair the specific O2–O1 endpoint/floor selection and ribbon-edge slope, and O2–G1 neck width/landing support against these retained pairs before expanding search. Keep this strict acceptance gate. Any route construction adjustment needs new authorization and must preserve physical footprints, exact collision/clearance checks and original OBJ geometry. Separately authorize the provisional-metric UI labeling fix if all visible status labels must reflect confirmed circulation. Do not proceed to global optimization from zero accepted links at this fixed placement.

Implementation and bounded verification are complete. Changes and new reports remain uncommitted for review.

