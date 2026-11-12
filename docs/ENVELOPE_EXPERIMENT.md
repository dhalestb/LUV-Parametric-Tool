# Pull and test the Gathering envelope experiment

This branch contains the standalone Gathering experiment, including the source-preserving Stepped Amphitheater, nine-letter Void Field, 12–15 ft levels, open-atrium visibility checks, presentation/OBJ exports, and optional Face-Normal Façade. It does not replace the Proto-Architectural Generator in Composition.

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

Open /amphitheater. A/B/C selects letters, overlay, or architecture. Use orbit, plan, elevation, and section controls. Advanced Settings exposes Exterior façade sweep and Atrium boundary. Regenerate Architecture keeps the selected letters' poses; New Design creates another composition. Void Field remains gated to nine sources. Its floor-spacing control accepts 12–15 ft; Adjust current levels changes source Z explicitly, while regeneration preserves the current poses. Presentation & Export supports PNG and separate Letters/Form OBJ downloads.

## Validation and section evidence

```sh
npm run test:envelope
npx tsc --noEmit
npx eslint src/components/AmphitheaterStudio.tsx src/components/SourcePopulationEditor.tsx src/components/AmphitheaterPresentation.tsx src/components/amphitheaterInteractiveTypes.ts src/components/amphitheaterPresentationExport.ts src/components/amphitheaterPresentationRender.ts src/components/voidFieldPopulation.ts src/app/api/amphitheater/route.ts
npm run build
node scripts/face-normal-section.cjs
node scripts/open-atrium-section.cjs
```

Run the regression command before the section scripts: it generates their required meshes in proof/interactive-check. Nine suites include real geometry generation, source preservation, floor spacing, exact contours, alcoves, connectivity, solid trimming, protected voids, cross-level sightlines, and OBJ/PNG exports. Outputs and timings are recorded in proof/interactive-check/envelope-regressions.json. Reports under reports/face-normal, reports/open-atrium and reports/void-field contain prior measured results and actual application evidence; rerunning tests updates some reports. Build may emit pre-existing warnings in unrelated files.

For a production-mode LOCAL test only, run npm run build and npm start -- --hostname 127.0.0.1 --port 4201 instead of the development server.

## Scope and safeguards

Face-Normal mode builds the façade along each source face normal, keeps floors horizontal, and Boolean-trims against the selected field and protected openings. Global-Z vertical mode remains available; Stepped Amphitheater keeps its vertical-wall system. Near-horizontal sweep normals that cannot reach the support plane are rejected without changing letters. Mesh/visibility checks are geometric, not structural, daylight, guarding, accessibility or circulation certification.

No deployment is part of this handoff. vercel.json disables Git-triggered deployment for experiment/gathering-envelope only, using Vercel's documented git.deploymentEnabled branch rule: https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled . It does not change production settings. There are no deployment GitHub Actions in this checkout. Do not merge, promote or deploy this branch without separate approval. A future authorized Vercel run needs connected private persistent Blob storage; temporary server files are not permanent hosted storage.
