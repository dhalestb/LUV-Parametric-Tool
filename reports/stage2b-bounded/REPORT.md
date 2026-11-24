# Bounded Stage 2B: L1 placement and orientation feasibility

Completed 2026-10-08. **No fully validated circulation connection was achieved in 24 tested configurations.** L1 remains unconnected; no proposed placement was applied to the session.

## Checkpoint and verification

Created local checkpoint **abb7f9aa7c2796a805d379d0a3056b27a4982a87** for the reviewed interior-approach implementation, tests and reports. Before committing, reran `node scripts/l1-interior-approaches.cjs`: all 1,110 original-mesh footprint comparisons, original 24-interface parity, thin-obstruction/cache invalidation, OBJ hashes/root transforms, existing ramp/stair geometry and isolated-L1 checks passed. Scoped ESLint and `git diff --check` passed. Earlier production-build and regression records were reviewed; no application source changed in this study. The existing six descriptor-test TypeScript errors and repository lint failures documented in the checkpoint remain unrelated.

Only the new harness `scripts/l1-stage2b-bounded.cjs` and this report directory are uncommitted. No push, deployment, D: repository access, global search, scoring/threshold change, route-family change, or mesh edit.

## Scope and permission bounds

O2 is fixed at (0,0,0), variant 0; O1 at (1,0,0), variant 2; G1 at (1,1,0), variant 0. The 4 × 4 × 1 lattice is unchanged. L1 uses six vacant cells near G1: (2,1), (0,1), (1,2), (0,2), (2,0), (2,2); each is tested at 90°, 0°, 180°, 270°, mirror none, no lift. This includes the existing (2,1), 90° baseline. All 24 combinations have permitted unoccupied lattice origins and original L1 XY bounds within [-10,70] ft. This does not imply collision-free placement. Vertical source extent is retained; it is not squeezed into a 20 ft cell. Mirrors, other cells and vertical changes were not explored.

Entrance B is transformed from its original local coordinates with the same inverse/forward mapping as the rendered OBJ, not kept at a stale world point. A and C are transformed as bounded comparison entrances. Both 3 ft and 2.1 ft destination widths are tested. All G1 source windows are requalified with L1 at its candidate transform, using a 512-window cap that omits none of the finite proposals. B is ordered first. The seven successful G1 windows remain: region 58 at z=6.666666508 and six region-178 windows at z=20. Only region 58 can pair with B within the 72 ft ramp-run and current landing rules. No source window supports a strict 3 ft stair landing.

Each case uses only the existing eight route families and unchanged surface-contact, continuous-floor, local slope, width, landing, emitted-mesh collision and headroom validation. Existing six connector pieces are held fixed. Each of the two existing links is independently tested against moved L1; any new obstruction disqualifies preservation. No provisional network relationship counts as a successful edge.

## Configurations and first failures

First-failure labels: REV = path reverses through opening; SLOPE = local centreline ramp slope; STAIR = unsupported strict stair landing; LAND = short switchback landing; FOLD = folded/reversed loft; EDGE = emitted ramp-edge slope; COLL = original mesh triangle collision. Counts include A/B/C at both widths; each tested qualified pair has all eight families. No pair/route cap truncation occurred.

