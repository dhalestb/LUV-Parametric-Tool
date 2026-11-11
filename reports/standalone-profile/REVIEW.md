# Standalone Amphitheater profile correction — local review

Date: 2026-11-11. Worktree: C:/Users/DHale/Documents/Codex/LUV-Amphitheater-Proof.
Branch: codex/gathering-amphitheater-proof. Preserved HEAD: 2749b4b40d46485afbe1931ca1c0c1c1a8d7aa17.
Initial worktree was clean. The one-click UI, source editor, API, Vercel Blob adapter and build tracing were already committed at this checkpoint. No reset, stash, branch switch, push, merge or deployment was performed. This correction remains uncommitted.

## Active path and cause

`AmphitheaterStudio.newDesign/generate` → POST `/api/amphitheater` → `amphitheater-interactive-worker.cjs` → `source-envelope.buildSource/derive` → `source-level-envelope.levelEnvelope` for the old `levels` version → Manifold union / bounded `source-articulation.articulate` → OBJ export → independent `proof/rule-validation.cjs` → saved result → `Viewer/Surface`.

The old active envelope did NOT use Marching Cubes. `levelEnvelope` rasterized the transformed contour on a 0.5-ft XY grid, unioned 0.5 × 0.5-ft columns and rounded bottom/top elevations down to 0.5-ft increments. This made tilted and curved edges into actual six-inch geometric steps. `derive` also used `shape.getPoints(6)`, visibly coarse for U curves. Booleans retained these stair-step surfaces. Averaged viewer normals could blur real architectural edges, but were not the primary geometry defect.

## Changed code

- `scripts/source-profile-envelope.cjs`: new `featurePoints` and `profileEnvelope`. Adaptively tessellate curved source contours to a 0.01-ft world-space chord tolerance; leave straight segments straight. Use projected CrossSection offsets with round corners and exact horizontal extrusions, Boolean union and real field clipping. Three local tiers derive from each letter's transformed height range and center. Local bases begin at `max(0, minimum source contour Z - 3 ft)`; the upper letters are not extended automatically to the global floor. Exactly upright collapsed projections get a local 0.05-ft line footprint before the normal offsets, without changing the source. Existing graph-driven 3 × 3 × 4-ft hull bridges are retained.
- `scripts/source-envelope.cjs`: route explicit `profiles` requests to the new envelope and refined contour extraction. Preserve the old coarse feature graph for relationship matching so geometry refinement does not silently select different letter pairs or bridge endpoints. Original source meshes still use the unchanged `getLetterVolumeGeometry(letter,12)` and exact placement matrices. Existing source validation, cavity handling, bounded articulation, contribution checks and exports remain active. Old `levels` and versionless requests remain available.
- `src/components/amphitheaterInteractiveTypes.ts`: recognize the new envelope version.
- `src/components/sourcePopulation.ts`: default newly created letters to horizontal RX/RY=0 and yaw 0/±15° around a common axis (existing first-letter yaw for additions). Optional ±30° transitions; old orientation sampling retained behind explicit legacy option. Existing letters are never reoriented by population extension.
- `src/components/AmphitheaterStudio.tsx`: select `profiles` for new generation/regeneration, record orientation settings, expose optional transitions in Advanced Settings, and render the new architecture with 30° crease-aware normals. Source meshes/normals are unchanged. This render change follows actual geometric correction and does not conceal a raster mesh.
- `scripts/profile-envelope-review.cjs`, `scripts/profile-envelope-tests.cjs`, `scripts/profile-workflow-tests.cjs`: reproducible comparisons and targeted validation.
- `reports/standalone-profile/`: original/corrected snapshots, validation JSON, metrics, workflow results and actual application screenshots.

No changes to UnifiedPrototype, Composition geometry, Presentation, source letter geometry, API, storage adapter, package files or Next configuration. Other worktrees were not edited in this task.

## Identical-source comparisons

Both comparisons use 40 × 40 × 60 ft fields and 13-ft preferred letters. Source meshes, source identity/order, every scale/position/rotation and selected field/size compare exactly equal. Relationship letter pairs and feature bridge endpoints remain unchanged. Only envelope version and descriptive source name differ in the requests.

| Case | Before triangles | After triangles | After worker + strict validation | Before / after volume ft³ | Before / after cuts |
|---|---:|---:|---:|---:|---:|
| Nine saved letters | 46,848 | 7,462 | 3.31 s | 12,123.795 / 15,556.411 | 8 / 8 |
| Twelve saved letters | 65,608 | 10,538 | 4.47 s | 16,268.616 / 26,613.545 | 9 / 8 |

Times are single corrected runs including worker and validation, not controlled old/new benchmarks. Triangle reductions are 84.1% and 83.9%. No global sampling resolution increase. Dense U-curve measurement found maximum chord deviation 0.008308 ft against 0.01-ft target. Axis-aligned vertical-wall surface share fell from 99.47% to 16.83% and 99.83% to 9.46%; this quantifies removal of raster walls, not removal of intentional planar walls. Horizontal terrace area remains 3,889.59 and 4,329.70 ft².

