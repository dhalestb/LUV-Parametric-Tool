# Targeted surface-orientation correction — completion report

L1's reversed winding is corrected in analysis metadata. Its physical slab tops now qualify for attachment discovery; its undersides do not. The requested middle and upper entrances have verified interior approach space, but none of the 192 focused external route alternatives passed every gate. The fixed assembly still has two components and L1 remains isolated.

**A. Recoverable checkpoint and scope**

Reviewed the two tracked Stage 2A changes, the alternative-routing module and harness, and the five Stage 2A reports. They contained the approved bounded routing implementation and diagnostics. Created local checkpoint **`5d3c808fb195190b87223766e4d44571d0844b21`** on `organic-lattice-connections`; verified a clean working tree before beginning this correction. The preceding Phase 1.5 checkpoint is `a0cef60c0baaec6847b37404745a003c5110fd52`.

The correction is left uncommitted for review. No push, deployment, dependency installation, original D: repository modification, full assignment search, or Stage 2B work occurred. The original session is unchanged.

**B. Independently verified cause**

At world XY `(48, 12)` ft, the original L1 triangles intersect a vertical line at:

| Slab | Underside, raw normal +Z | Physical top, raw normal −Z | Thickness |
|---|---:|---:|---:|
| Lower | 0.324762 | 2.198732 | 1.873970 ft |
| Middle | 6.387558 | 8.357695 | 1.970137 ft |
| Upper | 18.513168 | 20.331989 | 1.818821 ft |

L1 has one consistently wound source shell, signed volume approximately −1354.078 ft³, and 70 open boundary edges under the existing 1e−5 ft coordinate-key tolerance. It is not declared watertight. Independent generalized winding measurements immediately below/above the middle top were approximately −0.999189 / +0.000802, and below/above the upper top −0.999656 / +0.000338. Those measurements distinguish material below from free space above despite the reversed faces.

The former headroom probes started at slab undersides and traversed material. The two-sided collision/headroom intersection test was not the root cause. It remains unchanged.

**C. Implementation and source references**

| File / functions | Change |
|---|---|
| [surfaceOrientation.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceOrientation.ts:14), `surfaceOrientation`, `build`, `sourceMaterialAtPoint` | New shared metadata: coordinate-edge components, topology uncertainty, bounded material-side winding witnesses, spatial vertical material columns, physical normal Z, and edge-connected support regions. Cached by exact position/topology revision. |
| [analyze.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/analyze.ts:210), `rasterize`, `analyzeMesh` | Construct the anchored source surface once and use its physical orientation for floor rasterization. Horizontal/vertical area formulas, units and root transformations are unchanged. |
| [connectionPorts.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/connectionPorts.ts:93), `extractSourceEdgePorts` | Source-edge eligibility uses the same metadata. Reverse only temporary analysis edge records when needed to obtain the correct outward direction; never reverse original faces. |
| [surfaceAttachment.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/surfaceAttachment.ts:149), `buildIndex`, `classify` | Attachment discovery and surface-gap classification use physical normal Z. Ambiguous support is `uncertain`, not a walkable floor or an allowed wall fallback. |
| [organicConnections.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/organicConnections.ts:165), `detectFeatures` | Consume the corrected raster/port proposals; invalidate feature records when source revision, floor/port proposals, cell size or orientation changes. |
| [walkingApproach.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/walkingApproach.ts:42), `validateWalkingApproach`, `checkApproach`, `placedFaces` | New opt-in continuous support/clearance checker for existing source floors. No approach slab is generated. |
| [alternativeRouting.ts](C:/Users/DHale/Documents/Codex/Cursor-APP/src/components/lattice/alternativeRouting.ts:16), `evaluateAlternativeRoutes`, `validateAlternative` | Accept explicitly focused diagnostic anchors within the existing budget; retain all route families and checks; additionally require continuous source-floor approaches after the existing support probes. |
| [l1-surface-orientation.cjs](C:/Users/DHale/Documents/Codex/Cursor-APP/scripts/l1-surface-orientation.cjs:1) | Original four-OBJ fixture, checkpoint comparison, focused routes, entrance checks, cache regressions, fidelity and timing. |

