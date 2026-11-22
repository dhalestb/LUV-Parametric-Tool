import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';

export async function GET(_request:Request, {params}:{params:Promise<{asset:string}>}) {
    const {asset}=await params;
    if(asset!=='manifold.js' && asset!=='manifold.wasm')return new Response(null,{status:404});
    const directory=path.join(process.cwd(),'node_modules','manifold-3d');
    const bytes=asset==='manifold.js'
        ? await readFile(path.join(directory,'manifold.js'))
        : await readFile(path.join(directory,'manifold.wasm'));
    return new Response(new Uint8Array(bytes),{headers:{
        'Content-Type':asset==='manifold.js'?'text/javascript; charset=utf-8':'application/wasm',
        'Cache-Control':'no-cache'
    }});
}
