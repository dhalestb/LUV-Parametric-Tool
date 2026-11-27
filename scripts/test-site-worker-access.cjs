const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { canRunGenerationWorker, canAccessSiteWorker } =
  require('../src/app/experiment/site-polygon-morphogenesis/workerAccess.ts');

const branchHost = 'branch.example.test';
const deployHost = 'deployment.example.test';
const key = 'fixture-key-'.repeat(4);
const preview = {
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/two-tab-site-integration',
  VERCEL_BRANCH_URL: branchHost, VERCEL_URL: deployHost,
  LUV_SITE_ORIGIN: 'https://' + branchHost, LUV_SITE_ACCESS_KEY: key,
};
let saved;
beforeEach(() => {
  saved = Object.fromEntries(Object.keys(preview).map(k => [k, process.env[k]]));
  Object.assign(process.env, preview);
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
function request(host, origin = 'https://' + host, extra = {}) {
  return new Request('https://' + host + '/experiment/site-polygon-morphogenesis/site-rules', {
    method: 'POST', headers: { host, origin, ...extra },
  });
}
test('keyless generation on both protected URLs checks protection without sending credentials', async t => {
  const probe = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/experiment/site-polygon-morphogenesis/site-rules');
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.deepEqual([...new Headers(options.headers)], [['accept', 'application/json']]);
    return Response.json({protection: {vercel_auth_enabled: true}}, {status: 401});
  });
  for (const host of [branchHost, deployHost]) {
    assert.equal(await canRunGenerationWorker(request(host, 'https://' + host, {cookie:'fixture'})), true);
    assert.equal(probe.mock.calls.at(-1).arguments[0].host, host);
  }
});
test('the combined release Preview requires the same verified deployment protection', async t => {
  process.env.VERCEL_GIT_COMMIT_REF = 'codex/combined-generators-release';
  const probe = t.mock.method(globalThis, 'fetch', async () => Response.json({ protection: { vercel_auth_enabled: true } }, { status: 401 }));
  assert.equal(await canRunGenerationWorker(request(branchHost)), true);
  probe.mock.mockImplementation(async () => new Response(null, { status: 405 }));
  assert.equal(await canRunGenerationWorker(request(branchHost)), false);
});
test('an untrusted host, mismatched origin, or empty origin is rejected without probing', async t => {
  const probe = t.mock.method(globalThis, 'fetch', () => { throw Error('unexpected'); });
  for (const req of [request('foreign.example.test'), request(branchHost, 'https://' + deployHost),
    request(branchHost, ''), request(branchHost, 'http://' + branchHost)]) {
    assert.equal(await canRunGenerationWorker(req), false);
  }
  assert.equal(probe.mock.callCount(), 0);
});
test('public deployments, unrelated challenges and failed probes are rejected', async t => {
  const probe = t.mock.method(globalThis, 'fetch');
  for (const response of [new Response(null, {status:405}), Response.redirect('https://example.test/'),
    Response.json({protection:{vercel_auth_enabled:false}}, {status:401}),
    new Response('invalid', {status:401}), Response.json({}, {status:401})]) {
    probe.mock.mockImplementation(async () => response);
    assert.equal(await canRunGenerationWorker(request(branchHost)), false);
  }
  probe.mock.mockImplementation(async () => { throw Error('unreachable'); });
  assert.equal(await canRunGenerationWorker(request(branchHost)), false);
});
test('checkpoint recovery, production and other branches retain the configured key check', async t => {
  const probe = t.mock.method(globalThis, 'fetch', () => { throw Error('unexpected'); });
  const keyed = request(branchHost, 'https://' + branchHost, {'x-luv-site-key':key});
  assert.equal(canAccessSiteWorker(request(branchHost)), false);
  assert.equal(canAccessSiteWorker(keyed), true);
  for (const change of [{VERCEL_ENV:'production'}, {VERCEL_GIT_COMMIT_REF:'another-branch'}]) {
    Object.assign(process.env, preview, change);
    assert.equal(await canRunGenerationWorker(request(branchHost)), false);
    assert.equal(await canRunGenerationWorker(keyed), true);
    assert.equal(await canRunGenerationWorker(request(deployHost, 'https://' + branchHost, {'x-luv-site-key':key})), false);
  }
  assert.equal(probe.mock.callCount(), 0);
});
