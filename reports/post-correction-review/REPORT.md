# Post-correction validation and Stage 2B readiness

**Decision: A — improve the narrowly identified surface-classification errors before connector or placement expansion.** This is a correctness prerequisite, not a prediction that restoring the excluded triangles will connect L1. No source files or original OBJ data were changed during this review.

**Checkpoint and verification**

Reviewed all five modified application files, the two new geometry modules, the deterministic harness, and the three correction reports. They matched the authorized correction. Re-executed the original harness in memory with its report-writing call disabled, preserving the saved baseline and corrected results. All original-OBJ assertions passed again: existing connector parity, all 54 previously suppressed candidates evaluated, corrected L1 tops/undersides, approach/collision/cache checks, all-vertex transforms and original geometry hashes.

Created local checkpoint **`26657ffd752bfce309799155e00a8e9d4c01184d`**, on `organic-lattice-connections`, and verified a clean working tree immediately afterward. The only subsequent additions are this review's report artifacts. No push, deployment, dependency installation, D: repository change, placement search, threshold change or Board Mode change occurred.

**1. Status of the 277 excluded triangles**

All 277 exclusions occur after their source components have an outward orientation sign of +1. None results from an unconditional normal reversal. The relevant decision is the local vertical-column gate in [surfaceOrientation.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceOrientation.ts:141).

| OBJ | Excluded triangles | Area | Triangles with independent local physical-top evidence | Gentle physical-top candidates | Gentle candidates also having ≥6.5 ft point headroom |
|---|---:|---:|---:|---:|---:|
| O2 — undulating workspace.obj | 11 | 1.249 ft² | 10 | 0 | 0 |
| O1 — void workspace.obj | 47 | 2.901 ft² | 2 | 2 | 1 |
| G1 — Gathering, Linear.obj | 219 | 21.680 ft² | 48 | 3 | 0 |
| **Total** | **277** | **25.830 ft²** | **60** | **5** | **1** |

Method: evaluate the original triangles at their centroids using independent generalized winding values 0.005 and 0.02 ft along both sides of the triangle normal. A local physical-top witness requires material below (winding within 0.1 of +1) and free space above (within 0.1 of zero) at both offsets. These witnesses identify classifier disagreements; they do **not** certify an entire floor, landing or corridor. The remaining 217 triangles lack this two-offset evidence and must remain unresolved rather than automatically restored. A slope magnitude ≤1:12 was only a generous screen; it does not establish longitudinal/cross-slope accessibility.

Affected regions, using current metadata IDs:

- **O2:** three excluded clusters adjacent to regions 7, 14 and 16. The main nine-triangle cluster is at world X 5.504–6.628, Y −0.142–1.210, Z 4.385–4.531 ft, adjacent to region 7. It has physical-top evidence but is too steep for the current gentle-floor screen. Two additional triangles have approximately 1e−6 ft² area each.
- **O1:** four clusters. One large 38-triangle upper cluster spans X 19.707–22.129, Y 5.553–7.419, Z 17.495–17.987 ft and has no adjacent currently accepted region. Other clusters are six bottom faces near Z≈0, two tiny faces adjacent to region 20 at Z 15.349, and triangle 1071 adjacent to region 3 at Z 2.248.
- **G1:** 73 exclusions in each of its three source components, in corresponding rotated/elevated patches. They include adjacent regions 5/64/123, 47/106/165, and other small neighboring support patches. The largest three corresponding clusters lie around Z 4.197–4.479, 10.864–11.145 and 17.530–17.812 ft. Full cluster bounds, triangle IDs and neighboring region IDs are recorded in the data artifact below. An excluded triangle itself has region −1, so adjacent IDs are not claims that it has already been restored to that region.

Two distinct causes are established:

1. **Vertical crossing counts disagree with local material evidence.** 261 triangles fail the signed crossing-count test without a coincident-hit conflict. The input meshes contain inconsistent/overlapping geometry; component-wide orientation alone does not make every signed vertical crossing a reliable occupancy count. O1 triangle **1071** is a concrete false exclusion: the column reports material counts **2 above / 3 below**, while local winding is approximately **0.001041 above / 1.001038 below**. Three additional barycentric interior samples agree. It is a flat original floor triangle, shares edges with accepted floor triangles 1072 and 1073 in region 3, and has approximately **15.622 ft** point headroom. Its area is only **0.023468 ft²**, with a bounding footprint approximately 0.605 × 0.123 ft.
2. **An unrelated column conflict invalidates a sound local interface.** Sixteen excluded triangles have opposite-sign coincident hits; thirteen G1 triangles have the expected local counts (0 above / 1 below) and fail solely because `balanced` is cleared elsewhere on the column. For G1 triangle **10823**, the conflict is **3.465 ft below** the candidate. Local winding is approximately **0.02504 above / 1.02513 below**, with three additional samples agreeing. Corresponding triangles 24655 and 38487 behave similarly. However, their actual point headroom is only **0.538 ft**: restoring their physical-top interpretation must not make them circulation-eligible.

