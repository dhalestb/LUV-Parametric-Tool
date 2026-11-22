# Lobby engine location and functional compatibility audit

> Publication copy: personal filesystem paths have been replaced with relative source locations or storage descriptions. Original local audit documents are unchanged. Only these two Markdown reports are published; referenced audit evidence remains local.

## Tested source reference

- Repository: [dhalestb/LUV-Parametric-Tool](https://github.com/dhalestb/LUV-Parametric-Tool)
- Source branch: `feature/envelope-typology-development`
- Tested source commit: `bf7fc3c8a9235fc3d4910b7b266821d484af93bf`
- Envelope engine: [`scripts/source-lobby-envelope.cjs`](https://github.com/dhalestb/LUV-Parametric-Tool/blob/bf7fc3c8a9235fc3d4910b7b266821d484af93bf/scripts/source-lobby-envelope.cjs)

## Conclusion

**The supplied ZIP contains all five typology definitions and working placement implementations. A complete executable older generator package also exists locally.** It is inaccurate to describe all five generators or all architectural generation as missing.

The complete pinned package is at:

~~~text
integration/vendor/lobby-bf7fc3c
~~~

Using this package unchanged, **Vertical Final (26) and Continuous Hall Final (10) are reproduced exactly from their saved poses**: architecture positions/indices, letter meshes and boundary reports all match. The other three produce valid meshes but fail approved-final geometry parity. No newer complete final-revision package was located in the searched folders, worktrees, branches or exports.

The remaining issue is a **matching final solid/fitting pipeline for Linear, Compressed and Topographic**, not missing five letter-placement implementations. This supersedes the broader language of the earlier source-gap report. A failure of the old package to match a newer final does not, by itself, prove that every engine/helper file was changed; final source provenance and call order remain necessary.

## Search performed

- Six broad source roots: 
  - Local project and document directories
  - Registered Codex worktree storage
  - Supplied attachment storage
  - Desktop export storage
  - Cloud-synced local source/export storage
  - Design-course project and archive storage
- **24 registered worktree locations across 3 independent Git databases**: 17 in the main LUV repository, six in the separate earlier-assignment repository, and the wrapper repository. Checked working files, staged indexes, local/remote refs, reflog-retained history and code markers, including possible alternate filenames.
- **92 Git refs** across those databases. The current source remote has **22 heads**; a read-only ls-remote check confirmed every tip matches a locally available object already searched. No fetch or reference update was performed.
- GitHub also checked scripts/source-lobby-envelope.cjs on all 22 source-remote branches: only feature/envelope-typology-development contains it, at blob 8b094a2c9eb3c477892f1c04d2444077f337a6dc. All relevant branch-content/history matches point to bf7fc3c, the 2026-11-17 checkpoint.
- **39 ZIP paths**, including backup duplicates, with **917 source entries inspected in place**. This includes the supplied final ZIP, Workspace handoff, reconciliation archive, source checkpoints, older project-source packages and geometry exports. No archive read errors or oversized eligible source entries were skipped.
- Relevant LUV downloaded JSON exports were searched for embedded engine/source markers; none were found. Node/package folders, Git object folders, Python environments and generated Next caches were excluded from ordinary filesystem traversal; Git objects and archive source entries were inspected through their own read-only mechanisms.

The search found **two actual physical engine copies with one identical content hash**:

- integration/vendor/lobby-bf7fc3c/scripts/source-lobby-envelope.cjs
  - SHA-256 ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b
- reports/lobby-integration-readiness-2026-11-21/source/scripts/source-lobby-envelope.cjs
  - SHA-256 ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b

The only Git-history engine blob is that same version. Archive scans found the supplied newer placement/glyph/driver code but no additional engine. Text hits in the new audit's own scanner were classified as diagnostics, not mistaken for another generator. No source-search access errors remained within the scoped roots after excluding unrelated dependency folders. This is a bounded search of available development locations, not a claim about the developer's separate computer or unpublished repository.

## What is present

| Module / functions | Located implementation | Finding |
|---|---|---|
| lobbyProof.ts: five LOBBY_TYPOLOGIES, populateLobby and five placement branches | ZIP and pinned archive/private package | All present. ZIP placement executes without any architectural engine. Only Linear's placement branch differs from pinned; Vertical, Compressed, Continuous and Topographic branch bodies match. |
| applyLobbyZLevels | ZIP lobbyProof.ts | Present and operational; four levels at 10 ft exactly construct the approved Topographic source Z groups. No missing level-placement function. |
| outlineRelationships | Both lobbyProof revisions | Present; normalized body unchanged. |
| fitLobbyLettersToArchitecture, adjustOpeningToLetters, controllingOpening, enforceCompressedClearHeight | ZIP and pinned lobbyProof.ts | These are geometry-fitting functions, not merely letter definitions. Wrapper bodies are present; the ZIP changes the clear-height helper to 10 ft and model-wall treatment to 0.5 ft. Final fitting/save call order remains unresolved. |
| getLetterShape, getLetterVolumeGeometry, linearUBend, linearUInnerHalf, LINEAR_U_* constants | Newer ZIP letterGeometry3d.ts | Present. Variable U opening, 1-ft width and 4-ft bow code is available; it is not installed in the older private live package. |
| derive, buildSource | ZIP source-envelope.cjs; older pinned driver | Present. ZIP derive uses the newer Linear U geometry. buildSource calls the separate lobbyEnvelope engine. |
| lobbyEnvelope, contourOf, orientedCut, planOf, sleeveOf, loftFits, letterBox, floatSafe and supporting functions | Pinned scripts/source-lobby-envelope.cjs | Complete, functional older solid engine. One shared entry point handles all five, with a Compressed branch. No newer source revision found. |
| featurePoints / upperTriangles | Private pinned source-profile-envelope.cjs / source-vertical-envelope.cjs; other project helpers | Present. Final matching revisions for the three nonmatching cases are not established by the ZIP. |
| Worker, TypeScript loader, proof/rule-amphitheater.cjs, proof/rule-validation.cjs and supporting modules | Four-file ZIP includes worker; complete dependency closure exists in private package | Nothing is missing from the tested older runtime closure. The worker invokes the strict full validator. ZIP alone is not a standalone runtime tree. |
| Saved source arrays, transforms, field dimensions, original architecture/letter meshes | All five supplied final studies | Present and unchanged. These permit exact reopening and source-preserving verification; default placement is not substituted for these arrays. |

The ZIP source modules' type-only imports do not constitute missing runtime architectural functions. Standalone ZIP placement testing used its own unchanged placement and glyph files, the installed Three package and an in-memory TypeScript loader. No older solid engine was attached to that ZIP pair.

### Actual runtime dependencies

Test Node: v24.21.0. Installed versions match the pinned Git lock and the current integration lock:

| Package | Pinned lock | Installed |
|---|---|---|
| three | 0.186.0 | 0.186.0 |
| manifold-3d | 3.5.3 | 3.5.3 |
| three-mesh-bvh | 0.8.3 | 0.8.3 |
| typescript | 5.9.3 | 5.9.3 |
| sharp | 0.35.4 | 0.35.4 |

Matching versions were found in the existing installations listed in runtime-dependencies.json. No package was installed, upgraded or substituted. The final export's exact historical runtime is not recorded, so runtime provenance is still a confirmation item for unresolved parity; there is no demonstrated missing third-party package on this machine.

## Placement comparison against the approved configurations

All tests call original supplied functions; no placement rule was reconstructed.

| Final | ZIP placement result | Interpretation |
|---|---|---|
| 77 — Linear | **Exact source-pose match**, 15 letters, field 40 × 20 × 20, preferred 13, enabled L/U | New Linear placement implementation is already supplied and works. No seed or new placement code is needed for this recipe. |
| 65 — Topographic | **Exact source-pose match** after the supplied applyLobbyZLevels(source, field, 4, 10) operation | Four-level operation and all non-Z poses are available. This is a demonstrated construction of the saved data, not a claim to recover the original UI click history. |
| 26 — Vertical | **Exact source-pose match** from both ZIP and pinned populateLobby, 10 letters in 40³, preferred 13 | Existing placement fully reproduces the final configuration. |
| 66 — Compressed | Placement branch bodies match in both revisions; independently populated values differ from the stored configuration by up to 8.54e-7 degrees in one rotation, with position deltas about 8.15e-9 ft | No missing placement branch. No tolerance was relaxed or stored pose replaced; architectural tests below use the exact saved array. |
| 10 — Continuous | Both supplied revisions contain the same placement branch, but tested defaults (including U/L-only input) do not reproduce the approved edited poses | The final array is supplied. Use it for faithful reopening/regeneration; do not claim the default arrangement is the final. The solid engine can reproduce the final from those supplied poses. |

See zip-placement-tests.json, pinned-placement-tests.json and function-analysis.json for exact comparisons. No ZIP driver/engine combination was assembled or executed.

## Architectural generation tests — unchanged complete pinned package

Each exact saved request was copied into a new audit output folder and submitted directly to the **unchanged** pinned worker. The application API/store was not used. All 27 pinned files were hash-checked before testing. No revision was mixed with newer ZIP source, no architectural function was rewritten, and no validation threshold changed.

| Approved final | Strict mesh validation | Approved triangles → generated | Exact architecture arrays | Letter meshes |
|---|---|---|---|---|
| 77 — Linear Gallery Lobby | Passed; zero intersections/overlaps | 7306 → 6650 | Different | Different |
| 66 — Compressed Sequential Lobby | Passed; zero intersections/overlaps | 2716 → 2632 | Different | Exact match |
| 65 — Topographic Lobby | Passed; zero intersections/overlaps | 9018 → 9134 | Different | Exact match |
| 26 — Vertical Void Lobby | Passed; zero intersections/overlaps | 4194 → 4194 | **Exact match** | Exact match |
| 10 — Continuous Hall Lobby | Passed; zero intersections/overlaps | 7754 → 7754 | **Exact match** | Exact match |

**Vertical and Continuous:** architecture positions and indices, letter meshes and boundary reports all match exactly. This is direct evidence that a final-compatible architectural engine for these cases already exists.

**Linear:** pinned replay has different glyph meshes, a U contour coordinate difference up to about 2.884 ft, and different architecture. The ZIP already supplies the newer glyph/derive path and exact placement. The old engine's contourOf calls getLetterShape(letter) without the extended Linear U parameters, and its only typology-specific branch is Compressed. Matching final contour/sweep/roof behavior is not demonstrated by that older source. This establishes an unresolved matching-engine/driver pipeline, not absence of the supplied placement implementation.

**Compressed:** source letter meshes and bounds match, but the solid differs substantially: the original measured volume is about 1,710.278 ft³ versus 9,117.578 ft³ in the pinned replay. The 10-ft / 0.5-ft fitting implementation is present in the ZIP. Which fitted geometry was saved/exported, and at which validation stage, is not established by the four supplied modules. A new fitting function should not be requested; the authoritative fitting/save wiring is the gap.

**Topographic:** letters and overall bounds match; the original has 9,018 triangles and the replay 9,134, with measured volumes about 15,442.862 and 15,449.281 ft³. This is a real geometry mismatch, not just vertex ordering. No cause is invented: the matching engine/helper/runtime provenance must explain it before accepting final-rule parity.

Previous preserved tests also show two new valid populations (six and seven letters) per type with this same pinned package. Therefore **available code can generate new validated architecture for all five under the pinned rules**. Mesh validity does not establish the newer final architectural rules for the three counterexamples above. Default-pose generation and exact saved-pose reproduction remain separate tests.

## Exact missing / unresolved handoff

1. **scripts/source-lobby-envelope.cjs — matching final revision or explicit hash confirmation.** This file is not absent everywhere; the older complete implementation is present. No alternative final revision was located. Ask for the version used by Studies 77/66/65, or confirmation that the existing blob is unchanged together with the pipeline explanation needed to resolve those mismatches.
2. **The actual final Compressed fitting/save/export handler**, with exact call order and settings. The known published locations are src/components/AmphitheaterStudio.tsx and src/app/api/amphitheater/route.ts; a focused handler is sufficient. The actual exporter filename, if a separate exporter transforms the mesh, was not supplied and is not guessed here.
3. **Conditional confirmation, not blanket missing implementations:** final hashes of source-profile-envelope.cjs / featurePoints and source-vertical-envelope.cjs / upperTriangles, plus final commit/lock/Node provenance. Supply files only if changed. Existing loader/validator/third-party packages resolve and work; do not request replacement copies without a demonstrated version change.

No additional lobbyProof.ts, letterGeometry3d.ts, source-envelope.cjs, worker, final study data or OBJ/GLB export is currently required unless the developer has changed those already supplied files. [MINIMUM-DEVELOPER-REQUEST.md](MINIMUM-DEVELOPER-REQUEST.md) is deliberately narrower than the earlier handoff.

## Preservation and limits of the investigation

- **876 existing application/code/data files checked; zero changed.** This includes 286 existing architecture records, all approved assets/generated studies and 103 private generator files. No application code, shared generation rule, Presentation Board or saved study was modified.
- All searched Git refs remain unchanged from the start: true. No checkout, fetch, reset, stash, merge, commit, push or deployment occurred.
- Architectural replay outputs exist only under this new audit directory. Approved files were rehashed before/after; no result was written to .amphitheater-runs or data/lobby-generated.
- ZIP placement modules were tested separately from the intact older architectural package. No mixed-revision generator was created, and no missing function was reconstructed.
- Searches cover the listed available roots and refs. They do not rule out an unpublished working copy on another developer's machine. Historical final runtime and the remaining final saving/fitting stage are unverified.

## Evidence

- file-search.json, content-search.json, physical-candidates.json, worktrees.txt
- repository-search.json, complete-branch-search.json, remote-heads.txt, remote-tip-comparison.json
- remote-branch-engine-search.json and remote-0.json through remote-3.json
- archive-search.json (all 39 paths and every source hit)
- function-analysis.json and runtime-dependencies.json
- zip-placement-tests.json / pinned-placement-tests.json
- pinned-package-functional-tests.json, mesh-diagnostics.json and per-study temporary outputs
- preservation.json and application-before.json
