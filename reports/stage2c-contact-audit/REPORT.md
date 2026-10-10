# Stage 2C — departure and arrival contact audit

Completed 2026-10-08. **Diagnostic review only; no production correction implemented.**

The principal endpoint failure is real penetration by the generated connector's underside into sloped slab material below otherwise usable walking-floor edges. Correct floor attachment and overhead clearance do not establish space for a constant 0.25 ft thick connector. Several routes also have independent direction, slope, folding, width-envelope or distant obstruction failures. A smaller, separate defect causes degenerate stair faces to be counted as triangle collisions.

**Primary recommendation: A — bounded endpoint/cross-section correction**, using the actual free volume around the supporting floor, including the underside. Do not broaden endpoint contact exemptions. This is not a claim that an endpoint correction alone would validate an entire route.

## Phase 0: checkpoint and verification

Reviewed the Stage 2B harness and reports. Replayed its same 24 configurations without expanding the study. The replay reproduced every saved per-configuration first-failure count, zero accepted connections, three existing-stair obstructions, cold/warm parity, unchanged original meshes/connector geometry, and renderer-root checks. Scoped ESLint passed.

Created local checkpoint **e0caff28e420ec7a22d57854b72df725f4b334ec** (`Checkpoint bounded Stage 2B L1 feasibility study`). The prior checkpoint `abb7f9aa7c2796a805d379d0a3056b27a4982a87` is preserved. No push or deployment occurred. Stage 2B's report remains unchanged; the checkpoint contains the successful verification replay.

New files are confined to `reports/stage2c-contact-audit/`: reproducible `run.cjs`, full `audit.json`, `contact-witnesses.csv`, and this report. Production source, the original session, and the D: repository were not changed.

## A. Representative configurations

O1, O2 and G1 retain their original placements. L1 has no mirror or lift. Every selected pair, original profile, route path and emitted mesh is retained in `audit.json`; no new route family or placement was introduced.

| Stage 2B case | L1 cell / rotation | Alternatives at B-3 | Selection reason |
|---|---|---|---|
| 1 | (2,1,0), 90° | curved, direct | Original configuration; clear near-exit underside witness and reversed-arrival control |
| 2 | (2,1,0), 0° | curved, direct | Best alignment among the existing network-preserving cases: minimum departure/arrival chord cosine 0.996905, about 4.509° at each end |
| 3 | (2,1,0), 180° | right bridge alignment | O1 interference eliminated, but endpoint/loft problems remain |
| 21 | (2,2,0), 90° | curved, direct | Another clear local departure witness; its direct route passes kinematic and exact centreline intersection checks but its emitted width/thickness envelope fails |

Seven exact alternatives, four already-tested configurations. Source: G1 region 58 at `(13.128291130,18.647270012,6.666666508)`, outward `(1,0,0)`, width 2.1 ft. Destination: transformed L1 region 21 entrance B, width 3 ft. Narrower B-2.1 was not added to this representative audit. No placement is applied to the saved session.

## B. Exact collision identities and independent method

Triangle IDs are **zero-based** indices in `connectionSurface.triangles`, in original OBJ face-fan order. The audit also records zero-based original face and fan indices; for the representative IDs below, original face index equals triangle index. Connector IDs are `(mesh index, emitted index-triple/face index)`, after the actual generator's winding order. No spatially sorted BVH ID is substituted for an original triangle ID.

The diagnostic hook loads an in-memory copy of the production collision module to enumerate all triangle pairs using its unchanged BVH, intersection predicate and seam rule. It does not change production code. A second implementation uses plane/interval intersection and coplanar polygon clipping to calculate explicit intersection segments/polygons. The CSV records 4,012 witness points, coordinates relative to the relevant interface, and nearest projected plan station along the original centreline.

Of **1,360 rejected triangle pairs**, **1,346 have independently confirmed nondegenerate surface intersections**. The remaining 14 involve zero-area emitted stair faces, discussed under G below. Counts are triangle pairs, not unique physical obstacles or route counts.

Selected exact witnesses:

| Case / route | Original form / triangle | Connector mesh:face | Intersection evidence |
|---|---|---|---|
| 1 curved | G1 13694 | 0:2, underside | Segment from `(13.303482464,19.288551331,6.441384747)` to `(13.303482464,18.755772808,6.441384747)`; 0.175191 ft outward, 0.225282 ft below the floor; projected stations 0.129311–0.167063 ft |
| 1 curved | L1 14871 | 0:210, underside | Vertical/slightly oblique source wall; collision begins before the terminal opening, rather than on region-21 floor contact |
| 1 direct | L1 18487 | 0:0, walking/top face | Approaches from the wrong side; a witness lies about 0.78–0.80 ft inside the interface plane and about 0.18 ft below B's floor |
| 2 curved | G1 13066 | 0:2, first tread underside | Nearly vertical original source side, beyond a permitted seam; actual stair body collides |
| 2 curved/direct | L1 15280 | 2:0, final tread top | Last tread meets material below B; tread is 0.563676 ft below destination floor before the terminal riser |
| 3 right bridge alignment | G1 13676 | 0:2, underside | Sloping material beside/below the original walking-floor edge |
| 3 right bridge alignment | L1 15404 | 0:272, top face | Original near-vertical side; folded/bent route enters material beside B |
| 21 curved | G1 13694 | 0:2, underside | Same sloping source boundary as original case, despite different L1 position |
| 21 curved | L1 15276 | 0:314, underside | Sloped material below destination floor edge |
| 21 direct | G1 13694 | 0:2, underside | Segment at x=13.313124646, z=6.428985689; 0.184834 ft outward and 0.237681 ft below source floor |
| 21 direct | L1 15285 | 0:2, underside | From `(38.219859410,30.166273740,8.089023214)` to `(38.272014685,30.169164404,8.092499371)`; 0.113992–0.116883 ft outward, 0.265195–0.268671 ft below B; lateral offset −1.780141 to −1.727985 ft, outside its ±1.5 ft terminal width |

These are examples, not the entire collision set. `audit.json` retains each original triangle's three world vertices, generated face vertices, physical classification metadata, all intersection witnesses, and all exact emitted mesh positions/indices. Mesh hashes are recorded per alternative.

## C. Departure: G1 region 58

The source top profile is correctly attached at z=6.666666508 ft, width 2.1 ft, outward +X. Its 2 ft deep interior footprint remains continuous; the strict 3 ft landing does not. The source top is not misclassified as an underside, and its first section is not vertically displaced.

The error is assuming that a connector can be extruded **0.25 ft downward** from that top edge without checking the adjacent material volume. G1 triangle 13694 has normalized raw normal approximately `(0.789399,0,0.613880)`: a sloped material boundary, not a horizontal walking patch. It extends outward under the top edge. Region `-1` for this triangle means it is not an accepted walking region; it remains original solid boundary geometry and must still participate in collision testing.

An independent full-width prism audit clips **every original G1 triangle**, not a few centreline samples, against the immediate exterior envelope. For a straight 2.1 ft wide body occupying floor−0.25 through floor, original material boundaries intersect it on **16 triangles**, from beyond 0.040001 ft out to **0.185416 ft** outward. Both the 0.5 ft and 2 ft long probes identify this same local obstacle. A simultaneous overhead prism from floor+0.05 to floor+6.5 has no original-G1 surface crossings over the same width and first 2 ft.

Material-side checks corroborate solid penetration: `(outward=0.05, lateral=0, height=−0.125)` lies inside G1 material, with no uncertainty; the corresponding point at height +0.1 is outside. At the recorded triangle-crossing witnesses, opposite 0.005 ft normal offsets give occupied versus empty material. These sampled material checks corroborate the full triangle clipping; they are not used as a substitute for complete corridor coverage.

**Departure feasibility:** the walking-height opening and overhead space are locally usable, but the **current constant-thickness endpoint body is not**. That slab-edge geometry is invariant while G1 stays fixed; moving L1 changes the following path but cannot remove this material. The selected emitted meshes prove the actual penetration, not merely proximity. A different geometry respecting the free underside envelope might be possible, but none has been constructed or validated here.

There are also farther G1 obstructions: for example, the original curved centreline crosses triangles 15488 and 15596 at plan stations 13.857339 and 15.221446 ft. Fixing the immediate underside would not erase those later obstacles.

## D. Arrival: L1 entrance B