| # | L1 cell | Rotation | Existing ramp/stair clear of L1 | Qualified pairs / routes | B routes | First failures (count) |
|---:|---|---:|---|---:|---:|---|
| 1 | (2,1,0) | 90° | yes / yes | 16 / 128 | 16 | REV 28; SLOPE 28; LAND 18; COLL 26; EDGE 12; FOLD 16 |
| 2 | (2,1,0) | 0° | yes / yes | 16 / 128 | 16 | STAIR 8; SLOPE 32; LAND 12; REV 34; EDGE 6; COLL 12; FOLD 24 |
| 3 | (2,1,0) | 180° | yes / yes | 16 / 128 | 16 | REV 34; SLOPE 20; LAND 8; COLL 45; FOLD 21 |
| 4 | (2,1,0) | 270° | yes / yes | 16 / 128 | 16 | REV 46; SLOPE 38; LAND 2; FOLD 20; COLL 22 |
| 5 | (0,1,0) | 90° | yes / NO | 16 / 128 | 16 | REV 48; STAIR 6; SLOPE 26; FOLD 48 |
| 6 | (0,1,0) | 0° | yes / NO | 16 / 128 | 16 | REV 42; SLOPE 38; FOLD 24; COLL 18; LAND 6 |
| 7 | (0,1,0) | 180° | yes / NO | 14 / 112 | 0 | REV 32; STAIR 6; SLOPE 8; COLL 26; FOLD 30; EDGE 4; LAND 6 |
| 8 | (0,1,0) | 270° | yes / yes | 16 / 128 | 16 | REV 28; STAIR 12; SLOPE 16; COLL 48; LAND 12; FOLD 12 |
| 9 | (1,2,0) | 90° | yes / yes | 14 / 112 | 0 | STAIR 8; SLOPE 20; REV 34; COLL 22; FOLD 20; LAND 6; EDGE 2 |
| 10 | (1,2,0) | 0° | yes / yes | 16 / 128 | 16 | REV 48; SLOPE 50; FOLD 29; COLL 1 |
| 11 | (1,2,0) | 180° | yes / yes | 16 / 128 | 16 | REV 24; SLOPE 26; COLL 50; LAND 16; FOLD 12 |
| 12 | (1,2,0) | 270° | yes / yes | 16 / 128 | 16 | REV 40; SLOPE 32; LAND 8; COLL 23; FOLD 25 |
| 13 | (0,2,0) | 90° | yes / yes | 16 / 128 | 16 | REV 48; STAIR 2; SLOPE 42; FOLD 13; COLL 23 |
| 14 | (0,2,0) | 0° | yes / yes | 16 / 128 | 16 | REV 48; SLOPE 56; FOLD 15; COLL 9 |
| 15 | (0,2,0) | 180° | yes / yes | 16 / 128 | 16 | REV 26; SLOPE 22; LAND 16; STAIR 4; COLL 42; FOLD 18 |
| 16 | (0,2,0) | 270° | yes / yes | 16 / 128 | 16 | REV 28; SLOPE 32; LAND 14; COLL 42; FOLD 12 |
| 17 | (2,0,0) | 90° | yes / yes | 16 / 128 | 16 | REV 24; SLOPE 26; COLL 50; LAND 16; FOLD 12 |
| 18 | (2,0,0) | 0° | yes / yes | 16 / 128 | 16 | COLL 35; SLOPE 26; LAND 14; EDGE 8; FOLD 21; REV 24 |
| 19 | (2,0,0) | 180° | yes / yes | 16 / 128 | 16 | REV 42; SLOPE 38; COLL 18; FOLD 24; LAND 6 |
| 20 | (2,0,0) | 270° | yes / yes | 16 / 128 | 16 | COLL 5; SLOPE 34; LAND 2; REV 44; FOLD 43 |
| 21 | (2,2,0) | 90° | yes / yes | 16 / 128 | 16 | COLL 52; SLOPE 26; REV 20; LAND 18; FOLD 12 |
| 22 | (2,2,0) | 0° | yes / yes | 16 / 128 | 16 | COLL 14; SLOPE 50; LAND 4; REV 42; FOLD 18 |
| 23 | (2,2,0) | 180° | yes / yes | 16 / 128 | 16 | REV 24; SLOPE 30; COLL 56; LAND 16; FOLD 2 |
| 24 | (2,2,0) | 270° | yes / yes | 16 / 128 | 16 | REV 48; SLOPE 38; FOLD 21; COLL 21 |

All configurations have **zero accepted routes**, including those that preserve both existing links. Configurations 5, 6 and 7 additionally obstruct the existing O2–G1 stair; the O2–O1 ramp remains clear in all 24. Those three placements are unsuitable even independently of the L1 connection failures. The test reports their diagnostic alternatives but never counts them as network-preserving solutions.

B is rejected before routing in configuration 7, (0,1), 180°, and configuration 9, (1,2), 90°. Both widths fail opening swept clearance/headroom against G1. For the 3 ft width the reported minimum clearances at the first failing throat are 1.491211 ft and 5.604358 ft respectively, below the unchanged 6.5 ft gate. Their B world points are (9.716843605,20,8.357694626) and (20,30.283156395,8.357694626). These are approach-frame clearance diagnostics, not a change to L1 material classification.

Across all configurations: **380 qualified pairs, 3,040 alternatives, zero accepted**. Another 600 walking-qualified pairs fail before route generation because the bounded ramp run is insufficient and strict stair landings fail. Full source/destination discovery failures and pair details are retained in `results.json`; the compact totals are in `summary.json`.

| Route first failure | Count |
|---|---:|
| path reverses through opening interface | 856 |
| centreline exceeds individual ramp segment slope | 754 |
| switchback landing length | 200 |
| source triangle collision | 660 |
| individual ramp segment slope | 32 |
| folded or reversed section | 492 |
| stair landing lacks continuous flat support | 46 |

## Independent G1 exit and other-obstruction audit

There are **44 region-58-to-B pairs and 352 route alternatives** in the 22 configurations with qualified B approaches. Each exact emitted route is checked independently against each original form, so an early blocker cannot mask a second one. This audit includes routes already rejected for slope, opening direction or construction; it does not promote them to accepted circulation.

Primary B route first failures: local centreline slope **204**; reversal through an opening **100**; switchback landing length **22**; unsupported strict stair landing **18**; original triangle collision **8**. These sum to 352. Independent collision results below expose additional failures beyond those early checks.

**All 352 collide with G1 alone, and all 352 independently collide with L1 alone.** G1 failure does not depend on L1 being present as an obstacle: the same generated route fails when only fixed G1 is supplied to the clearance check. Moving L1 can change the route shape and its G1 contact, but none of the tested shapes clears G1. Likewise, changing the destination position did not eliminate L1 entry collisions. This establishes persistence in these tested route families, not impossibility for every imaginable connection.

For **292 / 352** routes, the first offending emitted triangle lies entirely within a **2.5 ft plan radius** of the G1 attachment. This is a conservative diagnostic location label only, not a circulation threshold. For the remaining 60, the first offending triangle extends farther along the path; they must not be mislabeled as a proven near-exit collision. In particular a long direct-route triangle can span most of the connector. The harness records the exact triangle and its maximum radius.

