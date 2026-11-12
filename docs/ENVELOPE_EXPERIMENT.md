# Pull and test the Gathering envelope experiment

This branch contains the standalone Gathering experiment, including the source-preserving Stepped Amphitheater, 9–15-letter Void Field, 12–15 ft levels, open-atrium visibility checks, presentation/OBJ exports, and optional Face-Normal Façade. It does not replace the Proto-Architectural Generator in Composition.

## Get an isolated checkout

Use a new directory, keeping existing development worktrees untouched:

```sh
git clone --branch experiment/gathering-envelope --single-branch https://github.com/dhalestb/LUV-Parametric-Tool.git LUV-Envelope-Test
cd LUV-Envelope-Test
npm ci
npm run envelope:studies
npm run dev -- --hostname 127.0.0.1 --port 4201
```

Use a supported Node.js LTS release (Node 22 or 24 recommended; verified here with 24.21.0) and npm. On PowerShell, use npm.cmd if execution policy blocks npm.ps1. Install normal optional dependencies too: the existing Next dependency supplies Sharp for PNG tests/diagrams. No credentials or cloud storage are needed locally. Do not copy another developer's .env files. Use an unused port if 4201 is occupied, and substitute it in the URLs.

## Open the reproducible studies

- Face-Normal Façade, open atrium, 15-ft levels: http://127.0.0.1:4201/amphitheater?study=2e69a8d4-aeae-49f0-b9bb-5cee619e5dfa
- Matched vertical façade, open atrium: http://127.0.0.1:4201/amphitheater?study=870aec85-3bf6-44d4-97ef-5404293e55cf
- Enclosed lightwell comparison: http://127.0.0.1:4201/amphitheater?study=9c33b2ef-f0c4-4592-ac17-c92d332b5c60
- Latest locally saved Stepped Amphitheater composition: http://127.0.0.1:4201/amphitheater?study=7c93a9ee-f4e9-4c34-a0cf-1501db228b82

All four use a 40 × 40 × 60-ft field and 13-ft preferred letters. The Void Field comparison contains the identical nine source letters; its old quantity metadata says ten. This existing metadata mismatch is preserved rather than silently adding a source. The latest Stepped study contains ten sources.

