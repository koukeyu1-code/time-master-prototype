import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertNativeLoginResponse } from '../scripts/browser-login-check.mjs';

const origin = 'http://127.0.0.1:12345';
const options = { origin, expectedStatus: 401 };
function response({ headers = { origin }, navigation = true, status = 401, policy = 'same-origin' } = {}) {
  return {
    request: () => ({
      // The helper must not accidentally regress to Playwright's filtered API.
      headers: () => { throw new Error('Use allHeaders(), not headers()'); },
      allHeaders: async () => headers,
      isNavigationRequest: () => navigation,
    }),
    status: () => status,
    headers: () => ({ 'referrer-policy': policy }),
  };
}

test('native login accepts missing or partially exposed Fetch Metadata', async () => {
  for (const metadata of [{}, { 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-mode': 'navigate' },
    { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate' }]) {
    await assertNativeLoginResponse(response({ headers: { origin, ...metadata } }), options);
  }
  await assertNativeLoginResponse(response({ status: 303 }), { origin, expectedStatus: 303 });
});

test('native login requires navigation independently of metadata visibility', async () => {
  for (const metadata of [{}, { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate' }]) {
    await assert.rejects(assertNativeLoginResponse(response({ navigation: false, headers: { origin, ...metadata } }), options));
  }
});

test('native login still requires the exact Origin even without Fetch Metadata', async () => {
  for (const value of [undefined, '', 'null', 'https://evil.invalid']) {
    await assert.rejects(assertNativeLoginResponse(response({ headers: { origin: value } }), options));
  }
});

test('native login rejects visible invalid site metadata instead of ignoring it', async () => {
  for (const value of ['', 'cross-site', 'same-site']) {
    await assert.rejects(assertNativeLoginResponse(response({ headers: { origin, 'sec-fetch-site': value } }), options));
  }
});

test('native login rejects visible invalid mode metadata instead of ignoring it', async () => {
  for (const value of ['', 'cors', 'no-cors']) {
    await assert.rejects(assertNativeLoginResponse(response({ headers: { origin, 'sec-fetch-mode': value } }), options));
  }
});

test('native login still requires the expected server status', async () => {
  for (const status of [200, 303, 403, 500]) {
    await assert.rejects(assertNativeLoginResponse(response({ status }), options));
  }
});

test('native login still checks the response referrer policy', async () => {
  for (const policy of [undefined, '', 'no-referrer']) {
    const candidate = response();
    candidate.headers = () => ({ 'referrer-policy': policy });
    await assert.rejects(assertNativeLoginResponse(candidate, options));
  }
});

test('login diagnostics do not claim unexposed metadata is absent on the wire or log secrets', async () => {
  await assert.rejects(assertNativeLoginResponse(response({
    headers: { origin, cookie: 'private-cookie-fixture', authorization: 'private-token-fixture' }, status: 403,
  }), options), error => {
    assert.match(error.message, /Sec-Fetch-Site=\(not exposed\)/);
    assert.doesNotMatch(error.message, /private-cookie-fixture|private-token-fixture/);
    return true;
  });
});
