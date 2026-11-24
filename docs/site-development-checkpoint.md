# Site Development and Polygon-Driven Architecture integration

The application uses Node 24 and the repository lockfile. Run `npm ci`, `npm run build`, then `npm start`. The main navigation opens Site Development and Polygon-Driven Architecture under the production providers. The comparison workspace remains available separately. The two-tab scope applies to this change.

## Saved Miami checkpoint

Site polygons, site settings, territory alternatives, planning inputs, selection and publication references live in browser localStorage. Native orientation meshes live in IndexedDB. The archived Rule B artifacts, verified Miami GLB and historical exports ship in the checkout. The scoped archive contains 18 orientation records, 13 design entries, four territory alternatives and their site and planning settings. Its manifest records binary digests and publication state.

Open `/experiment-recovery/index.html` in a fresh browser profile before opening the two workspaces. Select **Restore checkpoint**. The browser verifies the compressed archive digest, checks its allowed record keys and refuses to replace records already present in that browser profile. Recovery does not import Lattice state.

In Site Development, the publication selector contains `7e9b57c0`, `02101a28` and `acb47f80`. In Polygon-Driven Architecture, `dd18fffe` is a saved, unpublished Stepped Amphitheater proof. Shared viewport source revision, polygon and geometry checks still apply.

For a local production build, set `LUV_ENABLE_CHECKPOINT_RESTORE=1` before starting the server. For protected hosted recovery, also configure the site worker access key and enter it on the recovery form.

## Hosted execution and persistence

A hosted installation requires a randomly generated `LUV_SITE_ACCESS_KEY` of at least 32 characters, set only in the server environment. Set `LUV_SITE_ORIGIN` to the exact HTTPS origin when using a stable alias. Otherwise the server uses the Vercel deployment hostname supplied through `VERCEL_URL`. Use the chosen origin consistently for reload and persistence. Enter the key in **Hosted generation access** on the appropriate design or site-planning page. The client retains it in memory until the page is reloaded. Enable the recovery flag in the intended environment only.

The fixed worker routes accept bounded JSON POST bodies and require the configured origin, host and access key on hosted requests. The server enforces a job timeout and per-instance concurrency limits. Keep Vercel Deployment Protection enabled on Preview and use its request limits for deployment-wide abuse protection. The scoped checkpoint also requires the recovery flag and a same-origin authorized POST. Avoid using a shared key as per-user identity or treating this proof as an account system.

Design requests write temporary files to the OS temporary directory. Source and Rule B checks execute before the result returns. New architecture and native/world OBJ exports are preserved in browser IndexedDB and associated with the saved Rule A identity and geometry hash. The existing Site Development publication handshake selects the browser's saved design. Browser-origin saves and publications are local to that profile. Static preserved architecture remains available through its original manifests. Use the existing download controls to export the geometry and provenance. New cross-device persistence would require a separate authenticated shared store.

For local production-mode testing of the hosted policy, set `LUV_SITE_REQUIRE_ACCESS=1`, `LUV_SITE_ORIGIN=http://127.0.0.1:3050`, a temporary QA key and the recovery flag, then run `npm start -- -H 127.0.0.1 -p 3050`. This loopback override is disabled on Vercel. Deployment checks still include Linux native geometry packages and file tracing, function size/duration, domain and request headers, compressed response handling and browser recovery on the actual Preview origin.

## Validation and experimental status

- Use `npx tsc --project tsconfig.site-integration.json --noEmit` for the application typecheck. Run the standalone descriptor tests separately with the TypeScript CommonJS harness. The base repository includes typing diagnostics in standalone descriptor tests.
- `node scripts/verify-site-checkpoint.cjs` checks all saved mesh hashes, the Site publication visibility gate, Miami model and authenticated rule bindings.
- The Site Rules, handoff, Room profiles and Void collision regressions are separate from the native Lattice assignment regressions. The site-rule contract test writes a preflight report.
- Linear Edge Gallery, Inserted Horizontal Plate and Stepped Amphitheater retain the supported Generate Design profiles and site gates. Room Within Volume remains experimental. Void Field remains blocked for live generation. The isolated proof scripts and source dependencies are available for further development.
- Exterior-facing Configuration C remains a rejected review result. It preserved native connections but extended 14.190 ft² outside its allocated territory. Its separately versioned adapter and reproducibility evidence remain available. The A/B/C comparison survives as archived evidence.
- The legacy file-writing diagnostic snapshot endpoints are loopback-only. Hosted design results use the browser's regular save and export workflow.