The orientation decision is per component, not an unconditional flip. Non-solid sheets, ambiguous material sides, and nested/coincident components without material semantics are withheld. Imperfect shells require local material/free-space evidence. These are conservative geometric interpretations, not a repair or a watertightness certificate.

The existing source triangle/BVH collision code, emitted connector validation, slope classification, contact tolerances, and confirmed graph insertion were inspected and preserved. No descriptor-scoring, placement-search, Board Mode, typology or presentation code changed. Geometry-derived floor/passage inputs can change as an intended consequence of correcting their interpretation; identical descriptor values are not claimed.

**D. Before-and-after eligibility**

At all six representative slab elevations, the regression proves that L1's former `floor`/`underside` interpretation is reversed correctly. The physical tops are eligible and their corresponding undersides are rejected.

At the existing attachment discovery threshold, physical normal Z ≥ 0.7:

| Source | Previously raw-up candidates | Now physical-up candidates | Previously raw-up triangles withheld as uncertain |
|---|---:|---:|---:|
| O2 | 4,849 | 4,838 | 11; 1.249 ft² |
| O1 | 858 | 811 | 47; 2.901 ft² |
| G1 | 12,039 | 11,820 | 219; 21.680 ft² |
| L1 | 9,264 | 9,075 | 0; former raw-up faces become undersides |

O1/O2/G1 retain their outward component orientation. Their known valid ramp/stair contact regions and complete emitted connector geometry remain identical to the checkpoint. **Exact parity of every prior raw-up triangle is not claimed:** local defective/ambiguous material columns now withhold the areas above. The tests do not establish that those withheld areas are physically unusable. This conservative behavior is an explicit remaining qualification to broad non-L1 eligibility parity.

Eligibility is only a candidate gate. A normal Z threshold of 0.7 does not establish an acceptable ramp grade, clear landing or circulation connection.

**E. Entrance and approach results**

Exact test entrances, in world feet:

- A: `(35.844339, 12, 8.357695)`, inward +X.
- B: `(40, 10.283156, 8.357695)`, inward +Y.
- C: `(35.844339, 12, 20.331989)`, inward +X.

| Entrance | 2.1 ft usable width; depths 2 / 4 / 6 ft | 3 ft usable width; depths 2 / 4 / 6 ft | Headroom |
|---|---|---|---|
| A, middle west | Pass / Pass / Pass | Pass / Pass / **Fail** | 10.155474 ft on passing corridors |
| B, middle south | Pass / Pass / Pass | Pass / Pass / Pass | 10.155474 ft |
| C, upper west | Pass / Pass / Pass | Pass / Pass / **Fail** | No overhead source/connector obstruction in the tested scene |

The two 3 × 6 ft failures are actual local triangle slopes: A reaches approximately 0.428 longitudinal / 0.490 cross slope; C approximately 0.107 / 0.319. They fail the unchanged 1:12 longitudinal and 1:48 cross-slope limits. Earlier finite probes missed these local conditions. Passing listed corridors are flat.

The same west entrance on the lower physical floor fails: overhead clearance is **4.188825 ft**, below the existing 6.5 ft requirement. Correcting winding does not remove this real obstruction.

The approach checker clips original support triangles against the entire corridor rectangle, verifies coverage and absence of overlapping projections, requires one edge-connected region, and evaluates each contributing triangle's slope. It clips every relevant obstruction triangle against the piecewise floor-relative headroom prism, using the existing 0.05 ft probe offset and 6.5 ft height. A material-enclosure guard supplements surface crossings. It includes all four placed OBJ meshes and the existing connectors, plus a half-foot-deep opening volume outside the attachment edge. A narrow test obstruction between the former half-foot samples is rejected. This is not a point-grid clearance claim.

These are actual floor boundaries, not lattice faces. L1 occupies the lattice bay centered at `(40,20)` with nominal XY limits 30–50 / 10–30 ft; its middle west floor edge is at X≈35.844, well inside that bay. The source mesh and its voids determine support. The verified approach travels inward over existing floor and emits no overlapping slab. The half-foot opening check does not certify the entire external route; that has its own validation.

**F. Bounded O1–L1 and G1–L1 tests**

