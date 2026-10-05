import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import http from 'node:http';
import { createPersonalAuth, hashPassword, readAuthConfig } from '../server/lib/auth.js';

const password = 'only-ephemeral-fixture-password';
const passwordHash = await hashPassword(password);
async function fixture(t, { config = {}, authOptions = {} } = {}) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(createPersonalAuth({ disabled: false, production: false, passwordHash, ...config }, authOptions));
  app.get('/api/private', (_req, res) => res.json({ secret: 'fixture' }));
  app.post('/api/private', (_req, res) => res.json({ changed: true }));
  app.get('*', (_req, res) => res.send('private frontend'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, options = {}) => new Promise((resolve, reject) => {
    const req = http.request(origin + url, { method: options.method || 'GET', headers: options.headers }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(new Response(body, { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject);
    req.end(options.body?.toString());
  });
  async function login(body = password, headers = {}) {
    return request('/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ password: body }) });
  }
  return { origin, request, login };
}

test('auth config is fail closed; production cannot disable auth or use insecure/missing origin', () => {
  for (const env of [{}, { NODE_ENV: 'production' }, { NODE_ENV: 'production', AUTH_DISABLED: 'true' },
    { AUTH_DISABLED: 'yes' }, { AUTH_DISABLED: 'true', HOST: '0.0.0.0' },
    { NODE_ENV: 'production', AUTH_PASSWORD_HASH: passwordHash },
    { NODE_ENV: 'production', AUTH_PASSWORD_HASH: passwordHash, PUBLIC_ORIGIN: 'http://example.test' },
    { AUTH_PASSWORD_HASH: passwordHash, PUBLIC_ORIGIN: 'https://example.test/' },
    { AUTH_PASSWORD_HASH: passwordHash, PUBLIC_ORIGIN: 'https://user:pass@example.test' }]) {
    assert.throws(() => readAuthConfig(env));
  }
  assert.equal(readAuthConfig({ NODE_ENV: 'production', AUTH_PASSWORD_HASH: passwordHash, PUBLIC_ORIGIN: 'https://example.test' }).production, true);
  assert.equal(readAuthConfig({ NODE_ENV: 'test', AUTH_DISABLED: 'true' }).disabled, true);
});

test('password hashing rejects short input and salts each hash', async () => {
  await assert.rejects(hashPassword('short'));
  assert.notEqual(await hashPassword(password), passwordHash);
});

test('unauthenticated API, frontend, assets, nested routes and HEAD are protected', async t => {
  const { request } = await fixture(t);
  for (const url of ['/api/private', '/api/health', '/api/auth/session']) {
    const response = await request(url);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const url of ['/', '/settings', '/assets/app.js', '/route/example']) {
    const response = await request(url, { method: 'HEAD' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
  }
  assert.match(await (await request('/login')).text(), /个人密码/);
});

test('native login forms retain same-origin referrer policy on initial, failed and throttled responses', async t => {
  const { request, login } = await fixture(t, { authOptions: { loginLimit: 2 } });
  for (const [send, status] of [
    [() => request('/login'), 200],
    [() => login('wrong fixture'), 401],
    [() => login('wrong again'), 401],
    [() => login(), 429],
  ]) {
    const response = await send();
    assert.equal(response.status, status);
    assert.equal(response.headers.get('set-cookie'), null);
    // Fetch's Origin-header algorithm sends Origin:null for native form POSTs
    // under no-referrer. Every page containing the retry form needs this policy.
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
    assert.match(response.headers.get('content-security-policy'), /form-action 'self'/);
    assert.match(await response.text(), /<form action="\/login" method="post">/);
  }
});

test('wrong login, absent/null/cross-site Origin and forged cookies grant no access', async t => {
  const { origin, request, login } = await fixture(t);
  assert.equal((await login('wrong fixture')).status, 401);
  for (const headers of [
    { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' },
    { Origin: 'https://evil.invalid' },
    { Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const rejected = await login(password, headers);
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('set-cookie'), null);
    assert.equal((await request('/api/private')).status, 401);
  }
  assert.equal((await request('/login', { method: 'POST' })).status, 403);
  assert.equal((await request('/api/private', { headers: { Cookie: `tm_session=${'a'.repeat(64)}` } })).status, 401);
  assert.equal((await request('/login', { headers: { Host: 'evil.invalid' } })).status, 403);
});

test('login session authorizes reads; mutations require token and exact origin; logout revokes', async t => {
  const { origin, request, login } = await fixture(t);
  const response = await login();
  assert.equal(response.status, 303);
  const rawCookie = response.headers.get('set-cookie');
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Strict/);
  assert.match(rawCookie, /Path=\//);
  const cookie = rawCookie.split(';')[0];
  const headers = { Cookie: cookie };
  assert.equal((await request('/api/private', { headers })).status, 200);
  const csrf = (await (await request('/api/auth/session', { headers })).json()).data.csrfToken;
  assert.equal(csrf.length, 64);
  for (const extra of [{}, { Origin: origin }, { Origin: 'null', 'X-CSRF-Token': csrf, 'Sec-Fetch-Site': 'same-origin' }, { Origin: origin, 'X-CSRF-Token': 'é'.repeat(64) }, { 'X-CSRF-Token': csrf }, { Origin: 'https://evil.invalid', 'X-CSRF-Token': csrf }]) {
    assert.equal((await request('/api/private', { method: 'POST', headers: { ...headers, ...extra } })).status, 403);
  }
  const mutationHeaders = { ...headers, Origin: origin, 'X-CSRF-Token': csrf };
  assert.equal((await request('/api/private', { method: 'POST', headers: mutationHeaders })).status, 200);
  assert.equal((await request('/api/private', { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request('/api/auth/logout', { method: 'POST', headers: mutationHeaders })).status, 200);
  assert.equal((await request('/api/private', { headers })).status, 401);
});

test('sessions expire, rotate on login and are not shared by new server instances', async t => {
  let clock = 1000;
  const first = await fixture(t, { authOptions: { now: () => clock, sessionTtlMs: 100 } });
  const response = await first.login();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const rotated = await first.login(password, { Cookie: cookie });
  assert.notEqual(rotated.headers.get('set-cookie').split(';')[0], cookie);
  assert.equal((await first.request('/api/private', { headers: { Cookie: cookie } })).status, 401);
  const latest = rotated.headers.get('set-cookie').split(';')[0];
  const second = await fixture(t);
  assert.equal((await second.request('/api/private', { headers: { Cookie: latest } })).status, 401);
  clock += 100;
  assert.equal((await first.request('/api/private', { headers: { Cookie: latest } })).status, 401);
});

test('bounded login attempts throttle bad passwords then recover after window', async t => {
  let clock = 1000;
  const { login } = await fixture(t, { authOptions: { loginLimit: 2, now: () => clock } });
  assert.equal((await login('wrong')).status, 401);
  assert.equal((await login('wrong')).status, 401);
  const blocked = await login();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
  clock += 15 * 60 * 1000;
  assert.equal((await login()).status, 303);
});

test('production sets Secure host-only cookies and checks configured Host', async t => {
  const { request, login } = await fixture(t, { config: { production: true, origin: 'https://personal.example' } });
  assert.equal((await request('/login')).status, 403);
  const result = await login(password, { Host: 'personal.example', Origin: 'https://personal.example' });
  assert.equal(result.status, 303);
  assert.match(result.headers.get('set-cookie'), /^__Host-tm_session=/);
  assert.match(result.headers.get('set-cookie'), /; Secure;/);
  assert.doesNotMatch(result.headers.get('set-cookie'), /Domain=/);
  assert.match(result.headers.get('strict-transport-security'), /max-age=/);
});
