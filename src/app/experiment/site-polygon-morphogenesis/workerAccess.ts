import { createHash, timingSafeEqual } from 'node:crypto';
import { isSiteIntegrationPreview } from '../../../components/polygonExperiment/siteWorkerPolicy.ts';

export function isLocalRequest(request: Request) {
  if (process.env.VERCEL || process.env.LUV_SITE_REQUIRE_ACCESS === '1') return false;
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');
  return !!host && /^(localhost|127\.0\.0\.1):\d+$/.test(host) && (origin === null || origin === 'http://' + host);
}

export function usesProtectedSitePreview() {
  return process.env.VERCEL === '1' &&
    isSiteIntegrationPreview(process.env.VERCEL_ENV, process.env.VERCEL_GIT_COMMIT_REF);
}

// Recovery and other hosted environments still use the explicit site key.
export function canAccessSiteWorker(request: Request) {
  if (isLocalRequest(request)) return true;
  const trusted = process.env.LUV_SITE_ORIGIN || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '');
  const secret = process.env.LUV_SITE_ACCESS_KEY;
  if (!trusted || !secret || secret.length < 32 || request.headers.get('origin') !== trusted) return false;
  try {
    const configured = new URL(trusted);
    if (configured.origin !== trusted || configured.host !== request.headers.get('host')) return false;
    if (configured.protocol !== 'https:' && !(
      process.env.LUV_SITE_REQUIRE_ACCESS === '1' && !process.env.VERCEL &&
      configured.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(configured.hostname)
    )) return false;
  } catch {
    return false;
  }
  const supplied = request.headers.get('x-luv-site-key') ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(secret));
}

export async function canRunGenerationWorker(request: Request): Promise<boolean> {
  if (!usesProtectedSitePreview()) return canAccessSiteWorker(request);

  const host = request.headers.get('host');
  if (!host || (host !== process.env.VERCEL_BRANCH_URL && host !== process.env.VERCEL_URL)) return false;
  const origin = 'https://' + host;
  if (request.headers.get('origin') !== origin) return false;

  // Vercel authenticates the incoming request before it reaches the worker.
  // Fail closed if protection is removed from this URL. GET cannot start a job.
  const probe = new URL(origin);
  probe.pathname = new URL(request.url).pathname;
  try {
    const response = await fetch(probe, {
      headers: { Accept: 'application/json' },
      credentials: 'omit', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 401) return false;
    const challenge = await response.json();
    return challenge?.protection?.vercel_auth_enabled === true;
  } catch {
    return false;
  }
}
