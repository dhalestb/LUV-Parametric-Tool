# Interactive Amphitheater application integration

The isolated Next.js application now operates the checkpointed typology-driven Amphitheater baseline through an interactive React Three Fiber route. This is a functional comparison workspace, not a source-preserving generator or an architectural acceptance milestone.

Open the requested initial study:
http://127.0.0.1:4181/amphitheater?study=1d6164db-6e86-4605-875f-529dd5019208

Open a fresh workspace:
http://127.0.0.1:4181/amphitheater

The production-built application is currently running on port 4181. Its Next.js application route is the primary evaluation interface. The old standalone gallery remains unchanged.

## Start or restart

From PowerShell, after stopping an existing process using port 4181:

```powershell
Set-Location 'C:\Users\DHale\Documents\Codex\LUV-Amphitheater-Proof'
npm run dev -- --hostname 127.0.0.1 --port 4181
```

To run the production build instead:

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 4181
```

Locked dependencies have been installed locally in this worktree using npm ci --offline --ignore-scripts. No production dependency directory was linked or modified. On a fresh checkout, install the locked dependencies before starting. The existing build script applies its existing Next.js patch only to this worktree's local node_modules.

## How to operate

1. Open Amphitheater proof in the existing application navigation. Initial settings are Width X 40 ft, Depth Y 40 ft, Height Z 60 ft and preferred letter size 13 ft.
2. Explicitly choose **Typology-driven comparison baseline**. Source-preserving is visibly unavailable; it never silently falls back to the baseline.
3. Choose the recorded Composition fixture, a current/saved Composition alternative on this origin, or an edited source array. Refresh Composition sources after generating alternatives on /composition at this same port. Other ports have separate browser storage. The source editor accepts the actual L/U/V placement array and preserves the submitted source snapshot per study.
4. Generate baseline study. Actual geometry is constructed and checked on the server. Infeasible settings or mesh failures return an error and preserve the previous displayed study. Inputs are disabled during a request, and changed inputs are labeled as differing from displayed results. Dimensions and letter sizes are never silently changed.
5. Switch A — Original Letters, B — Letters + Architecture, or C — Architecture Only. A/B explicitly identify their letters as the baseline's rearranged instance population; they do not pretend these are unchanged input poses.
6. Use isometric, plan, elevation or section. Isometric supports orbit by left drag, pan by right drag and zoom by wheel. Section clips at adjustable X without modifying the underlying mesh. It is an uncapped clipping-plane view, not a closed section-solid export. Reset camera restores consistent field framing. All modes use the same feet/Z-up coordinates without per-mode scaling.
7. Pick a source in the viewport or select an individual letter/component by name. Isolate selected object or inspect a component's source IDs. The full combined architectural solid remains the primary C geometry; component meshes are separately available for inspection.
8. Saved studies can be reopened or compared when their field dimensions and preferred letter size match. Each stores exact input source, population preference, settings, generated meshes and validation outcomes. Reopening restores its settings and source and updates the study URL. Compare uses matching coordinates and framing; its camera can be manipulated independently.

A freshly checked-out repository will not contain runtime study files. Generate again if a saved-study URL is unavailable. Runtime studies remain on this machine in .amphitheater-runs/ and survive server restarts. They are ignored by Git; the report contains reproducible requests and measurements.

## Application inspection and integration

The existing /composition route mounts CompositionStudio, which owns optimized alternatives, selection windows and current/saved browser sessions. Its Letter-Driven interface is UnifiedPrototype and its /api/letter-intersections pipeline. These production generator files remain unchanged.

The new /amphitheater route reuses AppNav, BoardCanvas, BoardOrthographicCamera, AxisIndicator, existing sizing presets and the same React Three Fiber/drei/Three.js stack. It imports Composition selections through the existing localizeIntersectingPlacements and placementCenterInSelection logic. Source selection localization is translation only; original poses and original alternative context are retained in the request snapshot. The later typology baseline rearranges the letters, as disclosed in the UI.

/api/amphitheater spawns the isolated Node adapter with the exact request. The adapter imports the unchanged proof/rule-amphitheater.cjs build function, writes a unique study directory, runs the unchanged legacy and independent mesh validators, reads the actual source-instance and named-component OBJ exports, and returns triangle arrays. The viewer constructs Three.js BufferGeometry directly from those arrays. It does not display a static image or a previously saved gallery as its primary output.

The adapter rejects geometry when the existing independent validator fails, or when containment/material-shell checks fail. The unchanged legacy intersection result is retained separately. Architectural organization assertions run as an additional independent test and remain strict: a failed architectural assertion is recorded as a failure and displayed prominently. A baseline with valid solid topology can be inspected as an architecturally failed comparison; it is never labeled architecturally accepted.

## Active generator limitation

**Only the 5ec08b0 typology-driven baseline is operational. Source-preserving generation is not implemented.** Its source input controls letter identity, proportions, feature geometry and some heading relationships, but original input positions and full pose relationships do not control the final architecture. The baseline repositions, rotates and repeats source instances. The source-preserving mode is disabled in the UI, and direct API requests for it return HTTP 400 with no fallback.

Implementing the intended Original Composition → preserved source relationships → abstract architecture → typology development pipeline remains separate generator work. This integration does not certify that pipeline. The original six-letter fixture and JSON editing were exercised end to end in the browser. Current/saved Composition import is implemented using the existing crop functions; a newly generated Composition optimization session was not exercised through that entire workflow in this test.

## Actual generation results

Only the three cases below received end-to-end geometry checks in this integration; the available controls do not certify all 27 dimension combinations. All three use the same 40 × 40 × 60 ft envelope and 13 ft preferred letter size. Each produced new triangle geometry through the production-built API. The initial and edited-source cases were also generated through the interactive UI.

|Case|Actual letters|Named components|Volume ft³|Independent tested triangle pairs|Crossings / overlaps|Architectural checks|
|---|---:|---:|---:|---:|---:|---|
|Automatic baseline|19: 8L/4U/7V|24|2161.400050|368400|0|Failed recess backing|
|Explicit population 13|13|18|1888.666289|289317|0|Failed recess backing|
|U source proportions: scaleY +3%|19|24|2201.097112|379591|0|Failed recess backing|

The automatic result has one positive material shell, no negative cavity shell, zero architecture outside volume, zero source outside volume and zero actual clipping loss. Bounds are X −15.530530 to 15.573420, Y −19.307610 to 15.301570, Z 0.959030 to 58.784679 ft. This is native vertical geometry developing to nearly 59 ft, with no reduction to a 20 ft cube and no post-generation stretching.

Eight logical terraces ascend by 1.978261 ft, with 3.25 ft source-anchor horizontal stagger. All seven riser solids intersect both adjacent terrace solids. All 19 actual source transformations agree with independently reconstructed letter geometry, and individual OBJ IDs match the displayed source instances. All eight nominal negative tools remove construction volume and have zero final obstruction.

The architectural check nevertheless fails at five backing probes:
- recess-enclosure-left-U-1
- recess-enclosure-left-U-2
- recess-enclosure-right-U-1
- recess-enclosure-right-U-2
- recess-rear-enclosure

The source/void relationships at these dimensions do not retain the nominal material backing expected by the recess assertion. Zero opening obstruction does not prove a properly backed alcove. The strict assertion still exits nonzero; it is not removed, bypassed or relabeled as passing. The UI lists these failures and marks the study **Architectural relationship checks FAILED — comparison only**. No generator correction was smuggled into this interface task; the protected baseline is intact. These recess failures need generator correction before architectural acceptance.

The unchanged legacy triangle test flags 49/37/33 pairs respectively. The independent segment/triangle and coplanar checks find zero crossings/overlaps in all three. Both results remain available per runtime study. Validation tolerances and the checkpointed generator's explicit geometric clearance/export conditioning remain unchanged. Source solids overlap the initial protected opening by 1113.389 ft³; the architectural solid does not. Full source clearance, usable circulation, occupied alcoves, occupied major levels, structural plausibility and full Rule 1A/1B compliance are not claimed.

## Verification

- Production build: PASS, including application compilation, lint/type checking and route generation. Existing application warnings remain in build.log.
- TypeScript noEmit: PASS.
- Lint on all changed/new application and checking code: PASS, zero errors/warnings.
- Repository-wide ESLint: 133 errors / 40 warnings. All errors are in unchanged baseline proof files, primarily CommonJS require imports. Git comparison against 5ec08b0 confirms no error-bearing file changed. See full-lint.json and full-lint-summary.json. Lint configuration was not weakened.
- Existing native-height regression suite: 29/29 PASS across six suites.
- API/actual mesh alternatives: PASS; exact dimensions/size retained, integer population honored, source-proportion alternative produces a different mesh hash/volume, unavailable source-preserving mode rejected, invalid width rejected.
- Architectural organization: FAILED at the five initial recess probes listed above. Source transforms, object identities, ascending source anchors, riser contacts and construction-source reconciliation passed before that assertion.
- Browser: generated actual geometry with initial settings; A/B/C, plan/elevation/section/isometric, adjustable section control, object selection/isolation, orbit, zoom, stored-study reopening and comparison verified. Preferred size remained 13 while dimensions changed, and selecting the 9 ft preset left dimensions unchanged; controls were restored to 40/40/60 and 13. U proportion editing through the UI generated the measured alternative. The production-built saved-study URL was reloaded and restored the original settings and meshes. Right-drag pan is enabled through OrbitControls but was not separately exercised by automation.

review.jpg records the actual interactive C viewport. api-results.json includes requests, IDs, component counts, bounds, mesh hashes and both validation categories. initial-organization.json contains the unfiltered backing probes and source/terrace/contact checks. initial-geometry.json contains shell, containment and negative-tool measurements. Runtime request.json, manifest.json, result.json, named OBJs and validation logs remain in each study directory.

## Exact implementation files

Added:
- src/app/amphitheater/page.tsx
- src/app/api/amphitheater/route.ts
- src/components/AmphitheaterStudio.tsx
- src/components/amphitheaterInteractiveTypes.ts
- scripts/amphitheater-interactive-worker.cjs
- scripts/amphitheater-interactive-organization.cjs
- scripts/amphitheater-interactive-tests.cjs
- reports/amphitheater-interactive/ (report, measurements, logs and browser evidence)

Modified:
- src/components/AppNav.tsx: link to the isolated application route.
- .gitignore: runtime studies and preliminary geometry-check output.

The organization checker adapts the checkpointed test to a caller-specified study directory and writes its diagnostics before raising the same strict backing assertion. The original proof generator, validators, gallery, protected checkpoint and production worktree are unchanged. Production remains at 12197f7 with a clean working tree. No merges, pushes, branch changes or production edits were performed.

Re-run the API tests while port 4181 is serving this app and an automatic initial fixture study exists:

```powershell
node scripts/amphitheater-interactive-tests.cjs
node scripts/selection-height-routing-tests.cjs
```

For a single runtime study, the strict architectural test intentionally reports the baseline's failures:

```powershell
node scripts/amphitheater-interactive-organization.cjs .amphitheater-runs/1d6164db-6e86-4605-875f-529dd5019208
```

Stop here for interactive evaluation. Source-preserving architectural generation and the recess correction are unfinished generator work, and no other typology has been extended.