B's floor is correctly located at z=8.357694626 ft. Its original 3 ft wide approach at depths 2/4/6 ft and approximately 10.155 ft headroom remains preserved in the baseline; the selected destination footprints remain valid. The terminal profile's walking top meets the original floor. The underside and incoming envelope need separate interpretation.

The baseline B prism, 3 ft wide and extending normally outward, has **26 original L1 triangles** intersecting the floor−0.25 to floor body. Those boundaries extend beyond the seam to **0.102039 ft outward**. No original-L1 triangles intersect the overhead prism through the first 2 ft. This is evidence of a slab-edge/body conflict, not a closed wall occupying the entire walking-height opening. The probe is local to L1; it does not certify clearance against other forms or the entire route.

The alternatives have additional arrival defects:

- Original direct: arrival direction is reversed. Its incoming reverse tangent has a negative dot product with B's outward direction (−0.296662 using a 3-D unit tangent). It travels through material behind/beside the opening. Its centreline intersects L1 triangle 15331 at `(35.764391822,11.601535818,8.091149146)`, station 23.707286 ft. That is not legitimate endpoint contact.
- Original curved: the terminal tangent has the correct sign and the centreline avoids L1, but the curved ribbon swings sideways into L1's side material before reaching B. First exact wall witnesses have lateral displacement far beyond the ±1.5 ft terminal strip. It also exceeds local slope limits before collision validation.
- Best-aligned case 2: chord alignment improves, but the available plan run selects a three-step stair. The final tread is at z=7.794018745 ft, followed by a 0.563676 ft terminal riser. Tread/underside geometry intersects the slab below B, and G1 lacks the required source stair landing regardless.
- Case 3 right bridge alignment: the path crosses L1 material and has six reversed/folded section intervals. O1 clearance alone does not make its arrival valid.
- Case 21 direct: the centreline avoids both endpoint forms and passes slope/direction checks. Its loft underside and lateral envelope still intersect L1. The witness on triangle 15285 lies outside the terminal 3 ft strip, showing why a point or end-profile fit is insufficient for the incoming body.

**Arrival feasibility:** B remains a real walking-floor interface, but no tested incoming constant-thickness body fits it without collision. The exact top elevation is correct; principal failures concern the below-floor body, incoming direction and lateral swept envelope. L1 must not be cut or treated as absent to accommodate them.

## E. Contact taxonomy A–G

| Category | Finding |
|---|---|
| A — legitimate supporting-floor contact | Confirmed and already permitted. G1 triangle 13661 / generated 0:0 contacts region 58 exactly at outward=0, height=0. L1 triangle 17807 contacts region 21 at the terminal top (e.g. baseline curved 0:296), also at outward=0, height=0. Production rejects neither. |
| B — genuine slab/wall penetration | Confirmed independently: sloped G1/L1 slab edges below the floor, and farther structural/side surfaces. Material exists on one side of representative crossing witnesses. |
| C — cross-section outside available opening | Confirmed for incoming width/body envelopes, including case 21 direct L1 triangle 15285. Terminal width fits; the preceding slanted envelope can still occupy material outside that strip. |
| D — folding/reversal/twist | Original direct reverses at arrival and has one folded interval; case 3 right bridge alignment has six folded intervals. No fold was found in the selected curved cases or case 21 direct, so folding cannot explain every rejection. |
| E — vertical alignment | Endpoint walking elevations are correct. The fixed downward extrusion is incompatible with the local supporting-edge volume; the stair's below-floor last tread adds a distinct arrival conflict. Not a global OBJ elevation error. |
| F — curvature/width transition | Curvature and frame blending worsen slope and lateral sweep in several alternatives. Case 21 direct also collides, so removing curvature alone would not resolve contact. No supported width was enlarged during this audit. |
| G — collision geometry/interpretation | Fourteen rejected triangle pairs in case 2 use **zero-area generated stair side faces**, not nondegenerate surfaces. They are secondary diagnostic overcounting from degenerate geometry; removing them would leave 1,346 independently confirmed rejected pairs across the audit. No basis exists for a general seam/contact exception. |

The seam rule permits contact only near the endpoint plane (0.04 ft) and endpoint height (0.26 ft). The verified slab penetrations extend beyond it; changing tolerances would hide actual occupied material. The 14 degenerate-face reports are a distinct issue and must not be conflated with legitimate floor contact or used to dismiss the nondegenerate collisions.

