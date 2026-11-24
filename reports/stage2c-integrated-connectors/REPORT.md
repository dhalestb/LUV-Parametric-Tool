# Stage 2C integrated connector geometry and circulation continuity

Completed October 10, 2026. Repository C:/Users/DHale/Documents/Codex/Cursor-APP; organic-lattice-connections; HEAD e0caff28e420ec7a22d57854b72df725f4b334ec. Changes remain uncommitted. No push, merge, deployment, D: access or placement search.

## Outcome

PASS — Bounded geometry repairs and strict integration validation are implemented and tested. Five synthetic routes pass: flush level, supported ramp, ascending stair, descending stair and a cross-slope endpoint transition. Twelve invalid conditions are rejected. The original four-form assembly still has zero accepted circulation edges, zero generated pieces, four components and FAIL status. L1 remains isolated. This is a trustworthy rejection, not evidence that every possible architectural arrangement is impossible.

## Environment and verified baseline

The prior circulation-feasibility correction, tests, UI colors and untracked reports were present before edits. Its source files were copied into a recoverable local snapshot outside the repository; all pre-existing file hashes were recorded. Frozen pre-task source was replayed in the diagnostic runner rather than editing/restoring production files. connectionClearance.ts was unchanged from e0caff2 before this task and its immutable source was retained for accurate before replay.

Exact checkpoint: checkpoints/lattice-session.json; SHA-256 6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b. O2 undulating workspace.obj (0,0,0), variant 0; O1 void workspace.obj (1,0,0), variant 2; G1 Gathering, Linear.obj (1,1,0), variant 0; L1 Lobby, Vertical Void.obj (2,1,0), variant 3. Field 4 x 4 x 1, 20 ft registration, original roots Z=0 and no zLift. Corrected baseline reproduced before geometry edits: zero emitted connectors, four components, FAIL. Original historical G2–O1 meshes/placements and scores remain UNVERIFIED; no short sample meshes were substituted.

## Confirmed causes and bounded changes

1. **Raised/overlay behavior:** transition geometry already extrudes its thickness downward. It does not intentionally put a 0.25 ft slab above a correct floor elevation. The defect is endpoint qualification: a proximity allowance of 0.2 ft can accept a route 0.05 ft above an otherwise valid floor. Old synthetic raised-plate and arrival-lip tests were accepted. Full-interface flush checks now reject both. Candidate proximity remains useful for proposal generation; it cannot establish walking continuity.
2. **Local ramp grade:** elevation formerly followed Bezier parameter t while XY speed varied. Short endpoint segments could therefore be too steep. Elevation now follows cumulative horizontal travel, preserving both endpoints. This fixes the centerline sampling defect; curved or rotating ribbon edges must still individually meet the same maximum grade. No positive minimum ramp slope was added. The original O2–O1 ribbon remains too steep and is rejected.
3. **Narrow stair/loft:** the decorative negative 4% shoulder narrowed a 2.028374 ft route to 1.948125 ft. Width interpolation now preserves at least the smaller requested endpoint width. Widths below the existing 2 ft minimum are rejected before fitLoftContact can round them upward. No width threshold was reduced.
4. **Stair construction:** ascending stairs previously left the final riser on the destination boundary, creating an unnecessary raised terminal tread/cap and colliding with the upper platform. Ascending pieces now use riser-then-tread; descending pieces retain tread-then-riser. The last ascending tread joins the destination at its floor height. Riser height (<=0.6 ft), tread depth (>=0.75 ft), horizontal treads, cross slope, approaches and landings remain mandatory. Shared emitted-mesh inspection was updated for the two legitimate traversal orders. Synthetic ascending and descending stairs both pass; ramp failure alone never accepts a stair.
5. **Degenerate stair faces:** repeated sections generated zero-area cap/side triangles. These are removed by testing the actual emitted Float32 vertices; valid surfaces remain. The original O2–G1 five-piece stair had 20 degenerate faces, now zero. Imported OBJ topology is untouched.
6. **Contact interpretation:** the old source-contact exception admitted a 0.04 ft band around the interface and measured height from the center, allowing some penetration while rejecting legitimate cross-slope contacts. It now requires independently verified full-width physical floor coverage and a collinear physical boundary. Permitted contact lies on that boundary plane (1e-5 ft numerical coincidence), within its width and the unchanged 0.25 ft connector underside, following actual transverse floor elevation. No positive-volume material penetration is exempt. A 0.03 ft inward endpoint is rejected, while a flush 1% cross-slope interface passes. Raised plates and wall-only contacts are rejected.
7. **Actual walking headroom:** generated-connector and original-form headroom now use actual emitted tread/section walking elevations in addition to existing route clearance. A roof that clears the old stair centerline but obstructs the higher tread is correctly rejected. Existing height thresholds remain unchanged.