Both corrected cases pass unchanged solid export checks, containment, one connected final shell, source transforms, cutter clearance and independent coplanar/noncoplanar intersection tests: zero intersections across 253,006 and 320,025 nonadjacent candidate pairs. Every source retains at least 1 ft² exposed contribution under the existing metric. Backed pockets retain 15–35% depth ratios. Legacy broad-phase flags (102/141) remain recorded; they are not treated as precise intersections.

### Isometric and section evidence

Actual application captures in `screenshots/`, not conceptual renderings. Architecture Only C mode, same field framing, section X=0.

| Case | Before isometric | After isometric | Before section | After section |
|---|---|---|---|---|
| Nine | [Before](screenshots/nine-before-iso.png) | [After](screenshots/nine-after-iso.png) | [Before](screenshots/nine-before-section.png) | [After](screenshots/nine-after-section.png) |
| Twelve | [Before](screenshots/twelve-before-iso.png) | [After](screenshots/twelve-after-iso.png) | [Before](screenshots/twelve-before-section.png) | [After](screenshots/twelve-after-section.png) |

Section is the existing viewer clipping plane; it does not add an artificial solid cap. Saved tilted sources remain tilted, so those designs still contain tall local masses. New horizontal source defaults produce calmer horizontal tiers but do not establish verified usable amphitheater seating/circulation.

## Functional validation in running app

Local URL: http://127.0.0.1:4194/amphitheater

1. Generate Design once: 40/40/60 ft, 13 ft, Automatic, seed 37 → 12 letters and actual architecture, study `b58806ce-4347-43c5-84c1-bdbdbf9d778f`, 11,052 triangles, 18,517.693 ft³, nine cuts, zero precise intersections.
2. A Original Letters, B Letters + Architecture and C Architecture Only opened. Captures `new-design-A/B/C.png`.
3. Edit Letters: first U moved from x=0 to x=0.25 ft, all other values unchanged. Regenerate Architecture → `102dc7d7-bee3-4db9-80b2-9c16abb5e4d0`, 11,100 triangles, 18,557.326 ft³, nine cuts. Saved request equals original plus exactly that edit; architectural mesh differs.
4. Browser refresh reopened the edited result successfully; screenshot `edited-reloaded.png`.
5. New Design → separate source/results `2e04e4c6-724f-45da-bd31-54a5039df958`, seed 1234714759, 14,050 triangles, 19,064.579 ft³, sixteen cuts. All earlier study IDs remain saved/listed. Zero precise intersections and all-source contributions pass for all three.

These are localhost tests with existing local persistence. Vercel Blob implementation was preserved but credentials/Preview connectivity were not established by this task. No claim of deployed verification.

## Checks

Passed: real worker + strict geometric validation on two unchanged saved sources; focused profile regression assertions; API readback/exact edit/New Design assertions; five existing Composition-source collection/refresh tests (standalone source-list behavior only); TypeScript `--noEmit --incremental false`; focused ESLint on three changed TS/TSX files; production build. Three CommonJS deprecation warnings remain in the test tooling; no thresholds changed. No unrelated Office/Lobby/Presentation/full-suite tests run.

Reproduce focused comparison: `node scripts/profile-envelope-review.cjs`, then `node scripts/profile-envelope-tests.cjs`. The comparison reads included original JSON snapshots and generates new isolated study folders; it does not overwrite historical study files.

Recheck workflow against the running local server: `node scripts/profile-workflow-tests.cjs http://127.0.0.1:4194 b58806ce-4347-43c5-84c1-bdbdbf9d778f 102dc7d7-bee3-4db9-80b2-9c16abb5e4d0 2e04e4c6-724f-45da-bd31-54a5039df958`.

Start built server from this worktree: `npm run start -- --hostname 127.0.0.1 --port 4194`. Rebuild with `npm run build` after further edits.

## Material limitations / architectural review

This is an opt-in versioned reconstruction, not an equivalent smoothing of the old solid. Filled source-profile offsets and source-range tiers add mass: +28.3% / +63.6% volume in the two saved tilted cases. Horizontal tiers replace local raster height fields; tilted source height influences each letter's tier range rather than a continuously varying bottom/top at every XY coordinate. Local geometric connections remain, but functional stairs, ramps, occupancy and a coherent accessible gathering route are not verified.

Openings are re-derived with the existing articulation rules against the changed solid. They are not identical old voids. Nine retains eight cuts but replaces V-7 segment 7 with V-7 segment 6. Twelve retains eight rather than nine: old V-2 segment 1, U-7 segment 1, V-4 segment 5 and V-1 segment 6 operations are absent; new V-11 segment 6, L-12 segment 1 and V-2 segment 4 operations are accepted. New candidates still require backing/roof/clearance/connectivity checks. Thus preservation of every historical opening has NOT been achieved, even though valid final pockets/through-openings and connectivity remain. Historical results and the old generator remain available for comparison.

The geometry-quality correction is implemented and locally testable, but architectural equivalence to the earlier envelope is not claimed. These massing/opening differences should be evaluated before adoption or deployment. More faithful preservation would require a separate continuous contour-ribbon reconstruction and explicit transfer of protected old cuts, with the same validators; it should not be hidden by weakening tests.
