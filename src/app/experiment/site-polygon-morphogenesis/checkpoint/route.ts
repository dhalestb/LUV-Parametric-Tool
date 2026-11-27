import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canAccessSiteWorker } from '../workerAccess';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (request.headers.get('origin') === null || !canAccessSiteWorker(request)) {
    return Response.json({error: 'A valid same-origin recovery session is required.'}, {status: 403});
  }
  if (process.env.LUV_ENABLE_CHECKPOINT_RESTORE !== '1') {
    return Response.json({error: 'The deployment has not enabled Miami recovery.'}, {status: 404});
  }
  const archive = await readFile(join(process.cwd(), 'fixtures/site-development-checkpoint/miami-session.json.gz'));
  return new Response(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/gzip',
      'Cache-Control': 'no-store, no-transform',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