## Integration method and evidence

measureFlushWalkingInterface clips the complete emitted endpoint edge against projected, physically classified original floor triangles. It unions exact parameter intervals and compares the linear triangle-plane elevation to the Float32 connector edge over each interval. Full-width height alignment tolerance is 1e-4 ft (numerical tolerance, substantially stricter than candidate proximity); uncovered interface length tolerance is 1e-6 ft. Coplanar boundary coverage is independently checked against existing physical edge runs. Original triangle IDs, interval bounds, source/connector elevations and physical upward normals are retained.

The shared gate records endpoint source elevations in world feet, emitted edges, elevation discontinuity, horizontal gaps, original approach/landing regions and supporting triangles, local source slopes, connector slopes, mismatch and continuity interpretation. Floor normals are expressed in original local geometry coordinates and are transformed for outward slope calculations. Positional continuity is verified. Tangent equality is recorded as a separate condition; ramps can have a permitted slope change at a floor seam and stairs have intentional risers. ADA/code compliance and structural support engineering are UNVERIFIED.

Walking approach validation verifies a continuous local original-floor region extending into the form, including its support and swept opening throat. Wider internal form circulation between different floors/regions is UNVERIFIED, explicitly recorded in accepted validation details. A fully qualified endpoint is not evidence that every internal region of the form is connected. The current graph uses form nodes; a future multi-floor connectivity audit must not infer internal inter-level circulation from these local tests.

## Before and after original relationships

These tables replay the exact saved pre-task pairs; the repaired version rebuilds the path using the revised generation function. independent-section-audit.json measures both retained emitted edges against unchanged original geometry. A zero elevation residual at a single touching corner does not qualify a full unsupported edge.

### O2–O1 ramp

| Measurement | Before corrected geometry | After |
| --- | --- | --- |
| Connection type | ramp, 1 pieces | ramp, 1 pieces |
| Valid source full-width walking attachment | PASS | PASS |
| Valid destination full-width walking attachment | FAIL | FAIL |
| Flush surface integration as a supported route | FAIL — destination floor and approaches | FAIL — destination floor and approaches remain unsupported |
| Endpoint elevation discontinuity | Source PASS < 1e-6 ft; destination UNVERIFIED over unsupported edge | Source PASS < 1e-6 ft; destination UNVERIFIED over unsupported edge |
| Unsupported horizontal interface length, A / B | 0.000000 / 3.732628 ft | 0.000000 / 3.732628 ft |
| Minimum walking width | 2.028381 ft — PASS | 2.028381 ft — PASS |
| Maximum local slope | 0.169650 — FAIL (limit 1/12) | 0.166245 — FAIL (limit 1/12) |
| Approach support | FAIL: incomplete or overlapping floor coverage; no physical floor at entrance | FAIL: incomplete or overlapping floor coverage; no physical floor at entrance |
| Landing support | Not reached; supported approaches fail | Not reached; supported approaches fail |
| Complete route headroom | UNVERIFIED: strict gate stops earlier | UNVERIFIED: strict gate stops earlier |
| Independent emitted collision/route-center clearance | PASS | FAIL |
| Degenerate emitted faces | 0 | 0 |
| First strict rejection | individual ramp segment slope | individual ramp segment slope |
| Accepted graph edges for this relationship | 0 | 0 |
| Full fixture components | 4 | 4 |
| Assembly feasibility status | FAIL | FAIL |

### O2–G1 stair

| Measurement | Before corrected geometry | After |
| --- | --- | --- |
| Connection type | stair, 5 pieces | stair, 5 pieces |
| Valid source full-width walking attachment | PASS | PASS |
| Valid destination full-width walking attachment | PASS | PASS |
| Flush surface integration as a supported route | FAIL — width and landings | FAIL — landings remain unsupported |
| Endpoint elevation discontinuity | PASS, < 1e-6 ft at both entire edges | PASS, < 1e-6 ft at both entire edges |
| Unsupported horizontal interface length, A / B | 0.000000 / 0.000000 ft | 0.000000 / 0.000000 ft |
| Minimum walking width | 1.948125 ft — FAIL | 2.028374 ft — PASS |
| Maximum local slope | Treads level; ribbon/centerline grade 0.387850 | Treads level; ribbon/centerline grade 0.357710 |
| Approach support | FAIL: incomplete or overlapping floor coverage; incomplete or overlapping floor coverage | FAIL: incomplete or overlapping floor coverage; incomplete or overlapping floor coverage |
| Landing support | FAIL at both ends | FAIL at both ends |
| Complete route headroom | UNVERIFIED: strict gate stops earlier | UNVERIFIED: strict gate stops earlier |
| Independent emitted collision/route-center clearance | PASS | PASS |
| Degenerate emitted faces | 20 | 0 |
| First strict rejection | usable width | stair landing support |
| Accepted graph edges for this relationship | 0 | 0 |
| Full fixture components | 4 | 4 |
| Assembly feasibility status | FAIL | FAIL |

