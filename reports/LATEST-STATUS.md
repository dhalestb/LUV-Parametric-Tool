# Evaluations completion status — 2026-11-22

The current implementation is **not complete**: 13/15 model-descriptor results have finite scores. Ranking is correct for the first four descriptors; the remaining two N/A results arise in the historical Centralized graph. The 40/40/20 scorer remains a tested pure function and is **not** the production descriptor. `RANKING-AUDIT.md` and `verified-rankings.json` give all source IDs, scores, ranks, cohorts and exact exclusion reasons.

## Continued work

- Confirmed branch `codex/evaluations-completion-2026-11-22`, commit `43792719306b86f40f6797b25b06e08989a4caf5`, and clean tracked state before new edits. Only three prior verification logs were untracked.
- Created and verified a complete-history Git bundle before trying publication. The previous credential-manager failure recurred after network permission was granted: MSYS could not create its named object (`0xC0000022`), then Git could not read a username. No credentials were read or exposed. The local branch remains recoverable.
- Audited actual scores from the three original OBJ files. All 12 non-Centralized results have cohorts of 3. Centralized has one finite score (Stepped) and cohort 1. Controlled rank test confirms zero remains eligible. Rank 2/3 means the middle score, not two of three forms processed.
- Added `destinationRoutes.ts`, a conservative region-graph analysis that collapses repeated sample links, multiple portals to one corridor, and upstream loops into one branch. Five controlled tests pass. Unreached regions are classified unknown, not proven blocked. This is a diagnostic precursor, not yet a certified independent occupant route or a production score.
- Ran the corrected elevation context and Phase 2 reconstruction on each exact source OBJ. Largest experimental region evidence is below. The high count of unknown area demonstrates why substituting a 40/40/20 score now would fabricate accessibility and gathering confidence.

| Source | Experimental regions | Largest region area (ft² under current scale) | Conservatively distinct branches | Verified reachable origin area | Unknown origin area |
|---|---:|---:|---:|---:|---:|
| Linear.obj | 86 | 769 | 0 | 0 | 1,505 |
| Stepped.obj | 341 | 229 | 2 | 553 | 4,974 |
| Void_Field.obj | 149 | 765 | 0 | 0 | 2,550 |

Largest region is **not** automatically designated a gathering destination. Its measured area alone gives no reliable clear width, occupation, or independent approach. Anchored platform bands remove stair-tread chaining but still produce many small bands and fragments. The grouping used here can also fragment sloped/stepped geometry. The reconstruction's “verified” links reflect sampled edge/ray evidence rather than full swept-width passage certification. Missing connections cannot yet be distinguished from missing OBJ data. Those are the exact remaining blockers for two numeric Centralized results and gold/cyan destination visualizations.

## Validation

- Latest complete Evaluation tests: **163 passed, 0 failed** (`completion-tests-latest.log`).
- Controlled route tests: 5 passed, included in that total.
- TypeScript and production build: see `completion-typescript-latest.log` and `completion-build-latest.log`. The previous checkpoint passed both; this round repeats the checks after route work.
- Actual-model source identity is checked against prior browser hashes; `destination-evidence.json` contains the raw selected-region graph evidence. Source OBJ files and unrelated development branches have not been modified.

## Exact remaining implementation work

1. Establish stable occupiable regions, candidate floor width and clearance from mesh support without equating every fragment with a room. Validate against labelled architectural spaces or equivalent geometric ground truth for the three imported OBJs.
2. Classify portal width/height and vertical transitions with continuous body passage evidence. The current graph result is only a conservative sampled branch count; shared bottlenecks and incomplete geometry remain important.
3. Explicitly certify physical disconnection or retain uncertainty bounds for every occupied origin. The existing OBJ data has no room/access metadata, so absent links alone are insufficient proof.
4. Connect qualifying candidates and proven routes to the 40/40/20 scorer, version the method, preserve graph-v1 history, and implement synchronized plan/3D gold/cyan evidence with candidate selection.
5. Validate 15 results in the application and capture visual evidence. If any source genuinely remains insufficient, report that limitation instead of manufacturing a score.

This checkpoint is intentionally incomplete. It does not replace the historical Centralized evaluator, claim screenshots of unverified gathering locations, or claim that the completion branch was pushed.
