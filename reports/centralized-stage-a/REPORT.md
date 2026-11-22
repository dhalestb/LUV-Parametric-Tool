# Centralized comprehensive refinement — Stage A validation gate

Date: 2026-11-21. Status: **Gate not passed; revised scores not activated or presented.**

The current request expressly requires stopping with root-cause findings if unresolved graph construction would invalidate the proposed gathering, convergence, or accessibility measurements. That condition remains present. This is a verification report, not a claim that the requested 40/40/20 implementation is complete. No production implementation, other descriptor, source model, saved result, or generation rule was edited. No commit, push, merge, or deployment was performed.

## Current implementation and retained purpose

`src/components/evaluations/v4/evaluateV4.ts:1296` still calculates `centralized-graph-v1.0.0` from the production `network.regions`. Its mathematical 35/25/25/15 harmonic/Freeman/betweenness/hierarchy implementation remains useful as a historical network diagnostic. Its separate gathering filter is still the previous 100 ft² / 7.5 ft / 10 ft policy, not the requested new configurable suitability model. Those thresholds have not been endorsed as universal criteria.

The initially disabled Phase 2 panel in `ArchitecturalRegionExperiment.tsx` runs `architecturalRegions.ts` separately. It has not replaced production region construction. Its colored surfaces are reconstructed sample-region extents; source outlines are architectural mesh context, and connection overlays distinguish sampled movement from non-navigable shared walls. These are reconstruction diagnostics, not validated gathering destinations or predicted traffic.

Retain the sample graph and its source references. Retain evidenced doorway separators, source-wall rejection, all small experimental components, and explicit reuse of supplied verified level chains. The controlled tests demonstrate their purpose and do not justify replacing those functioning parts wholesale.

## What is resolved, and where

| Prior issue | Current experimental result | Production result |
|---|---|---|
| Doorway rooms merge | Controlled supported doorway separates two rooms and preserves one opening | Still uses original walk components |
| Sealed partition becomes connected | Controlled sealed partition remains two regions with no verified passage | Existing source collision tests retained |
| Sub-16 ft² regions dropped | Experimental components retain raw movement nodes, including small transitions | Production region aggregation remains unchanged |
| Vertical chains omitted | Experiment reuses supplied verified chains | Production Centralized still builds links from region-crossing sample edges |
| Architectural enclosure recognized broadly | Only partial: planar wall slices and two-jamb gaps | Not solved generally |

## Root causes preventing revised scoring

1. **Level clustering can bridge different floors through stair treads.** `surfaces.ts:300–302` compares each elevation against the preceding sample, with 1.5 ft tolerance, rather than anchoring a platform cluster. A succession of small rises can therefore join a large vertical span. Experimental wall slicing then uses the merged level's mean elevation plus 1.5 ft, and component membership inherits the same level assignment. Actual-model clusters span up to approximately 6.8 ft. The existing stair test explicitly injects known level-link metadata; it proves chain preservation, not automatic platform recognition. This compromises multilevel origin identity and vertical approach classification.

2. **Experimental regions are not yet reliable occupied-origin units.** The implementation cuts adjacency at planar wall segments and supported two-jamb gaps, then takes remaining components. It does not yet distinguish a meaningful small transition from mesh-detail fragments, and incomplete/curved enclosures can remain merged. Of 79 / 256 / 83 experimental regions in the three actual models, 73 / 191 / 67 are below 16 ft². This is an unresolved classification problem, not proof that every small region is erroneous. Counting these as occupied origins or independent approaches would make results depend on fragmentation. Area weighting alone does not establish occupancy or repair identity.

3. **No explicit completeness or disconnection evidence model exists.** Connection records support verified/inferred/unknown statuses, but unknown records arise only at some detected candidate boundaries. An absent connection has no certificate saying whether it is a sealed boundary, an unobserved door, missing mesh, or an unresolved stair. The actual verified movement graphs have 71 / 118 / 58 isolated regions. These must not automatically become demonstrably disconnected occupied origins in R(g). The required reachability lower/upper bounds cannot be definitive until the origin set and unknown relationships are accounted for.

