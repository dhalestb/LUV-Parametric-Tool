# Envelope experiment developer handoff — 2026-11-12

Branch: experiment/gathering-envelope. This handoff includes four-level (15-letter) source-preserving Void Field, Face-Normal facade support corrections, source/extrusion diagrams, expanded 9–15-letter populations, the isolated nine-letter Inserted Horizontal Plate pilot, portable study fixtures, geometry evidence and startup instructions. It does not replace the Composition generator.

Validation: all 13 envelope regression suites passed; TypeScript --noEmit, ESLint on changed application files, production build and whitespace checks passed. All twelve portable studies regenerated through the strict geometry worker. The latest three matched the locally saved requests, source meshes and architecture exactly. Repeated setup preserved all matching studies. See portable-studies.json and regressions.json.

Start from a fresh clone of this branch, run npm ci, npm run envelope:studies, then npm run dev -- --hostname 127.0.0.1 --port 4201. See docs/ENVELOPE_EXPERIMENT.md for URLs, presentation controls, tests and limits. Local setup needs no credentials; ignored study caches and dependencies are not included.

The corrected four-level study is c1fbdb4a-6f45-4b98-86d3-0255b7fdab01. All 15 original source records and letter meshes, four horizontal floor solids and 15-ft spacing are preserved. All nine facade sweep directions and actual sections passed; 231 exported-triangle sightline rays are clear. These checks do not certify structure, occupancy, circulation or daylight performance. Invalid edited arrangements remain rejected.

The pre-handoff checkpoint 9c01558f11ff8ea7824f640f108fb588d9198b6a and local backups remain available. Prior reports describe historical local-only development; this handoff supersedes their uncommitted/unpushed status statements. Only this experiment branch is authorized for commit/push. No merge, production change or deployment is part of the handoff. The existing branch-specific Vercel Git deployment opt-out remains unchanged.