The diagnostic hook reuses the production private BVH/intersection and seam-contact functions in a separate in-memory module. It changes no source file or acceptance logic. Every reported triangle is asserted to reproduce a production source-triangle rejection for the same emitted geometry. Example: the baseline curved route first collides on an underside triangle at z=6.416667–6.461167 ft, entirely within 1.083 ft of the source attachment at z=6.666667 ft. That points to a departure/contact or connector-thickness issue worth inspecting; it does not authorize widening seam tolerances or removing solid material.

| # | B routes | G1 failures | Near-exit triangle | L1 failures | O1 collisions | O2 headroom failures | Existing connector collisions |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 16 | 16 | 14 | 16 | 4 | 0 | 0 |
| 2 | 16 | 16 | 8 | 16 | 0 | 0 | 0 |
| 3 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 4 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 5 | 16 | 16 | 10 | 16 | 3 | 8 | 8 |
| 6 | 16 | 16 | 14 | 16 | 0 | 0 | 10 |
| 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 8 | 16 | 16 | 10 | 16 | 0 | 0 | 8 |
| 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 10 | 16 | 16 | 14 | 16 | 0 | 0 | 4 |
| 11 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 12 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 13 | 16 | 16 | 12 | 16 | 0 | 0 | 6 |
| 14 | 16 | 16 | 14 | 16 | 0 | 0 | 6 |
| 15 | 16 | 16 | 14 | 16 | 0 | 0 | 3 |
| 16 | 16 | 16 | 14 | 16 | 0 | 0 | 4 |
| 17 | 16 | 16 | 14 | 16 | 6 | 0 | 0 |
| 18 | 16 | 16 | 14 | 16 | 7 | 0 | 0 |
| 19 | 16 | 16 | 14 | 16 | 2 | 0 | 0 |
| 20 | 16 | 16 | 14 | 16 | 2 | 0 | 0 |
| 21 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 22 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 23 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |
| 24 | 16 | 16 | 14 | 16 | 0 | 0 | 0 |

Independent blocker totals overlap: G1 352, L1 352, O1 24, O2 headroom 8, existing connectors 49. O1 obstruction is placement-sensitive: baseline has four B alternatives colliding with O1, while rotating L1 at the same cell to 0°, 180° or 270° removes those O1 collisions. Yet all sixteen alternatives still hit G1 and L1. Thus some secondary collisions can be resolved by changing L1, while the tested endpoint conflicts persist.

## Preservation, reproducibility and limitations

All four original positions/normals/faces hashes match the checkpoint, and session bytes remain SHA-256 `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`. All 14,282 L1 vertices match renderer-root transforms for each of the 24 configurations, maximum error 2.384185862e-7 ft (tolerance 1e-5). Fixed form transforms are hashed and asserted unchanged for every case. Original ramp/stair geometry is hash-checked after each case; its SHA-256 including saved connector metadata is `87c9e07b34129d0a370b3f328aab4b721591a868af0a0e05a5e5d534045e2f54`. No configuration is written into the saved session.

Cold/warm result parity passed for every configuration. New harness ESLint passed. Every accepted-route code path revalidates the same emitted geometry, but no route reached acceptance here; no graph edge was added. New whole-form solid-overlap certification was not introduced: since every connector failed, no candidate was promoted to a valid arrangement on the basis of lattice vacancy alone.

Run `node scripts/l1-stage2b-bounded.cjs` from the repository. It never calls the global placement optimizer. It performs 24 unique configurations, with a same-input warm replay for parity; these are not additional placements. The study loop, audits, warm replay and report writes took 83.445 seconds, excluding initial mesh analysis. Per-case timings are in the JSON. This is not a matched before/after performance benchmark.

`results.json` retains every tested transform, transformed entrance, source/destination failure, qualified pair, route first failure, independent blocker and collision witness. `configurations.csv` provides one reviewable row per transform. This report is a bounded feasibility result: no mirrors, lifts, alternative source forms or new route families were tested; no conclusion of global impossibility follows. All usable G1 approaches remain narrow 2.1 ft conceptual circulation, not accessible-network certification.

## Recommended next action

**Do not expand the placement search yet.** The bounded changes remove some secondary obstacles but never clear either endpoint in the primary relationship. Request a targeted original-geometry departure/arrival contact review for region 58 and B: inspect the recorded underside collision witnesses and emitted section orientation/thickness against actual source slabs and openings. Relevant unchanged functions are `transitionPath()`, `transitionSections()`, `transitionMeshes()` in `transitionGeometry.ts`, `fitLoftContact()` in `surfaceAttachment.ts`, and `transitionSurfaceClear()` in `connectionClearance.ts`. Determine whether the existing construction can respect the physical opening without penetrating original solid material. Any subsequent correction must validate the newly emitted geometry afresh and preserve all current slope, headroom, width, landing and seam rules.

No best passing placement is recommended because none passed. The checkpoint is local; the new study and reports remain uncommitted for review. Stop pending authorization.
