# Versioned Lobby integration review checkpoint

This branch publishes the completed isolated Proto-Form Lobby integration and its required preserved interface, presentation and Workspace baseline dependencies. It is based on `d40fbc7eef38ac19f5bd51fe3bb3beca89b690ec`. It does not merge the developer's newer Workspace or Evaluations branches. No application deployment, branch merge or pull request accompanies this checkpoint.

## Run a separate review copy

Use a new directory so existing development files and studies remain untouched. Node v24.21.0 was used for the recorded checks. Install the committed lockfile; do not copy a different developer's helpers over the versioned packages.

```powershell
git clone -c core.longpaths=true --single-branch --branch codex/lobby-versioned-integration-2026-11-24 https://github.com/dhalestb/LUV-Parametric-Tool.git LUV-Lobby-Review
Set-Location LUV-Lobby-Review
npm ci
node scripts/lobby-integration-smoke.cjs
node scripts/lobby-integration-smoke.cjs --replay
npm run dev -- --hostname 127.0.0.1 --port 3015
```

If port 3015 is already occupied, use another port and substitute it in the local review links. The historical evidence refers to the original 3014 server and its 3015 alias; those server processes are not required by this branch. The smoke script checks package hashes, saved originals, all published Lobby derivatives and board PNG metadata. `--replay` also reproduces the five approved configurations and five separate newer eight-letter designs using private workers in temporary directories, without saving or modifying any architectural record.

- [Proto-Form Generation](http://127.0.0.1:3015/amphitheater)
- [Approved-study comparison: choose one typology and board](http://127.0.0.1:3015/reports/lobby-comparison-review-2026-11-24/)
- [New eight-letter designs: choose one typology and board](http://127.0.0.1:3015/reports/lobby-new-design-review-2026-11-24/)
- [Earlier seven-letter designs](http://127.0.0.1:3015/reports/lobby-versioned-integration-2026-11-23/)

Each board shows one typology. The published 15 board PNGs preserve the existing 4096 × 5156 pixel exports and 300 ppi metadata. Live Presentation & Export uses the existing selectable export resolution and focused rule illustrations. The five approved original Lobby studies are immutable references; Generate Design, New Design and Regenerate Architecture save separate derivatives.

## Verified engine routing

| Typology | Engine package | Verified envelope SHA-256 |
|---|---|---|
| Vertical Void Lobby | `vendor/lobby-bf7fc3c` | `ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b` |
| Continuous Hall Lobby | `vendor/lobby-bf7fc3c` | same original engine |
| Compressed Sequential Lobby | `vendor/lobby-bfce854` | `bfce854844db696eb3c3759a36d90cfb4d3ed418432fc9aff15f08db6b5dec4d` |
| Topographic Lobby | `vendor/lobby-bfce854` | same newer engine |
| Linear Gallery Lobby | `vendor/lobby-bfce854` | same newer engine |

The original engine source commit is `bf7fc3c8a9235fc3d4910b7b266821d484af93bf`; the newer byte-copy handoff is `aec2db587c5bd6a7b169cb2d6f389f7f964405ab`. Each engine has its own complete 27-file dependency package. The API verifies all package hashes from `src/server/lobbyEngineManifest.json`. Saved metadata records the revision; regeneration uses the parent's revision and rejects a revision switch. Historical v1 derivatives retain their original engine identity. No global glyph or envelope engine is replaced by a Lobby package.

The branch contains 58 saved Lobby derivatives, the five approved originals with their 20 hashed assets, preserved Gathering references, and the existing presentation review catalog. Shared interface/presentation files and the existing Workspace module isolation are included because the previously completed local integration imports them. The existing 15-option selector, family controllers and original board renderer are retained. These dependencies are not the newer Open Hall/Flat Deep Plan improvements on the developer's separate branch.

## Findings and review limits

**Continuous Hall still needs a developer decision:** the newer eight-letter design has a maximum source-pair overlap of **19.1975%** of the smaller letter's volume, versus **3.4162%** in approved Study 10. Its placement code intentionally uses negative spacing, but the approved rules do not define an overlap limit. Mesh validity does not resolve architectural acceptability. No source-overlap fix was found in the November 24 remote audit; no limit, placement change or generic substitute was introduced. See the [overlap report](../../reports/lobby-source-overlap-audit-2026-11-24/publication/REPORT.md) and [developer-push audit](../../reports/continuous-hall-fix-check-2026-11-24/REPORT.md).

Compressed uses the stored pre-fit architecture. The developer's viewport-only letter fitting/clear-height adjustment is not silently baked into saved meshes or board exports. All five approved configurations reproduce exact architectural geometry, letters, source poses and components with their assigned engines.

Previous validation covered two new arrangements per typology, exact regeneration/reopening, edited-pose regeneration, package and provenance guards, native strict mesh validation, source overlap measurements, actual field containment and connected components. [Implementation report](../../reports/lobby-versioned-integration-2026-11-23/REPORT.md), [API evidence](../../reports/lobby-versioned-integration-2026-11-23/api-validation.json), [geometry measurements](../../reports/lobby-versioned-integration-2026-11-23/geometry-measurements.json), [Workspace regression](../../reports/lobby-versioned-integration-2026-11-23/workspace-regression.log).

The existing repository is not production-build clean: the recorded comparison has 54 baseline TypeScript diagnostics, 54 current diagnostics and zero new diagnostics. Next compilation passed, followed by existing lint failures. These failures were not disabled or repaired as part of publishing. The native checks do not certify structural or circulation suitability, or all arbitrary parameter combinations. Future rejected candidates remain visible failures.

## Publication scope

Only the isolated publication checkout was staged, committed and pushed. Original application worktrees, branch heads, indexes, saved studies and Presentation Boards were not edited. Private local user paths were removed only from the published report copies; original audit reports remain unchanged. Credentials, `.env` files, ZIP archives, dependency installations, build caches, checkpoint inventories and unrelated uncommitted proof geometry are excluded. Byte-preserving Git attributes protect the versioned packages, approved data and binary evidence on checkout.

See [publication verification](PUBLICATION-VERIFICATION.json) for this checkout's replay results and publication file scope. The earlier reports describe their original validation dates; they are evidence, not a claim that every historical command was rerun during publication.
