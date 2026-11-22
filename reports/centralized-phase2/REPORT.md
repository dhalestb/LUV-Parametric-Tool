# Centralized Phase 2: experimental segmentation and relationship preservation

## Scope and activation

Implemented behind `RegionExperimentOptions.enabled` (false/absent never runs reconstruction) and a separate, initially disabled **Phase 2 architectural region experiment** panel on Evaluations. Expand it, enable the diagnostic and run it to compare regions. This diagnostic does not supply data to the production Centralized score, modify the final descriptor visualization, run architectural generators, change mathematical weights, or update saved scores. No commit, push, merge or deployment occurred.

Source files added: `src/components/evaluations/v4/architecturalRegions.ts`, `architecturalRegionDiagnostics.ts`, `architecturalRegions.test.ts`, and `src/components/evaluations/ArchitecturalRegionExperiment.tsx`. The only integration edit is an import and a separate experimental panel in `ArchitecturalEvaluations.tsx`. No unrelated descriptor algorithm was changed.

## Method

The original sample walkability graph is read and retained in full. Original sample IDs, triangle IDs, node positions, walk/step edges and verified level chains remain the evidence reference. Experimental regions have their own node-to-region mapping, original sample memberships, source continuous-floor component IDs, area, level ID and centroid. The segmentation status is explicitly **inferred**: computed regions are not confirmed semantic rooms.

Vertical source triangles are sliced at 1.5 ft above each detected level. Nearly vertical, collinear wall segments are grouped by normal and plane offset with small numeric tolerances. Physical wall segments establish partition boundaries. Gaps between two supported collinear wall fragments create candidate opening separators; default maximum gap is 8 ft, configurable within this experiment, and each supporting jamb fragment must extend at least 1 ft. These constraints are segmentation evidence criteria, not altered centrality/gathering scoring thresholds. The method supports rotated planar walls without typology names or assumptions about global X/Y alignment.

Only the **segmentation adjacency** is cut at these evidenced boundaries. The original movement edges are not deleted or redefined. Walkable room surfaces therefore stay distinct across a supported doorway separator while the crossing sample edges can become an interregion connection. Components are also kept separate across detected level IDs or step edges. No equal-area subdivision or artificial node count is used. A large open room without partition evidence stays intact.

All original movement nodes are preserved exactly once, including those previously mapped to discarded sub-16 ft² regions. Small resulting regions are labelled transitions/fragments, not gathering candidates or confirmed rooms. The exported hierarchy is source building → detected levels → original continuous-floor IDs → experimental regions → source samples. It inherits the shared level extractor's limitations.

## Connection records and graph distinction

Movement connection records retain endpoint region IDs, type, sampled geometric location, source node pairs, measured gap width where supported, relevant triangle IDs, verification status, and explanation. A supported opening is verified at sampled level only when an original movement edge crosses the gap and additional source-mesh segments are clear at 1.5, 3 and 5.5 ft above the endpoints. Low-headroom conflicts remain unknown; a source wall is never turned into a verified passage merely because the original 3 ft ray missed it. These are not accessibility or full swept-volume certificates.

Step edges crossing distinct regions remain explicit step connections. Existing verified level-link chains are reused with their original node sequence and floor-triangle references; a chain crossing a detected physical barrier is rejected. No vertical access is created from overlapping plate coordinates.

Organizational relationship records currently support actual shared-wall boundaries and evidenced openings. For a shared wall, sampled floor supports must be present on opposite sides of the actual source wall segment. This relation is non-navigable; it does not invent a route. Shared-wall evidence is consolidated by region pair, retaining all contributing triangle references. Multiple actual opening gaps remain separate connection records. Verified, inferred and unknown records remain distinct. Missing records do not establish absence of a physical relationship. Independent common-atrium, containment and semantic program relationships are **not yet reconstructed**.

## Controlled validation

| Test | Experimental regions | Verified movement |
|---|---:|---:|
| Single 30 × 30 ft open room | 1 | 0 |
| Two rooms, 4 ft doorway | 2 | 1 opening |
| Two rooms, sealed partition | 2 | 0 |
| Three rooms opening onto corridor | 4 | 3 openings |
| Two rooms, two openings | 2 | 2 openings |

Twenty experimental tests also cover a rotated partition, linear sequence, incomplete/partial enclosure without invented closure, narrow passage, sub-16 ft² transitions, low partition barriers, low-headroom unknown connection, source-buffer preservation, determinism, complete original-node preservation, an atrium-shaped continuous floor without arbitrary subdivisions, disconnected wings, overlapping floors without stairs, and verified sampled stair-chain preservation. Existing production tests remain in the run.

**Stair-test limitation:** the shared elevation extractor merges the closely spaced tread elevations in the controlled stair example into one level. The experiment retains all verified step links. The chain-reuse test supplies known platform-level metadata and a chain independently verified by shortest-path traversal over the original sample graph; it does not assert that production automatically recognizes those platform levels. Detection of real stairs remains limited by this pre-existing level extractor.

The `controlled.cjs` experiment repeats the three accepted Phase 1 geometries and asserts expected counts. `controlled-summary.json` records results; `controlled-*-before.svg` and `controlled-*-after.svg` show sampled region boundaries on source geometry.

## Actual model validation

