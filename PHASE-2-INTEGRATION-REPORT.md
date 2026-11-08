# Phase 2 integration checkpoint

Branch: experiment/selection-height-routing. Started from clean d6ab92b59d56b03aa4e705e7045bc0b79ed495ee. No merge, reset, push, or other branch modification.

## Root cause

Composition's routed crop did not pass its dimensions into UnifiedPrototype or the letter-intersections API. buildConnectionWorkflow constructed 20-foot cubes and finally uniformly fitted every result to a 20-foot maximum span. Module Modifier could only stretch the completed workflow. Grid subdivisions were not the primary downstream restriction.

## Implementation and coordinate convention

World X = width, Y = plan depth, Z = architectural height; all units are feet. Composition's legacy SelectionVolume names width/height/depth correspond to X/Y/Z respectively. Its architectural heightRouting (and depth) is passed as envelopeHeight, restricted to 20, 40, or 60. The generator constructs [20,20,envelopeHeight]. Existing arrangement recentering is retained; the selected dimensions govern the generation envelope rather than preserving a crop's absolute world center.

The existing typology arrangement, orientation, overlap, letter geometry and connection functions remain in place. Their native arrangements are uniformly fitted using min(20/spanX,20/spanY,H/spanZ), preserving letter proportions. The original 20-foot final-fit path is retained. Taller geometry is not produced by nonuniform Z stretching. A tall native arrangement can therefore use the additional Z capacity without shrinking its longest side to 20 feet.

Taller generated letter solids, bridges, floors, intersections, and protected voids are physically intersected with the envelope using Manifold. Void and combined variations use this envelope. Negligible boolean fragments are removed only when one meaningful component remains and the letter-solid loss check is at most 1e-7 cubic feet. The cleanup is restricted to taller envelopes.

Height is included in generator props, request bodies, regeneration/stale signatures, snapshots/exports, editor saves, and both JSON and streaming API paths. Editor validation uses per-axis envelope half sizes. Missing height keeps the original 20-foot default; invalid API heights return 400.

Selection controls now precede Fixed 3D Grid and Architectural Letter Size. Selecting an envelope changes neither fixed grid pitches nor letter sizes. Independent letter presets remain. An immediate 3D preview shows the envelope and vertical grid levels before optimization. Undersized grids display capacity warnings without shrinking the envelope. Existing routed-selection locking and persistence helpers remain active.

Module Modifier remains a separate, explicitly requested post-generation operation. Its identity range retains native geometry; adding/removing modules keeps the existing 20-foot increments, with the transformation and volume/normal calculations referenced to native height. Native generation does not invoke a height stretch.

## Exact changed files

- src/components/CompositionStudio.tsx: control ordering, independent height selection, capacity messaging, immediate 3D preview, generator height prop.
- src/components/PrototypeDemonstration.tsx: optional typed envelopeHeight prop contract shared by the active generator.
- src/components/UnifiedPrototype.tsx: request/snapshot/cache/edit routing; native-height viewport, editor and Module Modifier handling.
- src/app/api/letter-intersections/route.ts: height validation and forwarding in JSON/streaming workflows.
- src/components/letterIntersectionSpaces.ts: rectangular envelope, per-axis fit/validation, solid clipping and guarded boolean-fragment cleanup.
- src/components/moduleEnvelope.ts: native base height with preserved 20-foot increment semantics.
- src/components/selectionHeightRouting.ts: accurate capacity suggestions and updated live typology-height explanation.
- scripts/phase2-envelope-regression.cjs: actual generator/Manifold geometry checks and d6ab92b comparison.
- scripts/phase2-api-envelope.cjs: actual API generation, streaming, editing and invalid-height checks.
- scripts/phase2-api-register.cjs: runs existing API regression against isolated test port 3107.
- PHASE-2-INTEGRATION-REPORT.md: this report.

## Actual geometry results

Twelve U letters in the existing contained-room typology exercise genuine vertical development. No letter orientation or typology function was replaced.

| Selected envelope | Letter mesh XYZ span, feet | Letter solid volume, cubic feet | A/B/C components |
|---|---|---|---|
| 20 x 20 x 20 | 2.640739 / 0.295119 / 20 | 8.095610 | 1 / 1 / 1 |
| 20 x 20 x 40 | 5.281478 / 0.590237 / 40 | 64.764877 | 1 / 1 / 1 |
| 20 x 20 x 60 | 7.922218 / 0.885356 / 59.999998 | 218.581461 | 1 / 1 / 1 |

The increasing XY dimensions are the same uniform scale used on Z, not an artificial vertical stretch. Eighteen generated A/B/C meshes across contained-room and stepped-amphitheater cases passed finite-coordinate, nonempty positive-volume, Manifold NoError, enclosure-bound and reported connected-component assertions. Bounds use 1e-4-foot tolerance for float32 serialization. Stepped-amphitheater letter Z span remained approximately 13.98 feet at all three heights; the existing shape's proportions do not require it to fill the height, while its void/combined envelope uses the selected height.

The regression compiles the original generator directly from git show d6ab92b and compares 20-foot A/B/C arrays exactly. Tested contained-room, amphitheater, and a mixed U/L/V amphitheater case match that original geometry. This is fixture coverage, not a proof across every possible typology/input.

## Validation

- TypeScript: npx tsc --noEmit passed.
- Lint: npm run lint passed with zero errors and 30 warnings.
- Production build: npm run build passed (final rerun recorded by execution).
- Routing/grid/letter-size/legibility/physical-trim suite: 29 tests passed.
- Native geometry regression: 18 A/B/C mesh cases passed, with exact original-checkpoint comparisons for the tested 20-foot cases.
- Module envelope regression: passed.
- API: 20/40 JSON generation, 60 streaming generation, editor save retaining 60, invalid height rejection passed.
- Browser: all three selected dimensions and 3D preview verified; fixed pitches and letter sizes stayed unchanged during envelope selection. Independent 60-foot letter preset left a 40-foot envelope selected. A 40-foot selection persisted after reload. Reducing grid capacity to 20 feet retained a 60-foot selection and displayed a warning; the grid was restored to 80 feet afterward.

## Outstanding failures and integration risks

Full acceptance remains qualified: existing rigid-typology-regression.cjs fails at the vertical-void-lobby 25% per-letter overlap assertion; that arrangement/overlap code was not changed. Existing connection-workflow-regression.cjs fails its float32 A/B/C difference assertion, "C has unrelated geometry", on its 20-foot fixture. Tested mixed-letter 20-foot output matches the original checkpoint; these failures were not fixed by weakening thresholds or rewriting shared rules. They require separate investigation before claiming the entire legacy regression suite passes.

The native-height tests cover two typologies, not every typology and possible configuration. The earlier three-letter vertical-void exploratory input also failed its existing solid-overlap requirement; height routing does not override an unsatisfied typology constraint. Architecturally occupiable access, clearance, and minimum usable letter size after uniform fitting are not established by a closed connected solid. Existing horizontal-lobby low-profile rules remain in effect even inside taller envelopes.

The 1e-7-cubic-foot boolean cleanup tolerance and float32 mesh export warrant review during integration with architectural-space-generation. Shared typology/orientation/letter construction files and the other developer's branch remain unchanged. No integration merge or push was performed. This is an implemented native-envelope checkpoint with explicit regression limitations, not a claim that every Phase 2 acceptance case is complete.