The O2–O1 departure edge is flush at 1.730741 ft. Its O1 arrival is at 2.248161 ft, but only a corner of the 3.732628 ft profile touches physical floor; the rest lacks floor coverage. That explains why visible contact/proximity is insufficient. Its source approach also has incomplete coverage. The maximum ribbon slope changes from approximately 0.16965 to 0.166245, still above 1/12.

The O2–G1 endpoint elevations are 9.452584 and 6.666667 ft. Both complete edge profiles are positionally flush and on physical boundaries, yet their 3 ft-deep landings remain unsupported. Restoring width and removing degenerate faces does not cure that physical support failure. The reported stair ribbon/centerline grade is not a tread slope or an accessibility result; emitted treads are level and stairs are independently validated.

## Bounded alternatives and route selection

All original placements remain fixed. Eight existing families were replayed for each original relationship: direct, curved, left/right detours, left/right bridge alignment and left/right switchbacks. Steep variants use the existing explicit stair construction/classification; longer variants earn ramp classification only if their emitted edges, approaches, landings, integration and clearance pass. Switchbacks already contain level transition sections. No new route family, placement search, scoring weight or descriptor ranking was introduced.

Budget per relationship: at most 128 source discovery windows, 128 destination windows, 4 retained qualified destinations, 8 selected pairs, 64 qualified emitted route alternatives, max span 40 ft, max run 72 ft. Actual qualified route constructions were zero because O2 supplied no qualified departure. The 16 exact-route alternatives were all rejected. Additional 2 ft-minimum window checks also failed support, so no routes were fabricated from them.

- O2–O1: 24 destination windows examined (24 available, 0 omitted); 9 qualified, first 4 retained. Destination outcomes: {"incomplete or overlapping floor coverage":15,"continuous original floor and swept opening throat verified":9}. Source discovery examined 9 windows (9 available), with 0 qualified. 0 qualified attachment pairs; 0 constructed qualified routes; 0 accepted. A separate exact 2 ft source-width check also failed: incomplete or overlapping floor coverage; the 3 ft-deep stair landing failed incomplete or overlapping floor coverage. No routes were constructed from this unsupported narrow window.
- O2–G1: 128 destination windows examined (332 available, 204 omitted); 4 qualified, first 4 retained. Destination outcomes: {"incomplete or overlapping floor coverage":71,"local approach slope":51,"continuous original floor and swept opening throat verified":4,"swept approach clearance or headroom":2}. Source discovery examined 9 windows (9 available), with 0 qualified. 0 qualified attachment pairs; 0 constructed qualified routes; 0 accepted. A separate exact 2 ft source-width check also failed: incomplete or overlapping floor coverage; the 3 ft-deep stair landing failed incomplete or overlapping floor coverage. No routes were constructed from this unsupported narrow window.

Exact O2–O1 first failures: direct incomplete approach coverage; curved/left detour excessive ribbon slope; right detour outside bounded footprint; bridge-alignment variants reversed/folded; switchbacks insufficient landing length. Exact O2–G1 first failures: direct/curved/detour/left alignment unsupported stair landings; right alignment reversed/folded; left switchback self-intersecting ribbon; right switchback reversed/folded.

Production route ordering, global scores, placement algorithms and descriptors are unchanged. No speculative connector is added to the graph. The existing gate remains the acceptance authority. A valid alternate route can be selected by synthesis after a rejected port attempt; the raised-plate test explicitly confirms that any emitted fallback is a separately validated flush route, not the rejected raised pair. Unqualified source windows cannot be repaired by a destination-only route change.

## Executed deterministic tests

