import assert from 'node:assert/strict';

export async function assertNativeLoginResponse(response, { origin, expectedStatus }) {
  const request = response.request();
  const headers = await request.allHeaders();
  const diagnostics = `Login POST: status=${response.status()}, Origin=${headers.origin ?? '(not exposed)'}, Sec-Fetch-Site=${headers['sec-fetch-site'] ?? '(not exposed)'}`;
  assert.equal(request.isNavigationRequest(), true, 'Login must use the browser native form navigation');
  assert.equal(headers.origin, origin, diagnostics);
  // With context.route(), Chromium's Playwright adapter resolves allHeaders()
  // from the paused-request snapshot. Fetch Metadata may not be exposed there;
  // absence in that snapshot is not proof of absence on the wire. Navigation
  // identity above is independent of headers. Still reject bad visible metadata.
  if (headers['sec-fetch-site'] !== undefined) {
    assert.equal(headers['sec-fetch-site'], 'same-origin', diagnostics);
  }
  if (headers['sec-fetch-mode'] !== undefined) {
    assert.equal(headers['sec-fetch-mode'], 'navigate', 'Visible login request mode must be navigate');
  }
  assert.equal(response.status(), expectedStatus, diagnostics);
  assert.equal(response.headers()['referrer-policy'], 'same-origin');
}