## F. Path, sections and emitted mesh

| Case / route | Centreline/approach findings | Sections | Emitted mesh / first invalid stage |
|---|---|---|---|
| 1 curved | Maximum centreline slope .173060; also crosses G1 farther along | No folded intervals; edge slope reaches .251666 | Already invalid at path stage; additional underside and L1 side penetration |
| 1 direct | Slope .060086, but arrival reversed; crosses G1 and L1 | One folded interval | Invalid path, then folded loft and material penetration |
| 2 curved | Selects stair; source landing fails; crosses G1 | No fold | Invalid approach/route requirements before the real stair-body intersections |
| 2 direct | Plan slope .098269 exceeds ramp limit, so selects stair; source landing fails; crosses G1 | No fold | Invalid stair approach; degenerate side faces plus genuine body intersections |
| 3 right bridge alignment | Slope .190111; centreline crosses L1 | Six folded intervals; edge slope .278675 | Invalid path/section geometry before final collisions |
| 21 curved | Slope .136578; crosses G1 | No fold; edge slope .186415 | Invalid path; additional endpoint body penetration |
| 21 direct | Slope .057748; departure/arrival signs correct; both full endpoint walking footprints pass; exact centreline has no non-seam crossings of G1/L1 | No fold; edge slope .061511, within 1:12 | First failure in full emitted width/thickness volume, despite valid discrete sections and centreline tests |

Case 21 direct is the control that separates a valid centreline from an invalid body. A zero-width line is not a fully validated corridor: standing clearance, complete swept width, thickness and all scene obstacles still require full validation. Its two end sections produce a large ruled ribbon; nondegenerate faces intersect original material. This is not evidence that triangulation alone is wrong or that original solids may be ignored.

The independent centreline audit uses exact segment/triangle intersections. Coplanar travel along a surface is not classified by that test alone; continuous endpoint support and full emitted-face contact audits supply the relevant evidence. No case is promoted to valid circulation on the basis of a centreline check.

## G–I. Feasibility and source-code findings

Both G1 region 58 and L1 B have useful walking-level space, but the tested connector cross-section fails their lower material boundaries. G1's 2.1 ft width and missing 3 ft stair landing remain restrictions. These conceptual interfaces do not establish ADA accessibility or a continuous accessible network.

Relevant unchanged production locations:

- `transitionGeometry.ts:76`, `transitionPath()`: cubic XY handles use endpoint directions, while Z is interpolated uniformly in parameter t. XY speed becomes small near handles; Z continues climbing, causing local slope spikes even when total run/rise looks sufficient. Exact selected slopes demonstrate the issue.
- `transitionGeometry.ts:95`, `transitionSections()`: endpoint frames follow attachment directions; interior frames blend a global heading interpolation with the path tangent. Width interpolates between ends. Fitting endpoints alone does not validate the intervening swept envelope. Reversals/folds are measurable in cases 1 direct and 3 detour.
- `transitionGeometry.ts:123`, `loftSections()`: unconditionally adds a second layer at `level=-thickness`, default 0.25 ft. There is no original-material/free-volume input. This is the immediate construction assumption responsible for the verified below-floor endpoint intersections.
- `transitionGeometry.ts:138`, `transitionMeshes()`: stairs use `loftSections([a,b,next])`; b and next share plan coordinates but differ in height. Some side triangles are consequently collinear/zero-area. The final tread also remains one riser below B until the terminal section.
- `surfaceAttachment.ts:434`, `sectionMeets()`, and `:453`, `fitLoftContact()`: validate the top centre and top lateral section points and can reduce width. They do not verify room for the extruded underside. They should not be interpreted as a full connector-volume certificate.
- `walkingApproach.ts:56`, `validateWalkingApproach()`, with swept tests around lines 110 and 138–152: validates physical floor coverage and the standing prism above floor+0.05. The original outside throat extends 0.5 ft. Below-floor supporting material is intentionally not a walking-space obstruction; a separate connector-body check is necessary, not weaker floor validation.
- `alternativeRouting.ts:18`, `evaluateQualifiedInteriorRoutes()`, and `:167`, `validateAlternative()`: preserve separate preflight and emitted-geometry gates. A failure reported here is the first gate encountered, not proof that every later property is valid.
- `connectionClearance.ts:29`, `trianglesOf()`, and `:52`, `intersects()`: include emitted degenerate faces and can classify their line segments as triangle intersections. Fourteen such reports were reproduced. All unconfirmed rejected contacts in this audit are asserted to have exactly zero connector area.
- `connectionClearance.ts:124`, `transitionSurfaceClear()`, seam rule at `:153`: correctly rejects the independently confirmed nondegenerate slab and wall crossings. A numerical contact exception cannot legitimately clear those solids.

