# Vertical-wall Stepped Amphitheater experiment

Worktree: `C:/Users/DHale/Documents/Codex/LUV-Gathering-Envelope-Experiment`
Branch: `experiment/gathering-envelope`. Base checkpoint: `f5eb105698143f2d255adcc8290b4fcc667450b8`.

The original Amphitheater worktree and backup branch remain at that checkpoint. No further commit, push, merge or deployment was authorized or performed.

## Geometry contract and implementation

New `scripts/source-vertical-envelope.cjs` exports `verticalEnvelope`, `upperTriangles`, `heightAt`, `roleFor`. `source-envelope.buildSource` dispatches explicit `vertical-walls` requests to it. Existing `levels`/`profiles` routes remain intact; a strict worker replay matches the checkpoint profile architecture and source meshes exactly (`checkpoint-regression.json`).

Perimeter walls are built from the actual transformed source-letter mesh, including its bevel and upper side faces. Upward-facing source triangles are extended vertically to a support plane and Boolean-unioned. Their union defines the highest actual upper surface at each XY, without a constant horizontal roof elevation. Intersecting it with vertical boundary strips yields vertical sides and a source-following upper edge. Supporting exterior edges of the projected source outline facing away from the population focus are selected; inside-channel edges are not treated as exterior walls. There is no voxel grid, Marching Cubes, post-generation stretching or averaged-normal workaround.

Wall support is explicit per source via `supportZ` in floor coordinates; default Z=0 is the selection-field floor. This is a declared design support plane, not a claim that an elevated slab has structural bearing capacity. The role and support elevation are editable in Edit Letters. Tests also exercise support Z=5 ft. Supports at/above the source underside are rejected. Automatic selection of structurally suitable elevated supports is not implemented.

Each source also contributes a horizontal plate at its actual lowest underside elevation. Graph links are intentional horizontal stepped runs with vertical risers and a common ground bearing, rather than inclined floor prisms. They are geometric connections, not verified stairs, ramps, access or occupied circulation.

Interior source roles require unchanged horizontal RX/RY=0 and RZ=75/90/105 degrees. Invalid poses fail with an actionable generator message; regeneration does not rotate them. New compositions assign explicit perimeter/interior intent (two perimeter sources per interior source in the population sequence) and sample the permitted angles before field fitting. This role assignment is not a solved architectural perimeter layout. Review roles in the editor. Unspecified roles are classified from the source-center XY convex hull and recorded as automatic decisions.

An interior cutter uses the source glyph convex hull minus its actual concave outline: L inside corner, U channel or V notch. Its horizontal source profile is lifted into a vertical cross-section, then swept across the complete field along the source's plan yaw. These XY through-voids are distinct from the global-Z wall construction. Nominal cutter volume must remain completely empty, and a full-length interior ray must remain clear. No historical cut is silently transferred to a different source.

## Precision and ambiguities

The Boolean construction initially produced sub-Float32 sliver triangles, exposed by the unchanged strict validator. The experimental path welds coincident Float32 export positions, removes only triangles collapsed exactly to zero area in that representation and reconstructs/checks manifold topology. A 0.00002-ft geometric expansion of the cutting tool prevents Float32 conversion from refilling the nominal protected void. A 0.00001-ft planar simplification is used before cutting. Validation thresholds were not relaxed.

Actual upper source surfaces can overlap in projection. The explicit rule is the highest upward-facing source surface along global Z; the lower surface is not selected arbitrarily. The result's `boundaryReport` records selected boundary segments, source triangle data, roof probes, support rules, role decisions and any probe encountering multiple upper surfaces. This probe report is not an exhaustive analysis of every possible source degeneracy. Missing exterior boundary or an invalid support fails generation. Coincident source centers or unusual perimeter relationships should receive explicit roles. Discontinuous upper branches remain discontinuous; no diagonal wall interpolation bridges separate branches. Conflicting walls from different letters are not resolved by a structural or enclosure solver.

## Operation selection and remaining population failure

Advanced Settings now explicitly selects Preserved profile envelope or Experimental vertical walls + directional voids. A fresh page defaults to the preserved operation; reopening a wall study restores the experimental operation. Changing the operation never silently rotates existing source letters or falls back to another generator. Perimeter/interior role population is applied only when creating new experimental sources.