**Attachment impact:** legitimate surface area is being withheld, but no complete useful lost attachment window has been established. Triangle 1071 is much smaller than a 2 ft interface. Among the selected 24 source corridors, only two excluded O1 triangles, 3509/3741, overlap a tested corridor near its floor elevation. They lack the independent physical-top evidence and contribute only 0.010826 ft² against a roughly 1.91 ft² coverage shortfall. None of the 60 locally supported candidates overlaps those selected source approach footprints within the 0.5 ft elevation screening band. Thus the 277 exclusions do not explain away the tested routes' source approach failures.

Evidence: [all 277 triangles and clusters](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/post-correction-review/ambiguous-triangles.json).

**2. Complete first-failure breakdown for the 192 alternatives**

These are the saved 12 attachment pairs × 8 existing route families for each relationship, replayed by the regression. O2–L1 was **not evaluated in this corrected 192-route batch**. Older Stage 2A O2 data uses the former classification and is not a corrected comparison.

| First failure | O1–L1 | G1–L1 | Total | Interpretation |
|---|---:|---:|---:|---|
| Folded/reversed section | 28 | 35 | 63 | Loft/route construction |
| Individual ramp segment slope | 17 | 5 | 22 | Generated walking geometry |
| Stair cross slope | 12 | 0 | 12 | Generated tread/profile geometry |
| Switchback landing length | 10 | 6 | 16 | Construction/landing geometry |
| Stair tread | 5 | 5 | 10 | Generated tread geometry |
| Self-intersecting ribbon | 2 | 4 | 6 | Loft/route construction |
| Stair landing support | 7 | 31 | 38 | Original source approach support |
| Walking approach support | 4 | 6 | 10 | Original source approach support |
| Continuous approach local slope | 0 | 4 | 4 | Original source walking surface |
| Outside fixed lattice footprint | 4 | 0 | 4 | Generated route versus placement envelope |
| Source triangle collision | 7 | 0 | 7 | Actual emitted connector versus O1 mesh |
| **Total rejected** | **96** | **96** | **192** | |
| **Accepted** | **0** | **0** | **0** | |

Invalid source attachment, invalid destination attachment, insufficient emitted usable width, and headroom each have **zero recorded first failures**. This does not mean every rejected candidate passed those later checks. All 192 passed the initial surface-interface check; source/destination interface contact is different from approach support.

All **52 recorded approach failures are on the source OBJ**, not on L1. Support failures can involve insufficient depth/width, a void or disconnected support patch, or changing elevation; they should not all be relabeled “width” without a separate geometric check. The source local-slope failures are G1's C-target source, with longitudinal/cross slopes approximately 0.316 / 0.283. L1's independently verified destination approaches do not cure those source problems.

**First-failure counts hide additional limitations.** This review independently evaluated continuous source approaches for all 24 pairs:

- O1: **3/12** pass the 2.1 × 2 ft walking/ramp approach; **0/12** pass the existing 2.1 × 3 ft stair-landing test.
- G1: **0/12** pass either test.
- Of the 21 failed walking/ramp approaches, **19 fail complete coverage** and **2 fail local slope**.
- The three passing sources all target upper entrance C, not A or B. Their 24 alternatives include seven collision first failures, three ramp-slope first failures, eight folded-section first failures, and six short-landing first failures. Independent unchanged collision/headroom validation rejects **all 24 for source triangle collision**, including those previously stopped at construction gates.

Therefore **129 alternatives pass attachment and first fail a construction check**, but **zero are demonstrated to fail only construction while satisfying all independent source approach and clearance requirements**. Do not equate the first statistic with 129 otherwise feasible connections.

Evidence: [independent source approaches and entrance checks](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/post-correction-review/route-audit.json), [excluded-face overlap and later collision audit](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/post-correction-review/cause-audit.json).

**3. Preferred verified L1 entrance: B, middle south**

Using the exact original coordinates and fixed placements:

| Entrance | Verified geometric approach | Additional limits from this review |
|---|---|---|
| A `(35.844339,12,8.357695)` | 2.1 ft wide through 6 ft; **3 ft wide through 5 ft** | 3 × 6 ft fails slope; 3.5/4/5 ft wide × 5 ft rectangles fail full floor coverage at this center |
| B `(40,10.283156,8.357695)` | 2.1 ft wide through 6 ft; **3 ft wide through 6 ft** | 3.5/4/5 ft wide × 5 ft rectangles fail local slope at this center |

Both passing 3 × 5 ft approaches are flat, on the original middle slab, have **10.155474 ft** overhead clearance, and pass the existing continuous floor, opening and scene-obstruction tests. B offers more verified depth at the useful 3 ft width. The 2.1 ft A/B corridors still establish narrow internal continuity, not accessible turning clearance. No 5 × 5 ft turning landing was verified at either exact entrance.

The approach lies inside actual OBJ floor boundaries, independent of the 20 ft lattice cell face. No cut, remesh, overlapping floor slab or source movement is needed for these interior patches. **No continuous external connector from A or B to the other forms is presently demonstrated.** This is a lack of proof in the bounded fixed-placement fixture, not proof that no geometric solution exists.