Original fixed placements: O2 `(0,0,0), variant 0`; O1 `(1,0,0), variant 2`; G1 `(1,1,0), variant 0`; L1 `(2,1,0), variant 3`. No lift; unchanged 4 × 4 × 1 configuration.

Each relationship uses 12 source/target pairs × the existing 8 route families = **96 alternatives**, targeting all A/B/C entrances. Source enumeration is capped at 128 anchors. Total: **192 unique alternatives**, repeated for cache parity, not 10,888 alternatives or a placement search.

All 24 selected pair interfaces pass the existing surface-contact check. Each requested target entrance has a valid 2.1 ft approach. This does not establish the corresponding source approach or external connector.

| First failure | O1–L1 | G1–L1 |
|---|---:|---:|
| Folded/reversed section | 28 | 35 |
| Individual ramp segment slope | 17 | 5 |
| Stair cross slope | 12 | 0 |
| Stair landing support | 7 | 31 |
| Walking approach support | 4 | 6 |
| Continuous source approach local slope | 0 | 4 |
| Switchback landing length | 10 | 6 |
| Stair tread | 5 | 5 |
| Self-intersecting ribbon | 2 | 4 |
| Outside fixed lattice footprint | 4 | 0 |
| Source triangle collision | 7 | 0 |
| **Accepted** | **0** | **0** |

For example, an O1 route from `(19.707207,8.663132,20)` to C passes the earlier gates but collides with **void workspace.obj**, the source form. The output records exact endpoints, variants, route family and first rejection. Gates after a rejection are not presumed to pass. Failure of this bounded selection does not prove that all placements/routes are impossible.

Object-level graph: unchanged two components, L1 isolated. No additional circulation edge is inserted.

**G. Internal walking-region continuity**

A and B belong to support region 21. Their passing 2.1 ft wide A/6 ft and B/4 ft corridors overlap by a 2.1 × 2.1 ft area, establishing continuous supported, clear circulation between these two middle-floor entrances in this geometric test.

C belongs to a separate upper region (31). There is no verified internal stair/ramp between that upper region and the middle floor, nor proof of whole-form internal accessibility. The 34 edge-connected support patches reported for L1 are not 34 accessible floors and are not automatically connected graph nodes. No accessibility/code-compliance claim is made.

**H. Original geometry fidelity**

Session SHA-256, unchanged:
`6172019acf6d7cd88a4af2dca1ff570cd8e751a10fabc39da4efd65b12bc920b`

SHA-256 over normalized original positions, normals and faces, equal before analysis, after all tests, and against checkpoint results:

| Source | SHA-256 |
|---|---|
| O2 | `6c61b56e61cb0c3a8c200a0d19713170eab61d313be9883a9b6085f88089f3af` |
| O1 | `0050467218bcf92c83da4b736ddaba4b4db52f66b13438df6492b29017dae25e` |
| G1 | `780b13781015d7dba2ac35824229edb6972569eaccc7a2dea0e41df54663d460` |
| L1 | `419ebffbc55238b96ed0f0fea8401c9b6d13115887b992dd7c7b69688bb807a2` |

All **47,921 original vertices** were checked against the independent rendered root matrix. Maximum error was 6.744e−7 ft (G1); L1 maximum was 2.385e−7 ft. No source geometry, normals, faces, unit scale or placement transform was altered.

**I. Verification**

- `node scripts/l1-surface-orientation.cjs --baseline`: PASS; source loaded read-only from the checkpoint with `git show`, without switching the working tree.
- `node scripts/l1-surface-orientation.cjs`: PASS; cold/warm output parity, original connector geometry parity, physical slab classification, continuous approaches, thin-obstruction rejection, internal A/B corridor overlap, revision invalidation and fidelity.
- All **54** former G1–L1 suppressed candidates were replayed using the checkpoint ports: now **44 surface-attachment / 10 collision** rejections, **zero network-redundant** rejections. These changed geometric reasons are expected after removing underside eligibility.
- `node scripts/connection-attachment-check.cjs`: PASS; original ramp and stair remain valid; L1 remains isolated.
- Targeted ESLint on all seven changed/new application modules: PASS.
- ESLint on the CommonJS diagnostic harness: PASS, with only the ES-import requirement disabled for that CommonJS file via the command-line rule override.
- `npx tsc --noEmit --incremental false`: six existing errors only: five TS5097 `.ts` import-path errors in descriptor tests, plus the existing TS2352 `faces: {}` fixture in `descriptorCache.test.ts`. No new errors in this correction.
- Final `npm run build`: PASS. The initial sandbox run failed on Windows SWC path canonicalization/access; the authorized outside-sandbox build succeeded. Existing unused-variable/hook warnings remain in unrelated files.
- `git diff --check`: PASS.