4. **A verified sampled edge is not yet an independent circulation approach.** Openings are checked with several height rays, while steps inherit the original rise-limited chest-height segment test (`circulation.ts:139–147`). Neither establishes a continuous swept-width passage. Multiple opening/step records may connect the same region pair. No portal grouping, shared-bottleneck analysis, or approach independence measurement currently exists. Counting records or sample paths as routes would violate the requested convergence definition.

These findings invalidate activation of the new destination scores at this stage. They do not imply that the existing source geometry is wrong or that a particular building ought to have a preferred score.

## Fresh actual-model verification

Original OBJ files were parsed directly using the prior browser source IDs, Z-up, and feet. Analysis hashes match the independent retained browser reference. The new runner checks source-buffer preservation, determinism, verified connection provenance to original edges/chains, and deep equality of all production descriptor results before/after reconstruction.

| Model | Analysis hash | Original → experimental regions | Small fragments | Verified movement records / distinct pairs | Verified-graph components | Isolated regions | Historical production Centralized |
|---|---|---:|---:|---:|---:|---:|---:|
| Linear.obj | 5f11ef0a | 4 → 79 | 73 | 7 / 7 | 73 | 71 | N/A |
| Stepped.obj | 10b2c3d1 | 64 → 256 | 191 | 131 / 129 | 142 | 118 | 6.13389656938044 |
| Void_Field.obj | 444f9645 | 13 → 83 | 67 | 15 / 15 | 68 | 58 | N/A |

“Verified” here means supported by the current sampled graph, not fully verified architectural route accessibility. Component and isolate counts are graph diagnostics, not certified disconnected occupiable spaces. `model-verification.json` records full source-file SHA-256 hashes, level ranges, connection types, and unchanged-result assertions. No revised G/C/R scores or gathering screenshots are presented because those would bypass the gate.

## Checks

- Targeted reconstruction and mathematical graph suites: **29 passed, 0 failed** (20 reconstruction, 9 mathematical graph tests).
- Full Evaluation tests: **144 passed, 1 failed**. Existing unrelated `descriptorFigures.test.ts:35`, “draws verticallyIntegrated from the measured cells,” fails with “verticallyIntegrated drew nothing.” It was already present in the previous evaluation audit; no assertion was removed or descriptor changed.
- All three source-model verification runs passed. All production descriptor outputs and original position buffers remain unchanged.
- No new failing regression was observed. No production TypeScript/build pass is claimed; this stage adds only an audit runner and reports, and does not repair prior dependency/type issues.

## Required work before Stages B–E

Use a Centralized-only reconstruction path to identify platform elevations without transitive stair merging, retaining intermediate tread samples as transitions. Add controlled tests for automatic platform recognition, not injected metadata alone. Preserve the other descriptors' existing extraction behavior.

Distinguish stable occupiable regions from transitions and unresolved fragments using support, enclosure, clearance, and explicit evidence status. Validate planar, curved, incomplete, and subdivided-mesh cases. Retain unknown fragments in diagnostics instead of assigning them occupied-origin status by default.

Introduce portal/transition identities and connectivity completeness evidence. Trace approaches to their actual sample paths, deduplicate the same portal and shared bottlenecks, preserve vertical path provenance, and distinguish unknown from demonstrably blocked origin relationships. Then define configurable G/C/R normalizations and validate independent reference calculations before activation. The requested 40/40/20 weights remain the intended revised policy; no alternative weights were substituted.

No subjective architectural choice is required from the user to establish these root causes. The explicit Stage A stop instruction is the reason this report does not proceed to scores and final visualization.

## Files produced

- `reports/centralized-stage-a/REPORT.md` — this report.
- `reports/centralized-stage-a/verify.cjs` — reproducible model verification runner; source directory is a required argument, not hardcoded.
- `reports/centralized-stage-a/model-verification.json` and `.log` — measured model findings.
- `reports/centralized-stage-a/targeted-tests.log` and `evaluation-tests.log` — complete test output.

Run from the review root with the repository dependencies available:

```powershell
node reports/centralized-stage-a/verify.cjs '<directory containing original OBJ files>'
node --require ./scripts/ts-test-register.cjs --test src/components/evaluations/v4/architecturalRegions.test.ts src/components/evaluations/v4/centralityGraph.test.ts
```