Flat interior approach/landing distance contributes **zero climbing run**. It cannot reduce the slope of an external ramp with unchanged endpoint elevations. Sloped run, intermediate flat landings and existing interior floor traversal must be budgeted separately.

**4. Is connector construction the limiting factor?**

It is one material limitation, but is not established as the sole limiter. Relevant existing behavior:

- [transitionGeometry.ts, `transitionPath`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/transitionGeometry.ts:76): XY follows a cubic curve while height varies linearly with parameter. Local speed variation can create steep short segments despite a mild average slope.
- [transitionGeometry.ts, `transitionSections`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/transitionGeometry.ts:95): endpoint orientation blending can disagree with local travel on bends, producing reversed/folded sections.
- [transitionGeometry.ts, `transitionMeshes`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/transitionGeometry.ts:138): stairs are divided by sample index rather than walking-edge arc length; interpolated cross-section slopes can carry into treads. The unchanged validator correctly catches short/non-horizontal treads and cross-slope failures.
- [portConnectionValidation.ts, `buildSwitchback` / `switchbackRampPath`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/portConnectionValidation.ts:101): the landing is bounded to 2–4 ft; the extension criterion counts the entire plan path including the flat landing. That is not equivalent to providing sufficient sloped climbing run. Some generated landings also fail the current minimum even before any architectural accessibility assessment.

These warrant later construction work, but source approach geometry and real source collisions must remain independent prerequisites. Moving placements cannot repair an intrinsically inadequate source landing either; it can only change which interfaces/routes become candidates.

**5. Architectural width and accessibility remain unresolved**

The batch used **2.1 ft = 25.2 in** anchors and an application minimum of 2 ft. This is narrow conceptual circulation, not an accessible-route designation. As a US ADA reference, general walking/ramp clear width is 36 in, ramp landing length is 60 in, and changing-direction ramp landings require 60 × 60 in; handrails must not reduce required clear width. A bare 3 ft source strip therefore needs further detail verification. [US Access Board, Chapter 4](https://www.access-board.gov/ada/chapter/ch04/)

The application's 6.5 ft headroom gate is **78 in**. It is not the general 80 in vertical-clearance requirement in the same reference standard. A/B's measured clearance exceeds both, but passing this application's gate elsewhere is not an accessibility certification. [US Access Board, Chapter 3, §307.4](https://www.access-board.gov/ada/chapter/ch03/#3074-vertical-clearance)

Project jurisdiction, occupancy/egress requirements, clear width after rails, turning space and stair/accessible-route policy are not established by this fixture. No standards threshold was changed during the review. No claim is made that stairs constitute an accessible route.

**6. One primary next implementation: A**

Authorize a **targeted material-interpretation correction for proven false exclusions**, not blanket reinstatement of the 277 triangles:

1. In [surfaceOrientation.ts, `build`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceOrientation.ts:39), distinguish local interface ambiguity from remote crossing defects. Opposite coincident hits below a sound interface must not automatically override independent local material/free-space evidence. Keep unresolved coincident/self-intersecting geometry uncertain.
2. Extend the evidence behind [`sourceMaterialAtPoint`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceOrientation.ts:22) for a bounded, revision-cached fallback on disputed regions. Require consistent spatial/local support evidence; a single favorable centroid must not authorize a full triangle or corridor. Preserve L1's verified inward-shell correction and original faces.
3. Keep [`surfaceAttachment.buildIndex`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceAttachment.ts:149), [`analyze.rasterize`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/analyze.ts:210), and [`connectionPorts.extractSourceEdgePorts`](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/connectionPorts.ts:93) on that same metadata. Rebuild support-region adjacency only from justified interfaces.
4. In the existing original-OBJ regression harness, add O1 face 1071 and G1's remote-conflict cases as classification tests. Separately retain G1 low-headroom rejection, slopes, continuous corridor coverage, emitted geometry collision, the 54-candidate regression, revision invalidation and source hashes. Measure source-analysis cost independently of placement evaluation.

Why A before B: there is a reproducible classification inconsistency that can be corrected without assuming a new route is feasible. This review did **not** find an otherwise fully valid A/B route failing only construction. Why A before C: an optimizer should not rank placements against known inconsistent support metadata, and no rigid-placement change resolves the source-floor coverage defects by itself. Restoring the small proven areas is **not expected by itself** to make any of these 192 alternatives pass.

**7. Stage 2B readiness**

**Not yet justified as the immediate next implementation.** Preserve the checkpoint, correct the bounded classification inconsistency first, then reassess source-interface eligibility and construction feasibility using B as the preferred middle-floor destination. Keep object-level connectivity distinct from internal walking-region connectivity; no validated upper-to-middle L1 route exists. No broad placement impossibility conclusion can be drawn from this sample.

Session SHA-256 remains `6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`. Original geometry hashes were reconfirmed by the unchanged regression harness. Tracked application and test source files remain identical to checkpoint `26657ffd752bfce309799155e00a8e9d4c01184d`.

Review complete. Await authorization before implementation.
