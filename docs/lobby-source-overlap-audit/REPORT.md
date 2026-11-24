# Lobby source-letter overlap audit — November 24, 2026

> Publication copy: this report and [numerical evidence](evidence.json) are published for developer review. The original local audit is unchanged. No application code, saved-study geometry or Presentation Board is included.

The pinned placement file matches Git blob `6acd0a63fd44891ef0f5bed043d2b8fc7bb5b929` at [the developer source revision](https://github.com/dhalestb/LUV-Parametric-Tool/blob/bf7fc3c8a9235fc3d4910b7b266821d484af93bf/src/components/lobbyProof.ts). `vendor/lobby-bf7fc3c/` paths below identify the corresponding isolated integration package.

Vertical Void's overlap is explicitly intentional under its supplied rules. Continuous Hall's overlaps are deliberately produced by the original placement implementation and also occur in its approved saved study, but its written rules do not specify an allowed overlap amount. The fresh Continuous Hall candidate has substantially greater interpenetration than that approved example. Treat that magnitude as a placement-rule/design-review issue, rather than certifying it from a mesh-validation pass.

During the read-only investigation, no application code, source engine, saved study, geometry, existing report or Presentation Board was changed. No generation API was called and no new architectural record was created. This subsequent publication adds only two documentation files on a dedicated branch; no merge or application deployment is part of it. The local diagnostic script and preservation inventory remain local.

## Measured evidence

All unordered pairs of the actual saved source-letter solids were intersected with Manifold. These are positive-volume intersections, not merely overlapping bounding boxes or numerical contact flags. Every positive pair is adjacent in the letter sequence; no nonadjacent collision was found in either fresh candidate or either approved original.

| Typology / saved case | Positive source pairs | Largest pair volume, ft³ | Largest overlap as percentage of the smaller letter |
|---|---:|---:|---:|
| Vertical Void, new eight-letter design | 1 | 0.128914 | 0.2553% |
| Vertical Void, approved Study 26 | 4 | 0.124660 | 5.1826% |
| Continuous Hall, new eight-letter design | 6 | 19.305010 | 19.1975% |
| Continuous Hall, approved Study 10 | 12 | 0.272630 | 3.4162% |

Percentages are calculated separately for each intersecting pair: intersection volume divided by the smaller member's full solid volume. They measure material interpenetration, not clearance or engineering adequacy. The different letter quantities, fields, sizes and poses mean that raw overlap volumes are not a controlled, like-for-like acceptance comparison.

The fresh Vertical Void pair is **L-7 / U-8**. Its bounding intervals overlap by 0.296980 ft along Z; the actual outline intersection occupies only 0.128914 ft³.

The fresh Continuous Hall pairs are:

| Pair | Intersection, ft³ | Percentage of smaller letter |
|---|---:|---:|
| L-2 / V-3 | 13.766717 | 13.6901% |
| V-3 / U-4 | 19.037800 | 17.3377% |
| U-4 / L-5 | 19.305010 | 19.1975% |
| L-5 / V-6 | 13.766718 | 13.6901% |
| V-6 / U-7 | 19.037808 | 17.3377% |
| U-7 / L-8 | 0.978742 | 0.9733% |

All six have 0.405 ft of X-bound overlap. There is no triple-count interpretation in the pair table; the independent union measurement is also retained in evidence.json.

## Vertical Void — explicit approved intent

The verified private `vendor/lobby-bf7fc3c/src/components/lobbyProof.ts`, lines 277–285, includes:

> Letters stack on one vertical axis and intersect slightly. The overlap replaces bridges.

Line 425 declares `OVERLAP = 0.45`. `populateLobby`, lines 578–603, subtracts that constant from successive Z placement: previous center + half of each letter's bounding height − overlap. `center` translates the assembly, then `fitInside` uniformly scales positions and letter sizes.

For this eight-letter candidate, field fitting applies a factor of 0.659954495; the nominal 0.45-ft overlap becomes 0.296979523 ft. Whether the actual letter outlines occupy the shared bounding interval depends on their rotations and concave contours. Therefore seven neighboring bounding intervals do not imply seven positive-volume solid overlaps. Only L-7 / U-8 actually intersects.

The new measured overlap is consistent with the explicitly specified intersecting-stack behavior. It is not evidence of an integration defect, wrong glyph revision, or failed architectural Boolean operation.

## Continuous Hall — intentional implementation, unspecified magnitude

Its written rules, lines 303–312 of the same file, describe U/L/V order, equal letter size, horizontal end letters, 15° wall rotations, and a 2:1:1 field. Unlike Vertical Void, they do not explicitly mention intersecting letters or state an overlap limit.

`populateLobby`, lines 666–670, calls `placeLong` with no gap override. `placeLong`, lines 471–486, deliberately defaults to `gap = -OVERLAP` and adds that gap to successive X positions. The 0.45-ft negative gap is reduced by the candidate's 0.9 field-fit factor to 0.405 ft. The generator does not perform a pairwise source-collision correction afterward.

This behavior is present in the verified legacy placement package. The fresh source poses replay exactly from it, and its matching glyphs and transforms reproduce every saved letter mesh exactly. The integration did not add the negative spacing, move these letters, duplicate them, or enlarge the saved glyphs.

Approved Study 10 already contains 12 positive-volume overlaps, so overlap itself cannot be classified as a newly introduced error or a violation of a universal nonoverlap rule. However, the fresh candidate's maximum 19.1975% interpenetration is materially larger than the approved example's 3.4162%. The five internal fresh pairs range from 13.69% to 19.20%; this is not just coincident surfaces or contact noise.

The fresh arrangement also differs from Study 10 in more than count: it uses eight L/U/V letters at preferred size 13 ft, while Study 10 stores fifteen L/U letters at preferred size 9 ft and different U orientations. Thus Study 10 demonstrates that intersections were tolerated in the saved final; it does not approve the specific new L/U/V contacts or their depth. The source package's default placement is not a recipe that exactly recreates every manually saved final pose.

**Disposition:** intentional negative-gap behavior in the supplied implementation, with an unspecified acceptable extent. The increased overlap is a limitation of the existing placement rule that warrants developer/design confirmation. It is not an architectural-mesh corruption or newly introduced adapter bug. The available evidence does not justify claiming the fresh Continuous Hall contacts are visually approved, or claiming that any positive overlap must be an error.

The targeted developer question is whether Continuous Hall should use a fixed negative gap for all supported sizes/compositions, and what maximum penetration/contact rule is intended for the new L/U/V arrangement. This does not require requesting another copy of the already verified envelope engine.

## Controlled cause check

For each fresh candidate, the unchanged original placement was replayed in memory and compared exactly with its saved source poses. The saved source meshes were also reproduced exactly using the pinned `getLetterVolumeGeometry(letter, 12)` and the original worker's source transformation formula.

A separate diagnostic copy of that placement module was compiled in memory with only `OVERLAP = 0.45` changed to `OVERLAP = 0`; the original field-fitting logic still ran. This removed all positive-volume source intersections in both fresh arrangements. No diagnostic pose or mesh was saved as an architectural study, and no package source was edited. This identifies the original spacing rule as the cause. It is not a proposed fix: eliminating those contacts would change the intended Vertical Void relationships and could change the resulting architecture.

## What the existing validator establishes

`vendor/lobby-bf7fc3c/proof/rule-validation.cjs` reads the combined architectural mesh at lines 6–13, tests that mesh for prohibited triangle crossings/positive-area coplanar overlaps at lines 50–65, and checks source-pose preservation at lines 90–96. It does not intersect each pair of source-letter solids or impose a source-letter penetration limit.

Both fresh records retain their native passing validation, a single connected Manifold architectural solid, and zero prohibited architectural self-intersections. Those results do not assert that the source letters are disjoint or that their overlap magnitude meets an unstated design limit. Architecture validity and source-arrangement approval are distinct findings here.

## Revisions and preservation

Both typologies use engine `bf7fc3c`, source commit `bf7fc3c8a9235fc3d4910b7b266821d484af93bf`. All 27 files of that private package match the verified manifest. Its envelope SHA-256 is `ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b`.

Fresh records examined:

- Vertical Void: `a0462c5d-8882-42d1-881c-dad25e557eea`.
- Continuous Hall: `12eb8d26-78e1-45b9-a0de-75a8c221f696`.

Approved originals examined: Studies 26 and 10. All twenty immutable approved assets still match their established hashes. A before/after digest check of 1,012 protected files found zero changes, covering current application source, private packages, data records, existing architectural result records, public review assets and existing report images. Presentation Boards and the current review pages remain unchanged.

See [evidence.json](evidence.json) for every pair, exact volumes, intersection bounds, glyph/pose reproduction checks, and the unsaved zero-gap diagnostic. The detailed protected-file digest inventory (`preservation.json`) remains local; the published evidence includes the preservation counts and zero-change result.
