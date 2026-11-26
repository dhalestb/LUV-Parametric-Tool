import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { canRunGenerationWorker, isLocalRequest, usesProtectedSitePreview } from './workerAccess';

const programs = {
  design: 'generate-design.cjs',
  orientation: 'adaptive-orientation.cjs',
  'site-rules': 'site-rule-contract.cjs',
  'shared-site-rules': 'shared-site-rules.cjs',
  'site-typology-handoff': 'site-typology-handoff.cjs',
} as const;
type Program = keyof typeof programs;
const maxInput = 2_000_000;
const maxOutput = 40_000_000;
const compress = promisify(gzip);
let busy = false;
let lastHostedStart = 0;

function failure(error: string, status: number) {
  return Response.json({error}, {status, headers: {'Cache-Control': 'no-store'}});
}

async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('JSON body required');
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxInput) throw new RangeError('Input exceeds the request budget');
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (bytes > maxInput) await reader.cancel();
    reader.releaseLock();
  }
  const input = Buffer.concat(chunks);
  const parsed = JSON.parse(input.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('JSON object required');
  return input;
}

function runWorker(name: Program, body: Buffer, signal: AbortSignal, outputRoot?: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('scripts', programs[name])], {
      cwd: process.cwd(), windowsHide: true,
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LUV_DESIGN_OUTPUT_ROOT: outputRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let diagnostic = '';
    let stopped: Error | undefined;
    const stop = (status: number, message: string) => {
      stopped ??= Object.assign(Error(message), {status});
      child.kill();
    };
    const abort = () => stop(499, 'Request cancelled');
    const timer = setTimeout(() => stop(408, 'Generation exceeded its 60-second time budget'), 60_000);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutput) stop(413, 'Result exceeds the geometry response budget');
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (diagnostic.length < 4096) diagnostic += chunk.toString('utf8').slice(0, 4096 - diagnostic.length);
    });
    child.stdin.on('error', () => { /* Exit status supplies the diagnostic. */ });
    child.once('error', error => { stopped ??= error; });
    child.once('close', code => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (stopped || code !== 0) reject(stopped ?? Error(diagnostic || 'Geometry worker failed'));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(body);
  });
}

export async function executeSiteWorker(request: Request, name: Program) {
  if (!(await canRunGenerationWorker(request))) {
    return failure(usesProtectedSitePreview()
      ? 'Generation requires the Vercel-protected integration Preview and a same-origin request.'
      : 'Hosted operation requires a configured origin and a valid access key.', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return failure('Content-Type must be application/json.', 415);
  }
  const hosted = !isLocalRequest(request);
  if (busy || (hosted && Date.now() - lastHostedStart < 750)) {
    return failure('A site request is already running or has just completed. Retry shortly.', 429);
  }
  busy = true;
  let outputRoot: string | undefined;
  try {
    let body: Buffer;
    try {
      body = await readInput(request);
    } catch (error) {
      return failure('Invalid or oversized JSON body.', error instanceof RangeError ? 413 : 400);
    }
    if (hosted) lastHostedStart = Date.now();
    if (name === 'design') outputRoot = await mkdtemp(path.join(tmpdir(), 'luv-design-'));
    const output = await runWorker(name, body, request.signal, outputRoot);
    const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-transform'};
    if (!hosted) return new Response(new Uint8Array(output), {headers});
    const compressed = await compress(output);
    if (compressed.length > 4_000_000) {
      return failure('The result exceeds the hosted response budget. Use local generation for this design.', 413);
    }
    return new Response(new Uint8Array(compressed), {headers: {...headers, 'Content-Encoding': 'gzip'}});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Geometry worker failed';
    const status = error instanceof Error && 'status' in error ? Number(error.status) : 422;
    const sanitized = message.split('\n').filter(line => !/^\s+at |^Node\.js/.test(line)).join('\n')
      .replaceAll(process.cwd(), '[checkout]').replaceAll(tmpdir(), '[temporary directory]');
    return failure(hosted ? sanitized.slice(0, 1000) : message, status);
  } finally {
    try {
      if (outputRoot) await rm(outputRoot, {recursive: true, force: true});
    } finally {
      busy = false;
    }
  }
}