The fresh 12-letter seed-37 experimental population is rejected during Float32-safe manifold reconstruction (NotManifold). This unresolved case is recorded in new-design-seed37.json; it has not been hidden, retried with changed parameters, or accepted by weaker validation. Therefore the experimental operation is NOT complete for arbitrary automatic populations. The supplied controlled studies demonstrate the requested geometry, not broad random-population reliability. The preserved profile operation's one-click seed-37 generation was tested in the final running app and succeeded with 12 letters and actual architecture (study 70d971f2-1944-4819-870f-293fa39f890c, 18,517.693 ft³).

The existing articulation amount belongs to the preserved profile operation. The experimental void dimensions instead follow the source concavity and poses; it does not use that amount as a wall lean or void-deformation control.

## Actual geometry validation

All cases: 40 × 40 × 60 ft, preferred letters 13 ft, two inclined perimeter sources and one horizontal interior U. Source identity, scale, position and orientation remain exact, and original letter meshes match the unchanged glyph pipeline.

| Interior yaw | Perimeter letters | Triangles | Worker + strict validation | Precise intersections |
|---|---|---:|---:|---:|
| 75° | L / V | 1,666 | 1.24 s | 0 / 58,589 tested pairs |
| 90° | U / L | 2,728 | 1.52 s | 0 / 90,048 tested pairs |
| 105° | L / V | 1,712 | 1.40 s | 0 / 60,149 tested pairs |

All strict source, containment, positive-volume, single-shell, export and cutter-clearance checks pass. Each letter retains exposed architectural contribution. Wall-side XY collinearity is checked within 0.00001 ft (export precision); bottom faces are horizontal at selected support Z. Wall-roof vertices lie within 0.00000183 ft of the actual original upper mesh triangles. Roof elevations vary by roughly 4–5 ft on each inclined source, rather than ending at a single horizontal elevation. Final geometry contains measurable exposed horizontal floor area at all three source-derived plate elevations in every case.

Additional strict worker cases: L and V interior concave cuts, raised wall support, invalid 45° interior yaw rejection, invalid interior tilt rejection. Population extension preserves existing placements exactly. An earlier U-perimeter/105° arrangement was rejected for disconnected material; no fragment deletion or validator relaxation was used to accept it. Arbitrary source arrangements can still fail valid connectivity/void/contribution requirements.

Interactive API regeneration of the 90° study saved a new result with exactly equal source poses and deterministic architecture: `216d05b5-8785-4c63-ac01-3119e11c2477`. A/B/C, role/support editing and section/isometric controls were inspected in the running application. Build and TypeScript passed; focused changed-component lint passed. The full production build reports existing warnings in unrelated modules; those files were not edited. See JSON reports for measured details. Node's existing Three CommonJS deprecation warning remains in worker tooling.

## Visual evidence and local route

Experimental application: http://127.0.0.1:4196/amphitheater?study=11111111-1111-4111-8111-111111111090

Preserved original: http://127.0.0.1:4194/amphitheater

- [Architecture isometric](screenshots/C-iso.png)
- [Source letters plus architecture isometric](screenshots/B-iso.png)
- [Source overlay section X=0](screenshots/B-section.png)
- [Architecture section X=0](screenshots/C-section.png)

The section uses the existing clipping plane without artificial cap geometry. Full-page section captures show field-floor termination, source-following upper profiles and the open directional channel. This is a controlled geometric study, not a claim of a complete usable amphitheater, verified circulation or structural support.

Start this experiment from its worktree with `npm run start -- --hostname 127.0.0.1 --port 4196` after `npm run build`. Final source-overlay section: [Full capture](screenshots/final-source-overlay-section.png). Tests: `node scripts/vertical-envelope-review.cjs`, `node scripts/vertical-envelope-constraints-tests.cjs`. Generated runtime studies are local, separate from the original worktree. Vercel Blob implementation is unchanged; no hosted deployment validation was performed.

## Changed files

`scripts/source-envelope.cjs`; new `scripts/source-vertical-envelope.cjs`, `scripts/vertical-envelope-review.cjs`, `scripts/vertical-envelope-constraints-tests.cjs`; `src/components/AmphitheaterStudio.tsx`, `SourcePopulationEditor.tsx`, `sourcePopulation.ts`, `amphitheaterInteractiveTypes.ts`; this report, tests and result snapshots under `reports/vertical-envelope/`.

Composition, Presentation Boards, original letter geometry, protected production and the original standalone worktree were not edited.
