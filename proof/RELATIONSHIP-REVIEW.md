# Shared-region Stepped Amphitheater review

Baseline a53d828. The generator is proof/relationship-amphitheater.cjs. Run it with the repository dependencies on NODE_PATH; optional arguments specify an exported source fixture and output directory. Default outputs are in proof/relationship-review/index.html.

## Diagnosis and historical comparison

The prior spatial-amphitheater.cjs assigned z from the instance index, advanced a radial angle phi, searched around a permanent full-height cylinder, then independently projected/extruded each source outline. Its connected mesh did not establish architectural spaces. Historical generateProtoArchitecture used source boundaries plus relationship graphs to construct additional occupied surfaces; continuousSurface reconstructed those generated surfaces. faceBridges constructs between related face perimeters. The present study adopts local ruled connections and geometric source analysis from those principles. It uses neither generic amphitheater rings nor wholesale historical dispatch. Production code is untouched.

## Spatial and geometric change

Consecutive complementary source letters share a spatial region. A repeated letter role begins the next region. The controlled L/U/V source therefore generates groups of three with a final partial group. Seven, eleven and sixteen instances occupy three, four and six shared levels. This grouping is an implementation choice for the controlled study, not a universal requirement. Source identity, original records, scale proportions and the existing preferred sizes (9/11/13 feet) remain recorded. Live Composition correspondence remains untested.

The prior feasible population calculation is retained independently of grouping. Region rise is 2.3 times the prior instance rise. Region/member offsets and partial cover proportions are adjustable implementation constants in this isolated study, not newly prescribed architectural rules. Regions alternate offsets rather than orbiting an atrium. Upright V feet are aligned to shared levels; their source pivots are higher than horizontal L/U pivots.

getLetterShape provides actual profiles. featurePoint compensates profile centering and applies source scale proportions; world applies local X tilt, world Z yaw and the source pivot. Allowed yaw remains 0/15/30/45/90 relative to the same principal heading. The explicit orientationOverride configuration retains its disabled default and height/instance scope. This change did not repeat the override restoration tests from a53d828; arbitrary restricted configurations remain subject to feasibility.

L inner perpendicular edges are extended inward into terraces and upward into orthogonal boundaries. U inner curves are sampled from the actual Bezier path. Adjacent curve tangents establish offset strips and enclosing surfaces. L edges and U curve samples form ruled platform cells and partial overhead surfaces. V apex/arm geometry is transformed upright, then related to neighboring L edges to construct angular ruled volumes. V-local thickness follows the transformed local frame. Components record every contributing source instance; 12, 20 and 30 components respectively depend on multiple letters.

The gathering void is a finite low volume derived from the first L interior corner, clear of sources and architecture. Its dimensions are 1.98 x 1.98 x 4.05, 2.42 x 2.42 x 4.95 and 2.86 x 2.86 x 5.85 feet. It ends near the first shared gathering region rather than passing through all levels. Its architectural size and prominence still require review.

Recesses remove 25% of the measured local U bay depth (open-end-to-curve relationship), retaining overhead material. They measure 1.82/2.22/2.63 feet deep, 1.98/2.42/2.86 feet wide and only 2.39/2.92/3.45 feet nominal clear height. They cannot be reported as usable gathering alcoves. Actual subtraction and final clearance are recorded independently.

Interlevel L-edge ruled surfaces join the shared regions; stepped paths use neighboring L landing edges and an actual V apex as intermediate geometry. Those connections need slope, tread, landing, headroom and collision verification. Material continuity does not verify circulation usability. Small explicit local geometric offsets join adjacent surface cells. Blending beyond those offsets is not validated.

## Measurements

|Field height|Letters|Shared levels|Height of generated architecture|Volume ft3|Constructed components with source records|Components using multiple sources|
|---|---:|---:|---:|---:|---:|---:|
|20|7|3|15.058|207.748|26|12|
|40|11|4|27.522|694.120|40|20|
|60|16|6|46.867|1568.411|59|30|

No scaling or clipping was required. All source and architecture solids lie within their envelopes. Final architecture is Manifold NoError. At 20/40 there is one decomposed shell. At 60 the decomposition records one positive material shell and a negative 0.00943 ft3 enclosed cavity shell. The cavity is retained and disclosed; its exact origin needs further geometric audit. No fragments or failed checks were deleted to make the results pass. Source/architecture overlap with the protected gathering volume and final pocket obstruction are below 1e-8 ft3.

## Validation and architectural acceptance

relationship-validation.cjs checks increasing populations, shared levels, ascending regions, permitted applied yaw, source identity on every component, cross-letter construction, source/architecture containment, actual focus clearance, pocket subtraction and material-shell counts. All 29 existing native-height regression tests pass.

Rule 1A is partially demonstrated through shared grouping, yaw, role-based local rotations and increasing levels. The rank-based yaw choice and fixture offsets remain controlled design choices. Full displacement, spatial interaction and architectural appropriateness need final review.

Rule 1B is partially demonstrated through actual edges/curves/arms, inter-letter ruled volumes, partial enclosures and subtractive pockets. The images do not prove occupiable terraces, useful alcoves, continuous usable circulation or a recognizable completed amphitheater. The architecture is still vertically compact in plan. The finite focus is small. Stair and cover interference, accessibility, structural plausibility, watertight exported-mesh round-trip behavior and the enclosed 60-foot cavity remain unresolved.

The original fixed tolerances remain intact. The separate known A/B/C Boolean round-trip defect is unresolved. No tests certify this study as fully compliant.

## Review outputs

Each height has Original Letters, Letters + Architecture, Architecture Only and color-coded derivation views in isometric/plan/elevation/section. The common 60-foot frame preserves comparable scale. Feature overlays show extracted source edges/curves/arms in red over sand terraces, green enclosures and violet transitions. Per-height derivation JSON contains sampled coordinates, component methods/source IDs, source poses, measurements and unresolved circulation records.
