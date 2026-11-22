# Source verification of nine architectural review locations

Open [the illustrated nine-location review](../../public/centralized-source-review/index.html) or its [full-precision matrix](../../public/centralized-source-review/comparison-matrix.json). The guide documents the supported floor area, qualified headroom area, clear patch diameter, boundaries, sampled overhead face, crossing trials and specific architectural decision for each location. A separate [overview](../../public/centralized-source-review/three-priority-regions.png) compares the three priority locations.

The reference is commit `f7ae1e0`. The input SHA-256, geometry hash, reconstructed region IDs, sample IDs, cell positions, horizontal elevations and units were checked against the checkpoint. Support is a geometric measurement of the selected mask. The OBJ surface can continue across its edge. All dimensions are in feet and all plan and isometric views use the original Z-up coordinate system.

The three verified-method scores remain pending. No source file or previously saved review was edited. Gold and cyan destination scoring overlays require confirmed gathering use, independent incoming branches and occupied-origin coverage. The review distinguishes an individual two-foot-wide crossing from a full approach. Failing a proposed strip leaves other paths possible. In particular, the small R34 floor discontinuities are below the one-foot grid resolution. Architectural confirmation can distinguish a modeled gap from a walkable joint.

## Reproduction

From the worktree, using its locked dependencies, run the following with the directory containing the three original models:

```powershell
node reports/architectural-audit/run.cjs "PATH-TO-ORIGINAL-OBJ-FOLDER"
node reports/architectural-audit/publish.cjs
node reports/architectural-audit/render.cjs
node --test reports/architectural-audit/geometry.test.cjs
node reports/verify-spatial-review.cjs "PATH-TO-ORIGINAL-OBJ-FOLDER"
$tests = @(rg --files -g '*.test.ts' -g '*.test.tsx' -g '!node_modules' -g '!reports')
node --require ./scripts/ts-test-register.cjs --test @tests
```

The full Evaluation suite passed 182/182. The four focused geometry tests passed, covering projected obstruction area, sub-sample floor gaps, thin barriers and overlapping levels. All twelve original-model baseline scores reproduced exactly. TypeScript passed. Targeted lint reported one existing warning for the SVG image element. The isolated production build passed with warnings. The built Evaluation page, illustrated review and all eighteen drawings returned HTTP 200. See the sibling logs for results.

The original full-history bundle at the prior checkpoint was verified separately. The GitHub connector confirmed write access for the linked account. Native Git Credential Manager failed to enumerate the Windows credential store with access denied before device sign-in. This is an authentication limitation independent of the model checks.
