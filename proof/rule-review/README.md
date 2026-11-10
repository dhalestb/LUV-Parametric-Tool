# Rule-governed abstract Stepped Amphitheater proof

Status: corrected 60 × 40 × 40 ft architectural proof, ready for architectural review. Full Rule 1A/1B compliance and general deployment are not claimed. Branch: codex/gathering-amphitheater-proof. Parent checkpoint: d87c068. Production checkpoint 12197f7 is untouched. No production generator, other typology, previous proof script, or original validation script was changed.

Open the corrected gallery at http://127.0.0.1:4178/rule-review/index.html. This is a local review site, not a deployed production update. The existing /controls interface remains the historical field experiment; it has not been silently switched to this new algorithm. Generate this corrected proof with rule-amphitheater.cjs as described below.

## Architectural process and comparison

The authoritative Gathering Letter Rules.docx supplies the architectural relationships. The new generator establishes a front gathering/presentation focus, then ascending staggered L boundaries, U enclosure supports addressing that focus, and V-related inter-terrace directions. Only then does it construct shared surfaces. This replaces d87c068's perimeter path, sine elevations, cyclic yaw preferences, default twelve sources, equal triplets, nine-source minimum, and three principal masses.

The geometry remains abstract: L inner edges and perpendiculars define terrace rails and enclosure projections; sampled actual U inner curves, tangents and concavity shape terrace/focus boundaries and enclosure trajectories; V apex and arms supply angular transition and folded upper-boundary relationships. Shared lofted/ruled triangles are thickened as valid prisms and joined by Boolean union. The finished architecture does not contain extrusions of complete letter silhouettes. Complete source letters are reference objects in A/B only.

U poses are selected from permitted heading-relative angles by mouth-to-focus alignment. Their actual curve deviation is projected from the source mouth/side frame into the L-derived architectural frame and weighted by alignment. V poses address the ascending L-to-L relationship, subject to containment and permitted angles. Their arms define fold directions; this establishes a circulation relationship, not a constructed usable stair or ramp.

The principal opening is defined jointly by the U-shaped presentation boundary, L span, and rear terrace boundary. Its lower surface rises above the ascending terrace zone. It is not an unrelated rectangular hole through a standard shell. The presentation surface and first terrace share a constructed threshold. Curved and angular side enclosures address the focus, with projecting boundaries and recessed pockets. C visibly contains ascending horizontal surfaces rather than only a gateway.

## First proof measurements

All coordinates and OBJ units are feet. X is width, Y is plan depth, Z is vertical; selected envelope is [-30,30] × [-20,20] × [0,40]. Source registration remains 20 × 20 × 20 separately. There is no final nonuniform scaling.

|Measurement|Result|
|---|---|
|Requested/generated/placed/displayed/construction sources|auto / 28 / 28 / 28 / 28|
|Roles|12 L, 5 U, 11 V|
|Original source identities|six recorded Composition objects; repeated instances retain sourceIndex and original shape proportions|
|Preferred nominal footprint|11 ft; per-object actual world extents are in source-contribution.json|
|Retained surface influence demonstrated|28 of 28 controlled perturbations|
|Named construction components|34: 12 terraces, 11 risers, 9 enclosing regions, presentation surface, threshold|
|Architecture bounds X|−26.218451 to 26.221140 ft|
|Architecture bounds Y|−19.413120 to 17.740660 ft|
|Architecture bounds Z|0.750050 to 39.227200 ft|
|Architecture spans X/Y/Z|52.439590 / 37.153780 / 38.477150 ft|
|Final solid volume|5238.176689 ft³|
|Presentation focus W/D|21.641304 / 8.728261 ft|
|Logical terrace elevations|1.673913 through 20.086957 ft, 12 ascending relationships|
|Source L-anchor horizontal stagger|2.75 ft = 25% of representative nominal width|
|Actual curved-front midpoint displacements|2.746521–2.752933 ft|
|Minor rise / slab thickness|1.673913 / 0.585870 ft|
|Major-level planning spacing|12 ft, independently retained in validated 12–15 ft range|
|Protected negative volumes|one primary gathering volume plus nine recesses|
|Nominal recess depth|25% of each actual local plan bay depth, within original 15–35% range|
|Recess cut depth / pocket height|0.945257–2.447684 / 3.915747–4.800543 ft|
|Backing material probes|9 of 9 inside final retained solid|

The logical elevations identify source boundary planes, not finished top-of-slab elevations. Pocket dimensions do not establish occupiable alcoves. Independent Width/Depth/Height 20/40/60 validation and existing 9/11/13-foot sizing presets are retained through unchanged field-config.cjs and architecturalLetterSizing.ts. An explicit preferredFeet overrides the sizing preset without altering the field. majorLevelSpacing never sets every minor step. Optional yaw overrides remain disabled unless explicitly enabled and may be scoped by height/instance. Default relative yaw choices remain 0/15/30/45/90; tilts remain 0 for L/U and 90 for V. This fixture uses L-relative 90, U-relative 15/30/45, and V-relative 0/45/90 degrees.