| Fixture | Before | After | Result |
| --- | --- | --- | --- |
| level flush | accepted | accepted | PASS — validated route |
| supported flush ramp | accepted | accepted | PASS — validated route |
| ascending stair | collision or route headroom | accepted | PASS — validated route |
| descending stair | accepted | accepted | PASS — validated route |
| raised overlay plate | accepted | flush interface: endpoint elevation discontinuity | PASS — correctly rejected |
| destination lip | accepted | flush interface: endpoint elevation discontinuity | PASS — correctly rejected |
| destination below floor | collision or route headroom | flush interface: endpoint elevation discontinuity | PASS — correctly rejected |
| wall-only or unsupported contact | surface attachment | surface attachment | PASS — correctly rejected |
| unsupported arrival gap | surface attachment | surface attachment | PASS — correctly rejected |
| insufficient route width | usable width | usable width | PASS — correctly rejected |
| unsupported stair landing | stair landing support | stair landing support | PASS — correctly rejected |
| insufficient landing depth | stair landing support | stair landing support | PASS — correctly rejected |
| excessive local ramp slope | individual ramp segment slope | individual ramp segment slope | PASS — correctly rejected |
| overhead connector | connector route headroom | connector route headroom | PASS — correctly rejected |
| interior endpoint material penetration | accepted | collision or route headroom | PASS — correctly rejected |
| stair headroom at actual tread elevation | collision or route headroom | connector route headroom | PASS — correctly rejected |
| adapted transverse endpoint profile | collision or route headroom | accepted | PASS — validated route |

PASS — Final synthesis/graph insertion for level, ramp and ascending stair; rejected supplied port is excluded; independent valid fallback remains eligible; a genuinely unsupported two-form fixture emits zero pieces and stays disconnected. Source OBJ and checkpoint hashes, 20 ft registration and original single-level placement all pass. Synthetic test-only destination elevations use explicit transforms to exercise level differences; the original fixture remains at root Z=0 with no lift.

PASS — Prior circulation-feasibility regressions, existing connection-attachment-check and all 24 descriptor tests (4 suites, 0 failures). The historical connector-hash equality assertion is intentionally bypassed only with explicit --allow-connector-geometry-change because this task authorizes changing generated geometry. Original OBJ hash assertions and all geometric rejection/graph assertions remain active; new integration tests independently verify the new meshes. Default historical equality behavior is retained for replay. Prior report files were preserved; new outputs use a separate directory.

PASS — Component ESLint on transitionGeometry.ts, surfaceAttachment.ts, portConnectionValidation.ts and connectionClearance.ts. git diff --check passes. npm run build passed with production compilation, lint/type checks, all 11 static entries and tracing. Existing unrelated unused-variable/hook warnings remain.

FAIL (pre-existing standalone test typing) — npx tsc --noEmit retains 5 TS5097 .ts-import errors and 1 TS2352 incomplete TileVariant cast in unchanged descriptor test files. No new application-source TypeScript errors. Descriptor runtime tests pass.

## Section artifacts

Exact original OBJ/connector triangle-plane sections, plus synthetic continuous walking sections, are exported as editable SVG and PNG. These are geometric test artifacts; no live browser screenshot is claimed. The original curved connector can leave the chord section plane, so separate gold fragments in that plane do not establish a mesh gap. The synthetic longitudinal stair sections show the complete continuous walking profile and the removed ascending terminal cap. Two PNGs were visually inspected for readability.

- [Original O2–O1 before](before-O2-O1-original-section.png), [after](after-O2-O1-original-section.png).
- [Original O2–G1 before](before-O2-G1-original-section.png), [after](after-O2-G1-original-section.png).
- [Ascending stair before](before-ascending-stair-section.png), [after](after-ascending-stair-section.png).
- Level/ramp before-and-after section SVGs are in the same directory. Section numeric evidence: independent-section-audit.json, before-integrated.json and after-integrated.json.

## Performance

Bounded, identical fixed placements; fresh before/after processes, one cold + six warm evaluations. Timing covers evaluateAssembly + matchAssemblyPorts + synthesizeConnectors, excluding analysis, section generation, synthetic fixtures and bounded route discovery. A separate 100-call warm positive-level gate benchmark measures added successful-route validation cost.

| Timing, ms | Before | After |
| --- | ---: | ---: |
| Fixed evaluation cold | 6732.68 | 6807.07 |
| Warm mean (6) | 343.42 | 319.56 |
| Warm median | 358.78 | 317.77 |
| Warm range | 266.95–394.90 | 282.51–371.36 |
| Positive shared gate mean (100 calls) | 0.2692 | 0.2921 |

Successful-gate overhead in this microfixture is 0.0229 ms/call. Cold fixture change is 74.39 ms; warm mean change -23.86 ms. Host variability is substantial: earlier same-input trials ranged from about 2.2 to 7.2 seconds cold. These measurements establish bounded cost, not a complete-search speed prediction or a general optimization gain. No unrestricted search or performance redesign ran.

## Source files and preservation

Modified this task:

- src/components/lattice/transitionGeometry.ts: transitionPath, transitionSections, loftSections, transitionMeshes — arc-length elevation, width preservation, Float32 zero-area face removal, correct ascending/descending treads.
- src/components/lattice/surfaceAttachment.ts: FLUSH_INTERFACE_TOLERANCE and measureFlushWalkingInterface — exact entire-edge floor/boundary/height interpretation. Existing classification, source geometry and discovery ordering remain unchanged.
- src/components/lattice/connectionClearance.ts: transitionSurfaceClear — independently qualified, strictly coplanar boundary contact following actual cross slope; existing exact collision and standing tests retained.
- src/components/lattice/portConnectionValidation.ts: validateCirculationConnection — pre-fit minimum width, stair-order-aware dimensional tests, emitted edge integration and metrics, actual walking headroom for all forms/connectors.
- scripts/circulation-feasibility-regression.cjs — separate output directory and explicit authorized generated-geometry revision switch; original geometric/source fidelity assertions preserved.
- New scripts/integrated-connector-regression.cjs and scripts/integrated-connector-sections.cjs; new reports/stage2c-integrated-connectors/.

Inspected/reused unchanged: walkingApproach.ts, alternativeRouting.ts, portMatching.ts, connectionSynthesis.ts, geometryRevision.ts, surfaceOrientation.ts and assignmentSearch.ts. The prior Stage 2C port matching/synthesis/graph correction remains present.

PASS — All original mesh vertices, normals and faces match before/after SHA-256 values in the JSON evidence. Original checkpoint SHA remains exact. Source scale/proportions/topology, unit/axis conversion, orientation, registration and saved configuration were not edited. Generated meshes remain separate arrays and objects. Preservation comparison: 502 existing files byte-identical, exactly 5 intended existing files changed in this task, no missing/unexpected files; old reports, presentation assets, all 12 UI changes, evaluation formulas and prior solver work unchanged. HEAD unchanged and staged diff empty. Other worktrees and production deployment were untouched. preservation.json records this evidence.

## Remaining limitations and next bounded action

FAIL — Fixed O2–O1 and O2–G1 relationships remain unsupported; no fully validated original-OBJ connector was achieved. This bounded search identifies incomplete approach/landing coverage and O1's unsuitable arrival profile, not global architectural impossibility.

UNVERIFIED — Wider internal form circulation, structural capacity/support, a continuous full-route swept pedestrian volume, ADA/code compliance and the historical G2–O1 case. Current headroom over emitted route sections/treads is sampled; continuous endpoint approach footprints are geometrically checked. Only independently verified endpoint contact is exempt; irregular boundaries that cannot support the whole edge are rejected. No destructive Boolean or OBJ edits are permitted. Global form-node connectivity between disjoint internal floors still needs a separate audit before full-building circulation claims.

Remaining implementation limitations: default qualified discovery proposes 3/2.1 ft windows and round-robin caps; smaller valid regions or other widths/offsets can be omitted. The tested exact 2 ft window at the old O2 departure also fails support, so reducing width there does not provide a legitimate repair. Curved loft frames may still create excessive ribbon-edge grade, reversal or self-intersection even when the centerline grade is acceptable. A source floor with insufficient continuous approach cannot be fixed by a flush visual seam alone. No valid combined transition was found to justify adding another construction family.

Recommended next bounded development: independently map O2's physical walking-region continuity and boundary envelopes, then test explicitly supported shifted approach/landing windows within the unchanged form. Separate genuine lack of usable depth from proposal-window omissions before any new routing or placement optimization. Keep the strict shared gate. If no existing physical departure qualifies, present alternative source-opening or permitted placement options for authorization rather than altering the original mesh. The legacy provisional PASS labels in some UI neighbor panels remain a separately reported issue; no UI/color changes were made.

Reproduce from repository:

~~~powershell
node scripts/integrated-connector-regression.cjs --before
node scripts/integrated-connector-regression.cjs
node scripts/integrated-connector-sections.cjs --before
node scripts/integrated-connector-sections.cjs
$env:CIRCULATION_REPORT_DIR='reports/stage2c-integrated-connectors/after'
node scripts/circulation-feasibility-regression.cjs --baseline
node scripts/circulation-feasibility-regression.cjs --allow-connector-geometry-change
Remove-Item Env:CIRCULATION_REPORT_DIR
node scripts/connection-attachment-check.cjs
npm run build
~~~

The before runner requires the retained local pre-task snapshot. Its files are outside the repository; it is diagnostic evidence, not a committed portable fixture. Current after tests and source preservation use the real saved OBJ checkpoint. test-failure.json retains an intermediate resolved cross-slope regression; final pass/fail evidence is after-integrated.json and the final outputs.

Work is complete within the bounded scope. Stop for review; no commit or deployment is authorized.