## J. One recommended next implementation

**Select A: a geometry-aware endpoint cross-section correction, bounded to the immediate departure/arrival body of these same cases.**

Before accepting the first/last connector sections, include their underside and lateral faces in the physical interface fit. Derive the permitted section envelope from original material triangles. Investigate whether a locally shaped/tapered endpoint body can meet the verified top floor while remaining wholly in free space, with the same width, slope, headroom and original geometry. Preserve exact top continuity; never solve the problem by lifting an unattached slab, cutting the OBJ or expanding the allowed collision seam. A taper is a candidate for subsequent validation, not a result established by this audit; minimum structural thickness is unresolved and must not be silently assumed away.

Keep the change limited to existing connection families and the same fixed pairs. Validate the newly emitted geometry afresh against all original forms and existing connectors. Preserve the old ramp/stair meshes byte-for-byte and the revision-sensitive validation/cache behavior. A corrected endpoint that still fails a later wall, slope, landing or width gate must remain rejected.

Why defer the other actions:

- **B, broad loft correction:** genuine folding and slope/frame issues exist, but the nonfolded case 21 direct independently demonstrates the endpoint-body conflict. Do not mix a whole-loft rewrite into the initial correction.
- **C, contact classification:** legitimate top contact already passes. The major rejections are real solid crossings. Degenerate stair faces deserve a separate narrow diagnostic/mesh-validity fix, but removing their reports does not create a valid route.
- **D, new physical interface:** neither opening is proven closed at walking height; first determine whether the existing top can support a physically compatible endpoint body. Do not discard a real walking opening solely because the current extrusion penetrates its slab edge.
- **E, more routing/placement:** moving L1 did not remove the invariant local source slab geometry. Reopening the search before fixing or definitively rejecting the endpoint cross-section assumption would repeat the same failure. Farther route obstructions remain and may require later work after explicit authorization.

No fully validated circulation connection has been achieved, and no successful whole-route result is promised by this recommendation.

## K. Fidelity, tests and remaining uncertainty

Original positions, normals, face topology, scale/proportions and winding are unchanged. All four normalized OBJ hashes match Stage 2B. Session SHA-256 remains `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`. Existing O2–O1 ramp and O2–G1 stair metadata/geometry hash remains `87c9e07b34129d0a370b3f328aab4b721591a868af0a0e05a5e5d534045e2f54`.

The Stage 2B verification replay passed before checkpointing. The seven-case audit reproduces all endpoint collision rejections; all 1,346 nondegenerate rejected pairs have independent intersection witnesses. Exact material-side checks distinguish occupied material from empty space at representative witnesses. Full-width original-triangle prism clipping establishes the local below-floor conflict independently of the chosen route. New diagnostic harness ESLint passes. No production changes require a new application build; the prior unrelated TypeScript/lint limitations remain documented in the preserved checkpoint.

No graph edges, new route families, placement algorithms, tolerances, thresholds, scores, Board Mode or UI components changed. No global search was run. Geometry-revision/cache implementation is untouched. Diagnostics use separate in-memory modules; they do not grant acceptance certificates or alter application behavior.

Remaining uncertainty: no compliant replacement endpoint has been built; a minimum physically acceptable endpoint thickness has not been specified; complete route clearance after such a correction is unproven. The local probes establish geometric constraints, not structural design or accessibility certification. Degenerate stair-face overcounting is identified separately and left unchanged.

Reproduce with `node reports/stage2c-contact-audit/run.cjs`. Review `audit.json` for the exact original/generated triangle coordinates and `contact-witnesses.csv` for interface distances and path stations. All new diagnostic files remain uncommitted. Stop here for authorization before changing production code.
