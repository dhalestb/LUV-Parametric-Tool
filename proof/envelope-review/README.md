# Architectural envelope proof — 60 x 40 x 40 feet

## Construction

The approved source-feature method is implemented in proof/envelope-amphitheater.cjs. Shared selection-field configuration and existing letter sizing modules are imported unchanged. The proof uses the existing 40-foot-height preferred footprint of 11 feet for the recorded source fixture. Four complementary boundary regions use twelve uniquely identified L/U/V instances drawn from the selected six-source fixture, rather than the former 72-instance field population. This is one controlled envelope composition, not a population maximum. Different sources/fields can report feasibility conflicts. Only 60/40/40 was demonstrated for this new method.

Actual L inner perpendicular edges determine upper projections and local bay depth. U outer Bezier profiles are sampled from getLetterShape in the same centered/scaled coordinates as the original letter mesh. Adjacent curve endpoints provide tangent-constrained interpolating boundaries. V arm/apex points are transformed upright and control folded upper elevations. All rotations use local X followed by world Z and translation about recorded pivots. Original default heading-relative choices are 0/15/30/45/90 degrees. The optional scoped override remains disabled by default.

Three larger masses each reference six source instances across two neighboring regions. Ruled bottom/upper profiles develop curved and angular enclosing walls. Surface thickening is derived from source scale. Locally overlapping ruled solid cells are Boolean-unioned to resolve their actual intersections. Shared profiles use consistent source-local frames. No broad convex-hull filling, unrelated shell, global smoothing or signed-distance reconstruction is used. Default-tolerance simplification removes redundant Boolean faces without increasing numerical tolerances.

Region positions, tangent extension distances, thickness factors, upper projection factors and the 0.72 focal inset are controlled design choices for this proof. They are recorded by the script/profile arrays and remain subject to architectural review. They are not additions to the original rule specification.

## Positive and negative geometry

Principal positive components are Left_curved_projecting_mass, Rear_folded_enclosure and Right_curved_recessed_mass. They include curved enclosure, projected upper edges, folded transitions and carved recesses. A combined independent envelope is exported separately. Component meshes overlap intentionally at their interfaces and are intended to remain separately selectable for editing.

The primary negative volume starts from L corners and U profile centers. Its plan is inset to retain the connected envelope. It is extruded upward from elevation 4.07 feet to the 40-foot field ceiling. Its bounding plan dimensions are 25.615 x 12.587 feet, with an irregular source-derived plan area about 285.2 ft2. It removes 476.748 ft3 of raw architecture. This is a deliberate cut; surrounding open boundaries reinforce the open gathering focus.

Three additional recess tools are aligned to local envelope tangents. Each has nominal depth 2.4803 feet (25% of a 9.9210-foot source bay), width 3.85 feet and height 5.5 feet. Their removed raw volumes are about 8.799, 21.361 and 15.888 ft3. The tool dimensions do not establish usable alcove clear dimensions; partial intersections and neighboring surfaces affect their actual occupied potential. The cuts are retained overhead and within enclosing mass, with exact tool positions/meshes exported.

Measured removal for each tool is against the raw envelope; overlapping tools mean removal values must not be summed as independent totals. Final obstruction is below 1e-8 ft3 for all tools.

## Geometry and export verification

Final architectural bounds span 49.0291 x 27.5924 x 22.5698 feet, at Z 2.5073 to 25.0771, within the selected 60 x 40 x 40 field. Volume is approximately 5368.6252 ft3. No final stretching or trimming reduction was needed. The original letters also lie inside the field.

The final combined solid reports NoError and one positive shell, with no additional cavity shells or detached material fragments in the decomposition. The independent BVH check records 36 nonadjacent coplanar contacts. Explicit planar clipping measures zero overlap area for all 36. Noncoplanar intersections are zero. These findings follow correction of initial inconsistent shared-profile frames and intersecting swept surfaces; the failed intermediate geometry is not the delivered export.

Combined, three component, and four tool OBJ meshes re-import with NoError and positive volumes. OBJ values retain full serialized vertex coordinates, feet units and Z-up orientation. This verifies mesh reconstruction, not native Rhino NURBS, .3dm solids or a direct Rhino application import. Existing OBJ v/f conventions are retained. The envelope-first proof adds named component/tool files and a sidecar manifest. The historical A/B/C Boolean round-trip defect remains separately unresolved.

All 29 existing native-height regression tests pass. The configuration module and previous field studies remain unchanged. The proof has not performed production TypeScript/build validation because production application code is unchanged.

## Architectural limitations

This is an articulated envelope study. It does not certify occupied terraces, an auditorium program, stage-floor usability, circulation, accessibility, structural behavior, alcove headroom or full Rule 1B compliance. The three masses still require architectural evaluation of their silhouette, source influence, recess proportions and focal relationship.

Reference letters overlap the focal tool by approximately 70.866 ft3, while the generated envelope has zero measured obstruction within numerical tolerance. The source solids are displayed as generative references in A/B; they are excluded from the Envelope Only mesh and OBJ. A later integration that retains source solids as architectural material must resolve that conflict. Live Composition selection was not exercised in this proof.

Partial enclosure and no dedicated interior floors are intentional for the approved envelope-first scope. Curved profiles are polygonally sampled and therefore faceted at mesh resolution. Component interfaces remain overlapping separate solids in named exports; use the combined export for the Boolean-unioned result.

## Review and output

index.html provides Original Letters, Letters + Envelope, Envelope Only, named component, source-feature derivation and subtraction-tool views. All comparisons use the same frame and isometric/plan/elevation/section directions. Red source-feature ribbons identify selected edges and curves over the colored components. Section images are triangle/plane intersection lines at the frame mid-Y plane, not inferred room sections.

manifest.json records source IDs, instance poses, profile coordinates, six-source relationships, operations, dimensions, named exports and removed volumes. validation.json records exported-mesh re-imports and triangle-intersection diagnostics.

envelope-exports.zip contains the combined envelope OBJ, three mass OBJs, original letters OBJ, four tool OBJs, manifest, validation and this report. These are mesh editing references for subsequent Rhino refinement.

Changed files are proof/envelope-amphitheater.cjs, proof/envelope-validation.cjs, proof/envelope-review/* and proof/envelope-exports.zip. All prior proof checkpoints, production 12197f7 and other architectural typologies are preserved. No production workflow integration, push or merge was performed.
