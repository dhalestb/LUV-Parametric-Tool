# Evaluations-only update

This directory contains the five-descriptor evaluation UI, graph-based Centralized method, clearance and visual evidence updates, and the explicitly opt-in Phase 2 architectural-region diagnostics. Phase 2 does not replace production scoring or final gathering selection.

Scope: Evaluations implementation/tests and its standalone TypeScript test-loader helper. No geometry generation, Lattice tab, global styling, package manifest, lockfile, model assets or other application tabs are changed in this update. Compatibility checks use the shared interfaces on the parent main commit.

Validation on the scoped candidate: 95 targeted tests passed; all Evaluations tests ran with 144 passed and one pre-existing failure in `descriptorFigures.test.ts` (legacy Vertically Integrated fixture expects drawn features where the evaluator reports no vertical link). That failure was separately reproduced in the existing review implementation. It is retained, not hidden. Strict targeted TypeScript checking of the Evaluations entry and its dependency graph reported zero diagnostics after Evaluations-local compatibility/type fixes. This does not represent a full application production build.

Centralized's historical geometric score is retained as a diagnostic, while the graph method is versioned independently. Phase 2's reconstructed components remain experimental; small transition fragments and incomplete architectural semantics require review before using them for scoring. Source OBJ geometry remains unchanged.
