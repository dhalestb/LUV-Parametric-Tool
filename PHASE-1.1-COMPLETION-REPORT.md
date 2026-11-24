# LUV Parametric Tool — Phase 1.1 Completion Report

**Branch:** `experiment/selection-height-routing`
**Working directory:** `C:\Users\DHale\Documents\Codex\LUV-Selection-Heights`
**HEAD (unchanged):** `362fc41` — feat: complete Phase 1 height-specific selection infrastructure
**Protected generator checkpoint:** `4f09f92`
**Status:** Implemented, uncommitted, ready for review. No merge, push, deploy, or Phase 2 work.

---

## Summary

Phase 1.1 expands the Fixed 3D Grid so the 20', 40', and 60' selection volumes can move through a larger composition field, and it adds independent architectural letter-size controls. Letter size is no longer tied to cell pitch. L, U, and V geometry stays the architectural generator; letters may span multiple cells and may differ in size inside one composition.

Phase 1 selection behavior is preserved. Protected proto-form files were not modified.

---

## Files created

| File | Role |
|---|---|
| `src/components/architecturalGrid.ts` | Overall field, independent cell/pitch/overall setters, validation, session normalization |
| `src/components/architecturalLetterSizing.ts` | Footprint measurement in feet, height presets, sampling, mapping onto optimizer rules |
| `src/components/letterLegibility.ts` | Soft L/U/V legibility diagnostics |
| `src/components/architecturalGrid.test.ts` | Automated coverage for grid, letter sizing, selection compatibility, and legibility |

## Files modified

| File | Change |
|---|---|
| `src/components/CompositionStudio.tsx` | Fixed 3D Grid controls, letter-size controls, owned Slide sync, legibility readout |
| `src/components/optimizerTypes.ts` | `preferredLetterSize`, `letterSizeVariation`; architectural default rules (~6–12 ft) |
| `src/components/geometryGenerator.ts` | Samples letter scale from min / preferred / max and variation |
| `src/components/spatialOptimizer.ts` | Does not shrink letters to fit the selection box when height routing is active |
| `scripts/selection-height-routing-tests.cjs` | Includes `architecturalGrid.test.ts` |

## Protected files (not modified)

- `src/components/UnifiedPrototype.tsx`
- `src/components/letterIntersectionSpaces.ts`
- `src/components/moduleEnvelope.ts`
- Lattice Studio components
- Architectural typology generation rules

Git status on those paths was clean after implementation.

---

## 1. Fixed 3D Grid

The default example field is large enough to host and reposition all three Phase 1 selection volumes:

- **6 × 6 × 4 cells**
- **Cell pitch 10 × 10 × 20 ft**
- **Overall 60 × 60 × 80 ft**

These values are an initial example, not a permanent limit. Users can change X, Y, and Z independently.

The overall composition is enlarged by adding cells and setting pitch. Letters are not stretched to fill the larger field.

### Supported ranges

Defined in `ARCHITECTURAL_GRID_LIMITS`:

| Parameter | Minimum | Maximum |
|---|---|---|
| Cells per axis | 1 | 32 |
| Cell pitch | 0.5 ft | 80 ft |
| Overall per axis | 2 ft | 400 ft |

If a request falls outside these ranges, the UI keeps the previous valid grid and shows the error. Values are not silently clamped.

Soft warnings (not hard failures):

- Cell product above 512: optimization and geometry evaluation may take longer.
- Overall volume above 576,000 ft³ (twice the 60 × 60 × 80 example): search cost rises if cell counts are also high.

### Dimension relationships

Per axis, and only on that axis:

- Overall = cell count × cell pitch
- Changing cell pitch recalculates overall and keeps the cell count
- Changing cell count recalculates overall and keeps the pitch
- Changing overall recalculates pitch and keeps the cell count

Unrelated axes are left alone.

### Grid locking

Users can unlock the grid, edit any supported dimension, and lock it again. Lock state is stored on the grid object and restored through `normalizeArchitecturalGrid` with saved sessions and designs. Invalid stored numbers fall back to the architectural example; valid custom numbers are kept.

---

## 2. Independence of letter size and cell pitch

Cell X, Y, and Z are spatial pitch. They do not enclose a letter. A letter may extend across multiple cells. The UI notes when the preferred footprint is larger than the smaller of Cell X and Cell Y.