## Population and source influence

Population is chosen by geometric tasks. Available plan depth after reserving the U/L-derived focus and transformed-source margins determines possible terraces. Available height after reserving actual upright V height and U depth provides an independent vertical limit. The smaller limit determines L boundaries; adjoining terrace relationships determine V demand. U demand is the ceiling of the spatial enclosure-support trajectory length divided by measured actual U inner-arc length (19.238709 ft here). At 40 ft height, the plan admits 12 terraces, height admits 17, and the support trajectory is 92.410929 ft: 12 L + 5 U + 11 V = 28.

Representative margins, 25% stagger, curvature blending weights and source-stroke minor rise are disclosed proof parameters. They implement relationships permitted by the original rules; they are not universal architectural requirements. The minimum explicit target of four follows this implementation's two ascending L boundaries plus one U and one V task. There is no arbitrary maximum. Explicit preferences allocate task deficits rather than equal triplets; additional U supports remain subject to containment and active-operand checks. Infeasible or unused placements throw a conflict instead of being silently discarded. A scalar density preference is not yet implemented.

At the same 60 × 40 plan and fixed 11 ft nominal size, heights 20/40/60 construct 13/28/29 sources (5L/4U/4V, 12L/5U/11V, 12L/6U/11V). Height therefore changes source capacity and enclosure organization even after plan capacity becomes limiting. Explicit targets 5/7/13/31 construct exactly those quantities with unequal roles. These seven construction experiments are not full architectural acceptance tests. The 20 ft case has a detached 0.000095697 ft³ fragment and is NOT approved. The 60 ft and explicit-target cases still require exhaustive triangle/architectural validation. See capacity-summary.json for unfiltered results (also ../rule-capacity-checks/summary.json in the worktree).

Every baseline instance is independently colored and labeled in A and has its own OBJ object in source-instances.obj. B overlays that same population; C excludes all source solids. The original six objects remain recorded verbatim in dimensionInputs. The fixture is a recorded Composition selection, not a new live Composition integration.

Construction references and final influence are separate evidence. Each of 28 experiments moves one actual source pivot +0.05 ft in Z, regenerates all geometry, then measures full bidirectional vertex-to-triangle distances against the baseline final and raw meshes. All 28 exceed the 0.0005 ft diagnostic significance threshold on the retained final boundary. All perturbed solids have NoError, one positive shell and zero outside volume. No instance is supported only by a reference tag or solely by subsequently removed material. The complete results summary is included as influence-results.json; per-instance requests, meshes, manifests and volume changes are preserved in ../rule-influence/ in the worktree. All 11 V controls affect the final surface.

Observed maximum boundary changes range 0.010725–0.561376 ft. Some changes exceed the pivot movement because regenerated intersections and local topological transitions change which boundaries survive (notably L-4, L-9, U-1 and U-2). This experiment demonstrates influence, not smooth parameter response or a certified sensitivity bound. The perturbed variants did not each receive the full exported triangle/architectural check.

## Geometry validation and numerical construction

The final exported OBJ reimports as NoError, one material shell, no negative cavity shell, no detached material, zero selected-envelope outside volume and zero source outside volume. All 34 named component exports and all 10 tool exports reimport successfully with positive volume. Independent reconstruction from original letter geometry verifies all 28 transformed source bounds within 0.00003 ft of the exported-source bounds; OBJ object IDs exactly match the instance list. All 11 riser components intersect both neighboring terrace solids. All nominal negative tools remove positive raw construction volume and have zero obstruction in the final solid. Actual selected-box clipping removes zero volume in this first proof.

Recess provenance identifies the exact owning profile, its contributing L/U/V objects, local bay depth and geometric normal. Recesses are cut along the actual wall-thickening normal. The rear recess occupies a surviving side bay outside the protected central opening. The opening contributors list only actual front/rear/focus boundary sources. The A/B reference letters overlap the protected gathering tool by 31.965687 ft³; the architectural solid does not. Source-reference clearance is therefore not claimed.

Thickening a varying-normal skin caused actual crossings during implementation. The corrected construction unions closed triangular prisms with a consistent cell-normal sweep. Two sealed raw-construction seam voids (0.001119780 ft³ and approximately 6e−26 ft³) are recorded and closed by retaining positive raw material boundaries BEFORE any protected negative construction. This local solid blending does not fill the subsequent architectural opening or recesses. Their clearance is tested afterwards. All positive raw material shells are retained; fragments are never discarded to pass connectivity.

Nominal opening tools are enlarged geometrically by a 0.0001 ft Minkowski clearance before subtraction; effective-cutters.obj exports those actual cutters. Export coordinates use a 0.00001 ft grid with exact duplicate-vertex welding and removal of collapsed index triangles. Final volume change from export conditioning is −0.000258836 ft³. These are disclosed construction/export operations, not increased validation tolerances.