The exact original files were located under the user's gathering OBJ directory. Their analysis hashes, with the browser's Z-up/feet settings and original source IDs, match the previously exported browser models exactly. No similarly named bundled samples were substituted. `run-models.cjs` takes the source directory as an argument or `LUV_PHASE2_MODEL_DIR`; the implementation has no machine-specific geometry paths.

| Actual source | Analysis hash | Original retained regions | Experimental ≥16 ft² spaces* | Smaller transitions/fragments | Original movement pairs | New verified movement pairs | New verified organizational pairs |
|---|---|---:|---:|---:|---:|---:|---:|
| Linear.obj | 5f11ef0a | 4 | 6 | 73 | 0 | 7 | 104 |
| Stepped.obj | 10b2c3d1 | 64 | 65 | 191 | 25 | 129 | 335 |
| Void_Field.obj | 444f9645 | 13 | 16 | 67 | 0 | 15 | 64 |

*The area classification distinguishes larger experimental components from smaller evidence elements; it is not proof of meaningful room semantics. All reconstructed region boundaries remain inferred.

Connection **records** differ from distinct region pairs because two openings or relation types can connect one pair. Linear has 7 verified movement records (5 openings, 2 steps), Stepped 131 (27 openings, 104 steps), and Void Field 15 (14 openings, 1 step). Verified organizational records are 107, 339 and 66 respectively, including openings and shared walls. Inferred shared-wall records are 2, 35 and 14. These are raw evidence findings, not independently ground-truthed architectural connection counts.

Every final verified movement record was checked against original sample edges or a verified chain. Every verified opening has source-wall triangle support, a positive measured width, and the three unobstructed body-height segment checks. Source position buffers are identical before/after reconstruction. Production descriptor outputs before and after are deeply equal for all three models; Centralized remains unavailable, 6.13389656938044 and unavailable respectively. No new architectural ratings are assigned in Phase 2.

Full source-file SHA-256 digests, level heights, sample memberships, node pairs, wall slices, source triangle IDs, statuses and reasons are in `final-model-summary.json` and the three `*-evidence.json` files. `model-evidence.json` is the earlier browser-exported reference, retained separately. Initial browser diagnostics predated final evidence deduplication; use the **final** model summary and final rendered diagrams for review.

## Visual diagnostics

`*-isometric-comparison.png` shows original walk-component regions left and reconstructed boundaries right over neutral source-mesh outlines. `*-ground-plan-comparison.png` provides ground-level views; each detected level also has before/after SVGs. Region fill is translucent (18%), not an opaque sample grid. Region IDs are labelled R; small transitions are labelled T. Gold lines indicate verified sampled movement; dashed cyan indicates shared wall only; pink indicates inferred/unknown relationships. The separate experiment has opt-in overlays for original sample locations and movement edges. JSON export preserves the original sample graph as well as region and relation evidence.

The PNGs are rendered diagnostic exports based on exact source geometry, not screenshots of the historical pre-edit application. The browser experiment was visually inspected. No screenshot is claimed to show approved or semantically correct architectural segmentation.

## False positives, false negatives, and unresolved interpretation

Controlled false-positive checks pass: sealed partitions, low walls, low-headroom gaps, disconnected plates and nearby separate wings do not become verified walking connections. Controlled doorways are retained, including rotated examples and multiple openings.

The imported models still contain many small components. Some may be legitimate transitions; some are likely oversegmentation from wall slices, detected level assignments, source-detail geometry or sampling. The audit does not label all of them architectural spaces. In particular, hundreds of shared-wall contacts among small fragments must not be interpreted as hundreds of semantic organizational relationships.

False negatives remain possible at curved or non-collinear walls, openings wider than the configured evidence limit, partitions with no second jamb, low boundaries below the slice, missing surfaces, holes, unsupported slope transitions and imperfect elevation extraction. Open areas without reliable partition evidence are left unsplit. An atrium does not automatically become an organizational graph node. The algorithm cannot infer architectural intent or accessibility from OBJ faces alone.

Some actual-model gaps may be exterior facade gaps rather than doors. Their physical sample connection is supported but their architectural role is unknown. Body-height rays do not prove unobstructed movement throughout a person's entire swept volume. No manually labelled room/door ground truth was provided, so an actual-model semantic precision/recall rate is unavailable. Increased counts alone are not evidence of better architectural interpretation.

## Verification and next review

Final suite: **95 tests passed** (20 new experimental tests plus existing graph/evaluation/presentation/cache/rank checks). The model runner additionally asserts source identity, original buffer preservation, determinism, source-edge provenance, opening evidence and unchanged production results. Targeted strict TypeScript checking reports no diagnostics in the three new experiment implementation files. One transitive pre-existing diagnostic remains in `openVolumeClearance.ts:155`: `Pick<ObjFace, 'vertices'>` lacks required `normals` for `faceTriangles`. Full project TypeScript/build is not claimed to pass with the existing dependency/type problems.

Stop here for Phase 2 review. Recommended next work: inspect selected region boundaries and connections against manually labelled source spaces; distinguish transitions from mesh artifacts more reliably; calibrate conservative geometric verification; improve level/stair extraction in a separately authorized scope; then consider independent atrium/containment relations. Do not feed these provisional regions into Centralized scoring or final destination selection until reviewed.