Cache tests cover in-place vertices, triangle topology, cloned winding reversal, placement/lift/rotation/mirror, changed emitted path coordinates, changed obstruction geometry and source revision. An unsupported open sheet remains uncertain. Existing headroom rejection remains active.

The old assignment-quality harness invokes assignment search and uses synthetic open-sheet fixtures; it was not run as a replacement for the requested original-OBJ tests. Full historical raw candidate parity is intentionally superseded by physical-floor eligibility; no prior test artifact was overwritten.

**J. Performance**

Node v24.21.0, same four source OBJs and fixed placements. Each baseline/corrected process runs one cold evaluation and three warm evaluations. The evaluation timer starts after source analysis; import classification is reported separately. Wall-clock measurements are machine-sensitive, not a statistically established speedup claim.

| Measurement | Stage 2A checkpoint | Corrected |
|---|---:|---:|
| All four `analyzeMesh` calls, including classification | 0.352 s | 2.074 s |
| Fixed-placement cold evaluation | 4.319 s | 2.837 s |
| Warm evaluation median (3 runs) | 0.159 s | 0.065 s |
| Warm evaluation range | 0.156–0.193 s | 0.064–0.277 s |

Physical-orientation index construction takes approximately O2 **299 ms**, O1 **92 ms**, G1 **675 ms**, L1 **404 ms**: **1.470 s total**, once per exact geometry revision. Outside a shared validation scope, cached lookups including content comparison measured **0.36–1.76 ms** per source. Bounded witnesses and spatial columns avoid unrestricted per-placement all-to-all triangle analysis.

The 18 unique continuous approach tests took **45–403 ms each**, including fast slope rejections. A repeated A/4 ft approach took **5.86 ms**, including scene-revision checks. These new continuous-volume checks run only in the opt-in Stage 2A path, not every ordinary placement candidate. Transformed triangles and complete approach results are cached; keys include source and obstacle revisions, placements, rotations/mirrors, corridor dimensions/direction, and landing mode. No external connector validation is inferred from an approach cache.

| Focused route batch | First pass | Repeated pass |
|---|---:|---:|
| O1–L1, 96 routes | 439 ms | 19 ms |
| G1–L1, 96 routes | 180 ms | 60 ms |

These route passes occur after fixed-assembly and entrance validation, so some source indexes are already warm. They are not wholly cold application-start measurements. Original Phase 1.5 collision/contact caches and emitted-geometry signatures remain active. Startup classification is a real added cost; unique continuous corridor queries still cost substantially more than cache hits.

**K. Stage 2B recommendation and limits**

The reversed-surface defect is corrected and there is now a tested foundation for using actual L1 entrances. A/B on the middle floor are the strongest initial targets: connected local approaches and about 10.16 ft headroom. C has clear local space but no verified link down to the middle floor, and its source elevation exceeds the nominal 20 ft cell height; no clipping or height-policy change was made.

Do not launch broad Stage 2B optimization yet. First review the conservative non-L1 eligibility differences and decide how internal walking regions will constrain a circulation-success claim. A next, separately authorized bounded placement study could target A/B while preserving all source approach, landing, emitted-geometry and internal-region gates. Source-side landing limitations and route folding/stair geometry remain unresolved; this correction does not promise that moving forms alone will solve them.

Full data: [checkpoint baseline](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/surface-orientation/baseline.json) and [corrected results](C:/Users/DHale/Documents/Codex/Cursor-APP/reports/surface-orientation/corrected.json).

Stopped after this correction. Stage 2B requires authorization.