- Changing cell pitch does not change letter-size controls or optimizer scale.
- Changing letter size does not change cell count, pitch, or overall dimensions.
- Slide attractor gaps (`xyGap`, `zGap`, `attractorGap`) still sync as shared spacing. They no longer drive letter footprint.
- Composition owns pitches and overall once the user edits the Fixed 3D Grid (`compositionGridOwned`). Slide cell counts can still be aligned without rewriting pitches.

---

## 3. Architectural letter-size presets

Letter size is the unrotated plan footprint in feet:

```
letterFootprintFeet = placement.scale × UNIT_LETTER_SPAN (0.92)
```

`UNIT_LETTER_SPAN` is the plan span of the unit letterform before scale. Thickness remains `letterThicknessPercent`. Axis scales (`scaleX` / `scaleY` / `scaleZ`) deform a letter only when “Preserve letter proportions” is off.

Presets are preliminary design guidelines. They are editable and are not hard geometric limits. Applying a height preset does not scale every letter in proportion to the selection height.

| Selection height | Minimum | Preferred | Maximum |
|---|---|---|---|
| 20 ft | 6 ft | 9 ft | 12 ft |
| 40 ft | 8 ft | 11 ft | 14 ft |
| 60 ft | 10 ft | 13 ft | 16 ft |

A 60 ft selection is expected to hold several letters, including letters of different sizes, rather than one glyph stretched to 60 ft.

### Independent letter-size controls

- Minimum letter size (ft)
- Preferred letter size (ft)
- Maximum letter size (ft)
- Letter-size variation (0–100%)
- Preserve letter proportions (on by default)

Variation samples around the preferred size and stays inside min/max. At 0%, letters stay at the preferred size. The optimizer can place different sizes in one composition. Original proportions are kept unless deformation is explicitly enabled.

Invalid combinations (minimum above preferred, preferred above maximum, non-positive sizes, variation outside 0–100) are reported and rejected. The previous valid sizes stay in place. Letters are not shrunk below the selected minimum to satisfy the grid or the selection box. When height routing is active, the optimizer no longer reduces `maximumLetterSize` to fit inside the selection volume.

There is no new maximum letter count and no required occupancy percentage. Empty cells remain allowed.

---

## 4. Letter legibility diagnostics

`evaluateLetterLegibility` runs as a soft diagnostic. It does not hard-reject a composition and does not introduce a new pass/fail threshold.

It reports:

- Empty source geometry (no meaningful L/U/V solids)
- Axis deformation when proportions are not preserved
- Extreme plan or vertical aspect (silhouette / orientation watch)
- Very small footprints (under 2 ft) at building scale
- Selection-boundary crossings that will be physically trimmed
- Overlap severity:
  - Modest intersection: informational (can be architecturally useful)
  - About 45–85% of the smaller AABB: watch
  - About 85% or more (near engulfment): compromised
- Large size disparity (largest footprint more than 3× the smallest)

The Composition panel shows a recognizability proxy, compromised count, watch count, and a short summary. The proxy is `1 − 0.25 × compromised − 0.05 × watch`, clamped to 0–1. It is a readout, not a gate.

---

## 5. Selection-volume compatibility

Phase 1 presets are unchanged:

- 20' W × 20' D × 20' H
- 20' W × 20' D × 40' H
- 20' W × 20' D × 60' H

Coordinate convention is unchanged: X = width, Y = depth, Z = height. In `SelectionVolume`, vertical height is `depth`.

These volumes are independent of cell pitch. A selection may cover many cells or cut through part of a letter. Search steps still reposition the window inside the source field. Height-routing and geometry-intersection behavior from Phase 1 are unchanged.

Changing the overall grid does not resize an active selection. If the selection no longer fits, it is clamped to the field and the UI states that the height-routed selection does not fit. User-defined height, position, and search steps are kept while they remain valid.

---

## 6. Slide / Composition synchronization

Shared from Slide into Composition rules:

- Letter thickness
- Y rotation enable and range
- XY gap, Z gap, and diagonal attractor gap

Owned by Composition after local grid edits:

- Cell counts
- Cell pitches
- Overall dimensions
- Letter size in feet
- Lock state

Before the user authors the Composition grid, Slide cell counts may still be absorbed. After that, Slide updates do not overwrite Composition pitches or overall size. Applying a height preset or resetting the studio marks the grid as Composition-owned.

