# One-click architectural workflow — local implementation and hosted handoff

## Current status

Local production-build workflow verified. Deployed Vercel acceptance is pending.
The supplied Preview redirects to Vercel login in the available browser. No linked .vercel project, local Vercel CLI, Vercel connector, or storage-related environment configuration was available. Remote project storage therefore could not be inspected or confirmed.

No push, merge, promotion, deployment, or production-worktree change was performed.

## Implementation

The primary controls are typology, width, depth, height, preferred letter size, editable letter quantity and Generate Design. The initial values are Stepped Amphitheater, 40/40/60 ft, 13 ft, Automatic.

Generate Design and New Design construct a fresh source composition before invoking the unchanged source-preserving architectural worker. Each saved result retains that exact input, seed, settings, triangle geometry and validation. New Design uses a new random seed unless the Advanced seed is explicitly set. Regenerate Architecture submits the current edited source directly without invoking composition population.

Edit Letters opens the existing individual transform editor. Source population, duplicate quantity controls and source refresh are unnecessary for the primary path. Historical generator selection, articulation, relationship priority, explicit seed and source import remain in Advanced Settings. Mesh diagnostics and correspondence are collapsed under Advanced result details.

Hosted execution uses an isolated OS temporary directory only for worker and validation artifacts, then removes it. maxDuration is 300 seconds; the worker timeout remains 180 seconds. File tracing includes proof/runtime scripts, TypeScript source and compiler runtime, Manifold WASM, Three.js and the independent BVH checker. The compiler package manifest is included explicitly.

Study storage uses private @vercel/blob. A result is written before its summary is published, avoiding lost-update list files. UUID identifiers isolate concurrent requests. GET streams saved meshes; POST streams the persisted result after read-back, preserving the existing full-result API contract and avoiding a buffered multi-megabyte response. Local development retains existing .amphitheater-runs studies through atomic pending-file publication.

On Vercel, absent storage configuration fails with an actionable 503. Temporary files are never treated as durable hosted studies. Failed geometry remains rejected and the prior study remains displayed.

## Local verification

Production build, TypeScript and build lint passed. Existing unrelated warnings remain.
The 29 selection-height and 5 Composition-refresh regression tests passed.

- Generate Design once with Automatic, 40/40/60 and 13 ft created 12 source letters and actual architecture.
  Study 608551a9-9486-4d06-841a-d4e08ba92eea, volume 16268.616 ft³.
  Zero crossings over 1711054 independent pairs.
- A/B/C controls were operated.
- First source x changed from 0 to 0.25 ft, then Regenerate Architecture.
  Study 5f044d4a-9825-4267-bbf0-28fbb174974c, volume 16280.365 ft³.
  Direct assertions verified exact edited x, unchanged remaining source transforms and different architectural triangles.
  Zero crossings over 1713834 pairs.
- Browser reload reopened that saved result.
- One subsequent random New Design was rejected for positive-area coplanar overlap.
  The previous result was retained and no validation threshold was relaxed.
- New Design with explicit seed 37 succeeded as a separate composition.
  Study 37e9d683-f742-443c-adfd-851889c8d203, volume 16755.864 ft³.
  Zero crossings over 1743060 pairs.
- Final API compatibility/read-back test created de9ea680-1b1d-45b0-9b8d-ed8922d646de.
  POST returned 201 with full geometry. Reopening via GET was deep-equal.
- Simulated Vercel mode with missing storage returned 503 as intended.
- Deployment trace included source-level-envelope.cjs, rule-validation.cjs, Manifold WASM,
  letterGeometry3d.ts and TypeScript runtime. Its package manifest is explicitly configured.

## Vercel dependencies before hosted acceptance

1. Sign into Vercel with access to the project associated with the supplied Preview.
   Inspect its Storage tab and Preview environment configuration. No secret values should be copied into chat.
2. If no appropriate store is connected, create a private Vercel Blob store and connect it to this project's Preview environment. Do not attach it to production as part of this task.
3. Use the connection's server-only credentials. SDK 2.9 supports BLOB_STORE_ID with VERCEL_OIDC_TOKEN, or BLOB_READ_WRITE_TOKEN.
   Do not add these secrets to NEXT_PUBLIC variables or Git.
4. Deploy these local changes as a new Preview, using an explicitly authorized deployment method.
   The supplied immutable Preview cannot acquire unpushed local code by refreshing.
5. Verify the whole hosted acceptance sequence with real durable writes:
   Generate Design, A/B/C, edit, regenerate, compare exact transforms and actual mesh differences,
   refresh/reopen, then New Design and verify separate source and result IDs.
6. Test persistence across a fresh Function instance or redeployment with the same connected store.
   Verify private Blob permissions and the project's Function-duration configuration.
   Hosted child-process/WASM execution and final bundle limits still require deployment verification.

Recommended storage documentation:
https://vercel.com/docs/vercel-blob/private-storage
https://vercel.com/docs/errors/function_response_payload_too_large
https://vercel.com/docs/functions/configuring-functions/duration

Private Blob protects raw storage. The app's existing study endpoints retain the proof application's shared-access model; Preview deployment protection should remain enabled during review.

## Remaining limitations

Hosted Blob writes and Vercel generation have not been executed from this environment. The feature is not declared hosted-complete. Some generated source arrangements remain geometrically infeasible and correctly fail strict validation. Alcove occupancy, accessibility, structural support and circulation remain unresolved architectural requirements from the existing proof.