The setup command regenerates actual geometry from proof/fixtures/*.json using the validated worker, then saves local snapshots in ignored .amphitheater-runs. It refuses cloud environments and never overwrites a differing existing study. Running it again preserves matching existing snapshots. To test seeding without touching saved studies, run node scripts/prepare-envelope-studies.cjs proof/interactive-check/seed-smoke.

Fixture files contain exact source transformations, roles, and generation settings. They are portable inputs, not local study caches. Original local study data and backup directories are not pushed.

## Operate the application

Open /amphitheater. A/B/C selects letters, overlay, or architecture. Use orbit, plan, elevation, and section controls. Void Field exposes Occupied levels, Atrium boundary and Exterior façade sweep beside the main controls. Regenerate Architecture keeps the selected letters' poses; New Design creates another composition. Void Field accepts 9–15 sources; four occupied levels require 15. Its floor-spacing control accepts 12–15 ft; Adjust current levels changes source Z explicitly, while regeneration preserves the current poses. Presentation & Export supports PNG and separate Letters/Form OBJ downloads.

## Validation and section evidence

```sh
npm run test:envelope
npx tsc --noEmit
npx eslint src/components/AmphitheaterStudio.tsx src/components/SourcePopulationEditor.tsx src/components/AmphitheaterPresentation.tsx src/components/amphitheaterInteractiveTypes.ts src/components/amphitheaterPresentationExport.ts src/components/amphitheaterPresentationRender.ts src/components/voidFieldPopulation.ts src/app/api/amphitheater/route.ts
npm run build
node scripts/face-normal-section.cjs
node scripts/open-atrium-section.cjs
```

Run the regression command before the section scripts: it generates their required meshes in proof/interactive-check. Thirteen suites include real geometry generation, source preservation, floor spacing, exact contours, alcoves, connectivity, solid trimming, protected voids, cross-level sightlines, and OBJ/PNG exports. Outputs and timings are recorded in proof/interactive-check/envelope-regressions.json. Reports under reports/face-normal, reports/open-atrium and reports/void-field contain prior measured results and actual application evidence; rerunning tests updates some reports. Build may emit pre-existing warnings in unrelated files.

For a production-mode LOCAL test only, run npm run build and npm start -- --hostname 127.0.0.1 --port 4201 instead of the development server.

## Scope and safeguards

Face-Normal mode builds the façade along each source face normal, keeps floors horizontal, and Boolean-trims against the selected field and protected openings. Global-Z vertical mode remains available; Stepped Amphitheater keeps its vertical-wall system. Near-horizontal sweep normals that cannot reach the support plane are rejected without changing letters. Mesh/visibility checks are geometric, not structural, daylight, guarding, accessibility or circulation certification.

No deployment is part of this handoff. vercel.json disables Git-triggered deployment for experiment/gathering-envelope only, using Vercel's documented git.deploymentEnabled branch rule: https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled . It does not change production settings. There are no deployment GitHub Actions in this checkout. Do not merge, promote or deploy this branch without separate approval. A future authorized Vercel run needs connected private persistent Blob storage; temporary server files are not permanent hosted storage.

## Inserted Horizontal Plate pilot (local development after checkpoint 9c01558)

Select Inserted Horizontal Plate, nine letters or Automatic, 40 × 40 × 60 ft, 13-ft preferred size and 12–15-ft spacing. L sources define horizontal .75-ft plates; horizontal U sources define curved edge recesses; upright V sources define vertical boundaries supported at the previous plate. Default new-design yaw is −15° / 0° / +15°. Generation never changes an existing source pose. Invalid tilted plate faces or incompatible source roles are explicitly rejected.

Portable study: http://127.0.0.1:4201/amphitheater?study=4ca1c9e6-7ba6-4975-a94e-096ffbda0a29

The setup command includes this study. Run node scripts/inserted-plate-tests.cjs and node scripts/inserted-plate-evidence.cjs for three nine-letter alternatives and A/B/C plus exact sections. See reports/inserted-plate/README.md for measured results and limitations. This pilot is included in the envelope experiment handoff.

## Expanded Void Field letter quantity (local development)

Void Field accepts whole quantities from 9 through 15; Automatic uses 9 for three levels and 15 for four levels. Enter the quantity and use Generate Design or New Design to create that many source letters. Regenerate Architecture preserves the current source population and transformations. Inserted Plate remains a nine-letter pilot.

Default new Void Field compositions retain three interior L/U/V void sources and distribute the remaining sources across three levels. The original nine-letter seeded source is unchanged. No source is resized, spacing reduced or field enlarged to fit a larger count. If no explicit seed is supplied, New Design checks up to eight candidate source compositions, reporting progress; rejected candidates do not become saved studies. A supplied seed is tested as supplied. Regeneration never rearranges edited sources.

Validated open-atrium examples at 40 × 40 × 60 ft / 13-ft preferred letters / 12-ft floors: 10 letters seed 211; 11 seed 149; 12 seed 149; 13 seed 37; 14 seed 149; 15 seed 37. Count 15 also passes at 15-ft spacing; count 12 passes with the Face-Normal façade. These are reproducible examples, not a promise that every seed or field/size combination passes. Invalid cavities, lost visible source contributions, blocked voids and missing sightlines remain rejections.

Run node scripts/void-field-population-tests.cjs or npm run test:envelope. See reports/void-field-population/README.md. Portable 12/15-letter fixtures are included by npm run envelope:studies. This work remains local and uncommitted; no push, merge or deployment is authorized.

## Four-level Void Field (local development)

Primary controls now expose Occupied levels and Atrium boundary. Choose four levels, 15 letters (Automatic selects 15), 15-ft spacing, 40 × 40 × 60 ft and 13-ft preferred size. For an existing twelve-letter study already at 15-ft spacing, Add fourth level retains all existing poses and adds only three upper sources. Regeneration does not reposition sources. Four-level source indices are retained in saved requests.

Actual preserved-source result: http://127.0.0.1:4201/amphitheater?study=44abffe5-966f-4e12-8a0e-c8970f0d5dba

Portable setup includes the original twelve-letter input and a reproducible four-level result. Run node scripts/four-level-void-tests.cjs and node scripts/four-level-void-sections.cjs. See reports/four-level-void/README.md for exact source-preservation, geometry and section evidence. This work is uncommitted and has not been pushed.

## Four-level source-perpendicular facade correction

Exterior facade sweep is now a primary Void Field control. New designs default to Face-Normal; saved studies retain their saved mode. Global Z remains an explicit vertical comparison. In four-level Face-Normal mode only, automatic upper facade supports use the preceding floor underside; explicit source support Z overrides remain authoritative. Source records and meshes are unchanged. Floors remain horizontal.

Corrected portable study: http://127.0.0.1:4201/amphitheater?study=c1fbdb4a-6f45-4b98-86d3-0255b7fdab01

Run node scripts/four-level-face-normal-tests.cjs and node scripts/four-level-face-normal-section.cjs after the regression command. See reports/four-level-face-normal/README.md for actual same-source sections and measured validation.

## Latest developer handoff

After setup, open the corrected four-level Face-Normal study:

http://127.0.0.1:4201/amphitheater?study=c1fbdb4a-6f45-4b98-86d3-0255b7fdab01

This portable study has 15 original source letters, four floors at 15-ft spacing, a 40 × 40 × 60-ft field and 13-ft preferred letters. The exterior sweep follows each saved source-face normal. Automatic upper façade supports stop at the preceding floor; explicit support elevations take precedence. Compare with the vertical four-level fixture or switch Exterior façade sweep and Regenerate Architecture; regeneration retains source transformations.

In Presentation & Export choose Generation Rules, then All source operations for a combined void/extrusion diagram, or a perimeter source such as U-11 or U-14 for its actual façade sweep. Original gold source, blue normal/sweep and trimmed façade are shown with support elevation and rule. These diagrams also appear in Four-view Board and the 2048/4096-pixel PNG exports. Letters and Form OBJ exports remain separate.

The study setup regenerates twelve portable fixtures and may take several minutes. Keep the terminal open until all twelve finish. It does not need credentials, access production or start a server. If seeding reports an existing differing study, retain it and use a fresh checkout; do not delete or overwrite existing studies.

For an existing isolated checkout already on this branch, use git fetch origin followed by git pull --ff-only origin experiment/gathering-envelope. Do not pull this branch into a production checkout. For a clean independent checkout, use the clone instructions above. The branch-specific vercel.json deployment opt-out remains in place; this handoff does not authorize deploying or changing production.

Two most recent saved studies are also portable: Void Field (12 letters, Face-Normal) at /amphitheater?study=e25e46af-6500-4c94-b12f-981b9ded68c3 and Inserted Plate (9 letters) at /amphitheater?study=f4ad38e4-36b1-4169-aa03-8dbf82aeea8d. Their exact source requests are preserved without copying ignored application caches.
