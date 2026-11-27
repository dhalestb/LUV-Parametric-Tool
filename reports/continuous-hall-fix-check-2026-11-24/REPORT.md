# Continuous Hall fix check — November 24, 2026

**No Continuous Hall source-overlap fix was found in the current pushed branches. Nothing was integrated.**

The current GitHub heads were read directly with `git ls-remote`: 27 branches, 24 distinct tips. All older heads still match the previously investigated references; the newer code tips and their diffs were inspected through the GitHub connector. The public default branch is still the October production baseline, so its commit list alone was not treated as the development history.

## Relevant newer push

`feature/envelope-typology-development` now points to [`9542fcadb2847749bbea1ff464de472cf688f5b2`](https://github.com/dhalestb/LUV-Parametric-Tool/commit/9542fcadb2847749bbea1ff464de472cf688f5b2), “Score lobby floors by ceiling height and keep linear to its 5 ft floor.” The commit date is November 23, 2026, 9:57:24 PM America/New_York (November 24, 02:57:24 UTC).

This changes six Evaluations files:

- `src/components/evaluations/ArchitecturalEvaluations.tsx`
- `src/components/evaluations/descriptorVersion.ts`
- `src/components/evaluations/openVolumeCache.test.ts`
- `src/components/evaluations/v4/evaluateV4.test.ts`
- `src/components/evaluations/v4/evaluateV4.ts`
- `src/components/evaluations/v4/surfaces.ts`

The changes count covered Lobby floors with at least 7 ft of clear height, use a 7.5-ft sampled clear width for Lobby Open Volume scoring, retain separated parts of qualifying floors, and count Linear's 5-ft floor as one floor. Continuous retains two qualifying floors for scoring. These are analysis/scoring rules applied to an existing architectural mesh. They do not change source-letter placement, negative spacing, glyph geometry, envelope generation or pairwise source-collision acceptance.

The range from the audited engine commit `bf7fc3c8a9235fc3d4910b7b266821d484af93bf` to this tip contains two commits and 103 changed files, chiefly evaluation code, tests and review graphics. **None of the 27 files in the verified private Lobby runtime package changes in that range.** The six-file scoring change is therefore not an overlap fix hidden within a larger generator update.

Other recent pushed tips were also distinguished from the requested fix: `332709e` contains Evaluations work; `58df1c1` contains the already identified Open Hall / Flat Workspace changes; `aec2db5` is the already supplied envelope handoff. None is a new Continuous Hall source-overlap correction. The published overlap audit branch still points to `2ff9c42`.

## Direct source check against the overlap findings

The following files were fetched at the exact `9542fca` tip and compared byte-for-byte with the pinned runtime used in the overlap audit:

| Source file | Git blob | Finding |
|---|---|---|
| `src/components/lobbyProof.ts` | `6acd0a63fd44891ef0f5bed043d2b8fc7bb5b929` | Exact match |
| `src/components/letterGeometry3d.ts` | `8ac2af737b00e92dbbf97e6642cbd897b88c3665` | Exact match |
| `scripts/source-lobby-envelope.cjs` | `8b094a2c9eb3c477892f1c04d2444077f337a6dc` | Exact match |
| `scripts/source-envelope.cjs` | `06ff8a770a2aa52909213b38e126250b0ecaad2a` | Exact match |
| `proof/rule-validation.cjs` | `c5fac09608e3f419a4daa6c75242f29249602bbf` | Exact match |

`OVERLAP = 0.45` remains in `lobbyProof.ts`, and `placeLong` still defaults to `gap = -OVERLAP`. Continuous Hall still calls that function without overriding the gap. The native validator remains an architectural mesh/source-pose-preservation validator; the newer scoring clearance gates do not add a source-letter penetration cap.

The unchanged eight-letter record still has six measured positive-volume source overlaps, with a maximum of **19.1975%** of the smaller letter's volume, compared with **3.4162%** in approved Study 10. The saved record hash and all previously audited source/glyph inputs are unchanged. These are the prior exact-solid intersection measurements, now tied to byte-identical current remote generator files; no new geometry or substitute study was generated for this check.

The existing architecture's native validation pass does not approve that source-letter penetration magnitude. The developer question—whether that depth is intentional and what limit should apply to new designs—remains unanswered by the pushed code.

## Integration disposition

Do not integrate the scoring commit as a Continuous Hall generator fix. It would introduce unrelated Evaluations behavior and leave the audited overlap untouched.

A future candidate should explicitly state its permitted penetration rule or limit, address the same eight-letter L/U/V test case, preserve the approved source arrays and saved meshes, and include checks across quantities, sizes and compositions. Its architectural validity, containment and versioned regeneration behavior should then be audited separately before any selective integration.

## Preservation and scope

- No checkout, fetch into the shared Git database, merge, cherry-pick, commit, push, install or deployment occurred.
- No application code or engine package was edited. Candidate source text was retained only as audit evidence, never installed or executed.
- No generation API was called; no study was regenerated or saved.
- All 1,012 protected files from the overlap checkpoint remain byte-identical, including saved records and existing Presentation Board/review images. Local development branches, remote-tracking refs, tags, stash and registered worktrees also match the preservation checkpoint. Codex's automatically created turn-capture safety refs are excluded from that development-ref comparison.
- This is a check of currently pushed branch tips and their relevant source/diffs. It does not establish whether the developer has an unpublished local fix.

See `checks.json` for byte comparisons and preservation results; `remote-evidence.json` contains the observed heads, commit summaries, full range file list and five exact source snapshots used for comparison. This local report was not pushed.
