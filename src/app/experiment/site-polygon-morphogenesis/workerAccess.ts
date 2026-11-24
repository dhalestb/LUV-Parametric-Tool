import { createHash, timingSafeEqual } from 'node:crypto';

export function isLocalRequest(request: Request) {
  if (process.env.VERCEL || process.env.LUV_SITE_REQUIRE_ACCESS === '1') return false;
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');
  return !!host && /^(localhost|127\.0\.0\.1):\d+$/.test(host) && (origin === null || origin === 'http://' + host);
}

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
