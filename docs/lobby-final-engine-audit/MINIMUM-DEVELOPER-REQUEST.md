# Minimal request after the exhaustive local/source search

> Publication copy: personal filesystem paths have been replaced with relative source locations or storage descriptions. Original local audit documents are unchanged. Only these two Markdown reports are published; referenced audit evidence remains local.

## Tested source reference

- Repository: [dhalestb/LUV-Parametric-Tool](https://github.com/dhalestb/LUV-Parametric-Tool)
- Source branch: `feature/envelope-typology-development`
- Tested source commit: `bf7fc3c8a9235fc3d4910b7b266821d484af93bf`
- Envelope engine: [`scripts/source-lobby-envelope.cjs`](https://github.com/dhalestb/LUV-Parametric-Tool/blob/bf7fc3c8a9235fc3d4910b7b266821d484af93bf/scripts/source-lobby-envelope.cjs)

All five typology definitions and placement implementations are present in the supplied ZIP. No replacement placement implementation is requested.

The coherent bf7fc3c package is present locally and functional. It reproduces Vertical Final (26) and Continuous Hall Final (10) exactly from their saved source poses. Linear (77), Compressed (66) and Topographic (65) pass strict mesh validation under that package but produce different architecture from the approved exports.

Please provide:

1. **The exact scripts/source-lobby-envelope.cjs used for Studies 77, 66 and 65**, plus any local files it imports that changed. If this file was unchanged, please explicitly confirm its blob SHA **8b094a2c9eb3c477892f1c04d2444077f337a6dc** / SHA-256 **ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b** and identify the remaining final pipeline/version differences. We located only this existing engine revision after searching worktrees, branch histories, reflogs and exports.
2. **The actual final fitting/save/export call site for Compressed**, or its exact call order and settings. In the published application the relevant paths are src/components/AmphitheaterStudio.tsx and src/app/api/amphitheater/route.ts; focused handlers are sufficient. The ZIP already contains fitLobbyLettersToArchitecture, adjustOpeningToLetters and the updated enforceCompressedClearHeight helper. Specify whether their output changes stored architecture, only viewport geometry, or the exported snapshot, and whether validation runs before or after this step.
3. **Final dependency/commit confirmation for the unresolved cases:** source-profile-envelope.cjs / featurePoints, source-vertical-envelope.cjs / upperTriangles, and the dependency lock/Node version. These implementations and all required packages already exist locally; send source only if changed, otherwise confirm their hashes/revision. Do not recreate functions or send all five implementations again.

No additional study JSON, architecture meshes, screenshots, lobbyProof.ts, letterGeometry3d.ts, source-envelope.cjs or worker are needed unless they have changed since the ZIP. Existing final configurations remain authoritative and must not be regenerated or overwritten.