Saved sessions and designs restore through `normalizeArchitecturalGrid` and the letter-size mapping on `GenerationRules`. New rule fields (`preferredLetterSize`, `letterSizeVariation`) are optional, so older sessions still load. Missing values fall back to the architectural defaults (~6 / 9 / 12 ft, 35% variation).

---

## 7. Performance

A larger overall field does not by itself create more letter instances. Instance count still follows cell count and the existing optimizer rules (placement, removal, repetition, repositioning). Users can use a large field with few cells, or a smaller pitch with more cells, within the ranges above.

Documented computational safeguards:

- Hard ranges in the table above, with an explicit error instead of a silent rewrite
- Soft warnings for cell product and overall volume
- No new occupancy quota, letter-count cap, or forced duplication when a selection is sparse

If a selected volume does not contain meaningful letter geometry, legibility reports that condition. Letters are not enlarged or duplicated to fill the volume.

---

## 8. Test and build results

Command (from the worktree):

```
node --require ./scripts/ts-test-register.cjs --test src/components/selectionHeightRouting.test.ts src/components/selectionFieldGeometry.test.ts src/components/architecturalGrid.test.ts
npx tsc --noEmit
npm run lint
npm run build
```

| Check | Result |
|---|---|
| Automated tests | 25 passed, 0 failed |
| TypeScript (`tsc --noEmit`) | Pass |
| ESLint | 0 errors, 31 warnings |
| Production build (`next build`) | Pass (14 static pages) |

### What the 25 tests cover

Phase 1 (existing):

- Three selection sizes, unresolved typology-to-height assignment, field validation
- Source-field expansion for 60 ft without stretching letter scales
- SelectionVolume preset lock and clear
- Deferred Phase 2 generator interface note
- AABB intersection classification, original transforms, Manifold trim of boundary crossings
- Legacy center-based selection when height routing is off
- Body intersection when height routing is on

Phase 1.1 (new):

1. Default 60 × 60 × 80 ft field fits 20 / 40 / 60 ft selections
2. Cell counts change independently
3. Cell pitches change independently and recalculate overall
4. Overall edit updates pitch and keeps cell count
5. Invalid grids are reported, not clamped
6. Footprint feet round-trip through scale
7. Height presets stay in the suggested ranges and do not require a 60 ft letter
8. Letters can be larger than one cell
9. Sampled scales stay inside min/max and can differ
10. Conflicting letter-size controls fail validation
11. Growing the overall field does not change the 20 × 20 × 40 selection size
12. Near-total letter overlap is flagged; a modest offset overlap is not marked compromised

### Lint

The Phase 1.1 `useMemo` warning in `CompositionStudio.tsx` (`rules.preferredLetterSize` missing from the dependency list) was fixed before this report.

Remaining ESLint warnings are pre-existing and outside this change: provenance and regression scripts, composition presentation, lattice, office/open-hall helpers, `PrototypeDemonstration.tsx`, `amphitheaterPrototype.ts`, and `UnifiedPrototype.tsx`. The build prints the same pre-existing warnings and still completes.

---

## 9. Dependencies for the other developer (Phase 2, not started)

These interfaces are ready for the proto-form generator. They were not wired into the protected generator files.

- `SelectionVolume.heightRouting`: `20 | 40 | 60 | null`
- Selection field size stays 20 × 20 × height; vertical size is `depth`
- Letter footprint in feet: `scale × 0.92`
- Optimizer scale range: `minimumLetterSize`, `preferredLetterSize`, `maximumLetterSize`, `letterSizeVariation`
- Boundary-crossing letters are classified for physical trim; fully inside letters keep their transforms
- `evaluateLetterLegibility` can run before selection and against a selection volume (trim warnings). It does not reject overlaps by itself
- Grid pitch and letter size are separate. Generator code should read letter scale from placements, not from cell size

Do not treat this report as authorization to edit `UnifiedPrototype.tsx`, `letterIntersectionSpaces.ts`, `moduleEnvelope.ts`, typology rules, or Lattice Studio.

---

## 10. Review notes

- Nothing has been committed. HEAD is still `362fc41`.
- Review the unstaged and untracked files listed above, then say if this should be committed.
- Phase 2 generator integration has not been started.
