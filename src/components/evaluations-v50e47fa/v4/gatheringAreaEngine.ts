import type { ManifoldToplevel } from 'manifold-3d';

/** Load the locked geometry engine as its original browser ES module. Bundling
 * the universal module as application code also resolves its Node-only imports. */
export async function loadAreaEngine():Promise<ManifoldToplevel> {
    const moduleUrl=new URL('/api/evaluations-50e47fa/engine/manifold.js',window.location.origin);
    const wasmUrl=new URL('manifold.wasm',moduleUrl);
    const factory=(await import(/* webpackIgnore: true */ moduleUrl.href)).default;
    const lib:ManifoldToplevel=await factory({locateFile:()=>wasmUrl.href});
    lib.setup();
    return lib;
}
