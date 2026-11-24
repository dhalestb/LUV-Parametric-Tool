# Site Development and Polygon-Driven Architecture checkpoint

The experiment runs on Node 24 with the locked npm dependencies. Install with `npm ci`, then run `npm run build`. For local development, use `npm run dev:polygon`.

## Restore the saved Miami project

Site polygons, site settings, territory alternatives, planning inputs and design references live in browser localStorage. Orientation meshes live in IndexedDB. The matching architecture, model and linked exports are checkout assets. The scoped archive in `fixtures/site-development-checkpoint` includes 18 orientation records, 13 design entries, four territory alternatives, and their site and planning settings. Its manifest records the binary digests and publication state. Historical source paths in provenance are informational. The vendored bindings are used from the current checkout.

Start an isolated loopback server on a new port with recovery enabled. In PowerShell:

```powershell
$env:LUV_EXPERIMENT_PORT = '3042'
$env:LUV_ENABLE_CHECKPOINT_RESTORE = '1'
npm.cmd run dev:polygon
```

Open `http://127.0.0.1:3042/experiment-recovery/index.html` and select **Restore checkpoint**. The restore accepts the bundled archive only and refuses a target with existing checkpoint records. Open the experiment from the recovery page. Under Site Development, the publication list includes `7e9b57c0`, `02101a28`, and `acb47f80`. Under Polygon-Driven Architecture, `dd18fffe` remains a saved, unpublished Stepped Amphitheater proof. Lattice imports stored in a separate browser session and the browser's model cache are outside this Miami checkpoint. The Miami GLB is included.

## Checks

Run `node scripts/verify-site-checkpoint.cjs` to verify the archive, all saved mesh hashes, the Site publication visibility gate, the Miami model and authenticated source bindings. The four retained site-rule and experimental geometry checks run with Node from the repo root. `scripts/test-site-rule-contract.cjs` writes a planning report, so run it in a test checkout with the historical `reports/site-rule-basis-correction` directory.

The initial checkpoint candidate had Site Development errors in type checks and lint. The integration fixes consolidate duplicate cluster normalization, use the actual project zone list for selected-cluster yaw, and correct type and lint errors across the Site/Lattice bridge. The base had six TypeScript diagnostics in descriptor tests when checked directly. The app build and all 24 descriptor tests with the existing TypeScript harness passed on the base. The checkpoint corrects that inherited test typing as well. Existing hook dependency and unused-variable warnings remain.

## Scope and status

The app keeps its three operational generation paths and their existing gates. Independent territory allocation, organizing-field controls, the verified Roadways/Water reference surfaces, and the `site-to-typology/v1` handoff supply constraints. Historical and fixture modes remain available within their supported domains. A site allocation is distinct from architectural footprint coverage. Print-Contour on an irregular site remains guarded when the required adapter or constraints are unavailable.

Room Within Volume remains experimental. Void Field remains blocked for live generation. The saved experimental studies and relevant adapters are retained. The compressed A/B/C review ledgers preserve the original comparison records. Exterior-facing Configuration C is a rejected review result. It preserved native connections but projected 14.190 ft² outside its allocated territory. Its separate adapter and evidence are in `reports/plate-exterior-facing-20261124`. Generate Design retains its established source policy.

The selected files exclude browser history, credentials, caches, node_modules, build outputs, temporary screenshots, duplicate backup trees and unlinked diagnostic intermediates. Local report folders retain the excluded originals. Current geometry and rule bytes are preserved with Git attributes for hash-checked assets.

This checkpoint targets `experiment/site-polygon-morphogenesis`. GitHub showed active Vercel Preview deployments and an absent remote experiment branch at the time of the audit. The push is held until the Vercel Git integration is verified to exclude the experiment branch.