The UNCHANGED abstract-validation.cjs still fails its ExtendedTriangle intersection assertion on this mesh, reporting 73 pairs. Its full diagnostics and log remain in legacy-preflight.json/.log. The new independent test examines all 824,563 nonadjacent BVH triangle pairs using segment/triangle interior crossings in both directions and coplanar polygon clipping. It finds zero noncoplanar crossings and zero positive-area coplanar overlaps. Known crossing and separated calibration examples are asserted. The first ten legacy flags also have no segment/triangle hits (legacy-example-adjudication.log). The original test was not removed, rewritten, or relabeled as passing. The disagreement is an integration risk; validation.json reports the separate independent result with the original thresholds (1e−8 distance, 1e−12 barycentric interior). It is not a claim that every historical validation gate is green.

## Original rule coverage and remaining work

|Original relationship|Evidence and status|
|---|---|
|Rule 1A ascending and staggered L/U/V organization|12 actual ascending horizontal terraces; alternating source-anchor setbacks at 25%; U enclosure/focus and V direction relationships constructed before surfaces|
|Heading-relative rotations and prescribed local tilts|Actual transformed source samples and allowed orientation records; default override off; preserved baseline heading convention|
|L orthogonal boundaries|Actual L inner corner, edge and perpendicular features generate terraces and enclosure projection|
|U gathering enclosure|Actual sampled concavity/curvature controls shared focus, terraces and enclosing surfaces; pose addresses focus|
|V circulation/transitions|Actual V arm/apex geometry and adjacent-L relationship influence risers and upper folds; usable continuous route incomplete|
|Rule 1B controlled extrusion, intersections and offsets|Closed ruled-prism surfaces, horizontal plates, inter-terrace contacts, staggered setbacks, source-related projections and pockets|
|15–35% local bay-depth alcoves|25% nominal cuts with exact profile provenance and nine surviving backing probes; occupiable dimensions incomplete|
|Protected gathering void and source traceability|Explicit jointly developed source boundary tool; zero final obstruction; full instance/component/perturbation records|
|Controlled blending|Positive material intersections and explicit closure of recorded sealed raw seam voids before negative cuts; higher-order smooth blending incomplete|
|Stairs, ramps, bridges, landings and occupied levels|Not complete; contacts and V directions do not establish usable movement, accessibility or adequate headroom|
|Architectural recognition and usability|Requires review of gallery, sightlines, spatial proportions, setbacks, structure and material plausibility; no full architectural-compliance claim|

The 12–15 ft major occupied-level concept remains a planning setting. Actual occupied decks and their clearances are not constructed; changing that setting alone need not alter this minor-terrace envelope. Alcove headroom, accessible routes, railings, real stair risers/treads and structural viability remain unverified. This first proof's minor rise is an envelope relationship, not a compliant stair specification. Selected small fields/source sizes can be infeasible; dimensions are never silently enlarged or letters stretched to fit.

Known unrelated failures remain separate: production Vertical Void overlap and A/B/C Boolean round-trip regressions were previously identified and are untouched. The historical abstract size/field studies include three failed cases (20 ft cube intersections/connectivity, 40 ft cube intersection, and 13 ft letter fragments); their archived outputs are not overwritten by this proof. The new algorithm is not yet accepted for all 27 fields or remaining typologies. No production integration, merge, push or deployment is performed.

## Reproduction and files

Set NODE_PATH to the existing LUV-Selection-Heights/node_modules directory. From the isolated proof worktree:

```
node proof/rule-amphitheater.cjs
node proof/abstract-validation.cjs proof/rule-review
# Above legacy gate currently fails: retain log/diagnostics before next step.
node proof/rule-validation.cjs proof/rule-review
node proof/rule-organization-validation.cjs
node proof/rule-influence.cjs
node proof/rule-capacity-checks.cjs
node proof/rule-review-graphics.cjs
node scripts/selection-height-routing-tests.cjs
```

The existing height regression suite passes all 29 tests across six suites (native-regression.log). New CJS syntax checks pass. No TS/TSX or application source changed; no new production TypeScript, lint or build claim is made. The original production build/Phase 2 completion is outside this isolated proof's acceptance claim.

New scripts: rule-amphitheater.cjs (generation), rule-validation.cjs (independent exported geometry checks), rule-organization-validation.cjs (terrace contacts/backing/source anchors), rule-influence.cjs, rule-capacity-checks.cjs, rule-review-graphics.cjs, rule-triangle-diagnosis.cjs (legacy example investigation). Generated artifacts are confined to rule-review/, rule-influence/ and rule-capacity-checks/, plus rule-proof-exports.zip. Existing files remain unchanged.

The gallery provides A/B/C isometric, plan, elevation and section views, independently identified A instances, named-component views, explicit-negative views, actual X=0 longitudinal section, source-feature derivation and architectural organization diagrams, and a d87c068 comparison. Both studies use the same fixed 60 ft comparison frame. Geometry, named OBJ components, individually named source objects, manifest, full measurements, source-contribution records and validation logs are included. Stop here for architectural review before other typologies or integration.

