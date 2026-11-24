# Stage 2D implementation and bounded validation — 2026-10-10

**Overall acceptance: FAIL.** The opt-in adaptation implementation passes its synthetic regressions, but no validated connection using the original checkpoint OBJs was achieved. The four-form assembly remains at **zero confirmed edges, zero emitted pieces, four components, FAIL**. Do not treat the synthetic demonstrations as original-OBJ success or a production-ready adaptive solver.

The reliable-cutting portion is blocked by source topology. All four original connection surfaces are rejected by the installed Manifold 3.5.3 engine. No approximate cuts or silent mesh repairs were substituted. No full placement search was run.

## Preservation and checkpoint

Repository: `C:\Users\DHale\Documents\Codex\Cursor-APP`; branch `organic-lattice-connections`; HEAD `e0caff28e420ec7a22d57854b72df725f4b334ec`.

Recoverable file checkpoint: `C:\Users\DHale\.codex\visualizations\2026\10\08\01a11a08-af57-78a1-949a-6593c892fa51\stage2d-before\`. It contains the current tracked and nonignored untracked files, including the uncommitted Stage 2C and UI work, with `snapshot.json`. No Git checkpoint commit was made because commits are not authorized.

All **544 pre-existing files** compared with that checkpoint remain unchanged; none are missing. See `preservation.json`. Existing changes still comprise 12 UI files and eight Stage 2C lattice files, plus the previously untracked reports and scripts. This task added only:

- `src/components/lattice/adaptiveGeometry.ts`
- `scripts/adaptive-connector-regression.cjs`
- `scripts/adaptive-connector-sections.cjs`
- `reports/stage2d-adaptive-connectors/`

The session SHA-256 remains `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`. Every original mesh's typed positions, normals, faces and other serialized source data retain their verified hashes:

| Original | SHA-256 |
|---|---|
| O2 | `5eac71dbbcaaa363259f1688e278ff61bcf38791d9ccf4538f7f17f9bf001bac` |
| O1 | `a6c3916a411ab0e72cc28a83992054e4f5623e84b0c4a32d014a18fe45d5205d` |
| G1 | `c420eaad9120d0969ebe3b980fb4c01f1d08d5c00e5019b8a01a7f69a0caca24` |
| L1 | `a1f9c7a20e0cd2b382e94ca75ec70ee4d177bae9ab640b99b3071342a8472e86` |

Registration remains O2 (0,0,0)/variant 0, O1 (1,0,0)/variant 2, G1 (1,1,0)/variant 0, L1 (2,1,0)/variant 3, at 20 ft increments in 4 × 4 × 1. No lift or orientation change was introduced. Scoring, descriptor formulas, placement algorithms, Board Mode and UI files were untouched. There was no D: access, commit, push, merge or deployment.

## Architecture and actual implemented scope

The new module is an **explicit opt-in backend**, callable alongside existing synthesis. The default assignment pipeline is unchanged. It is not automatically invoked by the UI or global optimizer. The existing geometry/placement-sensitive validation caches remain authoritative.

| Function / source location | Executed behavior |
|---|---|
| `adaptiveGeometry.ts:15`, `DEFAULT_ADAPTATION_LIMITS` | Central physical limits: extent 6 ft, removal 8 ft³, landing area 24 ft², connector travel 72 ft, four columns, 250,000 triangles per effective solid, 32 evaluated route candidates. Configurable; invalid limits rejected. |
| `adaptiveGeometry.ts:29`, `proposeAdaptiveLanding` | Generates a cardinal rectangular landing and a possible 2 × 2 ft column from actual classified original floor triangles. Highest eligible floor below the proposed underside supplies a bearing proposal. A point inside a floor triangle is only a proposal; full bearing and access validation follows. |
| `adaptiveGeometry.ts:58`, `fitAdaptiveRampElevation` | Redistributes rise by the shortest walking-edge travel in each climbing segment. Flat landing segments contribute zero climbing run. Cross-sloped profiles remain subject to the strict validator and are not approximated by this planar fit. |
| `adaptiveGeometry.ts:114`, `deriveAdaptedAssembly` | Transactional, copied-source Boolean addition/difference, localized box envelopes, exact material volumes, bounded columns, bearing/access checks, obstacle checks, finite/nondegenerate/manifold output, provenance, and effective validation surfaces. Failed transactions emit no adapted geometry or material-change records. |
| `adaptiveGeometry.ts:203`, `evaluateAdaptiveConnection` | Existing-surface candidates, supplied bounded relocation candidates, optional generated/provided landings or explicit cuts, ramp candidates before stair candidates, existing class gate plus strict circulation validation. Only accepted exact connector geometry yields a confirmed edge. |

Original input models remain separate. Derived form meshes, landing meshes, support meshes and circulation meshes carry distinct category/source identifiers. Records store source identity and exact geometry revision, operation envelope, purpose, added volume/area and removed volume. Original SHA-256 identities are retained in the accompanying fixture report. Records are for diagnosis/provenance; source revision IDs are process-local and are not persisted cryptographic source hashes.

The effective connection surface includes the actual Boolean result and generated supports, transformed back into each form's local coordinates. Removed material is therefore absent from collision/headroom validation, and added material is present. The default mode is **Preserve Original**; cutting requires **Allow Derived Adaptation** explicitly. Only test fixtures enabled cutting here. WASM is supplied to the backend explicitly, avoiding automatic initialization in ordinary search.

Only rectangular additions, columns and box subtraction were implemented. Recesses are representable as explicit box differences, but automatic recess design, edge blending, arbitrary polygonal extensions, beams/brackets, platform support design and automatic minimum-cut discovery were not implemented or claimed.

## Geometric and support safeguards

An extension requires a complete original physical floor boundary, a separately verified two-foot internal walking approach, matching floor elevation and 0.25 ft downward slab thickness, a cardinal frame, and actual bearing. A column must fit below the landing, touch a verified original floor footprint, reach the landing underside, and avoid positive-volume intersections with original/generated geometry. Existing connectors are included as obstacles; existing confirmed relationships are revalidated after adaptation.

The bearing footprint conservatively reuses `validateWalkingApproach`; its headroom requirement can exclude real bearings under low overhead slabs. Such cases remain rejected rather than silently bypassed. The columns are **geometrically bearing and conceptually supporting**, not structurally engineered or load-capacity verified. Support presence never replaces the original internal approach check. Local endpoint connectivity does not prove connectivity among all floors inside a form. No ADA claim is made for the two-foot conceptual minimum.

Every accepted connector passes the unchanged `acceptCirculationClass` and `validateCirculationConnection` gates, including actual tread/riser dimensions, all ribbon-edge slopes, flush emitted endpoints, walking/landing footprints, collision and headroom. Flat landings do not earn climbing run. The adapter returns the geometry just validated. A tested derived stair also passes existing `synthesizeConnectors` and its actual graph insertion.

## Verified original topology blocker

The kernel was first verified on a closed synthetic box (positive volume, `NoError`). Each original anchored connection surface was then copied into a derived Mesh, with duplicate-vertex merging confined to the copy. All four failed construction with `Not manifold`.

| Original | Boundary edges | Inconsistent / nonmanifold edges | Degenerate triangles | Kernel result |
|---|---:|---:|---:|---|
| O2 | 6 | 267 | 186 | BLOCKED |
| O1 | 15 | 86 | 12 | BLOCKED |
| G1 | 0 | 171 | 0 | BLOCKED |
| L1 | 70 | 0 | 0 | BLOCKED |

These diagnostic counts come from the existing `surfaceOrientation` analysis of anchored, triangulated Float32 surfaces with its existing coordinate-edge keys; they are not original OBJ face counts or a repair result. Zero boundary edges alone does not prove a valid oriented manifold: G1 has inconsistent/nonmanifold adjacency. No source normals, winding or topology were changed.

**Limitation:** The current adaptation transaction requires a reliable solid for the entire obstruction scene. Consequently its Boolean additions, not only cuts, are conservatively blocked on this original fixture. The original walking-surface validator can interpret local floors that the whole-solid Boolean engine cannot safely consume. A reliable local derived surface representation is required to bridge that gap.

## Original-OBJ before and after

The Stage 2C baseline was reproduced using the exact original checkpoint and the two historical candidate pairs, with current corrected transition geometry. No G2–O1 fixture was substituted.

| Measurement | O2–O1 Stage 2C | O2–O1 Stage 2D | O2–G1 Stage 2C | O2–G1 Stage 2D |
|---|---|---|---|---|
| Valid connection | No | No | No | No |
| Baseline candidate type | Ramp | Ramp/stair alternatives investigated | Five-piece descending stair | Ramp/stair alternatives investigated |
| Source attachment | Edge flush; approach incomplete | Still incomplete | Edge flush; landing incomplete | Still incomplete |
| Destination attachment | Full-width edge unsupported | Unchanged | Edge flush; landing incomplete | Still incomplete |
| Cuts / removed volume | None / 0 | None / 0 | None / 0 | None / 0 |
| Added landing area | 0 | 0; 20.0177 ft² proposed only | 0 | 0; 12.1702 ft² proposed only |
| Added supports | 0 | 0; no qualified bearing found by proposal sampling | 0 | 0; no qualified bearing found by proposal sampling |
| Baseline minimum width | 2.028381 ft | Unchanged; no accepted mesh | 2.028374 ft | Unchanged; no accepted mesh |
| Baseline local ramp slope | 0.166245, above 1/12 | Same baseline; fitted alternatives still rejected for other constraints | Not a ramp; tread/riser checks apply | No accepted ramp |
| Flush integration | Source only | No complete accepted relationship | Both edges flush | Landing support remains invalid |
| Collision clearance | Baseline independently checked; not circulation accepted | No fully validated result; early failures prevent clearance proof for some alternatives | Baseline independently checked; not circulation accepted | No fully validated result |
| Confirmed graph edges | 0 | 0 | 0 | 0 |
| Full-fixture components / status | 4 / FAIL | 4 / FAIL | 4 / FAIL | 4 / FAIL |
| Actual geometry modification extent | 0 | 0 | 0 | 0 |

Exact approach evidence:

- O2–O1 source region 8 covers **4.040436 / 4.056763 ft²** of the requested two-foot approach. O1 has no physical entrance floor at the proposed center; the full interface has **3.732628 ft** unsupported projected edge length.
- O2–G1 source region 17 covers **5.856641 / 6.085121 ft²** of the requested stair landing. G1 region 58 covers **5.185171 / 6.085121 ft²**. Flush edge contact does not repair either missing landing footprint.

Each original relationship evaluated **14 route candidates** plus one blocked adaptation transaction; no placement was changed. The final first-failure breakdown is:

| First failure | O2–O1 | O2–G1 |
|---|---:|---:|
| Incomplete / overlapping continuous floor approach | 4 | 0 |
| Insufficient shortest-ribbon climbing run | 1 | 0 |
| Insufficient centerline climbing run | 0 | 8 |
| Folded/reversed section | 4 | 1 |
| Switchback landing length | 2 | 0 |
| Individual ramp segment slope | 3 | 0 |
| Stair landing support | 0 | 4 |
| Existing circulation class gate | 0 | 1 |
| Reliable derived operation blocked: Not manifold | 1 | 1 |

These are first failures, not proof that subsequent collision/headroom checks would pass. Both candidate pairs and complete outcomes are retained in `results.json`. Fixed four-form matching/synthesis was also rerun: zero connectors, four components and FAIL, with the unchanged reported score of −116.4. That score is a reproduced observation, not a changed formula or optimization target.

## Synthetic demonstrations and tests

**PASS: 26 new executed tests.** Complete names, assertions, timings, exact meshes and validation details are retained in `results.json` and `test-output.txt`.

The integrated extension fixture begins with a floor that supports a two-foot approach but lacks the three-foot stair landing. A **9 ft²**, flush, 0.25 ft-thick external landing and a **2 × 2 ft**, **7.75 ft-high** column to a real lower floor are generated. The column volume is **31 ft³** and landing volume **2.25 ft³**. The source endpoint moves from x = 8 to the actual new boundary x = 11; the destination is x = 26 at z = 3. The resulting 15 ft, five-piece ascending stair passes full-width flush integration, approach/landing coverage, dimensions, headroom and collision validation. Existing synthesis emits it and connects A–B; the distinct bearing form remains a separate circulation component. Test-specific extent is 12 ft to permit the explicitly modeled lower bearing.

The opening fixture removes **14 ft³** of a synthetic throat wall only from the derived copy, restores a flush floor boundary, and subsequently earns a validated connector and graph edge. It explicitly uses a 16 ft³ removal limit; the default 8 ft³ limit correctly rejects that same operation. This is not evidence of a cut on an original imported OBJ.

| Requested coverage | Result / evidence |
|---|---|
| Supported extension; attached landing; invalid bearing | PASS: actual floor/landing/column construction and negative bearing/no-support cases |
| Additional ramp travel; flat landings excluded | PASS: insufficient climbing run rejected; shortest-edge elevation fitter exercised |
| Switchback with landings | PASS for existing **two-flight offset** family and a flat intermediate landing, 2.2 ft rise, 38.0675 ft total path; all local edge slopes validated. A true 180-degree switchback with independently engineered platform support is UNVERIFIED. |
| Ramp-to-stair selection | PASS: insufficient ramp run followed by a validated stair; no automatic acceptance on ramp failure |
| Derived opening; original preservation | PASS on closed synthetic source; BLOCKED on original OBJs |
| Flush adapted boundary; raised overlay; obstructed throat | PASS: positive and negative exact geometry tests |
| Excessive slope; unsupported stair/landing | PASS: strict rejection preserved |
| Excessive alteration; budgets | PASS: volume/area limits and default cutting prohibition |
| Graph insertion | PASS: returned edges only after strict acceptance and actual synthesis of the derived stair |
| Original / derived / generated categories | PASS: separate data and provenance; no source mutation |
| Registration / single level / revision invalidation | PASS: 20 ft transform and unchanged iz; in-place derived edit changes exact geometry revision |

## Existing regressions, build and checks

- Existing integrated Stage 2C regressions: **17/17 PASS**, including positive level/ramp/ascending/descending stair fixtures, raised/inward penetrations, headroom, support and graph rejection.
- Existing circulation-feasibility regression: **PASS**, including invalid/unverified voxel relationships not joining the confirmed graph, original fidelity, support/headroom and geometry cache invalidation. Its historical Stage 1 replay was retained separately; it is not used as the current Stage 2C feasibility expectation.
- Descriptor suites: **24/24 PASS**.
- New TypeScript module ESLint: **PASS**.
- Production build: **PASS**; Windows sandbox SWC path access required the approved build outside the sandbox. Existing build warnings remain.
- Standalone TypeScript: **six existing test errors remain**, five TS5097 `.ts` imports and one TS2352 incomplete `TileVariant` test fixture. No new adapter errors remain.
- `git diff --check`: **PASS**, apart from informational pre-existing CRLF warnings.

Relevant outputs: `build.txt`, `lint.txt`, `typescript.txt`, `descriptor-tests.txt`, `stage2c-output.txt`, `stage2c-regression/`, `feasibility-output.txt`, and `feasibility-regression/`. Old report directories were not overwritten.

Reproduce without placement search:

```powershell
node scripts/adaptive-connector-regression.cjs
node scripts/adaptive-connector-sections.cjs
npx eslint src/components/lattice/adaptiveGeometry.ts
npx tsc --noEmit --pretty false
npm run build
```

## Performance and evidence

Latest bounded observations: WASM initialization **20.00 ms**; warm unchanged synthetic adapter **1.07–3.28 ms** per one-candidate accepted evaluation. Supported extension construction test **38.07 ms**; full automatic stair-extension evaluation **49.10 ms**; synthesis/graph test **453.87 ms**. Original bounded relationship evaluation was **491.61 ms** (O2–O1) and **423.50 ms** (O2–G1), excluding outside proposal discovery; each includes 14 route attempts and the blocked adaptation transaction.

The current unchanged four-form circulation regression measured **6.663 s cold**, **0.277–0.387 s warm**. The earlier independent integrated regression measured **5.858 s cold**, **0.251–0.459 s warm**. These runs were not identical isolated benchmark conditions; no performance improvement or regression is inferred from that variation. New Boolean transactions currently rebuild copied source solids; geometry-sensitive caching there is deferred until a valid original representation exists. Existing surface/clearance caches remain in use. No complete assignment search was run.

Actual synthetic triangle geometry produced plan, section and axonometric SVGs/PNGs: `synthetic-plan`, `synthetic-section`, `synthetic-axonometric`, plus `synthetic-opening-section`. The section and opening PNGs were visually inspected. Views clearly state **synthetic only** and **structural engineering unverified**. `synthetic-generated-geometry.json` and `synthetic-opening-geometry.json` preserve their mesh data. No live-browser screenshot is claimed.

`original-O2-O1-unchanged-section.svg` and `original-O2-G1-unchanged-section.svg` copy the previously verified Stage 2C exact-original-mesh sections because those original candidate meshes were unchanged. They depict unsuccessful baseline proposals, not emitted or adapted connections. No original-OBJ adaptation was generated to visualize.

## Remaining limits and recommended next bounded action

The original-OBJ acceptance requirement is **not met**. Whole-solid reconstruction is the immediate blocker for the implemented CSG path; missing approaches, landings and bearing locations remain independent physical constraints. Fixing topology alone does not establish a connection.

Recommend a **bounded local derived floor/solid reconstruction at one O2 departure**, preserving all original source data, with explicit topology and material-side evidence. First determine whether its local slab and missing approach strip can be represented and stitched reliably without rebuilding the entire form. Require exact source provenance, capped oriented manifold derived output, no unintended material loss, and independently verified bearing. Then retry only O2–G1 at the same placement using the corrected stair and a verified three-foot landing. Do not begin another placement search or weaken the validator.

Pending capabilities include automatic minimal-cut envelope design, internal route continuity between disjoint floors, non-cardinal/polygonal landing generation, smaller bearing-footprint validation without walking-headroom semantics, beam/bracket support design, and true supported 180-degree switchbacks. The adapter is not wired into the ordinary UI/search. Any later integration must preserve its exact validated route rather than allowing legacy preparation to silently regenerate a different path; the new derived stair case was explicitly revalidated through that pipeline.

Work is left uncommitted for review. The blocked original-geometry portion is stopped pending authorization for the recommended reconstruction step.
