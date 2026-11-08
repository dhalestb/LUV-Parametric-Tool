# Orientation correction review

Checkpoint 9d8b40f already applied every heading-relative yaw choice, 0, 15, 30, 45 and 90 degrees. Principal heading is 7.594643 degrees, derived from the first/last selected source positions. All candidates were evaluated. Ranking combines radial placement error with a deterministic repeating yaw preference. This is an existing proof heuristic requiring architectural review. No first-feasible early return, post-fit rotation overwrite, optional restriction or global-axis snap caused parallel output.

The geometric mismatch was the V boundary: Rule A rotated the source 90 degrees around local X, while Rule B extruded its untilted plan profile. Rule B now offsets the actual local V profile and extrudes angular boundary mass, applies its 90-degree local X rotation, then the selected world yaw and translation at the same pivot. Horizontal floor projection remains a separately developed level surface. L/U boundaries already applied the selected yaw after local construction. The fixture uses horizontal L/U source profiles and an extruded U enclosure. Secondary tilts remain zero by choice; this proof does not explore all permitted combinations.

The renderer uses fixed isometric, plan, elevation and section directions. All fields share a 60-foot-high frame. The gallery annotates each instance with heading, relative/world yaw, local X/Y tilt, pivot and override state. Full feasible/rejected candidate counts and selection reasons are in measurements.json. World yaw and tilt are applied by solid.rotate before translation; these are actual geometry transforms.

## Override behavior

The standalone proof has no existing yaw restriction control. Production UnifiedPrototype has legacy gatheringAngles state and persisted angle limits; the standalone generator does not consume that state. The proof accepts one explicit orientationOverride object. enabled must be the boolean true. Optional heights and instances arrays define its scope. Disabled configurations discard retained yaw arrays. No persisted state, random generator or cache affects this proof. Repeated runs use identical deterministic inputs.

override-on.json deliberately applies heading-relative yaw 45 only to the 20-foot field. override-off-again.json carries the same custom values with enabled false. orientation-validation.cjs compares exact architecture and letter mesh hashes and every default placement against the regenerated OFF result. It also verifies source correspondence and that unaffected fields match exactly.

An initial all-height 45-only test produced two architectural components at 40 feet and rejected the first 60-foot pose under containment/void constraints. The accepted demonstration restricts scope to 20 feet. Those larger-field conflicts remain unresolved. The generic generator reports infeasible poses as errors; connected-component failures are exposed in its measurements and must be reviewed.

## Validation and limitations

Default populations remain 7, 11 and 16 with preferred sizes 9, 11 and 13 feet from existing sizing presets. Actual heights remain 17.64, 36.96 and 58.24 feet. All default architecture solids return NoError, one component and zero outside volume. Void and final pocket intersection volumes are below 1e-8. Every stair retains positive contacts and one piece after final subtraction. All 29 existing native-height tests pass.

Every source has an unchanged sourceIndex and source record. Newly generated instance IDs are unique within their field. The live Composition transfer remains untested. Heading from source endpoints, cyclic yaw preference, one instance per level and fixed role configurations remain architectural choices in the isolated fixture. Walkability, stair dimensions, landing clearances, occupied alcove headroom and code compliance remain unverified. The known production A/B/C round-trip numerical defect is unresolved.

Only proof scripts, controlled override inputs, generated review artifacts and this report changed. Source generator files and other typology implementations receive no modifications.
